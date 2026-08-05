# デーモンマルチワークスペース Phase 4b: ワークスペースごとのチャネルワーカー

## Summary

このドキュメントはイシュー #6378 の Phase 4b のうち、デーモン管理の
チャネルワーカーをワークスペースでグループ化するスライスを設計する。
Voice（`/workspaces/:workspace/voice/stream`）は別の Phase 4b スライスであり、
ここではスコープ外である。

現在 `qwen serve --channel <name>` は、プライマリワークスペースにバインドされた
単一のチャネルワーカーを起動する。マルチワークスペースモードでは、
ワーカーは各チャネルを所有するワークスペースでグループ化されなければならない：
登録された各信頼済みワークスペースは、そのワークスペースの cwd、
`QWEN_DAEMON_WORKSPACE`、実効環境オーバーレイにバインドされた
独自のワーカープロセスを取得する。pidfile とデーモンステータスには
追加的なワーカーリストが加わり、既存の単一ワーカーフィールドは維持される。
`--channel all` は v1 ではプライマリ専用のままである。
シングルワークスペースの挙動は変更されない。

マッピングモデル：チャネルは**解決された cwd によって暗黙的に**
グループ化される — チャネルは、その設定された cwd が解決される
登録済みワークスペースに属する。新しい CLI 構文は追加されない。

## ベースライン：現在のチャネルワーカーのシーム

- `run-qwen-serve.ts` は listen コールバック内で 1 つの
  `ChannelWorkerSupervisor` を作成し（`boundWorkspace`、すなわち
  プライマリにバインド）、`completeRuntimeStartup` でそれを起動する。
  `completeRuntimeStartup` は、すべてのランタイム起動パスにわたる
  単一の収束点である（eager の `deps.bridge` パスと
  `startRuntime` -> `buildRuntime` パス）。`deps.bridge` は単一の
  ワークスペースに制限されるため、マルチワークスペースは常に
  `startRuntime` を経由する。
- `commands/channel/daemon-worker.ts` は自身のワークスペースを
  `capabilities.workspaceCwd`（プライマリ）に対して検証するため、
  非プライマリのワーカーはスローする。
  `validateChannelWorkspaces` はさらに、すべてのチャネルの解決された
  cwd がデーモンのワークスペースと等しいことを要求する。
- `config-utils.ts` はチャネルの cwd を
  `resolvePath(rawConfig.cwd || defaultCwd)` として解決する。
  `loadChannelsConfig(W)` は `loadSettings(W).merged.channels` を返し、
  これは system/user/workspace のスコープをマージする。
- `channel-worker-supervisor.ts` は `{...process.env}` から
  ワーカーの環境を構築する。マルチワークスペースモードでは、親の環境は
  デーモンのベース環境（Phase 2a の環境分離）であるため、
  ワークスペース自身の `.env` が欠落する。
- pidfile の `ServiceInfo` は単一ワーカーである
  （`channels[] / servePid? / workerPid?`）。デーモンステータスの
  `runtime.channelWorker` は単一のスナップショットである。
- ワークスペースレジストリ（`buildRuntime` 内で構築）は、各ランタイムの
  `env.effectiveEnv`、`trusted`、正規の `workspaceCwd` を公開する。
  Phase 2a/3 のセッションルーティングはすでに `workspaceCwd` で
  ランタイムをターゲットにしている。

## グループ化アルゴリズム

純粋関数 `resolveChannelWorkspaceGroups` は、ワーカー側の
`validateChannelWorkspaces` と `config-utils` の cwd 解決をミラーする —
そうでないと、serve 層のグループ化とワーカー自身の検証が
食い違う可能性がある。`loadChannelsConfig(W)` はスコープ間で
マージされるため、所有権は「どのワークスペースのマージ済み設定が
その名前を含むか」では決定できない。

選択された各チャネル `name` について、登録済みワークスペース `W` を
イテレートする。`name` が `loadChannelsConfig(W)` に存在すれば、
`resolvedCwd = canonicalizeWorkspace(resolvePath(cfg[name].cwd ?? W))` を
計算する。**`resolvedCwd === W` である場合に限り**、`W` が
候補の所有者となる（つまり、そのチャネルが `W` の下で
`validateChannelWorkspaces` を通過する）：

- 明示的な `cwd` = 登録済みパス X：`W === X` のみが満たす -> 所有者 = X
  （一意）。
- `cwd` なし、ワークスペース自身のスコープ（`/B/.qwen/settings.json`）でのみ
  定義：B のマージ済み設定にのみ現れ、B に解決される -> 所有者 = B（一意）。
- `cwd` なし、user/system スコープで定義：すべての W で満たされる ->
  複数の所有者 -> 真にあいまい。
- 明示的な `cwd` = 未登録パス：どの W も満たさない -> 所有者ゼロ。

エラーと集約：

- 所有者ゼロ -> `channel_workspace_mismatch`（未設定、または cwd が
  未登録のワークスペースを指している）。
- 所有者が複数 -> `ambiguous_channel_workspace`（`cwd` のない
  user/system スコープのチャネル。オペレーターはそれをワークスペースに
  スコープするか、明示的な `cwd` を追加しなければならない）。
- 所有者が信頼されていない -> `untrusted_workspace`（チャネルは
  セッションを作成する必要がある）。
- 一意の信頼された所有者 -> 所有者ごとに名前をグループ化 -> 各グループは
  `{mode:'names', names}` を取得する。
- `mode:'all'` -> プライマリのみ：`[{ workspaceCwd: primary, selection:
  {mode:'all'} }]`。プライマリワーカーはプライマリのマージ済みチャネルを
  読み込む。cwd がプライマリでないエントリは、既存の
  `validateChannelWorkspaces` のエラー挙動を維持する。
- シングルワークスペース（プライマリのみ）：`resolvedCwd` はプライマリに
  しかなりえず、現在とまったく同じ単一グループを生成する。

共有の cwd ヘルパーは、設定のパースと所有権のグループ化で使用される。
明示的な絶対パスと `~/...` は既存の意味を維持する。通常の相対パスは、
設定が読み込まれているワークスペースに対して解決される。
所有者パスはその後正規化されるため、serve 層とワーカーが
所有権について食い違うことはない。

## ワーカーの識別と環境

`CreateChannelWorkerSupervisorOptions` に任意の `workerBaseEnv` が
追加される（デフォルトは `process.env`）。`createWorkerEnv` は
`workerBaseEnv ?? process.env` をベースとして使用する。
その他はすべて変更なし（`QWEN_DAEMON_WORKSPACE`、トークン環境変数の
スクラブ、デーモントークンの注入）。グループマネージャーは
`runtime.env.effectiveEnv ?? process.env` を渡す — フィールドを直接
読み取ることで、`server.ts` からのプライベートヘルパーのインポートを
避けられ、親プロセスモードのランタイム（シングルワークスペース）は
`effectiveEnv` が undefined であり、現在とまったく同じように
`process.env` にフォールバックする。

## daemon-worker の検証修正

`DaemonCapabilitiesLike` に任意の
`workspaces?: Array<{ cwd; id; primary; trusted }>` が追加される
（Phase 2a 以降、`/capabilities` ですでに公開済み）。検証は
`daemonWorkspace = canonicalizeWorkspace(opts.workspace)` を解決する。
`capabilities.workspaces` が存在する場合、それらのいずれかと一致し、
かつ信頼されていなければならず、そうでない場合は古い
シングルワークスペースデーモン用にレガシーの
`== capabilities.workspaceCwd` チェックにフォールバックする。
両側とも正規である（スーパーバイザーは `runtime.workspaceCwd` を
渡す）ため、比較は安定している。ワーカーの残り
（チャネル設定の読み込み、`validateChannelWorkspaces`、
`createOrAttach({workspaceCwd})`）はすでにマルチワークスペースの
ルーティングで動作する。

## スーパーバイザーのグループマネージャー

薄い `ChannelWorkerGroup` が
`Map<workspaceId, ChannelWorkerSupervisor>` を所有する：

- 解決されたグループとレジストリから構築される。各スーパーバイザーは
  そのランタイムの `workspaceCwd`、選択、`env.effectiveEnv` に
  バインドされ、単一ワーカーが使用するのと同じ注入可能な
  ファクトリを通じて作成される。
- `start()` はスーパーバイザーを順に起動し、後続の起動が失敗した場合は
  すでに起動されたものをロールバックする。`stop()` は実行中の再起動を
  待ち、すべてのスーパーバイザーを停止する。`killAllSync()` は
  引き続きシグナルハンドラーのフォールバックである。
- `restart()` はデーモン全体のリロードトランザクションである。
  並行リクエストはコーアレスされる。スーパーバイザーは順に再起動し、
  いずれかの失敗は、部分的にリロードされたフリートを避けるため、
  グループ全体を停止する。
- `snapshots()` はワークスペースごとのスナップショットを返す
  （`ChannelWorkerSnapshot & { workspaceId; workspaceCwd; primary }`）。
  `primarySnapshot()` はレガシーの単一ワーカーフィールドを backed する。
- いずれかのスーパーバイザーの `onReady` / `onExit` は、
  `snapshots()` からの完全な pidfile 書き込みをトリガーする
  （増分的な単一エントリ更新は決して行わない — 下記参照）。

## pidfile スキーマと並行性

`ServiceInfo` に任意の
`workers?: Array<{ workspaceId?; workspaceCwd?; channels: string[]; workerPid? }>`
が追加される。最上位の `channels` はすべてのワーカーのチャネルの
和集合となり、最上位の `workerPid` はプライマリワーカーの pid の
ままであるため、古いリーダー（`qwen channel status`。これは
`workerPid` と `channels` のみを読み取る）は影響を受けない。

並行性：N 個のワーカーでは、`onReady`/`onExit` コールバックが
並行して発火する。単一エントリの read-modify-write は更新を
失わせる。代わりに、ライターはグループからスナップショットの
フルセットを取得し、1 回の同期的な完全書き込みを行う。
`writeServeServiceInfo` は `await` なしの同期的な
`openSync`/`writeSync` を使用するため、フルスナップショットの書き込みは
十分アトミックである — 最後の書き込みが常に完全な全体像を保持する。
`writeServeServiceInfo` には任意の `workers` パラメータが追加され、
既存の `O_RDWR + O_NOFOLLOW` + serve 所有権ガードの下に
そのまま書き込まれる。`parseServiceInfo` は `workers?` を任意に
検証してそのまま渡す。

## デーモンステータスのスキーマ

`DaemonStatusRuntime` に任意の
`channelWorkers?: Array<ChannelWorkerSnapshot & { workspaceId; workspaceCwd; primary }>`
が追加される。必須の `channelWorker` は、古いクライアント用に
プライマリグループのスナップショットのままとなる。ゲッター
（`getChannelWorkerSnapshots`）は `run-qwen-serve` から
`ServeAppDeps` と `BuildDaemonStatusOptions` を通してスレッドされ、
既存の `getChannelWorkerSnapshot` パスをミラーし、ブートストラップの
ステータスにも公開される。グループが作成される前（起動前）は、
無効なスナップショットを報告する。

## オーケストレーションとタイミング

- 単一の `channelWorker` 変数は、外側スコープでグループマネージャーの
  参照となり、pidfile ライターとシャットダウンパスが引き続き
  それを参照できるようにする。
- 早期の fail-fast：listen 時（`buildRuntime` より前）に、純粋な
  グループ化関数が `workspaceInputs` + `loadSettings` + 起動時固定の信頼
  （`getWorkspaceTrustStatus`）に対して 1 回実行される。未知、あいまい、
  信頼なし、無効な cwd の所有権は、利用可能なハンドルが公開される前に
  起動を拒否する。解決されたグループ計画は、起動の残り全体で固定される。
  その後、異なるファイルシステムスナップショットの下で設定が
  再グループ化されることはない。
- 実際の作成/起動は `completeRuntimeStartup` に移動する：
  `runtimeApp.locals.workspaceRegistry` からレジストリを読み取り
  （マルチワークスペースでは存在が保証されており、常に
  `startRuntime` -> `buildRuntime` を経由する）、固定されたグループごとに
  スーパーバイザーを構築し、それらを起動する — 単一の
  `channelWorker.start()` を置き換える。
- 新しく構築されたランタイムアプリは、チャネルスーパーバイザーの起動前に
  公開され、ACP トランスポートにアタッチされる。ワーカーは
  ブートストラップ中にランタイムの `/capabilities` ルートを必要とし、
  接続するとすぐにチャネルのトラフィックを受信する可能性があるため、
  そのデーモンセッションルートはすでに利用可能でなければならない。
  これは `main` の既存のシングルワークスペースの順序付けと一致する。
  `runtimeReady` は、要求されたすべてのスーパーバイザーが ready に
  到達した後でのみ確定する。
- チャネルワーカーの起動失敗は引き続き致命的である。グループ、pidfile、
  ブリッジ、リスナーが解体される前に、ランタイムの公開は取り消される。
  ワーカーフェーズ中のランタイム起動タイムアウトは、リスニング状態の
  デーモンを残すのではなく、同じパスに従う。グループのキャンセルは、
  そのティアダウン開始後に後続のワークスペーススーパーバイザーが
  起動することも防ぐ。
- pidfile の予約は集約されたチャネル名を保持する。シャットダウンパス
  （`stopChannelWorkerAfterFailedStartup`、`killAllSync`、通常の
  シャットダウン）はグループにファンアウトする。

リグレッションリスク：シングルワークスペースの場合、作成タイミングは
listen コールバックから `completeRuntimeStartup` に移動する。
既存の `run-qwen-serve.test.ts` のチャネルテスト（注入されたファクトリ、
ready 時の pidfile、2 回目のシグナルでの強制 kill）は
グリーンを維持しなければならない。マルチワークスペースの
オーケストレーションカバレッジは、スーパーバイザー起動から
ライブデーモンの `/capabilities` ルートもプローブし、ランタイム/
ワーカーの順序付けが注入された ready 専用ファクトリの陰で
リグレッションしないようにする。

## 起動時の挙動

- シングルワークスペース：現在と同一。
- マルチワークスペース + `--channel names`：所有者でグループ化し、
  信頼されたワークスペースごとに 1 つのワーカー。所有者ゼロ / 複数 /
  信頼なし -> 明確な起動エラー（半有効化なし）。
- マルチワークスペース + `--channel all`：プライマリワーカーのみ。
  非プライマリのチャネルはホストされないという stderr の注記付き。

## 互換性と制限

- シングルワークスペースは変更されない。古い pidfile/ステータスの
  リーダーは `channels`/`workerPid`/`channelWorker` を維持する。
- オペレーター向けガイダンス：非プライマリワークスペースでチャネルを
  ホストするには、そのワークスペース自身の `.qwen/settings.json` で
  定義するか（`cwd` は不要）、ワークスペースパスと等しい明示的な
  `cwd` を付けて任意のスコープで定義する。`cwd` のない user/system
  スコープのチャネルは、マルチワークスペースモードでは曖昧性を
  解消しなければならず、そうでなければデーモンは起動エラーとなる。
- v1 の制限：あいまい/同名のチャネルには将来の明示的な構文が必要。
  `--channel all` はプライマリのみ。単一デーモンの故障半径は
  すべてのワークスペースのワーカーをカバーする。1 つのデーモントークンが
  すべてのワークスペースをカバーする。

## Open questions

- あいまいなチャネルは、起動エラーにする代わりに、明示的な
  `--channel <workspace>:<name>` 構文で解決できるようにすべきか？
- `--channel all` はいずれすべてのワークスペースにファンアウトすべきか？

## Out of scope

- voice `/workspaces/:workspace/voice/stream` とワークスペースごとの voice。
- ワークスペースの動的な追加/削除（Phase 5）。
