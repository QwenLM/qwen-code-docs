# `qwen serve` デーモンファイルロガー — 設計

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **Branch**: `feat/support_daemon_logger`
- **Status**: 設計承認済み、実装計画待ち
- **Date**: 2026-05-26

## 1. 問題

`qwen serve` はデーモンレベルの診断情報（ライフサイクル、ルートエラー、ACP 子プロセスの stderr）を `process.stderr` に出力します。これは systemd/Docker 環境下では機能しますが、SDK / Desktop / ローカルデーモン用途では脆弱です。クライアントが `POST /session/:id/prompt` で HTTP 500 を受け取った場合、オペレーターが手動で stderr をリダイレクトしていない限り、ルート + セッション + スタックコンテキストは失われます。

`createDebugLogger`（`packages/core/src/utils/debugLogger.ts` 内）はセッションスコープです。アクティブな `DebugLogSession` が必要であり、`${runtimeBaseDir}/debug/<sessionId>.txt` に書き込みます。serve デーモンはセッションが存在する**前**に起動するため、デーモンレベルの呼び出しは暗黙的に no-op になります。また、セッションごとの `debug/latest` セマンティクスを変更せずに再利用することもできません。

この設計では、既存の stderr の動作に追加する形で、デーモン固有のファイルシンクを追加し、シェルリダイレクトなしでもデーモンの診断情報が失われないようにします。

## 2. スコープ

### スコープ内

- `runQwenServe` プロセスごとに 1 回初期化される新しいロガー。
- `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log` にあるファイル（追記モード）。
- 以下の Tee（分岐出力）:
  - `runQwenServe.ts` のライフサイクル / シャットダウン / シグナルメッセージ
  - `sendBridgeError`（`server.ts`）のルートエラー
  - `bridge.ts` の `writeServeDebugLine`（`QWEN_SERVE_DEBUG` が設定されている場合）
  - `spawnChannel.ts` の ACP 子プロセス stderr フォワーディング
- `QWEN_DAEMON_LOG_FILE=0|false|off|no` によるオプトアウト。
- `tail -f` 用のデーモンディレクトリ内の `latest` シンボリックリンク。
- serve CLI ドキュメントへの記載。

### スコープ外（Issue からの非ゴール）

- OpenTelemetry の置き換え、またはデーモントレーシングの追加。
- 構造化されたエンタープライズエラーログのエクスポート（issue #2014）。
- 既存のセッションデバッグログのローテーションまたは削除。
- デーモンログ自体のログローテーション / サイズ上限（フォローアップ PR に延期）。既存ファイルが異常に大きい場合、起動時に stderr 警告が出力されますが、自動アクションは行いません。

## 3. アーキテクチャ

### 3.1 モジュール境界

| レイヤー                                                   | 新規 / 変更 | 責務                                                                                                                                |
| ------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                | **new**       | シンク: 初期化、フォーマット、ファイルへの追記、stderr への tee、フラッシュ、latest シンボリックリンク                                                                      |
| `packages/cli/src/serve/runQwenServe.ts`                | changed       | 起動時にロガーを初期化。ライフサイクルの `writeStderrLine` を `daemonLog.*` に置換。シャットダウン時に `await flush()`。bridge に `onDiagnosticLine` を渡す |
| `packages/cli/src/serve/server.ts`                      | changed       | `sendBridgeError(...)` を `daemonLog.error(...)` 経由にする                                                                                  |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)    | changed       | オプションの `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void` を追加                                                 |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine` | changed       | `onDiagnosticLine` が注入されていれば、同じ行を tee する                                                                                             |
| `packages/acp-bridge/src/spawnChannel.ts`               | changed       | 子プロセスの stderr フォワーダーが、プレフィックス付きの各行を `onDiagnosticLine` に tee する                                                                        |

**設計の意図**: `daemonLogger.ts` は単一ファイルで cli ローカルであり、グローバルシングルトンは持ちません。`acp-bridge` は cli の存在を知らず、コールバックのみを受け取ります。依存関係グラフは変更されません。

### 3.2 グローバルシングルトンの不使用

ロガーは `runQwenServe` で生成され、それを必要とする内部 serve モジュールにクロージャ経由で（または `acp-bridge` にはコールバック経由で）渡されます。理由:

- `BridgeOptions` がすでに依存関係を注入している方法と整合している。
- 歴史的に `debugLogger` が直面してきたテスト間の状態リークを回避する（そのために `resetDebugLoggingState()` が存在する）。

## 4. デーモン ID とファイルパス

- パス: `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - `${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/<daemon-id>.log` に解決される。
  - `Storage.getGlobalDebugDir()` を再利用するため、ランタイムディレクトリのオーバーライド（環境変数、コンテキスト）が自動的に適用される。
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` は同じワークスペース上の複数のデーモンを識別する。
  - `workspaceHash` は固定長で、ファイル名として安全であり、同じワークスペースパスに対して安定している。
- `latest` シンボリックリンク: `~/.qwen/debug/daemon/latest` → 現在のプロセスのログファイル。既存の `updateSymlink` ヘルパー（`packages/core/src/utils/symlink.ts`）を使用して初期化時に更新される。シンボリックリンクの失敗はログに記録され、無視される（プライマリ書き込みを劣化させない）。非ゴールに従い、`${runtimeBaseDir}/debug/latest`（セッションスコープ）とは区別される。
- ファイルモード: `'a'`（`O_APPEND | O_CREAT` で追記）。既存のファイルはフォレンジックのために再起動後も保持される。

## 5. Public API

```ts
// packages/cli/src/serve/daemonLogger.ts

export interface DaemonLogContext {
  route?: string;
  sessionId?: string;
  clientId?: string;
  childPid?: number;
  channelId?: string;
  [key: string]: unknown;
}

export interface DaemonLogger {
  info(message: string, ctx?: DaemonLogContext): void;
  warn(message: string, ctx?: DaemonLogContext): void;
  /**
   * `err.stack` is appended as indented continuation lines after the message.
   * Both `err` and `ctx` are optional and independent.
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * File-only tee for lines whose caller is already writing to stderr
   * (ACP child stderr forwarder, `writeServeDebugLine`). The line is
   * appended to the daemon log under the standard `<timestamp> [<LEVEL>] [DAEMON] `
   * prefix; it is NOT echoed to stderr (which would double the operator's output).
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** Absolute path to the daemon log file. */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`. */
  getDaemonId(): string;
  /** Drain pending appends. Called from runQwenServe shutdown handler. */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // default process.pid
  now?: () => Date; // default () => new Date()
  stderr?: (line: string) => void; // default writeStderrLine
  baseDir?: string; // default Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` は同期的に以下を実行します:

1. `daemonId` とログパスを計算する。
2. `mkdirSync(parentDir, { recursive: true })` — 失敗した場合 → no-op ロガーを返し、stderr に警告を 1 つ出力する。ブートは継続される。
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>` を同期的に書き込む。これは書き込み可能性のプローブも兼ねており、EACCES/ENOSPC の場合、フェイルモード = no-op ロガー + stderr 警告 1 つとなる。
4. `latest` シンボリックリンクを更新する（ベストエフォート、エラーは握りつぶされる）。
5. ロガーを返す。その後の `info/warn/error/raw` 呼び出しは、非同期の `fs.promises.appendFile` をエンキューする。

`process.env['QWEN_DAEMON_LOG_FILE']` が `0|false|off|no` のいずれかの場合、`initDaemonLogger` はファイルシステム呼び出しの前に no-op ロガーへショートサーキットします。

## 6. ログ行のフォーマット

視覚的な統一感のため、`debugLogger.buildLogLine` をミラーリングします:

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- タイムスタンプ: ISO 8601、UTC。
- レベル: `INFO` | `WARN` | `ERROR`。（初期状態では DEBUG なし — `QWEN_SERVE_DEBUG` は `raw()` 経由で `INFO` として流入する。）
- タグ: リテラル `DAEMON`。
- トレースコンテキスト: 利用可能な場合 `trace.getActiveSpan()`。`debugLogger.getActiveSpanTraceContext` と同じロジック。ヘルパーを共有モジュール（`packages/core/src/utils/traceContext.ts` など）に抽出するか、ローカルに複製するかは計画時に決定する。
- コンテキストフィールド: `key=value` としてレンダリングされ、固定順（`route`、`sessionId`、`clientId`、`childPid`、`channelId`）の後に、追加のキーが辞書順でソートされる。空白または `=` を含む値は `JSON.stringify` でクォートされる。
- エラースタック: メッセージの後にインデントされた継続行として追加される。
- `raw(line, level)` は、標準プレフィックス `<timestamp> [<LEVEL>] [DAEMON] ` の後にそのまま行を書き込み、追加の処理は行わない。

**Tee のセマンティクス（重要）:**

- `info` / `warn` / `error` は、デーモンログファイル**と** stderr（注入された `stderr` ライター経由）の**両方**に書き込む。以前の `writeStderrLine(...)` を置き換える呼び出し元はこれらを直接使用し、個別の stderr 呼び出しは不要。
- `raw` は**ファイルのみ**に書き込む。ACP 子プロセス stderr フォワーダーや `writeServeDebugLine` で使用され、呼び出し元は既存のパスを通じてすでに stderr に書き込んでいる。二重書き込みはオペレーターの出力を溢れさせることになる。

## 7. ブート / シャットダウンフロー

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // boot banner is stderr-only to avoid the line referencing itself

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // injected for sendBridgeError

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- ブートバナーは stderr のみ（自身に関するパス行は、ログに記録すると循環参照になるため）。
- `initDaemonLogger` は同期的であるため、障害は最初のエラーの後に埋もれることなく、ブート時に即座に可視化される。
- シャットダウン時の `flush()` は、`process.exit` の直前の最後の await ステップである。SIGKILL は定義上フラッシュ不可能であるため、それは受け入れる。

## 8. カバレッジテーブル

| ソース                                                        | 現在                                        | 変更後                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `runQwenServe.ts` のライフサイクル / シグナル / 設定警告       | `writeStderrLine(...)`                       | `daemonLog.info \| warn(...)`（stderr にも出力される — `daemonLog` が tee するため）                          |
| `runQwenServe.ts` の "listening on URL"（stdout）                 | `writeStdoutLine(...)`                       | 変更なし — オペレータースクリプトは stdout を解析する                                                        |
| `server.ts:sendBridgeError`                                   | route/sessionId を伴う `writeStderrLine(...)` | `daemonLog.error(msg, err, { route, sessionId, ... })`（stderr は daemonLog の tee により引き続き出力される） |
| `bridge.ts:writeServeDebugLine` (`QWEN_SERVE_DEBUG`)          | `writeStderrLine('qwen serve debug: ...')`   | `onDiagnosticLine(line, 'info')` への tee                                                          |
| `spawnChannel.ts` の子プロセス stderr                                | `process.stderr.write(prefix + line + '\n')` | `onDiagnosticLine(prefix + line, 'warn')` も併せて出力                                                   |
| `writeStdoutLine` の呼び出し元                                     | 変更なし                                    | 変更なし                                                                                        |
| CLI の使用法 / argparse エラー（`runQwenServe` の初期バリデーション） | `writeStderrLine(...)`                       | 変更なし（ロガーがまだ存在しない可能性があるため）                                                             |
既存の stderr への書き込みはすべて保持されます。デーモンログは**追加型**であり、置き換えるものではありません。

## 9. 書き込みパスとフラッシュ

- 内部キュー: 単一の `Promise<void>` チェーン (`this.pending = this.pending.then(() => fs.promises.appendFile(...))`)。
- 各 `info/warn/error/raw` の呼び出しは、ファイルへの追記をキューに追加し、`info/warn/error` の場合は注入された `stderr` ライターも同期的に呼び出します。
- stderr への書き込み順序は保持されます（同期的であり、追記のキューイング前）。ファイルへの追記は、キューイングされた順序で最終的に一貫性が保たれます。
- 書き込み失敗時は内部の `degraded` フラグがセットされ、stderr に一度だけ警告を出力します。その後の呼び出しも書き込みを試みますが、カウンターは維持されません。
- `flush()` は現在の末尾の promise を返します。
- バッファリングレイヤーなし: 各呼び出し = 1回の `appendFile`。ボリュームは少ない（ルートエラー + ライフサイクル）ため、マイクロバッチ処理は時期尚早な最適化です。

## 10. 設定

| 環境変数                                        | 動作                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`        | `initDaemonLogger` は no-op を返します。tee も no-op になり、stderr は変更されません |
| `QWEN_DAEMON_LOG_FILE=<anything else>` または未設定 | 有効（デフォルト）                                                           |
| `QWEN_RUNTIME_DIR=<path>`                       | `~/.qwen` ルートを移動し、デーモンログもそれに伴って移動します（既存のセマンティクス） |
| `QWEN_SERVE_DEBUG=1`                            | 既存 — `writeServeDebugLine` が有効化されます。行はデーモンログにも tee されます |

`QWEN_DAEMON_LOG_FILE` は `QWEN_DEBUG_LOG_FILE` と意図的に分離されています。これにより、セッションごとのデバッグログを無効化しても、オペレーターのデーモンログが無効化されることがありません（逆も同様です）。

## 11. エラーハンドリング

- `initDaemonLogger` の mkdir/open 失敗 → no-op ロガー + stderr への警告1回。デーモンの起動は続行されます。オペレーターはファイルに何も記録されませんが、stderr からは確認できます。
- 追記ごとの失敗 → degraded フラグを反転させ、stderr に警告を1回出力し、試行を続けます。イシューには degraded モードの UI シグナルについての言及がないため、公開インターフェースは不要です。
- `flush()` の拒否 → シャットダウンハンドラでキャッチされ、`writeStderrLine` 経由でログに記録されます。終了をブロックしません。
- `latest` シンボリックリンクの失敗 → 握りつぶされます（swallowed）。メインの書き込みには影響しません。

## 12. テスト

### `daemonLogger.test.ts` (新規)

- サンドボックス化された `baseDir`、モック化された `now`、`pid`、`stderr`。
- 既知の入力に対する 8文字の `workspaceHash` を含む、パスとデーモン ID の導出。
- `latest` シンボリックリンクは作成され、同じディレクトリでの後続の `initDaemonLogger` 呼び出し時に更新されます。
- レベルのフォーマット（INFO/WARN/ERROR）、コンテキストフィールドの順序、エラースタックの継続。
- アクティブなスパンが存在する場合のトレースコンテキストの注入。
- `raw(line, level)` はプレフィックス付きの行をそのまま書き込みます。
- `flush()` は、キューに入れられたすべての書き込みがファイルに反映された後にのみ解決（resolve）されます。
- `QWEN_DAEMON_LOG_FILE=0` → ファイルは作成されません。
- `mkdir` 失敗 → no-op ロガー、stderr への警告1回、後続の呼び出しはスローしません。
- `appendFile` 失敗 → degraded フラグが反転、stderr への警告1回。

### `runQwenServe.test.ts` (拡張)

- 起動時に `daemon started ...` という行をログに書き込みます。
- シャットダウンハンドラは、終了前に `daemonLog.flush()` を待機します。
- stderr の起動バナーにデーモンログのパスが含まれます。

### `server.test.ts` (拡張)

- スローするルートは、適切な `route` と `sessionId` を伴って `daemonLog.error(...)` 経由でエラーをルーティングします。

### acp-bridge テスト (拡張)

- `QWEN_SERVE_DEBUG=1` の際の `writeServeDebugLine` から、および `spawnChannel` の子 stderr フォワーダーから `onDiagnosticLine` コールバックが呼び出されます。テストではキャプチャ用のフェイクを注入し、ファイルシステムは使用しません。

## 13. ドキュメント

- `docs/cli/serve.md`（または serve がドキュメント化されている場所）に「デーモンログファイル」セクションを追加します。内容: パス、デーモン ID のフォーマット、`latest` シンボリックリンク、`QWEN_DAEMON_LOG_FILE` によるオプトアウト、セッションごとの `debug/<sessionId>.txt` との区別。
- 存在する場合、`packages/cli/src/serve/` 配下の README。
- このリポジトリに CHANGELOG 形式のファイルはありません。リリースノートは別途管理されます。

## 14. ロールバック

- 純粋な追加変更。ロールバック = コミットの取り消し:
  - `daemonLogger.ts` とそのテストを削除。
  - `runQwenServe.ts` のライフサイクル / sendBridgeError / bridge / spawnChannel の変更を巻き戻し。
  - `BridgeOptions` から `onDiagnosticLine` を削除。
- ディスク上の状態をクリーンアップする必要はありません。既存のデーモンログファイルは孤立しますが、無害です。

## 15. 受け入れ基準（イシューより）

| 基準                                                                | 満たし方                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `qwen serve` がシェルリダイレクトなしでデーモンログを作成/追記する  | `initDaemonLogger` が起動時にファイルを開く                                                       |
| `POST /session/:id/prompt` からの HTTP 500 がデーモンログで相関可能 | `sendBridgeError` が `route=` + `sessionId=` を書き込む                                           |
| ACP 子の stderr 行もデーモンログに含まれる                          | `spawnChannel` が `onDiagnosticLine` を通じて tee する                                            |
| 最初のセッションの前およびすべてのセッションが閉じた後にログが機能する | セッションスコープではなく、デーモンのライフタイム全体で機能する                                  |
| 既存の stderr の動作が維持される                                    | すべての書き込みは追加型であり、同等のものが残されていない限り `writeStderrLine` の呼び出しは削除されない |
| ログパスとオプトアウトがドキュメント化されている                      | §13 のドキュメントセクション                                                                      |

## 16. 未解決の質問

ブロッキングするものはありません。考えられるフォローアップ:

- `latest` シンボリックリンクは `~/.qwen/debug/daemon/latest` と `~/.qwen/debug/daemon-latest` のどちらに配置すべきか？仕様ではディレクトリを整理するために前者を選択しています。
- 将来のフラグ（例: `QWEN_DAEMON_LOG_FORMAT=json`）として JSON 行出力を提供すべきか？この PR のスコープ外です。構造化エクスポートは #2014 が担当します。