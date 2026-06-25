# F2: 共享 MCP 传输连接池 — 设计文档 v2.2

> 目标分支 `daemon_mode_b_main`（参见 #4175 分支策略）。替代 #4175 Wave 5 PR 23。
> **单 PR 交付**，遵循维护者的功能内聚批次指导方针（2026-05-19）。
> 作者：doudouOUC。日期：2026-05-20。修订：2026-05-20（v2.2 — 实现评审折叠合并）。

---

## 0. 变更记录

### v2.2（2026-05-20）— PR #4336 实现 + 32 处评审折叠合并

PR #4336 在约 4 小时内以 6 个原子提交 + 6 个修复提交的形式发布了 F2。Wenshao 分 3 批累积评审；每批产生了内联与关键修复并折叠回主干。下表按评审批次记录了相对于 v2.1 的变更内容。

#### v2.1 → 首轮评审批次（提交 1-4，wenshao C1-C7 + S1-S4）

| #   | 位置                                                       | 问题说明                                                                                                                                                            | 折叠提交       |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| C1  | `acpAgent.ts:269` — IDE 关闭路径                           | 连接池 drain 仅在 SIGTERM 处理器中运行；IDE 发起的正常关闭会泄漏条目，直到 OS 回收。现已在 `await connection.closed` 时镜像 SIGTERM 的连接池 drain 逻辑              | `ae0b296c4`    |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                       | `cancelDrainTimer` 在每次抖动时重置 `maxIdleTimer`，破坏了 §6.3 的硬上限。现在只清除 `drainTimer`；max-idle 在整个条目生命周期内保持有效                              | `ae0b296c4`    |
| C3  | `mcp-pool-entry.ts:doRestart`                              | 重连失败后条目停留在僵尸状态（`localStatus=CONNECTED`、`state='active'`、快照陈旧）。已加 try/catch，失败时转为 `'failed'` 状态                                       | `ae0b296c4`    |
| C4  | `mcp-pool-entry.ts:forceShutdown`                          | `state='closed'` 在 await 之后才被设置，并发的 `acquire` 可能观察到 `'active'` 并分发陈旧连接。现已在顶部同步设置                                                    | `ae0b296c4`    |
| C5  | `mcp-transport-pool.ts:drainAll`                           | 并发的 `acquire` 可能在 drain 中途生成新条目。已添加 `draining` 互斥标志 + 在清空前 `await Promise.allSettled(spawnInFlight)`                                         | `ae0b296c4`    |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                   | 监听器未按 `serverName` 过滤；每个条目都会收到所有服务器的状态通知，且条目自身的 `markActive` 写操作也会回显                                                          | `ae0b296c4`    |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`     | Pool 模式门控已添加到 `discoverAllMcpTools`，但漏掉了 `Incremental`——`/mcp refresh` 绕过了连接池，为每个会话生成独立客户端                                            | `ae0b296c4`    |
| S1  | `session-mcp-view.ts:passesSessionFilter`                  | 文档未说明 `excludeTools` 使用直接相等比较（不支持括号形式）；与 `mcp-client.ts:isEnabled` 存在分歧                                                                   | `ae0b296c4`    |
| S2  | `pid-descendants.ts` 文档注释                              | 声称存在 Windows 专用的 `taskkill /F` 分支，实际上不存在——Node 将 `process.kill('SIGTERM')` 桥接到 `TerminateProcess`                                                 | `ae0b296c4`    |
| S3  | `session-mcp-view.ts:applyTools` 调试日志                  | 字符串包含字面量 `"N"` 而非插值——运维人员看到 `applied 12 tools (filtered to N registered)`                                                                          | `ae0b296c4`    |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` 状态回调  | 硬编码为 `() => CONNECTED`，导致断开后 `aggregateStatusByName` 返回错误状态。现已改为 `() => client.getStatus()`                                                      | `ae0b296c4`    |

#### 提交 5 自评审批次（R1-R3 小修）

| #   | 位置                                            | 问题说明                                                                                                                                             | 折叠提交       |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R1  | `server.test.ts:918` `/capabilities` 信封        | 测试断言的是 `getAdvertisedServeFeatures()`（无切换），但 server.ts 传入的是 `mcpPoolActive: opts.mcpPoolActive !== false`（默认开启）。已锚定切换      | `3e68c00bc`    |
| R2  | `server.test.ts` 能力默认开启覆盖率              | 没有测试以默认选项启动来验证连接池标签是否广播。已添加显式 `mcpPoolActive: false` 测试                                                               | `3e68c00bc`    |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`    | 文档称旧版 SDK 会"将新值视为未知并通用呈现"——实际上 `MCP_RESTART_REFUSED_REASONS.has(...)` 拒绝后会静默丢弃                                           | `3e68c00bc`    |

#### 第二轮评审批次（提交 1-5，wenshao R1-R10）

| #   | 位置                                                | 问题说明                                                                                                                                                                                              | 折叠提交       |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                    | C2 的修复正确保留了抖动间的 `maxIdleTimer`，但触发动作会无视 `refs.size` 强制关闭。若活跃会话在宽限期内重新连接，5 分钟后会丢失工具                                                                   | `72399f109`    |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`  | 每次遍历都 `releaseAllPooledConnections` 再重新获取所有连接，留下短暂的零 MCP 工具窗口，同时使所有 drain 计时器抖动。现改为对比期望的 `(name, fingerprint)` 差异                                       | `72399f109`    |
| WR3 | `mcp-pool-entry.ts:doRestart` 快照扇出              | 重启会更新 `toolsSnapshot`/`promptsSnapshot` 并发出类型化事件——但没有 `SessionMcpView` 实例订阅该流。现在快照更新后直接遍历 `subscribers`                                                             | `72399f109`    |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount` | 将 websocket 计入 `subprocessCount`——websocket 连接远程端，无本地子进程。现已限制为仅计 `'stdio'`                                                                                                      | `72399f109`    |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`           | 将 `${pid}` 直接插入 `-Filter` 字符串。入口处的 `Number.isInteger` 守卫目前可防注入；绑定到 `$p` 以在未来守卫放宽时提供纵深防御                                                                       | `72399f109`    |
| WR6 | `mcp-pool-entry.ts` 构造函数 `cfg` 字段             | `readonly cfg: MCPServerConfig` 隐式公开，暴露了 env API key / header auth / OAuth 字段。已改为 `private`；新增 `transportKind` getter 供唯一外部读取方使用                                          | `72399f109`    |
| WR7 | `mcp-pool-events.ts` 过早导出                       | 5 个 PoolEvent 类型守卫 + `Prompt` 重导出 + `PoolEntryConnectionStatus` 零调用方。已移除；保留 `MCPCallInterruptedError`（设计 §13.4 强制要求）                                                       | `72399f109`    |
| WR8 | `acpAgent.ts:269,300` 连接池 drain 重复             | SIGTERM + IDE 关闭有完全相同的 `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }` 块。已提取为 `drainPoolBeforeExit(label)` 辅助函数                                             | `72399f109`    |

#### 提交 6 自评审批次（R1-R3 关键竞态）

| #   | 位置                                    | 问题说明                                                                                                                                                                  | 折叠提交       |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`        | 槽释放竞态：A 完成生成，B（不同指纹，同名）开始生成，A 被 drain。Close 回调仅检查 `entries`（B 尚未注册）→ 过早释放                                                       | `0e58a098f`    |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc | 工作区事件扇出到 N 个会话 → N 个 reducer 递增；跨会话聚合的消费者会重复计数。文档注释已更新以说明乘数效应                                                                  | `0e58a098f`    |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`      | 在异步扇出期间直接遍历 `this.sessions.keys()`；并发的 `killSession` 可能破坏迭代器。已通过 `Array.from(...)` 快照解决                                                     | `0e58a098f`    |

#### 第三轮评审批次（提交 1-6，wenshao W1-W15）

| #   | 位置                                                           | 问题说明                                                                                                                                                                                                      | 折叠提交       |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                       | 生成失败会永久泄漏 `statusChangeListener`——只有 `forceShutdown` 才会移除它。已在 catch 中添加 `entry.forceShutdown('manual')`                                                                                  | `4a3c5cd90`    |
| W2  | `mcp-pool-entry.ts:statusChangeListener` 交叉检查              | 模块级 `serverStatuses` Map 在多指纹条目间共享。A 的传输错误写入 DISCONNECTED，B 的监听器会破坏 B 的 `localStatus`。已添加 `client.getStatus()` 检查                                                          | `4a3c5cd90`    |
| W3  | `mcp-pool-entry.ts:doRestart` pid 扫描                         | 重启跳过了 `listDescendantPids` + `sigtermPids`——每次重启 `npx`/`uvx` 包装的 stdio 都会使实际 MCP 孙进程成为孤儿。已在断开前添加扫描                                                                         | `4a3c5cd90`    |
| W4  | `mcp-pool-entry.ts:doRestart` drain 计时器竞态                 | Drain 计时器可能在重启 yield 期间触发 → `forceShutdown` 移除条目 → `client.connect` 生成孤儿进程。已在 `doRestart` 顶部添加 `cancelDrainTimer` + `state→active`                                              | `4a3c5cd90`    |
| W5  | `mcp-client-manager.ts:pooledConnections` 死句柄               | 当条目转为 `'failed'` 时，manager 永久持有死亡的 `PooledConnection`。现订阅条目事件；在 `'failed'` 时驱逐（通过 `get(name) === conn` 守卫实现幂等）                                                           | `4a3c5cd90`    |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` 重入        | 两次交错的遍历可能都执行 `set(name, conn)` → 第一个 conn 泄漏。已添加 `discoveryInFlight` 互斥锁；第二个调用方等待同一个 Promise。新增回归测试                                                                | `4a3c5cd90`    |
| W9  | `acpAgent.ts:parsePoolDrainMs` 严格性                          | `Number.parseInt` 接受 `'30000ms'` / `'30000abc'`。现使用严格的 `^\d+$` 正则；拒绝时输出 stderr 警告并回退到默认值                                                                                           | `4a3c5cd90`    |
| W10 | `mcp-transport-pool.ts:acquire` indexAttach 顺序               | `indexAttach` 在 `entry.attach()` 之前修改了 `sessionToEntries`。若 `attach` 抛出，会留下陈旧的反向索引映射。已将 `indexAttach` 移到 `attach` 成功后（快速路径和 in-flight 路径均适用）                       | `4a3c5cd90`    |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                  | 文档在 WR4 限制为 stdio 后仍声称 `stdio + websocket`。已更新                                                                                                                                                  | `4a3c5cd90`    |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch         | 与 W1 相同的 `statusChangeListener` 泄漏存在于非池化路径中。同样镜像修复：断开前先 `forceShutdown`                                                                                                           | `4a3c5cd90`    |
| W15 | `bridge.ts:restartMcpServer` 响应                              | `as PoolEntries` 强制转换不安全——来自 ACP 子进程的无类型 JSON。已添加 `Array.isArray` 检查 + 逐条目形状守卫；格式错误的条目跳过并留下 stderr 面包屑                                                          | `4a3c5cd90`    |

#### 拒绝并回复（归档为 F2 后续跟进）

| #   | 位置                                                | 拒绝原因                                                                                                                                                                             |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W7  | 测试覆盖缺口（4 条未测试的关键路径）                | 1/4 已添加（W6 回归测试）；其余推迟到 F2 系列合并后的专项测试覆盖 PR                                                                                                                |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` 未使用  | 用于推迟健康监控驱动重连（设计 §6.6）的前向兼容占位符；删除后再添加会干扰公共类型                                                                                                    |
| W11 | 重复的快速路径 / in-flight 路径 attach 块           | ✅ 已在 PR A 中完成：`attachPooledSession` + `rollbackReservationOnSpawnFailure` 私有辅助函数（提交 `2d546efca`）                                                                    |
| W12 | `passesSessionFilter` 在 `applyTools` 中的 O(M×N)  | ✅ 已在 PR A 中完成：`applyTools` / `applyPrompts` 每次遍历预计算过滤器 `Set`；谓词变为每工具 O(1)（提交 `a4a855ab3`）                                                              |
| R9  | `McpClientManager` 构造函数 7 个位置参数哨兵值      | ✅ 已在 PR A 中完成：选项对象构造函数 + `mkManager` 测试工厂（提交 `0cb1eaa27`）                                                                                                    |
| R10 | `pgrep -P <pid>` 每 PID 每层开销                    | ✅ 已在 PR A 中完成：单次 `ps -A -o pid=,ppid=` 快照 + 内存 BFS 遍历；pgrep BFS 保留为 BusyBox <v1.28 / 无 `ps` 的 distroless 环境的回退（作为 PR A 最终部分落地）                |

#### Bug 统计

- **3 批次 × 27 个关键/重要修复** + 5 处文档/建议折叠 = **共 32 处评审折叠合并**
- **2 个关键竞态仅在第二次审查时发现**（6R1 生成期间的槽释放竞态；W6 发现重入问题）
- **0 个静默失败发货** — 每处修复均携带内联 `// F2 (#4175 commit X review fix — wenshao YN):` 面包屑，指向原始评审

### v2.1（2026-05-20）— 单 PR 策略 + 12 处评审折叠合并

| #      | 内容                                                                                                          | 原因                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| V21-1  | 从 6 子 PR 计划切换为**单个功能内聚 PR**（包含 6 个原子提交）                                                 | 遵循维护者指导方针（#4175 分支策略）；评审者可通过 `git log -p` 逐提交阅读                        |
| V21-2  | 在连接池中添加 `sessionToEntries: Map<sid, Set<ConnectionId>>` 反向索引（§6）                                 | `releaseSession` 从 O(N 条目) → O(会话引用数)；在 1000 会话规模下必要                            |
| V21-3  | 重启路由支持 `?fingerprint=` 查询参数（§13.1）                                                                | 同名多指纹时运维人员可能只想重启某一条目；现在添加成本极低                                        |
| V21-4  | 生成失败路径显式释放预留槽（§6.1、§6.5）                                                                      | 否则槽泄漏到下次健康监控遍历；是实际的隐性 bug                                                    |
| V21-5  | 新增 §13.4：重连期间 in-flight 工具调用的语义                                                                 | `MCPCallInterruptedError`；连接池**不**自动重试（写操作不安全）                                   |
| V21-6  | 新增 §10.4：`/mcp disable X` 触发 `SessionMcpView` 重新应用                                                  | 否则会话中途禁用不会移除已注册的工具                                                              |
| V21-7  | 状态路由暴露 `entryIndex` 而非原始指纹（§8.3）                                                                | 避免通过指纹变化泄露 OAuth token 轮换的旁路信息                                                   |
| V21-8  | 重连退避规格：stdio 固定 5s × 3 次，HTTP/SSE 指数 1/2/4/8/16s × 5 次（§6.6）                                  | v2 未说明；HTTP 在网络抖动时需要更长的重试预算                                                    |
| V21-9  | `canonicalOAuth(o)` 将 `{enabled: false}` ≡ `undefined` ≡ `null` 规范化（§5.1）                              | 否则功能等价的配置会生成不同的条目                                                                |
| V21-10 | 将连接池回退辅助函数从"legacy in-process acquire"重命名为 `createUnpooledConnection`（§5.3、§6.1）            | SDK MCP 绕过是永久设计选择，而非遗留代码                                                          |
| V21-11 | `drainAll(opts?)` 返回带 `timeoutMs` 挂钟预算的 `Promise<void>`（§17）                                       | 调用方需要知道 drain 何时完成以确定关闭顺序                                                       |
| V21-12 | 锁定 SDK reducer 字段名（Q1 已解决）：保留 `mcpBudgetWarningCount` 等，在 JSDoc 中注明作用域语义              | PR 中途重命名公共 API 比略微不精确的语义更糟糕                                                    |
| V21-13 | 锁定 Q3（默认开启连接池，`--no-mcp-pool` 熔断开关）、Q4（HTTP/SSE 需显式启用）、Q6（急切构建）               | 单 PR 交付；无需功能标志                                                                          |
| V21-14 | 添加 R9/R10/R11 单 PR 风险（§23）                                                                             | 评审疲劳、daemon_mode_b_main 合并冲突、CI 时间                                                   |
| V21-15 | 扩展卸载孤儿条目处理推迟至 `MAX_IDLE_MS` 自然回收（§16.3）                                                   | 无显式 `invalidateByExtension`；保持模型统一                                                      |

### v2（2026-05-20）— 从 v1 草稿的初始评审折叠合并

| #   | 内容                                                                                                  | 原因                                                                         |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| C1  | 连接池同时扇出 **Tools + Prompts**（原为：仅 tools）                                                   | `McpClient` 构造函数接受两个注册表；连接池模式下 prompts 会静默丢失           |
| C2  | 新增关于**全局状态共存**的章节（`serverStatuses` / `mcpServerRequiresOAuth` 模块级 Map）               | 跨会话共享今天已存在；连接池继承并正式化                                      |
| C3  | `connectToMcpServer` 工厂路径在 F2-1 中与 `McpClient` 类**统一**                                     | v1 只重构了类；会保留并行的非池化路径                                         |
| C4  | 在 `PoolEntry.attach()` 中添加快照回放（earlyEvents 风格）                                            | 新竞态：会话 B 连接 → 服务器在订阅就绪前发出 `tools/list_changed`             |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` 用于并发获取去重                               | v1 在测试矩阵中提到但在实现契约中遗漏                                         |
| C6  | 跨平台后代 pid 扫描（Linux/macOS pgrep，Windows wmic/PowerShell）                                    | v1 说"复制 opencode 的 `pgrep -P`"——那是 Unix 专用的                         |
| C7  | 工具对象的 `trust` 字段按会话**复制**                                                                 | trust 存在于 `DiscoveredMCPTool`；共享实例会混用各会话的 trust                |
| C8  | HTTP/SSE 传输**需显式启用**池化（默认：仅 stdio + websocket）                                         | 某些 MCP HTTP 服务器维护每传输的会话状态；共享可能导致状态泄漏               |
| C9  | SDK MCP 服务器（`isSdkMcpServerConfig`）显式绕过                                                      | `sendSdkMcpMessage` 按设计是每会话的                                          |
| C10 | OAuth 路径显式**推迟到 F3**                                                                           | OAuth 流程需要 PermissionMediator 风格的路由；不在 F2 范围内                  |
| C11 | 规格化重启路由语义（name → 所有匹配条目）                                                             | PR 17 的 `POST /workspace/mcp/:server/restart` 原先明确（1 条目）；现在 1..N |
| C12 | 状态路由重构章节（新路径：`QwenAgent.getMcpPoolAccounting()`）                                       | `httpAcpBridge.ts:733-770` 当前读取引导会话的 manager——必须变更               |
| C13 | `PoolEntry` 上的版本计数器，用于过期 `tools/list_changed` 处理器守卫                                  | opencode 模式：`if (s.clients[name] !== client) return`                       |
| C14 | 子 PR 拆分从 4 → **6**                                                                                | v1 低估了；A2/B1/B3/C6 各有实际工作量                                        |
| C15 | 懒加载连接池构建（仅在看到 N≥2 个会话后）——可选                                                      | `qwen serve --foreground` 单会话无收益；节省初始化开销                        |

---

## 1. 目标 / 非目标

**目标**

- 1 个工作区内的 N 个会话共享每个唯一服务器配置对应的 1 个进程——以指纹为键
- 保留每会话 `ToolRegistry` / `PromptRegistry` 视图（过滤、trust）
- 引用计数 + 宽限 drain 生命周期对重新连接具有弹性
- 跨平台后代 pid 清理
- Budget 守护机制从每会话升级到每工作区（PR 14 承诺的功能）
- 与非 daemon 独立 qwen 向后兼容（该模式下不构建连接池）

**非目标（F2 范围）**

- 跨工作区池化（PR #4113 的 1 daemon = 1 工作区不变式依然成立）
- 跨 daemon 池化（超出范围——属于多进程编排领域）
- OAuth 路由重构（F3 与 `PermissionMediator`）
- Daemon 重启后的连接池持久化（仅内存）
- 自动检测"池化安全"的 HTTP 服务器（仅支持显式启用标志）
- 对运行中连接进行实时 `MCPServerConfig` 差异原地更新（配置变更 → 新条目，旧条目 drain）

---

## 2. 当前状态（替换目标）

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**耦合关系图（必须打破或穿透的部分）：**

| 耦合                                                                             | 位置                                              | F2 中的处理方式                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `McpClient` 构造函数绑定 1 个 ToolRegistry + 1 个 PromptRegistry                 | mcp-client.ts:106-119                             | 连接池拥有传输；`SessionMcpView`（每会话）拥有每会话注册表                            |
| `McpClient.discover()` 内联调用 `toolRegistry.registerTool()`                    | mcp-client.ts:178-198                             | 拆分：`discoverAndReturn()` 返回快照；视图负责注册                                   |
| `ListRootsRequestSchema` 处理器闭包引用 `workspaceContext.getDirectories()`       | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | 连接池的单一工作区绑定上下文                                                          |
| `workspaceContext.onDirectoriesChanged` 每次连接注册一个监听器                   | mcp-client.ts:907                                 | 连接池每条目注册一次                                                                  |
| `McpClientManager` 在 ToolRegistry 内部 `new`                                    | tool-registry.ts:199                              | 添加可选的 `pool?` 构造参数；从 Config 注入                                          |
| 每会话 budget 执行                                                                | mcp-client-manager.ts:91-95 注释                  | 将状态机迁移到连接池                                                                  |
| `serverDiscoveryPromises` 每服务器去重 in-flight                                 | mcp-client-manager.ts:350                         | 连接池有 `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                       |
| `setMcpBudgetEventCallback` 每会话注册                                           | acpAgent.ts:1851-1899                             | 连接池发出 → `QwenAgent` 广播到所有会话                                               |

**已共享状态（连接池继承，不引入新状态）：**

| 状态                                           | 位置                             | 说明                                                              |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>` | mcp-client.ts:292（模块级）      | 今天已是进程级；连接池仍按名称键——"任意 CONNECTED 胜出"            |
| `mcpServerRequiresOAuth: Map<string, boolean>` | mcp-client.ts:302（模块级）      | 同上                                                              |
| `MCPOAuthTokenStorage` 磁盘 token              | `~/.qwen/mcp-oauth/<name>.json`  | Daemon 主机共享；连接池只是利用得更高效                            |

---

## 3. 参考调研

| 项目           | 连接池？           | 键                                             | 生命周期                                                                                 | 可借鉴的模式                                                                                                                      |
| -------------- | ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **claude-code** | 无，每进程          | `name + JSON.stringify(cfg)`（lodash.memoize） | `clearServerCache` + 远程退避×5；stdio 崩溃 → `failed`                                  | 排序键 SHA-256 `hashMcpConfig` 用于失效/键控                                                                                      |
| **opencode**    | 有，每工作区        | 仅服务器**名称**（无配置哈希）                  | 无引用计数/无驱逐/无重启；Effect finalizer + `pgrep -P` 递归 SIGTERM                    | 后代 pid 扫描、陈旧处理器守卫（`if (s.clients[name] !== client) return`）、通过事件总线扇出 `tools/list_changed`                  |

**F2 从各项目继承的内容：** 从 claude-code 继承配置哈希（处理 opencode 未涉及的每会话 env/auth 差异），从 opencode 继承后代 pid 扫描（npx/uvx 包装器泄漏）。我们新增：引用计数 + drain（多客户端 daemon）、自动重启（长运行 daemon）、prompt 扇出、版本守卫。

---

## 4. 架构

### 4.1 进程布局

```
HTTP daemon (packages/cli/src/serve, qwen serve)
  │ 生成
  ▼
ACP child (qwen --acp, 每工作区单进程)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── 新增，工作区级，1 个实例
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (绑定到 daemon 工作区)
  │     └── budget 守护机制（PR 14 状态机，升级为工作区级）
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ pool 已注入      │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   legacy in-process
                                  → SessionMcpView            (独立 qwen)
                                    .applyTools/Prompts
                                    (过滤 + 注册到
                                     会话自己的注册表)
```

**连接池位于 ACP child 中**，而非 HTTP daemon。HTTP daemon 通过现有的 `bridge.client` extMethod 接口（`getMcpPoolAccounting`、`restartMcpServer`）查询连接池状态。F2 代码位于 **`packages/core/src/tools/`**（与 `mcp-client-manager.ts` 同级），而非 `packages/acp-bridge/`。

### 4.2 类图

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (会话拆除时批量释放)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (工作区级)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (关闭)
  └─ onBudgetEvent: (event) => void   (由 QwenAgent 设置)

PoolEntry（内部）
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   (重连时递增；陈旧事件守卫)
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection（返回给调用方的句柄）
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView（每会话、每服务器）
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (按 include/exclude 过滤，附加 trust)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (移除其注册项)
```

---

## 5. 连接池键（指纹）

### 5.1 哈希规范化字段

```ts
type PoolKey = string; // sha256 十六进制，前 16 个字符已足够（在实际 N 规模下无碰撞）
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
 * V21-9：规范化功能等价的 OAuth 配置，使其折叠为相同指纹。
 * `{enabled: false}`、`undefined`、`null` 和 `{}` 均表示"无 OAuth"→ 均返回 `null`。
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

// 排除字段（每会话过滤器，不属于传输层）：
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 传输类型门控

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**默认 `pooledTransports = {stdio, websocket}`**。运维人员可通过以下方式启用 HTTP/SSE：

- CLI：`--mcp-pool-transports=stdio,websocket,http,sse`
- 环境变量：`QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**默认排除 HTTP/SSE 的原因**：某些 MCP HTTP 服务器实现将状态（auth 上下文、对话记忆）绑定到 TCP/SSE 流；多个 ACP 会话共享会导致状态泄漏。stdio + websocket 是真正的 OS 进程，其状态可观察且可隔离。

### 5.3 SDK MCP 绕过

`isSdkMcpServerConfig(cfg)` 为 true 时 → 连接池通过 `createUnpooledConnection(name, cfg, sid)` 返回一个薄的 `PooledConnection` 包装器，立即构建 `McpClient`，不共享，不在连接池中存储条目。原因：`sendSdkMcpMessage` 按设计是每会话的（通过 ACP 控制平面路由回源会话）。当传输不在 `pooledTransports` 中时，HTTP/SSE 同样走此路径（§10.3）。

V21-10：名称为 `createUnpooledConnection`，而非 `legacyInProcessAcquire`——SDK MCP 和 HTTP 不启用是永久设计选择，不是遗留代码。

---

## 6. 生命周期

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2：反向索引，O(本会话引用数) 的 releaseSession，而非 O(所有条目)。 */
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
          // V21-4：生成失败时释放预留槽。若无此修复，
          // 槽会泄漏直到健康监控释放路径运行
          //（但由于没有条目可监控，该路径永远不会运行）。
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

  /** V21-2：O(本会话引用数)，而非 O(所有条目)。 */
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

### 6.2 并发获取去重（`spawnInFlight`）

镜像 `McpClientManager.serverDiscoveryPromises`（mcp-client-manager.ts:350）。若无此机制，启动时 5 个会话同时看到 `entries.has(id) === false`，竞相生成 5 个子进程。

### 6.3 Drain 宽限期 + 空闲上限

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // 最后一次 release 后的宽限期
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // 硬上限（防御 drain 取消循环）
```

`PoolEntry` 中的状态机：

```
spawning ──生成成功──► active ──最后一次 detach──► draining ──超时──► closed
   │                     │                         │
   │                     │                         └──attach──► active（取消计时器）
   生成失败─────────────►failed
                          │
                          └──手动重启──► spawning
```

硬空闲上限：drain 计时器可以无限取消+重启（acquire/release 抖动）。`MAX_IDLE_MS` 是一个独立计时器，**在首次空闲时启动**且永不重置；触发时强制关闭，即使 drain 当前处于宽限期。防止有 bug 的客户端反复抖动 acquire/release 导致连接池出现僵尸条目。

### 6.4 跨平台后代 pid 扫描

**R10 / R23 T7 / PR A 更新（2026-05-22）**：从逐 pid BFS（每节点每层一次 `pgrep -P <pid>` / `Get-CimInstance -Filter` 子进程）切换为单次进程表快照加内存树遍历。两个动机：（1）在热连接池关闭路径上一次 fork 替代 B^D 次 fork；（2）快照一致性——修复前的 BFS 可能遗漏在相邻 BFS 层之间 fork 的后代。逐 pid 路径保留为 BusyBox `ps` <v1.28（不支持 `-o`）和无 `ps` 的 distroless 容器的回退。

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // OS 回收孤儿进程；连接池关闭仍继续。
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* 回退到备用方案 */
  }
  if (tree) return walkDescendants(tree, root); // O(后代数)，1 次 fork
  return await listDescendantPidsUnixPgrepFallback(root); // 传统 BFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: 所有进程（POSIX，等价于 -e，但在 BSD 上无歧义）。
  // -o pid=,ppid=: pid + ppid 列，尾部 `=` 抑制表头。
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // 覆盖进程数超过 250k 的极端主机
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* 解析，推入 childrenByPpid */
  }
  return childrenByPpid;
}

// Windows：单次 Get-CimInstance Win32_Process | ConvertTo-Csv 快照
// 获取所有 (ProcessId, ParentProcessId) 行 + 内存遍历；逐 pid
// `Get-CimInstance -Filter "ParentProcessId=$p"` 保留为回退。
```

在 `PoolEntry.shutdown()` 中 `client.disconnect()` 之前调用。处理 `npx @modelcontextprotocol/server-X`、`uvx ...`、`pnpm dlx ...` 包装器泄漏。保留 MAX_DESCENDANTS=256 / MAX_DEPTH=8 上限。

### 6.5 生成失败处理

若 `spawnEntry` 在多个订阅者连接后（通过 `spawnInFlight`）拒绝：

- 所有等待方均收到 rejection
- `tryReserveSlot` 通过 **`acquire` 中的显式 `.catch` 分支**释放（V21-4）；若无此修复，槽会泄漏直到下次健康监控遍历，而健康监控因没有条目可监控而永远不会运行。
- 失败的条目**不**存储到 `entries`
- 订阅者的代码路径按 `acquire` 原本失败处理（现有的每会话 `discoverMcpToolsForServer` catch 逻辑仍然有效）

### 6.6 重连退避（V21-8）

当 `PoolEntry` 在传输断开后进入重连流程：

| 传输系列         | 策略                                         | 上限                                                             |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| stdio            | 固定 5s × 3 次                               | 基于现有 `DEFAULT_HEALTH_CONFIG.reconnectDelayMs`                |
| websocket        | 固定 5s × 3 次                               | 同 stdio                                                         |
| http（需启用）   | 指数 1s、2s、4s、8s、16s × 5 次              | 远程端点在短暂网络问题时会抖动；需要更长的预算                   |
| sse（需启用）    | 指数 1s、2s、4s、8s、16s × 5 次              | 同 http                                                          |

耗尽上限后：条目转为 `failed` 状态；订阅者收到 `failed` 事件；同一 `ConnectionId` 的新 `acquire` 重试一次生成，然后抛出。运维人员重启（§13）将重置状态。

---

## 7. 发现 / SessionMcpView

### 7.1 Tools + Prompts 双重扇出

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

// 保留传统 discover()，委托给 discoverAndReturn + 注册（供独立 qwen 使用）
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
      // C7：每会话复制 trust（不修改共享快照）
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

### 7.2 连接时快照回放（earlyEvents 风格）

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // 立即回放当前快照，确保订阅者不会错过
    // 在 in-flight 发现完成到 attach 之间落地的更新。
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

镜像 PR 14b fix #1 的 `BridgeClient.earlyEvents` 模式——解决连接池连接时的类似竞态问题。

### 7.3 陈旧处理器守卫（版本计数器）

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // 已被另一次重连取代
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
      .catch(/* 吞掉 + 记录日志 */);
  };
}
```

若无此机制，重连前旧 Client 实例的陈旧处理器可能会用旧数据覆盖重连后的快照。

**单调性不变式**（V21 说明）：`generation` 只递增，从不重置。任何 in-flight 操作在入口处捕获 `myGen`，在 `await` 后检查 `myGen === this.generation`。等价于"自我开始后没有发生取代事件"。受 Number.MAX_SAFE_INTEGER（约 2^53 = 以 1Hz 重连速率约 285k 年）限制，无溢出风险。

### 7.4 路径统一（F2-1 扩展范围）

`packages/core/src/tools/mcp-client.ts` 有**两条**连接到服务器的路径：

1. `McpClient` 类（mcp-client.ts:100）——由 `McpClientManager` 使用
2. `connectToMcpServer` 工厂函数（mcp-client.ts:875）——由 `discoverMcpTools`（第 560 行）和 `connectAndDiscover`（第 607 行）使用

F2-1 必须将两者统一到 `McpClient.discoverAndReturn` 之后（将 `connectToMcpServer` 变为 `McpClient` 的私有辅助函数，或二者共同调用一个 `establishConnection()` 原语）。否则连接池只覆盖类路径；工厂路径保持每会话状态，破坏整体方案。

---

## 8. 全局状态共存

### 8.1 `serverStatuses`（mcp-client.ts:292）— 容碰撞写入

模块级 `Map<serverName, MCPServerStatus>`。连接池的 `ConnectionId` 是 `name::hash`，但 `updateMCPServerStatus(name, status)` 按名称写入。**同名多个连接池条目（不同指纹，例如 token 分歧）会互相覆盖各自的状态。**

**解决方案**：连接池拦截状态写入：

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
    // 任意 CONNECTED ⇒ CONNECTED
    // 否则任意 CONNECTING ⇒ CONNECTING
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

状态路由暴露 `entryCount: number`，让运维人员了解同名多条目的情况。

### 8.2 OAuth token 存储

`MCPOAuthTokenStorage` 写入 `~/.qwen/mcp-oauth/<serverName>.json`——已经是 daemon 主机共享的。连接池间接受益（第一个会话完成 OAuth → token 落盘 → 连接池条目的重连读取 token → 所有其他会话搭便车）。

**注意——多指纹情况**：同名两个条目（不同 headers/env）但同一 OAuth provider → 读取同一 token 文件。若 token 是服务器级的（OAuth 典型情况），这没问题。若 token 是 env 级的（罕见），则需要扩展存储键。**推迟到 F3**，附有已记录的已知限制。

### 8.3 快照中的 `entryCount`

`GET /workspace/mcp` 每服务器单元格新增：

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // 新增 — 该名称对应的连接池条目数
  entrySummary?: [                        // 新增 — 不透明的每条目细分
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**：`entrySummary[].entryIndex` 是在条目创建时分配的**稳定不透明整数**（在同名组内按插入顺序），**不是**原始指纹。原因：OAuth token 或 env var 轮换时指纹会变化，快照差异会泄漏该信息（运维人员可从 `'a3b1' → 'f972'` 的变化推断"token 在 T+5min 时轮换"）。`entryIndex` 在同名组内单调递增，但在轮换时保持稳定，因为旧条目 drain 后新条目获得下一个索引。

旧 SDK 客户端按 PR 14 契约忽略未知字段；新客户端使用 `entryCount` 显示徽章。内部按指纹重启的路径使用仅通过特权 extMethod 返回的不透明令牌，不在 HTTP 快照中暴露。

---

## 9. WorkspaceContext / ListRoots

### 9.1 单次注册

连接池的 `McpClient` 实例共享**一个** `WorkspaceContext`——daemon 的绑定工作区上下文（PR #4113 不变式）。`connectToMcpServer` 的 `ListRootsRequestSchema` 处理器闭包引用此单一上下文。

`onDirectoriesChanged` 监听器**每条目注册一次**，而非每次 `acquire` 注册。条目关闭时解除注册。

### 9.2 `roots/list_changed` 向上扇出

服务器通知客户端新 roots → 连接池扇出：

- 连接池重新发现（新 roots 下服务器可能报告不同的工具集）→ `toolsChanged` 事件 → 所有订阅者视图重新应用

### 9.3 每会话 `updateWorkspaceDirectories`

**契约**：在 Mode B 中，每会话的目录添加是软提示，不具权威性。连接池的 `WorkspaceContext` 是 daemon 级的。

两种实现选择：

- **v1 简单版**：忽略每会话的添加，检测到时记录警告
- **v2 联合版**：连接池维护 `extraRoots: Map<sessionId, Set<dir>>`，ListRoots 处理器返回绑定工作区与所有额外目录的联合集合。每会话删除触发 `roots/list_changed`。增加约 50-80 LOC 复杂度。

**F2 选择 v1 简单版**；若出现用户痛点则作为后续跟进实现 v2 联合版。

---

## 10. 每会话注入

### 10.1 来自 `newSession({mcpServers})` 的 `mcpServers`

`newSessionConfig(cwd, mcpServers, ...)` 将注入列表与 `settings.merged.mcpServers`（acpAgent.ts:1778-1831）合并。连接池消费**每会话合并后的视图**：

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...现有的 setMcpBudgetEventCallback 已移除——连接池直接处理广播
}
```

当两个会话注入同名但不同 env/headers 的服务器时 → 不同指纹 → 两个连接池条目。只有当会话完全一致时才触发连接池共享。

### 10.2 Auth 分歧

静态 `~/.qwen/settings.json` 中的 mcpServers 在各会话间完全相同 → 全部共享 → 80% 的情况。每会话注入带有每用户 token 的 mcpServers → 唯一指纹 → 不共享。两者均安全。

### 10.3 HTTP 传输显式启用（§5.2 回顾）

默认 `pooledTransports = {stdio, websocket}`。HTTP/SSE 服务器走 `createUnpooledConnection` 路径（每会话一个 McpClient），除非运维人员显式启用。

### 10.4 `/mcp disable X` 会话中途（V21-6）

当运维人员对活跃会话运行 `/mcp disable github` 时：

1. `Config.disableMcpServer('github')` 将其添加到每 Config 的 `disabledMcpServers` 集合
2. **F2 钩子**：`Config.onDisabledMcpServersChanged` 触发；该名称的 `SessionMcpView` 调用 `teardown()`（从会话注册表中移除其工具/prompt 注册项）
3. 连接池条目**可能保持活跃**，若其他会话仍引用它（refcount > 0）——只有禁用会话的视图解除连接
4. 若所有会话均禁用 → refcount → 0 → drain 计时器启动

若无步骤 2，会话中途禁用会让已注册的工具留在会话的 `ToolRegistry` 中直到下次会话重启。测试 21.4 覆盖此场景。

`/mcp enable github` 是逆操作：触发会话的新 `pool.acquire`，连接新视图，重新应用快照。

---

## 11. Budget 守护机制升级

### 11.1 状态机迁移到连接池

`tryReserveSlot` / `releaseSlotName` / 75% 迟滞 / refused_batch 合并 / `bulkPassDepth` / `pendingRefusalNames`——全部从 `McpClientManager` 迁移到 `McpTransportPool`。`McpClientManager` 在独立运行时（无注入连接池）保留状态。

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

按 PR 14 契约："消费者必须能容忍含有未识别 scope 值的额外条目（丢弃，不报错）。" 旧 SDK 客户端看到 `scope: 'workspace'` 后视为未知（或回退到顶级数字）。新 SDK 添加 `isWorkspaceScopedBudget(cell)` 辅助函数。

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

### 11.4 SDK 类型契约变更

PR 14b 导出了以下内容（必须以增量方式扩展）：

- `DaemonMcpBudgetWarningData` — 添加 `scope?: 'workspace' | 'session'`（可选，向后兼容；缺省 = 'session'）
- `DaemonMcpChildRefusedBatchData` — 同样添加 `scope?`
- `DaemonMcpGuardrailEvent` — 判别字段不变

新 SDK 辅助函数：

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`DaemonSessionViewState` 的 reducer 状态：

- **无新字段** — `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` 无论 scope 如何都递增（scope 是每个事件的属性，而非独立流）
- 文档说明：在 F2 下，这些计数反映工作区级事件扇出到每个会话——当 budget 压力发生时，它们会**同时在所有连接的会话中递增**

**V21-12（Q1 已解决，v2.1 锁定）**：保留现有字段名（`mcpBudgetWarningCount`、`mcpChildRefusedBatchCount`、`lastMcpBudgetWarning`、`lastMcpChildRefusedBatch`），在 JSDoc 中记录扩展的 scope 语义：

```ts
/**
 * 会话已观察到的 `mcp_budget_warning` 事件计数。
 * 在 F2（`scope: 'workspace'`）下，该值会在所有连接的会话中同时递增，
 * 因为 budget 事件在工作区级扇出。
 * 使用 `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`
 * 检查最近一次事件的 scope。
 */
mcpBudgetWarningCount: number;
```

理由：PR 14b 已将这些名称作为公共 SDK 接口发布；重命名是破坏性变更，比略微不精确的语义更糟糕。

---

## 12. OAuth — 明确推迟到 F3

`connectToMcpServer`（mcp-client.ts:950-1010）中的 OAuth 401 回退需要交互式解决（打开浏览器或 device flow）。Mode B daemon **不得**生成浏览器（参见 PR 21 设计——静态源代码 grep 测试会在 `open`/`xdg-open`/`shell.openExternal` 时构建失败）。

**F2 在 OAuth 服务器上的行为**：

1. 首次 acquire 触发 `connectToMcpServer` → 检测到 401
2. 连接池捕获 OAuth 必需异常，将条目标记为 `failed_auth_required`
3. 状态路由暴露 `errorKind: 'auth_env_error'`（现有 PR 13 errorKind）
4. 连接池**不自动重试**
5. 运维人员运行 `/mcp auth <name>`（现有 CLI）或使用 PR 21 的 device-flow 路由在磁盘上获取 token → 下次会话 acquire 时重试并成功

**F3 将替换步骤 4-5**，使用 `PermissionMediator` 将 OAuth 完成请求路由到已连接的会话供第一个响应者处理。

这避免了 F2 混入 auth 状态机工作。

---

## 13. 重启路由语义

### 13.1 连接池下的 `POST /workspace/mcp/:server/restart`

今天（PR 17）：在引导会话的 manager 中重启 = 重启该名称的单一条目。

连接池下：名称 → 可能有多个条目（同名不同指纹 = 不同会话使用不同配置）。

**规格化行为**：

| 请求                                                       | 行为                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`                      | 重启所有匹配 `serverName` 的条目（通过 `Promise.allSettled` 并行）                    |
| `POST /workspace/mcp/:server/restart?entryIndex=0`         | V21-3：仅重启第 #0 条目（快照 §8.3 中的不透明索引）；未找到返回 404                  |
| `POST /workspace/mcp/:server/restart?entryIndex=*`         | 显式"全部"（与无参数相同）                                                            |

响应形状：

```ts
type RestartResult = {
  entryIndex: number;        // V21-7：不透明索引，非原始指纹
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

向后兼容：当 `entries.length === 1` 且无 `entryIndex` 查询参数时，保留旧形状 `{restarted: true, durationMs}`；客户端可通过检查 `'entries' in response` 来检测新形状。

### 13.2 In-flight 重启去重

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

### 13.3 Budget 检查（保留 PR 17 行为）

重启前，连接池检查 budget：若断开+重连仍在预算内，则允许。保留当前 PR 17 的 `{restarted:false, skipped:true, reason:'budget_would_exceed'}` 语义（现在按条目应用）。

### 13.4 重连期间 in-flight 工具调用（V21-5，新增）

会话 A 调用 `pool.callTool('git.commit', args)` → 请求写入底层子进程的 stdin → 子进程崩溃（写到一半）→ 条目转为重连状态：

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // 重连前的版本号
  readonly args: unknown;              // 原始参数，供调用方在安全时重试
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**规格**：

- 一旦检测到传输断开，in-flight 调用 Promise 立即以 `MCPCallInterruptedError` reject（不等待重连）
- 连接池**不自动重试**调用；对写操作（commit、文件编辑等）语义不安全，且连接池无法区分读写
- 调用方（通常是 agent 循环中的工具执行层）捕获此错误并决定：重试 / 向用户呈现 / 中止
- 重连后：会话 A 可以重新调用（同一 `PooledConnection.callTool`）；连接池透明地路由到新传输实例
- `MCPCallInterruptedError.clientGeneration` 让调用方在需要时与后续 `reconnected` 事件关联

测试 21.6 必须覆盖：生成一个长时运行的 stdio MCP，发送工具调用，在调用中途 kill 子进程，断言 `MCPCallInterruptedError` rejection 且 `clientGeneration` 非零。

---

## 14. 状态路由重构

### 14.1 新查询路径

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — 替换数据源
let accounting: McpClientAccounting | undefined;
try {
  // 新：通过 bridge extMethod 直接查询连接池，而非引导会话
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // 回退到非连接池 daemon 的传统引导会话路径
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

ACP child 通过 `extMethod` 桥接，供 daemon 调用。

### 14.2 entryCount + entrySummary

参见 §8.3。

### 14.3 无引导会话情况

今天（PR 12），当 daemon 空闲（无会话）时，`GET /workspace/mcp` 返回 `initialized: false`，因为没有引导会话可查询。

连接池下：连接池从 `QwenAgent` 构造函数起就存在 → 即使零会话，状态路由也能返回实时统计信息。`initialized: true` 甚至在第一个会话之前。**PR 描述中的已记录行为变更**；不是回退。

---

## 15. loadSession / resume 交互（PR 6 #4222）

### 15.1 resume 时取消 drain

```
会话 A 活跃，持有条目 X 引用
会话 A 断开（无显式关闭）→ 最终 killSession → pool.releaseSession(A) → 条目 X.refs.size === 0 → drain 计时器启动（30s）
会话 A 在 30s 内 resume → 新 newSessionConfig → pool.acquire 返回条目 X → attach 取消 drain
会话 A 在 30s 后 resume → 条目 X 已关闭 → 连接池生成新条目（冷启动）
```

### 15.2 `restoreState` 缓存窗口（5 分钟，来自 PR 6）

`acpAgent.restoreState` 在断开后保留 5 分钟。连接池 drain（默认 30s）< 恢复窗口（5 分钟）→ 在 30s 至 5 分钟之间 resume 需要 MCP 冷启动。可接受的权衡（resume 本身是稀有路径）。

替代方案：连接池读取 daemon 的恢复窗口配置并相应延长 drain 时间。这会在连接池与会话状态机之间引入耦合；**推迟到后续跟进，除非用户报告冷启动痛点**。

### 15.3 `pendingRestoreIds` 交互

`acpAgent.killSession()` 必须在清理 `pendingRestoreIds` **之后**调用 `pool.releaseSession(sid)`。顺序：

1. 会话标记为可恢复（`pendingRestoreIds.add(sid)`）
2. Session.close()——但连接池引用仍保留
3. `RESTORE_WINDOW_MS` 过期后无 resume：`killSession` 永久清理 → `pool.releaseSession(sid)` 触发 drain

避免在恢复窗口期间触发 drain。

---

## 16. 热配置重载

### 16.1 通过指纹变化的隐式重载

用户中途编辑 `~/.qwen/settings.json`，更改某服务器的 env：

1. 旧会话保留旧 `Config`/`McpServers` 快照 → 继续获取旧指纹 → 条目 OLD 引用持续
2. 新会话读取新配置 → 新指纹 → 创建条目 NEW → 与条目 OLD 共存
3. 旧会话自然关闭 → 条目 OLD drain → 最终关闭
4. 稳定状态：仅剩条目 NEW

**不对运行中的连接进行实时更新** — 不同配置版本的会话之间清晰分离。

### 16.2 强制重载路由（可选）

```
POST /workspace/mcp/reload-all
  → 对每个会话：重载配置，替换 Config.mcpServers
  → 对每个不再被引用的条目：调度驱逐
```

适用于"我更改了 env var，希望立即对所有会话生效"的场景。推迟到 F2 后续跟进（不阻塞）。

### 16.3 扩展卸载孤儿条目（V21-15）

场景：扩展 `foo-ext` 注册 MCP 服务器 `foo-server`。运维人员运行 `/extension uninstall foo-ext`。扩展生命周期从 `extensionMcpServers` 中移除 `foo-server`，使未来的 `loadCliConfig` 调用不再包含它。但：

- 活跃会话持有仍包含 `foo-server` 的 `Config` 快照 → 这些会话继续使用该条目
- 卸载后的新会话不再 acquire（服务器不在其合并的 mcpServers 中）→ 引用计数不再增加

**解决方案**：依赖自然 drain。随着旧会话关闭，refcount 下降；最终条目触及 `MAX_IDLE_MS = 5min` 并被强制关闭。**无显式 `pool.invalidateByExtension(name)` API** — 保持模型与热配置重载（§16.1）一致。

权衡：若有长时运行的会话持有引用，扩展服务器可能在卸载后最多运行 5 分钟。可接受；若紧急，运维人员可先 `/mcp restart foo-server` 再 kill 会话。

---

## 17. 关闭顺序

`QwenAgent.close()` 执行顺序（必须严格执行）：

```
1. 设置 acceptingNewSessions = false；拒绝新的 POST /session
2. 对每个 in-flight prompt：发送取消信号，等待完成（现有 PR 11 生命周期）
3. 对每个会话：触发关闭 → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← 绕过 30s 宽限期
   ├── 对每个条目：取消 drain + 健康计时器，标记为 draining
   ├── 对每个条目（并行）：listDescendantPids → SIGTERM 子进程
   ├── 对每个条目（并行）：client.disconnect()
   └── Promise.race vs timeoutMs；超时的条目发送 SIGKILL
5. Bridge 通道关闭
6. 进程退出
```

**V21-11**：`drainAll` 签名：

```ts
async drainAll(opts?: {
  force?: boolean;       // 默认 false；true 绕过 30s 宽限计时器
  timeoutMs?: number;    // 默认 10_000；挂钟预算；超时后对残留条目发送 SIGKILL
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // 正常断开的条目数
  forced: number;        // 超时后发送 SIGKILL 的条目数
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

调用方使用 `DrainResult` 记录关闭日志；若 `forced > 0`，记录警告以便运维人员了解某服务器未正常关闭。

---

## 18. 文件布局

**新增文件：**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool 主体（约 700 LOC）
  mcp-pool-key.ts              # fingerprint + 规范化辅助函数（约 150 LOC）
  mcp-pool-entry.ts            # PoolEntry：引用计数 + drain + 健康 + 版本（约 500 LOC）
  session-mcp-view.ts          # SessionMcpView：过滤 + 注册 tools/prompts（约 200 LOC）
  mcp-pool-events.ts           # PoolEvent 判别联合类型（约 80 LOC）
  pid-descendants.ts           # listDescendantPids 跨平台（约 150 LOC，含测试）

packages/core/src/tools/
  mcp-transport-pool.test.ts   # 约 900 LOC
  mcp-pool-entry.test.ts       # 约 400 LOC
  session-mcp-view.test.ts     # 约 250 LOC
  mcp-pool-key.test.ts         # 约 150 LOC
  pid-descendants.test.ts      # 约 200 LOC（Unix + Windows 条件跳过）
```

**变更文件：**

```
packages/core/src/tools/mcp-client.ts            # discoverAndReturn() 拆分；connectToMcpServer 统一
packages/core/src/tools/mcp-client-manager.ts    # 可选 pool 参数；budget 状态条件化
packages/core/src/tools/tool-registry.ts         # 从 config 向 McpClientManager 穿透 pool
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # QwenAgent.mcpPool 构建；broadcastBudgetEvent；
                                                 # newSessionConfig 将 pool 注入 Config；
                                                 # killSession 调用 pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # 向 ACP child 传递 --mcp-pool-transports + budget env
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus 读取 pool；
                                                 # restartMcpServer extMethod 返回 RestartResult[]
packages/cli/src/serve/capabilities.ts           # 广播 mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope? 可选字段；isWorkspaceScopedBudgetEvent 辅助函数
```

---

## 19. 单 PR 交付 — 提交拆分（V21-1）

按维护者的功能内聚批次指导方针（#4175 分支策略 2026-05-19），F2 以**一个包含 6 个原子提交的 PR** 发布。评审者可通过 `git log -p HEAD~6..HEAD` 逐提交审阅。

| 提交 # | 标题                                                                                          | 范围                                                                                                                                                                                                                                                                                                                                                                                                                   | 涉及文件                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1      | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths` | 添加 `discoverAndReturn()`；提取两者共用的 `establishConnection()`（由 `McpClient.connect()` 和 `connectToMcpServer()` 工厂共同使用）；传统 `discover()` 变为调用后注册的薄包装（保留独立 qwen 行为）。零可观察行为变化。                                                                                                                                                                                               | `mcp-client.ts`、`mcp-client.test.ts`                                                                                    |
| 2      | `feat(core): McpTransportPool + SessionMcpView`                                               | 连接池核心：`fingerprint`、引用计数、`spawnInFlight` 去重、`sessionToEntries` 反向索引、drain 状态机、连接时快照回放、版本守卫、tool+prompt 双重扇出、每会话 trust 复制。Mock McpClient 用于单元测试。无生产接线。                                                                                                                                                                                                      | 新增 `mcp-transport-pool.ts`、`mcp-pool-key.ts`、`mcp-pool-entry.ts`、`session-mcp-view.ts`、`mcp-pool-events.ts` + 测试  |
| 3      | `feat(core): cross-platform descendant pid sweep + pool health monitor`                       | `listDescendantPids`（Unix `pgrep -P` 递归，Windows PowerShell CIM）；`PoolEntry` 内置统一健康监控（interval 检查 + 失败计数 + §6.6 重连退避）；子进程生成集成测试以 `QWEN_INTEGRATION === '1'` 为门控。                                                                                                                                                                                                               | 新增 `pid-descendants.ts` + 测试；`mcp-pool-entry.ts`                                                                    |
| 4      | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                               | `Config.setMcpTransportPool` + `getMcpTransportPool`；`ToolRegistry` 向 `McpClientManager` 穿透 pool；`McpClientManager` 可选 `pool?` 构造参数；`acpAgent.QwenAgent` 在初始化时构建 pool；`newSessionConfig` 注入；`killSession` 调用 `pool.releaseSession`；SDK MCP + HTTP/SSE 通过 `createUnpooledConnection` 绕过；CLI 标志 `--mcp-pool-transports`、`--mcp-pool-drain-ms`、`--no-mcp-pool`。                         | `config.ts`、`tool-registry.ts`、`mcp-client-manager.ts`、`acpAgent.ts`、`run-qwen-serve.ts`                              |
| 5      | `feat(serve): pool-aware status + restart routes`                                             | `QwenAgent.getMcpPoolAccounting` extMethod；`httpAcpBridge.buildWorkspaceMcpStatus` 连接池优先 + 引导会话回退；`restartMcpServer` 接受 `?entryIndex=` 并返回 `RestartResult[]`；单元格新增 `entryCount` + `entrySummary[].entryIndex`；能力标签 `mcp_workspace_pool` + `mcp_pool_restart`。                                                                                                                             | `httpAcpBridge.ts`、`capabilities.ts`、SDK 类型                                                                           |
| 6      | `feat(serve): graduate MCP budget guardrails to workspace scope`                              | 将 `tryReserveSlot`/`releaseSlotName`/迟滞状态机从 `McpClientManager` 迁移到 pool；移除 `acpAgent.newSessionConfig` 中的每会话 `setMcpBudgetEventCallback` 接线；`QwenAgent.broadcastBudgetEvent` 扇出；快照单元格 `scope: 'workspace'`；SDK `scope?` 增量字段；`isWorkspaceScopedBudgetEvent` 辅助函数；内联文档更新。                                                                                                  | `mcp-transport-pool.ts`、`mcp-client-manager.ts`、`acpAgent.ts`、`httpAcpBridge.ts`、SDK                                 |

**总 LOC 估算**：约 4100 生产代码 + 约 1900 测试 = 约 6000 LOC（v2 估算约 3850；增长吸收了 V21 修正）。

**合并目标**：单 PR 合入 `daemon_mode_b_main`。按 #4175 策略定期批量合并到 `main`。

**开 PR 前自评流程**：

1. 每次提交后，对提交 diff 运行 `code-reviewer` agent；将采纳的发现折叠到同一提交
2. 对提交 2/4/6（设计风险最高），额外运行 `silent-failure-hunter` + `type-design-analyzer`
3. 所有 6 个提交落地后：由不同 agent 组合对完整 PR diff 进行 3 轮全面审查
4. 对所有涉及的包运行完整测试套件 + 类型检查 + lint

镜像 PR 21 的专家预审模式。

---

## 20. 能力标签 + SDK 契约变更

### 20.1 新能力标签（在 v0.16 中原子广播，V21-1）

由于 F2 以单个 PR 发布，所有三个标签同时广播。连接池消费者可假设 **`mcp_workspace_pool` 广播 ⇒ `entryCount`/`entrySummary`/`scope?` 字段均存在**；无需逐字段能力检查。

| 标签                        | 广播条件                                                                                             | 含义                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `mcp_workspace_pool`        | 当 `QwenAgent.mcpPool !== undefined` 时（daemon 模式下始终为 true，除非使用 `--no-mcp-pool` 熔断开关） | `GET /workspace/mcp` 反映连接池级状态；`entryCount` + `entrySummary` 字段存在                           |
| `mcp_pool_restart`          | 始终与 `mcp_workspace_pool` 同时开启                                                                 | `POST /workspace/mcp/:server/restart` 接受 `?entryIndex=`，可能返回 `entries: RestartResult[]`         |
| （扩展 `mcp_guardrails`）   | 不变                                                                                                 | 同一标签，payload 新增 `scope`（F2 下为 `'workspace'`）                                                |

### 20.2 SDK 增量接口

```ts
// @qwen-code/sdk — 仅增量添加
export interface DaemonMcpBudgetWarningData {
  // 现有字段...
  scope?: 'workspace' | 'session'; // 新增 — 旧 daemon 不存在此字段（视为 'session'）
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

`EVENT_SCHEMA_VERSION` 保持为 `1`（增量添加）。

---

## 21. 测试矩阵

### 21.1 连接池键（F2-2）

- 相同配置 → 相同键（env 键排列稳定，header 键排列稳定）
- env 值差 1 字节 → 不同键
- header `Authorization` 值不同 → 不同键
- `includeTools`/`excludeTools`/`trust` 变更 → 键**相同**（每会话过滤器）
- 两个内容相同的 `new MCPServerConfig(...)` → 相同键（规范哈希，非引用相等）

### 21.2 生命周期（F2-2）

- 3 个会话获取同一键 → 1 次生成（通过 `client.connect` spy 验证）
- 释放顺序 n、n-1、...、1 → drain 计时器仅在 1→0 时启动
- 30s drain：第 25s acquire 取消计时器；第 35s acquire 生成新条目
- `MAX_IDLE_MS`（5 分钟）即使 drain 抖动也强制关闭
- 生成期间 in-flight 失败：所有等待方均收到错误；槽释放；无条目存储

### 21.3 并发获取（F2-2）

- 无条目时 5 个并发 `acquire(sameKey)` → 恰好 1 次 `spawnEntry` 调用，5 个均获得同一条目
- 生成 reject → 5 个等待方均以相同错误 reject；后续 acquire 重新生成

### 21.4 每会话隔离（F2-2）

- 会话 A `excludeTools: ['foo']`，会话 B 无排除 → A 的 ToolRegistry 缺少 foo，B 有；均来自同一 `toolsSnapshot`
- 会话 A `trust: true`，会话 B `trust: false` → 会话 A 的 `DiscoveredMCPTool.trust === true`，B 的为 `false`；验证不是共享引用（修改一个不影响另一个）
- 会话 A 获取仅含 prompt 的服务器 → A 的 PromptRegistry 有内容，该服务器对应的 ToolRegistry 为空

### 21.5 Tool/Prompt 列表变更（F2-2）

- 服务器发出 `notifications/tools/list_changed` → 所有订阅者的 `applyTools` 均以新快照调用
- 重连前版本的陈旧处理器**不**覆盖快照
- `notifications/prompts/list_changed` 类似场景

### 21.6 崩溃 + 重连（F2-2）

- 通过 `process.kill` kill 子进程 → 订阅者收到 `disconnected` 事件
- 3 次重连尝试（使用现有 `MCPHealthMonitorConfig`）→ 成功 → `reconnected` + 新快照
- 重试耗尽 → 所有订阅者收到 `failed`；条目转为 `failed` 状态；新 acquire 重试一次后抛出

### 21.7 后代 pid 扫描（F2-2b）

- Linux/macOS：以 stdio 命令生成 `bash -c "sleep 60 & sleep 60"` → kill 根进程 → 验证两个后代均被回收（`/proc/<pid>/status` 轮询，或 `kill(0, pid) === false`）
- Windows：生成 `cmd /c "ping -t localhost"` 包装器 → kill → 验证 ping 子进程已消失
- `pgrep` 不可用（PATH 中缺失）→ 优雅降级：记录警告，仅 SIGTERM 根进程，不崩溃

### 21.8 工作区级 budget（F2-4）

- 4 个会话 × `--mcp-client-budget=2`，3 个静态 MCP 服务器 → 工作区总计 = 3（非 12）；快照单元格 `scope: 'workspace'`、`liveCount: 3`
- Budget 警告在整个工作区 75% 向上穿越时触发一次；同时广播到所有 4 个会话
- 迟滞重置：降至 37.5% → 下次穿越再次触发

### 21.9 向后兼容（F2-3）

- 独立 `qwen`（无 daemon）→ `mcpPool === undefined` → 所有现有 `mcp-client-manager.test.ts` 测试原样通过
- `--no-mcp-pool` daemon 标志 → 回退到每会话模式，所有现有 daemon e2e 测试通过

### 21.10 凭据隔离（F2-3）

- 会话 A 注入 `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`，会话 B 注入 `tokenB` → 2 个独立进程；通过快照 `entryCount: 2` 验证；通过 stdin/日志 header 检查验证 A 的工具调用走 A 的传输

### 21.11 LoadSession / resume（F2-3）

- 会话关闭 → drain 启动 → 30s 内 resume → 连接池条目复用（无冷启动，通过 `client.connect` spy 计数断言）
- 30s 后但在恢复窗口到期前 resume → 连接池冷启动；restoreState 内容仍保留

### 21.12 重启路由（F2-3b）

- 该名称 1 个条目 → `POST /workspace/mcp/foo/restart` 返回传统 `{restarted: true, durationMs}` 形状
- 该名称 2 个条目（不同指纹）→ 返回 `{entries: [{fingerprint, restarted, ...}, ...]}`
- 另一次重启 in-flight 时再次重启 → 第二次调用返回同一 Promise（去重）
- 重启会超出 budget → 按条目返回 `{restarted: false, skipped: true, reason: 'budget_would_exceed'}`

### 21.13 状态路由（F2-3b）

- 空闲 daemon（无会话）但连接池有上次会话的缓存条目 → `GET /workspace/mcp` 返回 `initialized: true` 及实时统计
- 引导会话不存在 → 回退到连接池直接路径；无报错
- 连接池查询抛出 → 回退到引导会话路径；快照从不崩溃

### 21.14 SDK reducer（F2-4）

- 工作区事件广播时 `mcpBudgetWarningCount` 在所有订阅会话中同时递增
- `isWorkspaceScopedBudgetEvent(e)` 从 payload 正确识别 scope
- 旧 daemon（无 `scope` 字段）→ 默认解释为 'session'

### 21.15 热配置重载（F2-3）

- 运行中更改 settings.json → 旧会话保留旧条目，新会话创建新条目，二者共存；旧会话关闭后旧条目自然 drain
- 旧会话关闭后 0 个会话 → drain 计时器触发 → 旧条目 GC → 仅剩新条目

### 21.16 关闭顺序（F2-3）

- `QwenAgent.close()` 按顺序触发：停止接受 → drain prompt → 关闭会话 → `pool.drainAll` → 退出后 `pgrep -P <acpChildPid>` 中无僵尸 pid

---

## 22. 待解问题

V21 在设计默认值中锁定了 Q1/Q3/Q4/Q6（单 PR 交付）。Q2/Q5/Q7/Q8/Q9 仍待解。

| #     | 问题                                                                                                              | F2 设计默认值                                                                          | 需在何时决定     |
| ----- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| Q1 ✅ | SDK reducer 字段名——重命名还是保留？                                                                              | **v2.1 锁定**：保留 `mcpBudgetWarningCount` 等，在 JSDoc 中注明扩展 scope 语义         | 已解决           |
| Q2    | `mcp_workspace_pool` 能力——提升 `protocolVersions`（'v1' → 'v1.1'），还是保持 'v1' 增量？                         | **保持 'v1' 增量**（与 PR 14b 先例一致）                                               | 提交 5           |
| Q3 ✅ | `--no-mcp-pool` 标志——默认开启还是选择启用？                                                                       | **v2.1 锁定**：默认开启；`--no-mcp-pool` 为熔断开关                                   | 已解决           |
| Q4 ✅ | HTTP/SSE 默认——连接池关闭还是开启？                                                                               | **v2.1 锁定**：连接池关闭；通过 `--mcp-pool-transports` 启用                          | 已解决           |
| Q5    | `POST /workspace/mcp/reload-all`——纳入 F2 还是后续跟进？                                                          | **后续跟进**                                                                           | 不适用（已推迟） |
| Q6 ✅ | 懒加载连接池构建——值得引入条件判断吗？                                                                            | **v2.1 锁定**：急切构建（始终在 `QwenAgent` 构造函数中构建）                          | 已解决           |
| Q7    | `restoreState` 窗口 vs 连接池 drain——保持独立、对齐，还是从配置读取？                                             | **保持独立 30s 默认值** + 配置旋钮 `--mcp-pool-drain-ms`                              | 提交 4           |
| Q8    | OAuth 处理——确认 F3 推迟，记录临时方案？                                                                          | **推迟到 F3**，记录 `/mcp auth <name>` 临时方案                                       | 提交 4           |
| Q9    | `entrySummary` 暴露——始终包含，还是在 verbose 标志后？                                                            | **始终包含**（payload 小，对运维有用）                                                 | 提交 5           |
| Q10   | 更新 `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` 决策 #3——与 @wenshao 协调？               | F2 PR 描述链接 codeagents PR；两个 PR 独立评审                                        | PR 开启时        |

---

## 23. 风险

### 高风险

- **R1（A2 全局状态）**：同名多条目时 `serverStatuses` 碰撞。已通过聚合状态函数缓解；剩余风险是 SDK 消费者直接读取原始全局 Map（可能性低——仅通过 `getMCPServerStatus(name)` 访问器使用）。
- **R2（PromptRegistry 对称性）**：任何代码路径漏掉 prompt 扇出会静默丢失 prompts。已通过 F2-2 测试 21.4 第三条 + 集成测试断言 prompt 与 F2 前一致来缓解。
- **R3（HTTP 传输状态泄漏）**：为维护每传输会话状态的服务器启用 HTTP pool 会破坏会话上下文。已通过默认关闭 + 文档缓解；无法自动检测。

### 中风险

- **R4（路径统一 F2-1）**：`connectToMcpServer` 工厂和 `McpClient` 类有细微行为差异（如能力在构建时 vs 连接时广播）。已通过 F2-1 作为纯重构 PR 且有完整回归覆盖来缓解。
- **R5（Windows 后代 pid）**：PowerShell `Get-CimInstance` 可能较慢（fork 开销）或被 AppLocker 阻止。已通过 2s 超时 + 优雅降级缓解。
- **R6（连接池事件广播放大）**：budget 警告扇出到 100 个会话导致循环中 100 次 extNotification 调用。已通过 `Promise.all` 并行化 + 每会话 catch（现有 PR 14b 模式）缓解。

### 低风险

- **R7（指纹在 MCPServerConfig 版本间的稳定性）**：未来添加到 `MCPServerConfig` 但未纳入指纹的字段会静默允许错误共享。已通过显式规范化函数 + 枚举所有 `MCPServerConfig` 字段并断言覆盖的测试来缓解。
- **R8（版本计数器竞态）**：快速重启循环可能耗尽 JS 数字精度（≈ 2^53 = 以 1Hz 重启速率约 285k 年）。不是实际问题。

### 单 PR 特有（V21-14）

- **R9（约 6000 LOC 单 PR 的评审疲劳）**：评审者带宽成为关键路径。F3 在 F2 合并前受阻 → 阻塞其他贡献者。缓解措施：(a) 开 PR 前用 3 个专家 agent 预审并折叠 P0/P1，镜像 PR 21 的模式；(b) 结构化为 6 个原子提交供评审者逐步审阅；(c) 提前通过 #4175 评论与 @wenshao 协调评审窗口。
- **R10（`daemon_mode_b_main` 合并冲突积累）**：F2 涉及 `acpAgent.ts`、`httpAcpBridge.ts`、`capabilities.ts`、`mcp-client*.ts`——全是热路径。F3/F4 贡献者在 F2 约 1-2 周的评审窗口内并发落地可能引发冲突。缓解措施：每日 `git rebase origin/daemon_mode_b_main`；通过 #4175 更新告知 F3/F4 F2 正在评审中，请求其推迟热文件变更直到 F2 合并。
- **R11（CI 执行时间）**：约 1900 LOC 新测试含子进程生成 + 跨平台 pid 扫描，可能将 CI 从 30 分钟推高到 50 分钟。缓解措施：(a) 子进程测试以 `process.env.QWEN_INTEGRATION === '1'` 为门控，PR CI 运行子集 + 夜间运行完整集；(b) Vitest 并行度 ≥ 4；(c) Windows pid 扫描测试仅在 GHA Windows runner 上运行。

---

## 24. 文档更新

| 文档                                                                              | 更新内容                                                                                                                                               | 时机                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`                | 决策 #3「MCP 服务器生命周期」：当前为「每会话」；更新为「daemon 模式下以配置哈希为键的工作区池化；独立模式下每会话」                                   | F2-3 合并时（与 @wenshao codeagents PR 协调）        |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                                | Wave 5 PR 23 → 标记为 F2 系列；链接到 PR                                                                                                              | F2-3 合并时                                          |
| `packages/cli/src/serve/README.md`（如有）或新建 `docs/serve/mcp-pool.md`          | 新增章节：连接池语义、指纹键、传输启用方式、重启语义、状态快照解读                                                                                    | F2-3b                                                |
| `packages/sdk/README.md`                                                          | 守护事件上的 `scope?` 字段、服务器状态的 `entryCount`、辅助函数 `isWorkspaceScopedBudgetEvent`                                                        | F2-4                                                 |
| Issue #4175 正文                                                                  | 用子 PR 表格更新 F2 条目，链接到设计文档 v2（本文档）                                                                                                  | F2-1 开 PR 前                                        |
| Issue #3803 正文                                                                  | 决策 #3 行：将「当前每会话」更新为「daemon 下工作区池化（F2）」                                                                                        | F2-3 合并后                                          |
| `acpAgent.ts:869-936` 内联注释                                                    | 移除「Wave 5 PR 23」前向引用；更新为「由 F2 升级为 `scope: 'workspace'`」                                                                             | F2-4 PR                                              |
| CHANGELOG / 发版说明（Wave 6 / F5）                                               | 「MCP 进程现在在工作区内各会话间共享」标题                                                                                                             | F5 发版时                                            |

---

## 25. PR 描述模板（单 PR 交付）

```markdown
## feat(serve): shared MCP transport pool (workspace-scoped) [F2]

Single feature-cohesive PR per #4175 branching strategy (2026-05-19).
Replaces what was originally planned as Wave 5 PR 23 + sub-PRs F2-1..F2-4.

### Scope

~4100 LOC production + ~1900 LOC tests across 6 atomic commits.
Step through with `git log -p HEAD~6..HEAD` for commit-by-commit review.

### Design doc

See `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Pre-review specialist agents (per PR 21 pattern)

Folded into first commit before opening:

- code-reviewer: N findings, all adopted
- silent-failure-hunter: N findings, all adopted
- type-design-analyzer: N findings, all adopted

### Closes

(none — F2 entry in #4175 stays open until PR merges into main batch)

### Related

- #3803 decision #3 update (codeagents PR <link>)
- PR 14b (#4271 merged) — budget guardrail base; F2 graduates scope to workspace
- F1 (#4319 merged) — acp-bridge package; F2 depends on injection seams

### Backward compatibility

- Standalone `qwen` (non-daemon): pool not constructed; existing behavior preserved
- Daemon `qwen serve --no-mcp-pool`: kill switch falls back to per-session
- SDK: all new fields additive (`entryCount`, `scope?`); EVENT_SCHEMA_VERSION stays at 1
- Old SDK clients: unknown `scope: 'workspace'` ignored per PR 14 contract
- Old daemons: SDK consumers can detect absence of `mcp_workspace_pool` capability and fall back

### Test plan

- [ ] Pool key: env permutation stability, header divergence, per-session filter exclusion
- [ ] Lifecycle: 3-session sharing, drain grace, concurrent acquire dedupe, spawn failure slot release
- [ ] Tools + Prompts dual fan-out, per-session trust copy, snapshot replay on attach
- [ ] Generation guard: pre-reconnect handler doesn't overwrite post-reconnect snapshot
- [ ] Crash + reconnect with stdio backoff (5s × 3) and HTTP backoff (1/2/4/8/16s × 5)
- [ ] Descendant pid sweep: Linux/macOS pgrep recursion, Windows PowerShell CIM
- [ ] Budget at workspace scope: 4 sessions × budget=2 → 3 max (not 12); fan-out to all attached
- [ ] LoadSession resume within drain window: pool entry reused, no cold start
- [ ] Hot config reload: old/new entries coexist; old drains naturally
- [ ] Restart route: `?entryIndex=` selectivity; legacy single-entry response shape preserved
- [ ] In-flight tool call during reconnect: `MCPCallInterruptedError` rejection
- [ ] Standalone qwen: all existing mcp-client-manager tests pass unchanged
```

## 总结

F2 v2.1 = 包含 6 个原子提交的单 PR（约 6000 LOC），目标分支 `daemon_mode_b_main`。核心设计支柱：

1. **`McpTransportPool`** 位于 `packages/core`（ACP child 侧），工作区级，引用计数 + 30s drain
2. **指纹键** 对规范化配置（含 env/headers）做 SHA-256（claude-code 模式），排除每会话过滤器（includeTools/trust）
3. **`SessionMcpView`** 每会话 tool+prompt 注册表投影，含 trust 复制
4. **快照回放 + 版本守卫**，解决连接竞态和陈旧通知问题
5. **跨平台后代 pid 扫描**（opencode 模式 + Windows 移植）
6. **HTTP/SSE 需显式启用**，SDK MCP 绕过，OAuth 推迟到 F3
7. **Budget 状态机**升级为工作区级；快照单元格 + push 事件增量扩展（`scope?`）
8. **状态 + 重启路由**重构：连接池优先，引导会话回退；`entryCount` + `RestartResult[]`

**§22 中的待解问题 Q1–Q10** 需要维护者在各自子 PR 开启前决定。建议在 F2-3 启动前解决 Q1–Q4（这些关系到整体方向）；Q5–Q10 可增量解决。
