# RFC: "qwen tag" — 面向 qwen-code 的持久化、多用户、频道常驻 agent（钉钉优先）

**状态：** 草案 (v2)
**日期：** 2026-06-25
**作者：** (qwen-code)

---

## 更新日志 (v1 → v2)

本次修订解决了 v1 中的所有待定决策（现已转为 **已解决决策**，见 §9），并修复了评审中提出的七个正确性/一致性缺陷。两个核心架构变更：

- **OD-1 不再是阻塞项 — 它已是确定的架构。** Phase 0 基于当前的 `AcpBridge` 路径发布；**Phase 1+ 将频道托管迁移至 `qwen serve` 守护进程**（通过 `DaemonChannelBridge` / 守护进程频道运行器），以复用每个会话的 FIFO `promptQueue`、`MultiClientPermissionMediator`、`eventBus`、`/workspace/memory` 和限流机制。所有之前写着“OD-1 待定 / 阻塞所有事项”的章节现在均按已决定处理，且守护进程承诺已贯穿 §1、§4、§5、§6.1、§6.2、§6.3、§6.4 和 §7。
- **主动触发路径已针对其实际运行的守护进程路径重新设计。** v1 的 `dispatchProactive` 是为 `AcpBridge` 语义（频道侧的 `sessionQueues`）编写的。在守护进程迁移下，`DaemonChannelBridge.prompt()` 在发生重叠时会**抛出 `Prompt already in flight`**（`DaemonChannelBridge.ts:257-261`）而不是排队。v2 通过 `ChannelBase.sessionQueues` 对**两种**变体的主动提示进行序列化，因此永远不会触发抛出守卫，并在 §6.2 中明确声明了不可取消的不变量。

纳入的决议和修复：

- **OD-2** 已决定：每个 workspace/channel 一个进程。
- **OD-3** 已决定：Phase 1 采用 `first-responder` + 单频道级 `clientId`；Phase 2 在存在 `senderId→clientId` 名册和生命周期后采用 `consensus`/`designated`；在主动轮次中自动拒绝高风险工具。
- **OD-4** 已决定：在共享（线程）群组中，`/clear` 需要显式 `confirm`，且在设置了 `config.allowedUsers` 时仅限于该列表中的用户；`/status` 为只读。（带连字符的 `/clear-channel` 无法被斜杠语法解析；真正的每成员所有者守卫需等待身份模型 — OD-3/OD-11。）
- **OD-5** 已决定：修复过时的 `types.ts:42` JSDoc 为 `'steer'`；标签群组 profile 显式设置 `dispatchMode: 'followup'`。
- **OD-6** 已决定：每轮添加 `[senderName]` 前缀，**不受** `instructedSessions` 限制；**新增一个可选的 `Envelope` 字段 `alreadyPrefixed`**，以便 `collect` 模式下的合成重入跳过重复添加前缀。（纠正了 v1 中“无新 envelope 字段”的说法 — 修复 #2。）
- **OD-7** 已解决：使用经过验证的钉钉 API 事实（§6.2/§6.5），低置信度项仍被标记。
- **OD-8** 已决定：网关/守护进程调度器是**唯一**的 cron 所有者；标签会话**不会**启动其会话内的 `Session` cron；两个 cron 存储位于不相交的路径上，因此只有当两个调度器为相同的任务运行时才会发生冲突。
- **OD-9** 已决定：每进程“org”汇总 + 每频道窗口，最严格优先，固定每日窗口；v1 在频道侧估算 token，并在守护进程托管后读取守护进程使用量路径。
- **OD-10** 已决定：在 `writeContextFile.ts` 中添加 `channel` 作用域（+`channelKey`）；channel-base 通过**通过 `ChannelBaseOptions` 注入的 CLI 层回调**获取读/写权限（无 `channel-base → core` 依赖）；用户全局位置为 `~/.qwen/channels/memory/`。
- **OD-11** 已决定：`senderName` 仅作建议；`clientId` 是唯一的安全主体；内存审计环 + 仅追加的 `~/.qwen` 后续文件。
- **OD-12** 已决定：对于任何非环回守护进程支持的部署，要求 `--require-auth` + token。

超出 OD 决议之外的正确性修复：

- **修复 #1 — 主动触发路径并发** 针对守护进程路径重新设计（§6.2），并对 Phase-0 `AcpBridge` 变体和 Phase-1+ 守护进程变体强制执行不可取消的不变量。
- **修复 #2 — 消除内部矛盾**：§6.1/G2 不再声称“无新 envelope 字段”；它承认存在一个 `alreadyPrefixed` 字段。
- **修复 #3 — 内存接线设计**（§6.3）：确切的 `ChannelBaseOptions` 更改（`readChannelMemory`/`writeChannelMemory` 回调）以及在 `start.ts` 中由谁构造/注入它们，其中每会话一次的引导读取复用 `instructedSessions` 守卫。
- **修复 #4 — 设计 `canColdSend` 能力标志**（§6.2）：声明位置、钉钉/飞书如何设置它，以及调度器如何立即报错（fail loud）。
- **修复 #5 — OD-8 不相交存储澄清**（§6.2）：网关存储和 `Session` 存储是不同的路径；唯一的冲突风险是标签会话也运行会话内 cron — 已通过 OD-8 守卫关闭。
- **修复 #6 — 估算预算执行**（§6.4）：估算可以 WARN/alert，但绝不能硬拒绝用户提示；仅在真实的守护进程使用量数据上进行硬拒绝。
- **修复 #7 — `followup` 下的审计归因**（§6.4）：携带 `senderId` _与_ 排队的提示一起，以便工具调用/权限归因于实际执行的轮次，而不是最近排队的发送者。

v1 中经过验证的基准事实（AcpBridge 拓扑、AcpBridge 自动批准、抽象 `sendMessage`、作用域、解析器默认值）保持不变。

---

## 1. 概述

**“qwen tag”** 是一个共享的 qwen-code agent，它驻留在聊天频道中 — 首先是钉钉群，其次是飞书群 — 该频道内的任何成员都可以通过 `@` 提及来召唤它。一旦被召唤，它就会针对绑定的 workspace 运行完整的 qwen-code agent 循环（工具、文件编辑、shell、MCP），在工作过程中将其工作流式传回频道，**跨轮次和重启记住该频道**，并且可以**主动或按计划**采取行动，而无需等待被询问。这类似于 Claude Tag 的形态 — 一个持久的多用户 agent，它是房间的_常驻居民_，而不是 1:1 的 DM 机器人 — 但它完全构建在 qwen-code 现有的频道适配器栈（`qwen channel start`、`packages/channels/*`）和 `qwen serve` 守护进程之上，而不是新的托管服务。

本 RFC 的明确定位是：**该形态的响应式部分已基本发布，而主动式/记忆部分尚未实现。** 使 Claude-Tag 风格的_回复_ agent 变得困难的部分 — 多路复用会话的长运行进程、保留每会话单提示不变量的 agent 传输、多用户会话路由、每频道访问控制、流式卡片渲染和持久会话持久化 — 已经存在，并由当前的频道适配器使用。_缺失的_是一组界限明确的功能，这些功能将响应式回复机器人转变为常驻 agent：共享会话中的发送者归因、主动/计划输出路径、每房间记忆和多用户治理。本 RFC 将该差距划分为**四个构建领域**，并在 Phase 0–2 中对其进行规范。

> 关于“80%”的说明：早期草案将其表述为“~80% 已发布”。该数字无法验证且夸大了事实 — 整个主动引擎（构建领域 2）和每房间记忆（构建领域 3）都是全新的，特别是在钉钉上，_完全没有_主动发起路径。我们将其重新表述为“响应式路径已构建；主动式和记忆路径尚未构建。”

### 约束整个 RFC 的一个拓扑事实

频道适配器连接到 qwen agent 有**两种截然不同的方式**，位于**两个不同的进程**中，混淆它们是早期草案中最常见的错误：

- **`qwen channel start <name>`（发布路径）。** `start.ts` 构造 **`new AcpBridge(bridgeOpts)`**（`start.ts:213,268,356,435`），并且 `AcpBridge.start()` **生成一个子** `node <cliEntryPath> --acp` 进程（`AcpBridge.ts:53-70`），通过 **stdio** 上的 NDJSON 进行 ACP 通信。这个子进程是一个_独立的 agent_，而不是 `qwen serve` HTTP 守护进程。在这种拓扑中，**没有 HTTP 守护进程、没有 `/workspace/memory` 路由、没有 `MultiClientPermissionMediator`、没有 `eventBus` 重放环，也没有守护进程 `promptQueue`** — 这些都存在于 `packages/acp-bridge` + `packages/cli/src/serve` 中，而 `qwen channel start` 永远不会实例化它们。这里的提示序列化完全由 `ChannelBase` 在**频道侧**完成（`ChannelBase.ts:356-391` 处的 `activePrompts` 互斥锁 + `:394-470` 处的 `sessionQueues` 链）以及子进程自身的 ACP 每会话单提示不变量。`AcpBridge.requestPermission` **自动批准每个工具调用**（`AcpBridge.ts:108-118`）。
- **`qwen serve` + `DaemonChannelBridge`（守护进程托管）。** `DaemonChannelBridge`（`packages/channels/base/src/DaemonChannelBridge.ts`）是一个进程内桥接器，其 `sessionFactory` 生成守护进程 `Session` 对象。此路径在守护进程内运行频道，从而继承 `acp-bridge` 的 FIFO `promptQueue`（`bridge.ts:232,2855,3082`）、`MultiClientPermissionMediator`、`eventBus` 和 HTTP 路由。**`qwen channel start` 目前不会实例化它**（`start.ts` 中零引用）。塑造主动设计的一个尖锐边缘是：`DaemonChannelBridge.prompt()` **不排队 — 它在重叠时抛出 `Prompt already in flight`**（`DaemonChannelBridge.ts:257-261`）；它最终到达的 FIFO `promptQueue` 位于守护进程/acp-bridge 侧，_在_该进程内抛出守卫_之后_。因此，主动引擎必须在频道层进行序列化（§6.2）。

**已确定的架构（原 OD-1，现已决定）：** 多客户端守护进程机制通过**将频道托管迁移至 `qwen serve` 守护进程**（从 Phase 1 开始）来复用。

- **Phase 0** 基于当前的 `AcpBridge` 路径发布（身份注入既不需要 HTTP 路由也不需要中介）。
- **Phase 1+** 在 `qwen serve` 守护进程下运行频道（通过 `DaemonChannelBridge` 或守护进程频道运行器），因为主动引擎、每房间记忆持久化和治理都需要守护进程的持久性、路由、`promptQueue`、中介和事件总线。

这不再是“待定”或“阻塞”：Phase 0 接线添加了 `DaemonChannelBridge` 附加路径（或 `--daemon <url>` 标志），以便在 Phase 1 开始时即可进行迁移。网关拥有的调度器（§6.2）被构建为**迁移中立**的，因此它在切换前后运行方式完全相同。

### “qwen tag” 的具体形态

“qwen tag” 部署是一个绑定到单个 workspace 的 agent 进程，加上一个 `qwen channel start dingtalk` 适配器，配置为整个群组共享**一个** agent 会话。两个**截然不同的作用域概念**必须同时对齐：

1. **频道路由作用域**（`ChannelConfig.sessionScope`，由 `SessionRouter.routingKey()` 消费）：决定入站消息如何映射到路由键。对于标签，这必须是 `'thread'`，以便整个群组共享一个路由键（`channel:(threadId||chatId)`，`SessionRouter.ts:53`）。**解析器默认值是 `'user'`，而不是 `'thread'`**（`config-utils.ts:91-92`），因此标签配方必须显式设置它。
2. **Bridge/ACP 会话作用域**（`DaemonChannelBridge` / `acp-bridge` `sessionScope`）：决定守护进程如何共享底层 ACP 会话。`DaemonChannelBridge.newSession()` 默认将其设置为 `'thread'`（`DaemonChannelBridge.ts:229,240`）；`acp-bridge` 的进程内路径默认为 `'single'`（`bridge.ts:709`）。这是一个与频道路由作用域**独立的旋钮**，并且_不在_ `qwen channel start` 路径上（`AcpBridge.newSession(cwd)` 仅接受 `cwd`，`AcpBridge.ts:131`）。

具备这些条件后：

- **每个房间一个 agent，通过提及召唤。** `GroupGate` 强制执行 `requireMention`（默认 `true`，`GroupGate.ts:49`），因此 agent 保持沉默，直到被 `@` 提及或它是对机器人的回复（`GroupGate.ts:51`）。多用户键是 `sessionScope: 'thread'`，映射到 `channel:(threadId||chatId)`（`SessionRouter.ts:50-53`），因此每个成员无论发送者是谁都复用相同的 `sessionId`。
- **使用工具进行真正的多阶段工作。** 入站消息通过 `ChannelBase.handleInbound()` 成为提示，它从消息文本、回复引用上下文、附件文件路径和（每会话一次）`config.instructions` 构建 `promptText`（`ChannelBase.ts:316-347`），然后通过 `bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` 进行分发（`ChannelBase.ts:425` — `promptText` 是位置参数；选项对象仅携带图像字段）。
- **将其工作流式传回房间。** 适配器将增量输出渲染为平台原生卡片（飞书 create/update/finalize，`markdown.ts`；钉钉 markdown 分块，`DingtalkAdapter.ts:144-169`）。
- **记住该频道。** `SessionRouter.persist()` / `restoreSessions()` 持久存储 `sessionId`、目标和 `cwd`，并通过 `bridge.loadSession()` 在重启时重新水合（`SessionRouter.ts:168-244`）；workspace 记忆（`QWEN.md` / `~/.qwen/QWEN.md`）通过 `GET` / `POST /workspace/memory` 进行读/写（`workspace-memory.ts`）。此记忆是 workspace/全局作用域的，而不是每房间的 — 见构建领域 3。
- **可以主动/按计划采取行动。** 这是尚未端到端存在的另一半，也是 Phase 1 的核心。

---

## 2. 动机

常驻多用户_回复_ agent 通常所需的基础设施在本仓库中已基本沉淀。真正缺失的工作是四个构建领域。

| Tag 形态所需的能力 | 已存在（引用） |
| --- | --- |
| 长运行、多会话进程 | `AcpBridge` 生成一个长生命周期的 `--acp` 子进程（`AcpBridge.ts:53-70`）；守护进程路径添加每会话 FIFO `promptQueue`（`bridge.ts:232,2855,3082`） |
| 多用户“一个房间，一个会话”路由 | `SessionRouter` `'thread'` 作用域（`SessionRouter.ts:53`），每频道覆盖 `setChannelScope()`（`SessionRouter.ts:40`） |
| 提及召唤语义 | `GroupGate` `requireMention` 默认 `true`（`GroupGate.ts:49-52`） |
| 访问控制 + 引导 | `SenderGate` 允许列表 + 配对码流程；按群组然后发送者应用守卫（`ChannelBase.ts:240-252`） |
| 跨重启的持久会话映射 | `SessionRouter` 持久化（`SessionRouter.ts:168-244`） |
| Workspace 记忆读/写 | `GET` / `POST /workspace/memory`（`workspace-memory.ts`）；仅限 workspace + 全局作用域；仅守护进程 |
| 多参与者权限控制 + 审计（仅守护进程） | `MultiClientPermissionMediator` 四种策略，包括 `consensus` 法定人数（`permissionMediator.ts:621-637`）；独立的权限审计环（`permission-audit.ts`） |
| 身份验证、限流、环回安全（仅守护进程） | 全局 bearer token（`auth.ts:259-266`） + 每 clientId/IP 分层限流（`rate-limit.ts`） |
| 会话内推送原语（后台任务） | `Session` 通知队列 + `setNotificationCallback()` 将后台任务/监控/shell 输出馈送到打开的会话中（`Session.ts:688-689,2638-2668`）；`isIdle()` 将其考虑在内（`Session.ts:777`） |
| 平台交付（钉钉 + 飞书） | 具有流式卡片、媒体、反应功能的工作适配器（`DingtalkAdapter.ts`、`FeishuAdapter.ts`） |

由于 Phase 1+ 在守护进程下运行（已确定的架构，§1），上述仅守护进程的行将成为主动引擎、记忆持久化和治理的可用能力 — 而不仅仅是“如果我们迁移的目标”。

四个构建领域，在 §6 中详细展开：

1. **用于_声明_标签的 Config + identity（Phase 0）。** 一个可复制粘贴的配置配方 — `sessionScope: 'thread'`、`groupPolicy`、`requireMention`、`instructions`、`dispatchMode` — 加上**发送者归因差距**：`handleInbound()` 故意**不**将 `senderName` 注入 `promptText`（`ChannelBase.ts:316-347`；`senderName` 仅用于 `ChannelBase.ts:246` 处的访问控制）。在共享的 `'thread'` 会话中，agent 无法分辨_谁_在说话。Phase 0 注入一个发送者标记，就像回复引用上下文已经做的那样（`ChannelBase.ts:318`）。
2. **主动/外向发起引擎（Phase 1）。** 今天**在频道边界完全没有主动路径**：`ChannelBase.sendMessage()` 是抽象的（`ChannelBase.ts:81`），并且仅在响应内部调用。在钉钉上，`sendMessage()` 只能通过入站时缓存在每个 `conversationId` 上的短期 `sessionWebhook` 进行回复（`DingtalkAdapter.ts:134-142`），因此**根本无法向冷群组发送消息**（`DingtalkAdapter.ts:137-141` 静默返回）。Phase 1 添加了一个守护进程常驻调度器和一个钉钉主动发送路径。
3. **频道常驻记忆 + 检索（Phase 2，记忆部分）。** Workspace 记忆是 **workspace 全局的，而不是每房间的**：`POST /workspace/memory` 仅接受 `scope: 'workspace' | 'global'`（`workspace-memory.ts:118-125`），并且是一个**严格认证的变更路由**（`deps.mutate({ strict: true })`，`workspace-memory.ts:114`）。一个“记住_这个_频道”的标签需要一个每房间的记忆命名空间。
4. **多用户治理 + 安全（Phase 2，治理部分）。** 适合群组的权限策略、主动操作护栏和取证审计，建立在现有的 `clientId` 级别（而非人类身份级别）机制之上。

---

## 3. 目标与非目标

### 目标

- **G1 — 在钉钉上记录并发布“标签”配置**：一个可复制粘贴的 `channels.dingtalk` 配方（显式 `sessionScope: 'thread'`、列出群组 ID 的 `groupPolicy: 'allowlist'`、`requireMention: true`、`instructions` 以及精心选择的 `dispatchMode`），生成一个工作的常驻多用户 agent，复用 `parseChannelConfig()` 和现有的守卫。配方必须指出路由作用域与 ACP 作用域的区别，以及必须覆盖解析器默认值 `'user'`。
- **G2 — 共享会话中的发送者归因。** 将每消息发送者标记注入 `promptText`，以便 agent 能够区分 `'thread'` 作用域群组中的发言者，而不破坏由 `instructedSessions` 跟踪的每会话一次 `instructions` 注入（`ChannelBase.ts:344-346`）。该标记是**每消息**的（发言者每轮都在变化），并且**不能**受 `instructedSessions` 限制。这需要**一个新的可选 `Envelope` 字段 `alreadyPrefixed`**（`types.ts`），以便 `collect` 模式下的合成重入不会双重添加前缀 — 见 §6.1。（v1 错误地将其描述为“仅限格式，无新字段”。）
- **G3 — 主动引擎。** 一种机制，用于 (a) 向刚刚没有发消息的频道发起输出，以及 (b) 独立于任何打开的交互式会话按计划触发，尽可能通过现有的每会话通知路径进行交付 — 包括钉钉主动发送 API 和持久化的 `openConversationId` 存储，并定义 token 刷新所有者。必须通过 `ChannelBase.sessionQueues` 序列化（永不 `steer` 取消人类轮次），在两种拓扑下遵守 ACP 每会话单提示不变量（NG6）。
- **G4 — 频道常驻记忆。** 一个每房间记忆命名空间和检索路径，分层构建在现有的 `/workspace/memory` 机制和 `instructions` 机制之上。该设计在 `writeContextFile.ts` 中添加了一个新的 `channel` 作用域（+`channelKey`），并通过**通过 `ChannelBaseOptions` 注入的 CLI 层回调**从 `channel-base` 访问它（无 `channel-base → core` 依赖）。
- **G5 — 多用户治理。** 适合群组的权限策略、主动操作护栏和审计，建立在 `MultiClientPermissionMediator` 和权限审计环之上。必须考虑到投票归因于 `clientId` 而非人类身份，并且在单个共享的 `'thread'` 会话中，每个群组成员都是_同一个_守护进程客户端。
- **G6 — 飞书对等**，针对 G1–G5 中的所有内容，视为后续工作。飞书稳定的 `tenant_access_token` 已经支持仅通过 `chatId` 向任何聊天进行主动发送（`FeishuAdapter.ts:622-651`），因此飞书在 G3 中_不需要_新的发送 API — 只需要守护进程级别的唤醒/调度机制。飞书声明 `canColdSend = true`。
- **G7 — 复用优于重新发明。** 每个构建领域都扩展现有机制（守卫、路由器、桥接器、中介、记忆路由、会话内通知路径、cron），而不是引入并行的子系统。
### 非目标

- **NG1 — 不是托管的多租户 SaaS。** “qwen tag” 是一个绑定到**单个** workspace 的 agent 进程（`serve.ts:165-171`；多 workspace = 每个 workspace 一个 daemon，运行在独立端口）。没有中央控制平面。
- **NG2 — 本 RFC 中不包含针对个人的身份、计费或成本预算。** daemon 的身份模型是**单个全局 bearer token**（`auth.ts:259-266`），并在整个 event bus 和权限审计中进行 `clientId` 级别的归因。我们在 prompt 中添加 sender _标记_（G2），但**不**引入经过身份验证的 per-user 主体、per-user 配额或成本跟踪。Sender 标记是建议性的 prompt 文本，不是认证边界——每个群成员共享 daemon 的单个 workspace 凭证，并且在共享的 `'thread'` 会话中，使用的是_同一个_ daemon `clientId`。
- **NG3 — Phase-3 的多身份网关不在范围内**，此处仅作为前瞻性指引提及。本 RFC 涵盖 Phase 0–2。
- **NG4 — 飞书是次要的，不是并列主要的。** 钉钉是参考实现，也是所有工作示例的来源。
- **NG5 — Slack 和其他西方平台不在范围内。** 注册的 channel 类型为 `telegram`、`weixin`、`dingtalk`、`feishu` 和 `qq`（`channel-registry.ts:10-14`）；不存在 Slack 适配器。
- **NG6 — 不改变 ACP 每个会话一个 prompt 的不变量。** 定时/主动 prompt 只是 channel `sessionQueues` 中的另一个条目；它不能与同一会话上的 user turn 并发运行，也不能取消它。
- **NG7 — 没有新的 chat 作用域 memory store 引擎。** Channel 驻留 memory（G4）在现有的基于文件的 `QWEN.md`/`AGENTS.md` 文件之上增加_命名空间_层；没有向量数据库或 per-room 数据库。

---

## 4. 现状评估

已构建 (B)，部分 (P)，缺失 (M)。“File” 引用权威符号。“Topology” 说明该能力是存在于 `AcpBridge` channel 路径 (A)、`qwen serve` daemon 路径 (D)，还是两者皆有——并且，由于 Phase 1+ 承诺在 daemon 下运行，如果迁移是解锁该能力的关键，则会标注“→D”。

| 能力 | 当前 qwen-code (文件 / 符号) | 拓扑 | 差距 | 规模 |
| --- | --- | --- | --- | --- |
| 单房间单会话路由 | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`) | A+D | 默认 scope 是 `'user'` (`config-utils.ts:91-92`)；operator 必须设置为 `'thread'` | 配置 (S) |
| 提及召唤 | `GroupGate.requireMention` 默认 `true` (`GroupGate.ts:49-52`) | A+D | 无 — 已正确 | — |
| 访问控制 / 引导 | `SenderGate` 允许列表 + 配对 (`ChannelBase.ts:240-252`) | A+D | 无 | — |
| 持久化会话映射 | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`) | A+D | 无 | — |
| **Prompt 中的 Sender 归因** | `handleInbound()` 构建 promptText 时不包含 `senderName` (`ChannelBase.ts:316-347`) | A+D | `senderName` 从未注入；agent 无法分辨是谁在说话；需要新的 `Envelope.alreadyPrefixed` | 代码 (S) |
| Prompt 序列化 | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`)；daemon `promptQueue` (`bridge.ts:2855`) | A (channel) / D (daemon) | `DaemonChannelBridge.prompt()` 在重叠时抛出异常（`:257-261`）——主动引擎必须在 channel 侧进行序列化；`dispatchMode` 默认 `'steer'` 会取消对等项（`:354,371-379`） | 配置 + 代码 (S) |
| **出站发起 / 主动发送** | `ChannelBase.sendMessage()` 抽象 (`:81`)；钉钉仅支持 webhook (`DingtalkAdapter.ts:134-142`) | A+D | 没有主动接缝；钉钉冷群无法发送消息；需要 `canColdSend` 能力标志 | 代码 (L) |
| **Daemon 级调度器** | Cron 是会话作用域的 (`Session.ts:667-668`)，在 `dispose()` 时终止 (`:790-812`) | A+D (gateway) → D (audit/queue 复用) | `serve/` 或 `channels/` 中没有 daemon 调度器端点；gateway 调度器是唯一所有者 (OD-8) | 代码 (L) |
| 会话内推送原语 | `setNotificationCallback` (`Session.ts:2638-2668`) | A+D | 仅投递到_活跃_会话中；无法唤醒已回收的会话 | (复用) |
| **Per-room memory** | `/workspace/memory` 作用域 `workspace\|global` (`workspace-memory.ts:118-125`) | 仅 D | 没有 chat/channel 作用域；需要新的 `channel` 作用域 + CLI 层回调（无核心依赖） | 代码 (M) |
| 多参与者权限投票 | `MultiClientPermissionMediator` 4 种策略 (`permissionMediator.ts:621-637`) | D (继承自 Phase 1+) | `AcpBridge` 自动批准 (`AcpBridge.ts:108-118`)；投票是 per-`clientId`，每个 channel 一个 client | 代码 (L) |
| 审计跟踪 | `PermissionAuditRing` FIFO 512 (`permission-audit.ts`) | D + channel 侧 ring | 没有人类 `senderId`；在内存中，重启时丢失；`~/.qwen` 仅追加后续跟进 | 代码 (M) |
| **Token / 成本预算** | 无（rate-limit 仅限请求计数，`rate-limit.ts`） | channel 侧账本 + D 使用量 | 没有支出计量器；v1 估算（建议性），仅在 daemon 托管时进行实际扣款 | 代码 (M) |
| Per-channel tool/MCP 作用域 | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`)；MCP 允许过滤 (`:3327-3333`) | per-`Config` | 没有从 channel 到 `--acp` 子进程 (AcpBridge) 的 spawn-arg 路径；托管后为 per-daemon `Config` | 代码 (M) |
| 钉钉主动发送 | 未实现（仅 `robot/emotion`、`messageFiles/download`） | A+D | 新端点 + 持久化 `openConversationId` + token 刷新（已验证契约，§6.2） | 代码 (L) |
| 飞书主动发送 | 通过 `tenant_access_token` 的 `sendMessage()` (`FeishuAdapter.ts:622-676`) | A+D | 无 — `canColdSend = true` | — |

规模说明：S = 配置/少量代码，M = 模块 + 接口变更，L = 多包变更或新子系统。

---

## 5. 架构

`qwen tag` **不是一个新的 runtime**。它是嫁接在现有 adapter 栈上的四个薄层。基础层已经提供了一个支持多人协作、可运行工具、配备 MCP 的 agent，可通过 chat channel 访问。这四个新层与差距一一对应：(1) **谁在说话** — sender 身份从未到达 prompt；(2) **无提示行动** — 没有出站发起路径，会话内 cron 随会话终止；(3) **记住 channel** — memory 是 workspace 全局的；(4) **治理共享大脑** — 认证是单个全局 token，没有 per-channel 预算。

下面的每一层都说明了它假设的拓扑（见 §1）。**承诺的拆分**：Phase 0 在 `AcpBridge` 上；Phase 1+ 通过 `DaemonChannelBridge` 在 `qwen serve` daemon 上。

### 基础层（现有）— `qwen channel start` 拓扑 (Phase 0)

```
                              one host, one workspace
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk                                                   │
│                                                                                │
│  ┌────────────────────┐    Envelope     ┌───────────────────────────────────┐ │
│  │ DingtalkAdapter     │ ──────────────▶ │ ChannelBase.handleInbound()       │ │
│  │ (stream client,     │                 │  1 GroupGate.check (mention/      │ │
│  │  webhooks map by     │ ◀────────────── │    policy/allowlist)             │ │
│  │  conversationId)     │   text/markdown │  2 SenderGate.check (pairing)    │ │
│  │  sendMessage()       │                 │  3 slash / "!" commands          │ │
│  └────────────────────┘                 │  4 router.resolve(...)           │ │
│        ▲  sessionWebhook (expires,       │  5 dispatchMode (steer default)  │ │
│        │  per inbound msg only)          └───────────────┬───────────────────┘ │
│        │                                                 │ sessionId            │
│        │                                ┌────────────────▼──────────────────┐ │
│        │                                │ SessionRouter                      │ │
│        │                                │  routingKey(): user|thread|single  │ │
│        │                                │  persist() → JSON (crash recovery)  │ │
│        │                                └────────────────┬──────────────────┘ │
│        │   textChunk / toolCall events  ┌────────────────▼──────────────────┐ │
│        └─────────────────────────────── │ AcpBridge (NOT the HTTP daemon)    │ │
│                                         │  spawns child `node <cli> --acp`   │ │
│                                         │  ClientSideConnection over stdio    │ │
│                                         │  requestPermission AUTO-APPROVES    │ │
│                                         └────────────────┬──────────────────┘ │
└──────────────────────────────────────────────────────────┼─────────────────────┘
                                                             │ ACP / NDJSON (stdio)
                                          ┌──────────────────▼─────────────────────┐
                                          │ child agent process (`--acp`)           │
                                          │  one prompt-in-flight per ACP session   │
                                          │  in-session cron (Session.ts) — DISABLED│
                                          │  for tag sessions (OD-8); MCP, tools.   │
                                          │  NO promptQueue/eventBus/mediator       │
                                          └─────────────────────────────────────────┘
```

### Daemon 托管拓扑 (Phase 1+) — `qwen serve` + `DaemonChannelBridge`

```
                              one host, one workspace, ONE daemon
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk  (channels hosted IN the daemon)                  │
│  ┌────────────────────┐  Envelope   ┌────────────────────────────────────────┐│
│  │ DingtalkAdapter     │ ──────────▶ │ ChannelBase.handleInbound()            ││
│  │ pushProactive()     │ ◀────────── │  gates → governor.admit → router       ││
│  │ canColdSend = false*│             │  → sessionQueues (FIFO, serialization)  ││
│  └────────────────────┘             └───────────────┬────────────────────────┘│
│         ▲ proactive group-send                       │ bridge.prompt()          │
│         │ (openConversationId)        ┌───────────────▼────────────────────────┐│
│  ┌──────┴────────────┐               │ DaemonChannelBridge                      ││
│  │ ChannelCronSched   │──fire────────▶│  prompt() THROWS on overlap (:257-261)  ││
│  │ (gateway-owned,    │ dispatchProa- │  → so all prompts MUST arrive serialized││
│  │  sole cron owner)  │ ctive via     │     via sessionQueues                   ││
│  └────────────────────┘ sessionQueues └───────────────┬────────────────────────┘│
│                                                        │ in-process Session       │
│                                       ┌────────────────▼────────────────────────┐│
│                                       │ daemon: acp-bridge FIFO promptQueue,     ││
│                                       │  MultiClientPermissionMediator, eventBus, ││
│                                       │  /workspace/memory + /channel routes,     ││
│                                       │  rate-limit, bearer auth                  ││
│                                       └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
* DingTalk canColdSend flips true once the proactive-send path ships (§6.2).
```

我们构建的关键不变量（已验证）：

- **Thread scope 是多人协作的关键。** `routingKey()` 在 `'thread'` 下返回 `${channelName}:${threadId || chatId}`（`SessionRouter.ts:53`）；`resolve()` 复用该 key（`:79-83`）。默认 scope 是 `'user'`（`:25`）；`qwen channel start` 在多 channel 路径中通过 `router.setChannelScope(name, config.sessionScope)`（`start.ts:361-362`）设置 per-channel scope，或在单 channel 路径中通过 `ChannelBase` 构造函数从 `config.sessionScope`（`ChannelBase.ts:62-64`）设置。**多人协作要求 operator 设置 `sessionScope: "thread"`。**
- **Prompt 序列化。** 在 `AcpBridge` 上，`newSession(cwd)` 仅接收 `cwd`（`AcpBridge.ts:131`），且 `AcpBridge.prompt()` 没有并发保护——序列化由 `ChannelBase` 的 `dispatchMode` 处理：`collect` 进行缓冲（`:361-370,445-463`），`steer` 取消正在进行的 prompt（`:371-379`），`followup` 链接到 `sessionQueues`（`:381-383,394-470`）。**运行时默认值是 `'steer'`**（`:354`）；`types.ts:42` 的 JSDoc 说是 `'collect'`——**已过时；v2 将其修复为 `'steer'` (OD-5)。** 在 daemon 路径上，`DaemonChannelBridge.prompt()` 在重叠时**抛出异常**（`:257-261`）；daemon FIFO `promptQueue`（`bridge.ts:2855,3082`）位于该抛出保护_之后_。结果（对 §6.2 至关重要）：所有 prompt——无论是人类的还是主动的——在到达 `bridge.prompt()` 之前，必须已经由 `ChannelBase.sessionQueues` 序列化。
- **`sendMessage` 是抽象的。** `ChannelBase.sendMessage()` 是 `abstract`（`:81`）；`DingtalkAdapter.sendMessage()`（`:134-170`）通过 per-`conversationId` 的 `sessionWebhook` 发送，该 webhook 仅在入站时缓存（`:516-517`）且会过期——冷群没有缓存的 webhook，调用会**静默返回**（`:137-141`）。
- **Daemon 不变量继承自 Phase 1+。** 一旦 channel 托管在 `qwen serve` 下（已承诺，§1），`MultiClientPermissionMediator`（`permissionMediator.ts:621-637`）、`eventBus` 重放 ring（`eventBus.ts:92`）、per-`SessionEntry` `promptQueue` FIFO（`bridge.ts:2855-3082`）将变得可用。

### 四个新层

```
            ┌───────────── governance (Layer 4) ─────────────┐
            │  per-channel turn/cost budget gate              │
            │  proactive allowlist, quiet hours, kill switch  │
            └───────────────────────┬─────────────────────────┘
                                     │ wraps all inbound + outbound
 inbound  ┌──────────────────────────▼─────────────────────────┐  outbound
 ───────▶ │  identity injection (Layer 1)                       │ ────────▶
          │  prefix promptText with speaker + channel context   │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  channel memory (Layer 3)                           │
          │  per-channel fragment, injected at session start;    │
          │  persisted via CLI-layer callback (core helper)      │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  proactive engine (Layer 2)                         │
          │  gateway scheduler → sessionQueues → bridge.prompt → │
          │  channel.pushProactive() w/ cold-group fallback      │
          └─────────────────────────────────────────────────────┘
```

**Layer 1 — 身份注入。** _拓扑：两者皆可；不需要 daemon。_ `handleInbound()` 从不将 `senderName` 放入 `promptText`（`ChannelBase.ts:246` 仅在 `SenderGate.check()` 中读取它；`Envelope.senderName` 存在于 `types.ts:69`）。设计：在 `handleInbound()` 中增加一个由配置控制的注入点，位于 `referencedText` 前缀之后（`:316-319`），由 `envelope.isGroup` 控制，并为 `collect` 重入增加一个新的 `Envelope.alreadyPrefixed` 标志。详见 §6.1。

**Layer 2 — 主动引擎。** _拓扑：gateway 拥有的调度器，迁移中立；在 Phase 1+ 的 daemon 下运行。_ 会话内 cron 在 `dispose()` 时终止（`Session.ts:790-803`）；没有 daemon 调度器端点。`DingtalkAdapter.sendMessage()` 无法触达冷群（`:137-141`）。设计：一个驻留在 gateway 的调度器，通过 `ChannelBase.sessionQueues`（绝不使用 `steer`）注入触发，并将完成路由到 `channel.pushProactive()`。详见 §6.2。

**Layer 3 — Channel memory。** _拓扑：通过 CLI 层回调的持久化路径；在 channel 侧注入。_ Memory 仅限 workspace 全局（`workspace-memory.ts:86-303`）。设计：在会话开始时注入 per-channel memory 片段（复用每会话一次的 `instructions` 门控），并在写入路径上增加一个新的 `channel` 作用域，通过注入的回调从 `channel-base` 访问（无 `channel-base → core` 依赖）。详见 §6.3。

**Layer 4 — 治理。** _拓扑：channel 侧的门控包装器；Phase 1+ 的 daemon 侧 rate-limiter。_ daemon 有一个全局 bearer token（`auth.ts:259-266`），per-`clientId`/IP 速率限制，且没有 per-channel 预算。设计：一个包装 `handleInbound()` 和调度器的 `ChannelGovernor`/`BudgetLedger`。详见 §6.4。
### 数据流 1 — 群聊会话中接收 @qwen

该流程在两种拓扑结构中的形态完全相同；唯一的区别在于序列化和权限控制的位置。在 `AcpBridge`（阶段 0）中，序列化由 `ChannelBase.sessionQueues` 处理，权限由子进程自动批准；在 daemon（阶段 1+）中，序列化**依然**是 `ChannelBase.sessionQueues`（daemon 的 throw-guard 永远不会触发，因为 channel 层已经完成了序列化），权限则通过 `MultiClientPermissionMediator` 流转。

1. **DingTalk → adapter。** 成员发送“@qwen 总结今天的故障”。stream client 传递带有 `conversationId`、`sessionWebhook`、sender、`isInAtList` 的 `DingTalkMessageData`。`DingtalkAdapter` 缓存 `webhooks.set(conversationId, sessionWebhook)` (`:516-517`)，并 emit 一个 `Envelope`，其中 `isGroup:true`，`isMentioned:true`，`chatId = conversationId`。
2. **Governor (L4)。** `ChannelGovernor`/`BudgetLedger.admit()` 检查 channel 的 turn/cost 预算（在实际使用数据可用前为建议性限制，§6.4）和 kill switch。硬性 kill / 带有实际数值的明确上限 → 拒绝并回复；仅为估算且超阈值 → 警告 (WARN)，绝不硬性拒绝 (Fix #6)。
3. **Gates。** `GroupGate.check()` 通过（mention 满足默认的 `requireMention:true`）；`SenderGate.check()` 通过 (`:246`)。
4. **Routing。** `router.resolve(...)` 在 `'thread'` scope 下计算 `dingtalk:<conversationId>`（**需要 `sessionScope:"thread"`**），返回共享的 group `sessionId`。`persist()` 记录该 ID。
5. **Memory (L3) + identity (L1)。** 在第一个 turn，每个 channel 的 memory 和 `config.instructions` 会被前置一次 (`instructedSessions`, `:344-347`)。Identity 注入会在每条消息前加上 `[Alice]`。
6. **Attribution capture。** 解析出的 `senderId`/`senderName` 会记录在**进入 `sessionQueues` 的 queue item 上** (Fix #7)，而不是稍后按时间戳拼接。
7. **Dispatch。** tag profile 设置 `followup`（绝不使用 `steer`）；Bob 的并发消息会链入 `sessionQueues` (`:394-470`)。
8. **Bridge。** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` 通过 stdio ACP (`AcpBridge.prompt`, `AcpBridge.ts:147`) 转发，或转发给 daemon session (`DaemonChannelBridge.prompt`) —— 仅在前一个 turn 已排空 `activePrompts` 时才会到达此处，因此 daemon 的 throw-guard (`:257-261`) 永远不会触发。
9. **Stream back。** `textChunk` → `onChunk` (`:416-422`)；`onResponseComplete → DingtalkAdapter.sendMessage()` 使用缓存的 `sessionWebhook`（热群聊）。

### 数据流 2 — 向冷群聊定时主动推送

1. **Schedule fires。** 驻留在 gateway 的 `ChannelCronScheduler` 在 09:00 唤醒，执行 `daily-standup → dingtalk:<convA>`。不是 in-session cron（tag session 已禁用，OD-8/§6.2；且一旦 session 被回收就会失效 —— `dispose()` 会清空 `cronQueue`，`Session.ts:790-803`）。
2. **Governor (L4)。** 检查主动推送白名单和免打扰时段（明确的时区来源）。窗口外 / 不在白名单 → 跳过并记录日志。调度器在尝试投递前会验证 `adapter.canColdSend`；如果为 false，则**大声失败** (fails loud)（记录日志并记录 `lastError`），绝不静默 no-op (Fix #4)。
3. **Synthetic envelope。** `senderId:'__cron__'`，`chatId: convA`，`isGroup:true`，`isMentioned:true`，无 `messageId`。合成 prompt 在 queue item 上携带自己的 attribution (`createdBy`)。
4. **Serialize, never preempt。** `dispatchProactive` 链入 `ChannelBase.sessionQueues` 并等待任何进行中的人类 turn (`activePrompts.get(sessionId)?.done`)。它**绝不**调用 `steer`/`cancelSession`，也**绝不**在持有 `activePrompts` 时调用 `bridge.prompt()` —— 因此 daemon 的 `Prompt already in flight` 异常 (`:257-261`) 无法触发 (§6.2, Fix #1)。
5. **Cold-group send。** `pushProactive(convA, text)` 发现 `webhooks.get(convA)` 为 undefined，回退到新的主动推送路径：持久化的 `openConversationId`、全新的 app-credentials token，POST `https://api.dingtalk.com/v1.0/robot/groupMessages/send`，参数为 `robotCode = config.clientId`，`msgKey:'sampleMarkdown'`，`msgParam`（一个 JSON _字符串_）。（在飞书场景下，步骤 5 是通过 `tenant_access_token` 调用现有的 `sendMessage()`；`canColdSend = true`。）
6. **Budget + audit。** 主动 turn 消耗 channel 的预算桶（在 daemon 托管的使用数据可用前为建议性扣减）；记录时以 `createdBy` 作为发起身份，并在传输层记录 `originatorClientId`（不捏造人类身份，`eventBus.ts:60`）。

### 为什么采用这种设计（复用优于重新发明）

每个新层都挂载在现有的接缝处：identity 挂载在 `promptText` 构建处，主动推送挂载在 `sessionQueues` + `pushProactive()`，memory 挂载在 `instructions`/`writeContextFile` 机制，governance 作为 gate 链的包装器。唯一的**结构前提** —— 第 2-4 层复用 daemon 机制 —— 已由承诺的 daemon 迁移 (§1) 满足：阶段 0 基于 `AcpBridge` 发布；阶段 1+ 在 `qwen serve` 下运行。

---

## 6. 详细设计

### 6.1 多人协作与 Identity (Build Area 1)

一个“qwen tag”存在于群聊中。每个成员都与_同一个_ agent 对话，该 agent 必须 (a) 为整个 channel 维护一个共享会话，(b) 知道每个 turn 是_谁_在说话，(c) 不让一个成员的消息破坏另一个成员正在运行的任务，以及 (d) 理想情况下，针对高风险的 tool calls 向_群组_请求批准。qwen-code 目前已有 (a)-(c) 的原语；(d) 是 daemon 托管的阶段 1+ 工作（已承诺迁移，§1）。

#### 群组共享 session：`sessionScope: 'thread'`

在 `'thread'` 模式下，`senderId` 会从 routing key 中移除，因此每个成员都会解析到同一个 `sessionId` (`SessionRouter.ts:53,72-92`) —— 这使得 agent 成为一个共享的、驻留在 channel 的实体，而不是 N 个私有 bot。

- **Per-channel scope，而非全局开关。** Router 默认值为 `'user'` (`:25`)，channel-config 默认值也是 `'user'` (`config-utils.ts:91-92`)。DM 和单用户 channel 保持 `'user'`。tag profile 在 `settings.json` 中设置 `sessionScope: 'thread'`，通过 `setChannelScope()`（多 channel，`start.ts:361-362`）或 `ChannelBase` 构造函数（单 channel，`ChannelBase.ts:62-64`）按 channel 应用。
- **DingTalk `threadId`/`chatId` 稳定性。** DingTalk adapter 从不设置 `Envelope.threadId` (`DingtalkAdapter.ts:541-551`)，因此 `routingKey()` 会采用 `threadId || chatId` 的回退逻辑到 `chatId`，将群聊折叠为每个 `chatId` 一个 session（符合预期）。**注意：** `chatId = conversationId || sessionWebhook` (`:534`)。对于真实的群消息，`conversationId` 存在且稳定；如果某条消息没有它，`chatId` 会回退到_会过期的_ `sessionWebhook` URL，导致 thread key 不稳定。profile 将缺失 `conversationId` 视为硬错误（丢弃消息），而不是静默使用 webhook 作为 key。

持久化涵盖崩溃恢复 (`SessionRouter.ts:168-244`)：daemon 重启会通过 `bridge.loadSession()` 将群聊重新附加到同一个共享 session。

#### 新风险：thread-scoped 的 `/clear` 和 `/status` 是 channel 全局的

共享的 `/clear` handler 调用 `router.removeSession(this.name, senderId, chatId)` (`ChannelBase.ts:147-152`)，`/status` 调用 `router.hasSession(...)` (`:203-208`)；两者都通过 `routingKey()` 路由，而 `routingKey()` **在 `'thread'` 模式下会忽略 `senderId`**。因此，任何单个成员的 `/clear` 都会清空整个 channel 的共享 session 并重置 `instructedSessions` —— 这是一个一键重置所有人的“坑”。

**已解决 (OD-4)：** 在**共享（thread）群组**中，`/clear`（及其别名）需要显式的 `confirm` token，并且在设置了 `config.allowedUsers` 时限制为该列表中的用户；否则直接清空（DM 和 per-user 群组只影响调用者自己的 session，因此不需要 gate）。该命令保留 `/clear` 名称，因为 slash parser 只接受 `[a-zA-Z0-9_]`（带连字符的 `/clear-channel` 会被解析为 `clear` + 参数 `-channel`）；显式的 `confirm` 是破坏性操作的提示。真正的 per-member owner-gate（独立于 chat 白名单区分 admin 和 member）需等待 identity 模型（OD-3/OD-11）。**`/status` 在共享 session 上保持只读**。

#### sender-attribution 缺失及修复

`handleInbound()` 从 `envelope.text`、`referencedText` 引用前缀、附件路径以及每 session 一次的 `config.instructions` 构建 `promptText` (`ChannelBase.ts:315-347`)；`envelope.senderName` 仅用于 `SenderGate.check()` (`:246`)。在 `'thread'` 群组中，agent 看到的是一个无差别的流。

**修复 (OD-6) —— 在 prompt 构建顶部为群聊 turn 添加 `[senderName]` 前缀 (`:315-316`)，每个 turn 都执行：**

```ts
let promptText = envelope.text;

// 多人协作 attribution：在 thread 共享 session 中，为每个 turn 标记
// 发言人。跳过 1:1 会话（sender 是不变的）。必须每个 turn 都触发 ——
// 不受 instructedSessions 限制（发言人每条消息都会变）。
// alreadyPrefixed 标志让 collect 模式的合成重入跳过此步骤。
if (envelope.isGroup && !envelope.alreadyPrefixed) {
  const who = envelope.senderName || envelope.senderId || 'unknown';
  promptText = `[${who}] ${promptText}`;
}

if (envelope.referencedText) {
  promptText = `[Replying to: "${envelope.referencedText}"]\n\n${promptText}`;
}
```

- **基于 `envelope.isGroup` 进行 Gate 判断** (`types.ts:75`)，而非 scope。
- **在 `referencedText` 之前添加前缀**，使顺序读起来为 `[Alice] [Replying to: "..."] <text>`。
- **使用 `senderName`，而非 `senderId`。** 在 DingTalk 中，`senderName = data.senderNick || 'Unknown'` (`DingtalkAdapter.ts:544`)，永不为空；`senderId → 'unknown'` 的链路是防御性的。
- **`collect` 模式的双重前缀风险，通过新增一个字段解决。** 合并重入会构建一个 `syntheticEnvelope`，其 `text` 是已添加前缀的合并字符串，并重新进入 `handleInbound()` (`:449-462`)，这会导致**再次**添加前缀。**v2 新增了一个可选的 `Envelope` 字段 `alreadyPrefixed?: boolean` (`types.ts`)**；`collect` 合成 envelope 将其设置为 `true`，上述前缀步骤在设置时会跳过。（这纠正了 v1 中“仅格式更改，无新 envelope 字段”的说法 —— Fix #2。这是本 RFC 引入的唯一新 envelope 字段；bridge/ACP 协议未更改。）

#### 群组默认 dispatchMode：`steer` → `followup`

`steer`（运行时默认值，`:354`）通过 `bridge.cancelSession()` (`:371-379`) 取消进行中的 prompt。在共享群组中，如果 Bob 在 agent 处理 Alice 的请求时发送任何消息，`steer` 会_取消 Alice 的任务_ —— 意外的拒绝服务。**tag profile 设置 `dispatchMode: 'followup'`**，使 Bob 的消息排在 Alice 的任务之后（`sessionQueues` FIFO，`:381-383,394-470`）。在群组 profile 上设置（`groups["*"].dispatchMode = "followup"`），而不是翻转全局默认值 —— DM 保留 `steer` 的自我中断 UX。除了文档化的 profile 默认值外，**无需更改代码**；v2 **修复了过时的 `types.ts:42` JSDoc 为 `'steer'`**，使代码和注释一致 (OD-5)。`collect` 适用于流量极高的群组（限制队列深度），但代价是 attribution 模糊。

由于 tag profile 在群组中**始终是 `followup`（绝不使用 `steer`）**，主动推送引擎继承了一个干净的不变量：不存在 steer 与主动推送的竞争，因为 tag 群组中没有任何路径会取消进行中的 prompt。该不变量在 §6.2 中重申并强制执行。

#### Handoff —— “接续上一个人的工作”

借助 `'thread'` + `[senderName]` 前缀 + `followup`，handoff _就是_ 默认行为：session 保存了完整的多发言人历史。两个人体工学附加组件：一个只读的 **`/who`** 命令（通过 `protected registerCommand(name, handler)`，`:141-143` —— 而非私有的 `commands` map）报告活跃的 `sessionId`/`cwd`/任务摘要；以及重启时的幂等重新附加（已由 `restoreSessions()` 涵盖）。

#### 多成员审批 —— 阶段规划 (OD-3, 已决定)

意图是正确的：高风险 tool calls 应该可以由群组批准，且 qwen-code 提供了带有四种策略的 `MultiClientPermissionMediator` (`permissionMediator.ts:348,621-637`)。**但在阶段 0 的 `AcpBridge` 路径中，从 channel 无法访问这些功能：**

1. **`qwen channel start` 连接 `AcpBridge`，其 `requestPermission` 自动批准**每个请求 (`AcpBridge.ts:108-118`)。完全没有审批提示。
2. mediator 位于 daemon 的 HTTP serve 层。唯一具备权限能力的 channel bridge 是 `DaemonChannelBridge` (`respondToPermission`, `:346-374`) —— 在阶段 1 将 channel 托管迁移到 daemon 后才会到达（已承诺，§1）。
3. `config.approvalMode` 是一个**死字段** —— 被解析 (`config-utils.ts:94`) 和类型化 (`types.ts:36`)，但没有 adapter 或 bridge 读取它。

**已决定的阶段规划：**

- **阶段 0：** 无群组审批。通过 sender 白名单 + `requireMention` + 保守的 agent toolset 来控制风险。不要声称 `approvalMode` 有任何作用。
- **阶段 1：** channel 运行在 daemon-bridge 路径上（已承诺迁移）；将 `permission_request` 呈现为 DingTalk 卡片；发布**带有单个 channel 级 `clientId` 的 `first-responder`**（任何允许的成员的点击即可解决；attribution 在 channel 粒度）。不需要 `senderId → clientId` 映射。**在主动 turn 上自动拒绝高风险工具**（源自 `__cron__` 的 turn 无法回答权限提示）。
- **阶段 2：** 一旦存在 `senderId → clientId` 映射和 `clientId` 生命周期（回收、refcount 边界），添加 per-member 的 `consensus`/`designated`。注意：每个 `senderId` 一个合成 `clientId` 会无限增长 `clientIds` refcount map，必须进行回收。

#### 具体更改总结 (Build Area 1)

| 更改                                                                  | 位置                                                    | 类型          |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| 群组 profile 设置 `sessionScope: 'thread'`                             | `settings.json` + `setChannelScope` (`start.ts:359-363`) | Config        |
| 将缺失的 DingTalk `conversationId` 视为错误                        | `DingtalkAdapter.ts` ~`:534`                             | Code (S)      |
| 为群聊 turn 添加 `[senderName]` 前缀                                   | `ChannelBase.handleInbound` ~`:316`                      | Code (S)      |
| 新增可选的 `Envelope.alreadyPrefixed` 字段                           | `types.ts` (Envelope)                                    | Code (S)      |
| 在 `collect` 合成重入时设置 `alreadyPrefixed`                   | `ChannelBase.ts:449-462`                                 | Code (S)      |
| 共享群组中的 `/clear confirm` + 白名单 gate；`/status` 只读 | 共享 commands (`:147-217`)                             | Code (S)      |
| 群组 profile 设置 `dispatchMode: 'followup'`                           | `settings.json` 中的 `groups["*"]`                         | Config        |
| 修复过时的 `dispatchMode` JSDoc 为 `'steer'`                              | `types.ts:42`                                            | Comment fix   |
| `/who` handoff 命令                                                  | `registerCommand` (`:141`)                               | Code (S)      |
| Daemon-bridge 迁移替换 `AcpBridge` 自动批准               | `DaemonChannelBridge` 托管（已承诺）                | Phase 1 (L)   |
| Per-member 审批投票 + DingTalk 卡片                              | 新 bridge 管道 + `respondToPermission`              | Phase 1/2 (L) |

### 6.2 主动推送引擎：调度器 + 出站推送（核心）

#### 决策：gateway 拥有的调度器，迁移中立

**采用驻留在 `qwen channel start` gateway 进程中的调度器。** Gateway 拥有 `SessionRouter`（带有 `restoreSessions()` 恢复机制 —— `start.ts:275,444`），持有每个 adapter 实例及其 bridge，并且是唯一可以调用 `ChannelBase.pushProactive()`（以及底层的抽象 `sendMessage()`，`:81`）的地方。Agent（无论是阶段 0 中生成的 `--acp` 子进程，还是阶段 1+ 中的 daemon session）保持为纯粹的 prompt 执行器：调度器通过入队到 `ChannelBase.sessionQueues` 触发，仅在前一个 turn 排空后才调用 `bridge.prompt()` —— **无新 bridge 方法，无反向 channel，无 daemon 推送路由。**

> **拓扑说明（已承诺的架构）。** 调度器**在结构上是迁移中立的**：无论底层是哪个 bridge，它都通过 `ChannelBase.sessionQueues` 进行序列化。在阶段 0，它通过 stdio 驱动 `AcpBridge.prompt()`；在阶段 1+，它驱动 `DaemonChannelBridge.prompt()`（daemon 托管）。由于 daemon 的 `eventBus` 审计和 FIFO `promptQueue` 是阶段 1+ 治理所需的，channel 从阶段 1 开始在 `qwen serve` 下运行 —— 但调度器自身的逻辑在迁移边界处不会改变。

为什么不采用其他方案：

- **In-`Session` cron：** 拒绝 —— `cronQueue`/`cronProcessing` 位于进程内的 `Session` 中 (`Session.ts:667-668`)，仅在 session 打开时触发，并在 30 分钟空闲回收时的 `dispose()` 中失效 (`:790-812`)。这正是 gateway 调度器要避免的故障。**并且 gateway 调度器是唯一的 cron 所有者 (OD-8)：tag session 永远不会启动其 in-session cron**（门控机制如下）。
- **独立进程：** 拒绝 —— 第二个长生命周期进程会重复 DingTalk 凭证，且无法复用进程内的 `SessionRouter` 和已附加的 bridge。

#### 组件与部署位置

| 组件                          | 文件                                                                        | 职责                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChannelCronStore`                 | `packages/channels/base/src/ChannelCronStore.ts` (new)                      | 持久化 job 表，与 `sessions.json` 同级的 JSON。`atomicWriteJSON` (`atomicFileWrite.ts:385`) + 每文件 `async-mutex` `Mutex`。                                                       |
| `ChannelCronScheduler`             | `packages/channels/base/src/ChannelCronScheduler.ts` (new)                  | 单个重新武装的 `setTimeout`（单元素时间轮）；通过 `nextFireTime` 触发下一次；重启追赶；60s 协调器 tick。每个 gateway 一个；唯一的 cron 所有者。                                |
| Cron primitives                    | `packages/core/src/utils/cronParser.ts` (reuse)                             | `parseCron`/`matches`/`nextFireTime` (`:104,141,168`)。不要重新实现。                                                                                                               |
| `dispatchProactive`                | `ChannelBase.ts` (extend)                                                   | 通过 `sessionQueues` 注入触发；等待任何进行中人类 turn 的 `activePrompts.get(sessionId)?.done`；绝不 `steer`；在持有 `activePrompts` 时绝不调用 `bridge.prompt()`。 |
| `pushProactive`                    | `ChannelBase.ts` (extend; base default = `sendMessage`) + DingTalk override | 出站投递；DingTalk 针对冷群聊进行重写。受 `canColdSend` 能力门控。                                                                                                |
| `canColdSend`                      | `ChannelBase` property (default `false`)                                    | 调度器在冷发送前检查的能力标志；一旦主动推送 API 路径发布，DingTalk 将其翻转为 `true`；飞书为 `true`。                                                      |
| DingTalk proactive send            | `packages/channels/dingtalk/src/proactive.ts` (new) + `DingtalkAdapter.ts`  | 通过 `robotCode` + 存储的 `openConversationId` 进行主动消息群发（契约在下方验证）。                                                                                                   |
| Wiring                             | `start.ts` (extend `startSingle`/`startAll`)                                | 在 `router.restoreSessions()` (`:275,444`) 之后构造并启动调度器；将 `isTagSession` 标志传入 session 构造 (OD-8)。                                              |
| `/schedule` + `schedule_task` tool | `ChannelBase.handleInbound()` (extend, after gates `:240-252`)              | 优先确定性命令；其次是模型 tool。                                                                                                                                          |
#### `canColdSend` capability flag (Fix #4)

跨平台 MVP 标准（“同一个任务在钉钉和飞书上都能投递”）需要一个能力标志（capability flag），以便调度器能够推断可达性，而不是通过静默失败来发现它。

- **声明为 `ChannelBase` 上的属性：** `protected readonly canColdSend: boolean = false;`。（放在基类上，而不是单独的 `ChannelPlugin` 注册表中，因为调度器已经持有 adapter 实例，且 `pushProactive`/`sendMessage` 是实例方法——将标志与其保护的方法放在一起可以将它们保留在一个类型中。）
- **钉钉：** 在主动发送路径（`proactive.ts`）上线并持久化可用的 `openConversationId` 之前，`canColdSend = false`；一旦实现 `pushProactive`，则翻转为 `true`。当为 `false` 时，钉钉仍然可以响应热（webhook）轮次——`canColdSend` 仅控制_冷群_投递。
- **飞书：** `canColdSend = true`（通过 `tenant_access_token` 进行原生主动发送，`FeishuAdapter.ts:622-676`）。
- **调度器大声失败（fails loud）：** 在投递触发（fire）之前，调度器会检查 `adapter.canColdSend`。如果为 `false`，它**不会**尝试 `pushProactive`；而是记录一个对运维人员可见的错误，设置 `job.lastStatus='error'` + `lastError='adapter cannot cold-send'`，在 `/schedule list` 中展示它，并（根据策略）增加 `consecutiveFailures`。它永远不会静默地执行 no-op。

#### Disjoint cron stores + the OD-8 gate (Fix #5)

有两条 cron 持久化路径，并且**它们位于不相交的文件系统路径上**，因此它们永远不会读写相同的任务：

- **Gateway store（新）：** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` —— channel 全局，与 `sessionsPath()` 同级（`start.ts:56-58`），用户所有，位于工作树之外。
- **Session store（现有）：** 每个 session 的 `Session` cron 使用**按项目哈希**的目录 `~/.qwen/tmp/<hash>/scheduled_tasks.json`（`cronTasksFile.ts:1-9`）。

由于路径不相交，持久化任务重复触发的唯一方式是：**tag session 除了 gateway 调度器之外，还运行其 session 内的 `Session` cron**。**OD-8 解决了这个问题：** gateway 调度器是唯一的 cron 所有者；channel 托管的（“tag”）session **不会**启动其 session 内的 cron。

**门控机制 —— session 如何得知自己是 tag session。** tag session 在构建时会携带一个从 channel host 传递过来的显式标志：

- 在 Phase-1+ daemon 路径上，`DaemonChannelSessionFactory` 已经接收一个结构化的 options bag（`{ workspaceCwd, modelServiceId, sessionScope }`，`DaemonChannelBridge.ts:226-241`）。向该 bag 中添加 `isTagSession: true`；daemon `Session` 在构造时读取它并**跳过 `startCronScheduler()`**（否则该调用点会武装 `cronQueue`，`Session.ts:667-668`）。Disposal 已经在回收时清理 cron（`:790-803`），因此 tag session 根本不会武装它。
- 在 Phase-0 `AcpBridge` 路径上，子 agent 同样不能为 tag workspace 武装 session 内的 cron；通过 `--acp` spawn 选项传递相同的标志（一个新的 `AcpBridgeOptions` 字段，作为标志转发到 `Config` 中）。在该标志管道落地之前，Phase 0 根本不会注册任何 session 内的 cron 任务（`/schedule` 命令针对 gateway store），因此没有东西可以重复触发。

这使得剩余的风险纯粹是运维层面的：“不要为相同的任务运行两个调度器”——而门控机制保证了 tag session 永远不会启动第二个。

#### Durable store schema and restart recovery

该 schema 与 `DurableCronTask` 平行（`cronTasksFile.ts:19-26`：`id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` —— 字段是 `cron`，**不是** `cronExpr`）：

```ts
interface ChannelCronJob {
  id: string; // randomUUID()
  channelName: string;
  target: {
    // mirrors SessionRouter PersistedEntry (SessionRouter.ts:5-9)
    channelName: string;
    senderId: string; // "__cron__" for system jobs
    chatId: string; // DingTalk openConversationId — the DURABLE cold-group id
    threadId?: string;
  };
  cwd: string; // validated == bound workspace on load
  cron: string; // 5-field (parseCron) OR "@once:<epochMs>"
  prompt: string;
  label?: string;
  recurring: boolean;
  enabled: boolean;
  createdBy: string; // senderId; advisory under single-token model; carried into the fire's attribution
  createdAt: number;
  lastFiredAt: number | null;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  consecutiveFailures: number; // auto-disable after N (e.g. 5)
}
```

通过 per-file `async-mutex` `Mutex` 下的 `atomicWriteJSON` 进行写入。在 `start.ts` 中，`router.restoreSessions()`（`:275`/`:444`）**之后**进行**重启恢复**：

1. `bridge.start()` → `restoreSessions()` 重新加载 `sessions.json` 并为每个条目调用 `bridge.loadSession()`。
2. `store.load()`；丢弃 `cwd !== boundWorkspace` 的条目。
3. `scheduler.start()`：为每个启用的任务计算 `nextFireTime(job.cron, new Date())`。**漏触发策略（RFC 决定）：** 在停机期间逾期的周期性任务会立即触发一次然后恢复——**永远不会重放积压**（积压涌入活跃群聊会导致垃圾消息事件）。过去的一次性任务触发一次后删除。`cronScheduler.ts` 在 `:81-89,608-707` 处区分 `{ kind: 'catch-up'; ids }`（周期性）和 `{ kind: 'missed'; tasks }`（一次性，需先确认）；我们对周期性任务采用合并为一次（coalesce-to-one）的策略。
4. 为最近的任务武装（arm）一个单一的 `setTimeout`；每次触发后重新武装。添加一个 60 秒的 reconciler tick（先例：`lockProbeTimer`，`cronScheduler.ts:229,507-538`），从 `Date.now()` 重新计算以吸收挂起/恢复时的时钟偏差——永远不要累积间隔。

#### Fire path: injecting into the SHARED group session (Fix #1 — the big one)

每个 session 一个活跃 prompt 的不变量因拓扑结构而异，且 v1 的 `dispatchProactive` 在 daemon 路径上处理错了：

- **Phase 0 (`AcpBridge`)：** `AcpBridge.prompt()`（`:147-180`）**没有自己的并发守卫**；唯一的序列化是 `ChannelBase.sessionQueues`/`activePrompts`（`:29-35,394,466`）以及 `--acp` 子进程自己的 ACP session。
- **Phase 1+ (`DaemonChannelBridge`)：** 当 `activePrompts.has(sessionId)` 时，`DaemonChannelBridge.prompt()` **抛出 `Prompt already in flight`**（`:257-261`）——它**不会**排队。FIFO `promptQueue`（`bridge.ts:2855,3082`）位于 daemon/acp-bridge 侧，_在_ 该进程内抛出守卫_之后_。因此，在人类轮次活跃时调用 `DaemonChannelBridge.prompt()` 会**抛出异常**而不是等待。

**重新设计（在两种拓扑下均正确）：** 在轮次执行期间永远不要调用 `bridge.prompt()`；在 channel 层通过 `sessionQueues` 进行序列化，首先等待 `activePrompts`。因为 `sessionQueues` 将主动运行链接_在_ 先前运行解析_之后_，所以在调用 `bridge.prompt()` 时 `activePrompts.get(sessionId)` 已经清空——因此在 daemon 路径上永远不会触发抛出守卫，在 `AcpBridge` 路径上无守卫的 `prompt()` 也永远不会重叠。

```ts
// ChannelBase.ts — reuses private sessionQueues/activePrompts (:29-35).
// Works identically for AcpBridge (Phase 0) and DaemonChannelBridge (Phase 1+):
// the chain guarantees bridge.prompt() runs only after the prior turn drains,
// so DaemonChannelBridge's `Prompt already in flight` throw (:257-261) cannot fire.
async dispatchProactive(sessionId: string, promptText: string): Promise<string> {
  const prev = this.sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const active = this.activePrompts.get(sessionId);
    if (active) await active.done;            // wait out a human turn — never steer-cancel (:371-379)
    return this.bridge.prompt(sessionId, promptText);   // only now is activePrompts clear
  });
  this.sessionQueues.set(sessionId, run.then(() => {}, () => {}));
  return run;
}
```

**不变量：主动轮次永远不会被后续的人类轮次取消，也永远不会取消人类轮次。** 针对两种变体的强制执行说明：

- **无主动→人类取消：** `dispatchProactive` 永远不会调用 `steer`/`cancelSession`。它只会 `await` `activePrompts.get(sessionId)?.done`，然后在其后排队。
- **无人类→主动取消：** tag 群配置为 **`followup`（永远不是 `steer`）**（§6.1）。由于 `steer` 是唯一调用 `bridge.cancelSession()` 的 `dispatchMode`（`:371-379`），且 tag 群永远不会选择它，因此传入的人类轮次只能通过 `sessionQueues` 链接_在_ 执行中的主动轮次_之后_——它不能取消它。（在 daemon 路径上，`DaemonChannelBridge.cancelSession`（`:332`）只能从 `steer` 分支到达，而 tag 群排除了该分支。）
- **永远不会触发抛出守卫：** 在两条路径上，`bridge.prompt()` 仅在 `sessionQueues` 链的尾部调用，即在先前运行解析且（对于人类轮次）`activePrompts` 耗尽之后——因此对于 tag 流量，`DaemonChannelBridge` 的重叠抛出（`:257-261`）在结构上是不可达的。

触发时：

1. **解析共享 session**，通过 `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)`（`SessionRouter.ts:72`）。`'thread'` → 整个群一个 `sessionId`，因此触发会落在人类看到的上下文中。如果恢复的 session 丢失，`resolve()` 会创建并持久化新的。
2. **排队，永不抢占**（通过 `sessionQueues` 进行 followup）。故意不使用 `steer`。
3. **标记 + 归因（Fix #7）。** 前缀 `[Scheduled task "<label>" set by <createdBy>]\n`。`createdBy` 身份**随排队的运行携带**，而不是稍后通过时间戳拼接，因此在此触发期间引发的任何 tool-call/permission 都归因于_这个_主动轮次（§6.4）。
4. **捕获 + 推送。** `dispatchProactive` 返回完成文本；调度器检查 `adapter.canColdSend`，然后调用 `channel.pushProactive(target.chatId, text)`（如果为 `false` 则大声失败）。

#### Cold-group push on DingTalk

**已验证的限制：** `DingtalkAdapter.sendMessage()` 仅通过按 `conversationId` 缓存的 `sessionWebhook` 发送（`:84,134-142`），且仅在入站时填充（`:505-517`）。冷群 → 静默返回（`:137-141`）。

**修复 —— 通过钉钉主动消息群发 API 实现 `pushProactive`（契约现已验证，OD-7 已解决）。** 调用形式在仓库中也有先例（`emotionApi` POST 到 `api.dingtalk.com/v1.0/robot/...`，带有 header `x-acs-dingtalk-access-token` 和 body `{ robotCode, openConversationId, ... }`，`:188-197`）。

**已验证的端点和参数**（完整来源说明见 §6.5；每项均注明置信度）：

- **端点：** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _（高置信度验证；官方发送文档 + 阿里云 ask/559227）_。
- **`robotCode`**（必填，string）：将机器人安装到群时获得的机器人标识符；与企业内部机器人的 `appKey` 值空间相同 → 使用 `config.clientId`（`:184,435`）。无需新凭证。_（高置信度验证）_
- **`openConversationId`**（必填，string）：目标群的 `cid` 前缀的开放会话 ID；错误代码 `miss.openConversationId`/`invalid.openConversationId` 确认它是必填且经过验证的。持久化在 `ChannelCronJob.target.chatId` 中——跨重启稳定，不像 `sessionWebhook`。_（高置信度验证）_
- **`msgKey`**（必填，string）：消息模板 key；markdown 使用 **`'sampleMarkdown'`**（纯文本使用 `'sampleText'`）。_（高置信度验证；消息类型文档 + 阿里云 ask/585232）_
- **`msgParam`**（必填，**JSON 编码的 _string_**，不是嵌套对象）：对于 `sampleMarkdown`，该字符串为 `"{\"title\":\"<预览标题>\",\"text\":\"<markdown 正文，最大约 5000 字符>\"}"`。_（高置信度验证；markdown 标题/正文字段来自消息类型文档，文本示例逐字来自阿里云 ask/585232）_
- **`coolAppCode`**（可选）：仅当机器人作为群酷应用（群聊酷应用）安装时；对于普通的企业内部应用机器人不需要。_（中置信度验证）_
- **`conversationId` == `openConversationId`？** 对于标准群 @-callback，**将 callback `conversationId`（cid 前缀）视为可直接用作 `openConversationId`**——社区来源证实 + 匹配的 `cid` 格式。**标记（中置信度）：** 官方文档中没有逐字说明对于标准（非酷应用）机器人两者相等的句子。文档保证的路径是 `chatId → openConversationId` 转换 API（或从群创建 API / `chooseChat` JSAPI / 直接传递 `openConversationId`+`coolAppCode` 的酷应用 callback 中捕获）。**回退规则：** 如果发送返回 `invalid.openConversationId`，则回退到 `chatId → openConversationId` 转换 API。

```ts
const GROUP_SEND = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'; // verified high

async pushProactive(chatId: string, text: string): Promise<void> {        // DingtalkAdapter override
  const token = await this.tokenManager.get();        // refreshed independently of SDK connect lifecycle
  const robotCode = this.config.clientId;
  if (!token || !robotCode) { /* refresh once; else set lastError + return */ return; }
  for (const chunk of normalizeDingTalkMarkdown(text)) {  // reuse chunker IF the template length budget matches
    const msgParam = JSON.stringify({ title: extractTitle(text), text: chunk });  // msgParam is a STRING
    await sendGroupMessage({ token, robotCode, openConversationId: chatId,
      msgKey: 'sampleMarkdown', msgParam });            // on invalid.openConversationId → convert via chatId API, retry
  }
}
```

`sendMessage()` 变为：首先尝试缓存的 `sessionWebhook`（成本低，不消耗 token）；否则回退到 `pushProactive()`。**基础默认** `pushProactive = (chatId, text) => this.sendMessage(chatId, text)`，因此**飞书无需重写**（`FeishuAdapter.sendMessage()` 已经使用稳定的 `tenant_access_token` 向任何 `chatId` 进行主动发送，`:622-676`；`canColdSend = true`）。钉钉是唯一存在分歧的 adapter——钉钉优先的不对称性。`canColdSend` 标志（如上）让引擎在仅响应式 adapter 上**大声失败**，而不是静默丢弃。

**硬性部署约束（非代码）：** 企业机器人必须是 (a) 已发布的企业内部机器人，(b) 被授予主动群消息权限，(c) 目标群的成员（通过群酷应用/企业内部应用/第三方应用安装，持有其 `robotCode`）_（高置信度验证必须启用权限；高置信度验证机器人已安装 + robotCode 是先决条件）_，(d) 已记录其 `openConversationId`。我们在机器人第一次看到群中的_任何_入站消息时持久化 `conversationId`，因此“冷”= _空闲_，而不是_从未见过_；真正从未见过的群在通过转换 API 获取其 `openConversationId` 之前无法推送（硬限制）。**必需的 adapter 更改：** 目前仅缓存 `sessionWebhook`（`:516-517`）；我们还必须持久化 `conversationId`（推荐存储：单独的 `~/.qwen/channels/dingtalk-groups.json`，与 session 生命周期解耦，以便可以表示冷群和无活跃 session 的 cron）。

> **仍然标记（低置信度）—— 根据 OD-7 保持可见：** (1) 钉钉应用权限管理控制台中“主动发送群消息”的**确切权限点代码/显示名称**在文档中未确定——钉钉在应用的权限管理中将其显示为机器人/消息发送权限（通常是机器人消息系列，例如 `qyapi_robot_sendmsg` / 企业机器人发送消息权限）；在控制台中确认，不要硬编码断言代码。(2) 本次会话中未找到逐字说明标准（非酷应用）机器人的 callback `conversationId` 与 `openConversationId` 相等的权威官方单句——高概率的捷径，但文档保证的获取路径是 `chatId → openConversationId` 转换 API。钉钉开放平台页面是 JS 渲染的，本次会话无法完全抓取；端点/参数/token 事实通过 apifox 文档镜像和引用官方请求示例的阿里云开发者问答进行了交叉确认。

#### Auth & token lifecycle (verified; the load-bearing feasibility risk)

**Auth header（高置信度验证）。** 所有 v1.0 调用（包括 `groupMessages/send`）在请求 header 中传递 token `x-acs-dingtalk-access-token: <accessToken>` 加上 `Content-Type: application/json` —— 这正是 `emotionApi()`（`:188-207`）和 `downloadMedia()`（`media.ts:36-43`）已经使用的 header。

**Token 获取（高置信度验证）。** 企业内部应用，v1.0 风格：`POST https://api.dingtalk.com/v1.0/oauth2/accessToken`，JSON body 为 `{"appKey":"<appKey>","appSecret":"<appSecret>"}` → `{ "accessToken": "...", "expireIn": 7200 }`。（旧版等效 `GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..` 返回 `{access_token, expires_in:7200}`，但该旧版 token 用于旧的 `oapi` 端点；对于 `api.dingtalk.com` v1.0 API，在 `x-acs-dingtalk-access-token` header 中使用 v1.0 `accessToken`。）

**过期与缓存（高置信度验证）。** Token 在 **7200 秒（约 2 小时）** 后过期，过期后**必须**重新获取；在有效期窗口内，重复获取会返回相同的 token 并续期。**按应用缓存；不要在每次请求时都调用 token 端点**（频繁调用会被限流）。

**为什么这是承重风险。** Stream SDK 在连接时通过 `getEndpoint()` 内的 `GET .../gettoken` **获取一次 `access_token`**（`client.mjs:85-87`）并且**永远不会刷新它**；`getAccessToken()` 返回缓存的值（`DingtalkAdapter.ts:172-174`）。`autoReconnect` 仅在 socket _关闭_ 时重新获取（`client.mjs:157-163`）—— 一个稳定的长连接 socket 会在约 2 小时 TTL 之后持有过期的 token，并且任何主动发送（以及现有的 emotion/media 路径）一旦过期就会静默失败。**主动功能必须自己负责 token 刷新：** 一个 `tokenManager`，通过定时器（在约 2 小时过期前）和/或 401 响应通过 v1.0 `oauth2/accessToken` 端点获取，按应用缓存，独立于 SDK 连接生命周期（OD-7）。这是最可能的“演示中有效，2 小时后失效”的故障。

**速率限制（已验证，混合置信度 —— 保持标记）：** (1) 钉钉标准版每应用服务端 API 并发约 20 QPS，每月 Open API 配额约 10,000 次/月（专业版约 50 万，专属版约 500 万）_（中高置信度）_。(2) 经常被引用的每机器人 **20 条消息/分钟 → 约 10 分钟限流** 限制是针对**自定义群 webhook 机器人**记录的；它通常作为企业应用机器人发送路径的实用指南，但在本次会话的 `groupMessages/send` 页面上**未**得到明确确认 —— **将 `groupMessages/send` 的确切 20 次/分钟数字视为低/中置信度。** 另外：不要过度调用 token 端点（单独的限流）。调度器必须保守地限制自己的发送速率，并在收到限流响应时退避。

#### Standing instructions (NL recurring asks → store → consume)

在 `handleInbound()` 中通过门控后进行两层捕获（`:240-252`）：显式的 **`/schedule "0 9 * * 1-5" post the open PR list`** 命令（使用 `parseCron` 解析，无模型往返），以及 Phase-2 模型工具 `schedule_task(cron, prompt, recurring, label)`。两者都调用 `store.add({...})` → 持久化 → `scheduler.reschedule(job)`，然后在 channel 中回复。`/schedule list|cancel <id>|disable <id>` 读写 store。**持久化 fail-closed：** 如果写入抛出异常，则拒绝 ack `/schedule`。

#### Failure modes

- **触发时 Gateway 宕机：** 恢复将逾期的周期性触发合并为一次追赶；过去的一次性触发触发一次后删除。
- **触发中途 Agent 崩溃：** `bridge.prompt()` reject；`attachDisconnectHandler`（`start.ts:241,403`）重新生成（Phase 0）/ daemon 重新附加（Phase 1+）。调度器设置 `lastError`，不为周期性任务打上 `lastFiredAt` 时间戳 → 重试。至少一次；按分钟舍入的触发 key + `lastFiredAt` 去重。
- **Session 被回收 / `loadSession` 失败：** `resolve()` 创建新的（群记录丢失；常驻指令必须是自包含的）。Channel 内存（§6.3）是恢复底线。
- **Adapter 无法冷发送（`canColdSend=false`）：** 调度器记录 + 记录 `lastError`，在 `/schedule list` 中展示；永不静默。
- **向已移除/权限被撤销的群进行冷群推送：** 非 2xx → `lastError`；`invalid.openConversationId` → 尝试 `chatId → openConversationId` 转换 + 重试一次。
- **Token 过期：** `tokenManager` 刷新一次 + 退避；`consecutiveFailures` ≥ N → 自动禁用并留下对运维人员可见的记录。
- **一个 workspace 上有两个 gateway：** `checkDuplicateInstance()`（`start.ts:170-179`）守卫单实例；另外在 `cron.json` 中记录一个 lock token。
### 6.3 频道作用域的记忆与学习（构建区域 3）

一个 tag 必须能够_随时间记住该群组_，且不能泄露到同级群组中。目前 qwen-code 的 memory 是**全局 workspace 级别**的：没有 chat/channel/group/session 维度。

> **拓扑/依赖事实（Fix #3）。** 两个硬性约束决定了连接方式：(1) 在默认的 `AcpBridge` 拓扑中，**没有 `qwen serve` 守护进程，也没有 `POST /workspace/memory` 路由** —— `--acp` 子进程没有 HTTP 客户端；即使在 Phase-1+ 守护进程迁移之后，memory 路由也**仅限守护进程且需要严格认证**（`deps.mutate({ strict: true })`，`workspace-memory.ts:114`）。(2) `@qwen-code/channel-base` 仅依赖于 `@agentclientprotocol/sdk`（`packages/channels/base/package.json`），**不**依赖于 `@qwen-code/qwen-code-core`，因此 `ChannelBase` **不能** `import { writeWorkspaceContextFile }`。因此，修正后的设计通过 core helper **在进程内**写入/读取 channel memory，**由 CLI 层（`packages/cli`，它_可以_依赖 core）通过注入的回调从 `channel-base` 访问** —— 而不是通过 HTTP，也不是向 `channel-base` 添加 core 依赖。

#### 当前状态：两种作用域，均非按对话划分

`POST /workspace/memory` 仅接受 `scope: 'workspace' | 'global'`（`workspace-memory.ts:118-125`），通过 `resolveContextFilePath()` 解析（`writeContextFile.ts:223-240`）：`workspace → <root>/QWEN.md`，`global → ~/.qwen/QWEN.md`。追加模式会折叠到 `## Qwen Added Memories` 下（`MEMORY_SECTION_HEADER`，`const.ts:29`）；带有 30 秒超时的每文件互斥锁用于序列化写入（`writeContextFile.ts:48-57,159-162`）；写入器在追加时拒绝大于 16 MB 的现有文件（`MAX_EXISTING_FILE_BYTES`，`:255`）。该路由是**严格认证**的（`deps.mutate({ strict: true })`，`:114`）—— 即使在无 token 的 loopback 上也会拒绝。结果：一个 workspace 上的每个群组共享同一个 `QWEN.md`。

#### 设计：以 `(channelName, chatId)` 为键的 `channel` memory 作用域

隔离单元是**路由目标**，而不是 session（session 在空闲时会被回收，`DEFAULT_SESSION_IDLE_TIMEOUT_MS` 为 30 分钟，`run-qwen-serve.ts:94`）。该键已存在：`SessionTarget { channelName, senderId, chatId, threadId }`（`types.ts:88-93`）。对于群组 memory，以 `(channelName, chatId)` 为键。

**存储布局** 镜像现有的 `~/.qwen/channels/` 目录树：

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # sanitize: reject /, .., NUL
      <hash(chatId)>/               # sha256(chatId).slice(0,16) — path-safe, no collision/escape
        QWEN.md                     # group-scoped "learning over time"
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

文件名遵循 `getCurrentGeminiMdFilename()`（`const.ts:49`）。这使 channel memory 远离工作树、绑定的 workspace 以及分层的 `QWEN.md` 发现路径（因此它永远不会在群组间泄露）。

#### 写入路径（扩展 core helper，不要 fork 它）

在 `packages/core/src/memory/writeContextFile.ts` 中：

- 将 `WriteContextFileScope`（`:80`）从 `'workspace' | 'global'` 扩展，添加 `'channel'`。
- 为 `WriteContextFileOptions`（`:83-97`）添加 `channelKey?: { channelName: string; chatId: string }`；当 `scope === 'channel'` 时验证其存在（镜像 `:142-146` 的绝对路径守卫）。`projectRoot` 在接口中仍是必需的 —— 即使对于 channel 作用域未使用，也要传递 `config.cwd`。
- 在 `resolveContextFilePath()`（`:223-240`）中添加一个 `channel` 分支，返回 `path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())`。**该函数当前的签名是 `(scope, projectRoot)` —— 它必须增加一个 `channelKey` 参数**（私有函数，局部更改）。每文件互斥锁以解析后的路径为键，因此两个群组可以并发写入而不会发生竞争。

**确切的 `ChannelBaseOptions` 更改 + 谁来注入它（Fix #3）。** `channel-base` 无法 import core，因此 CLI 层将读写作为回调提供。扩展 options bag（`ChannelBase.ts:9-12` —— 今天的真实接口只是 `{ router?: SessionRouter; proxy?: string }`；`config` 和 `bridge` 是 `:40-46` 处的**构造函数位置参数**，不是 bag 成员）。该 bag 已经包含 `router`：

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions (NO new core dependency)
export interface ChannelBaseOptions {
  // ...existing members today: router?: SessionRouter; proxy?: string
  /** 读取此 channel 提炼后的 memory；如果还没有则返回 null。由 CLI 层注入。 */
  readChannelMemory?: (target: SessionTarget) => Promise<string | null>;
  /** 追加/替换此 channel 的 memory。由 CLI 层注入。 */
  writeChannelMemory?: (
    target: SessionTarget,
    content: string,
    mode: 'append' | 'replace',
  ) => Promise<void>;
}
```

**谁来构建和注入它们：** `packages/cli/src/commands/channel/start.ts`（它依赖于 core）。当 `start.ts` 为每个 adapter 构建 options bag 时，它闭包引用 core 的 `writeWorkspaceContextFile`/读取 helper，并从 `router.getTarget(sessionId)`（`SessionRouter.ts:94`）解析服务器信任的 `(channelName, chatId)` —— adapter 永远不会从网络中提供 `chatId`：

```ts
// packages/cli/src/commands/channel/start.ts — CLI 层（可以依赖 core）
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config 和 bridge 是 createChannel(name, config, bridge, baseOpts) 的位置参数 —— 不是 bag 成员
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
// adapter 按位置创建，bag 放在最后：plugin.createChannel(name, config, bridge, baseOpts)
```

adapter 永远不会接触文件系统，且 `channel-base` 不会增加新的依赖。（Phase-2 守护进程替代方案：一个作用域化的 `POST /channel/:sessionId/memory` 路由，在服务器端解析 `channelKey`；它不能重用 `POST /workspace/memory`，因为后者会严格验证 `scope ∈ {workspace, global}` 并转发固定的 `projectRoot`，`:118-125,185-190`。推迟到主动引擎已经需要守护进程端的 `sessionId → target` 查找时再实现。）

**事件扇出。** `publishWorkspaceEvent` 位于**守护进程端**的 `AcpSessionBridge`（`bridge.ts:3610`），而不是 channel 端。在 `AcpBridge`（Phase 0）下，**没有** `memory_changed` 事件（也不需要 —— 一个进程同时拥有写入和读取权）。在守护进程拓扑下，`publishWorkspaceEvent` 会不加区分地扇出到**每个**活跃的 session 总线（`bridge.ts:3649-3675`）；`BridgeEvent.data` 是自由格式的（`eventBus.ts:51`），因此 `memory_changed` 事件_可以_携带 `{ scope:'channel', channelName, chatId }`，但需要**订阅者端过滤** —— 发布者无法限定投递范围。

#### 读取路径（memory → prompt）—— 复用 `instructedSessions` 的每 session 一次引导

扩展每 session 一次的 `instructions` 块（`ChannelBase.ts:343-347`，由 `instructedSessions` 控制）：在目标具有 `(channelName, chatId)` 的 session 的第一条消息上，调用注入的 `readChannelMemory(target)` 并将其结果与 `config.instructions` 一起前置，然后像今天一样在 `instructedSessions` 中标记该 session。因为 `'thread'` 作用域共享一个 `sessionId`，这会在**每个 session 生命周期内**加载一次 memory（与已经防止重复注入 `config.instructions` 的同一个门控）。不添加 core 依赖 —— 读取通过注入的回调进行。Channel memory **永远不在**分层发现路径上；它通过此 hook 按 session 注入。

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

#### 与 SessionRouter 持久化/恢复及 transcript 的关系

| 层                    | 持久化内容                                            | 生命周期                                   | 所有者                             |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| Session transcript       | ACP 对话轮次                              | 直到被回收 / `/clear confirm` / 重启  | `Session`（agent）             |
| `SessionRouter` 持久化  | `key → { sessionId, target, cwd }`（`:5-9,224-244`） | 跨 bridge 重启，通过 `loadSession()` | `SessionRouter`（`sessions.json`） |
| **Channel memory（新增）** | 关于群组的提炼后的持久事实             | 无限期                                 | `~/.qwen/channels/memory/`        |

当 `restoreSessions()` 重新加载 session 失败时（`:196`），transcript 会丢失，但群组 `QWEN.md` 完好无损 —— 引导读取会在下一条消息时重新补充 agent 的知识。**Channel memory 是 transcript 的恢复底线。** “随时间学习”是一个_提炼_循环，而不是原始的 transcript 持久化：agent（或触发的 job）定期以追加模式将重要事实总结到群组 `QWEN.md` 中。

#### 隔离、大小和分阶段

只要写入路径始终携带服务器信任的 `chatId`，隔离就能在路径级别保持（`sales` 和 `eng` 会解析为不同的 `hash(chatId)` 目录/文件/互斥锁）。这是**内容**隔离，而不是认证边界（进程仍然只有一个全局 token，没有每用户身份）。对于硬性租户隔离，每个 workspace/租户运行一个进程（OD-2）。

大小防护栏（重用现有机制）：追加时 16 MB 的现有文件上限被免费继承（将 `WorkspaceMemoryFileTooLargeError` 映射为用户可见的“群组 memory 已满，请运行压缩过程”）；Phase-2 路由重用每次写入 1 MB 的上限（`MAX_MEMORY_CONTENT_BYTES`，`workspace-memory.ts:79`）；替换模式压缩（`writeContextFile.ts:202-211`）是解决无限增长的长期方案。

- **Phase 0/1：** 将 `channel` 作用域 + `channelKey` 添加到 `writeContextFile.ts`；发布 `~/.qwen/channels/memory/` + `meta.json`；通过 `ChannelBaseOptions` 和上述引导读取连接 CLI 层的 `readChannelMemory`/`writeChannelMemory` 回调。没有新的 HTTP 路由，没有 `channel-base → core` 依赖。
- **Phase 2：** 添加作用域化的 `POST /channel/:sessionId/memory` 路由（守护进程拓扑）和带有订阅者端过滤的 `memory_changed`；添加提炼触发器和 `qwen channel memory <name> <chatId>` CLI。**提炼约束：** cron 是 session 作用域的，并在 `dispose()` 时终止（`Session.ts:791,799-803,1056`）；提炼必须在 session 存活时触发 —— 在轮次完成时、在显式 `/remember` 时、或在保活 session 上 —— 绝不能来自独立的后台调度器。

### 6.4 治理：Token 预算与审计日志（构建区域 4）

一个驻留在 channel 中、任何成员都可以驱动 —— 并且可以主动采取行动 —— 的 agent，需要支出限制、记录_谁_问了_什么_的审计跟踪，以及按身份隔离。qwen-code 提供了四个原语中的三个：`rate-limit.ts`（每键 token 桶）、`permission-audit.ts` 环形缓冲区和 `MultiClientPermissionMediator`。本区域组合它们并填补空白（没有任何成本预算；没有审计行携带人类发送者）。指导原则：**拒绝，而不是截断** —— 但是，根据 Fix #6，_估算的_预算永远不会硬性拒绝用户提示；它只会发出 WARN。

#### 哪个进程拥有治理权？

| 部署                                          | Bridge                                                  | 可用的 `serve/` 机制                                                            |
| --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Phase 0 — `qwen channel start` / `AcpBridge`**    | 生成自己的 `--acp` stdio 子进程（`start.ts:213,356`） | **无。** 没有 Express 服务器，没有 `rate-limit.ts`，没有 HTTP 路由，没有 `permission-audit.ts` 环形缓冲区。 |
| **Phase 1+ — `qwen serve` + `DaemonChannelBridge`** | channel 托管在守护进程中                           | 所有 `serve/` 功能：真实使用量、mediator、rate-limit、audit ring、路由。                          |

解决方案：**预算准入 + 拒绝逻辑驻留在 `@qwen-code/channel-base`**（公共瓶颈 `ChannelBase.handleInbound()`）中，位于一个新的 **`packages/channels/base/src/BudgetLedger.ts`** —— _而不是_ `serve/budget.ts`，因为 Phase-0 channel 进程永远不会加载 `serve/`，并且 channel 层是唯一拥有人类发送者上下文的地方。**审计 + 归因**也起源于 channel 层。在 Phase-1+ 守护进程路径上，账本读取真实使用量并_额外_通过路由暴露；在 Phase-0 路径上，它进行估算并通过 channel 命令（`/audit`）暴露。

#### 当前治理的附加位置（及差距）

| 关注点                     | 现有机制                                                                                                                                                    | 差距                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 请求速率限流     | 每 `(clientId\|ip)` token 桶，3 个层级（`rate-limit.ts`）                                                                                                         | 没有 token/成本，只有请求数；仅限 `serve/`                                |
| 事后决策日志 | 有界 FIFO 环形缓冲区，5 种记录类型（`permission-audit.ts`）                                                                                                             | 没有人类 `senderId`，只有 `clientId`；没有 GET 路由；环形缓冲区由闭包持有（`:17-25`） |
| 真实的每操作审批    | 四种策略 + 共识法定人数（`permissionMediator.ts:621-637`）                                                                                                    | 投票归属于 `clientId`，而不是人类；一个 channel = 一个 client          |
| 每 channel 工具/数据作用域 | `coreTools`/`allowedTools`/`excludeTools`（`config.ts:727-729`）；`getPermissionsAllow()`（`:3158`）；`getPermissionsDeny()`（`:3182`）；MCP allow-filter（`:3327-3333`） | 作用域是每 `Config`/进程；没有进入 `--acp` 子进程的 spawn-arg 路径          |

两个结构性事实：(1) **守护进程没有人类身份**（`BridgeEvent.originatorClientId`、每个 `PermissionVote.clientId` 都是传输标识符；`senderName` 仅在 `SenderGate.check()` 中保留），因此任何 human↦`clientId`↦`sessionId` 关联必须在 channel 边界建立；(2) **认证和限流是守护进程全局的**（单一 bearer token `auth.ts:259-266`；限流以 `(clientId, ip)` 为键），因此每 channel 治理必须起源于 adapter。

#### Token 与成本预算 —— 新的 `BudgetLedger`，在真实使用量存在前仅提供建议（Fix #6）

**使用量来源 —— 注意事项（OD-9）。** 只有在模型报告使用量后，token 预算才能扣除_真实_数值。在 session 中，`Session.#recordPromptTokenCount()`（`Session.ts:2078-2087`）将 `usageMetadata.promptTokenCount` 存储在 `lastPromptTokenCount` 中，**每轮都会覆盖** —— _不是_ 累积计费表。在 Phase-0 `AcpBridge` 路径上，ACP `session/update` 流不携带 `usageMetadata`，因此 **v1 无法在那里扣除真实的 token 数**。在 Phase-1+ 守护进程路径上，守护进程在进程内观察使用量，_可以_ 精确扣除。

**执行规则（Fix #6 —— 承重）：**

- **估算预算仅为建议性质。** 当唯一可用的数字是 channel 端的估算值（提示+响应字符数 ÷ 每 token 字符数常量）时，账本会在阈值处**发出 WARN/警报**，并可能在回复中附加警告 —— 它**永远不会硬性拒绝用户提示**。误报的估算绝不能阻止真实的用户请求。
- **仅在真实数值时硬性拒绝。** **只有**当扣除来源是真实的守护进程使用量路径（Phase-1+ 守护进程托管）时，预算才可以_拒绝_提示（拒绝而非截断）。在此之前，预算只是可观测性 + 警报，而不是网关。

这使得 v1 预算是诚实的：它在各处提前警告，并仅在数值可信的地方强制执行硬性限制。

**模块 `BudgetLedger.ts`**，以 `rate-limit.ts` 为模型（工厂、带 GC 的桶 Map、溢出时 fail-open）：

```ts
export type BudgetUnit = 'tokens' | 'usd'; // 'usd' = tokens × per-model rate
export type UsageSource = 'estimate' | 'daemon'; // 'estimate' => advisory; 'daemon' => may hard-decline
export interface BudgetLedger {
  // allowed=false only when source==='daemon'; estimates return allowed=true + warn flags
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
  ): void; // fires threshold alerts
  snapshot(): Record<
    string,
    { spent: number; limit: number; ratio: number; source: UsageSource }
  >;
  reset(): void;
  dispose(): void;
}
```

- **默认继承语义 + 最严格优先的 org 汇总（OD-9）。** `admit(key)` 使用 `GroupGate` 风格的 `channel → '*' → built-in` 回退来解析有效窗口。提示必须**同时**通过每 channel 窗口和**每进程“org”汇总**（最严格优先，两者都扣除）。“org” = _此单一进程的_汇总；真正的跨进程 org 上限需要共享存储（超出范围）。**固定的每日窗口。**
- **75%/95% 警报。** `debit()` 在每个窗口的每个阈值处触发一次 `onAlert`，使用 event-bus 迟滞惯用法（`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`，`eventBus.ts:101-103`）。**发布警报是主动发送** —— 严格依赖于构建区域 2（钉钉冷群注意事项；飞书可自由发布）。当不存在主动 channel 时，降级为“将警告附加到下一个回复”。
- **拒绝而非截断（仅当 `source==='daemon'` 时）。** 在准入时检查，_在_ `bridge.prompt()`（`:425`）_之前_。对于真实使用量的 `!allowed`，adapter 调用 `sendMessage(chatId, refusal)` 并返回 —— 它**不会**进入 steer/cancel 路径，因此进行中的提示会完成，而_下一个_会被拒绝。对于估算，`allowed` 始终为 true（建议性质）。
- **成本（`usd`）** 将 token 乘以运营商提供的每模型费率表（qwen-code 是多模型的；没有单一价格）。缺少条目 → 回退到 `tokens` + 一次性警告。
- **配置。** `ChannelConfig`（`types.ts:27-51`）增加 `budget?: { unit; limit; windowMs; reset? }`，由 `parseChannelConfig` 解析。在守护进程路径上，`ServeOptions` 增加 `--budget-org-daily`/`--budget-unit`，并且 `daemon-status.ts`（已经报告 `rateLimit`，`:295-297`）增加一个并行的 `budget` 块。
#### 审计日志——人类 `senderId` 随 turn 携带（Fix #7）

`PermissionAuditRing`（`permission-audit.ts:128-172`，FIFO 512）是合适的基础结构，但每一行都以 `clientId` 为键。**设计——在 channel 侧建立 sender↦turn 绑定**（`RequestAttributionRing.ts`，相同的 FIFO 结构）。

**在 `followup` 模式下，简单的时间戳关联是错误的（Fix #7）。** v1 提议将权限行关联到“该 `sessionId` 中 `recordedAtMs` 早于权限 `issuedAtMs` 的最近一条 attribution 行”。在 `followup` 模式下，多个 sender 通过 `sessionQueues` 排队在**同一个** `sessionId` 上；最近被*入队*的 sender 通常**不是**在触发 tool-call/permission 时正在*执行* turn 的那个 sender。因此，时间戳关联会导致系统性的归属错误。

**修复：将 `senderId` 与排队的 prompt 一起携带。** 当 `handleInbound()` 入队到 `sessionQueues` 时（以及当调度器入队一个 proactive fire 时），队列项/合成 turn 上下文会携带其自身的 `{ senderId, senderName, requestSeq }`。在 turn 期间引发的任何 tool-call/permission 的归属信息，都是从**当前正在执行的 turn**（FIFO 的队头）读取的，而不是通过时间戳扫描。具体而言：`sessionQueues` 链路在 run 到达队头时（刚好在 `bridge.prompt()` 之前）为每个 turn 打上 `currentTurnAttribution.set(sessionId, {senderId, ...})` 的标记，并在 run 解析时清除它；审计行读取该 map。Proactive fires 以相同的方式标记 `createdBy`（§6.2 步骤 3）。这对于正在执行的 turn 是精确的，且不受入队顺序的影响。

在准入（admission）时添加第六种行类型 **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`**，这样即使是只读工作，审计也能回答“谁启动了此任务”。`PermissionAuditEntry` 联合类型（`:57-104`）是**封闭的**，且消费者通过 `kind` 进行 switch，因此扩展它（或添加同级 ring）会触及所有消费者。

**查询路径。** Phase-1+ daemon：添加 `GET /workspace/audit`（bearer + `createMutationGate` 严格模式，`auth.ts:356`），从 bridge 闭包中暴露 ring（文件头部文档已预见此点，`:22-25`）。Phase-0 `AcpBridge`：通过 `sendMessage` 发送 `/audit` channel 命令。**持久性：** ring 是 512 条内存记录，**重启后丢失**——这是已知的 v1 限制；后续跟进（OD-11）会将**仅追加的联合审计持久化到 `~/.qwen`**。

**共识投票者不是人类。** `votersAtIssue` 是 daemon 标记的 `clientId`，且一个 channel = 一个 `clientId`，因此开箱即用的 DingTalk 群组“共识”实际上是 _daemon 客户端_ 之间的共识。人类级别的投票需要一个已注册审批者名册，将 `senderId` 映射到独立的投票——这是 OD-3 Phase-2 的需求，而非已解决的功能。

#### Per-identity tool 与数据隔离

1. **Per-channel tool allow/deny。** `Config` 支持 `coreTools`/`allowedTools`/`excludeTools`（`:727-729`），通过 `getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()` 暴露。（**没有** `getAllowedTools()`/`getBlockedTools()`。）在 Phase 0 中，`AcpBridge` 路径为每个 channel 生成一个子进程，但 `AcpBridgeOptions` 仅携带 `{ cliEntryPath, cwd, model }`（`:17-21`），且 `start()` 仅转发 `--acp`+`--model`（`:56-63`）。实现 per-channel 作用域需要新的 `AcpBridgeOptions` 字段、传入 `Config` 的新 `--acp` 标志，以及新的 `ChannelConfig` 字段。在 Phase-1+ daemon 路径中，每个 daemon 有一个 `Config`，因此作用域是 per-daemon（per workspace，OD-2）而不是 per-channel-child。
2. **Per-channel MCP scoping。** `Config.getMcpServers()` 通过构造时设置的 `allowedMcpServers`（`:3327-3333`）进行过滤。将 `allowMcpServers?: string[]` 添加到 `ChannelConfig`，并传入相同的 spawn-arg 路径（或 `AcpBridge.newSession()` 传递的 `mcpServers` 数组——在 `:133` 处硬编码为 `[]`）。
3. **将 `sessionScope` 作为数据边界。** `'thread'` 使一个群组共享一个 working tree/context；跨 _channel_ 隔离通过 `channelName` 命名空间的路由键来强制执行。根据设计，`'thread'` 群组内的 per-sender _不_ 隔离。

**坦诚的局限性：** auth 是单一的 daemon 全局 token，没有 per-user principal，因此隔离是 per-**channel** 的，而不是 per-human。真正的 per-human tool 隔离需要 Phase-3。

#### 准入路径

```text
DingTalk inbound
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [existing :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [NEW]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (NOT into steer/cancel)
            ↳ source==='estimate': allowed always true → WARN only (Fix #6)
     3. 携带 {senderId, senderName, requestSeq} 入队到 sessionQueues  [NEW — Fix #7]
        + task.requested row
     4. 在 FIFO 队头，标记 currentTurnAttribution → bridge.prompt(...)   [existing :425]
            ↳ tool call → permission (在 AcpBridge Phase 0 自动批准；在 daemon Phase 1+ 由 mediator 处理)
                ↳ 审计行读取 currentTurnAttribution[sessionId]  (正在执行的 turn)
     5. 完成时：usage 已知 (daemon) 或估算 (AcpBridge) → budget.debit(..., source)  [NEW]
            ↳ 75%/95% 告警发布是 proactive → 依赖于 Build Area 2
```

需要指出的硬依赖：(1) 真实的 token 扣费（因此硬性拒绝）需要 Phase-1+ daemon 的 usage 路径——在此之前，budgets 仅为建议性质（Fix #6）；(2) proactive budget 告警需要 Build Area 2；(3) 人类级别的共识投票和人类级别的审计归属需要 OD-3 的已注册审批者名册。

### 6.5 DingTalk 平台（主要）+ Feishu 后续跟进

> **接线说明（已确定的架构）。** Phase 0：`qwen channel start` 构造 `AcpBridge`（`start.ts:213,350`；`AcpBridge.ts:38`），它会生成 `node <cli> --acp` 并暴露 `newSession(cwd)`/`loadSession(sessionId, cwd)`（`:131,137`）；session scoping 由 `SessionRouter` 拥有，而不是 bridge。Phase 1+：channels 通过 `DaemonChannelBridge` 托管在 `qwen serve` 下（其 `'thread'` 默认值在 `:229,240`；其重叠抛出在 `:257-261`）。迁移是已确定的，而非可选的（§1）。

#### sessionWebhook 过期问题

DingTalk Stream 模式为每个 inbound 传递一个短期有效的 `sessionWebhook`；adapter 以 `conversationId` 为键对其进行缓存（`:84`，在 `onMessage()` `:517` 中填充），`sendMessage()`（`:134-170`）会查找它，如果缺失则记录 `No webhook for chatId` 并静默返回（`:137-141`）。对于 proactive 使用有两个致命事实：(1) webhook **会过期**（SDK 类型 `RobotMessageBase` 包含 `sessionWebhookExpiredTime`，`constants.d.ts:13`，但 adapter 的 `DingTalkMessageData` 接口省略了它且从不读取——即使在热窗口内，缓存的 webhook 也可能过期）；(2) 该 map **仅**由 inbound 流量填充，因此冷群组没有条目。

#### 通过 robot proactive-message（主动消息）API 推送冷群组——已验证（OD-7）

修复方案是使用 DingTalk 的 bot proactive-message API —— **`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** _（端点已高置信度验证）_。与 webhook 不同，它通过持久的 **`openConversationId`** _（已高置信度验证）_ 进行寻址，使用 **`x-acs-dingtalk-access-token`** header _（已高置信度验证——已被 `emotionApi()` `:188-207` 和 `downloadMedia()` `media.ts:36-43` 使用）_ 进行身份验证，并携带 bot 的 **`robotCode`** _（已高置信度验证；= `config.clientId`，`:184,435`）_。body 是一个 `msgKey`/`msgParam` 对 _（已高置信度验证）_，其中 **`msgParam` 本身是一个 JSON 编码的字符串**（而不是嵌套对象），例如对于 `msgKey:'sampleMarkdown'`：

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // 持久的群组 id（来自 inbound conversationId；如果无效则转换）
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<preview title>\",\"text\":\"# hi\\n...markdown ≤ ~5000 chars\"}",
}
```

这是一个与 `sendMessage()` **并列的新方法**，而不是对它的修改（草图见 §6.2）。`ChannelBase.sendMessage()` 保持抽象（`:81`）；proactive engine 需要新的 `pushProactive?(target, text)` 出站接缝（outbound seam）——这是全新的，也是核心的平台交付物。**端点/参数/`msgParam` 形状已根据官方发送文档 + aliyun ask/559227, ask/585232 + 消息类型文档 [高置信度] 验证**。

**权限前提条件：** 在 `groupMessages/send` 生效之前，必须向企业内部应用授予“发送群聊主动消息”的 robot/message 权限（发送文档列出了此前提条件）_（已高置信度验证必须启用某项权限）_。**仍需标记（低置信度）：** 本次会话的文档未确定确切的权限点显示名称/代码——DingTalk 控制台在应用的权限管理中将其显示为 robot/message-sending 权限（通常是 robot-message 系列，例如 `qyapi_robot_sendmsg` / 企业机器人发送消息权限）；请在控制台中确认，**不要**硬编码断言该代码。adapter 必须在 `!resp.ok`/throw 时记录 `resp.status` + body——当前 `emotionApi` 的空 catch（`:214-216`）是一种反模式，会掩盖缺少权限的错误配置。

#### 获取并持久化 openConversationId

两个来源：(1) **从 inbound 中获取**——每条消息都携带 `conversationId`（`:506`），作为 `openConversationId` 转发给 emotion API（`:197`）；在看到它的那一刻就将其持久化。**根据 aliyun ask/559227, ask/585233 + 匹配的 'cid' 格式 [中等置信度] 验证**，回调 `conversationId`（cid 前缀）可直接用作标准群组 @-回调的 `openConversationId`。**仍需标记：** 没有官方逐字句子表明它们对于非 cool-app robot 是等同的；文档保证的获取路径是 **`chatId → openConversationId` 转换 API**（`obtain-group-openconversationid`），或者从 group-create API / `chooseChat` JSAPI 捕获，或者从 cool-app 回调获取（直接传递 `openConversationId`+`coolAppCode`）。**回退方案：** 遇到 `invalid.openConversationId` 时，通过 `chatId` API 转换并重试。(2) **通过 `registerAllEventListener` 获取 bot-added-to-group 事件**（`client.mjs:58-61`）：事件在默认的 `topic:'*'` 下流经 `onEvent → onEventReceived`（`client.mjs:14-19,241-254`），而 adapter 仅安装了 robot _callback_（`:107`），因此 org/bot 事件目前被接收并丢弃到无操作的默认处理中（`client.mjs:35-37`）。安装时的事件 topic 和 `openConversationId` 字段**未经验证**——不要硬编码事件名称。

**持久化。** 使用**独立的 `~/.qwen/channels/dingtalk-groups.json`** 存储，而不是 `SessionRouter` 目标：群组 ID 必须比任何 session 存活得更久（cron 驱动的冷群组推送在没有活跃 session 时也会触发），并且只有在为路由键创建了 session 后才会存在 `PersistedEntry`——将群组身份与 session 生命周期耦合会导致冷群组无法被表示。

#### 多人协作作用域是 opt-in，而非默认

`'thread'` 作用域（`:53`）是实现每个群组一个共享 agent 的关键，但 `parseChannelConfig()` 默认将 `sessionScope` 设为 `'user'`（`config-utils.ts:91-92`），这会生成 _per-member_ session。操作员必须显式设置 `sessionScope: 'thread'`。设置后，会产生两个多人协作场景下的影响：(a) 默认的 `dispatchMode: 'steer'` 会在任何成员发送消息时**取消**进行中的工作（`:371-379`）——tag profile 设置为 `'followup'`（§6.1）；(b) sender-attribution 缺口（§6.1）。

#### Inbound @ 解析

群组门控（Group gating）有效：`GroupGate` 使用 `envelope.isMentioned`，该值由 `data.isInAtList` 设置（`:520`）。文本清理仅剥离**第一个** `@token`（`:527-529`），这是基于位置而非基于身份的——`@qwen @alice` 是正确的，但如果人类被首先提及，则会剥离人类的 @。后续的加固措施将根据 bot 自身的 `chatbotUserId` 进行剥离。回复/引用上下文会被提取（`extractQuotedContext()`，`:272-298`），`isReplyToBot` 根据 `chatbotUserId` 计算（`:280,292`），并且 `referencedText` 作为 `[Replying to: "…"]` 注入（`ChannelBase.ts:317-319`）。**Sender attribution 在 §6.1 中通过 `[senderName]` 前缀已闭环**。

#### Markdown / 卡片渲染

`markdown.ts` 已经完成了 proactive 路径复用的平台规范化：表格 → 管道文本（`convertTables()`，`:44-80`），在 3800 字符处进行分块并保持 fence 平衡（`splitChunks()`，`:84-188`；`CHUNK_LIMIT=3800`，`:10`），标题提取截取为 20 个字符，回退为 `'Reply'`（`extractTitle()`，`:190-195`）。复用是**有条件的**，取决于 `sampleMarkdown` 模板接受相同的 markdown 子集以及最多 **~5000 字符** 的正文 _（已高置信度验证——消息类型文档）_；保持 `CHUNK_LIMIT` ≤ 该预算。流式交互卡片（`TOPIC_CARD` 路径，`constants.d.ts:4`）——类似于 Feishu 的流式卡片——**不在**主要里程碑的范围内；v1 proactive 是基于 markdown 消息的。

#### Feishu 后续跟进（简述）

Feishu 在至关重要的维度上处于领先地位：**proactive 发送是原生的**（向任何 `chat_id` 调用 `sendMessage(chatId, text)`，`:622-676`——没有冷群组问题；`canColdSend = true`），**稳定的 `tenant_access_token`** 并带有过期跟踪的刷新机制（`refreshToken()`，`:581-620`——这是 DingTalk 仍需完成的工作），**灵活的事件订阅**（WebSocket 或 HMAC webhook，`:146-176`），以及**一流的流式卡片**（`markdown.ts`，`:742-792`）。**但是，共享的 `ChannelBase`/`SessionRouter` 问题——opt-in 的 `'thread'` 作用域、`dispatchMode` 取消、缺失的 sender attribution、新的出站接缝——同样完全适用于 Feishu。** Feishu 解决的是_可达性_，而不是_谁说了什么_或_一个成员取消另一个成员_。将 proactive engine 移植到 Feishu 会直接复用现有的 `sendMessage()`（基础的 `pushProactive` 默认值）；唯一新的平台工作是将 engine 的目标群组映射到持久化的 `chat_id`，并可选择通过流式卡片路径进行路由。

---

## 7. 分阶段发布（Phase 0–2）与 MVP

每个阶段都可以独立合并，以可演示的状态结束，并由明确的验收标准把关。**Phase 0** 使现有堆栈表现得像一个共享的常驻 agent——在 `AcpBridge` 上进行配置加上少量代码更改。**Phase 1** 将 channel 托管迁移到 `qwen serve`（已确定的架构），并添加 proactive engine 和单一的 MVP 闭环。**Phase 2** 添加 channel memory、budgets 和 audit。

### 拓扑：已确定的 daemon 迁移（原 OD-1）

决定已经**做出**，而非待定：Phase 0 在 `AcpBridge` 上发布；**Phase 1+ 在 `qwen serve` 下运行 channels**（通过 `DaemonChannelBridge` 或 daemon channel runner），因为 per-room memory 持久化、permission mediator、event-bus audit、FIFO `promptQueue` 以及 budget/audit 查询路由都需要 daemon。gateway 拥有的调度器（§6.2）是**与迁移无关的（migration-neutral）**——无论使用何种 bridge，它都通过 `ChannelBase.sessionQueues` 进行序列化——因此它在 Phase 1 中发布，且不受切换的影响。**Phase 0 的接线添加了 `DaemonChannelBridge` 附加路径（或 `--daemon <url>` 标志）**，因此迁移是 Phase-1 边界处的一个配置步骤，而不是重写。请注意调度器设计所围绕的严苛边界（sharp edge）：`DaemonChannelBridge.prompt()` **不会**排队——它在重叠时会_抛出_ `Prompt already in flight`（`:257-261`）；daemon FIFO `promptQueue` 在 acp-bridge 侧（`bridge.ts:2855,3082`）；channel 侧的序列化是 `ChannelBase.sessionQueues`（`:394`），这就是为什么 proactive engine 在 turn 处于活动状态时从不调用 `prompt()`（§6.2, Fix #1）。

### Phase 0 — 配置 + 身份注入（在 `AcpBridge` 上）

**目标。** 在一个 DingTalk 群组中，任何成员 `@` 提及 bot，每个成员共享一个 session，agent 知道谁在说话，并且进行中的任务不会被队友的 follow-up 破坏。

**0.1 — "qwen tag" 配置 profile**（主要是 `settings.json`）：

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // Multiplayer: 整个群组共享一个 sessionId。routingKey → `${name}:${threadId||chatId}` (:53)。
    // DingTalk 不设置 threadId (:541-551) → key 回退到 chatId = conversationId||sessionWebhook (:534)。
    // 没有 conversationId 的消息将 key 到瞬态 webhook 上——将其视为硬错误。
    "sessionScope": "thread",

    // groupPolicy 默认为 "disabled" (GroupGate :13; config-utils :98) — 必须设置，否则所有群组消息都会被丢弃。
    // 在 allowlist 模式下，"*" 不是成员通配符 (GroupGate :42)；列出每个 chatId。"*" 仅提供默认值。
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

与事实依据相关的说明：`requireMention` 默认为 `true`（`GroupGate.ts:49`）；`sessionScope` 默认为 `'user'`（`config-utils.ts:92`）——`'thread'` 是完整的多人协作机制；`dispatchMode` 的群组默认值应为 `'followup'`（而不是运行时的 `'steer'`，`:354`）。

**0.2 — Sender attribution。** `promptText` 种子处的 `[senderName]` 前缀（`ChannelBase.ts:316`），以 `isGroup` 为门控，**每个 turn 都会触发**（不受 `instructedSessions` 门控），并使用**新的 `Envelope.alreadyPrefixed`** 标志来防止 `collect` 重入。参见 §6.1。

**0.3 — `dispatchMode` 协调。** 显式设置 per-group 的 `dispatchMode`；修复过时的 `types.ts:42` JSDoc（`'collect'` → `'steer'`），使代码和注释保持一致（OD-5）。

**涉及的文件（Phase 0）。** `start.ts`（添加可选的 `DaemonChannelBridge` 附加路径，使 Phase 1 已确定的迁移只需一个标志即可实现）；`ChannelBase.ts`（`senderName` 种子 + `alreadyPrefixed` 防护 + `/clear` 确认+allowlist 门控 + `/who`）；`types.ts`（新的 `Envelope.alreadyPrefixed` 字段 + JSDoc 修复）；`docs/`（操作指南 + 注意事项）。

**验收标准。**

- [ ] 两名成员 `@` 提及 bot；两者都解析为**同一个** `sessionId`（通过 `SessionRouter` maps 断言）；路由键是 `team-eng:<conversationId>`，而不是 webhook URL。
- [ ] agent 使用 sender attribution（群组中存在 `[senderName]`，1:1 中不存在）；`collect` 重入不会双重添加前缀（断言 `alreadyPrefixed` 路径）。
- [ ] 非提及的群组消息被丢弃（原因 `mention_required`）；非 allowlist 的群组被丢弃（`not_allowlisted`）。
- [ ] 在 `dispatchMode: 'followup'` 下，成员 B 在成员 A 的任务期间发送消息不会取消 A；B 的消息在 A 之后运行。
- [ ] 在共享（thread）群组中，`/clear` 需要 `confirm`，并且在设置了 `config.allowedUsers` 时仅限于这些用户（不是无限制的重置）；`/status` 保持只读。
- [ ] Hook 级别的单元测试（无 `wait(ms)` UI 测试）：跨发送者的路由键相等性；`isGroup` 为 true 与 false 时的 promptText 前缀存在性；`alreadyPrefixed` 跳过。

### Phase 1 — Daemon 迁移 + Proactive Engine + MVP 闭环

**MVP 定义。** 一个**单一的定时摘要闭环**：操作员为一个 channel 注册一个 cron 风格的 job；触发时，gateway 解析该 channel 的 thread-scoped session，使用 tools 运行 prompt，并**将结果主动发布回冷群组（cold channel）中**。一个 job，一个 channel，一条交付路径。更丰富的行为不在 MVP 范围内。

**已确定的迁移。** Phase 1 通过 `DaemonChannelBridge`（OD-1 决策）在 `qwen serve` 下托管 channels，继承 FIFO `promptQueue`、mediator、eventBus 和 routes。proactive engine 见 §6.2（gateway 拥有的、与迁移无关的调度器；`dispatchProactive` 通过 `sessionQueues` 序列化；通过已验证的 `groupMessages/send` API 实现 DingTalk 冷发送回退；`tokenManager` 刷新；`canColdSend` 能力标志）。三个事实使其并非易事：今天的 cron 是 session-scoped 的，并在 dispose 时死亡（由 OD-8 单一所有者门控关闭）；DingTalk 无法向冷群组发送消息（由已验证的 proactive API + 持久化的 `openConversationId` 关闭）；并且 proactive prompt 必须通过 `sessionQueues` 序列化，且在持有 `activePrompts` 时**永远不要**调用 `bridge.prompt()`——否则 `DaemonChannelBridge` 会抛出 `Prompt already in flight`（`:257-261`）。
**涉及的包。** `ChannelCronStore.ts`/`ChannelCronScheduler.ts`（新增，channel-base）；`cronParser.ts`（复用）；`ChannelBase.ts`（`dispatchProactive`、`pushProactive`、`canColdSend` 标志、`/schedule`）；`DingtalkAdapter.ts` + `dingtalk/src/proactive.ts`（新增冷发送 + 持久化 `openConversationId` + `tokenManager`）；`FeishuAdapter.ts`（无变更；作为支持主动发送的适配器参考，`canColdSend = true`）；`start.ts`（在 daemon 下托管；在 `restoreSessions()` 之后构建并启动调度器；将 `isTagSession` 传入会话构建过程以禁用会话内 cron — OD-8）；会话构建（对 tag 会话跳过 `startCronScheduler()`，`Session.ts:667-668`）。

**验收标准。**

- [ ] Channel 在 `qwen serve`（daemon 托管）下运行；工具调用会触发 `permission_request`（mediator 可达），从而确认迁移完成。
- [ ] 操作员注册一个摘要任务；该任务在网关重启后依然持久存在（从 `~/.qwen/channels/cron.json` 重新加载）。
- [ ] 当任务在**没有打开会话**的情况下触发时，网关会解析线程作用域的会话，使用工具运行 prompt，并通过冷发送路径投递到空闲的钉钉群——证明冷群投递能力。当 `canColdSend = false` 时，引擎会**显式失败**（记录日志、记录 `lastError`，不会静默无操作）。
- [ ] 同一任务通过 `tenant_access_token` 在飞书上投递，证明 `canColdSend` 抽象的有效性。
- [ ] 触发的任务不会违反“一会话一 prompt”原则：如果成员正在对话中，主动 prompt 会通过 `sessionQueues` 排队在其后执行（await `activePrompts.get(sessionId)?.done`），绝不会进行 `steer` 取消，也绝不会触发 `DaemonChannelBridge` 的重叠抛出异常。
- [ ] 主动轮次不会被后续的人类轮次取消（tag 群组为 `followup` 模式，绝非 `steer`）。
- [ ] `tokenManager` 会在 v1.0 `accessToken` 约 2 小时过期前以及遇到 401 错误时刷新它，因此 socket 打开超过 2 小时后的发送依然能成功。
- [ ] 任何持久化任务都不会重复触发：网关调度器是唯一所有者；tag 会话不会启动其会话内 cron（OD-8）；这两个存储位于互不相交的路径上。
- [ ] 删除任务可停止未来的触发。
- [ ] Hook/服务级测试（调度器使用假时钟；冷发送使用 mock HTTP 客户端）——不使用 `wait(ms)`。

### 阶段 2 — Channel 记忆 + Token 预算 + 审计日志

**2.1 — Channel 作用域记忆**（§6.3）：在 `writeContextFile.ts` 中添加 `'channel'` scope 和 `channelKey`（`WriteContextFileScope` `:80`，`WriteContextFileOptions` `:83-97`，`resolveContextFilePath` `:223-240`）；发布 `~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md`；通过 `ChannelBaseOptions` 接入 CLI 层的 `readChannelMemory`/`writeChannelMemory` 回调，并复用 `instructedSessions` 进行引导读取。阶段 2 的 daemon 路由 `POST /channel/:sessionId/memory` 仅在 daemon 拓扑下可用。

**2.2 — 每 channel token 预算**（§6.4）：`BudgetLedger.ts` 以 channel 为键，**channel 侧估算仅作建议（仅 WARN），仅在实际 daemon 使用时硬性拒绝**（Fix #6/OD-9）；每进程 org 汇总 + 每 channel 窗口，最严格者胜出，固定每日窗口；75%/95% 告警（主动发送依赖）。

**2.3 — 审计日志**（§6.4）：`RequestAttributionRing` + `task.requested` 行；**归属信息随执行轮次携带（每轮 `currentTurnAttribution`），而非时间戳关联**（Fix #7）；`GET /workspace/audit`（daemon）或 `/audit` channel 命令。内存中 FIFO 512，重启后丢失（已知的 v1 限制；后续通过 `~/.qwen` 仅追加文件跟进，OD-11）。

**涉及的文件。** `writeContextFile.ts`，`workspace-memory.ts`（scope 校验 + GET walker，daemon 路径）；`BudgetLedger.ts`，`RequestAttributionRing.ts`（channel-base）；`permission-audit.ts`（模式来源）/ 新增 `channel-audit.ts`（daemon）；`ChannelBase.ts`（在排队轮次上携带 `senderId`/`senderName` + `currentTurnAttribution`；预算 hooks）；`server.ts`（在 `express.json` `:2025` 之后挂载路由，使用 `mutate({ strict: true })` 门控变更）。

**验收标准。**

- [ ] `scope: 'channel'` 写入 `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md`；两个群组获得**独立**的文件；共享的 workspace `QWEN.md` 不受影响；写入通过注入的回调进行（无 `channel-base → core` 依赖）。
- [ ] Channel 记忆追加在并发下是幂等的（每文件互斥锁），且仅在实际发生突变时发出 `memory_changed`（daemon 路径；订阅方过滤）。
- [ ] 在 **daemon** 路径下，当 channel 超过其实际使用窗口上限后，下一个入站 prompt 会被拒绝（而非截断），且主动任务暂停；计数器在每日窗口滚动时重置；预算是每 channel 独立的。在**仅估算**路径下，预算仅发出 WARN 而绝不硬性拒绝（Fix #6）。
- [ ] 当发送者 A 的排队轮次执行时触发的工具调用/权限请求，归属于 **A**，即使 B 随后在 `followup` 模式下入队（Fix #7）。
- [ ] 每次主动触发、channel 记忆写入和预算事件都会落入审计环中，带有尽力而为的 `senderId`/`senderName`，可通过审计界面读取，**不会**在 SSE 总线上广播。
- [ ] Ring/route/resolver 单元测试（FIFO 淘汰、scope 路径解析、预算阈值计算、执行轮次归属）——无 UI/时序测试。

### 阶段边界与前瞻

阶段 0→1→2 是累加的：多人协作 + 身份（在 `AcpBridge` 上） → daemon 迁移 + 主动发送 MVP → 记忆 + 预算 + 审计。**阶段 3 的多身份网关**（每个 channel 独立的 bot 身份/凭证，真正的每用户主体，每 channel token）_不在范围内_，它是移除单全局 token / 单 daemon 单 workspace 约束的自然下一步。即使在阶段 0-2 中，"qwen tag" 也需要**每个 workspace 一个 agent 进程**（OD-2）；服务多个 repo 的部署会运行多个进程。

---

## 8. qwen tag vs Claude Tag（权衡）

Claude Tag 是一个托管的多租户 agent：Anthropic 负责运行运行时、身份和每用户计量；channel 应用只是一个瘦客户端。`qwen tag` 则相反——它运行在操作员控制的基础设施上，构建于 qwen-code 的适配器之上。这种反转就是其全部价值主张，也是全部风险所在。

### qwen 的优势

- **开放/自托管，数据留在内部。** agent 在本地运行——阶段 0 通过 stdio（`AcpBridge.start()` 运行 `node <cli> --acp`），阶段 1 起在 `qwen serve` 进程内运行——绝不经过供应商 API。Repo 内容、模型流量和转录数据都保留在操作员主机上。Claude Tag 无法做出此承诺。
- **MCP / 任意工具。** 严格超出于封闭托管 agent 的工具集。
- **每操作权限投票——_阶段 1+ 在 daemon 托管后具备的能力_。** qwen-code 提供 `MultiClientPermissionMediator`（四种策略，共识法定人数 `floor(M/2)+1`，独立审计环）。这确实是一个差异化优势——**在阶段 0 的 `AcpBridge` 路径上无法实现**（`requestPermission` 自动批准，`:108-118`），在阶段 1 将 channel 托管在 daemon 中后可实现；即便如此，投票仍以 `clientId` 为键，且一个 channel 在 OD-3 名单落地前只是_单一_客户端。已废弃的 `ChannelConfig.approvalMode` 字段（`types.ts:36`）证实了这一点（计划中但缺失）。
- **持久、可检查的状态。** `SessionRouter` 持久化，纯文本 `QWEN.md`/`AGENTS.md` 文件，以及（daemon，阶段 1+）Last-Event-ID 重放环。没有任何不透明的部分。

### 差异点及必须补偿的地方

1. **单 workspace + 单全局 token + 无人类身份。** 一个进程绑定一个 workspace；多 workspace = N 个进程（OD-2）。单全局 token 应用于 _HTTP daemon_；阶段 0 的 `AcpBridge` channel 路径没有 HTTP 表面也没有 token（其边界是 `SenderGate`/`GroupGate`）。没有任何人类身份——`senderName` 仅是建议性的 prompt 文本（OD-11）。_补偿：_ 每个 workspace/团队一个进程；在 channel 层注入发送者归属；保持 `clientId` 作为安全边界；在任何非环回 daemon 上要求 `--require-auth` + token（OD-12）。
2. **主动/冷 channel 消息不统一。** 钉钉仅支持被动回复（过期的 `sessionWebhook`）；飞书通过 `tenant_access_token` 自由发送。_补偿：_ 阶段 1 在持久化的 `openConversationId` 上实现经验证的主动群发送（钉钉，`canColdSend` 变为 true）；飞书无需此操作。
3. **调度器是会话作用域的，而非 daemon 作用域的。** Cron 在 30 分钟空闲回收时的 `dispose()` 中死亡。_补偿：_ 网关拥有的调度器（§6.2）——长生命周期，在回收中存活，唯一的 cron 所有者（OD-8）。
4. **记忆是 workspace 全局的，而非每 channel 的。** _补偿：_ 每 channel 一个进程（零代码）或阶段 2 的 `channel` scope（OD-10）。
5. **多身份/真正的多租户不在范围内**（阶段 3）。在阶段 0-2 中建模为多进程。

### 风险与缓解措施

| #   | 风险                                                                                                                                                   | 严重程度 | 缓解措施                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Channel 栈工具调用在阶段 0 的 `AcpBridge` 路径上被**自动批准**（`AcpBridge.ts:108-118`）——泄露的 channel 可以无门控地运行任何工具。 | 高     | 承诺的阶段 1 daemon 迁移会引入 mediator；在此之前限制工具集 + 受信任主机。                                                           |
| R2  | Daemon 单全局 token 泄露会授予完整的 workspace 访问权限（HTTP daemon 路径；`AcpBridge` 路径无 token）。                                    | 高     | 默认环回 + bearer 门控；非环回时启用 `--require-auth`（OD-12）；受信任主机；通过重启轮换；一旦接入，将破坏性工具置于 `consensus` 之后。 |
| R3  | `dispatchMode` 默认值 `'steer'` 会在任何成员的消息到达时取消进行中的工作（JSDoc 原为 `'collect'`，现已修正为 `'steer'`，`types.ts:42`）。       | 高     | Tag 群组设置为 `'followup'`；JSDoc 已协调一致（OD-5）。                                                                                                             |
| R4  | 缺少发送者归属导致 agent 混淆发言者。                                                                                                 | 高     | 阶段 0 为群组轮次注入 `[senderName]`（加上 `alreadyPrefixed`，OD-6）。                                                                                     |
| R5  | 钉钉冷群/过期 webhook 主动发送静默失败（`:137-141`）。                                                                         | 中   | 阶段 1 在持久化的 `openConversationId` 上实现经验证的主动群发送；`canColdSend` 显式失败；暴露降级情况。                                           |
| R6  | Cron/通知在会话回收时死亡（30 分钟，`run-qwen-serve.ts:94`）；还需要一条出站路径（R5）。                                             | 中   | 网关拥有的调度器（§6.2）；OD-8 唯一所有者门控。                                                                                                             |
| R7  | `requireMention` 为 true 时，未被提及的群组消息被静默丢弃（`GroupGate.ts:51-52`）。                                                            | 低/中  | 保持默认值；编写文档；可选的首条消息提示。                                                                                                          |
| R8  | 共享 workspace 记忆交叉污染共置的群组。                                                                                           | 中   | 每 channel 一个进程或阶段 2 的 `channel` scope（OD-10）。                                                                                                       |
| R9  | 速率限制是基于 `clientId`/IP 的，而非基于用户的（daemon 路径）；`AcpBridge` 路径没有限制。                                                                | 低      | 对于单租户可以接受；每用户计量属于阶段 3。                                                                                                       |
| R10 | 共识投票者集在请求时快照；目前 channel 成员不是不同的 `clientId`。                                                    | 低      | OD-3：阶段 1 的 `first-responder`；在共识之前解决 `senderId`→投票映射。                                                                                  |
| R11 | 除非 socket 关闭，否则钉钉 SDK 从不刷新约 2 小时的 access token——主动/情绪/媒体静默失败。                                   | 高     | `tokenManager` 由主动发送功能拥有，通过 v1.0 `oauth2/accessToken` 端点刷新（§6.2，已验证）。                                            |
| R12 | 在人类轮次期间，主动触发调用 `DaemonChannelBridge.prompt()` 会**抛出** `Prompt already in flight`（`:257-261`）。                     | 高     | `dispatchProactive` 通过 `sessionQueues` 串行化，并在 `bridge.prompt()` 之前 await `activePrompts`——抛出守卫在结构上不可达（Fix #1，§6.2）。 |
| R13 | 估算预算的误报可能会拒绝合法的用户 prompt。                                                                                | 中   | 估算仅 WARN；仅在实际 daemon 使用时硬性拒绝（Fix #6，§6.4）。                                                                                       |
| R14 | `followup` 排队将工具调用错误归属给最近入队的发送者。                                                                    | 中   | 在排队轮次上携带 `senderId`；审计读取执行轮次（Fix #7，§6.4）。                                                                               |

---

## 9. 已解决的决策

所有 v1 开放决策（Open Decisions）均在下方解决并给出了选择的答案。**唯一真正未解决的项目**是 OD-7 下低置信度的钉钉 API 细节，已在最后一行标出。

| ID                        | 问题                                                                                       | **决策**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | 将 channel 托管迁移到 `qwen serve`（阶段 1+），还是保留在 `AcpBridge` 上？                | **已解决 — 迁移。** 阶段 0 在 `AcpBridge` 上发布；**阶段 1+ 通过 `DaemonChannelBridge` / daemon channel runner 将 channel 托管在 `qwen serve` 下**，继承 FIFO `promptQueue`、`MultiClientPermissionMediator`、`eventBus`、`/workspace/memory` 和速率限制。阶段 0 添加 attach 路径（或 `--daemon <url>`），使切换成为一个配置步骤。网关调度器（§6.2）与迁移中立。不再是门控——已承诺的架构。                                                                                                                                                                                                                                                                                                                                                                                |
| **OD-2**                  | 部署单元 = 每个 workspace/channel 一个进程？                                           | **已解决 — 是。** 每个 workspace/channel 一个进程：每 channel 记忆 + 密钥隔离，限制单全局 token 的爆炸半径。共置多个 channel 是阶段 3 的关注点（需要 `channel` scope + governor）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OD-3**                  | 多人 tag 的权限策略（一个 channel = 一个 daemon `clientId`）？                 | **已解决 — 阶段 1：具有单一 channel 级 `clientId` 的 `first-responder`**（任何允许的成员均可解析；channel 粒度归属；无 `senderId→clientId` 映射）。**阶段 2：`consensus`/`designated`**，前提是存在 `senderId→clientId` 名单 + 生命周期（回收、引用计数边界）。**在主动轮次上自动拒绝高风险工具。**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | 线程作用域的 `/clear`/`/status` 是 channel 全局的。                                             | **已解决 — 在共享（线程）群组中，`/clear` 需要 `confirm`，且在设置了 `config.allowedUsers` 时仅限于这些用户**（带连字符的 `/clear-channel` 不可解析；每成员所有者门控推迟到身份模型，OD-3/OD-11）；`/status` 在共享会话上保持只读。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | `dispatchMode` 默认值不匹配（JSDoc `'collect'` vs 运行时 `'steer'`）。                      | **已解决 — 将 `types.ts:42` 的 JSDoc 修正为 `'steer'`**（匹配运行时）；tag 群组 profile 显式设置 `dispatchMode: 'followup'`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OD-6**                  | 发送者标记格式 + `collect` 双前缀。                                                | **已解决 — 每轮 `[senderName]` 前缀，不受 `instructedSessions` 门控**，加上**一个新增的可选 `Envelope` 字段 `alreadyPrefixed`**（`types.ts`），以便 `collect` 模式的合成重入跳过重复前缀。（纠正了 v1 中“无新字段”的说法。）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | 钉钉主动发送：端点/权限、`openConversationId` 等价性、token 刷新。 | **已解决并附带验证事实（§6.2/§6.5）：** 端点 `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _（高）_；请求体 `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _（高）_；鉴权头 `x-acs-dingtalk-access-token` 使用 v1.0 `oauth2/accessToken` token，约 7200 秒 TTL，由功能专属的 `tokenManager` 缓存和刷新 _（高）_；在 `~/.qwen/channels/dingtalk-groups.json` 中持久化 `openConversationId`；回调 `conversationId` ≈ `openConversationId` _（中；在 `invalid.openConversationId` 时回退到 `chatId→openConversationId` 转换 API）_。**剩余未解决（低置信度）：确切的权限点代码/显示名称；逐字的官方等价性句子；20次/分钟节流是否适用于 `groupMessages/send`。** |
| **OD-8**                  | 网关和会话调度器之间的 Cron 重复触发。                                       | **已解决 — 网关调度器是唯一的 cron 所有者。** Channel 托管的（tag）会话**不**启动其会话内 `Session` cron；它通过会话构建时从 channel 宿主传入的 `isTagSession` 标志得知自己是 tag 会话（阶段 1+ 的 `DaemonChannelSessionFactory` 选项包；阶段 0 的 `--acp` 生成选项），从而跳过 `startCronScheduler()`（`Session.ts:667-668`）。这两个 cron 存储位于**互不相交的路径**上（网关 `~/.qwen/channels/cron.json` vs 会话 `~/.qwen/tmp/<hash>/scheduled_tasks.json`），因此唯一的冲突风险是为相同任务运行两个调度器——已通过该门控消除。                                                                                                                                                                                     |
| **OD-9**                  | Token 预算范围、真实来源、窗口。                                                   | **已解决 — 每进程 "org" 汇总 + 每 channel 窗口，最严格者胜出，固定每日窗口。** v1 在 channel 侧估算 token（建议性，仅 WARN——绝不硬性拒绝，Fix #6），并在 daemon 托管后读取 **daemon 使用路径**以进行精确扣费（和硬性拒绝）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | 每房间记忆命名空间 + 写入权限。                                                 | **已解决 — 在 `writeContextFile.ts` 中添加 `channel` scope（+`channelKey`）；channel-base 通过 `ChannelBaseOptions` 注入的 CLI 层回调获得写入/读取能力（`readChannelMemory`/`writeChannelMemory`）——无 `channel-base → core` 依赖。** 用户全局位置 `~/.qwen/channels/memory/`。Agent 通过 `save_memory` 意图追加；引导读取复用 `instructedSessions` 门控。                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | 人类身份模型 + 审计持久性。                                                       | **已解决 — `senderName` 仅为建议性；`clientId` 保持为唯一安全主体。** 尽力而为的归属随执行轮次携带（Fix #7）；**内存中 FIFO 512 审计环 + 仅追加的 `~/.qwen` 后续文件**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | 非环回 daemon 支持部署的 token 加固。                                    | **已解决 — 任何非环回 daemon 支持部署都需要 `--require-auth` + token。** 仅环回是仅限开发的；`--require-auth` 是文档记录的默认姿态（`run-qwen-serve.ts` 已强制执行非环回时的 token）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **未解决（唯一剩余）** | OD-7 下低置信度的钉钉 API 细节。                                                | **仍未解决 — 在编码前需在控制台/实时文档中验证：** (1) “主动发送群消息”的确切权限点代码/显示名称（低）；(2) 将标准非酷应用机器人的回调 `conversationId` 与 `openConversationId` 等同的权威官方句子（中；文档保证的路径是 `chatId→openConversationId` 转换 API）；(3) “20条消息/分钟 → 约10分钟节流”限制是否逐字适用于 `groupMessages/send`（低/中——针对自定义 webhook 机器人有文档记录，但在 orgapp 发送页面上未确认）。                                                                                                                                                                                                                                                            |
---

## 10. 风险与缓解措施

参见 §8 中的汇总表。按优先级排序的核心风险如下：

1. **R1 — Phase-0 通道路径上的自动批准。** 在承诺的 Phase-1 守护进程迁移引入中介传输之前，驻留在通道中的 agent 会不受限制地运行_任何_工具。这是最关键的安全漏洞；在 Phase 1 之前，需通过保守的工具集 + 受信任的主机来缓解。
2. **R12 — 主动重叠抛出。** 在人类回合期间调用 `DaemonChannelBridge.prompt()` 会抛出 `Prompt already in flight` (`:257-261`)。通过 `sessionQueues` 进行串行化来修复（Fix #1）——这是 §6.2 的核心内容。
3. **R11 — 钉钉 token 过期。** 即“演示时正常，2 小时后失效”的故障。主动功能在任何长生命周期功能发布前，需自带一个 `tokenManager`（已验证 v1.0 端点，约 7200 秒 TTL）。
4. **R5 — 钉钉冷群静默失败。** 如果没有经过验证的发送路径，就无法向休眠群进行主动输出；`canColdSend` 必须显式报错而不是静默丢弃。
5. **R3 — 群组中的 `steer` 取消。** 在运行时默认配置下会导致多人意外 DoS；tag profile 中设置了 `followup`。
6. **R13/R14 — 预算误报和归属错误。** 估算仅发出 WARN（Fix #6）；归属信息随执行回合一起传递（Fix #7）。
7. **R8 — 共享内存交叉污染。** 每个通道一个进程是零代码缓解方案；`channel` 作用域是协同部署的解决方案。

每个风险都映射到一个阶段：R1/R3/R4 属于 Phase 0–1，R5/R6/R11/R12 属于 Phase 1，R8/R13/R14 以及审计/预算风险属于 Phase 2。

---

## 11. 附录：文件与符号索引

### Channel base (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`, thread `:53`, single `:55`, user `:58`), 默认作用域 `'user'` (`:25`), `setChannelScope()` (`:40-42`), `resolve()` (`:72-92`), `getTarget()` (`:94`), `persist()`/`restoreSessions()` (`:168-244`), `PersistedEntry` (`:5-9`)。
- `ChannelBase.ts` — `handleInbound()` (`:238-471`), prompt 构建 (`:316-347`), `bridge.prompt()` 调用 (`:425`), 门控 (`:240-252`), `dispatchMode` 解析 (`:353-354`), steer (`:371-379`), collect (`:361-370,445-463`), followup (`:381-383,394-470`), `activePrompts` (`:32-35,356`), `sessionQueues` (`:394,466`), 抽象 `sendMessage()` (`:81`), `registerCommand()` (`:141-143`), 构造函数路由 (`:62-64`), `ChannelBaseOptions` (`:9-22,46`), `/clear`/`/status` (`:147-217`)。
- `AcpBridge.ts` — spawn `--acp` (`:53-70`), `newSession(cwd)` (`:131`), `prompt()` (`:147-180`), 自动批准 `requestPermission` (`:108-118`), `AcpBridgeOptions` (`:17-21`)。
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`), session 工厂选项包 (`:226-241`), `activePrompts` 守卫 / **抛出 `Prompt already in flight`** (`:257-261`), `cancelSession` (`:332`), `respondToPermission` (`:346-374`), 权限事件 (`:557-633`)。
- `GroupGate.ts` — `requireMention` 默认 true (`:49`), 成员资格 (`:42`), @提及门控 (`:51-52`), 回退链 (`:48`), 默认策略 `'disabled'` (`:13`)。
- `SenderGate.ts` — `check()` + 配对 (`:42`)。
- `types.ts` — `GroupConfig` (`:10-13`), `ChannelConfig` (`:27-51`), `approvalMode` (`:36`), `dispatchMode` JSDoc 修正为 `'steer'` (`:42`), `senderName` (`:69`), 新增 `alreadyPrefixed` 字段, `isGroup` (`:75`), `SessionTarget` (`:88-93`)。

### 钉钉 (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — `webhooks` 映射 (`:84`), `sendMessage()` (`:134-170`, 无 webhook 返回 `:137-141`), webhook 缓存 (`:516-517`), `getAccessToken()` (`:172-174`), `emotionApi()` (`:188-207`, robotCode `:184`, openConversationId `:197`, 空 catch 反模式 `:214-216`), media robotCode (`:435`), 入站 `conversationId` (`:506`), 去除 @提及 (`:527-529`), `isMentioned` (`:520`), `senderName` (`:544`), `extractQuotedContext()` (`:272-298`), `chatId` (`:534`), 无 `threadId` (`:541-551`)。
- `proactive.ts` (新增) — `sendGroupMessage()` 调用 `POST /v1.0/robot/groupMessages/send` (`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` JSON 字符串), `tokenManager` (v1.0 `oauth2/accessToken`, 约 7200 秒 TTL, 定时器 + 401 刷新), `chatId→openConversationId` 转换回退。
- `markdown.ts` — `convertTables()` (`:44-80`), `splitChunks()` (`:84-188`), `CHUNK_LIMIT=3800` (`:10`; ≤ 约 5000 字符的 `sampleMarkdown` 限额), `extractTitle()` (`:190-195`), `normalizeDingTalkMarkdown()` (`:198-201`)。
- `media.ts` — `downloadMedia` 请求头 (`:39`), 请求体 `:42`。
- SDK: `client.mjs` gettoken (`:85-87`), 重连 (`:157-163`), event/callback 拆分 (`:14-19,35-37,58-61,241-257`); `constants.d.ts` `sessionWebhookExpiredTime` (`:13`), `robotCode` (`:19`), `TOPIC_CARD` (`:4`)。

### 飞书 (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` 主动发送 (`:622-676`, 端点 `:651`; `canColdSend = true`), `refreshToken()` (`:581-620`), `connect()` 模式 (`:146-176`), `updateCard()` (`:742-792`), 摄入去重 (`:1633-1870`)。
- `markdown.ts` — schema-v2 卡片内容 (`:69-189`), `splitChunks()` (`:198-256`)。

### 核心 (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`, +`'channel'`), `WriteContextFileOptions` (`:83-97`, +`channelKey`), `resolveContextFilePath()` (`:223-240`, +`channel` 分支 + `channelKey` 参数), 每文件互斥锁 (`:48-57,159-162`), 绝对路径守卫 (`:142-146`), `MAX_EXISTING_FILE_BYTES` (`:255`), 替换模式 (`:202-211`)。
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`)。
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`), 每项目哈希路径 (`:1-9`)。
- `Session.ts` — `cronQueue`/`cronProcessing` 字段声明 (`:667-668`), `startCronScheduler()` (`:758`, 根据 OD-8 跳过 tag sessions), `dispose()` cron 清理 (`:790-812`), `#recordPromptTokenCount()` (`:2078-2087`), `setNotificationCallback()` (`:2638-2668`), `isIdle()` (`:777`)。

### Serve / 守护进程 (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — 每个 `SessionEntry` 的 FIFO `promptQueue` (`:232,2855,3082`), `publishWorkspaceEvent` (`:3610,3649-3675`)。
- `eventBus.ts` — `BridgeEvent.data` 自由格式 (`:51`), `originatorClientId` (`:60`), 迟滞阈值 (`:101-103`), 重放环形缓冲区 (`:92`)。
- `permissionMediator.ts` — 四种策略 + 共识法定人数 (`:348,621-637`)。
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`), 闭合条目并集 (`:57-104`), 预期 GET 接口的头部文档 (`:22-25`)。
- `rate-limit.ts` — 每个 `(clientId|ip)` 的令牌桶; `X-Qwen-Client-Id` (`:110`)。
- `auth.ts` — 全局 bearer token (`:259-266`), `createMutationGate` 严格模式 (`:356`)。
- `workspace-memory.ts` — 作用域 `workspace|global` (`:118-125`), 严格认证变更 (`:114`), 每次写入上限 `MAX_MEMORY_CONTENT_BYTES` (`:79`), 固定 `projectRoot` 转发 (`:185-190`)。

### CLI 通道命令 (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`), `AcpBridge` 构造 (`:213,268,356,435`), `setChannelScope` (`:361-362`), `restoreSessions` (`:275,444`), `sessionsPath()` (`:56-58`), `checkDuplicateInstance()` (`:170-179`), 断开连接处理程序 (`:241,403`); Phase 1+ 守护进程附加路径; CLI 层注入 `readChannelMemory`/`writeChannelMemory`。
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`, sessionScope 默认值 `:91-92`, approvalMode `:94`, groupPolicy `:98`), `resolveEnvVars()` (`:6-18`)。
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`), 通道类型 (`:10-14`)。