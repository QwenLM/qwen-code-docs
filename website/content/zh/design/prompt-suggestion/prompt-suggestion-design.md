# 提示建议 (NES) 设计

> 预测用户在 AI 完成回复后接下来会自然输入的内容，并在输入框中以幽灵文本的形式显示。
>
> 实现状态：`prompt-suggestion-implementation.md`。推测引擎：`speculation-design.md`。

## 概述

**提示建议**（下一步建议 / NES）是一个简短的预测（2-12 个词），由 LLM 在每次 AI 回复后调用生成。它以幽灵文本的形式出现在输入提示框中。用户可以通过 Tab/Enter/右箭头接受，或通过输入内容将其取消。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Responding → Idle 过渡                                     │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  守卫条件（11 类）                                    │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams 可用？ ───┐                    │    │
│  │  │                                  │               │    │
│  │  ▼ 是                         否 ▼                 │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (缓存感知)                  (独立回退)                │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 条过滤规则 ───────                        │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (框架无关)                       │    │
│  │  300ms 延迟 → 显示为幽灵文本                          │    │
│  │                                                     │    │
│  │  Tab    → 接受（填充输入）                            │    │
│  │  Enter  → 接受并提交                                │    │
│  │  Right  → 接受（填充输入）                            │    │
│  │  Type   → 取消 + 中止推测                            │    │
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

### LLM 提示

```
[建议模式：建议用户接下来可能自然输入的内容。]

首先：阅读助手最新消息的最后几行——那里通常会出现下一步提示、技巧和可操作建议。
然后检查用户最近的消息和原始请求。

你的任务是预测**他们会**输入什么——而不是你认为他们应该做什么。
测试标准：他们会觉得“我正要输入那个”吗？

优先级：如果助手的最后一条消息包含类似“提示：输入 X 来...”或“输入 X 来...”的提示，
则将 X 提取为建议。这些是明确的下一步提示。

示例：
助手说“提示：输入 post comments 来发布发现” → “post comments”
助手说“输入 /review 来开始” → “/review”
用户要求“修复 bug 并运行测试”，bug 已修复 → “run the tests”
写了代码后 → “try it out”
任务完成，明显的后续操作 → “commit this” 或 “push it”

格式：2-12 个词，匹配用户的风格。或者不返回任何内容。
仅回复建议本身，不要带引号或解释。
```

### 过滤规则（12 条）

| 规则                | 被拦截的示例                                    |
| ------------------- | ----------------------------------------------- |
| done                | “done”                                          |
| meta_text           | “nothing found”, “no suggestion”, “silence”     |
| meta_wrapped        | “(silence)”, “[no suggestion]”                  |
| error_message       | “api error: 500”                                |
| prefixed_label      | “Suggestion: commit”                            |
| too_few_words       | “hmm”（但允许 “yes”, “commit”, “push” 等）      |
| too_many_words      | > 12 个词                                       |
| too_long            | >= 100 字符                                     |
| multiple_sentences  | “Run tests. Then commit.”                      |
| has_formatting      | 换行、Markdown 加粗                             |
| evaluative          | “looks good”, “thanks”（使用 \b 词边界）       |
| ai_voice            | “Let me...”, “I'll...”, “Here's...”           |

### 守卫条件

**AppContainer useEffect（代码中 13 项检查）：**

| 守卫                     | 检查条件                                             |
| ------------------------ | ---------------------------------------------------- |
| 设置开关                 | `enableFollowupSuggestions`                          |
| 非交互模式               | `config.isInteractive()`                             |
| SDK 模式                 | `!config.getSdkMode()`                               |
| 流式传输过渡             | `Responding → Idle`（2 项检查）                      |
| API 错误（历史）         | `historyManager.history[last]?.type !== 'error'`     |
| API 错误（待定）         | `!pendingGeminiHistoryItems.some(type === 'error')`  |
| 确认对话框               | shell + general + loop detection（3 项检查）         |
| 权限对话框               | `isPermissionsDialogOpen`                            |
| 启发式询问               | `settingInputRequests.length === 0`                  |
| 计划模式                 | `ApprovalMode.PLAN`                                  |

**generatePromptSuggestion() 内部：**

| 守卫             | 检查条件           |
| ---------------- | ------------------ |
| 早期对话         | `modelTurns < 2`   |

**独立功能标志（不在守卫块中）：**

| 标志                   | 控制                                                    |
| ---------------------- | ------------------------------------------------------- |
| `enableCacheSharing`   | 是否使用分叉查询，或回退到 generateJson                  |
| `enableSpeculation`    | 是否在建议显示时开始推测                                |

## 状态管理

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // 用于遥测的时间戳
}
```

### FollowupController

框架无关的控制器，由 CLI（Ink）和 WebUI（React）共享：

- `setSuggestion(text)` — 延迟 300ms 显示，null 立即清除
- `accept(method)` — 清除状态，通过微任务触发 `onAccept`，100ms 防抖锁
- `dismiss()` — 清除状态，记录 `ignored` 遥测
- `clear()` — 硬重置所有状态和定时器
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` 防止意外修改

## 键盘交互

| 键               | CLI                        | WebUI                                |
| ---------------- | -------------------------- | ------------------------------------ |
| Tab              | 填充输入（不提交）         | 填充输入（不提交）                   |
| Enter            | 填充 + 提交                | 填充 + 提交（使用 `explicitText` 参数）|
| 右箭头           | 填充输入（不提交）         | 填充输入（不提交）                   |
| 输入字符         | 取消 + 中止推测            | 取消                                 |
| 粘贴             | 取消 + 中止推测            | 取消                                 |

### 按键绑定说明

Tab 处理程序显式使用 `key.name === 'tab'`（而不是 `ACCEPT_SUGGESTION` 匹配器），因为 `ACCEPT_SUGGESTION` 也会匹配 Enter，而 Enter 需要进入 SUBMIT 处理程序。

## 遥测

### PromptSuggestionEvent

| 字段                         | 类型                         | 描述                           |
| ---------------------------- | ---------------------------- | ------------------------------ |
| outcome                      | accepted/ignored/suppressed  | 最终结果                       |
| prompt_id                    | string                       | 默认：'user_intent'            |
| accept_method                | tab/enter/right              | 用户接受方式                   |
| time_to_accept_ms            | number                       | 从显示到接受的时间             |
| time_to_ignore_ms            | number                       | 从显示到取消的时间             |
| time_to_first_keystroke_ms   | number                       | 显示期间到首次按键的时间       |
| suggestion_length            | number                       | 字符数                         |
| similarity                   | number                       | 接受时为 1.0，忽略时为 0.0    |
| was_focused_when_shown       | boolean                      | 终端是否处于焦点               |
| reason                       | string                       | 对于被抑制的情况：过滤规则名称 |

### SpeculationEvent

| 字段                      | 类型                      | 描述                     |
| ------------------------- | ------------------------- | ------------------------ |
| outcome                   | accepted/aborted/failed   | 推测结果                 |
| turns_used                | number                    | API 往返次数             |
| files_written             | number                    | overlay 中的文件数       |
| tool_use_count            | number                    | 执行的工具数             |
| duration_ms               | number                    | 墙上时钟时间             |
| boundary_type             | string                    | 停止推测的原因           |
| had_pipelined_suggestion  | boolean                   | 是否生成了下一个建议     |

## 功能标志与设置

| 设置                         | 类型    | 默认值 | 描述                                     |
| ---------------------------- | ------- | ------ | ---------------------------------------- |
| `enableFollowupSuggestions`  | boolean | true   | 提示建议的总开关                         |
| `enableCacheSharing`         | boolean | true   | 使用缓存感知的分叉查询                   |
| `enableSpeculation`          | boolean | false  | 预测执行引擎                             |
| `fastModel`（顶层）          | string  | ""     | 所有后台任务的模型（空值 = 使用主模型）。通过 `/model --fast` 设置 |

### 内部 Prompt ID 过滤

后台操作使用专用的 prompt ID（`utils/internalPromptIds.ts` 中的 `INTERNAL_PROMPT_IDS`），以防止它们的 API 流量和工具调用出现在用户可见的 UI 中：

| Prompt ID           | 用途                     |
| ------------------- | ------------------------ |
| `prompt_suggestion` | 建议生成                 |
| `forked_query`      | 缓存感知的分叉查询       |
| `speculation`       | 推测引擎                 |

**应用过滤：**

- `loggingContentGenerator` — 对于内部 ID，跳过 `logApiRequest` 和 OpenAI 交互日志
- `logApiResponse` / `logApiError` — 跳过 `chatRecordingService.recordUiTelemetryEvent`
- `logToolCall` — 跳过 `chatRecordingService.recordUiTelemetryEvent`
- `uiTelemetryService.addEvent` — **不过滤**（确保 `/stats` token 追踪正常工作）

### 思维模式

所有后台任务路径都显式禁用了思维/推理模式（`thinkingConfig: { includeThoughts: false }`）：

- **分叉查询路径**（`createForkedChat`）— 在克隆的 `generationConfig` 中覆盖 `thinkingConfig`，涵盖建议生成和推测
- **BaseLlm 回退路径**（`generateViaBaseLlm`）— 每次请求的配置覆盖基础内容生成器的思维设置

这样做是安全的，因为：

- 缓存前缀由 systemInstruction + tools + history 决定，而非 `thinkingConfig` — 缓存命中不受影响
- 所有后端（Gemini、兼容 OpenAI 的服务、Anthropic）都通过省略 thinking 字段来处理 `includeThoughts: false` — 对于不支持思维功能的模型不会产生 API 错误
- 建议生成和推测并不受益于推理 token