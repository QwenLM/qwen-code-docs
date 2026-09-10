# REST API 統合ガイド

Qwen Code を HTTP 経由で自社プロダクトに組み込むチーム向け: `qwen serve` をバックエンドとして実行し、独自のフロントエンドから制御します。

このページがエントリーポイントです。完全なルート��ファレンスは
[`qwen-serve-protocol.md`](./qwen-serve-protocol.md)、内部構造は
[デーモン詳細](./daemon/00-index.md)、実行可能な TypeScript のウォークスルーは
[`examples/daemon-client-quickstart.md`](./examples/daemon-client-quickstart.md) です。

## 利用可能なパス

デーモン上に構築する方法は 6 通りあり、**フロントエンドのどこまでを自社で所有するか** という 1 つの質問で分かれます。

| パス                                 | 所有範囲                           | ステータス                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| デーモン + 同梱 Web Shell           | なし — 出荷時のまま使用       | 現在出荷中 ([ユーザーガイド](../users/qwen-serve.md))                                                                                                                                                                             |
| デーモン `--no-web` + 独自の UI      | フロントエンド全体              | 現在出荷中 — **このページ**                                                                                                                                                                                                    |
| デーモン + ブランド付き Web Shell           | ブランディング、コードは含まず                | 未実装 ([#11357](https://github.com/QwenLM/qwen-code/issues/11357))                                                                                                                                                         |
| デーモン + 自己ホスト Web Shell ビルド | フロントエンドビル               | 未実装 ([#11358](https://github.com/QwenLM/qwen-code/issues/11358))                                                                                                                                                         |
| SDK `DaemonClient` 経由のデーモン        | クライアントコード、生 HTTP は使用しない       | 現在出荷中 ([TS](./sdk-typescript.md)、[Java](./sdk-java.md)) — [Python SDK](./sdk-python.md) はプロセストランスポートのみでデーモンクライアントを持たないため、Python 統合はパス 2 を生 HTTP で駆動します                     |
| MCP ブリッジ経由のデーモン                | なし — 別のエージェントが駆動 | `@qwen-code/sdk` に `qwen-serve-mcp` として出荷 — [ブリッジ README](../../packages/sdk-typescript/src/daemon-mcp/serve-bridge/README.md)を参照。`QWEN_BRIDGE_ALLOW_GLOBAL_SCOPE` でグローバルスコープの書き込み変更を任意に許可可能 |

ヘッドレス `qwen -p` とエディタ向け stdio 経由の ACP は別の統合
パスです。チャネルと拡張機能もデーモン経由で実行できます。
[チャネルガイド](../users/features/channels/overview.md) と
[拡張機能リファレンス](./qwen-serve-protocol.md#extension-management-v2-wire-contract)を参照してください。

## 設計前に知っておくべき 2 つのこと

**デーモンはプロセス内で推論を実行しません。** `qwen --acp` 子
プロセスを生成し、それらと HTTP の間で仲介を行います。CLI エントリースクリプトを
同じ Node バイナリで実行し、`QWEN_CLI_ENTRY` または `process.argv[1]` を使用します。
Node バックエンドに埋め込む場合は、`QWEN_CLI_ENTRY` をインストール済みの Qwen CLI
エントリースクリプトに向ける必要があります。`PATH` 上の `qwen` 検索は行いません。エントリポイントが見つからない場合は
`MissingCliEntryError` として表面化します。

定常状態では、**アクティブなワークスペースランタイムごとに 1 つの子プロセス**があり、セッションごとではありません。ワークスペース内の全セッションがその子プロセスに多重化され、
プロセス、OAuth 状態、ファイルキャッシュ、階層メモリ解析を共有します。したがって障害ドメインは
ワークスペースです。子プロセスが終了すると、それに多重化されている全セッションが同時に
破棄されます。コンテナのサイジングは、デーモン + 登録済みワークスペースごとに 1 つの子プロセスに加え、チャネルスワップ時のランタイムごとに 1 つの追加子プロセス分の余裕を持たせてください。
セッションを独立して失敗させる必要がある場合は、個別のデーモンを実行してください —
`--max-sessions` は同時実行数を制限するものであり、影響範囲を制限するものではありません。

**認証は単一オペレーターです。** ランタイムベアラートークンは
ベアラートークンで保護された API 全体に権限を付与し、信頼されたループバック呼び出し元は
デーモンユーザーとしてのコード実行を含む完全な権限を持ちます。エンドユーザーごとのプリンシパル
モデルは存在しません。これを
マルチユーザープロダクトの背後に配置する場合、バックエンドがユーザー ID を所有し、デーモントークンをブラウザに
渡してはなりません。コンテナ化およびマルチテナントデプロイメントは
明示的に延期されています — [ユーザーガイド](../users/qwen-serve.md)の「v0.16-alpha の既知の制限」を
参照してください。

設定済みのチャネル Webhook インゲスト (`POST /channels/:channelName/webhooks/:source`)
はベアラ認証の前に独自の `x-qwen-webhook-secret` 認証を
使用します。チャネル Webhook ソースが設定されるまでは機能しません。

## デーモンの起動

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"

qwen serve --no-web --require-auth \
  --hostname 0.0.0.0 --port 4170 \
  --workspace /srv/project
```

`--no-web` は以下にリストされたルートを保持しますが、Web Shell アセットと
依存するサーフェスを無効にします。macOS では `/live/*` ルートと `/live/host` ソケット、および
全プラットフォームで `GET /mcp-app-sandbox` です。トークンは `--token` ではなく環境変数で
渡してください。`--token` は `/proc/<pid>/cmdline` を通じてローカルユーザーから読み取り可能です。

以下の Bash 例では、シェルの `printf` ビルトインを使用してファイルディスクリプタ経由で
Authorization ヘッダーを渡し、トークンを curl の引数から除外しています。

## 統合で実際に使用するルート

デーモンが登録するものの大部分は Web Shell の駆動用です — git
操作、拡張機能のインストール、ワークスペースの信頼、音声、スケジュールタスク — そして
その UI と共に変更されます。以下のサブセットは 1 桁小さい規模です。

これらが REST 統合に必要なルートです。残りは内部用として扱ってください。

### ディスカバリー

| ルート                                                            | 目的                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | Liveness プローブ                                                               |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | プリフライト — 他の何よりも先に `workspaceCwd` と `policy.permission` を読み取ります |

### セッションライフサイクル

| ルート                                                                                                                                | 目的                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                                                                             | 作成。独立した会話には `sessionScope: "thread"` を送信します |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                                                                   | 閉じる。永続化されたセッションは保持され、再読み込み可能です             |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload) · [`/resume`](./qwen-serve-protocol.md#post-sessionidresume) | 永続化されたセッションを復元                                           |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat)                                                    | アイドルリーパーを延期                                                 |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata)                                                    | セッションメタデータ                                                   |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)                                                            | バインドされたサービス内でモデルを切り替え                                 |
| `GET /session/:id/status`                                                                                                            | ランタイムステータス — _専用リファレンスセクションはまだありません_                 |

### プロンプトとストリーミング

| ルート                                                                             | 目的                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)       | 送信。完了ではなく**受け入れ**時に `202` を返します |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)       | アクティブなプロンプトのみをキャンセル                          |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)     | SSE ストリーム。プロンプト送信**前**にサブスクライブ             |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript) | 会話履歴                                   |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)       | コンテキストウィンドウの使用状況                                   |
| `GET /session/:id/export` · `GET /session/:id/pending-prompts`                    | _専用リファレンスセクションはまだありません_                  |

### 権限

| ルート                                                                              | 目的                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/permission/:requestId`                                          | `permission_request` に応答します。セッションを所有するランタイムにルーティングされるため、どのワークスペース状態でも正しく動作します — _専用セクションはまだありません_                                                                                                                                          |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid) | プロセスグローバル形式。**プライマリ**ワークスペースのブリッジにのみ接続されるため、別の登録済みランタイムが所有するセッションでは `404` を返し、デフォルトの `first-responder-wins` ポリシーによる投票喪失と同じボディを返します — ここでの `404` はリクエストがすでに応答済みであったことを必ずしも意味しません |

### 読み取り専用ワークスペースコンテキスト

| ルート                                                                                                      | 目的                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GET /file`](./qwen-serve-protocol.md#get-file) · [`/file/bytes`](./qwen-serve-protocol.md#get-filebytes) | ファイルまたはバイト範囲を読み取り                                                                     |
| `GET /stat` · `GET /list` · `GET /glob`                                                                    | パスメタデータ、ディレクトリリスト、グロブ — _専用セクションはまだありません_                                                                                             |
| `GET /workspace/tools`                                                                                     | ライブ ACP 子プロセスが報告するツール。子プロセスがない場合、レスポンスは `acpChannelLive: false`、`tools: []`、`not_started` エラーを含みます — _専用セクションはまだありません_ |

> **リファレンスカバレッジ。** 上記 25 ルートのうち 17 に専用セクションがあります。
> それ以外とマークされた 8 ルートのうち、一部は言及のみで、3 つは
> 完全に欠落しています: `GET /session/:id/pending-prompts`、
> `POST /session/:id/permission/:requestId`、`GET /workspace/tools`。
> このギャップの解消は
> [#11359](https://github.com/QwenLM/qwen-code/issues/11359) で追跡されています。

## 最小フロー

**1. プリフライト。** `workspaceCwd`（作成時に `cwd` を省略できるように）と
`policy.permission`（権限リクエストに誰が応答できるかを確認するために）を読み取ります。

```bash
curl -sH @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") http://daemon:4170/capabilities
```

**2. セッションを作成。** 呼び出し元が 1 つの会話を共有する意図でない限り、`sessionScope: "thread"` を使用します — デフォルトの `"single"` は同じワークスペースでの 2 回目の作成で既存のセッションを**再利用**し、無関係な呼び出し元を 1 つのキューで直列化します。

```bash
curl -sX POST http://daemon:4170/session \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"sessionScope":"thread"}'
# → {"sessionId":"…","workspaceCwd":"/srv/project","attached":false}
```

**3. プロンプト前にサブスクライブ。** `Last-Event-ID: 0` は最古の
保持イベントからリプレイし、作成とサブスクライブの間に発生したイベントをキャッチする方法です — 特に `model_switch_failed`。**アタッチ**（デフォルトの `sessionScope: "single"` で既存セッションを再利用）の場合、このイベントが悪意のある `modelServiceId` が拒否された唯一のシグナルです。なぜなら、障害は意図的に HTTP エラーとして伝播されないからです。**新規作成**で `modelServiceId` を含む場合（ステップ 2 のボディには含まない）は、`200` のボディにも `modelApplied` が含まれ、スイッチが拒否された場合は `false` になります。これが有界リング上のイベントよりも優先して対応すべき決定的なシグナルです。`modelServiceId` なしでの作成には `modelApplied` キー自体が存在しません。

```bash
curl -N http://daemon:4170/session/$SID/events \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") \
  -H 'Accept: text/event-stream' -H 'Last-Event-ID: 0'
```

各 `data:` 行は 1 行の完全なエンベロープです。エンベロープの `type` は
`event:` 行と一致します。

リプレイは `--event-ring-size` とサブスクリプションごとの固定 8 MiB バイト
予算によって制限されます。ストリームが `state_resync_required` を
`reason: "replay_budget_exceeded"` で発行した場合、リプレイが完了したものとして扱うのではなく、`POST /session/:id/load` を介して回復してください。

**4. プロンプト。** `202` は受け入れを意味し、完了ではありません。ストリーム上の `turn_complete` /
`turn_error` を `promptId` で相関付けます。`turn_complete` の `stopReason` を読み取ります。
`turn_error` では `message` と任意の `code` / `errorKind` を読み取ります —
[`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt) を参照。

```bash
curl -sX POST http://daemon:4170/session/$SID/prompt \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → 202 {"promptId":"…","lastEventId":42}
```

**5. 権限リクエストに応答。** エージェントがツールを実行したいかつ**承認モードが確認を要求する場合**、`permission_request` を発行し、誰かが応答するかキャンセルするまでターンがブロックされます — **デフォルトではタイムアウトはありません**
（`--permission-response-timeout-ms` のデフォルトは `0` = 無期限に待機）、そのため
応答されないリクエストはセッションのプロンプトキューのスロットを保持し続けます。キャンセルまたはセッションを閉じるまでです。フローに期限が必要な場合は独自に設定してください。

モードは子プロセス自体の Qwen 設定 `tools.approvalMode` であり、
デーモンホストと `--workspace` ディレクトリの設定から解決されます。デーモンは
生成時に何もピン留めしません。デフォルトは `auto` で、特定のクラスのツール呼び出しを
確認なしに承認します — これらは `permission_request` を全く発行しません — が、
それ以外については引き続き確認を求めます。信頼されていないワークスペースフォルダは `default`（確認）に強制ダウングレードされます。これが、あるデプロイメントではこれらのイベントが表示され、別のデプロイメントでは表示されない理由です。また、`GET /capabilities` は承認モードではなく投票仲介ポリシーを報告するため、プリフライトでは現在の体制を把握できません。統合が承認ゲーティングに依存する場合は、`tools.approvalMode` を明示的にピン留めし、どのように応答するかを事前に決定してください。自動承認は誰も選択していなくてもすでに有効になっている可能性があります。

セッションスコープのルートで応答してください。セッションを所有するランタイムにルーティングされるため、ワークスペースの設定に関係なく機能します。

```bash
curl -sX POST http://daemon:4170/session/$SID/permission/$REQUEST_ID \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"outcome":{"outcome":"selected","optionId":"proceed_once"}}'
```

**6. 閉じる。** `DELETE /session/$SID` → `204`。ディスク上のセッションは保持されます。

## 運用

| 項目          | 参照先                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同時実行数上限 | `--max-sessions`、`--max-total-sessions`。上限超過の作成は `Retry-After` 付きの `503` を返します                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| レート制限    | `--rate-limit` とクラスごとの `--rate-limit-*` フラグ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| アイドルクリーンアップ     | `--session-idle-timeout-ms`。`POST /session/:id/heartbeat` で alive を保持                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| メモリ           | `--child-heap-mode` は監視のみ。`--memory-budget-mb` は `POST /session/:id/load` のアダプティブライブジャーナル成長プールを制御します。SSE リプレイ用ではありません。`--max-journal-bytes` または `--max-journal-events` のいずれかをピン留めすると成長が無効になります。どちらのフラグも子プロセスのサイジングや生成拒否、実際のヒープ上限（`--max-old-space-size`、ホストメモリから派生）を制御しません。予算計算については[設定](./daemon/17-configuration.md)を参照。SSE リプレイは `--event-ring-size` とサブスクリプションごとの固定 8 MiB 予算で別途制限されます。末尾が欠落すると `state_resync_required` が `reason: "replay_budget_exceeded"` で発行されます |
| プロンプトデッドライン | `--prompt-deadline-ms`。期限超過時に `turn_error` を発行                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| エラー           | [エラー分類](./daemon/18-error-taxonomy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 可観測性    | [可観測性](./daemon/19-observability.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 全フラグリスト   | [設定](./daemon/17-configuration.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |