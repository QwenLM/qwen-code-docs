# 会话标题设计

> 由快速模型在首次助手回复后生成的 3-7 个单词、句首大写的会话标题。持久化存储在会话 JSONL 中，带有
> `titleSource: 'auto' | 'manual'` 标签，显示在会话选择器中，并可通过 `/rename --auto` 按需重新生成。

## 概述

`/rename` (#3093) 允许用户为会话添加标签，以便日后在选择器中快速找到它。但在用户运行该命令之前，选择器通常只显示第一条用户提示——往往在句子中间被截断，或者描述的是一个引导性问题，而非会话的实际主题。手动重命名是大多数用户永远不会去做的可选摩擦。

目标是让会话名称**默认即具备实用性**：

- **描述性**：准确反映会话的实际成果，而非仅仅是开场白。3-7 个单词，句首大写，类似 git commit subject 风格。
- **尽力而为**：在首次回复后于后台触发；如果失败，用户不会看到任何错误。
- **尊重用户选择**：绝不覆盖用户通过 `/rename` 刻意设置的标题，即使在同一会话的不同 CLI 标签页中也是如此。
- **支持显式重新生成**：通过 `/rename --auto` 触发，适用于“自动标题已过时 / 我想要一个新标题”的场景。

## 触发条件

| 触发方式   | 条件                                                                                                                                                          | 实现                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **自动**   | `recordAssistantTurn` 触发后。若已存在标题、有尝试正在进行、达到上限、非交互模式、环境变量禁用或无快速模型，则跳过。 | `ChatRecordingService.maybeTriggerAutoTitle` — 触发后不等待结果 (fire-and-forget) |
| **手动** | 用户运行 `/rename --auto`                                                                                                                                          | `renameCommand.ts` 通过 `tryGenerateSessionTitle` 调用               |

两条路径最终都会汇入同一个函数 `tryGenerateSessionTitle(config, signal)`，以确保提示词、schema、模型选择和清理逻辑完全一致。自动触发是尽力而为的后台调用；手动 `/rename --auto` 是阻塞式用户操作，失败时会显示具体的错误原因。

## 架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        packages/core/src/services/                      │
│                                                                         │
│  ┌──────────────────────────┐                                           │
│  │ chatRecordingService.ts  │                                           │
│  │                          │                                           │
│  │  recordAssistantTurn()   │                                           │
│  │     │                    │                                           │
│  │     ↓                    │                                           │
│  │  maybeTriggerAutoTitle() │── 6 guards ──→ IIFE(autoTitleController)  │
│  │     │                    │                       │                   │
│  │     └── resume hydrate   │                       ↓                   │
│  │         via              │          tryGenerateSessionTitle          │
│  │         getSessionTitle- │          (sessionTitle.ts)                │
│  │         Info             │                       │                   │
│  │                          │                       ↓                   │
│  └──────────────────────────┘          BaseLlmClient.generateJson       │
│                                        (fastModel + JSON schema)        │
│                                                       │                 │
│  ┌──────────────────────────┐                         ↓                 │
│  │ sessionService.ts        │         sanitizeTitle + sanity checks     │
│  │                          │                         │                 │
│  │  getSessionTitleInfo()   │◀── cross-process        ↓                 │
│  │      uses                │    re-read             recordCustomTitle  │
│  │  readLastJsonString-     │    before write        (…, 'auto')        │
│  │  FieldsSync              │                                           │
│  │  (sessionStorageUtils)   │                                           │
│  └──────────────────────────┘                                           │
│                                                                         │
│                          ┌─────────────────────┐                        │
│                          │ utils/terminalSafe  │                        │
│                          │ stripTerminalCtrl-  │                        │
│                          │ Sequences           │                        │
│                          └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     packages/cli/src/ui/                                │
│                                                                         │
│  commands/renameCommand.ts     ─── /rename <name>          → manual      │
│                                ─── /rename                 → kebab       │
│                                ─── /rename --auto          → auto       │
│                                ─── /rename -- --literal    → manual     │
│                                ─── /rename --unknown-flag  → error      │
│                                                                         │
│  components/SessionPicker.tsx  ── dims rows where                       │
│                                   session.titleSource === 'auto'        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 文件

| 文件                                                 | 职责                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionTitle.ts`         | 一次性 LLM 调用 + 历史记录过滤 + 清理。导出 `tryGenerateSessionTitle`。  |
| `packages/core/src/services/chatRecordingService.ts` | `maybeTriggerAutoTitle` 触发器、守卫条件、跨进程重新读取、finalize 时中止。 |
| `packages/core/src/services/sessionService.ts`       | `getSessionTitleInfo` 公共访问器；`renameSession` 接受 `titleSource`。      |
| `packages/core/src/utils/sessionStorageUtils.ts`     | `extractLastJsonStringFields` + `readLastJsonStringFieldsSync` 原子对读取器。 |
| `packages/core/src/utils/terminalSafe.ts`            | `stripTerminalControlSequences`，供句首大写和 kebab 路径共享使用。           |
| `packages/cli/src/ui/commands/renameCommand.ts`      | `/rename --auto`、哨兵解析器、失败原因消息映射。                     |
| `packages/cli/src/ui/components/SessionPicker.tsx`   | 当 `titleSource === 'auto'` 时的置灰样式。                                          |

## 提示词设计

### 系统提示词 (System Prompt)

在此单次调用中替换主 Agent 的系统提示词，使模型仅专注于为会话打标签，而非扮演编程助手。

以下要点与 `TITLE_SYSTEM_PROMPT` 一一对应：

- 3-7 个单词，句首大写（仅首单词和专有名词大写）。
- 无末尾标点、无 Markdown、无引号。
- 匹配对话的主要语言；对于中文，预算大约 12-20 个字符。
- 具体说明用户的实际目标——指明功能、Bug 或主题领域。避免使用“代码更改”或“帮助请求”等模糊的统称。
- 提供四个优秀示例（三个英文 + 一个中文）和四个错误示例（过于模糊 / 过长 / 大小写错误 / 末尾带标点）。
- 仅返回包含单个 `title` 键的 JSON 对象。

### 结构化输出 (JSON schema)

与 session-recap 使用标签包裹输出不同，我们使用 `BaseLlmClient.generateJson` 配合函数调用 (function-calling) schema：

```ts
const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'A concise sentence-case session title, 3-7 words, no trailing punctuation.',
    },
  },
  required: ['title'],
};
```

为什么选择函数调用而非自由文本 + 标签提取：

1. **跨提供商可靠性**：兼容 OpenAI 的端点、Gemini 和 Qwen 的原生工具调用均实现了函数调用；标签解析则依赖每个模型都遵守特定的文本约定。
2. **无推理前缀泄露**：函数调用参数以结构化形式返回，因此答案前的“思考”段落不会污染标题。
3. **更简单的后处理**：只需一次 `typeof result.title === 'string'` 检查加上 `sanitizeTitle` 即可覆盖所有可能的模型输出漂移。

模型仍可能返回符合 schema 但被 UX 拒绝的内容（空字符串、纯空白、500 个字符、Markdown 围栏、控制字符）。`sanitizeTitle` 会处理所有这些情况并返回 `''` → 服务返回 `{ok: false, reason: 'empty_result'}`。

### 调用参数

| 参数         | 值                          | 原因                                                                                          |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `model`           | `getFastModel()` — 无回退 | 使用主模型 token 进行自动标题生成成本过高，不适合静默执行。                                |
| `schema`          | `TITLE_SCHEMA`                 | 强制 `{title: string}`；在传输层过滤结构漂移。                           |
| `maxOutputTokens` | `100`                          | 对于 7 个单词加上 schema 开销来说绰绰有余。                                              |
| `temperature`     | `0.2`                          | 高度确定性——会话标题在重新生成时受益于稳定性。               |
| `maxAttempts`     | `1`                            | 标题是尽力而为的装饰性元数据；重试会排在用户可见的主流量之后。 |

与 session-recap 回退到主模型不同，标题生成会在每次助手回复后自动且频繁地触发。如果未配置快速模型的用户被静默收取主模型 token 费用，成本差异在月度账单到来前是不可见的。手动 `/rename --auto` 在失败时会明确返回 `no_fast_model` 而非回退——强制用户有意识地选择快速模型。

## 历史记录过滤

`geminiClient.getChat().getHistory()` 返回的 `Content[]` 包含工具调用、工具响应（通常是 10K+ token 的文件内容）以及模型思考部分。将这些原始数据直接输入标题 LLM 会导致标签偏向实现细节噪音，例如“在 auth 模块上调用了 grep”。

`filterToDialog` 仅保留包含非空文本且无 `thought` / `thoughtSignature` 部分的 `user` / `model` 条目。`takeRecentDialog` 截取最后 20 条消息，并拒绝以悬空的模型/工具响应开头。`flattenToTail` 将其转换为“角色: 文本”行，并截取最后 1000 个字符。

### 1000 字符尾部截取

如果一个会话以 `help me debug X` 开头，但随后转向重构 Y，则标题应围绕 Y。按头部打标题会锁定开场框架；按尾部打标题则能捕捉会话的实际走向。

### UTF-16 代理对处理

在 UTF-16 代码单元边界上使用 `.slice(-1000)` 可能会在截断 CJK 辅助平面字符或 emoji 时留下孤立的高位或低位代理对。某些提供商会对无效的 UTF-16 返回 400 错误——如果不加处理，会无谓地消耗一次尝试。`flattenToTail` 会丢弃开头孤立的低位代理对；`sanitizeTitle` 也会在输出路径的最大长度截断后清理任何孤立的代理对。

## 持久化

### 记录结构

`CustomTitleRecordPayload` 新增可选字段 `titleSource: 'auto' | 'manual'`：

```jsonc
{
  "type": "system",
  "subtype": "custom_title",
  "systemPayload": {
    "customTitle": "Debug login button on mobile",
    "titleSource": "auto",
  },
}
```

该字段为可选，旧记录中缺失该字段时视为 `undefined`。`SessionPicker` 仅在严格匹配 `=== 'auto'` 时才会置灰行——变更前的用户 `/rename` 标题绝不会被静默重新分类为模型猜测。

### 恢复时的状态水合 (Hydration)

恢复时，`ChatRecordingService` 构造函数会调用 `sessionService.getSessionTitleInfo(sessionId)` 以同时读取标题及其来源。如果不水合来源信息，`finalize()` 的重新追加（在每个会话生命周期事件中运行）会在每次恢复周期中将 auto 重写为 manual——从而静默剥离置灰的视觉提示。

### 原子对读取

`extractLastJsonStringFields` 在单次扫描中从**同一匹配行**返回 `customTitle` 和 `titleSource`。两次独立的 `readLastJsonStringFieldSync` 调用可能会落在不同的记录上（如果旧行仅包含主字段），从而导致配对不匹配。提取器还要求主值具有正确的闭合引号，因此崩溃截断的尾部记录无法在最新匹配竞争中胜出。

### 全文件扫描上限

阶段 2（当尾部窗口快速路径未命中时）会以 64KB 块流式读取整个文件。上限设为 `MAX_FULL_SCAN_BYTES = 64 MB`，以防止损坏的多 GB JSONL 在主事件循环中冻结会话选择器。选择器的延迟预算在文件损坏时仍能保持。

### 符号链接防御

会话读取使用 `O_NOFOLLOW` 打开（在 Windows 上回退为普通只读读取，因为该常量未暴露）。纵深防御机制，确保植入 `~/.qwen/projects/<proj>/chats/` 的符号链接无法将元数据读取重定向到无关文件。

## 并发与边界情况

### 触发守卫顺序

`maybeTriggerAutoTitle` 按以下确切顺序检查六个条件——每个条件都会短路后续检查，因此优先执行开销小的检查：

1. `currentCustomTitle` set → skip. 已设置 `currentCustomTitle` → 跳过。绝不覆盖手动或先前的自动标题。
2. `autoTitleController !== undefined` → skip. `autoTitleController !== undefined` → 跳过。同一时间仅允许一次尝试。
3. `autoTitleAttempts >= 3` → skip. `autoTitleAttempts >= 3` → 跳过。上限控制总体资源浪费。
4. `!config.isInteractive()` → skip. `!config.isInteractive()` → 跳过。无头模式 `qwen -p` / CI 绝不会为一次性会话消耗快速模型 token。
5. `autoTitleDisabledByEnv()` → skip. `autoTitleDisabledByEnv()` → 跳过。`QWEN_DISABLE_AUTO_TITLE=1` 显式退出。
6. `!config.getFastModel()` → skip. `!config.getFastModel()` → 跳过。无快速模型 → 无操作。

### 为什么上限是 3 而不是 1

首次助手回复可能是纯工具调用，没有用户可见的文本（例如模型以 `grep` 开头）。此时 `tryGenerateSessionTitle` 会返回 `{ok: false, reason: 'empty_history'}`。如果没有重试窗口，整个会话获取标题的机会就会在第 1 轮被浪费掉，而此时用户尚未输入任何有意义的内容。上限设为 3 可覆盖常见的“首轮是噪音”情况，同时仍能限制快速模型持续失败时的无限重试。

### 跨进程手动重命名竞争

同一会话文件的两个 CLI 标签页在内存中可能产生分歧。标签页 A 运行 `/rename foo` 并写入 `titleSource: manual`。标签页 B 的 `ChatRecordingService` 拥有自己的 `currentCustomTitle = undefined`，可能会天真地用自动标题覆盖它。

LLM 调用解析后，IIFE 会通过 `sessionService.getSessionTitleInfo` 重新读取 JSONL。如果文件显示 `source: 'manual'`，IIFE 会中止并同步其内存状态，以便后续轮次也尊重该重命名。成本：每次成功生成仅一次 64KB 尾部读取；可忽略不计。

### finalize() 上的中止传播

`autoTitleController` 同时充当进行中标志。`finalize()`（在会话切换和进程关闭时运行）会在重新追加标题记录之前调用 `autoTitleController.abort()`。LLM socket 会被迅速取消；会话切换不会等待缓慢的快速模型调用。IIFE 的 `finally` 块仅在 `autoTitleController` 仍是活动状态时才会清除它，因此飞行中的 finalize 不会与并发的 `recordAssistantTurn` 发生竞争。

### 手动 /rename 在飞行中到达

在 IIFE 的 `await` 完成和 `recordCustomTitle('auto')` 调用之间，用户可能会执行 `/rename foo`。IIFE 会重新检查 `this.currentTitleSource === 'manual'` 并中止。进程内检查和跨进程重新读取都会运行；手动操作在两层均胜出。

## 配置

### 面向用户的控制项

| 设置 / 环境变量           | 默认值 | 效果                                                                                              |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `fastModel`                 | 未设置   | 自动标题生成必需。未设置 → 无操作（无主模型回退）。                                  |
| `QWEN_DISABLE_AUTO_TITLE=1` | 未设置   | 在不取消设置 `fastModel` 的情况下退出自动触发。`/rename --auto` 仍可按需工作。 |

无 `settings.json` 开关——环境变量是唯一的用户可见关闭开关。理由：该功能是装饰性的且成本低廉；设置开关会为少数想禁用它的用户增加 UI 表面，而一次性环境变量导出即可满足需求。

### 为什么自动不回退到主模型

自动标题生成会在每次助手回复后无条件触发。如果未配置快速模型的用户被静默收取主模型 token 费用，成本差异在月度账单到来前是不可见的。静默失败（无操作、无标题、无成本）是更安全的默认行为。`/rename --auto` 会将 `no_fast_model` 作为可操作的错误提示，以便用户按需设置。

## 可观测性

`createDebugLogger('SESSION_TITLE')` 会从生成器的 catch 块中发出 `debugLogger.warn`。失败对用户完全透明——自动标题是辅助功能，绝不会向 UI 抛出异常。

开发者可以在调试日志中 grep `[SESSION_TITLE]` 标签（`~/.qwen/debug/<sessionId>.txt`；`latest.txt` 符号链接指向当前会话）。一次成功的端到端调用不会产生日志输出；失败的调用会生成一条包含底层错误消息的 WARN 行。

## 安全加固

标题值会原样渲染在终端（会话选择器）中，并持久化存储在用户可读的 JSONL 文件中。如果受损或被提示注入的快速模型返回恶意文本，这两个表面都会受到攻击。

| 关注点                                     | 防护                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ANSI / OSC-8 / CSI 注入                | `stripTerminalControlSequences` 在 JSONL 写入和选择器渲染前执行。                                                    |
| 通过 OSC-8 走私可点击链接            | 同上——OSC 序列作为整体单元被剥离，而不仅仅是 ESC 字节。                                                          |
| 无效 UTF-16 代理对                   | 在 `flattenToTail`（LLM 输入）和 `sanitizeTitle`（LLM 输出最大长度截断后）中清理。                               |
| 通过用户消息内容伪造 subtype 行 | `lineContains: '"subtype":"custom_title"'`——碰巧包含该字面短语的用户文本无法覆盖真实记录。 |
| 会话读取时的符号链接重定向           | `O_NOFOLLOW`（在缺少该常量的 Windows 上为无操作）。                                                                |
| 截断的尾部 JSONL 记录             | `extractLastJsonStringFields` 要求记录在最新匹配竞争中胜出前必须具有闭合引号。                            |
| 异常文件大小冻结选择器  | 阶段 2 全文件扫描上限 `MAX_FULL_SCAN_BYTES = 64 MB`。                                                                  |
| 成对的 CJK 括号装饰符 (`【Draft】`) | 作为整体单元剥离，避免单独的闭合括号悬空。                                                                  |

## 不在范围内 (Out of Scope)

| 项目                                        | 原因                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 标题过时时自动重新生成   | `/rename --auto` 是显式的用户触发路径。静默的会话中标题切换会混淆在选择器中回溯的用户。 |
| WebUI / VSCode 置灰样式对齐           | 这些界面已读取 `customTitle`，并会将自动标题显示为手动标题。后续更新可接入 `titleSource`。           |
| 自动生成的设置对话框开关  | 环境变量是唯一的控制项。如果用户需求浮现，后续可轻松添加完整的设置 UI。                                                  |
| 新字符串的 i18n 语言目录条目 | 与现有的 `/rename` 字符串保持一致，后者会回退到英文。仓库范围的 i18n 处理不在范围内。                           |
| 重新分类旧记录的迁移     | 设计上保持向后兼容：缺失 `titleSource` 视为手动。重写旧记录可能会丢失用户意图。                      |
| 非交互模式自动标题生成                | `qwen -p` / CI 脚本会丢弃会话；为无人会恢复的会话消耗快速模型 token 纯属浪费。                         |