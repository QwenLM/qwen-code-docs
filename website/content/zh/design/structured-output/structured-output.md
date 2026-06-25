# Structured Output (`--json-schema`) — 设计文档

本文档记录了 `--json-schema` 无头特性的实现决策。面向用户的使用说明请参见
[`docs/users/features/structured-output.md`](../../users/features/structured-output.md)。

## 目标

在无头运行模式下（`qwen -p`、管道 stdin 或位置参数 prompt），允许调用方将模型的最终答案约束为用户提供的 JSON Schema，并将经过验证的 payload 以机器可读的输出形式返回，供脚本和下游工具直接使用。模型在规划阶段产生的附带散文允许存在，但运行必须以符合 schema 的 payload 终止，而非自由格式文本。

## 方案：以用户 schema 作为参数 schema 的合成工具

当 `--json-schema` 被设置时，`Config.createToolRegistry` 会注册一个合成的 `structured_output` 工具
（[`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)）。
其 `parametersJsonSchema` 就是用户传入的 schema；其 `execute()` 返回一个 stop-message `llmContent`。工具调用基础设施已经在客户端通过 `BaseDeclarativeTool.build()` 中的 Ajv 对 args 进行 `parametersJsonSchema` 校验，因此"模型返回了符合 schema 的答案"等价于"模型成功调用了 `structured_output`"。

这样可以免费获得三个特性：

1. **无需专用校验路径。** `BaseDeclarativeTool.build()` 内部已经运行 Ajv 支持的 `validateToolParams`，在 `execute()` 触发前就拒绝不合规的 args。
2. **标准重试行为。** 校验失败会以工具调用错误的方式暴露给模型，与其他工具的 args 错误处理方式相同。模型看到 Ajv 报错后可在下一轮中进行修正。
3. **提供商无关。** Gemini、OpenAI 和 Anthropic 均通过 `DeclarativeTool` 抽象以相同方式序列化工具参数 schema；合成工具可接入全部三者。

该工具以 `alwaysLoad: true` 注册，因此 ToolSearch 的按需加载基础设施（在 #3589 中引入——通过将不常用工具隐藏在搜索调用背后来缩小暴露的工具面，仅在模型请求时挂载其完整 schema）不会对模型隐藏它。若不设置该标志，模型将无法感知终止契约的存在。

## 解析时校验流水线

[`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts) 中的 `resolveJsonSchemaArg(raw)` 在 schema 传入 `Config.createToolRegistry` 前执行四项检查：

1. **来源解析。** 接受内联 JSON 字面量或 `@path/to/file`。`@path` 形式会先对解析后的路径执行 `stat`，拒绝非普通文件（FIFO、字符设备、目录），大小上限为 4 MiB，JSON 解析失败时输出通用错误（stderr 中不含文件内容前缀）。
2. **JSON 结构。** 解析结果必须是非数组对象——原始值、布尔值和数组均会被明确拒绝。
3. **根节点接受对象** —— [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts)。函数调用 API 始终以对象形式传入工具 args；若根 schema 为 `{type: "array"}` 则会注册一个不可用的工具。该遍历处理 `type`、`const`、`enum`、`anyOf`、`oneOf`、`allOf`、`not`、`if` / `then` / `else` 以及根 `$ref`。
4. **严格 Ajv 编译** —— [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts)。使用开启 `strictSchema: true` 的专用 Ajv 实例，可捕获如 `propertees` 这类拼写错误，而宽松的运行时校验器会静默忽略这些问题。

### `schemaRootAcceptsObject` 的边界

该遍历是尽力而为的。它捕获明确的"此 schema 永远无法接受对象"情况，将需要全 schema 可满足性分析的场景推迟到 Ajv 运行时处理。

**在解析时决定：**

| 模式                                                   | 结果                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `type` 存在，但不包含 `"object"`                       | 拒绝                                                              |
| `type: ["object", "null"]` 等                          | 接受                                                              |
| `const`：非对象值                                      | 拒绝                                                              |
| `enum`：无对象成员（含空数组）                         | 拒绝                                                              |
| `anyOf`/`oneOf`：空数组                                | 拒绝                                                              |
| `anyOf`/`oneOf`：无分支允许对象                        | 拒绝                                                              |
| `allOf`：任意分支为 `false` 或拒绝对象                 | 拒绝                                                              |
| 根 `$ref`（含或不含同级 `type`）                       | 拒绝                                                              |
| `not`：裸 `{type: "object"}`（无窄化关键字）           | 拒绝                                                              |
| `not`：`{type: "object", required: […], …}` 等         | 接受（窄化关键字保留了部分对象的可满足性；推迟处理）              |
| `if: true` + `then` 拒绝对象                           | 拒绝                                                              |
| `if: false` + `else` 拒绝对象                          | 拒绝                                                              |

**推迟到 Ajv 运行时：**

- `anyOf` / `oneOf` / `allOf` 分支内的 `$ref`（不透明——本地 `$ref` 解析需要循环检测、JSON Pointer 转义以及 `$defs` vs `definitions` 的处理；对于解析时的尽力检查而言，代价超出收益）。
- `if` 值为对象 schema 的情况（只有针对候选值才可判定）。
- 比 `not.type` 更复杂的否定 `anyOf` / `oneOf` / `const` 模式。
- 任意 `pattern` 的 ReDoS 风险（用户提供；威胁模型较窄，因为该标志是 CLI 参数而非网络输入）。

`maxSessionTurns` 退出路径会追加一条 `--json-schema` 专用提示，指向常见的卡死运行症状（模型从未调用 `structured_output`）及其两个可能原因（工具被权限拒绝 / schema 不可满足），使运行时降级路径具有用户可见的诊断信息。

## 运行时：轮次分发

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts)
负责运行时分发。structured output 相关细节如下：

### 预扫描 + 同批次抑制

当模型在同一个 assistant 轮次中同时输出 `structured_output` 和其他工具时，合成调用是终止契约。`processToolCallBatch` 中的预扫描将 `requestsToExecute` 过滤为**仅**包含 `structured_output` 调用，因此有副作用的同批次工具（`write_file`、`run_shell_command`、`edit` 等）永远不会执行。

批次示例（`--json-schema` 激活时）：

| 模型输出                                                 | 行为                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                  | `write_file` 被跳过。`structured_output` 校验通过，运行结束。                                                                                                                                                                                                                    |
| `[structured_output(bad-args), structured_output(good)]` | 第一个 Ajv 校验失败；第二个成功。运行以第二个调用的 args 结束。                                                                                                                                                                                                                 |
| `[structured_output(bad-args), write_file(…)]`           | `structured_output(bad)` 失败。`write_file` 也被跳过（已在预扫描阶段抑制）。模型同时收到：structured 调用的 Ajv 错误信息，以及副作用调用的合成 `"Skipped: …"` tool_result。下一轮中，模型可以重新提交两者或仅修正 structured 调用。                                              |
| `[other_tool_a, other_tool_b]`（无 `structured_output`） | 预扫描不生效。两个工具正常执行；运行不终止。                                                                                                                                                                                                                                     |

合成的 "Skipped:" 消息体有两种形式：

- **成功路径**（本轮某个 structured 调用捕获了契约）：`"Skipped: this turn's structured_output contract took precedence as the terminal output."` — 简短，因为会话立即终止，且没有消费者（模型或 SDK）会对其采取行动。
- **重试路径**（无 structured 调用被捕获，模型将获得下一轮）：追加 `"Re-issue this call in a separate turn if needed."` — 这是唯一需要模型采取行动的情况。

### 主轮次 / drain 轮次一致性

`processToolCallBatch(batchRequests, setModelOverride)` 定义在 `runNonInteractive` 内部，被以下两处调用：

- 主轮次循环（函数顶部）。
- `drainOneItem`（cron prompt / 后台任务通知回复循环）。

drain 轮次之所以重要，是因为 `structured_output` 在整个会话期间均已注册，因此 cron job 或通知回复也可能触发该工具。该 helper 在调用时对两个调用点的处理完全相同；唯一与调用点相关的绑定是要写入哪个 `modelOverride` 变量——通过 setter 传入。

**helper 后的终止流程**在两个调用点有所不同：主轮次路径直接调用 `return emitStructuredSuccess()`，而 drain 轮次路径需要两跳终止（`processToolCallBatch` 将结果捕获到闭包作用域的 `structuredSubmission` 中；`drainLocalQueue` 检查该值以停止 drain 循环，然后 holdback 循环检查它以跳出并调用 `emitStructuredSuccess`）。两者最终汇聚到同一个终止块，但 drain 路径中的额外间接层是必要的——若没有它，drain 循环会在 structured 结果已被捕获后继续处理队列中的项目。

### Structured 成功终止块

`emitStructuredSuccess()`（也定义在 `runNonInteractive` 内部）是"获得有效调用，立即关闭"的共享路径：

1. `registry.abortAll()` 中止正在运行的后台 agent——structured output 契约是单次的，不应与 `task_notification` 竞争进入终止 emit。
2. 有界 holdback（`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` ms），让刚刚被中止的 agent 的自然取消处理器有机会发出终止 `task_notification` 并将其放入 `localQueue`。循环守卫为 `Date.now() < deadline && registry.hasUnfinalizedTasks()`，因此当没有正在运行的任务时（典型路径）等待立即退出，且永远不会超过上限时长。500 ms 上限是尽力而为的——在负载下，如果某个 agent 的中止处理器超出预算，可能仍会出现孤立的 `task_started` 事件。该循环**不**轮询中止信号：在 holdback 期间或后续 emit 路径中收到的 SIGINT 不会绕过已捕获的结果。若没有 holdback，stream-json 消费者通常会看到没有对应 `task_notification` 的 `task_started` 事件。
3. `flushQueuedNotificationsToSdk(localQueue)` 排空所有仍在队列中的项目。
4. `finalizeOneShotMonitors()`（幂等——可安全调用两次；drain 轮次路径已调用过一次）。
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`。

### 失败路径

| 原因                                                              | 退出码                        | 表现                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 模型仅输出纯文本                                                  | 1                             | 含轮次数和截断 `Output preview` 的错误信息。                                                                                                                                                                                                                                   |
| 模型在 `maxSessionTurns` 轮内从未调用 `structured_output`         | 53                            | `Reached max session turns` + `--json-schema` 提示，指向常见卡死运行症状及其两个可能原因。                                                                                                                                                                                     |
| 校验反复失败                                                      | （最终通过 max-turns 变为 53） | 每次失败都会在下一轮以 Ajv 消息的形式暴露给模型。                                                                                                                                                                                                                             |
| 中止 / SIGINT                                                     | 130                           | 取消路径。通常不会 emit structured 结果，但 `emitStructuredSuccess()` 的 holdback 循环不轮询中止信号——若 SIGINT 在结果捕获之后、stdout emit 之前/期间到达，结果可能仍会被刷出。退出码是可靠的信号。                                                                             |

## 输出信封

[`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts)
中的 adapter 流水线通过 `'structuredResult' in options`（而非 `!== undefined`）来检测 `structuredResult` 是否存在，以便在模型以空 schema 无 args 调用 `structured_output` 时也能保留契约：

- `result` 被强制设为 `JSON.stringify(payload)`——覆盖 adapter 积累的任何自由文本摘要。
- 顶层 `structured_result` 字段携带原始对象，供不想重新解析 stringified 形式的消费者使用。
- `undefined` payload 规范化为 `null`（在两个字段中均渲染为 JSON 字面量 `null`），以防字段静默消失。实际上很少触达此 fallback：在上游，`turn.ts` 在存储 submission 前会应用 `(fnCall.args || {})`，因此对空 schema 的零参数调用会以 `{}` 形式存储，并在 stdout 中渲染为 `{}`，而非 `null`。`?? null` 步骤是针对严格 undefined 情况的纵深防御。

TEXT 模式仅将 `result` 字段 + 换行写入 stdout（运行期间积累的所有附带 assistant 散文均被丢弃，不会镜像到 stderr）。JSON 模式将完整事件日志作为 JSON 数组 emit；`structured_result` 位于该数组最终的 `type: "result"` 元素上，而非文档根节点。stream-json 模式将每条消息以 JSONL 格式逐行 emit；终止 `result` 行携带 `structured_result`。

## 隐私：跨平面脱敏

通过 `structured_output` 提交的 args 就是 structured payload 本身。在成功路径中，它们已经在 stdout 上；在校验失败重试时，它们可能根本不会到达 stdout。无论如何，将其持久化到设备上的持久存储（或通过遥测导出到设备外）是冗余操作，会将 payload 泄漏到用户预期之外的更长久存储中。因此脱敏规则是"无论结果如何，永远不持久化此合成工具的任何 args"，而非仅"对已在 stdout 上的内容去重"。

需要脱敏的平面有两处，两者共享同一个占位符常量
[`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts)：

- `ToolCallEvent.function_args`（遥测）——覆盖 OTLP 导出、QwenLogger、ui-telemetry 以及聊天录制 UI 事件镜像。
- `redactStructuredOutputArgsForRecording`（由 `geminiChat.ts` 中的 `recordAssistantTurn` 使用）——覆盖位于 `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl` 的磁盘聊天录制 JSONL。校验失败重试的 args 也会获得相同的占位符。

共享常量防止了两个平面之间的漂移。工具调用指标（时长、成功与否、决策）得以保留。

Hook（`PreToolUse`、`PostToolUse`、`PostToolUseFailure`）**不**进行脱敏——它们接收原始 `tool_input`，因为 hook 契约是"看到工具看到的内容"。这在用户文档的 Privacy 部分以"Hooks see raw args"提示的形式记录，供 operator 在针对敏感数据运行 `--json-schema` 前按 `tool_name` 过滤或添加 hook 侧脱敏。

脱敏有意仅限于**设备上的**持久化平面（遥测导出 + 聊天录制 JSONL）。schema 本身仍会在每次请求中以 `structured_output` 函数声明的 `parameters` 块形式发送给模型提供商——提供商侧无法进行脱敏，因为模型需要 schema 才能满足工具调用契约。用户文档 Privacy 部分出于同样原因警告用户，`enum` / `const` / `default` / `examples` / `description` payload 中不应包含机密信息。

## 权限控制

`structured_output` 被有意从 `PermissionManager.CORE_TOOLS`（受 `--core-tools` 白名单检查约束的工具集）中排除——与其他合成工具（`agent`、`exit_plan_mode`、`ask_user_question`、`task_stop`、`send_message`）并列。动态发现的工具（`skill`、MCP）是另一个排除类别，出于无关原因也绕过白名单。合成工具仅在 `--json-schema` 被设置时存在；将其加入白名单机制意味着 `--core-tools read_file --json-schema X` 会静默丢弃终止契约。

显式的 `permissions.deny` 规则和 `--exclude-tools` 设置仍通过 `PermissionManager.evaluate` → `isToolEnabled` 生效。两者使用相同的拒绝机制，均会阻止注册——工具声明从 registry 中被剥离，模型永远看不到该工具。典型结果是模型以纯文本作答（退出码 1）。若模型通过其他工具循环而未产生文本，最终会触发 `maxSessionTurns`（退出码 53），`handleMaxTurnsExceededError` 中的 `--json-schema` 提示会告知用户排查方向。

**`--bare` 交互。** bare 模式会短路 settings → CLI config 桥接：`packages/cli/src/config/config.ts` 将 `mergedDeny` 构建为 `[...(bareMode ? [] : settings.permissions.deny), ...]`，因此 settings 级别的 deny（以及 `tools.exclude`）在 `--bare` 下会被丢弃。Argv 级别的 `--exclude-tools` 无条件追加到 `mergedDeny` 中，因此仍然生效。合成工具的注册独立于上述所有机制（由 `jsonSchema` 驱动，而非 deny 列表），因此仅在 settings 层 deny 了 `structured_output` 时，在 `--bare` 下会静默无效，而工具仍可被调用。

## 子 agent 上下文

`Config.createToolRegistry` 接受一个 `forSubAgent: true` 选项，用于抑制合成工具的注册。子 agent 覆盖通过原型委托（`createApprovalModeOverride` / `buildSubagentContextOverride` → `Object.create(base)`）复用父 Config，且 `this.jsonSchema` 通过原型链传播。若不设置该标志，合成工具也会注册到子 agent 的 registry 中，子 agent 调用它时会收到"会话现在结束"的 `llmContent`——但只有 `runNonInteractive` 的主循环 / drain 循环才能将其识别为终止信号，因此子 agent 会继续运行，在一个其循环无法履行的工具上白白消耗 token。

> **维护者注意。** 此抑制机制依赖于通过 `createToolRegistry(forSubAgent: true)` 的单一调用路径。任何未来绕过此路径的子 agent 生成机制都会将合成工具泄漏到子 agent 的 registry 中，重新引入"永远消耗 token"的故障模式。安全补充方案是在 `syntheticOutput.execute()` 内部添加运行时守卫，在从子 agent 上下文调用时返回 `fatalError`（或 no-op）。若出现第二个泄漏路径，请添加此守卫。

## MCP 同名工具守卫

`tool-registry.ts:registerTool` 不仅检查 eager `tools` map，还检查 lazy `factories` map 中的命名冲突。若某个 MCP server 发现了一个字面名称为 `structured_output` 的工具，针对 eager 工具冲突的自动限定路径也会对 factory 冲突触发：MCP 工具被重命名为 `mcp__<server>__structured_output`，合成 factory 保留裸名。若没有此守卫，MCP server 可能静默劫持 structured output 契约。

## 兼容性矩阵

| 组合                                                     | 状态             | 原因                                                                                                                                      |
| -------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p`（或 stdin，或位置参数）           | 支持             | 主要无头路径。                                                                                                                            |
| `--json-schema` + `--output-format text`（默认）         | 支持             | `JSON.stringify(payload)` + 换行。                                                                                                        |
| `--json-schema` + `--output-format json` / `stream-json` | 支持             | `structured_result` 字段携带原始对象。                                                                                                    |
| `--json-schema` + `--bare`                               | 支持             | `--bare` 将 registry 限制为 `read_file`、`edit`、`run_shell_command`；合成工具与该最小集一起注册。                                        |
| `--json-schema` + `-i`                                   | 解析时拒绝       | TUI 没有合成工具的终止契约。                                                                                                              |
| `--json-schema` + `--input-format stream-json`           | 解析时拒绝       | 单次契约与长生命周期协议不兼容。                                                                                                          |
| `--json-schema` + `--acp` / `--experimental-acp`         | 解析时拒绝       | ACP 循环是独立的。                                                                                                                        |
| `--json-schema` + `--prompt-interactive`                 | 解析时拒绝       | 与 `-i` 相同。                                                                                                                            |
| `--json-schema` + 无 prompt + 无管道 stdin               | 解析时拒绝       | 无头模式需要 prompt。                                                                                                                     |

## 已考虑的替代方案

**Schema 感知的响应提示（无合成工具）。** 通过系统 prompt 要求模型"以符合此 schema 的 JSON 响应"，并解析最终 assistant 消息。被拒绝，因为模型没有语法保证——输出可能被 fence 包围、前缀有杂文，或产生幻觉字段。工具调用校验在 `execute()` 之前由函数调用层强制执行，提供了硬性的语法 + 语义守卫。

**OpenAI 的 `response_format: {type: "json_schema", …}`。** 提供商特定；需要为 Gemini 和 Anthropic 分别实现。合成工具方案是提供商无关的。

**将 structured_output 重排到批次最前而非过滤。** 允许在 structured 调用校验失败时继续执行有副作用的同批次工具。被拒绝，因为 `--json-schema` 的契约是"产生 structured output"——若模型处于此模式，同批次副作用很可能是错误。完全抑制更安全；模型会收到一个 "Skipped:" tool_result，并可在单独的轮次中重新提交。

**在 `schemaRootAcceptsObject` 内本地解析 `$ref`。** 可在解析时捕获如 `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` 这样的 schema。目前被拒绝，因为代价（循环检测、JSON Pointer 语法、`$defs` vs `definitions`、部分指针、远程 ref）超过收益；`maxSessionTurns` 提示已经将"schema 不可满足"指为可能原因。

## 待完成工作

- 如果真实用户在 `--json-schema` 参数中遇到灾难性回溯模式，schema 感知的响应校验可以增加一个基于 `pattern` 的 ReDoS 守卫。
- SDK 协议扩展（Python / TypeScript / Java SDK 暴露类型化的 `structured_result` 字段）——单独 track；[PR #4001](https://github.com/QwenLM/qwen-code/pull/4001)（于 2026-05-11 关闭且未合并）在 cli/core 工作落地前已覆盖该范围并被取代。

## 文件索引

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`、`schemaRootAcceptsObject`、yargs `.check` 互斥规则。
- `packages/cli/src/gemini.tsx` — TUI 守卫、退出码管道。
- `packages/cli/src/nonInteractiveCli.ts` — `processToolCallBatch`、`emitStructuredSuccess`、`suppressedOutputBody`、纯文本失败路径。
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` — `structuredResult` → `result` + `structured_result` 信封。
- `packages/core/src/config/config.ts` — 通过 `registerStructuredOutputIfRequested` 注册、`forSubAgent` 跳过。
- `packages/core/src/tools/syntheticOutput.ts` — 合成工具 + `STRUCTURED_OUTPUT_REDACTED_ARGS` 占位符。
- `packages/core/src/tools/tool-registry.ts` — MCP 同名工具的 factory 冲突重命名。
- `packages/core/src/telemetry/types.ts` — `function_args` 脱敏。
- `packages/core/src/core/geminiChat.ts` — `redactStructuredOutputArgsForRecording`。
- `packages/core/src/utils/schemaValidator.ts` — 使用严格 Ajv 实例的 `compileStrict`。
- `packages/cli/src/utils/errors.ts` — `handleMaxTurnsExceededError` 中的 `--json-schema` 提示。
