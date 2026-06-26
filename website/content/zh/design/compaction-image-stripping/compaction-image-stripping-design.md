# Compaction 图像剥离 + Token 估算修复

## 问题陈述

当 `ChatCompressionService` 触发时（自动或手动），它会将 `historyToCompress` 原样发送给摘要模型。有两个相关问题会降低质量、准确性和成本：

1. **内联图像/文档字节泄露到摘要提示中。** 提供附件（截图、设计稿、PDF）的 MCP 工具会将 `inlineData` 部分直接放入对话中。压缩管道没有剥离它们，因此摘要模型会收到通常无法解释的原始 base64，而且 side-query 负载也毫无必要地膨胀了。

2. **`findCompressSplitPoint` 的 token 估算对于二进制部分是错误的。** 拆分点算法使用 `JSON.stringify(content).length` 来在历史记录中分配字符。单个 1 MB 的 base64 图像（约 1.4 M 字符）会使一个条目看起来像 ~350 K 个 token，远远超过实际文本，并将剪切点偏向错误的位置。对于 Qwen-VL 图像，实际的 token 成本最多只有几千个 token。估算器应将二进制部分视为一个小的常量。

claude-code 通过 `stripImagesFromMessages` 解决了 (1)。qwen-code 既没有这个剥离功能，也没有相应的字符计数修复。

此更改添加了这两项功能，但范围限定在**仅 compaction side-query 输入**。实时对话历史、持久化（`chats/<sessionId>.jsonl`）以及下一轮发送给主模型的提示均保持不变。精简仅适用于在 `chatCompressionService` 内部构建的 side-query 负载。

### 范围外（推迟或拒绝）

- **大段粘贴外部化到粘贴缓存。** 该设计的早期草稿建议将过大文本哈希到 `~/.qwen/paste-cache/<sha>.txt` 并替换为占位符。在调查了 claude-code 2026-03 到 2026-05 的版本后，我们拒绝了这一方案：上游方向是让用户输入对模型可见，并通过提示缓存（1 小时 TTL 旋钮、图像缩小）来分摊成本，而不是将其外部化。将逐字用户输入放在哈希占位符后面，一旦 compaction 将原始文本折叠掉，就有“意图漂移”的风险。如果我们以后重新考虑这个问题，正确的模式是使用 `read_paste(hash)` 作为一个真正的工具，供模型主动调用，而不是静默重写。

## 当前状态与目标

| 关注点                            | qwen-code 当前                                   | claude-code 参考                                                   | 此更改后的目标                                                         |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| compact 提示中的图像/文档         | 原样发送                                         | `stripImagesFromMessages` 替换为 `[image]` / `[document]`          | 发送为 `[image: mime]` / `[document: mime]` 占位符                     |
| 二进制部分的 token 估算           | `JSON.stringify().length`（严重偏离）             | 视为固定预算                                                       | 可配置的常量（默认 1,600 token / ~6,400 字符）                         |
| 微压缩 (microcompact) 图像清理    | 未涉及（仅在空闲时清除文本工具结果）             | 基于时间的 MC 清除所有内容                                         | 微压缩也清除过时的内联图像，与工具结果一起                             |

## 提议的更改

### 第 1 层：compaction 输入精简（`services/compactionInputSlimming.ts`）

一个全新的纯模块，接收 `Content[]` 并返回精简后的 `Content[]`。一个转换：内联媒体剥离。遍历每个 `Part`。如果该部分包含 `inlineData` 或 `fileData`，则将其替换为形式为 `[image: image/png]`（或 `[document: application/pdf]`）的 `text` 部分。

qwen-code 将工具返回的媒体附加在 `functionResponse.parts` 上（这是对标准 `@google/genai` 的 `FunctionResponse` 模式的扩展；请参见 `coreToolScheduler.createFunctionResponsePart`）。精简器会递归进入该嵌套数组，以便 `read_file` 或任何发出 MCP 附件的工具返回的 base64 图像也会被替换。

该转换返回一个新的 `Content[]` 数组；原始数组永远不会被修改。如果转换没有产生任何更改，则返回原始数组引用（同一性相等）。编排器在 `chatCompressionService.ts` 中的 `runSideQuery` 之前最后一步调用 `slimCompactionInput`。

### 第 2 层：token 估算修复（`chatCompressionService.ts`）

`findCompressSplitPoint` 当前使用 `JSON.stringify(content).length` 进行字符计数分配。用 `estimateContentChars` 辅助函数替换，该函数：

- 对于 `text` 部分：`text.length`
- 对于 `inlineData` / `fileData` 部分：`imageTokenEstimate * 4`（默认 1,600 × 4 = 6,400 字符）。
- 对于 `functionCall` / `functionResponse` 部分：`JSON.stringify(part).length`（行为不变）。

这与精简模块使用的常量相同，因此拆分点算法看到的预算与下游实际消耗的精简提示相匹配。为避免重复遍历，`compress()` 预先计算 `charCounts` 一次，并将其传递给 `findCompressSplitPoint`（新的可选的第四个参数）；同一个数组将用于 `MIN_COMPRESSION_FRACTION` 保护检查。

### 第 3 层：微压缩图像清理（`microcompaction/microcompact.ts`）

`collectCompactablePartRefs` 现在返回三个组：

- `tool` — 来自可 compact 的内置工具的 `functionResponse` 部分。作为整体清除：响应输出替换为 sentinel，`functionResponse.parts` 也随之丢弃。
- `media` — 用户角色消息下的顶层 `inlineData` / `fileData` 部分（例如通过 `@reference` 粘贴的图像）。替换为 `[Old inline media cleared: <mime>]`。
- `nested-media` — 来自**不可 compact** 的工具（例如名称不在 `COMPACTABLE_TOOLS` 中的 MCP 截图工具）的 `functionResponse` 部分，这些工具在 `functionResponse.parts` 扩展字段上携带图像/文档。仅丢弃嵌套的媒体；保留工具的文本输出。

每种类型都有自己的 `keepRecent` 预算。设置 `toolResultsNumToKeep: 1` 会保留每个类别中最近的一个（1 个工具 + 1 个媒体 + 1 个嵌套媒体），而不是在合并列表中总共保留 1 个条目。

从 MCP 工具服务器获取的 mimeType 值在嵌入任何占位符字符串之前，会通过 `sanitizeMimeForPlaceholder` 处理。精简器和微压缩共享此辅助函数。

### 第 4 层：配置（`config/config.ts`）

`chatCompression` 设置下新增一个字段：

```json
{
  "chatCompression": {
    "contextPercentageThreshold": 0.7,
    "imageTokenEstimate": 1600
  }
}
```

另外增加一个用于运维/调试的环境变量覆盖：`QWEN_IMAGE_TOKEN_ESTIMATE`。

## 关键设计决策

**决策 1：`imageTokenEstimate = 1600`。**
Qwen-VL 系列在没有 `vl_high_resolution_images` 的情况下，每张图像最多 1,280 个视觉 token；使用该标志后，最多可达 16,384 个。1,600 是一个保守的中间值，略微偏高——高估会导致更早的 compaction（安全），低估会导致 compaction 过晚（不安全）。对于非 VL 模型（Qwen3-Coder，qwen-code 的默认值），该常量仅对 token 估算的正确性重要，因为图像无论如何都不会到达模型。

**决策 2：精简的是副本，而不是实时历史记录。**
`slimCompactionInput` 返回一个新数组；存储在 `GeminiChat` 中的聊天历史记录保持不变。本地持久化（`.chats/<sessionId>.jsonl`）保留用户所体验的完整对话，因此 `--resume` 可以正常工作而不会丢失数据。

**决策 3：微压缩将图像与旧的工具结果统一对待。** 基于时间的空闲触发器已经清除了过时的工具输出；将其扩展到内联图像可以保持策略的一致性，并重用现有的 keepRecent 窗口。

**决策 4：没有粘贴存储 / 没有文本外部化。** 见范围外章节。上游共识（claude-code 2026-03 → 2026-05）是保持逐字用户输入可见并通过提示缓存摊销成本，而不是外部化。

## 受影响的文件

**新增文件**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**修改的文件**

- `packages/core/src/config/config.ts` — 扩展 `ChatCompressionSettings`
- `packages/core/src/services/chatCompressionService.ts` — 在 `runSideQuery` 之前调用精简函数；替换字符计数辅助函数；预先计算 charCounts 一次，供拆分器和保护检查使用
- `packages/core/src/services/chatCompressionService.test.ts` — 添加一个集成测试，断言 base64 永远不会到达摘要模型
- `packages/core/src/services/microcompaction/microcompact.ts` — 扩展收集逻辑以包含内联图像
- `packages/core/src/services/microcompaction/microcompact.test.ts` — 测试图像清除功能

## 范围边界

**在范围内**

- 从 compaction 输入中剥离内联媒体
- 修复 `findCompressSplitPoint` 的字符估算
- 在空闲触发器上清理微压缩图像部分
- 一个设置 + 环境变量覆盖

**推迟**

- 大段粘贴外部化（见上面的范围外）
- 重新注入工具（`read_paste(hash)` 等）
- 持久化层去重
- `/context` 粘贴分解
- 精简统计的遥测事件

## 开放问题

1. **占位符文本是否应包含哈希以允许未来的重新注入？** 目前我们只输出 `[image: image/png]`。如果将来出现了类似 `read_paste` 的工具，我们可能需要一个 ID。目前，占位符仅用于信息目的；原始图像仍存在于实时历史记录和持久化中。
2. **`imageTokenEstimate = 1600` 对于通过 Anthropic / OpenAI 代理提供的非 Qwen-VL 模型是否正确？** 可能对 Claude（图像最多约 5K token）略微低估，但无害：它只影响拆分点启发式算法，而不会影响面向用户的模型实际看到的提示。
3. **`MIN_COMPRESSION_FRACTION` 门控是基于精简前的字符计数计算的。** 一个包含大量图像的切片可能通过 5% 阈值（因为图像在估算器中每个约 6,400 字符），然后在精简后缩小为 `[image: …]` 占位符。然后摘要模型几乎收不到任何文本上下文。目前这是有意的：摘要的工作是记录“用户共享了 X 的图像”，即使切片的大部分是视觉内容，而门控的目的是“是否有足够多的内容值得总结”——图像合理地满足了这个条件。如果质量下降，我们可以通过重新检查精简后的内容或根据 `imagesStripped` 比例调整门控来重新审视。