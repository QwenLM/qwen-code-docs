# 配置文件变更检测（Issue #3696 子任务 1）

## 背景

Qwen Code 目前没有配置文件变更检测机制。用户修改 `settings.json` 后必须重启会话才能使变更生效。本提案实现 #3696 热重载系统的基础设施层——自动检测配置文件变更并分发事件。

**范围**：本子任务仅负责"检测文件变更 → 重新加载 → 通知监听器"。`Config` 在构造时会复制很多配置字段（`approvalMode`、`mcpServers`、`telemetry` 等），这些快照**不会**被本子任务自动更新。只有实时读取 `LoadedSettings.merged` 的消费方（如 `useSettings()` hook、`disabledSkillNamesProvider`）才会立即看到变更。其他子任务（MCP 重连、`/reload` 命令）负责将更新推送到 Config 的内部状态。

## 架构决策

### 模块位置：`packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` 和配置文件路径均位于 `packages/cli`
- `reloadScopeFromDisk()` 是 `LoadedSettings` 上的方法
- core 包只接收一个最小化生命周期接口 `{ stopWatching(): void }`，不导入 `SettingScope` 等 CLI 类型
- 变更事件分发和下游刷新逻辑完全在 CLI 层连接

### 监听策略：监听父目录 + 严格路径过滤

`writeWithBackupSync` 写入流程为 `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`，会导致目标文件短暂消失。直接监听文件路径会导致 chokidar 丢失监听。因此改为监听父目录（`depth: 0`）并按**精确 basename 匹配**过滤，只响应 `settings.json` 文件事件，忽略 `.tmp`、`.orig`、编辑器临时文件等。`.orig` 备份是写入过程中的安全网，**成功后会被删除**（最后的 `unlink` 步骤），因此不会遗留在用户目录中。

### 懒加载目录处理：启动时绝不创建 `.qwen/`

> **启动时的文件系统副作用（故意避免）。** 监听器绝对**不能**仅为了能够监听而创建 `<project>/.qwen/`（或 `~/.qwen/`）。早期版本对任何缺失的配置目录调用了 `mkdirSync({ recursive: true })`，这意味着普通的非裸启动会静默创建 `<project>/.qwen/`，即使该项目从未有过 Qwen 配置——这会污染工作区和 git 状态。目录创建仅由配置的**持久化**（`saveSettings()` 在用户实际写入配置时自行调用 `mkdirSync`）负责。

为了在不创建目录、不递归项目树的情况下，仍能检测到会话期间后续添加的 `settings.json`，监听器对每个 scope 采用基于**目录**存在性的两阶段策略：

- **启动时 `.qwen` 已存在** → 直接监听（`watchTargetDir`，即上述策略）。
- **`.qwen` 不存在** → **引导监听父目录**（`watchParentForDir`）：`chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })`，其中 `ignored` 谓词 `(p) => p !== parentDir && basename(p) !== '.qwen'` **只允许** `.qwen` 条目通过，屏蔽所有无关的顶层变动，且不会递归。一旦 `.qwen` 出现，监听器**晋升**：关闭引导监听器，在 `.qwen` 上启动目标监听器，然后调度一次刷新以捡起可能已存在于 `.qwen` 内的 `settings.json`。

健壮性细节：

- **TOCTOU 保护**：在挂载引导监听器（使用 `ignoreInitial`）后，重新检查 `existsSync(dir)`；如果 `.qwen` 在此期间被创建，立即晋升。
- **降级处理**：如果 `.qwen` 本身被删除（`unlinkDir`），目标监听器降级回父目录引导监听器，以便后续重新创建时仍能被捕获。
- **代次保护**：chokidar 的 `close()` 是异步的，正在关闭的监听器残留的 `'all'` 回调可能重新触发晋升并堆叠监听器。每个 scope 维护一个单调递增的代次令牌（在每次晋升/降级以及 `stopWatching` 时递增），使过期回调变为空操作，确保每个 scope 最多只有一个活跃监听器。

### 变更检测：语义差异作为主要去重机制

每次监听器触发时，先对**重新加载前的当前内存状态**进行快照（`JSON.stringify(file.settings)`），然后调用 `reloadScopeFromDisk()` 重新加载，最后比较前后快照。只有当语义内容实际发生变化时才通知监听器。

关键：比较的是**重新加载前后**的内存状态，而非存储的历史快照。这是因为 `setValue()` 会在写入磁盘前同步更新内存中的 `file.settings`，所以当监听器触发重新加载时，内存状态已包含自写入的值——重新加载产生相同内容 → 无差异 → 不通知。

这自然抑制了：

- 自写入产生的重复事件（`setValue()` 已更新内存，重新加载产生相同内容 → 无差异 → 不通知）
- 仅格式/注释变更（已解析的配置不包含注释）
- 编辑器保存但内容未修改
- chokidar 重复事件

已知限制：`JSON.stringify` 对 key 顺序敏感。如果用户手动在 settings.json 中重新排列 key 但不修改值，会触发一次无害的额外通知。这是可以接受的，无需引入深度比较依赖。

## 实现

### 1. 新增 `SettingsWatcher` 类

**文件**：`packages/cli/src/config/settingsWatcher.ts`

```typescript
export interface SettingsChangeEvent {
  scope: SettingScope;
  path: string;
  changeType: 'modified' | 'created' | 'deleted';
}

export type SettingsChangeListener = (
  events: SettingsChangeEvent[],
) => void | Promise<void>;

export class SettingsWatcher {
  private readonly settings: LoadedSettings;
  private readonly watchers: Map<SettingScope, FSWatcher> = new Map();
  // 'bootstrap' = watching parent for `.qwen`; 'target' = watching `.qwen`
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // Monotonic token per scope; bumped on promote/demote to void stale callbacks
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // serialization guard
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**核心方法**：

#### `startWatching()`

- 遍历 User 和 Workspace 两个 scope
- 根据**目录**存在性分支：若 `.qwen` 存在则直接监听，否则引导监听父目录（参见[懒加载目录处理](#懒加载目录处理启动时绝不创建-qwen)）
- **绝不**创建目录——不调用 `mkdirSync`
- 全程使用 `ignoreInitial: true`、`depth: 0`
- 裸模式下不调用

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // Never create the directory; settings persistence (saveSettings) owns that.
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` 是上文描述的父目录 + 严格 basename 监听器（若 `.qwen` 本身被删除，也会降级回引导监听器）。`watchParentForDir` 挂载仅限 `.qwen` 的引导监听器，并在 `.qwen` 出现时晋升：

```typescript
private watchParentForDir(scope: SettingScope, settingsPath: string): void {
  const dir = path.dirname(settingsPath);
  const parentDir = path.dirname(dir);
  const dirBasename = path.basename(dir); // ".qwen"
  const gen = this.bumpGeneration(scope);

  const watcher = watchFs(parentDir, {
    ignoreInitial: true,
    depth: 0,
    ignored: (filePath: string) =>
      filePath !== parentDir && path.basename(filePath) !== dirBasename,
  })
    .on('all', (_event: string, changedPath: string) => {
      if (this.watchGeneration.get(scope) !== gen) return; // stale callback
      if (path.basename(changedPath) !== dirBasename) return;
      void this.promoteScope(scope, settingsPath);
    })
    .on('error', (error: unknown) => {
      debugLogger.warn(`Settings bootstrap watcher error for ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // TOCTOU guard: `.qwen` may have appeared between the existence check and here.
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // guard double-promote
  await this.replaceWatcher(scope); // bumps generation + awaits async close()
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // pick up a settings.json already inside .qwen
}
```

#### `stopWatching()` — 幂等关闭

```typescript
stopWatching(): void {
  if (!this.started) return;
  this.started = false;
  for (const [, watcher] of this.watchers) {
    watcher.close().catch((err) => debugLogger.warn('Watcher close error:', err));
  }
  this.watchers.clear();
  if (this.refreshTimer) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  this.pendingScopeChanges.clear();
}
```

#### `scheduleRefresh(scope)` — 300ms 防抖 + scope 累积

```typescript
private scheduleRefresh(scope: SettingScope): void {
  this.pendingScopeChanges.add(scope);
  if (this.refreshTimer) clearTimeout(this.refreshTimer);
  this.refreshTimer = setTimeout(() => {
    this.refreshTimer = null;
    void this.drainPendingChanges();
  }, SettingsWatcher.DEBOUNCE_MS);
}
```

#### `drainPendingChanges()` — 串行处理防止重入

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // previous round still running; it will drain on exit
  this.processing = true;
  try {
    while (this.pendingScopeChanges.size > 0) {
      const scopes = new Set(this.pendingScopeChanges);
      this.pendingScopeChanges.clear();
      await this.handleChange(scopes);
    }
  } finally {
    this.processing = false;
  }
}
```

#### `handleChange(scopes)` — 重新加载 + 语义差异 + 通知

```typescript
private async handleChange(changedScopes: Set<SettingScope>): Promise<void> {
  const events: SettingsChangeEvent[] = [];

  for (const scope of changedScopes) {
    const file = this.settings.forScope(scope);

    // Snapshot the current in-memory state before reload (includes setValue() mutations)
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk has internal try/catch; on parse failure it preserves old state
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // Semantic diff: only notify when content actually changed
    // Self-write suppression: setValue() already updated memory → reload matches → no notification
    if (afterSettings === beforeSettings) continue;

    events.push({
      scope,
      path: file.path,
      changeType: !existedBefore && existsNow ? 'created'
                : existedBefore && !existsNow ? 'deleted'
                : 'modified',
    });
  }

  if (events.length > 0) {
    await this.notifyListeners(events);
  }
}
```

#### `notifyListeners(events)` — `Promise.allSettled()` + 30s 超时

复用 SkillManager 监听器通知模式（`packages/core/src/skills/skill-manager.ts:188-236`）：每个监听器包装在 30s 超时竞争中，通过 `Promise.allSettled` 并行执行，失败不向上传播。

#### `addChangeListener(listener)` — 返回取消订阅函数

### 2. 对 `LoadedSettings` 的修改

**文件**：`packages/cli/src/config/settings.ts`

**无需修改**。语义差异机制完全自包含于监听器内。`setValue()` 同步更新内存 → `saveSettings()` 写入磁盘 → 监听器触发 → `reloadScopeFromDisk()` 重新加载 → 差异比较发现内容相同 → 不通知。链路自然闭合。

### 3. Config 集成（最小接口）

**文件**：`packages/core/src/config/config.ts`

添加到 `ConfigParameters`：

```typescript
/** Lifecycle handle for an external file watcher. Stopped during shutdown. */
settingsWatcher?: { stopWatching(): void };
```

在 `Config.shutdown()` 中，在 `initialized` 检查**之前**停止监听器：

```typescript
async shutdown(): Promise<void> {
  try {
    // Stop the external watcher regardless of initialization state
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... remaining cleanup logic ...
  }
}
```

**不向 Config 添加 settingsChangeListeners**。变更事件分发完全在 CLI 层处理，监听器直接调用 core 的刷新方法（如 `skillManager.refreshCache()`、`toolRegistry.restartMcpServers()`）。这使 core 对配置变更语义保持无感知。

### 4. 启动连接

**文件**：`packages/cli/src/gemini.tsx`

在 `loadSettings()` 和 `loadCliConfig()` 之后：

```typescript
// Create watcher (skip in bare mode)
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// Pass watcher lifecycle handle when loading CLI config
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// Register change listener (future sub-tasks will add actual refresh logic here)
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Settings changed:', events.map(e => `${e.scope}:${e.changeType}`));
  // Sub-tasks 2-6 will add:
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - needsRefresh flag
});
```

**`loadCliConfig` 签名变更**（`packages/cli/src/config/config.ts`）：添加可选参数，将 `settingsWatcher` 传递给 `ConfigParameters`。

## 边界情况处理

| 场景 | 处理方式 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `.qwen` 目录不存在 | **绝不创建。** 引导监听父目录（`depth: 0`，仅限 `.qwen` 过滤器），`.qwen` 出现后晋升 |
| 启动后才创建 `.qwen` | 引导监听器捕获 `addDir`，晋升为目标监听器并调度一次刷新 |
| 晋升后 `.qwen` 被删除 | 目标监听器捕获 `unlinkDir` → 降级回父目录引导监听器 |
| 文件被删除 | `reloadScopeFromDisk` 检测到 `!existsSync`，重置为 `{}`，差异触发 `deleted` 事件 |
| 启动后才创建文件（目录已存在） | 目录监听器捕获 `add` 事件，`reloadScopeFromDisk` 读取新文件 |
| 晋升/降级期间的过期回调 | 每个 scope 的代次令牌使正在关闭的监听器的飞行中回调变为空操作（不堆叠监听器） |
| 编辑器原子写入 | 目录监听 + 严格 basename 过滤（排除 `.tmp`/`.orig`）+ 300ms 防抖合并 |
| `.tmp`/`.orig` 文件事件 | basename 过滤器精确匹配 `settings.json`，其他文件名全部忽略 |
| 自写入（`setValue` → `saveSettings`） | 语义差异：重新加载内容与内存快照匹配 → 不通知 |
| 自写入与外部编辑并发 | 外部编辑改变内容 → 差异检测到变化 → 正确通知 |
| 仅格式/注释变更 | `reloadScopeFromDisk` 解析配置时不含注释 → 差异匹配 → 不通知 |
| chokidar 重复事件 | 防抖合并 + 语义差异双重保护 |
| `QWEN_HOME` 重定向 | `getUserSettingsPath()` 已解析路径；监听器使用已解析的路径 |
| 裸模式 | `startWatching()` 从不被调用，零开销 |
| 监听器创建失败 | 异常被捕获，记录警告，该 scope 无实时检测但功能不受影响 |
| `reloadScopeFromDisk` 解析失败 | 内部 try/catch（`settings.ts:501`）保留旧状态 → before/after 差异匹配 → 不通知 |
| key 顺序变化（值未变） | `JSON.stringify` 对 key 顺序敏感；可能产生一次无害的额外通知 |
| Config 初始化失败 | `shutdown()` 在 `initialized` 检查前停止监听器，防止泄漏 |
| 重入（监听器仍在运行） | `processing` 标志 + `drainPendingChanges` 循环串行化处理 |
| 无效 JSON | `reloadScopeFromDisk` 内部 try/catch 保留旧状态 |

## 性能分析

- 每个 scope 最多 1 个监听器（总计 ≤ 2 个），每个均为 `depth: 0`——文件描述符开销极小；晋升/降级交换监听器，不堆叠
- `depth: 0` 意味着**不递归遍历**项目树，即使是大型 monorepo 中的父目录引导监听器也不例外。代价仅限于父目录直接子项：无关的顶层变动会唤醒 chokidar 做一次 `readdir` + `ignored` 过滤（`O(顶层条目数)`），事件即被抑制——绝不递归扫描
- 300ms 防抖确保编辑器快速保存不触发多次重新加载
- `reloadScopeFromDisk` 使用同步 `readFileSync`，每次调用 < 1ms
- `JSON.stringify` 比较为 O(n)，但配置对象通常 < 10KB；无需额外快照存储
- 监听器通知通过 `Promise.allSettled` 并行运行
- 无轮询——纯事件驱动

## 需创建/修改的文件

**新增文件**：

- `packages/cli/src/config/settingsWatcher.ts` — 监听器类
- `packages/cli/src/config/settingsWatcher.test.ts` — 单元测试

**修改文件**：

- `packages/core/src/config/config.ts` — 向 `ConfigParameters` 添加 `settingsWatcher` 字段，在 `Config.shutdown()` 的 `initialized` 检查前调用 `stopWatching()`
- `packages/cli/src/config/config.ts`（`loadCliConfig`）— 添加可选参数以传递 `settingsWatcher`
- `packages/cli/src/gemini.tsx` — 实例化监听器并连接

**无需修改**：`packages/cli/src/config/settings.ts`（语义差异是自包含的，不需要 `LoadedSettings` 的配合）

## 测试计划

### 单元测试（`settingsWatcher.test.ts`）

Mock chokidar（复用 `skill-manager.test.ts` 的 mock 模式）：

1. **生命周期**：`startWatching` 创建监听器，`stopWatching` 关闭监听器，两者均幂等
2. **路径过滤**：只有 `settings.json` basename 事件触发刷新；`.tmp`/`.orig`/其他文件被忽略
3. **防抖**：多个快速事件合并为一次重新加载（`vi.useFakeTimers()`）
4. **语义差异**：内容未变 → 监听器不被调用；内容变化 → 监听器被调用并携带正确事件
5. **自写入抑制**：`setValue()` 触发的监听器事件被相同差异自然过滤
6. **串行化**：`handleChange` 执行期间的新事件被累积，处理完成后排空
7. **错误隔离**：chokidar 错误不崩溃；监听器异常不影响其他监听器；`reloadScopeFromDisk` 失败被捕获
8. **监听器超时**：30s 超时保护
9. **懒加载目录监听**：`.qwen` 缺失时，`mkdirSync` 从不被调用；在父目录挂载引导监听器，其 `ignored` 谓词只允许 `.qwen` 条目通过
10. **晋升 / TOCTOU**：`.qwen` 出现（通过 `addDir` 或挂载后的重新检查）关闭引导监听器并在 `.qwen` 上打开目标监听器 + 调度刷新
11. **降级 / 重建**：删除 `.qwen`（`unlinkDir`）重新引导监听父目录；后续重建再次晋升
12. **代次保护**：已关闭的引导监听器的过期回调不会创建第二个目标监听器

### 回归验证

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### 手动验证

在会话运行期间编辑 `~/.qwen/settings.json`，观察调试日志中的变更事件输出。

---

## 后续子任务：对需要重启和敏感配置的事件进行抑制

> **状态：抑制门已实现；两个 schema 翻转仍待研究。** 上述子任务 1 对任何语义变更都会为每个 scope 发出一个 `SettingsChangeEvent`。本后续任务添加一个过滤器，使**仅涉及无法真正在不重启的情况下生效的配置——或敏感配置（凭据）**的变更**不通知**监听器。
>
> - **已完成：** `SettingsWatcher.handleChange()` 中基于 `requiresRestart` 的抑制门及单元测试（参见下方机制）。
> - **待完成：** 两个 `requiresRestart` schema 修正（`modelProviders` → `true`，`permissions.*` → 保持热重载），每项均需先验证运行时读取路径。

### 动机

部分配置在进程启动时只读取一次（`Config.initialize()`、content-generator/client 构造、子进程 spawn、Node 运行时标志）。用户明确指出的例子：**API token、`env` 和 model providers**。为这些配置发出热重载事件会产生误导——监听器会"刷新"，但新值直到用户重启 `qwen-code` 才会真正生效。敏感值（凭据）还不应在运行中的会话中被重新传递。

### 决策：复用 schema 的 `requiresRestart` 标志（单一事实来源）

`settingsSchema.ts` 已为**每个** key 声明了 `requiresRestart: boolean`，`packages/cli/src/utils/settingsUtils.ts` 已暴露以下查找方法：

- `requiresRestart(key: string): boolean` — 点路径 key 的标志
- `getFlattenedSchema()` — 完整的扁平化 `key → definition` 映射
- `getRestartRequiredSettings()` — 所有 `requiresRestart: true` 的 key

我们将**复用此标志作为抑制信号**，而非维护一个独立的手工维护拒绝列表（那样必然会与 schema 产生偏差）。`requiresRestart: true` 已经精确表示"不重启则不生效"，这正是应该抑制事件的条件。

### 机制（在 `SettingsWatcher.handleChange()` 中实现）

旧的门控做整文件 `JSON.stringify` 差异，无法识别哪些 key 发生了变化。改为叶级差异 + 逐 key 分类：

1. **`collectChangedKeys(before, after)`** 在重新加载前快照内存状态（`structuredClone`），然后遍历 before/after，收集每个值不同的叶节点的点路径。普通对象递归处理；数组和基本类型整体比较（与 schema 中的数组 key 如 `permissions.allow` 匹配）。添加/删除的 key 作为变化的叶节点浮现，因此文件创建/删除无需单独的存在性检查。
2. **`isRestartRequiredKey(path)`** 使用**最长匹配路径的 schema key 作为前缀（或等于该路径）**将每个变化路径解析到 schema。自由形式对象配置（`env`、`modelProviders`）是叶级 schema key，因此 `env.FOO` 解析到 `env` 定义。未知 key 默认为**非**需要重启，确保无法分类的变更不会被静默抑制。
3. scope 仅在**至少一个变化的 key 可热重载**时通知（`!isRestartRequiredKey`）。若所有变化的 key 均需重启，该 scope 不产生事件。

`SettingsChangeEvent` 的形状不变（仍为 `{ scope, path, changeType }`）；在事件上携带存活的变化 key 留作后续可能的增强。自写入抑制（空差异 → 无事件）、防抖、串行化和监听器超时行为均不变。

### 需研究和应用的两处 schema 调整

这两个 `requiresRestart` 值必须修正，复用方式才能按预期工作。**每项均需在翻转标志前验证实际运行时读取路径。**

1. **`modelProviders`：`false` → `true`**（`settingsSchema.ts:294`）
   - 目前标记为 `requiresRestart: false`，因此在复用方式下**不会**被抑制——与 provider 变更不热重载的要求矛盾。
   - Provider 配置（包括每个 provider 的 `apiKey` / `baseUrl`）在启动时构建 model client / content generator 时被消费。
   - **研究项**：确认没有 `modelProviders` 的运行时重读（搜索 content-generator / client 构造）。预期结果：`false` 是潜在 bug；翻转为 `true`。

2. **`permissions.*`：保持热重载**（`settingsSchema.ts:1560`，整个子树目前为 `requiresRestart: true`）
   - 权限规则（`deny > ask > allow`）在每次工具调用时求值，是用户最希望立即生效的配置。
   - 整个 `permissions` 子树 `showInDialog: false`，因此其 `requiresRestart` 标志当前**没有 UI 意义**——强烈暗示 `true` 是默认值而非刻意的"需要重启"决定，翻转的影响范围较小。
   - **研究项**：确认运行时是实时读取 permissions（如通过 `config.getXxx()` 在求值时读取）而非从启动快照读取。若确认，将 `permissions` 子树设为 `requiresRestart: false`，使其**不被**复用机制抑制。

> 注：由于 `requiresRestart` 也在配置 UI / 重启提示中展示，翻转这些标志也会改变相应行为。这是可以接受的，甚至更为正确，但应在 PR 描述中说明。

### 验收标准

- 仅涉及需要重启/敏感 key 的变更（`security.auth.*`、`env`、`modelProviders`、`mcpServers`、`proxy` 等）**不**发出 `SettingsChangeEvent`。
- 涉及可热重载 key 的变更（`ui.*`、`model.name`、翻转后的 `permissions.*` 等）仍发出事件。
- 混合变更（一个需要重启的 key + 一个可热重载的 key）仍发出事件（可热重载部分确实需要刷新）。
- 未知（非 schema）key 的变更仍发出事件，而不是被静默抑制。

测试状态：

- **已完成** — `settingsWatcher.test.ts` 中的 `restart-required suppression` 测试块覆盖了全抑制（`env`、`security.auth.apiKey`）、全放行（`ui.theme`）、混合以及未知 key 场景。
- **待完成（随 schema 翻转）** — `settingsSchema.test.ts` 中固定两个修正后 `requiresRestart` 值的断言，以及一个监听器测试断言 `permissions.*` 翻转后不再被抑制。
