# 扩展文件重载设计

## 背景

扩展变更目前从两个不同方向进入运行时。用户发起的 UI 变更，例如启用、
禁用、安装、卸载和更新，已经走 `ExtensionManager`，可以直接刷新运行时
状态。带外的文件系统变更，例如编辑已安装扩展的 `skills/`、`commands/`、
`hooks/` 或 `qwen-extension.json`，不属于任何单个 UI 操作，因此需要一条
watcher 驱动的路径。

本设计在保留直接变更路径的同时补上这条缺失的 watcher 路径。它遵循 MCP
和 LSP 热重载设计使用的相同分层：

- CLI 决定何时文件系统变更应触发重载或用户通知；
- Core 拥有扩展运行时状态如何刷新；
- UI 组件消费一个小的事件/状态对象，而不是直接轮询扩展文件。

关键约束是并非每个扩展文件都能以相同方式安全地热应用。内容类的能力文件
可以自动刷新，但包级变更应要求用户运行 `/reload-plugins`，以便扩展缓
存、运行时工具、hooks、上下文文件和斜杠命令列表从一个一致的快照重建。

## 当前代码评估

- `ExtensionManager` 已经加载扩展 manifest、约定目录、安装元数据、启用
  状态、marketplace 来源状态、commands、skills、agents、hooks、MCP 声明
  和 LSP 声明。
- UI 扩展操作在更改运行时相关状态后已经调用
  `ExtensionManager.refreshTools()`。该路径通过 Core 刷新 MCP、skills、
  子代理、hooks 和分层内存。
- 斜杠命令补全由 `CommandService.create()` 从 loaders 构建。扩展命令和
  skill 支撑的斜杠命令不会自动出现，除非 `reloadCommands()` 重建那个命
  令服务。
- Skill 和子代理管理器有缓存刷新 API，但这些缓存与斜杠命令补全是分离
  的。
- Hooks 由 `HookSystem` 和 `HookRegistry` 拥有。重建整个 hook 系统会丢
  失 agent 作用域的临时 hooks，因此重载必须只针对已配置的 hooks。
- `SettingsWatcher` 和既有的 MCP/LSP watcher 不覆盖已安装的扩展包内
  容。扩展专属文件需要自己的 watcher。
- 链接的扩展可以位于用户扩展目录之外，因此只监视 `~/.qwen/extensions`
  会遗漏活跃的开发工作流。

## 目标

让扩展变更在当前交互式会话中生效，无需完整重启 CLI：

- 保持 UI 扩展变更立即生效；
- 检测用户扩展目录下的手动扩展编辑、添加和移除；
- 检测链接扩展源目录中的编辑；
- 自动刷新 `commands/`、`skills/` 和 `agents/` 下的内容级能力文件；
- 对包级变更提示用户运行 `/reload-plugins`；
- 作为运行时重载的一部分刷新 hooks，且不丢失 agent 作用域的 hooks；
- 保持斜杠命令补全与命令和 skill 变更同步；
- 对 Qwen 自己的扩展变更写入的改动抑制 watcher 通知；
- 呈现 MCP 和 hook 重载失败，而不是报告误导性的成功重载摘要。

## 非目标

- 不让 hook 文件编辑可内容自动刷新。Hook 行为可能影响命令执行和安全敏
  感的工作流，因此 hook 编辑被视为包级变更。
- 不热重载任意扩展文件。未知文件被忽略，除非它们是已解析的上下文文
  件。
- 不添加逐扩展的增量 MCP 重启。本设计继续使用既有的 MCP 重初始化入口
  点。
- 不改变扩展发现、转换、安装来源解析或 marketplace 语义。
- 不支持 bare mode 的运行时切换。在 bare mode 下 watcher 根本不会启
  动。

## 代码结构

实现有意按层拆分。

```text
packages/core/src/extension/
  extensionManager.ts
    Extension mutation lifecycle events.
    UI mutation methods still own direct runtime refresh.

  extension-runtime-refresh.ts
    Core runtime refresh contract for extension mutations.

packages/core/src/hooks/
  hookRegistry.ts
    Reload configured hooks while preserving agent-scoped hooks.

  hookSystem.ts
    Public hook reload facade used by extension runtime refresh.

packages/cli/src/config/
  extension-refresh-state.ts
    Shared event/state object for watcher, slash processor, and reload command.

  extension-file-watcher.ts
    Filesystem watcher and path classifier.

  extension-runtime-reload.ts
    CLI reload helpers for /reload-plugins and content auto-refresh.

packages/cli/src/ui/commands/
  reload-plugins-command.ts
    Interactive slash command for package-level extension reload.

packages/cli/src/ui/hooks/
  slashCommandProcessor.ts
    Event consumers for stale notifications and content auto-refresh.

packages/cli/src/
  gemini.tsx
  ui/AppContainer.tsx
  ui/startInteractiveUI.tsx
    Startup and dependency injection for ExtensionRefreshState and watcher.
```

## 设计

### 1. 分类文件系统变更

`ExtensionFileWatcher` 把一个 chokidar 事件映射为三种结果之一：

```ts
type RefreshAction = 'auto' | 'stale' | false;
```

分类有意保守。

| 路径类别                       | 动作    | 原因                                                                                             |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `commands/**`                  | `auto`  | 斜杠命令 loaders 可以从既有扩展缓存重建。                                                        |
| `skills/**`                    | `auto`  | Skill 缓存和斜杠命令 loaders 可以在不改变包身份的情况下重建。                                    |
| `agents/**`                    | `auto`  | 子代理缓存可以在不改变包身份的情况下重建。                                                       |
| `hooks/**`                     | `stale` | Hook 执行行为应从一致的包快照重载。                                                              |
| `qwen-extension.json`          | `stale` | Manifest 可以改变 commands、skills、agents、hooks、MCP、LSP、上下文文件名和元数据。              |
| `.qwen-extension-install.json` | `stale` | 安装元数据影响链接源根和包身份。                                                                 |
| 已配置的上下文文件             | `stale` | 模型上下文可能变化，应显式重载。                                                                 |
| 扩展目录添加/移除              | `stale` | 已安装扩展拓扑发生变化。                                                                         |
| 顶层扩展配置文件               | `stale` | 启用、偏好或 marketplaces 在 UI 变更路径之外被改变。                                             |
| 未知文件                       | 忽略    | 避免为构建产物或无关数据刷新。                                                                   |

用户安装的扩展和链接扩展源根使用同一个分类器。对于链接根，watcher 先找
到拥有的链接扩展，然后把路径相对该源根分类。

### 2. 监视用户和链接扩展根

`ExtensionFileWatcher.startWatching()` 从以下来源构建监视根：

1. `Storage.getUserExtensionsDir()`，当它存在时；
2. 安装元数据中活跃的链接扩展源路径；
3. 用户扩展目录的父目录，仅当扩展目录尚不存在时。

父目录引导 watcher 覆盖首次安装扩展或启动后手动创建扩展目录的情况。当目
录出现时，watcher 把扩展状态标记为 stale，并在一个 microtask 中调度
`restartWatching()`。调度重启避免了在 chokidar 仍在分发事件时关闭引导
watcher。

Watcher 选项：

```ts
watchFs(roots, {
  ignoreInitial: true,
  followSymlinks: false,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 50,
  },
  ignored: (filePath) => this.isIgnored(filePath),
});
```

`followSymlinks: false` 防止扩展导致 Qwen 通过符号链接监视任意外部路
径。忽略过滤器跳过 `node_modules`、`.git`、常见编辑器备份文件、交换文
件、临时文件和 `.DS_Store`。

### 3. 通过 ExtensionRefreshState 共享重载状态

`ExtensionRefreshState` 是 watcher、斜杠命令处理器和 `/reload-plugins`
共享的小的事件/状态原语。

关键方法：

```ts
markExtensionsChanged(reason?: string): boolean;
markExtensionContentChanged(reason?: string): boolean;
clearExtensionsChanged(): void;
notifyExtensionsReloadStarted(): void;
needsExtensionRefresh(): boolean;
beginSuppression(onSettle?: () => void): () => void;
suppressNotifications<T>(fn: () => T, onSettle?: () => void): T;
```

事件：

| 事件                      | 生产者                                  | 消费者                      | 含义                                                                 |
| ------------------------- | --------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `ExtensionContentChanged` | `ExtensionFileWatcher`                  | `useSlashCommandProcessor`  | 内容级文件变化；调度自动刷新。                                       |
| `ExtensionRefreshNeeded`  | `ExtensionFileWatcher`                  | `useSlashCommandProcessor`  | 包级状态变化；告知用户运行 `/reload-plugins`。                       |
| `ExtensionsReloadStarted` | `/reload-plugins`                       | `useSlashCommandProcessor`  | 在手动重载前取消 pending 的内容刷新计时器。                          |
| `ExtensionsReloaded`      | `/reload-plugins`、watcher 重启路径     | watcher 和斜杠处理器        | 清除 stale 标志并重启/取消 pending 工作。                            |

`markExtensionsChanged()` 对 stale 通知去重，直到状态被清除。内容变更通
知不由该状态对象去重，因为斜杠命令处理器拥有防抖和串行化。

### 4. 在编程式变更期间抑制 watcher 噪音

`ExtensionManager` 暴露：

```ts
interface ExtensionMutationEvent {
  id: number;
  phase: 'start' | 'end';
  operation: string;
}

addMutationListener(listener: ExtensionMutationListener): () => void;
```

运行时相关的变更方法调用 `beginMutation()`，并总是在 `finally` 中发出匹
配的 end 事件。

发出变更事件的方法：

- `enableExtension()`
- `disableExtension()`
- `installExtension()`
- `uninstallExtension()`
- `updateExtension()`
- `addSource()`
- `removeSource()`
- `setExtensionScope()`
- `setMcpServerDisabled()`

不发出变更事件的方法：

- `toggleFavorite()`
- `markSourceUpdated()`

Watcher 在一个 `Map` 中保存 `mutation id -> end suppression callback`。
这很重要，因为 install 可以在内部触发 enable，且不同变更可能重叠。按 id
配对避免依赖栈顺序。

当最外层抑制深度归零时，watcher 重启。这会在变更落定后刷新链接源根、上
下文文件名和活跃扩展元数据。

### 5. 从 Core 刷新运行时状态

`refreshExtensionRuntime()` 是扩展 UI 变更使用的 Core 侧运行时刷新入口
点。

它按以下顺序刷新：

1. `config.reinitializeMcpServers(config.getSettingsMcpServers())`
2. `config.getSkillManager()?.refreshCache()`
3. `config.getSubagentManager().refreshCache()`
4. `config.getHookSystem()?.reload()`
5. `config.refreshHierarchicalMemory()`

MCP 重初始化先运行，因为 skill 和子代理的工具描述可能依赖更新后的 MCP
工具列表。

Skills、子代理和 hooks 通过 `Promise.allSettled()` 运行，这样一个被拒绝
的分支不会阻止其他分支应用。Hook 重载失败被存储，并在分层内存有机会刷
新之后重新抛出。这使 hook 失败保持可见，同时仍应用尽力而为的缓存刷新。

失败契约：

- MCP 失败立即传播，后续运行时分支不运行。
- Hook 重载失败在并行刷新分支和内存刷新落定后传播。
- Skill 刷新失败被记录且尽力而为。
- 子代理刷新失败被记录且尽力而为。
- 分层内存刷新失败被记录且尽力而为。

### 6. 用 /reload-plugins 重载包级变更

`reloadPluginsRuntime()` 是斜杠命令使用的 CLI 侧运行时重载助手：

```ts
async function reloadPluginsRuntime(options: {
  config: Config;
  reloadCommands?: () => void | Promise<void>;
}): Promise<ReloadPluginsSummary>;
```

流程：

1. `config.getExtensionManager().refreshCache()`
2. `config.getExtensionManager().refreshTools()`
3. `reloadCommands()`
4. 汇总活跃扩展能力

摘要统计活跃扩展声明的数量：

- 扩展；
- commands；
- skills；
- agents；
- hooks；
- 扩展 MCP 服务器；
- 扩展 LSP 服务器。

`/reload-plugins` 拥有面向用户的命令行为：

1. 要求 `config`；
2. 发出 `ExtensionsReloadStarted`；
3. 调用 `reloadPluginsRuntime()`；
4. 成功或失败时都调用 `clearExtensionsChanged()`；
5. 返回本地化的 info 摘要或错误消息。

失败时清除 stale 状态是有意为之。如果失败的重载让
`extensionRefreshNeeded = true` 残留，未来的文件 watcher 通知会被去重掉，
内容自动刷新也会持续自我绕过。

### 7. 自动刷新内容级变更

`refreshExtensionContentRuntime()` 用于仅内容的文件系统变更。

流程：

1. 刷新扩展缓存；
2. 刷新 skill 缓存；
3. 刷新子代理缓存；
4. 重载斜杠命令；
5. 聚合错误，如果任何分支失败则抛出单条消息。

斜杠命令处理器监听 `ExtensionContentChanged` 并以 250 ms 防抖刷新。它用
以下引用串行化刷新：

```ts
extensionContentRefreshRunningRef;
extensionContentRefreshPendingRef;
```

如果内容事件在刷新运行时到达，处理器把另一轮标记为 pending，并在当前轮
完成后运行那一轮。一个小的上限防止嘈杂的编辑器或构建进程让同一个刷新任
务无限期存活。

如果 `ExtensionRefreshState.needsExtensionRefresh()` 为 true，内容自动
刷新提前退出。必须先运行包级重载，使命令、skill、agent、hook、MCP、LSP
和上下文状态从一个扩展缓存快照重建。

### 8. 重载 hooks 而不丢弃 agent 作用域的 hooks

`HookRegistry.reloadConfiguredHooks()` 只替换已配置的 hook 条目。它保留
`agentScope !== undefined` 的条目，因为那些是为子代理执行注册的临时
hooks。

流程：

1. 保存 `previousEntries`；
2. 保留 `agentEntries`；
3. 把 registry 条目设为 `agentEntries`；
4. 运行 `processHooksFromConfig()`；
5. 失败时恢复 `previousEntries` 并重新抛出。

`HookSystem.reload()` 是一个窄门面，委托给
`hookRegistry.reloadConfiguredHooks()`。因此运行时重载不需要重建整个
hook 系统。

该重载路径不会从磁盘重新读取用户或项目设置文件。
`processHooksFromConfig()` 为 user/project hooks 重新处理当前 `Config`
值以及刷新后的扩展配置值。设置文件重载仍由设置重载路径拥有；
`/reload-plugins` 的范围限于扩展运行时状态。

### 9. 把状态接入交互式 UI

交互式启动创建一个共享的 `ExtensionRefreshState`：

```ts
const extensionRefreshState = new ExtensionRefreshState();
const extensionFileWatcher = isBareMode(argv.bare)
  ? undefined
  : new ExtensionFileWatcher(config, undefined, extensionRefreshState);
```

该状态经过：

```text
gemini.tsx
  -> startInteractiveUI(...)
    -> AppContainer
      -> useSlashCommandProcessor
      -> CommandContext.services.extensionRefreshState
```

`AppContainer` 只在未提供时才创建一个回退的 `ExtensionRefreshState`。
这让测试和替代 UI 入口保持简单，而主交互路径在 watcher 和斜杠命令处理之
间共享状态。

清理时注销重载监听器并停止 watcher。

## 事件流

### 内容文件编辑

```text
edit extension commands/skills/agents file
  -> ExtensionFileWatcher classifies as auto
  -> ExtensionRefreshState.markExtensionContentChanged()
  -> useSlashCommandProcessor schedules debounced refresh
  -> refreshExtensionContentRuntime()
      -> ExtensionManager.refreshCache()
      -> SkillManager.refreshCache()
      -> SubagentManager.refreshCache()
      -> reloadCommands()
```

### 包级文件编辑

```text
edit qwen-extension.json/hooks/context/install metadata/topology
  -> ExtensionFileWatcher classifies as stale
  -> ExtensionRefreshState.markExtensionsChanged()
  -> useSlashCommandProcessor prints:
       "Extensions changed on disk. Run /reload-plugins to apply updates."
  -> user runs /reload-plugins
  -> reloadPluginsRuntime()
      -> ExtensionManager.refreshCache()
      -> ExtensionManager.refreshTools()
      -> reloadCommands()
```

### UI 变更

```text
user enables/disables/installs/uninstalls/updates extension
  -> ExtensionManager emits mutation start
  -> ExtensionRefreshState begins suppression
  -> ExtensionManager writes disk/runtime state
  -> ExtensionManager.refreshTools()
      -> refreshExtensionRuntime()
  -> ExtensionManager emits mutation end
  -> suppression settles
  -> ExtensionFileWatcher restarts with fresh roots/context files
```

## 并发与顺序

- Watcher 重启有 generation 保护。`watchGeneration` 变化后，来自旧
  watcher 实例的事件被忽略。
- 变更抑制按 mutation id 配对，而不是栈顺序。
- `stopWatching()` 在丢弃 watcher 引用之前结束所有 pending 抑制，因此
  当 watcher 在变更进行中被停止时，抑制深度不会泄漏。
- 内容自动刷新在斜杠命令处理器中串行化。并发事件合并为最多一个 pending
  重跑。
- `/reload-plugins` 发出 `ExtensionsReloadStarted` 和
  `ExtensionsReloaded`，使 pending 内容刷新计时器在手动重载前后被取
  消。
- 包级 stale 状态优先于内容自动刷新。如果需要 stale 重载，内容自动刷新
  退出并等待 `/reload-plugins`。

## 失败语义

| 路径                                                  | 行为                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 变更或 `/reload-plugins` 中的 MCP 重初始化            | 传播。成功消息会有误导性，因为扩展 MCP 工具可能不可用。                                                                                    |
| 变更或 `/reload-plugins` 中的 hook 重载               | 在其他并行刷新分支落定后传播。成功摘要会有误导性，因为已配置的 hooks 可能未注册。                                                          |
| 变更期间的 skill 缓存刷新                             | 记录且尽力而为。                                                                                                                           |
| 变更期间的子代理缓存刷新                              | 记录且尽力而为。                                                                                                                           |
| 变更期间的分层内存刷新                                | 记录且尽力而为。它不应回滚已写入的扩展状态。                                                                                               |
| 内容自动刷新失败                                      | 聚合并显示在 UI 中，附 `/reload-plugins` 回退。                                                                                            |
| `/reload-plugins` 失败                                | 返回错误消息并清除 stale 状态，使未来的 watcher 通知可以再次触发。                                                                         |
| Hook registry 重载失败                                | 恢复先前的 hook 条目并重新抛出。                                                                                                           |
| Watcher 错误                                          | 通过 debug logger 记录；会话继续。                                                                                                         |

## 测试

### Core 测试

`packages/core/src/extension/extension-runtime-refresh.test.ts`

- 没有 config 时提前返回；
- 在 skills/子代理/hooks/内存之前刷新 MCP；
- 传播 MCP 调和失败；
- 保持 skill 刷新失败为尽力而为；
- 在其他刷新分支落定后传播 hook 重载失败；
- 保持分层内存失败为尽力而为。

`packages/core/src/extension/extensionManager.test.ts`

- 在 disable 前后发出变更 start/end；
- disable 失败时发出变更 end；
- 在 install 前后发出变更 start/end，包括嵌套的 enable 事件；
- 在 uninstall 前后发出变更 start/end；
- 在更新临时目录失败前后发出变更 start/end；
- 收藏变更或来源时间戳更新不发出变更事件；
- 保留既有的扩展加载、命令发现、hook 加载和 refreshTools 覆盖。

`packages/core/src/hooks/hookRegistry.test.ts`

- 重载已配置的 hooks；
- 重载期间保留 agent 作用域的 hooks；
- 已配置 hook 重载失败时恢复先前条目。

`packages/core/src/hooks/hookSystem.test.ts`

- 把重载委托给 hook registry。

### CLI 测试

`packages/cli/src/config/extension-refresh-state.test.ts`

- stale 刷新事件只发出一次直到被清除；
- 发出内容刷新事件；
- 在变更抑制期间抑制通知；
- 正确清除 stale 状态和抑制窗口。

`packages/cli/src/config/extension-file-watcher.test.ts`

- 把 commands、skills 和 agents 分类为自动刷新；
- 把 manifest、安装元数据、hooks、上下文文件和扩展拓扑变化分类为
  stale；
- 忽略未知文件和被忽略的目录；
- 监视链接扩展源；
- 在编程式变更期间抑制通知；
- 在变更落定后重启监视；
- 处理扩展目录的延迟创建。

`packages/cli/src/config/extension-runtime-reload.test.ts`

- 为 `/reload-plugins` 重载扩展缓存、运行时工具和斜杠命令；
- 汇总活跃扩展能力；
- 刷新内容运行时组件；
- 聚合内容自动刷新失败。

`packages/cli/src/ui/commands/reload-plugins-command.test.ts`

- 把命令注册为仅交互式行为；
- config 缺失时返回错误；
- 成功时重载运行时并清除 stale 状态；
- 失败时清除 stale 状态并返回错误。

`packages/cli/src/services/BuiltinCommandLoader.test.ts`

- 内建命令加载中包含 `/reload-plugins`。

### 手动验证

手动验证应覆盖：

1. 从 UI 启用一个扩展，确认 commands、skills、agents、MCP、hooks 和上下
   文无需重启即被刷新。
2. 禁用同一个扩展，确认运行时能力被移除或不再提供。
3. 编辑 `commands/` 下的命令文件，确认斜杠命令补全自动更新。
4. 编辑 `skills/` 下的 skill 文件，确认 skill 支撑的斜杠命令补全自动更
   新。
5. 编辑 `agents/` 下的 agent 文件，确认 agent 缓存行为反映变更。
6. 编辑 `hooks/hooks.json`、`qwen-extension.json`、安装元数据、上下文文
   件或扩展目录拓扑，确认 UI 要求运行 `/reload-plugins`。
7. 运行 `/reload-plugins`，确认摘要报告扩展、commands、skills、agents、
   hooks、扩展 MCP 服务器和扩展 LSP 服务器。
8. 强制一次重载失败，确认 UI 报告错误，然后之后的文件系统变化仍能触发另
   一次通知。

## 权衡

- Hooks 被视为包级 stale 变更，尽管存在已配置 hook 重载 API。这避免从后
  台文件系统事件静默改变 hook 执行行为。
- MCP 刷新保持完整的运行时重初始化。逐扩展的增量 MCP 重启会降低成本，但
  会把本 PR 扩展到 MCP 所有权和调和逻辑。
- Watcher 把未知文件分类为忽略而不是 stale。这减少了构建产物的噪音，但意
  味着扩展作者必须把运行时能力文件放在支持的约定目录中。
- 链接扩展根被直接监视。这改善了创作体验，但对有很多链接扩展的用户会增
  加 watcher 数量。

## 未来工作

- 添加逐扩展的增量 MCP 调和。
- 为致命的 watcher 错误（如 `ENOSPC` 或 `EMFILE`）添加用户可见的诊断。
- 如果调用方需要部分成功摘要，考虑为 `refreshExtensionRuntime()` 提供类
  型化的重载结果。
- 如果链接扩展变得普遍，用预计算的根映射优化链接扩展源查找。
- 只有当 hook 重载能做到显式、可观察且足够安全以适合后台应用时，才重新
  考虑 hook 内容自动刷新。
