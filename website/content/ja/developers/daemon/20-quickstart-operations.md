# クイックスタートと運用

このページでは、**`qwen serve` の起動方法、動作確認の手順、および `qwen serve` からリスニングサーバーまでの内部呼び出しチェーン**に焦点を当てます。アーキテクチャ、コンポーネント、ワイヤープロトコルの詳細については、他のデーモン詳細ページを参照してください。

## 1. 最短手順

```bash
qwen serve
```

出力:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

ブラウザで `http://127.0.0.1:4170/demo` を開くと、デバッグコンソール（チャット UI、イベントストリーム、ワークスペース検査）が表示されます。デフォルトのループバック開発モードでは、`packages/cli/src/serve/server.ts` のループバックルートブランチにおいて `/demo` は `bearerAuth` の**前**に登録されるため、トークンは不要です。

## 2. 起動レシピ

```bash
# 1. ローカル開発デフォルト (ループバック、トークンなし)
qwen serve

# 2. ワークスペース指定 + エフェメラルポート
qwen serve --workspace /path/to/repo --port 0

# 3. 強化されたループバック開発 (ループバックでも bearer を強制)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. LAN に公開 (非ループバックはトークン必須)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. 多数のセッションと大きなリプレイリング向けのチューニング
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. マルチクライアント協調 + 厳密な MCP バジェット
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. settings.json でコンセンサスポリシーを設定して起動
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. デバッグログ
QWEN_SERVE_DEBUG=1 qwen serve

# 9. F2 プールを無効化 (セッションごとの MCP クライアントにフォールバック)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. ブラウザ Web UI のクロスオリジンアクセスを許可
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. プロンプトデッドライン + SSE アイドルタイムアウト
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. 最後のセッションが閉じた後も ACP 子プロセスをウォームに保つ
qwen serve --channel-idle-timeout-ms 60000

# 13. HTTP レート制限を有効化
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

強化されたループバックレシピ (3) では、`/demo` は `bearerAuth` の後に登録されます。通常のブラウザナビゲーションには認証ヘッダーが必要なため、curl または SDK スクリプトを使用してください。

## 3. 全起動フラグ

CLI は **`packages/cli/src/commands/serve.ts`** で定義されています:

| フラグ                                    | 型                           | デフォルト                                      | 必須条件                            | 効果                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | TCP ポート。`0` は OS が割り当てるエフェメラルポートを意味します。                                                                                                                                                                       |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | 非ループバックはトークン必須              | バインドアドレス。ループバック値: `127.0.0.1`、`localhost`、`::1`、`[::1]`。`[::1]` のブラケットは自動的に除去されます。`host:port` 形式の入力は `--port` を使うよう案内するエラーが返されます。                    |
| `--token <s>`                           | string                         | env / なし                                   | 非ループバックおよび `--require-auth`        | Bearer トークン。一度トリムされます。**`/proc/<pid>/cmdline` に表示されるため、`QWEN_SERVER_TOKEN` の使用を推奨します**。起動時の stderr にも警告が表示されます。                                                                                |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | アクティブセッションの上限。超過した場合の spawn は 503 を返します。`0` は無制限。`NaN` または負の値はエラーになります。                                                                                                                     |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | セッションごとの受付済み・保留中・実行中プロンプトの上限。超過すると 503 を返します。`0` / `Infinity` は無制限。負の値または非整数はエラーになります。                                                               |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | バインドするワークスペース。**絶対パス、存在するディレクトリであることが必要です**。起動時に `canonicalizeWorkspace` で一度正規化されます。`cwd` が一致しない場合、`POST /session` は `400 workspace_mismatch` を返します。 |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | リスナーレベルの `server.maxConnections`。`0` / `Infinity` は無制限。`NaN` または負の値は fail-open を防ぐため起動失敗になります。                                                                              |
| `--require-auth`                        | boolean                        | `false`                                      | トークン必須                           | ループバック**および** `/health` にも Bearer 認証を拡張します。トークンなしでは起動を拒否します。                                                                                                                             |
| `--enable-session-shell`                | boolean                        | `false`                                      | トークン必須                           | `POST /session/:id/shell` による直接実行を有効化します。呼び出し側はセッションにバインドされた `X-Qwen-Client-Id` も送信する必要があります。                                                                                        |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | セッションごとの SSE リプレイリング深度。ソフト上限は `MAX_EVENT_RING_SIZE = 1_000_000`。範囲外の値はブリッジ構築時にエラーになります。                                                                               |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | ステージ1 ブリッジモード: デーモンが多重化する1つの `qwen --acp` 子プロセス。ステージ2 インプロセスモードはまだ未実装。`--no-http-bridge` はフォールバックして stderr に出力します。                                            |
| `--mcp-client-budget <n>`               | number                         | なし                                         | `mcp-budget-mode=enforce` で必須   | ワークスペース MCP クライアントの上限。正の整数である必要があります。                                                                                                                                                 |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | バジェット設定時は `warn`、それ以外は `off` | `enforce` は `--mcp-client-budget` が必須 | `enforce` は拒否、`warn` は 75% 時に警告のみ、`off` は観察のみ。                                                                                                                               |
| `--allow-origin <pattern>`              | 繰り返し指定可能な string              | なし                                         | -                                        | デフォルトの Origin 拒否を置き換える CORS 許可リスト。`*` はトークンが必要です。                                                                                                                                         |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | localhost / プライベートネットワークの認証プロバイダー `baseUrl` のインストールを許可します。信頼できるローカル開発環境のみで使用してください。                                                                                      |
| `--prompt-deadline-ms <n>`              | number                         | なし                                         | -                                        | サーバーサイドのプロンプトウォールクロック制限（ms）。タイムアウト時にプロンプトを中断します。                                                                                                                                  |
| `--writer-idle-timeout-ms <n>`          | number                         | なし                                         | -                                        | SSE 接続ごとのアイドルタイムアウト（ms）。                                                                                                                                                                                |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | 最後のセッションが閉じた後も ACP 子プロセスを保持します。`0` は即時回収を意味します。                                                                                                                               |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | セッションリーパーのスキャン間隔。`0` は無効化します。                                                                                                                                                                    |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | 切断されたセッションのアイドルタイムアウト。`0` は無効化します。                                                                                                                                                           |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / オフ                                    | -                                        | 階層ごとの HTTP レート制限を有効または無効にします。                                                                                                                                                                      |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | ウィンドウあたりのプロンプトリクエスト数。                                                                                                                                                                           |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | ウィンドウあたりのミューテーションリクエスト数。                                                                                                                                                                           |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | ウィンドウあたりの読み取りリクエスト数。                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | レート制限ウィンドウの長さ。`>= 1000` である必要があります。                                                                                                                                                          |

## 4. 環境変数

| 環境変数                                 | 対応するフラグ / 効果                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | `--token` に相当。`--token` が優先されます。`cat token.txt` の末尾改行を避けるため、起動時に一度トリムされます。                                                         |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（大文字小文字不問）で詳細な stderr ログを有効化します。                                                                                             |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` でワークスペース MCP プールを完全に無効化し、セッションごとの `McpClientManager` にフォールバックします。capabilities から `mcp_workspace_pool` / `mcp_pool_restart` の通知がなくなります。 |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | ACP 子プロセス内部のバジェット入力。CLI が `--mcp-client-budget` から `childEnvOverrides` 経由で生成します。親プロセスの環境変数フォールバックではありません。                  |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | ACP 子プロセス内部のバジェットモード。CLI が `--mcp-budget-mode` から `childEnvOverrides` 経由で生成します。親プロセスの環境変数フォールバックではありません。                     |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` の環境変数フォールバック。                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` の環境変数フォールバック。                                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | ACP 子プロセスが読み取ります。カンマ区切りのプールされたトランスポート許可リスト。デフォルトは `stdio,websocket`。                                                        |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | ACP 子プロセスが読み取ります。プールエントリのアイドルドレイン遅延。デフォルトは `30000`、`1000..600000` ms にクランプされます。                                                   |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` でレート制限を有効化。CLI フラグが優先されます。                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` の環境変数フォールバック。                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` の環境変数フォールバック。                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` の環境変数フォールバック。                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` の環境変数フォールバック。                                                                                                              |

ハンドルごとの環境変数オーバーライドは意図的な設計です。同一プロセスで実行される2つのデーモンが `process.env` で競合しないようにするためです。`defaultSpawnChannelFactory` は spawn 時に環境変数をスナップショットします。

## 5. `settings.json` も読み込まれます

起動時に `loadSettings(boundWorkspace)` が一度呼び出されます:

| キー                         | 型                                                               | 動作                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | `BridgeOptions.permissionPolicy` を設定します。**起動時に `validatePolicyConfig` で検証されます**。不明な値はサイレントフォールバックせず `InvalidPolicyConfigError` をスローします。 |
| `policy.consensusQuorum`    | 正の整数                                                           | `consensus` ポリシーの N。デフォルトは `floor(M/2)+1`。コンセンサス以外のポリシーで設定された場合は無視され、起動時に stderr 警告が出力されます。                              |
| `context.fileName`          | string                                                             | `getCurrentGeminiMdFilename()` をオーバーライドし、`POST /workspace/init` が書き込むファイルを制御します。                                                                          |
| `tools.disabled`            | string[]                                                           | 次の ACP 子プロセス spawn に影響する前に `normalizeDisabledToolList()`（トリム、空エントリの削除、重複排除）で正規化されます。                                           |
| `tools.approvalMode`        | string                                                             | デフォルトのセッション承認モード。                                                                                                                                           |
| `telemetry`                 | object                                                             | OTel 設定: `enabled`、`otlpEndpoint`、`otlpProtocol`、シグナルごとのエンドポイントなど。[`17-configuration.md`](./17-configuration.md) を参照してください。                       |

不正な JSON などの設定 I/O の失敗はデフォルトにフォールバックします。例外は `InvalidPolicyConfigError` です。ポリシーの設定ミスは明示的に起動失敗となります。

## 6. 起動拒否シナリオ（明示的な失敗）

`run-qwen-serve.ts` は以下のケースでフォールバックせず意図的にエラーをスローします:

| シナリオ                                                                      | エラープレフィックス                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| トークンなしの非ループバックバインド                                              | `Refusing to bind ... without a bearer token`                                                       |
| トークンなしの `--require-auth`                                                | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` が存在しない、ディレクトリでない、または絶対パスでない          | `Invalid --workspace ...`                                                                           |
| `--workspace` の stat でパーミッション拒否                                          | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` が正の整数でない                                               | `Must be a positive integer`                                                                        |
| バジェットなしの `--mcp-budget-mode=enforce`                                    | `requires a positive mcpClientBudget`                                                               |
| `--hostname` が `localhost:4170` のように記述されている                                   | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` が `NaN` または負の値                                      | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | ブリッジ構築時にスロー                                                                                   |
| トークンなしの `--allow-origin '*'`                                            | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` が正の整数でない | `Must be a positive integer`                                                                        |
| 不明な `policy.permissionStrategy` または非正の `policy.consensusQuorum`  | `InvalidPolicyConfigError`                                                                          |

## 7. curl による確認チェックリスト

```bash
# 1. 生存確認
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 詳細ヘルスチェック
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. capabilities 確認
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. プリフライト準備状況
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. 環境変数スナップショット (シークレットは存在の有無のみ報告)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP プール / バジェットスナップショット
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. セッション作成
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. SSE のテール (<sid> を置き換えてください)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. デモページ
open http://127.0.0.1:4170/demo
```

Bearer 認証が有効な場合は、すべてのリクエストに `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` を追加してください。

## 8. デモページは使用できますか?

**はい。** `packages/cli/src/serve/demo.ts` の `getDemoHtml(port)` によって実装されており、外部依存なしの自己完結型 HTML です。

| 起動モード                       | `/demo` の登録場所                                                         | ブラウザからの直接アクセス                              |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `--require-auth` なしのループバック | `server.ts` ループバックの認証前ルートブランチ（`bearerAuth` の**前**） | トークンなしで動作                                    |
| `--require-auth` ありのループバック    | `server.ts` 認証後ルートブランチ（`bearerAuth` の**後**）          | 通常のブラウザからは使いにくい。curl または SDK を使用 |
| 非ループバックバインド                 | `server.ts` 認証後ルートブランチ（`bearerAuth` の**後**）          | 上記と同様                                          |

CSP は `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`、さらに `X-Frame-Options: DENY` が設定されています。ページは `'self'`（デーモン）のみフェッチ可能で、外部スクリプトやスタイルは読み込めません。

## 9. `qwen serve` からリスニングサーバーまでの呼び出しチェーン

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
serve/server.ts                    createServeApp() - Express アプリを構築 (**listen しない**)
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
commands/serve.ts                  await blockForever()    // シグナルが来るまで永久にブロック
```

重要なポイント:

- **`createServeApp` は構築のみを行い、listen しません。** ミドルウェアとルートがマウントされた `express()` インスタンスを返します。`app.listen()` の所有権は呼び出し側にあります。`server.test.ts` では約25のテストケースでこのファクトリを使用しており、ライフサイクルを所有しないことが意図的な設計です。
- **`() => actualPort` は遅延クロージャです。** `actualPort` は `app.listen` コールバック内で代入されます。`hostAllowlist` ミドルウェアはオンデマンドで読み取るため、エフェメラルポート（`--port 0`）でも `Host` ヘッダーのゲートが正しく機能します。
- **`await blockForever()` は意図的な設計です。** `yargs.parse()` が解決すると、CLI のトップレベルはインタラクティブな TUI エントリポイント（`gemini.tsx`）に処理が落ちてしまいます。SIGINT / SIGTERM は `runQwenServe` の `onSignal` パスを通じて終了します。

## 10. HTTP ルートファイルの分割

メインの組み立ては `server.ts` の `createServeApp()` で行われ、4つのモジュラールートファイルがマウントされます:

| ルート                                                                                                                    | ファイル                                                  | マウントエントリ                                |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `/health`、`/demo`、`/capabilities`、全セッションルート、デバイスフロー、パーミッション投票、SSE、シングルサーバー MCP 再起動 | `packages/cli/src/serve/server.ts`                    | `createServeApp()` 内で直接登録               |
| `/workspace/memory` (GET/POST)                                                                                            | `packages/cli/src/serve/workspace-memory.ts`           | `mountWorkspaceMemoryRoutes()`                |
| `/workspace/agents` の全 CRUD ルート                                                                                       | `packages/cli/src/serve/workspace-agents.ts`           | `mountWorkspaceAgentsRoutes()`                |
| `GET /file`、`/file/bytes`、`/list`、`/glob`、`/stat`                                                                     | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`           |
| `POST /file/write`、`/file/edit`                                                                                          | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`          |

完全なルートおよびワイヤープロトコルのリファレンスは [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md) を参照してください。アーキテクチャについては [`01-architecture.md`](./01-architecture.md) を参照してください。

## 11. グレースフルシャットダウンとハードシャットダウン

- **最初の SIGINT / SIGTERM** -> `runQwenServe` の `onSignal` -> 2フェーズのグレースフルシャットダウン:
  1. `bridge.shutdown()`: 各チャンネルに `KILL_HARD_DEADLINE_MS`（10秒）が与えられ、その後 `channel.kill()` が呼ばれます。
  2. `server.close()`: インフライトのリクエストがドレインされ、`SHUTDOWN_FORCE_CLOSE_MS`（5秒）で `closeAllConnections()` がトリガーされ、さらに2秒のデッドラインが適用されます。
- **終了処理中の2回目の SIGINT / SIGTERM** -> `bridge.killAllSync()` が全 ACP 子プロセスを同期的に SIGKILL し、オーファンプロセスを防ぐために `process.exit(1)` を呼び出します。

`runQwenServe` が返す `RunHandle.close()` は、エンベッダーやテスト向けのプログラム的な同等手段です。

## 12. 組み込み呼び出し（CLI をバイパス）

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
// ... handle.bridge を直接呼び出すか handle.server にアクセスする
await handle.close(); // プログラム的なシャットダウン
```

または Express アプリを直接取得して自分でリッスンする方法:

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

注意: `createServeApp` を直接呼び出す場合、デフォルトの `fsFactory.trusted = false` となります。エージェント側の ACP `writeTextFile` は `untrusted_workspace` として拒否され、stderr に警告が一度出力されます。明示的な信頼を付与するには `deps.fsFactory` を注入するか、`deps.bridge` を注入するか、または信頼ゲートのデフォルト動作を受け入れてください。

## 13. デバッグレシピ

[`19-observability.md`](./19-observability.md) のデバッグセクションを参照してください。よく使われるコマンドは以下の通りです:

```bash
# デーモンは生きているか？
curl http://127.0.0.1:4170/health

# どの capabilities が通知されているか？
curl -s http://127.0.0.1:4170/capabilities | jq

# デーモンホストの準備状況
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# ライブ SSE のテール
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# 詳細ログ
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
- ワイヤープロトコル: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
