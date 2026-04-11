# Prompt Suggestion (NES) 设计

> 预测用户在 AI 完成回复后自然输入的下一步内容，并将其以幽灵文本（ghost text）的形式显示在输入提示框中。
>
> 实现状态：`prompt-suggestion-implementation.md`。推测引擎：`speculation-design.md`。

## 概述

**Prompt suggestion**（下一步建议 / NES）是对用户下一次输入的简短预测（2-12 个词），在每次 AI 回复后通过 LLM 调用生成。它会以幽灵文本的形式显示在输入提示框中。用户可以通过 Tab/Enter/右方向键接受该建议，或通过直接输入来忽略它。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Responding → Idle transition                               │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Guard Conditions (11 categories)                    │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams available? ───┐               │    │
│  │  │                                  │               │    │
│  │  ▼ YES                         NO ▼                 │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (cache-aware)         (standalone fallback)        │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 filter rules ──────                        │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (framework-agnostic)            │    │
│  │  300ms delay → show as ghost text                   │    │
│  │                                                     │    │
│  │  Tab    → accept (fill input)                       │    │
│  │  Enter  → accept + submit                           │    │
│  │  Right  → accept (fill input)                       │    │
│  │  Type   → dismiss + abort speculation               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Telemetry (PromptSuggestionEvent)                  │    │
│  │  outcome, accept_method, timing, similarity,        │    │
│  │  keystroke, focus, suppression reason, prompt_id     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 建议生成

### LLM Prompt

```
[SUGGESTION MODE: Suggest what the user might naturally type next.]

FIRST: Read the LAST FEW LINES of the assistant's most recent message — that's where
next-step hints, tips, and actionable suggestions usually appear. Then check the user's
recent messages and original request.

Your job is to predict what THEY would type - not what you think they should do.
THE TEST: Would they think "I was just about to type that"?

PRIORITY: If the assistant's last message contains a tip or hint like "Tip: type X to ..."
or "type X to ...", extract X as the suggestion. These are explicit next-step hints.

EXAMPLES:
Assistant says "Tip: type post comments to publish findings" → "post comments"
Assistant says "type /review to start" → "/review"
User asked "fix the bug and run tests", bug is fixed → "run the tests"
After code written → "try it out"
Task complete, obvious follow-up → "commit this" or "push it"

Format: 2-12 words, match the user's style. Or nothing.
Reply with ONLY the suggestion, no quotes or explanation.
```

### 过滤规则（12 条）

| 规则               | 拦截示例                                  |
| ------------------ | ------------------------------------------------ |
| done               | "done"                                           |
| meta_text          | "nothing found", "no suggestion", "silence"      |
| meta_wrapped       | "(silence)", "[no suggestion]"                   |
| error_message      | "api error: 500"                                 |
| prefixed_label     | "Suggestion: commit"                             |
| too_few_words      | "hmm"（但允许 "yes", "commit", "push" 等）  |
| too_many_words     | > 12 个词                                       |
| too_long           | >= 100 个字符                                     |
| multiple_sentences | "Run tests. Then commit."                        |
| has_formatting     | 换行符、Markdown 加粗                          |
| evaluative         | "looks good", "thanks"（使用 \b 单词边界） |
| ai_voice           | "Let me...", "I'll...", "Here's..."              |

### 守卫条件

**AppContainer useEffect（代码中包含 13 项检查）：**

| 守卫条件                | 检查逻辑                                               |
| -------------------- | --------------------------------------------------- |
| 设置开关      | `enableFollowupSuggestions`                         |
| 非交互模式      | `config.isInteractive()`                            |
| SDK 模式             | `!config.getSdkMode()`                              |
| 流式状态转换 | `Responding → Idle`（2 项检查）                      |
| API 错误（历史记录）  | `historyManager.history[last]?.type !== 'error'`    |
| API 错误（待处理）  | `!pendingGeminiHistoryItems.some(type === 'error')` |
| 确认对话框 | shell + general + 循环检测（3 项检查）         |
| 权限对话框    | `isPermissionsDialogOpen`                           |
| 引导请求          | `settingInputRequests.length === 0`                 |
| 计划模式            | `ApprovalMode.PLAN`                                 |

**在 `generatePromptSuggestion()` 内部：**

| 守卫条件              | 检查逻辑            |
| ------------------ | ---------------- |
| 对话初期 | `modelTurns < 2` |

**独立的功能开关（不在守卫条件块中）：**

| 开关                 | 控制内容                                                |
| -------------------- | ------------------------------------------------------- |
| `enableCacheSharing` | 是否使用 forked query 或回退到 generateJson |
| `enableSpeculation`  | 是否在显示建议时启动推测      |

## 状态管理

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // timestamp for telemetry
}
```

### FollowupController

CLI (Ink) 和 WebUI (React) 共享的框架无关控制器：

- `setSuggestion(text)` — 延迟 300ms 显示，传入 null 立即清除
- `accept(method)` — 清除状态，通过微任务触发 `onAccept`，100ms 防抖锁定
- `dismiss()` — 清除状态，记录 `ignored` 遥测数据
- `clear()` — 硬重置所有状态和计时器
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` 防止意外修改

## 键盘交互

| 按键         | CLI                         | WebUI                                |
| ----------- | --------------------------- | ------------------------------------ |
| Tab         | 填充输入框（不提交）      | 填充输入框（不提交）               |
| Enter       | 填充并提交               | 填充并提交（`explicitText` 参数） |
| Right Arrow | 填充输入框（不提交）      | 填充输入框（不提交）               |
| 输入字符      | 忽略并中止推测 | 忽略                              |
| 粘贴       | 忽略并中止推测 | 忽略                              |

### 按键绑定说明

Tab 处理器显式使用 `key.name === 'tab'`（而非 `ACCEPT_SUGGESTION` 匹配器），因为 `ACCEPT_SUGGESTION` 也会匹配 Enter，而 Enter 需要穿透到 SUBMIT 处理器。

## 遥测数据

### PromptSuggestionEvent

| 字段                      | 类型                        | 说明                         |
| -------------------------- | --------------------------- | ----------------------------------- |
| outcome                    | accepted/ignored/suppressed | 最终结果                       |
| prompt_id                  | string                      | 默认值：'user_intent'              |
| accept_method              | tab/enter/right             | 用户接受的方式                   |
| time_to_accept_ms          | number                      | 从显示到接受的时间           |
| time_to_ignore_ms          | number                      | 从显示到忽略的时间          |
| time_to_first_keystroke_ms | number                      | 显示期间到首次按键的时间 |
| suggestion_length          | number                      | 字符数                     |
| similarity                 | number                      | 接受为 1.0，忽略为 0.0      |
| was_focused_when_shown     | boolean                     | 显示时终端是否处于焦点                  |
| reason                     | string                      | 被拦截时：过滤规则名称    |

### SpeculationEvent

| 字段                    | 类型                    | 说明               |
| ------------------------ | ----------------------- | ------------------------- |
| outcome                  | accepted/aborted/failed | 推测结果        |
| turns_used               | number                  | API 往返次数           |
| files_written            | number                  | 覆盖层中的文件数          |
| tool_use_count           | number                  | 执行的工具数            |
| duration_ms              | number                  | 实际耗时（Wall-clock time）           |
| boundary_type            | string                  | 终止推测的原因  |
| had_pipelined_suggestion | boolean                 | 是否生成了下一条建议 |

## 功能开关与设置

| 设置项                     | 类型    | 默认值 | 说明                                                                      |
| --------------------------- | ------- | ------- | -------------------------------------------------------------------------------- |
| `enableFollowupSuggestions` | boolean | true    | Prompt suggestion 的总开关                                             |
| `enableCacheSharing`        | boolean | true    | 使用支持缓存感知的 forked query                                                   |
| `enableSpeculation`         | boolean | false   | 预测性执行引擎                                                      |
| `fastModel`（顶层）     | string  | ""      | 用于所有后台任务的模型（留空表示使用主模型）。通过 `/model --fast` 设置 |

### 内部 Prompt ID 过滤

后台操作使用专用的 prompt ID（位于 `utils/internalPromptIds.ts` 中的 `INTERNAL_PROMPT_IDS`），以防止其 API 流量和工具调用出现在用户可见的 UI 中：

| Prompt ID           | 使用方                    |
| ------------------- | -------------------------- |
| `prompt_suggestion` | 建议生成      |
| `forked_query`      | 支持缓存感知的 forked query |
| `speculation`       | 推测引擎         |

**应用的过滤逻辑：**

- `loggingContentGenerator` — 针对内部 ID 跳过 `logApiRequest` 和 OpenAI 交互日志记录
- `logApiResponse` / `logApiError` — 跳过 `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — 跳过 `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **不过滤**（确保 `/stats` 的 token 统计正常工作）

### 思考模式

所有后台任务路径均显式禁用思考/推理功能（`thinkingConfig: { includeThoughts: false }`）：

- **Forked query 路径**（`createForkedChat`）—— 在克隆的 `generationConfig` 中覆盖 `thinkingConfig`，涵盖建议生成和推测
- **BaseLlm 回退路径**（`generateViaBaseLlm`）—— 每次请求的配置会覆盖基础内容生成器的思考设置

这样做是安全的，原因如下：

- 缓存前缀由 systemInstruction + tools + history 决定，而非 `thinkingConfig` —— 缓存命中率不受影响
- 所有后端（Gemini、OpenAI 兼容、Anthropic）均通过省略 thinking 字段来处理 `includeThoughts: false` —— 不支持思考功能的模型不会引发 API 错误
- 建议生成和推测功能无法从推理 token 中获益