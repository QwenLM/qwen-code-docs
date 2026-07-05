# Daemon 侧信道协调 — 设计 (A1 / A2 / A4 / A5)

> 目标 `daemon_mode_b_main`（遵循 #4175 分支策略）。作者：秦奇。日期：2026-05-25。修订：2026-05-27（v13 — zombie-gap 文档、reconciliation_failed 契约、availableCommands 规范、§7 原子耦合、§8 有界调用计数）。
> **仅文档 / 设计先行。** A4 已实现并获批（#4539）；A1 已实现（#4546）。
>
> 来源：跨客户端实时同步审计（2026-05-24）+ PR #4484 合并后评审（**A 系列**后续工作）。同一评审中的 bug 修复/清理后续工作将单独发布（PR #4510），**不在本文范围内**。

## 更新日志

### v12 (2026-05-27) — 第九轮评审（helper 签名 + 结构化守卫）

- **`publishModelSwitched` helper 现在接受 `originatorClientId`（关键）。** bridge roundtrip（`bridge.ts:1172`、`:2883`）和 `applyModelServiceId` 都会将 `originatorClientId` 传入每个 `model_switched` 事件。v11 的 `publishModelSwitched(entry, modelId)` 签名遗漏了这一点——迫使实现者要么默默丢弃来源归属，要么绕过该 helper。已修复：签名现在为 `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })`。Bridge roundtrip 和 `applyModelServiceId` 传入解析后的 `originatorClientId`；demux 提升和 reconciliation 纠正则不传。
- **非递归规则现在有了结构化强制执行。** v11 依赖于调用图纪律（契约式——“不要流经 `.finally` hook”）。v12 增加了一个 per-session 的 `reconciliationInFlight: boolean` 标志，在异步读取前设为 `true`，读取后清除。如果 roundtrip-settle 的 `.finally` 触发时该标志已经为 `true`，则记录日志并跳过。这使得非递归成为一个不变量，不受未来重构的影响。
- **可观测性日志格式扩展了 generation 计数器。** 格式现在为 `[reconcile] session=<id> trigger=… baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=…`。将 `published` 重命名为 `baseline`（在失败路径上没有发布 `model_switched`，因此“published”具有误导性）。从可观测性行中移除了非递归说明（由上面的专用段落涵盖——单一维护点）。
- **修正了 fresh-read 不变量的失败模式。** “stale-but-equal”场景是自相矛盾的；替换为精确的双重失败模式：(1) 过期响应匹配 `entry.currentModelId` → 虚假的“converged”（漏掉了真实的分歧）；(2) 过期响应与 `entry.currentModelId` 分歧 → 虚假的“corrective”覆盖了更新的值。
- **记录了失败路径上的消费者事件顺序。** 在失败路径上，消费者可能会看到 `model_switch_failed` → `model_switched(A)`（实际应用的超时模型）。§2.2 注明了此顺序，并建议消费者始终将 `model_switched` 视为权威，无论前面是否有失败事件。
- **扩展了 §8 测试计划：** (1) 非递归规则：断言每次 reconciliation 恰好调用一次 `getSessionContextStatus`，纠正后不再调度第二个 `.finally`；(2) 失败路径 converged 场景（agent 未应用超时模型 → `action=converged`）；(3) 针对 `gen_before`/`gen_after` 值的 generation-skip 正确性断言。
- **§2.2 reconciliation 结果：术语对齐** — `_converged_` 要点使用 `entry.currentModelId`（总线的当前模型），与 v11 契约语言保持一致。

### v11 (2026-05-27) — 第八轮评审（reconciliation 契约强化）

- **澄清了失败路径 reconciliation 基线（关键）。** 在失败路径（`model_switch_failed`）上，没有发布 `model_switched` —— 总线和 `entry.currentModelId` 都保留 **roundtrip 前**的值。Reconciliation 将权威读取与 `entry.currentModelId` 进行比较（而不是泛泛地比较“已发布的模型”）。增加了明确的表述 + §8 中的 `_failure-path trigger_` 子场景扩展。
- **`publishModelSwitched` helper —— generation 不变量的强制执行机制（关键）。** 单一的 `publishModelSwitched(entry, modelId)` helper 原子地（在一个同步轮次中）：(1) 更新 `entry.currentModelId`，(2) 递增 `entry.modelPublishGeneration`，(3) 向总线发布 `model_switched`。**所有四个发布点**（bridge roundtrip、`applyModelServiceId`、demux 提升、reconciliation 纠正）都通过它路由。其他代码路径不得直接发布 `model_switched`。测试不变量：在每个代码路径之后，断言 generation 恰好递增 1。
- **记录了 fresh-read 不变量（关键）。** reconciliation 使用的 `getSessionContextStatus` 读取**必须**返回一个新鲜的时间点值 —— 它**必须**绕过任何响应缓存、请求去重或进行中的合并。已添加到 §2.2 契约中。（实际上：`extMethod` 每次调用都是一个全新的 JSON-RPC 调用 —— 目前不存在中间件缓存 —— 但契约现在已明确。）
- **纠正操作不得重新触发 reconciliation（关键）。** reconciliation 纠正是一个本地的 `publishModelSwitched`，并且**不会**调度后续的 reconciliation。实现必须确保纠正路径不会流经 roundtrip-settle 的 `.finally` hook。已添加到 §2.2 可观测性 + 明确的非递归规则中。
- **扩展了 §8 中 generation 断言的测试要点：** 每个 `model_switched` 发布点（包括 reconciliation 纠正）都会更新 `entry.currentModelId` **并**递增 `entry.modelPublishGeneration`；断言每次之后 generation 恰好递增 1。

### v10 (2026-05-27) — 第七轮评审（reconciliation TOCTOU + 重试 + 测试）

- **Reconciliation TOCTOU（关键）→ publish-generation 守卫。** 即使是 v9 的权威读取也存在时间窗口：settle 之后，并发的 in-session `/model C` 可以在异步读取进行中提升 `model_switched(C)`；该读取（较早发出）返回 C 之前的值 B；然后 reconciliation 发出 `model_switched(B)`，覆盖了 C。**修复：** 增加一个 per-session 的 `modelPublishGeneration`，在每次 `model_switched` 发布时递增（bridge / demux 提升 / reconciliation 纠正）。Reconciliation 在异步读取**前**捕获 generation，如果在读取期间 generation 递增了（已有更新的权威发布落地），则**跳过纠正**。Reconciliation 还在成功和失败**两条路径**上触发（roundtrip 的 `.finally`），因为超时/失败情况正是最需要它的时候。
- **读取错误不再是静默终止 → 有界重试 + 事件。** 否则，瞬态的 `getSessionContextStatus` 失败会导致总线永久分歧。增加 1-2 次有界重试（短退避）；如果全部失败，发出 `reconciliation_failed` 总线事件以便客户端警告/拉取，并记录 `action=read-error`。
- **§2.3 发布点枚举现在包含了 reconciliation 纠正**（它必须更新 `entry.currentModelId` + 递增 generation，否则纠正后缓存会与总线分歧）。
- **修正了 §8 过期测试** —— 它与 v9 矛盾（它期望当 cache=B 时基于值丢弃 A，但 v9 的去重只丢弃_等值_重复）。替换为：(1) 冗余重复丢弃（当 cache 已经是 A 时的 `current_model_update(A)`），(2) 由 reconciliation 处理的超时竞争（A≠B 提升，reconciliation 收敛）。外加一个 reconciliation-skips-on-newer-promotion 测试。
- **提升了 §10 Q3：** 将 in-session `/model` 路由通过 `modelChangeQueue`（在源头序列化）是无竞争的长期设计；suppress/dedup/reconcile 堆栈是直到那时的过渡方案。

### v9 (2026-05-27) — reconciliation/过期机制修复（在规划 A1 强化时发现）

- **v8 的“reconciliation 读取 §2.3 缓存”是不够的。** 缓存仅在发布点更新，但 demux 丢弃的并发 in-session 更改（suppress 窗口）永远不会被发布 —— 因此缓存无法观察到它。Reconciliation 读取缓存会看到 bridge 刚发布的值，判断为“无分歧”，从而未能纠正 → 这正是它存在以防止的永久分歧 bug。
- **修复（§2.2）：reconciliation 执行权威的 post-settle 读取。** 在 bridge model roundtrip settle 之后，bridge 通过 `getSessionContextStatus`（`bridge.ts:2784`，异步 `extMethod`）读取 agent 的**真实**当前模型，如果与它发布的值不同，则发出纠正性的 `model_switched`。这是以 agent 为唯一事实来源的兜底机制。它是异步的，但在 **post-settle（不在 demux 中）** 运行，因此 §5 的同步块契约不适用 —— 该约束仅针对 snapshot/过期读取路径。
- **过期检查（§2 第 4 项）重新定义为尽力而为 + reconciliation 作为权威兜底。** 仅靠值比较无法区分过期的迟到通知和切换到相同 id 的新通知（分布式排序问题）。因此，demux 仅丢弃明确的情况（`currentModelId` 已经等于 `entry.currentModelId` 的 `current_model_update` —— 冗余重复）；超时竞争（超时的早期更改始终对应于已 settle 的 bridge roundtrip）由 §2.2 reconciliation 权威地捕获。不需要 agent 端的序列计数器。
- **缩小了 §2.3 缓存的角色：** 作为 **A5 snapshot** 和尽力而为的 demux 去重的同步来源 —— **不是** reconciliation 的唯一事实来源（那是权威读取）。缓存对 A5 保持正确，因为在 reconciliation 之后，最后发布的值**就是** agent 的事实。

### v8 (2026-05-26) — 第六轮评审（A5 的 1 个关键问题 + 建议）

- **Bridge 状态缓存（§2.3，新增）—— 统一机制。** 过期检查（§2 第 4 项）、§2.2 reconciliation **和** A5 的同步 snapshot 契约都需要“agent 的当前 model/mode”，但 bridge 没有同步访问器（只有异步的 `extMethod` 状态读取，这会重新引入竞争）。将 `currentModelId` / `currentApprovalMode` / `availableCommands` 添加到 `SessionEntry`，在**每个发布点同步更新**（`bridge.ts:2883`/`:1172` 的 `model_switched`、`:2979` 的 `approval_mode_changed`、demux 提升），并从 `createSession`/`loadSession` ACP 响应中播种。所有三种机制现在都读取这些同步字段 —— 通过构造满足 §5 的单同步块契约。
- **这也移除了 A2 `previousModeId` ACP schema 问题：** ACP 的 `CurrentModeUpdate` 只有 `currentModeId`（没有 `previousModeId` 字段 —— 与 v7 在 A1 中遇到的外部联合约束相同）。Bridge 不再需要 agent 发送 `previous`：它从缓存的 `entry.currentApprovalMode`（此更改**之前**的值）派生。A1 同理。因此，这两个通知都不携带 `previous*` 字段。
- **§1.1 第 2 项去过期** —— 拆分为 2a（A1 `extNotification`）/ 2b（A2 `sessionUpdate`）；v7 修正了 §2/§2.1/§6/§7，但漏掉了 §1.1。
- **§2.1：`scope` 折叠到提升的 `approval_mode_changed` payload 中**（`{sessionId, previous, next, persisted, scope}`）；澄清了它与 `persisted` 的关系。
- **§2.2 reconciliation 可观测性** —— `[reconcile] session=… published=… actual=… action=corrected|converged|read-error` + 明确的读取错误处理。
- **固定了 `extNotification` 方法名**为 `qwen/notify/session/model-update`（匹配 #4546）+ 注明 early-return 守卫必须变为 dispatch。
- **强制执行移除双重发送** —— 在站点处添加 `TODO(dual-emit-removal)` + §7 中的跟踪 issue。
- 修复了 §0（“两个 demux 插入点”）、§3.4→§3 第 4 点的交叉引用，并扩展了 §8，增加了 staleness-drop / reconciliation-corrective / cross-axis-non-suppression / dual-emit / extNotification-transport 场景。

### v7 (2026-05-26) — 实现启动可行性修正（A1 传输）

- **A1 不能使用 `current_model_update` sessionUpdate —— 该类型在 ACP 中不存在。** 在实现启动时验证：`SessionUpdate` 是外部的 `@agentclientprotocol/sdk` 类型；`acp.d.ts` 定义了 `current_mode_update`（2 处匹配），但**没有 `current_model_update`**（0 处匹配）。你不能向外部规范的联合类型中添加变体。v1-v6 的“添加 `current_model_update` sessionUpdate”（以及 §2 中为了对称性而_拒绝_ `extNotification` 的“替代方案”）是错误的。
- **修正了 A1 传输：agent 通过 `BridgeClient.extNotification()` 发出 in-session model 更改**（`bridgeClient.ts:491`，目前用于 MCP guardrails 的现有 agent→bridge 侧信道）—— **不是** sessionUpdate。因此，A1 demux 位于 **`extNotification()`** 中，而 A2 的 `current_mode_update`（真实的 ACP sessionUpdate）在 **`sessionUpdate()`** 中 demux。A1 和 A2 使用不同的传输 + 插入点 —— 一种新的不对称性，现已记录。
- 对设计其余部分的净影响：demux 规则（payload 映射、按类型 suppress、过期检查、suppress 时丢弃、可观测性）在精神上保持不变；只有 A1 的插入点从 `sessionUpdate()` 移动到 `extNotification()`，并且 A1 不需要 ACP 规范更改。
- **这就是为什么设计先行很重要：** 阻碍因素在 A1 实现的第一行就浮出水面；在文档中翻转传输方式成本很低，而强制转换到外部 `SessionUpdate` 联合类型将会是一个潜在的类型谎言。
### v6 (2026-05-26) — 第五轮评审 (wenshao 2×Critical + 4×Suggestion)

- **Timeout-race + intervening change (Critical)：** 当有变更 B 介入时，“后发生的事件具有权威性”是错误的——一个过期的、晚到的 `current_model_update(A)` 会在 `model_switched(B)` 之后被提升。已替换为**过期检查 (staleness check)**：demux 仅在 `current_model_update` 的 `currentModelId` 等于提升时 agent 的实际当前 model 时才提升它；过期的通知会被丢弃。§2 item 4 / §2.1。
- **`previousModeId` 设为必填 (Critical)：** SDK normalizer `normalizeApprovalModeChanged` (`normalizer.ts:754`) 需要 `previous`，否则会以 `fallbackDebug` 丢弃该事件。可选的 `previousModeId` 会默默吞掉 in-session 的 approval-mode 变更。§3。
- **Suppress 现在按 change-type 划分，而非 per-session：** model roundtrip 不能 suppress in-session 的 `current_mode_update`（反之亦然）。§2.1。
- **`current_model_update` payload：** 移除了未定义的 `authType?`（死数据——`model_switched` 是 `{sessionId,modelId}`）；`previousModelId` 保持可选（`model_switched` normalizer 只需要 `modelId`）。§2。
- 修复了两处文本/交叉引用错误，将本应是 `current_model_update` (A1) 的地方误写成了 `current_mode_update` (A2)。§2 wire/compat, §6。

### v5 (2026-05-26) — 第四轮评审 (wenshao 2×Critical + 8×Suggestion)

- **Concurrent-in-session-`/model` drift (Critical) → reconciliation rule。** Drop-when-suppressed 可能会丢弃在 bridge `setSessionModel(A)` roundtrip 期间触发的 in-session `/model B`（in-session `/model` 绕过了 `modelChangeQueue`），导致 bus 停留在 A 而 session 运行 B。新增 §2.2：在 roundtrip settle 时，bridge 进行 **reconciles**——重新读取 agent 的当前 model，如果与其发布的内容存在分歧，则发出一个修正性的 `model_switched`。
- **IDE-companion lockstep (Critical) → one-release dual-emit transition。** Promotion 无法原子化翻转（daemon 与 Marketplace 发布渠道），且上游 dispatch (`daemonIdeConnection.ts`, `DaemonChannelBridge.ts`) 会在未知事件类型到达 handler 前将其丢弃。新增 **dual-emit transition window**（在一个 release 中同时发布通用的 `session_update` 和提升后的命名事件），并列举了受影响的上游 dispatch 站点 (§2.1, §6)。
- **指定 `model_switched` payload 映射**——`currentModelId → modelId`，envelope `sessionId → data.sessionId`；否则 SDK validator (`events.ts:1910`，要求非空 `modelId`) 会丢弃所有提升的事件 (A1 non-functional)。§2.1。
- **要求 Demux 可观测性**——在每个决策点（promoted / dropped / suppressed / generic）输出结构化日志。§2.1。
- **`replay_complete` 修正**——它**确实**存在 (`eventBus.ts:444`，由已合并的 #4484 发布)；评审者的“零匹配”是基于过时的代码树。A5 phase 2 依赖于新的 `session_snapshot` frame，而不是引入 `replay_complete`。§5/§7。
- **First-attach 不再合成 `replay_complete{0}`**（这会扩大现有“replaying→live”消费者对该事件的契约）——snapshot 在 first-attach 时是自定界的。§5。
- **收紧 Capture-at-emission**——snapshot 字段读取 + publish **必须**是一个同步块（中间不能有 `await`），否则 stale-overwrite 窗口会重新打开。§5。
- **Helper migration model + Q3 已解决**（保留 extMethod bypass——§1.1 成立）；新增 A4 区分测试（已在 #4539 中完成）。§3, §8, §9。

### v4 (2026-05-26) — 第三轮评审 (wenshao 2×Critical + 9×Suggestion, Copilot 5×)

- **修正 Demux 插入点**——通用的 `sessionUpdate → session_update` 转发位于 `packages/acp-bridge/src/bridgeClient.ts:397` (`BridgeClient.sessionUpdate()`)，**而不是** `bridge.ts:352`（那是 prompt-echo）。§2.1 的 demux hook 位于 `bridgeClient.ts`。新增**第三条 demux 规则**：被 in-flight roundtrip 阻塞的 promotion 会被**丢弃**，而不是作为通用的 `session_update` 发布（否则 bridge 的权威事件 + 通用包装器会产生双重信号）。
- **`approvalModeQueue` 尚不存在**——它将在 PR #4510 中发布。A2 的 suppress 窗口依赖于 per-session 的 in-flight tracker，因此 A2 现在被标记为 **#4510 的硬前置条件** (§3, §7)，而不是软性的“协调”。
- **A2 HTTP 路径不发出 agent notification**（它通过 extMethod 绕过 `Session.setMode`）→ bridge 是那里的**唯一**发射器；“suppress-during-roundtrip”仅适用于 **model** 路径。§1.1 / §9 已修正。
- **Step-2 demux 仅覆盖 `current_model_update`。** `current_mode_update` 的 promotion 推迟到 step 3（需要 `previousModeId`）；在此之前，它继续作为通用的 `session_update` 流动（无回退）。
- **修复 A5 snapshot stale-overwrite**——在 emission time（`replay_complete` 之后）捕获 snapshot，而不是在 subscribe time，这样在 replay 期间传递的 live delta 就不会被过期的 snapshot 覆盖。定义了 first-attach 顺序。
- **并非“处处增量”**——提升 `current_mode_update` 是一个 lockstep 变更；`packages/vscode-ide-companion/.../qwenSessionUpdateHandler.ts:177` 是一个明确受影响的消费者。
- **指定 `previousModeId` 捕获点**；详细说明 helper-generalization；修正 persist-scope 描述 (`getPersistScopeForModelSelection` → workspace 或 user)；完成 security 枚举 (`resolveTrustedClientId`)；修复 test plan + anchors。

### v3 (2026-05-26) — 第二轮

重构为 bridge-authoritative 模型 (§1.1，而非 single-emitter)；A1 三个发布站点 + `model_switch_failed` carve-out + timeout-race；明确的 A1 workspace-mirror 决策；`previousModeId`；A4 暴露两个 SDK 字段；A5 snapshot 在 `replay_complete` 之后；扩展测试。

### v2 (2026-05-26) — 第一轮

A1/A2 不对称；§2.1 demux 契约；§9 表格；移除 A5 `pendingPermissionIds`；anchor 规范；`voterClientId` 可选。

---

## 0. 范围与非目标

存在四个 side-channel 状态协调缺口，即某条路径上的 session-state 变更对其他已连接的客户端（或对等 session）不可见：

| #      | 一句话描述                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | In-session model 切换 (`/model`, plan-mode) 永远不会到达 bus。                                                                                        |
| **A2** | In-session approval-mode 变更 (`setMode`) 不发出事件；HTTP 路径使用不同的 agent 入口点；workspace 与 persist 的可见性不明确。      |
| **A4** | `permission_resolved.originatorClientId` 携带的是 _voter_，而 `permission_request.originatorClientId` 携带的是 _prompt originator_——存在歧义。    |
| **A5** | 通过 `Last-Event-ID` 连接的客户端会获得 ring replay + live tail，但没有当前 model / approval-mode / commands 的 snapshot；它必须发起额外的 pull。 |

非目标：多模态 user-content echo (PR #4353 §D)、A3 race 修复 (PR #4510)、clientId 防伪造 (A6)、streamable-HTTP 传输 (#4472)。

**Anchor 约定：** 完整的 repo-root 路径。

- **`packages/acp-bridge/src/bridgeClient.ts`** —— ACP→bus 客户端；`sessionUpdate()` 和 `extNotification()` 将 agent 通知转发到 EventBus（**两个** demux 插入点——A2 在 `sessionUpdate()` 中，A1 在 `extNotification()` 中；参见 §2.1）。
- **`packages/acp-bridge/src/bridge.ts`** —— 3923 行的编排器（HTTP 控制方法、发布站点）。`packages/cli/src/serve/httpAcpBridge.ts` 是一个 101 行的 re-export shim——不是 anchor 目标。
- **`packages/acp-bridge/src/permissionMediator.ts`** —— permission 投票/解析。
- **`packages/cli/src/acp-integration/acpAgent.ts`** / **`.../session/Session.ts`** —— agent + session。

---

## 1. 背景 —— side-channel 协调不变量

daemon 广播 _transcript_ deltas 和由 HTTP 路由发起的 _control_ 变更 (`model_switched`, `approval_mode_changed`)。缺口在于：**同一个逻辑变更有两条入口路径，且只有 HTTP 路径会广播** slash/plan-mode 变更。

今天已存在 `current_mode_update` (`Session.ts:1645`；helper `sendCurrentModeUpdateNotification` 位于 `Session.ts:1625`)，但它仅连接到 tool-confirmation 路径——`exit_plan_mode` (`Session.ts:2160`) 和 edit-tool `ProceedAlways` (`Session.ts:2168`)——而不是通用的 `Session.setMode`/`setModel`。不存在 `current_model_update` 类型。目前两者都通过 `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`) 作为**通用的 `session_update`** 流向 bus，没有 sub-type demux。

### 1.1 协调模型（核心决策）

v1 的“agent 是唯一发射器；bridge 丢弃其发布”被**拒绝**——bridge 拥有序列化 (`modelChangeQueue`)、超时处理、`model_switch_failed` 以及 persist/workspace 区分。采用的模型：

1. **bridge 仍然是其驱动的变更的权威发射器**（HTTP `setSessionModel`/`setSessionApprovalMode`，attach-time `applyModelServiceId`）——序列化/超时/失败/persist 逻辑不变。
2. **绕过 bridge 的 in-session 变更**获得一个新的 agent notification，由 bridge 进行 demux (§2.1)，通过**不同的传输方式** (v7)：
   - **2a. A1 (model)：** `Session.setModel` 通过 agent→bridge **`extNotification`** side-channel 发出 `current_model_update`（**不是** `sessionUpdate`——该 ACP union 没有 model 变体）。`BridgeClient.extNotification()` 对其进行 demux → `model_switched`。
   - **2b. A2 (approval-mode)：** `Session.setMode` 将 `current_mode_update` 作为真实的 ACP **`sessionUpdate`** 发出。`BridgeClient.sessionUpdate()` 对其进行 demux → `approval_mode_changed`。
3. **Suppress-during-roundtrip —— 仅限 model 路径。** HTTP **model** 路径流经 `Session.setModel` (`acpAgent.ts:935`)，因此除了 bridge 发布外，agent notification **也会**在那里触发；当 bridge model roundtrip 处于 in-flight 状态时，demux 会 suppress promotion。HTTP **approval-mode** 路径**不**流经 `Session.setMode`（它使用 extMethod，`acpAgent.ts:2228`），因此那里根本不会触发 agent notification——bridge 是唯一的发射器，没有什么需要 suppress 的。Suppress 仅对 model 路径有意义。

---

## 2. A1 —— bus 上的 in-session model 切换

### 问题

`Session.setModel` (`Session.ts:1580`) → `config.switchModel()` (`:1601`)，没有 `sessionUpdate`。`model_switched` 从三个 bridge 侧站点发布：`bridge.ts:2883` (`setSessionModel`)、`bridge.ts:1172` (`applyModelServiceId`)，而 in-session 没有——这就是缺口。

### 提议的设计

1. **传输方式：`extNotification`，而非 sessionUpdate (v7)。** `current_model_update` **不是** ACP `SessionUpdate` 变体。因此，`Session.setModel` 在 `switchModel` resolve 后（**仅限成功**），通过 agent→bridge **`extNotification`** side-channel 发出，使用**完全限定方法名 `qwen/notify/session/model-update`**（匹配现有的 `qwen/notify/session/*` 约定；实现在 #4546 中），payload 为 `{ v:1, sessionId, currentModelId }`。没有 `previousModelId` / `authType`（bridge 从其状态缓存派生 `previous` §2.3；`model_switched` 是 `{sessionId,modelId}`）。**实现说明：** `BridgeClient.extNotification()` 当前的 early-return guard (`if (method !== 'qwen/notify/session/mcp-budget-event') return;`) 必须改为 method dispatch，以便能够访问 model-update handler（已在 #4546 中完成）。
2. **`BridgeClient.extNotification()` (`bridgeClient.ts:491`) demux** `current_model_update` 通知 → `model_switched` (§2.1)，**仅当**该 session 没有 bridge model roundtrip 处于 in-flight 状态时。（A2 的 `current_mode_update` 保持为真实的 sessionUpdate，在 `sessionUpdate()` 中 demux——参见 §2.1。）
3. **`model_switch_failed` 保持为 bridge-only** —— `Session.setModel` 抛出异常但不发通知；bridge 继续在两个失败路径上发布它。
4. **Timeout-race（尽力 demux 丢弃 + 权威 reconciliation 兜底 —— v9）。** bridge 的 `withTimeout` (`bridge.ts:2844-2849`) 可能会 reject（发布 `model_switch_failed(A)`），而 A 的 ACP 调用仍在运行（FIXME `bridge.ts:2836-2840`）。如果随后变更 B 成功 (`model_switched(B)`) 且 A 的调用最终完成，A 晚到的 `current_model_update(A)` 绝不能使 A 成为明显的最终状态。**仅靠值比较无法决定**这一点（晚到的过期 `A` 和新鲜切换到 `A` 看起来完全相同——这是一个分布式排序问题）。因此：demux 进行**尽力去重**（丢弃 `currentModelId` 已经等于 `entry.currentModelId` 的 `current_model_update`——一个冗余的 no-op），而**权威的正确性来自 §2.2 reconciliation**：超时的早期变更总是对应于一个 _settled bridge roundtrip_，这会触发 post-settle 权威读取，重新发布 agent 的真实 model。不需要 agent 侧的 sequence counter。
**残留缺陷 — 僵尸往返调用 (v13)。** 对账（reconciliation）覆盖了_第一次_结算（即超时），但如果一个僵尸 ACP 调用在对账已经触发 `action=converged` **之后**才完成，则**不在**覆盖范围内：agent 延迟应用了超时的 model → 发出 `current_model_update(A)` → demux 提升它（没有正在进行的往返调用，也不是重复项）→ bus 静默回退到 A，这与用户成功切换到 B 的事实相矛盾。长期的修复方案是引入 ACP cancel 信号（`bridge.ts:2836-2840` 处现有的 FIXME）。在此之前，这是一个**已知的残留竞态**，仅在非常狭窄的条件下发生：超时触发，对账收敛（agent 尚未应用），用户成功切换到 B，**然后**僵尸调用完成。发生概率很低（要求 agent 耗时超过超时时间 + 对账读取时间 + 后续成功切换的时间），但并非为零。在此记录该问题，而不是声称对账完全消除了超时竞态。

### 2.1 Demux 契约（两个插入点）

demux 有**两个插入点**，因为 A1 和 A2 使用不同的传输方式 (v7)：

- **A1 — `BridgeClient.extNotification()` (`bridgeClient.ts:491`)**：`current_model_update` 通知 → `model_switched`。
- **A2 — `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`)**：`current_mode_update` sessionUpdate → `approval_mode_changed`。该方法目前将每个通知原样发布为 `{ type: 'session_update', data: params }`；demux 就添加在这里。

以下规则适用于子类型到达的任意插入点：

- **提升映射表（Promotion table）：** `current_model_update → model_switched`；`current_mode_update → approval_mode_changed`（会话作用域；延迟到步骤 3，见 §7）。
- **Payload 映射（必须指定两个子类型，否则 SDK 校验会丢弃它们）：**
  - `current_model_update → model_switched`：将 `currentModelId` 映射为 `data.modelId`，并将 envelope/`params.sessionId` 提升为 `data.sessionId`。SDK 校验器要求 `data.modelId` 非空 (`events.ts:1910`)；原样提升（保留 `currentModelId`）会导致校验失败并被静默丢弃 — **A1 将失效**。因此，提升是字段映射，而非简单的重命名。
  - `current_mode_update → approval_mode_changed`：构建完整的 payload `{ sessionId, previous, next, persisted: false, scope: 'session' }`。`next` = 通知中的 `currentModeId`；**`previous` 取自 bridge 状态缓存** `entry.currentApprovalMode`（此次更改之前的值 — §2.3），因此 agent **不**发送 `previousModeId`（ACP `CurrentModeUpdate` 本来就没有这个字段）。会话内更改永远不会持久化到 workspace，因此 `persisted:false`，`scope:'session'`。在 `DaemonApprovalModeChangedData` 上，`scope` 是**附加的**，且与 `persisted` 正交：`scope` 指明事件针对哪个 bus（当前会话 vs 对等会话）；`persisted` 指明是否同时写入了 workspace 设置。bridge 自身的 `persist:true` HTTP 路径会发出 `scope:'workspace', persisted:true` 的镜像事件 (`bridge.ts:3007`)。
- **往返调用期间抑制（Suppress-during-roundtrip，按更改类型而非会话）：** 仅当该会话没有正在进行的 bridge 驱动的 **model** 往返调用时，才提升 `current_model_update`；仅当没有正在进行的 bridge 驱动的 **approval-mode** 往返调用时，才提升 `current_mode_update`。model 往返调用**绝不能**抑制会话内的 `current_mode_update`（反之亦然）— 跨属性抑制会静默丢弃另一维度的更改。
- **尽力去重（Best-effort dedup，针对 model）：** demux 会丢弃 `currentModelId` 已经等于 `entry.currentModelId` (§2.3) 的 `current_model_update` — 这是冗余的无操作。它**不会**尝试通过值来区分陈旧与新鲜（仅靠值是不可能的）；超时/并发竞态的权威兜底机制是 §2.2 对账（§2 第 4 项）。
- **抑制时丢弃（Drop-when-suppressed，第三条规则）：** 当_可提升的_子类型未被提升（被抑制或陈旧）时，**将其完全丢弃** — **不要**回退到发布通用的 `session_update`。bridge 已经在发布权威的命名事件；如果同时发出通用包装器会导致双重信号。（残留的会话内并发漂移由 §2.2 对账处理。）
- **通用包装器抑制（Generic-wrapper suppression）：** 提升后的子类型仅发布命名事件 — **双发过渡窗口期（见下文）除外**。
- **双发过渡（Dual-emit transition，IDE 伴侣插件同步，见 §6）：** 由于 daemon 和 VS Code IDE 伴侣插件通过不同渠道发布，无法原子化切换，`current_mode_update` 提升的**首次**发布将在一个发布周期内**同时**发布提升后的 `approval_mode_changed` 和遗留的通用 `session_update{sessionUpdate:'current_mode_update'}`。IDE 伴侣插件现有的 `case 'current_mode_update'` 继续工作；一旦其 `approval_mode_changed` 处理器发布，下一个版本将取消双发。`current_model_update` 是全新的（没有遗留消费者），因此直接提升，无需双发。**移除是强制的，而非依赖记忆：** 在双发发布点处有一个 `TODO(dual-emit-removal)` 注释引用本节，且 §7 步骤 3 包含一个带有目标版本的跟踪 issue — 因此冗余的通用包装器不会悄然变成永久存在（且不应有新的消费者基于它构建）。
- **可观测性（必需，非可选）：** 在每次 demux 决策时发出结构化日志 — `[demux] session=<id> type=<sub> action=promoted|dropped|suppressed|generic reason=<why>`。目前 `BridgeClient.sessionUpdate()` 没有任何日志；特别是 `dropped` 情况必须可见，以便 oncall 人员区分“agent 未发出”/“demux 丢弃”/“SSE 丢失”。
- **未知子类型：** 保持不变（通用 `session_update`）。

### 2.2 往返调用后对账（会话内并发漂移）

抑制 + 丢弃假设 bridge 往返调用和 agent 描述的是**同一个**更改。这在并发会话内更改的情况下会失效，因为会话内的 `/model` 会**直接**调用 `Session.setModel`，**不会进入 `modelChangeQueue`**：

1. Bridge `setSessionModel(A)` 启动 → 抑制窗口打开。
2. 用户在终端输入 `/model B` → `Session.setModel(B)`（绕过队列）→ agent 发出 `current_model_update(B)`。
3. Demux **丢弃** B（抑制窗口处于打开状态）。
4. Bridge 发布权威的 `model_switched(A)`；**bus 显示 A，会话运行 B — 没有任何东西进行对账。**

**契约 (v9/v10/v11 — 权威读取，代际保护，非递归)：** 对账在 bridge model 往返调用结算时触发 — 在**成功和失败**两条路径上都会触发（往返调用的 `.finally`，因为超时/失败情况正是 bus 最可能发生分歧的时候）。它通过 `getSessionContextStatus` (`bridge.ts:2784`，异步 `extMethod`) 读取 agent **真实的**当前 model，如果它与 bus 的当前 model (`entry.currentModelId` — 在失败路径上，这是**往返调用前**的值，因为 `model_switch_failed` 不会更新缓存) 存在分歧，则通过 `publishModelSwitched` 发出纠正性的 `model_switched`。**为什么不把 §2.3 的缓存当作_真相_：** 缓存仅在发布点更新，因此它无法观察到 demux **丢弃**的并发会话内更改 — 读取它会错误地得出“无分歧”的结论。agent 是唯一的真相来源。读取是异步的，但在**结算后、demux 之外**运行，因此 §5 的同步阻塞约束不适用。（长期方案：将会话内的 `/model` 路由到 `modelChangeQueue` — §10 Q3 — 从而在源头上消除这种竞态。）一旦 `approvalModeQueue` 存在，同样的对账也适用于 A2。

**新鲜读取不变式 (v11/v12)：** 对账使用的 `getSessionContextStatus` 读取**必须**返回来自 agent 进程的新鲜时间点值 — 它**必须**绕过任何响应缓存、请求去重或进行中的合并。如果没有这一点，碰巧匹配 `entry.currentModelId` 的缓存响应会产生虚假的“已收敛”（漏掉了真实的分歧 — agent 可能已经继续执行），而与 `entry.currentModelId` 分歧的缓存响应会产生虚假的“纠正”，将 bus 设置为陈旧值，而不是 agent 真实的当前 model。在实践中：`extMethod` 在每次调用时都是一个全新的 JSON-RPC `requestSessionStatus` 调用 — 目前不存在中间件或传输层缓存。该不变式是契约性的：任何未来的缓存层**必须**豁免对账读取。

**代际保护 (v10 — 关闭读取窗口的 TOCTOU)：** 在结算和异步读取返回之间，并发的会话内 `/model C` 可以提升 `model_switched(C)`；进行中的读取（在 C 之前发出）返回 C 之前的值，对账会覆盖 C。修复方案：每次 `model_switched` 发布（bridge / demux 提升 / 对账纠正）时，都会递增每个会话的 `modelPublishGeneration` — 专门通过 `publishModelSwitched` 辅助函数 (v11) 进行。对账在读取**之前**捕获代际，如果在读取**期间**代际递增了，则**跳过纠正** — 已经有更新的权威发布落地，因此 bus 是最新的。

**`publishModelSwitched` 辅助函数 (v11/v12 — 强制执行机制)：** 一个单一函数 `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })`，原子地（在一个同步轮次中）执行：(1) 设置 `entry.currentModelId = modelId`，(2) 递增 `entry.modelPublishGeneration`，(3) 向 bus 发布 `model_switched`（如果提供则包含 `originatorClientId`）。**所有** `model_switched` 发布点 — bridge 往返调用成功、`applyModelServiceId`、demux 提升、对账纠正 — **必须**通过此辅助函数路由。Bridge 往返调用和 `applyModelServiceId` 传递解析后的 `originatorClientId`；demux 提升和对账纠正不传递（没有单一客户端驱动了更改）。在辅助函数之外，禁止直接调用 `events.publish({type:'model_switched', ...})`。这使得不可能漏掉代际递增或静默丢弃客户端归因，并且测试不变式可以断言：在任何产生 `model_switched` 的代码路径之后，代际恰好递增 1。

**非递归规则 (v11/v12 — 结构化强制执行)：** 对账纠正调用 `publishModelSwitched`（本地 bus 发布），**不会**安排后续的对账。如果实现者将 `publishModelSwitched` 提取到一个也附加了 `.finally` 对账的包装器中，结果将是无限纠正循环（对账 → 读取 → 发布 → 对账 → …）。每次纠正都会递增代际，但每次新的对账都会读取 agent 并可能发现分歧（纠正更新的是 _bus_，而不是 _agent_）。**结构化保护 (v12)：** 在异步读取之前，将每个会话的 `reconciliationInFlight: boolean` 标志设置为 `true`，并在之后清除（在 `.finally` 中）。往返调用结算的 `.finally` 在安排对账之前检查此标志；如果为 `true`，则记录 `[reconcile] session=<id> action=skipped-reentrant` 并返回。这使得非递归在重构下保持不变 — 它无法被调用图重组所破坏。`publishModelSwitched` 辅助函数本身除了 (1)-(3) 项之外没有其他副作用。

**读取错误：有界重试，然后上抛。** 瞬态的 `getSessionContextStatus` 失败不能导致 bus 永久分歧且只留下一行日志。使用短退避重试 1-2 次；如果全部失败，发出 `reconciliation_failed` bus 事件并记录 `action=read-error`。

- **Payload (v13)：** `reconciliation_failed { sessionId: string, error: string, retryCount: number, trigger: 'roundtrip-settled' | 'failed' }`。`error` 用于区分“agent 进程崩溃”和“JSON-RPC 超时”，以改善消费者 UX 和 oncall 诊断。
- **消费者契约：** 建议性 — 客户端**可以**显示瞬态警告，并**可以**触发自己的 `getSessionContextStatus` 拉取以进行自愈。没有强制处理器；在没有消费者的情况下，bus 状态保持为最后发布的状态（陈旧但非终止）。
- **每次尝试的日志：** 每次重试尝试都会发出自己的日志行：`[reconcile] session=<id> attempt=<n>/<max> error=<msg>`，以便 oncall 人员无需最终的聚合事件即可区分瞬态故障和持续故障。
**失败路径下的消费者事件顺序 (v12)。** 在失败路径（超时/错误）中，消费者可能会先观察到 `model_switch_failed`，然后在异步对账（reconciliation）后观察到针对同一个“失败”模型的 `model_switched(A)` —— 这发生在 agent 实际上已经应用了该模型，尽管 bridge 超时的情况下。这是正确的行为：对账修正具有权威性。消费者应当（SHOULD）将 `model_switched` 视为始终具有权威性，无论之前发生了什么失败事件（忽略针对失败模型的任何错误提示）。§8 包含一个断言此完整消费者可见事件顺序的测试。

**可观测性：** `[reconcile] session=<id> trigger=roundtrip-settled|failed baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=corrected|converged|skipped-newer-gen|skipped-reentrant|read-error`。

### 2.3 Bridge 状态缓存（“当前” model/mode/commands 的同步数据源）

过期检查（§2 第 4 项）、§2.2 对账以及 A5 的快照（§5）都需要 session 的**当前** model / approval-mode / commands。bridge 之前没有同步访问器 —— 只有 `getSessionContextStatus`（`bridge.ts:2784` → `requestSessionStatus`，一个异步的 `extMethod` 往返调用），而在那里的 `await` 会重新打开这些机制本已关闭的 TOCTOU 窗口。因此：

- 向 `SessionEntry` 添加：`currentModelId?: string`、`currentApprovalMode?: ApprovalMode`、`availableCommands?: AvailableCommand[]`。
- **在每个发布点同步更新**，在与发布相同的同步轮次中（在读取旧值和写入新值之间没有 `await`）：所有 `model_switched` 发布都通过 §2.2 的 `publishModelSwitched` 辅助函数（该函数原子性地更新 `entry.currentModelId` + 递增 `entry.modelPublishGeneration` + 发布到 bus）；`approval_mode_changed`（`:2979` / `:3007`）更新 `entry.currentApprovalMode`；`availableCommands` 在 `BridgeClient.sessionUpdate()` 接收到 `available_commands_update` 通用 sessionUpdate 时进行更新 —— 处理程序在通用转发发布**之前**同步设置 `entry.availableCommands = payload.commands`。该辅助函数保证没有任何发布点会遗漏缓存或 generation 更新。
- **`availableCommands` 细节 (v13)：** 类型为 `AvailableCommand[]`（与 `status.ts` 匹配）。与 model/mode 不同，此字段**没有命名的提升 bus 事件**，也**没有对账** —— 它是一个被动缓存，通过通用的 `session_update` 路径更新。如果实现者遗漏了该钩子，A5 的快照将提供过期/未定义的 commands 且没有兜底机制。触发路径明确为 `BridgeClient.sessionUpdate()` → 检查 `params.type === 'available_commands_update'` → 更新缓存 → 作为通用 `session_update` 转发。
- 在创建 entry 时（初始 model/mode），在任何更改发生之前，从 `createSession` / `loadSession` ACP 响应中**获取初始值（Seed）**。
- **消费者（同步字段读取）：**
  - **A5 快照（§5）：** 在一个同步块中读取所有三个字段 —— 这是缓存的主要目的。
  - **尽力而为的 demux 去重（§2.1）：** 丢弃 `currentModelId` 已经等于 `entry.currentModelId` 的 `current_model_update`。
  - **`previous` 推导（A1/A2）：** demux 从应用新值_之前_捕获的 `entry.currentApprovalMode` 中填充 `approval_mode_changed.previous` —— 因此 **agent 永远不会发送 `previousModeId` / `previousModelId`**（从而避开了 ACP `CurrentModeUpdate` schema 中没有 `previousModeId` 字段的问题）。
- **不是消费者：§2.2 对账。** 对账需要 agent 的_真实_ model，而缓存无法提供（它永远看不到被丢弃的抑制通知）；对账改用权威的 `getSessionContextStatus` 读取（§2.2，v9）。缓存仅反映_已发布_的内容。

这使得缓存成为快照 + 去重 + `previous` 的一等公民同步数据源，而不会越界进入对账的真实路径。

### Workspace 镜像（明确决策）

`Session.setModel` 默认 `persistDefault:true`（`Session.ts:1610`），并通过 `getPersistScopeForModelSelection(this.settings)`（`Session.ts:1611`）写入 `model.name` —— **对于拥有 `modelProviders` 的可信 workspace 为 workspace 作用域，否则为 user 作用域**。无论如何，**A1 阶段 1 仅执行 session 作用域的广播**；理由：对等 session 会在下次生成时获取持久化的默认值，并且没有像 approval-mode 那样涉及安全的跨 session 门控。持久化 model 的 workspace 镜像是一个明确推迟的后续工作（§10），而非被默默省略。

### 风险

双重广播（通过 §1.1 + 三个 §2.1 规则缓解）；失败事件丢失（第 3 项例外）。测试在 §8 中。

---

## 3. A2 — session 内 approval-mode 更改（非对称；阻塞于 #4510）

### 问题

1. **静默的 session 内更改。** `Session.setMode`（`Session.ts:1561`）→ `config.setApprovalMode()`（`:1573`），无通知。
2. **HTTP 绕过 `Session.setMode`。** `setSessionApprovalMode` 驱动 extMethod `qwen/control/session/approval_mode`（`acpAgent.ts:2200`）→ 直接调用 `config.setApprovalMode()`（`acpAgent.ts:2228`）。仅靠 session 内发出无法覆盖 HTTP，且 HTTP 不发出 agent 通知。
3. **Payload + 持久化。** `approval_mode_changed` 需要 `{previous,next,persisted}`（`bridge.ts:2979` session 作用域，`:3007` workspace 作用域）。`current_mode_update` 仅携带 `currentModeId`；agent 没有 `persist` 概念。
4. **尚无序列化原语。** 目前代码库中**不存在** `approvalModeQueue`；approval-mode HTTP 路径（`bridge.ts:2893-3020`）内联运行 extMethod + 发布，没有 per-session 队列（不同于 model 路径的 `modelChangeQueue`）。因此，在 #4510 落地之前，抑制/竞态窗口是无限的。

### 提议的设计

**Session 作用域 —— session 内发出；bridge 保持为 HTTP 的唯一发出者：**

1. 从 `Session.setMode` 发出 `current_mode_update`（覆盖 ACP `setSessionMode`、`acpAgent.ts:922` 以及 session 内 `/approval-mode`）。
2. HTTP extMethod 路径保留 **bridge** 的 session 作用域 `approval_mode_changed` 发布（`bridge.ts:2979`），并**不**发出 agent 通知（它绕过了 `Session.setMode`）—— bridge 是唯一的发出者；无需抑制。
3. **`previous` 来自 bridge 状态缓存 —— agent 不发送 `previousModeId`。** SDK 规范化器 `normalizeApprovalModeChanged`（`normalizer.ts:754`）需要 `previous`，因此提升后的 `approval_mode_changed` 必须携带它。但 ACP 的 `CurrentModeUpdate` 只有 `currentModeId`（没有 `previousModeId` 字段 —— 与 v7 在 A1 中遇到的外部联合约束相同；不能向规范类型添加必填字段）。解决方案：**demux 从 `entry.currentApprovalMode`**（此更改之前的缓存值，§2.3）中填充 `previous`，并在同一个同步轮次中将缓存更新为 `currentModeId`。agent 的 `current_mode_update` 保持未修改的 ACP 形状（`{currentModeId}`），而 bridge 始终生成完整的 `{previous,next}` —— 无 SDK 丢弃，无 ACP schema 更改。
4. **辅助函数泛化（指定迁移模型）：** 目前 `sendCurrentModeUpdateNotification`（`Session.ts:1625`）从 `ToolConfirmationOutcome`（仅限 `auto-edit`/`default`/current）派生 `newModeId`。将其泛化为接受显式的 `currentModeId`，以便 `Session.setMode` 可以为任何 `ApprovalMode`（`plan`/`yolo`/`auto`/…）发出。现有的两个工具确认调用者（`Session.ts:2160`、`:2168`）保留其 `ToolConfirmationOutcome` 入口点（该入口点预先计算 `currentModeId` 然后委托）—— 并非一刀切的移除；弃用情况单独跟踪。没有调用者需要计算 `previous`（由 bridge 推导，见第 3 项）。

**Workspace 作用域（持久化）保持仅限 bridge：**

5. 持久化 + workspace 广播（`bridge.ts:3007`）保持为受 bridge 的 `persist` 标志控制的 bridge 级别发布；`persisted:true` 仅出现在 workspace 事件上。添加 `scope: 'session' | 'workspace'` 鉴别器。

### 硬性前提条件（阻塞 A2）

A2 **阻塞于 PR #4510 落地 `approvalModeQueue`**（或等效的 per-session approval-mode 往返调用进行中跟踪器）。没有它，抑制/协调窗口是无限的。具体而言（这防止的分歧）：bridge 启动 `setSessionApprovalMode('default')`；同时 session 内 `/approval-mode yolo` 触发；如果在整个无限窗口内提升都被抑制，`yolo` 通知将被丢弃且永远不会重新触发 → bus 显示 `default` 而实际模式是 `yolo`（涉及安全）。有界的 `approvalModeQueue` 窗口即为缓解措施。

### 双重发出边缘情况

在打开的工具确认对话框期间，`/approval-mode` 可以在几毫秒内触发两次 `current_mode_update`（用户 `setMode` + 工具的 `ProceedAlways` 处理程序）。可接受（会收敛）；可选择在结果模式等于当前模式时跳过发出。已记录，不设门控。

### 风险 / 兼容性

线上协议是增量式的（`current_mode_update` 复用 + `previousModeId` + `scope`），但对于提升后的类型**并非** SDK 增量式（见 §6）。硬性阻塞于 #4510。

---

## 4. A4 — `permission_resolved` 发起者/投票者语义

### 问题

`permission_request.originatorClientId` = 提示发起者。`permission_resolved.originatorClientId` = 投票者 —— `permissionMediator.ts:1125` 处的发出在 `permissionMediator.ts:1135-1137` 的展开中从 `resolverClientId` 标记 `originatorClientId`（投票者的受信任 clientId，O8 F3 之前的兼容性）。消费者必须对 `permission_resolved` 进行特殊处理。

### 提议的设计（线上协议和 SDK 均为增量式）

- **线上协议：** 与 `originatorClientId` 一起发出 `voterClientId`（相同值）。两者均为**可选** —— 无投票者决议（定时器过期、session 关闭、没有 `X-Qwen-Client-Id` 的环回投票者）两者都不携带，与今天一样。
- **SDK 类型化事件：** 同时暴露 `originatorClientId`（不变 —— 无重命名，无破坏）和新的可选 `voterClientId`；旧字段记录为未来大版本的弃用别名。
- 提示发起者仍然可以通过与匹配的 `permission_request` 关联来获取。

### 线上协议 / 兼容性

两层均为增量式 —— 不会破坏消费者。镜像 D4 别名（PR #4510）。

---

## 5. A5 —— 附加时的旁路快照

### 问题

带有 `Last-Event-ID` 的附加（attach）会获得重放 + 实时尾部，但没有当前的旁路快照。今天它拉取 `qwen/status/session/context`（`packages/acp-bridge/src/status.ts:96`）、supported-commands、`POST /load`。

### 提议的设计

通过 `?snapshot=1` 启用；在重放后发出一个合成的 **`session_snapshot`** 帧：

```
session_snapshot { approvalMode, model, availableCommands? }
```

- **`replay_complete` 已存在**（`eventBus.ts:444`，由已合并的 #4484 发布）—— A5 阶段 2 仅引入新的 `session_snapshot` 帧，不引入 `replay_complete`。
- **恢复顺序：replay → `replay_complete` → `session_snapshot`。** 快照是权威的最终结论。
- **在发出时从 §2.3 bridge 状态缓存中捕获，在单个同步块中完成。** 这之所以可行，正是因为 §2.3 将 `entry.currentModelId` / `currentApprovalMode` / `availableCommands` 添加为同步字段（在每次发布时保持最新 + 在 session 创建时获取初始值）。快照读取这三个字段并在一个同步轮次中发布 —— 中间没有 `await`，没有异步的 `extMethod` 状态往返 —— 因此并发变更无法交错。（v3 的“在订阅时（T0）捕获，重放后发出”存在过期覆盖 bug：在重放期间传递的实时 `model_switched` 会被最后应用的 T0 快照覆盖；从实时缓存中在发出时捕获修复了此问题。）如果没有 §2.3，就没有“当前”状态的同步数据源，此契约将无法实现 —— 这正是 v8 的关键问题。
- **首次附加顺序**（无 `Last-Event-ID`）：`replay_complete` 不会被强制推送（未发生重放），且设计**不会**合成 `replay_complete{replayedCount:0}` —— 这样做会扩展现有消费者对该事件的“重放中→实时”契约。相反，`session_snapshot` 在首次附加时是**自定界的**：它作为第一帧发出，在实时尾部之前；消费者将 `session_snapshot` 视为“已建立基线”。（恢复保持上述的 replay → `replay_complete` → snapshot 顺序。）
- **排除 `pendingPermissionIds`**（安全性，见下文）。
- SDK：类型化的 `session.snapshot` 事件为视图状态 reducer 的旁路字段提供初始值，在恢复时最后应用 / 在首次附加时最先应用。
### `?snapshot=1` sub-contract

首次附加：默认关闭，除非指定 `?snapshot=1`。重连：按需启用（最有用）。跨重连切换：合法且幂等（每次订阅相互独立）。原子性：尽力而为——在发射时捕获 + 后续实时增量进行协调；reducer 测试覆盖了竞态突变。

### Security: why no `pendingPermissionIds`

包含 pending ID 会让客户端对其从未收到过上下文的请求进行投票。`respondToSessionPermission` 会验证 session 是否存在、requestId/pending 状态、**clientId 注册情况**（通过 `entry.clientIds` 校验 `resolveTrustedClientId`，`bridge.ts:2271`）以及选项的合法性——但**不会**验证投票者是否观察到了原始的 `permission_request`。因此，攻击者是一个已注册的 session 协作者（已经过 bearer 认证 + clientId 注册），而不是匿名客户端——这比“任何新客户端”的范围要窄，但漏洞是真实存在的：他们可能会批准一个自己毫无上下文了解的破坏性操作。合法需要 pending 权限的客户端会通过 replay 获取它们（完整上下文会随之传递）。丢弃该字段也避免了 snapshot/resolution 竞态问题。

### Wire / compat

增量式，按需启用。旧版 SDK 会将未知 frame 作为 `debug` UI 事件暴露出来（会产生噪音，但不会导致崩溃）——这是保持其按需启用的另一个原因。

### Alternatives

阶段一：仅记录 pull 契约（在 `replay_complete` 之后 pull）；推迟 frame 的实现。

---

## 6. Cross-cutting

- **Bridge 权威模型 (§1.1)**：bridge 拥有其驱动变更的事件；session 内变更会添加一个由 bridge 进行 demux 的通知——A1 通过 `extNotification()` (`bridgeClient.ts:491`)，A2 通过 `sessionUpdate()` (`bridgeClient.ts:397`)；suppress + drop-when-suppressed 防止双重信号。Suppress 仅对 model 路径有意义；HTTP approval-mode 没有 agent 通知。
- **Demux (§2.1) 是硬性前提**；A2 还**被 #4510** (`approvalModeQueue`) **阻塞**。
- **并非所有地方都是增量式的；通过 dual-emit 过渡来处理。** 将 `current_mode_update` 提升为 `approval_mode_changed` 会改变观察到的事件类型。daemon 和 VS Code IDE companion 通过**不同的渠道**发布（CLI 自动更新 vs Marketplace），因此切换不能是原子的。**受影响的消费者链（都必须增加 `approval_mode_changed` 路径）：**
  - `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts:177` (`case 'current_mode_update'`) —— 叶子处理器；
  - 将 daemon 事件路由到它的上游分发——`daemonIdeConnection.ts` 和 `DaemonChannelBridge.ts` 根据 `event.type` 进行 switch，并通过 `default` 丢弃未识别的类型，因此在扩展这些文件之前，即使是更新后的叶子处理器也永远不会收到裸的 `approval_mode_changed`。
  - **缓解措施 (§2.1 dual-emit)：** 首个版本同时发出遗留的通用 `session_update{current_mode_update}` 和提升后的 `approval_mode_changed`；IDE companion 继续在遗留 frame 上工作；一旦其 `approval_mode_changed` 路径发布，下一个版本将移除 dual-emit。A4 (`voterClientId`) 和 A5 (按需启用 frame) **是**增量式的（无需过渡）。
- **Failure 事件保持仅限 bridge** (`model_switch_failed`)。
- **Session 内并发漂移**受 §2.2 往返后 reconciliation 的限制。
- **SDK reducer 更新**（命名方面，为避免 A1/A2 混淆）：A1 引入 **`current_model_update`** → `model.changed`；A2 提升 **`current_mode_update`** → `approval_mode_changed`；A4 添加可选的 `voterClientId`；A5 从 `session.snapshot` 初始化 side-channel 状态。

---

## 7. Sequencing

1. **A4** —— 增量式 wire + SDK 别名。最小且未被阻塞。
2. **A1 —— 通过 `extNotification` 的 `current_model_update`**（作为 #4546 core 发布）—— `Session.setModel` 发出 `extNotification`；`BridgeClient.extNotification()` (`bridgeClient.ts:491`) 中的 demux 将其提升为 `model_switched`。核心路径 + 按类型 suppress + 可观测性已在 #4546 中完成；**§2.3 状态缓存 + 过期检查 + §2.2 reconciliation 是 A1 的后续工作**（它们需要缓存字段）。
   - **2b. §2.3 bridge 状态缓存** —— 将 `currentModelId`/`currentApprovalMode`/`availableCommands` 添加到 `SessionEntry`，在每次 publish 时更新 + 在创建时初始化。这是 A1 过期/reconciliation 后续工作以及 A5 的前提。
   - **2c. 原子耦合：** reconciliation 和 `modelPublishGeneration` 守卫是一个单一的原子交付物；在没有守卫的情况下发布 reconciliation 会导致覆盖回归（在异步 `getSessionContextStatus` 读取期间的并发提升会将过期值写回）。两者必须合入同一个 PR。
3. **A2 —— 被 PR #4510** (`approvalModeQueue`) **阻塞**。添加 `current_mode_update` 提升（`previous` 派生自 §2.3 缓存——wire 上没有 `previousModeId`）、`Session.setMode` 发出、helper 泛化、`scope`、保留的 bridge workspace publish、**dual-emit 过渡** + IDE-companion + 上游分发更新。
   - **3b. 移除 Dual-emit** —— 通过带有目标 release 的 GitHub issue 跟踪；dual-emit 发布点带有引用 §2.1 的 `TODO(dual-emit-removal)`。当下一个 release 移除 dual-emit 时关闭该 issue。
   - **3c. A2 往返后 reconciliation** —— 相同的 §2.2 契约，读取 agent 真实的 approval mode；添加 `approvalModePublishGeneration` 和 `publishApprovalModeChanged` helper。必须与 A2 提升一起合入（与 2c 的理由相同——没有 generation 守卫的 reconciliation 比没有 reconciliation 更糟）。
4. **A5** —— 阶段一 pull-contract 文档；阶段二按需启用 `session_snapshot`（在同步块中 capture-at-emission；在 resume 的 `replay_complete` 之后，在首次附加时作为自定界的首个 frame）。`replay_complete` 已经存在 (#4484)；只有 `session_snapshot` 是新的。

在此设计获批后，每一项都将作为其独立的实现 PR 合入。

---

## 8. Test plan

- **Demux/§1.1：** 提升后的 `current_model_update` 发布 `model_switched` 并 suppress 通用包装器；在 bridge model 往返进行中的通知会被**丢弃**（不进行通用发布，也不提升）；session 内通知**会**被提升；未知的 sub-type 仍为通用。
- **A1：** session 内 `/model` 和 plan-mode 各自准确发布一个 `model_switched`；HTTP `POST /model` 和附加时的 `applyModelServiceId` 各自准确发布一个（无重复）；失败的 `setModel`（session 内 + HTTP）不发出 `model_switched`，HTTP 仍发出 `model_switch_failed`；超时 `model_switch_failed` 之后的 `model_switched` 会被传递（权威最新）。
- **A2：** session 内 `setMode` 发布一个 session 作用域的 `approval_mode_changed{scope:'session',persisted:false}`；HTTP `POST /approval-mode` 发布一个（bridge，唯一发出者，无重复）；非持久化**不**进行 workspace 广播；持久化添加一个 `scope:'workspace',persisted:true` 事件；失败的 `setMode` 不发出任何内容；一旦 `approvalModeQueue` 落地，无界窗口分歧将被防止。
- **A4：** **区分场景** —— 客户端 A 提交 prompt（因此 `permission_request.originatorClientId === A`），**不同**的客户端 B 投出解决票（因此 `permission_resolved.voterClientId === B`），断言两者不同（这是 A4 存在的消歧义目的，而不仅仅是同客户端值）；timer/无 clientId 解决不携带这两个字段；SDK 暴露两者；旧版 daemon 回退通过 `originatorClientId` 暴露投票者。（已在 PR #4539 中完成。）
- **A5：** `?snapshot=1` resume 在 `replay_complete` 之后产生 `session_snapshot`（mode/model/commands，无 pendingPermissionIds）；首次附加产生 `session_snapshot` 作为首个 frame，**没有**合成的 `replay_complete`；不带该标志的附加**不**产生 snapshot；跨重连切换该标志是幂等的；在 replay 期间传递的 `model_switched` **不会**被（发射时、同步捕获的）snapshot 覆盖。
- **尽力而为去重 (§2.1)：** 当 `entry.currentModelId` **已经是 A** 时到达的 `current_model_update(A)` 会被**丢弃**（冗余的 no-op）。当缓存是 B (A≠B) 且没有进行中的往返时，`current_model_update(A)` **会被提升**（demux **不会**根据值区分过期与新鲜——那是 reconciliation 的工作）。_(修正了 v8 场景中错误地期望基于值丢弃的问题。)_
- **Reconciliation (§2.2，权威 + generation 守卫)：**
  - _纠正：_ bridge `setSessionModel(A)` 进行中 → 并发的 session 内 `/model B` 被丢弃 (suppress) → bridge 发布 `model_switched(A)` → 稳定后 `getSessionContextStatus` (mock → B) → 纠正 `model_switched(B)`；总线收敛于 B（并且纠正操作会更新缓存 + generation）。
  - _已收敛：_ 状态读取等于 `entry.currentModelId`（总线的当前 model）→ 无纠正 (`action=converged`)。
  - _generation 跳过 (TOCTOU)：_ 在异步读取期间发生提升 (generation 推进) → reconciliation **跳过**纠正，即使其读取是过期的 (`action=skipped-newer-gen`)。
  - _失败路径触发：_ 超时的往返 (`model_switch_failed`) 仍会触发 reconciliation；比较基线是 `entry.currentModelId`（往返前的值，因为 `model_switch_failed` **不会**更新缓存）；如果 agent 实际应用了超时的 model A（读取返回 A）且 `entry.currentModelId` 仍是旧值 B，reconciliation 通过 `publishModelSwitched` 发出纠正 `model_switched(A)` → 总线收敛于 A。
  - _读取错误：_ 状态读取所有重试均失败 → 发出带有正确 payload 的 `reconciliation_failed { sessionId, error, retryCount, trigger }`；发出每次尝试的日志 (`attempt=1/<max>`, `attempt=2/<max>`)；无纠正。
- **跨轴非 suppress (§2.1)：** 进行中的 bridge **model** 往返**不会** suppress session 内的 `current_mode_update`（它**会**被提升），反之亦然。
- **Bridge 状态缓存 (§2.3)：** 每个 `model_switched` 发布点都通过 `publishModelSwitched` 路由，该函数会更新 `entry.currentModelId` **并**递增 `entry.modelPublishGeneration`；断言每次之后 generation 准确递增 1（包括 reconciliation 纠正）。snapshot/dedup/generation 守卫读取会同步看到最新值；缓存在 session 创建时初始化。
- **Dual-emit 过渡 (§2.1/§6)：** 在窗口期内同时发出 `approval_mode_changed` **和** `session_update{current_mode_update}`；移除后仅发出 `approval_mode_changed`。
- **extNotification 传输 (v7)：** `current_model_update` 通过 `extNotification()`（而非 `sessionUpdate()`）到达并提升为 `model_switched`。
- **兼容迁移 (§2.1)：** 之前将 `current_mode_update` 作为通用 `session_update` 输入的 SDK reducer，一旦其被提升为 `approval_mode_changed`，将达到相同的状态。
- **Helper 回归 (§3 第 4 点)：** 在 helper 泛化后，`exit_plan_mode` 和 `ProceedAlways` 调用者仍能生成正确的 `current_mode_update` payload。
- **双重发出边缘情况 (§3)：** 并发的 `/approval-mode` + `ProceedAlways` 均发出；reducer 收敛。
- **非递归结构守卫 (§2.2)：** 当 reconciliation 进行中时 (`reconciliationInFlight === true`)，会触发 reconciliation 的并发提升会被**跳过** (`action=skipped-reentrant`)；无论结果如何，该标志在进行中的 reconciliation 稳定后重置。此外：在 reconciliation 纠正 `model_switched` 触发后，断言 `getSessionContextStatus` 针对触发稳定事件被调用**恰好一次** —— 纠正发布**不会**重新进入 reconciliation 路径（有界调用次数）。
- **失败路径已收敛 (§2.2)：** `model_switch_failed` 触发 → reconciliation 读取 `getSessionContextStatus` → 返回 `entry.currentModelId`（未更改）→ 不发出纠正 (`action=converged`)；总线状态不变。
- **Generation 计数器值 (§2.3)：** 在 promote → reconciliation → corrective 序列之后，`entry.modelPublishGeneration` 等于 `gen_before + 2`（初始 promote 一次，corrective 一次）；可观测性中记录的 `gen_before`/`gen_after` 与 reconciliation 入口/出口处的计数器值匹配。
## 9. 已确定的决策（emitter 归属）

| 入口                                               | agent 路径                                                                   | 是否通过 `Session.*`？          | session 作用域 emitter                                                            | workspace 发布                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `POST /session/:id/model`                          | `unstable_setSessionModel` (`acpAgent.ts:925`) → `session.setModel` (`:935`) | ✅                            | **bridge** (`bridge.ts:2883`)；agent 通知**在往返过程中被抑制** | n/a                                        |
| 附加 `applyModelServiceId`                       | 相同路径                                                                    | ✅                            | **bridge** (`bridge.ts:1172`)；在往返过程中被抑制                        | n/a                                        |
| session 内 `/model`，plan-mode                     | 直接调用 `Session.setModel`                                                  | ✅                            | **agent** `current_model_update` → demux                                          | n/a（已推迟）                             |
| `POST /session/:id/approval-mode`                  | extMethod (`acpAgent.ts:2200`) → `config.setApprovalMode` (`:2228`)          | ❌ 绕过 `Session.setMode` | **bridge** (`bridge.ts:2979`)；**无 agent 通知**（无需抑制）    | bridge，受 `persist` 门控 (`bridge.ts:3007`) |
| ACP `setSessionMode` / session 内 `/approval-mode` | `acpAgent.ts:922` → `Session.setMode`                                        | ✅                            | **agent** `current_mode_update` → demux                                           | n/a                                        |

在所有路径中，`model_switch_failed` 仅由 bridge 发出。

**已确定：A2 保留 extMethod 绕过（不要将 HTTP approval-mode 路径路由到 `Session.setMode`）。** 这是一个悬而未决的问题；它起着关键支撑作用（如果反转，HTTP 路径将触发 agent 通知，而 §1.1 中的“无 agent 通知，无需抑制”就会变成错误的，从而导致双重发送）。决策：保留绕过——bridge 保持为 HTTP approval-mode 的唯一 emitter，那里不需要抑制逻辑。重新审视它将需要向该路径添加抑制逻辑和 `approvalModeQueue` 依赖，因此它被明确排除在范围之外。

## 10. 未解决的问题

1. **A1 workspace 镜像：** 是发布推迟的 persisted-model workspace 镜像，还是让 model 永久保持 session 作用域？（根据 `getPersistScopeForModelSelection`，Persist 作用域本身是 workspace 或 user 级别。）
2. **A5 默认值：** 对于重连，保持 `?snapshot=1` 为 opt-in 还是 always-on。
3. **Reconciliation 与 serialize-at-source (A1) —— 无竞态目标。** 抑制 + 尽力去重 + 权威 reconciliation + generation-guard 堆栈的存在，仅仅是因为 session 内的 `/model` 绕过了 `modelChangeQueue` 并与 bridge 驱动的变化产生竞态。将 session 内的 model 变更路由到**同一个** `modelChangeQueue`（从而使所有 model 变更按顺序序列化和发布）可以消除抑制/去重/reconcile 机制及其产生的所有 TOCTOU 问题——这是正确的长期设计。它被推迟仅仅是因为它需要 session 内处理器（`Session.setModel` → agent）跨 ACP 边界与 bridge 入口的队列进行协调，这是一个更大的改动。在此之前，v10 堆栈是上述文档中记录的具有残余竞态行为的临时缓解措施。**建议安排 serialize-at-source 重构，而不是无限期地加固 reconciliation。**