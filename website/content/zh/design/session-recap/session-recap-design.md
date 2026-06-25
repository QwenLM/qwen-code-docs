# Session Recap 设计

> 当用户返回空闲会话时，展示简短（1-2 句）的"上次进行到哪里了"摘要，可按需触发（`/recap`），也可在终端失焦 5 分钟以上后自动触发。

## 概述

当用户几天后 `/resume` 一个旧会话时，需要向上翻阅大量历史记录才能回想起**自己在做什么以及下一步该做什么**，这是一个真实存在的摩擦点。仅仅重新加载消息无法解决这个 UX 问题。

目标是在用户返回时主动展示简短的 1-2 句摘要：

- **高层任务**（他们在做什么）→ **下一步**（接下来该做什么）。
- 在视觉上与真实助手回复明显区分，确保不会被误认为是新的模型输出。
- **尽力而为**：失败必须静默处理，绝不中断主流程。

## 触发方式

| 触发方式        | 条件                                                                                      | 实现                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **手动**        | 用户执行 `/recap`                                                                         | `recapCommand.ts` 调用相同的底层服务                                                                                                               |
| **自动**        | 终端失焦（DECSET 1004 focus 协议）≥ 5 分钟 + 焦点回归 + 流状态为 `Idle`                  | `useAwaySummary.ts` — 5 分钟失焦计时器 + `useFocus` 事件监听器                                                                                    |
| **Daemon HTTP** | 远端客户端调用 `POST /session/:id/recap`                                                  | `server.ts` 路由 → `bridge.generateSessionRecap`（ext-method 往返）→ `acpAgent.ts` 调用 `generateSessionRecap(session.getConfig(), signal)` |

三条路径最终都汇入 `core/services/sessionRecap.ts` 中同一个 `generateSessionRecap()` 函数，以确保行为完全一致。自动触发受 `general.showSessionRecap` 控制（默认关闭 — 需显式开启，避免在用户不知情的情况下产生 LLM 费用）；手动命令和 Daemon HTTP 路由忽略该设置（调用方是在主动发起请求）。

### Daemon 访问路径

Daemon 路由采用非严格门控方式（与 `/session/:id/prompt` 的策略保持一致 — recap 会消耗 token，但不会改变任何状态）。能力标签 `session_recap` 在 `/capabilities.features` 上公告该路由。SDK 辅助方法：`DaemonClient.recapSession(sessionId, opts)` 和 `DaemonSessionClient.recap(opts)`。wire 协议和错误信封详见 `docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap`。

**v1 中不支持取消**。该路由不监听 HTTP 客户端断连，`bridge.generateSessionRecap` 中未穿入 `AbortSignal`，ACP 子处理器向核心辅助函数传入的是永不中止的 `AbortController().signal`（尚未实现跨进程中止管道）。唯一的上限是 bridge 的 60 秒 `SESSION_RECAP_TIMEOUT_MS` 兜底以及 ACP 通道关闭与传输关闭之间的竞争。在 HTTP 侧单独接入 AbortController 只是形式上的 — 子进程侧的 LLM 调用仍会运行至完成，因此在没有跨进程中止机制的情况下无法实现端到端取消。v1 可接受此限制，因为 recap 很短（单次旁路查询，`maxOutputTokens: 300`，典型耗时约 1–5 秒）。如果带宽成本值得投入，未来可通过基于 request-id 的取消 ext-method 实现完整的端到端取消。

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
│       └─ AwayRecapMessage 像其他历史条目一样内联渲染（※ + 粗体 "recap: " │
│         + 斜体内容，全部置灰）；随对话自然滚动。镜像 Claude Code 的       │
│         away_summary 系统消息。                                          │
└────────────────────────────────────────────────────────────────────────┘
```

### 文件

| 文件                                                         | 职责                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                 | 单次 LLM 调用 + 历史过滤 + 标签提取                                              |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                | 自动触发 React hook                                                              |
| `packages/cli/src/ui/commands/recapCommand.ts`               | `/recap` 手动入口                                                                |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | `AwayRecapMessage` 渲染器（`※` + 粗体 `recap:` + 斜体内容，全部置灰）           |
| `packages/cli/src/ui/types.ts`                               | `HistoryItemAwayRecap` 类型                                                      |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | 将 `away_recap` 历史条目分发到渲染器                                             |
| `packages/cli/src/config/settingsSchema.ts`                  | `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` 配置项   |

## Prompt 设计

### 系统 Prompt

`generationConfig.systemInstruction` 在本次单独调用中替换主 agent 的系统 prompt，使模型仅作为 recap 生成器运行，而非编码助手。

注意，`GeminiClient.generateContent()` 内部会通过 `getCustomSystemPrompt()` 处理 prompt，该函数会将用户的记忆（QWEN.md / 托管自动记忆）以后缀形式附加。因此最终系统 prompt 为 `recap prompt + 用户记忆` — 为 recap 提供有用的项目上下文，而非泄露。

以下要点与 `RECAP_SYSTEM_PROMPT` 一一对应：

- 不超过 40 个词，1-2 句纯文本（不使用 markdown / 列表 / 标题）。对于中文，总字数预算约为 80 个字符。
- 第一句：高层任务。然后：具体的下一步。
- 明确禁止：列举已完成的事项、复述工具调用、输出状态报告。
- 匹配对话的主要语言（英文或中文）。
- 将输出包裹在 `<recap>...</recap>` 中；标签外不输出任何内容。

### 结构化输出 + 提取

模型被要求将答案包裹在 `<recap>...</recap>` 中：

```
<recap>Refactoring loopDetectionService.ts to address long-session OOM. Next step is to implement option B.</recap>
```

原因：部分模型（GLM 系列、推理模型）会在最终答案前写一段"思考"段落。直接返回原始文本会将该推理过程泄露到 UI 中。

`extractRecap()` 有三层降级策略：

1. 两个标签均存在：提取 `<recap>...</recap>` 之间的内容（首选）。
2. 仅有开标签（例如 `maxOutputTokens` 截断了闭标签）：提取开标签之后的全部内容。
3. 标签完全缺失：返回空字符串 → 服务返回 `null` → UI 不渲染任何内容。

第三层策略是"宁可不展示也不展示错误内容" — 将模型的推理前导文字展示出来比什么都不展示更糟糕。

### 调用参数

| 参数                | 值                             | 原因                                              |
| ------------------- | ------------------------------ | ------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()` | Recap 不需要前沿模型                              |
| `tools`             | `[]`                           | 单次查询，不使用工具                              |
| `maxOutputTokens`   | `300`                          | 为 1-2 句短句 + 标签预留空间                      |
| `temperature`       | `0.3`                          | 以确定性为主，保留少量自然变化                    |
| `systemInstruction` | 上述仅用于 recap 的 prompt     | 替换主 agent 的角色定义                           |

## 历史过滤

`geminiClient.getChat().getHistory()` 返回一个 `Content[]`，包含：

- `user` / `model` 文本消息
- `model` 的 `functionCall` 部分
- `user` 的 `functionResponse` 部分（可能包含完整文件内容）
- `model` 的思考部分（`part.thought` / `part.thoughtSignature`，即模型的隐式推理）

`filterToDialog()` 仅保留**有非空文本且非思考内容**的 `user` / `model` 部分。原因有二：

- **工具调用/响应**：单个 `functionResponse` 可能多达 10K+ token。30 条此类消息会用无关细节淹没 recap LLM，既浪费 token，又会使 recap 偏向"调用 X 工具读取 Y 文件"之类的实现噪音。
- **思考部分**：携带模型的内部推理。将其包含在内有风险将隐式思维链当作对话处理，并将其浮现在 recap 文本中。

去除空消息后，`takeRecentDialog` 截取最近 30 条消息，且不会以悬空的 model/tool 响应作为切片起点。

## 并发与边界情况

### 自动触发 hook 状态机

`useAwaySummary` 维护三个 ref：

| Ref               | 含义                                     |
| ----------------- | ---------------------------------------- |
| `blurredAtRef`    | 失焦开始时间（焦点回归前不清除）         |
| `recapPendingRef` | 是否有 LLM 调用正在进行                  |
| `inFlightRef`     | 当前进行中的 `AbortController`           |

`useEffect` 依赖项：`[enabled, config, isFocused, isIdle, addItem, thresholdMs]`。

| 事件                                                             | 动作                                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                          | 中止进行中的调用 + 清除 `inFlightRef` + 清除 `blurredAtRef`                                                                      |
| `!isFocused` 且 `blurredAtRef === null`                          | 设置 `blurredAtRef = Date.now()`                                                                                                 |
| `isFocused` 且 `blurredAtRef === null`                           | 提前返回（没有失焦周期需要处理 — 首次渲染或短暂失焦重置后）                                                                     |
| `isFocused` 且失焦时长 < 5 分钟                                  | 清除 `blurredAtRef`，等待下一个失焦周期                                                                                          |
| `isFocused` 且失焦 ≥ 5 分钟 且 `recapPendingRef`                 | 返回（去重）                                                                                                                     |
| `isFocused` 且失焦 ≥ 5 分钟 且 `!isIdle`                         | **保留** `blurredAtRef` 并等待本轮完成（`isIdle` 在依赖项中，流式传输完成后 effect 会重新触发）                                  |
| `isFocused` 且失焦 ≥ 5 分钟 且 `shouldFireRecap` 返回 false      | 清除 `blurredAtRef` 并返回 — 自上次 recap 以来对话未有足够推进（至少需要 2 个用户轮次，与 Claude Code 保持一致）                 |
| `isFocused` 且所有条件满足                                       | 清除 `blurredAtRef`，设置 `recapPendingRef = true`，创建 `AbortController`，发送 LLM 请求                                        |

`.then` 回调会**重新检查** `isIdleRef.current`：如果在 LLM 运行期间用户已开启新一轮对话，则丢弃迟到的 recap，避免将其插入到对话进行中。

`.finally` 清除 `recapPendingRef`，并仅在 `inFlightRef.current === controller` 时清除 `inFlightRef`（避免覆盖更新的 controller）。

第二个 `useEffect` 在卸载时中止进行中的 controller。

### `/recap` 门控

`CommandContext.ui.isIdleRef` 暴露当前流状态（镜像现有的 `btwAbortControllerRef` 模式）。在交互模式下，`recapCommand` 在 `!isIdleRef.current` **或** `pendingItem !== null` 时拒绝执行。仅依赖 `pendingItem` 是不够的，因为普通模型回复运行时 `streamingState === Responding` 且 `pendingItem` 为 null。

## 配置与模型选择

### 用户可配置项

| 配置项                                     | 默认值  | 说明                                                                                |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `general.showSessionRecap`                 | `false` | 仅影响自动触发。手动 `/recap` 忽略此项。                                            |
| `general.sessionRecapAwayThresholdMinutes` | `5`     | 失焦多少分钟后在重新聚焦时自动触发 recap。与 Claude Code 默认值一致。               |
| `fastModel`                                | 未设置  | 推荐设置（例如 `qwen3-coder-flash`）以实现快速低成本的 recap。                      |

### 模型降级

`config.getFastModel() ?? config.getModel()`：

- 用户设置了 `fastModel` 且当前认证类型下有效 → 使用 `fastModel`。
- 否则 → 降级为主会话模型（可用，但成本更高、速度更慢）。

## 可观测性

`createDebugLogger('SESSION_RECAP')` 输出：

- recap 路径中捕获的异常（`debugLogger.warn`）。

所有失败对用户**完全透明** — recap 是辅助功能，绝不向 UI 抛出异常。开发者可在调试日志文件中 grep `[SESSION_RECAP]` 标签：默认写入 `~/.qwen/debug/<sessionId>.txt`（`latest.txt` 符号链接指向当前会话）；通过 `QWEN_DEBUG_LOG_FILE=0` 可禁用。

## 超出范围

| 条目                                             | 原因                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/recap` 的进度 UI（spinner / pendingItem）      | 3-5 秒的等待可以接受；增加复杂度不值得。                                                                                               |
| 自动化测试                                       | 服务较小（约 150 行），先进行手动端到端测试；单元测试可在单独的 PR 中落地。                                                            |
| 本地化 prompt                                    | 系统 prompt 供模型使用；英文是最可靠的基底。模型会根据对话选择输出语言。                                                               |
| `QWEN_CODE_ENABLE_AWAY_SUMMARY` 环境变量         | Claude Code 使用它在遥测禁用时保持功能开启；Qwen Code 当前的遥测模型不需要此项。                                                       |
| `/resume` 完成时自动触发 recap                   | 自然的后续功能，但需要在 `useResumeCommand` 中添加钩子点；超出本 PR 范围。                                                             |
