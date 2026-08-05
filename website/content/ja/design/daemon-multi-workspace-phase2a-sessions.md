# Phase 2a マルチワークスペースセッション基盤

> **過去のステータス：** このドキュメントが記録しているのは Phase 2a/
> Phase 2b 初期の手順であり、現在の完全なサーフェスではない。
> 所有権モデル、失敗時のセマンティクス、リソース境界、残りの
> プライマリ専用ルートは、現在
> [`daemon-multi-workspace-hardening.md`](./daemon-multi-workspace-hardening.md)
> によって定義されている。ここに記録されているライブセッションの
> rewind スナップショット、rewind、shell の制限は、
> [`daemon-multi-workspace-session-file-ops.md`](./daemon-multi-workspace-session-file-ops.md)
> によって置き換えられている。ライブセッションの continue、language、
> artifact の変更操作に関する後続のプライマリ専用分類も置き換えられている：
> それらの単数形 REST ルートは、現在、所有する信頼されたワークスペース
> ランタイムにディスパッチされる。その他のフェーズスコープの記述も
> 後続の設計記録によって置き換えられている可能性があり、
> 現在のルートインベントリとして扱ってはならない。

## Summary

このドキュメントは、Phase 1 の `WorkspaceRegistry` PR、Phase 2a の基盤 PR、
および最初の Phase 2b ルート拡張 PR の後の、イシュー #6378 の
マルチワークスペースセッション契約を記録する。Phase 2a は 2 つの
実装 PR に分割された：PR 1 は、マルチワークスペースがゲートされたままの
状態で、環境分離と総受け入れのガードレールを投入した。PR 2 は
非プライマリのライブセッションディスパッチを接続し、追加的な
capabilities/status スキーマを公開した。Phase 2b PR 1 はセッションの
所有者インデックスを追加し、ファイル、メモリ、MCP、設定、音声、
チャネルワーカー、ACP、SDK ワークスペースクライアントを移行せずに、
セッションのみのルートサーフェスを拡張する。

マルチワークスペースの作業は引き続きセッションのみである。Phase 2a は
複数形ルート、`WorkspaceDaemonClient`、ワークスペース修飾 ACP/WebSocket、
ファイル、メモリ、MCP、設定、音声、チャネルワーカーの移行を追加しなかった。
Phase 2b PR 1 は後述するセッションリストの複数形エイリアスのみを追加し、
それでもワークスペースクライアント API の追加やセッション以外サーフェスの
移行は行わない。PR 1 は capabilities `workspaces[]`、
`multi_workspace_sessions`、ルートディスパッチ、非プライマリランタイムの
構築を追加しなかった。

## Foundation Contract

- `--workspace` は CLI パーサー層で繰り返し指定可能であり、yargs は
  配列入力を折りたたむ代わりに保持する。
- serve のファストパスは、繰り返し指定されたワークスペース値が存在する
  場合、フルパーサーにフォールバックする。
- 単一要素のワークスペース配列はプライマリワークスペースとして扱われ、
  既存のシングルワークスペースの挙動を維持する。
- PR 1 は、複数の明示的なワークスペースをランタイム起動前に
  ゲートしたままにした。
- PR 2 は、セッションのみのマルチワークスペースモード用に、
  異なる非ネストの明示的なワークスペースを受け付ける。
- 重複する正規のワークスペース入力は引き続き明示的に失敗する。
- ネストされたワークスペース入力は引き続き明示的に失敗する。
- 最初の明示的なワークスペースがプライマリワークスペースであり、
  引き続きレガシーの `workspaceCwd` / `app.locals.boundWorkspace`
  互換フィールドによってミラーリングされる。

内部 `WorkspaceRuntime` 契約は、後続の Phase 2a 作業に向けた
安定したメタデータを保持するようになった：

- `workspaceId`: 正規のワークスペース cwd の安定したハッシュ。
- `workspaceCwd`: 正規のワークスペース cwd。
- `primary`: プライマリランタイムの場合は true。
- `trusted`: 起動時の信頼メタデータ。本番が明示的な信頼値を渡さない限り、
  直接の `createServeApp` フォールバックは false のままである。
- `env`: ランタイムローカルな環境ソースのメタデータ。シングルワークスペースの
  本番では、プライマリランタイムは、計算された実効環境スナップショットと、
  デーモンの環境リロード後にリフレッシュ可能な可変の環境ソースを
  受け取るようになった。直接の `createServeApp` フォールバックは
  親プロセスのメタデータのままである。

内部 `WorkspaceRegistry` は、正確な cwd ルックアップ、正確な id ルックアップ、
`resolveWorkspaceCwd(undefined)` のプライマリフォールバック、および
ライブセッション所有者の解決をサポートする。ライブ所有者の解決は
ランタイムのブリッジサマリーのみをスキャンする。永続化ストレージの
スキャン、子プロセスの作成、リクエストのルーティングはまだ行わない。
重複するライブ所有者は、あいまいな結果として fail closed する。

`createServeApp` は、テストや将来のアセンブリ用に注入されたレジストリを
受け付けてもよい。基盤 PR はルートモジュールをプライマリランタイムの
入力のままにした。PR 2 が拡張するのは、所有者ディスパッチに必要な
レジストリを伴うライブセッション、SSE、セッションパーミッションの
ルート配線のみである。既存のレガシーな `app.locals.boundWorkspace` と
`app.locals.fsFactory` はプライマリのみの互換ローカルのままである。

## Phase 2a Route Classification

最初のゲート解除された Phase 2a マイルストーンは、複数の明示的な
ワークスペースを有効にする前に、すべての `/session/:id/*` ルートを
分類しなければならない。

Phase 2a でディスパッチされるルート：

- `POST /session`
- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

Phase 2b でディスパッチされる追加：

- `POST /session/:id/load`
- `POST /session/:id/resume`
- `GET /session/:id/context`
- `GET /session/:id/context-usage`
- `GET /session/:id/stats`
- `GET /session/:id/supported-commands`
- `GET /session/:id/tasks`
- `GET /session/:id/lsp`
- `GET /session/:id/hooks`
- `GET /session/:id/artifacts`

後続またはプライマリのみのルート：

- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- セッショングループの変更操作
- branch、fork、cd、rewind、shell、model、language のセッション変更操作
- 非セッションの `POST /permission/:requestId`
- `/acp`

## Phase 2a Cross-PR Requirements

- スキャンミスは `404 session_not_found` のままにする。プライマリに
  フォールバックしない。
- 複数のランタイムが同じライブセッション id を報告する場合は
  fail closed する。
- 非プライマリの永続化セッションリストは、リストアの所有権、
  信頼チェック、アクティブセッションの発見が一緒に実装されるまで
  ゲートしたままにする。
- 非プライマリの子プロセス spawn の前に、PR 1 のランタイムローカルな
  環境オーバーレイを再利用する。
- 将来のすべての新規作成シームで PR 1 の `maxTotalSessions` 受け入れを
  再利用し、REST とプライマリの `/acp` がバイパスできないようにする。
  attach は引き続き受け入れをバイパスする。
- PR 2 は、ライブセッションディスパッチループが完了した後でのみ、
  `workspaces[]` と `multi_workspace_sessions` を公開する。
- PR 2 は追加的な capabilities スキーマ用に SDK のケイパビリティ型を
  更新するが、Phase 2a はそれでもワークスペースクライアントを追加しない。

## PR 1 Guardrails

- ランタイム環境は、デーモンのベース環境にワークスペースの `.env`、
  設定の環境、Cloud Shell のデフォルトを加えて計算され、ランタイム
  初期化中に親の `process.env` を変更しない。
- 環境ヘルパーは、意図的に `QWEN_HOME`、Storage、グローバル設定の
  ルーティングを仮想化しない。それらは引き続きデーモンの起動/
  ベース環境の責任である。
- ACP 子プロセスの spawn は明示的な `sourceEnv` を受け付け、低コストの
  ワークスペーススコープのステータス/設定リーダーは、直接の
  `process.env` 読み取りの代わりに注入された環境を使用する。
- `maxTotalSessions` は任意のデーモン全体の新規セッション上限である。
  spawn、永続化された load/resume のリストア、branch/fork セッションの
  作成をカバーする。attach はこれをバイパスする。マルチワークスペース
  モードで、オペレーターが未設定のままにし、ワークスペースごとの
  `maxSessions` 上限が有限である場合、PR 2 は実効の総上限を
  `maxSessionsPerWorkspace * workspaceCount` と導出する。
  シングルワークスペースモードは、従来の無制限の総量デフォルトを維持する。
- ブリッジの受け入れシームは同期的な予約フックである。新規作成の失敗は
  予約を解放し、非プライマリーブブリッジが存在するようになった時点で、
  ランタイム間の並行な過剰販売を防ぐ。
- `/daemon/status.limits.maxTotalSessions` は追加的である。
  `/capabilities` と SDK のケイパビリティ型は、PR 2 がマルチワークスペース
  セッションをゲート解除するまで変更されない。

## PR 2 Sessions Closed Loop

PR 2 は、セッションのみのデーモンモードにおける明示的な
マルチワークスペースの起動ゲートを解除する。複数の明示的な
`--workspace` 値は、正規ワークスペースごとに 1 つのランタイムを作成し、
最初のワークスペースがプライマリとなる。重複およびネストされた
ワークスペース入力は引き続き起動エラーである。なぜなら、それらは
ルートレベルのディスパッチがリクエストを安全に解決できるようになる前に、
セッションの所有権をあいまいにするからである。

本番のアセンブリは、既存のプライマリランタイムの責任を維持する：
デーモン識別、ログ識別、テレメトリサービス id、Web Shell、`/acp`、
ファイル、メモリ、MCP、設定、音声、チャネルワーカー、レガシーの
ワークスペースなし REST ルートはプライマリのままである。非プライマリ
ランタイムは、ライブ REST セッション専用のブリッジ/ワークスペースサービス
ランタイムである。それらの ACP 子プロセスは引き続き遅延である：
ブリッジオブジェクトは起動時に存在するが、信頼された
`POST /session { cwd }` リクエストに新しいセッションが必要になるまで、
非プライマリの子プロセスは spawn されない。

セッション作成は、`WorkspaceRegistry` の正確な正規 cwd マッチングを
通して `cwd` を解決する。`cwd` が省略された場合はプライマリランタイムに
解決する。未知の `cwd` は `400 workspace_mismatch` を返す。
信頼されていない非プライマリの `cwd` は `403 untrusted_workspace` を返す。
信頼された登録済みランタイムは、自身の正規 cwd を使用して
そのランタイムのブリッジを呼び出す。これは意図的に、接頭辞マッチング、
最近傍親マッチング、Phase 2a における永続化ストレージのルックアップを
回避する。

ディスパッチされるライブセッションルートは、
`WorkspaceRegistry.resolveLiveSessionOwner(sessionId)` を通して
ライブブリッジサマリーをスキャンすることで所有者ランタイムを解決する。
`not_found` は `404 session_not_found` にマップされ、`ambiguous` は
fail closed のサーバーエラーにマップされる。スキャンは同期的で
ライブのみである。子プロセスを spawn せず、ミスをプライマリへの
フォールバックとして扱うことも決してない。ディスパッチされる
ルートセットは正確には次の通りである：

- `GET /session/:id/events`
- `POST /session/:id/prompt`
- `POST /session/:id/cancel`
- `POST /session/:id/permission/:requestId`
- `POST /session/:id/heartbeat`
- `POST /session/:id/detach`
- `GET /session/:id/pending-prompts`
- `DELETE /session/:id/pending-prompts/:promptId`
- `DELETE /session/:id`
- `GET /session/:id/status`

`GET /workspace/:id/sessions` は、まず正確なワークスペース id で解決し、
次に正確な正規 cwd で解決する。プライマリは既存の永続化/ライブのマージと
organization ビューの挙動を維持する。非プライマリはライブセッションのみを
返し、`archiveState=archived` を拒否し、organization/グループのクエリを
拒否する。それらは後続フェーズのために確保された永続化/
organization backed のサーフェスだからである。

`/capabilities` は引き続き後方互換である：`workspaceCwd` は引き続き
プライマリワークスペースの名前を示す。複数のランタイムが登録されている
場合、追加で `workspaces[]`、`multi_workspace_sessions`、追加的な
セッション制限を公開する。`/daemon/status` は同じ `workspaces[]`
メタデータを追加し、ランタイムのブリッジ間でライブセッションの
カウンターを集約する一方、完全なワークスペースセクションは
プライマリのままにする。

Phase 2a PR 2 は、複数形ルート、ワークスペース修飾 ACP/WebSocket、
ファイル/メモリ/MCP/設定/音声/チャネルワーカーの移行、動的な追加/削除、
非プライマリの永続化 load/resume/export/archive/delete、
branch/fork/cd/rewind、shell/model/language の移行、SDK ワークスペース
クライアント API を追加しない。

## Phase 2b PR 1 Owner Index And Restore Expansion

Phase 2b PR 1 は、ブリッジのライフサイクルコールバックシームと、
`WorkspaceRegistry` が所有する `WorkspaceSessionOwnerIndex` を追加する。
ブリッジの登録/削除ライフサイクルイベントは、spawn、load/resume、
チャネル終了、クローズ、kill、デーモンシャットダウン時にインデックスを
更新する。所有者の解決はまずインデックスを参照し、
`getSessionSummary` でインデックスされたランタイムを検証し、
古いインデックスエントリを破棄し、既存のライブブリッジスキャンに
フォールバックする。フォールバックのヒットはインデックスに
キャッシュバックされる。インデックスは引き続き最適化および
一貫性のシームであり、永続化された所有権データベースではない。

`POST /session/:id/load` と `POST /session/:id/resume` は、信頼された
登録済みワークスペースであれば明示的な `cwd` を受け付けるようになった。
`cwd` の省略は引き続きプライマリランタイムに解決する。未知の `cwd` は
`400 workspace_mismatch` を返す。信頼されていない非プライマリの `cwd` は
`403 untrusted_workspace` を返す。同じセッション id が別のランタイムで
既にライブ、またはリストア中の場合、リストアは
`409 session_workspace_conflict` で fail closed する。同じワークスペースの
リストア競合は、ブリッジの既存のコーアレシングと
`restore_in_progress` の挙動を維持する。リストアは引き続き、
要求されたワークスペースの既存ストレージパスから永続化セッション
ストレージを読み取り、非プライマリの export/archive/delete を有効にしない。

所有者ルーティングされる読み取り専用のライブルートは、現在、
所有するランタイムのブリッジを使用する：context、context-usage、stats、
supported-commands、tasks、lsp、hooks、artifacts。これらのルートは
永続化ストレージを変更せず、ACP/WebSocket の接続ローカル状態を
必要としないため、ライブの所有者に安全に従える。
`GET /session/:id/rewind/snapshots` は引き続きプライマリ専用である。
rewind 状態はセッションのみのクローズドループの一部ではないからである。

`GET /workspaces/:workspace/sessions` は
`GET /workspace/:id/sessions` の複数形エイリアスである。両方とも
まず正確なワークスペース id で解決し、次に正確な正規 cwd で解決する。
プライマリワークスペースは永続化/ライブのマージセマンティクスを維持する。
Phase 2b PR 1 は、非プライマリワークスペースをライブのみのままにし、
アーカイブまたは organization のリストビューを拒否した。

## Phase 2b PR 2 Persisted Session Discovery

信頼された非プライマリワークスペースのセッションリストに、
そのワークスペースのセッションストアからのアクティブな永続化セッションが
含まれるようになり、対応するライブサマリーを重複なしでマージする。
これにより Phase 2b リストアフローの発見側が完成する：クライアントは
信頼されたセカンダリワークスペースをリストし、アクティブな永続化
セッションを見つけ、Phase 2b PR 1 のワークスペース対応の
`POST /session/:id/load` または `POST /session/:id/resume` を
呼び出せるようになる。

信頼された非プライマリワークスペースにアクティブな永続化セッションが
ない場合、リストは以前のライブのみのカーソル挙動を維持する。
アーカイブ、organization、グループの非プライマリリストビューは
引き続き拒否される。archive/unarchive/delete とセッションの
organization サーフェスは、依然としてプライマリ専用/後続フェーズの
作業だからである。

現時点までの Phase 2b の作業は、新しいケイパビリティタグを追加せず、
`/capabilities` スキーマを変更せず、SDK の型を変更せず、ACP、音声、
チャネルワーカー、ファイル、メモリ、MCP、設定、branch/fork/cd/rewind、
shell/model/language、export、archive、delete、organization のサーフェスを
非プライマリランタイムにルーティングしない。

## Audit Decisions

- 基盤 PR は、非プライマリランタイムを作成したり、REST ルートを
  緩和したりしてはならない。
- 既存の `app.locals.boundWorkspace` と `app.locals.fsFactory` は、
  プライマリのみの互換ローカルのままである。
- REST の `routeFileSystemFactory` はブリッジのファイルシステム
  ファクトリとは区別されたままにする。非プライマリーブブリッジの
  境界を表すために使用してはならない。
- IDE のセカンダリファイルシステムルートは、明示的なワークスペース
  ランタイムに昇格させてはならない。
- シングルワークスペースの親環境の挙動は、真のマルチワークスペース
  モードがゲート解除されるまで互換性を維持する。
- PR 2 の安全な境界は、ライブセッションのクローズドループと、
  追加的な capabilities/status メタデータである。ルートが永続化ストレージ、
  organization 状態、ワークスペース設定、または ACP の接続ローカル状態を
  必要とする場合、それはプライマリ専用または後続のままとなる。
