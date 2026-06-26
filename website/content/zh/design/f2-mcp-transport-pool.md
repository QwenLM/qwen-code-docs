# F2: 共享 MCP 传输池 — 设计 v2.2

> 目标 `daemon_mode_b_main`（根据 #4175 分支策略）。取代 #4175 Wave 5 PR 23。
> **单 PR 交付**，根据维护者功能内聚批次指引（2026-05-19）。
> 作者：doudouOUC。日期：2026-05-20。修订：2026-05-20（v2.2 — 实施审查合并）。

---

## 0. 变更日志

### v2.2 (2026-05-20) — PR #4336 实现 + 32 个审查合并

PR #4336 以 6 个原子提交 + 6 个修复提交（约 4 小时）交付 F2。Wenshao 分 3 批进行累计审查；每批产生内联 + 关键修复，并合并回。下表记录了与 v2.1 相比的变化，按审查批次组织。

#### v2.1 → 第一审查批次（提交 1-4，wenshao C1-C7 + S1-S4）

| #   | 位置                                                        | 问题                                                                                                                                                                      | 合并提交        |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| C1  | `acpAgent.ts:269` — IDE 关闭路径                             | 仅在 SIGTERM 处理器中执行池 drain；IDE 发起的正常关闭导致条目泄漏，直到 OS 回收。在 `await connection.closed` 上镜像 SIGTERM 的池 drain                                        | `ae0b296c4`     |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                        | `cancelDrainTimer` 每次重置 `maxIdleTimer`，破坏了 §6.3 的硬上限。现在只清除 `drainTimer`；max-idle 在条目整个生命周期内保持存活                                                    | `ae0b296c4`     |
| C3  | `mcp-pool-entry.ts:doRestart`                               | 重连失败使条目进入僵尸状态（`localStatus=CONNECTED`、`state='active'`、过期快照）。添加 try/catch + 失败时转换为 `'failed'`                                                       | `ae0b296c4`     |
| C4  | `mcp-pool-entry.ts:forceShutdown`                           | 在 await 之后设置 `state='closed'`，因此并发的 `acquire` 可能观察到 `'active'` 并给出过期连接。同步设置到顶部                                                                  | `ae0b296c4`     |
| C5  | `mcp-transport-pool.ts:drainAll`                            | 并发的 `acquire` 可能在 drain 中途产生新条目。添加 `draining` 互斥标志 + 在清除前 `await Promise.allSettled(spawnInFlight)`                                                      | `ae0b296c4`     |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                    | 监听器未按 `serverName` 过滤；每个条目收到所有服务器的状态通知 + 条目自身的 `markActive` 写入被回显                                                                         | `ae0b296c4`     |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`      | 池模式门禁已添加到 `discoverAllMcpTools` 但遗漏了 `Incremental` — `/mcp refresh` 绕过了池，为每个会话生成了客户端                                                              | `ae0b296c4`     |
| S1  | `session-mcp-view.ts:passesSessionFilter`                   | 文档未说明 `excludeTools` 使用直接相等（不支持括号形式）；与 `mcp-client.ts:isEnabled` 存在差异                                                                               | `ae0b296c4`     |
| S2  | `pid-descendants.ts` 文档字符串                              | 声称存在 Windows 特定的 `taskkill /F` 分支，但实际上不存在 — Node 将 `process.kill('SIGTERM')` 映射为 `TerminateProcess`                                                        | `ae0b296c4`     |
| S3  | `session-mcp-view.ts:applyTools` 调试日志                    | 字符串包含字面 `"N"` 而非插值 — 操作者看到 `applied 12 tools (filtered to N registered)`                                                                                        | `ae0b296c4`     |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` 状态回调    | 硬编码为 `() => CONNECTED`，因此 `aggregateStatusByName` 在断开连接后给出错误信息。现在为 `() => client.getStatus()`                                                             | `ae0b296c4`     |

#### 提交 5 自审查批次（R1-R3 小问题）

| #   | 位置                                            | 问题                                                                                                                                                                   | 合并提交        |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| R1  | `server.test.ts:918` `/capabilities` 信封        | 测试断言 `getAdvertisedServeFeatures()`（无开关），但 server.ts 传递 `mcpPoolActive: opts.mcpPoolActive !== false`（默认开启）。添加开关锚点                               | `3e68c00bc`     |
| R2  | `server.test.ts` 能力默认开启覆盖率              | 没有测试使用默认选项启动以验证池标签是否通告。添加了显式的 `mcpPoolActive: false` 测试                                                                                    | `3e68c00bc`     |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`    | 文档说 PR 之前的 SDK 会“将新值视为未知并泛化显示” — 实际上 `MCP_RESTART_REFUSED_REASONS.has(...)` 拒绝 → 静默丢弃                                                        | `3e68c00bc`     |

#### 第二审查批次（提交 1-5，wenshao WR1-WR10）

| #   | 位置                                                | 问题                                                                                                                                                                               | 合并提交        |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                    | C2 修复正确地保留了跨抖动的 `maxIdleTimer`，但触发操作无视 `refs.size` 强制关闭。在宽限期内重新连接的活跃会话将在 5 分钟后丢失工具                                                       | `72399f109`     |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`  | `releaseAllPooledConnections` + 每次遍历重新获取所有连接，导致短暂窗口内零 MCP 工具注册，并且重置了每个 drain 定时器。与期望的 `(name, fingerprint)` 不同                                | `72399f109`     |
| WR3 | `mcp-pool-entry.ts:doRestart` 快照分发              | 重启更新了 `toolsSnapshot`/`promptsSnapshot` 并发出类型化事件 — 但没有任何 `SessionMcpView` 实例订阅该流。在快照后直接遍历 `subscribers`                                               | `72399f109`     |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount` | 将 websocket 计入 `subprocessCount` — websocket 连接远程，没有本地子进程。限制为仅 `'stdio'`                                                                                          | `72399f109`     |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`           | 将 `${pid}` 直接插值到 `-Filter` 字符串中。入口点的 `Number.isInteger` 保护现在防止注入；绑定到 `$p` 以深度防御未来保护放松                                                              | `72399f109`     |
| WR6 | `mcp-pool-entry.ts` 构造函数 `cfg` 字段             | `readonly cfg: MCPServerConfig` 隐式公开，暴露了环境 API 密钥 / 标头认证 / OAuth 字段。改为 `private`；为唯一的外部读取者添加新的 `transportKind` 获取器                                | `72399f109`     |
| WR7 | `mcp-pool-events.ts` 过早导出                        | 5 个 PoolEvent 类型守卫 + `Prompt` 重新导出 + `PoolEntryConnectionStatus` 无调用者。移除；保留 `MCPCallInterruptedError`（设计 §13.4 要求）                                           | `72399f109`     |
| WR8 | `acpAgent.ts:269,300` 池 drain 重复                 | SIGTERM + IDE 关闭有相同的 `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }` 块。提取为 `drainPoolBeforeExit(label)` 辅助函数                                     | `72399f109`     |

#### 提交 6 自审查批次（R1-R3 关键竞争）

| #   | 位置                                    | 问题                                                                                                                                                               | 合并提交        |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | 插槽释放竞争：A 完成 spawn，B（不同指纹，相同名称）开始 spawn，A 执行 drain。关闭回调仅检查 `entries`（B 尚未注册）→ 过早释放                                             | `0e58a098f`     |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc | 工作空间范围的事件分发到 N 个会话 → N 个 reducer 递增；跨会话聚合的消费者会重复计数。更新文档字符串以说明乘数                                                              | `0e58a098f`     |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | 在异步分发期间直接遍历 `this.sessions.keys()`；并发的 `killSession` 可能损坏迭代器。通过 `Array.from(...)` 快照                                                           | `0e58a098f`     |

#### 第三审查批次（提交 1-6，wenshao W1-W15）

| #   | 位置                                                           | 问题                                                                                                                                                                                   | 合并提交        |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                       | spawn 失败导致 `statusChangeListener` 永久泄漏 — 只有 `forceShutdown` 会移除它。在 catch 中添加 `entry.forceShutdown('manual')`                                                            | `4a3c5cd90`     |
| W2  | `mcp-pool-entry.ts:statusChangeListener` 交叉检查              | 模块级 `serverStatuses` 映射在多指纹条目之间共享。A 的传输错误写入 DISCONNECTED，B 的监听器损坏了 B 的 `localStatus`。添加 `client.getStatus()` 检查                                         | `4a3c5cd90`     |
| W3  | `mcp-pool-entry.ts:doRestart` pid 清除                        | 重启跳过了 `listDescendantPids` + `sigtermPids` — 每个用 `npx`/`uvx` 包装的 stdio 重启都会孤立实际的 MCP 子进程。在断开连接前添加清除                                                       | `4a3c5cd90`     |
| W4  | `mcp-pool-entry.ts:doRestart` drain 定时器竞争                | Drain 定时器可能在重启 yield 中间触发 → `forceShutdown` 移除条目 → `client.connect` 产生孤儿。在 `doRestart` 开头添加 `cancelDrainTimer` + `state→active`                                     | `4a3c5cd90`     |
| W5  | `mcp-client-manager.ts:pooledConnections` 死句柄              | 当条目转换为 `'failed'` 时，管理器持有死 `PooledConnection` 永远。订阅条目事件；在 `'failed'` 时驱逐（通过 `get(name) === conn` 守卫幂等）                                                  | `4a3c5cd90`     |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` 可重入性  | 两次遍历交错可能导致都 `set(name, conn)` → 第一个连接泄漏。添加 `discoveryInFlight` 互斥；第二个调用者等待同一个 promise。新增回归测试                                                     | `4a3c5cd90`     |
| W9  | `acpAgent.ts:parsePoolDrainMs` 严格性                         | `Number.parseInt` 接受 `'30000ms'` / `'30000abc'`。严格 `^\d+$` 正则；拒绝并输出 stderr 警告 + 默认回退                                                                                   | `4a3c5cd90`     |
| W10 | `mcp-transport-pool.ts:acquire` indexAttach 顺序              | `indexAttach` 在 `entry.attach()` 之前修改 `sessionToEntries`。如果 `attach` 抛出，则反向索引映射失效。将 `indexAttach` 移到 `attach` 成功后（快速路径和飞行路径都适用）                    | `4a3c5cd90`     |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                 | 在 WR4 限制为 stdio 后，文档仍声称 `stdio + websocket`。已更新                                                                                                                           | `4a3c5cd90`     |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch        | 与 W1 相同的 `statusChangeListener` 泄漏出现在非池化路径。相同修复：在断开连接前 `forceShutdown`                                                                                           | `4a3c5cd90`     |
| W15 | `bridge.ts:restartMcpServer` 响应                             | `as PoolEntries` 类型转换不安全 — 来自 ACP 子进程的无类型 JSON。添加 `Array.isArray` 检查 + 逐条目形状守卫；格式错误的条目跳过并用 stderr 面包屑记录                                          | `4a3c5cd90`     |

#### 已拒绝并回复（列为 F2 后续）

| #   | 位置                                                | 拒绝理由                                                                                                                                               |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W7  | 测试覆盖率缺口（4 个未测试的关键路径）                 | 1/4 已添加（W6 回归测试）；其余推迟到 F2 系列合并后的针对性测试覆盖率 PR                                                                                |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` 未使用  | 为推迟的健康监控驱动重连预留的前向兼容占位符（设计 §6.6）；移除并重新添加会搅动公共类型                                                                  |
| W11 | 重复的快速路径 / 飞行路径 attach 块                   | ✅ 在 PR A 中完成：`attachPooledSession` + `rollbackReservationOnSpawnFailure` 私有辅助函数（提交 `2d546efca`）                                          |
| W12 | `passesSessionFilter` 每次 `applyTools` O(M×N)       | ✅ 在 PR A 中完成：`applyTools` / `applyPrompts` 每次遍历预计算过滤器 `Set`；谓词变为每个工具 O(1)（提交 `a4a855ab3`）                                  |
| R9  | `McpClientManager` 构造函数 7 个位置参数哨兵          | ✅ 在 PR A 中完成：选项对象构造函数 + `mkManager` 测试工厂（提交 `0cb1eaa27`）                                                                          |
| R10 | 每 PID 每层级 `pgrep -P <pid>` 开销                 | ✅ 在 PR A 中完成：单次 `ps -A -o pid=,ppid=` 快照 + 内存 BFS 遍历；pgrep BFS 保留作为 BusyBox <v1.28 / distroless 的回退（提交作为 PR A 最终部分落地） |

#### Bug 计数

- **3 批次 × 27 个关键 / 重要修复** + 5 个文档 / 建议折叠 = 总计 **32 个审查合并**
- **2 个关键竞争仅在第二次审查时发现**（6R1 插槽释放期间 spawn 竞争；W6 发现可重入性）
- **0 个静默失败已发布** — 每个修复都带有内联 `// F2 (#4175 commit X review fix — wenshao YN):` 面包屑指向原始审查

### v2.1 (2026-05-20) — 单 PR 策略 + 12 个审查合并

| #       | 内容                                                                                                           | 原因                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| V21-1   | 从 6 个子 PR 计划切换为 **单个功能内聚 PR**，包含 6 个原子提交                                                   | 根据维护者指引（#4175 分支策略）；审查者可以通过 `git log -p` 逐提交阅读                                           |
| V21-2   | 在池中添加 `sessionToEntries: Map<sid, Set<ConnectionId>>` 反向索引（§6）                                      | `releaseSession` 从 O(N 条目) → O(会话的 refs)；1000 会话规模需要                                                      |
| V21-3   | 重启路由上的 `?fingerprint=` 查询参数（§13.1）                                                                   | 操作员可能希望在相同名称有多个指纹时只重启其中一个条目；现在添加几乎零成本                                               |
| V21-4   | Spawn 失败路径显式释放预留插槽（§6.1, §6.5）                                                                      | 否则插槽泄漏直到下一次健康监控遍历；微妙的实际 bug                                                                  |
| V21-5   | 新增 §13.4：重连期间正在进行的工具调用语义                                                                       | `MCPCallInterruptedError`；池不会自动重放（写入不安全）                                                            |
| V21-6   | 新增 §10.4：`/mcp disable X` 触发 `SessionMcpView` 重新应用                                                       | 否则会话中禁用不会丢弃已注册的工具                                                                                 |
| V21-7   | 状态路由暴露 `entryIndex` 而非原始指纹（§8.3）                                                                    | 避免通过指纹变化侧信道暴露 OAuth 令牌轮换                                                                         |
| V21-8   | 重连退避规范：stdio 固定 5s × 3，HTTP/SSE 指数 1/2/4/8/16s × 5（§6.6）                                         | v2 未说明；HTTP 需要更长的重试预算应对网络抖动                                                                     |
| V21-9   | `canonicalOAuth(o)` 将 `{enabled: false}` 规范化为 `undefined` ≡ `null`（§5.1）                                  | 否则功能上等价的配置会产生不同的条目                                                                               |
| V21-10  | 将池回退辅助函数从 "legacy in-process acquire" 重命名为 `createUnpooledConnection`（§5.3, §6.1）                  | SDK MCP 绕过是永久的，并非遗留                                                                                       |
| V21-11  | `drainAll(opts?)` 返回 `Promise<void>`，带有 `timeoutMs` 挂钟预算（§17）                                        | 调用者需要知道 drain 何时完成以进行关闭排序                                                                        |
| V21-12  | 锁定 SDK reducer 字段名称（Q1 已解决）：保留 `mcpBudgetWarningCount` 等，并在 JSDoc 中说明作用域语义               | PR 期间无公开 API 重命名                                                                                           |
| V21-13  | 锁定 Q3（默认池开启、`--no-mcp-pool` 终止开关）、Q4（HTTP/SSE 选择加入）、Q6（急切构造）                          | 单 PR 交付；无需标志门控                                                                                           |
| V21-14  | 添加 R9/R10/R11 单 PR 风险（§23）                                                                                 | 审查疲劳、daemon_mode_b_main 合并冲突、CI 时间                                                                     |
| V21-15  | 扩展卸载孤立条目处理推迟到 `MAX_IDLE_MS` 自然回收（§16.3）                                                         | 无显式 `invalidateByExtension`；保持模型统一                                                                       |

### v2 (2026-05-20) — 来自 v1 草稿的初始审查合并

| #   | 内容                                                                                                        | 原因                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| C1  | 池分发 **Tools + Prompts**（之前仅 tools）                                                                   | `McpClient` 构造函数接受两个注册表；否则 prompts 在池模式下静默丢失                                  |
| C2  | 新增 **全局状态共存** 章节（`serverStatuses` / `mcpServerRequiresOAuth` 模块 Map）                             | 跨会话共享已经存在；池继承并正式化                                                                |
| C3  | `connectToMcpServer` 工厂路径 **统一** 使用 F2-1 中的 `McpClient` 类                                          | v1 仅重构了类；会留下一个并行的非池化路径                                                         |
| C4  | 在 `PoolEntry.attach()` 中添加快照重放（earlyEvents 风格）                                                    | 新竞争：会话 B 附加 → 服务器在订阅连线之前发出 `tools/list_changed`                                 |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` 用于并发 acquire 去重                                   | v1 在测试矩阵中提到但遗漏了实现契约                                                              |
| C6  | 跨平台后代 PID 清除（Linux/macOS pgrep, Windows wmic/PowerShell）                                             | v1 说“复制 opencode 的 `pgrep -P`” — 仅 Unix                                                   |
| C7  | 每个会话的 `trust` 字段 **复制** 工具对象                                                                      | trust 存在于 `DiscoveredMCPTool` 上；共享实例会混合每个会话的 trust                               |
| C8  | HTTP/SSE 传输 **选择加入** 池化（默认：stdio + websocket 仅）                                                | 某些 MCP HTTP 服务器维护每个传输的会话状态；共享有状态泄漏风险                                     |
| C9  | SDK MCP 服务器（`isSdkMcpServerConfig`）显式绕过                                                               | `sendSdkMcpMessage` 按设计是每个会话的                                                            |
| C10 | OAuth 路径显式 **推迟到 F3**                                                                                  | OAuth 流程需要 PermissionMediator 风格路由；不在 F2 范围内                                         |
| C11 | 重启路由语义规范（name → 所有匹配条目）                                                                       | PR 17 的 `POST /workspace/mcp/:server/restart` 之前无歧义（1 个条目）；现在 1..N                 |
| C12 | 状态路由重构章节（新路径：`QwenAgent.getMcpPoolAccounting()`）                                                | `httpAcpBridge.ts:733-770` 当前读取引导会话的 manager — 必须更改                                 |
| C13 | `PoolEntry` 上的代际计数器用于陈旧 `tools/list_changed` 处理器守卫                                              | Opencode 模式：`if (s.clients[name] !== client) return`                                         |
| C14 | 子 PR 分解从 4 → **6**                                                                                       | v1 低估了；A2/B1/B3/C6 每个都增加了实际工作量                                                     |
| C15 | 惰性池构造（仅在看到 N≥2 个会话时）— 可选                                                                       | `qwen serve --foreground` 单会话不会受益；节省初始化成本                                        |
---

## 1. 目标 / 非目标

**目标**

- 在同一工作区中，N 个会话共享一个进程（按唯一服务器配置的指纹键控）
- 保留每个会话的 `ToolRegistry` / `PromptRegistry` 视图（过滤、信任）
- 引用计数 + 优雅排空生命周期，对重新挂载具有弹性
- 跨平台子进程清理
- 预算约束从每会话升级到每工作区（PR 14 已承诺）
- 向后兼容非守护进程的独立 qwen（那里不会构造池）

**非目标（F2 范围）**

- 跨工作区池化（1 个守护进程 = 1 个工作区，PR #4113 保持不变）
- 跨守护进程池化（超出范围——属于多进程编排器领域）
- OAuth 路由重写（F3 配合 `PermissionMediator`）
- 守护进程重启后池持久化（仅内存）
- 自动检测“可池化”的 HTTP 服务器（仅 opt-in 标志）
- 实时 `MCPServerConfig` diff 原地修改条目（配置变更 → 新条目，旧条目排空）

---

## 2. 当前状态（待替换目标）

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**耦合映射（必须打破或穿通的项）：**

| 耦合                                                                     | 位置                                           | F2 中的操作                                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `McpClient` 构造函数绑定 1 个 `ToolRegistry` + 1 个 `PromptRegistry`      | mcp-client.ts:106-119                          | 池拥有传输层；`SessionMcpView`（每会话）拥有每会话的注册表                                |
| `McpClient.discover()` 内联调用 `toolRegistry.registerTool()`             | mcp-client.ts:178-198                          | 拆分：`discoverAndReturn()` 返回快照；视图注册                                           |
| `ListRootsRequestSchema` 处理器闭包中使用了 `workspaceContext.getDirectories()` | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | 池的单个工作区绑定的上下文                                                               |
| 每个连接注册一次 `workspaceContext.onDirectoriesChanged` 监听器            | mcp-client.ts:907                              | 池为每个条目注册一次                                                                     |
| `McpClientManager` 在 `ToolRegistry` 内部 `new` 出来                      | tool-registry.ts:199                           | 添加可选的 `pool?` 构造函数参数；从 Config 注入                                         |
| 每会话的预算执行                                                          | mcp-client-manager.ts:91-95 注释               | 将状态机移入池                                                                           |
| `serverDiscoveryPromises` 去重每服务器的进行中的发现                       | mcp-client-manager.ts:350                      | 池拥有 `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                           |
| 每会话注册 `setMcpBudgetEventCallback`                                     | acpAgent.ts:1851-1899                          | 池发出事件 → `QwenAgent` 广播给所有会话                                                  |

**已共享的状态（池继承，不会引入新状态）：**

| 状态                                          | 位置                          | 说明                                                             |
| --------------------------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>` | mcp-client.ts:292（模块级别） | 当前进程级；池仍然按名称键控 → “任一-CONNECTED-胜出”              |
| `mcpServerRequiresOAuth: Map<string, boolean>` | mcp-client.ts:302（模块级别） | 同上                                                             |
| `MCPOAuthTokenStorage` 磁盘令牌               | `~/.qwen/mcp-oauth/<name>.json` | 守护进程宿主共享；池只是更高效地利用它                           |

---

## 3. 参考发现

| 项目           | 是否池化？      | 键                                            | 生命周期                                                                                  | 可借鉴的模式                                                                                                           |
| -------------- | --------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **claude-code** | 否，每进程      | `name + JSON.stringify(cfg)` (lodash.memoize) | `clearServerCache` + 远程退避×5；stdio 崩溃 → `failed`                                    | 排序键的 SHA-256 `hashMcpConfig` 用于失效判断/键控                                                                     |
| **opencode**   | 是，每工作区    | 仅服务器 **名称**（无配置哈希）               | 无引用计数 / 无驱逐 / 无重启；Effect 终结器 + `pgrep -P` 递归 SIGTERM                    | 子进程扫描、过期处理器保护（`if (s.clients[name] !== client) return`）、`tools/list_changed` 通过事件总线扇出          |

**F2 从两者继承的内容：** 从 claude-code 继承配置哈希（处理 opencode 未处理的每会话环境/认证差异），从 opencode 继承子进程扫描（`npx/uvx` 包装器会泄露）。我们新增：引用计数 + 排空（多客户端守护进程）、自动重启（长运行守护进程）、提示扇出、生成保护。

---

## 4. 架构

### 4.1 进程布局

```
HTTP 守护进程 (packages/cli/src/serve, qwen serve)
  │ 启动
  ▼
ACP 子进程 (qwen --acp, 每工作区单个进程)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── 新增，工作区范围，1 个实例
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext（绑定到守护进程工作区）
  │     └── budget guardrails（PR 14 状态机，已升级到工作区）
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ 注入池           │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   传统进程内
                                  → SessionMcpView           （独立 qwen）
                                    .applyTools/Prompts
                                    （过滤 + 注册到
                                     会话自己的注册表）
```

**池位于 ACP 子进程中**，而不是 HTTP 守护进程中。HTTP 守护进程通过现有的 `bridge.client` extMethod 表面（`getMcpPoolAccounting`, `restartMcpServer`）查询池状态。F2 代码位于 **`packages/core/src/tools/`**（与 `mcp-client-manager.ts` 同级），而不是 `packages/acp-bridge/`。

### 4.2 类关系图

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   （批量释放，用于会话拆除）
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   （工作区范围）
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   （关闭）
  └─ onBudgetEvent: (event) => void   （由 QwenAgent 设置）

PoolEntry（内部）
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   （重新连接时 ++；陈旧事件保护）
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection（返回给调用者的句柄）
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView（每会话，每服务器）
  ├─ 构造函数(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   （按 include/exclude 过滤，修饰信任）
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   （移除其注册）
```

---

## 5. 池键（指纹）

### 5.1 哈希规范字段

```ts
type PoolKey = string; // sha256 十六进制，前 16 个字符足够（对现实 N 无冲突）
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] 按 k 排序
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9：对功能等效的 OAuth 配置进行规范化，使其折叠到相同的指纹。
 * `{enabled: false}`, `undefined`, `null` 和 `{}` 都表示“无 OAuth”→ 全部返回 `null`。
 */
function canonicalOAuth(o?: OAuthConfig | null): OAuthConfig | null {
  if (!o || !o.enabled) return null;
  return {
    enabled: true,
    clientId: o.clientId ?? null,
    scopes: o.scopes ? [...o.scopes].sort() : null,
    authorizationUrl: o.authorizationUrl ?? null,
    tokenUrl: o.tokenUrl ?? null,
  };
}

// 排除的字段（每会话过滤器，不是传输层）：
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 传输类别门控

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**默认 `pooledTransports = {stdio, websocket}`**。操作员通过以下方式选择 HTTP/SSE：

- CLI：`--mcp-pool-transports=stdio,websocket,http,sse`
- 环境变量：`QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**为什么默认排除 HTTP/SSE**：某些 MCP HTTP 服务器实现将状态（认证上下文、对话记忆）绑定到 TCP/SSE 流；多个 ACP 会话共享它会导致状态泄露。stdio + websocket 是真正的 OS 进程，其状态可观察且可隔离。

### 5.3 SDK MCP 绕过

如果 `isSdkMcpServerConfig(cfg)` 为 true → 池返回一个薄的 `PooledConnection` 包装器，通过 `createUnpooledConnection(name, cfg, sid)` 立即构造一个 `McpClient`，不共享，不存储在池中。原因：`sendSdkMcpMessage` 设计上就是每会话的（通过 ACP 控制平面路由回发起会话）。当传输不在 `pooledTransports` 中时，HTTP/SSE 也使用相同路径（§10.3）。

V21-10：名称是 `createUnpooledConnection`，不是 `legacyInProcessAcquire`——SDK MCP 和 HTTP 选择退出是永久设计选择，不是遗留代码。

---

## 6. 生命周期

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2：反向索引，releaseSession 为 O(refs) 而不是 O(entries)。 */
  private sessionToEntries = new Map<string, Set<ConnectionId>>();

  async acquire(
    name: string,
    cfg: MCPServerConfig,
    sid: string,
  ): Promise<PooledConnection> {
    if (!isPoolable(cfg, this.opts)) {
      return this.createUnpooledConnection(name, cfg, sid);
    }
    const id: ConnectionId = `${name}::${fingerprint(cfg)}`;

    if (this.entries.has(id)) {
      this.indexAttach(sid, id);
      return this.entries.get(id)!.attach(sid);
    }
    let inFlight = this.spawnInFlight.get(id);
    if (!inFlight) {
      const slot = this.tryReserveSlot(name);
      if (slot === 'refused') {
        throw new BudgetExhaustedError(
          name,
          this.clientBudget!,
          this.reservedSlots.size,
        );
      }
      inFlight = this.spawnEntry(name, cfg, id)
        .catch((err) => {
          // V21-4：在生成失败时释放保留的槽位。如果没有这个，
          // 槽位会泄漏，直到健康监控的释放路径运行（但由于没有条目可监控，它不会运行）。
          if (slot === 'reserved') this.releaseSlotName(name);
          throw err;
        })
        .finally(() => this.spawnInFlight.delete(id));
      this.spawnInFlight.set(id, inFlight);
    }
    const entry = await inFlight;
    this.indexAttach(sid, id);
    return entry.attach(sid);
  }

  release(id: ConnectionId, sid: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.detach(sid);
    this.indexDetach(sid, id);
    if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
  }

  /** V21-2：O(此会话的 refs)，不是 O(所有条目)。 */
  releaseSession(sid: string): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.detach(sid);
      if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
    }
    this.sessionToEntries.delete(sid);
  }

  private indexAttach(sid: string, id: ConnectionId): void {
    let ids = this.sessionToEntries.get(sid);
    if (!ids) {
      ids = new Set();
      this.sessionToEntries.set(sid, ids);
    }
    ids.add(id);
  }

  private indexDetach(sid: string, id: ConnectionId): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) this.sessionToEntries.delete(sid);
  }
}
```

### 6.2 并发 acquire 去重（`spawnInFlight`）

镜像 `McpClientManager.serverDiscoveryPromises`（mcp-client-manager.ts:350）。没有它，5 个会话在启动时同时 acquire，都会看到 `entries.has(id) === false` 并竞相生成 5 个子进程。

### 6.3 排空优雅等待 + 空闲上限

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // 最后释放后的优雅等待时间
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // 硬性上限（防御排空定时器取消循环）
```

`PoolEntry` 中的状态机：

```
spawning ──生成成功──► active ──最后一次 detach──► draining ──超时──► closed
   │                     │                       │
   │                     │                       └──attach──► active（取消定时器）
   生成失败──────────►failed
                          │
                          └──手动重启──► spawning
```

硬性空闲上限：排空定时器可以被无限取消+重新启动（acquire/release 抖动）。`MAX_IDLE_MS` 是单独的定时器，在**首次空闲**时启动，并且从不重置；当它触发时，即使排空当前处于优雅等待期，也强制关闭。防止有 bug 的客户端频繁 acquire/release 导致僵尸池条目。

### 6.4 跨平台子进程扫描

**R10 / R23 T7 / PR A 更新（2026-05-22）**：从每个 PID 的 BFS（每个节点一个 `pgrep -P <pid>` / `Get-CimInstance -Filter` 子进程）切换到单个进程表快照 + 内存树遍历。两个动机：（1）在热池关闭路径上，一次 fork 代替 B^D 次 fork；（2）快照一致性——修复前的 BFS 可能遗漏在相邻 BFS 级别之间创建的子进程。每个 PID 的路径保留为 BusyBox `ps` < v1.28（不支持 `-o`）和没有 `ps` 的 distroless 容器的回退。

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // OS 会回收孤儿进程；池关闭仍会继续。
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* 回退到降级方案 */
  }
  if (tree) return walkDescendants(tree, root); // O(子进程数)，1 次 fork
  return await listDescendantPidsUnixPgrepFallback(root); // 遗留 BFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A：所有进程（POSIX，等效于 -e 但在 BSD 上无歧义）。
  // -o pid=,ppid=：pid + ppid 列，尾部 `=` 抑制列头。
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // 覆盖超过 25 万进程的异常主机
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* 解析，推入 childrenByPpid */
  }
  return childrenByPpid;
}

// Windows：单个 Get-CimInstance Win32_Process | ConvertTo-Csv 快照
// 所有 (ProcessId, ParentProcessId) 行 + 内存遍历；每个 PID 的
// `Get-CimInstance -Filter "ParentProcessId=$p"` 保留为回退。
```

在 `PoolEntry.shutdown()` 中 `client.disconnect()` 之前调用。处理 `npx @modelcontextprotocol/server-X`、`uvx ...`、`pnpm dlx ...` 包装器泄漏。保留 MAX_DESCENDANTS=256 / MAX_DEPTH=8 上限。

### 6.5 生成失败处理

如果 `spawnEntry` 在多个订阅者通过 `spawnInFlight` 挂载后 reject：

- 所有等待者都会收到 reject
- 通过 `acquire` 中的显式 `.catch` 分支释放 `tryReserveSlot`（V21-4）；没有这个修复，槽位会泄漏，直到下一次健康监控轮次，但从未运行，因为没有条目可监控。
- 失败的条目**不**存储在 `entries` 中
- 订阅者的代码路径会将其视为 `acquire` 最初失败（现有的每会话 `discoverMcpToolsForServer` catch 逻辑仍然有效）

### 6.6 重连退避（V21-8）

当 `PoolEntry` 在传输断开后进入重连时：

| 传输族      | 策略                               | 上限                                                        |
| ----------- | ---------------------------------- | ----------------------------------------------------------- |
| stdio       | 固定 5s × 3 次尝试                 | 基于现有 `DEFAULT_HEALTH_CONFIG.reconnectDelayMs`           |
| websocket   | 固定 5s × 3 次尝试                 | 与 stdio 相同                                               |
| http（opt-in） | 指数退避 1s, 2s, 4s, 8s, 16s × 5 次尝试 | 远程端点在临时网络问题上抖动；更长的预算                    |
| sse（opt-in）  | 指数退避 1s, 2s, 4s, 8s, 16s × 5 次尝试 | 与 http 相同                                                |

上限耗尽后：条目转换为 `failed` 状态；订阅者收到 `failed` 事件；新的 `acquire` 针对同一 `ConnectionId` 会重试生成一次，然后抛出异常。操作员重启（§13）重置状态。
---

## 7. 发现 / SessionMcpView

### 7.1 Tools + Prompts 双扇出

```ts
// packages/core/src/tools/mcp-client.ts — 将 discover 拆分为纯函数
async discoverAndReturn(cliConfig: Config): Promise<{
  tools: DiscoveredMCPTool[];
  prompts: Prompt[];
}> {
  if (this.status !== MCPServerStatus.CONNECTED) throw new Error('Client is not connected.');
  try {
    const [prompts, tools] = await Promise.all([
      discoverPrompts(this.serverName, this.client, /* 无注册表 */),
      discoverTools(this.client, this.serverConfig, this.serverName, this.debugMode, this.workspaceContext),
    ]);
    if (prompts.length === 0 && tools.length === 0) {
      throw new Error('No prompts or tools found on the server.');
    }
    return { tools, prompts };
  } catch (e) {
    this.updateStatus(MCPServerStatus.DISCONNECTED);
    throw e;
  }
}

// 保留原有的 discover()，委托给 discoverAndReturn + 注册（用于独立运行的 qwen）
async discover(cliConfig: Config): Promise<void> {
  const { tools, prompts } = await this.discoverAndReturn(cliConfig);
  for (const t of tools) this.toolRegistry.registerTool(t);
  for (const p of prompts) this.promptRegistry.registerPrompt(p);
}
```

```ts
class SessionMcpView {
  applyTools(snapshot: DiscoveredMCPTool[]) {
    this.sessionToolRegistry.removeToolsByServer(this.serverName);
    for (const tool of snapshot) {
      if (!this.passesFilter(tool)) continue;
      // C7: 每个会话的信任副本（不修改共享的 snapshot）
      const localTool = tool.withTrust(this.cfg.trust);
      this.sessionToolRegistry.registerTool(localTool);
    }
  }
  applyPrompts(snapshot: Prompt[]) {
    this.sessionPromptRegistry.removePromptsByServer(this.serverName);
    for (const p of snapshot) this.sessionPromptRegistry.registerPrompt(p);
  }
}
```

### 7.2 附加时快照重放（earlyEvents 风格）

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // 立即重放当前快照，以便订阅者不会错过
    // 在 in-flight discover 完成和 attach 之间落地的最新更新。
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

镜像 PR 14b 修复 #1 的 `BridgeClient.earlyEvents` 模式——解决了池附加时的类似竞态问题。

### 7.3 陈旧处理器防护（代数计数器）

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // 被另一次 reconnect 取代
    const snap = await this.client.discoverAndReturn(this.cfg);
    if (myGen !== this.generation) return;
    this.toolsSnapshot = snap.tools;
    this.promptsSnapshot = snap.prompts;
    this.fanOut('toolsChanged');
    this.fanOut('promptsChanged');
  }

  private onServerToolsListChanged = () => {
    const myGen = this.generation;
    this.client
      .discoverAndReturn(this.cfg)
      .then((snap) => {
        if (myGen !== this.generation) return;
        this.toolsSnapshot = snap.tools;
        this.fanOut('toolsChanged');
      })
      .catch(/* 吞掉并记录日志 */);
  };
}
```

如果没有这个保护，来自 reconnect 之前的 Client 实例的陈旧处理器可能会用陈旧数据覆盖 reconnect 之后的快照。

**单调性不变量**（V21 澄清）：`generation` 只增不减，永不重置。任何正在进行的操作都先捕获 `myGen`，然后在 `await` 之后检查 `myGen === this.generation`。等价于“自我开始执行之后没有发生取代性事件”。上限为 `Number.MAX_SAFE_INTEGER`（按 1Hz reconnect 频率约 285k 年），无需担心溢出。

### 7.4 路径统一（F2-1 范围扩展）

`packages/core/src/tools/mcp-client.ts` 中有**两条**连接服务器的路径：

1. `McpClient` 类（mcp-client.ts:100）——由 `McpClientManager` 使用
2. `connectToMcpServer` 工厂函数（mcp-client.ts:875）——由 `discoverMcpTools`（第 560 行）和 `connectAndDiscover`（第 607 行）使用

F2-1 必须让两者统一到 `McpClient.discoverAndReturn` 之后（要么让 `connectToMcpServer` 成为 `McpClient` 的私有辅助函数，要么两者都调用一个共享的 `establishConnection()` 基础函数）。否则，池只覆盖类路径；工厂路径仍然按会话独立存在，破坏整个努力成果。

---

## 8. 全局状态共存

### 8.1 `serverStatuses`（mcp-client.ts:292）——冲突容忍的写入

模块级别的 `Map<serverName, MCPServerStatus>`。池的 `ConnectionId` 是 `name::hash`，但 `updateMCPServerStatus(name, status)` 按名称写入。**同一名称的多个池条目（不同指纹，例如 token 不同）会互相覆盖状态。**

**解决方案**：池拦截状态写入：

```ts
class PoolEntry {
  updateStatus(s: MCPServerStatus) {
    this.localStatus = s;
    const aggregated = this.pool.aggregateStatusByName(this.serverName);
    updateMCPServerStatus(this.serverName, aggregated);
  }
}

class McpTransportPool {
  aggregateStatusByName(name: string): MCPServerStatus {
    // 任何 CONNECTED ⇒ CONNECTED
    // 否则任何 CONNECTING ⇒ CONNECTING
    // 否则 DISCONNECTED
    const entries = [...this.entries.values()].filter(
      (e) => e.serverName === name,
    );
    if (entries.some((e) => e.localStatus === CONNECTED)) return CONNECTED;
    if (entries.some((e) => e.localStatus === CONNECTING)) return CONNECTING;
    return DISCONNECTED;
  }
}
```

状态路由暴露 `entryCount: number`，以便运维人员能看到名称到多个条目的映射。

### 8.2 OAuth token 存储

`MCPOAuthTokenStorage` 写入 `~/.qwen/mcp-oauth/<serverName>.json`——这已经是守护进程主机共享的。池无意中受益（第一个会话的 OAuth 完成→ token 在磁盘上→池条目的 reconnect 会获取 token →所有其他会话搭便车）。

**注意事项——多指纹情况**：同一名称的 2 个条目（不同 headers/env）但同一个 OAuth 提供者→都读取同一个 token 文件。如果 token 是服务器作用域的（OAuth 典型），这可以工作。如果 token 是环境作用域的（少见），则需要显式扩展存储键。**推迟到 F3**，并记录为已知限制。

### 8.3 快照中的 `entryCount`

`GET /workspace/mcp` 每个服务器的单元格增加：

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // 新增——该名称下有 N 个池条目
  entrySummary?: [                        // 新增——每个条目的不透明明细
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**：`entrySummary[].entryIndex` 是一个**稳定的不透明整数**，在条目创建时分配（名称组内的插入顺序），而不是原始指纹。理由：当 OAuth token 或环境变量轮换时，指纹会改变，这会通过快照差异泄露这些信息（运维人员可以从 `'a3b1' → 'f972'` 的转换推断出“token 在 T+5min 轮换了”）。`entryIndex` 在名称组内是单调递增的，但在轮换期间保持稳定，因为旧条目会排空，新条目会获得下一个索引。

旧的 SDK 客户端按照 PR 14 约定忽略未知字段；新客户端使用 `entryCount` 来显示徽章。通过指纹重新启动的内部路径使用一个不透明的 token，仅通过特权 extMethod 返回，不出现在 HTTP 快照中。

---

## 9. WorkspaceContext / ListRoots

### 9.1 单一注册

池的 `McpClient` 实例共享**一个** `WorkspaceContext`——守护进程绑定的工作区上下文（PR #4113 不变量）。`connectToMcpServer` 的 `ListRootsRequestSchema` 处理器闭包捕获这个单一上下文。

`onDirectoriesChanged` 监听器**每个条目注册一次**，而不是每次 `acquire` 注册一次。条目关闭时解除注册。

### 9.2 `roots/list_changed` 向上扇出

服务器通知客户端新的根目录→池扇出：

- 池重新发现（服务器可能在新根目录下报告不同的工具集）→ `toolsChanged` 事件→所有订阅者视图重新应用

### 9.3 每个会话的 `updateWorkspaceDirectories`

**合约**：在 Mode B 中，每个会话的目录添加是软提示，而非权威信息。池的 `WorkspaceContext` 是守护进程级别的。

两个实现选择：

- **v1 简单**：忽略每个会话的添加，检测到时记录警告日志
- **v2 联合**：池维护 `extraRoots: Map<sessionId, Set<dir>>`，ListRoots 处理器返回绑定的工作区 + 所有额外目录的联合。每个会话的移除触发 `roots/list_changed`。增加 50-80 LOC 的复杂度。

**F2 选择 v1 简单**；v2 联合作为后续，如果用户痛点出现再实现。

---

## 10. 每个会话的注入

### 10.1 来自 `newSession({mcpServers})` 的 `mcpServers`

`newSessionConfig(cwd, mcpServers, ...)` 将注入的列表与 `settings.merged.mcpServers` 合并（acpAgent.ts:1778-1831）。池消费的是**每个会话合并后的视图**：

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...原有的 setMcpBudgetEventCallback REMOVED — 池直接广播
}
```

当两个会话注入同名的服务器但不同的环境变量/headers → 不同指纹 → 两个池条目。只有在会话完全一致时，池共享才生效。

### 10.2 认证分歧

静态 `~/.qwen/settings.json` 中的 mcpServers 在所有会话中相同→全部共享→80% 情况。每个会话注入的 mcpServers 带有每个用户的 token → 唯一指纹→不共享。两者都安全。

### 10.3 HTTP 传输可选加入（回顾 §5.2）

默认 `pooledTransports = {stdio, websocket}`。HTTP/SSE 服务器走 `createUnpooledConnection` 路径（每个会话一个 McpClient），除非运维人员选择加入。

### 10.4 会话中 `/mcp disable X`（V21-6）

当运维人员在活动会话中运行 `/mcp disable github` 时：

1. `Config.disableMcpServer('github')` 将名称添加到每个 Config 的 `disabledMcpServers` 集合
2. **F2 钩子**：`Config.onDisabledMcpServersChanged` 触发；该名称的 `SessionMcpView` 调用 `teardown()`（从会话注册表中移除其工具/提示注册）
3. 如果其他会话仍引用该条目，池条目**可能保持存活**（refcount > 0）——仅禁用会话的视图分离
4. 如果所有会话都禁用→ refcount → 0 → 排空计时器启动

如果没有步骤 2，会话中的禁用操作会使得已注册的工具留在会话的 `ToolRegistry` 中，直到下次会话重启。测试 21.4 覆盖此情况。

`/mcp enable github` 是逆操作：触发该会话的 `pool.acquire`，附加新视图，重新应用快照。

---

## 11. 预算护栏毕业

### 11.1 状态机移至池

`tryReserveSlot` / `releaseSlotName` / 75% 滞后 / refused_batch 合并 / `bulkPassDepth` / `pendingRefusalNames`——全部从 `McpClientManager` 迁移到 `McpTransportPool`。`McpClientManager` 仅在独立运行（没有注入池）时保留该状态。

### 11.2 快照单元格作用域

```ts
{
  kind: 'mcp_budget',
  scope: 'workspace',          // 新值（PR 14 v1 返回 'session'）
  liveCount: 5,
  clientBudget: 10,
  budgetMode: 'enforce',
  status: 'ok',
}
```

根据 PR 14 约定：“消费者必须容忍带有无法识别的 scope 值的额外条目（丢弃，不要失败）。” 旧 SDK 客户端看到 `scope: 'workspace'`，渲染为未知（或回退到顶层数字）。新 SDK 添加 `isWorkspaceScopedBudget(cell)` 辅助函数。

### 11.3 事件扇出

```ts
class QwenAgent {
  constructor() {
    this.mcpPool = new McpTransportPool({
      onBudgetEvent: (event) => this.broadcastBudgetEvent(event),
    });
  }

  private broadcastBudgetEvent(event: McpBudgetEvent) {
    for (const [sid, session] of this.sessions) {
      const enriched = {
        ...event,
        scope: 'workspace' as const,
        sessionId: sid,
      };
      session.connection
        .extNotification('qwen/notify/session/mcp-budget-event', enriched)
        .catch((err) =>
          debugLogger.debug('budget event delivery failed', { sid, err }),
        );
    }
  }
}
```

### 11.4 SDK 类型合约变更

PR 14b 导出了这些（必须以累加方式扩展）：

- `DaemonMcpBudgetWarningData` — 添加 `scope?: 'workspace' | 'session'`（可选，向后兼容；缺失视为 'session'）
- `DaemonMcpChildRefusedBatchData` — 同样的 `scope?` 扩展
- `DaemonMcpGuardrailEvent` — 判别器不变

新的 SDK 辅助函数：

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`DaemonSessionViewState` 上的 reducer 状态：

- **无新增字段** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` 无论 scope 如何都递增（scope 是每个事件的属性，不是独立的流）
- 文档说明：在 F2 下，这些计数反映的是工作区级别的事件，扇出到每个会话——当预算压力发生时，它们将**同时在所有附加的会话中递增**

**V21-12（Q1 已解决，锁定在 v2.1）**：保留现有字段名（`mcpBudgetWarningCount`、`mcpChildRefusedBatchCount`、`lastMcpBudgetWarning`、`lastMcpChildRefusedBatch`），在 JSDoc 中记录扩展的 scope 语义：

```ts
/**
 * 会话观察到的 `mcp_budget_warning` 事件计数。
 * 在 F2（`scope: 'workspace'`）下，由于预算事件在工作区级别扇出，
 * 该计数器会在所有附加会话中同时递增。
 * 使用 `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)` 检查最近事件的 scope。
 */
mcpBudgetWarningCount: number;
```

理由：PR 14b 已经将这些名称作为公共 SDK 表面交付；重命名是一个破坏性变更，比稍微不精确的语义更糟糕。

---

## 12. OAuth — 明确推迟到 F3

`connectToMcpServer`（mcp-client.ts:950-1010）中的 OAuth 401 回退需要交互式解决方案（浏览器打开或设备流）。Mode B 守护进程**绝对不能生成浏览器**（根据 PR 21 设计——静态源 grep 测试在 `open`/`xdg-open`/`shell.openExternal` 上构建失败）。

**F2 对需要 OAuth 的服务器的行为**：

1. 第一次 acquire 触发 `connectToMcpServer` → 检测到 401
2. 池捕获需要 OAuth 的异常，将条目标记为 `failed_auth_required`
3. 状态路由暴露 `errorKind: 'auth_env_error'`（现有 PR 13 errorKind）
4. 池**不会自动重试**
5. 运维人员运行 `/mcp auth <name>`（现有 CLI）或使用 PR 21 的设备流路由在磁盘上获取 token → 下一次会话 acquire 重新尝试并成功

**F3 将用 `PermissionMediator` 替换步骤 4-5**，将 OAuth 完成请求路由到附加的会话，由第一个响应的会话处理。

这避免了 F2 混入认证状态机的工作。

---

## 13. 重启路由语义

### 13.1 池化下的 `POST /workspace/mcp/:server/restart`

现在（PR 17）：bootstrap 会话的 manager 中的 restart = 重启该名称的单个条目。

池化下：名称 → 可能有多个条目（同一名称的不同指纹 = 具有不同配置的不同会话）。

**指定行为**：

| 请求                                                  | 行为                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /workspace/mcp/:server/restart`                 | 重启**所有**匹配 `serverName` 的条目（通过 `Promise.allSettled` 并行进行）           |
| `POST /workspace/mcp/:server/restart?entryIndex=0`    | V21-3：只重启条目 #0（来自快照 §8.3 的不透明索引）；如果未找到则返回 404              |
| `POST /workspace/mcp/:server/restart?entryIndex=*`    | 显式“全部”（与无参数相同）                                                           |

响应格式：

```ts
type RestartResult = {
  entryIndex: number;        // V21-7：不透明索引，非原始指纹
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

当 `entries.length === 1` 且没有 `entryIndex` 查询参数时，保留旧格式 `{restarted: true, durationMs}` 以实现向后兼容；客户端可以通过检查 `'entries' in response` 来检测新格式。

### 13.2 正在进行的重启去重

```ts
class PoolEntry {
  private restartInFlight?: Promise<void>;
  async restart(): Promise<void> {
    if (this.restartInFlight) return this.restartInFlight;
    this.restartInFlight = this.doRestart().finally(() => {
      this.restartInFlight = undefined;
    });
    return this.restartInFlight;
  }
}
```

### 13.3 预算检查（保留 PR 17 行为）

重启前，池检查预算：如果断开+重新连接后仍然在预算内，则允许。当前 PR 17 的 `{restarted:false, skipped:true, reason:'budget_would_exceed'}` 语义保留（现在按条目应用）。

### 13.4 重新连接期间正在进行的工具调用（V21-5，新增）

会话 A 调用 `pool.callTool('git.commit', args)` → 请求到达底层子进程的 stdin → 子进程在写入过程中崩溃 → 条目转换到重新连接状态：

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // 重新连接前的代数
  readonly args: unknown;              // 原始参数，供调用者决定是否安全重试
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**规范**：

- 一旦检测到传输断开，正在进行的调用 promise 会立即拒绝（`MCPCallInterruptedError`），不要等待重新连接
- 池**不会自动重试**该调用；对于写操作（commit、文件编辑等）语义不安全，并且池无法区分读和写
- 调用者（通常是代理循环中的工具执行层）捕获此错误并决定：重试 / 向用户展示 / 中止
- 重新连接后：会话 A 可以再次调用（相同的 `PooledConnection.callTool`）；池透明地路由到新的传输实例
- `MCPCallInterruptedError.clientGeneration` 允许调用者在需要时与后续的 `reconnected` 事件关联

测试 21.6 必须覆盖：生成一个长时间运行的 stdio MCP，发送工具调用，在调用中途杀死子进程，断言 `MCPCallInterruptedError` 拒绝且 `clientGeneration` 非零。

---

## 14. 状态路由重构

### 14.1 新的查询路径

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — 替换数据源
let accounting: McpClientAccounting | undefined;
try {
  // 新增：通过桥接的 extMethod 直接查询池，而不是 bootstrap 会话
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // 回退到传统的 bootstrap 会话路径，用于非池守护进程
  const manager = config.getToolRegistry()?.getMcpClientManager();
  if (manager) accounting = manager.getMcpClientAccounting();
}
```

`QwenAgent` 暴露 `getMcpPoolAccounting()`：

```ts
class QwenAgent {
  getMcpPoolAccounting(): McpClientAccounting | undefined {
    return this.mcpPool?.getAccounting();
  }
}
```

ACP 子进程通过 `extMethod` 桥接，供守护进程调用。

### 14.2 entryCount + entrySummary

见 §8.3。

### 14.3 无 bootstrap 会话的情况

现在（PR 12），当守护进程空闲（尚无会话）时，`GET /workspace/mcp` 返回 `initialized: false`，因为没有 bootstrap 会话可查询。

池化下：池在 `QwenAgent` 构造函数中就存在 → 状态路由可以返回实时的 accounting，**即使零会话**。单元格 `initialized: true`，甚至第一个会话之前都是 true。在 PR 描述中记录此**行为变更**；不是回归。

---

## 15. loadSession / resume 交互（PR 6 #4222）

### 15.1 恢复时的排空取消

```
session-A 活动，持有 entry-X 的引用
session-A 断开连接（无显式关闭）→ 最终 killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → 排空计时器启动（30 秒）
session-A 在 30 秒内恢复 → 新的 newSessionConfig → pool.acquire 返回 entry-X → attach 取消排空
session-A 在 30 秒后恢复 → entry-X 已关闭 → 池生成新条目（冷启动）
```
### 15.2 `restoreState` 缓存窗口（5 分钟，源自 PR 6）

`acpAgent.restoreState` 在断开连接后保留 5 分钟。连接池排空（默认 30 秒）< 恢复窗口（5 分钟）→ 在 30 秒到 5 分钟之间恢复会触发 MCP 冷启动。这是一种可接受的权衡（恢复本身是稀有路径）。

替代方案：连接池读取守护进程的 restore-window 配置并延长排空时间以匹配。这增加了连接池与会话状态机之间的耦合；**推迟到后续版本处理，除非用户报告冷启动问题**。

### 15.3 `pendingRestoreIds` 交互

`acpAgent.killSession()` 必须在清理 `pendingRestoreIds` **之后**调用 `pool.releaseSession(sid)`。顺序如下：

1. 将会话标记为可恢复（`pendingRestoreIds.add(sid)`）
2. Session.close() —— 但连接池引用仍然持有
3. 在 `RESTORE_WINDOW_MS` 过期且未恢复后：`killSession` 永久清理 → `pool.releaseSession(sid)` 触发排空

这避免了排空在恢复窗口期间触发。

---

## 16. 热配置重载

### 16.1 通过指纹变更的隐式重载

用户在运行过程中编辑 `~/.qwen/settings.json`，更改某个服务器的环境变量：

1. 旧会话保留旧的 `Config`/`McpServers` 快照 → 继续获取旧指纹 → entry-OLD 引用持续存在
2. 新会话读取新设置 → 新指纹 → entry-NEW 创建 → 与 entry-OLD 共存
3. 旧会话自然关闭 → entry-OLD 排空 → 最终关闭
4. 稳态：仅 entry-NEW 存在

**不进行运行中连接的实时变更**——在不同配置版本的会话之间保持干净分离。

### 16.2 强制重载路径（可选）

```
POST /workspace/mcp/reload-all
  → 对于每个会话：重新加载设置，交换 Config.mcpServers
  → 对于不再被引用的 entry：安排逐出
```

适用于“我更改了环境变量，希望立即在所有会话中生效”的场景。推迟到 F2 后续版本（非阻塞）。

### 16.3 扩展卸载孤立条目（V21-15）

场景：扩展 `foo-ext` 注册了 MCP 服务器 `foo-server`。操作员运行 `/extension uninstall foo-ext`。扩展生命周期从 `extensionMcpServers` 中移除 `foo-server`，因此后续的 `loadCliConfig` 调用不会包含它。但是：

- 活动会话持有的 `Config` 快照仍包含 `foo-server` → 这些会话继续使用该条目
- 卸载后的新会话不会获取（服务器不再位于其合并的 mcpServers 中）→ 引用计数不增加

**解决方案**：依赖自然排空。随着旧会话关闭，引用计数下降；最终条目达到 `MAX_IDLE_MS = 5min` 并被强制关闭。**不提供显式的 `pool.invalidateByExtension(name)` API**——保持模型与热配置重载一致（§16.1）。

权衡：如果长时间运行的会话保持活动，扩展的服务器在卸载后可能最多运行 5 分钟。可接受；如果情况紧急，操作员可以先 `/mcp restart foo-server` 然后杀掉会话。

---

## 17. 关闭顺序

`QwenAgent.close()` 序列（必须强制执行）：

```
1. 设置 acceptingNewSessions = false；拒绝新的 POST /session
2. 对于每个进行中的 prompt：发送取消信号，等待完成（现有 PR 11 生命周期）
3. 对于每个会话：触发 close → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← 绕过 30 秒 grace
   ├── 对于每个 entry：取消排空 + 健康检查定时器，标记为 draining
   ├── 对于每个 entry 并行：listDescendantPids → SIGTERM 子进程
   ├── 对于每个 entry 并行：client.disconnect()
   └── Promise.race 与 timeoutMs；超时后的条目接收 SIGKILL
5. 桥接通道关闭
6. 进程退出
```

**V21-11**：`drainAll` 签名：

```ts
async drainAll(opts?: {
  force?: boolean;       // 默认为 false；true 绕过 30 秒 grace 定时器
  timeoutMs?: number;    // 默认为 10000；墙上时钟预算；超时后 SIGKILL 剩余条目
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // 干净断开的条目数
  forced: number;        // 超时后被 SIGKILL 的条目数
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

调用者使用 `DrainResult` 进行关闭日志记录；如果 `forced > 0`，记录一条警告，以便操作员知道某个服务器未正常关闭。

---

## 18. 文件布局

**新增文件：**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool 主要逻辑（约 700 行）
  mcp-pool-key.ts              # fingerprint + canonicalize 辅助函数（约 150 行）
  mcp-pool-entry.ts            # PoolEntry：refcount + drain + health + generation（约 500 行）
  session-mcp-view.ts          # SessionMcpView：过滤 + 注册 tools/prompts（约 200 行）
  mcp-pool-events.ts           # PoolEvent 区分联合（约 80 行）
  pid-descendants.ts           # 跨平台 listDescendantPids（约 150 行，含测试）

packages/core/src/tools/
  mcp-transport-pool.test.ts   # 约 900 行
  mcp-pool-entry.test.ts       # 约 400 行
  session-mcp-view.test.ts     # 约 250 行
  mcp-pool-key.test.ts         # 约 150 行
  pid-descendants.test.ts      # 约 200 行（Unix + Windows 跳过门控）
```

**变更文件：**

```
packages/core/src/tools/mcp-client.ts            # discoverAndReturn() 拆分；connectToMcpServer 统一
packages/core/src/tools/mcp-client-manager.ts    # 可选的 pool 参数；预算状态条件化
packages/core/src/tools/tool-registry.ts         # 从 config 将 pool 传入 McpClientManager
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # QwenAgent.mcpPool 构造；broadcastBudgetEvent；
                                                 # newSessionConfig 将 pool 注入 Config；
                                                 # killSession 调用 pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # 传递 --mcp-pool-transports + budget env 给 ACP 子进程
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus 读取 pool；
                                                 # restartMcpServer extMethod 返回 RestartResult[]
packages/cli/src/serve/capabilities.ts           # 声明 mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope?: 可选字段；isWorkspaceScopedBudgetEvent 辅助函数
```

---

## 19. 单 PR 交付——提交分解（V21-1）

根据维护者关于功能内聚批处理的指导（#4175 分支策略 2026-05-19），F2 作为**一个包含 6 个原子提交的 PR** 交付。审阅者可以使用 `git log -p HEAD~6..HEAD` 逐步查看，并逐一提交进行审阅。

| 提交 # | 标题                                                                                                       | 范围                                                                                                                                                                                                                                                                                                                                                                                                                  | 涉及文件                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1      | `refactor(core): 将 McpClient.discover 拆分为纯工具/提示列表并统一连接路径`                                | 添加 `discoverAndReturn()`；提取共享的 `establishConnection()`，供 `McpClient.connect()` 和 `connectToMcpServer()` 工厂使用；旧的 `discover()` 成为薄包装器，负责注册（保持独立 qwen 行为）。零可观察行为变更。                                                                                                                                                                                                         | `mcp-client.ts`, `mcp-client.test.ts`                                                                                    |
| 2      | `feat(core): McpTransportPool + SessionMcpView`                                                            | Pool 核心：`fingerprint`、refcount、`spawnInFlight` 去重、`sessionToEntries` 反向索引、drain 状态机、attach 时的快照重放、generation 保护、tool+prompt 双扇出、每个会话的信任副本。用于单元测试的 Mock McpClient。无生产连线。                                                                                                                                                                                         | 新增 `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + 测试 |
| 3      | `feat(core): 跨平台后代进程扫描 + 池健康监视器`                                                             | `listDescendantPids`（Unix `pgrep -P` 递归，Windows PowerShell CIM）；`PoolEntry` 内部的统一健康监视器（间隔检查 + 失败计数 + 按 §6.6 重连退避）；子进程生成集成测试门控于 `QWEN_INTEGRATION === '1'`。                                                                                                                                                                                                               | 新增 `pid-descendants.ts` + 测试；`mcp-pool-entry.ts`                                                                    |
| 4      | `feat(serve): 将 McpTransportPool 接入 QwenAgent 守护进程模式`                                              | `Config.setMcpTransportPool` + `getMcpTransportPool`；`ToolRegistry` 将 pool 传入 `McpClientManager`；`McpClientManager` 可选的 `pool?` 构造函数参数；`acpAgent.QwenAgent` 在初始化时构造 pool；`newSessionConfig` 注入；`killSession` 调用 `pool.releaseSession`；SDK MCP + HTTP/SSE 通过 `createUnpooledConnection` 绕过；CLI 标志 `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`。 | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                               |
| 5      | `feat(serve): 池感知状态 + 重启路由`                                                                        | `QwenAgent.getMcpPoolAccounting` extMethod；`httpAcpBridge.buildWorkspaceMcpStatus` 优先使用池，回退到引导会话；`restartMcpServer` 接受 `?entryIndex=` 并返回 `RestartResult[]`；在 cell 中显示 `entryCount` + `entrySummary[].entryIndex`；能力标签 `mcp_workspace_pool` + `mcp_pool_restart`。                                                                                                                        | `httpAcpBridge.ts`, `capabilities.ts`, SDK 类型                                                                         |
| 6      | `feat(serve): 将 MCP 预算保护升级到工作空间范围`                                                             | 将 `tryReserveSlot`/`releaseSlotName`/滞环状态机从 `McpClientManager` 移动到池；移除 `acpAgent.newSessionConfig` 中每个会话的 `setMcpBudgetEventCallback` 连线；`QwenAgent.broadcastBudgetEvent` 扇出；快照 cell `scope: 'workspace'`；SDK `scope?` 新增可选字段；`isWorkspaceScopedBudgetEvent` 辅助函数；内联文档更新。                                                                                                 | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                 |

**总代码行数估计**：约 4100 生产代码 + 约 1900 测试 = 约 6000 行（v2 估计约 3850；增长吸收了 V21 修正）。

**合并目标**：单 PR 合入 `daemon_mode_b_main`。按照 #4175 策略定期批量合入 `main`。

**打开 PR 前的自我审查流程**：

1. 每个提交后，对提交差异运行 `code-reviewer` 代理；将采纳的发现合并到同一提交中
2. 对于提交 2/4/6（设计风险最高），额外运行 `silent-failure-hunter` + `type-design-analyzer`
3. 所有 6 个提交落地后：在完整 PR 差异上由不同代理组合进行 3 轮完整审查
4. 在所有涉及的包上运行完整测试套件 + 类型检查 + lint

镜像 PR 21 的专家预审查模式。

---

## 20. 能力标签 + SDK 合约变更

### 20.1 新能力标签（在 v0.16、V21-1 中原子化声明）

由于 F2 作为一个 PR 交付，三个标签一起声明。池消费者可以假设 **`mcp_workspace_pool` 声明 ⇒ `entryCount`/`entrySummary`/`scope?` 字段均存在**；无需逐个字段进行能力检查。

| 标签                        | 声明时机                                                                                     | 含义                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`       | 当 `QwenAgent.mcpPool !== undefined`（守护进程模式下始终为 true，除非使用 `--no-mcp-pool` 关闭开关） | `GET /workspace/mcp` 反映池级别状态；包含 `entryCount` + `entrySummary` 字段                        |
| `mcp_pool_restart`         | 当 `mcp_workspace_pool` 开启时始终存在                                                       | `POST /workspace/mcp/:server/restart` 接受 `?entryIndex=` 并可能返回 `entries: RestartResult[]` |
| （扩展 `mcp_guardrails`） | 未变更                                                                                       | 同一标签，载荷扩展了 `scope`（在 F2 下为 `'workspace'`）                                            |

### 20.2 SDK 新增表面

```ts
// @qwen-code/sdk — 仅添加，不加修改
export interface DaemonMcpBudgetWarningData {
  // 现有字段...
  scope?: 'workspace' | 'session'; // 新增——旧守护进程上不存在（默认为 'session'）
}

export interface DaemonMcpChildRefusedBatchData {
  // 现有字段...
  scope?: 'workspace' | 'session';
}

export interface ServeWorkspaceMcpServerStatus {
  // 现有字段...
  entryCount?: number;
  entrySummary?: Array<{
    fingerprint: string;
    refs: number;
    status: MCPServerStatus;
  }>;
}

export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`EVENT_SCHEMA_VERSION` 保持为 `1`（仅增加）。

---

## 21. 测试矩阵

### 21.1 池键（F2-2）

- 相同配置 → 相同键（环境变量键排列稳定，头部键排列稳定）
- 环境变量值差 1 字节 → 不同键
- 头部 `Authorization` 值不同 → 不同键
- `includeTools`/`excludeTools`/`trust` 变更 → 相同键（每个会话的过滤器）
- 两个内容相同的 `new MCPServerConfig(...)` → 相同键（规范哈希，而非身份）

### 21.2 生命周期（F2-2）

- 3 个会话获取相同键 → 1 次启动（通过 `client.connect` 间谍验证）
- 释放顺序 n, n-1, ..., 1 → 排空计时器仅在 1→0 时启动
- 30 秒排空：在第 25 秒获取会取消计时器；在第 35 秒获取会启动新 entry
- `MAX_IDLE_MS`（5 分钟）硬性关闭，即使排空持续波动
- 启动过程中生成失败：所有等待者收到错误；释放插槽；不存储 entry

### 21.3 并发获取（F2-2）

- 5 个同时 `acquire(sameKey)` 且不存在 entry → 正好 1 次 `spawnEntry` 调用，所有 5 个获取到同一个 entry
- 生成拒绝 → 所有 5 个等待者以相同错误拒绝；后续获取重新生成

### 21.4 每会话隔离（F2-2）

- 会话 A 设置 `excludeTools: ['foo']`，会话 B 无排除 → A 的 ToolRegistry 省略 foo，B 有；均来自同一个 `toolsSnapshot`
- 会话 A 设置 `trust: true`，会话 B 设置 `trust: false` → 会话 A 的 `DiscoveredMCPTool.trust === true`，B 的 `false`；验证 NOT 共享引用（修改一个不影响另一个）
- 会话 A 获取仅提示服务器 → A 的 PromptRegistry 填充，ToolRegistry 对该服务器为空

### 21.5 工具/提示列表变更（F2-2）

- 服务器发送 `notifications/tools/list_changed` → 所有订阅者的 `applyTools` 被调用并传入新快照
- 来自预重连 generation 的过时 handler 不会覆盖快照
- `notifications/prompts/list_changed` 类似

### 21.6 崩溃 + 重连（F2-2）

- 通过 `process.kill` 杀掉子进程 → 订阅者收到 `disconnected` 事件
- 3 次重连尝试（使用现有 `MCPHealthMonitorConfig`）→ 成功 → `reconnected` + 新快照
- 重连次数耗尽 → 所有订阅者收到 `failed`；entry 转换到 `failed` 状态；新的获取会重试一次然后抛出异常

### 21.7 后代进程扫描（F2-2b）

- Linux/macOS：使用 `bash -c "sleep 60 & sleep 60"` 作为 stdio 命令生成 → 杀掉根进程 → 验证两个后代被回收（轮询 `/proc/<pid>/status`，或 `kill(0, pid) === false`）
- Windows：使用 `cmd /c "ping -t localhost"` 包装器生成 → 杀掉 → 验证 ping 子进程消失
- `pgrep` 不可用（PATH 缺失）→ 优雅降级：记录警告，仅 SIGTERM 根进程，不崩溃

### 21.8 工作空间范围的预算（F2-4）

- 4 个会话 × `--mcp-client-budget=2` 加上 3 个静态 MCP 服务器 → 工作空间总数为 3（不是 12）；快照 cell `scope: 'workspace'`, `liveCount: 3`
- 预算警告在跨越整个工作空间 75% 阈值时触发一次；同时广播到所有 4 个会话
- 滞环解除：降至 37.5% → 下次跨越再次触发

### 21.9 向后兼容（F2-3）

- 独立 `qwen`（无守护进程）→ `mcpPool === undefined` → 所有现有 `mcp-client-manager.test.ts` 测试原样通过
- `--no-mcp-pool` 守护进程标志 → 回退到每会话模式，所有现有守护进程 e2e 测试通过

### 21.10 凭据隔离（F2-3）

- 会话 A 注入 `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`，会话 B 注入 `tokenB` → 2 个独立进程；通过快照 `entryCount: 2` 验证；验证 A 的工具调用通过 A 的传输（通过 stdin/log 中的头部检查）

### 21.11 LoadSession / 恢复（F2-3）

- 会话关闭 → 排空启动 → 30 秒内恢复 → 池 entry 重用（无冷启动，通过 `client.connect` 间谍计数断言）
- 30 秒后但在恢复窗口过期前恢复 → 池冷启动；restoreState 内容仍然保留

### 21.12 重启路由（F2-3b）

- 名称对应 1 个 entry → `POST /workspace/mcp/foo/restart` 返回传统 `{restarted: true, durationMs}` 形状
- 名称对应 2 个 entry（不同指纹）→ 返回 `{entries: [{fingerprint, restarted, ...}, ...]}`
- 重启时另一个重启正在进行 → 第二次调用返回同一 promise（去重）
- 重启时预算会超出 → 每个 entry 返回 `{restarted: false, skipped: true, reason: 'budget_would_exceed'}`

### 21.13 状态路由（F2-3b）

- 空闲守护进程（无会话）但池中有来自之前会话的缓存 entry → `GET /workspace/mcp` 返回 `initialized: true` 并带有实时统计
- 引导会话不存在 → 回退到池直接路径；无错误
- 池查询抛出异常 → 回退到引导会话路径；永远不会使快照崩溃

### 21.14 SDK reducer（F2-4）

- 当工作空间事件广播时，`mcpBudgetWarningCount` 在所有订阅会话中同时递增
- `isWorkspaceScopedBudgetEvent(e)` 正确地从载荷中识别作用域
- 旧守护进程（无 `scope` 字段）→ 默认解释为 'session'

### 21.15 热配置重载（F2-3）

- 运行中修改 settings.json → 旧会话保留旧 entry，新会话创建新 entry，两者共存；当最后一个旧会话关闭时，旧 entry 自然排空
- 旧会话关闭后 0 个会话 → 排空计时器触发 → 旧 entry 被 GC → 仅剩余新 entry

### 21.16 关闭顺序（F2-3）

- `QwenAgent.close()` 按顺序触发：停止接受 → 排空 prompts → 关闭会话 → `pool.drainAll` → 退出后在 `pgrep -P <acpChildPid>` 中无僵尸进程
---

## 22. 开放问题

V21 锁定了 Q1/Q3/Q4/Q6 的设计默认值（单次 PR 交付）。Q2/Q5/Q7/Q8/Q9 仍待定。

| #     | 问题                                                                                                          | F2 设计默认值                                                                               | 需在之前做出决策       |
| ----- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- |
| Q1 ✅ | SDK reducer 字段名 — 重命名还是保留？                                                                         | **锁定 v2.1**：保留 `mcpBudgetWarningCount` 等，在 JSDoc 中扩展作用域语义                  | 已解决                 |
| Q2    | `mcp_workspace_pool` 能力 — 提升 `protocolVersions`（'v1' → 'v1.1'），还是保持 'v1' 的增量方式？               | **保持 'v1' 增量**（与 PR 14b 先例一致）                                                    | commit 5               |
| Q3 ✅ | `--no-mcp-pool` 标志 — 默认启用还是选择加入？                                                                  | **锁定 v2.1**：默认启用；`--no-mcp-pool` 作为禁用开关                                       | 已解决                 |
| Q4 ✅ | HTTP/SSE 默认值 — 启用池还是关闭？                                                                            | **锁定 v2.1**：池关闭；通过 `--mcp-pool-transports` 选择加入                                | 已解决                 |
| Q5    | `POST /workspace/mcp/reload-all` — 包含在 F2 中还是后续版本？                                                  | **后续版本**                                                                                | 不适用（已推迟）       |
| Q6 ✅ | 延迟池构造 — 是否值得增加条件分支？                                                                           | **锁定 v2.1**：立即构造（在 `QwenAgent` 构造函数中始终构建）                                | 已解决                 |
| Q7    | `restoreState` 窗口与池释放 — 保持分离、对齐还是从设置中读取？                                                  | **保持分离的 30 秒默认值** + 配置项 `--mcp-pool-drain-ms`                                   | commit 4               |
| Q8    | OAuth 处理 — 确认推迟到 F3，并记录变通方法？                                                                  | **推迟到 F3**，记录 `/mcp auth <name>` 变通方法                                             | commit 4               |
| Q9    | `entrySummary` 暴露 — 始终包含，还是放在 verbose 标志之后？                                                     | **始终包含**（负载小，对运维有用）                                                           | commit 5               |
| Q10   | 更新 `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` 第 #3 条决策 — 与 @wenshao 协调？      | F2 PR 描述链接 codeagents PR；两个 PR 独立审查                                              | PR 已开启              |

---

## 23. 风险

### 高

- **R1（A2 全局状态）**：多入口同名的 `serverStatuses` 冲突。通过聚合状态函数缓解；剩余风险是 SDK 消费者直接读取全局 Map（不太可能——仅通过 `getMCPServerStatus(name)` 访问器使用）。
- **R2（PromptRegistry 对称性）**：任何代码路径中遗漏 prompt 广播都会静默丢失 prompts。通过 F2-2 测试 21.4 第三点 + 集成测试断言 prompt 与 F2 前的一致性来缓解。
- **R3（HTTP 传输状态泄漏）**：为维护每传输状态的服务器选择 HTTP 池会导致会话上下文损坏。通过默认关闭 + 文档记录缓解；无法自动检测。

### 中

- **R4（路径统一 F2-1）**：`connectToMcpServer` 工厂和 `McpClient` 类在行为上存在细微差异（例如，构造函数时公告的能力 vs 连接时公告的能力）。通过 F2-1 作为纯粹的代码重构 PR，并在池工作开始前进行完整的回归测试覆盖来缓解。
- **R5（Windows 后代进程 ID）**：PowerShell `Get-CimInstance` 可能较慢（生成成本）或被 AppLocker 阻止。通过 2 秒超时 + 优雅降级缓解。
- **R6（池事件广播放大）**：预算警告向 100 个会话广播会导致在紧密循环中产生 100 次 extNotification 调用。通过 `Promise.all` 并行化 + 每会话捕获（现有 PR 14b 模式）缓解。

### 低

- **R7（跨 MCPServerConfig 版本的指纹稳定性）**：未来在 `MCPServerConfig` 中添加的字段如果未包含在指纹中，将静默地允许错误共享。通过显式的规范化函数 + 测试枚举所有 `MCPServerConfig` 字段并断言覆盖来缓解。
- **R8（生成计数器竞争）**：快速重启循环可能耗尽 JS 数字精度（≈ 2^53 = 约 285k 年，以 1/s 计）。实际中无需担忧。

### 单 PR 特有（V21-14）

- **R9（约 6000 LOC 单 PR 的审查疲劳）**：审查者的带宽成为关键路径。F3 阻塞在 F2 合并上 → 阻塞其他贡献者。缓解措施：(a) 使用 3 个专项 agent 进行预审查，并在开启 PR 前合并 P0/P1 缺陷，借鉴 PR 21 的模式；(b) 结构化为 6 个原子提交，便于审查者逐步检查；(c) 通过 #4175 的评论提前与 @wenshao 协调审查窗口。
- **R10（`daemon_mode_b_main` 合并冲突积累）**：F2 涉及 `acpAgent.ts`、`httpAcpBridge.ts`、`capabilities.ts`、`mcp-client*.ts`——均为热点文件。F3/F4 贡献者在此期间并行落地可能会在 F2 的 1-2 周审查窗口内产生冲突。缓解措施：每日执行 `git rebase origin/daemon_mode_b_main`；通过 #4175 更新告知 F2 正在审查中，并要求 F3/F4 在 F2 合并前延迟对热点文件的修改。
- **R11（CI 执行时间）**：新增约 1900 LOC 测试，包括子进程生成 + 跨平台 pid 扫描，可能将 CI 时间从 30 分钟推至 50 分钟。缓解措施：(a) 子进程测试通过 `process.env.QWEN_INTEGRATION === '1'` 门控，PR CI 中运行子集 + 夜间运行完整集；(b) Vitest 并行度 ≥ 4；(c) Windows pid 扫描测试仅跳过 GHA Windows runner 上的门控。

---

## 24. 文档更新

| 文档                                                                             | 更新内容                                                                                                                                                  | 时间                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`               | 第 #3 条决策 "MCP server 生命周期"：当前为 "per-session"；更新为 "在守护模式下使用配置哈希键进行工作空间池化；独立模式下保持每会话"                      | F2-3 合并（与 @wenshao 的 codeagents PR 协调） |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                               | Wave 5 PR 23 → 标记为 F2 系列；链接到 PR                                                                                                                | F2-3 合并                    |
| `packages/cli/src/serve/README.md`（如果存在）或新建 `docs/serve/mcp-pool.md`     | 新章节：池语义、指纹键、传输选择加入、重启语义、状态快照解读                                                                                             | F2-3b                        |
| `packages/sdk/README.md`                                                         | `scope?` 字段（防护事件）、`entryCount`（服务器状态）、辅助函数 `isWorkspaceScopedBudgetEvent`                                                          | F2-4                         |
| Issue #4175 正文                                                                 | 使用子 PR 表格更新 F2 条目，链接到设计 v2（本文档）                                                                                                      | F2-1 开启前                  |
| Issue #3803 正文                                                                 | 第 #3 条决策行：更新 "当前每会话" → "在守护模式下进行工作空间池化 (F2)"                                                                                   | F2-3 合并后                  |
| `acpAgent.ts:869-936` 内联注释                                                  | 删除 "Wave 5 PR 23" 的前向引用；更新为 "由 F2 升级为 `scope: 'workspace'`"                                                                              | F2-4 PR                      |
| CHANGELOG / 发布说明（Wave 6 / F5）                                              | 标题行："MCP 进程现在在工作空间内的会话间共享"                                                                                                            | F5 发布                      |

---

## 25. PR 描述模板（单 PR 交付）

```markdown
## feat(serve): 共享 MCP 传输池（工作空间作用域）[F2]

根据 #4175 分支策略（2026-05-19）的单一功能内聚 PR。
替代原计划中的 Wave 5 PR 23 + 子 PR F2-1..F2-4。

### 范围

~4100 LOC 生产代码 + ~1900 LOC 测试，分布在 6 个原子提交中。
使用 `git log -p HEAD~6..HEAD` 逐提交进行审查。

### 设计文档

参见 `docs/design/f2-mcp-transport-pool.md` (v2.1)。

### 预审查专项 agent（参照 PR 21 模式）

在开启 PR 前已合并到第一个提交中：

- code-reviewer：N 项发现，全部采纳
- silent-failure-hunter：N 项发现，全部采纳
- type-design-analyzer：N 项发现，全部采纳

### 关闭

（无 — #4175 中的 F2 条目保持开启，直到 PR 合并到主批次）

### 关联

- #3803 第 #3 条决策更新（codeagents PR <链接>）
- PR 14b (#4271 已合并) — 预算防护基础；F2 将其作用域升级为工作空间
- F1 (#4319 已合并) — acp-bridge 包；F2 依赖于注入接缝

### 向后兼容性

- 独立 `qwen`（非守护模式）：不构造池；保留现有行为
- 守护模式 `qwen serve --no-mcp-pool`：禁用开关恢复为每会话模式
- SDK：所有新字段均为增量添加（`entryCount`、`scope?`）；`EVENT_SCHEMA_VERSION` 保持为 1
- 旧版 SDK 客户端：根据 PR 14 契约忽略未知的 `scope: 'workspace'`
- 旧版守护程序：SDK 消费者可以检测到 `mcp_workspace_pool` 能力缺失并回退

### 测试计划

- [ ] 池键：环境变量的稳定性，下标的发散性，每会话过滤器排除
- [ ] 生命周期：3 个会话共享，优雅释放，并发获取去重，生成失败槽位释放
- [ ] 工具 + Prompts 双向广播，每会话信任复制，附加时快照重放
- [ ] 生成防护：重新连接前的处理器不会覆盖重新连接后的快照
- [ ] 崩溃 + 重连（stdio 退避 5s × 3 和 HTTP 退避 1/2/4/8/16s × 5）
- [ ] 后代进程 pid 扫描：Linux/macOS 的 pgrep 递归，Windows PowerShell CIM
- [ ] 工作空间作用域的预算：4 个会话 × 预算=2 → 最多 3 个（不是 12）；广播到所有已附加的会话
- [ ] 在释放窗口内恢复 LoadSession：复用池条目，无冷启动
- [ ] 热配置重载：新旧条目共存；旧条目自然释放
- [ ] 重启路由：`?entryIndex=` 选择性；保留旧版单条目响应形状
- [ ] 重连期间正在进行的工具调用：`MCPCallInterruptedError` 拒绝
- [ ] 独立 qwen：所有现有的 mcp-client-manager 测试保持不变
```

## 总结

F2 v2.1 = 单 PR，包含 6 个原子提交（约 6000 LOC），目标分支为 `daemon_mode_b_main`。关键设计支柱：

1. **`McpTransportPool`** 位于 `packages/core`（ACP 子端），工作空间作用域，引用计数 + 30 秒释放
2. **指纹键** 对规范配置（包括环境变量/标头）进行 SHA-256 哈希（遵循 claude-code 模式），排除每会话过滤器（includeTools/trust）
3. **`SessionMcpView`** 每会话工具+prompt 注册表投影，包含信任复制
4. **快照重放 + 生成防护**，用于附加竞争和过时通知
5. **跨平台后代进程 pid 扫描**（opencode 模式 + Windows 移植）
6. **HTTP/SSE 选择加入**，SDK MCP 绕过，OAuth 推迟到 F3
7. **预算状态机** 升级到工作空间作用域；快照单元格 + 推送事件以增量方式扩展（`scope?`）
8. **状态 + 重启路由** 重构：优先使用池，降级到引导会话；`entryCount` + `RestartResult[]`

**第 22 节中的开放问题 Q1-Q10** 需要在各自子 PR 开启前由维护者做出决策。建议在 F2-3 开始前解决 Q1-Q4（它们决定了总体方向）；Q5-Q10 可以增量解决。