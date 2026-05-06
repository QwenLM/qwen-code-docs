# 工具调用摘要

Qwen Code 会在每次工具批处理完成后，生成一个简短的、类似 git commit subject 风格的标签，用于总结该批处理完成的工作。该标签会内联显示在对话记录中，并在紧凑模式下替换通用的 `Tool × N` 标题。

这是针对并行工具调用的 UX 优化：当模型同时扇出多个 `Read`、`Grep` 和 `Bash` 调用时，摘要能让你一眼看清意图，而无需逐个扫描工具列表。

该功能默认启用，并在后台静默运行。需要配置 [fast model](./followup-suggestions#fast-model)。

## 显示效果

### 完整模式（默认）

摘要会以灰色徽章行的形式直接显示在工具组下方：

```
╭──────────────────────────────────────────────╮
│ ✓  ReadFile a.txt                            │
│ ✓  ReadFile b.txt                            │
│ ✓  ReadFile c.txt                            │
│ ✓  ReadFile d.txt                            │
╰──────────────────────────────────────────────╯

 ● Read 4 text files
```

### 紧凑模式（`Ctrl+O` 或 `ui.compactMode: true`）

该标签会替换紧凑单行视图中的通用 `Tool × N` 标题：

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

你只需按一次键即可查看单个工具调用（按 `Ctrl+O` 切换至完整模式）。

## 工作原理

工具批处理完成后，Qwen Code 会向配置的 fast model 发起一个 fire-and-forget 调用，携带以下信息：

- 工具名称、截断后的参数和截断后的结果（每项最多 300 个字符）。
- 助手最近一次文本输出的前 200 个字符，作为意图前缀。
- 一个 system prompt，指示模型返回一个过去时态、30 个字符以内、git commit subject 风格的标签。

该调用会与下一轮 API 流式响应并行执行，因此约 1 秒的延迟会被主模型的响应掩盖。标签生成完毕后，会作为 `tool_use_summary` 条目追加到对话记录中。

示例标签：`Searched in auth/`、`Fixed NPE in UserService`、`Created signup endpoint`、`Read config.json`、`Ran failing tests`。

## 触发条件

当满足以下**所有**条件时，才会生成摘要：

- `experimental.emitToolUseSummaries` 为 `true`（默认值）。
- 已配置 `fastModel`（通过设置或 `/model --fast`）。
- 批处理中至少有一个工具已完成。
- 工具完成前该轮次未被中止。
- fast model 返回了非空且无错误的响应。

子代理（subagent）的工具调用不会触发摘要生成——仅主会话的工具批处理会触发。

## 不显示的情况

在以下情况下，摘要会被静默跳过（无报错，UI 无变化）：

- 未配置 fast model。
- fast model 调用失败、超时或返回空值。
- 模型返回了明显的错误信息字符串（例如 `Error: ...`、`I cannot ...`）——客户端会将其过滤，避免 UI 显示误导性标签。
- 模型完成前该轮次被中止（`Ctrl+C`）。

在所有这些情况下，工具组将按原有方式渲染。

## Fast Model

标签使用 [fast model](./followup-suggestions#fast-model) 生成，该模型同样用于提示词建议和推测执行。配置方式如下：

### 通过命令

```
/model --fast qwen3-coder-flash
```

### 通过 `settings.json`

```json
{
  "fastModel": "qwen3-coder-flash"
}
```

若未配置 fast model，将完全跳过摘要生成——该功能在配置完成前不会生效。

## 配置项

可在 `settings.json` 中配置以下设置：

| Setting                             | Type    | Default | Description                                                                                        |
| ----------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries` | boolean | `true`  | 摘要生成的总开关。关闭可禁用额外的 fast model 调用。               |
| `fastModel`                         | string  | `""`    | 用于生成摘要的 fast model（与提示词建议共享）。必填；为空时无效。 |

### 环境变量覆盖

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` 会覆盖当前会话的 `experimental.emitToolUseSummaries` 设置：

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 或 `=false` — 强制关闭。
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` 或 `=true` — 强制开启。
- 未设置 — 使用 `experimental.emitToolUseSummaries` 设置。

### 示例

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

## 作用范围与生命周期

初次了解此功能时，以下三点容易让人产生误解：

1. **每个批处理仅生成一次，两种显示模式共享。** fast model 调用仅在工具批处理完成时的 `handleCompletedTools` 中执行一次。之后切换 `Ctrl+O` **不会**触发新调用——两种模式读取的都是首次捕获的同一个 `tool_use_summary` 历史记录条目。你可以随意切换紧凑模式，不会产生额外开销。
2. **切换模式或恢复会话时不会回填。** 在启用该功能前（或开启设置前，或在恢复的会话中——`ChatRecordingService` 不会持久化摘要条目）已完成的 `tool_group` 永远不会获得标签。系统不会执行“扫描现有历史记录”的操作。如果在会话中途开启此设置，仅**后续**的批处理会显示标签；旧的工具组保持默认渲染，不会提示缺少标签。
3. **仅限主代理批处理。** 触发逻辑位于主会话的轮询循环（`useGeminiStream`）中，因此：
   - ✅ Shell、MCP、文件操作以及 `Task` / 子代理工具**调用本身**（在主批处理中显示的部分）会被摘要。
   - ❌ 子代理的**内部**工具批处理（通过 `packages/core/src/agents/runtime/` 运行）不会被摘要。

   包含 `Task` 工具的外部批处理仍会被打标签，但 fast model 只能看到子代理工具调用及其聚合输出，看不到子代理内部的具体工具调用。你看到的标签会是 `Ran research-agent` 或 `Delegated file search`，而不是 `Searched 14 files`。这是有意为之——对子代理内部进行摘要会成倍增加 fast model 成本，并暴露主 UI 中根本不会显示的噪声。

## 推荐搭配：启用紧凑模式

对于包含 3 个及以上并行工具调用的批处理，将此功能与 `ui.compactMode: true` 搭配使用可获得最清晰的对话记录。紧凑视图会将整个批处理折叠为单行带标签的条目（`✓  Read txt files  · 4 tools`），而不是显示每个工具行再加尾部摘要。详细信息仍可通过 `Ctrl+O` 一键查看。

```json
{
  "fastModel": "qwen3-coder-flash",
  "ui": {
    "compactMode": true
  },
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

在完整模式（默认）下，摘要会作为尾部 `● <label>` 行渲染在工具组下方——这对大型或异构批处理很有用，但对于小型同类型批处理（例如 `Read × 3`），标签读起来可能只是重复了可见的工具行。如果这符合你的日常工作流，可以按上述方式开启紧凑模式，或通过 `experimental.emitToolUseSummaries: false` 完全关闭摘要。

## 监控

摘要模型的使用量会显示在 `/stats` 输出的 fast model token 总计中，`prompt_id` 为 `tool_use_summary_generation`，以便与提示词建议及其他后台任务区分。

## 数据流与隐私

摘要调用会将每个成功工具的名称、截断后的 `args` 和截断后的结果（每个字段最多 300 个字符）发送给 **fast model**，并附加助手最近一次文本的前 200 个字符作为意图前缀。

如果你的 fast model 与主会话模型配置了相同的提供商/认证方式，数据将沿主会话已使用的相同边界传输——信任范围不变。如果你配置了来自**不同提供商**的 fast model，工具输入和输出（可能包括 `read_file` 读取的文件内容、shell 调用的命令输出，或通过 MCP 工具暴露的值）将作为摘要提示词的一部分发送给该其他提供商。这比仅主会话的数据共享范围更大。

如果这对你的工作流很重要，你有两个明确的选择：

- 将 `fastModel` 配置为与主会话相同提供商下的模型，这样摘要调用就不会跨越新的认证/数据边界。
- 通过 `experimental.emitToolUseSummaries: false`（或 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`）完全禁用该功能。

每字段 300 个字符的限制降低了暴露风险，但并未完全消除——在截断窗口内工具输出中发现的密钥仍可能被发送。请像对待主模型一样对待 fast model 的数据边界。

## 成本

每个符合条件的工具批处理产生一次 fast model 调用。输入是一个小型固定 system prompt 加上截断后的工具输入/输出（每个字段最多 300 个字符）。输出是单行短文本（最多 100 个字符，通常不超过 20 个 token）。在典型的 fast model 上，每次批处理成本约为 $0.001。

如果不想承担额外成本，可通过 `experimental.emitToolUseSummaries: false` 或 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 关闭该功能。

## 相关文档

- [Compact Mode](../configuration/settings#ui.compactMode) — 使用 `Ctrl+O` 切换；开启紧凑模式时，摘要会替换通用的工具组标题。
- [Followup Suggestions](./followup-suggestions) — 另一项由 fast model 驱动的 UX 增强功能，共享相同的 `fastModel` 设置。