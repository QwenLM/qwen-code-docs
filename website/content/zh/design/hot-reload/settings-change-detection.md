# 设置文件变化检测 (Issue #3696 Sub-task 1)

## 背景

Qwen Code 目前没有设置文件变化检测机制。用户在修改 `settings.json` 后必须重新启动会话才能使更改生效。本提案实现了 #3696 热重载系统的基础设施层——自动检测设置文件变化并分发事件。

**范围**：此子任务仅负责"检测文件变化 → 重新加载 → 通知监听器"。`Config` 在构造时会复制许多设置字段（`approvalMode`、`mcpServers`、`telemetry` 等），这些快照不会由此子任务自动更新。只有那些实时读取 `LoadedSettings.merged` 的消费者（例如 `useSettings()` hook、`disabledSkillNamesProvider`）才会立即看到变化。其他子任务（MCP 重连、`/reload` 命令）负责将更新推送到 Config 的内部状态。

## 架构决策

### 模块位置：`packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` 和设置文件路径都在 `packages/cli` 中
- `reloadScopeFromDisk()` 是 `LoadedSettings` 上的方法
- 核心包仅接收一个最小的生命周期接口 `{ stopWatching(): void }`，无需导入 CLI 类型（如 `SettingScope`）
- 变化事件分发和下游刷新逻辑完全在 CLI 层串联

### 监听策略：监听父目录 + 严格路径过滤

`writeWithBackupSync` 的写入流程是 `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)`，这会导致目标文件短暂消失。直接监听文件路径会导致 chokidar 丢失监听。因此，我们监听父目录（`depth: 0`）并通过**精确的文件名匹配**过滤，仅响应 `settings.json` 文件事件，忽略 `.tmp`、`.orig`、编辑器临时文件等。`.orig` 备份是进行中的安全网，在成功时会被**移除**（最后的 `unlink` 步骤），因此它不会停留在用户目录中。

### 惰性目录处理：启动时绝不创建 `.qwen/`

> **有意避免启动时的文件系统副作用。** 监听器**绝不能**仅仅为了能够监听就创建 `<project>/.qwen/`（或 `~/.qwen/`）。早期版本对任何缺失的设置目录调用了 `mkdirSync({ recursive: true })`，这意味着正常的非 bare 启动即使在从未有 Qwen 设置的项目中也会静默创建 `<project>/.qwen/`——污染工作区和 git 状态。目录的创建仅由设置_持久化_所有（`saveSettings()` 在用户实际写入设置时执行自己的 `mkdirSync`）。

为了在不创建目录且不递归遍历项目树的情况下，仍然能检测到会话过程中后来添加的 `settings.json`，监听器使用了一个基于**目录**存在性的两阶段、每领域（per-scope）策略：

- **启动时 `.qwen` 存在** → 直接监听它（`watchTargetDir`，即上述策略）。
- **`.qwen` 缺失** → **引导监听父目录**（`watchParentForDir`）：`chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })`，其中 `ignored` 谓词 `(p) => p !== parentDir && basename(p) !== '.qwen'` 仅允许 **`.qwen`** 条目通过。这抑制了所有无关的顶层变动，并且从不递归。一旦 `.qwen` 出现，监听器**升级**：关闭引导监听器，启动一个目标监听器监视 `.qwen`，然后调度一次刷新以捕获可能已经在 `.qwen` 内的 `settings.json`。

健壮性细节：

- **TOCTOU 防护**：在武装引导监听器（使用 `ignoreInitial`）之后，重新检查 `existsSync(dir)`；如果 `.qwen` 在间隙中被创建，则立即进行升级。
- **删除时降级**：如果 `.qwen` 本身被删除（`unlinkDir`），目标监听器降级回父目录引导监听器，以便后续重新创建时仍能捕获。
- **代际防护**：chokidar 的 `close()` 是异步的，因此正在被拆除的监听器中的过期 `'all'` 回调可能会重新触发升级并堆积监听器。每个领域一个单调递增的世代令牌（每次升级/降级以及 `stopWatching` 时递增）使过期回调成为空操作，保证每个领域最多只有一个活跃监听器。

### 变化检测：语义差异作为主要去重机制

每次监听器触发时，它首先对**当前重载前内存中的状态**进行快照（`JSON.stringify(file.settings)`），然后调用 `reloadScopeFromDisk()` 重新加载，最后比较快照前后。仅当语义内容实际发生变化时，才通知监听器。

关键点：比较的是**重载前后**的内存状态，而不是与存储的历史快照对比。这是因为 `setValue()` 在写入磁盘之前会同步更新内存中的 `file.settings`，所以当监听器触发重载时，内存状态已经包含了刚刚写入的值——重载产生相同内容 → 无差异 → 无通知。

这自然抑制了：

- 自身写入导致的重复事件（`setValue()` 已更新内存，重载产生相同内容 → 无差异 → 无通知）
- 仅格式/注释变更（解析后的设置不包含注释）
- 没有内容修改的编辑器保存
- 重复的 chokidar 事件

已知限制：`JSON.stringify` 对键顺序敏感。如果用户手动重新排列 `settings.json` 中的键而不改变值，会触发一次无害的额外通知。这是可以接受的，无需引入深度相等依赖。

## 实现

### 1. 新的 `SettingsWatcher` 类

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
  // 'bootstrap' = 监听父目录以检测 .qwen；'target' = 监听 .qwen
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // 每个领域的单调递增令牌，在升级/降级时递增以使过期回调失效
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // 串行化防护
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**核心方法**：

#### `startWatching()`

- 遍历 User 和 Workspace 两个领域
- 根据**目录**存在性分支：如果 `.qwen` 存在则直接监听，否则引导监听父目录（参见[惰性目录处理](#惰性目录处理启动时绝不创建-qwen)）
- **从不**创建目录——没有 `mkdirSync`
- 全程使用 `ignoreInitial: true`，`depth: 0`
- 在 bare 模式下不被调用

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // 绝不创建目录；设置持久化 (saveSettings) 负责创建。
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` 是上述的父目录+严格文件名监听器（如果 `.qwen` 本身被移除，它也会降级回引导监听器）。`watchParentForDir` 武装仅监听 `.qwen` 的引导监听器，并在 `.qwen` 出现时升级：

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
      if (this.watchGeneration.get(scope) !== gen) return; // 过期回调
      if (path.basename(changedPath) !== dirBasename) return;
      void this.promoteScope(scope, settingsPath);
    })
    .on('error', (error: unknown) => {
      debugLogger.warn(`Settings bootstrap watcher error for ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // TOCTOU 防护：.qwen 可能在存在性检查之后被创建。
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // 防止重复升级
  await this.replaceWatcher(scope); // 递增世代 + 等待异步关闭
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // 捕获已经在 .qwen 中的 settings.json
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

#### `scheduleRefresh(scope)` — 300ms 防抖 + 范围累积

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

#### `drainPendingChanges()` — 串行化处理以防止重入

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // 上一轮仍在运行，它会在退出时处理
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

    // 在重载前对当前内存状态进行快照（包括 setValue() 的变更）
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk 内部有 try/catch；解析失败时保留旧状态
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // 语义差异：仅当内容实际变更时通知
    // 自写入抑制：setValue() 已更新内存 → 重载匹配 → 无通知
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

复用 SkillManager 的监听器通知模式（`packages/core/src/skills/skill-manager.ts:188-236`）：每个监听器包装在一个 30s 超时竞速中，通过 `Promise.allSettled` 并行执行，失败不会传播。

#### `addChangeListener(listener)` — 返回一个取消订阅函数

### 2. 对 `LoadedSettings` 的修改

**文件**：`packages/cli/src/config/settings.ts`

**无需修改**。语义差异机制完全包含在监听器内部。`setValue()` 同步更新内存 → `saveSettings()` 写入磁盘 → 监听器触发 → `reloadScopeFromDisk()` 重新加载 → 差异比较发现相同内容 → 无通知。链条自然闭合。

### 3. Config 集成（最小接口）

**文件**：`packages/core/src/config/config.ts`

在 `ConfigParameters` 中添加：

```typescript
/** 外部文件监听器的生命周期句柄。在关机时停止。 */
settingsWatcher?: { stopWatching(): void };
```

在 `Config.shutdown()` 中，在 `initialized` 检查**之前**停止监听器：

```typescript
async shutdown(): Promise<void> {
  try {
    // 无论初始化状态如何，先停止外部监听器
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... 其余清理逻辑 ...
  }
}
```

**Config 中不添加 settingsChangeListeners**。变更事件分发完全在 CLI 层处理，监听器直接调用核心刷新方法（例如 `skillManager.refreshCache()`，`toolRegistry.restartMcpServers()`）。这样核心包无需感知设置变更语义。

### 4. 启动串联

**文件**：`packages/cli/src/gemini.tsx`

在 `loadSettings()` 和 `loadCliConfig()` 之后：

```typescript
// 创建监听器（bare 模式下跳过）
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// 传递监听器生命周期句柄以加载 CLI 配置
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// 注册变更监听器（未来的子任务将在此处添加实际刷新逻辑）
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Settings changed:', events.map(e => `${e.scope}:${e.changeType}`));
  // 子任务 2-6 将添加：
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - needsRefresh flag
});
```

**`loadCliConfig` 签名变更**（`packages/cli/src/config/config.ts`）：添加一个可选参数以传递 `settingsWatcher` 给 `ConfigParameters`。

## 边缘情况处理

| 场景                                     | 处理方式                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `.qwen` 目录不存在                       | **绝不创建。** 引导监听父目录（`depth: 0`，仅过滤 `.qwen`），出现 `.qwen` 时升级                                |
| 启动后创建 `.qwen`                       | 引导监听器捕获 `addDir`，升级为目标监听器并调度刷新                                                            |
| 升级后删除 `.qwen`                       | 目标监听器捕获 `unlinkDir` → 降级回父目录引导监听器                                                            |
| 文件删除                                 | `reloadScopeFromDisk` 检测到 `!existsSync`，重置为 `{}`，差异触发 `deleted` 事件                              |
| 启动后创建文件（目录已存在）             | 目录监听器捕获 `add` 事件，`reloadScopeFromDisk` 读取新文件                                                |
| 升级/降级期间的过期回调                  | 每领域世代令牌使即将关闭的监听器中的进行中回调成为空操作（无监听器堆积）                                      |
| 编辑器的原子写入                         | 目录监听 + 严格文件名过滤（排除 `.tmp`/`.orig`）+ 300ms 防抖合并                                            |
| `.tmp`/`.orig` 文件事件                  | 文件名过滤精确匹配 `settings.json`，所有其他文件名被忽略                                                    |
| 自写入（`setValue` → `saveSettings`）    | 语义差异：重载内容匹配内存快照 → 无通知                                                                    |
| 自身写入与外部编辑并发                    | 外部编辑改变内容 → 差异检测到变更 → 正确通知                                                                |
| 仅格式/注释变更                          | `reloadScopeFromDisk` 解析设置时不包含注释 → 差异匹配 → 无通知                                              |
| 重复的 chokidar 事件                     | 防抖合并 + 语义差异提供双重保护                                                                              |
| `QWEN_HOME` 重定向                       | `getUserSettingsPath()` 已解析路径；监听器使用解析后的路径                                                  |
| Bare 模式                                | `startWatching()` 不会被调用，零开销                                                                        |
| 监听器创建失败                           | 捕获异常，记录警告，该领域失去实时检测能力但功能不受影响                                                      |
| `reloadScopeFromDisk` 解析失败           | 内部 try/catch（`settings.ts:501`）保留旧状态 → 前后差异匹配 → 无通知                                      |
| 键顺序变化（无值变化）                   | `JSON.stringify` 对键顺序敏感，可能产生一次无害的额外通知                                                    |
| Config 初始化失败                        | `shutdown()` 在 `initialized` 检查之前停止监听器，防止泄漏                                                  |
| 重入（监听器仍在运行）                   | `processing` 标志 + `drainPendingChanges` 循环串行化处理                                                    |
| 无效 JSON                                | `reloadScopeFromDisk` 内部 try/catch 保留旧状态                                                            |

## 性能分析

- 每个领域最多 1 个监听器（≤ 2 个），每个 `depth: 0`——最小的文件描述符开销；升级/降级交换监听器，绝不堆积
- `depth: 0` 意味着**不递归遍历**项目树，即使是在大型 monorepo 中的父目录引导监听器也是如此。成本限制在父目录的直接子项：无关的顶层变动只会唤醒 chokidar 进行一次 `readdir` + `ignored` 过滤传递（`O(顶层条目数)`），然后事件被抑制——绝不会进行递归扫描
- 300ms 防抖确保快速编辑器保存不会触发多次重新加载
- `reloadScopeFromDisk` 使用同步 `readFileSync`，每次 < 1ms
- `JSON.stringify` 比较是 O(n) 的，但设置对象通常 < 10KB；无需额外的快照存储
- 监听器通知通过 `Promise.allSettled` 并行运行
- 无轮询——纯事件驱动

## 需要创建/修改的文件

**新文件**：

- `packages/cli/src/config/settingsWatcher.ts` — 监听器类
- `packages/cli/src/config/settingsWatcher.test.ts` — 单元测试

**修改的文件**：

- `packages/core/src/config/config.ts` — 在 `ConfigParameters` 中添加 `settingsWatcher` 字段，在 `Config.shutdown()` 的 `initialized` 检查前调用 `stopWatching()`
- `packages/cli/src/config/config.ts`（`loadCliConfig`）— 添加可选参数以传递 `settingsWatcher`
- `packages/cli/src/gemini.tsx` — 实例化监听器 + 串联

**无需修改**：`packages/cli/src/config/settings.ts`（语义差异是自包含的，不需要 `LoadedSettings` 的协作）
## 测试计划

### 单元测试 (`settingsWatcher.test.ts`)

模拟 chokidar（复用 `skill-manager.test.ts` 的模拟模式）：

1. **生命周期**：`startWatching` 创建监听器，`stopWatching` 关闭监听器，两者都是幂等的
2. **路径过滤**：仅 `settings.json` 的 basename 事件触发刷新；`.tmp`/`.orig`/其他文件被忽略
3. **防抖**：多次快速事件合并为一次重载（`vi.useFakeTimers()`）
4. **语义 diff**：内容未变 → 不调用监听器；内容改变 → 使用正确事件调用监听器
5. **自身写入抑制**：`setValue()` 触发的监听器事件通过相同的 diff 自然过滤
6. **序列化**：`handleChange` 执行期间的新事件被累积，处理完成后一次性排空
7. **错误隔离**：chokidar 错误不导致崩溃；监听器异常不影响其他监听器；`reloadScopeFromDisk` 失败被捕获
8. **监听器超时**：30秒超时保护
9. **惰性目录监听**：当 `.qwen` 不存在时，`mkdirSync` 不会被调用；在父目录上设置一个引导监听器，其 `ignored` 谓词只允许 `.qwen` 条目
10. **升级 / TOCTOU**：`.qwen` 出现（通过 `addDir` 或武装后的重新检查）会关闭引导监听器，在 `.qwen` 上打开目标监听器，并安排一次刷新
11. **降级 / 重新创建**：删除 `.qwen`（`unlinkDir`）会在父目录上重新设置引导监听器；随后重新创建会再次升级
12. **代际保护**：来自已关闭引导监听器的陈旧回调不会创建第二个目标监听器

### 回归验证

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### 手动验证

在运行会话期间编辑 `~/.qwen/settings.json` 并观察变更事件的调试日志输出。

---

## 后续子任务：抑制需要重启及敏感设置的事件

> **状态：抑制门控已实现；两个 schema 翻转仍待调研。** 上面的子任务 1 对于 _任何_ 语义变更都按作用域发出单个 `SettingsChangeEvent`。此后续工作添加一个过滤器，使得仅限于那些在不重启情况下无法真正生效的设置——或者是敏感设置（凭据）的变更**不会**通知监听器。
>
> - **已完成：** `SettingsWatcher.handleChange()` 中基于 `requiresRestart` 的抑制门控以及单元测试（参见下面的机制）。
> - **待完成：** 两个 `requiresRestart` schema 修正（`modelProviders` → `true`，`permissions.*` → 保持热重载），每个修正都需先验证运行时读取路径。

### 动机

某些设置仅在进程启动时读取一次（`Config.initialize()`、内容生成器/客户端构建、子进程生成、Node 运行时标志）。用户明确指出的例子有：**API token、`env` 和模型提供商**。为这些设置发出热重载事件具有误导性——监听器会“刷新”，但新值实际上不会生效，直到用户重启 `qwen-code`。敏感值（凭据）也不应该通过正在运行的会话重新注入。

### 决策：复用 schema 的 `requiresRestart` 标志（单一事实来源）

`settingsSchema.ts` 已经在**每个**键上声明了 `requiresRestart: boolean`，并且 `packages/cli/src/utils/settingsUtils.ts` 已经暴露了查找函数：

- `requiresRestart(key: string): boolean` —— 用于点路径键的标志
- `getFlattenedSchema()` —— 完整的扁平化 `键 → 定义` 映射
- `getRestartRequiredSettings()` —— 所有 `requiresRestart: true` 的键

我们将**复用此标志作为抑制信号**，而不是维护一个单独的手动整理的拒绝列表（这肯定会与 schema 产生偏差）。`requiresRestart: true` 已经准确地表示“不重启就不会生效”，这正是在何种条件下应该抑制事件。

### 机制（在 `SettingsWatcher.handleChange()` 中实现）

旧的 gate 执行整个文件的 `JSON.stringify` diff，无法说明_哪些_键发生了变更。它被替换为叶子级别的 diff 加上按键分类：

1. **`collectChangedKeys(before, after)`** 在重载前快照内存状态（`structuredClone`），然后遍历 before/after 并收集每个值不同的叶子的点路径。纯对象会被递归；数组和基本类型被整体比较（与 schema 数组键如 `permissions.allow` 匹配）。添加/删除的键作为变更的叶子暴露出来，因此文件的创建/删除无需单独的存在性检查即可覆盖。
2. **`isRestartRequiredKey(path)`** 使用到路径的**最长 schema 键作为该路径的前缀（或等于它）**，将每个变更的路径解析到 schema 上。自由形式的对象设置（`env`、`modelProviders`）是叶子 schema 键，所以 `env.FOO` 解析为 `env` 定义。未知键默认为**不**需要重启，因此我们无法分类的变更永远不会被静默抑制。
3. 该作用域**仅当**至少一个变更的键是热重载的（`!isRestartRequiredKey`）时才通知。如果每个变更的键都需要重启，则该作用域不产生任何事件。

`SettingsChangeEvent` 的形状不变（仍然是 `{ scope, path, changeType }`）；在事件上携带剩余的变更键留作可能的后续增强。自身写入抑制（空 diff → 无事件）、防抖、序列化和监听器超时行为均不变。

### 需要调研和应用的两项 schema 调整

这两个 `requiresRestart` 值必须修正，以便复用方法按预期工作。**每个都需要先验证实际的运行时读取路径，然后再翻转标志。**

1. **`modelProviders`：`false` → `true`**（`settingsSchema.ts:294`）
   - 目前标记为 `requiresRestart: false`，因此在复用方法下它_不会_被抑制——与要求提供商变更不进行热重载相矛盾。
   - 提供商配置（包括每个提供商的 `apiKey` / `baseUrl`）在启动期间构建模型客户端/内容生成器时被消费。
   - **调研事项：** 确认不存在对 `modelProviders` 的运行时重新读取（搜索内容生成器/客户端构建）。预期结果：`false` 是一个潜在错误；翻转为 `true`。

2. **`permissions.*`：保持热重载**（`settingsSchema.ts:1560`，整个子树当前为 `requiresRestart: true`）
   - 权限规则（`deny > ask > allow`）在每个工具调用时评估，并且是用户最希望立即生效的设置。
   - 整个 `permissions` 子树是 `showInDialog: false`，因此其 `requiresRestart` 标志目前**没有 UI 意义**——这强烈暗示 `true` 是默认值而不是深思熟虑的“需要重启”决策，因此翻转其影响范围很小。
   - **调研事项：** 确认运行时实时重新读取权限（例如，通过在评估时使用 `config.getXxx()`）而不是来自启动快照。如果确认，将 `permissions` 子树设置为 `requiresRestart: false`，这样它将**不会**被复用机制抑制。

> 注意：因为 `requiresRestart` 也会在设置 UI / 重启提示中显示，翻转这些标志也会改变该行为。这是可以接受的，并且可以说更正确，但应在 PR 描述中明确指出。

### 验收标准

- 仅涉及需要重启/敏感键（`security.auth.*`、`env`、`modelProviders`、`mcpServers`、`proxy`……）的变更**不会**发出 `SettingsChangeEvent`。
- 热重载键（`ui.*`、`model.name`、`permissions.*` 一旦翻转……）的变更仍然发出事件。
- 混合变更（一个需要重启的键 + 一个热重载键）仍然发出事件（热重载部分需要合法地刷新）。
- 未知（非 schema）键的变更仍然发出，而不是被静默抑制。

测试状态：

- **已完成**——`settingsWatcher.test.ts` 的 `restart-required suppression` 块涵盖了全部抑制（`env`、`security.auth.apiKey`）、全部允许（`ui.theme`）、混合和未知键的情况。
- **待完成（与 schema 翻转一起）**——`settingsSchema.test.ts` 中断言两个修正后的 `requiresRestart` 值，以及一个监听器测试，断言 `permissions.*` 在翻转后不再被抑制。