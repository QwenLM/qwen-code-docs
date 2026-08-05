# RFC: "qwen tag" —— 面向 qwen-code 的持久化、多用户、频道常驻 agent（钉钉优先）

> **历史决策记录。** 本草案中“每个 workspace 一个进程 / 每个 workspace 一个 daemon”的前提已被取代。命名的 daemon 管理 channel 现在按归属 workspace 分组，每个归属运行时一个 worker；`--channel all` 仍然仅限主运行时。单一全局 token 和缺少按人类身份仍是当前限制。参见
> [`../daemon-multi-workspace-hardening.md`](../daemon-multi-workspace-hardening.md)。

**状态：** 历史草案 (v2)
**日期：** 2026-06-25
**作者：** (qwen-code)

---

## 变更日志 (v1 → v2)

本次修订解决了 v1 中的所有 Open Decision（现已转为 **Resolved Decisions**，§9），并修复了评审中提出的七个正确性/一致性缺陷。两个核心架构变更如下：

- **OD-1 不再是阻塞项 —— 它已成为确定的架构。** Phase 0 基于当前的 `AcpBridge` 路径发布；**Phase 1+ 将频道托管迁移至 `qwen serve` 守护进程**（通过 `DaemonChannelBridge` / 守护进程频道运行器），以复用 per-session FIFO `promptQueue`、`MultiClientPermissionMediator`、`eventBus`、`/workspace/memory` 以及 rate-limit。所有之前写着“OD-1 open / gates everything”的章节现在均视为已决定，且守护进程承诺已贯穿 §1、§4、§5、§6.1、§6.2、§6.3、§6.4 和 §7。
- **主动触发路径已针对其实际运行的守护进程路径进行了重新设计。** v1 的 `dispatchProactive` 是为 `AcpBridge` 语义（频道侧的 `sessionQueues`）编写的。在守护进程迁移下，`DaemonChannelBridge.prompt()` 在发生重叠时会**抛出 `Prompt already in flight`**（`DaemonChannelBridge.ts:257-261`），而不是进行排队。v2 通过 `ChannelBase.sessionQueues` 对**两种**变体进行主动提示的串行化处理，因此永远不会触发抛出守卫，并在 §6.2 中明确声明了不可取消的不变量。

已纳入的决议和修复：

- **OD-2** 已决定：每个 workspace/channel 一个进程。
- **OD-3** 已决定：Phase 1 采用 `first-responder` + 单一频道级 `clientId`；在存在 `senderId→clientId` 名册和生命周期后，Phase 2 采用 `consensus`/`designated`；在主动轮次中自动拒绝高风险工具。
- **OD-4** 已决定：在共享（thread）群组中，`/clear` 需要显式的 `confirm`，并且在设置了该列表时仅限于 `config.allowedUsers` 使用；`/status` 为只读。（带连字符的 `/clear-channel` 无法被 slash 语法解析；真正的 per-member owner-gate 需等待身份模型 —— OD-3/OD-11。）
- **OD-5** 已决定：修复过时的 `types.ts:42` JSDoc 为 `'steer'`；tag 群组 profile 显式设置 `dispatchMode: 'followup'`。
- **OD-6** 已决定：每轮添加 `[senderName]` 前缀，**不受** `instructedSessions` 限制；**新增一个可选的 `Envelope` 字段 `alreadyPrefixed`**，以便 `collect` 模式下的合成重入跳过重复添加前缀。（修正了 v1 中“无新 envelope 字段”的说法 —— Fix #2。）
- **OD-7** 已使用经过验证的钉钉 API 事实解决（§6.2/§6.5），低置信度项仍被标记。
- **OD-8** 已决定：gateway/daemon 调度器是**唯一**的 cron 所有者；tag session **不会**启动其 in-session 的 `Session` cron；这两个 cron 存储位于不相交的路径上，因此只有当两个调度器为相同的任务运行时才可能发生冲突。
- **OD-9** 已决定：per-process "org" 汇总 + per-channel 窗口，采用最严格优先（strictest-wins），固定每日窗口；v1 在频道侧估算 token，并在守护进程托管后读取守护进程使用量路径。
- **OD-10** 已决定：在 `writeContextFile.ts` 中添加 `channel` scope（+`channelKey`）；channel-base 通过**通过 `ChannelBaseOptions` 注入的 CLI 层回调**获取 write/read 权限（无 `channel-base → core` 依赖）；用户全局位置为 `~/.qwen/channels/memory/`。
- **OD-11** 已决定：`senderName` 仅作建议；`clientId` 是唯一的安全主体；内存中的审计环（audit ring）+ 仅追加的 `~/.qwen` 后续文件。
- **OD-12** 已决定：任何非环回（non-loopback）的守护进程支持的部署都需要 `--require-auth` + token。

除 OD 决议之外的正确性修复：

- **Fix #1 —— 主动触发路径并发** 针对守护进程路径进行了重新设计（§6.2），并对 Phase-0 的 `AcpBridge` 变体和 Phase-1+ 的守护进程变体强制执行不可取消的不变量。
- **Fix #2 —— 消除内部矛盾**：§6.1/G2 不再声称“无新 envelope 字段”；它确认了 `alreadyPrefixed` 字段。
- **Fix #3 —— 设计 memory 连线**（§6.3）：确切的 `ChannelBaseOptions` 更改（`readChannelMemory`/`writeChannelMemory` 回调）以及在 `start.ts` 中由谁构建/注入它们，其中每 session 一次的 bootstrap 读取复用 `instructedSessions` 守卫。
- **Fix #4 —— 设计 `canColdSend` 能力标志**（§6.2）：声明位置、钉钉/飞书如何设置它，以及调度器如何明确报错（fail loud）。
- **Fix #5 —— OD-8 不相交存储澄清**（§6.2）：gateway 存储和 `Session` 存储是不同的路径；唯一的冲突风险是 tag session 同时运行 in-session cron —— 这已被 OD-8 守卫关闭。
- **Fix #6 —— 估算预算执行**（§6.4）：估算可以 WARN/alert，但绝不能硬拒绝（hard-decline）用户提示；仅在真实的守护进程使用量数据上进行硬拒绝。
- **Fix #7 —— `followup` 下的审计归属**（§6.4）：将 `senderId` _与_ 排队的提示一起携带，以便 tool-call/permission 归属于实际执行的轮次，而不是最近排队的发送者。

v1 中经过验证的基准事实（AcpBridge 拓扑、AcpBridge 自动批准、抽象 `sendMessage`、scopes、解析器默认值）保持不变。

---

## 1. 概述

**"qwen tag"** 是一个共享的 qwen-code agent，它驻留在聊天频道中 —— 首先是钉钉群，其次是飞书群 —— 该频道内的任何成员都可以通过 `@` 提及来召唤它。一旦被召唤，它就会针对绑定的 workspace 运行完整的 qwen-code agent 循环（工具、文件编辑、shell、MCP），在工作过程中将其工作流式传输回频道，**跨轮次和重启记住该频道**，并且可以**主动或按计划**采取行动，而无需等待被询问。这类似于 Claude Tag 的形态 —— 一个持久的多用户 agent，它是房间的_常驻居民_，而不是 1:1 的 DM 机器人 —— 但它完全构建在 qwen-code 现有的频道适配器栈（`qwen channel start`、`packages/channels/*`）和 `qwen serve` 守护进程之上，而不是新的托管服务。

本 RFC 的明确前提是：**该形态的响应式部分已基本发布，而主动式/记忆部分尚未发布。** 使 Claude-Tag 风格的_回复_ agent 变得困难的组件 —— 多路复用 session 的长运行进程、保持每 session 一个提示不变量的 agent 传输、多用户 session 路由、per-channel 访问控制、流式卡片渲染以及持久化 session 持久性 —— 已经存在并被当前的频道适配器所使用。_缺失的_ 是一组界限明确的功能，用于将响应式回复机器人转变为常驻 agent：共享 session 中的发送者归属、主动/计划输出路径、per-room 记忆以及多用户治理。本 RFC 将该差距划分为**四个构建领域**，并在 Phase 0-2 中对其进行规范。

> 关于“80%”的说明：早期草案将其表述为“约 80% 已发布”。该数字无法验证且夸大了事实 —— 整个主动引擎（构建领域 2）和 per-room 记忆（构建领域 3）都是全新的，并且特别是在钉钉上，_根本没有_ 出站发起路径。我们将其重新表述为“响应式路径已构建；主动式和记忆路径尚未构建”。

### 约束整个 RFC 的拓扑事实

频道适配器连接到 qwen agent 有**两种截然不同的方式**，位于**两个不同的进程**中，混淆它们是早期草案中最常见的错误：

- **`qwen channel start <name>`（发布路径）。** `start.ts` 构造 **`new AcpBridge(bridgeOpts)`**（`start.ts:213,268,356,435`），并且 `AcpBridge.start()` **生成一个子** `node <cliEntryPath> --acp` 进程（`AcpBridge.ts:53-70`），通过 **stdio** 上的 NDJSON 进行 ACP 通信。这个子进程是一个_独立的 agent_，而不是 `qwen serve` HTTP 守护进程。在这种拓扑中，**没有 HTTP 守护进程、没有 `/workspace/memory` 路由、没有 `MultiClientPermissionMediator`、没有 `eventBus` 重放环，也没有守护进程 `promptQueue`** —— 这些都存在于 `packages/acp-bridge` + `packages/cli/src/serve` 中，而 `qwen channel start` 永远不会实例化它们。这里的提示串行化完全由 `ChannelBase` 在**频道侧**完成（`ChannelBase.ts:356-391` 处的 `activePrompts` 互斥锁 + `:394-470` 处的 `sessionQueues` 链）以及子进程自身的 ACP 每 session 一个提示不变量。`AcpBridge.requestPermission` **自动批准每个工具调用**（`AcpBridge.ts:108-118`）。
- **`qwen serve` + `DaemonChannelBridge`（守护进程托管）。** `DaemonChannelBridge`（`packages/channels/base/src/DaemonChannelBridge.ts`）是一个进程内桥接器，其 `sessionFactory` 生成守护进程 `Session` 对象。此路径在守护进程内运行频道，从而继承了 `acp-bridge` 的 FIFO `promptQueue`（`bridge.ts:232,2855,3082`）、`MultiClientPermissionMediator`、`eventBus` 和 HTTP 路由。**`qwen channel start` 目前不会实例化它**（`start.ts` 中零引用）。塑造主动设计的一个关键易错点是：`DaemonChannelBridge.prompt()` **不会排队 —— 它在重叠时抛出 `Prompt already in flight`**（`DaemonChannelBridge.ts:257-261`）；它最终到达的 FIFO `promptQueue` 位于守护进程/acp-bridge 侧，_在_ 该进程内抛出守卫_之后_。因此，主动引擎必须在频道层进行串行化（§6.2）。

**确定的架构（原 OD-1，现已决定）：** 多客户端守护进程机制通过**将频道托管迁移至 `qwen serve` 守护进程**（从 Phase 1 开始）被复用。

- **Phase 0** 基于当前的 `AcpBridge` 路径发布（身份注入既不需要 HTTP 路由也不需要 mediator）。
- **Phase 1+** 在 `qwen serve` 守护进程下运行频道（通过 `DaemonChannelBridge` 或守护进程频道运行器），因为主动引擎、per-room 记忆持久化和治理都需要守护进程的持久性、路由、`promptQueue`、mediator 和 event bus。

这不再是“开放”或“阻塞”的：Phase 0 连线添加了 `DaemonChannelBridge` 附加路径（或 `--daemon <url>` 标志），以便在 Phase 1 开始时即可进行迁移。gateway 拥有的调度器（§6.2）被构建为**迁移中立**的，因此它在切换前后运行方式完全相同。

### "qwen tag" 的具体定义

"qwen tag" 部署是一个绑定到单个 workspace 的 agent 进程，加上一个 `qwen channel start dingtalk` 适配器，配置为整个群组共享**一个** agent session。必须对齐两个**截然不同的 scope 概念**：

1. **频道路由 scope**（`ChannelConfig.sessionScope`，由 `SessionRouter.routingKey()` 消费）：决定入站消息如何映射到路由键。对于 tag，这必须是 `'thread'`，以便整个群组共享一个路由键（`channel:(threadId||chatId)`，`SessionRouter.ts:53`）。**解析器默认值是 `'user'`，而不是 `'thread'`**（`config-utils.ts:91-92`），因此 tag 配方必须显式设置它。
2. **Bridge/ACP session scope**（`DaemonChannelBridge` / `acp-bridge` `sessionScope`）：决定守护进程如何共享底层的 ACP session。`DaemonChannelBridge.newSession()` 默认将其设置为 `'thread'`（`DaemonChannelBridge.ts:229,240`）；`acp-bridge` 的进程内路径默认设置为 `'single'`（`bridge.ts:709`）。这是一个**独立于频道路由 scope 的旋钮**，并且_不在_ `qwen channel start` 路径上（`AcpBridge.newSession(cwd)` 仅接受 `cwd`，`AcpBridge.ts:131`）。

具备这些条件后：

- **每个房间一个 agent，通过提及召唤。** `GroupGate` 强制执行 `requireMention`（默认为 `true`，`GroupGate.ts:49`），因此 agent 保持沉默，直到被 `@` 提及或它是对机器人的回复（`GroupGate.ts:51`）。多用户键是 `sessionScope: 'thread'`，映射到 `channel:(threadId||chatId)`（`SessionRouter.ts:50-53`），因此每个成员无论发送者是谁都复用相同的 `sessionId`。
- **使用工具进行真正的多阶段工作。** 入站消息通过 `ChannelBase.handleInbound()` 成为提示，它从消息文本、回复引用上下文、附件文件路径以及（每 session 一次）`config.instructions` 构建 `promptText`（`ChannelBase.ts:316-347`），然后通过 `bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` 进行分发（`ChannelBase.ts:425` —— `promptText` 是位置参数；选项对象仅携带图像字段）。
- **将其工作流式传输回房间。** 适配器将增量输出渲染为平台原生卡片（飞书 create/update/finalize，`markdown.ts`；钉钉 markdown 分块，`DingtalkAdapter.ts:144-169`）。
- **记住频道。** `SessionRouter.persist()` / `restoreSessions()` 持久化存储 `sessionId`、目标和 `cwd`，并通过 `bridge.loadSession()` 在重启时重新水合（`SessionRouter.ts:168-244`）；workspace 记忆（`QWEN.md` / `~/.qwen/QWEN.md`）通过 `GET` / `POST /workspace/memory` 进行读写（`workspace-memory.ts`）。此记忆是 workspace/全局 scope 的，而不是 per-room 的 —— 参见构建领域 3。
- **可以主动/按计划采取行动。** 这是尚未端到端存在的部分，也是 Phase 1 的核心。
---

## 2. 动机

常驻多人回复 agent 通常所需的基础设施在本仓库中已基本落地。真正缺失的工作主要集中在四个构建方向。

| Tag 形态所需的能力 | 已具备的能力（引用） |
| --- | --- |
| 长时间运行、多会话进程 | `AcpBridge` 会生成一个长生命周期的 `--acp` 子进程（`AcpBridge.ts:53-70`）；daemon 路径增加了每个会话的 FIFO `promptQueue`（`bridge.ts:232,2855,3082`） |
| 多人“一房一会”路由 | `SessionRouter` 的 `'thread'` 作用域（`SessionRouter.ts:53`），按 channel 覆盖的 `setChannelScope()`（`SessionRouter.ts:40`） |
| @提及召唤语义 | `GroupGate` 的 `requireMention` 默认为 `true`（`GroupGate.ts:49-52`） |
| 访问控制 + 引导流程 | `SenderGate` 白名单 + 配对码流程；gate 先应用于 group 再应用于 sender（`ChannelBase.ts:240-252`） |
| 跨重启的持久化会话映射 | `SessionRouter` 持久化（`SessionRouter.ts:168-244`） |
| Workspace memory 读写 | `GET` / `POST /workspace/memory`（`workspace-memory.ts`）；仅支持 workspace + global 作用域；仅限 daemon |
| 多参与者权限控制 + 审计（仅限 daemon） | `MultiClientPermissionMediator` 包含 `consensus` 法定人数在内的四种策略（`permissionMediator.ts:621-637`）；独立的权限审计 ring（`permission-audit.ts`） |
| 鉴权、限流、回环安全（仅限 daemon） | 全局 bearer token（`auth.ts:259-266`）+ 按 clientId/IP 的分层限流（`rate-limit.ts`） |
| 会话内推送原语（后台任务） | `Session` 通知队列 + `setNotificationCallback()` 将后台任务/监控/shell 输出馈入打开的会话（`Session.ts:688-689,2638-2668`）；`isIdle()` 会将其考虑在内（`Session.ts:777`） |
| 平台投递（钉钉 + 飞书） | 支持流式卡片、媒体、表情回应的可用 adapter（`DingtalkAdapter.ts`、`FeishuAdapter.ts`） |

由于 Phase 1+ 在 daemon 下运行（已确定的架构，§1），上述仅限 daemon 的能力将成为主动引擎、内存持久化和治理的可用能力——而不仅仅是“如果我们迁移就能实现的目标”。

这四个构建方向在 §6 中有详细展开：

1. **用于_声明_ tag 的配置 + 身份（Phase 0）。** 一份有文档记录的配置配方——`sessionScope: 'thread'`、`groupPolicy`、`requireMention`、`instructions`、`dispatchMode`——加上**发送者归属缺失**问题：`handleInbound()` 故意**不**将 `senderName` 注入 `promptText`（`ChannelBase.ts:316-347`；`senderName` 仅在 `ChannelBase.ts:246` 用于访问控制）。在共享的 `'thread'` 会话中，agent 无法分辨_谁_在说话。Phase 0 会注入一个发送者标记，方式与现有的回复引用上下文相同（`ChannelBase.ts:318`）。
2. **主动/外发引擎（Phase 1）。** 目前 channel 边界处**没有主动路径**：`ChannelBase.sendMessage()` 是抽象的（`ChannelBase.ts:81`），且仅在响应内部被调用。在钉钉上，`sendMessage()` 只能通过入站时按 `conversationId` 缓存的短期 `sessionWebhook` 进行回复（`DingtalkAdapter.ts:134-142`），因此**根本无法向冷群发送消息**（`DingtalkAdapter.ts:137-141` 会静默返回）。Phase 1 增加了一个常驻 daemon 的调度器和一条钉钉主动发送路径。
3. **Channel 常驻内存 + 检索（Phase 2，内存部分）。** Workspace memory 是 **workspace 全局的，而非按房间的**：`POST /workspace/memory` 仅接受 `scope: 'workspace' | 'global'`（`workspace-memory.ts:118-125`），并且是一个**严格鉴权的变更路由**（`deps.mutate({ strict: true })`，`workspace-memory.ts:114`）。一个能“记住_这个_ channel”的 tag 需要一个按房间划分的内存命名空间。
4. **多人治理 + 安全（Phase 2，治理部分）。** 适合群组的权限策略、主动操作护栏和取证审计，建立在现有的 `clientId` 级别（而非人类身份级别）机制之上。

---

## 3. 目标与非目标

### 目标

- **G1 — 在钉钉上记录并发布“tag”配置**：提供一个可直接复制粘贴的 `channels.dingtalk` 配方（显式指定 `sessionScope: 'thread'`、列出群组 ID 的 `groupPolicy: 'allowlist'`、`requireMention: true`、`instructions` 以及精心选择的 `dispatchMode`），从而生成一个可用的常驻多人 agent，并复用 `parseChannelConfig()` 和现有的 gates。该配方必须明确指出路由作用域与 ACP 作用域的区别，以及必须覆盖解析器默认的 `'user'`。
- **G2 — 共享会话中的发送者归属。** 将每条消息的发送者标记注入 `promptText`，以便 agent 能够区分 `'thread'` 作用域群组中的发言者，同时不破坏由 `instructedSessions` 跟踪的每会话一次的 `instructions` 注入（`ChannelBase.ts:344-346`）。该标记是**每条消息**级别的（发言者每轮都在变化），且**绝不能**受 `instructedSessions` 限制。这需要**新增一个可选的 `Envelope` 字段 `alreadyPrefixed`**（`types.ts`），以防止 `collect` 模式下的合成重入导致双重前缀——参见 §6.1。（v1 错误地将其描述为“仅格式更改，无新字段”。）
- **G3 — 主动引擎。** 一种机制，用于 (a) 向刚刚没有消息的 channel 发起输出，以及 (b) 独立于任何打开的交互式会话按计划触发，并尽可能通过现有的每会话通知路径进行投递——包括钉钉主动发送 API 和持久化的 `openConversationId` 存储，并明确 token 刷新负责人。在两种拓扑下，都必须通过 `ChannelBase.sessionQueues` 进行序列化，以遵守 ACP 每会话一个 prompt 的不变量（NG6）（绝不能 `steer` 取消人类回合）。
- **G4 — Channel 常驻内存。** 在现有的 `/workspace/memory` 机制和 `instructions` 机制之上，增加按房间的内存命名空间和检索路径。该设计在 `writeContextFile.ts` 中新增了一个 `channel` 作用域（+`channelKey`），并通过**通过 `ChannelBaseOptions` 注入的 CLI 层回调**从 `channel-base` 访问它（无 `channel-base → core` 依赖）。
- **G5 — 多人治理。** 适合群组的权限策略、主动操作护栏和审计，建立在 `MultiClientPermissionMediator` 和权限审计 ring 之上。必须考虑到投票归属于 `clientId` 而非人类身份，并且在单个共享的 `'thread'` 会话中，每个群成员都是_同一个_ daemon 客户端。
- **G6 — 飞书对等支持**，涵盖 G1–G5 的所有内容，作为后续工作。飞书稳定的 `tenant_access_token` 已经支持仅通过 `chatId` 向任何聊天进行主动发送（`FeishuAdapter.ts:622-651`），因此飞书在 G3 中_不需要_新的发送 API——只需要 daemon 级别的唤醒/调度机制。飞书声明 `canColdSend = true`。
- **G7 — 复用优于重新发明。** 每个构建方向都扩展现有机制（gates、router、bridge、mediator、memory routes、会话内通知路径、cron），而不是引入并行的子系统。

### 非目标

- **NG1 — 不是托管的多租户 SaaS。** 一个 daemon 可以托管多个隔离的 workspace 运行时，但它仍然只有一个进程级全局 token、限流器、监听器和故障半径。没有中央控制平面，也没有按人类身份的授权边界。
- **NG2 — 本 RFC 中不包含按人类身份、计费或成本预算。** daemon 的身份模型是**单一全局 bearer token**（`auth.ts:259-266`），并在整个事件总线和权限审计中采用 `clientId` 级别的归属。我们在 prompt 中添加发送者_标记_（G2），但**不**引入经过身份验证的每用户主体、每用户配额或成本跟踪。发送者标记是建议性的 prompt 文本，不是鉴权边界——每个群成员共享 daemon 的单一 workspace 凭据，并且在共享的 `'thread'` 会话中是_同一个_ daemon `clientId`。
- **NG3 — Phase-3 多身份网关不在本文范围内**，仅作为前瞻提及。本 RFC 涵盖 Phase 0–2。
- **NG4 — 飞书是次要的，不是并列主要的。** 钉钉是参考实现，也是所有具体示例的来源。
- **NG5 — Slack 和其他西方平台不在范围内。** 注册的 channel 类型为 `telegram`、`weixin`、`dingtalk`、`feishu` 和 `qq`（`channel-registry.ts:10-14`）；不存在 Slack adapter。
- **NG6 — 不更改 ACP 每会话一个 prompt 的不变量。** 计划/主动 prompt 只是 channel `sessionQueues` 中的另一个条目；它不能与同一会话上的用户回合并发运行，也不能取消用户回合。
- **NG7 — 没有新的聊天作用域内存存储引擎。** Channel 常驻内存（G4）在现有的基于文件的 `QWEN.md`/`AGENTS.md` 文件之上增加_命名空间_层；没有向量数据库或按房间的数据库。

---

## 4. 现状评估

已构建 (B)、部分构建 (P)、缺失 (M)。“File”引用权威符号。“Topology”说明该能力是存在于 `AcpBridge` channel 路径 (A)、`qwen serve` daemon 路径 (D)，还是两者皆有——并且，由于 Phase 1+ 已确定在 daemon 下运行，会在迁移是解锁该能力的关键时标注“→D”。

| 能力 | 当前 qwen-code（文件 / 符号） | 拓扑 | 差距 | 规模 |
| --- | --- | --- | --- | --- |
| 一房一会路由 | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`) | A+D | 默认作用域是 `'user'` (`config-utils.ts:91-92`)；运维必须设置为 `'thread'` | 配置 (S) |
| @提及召唤 | `GroupGate.requireMention` 默认 `true` (`GroupGate.ts:49-52`) | A+D | 无 — 已正确 | — |
| 访问控制 / 引导 | `SenderGate` 白名单 + 配对 (`ChannelBase.ts:240-252`) | A+D | 无 | — |
| 持久化会话映射 | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`) | A+D | 无 | — |
| **Prompt 中的发送者归属** | `handleInbound()` 构建 promptText 时不包含 `senderName` (`ChannelBase.ts:316-347`) | A+D | 从未注入 `senderName`；agent 无法分辨谁在说话；需要新增 `Envelope.alreadyPrefixed` | 代码 (S) |
| Prompt 序列化 | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`)；daemon `promptQueue` (`bridge.ts:2855`) | A (channel) / D (daemon) | `DaemonChannelBridge.prompt()` 在重叠时抛出异常 (`:257-261`) — 主动引擎必须在 channel 侧进行序列化；`dispatchMode` 默认 `'steer'` 会取消对等方 (`:354,371-379`) | 配置 + 代码 (S) |
| **外发发起 / 主动发送** | `ChannelBase.sendMessage()` 为抽象方法 (`:81`)；钉钉仅支持 webhook (`DingtalkAdapter.ts:134-142`) | A+D | 无主动接缝；钉钉冷群无法发送消息；需要 `canColdSend` 能力标志 | 代码 (L) |
| **Daemon 级调度器** | Cron 是会话作用域的 (`Session.ts:667-668`)，在 `dispose()` 时销毁 (`:790-812`) | A+D (gateway) → D (audit/queue reuse) | `serve/` 或 `channels/` 中没有 daemon 调度器端点；gateway 调度器是唯一所有者 (OD-8) | 代码 (L) |
| 会话内推送原语 | `setNotificationCallback` (`Session.ts:2638-2668`) | A+D | 仅投递到_活跃_会话中；无法唤醒已回收的会话 | (复用) |
| **按房间内存** | `/workspace/memory` 作用域为 `workspace\|global` (`workspace-memory.ts:118-125`) | 仅 D | 无聊天/channel 作用域；新增 `channel` 作用域 + CLI 层回调（无 core 依赖） | 代码 (M) |
| 多参与者权限投票 | `MultiClientPermissionMediator` 4 种策略 (`permissionMediator.ts:621-637`) | D (继承自 Phase 1+) | `AcpBridge` 自动批准 (`AcpBridge.ts:108-118`)；投票按 `clientId` 进行，每个 channel 一个客户端 | 代码 (L) |
| 审计跟踪 | `PermissionAuditRing` FIFO 512 (`permission-audit.ts`) | D + channel 侧 ring | 无人类 `senderId`；在内存中，重启时丢失；后续增加 `~/.qwen` 仅追加 | 代码 (M) |
| **Token / 成本预算** | 无（限流仅计算请求数，`rate-limit.ts`） | channel 侧账本 + D 使用量 | 无消费计量；v1 为估算（建议性），仅在 daemon 托管时进行实际扣费 | 代码 (M) |
| 按 channel 的 tool/MCP 作用域 | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`)；MCP 允许过滤器 (`:3327-3333`) | 按 `Config` | 从 channel 到 `--acp` 子进程 (AcpBridge) 没有 spawn-arg 路径；托管后为按 daemon 的 `Config` | 代码 (M) |
| 钉钉主动发送 | 未实现（仅有 `robot/emotion`、`messageFiles/download`） | A+D | 新端点 + 持久化 `openConversationId` + token 刷新（已验证契约，§6.2） | 代码 (L) |
| 飞书主动发送 | 通过 `tenant_access_token` 的 `sendMessage()` (`FeishuAdapter.ts:622-676`) | A+D | 无 — `canColdSend = true` | — |
规模说明：S = 配置/小型代码改动，M = 单个模块 + 接口变更，L = 多包变更或新子系统。

---

## 5. 架构

`qwen tag` **不是一个全新的运行时**。它是在现有适配器栈上嫁接的四个轻量级层。基础层已经提供了一个支持多人协作、可运行工具、配备 MCP 且可通过聊天通道访问的 agent。这四个新层与现有的四个缺口一一对应：(1) **谁在说话** — 发送者身份从未进入 prompt；(2) **无提示主动行动** — 没有主动发起的路径，会话内的 cron 随会话结束而消亡；(3) **记住通道** — 记忆是 workspace 全局的；(4) **治理共享大脑** — 认证使用单一全局 token，没有按通道划分的预算。

下面的每一层都说明了它所假设的拓扑结构（见 §1）。**已确定的拆分**：Phase 0 基于 `AcpBridge`；Phase 1+ 基于 `qwen serve` 守护进程，通过 `DaemonChannelBridge` 实现。

### 基础层（现有）— `qwen channel start` 拓扑（Phase 0）

```
                              一台主机，一个 workspace
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk                                                   │
│                                                                                │
│  ┌────────────────────┐    Envelope     ┌───────────────────────────────────┐ │
│  │ DingtalkAdapter     │ ──────────────▶ │ ChannelBase.handleInbound()       │ │
│  │ (流客户端，         │                 │  1 GroupGate.check (提及/         │ │
│  │  webhooks 按         │ ◀────────────── │    策略/白名单)                   │ │
│  │  conversationId 映射)│   text/markdown │  2 SenderGate.check (配对)        │ │
│  │  sendMessage()       │                 │  3 slash / "!" 命令               │ │
│  └────────────────────┘                 │  4 router.resolve(...)             │ │
│        ▲  sessionWebhook (过期，         │  5 dispatchMode (默认 steer)       │ │
│        │  仅限入站消息)                  └───────────────┬───────────────────┘ │
│        │                                                 │ sessionId            │
│        │                                ┌────────────────▼──────────────────┐ │
│        │                                │ SessionRouter                      │ │
│        │                                │  routingKey(): user|thread|single  │ │
│        │                                │  persist() → JSON (崩溃恢复)        │ │
│        │                                └────────────────┬──────────────────┘ │
│        │   textChunk / toolCall 事件     ┌────────────────▼──────────────────┐ │
│        └─────────────────────────────── │ AcpBridge (非 HTTP 守护进程)        │ │
│                                         │  生成子进程 `node <cli> --acp`      │ │
│                                         │  通过 stdio 的 ClientSideConnection  │ │
│                                         │  requestPermission 自动批准          │ │
│                                         └────────────────┬──────────────────┘ │
└──────────────────────────────────────────────────────────┼─────────────────────┘
                                                             │ ACP / NDJSON (stdio)
                                          ┌──────────────────▼─────────────────────┐
                                          │ 子 agent 进程 (`--acp`)                 │
                                          │  每个 ACP 会话一个执行中的 prompt        │
                                          │  会话内 cron (Session.ts) — 已禁用       │
                                          │  用于 tag 会话 (OD-8)；MCP、工具。       │
                                          │  无 promptQueue/eventBus/mediator        │
                                          └─────────────────────────────────────────┘
```

### 守护进程托管拓扑（Phase 1+）— `qwen serve` + `DaemonChannelBridge`

```
                              一台主机，一个 workspace，一个守护进程
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk  (通道托管在守护进程内)                             │
│  ┌────────────────────┐  Envelope   ┌────────────────────────────────────────┐│
│  │ DingtalkAdapter     │ ──────────▶ │ ChannelBase.handleInbound()            ││
│  │ pushProactive()     │ ◀────────── │  gates → governor.admit → router       ││
│  │ canColdSend = false*│             │  → sessionQueues (FIFO，串行化)          ││
│  └────────────────────┘             └───────────────┬────────────────────────┘│
│         ▲ 主动群组发送                               │ bridge.prompt()          │
│         │ (openConversationId)        ┌───────────────▼────────────────────────┐│
│  ┌──────┴────────────┐               │ DaemonChannelBridge                      ││
│  │ ChannelCronSched   │──fire────────▶│  prompt() 在重叠时抛出异常 (:257-261)    ││
│  │ (网关拥有，        │ 通过          │  → 因此所有 prompt 必须通过              ││
│  │  唯一的 cron 所有者)│ sessionQueues │     sessionQueues 串行化到达             ││
│  └────────────────────┘ 分派主动消息  └───────────────┬────────────────────────┘│
│                                                        │ 进程内 Session           │
│                                       ┌────────────────▼────────────────────────┐│
│                                       │ 守护进程：acp-bridge FIFO promptQueue，   ││
│                                       │  MultiClientPermissionMediator，eventBus， ││
│                                       │  /workspace/memory + /channel 路由，       ││
│                                       │  速率限制，bearer 认证                     ││
│                                       └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
* 一旦主动发送路径上线，DingTalk canColdSend 将变为 true（§6.2）。
```

我们构建所依赖的关键不变量（已验证）：

- **Thread scope 是多人协作的关键。** 在 `'thread'` 模式下，`routingKey()` 返回 `${channelName}:${threadId || chatId}`（`SessionRouter.ts:53`）；`resolve()` 会复用该 key（`:79-83`）。默认 scope 为 `'user'`（`:25`）；在多通道路径中，`qwen channel start` 通过 `router.setChannelScope(name, config.sessionScope)`（`start.ts:361-362`）设置每个通道的 scope，或在单通道路径中通过 `ChannelBase` 构造函数从 `config.sessionScope`（`ChannelBase.ts:62-64`）设置。**多人协作要求操作者设置 `sessionScope: "thread"`。**
- **Prompt 串行化。** 在 `AcpBridge` 上，`newSession(cwd)` 仅接收 `cwd`（`AcpBridge.ts:131`），且 `AcpBridge.prompt()` 没有并发保护 — 串行化由 `ChannelBase` 的 `dispatchMode` 处理：`collect` 进行缓冲（`:361-370,445-463`），`steer` 取消执行中的 prompt（`:371-379`），`followup` 链接到 `sessionQueues`（`:381-383,394-470`）。**运行时默认值为 `'steer'`**（`:354`）；`types.ts:42` 的 JSDoc 写的是 `'collect'` — **已过时；v2 将其修复为 `'steer'`（OD-5）。** 在守护进程路径上，`DaemonChannelBridge.prompt()` 在重叠时**抛出异常**（`:257-261`）；守护进程的 FIFO `promptQueue`（`bridge.ts:2855,3082`）位于该抛出保护_之后_。结果（对 §6.2 至关重要）：所有 prompt — 无论是人工还是主动发起的 — 在到达 `bridge.prompt()` 时，必须已经由 `ChannelBase.sessionQueues` 完成串行化。
- **`sendMessage` 是抽象的。** `ChannelBase.sendMessage()` 是 `abstract`（`:81`）；`DingtalkAdapter.sendMessage()`（`:134-170`）通过每个 `conversationId` 的 `sessionWebhook` 发送，该 webhook 仅在入站时缓存（`:516-517`）且会过期 — 冷群组没有缓存的 webhook，此时调用会**静默返回**（`:137-141`）。
- **Phase 1+ 继承的守护进程不变量。** 一旦通道托管在 `qwen serve` 下（已承诺，§1），`MultiClientPermissionMediator`（`permissionMediator.ts:621-637`）、`eventBus` 重放环（`eventBus.ts:92`）、每个 `SessionEntry` 的 `promptQueue` FIFO（`bridge.ts:2855-3082`）将变得可用。

### 四个新层

```
            ┌───────────── 治理（Layer 4）──────────────┐
            │  按通道的轮次/成本预算门控                  │
            │  主动白名单、免打扰时间、紧急停止开关        │
            └───────────────────────┬───────────────────┘
                                     │ 包裹所有入站 + 出站
 入站     ┌──────────────────────────▼─────────────────────────┐  出站
 ───────▶ │  身份注入（Layer 1）                                │ ────────▶
          │  在 promptText 前添加发送者 + 通道上下文前缀         │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  通道记忆（Layer 3）                                │
          │  按通道的片段，在会话开始时注入；                     │
          │  通过 CLI 层回调（核心辅助）持久化                   │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  主动引擎（Layer 2）                                │
          │  网关调度器 → sessionQueues → bridge.prompt →        │
          │  channel.pushProactive() 带冷群组回退                │
          └─────────────────────────────────────────────────────┘
```

**Layer 1 — 身份注入。** _拓扑：两者皆可；无需守护进程。_ `handleInbound()` 永远不会将 `senderName` 放入 `promptText` 中（`ChannelBase.ts:246` 仅在 `SenderGate.check()` 时读取它；`Envelope.senderName` 存在于 `types.ts:69`）。设计：在 `handleInbound()` 中设置一个由配置控制的注入点，位于 `referencedText` 前缀之后（`:316-319`），由 `envelope.isGroup` 控制，并增加一个新的 `Envelope.alreadyPrefixed` 标志用于 `collect` 重入。详见 §6.1。

**Layer 2 — 主动引擎。** _拓扑：网关拥有的调度器，迁移中立；在 Phase 1+ 的守护进程下运行。_ 会话内 cron 在 `dispose()` 时消亡（`Session.ts:790-803`）；没有守护进程调度器端点。`DingtalkAdapter.sendMessage()` 无法触达冷群组（`:137-141`）。设计：一个驻留在网关的调度器，通过 `ChannelBase.sessionQueues`（绝不使用 `steer`）注入一个 fire，并将完成事件路由到 `channel.pushProactive()`。详见 §6.2。

**Layer 3 — 通道记忆。** _拓扑：通过 CLI 层回调的持久化路径；在通道侧注入。_ 记忆仅为 workspace 全局（`workspace-memory.ts:86-303`）。设计：在会话开始时注入按通道的记忆片段（复用每会话一次的 `instructions` 门控），并在写入路径上增加一个新的 `channel` scope，通过注入的回调从 `channel-base` 到达（无 `channel-base → core` 依赖）。详见 §6.3。

**Layer 4 — 治理。** _拓扑：通道侧的门控包装器；Phase 1+ 守护进程侧的速率限制器。_ 守护进程有一个全局 bearer token（`auth.ts:259-266`），按 `clientId`/IP 进行速率限制，且没有按通道的预算。设计：一个包装 `handleInbound()` 和调度器的 `ChannelGovernor`/`BudgetLedger`。详见 §6.4。

### 数据流 1 — 群组线程中的入站 `@qwen`

此流程在两种拓扑中的形状完全相同；唯一的区别在于串行化和权限的位置。在 `AcpBridge`（Phase 0）上，串行化由 `ChannelBase.sessionQueues` 处理，权限由子进程自动批准；在守护进程（Phase 1+）上，串行化_仍然_是 `ChannelBase.sessionQueues`（守护进程的抛出保护永远不会触发，因为通道层已经完成了串行化），权限通过 `MultiClientPermissionMediator` 流转。

1. **DingTalk → adapter。** 成员发布 "@qwen summarize today's incidents"。流客户端传递包含 `conversationId`、`sessionWebhook`、发送者、`isInAtList` 的 `DingTalkMessageData`。`DingtalkAdapter` 缓存 `webhooks.set(conversationId, sessionWebhook)`（`:516-517`）并发出一个 `Envelope`，其中 `isGroup:true`，`isMentioned:true`，`chatId = conversationId`。
2. **Governor (L4)。** `ChannelGovernor`/`BudgetLedger.admit()` 检查通道轮次/成本预算（在有实际使用数据前为建议性质，§6.4）和紧急停止开关。硬性终止 / 带有实际数值的明确上限 → 拒绝并回复；仅估算值超阈值 → 警告，绝不硬性拒绝（Fix #6）。
3. **Gates。** `GroupGate.check()` 通过（提及满足默认的 `requireMention:true`）；`SenderGate.check()` 通过（`:246`）。
4. **Routing。** `router.resolve(...)` 在 `'thread'` scope 下计算 `dingtalk:<conversationId>`（**需要 `sessionScope:"thread"`**），返回共享的群组 `sessionId`。`persist()` 记录它。
5. **Memory (L3) + identity (L1)。** 在第一轮，按通道的记忆 + `config.instructions` 会被前置一次（`instructedSessions`，`:344-347`）。身份注入为每条消息前置 `[Alice]`。
6. **Attribution capture。** 解析出的 `senderId`/`senderName` 被记录在**带入 `sessionQueues` 的队列项上**（Fix #7），而不是稍后按时间戳拼接。
7. **Dispatch。** tag profile 设置 `followup`（绝不使用 `steer`）；Bob 的并发消息链接到 `sessionQueues`（`:394-470`）。
8. **Bridge。** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` 通过 stdio ACP（`AcpBridge.prompt`，`AcpBridge.ts:147`）转发或转发到守护进程会话（`DaemonChannelBridge.prompt`）— 仅在前一轮已清空 `activePrompts` 时才会到达，因此守护进程的抛出保护（`:257-261`）永远不会被触发。
9. **Stream back。** `textChunk` → `onChunk`（`:416-422`）；`onResponseComplete → DingtalkAdapter.sendMessage()` 使用缓存的 `sessionWebhook`（热群组）。
### 数据流 2 — 定时主动推送到冷群

1. **定时任务触发。** 驻留在网关的 `ChannelCronScheduler` 在 09:00 为 `daily-standup → dingtalk:<convA>` 唤醒。这不是会话内的定时任务（针对 tag 会话已禁用，OD-8/§6.2；且一旦会话被回收就会失效——`dispose()` 会清空 `cronQueue`，`Session.ts:790-803`）。
2. **Governor (L4)。** 检查主动推送白名单和免打扰时间（明确的时区来源）。在窗口外/不在白名单中 → 跳过并记录日志。调度器在尝试投递前会验证 `adapter.canColdSend`；如果为 false，则**显式失败**（记录日志 + 记录 `lastError`），绝不静默无操作（Fix #4）。
3. **合成信封 (Synthetic envelope)。** `senderId:'__cron__'`，`chatId: convA`，`isGroup:true`，`isMentioned:true`，无 `messageId`。合成 prompt 在队列项上携带其自身的归属信息（`createdBy`）。
4. **串行化，绝不抢占。** `dispatchProactive` 链式挂载到 `ChannelBase.sessionQueues` 并等待任何进行中的人类回合（`activePrompts.get(sessionId)?.done`）。它**绝不**调用 `steer`/`cancelSession`，也**绝不**在持有 `activePrompts` 时调用 `bridge.prompt()` —— 因此守护进程的 `Prompt already in flight` 抛出异常（`:257-261`）不会被触发（§6.2，Fix #1）。
5. **冷群发送。** `pushProactive(convA, text)` 发现 `webhooks.get(convA)` 为 undefined，并回退到新的主动推送路径：持久化的 `openConversationId`、全新的应用凭证 token，POST 请求 `https://api.dingtalk.com/v1.0/robot/groupMessages/send`，参数为 `robotCode = config.clientId`、`msgKey:'sampleMarkdown'`、`msgParam`（一个 JSON _字符串_）。（在飞书上，步骤 5 是通过 `tenant_access_token` 调用现有的 `sendMessage()`；`canColdSend = true`。）
6. **预算 + 审计。** 主动回合消耗频道的预算桶（在守护进程托管的用量可用之前为建议性扣减）；记录时以 `createdBy` 作为发起身份，并在传输层记录 `originatorClientId`（不捏造人类身份，`eventBus.ts:60`）。

### 为什么采用这种设计（复用优于重新发明）

每个新层都挂载在现有的接缝处：身份在 `promptText` 构建处，主动推送在 `sessionQueues` + `pushProactive()`，记忆在 `instructions`/`writeContextFile` 机制中，治理作为 gate 链的包装器。唯一的**结构前提**——第 2-4 层复用守护进程机制——已由承诺的守护进程迁移（§1）满足：Phase 0 在 `AcpBridge` 上发布；Phase 1+ 在 `qwen serve` 下运行。

---

## 6. 详细设计

### 6.1 多人协作与身份（构建区域 1）

“qwen tag” 存在于群聊中。每个成员都与_同一个_ agent 对话，该 agent 必须：(a) 为整个频道维护一个共享会话，(b) 知道每个回合是_谁_在说话，(c) 不让一个成员的消息破坏另一个成员正在运行的任务，以及 (d) 理想情况下，针对高风险的工具调用向_群组_请求批准。qwen-code 今天已具备 (a)-(c) 的原语；(d) 是守护进程托管的 Phase-1+ 工作（已承诺的迁移，§1）。

#### 群组共享会话：`sessionScope: 'thread'`

在 `'thread'` 模式下，`senderId` 会从路由键中移除，因此每个成员都会解析到同一个 `sessionId`（`SessionRouter.ts:53,72-92`）—— 这使得 agent 成为一个共享的、驻留在频道中的实体，而不是 N 个私有 bot。

- **按频道设置作用域，而非全局切换。** Router 默认值为 `'user'`（`:25`），频道配置默认值也是 `'user'`（`config-utils.ts:91-92`）。私聊 (DMs) 和单用户频道保持为 `'user'`。tag profile 在 `settings.json` 中设置 `sessionScope: 'thread'`，通过 `setChannelScope()`（多频道，`start.ts:361-362`）或 `ChannelBase` 构造函数（单频道，`ChannelBase.ts:62-64`）按频道应用。
- **钉钉 `threadId`/`chatId` 稳定性。** 钉钉适配器从不设置 `Envelope.threadId`（`DingtalkAdapter.ts:541-551`），因此 `routingKey()` 会将 `threadId || chatId` 回退到 `chatId`，从而将一个群组折叠为每个 `chatId` 一个会话（符合预期）。**注意：** `chatId = conversationId || sessionWebhook`（`:534`）。对于真实的群消息，`conversationId` 存在且稳定；如果某条消息没有它，`chatId` 会回退到_即将过期_的 `sessionWebhook` URL，导致 thread key 不稳定。profile 会将缺失 `conversationId` 视为硬错误（丢弃该消息），而不是静默地使用 webhook 作为 key。

持久化涵盖了崩溃恢复（`SessionRouter.ts:168-244`）：守护进程重启会通过 `bridge.loadSession()` 将群组重新附加到同一个共享会话。

#### 新风险：thread 作用域的 `/clear` 和 `/status` 是频道全局的

共享的 `/clear` 处理器调用 `router.removeSession(this.name, senderId, chatId)`（`ChannelBase.ts:147-152`），`/status` 调用 `router.hasSession(...)`（`:203-208`）；两者都通过 `routingKey()` 路由，而该函数**在 `'thread'` 模式下会忽略 `senderId`**。因此，任何单个成员的 `/clear` 都会清除整个频道的共享会话并重置 `instructedSessions` —— 这是一个一键重置所有人的隐患。

**已解决 (OD-4)：** 在**共享（thread）群组**中，`/clear`（及其别名）需要显式的 `confirm` token，并且在设置了 `config.allowedUsers` 列表时受其限制；否则直接清除（私聊和按用户划分的群组只触及调用者自己的会话，因此不需要 gate）。该命令保留 `/clear` 名称，因为斜杠解析器只接受 `[a-zA-Z0-9_]`（带连字符的 `/clear-channel` 会被解析为 `clear` + 参数 `-channel`）；显式的 `confirm` 是破坏性操作的提示。真正的按成员划分的 owner-gate（独立于聊天白名单区分管理员和成员）需等待身份模型（OD-3/OD-11）。**`/status` 在共享会话上保持只读**。

#### 发送者归属缺失及修复方案

`handleInbound()` 从 `envelope.text`、`referencedText` 引用前缀、附件路径以及每会话一次的 `config.instructions` 构建 `promptText`（`ChannelBase.ts:315-347`）；`envelope.senderName` 仅用于 `SenderGate.check()`（`:246`）。在 `'thread'` 群组中，agent 看到的是一个无差别的消息流。

**修复 (OD-6) — 在 prompt 构建的顶部（`:315-316`），为群组回合添加 `[senderName]` 前缀，每个回合都执行：**

```ts
let promptText = envelope.text;

// Multiplayer attribution: in a thread-shared session, tag each turn with the
// speaker. Skip 1:1 sessions (sender is invariant). Must fire EVERY turn —
// not gated by instructedSessions (the speaker changes each message). The
// alreadyPrefixed flag lets collect-mode synthetic re-entry skip this step.
if (envelope.isGroup && !envelope.alreadyPrefixed) {
  const who = envelope.senderName || envelope.senderId || 'unknown';
  promptText = `[${who}] ${promptText}`;
}

if (envelope.referencedText) {
  promptText = `[Replying to: "${envelope.referencedText}"]\n\n${promptText}`;
}
```

- **基于 `envelope.isGroup` 进行判断**（`types.ts:75`），而非基于 scope。
- **在 `referencedText` 之前添加前缀**，使得顺序读起来像 `[Alice] [Replying to: "..."] <text>`。
- **使用 `senderName`，而不是 `senderId`。** 在钉钉上 `senderName = data.senderNick || 'Unknown'`（`DingtalkAdapter.ts:544`），永不为空；`senderId → 'unknown'` 的链路是防御性的。
- **`collect` 模式下的双前缀隐患，通过一个新字段解决。** 合并重入会构建一个 `syntheticEnvelope`，其 `text` 是已添加前缀的合并字符串，并重新进入 `handleInbound()`（`:449-462`），这会**再次**添加前缀。**v2 增加了一个新的可选 `Envelope` 字段 `alreadyPrefixed?: boolean`（`types.ts`）**；`collect` 合成信封将其设置为 `true`，上述前缀步骤在设置时会跳过。（这纠正了 v1 中关于该更改是“仅格式更改，无新信封字段”的说法——Fix #2。这是本 RFC 引入的唯一新信封字段；bridge/ACP 协议保持不变。）

#### 群组默认 `dispatchMode`：`steer` → `followup`

`steer`（运行时默认值，`:354`）通过 `bridge.cancelSession()`（`:371-379`）取消进行中的 prompt。在共享群组中，如果 Bob 在 agent 处理 Alice 的请求时发送任何消息，`steer` 会_取消 Alice 的任务_ —— 意外的拒绝服务。**tag profile 设置 `dispatchMode: 'followup'`**，这样 Bob 的消息会排在 Alice 的任务后面（`sessionQueues` FIFO，`:381-383,394-470`）。在群组 profile 上设置（`groups["*"].dispatchMode = "followup"`），而不是翻转全局默认值 —— 私聊保留 `steer` 的自我中断 UX。除了文档化的 profile 默认值外，**无需更改代码**；v2 **修复了过时的 `types.ts:42` JSDoc 为 `'steer'`**，使代码和注释保持一致（OD-5）。`collect` 对于流量极高的群组是可以接受的（限制队列深度），但代价是归属信息模糊。

因为 tag profile 对于群组**始终是 `followup`（绝不 `steer`）**，主动推送引擎继承了一个清晰的不变量：不存在 steer 与主动推送的竞争，因为 tag 群组中没有任何路径会取消进行中的 prompt。这个不变量在 §6.2 中被重申并强制执行。

#### 交接 —— “接续上一个人的工作”

借助 `'thread'` + `[senderName]` 前缀 + `followup`，交接_就是_默认行为：会话保存了完整的多说话人历史。两个易用性附加功能：一个只读的 **`/who`** 命令（通过 `protected registerCommand(name, handler)`，`:141-143` —— 而不是私有的 `commands` map）用于报告活动的 `sessionId`/`cwd`/任务摘要；以及在重启时的幂等重新附加（已由 `restoreSessions()` 涵盖）。

#### 多成员审批 —— 阶段规划 (OD-3, 已决定)

意图是正确的：高风险的工具调用应该可以由群组批准，并且 qwen-code 提供了具有四种策略的 `MultiClientPermissionMediator`（`permissionMediator.ts:348,621-637`）。**但在 Phase-0 的 `AcpBridge` 路径上，频道无法触及这些功能：**

1. **`qwen channel start` 连接 `AcpBridge`，其 `requestPermission` 会自动批准**每个请求（`AcpBridge.ts:108-118`）。完全没有审批提示。
2. 该 mediator 位于守护进程的 HTTP serve 层。唯一具备权限处理能力的频道 bridge 是 `DaemonChannelBridge`（`respondToPermission`，`:346-374`）—— 在 Phase 1 将频道托管迁移到守护进程后才会触及（已承诺，§1）。
3. `config.approvalMode` 是一个**死字段** —— 被解析（`config-utils.ts:94`）和定义类型（`types.ts:36`），但没有被任何适配器或 bridge 读取。

**已决定的阶段规划：**

- **Phase 0：** 无群组审批。通过发送者白名单 + `requireMention` + 保守的 agent 工具集来控制风险。不要声称 `approvalMode` 有任何作用。
- **Phase 1：** 频道在 daemon-bridge 路径上运行（已承诺的迁移）；将 `permission_request` 呈现为钉钉卡片；发布**带有单一频道级 `clientId` 的 `first-responder`**（任何被允许成员的点击即可解决；归属粒度为频道级）。不需要 `senderId → clientId` 映射。**在主动回合自动拒绝高风险工具**（源自 `__cron__` 的回合无法回答权限提示）。
- **Phase 2：** 一旦存在 `senderId → clientId` 映射和 `clientId` 生命周期（回收、引用计数边界），则添加按成员的 `consensus`/`designated`。注意：每个 `senderId` 一个合成 `clientId` 会无限增长 `clientIds` 引用计数映射，必须被回收。

#### 具体更改总结（构建区域 1）

| 更改 | 位置 | 类型 |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| 群组 profile 设置 `sessionScope: 'thread'`                             | `settings.json` + `setChannelScope` (`start.ts:359-363`) | 配置        |
| 将缺失的钉钉 `conversationId` 视为错误                        | `DingtalkAdapter.ts` ~`:534`                             | 代码 (S)      |
| 为群组回合添加 `[senderName]` 前缀                                   | `ChannelBase.handleInbound` ~`:316`                      | 代码 (S)      |
| 新增可选的 `Envelope.alreadyPrefixed` 字段                           | `types.ts` (Envelope)                                    | 代码 (S)      |
| 在 `collect` 合成重入时设置 `alreadyPrefixed`                   | `ChannelBase.ts:449-462`                                 | 代码 (S)      |
| 在共享群组中 `/clear confirm` + 白名单 gate；`/status` 只读 | 共享命令 (`:147-217`)                             | 代码 (S)      |
| 群组 profile 设置 `dispatchMode: 'followup'`                           | `settings.json` 中的 `groups["*"]`                         | 配置        |
| 修复过时的 `dispatchMode` JSDoc → `'steer'`                              | `types.ts:42`                                            | 注释修复   |
| `/who` 交接命令                                                  | `registerCommand` (`:141`)                               | 代码 (S)      |
| Daemon-bridge 迁移替换 `AcpBridge` 自动批准               | `DaemonChannelBridge` 托管（已承诺）                | Phase 1 (L)   |
| 按成员审批投票 + 钉钉卡片                              | 新的 bridge 管道 + `respondToPermission`              | Phase 1/2 (L) |
### 6.2 主动引擎：调度器 + 出站推送（核心）

#### 决策：网关拥有的调度器，迁移中立

**采用驻留在 `qwen channel start` 网关进程中的调度器。** 网关拥有 `SessionRouter`（包含 `restoreSessions()` 恢复机制 — `start.ts:275,444`），持有每个 adapter 实例及其 bridge，并且是唯一可以调用 `ChannelBase.pushProactive()`（以及底层的抽象方法 `sendMessage()`，`:81`）的地方。Agent（无论是 Phase 0 中生成的 `--acp` 子进程，还是 Phase 1+ 中的 daemon session）始终保持为纯粹的 prompt 执行器：调度器通过将任务入队到 `ChannelBase.sessionQueues` 来触发，只有在前一个 turn 排空后才会调用 `bridge.prompt()` —— **没有新的 bridge 方法，没有反向通道，没有 daemon 推送路由。**

> **拓扑说明（已确定的架构）。** 调度器在**构造上就是迁移中立的**：无论底层使用哪个 bridge，它都通过 `ChannelBase.sessionQueues` 进行序列化。在 Phase 0 中，它通过 stdio 驱动 `AcpBridge.prompt()`；在 Phase 1+ 中，它驱动 `DaemonChannelBridge.prompt()`（daemon 托管）。由于 daemon 的 `eventBus` 审计和 FIFO `promptQueue` 是 Phase 1+ 治理所需要的，因此从 Phase 1 开始，channel 在 `qwen serve` 下运行 —— 但调度器自身的逻辑在迁移边界处不会发生改变。

为什么不选择其他替代方案：

- **`Session` 内置 cron：** 被否决 —— `cronQueue`/`cronProcessing` 存在于进程内的 `Session` 中（`Session.ts:667-668`），仅在 session 打开时触发，并在 30 分钟空闲回收时的 `dispose()` 中销毁（`:790-812`）。这正是网关调度器要避免的故障。**并且网关调度器是唯一的 cron 所有者（OD-8）：tag session 永远不会启动其进程内的 cron**（门控机制见下文）。
- **独立进程：** 被否决 —— 第二个长生命周期进程会重复 DingTalk 凭证，且无法复用进程内的 `SessionRouter` 和已附加的 bridge。

#### 组件与位置

| 组件                               | 文件                                                                        | 职责                                                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChannelCronStore`                 | `packages/channels/base/src/ChannelCronStore.ts` (new)                      | 持久化任务表，与 `sessions.json` 同级的 JSON 文件。使用 `atomicWriteJSON` (`atomicFileWrite.ts:385`) + 每文件独立的 `async-mutex` `Mutex`。                                              |
| `ChannelCronScheduler`             | `packages/channels/base/src/ChannelCronScheduler.ts` (new)                  | 单个可重新触发的 `setTimeout`（单元素时间轮）；通过 `nextFireTime` 计算下次触发时间；重启追赶机制；60 秒协调器 tick。每个网关一个；唯一的 cron 所有者。                                  |
| Cron primitives                    | `packages/core/src/utils/cronParser.ts` (reuse)                             | `parseCron`/`matches`/`nextFireTime` (`:104,141,168`)。不要重新实现。                                                                                                                  |
| `dispatchProactive`                | `ChannelBase.ts` (extend)                                                   | 通过 `sessionQueues` 注入触发；等待任何进行中的人工 turn 的 `activePrompts.get(sessionId)?.done`；绝不 `steer`；在持有 `activePrompts` 时绝不调用 `bridge.prompt()`。                     |
| `pushProactive`                    | `ChannelBase.ts` (extend; base default = `sendMessage`) + DingTalk override | 出站投递；DingTalk 针对冷群（cold groups）进行重写。由 `canColdSend` 能力进行门控。                                                                                                    |
| `canColdSend`                      | `ChannelBase` property (default `false`)                                    | 调度器在冷发送前检查的能力标志；一旦主动 API 路径上线，DingTalk 会将其翻转为 `true`；Feishu 为 `true`。                                                                                |
| DingTalk proactive send            | `packages/channels/dingtalk/src/proactive.ts` (new) + `DingtalkAdapter.ts`  | 通过 `robotCode` + 存储的 `openConversationId` 发送主动消息/群发（契约已在下方验证）。                                                                                                 |
| Wiring                             | `start.ts` (extend `startSingle`/`startAll`)                                | 在 `router.restoreSessions()` (`:275,444`) 之后构建并启动调度器；将 `isTagSession` 标志传递到 session 构造中（OD-8）。                                                                 |
| `/schedule` + `schedule_task` tool | `ChannelBase.handleInbound()` (extend, after gates `:240-252`)              | 优先处理确定性命令；其次处理模型工具。                                                                                                                                                 |

#### `canColdSend` 能力标志（修复 #4）

跨平台 MVP 标准（“同一个任务在 DingTalk 和 Feishu 上都能交付”）需要一个能力标志，以便调度器能够推理可达性，而不是通过静默失败来发现它。

- **声明为 `ChannelBase` 上的属性：** `protected readonly canColdSend: boolean = false;`。（放在基类上，而不是单独的 `ChannelPlugin` 注册表上，因为调度器已经持有 adapter 实例，且 `pushProactive`/`sendMessage` 是实例方法 —— 将标志与其保护的方法放在同一个类型中，可以保持内聚。）
- **DingTalk：** 在主动发送路径（`proactive.ts`）上线并持久化可用的 `openConversationId` 之前，`canColdSend = false`；一旦实现了 `pushProactive`，则翻转为 `true`。当为 `false` 时，DingTalk 仍然可以响应热（webhook）turn —— `canColdSend` 仅控制_冷群_投递。
- **Feishu：** `canColdSend = true`（通过 `tenant_access_token` 进行原生主动发送，`FeishuAdapter.ts:622-676`）。
- **调度器显式失败（fails loud）：** 在触发投递前，调度器会检查 `adapter.canColdSend`。如果为 `false`，它**不会**尝试 `pushProactive`；而是记录一个对运维人员可见的错误，设置 `job.lastStatus='error'` + `lastError='adapter cannot cold-send'`，在 `/schedule list` 中展示，并（根据策略）递增 `consecutiveFailures`。它绝不会静默地无操作（no-op）。

#### 不相交的 cron 存储 + OD-8 门控（修复 #5）

有两条 cron 持久化路径，并且**它们位于不相交的文件系统路径上**，因此它们永远不会读写相同的任务：

- **网关存储（新增）：** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` —— channel 全局，与 `sessionsPath()` 同级（`start.ts:56-58`），用户拥有，位于工作树之外。
- **Session 存储（现有）：** 每个 session 的 `Session` cron 使用**按项目哈希**的目录 `~/.qwen/tmp/<hash>/scheduled_tasks.json`（`cronTasksFile.ts:1-9`）。

由于路径不相交，持久化任务重复触发的唯一可能是**tag session 除了网关调度器之外，还运行了其进程内的 `Session` cron**。**OD-8 封闭了这一点：** 网关调度器是唯一的 cron 所有者；channel 托管的（"tag"）session **不会**启动其进程内的 cron。

**门控机制 —— session 如何得知自己是 tag session。** tag session 在构造时会带有一个从 channel 宿主传递过来的显式标志：

- 在 Phase 1+ 的 daemon 路径上，`DaemonChannelSessionFactory` 已经接收一个结构化的选项包（`{ workspaceCwd, modelServiceId, sessionScope }`，`DaemonChannelBridge.ts:226-241`）。向该包中添加 `isTagSession: true`；daemon `Session` 在构造时读取它并**跳过 `startCronScheduler()`**（否则该调用点会触发 `cronQueue`，`Session.ts:667-668`）。销毁时已经在回收时清理 cron（`:790-803`），因此 tag session 只是简单地永远不触发它。
- 在 Phase 0 的 `AcpBridge` 路径上，子 agent 同样不能为 tag 工作区触发进程内 cron；通过 `--acp` 生成选项传递相同的标志（一个新的 `AcpBridgeOptions` 字段，作为标志转发到 `Config` 中）。在该标志传递落地之前，Phase 0 根本不会注册任何进程内 cron 任务（`/schedule` 命令针对的是网关存储），因此没有东西会重复触发。

这使得剩余的风险纯粹是运维层面的：“不要为相同的任务运行两个调度器” —— 而门控机制保证了 tag session 永远不会启动第二个调度器。

#### 持久化存储 Schema 与重启恢复

该 schema 与 `DurableCronTask` 平行（`cronTasksFile.ts:19-26`：`id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` —— 字段是 `cron`，**不是** `cronExpr`）：

```ts
interface ChannelCronJob {
  id: string; // randomUUID()
  channelName: string;
  target: {
    // 镜像 SessionRouter PersistedEntry (SessionRouter.ts:5-9)
    channelName: string;
    senderId: string; // 系统任务为 "__cron__"
    chatId: string; // DingTalk openConversationId —— 持久化的冷群 ID
    threadId?: string;
  };
  cwd: string; // 加载时验证 == 绑定的工作区
  cron: string; // 5 字段 (parseCron) 或 "@once:<epochMs>"
  prompt: string;
  label?: string;
  recurring: boolean;
  enabled: boolean;
  createdBy: string; // senderId；在单 token 模型下为建议值；带入触发的归因中
  createdAt: number;
  lastFiredAt: number | null;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  consecutiveFailures: number; // N 次后自动禁用（例如 5 次）
}
```

在每文件独立的 `async-mutex` `Mutex` 下通过 `atomicWriteJSON` 写入。**重启恢复**在 `start.ts` 中于 `router.restoreSessions()`（`:275`/`:444`）_之后_执行：

1. `bridge.start()` → `restoreSessions()` 重新加载 `sessions.json` 并为每个条目调用 `bridge.loadSession()`。
2. `store.load()`；丢弃 `cwd !== boundWorkspace` 的条目。
3. `scheduler.start()`：为每个启用的任务计算 `nextFireTime(job.cron, new Date())`。**漏触发策略（RFC 决策）：在停机期间逾期的周期性任务会立即触发一次然后恢复 —— 绝不重放积压**（向活跃群组中涌入积压消息会导致垃圾消息事件）。过去的一次性任务触发一次后删除。`cronScheduler.ts` 在 `:81-89,608-707` 处区分 `{ kind: 'catch-up'; ids }`（周期性）和 `{ kind: 'missed'; tasks }`（一次性，需先确认）；我们对周期性任务采用合并为一次（coalesce-to-one）的策略。
4. 为最近的任务触发单个 `setTimeout`；每次触发后重新设置。添加一个 60 秒的协调器 tick（先例：`lockProbeTimer`，`cronScheduler.ts:229,507-538`），从 `Date.now()` 重新计算以吸收挂起/恢复带来的时钟偏差 —— 绝不累积间隔。

#### 触发路径：注入到共享群组 session（修复 #1 —— 最关键的一个）

每个 session 一个活跃 prompt 的不变量因拓扑结构而异，且 v1 的 `dispatchProactive` 在 daemon 路径上处理错了：

- **Phase 0（`AcpBridge`）：** `AcpBridge.prompt()`（`:147-180`）**没有自己的并发保护**；唯一的序列化机制是 `ChannelBase.sessionQueues`/`activePrompts`（`:29-35,394,466`）以及 `--acp` 子进程自身的 ACP session。
- **Phase 1+（`DaemonChannelBridge`）：** 当 `activePrompts.has(sessionId)` 时，`DaemonChannelBridge.prompt()` **会抛出 `Prompt already in flight`**（`:257-261`）—— 它**不会**排队。FIFO `promptQueue`（`bridge.ts:2855,3082`）位于 daemon/acp-bridge 侧，_在_该进程内抛出保护_之后_。因此，在人工 turn 活跃时调用 `DaemonChannelBridge.prompt()` **会抛出异常**而不是等待。

**重新设计（在两种拓扑下均正确）：在 turn 进行中时绝不调用 `bridge.prompt()`；在 channel 层通过 `sessionQueues` 进行序列化，首先等待 `activePrompts`。** 因为 `sessionQueues` 会将主动运行链接到前一次运行解析_之后_，所以在调用 `bridge.prompt()` 时，`activePrompts.get(sessionId)` 已经清空 —— 因此在 daemon 路径上永远不会触发抛出保护，而在 `AcpBridge` 路径上，未受保护的 `prompt()` 也永远不会重叠。
```ts
// ChannelBase.ts — 复用私有属性 sessionQueues/activePrompts (:29-35)。
// 对 AcpBridge（Phase 0）和 DaemonChannelBridge（Phase 1+）的工作方式完全相同：
// 链式调用保证 bridge.prompt() 仅在前一轮对话结束后才运行，
// 因此 DaemonChannelBridge 的 Prompt already in flight 抛出异常 (:257-261) 不会被触发。
async dispatchProactive(sessionId: string, promptText: string): Promise<string> {
  const prev = this.sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const active = this.activePrompts.get(sessionId);
    if (active) await active.done;            // 等待人工对话结束 — 绝不进行 steer-cancel (:371-379)
    return this.bridge.prompt(sessionId, promptText);   // 此时 activePrompts 才会被清空
  });
  this.sessionQueues.set(sessionId, run.then(() => {}, () => {}));
  return run;
}
```

**不变量：主动对话（proactive turn）绝不会被后续的人工对话取消，也绝不会取消人工对话。** 针对两种变体的执行保证如下：

- **无主动→人工取消：** `dispatchProactive` 从不调用 `steer`/`cancelSession`。它只会 `await` `activePrompts.get(sessionId)?.done`，然后将其排在队列后面。
- **无人工→主动取消：** tag group 的配置为 **`followup`（绝不使用 `steer`）**（§6.1）。由于 `steer` 是唯一会调用 `bridge.cancelSession()` 的 `dispatchMode`（`:371-379`），且 tag group 永远不会选择它，因此传入的人工对话只能通过 `sessionQueues` 排在正在进行的主动对话_之后_ — 它无法取消主动对话。（在 daemon 路径中，`DaemonChannelBridge.cancelSession`（`:332`）仅从 `steer` 分支到达，而 tag group 排除了该分支。）
- **Throw-guard 永不触发：** 在两条路径中，`bridge.prompt()` 仅在 `sessionQueues` 链的尾部被调用，此时前一次运行已 resolve，且（对于人工对话）`activePrompts` 已排空 — 因此 `DaemonChannelBridge` 的重叠抛出异常（`:257-261`）在结构上对于 tag 流量是不可达的。

触发时：

1. **解析共享 session**：通过 `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)`（`SessionRouter.ts:72`）。`'thread'` 会映射到整个 group 的一个 `sessionId`，因此触发点会落在人工可见的上下文中。如果恢复的 session 已丢失，`resolve()` 会创建并持久化一个新的。
2. **入队，绝不抢占**（通过 `sessionQueues` 进行 followup）。刻意不使用 `steer`。
3. **标记 + 归因（Fix #7）。** 添加前缀 `[Scheduled task "<label>" set by <createdBy>]\n`。`createdBy` 身份**随排队的 run 一起传递**，而不是稍后通过时间戳拼接，因此在此触发期间引发的任何 tool-call/permission 都会归因于_本次_主动对话（§6.4）。
4. **捕获 + 推送。** `dispatchProactive` 返回完成文本；调度器检查 `adapter.canColdSend`，然后调用 `channel.pushProactive(target.chatId, text)`（如果为 `false` 则 fail-loud 报错）。

#### 钉钉冷群推送

**已验证的限制：** `DingtalkAdapter.sendMessage()` 仅通过每个 `conversationId` 缓存的 `sessionWebhook` 发送（`:84,134-142`），且仅在有入站消息时填充（`:505-517`）。冷群会导致静默返回（`:137-141`）。

**修复方案 — 通过钉钉主动消息群发 API 实现 `pushProactive`（契约已验证，OD-7 已解决）。** 该调用方式在仓库中也有先例（`emotionApi` 向 `api.dingtalk.com/v1.0/robot/...` 发送 POST 请求，带有 `x-acs-dingtalk-access-token` header 和 `{ robotCode, openConversationId, ... }` body，`:188-197`）。

**已验证的 endpoint 和参数**（完整源码说明见 §6.5；各项置信度已注明）：

- **Endpoint：** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _（高置信度；官方发送文档 + aliyun ask/559227）_。
- **`robotCode`**（必填，string）：将机器人安装到群组时的机器人标识符；与企业内部机器人的 `appKey` 属于同一值空间 → 使用 `config.clientId`（`:184,435`）。无需新凭证。_（高置信度）_
- **`openConversationId`**（必填，string）：目标群组的以 `cid` 为前缀的开放会话 ID；错误码 `miss.openConversationId`/`invalid.openConversationId` 确认其为必填且会进行校验。持久化到 `ChannelCronJob.target.chatId` 中 — 与 `sessionWebhook` 不同，它在重启后依然稳定。_（高置信度）_
- **`msgKey`**（必填，string）：消息模板 key；markdown 使用 **`'sampleMarkdown'`**（纯文本使用 `'sampleText'`）。_（高置信度；消息类型文档 + aliyun ask/585232）_
- **`msgParam`**（必填，**JSON 编码的 _string_**，而非嵌套对象）：对于 `sampleMarkdown`，该字符串为 `"{\"title\":\"<预览标题>\",\"text\":\"<markdown 正文，最大约 5000 字符>\"}"`。_（高置信度；markdown 标题/正文字段来自消息类型文档，正文示例逐字摘自 aliyun ask/585232）_
- **`coolAppCode`**（可选）：仅当机器人作为群酷应用安装时需要；对于普通的企业内部应用机器人不需要。_（中置信度）_
- **`conversationId` == `openConversationId`？** 对于标准群 @-回调，**将回调的 `conversationId`（以 cid 为前缀）直接作为 `openConversationId` 使用** — 社区来源证实了这一点，且 `cid` 格式匹配。**标记（中置信度）：** 官方文档中没有逐字说明对于标准（非酷应用）机器人两者等同的明确句子。文档保证的路径是 `chatId → openConversationId` 转换 API（或从建群 API / `chooseChat` JSAPI / 直接传递 `openConversationId`+`coolAppCode` 的酷应用回调中捕获）。**回退规则：** 如果发送返回 `invalid.openConversationId`，则回退到 `chatId → openConversationId` 转换 API。

```ts
const GROUP_SEND = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'; // 高置信度

async pushProactive(chatId: string, text: string): Promise<void> {        // DingtalkAdapter 覆写
  const token = await this.tokenManager.get();        // 独立于 SDK 连接生命周期进行刷新
  const robotCode = this.config.clientId;
  if (!token || !robotCode) { /* 刷新一次；否则设置 lastError 并返回 */ return; }
  for (const chunk of normalizeDingTalkMarkdown(text)) {  // 如果模板长度预算匹配，则复用分块器
    const msgParam = JSON.stringify({ title: extractTitle(text), text: chunk });  // msgParam 是一个 STRING
    await sendGroupMessage({ token, robotCode, openConversationId: chatId,
      msgKey: 'sampleMarkdown', msgParam });            // 如果遇到 invalid.openConversationId → 通过 chatId API 转换并重试
  }
}
```

`sendMessage()` 变为：首先尝试缓存的 `sessionWebhook`（成本低，不消耗 token）；否则回退到 `pushProactive()`。**基础默认值** `pushProactive = (chatId, text) => this.sendMessage(chatId, text)`，因此**飞书无需覆写**（`FeishuAdapter.sendMessage()` 已经可以使用稳定的 `tenant_access_token` 向任何 `chatId` 进行主动发送，`:622-676`；`canColdSend = true`）。钉钉是唯一存在差异的 adapter — 即钉钉优先的不对称性。上述 `canColdSend` 标志使引擎在遇到仅支持响应式的 adapter 时能够 **fail-loud（显式报错）**，而不是静默丢弃。

**硬性部署约束（非代码）：** 组织机器人必须 (a) 是已发布的企业内部机器人，(b) 被授予主动群消息发送权限，(c) 是目标群的成员（通过群酷应用 / 企业内部应用 / 第三方应用安装，持有其 `robotCode`）_（高置信度：必须启用某项权限；高置信度：机器人已安装 + robotCode 是前提条件）_，(d) 记录其 `openConversationId`。我们在机器人首次看到群内_任何_入站消息时持久化 `conversationId`，因此“冷”指的是_空闲_，而非_从未见过_；真正从未见过的群在通过转换 API 获取其 `openConversationId` 之前无法被推送（硬性限制）。**必需的 adapter 更改：** 目前仅缓存 `sessionWebhook`（`:516-517`）；我们还必须持久化 `conversationId`（建议存储：独立的 `~/.qwen/channels/dingtalk-groups.json`，与 session 生命周期解耦，以便表示冷群和无活跃 session 的 cron 任务）。

> **仍需标记（低置信度）— 根据 OD-7 保持可见：** (1) 钉钉应用权限管理控制台中“主动发送群消息”的**确切权限点代码/显示名称**在文档中未明确固定 — 钉钉在应用的权限管理中将其显示为机器人/消息发送权限（通常是机器人消息系列，例如 `qyapi_robot_sendmsg` / 企业机器人发送消息权限）；请在控制台内确认，不要硬编码断言该代码。(2) 本次会话中未找到官方逐字说明标准（非酷应用）机器人的回调 `conversationId` 等同于 `openConversationId` 的权威单句 — 这是一个高概率的捷径，但文档保证的获取路径是 `chatId → openConversationId` 转换 API。钉钉开放平台页面是 JS 渲染的，本次会话无法完全抓取；endpoint/参数/token 事实是通过 apifox 文档镜像和引用官方请求示例的阿里云开发者问答交叉确认的。

#### 认证与 token 生命周期（已验证；核心可行性风险）

**Auth header（高置信度）。** 所有 v1.0 调用（包括 `groupMessages/send`）都在请求 header 中传递 token：`x-acs-dingtalk-access-token: <accessToken>` 加上 `Content-Type: application/json` — 这与 `emotionApi()`（`:188-207`）和 `downloadMedia()`（`media.ts:36-43`）已经使用的 header 完全一致。

**Token 获取（高置信度）。** 企业内部应用，v1.0 风格：`POST https://api.dingtalk.com/v1.0/oauth2/accessToken`，JSON body 为 `{"appKey":"<appKey>","appSecret":"<appSecret>"}` → `{ "accessToken": "...", "expireIn": 7200 }`。（旧版等效接口 `GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..` 返回 `{access_token, expires_in:7200}`，但该旧版 token 用于旧的 `oapi` endpoints；对于 `api.dingtalk.com` v1.0 APIs，请在 `x-acs-dingtalk-access-token` header 中使用 v1.0 的 `accessToken`。）

**过期与缓存（高置信度）。** Token 在 **7200 秒（约 2 小时）** 后过期，过期后**必须**重新获取；在有效期内重复获取会返回相同的 token 并续期。**按应用缓存；不要在每次请求时都调用 token endpoint**（频繁调用会被限流）。

**为什么这是核心风险。** Stream SDK 在 `getEndpoint()`（`client.mjs:85-87`）中通过 `GET .../gettoken` **仅在连接时获取一次** `access_token`，且**从不刷新**；`getAccessToken()` 返回缓存的值（`DingtalkAdapter.ts:172-174`）。`autoReconnect` 仅在 socket _关闭_ 时重新获取（`client.mjs:157-163`）— 一个稳定的长连接 socket 会在约 2 小时的 TTL 之后持有一个过期的 token，并且任何主动发送（以及现有的 emotion/media 路径）在过期后都会静默失败。**主动功能必须接管 token 刷新：** 一个 `tokenManager`，通过 v1.0 `oauth2/accessToken` endpoint 在定时器上（在约 2 小时过期前）和/或在收到 401 时获取 token，按应用缓存，独立于 SDK 连接生命周期（OD-7）。这是最可能导致“demo 中正常，2 小时后挂掉”的故障点。

**限流（已验证，混合置信度 — 保持标记）：** (1) 钉钉标准版每应用服务端 API 并发约 20 QPS，每月 Open API 配额约 10,000 次/月（专业版约 50 万，专属版约 500 万）_（中高置信度）_。(2) 经常被引用的每机器人 **20 条消息/分钟 → 约 10 分钟限流** 限制是针对**自定义群 webhook 机器人**记录的；它通常被作为组织应用机器人发送路径的实用指南，但在本次会话中**未**在 `groupMessages/send` 页面上明确确认 — **将 `groupMessages/send` 的确切 20 条/分钟数字视为中/低置信度。** 另外：不要过度调用 token endpoint（有单独的限流）。调度器必须保守地对其自身的发送进行限流，并在收到限流响应时退避。

#### 常驻指令（自然语言循环请求 → 存储 → 消费）

在 `handleInbound()` 通过网关检查后进行两级捕获（`:240-252`）：显式的 **`/schedule "0 9 * * 1-5" post the open PR list`** 命令（使用 `parseCron` 解析，无模型往返），以及 Phase-2 模型工具 `schedule_task(cron, prompt, recurring, label)`。两者都调用 `store.add({...})` → 持久化 → `scheduler.reschedule(job)`，然后在频道内回复。`/schedule list|cancel <id>|disable <id>` 读写该 store。**持久化 fail-closed：** 如果写入抛出异常，则拒绝确认 `/schedule`。
#### 故障模式

- **触发时网关宕机：** 恢复机制会将逾期的周期性触发合并为一次追赶执行；过去的一次性触发会执行一次然后删除。
- **触发过程中 Agent 崩溃：** `bridge.prompt()` 拒绝执行；`attachDisconnectHandler` (`start.ts:241,403`) 会重新生成（Phase 0）/ 守护进程重新附加（Phase 1+）。调度器设置 `lastError`，不为周期性任务打上 `lastFiredAt` 时间戳 → 进行重试。至少执行一次；按分钟取整的触发 key 加上 `lastFiredAt` 进行去重。
- **Session 被回收 / `loadSession` 失败：** `resolve()` 创建全新的 session（群组对话记录丢失；常驻指令必须是自包含的）。Channel memory（§6.3）是恢复的底线。
- **Adapter 无法冷发送 (`canColdSend=false`)：** 调度器记录日志并写入 `lastError`，在 `/schedule list` 中展示；绝不会静默失败。
- **向已移除/权限被撤销的群组进行冷群组推送：** 返回非 2xx 状态码 → 记录 `lastError`；返回 `invalid.openConversationId` → 尝试进行 `chatId → openConversationId` 转换并重试一次。
- **Token 过期：** `tokenManager` 刷新一次并退避；`consecutiveFailures` ≥ N → 自动禁用并留下对运维人员可见的记录。
- **一个 workspace 上有两个网关：** `checkDuplicateInstance()` (`start.ts:170-179`) 保证单实例运行；此外在 `cron.json` 中记录一个锁 token。

### 6.3 Channel 作用域的 Memory 与 Learning（构建区域 3）

一个 tag 必须能够 _随着时间推移记住该群组_，同时不能泄露到同级群组中。目前 qwen-code 的 memory 是 **workspace 全局的**：没有 chat/channel/group/session 维度的区分。

> **拓扑/依赖事实（Fix #3）。** 两个硬性约束决定了连接方式：(1) 在默认的 `AcpBridge` 拓扑中，**没有 `qwen serve` 守护进程，也没有 `POST /workspace/memory` 路由** —— `--acp` 子进程没有 HTTP 客户端；即使在 Phase-1+ 的守护进程迁移之后，memory 路由也**仅限守护进程且需要严格鉴权**（`deps.mutate({ strict: true })`，`workspace-memory.ts:114`）。(2) `@qwen-code/channel-base` 仅依赖于 `@agentclientprotocol/sdk`（`packages/channels/base/package.json`），**不**依赖于 `@qwen-code/qwen-code-core`，因此 `ChannelBase` **不能** `import { writeWorkspaceContextFile }`。因此，修正后的设计通过核心辅助函数**在进程内**写入/读取 channel memory，**由 CLI 层（`packages/cli`，它_可以_依赖 core）通过注入的回调从 `channel-base` 调用** —— 而不是通过 HTTP，也不是通过向 `channel-base` 添加 core 依赖。

#### 当前状态：两种作用域，均非按对话划分

`POST /workspace/memory` 仅接受 `scope: 'workspace' | 'global'`（`workspace-memory.ts:118-125`），通过 `resolveContextFilePath()`（`writeContextFile.ts:223-240`）进行解析：`workspace → <root>/QWEN.md`，`global → ~/.qwen/QWEN.md`。追加模式会折叠到 `## Qwen Added Memories` 下（`MEMORY_SECTION_HEADER`，`const.ts:29`）；带有 30 秒超时的每文件互斥锁使写入串行化（`writeContextFile.ts:48-57,159-162`）；写入器拒绝在追加时处理大于 16 MB 的现有文件（`MAX_EXISTING_FILE_BYTES`，`:255`）。该路由需要**严格鉴权**（`deps.mutate({ strict: true })`，`:114`）—— 即使在环回地址且没有 token 的情况下也会拒绝。结果：一个 workspace 上的每个群组共享同一个 `QWEN.md`。

#### 设计：以 `(channelName, chatId)` 为键的 `channel` memory 作用域

隔离的单位是**路由目标**，而不是 session（session 在空闲时会被回收，`DEFAULT_SESSION_IDLE_TIMEOUT_MS` 为 30 分钟，`run-qwen-serve.ts:94`）。该键已经存在：`SessionTarget { channelName, senderId, chatId, threadId }`（`types.ts:88-93`）。对于群组 memory，以 `(channelName, chatId)` 为键。

**存储布局** 镜像现有的 `~/.qwen/channels/` 目录树：

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # 清理：拒绝 /, .., NUL
      <hash(chatId)>/               # sha256(chatId).slice(0,16) —— 路径安全，无冲突/转义
        QWEN.md                     # 群组作用域的“随时间学习”
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

文件名遵循 `getCurrentGeminiMdFilename()`（`const.ts:49`）。这使 channel memory 远离工作树、远离绑定的 workspace，并脱离层级化的 `QWEN.md` 发现路径（因此它永远不会在群组间泄露）。

#### 写入路径（扩展核心辅助函数，不要 fork 它）

在 `packages/core/src/memory/writeContextFile.ts` 中：

- 将 `WriteContextFileScope`（`:80`）从 `'workspace' | 'global'` 扩展，添加 `'channel'`。
- 使用 `channelKey?: { channelName: string; chatId: string }` 扩展 `WriteContextFileOptions`（`:83-97`）；当 `scope === 'channel'` 时验证其存在（镜像 `:142-146` 的绝对路径守卫）。`projectRoot` 在接口中仍是必需的 —— 传递 `config.cwd`，即使它在 channel 作用域中未被使用。
- 在 `resolveContextFilePath()`（`:223-240`）中添加一个 `channel` 分支，返回 `path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())`。**该函数当前的签名是 `(scope, projectRoot)` —— 它必须增加一个 `channelKey` 参数**（私有函数，局部更改）。每文件互斥锁以解析后的路径为键，因此两个群组可以并发写入而不会发生竞争。

**确切的 `ChannelBaseOptions` 更改及注入方（Fix #3）。** `channel-base` 无法导入 core，因此 CLI 层将读/写作为回调提供。扩展 options 包（`ChannelBase.ts:9-12` —— 今天的真实接口只是 `{ router?: SessionRouter; proxy?: string }`；`config` 和 `bridge` 是 `:40-46` 处的**构造函数位置参数**，不是包的成员）。该包已经携带了 `router`：

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions（无新的 core 依赖）
export interface ChannelBaseOptions {
  // ...今天现有的成员：router?: SessionRouter; proxy?: string
  /** 读取该 channel 提炼后的 memory；如果还没有则返回 null。由 CLI 层注入。 */
  readChannelMemory?: (target: SessionTarget) => Promise<string | null>;
  /** 追加/替换该 channel 的 memory。由 CLI 层注入。 */
  writeChannelMemory?: (
    target: SessionTarget,
    content: string,
    mode: 'append' | 'replace',
  ) => Promise<void>;
}
```

**构建和注入方：** `packages/cli/src/commands/channel/start.ts`（它依赖于 core）。当 `start.ts` 为每个 adapter 构建 options 包时，它闭包引用 core 的 `writeWorkspaceContextFile`/读取辅助函数，并从 `router.getTarget(sessionId)`（`SessionRouter.ts:94`）解析出服务器信任的 `(channelName, chatId)` —— adapter 永远不会从网络中提供 `chatId`：

```ts
// packages/cli/src/commands/channel/start.ts — CLI 层（可以依赖 core）
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config 和 bridge 是 createChannel(name, config, bridge, baseOpts) 的位置参数 —— 不是包的成员
  readChannelMemory: (target) =>
    readChannelContextFile({
      channelKey: { channelName: target.channelName, chatId: target.chatId },
    }),
  writeChannelMemory: (target, content, mode) =>
    writeWorkspaceContextFile({
      scope: 'channel',
      channelKey: { channelName: target.channelName, chatId: target.chatId },
      mode,
      content,
      projectRoot: config.cwd, // projectRoot 在 channel 作用域中未使用，但接口要求必须提供
    }),
};
// adapter 以位置参数方式创建，包在最后：plugin.createChannel(name, config, bridge, baseOpts)
```

adapter 永远不会接触文件系统，且 `channel-base` 不会增加新的依赖。（Phase-2 守护进程替代方案：一个作用域化的 `POST /channel/:sessionId/memory` 路由，在服务器端解析 `channelKey`；它不能复用 `POST /workspace/memory`，因为后者会严格验证 `scope ∈ {workspace, global}` 并转发固定的 `projectRoot`，`:118-125,185-190`。推迟到主动引擎已经需要守护进程端的 `sessionId → target` 查找时再实现。）

**事件扇出。** `publishWorkspaceEvent` 位于**守护进程端**的 `AcpSessionBridge`（`bridge.ts:3610`），而不是 channel 端。在 `AcpBridge`（Phase 0）下**没有** `memory_changed` 事件（也不需要 —— 一个进程同时拥有写入和读取）。在守护进程拓扑下，`publishWorkspaceEvent` 会不加区分地扇出到**每个**活跃的 session 总线（`bridge.ts:3649-3675`）；`BridgeEvent.data` 是自由格式的（`eventBus.ts:51`），因此 `memory_changed` 事件_可以_携带 `{ scope:'channel', channelName, chatId }`，但需要**订阅者端过滤** —— 发布者无法限定交付范围。

#### 读取路径（memory → prompt）—— 复用 `instructedSessions` 的每 session 一次引导

扩展每 session 一次的 `instructions` 块（`ChannelBase.ts:343-347`，由 `instructedSessions` 控制）：在目标具有 `(channelName, chatId)` 的 session 的第一条消息上，调用注入的 `readChannelMemory(target)` 并将其结果与 `config.instructions` 一起前置，然后像今天一样在 `instructedSessions` 中标记该 session。因为 `'thread'` 作用域共享一个 `sessionId`，这会在**每个 session 生命周期内**加载一次 memory（与已经防止重新注入 `config.instructions` 的同一个门控）。不增加 core 依赖 —— 读取通过注入的回调进行。Channel memory **永远**不在层级发现路径上；它通过此钩子按 session 注入。

```ts
// ChannelBase.handleInbound() —— 首轮引导（复用 instructedSessions）
if (!this.instructedSessions.has(sessionId)) {
  const parts: string[] = [];
  if (this.options.readChannelMemory) {
    const mem = await this.options.readChannelMemory(target); // target 来自 router.getTarget(sessionId)
    if (mem) parts.push(mem);
  }
  if (config.instructions) parts.push(config.instructions);
  if (parts.length) promptText = `${parts.join('\n\n')}\n\n${promptText}`;
  this.instructedSessions.add(sessionId);
}
```

#### 与 SessionRouter 持久化/恢复及对话记录的关系

| 层级                    | 持久化内容                                            | 生命周期                                   | 所有者                             |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| Session 对话记录       | ACP 对话轮次                              | 直到被回收 / `/clear confirm` / 重启  | `Session`（agent）             |
| `SessionRouter` 持久化  | `key → { sessionId, target, cwd }` (`:5-9,224-244`) | 跨 bridge 重启，通过 `loadSession()` | `SessionRouter` (`sessions.json`) |
| **Channel memory（新增）** | 关于群组的提炼后的持久事实             | 无限期                                 | `~/.qwen/channels/memory/`        |

当 `restoreSessions()` 重新加载 session 失败时（`:196`），对话记录会丢失，但群组 `QWEN.md` 完好无损 —— 引导读取会在下一条消息时重新补充 agent 的知识。**Channel memory 是对话记录的恢复底线。** “随时间学习”是一个_提炼_循环，而不是原始对话记录持久化：agent（或触发的任务）定期将重要事实总结并追加到群组 `QWEN.md` 中。

#### 隔离、大小限制与阶段划分

只要写入路径始终携带服务器信任的 `chatId`，隔离就能在路径级别保持（`sales` 和 `eng` 会解析到不同的 `hash(chatId)` 目录/文件/互斥锁）。这是**内容**隔离，而不是鉴权边界（进程仍然只有一个全局 token，没有每用户身份）。对于硬性租户隔离，每个 workspace/租户运行一个进程（OD-2）。

大小护栏（复用现有机制）：追加时 16 MB 的现有文件上限被免费继承（将 `WorkspaceMemoryFileTooLargeError` 映射为用户可见的“群组 memory 已满，请运行压缩过程”）；Phase-2 路由复用每次写入 1 MB 的上限（`MAX_MEMORY_CONTENT_BYTES`，`workspace-memory.ts:79`）；替换模式压缩（`writeContextFile.ts:202-211`）是解决无限增长的长期方案。

- **Phase 0/1：** 将 `channel` 作用域 + `channelKey` 添加到 `writeContextFile.ts`；发布 `~/.qwen/channels/memory/` + `meta.json`；通过 `ChannelBaseOptions` 和上述引导读取连接 CLI 层的 `readChannelMemory`/`writeChannelMemory` 回调。无新 HTTP 路由，无 `channel-base → core` 依赖。
- **Phase 2：** 添加作用域化的 `POST /channel/:sessionId/memory` 路由（守护进程拓扑）和带有订阅者端过滤的 `memory_changed`；添加提炼触发器和 `qwen channel memory <name> <chatId>` CLI。**提炼约束：** cron 是 session 作用域的，并在 `dispose()` 时终止（`Session.ts:791,799-803,1056`）；提炼必须在 session 存活时触发 —— 在轮次完成时、在显式 `/remember` 时、或在保活的 session 上 —— 绝不能来自独立的后台调度器。
### 6.4 治理：Token 预算与审计日志（构建区域 4）

任何成员都可以驱动且能主动采取行动的频道常驻 agent，需要支出限制、记录_谁_提出了_什么_请求的审计追踪，以及按身份隔离。qwen-code 提供了四个原语中的三个：`rate-limit.ts`（按 key 的 token 桶）、`permission-audit.ts` 环形缓冲区，以及 `MultiClientPermissionMediator`。本区域将它们组合起来并填补空白（目前没有任何成本预算；没有审计行携带人类发送者信息）。指导原则：**拒绝，而不是截断**——但是，根据 Fix #6，_估算_预算永远不会硬性拒绝用户提示；它只会发出 WARN。

#### 哪个进程负责治理？

| 部署方式 | Bridge | 可用的 `serve/` 机制 |
| --- | --- | --- |
| **阶段 0 — `qwen channel start` / `AcpBridge`** | 生成自己的 `--acp` stdio 子进程 (`start.ts:213,356`) | **无。** 没有 Express 服务器，没有 `rate-limit.ts`，没有 HTTP 路由，没有 `permission-audit.ts` 环形缓冲区。 |
| **阶段 1+ — `qwen serve` + `DaemonChannelBridge`** | 频道托管在守护进程中 | 所有 `serve/` 功能：真实用量、mediator、rate-limit、audit ring、路由。 |

解决方案：**预算准入 + 拒绝逻辑位于 `@qwen-code/channel-base` 中**（公共关键节点 `ChannelBase.handleInbound()`），在一个新的 **`packages/channels/base/src/BudgetLedger.ts`** 中——_而不是_ `serve/budget.ts`，因为阶段 0 的频道进程从不加载 `serve/`，并且频道层是唯一拥有人类发送者上下文的地方。**审计 + 归因**也起源于频道层。在阶段 1+ 的守护进程路径上，账本读取真实用量并_额外_通过路由暴露；在阶段 0 路径上，它进行估算并通过频道命令（`/audit`）暴露。

#### 当前治理的挂载点（及存在的差距）

| 关注点 | 现有机制 | 差距 |
| --- | --- | --- |
| 请求速率限流 | 按 `(clientId\|ip)` 的 token 桶，3 个层级 (`rate-limit.ts`) | 没有 token/成本，只有请求计数；仅限 `serve/` |
| 事后决策日志 | 有界 FIFO 环形缓冲区，5 种记录类型 (`permission-audit.ts`) | 没有人类 `senderId`，只有 `clientId`；没有 GET 路由；环形缓冲区由闭包持有 (`:17-25`) |
| 真实的逐操作审批 | 四种策略 + 共识法定人数 (`permissionMediator.ts:621-637`) | 投票归属于 `clientId`，而不是人类；一个频道 = 一个客户端 |
| 按频道的工具/数据范围 | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`)；`getPermissionsAllow()` (`:3158`)；`getPermissionsDeny()` (`:3182`)；MCP 允许过滤器 (`:3327-3333`) | 范围是按 `Config`/进程的；没有进入 `--acp` 子进程的 spawn-arg 路径 |

两个结构性事实：(1) **守护进程没有人类身份**（`BridgeEvent.originatorClientId`、每个 `PermissionVote.clientId` 都是传输标识符；`senderName` 仅在 `SenderGate.check()` 中保留），因此任何 human↦`clientId`↦`sessionId` 的关联必须在频道边界建立；(2) **auth 和 rate-limit 是守护进程全局的**（单一 bearer token `auth.ts:259-266`；rate-limit 以 `(clientId, ip)` 为 key），因此按频道的治理必须起源于 adapter。

#### Token 与成本预算 — 新的 `BudgetLedger`，在真实用量存在前仅提供建议 (Fix #6)

**用量的来源 — 注意事项 (OD-9)。** 只有在模型报告用量后，token 预算才能扣除_真实_数值。在会话中，`Session.#recordPromptTokenCount()` (`Session.ts:2078-2087`) 将 `usageMetadata.promptTokenCount` 存储在 `lastPromptTokenCount` 中，**每轮都会被覆盖**——_而不是_一个累积的计费表。在阶段 0 的 `AcpBridge` 路径上，ACP `session/update` 流不携带 `usageMetadata`，因此 **v1 无法在那里扣除真实的 token 计数**。在阶段 1+ 的守护进程路径上，守护进程在进程内观察用量并_可以_精确扣除。

**执行规则 (Fix #6 — 核心支撑)：**

- **估算预算仅作建议 (ADVISORY)。** 当唯一可用的数字是频道端的估算值（提示+响应字符数 ÷ 每 token 字符数常量）时，账本会在阈值处 **WARN/alert**，并可能在回复中附加警告——它**永远不会硬性拒绝用户提示**。误报的估算绝不能阻止真实的用户请求。
- **仅在真实数值时硬性拒绝 (HARD-decline)。** 只有当扣除来源是真实的守护进程用量路径（阶段 1+ 守护进程托管）时，预算才_可以_拒绝提示（拒绝而非截断）。在此之前，预算仅提供可观测性 + 告警，而不是网关。

这使得 v1 预算保持诚实：它在各处提前警告，并仅在数值可信的地方强制执行硬性限制。

**模块 `BudgetLedger.ts`**，以 `rate-limit.ts` 为模型（工厂、带 GC 的 Map-of-buckets、溢出时 fail-open）：

```ts
export type BudgetUnit = 'tokens' | 'usd'; // 'usd' = tokens × 每模型费率
export type UsageSource = 'estimate' | 'daemon'; // 'estimate' => 建议性；'daemon' => 可硬性拒绝
export interface BudgetLedger {
  // 仅当 source==='daemon' 时 allowed=false；估算返回 allowed=true + warn 标志
  admit(key: string): {
    allowed: boolean;
    spent: number;
    limit: number;
    advisory: boolean;
  };
  debit(
    key: string,
    amount: number,
    unit: BudgetUnit,
    source: UsageSource,
  ): void; // 触发阈值告警
  snapshot(): Record<
    string,
    { spent: number; limit: number; ratio: number; source: UsageSource }
  >;
  reset(): void;
  dispose(): void;
}
```

- **默认继承语义 + 最严格优先的组织汇总 (OD-9)。** `admit(key)` 使用 `GroupGate` 风格的 `channel → '*' → built-in` 回退来解析有效窗口。提示必须**同时**通过按频道窗口和**按进程“组织”汇总**（最严格优先，两者都扣除）。“组织” = _此单一进程的_汇总；真正的跨进程组织上限需要共享存储（不在范围内）。**固定的每日窗口。**
- **75%/95% 告警。** `debit()` 在每个窗口的每个阈值触发一次 `onAlert`，使用 event-bus 迟滞惯用法（`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`，`eventBus.ts:101-103`）。**发布告警是主动发送**——强依赖于构建区域 2（钉钉冷群注意事项；飞书可自由发布）。当不存在主动频道时，降级为“将警告附加到下一次回复”。
- **拒绝而非截断（仅当 `source==='daemon'` 时）。** 在准入时检查，_在_ `bridge.prompt()` (`:425`) _之前_。对于真实用量的 `!allowed`，adapter 调用 `sendMessage(chatId, refusal)` 并返回——它**不会**进入 steer/cancel 路径，因此正在进行的提示会完成，而_下一个_会被拒绝。对于估算，`allowed` 始终为 true（建议性）。
- **成本 (`usd`)** 将 token 乘以操作员提供的每模型费率表（qwen-code 是多模型的；没有单一价格）。缺少条目 -> 回退到 `tokens` + 一次性警告。
- **配置。** `ChannelConfig` (`types.ts:27-51`) 增加 `budget?: { unit; limit; windowMs; reset? }`，由 `parseChannelConfig` 解析。在守护进程路径上，`ServeOptions` 增加 `--budget-org-daily`/`--budget-unit`，并且 `daemon-status.ts`（已经报告 `rateLimit`，`:295-297`）增加一个并行的 `budget` 块。

#### 审计日志 — 人类 `senderId` 随 turn 携带 (Fix #7)

`PermissionAuditRing` (`permission-audit.ts:128-172`，FIFO 512) 是正确的底层结构，但每一行都以 `clientId` 为 key。**设计 — 频道侧的 sender↦turn 绑定**（`RequestAttributionRing.ts`，相同的 FIFO 形状）。

**在 `followup` 下，朴素的时间戳连接是错误的 (Fix #7)。** v1 提议将权限行连接到“该 `sessionId` 的最新归因行，其 `recordedAtMs` 早于权限的 `issuedAtMs`”。在 `followup` 下，多个发送者通过 `sessionQueues` 在**一个** `sessionId` 上排队；最近_入队_的发送者通常**不是**在触发工具调用/权限时其 turn 正在_执行_的发送者。因此，时间戳连接会系统性地错误归因。

**修复：将 `senderId` 与排队的提示一起携带。** 当 `handleInbound()` 入队到 `sessionQueues` 时（以及当调度器入队主动触发时），队列项/合成 turn 上下文携带其自己的 `{ senderId, senderName, requestSeq }`。在 turn 期间引发的任何工具调用/权限的归因都是从**当前正在执行的 turn**（FIFO 的头部）读取的，而不是从时间戳扫描中读取。具体而言：`sessionQueues` 链在运行到达头部时（刚好在 `bridge.prompt()` 之前）为每个 turn 盖上 `currentTurnAttribution.set(sessionId, {senderId, ...})` 的戳，并在运行解析时清除它；审计行读取该映射。主动触发以相同方式盖上 `createdBy` 的戳（§6.2 步骤 3）。这对于正在执行的 turn 是精确的，并且不受入队顺序的影响。

在准入时添加第六种行类型 **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`**，这样即使是只读工作，审计也能回答“谁启动了此任务”。`PermissionAuditEntry` 联合类型 (`:57-104`) 是**封闭的**，消费者根据 `kind` 进行 switch，因此扩展它（或添加同级 ring）会触及每个消费者。

**查询路径。** 阶段 1+ 守护进程：添加 `GET /workspace/audit`（bearer + `createMutationGate` 严格模式，`auth.ts:356`），从 bridge 闭包中暴露 ring（文件头部的文档已预见这一点，`:22-25`）。阶段 0 `AcpBridge`：通过 `sendMessage` 的 `/audit` 频道命令。**持久性：** ring 是 512 个内存条目，**重启时丢失**——这是已知的 v1 限制；后续跟进 (OD-11) 会将**仅追加的连接审计持久化到 `~/.qwen`**。

**共识投票者不是人类。** `votersAtIssue` 是守护进程盖上时间戳的 `clientId`，并且一个频道 = 一个 `clientId`，因此开箱即用的钉钉群中的“共识”是_守护进程客户端_之间的共识。人类级别的投票需要一个注册的审批者名单，将 `senderId` 映射到不同的投票——这是 OD-3 阶段 2 的需求，而不是已解决的功能。

#### 按身份的工具与数据隔离

1. **按频道的工具允许/拒绝。** `Config` 支持 `coreTools`/`allowedTools`/`excludeTools` (`:727-729`)，通过 `getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()` 暴露。（**没有** `getAllowedTools()`/`getBlockedTools()`。）在阶段 0，`AcpBridge` 路径为每个频道生成一个子进程，但 `AcpBridgeOptions` 仅携带 `{ cliEntryPath, cwd, model }` (`:17-21`)，并且 `start()` 仅转发 `--acp`+`--model` (`:56-63`)。传递按频道的范围需要新的 `AcpBridgeOptions` 字段、进入 `Config` 的新 `--acp` 标志，以及新的 `ChannelConfig` 字段。在阶段 1+ 的守护进程路径上，每个守护进程有一个 `Config`，因此范围是按守护进程的（按工作区，OD-2），而不是按频道子进程的。
2. **按频道的 MCP 范围界定。** `Config.getMcpServers()` 通过构造时设置的 `allowedMcpServers` (`:3327-3333`) 进行过滤。将 `allowMcpServers?: string[]` 添加到 `ChannelConfig`，并传入相同的 spawn-arg 路径（或 `AcpBridge.newSession()` 传递的 `mcpServers` 数组——在 `:133` 处硬编码为 `[]`）。
3. **`sessionScope` 作为数据边界。** `'thread'` 使一个组共享一个工作树/上下文；跨_频道_隔离通过 `channelName` 命名空间的路由键来强制执行。`'thread'` 组内的按发送者隔离在设计上_不是_隔离的。
**客观局限性：** 鉴权使用的是 daemon 全局单一 token，没有 per-user principal，因此隔离粒度是按 **channel**，而不是按**人**。真正的按人工具隔离需要 Phase-3。

#### 准入路径

```
DingTalk 入站消息
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [existing :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [NEW]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (NOT into steer/cancel)
            ↳ source==='estimate': allowed always true → WARN only (Fix #6)
     3. 将消息入队到 sessionQueues，携带 {senderId, senderName, requestSeq}  [NEW — Fix #7]
        + task.requested row
     4. 在 FIFO 队头，打上 currentTurnAttribution 时间戳 → bridge.prompt(...)   [existing :425]
            ↳ tool call → permission (AcpBridge Phase 0 自动批准；daemon Phase 1+ 使用 mediator)
                ↳ audit row 读取 currentTurnAttribution[sessionId]  (正在执行的 turn)
     5. 完成时：usage 已知 (daemon) 或估算 (AcpBridge) → budget.debit(..., source)  [NEW]
            ↳ 75%/95% 告警推送是主动式的 → 依赖 Build Area 2
```

需要强调的硬依赖：(1) 真实的 token 扣费（以及硬性拒绝）需要 Phase-1+ 的 daemon usage 路径——在此之前 budget 仅作为建议（Fix #6）；(2) 主动式 budget 告警需要 Build Area 2；(3) 人级别的共识投票和人级别的审计归属需要 OD-3 的 registered-approver 名单。

### 6.5 DingTalk 平台（主要）+ Feishu 后续跟进

> **接线说明（已确定的架构）。** Phase 0：`qwen channel start` 构造 `AcpBridge`（`start.ts:213,350`；`AcpBridge.ts:38`），它会 spawn `node <cli> --acp` 并暴露 `newSession(cwd)`/`loadSession(sessionId, cwd)`（`:131,137`）；session 作用域由 `SessionRouter` 管理，而不是 bridge。Phase 1+：channel 托管在 `qwen serve` 下，通过 `DaemonChannelBridge`（其 `'thread'` 默认值在 `:229,240`；重叠抛出异常在 `:257-261`）。此迁移是已确定的，不是可选的（§1）。

#### sessionWebhook 过期问题

DingTalk Stream 模式在每次入站消息时都会传递一个短生命周期的 `sessionWebhook`；adapter 以 `conversationId` 为 key 对其进行缓存（`:84`，在 `onMessage()` `:517` 中填充），而 `sendMessage()`（`:134-170`）会查找该缓存，如果缺失则记录 `No webhook for chatId` 日志并静默返回（`:137-141`）。对于主动推送场景，有两个致命事实：(1) webhook **会过期**（SDK 类型 `RobotMessageBase` 包含 `sessionWebhookExpiredTime`，见 `constants.d.ts:13`，但 adapter 的 `DingTalkMessageData` 接口遗漏了它且从未读取——即使在热窗口期内，缓存的 webhook 也可能已过期）；(2) 该 map **仅**由入站流量填充，因此冷启动的群没有对应条目。

#### 通过机器人主动消息 API 进行冷群推送——已验证 (OD-7)

解决方案是使用 DingTalk 的机器人主动消息 API——**`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** _（端点已高置信度验证）_。与 webhook 不同，它通过持久的 **`openConversationId`** _（已高置信度验证）_ 进行寻址，使用 **`x-acs-dingtalk-access-token`** header 进行鉴权 _（已高置信度验证——已被 `emotionApi()` `:188-207` 和 `downloadMedia()` `media.ts:36-43` 使用）_，并携带机器人的 **`robotCode`** _（已高置信度验证；等于 `config.clientId`，`:184,435`）_。Body 是一个 `msgKey`/`msgParam` 键值对 _（已高置信度验证）_，其中 **`msgParam` 本身是一个 JSON 编码的字符串**（而不是嵌套对象），例如对于 `msgKey:'sampleMarkdown'`：

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // 持久的群 id（来自入站的 conversationId；如果无效则进行转换）
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<预览标题>\",\"text\":\"# hi\\n...markdown ≤ ~5000 字符\"}",
}
```

这是一个与 `sendMessage()` 并列的**新方法**，而不是对它的修改（草图见 §6.2）。`ChannelBase.sendMessage()` 保持抽象（`:81`）；主动推送引擎需要新的 `pushProactive?(target, text)` 出站接口——这是全新引入的，也是核心的平台交付物。**`根据官方 send 文档 + aliyun ask/559227, ask/585232 + 消息类型文档，端点/参数/msgParam 结构已 [高置信度] 验证`**。

**权限前提：** 在 `groupMessages/send` 生效前，必须为企业内部应用授予“发送主动群聊消息”的机器人/消息权限（send 文档列出了此前提）_（已高置信度验证必须启用某项权限）_。**仍需标记（低置信度）：** 本次会话的文档中未确定确切的权限点显示名称/代码——DingTalk 控制台将其显示在应用的权限管理中，属于机器人/消息发送权限（通常是机器人消息系列，例如 `qyapi_robot_sendmsg` / 企业机器人发送消息权限）；请在控制台中确认，**不要**硬编码该代码。adapter 必须在 `!resp.ok`/throw 时记录 `resp.status` + body——当前 `emotionApi` 的空 catch（`:214-216`）正是会掩盖权限缺失配置错误的反模式。

#### 获取并持久化 openConversationId

两个来源：(1) **从入站消息中获取**——每条消息都携带 `conversationId`（`:506`），并作为 `openConversationId` 转发给 emotion API（`:197`）；在看到它的那一刻就进行持久化。**`根据 aliyun ask/559227, ask/585233 + 匹配的 'cid' 格式，已 [中置信度] 验证`** 回调的 `conversationId`（cid 前缀）可以直接用作标准群 @-回调的 `openConversationId`。**仍需标记：** 没有官方逐字句子表明它们对于非酷应用机器人是等同的；文档保证的获取路径是 **`chatId → openConversationId` 转换 API**（`obtain-group-openconversationid`），或者从建群 API / `chooseChat` JSAPI 中捕获，或者从酷应用回调中获取（直接传递 `openConversationId`+`coolAppCode`）。**回退方案：** 遇到 `invalid.openConversationId` 时，通过 `chatId` API 进行转换并重试。(2) **机器人被加入群事件**，通过 `registerAllEventListener`（`client.mjs:58-61`）：事件在默认的 `topic:'*'` 下流转 `onEvent → onEventReceived`（`client.mjs:14-19,241-254`），而 adapter 目前只安装了机器人 _回调_（`:107`），因此组织/机器人事件目前被接收并丢弃到无操作的默认处理中（`client.mjs:35-37`）。安装时的事件 topic 和 `openConversationId` 字段**未经验证**——不要硬编码事件名称。

**持久化。** 使用**独立的 `~/.qwen/channels/dingtalk-groups.json`** 存储，而不是 `SessionRouter` 目标：群 ID 必须比任何 session 的存活时间都长（cron 驱动的冷群推送在没有活跃 session 时也会触发），而 `PersistedEntry` 只有在为路由键创建 session 后才存在——将群身份与 session 生命周期耦合会导致冷群无法被表示。

#### 多人作用域是 opt-in，而非默认

`'thread'` 作用域（`:53`）为每个群提供一个共享 agent，但 `parseChannelConfig()` 默认将 `sessionScope` 设为 `'user'`（`config-utils.ts:91-92`），这会为_每个成员_创建独立的 session。操作者必须显式设置 `sessionScope: 'thread'`。设置后，会产生两个多人场景的后果：(a) 默认的 `dispatchMode: 'steer'` 会在任何成员发送消息时**取消**进行中的任务（`:371-379`）——tag profile 设置了 `'followup'`（§6.1）；(b) sender-attribution 缺失问题（§6.1）。

#### 入站 @ 解析

群门控正常工作：`GroupGate` 使用 `envelope.isMentioned`，该值由 `data.isInAtList` 设置（`:520`）。文本清理仅剥离**第一个** `@token`（`:527-529`），这是基于位置而非基于身份的——`@qwen @alice` 是正确的，但如果人类先被 @，则会剥离人类的 @。一个加固性的后续改进是根据机器人自身的 `chatbotUserId` 进行剥离。回复/引用上下文会被提取（`extractQuotedContext()`，`:272-298`），其中 `isReplyToBot` 是根据 `chatbotUserId` 计算的（`:280,292`），并且 `referencedText` 会作为 `[Replying to: "…"]` 注入（`ChannelBase.ts:317-319`）。**Sender attribution 在 §6.1 中通过 `[senderName]` 前缀已闭环。**

#### Markdown / 卡片渲染

`markdown.ts` 已经完成了主动推送路径所复用的平台标准化处理：markdown 表格透传、在 3800 字符处进行分块并保持 fence 平衡（`splitChunks()`；`CHUNK_LIMIT=3800`），以及提取标题并截取为 20 个字符，回退值为 `'Reply'`（`extractTitle()`）。复用是**有条件的**，取决于 `sampleMarkdown` 模板是否接受相同的 markdown 子集以及最大 **~5000 字符** 的 body _（已高置信度验证——消息类型文档）_；保持 `CHUNK_LIMIT` ≤ 该预算。流式交互卡片（`TOPIC_CARD` 路径，`constants.d.ts:4`）——类似于 Feishu 的流式卡片——**不在**主要里程碑的范围内；v1 主动推送基于 markdown 消息。

#### Feishu 后续跟进（简述）

Feishu 在关键维度上处于领先地位：**主动发送是原生的**（`sendMessage(chatId, text)` 可以发送给任何 `chat_id`，`:622-676`——没有冷群问题；`canColdSend = true`），**稳定的 `tenant_access_token`** 并带有过期跟踪的刷新机制（`refreshToken()`，`:581-620`——这是 DingTalk 仍需完成的工作），**灵活的事件订阅**（WebSocket 或 HMAC webhook，`:146-176`），以及**一流的流式卡片**（`markdown.ts`，`:742-792`）。**但是，共享的 `ChannelBase`/`SessionRouter` 问题——opt-in 的 `'thread'` 作用域、`dispatchMode` 取消、缺失的 sender attribution、新的出站接口——同样完全适用于 Feishu。** Feishu 解决了_可达性_问题，而不是_谁说了什么_或_一个成员取消另一个成员_的问题。将主动推送引擎移植到 Feishu 可以直接复用现有的 `sendMessage()`（基础的 `pushProactive` 默认实现）；唯一新的平台工作是将引擎的目标群映射到持久化的 `chat_id`，并可选择通过流式卡片路径进行路由。

---

## 7. 分阶段发布（Phase 0–2）与 MVP

每个阶段都可以独立合并，以可演示的状态结束，并由明确的验收标准把关。**Phase 0** 让现有堆栈表现得像一个共享常驻 agent——通过配置加上少量代码修改，基于 `AcpBridge`。**Phase 1** 将 channel 托管迁移到 `qwen serve`（已确定的架构），并添加主动推送引擎和单个 MVP 闭环。**Phase 2** 添加 channel 记忆、budget 和审计。

### 拓扑：已确定的 daemon 迁移（原 OD-1）

决定**已做出**，而非待定：Phase 0 在 `AcpBridge` 上发布；**Phase 1+ 在 `qwen serve` 下运行 channel**（通过 `DaemonChannelBridge` 或 daemon channel runner），因为 per-room 记忆持久化、权限 mediator、事件总线审计、FIFO `promptQueue` 以及 budget/审计查询路由都需要 daemon。网关拥有的调度器（§6.2）是**迁移中立的**——无论 bridge 是什么，它都通过 `ChannelBase.sessionQueues` 进行序列化——因此它在 Phase 1 发布，不受切换影响。**Phase 0 接线添加了 `DaemonChannelBridge` 附加路径（或 `--daemon <url>` flag）**，使得迁移在 Phase-1 边界只是一个配置步骤，而不是重写。注意调度器设计所围绕的尖锐边缘：`DaemonChannelBridge.prompt()` **不会**排队——它在重叠时_抛出_ `Prompt already in flight` 异常（`:257-261`）；daemon 侧的 FIFO `promptQueue` 在 acp-bridge 侧（`bridge.ts:2855,3082`）；channel 侧的序列化是 `ChannelBase.sessionQueues`（`:394`），这就是为什么主动推送引擎在 turn 活跃时从不调用 `prompt()`（§6.2, Fix #1）。

### Phase 0 — 配置 + 身份注入（基于 `AcpBridge`）

**目标。** 在一个 DingTalk 群中，任何成员 `@` 提及机器人，所有成员共享一个 session，agent 知道谁在说话，并且进行中的任务不会被队友的后续消息破坏。

**0.1 — “qwen tag” 配置 profile**（主要是 `settings.json`）：

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // 多人场景：整个群共享一个 sessionId。routingKey → `${name}:${threadId||chatId}` (:53)。
    // DingTalk 不设置 threadId (:541-551) → key 回退到 chatId = conversationId||sessionWebhook (:534)。
    // 没有 conversationId 的消息将使用瞬态的 webhook 作为 key——将其视为硬错误。
    "sessionScope": "thread",

    // groupPolicy 默认为 "disabled" (GroupGate :13; config-utils :98) — 必须设置，否则所有群消息都会被丢弃。
    // 在 allowlist 模式下，"*" 不是成员通配符 (GroupGate :42)；需要列出每个 chatId。"*" 仅提供默认值。
    "groupPolicy": "allowlist",
    "groups": {
      "cidXXXXXXXX": { "requireMention": true, "dispatchMode": "followup" },
      "*": { "requireMention": true, "dispatchMode": "followup" },
    },
    "senderPolicy": "open",
    "instructions": "You are the team's shared engineering agent in this DingTalk group...",
  },
}
```
与 ground truth 绑定的注意事项：`requireMention` 默认为 `true` (`GroupGate.ts:49`)；`sessionScope` 默认为 `'user'` (`config-utils.ts:92`) —— `'thread'` 是整个多人机制的核心；`dispatchMode` 的群组默认值应为 `'followup'`（而非运行时的 `'steer'`，`:354`）。

**0.2 — 发送者归属。** `promptText` 种子中的 `[senderName]` 前缀 (`ChannelBase.ts:316`) 受 `isGroup` 门控，**每轮都会触发**（不受 `instructedSessions` 门控），并通过**新增的 `Envelope.alreadyPrefixed`** 标志来防止 `collect` 重入。参见 §6.1。

**0.3 — `dispatchMode` 协调。** 显式设置每个群组的 `dispatchMode`；修复 `types.ts:42` 中过时的 JSDoc（`'collect'` → `'steer'`），确保代码与注释一致 (OD-5)。

**涉及的文件 (Phase 0)。** `start.ts`（添加可选的 `DaemonChannelBridge` 挂载路径，使 Phase 1 的提交迁移仅需一个标志即可开启）；`ChannelBase.ts`（`senderName` 种子 + `alreadyPrefixed` 防护 + `/clear` 确认+白名单门控 + `/who`）；`types.ts`（新增 `Envelope.alreadyPrefixed` 字段 + JSDoc 修复）；`docs/`（操作指南 + 注意事项）。

**验收标准。**

- [ ] 两名成员 `@` 提及机器人；两者均解析为**同一个** `sessionId`（通过 `SessionRouter` 映射进行断言）；路由键为 `team-eng:<conversationId>`，而非 webhook URL。
- [ ] 代理使用发送者归属（群组中存在 `[senderName]`，1:1 中不存在）；`collect` 重入不会导致双重前缀（断言 `alreadyPrefixed` 路径）。
- [ ] 未提及机器人的群组消息被丢弃（原因 `mention_required`）；不在白名单中的群组消息被丢弃（原因 `not_allowlisted`）。
- [ ] 在 `dispatchMode: 'followup'` 下，成员 A 执行任务期间成员 B 发送消息不会取消 A；B 的消息将在 A 之后运行。
- [ ] 在共享（线程）群组中，`/clear` 需要 `confirm`，且在设置了 `config.allowedUsers` 时仅限于该列表中的用户（并非无限制重置）；`/status` 保持只读。
- [ ] Hook 级单元测试（无 `wait(ms)` UI 测试）：跨发送者的路由键相等性；`isGroup` 为 true 与 false 时 promptText 前缀的存在性；`alreadyPrefixed` 跳过逻辑。

### Phase 1 — Daemon 迁移 + 主动引擎 + MVP 闭环

**MVP 定义。** **单一计划摘要闭环**：操作员为频道注册一个 cron 风格的定时任务；触发时，网关解析该频道的线程作用域 session，使用工具运行 prompt，并**将结果主动发布回冷频道**。一个任务，一个频道，一条投递路径。更丰富的行为不在 MVP 范围内。

**已提交的迁移。** Phase 1 通过 `DaemonChannelBridge`（OD-1 决策）将频道托管在 `qwen serve` 下，继承 FIFO `promptQueue`、mediator、eventBus 和路由。主动引擎见 §6.2（网关所有、与迁移中立的调度器；`dispatchProactive` 通过 `sessionQueues` 串行化；通过已验证的 `groupMessages/send` API 实现钉钉冷发送回退；`tokenManager` 刷新；`canColdSend` 能力标志）。有三个事实使其并非易事：当前的 cron 是 session 作用域的，且在 dispose 时销毁（由 OD-8 单一所有者门控解决）；钉钉无法向冷群组发送消息（由已验证的主动 API + 持久化的 `openConversationId` 解决）；主动 prompt 必须通过 `sessionQueues` 串行化，且在持有 `activePrompts` 时**绝不能**调用 `bridge.prompt()` —— 否则 `DaemonChannelBridge` 会抛出 `Prompt already in flight` (`:257-261`)。

**涉及的包。** `ChannelCronStore.ts`/`ChannelCronScheduler.ts`（新增，channel-base）；`cronParser.ts`（复用）；`ChannelBase.ts`（`dispatchProactive`、`pushProactive`、`canColdSend` 标志、`/schedule`）；`DingtalkAdapter.ts` + `dingtalk/src/proactive.ts`（新增冷发送 + 持久化 `openConversationId` + `tokenManager`）；`FeishuAdapter.ts`（无更改；作为支持主动发送的适配器参考，`canColdSend = true`）；`start.ts`（在 daemon 下托管；在 `restoreSessions()` 之后构建并启动调度器；将 `isTagSession` 传入 session 构建过程以禁用 session 内 cron —— OD-8）；session 构建（对 tag sessions 跳过 `startCronScheduler()`，`Session.ts:667-668`）。

**验收标准。**

- [ ] 频道在 `qwen serve`（daemon 托管）下运行；工具调用会触发 `permission_request`（mediator 可达），从而确认迁移成功。
- [ ] 操作员注册一个摘要任务；该任务在网关重启后依然持久存在（从 `~/.qwen/channels/cron.json` 重新加载）。
- [ ] 当任务在**没有打开 session** 的情况下触发时，网关解析线程作用域的 session，使用工具运行 prompt，并通过冷发送路径投递到空闲的钉钉群组 —— 证明冷群组投递能力。当 `canColdSend = false` 时，引擎会**显式失败**（记录日志、记录 `lastError`，不会静默无操作）。
- [ ] 同一任务通过 `tenant_access_token` 在飞书上投递，证明 `canColdSend` 抽象的有效性。
- [ ] 触发的任务不会违反单 session 单 prompt 规则：如果成员正在对话中，主动 prompt 会通过 `sessionQueues` 排队在其后（await `activePrompts.get(sessionId)?.done`），绝不会进行 `steer` 取消，也绝不会触发 `DaemonChannelBridge` 的重叠抛出。
- [ ] 主动轮次不会被后续的人类轮次取消（tag 群组为 `followup`，绝非 `steer`）。
- [ ] `tokenManager` 在 v1.0 `accessToken` 到期前约 2 小时以及遇到 401 错误时进行刷新，因此在 socket 打开超过 2 小时后的发送依然能成功。
- [ ] 任何持久化任务都不会重复触发：网关调度器是唯一所有者；tag session 不会启用其 session 内 cron (OD-8)；两个存储位于不相交的路径上。
- [ ] 删除任务可停止未来的触发。
- [ ] Hook/服务级测试（调度器对抗假时钟；冷发送对抗模拟 HTTP 客户端）—— 无 `wait(ms)`。

### Phase 2 — 频道 Memory + Token 预算 + 审计日志

**2.1 — 频道作用域 memory** (§6.3)：在 `writeContextFile.ts` 中添加 `'channel'` 作用域 + `channelKey` (`WriteContextFileScope` `:80`, `WriteContextFileOptions` `:83-97`, `resolveContextFilePath` `:223-240`)；生成 `~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md`；通过 `ChannelBaseOptions` 连接 CLI 层的 `readChannelMemory`/`writeChannelMemory` 回调 + 引导读取复用 `instructedSessions`。Phase-2 daemon 路由 `POST /channel/:sessionId/memory` 仅在 daemon 拓扑下可用。

**2.2 — 每频道 token 预算** (§6.4)：`BudgetLedger.ts` 以频道为键，**频道侧估算为建议性（仅 WARN），仅在真实 daemon 使用时硬性拒绝** (Fix #6/OD-9)；每进程组织汇总 + 每频道窗口，最严格者优先，固定每日窗口；75%/95% 告警（主动发送依赖）。

**2.3 — 审计日志** (§6.4)：`RequestAttributionRing` + `task.requested` 行；**归属随执行轮次携带（每轮 `currentTurnAttribution`），而非时间戳关联** (Fix #7)；`GET /workspace/audit` (daemon) 或 `/audit` 频道命令。内存中 FIFO 512，重启时丢失（已知的 v1 限制；`~/.qwen` 仅追加后续跟进，OD-11）。

**涉及的文件。** `writeContextFile.ts`、`workspace-memory.ts`（作用域验证 + GET walker，daemon 路径）；`BudgetLedger.ts`、`RequestAttributionRing.ts`（channel-base）；`permission-audit.ts`（模式来源）/ 新增 `channel-audit.ts`（daemon）；`ChannelBase.ts`（在排队轮次上携带 `senderId`/`senderName` + `currentTurnAttribution`；预算 hooks）；`server.ts`（在 `express.json` `:2025` 之后挂载路由，使用 `mutate({ strict: true })` 门控变更）。

**验收标准。**

- [ ] `scope: 'channel'` 写入 `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md`；两个群组获得**独立**的文件；共享工作区的 `QWEN.md` 不受影响；写入通过注入的回调进行（无 `channel-base → core` 依赖）。
- [ ] 频道 memory 追加在并发下是幂等的（每文件互斥锁），并且仅在实际发生突变时发出 `memory_changed`（daemon 路径；订阅者端过滤）。
- [ ] 在 **daemon** 路径上，当频道超过其真实使用量窗口上限后，下一个入站 prompt 会被拒绝（而非截断），且主动任务暂停；计数器在每日窗口滚动时重置；预算按频道独立。在**仅估算**路径上，预算会发出 WARN 但绝不会硬性拒绝 (Fix #6)。
- [ ] 在发送者 A 的排队轮次执行期间引发的工具调用/权限请求，归属于 **A**，即使 B 随后在 `followup` 下排队 (Fix #7)。
- [ ] 每次主动触发、频道 memory 写入和预算事件都会以尽力而为的 `senderId`/`senderName` 落入审计环中，可通过审计界面读取，**不会**在 SSE 总线上广播。
- [ ] Ring/route/resolver 单元测试（FIFO 驱逐、作用域路径解析、预算阈值计算、执行轮次归属）—— 无 UI/时序测试。

### Phase 边界与前瞻

Phase 0→1→2 是累加的：多人 + 身份（在 `AcpBridge` 上） → daemon 迁移 + 主动 MVP → memory + 预算 + 审计。**Phase-3 多身份网关**（每个频道独立的机器人身份/凭证、真正的每用户主体、每频道 token）_不在范围内_，它是消除单一全局 token / 每 daemon 单工作区约束的自然下一步。即使在 Phase 0–2 中，"qwen tag" 也需要**每个工作区一个代理进程** (OD-2)；服务多个仓库的部署会运行多个进程。

---

## 8. qwen tag 与 Claude Tag（权衡）

Claude Tag 是一个托管的多租户代理：Anthropic 负责运行运行时、身份和每用户计量；频道应用是一个瘦客户端。`qwen tag` 则相反 —— 它运行在操作员控制的基础设施上，基于 qwen-code 的适配器构建。这种反转既是其全部价值主张，也是全部风险面。

### qwen 的优势

- **开放 / 自托管，数据留在内部。** 代理在本地运行 —— Phase 0 中通过 stdio（`AcpBridge.start()` 运行 `node <cli> --acp`），从 Phase 1 开始在 `qwen serve` 下进程内运行 —— 绝不使用供应商 API。仓库内容、模型流量和对话记录均保留在操作员主机上。Claude Tag 无法做出此保证。
- **MCP / 任意工具。** 是封闭托管代理工具表面的严格超集。
- **每操作权限投票 —— _daemon 托管后的 Phase-1+ 能力_。** qwen-code 附带 `MultiClientPermissionMediator`（四种策略，共识法定人数 `floor(M/2)+1`，独立审计环）。这确实是一个差异化特性 —— **在 Phase-0 `AcpBridge` 路径上无法实现**（`requestPermission` 自动批准，`:108-118`），在 Phase 1 将频道托管到 daemon 后即可实现；即便如此，投票仍以 `clientId` 为键，且在 OD-3 名单落地前，一个频道只是一个_单一_客户端。已废弃的 `ChannelConfig.approvalMode` 字段 (`types.ts:36`) 证实了其“计划中但未实现”的状态。
- **持久、可检查的状态。** `SessionRouter` 持久化、纯文本 `QWEN.md`/`AGENTS.md` 文件，以及（daemon，Phase 1+）Last-Event-ID 重放环。没有任何不透明的东西。

### 差异点及必须补偿的地方

1. **单工作区 + 单全局 token + 无人类身份。** 一个进程绑定一个工作区；多工作区 = N 个进程 (OD-2)。单全局 token 适用于 _HTTP daemon_；Phase-0 `AcpBridge` 频道路径没有 HTTP 表面也没有 token（其边界是 `SenderGate`/`GroupGate`）。没有任何人类身份 —— `senderName` 仅为建议性的 prompt 文本 (OD-11)。_补偿方案：_ 每个工作区/团队一个进程；在频道层注入发送者归属；保持 `clientId` 作为安全边界；在任何非环回 daemon 上要求 `--require-auth` + token (OD-12)。
2. **主动 / 冷频道消息不统一。** 钉钉仅限被动回复（过期的 `sessionWebhook`）；飞书通过 `tenant_access_token` 自由发送。_补偿方案：_ Phase 1 在持久化的 `openConversationId` 上验证的主动群组发送（钉钉，`canColdSend` 变为 true）；飞书无需此操作。
3. **调度器是 session 作用域的，而非 daemon 作用域的。** Cron 在 30 分钟空闲回收时的 `dispose()` 中销毁。_补偿方案：_ 网关所有的调度器 (§6.2) —— 长生命周期，能在回收中存活，是唯一的 cron 所有者 (OD-8)。
4. **Memory 是工作区全局的，而非每频道的。** _补偿方案：_ 每频道一个进程（零代码）或 Phase-2 的 `channel` 作用域 (OD-10)。
5. **多身份 / 真正的多租户不在范围内** (Phase 3)。在 Phase 0–2 中建模为多进程。
### 风险与缓解措施

| #   | 风险                                                                                                                                                   | 严重程度 | 缓解措施                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | 在 Phase-0 的 `AcpBridge` 路径（`AcpBridge.ts:108-118`）上，Channel-stack 工具调用会被**自动批准** —— 泄露的 channel 可以在没有任何拦截的情况下运行任何工具。 | 高     | 已承诺的 Phase-1 daemon 迁移会引入 mediator；在此之前，需限制工具集 + 受信任的主机。                                                           |
| R2  | Daemon 单一全局 token 泄露会授予完整的 workspace 访问权限（HTTP daemon 路径；`AcpBridge` 路径没有 token）。                                    | 高     | 默认 loopback + bearer 拦截；非 loopback 环境下使用 `--require-auth`（OD-12）；受信任的主机；通过重启轮换 token；一旦接通，将破坏性工具置于 `consensus` 之后进行拦截。 |
| R3  | `dispatchMode` 默认值 `'steer'` 会在收到任何成员的消息时取消正在执行的任务（JSDoc 中写的是 `'collect'`，现已修正为 `'steer'`，`types.ts:42`）。       | 高     | Tag 组设置为 `'followup'`；JSDoc 已协调一致（OD-5）。                                                                                                             |
| R4  | 缺少发送者归因 → agent 会混淆发言者。                                                                                                 | 高     | Phase 0 为 group turns 注入 `[senderName]`（加上 `alreadyPrefixed`，OD-6）。                                                                                     |
| R5  | 钉钉冷群 / 过期 webhook 的主动发送会静默失败（`:137-141`）。                                                                         | 中   | Phase 1 在持久化的 `openConversationId` 上验证主动群发；`canColdSend` 失败时大声报错（fail-loud）；暴露降级情况。                                           |
| R6  | Cron/通知在 session 回收时失效（30 分钟，`run-qwen-serve.ts:94`）；同时还需要一个出站路径（R5）。                                             | 中   | 由 Gateway 拥有的调度器（§6.2）；OD-8 唯一所有者拦截。                                                                                                             |
| R7  | `requireMention` 为 true → 未被 @ 的群消息会被静默丢弃（`GroupGate.ts:51-52`）。                                                            | 低/中  | 保持默认值；补充文档；可选的首条消息提示。                                                                                                          |
| R8  | 共享的 workspace memory 会导致同置（colocated）的群组之间发生交叉污染。                                                                                           | 中   | 每个 channel 一个进程，或使用 Phase-2 的 `channel` 作用域（OD-10）。                                                                                                       |
| R9  | 速率限制是基于 `clientId`/IP 的，而不是基于用户的（daemon 路径）；`AcpBridge` 路径没有限制。                                                                | 低      | 对于单租户场景可以接受；按用户计量属于 Phase 3。                                                                                                       |
| R10 | Consensus 投票者集合在请求时进行快照；目前 channel 成员并不是不同的 `clientId`。                                                    | 低      | OD-3：Phase 1 使用 `first-responder`；在 consensus 之前解决 `senderId`→投票的映射问题。                                                                                  |
| R11 | 钉钉 SDK 除非 socket 关闭，否则永远不会刷新约 2 小时的 access token —— 主动发送/表情/媒体会静默失败。                                   | 高     | `tokenManager` 由主动发送功能拥有，通过 v1.0 `oauth2/accessToken` 端点进行刷新（§6.2，已验证）。                                            |
| R12 | 在人类 turn 期间触发主动发送并调用 `DaemonChannelBridge.prompt()` 会**抛出** `Prompt already in flight` 异常（`:257-261`）。                     | 高     | `dispatchProactive` 通过 `sessionQueues` 进行序列化，并在 `bridge.prompt()` 之前等待 `activePrompts` —— 抛出保护在结构上不可达（Fix #1，§6.2）。 |
| R13 | 预估预算的假阳性可能会拒绝合法的用户 prompt。                                                                                | 中   | 预估仅发出 WARN；仅在真实的 daemon 使用情况下才硬性拒绝（Fix #6，§6.4）。                                                                                       |
| R14 | `followup` 队列会将工具调用错误地归因给最近入队的发送者。                                                                    | 中   | 在排队的 turn 上携带 `senderId`；审计读取正在执行的 turn（Fix #7，§6.4）。                                                                               |

---

## 9. 已解决的决策

所有 v1 的 Open Decisions 均已在下方解决并给出了最终选择。**唯一真正未解决的遗留项**是 OD-7 下置信度较低的钉钉 API 细节，已在最后一行标出。

| ID                        | 问题                                                                                       | **决策**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | 将 channel 托管迁移到 `qwen serve`（Phase 1+），还是保留在 `AcpBridge` 上？                | **已解决 — 迁移。** Phase 0 在 `AcpBridge` 上发布；**Phase 1+ 通过 `DaemonChannelBridge` / daemon channel runner 将 channels 托管在 `qwen serve` 下**，继承 FIFO `promptQueue`、`MultiClientPermissionMediator`、`eventBus`、`/workspace/memory` 和速率限制。Phase 0 增加了 attach 路径（或 `--daemon <url>`），因此切换只是一个配置步骤。Gateway 调度器（§6.2）与迁移无关。不再是拦截点 —— 已确定的架构。                                                                                                                                                                                                                                                                                                                                                                                |
| **OD-2**                  | 部署单元 = 每个 workspace/channel 一个进程？                                           | **已解决 — 是。** 每个 workspace/channel 一个进程：实现 per-channel memory + 密钥隔离，限制单一全局 token 的爆炸半径。同置（colocating）多个 channels 是 Phase 3 的考量（需要 `channel` 作用域 + governor）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OD-3**                  | 多人 tag 的权限策略（一个 channel = 一个 daemon `clientId`）？                 | **已解决 — Phase 1：使用单一 channel 级别 `clientId` 的 `first-responder`**（任何被允许的成员均可解析；channel 粒度的归因；无 `senderId→clientId` 映射）。**Phase 2：`consensus`/`designated`**，前提是存在 `senderId→clientId` 名册 + 生命周期（回收、引用计数边界）。**在主动 turns 上自动拒绝高风险工具。**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | Thread 作用域的 `/clear`/`/status` 是 channel 全局的。                                             | **已解决 —— 在共享（thread）群组中，`/clear` 需要 `confirm`，并且在设置时仅限于 `config.allowedUsers`**（带连字符的 `/clear-channel` 无法解析；per-member 所有者拦截推迟到身份模型，OD-3/OD-11）；`/status` 在共享 session 上保持只读。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | `dispatchMode` 默认值不匹配（JSDoc 为 `'collect'`，而运行时为 `'steer'`）。                      | **已解决 —— 将 `types.ts:42` 的 JSDoc 修正为 `'steer'`**（匹配运行时）；tag 组 profile 显式设置 `dispatchMode: 'followup'`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OD-6**                  | 发送者标记格式 + `collect` 双重前缀。                                                | **已解决 —— 每个 turn 添加 `[senderName]` 前缀，不受 `instructedSessions` 拦截**，加上**一个新增的可选 `Envelope` 字段 `alreadyPrefixed`**（`types.ts`），以便 `collect` 模式下的合成重入跳过重复添加前缀。（纠正了 v1 中“无新字段”的说法。）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | 钉钉主动发送：端点/权限、`openConversationId` 等价性、token 刷新。 | **已通过验证的事实解决（§6.2/§6.5）：** 端点 `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _（高）_；请求体 `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _（高）_；鉴权 header `x-acs-dingtalk-access-token` 使用 v1.0 `oauth2/accessToken` token，TTL 约 7200 秒，由功能专属的 `tokenManager` 缓存和刷新 _（高）_；将 `openConversationId` 持久化到 `~/.qwen/channels/dingtalk-groups.json`；回调 `conversationId`≈`openConversationId` _（中；在出现 `invalid.openConversationId` 时回退到 `chatId→openConversationId` 转换 API）_。**剩余未解决（低置信度）：确切的权限点代码/显示名称；官方逐字等价说明句子；20次/分钟的限流是否适用于 `groupMessages/send`。** |
| **OD-8**                  | Gateway 和 session 调度器之间的 Cron 重复触发。                                       | **已解决 —— Gateway 调度器是唯一的 cron 所有者。** channel 托管的（tag）session **不会**启动其 session 内的 `Session` cron；它通过在 session 构建时从 channel host 传递的 `isTagSession` 标志来获知自己是一个 tag session（Phase 1+ 的 `DaemonChannelSessionFactory` 选项包；Phase 0 的 `--acp` 生成选项），从而跳过 `startCronScheduler()`（`Session.ts:667-668`）。这两个 cron 存储位于**不相交的路径**上（gateway 的 `~/.qwen/channels/cron.json` 与 session 的 `~/.qwen/tmp/<hash>/scheduled_tasks.json`），因此唯一的冲突风险是为相同的任务运行两个调度器 —— 这已被拦截机制消除。                                                                                                                                                                                     |
| **OD-9**                  | Token 预算的作用域、真实数据源、时间窗口。                                                   | **已解决 —— Per-process “org” 汇总 + per-channel 时间窗口，最严格者优先，固定的每日窗口。** v1 在 channel 侧预估 token（建议性，仅 WARN —— 绝不硬性拒绝，Fix #6），并在 daemon 托管后读取 **daemon 使用路径**以进行精确扣费（和硬性拒绝）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | Per-room memory 命名空间 + 写入权限。                                                 | **已解决 —— 在 `writeContextFile.ts` 中添加 `channel` 作用域（+`channelKey`）；channel-base 通过注入到 `ChannelBaseOptions` 的 CLI 层回调（`readChannelMemory`/`writeChannelMemory`）获取写入/读取权限 —— 无 `channel-base → core` 依赖。** 用户全局位置 `~/.qwen/channels/memory/`。Agent 通过 `save_memory` 意图进行追加；引导读取复用 `instructedSessions` 拦截。                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | 人类身份模型 + 审计持久性。                                                       | **已解决 —— `senderName` 仅为建议性；`clientId` 保持为唯一的安全主体。** 尽力归因随执行的 turn 携带（Fix #7）；**内存中的 FIFO 512 审计环 + 仅追加的 `~/.qwen` 后续文件**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | 非 loopback daemon 支持部署的 token 加固。                                    | **已解决 —— 任何非 loopback daemon 支持的部署都需要 `--require-auth` + token。** 仅 loopback 仅限开发环境；`--require-auth` 是文档中记录的默认姿态（`run-qwen-serve.ts` 已经强制执行非 loopback 环境下的 token）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OPEN (唯一遗留项)** | OD-7 下置信度较低的钉钉 API 细节。                                                | **仍未解决 —— 在编码前需在控制台/实时文档中验证：** (1) “主动发送群消息”的确切权限点代码/显示名称（低）；(2) 将回调 `conversationId` 与标准非酷应用机器人的 `openConversationId` 等同起来的权威官方说明句子（中；文档保证的路径是 `chatId→openConversationId` 转换 API）；(3) “20条消息/分钟 → 约10分钟限流”的限制是否逐字适用于 `groupMessages/send`（低/中 —— 针对自定义 webhook 机器人有文档记录，但在企业应用发送页面上未确认）。                                                                                                                                                                                                                                                            |
---

## 10. 风险与缓解措施

请参阅 §8 中的汇总表。按优先级排序的核心风险如下：

1. **R1 — Phase-0 通道路径上的自动批准。** 在承诺的 Phase-1 守护进程迁移落地并引入中介传输之前，驻留在通道中的 agent 会不受限制地运行_任何_工具。这是最重要的安全缺口；在 Phase 1 之前，需通过保守的工具集 + 受信任的主机来缓解。
2. **R12 — 主动重叠抛出。** 在人类回合期间调用 `DaemonChannelBridge.prompt()` 会抛出 `Prompt already in flight` (`:257-261`)。通过 `sessionQueues` 进行序列化来解决此问题（Fix #1）——这是 §6.2 的核心内容。
3. **R11 — 钉钉 token 过期。** 即“在 demo 中有效，2 小时后失效”的故障。主动功能需拥有一个 `tokenManager`（已验证 v1.0 端点，约 7200 秒 TTL），然后再发布任何长生命周期功能。
4. **R5 — 钉钉冷群静默失败。** 如果没有经过验证的发送路径，就无法向休眠群进行主动输出；`canColdSend` 会显式报错而不是直接丢弃。
5. **R3 — 群组中的 `steer` 取消。** 在运行时默认配置下会导致多人意外 DoS（拒绝服务）；tag profile 中设置了 `followup`。
6. **R13/R14 — 预算误报和归属错误。** 估算仅发出 WARN 警告（Fix #6）；归属信息随执行的回合一起传递（Fix #7）。
7. **R8 — 共享内存交叉污染。** 每个通道一个进程是零代码的缓解方案；`channel` 作用域是同置方案。

每个风险都映射到一个阶段：R1/R3/R4 属于 Phase 0–1，R5/R6/R11/R12 属于 Phase 1，R8/R13/R14 以及审计/预算风险属于 Phase 2。

---

## 11. 附录：文件与符号索引

### Channel base (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`，thread `:53`，single `:55`，user `:58`)，默认 scope `'user'` (`:25`)，`setChannelScope()` (`:40-42`)，`resolve()` (`:72-92`)，`getTarget()` (`:94`)，`persist()`/`restoreSessions()` (`:168-244`)，`PersistedEntry` (`:5-9`)。
- `ChannelBase.ts` — `handleInbound()` (`:238-471`)，prompt 构建 (`:316-347`)，`bridge.prompt()` 调用 (`:425`)，gates (`:240-252`)，`dispatchMode` 解析 (`:353-354`)，steer (`:371-379`)，collect (`:361-370,445-463`)，followup (`:381-383,394-470`)，`activePrompts` (`:32-35,356`)，`sessionQueues` (`:394,466`)，抽象方法 `sendMessage()` (`:81`)，`registerCommand()` (`:141-143`)，构造函数 router (`:62-64`)，`ChannelBaseOptions` (`:9-22,46`)，`/clear`/`/status` (`:147-217`)。
- `AcpBridge.ts` — 启动 `--acp` (`:53-70`)，`newSession(cwd)` (`:131`)，`prompt()` (`:147-180`)，自动批准 `requestPermission` (`:108-118`)，`AcpBridgeOptions` (`:17-21`)。
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`)，session factory options 参数包 (`:226-241`)，`activePrompts` 守卫 / **抛出 `Prompt already in flight`** (`:257-261`)，`cancelSession` (`:332`)，`respondToPermission` (`:346-374`)，permission events (`:557-633`)。
- `GroupGate.ts` — `requireMention` 默认为 true (`:49`)，membership (`:42`)，mention gating (`:51-52`)，fallback chain (`:48`)，默认 policy `'disabled'` (`:13`)。
- `SenderGate.ts` — `check()` + pairing (`:42`)。
- `types.ts` — `GroupConfig` (`:10-13`)，`ChannelConfig` (`:27-51`)，`approvalMode` (`:36`)，`dispatchMode` JSDoc 修正为 `'steer'` (`:42`)，`senderName` (`:69`)，新增 `alreadyPrefixed` 字段，`isGroup` (`:75`)，`SessionTarget` (`:88-93`)。

### DingTalk (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — `webhooks` map (`:84`)，`sendMessage()` (`:134-170`，无 webhook 时返回 `:137-141`)，webhook 缓存 (`:516-517`)，`getAccessToken()` (`:172-174`)，`emotionApi()` (`:188-207`，robotCode `:184`，openConversationId `:197`，空 catch 反模式 `:214-216`)，media robotCode (`:435`)，入站 `conversationId` (`:506`)，mention 剥离 (`:527-529`)，`isMentioned` (`:520`)，`senderName` (`:544`)，`extractQuotedContext()` (`:272-298`)，`chatId` (`:534`)，无 `threadId` (`:541-551`)。
- `proactive.ts`（新增）— `sendGroupMessage()` 调用 `POST /v1.0/robot/groupMessages/send`（`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` JSON 字符串），`tokenManager`（v1.0 `oauth2/accessToken`，约 7200 秒 TTL，定时器 + 401 刷新），`chatId→openConversationId` 转换回退。
- `markdown.ts` — 表格透传，`splitChunks()`，`CHUNK_LIMIT=3800`（≤ `sampleMarkdown` 约 5000 字符的预算），`extractTitle()`，`normalizeDingTalkMarkdown()`。
- `media.ts` — `downloadMedia` header (`:39`)，body `:42`。
- SDK：`client.mjs` gettoken (`:85-87`)，reconnect (`:157-163`)，event/callback 拆分 (`:14-19,35-37,58-61,241-257`)；`constants.d.ts` `sessionWebhookExpiredTime` (`:13`)，`robotCode` (`:19`)，`TOPIC_CARD` (`:4`)。

### Feishu (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` 主动发送 (`:622-676`，endpoint `:651`；`canColdSend = true`)，`refreshToken()` (`:581-620`)，`connect()` 模式 (`:146-176`)，`updateCard()` (`:742-792`)，ingest 去重 (`:1633-1870`)。
- `markdown.ts` — schema-v2 卡片内容 (`:69-189`)，`splitChunks()` (`:198-256`)。

### Core (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`，+`'channel'`)，`WriteContextFileOptions` (`:83-97`，+`channelKey`)，`resolveContextFilePath()` (`:223-240`，+`channel` 分支 + `channelKey` 参数)，per-file mutex (`:48-57,159-162`)，绝对路径守卫 (`:142-146`)，`MAX_EXISTING_FILE_BYTES` (`:255`)，replace-mode (`:202-211`)。
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`)。
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`)，per-project 哈希路径 (`:1-9`)。
- `Session.ts` — `cronQueue`/`cronProcessing` 字段声明 (`:667-668`)，`startCronScheduler()` (`:758`，根据 OD-8 跳过 tag sessions)，`dispose()` cron 清理 (`:790-812`)，`#recordPromptTokenCount()` (`:2078-2087`)，`setNotificationCallback()` (`:2638-2668`)，`isIdle()` (`:777`)。

### Serve / daemon (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — per-`SessionEntry` FIFO `promptQueue` (`:232,2855,3082`)，`publishWorkspaceEvent` (`:3610,3649-3675`)。
- `eventBus.ts` — `BridgeEvent.data` 自由格式 (`:51`)，`originatorClientId` (`:60`)，hysteresis 阈值 (`:101-103`)，replay ring (`:92`)。
- `permissionMediator.ts` — 四种 policies + consensus quorum (`:348,621-637`)。
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`)，closed entry union (`:57-104`)，预期 GET 接口的 header 文档 (`:22-25`)。
- `rate-limit.ts` — per-`(clientId|ip)` 令牌桶；`X-Qwen-Client-Id` (`:110`)。
- `auth.ts` — 全局 bearer token (`:259-266`)，`createMutationGate` 严格模式 (`:356`)。
- `workspace-memory.ts` — scopes `workspace|global` (`:118-125`)，strict-auth mutate (`:114`)，单次写入上限 `MAX_MEMORY_CONTENT_BYTES` (`:79`)，固定 `projectRoot` 转发 (`:185-190`)。

### CLI channel commands (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`)，`AcpBridge` 构造 (`:213,268,356,435`)，`setChannelScope` (`:361-362`)，`restoreSessions` (`:275,444`)，`sessionsPath()` (`:56-58`)，`checkDuplicateInstance()` (`:170-179`)，disconnect handler (`:241,403`)；Phase 1+ daemon attach 路径；CLI 层注入 `readChannelMemory`/`writeChannelMemory`。
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`，sessionScope 默认值 `:91-92`，approvalMode `:94`，groupPolicy `:98`)，`resolveEnvVars()` (`:6-18`)。
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`)，channel types (`:10-14`)。