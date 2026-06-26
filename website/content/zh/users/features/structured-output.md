# 结构化输出（`--json-schema`）

约束模型的最终答案，使其符合你提供的 JSON Schema。Qwen Code 注册一个合成终端工具，模型必须调用该工具；它会根据你的 Schema 解析调用的参数，并将验证后的载荷输出到 stdout（或 JSON / stream-json 结果信封中）。第一次有效的调用会结束本次运行。

仅无头模式可用——适用于 `qwen -p`、位置参数提示词，或通过 stdin 管道传入的提示词。

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

stdout 上的输出（默认 `--output-format text`）：

```json
{ "summary": "…", "risk_level": "low" }
```

该行就是 JSON 序列化后的载荷 + 换行——没有信封，没有事件日志。可以直接通过管道传给 `jq` 或其他消费者。

在 **text** 模式下，stdout 在成功时保留给 JSON 载荷，失败时为空；错误信息和日志行发送到 stderr。这使得 `$(qwen --json-schema …) || exit 1` 的捕获模式在 text 模式下是安全的——失败信息进入 stderr，不会混入捕获的变量中。模型在规划期间产生的附带文本 **不会** 镜像到 stderr——text 模式会丢弃它们；如果需要查看它们，请使用 `--output-format json` 或 `stream-json`。

在 `--output-format json` 和 `stream-json` 模式下，失败结果消息会与成功路径一起 **发送到 stdout**（作为 JSON 数组的最后一个元素，或 JSONL 流中终止的 `result` 行）。并非所有失败模式都会向 stdout 发送结果——达到最大会话轮次（退出码 53）和信号中断（退出码 130）仅输出 stderr 并退出。请首先检查退出码；结果对象上的 `is_error` 可以在产生结果事件的失败子集中进行区分。

> **空 Schema：** 传入 `{}` 会在 stdout 上产生 `{}`（一个空的 JSON 对象）。模型会调用 `structured_output` 且不带参数；上游的参数规范化路径会将空的函数调用转换为空对象载荷，该载荷可以通过空 Schema 的验证并原样输出。

## 提供 Schema

两种等效形式：

```bash
# 内联 JSON 字面量
qwen -p "…" --json-schema '{"type":"object", "properties":{…}}'

# 从文件读取
qwen -p "…" --json-schema @./schemas/summary.json
```

`@path` 形式会展开 `~`、规范化路径，并使用 `utf8` 编码读取文件。

> **延迟说明：** 成功运行会产生一个关闭保持延迟，**上限约为 500 ms**，在此期间正在运行的后台代理会在结果输出前刷新其最终通知。如果没有待处理的后台任务，该保持会提前退出，因此简单的运行几乎不会注意到它；对于将大量 `--json-schema` 调用分散到繁忙代理的批处理管道，需要考虑此上限。

> **安全说明：** Schema 中可能包含用户提供的正则表达式（位于 `pattern` 关键字中）。Ajv 使用 ECMAScript 正则引擎编译这些表达式，该引擎容易发生灾难性回溯。由于工具参数始终是对象，`pattern` 关键字仅会在字符串属性内部触发——恶意 Schema 如 `{"type":"object","properties":{"value":{"type":"string","pattern":"(a+)+b"}}}` 会在模型提供中等长度的匹配值时使 CLI 挂起。仅对来自信任来源的 Schema 运行 `--json-schema`。

解析时的验证：

- 文件必须是普通文件（不能是 FIFO、字符设备或目录）。
- 文件大小上限为 4 MiB。现实世界中的 JSON Schema 远低于此；数 MiB 的文件几乎总是表明路径错误。
- Schema 必须是有效的 JSON。对于 `@path` 输入，解析错误是通用的（"`<path>` 的内容不是有效的 JSON"）而非显示 SyntaxError 的详细信息，因此一个包装进程在暴露 stderr 时无法从错误中读取文件内容的前缀。
- Schema 必须在严格的 Ajv 配置下编译——像 `propertees` 这样的拼写错误会被指出，但符合规范的模式（例如 `required` 没有列出 `properties` 中的每个键）会被接受。
- Schema 的根必须接受对象类型的值。函数调用 API（Gemini、OpenAI、Anthropic）都要求工具参数是 JSON 对象，因此非对象的根将注册一个不可用的工具。

根接受检查会遍历 `type`、`const`、`enum`、`anyOf`、`oneOf`、`allOf`、`not` 和 `if`/`then`/`else`（对可判定的情况尽最大努力）。当有疑问时，它会在运行时交给 Ajv 处理。

> **根 `$ref` 会被解析时检查拒绝。** 如果你的 Schema 通过 `$ref` 重用了某个定义，请将其包装在 `allOf` 中：
>
> ```jsonc
> // 被拒绝：
> { "$ref": "#/$defs/MyObj", "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
>
> // 被接受（根通过 allOf 分支接受对象）：
> { "allOf": [{ "$ref": "#/$defs/MyObj" }], "$defs": { "MyObj": { "type": "object", "properties": { "name": { "type": "string" } } } } }
> ```
>
> `anyOf` / `oneOf` / `allOf` 内部的 `$ref` 会在运行时由 Ajv 处理，因此包装后的形式可以通过根接受检查。

## 每种格式的输出形状

| `--output-format` | stdout 输出的内容                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (默认)      | `JSON.stringify(payload) + "\n"` — 一行，已验证的对象。                                                                                                                                                           |
| `json`            | 一个包含消息对象的单个 JSON **数组**（完整的事件日志）。最后一个元素是 `type: "result"` 消息，它同时携带 `result`（`JSON.stringify(payload)`）和 `structured_result`（原始对象）。                               |
| `stream-json`     | 每个事件单独一行，格式为 JSONL。终止的 `result` 行携带 `result`（字符串化）和 `structured_result`（原始对象）。                                                                                                   |

在两种 JSON 格式中，当你需要对象时，建议读取 `structured_result` 而不是 `result`；`result` 是为那些总是期望该字段为字符串的消费者提供的字符串化形式。对于 `--output-format json`，读取数组的最后一个元素并从那里提取 `structured_result`（例如 `jq '.[-1].structured_result'`）；对于 `stream-json`，读取流上最后一个 `type: "result"` 的行。

## 限制

| 组合                                                  | 行为                                                                                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-schema` + `-i` / `--prompt-interactive`       | 解析时拒绝。合成工具的“会话现在结束”消息在 TUI 循环中没有终止符。                                                                                                                                                  |
| `--json-schema` + `--input-format stream-json`        | 解析时拒绝。单次终端的契约与长期存在的 stream-json 输入协议不兼容。                                                                                                                                                |
| `--json-schema` + `--acp` / `--experimental-acp`     | 解析时拒绝。ACP 运行自己的轮次循环，不遵守合成工具的终端契约。                                                                                                                                                     |
| `--json-schema` 无提示词且无管道 stdinde all         | 解析时拒绝。无头模式需要提示词——使用 `-p`、位置参数或通过管道传入一个。                                                                                                                                           |
| `--bare` + `--json-schema`                           | 支持。合成工具会与裸三个工具（`read_file`、`edit`、`run_shell_command`）一起注册。                                                                                                                                 |
| `--json-schema` 在子代理内部                          | 工具 **不会** 注册。只有顶层运行的主轮次/耗尽轮次遵守终端契约；子代理调用该工具会收到“会话现在结束”，然后由于它的循环没有终止符而继续运行。                                                                       |

## 重试与失败模式

> **成本说明：** 在 `--json-schema` 运行中，有两件事会成倍增加 token 消耗，都值得设计时考虑：
>
> - **每个轮次都嵌入 Schema。** Schema 会作为 `structured_output` 函数声明的 `parameters` 块在每次模型请求时发送，而不仅仅是第一次。大的 Schema（高达 4 MiB 解析上限）会按比例增加整个运行的每轮输入 token。
> - **每次验证重试都是一个完整的模型轮次。** 模型反复出错的 Schema 会因每次失败而加倍（请求 + 推理 + 响应）。保持 Schema 足够约束以指导模型，并且足够简单以便第一次就能成功；当预期有重试时，提高 `--max-session-turns`。

会话在第一次有效调用时结束。在此之前：

- **参数验证失败。** `structured_output` 返回一个包含 Ajv 消息的工具结果错误，模型在下一轮会看到该错误，并可能修正参数后再次调用。
- **模型在同一个轮次中调用了一个有副作用的工具和 `structured_output`。** 预扫描会压制该同轮调用——它永远不会被执行，无论结构化调用最终是否通过验证。两条路径在模型接下来看到的内容上不同：
  - **验证成功：** 运行立即结束，模型不会再获得轮次——被压制的同轮调用被静默丢弃。
  - **验证失败：** 模型会获得另一个轮次，并看到一个合成的“已跳过：” `tool_result` 用于被压制的调用，因此它可以在一个 **单独的轮次**（不包含 `structured_output`）中重新发出该调用。
- **模型发出纯文本而不是调用 `structured_output`。** 退出码 `1`。错误信息包含轮次计数和模型输出的截断预览，因此你可以看到它实际说了什么。
- **运行达到 `maxSessionTurns`。** 退出码 `53`。标准“已达到最大会话轮次”退出，外加一条 `--json-schema` 特定的提示，指出三种常见的卡住原因：模型从未调用该工具、`structured_output` 被权限规则拒绝，或 Schema 无法满足。
- **运行被中断（SIGINT / Ctrl-C）。** 退出码 `130`。结构化结果通常不会被发出，但关闭保持循环不会轮询中止信号，因此在成功调用被捕获后但在结果到达 stdout 之前到达的 SIGINT 仍可能落在 stdout 上。将退出码视为事实来源。

## 隐私

你通过 `structured_output` 提交的参数就是结构化载荷——它已经输出到 stdout。为了避免相同的载荷第二次持久化到可能被导出到机器外的设备表面，参数会在以下位置使用占位符 `{ __redacted: 'structured_output payload (see stdout result)' }` 进行编辑：

- `ToolCallEvent` 遥测路径（OTLP 导出、QwenLogger、ui-telemetry 流、聊天记录 UI 事件镜像）。
- 磁盘上的聊天记录 JSONL，位于 `~/.qwen/projects/<sanitized-cwd>/chats/<sessionId>.jsonl`（在 `--continue` / `--resume` 时会重新喂入模型上下文），包括每次验证失败的重试。

工具调用指标（持续时间、成功、决策）和周围的事件元数据会被保留。

> **Schema 会发送给模型提供商。** 编辑仅适用于本地表面上的 _调用参数_。Schema 本身会作为 `structured_output` 函数声明的 `parameters` 块在每次模型请求中携带——因此你放入其中的任何字面量值（`enum`、`const`、`default`、`examples`、`description`、`$comment` 等）都会像提示词文本一样以明文方式到达提供商。Schema 应该描述形状和约束；将其视为对提供商公开的内容，并将机密、客户记录和其他敏感载荷排除在 Schema 主体之外。

> **Hook 会看到原始参数。** 上述编辑仅适用于遥测和聊天记录。`PreToolUse`、`PostToolUse` 和 `PostToolUseFailure` 钩子（包括可以将载荷转发到设备外部的 HTTP 钩子）会收到 `structured_output` 的未编辑 `tool_input`，因为钩子的契约是“看到工具所看到的”。如果你运行审计式的全方位钩子，要么为 `structured_output` 禁用它（根据 `tool_name` 过滤），要么在对敏感数据运行 `--json-schema` 之前添加钩子侧的编辑。

## 会话恢复（`--continue` / `--resume`）

`--json-schema` 是一个每运行标志，而不是每个会话属性。合成工具在 CLI 解析其参数时注册，因此：

- 对于你希望应用终端契约的每个 `--continue` / `--resume`，重新传入 `--json-schema`。使用与原始运行相同的 Schema 是安全的默认值——允许在会话中切换 Schema，但这会改变模型被要求遵守的契约。
- 如果你 `--continue` 时不带 `--json-schema`，则恢复后的运行是一个普通的无头会话：`structured_output` 根本不存在于工具列表中，模型将以自由格式文本响应。
- 恢复的聊天记录中的 `__redacted` 占位符实际上不会影响可恢复性。一次成功的 `structured_output` 调用会立即终止会话，因此恢复的运行可能看到的唯一编辑过的参数来自失败的尝试。模型仍然有每次尝试的 Ajv 验证错误（记录在 `tool_result` 中）和实时的参数 Schema（通过 `--json-schema` 重新注册），这足以进行重试。

## 权限控制

`structured_output` 有意识绕过了 `--core-tools` 白名单：该工具仅在设置 `--json-schema` 时存在，因此将其排除会使得运行没有终端契约。

显式的 `permissions.deny` 规则和 `--exclude-tools` 设置 **确实生效**——两者都使用相同的拒绝机制，并且都阻止 `structured_output` 被注册，因此模型永远不会看到该工具声明。典型结果是模型以纯文本回答（退出码 1）。如果模型循环使用其他工具而从未产生文本，它最终会达到 `maxSessionTurns`（退出码 53），错误信息中的 `--json-schema` 提示会告诉你从哪里查找。

> **`--bare` 注意事项：** Bare 模式会忽略大多数来自设置的输入，包括设置级别的 `permissions.deny` 和 `tools.exclude`。合成工具仍然被注册，因此设置中单独拒绝 `structured_output` 在 `--bare` 下会静默失效。参数级别的 `--exclude-tools structured_output` 在 bare 模式下仍然适用——如果你需要对 bare 运行进行锁定，请使用标志而非设置。

## 与 MCP 工具的冲突

如果某个 MCP 服务器注册了一个字面意义上名为 `structured_output` 的工具，工具注册冲突检查会将 MCP 工具重命名为 `mcp__<server-name>__structured_output`，以便合成工具保留裸名称。用户提供的 Schema 始终是模型看到的那个。

## 示例：基于结构化输出对多步骤运行进行门控

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

- [无头模式](headless.md)——`--json-schema` 所基于的 `-p` 流程。
- [双输出](dual-output.md)——在 TUI 旁边记录 JSON 事件侧车文件（一种不同的机器可读输出方法；不需要 `--json-schema`）。