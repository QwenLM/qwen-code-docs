# Daemon ACP-over-HTTP → 公式 ACP Streamable HTTP トランスポート

> 対象: `daemon_mode_b_main`。ブランチ: `feat/daemon-acp-http-streamable`。
> 著者: arnoo.gao。日付: 2026-05-24。ステータス: **Design v1 → 実装**。
> リポジトリのワークフローに従うデザインファースト: このドキュメントは実装 PR の前または同時にマージされ、ワイヤー契約をレビュー可能にします。

---

## 0. TL;DR

デーモン（`qwen serve`）は現在、Web/SDK クライアントに対して**独自 REST + SSE** 方言を使用し、スポーンした `qwen --acp` 子プロセスに対しては**本物の ACP JSON-RPC over stdio** を使用しています。このプロポーザルでは、単一の `/acp` エンドポイントで**公式 ACP Streamable HTTP トランスポート**（RFD #721）を実装する**2 番目の northbound トランスポート**を追加します。これにより、ACP ネイティブクライアント（Zed、Goose、将来の SDK）が標準プロトコルを通じてデーモンを直接駆動できるようになります。qwen 固有の REST の知識は不要です。

**決定: デュアルトランスポート（アディティブ）。** 新しい `/acp` エンドポイントは既存の REST サーフェスと並んでマウントされ、下層の同じ `HttpAcpBridge` + `EventBus` を再利用します。REST API は_削除されません_。理由は §6 を参照してください。

**決定: 拡張ネームスペース = `_qwen/…`**（シングルアンダースコアプレフィックス、ACP 仕様で予約されたカスタムメソッド形式）は、標準 ACP メソッドが存在しないデーモン機能（モデル切り替え、ワークスペース内省、ハートビート、マルチクライアントパーミッションポリシー、SSE バックプレッシャーチューニング）に使用します。理由は §5 を参照してください。

完全なローカル実行可能なリファレンス実装がこの PR に含まれています
（`packages/cli/src/serve/acp-http/`）および検証ハーネス
（`scripts/acp-http-smoke.mjs`）。

---

## 1. 背景 — 現在の「ACP over HTTP」の意味

3 層構造（コミット `0c0430939` で確認済み）:

```
┌──────────────┐  bespoke REST + SSE (HTTP/1.1)   ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ web / SDK    │ ───────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ client       │ ◄─── GET /session/:id/events ──── │  serve     │ ◄─────────────► │ child (Agent)│
│ (ACP client) │       (text/event-stream)        │  (daemon)  │  ndJsonStream   │              │
└──────────────┘                                   └────────────┘                 └──────────────┘
        northbound: NOT ACP wire                       bridge          southbound: real ACP
```

### 1.1 Northbound（クライアント ↔ デーモン）— 独自実装（現在）

- Express 5 アプリ（`packages/cli/src/serve/server.ts`、約 30 ルート）。
- 離散的な REST 動詞、**JSON-RPC ではない**:
  - `POST /session`（作成）、`POST /session/:id/prompt`、`POST /session/:id/cancel`、
    `POST /session/:id/load|resume`、`POST /session/:id/model`、
    `POST /session/:id/permission/:requestId`、`POST /session/:id/heartbeat`、
    `DELETE /session/:id`、および `/workspace/*`、`/capabilities`、`/health`。
- サーバー→クライアントストリーミング: `GET /session/:id/events` → `text/event-stream`。
  - フレーム: `id: <n>\nevent: <type>\ndata: <json>\n\n`（`server.ts:formatSseFrame`、~2626）。
  - セッションごとの**単調増加する `id`** + リングバッファ `EventBus`（`acp-bridge/src/eventBus.ts`）でバックアップされた `Last-Event-ID` 再開。
  - イベント `type`: `session_update`、`client_evicted`、`slow_client_warning`、
    `state_resync_required`、`stream_error`、…
- 認証: `Authorization: Bearer <token>`（`serve/auth.ts`）、CORS 拒否 + ホスト許可リスト。
- バックプレッシャー: 接続ごとのシリアライズされた書き込みチェーン + 15 秒ハートビートコメント。

### 1.2 Southbound（デーモン ↔ 子プロセス）— すでに ACP

- `acp-bridge/src/spawnChannel.ts` が `qwen --acp` をスポーンし、stdin/stdout を
  `@agentclientprotocol/sdk`（`^0.14.1`）の `ndJsonStream` でラップ。
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)`
  — デーモンは ACP **クライアント**、子プロセスは ACP **エージェント**。
- このレグでは拡張メソッドがすでに使用中: `unstable_setSessionModel`、
  `unstable_resumeSession`、`unstable_listSessions`（`acp-integration/acpAgent.ts`）。

### 1.3 Northbound を移行する理由

- すべてのクライアント（webui、TS SDK、Java SDK、Python SDK、VSCode コンパニオン）が
  独自 REST マッピングを再実装しています。ACP 標準エンドポイントにより、ACP ネイティブエディタが
  qwen 固有のグルーなしで接続できます。
- デーモンのリモートサーフェスを、内部ですでに使用しているプロトコルと整合させます。

---

## 2. ターゲット: ACP Streamable HTTP（RFD #721）

マージされた**ドラフト** RFD（`agentclientprotocol/agent-client-protocol#721`、2026-04-22 マージ）。
まだ規範的ではなく、どの SDK にも含まれていません。RFD ワイヤー設計に従って実装します。

### 2.1 エンドポイントと動詞（単一の `/acp`）

| 動詞          | 動作                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`   | JSON-RPC を送信。`initialize` → **`200`** + JSON ボディ（ケーパビリティ）および `Acp-Connection-Id` を設定。他のすべてのリクエスト/通知 → **`202 Accepted`**、空ボディ。_レスポンス_（ある場合）は対応する長期 SSE ストリームで配信される。 |
| `GET /acp`    | 長期 **SSE** ストリームを開く。（`Upgrade: websocket` → WebSocket、**延期**、§7 参照。）                                                                                                                                                     |
| `DELETE /acp` | 接続を終了 → `202`。                                                                                                                                                                                                                               |

### 2.2 2 層の長期ストリーム

- **接続スコープストリーム**: ヘッダー `Acp-Connection-Id` 付きの `GET /acp`、セッションヘッダーなし。
  接続レベルのレスポンス（`session/new`、`session/load`、`authenticate`）と接続レベルの通知を運ぶ。
- **セッションスコープストリーム**: `Acp-Connection-Id` **と** `Acp-Session-Id` 付きの `GET /acp`。
  `session/update` 通知、**エージェント→クライアントリクエスト**
  （`session/request_permission`、`fs/read_text_file`、…）、およびセッション POST
  （`session/prompt`、`session/cancel`）へのレスポンスを運ぶ。

### 2.3 アイデンティティ（3 層）

- `Acp-Connection-Id`（HTTP ヘッダー）— トランスポートバインディング、`initialize` 時に生成。
- `Acp-Session-Id`（HTTP ヘッダー）— セッションスコープ GET + セッション POST に必須。
- `sessionId`（JSON-RPC パラム）— メソッドパラム内（ヘッダーと一致する必要がある）。

### 2.4 MCP StreamableHTTP との相違点

ACP は**長期**ストリーム（リクエストごとの SSE ではない）、**2 つの** ID ヘッダー（接続
対セッション）、initialize 以外には `202`、HTTP/2 必須、WebSocket 必須クライアントを使用。
単一エンドポイント + POST/GET-SSE + セッションヘッダーのスケルトンを借用しつつ、
長期デュアル ID モデルに適応します。`@modelcontextprotocol/sdk` の
`StreamableHTTPServerTransport` は再利用**しません**（リクエストごとのストリームモデルと
単一の `Mcp-Session-Id` は適合しない）。

### 2.5 標準メソッド（現在のスキーマから確認）

- クライアント→エージェントリクエスト: `initialize`、`authenticate`、`session/new`、`session/load`、
  `session/prompt`、`session/resume`、`session/close`、`session/list`、
  `session/set_mode`、`session/set_config_option`、`logout`。
- クライアント→エージェント通知: `session/cancel`。
- エージェント→クライアントリクエスト: `fs/read_text_file`、`fs/write_text_file`、
  `session/request_permission`、`terminal/create|output|wait_for_exit|kill|release`。
- エージェント→クライアント通知: `session/update`。

---

## 3. 新しいトランスポートのアーキテクチャ

デーモンは northbound で **ACP エージェントサーフェスを HTTP 経由で**公開しつつ、
southbound では子プロセスへの ACP **クライアント**であり続ける必要があります。
`/acp` レイヤーは HTTP トランスポートを終端し、既存の `HttpAcpBridge` にブリッジする
**JSON-RPC ルーター**です。

```
            POST /acp (JSON-RPC requests/responses/notifs)
client  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(editor)                                                  │  AcpHttpTransport         │
        ◄── GET /acp  (connection-scoped SSE) ──────────  │  - connection registry    │
        ◄── GET /acp  (session-scoped SSE) ─────────────  │  - JSON-RPC id correlation│
                                                          │  - method dispatch        │
                                                          └────────────┬──────────────┘
                                                                       │ reuses
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (unchanged)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (unchanged)
                                                                 qwen --acp child
```

### 3.1 新しいモジュールレイアウト（`packages/cli/src/serve/acp-http/`）

| ファイル                     | 責務                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | `mountAcpHttp(app, bridge, opts)` — 既存の Express アプリに `/acp` ルートを登録する。                                                                                                    |
| `connection-registry.ts` | `Acp-Connection-Id` → `AcpConnection`（接続 SSE ライター、`Map<sessionId, SessionStream>`、JSON-RPC id によるペンディングのエージェント→クライアントリクエスト、単調 id アロケーター）。TTL + DELETE クリーンアップ。 |
| `json-rpc.ts`            | JSON-RPC 2.0 パース/バリデート/シリアライズヘルパー；エラーコード（`-32600` 等）；`_qwen/` ネームスペースガード。                                                                                                                                       |
| `dispatch.ts`            | インバウンド JSON-RPC メソッド → `HttpAcpBridge` 呼び出しのマッピング。`BridgeEvent` → アウトバウンド JSON-RPC フレームのマッピング。翻訳テーブル（§4）。                                                          |
| `sse-stream.ts`          | 長期 SSE ライター（`server.ts` のバックプレッシャー/ハートビートパターンを再利用）。REST `/events` とは異なる（フレーミングが異なる: qwen イベントエンベロープではなく、完全な JSON-RPC オブジェクト）。      |

`bridge.ts` / `eventBus.ts` への変更なし（アディティブコンシューマーのみ）。

### 3.2 接続とセッションのライフサイクル

1. `POST /acp {initialize}` → `connectionId` を生成、`AcpConnection` を作成、`{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + `Acp-Connection-Id` ヘッダーで `200` を返す。
2. クライアントが `Acp-Connection-Id` を持つ `GET /acp`（接続スコープ）を開く。
3. `POST /acp {session/new}` → `202`；デーモンが `bridge.createSession(...)` を呼び出し；
   JSON-RPC レスポンス（`sessionId` 含む）を**接続**ストリームにプッシュ。
4. クライアントが `Acp-Connection-Id`+`Acp-Session-Id` を持つ `GET /acp`（セッションスコープ）を開く；
   デーモンが `bridge.subscribeEvents(sessionId)` して翻訳済みフレームをパイプ。
5. `POST /acp {session/prompt}` → `202`；`bridge.sendPrompt(...)`；`session/update`
   通知がセッションストリームでライブストリーム；最終プロンプト**レスポンス**
   （`{id, result:{stopReason}}`）は確定した時にセッションストリームにプッシュされる。
6. エージェント→クライアントリクエスト（例: `session/request_permission`）がデーモン割り当て id を持つ
   JSON-RPC **リクエスト**としてセッションストリームで送信され；クライアントが
   `POST /acp {id, result}` で回答；`dispatch` がブリッジのパーミッション API を通じて解決する。
7. `DELETE /acp`（または接続ストリームのクローズ + TTL）がセッション/サブスクリプションを
   破棄する。

---

## 4. 翻訳テーブル（bridge ⇄ ACP/HTTP）

### 4.1 インバウンド（クライアント POST → bridge）

| ACP メソッド                                  | Bridge 呼び出し                                           | レスポンスのルーティング先                     |
| ------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ----------------- |
| `initialize`                                | （なし；ケーパビリティは `capabilities.ts` から）           | インライン `200`                           |
| `authenticate`                              | 既存の認証プロバイダー（`serve/auth/*`）               | 接続ストリーム                      |
| `session/new`                               | `bridge.createSession`                                | 接続ストリーム                      |
| `session/load` / `session/resume`           | `bridge.restoreSession('load'                         | 'resume')`                             | 接続ストリーム |
| `session/prompt`                            | `bridge.sendPrompt`                                   | セッションストリーム（確定まで延期） |
| `session/cancel`（通知）                    | `bridge.cancel`                                       | —                                      |
| `session/list`                              | `bridge.listSessions`（`unstable_listSessions`）       | 接続ストリーム                      |
| `session/set_mode`                          | 承認モードルートロジック                             | セッションストリーム                         |
| JSON-RPC **レスポンス**（エージェント→クライアントリクエストへ） | ペンディング解決（§4.3）                              | —                                      |
| `_qwen/session/set_model`                   | `bridge.setSessionModel`（`unstable_setSessionModel`） | セッションストリーム                         |
| `_qwen/workspace/list` 等                 | ワークスペース内省ルート                        | 接続ストリーム                      |
| `_qwen/session/heartbeat`                   | `bridge.heartbeat`                                    | 接続ストリーム                      |

### 4.2 アウトバウンド（BridgeEvent → セッションストリームの JSON-RPC）

| BridgeEvent.type                                                   | 送信形式                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `session_update`                                                   | `{method:"session/update", params:<data>}` 通知             |
| パーミッションリクエスト                                                 | `{id:<n>, method:"session/request_permission", params}` リクエスト     |
| `client_evicted` / `slow_client_warning` / `state_resync_required` | `{method:"_qwen/notify", params:{kind,…}}` 通知             |
| `stream_error`                                                     | アクティブなプロンプト id での JSON-RPC エラーレスポンス（または `_qwen/notify`） |
| プロンプト確定                                                      | `{id:<promptId>, result:{stopReason}}`                              |

### 4.3 ペンディングのエージェント→クライアントリクエスト

`AcpConnection` は `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>` を保持。
クライアントが JSON-RPC レスポンスオブジェクトを POST すると、`dispatch` が `id` をマッチし、
ブリッジの解決パス（例: パーミッション `POST /session/:id/permission/:requestId` の内部相当）を呼び出す。

> **v1 ステータス:** `session/request_permission` エージェント→クライアントのラウンドトリップのみ
> 実装済み。`fs/*` と `terminal/*` エージェント→クライアント転送は**延期**（§7）—
> デーモンは `/acp` での `fs`/`terminal` クライアントケーパビリティネゴシエーションをまだアドバタイズしないため、
> ACP クライアントは v1 のこのトランスポートでファイルシステム/ターミナルセマンティクスを
> 想定すべきではありません。意図するエンドステート（`fs/*` をクライアントに転送；クライアントに
> `fs` ケーパビリティがない場合はデーモンのワークスペース FS にフォールバック）は §7 で説明する
> フォローアップです。

---

## 5. 拡張戦略（要件 #2）

ACP は `_` で始まるメソッドをカスタム拡張用に予約し、すべての型で `_meta` を提供しています。
コードベースの southbound レグはすでに `unstable_*` メソッド名を使用しています。

**Northbound の選択:** ベンダーネームスペース化された **`_qwen/<area>/<verb>`** メソッド名
（仕様準拠の `_` プレフィックス）。クライアントが使用前にフィーチャー検出できるよう、
`initialize` 時に `agentCapabilities._meta.qwen` でケーパビリティをアドバタイズ。

| 必要性                                                  | 標準 ACP メソッドが存在しない? | 拡張                                               |
| ----------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| モデル切り替え                                          | はい                     | `_qwen/session/set_model`                               |
| ワークスペース MCP/スキル/プロバイダー/環境内省      | はい                     | `_qwen/workspace/list`、`_qwen/workspace/<area>`        |
| ハートビート / 最終確認時刻                                 | はい                     | `_qwen/session/heartbeat`                               |
| マルチクライアントパーミッションポリシー（コンセンサス/指定） | 部分的                 | `session/request_permission` + `_meta.qwen.policy`      |
| SSE バックプレッシャーチューニング（`maxQueued`）                 | はい                     | セッション GET の `Acp-Qwen-Max-Queued` ヘッダー             |
| 再開カーソル（リング `Last-Event-ID`）                  | RFD フェーズ 4             | `Last-Event-ID` ヘッダー + フレームの `_meta.qwen.eventId` |

標準メソッドは**決して**リネームされない；拡張は厳密にアディティブで無視可能。

---

## 6. デュアルトランスポート対置き換え（要件 #4）

**決定: デュアルトランスポート（アディティブ）。**

- 公式トランスポートは**ドラフト** RFD であり、規範的ではなく、どの SDK にも存在しない —
  ハード置き換えは未批准の設計に結合し、webui + 3 SDK + VSCode コンパニオンを一度に壊す。
- REST サーフェスには、まだ ACP への明確なマッピングがない機能が含まれている（ワークスペース
  内省、マルチクライアントパーミッション調停、リングバッファ再開、ケーパビリティレジストリ）。
  これらは `/acp` で `_qwen/*` 拡張に格下げされるが、RFD が批准されるまで REST サーフェスが
  権威的なままとなる。
- 両トランスポートは**1 つの** `HttpAcpBridge` + `EventBus` インスタンスを共有するため、
  状態の重複がない — `/acp` と `/session/*` は同じライブセッションを同時に駆動できる
  （マルチクライアントはブリッジですでにサポートされている）。
- トグル（v1、出荷済み）: デフォルトでオン；**`QWEN_SERVE_ACP_HTTP=0`** でマウントを無効化。
  `--no-acp-http` CLI フラグとクライアントのフィーチャー検出用の `/capabilities` の `acp_http` タグは
  フォローアップに**延期**（v1 には含まれない）— それまでクライアントは `POST /acp {initialize}`` を
  プロービングしてトランスポートを検出する。

移行パス: RFD が批准され SDK が出荷されたら、REST ルートを `/acp` 上の薄い互換シムとして
再フレーム化できる（別の、後の PR）。

---

## 7. 実装 PR のスコープ

**スコープ内（ローカルで実行可能・検証済み）:**

- `initialize`、`session/new`、`session/prompt`、
  `session/cancel`、`session/load`、JSON-RPC レスポンスハンドリングの `POST /acp` ディスパッチ。
- JSON-RPC フレーミングを持つ接続スコープ + セッションスコープの `GET /acp` SSE ストリーム。
- `session/update` ストリーミング + 最終プロンプトレスポンスの相関。
- `session/request_permission` エージェント→クライアントラウンドトリップ。
- 要件 #2 の実例としての `_qwen/session/set_model` 拡張。
- Bearer 認証 + ホスト許可リストの再利用（REST と同じミドルウェア）。
- ユニットテスト（`acp-http/*.test.ts`）+ 実際のデーモンを駆動するブラックボックスのスモークスクリプト。

**延期（文書化済み、現時点では構築しない）:**

- WebSocket アップグレードパス（RFD 必須クライアントケーパビリティ；SSE はローカル検証に十分）。
- HTTP/2 多重化（HTTP/1.1 で実行；POST と長期 GET は別々のソケットを使用、
  CLI/Node クライアントおよびブラウザの ≤6 接続に対応）。文書化された相違点。
- 完全な `fs/*` + `terminal/*` エージェント→クライアント転送（パーミッションパスがメカニズムを証明；
  残りは機械的なフォローアップ）。
- リングバッファとの SSE 再開可能性ハードニングパリティ（RFD のフェーズ 4）。

---

## 8. ローカル検証計画

1. `npm run build`（または `cli` + `acp-bridge` のワークスペースビルド）。
2. デーモンを起動: `qwen serve --listen 127.0.0.1:0 --token <t>`（または環境変数トークン）。
3. `node scripts/acp-http-smoke.mjs` を実行:
   - `POST /acp {initialize}` → `200` + `Acp-Connection-Id` をアサート。
   - 接続 SSE を開く；`POST {session/new}` → ストリームでのレスポンスをアサート。
   - セッション SSE を開く；`POST {session/prompt:"say hi"}` → ≥1 個の `session/update`
     その後最終 `{result:{stopReason}}` をアサート。
   - パーミッションが必要なツールをトリガー → `session/request_permission` リクエストをアサート、
     許可レスポンスを POST → プロンプト完了をアサート。
   - `POST {_qwen/session/set_model}` → モデル切り替え + `session/update` をアサート。
4. Vitest: `acp-http/*.test.ts` グリーン。

---

## 9. リスク

| リスク                                 | 軽減策                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------- |
| 批准前の RFD 変更      | ケーパビリティタグ + `_qwen` ネームスペースの背後；独立したモジュール；修正が容易。 |
| HTTP/1.1 対必須 HTTP/2          | ローカルホスト/CLI クライアントに影響なし；文書化済み；h2 は後のトランスポートスワップ。 |
| 1 つのブリッジ上の 2 つのトランスポートの競合    | ブリッジはすでにマルチクライアントをサポート；そのロックを再利用。                    |
| `fs/*` 転送対デーモンローカル FS | ケーパビリティゲート: クライアントが `fs` を宣言した場合は転送、そうでなければローカル。            |

---

## 10. 実装と検証ログ（v1）

`packages/cli/src/serve/acp-http/`（`json-rpc.ts`、`sse-stream.ts`、
`connection-registry.ts`、`dispatch.ts`、`index.ts`）に実装し、`server.ts` から
`mountAcpHttp(app, bridge, { boundWorkspace })` 経由でマウント。

### 自動テスト（`packages/cli/src/serve/acp-http/*.test.ts`）

`transport.test.ts` は実際の Express サーバー + 実際の `mountAcpHttp` を
制御可能なフェイクブリッジ上で起動し、`fetch` + 手動 SSE パーシングで駆動します。
15 テスト グリーン、カバー範囲: `initialize` 200 + `Acp-Connection-Id`；不明な接続
400；接続ストリームでの `session/new` 返信；プロンプト → `session/update`
ストリーム + 最終結果の相関；`session/request_permission` エージェント→クライアント→
エージェントラウンドトリップ；`_qwen/session/set_model`；メソッド未検出；`DELETE` ティアダウン。

### ライブデーモン（実際のモデル）

`qwen serve --port 8767 --token … --workspace …` を起動（バンドルエントリにより
スポーンされた `qwen --acp` 子は自己完結型）し、`scripts/acp-http-smoke.mjs` を実行:

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```

エラーパスもライブで確認: 子プロセスの起動失敗時、ブリッジのタイムアウトが
JSON-RPC エラーフレームとしてクライアントに接続ストリームで表示され
（`{"id":2,"error":{"code":-32603,…}}`）、失敗時の id 相関 + 202/SSE 分割が
証明されました。

### レビューフォールドイン — ブリッジ発行の clientId（ライブ検証で発見）

最初のライブ実行で `session/prompt` が _"client id … is not registered for
session"_ で失敗。根本原因: `spawnOrAttach`/`loadSession` がブリッジが発行したことのない
呼び出し元提供の clientId を**無視**し、新しいものを付与する（`BridgeSession.clientId` で返される）；
ディスパッチャーは `sendPrompt` 時に接続自身の（未登録の）id をエコーしていた。
修正: ブリッジがスタンプした id を `SessionBinding` に永続化し、セッションごとの
すべての呼び出し（`sessionCtx`）でエコーするように変更。上記で再検証グリーン。

---

## 11. レビューラウンド 2 — フォールドイン

正確性/並行性 + プロトコル準拠/セキュリティの 2 つの独立したレビューと自己確認。
すべての修正は拡張された vitest スイート（**18 テスト**）+ フレッシュなライブスモーク実行
（21 個の `session/update` フレーム → `stopReason=end_turn`）で検証済み。

| #   | 重要度 | 発見内容                                                                                                                                                                                                                                           | 修正                                                                                                                                                                                    |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**   | セッションストリームの**再接続が永続的にデッド**: `SessionBinding.abort` が一度作成され再利用されていた；ストリームのクローズ時に永続的に中断されたため、再接続の `subscribeEvents(signal)` が既に中断されたシグナルを受け取り、イベントをゼロ受信していた。 | `attachSessionStream` がストリームごとに**新しい** `AbortController` をインストール（既存ストリームをクローズ）；`index.ts` がその新しいシグナルでポンプ。                                      |
| R2  | **P0**   | `await dispatcher.handle()` が `res.end(202)` の**後に**実行された；スローするブリッジ呼び出し（特に未 try/catch の `isResponse` パス）がリジェクトし、未処理のリジェクションとして表面化 → デーモンのクラッシュの可能性。                                        | `isResponse` パスを try/catch でラップ；awaited `handle(...)` と `pumpSessionEvents(...)` に `.catch()` を追加。                                                                   |
| R3  | **P1**   | **接続→セッションオーナーシップなし**: 認証済みのどの接続でも、ワークスペース内の_任意の_ sessionId のセッション SSE を開くか、プロンプトを送信できた（読み取り盗聴；プロンプトは未登録 clientId エラーによって偶発的にのみブロックされていた）。          | `AcpConnection.ownedSessions` が `session/new`/`load`/`resume` によって設定される；セッションストリームは未所有の id に対して `403` を返し、セッションごとの POST は `INVALID_PARAMS` を返す（`requireOwned`）。 |
| R4  | **P1**   | `mountAcpHttp` のハンドルが破棄された → TTL スイープタイマー + ライブ SSE ストリームがシャットダウン時にリーク。                                                                                                                                      | ハンドルを `app.locals` に保存；`runQwenServe` のクローズフックが `bridge.shutdown()` の前に `dispose()` を呼び出す（デバイスフローレジストリを踏襲）。                                              |
| R5  | **P1**   | **ペンディングパーミッションリーク**: パーミッションが保留中のセッション/接続のクローズにより、ブリッジが投票を永遠に待つ状態になった。                                                                                                                  | `closeSessionStream`/`destroy` がインジェクトされた `onAbandonPending` → `cancelAbandonedPermission` 経由でマッチするペンディングリクエストをキャンセル。                                                      |
| R6  | **P1**   | プリアタッチフレームバッファ（`connBuffer`/`binding.buffer`）が無制限だった。                                                                                                                                                                          | EventBus の `maxQueued` に合わせて 256 フレームに上限設定（ドロップオールデスト）。                                                                                                                 |
| R7  | **P2**   | `initialize` がクライアントのリクエストした `protocolVersion` を無視していた。                                                                                                                                                                    | `min(requested, 1)` にネゴシエート。                                                                                                                                                    |
| R8  | **P2**   | `Acp-Session-Id` ↔ `params.sessionId` のクロスチェックなし（RFD §2.3）。                                                                                                                                                                 | POST が一致を確認；不一致 → `INVALID_PARAMS`。                                                                                                                                            |
| R9  | **P2**   | `session/cancel` のリクエスト形式（id 付き）が未回答；重複したトップレベル `_meta.qwen`。                                                                                                                                                         | id が存在する場合に返信；単一の `agentCapabilities._meta.qwen`。                                                                                                                            |

### 受け入れ済み / 文書化済み（v1 では修正しない）

- **プロンプト結果対末尾 `session/update` の順序付け**（P2）: `handlePrompt` が `sendPrompt` を
  awaiting してから結果フレームを書き込む一方、更新が並行してストリームされる。実際にはブリッジが
  `sendPrompt` が解決する前にすべての `session/update` をバスに発行し、両者が 1 つの順序付けされた
  SSE 書き込みチェーンを共有するため、結果が最後に届く（確認済み: 21 更新、その後結果）。
  クライアントリデューサーが敏感と判明した場合、厳密なバリアが可能な後のハードニング。
- **ブラウザの `EventSource` は `Authorization` を設定できない** — `/acp` GET ストリームは
  Bearer ヘッダーが必要なため、ブラウザには延期された WebSocket パス（§7）が必要；CLI/Node クライアントは影響なし。
- デーモンの実際のトラストバウンダリーは**Bearer トークン + 単一ワークスペースバインド**のまま（REST サーフェスと同じ）；
  R3 のオーナーシップチェックは多層防御 + 契約の正確性であり、テナントバウンダリーではない。

---

## 12. レビューラウンド 3 — PR ボットフォールドイン（#4472）

2 つの自動 PR レビュアーとサマリーボット。
すべての修正はスイート（現在 **22 テスト**）+ フレッシュなライブ実行（16 個の `session/update` → `end_turn`）で検証済み。

| #   | 重要度 | 発見内容                                                                                                                                                                                                                                     | 修正                                                                                                                                                                                         |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| B1  | **P0**   | `handlePrompt` の `AbortController` が一度も中断されなかった — 切断/キャンセルしたクライアントがエージェントを実行し続けた（モデルクォータの消費、セッション FIFO のブロック）。両ボット + 5 サブエージェントによってフラグ付け。                                        | `promptAbort` を `SessionBinding` に保存；`session/cancel` とセッション/接続ティアダウン（`closeSessionStream`/`destroy`）によって中断される。                                  |
| B2  | **P0**   | `sessionCtx` に `fromLoopback` がなかった → すべての ACP パーミッション投票がリモートとして扱われ；`local-only` ポリシーがループバッククライアントを拒否する可能性。                                                                                                                                       | `initialize` 時にループバックをキャプチャ（偽造不可能なヘッダーではなく、カーネルの `remoteAddress`） → `AcpConnection.fromLoopback` → `sessionCtx` に通す。            |
| B3  | **P0**   | SSE 書き込み失敗が静かに飲み込まれた → ゾンビストリーム（ハートビートが発火、イベントゼロ配信、ログなし）。                                                                                                                                   | 最初の書き込み失敗でログ + ストリームをクローズ。                                                                                                                               |
| B4  | **P0**   | アイドルスイープが接続をログなしで破棄 + 接続キャップなし（initialize フラッド）。                                                                                                                                                        | スイープが各リープをログ；`pumpSessionEvents` が `touch()` を呼び出す（長い静かなプロンプトがリープされない）；`maxConnections` キャップ（64）→ `503`。                            |
| B5  | **P1**   | バインディングにスタンプされた clientId がない場合、`sessionCtx` が接続の未登録 clientId に静かにフォールバックしていた（未テスト、`FakeBridge` で常に発火）。                                                                             | スタンプされた clientId がない場合はスロー（不変条件違反）；`FakeBridge` が 1 つをスタンプするようになった。                                                                                       |
| B6  | **P1**   | `session/new                                                                                                                                                                                                                                | load                                                                                                                                                                                        | resume` が未検証の `cwd` を受け入れた（REST は文字列/長さ/絶対パスを検証 — 増幅 DoS）。 | 共有 `parseOptionalWorkspaceCwd`（文字列、≤4096、絶対パス）。 |
| B7  | **P1**   | `session/prompt` が未検証の `prompt` をブリッジに転送していた。                                                                                                                                                                                           | `validatePrompt`（空でないオブジェクトの配列）、REST を踏襲。                                                                                                              |
| B8  | **P1**   | 生のブリッジエラーメッセージがクライアントにエコーされていた。                                                                                                                                                                                             | `toRpcError` が既知のブリッジエラーをコード化されたクライアントセーフな形状にマップ；未知 → 汎用 `Internal error`（完全な詳細は依然として stderr に）。                                       |
| B9  | **P1**   | `nextId` が連続した負の数を使用していた — 負の id を合法的に使用するクライアントが `pending` で衝突する可能性。                                                                                                                                        | デーモン発行の id は文字列（`_qwen_perm_N`）になり、クライアント id とは分離された。                                                                                                        |
| B10 | **P2**   | `resolveClientResponse` パラム型が `JsonRpcError` を除外；接続スコープ SSE ストリームに `onClose` がなかった；ヘッダーなしの `DELETE` が静かな 202 だった；`SseStream.close` が try/catch の外で `onClose` を実行した；`session/load`、`resume`、`close` が未テスト。 | `JsonRpcResponse` にパラムを拡張；接続ストリームがクローズ時にログ；`DELETE` でヘッダーなし → `400`；`onClose` を try/catch でラップ；load/resume/close + DELETE-400 テストを追加。 |

**スコープ外（ベースブランチ `daemon_mode_b_main`、この diff ではない）** — 2 番目のレビュアーが
`acpAgent.ts`（`entryCount`/`entrySummary`/`sessionClose`）の型チェックエラーとベースブランチに
起因する他の既存アイテムをフラグ付け（#4353 で導入）。別途追跡；ここでは触れない。

**依然として延期**（文書化済み）: `DELETE`/接続オーナーシップの接続ごとのシークレット（トークンが
バウンダリーのまま）；WebSocket + HTTP/2（§7）；厳密なプロンプト結果対末尾更新バリア（§11）。

---

## 13. レビューラウンド 4 — PR フォールドイン（#4469 にリベース済み）

ブランチを `daemon_mode_b_main`（#4353 + #4469）にリベース — **クリーン、コンフリクトなし**。2 つの PR
レビュアー（GPT-5 + qwen3.7-max）。スイートは現在 **25 テスト**；ライブ再検証済み（125 個の `session/update`
→ `end_turn`）。

| #   | 重要度 | 発見内容                                                                                                                                                                                             | 修正                                                                                                                                                                                            |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**   | ラウンド 3 の「SSE 書き込み失敗ハンドリング」が文書化されたが実装されていなかった — `SseStream` は依然として破棄する呼び出し元に委ねていた（ゾンビストリーム）。                                                                 | `writeRaw` が所有するようになった: 最初の書き込みリジェクションが一度ログ + `close()`；`doWrite` も `'error'` イベントをリッスン（`'close'` に待機する代わりにすぐにリジェクト）；`onClose` を try/catch でラップ。 |
| C2  | **P1**   | `fromLoopback` が `initialize` 時にのみキャプチャ + ヘルパーが REST より狭い → 後の POST からの `local-only` 投票が誤判定される。                                                                                                                  | リクエストごとのループバックが `handle`→`sessionCtx`/`resolveClientResponse` に通される；`isLoopbackReq` が `127.0.0.0/8` + `::ffff:127.*` + `::1` に拡張（REST と一致）。                         |
| C3  | **P1**   | エラーのルーティングが `params.sessionId` からストリームを推測 → 接続スコープのメソッド失敗（`session/load`/`resume`/`close`/`heartbeat`）が存在しないセッションストリームに誤ルーティング（サイレントロス）。 | `CONN_ROUTED_METHODS` セット；エラーは成功パスと同じ方法でルーティングされる。                                                                                                                      |
| C4  | **P1**   | `bridge.detachClient` がティアダウン時に呼び出されなかった → 古いブリッジスタンプの client id が `knownClientIds()`/投票セットに残留。                                                                   | レジストリが `DetachSessionFn` を取得；`closeSessionStream`/`destroy` が所有する各セッションをデタッチ（ベストエフォート）。                                                                                    |
| C5  | **P1**   | `session/close` が `bridge.closeSession` のスロー時にローカルクリーンアップをスキップ。                                                                                                                                                                       | `closeSessionStream` を `finally` に移動。                                                                                                                                                                            |
| C6  | **P2**   | Windows の `cwd`（`C:\…`）が `startsWith('/')` で拒否される。                                                                                                                                                                                       | `path.isAbsolute`（プラットフォーム対応）、REST と一致。                                                                                                                             |
| C7  | **P2**   | `protocolVersion` が `0`/負の値にネゴシエートできた。                                                                                                                                             | `Math.max(1, Math.min(requested, 1))` でクランプ；0/負/巨大/無効のテスト。                                                                                                                     |
| C8  | **P2**   | `session/load`/`resume` が空の `sessionId` を受け入れた。                                                                                                                                                                                         | `INVALID_PARAMS` で空を拒否。                                                                                                                                                            |
| C9  | **P2**   | 通知形式 `session/prompt` エラーがサイレントに消えた。                                                                                                                                                                                                | id なしのパスでログ。                                                                                                                                                                       |
| C10 | **P2**   | セッション SSE がヘッダー/`retry:` の前にバッファーされたフレームをフラッシュ。                                                                                                                                                                                        | `attachSessionStream` の前に `open()`。                                                                                                                                                                           |
| C11 | **P2**   | ローカルの `logStderr` が重複。                                                                                                                                                                                                                | `utils/stdioHelpers` から共有 `writeStderrLine`。                                                                                                                                                                  |
| C12 | **P2**   | ドキュメントが v1 に含まれない `--no-acp-http` フラグ、`acp_http` ケーパビリティタグ、`fs/*` 転送をアドバタイズしていた。                                                                                                                                           | ドキュメントを出荷済みサーフェスに合わせる（環境変数トグルのみ；`fs/*`+`terminal/*` + フラグ + タグは延期としてマーク）。                                                                                          |

依然として延期（変更なし）: WebSocket + HTTP/2；`DELETE`/オーナーシップの接続ごとのシークレット
（トークン + 単一ワークスペースがバウンダリーのまま）；厳密なプロンプト結果順序バリア；
`as never` ブリッジバウンダリーキャスト（ターゲット化され、アダプタータイプのフォローアップ用にメモ）。

---

## 14. レビューラウンド 5 — PR フォールドイン

もう 1 回のレビュアーパス（qwen3.7-max）。スイート **26 テスト**、ライブ再検証済み。

| #   | 重要度 | 発見内容                                                                                                                                                                                                                                                                                                                                                                              | 修正                                                                                                              |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **P0**   | `resolveClientResponse` がペンディングエントリを `respondToSessionPermission` 呼び出し**前**に削除していた。不正な投票（`result: {}`）がブリッジメディエーターをスローさせ — ペンディングエントリがすでに消えているため、ティアダウンの `abandonPendingForSession` がキャンセルできず、エージェントのプロンプトが解決しない投票を永遠に待ち続ける（トークンホルダーが 1 つの不正 POST でセッションをストールできる）。 | 投票を try/catch でラップ；失敗時は `cancelAbandonedPermission` にフォールバックしてメディエーターを常に解放。新しいテストが不正投票パスをカバー。 |
| D2  | **P1**   | セッションストリームの `onClose` がイベントポンプのみを中断し、`binding.promptAbort` を中断しなかった — クライアントの切断（タブクローズ/ネットワーク切断）がアイドル TTL まで実行中のプロンプトを放置（クォータ + FIFO）。                                                                                                                                                                    | `onClose` がセッションの `promptAbort` も中断するように変更。                                                                                                           |
| D3  | **P1**   | `pumpSessionEvents` がリジェクトした際、`.catch` はログのみ — SSE ストリームがハートビートを打ち続けるが何も配信しないゾンビ（再接続シグナルなし）として開いたまま。                                                                                                                                                                                                                          | `.catch` が `closeSessionStream(sessionId)` も呼び出すように変更。                                                                                                               |

---

## 15. レビューラウンド 6 — PR フォールドイン

別のレビュアーパス（qwen3.7-max）。スイート **28 テスト**、ライブ再検証済み。

| #   | 重要度 | 発見内容                                                                                                                                                                                                                                             | 修正                                                                                                                                                                                                                                                                                                                                        |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | **P0**   | `handlePrompt` が前のコントローラーを中断せずに `binding.promptAbort` を上書きした — 1 つのセッションへの 2 つの並行する `session/prompt` が最初のものを孤立させた（ブリッジ FIFO で完了まで実行、`session/cancel` では中断不可）。 | 新しいものをインストールする前に前の `promptAbort` を中断。テスト追加。                                                                                                                                                                                                                                                                   |
| E2  | **P0**   | `subscribeEvents` のスローパスが `stream_error` 通知を送信してから `return` した（解決）— 呼び出し元の `.catch` が一度も発火せず、ゾンビ SSE ストリーム（ハートビート、イベントなし、再接続シグナルなし）を残した。                                                                 | 呼び出し元の `.catch` がストリームをクローズできるように通知後に再スロー。テストがプロンプトクローズをアサート。                                                                                                                                                                                                                         |
| E3  | **P1**   | SSE ハートビートが接続をアクティブとしてマークしなかった — 30 分以上中間イベントのない長いプロンプトがアイドルリープされた（ストリーム + プロンプトがキル）。                                                                                                  | `SseStream` が `onHeartbeat` フックを取得；両方の GET ハンドラーが `() => conn.touch()` を渡す。                                                                                                                                                                                                                                      |
| E4  | **P2**   | `pumpSessionEvents` `.catch` が sessionId でクローズ — スローとマイクロタスクの間の再接続が新しいストリームをキルする可能性。                                                                                                                        | アイデンティティガード: `binding.stream` が依然としてこのストリームである場合にのみクローズ。                                                                                                                                                                                                                                                       |
| E6  | **P2**   | `sendSession` がバインディングを自動作成していた — `closeSessionStream` 後の遅いポンプ/返信フレームが最大 256 フレームを永遠にバッファするゴーストバインディングを復活させた。                                                                                                                                                        | `sendSession` はルックアップのみになった: セッションにライブバインディングがない場合はフレームをドロップ。                                                                                                                                                                                                                                                       |
| E5  | 受け入れ済み | `session/load`/`resume` が別のライブ接続がセッションを所有している場合に拒否しない（「ハイジャック」）。                                                                                                                                                       | **受け入れ済み、変更なし:** デーモンのトラストバウンダリーは Bearer トークン + 単一ワークスペースバインドであり、マルチクライアントアタッチは意図的（ブリッジはデザイン上マルチクライアント；REST にも同じプロパティがある）。トークンホルダーは REST 経由では得られないケーパビリティをこれを通じて得ることはない。他のトークンバウンダリーアイテムと共に追跡（DELETE オーナーシップ、§13）。 |

---

## 16. レビューラウンド 7 — PR フォールドイン

別のレビュアーパス（qwen3.7-max）。スイート **30 テスト**、ライブ再検証済み。

| #   | 重要度 | 発見内容                                                                                                                                                                                        | 修正                                                                                                                                                                                         |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0**   | 並行 `session/close` TOCTOU: `ownedSessions.delete` が `finally` でのみ実行（await 後）、2 つの並行クローズが両方とも `requireOwned` を通過 → 2 番目への誤解を招くエラー + 冗長なブリッジクローズ。 | await の前に所有権ゲートを同期的に削除；ブリッジクローズが一度実行される。テスト追加。                                                                                                               |
| F2  | **P1**   | ポンプライフサイクル: クリーンなイテレーター終了（サブプロセス終了、`done`）が解決 → `.catch` が一度も発火せず → ゾンビストリーム；MID-STREAM イテレーターエラーが `stream_error` を送信しなかった。                                   | `pumpSessionEvents` がループ全体をラップ（同期 + ミッドストリームエラーが `stream_error` を送信して再スロー）；コンシューマーの `.then(onDone, onErr)` が両方のパスでストリームをクローズ（アイデンティティガード）。テスト追加。 |
| F3  | **P2**   | 503 接続キャップリジェクションに stderr ログがなかった。                                                                                                                                                                | キャップ値を持つ `writeStderrLine`。                                                                                                                                                                     |
| F4  | **P2**   | `_qwen/notify stream_error` スプレッドが `event.data.kind` にディスクリミネーターをシャドウさせた。                                                                                                                             | 最初にスプレッド、次に `kind: 'stream_error'`。                                                                                                                                                    |
| F5  | **P2**   | `MAX_WORKSPACE_PATH_LENGTH` が再宣言（`= 4096`）対 正規の `fs/paths.js`。                                                                                                                              | `../fs/paths.js` からインポート（乖離なし）。                                                                                                                                                            |
| F6  | **P2**   | `isObjectParams` が `json-rpc.isObject` を重複していた。                                                                                                                                               | `isObject` をインポート。                                                                                                                                                                                          |
| F7  | **P2**   | `index.ts`/`sse-stream.ts` の生の `process.stderr.write` 対他所での `writeStderrLine`。                                                                                                                       | モジュール全体で `writeStderrLine` に統一。                                                                                                                                                             |

---

## 17. REST 等価アライメント + 拡張方案監査の実施（ラウンド 8）

目標: `/acp` を REST+SSE の**等価的な代替**にする。このバッチは監査結論に基づいて拡張方案をリファクタリングし、**bridge がすでに公開している**すべての機能を補完する；bridge がまだ持っていない機能（ファイル I/O、デバイスフロー、agents/memory CRUD）は、アーキテクチャの正確性の要件として**先に acp-bridge で補完**する（§17.3 参照）。

### 17.1 拡張方案監査 → 実施（§5 の旧方案を置き換え）

**リポジトリに実際に実装された SDK `@agentclientprotocol/sdk@0.14.1`**（公式 Web サイトのみでなく）に基づいて確認:

- `session/set_config_option` は**一級（非 `unstable_`）メソッド**であり、リクエスト `{sessionId, configId, value}`、`category` に `model`/`mode`/`thought_level` を含む；一方 `set_model` は依然として `unstable_setSessionModel` を使用する。
- 仕様は `_` プレフィックスを拡張用に予約し、例として `_zed.dev/…` のドメインスタイルを示す；ベンダーデータはドメイン名でキーされた `_meta` に配置。

実施:

- **ネームスペース `_qwen/` → 逆ドメイン名 `_qwen/`**；`_meta` を `_meta:{ "qwen": … }`（`initialize` ケーパビリティアドバタイズと `session/request_permission` の requestId を含む）に統一。
- **モデル + 承認モード → 標準 `session/set_config_option`**（`configId:"model"|"mode"`）、既存の `bridge.setSessionModel`/`setSessionApprovalMode` にルーティング；`session/new` 結果が `configOptions` を**アドバタイズ**（子プロセスセッション状態 `getSessionContextStatus().state.configOptions` から取得、すでに ACP 形状）。ベンダー `_qwen/session/set_model` を**削除**。
- REST（http+sse）の**同期変更は不要**：両トランスポートが同じ bridge を共有し、状態は自然に一貫している。

### 17.2 このバッチで追加された `/acp` メソッド（bridge がすでにサポート、REST と 1:1 対応）

| REST                                                  | `/acp`                                             | bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | **標準** `session/set_config_option`（model/mode） | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                  |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus        |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                    |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                              | getWorkspace\*Status                     |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                            |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                  |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                         |

（既存: session/new・load・resume・close・list・prompt・cancel、heartbeat、permission、events はすでに対応済み。）

### 17.3 残存ギャップ → acp-bridge で先に補完が必要（アーキテクチャの正確性）

REST の**ファイル I/O**（`/file /glob /list /stat /file/write /file/edit`）、**デバイスフローログイン**（`/workspace/auth/*`）、**agents CRUD**（`/workspace/agents`）、**memory CRUD**（`/workspace/memory`）は現在 **`HttpAcpBridge` 上に存在しない** — REST ルートは route レベルのサービス（`WorkspaceFileSystemFactory`、`DeviceFlowRegistry`、`SubagentManager`、`writeWorkspaceContextFile`）を直接呼び出し、bridge をバイパスしている。

**決定（レビュー/オーナーの意見を採用）**: `/acp` トランスポートがこれらの route レベルサービスに直接接続しない（REST のアーキテクチャドリフトを複製し、トランスポートの結合を 2 倍にする）。**正しいアプローチは、まず `@qwen-code/acp-bridge` の `HttpAcpBridge` でこれらの機能を補完する**（例: `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`、`startDeviceFlow`/`pollDeviceFlow`、`listAgents`/`upsertAgent`/`deleteAgent`、`readMemory`/`writeMemory`）、REST と `/acp` の両方が bridge 経由になるようにする。その後、`/acp` に `_qwen/fs/*`、`_qwen/auth/*`、`_qwen/workspace/agent*`、`_qwen/workspace/memory*` を追加（ファイル読み取りは標準の ACP client→agent メソッドがないため、合法的なベンダー拡張）。

**完全な等価 = このバッチ（bridge が既に持つ機能）+ acp-bridge のギャップ補完後の後続バッチ**。

---

## 18. レビューラウンド 9 — PR フォールドイン

| #   | 重要度            | 発見内容                                                                                                                                                                                                                                                                             | 修正                                                                                                                                                                                     |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **P1（回帰）** | セッションストリームの再接続が実行中のプロンプトを中断した: `attachSessionStream` が新しいストリームをインストールする前に古いストリームをクローズし、古いストリームの `onClose` が無条件に `promptAbort` を中断した — 再接続するクライアント（ネットワークグリッチ/ローミング）が実行中のプロンプトを失った。 | 古いストリームをクローズする**前**に新しいストリームをインストール；`onClose` のプロンプト中断をアイデンティティガード（これが依然としてセッションのライブストリームである場合にのみ中断）。テスト追加（プロンプトが再接続を生き延びる）。 |
| G2  | **P2**              | `session/cancel` が `CancelNotification` ボディとして `undefined` を渡し、REST が転送するクライアント提供のキャンセルフィールド（reason/context）をドロップしていた。                                                                                                                   | `{ ...params, sessionId }` を転送（REST を踏襲）。                                                                                                                                      |

最新の `daemon_mode_b_main`（#4473/#4483/#4484/#4500）にリベース済み、コンフリクトなし。スイート **33 テスト**、ライブ再検証済み。

---

## 19. ロードマップ / 後続 PR（備忘録）

この PR（#4472）= ACP Streamable HTTP トランスポート + **すべての bridge-backed 機能の対応** + 公式拡張方案。すでに **ready** に変更済み。「`/acp` が REST+SSE と完全に等価」になるにはまだ必要なもの:

1. **フォローアップ PR 1 — acp-bridge 機能補完（前提 / bridge-first）**: `HttpAcpBridge` にファイル I/O、デバイスフロー、agents CRUD、memory CRUD メソッドを追加；REST ルートを bridge 経由に変更（route レベルサービスへの直接接続のドリフトを解消）。
2. **フォローアップ PR 2 — `/acp` 残存対応（PR 1 に依存）**: `_qwen/fs/*`、`_qwen/auth/*`、`_qwen/workspace/agent*`、`_qwen/workspace/memory*` → REST との完全な等価。

追跡: #3803（オープンな決定）、#4175（Mode B ロードマップ）ともにコメント済み。
延期されたハードニングアイテムは PR 説明の「既知の deferred」を参照。

---

## 20. 拡張ネームスペースのリネーム + SDK トランスポート分析（ラウンド 11）

- **ネームスペース `_qwen.ai/` → `_qwen/`**: ACP の唯一のハードルールは先頭の `_`；`_zed.dev/` ドメインセグメントは例による慣例であり、MUST ではない。`qwen` は識別可能であるため、より短い裸の形式を使用。`_meta` キーも同様に `"qwen"`。（実際のエージェントの調査: Zed/gemini-cli はほぼ標準メソッド上の `_meta` + ACP 独自の `unstable_*` を使用；裸のカスタム `_` メソッドは稀 — 私たちの `_qwen/*` は標準の同等物がない真に新しいワークスペース/セッションオプションであり、`_` メソッドが適切なツール。）
- **手動実装のトランスポートを選択した理由（SDK ベースでなく）**: TS SDK は `ndJsonStream`（stdio）のみを提供；RFD #721 HTTP は SDK フェーズ 3（未実装）。SDK の `Connection` は単一二重ストリーム；私たちのトランスポートはマルチストリーム（POST + 接続 SSE + セッションごとの SSE）であり、sessionId によるアウトバウンドデマルチプレクシングが必要 — これはディスパッチャーがルーティング時にすでに知っている。完全な SDK リライトはそのモデルと相反し、バルク（bridge 翻訳、SSE ライフサイクル、オーナーシップ、EventBus→JSON-RPC）を削除しない。**実用的な改善（フォローアップ候補）: 手動実装のトランスポートを維持しつつ、パラメーターバリデーションに SDK の Zod スキーマバリデーター + 型を採用。** `extMethod('_qwen/…')` を使用する SDK クライアントは私たちのハンドラーと相互運用できる（同一のワイヤー形状）。
