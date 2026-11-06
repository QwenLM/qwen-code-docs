# デーモンモード (`qwen serve`)

Qwen Code を HTTP デーモンとして実行し、複数のクライアント（IDE プラグイン、Web UI、CI スクリプト、カスタム CLI）が HTTP + Server-Sent Events 経由でエージェントセッションを共有できるようにします。これにより、各クライアントが独自の子プロセスを起動する必要がなくなります。

> **ステータス:** 実験的機能です。このデーモンはローカルおよびリモートの Web Shell/API デプロイメントをサポートしています。ループバック以外に公開する前に、[認証](#authentication)と[デプロイメントの脅威モデル](#default-deployment-threat-model)を確認してください。

## 提供される機能

- **組み込み Web Shell UI** — `qwen serve` は、ブラウザベースの Web Shell をルート（`http://127.0.0.1:4170/`）でそのまま提供します。`qwen serve --open` を実行すると、ブラウザで自動的に起動します。API と同じオリジンで提供されるため、2 つ目のポートやリバースプロキシは不要です。API のみのデーモンとして実行する場合は `--no-web` を渡します。

  サイドバーでは、セッションなしでリストが読み込まれた場合、**固定済み**と同様に **ワークスペースなしのセッション** が非表示になります。グループが非表示になっている場合は、メインの **新規セッション** ボタンを使用し、コンポーザーで **ワークスペースなし** を選択して会話を開始してください。

- **プライマリ ACP 子プロセス 1 つ plus 信頼されたセカンダリごとにオンデマンド 1 つ、多数のクライアント** — 本番環境ではプライマリブリッジの事前起動を試み、失敗時は初回使用時にリトライします。信頼されたセカンダリランタイムはオンデマンドで独自の子プロセスを起動し、信頼されていないセカンダリは子プロセスを起動しません。デフォルトの `sessionScope: 'single'` では、同じワークスペースをターゲットにするクライアントが 1 つの ACP セッションを共有し、同じ会話、ファイルの差分、権限プロンプトでコラボレーションします。
- **再接続対応ストリーミング** — `Last-Event-ID` を使用した SSE 再接続により、クライアントは接続が切断されても、リングのリプレイウィンドウ内で、中断した場所から正確に再開できます。
- **ページ化された永続トランスクリプト** — `GET /session/:id/transcript` は、クライアントをアタッチしたりライブ SSE リプレイウィンドウを変更したりすることなく、完全なアクティブなディスク上のトランスクリプトをリプレイページとして返します。
- **初回応答者による権限管理** — エージェントがツールの実行権限を要求すると、接続されているすべてのクライアントにリクエストが表示され、最初に回答したクライアントの操作が採用されます。
- **1 つのデーモン、1 つ以上のワークスペース** — `--workspace` を繰り返して、1 つのリスナーの下に隔離されたワークスペースランタイムを登録します。最初のワークスペースがプライマリであり、`cwd` を省略したリクエストのデフォルトとなります。
- **実験的なデーモン管理チャネル** — `qwen serve --channel <name>` で開始するか、チャネルなしで開始して後で `qwen channel set` で選択します。ワーカーはデーモンのライフサイクルに属する別のプロセスです。それらの選択は、デーモンを再起動せずにクエリ、置換、リロード、停止ができます。
- **リモートランタイム制御** — セッションの承認モードの変更（`POST /session/:id/approval-mode`）、ワークスペースごとのツールの切り替え（`POST /workspace/tools/:name/enable`）またはロードされたスキル（`POST /workspace/skills/:name/enable`）、空の `QWEN.md` のスキャフォールディング（`POST /workspace/init`、メカニカルな操作のみ — モデルは呼び出しません。AI による記入には `POST /session/:id/prompt` を続けて実行します）、バジェット事前チェック付きの単一 MCP サーバーの再起動（`POST /workspace/mcp/:server/restart`）、またはデーモンを再起動せずにランタイムで MCP サーバーの追加 / 削除（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）。デフォルトのトークンなしループバックリスナーはこれらすべてを使用できます。厳格なワークスペースの変更は、他のデプロイモードでは追加でオペレーター資格情報を必要とします。
- **セッションの要約**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) のフォローアップ）— アクティブなセッションの「どこまで進んだか」を示す 1 文の要約を取得します（`POST /session/:id/recap`）。コアの `generateSessionRecap` をラップし、高速モデルに対するサイドクエリとして実行します。メインのチャット履歴も SSE ストリームも汚染しません。非厳格ゲート（`/prompt` と同じ姿勢）。SDK ヘルパー: `client.recapSession(sessionId)`。
  - **既知の制限 — トークンコストの増幅:** このルートは純粋なコストエンドポイントであり（呼び出しごとに LLM サイドクエリが実行され、状態のメリットはありません）、v1 にはルートごとのレート制限がありません。トークンなしのループバックデフォルトでは、バグのあるクライアントや悪意のあるローカルクライアントがスパムを送信してトークンを消費する可能性があります。デーモンを公開する前に、共有開発ホストで `--token`（およびオプションで `--require-auth`）を設定してください。
  - **同時要約の安全性:** 同じセッションに対する 2 つの同時 `/recap` 呼び出しは、2 つの独立したサイドクエリを実行します。`generateSessionRecap` は `GeminiClient.getChat().getHistory()` 経由でチャット履歴のスナップショットを読み取り、それを別の `BaseLlmClient.generateText` 呼び出し（`runSideQuery` 経由）に渡します。セッションの `GeminiChat` に追加したり変更したりすることはありません。調整なしに複数のクライアントから安全に呼び出せます。

## デプロイメントとセキュリティに関する注意事項 [#deployment-and-security-notes]

- **ループバックはデフォルトで信頼されています** — `127.0.0.1:4170` はベアラートークン認証なしで起動し、そこにアクセスできるすべてのローカルプロセスは、デーモンのユーザーとしてのコード実行を含む完全な API 権限を受け取ります。共有ホストまたは信頼できないホストでは、`--require-auth` を使用して安定した `QWEN_SERVER_TOKEN` を利用してください。
- **ループバック以外のリスナーは常にベアラートークンを要求します** — 独自のトークンを提供するか、起動時に表示される一時的なトークンを使用してください。生成されたトークンは再起動時にローテーションされるため、再利用可能なクライアントには安定したトークンが必要です。HTTP は暗号化されていません。信頼できないネットワークを越境する前に TLS を設定してください。
- **バックグラウンド起動には2つのパスがあります** — 組み込みのローカルライフサイクル管理には `qwen daemon start` を使用するか、サービスマネージャーによる監視や再起動後の起動が必要な場合は [systemd / launchd / tmux / nohup テンプレート](./qwen-serve-deploy-local.md) を使用してください。
- **トークンの永続化はオプトインです** — `qwen daemon start --save-token` は明示的に提供されたベアラートークンを `qwen daemon token` のための所有者限定サイドカーに保存します。通常の `qwen serve` と生成されたトークンはそのサイドカーを使用しません。[ローカルデーモンの確認と制御](#inspect-and-control-a-local-daemon)を参照してください。
- **マルチワークスペースは単一オペレーターです** — 登録されたワークスペースは、デーモンのベアラートークン、リスナー、クォータ、プロセス障害境界を共有します。独立したユーザーやセキュリティプリンシパルの場合は、個別のデーモンと外部オーケストレーターを使用してください。[マルチセッション & マルチワークスペースデプロイメント](#multi-session--multi-workspace-deployment)を参照してください。

Stage 1 で修正しない内容の詳細な列挙（シングルホストのセッション状態変更モデル + 各ワークスペースランタイム内で 1 つの ACP 子プロセスを共有する N 個の並列セッション）については、以下の [Stage 1 のスコープ境界](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15)を参照してください。

## クイックスタート

### リモート Web Shell とスマートフォンからのアクセス [#remote-web-shell-and-phone-access]

別のマシンから実行中のローカルデーモンに接続するには、その Web Shell を開き、**設定 → 接続 → リモート接続を許可** に移動します。リモートアクセスはデフォルトでオフになっています。これをオンにし、プロンプトが表示された場合はネットワークインターフェースを選択し、表示されたアドレスとベアラートークンを他の Web Shell の接続フォームにコピーします。追加のターミナルコマンドやデーモンの再起動は不要です。

リモートリスナーは、ローカルリスナーと同じワークスペースとセッションを提供します。まず、選択したインターフェース上で同じ数値ポートを使用します。そのアドレスが占有されている場合、詳細設定で異なるポートを選択してください。Qwen はポートを黙って変更したり、他のサービスを停止したりしません。任意のポートにおける `localhost` と `127.0.0.1` の HTTP ページが許可されます。詳細設定では、HTTPS ページを含む追加の正確なブラウザオリジンを受け入れます。

アクセスをオフにするかトークンをリセットすると、既存のリモート接続は無効化されますが、ローカルクライアントとデーモン所有の実行中タスクは継続します。再度有効にすると新しいトークンが生成されます。この設定はデーモンの再起動間で永続化されません。トークンは承認済みのローカルオペレーターのみが利用できます。明示的な起動/プロキシ設定によって既に公開されているプライマリリスナーは別個に表示され、このスイッチによって閉じられることはありません。

アドレスはネットワークおよびファイアウォールを通じて到達可能である必要があります。HTTP ではトークンは暗号化されないため、信頼できるネットワークを使用するか HTTPS を構成してください。HTTPS ページはリモート HTTP エンドポイントに接続できません。UI は認証、ポリシー、混合コンテンツエラーを区別しますが、一般的なブラウザネットワークエラーでは CORS、証明書、接続失敗を確実に区別することはできません。

```bash
qwen serve --hostname 0.0.0.0
```

`--token` と `QWEN_SERVER_TOKEN` のどちらも指定されていない場合、ループバック以外のリスナーは 128 ビットの一時的なベアラートークン（URL セーフな 22 文字）を生成し、起動時に一度だけ表示します。明示的なフラグ値は環境変数より優先されます。ループバック以外のバインドでは、明示的に空の値を指定しても安全側に倒れ、起動を拒否しますが、ループバックでは `QWEN_SERVER_TOKEN` をシャドウし、`--require-auth` で説明されている信頼されたトークンなしモードのままバインドされます。デフォルトのループバック動作は変更されていません。

ワイルドカードバインドの場合、起動時に実際のインターフェースからトークン不要のローカル/ネットワークURLを一覧表示し、さらに生成されたトークンまたは対話型ターミナルでの独自トークン用に、プライベートLANアドレス1つに対する**秘密情報を含むQRコード**を表示します。ワイルドカード列挙は、Local Controlが広告する同じプライベート/リンクローカルLANの範囲（RFC 1918 / RFC 3927 IPv4、およびデュアルスタックバインド時のfc00::/7 ULA IPv6）のみをリストします。VPNアダプターやコンテナブリッジを除外するためのソフトウェアインターフェースフィルターは**名前ヒューリスティック**（[#9158](https://github.com/QwenLM/qwen-code/issues/9158)）であり保証ではないため、k8sオーバーレイ名（`cbr0`, `cali*`, `vxlan.*`）が通過することがあります。明示的な非ループバックバインドの場合は、選択したアドレス（ルーティング可能なものも含む）を正確に表示し、QRコード化します。コンテナ内では、列挙されたアドレスはコンテナ自身のインターフェースであるため、公開ポートに到達するにはホストアドレスに置き換える必要があります。ptyが割り当てられたコンテナは対話型ターミナルと見なされるため、そのログには秘密情報が含まれます。QRコードをスキャンすると、URLフラグメントにベアラーを含めた組み込みWeb Shellが開きます。ブラウザはURLから認証情報を削除し、タブごとの`sessionStorage`に保持します。代わりに、印刷されたURLを開いてトークンを入力することもできます。認証情報が不足している場合や期限切れの場合は、再試行フォームが表示されます。生成されたトークンは再起動時にローテーションされます。`--no-web`はQRコードを省略し、パイプ/リダイレクトされたstdoutはQRコード内で安定したオペレーター用トークンを再公開しません。この場合は、`--token-qr`を指定した抑制ヒントとアドレスのみのQRコード（Web Shellは到着時にトークンを要求します）を表示する代わりに、ユーザー、システム、またはシステムデフォルトの設定で`--token-qr`を渡すか`serve.tokenQr`を設定することで、完全なトークン付きQRコードを表示できます。`--no-token-qr`は、対話型ターミナルと生成されたトークン（独自のプレーンテキスト行として引き続き表示されます）を含むすべてのクイックスタートパスにおいて、その実行中のクイックスタートトークンQRコードを抑制しますが、Local ControlペアリングQRコードには適用されず、これは`--local-control`によって設計上表示されます。QRコードを表示できない場所（`--no-web`、解決されていないWeb Shellアセット、またはループバックバインド）でQRコードを要求した場合、何もせず黙殺するのではなくstderrにその旨を表示します。アドレスはファイアウォールやNAT経由の到達可能性を示唆するものではなく、公開IPは自動的に検出されません。

組み込みWeb Shellの同一オリジン**HTTP**リクエストは`--allow-origin`なしで動作しますが、他のブラウザオリジンではその許可リストが必要であり、`Origin: null`は依然として拒否されます。WebSocketベースの機能（ターミナル、音声）やTLS終端リバースプロキシを通じてデーモンに到達するブラウザには、明示的な`--allow-origin <origin>`エントリが必要です。転送ヘッダーは同一オリジンを確立するために信頼されることはありません。`Host`ヘッダーを書き換える平文HTTP中間プロキシも同様です。nginxのデフォルト`proxy_set_header Host $proxy_host`とk8s Ingressの両方により、デーモンはブラウザの`Origin`と一致しなくなった`Host`を見ることになります。ブラウザが実際に目にするオリジンに対して`--allow-origin <origin>`を渡すか、プロキシが`Host`をそのまま転送するように設定してください。**非ループバック**バインドでは、ポート変換のみ（`docker -p 8080:4170`）では何も必要ありません。同一オリジンチェックは転送された`Host`と比較して`Origin`を確認し、リッスンポートを参照しないためです。デフォルトの**ループバック**バインドではそうではありません。DNSリバーディングHost許可リストはデーモンの独自ポートのみを受け入れるため、ポート変換トンネル（`ssh -L 8080:localhost:4170`）はシェルドキュメントを含むすべてのリクエストで`403 Invalid Host header`とともに拒否され、`--allow-origin`でオーバーライドすることはできません。同じポートを転送するか（`ssh -L 4170:localhost:4170`）、非ループバックにバインドしてください。**モバイルアクセス**ペアリングQRコードは、それを要求したリクエストのスキームと`Host`から構築されます（転送ヘッダーからは決して構築されません）。そのため、TLS終端プロキシの背後ではデーモン自身の`http`スキームを維持し、交換プロセスは招待が発行されたオリジンに紐付けられているため、電話機の`https`ページを拒否します。デーモンの直接アドレスを閲覧しながらペアリングするか、代わりに電話機でトークンを入力してください。ベアラーはコード実行を含む完全なデーモンAPI権限を付与します。ターミナルトークンとQRキャプチャは秘密情報として扱ってください。HTTPは暗号化されていません。既存の`--tls-cert`および`--tls-key`オプションを使用すると、独自証明書によるHTTPSを提供できます。

自分のマシン上のWeb Shellからリモートデーモンを使用するには、接続画面または**Daemon Status**でリモートデーモンのオリジン（例：`https://dev-box.example:4170`）とそのベアラートークンを入力します。リモートデーモンは、ローカルページのオリジンを許可する必要があります。固定ポートのブラウザタブはそのオリジンをリストできます（例：`qwen serve --hostname 0.0.0.0 --allow-origin http://localhost:4170`）。ターミナルのWebSocketにもそのエントリが必要です。**デスクトップクライアント**は異なります。独自のシェルを`http://127.0.0.1:<OS-assigned port>`から読み込むため、ページオリジンは起動ごとに変わり、固定エントリでは一致しません。REST APIとターミナル/音声WebSocketの両方について、まさにそのループバックホスト上の任意のポートを許可する`--allow-origin http://127.0.0.1:*`で、そのオリジンクラスを明示的にオプトインしてください。`*`よりもこちらを優先してください。`*`はすべてのブラウザオリジンを許可し、WebSocketゲートをカバーせずにRESTのみを対象とするためです。トークンはタブごとおよびデーモンオリジンごとに保持され、別のデーモン用に再利用されることはありません。サイドバーは一度に選択された1つのデーモンのワークスペースをリストします。デーモンを切り替えるとページがリロードされ、ローカルとリモートのプロジェクトリストは結合されません。既存の**Add workspace**フォームを使用して、選択されたデーモン上の絶対パスを登録してください。`?daemon=`がこのブラウザが以前に接続していないオリジンを指しているリンクは、接続画面で確認するまで連絡されません。クロスオリジン接続では、スタンドアロンまたは埋め込みWeb Shellのいずれにおいても、ブラウザローカルファイルブリッジは提供されません。HTTPSページはHTTPデーモンに接続できないため、信頼できるネットワークの外側では両方をHTTPSで提供してください。

### 1. デーモンを開始します（ループバック、認証なし）

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: trusted loopback mode; local callers have full API access without bearer authentication, including code execution as the daemon user. Use --require-auth with QWEN_SERVER_TOKEN on shared or untrusted hosts.
```

デフォルトのバインドは `127.0.0.1:4170` です。ベアラ認証は**オフ**であり、プライマリリスナーは信頼されているため、ポートにアクセスできるローカルプロセスはデーモンユーザーとしてコードの実行を含むフルオペレーター API を使用できます。ルート固有のワークスペース信頼、セッション所有権、`X-Qwen-Client-Id`、権限、機能、検証、およびリソースチェックは引き続き適用されます。デーモンは現在の作業ディレクトリをプライマリワークスペースとして登録します。絶対パスの `--workspace /path/to/dir` でオーバーライドし、フラグを繰り返して追加の隔離されたランタイムを登録します。

API専用デーモンを使用する場合、Web Shellを無効にします。セッション、プロンプト、ワークスペース、権限、SSEルートは変更されませんが、Web Shellにバインドされている部分は一緒に無効になります。Local Controlの有効化はすべてのプラットフォームでフェイルクローズとなり、`/live/*`ルート（macOS上で`QWEN_SERVE_LIVE_NATIVE_HOST=1`がある場合は`/live/host` WebSocketも）は登録されません。

```bash
qwen serve --no-web
```

**Web Shell UI を開きます。** `http://127.0.0.1:4170/` にアクセスするか（または `qwen serve --open` でデーモンを起動して自動的に開きます）、ブラウザ全体のターミナル（チャット、差分、コミット履歴、ツール呼び出し、権限プロンプト）を表示します。UI は API と同じオリジンのデーモンルートで提供されます。このガイドの残りの部分では生の HTTP を使用するため、API に対して直接スクリプトを実行できます。

トークンを手動で作成せずに認証済みのシングルユーザー起動を行うには、明示的にオプトインします。

```bash
qwen serve --open-with-auth
```

このループバックのみのモードは、`--token` も `QWEN_SERVER_TOKEN` もトークンを提供しない場合に 256 ビットの Bearer トークンを生成し、それを開いた Web Shell に `#token=` URL フラグメントとして渡します。シェルはフラグメントを除去し、そのタブの `sessionStorage` に資格情報を保持します。リロードは機能しますが、タブを閉じるかデーモンを再起動すると資格情報は失われます。CI、SSH、または自動オープンが利用できない他の環境では、デーモンが起動してフラグメント URL を出力するため、手動で開きます。出力される URL にはシークレットが含まれます。

このフラグはデフォルトオフで、ブラウザを開く動作を含み、Web Shell、ビルド済みの Web Shell アセット、およびループバックバインドを必要とします。素の `qwen serve --open` はループバックではトークンなしのままです。認証付きオープンモードでは、通常の API ルートは Bearer なしの他のローカルクライアントを拒否します。静的 Web Shell アセットとループバックの `/health` は、`--require-auth` も設定されていない限り、既存の事前認証動作を保持します。複数のクライアントや再度開ける Web Shell には、安定した共有トークンを代わりに使用します。

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --open
```

### 2. 動作確認

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

`workspaceCwd` フィールドは、クライアントが `POST /session` で `cwd` を意図的に省略できるようにするために、プライマリ互換性ワークスペースを表示します。現在のクライアントは `workspaces[]` から信頼できるエントリを選択し、ランタイムを明示的にターゲットとする際にそのエントリの `cwd` を送信する必要があります。`limits.maxPendingPromptsPerSession` フィールドは、アクティブなセッションごとのプロンプト受け入れ上限を通知します。`null` は上限が無効であることを意味します。`limits.maxTotalSessions` はオプションのデーモン全体の新しいセッション上限を通知します。`null` は無制限であることを意味します。

### ローカルデーモンの検査と制御 [#inspect-and-control-a-local-daemon]

`qwen serve`は各アクティブリスナーに対してローカルディスカバリレコードを発行するため、2番目のターミナルはstdoutを解析したり`ps`を検索したりする必要がありません。

```bash
qwen daemon start --port 4170      # detached; waits for the discovery record
qwen daemon status                 # ports, PIDs, workspaces, and health
qwen daemon status --json          # one JSON object per daemon
qwen daemon status --detail        # version, uptime, sessions, and issues
qwen daemon logs --port 4170 -f    # follow the recorded log file
qwen daemon stop --port 4170       # SIGTERM the recorded process
qwen daemon restart --port 4170    # stop, then start with the recorded settings
```

レコードはランタイムディレクトリ（`$QWEN_RUNTIME_DIR`, `$QWEN_HOME`, または `~/.qwen`）内の`daemon/daemon-<port>.json`にあります。POSIXでは`0600`であり、ベアラートークンは決して含みません。クラッシュしたデーモンが残したレコードは`stale`として報告され、`status --prune`または`stop`で削除されます。`stop`は、リスナーが`/health`に応答するか、そのPIDがまだ生存している場合にのみ`SIGTERM`を送信します。`--force`は、グラフルタイムアウト後に`SIGKILL`を追加します。複数のデーモンが登録されている場合は、`--port`を渡してください。`stop`は`--all`も受け入れます。

`status --detail` はデーモンに自身のステータスを問い合わせます: バージョン、稼働時間、アクティブなセッション、および問題の数。レコードでデーモンがベアラートークンを使用すると記載され、記録されたプロセスが生きていて、アドレス可能であり、レコードに記載された開始時刻に起動していた場合にのみ `QWEN_SERVER_TOKEN` を送信します; このプロセスがアドレスできない PID 名前空間を持つレコードには、ベアラートークンは決して送信されません。トークンがない場合、ベアラートークンを要求するデーモンは認証が必要であることを報告します。

`qwen daemon start` は `qwen serve` をデタッチモードで生成し、その検出レコードを待機してから、バインドされた URL、PID、ログパス、停止コマンドを表示します。起動元のセッションの識別子とプライベートな権限バインディングを破棄して、子プロセスを新しいデーモンとして初期化し、オペレーターのモデル/認証環境を引き継ぎ、`--no-token-qr` を渡すことで、起動ログにトークンが含まれないようにします。ワークスペースは正規化され、相対的なランタイムディレクトリは生成前に起動元のディレクトリに固定され、Windows のドライブ相対ルートは起動元のドライブに対して解決されます。ループバック以外のバインドには `QWEN_SERVER_TOKEN` が必要です; 一時的なトークンを使用したい場合は直接 `qwen serve` を使用してください。起動ログは `0600` にあり、正常な起動後に削除されます。`--wait` はランタイムがサービスを提供するまで待機します (`daemon_runtime_starting` の問題がなく、`error` でもない); タイムアウトが発生した場合は起動ログを残し、非ゼロで終了します。

再利用可能なローカル資格情報を持つ認証付きバックグラウンドデーモンの場合、環境変数を通じて安定したトークンを提供し、トークンサイドカーの利用を選択してください:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen daemon start --require-auth --save-token --wait
qwen daemon token --port 4170          # print the saved bearer; treat the output as a secret
qwen daemon token --port 4170 --remove # delete only the local sidecar
```

シェルプロセスリストに表示される `--token` よりも `QWEN_SERVER_TOKEN` を優先してください。`--save-token` は明示的に提供されたトークンを必要とし、トークンなしでは生成を拒否します。サイドカーは検出レコードと同じランタイムディレクトリ下の `daemon/daemon-<port>-<pid>.token` にあります; POSIX では `0600` であり、検出レコードやデーモンログには決して含まれません。`qwen daemon stop` はこれを削除しますが、`qwen daemon restart` は置き換えインスタンスへ引き継ぎます。`qwen daemon token --remove` はローカルのコピーを削除しますが、実行中のデーモンの資格情報を変更または失効させることはありません; トークンをローテーションするには、デーモンを停止し、新しいトークンで起動してください。通常の `qwen serve` (`--open-with-auth` を含む) はこのサイドカーを書き込みません。

`qwen daemon restart` は登録済みのデーモンを `daemon stop` で停止し、記録されたポートとホスト名、記録された起動ワークスペース、Conversations ワーキングディレクトリのルート、Web Shell モード、および `--require-auth` 設定を用いて `daemon start --wait` で再度起動します; `--web`/`--no-web` および `--require-auth`/`--no-require-auth` はレコードを上書きします。永続化されたワークスペース登録は、`--workspace` として再生されるのではなく、新しいデーモン自体によって復元されます。その他のすべての `qwen serve` オプション (例えば `--profile`, `--channel`, `--allow-origin`、またはレート制限) はデフォルト値にリセットされるため、それらを設定したデーモンを再起動する場合は `qwen serve` を通じて起動し直してください。何かを停止する前に、restart は HTTPS デーモン、存在しなくなった起動ワークスペース、デーモンがホストするシェル内からの実行 (その Web Shell ターミナルなど)、および `--token` または `QWEN_SERVER_TOKEN` なしのベアラートークンデーモンを拒否します; 実行中のベアラートークンデーモンはトークンを承認する必要があるため、restart は資格情報をローテーションしません。ワークスペースの `.env` や設定ファイルのみに保持されているトークンは、`qwen daemon` によって読み取られません。`--force` は、あなたが渡した場合にのみ `daemon stop` に転送されます。記録されたポートが使用中の場合、デーモンは次の空きポートで起動し、restart は非ゼロで終了します。

現在のデーモンによって記録された Conversations ルートは、再起動するシェルの `QWEN_CONVERSATIONS_DIR` が変更されていても、`daemon restart` によって保持されます。このフィールドのない古い検出レコードは、起動環境またはデフォルトを再び使用します; これらは以前の選択を保証できません。別のルートを選択するには、デーモンを停止し、新しい値で起動してください。永続性と復元の要件については [Conversations ワーキングディレクトリ](#conversations-working-directory) を参照してください。

### ワークスペース登録容量

デフォルトの登録制限は 256 です。これを下げるには `QWEN_SERVE_MAX_WORKSPACES=25 qwen serve --workspace /path/to/project` を設定してください; 許容される値は 1 から 256 までの 10 進整数です。無効な値は起動失敗となります。これはデーモンの起動時設定です: プロジェクトの `.env` とプロジェクトの `settings.env` ではこれを変更できません。組み込み呼び出し側は `ServeOptions.maxRegisteredWorkspaces` を設定することができ、これは起動環境よりも優先されます。

この制限はプライマリワークスペース、登録されたセカンダリワークスペース、およびユーザー作成のスクラッチワークスペースをカウントします。内部の Conversations ランタイムは除外されます。動的登録は容量に達すると `409 workspace_limit_reached` を返します。`GET /capabilities` と `GET /daemon/status` は `limits.maxRegisteredWorkspaces` を公開します。

デフォルトの登録容量 256 の場合、標準的なデーモンはワークスペースを 1 つだけで起動した場合も含め、グローバルなセッション上限を固定の 800 とします。25 を超える設定済み登録容量にも同じセッションデフォルトが適用されます。`--max-total-sessions` は依然としてこれを上書きします; `0` はこれを無効にします。容量が 25 以下の場合は、既存のデフォルトが維持されます: 起動または復元されたワークスペースが 1 つの場合は無制限であり、複数ある場合はワークスペースごとの上限とその数から合計を導出します。登録の変更により合計が再計算されることはありません。これは ACP 子プロセスのメモリポリシーを変更せず、800 の安全な同時セッションを保証するものではありません。

チャネル制御は最大 25 のワークスペースオーナーを独立してサポートし、これは `limits.maxChannelControlWorkspaces` として公開されます。移行時には復元のために保持されるオーナーもカウントされます; 容量に達した場合は、新しいオーナーを追加する前に、古いオーナー上の選択されたすべてのチャネルを正常に停止してください。サイズ超過の移行は `409 channel_control_workspace_limit_reached` を返します。`--channel all` は引き続きプライマリワークスペースのみを選択します。チャネル SDK のタイムアウトは変更されていません。

永続化された登録ファイルはスキーマバージョン 1 を保持し、8 MiB 内で最大 255 のセカンダリレコードをサポートします。古いエイリアスを含む生レコードは、忘却されるまで永続スロットを消費します。完全な有効な起動セットが設定された制限を超える場合、起動は失敗し、ファイルは変更されずに残ります。容量を下げるには、以前の容量で再起動し、十分な数の登録を忘却し、より低い制限で再起動する前に明示的な `--workspace` 引数を減らしてください。古いバイナリへのダウングレードの前に、ファイルをバックアップし、新しいバイナリを使用してセカンダリレコードを最大 24 件、サイズを 256 KiB 以下に縮小してください。そうでなければ、古いバイナリはそのストアを拒否し、明示的なワークスペースのみで起動します; それらのストア変更は書き込み前に失敗します。

### セッションライブ状態ポーリングの調整

Web Shell はデフォルトで **5 秒**ごとにワークスペースセッションのライブ状態を更新します。異なる間隔を使用するには、デーモンを起動する前に環境変数を設定してください:

```bash
QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS=10000 qwen serve --web
```

値はミリ秒単位の整数で、`1000` から `2147483647` の範囲です。欠落または無効な値は `5000` にフォールバックします。この間隔はそのデーモンが提供するすべてのワークスペースに適用されます; 変更後はデーモンを再起動し、開いているすべての Web Shell ページをリロードしてください。ローカルセッションアクションや可視タブへの復帰は、依然として即時に更新を行うことができます。これはライブ状態ポーリングのみを変更し、完全なセッションカタログポーリングは変更しません。

デーモンは有効な間隔を `/capabilities` の `sessionLiveStatePollIntervalMs` として公開します。Web Shell はこの値を使用し、古いデーモンがこの値を省略して接続してきた場合は 5 秒にフォールバックします。SDK コンシューマーは、独自のポーリングスケジュールを選択する際にこの値を読み取ることができます。

### デーモンからの実行チャネル

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under daemon-owned workspace workers
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all

# Or start a token-protected daemon with no channel worker
QWEN_SERVER_TOKEN=secret qwen serve

# Enable or replace its runtime selection later
qwen channel set telegram --token secret
qwen channel set telegram feishu --token secret
qwen channel set all --token secret

# Inspect or stop daemon-managed channels
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

このモードは実験的であり、デーモンによって管理されます。これはスタンドアロンの `qwen channel start` コマンドを置き換えるものではありません: `--daemon-url` なしでは、既存の `qwen channel start`、`stop`、および `status` の動作はスタンドアロンのままです。`qwen serve --channel` を使用すると、明示的な選択が優先され、デーモンはリッスン開始前にチャネルサービスリースを予約し、初期ワーカーが準備完了状態になれない場合は起動が失敗します。フラグなしでの起動時、デーモンは信頼できるすべての登録済みワークスペースから `serve.channels` を復元するため、プライマリ以外のワークスペースで開始するように設定されたチャネルは、ランタイム API 呼び出しを必要とせずにデーモンとともに戻ってきます。どちらのソースもチャネルを選択していない場合、重いチャネルランタイムは読み込まれず、最初のランタイム PUT が実行されるまで、または独自に `serve.channels` を設定するワークスペースが登録されるまで、チャネルサービスリースは予約されません。デーモン起動後に登録された信頼できるワークスペースも、自身の `serve.channels` を復元しますが、これはデーモンの実行ごとに一度のみです: その後（削除後や信頼設定の変更後）に再度登録しても復元は繰り返されないため、その間に停止したチャネルは停止したままになります。明示的な `--channel` を指定してデーモンを起動するとこの処理は完全にスキップされ、`qwen channel stop` (`DELETE /workspace/channel`) でチャネルを停止した場合も同様で、`qwen channel set` によって再び有効になるまで続きます: ワークスペースの登録は、ホスティングを再びオンにする要求ではありません。ブート時の復元とは異なり、ホストできない名前をスキップして残りを保持しますが、そのような名前を含むリストを持つ遅延登録ワークスペースは、チャネルを一つも復元できず、デーモンログに理由が記録されます。ワークスペースの登録は、そのチャネルが起動するのを待ちません。ホストできないワークスペースによってリストされたチャネル名は、ログとともにスキップされ、他のワークスペースのチャネルは実行されたままになります; `all` は依然としてプライマリワークスペースにのみ適用されます。準備完了状態のワーカーがその後クラッシュした場合、デーモンは実行を継続し、制限付き再起動ポリシーの下でそれを再起動し、`GET /daemon/status` でその状態（`channel_worker_exited` 警告を含む）を報告します。

自動復元は、ワーカー起動前の無効な起動フィールド、検証エラー、またはリースエラーをスキップし、その `serve.channels` ソースをログに記録し、関連しない設定を有効なままにします。ワーカー起動失敗後、クリーンアップが成功した場合にのみデーモンは継続します。グローバルランタイム起動タイムアウトと未確認のワーカー停止は、通常の起動失敗動作を維持します; ワーカー終了が未確認の間、サービスリースは保持されたままです。スキップされた復元または失敗した復元については、デーモンログを確認してください。

保存された起動名は、空であってはならず、先頭または末尾の空白を含んではならず、安全でない制御文字や不可視文字を含んではなりません。無効なエントリは個別にスキップされ、配列インデックスによってログに記録されます。起動処理はそれらを異なるインスタンス名にトリミングしたり、設定を書き換えたりしません。チャネル起動トグルは永続化された設定を反映しますが、ランタイム状態はチャネルが実行中かどうかを報告します。

ランタイム制御は `GET`、`PUT`、および `DELETE /workspace/channel` として公開され、SDK ヘルパーは `getChannelWorkerControl()`、`setChannelWorkerSelection()`、および `stopChannelWorker()` です。PUT/DELETE/reload は厳格な変更ゲートを使用します: 信頼できるループバックのプライマリ呼び出し元はトークンなしで使用できますが、他のデプロイメントではオペレーター資格情報が必須です。ランタイム選択は意図的に一時的です: PUT は設定やブートオプションを編集せず、再起動後は明示的な `qwen serve --channel` 選択に戻り、それがなければ信頼できるプライマリワークスペースの `serve.channels` に戻り、どちらも存在しない場合は無効になります。明示的な CLI およびランタイムの名前付き選択は、初出順でトリミングおよび重複排除されます; 最初のチャネルが共有モデル選択に影響を与える可能性があるため、順序は保持されます。

デーモンバックエンドの `qwen channel set` と `qwen channel reload`、および `--daemon-url` を伴う `status` と `stop` は、`--open-with-auth` によって生成されたトークンを検出できません。これらのクライアントには `QWEN_SERVER_TOKEN` を使用し、同じ値を `--token` で渡すか、認証付きオープンモードを省略してください。

デーモンは各チャネルの設定（トークン、`proxy`、チャネルごとの `model`）をワーカーの起動時に読み取ります。選択を変更せずに設定を再読み取りするには、`POST /workspace/channel/reload` を呼び出します（SDK `client.reloadChannelWorker()`、または `qwen channel reload`）。リロードはワークスペースの所有権を再解決し、同じロールバック安全な reconcile パスを通じて選択されたワーカーを再起動します。`channel_control` ケーパビリティはランタイム制御が配線されているときに常に存在し、`channel_reload` はマネージャーが有効な間にのみ存在します。永続化されたスレッドはディスクから復元されます。

選択された各チャネルの `cwd` は、登録済みのワークスペースに解決される必要があり、チャネルはその所有ワークスペースによってグループ化されます: 単一ワークスペースのデーモンは一つのワーカーを実行します（以前から変更なし）; マルチワークスペースのデーモン（`--workspace` の繰り返し）は、選択されたチャネルを所有するワークスペースごとに一つのワーカーを実行し、それぞれがそのワークスペースの cwd、`QWEN_DAEMON_WORKSPACE`、および env オーバーレイにバインドされます。プライマリ以外のワークスペースでチャネルをホストするには、そのワークスペース自身の `.qwen/settings.json` で定義するか（`cwd` は不要）、ワークスペースパスと等しい明示的な `cwd` を設定します。ユーザー/システムスコープでのみ定義され、`cwd` がないチャネルは、複数のワークスペース間で曖昧になります: 明示的な `--channel` 選択は起動を失敗させ、自動復元は所有権エラーをログに記録し、ワーカー起動前にその選択をスキップします。`--channel all` はプライマリ専用（プライマリワークスペースのチャネルをホスト）のままとなり、名前付きチャネルとの組み合わせはできません。

選択の置換は、何かを停止する前に設定、所有権、および信頼性をプリフライトチェックします。順序付けられた選択が変更されていないワークスペースワーカーは保持されます。変更されたワーカーが起動できない場合、デーモンは新しいワーカーを停止し、古い選択を復元します。SIGKILL 後も古い子プロセスの終了をデーモンが確認できない場合、PID リースを保持し、重複ワーカーの作成を拒否します。少なくとも一つの要求されたアダプターが接続している場合、ワーカーはまだ準備完了状態と見なされます; その後 PUT は `partial: true` を返し、`/daemon/status` は欠落しているアダプターについて `channel_worker_partial_connect` を報告します。デーモンが起動できなかった `serve.channels` 名前 — ワーカー起動に失敗した設定された選択、ブート時に帰属できなかった名前、または遅延登録の復元によってダウンしたままになった名前 — は `/daemon/status` 上で `channel_restore_failed` として報告され、そのワークスペース自身の設定で定義されている場合、そのワークスペースのチャネルリストにおいてその `lastError` とともに `error` として表示されます。名前がホストされないままになる他の方法は、デーモンログにのみ記載されます。

アダプターが `connect()` を拒否する場合、現在のワータースナップショットには、チャネル、`phase: "connect"`、オプションのアダプターコード、および資格情報を秘匿化したメッセージを含む `startupFailures` エントリが含まれることがあります。`qwen channel set`、`qwen channel reload`、およびリモート `qwen channel status --daemon-url …` はこれらの理由を表示します。動的セットまたはリロード中にすべてのアダプターが失敗した場合、コマンドは `502 channel_worker_start_failed` を受け取ります; レスポンスの理由はその試みを記述し、その `state` はロールバック後の結果を記述します。失敗した試みは、後続のステータス要求によって保持されません。ワーカー起動あたり最大 64 の理由が保持され、アダプターコードは安定したカテゴリーではなく診断用として扱うべきです。初期の `qwen serve --channel …` 起動は、アダプターが接続しない場合に依然として終了します。

デーモンはまた、クライアント UI とオペレーター向けに読み取り専用のランタイムスナップショットを公開します: `GET /daemon/status`, `GET /workspace/mcp`, `GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`, `GET /workspace/preflight`, `GET /workspace/:id/session-info`, `GET /session/:id/status`, `GET /session/:id/context`, `GET /session/:id/supported-commands`, および `GET /session/:id/tasks`, `GET /session/:id/lsp`, `GET /session/:id/resources`, `GET /session/:id/transcript`.

`GET /workspace/:id/session-info` (および複数形の対 ⟨`GET /workspaces/:workspace/session-info`⟩) は、ワークスペースの集計セッション数を返します: 永続化された `active` / `archived` / `total`、およびライブ状態が利用可能な場合の現在のメモリ内 `live` カウントが含まれます。登録された信頼できないセカンダリワークスペースは、カタログ読み取りがライブブリッジにクエリしないため `live` を省略します。ページネーション付きの `GET /workspace/:id/sessions` リストには合計数が含まれないため、これは「セッションがいくつ存在するか？」という質問に対する専用インターフェースです。スケジュール済みまたは反復タスクにより大量のローカルストレージが残る場合に有用です。

> ⚠️ **ディスクスキャン — ポーリングしないでください。** このエンドポイントは、ワークスペースチャットディレクトリ下のローカルセッション JSONL ファイルを走査します。レスポンスには常に `expensive: true` と `cost: "disk_scan"` が含まれます。頻繁に呼び出さないでください（手動更新、オペレーターツール、偶発的な UI ロード）— 短い間隔でのタイマーやサイドバーレンダリングごとに呼び出すことは避けてください。ページの閲覧には `GET /workspace/:id/sessions` を、ライブのメモリ内セッションカウントには `GET /daemon/status` を優先してください。`truncated: true` を含むレスポンスは、スキャンが安全上限に達したか、すべての候補ファイルを分類できなかったことを意味するため、永続化されたカウントは下限となります。

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status` は、単一セッションのライブブリッジサマリーを返します: `sessionId`, `workspaceCwd`, `createdAt`, オプションの `displayName`, `clientCount`, `hasActivePrompt`. デーモンがその ID を持つライブセッションを保持している場合、サマリーで `200` に対応し、そうでない場合は `404` (ボディ `{ "error": …, "sessionId": … }`) を返します。ページネーション付きセッションリスト全体を取得・スキャンせずに、既知の 1 つのセッションがまだ実行中かどうか (`hasActivePrompt`) や、何人のクライアントが接続しているか (`clientCount`) をポーリングするために使用します:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

これは生のライブセッションビューであるため、`clientCount` と `hasActivePrompt` は `GET /workspace/:id/sessions` の対応するエントリと一致しますが、2 つのルートはバイト単位で同一ではありません。リストエンドポイントは、各項目を永続化されたセッションストアデータで強化します: その `createdAt` は永続化された最初のプロンプト時間であり、保存されたタイトルまたは最初のプロンプトから導出された `updatedAt` と `displayName` を追加します。`/status` は代わりにライブセッション自身の `createdAt` を報告し、`updatedAt` を省略し、ライブセッションに設定されている場合のみ `displayName` を返します。

`GET /session/:id/lsp` は、セッションごとの構造化された LSP ステータスを返します。 spawned agent セッションで LSP を有効にするには、`--experimental-lsp` でデーモンを開始してください。それ以外の場合、ルートはサーバーなしで `enabled: false` を返します。

`GET /session/:id/resources` は、そのライブセッション自身の Config からのサニタイズされた Skill および MCP スナップショットを返します。セッションが worktree またはベースワークスペースとは異なるリソースを持つ別の実効ディレクトリから実行される可能性がある場合に使用します。ワークスペース所有の MCP 認証、プール、予算、検出エラーの詳細はこのセッションビューからは省略されます。呼び出す前に `session_resources` 機能を確認してください。

`GET /daemon/status` は統合されたトラブルシューティングスナップショットです。デフォルトの `detail=summary` はメモリ内のデーモン状態（セッション、権限、SSE/ACP 転送カウント、レート制限拒否、プロセスメモリ、解決済み制限）のみを読み取り、ACP 子プロセスを起動しません。問題の調査中にセッションごとの診断、ACP 接続詳細、認証デバイスフローのカウント、ワークスペースステータスのセクションが必要な場合は `GET /daemon/status?detail=full` を使用してください。

`GET /workspace/mcp` はライブ ACP ランタイムを報告し、アイドル時には ACP 子プロセスを起動しません。アイドル時のデーモンは空のスナップショットを含む `initialized: false` を返します。セッションが生きているようになると `initialized: true` に切り替わり、実際の状態を表示します。

`GET /workspace/providers` はワークスペース設定と環境変数からデーモンローカルで応答されるため、ライブな ACP 子プロセスに依存せず、`acpChannelLive` が生存確認シグナルとなります。ワークスペース設定またはモデル構成が解決できない場合、レスポンスには `initialized: false`、空の `providers` 配列、および `errors` エントリが含まれます。このルートは、デーモンローカルのプロバイダステータスビルダーなしでデーモンが構築された場合にのみ、ライブ ACP スナップショットへのフォールバックを行います。デーモンローカルでの回答には、ランタイムに登録されたモデルは含まれません。

`GET /workspace/skills` は保持されているデーモンの観測結果を即座に返し、バックグラウンドで再検証を行うため、ウォーム読み取りでは ACP 子プロセスを待ちません。オプションの `snapshot` オブジェクトは `observedAt`、`ageMs`、`stale`、および `refreshing` を報告します。カタログを最新として扱う前に `ageMs` を確認してください。最初の成功した観測結果が出る前、1秒間のスタートスロットルウィンドウ内での読み取りは待機する代わりに `initialized: false` と `errors` エントリを返すことがあります。これは再試行可能な利用不可であり、空のカタログではありません。

名前によるワークスペースの Skill 設定を更新するには、`workspace_skill_settings_toggle` 機能を確認した後に `{ "enabled": true | false }` を指定して `POST /workspace/skills/:name/enable` を呼び出します。複数の名前を変更する場合は、`workspace_skill_settings_batch_toggle` を確認し、`{ "skillNames": ["review", "deploy"], "enabled": false }` を指定して `POST /workspace/skills/enable` を呼び出してください。これは構造的に有効なすべての名前をまとめて処理し、結果として生じる宣言変更を最大1回のロック付き設定書き込みで永続化し、何か変更があった場合にアクティブな ACP セッションを一度だけ更新します。これらのルートはロードされた Skill カタログを参照せずにワークスペースの `skills.disabled` と `skills.enabled` に書き込むため、インストール前や Extension が非アクティブな状態でも名前は無効化できます。有効化すると、一致するワークスペースの無効化が削除され、インストール前であっても明示的な `skills.enabled` オプトインが記録されるため、このエントリは Extension 内部の Skill 無効化を上書きできます。同じ宣言の繰り返しは何もしません（`changed: false`）。パスとリクエストボディは変更されていません。設定固有の機能により、廃止されたカタログ検証済み Skill トグルタグが置き換えられます。バッチの `errors` 配列はワイヤー互換性のために残されており、構造的に有効な名前に対しては空です。上位スコープから継承されたハードな `skills.disabled` エントリは、実効的な可用性において権威を持ちますが、ワークスペースが独自に宣言を記録または削除することをブロックしません。Skill ステータスセルは `disabledReason`（`hard`、`default`、または `inactive_extension`）とオプションの `lockedScope` を公開します。信頼されていないワークスペースへの書き込みは依然として拒否されます。`deferred` レスポンスは、ライブネスチェック時に子プロセスが生きていなかったか、変更を伴うリクエストが必須の更新中に子プロセス/セッションを失ったことを意味します。`changed` が true の場合、永続化された宣言は子プロセスが起動したときに適用されます。宣言が実際に変更されたかどうかは、`changed` によって報告されます（バッチリクエストの場合は各結果ごとに）。`skills.disabled` は手動およびモデルの使用の両方を無効にしますが、`disable-model-invocation: true` とは異なり、直接の `/skill-name` 呼び出しは利用可能です。V2 Extension バッチでは、`extension_batch_activation_v2` を確認してください。`PUT /extensions/activation` はグローバルデフォルトを変更し、`PUT /workspaces/:workspace/extensions/activation` は選択されたワークスペースに対する正確なオーバーライドを変更し、それらをクリアするために `"inherit"` を受け入れます。どちらも `extensionNames` で名前を受け入れます。`enabled` と `disabled` はインストール前に宣言できますが、未知の名前に対する `inherit` は何もしません。各リクエストはポーリング用の1つの操作を返します。`extension_activation_explicit_refresh` が広告されている場合、その操作はアクティベーションポリシーがコミットされた後に完了し、アクティブなセッションを直接更新しません。これを即座に適用するには、アクティベーション成功後に独立したプライマリまたはワークスペース修飾付き Extension 更新を送信してください。この明示的な更新がない場合、他のワークスペースは次の30秒間のジェネレーションレコンサイラーパスまで前のアクティベーションを引き続き使用する可能性があります。失敗したレコンサイリングは後のパスで再試行されます。

`GET /workspace/env` と `GET /workspace/preflight` は ACP の状態に関係なく常に `initialized: true` で応答します。`env` は ACP を参照せず（デーモンプロセス情報のみ）、`preflight` は `process.*` からデーモンレベルのセルに応答し、子プロセスがアイドルの場合は ACP レベルのセルに対して `status: 'not_started'` プレースホルダーを出力します。

`GET /workspace/env` はデーモンプロセスのランタイム、プラットフォーム、サンドボックス、プロキシ、および `OPENAI_API_KEY` のようなホワイトリスト化された秘密環境変数の**存在**（値ではない）を報告します。プロキシ URL は認証情報を削除され、送信前に `host:port` に縮約されます。このルートは常にデーモンプロセスから直接応答し、ACP 子プロセスを生成しません。

`GET /workspace/preflight` は準備完了チェックのリストを返します。**デーモンレベルのセル**（Node バージョン、CLI エントリ、ワークスペースディレクトリ、ripgrep、git、npm）は常に表示されます。**ACP レベルのセル**（認証、MCP 検出、スキル、プロバイダ、ツールレジストリ、エグレス）にはライブな ACP 子プロセスが必要であり、デーモンがアイドルの場合、それらを埋めるために ACP を起動するのではなく `status: 'not_started'` プレースホルダーを出力します。失敗は閉じた `errorKind` 列挙型（`missing_binary`、`auth_env_error`、`init_timeout`、`restore_timeout`、`protocol_error`、`missing_file`、`parse_error`、`blocked_egress`）にマップされるため、クライアント UI は構造化された修復措置を表示できます。

デーモンはまた、ワークスペースファイルヘルパーを公開します：

- `GET /file` はテキストファイルを読み取ります。フルスナップショットのレスポンスは生バイトの `sha256:<hex>` ハッシュを返します。256 KiB を超えるファイルからの有限行数ウィンドウではこれを省略します。
- `GET /file/bytes` は境界付きの生バイトウィンドウを読み取り、base64 コンテンツを返します。
- `POST /file/write` はテキストファイルを作成または置換します。
- `POST /file/edit` は 1 回の正確なテキスト置換を適用します。

書き込み/編集は**厳格な変更ルート**です：トークンなしの信頼できるループバックプライマリリスナーはオペレーター権限を付与し、認証情報なしの信頼されていない埋め込みは `token_required` を返します。置換と編集には、フルスナップショットの `GET /file`（またはフルウィンドウの `GET /file/bytes`）からの最新の `expectedHash` が必要です。部分的な大規模ファイルウィンドウは楽観的並行性トークンとして使用できません。`create` は上書きを行いません。無視パスへの明示的な書き込みは許可されますが、監査対象となります。バイナリ書き込み、削除/移動/mkdir、および再帰的な親作成はこのインターフェースの一部ではありません。

### 3. セッションを開く

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` は省略可能です。ルートはデーモンのプライマリワークスペースにフォールバックします。登録されたワークスペースのいずれにも正規化されない `cwd` をポストすると、`400 workspace_mismatch` が返されます。

同じ解決済みワークスペースランタイムに対して `/session` に投稿する2番目のクライアントは、デフォルトの `sessionScope: 'single'` の下で `"attached": true` を取得します — これらは現在そのランタイムのエージェントセッションを共有しています。`cwd` を省略するとプライマリに解決されます。別の登録済みワークスペースを選択すると、そのランタイムの個別のデフォルトセッションを作成またはアタッチします。

### 4. イベントストリームを購読する（まず別のターミナルで）

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 行は**完全なイベントエンベロープ**（`{id?, v, type, data, originatorClientId?}`）であり、1 行に JSON 文字列化されています。ACP ペイロード（この例では `sessionUpdate` ブロック）は、そのエンベロープ内の `data` の下に配置されます。SSE レベルの `id:` / `event:` 行は EventSource クライアント向けの利便性ですが、同じ値が JSON エンベロープ内にも含まれているため、生の `fetch` コンシューマーもそれらを取得できます。

プロンプトを送信する**前に**これを開いてください — SSE リプレイバッファは最後の 8000 イベントを保持しているため、遅延サブスクライバーは `Last-Event-ID` を介して追いつくことができますが、「単一のプロンプトを観察する」という単純なケースでは、最初にサブスクライブしてライブでストリーミングさせるのが最も簡単です。

ストリームは `session_update`（LLM チャンク、ツール呼び出し、使用量）、`permission_request`（ツールが承認を必要とする）、`permission_resolved`（誰かが投票した）、`model_switched`、`model_switch_failed`、そして終端フレームである `session_died`（エージェントの子プロセスがクラッシュ — その後 SSE が閉じる）と `client_evicted`（キューが溢れた — その後 SSE が閉じる）を出力します。

### 5. プロンプトを送信（元のターミナルに戻って）

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

ステップ 4 の `curl -N` は、フレームが到着するたびに出力します。

### オプションの Todo Stop Guard

長時間実行されるデーモンクライアントは、現在のワークチェーンがトップレベルの Todo リストを正常に書き込んだ後、保留中または進行中の項目が残ったまま停止した場合、有界の継続処理を選択的に有効にできます。これを追加するには `settings.json` に追加し、デーモンを再起動してください：

```json
{
  "experimental": {
    "todoStopGuard": true
  },
  "tools": {
    "todoWrite": {
      "enabled": true
    }
  }
}
```

ガードは、新しいユーザー入力なしで最大 2 回の連続したプライマリモデル呼び出しを追加します。ターン途中のユーザーメッセージが最初に実行され、新しい 2 回試行ステージを開始します。リトライ/継続および関連するバックグラウンドの結果は、現在のステージの予算を保持します。すべての呼び出しと最終的な枯渇状態は、`_meta.source: "todo_stop_guard"` を伴う再生可能な `session_update` イベントとして表示されます。メタデータには試行回数と未完了数が含まれますが、Todo テキストは含まれません。キューに入れられた完全なプロンプトも最初に実行され、既存の権限/キャンセルルールは変更されません。

武装されたチェーンが関連するバックグラウンド作業を待っている間、無関係な cron/loop の発火や古いタスクの通知は延期されます。繰り返し作業は有界であり、チェーンが譲歩するまでタスクごとに結合されます。

このオプションのデフォルト値は `false` です。再起動が必要であり、セーフモード、ベアモード、および Approval `plan` モードでは強制的に無効になります。メモリ内でのみ保持されます: Todo ステートをディスクから読み込んだり、デーモンを再起動しても有効にはなりません。settings.json 内で `tools.todoWrite.enabled` を設定して Qwen Code を再起動すると、新しい通常のプロンプトで独自のトップレベル `todo_write` が正常に実行される必要があります。リトライ/継続やライブクライアント再接続では、現在のメモリ内のワークチェーンが維持されます。セッションの作業ディレクトリの正常な変更によりこれがクリアされ、古い Todo が新しいワークスペースで再開できなくなります。

## 認証 [#authentication]

ループバック以外の場合、すべてのAPIリクエストにはベアラートークンが必要です。再利用可能なクライアントには安定したトークンを提供するか、トークンなしで開始し、デーモンが生成して出力するエフェメラルトークンを使用してください。

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → uses QWEN_SERVER_TOKEN; generates an ephemeral token if neither token source is supplied
```

クライアントは通常のAPIリクエストで `Authorization: Bearer <token>` を送信します — エクスポートした場合 `$QWEN_SERVER_TOKEN` 、またはデーモンが生成した場合（そのパスでは環境変数を設定しないため、起動時の出力から値をコピーしてください）は起動時に印刷されたベアラートークンです。 `/health` は **通常のループバインドでのみ** 免除されるため、ポッド内のk8s/Compose生存性プローブは資格情報を必要としません。非ループバックバインド（ `--hostname 0.0.0.0` など）では、 `/health` は他の通常のAPIルートと同様にトークンを必要とします — さもないと、攻撃者は任意のアドレスをプローブしてデーモンの存在を確認できます。チャネルWebhook受信はすべてのモードで個別であり、デーモンのベアラートークンの代わりに設定された `x-qwen-webhook-secret` を使用します。設定したトークンがエンドツーエンドで正しいことを確認するには `/capabilities` を使用してください。

> **強化されたループバック ( `--require-auth` )。** デフォルトのループバック・ノントークン動作は単一ユーザーのラップトップには適していますが、ローカルユーザーなら誰でも `curl 127.0.0.1:4170` できる共有開発ホスト、CIランナー、マルチテナントワークステーションでは安全ではありません。 `--require-auth` を渡すことで、 `127.0.0.1` にバインドされている場合でも、 `/health` と `/capabilities` を含むすべての通常のAPIルートでベアラートークンを必須にします。チャネルWebhook受信は `x-qwen-webhook-secret` によって独立して認証されたままです。Web Shellドキュメントおよびアセットルートは事前認証のままです。それらを削除するには `--no-web` を使用してください。トークンソースが解決されない場合、起動は失敗し、ループバックでは `--token` 、 `QWEN_SERVER_TOKEN` 、または `--open-with-auth` を意味します — 最後のものは起動前に独自に生成されたトークンをインストールするため、 `--require-auth --open-with-auth` が始まります。生成は `--hostname` のスペリングに基づきます：ループバックスペリング（ `127.0.0.0/8` 、 `localhost` 、 `::1` 、 `[::1]` ）は決して生成されず、他のスペリング — ループバックに解決されるDNS名を含みます — は、 `--require-auth` を満たし、起動時に印刷される（ソケットがループバックにバインドされている場合はトークンのみ）エフェメラルベアラートを生成し、再起動ごとにローテーションするため、再利用可能なクライアントには `--token` または `QWEN_SERVER_TOKEN` を固定してください。フラグがオンの場合、 **未認証** クライアントは認証が必要であることを発見するために `/capabilities` を読み取ることができません。発見面は401応答ボディ自体です。認証後、 `caps.features.require_auth` タグはデプロイメントが強化されていることを示すポスト認証の確認です（監査/コンプライアンスUIに有用）。
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (or whatever index — non-null after authenticating means the tag is present)
> ```

```bash
# Paste the bearer the daemon printed at startup, or your own QWEN_SERVER_TOKEN.
TOKEN='<printed bearer>'
curl -H "Authorization: Bearer $TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

トークンの比較は定数時間で行われます（SHA-256 + `crypto.timingSafeEqual`）。401 レスポンスは「ヘッダーなし」、「不正なスキーム」、「不正なトークン」で統一されているため、サイドチャネルで区別できません。

`--open-with-auth` はデーモン固有のトークンソースではなく、CLI 固有の便宜機能です。`--token` が定義されている場合（空でも）それを優先し、次に `QWEN_SERVER_TOKEN` を選択し、選択された値をトリムし、結果が空の場合にのみ生成します。デーモンは生成された値を永続化せず、`QWEN_SERVER_TOKEN` としてエクスポートもしません。既存の内部認証済み子プロセスのハンドオフは変更されません。Web Shell はブラウザのコピーを受信タブの `sessionStorage` にのみ保存します。このモードはクロスタブや外部クライアントの資格情報発見メカニズムを追加しません。トークンは独立に取消可能ではなく、クライアント ID にも紐付きません。 possession は他の Bearer トークンと同じデーモン権限を付与します。[認証済み Web Shell 起動デザイン](../design/2026-08-22-serve-open-with-auth.md) および [#4514](https://github.com/QwenLM/qwen-code/issues/4514) の関連する将来の作業も参照してください。

## HTTPS / TLS（モバイル / デバイス間アクセス用） [#https--tls-for-mobile--cross-device-access]

デフォルトでは、デーモンはプレーンHTTPを提供します。これは `localhost` では問題ありませんが、LAN IP（ `https://192.168.x.x:4170` ）にアクセスするスマートフォンやタブレットは `http://` 経由では [安全なコンテキスト]( https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts ) **ではありません** — そのため、ブラウザは `getUserMedia` （音声入力）、WebRTC、およびその他の安全なコンテキスト専用APIをブロックします。 `--tls-cert` + `--tls-key` を渡して、Web ShellをHTTPS経由で提供し、それらのロックを解除してください。

```bash
# 1. Install a local CA and trust it (one-time). The mobile device must
#    also trust this CA — mkcert prints where the root cert lives.
mkcert -install

# 2. Generate a cert for your machine's LAN IP. Add localhost / 127.0.0.1 to
#    the SANs too: with `--open`, the daemon rewrites the browser URL to
#    127.0.0.1, so a cert scoped to only the LAN IP would be rejected with
#    ERR_CERT_COMMON_NAME_INVALID. (mkcert names the output after all hosts.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Start the daemon over HTTPS. Non-loopback binds still require a token,
#    and the browser Origin must be allowed through CORS.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

ノート:

- **両方のフラグまたはどちらもなし** — 片方だけが指定されると起動は失敗します（鍵のない証明書はHTTPSリスナーを開始できません）。
- **TLSは認証とは直交します** — HTTPSはトランスポートを暗号化します。ベアラートークンが設定されている場合、通常のループバックバインド上の `/health` を除く通常のAPIルートをゲートします。ループバック `/health` もゲートするには `--require-auth` を渡してください。チャネルWebhook受信は常に独自共有シークレットを使用します。非ループバックバインドは、TLSの有無に関係なく常にトークンを伴います — 渡したもの、またはデーモンが生成して起動時に印刷するエフェメラルなもの。
- **スコープはTLS終端のみです** — 自動生成はありません、ACME / Let's Encryptはありません。これはLAN / 開発の利便性です。インターネット向けデプロイメントではリバースプロキシでTLSを終端してください（以下の脅威モデルを参照）。
- **チャネルワーカーはデーモンへ `https://` 経由でダイヤルバックします** — そのため、彼らもサービング証明書を信頼する必要があります。自己署名証明書（または独自ルートを含むフルチェーン）は何も必要ありません：デーモンはそれを各ワーカーの `NODE_EXTRA_CA_CERTS` に注入します。上記のmkcertフローは **CA発行** です。そのため、リーフだけではチェーンをアンカーできません — `--channel` で開始する前に、デーモンの起動環境で `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"` をエクスポートしてください。オペレーターが設定した値は、デーモン証明書と _マージ_ され、置き換えられません。これがないと、デーモンは緑色で起動しますが、すべてのチャネルワーカーは `UNABLE_TO_VERIFY_LEAF_SIGNATURE` で再起動ループします。デーモンログは起動時にギャップを名指しします。
- **IPv6 ワイルドカードバインドは、このホストが実際に割り当てるループバックで縮退されます** — `--hostname ::` (または `[::]`) は IPv6 ソケットをバインドします。(空の `--hostname` はリスナーに到達しません: バインド前にオペレーターエラーとして起動時に拒否されるため、`HOSTNAME` が未設定の compose ファイルはサイレントにワイルドカード化するのではなく明確に失敗します。) そのソケットはデュアルスタックです (Node は `IPV6_V6ONLY=0` を固定するため、`net.ipv6.bindv6only` sysctl はこれを変更しません)。両方のループバックが通常そこに到達しますが、IPv4 を一切持たないホストには `::1` のみがあり、`::` をバインドするがループバックに `::1` を持たないホスト (例えば `net.ipv6.conf.lo.disable_ipv6=1`) には `127.0.0.1` のみがあります。ワーカーは、このホストがそれを割り当てる場合は `[::1]` に、それ以外の場合は `127.0.0.1` に送信されます。IPv6 ワイルドカードバインド用のサービング証明書には、SANs に両方のループバックを含める必要があります (`mkcert localhost 127.0.0.1 ::1` がこれをカバーします)。起動時の信頼性診断は、ワーカーがダイヤルする正確な URL を検査し、ギャップを特定します。`--hostname 0.0.0.0` は変更されておらず、依然として `127.0.0.1` が必要です。
- **`--tls-cert` のインプレース回転にはデーモンの再起動が必要です** — デーモンは起動時に読み取ったバイトを提供します。再起動するまで、レスポーンされたワーカーはデーモンが提示するものより新しいコンテンツをロードでき、ハンドシェイク失敗を引き起こす可能性があります。

## Web Shell をアプリとしてインストールする

サポートされているブラウザで、デーモンの Web Shell を開き、ブラウザの **アプリをインストール** または **ホーム画面に追加** アクションを使用します。インストールされたアプリは、Qwen Code の名前とアイコン付きのスタンドアロンウィンドウで同じサーバーを開きます。iOS では、ブラウザの共有メニューと **ホーム画面に追加** を使用します。利用可否はブラウザとデバイスに依存します。

デーモン自体が PWA メタデータを配信します: `GET /manifest.webmanifest` と `GET /sw.js` は事前認証ルートです（ブラウザは Authorization ヘッダーが存在する前に両方を取得します）、そして `sw.js` は `Service-Worker-Allowed: /` で配信されるため、そのスコープはオリジン全体をカバーします。ワーカーはコンテンツハッシュ化された Vite ビルドアセットのみをキャッシュし、キャッシュファースト戦略を採用します。ハッシュ化されていない公開アイコンとマニフェストは HTTP 経由で再検証されます。API フェッチ、イベントストリーム、および認証ヘッダーを含むリクエストはネットワーク上に留まります。

スマートフォンやその他のリモートデバイスには信頼できる HTTPS 接続を使用してください。ローカル開発では `localhost` またはループバックアドレス上の HTTP がサポートされています。LAN IP 上のプレーンな HTTP ではサービスワーカーは有効になりません。上記の TLS 手順を参照してください。インストールによって証明書または認証チェックがバイパスされるわけではありません。

インストールは常にサーバーのルートを開始します。現在のアドレスにあるトークン、セッションリンク、またはワークスペースは、アプリの起動 URL に含まれません。インストールされたアプリでトークンを再度入力する必要がある場合があります。既存の Web Shell 認証フローを使用しており、永続的な資格情報ストレージを追加しません。

サーバーは稼働中で到達可能である必要があります。サービスワーカーがアクティブ化されてページを制御した後、接続が失敗したときにルートまたはセッションリンクを開くと、リトライページが表示されます。会話、ファイル、API レスポンス、または資格情報はサービスワーカーキャッシュに保存されません。既存の HTTP エラーは依然としてサーバーから発生します。この最初のステップでは、アプリが閉じている間のオフライン作業、Web Push、または通知を提供しません。更新されたワーカーは `skipWaiting()` と `clients.claim()` を使用して即座にアクティブ化され、ページの強制リロードなしで開いているタブの前のワーカーを置き換えます。アクティブ化により、古い Qwen シェルキャッシュが削除され、無関係なキャッシュは保持されます。

インストールメタデータは組み込みの Qwen Code アイデンティティを使用します。ランタイムのカスタムブランディングは Web Shell 内で引き続き適用されます。埋め込みライブラリ消費者はワーカーを登録しません。インストールを削除するには、ブラウザまたはオペレーティングシステムのアプリ管理を使用してください。そのサービスワーカーと保存されたサイトデータを削除するには、ブラウザのサイト設定を使用してください。

## Qwen Live (実験的)

Qwen Live はすべてのプラットフォームで Web Shell を通じて実行されます: ブラウザタブがマイクとスピーカーになります (WS `/live/web`)。したがって、マイクアクセスのために `https` または `localhost` 経由で Web Shell を開いてください。ネイティブ macOS `Qwen Live Host` アプリはデフォルトでオフです。試すには、macOS デーモンを `QWEN_SERVE_LIVE_NATIVE_HOST=1` で起動します。これは Live がオンになっている場合に `/live/host` WebSocket、`realtime_voice` 機能、および Host ダウンロードを復元します。これがない場合、すでにインストールされている `Qwen Live Host.app` は接続できないままになります (デーモンは `/live/host` を登録しません)。終了して Web Shell を使用してください。

## CLI フラグ

| フラグ | デフォルト | 目的 |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>` | `4170` | TCP ポート。`0` = OS 割り当てのエフェメラルポート。 |
| `--hostname <addr>` | `127.0.0.1` | バインドインターフェース。ループバック以外へのバインドにはトークンが必要です。`--token` と `QWEN_SERVER_TOKEN` のどちらもトークンを供給しない場合、エフェメラルトークンが生成され、起動時に表示されます。 |
| `--local-control` | `false` | 選択された 1 つのプライベート IPv4 インターフェース上で Web Shell を共有し、デーモン所有の取り消し可能なペアリングトークン、ターミナル QR コード、正確なブラウザオリジン、およびベストエフォートのスリープ抑制を使用します。`--token`、`--allow-origin`、および `--port 0` と組み合わせ可能です。`--no-web` および非デフォルトの `--hostname` と競合します。複数の LAN 候補がある場合は `--local-control-address` を使用し、音声入力などのセキュアコンテキストブラウザ API のために `--tls-cert` + `--tls-key` を追加してください。 |
| `--local-control-address <ip>` | — | ホストに複数の候補がある場合に共有する LAN IPv4 アドレス。`--local-control` が曖昧な選択肢を報告する場合にのみ必要です。 |
| `--token-qr` | — | stdout がキャプチャされている場合 (インタラクティブターミナルではない) でも、ベアラがオペレーター提供の (安定した) トークンである場合でも、トークンを含む QR を表示します。これはデフォルトでは、収集されたログから安定した資格情報を除外するために保留されます。`serve.tokenQr` 設定を通じて設定することもでき、ユーザー、システム、およびシステムデフォルトのスコープからのみ尊重されます。フラグが渡された場合、フラグが優先されます。フラグを省略することは `--no-token-qr` とは **同じではありません**: 省略するとデフォルトのポリシーが残ります (インタラクティブターミナルまたは生成されたトークンの場合の QR)。一方、`--no-token-qr` はすべてのクイックスタートパスにおいてその実行のための起動時クイックスタートトークン QR を抑制するため、永続的な設定を実行ごとに拒否できます。どちらとも Local Control ペアリング QR を制御しません。 |
| `--token <str>` | — | Bearer トークン。環境変数 `QWEN_SERVER_TOKEN` にフォールバックします（先頭・末尾の空白は除去されます — `$(cat token.txt)` に便利です）。非ループバック バインドでどちらの情報源もない場合、一時的なトークンを生成します。明示的に空の値の場合、非ループバック バインドでは起動を拒否します。ループバックでは環境変数を上書きし、信頼されたトークンなしモードを選択するか、`--require-auth` の下では完全に拒否します。 |
| `--require-auth` | `false` | ループバックであっても、Bearer トークンなしでの起動を拒否します。共有開発ホスト / CI ランナー / マルチテナント ワークステーションにおいて、ローカルユーザーがリスナーにアクセスできるリスクから `127.0.0.1` 開発者デフォルトを強化します。このフェイルファストはループバックのみです：ループバックは、その 3 つのトークン情報源のうちいずれかがある場合のみ起動します — `--token`、`QWEN_SERVER_TOKEN`、または `--open-with-auth`（起動前に独自に生成したトークンをインストールします。生成はループバックでは抑制されます）— 一方、非ループバック バインドでは、生成された一時的なトークンがフラグを満たします。`/health` も Bearer の背後でゲートします。 |
| `--enable-session-shell` | `false` | セッション シェルの直接実行を有効にします。設定された Bearer トークンまたは信頼されたループバック モードのいずれかで有効になります。呼び出しには依然として有効なセッションバインドの `X-Qwen-Client-Id` が必要です。 |
| `--tls-cert <path>` | — | PEM 証明書ファイルへのパス。HTTP の代わりに **HTTPS** で配信します。`--tls-key` とペアにする必要があります（片方だけ指定した場合は起動に失敗します）。ブラウザが通常の `http://` ではブロックする LAN IP 経由での安全なコンテキスト ブラウザ API — 音声入力 (`getUserMedia`)、WebRTC — を解放します。TLS ターミネーションのみ；自動生成 / ACME はありません。以下の [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) を参照してください。 |
| `--tls-key <path>` | — | PEM 秘密鍵ファイルへのパス。`--tls-cert` とペアにする必要があります。 |
| `--max-sessions <n>` | `32` | 同時アクティブ セッション数の上限。新しい `POST /session` リクエストで新しい子プロセスを生成する場合、上限に達すると `503` （`Retry-After: 5` を伴う）を返します。既存セッションへのアタッチはカウントされません。`0` に設定すると無効になります。`serve.maxSessions` でも設定できます（user、system、および system-defaults スコープのみ）；フラグが渡された場合、フラグが優先されます。単一ユーザー / 小規模チームの使用向けにサイズ調整されています；RAM/FD に余裕があるデプロイメントでは引き上げてください（セッションあたり約 30–50 MB）。 |
| `--max-total-sessions <n>` | `800` または導出 | すべての登録済みワークスペースランタイムにわたる、新規セッション作成に対するデーモン全体の任意の非負整数上限。新しい子セッション、セッション復元、およびブランチ/フォークで作成されたセッションに適用されます。既存のアクティブ セッションへのアタッチはスロットを消費しません。無制限の場合は `0` に設定します。登録容量が 25 を超える場合（デフォルトの 256 を含む）、デフォルトは 800 です。容量が 25 以下の場合、1 つの起動または復元されたワークスペースは無制限です；複数ある場合は、ワークスペースごとの制限と数から合計を導出します。後続の動的登録では再計算されません。 |
| `--max-pending-prompts-per-session <n>` | `5` | `POST /session/:id/prompt` が受け入れたがまだ確定していないプロンプトに対するセッションごとの上限。キュー内のプロンプトとアクティブなプロンプトを含みます。ブリッジは、`promptId` を返す前にオーバーフローを同期的に `503`、`Retry-After: 5`、および `code: "prompt_queue_full"` で拒否します。無効にする場合は `0` に設定します。`branchSession` は同じ FIFO で直列化されますが、このプロンプト上限にはカウントされません。 |
| `--workspace <path>` | `process.cwd()` | このデーモンによって登録される絶対ワークスペースディレクトリ。フラグを繰り返して 1 プロセスで複数のワークスペースをホストします；最初がプライマリであり、リクエストが `cwd` を省略した場合のデフォルトのままです。相対値は拒否されます。正規化された `cwd` が登録されていないセッションリクエストは `400 workspace_mismatch` を返します。 |
| `--conversations-dir <path>` | — | スタンドアロンおよび Live セッション用の絶対 Conversations 作業ディレクトリのルート。`QWEN_CONVERSATIONS_DIR` を上書きします；どちらも設定されていない場合、`~/Documents/Qwen Code/Conversations` を使用します。`qwen daemon start` でも受け入れられます。[Conversations working directory](#conversations-working-directory) を参照してください。 |
| `--memory-project-scope <mode>` | `workspace` | プロジェクトメモリのパーティショニングモード。`workspace`（デフォルト）はメモリを正確に登録されたワークスペースディレクトリでキー付けするため、各デーモンワークスペースは独自の分離されたメモリを持ちます；`git-root` は同じ Git ルートに解決されたワークスペース間で共有されるレガシー互換モードです。提供された場合 `QWEN_CODE_MEMORY_PROJECT_SCOPE` を上書きします；空の環境変数値は未設定として扱われますが、認識されない非空の値は一時的な警告とともに無視され、レガシーの `git-root` 動作を保持します。新しいデフォルトでは既存の git-root プロジェクトメモリは移行されません — 移行中にそれらのエントリを読み取るには明示的な `git-root` スコープを使用してください。 |
| `--channel <name\|all>` | — | 実験的なデーモン管理チャネルワーカー。フラグを繰り返して複数の設定済みチャネルを選択するか、`all` を渡してすべての設定済みチャネルを開始します。`all` は名前付きチャネルと組み合わせることができません。選択されたチャネル `cwd` の値は登録済みワークスペースに解決される必要があります；マルチワークスペースデーモンは所有ワークスペースごとに 1 つのワーカーを実行します。ワーカーは `qwen serve` が所有します；serve 管理チャネルを停止するにはデーモンを停止してください。 |
| `--max-connections <n>` | `256` | リスナーレベルの TCP 接続上限（`server.maxConnections`）。セッション数に関係なく生ソケット数を制限します — 遅い / 幽霊 SSE クライアントは満杯になると accept 時に拒否されます。デプロイメントがセッションごとに多くの SSE サブスクライバーを想定している場合は、`--max-sessions` と一緒に引き上げてください。 |
| `--memory-budget-mb <n>` | cgroup/ホストの 50% | デーモンプロセスツリー全体の総メモリ予算（MB）。未設定の場合、cgroup 制限またはホストメモリの 50% として導出されます；いずれの場合も実効値は解決された利用可能メモリで上限が設定され、設定値と実効値の両方が報告されます。これは `--child-heap-mode` によって選択される固定 ACP パーティションと適応ライブジャーナル成長を駆動します；これは総 RSS 制限ではありません：有効予算の 5% として導出されるデーモン全体の成長プール（`1024` MB で上限が設定されます；`insufficientMemory` を報告するホストではプールは 0 になり、適応成長は無効になります）はすべてのワークスペースブリッジで共有されます — `--max-journal-bytes` を参照してください。解決された数値は `GET /daemon/status` の `limits.memory` の下に表示され、登録済みおよびアクティブな子プロセスの数と `runtime.memory` の下の助言的な子プロセスごとのシェアが併記されます。最小限に対して小さすぎるホストは上方にクランプされるのではなく `insufficientMemory` を報告します；導出割合が 50% であるため、約 2 GB 未満のホストはこれに該当します。そのようなホストでは導出値を上書きするために明示的な `--memory-budget-mb 1024` を渡してください（フラグは警告をクリアするために少なくとも 1024 MB の利用可能メモリを必要とします）。`[1024, 1048576]` 内の整数でなければなりません。 |
| `--memory-pressure-mode <mode>` | `observe` | デーモンが自身のメモリ読み取りを判定結果に変換するかどうか。`observe`（デフォルト）は、`GET /daemon/status`内の`runtime.memory.pressure`で圧力レベルを報告し、レベルが`normal`から逸脱したときに`daemon_memory_pressure`の問題——`warning`であるため、全体の`status`は`ok`のまま——を発生させます。`off`は依然としてレベルを含むすべての数値を報告しますが、問題が発生しないため、全体の`status`は変更されません。調整中や、トップレベルのステータスでアラートを設定している場合はこちらを使用してください。レベルは2つの比率のうち悪い方です：利用可能なメモリに対するRSS（cgroup OOMキラーが監視するもの）と、このプロセスのヒープ上限に対するV8ヒープ使用量。これはデーモンのルートプロセスのみを対象とし、子プロセスと比較するには`runtime.memory.children.rssBytes`を参照してください。どちらのモードでも修復処理は行われません。`off`または`observe`のいずれか。 |
| `--child-heap-mode <mode>` | `observe` | `off`はパーティションを無効化します。`observe`は生成動作を変更せずに`limits.memory.childHeap`を報告します。`admit`はモデル化された同時子プロセス数のみを強制します。実験的なオプトイン`enforce`では、管理対象のACP子プロセスすべてに固定の`perChildCeilingMb`旧領域ヒープ上限を設定し、`limits.memory.enforced: true`を報告します。両方のアドミッションモードでは、`acp_child_capacity_exhausted`で拒否する前に1つのアイドル状態の適格なACPを回収することがあります。アクティブなセッションは保護されます。登録は子プロセスの容量とは独立しています。ゼロスロットのアドミッション設定は起動時に失敗します。継承された固定Nodeヒープフラグは`enforce`で正規化されます。パーセンテージフラグは競合するため拒否されます。上限はRSSやMCPの子孫ではなく、旧領域ヒープを制限します。有効にする前にワークロードを調整してください。拒否回数がゼロであってもヒープの安全性を保証するものではありません。モードと予算の変更にはデーモンの再起動が必要です。ヒープ強制をロールバックするには`admit`で再起動してください。 |
| `--event-ring-size <n>` | `8000` | セッションごとのSSE再生リングの深さ（#3803 §02ターゲット）。`GET /session/:id/events`と`Last-Event-ID: N`で利用可能なバックログを設定します。大きくすると再接続の余裕が増えますが、セッションあたり数百KBの追加RAMが必要になります。SDKクライアントはさらに、`?maxQueued=N`を通じて特定のサブスクリプションに対してより大きなサブスクライバーごとのバックログ上限をリクエストできます（範囲`[16, 2048]`、デフォルト256）。デーモンはまた、キュー充填率75%で非終端の`slow_client_warning` SSEフレームを発行し、クライアントが退避される前にドレイン/再接続できるようにします。プリフライト`caps.features.slow_client_warning`。 |
| `--compacted-replay-max-bytes <n>` | `4194304` | `POST /session/:id/load`によって返される有界スナップショット内の保持される再生イベントに対する、ライブセッションごとのバイト上限。この上限は`compactedReplay`に適用されます。現在の進行中の`liveJournal`は、`--max-journal-events`と`--max-journal-bytes`によって別途制限されています（適応的成長によって引き上げられる可能性のあるベースライン上限——`--max-journal-bytes`を参照）。値は正の安全整数でなければならず、不正な値はブート時に失敗し、ハード上限は256 MiBです。古い保持再生が破棄されると、スナップショットは`history_truncated`で始まります。これはディスク上のトランスクリプトを制限するものではありません。 |
| `--max-journal-events <n>` | `10000` | 現在の未完了ターンにおける進行中の`liveJournal`内に保持される再生エントリの、セッションごとのベースライン上限。連続する互換性のあるテキストまたは思考チャンクはエントリを共有し、エントリあたり最大256個のソースイベントを含みます。他のイベント境界は保持されます。超過した場合、デーモンはまず適応的成長を試みます（`--max-journal-bytes`を参照）。ヘッドルームが付与されない場合、または付与量が超過分をカバーできない場合、最も古いエントリが破棄され、`history_truncated`マーカーが前置されます。マーカーの`truncatedEvents`および`retainedEvents`カウントはソースイベントを記述します。正の安全整数でなければなりません。このフラグ（または`--max-journal-bytes`）をピン留めすると、適応的成長が無効になります。 |
| `--max-journal-bytes <n>` | `8388608` | 進行中の`liveJournal`に対する、セッションごとのベースラインバイト上限。互換性のあるチャンクが再生エントリを共有する場合でも、シリアル化されたソースイベントから計算されます。ターンが上限を超えると、適応的成長により、セッションの上限が倍に向けて引き上げられます（セッションごとのハード上限256 MiBまで、残りのプールヘッドルームによって制限されます）。ただし、デーモンのすべてのライブセッションにわたって付与される成長量は、デーモンの実効メモリ予算の5%サイズを持つ1つの共有成長プールに収まる必要があります——渡された場合の`--memory-budget-mb`値、解決済み利用可能メモリで上限設定、それ以外の場合は自動検出メモリの50%（`--memory-budget-mb`を参照）——`1024` MBで上限設定されます。`insufficientMemory`を報告するホストではプールは0であり、適応的成長は無効です。成長はオンデマンドで発生し、プールが許す範囲でのみ行われます。拒否された場合、プールが枯渇した場合、または付与量が超過分をカバーできない場合、最も古いエントリ全体が破棄されます（少なくとも1つのエントリは常に保持されるため）、保持される末尾は上限よりはるかに小さくなることがあります。このフラグ（または`--max-journal-events`）をピン留めすると、適応的成長が無効になります。正の安全整数でなければなりません。デフォルトは8 MiBです。 |
| `--mcp-client-budget <n>` | — | ライブMCPクライアントに対する正の整数上限。`mcp_workspace_pool`が広告されている場合、上限とトランスポートはワークスペースランタイムごとに共有されます。タグが存在しない場合、レガシーなセッションごとのマネージャーがこれを強制します。`--mcp-budget-mode`と組み合わせてください。未設定の場合、会計に基づく強制はありません（ただし`GET /workspace/mcp`は`clientCount`を引き続き報告します）。claude-codeの`MCP_SERVER_CONNECTION_BATCH_SIZE`とは異なります。後者は総ライブクライアント数ではなく、起動時の並行性をゲートします。プリフライト`caps.features.mcp_guardrails`および`caps.features.mcp_workspace_pool`。 |
| `--mcp-budget-mode <m>` | `warn` / `off` | `--mcp-client-budget`がどのように強制されるか。`warn`（予算設定時のデフォルト）：拒否なし、スナップショットの`budgets[0].status`は予算の≥75%で`warning`に切り替わります。`enforce`：上限を超える接続は拒否され、サーバーごとのセルには`disabledReason: 'budget'`が表示され、`mcpServers`宣言順による決定論的です。`off`（予算未設定時のデフォルト）：純粋な可観測性。ブート時は予算なしの`enforce`を拒否します。 |
| `--external-tool-guard-mode <m>` | `off` | 管理対象ACP外部事前実行ポリシー。`off`はプロバイダー呼び出しを行わず、機能を広告しません。`required`は、互換性のあるプロバイダーがv1ハンドシェイクを完了しない限り起動に失敗し、その後、単一のprepareリクエストが許可されない限り、サポートされているすべてのトップレベルツール呼び出しを閉じた状態で失敗させます。 |
| `--external-tool-guard-endpoint <url>` | — | `required`モードで使用される、ループバックHTTP(S)プロバイダーURL限定。例：`http://127.0.0.1:8787`。パス、URL認証情報、リダイレクト、非ループバックホスト、プロキシルーティングは受け付けられません。 |
| `--external-tool-guard-timeout-ms <n>` | `3000` | 整数`100..30000`。起動時ハンドシェイクと各prepareリクエストに個別に適用されます。 |
| `--http-bridge` | `true` | ステージ1モード：本番環境では、互換性のためにプライマリ`qwen --acp`子プロセスを1つプレヒートしようと試み、失敗後に初回使用時に再試行します。一方、信頼できるセカンダリはそれぞれオンデマンドで1つの子プロセスを開始できます。ランタイムを対象とするセッションは、ACP `newSession()`を介してその子プロセスに多重化されます。信頼できないセカンダリはACPを開始できません。ステージ2のネイティブ・インプロセスは後で利用可能になります。 |
| `--initialize-timeout-ms <n>` | `10000` | ACP子プロセスのリクエストタイムアウト（`initialize`ハンドシェイクを含む、ms）。`2147483647`までの正の整数でなければなりません。JSタイマー上限（`2^31-1`）を超える値は、Nodeによって暗黙的に1 msに圧縮されるため、ブート時に拒否されます。子プロセスの起動に追加の余裕が必要なコンテナ環境への展開では、これを引き上げることができます。同じ値が`newSession`、ワークスペースステータスポール、およびその他のACP ext-method期限にも適用されます。 |
| `--session-restore-timeout-ms <n>` | `60000` | ACP セッションの読み込み/再開の期限（ミリ秒）。正の整数で、最大 `2147483647` まで。`0` は無効です。省略した場合、デフォルトは 60 秒ですが、`--initialize-timeout-ms` が明示的に指定され、その値が大きい場合はそれに引き上げられます。より短い初期化タイムアウトによって復元予算が下がることはありません。SDK と Web Shell はそれぞれクライアント側の余裕として 10 秒と 15 秒を追加します。タイムアウトが発生すると再試行可能な `504 session_restore_timeout` が返されますが、これはデーモン自体が終了したことを意味しません。 |
| `--allow-origin <pat>` | — | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。ブラウザクライアント向けのクロスオリジン許可リスト。複数回指定可能。各値は `*`（任意のオリジン — ループバックバインドではベアラートークンが未設定の場合起動時に拒否されます。非ループバックバインドでは生成された一時的なトークンがこのガードを満たすため、拒否はループバック限定です。ループバックでは `--require-auth` を推奨します。これにより `/health` もベアラー認証で保護されるようになります。なぜなら、ループバックではデフォルトで事前認証なしだからです。Web Shell の静的アセットはすべてのモードで事前認証のままなので、それらを除外するには `--no-web` を渡してください）または正規化された URL オリジン（`<scheme>://<host>[:<port>]`、末尾スラッシュ / パス / ユーザー情報 / クエリなし）。正規化された **ループバック** オリジンはポートに `:*` を使用でき（`<scheme>://<loopback-host>:*`、例：`http://127.0.0.1:*`）、この場合そのホストを任意のポートで受け入れます。ベアラートークンが必要であり、ホスト名は完全一致する必要があります（`127.0.0.1`、`localhost`、`[::1]` は別々のエントリです）。REST CORS マッチャーと WebSocket CSRF ゲートの両方で尊重されます。トークンがない場合、HTTP(S) オリジンはループバックバインド上のループバックである必要があります。非ループバックバインドでは、生成されたトークンが同じガードを満たします。リモート HTTP(S) オリジンはすべての API ルートでベアラートークンによる認証を行います。事前認証の例外は、Web Shell ドキュメント/アセットルート、MCP App サンドボックス、独自の `x-qwen-webhook-secret` で認証するチャネル Webhook 受信、およびループバックバインド上の `/health` のみです（他の場所ではベアラートークンで保護されます）。ブラウザ拡張機能はローカルでトークンなしのアクセスを保持します。ホストおよびサブドメインのワイルドカード（`https://*.example.com`）は意図的にサポートされていません — 各ホストを明示的にリストするか、設定されたトークンとともに `*` を使用してください（完全な強化には `--require-auth` を追加）。上記のループバックポートワイルドカードが唯一のワイルドカード形式です。マッチしたオリジンは CORS レスポンスヘッダー（`Access-Control-Allow-Origin`、`Vary: Origin`、メソッド、ヘッダー、max-age、公開される `Retry-After`）を受け取ります。マッチしないオリジンは、現在の壁と同じエンベロープで 403 エラーを受け取ります。`Origin: null`（サンドボックス化された iframe、file:// ドキュメント）は常に拒否されます。`*` の下でも同様です。`caps.features.allow_origin` によるプリフライト。ループバックの自己オリジンヒットは影響を受けません。 |
| `--web` / `--no-web` | `true` | ビルド済みの Web Shell SPA をデーモンのルート（`GET /`、`/assets/*`、`/manifest.webmanifest`、`/sw.js`、および `GET /session/<id>` のドキュメントナビゲーション）で提供します。これらのエントリーポイントはベアラートークン認証ゲートの**前**に登録されます — ブラウザは `<script>` サブリソースやアドレスバーナビゲーションにトークンを添付できないため、シェルには秘密情報は含まれません。API リクエストはデーモンの通常の権限ポリシーに従います。設定されたトークンは、`--require-auth` が設定されていない限り、ループバック `/health` を除く通常の API ルートを保護します。チャネル Webhook 受信は常に独自共有シークレットを使用し、トークンなしの信頼できるループプライマリリスナーはフルオペレーターアクセスを持ちます。他のすべてのパスに対する SPA ディープリンクフォールバックはベアラートークンミドルウェアの後ろにあります。非ループバックバインドでは、UI が認証なしで到達可能であることを示す一行の stderr 警告が表示されます。API 専用デーモンの場合は `--no-web` を使用してください。ビルドが Web Shell アセットを含めない場合は効果はありません（デーモンはブレッドクラムをログに記録し、API 専用で実行されます）。 |
| `--open` | `false` | リスナーが起動した後、デフォルトブラウザでデーモン URL の Web Shell を開きます（トークンが解決された場合 — 設定済みまたは生成済み — フラグメントとして `#token=` を追加します。フラグメントはサーバーに送信されないため、アクセストークンがアクセスログや Referer ヘッダーに含まれるのを防ぎます）。`--no-web` の場合、またはブラウザが利用できないヘッドレス / CI / SSH 環境では何もしません。 |
| `--open-with-auth` | `false` | ループバック上でベアラートークン認証付きの Web Shell を開きます。有効な Web Shell とビルド済みアセットが必要です。設定されたトークンを再利用するか、プロセス寿命の 256 ビットベアラートークンを生成し、Web Shell のフラグメントで配信します。ブラウザ不適格な環境では、シークレットを含む手動 URL が表示されます。他のクライアントは、代わりに同じ明示的に設定された共有トークンが必要です。 |

> **メモリプロジェクトスコープの注意事項。**
>
> - **デーモン vs. スタンドアロン CLI。** フラグまたはデーモンの起動環境は、そのデーモンが所有するすべてのランタイムに対して一つの凍結されたスコープを設定します。ワークスペース `.env` または `settings.env` は、登録されたワークスペースに対してこれをオーバーライドできません。スタンドアロンの `qwen` TUI は依然として git-root スコープをデフォルトとします。両方のエントリーポイントを一致させるには、それらを起動するシェルまたはサービス環境で `QWEN_CODE_MEMORY_PROJECT_SCOPE` をエクスポートしてください。
> - **ディレクトリ名の衝突。** ストレージキーは `sanitizeCwd` によって導出され、非英数字文字はすべて `-` に置き換えられます。句読点のみが異なる兄弟ディレクトリ（例: `feature_1` と `feature-1`）は、`workspace` スコープ下でも同じメモリーディレクトリにマップされます。ワークスペース分離に依存する場合、そのような命名を避けてください。
> - **正規化はフラグと環境変数で異なります。** 環境変数はトリムされ小文字化されます（`"  Workspace  "` は機能します）。CLI フラグは yargs `choices` によって大文字小文字を区別して一致されます（`--memory-project-scope Workspace` は拒否されます）。両者の間でコピーする際は小文字の値を使用してください。

### 組み込みデーモンの Git 移動防止ガード

すべての管理されたデーモン ACP セッションは、`--external-tool-guard-mode` に関係なく、また機能アドバタイズメントなしで、モデルシェルのコマンドに対する組み込みの実行前ガードを適用します。デーモンはバインドされたワークスペースとセッションの現在有効な作業ディレクトリを所有します。どちらも信頼できるセッション状態から提供され、ACP サブプロセスからは受け付けられません。

ガードは、シェルコマンドラインを実行するツール（`run_shell_command` と `monitor`）を検査し、リポジトリの場所がセッションの実効的な作業ディレクトリの外に解決される場合、変更を伴う Git コマンドの実行前に拒否します。再配置は、`git -C <path>`、`git --git-dir[=]<path>`、`git --work-tree[=]<path>` のリテラルな形式、先頭の `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE` 代入（チェーン内のすべての後続コマンドの環境に保持する `export`/`declare`/`readonly` を介して行われた場合も含む）、ディレクトリ移動用のラッパーフラグ（`env -C`、`sudo -D`）、および同じコマンドチェーン内の先行する `cd`、`pushd`、または `popd` ビルトインによって認識されます。一般的なラッパープレフィックス（`sh -c`、`bash -c`、`eval`、`sudo`、`nohup`、`timeout`、`exec`、`command`、`builtin`、`env`、パス修飾付きの `git` バイナリ、および `{ …; }` / `! …` シェル構文）は展開され、内部の Git 呼び出しにも同じポリシーが適用されるようにし、`$(…)` またはバッククォート置換の本体は独立したコマンドとして解析されます。

独自のワークツリーに固定されたサブエージェントは、セッションのディレクトリではなくそのワークツリー内に制限されます。デーモンが実行ディレクトリを特定できないシェル呼び出しは拒否されます。

相対ターゲットは、正規化されたパス解決（`.git` gitfile リダイレクト、シンボリックリンク、ワークツリーごとの管理ディレクトリを含む）を行った後、コマンドの実効的な開始ディレクトリ（存在する場合は `arguments.directory`、それ以外の場合はセッションの現在の実効的な作業ディレクトリ）から解決されます。実行前に完全に解決できない再配置されたターゲット（動的ターゲット（`$VAR`、バッククォート、`~`、グローブ）、まだ存在しないパス、または読み取れない間接参照）は、変更を伴うまたは分類不能なサブコマンドに対して拒否されます。解決できない再配置されたターゲットは、サブコマンドの種類に関係なく（読み取り専用のものも含めて）拒否されます。サブコマンドが検証済みの小規模な読み取り専用セット（`rev-parse`、`cat-file`）に含まれる再配置されたコマンドは、ターゲットが解決されると許可されたままですが、コマンドがコマンドを実行する `-c` 設定を含む場合、または `--output`、`--textconv`、または `--filters` フラグを含む場合は除きます。これらのフラグはファイルを書き込むか、ターゲットリポジトリの設定済みドライバを実行します。認識された再配置がないコマンドは、既存の動作を維持します。拒否は最終的であり、解決済み、動的、または解決不可能なリポジトリの場所に対しては `Daemon shell guard denied a mutating Git command…` として、コマンドが解析できなかった場合、ペイロードが解決できなかった場合、または不明なプログラムが再配置された Git コマンドを実行する可能性がある場合には `Daemon shell guard denied a shell command…` としてモデルに報告されます。

ガードは、上記のリテラルな形式で記述された Git の再配置に対して信頼性があります（この制御が存在する誤ったターゲットへのコマンドです）。しかし、これを回避するために書かれたシェルのテキストに対しては **ベストエフォートであり境界ではありません**。静的リーダーから再配置を隠蔽する構成は通過する可能性があり、新しいものは今後も発見され続けます。この機能の強さだけを根拠に、デーモンにより広い信頼を与えないでください。スクリプトファイルを解釈せず、コマンド間で環境変数の値を追跡せず、ヒアドキュメントの本体を解析しません（ヒアドキュメント内の Git 形状のテキストは、シェルが実行しないにもかかわらず拒否されることがあります）。`/fork` とエージェント対応のワークスペースメモリ remember/dream は、組み込みガードの下で利用可能です。これらは、以下の外部プロバイダーモードがアクティブな場合のみ制限されます。オプションの外部ツールガードは追加のポリシーとして残っており、組み込みポリシーが許可した場合にのみ同じリクエストを受け取ります。

### 必須の外部 Tool Guard

このオプトインは、最終的なツール実行者境界での外部許可/拒否判断を必要とする管理された ACP デプロイメント向けです。`--external-tool-guard-mode=required` が存在する場合を除いて、完全に無効です：

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

プロバイダーは `POST /v1/handshake` と `POST /v1/prepare` を公開し、`Authorization: Bearer <token>` を要求し、JSON を返し、提供されたノンスまたはリクエスト ID をエコーし、プロトコルバージョン `1` を使用する必要があります。トークンは空白以外で、最大 8192 UTF-16 コードユニットであり、制御文字を含んではいけません。リクエストは 1 MiB に、レスポンスは 64 KiB に、制御文字を含まないオプションの拒否理由は 500 UTF-16 コードユニットに制限されます。成功した prepare レスポンスは次のようになります：

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

拒否には `allowed:false` を使用し、短い `reason` を追加できます。既存の権限および `PreToolUse` ゲートを通過し、最終的な実行境界に到達する各サポートされているトップレベルのツール呼び出しについて、Qwen Code は 1 つの prepare リクエストを送信し、再試行しません。以前の権限/フックによる拒否では prepare リクエストは送信されません。タイムアウト、キャンセル、転送障害、不正または不一致のレスポンス、明示的な拒否は、実行者による実行を防止します。各生成された ACP チャネルは、必要なコールバックをインストールしたことを確認する必要があります。欠落または互換性のない確認応答は、Session 作成前にチャネルを拒否します。プロバイダーリクエストには `sessionId`、`promptId`、`toolCallId`、正規化された `toolName`、および最終的な `arguments` が含まれます。`toolCallId` は相関ラベルであり、認証アイデンティティや単独の冪等性キーではありません。

最終的な引数には機密性の高いアプリケーションデータが含まれている可能性があります。プロバイダーログと監査ストレージではそのように扱ってください。

`PreToolUse` フックはこの最終的な実行者判断の前に実行されます。必須ガードモードはフックの動作を認可したりサンドボックス化したりしません。あらゆる可能な副作用に対する境界が必要なデプロイメントでは、フックを無効にするか、その実装を別途管理する必要があります。

スラッシュコマンドのアクションもモデル/ツールのスケジューリングの前に実行され、Guard の呼び出しではありません。一部の組み込みコマンドはファイルや設定を直接変更する可能性があります。すべての影響に対する境界が必要な管理されたデプロイメントでは、スラッシュコマンド入力を拒否するか、`slashCommands.disabled` または `--disabled-slash-commands` を通じて承認されていないすべてのコマンドを無効にする必要があります。

v1 の管理スコープは、アクティブなフォアグラウンド管理 Prompt によって呼び出されるトップレベルツールです。必須モードが有効な間、ネストまたは委譲する `agent`、`workflow`、`create_sub_session`、`send_message`、直接の `/fork`、およびエージェントバックエンドのワークスペースメモリ remember/dream 制御は拒否されます。トップレベルのバックグラウンドシェルまたはモニターの開始は依然として 1 つのガード付き呼び出しであり、その最終引数はプロバイダーに届きますが、この機能はプロセスを継続的に許可したり、プロセス完了監査プロトコルを追加したりしません。フォアグラウンド完了を必要とするポリシーはそれらの形状を拒否すべきです。ガード付き MCP 呼び出しは、トランスポートエラー後の自動再接続/再送信も無効にします。正常な起動ハンドシェイクの後、`/capabilities` は `external_tool_guard` を広告します。その不在は、クライアントが強制執行を想定してはならないことを意味します。

この機能は明示的なデーモン REST/ACP 管理呼び出しを許可しません。それらは引き続きデーモンの既存の認証とルート契約を使用します。また、許可されたツールやシェルコマンドを決定的にしたり、その内部をサンドボックス化したりもしません。管理されたデプロイメントは、プロバイダーの決定を通常のツールポリシーと分離境界と組み合わせる必要があります。

> **負荷調整ノブのサイジング。** `--max-sessions` はワークスペースごとの新規セッション上限です。`--max-total-sessions` はデーモン全体の新規セッション上限です。省略した場合、デフォルトの登録容量である 256 で 800 に設定されます。他の 3 つのレイヤーも負荷を制限します — 高並行性デプロイメント用にサイジングする場合、これらを一緒に調整してください:
>
> - **リスナーレベル**: `--max-connections` / `server.maxConnections=256` は生 TCP 接続を制限します (低速クライアントのバックプレッシャー)。
> - **セッションごとのサブスクライバー**: EventBus はデフォルトでセッションごとに SSE サブスクライバーを 64 に制限します。65 番目のクライアントは終端の `stream_error` を受け取り、クローズされます。
> - **セッションごとのプロンプトアドミッション**: `--max-pending-prompts-per-session=5` は 1 つのセッションに対して受け入れられるキューイング + アクティブなプロンプトを制限します。オーバーフローは `Retry-After: 5` を伴う `503` になります。
> - **デーモン全体の新規セッション**: `--max-total-sessions=N` はデーモン全体での新規セッション作成を制限します。オーバーフローは `scope: "total"` を伴う同じ `session_limit_exceeded` の形状になります。
> - **サブスクライバーごとのバックログ**: SSE クライアントごとに 256 フレームのキュー。容量を超えたクライアントは終端の `client_evicted` フレームを受け取り、クローズされます (1 つの遅いコンシューマーがデーモンをピン留めすることはできません)。
>
> これらの上限は相互に影響します: 各ランタイムは `--max-sessions` によって制限され、`--max-total-sessions` はその集計値を制限します。実効的なセッション上限は、有限のデーモン全体の上限と集計されたランタイムごとの上限のうち低い方です (ワークスペースごとの上限が無制限の場合、その集計値は無制限として扱ってください)。どちらも有限でない場合 — デフォルトの登録容量では `--max-total-sessions 0` が必要になります — 有限のセッション上限はありません。有限の上限 × 64 サブスクライバー × 256 フレームは、EventBus レイヤーでの最悪ケースのインフライトメモリです。これを `--max-pending-prompts-per-session` と掛けると、アドミッションレイヤーでの受け入れられたプロンプト作業を制限します。デフォルトのサイジングは単一ユーザー / 小規模チームの負荷を想定しています。より大規模なデプロイメントでは段階的に引き上げ (RSS を監視)、調整してください。

> **MCP クライアントのガードレール（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** `mcpServers` で 30 の MCP サーバーを宣言しているワークスペースは、上限を設定しない限り、上流のキャップなしで 30 のクライアントを起動します。`--mcp-client-budget=N` は稼働中の MCP クライアント数を制限し、`--mcp-budget-mode={enforce,warn,off}` で動作を選択します。予算が設定されている場合のデフォルトは `warn` です（スナップショットは警告を表示しますが、クライアントは拒否されません。強制モードに切り替える前に実際のファンアウトを測定するのに便利です）。`enforce` モードで拒否されたサーバーは、サーバーごとのセルに `disabledReason: 'budget'` を取得し、`budgets[0]` セルには `status: 'error'` と `errorKind: 'budget_exhausted'` が表示されます。スロットの予約はサーバー名ごとに行われ、再接続や検出タイムアウト後も維持されます。拒否されたサーバーが正常なサーバーからスロットを奪うことはありません。
>
> **現在のスコープはケーパビリティ駆動です。** `mcp_workspace_pool` が存在する場合、1 つのワークスペースランタイム内のすべてのセッションがその MCP トランスポートプールとバジェットコントローラーを共有します。`GET /workspace/mcp` は `scope: 'workspace'` を出力します。2 つ目のワークスペースは独立したプールとバジェットを持ちます。タグがない場合（`QWEN_SERVE_NO_MCP_POOL=1` を含む）、デーモンはレガシーなセッションごとの `McpClientManager` を使用し、`scope: 'session'` を出力します。そのフォールバックでは、N 個のセッションがそれぞれ設定された上限を消費する可能性があります。
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> これは claude-code の `MCP_SERVER_CONNECTION_BATCH_SIZE`（起動時の同時実行を制限するもの）とは**同じではありません**。これらは直交するものです。クライアントは `mcp_workspace_pool` で分岐する必要があり、プロトコルバージョンだけではスコープを想定してはなりません。
>
> **プッシュイベント（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）。** `GET /session/:id/events` をサブスクライブしている SDK クライアントは、予算のしきい値を超えたときに型付きフレームを受け取ります。`mcp_budget_warning`（合成フレームで、75% を超えるたびに 1 回発生し、37.5% でヒステリシス再武装され、`mcp_guardrail_events` 経由で通知されます）と `mcp_child_refused_batch`（`enforce` モードでの検出パスごとに 1 回に統合されます。`readResource` の遅延生成拒否による長さ 1 のフレーム）です。`GET /workspace/mcp` のスナップショットは、再接続後の状態の信頼できる情報源です。イベントは変化のエッジです。ポーリングなしでリアルタイムにダッシュボード化する際に便利です。

## デフォルトのデプロイメント脅威モデル [#default-deployment-threat-model]

- **ループバックのみ** — `127.0.0.0/8`、`localhost`、または `::1`。認証は不要です。
- **`localhost` は 1 回だけ解決され、ピン留めされ、リッスン後に検証されます** — 実際のリスナーアドレスが `127.0.0.0/8` または `::1` の外側にある場合、トークンなしの起動はリスナーをクローズして失敗します。
- **`--hostname 0.0.0.0` にはトークンが必要です** — トークンソースがどちらも提供されていない場合に生成されます; 明示的に空のソースでもフェイルクローズします。
- **`LOOPBACK_BINDS` には IPv6 が含まれる** — `::1` および `[::1]` は、トークン不要ルールにおいてループバックとしてカウントされます。
- **Host ヘッダー許可リスト** — **ループバック** バインドでは、デーモンは `Host:` が `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` または正確なバインドされたループバックアドレスとポート (RFC 7230 §5.4 に従い大文字小文字を区別しない) と一致するかを確認し、DNS リバインディングに対抗します。ポート 80 または 443 でリッスンしている場合、ブラウザがスキームデフォルトポートを省略するため、対応するポートなしの形式も受け入れられます。これは完全な IPv4 ループバック範囲 (`127.0.0.0/8`) をサポートしますが、無関係な Hosts は受け入れません。 **非ループバックバインド (`--hostname 0.0.0.0`) は意図的に Host 許可リストをバイパスします** — オペレーターがサーフェス領域を選択しているため、ベアラートークンゲートが通常の API ルートの唯一の認証レイヤーです; リバースプロキシ / SNI / クライアント証明書ピンニングはオペレーターの責任であり、デーモンのものではありません。非ループバックバインドで Host ベースの分離が必要な場合は、フロントプロキシで TLS を終了し Host を確認してください。
- **CORS はデフォルトでブラウザの Origin をすべて拒否** — `403` JSON を返します。特定のブラウザ origin を許可するには **`--allow-origin <pattern>`**（繰り返し指定可、T2.4 #4514）を渡してください。各値はリテラルな `*`（任意の origin — **ループバック** バインドではベアラートークンが未設定の場合起動を拒否し、非ループバック バインドではトークン生成により提供されるため起動可能；完全な強化のためにはループバックでの `--require-auth` が推奨されます。なぜなら `/health` はデフォルトでループバック上でも認証前であるためです — Web Shell の静的アセット（`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals`, および `/settings` ドキュメントナビゲーション）はすべてのモードでベアラートークンの前にマウントされ、`--require-auth` 下でも認証前のまま残るため、残存するブラウザ表面が重要であれば `--no-web` を使用してください）または正規化された URL origin（`<scheme>://<host>[:<port>]`、末尾スラッシュ / パス / userinfo なし）。ループバック ホストは代わりにポートワイルドカード（`<scheme>://<loopback-host>:*`）を使用できます。これは設定済みのベアラートークンを必要とし（未設定の場合は起動を拒否）、スキームとホストを正確に一致させます（`127.0.0.1`, `localhost`, および `[::1]` は別々のエントリです）。また、REST 専用の `*` を除いて唯一のワイルドカード形式です。**ループバック** バインドでトークンがない場合、HTTP(S) エントリはループバック ホストを使用しなければなりません。非ループバック バインドは常にトークンを伴います — 提供されたものまたは生成されたもの — これはリモートでホストされたブラウザ origin がオペレーター API を通じてデーモンユーザーとしてコードを実行できる可能性があるためです。明示的なブラウザ拡張機能の origin は、トークンなしのローカル自動化パスを保持します。一致した origin は適切な CORS レスポンスヘッダーを受信します（`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`、さらに標準的なメソッド / ヘッダー / max-age と公開された `Retry-After`）。一致しない origin は、デフォルトの壁と同じエンベロープで 403 を受け取ります。`caps.features.allow_origin` は条件付きで広告表示されるため、SDK / webui クライアントはクロスオリンヒットを発行する前にデーモンがそれらを尊重するかどうかをプリフライトできます。例：`qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`。ループバックのセルフ origin ヒット（例えば Web Shell UI）は影響を受けません — 別の Origin-strip シムが `--allow-origin` に関係なくこれらを処理します。組み込みのリモート Web Shell の同一 origin **HTTP** リクエストも `--allow-origin` なしで動作します：非ループプライマリリスナーでは、直接ソケットスキームと正規化された `Host` オーソリティに等しい `Origin` はベアラートークンで認証され、その後 CORS 壁の前に除去されますが、既存の公開静的ルートは認証なしのまま残ります。2 つの除外項目はまだ `--allow-origin` を必要とします — フォワードされたヘッダーは同一 origin の信頼を確立しないため、TLS 終端リバースプロキシの `https` ブラウザ origin は同一 origin ではありません（そして `Host` ヘッダーを書き換えるプレーン HTTP 中間者、例えば nginx のデフォルトの `proxy_set_header Host $proxy_host` や k8s Ingress も同様です。その場合の対策は、ブラウザが見る origin に対して `--allow-origin <origin>` を使用するか、`Host` をそのまま転送するプロキシを使用することです — ポート変換だけでは何も必要ありません。比較されるのはフォワードされた `Host` のみであり、スキームデフォルトの `:80`/`:443` のみが除去されるためです）。WebSocket アップグレードルート（ターミナル、音声）は、同じポートのループバック origin、明示的に許可リストに登録された origin（ループバックポートワイルドカードを含む）、および Local Control リスナー自身の origin のみを許可する、別の CSWSH ゲートを維持します。リテラルな `*` はそこでは適用されません。
- **Chrome 拡張ブラウザ自動化はフレーミングとは別です。** `qwen serve --allow-origin chrome-extension://<id>` により、拡張機能が Web Shell をフレームしてデーモンに接続できます。コンソール / ネットワーク / スクリーンショット / クリックツールには外部 CDP MCP アダプターコマンドが必要です。`QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`。メイン CLI パッケージにはブラウザ自動化アダプターがバンドルされていません。クライアントはそれらのツールを利用可能として表示する前に `caps.features.includes('browser_automation_mcp')` を確認できます。
- **spawn された `qwen --acp` 子プロセスは、所有するランタイムの実効環境を受け取ります。** デーモンはプロセス環境ベースをフリーズし、そのワークスペースの設定/env-file オーバーレイをランタイムローカルのスナップショットに適用しますが、オーバーレイを `process.env` に書き戻すことは決してありません。別のランタイム内の同名キーは混在しません。エージェントはデーモンのベアラートークンを必要としないため、`QWEN_SERVER_TOKEN` は spawn 前にスクラブされます。ローダーに影響する変数（`NODE_OPTIONS`, `npm_config_node_options` および npm の config-file リダイレクト、`NODE_PATH`, `OPENSSL_CONF`, `NODE_REPL_EXTERNAL_MODULE`, `npm_config_node_gyp`, `npm_config_init_module`, `LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `ZDOTDIR`、エクスポートされた bash 関数定義 `BASH_FUNC_*`）も同様にセッションサブプロセスには渡されません — デーモンは自身の `process.env` から、およびセッションホスティングの子プロセスが spawn 時に使用するフリーズされたベース環境からこれらをスクラブします（ベース環境はこれらの変数を `DEV=true` ハーネス下でのみ保持します。その `.ts` エントリは依然として tsx ローダーを必要とします）。また、`.env` / `settings.json` `env` ソースはこれらを拒否します（[settings](./configuration/settings.md) を参照）。これはデーモンがホストするすべてのセッションに適用されます。`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_*`, および `DASHSCOPE_API_KEY` などの基本資格情報は、ランタイムオーバーレイによって変更されない限り通過します。**これは意図的なものであり、サンドボックスではありません。** エージェントは同じ UID でシェルツールアクセスとともに実行されるため、`~/.bashrc`, `~/.aws/credentials`, または `~/.npmrc` 内のものはプロンプトインジェクションによっていずれにせよ到達可能です。ランタイム間の環境分離はオペレーティングシステムのセキュリティ境界ではありません。エージェントに信頼できない資格情報を持つ ID で `qwen serve` を実行しないでください。
- **エージェントのテキスト読み取りは子プロセスローカルであり、ワークスペースファイルシステムのバウンダリではなく、通常の CLI 権限ルールに従います。** 直接の `read_file` は、登録されたワークスペース外のホストテキストパスに到達できます。外部パスはデフォルトで確認が必要ですが、許可ルールや承認モードによって自動的に承認される場合があります。承認された読み取りは、ワークスペースファイルシステムの返却出力、フルスナップショット、および大型テキストスキャンのキャップではなく、設定可能な CLI 出力制限を使用します。これは共有テキスト読み取りコンシューマーすべてに適用されるため、write、edit、notebook、sed、および artifact 操作が実行するプリリードは、ワークスペースファイルシステムの読み取り監査、シンボリックリンク拒否、および読み取り側の TOCTOU 保護とともにそれらのキャップを失います — 正確なリストについては[リードのデザイン](../design/daemon-local-text-reads.md)を参照してください。確認ペイロードはファイルを読み取ることで構築されるため、ワークスペース外の差分は誰かが承認する前に**すべての**接続された SSE サブスクライバーにファンアウトされます — インタラクティブ CLI では、その内容はターミナルにいる人にのみ表示されます。認証されたデーモンクライアントも同じセキュリティプリンシパルとして扱ってください。HTTP ファイルシステムルートはワークスペーススコープのままであり、エージェントの検出ツールの動作は変更されません。
- **ビルトインのテキストツールによる承認済みの最終書き込みには、狭い同一ホストのルートがあります。** `write_file`、`edit`、`notebook_edit`、およびシェルツールのシミュレートされた sed エディタは、既存の権限ポリシーが実行を許可した後にのみ内部の出所を添付します。したがって、最終的な ACP テキスト書き込みは、2 回目の確認なしに所有ワークスペース外の絶対パスをターゲットにできます。許可ルール、AUTO/AUTO_EDIT、および YOLO は CLI と同じように動作します。一方、拒否、Plan、Hook/Guard の拒否、および実行前のキャンセルは最終書き込みを送信しません。キャンセルがツールがすでにキャンセル不可能なファイルシステム操作に入った後に行われた場合、そのツールの既存の動作が保持されます。ワークスペースのターゲットは引き続き WFS を使用します。外部のターゲットは、同じ信頼スナップショット、5 MiB のエンコードされた制限、leaf シンボリックリンクの拒否、正規パスロック、アトミックなリネーム、モードの保持、`0600` の新規ファイルモード（デフォルト — 設定可能 — [エージェントのテキスト書き込みの新規ファイルモード](#new-file-mode-for-agent-text-writes)を参照）、世代ガード、およびファイルシステム監査を備えたデーモンホストライターを使用します。HTTP 書き込み、一般またはマークのない ACP 書き込み、注入されたブリッジ / ワークスペースレジストリ / ファクトリの統合、および任意のシェルリダイレクトはこの例外を受け取りません。[外部書き込みのデザイン](../design/daemon-external-tool-text-writes.md)を参照してください。
- **サブスクライバーごとの制限付き SSE キュー** — キューをオーバーフローさせた低速クライアントは `client_evicted` ターミナルフレームを受け取り、クローズされます。1 つの停滞したコンシューマーがデーモンを占有することはありません。
- **セッションごとのプロンプトアドミッションキャップ** — デフォルトでセッションあたり 5 つの受け入れ済みだが未解決のプロンプトに制限されます。バグのあるクライアントは、1 つのセッションに対して無制限のプロミスや一時的な SSE 待機をキューに入れることはできません。
- **グレースフルシャットダウン** — SIGINT/SIGTERM は、リスナーをクローズする前にエージェントの子プロセスをドレインします（子プロセスあたり 10 秒のデッドライン）。

> ⚠️ **権限投票は現在セッションスコープです — さらに常設の共有ベアラートに関する注意があります。** `POST /session/:id/permission/:requestId` を優先してください（Wave 4 / F3）：これは名前付きライブセッションを所有するランタイムにルーティングされ、プライマリブリッジへのフォールバックは行いません — 新しいマルチワークスペース統合はこのルートを常に使用すべきです（プリフライト `caps.features.session_permission_vote`）。レガシーのプロセスグローバルな `POST /permission/:requestId` は F3 以前の単一ワークスペースクライアントのために残されています：これはプライマリにバインドされており、他の登録済みランタイムが所有するセッションに対しては `404` を返します — デフォルトの `first-responder` ポリシー下での失われた投票と同じボディです — そのため、そこで `404` が返ったとしても、リクエストがすでに回答済みであることを意味するものではありません。ルートテーブル：[daemon REST API reference](../developers/daemon-rest-api-reference.md#permissions)。常設の注意：ベアラートークンを保持しているすべてのクライアントは同じセキュリティプリンシパルです — 信頼できない関係者と共有されているベアラートの裏側で `qwen serve` を実行しないでください。
>
> ⚠️ **Stage 1 の既知のギャップ — `POST /session/:id/prompt` ボディは 10 MB に制限されています（BUy4L）。** 画像 / PDF / 音声を含み 10 MB を超えるマルチモーダルプロンプトは、ルートロジックが実行される前のボディ解析段階で失敗します（ストリーミングなし、アップロード途中の中断なし）。回避策：コンテンツをクライアント側で縮小するか、パス参照を渡してエージェントが `readTextFile` を介してファイルを読み取れるようにしてください。Stage 1.5 では `/prompt` 上で `multipart/form-data` またはチャンクエンコーディングを受け入れ、大きなプロンプトが急激な制限に引っかからないようになります。
>
> ⚠️ **ステージ 1 の既知のギャップ — NAT の背後にある幻覚 SSE 接続。** デーモンはハートビート (15 秒間隔) 上の TCP バックプレッシャーを通じて死んだクライアントを検出します。TCP RST なしで消えるクライアント (例えばアイドルフローを黙ってドロップする NAT ボックス) は、Node のキープアライブプローブがタイムアウトするまでカーネルレベルのソケットを「生存」させ続けます — Linux のデフォルトでは通常約 2 時間かかります。そのような NAT の背後にある `--hostname 0.0.0.0` デプロイメントでは、幻覚 SSE 接続が蓄積し、最終的に 256 `server.maxConnections` 上限に達することがあります。
>
> [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout) (issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9) を設定して、明示的なアプリケーションレベルのアイドル期限によりギャップを解消します: `n` ms の間に書き込みが正常にフラッシュされなかった場合、デーモンは `reason: 'writer_idle_timeout'` を伴う終端の `client_evicted` フレームを発行し、ストリームをクローズします。このフラグはレガシー契約を維持するためにデフォルトでオフです。RST を飲み込むネットワーク上のオペレーターは、正当なアイドル接続が退去されないように、かつ本当にスタックした書き込み手が速やかに回収されるように、15 秒のハートビート間隔よりも十分に大きい値 (例えば `60000`–`300000`) を選択する必要があります。SDK から `caps.features.includes('writer_idle_timeout')` を事前チェックして、デーモンがそれをサポートしていることを確認してください。

### 期限と書き込み側アイドルタイムアウト [#deadlines-and-writer-idle-timeout]

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 では、15 秒のハートビート + AbortSignal ではカバーできない長時間実行 / リモートデプロイメントのギャップを埋める 2 つのオプトインフラグが提供されます。共有パーミッションレスポンスタイムアウトもここに記載されています。すべてデフォルトでオフになっています。

| フラグ                           | 環境変数                             | デフォルト | 動作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>` | `QWEN_SERVE_PROMPT_DEADLINE_MS` | 未設定 | 単一の `POST /session/:id/prompt` に対するサーバー側の壁時計時間の上限です。期限切れになると、デーモンはプロンプトの AbortController を中断し、HTTP `504` と `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}` を返します。プロンプトごとのリクエストボディフィールド `deadlineMs` により、有効な期限をフラグの値より短くできますが、長くすることはできません。機能タグ (条件付き): `prompt_absolute_deadline`. |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | 未設定 | SSE 接続ごとのアイドル期限です。`n` ms の間、実際のイベントも 15 秒のハートビートも含めて書き込みが正常にフラッシュされなかった場合、デーモンは `data.reason = 'writer_idle_timeout'` を含む終端 `client_evicted` フレームを送信し (`data.errorKind` にも反映)、ストリームをクローズします。**15 秒のハートビートより十分に大きい値を選択してください** (例: `30000`–`300000`)。これにより、正当なアイドル状態のストリームが追い出されないようにします。値が `< 15000` の場合、最初のハートビートが発火する前に健全なアイドル接続が追い出されます (テストや短期間の開発セッションのみを意図しています)。機能タグ (条件付き): `writer_idle_timeout`. |
| `--permission-response-timeout-ms <n>` | —                         | `0`     | デーモンモードでの通常のパーミッションおよび `ask_user_question` レスポンスの共有壁時計。`0` またはフラグの省略は無期限に待機します。正の整数は両方にデッドラインを課します。投票者のキャンセル、セッションのキャンセル、およびデーモンのシャットダウンは、タイマーが無効な場合でも保留中のインタラクションを解決します。 |

プロンプトおよび書き込み側のフラグは、ミリ秒単位の正の整数を受け入れます。`0`、`NaN`、非整数、または負の値は、明確なエラーメッセージとともに起動時に拒否されます。権限応答タイムアウトは `0` または正の整数を受け入れます。環境変数に基づく 2 つの期限について、明示的な `ServeOptions` フィールドは環境変数の値より優先されます。SDK コンシューマーは、プロンプトおよび書き込み側の動作に依存する前に、対応する機能タグを事前確認すべきです。

### エージェントのテキスト書き込みの新規ファイルモード [#new-file-mode-for-agent-text-writes]

エージェントのテキスト書き込み（`write_file`、`edit`、`notebook_edit`、およびシェルツールのシミュレートされた sed エディタ）は、デーモンのアトミックライターを通じて公開されます。既存のターゲットのモードを保持し、**新規**ファイルの場合はオーナーのみがアクセス可能な `0600` をデフォルトとし、デーモンプロセスの umask を無視します。このフェイルクローズなデフォルトは意図的なものです。新しく作成されたファイルは、スーパーバイザーの umask がどれだけ寛容であっても、誤ってグループ/ワールドから読み取り可能になることはありません。

umask 駆動のデプロイメント規則を持つオペレーター（例: `UMask=0002` の systemd ユニット、共有グループリポジトリ）は、新規ファイルを標準的な POSIX 処理にオプトインできます。

| 環境変数 | 値 | デフォルト | 機能 |
| -------------------------- | ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE` | `owner` \| `system` | `owner` | `system` は新規ファイルを `0o666 & ~umask` で作成し、エージェントが作成したファイルがマシンの他のプロセスと同様にデーモンプロセスの umask に従います。`owner` は umask に依存しない `0600` のデフォルトを保持します。値は大文字小文字を区別しません。リテラル `0600` は `owner` のエイリアスとして受け付けられます（他の8進モードはサポートされていません）。それ以外の値は stderr に警告を出して拒否され、`0600` のデフォルトが保持されます。 |

スコープと制限:

- テキスト書き込みルートによって作成された新規ファイルに適用されます（ワークスペースターゲット、同一ホストの外部ホストライター、および HTTP テキスト書き込み）。既存のファイルは常にディスク上のモードを保持します。`0600` のシークレットを編集しても `0600` のまま、実行可能ファイルは `+x` を保持します。
- バイナリアップロード（`POST /file/upload`）は、この設定に関係なく常に `0600` で作成されます。
- デーモンはワークスペースファイルシステムの構築時にこの変数を読み取ります。変更後はデーモンを再起動してください。

### 会話作業ディレクトリ [#conversations-working-directory]

スタンドアロンおよび Live セッションの作業ディレクトリのルートは、OS のホームとは独立して設定できます:

```bash
qwen serve --conversations-dir /persistent/qwen-conversations

# Or configure the launch environment:
QWEN_CONVERSATIONS_DIR=/persistent/qwen-conversations qwen serve

# The same option is available for a detached daemon:
qwen daemon start --conversations-dir /persistent/qwen-conversations
```

明示的なフラグは、起動環境またはユーザーレベルの`.env`ファイルから取得される`QWEN_CONVERSATIONS_DIR`よりも優先されます。埋め込みランチャーは`ServeOptions.conversationsDir`を使用して同じルートを選択でき、これも環境設定よりも優先されます。どちらも設定されていない場合、ルートは`~/Documents/Qwen Code/Conversations`のままになります。そのデフォルトパスに永続ボリュームをマウントするか、プロセスのホームディレクトリを変更することも、有効なデプロイ選択肢です。

明示的な値は、NUL 文字を含まない空でない完全修飾絶対パスである必要があります。相対パス、展開されていない `~`、および現在のドライブに依存する Windows パスは拒否されます。値はトリミングされず、無効な設定はフォールバックせず起動失敗となります。有効な明示的なフラグまたは API オプションは、無効な環境変数の値を上書きします。パス構文はリスニング開始前にチェックされますが、ディレクトリ作成とファイルシステムチェックは遅延実行されるため、使用されていない会話ルートは起動時に作成されません。初回使用時のファイルシステム障害では別のルートは選択されません。

この選択はデーモンの生存期間中固定されます。プロジェクト `.env` およびプロジェクト `.qwen/.env` ファイル、すべてのスコープでのトップレベル `settings.json` `env`、環境のリロード、およびブラウザ/セッションのリクエストによって再指定されることはありません。対応するプロジェクト設定やセッションごとのルートオプションはありません。

スタンドアロンと Live は既存の会話ランタイムを引き続き共有します。各セッションは、決定論的なプライベートな `conversation-<sha256(normalized session ID)>` 直接子要素をツールおよびシェル作業ディレクトリとして使用します。既存の所有権、プライベート POSIX 権限、正規 ID、直接子要素、リンク/リパース、書き込みリース、および復元チェックは引き続き適用され、プラットフォーム固有の制限も含まれます。Windows では POSIX オーナー/モードや ACL の保証は追加されず、検証可能な inode ID を持たないファイルシステムでは、同じパスへの置き換えをすべて検出できるわけではありません。選択された会話ツリーは通常のワークスペース登録から予約されたままです。他のワークスペースは既存のルールを保持します。

作業ルートとランタイムストレージには別々の責任があります:

| データ | 場所 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| セッション作業ファイル | 選択された会話ルートの下のプライベートなセッション子要素。 |
| 共有ルート設定 | 選択されたルートの下にあるユーザー作成の設定で、そのセッション間で共有されます。 |
| トランスクリプトとサイドカー | 正規化された会話ランタイム cwd をキーとする既存のデーモンランタイムベースストレージ。 |
| 削除復元ジャーナル | 安定した `<home>/.qwen/conversations/deletions` 名前空間。 |
| Live 検出 | 安定した `<home>/.qwen/live/daemon.json` ロケーターと、該当する場合のそのデーモンランタイムベースのコピー。 |
| ローカルデーモン検出 | デーモンランタイムベースの下にある `daemon/daemon-<port>.json`。再起動のために選択された会話パスを記録します。 |

`QWEN_HOME` はグローバル Qwen 設定ディレクトリを選択します。`QWEN_RUNTIME_DIR` と `advanced.runtimeOutputDir` は既存の優先順位ルールを通じてランタイム出力ストレージを選択します。いずれも会話作業ディレクトリのルートは選択しません。ランタイムストレージのみを永続化しても、プライベートセッションディレクトリで作成されたファイルは永続化されません。作業ルートのみを設定しても、ランタイムストレージやホームベースの復元・検出状態は保持されません。

同じルートでの再起動の場合、同じ正規化されたパス、ランタイムベース、および必要な制御状態を保持してください。`qwen daemon restart` は現在の検出レコードからルートを保持し、自動更新による再起動でも選択されたルートが保持されます。通常のファイルシステム ID 受け入れ、権限、書き込みリース、および復元チェックは引き続き実行されます。これは、すべてのコンテナまたはホストの再起動後の復元を保証するものではありません。[会話書き込みロックと復元](./conversations-recovery.md) を参照してください。

ルートを変更する場合は、元のルートに対して保留中の削除リカバリを完了し、それを使用しているすべてのライタを停止してから、新しい構成でデーモンを停止して起動します。異なる正規化されたルートは、異なる履歴ストレージ/検出名前空間と共有ルート構成を選択します。作業ファイル、セッションレコード、構成、リカバリジャーナル、または検出状態は自動的に移行されず、古い履歴が引き続き表示される保証はありません。受理を強制するためにリカバリのエビデンスを削除しないでください: 元のルートに対するリカバリが完了できない場合、このオプションの変更は修復手順ではありません。

### セッション添付ファイルの保存 [#session-attachment-storage]

セッション添付ファイル（Web Shell によって `POST /session/:id/attachments` 経由でアップロードされたファイルと画像）は、デフォルトではワークスペースのランタイム一時ディレクトリ配下に保存されます。`<runtimeBaseDir>/tmp/<projectHash>/attachments` であり、セッションごとに `session-<sessionId>` としてキーイングされます。添付ファイルをランタイム一時ディレクトリの外（例: 専用ボリューム上）に永続化したいオペレーターは、ルートをオーバーライドできます。

| 環境変数                               | 値 | デフォルト | 動作                                                                                                                                                                                                |
| ------------------------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_SESSION_ATTACHMENTS_ROOT` | パス   | 未設定   | セッション添付ファイルをデフォルトのランタイム一時ディレクトリではなくこのディレクトリ配下に保存します。絶対パス、デーモンの cwd からの相対パス、またはホームディレクトリに対して展開される `~` / `~/…` を受け付けます。 |

スコープと制限:

- **一方向の移行。** 環境変数が設定されると、新しい添付ファイルは設定されたルートの下にのみ書き込まれます。設定されたルートを見逃す読み取りと削除はデフォルトのランタイム一時ディレクトリにフォールバックするため、切り替え**前**にアップロードされた添付ファイルは引き続き読み取り可能であり、デフォルトのフォールバックディレクトリが書き込み可能である限り削除可能です。レガシーコピーがアンリンクできない削除（例: 読み取り専用のフォールバックボリューム）は、成功を報告するのではなくエラーを表面化します。逆方向 — 設定されたルートに添付ファイルが書き込まれた後に環境変数を削除する — はそれらの添付ファイルにアクセスできなくなります。ワークスペースごとにこの変数を安定させてください。
- **セッションごとのレイアウト。** ファイルは両方の場所で `<root>/<projectHash>/attachments/session-<sessionId>/` 配下に存在します。`<projectHash>` はデフォルトのランタイム一時ディレクトリで使用されるものと同じワークスペースハッシュです。フォールバックの検索はデフォルトディレクトリ内の同じセッションレイアウトを使用します。同じ設定されたルートを指す 2 つのワークスペースは互いに隔離されたままです。
- **削除クリーンアップ。** セッションが削除されると、その添付ファイルディレクトリは設定されたルートとデフォルトのフォールバックディレクトリの両方から削除されます。セッションをアーカイブすると添付ファイルが保持されるため、アーカイブ解除後も生存します。
- デーモンは起動時にこの変数を読み取ります。変更後はデーモンを再起動してください。ディレクトリはデーモンプロセスによって書き込み可能である必要があります。

## マルチセッションおよびマルチワークスペースデプロイメント [#multi-session--multi-workspace-deployment]

`--workspace` を複数回渡して、1 つの `qwen serve` プロセスで重複しない複数のワークスペースを登録します。最初のパスがプライマリです。各登録ワークスペースは隔離されたランタイムバウンダリを所有し、デーモン全体のリスナー、認証ポリシー、および合計セッション制限は共有されます。本番環境では互換性のためにプライマリ ACP 子の事前起動を試み、失敗時は初回使用時にリトライします。信頼されたセカンダリはオンデマンドで独自の子を起動し、信頼されていないセカンダリは ACP を起動しません。リクエストは正規の `cwd` で登録されたワークスペースを選択できます。`cwd` を省略したリクエストはプライマリワークスペースを使用します。ユーザーまたはセキュリティプリンシパルごとに 1 つのデーモンを使用してください。ワークスペースの信頼は実行ゲートであり、ACL ではありません。

信頼されていないセカンダリワークスペースは、Web Shell で `untrusted` かつ `read-only` として表示されます。永続化されたセッションカタログを検査するために展開できますが、Web Shell で選択または開いたり、再開したり、セッションを作成したり、完全にエクスポートしたりすることはまだできません。REST API は既存のバウンドされたファイルシステム読み取りポリシーに従い、永続化されたセッショングループカタログと、`workspace_persisted_transcript` が通知されている場合は、バウンドされたワークスペース修飾ページャーを通じてアクティブな永続化トランスクリプトも公開します。前方読み取りとカーソル読み取りは ACP 子を起動しません。ライブセッションの後方最初のページは、永続化された末尾をフラッシュするために子を起動する場合があります。完全なワークスペース修飾エクスポートには信頼されたワークスペースと別の `workspace_session_export` ケーパビリティが必要です。実行、ミューテーション、またはエクスポート機能を使用する前に、ワークスペースを信頼してデーモンを再起動してください。信頼されていないプライマリは Web Shell で無効のままです。

より小さい障害またはセキュリティバウンダリ、独立したベアラートークン、クォータ、監査バウンダリ、オペレーティングシステムの分離、または独立したリソース監督が必要な場合は、個別のデーモンプロセスを使用してください。マルチワークスペースモードは、1 人のオペレーターが複数のリポジトリをホストすることを目的としています。マルチテナントの分離バウンダリではありません。単一のデーモントークンは、デーモンが公開するすべてのルート（登録されたすべてのワークスペースの許可された読み取り専用カタログを含む）を認可します。

> **アタッチ時に `modelServiceId` を投稿する前に必ず購読してください。** クライアントが `modelServiceId` とともに `POST /session` を実行し、ワークスペースに既に別のモデルを実行しているセッションがある場合、デーモンは内部の `setSessionModel` 呼び出しを発行します — 失敗は HTTP エラーとして伝播されません (セッションは現在のモデルで稼働し続けます)。可視的な失敗シグナルは、セッションの SSE ストリーム上の `model_switch_failed` イベントです。最初に `POST /session` を呼び出し、その後にのみ `GET /session/:id/events` を開くと、失敗イベントを見逃し、誤ったモデルとの通信がサイレントに継続されます。まず SSE ストリームを開くか、購読時に `Last-Event-ID: 0` を渡してリング内の最も古い利用可能なイベントを再生してください。

複数の**ユーザーまたはセキュリティプリンシパル**（それぞれに独立したトークン、クォータ、監査ログ、サンドボックス、またはプロセス障害バウンダリを持つ）を処理する場合、または 1 つのプロセスの範囲を超えてスケーリングする場合（コールドスタート予算、FD 数、RSS）は、プリンシパルごとに 1 つのデーモンを外部オーケストレーターの背後に生成します。各デーモンはそのプリンシパル用に複数のワークスペースをホストできます。そのオーケストレーター（マルチテナンシー / OIDC / クォータ / 監査 / k8s）は、qwen-code プロジェクトの**スコープ外**です。設計のポインターについては、issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) の「External Reference Architecture」を参照してください。

## 永続化されたセッションのロードと再開 [#loading-and-resuming-a-persisted-session]

デーモンは、ACP の `session/load` および再開フローを HTTP 経由で公開します。加えて、別の読み取り専用のトランスクリプトページャーも提供します。

| ルート                                                  | 使用タイミング                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /session/:id/load`                                | クライアントにレンダリングされた有用なローカル履歴が**ない**場合（コールド再接続、ピッカーからのオープン）。ライブセッションの場合、デーモンは現在のバウンドされたリプレイスナップショットウィンドウを返して注入します。古いリプレイが削除された場合、スナップショットは `history_truncated` で始まります。機能タグ: `session_load`。 |
| `POST /session/:id/resume`                              | クライアントがすでに画面上にターンを持っており、デーモン側のハンドルだけを必要とする場合。モデルコンテキストはエージェント側で UI リプレイなしに復元され、SSE ストリームはクリーンなままです。機能タグ: `session_resume`（`unstable_session_resume` は古いクライアント向けの非推奨エイリアスのままです）。 |
| `GET /session/:id/transcript`                           | クライアントが完全なアクティブな永続化トランスクリプトを必要とする場合。カーソルページで ID なしのリプレイフレームを返し、`/load` を呼び出したり、クライアントをアタッチしたり、ライブ EventBus をシードしたり、ライブセッションを作成したり、ライブリプレイウィンドウを変更したりすることはありません。機能タグ: `session_transcript`。 |
| `GET /workspaces/:workspace/session/:id/transcript`     | クライアントが選択したワークスペースからアクティブな永続化トランスクリプトを必要とする場合。前方およびカーソルページはデーモンローカルのままです。ライブセッションの後方最初のページは、永続化された末尾をフラッシュするために ACP を開始し、ワークスペース設定をロードする場合があります。登録された信頼されていないセカンダリワークスペースもこの読み取り専用パスを使用できます。機能タグ: `workspace_persisted_transcript`。 |
| `GET /workspaces/:workspace/session/:id/export`         | クライアントが選択した信頼されたワークスペースから完全な `html`、`md`、`json`、または `jsonl` 添付ファイルを必要とする場合。ACP を開始したりプライマリにフォールバックしたりせずにアクティブな永続化ストレージを読み取ります。機能タグ: `workspace_session_export`。 |
| `GET /workspaces/:workspace/session/:id/archive/export` | クライアントが選択した信頼されたワークスペースのアーカイブされた永続化ストレージから同じ添付ファイル形式を必要とする場合。アーカイブ解除、ACP の開始、またはアクティブまたはプライマリセッションへのフォールバックは行いません。機能タグ: `workspace_archived_session_export`。 |

負荷と再開のために、TypeScript SDK は `DaemonSessionClient` 上に静的ファクトリを公開します:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay the bounded snapshot window through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

対応するルートを呼び出す前に `caps.features.session_load`、`caps.features.session_resume`、または `caps.features.session_transcript` をプリフライトしてください — 古いデーモンは `404` を返します。`unstable_session_resume` は非推奨の互換性エイリアスとして引き続き提供されています。同じ id に対する同時の同一アクションのリクエストは結合されますが、クロスアクション競合 (`load` が `resume` と競合する場合) や、呼び出し元が指定した id の生成が復元と競合する場合は、`Retry-After: 5` を伴う `409 restore_in_progress` が返されます。`limits.sessionRestoreTimeoutMs` を超える復元は、予算から導出された `Retry-After` (5〜120秒にクランプ) を伴う再試行可能な `504 session_restore_timeout` になります。まだ稼働中の子リクエストはクリーンアップが確定するまでフェンスされ、その期間中の同じ id の再試行は、固定の5秒遅延ではなく、`reason: awaiting_abandoned_cleanup` と予算から導出された `Retry-After` (5〜120秒にクランプ) を伴う `409 restore_in_progress` になります。クリーンアップが不確実な場合、または放棄された復元が期限後も完全な復元予算を経過しても確定していない場合、新規セッション作業は一時的に `reason: restore_cleanup_failed` または `restore_settlement_overdue` を伴う `503 acp_channel_unavailable` になります。タイムアウトしたが直ちに確定しないセッション初期化も、遅延クリーンアップが結論を得られない場合は `reason: new_session_cleanup_failed` を返し、子リクエストが別の初期化予算の間未解決のまま残る場合は `new_session_settlement_overdue` を返すことがあります。すでに稼働中のセッションは、これら4つの理由すべてにおいて使用可能です。完全なエラーエンベロープについては [プロトコルリファレンス](../developers/qwen-serve-protocol.md) を参照してください。

完全な永続化リプレイの場合は、`DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` または生の REST ルートでページングします。

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

登録されたワークスペースの場合は、`client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` または `/workspaces/:workspace/session/:id/transcript` を使用します。ワークスペース修飾メソッドは、SDK クライアントに置換可能な ACP トランスポートがある場合でも、常にネイティブ REST を使用します。そのカーソルはデーモンの存続期間のみ有効であり、デーモンの再起動後はページ 1 から再開する必要があります。ライブセッションの後方最初のページは、永続化された末尾をフラッシュするために ACP を開始し、ワークスペース設定をロードする場合があります。

信頼された登録ワークスペースからの完全な添付ファイルの場合は、`workspace_session_export` をプリフライトし、`client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` または生の `/workspaces/:workspace/session/:id/export` ルートを呼び出します。`session_export` または `workspace_qualified_rest_core` からサポートを推測しないでください。古いデーモンは両方を通知しながらプライマリのみのエクスポートを保持する可能性があります。現在の Web Shell のエクスポートアクションはプライマリのみのままです。別のワークスペースの場合は SDK または REST ルートを使用してください。

アーカイブされた添付ファイルの場合は、`workspace_archived_session_export` をプリフライトし、`client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` または `/workspaces/:workspace/session/:id/archive/export` を呼び出します。このパスはアーカイブされたストレージをそのまま読み取り、アクティブのみの ID に対して `409 session_not_archived` を返します。セッションのアーカイブ解除は行いません。Web Shell は、ケーパビリティが存在する場合、信頼されたプライマリおよびセカンダリワークスペースのアーカイブされた行に対して同じエクスポートを公開します。

`limit` は、出力された再生フレーム数ではなく、アクティブなチャットレコードの目標数です。1つのレコードから複数の `session_update` イベントが発生することがあります。バックワードページは、ターンおよびツール呼び出し/結果の境界を保持するために、最大 `3 * limit` レコードまで拡張されることがあります。最初の応答は JSONL スナップショットサイズを凍結し、`hasMore` が true の間は `nextCursor` を返します。後のページはページ1以降の追加を無視しますが、ファイルが削除、切り詰め、置換、アーカイブされた場合、または凍結カーソルと矛盾する場合は `409` を返します。非常に大きなスナップショットは、インデックス作成の前に `413 transcript_too_large` を返すため、リクエストパス上で無制限のトランスクリプトファイルをスキャンしません。

レガシー単数形ルートによる繰り返しページングの場合、`--channel-idle-timeout-ms` に正の値を設定します。デフォルトの `0` では、アイドル状態のワークスペースの ACP 子プロセス — およびそれが保持するプロセス内トランスクリプトインデックスキャッシュ — は各ページの後に回収されるため、各ページで子プロセスを再生成し、凍結されたプレフィックス全体を再スキャンすることでインデックスを再構築します (ページあたり `O(snapshotSize)`)。正のタイムアウトは、カーソルウォーク中に子プロセスを生かし続け、キャッシュされたトランスクリプトインデックスと再生設定を再利用できるようにしますが、`--child-heap-mode admit` または `enforce` によって他のワークスペースでの容量制約のある生成を満たすために回収されない限りはそうです。その場合、次のページで子プロセスを再生成し、インデックスを再構築します。ワークスペース修飾付きのフォワードおよびカーソルページはデーモンローカルにとどまります。ライブセッションに対するバックワードの最初のページのみがフラッシュバリアを越えます。

注: ライブセッションの履歴再生には2つの上限があります。`Last-Event-ID` 再接続のための SSE リングと、`POST /session/:id/load` が返すスナップショットのための `--compacted-replay-max-bytes` です。長い履歴や雑談が多いターンでは、どちらかの上限を超える可能性があります。デーモンはスナップショット切り詰めを `history_truncated` で通知します。完全に永続化されたアクティブな履歴が必要な場合は `/transcript` を使用してください。

## 耐久性モデル [#durability-model]

**ライブセッションはデーモンの再起動によって中断されますが、永続化されたセッションはディスク上に残り、再読み込みできます:**

- 子プロセスのクラッシュは `session_died` を発行し、ライブセッションをデーモンのマップから削除します。ディスク上に永続化されたセッションは、新しいエージェント子プロセスを生成可能であれば、`POST /session/:id/load` 経由でリロード**できます**。
- デーモンの再起動は、進行中のすべてのライブセッションを失います。永続化されたセッションはディスク上に残り、同じワークスペースバインディングルールに従って、新しいデーモンプロセスに対してロードできます。
- 長時間のクライアント切断（会話の多いターンで 5 分以上）は、SSE リプレイリング（デフォルト 8000 フレーム）を追い越す可能性があります。`Last-Event-ID` 再接続は `state_resync_required` をトリガーします。モバイル / 不安定なネットワークのクライアントの場合は、長時間の切断時に SSE を再度開くか、`POST /session/:id/load` を呼び出して現在のバウンドされたリプレイスナップショットを回復してください。そのルートが完全なトランスクリプトを返すことを想定しないでください。
- ファイル操作（`writeTextFile`）はクラッシュをまたいでアトミックです（書き込んでからリネーム）。リプレイの意味ではデーモンの再起動をまたいでアトミックではありません。ファイルの書き込みは成功したか、失敗したかのどちらかです。

あなたのインテグレーションが `session/load` がカバーするものを超えるサーバー側の再起動をまたぐ耐久性（例: サーバー管理のリトライキュー）を必要とする場合、アプリケーションレベルの状態回復が依然として必要です。デーモンのセッション内に、長時間実行される再起動に敏感な状態を保持しないでください。

## Stage 1.5+ のランタイム保証

Stage 1 の契約はプロトタイピング向けにサイジングされています。[#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644) に従い、以下は Stage 1 には**含まれません**。本番グレードのインテグレーションは、それらに依存する前に Stage 1.5 以降が必要です。

**本格的な下流利用におけるブロッカー:**

1. **HTTP 経由の `loadSession` / `unstable_resumeSession`** — これがないと、どのインテグレーションも子プロセスのクラッシュやデーモンの再起動に耐えられず、デーモンを調整するオーケストレーターも状態を回復できません。
2. **永続的なクライアント ID（ペアトークン + クライアントごとの取り消し）** — Stage 1 では 1 つの共有 Bearer トークンを使用します。トークンが漏洩すると全員が無効化され、`originatorClientId` は認証された ID からデーモンによってスタンプされるのではなく、クライアント自身によって宣言されたものになります。

**信頼性のベースライン:**

3. ~~**クライアント開始のハートビートパス**~~ — [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9 で出荷済み。`POST /session/:id/heartbeat` はデーモン上の最終確認タイムスタンプを記録します（ケーパビリティタグ `client_heartbeat`）。SDK ヘルパーは `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()` です。
4. 投票が最初の応答者レースに負けた場合の **`permission_already_resolved` イベント** — 現在、UI は `404` から状態を推測する必要があります。
5. ~~**より大きなリプレイリング**~~ — 8000 に引き上げられました。**セッションごとに設定可能なリング** は依然として未対応です — モバイル / 会話の多いワークロードでは、セッションごとのオーバーライドが必要になる場合があります。
6. **`client_evicted` の前の `slow_client_warning` イベント** — 終了前に自己調整 (描画深度の削減、チャンクの破棄) ができるように、よく動作する低速クライアント向けのソフトバックプレッシャー。

**インテグレーションの利便性:**

7. IM 風コンテキスト用の **`POST /session/:id/_meta`** — 後続のプロンプトに添付されるセッションごとのキーバリュー（チャット ID、送信者、スレッド ID）が、チャネルごとのアドホックな実装を置き換えます。
8. **`/capabilities` による実際の機能ネゴシエーション** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` により、クライアントは「不明なフレーム、無視」にフォールスルーする代わりに、ドリフト（乖離）を検出できます。
9. **第一級の永続性ドキュメント**（このセクション） — 上記ですでに出荷済みです。

完全なコンバージェンスロードマップは [#3803](https://github.com/QwenLM/qwen-code/issues/3803) で追跡されています。

## Stage 1 のスコープ境界 — Stage 1.5 で修正しないもの [#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15]

2 つの構造的な選択は、Stage 1 / 1.5 / 2 のメインラインロードマップにおいて明示的な非目標（ノンゴール）です。ユースケースがこれらに依存する場合は、私たちを待つのではなく、それらを回避するように計画してください。

### セッション状態はローカルミューテーションのみ（[LaZzyMan review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721) に基づく）

Stage 1.5 の計画では、TUI をプロセス内 EventBus サブスクライバーとして記述しています。実際には、**TUI UI はワイヤープロトコルよりも厳密に大きい**ものです。

- **ローカル限定の UI** — 約 15 個の Ink ダイアログコンポーネント（`ModelDialog`、`MemoryDialog`、`PermissionsDialog`、`SessionPicker`、`WelcomeBackDialog`、`FolderTrustDialog` など）と `local-jsx` スラッシュコマンド（`/ide`、`/auth`、`/init`、`/resume`、`/rename`、`/delete`、`/language`、`/arena` など）は、ターミナル固有の Ink JSX をレンダリングします。HTTP/SSE 上のリモートクライアントは同等に Ink をレンダリングできず、これらのフローはワイヤーイベントを発行しません。
- **ワイヤーイベントを伴わないセッション状態のミューテーション** — `/approval-mode`、`/memory add`、`/mcp add-server`、`/agents`、`/tools enable/disable`、`/auth`、`/init`（`CLAUDE.md` の書き込み）はすべてエージェントの動作を変更しますが、現在イベントを発行するのは `/model`（`model_switched`）だけです。

**Stage 1 の選択 — レビューのオプション (A)**: これらのミューテーションをワイヤーイベントに昇格させません。2 つのデプロイモードには異なる結果が伴います。

#### モード 1 — ヘッドレス `qwen serve`（この PR）

デーモン内で TUI シェルは実行されません。上記のスラッシュコマンドは、このモードでは**存在しません** — それらを発行するターミナル UI がないためです。したがって、セッション状態は次のようになります。

- `approval-mode` / `memory` / `agents` / `tools` 許可リスト / `auth` は**ブート時に凍結** — デーモンの `qwen --acp` 子プロセスが開始されるときに設定 + ディスクからすべて読み込まれ、セッションの存続期間中は不変です。設定で定義された MCP サーバーも同様にブート時に凍結されますが、**実行時に追加されたサーバー**（`POST /workspace/mcp/servers` 経由）は再起動なしで追加または削除できます。
- **HTTP 経由で変更可能**: `POST /session/:id/model` (`model_switched` を公開)、`POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (`mcp_server_added` / `mcp_server_removed` を公開)、および権限投票 (`POST /session/:id/permission/:requestId`; レガシーのプロセスグローバルな `POST /permission/:requestId` は F3 以前の単一ワークスペースクライアント向けに残っています)。

**結果:** ヘッドレスモードのリモートクライアントは**完全なセッション状態**を参照できます。TUI が追加の状態を隠すことはなく、ドリフト（乖離）も発生しません。`approval-mode` を変更したい場合は、新しい設定でデーモンを再起動してください。MCP サーバーは、ミューテーションルート（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）を介して実行時に追加 / 削除できるようになりました — [Runtime MCP server management](#runtime-mcp-server-management-issue-4514) を参照してください。

#### モード 2 — Stage 1.5 `qwen --serve` 共同ホスト TUI（この PR には含まれません）

Stage 1.5 で `qwen --serve`（TUI プロセスが同じ HTTP サーバーを共同ホスト）が導入されると、TUI はリモートクライアントと並んで**実際に存在**します。ローカルオペレーターが `/approval-mode yolo` や `/mcp add-server` を入力するとセッション状態がミューテーションされますが、HTTP 上のリモートクライアントにはその変更を観測するイベントがありません。

このモードでは、TUI は **"スーパークライアント"** です — リモートクライアントが見るのと同じエージェント会話を観察でき、さらにリモートクライアントができないセッション状態の変更も可能です。非対称性は以下の通りです:

- ✅ TUI とリモートクライアントの両方が、同じエージェントメッセージ、ツール呼び出し、ファイル差分、許可プロンプトを参照します。
- ❌ TUI のみが approval-mode / memory / MCP サーバーリスト / agents / tools 許可リスト / auth 状態を参照 / ミューテーションします。

**モード2の結果:** リモートクライアント UI がセッション設定をミラーしようとする場合、任意の TUI スラッシュコマンドの後にドリフトする可能性があります。リモートクライアントは **アタッチ/再接続時に状態を再取得すべきです** (`model_switched` のようなものについて、リング内の最も古いイベントを再生するために `Last-Event-ID: 0` を使用); TUI 側の変更に対する増分イベントに依存すべきではありません。

#### なぜ (B) ではなく (A) なのか（ミューテーションを `session_state_changed` イベントファミリーに昇格させること）

(B) はより野心的な回答ですが、Stage 1.5 を、計画されているプロセス内リファクタリングもクリーンに通過しなければならない、大幅に大きなワイヤーサーフェスに固定してしまいます。私たちは、より小さなスコープを誠実に進めることを選びます。セッション状態イベントの分類作業 — どの TUI フローが設計上ローカル限定であり、将来のオプトイン (B) 形式の拡張でワイヤーに昇格する可能性があるかを列挙すること — は、Stage 1.5 のコードではなく [#3803](https://github.com/QwenLM/qwen-code/issues/3803) に移行します。

### N 個の並列セッションがワークスペースランタイムごとに 1 つの `qwen --acp` 子を共有

同じ信頼されたワークスペース上の複数のセッションは、**そのランタイムの `qwen --acp` 子プロセスを共有**します。エージェントのネイティブマルチセッションサポート（`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`）を介してです。ブリッジは各セッションに対して `connection.newSession({cwd, mcpServers})` を呼び出します。エージェントはそれらをセッションマップに保存し、呼び出しごとの sessionId をデマルチプレクスします。本番環境では、プライマリ子 1 つ（デフォルトで事前起動を試みる） plus 信頼されたセカンダリごとにオンデマンド 1 つを所有できます。信頼されていないセカンダリは子を所有しません。

同じワークスペース上の N=5 セッションの場合の具体的なコスト:

| リソース                             | セッションあたり                                           | N=5 の場合                                                           |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------- |
| デーモン Node プロセス                  | 1 つ                                                   | **30–50 MB**（1 つのデーモン）                                        |
| `qwen --acp` 子プロセス                   | 共有                                                | **60–100 MB**（1 つの子プロセス）                                      |
| MCP サーバー子プロセス                  | 通知されている場合はワークスペースプール。それ以外の場合はセッションごと | 一致するプールエントリで共有、またはレガシーフォールバックでは最大 3×N |
| `FileReadCache`（子プロセスヒープ内）      | 共有                                                | 1 回だけパース                                                      |
| `CLAUDE.md` / 階層メモリのパース | 共有                                                | 1 回だけパース                                                      |
| OAuth リフレッシュトークン状態            | 共有                                                | **1 つのリフレッシュパス**                                             |
| 自動メモリで学習したファクト            | 共有                                                | 子プロセスごとに 1 つのナレッジベース |
| コールドスタート                           | 初回のみ                                            | 最初のセッション以降は <200 ms                                      |

各アクティブなワークスペースランタイムは**1 つのブリッジバウンダリ**を保持します。本番環境ではプライマリチャネルの事前起動を試み、失敗時は初回使用時にリトライします。信頼されたセカンダリはオンデマンドでチャネルと子を開き、信頼されていないセカンダリは決して開きません。チャネルは少なくとも 1 つのセッションが存続している限り維持されます。最後の `killSession` の後、ランタイムはデフォルトですぐに、または設定されたチャネルアイドル猶予後に子をキルします。チャネルレベルのクラッシュも同様にそれをティアダウンし、別のランタイムを選択することはありません。

**MCP サーバー子プロセス** は、`mcp_workspace_pool` がアドバタイズされている場合、ワークスペーススコープのトランスポートプールを使用します: マッチする `(workspace runtime, server name, config fingerprint)` エントリはセッション間で参照カウントされます。この機能が存在しない場合、レガシーのセッションごとのマネージャーが独立して生成します。

**ピアエージェント (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) はすべて単一プロセスマルチセッションです。** qwen-code はエージェント層でこれらと同等であり、この PR のステージ1ブリッジにより、同じアーキテクチャが HTTP 経由で可視化されます。

## リモートデーモンへのログイン (issue #4175 PR 21)

デーモンがリモートポッド上で実行されている場合 (あなたとディスプレイを共有していない)、クライアントは HTTP を介して OAuth デバイスフローをトリガーできます。デーモン自体が IdP をポーリングします。あなたの仕事は、ブラウザを持つ任意のデバイスで URL を開くだけです。

> [!note]
>
> Qwen OAuth 無料枠は 2026-04-15 に廃止されました。以下の `qwen-oauth` の例はデバイスフロープロトコルの形状とレガシープロバイダー識別子を文書化したものであり、新しいセットアップは現在サポートされている認証プロバイダーを使用すべきです。

```bash
# 1. Start a flow. The daemon contacts the IdP, returns a code + URL.
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. Visit the URL on your phone / laptop, enter the user code.
# 3. Poll for completion (or subscribe to SSE for the auth_device_flow_authorized event):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → status transitions: pending → authorized
```

TypeScript SDK は両方のステップを単一のヘルパーにラップします:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**デーモンはあなたの代わりにブラウザを開くことは決してありません。** ローカルで実行している場合でも、デーモンはパッシブなままです。URL を返し、SDK / ユーザーがどこで開くかを選択できるようにします。これは意図的なものです。ヘッドレスポッド上のデーモンが `xdg-open` を呼び出すと、実際の認証サーフェスを隠したままサイレントに失敗するからです。クライアントでは、`gh auth login` の「Press Enter to open browser」UX をミラーリングしてください。

**`--require-auth` と開発の利便性。** デバイスフロールートは厳格なミューテーションゲートを使用します。トークンなしの信頼されたループバックデフォルトはフローを直接開始および管理できます。資格情報なしの信頼されていない埋め込みは `401 token_required` を返します。共有ホスト、CI ランナー、リモート開発マシン、またはローカルプロセスが相互に信頼されていない場所では、管理された `QWEN_SERVER_TOKEN` を設定し、`--require-auth` を渡してください。

**デーモン間の制限。** `oauth_creds.json` はデーモン間で共有されます（`~/.qwen/oauth_creds.json`）。そのため、デーモン A でのログイン成功は、デーモン B の次回のトークンリフレッシュ時に自動的に取得されます。しかし、デーモン B の SDK クライアントは `auth_device_flow_authorized` イベントを受け取りません（イベントはデーモンごとです）。

**クライアント間の引き継ぎ。** 同じデーモン上の2つのSDKクライアントが同じプロバイダーに対して両方とも `POST /workspace/auth/device-flow` を実行する場合、プロバイダーごとのシングルトンが取得されます。最初の呼び出しは新しいIdPリクエストを開始し、`attached: false` を返します。2番目の呼び出しは、`attached: true` を持つ既存の進行中エントリを返します。この引き継ぎは監査証跡（2番目のクライアントの `X-Qwen-Client-Id` の下）に記録されますが、個別のイベントは発行されません。ユーザーがIdPページでの操作を終了すると、両方のクライアントが最終的に同じ `auth_device_flow_authorized` を観測します。UIで「自分が開始した」と「他の人のフローに参加した」を区別する場合は、`start()` から返される `attached` フィールドに基づいて分岐してください。

## デーモンログファイル

`qwen serve` は安定したアクティブパスにおいて通常の再起動を跨いで診断記録を追加します:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

すべてのファイルレコードには、起動ごとにランダムな `runId` とデーモン PID が含まれます。安定した所有者が正常に設定されると、シンボリックリンクをサポートするプラットフォームでは `debug/daemon/latest` が `daemon.log` に更新されます。macOS/Linux では、ローテーションを次のコマンドで追跡します:

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

その他のプラットフォームでは、パス名が置き換えられた後にビューアが再オープンするように設定してください。古いファイルハンドルのみを保持しているビューアは、ローテーション後もアーカイブに留まります。

ログはライフサイクルメッセージ、ルートエラー（`route=` および `sessionId=` コンテキスト付き）、ACP 子プロセスの stderr、および `QWEN_SERVE_DEBUG=1` が設定されている場合は追加のブリッジブレッドクラムをキャプチャします。現在 stderr に出力される行は引き続き stderr に出力されます。ファイルログは**追加**であり、置き換えではありません。

スタンドアロン作成の失敗は、検証済みターゲット `sessionId`、失敗した `phase`、安全な `reason`、`dispatchState` および `cleanupOutcome` を伴う `Standalone session creation failed.` を追加します。子プロセス作成では、子IDを保持し、検証済み親を `relatedSessionId` として個別に記録します。プライベートソースの確認またはトランスポートの詳細については、セッションIDで `source_persistence_failed` 行を相関させてください。`write_not_confirmed` はファイルシステムの原因を特定しません。完了した検疫はロールバックとは異なり、`unknown` はクリーンアップの成功を示すものではありません。公開エラーコードと再試行動作は変更されません。これらの診断情報は、生の原因、プロンプト、およびソースペイロードを省略します。

アクティブなファイルは 10 MiB を超える前にローテーションされます。各ファミリーは `archive/` の下に 4 つのアーカイブを保持し、各ファイルレコードは最大 256 KiB に制限されます。メモリ内キューは、未確定のファイルペイロードを最大 4 MiB まで受け入れます。そのため、キュー圧力、ローテーション失敗、またはファイルシステム障害により、ファイルコピーが破棄される可能性があります。`GET /daemon/status?detail=full` はロガーの健全性、問題、および破棄されたレコード/バイト数を公開します。

ログ名前空間内の安定したファミリーを所有できるデーモンは 1 つだけです。並行して実行されるデーモンは `debug/daemon/runs/run-<runId>/daemon.log` に書き込みます。起動バナーと完全なステータスには、権威あるパスが含まれます。`runs/recent-fallback` は最近のフォールバックファミリーに対するベストエフォートのロケーターであり、まだ稼働中のものを指す場合があります。健全な名前空間は約 100 MiB に収束します。これは、安定したファミリー用に約 50 MiB、非アクティブなフォールバックファミリー用に約 50 MiB です。稼働中またはまだ古くないフォールバックファミリーは保持されるため、並行デーモンやクラッシュ/再起動の嵐が一時的にさらに多くの容量を使用する可能性があります。

1 つのランタイムディレクトリは、1 つの所有権および保持ポリシーの名前空間です。デーモンが独立した履歴を必要とする場合は、異なる `QWEN_RUNTIME_DIR` 値を使用してください。新しいデーモンのログディレクトリはユーザー専用（`0700`）であり、新しいファイルは POSIX で `0600` を使用します。年齢に基づく期限切れはありません。

### 無効化

ファイルログを完全にスキップするには、`QWEN_DAEMON_LOG_FILE=0`（または `false`/`off`/`no`）を設定します。stderr 出力は影響を受けません。

### セッションデバッグログとの関係

セッションスコープのデバッグログ（`~/.qwen/debug/<sessionId>.txt` および `~/.qwen/debug/latest` シンボリックリンク）は独立しています。デーモンログは兄弟ディレクトリである `daemon/` サブディレクトリに存在します。セッションごとのデバッグセマンティクスは、この機能によって変更されません。

### 外部ローテーション

外部の logrotate ルールをアクティブな `daemon.log` に向けないでください。デーモンはサポートされている唯一の書き込みおよびローテーションプロセスです。外部による名前変更、削除、または切り詰めは、そのサイズモデルを無効にします。ファミリーを変更せずにレコードをコピーまたは送信することは安全です。古い `serve-<pid>.log` および `serve-<pid>-<workspaceHash>.log` ファイルはそのまま残され、新しい保持ポリシーによってカウントされません。

## 実行時 MCP サーバー管理（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)） [#runtime-mcp-server-management-issue-4514]

デーモンを再起動せずに、実行時に MCP サーバーを追加または削除します。実行時エントリは、同じ名前の設定定義サーバーを**シャドウ**する一時的なオーバーレイに存在します。基礎となる `settings.json` / `mcpServers` 設定が書き換えられることはありません。

**プレフライト:** どちらのルートを呼び出す前に、`caps.features` で `mcp_server_runtime_mutation` を確認してください。このタグがない古いデーモンは `404` を返します。

### `POST /workspace/mcp/servers` — 実行時 MCP サーバーの追加

厳格なゲート（信頼されたループバックのプライマリまたはオペレーター資格情報が必要）。ライブの `McpClientManager` 経由でサーバーに即座に接続し、そのツールを検出します。

リクエスト:

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` は英数字と `_`、`-` のみで構成される必要があります（最大 256 文字）。`config` は `settings.json` の `mcpServers` エントリで使用されるものと同じ MCP サーバー設定オブジェクトです（トランスポート依存のフィールド: stdio の場合は `command`/`args`、SSE/HTTP の場合は `url`）。セキュリティに敏感なフィールド（`trust`、`env`、`cwd`、`oauth`、`headers`、`authProviderType`、`includeTools`、`excludeTools`、`type`）はデーモンによって削除され、無視されます。

レスポンス (200) — 成功:

```json
{
  "name": "my-server",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — 同じ名前の実行時エントリがすでに存在し、設定のフィンガープリントが異なります。古い接続は切断され、新しい接続が確立されます。フィンガープリントが一致する場合（冪等な再追加）、`replaced` は `false` になります。
- `shadowedSettings: true` — 同じ名前の設定定義サーバーが存在します。実行時エントリがそれをシャドウします。設定エントリは変更されず、実行時エントリが後で削除されると再出現します。
- `toolCount` — 新しく接続されたサーバーで検出されたツールの数。

レスポンス (200) — ソフト拒否（予算警告モード）:

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

`--mcp-budget-mode=warn` が存在し、サーバーを追加すると設定された `--mcp-client-budget` を超える場合に返されます。サーバーは接続されていません。呼び出し側は予算の圧力をユーザーに表示すべきです。

エラー:

| ステータス | コード                      | 条件                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名前が空、256 文字を超えている、または `[A-Za-z0-9_-]` 以外の文字が含まれている                      |
| `400`  | `missing_required_field`  | `config` が欠落している、または null 以外のオブジェクトではない                                                          |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` ヘッダーが存在するが、このワークスペースに登録されていない                            |
| `400`  | `invalid_config`          | 設定の形状が MCP トランスポートバリデーターによって拒否された                                               |
| `401`  | `token_required`          | 信頼されていないトークンなしのリクエストが厳格なゲートによって拒否された                                           |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` であり、予算が満杯                                                     |
| `502`  | `mcp_server_spawn_failed` | 接続中にサーバープロセスが終了またはタイムアウト。ボディに `serverName`、`exitCode`、`stderr` が含まれる |
| `503`  | `acp_channel_unavailable` | ライブな ACP 子プロセスがない（まだセッションが作成されていない）                                                |

### `DELETE /workspace/mcp/servers/:name` — 実行時 MCP サーバーの削除

厳格なゲート。サーバーを切断し、実行時オーバーレイから削除します。冪等です。追加されたことのない名前を削除すると、スキップレスポンスが返されます（エラーではありません）。

`:name` パスパラメータは URL エンコードされたサーバー名です。

レスポンス (200) — 成功:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — 削除された実行時エントリは、同じ名前の設定定義サーバーをシャドウしていました。その設定エントリはシャドウが解除され、次回の検出 / 再起動時に使用されます。

レスポンス (200) — 冪等なスキップ:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

名前が実行時オーバーレイになかった場合に返されます（設定にまだ存在している可能性があります。設定エントリはこのルート経由で削除できません）。

エラー:

| ステータス | コード                      | 条件                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名前が空、256 文字を超えている、または `[A-Za-z0-9_-]` 以外の文字が含まれている |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` ヘッダーが存在するが、このワークスペースに登録されていない       |
| `401`  | `token_required`          | 信頼されていないトークンなしのリクエストが厳格なゲートによって拒否された                      |
| `503`  | `acp_channel_unavailable` | ライブな ACP 子プロセスがない                                                             |

### シャドウセマンティクス

実行時エントリは、設定定義 MCP サーバーの上に一時的なオーバーレイを形成します。

- 設定エントリと同じ名前の実行時サーバーを**追加**すると、それが**シャドウ**されます。実行時の設定が優先されます。元の設定エントリは変更されません。
- 設定エントリをシャドウしていた実行時サーバーを**削除**すると、シャドウが**解除**されます。設定定義の設定は、次回の接続時に再びアクティブになります。
- **デーモンの再起動**により、すべての実行時エントリが失われます。再起動をまたいで生き残るのは設定定義サーバーのみです。実行時サーバーはセッションの存続期間をスコープとします。
- **`GET /workspace/mcp`** はマージされたビューを報告します。設定定義サーバーと実行時サーバーの両方が `servers[]` 配列に表示されます。今日のスナップショットでは、2 つの起点間にワイヤーレベルの区別はありません。

### イベント

どちらのルートも**ワークスペーススコープ**の SSE イベントを発行します（すべてのアクティブなセッションバスがそれらを受信します）。

| イベント                | 発行される条件                    | ペイロードフィールド                                                                         |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` が成功した（スキップされなかった）場合   | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` が成功した（スキップされなかった）場合 | `name`, `wasShadowingSettings`, `originatorClientId`                                   |

スキップされた応答（`budget_warning_only`、`not_present`）はイベントを発行しません。

既存の `mcp_guardrail_events` サーフェス（`mcp_budget_warning`、`mcp_child_refused_batch`）からの予算関連イベントも、実行時の追加が予算しきい値を超えた際に発生します。

## 次のステップ

- **長時間稼働するデーモンを設定していますか？** サービスマネージャーによる監視と再起動後の起動のために、[ローカル起動テンプレート（systemd / launchd / nohup / tmux）](./qwen-serve-deploy-local.md) を使用してください。
- **クライアントの構築？** [DaemonClient TypeScript クイックスタート](../developers/examples/daemon-client-quickstart.md) および [HTTP プロトコルリファレンス](../developers/qwen-serve-protocol.md) を参照してください。
- **ソースコードの確認？** ブリッジコードは `packages/cli/src/serve/` に、SDK クライアントは `packages/sdk-typescript/src/daemon/` にあります。
- **ロードマップの追跡？** ステージ 1.5 / ステージ 2 の進捗は、issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) で管理されています。
