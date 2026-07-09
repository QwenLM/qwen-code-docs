# Phase 2a マルチワークスペースセッション基盤

## 概要

本文書は、Phase 1 の `WorkspaceRegistry` PR に続く、issue #6378 の Phase 2a 基盤コントラクトを記録したものです。現在の実装バッチは、Phase 1 の繰り返し `--workspace` のフォローアップ、Phase 2a の準備ガードレール、および後続のマルチワークスペースセッション作業に必要な最初の内部レジストリ/ランタイムコントラクトを組み合わせたものです。

Phase 2a はセッションのみに留まります。この基盤バッチでは、複数ルート、`WorkspaceDaemonClient`、ワークスペース修飾 ACP/WebSocket、ファイル、メモリ、MCP、設定、音声、チャネルワーカーの移行、環境オーバーレイ、トータルセッションアドミッション、capabilities `workspaces[]`、`multi_workspace_sessions`、ルートディスパッチ、または非プライマリランタイムの構築は追加されません。

## 基盤コントラクト

- `--workspace` は CLI パーサー層で繰り返し指定可能であり、yargs が配列入力を折りたたむ代わりに保持します。
- serve のファストパスは、ワークスペース値が繰り返し指定されている場合、フルパーサーにフォールバックします。
- 単一要素のワークスペース配列はプライマリワークスペースとして扱われ、既存のシングルワークスペースの動作を維持します。
- 複数の明示的なワークスペースは引き続きゲートされ、ランタイムブート前に失敗します。
- 重複する正規化されたワークスペース入力は明示的に失敗します。
- ネストされたワークスペース入力は明示的に失敗します。
- 異なる非ネストの複数ワークスペース入力は、汎用の "multi-workspace serve is not enabled" ブートエラーで失敗します。
- 最初の明示的なワークスペースは、ゲートが解除された際の将来のプライマリワークスペースとなりますが、この基盤バッチではそのリストを公開しません。

内部 `WorkspaceRuntime` コントラクトは、後続の Phase 2a の作業に向けて安定したメタデータを持つようになりました。

- `workspaceId`: 正規化されたワークスペース cwd の安定したハッシュ。
- `workspaceCwd`: 正規化されたワークスペース cwd。
- `primary`: プライマリランタイムの場合は true。
- `trusted`: ブート時の信頼メタデータ。本番環境が明示的な信頼値を渡さない限り、直接の `createServeApp` フォールバックは false のままです。
- `env`: メタデータのみ。この基盤バッチは親プロセスモードと空のオーバーレイキーを記録しますが、ランタイムローカルの環境オーバーレイは計算しません。

内部 `WorkspaceRegistry` は、正確な cwd ルックアップ、正確な id ルックアップ、`resolveWorkspaceCwd(undefined)` のプライマリフォールバック、およびライブセッションオーナーの解決をサポートします。ライブオーナーの解決はランタイムブリッジのサマリーのみをスキャンします。永続化されたストレージのスキャン、子の作成、またはリクエストのルーティングはまだ行いません。重複するライブオーナーは、曖昧な結果となるため安全側で失敗します。

`createServeApp` はテストや将来のアセンブリ用に注入されたレジストリを受け入れることができますが、ルートモジュールは引き続きプライマリランタイムのみを受け取ります。既存のレガシーな `app.locals.boundWorkspace` と `app.locals.fsFactory` は、プライマリのみの互換性ローカル変数のままです。

## Phase 2a ルート分類

最初のゲート解除された Phase 2a マイルストーンでは、複数の明示的なワークスペースを有効にする前に、すべての `/session/:id/*` ルートを分類する必要があります。

Phase 2a でディスパッチされるルート:

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

後続またはプライマリのみのルート:

- 非プライマリ `POST /session/:id/load`
- 非プライマリ `POST /session/:id/resume`
- `GET /session/:id/export`
- `POST /sessions/delete`
- `POST /sessions/archive`
- `POST /sessions/unarchive`
- `PATCH /session/:id/organization`
- セッショングループのミューテーション
- branch、fork、cd、rewind、shell、model、および language のセッションミューテーション
- 非セッション `POST /permission/:requestId`
- `/acp`

追加のライブリードルートは、テストによってそれらが所有するライブブリッジのみに依存することが証明された後にのみ、後続の Phase 2a スライスでオーナールーティングされる可能性があります。

## 後続の Phase 2a 要件

- スキャンミスは `404 session_not_found` のままにし、プライマリにフォールバックしないこと。
- 複数のランタイムが同じライブセッション ID を報告する場合は、安全側で失敗すること。
- 永続化されたエントリが明示的に再開不可能とマークされていない限り、非プライマリセッションのリストはライブのみにすること。
- 非プライマリの子プロセスの spawn 前に、ランタイムローカルの環境オーバーレイを追加すること。
- REST およびプライマリの `/acp` がこれをバイパスできないように、ブリッジの新規作成シームに `maxTotalSessions` を追加すること。ただし、attach は引き続きアドミッションをバイパスする。
- `workspaces[]`、総制限、および `multi_workspace_sessions` は、最終的なゲート解除 PR でのみ公開すること。
- 追加の capabilities スキーマがリリースされたときに SDK capability 型を更新するが、Phase 2a ではワークスペースクライアントを追加しないこと。

## 監査の決定事項

- 基盤 PR は、非プライマリランタイムを作成したり、REST ルートを緩和したりしてはならない。
- 既存の `app.locals.boundWorkspace` と `app.locals.fsFactory` は、プライマリのみの互換性ローカル変数のままとする。
- REST の `routeFileSystemFactory` はブリッジファイルシステムファクトリとは区別されたままとし、非プライマリブリッジの境界を表すために使用してはならない。
- IDE のセカンダリファイルシステムルートは、明示的なワークスペースランタイムに昇格させてはならない。
- 真のマルチワークスペースモードがゲート解除されるまで、シングルワークスペースの親環境の動作は互換性を維持する。