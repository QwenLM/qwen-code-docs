# Compaction 图片剥离 + Token 估算修复

## 问题描述

当 `ChatCompressionService` 触发（自动或手动）时，它会将 `historyToCompress` 原封不动地发送给摘要模型。以下两个相关问题会降低质量、准确性并增加成本：

1. **内联图片/文档字节泄漏到摘要 prompt 中。**
   MCP 工具在呈现附件（截图、设计稿、PDF）时会将 `inlineData` 部分直接放入对话中。压缩管道未对其进行剥离，因此摘要模型会收到通常无法解析的原始 base64 数据，同时也不必要地膨胀了旁路查询的 payload。

2. **`findCompressSplitPoint` 对二进制部分的 token 估算有误。**
   分割点算法使用 `JSON.stringify(content).length` 来分配历史记录中各条目的字符数。单张 1 MB 的 base64 图片（约 140 万字符）会让一条记录看起来有约 35 万 token，远超实际文本量，导致分割点位置偏差。Qwen-VL 图片的实际 token 开销最多也不过几千。估算器应将二进制部分视为较小的固定常量。

claude-code 通过 `stripImagesFromMessages` 解决了问题 (1)。qwen-code 既没有这个剥离逻辑，也没有对应的字符计数修复。

本次变更同时添加上述两项修复，**仅作用于 compaction 旁路查询的输入**。实时对话历史、持久化数据（`chats/<sessionId>.jsonl`）以及发送给主模型的下一轮 prompt 均不受影响。精简操作仅应用于 `chatCompressionService` 内部构建旁路查询 payload 的环节。

### 范围外（推迟或拒绝）

- **大型粘贴内容外部化到粘贴缓存。** 本设计的早期草案提议将超大文本哈希后存入 `~/.qwen/paste-cache/<sha>.txt` 并用占位符替代。在审查了 claude-code 2026-03 至 2026-05 的版本后，我们放弃了该方案：上游的方向是保持用户输入对模型的可见性，并通过 prompt 缓存（1h TTL 旋钮、图片降分辨率）来分摊成本，而非外部化存储。将用户原始输入置于哈希占位符之后，一旦 compaction 将原文折叠掉，就有"意图漂移"的风险。如果日后重新考虑该方案，正确的模式是将 `read_paste(hash)` 作为模型可以主动调用的真实工具，而非静默改写。

## 当前状态 vs 目标状态

| 关注点                        | 当前 qwen-code                                        | claude-code 参考实现                                              | 本次变更后的目标                                                        |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| compact prompt 中的图片/文档  | 原样发送                                              | `stripImagesFromMessages` 替换为 `[image]` / `[document]`         | 替换为 `[image: mime]` / `[document: mime]` 占位符                      |
| 二进制部分 token 估算         | `JSON.stringify().length`（严重偏差）                 | 视为固定预算                                                      | 可配置常量（默认 1,600 tokens / 约 6,400 字符）                         |
| Microcompact 图片清理         | 不处理（空闲时仅清除文本工具结果）                   | 基于时间的 MC 清除所有内容                                        | Microcompact 在清除工具结果的同时也清除过期内联图片                      |

## 提议的变更

### Layer 1：compaction 输入精简（`services/compactionInputSlimming.ts`）

新增纯函数模块，接受 `Content[]`，返回精简后的 `Content[]`。唯一的转换逻辑：内联媒体剥离。遍历每个 `Part`，若该 part 包含 `inlineData` 或 `fileData`，则将其替换为格式为 `[image: image/png]`（或 `[document: application/pdf]`）的 `text` part。

qwen-code 通过 `functionResponse.parts` 挂载工具返回的媒体内容（这是对标准 `@google/genai` `FunctionResponse` schema 的扩展；参见 `coreToolScheduler.createFunctionResponsePart`）。精简器会递归处理该嵌套数组，因此 `read_file` 或任何会输出附件的 MCP 工具返回的 base64 图片同样会被替换。

该转换返回全新的 `Content[]` 数组，原始数组不会被修改。若转换没有产生任何变化，则返回原始数组引用（引用相等）。编排器在 `chatCompressionService.ts` 中调用 `runSideQuery` 前的最后一步调用 `slimCompactionInput`。

### Layer 2：token 估算修复（`chatCompressionService.ts`）

`findCompressSplitPoint` 目前使用 `JSON.stringify(content).length` 进行字符数分配。将其替换为 `estimateContentChars` helper，规则如下：

- `text` parts：`text.length`
- `inlineData` / `fileData` parts：`imageTokenEstimate * 4`（默认 1,600 × 4 = 6,400 字符）
- `functionCall` / `functionResponse` parts：`JSON.stringify(part).length`（行为不变）

该常量与精简模块使用的一致，因此分割点算法看到的预算与精简后 prompt 实际消耗的量相匹配。为避免重复遍历，`compress()` 提前计算一次 `charCounts` 并传给 `findCompressSplitPoint`（新增可选第 4 个参数）；同一数组也复用于 `MIN_COMPRESSION_FRACTION` 守卫检查。

### Layer 3：microcompact 图片清理（`microcompaction/microcompact.ts`）

`collectCompactablePartRefs` 现在返回三组数据：

- `tool` — 来自可压缩内置工具的 `functionResponse` parts。作为整体清除：响应输出替换为哨兵值，`functionResponse.parts` 一并丢弃。
- `media` — 用户角色消息中的顶层 `inlineData` / `fileData` parts（例如通过 `@reference` 粘贴的图片）。替换为 `[Old inline media cleared: <mime>]`。
- `nested-media` — **不可压缩**工具（例如名称不在 `COMPACTABLE_TOOLS` 中的 MCP 截图工具）的 `functionResponse` parts，其 `functionResponse.parts` 扩展字段中携带图片/文档。仅丢弃嵌套媒体，工具的文本输出予以保留。

每种类型有各自的 `keepRecent` 预算。将 `toolResultsNumToKeep` 设为 `1` 表示每个类别各保留最新的一条（1 个 tool + 1 个 media + 1 个 nested-media），而非三类合并后共保留 1 条。

从 MCP 工具服务器获取的 mimeType 值在嵌入任何占位符字符串之前，会经过 `sanitizeMimeForPlaceholder` 处理。精简器和 microcompact 共用该 helper。

### Layer 4：配置（`config/config.ts`）

在 `chatCompression` 设置下新增一个字段：

```json
{
  "chatCompression": {
    "contextPercentageThreshold": 0.7,
    "imageTokenEstimate": 1600
  }
}
```

另外提供环境变量覆盖（用于运维/调试）：`QWEN_IMAGE_TOKEN_ESTIMATE`。

## 关键设计决策

**决策 1：`imageTokenEstimate = 1600`。**
Qwen-VL 系列在不启用 `vl_high_resolution_images` 时，每张图片最多消耗 1,280 个视觉 token；启用后最多 16,384。1,600 是偏保守的中间值，略微高估——高估会导致更早触发 compaction（安全），低估会导致 compaction 滞后（不安全）。对于非 VL 模型（Qwen3-Coder，即 qwen-code 默认模型），该常量只影响 token 估算的准确性，因为图片本身不会被发送给模型。

**决策 2：精简副本而非实时历史。**
`slimCompactionInput` 返回全新数组，`GeminiChat` 中存储的对话历史不受影响。本地持久化（`.chats/<sessionId>.jsonl`）保留用户所经历的完整对话，因此 `--resume` 功能不会有任何损失。

**决策 3：Microcompact 对图片与旧工具结果采用统一策略。**
基于时间的空闲触发器已经会清除过期工具输出；将其扩展至内联图片可保持策略一致性，并复用现有的 keepRecent 窗口。

**决策 4：不使用粘贴存储/不外部化文本。**
参见范围外章节。上游共识（claude-code 2026-03 → 2026-05）是保持用户原始输入的可见性，并通过 prompt 缓存分摊成本，而非外部化存储。

## 涉及文件

**新增文件**

- `packages/core/src/services/compactionInputSlimming.ts`
- `packages/core/src/services/compactionInputSlimming.test.ts`

**修改文件**

- `packages/core/src/config/config.ts` — 扩展 `ChatCompressionSettings`
- `packages/core/src/services/chatCompressionService.ts` — 在 `runSideQuery` 前调用精简；替换字符计数 helper；提前计算 charCounts 供分割器和守卫复用
- `packages/core/src/services/chatCompressionService.test.ts` — 新增端到端测试，断言 base64 不会到达摘要模型
- `packages/core/src/services/microcompaction/microcompact.ts` — 将内联图片纳入收集范围
- `packages/core/src/services/microcompaction/microcompact.test.ts` — 测试图片清理逻辑

## 范围边界

**在范围内**

- 从 compaction 输入中剥离内联媒体
- 修复 `findCompressSplitPoint` 的字符估算
- 空闲触发时的 microcompact 图片 part 清理
- 一个配置项 + 环境变量覆盖

**推迟**

- 大型粘贴内容外部化（参见范围外章节）
- 重新膨胀工具（`read_paste(hash)` 等）
- 持久化层去重
- `/context` 粘贴内容拆解
- 精简统计的遥测事件

## 待解问题

1. **占位符文本是否应包含哈希以支持未来的重新膨胀？** 目前我们输出的是 `[image: image/png]`。如果/当 `read_paste` 风格的工具落地时，可能需要一个 ID。目前占位符仅作信息展示；原始图片仍存在于实时历史和持久化数据中。
2. **`imageTokenEstimate = 1600` 对于通过 Anthropic / OpenAI 代理服务的非 Qwen-VL 模型是否正确？** 对于 Claude（图片最多约 5K tokens）来说可能略有低估，但无害：它只影响分割点启发式算法，不影响用户侧模型实际看到的 prompt。
3. **`MIN_COMPRESSION_FRACTION` 守卫基于精简前的字符计数进行计算。** 图片密集的片段可能通过 5% 阈值（因为估算器中每张图片计为约 6,400 字符），然后在精简后缩减为 `[image: …]` 占位符。摘要模型因此几乎收不到任何文本上下文。目前这是有意为之：摘要的职责是记录"用户分享了一张 X 图片"，即便该片段大部分都是视觉内容，而守卫的目的是"是否值得摘要"——图片内容合理地满足这一条件。如果质量下降，可通过精简后重新检查或基于 `imagesStripped` 比例调整守卫来改进。
