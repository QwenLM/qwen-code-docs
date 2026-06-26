```markdown
# Daemon ACP-over-HTTP → 公式 ACP Streamable HTTP トランスポート

> 対象: `daemon_mode_b_main` ブランチ。ブランチ: `feat/daemon-acp-http-streamable`。
> 著者: arnoo.gao。日付: 2026-05-24。ステータス: **Design v1 → 実装**。
> リポジトリのワークフローに従い、設計ファースト: このドキュメントは実装 PR と同時または先行して作成され、ワイヤー契約をレビュー可能にします。

---

## 0. TL;DR

現在、デーモン（`qwen serve`）は Web/SDK クライアントに対して **独自の REST + SSE** 方言で通信し、生成された `qwen --acp` 子プロセスに対しては **本当の ACP JSON-RPC over stdio** で通信しています。この提案では、**公式の ACP Streamable HTTP トランスポート**（RFD #721）を単一の `/acp` エンドポイントで実装する **2 番目のノースバウンドトランスポート** を追加します。これにより、ACP ネイティブクライアント（Zed、Goose、将来の SDK）は、qwen 固有の REST 知識を必要とせず、標準プロトコル経由で直接デーモンを駆動できます。

**決定: デュアルトランスポート（追加的）。** 新しい `/acp` エンドポイントは既存の REST サーフェスと並行してマウントされ、内部で同じ `HttpAcpBridge` + `EventBus` を再利用します。REST API は**削除しません**。根拠は §6。

**決定: 拡張名前空間 = `_qwen/…`**（シングルアンダースコアプレフィックス、ACP 仕様でカスタムメソッド用に予約された形式）。標準の ACP メソッドがないデーモン機能（モデル切り替え、ワークスペースイントロスペクション、ハートビート、マルチクライアント権限ポリシー、SSE バックプレッシャーチューニング）に使用します。根拠は §5。

この PR には、完全でローカル実行可能なリファレンス実装（`packages/cli/src/serve/acp-http/`）と検証ハーネス（`scripts/acp-http-smoke.mjs`）が含まれています。

---

## 1. 背景 — 今日の「ACP over HTTP」の意味

3 つの層（コミット `0c0430939` で確認）:

```
┌──────────────┐  独自 REST + SSE (HTTP/1.1)    ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ web / SDK    │ ───────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ client       │ ◄─── GET /session/:id/events ──── │  serve     │ ◄─────────────► │ child (Agent)│
│ (ACP client) │       (text/event-stream)        │  (daemon)  │  ndJsonStream   │              │
└──────────────┘                                   └────────────┘                 └──────────────┘
        northbound: ACP ワイヤーではない             bridge          southbound: 本当の ACP
```

### 1.1 ノースバウンド（クライアント ↔ デーモン）— 現在は独自

- Express 5 アプリ (`packages/cli/src/serve/server.ts`、約 30 ルート)
- 個別の REST 動詞、**JSON-RPC ではない**:
  - `POST /session` (作成)、`POST /session/:id/prompt`、`POST /session/:id/cancel`、
    `POST /session/:id/load|resume`、`POST /session/:id/model`、
    `POST /session/:id/permission/:requestId`、`POST /session/:id/heartbeat`、
    `DELETE /session/:id`、さらに `/workspace/*`、`/capabilities`、`/health`。
- サーバー→クライアントストリーミング: `GET /session/:id/events` → `text/event-stream`。
  - フレーム: `id: <n>\nevent: <type>\ndata: <json>\n\n` (`server.ts:formatSseFrame`、約 2626行)。
  - セッションごとの**単調増加 `id`** + `Last-Event-ID` 再開、リングバッファ `EventBus` (`acp-bridge/src/eventBus.ts`) でバックアップ。
  - イベント `type`: `session_update`、`client_evicted`、`slow_client_warning`、
    `state_resync_required`、`stream_error`、…
- 認証: `Authorization: Bearer <token>` (`serve/auth.ts`)、CORS 拒否 + ホスト許可リスト。
- バックプレッシャー: 接続ごとのシリアル化された書き込みチェーン + 15 秒のハートビートコメント。

### 1.2 サウスバウンド（デーモン ↔ 子プロセス）— すでに ACP

- `acp-bridge/src/spawnChannel.ts` が `qwen --acp` を起動し、stdin/stdout を `@agentclientprotocol/sdk` (`^0.14.1`) の `ndJsonStream` でラップ。
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)` — デーモンは ACP **クライアント**、子プロセスは ACP **エージェント**。
- この区間ではすでに拡張メソッドが使用中: `unstable_setSessionModel`、`unstable_resumeSession`、`unstable_listSessions` (`acp-integration/acpAgent.ts`)。

### 1.3 なぜノースバウンドを移行するのか

- すべてのクライアント（webui、TS SDK、Java SDK、Python SDK、VSCode コンパニオン）が独自の REST マッピングを再実装しています。ACP 標準エンドポイントを使用すれば、ACP ネイティブエディタは qwen 固有のグルーコードなしで接続できます。
- デーモンのリモートサーフェスを、内部ですでに話しているプロトコルと整合させます。

---

## 2. 目標: ACP Streamable HTTP (RFD #721)

マージ済み **Draft** RFD (`agentclientprotocol/agent-client-protocol#721`、2026-04-22 マージ)。
まだ規範的ではなく、どの SDK にも含まれていません。RFD のワイヤーデザインに従って実装します。

### 2.1 エンドポイントと動詞（単一の `/acp`）

| 動詞          | 動作                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`   | JSON-RPC を送信。`initialize` → **`200`** + JSON 本文（機能）で応答し、`Acp-Connection-Id` を設定。その他のリクエスト/通知 → **`202 Accepted`**、空の本文; 応答（ある場合）は、対応する長期間存続する SSE ストリームで配信。 |
| `GET /acp`    | 長期間存続する **SSE** ストリームを開く。（`Upgrade: websocket` → WebSocket; **延期**、§7 参照。）                                                                                                                                                     |
| `DELETE /acp` | コネクションを終了 → `202`。                                                                                                                                                                                                               |

### 2.2 2 層の長期間存続ストリーム

- **コネクションスコープのストリーム**: `Acp-Connection-Id` ヘッダーを持つ `GET /acp`、セッションヘッダーなし。コネクションレベルの応答（`session/new`、`session/load`、`authenticate`）とコネクションレベルの通知を運びます。
- **セッションスコープのストリーム**: `Acp-Connection-Id` **および** `Acp-Session-Id` を持つ `GET /acp`。`session/update` 通知、**エージェント→クライアントリクエスト**（`session/request_permission`、`fs/read_text_file`、…）、およびセッション POST への応答（`session/prompt`、`session/cancel`）を運びます。

### 2.3 識別子（3 層）

- `Acp-Connection-Id`（HTTP ヘッダー）— トランスポートバインディング、`initialize` 時に生成。
- `Acp-Session-Id`（HTTP ヘッダー）— セッションスコープの GET およびセッション POST で必須。
- `sessionId`（JSON-RPC パラメータ）— メソッドパラメータ内（ヘッダーと一致する必要がある）。

### 2.4 MCP StreamableHTTP との相違点

ACP は **長期間存続する** ストリーム（リクエストごとの SSE ではない）、**2 つ** の ID ヘッダー（コネクション vs セッション）、非初期化リクエストには `202`、HTTP/2 必須、WebSocket 必須クライアントを使用します。単一エンドポイント + POST/GET-SSE + セッションヘッダーの骨格は借用しますが、長期間存続するデュアル ID モデルに適合させます。`@modelcontextprotocol/sdk` の `StreamableHTTPServerTransport` は**再利用しません**（そのリクエストごとのストリームモデルと単一の `Mcp-Session-Id` は適合しません）。

### 2.5 標準メソッド（現在のスキーマから確認）

- クライアント→エージェントリクエスト: `initialize`、`authenticate`、`session/new`、`session/load`、`session/prompt`、`session/resume`、`session/close`、`session/list`、`session/set_mode`、`session/set_config_option`、`logout`。
- クライアント→エージェント通知: `session/cancel`。
- エージェント→クライアントリクエスト: `fs/read_text_file`、`fs/write_text_file`、`session/request_permission`、`terminal/create|output|wait_for_exit|kill|release`。
- エージェント→クライアント通知: `session/update`。

---

## 3. 新しいトランスポートのアーキテクチャ

デーモンはノースバウンドで HTTP 越しの **ACP エージェントサーフェス** を提示しつつ、サウスバウンドの子プロセスに対しては ACP **クライアント** であり続けなければなりません。したがって、`/acp` 層は HTTP トランスポートを終端し、既存の `HttpAcpBridge` にブリッジする **JSON-RPC ルーター** です。

```
            POST /acp (JSON-RPC リクエスト/応答/通知)
client  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(editor)                                                  │  AcpHttpTransport         │
        ◄── GET /acp  (コネクションスコープ SSE) ──────  │  - コネクションレジストリ │
        ◄── GET /acp  (セッションスコープ SSE) ────────  │  - JSON-RPC id 相関       │
                                                          │  - メソッドディスパッチ   │
                                                          └────────────┬──────────────┘
                                                                       │ 再利用
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (変更なし)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (変更なし)
                                                                 qwen --acp child
```

### 3.1 新しいモジュール構成 (`packages/cli/src/serve/acp-http/`)

| ファイル                    | 責任                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`               | `mountAcpHttp(app, bridge, opts)` — 既存の Express アプリに `/acp` ルートを登録。                                                                                                    |
| `connection-registry.ts` | `Acp-Connection-Id` → `AcpConnection`（コネクション SSE ライター、`Map<sessionId, SessionStream>`、JSON-RPC id による保留中のエージェント→クライアントリクエスト、単調増加 id アロケーター）。TTL + DELETE クリーンアップ。 |
| `json-rpc.ts`            | JSON-RPC 2.0 の解析/検証/シリアライズヘルパー; エラーコード（`-32600` など）; `_qwen/` 名前空間ガード。                                                                                       |
| `dispatch.ts`            | 受信 JSON-RPC メソッドを `HttpAcpBridge` 呼び出しにマッピング。`BridgeEvent` を送信 JSON-RPC フレームにマッピング。変換テーブル（§4）。                                                          |
| `sse-stream.ts`          | 長期間存続する SSE ライター（`server.ts` のバックプレッシャー/ハートビートパターンを再利用）。REST `/events` とは異なる（フレーミング: 完全な JSON-RPC オブジェクト、qwen イベントエンベロープではない）。      |

`bridge.ts` / `eventBus.ts` への変更はありません（追加的なコンシューマのみ）。

### 3.2 コネクションとセッションのライフサイクル

1. `POST /acp {initialize}` → `connectionId` を生成、`AcpConnection` を作成、`200` で応答 `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + `Acp-Connection-Id` ヘッダー。
2. クライアントが `Acp-Connection-Id` を付けて `GET /acp`（コネクションスコープ）を開く。
3. `POST /acp {session/new}` → `202`; デーモンが `bridge.createSession(...)` を呼び出し; JSON-RPC 応答（`sessionId` を含む）を**コネクション**ストリームにプッシュ。
4. クライアントが `Acp-Connection-Id` + `Acp-Session-Id` を付けて `GET /acp`（セッションスコープ）を開く; デーモンが `bridge.subscribeEvents(sessionId)` を呼び出し、変換されたフレームをパイプ。
5. `POST /acp {session/prompt}` → `202`; `bridge.sendPrompt(...)`; `session/update` 通知がセッションストリーム上でライブ配信; 最終的なプロンプト **応答**（`{id, result:{stopReason}}`）は決定時にセッションストリームにプッシュ。
6. エージェント→クライアントリクエスト（例: `session/request_permission`）は、デーモンが割り当てた id を持つ JSON-RPC **リクエスト**としてセッションストリームに出力; クライアントは `POST /acp {id, result}` で応答; `dispatch` が bridge の権限 API を通じて解決。
7. `DELETE /acp`（またはコネクションストリームクローズ + TTL）によりセッション/サブスクリプションを解体。

---

## 4. 変換テーブル（bridge ⇄ ACP/HTTP）

### 4.1 インバウンド（クライアント POST → bridge）

| ACP メソッド                                | Bridge 呼び出し                                       | 応答のルーティング先                 |
| ------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ----------------- |
| `initialize`                                | （なし; 機能は `capabilities.ts` から）               | インライン `200`                           |
| `authenticate`                              | 既存の認証プロバイダー (`serve/auth/*`)               | コネクションストリーム                      |
| `session/new`                               | `bridge.createSession`                                | コネクションストリーム                      |
| `session/load` / `session/resume`           | `bridge.restoreSession('load'                         | 'resume')`                             | コネクションストリーム |
| `session/prompt`                            | `bridge.sendPrompt`                                   | セッションストリーム（決定まで延期） |
| `session/cancel` (通知)                    | `bridge.cancel`                                       | —                                      |
| `session/list`                              | `bridge.listSessions` (`unstable_listSessions`)       | コネクションストリーム                      |
| `session/set_mode`                          | 承認モードルートロジック                             | セッションストリーム                         |
| JSON-RPC **応答**（エージェント→クライアントリクエストに対し） | 保留中の解決（`§4.3`）                              | —                                      |
| `_qwen/session/set_model`                   | `bridge.setSessionModel` (`unstable_setSessionModel`) | セッションストリーム                         |
| `_qwen/workspace/list` など                 | ワークスペースイントロスペクションルート             | コネクションストリーム                      |
| `_qwen/session/heartbeat`                   | `bridge.heartbeat`                                    | コネクションストリーム                      |

### 4.2 アウトバウンド（BridgeEvent → セッションストリーム上の JSON-RPC）

| BridgeEvent.type                                                   | 出力内容                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `session_update`                                                   | `{method:"session/update", params:<data>}` 通知             |
| 権限リクエスト                                                 | `{id:<n>, method:"session/request_permission", params}` リクエスト     |
| `client_evicted` / `slow_client_warning` / `state_resync_required` | `{method:"_qwen/notify", params:{kind,…}}` 通知             |
| `stream_error`                                                     | アクティブなプロンプト id の JSON-RPC エラー応答（または `_qwen/notify`） |
| プロンプト決定                                              | `{id:<promptId>, result:{stopReason}}`                              |

### 4.3 保留中のエージェント→クライアントリクエスト

`AcpConnection` は `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>` を保持します。クライアントが JSON-RPC 応答オブジェクトを POST すると、`dispatch` は `id` を照合し、bridge の解決パス（例: 権限 `POST /session/:id/permission/:requestId` の内部相当）を呼び出します。

> **v1 ステータス:** `session/request_permission` エージェント→クライアントラウンドトリップのみ実装されています。`fs/*` および `terminal/*` のエージェント→クライアント転送は**延期**されています（§7）— デーモンは `/acp` でまだ `fs`/`terminal` クライアント能力ネゴシエーションを通知していないため、ACP クライアントは v1 でこのトランスポート上でファイルシステム/ターミナルセマンティクスを想定すべきではありません。意図する最終状態（`fs/*` をクライアントに転送; クライアントに `fs` 能力がない場合はデーモンのワークスペース FS にフォールバック）は、§7 で説明する後続作業です。

---

## 5. 拡張戦略（要件 #2）

ACP は `_` で始まるメソッドをすべてカスタム拡張用に予約し、すべてのタイプに `_meta` を提供します。コードベースのサウスバウンド区間はすでに `unstable_*` メソッド名を使用しています。

**ノースバウンドの選択:** ベンダー名前空間の **`_qwen/<area>/<verb>`** メソッド名（仕様準拠の `_` プレフィックス）。機能は `initialize` 時に `agentCapabilities._meta.qwen` の下で通知されるため、クライアントは使用前に機能検出できます。

| ニーズ                                                  | 標準の ACP メソッドは存在するか? | 拡張                                               |
| ----------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| モデル切り替え                                          | いいえ                     | `_qwen/session/set_model`                               |
| ワークスペース MCP/スキル/プロバイダー/環境イントロスペクション      | いいえ                     | `_qwen/workspace/list`、`_qwen/workspace/<area>`        |
| ハートビート / 最終確認時刻                                 | いいえ                     | `_qwen/session/heartbeat`                               |
| マルチクライアント権限ポリシー（合議制/指定） | 部分的                 | `session/request_permission` + `_meta.qwen.policy`      |
| SSE バックプレッシャーチューニング (`maxQueued`)                 | いいえ                     | セッション GET の `Acp-Qwen-Max-Queued` ヘッダー             |
| 再開カーソル（リング `Last-Event-ID`)                  | RFD フェーズ 4             | `Last-Event-ID` ヘッダー + フレームの `_meta.qwen.eventId` |

標準メソッドは**決して名前変更されません**。拡張は厳密に追加的であり、無視可能です。

---

## 6. デュアルトランスポート vs. 置換（要件 #4）

**決定: デュアルトランスポート（追加的）。**

- 公式トランスポートは **Draft** RFD であり、規範的ではなく、どの SDK にも存在しません。強制的に置き換えると、未承認の設計に結合され、webui + 3 SDK + VSCode コンパニオンが同時に壊れます。
- REST サーフェスには、まだ明確な ACP マッピングがない機能（ワークスペースイントロスペクション、マルチクライアント権限調停、リングバッファ再開、機能レジストリ）が含まれています。これらは `/acp` では `_qwen/*` 拡張に格下げされますが、REST サーフェスは RFD が承認されるまで権威あるものとして残ります。
- 両方のトランスポートは **1 つ**の `HttpAcpBridge` + `EventBus` インスタンスを共有するため、状態の重複はありません — `/acp` と `/session/*` は同じライブセッションを同時に駆動することも可能です（マルチクライアントはすでに bridge でサポートされています）。
- トグル（v1、出荷時）: デフォルトで有効; **`QWEN_SERVE_ACP_HTTP=0`** でマウントを無効化。`--no-acp-http` CLI フラグと `/capabilities` の `acp_http` タグによるクライアント機能検出は **後続作業に延期**（v1 には含まれません）— それまでは、クライアントは `POST /acp {initialize}` をプローブしてトランスポートを検出します。

移行パス: RFD が承認され SDK が出荷されたら、REST ルートは `/acp` 上の薄い互換性シムとして再構成できます（別の後続 PR）。

---

## 7. 実装 PR の範囲

**範囲内（ローカルで実行可能かつ検証済み）:**

- `POST /acp` ディスパッチ（`initialize`、`session/new`、`session/prompt`、`session/cancel`、`session/load`、JSON-RPC 応答処理）
- コネクションスコープ + セッションスコープの `GET /acp` SSE ストリーム（JSON-RPC フレーミング）
- `session/update` ストリーミング + 最終プロンプト応答の相関
- `session/request_permission` エージェント→クライアントラウンドトリップ
- `_qwen/session/set_model` 拡張（要件 #2 の実例）
- Bearer 認証 + ホスト許可リストの再利用（REST と同じミドルウェア）
- 単体テスト (`acp-http/*.test.ts`) + 実際のデーモンを駆動するブラックボックス Smoke スクリプト

**延期（文書化のみ、今は実装しない）:**

- WebSocket アップグレードパス（RFD 必須のクライアント機能; ローカル検証には SSE で十分）
- HTTP/2 多重化（HTTP/1.1 で実行; POST と長期間存続 GET は別々のソケットを使用。これは CLI/Node クライアントおよび ≤6 接続のブラウザで動作）。相違点として文書化。
- 完全な `fs/*` + `terminal/*` エージェント→クライアント転送（権限パスでメカニズムを立証; 残りは機械的な後続作業）
- リングバッファとのパリティを持った SSE 再開可能な耐久性の強化（RFD フェーズ 4）
```
---

## 8. ローカル検証計画

1. `npm run build`（または `cli` + `acp-bridge` のワークスペースビルド）を実行。
2. デーモンを起動：`qwen serve --listen 127.0.0.1:0 --token <t>`（または環境変数トークン）。
3. `node scripts/acp-http-smoke.mjs` を実行：
   - `POST /acp {initialize}` → `200` + `Acp-Connection-Id` をアサート。
   - 接続 SSE を開く； `POST {session/new}` → ストリーム上の応答をアサート。
   - セッション SSE を開く； `POST {session/prompt:"say hi"}` → 少なくとも1つの `session/update` をアサートし、その後最終的な `{result:{stopReason}}` を確認。
   - パーミッションが必要なツールをトリガー → `session/request_permission` リクエストをアサート、許可応答を POST → プロンプトが完了することをアサート。
   - `POST {_qwen/session/set_model}` → モデル切り替え + `session/update` をアサート。
4. Vitest：`acp-http/*.test.ts` がすべてパス。

---

## 9. リスク

| リスク                                      | 対策                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| RFDの批准前の変更                           | 機能タグ + `_qwen` 名前空間の背後に配置。独立したモジュールで修正が容易。        |
| HTTP/1.1 と必要な HTTP/2                    | ローカルホスト/CLI クライアントには影響なし。文書化済み。h2 は後でトランスポートを切り替え。 |
| 1つのブリッジ上の2つのトランスポートの競合  | ブリッジは既にマルチクライアントをサポート。そのロックを再利用。                  |
| `fs/*` 転送とデーモンローカルFS             | 機能ゲート付き：クライアントが `fs` を宣言した場合は転送、そうでなければローカル。|

---

## 10. 実装と検証ログ (v1)

`packages/cli/src/serve/acp-http/`（`json-rpc.ts`, `sse-stream.ts`, `connection-registry.ts`, `dispatch.ts`, `index.ts`）に実装され、`server.ts` から `mountAcpHttp(app, bridge, { boundWorkspace })` 経由でマウントされている。

### 自動テスト（`packages/cli/src/serve/acp-http/*.test.ts`）

`transport.test.ts` は実際の Express サーバー + 実際の `mountAcpHttp` を制御可能なフェイクブリッジ上で起動し、`fetch` + 手動 SSE パースで駆動する。15 テストがグリーンで、以下をカバー：`initialize` 200 + `Acp-Connection-Id`；不明コネクションで400；接続ストリーム上の `session/new` 応答；プロンプト → `session/update` ストリーム + 最終結果の相関；`session/request_permission` エージェント→クライアント→エージェントの往復；`_qwen/session/set_model`；メソッド未検出；`DELETE` ティアダウン。

### ライブデーモン（実際のモデル）

`qwen serve --port 8767 --token … --workspace …` を起動し（バンドルエントリなので、生成された `qwen --acp` 子プロセスは自己完結）、`scripts/acp-http-smoke.mjs` を実行：

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```

エラーパスもライブで確認：子プロセスが起動に失敗した場合、ブリッジのタイムアウトが接続ストリーム上の JSON-RPC エラーフレーム（`{"id":2,"error":{"code":-32603,…}}`）としてクライアントに現れ、ID相関 + 障害時の202/SSE分割を証明した。

### レビューの折り込み — ブリッジ発行の clientId（ライブ検証で発見）

最初のライブ実行では `session/prompt` が _"client id … is not registered for session"_ で失敗した。根本原因：`spawnOrAttach`/`loadSession` は、ブリッジが発行したことがない呼び出し元指定の clientId を**無視**し、新しいもの（`BridgeSession.clientId` で返される）をスタンプする。ディスパッチャは `sendPrompt` で接続自身の（未登録の）IDをエコーしていた。修正：`SessionBinding` にブリッジスタンプのIDを永続化し、セッション呼び出し（`sessionCtx`）ごとにそれをエコーする。上記の通り再検証済み。

---

## 11. レビューラウンド2 — 折り込み

2つの独立したレビュー（正確性/並行性 + プロトコル準拠/セキュリティ）と自己レビューを実施。すべての修正は拡張された vitest スイート（**18テスト**）と新しいライブスモーク実行（21個の `session/update` フレーム → `stopReason=end_turn`）で検証済み。

| #   | Severity | 発見事項                                                                                                                                                                                                                           | 修正                                                                                                                                                                                     |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**   | セッションストリームの**再接続が恒久的に機能しなかった**：`SessionBinding.abort` が一度作成され再利用されたため、ストリームクローズ時に永久に中断され、再接続時の `subscribeEvents(signal)` は既に中断されたシグナルを受け取り、イベントを受信しなかった。 | `attachSessionStream` はストリームごとに**新しい** `AbortController` をインストールするようになった（以前のストリームは閉じる）。`index.ts` はその新しいシグナルでポンプする。           |
| R2  | **P0**   | `await dispatcher.handle()` が `res.end(202)` の**後**に実行された；ブリッジ呼び出し（特に try/catch されていない `isResponse` パス）がスローされると、未処理の rejection として表面化し、デーモンクラッシュの可能性があった。 | `isResponse` パスを try/catch でラップ；`handle(...)` の `await` と `pumpSessionEvents(...)` に `.catch()` を追加。                                                                     |
| R3  | **P1**   | **接続→セッションの所有権が存在しない**：認証された任意の接続が、ワークスペース内の_任意の_ sessionId に対してセッション SSE を開いたり、プロンプトを送信できた（覗き読み取りが可能；未登録 clientId エラーによって偶然プロンプトのみブロックされていた）。 | `AcpConnection.ownedSessions` を `session/new`/`load`/`resume` で設定；セッションストリームは所有されていないIDに対して `403` を返し、セッション単位のPOSTは所有されていないIDに対して `INVALID_PARAMS` を返す（`requireOwned`）。 |
| R4  | **P1**   | `mountAcpHttp` のハンドルが破棄された → TTL スイープタイマーとライブ SSE ストリームがシャットダウン時にリークした。                                                                                                                | ハンドルを `app.locals` に格納；`runQwenServe` のクローズフックが `bridge.shutdown()` の前に `dispose()` を呼び出す（デバイスフローレジストリと同様）。                                   |
| R5  | **P1**   | **保留中のパーミッションリーク**：パーミッションが未解決のままセッション/接続を閉じると、ブリッジが投票を待機している状態でブロックされたままであった。                                                                             | `closeSessionStream`/`destroy` が、`onAbandonPending` を介して対応する保留中リクエストをキャンセル → `cancelAbandonedPermission`。                                                           |
| R6  | **P1**   | 接続前フレームバッファ（`connBuffer`/`binding.buffer`）に制限がなかった。                                                                                                                                                          | EventBus の `maxQueued` に合わせて最大256フレームに制限（最も古いものを削除）。                                                                                                           |
| R7  | **P2**   | `initialize` がクライアントが要求した `protocolVersion` を無視していた。                                                                                                                                                           | `min(requested, 1)` でネゴシエーションする。                                                                                                                                             |
| R8  | **P2**   | `Acp-Session-Id` ↔ `params.sessionId` の相互チェックがない（RFD §2.3）。                                                                                                                                                            | POST でそれらが一致することをアサート；不一致 → `INVALID_PARAMS`。                                                                                                                        |
| R9  | **P2**   | `session/cancel` のリクエスト形式（id あり）に応答がない；トップレベルの `_meta.qwen` が重複。                                                                                                                                      | id がある場合は応答する；`agentCapabilities._meta.qwen` は単一にする。                                                                                                                    |

### 受理/文書化（v1では未修正）

- **プロンプト結果と後続の `session/update` の順序** (P2)：`handlePrompt` は `sendPrompt` を待機してから結果フレームを書き込む一方、更新は同時にストリームされる。実際にはブリッジは `sendPrompt` が解決する前にすべての `session/update` をバスに公開し、両方とも1つの順序付けられた SSE 書き込みチェーンを共有するため、結果が最後に着地する（確認済み：21の更新の後に結果）。クライアントのリデューサーが敏感な場合、厳格なバリアは後で強化の可能性あり。
- **ブラウザの `EventSource` は `Authorization` を設定できない** — `/acp` GET ストリームはベアラーヘッダーを必要とするため、ブラウザは延期された WebSocket パス（§7）が必要；CLI/Node クライアントは影響なし。
- デーモンの実際の信頼境界は引き続き**ベアラートークン + 単一ワークスペースバインド**（REST サーフェスと同じ）；R3の所有権チェックは多層防御 + 契約の正確性であり、テナント境界ではない。

---

## 12. レビューラウンド3 — PR ボット折り込み (#4472)

2つの自動PRレビューアとサマリーボット。すべての修正はスイート（現在 **22テスト**）と新しいライブ実行（16個の `session/update` → `end_turn`）で検証済み。

| #   | Severity | 発見事項                                                                                                                                                                                                                               | 修正                                                                                                                                                                               |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **P0**   | `handlePrompt` の `AbortController` が中断されなかった — 切断/キャンセルしたクライアントがエージェントを実行したままにした（モデルクォータを消費し、セッション FIFO をブロック）。両方のボット + 5つのサブエージェントが指摘。          | `promptAbort` を `SessionBinding` に配置；`session/cancel` およびセッション/接続のティアダウン（`closeSessionStream`/`destroy`）で中断。                                           |
| B2  | **P0**   | `sessionCtx` に `fromLoopback` がない → すべての ACP パーミッション投票がリモートとして扱われ；`local-only` ポリシーがループバッククライアントを拒否していた。                                                                         | 初期化時にループバックを取得（カーネル `remoteAddress`、偽造不可なヘッダー）→ `AcpConnection.fromLoopback` → `sessionCtx` にスレッド化。                                           |
| B3  | **P0**   | SSE 書込失敗が静かに飲み込まれていた → ゾンビストリーム（ハートビートは発射するが、イベントが届かず、ログも出ない）。                                                                                                                 | 最初の書込失敗時にログを出力 + ストリームを閉じる。                                                                                                                                 |
| B4  | **P0**   | アイドルスイープが接続をログなしで破棄、かつ接続上限がなかった（initialize フラッドが可能）。                                                                                                                                        | スイープが各刈り取りをログ出力；`pumpSessionEvents` が `touch()` を呼び出す（長い静かなプロンプトは刈り取られない）；`maxConnections` 上限 (64) → `503`。                            |
| B5  | **P1**   | `sessionCtx` が、バインディングに clientId がない場合（未テスト、`FakeBridge` では常に発火）に、静かに接続の未登録 clientId にフォールバックしていた。                                                                               | スタンプされた clientId がない場合はスロー（不変条件違反）；`FakeBridge` がスタンプするようになった。                                                                               |
| B6  | **P1**   | `session/new                                                                                                                                                                                                                           | load                                                                                                                                                                              | resume` の `cwd` が未検証（REST は文字列/長さ/絶対パスを検証 — 増幅 DoS）。 | 共有の `parseOptionalWorkspaceCwd` を使用（文字列、≤4096、絶対パス）。 |
| B7  | **P1**   | `session/prompt` が未検証の `prompt` をブリッジに転送していた。                                                                                                                                                                          | `validatePrompt`（空でないオブジェクトの配列）を追加。REST と同一。                                                                                                                |
| B8  | **P1**   | ブリッジの生のエラーメッセージがクライアントにエコーされていた。                                                                                                                                                                     | `toRpcError` が既知のブリッジエラーをコード化されたクライアントセーフな形状にマッピング；不明なもの → 汎用 `Internal error`（完全な詳細は stderr に出力）。                         |
| B9  | **P1**   | `nextId` が負の連番を使用 — クライアントが正当に負の ID を使用すると `pending` で衝突する可能性があった。                                                                                                                            | デーモン発行の ID は文字列（`_qwen_perm_N`）に変更。クライアントの ID と重複しない。                                                                                                 |
| B10 | **P2**   | `resolveClientResponse` のパラメータ型が `JsonRpcError` を含んでいなかった；コネクションスコープの SSE ストリームに `onClose` がなかった；`DELETE` にヘッダーがない場合、静かに 202 を返していた；`SseStream.close` の `onClose` が try/catch の外で実行されていた；`session/load`・`resume`・`close` が未テスト。 | パラメータ型を `JsonRpcResponse` に拡張；コネクションストリームがクローズ時にログ出力；`DELETE` にヘッダーがない場合 → `400`；`onClose` を try/catch でラップ；ロード/レジューム/クローズ + DELETE-400 のテストを追加。 |

**対象外**（ベースブランチ `daemon_mode_b_main`、このdiffではない）— 2番目のレビューアは `acpAgent.ts`（`entryCount`/`entrySummary`/`sessionClose`）の型チェックエラーや、ベースブランチに起因するその他の既存項目を指摘した（#4353 で導入）。別途追跡中。ここでは触れない。

**まだ延期**（文書化済み）：接続所有権のための `DELETE`/接続所有権のための接続単位のシークレット（トークンが引き続き境界）；WebSocket + HTTP/2（§7）；厳格なプロンプト結果 vs 後続更新のバリア（§11）。

---

## 13. レビューラウンド4 — PR 折り込み（rebase onto #4469）

ブランチを `daemon_mode_b_main`（#4353 + #4469）にリベース — **クリーン、競合なし**。2人のPRレビューア（GPT-5 + qwen3.7-max）。スイートは現在 **25テスト**。ライブ再検証済み（125個の `session/update` → `end_turn`）。

| #   | Severity | 発見事項                                                                                                                                                                                                                     | 修正                                                                                                                                                                                                                  |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**   | ラウンド3の「SSE書込失敗処理」は文書化されたが実装されていなかった — `SseStream` は依然として呼び出し側に破棄を任せていた（ゾンビストリーム）。                                                                               | `writeRaw` がこれを担当するようになった：最初の書込拒否で一度ログを出力し `close()` する。`doWrite` も `'error'` をリッスンする（`'close'` まで待たずに即座に拒否）。`onClose` を try/catch でラップ。              |
| C2  | **P1**   | `fromLoopback` は初期化時のみ取得 + ヘルパーが REST より狭い → 後続の POST からの `local-only` 投票が誤判定される。                                                                                                          | リクエストごとのループバックを `handle`→`sessionCtx`/`resolveClientResponse` にスレッド化；`isLoopbackReq` を `127.0.0.0/8` + `::ffff:127.*` + `::1` に拡大（REST と一致）。                                      |
| C3  | **P1**   | エラールーティングが `params.sessionId` からストリームを推測 → コネクションスコープのメソッド（`session/load`/`resume`/`close`/`heartbeat`）の失敗が存在しないセッションストリームに誤ルーティング（静かに消失）。         | `CONN_ROUTED_METHODS` セットを導入；エラーのルーティングも成功パスと同様に行う。                                                                                                                                     |
| C4  | **P1**   | `bridge.detachClient` がティアダウン時に呼ばれなかった → 古いブリッジスタンプの client ID が `knownClientIds()`/有権者セットに残る。                                                                                         | レジストリが `DetachSessionFn` を受け取る；`closeSessionStream`/`destroy` が所有する各セッションをデタッチする（ベストエフォート）。                                                                                    |
| C5  | **P1**   | `session/close` が `bridge.closeSession` でスローした場合、ローカルクリーンアップをスキップしていた。                                                                                                                        | `closeSessionStream` を `finally` に移動。                                                                                                                                                                            |
| C6  | **P2**   | Windows の `cwd`（`C:\…`）が `startsWith('/')` で拒否されていた。                                                                                                                                                            | `path.isAbsolute`（プラットフォーム対応）を使用。REST と一致。                                                                                                                                                        |
| C7  | **P2**   | `protocolVersion` が `0`/負の値にネゴシエートされる可能性があった。                                                                                                                                                         | `Math.max(1, Math.min(requested, 1))` でクランプ；0/負/巨大/無効のテストを追加。                                                                                                                                      |
| C8  | **P2**   | `session/load`/`resume` が空の `sessionId` を受け入れていた。                                                                                                                                                                | 空の場合は `INVALID_PARAMS` で拒否。                                                                                                                                                                                  |
| C9  | **P2**   | 通知形式の `session/prompt` エラーが静かに消えていた。                                                                                                                                                                       | IDなしパスでログ出力。                                                                                                                                                                                                |
| C10 | **P2**   | セッション SSE がヘッダー/`retry:` の前にバッファされたフレームをフラッシュしていた。                                                                                                                                       | `attachSessionStream` の前に `open()` を実行。                                                                                                                                                                        |
| C11 | **P2**   | ローカルの `logStderr` が重複していた。                                                                                                                                                                                     | `utils/stdioHelpers` の共有 `writeStderrLine` を使用。                                                                                                                                                                |
| C12 | **P2**   | ドキュメントに `--no-acp-http` フラグ、`acp_http` 機能タグ、`fs/*` 転送が v1 に含まれていると記載されていた。                                                                                                                 | ドキュメントを出荷されたサーフェスに合わせて修正（環境変数トグルのみ；`fs/*`+`terminal/*` + フラグ + タグは延期と明記）。                                                                                            |
Still deferred（変更なし）：WebSocket + HTTP/2、`DELETE`/所有権のための接続ごとのシークレット（トークン＋シングルワークスペースが境界のまま）、厳密なプロンプト結果の順序付けバリア、`as never` ブリッジ境界キャスト（対象を限定し、アダプタータイプのフォローアップで指摘済み）。

---

## 14. レビューラウンド5 — PR 折り込み

もう1件のレビュアーパス（qwen3.7-max）。スイート **26 テスト**、ライブで再検証済み。

| #   | 重大度 | 発見事項                                                                                                                                                                                                                                                                                      | 修正内容                                                                                                                                                                                              |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **P0** | `resolveClientResponse` が `respondToSessionPermission` を呼び出す前に保留中のエントリを削除していた。不正な形式の vote（`result: {}`）によりブリッジメディエーターがスローされるが、保留エントリは既に削除されているため、`abandonPendingForSession` による後片付けでキャンセルできず、エージェントのプロンプトが解決しない vote でハングする（トークン所持者は1回の不正な POST でセッションを停止できる）。 | vote を try/catch でラップし、失敗時は `cancelAbandonedPermission` にフォールバックしてメディエーターが常に解放されるようにする。不正な vote パスをカバーする新しいテストを追加。               |
| D2  | **P1** | セッションストリームの `onClose` がイベントポンプのみを中止し、`binding.promptAbort` を中止していなかった。クライアントの切断（タブ閉じ / ネットワーク断）により、実行中のプロンプトがアイドル TTL まで（クォータ + FIFO のまま）動作し続けた。                                                     | `onClose` がセッションの `promptAbort` も中止するようにした。                                                                                                                                           |
| D3  | **P1** | `pumpSessionEvents` が reject されたとき、`.catch` はログを出力するだけだった。SSE ストリームはハートビートを送信し続けるが、何も配信しない（ゾンビ、再接続シグナルなし）。                                                                                                                  | `.catch` が `closeSessionStream(sessionId)` も呼ぶようにした。                                                                                                                                       |

---

## 15. レビューラウンド6 — PR 折り込み

もう1件のレビュアーパス（qwen3.7-max）。スイート **28 テスト**、ライブで再検証済み。

| #   | 重大度 | 発見事項                                                                                                                                                                                                        | 修正内容                                                                                                                                                                                                |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **P0** | `handlePrompt` が `binding.promptAbort` を上書きする際、以前のコントローラーを中止しなかった。1つのセッションに対して2つの `session/prompt` が同時に発生すると、最初のプロンプトが孤立する（ブリッジ FIFO で完了まで実行され、`session/cancel` で中止不可能）。 | 新しい `promptAbort` をインストールする前に、以前の `promptAbort` を中止する。テスト追加。                                                                                                           |
| E2  | **P0** | `subscribeEvents` がスローするパスで、`stream_error` の通知を送信してから `return` されていた（解決）。呼び出し側の `.catch` が発火せず、ゾンビ SSE ストリーム（ハートビートのみ、イベントなし、再接続シグナルなし）が残る。 | 通知後に再スローし、呼び出し側の `.catch` でストリームが閉じられるようにする。テストでプロンプトのクローズをアサート。                                                                               |
| E3  | **P1** | SSE のハートビートが接続をアクティブとマークしなかった。30分以上中間イベントのない長時間のプロンプトがアイドルリープされ、ストリームとプロンプトが強制終了される。                                                  | `SseStream` が `onHeartbeat` フックを受け取るようにし、両方の GET ハンドラが `() => conn.touch()` を渡すようにする。                                                                                   |
| E4  | **P2** | `pumpSessionEvents` の `.catch` が sessionId で閉じていた。スローとマイクロタスクの間に再接続が発生すると、新しいストリームが強制終了される可能性がある。                                                        | アイデンティティガード：`binding.stream` が現在のストリームである場合のみ閉じる。                                                                                                                        |
| E6  | **P2** | `sendSession` が自動的にバインディングを作成していた。`closeSessionStream` 後の遅延した pump/reply フレームがゴーストバインディングを復活させ、最大256フレームを永久にバッファリングする。                         | `sendSession` をルックアップ専用に変更：セッションにライブバインディングがない場合、フレームをドロップする。                                                                                           |
| E5  | 受諾済み | `session/load`/`resume` が、別のライブ接続がセッションを所有している場合に拒否しない（「ハイジャック」）。                                                                                                          | **受諾、変更なし：** デーモンの信頼境界はベアラートークン + シングルワークスペースバインディングであり、マルチクライアントアタッチは意図的（ブリッジは設計上マルチクライアント、REST も同じ特性を持つ）。トークン所持者は REST を介して得られない能力を得ることはない。他のトークン境界アイテム（DELETE 所有権、§13）とともに追跡。 |

---

## 16. レビューラウンド7 — PR 折り込み

もう1件のレビュアーパス（qwen3.7-max）。スイート **30 テスト**、ライブで再検証済み。

| #   | 重大度 | 発見事項                                                                                                                                                                                               | 修正内容                                                                                                                                                    |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0** | 同時 `session/close` の TOCTOU：`ownedSessions.delete` が `finally` でのみ実行されていた（await の後）。そのため、2つの同時クローズが両方とも `requireOwned` を通過 → 2つ目に誤解を招くエラー + 冗長なブリッジクローズ。 | await の前に所有権ゲートを同期的に削除。ブリッジクローズは1回のみ実行される。テスト追加。                                                                    |
| F2  | **P1** | ポンプライフサイクル：CLEAN なイテレータ終了（サブプロセス終了、`done`）で解決 → `.catch` が発火せず → ゾンビストリームが発生。また、ストリーム途中のイテレータエラーで `stream_error` が送信されなかった。   | `pumpSessionEvents` がループ全体をラップ（同期エラーとストリーム途中のエラーは `stream_error` を送信してから再スロー）。コンシューマーの `.then(onDone, onErr)` が両方のパスでストリームを閉じる（アイデンティティガード付き）。テスト追加。 |
| F3  | **P2** | 503 接続キャップ拒否に stderr ログがなかった。                                                                                                                                                          | cap 値を含む `writeStderrLine` を追加。                                                                                                                      |
| F4  | **P2** | `_qwen/notify stream_error` のスプレッドにより `event.data.kind` が判別子を隠していた。                                                                                                                    | スプレッドを先に行い、その後 `kind: 'stream_error'` を設定。                                                                                                 |
| F5  | **P2** | `MAX_WORKSPACE_PATH_LENGTH` が正規の `fs/paths.js` と異なる値（`= 4096`）で再宣言されていた。                                                                                                             | `../fs/paths.js` からインポートする（乖離をなくす）。                                                                                                        |
| F6  | **P2** | `isObjectParams` が `json-rpc.isObject` と重複していた。                                                                                                                                                 | `isObject` をインポートする。                                                                                                                               |
| F7  | **P2** | `index.ts`/`sse-stream.ts` で生の `process.stderr.write` を使用していたが、他の場所では `writeStderrLine` を使用していた。                                                                                 | モジュール全体で `writeStderrLine` に統一。                                                                                                                  |

---

## 17. REST 等价对齐 + 扩展方案审计落地（round 8）

目标：让 `/acp` 成为 REST+SSE 的**等价替代**。本批基于审计结论重构扩展方案，并补齐**所有 bridge 已暴露**的能力；bridge 尚未拥有的能力（文件 I/O、设备流、agents/memory CRUD）按架构正确性要求**先由 acp-bridge 补齐**（见 §17.3）。

### 17.1 扩展方案审计 → 落地（替换 §5 的旧方案）

依据**仓库实装 SDK `@agentclientprotocol/sdk@0.14.1`**（非仅官网）核对：

- `session/set_config_option` 是**一等（非 `unstable_`）方法**，请求 `{sessionId, configId, value}`，`category` 含 `model`/`mode`/`thought_level`；而 `set_model` 仍走 `unstable_setSessionModel`。
- 规范保留 `_` 前缀给扩展，示例为域风格 `_zed.dev/…`；厂商数据放 `_meta` 按域名分键。

落地：

- **命名空间 `_qwen/` → 反向域名 `_qwen/`**；`_meta` 统一 `_meta:{ "qwen": … }`（含 `initialize` 能力广告与 `session/request_permission` 的 requestId）。
- **模型 + 审批模式 → 标准 `session/set_config_option`**（`configId:"model"|"mode"`），路由到现有 `bridge.setSessionModel`/`setSessionApprovalMode`；`session/new` 结果**广告 `configOptions`**（取自子进程会话状态 `getSessionContextStatus().state.configOptions`，已是 ACP 形状）。**删除**厂商 `_qwen/session/set_model`。
- REST(http+sse) **无需同步修改**：两 transport 共用同一 bridge，状态天然一致。

### 17.2 本批新增的 `/acp` 方法（bridge 已支持，1:1 对齐 REST）

| REST                                                  | `/acp`                                             | bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | **标准** `session/set_config_option`（model/mode） | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                  |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus        |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                    |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                              | getWorkspace\*Status                     |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                            |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                  |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                         |

（既有：session/new·load·resume·close·list·prompt·cancel、heartbeat、permission、events 已对齐。）

### 17.3 仍缺口 → 要求 acp-bridge 先补齐（架构正确性）

REST 的 **文件 I/O**（`/file /glob /list /stat /file/write /file/edit`）、**设备流登录**（`/workspace/auth/*`）、**agents CRUD**（`/workspace/agents`）、**memory CRUD**（`/workspace/memory`）目前**不在 `HttpAcpBridge` 上**——REST 路由直接调 route 级服务（`WorkspaceFileSystemFactory`、`DeviceFlowRegistry`、`SubagentManager`、`writeWorkspaceContextFile`），绕过了 bridge。

**决策（采纳评审/owner 意见）**：不让 `/acp` transport 再去直连这些 route 级服务（那会复制 REST 的架构漂移、并使 transport 耦合翻倍）。**正确做法是先在 `@qwen-code/acp-bridge` 的 `HttpAcpBridge` 上补齐这些能力**（如 `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`、`startDeviceFlow`/`pollDeviceFlow`、`listAgents`/`upsertAgent`/`deleteAgent`、`readMemory`/`writeMemory`），让 REST 与 `/acp` 都经由 bridge。届时 `/acp` 再加 `_qwen/fs/*`、`_qwen/auth/*`、`_qwen/workspace/agent*`、`_qwen/workspace/memory*`（文件读因无标准 ACP client→agent 方法，属合法厂商扩展）。

**完整等价 = 本批（bridge 已有能力）+ acp-bridge 补齐缺口后的后续批**。

---

## 18. レビューラウンド9 — PR 折り込み

| #   | 重大度               | 発見事項                                                                                                                                                                                                                                                                                 | 修正内容                                                                                                                                                                                                         |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **P1（回帰）**       | セッションストリームの再接続が実行中のプロンプトを中止していた：`attachSessionStream` が新しいストリームをインストールする前に古いストリームを閉じ、古いストリームの `onClose` が無条件に `promptAbort` を中止していた。そのため、再接続するクライアント（ネットワークの瞬断 / ローミング）は実行中のプロンプトを失っていた。 | 古いストリームを閉じる前に新しいストリームをインストールする。`onClose` のプロンプト中止をアイデンティティガードする（これがセッションのライブストリームである場合のみ中止）。テスト追加（プロンプトが再接続後も存続することを確認）。 |
| G2  | **P2**              | `session/cancel` が `undefined` を `CancelNotification` のボディとして渡しており、REST が転送するクライアント指定のキャンセルフィールド（reason/context）をドロップしていた。                                                                                                             | `{ ...params, sessionId }` を転送する（REST をミラーリング）。                                                                                                                                                 |

最新の `daemon_mode_b_main`（#4473/#4483/#4484/#4500）にリベース、競合なし。スイート **33 テスト**、ライブで再検証済み。

---

## 19. ロードマップ / 今後の PR（忘備録）

本 PR（#4472）= ACP Streamable HTTP transport + **全 bridge バックアップ能力の対応** + 公式拡張スキーム。**ready** 状態に移行。`/acp` が「REST+SSE と完全に等価」になるにはあと：

1. **Follow-up PR 1 — acp-bridge 能力拡充（前提 / bridge-first）**：`HttpAcpBridge` にファイル I/O、デバイスフロー、agents CRUD、memory CRUD メソッドを追加。REST ルートは bridge 経由に変更（ルートレベルサービスへの直接接続によるドリフトを解消）。
2. **Follow-up PR 2 — `/acp` 残りの対応（PR 1 に依存）**：`_qwen/fs/*`、`_qwen/auth/*`、`_qwen/workspace/agent*`、`_qwen/workspace/memory*` → REST と完全に等価。

追跡：#3803（未解決の決定事項）、#4175（Mode B ロードマップ）にコメント済み。
Deferred 項目の強化は PR 説明「既知の deferred」を参照。

---

## 20. 拡張名前空間のリネーム + SDK トランスポート分析（ラウンド 11）

- **名前空間 `_qwen.ai/` → `_qwen/`**: ACP の唯一のハードルールは先頭の `_` です。`_zed.dev/` ドメインセグメントは例示による慣習であり、 MUST ではありません。`qwen` は識別性が高いため、より短いベア形式を使用します。`_meta` キーも同様に `"qwen"` とします。（実際のエージェントの調査：Zed/gemini-cli は主に標準メソッドに `_meta` を使用し、ACP 自身の `unstable_*` を使用。ベアのカスタム `_` メソッドは稀です — 私たちの `_qwen/*` は標準に相当するものがない真に新しいワークスペース/セッション操作であるため、`_` メソッドが適切なツールです。）
- **なぜ自作トランスポートか（SDK ベースではない理由）**: TS SDK は `ndJsonStream`（stdio）のみを出荷しています。RFD #721 HTTP は SDK フェーズ3（未実装）です。SDK の `Connection` は単一双方向ストリームですが、私たちのトランスポートはマルチストリーム（POST + 接続 SSE + セッションごとの SSE）であり、sessionId による出力デマルチプレクスが必要です。これはディスパッチャーがルーティング時に既に認識しています。SDK への完全な書き換えはそのモデルと戦うことになり、大量のコード（ブリッジ変換、SSE ライフサイクル、所有権、EventBus→JSON-RPC）を削減できません。**実用的な改善（候補フォローアップ）**: パラメーター検証に SDK の Zod スキーマバリデーター + 型を採用し、自作トランスポートは維持する。`extMethod('_qwen/…')` を使用する SDK クライアントは、私たちのハンドラと相互運用可能です（ワイヤー形状は同一）。