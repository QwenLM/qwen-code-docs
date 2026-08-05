# デーモンマルチワークスペース Phase 4: ワークスペース修飾 ACP

## Summary

このドキュメントはイシュー #6378 の Phase 4 を設計する：`qwen serve` の
ワークスペース修飾 ACP である。これは Phase 3 のワークスペース修飾 REST
ブランチ（`codex/phase3-workspace-qualified-rest`、PR #6567）の上に直接
構築するが、それは**まだマージされていない**（状態
`CHANGES_REQUESTED`）。Phase 4 はワークスペースごとの ACP エンドポイントを
`/workspaces/:workspace/acp` にマウントし、各ワークスペースランタイムに
独自の ACP ディスパッチャーと接続状態を与え、Web Shell が
`/capabilities` からワークスペースを選択できるようにする。レガシーの
`/acp` はプライマリランタイムにバインドされたままなので、既存の
Web Shell と ACP クライアントは影響を受けない。

Phase 4 のスコープは ACP トランスポートである（Streamable HTTP + 逆方向の
`/acp` WebSocket、そのミラーされたワークスペースメソッド群、逆方向の
MCP/CDP）。Voice（`/workspaces/:workspace/voice/stream`）とデーモン管理の
チャネルワーカーは **Phase 4b** である。ワークスペースの動的な追加/削除は
**Phase 5** である。どちらもここではスコープ外である。

シーム調査からの核心的な発見：Phase 4 は大部分が_配線とルーティング_の
変更であり、書き換えではない。`AcpDispatcher` はすでに構造的に
ワークスペースにバインドされており、その `workspaceCwd` の一貫性チェックは
すでに存在し、Phase 3 はすでにミラーされた REST サーフェスを
ランタイムごとにし、`clientMcpSenderRegistry` はすでに
ランタイムごとのフィールドである。実際の作業は、(1) 単一の ACP マウントを
ランタイムごとに 1 つのディスパッチャーに変えること（それぞれが独自の
remember-lane を持つ。それでも `mountAcpHttp` の呼び出しは 1 回、
upgrade リスナーも 1 つ。すべてのランタイムのレジストリを所有する
`AcpHttpHandle`）、(2) その WebSocket upgrade リスナーを拡張して
URL パスでディスパッチすること、(3) デバイスフローレジストリを
デーモン全体のままにしてすべてのマウントで共有すること
（各信頼されたランタイムのブリッジへのベストエフォートの
イベントシンクファンアウト付き）、(4) 新しい
`workspace_qualified_acp` ケイパビリティタグを SDK/CLI の
ケイパビリティ型とテスト全体で同期することである。

## 体系的な手直し（強化、PR #6621）

レビューで Critical が表面化した：以前のイテレーションでは
デバイスフローレジストリをランタイムごとにしていたため、
セカンダリのマウントが未認証のままになっていた（`device_flow "not
configured"`）。ACP マウントは 8 つの軸に沿って手直しされた。
最終アーキテクチャは次の通り：

1. **ランタイム ACP マウントファクトリ。** 1 つの `mountAcpHttp` 呼び出しが
   `primaryMount` と `secondaryMounts` マップ（非プライマリランタイムごとに
   1 つの `RuntimeAcpMount`）を所有し、それぞれが `primary` フラグを持つ。
   HTTP と WS の両方がセレクターでマウントを解決し、共有ハンドラーに委譲する。
2. **ルーティング + 接続分離。** 複数形のセレクターはプライマリワークスペースを
   `primaryMount` にエイリアスし、それ以外はランタイムごとのマウントを解決する。
   信頼されていない非プライマリワークスペースは、子プロセスが spawn される前に
   HTTP と WS の両方のパスで拒否（403）される。
3. **生の request-target WS パース。** upgrade リスナーは生の request-target を
   パースする（`%2e%2e` を正規化してしまう `new URL().pathname` ではない）。
   そのため、正規化されていないドットセグメント/バックスラッシュのセレクターは
   ルーティング前に破壊される。
4. **デーモン全体のデバイスフロー + ファンアウト。** デバイスフローレジストリは
   単一のデーモンインスタンスのままである（OAuth 認証情報はプロセス全体）。
   セカンダリのマウントは `opts.deviceFlowRegistry` を介してそれを共有する。
   認証フローのイベントは、すべての信頼されたランタイムのブリッジに
   ベストエフォートでファンアウトする（`resolveEventBridges`）。
5. **プライマリのみの CDP + クライアント MCP。** CDP トンネルのクレームは
   `activeMount.primary` でゲートされる。複数形の POST はディスパッチの
   promise を返す。
6. **dispose 済みライフサイクルゲート。** `dispose()` の後、共有 HTTP ハンドラーは
   シャットダウンの drain 中に解体されたレジストリと競合する代わりに
   `503 server_disposed` を返す。`dispose()` は冪等である。
7. **集約された可観測性。** `AcpHttpHandle.getSnapshot()` はプライマリと
   すべてのセカンダリマウント間で接続数と WS ストリーム数を合算するため、
   デーモンメトリクスはプライマリだけでなくすべてのワークスペースの
   ACP 接続を報告する。
8. **ケイパビリティの広告。** `resolveAcpHttpEnabled()` が
   `QWEN_SERVE_ACP_HTTP` の唯一の解釈である。`workspace_qualified_acp` は、
   ACP HTTP サーフェスが有効**かつ**マルチワークスペースセッションが
   アクティブな場合のみ広告される。

## レビュー後のシーム強化

上記のマウントアーキテクチャは変更されない。最終的な修復パスは、
`AcpHttpHandle` を置き換えたり新しいルートポリシーモジュールを導入したり
せずに、6 つの境界ギャップを閉じる。

1. **修飾ルートの準備完了判定は 1 つ。** ワークスペース修飾 ACP が
   ready となるのは、ACP HTTP が有効で、ワークスペースレジストリに
   複数のランタイムが含まれる場合のみである。HTTP ルート登録、
   WebSocket パス認識、ケイパビリティの広告、外側のレートリミッターの
   除外は、その判定と一致しなければならない。シングルワークスペースの
   デーモンは引き続きレガシーの `/acp` のみを公開する。
2. **レート制限のチャージは 1 回。** 外側の Express リミッターは、
   有効な `/workspaces/<single-selector>/acp` トランスポートパスを、
   ルートの既存の大文字小文字および末尾スラッシュの挙動を含めて
   正確に除外する。近接するパスは制限されたままである。ACP トランスポートは
  引き続き JSON-RPC メソッドティアの適用に責任を持つため、
   修飾されたプロンプトは mutation と prompt の両方のバケットではなく
   prompt バケットのみを消費する。
3. **構造化された不正パス失敗。** Express のルートパラメータデコード失敗のうち、
   `URIError` インスタンスでありかつ HTTP ステータス 400 がマークされたものは、
   構造化された `400 invalid_request` を返す。その他のスローされた
   `URIError` 値や無関係な失敗は、汎用の 500 処理を維持する。
   WebSocket パスは既存の明示的な 400 レスポンスを維持する。
4. **ログセーフなセレクター。** オペレーター向けの WebSocket 拒否ログで
   使用されるデコード済みセレクターは、既存の `logSafe` サニタイザーを
   通すため、エンコードされた端末制御文字が stderr 行を偽造したり
   分割したりできない。
5. **終端の dispose。** `dispose()` は不可逆なライフサイクル遷移である。
   実行後、`attachServer()` は WebSocket サーバーや upgrade リスナーを
   再作成できない。`dispose()` と `attachServer()` の繰り返し呼び出しは
   無害のままである。
6. **ワークスペース帰属の完全な診断。** 集約された ACP スナップショットに、
   `workspaceId`、`workspaceCwd`、`primary` で装飾された追加的な
   接続診断が加わる。サマリーカウンターは変更されず、公開のプライマリ
   `registry` は互換性のため引き続き利用可能であり、デーモンの
   `detail=full` は集約された接続リストを読み取る。既存の接続上限は
   すべてのマウントが同じ設定された上限で構築されるため、
   引き続きマウントごとの制限である。

各契約は、本番変更の前に書かれたリグレッションテストで固定される。
検証には、フォーカスされた ACP、レート制限、デーモンステータス、
serve-server のスイートに加え、ビルド、型チェック、リント、
serve ファストパスのバンドルクロージャチェックが含まれる。

## Phase 3 への依存（未マージ）

Phase 4 はこれらの Phase 3 のシームを消費する。PR #6567 は
`CHANGES_REQUESTED` であるため、これらは_安定化予定_として扱う。
Phase 4 の実装は、マージされた Phase 3 にリベースしなければならない。

- `packages/cli/src/serve/workspace-route-runtime.ts`:
  - `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, selector)` —
    純粋関数で、`WorkspaceRuntime | undefined` を返す。
    **WS upgrade リスナーから再利用可能**（Open Questions 参照）。
  - `resolveWorkspaceRuntimeFromParam(registry, req, res, param)` — Express に
    バインド（`res.status().json()` を書き込む）。**HTTP ACP ルートには
    使用可能だが、WS upgrade パスには使用不可**（upgrade リスナーは
    生の `IncomingMessage` + `socket` のみを持ち、Express の `res` がない）。
  - `requireTrustedWorkspaceRuntime(runtime, res)` — Express にバインドされた
    信頼ゲートで、HTTP ACP ルートから再利用される。
  - `isPortableAbsolutePath` / `sendWorkspaceMismatch` — セレクターのパースと
    エラー形状のために再利用される。
- `server.ts` に登録されたランタイムごとの REST ハンドラー
  （`registerWorkspaceQualified{FileRead,FileWrite,Trust,Status,Permissions,Settings,Lifecycle,McpControl,Tools}Routes`）。
  ACP ディスパッチャーはこれらのサーフェスをミラーする。Phase 4 は
  そのランタイムごとの挙動が存在していることに依存する。
- `/capabilities` の `workspaces[]`（Phase 2a）。
  `packages/cli/src/serve/routes/capabilities.ts`（L79-84）で構築され、
  `packages/cli/src/serve/daemon-status.ts`（L432-437）にミラーリングされ、
  ランタイムごとの `id` / `cwd` / `primary` / `trusted` を持つ。
  機能フラグの宣言とその広告/トグル述語は
  `packages/cli/src/serve/capabilities.ts` にある。

## ベースライン：現在の ACP シーム（Phase 3 ツリー）

- `packages/cli/src/serve/acp-http/index.ts` の
  `mountAcpHttp(app, primaryBridge, opts)` は `server.ts`（L1226-1275）から
  1 回呼び出され、**すべてプライマリ**の入力を受け取る：`primaryBridge`、
  `primaryBoundWorkspace`、`primaryWorkspace`、
  `primaryRouteFileSystemFactory`、アプリ全体の `deviceFlowRegistry`、
  `primaryRuntime.clientMcpSenderRegistry`、`primaryRuntime.env`
  （音声の `extraWsRoute` 用）。
- マウントごとに 1 つのディスパッチャー：`mountAcpHttp` は単一の
  `AcpDispatcher` と単一の `ConnectionRegistry` を構築し、その `registry` が
  その単一レジストリであり、`attachServer` がちょうど 1 つの
  `httpServer.on('upgrade', ...)` リスナーをインストールする
  `AcpHttpHandle` を返す（index.ts L1536、L1555）。`dispose` は
  その 1 つのリスナーを削除し、その 1 つのレジストリをクローズする
  （index.ts L1543-1553）。
- **単一の WebSocket upgrade リスナー**（index.ts `setupWebSocket`、
  upgrade ハンドラーは L903-1045）。`listen()` の後に
  `AcpHttpHandle.attachServer(server)` を介して 1 回インストールされる。
  これは：
  - upgrade URL をパースし、
  - `opts.path`（`/acp`）でも `/cdp` でも `extraWsRoutes` エントリでもない
    パスをすべて拒否する — 未知のパスでは `socket.destroy()`
    （index.ts L935-939）、
  - **すべての**パスに対して共有セキュリティチェック（ループバック、
    ホスト許可リスト、CSRF/origin、ベアラートークン）を実行し、
  - その後分岐する：`/cdp` -> `attachCdpClient`；`extraRoute` ->
    `onConnection`；それ以外は ACP initialize ハンドシェイク。
  - L328-337 の doc コメントは明示的である：このリスナーは未知のパスを
    破壊するため、2 つ目の `'upgrade'` リスナーは共存できない。Phase 4 は
    この 1 つのリスナーを拡張しなければならず、別のものを追加してはならない。
- `AcpDispatcher`（dispatch.ts L644-656）はすでにコンストラクタで
  ワークスペースにバインドされている：`bridge`、`boundWorkspace`、
  `workspace`、`workspaceRememberLane`、`fsFactory?`、
  `deviceFlowRegistry?`、`sessionShellCommandEnabled`、`registry?`、
  `archiveCoordinator`。これが提供するすべてのミラーされたワークスペース
  メソッドはこれらのフィールドを読み取るため、ディスパッチャーを
  ランタイムにバインドすると、ファイル / パーミッション / 設定 / 信頼 /
  ツール / mcp / メモリ / agents / 認証が自動的にそのランタイムに
  スコープされる。
- これらのディスパッチャー依存のうち 2 つは、現在プライマリにバインドされた
  シングルインスタンスである：
  `workspaceRememberLane = new WorkspaceRememberTaskLane(primaryBridge)`
  （server.ts L816）と `archiveCoordinator = new SessionArchiveCoordinator()`
  （server.ts L596）。`sessionShellCommandEnabled` はグローバルポリシーで
  あり、共有しても安全である。
- 一貫性チェックはすでに存在する：`parseRequestedWorkspace`
  （dispatch.ts L694-697）は、リクエストの `workspaceCwd` が
  `this.boundWorkspace` と等しくない場合に `WorkspaceMismatchError` を
  スローする。エラーは `INVALID_PARAMS` にマップされる（L577）。
- `WorkspaceRuntime`（workspace-registry.ts L28-38）はランタイムごとに
  `clientMcpSenderRegistry` を持つが、**`deviceFlowRegistry` フィールドは
  ない** — デバイスフローは依然としてアプリ全体である
  （server.ts L609 の `setupDeviceFlowRegistry({ app, bridge })`、
  プライマリーブブリッジにバインド）。

## アーキテクチャ：ランタイムごとの ACP マウント

オプション B を維持する：1 つのデーモン、N 個の独立したワークスペース
ランタイム。ACP については：

- 各登録済みランタイムは、独自の `AcpDispatcher` + `ConnectionRegistry` +
  逆方向 MCP プロバイダーファクトリを持ち、すべてそのランタイムの
  `bridge` / `workspace` / `routeFileSystemFactory` /
  `clientMcpSenderRegistry` / `env` にバインドされる。
  すべてのディスパッチャーは同じデーモン全体のデバイスフローレジストリを
  受け取る。
- レガシーの `/acp` はプライマリランタイムのディスパッチャーに
  バインドされたままである（ワイヤー挙動は変更なし）。
- 新しい `/workspaces/:workspace/acp` は解決されたランタイムの
  ディスパッチャーにバインドされる。
- **不変条件：`mountAcpHttp` は引き続きちょうど 1 回呼び出され**、
  ちょうど 1 つの `httpServer.on('upgrade', ...)` リスナーを
  インストールする。これは「単一ブリッジ + opts」から、
  `WorkspaceRegistry`（および共有の非ワークスペース関心事：トークン、
  allowedOrigins、ホスト名、`checkRate`、`sessionShellCommandEnabled`、
  `cdpTunnelRegistry`）を受け付けるように変わる。内部的には
  `Map<workspaceId, RuntimeAcpMount>` を構築する。プライマリエントリは
  引き続きレガシーの `/acp` パスからアドレス指定可能である。
- 各 `RuntimeAcpMount` は、そのランタイム自身の `bridge`、`workspace`、
  `routeFileSystemFactory`、`clientMcpSenderRegistry`、`env`、新しい
  ランタイムごとの `WorkspaceRememberTaskLane(runtime.bridge)`、
  その `AcpDispatcher`、その `ConnectionRegistry` で構築される。
  デーモン全体のデバイスフローレジストリ、`archiveCoordinator`、
  `sessionShellCommandEnabled` は共有される。
- 4 つのディスパッチエントリポイントすべてが、プライマリではなく
  解決されたランタイムのマウントを選択しなければならない：複数形パスの
  `POST`、`GET`（SSE）、`DELETE`（Express、
  `resolveWorkspaceRuntimeFromParam` 経由。現在はそれぞれが index.ts
  L533/L675/L849 で単一のディスパッチャーをクロージャしている）、
  および WS upgrade 分岐（下記）。レガシーの
  `/acp` POST/GET/DELETE/upgrade は引き続きプライマリにディスパッチする。
- `AcpHttpHandle` は単一の `registry` から、すべてのランタイムの
  ディスパッチャー + `ConnectionRegistry` を所有するように
  拡張しなければならない。`dispose` はそれらすべてをクローズし、
  単一の upgrade リスナーを削除する。
- セッションライフサイクル：複数形マウントでの ACP `session/new` /
  `load` / `resume` は、Phase 2b の `WorkspaceSessionOwnerIndex` に
  供給するのと同じブリッジライフサイクルの `register` / `remove`
  コールバックを発火しなければならない（workspace-registry.ts
  L48-119）。`/workspaces/B/acp` 経由で作成されたセッションは、
  REST の所有者ルーティング読み取り（context、stats など）から
  発見可能でなければならず、その逆も同様である。Phase 2b はすでに
  このインデックスのスコープを「REST と後続の ACP ディスパッチャー」を
  カバーすると定めていた。Phase 4 は ACP 側が実際に接続される場所である。

## WebSocket upgrade のディスパッチ（コア設計）

upgrade リスナーは ACP ルーティングが Express 主導でない唯一の場所であり、
明示的なパス処理が必要である。

- 共有セキュリティチェック（ループバック / ホスト許可リスト / CSRF /
  ベアラー）はそのまま維持し、ワークスペース解決の前に一様に適用する。
- パス分類を拡張する。現在は：
  `pathname === '/acp' | '/cdp' | extraRoute`。Phase 4 は
  `/workspaces/:workspace/acp` の分岐を追加する：
  1. プレフィックスをマッチし、生の `:workspace` セレクターセグメントを
     抽出する。
  2. 純粋関数
     `resolveRegisteredWorkspaceRuntimeByPathSelector(registry, decodeURIComponent(selector))`
     で解決する（id 優先、次にエンコードされた正規 cwd、REST の
     リゾルバーと一致）。
  3. マッチなしの場合：400 クラスのクローズで upgrade を拒否する
     （`socket.write('HTTP/1.1 400 ...')` + `destroy()`）。REST の
     `workspace_mismatch` をミラーする。プライマリへのフォールバックはしない。
  4. マッチした場合：解決されたランタイムのディスパッチャー +
     `ConnectionRegistry` に対して ACP initialize ハンドシェイクを実行する
     （プライマリのものではない）。
- 逆方向の `/cdp` と音声の `extraWsRoutes` は Phase 4 ではプライマリバインドの
  ままである（音声は 4b）。`/cdp` 分岐は変更なし。
- レガシーの `/acp` upgrade は引き続きプライマリのディスパッチャーに
  バインドする。
- エンコードされた cwd セレクターの `%2F`：デーモンは生の upgrade URL を
  自身でパースするため（`new URL(req.url, ...)`）、Express のパスデコードの
  影響を受けないが、リバースプロキシは依然として `%2F` を正規化する
  可能性がある。プロキシデプロイでは WS に `id` ベースのセレクターを
  推奨する（Phase 2b/3 の REST と同じガイダンス）。HTTP の複数形ルートは
  代わりに `resolveWorkspaceRuntimeFromParam` を再利用し、
  これは `req.params` を読み取る（Express は 1 回デコードする）ため、
  Phase 3 のエンコード済みセレクター処理を追加コストなしに継承する。
- 可観測性：WS upgrade パスとその ACP ディスパッチは Express ミドルウェアを
  バイパスするため、デーモンのテレメトリ/ログはここで解決された
  ワークスペースを明示的にスタンプしなければならない
  （`checkRate` が `opts` を通してスレッドされるのと同じ理由）。
  Phase 1 のリクエスト時のワークスペースハッシュ化は Express ルートのみを
  カバーする。

## ランタイムごとのデバイスフローレジストリ（置き換え済み — 「体系的な手直し」の軸 4 を参照）

> **置き換え済み。** このセクションは手直し前の設計（ランタイムごとの
> デバイスフローレジストリ）である。レビューで、これがセカンダリの
> マウントを未認証のままにすることが判明したため、出荷された実装は
> 代わりに、ベストエフォートのイベントシンクファンアウトを伴う
> 単一のデーモン全体レジストリをすべてのマウントで共有する —
> 上記の「体系的な手直し」の軸 4 を参照。以下のサブセクションは
> 設計史の文脈としてのみ保持されており、出荷された挙動を
> 記述するものではない。

デバイスフローは、依然としてアプリ全体であり変更が必要な、
唯一のミラーされたサーフェスである。

- `WorkspaceRuntime` に `deviceFlowRegistry` を追加する（または
  `mountAcpHttp` 内でランタイムごとに 1 つ構築する）。各ランタイムの
  ディスパッチャーは独自のレジストリを受け取る。
- `setupDeviceFlowRegistry` は、プライマリーブブリッジに対して 1 回ではなく、
  ランタイムごとに（そのランタイムのブリッジ/環境にバインドして）
  呼び出さなければならない。
- ワークスペース修飾の認証ルート/メソッド
  （`GET/DELETE /workspaces/:workspace/auth/device-flow/:id` と ACP の
  `_qwen/workspace/auth/device_flow/*` メソッド）は、ターゲットランタイムの
  レジストリを解決し、別のワークスペースに属するフローを拒否/
  非表示にしなければならない。
- シャットダウンは、`app.locals.deviceFlowRegistry` だけでなく、
  すべてのランタイムのレジストリを dispose しなければならない。
- 認証プロバイダーのインストールコールバックは、すでにディスパッチャー内で
  `boundWorkspace` スコープである。ランタイムごとのディスパッチャーにより、
  これが自動的に正しくなる。レガシーのプライマリ認証ルートは
  引き続きプライマリに書き込む。

## ディスパッチャーのミラーサーフェス（ランタイムバインディング）

逆方向の `/acp` WS は大規模な REST サーフェスをミラーする
（index.ts の `WS_READ_METHODS` L186-219 と dispatch.ts のベンダーメソッド）：
ファイルの read/list/glob/stat、ワークスペースの mcp / skills / providers /
env / preflight / trust / permissions / voice / tools / agents / memory /
auth、セッショングループ、setup-github。これらはすべてディスパッチャーの
コンストラクタフィールドを読み取るため、ディスパッチャーをランタイムに
バインドすると、追加コストなしでそれらがスコープされる。Phase 4 は
これらを再実装**しない**。各ランタイムのディスパッチャーがそのランタイムの
依存関係で構築されることを保証するのみである。そのセットには
ランタイムごとの `deviceFlowRegistry` と `WorkspaceRememberTaskLane` が
明示的に含まれる：どちらかがプライマリのシングルトンのままなら、
非プライマリの `_qwen/workspace/memory/remember` と `auth/device_flow` の
呼び出しは、暗黙的にプライマリーブブリッジに対して実行されてしまう。

一貫性の保証：各マウントされたディスパッチャーはランタイムにバインドされ、
`parseRequestedWorkspace` はリクエストの `workspaceCwd` が
`boundWorkspace` と異なる場合にすでに `WorkspaceMismatchError` を
スローするため、`/workspaces/A/acp` に接続してパラメータに
`workspaceCwd: B` を送るクライアントは拒否される。Phase 4 は
これをアサートするテストを追加し、同じガードが `session/new` を
カバーすることを確認すべきである（`parseOptionalWorkspaceCwd`、
dispatch.ts L1059）。

## 逆方向 MCP / CDP の分離

- 逆方向ツールチャネル：`clientMcpProviderFactory` は現在
  `primaryRuntime.clientMcpSenderRegistry` + `primaryBridge` を
  クロージャしている（server.ts L1252-1257）。ランタイムごとのマウントは、
  _解決されたランタイムの_ `clientMcpSenderRegistry` + `bridge` から
  ファクトリを構築するため、`/workspaces/B/acp` での WS 接続は
  クライアントホストの MCP サーバーを B のランタイムにのみ登録する。
- 接続ごとの `ClientMcpWsConnection` と `cdpEndpoint` は接続ごとのまま。
  単に所有するランタイムのディスパッチャーにアタッチされる。
- CDP トンネル：`cdpTunnelRegistry` はプロセススコープであり、CDP ブリッジは
  `clientInfo.name === 'qwen-cdp-bridge'` の拡張 `/acp` 接続によって
  クレームされる。Phase 4 は実用的なデフォルトとして、CDP のクレームを
  レガシーの `/acp`（プライマリ）に維持する。ワークスペーススコープの
  CDP は、ここで解決するのではなく Open Question として提示する。
  単一のループバック puppeteer クライアント + 1 つの `/cdp` エンドポイントは、
  N 個のランタイムにきれいにマップされないからである。具体的には、
  非プライマリの `RuntimeAcpMount` は `cdpTunnelOverWs` / `/cdp` 分岐と
  `chrome-devtools` のランタイム MCP 登録をオフのままにしなければならない。
  これらを接続するのはプライマリのマウントのみである。

## 信頼ゲート

- 信頼されていない登録済みワークスペースは引き続き可視/読み取り専用だが、
  子プロセスを spawn してはならない。`/workspaces/:workspace/acp` では、
  所有権を付与する操作（`session/new`、`session/load`、`session/resume`。
  dispatch.ts の `CONN_ROUTED_METHODS` L239-243）は
  `untrusted_workspace` エラーで拒否しなければならず、spawn しない。
  これは `routes/session-runtime.ts`（L39-53）と `routes/session.ts`
  （セッションの create/load/resume の信頼ゲートと
  `session_workspace_conflict`）にすでに実装されている REST の 403
  `untrusted_workspace` セマンティクスと一致する。
- HTTP ACP ルートには、Phase 3 が `requireTrustedWorkspaceRuntime` を
  通して公開する信頼の判定を再利用する。WS パスでは、同等のチェックが
  ハンドシェイクがセッションを付与する前に、解決されたランタイムの
  `trusted` フラグに対して実行される。
- 起動時固定の信頼は Phase 2a のベースラインである。ランタイムの信頼の
  反転（取り消し時にワークスペースの ACP 子プロセスを drain/stop し、
  そのセッションインデックスをクリアする）は、どの信頼変更フェーズが
  投入されてもそれに整合させ、ここでは再実装しない。

## ケイパビリティと Web Shell ピッカー

- `packages/cli/src/serve/capabilities.ts` に ACP の機能フラグ
  （例：`workspace_qualified_acp`）を追加する（フラグ宣言 +
  広告/トグル述語）。複数のランタイムが登録され、ACP が有効な場合のみ
  広告する（capabilities.ts L408-409 の `multi_workspace_sessions` の
  ゲーティングをミラーする）。Phase 4 が複数の PR にまたがる場合、
  完全な複数形 ACP ループ（HTTP + WS + デバイスフロー + 所有者インデックスの
  接続）が完了するまでタグを広告しない。クライアントが半分しか
  接続されていないサーフェスに対して `/workspaces/:id/acp` URL を
  構築しないようにするためである（Phase 2a の機能ゲートと同じ
  半有効化ガードの哲学）。
  `workspace_qualified_rest_core` の注記（L264-271）を更新する。
  現在は「このフェーズでは ACP/WebSocket、認証、音声、拡張機能は
  既存のプライマリワークスペースルートにとどまる」となっている。
- タグの追加は `capabilities.ts` だけでは完結しない。同期が必要：
  `routes/capabilities.ts` の `/capabilities` レスポンスビルダー、
  SDK のケイパビリティ型
  （`packages/sdk-typescript/src/daemon/types.ts`）、CLI の serve 型
  （`packages/cli/src/serve/types.ts`）、`server.test.ts` の
  機能セットアサーション（L376-381）。これは必要な Phase 4 の
  作業であり、任意ではない。
- `workspaces[]` はすでに存在する（Phase 2a）。
  `routes/capabilities.ts`（L79-84）と `daemon-status.ts`（L432-437）で、
  ランタイムごとの `id` / `cwd` / `primary` / `trusted` を持って構築される。
  Web Shell はこれを読み取り、`/workspaces/:id/acp` の接続 URL を構築する。
  ピッカーは信頼されていないエントリを無効化（または読み取り専用マーク）する。
- SDK の `DaemonClient`（Phase 3 で追加）はすでにセッションルーティングに
  `caps.workspaces[].cwd` を読み取っている。ワークスペース修飾の
  ACP 接続ヘルパーは自然な拡張である。上記のケイパビリティ型の同期は
  必須であり、接続ヘルパー自体はその後でよい。

## 失敗パス

- `workspace_mismatch`: 未知の WS/HTTP セレクター -> 400 クラスの拒否。
  プライマリには決してフォールバックしない。
- `untrusted_workspace`: 信頼されていないランタイムへの所有権を付与する
  ACP 操作 -> 拒否、spawn なし。
- `workspaceCwd` パラメータの不一致：`WorkspaceMismatchError` ->
  `INVALID_PARAMS`（すでに接続済み）。
- 子プロセスのクラッシュ：所有するランタイムに分離される。
  他のランタイムのディスパッチャーと接続は影響を受けない
  （単一デーモンの故障半径が大きいことは文書化された既知の制限である）。
- 信頼の取り消し：信頼変更フェーズが投入されたとき、ランタイムの取り消しは
  その ACP 子プロセスを drain/stop し、セッションインデックスを
  クリアしなければならない。Phase 4 が保証するのは、ランタイムごとの
  ACP マウントが drain 可能であることのみであり、信頼の変更自体は
  追加しない。
- グローバルシャットダウン：すべてのランタイムの `ConnectionRegistry` を
  dispose し、その後、単一のデーモン全体のデバイスフローレジストリを
  1 回 dispose する。
- レート制限：ACP HTTP/WS の受け入れは、接続/セッションごとにキーされた
  `checkRate` を使用する（index.ts L627-641、L1175-1178）。複数形の
  マウントは 1 つのリミッターを共有する。キーはランタイム間で
  あいまいさがあってはならず、1 つのワークスペースが別のワークスペースの
  バジェットを枯渇させたりバイパスしたりできないようにする。
- キャパシティ：`maxConnections` はランタイムごとの
  `ConnectionRegistry` で強制されるため、ACP の総接続数は
  N x `maxConnections` にスケールする（ワークスペースごとのバジェットで、
  ワークスペースごとの `maxSessions` モデルと一致）。新規セッションの
  総量は、ブリッジシームでの Phase 2a の `maxTotalSessions` 受け入れに
  よって制限されたままであり、ACP のセッション作成はすでに
  そこを通過する。

## Non-goals（Phase 4b / 5）

- `/workspaces/:workspace/voice/stream` とワークスペースごとの音声設定（4b）。
- デーモン管理のチャネルワーカーのグループ化 / pidfile / ステータス（4b）。
- ワークスペースの動的な追加/削除と遅延ランタイム作成（5）。

## テスト戦略

- WS upgrade のディスパッチ：パス分類のユニットテスト —
  `/acp`（プライマリ）、`/workspaces/:id/acp`（解決済み）、
  未知のセレクター（拒否）、`%2F` エンコードされた cwd セレクター、
  および複数形パスでも共有セキュリティチェックが実行されること。
- ワークスペース間の分離：`/workspaces/A/acp` の接続は、B が所有する
  セッションを参照も駆動もできない。`session/list` とミラーされた
  読み取りは A のビューのみを返す。
- トランスポート間の所有権：`/workspaces/B/acp` 経由で作成されたセッションは、
  REST の所有者ルーティング読み取り（例：`GET /session/:id/stats`）と
  `resolveLiveSessionOwner` から解決可能であり、ACP の作成が
  所有者インデックスに供給されることを確認する。
- 一貫性：A に接続し、`workspaceCwd: B` を送信 ->
  `WorkspaceMismatchError`。
- 信頼ゲート：信頼されていないランタイムでの
  `session/new|load|resume` -> 拒否され、子プロセスは spawn されない。
- デバイスフロー：すべてのマウントがデーモン全体のレジストリに到達する。
  イベント公開はプライマリと信頼されたセカンダリのブリッジにファンアウトし、
  1 つの失敗したブリッジが他をブロックせず、シャットダウンは
  レジストリを 1 回 dispose する。
- 逆方向 MCP：`/workspaces/B/acp` での `mcp_register` は、B の
  `clientMcpSenderRegistry` と B のブリッジにのみ届く。
- レート制限：`/workspaces/A/acp` と `/workspaces/B/acp` の
  プロンプト/変更操作は独立して計測され、どちらも共有リミッターを
  バイパスできない。
- ケイパビリティ：`workspace_qualified_acp` はランタイムが複数ある
  場合のみ広告される。`workspaces[]` の形状は変更なし。

## Open questions / Phase 3 へのフィードバック

1. **`resolveRegisteredWorkspaceRuntimeByPathSelector` は純粋関数のままにする。**
   WS upgrade リスナーは Express にバインドされた
   `resolveWorkspaceRuntimeFromParam` を使用できない。Phase 4 は
   純粋リゾルバーが `req`/`res` の結合なしに保たれることに依存する。
   Phase 3 のレビューでそのシームが変わる場合、純粋な
   `(registry, selector) => runtime | undefined` のエントリポイントを
   維持すること。
2. **デバイスフローの所有権（解決済み）。** OAuth 認証情報は
   プロセス全体であるため、レジストリはデーモン全体のままにする。
   Phase 4 はそのレジストリをすべてのディスパッチャーと共有し、
   サニタイズされたイベントを信頼されたランタイムのブリッジに
   ファンアウトする。
3. **CDP トンネルのワークスペースごとモデル。** 1 つのループバック
   puppeteer クライアント + 1 つの `/cdp` エンドポイントは、N 個の
   ランタイムにきれいにマップされない。Phase 4 は CDP をプライマリに
   維持する。それが許容可能か確認するか、ワークスペース修飾の CDP の
   フォローアップをスコープすること。
4. **Voice の延期。** ACP ディスパッチャーはすでに
   `_qwen/workspace/voice` の読み取りを公開しているが、Phase 4b まで
   音声がプライマリのままであることを確認する。
5. **`archiveCoordinator` のスコープ。** 現在は単一の
   `SessionArchiveCoordinator` である（server.ts L596）。Phase 3 の
   ワークスペース修飾のアーカイブ/organization を踏まえて、
   ランタイム間で共有しても安全か確認するか、ランタイムごとにすること。
6. **レート制限キーの次元化。** ACP の複数形受け入れキーに明示的な
   ワークスペース次元が必要か、それとも接続/セッションごとのキーが
   すでにマウント間で一意かを決定する。
