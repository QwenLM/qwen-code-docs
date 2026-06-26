# 会话标题自动生成

> 由快速模型在首次助理回复后生成的 3-7 词句子式(sentence-case)会话标题。
> 持久化在会话 JSONL 中，带有 `titleSource: 'auto' | 'manual'` 标签，
> 在会话选择器中展示，并可通过 `/rename --auto` 按需重新生成。

## 概述

`/rename` (#3093) 允许用户为会话添加标签，以便之后在选择器中找到它们。但在用户主动重命名之前，选择器显示的是第一条用户提示——通常是截断在句子中间的片段，或者描述的是一个框架性问题，而非会话实际涉及的内容。手动重命名是一种额外的操作，大多数用户不会主动执行。

目标是让会话名称**默认就有用**：

- **描述性**：描述会话实际完成的内容，而不仅仅是开头语句。3-7 个词，句子式（sentence case），类似 git 提交主题风格。
- **尽力而为**：在首次回复后后台触发；如果失败，用户不会看到任何错误。
- **尊重用户**：永远不要覆盖用户通过 `/rename` 有意选择的标题，即使是同一会话的不同 CLI 标签页之间。
- **可显式重新生成**：通过 `/rename --auto` 实现“自动标题已过时/我想要一个新的”场景。

## 触发条件

| 触发方式   | 条件                                                                                                                               | 实现                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **自动**   | 在 `recordAssistantTurn` 触发后执行。如果已有标题、其他尝试进行中、已达上限、非交互模式、环境变量禁用或没有快速模型，则跳过。     | `ChatRecordingService.maybeTriggerAutoTitle` —— 即发即忘 |
| **手动**   | 用户运行 `/rename --auto`                                                                                                          | `renameCommand.ts` 通过 `tryGenerateSessionTitle`         |

两条路径最终都汇聚到同一个函数 —— `tryGenerateSessionTitle(config, signal)` —— 以确保提示词、schema、模型选择以及清理逻辑完全一致。自动触发是后台的尽力而为调用；手动 `/rename --auto` 是阻塞用户操作，失败时会显示具体原因的错误。

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
│  │  maybeTriggerAutoTitle() │── 6 个守卫条件 ──→ IIFE(autoTitleController)│
│  │     │                    │                       │                   │
│  │     └── resume 时通过    │                       ↓                   │
│  │         getSessionTitle- │          tryGenerateSessionTitle          │
│  │         Info 恢复数据    │          (sessionTitle.ts)                │
│  │                          │                       │                   │
│  └──────────────────────────┘          BaseLlmClient.generateJson       │
│                                        (快速模型 + JSON schema)         │
│                                                       │                 │
│  ┌──────────────────────────┐                         ↓                 │
│  │ sessionService.ts        │         sanitizeTitle + sanity 检查       │
│  │                          │                         │                 │
│  │  getSessionTitleInfo()   │◀── 跨进程重新读取       ↓                 │
│  │     使用                 │    写入前重新读取      recordCustomTitle  │
│  │  readLastJsonString-     │                         (…, 'auto')       │
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
│  commands/renameCommand.ts     ─── /rename <name>          → manual     │
│                                ─── /rename                 → kebab      │
│                                ─── /rename --auto          → auto       │
│                                ─── /rename -- --literal    → manual     │
│                                ─── /rename --unknown-flag  → error      │
│                                                                         │
│  components/SessionPicker.tsx  ── 当会话的                               │
│                                   session.titleSource === 'auto' 时变暗 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 文件列表

| 文件                                                 | 职责                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/core/src/services/sessionTitle.ts`          | 单次 LLM 调用 + 历史过滤 + 清理。导出 `tryGenerateSessionTitle`。          |
| `packages/core/src/services/chatRecordingService.ts`  | `maybeTriggerAutoTitle` 触发、守卫条件、跨进程重新读取、finalize 时中止。|
| `packages/core/src/services/sessionService.ts`        | `getSessionTitleInfo` 公共访问器；`renameSession` 接受 `titleSource`。      |
| `packages/core/src/utils/sessionStorageUtils.ts`      | `extractLastJsonStringFields` + `readLastJsonStringFieldsSync` 原子配对读取器。 |
| `packages/core/src/utils/terminalSafe.ts`             | `stripTerminalControlSequences`，由句子式和 kebab 路径共享。               |
| `packages/cli/src/ui/commands/renameCommand.ts`       | `/rename --auto`、标记解析器、失败原因消息映射。                          |
| `packages/cli/src/ui/components/SessionPicker.tsx`    | 当 `titleSource === 'auto'` 时显示暗淡样式。                              |

## 提示设计

### 系统提示词

替换本次调用中主助手的系统提示词，使模型仅尝试为会话添加标签，而不是作为编码助手。

下面的条目与 `TITLE_SYSTEM_PROMPT` 一一对应：

- 3-7 个词，句子式（sentence case，仅首字母和专有名词大写）。
- 结尾无标点，无 markdown，无引号。
- 匹配对话的主要语言；如果是中文，预算大约 12-20 个字符。
- 具体描述用户的真实目标——命名特性、bug 或主题领域。避免模糊的笼统描述如“代码更改”或“帮助请求”。
- 四个好例子（3 个英文 + 1 个中文）和四个坏例子（太模糊 / 太长 / 大小写错误 / 结尾标点）。
- 仅返回一个包含单个 `title` 键的 JSON 对象。

### 结构化输出（JSON schema）

与 session-recap 使用标签包装输出不同，我们使用 `BaseLlmClient.generateJson` 并配合函数调用 schema：

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

为什么使用函数调用而不是自由文本 + 标签提取：

1. 跨提供商可靠性 — 所有兼容 OpenAI 的端点、Gemini 和 Qwen 的原生工具调用都实现了函数调用；标签解析则依赖每个模型遵守文本约定。
2. 无推理前序泄露 — 函数调用参数以结构化方式返回，因此答案之前的“思考”段落不会混入标题。
3. 更简单的后处理 — 单个 `typeof result.title === 'string'` 检查加上 `sanitizeTitle` 就能覆盖所有现实中的模型漂移。

模型仍可能返回 schema 允许但 UX 拒绝的内容（空字符串、仅空白、500 字符、markdown 代码块、控制字符）。`sanitizeTitle` 处理所有这些情况，返回 `''` → 服务返回 `{ok: false, reason: 'empty_result'}`。

### 调用参数

| 参数               | 值                            | 原因                                                                                              |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `model`            | `getFastModel()` — 无降级选项  | 在主干模型上自动生成标题消耗 token 过高，不适合静默进行。                                           |
| `schema`           | `TITLE_SCHEMA`                | 强制返回 `{title: string}`；在传输层过滤形状漂移。                                                |
| `maxOutputTokens`  | `100`                         | 7 个词加上 schema 开销绰绰有余。                                                                   |
| `temperature`      | `0.2`                         | 基本确定性 — 会话标题在重新生成时保持稳定有益。                                                    |
| `maxAttempts`      | `1`                           | 标题是尽力而为的装饰性元数据；重试会在可见的主流量之后排队。                                       |

与 session-recap 对比，后者会降级到主模型。标题生成是自动且频繁触发的；静默消耗主模型 token 而没有用户同意会带来真实的账单意外。手动 `/rename --auto` 在失败时明确返回 `no_fast_model` 而不是降级——迫使用户有意识地选择是否使用快速模型。

## 历史记录过滤

`geminiClient.getChat().getHistory()` 返回 `Content[]`，其中包含工具调用、工具响应（通常 10K+ token 的文件内容）以及模型思考部分。将这些原始数据直接输入标题 LLM 会使标签偏向实现细节，如“Called grep on auth module”。

`filterToDialog` 仅保留 `user` / `model` 条目，这些条目有非空文本且没有 `thought` / `thoughtSignature` 部分。`takeRecentDialog` 切取最近 20 条消息，并拒绝以悬空的模型/工具响应开头。`flattenToTail` 转换为 "Role: text" 行，并切取最后 1000 个字符。

### 1000 字符尾部切片

如果一个会话以 `help me debug X` 开始但转向重构 Y，则标题应该关于 Y。根据头部命名会锁定开头的框架；根据尾部命名能捕捉会话实际变成的内容。

### UTF-16 代理对处理

`.slice(-1000)` 在 UTF-16 码元边界上可能切断高或低代理对，如果遇到 CJK 补充字符或 emoji。某些提供商会对无效 UTF-16 返回 400 错误 —— 如果不处理，会无用地浪费一次尝试。`flattenToTail` 删除开头孤立的低代理对；`sanitizeTitle` 在输出路径上最大长度裁剪后也会清除任何孤立的代理对。

## 持久化

### 记录结构

`CustomTitleRecordPayload` 增加了一个可选的 `titleSource: 'auto' | 'manual'` 字段：

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

该字段是可选的，旧记录中缺失该字段时视为 `undefined`。`SessionPicker` 仅在严格 `=== 'auto'` 匹配时变暗 —— 更改前的用户 `/rename` 标题永远不会被静默重新分类为模型猜测。

### Resume 恢复数据

在 resume 时，`ChatRecordingService` 构造函数调用 `sessionService.getSessionTitleInfo(sessionId)` 来读取**标题及其来源**。如果不恢复来源，`finalize()` 中的重新追加（每次会话生命周期事件都会运行）会在每次 resume 循环中将 auto 重写为 manual —— 从而静默移除暗淡样式功能。

### 原子配对读取

`extractLastJsonStringFields` 在单次扫描中从**同一匹配行**返回 `customTitle` 和 `titleSource`。两次独立的 `readLastJsonStringFieldSync` 调用可能落在不同的记录上（如果旧行只有主要字段），导致不匹配的对。该提取器还要求主要值的结束引号正确，因此崩溃截断的尾部记录不能赢得最新匹配竞争。

### 全文件扫描上限

第二阶段（当尾部窗口快速路径未命中时）以 64KB 块流式读取整个文件。上限为 `MAX_FULL_SCAN_BYTES = 64 MB`，因此损坏的多 GB JSONL 不会卡住主事件循环上的会话选择器。选择器的延迟范围在损坏情况下也能保持。

### 符号链接防御

会话读取使用 `O_NOFOLLOW`（在 Windows 上降级为只读，因为该常量不可用）。深度防御，使植入 `~/.qwen/projects/<proj>/chats/` 的符号链接无法将元数据读取重定向到无关文件。

## 并发与边界情况

### 触发守卫顺序

`maybeTriggerAutoTitle` 按此确切顺序检查六个条件——每个立即短路，以便廉价条件先执行：

1. `currentCustomTitle` 已设置 → 跳过。绝不覆盖手动/之前的自动标题。
2. `autoTitleController !== undefined` → 跳过。一次只进行一次尝试。
3. `autoTitleAttempts >= 3` → 跳过。上限限制总浪费。
4. `!config.isInteractive()` → 跳过。无头 `qwen -p` / CI 从不在一性会话上消耗快速模型 token。
5. `autoTitleDisabledByEnv()` → 跳过。`QWEN_DISABLE_AUTO_TITLE=1` 显式退出。
6. `!config.getFastModel()` → 跳过。没有快速模型 → 无操作。

### 为什么上限是 3 而不是 1

第一次助理回复可能完全是工具调用，没有用户可见的文本（例如模型以 `grep` 开头）。这时 `tryGenerateSessionTitle` 返回 `{ok: false, reason: 'empty_history'}`。如果没有重试窗口，整个会话获得标题的机会就会在用户说任何有趣内容之前被第一次回复消耗掉。上限为 3 可以覆盖常见的“第一次回复是噪音”的情况，同时仍限制在持久失败的快速模型上的无限重试。

### 跨进程手动重命名竞争

同一会话文件的两个 CLI 标签页可能内存状态不一致。标签 A 运行 `/rename foo` 并写入 `titleSource: manual`。标签 B 的 `ChatRecordingService` 有自己的 `currentCustomTitle = undefined`，会天真地覆盖为自动标题。

在 LLM 调用解析后，IIFE 通过 `sessionService.getSessionTitleInfo` 重新读取 JSONL。如果文件显示 `source: 'manual'`，IIFE 退出并同步其内存状态，以便后续回复也尊重重命名。代价：每次成功生成后读取一次 64KB 尾部；可以忽略。

### 通过 `finalize()` 中止传播

`autoTitleController` 同时用作进行中标志。`finalize()`（在会话切换和进程关闭时运行）在重新追加标题记录之前调用 `autoTitleController.abort()`。LLM 套接字立即取消；会话切换不会等待缓慢的快速模型调用。IIFE 的 `finally` 块仅在 `autoTitleController` 仍是活动控制器时清除它，因此中途 finalize 不会与并发的 `recordAssistantTurn` 产生竞争。

### 手动 `/rename` 在半途中到达

在 IIFE 的 `await` 完成和 `recordCustomTitle('auto')` 调用之间，用户可能运行 `/rename foo`。IIFE 重新检查 `this.currentTitleSource === 'manual'` 并退出。进程内检查与跨进程重新读取都会运行；手动在这些层都获胜。

## 配置

### 用户可见的开关

| 设置/环境变量              | 默认值 | 效果                                                                                              |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `fastModel`                | 未设置 | 自动标题生成必需。未设置 → 无操作（无主模型降级）。                                                |
| `QWEN_DISABLE_AUTO_TITLE=1`| 未设置 | 在不取消设置 `fastModel` 的情况下退出自动触发。`/rename --auto` 按需仍然有效。                     |

没有 `settings.json` 开关 —— 环境变量是唯一用户可见的关闭开关。理由：该功能是装饰性的且廉价；对于少数想禁用的用户，通过一次性环境变量导出即可，无需添加 UI 表面。

### 为什么自动触发不降级到主模型

自动标题生成在每次助理回复后无条件触发。如果用户没有快速模型，却在静默中为每个新会话的标题消耗主模型 token，那么成本差异直到月度账单到达才可见。静默失败（无操作、无标题、无成本）是更安全的默认值。`/rename --auto` 会显示 `no_fast_model` 作为可操作错误，以便用户如果想用可以设置快速模型。

## 可观测性

`createDebugLogger('SESSION_TITLE')` 从生成器的 catch 块发出 `debugLogger.warn`。失败对用户完全透明 —— 自动标题是辅助功能，永远不会抛到 UI 中。

开发者可以在调试日志（`~/.qwen/debug/<sessionId>.txt`；`latest.txt` 是当前会话的符号链接）中 grep `[SESSION_TITLE]` 标签。一次成功的端到端调用不会产生日志输出；失败的调用会有一条 WARN 行，包含底层错误消息。

## 安全加固

标题值会在终端（会话选择器）中原样渲染，并持久化到用户可读的 JSONL 文件中。如果被入侵或被提示注入的快速模型返回恶意文本，这两个表面都可能被攻击。

| 关注点                                      | 防护措施                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ANSI / OSC-8 / CSI 注入                     | 在 JSONL 写入和选择器渲染之前使用 `stripTerminalControlSequences`。                                                               |
| 通过 OSC-8 走私可点击链接                   | 同上 —— OSC 序列作为整体单元被剥离，而不仅仅是 ESC 字节。                                                                        |
| 无效 UTF-16 代理对                          | 在 `flattenToTail`（LLM 输入）和 `sanitizeTitle`（LLM 输出在最大长度裁剪后）中清除。                                              |
| 通过用户消息内容伪造子类型行                 | `lineContains: '"subtype":"custom_title"'` —— 用户文本恰好包含该字词不会遮蔽真实记录。                                            |
| 会话读取时的符号链接重定向                   | `O_NOFOLLOW`（Windows 上无此常量，降级为空操作）。                                                                                 |
| 截断的尾部 JSONL 记录                       | `extractLastJsonStringFields` 要求在记录赢得最新匹配竞争之前有结束引号。                                                          |
| 过大文件大小导致选择器卡顿                   | 第二阶段全文件扫描上限 `MAX_FULL_SCAN_BYTES = 64 MB`。                                                                            |
| 成对 CJK 括号装饰（如 `【Draft】`）           | 作为整体单元剥离，以免孤单的闭合括号残留。                                                                                       |
## 不在范围内

| 项目                                                     | 原因                                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 标题过时后自动重新生成                                   | `/rename --auto` 是明确的用户触发路径。在会话中静默更换标题会让滚动回选择器的用户感到困惑。                                                                      |
| WebUI / VSCode 调暗样式风格的一致性                      | 那些界面已经读取了 `customTitle`，会自动将标题视为手动设置。后续可以通过 `titleSource` 进行传递。                                                                |
| 自动生成功能的设置对话框开关                             | 环境变量是唯一的控制开关。如果用户有需求，后续可以轻松添加完整的设置 UI。                                                                                         |
| 新字符串的国际化语言包条目                               | 与现有的 `/rename` 字符串保持一致，这些字符串会默认使用英文。全局的国际化处理不在范围之内。                                                                       |
| 迁移并重新分类旧记录                                     | 设计上保持向后兼容：缺失 `titleSource` 的记录视为手动设置。重写旧记录可能会丢失用户意图。                                                                         |
| 非交互式的自动标题生成                                   | `qwen -p` / CI 脚本会丢弃会话；为无人继续使用的会话使用快速模型生成标题纯属浪费。                                                                                 |