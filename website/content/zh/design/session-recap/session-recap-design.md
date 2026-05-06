# 会话回顾设计

> 当用户返回空闲会话时（通过按需触发 `/recap` 或终端失去焦点超过 5 分钟后），会显示一段简短的（1-2 句）“上次进行到哪了”摘要。

## 概述

当用户几天后 `/resume` 一个旧会话时，需要翻阅大量历史记录才能想起**自己之前在做什么以及接下来该做什么**，这是一个明显的体验痛点。仅重新加载消息无法解决此 UX 问题。

目标是在用户返回时主动展示一段 1-2 句的简短回顾：

- **高层级任务**（正在做什么）→ **下一步**（接下来做什么）。
- 视觉上与真实的助手回复区分开，确保不会被误认为是新的模型输出。
- **尽力而为**：失败时必须静默处理，绝不中断主流程。

## 触发条件

| 触发方式 | 条件 | 实现 |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **手动** | 用户运行 `/recap` | `recapCommand.ts` 调用相同的底层服务 |
| **自动** | 终端失去焦点（DECSET 1004 焦点协议）≥ 5 分钟 + 重新获得焦点 + 流状态为 `Idle` | `useAwaySummary.ts` — 5 分钟失焦计时器 + `useFocus` 事件监听器 |

两条路径最终都会汇入同一个函数 `generateSessionRecap()`，以确保行为完全一致。自动触发受 `general.showSessionRecap` 配置控制（默认关闭——需显式开启，避免静默产生 LLM 调用费用）；手动命令则忽略该设置。

## 架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ 5 分钟失焦计时器 + 空闲/去重门控                     │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand（斜杠命令） ─→ generateSessionRecap(config, signal) │
│                                          │                             │
│                                          ↓                             │
│                              ┌─────────────────────────┐               │
│                              │ packages/core/services/ │               │
│                              │   sessionRecap.ts       │               │
│                              └─────────────────────────┘               │
│                                          │                             │
│                                          ↓                             │
│                              GeminiClient.generateContent              │
│                              (fastModel + tools:[])                    │
│                                                                        │
│   addItem({type: 'away_recap', text}) ─→ HistoryItemDisplay            │
│       └─ AwayRecapMessage 像其他历史项一样内联渲染（※ + 粗体 "recap: " + 斜体内容，全部置灰）；
│         随对话自然滚动。对标 Claude Code 的 away_summary 系统消息。    │
└────────────────────────────────────────────────────────────────────────┘
```

### 文件

| 文件 | 职责 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts` | 单次 LLM 调用 + 历史过滤 + 标签提取 |
| `packages/cli/src/ui/hooks/useAwaySummary.ts` | 自动触发 React Hook |
| `packages/cli/src/ui/commands/recapCommand.ts` | `/recap` 手动入口 |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | `AwayRecapMessage` 渲染器（`※` + 粗体 `recap:` + 斜体内容，全部置灰） |
| `packages/cli/src/ui/types.ts` | `HistoryItemAwayRecap` 类型 |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx` | 将 `away_recap` 历史项分发至渲染器 |
| `packages/cli/src/config/settingsSchema.ts` | `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` 配置 |

## Prompt 设计

### 系统 Prompt

`generationConfig.systemInstruction` 在此单次调用中会替换主 Agent 的系统 Prompt，使模型仅作为回顾生成器运行，而非编程助手。

注意，`GeminiClient.generateContent()` 内部会通过 `getCustomSystemPrompt()` 处理 Prompt，并将用户的记忆（`QWEN.md` / 托管自动记忆）作为后缀追加。因此最终的系统 Prompt 为 `回顾 Prompt + 用户记忆`——这为回顾提供了有用的项目上下文，而非信息泄露。

以下要点与 `RECAP_SYSTEM_PROMPT` 一一对应：

- 不超过 40 个单词，1-2 句纯文本（无 Markdown / 列表 / 标题）。中文场景下，总字数预算约为 80 个字符。
- 第一句：高层级任务。随后：具体的下一步操作。
- 明确禁止：罗列已完成事项、复述工具调用、输出状态报告。
- 匹配对话的主要语言（英文或中文）。
- 输出必须包裹在 `<recap>...</recap>` 中；标签外不得包含任何内容。

### 结构化输出与提取

模型被要求将答案包裹在 `<recap>...</recap>` 中：

```
<recap>Refactoring loopDetectionService.ts to address long-session OOM. Next step is to implement option B.</recap>
```

原因：部分模型（如 GLM 系列、推理模型）会在最终答案前输出一段“思考”过程。直接返回原始文本会将这些推理内容泄露到 UI 中。

`extractRecap()` 包含三个降级回退层级：

1. 双标签完整：提取 `<recap>...</recap>` 之间的内容（首选）。
2. 仅存在开标签（例如 `maxOutputTokens` 截断了闭标签）：提取开标签之后的所有内容。
3. 标签完全缺失：返回空字符串 → 服务返回 `null` → UI 不渲染任何内容。

第三层级的原则是“宁可跳过也不显示错误内容”——展示模型的推理前缀比完全不显示回顾更糟糕。

### 调用参数

| 参数 | 值 | 原因 |
| ------------------- | ------------------------------ | ----------------------------------------------------- |
| `model` | `getFastModel() ?? getModel()` | 回顾无需使用前沿模型 |
| `tools` | `[]` | 单次查询，无需使用工具 |
| `maxOutputTokens` | `300` | 为 1-2 个短句及标签预留空间 |
| `temperature` | `0.3` | 保持较高确定性，同时允许少量自然变化 |
| `systemInstruction` | 上述仅用于回顾的 Prompt | 替换主 Agent 的角色定义 |

## 历史过滤

`geminiClient.getChat().getHistory()` 返回的 `Content[]` 包含：

- `user` / `model` 文本消息
- `model` 的 `functionCall` 部分
- `user` 的 `functionResponse` 部分（可能包含完整文件内容）
- `model` 的 thought 部分（`part.thought` / `part.thoughtSignature`，模型的隐藏推理）

`filterToDialog()` 仅保留**文本非空且非 thought** 的 `user` / `model` 部分。原因有二：

- **工具调用/响应**：单个 `functionResponse` 可能超过 10K token。30 条此类消息会让回顾 LLM 淹没在无关细节中，既浪费 token，又会使回顾偏向“调用 X 工具读取 Y 文件”等实现噪音。
- **Thought 部分**：包含模型的内部推理。将其纳入可能导致将隐藏的思维链误认为对话内容，并在回顾文本中泄露。

剔除空消息后，`takeRecentDialog` 会截取最后 30 条消息，并拒绝以悬空的 model/tool 响应作为切片起点。

## 并发与边界情况

### 自动触发 Hook 状态机

`useAwaySummary` 维护三个 ref：

| Ref | 含义 |
| ----------------- | ------------------------------------------------- |
| `blurredAtRef` | 失焦开始时间（直到重新获得焦点前不会清除） |
| `recapPendingRef` | 是否有 LLM 调用正在进行中 |
| `inFlightRef` | 当前进行中的 `AbortController` |

`useEffect` 依赖项：`[enabled, config, isFocused, isIdle, addItem, thresholdMs]`。

| 事件 | 动作 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config` | 中止进行中的调用 + 清除 `inFlightRef` + 清除 `blurredAtRef` |
| `!isFocused` 且 `blurredAtRef === null` | 设置 `blurredAtRef = Date.now()` |
| `isFocused` 且 `blurredAtRef === null` | 提前返回（无需处理失焦周期——首次渲染或短暂失焦重置后） |
| `isFocused` 且失焦时长 < 5 分钟 | 清除 `blurredAtRef`，等待下一次失焦周期 |
| `isFocused` 且失焦 ≥ 5 分钟且 `recapPendingRef` 为真 | 返回（去重） |
| `isFocused` 且失焦 ≥ 5 分钟且 `!isIdle` | **保留** `blurredAtRef` 并等待当前轮次结束（`isIdle` 在依赖项中，流式传输完成后 effect 会重新触发） |
| `isFocused` 且失焦 ≥ 5 分钟且 `shouldFireRecap` 返回 false | 清除 `blurredAtRef` 并返回——自上次回顾以来对话进展不足（需至少 2 轮用户交互，对标 Claude Code） |
| `isFocused` 且满足所有条件 | 清除 `blurredAtRef`，设置 `recapPendingRef = true`，创建 `AbortController`，发送 LLM 请求 |

`.then` 回调会**重新检查** `isIdleRef.current`：如果用户在 LLM 运行期间开启了新轮次，延迟到达的回顾将被丢弃，以避免插入到轮次中间。

`.finally` 会清除 `recapPendingRef`，且仅在 `inFlightRef.current === controller` 时清除 `inFlightRef`（避免覆盖更新的 controller）。

第二个 `useEffect` 会在组件卸载时中止进行中的 controller。

### `/recap` 门控

`CommandContext.ui.isIdleRef` 暴露当前流状态（沿用现有的 `btwAbortControllerRef` 模式）。在交互模式下，若 `!isIdleRef.current` 或 `pendingItem !== null`，`recapCommand` 将拒绝执行。仅检查 `pendingItem` 是不够的，因为正常的模型回复在运行时 `streamingState === Responding` 且 `pendingItem` 为 null。

## 配置与模型选择

### 用户可配置项

| 配置项 | 默认值 | 说明 |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `general.showSessionRecap` | `false` | 仅控制自动触发。手动 `/recap` 忽略此设置。 |
| `general.sessionRecapAwayThresholdMinutes` | `5` | 自动回顾在重新获得焦点前所需的失焦分钟数。与 Claude Code 默认值一致。 |
| `fastModel` | 未设置 | 推荐配置（如 `qwen3-coder-flash`），用于快速且低成本的回顾。 |

### 模型降级

`config.getFastModel() ?? config.getModel()`：

- 用户已设置 `fastModel` 且对当前认证类型有效 → 使用 `fastModel`。
- 否则 → 降级至主会话模型（可用，但成本更高且速度更慢）。

## 可观测性

`createDebugLogger('SESSION_RECAP')` 会输出：

- 回顾路径中捕获的异常（`debugLogger.warn`）。

所有失败对用户完全透明——回顾是辅助功能，绝不会向 UI 抛出错误。开发者可在调试日志文件中 grep `[SESSION_RECAP]` 标签：默认写入 `~/.qwen/debug/<sessionId>.txt`（`latest.txt` 软链接指向当前会话）；可通过 `QWEN_DEBUG_LOG_FILE=0` 禁用。

## 不在本次范围

| 项目 | 原因 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/recap` 的进度 UI（加载动画 / `pendingItem`） | 3-5 秒的等待时间可接受；增加复杂度。 |
| 自动化测试 | 服务代码量较小（约 150 行），优先进行手动端到端测试；单元测试可在后续 PR 中补充。 |
| 本地化 Prompt | 系统 Prompt 面向模型；英文是最可靠的基础语言。模型会根据对话自动选择输出语言。 |
| `QWEN_CODE_ENABLE_AWAY_SUMMARY` 环境变量 | Claude Code 用它来在遥测禁用时保持功能开启；Qwen Code 当前的遥测模型无需此机制。 |
| `/resume` 完成后的自动回顾 | 合理的后续功能，但需要在 `useResumeCommand` 中接入钩子；不在本 PR 范围内。 |