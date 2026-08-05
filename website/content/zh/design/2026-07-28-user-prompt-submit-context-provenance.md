# UserPromptSubmit hook 上下文的来源标记

Issue: https://github.com/QwenLM/qwen-code/issues/7940

## 问题

`UserPromptSubmit` hook 可以返回 `additionalContext`，客户端会把它作为裸
text part 追加到发出的请求上。由于 `recordUserMessage` 持久化的是增强后的
请求，注入的文本会落入用户记录的 `message.parts`，与用户自己写的文本无法
区分。

后果：

- **恢复**：UI 投影会拼接所有 text part，因此恢复的会话会把 hook 注入的
  上下文显示得像是用户输入的。
- **离线分析 / 下游消费方**：JSONL 会话记录无法把用户文本和注入分开；消费
  方只能依赖脆弱的自定义标记剥离启发式。
- **遥测与自动内存回忆**：两者都在注入后消费 `partToString(request)`，污染
  了 prompt 属性和回忆查询。

实时 TUI 不受影响（它从 hook 前的输入构建历史条目），这正是让被污染的会话
记录容易被忽略的不对称性。

## 设计

与两个既有模式同构：`SessionStart` 上下文作为带标记的块注入系统指令，
轮次中/通知记录把模型方向的 `message` 与 `systemPayload.displayText` 投影
分开。

### 写路径

1. **带标记注入**（`client.ts`）：净化后的 `additionalContext` 作为独立 part
   追加，包裹在
   `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>`
   中。`getAdditionalContext()` 会转义 hook 输出中的 `<`/`>`，因此包裹标记
   无法从内部被关闭或伪造。用户自己写的文本绝不被改写或转义。`promptText`
   必须在把它捕获进 `preInjectionPromptText` 的注入赋值之前声明（避免在
   外层 Goal try/catch 日后被重排时出现 TDZ）。
2. **显示来源**（`chatRecordingService.ts`）：`recordUserMessage` 接受可选的
   `UserPromptRecordPayload { displayText? }`，存储为 `systemPayload`。
   `message` 保留与模型方向完全一致的 Content——恢复必须重放模型实际看到
   的内容——而 `displayText` 保留注入前的用户投影。hook 注入的文本保留在带
   标记的 `message.parts` 条目中（机器可解析）。该载荷只在 hook 确实注入了
   上下文时才写入。
3. **遥测与回忆**（`client.ts`）：当发生注入时，`addUserPromptAttributes`
   和 `MemoryManager.recall` 使用注入前的 prompt 文本。

### 读路径（恢复投影）

`resumeHistoryUtils` 通过三形态回退投影纯用户记录：

- (a) 新记录：优先 `systemPayload.displayText`；
- (b) 仅带标记的记录（无载荷）：丢弃末尾整体上就是带标记块的 part——只做
  整 part 严格匹配，因此仅仅包含该标记的用户正文绝不会被剥离。唯一 part
  匹配标记形态的也会被保留（注入总是追加在用户自己的 part 之后，因此单
  part 记录只可能是用户自己写的）；
- (c) 旧版裸注入记录：保持不变的拼接。

`@` 命令恢复分支在存在时仍优先 `AtCommandRecordPayload.userText`；只有
缺失 `userText` 的回退才走 `extractUserRecordDisplayText`，因此末尾的带标记
part 不会覆盖 `@` 命令的显示文本。

## 范围说明

- 聚焦交互式 `UserPromptSubmit` 路径。ACP 会话路径已经记录了注入前的
  prompt 文本，因此它只需要对其模型方向注入做同样的标记包裹（已包含在内）。
  子代理上下文注入（通过 `contextState` 的 `SubagentStart`）需要自己的调查，
  是后续工作。
- 其他会话记录消费方（桌面、web UI）可以在后续采用 `displayText`；在此之前
  它们看到的是带标记形态，至少机器上可识别。

经过 `transcript-replay` 的 `projectUserRecord` 的 ACP/导出/daemon 消费方也
优先 `displayText`，并为无 subtype 的用户记录剥离末尾的带标记 part（与 TUI
恢复路径相同的三形态回退）。
