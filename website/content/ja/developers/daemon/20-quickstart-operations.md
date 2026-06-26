# クイックスタートと運用

このページでは、**`qwen serve` の起動方法、動作確認方法、そして `qwen serve` からリッスンサーバーに至る内部コールチェーンの内容**に焦点を当てます。アーキテクチャ、コンポーネント、ワイヤープロトコルの詳細は、他のデーモンの詳細解説ページにあります。

## 1. 最短パス

```bash
qwen serve
```

出力:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

ブラウザで `http://127.0.0.1:4170/demo` を開くと、デバッグコンソール（チャットUI、イベントストリーム、ワークスペースの検査）を確認できます。デフォルトのループバック開発モードでは、`/demo` は `packages/cli/src/serve/server.ts` のループバックルートブランチにおいて `bearerAuth` の**前に**登録されるため、トークンは不要です。

## 2. 起動レシピ

```bash
# 1. Local dev default (loopback, no token)
qwen serve

# 2. Explicit workspace + ephemeral port
qwen serve --workspace /path/to/repo --port 0

# 3. Hardened loopback development (force bearer even on loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Expose to LAN (non-loopback requires a token)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Tune for many sessions and a larger replay ring
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Multi-client collaboration + strict MCP budget
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Start with a consensus policy configured in settings.json
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Debug logging
QWEN_SERVE_DEBUG=1 qwen serve

# 9. Disable the F2 pool (fallback to per-session MCP clients)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Allow browser web UI cross-origin access
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Prompt deadline + SSE idle timeout
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Keep the ACP child warm after the last session closes
qwen serve --channel-idle-timeout-ms 60000

# 13. Enable HTTP rate limiting
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

強化ループバックレシピ (3) では、`/demo` は `bearerAuth` の後に登録されます。通常のブラウザナビゲーションでは認証ヘッダーが必要なので、代わりに curl や SDK スクリプトを使用してください。

## 3. 全起動フラグ

CLI は **`packages/cli/src/commands/serve.ts`** で定義されています:

| フラグ                                    | 型                            | デフォルト                                   | 必須条件                                | 効果                                                                                                                                                                                                                    |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | TCP ポート。`0` は OS 割り当てのエフェメラルポートを意味します。                                                                                                                                                        |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | ループバック以外ではトークン必須              | バインドアドレス。ループバック値: `127.0.0.1`、`localhost`、`::1`、`[::1]`。`[::1]` の角括弧は自動で除去されます。`host:port` 形式の入力は拒否され、`--port` の使用が案内されます。                                        |
| `--token <s>`                           | string                         | 環境変数 / なし                               | ループバック以外 および `--require-auth`        | Bearer トークン。一度だけトリムされます。**`/proc/<pid>/cmdline` に表示されるため、`QWEN_SERVER_TOKEN` の使用を推奨します**。起動時の stderr にもこの警告が出力されます。                                                                                |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | アクティブセッションの上限。超過すると 503 を返します。`0` は無制限。`NaN` / 負の値はエラーになります。                                                                                                                     |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | セッションごとに受け入れ可能な保留中/実行中のプロンプト数の上限。超過すると 503 を返します。`0` / `Infinity` は無制限。負の値や整数以外の値はエラーになります。                                                               |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | バインドするワークスペース。**絶対パスである必要があり、存在し、かつディレクトリである必要があります**。起動時に `canonicalizeWorkspace` で一度正規化されます。`cwd` が一致しない `POST /session` は `400 workspace_mismatch` を返します。 |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | リスナーレベルの `server.maxConnections`。`0` / `Infinity` は無制限。`NaN` / 負の値は、フェイルオープンを防ぐために起動を失敗させます。                                                                              |
| `--require-auth`                        | boolean                        | `false`                                      | トークン必須                           | ループバック **および** `/health` に bearer 認証を拡張します。トークンなしでは起動しません。                                                                                                                             |
| `--enable-session-shell`                | boolean                        | `false`                                      | トークン必須                           | `POST /session/:id/shell` による直接実行を有効にします。呼び出し元はセッション固有の `X-Qwen-Client-Id` も送信する必要があります。                                                                                                        |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | セッションごとの SSE リプレイリングの深さ。ソフトキャップは `MAX_EVENT_RING_SIZE = 1_000_000`。範囲外の値はブリッジ構築時にエラーになります。                                                                               |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | ステージ 1 のブリッジモード: デーモンが多重化する 1 つの `qwen --acp` 子プロセス。ステージ 2 のインプロセスモードはまだ実装されていません。`--no-http-bridge` はフォールバックし、stderr に出力します。                                            |
| `--mcp-client-budget <n>`               | number                         | なし                                         | `mcp-budget-mode=enforce` の場合必須   | ワークスペース MCP クライアントの上限。正の整数である必要があります。                                                                                                                                                 |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | 予算が設定されている場合は `warn`、それ以外は `off` | `enforce` は `--mcp-client-budget` が必要 | `enforce` は拒否、`warn` は 75% で警告、`off` は監視のみ。                                                                                                                                               |
| `--allow-origin <pattern>`              | 繰り返し可能な文字列              | なし                                         | -                                        | デフォルトの Origin 拒否を置き換える CORS 許可リスト。`*` にはトークンが必要です。                                                                                                                                         |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | localhost / プライベートネットワークの認証プロバイダ `baseUrl` のインストールを許可します。信頼できるローカル開発でのみ使用してください。                                                                                                      |
| `--prompt-deadline-ms <n>`              | number                         | なし                                         | -                                        | サーバー側のプロンプト実行時間制限（ミリ秒）。タイムアウトはプロンプトを中断します。                                                                                                                                                  |
| `--writer-idle-timeout-ms <n>`          | number                         | なし                                         | -                                        | SSE 接続ごとのアイドルタイムアウト（ミリ秒）。                                                                                                                                                                                |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | 最後のセッションが閉じた後も ACP 子プロセスを維持します。`0` は即座に解放します。                                                                                                                               |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | セッションリーパーのスキャン間隔。`0` で無効化。                                                                                                                                                                        |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | 切断されたセッションのアイドルタイムアウト。`0` で無効化。                                                                                                                                                                   |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | 環境変数 / off                               | -                                        | 階層ごとの HTTP レート制限を有効/無効にします。                                                                                                                                                                      |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | ウィンドウあたりのプロンプトリクエスト数。                                                                                                                                                                                           |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | ウィンドウあたりの変更リクエスト数。                                                                                                                                                                                         |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | ウィンドウあたりの読み取りリクエスト数。                                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | レート制限ウィンドウの長さ（ミリ秒）。`>= 1000` である必要があります。                                                                                                                                                          |

## 4. 環境変数

| 環境変数                            | 対応するフラグ / 効果                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | `--token` と同等。`--token` が優先されます。起動時に一度トリムされ、`cat token.txt` の末尾の改行を除去します。                                                         |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (大文字小文字を区別しない) で verbose stderr ログを有効にします。                                                                                             |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` でワークスペース MCP プールを完全に無効化し、セッションごとの `McpClientManager` にフォールバックします。機能は `mcp_workspace_pool` / `mcp_pool_restart` を広告しなくなります。 |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | ACP 子プロセスの内部予算入力。CLI は `--mcp-client-budget` から `childEnvOverrides` 経由で生成します。親プロセスの env フォールバックではありません。                  |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | ACP 子プロセスの内部予算モード。CLI は `--mcp-budget-mode` から `childEnvOverrides` 経由で生成します。親プロセスの env フォールバックではありません。                     |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` の env フォールバック。                                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` の env フォールバック。                                                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | ACP 子プロセスによって読み取られます。カンマ区切りのプール転送許可リスト。デフォルトは `stdio,websocket`。                                                                        |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | ACP 子プロセスによって読み取られます。プールエントリのアイドル排出遅延。デフォルトは `30000`、`1000..600000` ミリ秒にクランプされます。                                                                   |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` でレート制限を有効にします。CLI フラグが優先されます。                                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` の env フォールバック。                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` の env フォールバック。                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` の env フォールバック。                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` の env フォールバック。                                                                                                                              |

ハンドルごとの env オーバーライドは意図的です。同じプロセスで 2 つのデーモンが実行されていても `process.env` で競合しません。`defaultSpawnChannelFactory` はスポーン時に env をスナップショットします。

## 5. `settings.json` も読み込まれる

起動時に `loadSettings(boundWorkspace)` が一度呼ばれます:

| キー                         | 型                                                               | 動作                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | `BridgeOptions.permissionPolicy` を設定します。**起動時に `validatePolicyConfig` で検証**します。不明な値は静かにフォールバックせず、`InvalidPolicyConfigError` をスローします。 |
| `policy.consensusQuorum`    | 正の整数                                                           | `consensus` ポリシー用の N。デフォルトは `floor(M/2)+1` です。非コンセンサスポリシーで設定された場合は無視され、起動時に stderr に警告が記録されます。                              |
| `context.fileName`          | string                                                             | `getCurrentGeminiMdFilename()` をオーバーライドし、`POST /workspace/init` が書き込むファイルを制御します。                                                                          |
| `tools.disabled`            | string[]                                                           | 次の ACP 子プロセスのスポーンに影響を与える前に、`normalizeDisabledToolList()` で正規化されます（トリム、空エントリの削除、重複排除）。                                           |
| `tools.approvalMode`        | string                                                             | デフォルトのセッション承認モード。                                                                                                                                           |
| `telemetry`                 | object                                                             | OTel 設定: `enabled`、`otlpEndpoint`、`otlpProtocol`、シグナルごとのエンドポイントなど。詳細は [`17-configuration.md`](./17-configuration.md) を参照。                       |

設定の I/O 失敗（例: 不正な JSON）はデフォルトにフォールバックします。`InvalidPolicyConfigError` は例外で、ポリシーの設定ミスは起動を明示的に失敗させます。

## 6. 起動拒否シナリオ (明示的な失敗)

`run-qwen-serve.ts` は、以下の場合にフォールバックする代わりに意図的にエラーをスローします:

| シナリオ                                                                      | エラープレフィックス                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| トークンなしでのループバック以外のバインド                                               | `ループバックアドレス以外でのバインドを拒否: ベアラートークンが必要です`                                                       |
| `--require-auth` が指定されているがトークンがない                                      | `--require-auth が設定されているが、ベアラートークンがないため起動を拒否します`                                     |
| `--workspace` が存在しない、ディレクトリではない、または絶対パスでない               | `--workspace が無効です ...`                                                                           |
| `--workspace` の stat パーミッション拒否                                           | `--workspace が無効です ...: パーミッションが拒否されました`                                                        |
| `--mcp-client-budget` が正の整数でない                                           | `正の整数である必要があります`                                                                        |
| `--mcp-budget-mode=enforce` で予算が設定されていない                              | `有効な mcpClientBudget が必要です`                                                               |
| `--hostname` が `localhost:4170` のように書かれている                               | `"host:port" の組み合わせのように見えます。--port を使用してください`                                                  |
| `--hostname [::1]:8080`                                                       | `--hostname が無効です ... 角括弧は IPv6 リテラルを示していますが、値がクリーンな [addr] 形式ではありません` |
| `--max-connections` が `NaN` または負の値                                      | `0 以上である必要があります`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | ブリッジ構築中にスローされます                                                                   |
| `--allow-origin '*'` でトークンがない                                            | `--allow-origin '*' が設定されているがベアラートークンが設定されていないため起動を拒否します`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` が正の整数でない             | `正の整数である必要があります`                                                                        |
| 不明な `policy.permissionStrategy` または 0 以下の `policy.consensusQuorum`  | `InvalidPolicyConfigError`                                                                          |
## 7. cURL 動作確認チェックリスト

```bash
# 1. Liveness
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep health
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capabilities
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Env snapshot (secrets only report presence)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP pool / budget snapshot
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Create a session
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. Tail SSE (replace <sid>)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Demo page
open http://127.0.0.1:4170/demo
```

Bearer 認証が有効な場合は、すべてのリクエストに `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` を追加してください。

## 8. デモページは使えますか？

**はい。** これは `packages/cli/src/serve/demo.ts` の `getDemoHtml(port)` によって実装されており、外部依存のない自己完結型の HTML です。

| 起動モード                          | `/demo` が登録される場所                                                                     | ブラウザからの直接アクセス                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `--require-auth` なしの Loopback     | `server.ts` の loopback 事前認証ルートブランチ（`bearerAuth` **より前**）                     | トークンなしで動作                                          |
| `--require-auth` ありの Loopback     | `server.ts` の認証後ルートブランチ（`bearerAuth` **より後**）                                 | 通常のブラウザでは使いにくい。cURL または SDK を使用のこと。 |
| Non-loopback バインド                | `server.ts` の認証後ルートブランチ（`bearerAuth` **より後**）                                 | 同上                                                        |

CSP は `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` で、さらに `X-Frame-Options: DENY` が設定されています。このページは `'self'`（デーモン）に対してのみフェッチでき、外部スクリプトやスタイルを読み込むことはできません。

## 9. `qwen serve` からリスニングサーバーまでのコールチェーン

```text
qwen serve
   |
   v (process)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs assembly)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (handler)
commands/serve.ts                  handler(argv) - boot pre-checks
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # lazy load
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- trim token
   |  |- hostname mismatch fallback
   |  |- auth preflight
   |  |- workspace validation + canonicalization
   |  |- MCP budget validation + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - builds Express app (**does not listen**)
   |  |- middleware chain (Host allowlist / CORS / bearerAuth / mutation gate / rate limit)
   |  |- route mounting (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- write "qwen serve listening on ..."
   |  |- register SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // block forever until signal
```

重要な事実:

- **`createServeApp` はアプリケーションを構築するだけで、リッスンは行いません。** この関数は、ミドルウェアとルートがマウントされた `express()` インスタンスを返します。呼び出し元が `app.listen()` を管理します。`server.test.ts` では、約 25 のテストケースでこのようにファクトリを使用しているため、ファクトリは意図的にライフサイクルを管理しません。
- **`() => actualPort` は遅延クロージャです。** `actualPort` は `app.listen` のコールバック内で割り当てられます。`hostAllowlist` ミドルウェアはオンデマンドでこれを読み取るため、エフェメラルポート（`--port 0`）でも `Host` ヘッダーが正しくゲートされます。
- **`await blockForever()` は意図的なものです。** `yargs.parse()` が解決すると、CLI のトップレベルはインタラクティブな TUI エントリポイント（`gemini.tsx`）にフォールスルーします。SIGINT / SIGTERM は `runQwenServe` の `onSignal` パスを通じて終了します。

## 10. HTTP ルートファイルの分割

メインのアセンブリは `server.ts` の `createServeApp()` 内で行われ、4 つのモジュール化されたルートファイルをマウントします。

| ルート                                                                                       | ファイル                                                     | マウントエントリポイント                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| `/health`, `/demo`, `/capabilities`, すべてのセッションルート, デバイスフロー, 許可投票, SSE, シングルサーバー MCP 再起動 | `packages/cli/src/serve/server.ts`                          | `createServeApp()` 内で直接登録                  |
| `/workspace/memory` (GET/POST)                                                               | `packages/cli/src/serve/workspace-memory.ts`                | `mountWorkspaceMemoryRoutes()`                   |
| すべての `/workspace/agents` CRUD ルート                                                     | `packages/cli/src/serve/workspace-agents.ts`                | `mountWorkspaceAgentsRoutes()`                   |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                        | `packages/cli/src/serve/routes/workspace-file-read.ts`      | `registerWorkspaceFileReadRoutes()`              |
| `POST /file/write`, `/file/edit`                                                             | `packages/cli/src/serve/routes/workspace-file-write.ts`     | `registerWorkspaceFileWriteRoutes()`             |

完全なルートとワイヤプロトコルのリファレンスは [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md) を参照してください。アーキテクチャについては [`01-architecture.md`](./01-architecture.md) を参照してください。

## 11. グレースフルシャットダウン vs ハードシャットダウン

- **1 回目の SIGINT / SIGTERM** -> `runQwenServe` の `onSignal` -> 二段階のグレースフルシャットダウン:
  1. `bridge.shutdown()`: 各チャネルに `KILL_HARD_DEADLINE_MS`（10 秒）が与えられ、その後 `channel.kill()` が実行されます。
  2. `server.close()`: 処理中のリクエストをドレインし、`SHUTDOWN_FORCE_CLOSE_MS`（5 秒）が経過すると `closeAllConnections()` をトリガーし、その後さらに 2 秒の期限が適用されます。
- **終了処理中に 2 回目の SIGINT / SIGTERM** -> `bridge.killAllSync()` が同期的にすべての ACP 子プロセスに SIGKILL を送信し、`process.exit(1)` を呼び出してゾンビプロセスを防止します。

`runQwenServe` が返す `RunHandle.close()` は、組み込み用途やテストのためのプログラム上の同等機能です。

## 12. 組み込み呼び出し（CLI を経由しない）

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // ephemeral
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... call handle.bridge directly or access handle.server
await handle.close(); // programmatic shutdown
```

または、Express アプリを直接取得して自分でリッスンすることもできます:

```ts
import { createServeApp } from '@qwen-code/qwen-code/serve';

const app = createServeApp(
  {
    port: 0,
    hostname: '127.0.0.1',
    mode: 'http-bridge',
    maxSessions: 20,
  },
  () => 0,
  {
    /* deps: bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

注意: `createServeApp` を直接呼び出す場合、デフォルトの `fsFactory.trusted = false` になります。エージェント側の ACP `writeTextFile` は `untrusted_workspace` として拒否され、stderr に警告が 1 回出力されます。明示的に信頼を設定した `deps.fsFactory` を注入するか、`deps.bridge` を注入するか、または信頼ゲートされたデフォルトの動作を受け入れてください。

## 13. デバッグレシピ

デバッグセクションは [`19-observability.md`](./19-observability.md) を参照してください。よく使うコマンドは次のとおりです:

```bash
# Is the daemon alive?
curl http://127.0.0.1:4170/health

# Which capabilities are advertised?
curl -s http://127.0.0.1:4170/capabilities | jq

# Daemon-host readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Tail live SSE
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Verbose logs
QWEN_SERVE_DEBUG=1 qwen serve
```

## 参考資料

- CLI エントリ: `packages/cli/src/commands/serve.ts`
- ブートストラップ: `packages/cli/src/serve/run-qwen-serve.ts`
- Express ファクトリ: `packages/cli/src/serve/server.ts`
- ミドルウェア: `packages/cli/src/serve/auth.ts`
- ブリッジファクトリ: `packages/acp-bridge/src/bridge.ts`
- デモページ HTML: `packages/cli/src/serve/demo.ts`
- ユーザードキュメント: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- ワイヤプロトコル: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)