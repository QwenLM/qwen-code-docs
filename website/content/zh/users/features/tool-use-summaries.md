# 工具使用摘要

Qwen Code 可以在每批工具调用完成后，以 git commit subject 风格生成一个简短标签，概括该批次完成的操作。该标签会内联显示在会话记录中，并在紧凑模式下替换通用的 `Tool × N` 标题。

这是一项针对并行工具调用的 UX 辅助功能：当模型同时发出多个 `Read`、`Grep`、`Bash` 调用时，摘要能让你一眼看清操作意图，而无需逐一扫描工具列表。

该功能默认启用，在后台静默运行，需要配置 [fast model](./followup-suggestions#fast-model)。

## 效果展示

### 完整模式（默认）

摘要以淡色徽标行的形式显示在工具组的正下方：

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

标签替换紧凑单行中通用的 `Tool × N` 标题：

```
╭──────────────────────────────────────────────╮
│✓  Read txt files  · 4 tools                  │
│Press Ctrl+O to show full tool output         │
╰──────────────────────────────────────────────╯
```

按 `Ctrl+O` 即可切换到完整模式，查看各条工具调用详情。

## 工作原理

工具批次完成后，Qwen Code 会向已配置的 fast model 发起一次 fire-and-forget 调用，内容包括：

- 工具名称、截断后的参数及截断后的结果（每项上限 300 个字符）。
- 助手最近一次文本输出的前 200 个字符，作为意图前缀。
- 系统提示，要求模型以 git commit subject 风格返回一个不超过 30 个字符的过去时标签。

该调用与下一轮 API 流式传输并行运行，约 1 秒的延迟隐藏在主模型响应之后。标签生成完毕后，会以 `tool_use_summary` 条目的形式追加到会话记录中。

标签示例：`Searched in auth/`、`Fixed NPE in UserService`、`Created signup endpoint`、`Read config.json`、`Ran failing tests`。

## 触发条件

以下条件**全部**满足时才会生成摘要：

- `experimental.emitToolUseSummaries` 为 `true`（默认值）。
- 已配置 `fastModel`（通过 settings 或 `/model --fast`）。
- 该批次中至少有一个工具完成了调用。
- 工具完成前当前轮次未被中止。
- fast model 返回了非空且无错误的响应。

子 agent 的工具调用不会触发摘要生成——只有主会话的工具批次才会触发。

## 不触发的情况

以下情况摘要会被静默跳过（不报错，UI 无变化）：

- 未配置 fast model。
- fast model 调用失败、超时或返回空结果。
- 模型返回了明显的错误消息字符串（如 `Error: ...`、`I cannot ...`）——客户端会过滤掉，避免在 UI 中显示误导性标签。
- 模型完成前当前轮次被中止（`Ctrl+C`）。

以上所有情况下，工具组的渲染方式与以往相同。

## Fast Model

标签由 [fast model](./followup-suggestions#fast-model) 生成——与用于提示建议和推测执行的 fast model 相同。配置方式如下：

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

未配置 fast model 时，摘要生成会被完全跳过——配置完成前该功能不起任何作用。

## 配置

以下设置可在 `settings.json` 中配置：

| 设置项                              | 类型    | 默认值  | 说明                                                                                               |
| ----------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------- |
| `experimental.emitToolUseSummaries` | boolean | `true`  | 摘要生成的总开关。关闭后将禁用额外的 fast model 调用。                                            |
| `fastModel`                         | string  | `""`    | 用于摘要生成的 fast model（与提示建议共用）。必填；为空时无效。                                   |

### 环境变量覆盖

`QWEN_CODE_EMIT_TOOL_USE_SUMMARIES` 可在当前会话中覆盖 `experimental.emitToolUseSummaries` 的设置：

- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 或 `=false` — 强制关闭。
- `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=1` 或 `=true` — 强制开启。
- 未设置 — 使用 `experimental.emitToolUseSummaries` 的配置值。

### 示例

```json
{
  "fastModel": "qwen3-coder-flash",
  "experimental": {
    "emitToolUseSummaries": true
  }
}
```

## 作用域与生命周期

关于本功能，初次阅读时容易忽略以下三点：

1. **每批次生成一次，两种显示模式共用。** fast model 调用在工具批次完成时由 `handleCompletedTools` 触发，且只触发一次。之后切换 `Ctrl+O` **不会**再次触发调用——两种模式都从首次捕获的同一个 `tool_use_summary` 历史条目中读取。可以随意切换紧凑模式，不产生额外开销。
2. **切换设置或恢复会话时不会回填。** 功能启用前（或设置打开前，或在已恢复的会话中——`ChatRecordingService` 不持久化摘要条目）已完成的 `tool_group` 永远不会获得标签。不存在"扫描现有历史"的操作。如果在会话中途开启此设置，只有**后续**批次会显示标签；之前的工具组保持默认渲染，且不会有任何提示表明标签缺失。
3. **仅限主 agent 批次。** 触发逻辑位于主会话的轮次循环（`useGeminiStream`）中，因此：
   - ✅ Shell、MCP、文件操作，以及 `Task` / 子 agent 工具**调用本身**（出现在主批次中的部分）会被汇总。
   - ❌ 子 agent 的**内部**工具批次（通过 `packages/core/src/agents/runtime/` 运行）不会被汇总。

   包含 `Task` 工具的外层批次仍会生成标签，但 fast model 只能看到子 agent 工具调用及其聚合输出——而非子 agent 内部的各条工具调用。标签会类似 `Ran research-agent` 或 `Delegated file search`，而非 `Searched 14 files`。这是有意为之——对子 agent 内部进行汇总会成倍增加 fast model 开销，并将主 UI 中不可见的噪音暴露出来。

## 推荐搭配：开启紧凑模式

对于包含 3 个及以上并行工具调用的批次，将此功能与 `ui.compactMode: true` 配合使用可获得最整洁的会话记录。紧凑视图将整个批次折叠为单行带标签的记录（`✓  Read txt files  · 4 tools`），而非展开每一行工具加上末尾的摘要。按 `Ctrl+O` 即可查看详情。

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

在完整模式（默认）下，摘要以 `● <label>` 行的形式显示在工具组下方——对于大型或异构批次非常有用；但对于小型同类批次（如 `Read × 3`），标签可能只是对已可见工具行的重复描述。如果这符合你的常用工作流，可以按上述方式开启紧凑模式，或通过 `experimental.emitToolUseSummaries: false` 完全关闭摘要功能。

## 监控

摘要模型的用量会出现在 `/stats` 输出的 fast model token 汇总中，`prompt_id` 为 `tool_use_summary_generation`，便于与提示建议及其他后台任务区分。

## 数据流与隐私

摘要调用会将每个成功工具的名称、截断后的 `args` 以及截断后的结果（每个字段上限 300 个字符）发送给 **fast model**，同时附带助手最近一次文本输出的前 200 个字符作为意图前缀。

如果你的 fast model 与主会话模型使用相同的 provider/auth，数据将沿着主会话已有的边界流转——信任范围不变。如果你配置了来自**不同 provider** 的 fast model，工具的输入和输出（可能包括 `read_file` 读取的文件内容、shell 调用的命令输出，或通过 MCP 工具暴露的值）将作为摘要提示的一部分发送给该第三方 provider。这在数据共享范围上严格大于仅使用主会话的情况。

如果这对你的工作流有影响，有两种干净的处理方式：

- 将 `fastModel` 配置为与主会话相同 provider 下的模型，使摘要调用不跨越任何新的 auth/数据边界。
- 通过 `experimental.emitToolUseSummaries: false`（或 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0`）完全禁用该功能。

每字段 300 个字符的截断限制了数据暴露范围，但并不能完全消除风险——在截断窗口内，工具输出中发现的密钥仍可能被发送出去。请以与对待主模型数据边界相同的方式对待 fast model 的数据边界。

## 费用

每个符合条件的工具批次触发一次 fast model 调用。输入为固定的小型系统提示加上截断后的工具输入/输出（每字段上限 300 个字符），输出为单行短文本（上限 100 个字符，通常不超过 20 个 token）。在典型的 fast model 上，每批次大约花费 $0.001。

如果不希望产生额外费用，可通过 `experimental.emitToolUseSummaries: false` 或 `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0` 关闭该功能。

## 相关内容

- [紧凑模式](../configuration/settings#ui) — 用 `Ctrl+O` 切换；开启紧凑模式后，摘要会替换通用的工具组标题。
- [后续建议](./followup-suggestions) — 另一项基于 fast model 的 UX 增强功能，与摘要共用同一个 `fastModel` 设置。
