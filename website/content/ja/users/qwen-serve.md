# デーモンモード (`qwen serve`)

Qwen Code をローカル HTTP デーモンとして実行し、複数のクライアント（IDE プラグイン、Web UI、CI スクリプト、カスタム CLI）がそれぞれサブプロセスを生成するのではなく、HTTP + Server-Sent Events 経由で 1 つのエージェントセッションを共有できるようにします。

> **🚧 v0.16-alpha**: `qwen serve` は v0.16-alpha で初めて npm にリリースされますが、**テキストのみのチャット / コーディング**と**ローカル限定のデプロイ**に限定されています。プロンプトパスでの画像 / ファイル添付、コンテナ化されたデプロイ（Docker / k8s / nginx リバースプロキシ）、およびリモート / マルチデーモンの強化は、エンタープライズパイロットが確定した後のフォローアップパッチで提供されます。延期された機能の完全なリストについては、[v0.16-alpha の既知の制限](#v016-alpha-known-limits)を参照してください。

> **ステータス:** Stage 1（実験的）。プロトコル表面は issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) の §04 ルートテーブルでロックされています。Stage 1.5（`qwen --serve` フラグ — TUI が同じ HTTP サーバーを共同ホスト）および Stage 2（インプロセスリファクタリング + `mDNS`/OpenAPI/WebSocket/Prometheus の改善）は直近の次のフェーズに位置しています。
>
> **スコープの正直な開示:** Stage 1 は、**プロトコル表面に対してクライアントをプロトタイピングする開発者**および**ローカルのシングルユーザー / 小規模チームでのコラボレーション**を対象としています。本番グレードのマルチクライアント / 長時間実行 / ネットワークが不安定なワークロード（モバイルコンパニオン、1000 以上のチャットに到達する IM ボット）には、このリリースには含まれていない Stage 1.5 以上の保証が必要です。ギャップの完全なリストについては [Stage 1.5+ のランタイム保証](#stage-15-runtime-guarantees)を、収束ロードマップについては #3803 を参照してください。

## 提供される機能

- **組み込み Web Shell UI** — `qwen serve` は、ブラウザベースの Web Shell をルート（`http://127.0.0.1:4170/`）でそのまま提供します。`qwen serve --open` を実行すると、ブラウザで自動的に起動します。API と同じオリジンで提供されるため、2 つ目のポートやリバースプロキシは不要です。API のみのデーモンとして実行する場合は `--no-web` を渡します。
- **1 つのエージェントプロセス、多数のクライアント** — デフォルトの `sessionScope: 'single'` では、デーモンに接続するすべてのクライアントが 1 つの ACP セッションを共有します。同じ会話、同じファイルの差分、同じ権限プロンプトに対するライブのクロスクライアントコラボレーションが可能です。
- **再接続対応ストリーミング** — `Last-Event-ID` を使用した SSE 再接続により、クライアントは接続が切断されても、リングのリプレイウィンドウ内で、中断した場所から正確に再開できます。
- **初回応答者による権限管理** — エージェントがツールの実行権限を要求すると、接続されているすべてのクライアントにリクエストが表示され、最初に回答したクライアントの操作が採用されます。
- **1 つのデーモン、1 つのワークスペース** — 各 `qwen serve` プロセスは起動時に正確に 1 つのワークスペースにバインドされます（[#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 に準拠）。マルチワークスペースのデプロイでは、ワークスペースごとに 1 つのデーモンを別々のポートで（またはオーケストレーターの背後で）実行します。
- **実験的なデーモン管理チャネル** — `qwen serve --channel <name>` は、デーモンのライフサイクルに属するチャネルワーカーを起動します。ワーカーは別のプロセスであり、SDK 経由でデーモンに接続し、`GET /daemon/status` でその状態を報告します。
- **リモートランタイム制御**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17）— セッションの承認モードの変更（`POST /session/:id/approval-mode`）、ワークスペースごとのツールの切り替え（`POST /workspace/tools/:name/enable`）、空の `QWEN.md` のスキャフォールディング（`POST /workspace/init`、メカニカルな操作のみ — モデルは呼び出しません。AI による記入には `POST /session/:id/prompt` を続けて実行します）、バジェット事前チェック付きの単一 MCP サーバーの再起動（`POST /workspace/mcp/:server/restart`）、またはデーモンを再起動せずにランタイムで MCP サーバーの追加 / 削除（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）。すべて厳格なゲートが適用されるため、まず `--token` を設定してください。
- **セッションの要約**（[#4175](https://github.com/QwenLM/qwen-code/issues/4175) のフォローアップ）— アクティブなセッションの「どこまで進んだか」を示す 1 文の要約を取得します（`POST /session/:id/recap`）。コアの `generateSessionRecap` をラップし、高速モデルに対するサイドクエリとして実行します。メインのチャット履歴も SSE ストリームも汚染しません。非厳格ゲート（`/prompt` と同じ姿勢）。SDK ヘルパー: `client.recapSession(sessionId)`。
  - **既知の制限 — トークンコストの増幅:** このルートは純粋なコストエンドポイントであり（呼び出しごとに LLM サイドクエリが実行され、状態のメリットはありません）、v1 にはルートごとのレート制限がありません。トークンなしのループバックデフォルトでは、バグのあるクライアントや悪意のあるローカルクライアントがスパムを送信してトークンを消費する可能性があります。デーモンを公開する前に、共有開発ホストで `--token`（およびオプションで `--require-auth`）を設定してください。
  - **同時要約の安全性:** 同じセッションに対する 2 つの同時 `/recap` 呼び出しは、2 つの独立したサイドクエリを実行します。`generateSessionRecap` は `GeminiClient.getChat().getHistory()` 経由でチャット履歴のスナップショットを読み取り、それを別の `BaseLlmClient.generateText` 呼び出し（`runSideQuery` 経由）に渡します。セッションの `GeminiChat` に追加したり変更したりすることはありません。調整なしに複数のクライアントから安全に呼び出せます。

## v0.16-alpha の既知の制限

`qwen serve` の最初の npm リリース（v0.16-alpha）は意図的に範囲を狭くしています。これは、自分のマシンでデーモンを実行する開発者向けのテキストのみのチャット / コーディングです。以下のリストは延期された機能を明示し、導入企業がそれを見越して計画できるようにするためのものです。ここにあるすべての機能は、v0.16.x パッチロードマップまたは近期内のフォローアップリリースに含まれています。

**プロダクト表面 — テキストのみ:**

- ✅ テキストプロンプトとテキストレスポンス（チャット、コーディング、ツール呼び出し、MCP 統合）
- ❌ **プロンプトパスでの画像 / ファイル添付** — `MessageEmitter` は現在テキストのみをレンダリングします。マルチモーダルエコーは、画像ニーズを持つ alpha ターゲットが確定した時点で実装されます（#4175 chiga0 #27 P0 アイテム）
- ❌ **ストリーミングアップロード** — マルチモーダルと同じゲーティング

**デプロイ表面 — ローカルのみ:**

- ✅ ループバック（`127.0.0.1`、デフォルト）— 認証不要、開発ワークステーションに適しています
- ✅ `systemd` / `launchd` / `nohup &` / `tmux` によるローカル起動 — [ローカル起動テンプレート](./qwen-serve-deploy-local.md)を参照
- ✅ `QWEN_SERVER_TOKEN` 環境変数によるベアラートークンの持ち込み（設定については[認証](#authentication)を参照）
- ❌ **コンテナ化されたデプロイ** — TLS 終端を伴う Docker / Compose / Kubernetes / nginx リバースプロキシは v0.16-alpha には含まれていません。エンタープライズパイロットが確定次第、v0.16.x に延期されます（そうでなければ検証する人がいなくて腐ってしまうため）。
- ❌ **1 ホストでのマルチデーモン調整** — `1 デーモン = 1 ワークスペース × N セッション` が強制されます。クロスホストフェデレーション、インスタンスパストークンキーイング、および古いトークンのクリーンアップは v0.16.x に延期されます。
- ❌ **自動生成されるデーモントークン** — alpha はトークン持ち込みです（`openssl rand -hex 32` 1 回で生成可能）。自動生成 + トークンストアインフラは v0.16.x に延期されます。

**強化 — ローカルシングルユーザーの最小限の実用ライン:**

- ✅ 起動時のセキュリティゲート（トークンなしの非ループバックバインドを拒否、[PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236)）
- ✅ 変更ルート認証ゲート、セッションスコープの権限ルーティング（Wave 4 PR）
- ✅ MCP ガードレール + マルチクライアント権限調整（F2 / F3）
- ✅ **プロンプトの絶対デッドライン + SSE ライターアイドルタイムアウト** — `--prompt-deadline-ms` および `--writer-idle-timeout-ms` でオプトイン。有効化時は `prompt_absolute_deadline` および `writer_idle_timeout` を通じて通知されます。
- ✅ **HTTP レート制限** — `--rate-limit` およびティアごとのしきい値でオプトイン。有効化時は `rate_limit` を通じて通知されます。
- ⏸️ **Prometheus メトリクス + 負荷テストハーネス** — 30〜50 のアクティブセッションが現実的なターゲットになった場合、v0.17 F4 Phase-1 スケール計測に延期されます。
- ⏸️ **`--max-body-size` CLI フラグ** — デーモンはデフォルトで `express.json({ limit: '10mb' })` を強制し、テキストのみのプロンプトを十分にカバーします（モデルのコンテキストウィンドウは 10 MiB の文字数を大幅に下回ります）。v0.16.x でフラグによる調整が可能です。

Stage 1 で修正しない内容の詳細な列挙（シングルホストのセッション状態変更モデル + 1 つの ACP 子プロセスを共有する N 個の並列セッション）については、以下の [Stage 1 のスコープ境界](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15)を参照してください。

## クイックスタート

### 1. デーモンの起動（ループバック、認証なし）

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

デフォルトのバインドは `127.0.0.1:4170` です。ループバックではベアラ認証が**オフ**になっているため、ローカル開発は「そのまま」動作します。デーモンは現在の作業ディレクトリにバインドされます。オーバーライドするには `--workspace /path/to/dir` を使用します。

**Web Shell UI を開きます。** `http://127.0.0.1:4170/` にアクセスするか（または `qwen serve --open` でデーモンを起動して自動的に開きます）、ブラウザ全体のターミナル（チャット、差分、ツール呼び出し、権限プロンプト）を表示します。UI は API と同じオリジンのデーモンルートで提供されます。このガイドの残りの部分では生の HTTP を使用するため、API に対して直接スクリプトを実行できます。

### 2. 動作確認

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

`workspaceCwd` フィールドはバインドされたワークスペースを表面化するため、クライアントは事前チェックを行い、`POST /session` で `cwd` を省略できます。
`limits.maxPendingPromptsPerSession` フィールドは、アクティブなセッションごとのプロンプト受け入れ上限を通知します。`null` は上限が無効であることを意味します。

### デーモンからチャネルを実行する

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under one daemon-owned worker
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all
```

このモードは実験的であり、デーモンによって管理されます。スタンドアロンの `qwen channel start` コマンドを置き換えるものではありません。スタンドアロンチャネルは引き続き ACP ベースの `AcpBridge` サービスを使用します。`qwen serve --channel` を使用すると、デーモンは HTTP ランタイムの準備が整った後に 1 つのチャネルワーカープロセスを起動します。起動後にワーカーが終了した場合でもデーモンは実行を継続し、`GET /daemon/status` は `channel_worker_exited` 警告を報告します。ワーカーの自動再起動は延期されています。

デーモンは 1 つのワークスペースにバインドされるため、選択したすべてのチャネルの `cwd` はデーモンのワークスペースに解決される必要があります。`--channel all` は名前付きチャネルと組み合わせることはできません。

デーモンは、クライアント UI とオペレーター向けに読み取り専用のランタイムスナップショットも公開します。`GET /daemon/status`、`GET /workspace/mcp`、`GET /workspace/skills`、`GET /workspace/providers`、`GET /workspace/env`、`GET /workspace/preflight`、`GET /session/:id/status`、`GET /session/:id/context`、`GET /session/:id/supported-commands`、`GET /session/:id/tasks`、および `GET /session/:id/lsp` です。

`GET /session/:id/status` は、単一セッションのライブブリッジサマリーを返します。`sessionId`、`workspaceCwd`、`createdAt`、オプションの `displayName`、`clientCount`、および `hasActivePrompt` です。デーモンがその ID のライブセッションを保持している場合は `200` でサマリーを返し、それ以外の場合は `404`（ボディ `{ "error": …, "sessionId": … }`）を返します。ページ化されたセッションリスト全体を取得してスキャンすることなく、既知の 1 つのセッションがまだ実行中かどうか（`hasActivePrompt`）または何人のクライアントが接続されているか（`clientCount`）をポーリングするために使用します。

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

これは生のライブセッションビューであるため、`clientCount` と `hasActivePrompt` は `GET /workspace/:id/sessions` の対応するエントリと一致しますが、2 つのルートはバイト単位で同一ではありません。リストエンドポイントは、永続化されたセッションストアデータで各アイテムを充実させます。その `createdAt` は永続化された最初のプロンプトの時間であり、`updatedAt` と、保存されたタイトルまたは最初のプロンプトから派生した `displayName` が追加されます。一方、`/status` はライブセッション自体の `createdAt` を報告し、`updatedAt` を省略し、`displayName` はライブセッションに設定されている場合にのみ返します。

`GET /session/:id/lsp` は、セッションごとの構造化された LSP ステータスを返します。生成されたエージェントセッションで LSP を有効にするには、`--experimental-lsp` を指定してデーモンを起動します。それ以外の場合、ルートはサーバーなしで `enabled: false` を返します。

`GET /daemon/status` は統合されたトラブルシューティングスナップショットです。デフォルトの `detail=summary` はインメモリ上のデーモン状態（セッション、権限、SSE/ACP トランスポートカウント、レート制限拒否、プロセスメモリ、解決された制限）のみを読み取り、ACP 子は起動しません。問題の調査中に、セッションごとの診断、ACP 接続の詳細、認証デバイスフローカウント、およびワークスペースステータスセクションを取得するには、`GET /daemon/status?detail=full` を使用します。

`GET /workspace/mcp`、`GET /workspace/skills`、および `GET /workspace/providers` はライブ ACP ランタイムを報告し、アイドル時には ACP 子を起動しません。アイドル状態のデーモンは空のスナップショットで `initialized: false` を返します。セッションが存続すると、`initialized: true` に切り替わり、実際の状態を表面化します。

`GET /workspace/env` と `GET /workspace/preflight` は、ACP の状態に関係なく常に `initialized: true` で応答します。`env` は ACP を参照しません（デーモンプロセス情報のみ）。`preflight` は `process.*` からデーモンレベルのセルに回答し、子がアイドル状態のときは ACP レベルのセルに対して `status: 'not_started'` プレースホルダーを出力します。

`GET /workspace/env` は、デーモンプロセスのランタイム、プラットフォーム、サンドボックス、プロキシ、および `OPENAI_API_KEY` などのホワイトリストに登録されたシークレット環境変数の**存在**（値そのものではない）を報告します。プロキシ URL は資格情報が削除され、ネットワークに送信される前に `host:port` に削減されます。このルートは常にデーモンプロセスから直接応答し、ACP 子を生成することはありません。

`GET /workspace/preflight` は準備状態チェックのリストを返します。**デーモンレベルのセル**（Node バージョン、CLI エントリ、ワークスペースディレクトリ、ripgrep、git、npm）は常にレンダリングされます。**ACP レベルのセル**（認証、MCP 検出、スキル、プロバイダー、ツールレジストリ、エグレス）にはライブの ACP 子が必要です。デーモンがアイドル状態の場合、それらを入力するためだけに ACP を生成するのではなく、`status: 'not_started'` プレースホルダーを出力します。失敗はクローズドな `errorKind` 列挙型（`missing_binary`、`auth_env_error`、`init_timeout`、`protocol_error`、`missing_file`、`parse_error`、`blocked_egress`）にマッピングされるため、クライアント UI は構造化された修復策をレンダリングできます。

デーモンはワークスペースファイルヘルパーも公開します。

- `GET /file` はテキストファイルを読み取り、生バイトの `sha256:<hex>` ハッシュを返します。
- `GET /file/bytes` は境界付きの生バイトウィンドウを読み取り、base64 コンテンツを返します。
- `POST /file/write` はテキストファイルを作成または置換します。
- `POST /file/edit` は 1 回の正確なテキスト置換を適用します。

書き込み / 編集は**厳格な変更ルート**です。ループバックでも設定されたベアラートークンが必要であり、そうでない場合は `token_required` を返します。置換と編集には、`GET /file`（またはフルウィンドウの `GET /file/bytes`）からの最新の `expectedHash` が必要です。`create` は決して上書きしません。無視されたパスへの明示的な書き込みは許可されますが、監査されます。バイナリの書き込み、削除 / 移動 / mkdir、および再帰的な親ディレクトリの作成は、この表面の一部ではありません。

### 3. セッションを開く

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` は省略可能です。省略した場合、ルートはデーモンがバインドされているワークスペースにフォールバックします。バインドされているワークスペースと一致しない `cwd` をポストすると、`400 workspace_mismatch` が返されます（デーモンは正確に 1 つのワークスペースにバインドされています。別のワークスペースの場合は別のデーモンを起動してください）。

`/session` にポストする 2 番目のクライアント（一致する `cwd` またはなし）は `"attached": true` を取得します。これでエージェントを共有することになります。

### 4. イベントストリームを購読する（まず別のターミナルで）

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

`data:` 行は**完全なイベントエンベロープ**（`{id?, v, type, data, originatorClientId?}`）であり、1 行に JSON 文字列化されています。ACP ペイロード（この例では `sessionUpdate` ブロック）は、そのエンベロープ内の `data` の下に配置されます。SSE レベルの `id:` / `event:` 行は EventSource クライアント向けの利便性ですが、同じ値が JSON エンベロープ内にも含まれているため、生の `fetch` コンシューマーもそれらを取得できます。

プロンプトを送信する**前**にこれを開きます。SSE リプレイバッファは最後の 8000 個のイベントを保持するため、遅れて購読したクライアントは `Last-Event-ID` 経由でキャッチアップできますが、単純な「1 つのプロンプトを監視する」ケースでは、最初に購読してライブストリーミングさせるのが最も簡単です。

ストリームは `session_update`（LLM チャンク、ツール呼び出し、使用量）、`permission_request`（ツールの承認が必要）、`permission_resolved`（誰かが投票した）、`model_switched`、`model_switch_failed`、および終端フレームである `session_died`（エージェント子がクラッシュした — SSE はその後閉じられる）と `client_evicted`（キューがオーバーフローした — SSE はその後閉じられる）を出力します。

### 5. プロンプトを送信する（元のターミナルに戻る）

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

ステップ 4 の `curl -N` は、フレームが到着するたびに出力します。

## 認証

ループバック以外の場合、ベアラートークンを渡す**必要があります**。

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

クライアントはその後、すべてのリクエストで `Authorization: Bearer $QWEN_SERVER_TOKEN` を送信します。`/health` は**ループバックバインドの場合のみ**免除されるため、ポッド内の k8s/Compose の Liveness プローブ（デーモンが `127.0.0.1` をリッスンしている場所）は資格情報を必要としません。非ループバックバインド（`--hostname 0.0.0.0` など）では、`/health` は他のすべてのルートと同様にトークンを必要とします。そうでなければ、攻撃者が任意のアドレスをプローブしてデーモンの存在を確認できてしまいます。トークンがエンドツーエンドで正しいことを確認するには `/capabilities` を使用します（これは常に認証を必要とします）。

> **強化されたループバック（`--require-auth`）。** デフォルトのループバックのトークンなし動作はシングルユーザーのラップトップでは問題ありませんが、ローカルユーザーなら誰でも `curl 127.0.0.1:4170` を実行できる共有開発ホスト、CI ランナー、またはマルチテナントワークステーションでは安全ではありません。`--require-auth` を渡すと、`127.0.0.1` にバインドされている場合でも、`/health` や `/capabilities` を含むすべてのルートでベアラートークンが必須になります。トークンがないと起動に失敗します。このフラグをオンにすると、**未認証の**クライアントは `/capabilities` を読み取って認証が必要であることを発見できなくなります。発見の表面は 401 レスポンスボディ自体になります。認証後、`caps.features.require_auth` タグは、デプロイが強化されていることの認証後確認となります（監査 / コンプライアンス UI に有用です）。
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
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

トークンの比較は定数時間で行われます（SHA-256 + `crypto.timingSafeEqual`）。401 レスポンスは「ヘッダーなし」、「不正なスキーム」、「不正なトークン」で統一されているため、サイドチャネルで区別できません。

## HTTPS / TLS（モバイル / クロスデバイスアクセス用）

デフォルトでは、デーモンはプレーンな HTTP を提供します。これは `localhost` では問題ありませんが、LAN IP（`https://192.168.x.x:4170`）にアクセスするスマートフォンやタブレットは、`http://` 経由では[セキュアコンテキスト](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)**ではありません**。そのため、ブラウザは `getUserMedia`（音声入力）、WebRTC、およびその他のセキュアコンテキスト専用 API をブロックします。`--tls-cert` と `--tls-key` を渡して、Web Shell を HTTPS 経由で提供し、それらの API を有効化します。
```bash
# 1. ローカル CA をインストールして信頼します（一度だけ）。モバイルデバイスも
#    この CA を信頼する必要があります。mkcert はルート証明書が保存される場所を表示します。
mkcert -install

# 2. マシンの LAN IP 用の証明書を生成します。localhost / 127.0.0.1 も
#    SAN に追加します。`--open` を指定すると、デーモンはブラウザの URL を
#    127.0.0.1 に書き換えるため、LAN IP のみにスコープされた証明書は
#    ERR_CERT_COMMON_NAME_INVALID で拒否されます（mkcert はすべてのホスト名に基づいて出力ファイルに名前を付けます）。
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. HTTPS 経由でデーモンを起動します。ループバック以外のバインドには引き続きトークンが必要であり、
#    ブラウザの Origin は CORS で許可されている必要があります。
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve が https://0.0.0.0:4170 でリッスンしています
```

注意事項:

- **両方のフラグ、またはどちらも指定しない** — どちらか一方だけを指定すると起動に失敗します（キーのない証明書では HTTPS リスナーを開始できません）。
- **TLS は認証と直交します** — HTTPS はトランスポートを暗号化しますが、Bearer トークンが引き続きすべての API ルートを保護します。ループバック以外のバインドでは、TLS の有無にかかわらずトークンが必要です。
- **スコープは TLS ターミネーションのみ** — 自動生成や ACME / Let's Encrypt はサポートしていません。これは LAN / 開発環境向けの便利な機能です。インターネットに公開するデプロイメントでは、リバースプロキシで TLS をターミネートしてください（後述の脅威モデルを参照）。

## CLI フラグ

| フラグ | デフォルト | 目的 |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | TCP ポート。`0` = OS によって割り当てられるエフェメラルポート。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--hostname <addr>`                     | `127.0.0.1`     | バインドするインターフェース。ループバック以外を指定する場合はトークンが必要です。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--token <str>`                         | —               | Bearer トークン。指定がない場合は `QWEN_SERVER_TOKEN` 環境変数にフォールバックします（先頭と末尾の空白は削除されるため、`$(cat token.txt)` などに便利です）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`         | Bearer トークンなしでの起動を拒否します（ループバックでも同様）。ローカルユーザーが誰でもリスナーにアクセスできる共有開発ホスト / CI ランナー / マルチテナントワークステーションにおいて、`127.0.0.1` という開発者向けデフォルト設定を強化します。`--token` または `QWEN_SERVER_TOKEN` が設定されている場合にのみ起動し、`/health` も Bearer トークンで保護します。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —               | PEM 証明書ファイルへのパス。HTTP ではなく **HTTPS** で提供します。`--tls-key` とペアで指定する必要があります（どちらか一方だけを指定すると起動に失敗します）。LAN IP 経由で、ブラウザがプレーンな `http://` ではブロックするセキュアコンテキストのブラウザ API（音声入力（`getUserMedia`）、WebRTC など）を有効化します。TLS ターミネーションのみ。自動生成 / ACME はサポートしていません。後述の [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) を参照してください。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tls-key <path>`                      | —               | PEM 秘密鍵ファイルへのパス。`--tls-cert` とペアで指定する必要があります。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `20`            | 同時実行ライブセッションの上限。上限に達した場合、新しい子プロセスを生成する `POST /session` リクエストは `503`（`Retry-After: 5` 付き）を返します。既存セッションへのアタッチはカウントされません。無効にするには `0` を設定します。シングルユーザー / 小規模チームでの使用を想定したサイズです。デプロイメントに RAM / FD の余裕がある場合は、この値を上げてください（1セッションあたり約 30〜50 MB）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | `5`             | 1セッションあたりの、`POST /session/:id/prompt` で受け付けられたがまだ確定していないプロンプトの上限（キューイングされたプロンプトとアクティブなプロンプトを含む）。上限を超えた場合、ブリッジは `promptId` を返す前に、`503`、`Retry-After: 5`、および `code: "prompt_queue_full"` を同期的に返却して拒否します。無効にするには `0` を設定します。`branchSession` は同じ FIFO で直列化されますが、このプロンプト上限にはカウントされません。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | このデーモンがバインドする絶対ワークスペースパス（[#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 に準拠 — 1デーモン = 1ワークスペース）。`cwd` が一致しない `POST /session` リクエストは `400 workspace_mismatch` を返します。マルチワークスペースのデプロイメントでは、ワークスペースごとに個別のポートで `qwen serve` を 1 つずつ実行してください。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--channel <name\|all>`                 | —               | 実験的なデーモン管理チャネルワーカー。フラグを繰り返して複数の設定済みチャネルを選択するか、`all` を渡してすべての設定済みチャネルを起動します。`all` は名前付きチャネルと組み合わせることはできません。選択したチャネルの `cwd` 値はデーモンのワークスペースに解決される必要があります。ワーカーは `qwen serve` が所有します。serve 管理チャネルを停止するにはデーモンを停止します。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--max-connections <n>`                 | `256`           | リスナーレベルの TCP 接続上限（`server.maxConnections`）。セッション数に関係なく、生のソケット数を制限します。上限に達すると、低速 / ファントムの SSE クライアントは accept 時に拒否されます。デプロイメントで 1セッションあたりの SSE サブスクライバーが多くなることが予想される場合は、`--max-sessions` と合わせてこの値を上げてください。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`                 | `8000`          | 1セッションあたりの SSE リプレイリングの深さ（#3803 §02 ターゲット）。`Last-Event-ID: N` を指定した `GET /session/:id/events` で利用可能なバックログを設定します。値を大きくすると、1セッションあたり数百 KB の追加 RAM を消費する代わりに、再接続の余裕が増えます。SDK クライアントは、`?maxQueued=N`（範囲 `[16, 2048]`、デフォルト 256）を介して、特定のサブスクリプションに対してサブスクライバーごとのより大きなバックログ上限を追加で要求できます。デーモンはまた、キューが 75% 埋まった時点で非ターミナルの `slow_client_warning` SSE フレームを出力し、クライアントが排除される前にドレイン / 再接続できるようにします。プリフライト: `caps.features.slow_client_warning`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-client-budget <n>`               | —               | **ACP セッションごと**のライブ MCP クライアントの正の整数上限（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1。PR 23 で共有 MCP プールを介してワークスペースごとに昇格）。`--mcp-budget-mode` と組み合わせて使用します。未設定の場合、アカウンティングによる強制は行われません（ただし、`GET /workspace/mcp` は引き続き `clientCount` を報告します）。起動の同時実行を制限する claude-code の `MCP_SERVER_CONNECTION_BATCH_SIZE` とは異なり、こちらはクライアントの総数を制限します。プリフライト: `caps.features.mcp_guardrails`。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | `--mcp-client-budget` の強制方法。`warn`（予算設定時のデフォルト）: 拒否はせず、スナップショットの `budgets[0].status` が予算の 75% 以上で `warning` に切り替わります。`enforce`: 上限を超える接続は拒否され、サーバーごとのセルに `disabledReason: 'budget'` が表示されます（`mcpServers` の宣言順序によって決定的に決定）。`off`（予算未設定時のデフォルト）: 純粋な観測性。予算なしで `enforce` を指定すると起動時に拒否されます。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--http-bridge`                         | `true`          | ステージ 1 モード: デーモンごとに 1 つの `qwen --acp` 子プロセス（起動時に 1 つのワークスペースにバインドされる。[#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 に準拠）。N 個のセッションが ACP の `newSession()` を介してその子プロセスに多重化されます。ステージ 2 のネイティブなインプロセス処理は後日利用可能になる予定です。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514))。ブラウザ Web UI クライアントのクロスオリジン許可リスト。繰り返し指定可能です。各値は `*`（任意のオリジン。Bearer トークンが設定されていない場合は起動を拒否。ループバックでの `--require-auth` を推奨。これにより `/health` と `/demo` も Bearer トークンで保護されます。デフォルトではこれら両方がループバックで事前認証のため）または正規の URL オリジン（`<scheme>://<host>[:<port>]`。末尾のスラッシュ / パス / userinfo / クエリは不可）です。**サブドメインワイルドカード（`https://*.example.com`）は意図的にサポートされていません**。各サブドメインを明示的にリスト化するか、設定したトークン（および完全な強化のための `--require-auth`）と共に `*` を使用してください。一致したオリジンには CORS レスポンスヘッダー（`Access-Control-Allow-Origin`、`Vary: Origin`、メソッド、ヘッダー、max-age、および公開される `Retry-After`）が送信されます。一致しないオリジンには、現在と同様のエンベロープで 403 が返されます。`Origin: null`（サンドボックス化された iframe、file:// ドキュメント）は `*` を指定した場合でも常に拒否されます。プリフライトは `caps.features.allow_origin` 経由。ループバックのセルフオリジンヒットは影響を受けません。 |
| `--web` / `--no-web`                    | `true`          | ビルドされた Web Shell SPA をデーモンのルート（`GET /`、`/assets/*`、および SPA ディープリンクのフォールバック）で提供します。静的シェルは Bearer 認証ゲートの **前** に登録されます。ブラウザは `<script>` サブリソースやアドレスバーのナビゲーションにトークンを付加できないため、シェルには秘密情報が含まれず、すべての API ルートは引き続きトークンで保護されます。ループバック以外のバインドでは、UI が認証なしでアクセス可能である旨の 1 行の stderr 警告が表示されます。API のみのデーモンとして使用する場合は `--no-web` を使用します。ビルド時に Web Shell アセットが省略されている場合は効果がありません（デーモンはパンくずログを出力し、API のみで実行されます）。                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--open`                                | `false`         | リスナーが起動した後、デーモンの URL でデフォルトブラウザの Web Shell を開きます（トークンが設定されている場合は `#token=` が URL フラグメントとして追加されます。フラグメントはサーバーに送信されないため、トークンがアクセスログや Referer ヘッダーに残るのを防ぎます）。`--no-web` を指定した場合、またはブラウザが利用できないヘッドレス / CI / SSH 環境では無効（no-op）です。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
> **負荷調整ノブのサイジング。** `--max-sessions` は**新規子プロセス**の上限です。
> 他の3つのレイヤーも負荷を制限します。高並行性のデプロイメント向けにサイジングする場合は、これらをまとめてチューニングしてください。
>
> - **リスナーレベル**: `--max-connections` / `server.maxConnections=256` は生のTCP接続を制限します（低速クライアントのバックプレッシャー）。
> - **セッションごとのサブスクライバー**: EventBusはデフォルトでSSEサブスクライバーをセッションあたり64に制限します。65番目のクライアントはターミナルの `stream_error` を受け取り、クローズされます。
> - **セッションごとのプロンプトアドミッション**: `--max-pending-prompts-per-session=5` は、1つのセッションで受け入れられるキューイング済みおよびアクティブなプロンプトを制限します。オーバーフローすると `Retry-After: 5` 付きの `503` が返されます。
> - **サブスクライバーごとのバックログ**: SSEクライアントあたり256フレームのキュー。容量を超えたクライアントはターミナルの `client_evicted` フレームを受け取り、クローズされます（1つの低速なコンシューマーがデーモンを占有しないようにします）。
>
> これらの上限は相互に関連します。`--max-sessions × 64サブスクライバー × 256フレーム` はEventBusレイヤーでのワーストケースのインフライトメモリであり、`--max-sessions × --max-pending-prompts-per-session` はアドミッションレイヤーで受け入れられるプロンプトワークを制限します。デフォルトのサイジングはシングルユーザー/小規模チームの負荷を想定しています。マルチテナントデプロイメントの場合は、段階的に引き上げ（RSSを監視しながら）てください。

> **MCPクライアントのガードレール（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14）。** `mcpServers` で30のMCPサーバーを宣言しているワークスペースは、上限を設定しない限り、上流のキャップなしで30のクライアントを起動します。`--mcp-client-budget=N` は稼働中のMCPクライアント数を制限し、`--mcp-budget-mode={enforce,warn,off}` で動作を選択します。予算が設定されている場合のデフォルトは `warn` です（スナップショットは警告を表示しますが、クライアントは拒否されません。強制モードに切り替える前に実際のファンアウトを測定するのに便利です）。`enforce` モードで拒否されたサーバーは、サーバーごとのセルに `disabledReason: 'budget'` を取得し、`budgets[0]` セルには `status: 'error'` と `errorKind: 'budget_exhausted'` が表示されます。スロットの予約はサーバー名ごとに行われ、再接続や検出タイムアウト後も維持されます。拒否されたサーバーが正常なサーバーからスロットを奪うことはありません。
>
> ⚠️ **v1のスコープ: ワークスペースごとではなく、セッションごとです。** デーモン内の各ACPセッションは、独自の `Config`/`McpClientManager` を持ちます（セッションごとに `newSessionConfig` を介して作成されます）。予算はワークスペース内の全セッションを集計したものではなく、**セッションごと**の稼働中MCPクライアント数を制限します。`GET /workspace/mcp` のスナップショットはブートストラップセッションのビューを反映します（正確を期すため、セルには `scope: 'session'` が含まれます）。`--mcp-client-budget=10` で5つのACPセッションを同時に実行する場合、デーモン全体で最大50の稼働中MCPクライアントが存在する可能性があります。上限はセッションごとに維持されます。**Wave 5 PR 23（共有MCPプール）** では、ワークスペーススコープのマネージャーが導入され、真のワークスペースごとの強制に移行します。
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> これはclaude-codeの `MCP_SERVER_CONNECTION_BATCH_SIZE`（起動時の並行性を制限するもの）とは**同じではありません**。これらは直交するものです。PR 23では、実際の共有MCPプール（セッションごとのセルに加えて `budgets[]` 内の `scope: 'workspace'` セル）が追加されます。PR 14 v1は、既存のセッションごとのマネージャーに対するプロセス内カウンターとソフトな強制です。
>
> **プッシュイベント（issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b）。** `GET /session/:id/events` をサブスクライブしているSDKクライアントは、予算のしきい値を超えたときに型付きフレームを受け取ります。`mcp_budget_warning`（合成フレームで、75%を超えるたびに1回発生し、37.5%でヒステリシス再武装され、`mcp_guardrail_events` 経由で通知されます）と `mcp_child_refused_batch`（`enforce` モードでの検出パスごとに1回に統合されます。`readResource` の遅延生成拒否による長さ1のフレーム）です。`GET /workspace/mcp` のスナップショットは、再接続後の状態の信頼できる情報源です。イベントは変化のエッジです。ポーリングなしでリアルタイムにダッシュボード化する際に便利です。

## デフォルトのデプロイメント脅威モデル

- **127.0.0.1のみ** — ループバックバインド、認証不要。
- **`--hostname 0.0.0.0` はトークンを要求** — トークンなしでは起動が拒否されます。
- **`LOOPBACK_BINDS` にはIPv6が含まれる** — `::1` および `[::1]` は、トークン不要ルールにおいてループバックとしてカウントされます。
- **Hostヘッダーの許可リスト** — **ループバック**バインドでは、デーモンはDNSリバンディングから防御するために、`Host:` が `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` に一致するかをチェックします（RFC 7230 §5.4に従い大文字小文字を区別しません）。**ループバック以外のバインド（`--hostname 0.0.0.0`）は、意図的にHost許可リストをバイパスします**。オペレーターが公開範囲を選択しているため、ベアラートークンのゲートが唯一の認証レイヤーとなります。リバースプロキシ / SNI / クライアント証明書のピン留めはデーモンではなくオペレーターの責任です。ループバック以外のバインドでHostベースの分離が必要な場合は、フロントプロキシでTLSを終端し、Hostをチェックしてください。
- **CORSはデフォルトで任意のブラウザのOriginを拒否** — `403` JSONを返します。特定のブラウザのOriginを許可するには **`--allow-origin <pattern>`**（繰り返し指定可能、T2.4 #4514）を渡します。各値はリテラルの `*`（任意のOrigin。ベアラートークンが設定されていない場合は起動が拒否されます。`/health` と `/demo` はデフォルトでループバックでは事前認証のままになるため、完全なハードニングにはループバックでの `--require-auth` を推奨します）または正規化されたURLオリジン（`<scheme>://<host>[:<port>]`、末尾のスラッシュ / パス / userinfoなし）のいずれかです。一致したOriginは適切なCORSレスポンスヘッダー（`Access-Control-Allow-Origin: <echoed>`、`Vary: Origin`、および標準のメソッド / ヘッダー / max-age、公開される `Retry-After`）を受け取ります。一致しないOriginは、デフォルトのウォールと同じエンベロープで403を受け取ります。`caps.features.allow_origin` は条件付きで通知されるため、SDK / webuiクライアントはリクエストを発行する前に、デーモンがクロスオリジンヒットを許可するかどうかをプリフライトで確認できます。例: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`。ループバックのセルフオリジンヒット（例: `/demo` ページ）は影響を受けません。`--allow-origin` に関係なく、別のOriginストリップシムがこれらを処理します。`--allow-origin` が設定されていない**ブラウザのwebui**は、以前と同じStage 1のオプションにフォールバックします。`Origin` ヘッダーが送信されないようにネイティブシェル（Electron/Tauri）としてパッケージ化するか、同じオリジンのリバースプロキシでデーモンの前に配置します。
- **生成された `qwen --acp` 子プロセスはデーモンの環境を継承**しますが、1つ明示的にスクラブされます。`QWEN_SERVER_TOKEN` は子プロセスが開始される前に削除されます（デーモン自身のベアラートークンであり、エージェントはそれを必要としません）。その他すべて — `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / カスタムの `modelProviders[].envKey` など — はそのまま渡されます。エージェントはLLMへの認証のためにこれらを正当に必要とするためです。**これは意図的なものであり、サンドボックスではありません。** エージェントは同じUIDでシェルツールアクセス権を持って実行されるため、プロンプトインジェクションによって `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` の中の何にでもアクセス可能です。環境のパススルーはセキュリティ境界ではなく、信頼のルートとしてのユーザーが境界です。エージェントに信頼できない環境変数に存在する資格情報を持つIDで `qwen serve` を実行しないでください。
- **サブスクライバーごとの制限付きSSEキュー** — キューをオーバーフローさせた低速クライアントは `client_evicted` ターミナルフレームを受け取り、クローズされます。1つの停滞したコンシューマーがデーモンを占有することはありません。
- **セッションごとのプロンプトアドミッションキャップ** — デフォルトでセッションあたり5つの受け入れ済みだが未解決のプロンプトに制限されます。バグのあるクライアントは、1つのセッションに対して無制限のプロミスや一時的なSSE待機をキューに入れることはできません。
- **グレースフルシャットダウン** — SIGINT/SIGTERMは、リスナーをクローズする前にエージェントの子プロセスをドレインします（子プロセスあたり10秒のデッドライン）。

> ⚠️ **Stage 1の既知のギャップ — 権限はデーモン全体で有効であり、セッションごとではありません (BUy4H)。** `pendingPermissions` はデーモンスコープに存在します。ベアラートークンを持つ任意のクライアントは、表示可能な任意のセッションの任意の `requestId` に対して投票できます（また、SSEの `permission_request` イベントはペイロードにrequestIdを含みます）。これは、認証されたすべてのクライアントが同じ人間、または信頼できる協力者であるシングルユーザー/小規模チームの信頼モデルでは許容されます。Stage 1.5では、`POST /session/:id/permission/:requestId` + セッションスコープの保留中マップ + クライアントごとのIDに移行します（ダウンストリームレビューからのmust-have #3）。それまでは、信頼できないパーティと共有されるベアラートークンの背後で `qwen serve` を実行しないでください。
>
> ⚠️ **Stage 1の既知のギャップ — `POST /session/:id/prompt` のボディは10 MBに制限 (BUy4L)。** 10 MBを超える画像 / PDF / オーディオを含むマルチモーダルプロンプトは、ルートロジックが実行される前のボディ解析時に失敗します（ストリーミングなし、アップロード中の中止なし）。回避策: クライアント側でコンテンツを縮小するか、パス参照を渡してエージェントに `readTextFile` 経由でファイルを読み取らせます。Stage 1.5では、`/prompt` で `multipart/form-data` またはチャンクエンコーディングを受け付け、大きなプロンプトが制限にぶつからないようにします。
>
> ⚠️ **Stage 1の既知のギャップ — NATの背後でのファントムSSE接続。** デーモンは、ハートビート（15秒間隔）のTCPバックプレッシャーを介して死亡したクライアントを検出します。TCP RSTなしに消滅するクライアント（例: アイドルフローをサイレントにドロップするNATボックス）は、Nodeのキープアライブプローブがタイムアウトするまで（Linuxのデフォルトでは通常約2時間）、カーネルレベルのソケットを「生存」させます。このようなNATの背後にある `--hostname 0.0.0.0` デプロイメントでは、ファントムSSE接続が蓄積し、最終的に256の `server.maxConnections` 上限に達する可能性があります。
>
> 明示的なアプリケーションレベルのアイドルデッドラインを設定する [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9）を設定して、このギャップを埋めます。`n` ms間書き込みが正常にフラッシュされない場合、デーモンは `reason: 'writer_idle_timeout'` を含むターミナルの `client_evicted` フレームを発行し、ストリームをクローズします。このフラグは、レガシーな契約を維持するためにデフォルトでオフになっています。RSTを飲み込むネットワーク上のオペレーターは、正当なアイドル接続が追い出されないように、15秒のハートビート間隔よりも十分に大きい値（例: `60000`〜`300000`）を選択し、本当に停滞したライターを迅速に回収する必要があります。SDKから `caps.features.includes('writer_idle_timeout')` をプリフライトして、デーモンがそれをサポートしていることを確認してください。

### デッドラインとライターのアイドルタイムアウト

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9では、15秒のハートビート + AbortSignalではカバーできない長時間実行/リモートデプロイメントのギャップを埋める2つのオプトインフラグが提供されます。どちらもデフォルトでオフになっています。シングルユーザーのループバックワークフローはビット単位で変更されません。

| フラグ                           | 環境変数                             | デフォルト | 動作                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | 未設定   | 単一の `POST /session/:id/prompt` に対するサーバー側の壁時計キャップ。期限切れになると、デーモンはプロンプトのAbortControllerを中止し、`{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}` を含むHTTP `504` を返します。プロンプトごとのリクエストボディフィールド `deadlineMs` は、フラグの有効なデッドラインを短縮することはできますが、延長することはできません。機能タグ（条件付き）: `prompt_absolute_deadline`。                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | 未設定   | SSE接続ごとのアイドルデッドライン。`n` ms間、書き込みが正常にフラッシュされなかった場合（実際のイベントも15秒のハートビートもなし）、デーモンは `data.reason = 'writer_idle_timeout'`（`data.errorKind` にもミラーリングされる）を含むターミナルの `client_evicted` フレームを発行し、ストリームをクローズします。**15秒のハートビートよりも十分に大きい値**（例: `30000`〜`300000`）を選択して、正当なアイドルストリームが追い出されないようにします。`< 15000` の値は、最初のハートビートが発生する前に、そうでなければ健全なアイドル接続を追い出します（テスト/短命な開発セッションのみを意図）。機能タグ（条件付き）: `writer_idle_timeout`。 |

どちらのフラグもミリ秒単位の正の整数を受け入ります。`0`、`NaN`、非整数、または負の値は、起動時に明確なエラーメッセージとともに拒否されます。CLIフラグは環境変数より優先されます。明示的な `ServeOptions` フィールド（組み込み呼び出し元）は環境変数より優先されます。SDKコンシューマーは、いずれの動作にも依存する前に、一致する機能タグをプリフライトする必要があります。このPRより前のデーモンは両方のタグを省略し、リクエストの `deadlineMs` フィールドはサイレントにドロップされます。

## マルチセッションおよびマルチワークスペースデプロイメント

[#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02に従い、各 `qwen serve` プロセスは起動時に**1つのワークスペース**にバインドされます。そのワークスペース内で、エージェントのネイティブセッションマップを介してN個のセッションを単一の `qwen --acp` 子プロセスに多重化します。セッションは子プロセスのプロセス / OAuth状態 / ファイル読み取りキャッシュ / 階層メモリ解析を共有します。

**複数のワークスペース**（1人のユーザー、複数のリポジトリ、または同じホスト上の複数のユーザー）をホストするには、**複数のデーモンプロセス**を実行します。ワークスペースごとに1つ、それぞれ独自のポートで、systemd / docker-compose / k8s / `qwen-coordinator` リファレンスオーケストレーターによって監督されます。このトレードオフは意図的なものです。子プロセスごとに1つのワークスペースにすることで、`loadSettings(cwd)` / OAuth / MCPサーバーのスコープがバインドされたディレクトリと整合したままになり、リクエスト間でドリフトすることはありません。

> **アタッチ時に `modelServiceId` をポストする前にサブスクライブしてください。** クライアントが `modelServiceId` を含む `POST /session` を実行し、ワークスペースにすでに異なるモデルを実行しているセッションがある場合、デーモンは内部で `setSessionModel` 呼び出しを発行します。失敗はHTTPエラーとして伝播されません（セッションは現在のモデルで動作し続けます）。目に見える失敗シグナルは、セッションのSSEストリーム上の `model_switch_failed` イベントです。`POST /session` を呼び出し、**その後に** `GET /session/:id/events` を開くと、失敗イベントを見逃し、サイレントに間違ったモデルと話し続けることになります。最初にSSEストリームを開くか、サブスクライブ時に `Last-Event-ID: 0` を渡して、リングの最も古い利用可能なイベントをリプレイしてください。

複数の**ユーザー**（それぞれに独自のクォータ、監査ログ、サンドボックスを持つ）を処理する場合、または1つのプロセスの範囲を超えてスケーリングする場合（コールドスタート予算、FD数、RSS）は、外部オーケストレーターの背後に、ユーザーごとにワークスペースごとに1つのデーモンを生成します。そのオーケストレーター（マルチテナンシー / OIDC / クォータ / 監査 / k8s）は、qwen-codeプロジェクトの**スコープ外**です。設計のポインターについては、issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) の「External Reference Architecture」を参照してください。

## 永続化されたセッションのロードと再開

デーモンは、2つのルート経由でHTTPを介してACPの `session/load` および再開フローを公開します。

| ルート                      | 使用タイミング                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | クライアントにレンダリングされた履歴が**ない**場合（コールド再接続、ピッカーからのオープン）。デーモンは永続化されたすべてのターンをSSE経由でリプレイし、サブスクライバーは完全なトランスクリプトを確認できます。機能タグ: `session_load`。                                                                                        |
| `POST /session/:id/resume` | クライアントがすでに画面上にターンを持っており、デーモン側のハンドルだけを必要とする場合。モデルコンテキストはエージェント側でUIリプレイなしに復元され、SSEストリームはクリーンなままです。機能タグ: `session_resume`（`unstable_session_resume` は古いクライアント向けの非推奨エイリアスのままです）。 |

TypeScript SDKは、どちらも `DaemonSessionClient` の静的ファクトリとして公開します。

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay history through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

呼び出す前に `caps.features.session_load` / `caps.features.session_resume` をプリフライトしてください。古いデーモンは `404` を返します。`unstable_session_resume` はまだ非推奨の互換性エイリアスとして通知されます。同じIDに対する同時の同じアクションリクエストは統合されます。クロスアクションの競合（`load` と `resume` の競合）は、`Retry-After: 5` を伴う `409 restore_in_progress` になります。完全なエラーエンベロープについては、[プロトコルリファレンス](../developers/qwen-serve-protocol.md)を参照してください。

注: 履歴のリプレイはSSEリング（デフォルト8000フレーム）によって制限されます。会話の多い長い履歴はこれを超える可能性があります。最も古いフレームはサイレントにドロップされます。非常に長いセッションの場合は、`resume` を優先し、クライアントのローカルに永続化されたUIに依存してください。

## 耐久性モデル

**Stage 1では、デーモンの再起動をまたいでセッションはまだエフェメラルです**が、ディスク上の永続化されたセッションはリロード可能です。

- 子プロセスのクラッシュは `session_died` を発行し、ライブセッションをデーモンのマップから削除します。ディスク上に永続化されたセッションは、新しいエージェント子プロセスを生成可能であれば、`POST /session/:id/load` 経由でリロード**できます**。
- デーモンの再起動は、進行中のすべてのライブセッションを失います。永続化されたセッションはディスク上に残り、同じワークスペースバインディングルールに従って、新しいデーモンプロセスに対してロードできます。
- 長時間のクライアント切断（会話の多いターンで5分以上）は、SSEリプレイリング（デフォルト8000フレーム）を追い越す可能性があります。`Last-Event-ID` 再接続は成功しますが、状態が一貫していない可能性があります。モバイル/不安定なネットワークのクライアントの場合は、長時間の切断時にSSEを再度開くか、`POST /session/:id/load` を呼び出してディスクからリプレイするように計画してください。
- ファイル操作（`writeTextFile`）はクラッシュをまたいでアトミックです（書き込んでからリネーム）。リプレイの意味ではデーモンの再起動をまたいでアトミックではありません。ファイルの書き込みは成功したか、失敗したかのどちらかです。

あなたのインテグレーションが `session/load` がカバーするものを超えるサーバー側の再起動をまたぐ耐久性（例: サーバー管理のリトライキュー）を必要とする場合、アプリケーションレベルの状態回復が依然として必要です。デーモンのセッション内に、長時間実行される再起動に敏感な状態を保持しないでください。

## Stage 1.5+ のランタイム保証

Stage 1の契約はプロトタイピング向けにサイジングされています。[#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644)に従い、以下はStage 1には**含まれません**。本番グレードのインテグレーションは、それらに依存する前にStage 1.5以降が必要です。
**本格的な下流利用におけるブロッカー:**

1. **HTTP 経由の `loadSession` / `unstable_resumeSession`** — これがないと、どのインテグレーションも子プロセスのクラッシュやデーモンの再起動に耐えられず、デーモンを調整するオーケストレーターも状態を回復できません。
2. **永続的なクライアント ID（ペアトークン + クライアントごとの取り消し）** — Stage 1 では 1 つの共有 Bearer トークンを使用します。トークンが漏洩すると全員が無効化され、`originatorClientId` は認証された ID からデーモンによってスタンプされるのではなく、クライアント自身によって宣言されたものになります。

**信頼性のベースライン:**

3. ~~**クライアント開始のハートビートパス**~~ — [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9 で出荷済み。`POST /session/:id/heartbeat` はデーモン上の最終確認タイムスタンプを記録します（ケーパビリティタグ `client_heartbeat`）。SDK ヘルパーは `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()` です。
4. 投票が最初の応答者レースに負けた場合の **`permission_already_resolved` イベント** — 現在、UI は `404` から状態を推測する必要があります。
5. ~~**より大きなリプレイリング**~~ — 8000 に引き上げられました。**セッションごとに設定可能なリング** は依然として未対応です — モバイル / 会話の多いワークロードでは、セッションごとのオーバーライドが必要になる場合があります。
6. **`client_evicted` の前に `slow_client_warning` イベント** — 行儀の良い遅いクライアントが、終了される前に自己スロットリング（レンダリング深度のトリミング、チャンクのドロップ）できるようにするためのソフトなバックプレッシャー。

**インテグレーションの利便性:**

7. IM 風コンテキスト用の **`POST /session/:id/_meta`** — 後続のプロンプトに添付されるセッションごとのキーバリュー（チャット ID、送信者、スレッド ID）が、チャネルごとのアドホックな実装を置き換えます。
8. **`/capabilities` による実際の機能ネゴシエーション** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` により、クライアントは「不明なフレーム、無視」にフォールスルーする代わりに、ドリフト（乖離）を検出できます。
9. **第一級の永続性ドキュメント**（このセクション） — 上記ですでに出荷済みです。

完全なコンバージェンスロードマップは [#3803](https://github.com/QwenLM/qwen-code/issues/3803) で追跡されています。

## Stage 1 のスコープ境界 — Stage 1.5 で修正しないもの

2 つの構造的な選択は、Stage 1 / 1.5 / 2 のメインラインロードマップにおいて明示的な非目標（ノンゴール）です。ユースケースがこれらに依存する場合は、私たちを待つのではなく、それらを回避するように計画してください。

### セッション状態はローカルミューテーションのみ（[LaZzyMan review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721) に基づく）

Stage 1.5 の計画では、TUI をプロセス内 EventBus サブスクライバーとして記述しています。実際には、**TUI UI はワイヤープロトコルよりも厳密に大きい**ものです。

- **ローカル限定の UI** — 約 15 個の Ink ダイアログコンポーネント（`ModelDialog`、`MemoryDialog`、`PermissionsDialog`、`SessionPicker`、`WelcomeBackDialog`、`FolderTrustDialog` など）と `local-jsx` スラッシュコマンド（`/ide`、`/auth`、`/init`、`/resume`、`/rename`、`/delete`、`/language`、`/arena` など）は、ターミナル固有の Ink JSX をレンダリングします。HTTP/SSE 上のリモートクライアントは同等に Ink をレンダリングできず、これらのフローはワイヤーイベントを発行しません。
- **ワイヤーイベントを伴わないセッション状態のミューテーション** — `/approval-mode`、`/memory add`、`/mcp add-server`、`/agents`、`/tools enable/disable`、`/auth`、`/init`（`CLAUDE.md` の書き込み）はすべてエージェントの動作を変更しますが、現在イベントを発行するのは `/model`（`model_switched`）だけです。

**Stage 1 の選択 — レビューのオプション (A)**: これらのミューテーションをワイヤーイベントに昇格させません。2 つのデプロイモードには異なる結果が伴います。

#### モード 1 — ヘッドレス `qwen serve`（この PR）

デーモン内で TUI シェルは実行されません。上記のスラッシュコマンドは、このモードでは**存在しません** — それらを発行するターミナル UI がないためです。したがって、セッション状態は次のようになります。

- `approval-mode` / `memory` / `agents` / `tools` 許可リスト / `auth` は**ブート時に凍結** — デーモンの `qwen --acp` 子プロセスが開始されるときに設定 + ディスクからすべて読み込まれ、セッションの存続期間中は不変です。設定で定義された MCP サーバーも同様にブート時に凍結されますが、**実行時に追加されたサーバー**（`POST /workspace/mcp/servers` 経由）は再起動なしで追加または削除できます。
- `POST /session/:id/model`（`model_switched` を発行）、`POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name`（`mcp_server_added` / `mcp_server_removed` を発行）、および許可投票（`POST /permission/:requestId`）を介して **HTTP 経由でミュータブル**。

**結果:** ヘッドレスモードのリモートクライアントは**完全なセッション状態**を参照できます。TUI が追加の状態を隠すことはなく、ドリフト（乖離）も発生しません。`approval-mode` を変更したい場合は、新しい設定でデーモンを再起動してください。MCP サーバーは、ミューテーションルート（`POST /workspace/mcp/servers`、`DELETE /workspace/mcp/servers/:name`）を介して実行時に追加/削除できるようになりました — [Runtime MCP server management](#runtime-mcp-server-management-issue-4514) を参照してください。

#### モード 2 — Stage 1.5 `qwen --serve` 共同ホスト TUI（この PR には含まれません）

Stage 1.5 で `qwen --serve`（TUI プロセスが同じ HTTP サーバーを共同ホスト）が導入されると、TUI はリモートクライアントと並んで**実際に存在**します。ローカルオペレーターが `/approval-mode yolo` や `/mcp add-server` を入力するとセッション状態がミューテーションされますが、HTTP 上のリモートクライアントにはその変更を観測するイベントがありません。

このモードでは、TUI は **「スーパークライアント」** となります。リモートクライアントと同じエージェント会話を観測し、**かつ**リモートクライアントができないセッション状態のミューテーションを行うことができます。この非対称性は以下の通りです。

- ✅ TUI とリモートクライアントの両方が、同じエージェントメッセージ、ツール呼び出し、ファイル差分、許可プロンプトを参照します。
- ❌ TUI のみが approval-mode / memory / MCP サーバーリスト / agents / tools 許可リスト / auth 状態を参照 / ミューテーションします。

**モード 2 における結果:** リモートクライアント UI がセッション設定をミラーリングしようとした場合、TUI のスラッシュコマンド実行後にドリフト（乖離）が発生する可能性があります。リモートクライアントは、**アタッチ / 再接続時に状態を再取得する**べきです（`model_switched` などのために `Last-Event-ID: 0` を使用してリングの最も古いイベントをリプレイします）。TUI 側のミューテーションに対してインクリメンタルイベントに依存すべきではありません。

#### なぜ (B) ではなく (A) なのか（ミューテーションを `session_state_changed` イベントファミリーに昇格させること）

(B) はより野心的な回答ですが、Stage 1.5 を、計画されているプロセス内リファクタリングもクリーンに通過しなければならない、大幅に大きなワイヤーサーフェスに固定してしまいます。私たちは、より小さなスコープを誠実に進めることを選びます。セッション状態イベントの分類作業 — どの TUI フローが設計上ローカル限定であり、将来のオプトイン (B) 形式の拡張でワイヤーに昇格する可能性があるかを列挙すること — は、Stage 1.5 のコードではなく [#3803](https://github.com/QwenLM/qwen-code/issues/3803) に移行します。

### N 個の並列セッションが 1 つの `qwen --acp` 子を共有

同じワークスペース上の複数のセッションは、エージェントのネイティブマルチセッションサポート（`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`）を介して、**1 つの `qwen --acp` 子プロセスを共有**します。ブリッジは各セッションに対して `connection.newSession({cwd, mcpServers})` を呼び出します。エージェントはそれらをセッションマップに保存し、呼び出しごとの sessionId をデマルチプレクスします。

同じワークスペースで N=5 セッションの場合の具体的なコスト:

| リソース                             | セッションあたり | N=5 の場合                       |
| ------------------------------------ | ----------- | ---------------------------- |
| デーモン Node プロセス                  | 1 つ         | **30–50 MB**（1 つのデーモン）    |
| `qwen --acp` 子プロセス                   | 共有      | **60–100 MB**（1 つの子プロセス）    |
| MCP サーバー子プロセス                  | セッションごと | 設定が異なる場合は 3×N        |
| `FileReadCache`（子プロセスヒープ内）      | 共有      | 1 回だけパース                  |
| `CLAUDE.md` / 階層メモリのパース | 共有      | 1 回だけパース                  |
| OAuth リフレッシュトークン状態            | 共有      | **1 つのリフレッシュパス**         |
| 自動メモリで学習したファクト            | 共有      | 子プロセスごとに 1 つのナレッジベース |
| コールドスタート                           | 初回のみ  | 最初のセッション以降は <200 ms  |

ブリッジは**デーモンごとに 1 つのチャネル**を維持します（§02 に従い、ワークスペースごとに 1 つのデーモン）。チャネルは、少なくとも 1 つのセッションが存続している限り維持されます。最後の `killSession`（またはチャネルレベルのクラッシュ）が子プロセスをキルします。

**MCP サーバー子プロセス**は、今日でもまだセッションごとに存在します。各セッションの設定で異なるサーバーを指定できるため、それらは独立してスポーンされます。Stage 1.5 のフォローアップ: `(workspace, config-hash)` によって MCP サーバー子プロセスを参照カウントし、同一の設定で共有できるようにします。この PR のスコープ外です。

**ピアエージェント（Cursor / Continue / Claude Code / OpenCode / Gemini CLI）はすべてシングルプロセスのマルチセッションを行います。** qwen-code はエージェント層でそれらに追従します。この PR の Stage 1 ブリッジは、同じアーキテクチャを HTTP 上で可視化します。

## リモートデーモンへのログイン（issue #4175 PR 21）

デーモンがリモートポッドで実行されている場合（あなたと共有ディスプレイがない場合）、クライアントは HTTP 経由で OAuth デバイスフローをトリガーできます。デーモン自身が IdP をポーリングします。あなたの仕事は、ブラウザを持つ任意のデバイスで URL を開くことだけです。

> [!note]
>
> Qwen OAuth の無料枠は 2026-04-15 に廃止されました。以下の `qwen-oauth`
> の例は、デバイスフロープロトコルの形状とレガシーなプロバイダー識別子を文書化したものです。
> 新しいセットアップでは、現在サポートされている認証プロバイダーを使用する必要があります。

```bash
# 1. フローを開始します。デーモンは IdP に連絡し、コード + URL を返します。
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

# 2. スマートフォン / ノートパソコンで URL にアクセスし、ユーザーコードを入力します。
# 3. 完了をポーリングします（または auth_device_flow_authorized イベントの SSE をサブスクライブします）。
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → ステータスの遷移: pending → authorized
```

TypeScript SDK は両方のステップを 1 つのヘルパーにラップしています。

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**デーモンはあなたの代わりにブラウザを開くことは決してありません。** ローカルで実行している場合でも、デーモンはパッシブなままです。URL を返し、SDK / ユーザーがどこで開くかを選択できるようにします。これは意図的なものです。ヘッドレスポッド上のデーモンが `xdg-open` を呼び出すと、実際の認証サーフェスを隠したままサイレントに失敗するからです。クライアントでは、`gh auth login` の「Press Enter to open browser」UX をミラーリングしてください。

**`--require-auth` と開発の利便性。** デバイスフロールートは厳格なミューテーションゲート（PR 15）を使用します。つまり、トークンなしのループバックデフォルトは `401 token_required` を返します。ローカルで開発中にこれを回避する最も簡単な方法は `qwen serve --token=dev-token` です。ループバックデフォルトを強化するのでない限り、`--require-auth` は必要ありません。

**デーモン間の制限。** `oauth_creds.json` はデーモン間で共有されます（`~/.qwen/oauth_creds.json`）。そのため、デーモン A でのログイン成功は、デーモン B の次回のトークンリフレッシュ時に自動的に取得されます。しかし、デーモン B の SDK クライアントは `auth_device_flow_authorized` イベントを受け取りません（イベントはデーモンごとです）。

**クライアント間のテイクオーバー。** 同じデーモン上の 2 つの SDK クライアントが同じプロバイダーに対して `POST /workspace/auth/device-flow` を実行すると、プロバイダーごとのシングルトンが取得されます。1 回目の呼び出しは新しい IdP リクエストを開始し、`attached: false` を返します。2 回目の呼び出しは、`attached: true` を持つ**既存の**実行中エントリを返します。テイクオーバーは監査証跡（2 番目のクライアントの `X-Qwen-Client-Id` の下）に記録されますが、個別のイベントは発行されません。ユーザーが IdP ページを終了すると、両方のクライアントが最終的に**同じ** `auth_device_flow_authorized` を観測します。UI で「自分が開始した」ものと「他の人のフローに参加した」ものを区別する場合は、`start()` によって返される `attached` フィールドで分岐してください。

## デーモンログファイル

`qwen serve` はプロセスごとの診断ログを以下に書き込みます。

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

同じディレクトリ内の `latest` シンボリックリンクは常に現在のプロセスのログを指しているため、`tail -f ~/.qwen/debug/daemon/latest` で実行中のデーモンをフォローできます。

ログはライフサイクルメッセージ、ルートエラー（`route=` および `sessionId=` コンテキスト付き）、ACP 子プロセスの stderr、および `QWEN_SERVE_DEBUG=1` が設定されている場合は追加のブリッジブレッドクラムをキャプチャします。現在 stderr に出力される行は引き続き stderr に出力されます。ファイルログは**追加**であり、置き換えではありません。

### 無効化

ファイルログを完全にスキップするには、`QWEN_DAEMON_LOG_FILE=0`（または `false`/`off`/`no`）を設定します。stderr 出力は影響を受けません。

### セッションデバッグログとの関係

セッションスコープのデバッグログ（`~/.qwen/debug/<sessionId>.txt` および `~/.qwen/debug/latest` シンボリックリンク）は独立しています。デーモンログは兄弟ディレクトリである `daemon/` サブディレクトリに存在します。セッションごとのデバッグセマンティクスは、この機能によって変更されません。

### ローテーションなし

デーモンログは無限に追記されます。大きくなった場合は手動でローテーションしてください。将来の拡張で自動ローテーションが追加される可能性があります。[#4548](https://github.com/QwenLM/qwen-code/issues/4548) のフォローアップで追跡してください。

## 実行時 MCP サーバー管理（issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)）

デーモンを再起動せずに、実行時に MCP サーバーを追加または削除します。実行時エントリは、同じ名前の設定定義サーバーを**シャドウ**する一時的なオーバーレイに存在します。基礎となる `settings.json` / `mcpServers` 設定が書き換えられることはありません。

**プレフライト:** どちらのルートを呼び出す前に、`caps.features` で `mcp_server_runtime_mutation` を確認してください。このタグがない古いデーモンは `404` を返します。

### `POST /workspace/mcp/servers` — 実行時 MCP サーバーの追加

厳格なゲート（Bearer トークンが必要）。ライブの `McpClientManager` 経由でサーバーに即座に接続し、そのツールを検出します。

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

`--mcp-budget-mode=warn` であり、サーバーを追加すると設定された `--mcp-client-budget` を超過する場合に返されます。サーバーは接続**されません**。呼び出し元は予算の逼迫をユーザーに提示する必要があります。

エラー:

| ステータス | コード                      | 条件                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | 名前が空、256 文字を超えている、または `[A-Za-z0-9_-]` 以外の文字が含まれている                      |
| `400`  | `missing_required_field`  | `config` が欠落している、または null 以外のオブジェクトではない                                                          |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id` ヘッダーが存在するが、このワークスペースに登録されていない                            |
| `400`  | `invalid_config`          | 設定の形状が MCP トランスポートバリデーターによって拒否された                                               |
| `401`  | `token_required`          | Bearer トークンが設定されていない（厳格なゲート）                                                           |
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

- `wasShadowingSettings: true` — 削除された実行時エントリは、同じ名前の設定定義サーバーをシャドウしていました。その設定エントリはシャドウが解除され、次回の検出/再起動時に使用されます。

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
| `401`  | `token_required`          | Bearer トークンが設定されていない（厳格なゲート）                                      |
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
スキップされたレスポンス（`budget_warning_only`、`not_present`）はイベントを発行**しません**。

既存の `mcp_guardrail_events` サーフェス（`mcp_budget_warning`、`mcp_child_refused_batch`）からの予算関連イベントも、実行時の追加が予算しきい値を超えた際に発生します。

## 次のステップ

- **長時間実行するデーモンのセットアップ？** v0.16-alpha（ローカルのみ）向けの [ローカル起動テンプレート（systemd / launchd / nohup / tmux）](./qwen-serve-deploy-local.md)。
- **クライアントの構築？** [DaemonClient TypeScript クイックスタート](../developers/examples/daemon-client-quickstart.md) および [HTTP プロトコルリファレンス](../developers/qwen-serve-protocol.md) を参照してください。
- **ソースコードの確認？** ブリッジコードは `packages/cli/src/serve/` に、SDK クライアントは `packages/sdk-typescript/src/daemon/` にあります。
- **ロードマップの追跡？** ステージ 1.5 / ステージ 2 の進捗は、issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) で管理されています。