# 结构化输出 (`--json-schema`) — 设计

本文档记录了 `--json-schema` 无头特性背后的实现决策。用户面向的用法位于 [`docs/users/features/structured-output.md`](../../users/features/structured-output.md)。

## 目标

在无头运行（`qwen -p`、管道 stdin 或位置参数提示）中，让调用方将模型的最终答案约束为用户提供的 JSON Schema，并将验证后的载荷以机器可读的输出形式暴露出来，供脚本和下游工具直接消费。允许模型在规划过程中产生附带的散文，但运行必须以一个符合 schema 的载荷终止，而不是自由格式的文本。

## 方法：将用户 schema 作为参数 schema 的合成工具

当设置 `--json-schema` 时，`Config.createToolRegistry` 会注册一个名为 `structured_output` 的合成工具（[`syntheticOutput.ts`](../../../packages/core/src/tools/syntheticOutput.ts)）。其 `parametersJsonSchema` 恰好是用户传入的 schema；其 `execute()` 返回一条停止消息 `llmContent`。工具调用基础设施已经在客户端（通过 `BaseDeclarativeTool.build()` 中的 Ajv）对参数进行 `parametersJsonSchema` 验证，因此“模型返回了一个符合 schema 的答案”简化为“模型成功调用了 `structured_output`”。

由此免费获得三个属性：

1. **无需定制验证路径。** Ajv 驱动的 `validateToolParams` 已经在 `BaseDeclarativeTool.build()` 内部运行，并在 `execute()` 触发之前拒绝不符合的参数。
2. **标准的重试行为。** 验证失败会作为工具调用错误呈现给模型，与其他任何工具的参数错误一样。模型会看到 Ajv 消息，并在下一轮中纠正。
3. **与提供商无关。** Gemini、OpenAI 和 Anthropic 都以相同的方式序列化工具参数 schema（通过 `DeclarativeTool` 抽象）；合成工具适用于三者。

该工具以 `alwaysLoad: true` 注册，因此 ToolSearch 按需加载基础设施（在 #3589 中引入——通过将不常用的工具推迟到搜索调用之后，仅在模型请求时才挂载其完整 schema，从而保持暴露的工具表面较小）永远不会对模型隐藏它。没有这个标志，模型就不会知道存在终端契约。

## 解析时验证管道

在 [`packages/cli/src/config/config.ts`](../../../packages/cli/src/config/config.ts) 中的 `resolveJsonSchemaArg(raw)` 在 schema 到达 `Config.createToolRegistry` 之前运行四次检查：

1. **来源解析。** 接受内联 JSON 字面量或 `@path/to/file`。`@path` 形式首先对解析后的路径执行 `stat`，拒绝非普通文件（FIFO、字符设备、目录），将大小上限设为 4 MiB，并且在 JSON 解析失败时发出通用错误（stderr 中不包含文件内容前缀）。
2. **JSON 形状。** 解析结果必须是非数组对象——拒绝基本类型、布尔值和数组，并带有清晰的消息。
3. **根节点接受对象** — [`schemaRootAcceptsObject`](../../../packages/cli/src/config/config.ts)。函数调用 API 总是将对象作为工具参数传递；像 `{type: "array"}` 这样的根 schema 会注册一个不可用的工具。该遍历处理 `type`、`const`、`enum`、`anyOf`、`oneOf`、`allOf`、`not`、`if`/`then`/`else` 以及根 `$ref`。
4. **严格的 Ajv 编译** — [`SchemaValidator.compileStrict`](../../../packages/core/src/utils/schemaValidator.ts)。一个专用 Ajv 实例，开启 `strictSchema: true`，会暴露出像 `propertees` 这样的拼写错误，而宽松的运行时验证器会静默忽略这些错误。

### `schemaRootAcceptsObject` 的边界

该遍历有意识地尽力而为。它捕获了明确的“此 schema 永远无法接受对象”的情况，并将所有需要全 schema 可满足性分析的问题推迟到运行时由 Ajv 处理。

**在解析时决定：**

| 模式                                                    | 结果                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `type` 存在，但不包含 `"object"`                        | 拒绝                                                              |
| `type: ["object", "null"]` 等                          | 接受                                                              |
| `const`：非对象值                                     | 拒绝                                                              |
| `enum`：没有对象成员（包括空数组）                      | 拒绝                                                              |
| `anyOf`/`oneOf`：空数组                                | 拒绝                                                              |
| `anyOf`/`oneOf`：没有分支接受对象                      | 拒绝                                                              |
| `allOf`：任何分支是 `false` 或拒绝对象                | 拒绝                                                              |
| 根 `$ref`（带或不带同级 `type`）                        | 拒绝                                                              |
| `not`：裸 `{type: "object"}`（无收窄关键字）            | 拒绝                                                              |
| `not`：`{type: "object", required: […], …}` 等         | 接受（收窄关键字使得部分对象可满足；推迟）                          |
| `if: true` + `then` 拒绝对象                           | 拒绝                                                              |
| `if: false` + `else` 拒绝对象                          | 拒绝                                                              |

**推迟到运行时由 Ajv 处理：**

- `anyOf`/`oneOf`/`allOf` 分支内的 `$ref`（不透明——本地 `$ref` 解析需要循环检测、JSON Pointer 转义以及 `$defs` 与 `definitions` 处理；对于解析时的尽力检查来说，成本大于收益）。
- `if` 的值是一个对象 schema（只能根据候选值来判断）。
- 比 `not.type` 更复杂的否定 `anyOf`/`oneOf`/`const` 模式。
- 任意的 `pattern` ReDoS 暴露（用户提供的；威胁模型较窄，因为该标志是 CLI 参数，而非网络输入）。

`maxSessionTurns` 退出路径会附加一条 `--json-schema` 特定提示，将用户指向常见的卡住运行症状（模型从未调用 `structured_output`）及其两个可能原因（工具被权限拒绝 / schema 不可满足），以便运行时回退具有用户可见的诊断信息。

## 运行时：轮次调度

[`packages/cli/src/nonInteractiveCli.ts`](../../../packages/cli/src/nonInteractiveCli.ts) 处理运行时调度。结构化输出的特定细节：

### 预扫描 + 兄弟抑制

当模型在同一个助手轮次中同时发出 `structured_output` 和其他工具时，合成调用是终端契约。`processToolCallBatch` 中的预扫描将 `requestsToExecute` 过滤为**仅** `structured_output` 调用，因此有副作用的兄弟工具（`write_file`、`run_shell_command`、`edit` 等）永远不会执行。

示例批次（当 `--json-schema` 激活时）：

| 模型发出的内容                                             | 行为                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[write_file(…), structured_output(…)]`                  | `write_file` 被跳过。`structured_output` 验证成功，运行结束。                                                                                                                                                                                                                                                             |
| `[structured_output(错误参数), structured_output(正确)]` | 第一个 Ajv 验证失败；第二个成功。运行以第二个调用的参数结束。                                                                                                                                                                                                                                                            |
| `[structured_output(错误参数), write_file(…)]`           | `structured_output(错误)` 失败。`write_file` 也被跳过（它之前已被抑制）。模型看到两者：针对结构化调用的 Ajv 错误消息，以及针对副作用调用的合成 `"Skipped: …"` tool_result。下一轮，模型可能重新发出两者，或者单独纠正结构化调用。                                                                                         |
| `[other_tool_a, other_tool_b]`（无 `structured_output`）  | 预扫描不生效。两个工具正常执行；运行**不会**终止。                                                                                                                                                                                                                                                                       |

合成的 "Skipped:" 主体有两种变体：

- **成功路径**（此轮中结构化调用捕获了契约）：
  `"Skipped: this turn's structured_output contract took precedence as the terminal output."` — 简短，因为会话立即终止，且没有消费者（模型或 SDK）会处理它。
- **重试路径**（没有结构化调用捕获，模型获得另一轮）：附加 `"Re-issue this call in a separate turn if needed."` — 这是唯一对模型可操作的情况。

### 主轮次 / 耗尽轮次的一致性

`processToolCallBatch(batchRequests, setModelOverride)` 定义在 `runNonInteractive` 内部，并从以下两处调用：

- 主轮次循环（函数顶部）。
- `drainOneItem`（cron 提示 / 后台任务通知回复循环）。

耗尽轮次很重要，因为 `structured_output` 在整个会话中已注册，因此 cron 作业或通知回复也可能触发该工具。帮助程序在调用时以相同方式处理两个调用点；唯一的调用点特定绑定是写入哪个 `modelOverride` 变量——作为 setter 传入。

**调用后终止流程**在两个位置有所不同：主轮次路径直接调用 `return emitStructuredSuccess()`，而耗尽轮次路径需要两步终止（`processToolCallBatch` 将结果捕获到闭包作用域的 `structuredSubmission` 中；`drainLocalQueue` 检查它以停止耗尽循环，然后 holdback 循环检查它以跳出并调用 `emitStructuredSuccess`）。两者最终汇聚到同一个终端块，但耗尽路径中的额外间接层是承载逻辑的——没有它，在捕获结构化结果后，耗尽循环会继续处理排队的项目。

### 结构化成功终端块

`emitStructuredSuccess()`（也在 `runNonInteractive` 内部定义）是共享的“我们得到了有效调用，关闭”路径：

1. `registry.abortAll()` 中止所有正在运行的后台代理——结构化输出契约是一次性的，不应与 `task_notification` 竞争进入终端输出。
2. 有限的 holdback（`STRUCTURED_SHUTDOWN_HOLDBACK_MS = 500` 毫秒），以便刚被中止的代理的自然取消处理程序有机会发出其终端 `task_notification` 并将其放入 `localQueue`。循环守卫是 `Date.now() < deadline && registry.hasUnfinalizedTasks()`，因此当没有正在运行的任务时（典型路径）等待立即退出，并且永远不会阻塞超过上限。500 毫秒的上限是尽力而为——如果特定代理的中止处理程序超过预算，则在负载下仍可能发生孤立的 `task_started` 事件。循环**不会**轮询中止信号：在 holdback 期间或后续的 emit 路径中收到的 SIGINT 不会短路已捕获的结果。如果没有 holdback，流式 JSON 消费者通常会看到没有匹配 `task_notification` 的 `task_started` 事件。
3. `flushQueuedNotificationsToSdk(localQueue)` 排空仍排队的每一条通知。
4. `finalizeOneShotMonitors()`（幂等——调用两次安全；耗尽路径已调用过）。
5. `adapter.emitResult({ structuredResult: …, isError: false, … })`。

### 失败路径

| 原因                                                             | 退出码                     | 表面                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型仅发出纯文本                                                  | 1                           | 错误信息包含轮次计数 + 截断的 `Output preview`。                                                                                                                                                                                                                |
| 模型在 `maxSessionTurns` 轮内从未调用 `structured_output`        | 53                          | `Reached max session turns` + `--json-schema` 提示指向常见的卡住运行症状及其两个可能原因。                                                                                                                                                                      |
| 验证反复失败                                                      | （最终通过最大轮次到达 53） | 每次失败都在下一轮以 Ajv 消息呈现给模型。                                                                                                                                                                                                                       |
| 中止 / SIGINT                                                    | 130                         | 取消路径。通常不会发出结构化结果，但 `emitStructuredSuccess()` 的 holdback 循环不会轮询中止信号——在捕获之后但 stdout 发送期间/之前到达的 SIGINT 仍可能刷新结果。退出码是可靠的信号。                                                                             |

## 输出信封

[`BaseJsonOutputAdapter.buildResultMessage`](../../../packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts) 中的适配器管道将 `structuredResult` 的存在（通过 `'structuredResult' in options` 跟踪，而不是 `!== undefined`，以便即使模型在空 schema 下调用 `structured_output` 且不带参数，契约也能保留）视为：

- `result` 强制设为 `JSON.stringify(payload)`——覆盖适配器累积的任何自由文本摘要。
- 顶层字段 `structured_result` 携带原始对象，供不想重新解析字符串化形式的消费者使用。
- `undefined` 载荷规范化为 `null`（在两个字段中都呈现为字面 JSON `null`），因此该字段不会悄然消失。在实践中，这个回退很少触发：在上游，`turn.ts` 在存储提交之前应用 `(fnCall.args || {})`，因此针对空 schema 的零参数调用会变成 `{}` 并在 stdout 上呈现为 `{}`，而不是 `null`。`?? null` 步骤是针对严格 `undefined` 情况的纵深防御。

TEXT 模式仅将 `result` 字段 + 换行符写入 stdout（运行期间累积的任何附带助手散文都被丢弃——不会镜像到 stderr）。JSON 模式将完整的事件日志作为 JSON 数组发出；`structured_result` 位于该数组的最后一个 `type: "result"` 元素上，而不是文档根。Stream-json 模式将每条消息作为一行 JSONL 发出；终止的 `result` 行携带 `structured_result`。

## 隐私：跨表面脱敏

通过 `structured_output` 提交的参数就是结构化载荷。在成功路径上它们已经在 stdout 上；在验证失败的重试中它们可能永远不会到达 stdout。无论如何，将它们持久化到持久的设备上表面（或通过遥测导出到设备外）是重复，会将载荷泄漏到用户要求更长的存储中。因此脱敏规则是“无论结果如何，永远不持久化此合成工具的任何参数”，而不仅仅是“对 stdout 已有的内容去重”。

两个表面需要脱敏，且都使用相同的占位符常量
[`STRUCTURED_OUTPUT_REDACTED_ARGS`](../../../packages/core/src/tools/syntheticOutput.ts)：

- `ToolCallEvent.function_args`（遥测）——涵盖 OTLP 导出、QwenLogger、ui-telemetry 以及聊天记录 UI 事件镜像。
- `redactStructuredOutputArgsForRecording`（由 `geminiChat.ts` 中的 `recordAssistantTurn` 使用）——涵盖位于 `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl` 的磁盘聊天记录 JSONL。验证失败的重试也会落在这里——每次重试的参数也获得相同的占位符。

共享常量防止两个表面之间的漂移。工具调用指标（持续时间、成功、决策）保留。

钩子（`PreToolUse`、`PostToolUse`、`PostToolUseFailure`）有意**不**脱敏——它们接收原始 `tool_input`，因为钩子契约是“查看工具看到的内容”。这在用户文档的隐私部分中作为“钩子看到原始参数”的提示记录，以便操作者可以按 `tool_name` 过滤，或在针对敏感数据运行 `--json-schema` 之前添加钩子侧脱敏。

脱敏有意限定在**设备上**持久化表面（遥测导出 + 聊天记录 JSONL）。schema 本身仍然在每次请求时作为 `structured_output` 函数声明的 `parameters` 块发送到模型提供商——无法进行提供商侧脱敏，因为模型需要 schema 来满足工具调用契约。用户文档的隐私部分警告用户出于同样的原因，将 `enum` / `const` / `default` / `examples` / `description` 载荷中的秘密信息去掉。

## 权限门控

`structured_output` 被有意排除在 `PermissionManager.CORE_TOOLS`（受 `--core-tools` 允许列表检查的工具集）之外——与其他合成工具（`agent`、`exit_plan_mode`、`ask_user_question`、`task_stop`、`send_message`）一样。动态发现的工具（`skill`、MCP）是另一个排除类别，也出于无关原因绕过允许列表。合成工具仅在设置 `--json-schema` 时存在；将其添加到允许列表机制意味着 `--core-tools read_file --json-schema X` 会静默丢弃终端契约。

显式的 `permissions.deny` 规则和 `--exclude-tools` 设置仍然通过 `PermissionManager.evaluate` → `isToolEnabled` 生效。两者都使用相同的拒绝机制，并且都阻止注册——工具声明从注册表中删除，因此模型永远看不到该工具。典型结果是模型以纯文本回答（退出码 1）。如果模型在没有产生文本的情况下遍历其他工具，最终会达到 `maxSessionTurns`（退出码 53），并且 `handleMaxTurnsExceededError` 中的 `--json-schema` 提示会告诉用户在哪里查找。
**`--bare` 交互。**
裸模式会短路 settings → CLI 配置桥接：`packages/cli/src/config/config.ts` 构建 `mergedDeny` 为 `[...(bareMode ? [] : settings.permissions.deny), ...]`，因此 settings 级别的拒绝（以及 `tools.exclude`）在 `--bare` 下会被丢弃。argv 级别的 `--exclude-tools` 会被无条件追加到 `mergedDeny` 中，因此它仍然有效。合成工具的注册独立于所有这一切（由 `jsonSchema` 驱动，而非拒绝列表），因此仅 settings 级别的 `structured_output` 拒绝在 `--bare` 下会静默失效，而该工具仍然可调用。

## 子代理上下文

`Config.createToolRegistry` 接受 `forSubAgent: true` 选项，该选项会抑制合成工具的注册。子代理的覆写通过原型委托（`createApprovalModeOverride` / `buildSubagentContextOverride` → `Object.create(base)`）复用父级 Config，并且 `this.jsonSchema` 会沿着原型链传播。如果没有该标志，合成工具也会注册到子代理的注册表中，子代理调用它时会收到 "session ends now" 的 llmContent——但只有 `runNonInteractive` 的主循环/drain 循环会将其检测为终止信号，因此子代理会继续运行，并在其契约无法履行的工具上消耗 token。

> **维护者备注。** 这种抑制依赖于通过 `createToolRegistry(forSubAgent: true)` 的单一调用路径。任何绕过此路径的未来子代理生成机制都会将合成工具泄漏到子代理的注册表中，并重新引入 "永远消耗 token" 的故障模式。安全补全方案是在 `syntheticOutput.execute()` 内部添加一个运行时守卫，当从子代理上下文调用时返回 `fatalError`（或空操作）。如果出现第二个泄漏路径，请添加一个。

## MCP 影子工具守卫

`tool-registry.ts:registerTool` 会检查懒加载的 `factories` 映射中是否存在名称冲突，而不仅仅是即时加载的 `tools` 映射。如果 MCP 服务器发现一个字面名称为 `structured_output` 的工具，那么为即时加载工具冲突而存在的自动限定路径也会对工厂冲突触发：MCP 工具会被重命名为 `mcp__<server>__structured_output`，而合成工厂保留裸名称。如果没有此守卫，MCP 服务器可能会静默劫持结构化输出契约。

## 兼容性矩阵

| 组合                                                    | 状态                   | 理由                                                                                                                                   |
| ------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-p`（或 stdin，或位置参数）           | 支持                   | 主要的无界面路径。                                                                                                                     |
| `--json-schema` + `--output-format text`（默认）        | 支持                   | `JSON.stringify(payload)` + 换行。                                                                                                     |
| `--json-schema` + `--output-format json` / `stream-json`| 支持                   | `structured_result` 字段携带原始对象。                                                                                                 |
| `--json-schema` + `--bare`                               | 支持                   | `--bare` 将注册表限制为 `read_file`、`edit`、`run_shell_command`；合成工具与该最小集合一同注册。                                            |
| `--json-schema` + `-i`                                   | 解析时拒绝             | TUI 没有用于合成工具的终端契约。                                                                                                       |
| `--json-schema` + `--input-format stream-json`           | 解析时拒绝             | 单次契约 vs. 长连接协议。                                                                                                             |
| `--json-schema` + `--acp` / `--experimental-acp`         | 解析时拒绝             | ACP 循环是独立的。                                                                                                                     |
| `--json-schema` + `--prompt-interactive`                 | 解析时拒绝             | 同 `-i`。                                                                                                                             |
| `--json-schema` + 无提示 + 无管道 stdin                  | 解析时拒绝             | 无界面需要提示词。                                                                                                                     |

## 备选方案考虑

**基于 Schema 的响应提示（无合成工具）。** 通过系统提示要求模型 "以匹配此 schema 的 JSON 响应"，然后解析最终助手消息。此方案被拒绝，因为模型没有语法保证——输出可能被代码块包围、带有前缀聊天内容或生成幻觉字段。工具调用验证由函数调用层在 `execute()` 之前强制执行，这为我们提供了严格的语法 + 语义守卫。

**OpenAI 的 `response_format: {type: "json_schema", …}`。** 特定于提供商；需要为 Gemini 和 Anthropic 提供并行实现。合成工具方法与提供商无关。

**将 structured_output 重新排序到批次的前面而不是过滤。** 如果结构化调用验证失败，则允许具有副作用的同级工具运行。此方案被拒绝，因为 `--json-schema` 的契约是 "生成结构化输出"——如果模型处于此模式，同级副作用可能是一个错误。完全抑制它们更安全；模型会看到 "Skipped:" 的 tool_result，并可以在另一个回合中重新发出它们。

**在 `schemaRootAcceptsObject` 内部进行本地 `$ref` 解析。** 可以在解析时捕获诸如 `{anyOf: [{$ref: "#/$defs/String"}], $defs: {…}}` 之类的 schema。目前被拒绝，因为其成本（循环检测、JSON Pointer 语法、`$defs` vs `definitions`、部分指针、远程引用）超过了收益；`maxSessionTurns` 提示已经指出 "schema 无法满足" 是可能的原因。

## 待完成工作

- 如果真实用户遇到 `--json-schema` 参数中的灾难性回溯模式，基于 Schema 的响应验证可以添加基于 `pattern` 的 ReDoS 守卫。
- SDK 协议添加（Python / TypeScript / Java SDK 暴露类型化 `structured_result` 字段）——单独追踪；[PR #4001](https://github.com/QwenLM/qwen-code/pull/4001)（于 2026-05-11 关闭未合并）在 cli/core 工作落地之前涵盖了该范围，现已取代。

## 文件索引

- `packages/cli/src/config/config.ts` — `resolveJsonSchemaArg`、`schemaRootAcceptsObject`、yargs `.check` 互斥规则。
- `packages/cli/src/gemini.tsx` — TUI 守卫、退出码管道。
- `packages/cli/src/nonInteractiveCli.ts` — `processToolCallBatch`、`emitStructuredSuccess`、`suppressedOutputBody`、纯文本失败路径。
- `packages/cli/src/nonInteractive/io/BaseJsonOutputAdapter.ts` — `structuredResult` → `result` + `structured_result` 信封。
- `packages/core/src/config/config.ts` — 通过 `registerStructuredOutputIfRequested` 注册、`forSubAgent` 跳过。
- `packages/core/src/tools/syntheticOutput.ts` — 合成工具 + `STRUCTURED_OUTPUT_REDACTED_ARGS` 占位符。
- `packages/core/src/tools/tool-registry.ts` — 针对 MCP 影子工具的工厂冲突重命名。
- `packages/core/src/telemetry/types.ts` — `function_args` 编辑。
- `packages/core/src/core/geminiChat.ts` — `redactStructuredOutputArgsForRecording`。
- `packages/core/src/utils/schemaValidator.ts` — 使用严格 Ajv 实例的 `compileStrict`。
- `packages/cli/src/utils/errors.ts` — `handleMaxTurnsExceededError` 的 `--json-schema` 提示。