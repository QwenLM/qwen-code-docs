# LSP 运行时热重载设计

## 背景

本设计遵循 `mcp-runtime-reinitialization.md` 中使用的相同分层：CLI 决定何时触发重载，Core 决定如何更新运行时状态。它还复用了 `settings-change-detection.md` 中的 watcher 原则：启动时无文件系统副作用、防抖变更、语义 diff、序列化监听器，以及不影响主会话的监听器故障。

LSP 和 MCP 的关键区别在于，LSP 服务器配置不存放在 `settings.json` 中。目前，原生 LSP 服务使用 `LspConfigLoader` 读取工作区的 `.lsp.json` 和已启用扩展的 `lspServers` 声明，通过 `NativeLspService.discoverAndPrepare()` 将结果写入单会话的 `LspServerManager`，最后通过 `start()` 启动所有配置好的服务器。因此，仅靠 `SettingsWatcher` 无法检测到工作区 `.lsp.json` 的变更。

## 现有代码评估

- LSP 启动仅由 `packages/cli/src/config/config.ts` 中的 `--experimental-lsp` 控制。目前没有 `--allowed-lsp-server-names` 标志或等效的 LSP CLI 允许列表参数；现有的 `--allowed-mcp-server-names` 标志仅适用于 MCP。
- `NativeLspService` 在 CLI 配置加载期间构建一次。启动路径调用 `discoverAndPrepare()`，然后调用 `start()`，接着将服务包装在 `NativeLspClient` 中并附加到 `Config`。
- `Config.setLspClient()` 和 `Config.setLspInitializationError()` 目前在初始化后会抛出异常，因此运行时热重载不应替换客户端对象。它应保留现有的 `NativeLspClient`，仅对其背后的服务进行增量调和。
- `LspConfigLoader` 仅读取工作区的 `.lsp.json` 和活跃扩展的 `lspServers`。工作区的 `.lsp.json` 会按服务器名称覆盖扩展配置。
- `LspServerManager.setServerConfigs()` 目前会清除所有句柄；尚不支持增量调和。
- 当前仓库中没有 LSP 的共享池路径。每个会话拥有自己的 `NativeLspService` 和子进程/socket 连接。设计应为未来的共享池留出边界，但 v1 仅实现单会话模式。

## 目标

使 LSP 服务器配置更改无需重启当前 Qwen Code 会话即可生效：

- 添加服务器时启动它；
- 移除服务器时停止它，并将其从状态和工具路由中移除；
- 配置更改时，仅重启发生更改的服务器；
- 保持未更改的服务器连接，并保留其预热状态；
- 绝不启动不受信任或不被允许的服务器；
- 让 LSP 工具和 `/lsp` 状态通过现有的客户端对象观察新的运行时状态。

## 非目标

- 此次更改不添加共享 LSP 进程池。
- 不支持在运行时切换 `--experimental-lsp`。如果启动时未启用 LSP，则没有可重载的服务。
- 不完全监听影响 `lspServers` 的扩展安装/卸载更改；手动 `/reload` 将涵盖扩展配置更改。

## 设计

### 1. 使用稳定的哈希标识每个 LSP 服务器

在 LSP 配置代码附近添加一个小型辅助函数：

```ts
export function lspServerConfigHash(config: LspServerConfig): string;
```

哈希必须是稳定的，并基于 `LspConfigLoader` 生成的标准化运行时配置：

- `name`
- `languages`
- `transport`
- `command`
- `args`
- `env`
- `initializationOptions`
- `settings`
- `extensionToLanguage`
- `workspaceFolder`
- `rootUri`
- `startupTimeout`
- `shutdownTimeout`
- `restartOnCrash`
- `maxRestarts`
- `trustRequired`
- `socket`

必须对对象键进行排序，以免 JSON 属性顺序导致不必要的重启。数组顺序保持重要，因为命令参数顺序和语言优先级可能具有实际意义。不要包含进程 ID、状态、重启次数、诊断或预热状态等运行时字段。

为了未来兼容共享池，将池标识定义为：

```text
lsp:<workspaceRoot>:<serverName>:<configHash>
```

v1 单会话管理器只需维护 `serverName -> configHash`，但相同的哈希稍后可直接在池键中复用。

### 2. 为 LspServerManager 添加增量调和

热重载不应复用会清除所有句柄的 `setServerConfigs()`。添加：

```ts
async reconcileServerConfigs(
  configs: LspServerConfig[],
): Promise<LspReconcileResult>
```

流程：

1. 构建目标映射：`name -> config` 和 `name -> hash`。
2. 对于其服务器不再存在的现有句柄，调用现有的 `stopServer()`，然后删除该句柄。
3. 对于哈希已更改的现有句柄，调用 `stopServer()`，将句柄替换为 `{ config, status: 'NOT_STARTED' }`，然后启动它。
4. 对于新服务器，创建 `{ config, status: 'NOT_STARTED' }` 并启动它们。
5. 对于哈希未更改的服务器，不执行任何操作并保留现有句柄。

添加一个私有字段：

```ts
private serverConfigHashes = new Map<string, string>();
```

在 `stopAll()` 和 `clearServerHandles()` 中清除它。

返回：

```ts
interface LspReconcileResult {
  added: string[];
  removed: string[];
  restarted: string[];
  unchanged: string[];
  failed: string[];
}
```

`skipped` 不是 `LspServerManager` 结果的一部分。管理器仅处理已通过准入的配置；被准入拒绝的服务器由 `NativeLspService.reinitialize()` 聚合到服务级结果中。

并发：

- 在 `LspServerManager` 或 `NativeLspService` 中添加一个调和对列，使调和操作串行执行。停止和启动同一进程不能产生竞争。
- 如果在服务器仍在启动时收到新配置，请在停止它之前等待 `handle.startingPromise`。复用现有的启动锁，而不是添加额外的每服务器锁。
- `stopServer()` 本身在设置 `stopRequested` 后必须等待 `handle.startingPromise`，因此 `stopAll()`、移除和重启路径都能覆盖仍在分配其连接/进程的崩溃重启。

失败行为：

- 如果新添加或更改的服务器启动失败，保留句柄并将其标记为 `FAILED`，以便 `/lsp` 可以解释失败原因。
- 不要将启动失败计为 `added` 或 `restarted`；将其报告在 `failed` 中。
- 不要缓存启动失败的配置哈希。后续使用相同配置的保存必须重试，而不是被归类为 `unchanged`。
- 如果在创建连接或进程后启动失败，请在返回前释放该连接/进程。失败的初始化不能在 `FAILED` 句柄背后留下存活的 language server 进程或 socket 连接。
- 如果在创建连接之前启动失败（包括信任拒绝、不安全的命令路径或缺少命令），请清除缓存的配置哈希。后续使用相同配置的调和必须重试，而不是将失败的句柄视为未更改。
- 如果移除的服务器在关闭期间记录错误，仍将其从句柄映射中删除。
- 一个服务器的启动失败不能阻塞其他服务器的调和。

资源清理：

- `stopServer()` 必须释放自有服务器的两端：优雅关闭并结束 LSP 连接，然后如果生成的进程仍然存活则将其终止。这对于使用 `command` 启动的 `tcp`/`socket` 传输非常重要；仅关闭 socket 是不够的。
- `process.kill()` 必须通过其自身的错误处理进行隔离。在清理期间退出的进程不能中止剩余的调和操作。
- 优雅关闭必须始终有界等待。如果服务器配置未指定 `shutdownTimeout`，请使用默认的关闭超时，而不是无限期等待 `connection.shutdown()`。
- 当关闭完成或失败时，必须清除关闭超时计时器，以免较大的超时不必要地长时间保留句柄。
- 即使超时赢得竞争，也必须观察底层的 `shutdown()` promise，以便延迟的服务器端拒绝不会作为未处理的拒绝浮现。
- `stopAll()` 必须参与与热重载相同的调和对列。仅等待当前队列然后迭代句柄是不够的，因为新的调和可能会在等待和句柄清理之间进入。
- `NativeLspService.stop()` 在停止服务器之前，还必须取消任何进行中或排队的 `reinitialize()` 操作。实现使用 `AbortController` 进行协作取消：stop 将服务标记为正在停止，中止活动的重载，并且每个排队的重载在加载配置、调和、清除文档跟踪、重放文档或等待重放延迟之前检查信号。这可以防止关闭在缓慢的重载上无限期阻塞，同时防止取消的重载在 `stopAll()` 之后启动新的 LSP 进程。
- 崩溃重启也必须通过调和对列进行序列化，或者在永久失败时清除哈希。它们不能与配置更改调和并行启动替换进程。
- 崩溃重启重置必须隔离 `connection.end()` 和 `process.kill()` 错误。重置在旧连接/进程可能已损坏时运行，清理失败不能阻止排队的重启继续。
- `NativeLspService.stop()` 必须在 `serverManager.stopAll()` 之后清除 `openedDocuments` 和 `lastConnections`，以便停止的服务不会保留旧的文档集或连接对象。

### 3. 添加 NativeLspService.reinitialize()

添加：

```ts
async reinitialize(): Promise<LspServiceReinitializeResult>
```

流程：

1. 如果 `requireTrustedWorkspace` 为 true 且 `!config.isTrustedFolder()`，则调用 `serverManager.stopAll()` 并返回。这可以防止在工作区变为不受信任后旧的 LSP 进程继续运行。
2. 使用现有的 `LspConfigLoader` 加载工作区的 `.lsp.json` 和扩展配置。
3. 使用当前的优先级合并配置。
4. 在调和之前应用 LSP 准入过滤器。
5. 调用 `serverManager.reconcileServerConfigs(serverConfigs)`。
6. 仅对已移除和成功重启的服务器清除 `openedDocuments` 和 `lastConnections`；保留未更改和失败服务器的文档状态。失败的服务器保留其文档跟踪，以便后续成功重启时可以重放相同的打开文档。
7. 对于成功重启的服务器，为重启动前打开的文档重放 `textDocument/didOpen`。这使替换服务器获得相同的文档上下文，而无需等待下一次悬停、补全或诊断请求来延迟重新打开每个文件。在为服务器重放一个或多个文档后，等待与延迟 `ensureDocumentOpen()` 使用的相同的文档打开延迟，然后再报告重载完成。

打开文档的快照必须在 `reconcileServerConfigs()` 返回后获取，并且必须限定在 `reconcile.restarted` 范围内。然后在为重启的服务器清除跟踪之前，将调和挂起时打开的文档包含在重放快照中。

初始发现在调用 `setServerConfigs()` 之前应使用相同的准入过滤器。这使启动和热重载状态在不受信任的工作区中针对每个服务器的 `trustRequired` 过滤保持一致。

`.lsp.json` 解析失败需要特殊处理：不要将解析失败视为空配置。watcher 应报告无效配置事件，以便 CLI 可以显示用户可见的错误，但它不能为该事件调用 `reinitialize()`。`reinitialize()` 应保留旧的运行时状态，跳过调和，并将错误写入状态/日志。只有删除文件，或解析有效的空 JSON 配置，才意味着目标配置为空。

冷启动和热重载故意使用不同的用户配置解析严格度：

- `loadUserConfigs()` 保持宽松以兼容启动。它跳过无效的服务器条目并返回可以构建的有效条目。
- `loadUserConfigsStrict()` 由热重载使用。如果现有的 `.lsp.json` 在语法上有效，但包含无效的顶级结构或无法构建的服务器条目，它将返回错误并且 `reinitialize()` 不进行调和。这为无效编辑保留了当前运行的 LSP 状态。严格路径不能引入冷启动也未强制执行的字段级验证，因为那会使配置在启动时有效，但在下次保存时无效。收紧已知字段验证应作为启动和热重载的单独兼容性决策来处理。如果在严格加载期间文件丢失或被删除，请将该 `ENOENT` 视为有效的空用户配置，因为删除 `.lsp.json` 是移除所有工作区用户 LSP 服务器的明确方式。
`NativeLspService.reinitialize()` 返回一个服务级别的结果：

```ts
interface LspServiceReinitializeResult {
  reconcile: LspReconcileResult;
  skipped: Array<{
    name: string;
    reason: 'server_trust_required';
  }>;
}
```

在 `NativeLspClient` 中添加一个可选的 `reinitialize()` 方法并委托给 service。为了避免在 `Config.reinitializeLsp()` 中使用不透明的类型断言，直接扩展 `LspClient` 接口：

```ts
reinitialize?: () => Promise<LspServiceReinitializeResult>;
```

在 `Config` 中添加：

```ts
async reinitializeLsp(): Promise<LspServiceReinitializeResult | undefined>
```

当 LSP 被禁用或不存在 client 时，此方法为空操作。此方法不得在 `Config.initialize()` 之后替换 client。

由于 `setLspInitializationError()` 当前会拒绝初始化后的调用，因此添加一个运行时安全的私有状态 setter：

```ts
private setRuntimeLspInitializationError(error: Error | string | undefined): void
```

`reinitializeLsp()` 使用它通过 `getLspStatusSnapshot()` 暴露 reload 失败，而无需放宽公开的初始化后 client 变更 API。返回的 reconcile 结果中包含 `failed` 的 server 表示部分失败，而非完全成功。在这种情况下，`reinitializeLsp()` 必须设置 `initializationError`，并且只有在 reload 没有失败的 server 时才清除该错误。

### 4. 准入与权限边界

当前的 LSP 安全检查包括：

- `--experimental-lsp` 是唯一的启用开关；
- 在 discovery/startup 之前会检查 workspace trust；
- 每个 server 的 `trustRequired` 默认为 true；
- 在 spawn 之前会检查命令是否存在以及命令路径是否安全；
- `workspaceFolder` 被限制在 workspace 根目录内。

Hot reload 必须保留这些检查，并在启动新 server 或重启已更改的 server 之前完成这些检查。核心规则是：不要先 spawn 然后再决定 server 是否被允许。

Workspace 的 `.lsp.json` 是由 workspace 控制的输入。因此，即使用户配置文件中显式声明了 `"trustRequired": false`，也必须始终将其视为 `trustRequired: true`。Extension 提供的 LSP 配置仍可使用其声明的 `trustRequired` 值。这可以防止不受信任的 workspace 降低其自身的信任边界。

来自 `.lsp.json` 的环境变量也是由 workspace 控制的。Runtime spawn 可以合并允许的 env 覆盖，但 LSP 配置不得覆盖代码注入变量，如 `NODE_OPTIONS`、`LD_PRELOAD`、`LD_LIBRARY_PATH`、`DYLD_INSERT_LIBRARIES` 和 `DYLD_LIBRARY_PATH`。允许实际 server 进程使用 `PATH` 以保留常见的工具链设置。命令存在性探测可以保留探测可能需要的常规配置提供的 env 值，但在解析裸命令名称时不得使用配置提供的 `PATH`。这可以防止恶意的 workspace `PATH` 在真实启动路径之前将诸如 `clangd --version` 的探测重定向到非预期的可执行文件。敏感 env key 过滤（包括仅限探测使用的 `PATH` 过滤）必须不区分大小写，以便 Windows 风格的不区分大小写的环境变量名（如 `Path`、`node_options` 或 `Ld_PreLoad`）无法绕过拒绝列表。

允许列表（Allow-list）边界：

- 当前仓库不支持 LSP server 名称的 CLI 允许列表。我确认 LSP 只有 `--experimental-lsp`；允许列表参数仅适用于 MCP。
- 如果此功能添加了 `--allowed-lsp-server-names`，其行为必须类似于 MCP 启动允许列表，并作为整个会话生命周期的上限。Runtime 配置可以缩小此集合，但不得超出 CLI 启动上限。
- 将启动上限存储在 `ConfigParameters.lsp` 中：

```ts
cliAllowedLspServerNames?: string[];
```

为其暴露一个 getter。不要从可变设置中读取上限。

准入逻辑应提取为一个纯函数：

```ts
filterLspServerConfigs(configs, {
  workspaceTrusted,
  requireTrustedWorkspace,
  cliAllowedServerNames,
}): {
  admitted: LspServerConfig[];
  skipped: Array<{
    name: string;
    reason: 'server_trust_required';
  }>;
}
```

尽管目前还没有 LSP 审批存储或 CLI 允许列表，但这个辅助函数使安全边界变得明确，并为未来基于 hash 的审批门控留下了空间。如果未来添加了 `--allowed-lsp-server-names` 标志，它应该在那时添加一个 `not_allowed` 的跳过原因，而不是在 v1 中携带一个未连接的允许列表路径。

信任语义必须与当前的启动路径匹配：

- 如果 `requireTrustedWorkspace` 为 true 且 workspace 不受信任，`NativeLspService.reinitialize()` 会在服务层停止所有 server 并返回。它不会进入准入过滤器，也不会保留旧的 server。
- 如果 `requireTrustedWorkspace` 为 false，服务不会在全局进行短路处理，但准入过滤器仍会跳过 `trustRequired: true` 的单个 server。
- 如果 workspace 受信任，`trustRequired` 不会阻止 server。

### 5. 触发机制

需要两种触发路径。

#### 自动 Workspace `.lsp.json` 触发

在 CLI 中添加一个职责更窄的 `LspConfigWatcher`，以 `SettingsWatcher` 为模型，但职责更小：

- 仅监视 workspace 根目录并严格匹配 basename `.lsp.json`；
- 不创建任何目录或文件；
- 防抖 300 ms；
- 使用 parse + canonicalize 比较 `.lsp.json` 的前后内容，以便仅格式更改不会触发 reload；
- 将 `ENOENT` 视为删除；
- 区分 JSON 解析失败和其他读取失败。两者都应使用用户可见的无效配置事件通知监听器并保留旧的运行时状态，但错误消息必须反映文件是无效的 JSON 还是不可读；
- 文件删除是一个独立的事件，应通知 reload 监听器，产生空的 workspace 配置；
- 串行运行回调；
- 使用与 `SettingsWatcher` 匹配的监听器超时和故障隔离；
- 仅在监听器通知成功后才推进存储的语义快照。如果监听器抛出异常或超时，保留之前的快照，以便再次保存相同内容时重试 reload。

仅在 `config.isLspEnabled()` 且 client 支持 `reinitialize()` 时注册该 watcher。发生变更时，调用：

```ts
await config.reinitializeLsp();
```

然后发出明确的运行时事件，例如 `AppEvent.LspStatusChanged`。`/lsp`、`/about` 或 `/status` 等 UI 界面可以订阅该事件以进行刷新。如果 reconcile 返回部分失败，在抛回给 watcher 之前发出 status-changed 事件；这允许 UI 观察到成功重启的 server，同时 watcher 仍保留旧的语义快照以供重试。失败时，还要通过 `AppEvent.LogError` 显示用户可见的错误；在可用时包含底层的 parser/startup 错误消息，不要仅仅写入 debug 日志。

#### 手动 `/reload` 触发

当未来的 `/reload` 命令落地时，它应该同时调用：

```ts
await config.reinitializeMcpServers(...);
await config.reinitializeLsp();
```

手动 reload 还为 extension `lspServers` 的更改提供了回退路径，因为这些更改可能不会映射到 workspace `.lsp.json` 文件事件。

## 单会话与共享池

当前状态：仅存在单会话模式。仓库中没有 LSP 对应的 MCP transport pool。

v1：在 `LspServerManager` 内部实现增量 reconcile。每个会话拥有自己的进程和 socket。

未来的共享池：保留 `NativeLspService` 作为消费者，并将 `LspServerManager` 内部替换为获取/释放以下内容的机制：

```text
lsp:<workspaceRoot>:<name>:<hash>
```

pool 条目。准入过滤仍必须在获取之前发生，与 MCP 共享池修复相匹配，因此不允许或不受信任的 server 无法通过池路径启动。

## 单元测试计划

优先进行单元测试。针对真实 LSP server 的集成测试速度慢且依赖环境，因此不作要求。

### 核心测试

`packages/core/src/lsp/configHash.test.ts`

- hash 忽略对象 key 顺序；
- command、args 顺序、env、settings、workspace folder、socket 和 trust requirement 的更改会改变 hash；
- hash 排除 status/process/runtime 字段。

`packages/core/src/lsp/LspServerManager.test.ts`

- 添加 server 时仅启动一次；
- 移除 server 时将其关闭并从 handles 中删除；
- hash 更改时停止旧 handle 并启动新 handle；
- hash 未更改时不停止/启动并保持 handle 身份；
- 创建连接后的启动失败会释放连接和拥有的进程；
- 停止由 `command` 启动的 `tcp`/`socket` server 会关闭连接并终止拥有的进程；
- 当 shutdown 提前完成时，会清除 shutdown 超时定时器；
- 缺少 `shutdownTimeout` 时仍使用默认的 shutdown 超时，且不能永远阻塞 reconcile；
- `stopAll()` 在释放资源前等待正在进行的启动完成；
- `stopAll()` 通过 reconcile 队列串行化，不能与后续的 reconcile 并发运行；
- `process.kill()` 错误会被记录且不会中止清理；
- 一个 server 启动失败不会影响另一个 server 的 reconcile；
- 并发 reconcile 串行运行；
- `stopAll()` 和 `clearServerHandles()` 会清除 hash map；
- 失败的启动会在 `failed` 中报告，不会被报告为 added/restarted，且不会缓存其 config hash；
- 初始启动失败会清除缓存的 hash，以便后续使用相同配置的 reconcile 进行重试；
- 崩溃重启与 reconcile 串行化，并在永久失败时清除缓存的 hash；
- 崩溃重启重置会忽略连接/进程清理错误并继续排队的重启；
- 命令存在性探测保留常规配置提供的 env 值，但不使用配置提供的 `PATH`，且代码注入 env 覆盖会在 spawn 前被过滤；
- reconcile 返回值包含 added/removed/restarted/unchanged/failed，不包含 admission skipped。

在测试中 Mock `createLspConnection`、初始化和 shutdown。不要启动真实的 language server。

`packages/core/src/lsp/NativeLspService.test.ts`

- `reinitialize()` 加载 workspace 和 extension 配置并将合并后的配置传递给 manager reconcile；
- `.lsp.json` 解析失败会保留旧的运行时状态且不调用 manager reconcile；
- 严格的 hot reload 会拒绝无效的顶层形状和无法在不 reconcile 的情况下构建的 server 条目，而冷启动会继续从同一文件加载有效条目；
- 删除 `.lsp.json` 会将 workspace 配置视为空并触发 reconcile；
- 严格加载将 `ENOENT` 视为空用户配置，包括在 watcher 通知和 reload 之间文件消失的删除竞争情况；
- 不受信任的 workspace 会停止所有 server 且不进行 reconcile/start；
- 初始 discovery 应用与 hot reload 相同的每个 server 的 `trustRequired` 准入过滤器；
- workspace `.lsp.json` 无法选择退出 `trustRequired`；
- 如果实现了 CLI 允许列表，则上限会过滤准入的配置；
- 服务级返回值聚合准入跳过的原因；
- 重启/移除的 server 仅清除其自身的文档跟踪。
- 失败的 server 不会清除文档跟踪，并可以在后续成功重启后重放这些文档。
- 重启的 server 在替换 server 就绪后，为之前打开的文档重放 `textDocument/didOpen`，然后等待文档打开处理延迟。
- 在 reconcile 挂起期间打开的文档会包含在重启 server 的重放快照中。
- `stop()` 会在启动新 server 之前取消正在进行的 replay 延迟和排队的 `reinitialize()` 调用。
- `stop()` 在停止所有 server 后清除文档跟踪缓存。

`packages/core/src/config/config.test.ts`

- 当禁用或不存在 client 时，`reinitializeLsp()` 为空操作；
- 当启用且 client 支持 `reinitialize` 时，它会委托调用；
- 当 reinitialize 抛出异常时，状态快照会暴露初始化/reload 错误。
- 当 reinitialize 返回部分失败时，状态快照会暴露初始化/reload 错误，直到后续完全成功的 reload 将其清除。
### CLI 测试

`packages/cli/src/config/lspConfigWatcher.test.ts`

- 不创建 `.lsp.json`；
- 检测创建/修改/删除操作；
- 忽略无关文件；
- 在规范解析后，忽略仅包含格式更改的变更；
- 解析失败时发出 invalid-config 通知以向用户提供可见反馈，且不触发 LSP 重新初始化；
- 非 ENOENT 读取失败时发出用户可见的读取失败消息，且不触发 LSP 重新初始化；
- 删除 `.lsp.json` 触发 reload listener；
- 对重复的文件事件进行防抖处理；
- 缓慢的 listener 串行运行；
- listener 失败不会推进存储的 snapshot，且后续通知可以重试相同的内容。

`packages/cli/src/ui/AppContainer.test.tsx` 或相应的事件测试

- `AppEvent.LspStatusChanged` 触发 UI 刷新；
- reload 失败时通过 `AppEvent.LogError` 发出用户可见的错误。
- 部分 reconcile 失败时，在 listener reject 之前仍会发出 `AppEvent.LspStatusChanged`，以便 UI 状态能够反映 reload 成功的部分。

`packages/cli/src/config/config.test.ts`

- 保留现有的断言，即 `--experimental-lsp` 会构建并启动 native LSP；
- 如果添加了 `--allowed-lsp-server-names`，解析器需支持逗号分隔的值和重复的 flag，并将其存储为启动时的上限。

`packages/cli/src/ui/commands/lspCommand.test.ts`

- 如果 `LspStatusSnapshot` 暴露了 skipped 原因，状态输出就可以显示被跳过/不允许的 server。

覆盖率目标：新的纯函数应接近 100%；watcher 的分支覆盖率应与 `SettingsWatcher` 相当；manager 的 reconcile 必须覆盖 add/remove/change/unchanged/failure/concurrency。

## 严格审查

### 结论

1. **v1 不应使用 stop-all/start-all。**
   这种实现最简单，但每次保存都会重启未更改的 language server 并丢失预热状态。当前的 manager 已经具备针对每个 server 的生命周期方法，增量 reconcile 所需的额外代码量是可控的。

2. **不要将 `.lsp.json` 的变更放入 `SettingsWatcher`。**
   `SettingsWatcher` 负责 settings 作用域内的 reload。让它监听任意的 workspace 文件会模糊其职责边界，并使 MCP/settings 的行为更难推导。使用一个独立且职责单一的 `.lsp.json` watcher 会更清晰。

3. **初始化后不要替换 `NativeLspClient`。**
   `Config.setLspClient()` 明确禁止初始化后的变更。在 adapter 背后更新 service 可以避免扩展生命周期 API。

4. **准入检查必须在进程 spawn 或 pool 获取之前进行。**
   这与 MCP 共享 pool 设计中指出的风险相同。尽管目前 LSP 没有 pool，但 service 级别的 reload 结果应返回启动前过滤的 skipped 原因，以免未来的 pool 路径意外启动被拒绝的 server。

5. **新的 LSP CLI allow-list 是可选的，但如果添加，它必须是一个上限。**
   当前代码没有 LSP allow-list。设计不能允许 settings 在运行时放宽 command-line 的限制，否则其安全性将弱于 MCP 热重载的安全语义。

### 剩余风险

- Extension 的 `lspServers` 可能会在不更改 `.lsp.json` 的情况下发生变化。自动 watcher 无法覆盖所有 extension 文件系统的变更；手动的 `/reload` 可以覆盖该路径。
- 某些 language server 无法很好地容忍快速重启。串行化的 reconcile 和防抖可以降低风险，但测试应覆盖快速连续变更的情况。
- TCP/socket server 可能是由外部管理的守护进程。reconcile 应该关闭连接，但只有当本进程通过 `command` 启动了该 server 时，才应接管该进程的所有权。