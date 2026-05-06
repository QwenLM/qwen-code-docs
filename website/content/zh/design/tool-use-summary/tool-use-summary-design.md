# 工具调用摘要设计

> 针对并行工具批次的快速模型标签——设计动机、与 Claude Code 的竞品分析、架构设计，以及驱动当前完整模式渲染方案的 append-only Static 原理。
>
> 用户文档：[Tool-Use Summaries](../../users/features/tool-use-summaries.md)。

## 1. 概述

每个工具批次执行完成后，Qwen Code 会发起一次简短的快速模型（fast-model）调用，返回一个类似 git commit subject 风格的标签来概括该批次。在完整模式（full mode）下，该标签以行内灰色 `● <label>` 的形式显示；在紧凑模式（compact mode）下，它会替换默认的 `Tool × N` 标题。摘要生成采用 fire-and-forget 方式，与下一轮对话的 API 流并行执行，因此约 1 秒的延迟会被主模型流式输出所掩盖，用户无感知。

| 维度             | Claude Code                                                           | Qwen Code                                                                                  |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 触发时机         | `query.ts` — 工具批次完成后                             | `useGeminiStream.ts` → `handleCompletedTools` — 相同的生命周期节点                       |
| 生成模型      | 通过 `queryHaiku` 调用 Haiku                                                | 通过 `GeminiClient.generateContent` 调用配置的 `fastModel`                                  |
| 子代理行为     | `!toolUseContext.agentId` — 仅限主会话                         | 隐式处理 — 子代理通过 `agents/runtime/` 运行，不经过 `useGeminiStream`                  |
| 调度方式            | Fire-and-forget，在下一轮流式输出前 await    | Fire-and-forget，解析完成后追加到历史记录                                         |
| 输出结构          | 将 `ToolUseSummaryMessage` yield 到 SDK 流中                   | 将 `HistoryItemToolUseSummary` 添加到 UI 历史记录 + 导出 factory 供未来 SDK 使用      |
| 功能开关                  | `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES` 环境变量，默认 **关闭**            | `experimental.emitToolUseSummaries` 配置项（默认 **开启**）+ 环境变量覆盖                |
| 主要消费者      | 移动端 / SDK 客户端                                                  | CLI 紧凑模式 + 完整模式，未来 SDK                                                   |
| Prompt                | Git commit subject 风格，过去时，提取最具区分度的名词（直接移植） | 相同的 system prompt                                                                    |
| 输入截断      | 通过 `truncateJson` 每个工具字段截断至 300 字符                           | 相同                                                                                  |
| 意图前缀         | 助手最后一条消息的前 200 个字符                       | 相同                                                                                  |
| Prompt 缓存        | Haiku 调用设置 `enablePromptCaching: true`                         | 尚未接入（已提供 forked-agent 路由；标记为后续优化）               |
| 标签后处理 | 原始模型输出文本                                                        | `cleanSummary`（移除 markdown、引号、错误前缀；限制 100 字符，防 ReDoS） |
| 会话持久化   | 仅限流式传输；每次会话重新生成                                 | 仅限 UI 历史记录；`ChatRecordingService` 不持久化 `tool_use_summary` 条目        |

## 2. Claude Code 实现分析

### 2.1 执行流程

Claude Code 在 `query.ts` 中运行工具循环。工具批次执行完毕且结果标准化后，生成器函数会 fork 一个 Haiku 调用，将 pending promise 保存在 `nextPendingToolUseSummary` 上，并继续发起下一轮的 API 调用。Haiku 的延迟（约 1 秒）与主模型的流式输出（5–30 秒）重叠，因此用户感知不到额外延迟。在输出下一轮内容之前，生成器会 await 该摘要 promise，并将 `tool_use_summary` 消息 yield 到流中。

```
tool_batch_complete → fork queryHaiku (fire-and-forget)
                          ↓
               next_turn_stream_starts
                          ↓
       ← summary Promise resolves during streaming →
                          ↓
       await pendingToolUseSummary → yield ToolUseSummaryMessage
                          ↓
                continue with next turn
```

### 2.2 核心源文件

| 组件       | 文件                                                       | 核心逻辑                                                                               |
| --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 生成器       | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97` | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })` |
| 触发点         | `query.ts:1411-1482`                                       | 通过 `emitToolUseSummaries` 开关守卫 + 排除子代理；fork Haiku；传递 promise           |
| Await + 输出    | `query.ts:1055-1060`                                       | 在下一轮边界 await `pendingToolUseSummary`，yield 消息                      |
| 消息工厂 | `utils/messages.ts:5105-5116`                              | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                             |
| 功能开关    | `query/config.ts:23,36-38`                                 | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                |

### 2.3 设计决策

1. **只要开关开启就始终生成，与紧凑/详细状态无关。** 摘要是流级别的产物；是否渲染由 UI 决定。
2. **作为一等消息类型输出。** `tool_use_summary` 与 `user`、`assistant`、`tool_result` 并列存在于 SDK 流中，并附带 `precedingToolUseIds` 字段，供消费者与批次进行关联。
3. **排除子代理。** `!toolUseContext.agentId` — 子代理输出已在上游聚合；单独为子代理批次生成标签会产生大量噪声，且不会在主 UI 中展示。
4. **默认关闭。** 仅依赖环境变量的开关确保成本为零，除非下游 SDK 消费者主动启用。CC 终端本身不渲染该消息。
5. **每个字段输入截断至 300 字符。** 规避了主要成本风险（单个大型工具结果撑爆 prompt），同时保留了生成标签所需的足够信号。

## 3. Qwen Code 实现

### 3.1 执行流程

Qwen Code 钩住了相同的生命周期节点（`useGeminiStream.handleCompletedTools`），但在 `ui.compactMode` 的两种状态下均进行渲染，因此 CLI 用户无需任何 SDK 集成即可直接使用该功能。

```
tool_batch_complete (handleCompletedTools)
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   fork generateToolUseSummary (fire-and-forget)
           ↓
  submitQuery() for next turn (streaming starts)
           ↓
   ← summary Promise resolves during streaming →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay renders:
    compactMode=false → ● <label> standalone line
    compactMode=true  → hidden; MainContent lookup injects into CompactToolGroupDisplay header
```

### 3.2 核心源文件

| 组件           | 文件                                                                  | 核心逻辑                                                                 |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 服务             | `packages/core/src/services/toolUseSummary.ts`                        | `generateToolUseSummary`、`truncateJson`、`cleanSummary`、消息工厂 |
| 配置开关         | `packages/core/src/config/config.ts:getEmitToolUseSummaries`          | 环境变量覆盖 → 设置项 → 默认值 (true)                                  |
| 触发点             | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`   | 发起快速模型调用，解析后调用 addItem                                 |
| 完整模式渲染    | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`               | 当 `!compactMode` 时渲染 `● <label>` 行                              |
| 紧凑模式查找 | `packages/cli/src/ui/components/MainContent.tsx`                      | `summaryByCallId` 映射 → 向每个 tool_group 传递 `compactLabel` prop            |
| 紧凑模式标题      | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | 存在标签时，将默认的 `Tool × N` 替换为 `<Summary> · N tools` |
| 合并处理      | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                 | 将 `tool_use_summary` 视为紧凑模式下隐藏项以处理相邻逻辑              |
| UI 类型             | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`              | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`              |

### 3.3 `<Static>` 的仅追加（append-only）约束

本 PR 的核心架构决策在于：**为什么完整模式下的标签是一个独立的历史记录项，而不是直接作为 tool_group 的装饰？**

Qwen Code 通过 Ink 的 `<Static>` 渲染终端输出。Static 是仅追加的：一旦条目提交到终端缓冲区，除非调用 `refreshStatic()` 清空并重新渲染整个输出，否则 Ink 不会重绘该区域。这是 CLI 依赖的性能模型——静态条目不会在每次按键时重新渲染。

现在考虑快速模型调用的时序：

```
T0   tool batch completes, tool_group is pushed to history
T0+ε tool_group renders through <Static> and is committed to the buffer
T0+1s fast-model call resolves with a label
```

在 T0+1s 时，我们无法回溯地将标签添加到已提交的 tool_group 中。存在两种方案：

1. **更新 tool_group 的 props 并调用 `refreshStatic()`。** 可行，但会导致每个批次都触发完整输出重绘——这是应用中最昂贵的 UI 操作之一。会产生可见闪烁。对于纯装饰性标签来说不可接受。
2. **将摘要作为独立的新历史记录项追加到 tool_group _之后_。** Static 原生支持此行为——新条目干净地追加，无需重绘。

本 PR 在完整模式下采用方案 2。`tool_use_summary` 条目是一个真实的历史记录项，由 `HistoryItemDisplay` 渲染为单行灰色 `● <label>`。无需调用 `refreshStatic`。

紧凑模式则不同，因为存在 `mergeCompactToolGroups`。当连续的 tool_group 合并时，`MainContent` 已经会调用 `refreshStatic()`——这是一条现有代码路径，它会使用从历史记录中查找到的标签重新渲染合并后的组。因此紧凑模式确实会将标签作为标题替换。为了避免重复渲染同一标签（一次作为紧凑标题，一次作为尾部的 `● <label>` 行），当 `compactMode` 为 true 时，`HistoryItemDisplay` 会隐藏该独立行。

```
Full mode              Compact mode (with merge)
───────────            ─────────────────────────
[tool_group]           [merged tool_group — header replaced via lookup]
● <label>              (● <label> line is hidden)
```

### 3.4 开关语义

共三层，按优先级顺序解析：

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` — 环境变量覆盖，优先级最高。
2. `settings.json` 中的 `experimental.emitToolUseSummaries` — 默认 `true`。
3. 隐式跳过 — 如果 `config.getFastModel()` 返回 `undefined`，无论开关状态如何均跳过生成。不会报错，用户界面无变化。

### 3.5 输出清洗

`cleanSummary` 每次模型响应在加入历史记录前都会经过处理：

1. 仅取第一行（丢弃模型的推理前言）。
2. 移除列表前缀（`-`、`*`、`•`）——模型有时会将标签作为列表项返回。
3. 通过限定 `{1,10}` 的正则移除周围的引号/反引号（符合 CodeQL 安全规范；实际标签不会包含大量包裹引号）。
4. 移除部分模型添加的前缀标签（`Label:`、`Summary:`、`Result:`、`Output:`）。
5. 拒绝错误消息格式（`API error: ...`、`Error: ...`、`I cannot ...`、`I can't ...`、`Unable to ...`）——返回空字符串，不添加历史记录项。
6. 硬性限制长度为 100 个字符（移动端 UI 约在 30 字符处截断；预留空间用于兼容 CJK 短语）。

### 3.6 遥测数据

摘要生成调用会设置 `promptId: 'tool_use_summary_generation'`，以便其 token 消耗在 `/stats` 中单独统计。这使得用户能够清晰查看该功能的精确增量成本，而不会与 prompt 建议或主会话的消耗混淆。

## 4. 与 Claude Code 的差异（及原因）

| 差异点                                                                | 原因                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 在环境变量开关之外增加了设置层                                   | Qwen Code 在 CLI 中渲染标签；用户需要持久化的开关，而非每次打开 shell 都导出环境变量。                                                                                     |
| 默认 **开启** 而非关闭                                            | 标签在两种显示模式下均对用户可见；配置了 `fastModel` 的用户本身就已经启用了快速模型功能。                                                     |
| 专用的 `cleanSummary` 后处理                                 | Qwen Code 支持的模型提供商比 CC 更多样；部分模型会添加 `Label:` 前缀或用引号包裹。在边界处进行规范化可保持 UI 一致性。                           |
| 存储 `HistoryItemToolUseSummary` 而非输出流消息 | 优先面向 CLI 的实现；SDK 流式输出路线将在后续 PR 中处理。`ToolUseSummaryMessage` 工厂函数已导出，为后续工作预留。                                                   |
| 尚未接入 Prompt 缓存                                             | 对于未配置独立快速模型的用户，快速模型通常与主模型相同。添加缓存共享需要通过 `forkedAgent.ts` 路由；已列为后续跟进项。 |
| 双渲染路径（完整模式行内 + 紧凑模式标题）               | Qwen Code 默认 `ui.compactMode: false`；如果没有完整模式的行内渲染，大多数用户将无法看到该功能。                                                      |

## 5. 已知限制

- **无会话持久化。** `tool_use_summary` 不会写入聊天记录的 JSONL 文件。恢复会话时会丢失标签；工具组将回退渲染为通用标题。低优先级：随着用户继续会话，标签会自然重新生成。
- **尚未输出到 SDK 流。** 消息工厂已导出，但 CLI 尚未将 `tool_use_summary` 传入 SDK 桥接层。将在后续 PR 中处理。
- **无 Prompt 缓存。** 每个批次都会产生新的 input token 成本。绝对值可忽略不计（约 300 token），但如果每轮运行数十个批次则较为明显。
- **合并的紧凑组摘要仅选取首个批次的标签。** 如果用户连续触发十个不相似的批次（紧密循环，非典型场景），合并后的紧凑标题将仅显示首个批次的意图。已接受此权衡：在合并视图中展开每个批次的标签会造成视觉干扰，不如直接取首个。
- **必须配置快速模型。** 若未配置 `fastModel`，则跳过生成。故意禁止回退到主模型，以控制成本边界。

## 6. 后续工作

1. 将 `ToolUseSummaryMessage` 接入 SDK 桥接层，使现有工厂函数能在下游被调用。
2. 通过 `forkedAgent.ts` 路由生成请求并启用 `enablePromptCaching`，使重复的工具名称前缀能够命中提供商缓存。
3. 可选：将 `tool_use_summary` 条目持久化到 `ChatRecordingService`，并在会话恢复时重放。
4. 可选：基于工具名称的标签快捷方式（例如，单次 `read_file` 调用始终显示 `Read <filename>`），作为 LLM 调用前的快速路径。