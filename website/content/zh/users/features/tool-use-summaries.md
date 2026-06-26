# 工具使用摘要

Qwen Code 可以在每个工具批次完成后生成一个简短的、类似 git 提交主题的标签，概括该批次完成的工作。该标签内联显示在转录中，并在紧凑模式下替换通用的 `Tool × N` 标题。

这是针对并行工具调用的 UX 辅助工具：当模型同时扇出多个 `Read` + `Grep` + `Bash` 调用时，摘要让你一眼就能看出意图，而无需费力扫描工具列表。

该功能默认启用并在后台静默运行。它需要一个已配置的 [fast 模型](./followup-suggestions#fast-model)。

## 你会看到什么

### 完整模式（默认）

摘要显示为工具组下方的一行暗淡的徽章行：

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

标签替换紧凑单行中的通用 `Tool × N` 标题：

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

各个工具调用仍然只需按一个键（`Ctrl+O` 切换到完整模式）即可查看。

## 工作原理

工具批次最终确定后，Qwen Code 会向配置的 fast 模型发起一次“发射后不管”的调用，内容包括：

- 工具名称、截断的参数和截断的结果（每个最多 300 个字符）。
- 助手最近的文本输出（前 200 个字符）作为意图前缀。
- 一个系统提示，指示模型返回一个过去时态的、30 个字符的 git 提交主题风格标签。

该调用与下一轮 API 流并行运行，因此其约 1 秒的延迟被主模型的响应隐藏。当标签解析后，它会作为 `tool_use_summary` 条目附加到转录中。

示例标签：`Searched in auth/`、`Fixed NPE in UserService`、`Created signup endpoint`、`Read config.json`、`Ran failing tests`。

## 何时出现

摘要生成在满足 **所有** 以下条件时发生：

- `experimental.emitToolUseSummaries` 为 `true`（默认）。
- 已配置 `fastModel`（通过设置或 `/model --fast`）。
- 批次中至少完成了一个工具。
- 该轮对话在工具完成前未被中止。
- fast 模型返回了非空、非错误的响应。

子代理工具调用不会触发摘要生成——只有主会话的工具批次才会。

## 何时不出现

在以下情况下，摘要会被静默跳过（无错误，无 UI 变化）：

- 未配置 fast 模型。
- fast 模型调用失败、超时或返回空。
- 模型返回了明显的错误消息类字符串（例如 `Error: ...`、`I cannot ...`）——由客户端过滤，使 UI 不显示误导性的标签。
- 该轮对话在模型完成前被中止（`Ctrl+C`）。

在所有情况下，工具组的渲染与往常一样。

## Fast 模型

标签是使用 [fast 模型](./followup-suggestions#fast-model）生成的——与你为提示建议和投机执行配置的模型相同。通过以下方式配置：

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

当未配置 fast 模型时，摘要生成会被完全跳过——该功能在设置之前不会有任何效果。

## 配置

这些设置可以在 `settings.json` 中配置：

| 设置                              | 类型    | 默认值 | 描述                                                                                             |
| --------------------------------- | ------- | ------ | ------------------------------------------------------------------------------------------------ |
| `experimental.emitToolUseSummaries` | boolean | `true` | 摘要生成的主开关。关闭以禁用额外的 fast 模型调用。                                               |
| `fastModel`                         | string  | `""`   | 用于摘要生成的 fast 模型（与提示建议共享）。必需；若为空则无效。                                |

### 环境变量覆盖

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` 覆盖当前会话的 `experimental.emitToolUseSummaries` 设置：

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 或 `=false`——强制关闭。
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` 或 `=true`——强制开启。
- 未设置——使用 `experimental.emitToolUseSummaries` 设置。

### 示例

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

## 范围与生命周期

初次阅读此功能时，有三个点容易让人困惑：

1. **每个批次一次生成，两种显示模式共享。** Fast 模型调用在 `handleCompletedTools` 中恰好发生一次，当工具批次最终确定时。之后切换 `Ctrl+O` **不会**触发新的调用——两种模式都读取最初捕获的同一个 `tool_use_summary` 历史条目。你可以随意切换紧凑模式，无需额外开销。
2. **切换或恢复会话时不会回填。** 在功能启用之前（或在你打开设置之前，或在恢复的会话中——`ChatRecordingService` 不会持久化摘要条目）完成的 `tool_group` 永远不会获得标签。没有“扫描现有历史”的步骤。如果在会话中途打开此设置，只有**未来**的批次会显示标签；较旧的组保持默认渲染，没有任何指示表明缺少标签。
3. **仅限主代理批次。** 触发点位于主会话的轮次循环（`useGeminiStream`）中，因此：
   - ✅ Shell、MCP、文件操作以及 `Task`/子代理工具_调用本身_（如主批次中显示的那样）会被总结。
   - ❌ 子代理的**内部**工具批次（通过 `packages/core/src/agents/runtime/` 运行）不会被总结。

   包含 `Task` 工具的外部批次仍然会被标记，但 fast 模型只看到子代理工具调用及其聚合输出——而不是子代理内部的单个工具调用。预期标签如 `Ran research-agent` 或 `Delegated file search`，而不是 `Searched 14 files`。这是有意为之——总结子代理内部会成倍增加 fast 模型的成本并产生主 UI 中不会出现的噪音。

## 推荐搭配：启用紧凑模式

对于 3 个或更多并行工具调用的批次，将此功能与 `ui.compactMode: true` 配对可产生最清晰的转录。紧凑视图将整个批次折叠为单个带标签的行（`✓  Read txt files  · 4 tools`），而不是显示每一行工具再加上后面的摘要。详细信息通过 `Ctrl+O` 只需一个按键即可查看。

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

在完整模式（默认）下，摘要显示为工具组下方的一行末尾 `● <label>` 行——这对于大型或异构批次很有用，但对于小型同类型批次（例如 `Read × 3`），标签可能只是对可见工具行的重述。如果这符合你通常的工作流程，要么按上述方法打开紧凑模式，要么通过 `experimental.emitToolUseSummaries: false` 完全关闭摘要。

## 监控

摘要模型的使用情况会出现在 `/stats` 输出的 fast 模型 token 总量中，带有 `prompt_id` `tool_use_summary_generation`，以便与提示建议和其他后台任务区分。

## 数据流与隐私

摘要调用会将每个成功工具的名称、截断的 `args` 和截断的结果（每个字段最多 300 个字符）发送到 **fast 模型**，再加上助手最近文本的前 200 个字符作为意图前缀。

如果你的 fast 模型配置为与主会话模型使用相同的提供者/认证，那么数据沿着主会话已使用的相同边界流动——信任范围没有变化。如果你从**不同的提供者**配置了 fast 模型，工具输入和输出（可能包括 `read_file` 读取的文件内容、shell 调用的命令输出，或通过 MCP 工具暴露的值）将作为摘要提示的一部分发送给该其他提供者。这比单独的主会话具有严格更大的数据共享范围。

如果这对你的工作流程很重要，你有两个干净的选择：

- 将 `fastModel` 配置为与主会话相同提供者下的模型，这样摘要调用不会跨越任何新的认证/数据边界。
- 使用 `experimental.emitToolUseSummaries: false`（或 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`）完全禁用该功能。

每个字段 300 个字符的上限限制了暴露，但并未消除——在截断窗口内工具输出中发现的秘密仍然可能被发送。将 fast 模型的数据边界视为主模型的数据边界。

## 成本

每个符合条件的工具批次调用一次 fast 模型。输入是一个小的固定系统提示加上截断的工具输入/输出（每个字段最多 300 个字符）。输出是一个短行（最多 100 个字符，通常 20 个 token 或更少）。在典型的 fast 模型上，每个批次大约花费 $0.001。

如果你不希望产生额外费用，请通过 `experimental.emitToolUseSummaries: false` 或 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 关闭该功能。

## 相关

- [紧凑模式](../configuration/settings#ui) — 使用 `Ctrl+O` 切换；当紧凑模式开启时，摘要替换通用的工具组标题。
- [后续建议](./followup-suggestions) — 另一个由 fast 模型驱动的 UX 增强功能，共享相同的 `fastModel` 设置。