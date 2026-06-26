# MCP 运行时热重载设计：基于设置驱动的增量重连（Issue #3696 子任务 3）

> [!note]  
> 子任务 3 的原始范围是 "MCP/LSP" 运行时重连；此 MR 仅提供 **MCP** 部分。LSP 仅保留草图 + 在 C 部分中的 TODO，推迟到后续 MR。

## 背景

Issue #3696 是热重载系统的跟踪 issue。子任务 1（`SettingsWatcher` 文件变更检测）已合并，但 **目前没有任何订阅者**——`gemini.tsx:784` 启动了 watcher，并且 [子任务 1 设计文档](./settings-change-detection.md) 明确将监听器的连接工作交由子任务 2-6 负责。目前，在 `settings.json` 中添加/删除/编辑 MCP 服务器（或安装扩展）需要重启整个会话，导致对话上下文丢失。

此 MR 专注于 **MCP**，提供两项功能：(a) 运行时入口点，将重载的设置推送到活动 `Config` 中；(b) 由 `SettingsWatcher` 驱动的 MCP 增量重连。LSP 运行时重连本属于此子任务，但此处未实现，仅在 C 部分留下 TODO。

**核心观察**：代码中已经存在"通过差异进行重连"的增量协调逻辑（单会话的 `discoverAllMcpToolsIncremental`，共享池的 `runDiscoverAllMcpToolsViaPool`，仅通过 `connectionIdOf` 指纹影响发生变化的服务器）。唯一的差距在于，`Config` 在启动后无法更新其设置快照（`addMcpServers()` 会抛出异常，`config.ts:3200`）。添加该运行时入口点是 **A 部分**；从 watcher 触发它是 **B 部分**——这就是此 MR 的全部内容。两个明确的权衡：重用现有的增量协调逻辑，而不是全量重建的 `restartMcpServers()`（后者会导致 "0 个工具" 的间隙）；并且共享池路径必须添加 `isMcpServerPendingApproval` 审批门以匹配单会话路径（A 部分第 4 项）。有关组件概览，请参阅下面的"架构"；有关逐步流程和详细信息，请参阅"设计"。

---

## 架构

一句话总结：**将已经存在的增量协调逻辑连接到设置文件的变更上**，并在此过程中填补信任边界和 UI 反馈。更改按责任分配到 CLI / Core 包之间，通过 `Config` 方法和一个 UI 事件解耦：

```text
                    CLI 包                                    Core 包
 ┌──────────────────────────────────────────┐       ┌────────────────────────────────────┐
 │ SettingsWatcher  (子任务 1，已合并)          │       │ Config                              │
 │   └─[B 部分] hot-reload.ts                  │ 调用   │   └─[A 部分] reinitializeMcpServers │
 │       何时触发 · 重新计算门控 · 门限          │ ────▶ │       setMcpServers + 增量协调        │
 │                                             │       │         (McpClientManager 池/单会话)  │
 │   └─[D 部分] useMcpApproval · 审批模态框      │ ◀──── │   └─[A 部分④] 池路径待审批门         │
 │       会话中待审批 → 重新提示                  │ 事件  │                                     │
 │   └─[E 部分] /mcp 状态视图                    │       └────────────────────────────────────┘
 │       显示 "因审批跳过" 的原因                  │
 └──────────────────────────────────────────┘
```

- **分层原则**：Core 不能理解 `settings.json` / watcher 的语义。"何时触发"属于 CLI（B 部分），"如何更新 + 协调"属于 Core（A 部分），与子任务 1 保持一致；B 部分是 A 部分的唯一消费者，仅通过 `Config` 方法交互。
- **主路径**：设置变更 → B 部分重建期望列表 + 门控列表，经去抖门限 → 调用 A 部分 → Core 增量协调（包括池路径审批门）→ 发出 `mcp-client-update` 事件刷新状态指示器。
- **审批分支**：如果协调后留下一个门控服务器处于 `pending` 状态，D 部分通过 `McpPendingApprovalChanged` 事件触发审批模态框；跳过原因由 E 部分在 `/mcp` 视图中展示。
- **硬性前提条件**：三个模式键 `mcpServers` / `mcp.allowed` / `mcp.excluded` 必须切换为可热重载，否则 watcher 的"需要重启"抑制门会吞掉仅 MCP 的编辑，导致整个链无效（参见“设计”开头的 ⚠️ 注释）。

| 部分 | 职责                                                                                                                          | 层         | 状态           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------- |
| **A** | `Config` 运行时可更新的 MCP 配置 + 增量协调 + 池路径审批门                                                                     | Core       | 此 MR          |
| **B** | 订阅 watcher，重新计算门控，去抖门限，调用 A 部分                                                                              | CLI        | 此 MR          |
| **C** | LSP 重新初始化                                                                                                                  | Core       | TODO（后续 MR）|
| **D** | 会话中待审批触发审批模态框（并修复遗漏的提示 #6）                                                                              | CLI        | 后续操作       |
| **E** | `/mcp` 显示“因审批跳过”的原因                                                                                                   | CLI        | 后续操作       |
| **F** | 接纳语义：CLI 允许列表是上限，`mcp.allowed: []` = 拒绝所有，工具未找到时解释 _为什么_ 服务器不可用                                | CLI + Core | 后续操作       |

下面的"设计"给出了从磁盘文件到活动连接的逐步数据流，以及每个部分的实现细节。

---

## 设计

下图展示了从"磁盘文件"到"连接生效"的一次设置变更的完整数据流（`[CLI]` = B 部分，`[Core]` = A 部分，`[子任务 1]` = 已合并的 watcher）：

```text
① 用户编辑 .qwen/settings.json（添加/删除/编辑 mcpServers，或 mcp.excluded / mcp.allowed）
       │
       ▼
② [子任务 1] SettingsWatcher 检测到文件变更
       │   · 300ms 去抖：合并连续保存
       │   · 全文件语义差异：仅当内容真正变化时才通知（自身写入/纯格式化 → 不通知）
       ▼
③ [CLI · B 部分] 由 registerMcpHotReload 注册的回调触发（任何设置变更都会到达）
       │
       ├─ a. assembleMcpServers(settings.merged.mcpServers, cwd, topTier)
       │        → 按优先级合并到完整服务器列表 `next`（包括 .mcp.json / --mcp-config / 会话）
       ├─ b. 重新计算连接门控列表 nextGating = { excluded, allowed, pending }
       └─ c. 门限：mcpServersEqual(old, next) AND mcpGatingEqual(old, nextGating) 均为“未变化”
                → 提前返回（忽略主题 / skills 和其他与 MCP 无关的编辑）
       │ （仅当 mcpServers 或 mcp 门控列表发生变化时才继续 ↓）
       ▼
④ [CLI→Core] 先将门控列表推送到 config 中（协调期间发现会读取它们）：
       config.setExcludedMcpServers / setAllowedMcpServers / setPendingMcpServers
       │
       ▼
⑤ [Core · A 部分] config.reinitializeMcpServers(next)
       │   （由“协调进行中”保护锁包裹，避免与 /reload 竞争）
       ├─ a. setMcpServers(next)：替换设置层快照（扩展/运行层不受影响）
       └─ b. discoverAllMcpToolsIncremental：协调风格的增量协调
                · 计算每个服务器的 connectionIdOf 指纹，比较“期望”与“在线”
                · 新增 → 连接；移除 → 断开连接 + 丢弃工具/提示；
                  指纹变化 → 断开连接 + 丢弃旧工具/提示，然后使用新配置重新连接；未变化 → 保留
                · 跳过禁用的 / 待审批的 / 不可信的目录；发出 mcp-client-update
       │
       ▼
⑥ [CLI · B 部分] UI 收尾：mcp-client-update 刷新 MCP 状态指示器；
       （可选）MCP 提示发生变化 → reloadCommands()；设置 needsRefresh（子任务 6）
```

> **触发时机**：`registerMcpHotReload` 仅在启动时运行一次（附加监听器，返回一个取消函数）；它注册的回调在每次设置变更时通过 watcher 触发（即从步骤 ③ 开始）——协调就是在这个时候实际运行的。

> ⚠️ **硬性前提条件：三个 MCP 模式键必须切换为可热重载（步骤 ② 中的隐藏开关）。** watcher 有一个"需要重启"抑制门：如果一次变更涉及的所有键的 `requiresRestart: true`，则 **不发出任何事件**。但 `mcpServers` / `mcp.allowed` / `mcp.excluded` 此前都是 `true`——因此仅 MCP 的编辑永远不会触发回调，B 部分也就无效。此 MR **必须**将这些**三个叶子**键切换为 `false`；父节点 `mcp` 和仅启动时使用的 `mcp.serverCommand` 保持 `true`（匹配使用 `isRestartRequiredKey` 最长前缀匹配 + `flattenSchema`，叶子获胜）。这三个键的 `showInDialog: false`，因此切换不会改变设置对话框的重启提示；影响范围仅限于 watcher 路径。

以下依次描述 A 部分（Core 能力）、B 部分（CLI 连接）、C 部分（LSP，此 MR 中仅 TODO）。

### A 部分 — Core：使 Config 的 MCP 配置在运行时可更新并触发增量协调

**文件：`packages/core/src/config/config.ts`**

1. 添加一个初始化后的设置器，用于更新协调所读取的设置快照：

   ```ts
   /**
    * 运行时（热重载）替换设置层的 MCP 服务器映射。
    * 与 addMcpServers() 不同，它绕过了 `initialized` 保护锁，并且是替换
    * （而非合并），因此删除操作会生效。运行时覆盖层
    * （addRuntimeMcpServer）和扩展贡献不受影响——getMcpServers()
    * 仍然在其之上进行分层。
    */
   setMcpServers(servers: Record<string, MCPServerConfig> | undefined): void {
     this.mcpServers = servers;
   }
   ```

   `getMcpServers()`（`:3128`）已经在 `this.mcpServers` 之上分层了扩展 + `runtimeMcpServers`，因此仅替换设置层对于运行时/扩展条目是安全的。

2. **连接门控列表**：决定每个 MCP 服务器是否可以连接的三个名称列表——`excluded`（阻止）、`allowed`（如果设置，则仅这些连接）、`pending`（门控源，需要用户审批后才能连接）。这些与 `mcpServers`（服务器配置）是分开的：前者控制"**是否**连接"，后者控制"**哪些服务器以及如何连接**"。为这三个列表添加设置器，`getMcpServers()` / 发现逻辑会读取它们：`setExcludedMcpServers()` 已存在（`:3167`）；添加 `setAllowedMcpServers()`（该字段当前是 `readonly`，在 `getMcpServers()` 内部用作过滤器），再加上待审批集合的设置器。

3. 添加一个轻量级的编排方法：先更新配置，然后驱动现有的增量协调，通过一个共享的"协调进行中"保护锁包裹，以便 `/reload`（子任务 5）和 watcher 不会竞争：

   ```ts
   /**
    * 应用新的设置层 MCP 映射并增量协调活动连接
    * （连接新增的，断开已删除的，重启变化的；未变化的保持不变）。
    * 在 initialize() 之前调用是安全的空操作。
    */
   async reinitializeMcpServers(servers: Record<string, MCPServerConfig> | undefined): Promise<void> {
     this.setMcpServers(servers);
     const registry = this.getToolRegistry();
     await registry.getMcpClientManager().discoverAllMcpToolsIncremental(this);
   }
   ```

   `discoverAllMcpToolsIncremental` 已经检查 `isTrustedFolder()`、处理禁用的/SDK 服务器，并发出 `mcp-client-update` 事件以刷新 UI 状态指示器。移除的服务器 → 释放 + 丢弃工具/提示；指纹变化 → 释放 + 重新获取；未变化 → 保留。

4. **在共享池路径中添加待审批检查**（信任边界，此 MR 中强制执行）：单会话路径跳过了待审批的服务器，但当存在共享池时，`discoverAllMcpToolsIncremental` 会委托给 `runDiscoverAllMcpToolsViaPool`，并且**池路径仅跳过禁用的/SDK 的服务器，而不跳过 `isMcpServerPendingApproval`**（大约在 `mcp-client-manager.ts:1461`）。如果没有此修复，在守护进程/共享池模式下，热重载添加/编辑一个门控的 `.mcp.json` / 工作区服务器将在用户审批之前获取到池连接并启动进程，绕过了 #4615 审批门。修复：在池路径中，**在构建 `desiredIds` 之前和获取连接之前**添加 `isMcpServerPendingApproval` 检查，使其接纳语义与单会话路径一致。

### B 部分 — CLI：订阅 SettingsWatcher → MCP 协调

**新文件：`packages/cli/src/config/hot-reload.ts`**，在 `settingsWatcher.startWatching()`（`:785`）之后（在 `gemini.tsx` 中）连接。

```ts
export function registerMcpHotReload(
  watcher: SettingsWatcher,
  settings: LoadedSettings,
  config: Config,
  topTierMcpServers: Record<string, MCPServerConfig> | undefined,
): () => void {
  return watcher.addChangeListener(async (events) => {
    // 完全按照 Config 启动时的方式重建——包括顶层（CLI/会话）源。
    const next = assembleMcpServers(
      settings.merged.mcpServers,
      config.getTargetDir(),
      topTierMcpServers,
    );
    // 重新计算门控列表（excluded/allowed/pending）— [热重载时的设置优先]，
    // 参见下面的"接纳立场"决策；pending 总是根据 #4615 门重新计算。
    const nextGating = {
      excluded: recomputeExcluded(settings, next),
      allowed: recomputeAllowed(settings, next),
      pending: recomputePending(settings, next),
    };
    // 门限：仅当 mcpServers 或 mcp 门控列表发生变化时才进行协调；
    // 如果两者都未变化，则提前返回（忽略主题 / skills 和其他与 MCP 无关的编辑）。
    const serversChanged = !mcpServersEqual(
      config.getSettingsMcpServers(),
      next,
    );
    const gatingChanged = !mcpGatingEqual(config.getMcpGating(), nextGating);
    if (!serversChanged && !gatingChanged) return;
    // 在协调之前将门控列表推送到 config 中（reinitializeMcpServers 内部的发现逻辑会读取它们）。
    config.setExcludedMcpServers(nextGating.excluded);
    config.setAllowedMcpServers(nextGating.allowed);
    config.setPendingMcpServers(nextGating.pending);
    await config.reinitializeMcpServers(next);
    // 通知 UI：MCP 提示发生变化 → reloadCommands()；设置 needsRefresh（子任务 6）。
  });
}
```

> **接纳立场决策（经过深思熟虑）**：热重载使得**当前设置在启动时 `--allowed-mcp-server-names` 边界 _之内_ 获胜**——运行时在 `settings.json` 中编辑 `mcp.allowed` / `mcp.excluded` 会立即生效，但**仅会缩小接纳范围，不会扩大超出启动标志**（有关上限规则和 `mcp.allowed: []` 语义，请参见 F 部分）。如果未传递 `--allowed-mcp-server-names` 标志，则设置完全驱动接纳。**待审批门（#4615）永不让步**：门控服务器必须始终先经过审批（A 部分第 4 项）。
>
> > _历史_：早期版本允许运行时设置编辑将接纳范围扩大到启动标志之外（将标志视为纯粹的名称过滤便利）。对抗性审查指出这是对启动时边界的静默放宽；F 部分（项目 K）将其反转——标志现在是一个不可变的上限。

重用现有辅助函数——**不要**重新实现合并逻辑：

- `assembleMcpServers(settings.mcpServers, cwd, topTierMcpServers)`——
  `packages/cli/src/config/mcpServers.ts:27`（与 `packages/cli/src/config/config.ts:1812` 处的 Config 启动调用匹配）。
- `SettingsWatcher.addChangeListener` 返回一个取消订阅函数（`settingsWatcher.ts:253`）。
- `config.getSettingsMcpServers()`（`:3124`）作为 `mcpServers` 差异的前像；`config.getMcpGating()` 作为门控列表差异的前像（一个小的新 getter，返回 `{ excluded, allowed, pending }`，与 A 部分的设置器配对）。

门限使用两个小的纯函数来缩小触发范围（避免主题 / skills 和其他无关编辑触发冗余协调，与 watcher 自身的语义差异一致），两者都**重用 `fast-deep-equal`**（CLI 包必须将其从传递依赖提升为直接依赖）：

- `mcpServersEqual(a, b)`：对象键顺序无关（消除服务器/字段排序导致的误判），数组顺序敏感（`args` 和其他命令参数顺序有意义）；`undefined` ≡ `{}`。
- `mcpGatingEqual(a, b)`：`excluded` / `allowed` / `pending` 作为**集合**进行比较（先对副本排序）；`undefined` ≡ `[]`。正是这个函数使得"仅编辑 `mcp.excluded` / `mcp.allowed`，而不动 `mcpServers`"仍然会触发协调——弥补了仅对 `mcpServers` 进行差异会遗漏门控变更的缺口。

UI 收尾通过现有的 `mcp-client-update` 事件刷新状态指示器，在需要时设置 `needsRefresh`（子任务 6）。此子任务的最低要求：配置级协调完成 + 现有事件刷新状态。

### C 部分 — LSP 重新初始化（此 MR 中未实现，TODO）

LSP 配置来自 `.lsp.json` + 扩展配置（**不是** `settings.json`），因此**不会由 SettingsWatcher 自动触发**；其运行时重连应由后续的 `/reload` 命令手动驱动（子任务 5）。`NativeLspService`（由 `--experimental-lsp` 门控）已经具有生命周期方法 `discoverAndPrepare` / `start` / `stop`，足以实现一个 `reinitialize()` 原语，通过 `LspClient.reinitialize?()` + `Config.reinitializeLsp()` 暴露给 `/reload`，而无需进行大的更改。

> **TODO（下一个 MR）**：实现 `NativeLspService.reinitialize()` 及其通过 `Config.reinitializeLsp()` 的暴露，并在该 MR 的文档中提供详细设计（包括 `discoverAndPrepare()` 首先调用 `clearServerHandles()`，阻止增量差异，因此 v1 使用停止全部 → 启动全部等）。**此 MR 不包含 LSP 代码更改。**

### D 部分 — 后续操作：热重载触发门控服务器的运行时审批模态框（与 #4615 关联）

> 此部分于 A/B 部分合并后添加，在调试"更改门控服务器的 URL，但它没有重连"时添加。它修复了"热重载将门控服务器标记为待审批，但 UI 不显示审批模态框"的断裂，并顺便修复了由决策逻辑导致的遗漏提示（下面的第 6 个问题）。

#### 背景：审批模态框仅在启动时计算一次

门控源服务器（`project` 的 `.mcp.json` 和 `workspace` 的 `.qwen/settings.json`，参见 `isGatedMcpScope`）的用户审批**绑定到配置哈希**（`mcpApprovals.ts` 的 `getState`：无记录，或记录的哈希与当前配置不同 → `pending`）。因此，如果热重载更改了门控服务器的配置（即使只是 `httpUrl`），其哈希变化会使旧的审批失效，并再次变为 `pending`。

A/B 部分的链**正确地**处理了这一点：`recomputeMcpGating` 将其放入 `pending`，`setPendingMcpServers` 将其推送到发现逻辑，协调跳过它（未连接，状态 `disconnected`）。但是 **UI 没有显示审批模态框**——根本原因是 `useMcpApproval`（驱动审批模态框的钩子）仅在挂载时通过 `useEffect(…, [config])` 计算其队列，并且 `config` 引用在整个会话中是稳定的 → 该效果永远不会重新运行。也就是说：

- Core 将服务器标记为 pending（发现逻辑跳过它） ✓
- UI 的审批队列从不重新计算 → **没有模态框** ✗（用户只看到 `disconnected`，无法进行审批）
两个路径在运行时是**断开的**。

#### 修复：通过事件连接 core→UI，将决策交由 UI 处理

1. **添加事件** `AppEvent.McpPendingApprovalChanged`（`packages/cli/src/utils/events.ts`）。由于
   `appEvents` 处在 CLI 层，`hot-reload.ts` 也在同一层，监听器可以直接 emit，**无需修改 core**。

2. **`hot-reload.ts` 在 reconcile 后 emit**（放在 `await reinitializeMcpServers` 之后，这样
   `config.getMcpServers()` 已经反映了新的映射；无论 reconcile 成功/失败都 emit——处于 pending 状态的服务器仍然需要用户决策）。

3. **`useMcpApproval` 提取 `computePending()`**：在挂载时计算一次（现有行为），**并且**在订阅了
   `McpPendingApprovalChanged` 后重新计算队列 → 非空队列显示模态框。`computePending` 从权威来源（实时服务器映射 + 持久化的审批文件）重新计算，因此已经审批通过/已经拒绝的服务器不会再被提示。

#### 关键设计：基于“严格 pending”驱动 emit，而非名称集合差（issue #6 / A1 决策）

注意这两个谓词是**刻意不同的**，这是本小节的核心：

| 函数                                   | 谓词                                           | 用途                                                    |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------- |
| `getPendingGatedMcpServers`          | `state !== 'approved'`（**包含 rejected**）      | 供给发现阶段：rejected 必须持续被**跳过**                  |
| `getPromptableMcpServers`（新增）      | `state === 'pending'`（**不包含 rejected**）     | 供给模态框：rejected **不再反复提示**                     |

最初的 emit 决策使用“`nextGating.pending` 与上次的名称集合差”来决定是否显示模态框，这导致了遗漏提示（回顾 issue #6）：

- 一个 **rejected** 的服务器仍然在 `pending` 列表中（因为 `!== 'approved'`）；
- 用户随后**重新编辑同一服务器的配置**（hash 变化 → 它确实再次变为 `pending`，应该再次询问），但它的名称“已经在”列表中 → 集合差为空 → **没有事件 → 遗漏提示**。

A1 修复：使用 `getPromptableMcpServers(next, cwd)`（严格 `=== 'pending'`）来决定 emit，将决策的真值交给 `computePending`。效果：

- 拒绝后，**编辑同一服务器的配置**（hash 变化）→ `pending` 再次出现 → **再次提示** ✓（修复 #6）
- 拒绝后，**不相关的**编辑（hash 未变）→ 仍然 `rejected` → 不可提示 → **无提示** ✓
- 已经 `approved` → 无提示；一个新的未决 gated 服务器 → 提示 ✓

#### reject 语义（经 review 确认）

`handleMcpApprovalSelect(REJECT)`：持久化 `rejected`（绑定到当前 hash），**不**调用 `reconnect`，**不**修改 `config.pendingMcpServers` → 发现阶段持续跳过 → 服务器保持 `disconnected`。无需主动拆除旧连接：emit 发生在 `reinitializeMcpServers` 等待之后，因此当模态框出现时 reconcile 已经拆除了它。会话重启后，`computePending` 读取 `rejected` → 不入队，保持断开，行为一致。

#### 数据流补充说明（接续本章概览图中的 ⑥）

```text
⑥' [CLI · Part D] reconcile 后，如果存在严格 pending 的 gated 服务器：
        hot-reload → appEvents.emit(McpPendingApprovalChanged)
        → useMcpApproval.computePending() 重新计算队列 → 显示审批模态框
        → 用户审批通过：approveMcpServerForSession + discoverToolsForServer（用新配置连接）
          用户拒绝：持久化 rejected，保持断开
```

#### 关键文件（Part D）

| 文件                                                | 变更                                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/utils/events.ts`                  | 添加 `AppEvent.McpPendingApprovalChanged`                                                                                                                 |
| `packages/cli/src/config/mcpApprovals.ts`           | 添加 `getPromptableMcpServers()`（严格 `=== 'pending'`，与包含 rejected 的 `getPendingGatedMcpServers` 区分）                                             |
| `packages/cli/src/config/hot-reload.ts`             | reconcile 后，通过 `getPromptableMcpServers` 决策；若非空，则 `appEvents.emit(McpPendingApprovalChanged)`                                                 |
| `packages/cli/src/ui/hooks/useMcpApproval.ts`       | 提取 `computePending()`；挂载时计算一次 + 在事件上重新计算                                                                                               |

#### 验证（Part D）

- `hot-reload.test.ts`：新增 pending 的 gated 服务器 → emit；非 gated 变更 → 无 emit；
  **拒绝→编辑配置 → 再次 emit**（旧名称集合差会得到 0 次，锁定了 #6 回归）；拒绝→不相关编辑 → 无 emit。
- `mcpApprovals.test.ts`：`getPromptableMcpServers` 套件——无决策不提示，rejected 不提示（vs `getPendingGatedMcpServers` 仍跳过），hash 变更后重新提示，approved 不提示。
- `useMcpApproval.test.ts`：会话中间的事件使新的 gated 服务器显示模态框；已经审批通过的不会被再次提示。

#### 已知问题 / 回顾 TODO（此处未处理）

1. **`getTargetDir()` 与 `getWorkingDir()` 键不匹配（风险 B）**：gating 重新计算
   （`recomputeMcpGating` → `getPendingGatedMcpServers`）使用 `config.getTargetDir()` 作为
   projectRoot，而 `useMcpApproval` 读写审批使用 `config.getWorkingDir()`。通常两者相等；一旦它们不一致（自定义 cwd，或符号链接 realpath 差异），审批在 cwd 键下写入，而 gating 在 targetDir 键下查询 → **审批通过后，gating 仍然跳过且从不连接**。这是一个预先存在的问题，不是 Part D 引入的。建议统一到一个根（倾向 `getWorkingDir()`，即审批写入侧），或者先添加一个运行时断言确保它们相等。

### Part E — 后续：在 `/mcp` 中显示 gated 服务器因等待审批而被跳过的原因

> 本节是在 Part D 落地后添加的，当时调试发现在拒绝一个 gated 服务器然后删除并重新完全添加它之后，`/mcp` 显示 `Disconnected` 且没有提示。结论首先：**这不是记录生命周期错误；唯一的缺陷是跳过原因不可见**，因此我们仅增加可见性，不触及审批存储 / reconcile 逻辑。

#### 为什么“不再提示”是按设计

一个审批记录绑定到 **(projectRoot, serverName, hash)**，并且**独立于该服务器当前是否存在于配置中**——没有任何东西会在服务器从配置中消失时删除记录。因此：

- **已批准的持久化在删除/重新添加之间保持一致**：批准 (hash H) → 删除 → 重新完全添加（仍是 hash H）→ `getState` 返回 `approved` → 静默重连。这是有意为之的便利。
- **拒绝匹配已确定的拒绝，在相同的“完全相同重新添加”上是对称且一致的**：当配置 hash 不变时，已确定的拒绝保持生效；使其重新出现的方法是**编辑配置（改变 hash）**（即 Part D 的 `getPromptableMcpServers` 严格 pending 重新提示路径）。

> 因此我们**刻意不引入“移除时忘记记录”**：那会让配置存在变化改变持久化的决策，违反了“决策只能通过 hash 或显式动作改变”的原则，并造成批准/拒绝不对称。

#### 实际缺陷和修复（仅可见性）

`/mcp`（`ServerListStep` / `ServerDetailStep`）之前仅显示一个裸的 `Disconnected`，使得“我拒绝了它 / 等待审批”与“真实的连接失败”无法区分，因此用户不知道恢复路径（编辑配置改变 hash → 重新提示）。修复：向 `MCPServerDisplayInfo` 添加 `approvalState?: 'pending' | 'rejected'`，在 `MCPManagementDialog.fetchServerData` 中使用 `loadMcpApprovals` + `isGatedMcpScope` 计算，键为 **`config.getWorkingDir()`**（非 gated / 批准的留空）；列表 / 详情视图使用已有的 `needsAuth` 覆盖模式，首先显示原因
（`rejected → "已拒绝 — 编辑配置以重新批准"`，`pending → "需要审批"`，黄色警告），并且将这些非错误的审批跳过从页脚“查看错误日志”提示中排除。

> 在此处使用写入侧的 `getWorkingDir()` 正是 Part D 的“已知问题 1（风险 B）”建议的方向——用同一个根来读取和写入审批。`hot-reload.ts` 现有的 gating 查询仍使用 `getTargetDir()`（目前它们相等）；本节不改变其行为。它**不涉及** `mcpApprovals.ts` 存储、`hot-reload.ts` 的删除/重连路径，也不添加任何审批操作。

#### 关键文件（Part E）

| 文件                                                            | 变更                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/mcp/types.ts`                   | `MCPServerDisplayInfo` 增加 `approvalState?: 'pending' \| 'rejected'`                    |
| `packages/cli/src/ui/components/mcp/MCPManagementDialog.tsx`    | `fetchServerData` 计算 `approvalState`，键为 `getWorkingDir()`                           |
| `packages/cli/src/ui/components/mcp/steps/ServerListStep.tsx`   | 渲染审批原因；将审批跳过从页脚“查看错误日志”提示中排除                                   |
| `packages/cli/src/ui/components/mcp/steps/ServerDetailStep.tsx` | 渲染审批原因（与列表一致）                                                                |

#### 验证（Part E）

- `ServerListStep.test.tsx`：gated `rejected` → 显示重新批准提示文本；`pending` → “需要审批”；审批跳过**不**显示“查看错误日志”提示，而真正连接失败的**仍然**显示。
- 手动：拒绝一个工作区服务器 → `/mcp` 显示原因（不是裸 Disconnected）→ 编辑其配置以改变 hash → Part D 模态框重新出现（现有的恢复路径，此处不变）。

### Part F — 后续：准入语义（CLI 上界、全部拒绝、不可用原因）

> 在对 Parts A/B 进行第三次对抗性审查后添加。三个相关的准入改进，因为它们共享“哪些服务器可以连接，以及当某个服务器不能连接时如何解释”的表面。项目按审查线程标记为 K / H / B。

#### K — 启动时 `--allowed-mcp-server-names` 标志是不可变的上界

反转了之前的“设置始终获胜”立场（参见 Part B 注释）。启动时，`loadCliConfig` 使标志优先于 `settings.mcp.allowed`；但热重载重新计算只从设置读取 `allowed`，因此任何设置变更都会静默丢弃启动时的名称限制——这会在会话中放宽操作员为限制哪些本地 MCP 命令可以运行而精确设置的边界。

修复：将**标志值单独**捕获为 `Config` 上的不可变边界（`cliAllowedMcpServerNames` 参数 → `getCliAllowedMcpServerNames()`；与热重载覆盖的可变 `allowedMcpServers` 不同）。然后 `recomputeMcpGating` 将设置衍生的允许列表上限设定为此边界：

- 传递了标志 + 设置有 `mcp.allowed` → **交集**（设置可以在边界内进一步缩小）；
- 传递了标志 + 没有设置 `mcp.allowed` → **标志完整生效**；
- 没有标志 → 设置完全驱动准入（不变）。

因此，运行时编辑只能缩小 MCP 准入范围（低于启动标志），而不能扩大超过它。`mcp.excluded` 仍然在发现阶段进一步缩小，与“只能更严格，不能更宽松”一致。

#### H — `mcp.allowed: []` 是全部拒绝，在启动和热重载中行为一致

启动时，空的允许列表被视为全部拒绝（`getMcpServers()` 在 `allowedMcpServers` 为真值时过滤，而 `[]` 是真值）。热重载重新计算之前将 `[]` 折叠为 `undefined`（“允许所有”）——因此将 `mcp.allowed` 编辑为 `[]` 期望全部拒绝，结果每个服务器仍然可达。修复：`recomputeMcpGating` 保留 `[]`（只有**缺失**的键才会得到 `undefined`），并且 `mcpGatingEqual` 区分 `allowed` 的缺失（允许所有）与 `[]`（全部拒绝）——否则变更会判等并从不清除。`excluded` / `pending` 保持 `undefined ≡ []`（都是“没有条目”）。

#### B — 工具未找到解释 _为什么_ 服务器不可用

`getMcpToolUnavailableMessage` 之前仅区分“此会话已删除”与“未配置”。现在通过准入门控，它使用一个核心 API `Config.getMcpServerUnavailableReason(name)` 对所属服务器进行分类，覆盖所有门控：

| 原因                  | 含义                                         | 消息建议的恢复操作                     |
| --------------------- | -------------------------------------------- | -------------------------------------- |
| `removed`             | 此会话从合并配置中已删除                       | 重新将它添加到设置                     |
| `not_allowed`         | 被 `mcp.allowed` / CLI 边界过滤掉             | 将它添加到 `mcp.allowed`               |
| `excluded`            | 列在 `mcp.excluded` 中                        | 将它从 `mcp.excluded` 中移除           |
| `pending_approval`    | 等待审批的门控服务器（#4615）                  | 批准它（运行 `/mcp`）                  |
| _(none)_              | 已配置且已准入                                 | 真正的“工具未找到”（断开连接 / 重命名） |

两个辅助变更：一个私有方法 `getMergedMcpServers()`（合并**不带**允许列表过滤），以便区分“已配置”与“被过滤掉”；并且移除跟踪现在对整个**独立于门控的合并映射**进行 diff，这意味着被缩小的允许列表过滤的服务器不再被错误报告为 `removed`（现在是 `not_allowed`）。这也允许之前为允许列表缩小修复而添加的 `prevEffectiveServerNames` 快照参数被移除——合并映射的 diff 不受调用者在 reconcile 之前应用的门控设置器的影响。

#### 关键文件（Part F）

| 文件                                                  | 变更                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts` (`loadCliConfig`) | 将 `--allowed-mcp-server-names` 标志值单独传递为 `cliAllowedMcpServerNames`                                                                                                                                                                                                                                                  |
| `packages/core/src/config/config.ts`                  | `cliAllowedMcpServerNames` 字段 + `getCliAllowedMcpServerNames()`（K）；`getMergedMcpServers()`（未过滤） + `getMcpServerNames()`；`McpServerUnavailableReason` + `getMcpServerUnavailableReason()`（B）；移除跟踪对合并映射 diff 且 `reinitializeMcpServers` 移除 `prevEffectiveServerNames` 参数 |
| `packages/cli/src/config/hot-reload.ts`               | `recomputeMcpGating` 将 `allowed` 上限设为启动边界（K）并保留 `[]`（H）；`mcpGatingEqual` 使 `allowed` 的缺失 ≠ `[]`（H）                                                                                                                                                                                          |
| `packages/core/src/core/coreToolScheduler.ts`         | `getMcpToolUnavailableMessage` 根据 `getMcpServerUnavailableReason` 路由（B）                                                                                                                                                                                                                                             |

#### 验证（Part F）

- `hot-reload.test.ts`：**K** — 有启动标志且没有设置允许列表时，完整应用标志；设置允许列被上限为标志（不能扩大）并可以在其内缩小；没有标志时，设置无限制获胜。**H** — `mcp.allowed: []` 作为全部拒绝传递；`mcpGatingEqual` 将 `allowed` 缺失与 `[]` 视为不同（但 `excluded` undefined ≡ `[]`）。
- `config.test.ts`：`getMcpServerUnavailableReason` 为每个门控返回 `not_allowed` / `excluded` / `pending_approval` / `removed`，并为已配置已准入或从未配置的服务器返回 `undefined`。
- `coreToolScheduler.test.ts`：工具未找到消息根据原因命名正确的服务器和恢复操作。

---

## 超出范围（其他子任务）

- **整个 LSP 运行时重连**（`NativeLspService.reinitialize()` + `Config.reinitializeLsp()` + 接线）——推迟到后续 MR，参见 Part C 的 TODO。
- `/reload` 斜杠命令（#5）——调用 `config.reinitializeMcpServers(currentSettings)`（LSP 部分在后续 MR 中其原始类型落地后接线）+ skill/command 重新加载。
- `clearAllCaches()`（#4）和 `needsRefresh` UI 通知（#6）。

## 关键文件

| 文件                                              | 变更                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/config/config.ts`              | `setMcpServers()`, `setAllowedMcpServers()` + pending setter, `getMcpGating()`（返回 `{ excluded, allowed, pending }`）, `reinitializeMcpServers()`（带 reconcile-in-progress 防护）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/core/src/tools/mcp-client-manager.ts`   | ① 在 `removeServer()` 和 `removeRuntimeMcpServer()` 中添加 `removePromptsByServer()`；② 在共享池路径 `runDiscoverAllMcpToolsViaPool`（`:1461`）中，在构建 `desiredIds` / 获取之前添加 `isMcpServerPendingApproval` 检查（匹配单会话准入）；③ **为单会话路径添加指纹差异**：一个新的 `connectionFingerprints` 映射；`discoverAllMcpToolsIncremental` 也会对“已连接但其 `connectionIdOf` 指纹已更改”的服务器触发断开+重连（与池路径的 `desiredIds` 对齐），在每个拆卸路径上清空映射；④ **在重连前清除旧工具/提示**：当 `discoverMcpToolsForServerInternal` 替换现有客户端时，在重新发现之前执行 `removeMcpToolsByServer` + `removePromptsByServer`——因为 `disconnect()` 不接触注册表，而 `discover()` 仅按名称追加/覆盖，否则被配置更改删除/重命名的工具将绑定到已关闭的客户端而残留（并且在发现失败时也会残留），这与 `removeServer` / `addRuntimeMcpServer` 中已有的清理一致 |
| `packages/cli/src/config/settingsSchema.ts`       | **先决条件**：将三个 key `mcpServers`（`:274`）、`mcp.allowed`、`mcp.excluded` 从 `requiresRestart: true` 翻转为 `false`，以便观察者不再抑制仅 MCP 的编辑；父级 `mcp` 和 `mcp.serverCommand` 保持 `true`（参见上面的“硬先决条件”注释）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/cli/src/config/hot-reload.ts` _(新增)_    | `registerMcpHotReload()`：通过 `assembleMcpServers(..., topTierMcpServers)` 重建；根据当前设置重新计算门控列表（参见“准入立场决策”）；通过 `mcpServersEqual` + `mcpGatingEqual`（基于 `fast-deep-equal`）进行门控；防抖 + 合并并重新检查                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/cli/package.json`                       | 将 `fast-deep-equal` 从传递依赖提升为**直接**依赖                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/cli/src/gemini.tsx`                     | 在 `:785` 之后调用 `registerMcpHotReload`；注册清理器                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 测试（与 schema 翻转一同）                         | `settingsSchema.test.ts` 固定三个 MCP key 的 `requiresRestart` 值（包括 `mcp` / `mcp.serverCommand` 保持 `true`）；`settingsWatcher.test.ts` 添加两个正向回归测试（“仅编辑 `mcpServers` / 仅编辑 `mcp.excluded` → 仍然通知”）；`settingsUtils.test.ts` 使用其**自己的模拟 schema**，与真实翻转无关，无需更改                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
> 该 MR 中 LSP 相关文件（`NativeLspService.ts` / `NativeLspClient.ts` / `lsp/types.ts`）保持不变，请参见 Part C TODO。

## 验证

### A. 核心能力单元测试（core，`config.test.ts` / `mcp-client-manager.test.ts`）

1. `setMcpServers` 是一个**替换（而非合并）**操作，并在初始化后生效（不再通过 `initialized` 守卫抛出异常）。
2. `reinitializeMcpServers` 首先调用 `setMcpServers`，然后调用 `discoverAllMcpToolsIncremental`；在 `initialize()` 之前调用是**安全空操作**（不会抛出异常，不会建立连接）。
3. 断言 `removeServer()` / `removeRuntimeMcpServer()` 现在调用 `removePromptsByServer()`（prompt 泄漏回归防护）。复用 `mcp-client-manager.test.ts` 的测试夹具（该文件已导入 `connectionIdOf`）。
   3b. **单会话指纹差异**：mock 客户端始终返回 `getStatus()` 为 `CONNECTED`，运行 `discoverAllMcpToolsIncremental` 三次——首次连接记录指纹；相同配置再次运行**不触发**变动（`connect` 仍为 1 次）；原地修改 `args`（指纹变化）→ 断开并重新连接（`disconnect` 1 次，`connect` 2 次）。确保单会话路径不再将“已连接但配置已更改”视为空操作（与共享池的 `desiredIds` 一致）。同时断言此次运行会为该服务器调用 `removeMcpToolsByServer` + `removePromptsByServer` 后再重新发现——防止“重新连接前未清除旧工具/prompts”，避免配置变更导致工具被删除或重命名后遗留。

### A'. watcher↔schema 集成防护（cli，`settingsSchema.test.ts` / `settingsWatcher.test.ts`）

> 这两个是**高**严重性集成断裂：MCP 独占编辑被 watcher 的“需要重启”抑制门吞掉，导致 Part B 回调永远不会触发。**必须**有真实的 watcher 层覆盖；在 `hot-reload.test.ts` 中直接调用回调无法捕获此问题。

3c. **schema 固定**（`settingsSchema.test.ts`）：`mcpServers` / `mcp.allowed` / `mcp.excluded` 的 `requiresRestart` 为 `false`；父级 `mcp` 和 `mcp.serverCommand` 为 `true`。防止有人将 MCP 键值改回需要重启状态，从而静默地扼杀整个热重载。
3d. **真实的 watcher 不再抑制**（`settingsWatcher.test.ts`，使用真实的 `SettingsWatcher` —— mock 文件系统）：仅编辑 `mcpServers` / 仅编辑 `mcp.excluded` 各触发**一次** `SettingsChangeEvent`（在翻转之前会被抑制）。这是子任务 3 监听器能够触发的端到端回归防护。

### B. 订阅者门控分支单元测试（cli，`hot-reload.test.ts`）

模拟 `SettingsWatcher`，覆盖所有门控分支：

4. **`mcpServers` 变化** → 使用**组装后的** map（包含顶级配置）调用 `reinitializeMcpServers`。
5. **仅编辑 `mcp.excluded`（或 `mcp.allowed` / pending），保持 `mcpServers` 不变** → **仍然**触发 reconcile，并且在 reconcile 之前已调用 `setExcludedMcpServers` / `setAllowedMcpServers` / `setPendingMcpServers`。验证了 `mcpGatingEqual` 分支——修复的缺口：仅比较 `mcpServers` 会错过此变化。
6. **`mcpServers` 和 `mcp` 门控列表均未变化**（例如主题 / skills 编辑）→ **不调用** `reinitializeMcpServers`（验证了当两个门控都“未变化”时的提前返回）。
7. **在 reconcile 进行中有两次变化发生** → 合并并重新检查再执行一次（可重入）。
8. **防抖**：多次连续保存（< 300ms）时 reconcile 只触发**一次**（与 watcher 的 300ms 防抖对齐）。

### C. 门控辅助纯函数单元测试（cli，`hot-reload.test.ts`）

9. `mcpServersEqual`：不同键顺序、相同值 → `true`；嵌套配置字段（`args` / `env` / `headers`）变化 → `false`；`undefined` 与 `{}` 比较 → `true`；添加/删除一个服务器 → `false`；`args` 数组顺序变化 → `false`（命令参数顺序有意义）。
10. `mcpGatingEqual`：三个列表进行“不依赖顺序”比较（`['a','b']` 与 `['b','a']` 比较 → `true`）；任意列表中添加/删除一项 → `false`；`undefined` 与 `[]` 比较 → `true`。

### D. 信任边界边界情况（cli + core）

> 两者都是**高**严重性信任边界点。第 11 项验证准入边界（Part F 第 K 项——设置缩小范围，但绝不超出启动标志）；第 12 项对应 Part A 第 4 项（池路径的 pending 检查）。

11. **热重载准入缩小范围，但绝不超出启动标志**（Part F 第 K 项边界；取代了先前“设置可以放宽”的立场）。启动时使用 `--allowed-mcp-server-names=a,b`；然后设置变化将 `mcp.allowed` 改为 `[a, b, c]`。**断言**：reconcile 后 `c` **仍然被排除**（受启动边界限制），而 `a` 被允许；设置编辑缩小为 `[a]` 生效；没有启动标志时，设置的允许列表无限制地生效。（完整的矩阵请参见 Part F → 验证。）  
   _防护_：`recomputeMcpGating` 将设置的允许列表与 `getCliAllowedMcpServerNames()` 取交集，并且绝不超出它。
12. **共享池模式下 pending 审批门不会被绕过**（高风险：在审批前连接门控服务器）。在守护进程/共享池模式（`runDiscoverAllMcpToolsViaPool`）下，让设置的热重载添加/编辑一个待审批的服务器（`.mcp.json` / 工作区）。**断言**：在用户审批之前，它**不会**获取池连接或启动进程；被拒绝的门控服务器保持断开。与单会话路径相比（该路径已跳过 pending），此测试防护池路径。  
   _防护_：Part A 第 4 项——池路径在构建 `desiredIds` / 在获取前进行的 `isMcpServerPendingApproval` 检查。

### E. reconcile 边界情况（推荐覆盖，验证“增量而非全量清理”）

13. **空 ↔ 非空**：从 0 个服务器到 1 个（第一个），从 1 个到 0 个（最后一个）都能正确 reconcile，不遗留任何连接/工具/prompts。
14. **仅影响单个服务器的指纹变化**：更改服务器的 `command` / `url` / `env` / `headers` → 仅该服务器断开并重新连接，**所有其他连接保持**（验证没有全量清理，没有“0 工具”缺口）。
15. **不受信任的目录**：当 `isTrustedFolder()` 为 false 时，热重载为空操作（不建立任何连接）。
16. **`mcp.excluded` 切换**：将在线服务器加入 excluded → 断开连接，工具/prompts 清除；将其从 excluded 中移除 → 重新连接。