# 拡張機能ファイルのリロード設計

## Background

拡張機能の変更は、現在 2 つの異なる方向からランタイムに入る。ユーザーが開始する
UI ミューテーション（有効化、無効化、インストール、アンインストール、更新など）
はすでに `ExtensionManager` を経由し、ランタイム状態を直接リフレッシュできる。
インストール済み拡張機能の `skills/`、`commands/`、`hooks/`、
`qwen-extension.json` の編集など、帯域外のファイルシステム変更は、単一の UI
アクションが所有しないため、ウォッチャー駆動のパスが必要である。

この設計は、直接ミューテーションパスを維持しながら、その欠落していたウォッチャー
パスを追加する。MCP と LSP のホットリロード設計で使用されているものと同じ
階層化に従う:

- ファイルシステムの変更がリロードまたはユーザー通知をトリガーすべきかを決定
  するのは CLI;
- 拡張機能のランタイム状態をどのようにリフレッシュするかを所有するのはコア;
- UI コンポーネントは、拡張機能のファイルを直接ポーリングする代わりに、小さな
  イベント/状態オブジェクトを消費する。

重要な制約は、すべての拡張機能ファイルを同じ方法で安全にホット適用できるわけ
ではないということである。コンテンツ的なケイパビリティファイルは自動的にリ
フレッシュできるが、パッケージレベルの変更は、拡張機能キャッシュ、ランタイム
ツール、フック、コンテキストファイル、スラッシュコマンドリストが 1 つの一貫した
スナップショットから再構築されるよう、ユーザーに `/reload-plugins` の実行を
求めるべきである。

## Current Code Assessment

- `ExtensionManager` はすでに、拡張機能マニフェスト、規約ディレクトリ、イン
  ストールメタデータ、有効化状態、マーケットプレイスソースの状態、コマンド、
  スキル、エージェント、フック、MCP 宣言、LSP 宣言を読み込んでいる。
- UI の拡張機能操作は、ランタイムに関連する状態を変更した後、すでに
  `ExtensionManager.refreshTools()` を呼び出している。そのパスはコアを通じて
  MCP、スキル、サブエージェント、フック、階層メモリをリフレッシュする。
- スラッシュコマンドの補完は、`CommandService.create()` がローダーから構築する。
  `reloadCommands()` がそのコマンドサービスを再構築しない限り、拡張機能のコ
  マンドとスキルベースのスラッシュコマンドは自動的に表示されない。
- スキルとサブエージェントのマネージャーにはキャッシュのリフレッシュ API が
  あるが、それらのキャッシュはスラッシュコマンドの補完とは別である。
- フックは `HookSystem` と `HookRegistry` が所有する。フックシステム全体を再
  作成するとエージェントスコープの一時的なフックが失われるため、リロードは
  設定されたフックのみを対象としなければならない。
- `SettingsWatcher` と既存の MCP/LSP ウォッチャーは、インストール済み拡張機能
  のパッケージ内容をカバーしない。拡張機能固有のファイルには独自のウォッチャー
  が必要である。
- リンクされた拡張機能はユーザー拡張機能ディレクトリの外に存在できるため、
  `~/.qwen/extensions` のみウォッチするとアクティブな開発ワークフローを見逃す。

## Goals

完全な CLI の再起動なしに、拡張機能の変更を現在のインタラクティブセッションで
有効にする:

- UI の拡張機能ミューテーションを即座に有効なままにする;
- ユーザー拡張機能ディレクトリ下での手動の拡張機能編集、追加、削除を検出する;
- リンクされた拡張機能のソースディレクトリ内の編集を検出する;
- `commands/`、`skills/`、`agents/` 下のコンテンツレベルのケイパビリティファイル
  を自動リフレッシュする;
- パッケージレベルの変更には `/reload-plugins` の実行をユーザーに促す;
- エージェントスコープのフックを失うことなく、ランタイムリロードの一部として
  フックをリフレッシュする;
- スラッシュコマンドの補完をコマンドとスキルの変更と同期させる;
- Qwen 自身の拡張機能ミューテーションが書き込んだ変更に対するウォッチャー通知
  を抑制する;
- 誤解を招く成功リロードサマリを報告する代わりに、MCP とフックのリロード失敗を
  表面化させる。

## Non-goals

- フックファイルの編集をコンテンツ自動リフレッシュ可能にしない。フックの挙動は
  コマンド実行やセキュリティに関わるワークフローに影響する可能性があるため、
  フックの編集はパッケージレベルの変更として扱う。
- 任意の拡張機能ファイルをホットリロードしない。解決されたコンテキストファイル
  である場合を除き、不明なファイルは無視する。
- 拡張機能ごとのインクリメンタルな MCP 再起動を追加しない。この設計は引き続き
  既存の MCP 再初期化のエントリーポイントを使用する。
- 拡張機能の検出、変換、インストールソースの解析、マーケットプレイスのセマン
  ティクスを変更しない。
- bare モードのランタイム切り替えをサポートしない。bare モードではウォッチャー
  は単に起動されない。

## Code Structure

実装は意図的にレイヤーごとに分割されている。

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

## Design

### 1. ファイルシステム変更の分類

`ExtensionFileWatcher` は chokidar のイベントを 3 つの結果のいずれかにマッピング
する:

```ts
type RefreshAction = 'auto' | 'stale' | false;
```

この分類は意図的に保守的である。

| パスの分類                       | アクション | 理由                                                                                             |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `commands/**`                    | `auto`  | スラッシュコマンドのローダーは既存の拡張機能キャッシュから再構築できる。                              |
| `skills/**`                      | `auto`  | スキルキャッシュとスラッシュコマンドのローダーは、パッケージのアイデンティティを変更せずに再構築できる。 |
| `agents/**`                      | `auto`  | サブエージェントのキャッシュは、パッケージのアイデンティティを変更せずに再構築できる。                  |
| `hooks/**`                       | `stale` | フックの実行挙動は、一貫したパッケージのスナップショットからリロードすべきである。                     |
| `qwen-extension.json`            | `stale` | マニフェストはコマンド、スキル、エージェント、フック、MCP、LSP、コンテキストファイル名、メタデータを変更できる。 |
| `.qwen-extension-install.json`   | `stale` | インストールメタデータはリンクされたソースのルートとパッケージのアイデンティティに影響する。            |
| 設定されたコンテキストファイル     | `stale` | モデルコンテキストが変更される可能性があり、明示的にリロードすべきである。                              |
| 拡張機能ディレクトリの追加/削除    | `stale` | インストール済み拡張機能のトポロジーが変更された。                                                   |
| トップレベルの拡張機能設定ファイル  | `stale` | 有効化、設定、マーケットプレイスが UI ミューテーションパスの外側で変更された。                          |
| 不明なファイル                     | 無視    | ビルド成果物や無関係なデータに対するリフレッシュを避ける。                                             |

同じ分類器が、ユーザーインストールの拡張機能とリンクされた拡張機能のソースルート
の両方に使用される。リンクされたルートの場合、ウォッチャーはまず所有するリンク
拡張機能を見つけ、次にそのソースルートに対する相対パスでパスを分類する。

### 2. ユーザーとリンク拡張機能のルートのウォッチ

`ExtensionFileWatcher.startWatching()` は次からウォッチルートを構築する:

1. `Storage.getUserExtensionsDir()`（存在する場合）;
2. インストールメタデータからのアクティブなリンク拡張機能のソースパス;
3. 拡張機能ディレクトリがまだ存在しない場合に限って、ユーザー拡張機能ディレクト
   リの親。

親のブートストラップウォッチャーは、最初の拡張機能のインストールや、起動後の
拡張機能ディレクトリの手動作成をカバーする。ディレクトリが現れると、ウォッチャー
は拡張機能の状態を stale とマークし、マイクロタスクで `restartWatching()` をスケ
ジュールする。再起動のスケジュールにより、chokidar がまだイベントをディスパッチ
している間にブートストラップウォッチャーをクローズすることを回避する。

ウォッチャーのオプション:

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

`followSymlinks: false` により、拡張機能がシンボリックリンクを通じて Qwen に任意
の外部パスをウォッチさせることを防ぐ。ignore フィルターは `node_modules`、
`.git`、一般的なエディタのバックアップファイル、スワップファイル、一時ファイル、
`.DS_Store` をスキップする。

### 3. ExtensionRefreshState によるリロード状態の共有

`ExtensionRefreshState` は、ウォッチャー、スラッシュコマンドプロセッサー、
`/reload-plugins` が共有する小さなイベント/状態のプリミティブである。

主なメソッド:

```ts
markExtensionsChanged(reason?: string): boolean;
markExtensionContentChanged(reason?: string): boolean;
clearExtensionsChanged(): void;
notifyExtensionsReloadStarted(): void;
needsExtensionRefresh(): boolean;
beginSuppression(onSettle?: () => void): () => void;
suppressNotifications<T>(fn: () => T, onSettle?: () => void): T;
```

イベント:

| イベント                  | 生成元                                  | 消費元                      | 意味                                                                  |
| ------------------------- | --------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `ExtensionContentChanged` | `ExtensionFileWatcher`                  | `useSlashCommandProcessor`  | コンテンツレベルのファイルが変更された。自動リフレッシュをスケジュールする。       |
| `ExtensionRefreshNeeded`  | `ExtensionFileWatcher`                  | `useSlashCommandProcessor`  | パッケージレベルの状態が変更された。ユーザーに `/reload-plugins` の実行を伝える。 |
| `ExtensionsReloadStarted` | `/reload-plugins`                       | `useSlashCommandProcessor`  | 手動リロードの前に、保留中のコンテンツリフレッシュタイマーをキャンセルする。        |
| `ExtensionsReloaded`      | `/reload-plugins`、ウォッチャー再起動パス | ウォッチャーとスラッシュプロセッサー | stale フラグをクリアし、保留中の作業を再起動/キャンセルする。                |

`markExtensionsChanged()` は、状態がクリアされるまで stale 通知を重複排除する。
コンテンツ変更の通知は、この状態オブジェクトでは重複排除されない。スラッシュ
コマンドプロセッサーがデバウンスと直列化を所有するためである。

### 4. プログラムによるミューテーション中のウォッチャーノイズの抑制

`ExtensionManager` が公開するもの:

```ts
interface ExtensionMutationEvent {
  id: number;
  phase: 'start' | 'end';
  operation: string;
}

addMutationListener(listener: ExtensionMutationListener): () => void;
```

ランタイムに関連するミューテーションメソッドは `beginMutation()` を呼び出し、
`finally` で必ず一致する終了イベントを発行する。

ミューテーションイベントを発行するメソッド:

- `enableExtension()`
- `disableExtension()`
- `installExtension()`
- `uninstallExtension()`
- `updateExtension()`
- `addSource()`
- `removeSource()`
- `setExtensionScope()`
- `setMcpServerDisabled()`

ミューテーションイベントを発行しないメソッド:

- `toggleFavorite()`
- `markSourceUpdated()`

ウォッチャーは `Map` 内に `mutation id -> 終了時の抑制コールバック` を保持する。
インストールが内部的に有効化をトリガーする場合があり、別々のミューテーションが
重複する可能性があるため、これは重要である。id によるペアリングにより、スタック
の順序への依存を回避する。

外側の抑制の深さがゼロに達すると、ウォッチャーが再起動する。これにより、ミュー
テーションが確定した後、リンクされたソースのルート、コンテキストファイル名、
アクティブな拡張機能のメタデータがリフレッシュされる。

### 5. コアからのランタイム状態のリフレッシュ

`refreshExtensionRuntime()` は、拡張機能の UI ミューテーションが使用するコア側の
ランタイムリフレッシュのエントリーポイントである。

次の順序でリフレッシュする:

1. `config.reinitializeMcpServers(config.getSettingsMcpServers())`
2. `config.getSkillManager()?.refreshCache()`
3. `config.getSubagentManager().refreshCache()`
4. `config.getHookSystem()?.reload()`
5. `config.refreshHierarchicalMemory()`

スキルとサブエージェントのツールの説明が更新された MCP ツールリストに依存する
可能性があるため、MCP の再初期化が最初に実行される。

スキル、サブエージェント、フックは `Promise.allSettled()` で実行されるため、1 つ
のリジェクトされた部分が他の部分の適用を妨げることはない。フックのリロード失敗
は保存され、階層メモリがリフレッシュの機会を得た後に再スローされる。これにより、
ベストエフォートのキャッシュリフレッシュを適用しつつ、フックの失敗を可視のまま
にする。

失敗の契約:

- MCP の失敗は即座に伝播し、後続のランタイム部分は実行されない。
- フックのリロード失敗は、並行リフレッシュ部分とメモリのリフレッシュが確定した
  後に伝播する。
- スキルのリフレッシュ失敗はログに記録され、ベストエフォートである。
- サブエージェントのリフレッシュ失敗はログに記録され、ベストエフォートである。
- 階層メモリのリフレッシュ失敗はログに記録され、ベストエフォートである。

### 6. /reload-plugins によるパッケージレベル変更のリロード

`reloadPluginsRuntime()` は、スラッシュコマンドが使用する CLI 側のランタイム
リロードヘルパーである:

```ts
async function reloadPluginsRuntime(options: {
  config: Config;
  reloadCommands?: () => void | Promise<void>;
}): Promise<ReloadPluginsSummary>;
```

フロー:

1. `config.getExtensionManager().refreshCache()`
2. `config.getExtensionManager().refreshTools()`
3. `reloadCommands()`
4. アクティブな拡張機能のケイパビリティをサマリする

このサマリは、次のアクティブな拡張機能の宣言をカウントする:

- 拡張機能;
- コマンド;
- スキル;
- エージェント;
- フック;
- 拡張機能の MCP サーバー;
- 拡張機能の LSP サーバー。

`/reload-plugins` はユーザー向けのコマンド挙動を所有する:

1. `config` を要求する;
2. `ExtensionsReloadStarted` を発行する;
3. `reloadPluginsRuntime()` を呼び出す;
4. 成功時も失敗時も `clearExtensionsChanged()` を呼び出す;
5. ローカライズされた info サマリまたはエラーメッセージを返す。

失敗時に stale 状態をクリアするのは意図的である。失敗したリロードが
`extensionRefreshNeeded = true` を残した場合、将来のファイルウォッチャー通知が
重複排除され、コンテンツの自動リフレッシュが自身をバイパスし続けてしまう。

### 7. コンテンツレベル変更の自動リフレッシュ

`refreshExtensionContentRuntime()` は、コンテンツのみのファイルシステム変更に対
して使用される。

フロー:

1. 拡張機能キャッシュのリフレッシュ;
2. スキルキャッシュのリフレッシュ;
3. サブエージェントキャッシュのリフレッシュ;
4. スラッシュコマンドのリロード;
5. エラーを集約し、いずれかの部分が失敗した場合は単一のメッセージをスローする。

スラッシュコマンドプロセッサーは `ExtensionContentChanged` をリッスンし、リ
フレッシュを 250 ms デバウンスする。リフレッシュは次で直列化する:

```ts
extensionContentRefreshRunningRef;
extensionContentRefreshPendingRef;
```

リフレッシュの実行中にコンテンツイベントが到着した場合、プロセッサーは別の
パスを保留中としてマークし、現在のパスの完了後にそのパスを実行する。小さな上限
により、ノイズの多いエディタやビルドプロセスが同じリフレッシュタスクを無期限に
存続させることを防ぐ。

`ExtensionRefreshState.needsExtensionRefresh()` が true の場合、コンテンツの
自動リフレッシュは早めに終了する。コマンド、スキル、エージェント、フック、MCP、
LSP、コンテキストの状態が 1 つの拡張機能キャッシュのスナップショットから再構築
されるよう、パッケージレベルのリロードを先に実行しなければならない。

### 8. エージェントスコープのフックを失わずにフックをリロード

`HookRegistry.reloadConfiguredHooks()` は、設定されたフックエントリのみを置き
換える。`agentScope !== undefined` のエントリは保持する。それらはサブエージェント
実行のために登録された一時的なフックだからである。

フロー:

1. `previousEntries` を保存する;
2. `agentEntries` を保持する;
3. レジストリのエントリを `agentEntries` に設定する;
4. `processHooksFromConfig()` を実行する;
5. 失敗時は `previousEntries` を復元して再スローする。

`HookSystem.reload()` は、`hookRegistry.reloadConfiguredHooks()` に委譲する狭い
ファサードである。したがって、ランタイムのリロードはフックシステム全体の再作成
を必要としない。

このリロードパスは、ユーザーまたはプロジェクトの設定ファイルをディスクから再
読み込みしない。`processHooksFromConfig()` は、ユーザー/プロジェクトのフックに
ついての現在の `Config` の値と、リフレッシュされた拡張機能の設定値を再処理する。
設定ファイルのリロードは引き続き設定のリロードパスが所有する。
`/reload-plugins` は拡張機能のランタイム状態を対象とする。

### 9. インタラクティブ UI への状態の配線

インタラクティブの起動は、1 つの共有 `ExtensionRefreshState` を作成する:

```ts
const extensionRefreshState = new ExtensionRefreshState();
const extensionFileWatcher = isBareMode(argv.bare)
  ? undefined
  : new ExtensionFileWatcher(config, undefined, extensionRefreshState);
```

その状態は次を通じて渡される:

```text
gemini.tsx
  -> startInteractiveUI(...)
    -> AppContainer
      -> useSlashCommandProcessor
      -> CommandContext.services.extensionRefreshState
```

`AppContainer` は、フォールバックの `ExtensionRefreshState` を、提供されなかっ
た場合のみ作成する。これにより、メインのインタラクティブパスがウォッチャーと
スラッシュコマンド処理の間で状態を共有しつつ、テストや代替の UI エントリー
ポイントをシンプルに保つ。

クリーンアップはリロードリスナーの登録を解除し、ウォッチャーを停止する。

## Event Flows

### コンテンツファイルの編集

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

### パッケージレベルのファイル編集

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

### UI ミューテーション

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

## Concurrency and Ordering

- ウォッチャーの再起動は世代によってガードされる。`watchGeneration` が変更された
  後、古いウォッチャーインスタンスからのイベントは無視される。
- ミューテーションの抑制は、スタックの順序ではなくミューテーション id でペアに
  なる。
- `stopWatching()` は、ウォッチャーの参照を破棄する前に、保留中のすべての抑制を
  終了させる。これにより、ミューテーションの進行中にウォッチャーが停止されても、
  抑制の深さがリークすることはない。
- コンテンツの自動リフレッシュは、スラッシュコマンドプロセッサー内で直列化され
  る。並行イベントは最大 1 つの保留中の再実行に合体される。
- `/reload-plugins` は `ExtensionsReloadStarted` と `ExtensionsReloaded` を発行
  し、手動リロードの前後で保留中のコンテンツリフレッシュタイマーがキャンセル
  される。
- パッケージレベルの stale 状態は、コンテンツの自動リフレッシュに優先する。
  stale のリロードが必要な場合、コンテンツの自動リフレッシュは終了して
  `/reload-plugins` を待つ。

## Failure Semantics

| パス                                                  | 挙動                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ミューテーションまたは `/reload-plugins` 時の MCP 再初期化 | 伝播する。拡張機能の MCP ツールが利用できない可能性があるため、成功メッセージは誤解を招く。                                                          |
| ミューテーションまたは `/reload-plugins` 時のフックのリロード | 他の並行リフレッシュ部分が確定した後に伝播する。設定されたフックが登録されていない可能性があるため、成功サマリは誤解を招く。                                 |
| ミューテーション中のスキルキャッシュのリフレッシュ             | ログに記録され、ベストエフォート。                                                                                                                      |
| ミューテーション中のサブエージェントキャッシュのリフレッシュ   | ログに記録され、ベストエフォート。                                                                                                                      |
| ミューテーション中の階層メモリのリフレッシュ                 | ログに記録され、ベストエフォート。すでに書き込まれた拡張機能の状態をロールバックすべきではない。                                                            |
| コンテンツの自動リフレッシュの失敗                          | 集約され、`/reload-plugins` のフォールバックとともに UI に表示される。                                                                               |
| `/reload-plugins` の失敗                               | エラーメッセージを返し、将来のウォッチャー通知が再び発行できるよう stale 状態をクリアする。                                                                |
| フックレジストリのリロード失敗                            | 以前のフックエントリを復元して再スローする。                                                                                                              |
| ウォッチャーのエラー                                     | デバッグロガーを通じてログに記録される。セッションは継続する。                                                                                            |

## Tests

### コアのテスト

`packages/core/src/extension/extension-runtime-refresh.test.ts`

- config なしでは早めに return する;
- スキル/サブエージェント/フック/メモリより前に MCP をリフレッシュする;
- MCP の reconcile 失敗を伝播させる;
- スキルのリフレッシュ失敗をベストエフォートのままにする;
- 他のリフレッシュ部分が確定した後にフックのリロード失敗を伝播させる;
- 階層メモリの失敗をベストエフォートのままにする。

`packages/core/src/extension/extensionManager.test.ts`

- 無効化の前後でミューテーションの開始/終了を発行する;
- 無効化が失敗したときもミューテーションの終了を発行する;
- ネストした有効化イベントを含め、インストールの前後でミューテーションの開始/終了
  を発行する;
- アンインストールの前後でミューテーションの開始/終了を発行する;
- 一時ディレクトリの更新失敗の前後でミューテーションの開始/終了を発行する;
- お気に入りの変更やソースのタイムスタンプ更新ではミューテーションイベントを発行
  しない;
- 既存の拡張機能の読み込み、コマンドの検出、フックの読み込み、refreshTools の
  カバレッジを維持する。

`packages/core/src/hooks/hookRegistry.test.ts`

- 設定されたフックをリロードする;
- リロード中にエージェントスコープのフックを保持する;
- 設定されたフックのリロードが失敗した場合に以前のエントリを復元する。

`packages/core/src/hooks/hookSystem.test.ts`

- リロードをフックレジストリに委譲する。

### CLI のテスト

`packages/cli/src/config/extension-refresh-state.test.ts`

- クリアされるまで stale のリフレッシュイベントを一度だけ発行する;
- コンテンツのリフレッシュイベントを発行する;
- ミューテーションの抑制中は通知を抑制する;
- stale 状態と抑制のウィンドウを正しくクリアする。

`packages/cli/src/config/extension-file-watcher.test.ts`

- commands、skills、agents を自動リフレッシュとして分類する;
- マニフェスト、インストールメタデータ、フック、コンテキストファイル、拡張機能
  トポロジーの変更を stale として分類する;
- 不明なファイルと無視対象のディレクトリを無視する;
- リンクされた拡張機能のソースをウォッチする;
- プログラムによるミューテーション中は通知を抑制する;
- ミューテーションの確定後にウォッチを再起動する;
- 拡張機能ディレクトリの遅延作成を処理する。

`packages/cli/src/config/extension-runtime-reload.test.ts`

- `/reload-plugins` に対して拡張機能キャッシュ、ランタイムツール、スラッシュ
  コマンドをリロードする;
- アクティブな拡張機能のケイパビリティをサマリする;
- コンテンツのランタイムコンポーネントをリフレッシュする;
- コンテンツの自動リフレッシュの失敗を集約する。

`packages/cli/src/ui/commands/reload-plugins-command.test.ts`

- コマンドをインタラクティブ専用の挙動として登録する;
- config がない場合はエラーを返す;
- 成功時にランタイムをリロードし stale 状態をクリアする;
- 失敗時に stale 状態をクリアしエラーを返す。

`packages/cli/src/services/BuiltinCommandLoader.test.ts`

- 組み込みコマンドの読み込みに `/reload-plugins` を含める。

### 手動検証

手動検証は次をカバーすべきである:

1. UI から拡張機能を有効化し、コマンド、スキル、エージェント、MCP、フック、コン
   テキストが再起動なしにリフレッシュされることを確認する。
2. 同じ拡張機能を無効化し、ランタイムのケイパビリティが削除されるか、提供され
   なくなることを確認する。
3. `commands/` 配下のコマンドファイルを編集し、スラッシュコマンドの補完が自動的
   に更新されることを確認する。
4. `skills/` 配下のスキルファイルを編集し、スキルベースのスラッシュコマンドの
   補完が自動的に更新されることを確認する。
5. `agents/` 配下の下エージェントファイルを編集し、エージェントキャッシュの
   挙動が変更を反映することを確認する。
6. `hooks/hooks.json`、`qwen-extension.json`、インストールメタデータ、コンテキ
   ストファイル、または拡張機能ディレクトリのトポロジーを編集し、UI が
   `/reload-plugins` を要求することを確認する。
7. `/reload-plugins` を実行し、サマリが拡張機能、コマンド、スキル、エージェン
   ト、フック、拡張機能の MCP サーバー、拡張機能の LSP サーバーを報告することを
   確認する。
8. リロードの失敗を強制し、UI がエラーを報告することを確認し、その後、別の
   ファイルシステム変更が依然として別の通知をトリガーできることを確認する。

## Tradeoffs

- 設定されたフックのリロード API が存在するにもかかわらず、フックはパッケージ
  レベルの stale な変更として扱われる。これにより、バックグラウンドのファイル
  システムイベントからフックの実行挙動がサイレントに変更されることを回避する。
- MCP のリフレッシュは、引き続きランタイム全体の再初期化である。拡張機能ごとの
  インクリメンタルな MCP 再起動はコストを下げるが、この PR が MCP の所有権の
  reconciliation ロジックにまで拡大してしまう。
- ウォッチャーは、不明なファイルを stale ではなく無視として分類する。これにより
  ビルド成果物のノイズは減るが、拡張機能の作者はランタイムのケイパビリティ
  ファイルをサポートされている規約ディレクトリに置かなければならないことを
  意味する。
- リンクされた拡張機能のルートは直接ウォッチされる。これにより作成の利便性は
  向上するが、多くのリンク拡張機能を持つユーザーではウォッチャーの数が増える
  可能性がある。

## Future Work

- 拡張機能ごとのインクリメンタルな MCP の reconciliation を追加する。
- `ENOSPC` や `EMFILE` など、致命的なウォッチャーエラーに対するユーザーに見える
  診断を追加する。
- 呼び出し元が部分成功のサマリを必要とする場合に、
  `refreshExtensionRuntime()` からの型付きリロード結果を検討する。
- リンクされた拡張機能が一般的になった場合、事前計算されたルートマップでリンク
  拡張機能のソース検索を最適化する。
- フックのリロードを明示的、可観測、バックグラウンド適用に対して十分安全にできる
  場合にのみ、フックのコンテンツの自動リフレッシュを再検討する。
