# 工具使用摘要设计

> 并行工具批次的快速模型标签——动机、与 Claude Code 的竞品分析、架构，以及驱动当前完整模式渲染的仅追加-静态(append-only-Static)方案决策依据。
>
> 用户文档：[工具使用摘要](../../users/features/tool-use-summaries.md)。

## 1. 执行摘要

每批工具执行完毕后，Qwen Code 会发起一次快速的模型调用，返回一个类似 Git 提交主题的标签来总结该批次。该标签在完整模式下以一行内联的灰色 `● <label>` 显示，在紧凑模式下替代通用的 `Tool × N` 头部。生成过程以“发射后不管”(fire-and-forget)方式与下一轮的 API 流并行执行，因此其约 1 秒的延迟被主模型的流式输出所掩盖。

| 维度               | Claude Code                                                            | Qwen Code                                                                                  |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 触发点             | `query.ts` — 工具批次最终确定后                                        | `useGeminiStream.ts` → `handleCompletedTools` — 相同生命周期点                             |
| 生成模型           | 通过 `queryHaiku` 调用 Haiku                                           | 通过 `GeminiClient.generateContent` 调用已配置的 `fastModel`                               |
| 子代理行为         | `!toolUseContext.agentId` — 仅限主会话                                 | 隐式 — 子代理通过 `agents/runtime/` 运行，不经过 `useGeminiStream`                         |
| 调度方式           | 发射后不管，在下一轮流输出前等待                                       | 发射后不管，解析后追加到历史记录                                                           |
| 输出形状           | `ToolUseSummaryMessage` 注入到 SDK 流中                                | `HistoryItemToolUseSummary` 添加到 UI 历史记录 + 工厂函数已导出供未来 SDK 使用              |
| 开关               | `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES` 环境变量，默认 **关闭**          | `experimental.emitToolUseSummaries` 配置项（默认 **开启**）+ 环境变量覆盖                  |
| 主要消费者         | 移动端 / SDK 客户端                                                    | CLI 紧凑模式 + 完整模式，未来 SDK                                                          |
| 提示词             | Git 提交主题风格，过去时，最具区分度的名词（逐字移植）                  | 相同的系统提示词                                                                           |
| 输入截断           | 通过 `truncateJson` 每工具字段 300 字符                                | 相同                                                                                       |
| 意图前缀           | 助手最后一条消息的前 200 个字符                                        | 相同                                                                                       |
| 提示词缓存         | Haiku 调用上启用 `enablePromptCaching: true`                           | 尚未接入（存在分叉代理路径；标记为未来优化项）                                             |
| 标签后处理         | 模型原始文本                                                           | `cleanSummary`（去除 markdown、引号、错误前缀；上限 100 字符，ReDoS 边界受限）             |
| 会话持久化         | 仅流式处理；每个会话重新生成                                           | 仅 UI 历史；`ChatRecordingService` 不持久化 `tool_use_summary` 条目                        |

## 2. Claude Code 实现分析

### 2.1 流程

Claude Code 在 `query.ts` 中运行工具循环。工具批次执行完毕且结果标准化后，生成器函数会分叉一次 Haiku 调用，将待定的 Promise 保存在 `nextPendingToolUseSummary`，然后继续下一轮的 API 调用。Haiku 延迟（约 1 秒）与主模型流式输出（5–30 秒）重叠，因此用户感知不到额外延迟。在即将发出下一轮内容之前，生成器会等待待定的摘要，并将 `tool_use_summary` 消息注入流中。

```
工具批次完成 → 分叉 queryHaiku（发射后不管）
                    ↓
         下一轮流开始
                    ↓
   ← 摘要 Promise 在流式输出期间解析 →
                    ↓
   await pendingToolUseSummary → 产生 ToolUseSummaryMessage
                    ↓
          继续下一轮处理
```

### 2.2 关键源文件

| 组件             | 文件                                                              | 关键逻辑                                                                                       |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 生成器           | `services/toolUseSummary/toolUseSummaryGenerator.ts:45-97`        | `generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText })`        |
| 触发点           | `query.ts:1411-1482`                                              | 由 `emitToolUseSummaries` 开关 + 非子代理守卫；分叉 Haiku；携带 Promise                        |
| 等待并发射       | `query.ts:1055-1060`                                              | 在下一轮边界处等待 `pendingToolUseSummary`，产生消息                                            |
| 消息工厂         | `utils/messages.ts:5105-5116`                                     | `createToolUseSummaryMessage(summary, precedingToolUseIds)`                                    |
| 特性开关         | `query/config.ts:23,36-38`                                        | `emitToolUseSummaries: isEnvTruthy(CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES)`                       |

### 2.3 设计决策

1. **开关开启时始终生成，不受紧凑/详细模式影响。** 摘要是流级别的产物；UI 决定是否渲染。
2. **作为一等消息类型发射。** `tool_use_summary` 与 `user`、`assistant`、`tool_result` 并列在 SDK 流中，并带有 `precedingToolUseIds` 字段供消费者关联到相应批次。
3. **排除子代理。** `!toolUseContext.agentId` — 子代理的输出在上游聚合；单个子代理的批次会产生噪音标签，不会出现在主 UI 中。
4. **默认关闭。** 仅通过环境变量开关，确保没有下游 SDK 消费者选择开启时成本为零。Claude Code 终端本身不渲染该消息。
5. **每个字段输入截断为 300 字符。** 覆盖主要成本风险——单个大型工具结果导致提示词膨胀——同时保留足够信号用于生成标签。

## 3. Qwen Code 实现

### 3.1 流程

Qwen Code 在相同的生命周期点（`useGeminiStream.handleCompletedTools`）进行挂接，但在 `ui.compactMode` 两侧都进行渲染，因此该特性无需任何 SDK 管线就对 CLI 用户可见。

```
工具批次完成（handleCompletedTools）
           ↓
  config.getEmitToolUseSummaries()?
           ↓
   分叉 generateToolUseSummary（发射后不管）
           ↓
  submitQuery() 进入下一轮（流式输出开始）
           ↓
   ← 摘要 Promise 在流式输出期间解析 →
           ↓
  addItem({type:'tool_use_summary', summary, precedingToolUseIds})
           ↓
  HistoryItemDisplay 渲染：
    compactMode=false → ● <label> 独立行
    compactMode=true  → 隐藏；MainContent 查找并注入到 CompactToolGroupDisplay 头部
```

### 3.2 关键源文件

| 组件               | 文件                                                                 | 关键逻辑                                                               |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 服务               | `packages/core/src/services/toolUseSummary.ts`                       | `generateToolUseSummary`、`truncateJson`、`cleanSummary`、消息工厂     |
| 配置开关           | `packages/core/src/config/config.ts:getEmitToolUseSummaries`         | 环境变量覆盖 → 设置项 → 默认（true）                                   |
| 触发点             | `packages/cli/src/ui/hooks/useGeminiStream.ts:handleCompletedTools`  | 发起快速模型调用，解析后执行 addItem                                   |
| 完整模式渲染       | `packages/cli/src/ui/components/HistoryItemDisplay.tsx`              | 当 `!compactMode` 时渲染 `● <label>` 行                               |
| 紧凑模式查找       | `packages/cli/src/ui/components/MainContent.tsx`                     | `summaryByCallId` 映射 → 为每个 tool_group 提供 `compactLabel` 属性    |
| 紧凑头部           | `packages/cli/src/ui/components/messages/CompactToolGroupDisplay.tsx` | 当有标签时，用 `<Summary> · N tools` 替换默认的 `Tool × N`            |
| 合并处理           | `packages/cli/src/ui/utils/mergeCompactToolGroups.ts`                | 将 `tool_use_summary` 视为紧凑模式下隐藏的相邻项处理                   |
| UI 类型            | `packages/cli/src/ui/types.ts:HistoryItemToolUseSummary`             | `{ type: 'tool_use_summary', summary, precedingToolUseIds }`           |

### 3.3 `<Static>` 仅追加约束

本 PR 的核心架构决策是：**为什么完整模式下的标签是一个独立的历史条目，而不是 tool_group 本身的修饰项**。

Qwen Code 通过 Ink 的 `<Static>` 渲染转录内容。Static 是仅追加的：一旦某个条目被提交到终端缓冲区，Ink 不会重新绘制该区域，除非调用 `refreshStatic()` 清除并重新渲染整个转录内容。CLI 依赖这种性能模型——静态条目不会在每次按键时重新渲染。

现在考虑快速模型调用的时间点：

```
T0   工具批次完成，tool_group 被推入历史记录
T0+ε tool_group 通过 <Static> 渲染并提交到缓冲区
T0+1s 快速模型调用解析，返回标签
```

在 T0+1s 时，我们无法追溯性地将标签添加到已提交的 tool_group 中。存在两种选择：

1. **更新 tool_group 的属性并调用 `refreshStatic()`。** 可行，但会导致每次批次都进行完整的转录内容重绘——这是应用中成本最高的 UI 操作之一。会出现明显的闪烁。对于一个装饰性标签来说不可接受。
2. **将摘要渲染为自身的新历史条目，追加在 tool_group _之后_。** Static 原生支持这一点——新条目干净地追加，无需重绘。

本 PR 在完整模式下采用选项 2。`tool_use_summary` 条目是一个真实的历史条目，由 `HistoryItemDisplay` 渲染为一行灰色的 `● <label>`。无需 `refreshStatic`。

紧凑模式则不同，因为涉及 `mergeCompactToolGroups`。当连续的 tool_groups 合并时，`MainContent` 已经调用了 `refreshStatic()`——这是一个现有的代码路径，它会重新渲染合并后的组，并从历史记录中查找标签。因此紧凑模式*确实*将标签作为头部替换显示。为了避免标签重复渲染（一次作为紧凑头部，一次作为尾随的 `● <label>` 行），`HistoryItemDisplay` 在 `compactMode` 为 true 时隐藏独立行。

```
完整模式               紧凑模式（合并后）
───────────           ─────────────────────────
[tool_group]          [合并的 tool_group — 通过查找替换头部]
● <label>             （● <label> 行被隐藏）
```

### 3.4 开关语义

三层，按优先级顺序解析：

1. `QWEN_CODE_EMIT_TOOL_USE_SUMMARIES=0|1|true|false` — 环境变量覆盖，最高优先级。
2. `settings.json` 中的 `experimental.emitToolUseSummaries` — 默认 `true`。
3. 隐式跳过 — 如果 `config.getFastModel()` 返回 `undefined`，无论开关如何都跳过生成。不会报错，用户无感知。

### 3.5 输出清理

`cleanSummary` 在每个模型响应添加到历史记录之前运行：

1. 仅取第一行（丢弃模型推理前言）。
2. 去除项目符号前缀（`-`、`*`、`•`）——模型有时会将标签作为列表项返回。
3. 通过受限的 `{1,10}` 正则表达式去除包裹的引号/反引号（CodeQL 安全；实际标签不会有多余的包裹引号）。
4. 去除某些模型前缀标签（`Label:`、`Summary:`、`Result:`、`Output:`）。
5. 拒绝错误消息形状（`API error: ...`、`Error: ...`、`I cannot ...`、`I can't ...`、`Unable to ...`）——返回空字符串，因此不添加历史条目。
6. 硬性长度上限 100 字符（移动端 UI 截断约 30 字符；余量覆盖中英文短语）。

### 3.6 遥测

摘要生成调用设置 `promptId: 'tool_use_summary_generation'`，因此其 token 用量在 `/stats` 中单独统计。这使用户能够看到该特性的确切增量成本，而不会与提示建议或主会话的用量混淆。

## 4. 与 Claude Code 的差异（及原因）

| 差异                                                                  | 原因                                                                                                                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 在环境变量开关之外增加了设置层                                        | Qwen Code 在 CLI 中渲染标签；用户需要一个持久化的开关，而不是每次 shell 的导出变量。                                                                                                     |
| 默认开启而非关闭                                                      | 标签在两种显示模式下均立即可见；配置了 `fastModel` 的用户已经选择了使用快速模型特性。                                                                                                   |
| 专门的 `cleanSummary` 后处理                                          | Qwen Code 支持比 CC 更多样化的提供商；某些模型会添加 `Label:` 前缀或包裹引号。在边界进行标准化可保持 UI 一致。                                                                          |
| 存储 `HistoryItemToolUseSummary` 而非发射流消息                       | 优先 CLI 实现；SDK 流路径是未来的 PR。`ToolUseSummaryMessage` 工厂已为此工作导出。                                                                                                      |
| 尚未接入提示词缓存                                                    | 未配置独立快速模型的用户，快速模型通常与主模型相同。添加缓存共享需要通过 `forkedAgent.ts` 路由；已跟踪为后续任务。                                                                       |
| 双渲染路径（完整模式内联 + 紧凑模式头部）                             | Qwen Code 的默认设置为 `ui.compactMode: false`；没有完整模式的内联渲染，该特性对大多数用户不可见。                                                                                      |

## 5. 已知限制

- **无会话持久化。** `tool_use_summary` 不会写入聊天记录 JSONL。恢复会话会丢失标签；工具组将使用通用头部作为后备。低优先级：标签会随着用户继续会话而自然重新生成。
- **尚未支持 SDK 流发射。** 消息工厂已导出，但 CLI 尚未将 `tool_use_summary` 提供给 SDK 桥接。后续 PR 处理。
- **无提示词缓存。** 每批都会产生新的输入 token 成本。绝对数值很小（约 300 tokens），但如果每轮运行数十个批次则会有可测量的影响。
- **合并紧凑组时，摘要取第一个贡献批次的标签。** 如果用户连续触发十个不相似的批次（紧密循环，非典型场景），合并后的紧凑头部将只显示第一个批次的意图。这是一个可接受的权衡：在合并视图中为每个批次展开标签比只取第一个在视觉上更杂乱。
- **需要快速模型。** 如果没有配置 `fastModel`，则跳过生成。故意不允许回退到主模型，以控制成本范围。

## 6. 未来工作

1. 将 `ToolUseSummaryMessage` 接入 SDK 桥接，使现有工厂在下游得到使用。
2. 通过 `forkedAgent.ts` 路由生成，并启用 `enablePromptCaching`，使重复的工具名称前缀能命中提供商缓存。
3. 可选：将 `tool_use_summary` 条目持久化到 `ChatRecordingService`，并在会话恢复时回放。
4. 可选：针对单个工具调用（例如单个 `read_file` 调用始终生成 `Read <filename>`）实现按工具名称的标签快捷方式，作为 LLM 前的快速路径。