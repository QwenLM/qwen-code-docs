# 会话回顾设计

> 当用户回到一个空闲的会话时，无论是通过手动 (`/recap`) 还是终端失去焦点超过 5 分钟后，系统会显示一条简短的（1-2 句话）“我从哪里离开”的摘要。

## 概述

当用户在几天后 `/resume` 一个旧的会话时，往回翻阅大量历史记录去回想**他们当时在做什么以及下一步该做什么**是一个真正的痛点。仅仅重新加载消息并不能解决这个 UX 问题。

目标是在用户返回时主动显示一条简短的 1-2 句话的回顾：

- **高层任务**（他们在做什么）→ **下一步**（接下来做什么）。
- 在视觉上与真实的助手回复区分开来，以免被误认为是新的模型输出。
- **尽力而为**：失败必须静默处理，绝不能中断主流程。

## 触发方式

| 触发方式   | 条件                                                                                     | 实现方式                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **手动**    | 用户运行 `/recap`                                                                         | `recapCommand.ts` 调用相同的底层服务                                                                                                              |
| **自动**    | 终端失去焦点（DECSET 1004 焦点协议）≥ 5 分钟 + 焦点回归 + 流状态为 `Idle`                       | `useAwaySummary.ts` — 5 分钟失焦定时器 + `useFocus` 事件监听器                                                                                  |
| **守护进程 HTTP** | 远程客户端调用 `POST /session/:id/recap`                                                   | `server.ts` 路由 → `bridge.generateSessionRecap` (ext-method roundtrip) → `acpAgent.ts` 调用 `generateSessionRecap(session.getConfig(), signal)` |

所有三条路径都汇聚到 `core/services/sessionRecap.ts` 中的同一个 `generateSessionRecap()` 函数，以确保行为一致。自动触发受 `general.showSessionRecap` 控制（默认：关闭——需要显式选择加入，以避免静默地为用户添加环境 LLM 调用账单）；手动命令和守护进程 HTTP 路由忽略该设置（调用方正在发出显式请求）。

### 守护进程访问路径

守护进程路由是非严格门控的（与 `/session/:id/prompt` 的姿态一致——回顾消耗 token 但不会改变任何状态）。能力标签 `session_recap` 在 `/capabilities.features` 上宣告该路由。SDK 辅助函数：`DaemonClient.recapSession(sessionId, opts)` 和 `DaemonSessionClient.recap(opts)`。参考 `docs/developers/qwen-serve-protocol.md` 中的 `POST /session/:id/recap` 章节，了解 wire 协议和错误封装。

v1 中**不支持取消**。该路由不监听 HTTP 客户端断开连接，没有将 `AbortSignal` 传入 `bridge.generateSessionRecap`，ACP 子处理程序向核心辅助函数传递一个永不被中止的 `AbortController().signal`（尚未提供跨进程中止机制）。唯一的限制是桥接器的 60 秒 `SESSION_RECAP_TIMEOUT_MS` 回退机制以及传输关闭与 ACP 通道死亡之间的竞争条件。单独连接 HTTP 侧的 AbortController 只是表面功夫——子进程侧的 LLM 调用仍然会运行完成，因此没有跨进程中止组件就无法实现端到端取消。这对于 v1 来说是可以接受的，因为回顾很短（单次侧查询，`maxOutputTokens: 300`，通常 1-5 秒）。如果未来带宽成本证明有必要，可以基于请求 ID 的取消 ext-method 来实现完整的端到端取消。

## 架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ 5 min blur timer + idle/dedupe gates                 │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand (slash) ─→ generateSessionRecap(config, signal) │
│                                          │                             │
│                                          ↓                             │
│                              ┌────────────────────────────────────────┐│
│                              │ packages/core/services/ │               │
│                              │   sessionRecap.ts       │               │
│                              └────────────────────────────────────────┘│
│                                          │                             │
│                                          ↓                             │
│                              GeminiClient.generateContent              │
│                              (fastModel + tools:[])                    │
│                                                                        │
│   addItem({type: 'away_recap', text}) ─→ HistoryItemDisplay            │
│       └─ AwayRecapMessage rendered inline like any other history       │
│         item (※ + bold "recap: " + italic content, all dim);           │
│         scrolls naturally with the conversation. Mirrors Claude        │
│         Code's away_summary system message.                            │
└────────────────────────────────────────────────────────────────────────┘
```

### 文件

| 文件                                                         | 职责                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                 | 一次性 LLM 调用 + 历史记录过滤 + 标签提取                              |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                | 自动触发 React hook                                                          |
| `packages/cli/src/ui/commands/recapCommand.ts`               | `/recap` 手动入口                                                      |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | `AwayRecapMessage` 渲染器（`※` + 粗体 `recap:` + 斜体内容，全部灰显）      |
| `packages/cli/src/ui/types.ts`                               | `HistoryItemAwayRecap` 类型                                                      |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | 将 `away_recap` 历史项分派给渲染器                            |
| `packages/cli/src/config/settingsSchema.ts`                  | `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` 设置 |

## 提示词设计

### 系统提示词

`generationConfig.systemInstruction` 在此单次调用中替换主代理的系统提示词，因此模型仅作为回顾生成器，而不是编码助手。

注意，`GeminiClient.generateContent()` 内部通过 `getCustomSystemPrompt()` 运行提示词，该函数会将用户的记忆（QWEN.md / 托管自动记忆）作为后缀附加。因此最终的提示词为 `回顾提示词 + 用户记忆`——对回顾有用的项目上下文，并非泄漏。

下面的条目与 `RECAP_SYSTEM_PROMPT` 一一对应：

- 不超过 40 个词，1-2 句纯文本（无 markdown / 列表 / 标题）。对于中文，预算约为 80 个字符。
- 第一句：高层任务。然后：具体的下一步。
- 明确禁止：列出已完成的工作、复述工具调用、状态报告。
- 匹配对话的主要语言（英文或中文）。
- 将输出包裹在 `<recap>...</recap>` 中；标签之外无内容。

### 结构化输出 + 提取

模型被指示将其答案包裹在 `<recap>...</recap>` 中：

```
<recap>重构 loopDetectionService.ts 以解决长时间会话的 OOM 问题。下一步是实现选项 B。</recap>
```

原因：某些模型（GLM 系列、推理模型）会在最终答案之前写一段“思考”文字。返回原始文本会将这些推理泄漏到 UI 中。

`extractRecap()` 有三个后备层级：

1. 两个标签都存在：取 `<recap>...</recap>` 之间的内容（首选）。
2. 只有开始标签（例如 `maxOutputTokens` 截断了结束标签）：取开始标签之后的所有内容。
3. 标签完全缺失：返回空字符串 → 服务返回 `null` → UI 不渲染任何内容。

第三层级是“跳过而不是显示错误的内容”——显示模型的推理前导文字比根本不显示回顾更糟糕。

### 调用参数

| 参数               | 值                              | 原因                                                |
| ------------------- | ------------------------------ | ----------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()` | 回顾不需要前沿模型                   |
| `tools`             | `[]`                           | 一次性查询，无需工具使用                           |
| `maxOutputTokens`   | `300`                          | 为 1-2 条短句子和标签留出空间               |
| `temperature`       | `0.3`                          | 大部分确定性，带少量自然变化 |
| `systemInstruction` | 上述仅回顾提示词    | 替换主代理的角色定义             |

## 历史记录过滤

`geminiClient.getChat().getHistory()` 返回包含以下内容的 `Content[]`：

- `user` / `model` 的文本消息
- `model` 的 `functionCall` 部分
- `user` 的 `functionResponse` 部分（可能包含完整的文件内容）
- `model` 的思考部分（`part.thought` / `part.thoughtSignature`，模型的隐藏推理）

`filterToDialog()` 仅保留 `user` / `model` 中**非空文本且不是思考**的部分。两个原因：

- **工具调用 / 响应**：单个 `functionResponse` 可能包含 10K+ token。30 条这样的消息会让回顾 LLM 淹没在不相关的细节中，既浪费 token，也会使回顾偏向于实现噪音，比如“调用了 X 工具来读取 Y 文件”。
- **思考部分**：包含模型的内部推理。包含它们可能导致将隐藏的思维链视为对话，并在回顾文本中暴露出来。

在丢弃空消息后，`takeRecentDialog` 切片到最后 30 条消息，并且拒绝在悬挂的 model/tool 响应上开始切片。

## 并发与边界情况

### 自动触发钩子状态机

`useAwaySummary` 维护三个 ref：

| Ref               | 含义                                           |
| ----------------- | ------------------------------------------------- |
| `blurredAtRef`    | 失焦开始时间（直到焦点返回才清除） |
| `recapPendingRef` | 是否有 LLM 调用正在进行                  |
| `inFlightRef`     | 当前正在进行的 `AbortController`           |

`useEffect` 依赖项：`[enabled, config, isFocused, isIdle, addItem, thresholdMs]`。

| 事件                                                          | 操作                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                          | 中止进行中的调用 + 清除 `inFlightRef` + 清除 `blurredAtRef`                                                                      |
| `!isFocused` 且 `blurredAtRef === null`                         | 设置 `blurredAtRef = Date.now()`                                                                                                        |
| `isFocused` 且 `blurredAtRef === null`                          | 提前返回（无需处理失焦周期——首次渲染或紧接在短暂失焦重置之后）                                                |
| `isFocused` 且失焦持续时间 < 5 分钟                            | 清除 `blurredAtRef`，等待下一个失焦周期                                                                                         |
| `isFocused` 且失焦 ≥ 5 分钟 且 `recapPendingRef`               | 返回（去重）                                                                                                                        |
| `isFocused` 且失焦 ≥ 5 分钟 且 `!isIdle`                       | **保留** `blurredAtRef` 并等待回合完成（`isIdle` 在依赖项中，因此流完成时 effect 会重新触发） |
| `isFocused` 且失焦 ≥ 5 分钟 且 `shouldFireRecap` 返回 false | 清除 `blurredAtRef` 并返回——自上次回顾以来对话没有足够多的变化（需要至少 2 次用户轮次，与 Claude Code 一致） |
| `isFocused` 且所有条件满足                               | 清除 `blurredAtRef`，设置 `recapPendingRef = true`，创建 `AbortController`，发送 LLM 请求                                     |

`.then` 回调**重新检查** `isIdleRef.current`：如果在 LLM 运行时用户开始了新的轮次，那么迟到的回顾将被丢弃，以避免在回合中间插入。

`.finally` 清除 `recapPendingRef`，并且仅当 `inFlightRef.current === controller` 时才清除 `inFlightRef`（以免覆盖较新的 controller）。

第二个 `useEffect` 在卸载时中止正在进行的 controller。

### `/recap` 门控

`CommandContext.ui.isIdleRef` 暴露当前的流状态（与现有的 `btwAbortControllerRef` 模式一致）。在交互模式下，当 `!isIdleRef.current` **或** `pendingItem !== null` 时，`recapCommand` 会拒绝执行。仅靠 `pendingItem` 是不够的，因为正常的模型回复在 `streamingState === Responding` 且 `pendingItem` 为 null 时运行。

## 配置与模型选择

### 用户可调旋钮

| 设置                                    | 默认值 | 说明                                                                               |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `general.showSessionRecap`                 | `false` | 仅影响自动触发。手动 `/recap` 忽略此项。                                    |
| `general.sessionRecapAwayThresholdMinutes` | `5`     | 在焦点回归之前，自动回顾触发的失焦分钟数。与 Claude Code 的默认值一致。 |
| `fastModel`                                | 未设置   | 推荐（例如 `qwen3-coder-flash`）用于快速且廉价的回顾。                   |

### 模型回退

`config.getFastModel() ?? config.getModel()`：

- 用户设置了 `fastModel` 且对当前认证类型有效 → 使用 `fastModel`。
- 否则 → 回退到主会话模型（可用，但更贵且更慢）。

## 可观测性

`createDebugLogger('SESSION_RECAP')` 输出：

- 回顾路径中捕获的异常 (`debugLogger.warn`)。

所有失败对用户都是**完全透明的**——回顾是一个辅助功能，从不会向 UI 抛出异常。开发者可以在调试日志文件中搜索 `[SESSION_RECAP]` 标签：默认写入 `~/.qwen/debug/<sessionId>.txt`（`latest.txt` 符号链接到当前会话）；通过 `QWEN_DEBUG_LOG_FILE=0` 禁用。

## 范围外

| 项目                                             | 原因                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/recap` 的进度 UI（旋转器 / pendingItem） | 3-5 秒的等待是可以接受的；增加复杂度。                                                                                           |
| 自动化测试                                  | 服务很小（约 150 行），首先手动进行端到端测试；单元测试可以在单独的 PR 中添加。                                   |
| 本地化提示词                                | 系统提示词是给模型的；英文是最可靠的基座。模型从对话中选择输出语言。 |
| `QWEN_CODE_ENABLE_AWAY_SUMMARY` 环境变量          | Claude Code 用它来在遥测禁用时保持该功能；Qwen Code 当前的遥测模型不需要这个。            |
| `/resume` 完成时的自动回顾               | 一个自然的后续，但需要在 `useResumeCommand` 中有一个钩子点；此 PR 超出范围。                                              |