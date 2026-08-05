# 代码托管 Channel 适配器 — 设计

## 概述

GitHub 轮询适配器让 AI 代理通过轮询通知 API 来监视 GitHub 上的任务，并把代理响应作为 issue/PR 评论发出。与 IM 适配器（实时 webhook/长轮询）不同，该适配器按间隔轮询。

## 架构：通知作为唤醒信号

核心洞见：平台通知是**线程级**且**可变**的——任何活动（评论、push、标签变更）都会推高 `updated_at`。通知不能用作可靠的按评论事件流。

相反，通知只充当**唤醒信号**（“这个线程上发生了某事”）。适配器随后通过平台的评论 API 枚举实际评论，并使用按线程的水位线来判断哪些评论是新的。

## GitHub：基于游标的评论窗口

### 通知/评论时间戳解耦

一个关键的时序问题：**通知 `updated_at` 和评论 `updated_at` 是解耦的**。

- `notification.updated_at` 会被_任何_线程活动（评论、push、标签变更）推高，且受投递延迟影响
- `comment.updated_at` 反映评论实际被创建/编辑的时间

这两个时间戳没有因果关系。通知可以在触发它的评论之后 16 秒才到达，又可能被无关活动再次推高。因此用通知时间戳来门控评论枚举会产生两种失败模式：

1. **重复回复** — `PUT /notifications` 是异步的（202 Accepted），带 `last_read_at` 截止点。机器人的回复会在服务器处理标记之前把 `updated_at` 推过截止点，于是通知永远不会被标记为已读。下一次轮询重新获取它并重复处理相同的评论。
2. **漏回复** — 游标推进到 `max(notification.updated_at)`，可能跳过迟到通知上的评论。当这些通知最终到达时，其评论落在游标窗口之下，被静默排除。

### 设计

正确性来自**基于游标的评论窗口**，而不是通知的已读状态：

轮询周期：

1. `GET /notifications?since={cursor-1s}` — 发现未读线程
2. 保存 `windowSince = cursor.lastProcessedAt`（本次轮询推进**之前**的游标）
3. `markNotificationsAsRead(maxUpdatedAt)` — 尽力而为的全局标记（清理非 issue 通知）
4. 把全局游标推进到 `max(notification.updated_at)`
5. 按线程：`listComments(since=windowSince)` — 枚举评论
6. 排除：机器人自己的评论；`created_at > maxUpdatedAt` 的评论（窗口之上）；`created_at <= windowSince` 的评论（窗口之下）
7. 处理：提及检测 → 封包 → `handleInbound`

有效的评论窗口是 `(windowSince, maxUpdatedAt]`。前一次轮询处理过的评论满足 `created_at <= windowSince`（前一次轮询的 `maxUpdatedAt`），会被排除。无论 `PUT /notifications` 是否成功，这都能防止重复。评论编辑不会重新触发处理——只有 `created_at` 用于窗口成员判断。

全局标记仍会被调用（步骤 3）以清理非 issue/PR 通知并减少未读列表，但它对去重不起承重作用。

### 已知限制：通知投递延迟

由于游标是全局的（不是按线程的），一个在晚于其评论 `created_at` 的轮次才到达的通知，其评论可能被游标窗口排除。这要求通知投递延迟跨越了一个轮询边界，**并且**在此期间另一个线程的评论把游标推进到了它们之后。实际上这个窗口很窄（通知投递通常在一个轮询间隔内完成）；用户可以重新提及来重试。

### 已知限制：PR 评审评论

`issues.listComments` 只返回普通会话评论，不返回 PR 评审评论（按行的 diff 评论）。PR 评审评论中的 @提及会被静默丢弃。请改用 PR 上的普通会话评论。

### 场景行为

| 场景                          | 行为                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 新线程（评论中 @bot）      | 出现（未读）→ 自游标起枚举 → 处理                                                                           |
| 已有线程，新评论      | 再次出现（未读）→ 自游标起枚举 → 旧评论被 `<= windowSince` 排除 → 只剩新评论                            |
| 非评论活动（push/标签） | 出现 → 窗口内零条新评论 → 跳过                                                                                  |
| 用户在 github.com 上标记已读     | 从 API 消失 → 不处理                                                                                           |
| markNotificationsAsRead 失败     | 游标窗口仍防止重复 → 对正确性无影响                                                            |
| markRead 之后、完成之前崩溃 | 游标未保存 → 下次启动重新获取相同通知 → 崩溃批次被重新处理，不会丢失                          |
| 机器人回复了一个线程           | `updated_at` 被推高 → 通知可能保持未读 → 下次轮询获取它 → 评论被游标窗口排除 → 无重复 |
| 正文中 @bot 的新 issue       | 无评论 → 正文包含提及 → 把正文作为触发源（通过 `dispatchedBodies` 去重）                                   |

## PollingChannelBase

`PollingChannelBase<Cursor>`（位于 `packages/channels/base/`）扩展 `ChannelBase`，提供轮询循环基础设施：

- **轮询循环**：通过 `startPollLoop()`/`stopPollLoop()` 启动/停止，从 `connect()`/`disconnect()` 调用
- **轮询间隔**：从 channel 配置 `pollInterval`（毫秒）读取，验证为正的有限数，默认 60000
- **游标持久化**：每次成功的 `pollOnce()` 之后原子保存 JSON 游标；构造时加载（损坏或无法解析的日期 → 回退到 `createInitialCursor()`）
- **游标验证**：`validateCursor()` 虚钩子 — 基类拒绝非对象和数组；子类添加形状检查（例如 GitHub 拒绝缺失/无效的 `lastProcessedAt` 日期）
- **退避**：轮询错误时指数退避 2s → 30s，成功时重置
- **可中止睡眠**：`abortableSleep(ms)` 作为受保护方法暴露 — 轮询间隔和错误退避可通过 `disconnect()` 中断

子类只需实现：

- `pollOnce()` — 执行工作，修改 `this.cursor`
- `createInitialCursor()` — 首次运行的默认值

`Cursor` 泛型是任意可 JSON 序列化的对象。GitHub 使用 `{ lastProcessedAt: string; dispatchedBodies?: string[] }`（后者把首次接触的正文去重限制在最近的 500 条）。

## 提及检测

基于正文的、大小写不敏感的正则。检测（`testBotMention`）和剥离（`stripBotMention`）是独立的函数：

- 检测：显式正则匹配返回布尔值 — 绝不从剥离前后对比推断（空白差异会造成误报）
- 剥离：只移除 `@bot`，保留所有其他格式（不折叠空白）

## 会话范围

轮询适配器使用 `chat_thread` 范围：路由键 = `channel:chatId:threadId`。这防止跨仓库的会话冲突（`repo-a/issue:42` 与 `repo-b/issue:42`）。

## 错误处理

投递是**尽力而为**的。`handleInbound` 失败时，每个线程每个轮询周期发一条错误评论（然后 `break` 退出评论循环——防止 N 条相同的错误评论）；用户重新提及即可重试。按通知的 API 错误使用 `continue` — 一条失败的通知不阻塞批次的其余部分。没有 `subject.url` 的通知（Discussion、SecurityAlert 类型）被静默跳过。

如果进程在处理中途崩溃，游标不会被保存（它只在 `pollOnce()` 完成后才持久化），因此下次启动会重新获取相同的通知——但基于游标的评论窗口会排除已处理的评论，防止重复。

去重**不**依赖 `PUT /notifications` 成功。全局标记是尽力而为的清理；游标窗口才是承重的去重机制。
