# 结构化输出 (`--json-schema`)

将模型的最终答案约束为你提供的 JSON Schema。Qwen Code 会注册一个合成终端工具，模型必须调用该工具，将调用参数与你的 schema 进行校验，并将验证通过的 payload 输出到 stdout（或 JSON / stream-json 结果信封中）。第一次有效调用即结束本次运行。

仅限无头模式——适用于 `qwen -p`、位置参数 prompt 或通过 stdin 管道传入的 prompt。

## 快速开始

```bash
qwen --prompt "Summarize the changes in HEAD with risk_level" \
  --json-schema '{
    "type": "object",
    "properties": {
      "summary":    { "type": "string" },
      "risk_level": { "type": "string", "enum": ["low", "medium", "high"] }
    },
    "required": ["summary", "risk_level"],
    "additionalProperties": false
  }'
```

stdout 输出（默认 `--output-format text`）：

```json
{ "summary": "…", "risk_level": "low" }
```

该行内容即为 JSON 序列化后的 payload 加换行符——没有信封，没有事件日志。可直接通过管道传给 `jq` 或其他消费者。

在 **text** 模式下，stdout 在成功时仅输出 JSON payload，失败时为空；错误信息和日志行输出到 stderr。这使得 `$(qwen --json-schema …) || exit 1` 的捕获模式在 text 模式下是安全的——失败信息会进入 stderr，而不是混入捕获的变量中。模型在规划过程中产生的额外文本也**不会**镜像到 stderr——text 模式会将其丢弃；如需查看，请使用 `--output-format json` 或 `stream-json`。

在 `--output-format json` 和 `stream-json` 模式下，失败结果消息会输出到 **stdout**，与成功路径并列（作为 JSON 数组的最后一个元素，或 JSONL 流的终止 `result` 行）。并非所有失败模式都会向 stdout 输出结果——max-session-turns（exit 53）和信号中断（exit 130）仅向 stderr 输出并退出。请先检查退出码；result 对象上的 `is_error` 字段可在产生 result 事件的失败子集中进一步区分。

> **空 schema：** 传入 `{}` 会在 stdout 输出 `{}`（一个空 JSON 对象）。模型调用 `structured_output` 时不带任何参数；上游参数规范化路径会将空函数调用转为空对象 payload，该 payload 通过空 schema 的验证后原样输出。

## 提供 schema

两种等价写法：

```bash
# 内联 JSON 字面量
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# 从文件读取
qwen -p "…" --json-schema @./schemas/summary.json
```

`@path` 形式会展开 `~`，规范化路径，并以 `utf8` 编码读取文件。

> **延迟说明：** 成功的运行会产生一个**最长约 500 ms** 的关闭等待，用于在结果输出前让后台进行中的 agent 刷新其最终通知。若没有后台任务待处理，等待会提前退出，因此简单运行几乎感知不到；对繁忙 agent 大量并发调用 `--json-schema` 的批量流水线应考虑这个上限。

> **安全说明：** Schema 中可能包含用户提供的正则表达式（`pattern` 关键字）。Ajv 使用 ECMAScript 正则引擎编译这些表达式，该引擎存在灾难性回溯漏洞。由于工具参数始终为对象，`pattern` 关键字仅在字符串属性内生效——恶意构造的 schema 如
> `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}`
> 在模型提供较长匹配值时可能导致 CLI 挂起。请仅对你信任的来源使用 `--json-schema`。

解析时的校验规则：

- 文件必须是普通文件（不支持 FIFO、字符设备或目录）。
- 文件大小上限为 4 MiB。实际 JSON schema 通常远小于此；超过数 MiB 的文件几乎总是路径写错了。
- Schema 必须是有效的 JSON。对于 `@path` 输入，解析错误信息较为通用（"`<path>` 的内容不是有效的 JSON"），不会回显 SyntaxError 细节，因此捕获 stderr 的外层进程无法从错误信息中读取文件内容的前缀。
- Schema 必须能在严格 Ajv 配置下编译——`propertees` 这类拼写错误会被捕获，但符合规范的写法（如 `required` 中未列出 `properties` 里的每个键）是允许的。
- Schema 根节点必须接受对象类型的值。函数调用 API（Gemini、OpenAI、Anthropic）均要求工具参数为 JSON 对象，非对象根节点会导致注册一个不可用的工具。

根节点接受性检查会遍历 `type`、`const`、`enum`、`anyOf`、`oneOf`、`allOf`、`not` 以及 `if`/`then`/`else`（对可判定情形尽力处理）。如有疑问，会在运行时交由 Ajv 处理。

> **根节点 `$ref` 会被解析时检查拒绝。** 如果你的 schema 通过 `$ref` 复用某个定义，请用 `allOf` 包裹：
>
> ```jsonc
> // 被拒绝：
> { "$ref": "#/$defs/MyObj", "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
>
> // 被接受（根节点通过 allOf 分支接受对象）：
> { "allOf": [{ "$ref": "#/$defs/MyObj" }], "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
> ```
>
> `anyOf` / `oneOf` / `allOf` 内部的 `$ref` 会在运行时交由 Ajv 处理，因此包裹后的形式可以通过根节点接受性检查。

## 各格式的输出结构

| `--output-format` | stdout 输出内容                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`（默认）    | `JSON.stringify(payload) + "\n"` ——单行，即验证通过的对象。                                                                                                                             |
| `json`            | 单个 JSON **数组**，包含所有消息对象（完整事件日志）。最后一个元素为 `type: "result"` 消息，同时携带 `result`（`JSON.stringify(payload)`）和 `structured_result`（原始对象）。          |
| `stream-json`     | 每个事件单独一行，以 JSONL 格式输出。终止的 `result` 行同时携带 `result`（序列化形式）和 `structured_result`（原始对象）。                                                              |

在两种 JSON 格式中，若需要取对象，优先读取 `structured_result` 而非 `result`；`result` 是字符串化形式，供始终期望该字段为字符串的消费者使用。对于 `--output-format json`，读取数组最后一个元素并从中取 `structured_result`（例如 `jq '.[-1].structured_result'`）；对于 `stream-json`，读取流上最后一条 `type: "result"` 行。

## 限制

| 组合                                              | 行为                                                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-schema` + `-i` / `--prompt-interactive`  | 解析时拒绝。合成工具的"会话立即结束"消息在 TUI 循环中没有终止符。                                                                                         |
| `--json-schema` + `--input-format stream-json`   | 解析时拒绝。单次终端合约与长期存活的 stream-json 输入协议不兼容。                                                                                         |
| `--json-schema` + `--acp` / `--experimental-acp` | 解析时拒绝。ACP 运行自己的轮次循环，不遵守合成工具的终端合约。                                                                                            |
| `--json-schema` 且无 prompt 也无管道 stdin        | 解析时拒绝。无头模式需要 prompt——请通过 `-p`、位置参数或管道传入。                                                                                         |
| `--bare` + `--json-schema`                       | 支持。合成工具与裸三件套（`read_file`、`edit`、`run_shell_command`）一同注册。                                                                             |
| 在子 agent 内使用 `--json-schema`                | 工具**不会**被注册。只有顶层运行的 main / drain 轮次遵守终端合约；子 agent 调用该工具会收到"会话立即结束"的响应，然后继续运行，因为其循环没有终止符。      |

## 重试与失败模式

> **费用说明。** `--json-schema` 运行中有两件事会成倍增加 token 消耗，值得在设计时加以考虑：
>
> - **Schema 嵌入每一轮请求。** Schema 作为 `structured_output` 函数声明的 `parameters` 块随每次模型请求发送，而非仅在第一次。大型 schema（最大 4 MiB 解析上限）会按比例增加整个运行中每轮的输入 token 数。
> - **每次验证重试都是一个完整模型轮次。** 模型多次未命中 schema 会按失败次数累计（请求 + 推理 + 响应）。保持 schema 足够约束以引导模型，同时足够简单以便一次成功；若预期会有重试，请提高 `--max-session-turns`。

会话在第一次有效调用时结束。在此之前：

- **参数验证失败。** `structured_output` 返回带有 Ajv 消息的工具结果错误，模型在下一轮看到后可修正参数并再次调用。
- **模型在同一轮中同时调用了有副作用的工具和 `structured_output`。** 预扫描会抑制同轮的其他工具调用——无论结构化调用最终是否验证通过，被抑制的工具都不会运行。两条路径在模型接下来看到的内容上有所不同：
  - **验证成功：** 运行立即结束，模型不再获得下一轮——被抑制的同轮调用被静默丢弃。
  - **验证失败：** 模型获得下一轮，并看到被抑制调用的合成"Skipped:" `tool_result`，从而可以在**单独一轮**中（不包含 `structured_output` 的轮次）重新发出该调用。
- **模型输出了纯文本而未调用 `structured_output`。** 退出码 `1`。错误信息包含轮次数以及模型输出的截断预览，方便排查。
- **运行达到 `maxSessionTurns`。** 退出码 `53`。标准的"已达到最大会话轮次"退出，并附带 `--json-schema` 特有的提示，指向三种常见的运行卡死原因：模型从未调用该工具、`structured_output` 被权限规则拒绝，或 schema 无法满足。
- **运行被中断（SIGINT / Ctrl-C）。** 退出码 `130`。结构化结果通常不会输出，但关闭等待循环不会轮询中止信号，因此在成功调用已被捕获但结果尚未到达 stdout 之前到来的 SIGINT 仍可能将结果输出到 stdout。以退出码为最终判断依据。

## 隐私

你通过 `structured_output` 提交的参数**即是**结构化 payload——已输出到 stdout。为避免将相同 payload 二次持久化到可能被导出到设备外的本地存储中，参数会被替换为占位符
`{ __redacted: 'structured_output payload (see stdout result)' }`，涉及以下位置：

- `ToolCallEvent` 遥测路径（OTLP 导出、QwenLogger、ui-telemetry 流、chat-recording UI 事件镜像）。
- 磁盘上的 chat-recording JSONL 文件
  `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`（在 `--continue` / `--resume` 时重新载入模型上下文），包括每次验证失败的重试。

工具调用指标（时长、成功与否、决策）及周围事件元数据会被保留。

> **Schema 会发送给模型提供商。** 脱敏仅覆盖本地表面上的_调用参数_。Schema 本身作为 `structured_output` 函数声明的 `parameters` 块随每次模型请求发送——因此你在 schema 中写入的任何字面值（`enum`、`const`、`default`、`examples`、`description`、`$comment` 等）都会以明文形式到达提供商，与 prompt 文本无异。Schema 应描述结构和约束；将其视为对提供商公开的内容，不要在 schema 正文中包含密钥、客户记录或其他敏感 payload。

> **Hook 会看到原始参数。** 上述脱敏仅适用于遥测和 chat-recording。`PreToolUse`、`PostToolUse` 和 `PostToolUseFailure` hook（包括可将 payload 转发至设备外的 HTTP hook）会收到 `structured_output` 未脱敏的 `tool_input`，因为 hook 合约是"看到工具所见的内容"。如果你运行审计风格的全量 hook，请对 `structured_output` 禁用这些 hook（按 `tool_name` 过滤），或在对敏感数据运行 `--json-schema` 前在 hook 端做脱敏处理。

## 会话恢复（`--continue` / `--resume`）

`--json-schema` 是按运行的标志，而非按会话的属性。合成工具在 CLI 解析参数时注册，因此：

- 每次希望终端合约生效的 `--continue` / `--resume` 都需要重新传入 `--json-schema`。使用与原始运行相同的 schema 是安全的默认选择——允许在会话中途更换 schema，但这会改变模型被要求遵守的合约。
- 如果 `--continue` 时不带 `--json-schema`，恢复的运行为普通无头会话：`structured_output` 根本不作为工具存在，模型将以自由文本形式响应。
- 恢复的 chat-recording 中的 `__redacted` 占位符在实践中不影响可恢复性。成功的 `structured_output` 调用会立即终止会话，因此恢复的运行可能看到的唯一已脱敏参数来自失败的尝试。模型仍然可以在已记录的 `tool_result` 中看到每次尝试的 Ajv 验证错误，以及来自 `--json-schema` 的实时参数 schema（重新注册），这已足够用于重试。

## 权限控制

`structured_output` 有意绕过 `--core-tools` 允许列表：该工具仅在设置了 `--json-schema` 时存在，排除它会使运行失去终端合约。

显式的 `permissions.deny` 规则和 `--exclude-tools` 设置**会**生效——两者使用相同的拒绝机制，都会阻止 `structured_output` 被注册，使模型永远看不到该工具声明。典型结果是模型以纯文本作答（exit 1）。如果模型一直通过其他工具循环而未产生任何文本，最终会触达 `maxSessionTurns`（exit 53），错误信息中的 `--json-schema` 提示会指引你排查原因。

> **`--bare` 注意事项。** Bare 模式会忽略大多数来自 settings 的输入，包括 settings 级别的 `permissions.deny` 和 `tools.exclude`。合成工具保持注册状态，因此仅通过 settings 拒绝 `structured_output` 在 `--bare` 下会静默无效。`--exclude-tools structured_output` 参数级标志在 bare 模式下仍然生效——如需锁定 bare 运行，请使用标志而非 settings。

## 与 MCP 工具的冲突

如果某个 MCP server 注册了名为 `structured_output` 的工具，工具注册表的冲突检查会将该 MCP 工具重命名为 `mcp__<server-name>__structured_output`，使合成工具保留原始名称。模型看到的始终是用户提供的 schema。

## 示例：基于结构化输出控制多步骤运行

```bash
RESULT=$(qwen --prompt "Audit this diff and rate its risk." \
  --json-schema @./schemas/audit.json) || exit 1

risk=$(jq -r '.risk_level' <<<"$RESULT")
if [ "$risk" = "high" ]; then
  echo "High-risk diff; pausing pipeline." >&2
  exit 2
fi
```

## 另请参阅

- [无头模式](headless.md) ——`--json-schema` 基于的 `-p` 流程。
- [双重输出](dual-output.md) ——在 TUI 旁边记录 JSON 事件 sidecar（另一种机器可读输出方式，不需要 `--json-schema`）。
