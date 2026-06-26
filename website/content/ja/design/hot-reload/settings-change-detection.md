# 設定ファイル変更検知 (Issue #3696 Sub-task 1)

## 背景

Qwen Code には現在、設定ファイルの変更検知機構がありません。`settings.json` を変更しても、セッションを再起動するまで反映されません。本提案は #3696 ホットリロードシステムのインフラストラクチャ層 ― 設定ファイル変更の自動検出とイベントディスパッチ ― を実装します。

**スコープ**: このサブタスクは「ファイル変更の検出 → リロード → リスナーへの通知」のみを担当します。`Config` はコンストラクタ時に多くの設定フィールド (`approvalMode`, `mcpServers`, `telemetry` など) をコピーしますが、これらのスナップショットは本サブタスクでは自動更新されません。リアルタイムで `LoadedSettings.merged` を読み取る消費者（例: `useSettings()` フック、`disabledSkillNamesProvider`）だけが即座に変更を確認できます。他のサブタスク（MCP 再接続、`/reload` コマンド）が Config の内部状態への更新をプッシュする責任を負います。

## アーキテクチャ上の決定

### モジュールの場所: `packages/cli/src/config/settingsWatcher.ts`

- `LoadedSettings` と設定ファイルパスは両方とも `packages/cli` にあります
- `reloadScopeFromDisk()` は `LoadedSettings` のメソッドです
- core パッケージは最小限のライフサイクルインターフェース `{ stopWatching(): void }` のみを受け取り、`SettingScope` のような CLI 型をインポートしません
- 変更イベントのディスパッチと下流のリフレッシュロジックはすべて CLI 層で結線されます

### 監視戦略: 親ディレクトリ監視 + 厳密なパスフィルタリング

`writeWithBackupSync` の書き込みフローは `write(.tmp) → rename(target, .orig) → rename(.tmp, target) → unlink(.orig)` であり、これによりターゲットファイルが一時的に消えます。ファイルパスを直接監視すると、chokidar がウォッチを失う可能性があります。そのため、親ディレクトリを監視し (`depth: 0`)、**完全な basename 一致**でフィルタリングし、`settings.json` のファイルイベントのみに応答して `.tmp`、`.orig`、エディタの一時ファイルなどを無視します。`.orig` バックアップは処理中のセーフティネットであり、**成功時には削除**されます（最終的な `unlink` ステップ）。そのため、ユーザーのディレクトリに残ることはありません。

### 遅延ディレクトリ処理: 起動時に `.qwen/` を作成しない

> **起動時のファイルシステム副作用（意図的に回避）。** ウォッチャーは監視のために `<project>/.qwen/`（または `~/.qwen/`）を**決して作成してはなりません**。初期バージョンでは、欠落している設定ディレクトリに対して `mkdirSync({ recursive: true })` を呼び出していました。そのため、通常の非ベア起動では、Qwen 設定がまったくないプロジェクトでも `<project>/.qwen/` が作成され、ワークスペースや git ステータスを汚染していました。ディレクトリ作成は設定の _永続化_ のみが担当します（`saveSettings()` はユーザーが実際に設定を書き込むときに独自の `mkdirSync` を実行します）。

セッション中に後から追加された `settings.json` を、ディレクトリを作成せず、プロジェクトツリーを再帰せずに検出するために、ウォッチャーは **ディレクトリ** の存在をキーとする、スコープごとの 2 段階戦略を使用します。

- **`.qwen` が起動時に存在する** → それを直接監視します（`watchTargetDir`、上記の戦略）。
- **`.qwen` が存在しない** → **親をブートストラップ監視**します（`watchParentForDir`）: `chokidar.watch(parentDir, { depth: 0, ignoreInitial: true, ignored })`。ここで `ignored` 述語 `(p) => p !== parentDir && basename(p) !== '.qwen'` は **`.qwen` エントリのみ**を許可します。これにより、関連のないトップレベルのチャーンをすべて抑制し、再帰も行われません。`.qwen` が出現すると、ウォッチャーは**昇格**します: ブートストラップウォッチャーを閉じて `.qwen` にターゲットウォッチャーを開始し、すでに内部にある可能性のある `settings.json` を取得するためにリフレッシュをスケジュールします。

堅牢性の詳細:

- **TOCTOU ガード**: ブートストラップウォッチャーのアーミング（`ignoreInitial` を使用）後、`existsSync(dir)` を再チェックします。ギャップ中に `.qwen` が作成された場合、即座に昇格します。
- **削除時に降格**: `.qwen` 自体が削除された場合（`unlinkDir`）、ターゲットウォッチャーは親ブートストラップウォッチャーに降格し、後で再作成された場合もキャッチできるようにします。
- **世代ガード**: chokidar の `close()` は非同期であるため、破棄されつつあるウォッチャーからの古い `'all'` コールバックが昇格を再トリガーしてウォッチャーをスタックさせる可能性があります。スコープごとの単調増加世代トークン（昇格/降格時および `stopWatching` 時にインクリメント）により、古いコールバックは no-op になり、スコープごとに最大 1 つのアクティブなウォッチャーが保証されます。

### 変更検知: セマンティック差分を主要な重複排除メカニズムとして使用

ウォッチャーがトリガーされるたびに、まずリロード**前の現在のメモリ内状態**のスナップショットを取得し（`JSON.stringify(file.settings)`）、次に `reloadScopeFromDisk()` を呼び出してリロードし、最後にスナップショットの前後を比較します。リスナーは、セマンティックコンテンツが実際に変更された場合にのみ通知されます。

重要な点: 比較は、保存された過去のスナップショットではなく、**リロード前後のメモリ内状態**の間で行われます。これは、`setValue()` がディスクに書き込む前に `file.settings` を同期的にメモリ内で更新するためです。ウォッチャーがリロードをトリガーすると、メモリ内状態にはすでに自分で書き込んだ値が含まれています。リロードによって同じコンテンツが生成される → 差分なし → 通知なし。

これにより、自然に抑制されます:

- 自己書き込みからの重複イベント（`setValue()` がすでにメモリを更新しており、リロードによって同一のコンテンツが生成される → 差分なし → 通知なし）
- フォーマット/コメントのみの変更（解決済み設定にはコメントが含まれていません）
- コンテンツ変更なしのエディタ保存
- 重複する chokidar イベント

既知の制限: `JSON.stringify` はキーの順序に依存します。ユーザーが値を変更せずに settings.json のキーを手動で並べ替えた場合、無害な追加通知が 1 回発生します。これは許容範囲であり、深層等価依存関係を導入する必要はありません。

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
  // 'bootstrap' = 親を監視して `.qwen` を待つ、'target' = `.qwen` を監視
  private readonly watchStage: Map<SettingScope, 'bootstrap' | 'target'> =
    new Map();
  // スコープごとの単調増加トークン、昇格/降格時にインクリメントして古いコールバックを無効化
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

- User と Workspace の両方のスコープを反復処理
- **ディレクトリ**の存在に基づいて分岐: `.qwen` が存在する場合は直接監視、存在しない場合は親をブートストラップ監視（[遅延ディレクトリ処理](#遅延ディレクトリ処理-起動時に-qwen-を作成しない) を参照）
- **決してディレクトリを作成しない** — `mkdirSync` は呼び出さない
- 全体を通して `ignoreInitial: true`、`depth: 0` を使用
- ベアモードでは呼び出されない

```typescript
startWatching(): void {
  if (this.started) return;
  this.started = true;

  for (const { scope, settingsPath } of this.getScopePaths()) {
    if (!settingsPath) continue;
    const dir = path.dirname(settingsPath);
    // 決してディレクトリを作成しない。設定の永続化（saveSettings）がそれを担当する。
    if (fs.existsSync(dir)) {
      this.watchTargetDir(scope, settingsPath);
    } else {
      this.watchParentForDir(scope, settingsPath);
    }
  }
}
```

`watchTargetDir` は、上記で説明した親ディレクトリ + 厳密な basename ウォッチャーです（`.qwen` 自体が削除された場合、ブートストラップウォッチャーに降格も行います）。`watchParentForDir` は `.qwen` のみのブートストラップウォッチャーをアーミングし、`.qwen` が出現したら昇格します。

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

  // TOCTOU ガード: 存在チェックとこのコードの間に `.qwen` が出現した可能性がある。
  if (fs.existsSync(dir)) void this.promoteScope(scope, settingsPath);
}

private async promoteScope(scope: SettingScope, settingsPath: string): Promise<void> {
  if (this.watchStage.get(scope) !== 'bootstrap') return; // 二重昇格をガード
  await this.replaceWatcher(scope); // 世代をインクリメント + 非同期 close() を待機
  if (!this.started) return;
  this.watchTargetDir(scope, settingsPath);
  this.scheduleRefresh(scope); // すでに .qwen 内にある settings.json を取得
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

#### `scheduleRefresh(scope)` — 300ms デバウンス + スコープ累積

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

#### `drainPendingChanges()` — 再入を防ぐための直列化処理

```typescript
private async drainPendingChanges(): Promise<void> {
  if (this.processing) return; // 前のラウンドがまだ実行中、終了時にドレインする
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

    // リロード前の現在のメモリ内状態のスナップショット（setValue() の変更も含む）
    const beforeSettings = JSON.stringify(file.settings);
    const existedBefore = file.rawJson !== undefined;

    // reloadScopeFromDisk は内部で try/catch している。パース失敗時は古い状態を保持
    this.settings.reloadScopeFromDisk(scope);

    const afterSettings = JSON.stringify(file.settings);
    const existsNow = file.rawJson !== undefined;

    // セマンティック差分: コンテンツが実際に変更された場合のみ通知
    // 自己書き込み抑制: setValue() がすでにメモリを更新 → リロードが一致 → 通知なし
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

SkillManager のリスナー通知パターン（`packages/core/src/skills/skill-manager.ts:188-236`）を再利用します。各リスナーは 30 秒のタイムアウトレースでラップされ、`Promise.allSettled` を介して並行実行され、失敗は伝播しません。

#### `addChangeListener(listener)` — 購読解除関数を返す

### 2. `LoadedSettings` への変更

**ファイル**: `packages/cli/src/config/settings.ts`

**変更は不要です**。セマンティック差分メカニズムはウォッチャー内に完全に自己完結しています。`setValue()` は同期的にメモリを更新 → `saveSettings()` がディスクに書き込む → ウォッチャーがトリガー → `reloadScopeFromDisk()` がリロード → 差分比較で同一コンテンツを検出 → 通知なし。チェーンは自然に閉じます。

### 3. Config 統合（最小限のインターフェース）

**ファイル**: `packages/core/src/config/config.ts`

`ConfigParameters` に追加:

```typescript
/** 外部ファイルウォッチャーのライフサイクルハンドル。シャットダウン時に停止されます。 */
settingsWatcher?: { stopWatching(): void };
```

`Config.shutdown()` で、`initialized` チェックの**前に**ウォッチャーを停止:

```typescript
async shutdown(): Promise<void> {
  try {
    // 初期化状態に関係なく外部ウォッチャーを停止
    this.settingsWatcher?.stopWatching();

    if (!this.initialized) return;
    // ... 残りのクリーンアップロジック ...
  }
}
```

**Config に `settingsChangeListeners` は追加しません**。変更イベントのディスパッチは CLI 層で完全に処理され、リスナーはコアのリフレッシュメソッド（例: `skillManager.refreshCache()`、`toolRegistry.restartMcpServers()`）を直接呼び出します。これにより、コアは設定変更のセマンティクスを認識する必要がなくなります。

### 4. 起動時の結線

**ファイル**: `packages/cli/src/gemini.tsx`

`loadSettings()` と `loadCliConfig()` の後:

```typescript
// ウォッチャーを作成（ベアモードではスキップ）
const settingsWatcher = isBareMode(argv.bare) ? undefined : new SettingsWatcher(settings);
settingsWatcher?.startWatching();

// CLI config をロードするときにウォッチャーのライフサイクルハンドルを渡す
const config = await loadCliConfig(settings.merged, argv, ..., {
  settingsWatcher,
});

// 変更リスナーを登録（将来のサブタスクで実際のリフレッシュロジックを追加予定）
settingsWatcher?.addChangeListener(async (events) => {
  debugLogger.info('Settings changed:', events.map(e => `${e.scope}:${e.changeType}`));
  // サブタスク 2-6 で以下を追加予定:
  // - skillManager.refreshCache()
  // - toolRegistry.restartMcpServers()
  // - clearAllCaches()
  // - needsRefresh flag
});
```

**`loadCliConfig` のシグネチャ変更**（`packages/cli/src/config/config.ts`）: `ConfigParameters` に `settingsWatcher` を渡すためのオプションパラメータを追加。

## エッジケースの処理

| シナリオ                                      | 処理方法                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `.qwen` ディレクトリが存在しない               | **作成されない。** 親をブートストラップ監視（`depth: 0`、`.qwen` のみフィルタ）、`.qwen` 出現時に昇格                    |
| `.qwen` が起動後に作成された                   | ブートストラップウォッチャーが `addDir` をキャッチ、ターゲットウォッチャーに昇格 + リフレッシュをスケジュール            |
| 昇格後に `.qwen` が削除された                  | ターゲットウォッチャーが `unlinkDir` をキャッチ → 親ブートストラップウォッチャーに降格                                 |
| ファイルが削除された                           | `reloadScopeFromDisk` が `!existsSync` を検出、`{}` にリセット、差分が `deleted` イベントをトリガー                    |
| 起動後にファイルが作成された（ディレクトリは存在） | ディレクトリウォッチャーが `add` イベントをキャッチ、`reloadScopeFromDisk` が新しいファイルを読み込む                 |
| 昇格/降格中の古いコールバック                  | スコープごとの世代トークンにより、閉じようとしているウォッチャーの進行中のコールバックが no-op になる（ウォッチャーのスタックなし） |
| エディタのアトミック書き込み                  | ディレクトリ監視 + 厳密な basename フィルタリング（`.tmp`/`.orig` を除外）+ 300ms デバウンスの統合                   |
| `.tmp`/`.orig` ファイルイベント               | Basename フィルタが `settings.json` を完全一致、他のすべてのファイル名は無視                                          |
| 自己書き込み（`setValue` → `saveSettings`）    | セマンティック差分: リロード内容がメモリスナップショットと一致 → 通知なし                                              |
| 自己書き込みと外部編集の同時発生              | 外部編集が内容を変更 → 差分が変更を検出 → 正しく通知                                                                   |
| フォーマット/コメントのみの変更               | `reloadScopeFromDisk` がコメントなしで設定を解決 → 差分が一致 → 通知なし                                              |
| 重複する chokidar イベント                    | デバウンスの統合 + セマンティック差分による二重保護                                                                     |
| `QWEN_HOME` リダイレクト                      | `getUserSettingsPath()` がすでにパスを解決、ウォッチャーは解決済みパスを使用                                            |
| ベアモード                                    | `startWatching()` は決して呼び出されず、オーバーヘッドゼロ                                                              |
| ウォッチャー作成失敗                          | 例外をキャッチして警告をログ、そのスコープはリアルタイム検出なしだが機能には影響なし                                    |
| `reloadScopeFromDisk` パース失敗              | 内部 try/catch（`settings.ts:501`）が古い状態を保持 → 前後比較が一致 → 通知なし                                        |
| キー順序の変更（値の変更なし）                | `JSON.stringify` はキー順序に依存、無害な追加通知が 1 回発生する可能性あり                                              |
| Config 初期化失敗                             | `shutdown()` が `initialized` チェック前にウォッチャーを停止、リークを防止                                              |
| 再入（リスナーがまだ実行中）                  | `processing` フラグ + `drainPendingChanges` ループによる直列化                                                         |
| 不正な JSON                                   | `reloadScopeFromDisk` 内部 try/catch が古い状態を保持                                                                  |

## パフォーマンス分析

- スコープあたり最大 1 つのウォッチャー（合計 ≤ 2）、それぞれ `depth: 0` — ファイル記述子のオーバーヘッド最小限。昇格/降格はウォッチャーを交換し、スタックさせない
- `depth: 0` は、大規模なモノレポでもプロジェクトツリーの**再帰的走査がない**ことを意味します。親ブートストラップウォッチャーであってもコストは親ディレクトリの直接の子に制限されます。関連のないトップレベルのチャーンは、イベントが抑制される前に chokidar が 1 回の `readdir` + `ignored` フィルタパス（`O(トップレベルエントリ数)`）を実行するだけです。再帰スキャンはありません
- 300ms デバウンスにより、エディタの高速保存が複数のリロードをトリガーしないようにします
- `reloadScopeFromDisk` は同期 `readFileSync` を使用、呼び出しあたり < 1ms
- `JSON.stringify` 比較は O(n) ですが、設定オブジェクトは通常 10KB 未満です。追加のスナップショットストレージは不要
- リスナー通知は `Promise.allSettled` を介して並行実行
- ポーリングなし — 純粋にイベント駆動

## 作成/変更するファイル

**新しいファイル**:

- `packages/cli/src/config/settingsWatcher.ts` — ウォッチャークラス
- `packages/cli/src/config/settingsWatcher.test.ts` — 単体テスト

**変更するファイル**:

- `packages/core/src/config/config.ts` — `ConfigParameters` に `settingsWatcher` フィールドを追加、`Config.shutdown()` の `initialized` チェック前に `stopWatching()` を呼び出し
- `packages/cli/src/config/config.ts`（`loadCliConfig`） — `settingsWatcher` を渡すためのオプションパラメータを追加
- `packages/cli/src/gemini.tsx` — ウォッチャーのインスタンス化 + 結線

**変更不要**: `packages/cli/src/config/settings.ts`（セマンティック差分は自己完結しており、`LoadedSettings` の協力を必要としません）
## テスト計画

### 単体テスト（`settingsWatcher.test.ts`）

chokidar をモック化（`skill-manager.test.ts` のモックパターンを再利用）：

1. **ライフサイクル**：`startWatching` は watcher を作成し、`stopWatching` は watcher を閉じます。両方とも冪等です。
2. **パスフィルタリング**：`settings.json` の basename イベントのみがリフレッシュをトリガーします。`.tmp` / `.orig` / その他のファイルは無視されます。
3. **デバウンス**：複数の高速イベントは1回のリロードにまとめられます（`vi.useFakeTimers()`）。
4. **意味的差分**：内容が変わらない場合→リスナーは呼び出されません。内容が変わった場合→正しいイベントでリスナーが呼び出されます。
5. **自己書き込み抑制**：`setValue()` によってトリガーされた watcher イベントは、同一の差分により自然にフィルタリングされます。
6. **シリアル化**：`handleChange` 中の新しいイベントは蓄積され、処理完了後に排出されます。
7. **エラー分離**：chokidar のエラーはクラッシュを引き起こさず、リスナーの例外は他のリスナーに影響を与えず、`reloadScopeFromDisk` の失敗はキャッチされます。
8. **リスナータイムアウト**：30秒のタイムアウト保護。
9. **遅延ディレクトリ監視**：`.qwen` が存在しない場合、`mkdirSync` は呼び出されません。親ディレクトリにブートストラップ watcher が設定され、その `ignored` 述語は `.qwen` エントリのみを許可します。
10. **昇格 / TOCTOU**：`.qwen` が出現した場合（`addDir` またはアーム後の再チェック経由）、ブートストラップ watcher を閉じ、`.qwen` 上のターゲット watcher を開き、リフレッシュをスケジュールします。
11. **降格 / 再作成**：`.qwen` を削除すると（`unlinkDir`）、親ディレクトリに再ブートストラップされます。その後再作成されると、再度昇格します。
12. **世代ガード**：既に閉じられたブートストラップ watcher からの古いコールバックが、2番目のターゲット watcher を作成することはありません。

### 回帰検証

```bash
cd packages/cli && npx tsc --noEmit
cd packages/core && npx tsc --noEmit
cd packages/cli && npx vitest run src/config/
cd packages/core && npx vitest run src/config/
```

### 手動検証

実行中のセッション中に `~/.qwen/settings.json` を編集し、変更イベントのデバッグログ出力を確認します。

---

## フォローアップサブタスク：再起動が必要な設定と機密設定のイベントを抑制する

> **ステータス：抑制ゲートは実装済み。スキーマの2つのフリップはまだ調査保留中。** 上記のサブタスク1では、_任意の_ 意味的変更に対してスコープごとに1つの `SettingsChangeEvent` を発行していました。このフォローアップでは、本当に効果を発揮するために再起動が必要な設定、または機密設定（認証情報）に限定された変更がリスナーに通知され**ない**ようにフィルターを追加します。
>
> - **完了:** `SettingsWatcher.handleChange()` における `requiresRestart` ベースの抑制ゲートと、単体テスト（下記メカニズム参照）。
> - **保留中:** 2つの `requiresRestart` スキーマ修正（`modelProviders` → `true`、`permissions.*` → ホットリロード可能のまま）。それぞれ、実行時の読み取りパスを先に確認する必要があります。

### 動機

一部の設定は、プロセスの起動中に一度だけ読み込まれます（`Config.initialize()`、コンテンツジェネレーター/クライアントの構築、子プロセスの生成、Node ランタイムフラグなど）。ユーザーが明示的に挙げた例：**API トークン、`env`、モデルプロバイダー**。これらのホットリロードイベントを発行することは積極的に誤解を招きます。リスナーは「リフレッシュ」しますが、実際に新しい値が適用されるのはユーザーが `qwen-code` を再起動するまでです。機密値（認証情報）はさらに、実行中のセッションを通じて再配線されるべきではありません。

### 決定：スキーマの `requiresRestart` フラグを再利用（単一の真実源）

`settingsSchema.ts` は既に**すべての**キーに `requiresRestart: boolean` を宣言しており、`packages/cli/src/utils/settingsUtils.ts` は既に以下のルックアップを公開しています：

- `requiresRestart(key: string): boolean` — ドットパスキーのフラグ
- `getFlattenedSchema()` — フラット化された完全な `key → 定義` マップ
- `getRestartRequiredSettings()` — `requiresRestart: true` の全キー

私たちは**このフラグを抑制シグナルとして再利用**します。別途手作業で管理される拒否リスト（必然的にスキーマから乖離する）を維持するのではなく。`requiresRestart: true` は既に「再起動なしでは効果がない」という意味であり、これはイベントを抑制すべき条件と正確に一致します。

### メカニズム（`SettingsWatcher.handleChange()` に実装済み）

以前のゲートはファイル全体の `JSON.stringify` 差分を行っており、どのキーが変更されたかを特定できませんでした。これはリーフレベルの差分 + キーごとの分類に置き換えられています：

1. **`collectChangedKeys(before, after)`** は、リロード前のメモリ状態をスナップショット化し（`structuredClone`）、before/after を走査して、値が異なるすべてのリーフのドットパスを収集します。プレーンオブジェクトは再帰され、配列とプリミティブは全体として比較されます（スキーマの配列キー `permissions.allow` に一致）。追加/削除されたキーは変更されたリーフとして表面化するため、ファイルの作成/削除は個別の存在チェックなしでカバーされます。
2. **`isRestartRequiredKey(path)`** は、各変更パスをスキーマに対して解決します。**そのパスのプレフィックス（またはそれと等しい）である最長のスキーマキー**を使用します。自由形式オブジェクト設定（`env`、`modelProviders`）はリーフスキーマキーであるため、`env.FOO` は `env` 定義に解決されます。未知のキーはデフォルトで再起動不要とみなされるため、分類できない変更が黙って抑制されることはありません。
3. スコープは、**少なくとも1つの変更キーがホットリロード可能（`!isRestartRequiredKey`）である場合にのみ**通知します。すべての変更キーが再起動必要な場合、スコープはイベントを生成しません。

`SettingsChangeEvent` の形状は変更なし（依然として `{ scope, path, changeType }`）。イベントに生き残った変更キーを載せることは、将来の拡張として残されます。自己書き込み抑制（空の差分→イベントなし）、デバウンス、シリアル化、リスナータイムアウトの動作はすべて変更されていません。

### 調査して適用する2つのスキーマ調整

再利用アプローチが意図通りに動作するためには、これら2つの `requiresRestart` 値を修正する必要があります。**それぞれ、フラグを反転する前に実際の実行時読み取りパスを確認する必要があります。**

1. **`modelProviders`: `false` → `true`**（`settingsSchema.ts:294`）
   - 現在は `requiresRestart: false` とマークされているため、再利用アプローチでは抑制され**ません**。これは、プロバイダー変更がホットリロードされないという要件に反します。
   - プロバイダー設定（プロバイダーごとの `apiKey` / `baseUrl` を含む）は、起動時にモデルクライアント / コンテンツジェネレーターが構築される際に消費されます。
   - **調査項目：** `modelProviders` の実行時再読み込みが存在しないことを確認（コンテンツジェネレーター / クライアント構築を検索）。期待される結果：`false` は潜在的なバグであり、`true` に反転する。

2. **`permissions.*`: ホットリロード可能のまま**（`settingsSchema.ts:1560`、サブツリー全体が現在 `requiresRestart: true`）
   - 権限ルール（`deny > ask > allow`）はツール呼び出しごとに評価され、ユーザーが最も即座に効果を期待する設定です。
   - `permissions` サブツリー全体は `showInDialog: false` であるため、その `requiresRestart` フラグは現在**UI 上の意味を持ちません** — これは、`true` が「再起動が必要」という意図的な決定ではなくデフォルトであった可能性が高いことを強く示唆しており、反転の影響範囲は低いです。
   - **調査項目：** 実行時に権限が毎回再読み込みされていることを確認（例：評価時に `config.getXxx()` 経由）。起動時のスナップショットからではない。確認できたら、`permissions` サブツリーを `requiresRestart: false` に設定し、再利用メカニズムによって抑制され**ない**ようにします。

> 注：`requiresRestart` は設定 UI / 再起動プロンプトにも表示されるため、これらのフラグを反転するとその動作も変わります。これは許容可能であり、おそらくより正確ですが、PR の説明で明示する必要があります。

### 受け入れ条件

- 再起動が必要 / 機密設定（`security.auth.*`、`env`、`modelProviders`、`mcpServers`、`proxy` など）のみに触れる変更は、**`SettingsChangeEvent` を発行しません**。
- ホットリロード可能なキー（`ui.*`、`model.name`、`permissions.*`（反転後）など）への変更は、依然としてイベントを発行します。
- 混合変更（再起動必要なキー1つ + ホットリロード可能なキー1つ）は、依然としてイベントを発行します（ホットリロード可能な部分は正当にリフレッシュする必要があります）。
- 未知の（スキーマ外の）キー変更は、黙って抑制されるのではなく、発行されます。

テストステータス：

- **完了** — `settingsWatcher.test.ts` の `restart-required suppression` ブロックは、全抑制（`env`、`security.auth.apiKey`）、全許可（`ui.theme`）、混合、未知キーの各ケースをカバーしています。
- **保留中（スキーマ反転とともに）** — `settingsSchema.test.ts` で2つの修正後の `requiresRestart` 値を検証するアサーションと、`permissions.*` が反転後は抑制されなくなることを検証する watcher テスト。