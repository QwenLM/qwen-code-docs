# 設定ファイル変更検知（Issue #3696 サブタスク 1）

## コンテキスト

Qwen Code には現在、設定ファイルの変更検知機構がありません。`settings.json` を変更した後、変更を反映させるにはセッションを再起動する必要があります。この提案は、#3696 ホットリロードシステムのインフラレイヤーを実装するものです。具体的には、設定ファイルの変更を自動検知してイベントをディスパッチする仕組みを提供します。

**スコープ**: このサブタスクは「ファイル変更の検知 → リロード → リスナーへの通知」のみを担当します。`Config` はコンストラクション時に多くの設定フィールドをコピー（`approvalMode`、`mcpServers`、`telemetry` など）しており、これらのスナップショットはこのサブタスクでは自動更新されません。`LoadedSettings.merged` をリアルタイムで読み取るコンシューマ（`useSettings()` フック、`disabledSkillNamesProvider` など）のみが変更を即座に反映します。Config の内部状態への更新プッシュは、他のサブタスク（MCP 再接続、`/reload` コマンド）が担当します。

## アーキテクチャ上の決定

### モジュールの配置: `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` と設定ファイルパスはいずれも `packages/cli` にあります
- `reloadScopeFromDisk()` は `LoadedSettings` のメソッドです
- コアパッケージが受け取るのは最小限のライフサイクルインターフェース `{ stopWatching(): void }` のみであり、`SettingScope` などの CLI 型はインポートしません
- 変更イベントのディスパッチとダウンストリームのリフレッシュロジックは、CLI レイヤーで完全にワイヤリングされます

### 監視戦略: 親ディレクトリの監視 + 厳密なパスフィルタリング

`writeWithBackupSync` の書き込みフローは `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)` となっており、対象ファイルが一時的に消滅します。ファイルパスを直接監視すると chokidar が監視を失うため、親ディレクトリを（`depth: 0` で）監視し、**正確なベースネーム一致**でフィルタリングして、`settings.json` のファイルイベントのみに応答し、`.tmp`・`.orig`・エディタ一時ファイルなどは無視します。`.orig` バックアップは処理中のセーフティネットであり、成功時には**削除**（最終の `unlink` ステップ）されるため、ユーザーのディレクトリに残ることはありません。

### 遅延ディレクトリ処理: 起動時に `.qwen/` を作成しない

> **起動時のファイルシステム副作用（意図的に回避）。** ウォッチャーは、監視を開始するために `<project>/.qwen/`（または `~/.qwen/`）を**絶対に作成してはなりません**。以前のバージョンでは、存在しない設定ディレクトリに対して `mkdirSync({ recursive: true })` を呼び出していたため、Qwen の設定を持ったことのないプロジェクトでも通常の起動時に `<project>/.qwen/` が静かに作成され、ワークスペースや git の状態を汚染していました。ディレクトリの作成は設定の_永続化_（`saveSettings()` がユーザーによる実際の書き込み時に独自の `mkdirSync` を実行）のみが担当します。

セッション中に後から追加された `settings.json` をディレクトリ作成なし・プロジェクトツリーの再帰なしで検知するため、ウォッチャーは**ディレクトリ**の存在をキーとした、スコープごとの 2 段階戦略を使用します。

- **起動時に `.qwen` が存在する** → 直接監視（`watchTargetDir`、上記戦略）。
- **`.qwen` が存在しない** → **親ディレクトリをブートストラップ監視**（`watchParentForDir`）: `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })` で、`ignored` 述語 `(p) => p !== parentDir && basename(p) !== '.qwen'` により **`.qwen` エントリのみ**を通過させます。これにより、無関係なトップレベルの変動を抑制し、再帰的なスキャンを行いません。`.qwen` が現れたら、ウォッチャーは**昇格**します: ブートストラップウォッチャーを閉じ、`.qwen` 上でターゲットウォッチャーを開始し、すでに内部に存在する可能性のある `settings.json` を取得するためにリフレッシュをスケジュールします。

堅牢性の詳細:

- **TOCTOU ガード**: ブートストラップウォッチャーの設置（`ignoreInitial` を使用）後に `existsSync(dir)` を再チェックし、その間に `.qwen` が作成されていた場合は即座に昇格します。
- **降格時の対応**: `.qwen` 自体が削除された場合（`unlinkDir`）、ターゲットウォッチャーは親のブートストラップウォッチャーに降格し、その後の再作成も確実に補足します。
- **世代ガード**: chokidar の `close()` は非同期であるため、破棄中のウォッチャーの古い `'all'` コールバックが再度昇格をトリガーしてウォッチャーが積み重なる可能性があります。スコープごとの単調増加する世代トークン（昇格・降格・`stopWatching` のたびにインクリメント）により、古いコールバックが no-op となり、スコープごとに最大 1 つのアクティブなウォッチャーが保証されます。

### 変更検知: セマンティック差分による主要な重複排除

ウォッチャーがトリガーされるたびに、まずリロード前の**現在のインメモリ状態**（`JSON.stringify(file.settings)`）をスナップショットし、次に `reloadScopeFromDisk()` を呼び出してリロードし、最後に前後のスナップショットを比較します。セマンティックな内容が実際に変化した場合にのみリスナーへ通知します。

キー: 比較対象はリロードの**前後のインメモリ状態**であり、保存された履歴スナップショットではありません。これは `setValue()` がディスクへの書き込み前に `file.settings` をインメモリで同期的に更新するためです。ウォッチャーがリロードをトリガーすると、インメモリ状態にはすでに自己書き込みの値が含まれており、リロードしても同じ内容が得られるため、差分なし・通知なしとなります。

これにより自然に以下が抑制されます:

- 自己書き込みによる重複イベント（`setValue()` がすでにメモリを更新済み、リロードで同一内容 → 差分なし → 通知なし）
- フォーマット・コメントのみの変更（解決済み設定にコメントは含まれない）
- 内容変更を伴わないエディタの保存
- chokidar の重複イベント

既知の制限: `JSON.stringify` はキーの順序に依存します。ユーザーが settings.json のキーを値の変更なしに手動で並び替えた場合、無害な余分な通知が 1 回発生します。これは許容範囲内であり、deep-equal の依存関係を導入する必要はありません。

## 実装

### 1. 新しい `SettingsWatcher` クラス

**ファイル**: `packages/cli/src/config/settingsWatcher.ts`

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
  // 'bootstrap' = .qwen を待つ親を監視; 'target' = .qwen を監視
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // スコープごとの単調増加トークン; 昇格・降格時にインクリメントして古いコールバックを無効化
  private readonly watchGeneration: Map<SettingScope, number> = new Map();
  private readonly changeListeners: Set<SettingsChangeListener> = new Set();
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingScopeChanges: Set<SettingScope> = new Set();
  private processing: boolean = false; // 直列化ガード
  private started: boolean = false;

  static readonly DEBOUNCE_MS = 300;
  static readonly LISTENER_TIMEOUT_MS = 30_000;
}
```

**コアメソッド**:

#### `startWatching()`

- User スコープと Workspace スコープの両方を反復処理します
- **ディレクトリ**の存在によって分岐: `.qwen` が存在する場合は直接監視、存在しない場合は親ディレクトリをブートストラップ監視（[遅延ディレクトリ処理](#遅延ディレクトリ処理-起動時に-qwen-を作成しない)を参照）
- ディレクトリを**絶対に作成しない** — `mkdirSync` なし
- 全体を通して `ignoreInitial: true`、`depth: 0`
- ベアモードでは呼び出されない

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // ディレクトリを作成しない; 設定の永続化 (saveSettings) がその役割を担う。
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` は上述の親ディレクトリ + 厳密なベースネームウォッチャーです（`.qwen` 自体が削除された場合はブートストラップウォッチャーに降格します）。`watchParentForDir` は `.qwen` のみのブートストラップウォッチャーを設置し、`.qwen` が現れたら昇格します:

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
      if (this.watchGeneration.get(scope) !== gen) return; // 古いコールバック
      if (path.basename(changedPath) !== dirBasename) return;
      void this.promoteScope(scope, settingsPath);
    })
    .on('error', (error: unknown) => {
      debugLogger.warn(`Settings bootstrap watcher error for ${parentDir}:`, error);
    });

  this.watchers.set(scope, watcher);
  this.watchStage.set(scope, 'bootstrap');

  // TOCTOU ガード: 存在チェックとここの間に .qwen が作成された可能性がある。
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // 二重昇格防止
  await this.replaceWatcher(scope); // 世代をインクリメントし async close() を待機
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // .qwen 内にすでに存在する settings.json を取得
}
```

#### `stopWatching()` — 冪等なシャットダウン

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

#### `scheduleRefresh(scope)` — 300ms デバウンス + スコープ蓄積

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

#### `drainPendingChanges()` — 再入防止のための直列化処理

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // 前のラウンドがまだ実行中; 終了時にドレインされる
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

#### `handleChange(scopes)` — リロード + セマンティック差分 + 通知

```typescript
private async handleChange(changedScopes: Set<SettingScope>): Promise<void> {
  const events: SettingsChangeEvent[] = [];

  for (const scope of changedScopes) {
    const file = this.settings.forScope(scope);

    // リロード前の現在のインメモリ状態をスナップショット（setValue() による変更を含む）
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk は内部で try/catch を持つ; パース失敗時は古い状態を保持
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // セマンティック差分: 内容が実際に変化した場合のみ通知
    // 自己書き込み抑制: setValue() がすでにメモリを更新済み → リロードが一致 → 通知なし
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

#### `notifyListeners(events)` — `Promise.allSettled()` + 30 秒タイムアウト

SkillManager のリスナー通知パターン（`packages/core/src/skills/skill-manager.ts:188-236`）を再利用します: 各リスナーは 30 秒のタイムアウトレースでラップされ、`Promise.allSettled` で並列実行され、失敗はプロパゲートされません。

#### `addChangeListener(listener)` — 購読解除関数を返す

### 2. `LoadedSettings` への変更

**ファイル**: `packages/cli/src/config/settings.ts`

**変更不要**。セマンティック差分のメカニズムはウォッチャー内で完全に自己完結しています。`setValue()` がメモリを同期的に更新 → `saveSettings()` がディスクに書き込み → ウォッチャーがトリガー → `reloadScopeFromDisk()` がリロード → 差分比較で同一内容を検出 → 通知なし。このチェーンは自然に閉じます。

### 3. Config の統合（最小限のインターフェース）

**ファイル**: `packages/core/src/config/config.ts`

`ConfigParameters` に追加:

```typescript
/** 外部ファイルウォッチャーのライフサイクルハンドル。シャットダウン時に停止される。 */
settingsWatcher?: { stopWatching(): void };
```

`Config.shutdown()` で、`initialized` チェックの**前に**ウォッチャーを停止:

```typescript
async shutdown(): Promise<void> {
  try {
    // 初期化状態に関わらず外部ウォッチャーを停止
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... 残りのクリーンアップロジック ...
  }
}
```

**settingsChangeListeners は Config に追加しません**。変更イベントのディスパッチは CLI レイヤーで完全に処理され、リスナーがコアのリフレッシュメソッド（`skillManager.refreshCache()`、`toolRegistry.restartMcpServers()` など）を直接呼び出します。これにより、コアが設定変更のセマンティクスを知る必要がなくなります。

### 4. 起動時のワイヤリング

**ファイル**: `packages/cli/src/gemini.tsx`

`loadSettings()` と `loadCliConfig()` の後:

```typescript
// ウォッチャーを作成（ベアモードではスキップ）
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// CLI config 読み込み時にウォッチャーのライフサイクルハンドルを渡す
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// 変更リスナーを登録（将来のサブタスクで実際のリフレッシュロジックが追加される）
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Settings changed:', events.map(e => `${e.scope}:${e.changeType}`));
  // サブタスク 2-6 で以下が追加される:
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - needsRefresh フラグ
});
```

**`loadCliConfig` シグネチャの変更**（`packages/cli/src/config/config.ts`）: `settingsWatcher` を `ConfigParameters` に渡すためのオプションパラメータを追加。

## エッジケースの処理

| シナリオ                                 | 処理方法                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `.qwen` ディレクトリが存在しない         | **作成しない。** 親ディレクトリをブートストラップ監視（`depth: 0`、`.qwen` のみフィルタ）し、`.qwen` が現れたら昇格 |
| 起動後に `.qwen` が作成された            | ブートストラップウォッチャーが `addDir` を補足し、ターゲットウォッチャーに昇格 + リフレッシュをスケジュール  |
| 昇格後に `.qwen` が削除された            | ターゲットウォッチャーが `unlinkDir` を補足 → 親のブートストラップウォッチャーに降格                         |
| ファイルが削除された                     | `reloadScopeFromDisk` が `!existsSync` を検出し `{}` にリセット、差分が `deleted` イベントをトリガー         |
| 起動後にファイルが作成された（ディレクトリは存在） | ディレクトリウォッチャーが `add` イベントを補足、`reloadScopeFromDisk` が新しいファイルを読み込む          |
| 昇格・降格中の古いコールバック           | スコープごとの世代トークンにより、閉じるウォッチャーの処理中コールバックが no-op に（ウォッチャーの積み重ねなし） |
| エディタのアトミック書き込み             | ディレクトリ監視 + 厳密なベースネームフィルタリング（`.tmp`/`.orig` を除外）+ 300ms デバウンスによるまとめ処理 |
| `.tmp`/`.orig` ファイルイベント          | ベースネームフィルタが `settings.json` に完全一致し、それ以外のファイル名はすべて無視                         |
| 自己書き込み（`setValue` → `saveSettings`） | セマンティック差分: リロード内容がインメモリスナップショットと一致 → 通知なし                               |
| 外部編集と同時の自己書き込み             | 外部編集が内容を変更 → 差分が変更を検出 → 正しく通知                                                        |
| フォーマット・コメントのみの変更         | `reloadScopeFromDisk` がコメントなしで設定を解決 → 差分が一致 → 通知なし                                    |
| chokidar の重複イベント                  | デバウンスまとめ処理 + セマンティック差分による二重保護                                                      |
| `QWEN_HOME` リダイレクト                | `getUserSettingsPath()` がすでにパスを解決済み; ウォッチャーは解決済みパスを使用                            |
| ベアモード                               | `startWatching()` は呼び出されず、オーバーヘッドゼロ                                                        |
| ウォッチャー作成の失敗                   | 例外がキャッチされ警告がログに記録される。そのスコープはリアルタイム検知なしになるが機能には影響しない        |
| `reloadScopeFromDisk` のパース失敗       | 内部 try/catch（`settings.ts:501`）が古い状態を保持 → 前後の差分が一致 → 通知なし                           |
| キー順序の変更（値の変更なし）           | `JSON.stringify` はキー順序に依存; 無害な余分な通知が 1 回発生する可能性                                     |
| Config の初期化失敗                      | `shutdown()` が `initialized` チェック前にウォッチャーを停止し、リークを防止                                 |
| 再入（リスナーがまだ実行中）             | `processing` フラグ + `drainPendingChanges` ループが処理を直列化                                            |
| 無効な JSON                              | `reloadScopeFromDisk` の内部 try/catch が古い状態を保持                                                     |

## パフォーマンス分析

- スコープごとに最大 1 つのウォッチャー（合計 ≤ 2）、各 `depth: 0` — ファイルディスクリプタのオーバーヘッドが最小; 昇格・降格でウォッチャーを交換するため積み重ならない
- `depth: 0` は、大規模なモノレポでの親ブートストラップウォッチャーであっても、プロジェクトツリーの**再帰的ウォーク**を行いません。コストは親ディレクトリの直接の子に限定されます: 無関係なトップレベルの変動は chokidar を 1 回の `readdir` + `ignored` フィルタパス（`O(トップレベルエントリ数)`）で起動させた後に抑制されます — 再帰スキャンは行われません
- 300ms デバウンスにより、エディタの高速な保存が複数のリロードをトリガーしないことが保証される
- `reloadScopeFromDisk` は同期的な `readFileSync` を使用、呼び出しあたり 1ms 未満
- `JSON.stringify` 比較は O(n) だが、設定オブジェクトは通常 < 10KB; 追加のスナップショット保存は不要
- リスナー通知は `Promise.allSettled` で並列実行
- ポーリングなし — 純粋にイベント駆動

## 作成・変更するファイル

**新規ファイル**:

- `packages/cli/src/config/settingsWatcher.ts` — ウォッチャークラス
- `packages/cli/src/config/settingsWatcher.test.ts` — ユニットテスト

**変更ファイル**:

- `packages/core/src/config/config.ts` — `ConfigParameters` に `settingsWatcher` フィールドを追加、`Config.shutdown()` の `initialized` チェック前に `stopWatching()` を呼び出す
- `packages/cli/src/config/config.ts`（`loadCliConfig`）— `settingsWatcher` を渡すためのオプションパラメータを追加
- `packages/cli/src/gemini.tsx` — ウォッチャーのインスタンス化とワイヤリング

**変更不要**: `packages/cli/src/config/settings.ts`（セマンティック差分は自己完結しており、`LoadedSettings` の協力を必要としない）

## テスト計画

### ユニットテスト（`settingsWatcher.test.ts`）

chokidar をモック化（`skill-manager.test.ts` のモックパターンを再利用）:

1. **ライフサイクル**: `startWatching` がウォッチャーを作成し、`stopWatching` がウォッチャーを閉じ、両方が冪等である
2. **パスフィルタリング**: `settings.json` ベースネームイベントのみがリフレッシュをトリガーし、`.tmp`/`.orig`/その他のファイルは無視される
3. **デバウンス**: 複数の高速イベントが 1 回のリロードにまとめられる（`vi.useFakeTimers()`）
4. **セマンティック差分**: 変更のない内容 → リスナーが呼び出されない; 変更された内容 → 正しいイベントでリスナーが呼び出される
5. **自己書き込み抑制**: `setValue()` によるウォッチャーイベントが同一差分で自然にフィルタリングされる
6. **直列化**: `handleChange` 中の新しいイベントが蓄積され、処理完了後にドレインされる
7. **エラー隔離**: chokidar エラーがクラッシュを起こさない; リスナーの例外が他のリスナーに影響しない; `reloadScopeFromDisk` の失敗がキャッチされる
8. **リスナータイムアウト**: 30 秒タイムアウト保護
9. **遅延ディレクトリ監視**: `.qwen` が存在しない場合、`mkdirSync` が呼び出されない; 親にブートストラップウォッチャーが設置され、その `ignored` 述語が `.qwen` エントリのみを通過させる
10. **昇格 / TOCTOU**: `.qwen` の出現（`addDir` またはポスト設置後の再チェック）がブートストラップウォッチャーを閉じ、`.qwen` 上でターゲットウォッチャーを開き、リフレッシュをスケジュールする
11. **降格 / 再作成**: `.qwen` の削除（`unlinkDir`）が親にブートストラップし直し、その後の再作成が再び昇格する
12. **世代ガード**: すでに閉じたブートストラップウォッチャーの古いコールバックが 2 つ目のターゲットウォッチャーを作成しない

### リグレッション検証

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### 手動検証

実行中のセッションで `~/.qwen/settings.json` を編集し、変更イベントのデバッグログ出力を確認します。

---

## フォローアップサブタスク: 再起動が必要な設定と機密設定のイベント抑制

> **ステータス: 抑制ゲートは実装済み; 2 つのスキーマ変更はまだ調査待ち。**
> 上記のサブタスク 1 では、スコープの_任意の_セマンティック変更に対して `SettingsChangeEvent` を 1 つ発行していました。このフォローアップでは、再起動なしに実際に反映できない設定のみの変更、または機密情報（認証情報）の変更がリスナーに**通知されないよう**フィルタを追加します。
>
> - **完了:** `SettingsWatcher.handleChange()` における `requiresRestart` ベースの抑制ゲートとユニットテスト（下記「メカニズム」を参照）。
> - **保留中:** 2 つの `requiresRestart` スキーマ修正（`modelProviders` → `true`、`permissions.*` → ホットリロード可能に維持）、それぞれランタイムの読み取りパスを確認した上で実施。

### 動機

一部の設定はプロセス起動時（`Config.initialize()`、コンテンツジェネレーター・クライアント構築、子プロセス起動、Node ランタイムフラグ）に正確に 1 回だけ読み取られます。ユーザーが具体的に指摘した例: **API トークン、`env`、モデルプロバイダー**。これらのホットリロードイベントを発行することは積極的に誤解を招きます — リスナーが「リフレッシュ」しても、新しい値はユーザーが `qwen-code` を再起動するまで実際には反映されません。機密値（認証情報）については、実行中のセッションで再配線すべきでないという追加の理由もあります。

### 決定: スキーマの `requiresRestart` フラグを再利用（単一の真実の源）

`settingsSchema.ts` はすでに**すべての**キーに `requiresRestart: boolean` を宣言しており、`packages/cli/src/utils/settingsUtils.ts` はすでにルックアップを公開しています:

- `requiresRestart(key: string): boolean` — ドットパスキーのフラグ
- `getFlattenedSchema()` — フラット化された `key → 定義` マップ全体
- `getRestartRequiredSettings()` — `requiresRestart: true` のすべてのキー

抑制シグナルとしてこのフラグを**再利用**します。スキーマからドリフトする可能性のある手動で管理される拒否リストは維持しません。`requiresRestart: true` はすでに正確に「再起動なしに反映されない」を意味しており、これがイベントを抑制すべき条件です。

### メカニズム（`SettingsWatcher.handleChange()` で実装済み）

旧ゲートはファイル全体の `JSON.stringify` 差分を行い、どのキーが変更されたかを知ることができませんでした。リーフレベルの差分 + キーごとの分類に置き換えられています:

1. **`collectChangedKeys(before, after)`** がリロード前のインメモリ状態をスナップショット（`structuredClone`）し、before/after を走査して値が異なるすべてのリーフのドットパスを収集します。プレーンオブジェクトは再帰処理され、配列とプリミティブは全体として比較されます（`permissions.allow` などのスキーマ配列キーに対応）。追加・削除されたキーは変更されたリーフとして浮かび上がるため、ファイルの作成・削除は別途の存在チェックなしで処理されます。
2. **`isRestartRequiredKey(path)`** が、パスと等しいかその**プレフィックス**となる**最長のスキーマキー**を使用して、各変更パスをスキーマに対して解決します。フリーフォームのオブジェクト設定（`env`、`modelProviders`）はリーフスキーマキーであるため、`env.FOO` は `env` 定義に解決されます。不明なキーはデフォルトで再起動不要とされ、分類できない変更が静かに抑制されることはありません。
3. スコープは、**少なくとも 1 つの変更されたキーがホットリロード可能**（`!isRestartRequiredKey`）な場合にのみ通知します。変更されたすべてのキーが再起動必須の場合、スコープはイベントを生成しません。

`SettingsChangeEvent` の形式は変更なし（引き続き `{ scope, path, changeType }`）; 生き残った変更キーをイベントに含めることは、将来の拡張として残されます。自己書き込み抑制（空の差分 → イベントなし）、デバウンス、直列化、リスナータイムアウト動作はすべて変更なし。

### 調査・適用が必要な 2 つのスキーマ修正

再利用アプローチが意図通りに動作するために、これらの 2 つの `requiresRestart` 値を修正する必要があります。**それぞれ、フラグを変更する前に実際のランタイム読み取りパスを確認してください。**

1. **`modelProviders`: `false` → `true`**（`settingsSchema.ts:294`）
   - 現在 `requiresRestart: false` とマークされているため、再利用アプローチでは抑制_されない_ — プロバイダー変更がホットリロードされないという要件に矛盾します。
   - プロバイダー設定（プロバイダーごとの `apiKey` / `baseUrl` を含む）は、起動時にモデルクライアント・コンテンツジェネレーターが構築される際に消費されます。
   - **調査項目:** `modelProviders` のランタイム再読み取りがないことを確認（コンテンツジェネレーター・クライアント構築を検索）。期待される結果: `false` は潜在的なバグ; `true` に変更。

2. **`permissions.*`: ホットリロード可能を維持**（`settingsSchema.ts:1560`、サブツリー全体が現在 `requiresRestart: true`）
   - パーミッションルール（`deny > ask > allow`）はツール呼び出しごとに評価され、ユーザーが即座に反映させたいと最も望む設定であることが意図されています。
   - `permissions` サブツリー全体が `showInDialog: false` であるため、現在の `requiresRestart` フラグは **UI 上の意味を持っていません** — `true` は意図的な「再起動が必要」という決定ではなくデフォルトであった可能性が高く、変更の影響範囲は小さいです。
   - **調査項目:** ランタイムが起動時のスナップショットからではなく、リアルタイムでパーミッションを読み取ることを確認（例: 評価時に `config.getXxx()` 経由で）。確認できたら、`permissions` サブツリーを `requiresRestart: false` に設定して、再利用メカニズムで**抑制されないよう**にする。

> 注意: `requiresRestart` は設定 UI や再起動プロンプトにも表示されるため、これらのフラグを変更するとその動作も変わります。これは許容範囲内であり、むしろより正確ですが、PR の説明に明記する必要があります。

### 受け入れ基準

- 再起動必須・機密キーのみの変更（`security.auth.*`、`env`、`modelProviders`、`mcpServers`、`proxy` など）は `SettingsChangeEvent` を**発行しない**。
- ホットリロード可能なキーの変更（`ui.*`、`model.name`、変更後の `permissions.*` など）は引き続きイベントを発行する。
- 混合変更（再起動必須キー 1 つ + ホットリロード可能キー 1 つ）は依然としてイベントを発行する（ホットリロード可能な部分が正当にリフレッシュを必要とするため）。
- 不明な（スキーマ外の）キーの変更は、静かに抑制されるのではなく、イベントを発行する。

テストステータス:

- **完了** — `settingsWatcher.test.ts` の `restart-required suppression` ブロックが、全抑制（`env`、`security.auth.apiKey`）、全許可（`ui.theme`）、混合、不明キーのケースを網羅。
- **保留中（スキーマ変更とともに）** — 修正された 2 つの `requiresRestart` 値を固定する `settingsSchema.test.ts` アサーション、および変更後に `permissions.*` が抑制されないことを検証するウォッチャーテスト。
