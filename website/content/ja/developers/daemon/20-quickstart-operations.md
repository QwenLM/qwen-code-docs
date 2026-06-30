# クイックスタートと運用

本ページでは、**`qwen serve` の起動方法、動作確認方法、および `qwen serve` からリスニングサーバーまでの内部呼び出しチェーン** について重点的に解説します。アーキテクチャ、コンポーネント、ワイヤープロトコルの詳細については、デーモンの詳細解説ページを参照してください。

## 1. 最短パス

```bash
qwen serve
```

Output:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

ブラウザで `http://127.0.0.1:4170/demo` を開くと、デバッグコンソール（チャット UI、イベントストリーム、ワークスペース検査）を確認できます。デフォルトのループバック開発モードでは、`createServeApp()` が `bearerAuth` の **前** に `packages/cli/src/serve/routes/health-demo.ts` から `/demo` ルートをマウントするため、トークンは不要です。

## 2. 起動レシピ

```bash
# 1. ローカル開発のデフォルト（ループバック、トークンなし）
qwen serve

# 2. 明示的なワークスペース + エフェメラルポート
qwen serve --workspace /path/to/repo --port 0

# 3. 強化されたループバック開発（ループバックでもベアラ認証を強制）
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. LAN に公開（非ループバックにはトークンが必要）
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. 多数のセッションとより大きなリプレイリング用にチューニング
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. マルチクライアント連携 + 厳格な MCP バジェット
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. settings.json で設定されたコンセンサスポリシーで起動
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. デバッグログ
QWEN_SERVE_DEBUG=1 qwen serve

# 9. F2 プールを無効化（セッションごとの MCP クライアントにフォールバック）
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

強化されたループバックのレシピ (3) では、`/demo` は `bearerAuth` の後に登録されます。通常のブラウザナビゲーションには認証ヘッダーが必要なため、代わりに curl や SDK スクリプトを使用してください。

## 3. 完全な起動フラグ

CLI は **`packages/cli/src/commands/serve.ts`** で定義されています:

| フラグ                                    | 型                           | デフォルト                                      | 必須条件                            | 動作                                                                                                                                                                                                                |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | TCP ポート。`0` は OS によって割り当てられるエフェメラルポートを意味します。                                                                                                                                                                       |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | 非ループバックにはトークンが必要              | バインドアドレス。ループバックの値: `127.0.0.1`、`localhost`、`::1`、`[::1]`。`[::1]` のブラケットは自動的に削除されます。`host:port` 形式の入力は拒否され、`--port` を使用するようガイダンスが表示されます。                                    |
| `--token <s>`                           | string                         | env / none                                   | 非ループバックおよび `--require-auth`        | ベアラートークン。1回だけトリミングされます。**`/proc/<pid>/cmdline` に表示されるため、`QWEN_SERVER_TOKEN` の使用を推奨します**。起動時の stderr でもこれについて警告されます。                                                                                |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | アクティブセッションの上限。超過した spawn は 503 を返します。`0` は無制限を意味します。`NaN` / 負の値は例外をスローします。                                                                                                                     |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | セッションごとに受け入れられたが pending/running 状態のプロンプトの上限。超過したプロンプトは 503 を返します。`0` / `Infinity` は無制限を意味します。負の値または非整数値は例外をスローします。                                                               |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | バインドされるワークスペース。**絶対パスであり、存在し、かつディレクトリでなければなりません**。起動時に `canonicalizeWorkspace` を介して一度正規化されます。`cwd` が一致しない `POST /session` は `400 workspace_mismatch` を返します。 |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | リスナーレベルの `server.maxConnections`。`0` / `Infinity` は無制限を意味します。`NaN` / 負の値は、fail-open 動作を避けるために起動を失敗させます。                                                                              |
| `--require-auth`                        | boolean                        | `false`                                      | トークンが必要                           | ベアラ認証をループバック **および** `/health` に拡張します。トークンがない場合、起動は拒否されます。                                                                                                                             |
| `--enable-session-shell`                | boolean                        | `false`                                      | トークンが必要                           | 直接の `POST /session/:id/shell` 実行を有効にします。呼び出し元はセッションにバインドされた `X-Qwen-Client-Id` も送信する必要があります。                                                                                                        |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | セッションごとの SSE リプレイリングの深さ。ソフトキャップは `MAX_EVENT_RING_SIZE = 1_000_000` です。範囲外の値はブリッジ構築中に例外をスローします。                                                                               |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | ステージ 1 ブリッジモード: デーモンによって多重化される 1 つの `qwen --acp` 子プロセス。ステージ 2 の in-process モードはまだ実装されていません。`--no-http-bridge` はフォールバックし、stderr に出力します。                                            |
| `--mcp-client-budget <n>`               | number                         | none                                         | `mcp-budget-mode=enforce` に必要   | ワークスペース MCP クライアントの上限。正の整数である必要があります。                                                                                                                                                                 |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | バジェットが設定されている場合は `warn`、それ以外の場合は `off` | `enforce` には `--mcp-client-budget` が必要 | `enforce` は拒否し、`warn` は 75% で警告のみを出し、`off` は監視のみを行います。                                                                                                                                               |
| `--allow-origin <pattern>`              | repeatable string              | none                                         | -                                        | デフォルトの Origin 拒否を置き換える CORS 許可リスト。`*` にはトークンが必要です。                                                                                                                                         |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | localhost / プライベートネットワークの認証プロバイダーの `baseUrl` インストールを許可します。信頼できるローカル開発でのみ使用してください。                                                                                                      |
| `--prompt-deadline-ms <n>`              | number                         | none                                         | -                                        | サーバー側のプロンプトの壁時計制限（ミリ秒）。タイムアウトするとプロンプトが中止されます。                                                                                                                                                  |
| `--writer-idle-timeout-ms <n>`          | number                         | none                                         | -                                        | SSE 接続ごとのアイドルタイムアウト（ミリ秒）。                                                                                                                                                                                |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | 最後のセッションが閉じた後も ACP 子プロセスを存続させます。`0` は即座に回収することを意味します。                                                                                                                               |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | セッションリーパーのスキャン間隔。`0` は無効にします。                                                                                                                                                                        |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | 切断されたセッションのアイドルタイムアウト。`0` は無効にします。                                                                                                                                                                   |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                    | -                                        | 階層ごとの HTTP レート制限を有効または無効にします。                                                                                                                                                                      |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | ウィンドウごとのプロンプトリクエスト数。                                                                                                                                                                                           |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | ウィンドウごとのミューテーションリクエスト数。                                                                                                                                                                                         |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | ウィンドウごとのリードリクエスト数。                                                                                                                                                                                             |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | レート制限ウィンドウの長さ。`>= 1000` である必要があります。                                                                                                                                                                          |

## 4. 環境変数

| 環境変数                                 | 同等のフラグ / 効果                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | `--token` と同等。`--token` が優先されます。`cat token.txt` からの末尾の改行を避けるため、起動時に 1 回だけトリミングされます。                                                         |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes`（大文字小文字を区別しない）で詳細な stderr ログが有効になります。                                                                                             |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` でワークスペース MCP プールを完全に無効化し、セッションごとの `McpClientManager` にフォールバックします。Capabilities は `mcp_workspace_pool` / `mcp_pool_restart` の広告を停止します。 |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | ACP 子プロセスの内部バジェット入力。CLI は `childEnvOverrides` を介して `--mcp-client-budget` からこれを生成します。親プロセスの環境変数フォールバックではありません。                  |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | ACP 子プロセスの内部バジェットモード。CLI は `childEnvOverrides` を介して `--mcp-budget-mode` からこれを生成します。親プロセスの環境変数フォールバックではありません。                     |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | `--prompt-deadline-ms` の環境変数フォールバック。                                                                                                                                |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | `--writer-idle-timeout-ms` の環境変数フォールバック。                                                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | ACP 子プロセスによって読み取られます。カンマ区切りのプールされたトランスポート許可リスト。デフォルトは `stdio,websocket` です。                                                                        |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | ACP 子プロセスによって読み取られます。プールエントリのアイドルドレイン遅延。デフォルトは `30000` で、`1000..600000` ms にクランプされます。                                                                   |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` でレート制限が有効になります。CLI フラグが優先されます。                                                                                                                      |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | `--rate-limit-prompt` の環境変数フォールバック。                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | `--rate-limit-mutation` の環境変数フォールバック。                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_READ`        | `--rate-limit-read` の環境変数フォールバック。                                                                                                                                   |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | `--rate-limit-window-ms` の環境変数フォールバック。                                                                                                                              |

ハンドルごとの環境変数オーバーライドは意図的なものです。同じプロセスで実行される 2 つのデーモンは `process.env` で競合しません。`defaultSpawnChannelFactory` は spawn 時に環境変数のスナップショットを取得します。

## 5. settings.json も読み込まれます

起動時に `loadSettings(boundWorkspace)` が 1 回呼び出されます:

| キー                         | 型                                                               | 動作                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | `BridgeOptions.permissionPolicy` を設定します。**起動時に `validatePolicyConfig` で検証されます**。不明な値はサイレントにフォールバックするのではなく、`InvalidPolicyConfigError` をスローします。 |
| `policy.consensusQuorum`    | positive integer                                                   | `consensus` ポリシーの N。デフォルトは `floor(M/2)+1` です。非コンセンサスポリシーの下で設定された場合、無視され、起動時に stderr に警告がログ出力されます。                              |
| `context.fileName`          | string                                                             | `getCurrentGeminiMdFilename()` をオーバーライドし、`POST /workspace/init` がどのファイルを書き込むかを制御します。                                                                          |
| `tools.disabled`            | string[]                                                           | 次の ACP 子プロセスの spawn に影響を与える前に、`normalizeDisabledToolList()` を介して正規化されます（トリム、空のエントリ削除、重複排除）。                                           |
| `tools.approvalMode`        | string                                                             | デフォルトのセッション承認モード。                                                                                                                                           |
| `telemetry`                 | object                                                             | OTel 設定: `enabled`、`otlpEndpoint`、`otlpProtocol`、シグナルごとのエンドポイントなど。詳細は [`17-configuration.md`](./17-configuration.md) を参照してください。                       |

不正な JSON などの設定 I/O 失敗はデフォルトにフォールバックします。`InvalidPolicyConfigError` は例外です。ポリシーの誤設定は起動を明示的に失敗させます。

## 6. 起動拒否シナリオ（明示的な失敗）

`run-qwen-serve.ts` は、以下のケースでフォールバックする代わりに意図的に例外をスローします:

| シナリオ                                                                      | エラープレフィックス                                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| トークンなしの非ループバックバインド                                               | `Refusing to bind ... without a bearer token`                                                       |
| トークンなしの `--require-auth`                                                | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` が存在しない、ディレクトリではない、または絶対パスではない          | `Invalid --workspace ...`                                                                           |
| `--workspace` の stat 権限が拒否された                                          | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` が正の整数ではない                               | `Must be a positive integer`                                                                        |
| バジェットなしの `--mcp-budget-mode=enforce`                                    | `requires a positive mcpClientBudget`                                                               |
| `--hostname` が `localhost:4170` と記述されている                                   | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` が `NaN` または負の値                                      | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                               | Thrown during bridge construction                                                                   |
| トークンなしの `--allow-origin '*'`                                            | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` が正の整数ではない | `Must be a positive integer`                                                                        |
| 不明な `policy.permissionStrategy` または正でない `policy.consensusQuorum`  | `InvalidPolicyConfigError`                                                                          |
## 7. Curl 検証チェックリスト

```bash
# 1. 生存確認
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 ディープヘルスチェック
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. ケーパビリティ
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. プリフライト準備状況
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. 環境スナップショット (シークレットは存在のみ報告)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP プール / バジェットスナップショット
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. セッションの作成
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. SSE のテール (<sid> を置換)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. デモページ
open http://127.0.0.1:4170/demo
```

Bearer 認証が有効な場合、すべてのリクエストに `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` を追加します。

## 8. デモページは使用可能か？

**はい。** これは `packages/cli/src/serve/demo.ts` 内の `getDemoHtml(port)` によって実装されており、外部依存を持たない自己完結型の HTML です。

| 起動モード | `/demo` が登録される場所 | ブラウザからの直接ナビゲーション |
| --- | --- | --- |
| `--require-auth` なしのループバック | `routes/health-demo.ts`、`createServeApp()` によって `bearerAuth` の **前** にマウント | トークンなしで動作 |
| `--require-auth` ありのループバック | `routes/health-demo.ts`、`createServeApp()` によって `bearerAuth` の **後** にマウント | 通常のブラウザからの使用は困難。curl または SDK を使用 |
| ループバック以外のバインド | `routes/health-demo.ts`、`createServeApp()` によって `bearerAuth` の **後** にマウント | 上記と同じ |

CSP は `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` であり、さらに `X-Frame-Options: DENY` が設定されています。このページは `'self'`（デーモン）のみをフェッチでき、外部スクリプトやスタイルを読み込むことはできません。

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
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # 遅延ロード
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
commands/serve.ts                  await blockForever()    // シグナルがあるまで永久にブロック
```

重要な事実:

- **`createServeApp` はビルドのみを行い、リスニングは行いません。** ミドルウェアとルートがマウントされた `express()` インスタンスを返します。`app.listen()` の所有権は呼び出し側にあります。`server.test.ts` は約 25 のケースでこのファクトリを使用しているため、ファクトリは意図的にライフサイクルの所有を回避しています。
- **`() => actualPort` は遅延クロージャです。** `actualPort` は `app.listen` のコールバック内で代入されます。`hostAllowlist` ミドルウェアはオンデマンドでそれを読み取るため、エフェメラルポート（`--port 0`）でも `Host` ヘッダーを正しくゲートします。
- **`await blockForever()` は意図的なものです。** `yargs.parse()` が解決すると、CLI のトップレベルは対話型 TUI のエントリポイント（`gemini.tsx`）にフォールスルーします。SIGINT / SIGTERM は `runQwenServe` の `onSignal` パスを通じて終了します。

## 10. HTTP ルートファイルの分割

主要なアセンブリは `server.ts` 内の `createServeApp()` で行われ、ミドルウェアを接続し、焦点を絞ったルートモジュールをマウントします。

| ルート | ファイル | マウントエントリ |
| --- | --- | --- |
| `/health`, `/demo` | `packages/cli/src/serve/routes/health-demo.ts` | `healthDemoRoutes.register()` |
| `/daemon/status` | `packages/cli/src/serve/routes/daemon-status.ts` | `registerDaemonStatusRoutes()` |
| `/capabilities`、ワークスペースの初期化/ツール/MCP 変更ルート、ACP HTTP ブリッジ | `packages/cli/src/serve/server.ts` | `createServeApp()` 内で直接登録 |
| ワークスペースのステータス、環境、プリフライト、MCP/ツール/プロバイダー/スキルのサマリー | `packages/cli/src/serve/routes/workspace-status.ts` | `registerWorkspaceStatusRoutes()`, `registerWorkspaceDiagnosticStatusRoutes()` |
| ワークスペース拡張機能と拡張機能の操作 | `packages/cli/src/serve/routes/workspace-extensions.ts` | `registerWorkspaceExtensionRoutes()` |
| `/workspace/memory` (GET/POST) | `packages/cli/src/serve/workspace-memory.ts` | `mountWorkspaceMemoryRoutes()` |
| すべての `/workspace/agents` CRUD ルート | `packages/cli/src/serve/workspace-agents.ts` | `mountWorkspaceAgentsRoutes()` |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat` | `packages/cli/src/serve/routes/workspace-file-read.ts` | `registerWorkspaceFileReadRoutes()` |
| `POST /file/write`, `/file/edit` | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()` |
| ワークスペースのセットアップ、信頼、設定、権限、および音声ルート | `packages/cli/src/serve/routes/workspace-*.ts` | `registerWorkspaceSetupGithubRoutes()`, `registerWorkspaceTrustRoutes()` など |
| ワークスペースの認証プロバイダーとデバイスフローのルート | `packages/cli/src/serve/routes/workspace-auth.ts` | `registerWorkspaceAuthRoutes()` |
| セッションのライフサイクル、プロンプト、メタデータ、言語、シェル、リキャップ、リワインド、ブランチ、およびリストルート | `packages/cli/src/serve/routes/session.ts` | `registerSessionRoutes()` |
| `GET /session/:id/events` SSE ストリーム | `packages/cli/src/serve/routes/sse-events.ts` | `registerSseEventsRoutes()` |
| 権限レスポンスルート | `packages/cli/src/serve/routes/permission.ts` | `registerPermissionRoutes()` |

完全なルートおよびワイヤープロトコルのリファレンスについては、[`../qwen-serve-protocol.md`](../qwen-serve-protocol.md) を参照してください。アーキテクチャについては、[`01-architecture.md`](./01-architecture.md) を参照してください。

## 11. グレースフルシャットダウンとハードシャットダウン

- **最初の SIGINT / SIGTERM** -> `runQwenServe` の `onSignal` -> 2段階のグレースフルシャットダウン:
  1. `bridge.shutdown()`: 各チャネルに `KILL_HARD_DEADLINE_MS`（10秒）が与えられ、その後 `channel.kill()` が実行されます。
  2. `server.close()`: 処理中のリクエストがドレインされ、`SHUTDOWN_FORCE_CLOSE_MS`（5秒）で `closeAllConnections()` がトリガーされ、その後 2 番目の 2 秒のデッドラインが適用されます。
- **すでに終了処理中の 2 回目の SIGINT / SIGTERM** -> `bridge.killAllSync()` がすべての ACP 子プロセスを同期的に SIGKILL し、オーファンプロセスを回避するために `process.exit(1)` を呼び出します。

`runQwenServe` によって返される `RunHandle.close()` は、エンベッダーやテスト用のプログラムによる同等のシャットダウン手段です。

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
// ... call handle.bridge directly or access handle.server
await handle.close(); // programmatic shutdown
```

または、Express アプリを直接取得して自分でリスニングします。

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

注: `createServeApp` を直接呼び出す場合、デフォルトでは `fsFactory.trusted = false` となります。エージェント側の ACP `writeTextFile` は `untrusted_workspace` として拒否され、stderr に警告が一度出力されます。明示的な信頼を持つ `deps.fsFactory` を注入するか、`deps.bridge` を注入するか、信頼ゲートされたデフォルトの動作を受け入れてください。

## 13. デバッグのレシピ

[`19-observability.md`](./19-observability.md) のデバッグセクションを参照してください。一般的なコマンドは次のとおりです。

```bash
# デーモンは生存しているか？
curl http://127.0.0.1:4170/health

# どのケーパビリティが公開されているか？
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

## リファレンス

- CLI エントリ: `packages/cli/src/commands/serve.ts`
- ブートストラップ: `packages/cli/src/serve/run-qwen-serve.ts`
- Express ファクトリ: `packages/cli/src/serve/server.ts`
- ミドルウェア: `packages/cli/src/serve/auth.ts`
- ブリッジファクトリ: `packages/acp-bridge/src/bridge.ts`
- デモページ HTML: `packages/cli/src/serve/demo.ts`
- ユーザードキュメント: [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- ワイヤープロトコル: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)