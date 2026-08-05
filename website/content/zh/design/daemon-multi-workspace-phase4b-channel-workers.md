# Daemon 多工作空间 Phase 4b：按工作空间划分的 channel worker

## 摘要

本文档设计 issue #6378 Phase 4b 的 channel worker 切片：把 daemon 管理的 channel worker 按工作空间分组。语音（`/workspaces/:workspace/voice/stream`）是一个独立的 Phase 4b 切片，不在本文档范围内。

目前 `qwen serve --channel <name>` 启动一个绑定到主工作空间的单个 channel worker。在多工作空间模式下，worker 必须按拥有每个 channel 的工作空间分组：每个已注册的受信任工作空间获得自己的 worker 进程，绑定到该工作空间的 cwd、`QWEN_DAEMON_WORKSPACE` 和有效 env 覆盖层。pidfile 和 daemon 状态增加一个增量的 worker 列表，同时保留现有的单 worker 字段。`--channel all` 在 v1 中保持仅限主工作空间。单工作空间行为不变。

映射模型：channel 按**其解析后的 cwd 隐式分组** — 一个 channel 属于其配置的 cwd 所解析到的已注册工作空间。不添加新的 CLI 语法。

## 基线：当前 channel worker 接缝

- `run-qwen-serve.ts` 在 listen 回调中创建一个 `ChannelWorkerSupervisor`（绑定到主工作空间 `boundWorkspace`），并在 `completeRuntimeStartup` 中启动它。`completeRuntimeStartup` 是每条运行时启动路径（急切的 `deps.bridge` 路径和 `startRuntime` -> `buildRuntime` 路径）的单一汇聚点。`deps.bridge` 被限制为单个工作空间，因此多工作空间总是经过 `startRuntime`。
- `commands/channel/daemon-worker.ts` 把自己的工作空间与 `capabilities.workspaceCwd`（主）校验，因此非主 worker 会抛出异常。`validateChannelWorkspaces` 还要求每个 channel 解析的 cwd 等于 daemon 工作空间。
- `config-utils.ts` 把 channel 的 cwd 解析为 `resolvePath(rawConfig.cwd || defaultCwd)`；`loadChannelsConfig(W)` 返回 `loadSettings(W).merged.channels`，它合并系统/用户/工作空间作用域。
- `channel-worker-supervisor.ts` 从 `{...process.env}` 构建 worker env。在多工作空间模式下，父 env 是 daemon 基础 env（Phase 2a env 隔离），因此会漏掉工作空间自己的 `.env`。
- pidfile `ServiceInfo` 是单 worker 的（`channels[] / servePid? / workerPid?`）；daemon 状态 `runtime.channelWorker` 是单个快照。
- 工作空间 registry（在 `buildRuntime` 内部构建）暴露每个运行时的 `env.effectiveEnv`、`trusted` 和规范 `workspaceCwd`。Phase 2a/3 会话路由已经按 `workspaceCwd` 指向运行时。

## 分组算法

一个纯函数 `resolveChannelWorkspaceGroups` 镜像 worker 侧的 `validateChannelWorkspaces` 和 `config-utils` 的 cwd 解析 — 否则 serve 层分组和 worker 自己的校验可能不一致。由于 `loadChannelsConfig(W)` 跨作用域合并，所有权不能由“哪个工作空间的合并配置包含该名称”来决定。

对每个选定的 channel `name`，遍历已注册工作空间 `W`。如果 `name` 在 `loadChannelsConfig(W)` 中，计算 `resolvedCwd = canonicalizeWorkspace(resolvePath(cfg[name].cwd ?? W))`。**当且仅当 `resolvedCwd === W`** 时，`W` 是候选 owner（即该 channel 在 `W` 下能通过 `validateChannelWorkspaces`）：

- 显式 `cwd` = 已注册路径 X：只有 `W === X` 满足 -> owner = X（无歧义）。
- 无 `cwd`，只定义在工作空间自己的作用域（`/B/.qwen/settings.json`）：只出现在 B 的合并配置中并解析到 B -> owner = B（无歧义）。
- 无 `cwd`，定义在用户/系统作用域：在每个 W 下都满足 -> 多个 owner -> 真正歧义。
- 显式 `cwd` = 未注册路径：没有 W 满足 -> 零个 owner。

错误与聚合：

- 零个 owner -> `channel_workspace_mismatch`（未配置，或 cwd 指向未注册的工作空间）。
- 多于一个 owner -> `ambiguous_channel_workspace`（用户/系统作用域且无 `cwd` 的 channel；运维人员必须把它限定到某个工作空间或添加显式 `cwd`）。
- owner 不受信任 -> `untrusted_workspace`（channel 需要创建会话）。
- 唯一受信任 owner -> 按 owner 分组名称 -> 每组获得 `{mode:'names', names}`。
- `mode:'all'` -> 仅主：`[{ workspaceCwd: primary, selection: {mode:'all'} }]`。主 worker 加载主的合并 channel；cwd 不是主的条目保持现有的 `validateChannelWorkspaces` 错误行为。
- 单工作空间（仅主）：`resolvedCwd` 只能是主，产生与今天完全相同的单个组。

配置解析和所有权分组使用一个共享的 cwd helper。显式绝对路径和 `~/...` 保持其现有含义；普通相对路径对着正在加载设置的工作空间解析。owner 路径随后被规范化，因此 serve 层和 worker 不会对所有权产生分歧。

## Worker 身份与 env

`CreateChannelWorkerSupervisorOptions` 增加一个可选的 `workerBaseEnv`（默认 `process.env`）。`createWorkerEnv` 使用 `workerBaseEnv ?? process.env` 作为基础；其余一切不变（`QWEN_DAEMON_WORKSPACE`、token env 擦除、daemon token 注入）。组 manager 传递 `runtime.env.effectiveEnv ?? process.env` — 直接读取该字段可以避免从 `server.ts` 导入私有 helper，而父进程模式的运行时（单工作空间）的 `effectiveEnv` 为 undefined，恰好像今天一样回退到 `process.env`。

## daemon-worker 校验修复

`DaemonCapabilitiesLike` 增加可选的 `workspaces?: Array<{ cwd; id; primary; trusted }>`（自 Phase 2a 起已由 `/capabilities` 发布）。校验解析 `daemonWorkspace = canonicalizeWorkspace(opts.workspace)`；当 `capabilities.workspaces` 存在时，它必须匹配其中之一且受信任，否则对旧的单工作空间 daemon 回退到旧式 `== capabilities.workspaceCwd` 检查。两侧都是规范的（supervisor 传递 `runtime.workspaceCwd`），因此比较是稳定的。worker 的其余部分（channel 配置加载、`validateChannelWorkspaces`、`createOrAttach({workspaceCwd})`）已经适用于多工作空间路由。

## Supervisor 组 manager

一个薄的 `ChannelWorkerGroup` 拥有 `Map<workspaceId, ChannelWorkerSupervisor>`：

- 从解析的组和 registry 构建；每个 supervisor 绑定到其运行时的 `workspaceCwd`、selection 和 `env.effectiveEnv`，并通过与单 worker 相同的可注入工厂创建。
- `start()` 顺序启动各 supervisor，如果后面的启动失败则回滚已启动的。`stop()` 等待任何进行中的重启并停止每个 supervisor。`killAllSync()` 保持为信号处理器回退。
- `restart()` 是 daemon 范围的重载事务。并发请求被合并；各 supervisor 顺序重启，任何失败都会停止整个组，以避免部分重载的机群。
- `snapshots()` 返回每工作空间的快照（`ChannelWorkerSnapshot & { workspaceId; workspaceCwd; primary }`）；`primarySnapshot()` 支撑旧式单 worker 字段。
- 任何 supervisor 的 `onReady` / `onExit` 都触发一次从 `snapshots()` 的完整 pidfile 重写（绝不做增量单条目更新 — 见下文）。

## pidfile schema 与并发

`ServiceInfo` 增加可选的 `workers?: Array<{ workspaceId?; workspaceCwd?; channels: string[]; workerPid? }>`。顶层 `channels` 变为所有 worker channel 的并集，顶层 `workerPid` 保持为主 worker 的 pid，因此旧读取方（只读取 `workerPid` 和 `channels` 的 `qwen channel status`）不受影响。

并发：有 N 个 worker 时，`onReady`/`onExit` 回调并发触发。对单条目的读改写会丢失更新。取而代之的是，写入方从组获取完整快照集并执行一次同步完整重写。`writeServeServiceInfo` 使用同步的 `openSync`/`writeSync` 且无 `await`，因此完整快照写入足够原子 — 最后一次写入总是持有完整画面。`writeServeServiceInfo` 增加一个可选的 `workers` 参数，在现有的 `O_RDWR + O_NOFOLLOW` + serve 所有权守卫下原样写入；`parseServiceInfo` 可选地校验 `workers?` 并透传。

## daemon 状态 schema

`DaemonStatusRuntime` 增加可选的 `channelWorkers?: Array< ChannelWorkerSnapshot & { workspaceId; workspaceCwd; primary }>`；必需的 `channelWorker` 保持为主组快照以兼容旧客户端。getter（`getChannelWorkerSnapshots`）从 `run-qwen-serve` 通过 `ServeAppDeps` 和 `BuildDaemonStatusOptions` 穿线，镜像现有的 `getChannelWorkerSnapshot` 路径，并在 bootstrap 状态中也暴露。在组创建之前（启动前），它报告 disabled 快照。

## 编排与时序

- 单个 `channelWorker` 变量在外层作用域变为组 manager 引用，使 pidfile 写入方和关闭路径仍能看到它。
- 提前快速失败：在 listen 时（`buildRuntime` 之前），纯分组函数对 `workspaceInputs` + `loadSettings` + 启动冻结的信任（`getWorkspaceTrustStatus`）运行一次。未知、歧义、不受信任和无效的 cwd 所有权会在暴露可用句柄之前拒绝启动。解析出的组计划在启动的其余部分被冻结；之后不会在不同的文件系统快照下重新分组。
- 实际创建/启动移入 `completeRuntimeStartup`：它从 `runtimeApp.locals.workspaceRegistry` 读取 registry（多工作空间保证存在，因为总是经过 `startRuntime` -> `buildRuntime`），为每个冻结的组构建一个 supervisor 并启动它们 — 取代单个 `channelWorker.start()`。
- 新构建的运行时 app 在 channel supervisor 启动之前被发布并附加到 ACP 传输。worker 在 bootstrap 期间需要运行时 `/capabilities` 路由，并且可能在连接后立即接收 channel 流量，因此其 daemon 会话路由必须已经可用。这与 `main` 上现有的单工作空间顺序一致；`runtimeReady` 仍然只在每个请求的 supervisor 达到就绪后才落定。
- channel worker 启动失败仍然是致命的。运行时发布会在组、pidfile、bridge 和监听器被拆除之前撤回；worker 阶段期间的运行时启动超时走同一路径，而不是留下一个监听中的 daemon。组取消也防止后续的工作空间 supervisor 在该拆除开始之后才启动。
- pidfile 预留保留聚合的 channel 名称；关闭路径（`stopChannelWorkerAfterFailedStartup`、`killAllSync`、正常关闭）扇出到组。

回归风险：对单工作空间，创建时序从 listen 回调移到 `completeRuntimeStartup`。现有的 `run-qwen-serve.test.ts` channel 测试（注入工厂、就绪时写 pidfile、二次信号强杀）必须保持绿色。多工作空间编排覆盖还会从 supervisor 启动探测实时 daemon 的 `/capabilities` 路由，使运行时/worker 顺序不会在注入的仅 ready 工厂背后退化。

## 启动行为

- 单工作空间：与今天相同。
- 多工作空间 + `--channel names`：按 owner 分组，每个受信任工作空间一个 worker；零个/多个 owner/不受信任 -> 清晰的启动错误（不做半启用）。
- 多工作空间 + `--channel all`：只有主 worker，并附 stderr 说明非主 channel 不被托管。

## 兼容性与限制

- 单工作空间不变；旧 pidfile/状态读取方保留 `channels`/`workerPid`/`channelWorker`。
- 运维指导：要在非主工作空间托管一个 channel，在该工作空间自己的 `.qwen/settings.json` 中定义它（不需要 `cwd`），或在任意作用域定义它并带等于该工作空间路径的显式 `cwd`。用户/系统作用域且无 `cwd` 的 channel 在多工作空间模式下必须消歧，否则 daemon 启动报错。
- v1 限制：歧义/同名 channel 需要未来的显式语法；`--channel all` 仅限主工作空间；单 daemon 故障半径覆盖所有工作空间的 worker；一个 daemon token 覆盖所有工作空间。

## 开放问题

- 歧义 channel 是否应该可以通过显式的 `--channel <workspace>:<name>` 语法解析，而不是启动报错？
- `--channel all` 最终是否应该扇出到所有工作空间？

## 范围外

- 语音 `/workspaces/:workspace/voice/stream` 和每工作空间语音。
- 动态工作空间添加/移除（Phase 5）。
