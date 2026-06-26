```markdown
# `qwen serve` デーモンファイルロガー — 設計

- **Issue**: [QwenLM/qwen-code#4548](https://github.com/QwenLM/qwen-code/issues/4548)
- **ブランチ**: `feat/support_daemon_logger`
- **ステータス**: 設計承認済み、実装計画待ち
- **日付**: 2026-05-26

## 1. 問題

`qwen serve` はデーモンレベルの診断情報（ライフサイクル、ルートエラー、ACP 子プロセスの stderr）を `process.stderr` に出力します。これは systemd/Docker では機能しますが、SDK / デスクトップ / ローカルデーモンの利用では脆弱です。クライアントが `POST /session/:id/prompt` に対して HTTP 500 を受け取った場合、オペレーターが手動で stderr をリダイレクトしない限り、ルート + セッション + スタックのコンテキストは失われます。

`createDebugLogger`（`packages/core/src/utils/debugLogger.ts`）はセッションスコープです。有効な `DebugLogSession` が必要で、`${runtimeBaseDir}/debug/<sessionId>.txt` に書き込みます。serve デーモンはセッションが存在する**前に**起動するため、デーモンレベルの呼び出しは暗黙的に何も行いません。また、セッションごとの `debug/latest` のセマンティクスを変えずに再利用することもできません。

本設計では、デーモン固有のファイルシンクを追加します（既存の stderr 動作に加える形）。これにより、シェルリダイレクトなしでデーモンの診断情報が保持されます。

## 2. スコープ

### 対象

- `runQwenServe` プロセスごとに一度初期化される新しいロガー。
- ファイル: `${QWEN_RUNTIME_DIR または ~/.qwen}/debug/daemon/<daemon-id>.log`、追記モード。
- 以下の情報をティー出力:
  - `runQwenServe.ts` のライフサイクル / シャットダウン / シグナルメッセージ
  - `sendBridgeError`（`server.ts`）のルートエラー
  - `bridge.ts` の `writeServeDebugLine`（`QWEN_SERVE_DEBUG` が設定されている場合）
  - `spawnChannel.ts` の ACP 子プロセス stderr 転送
- `QWEN_DAEMON_LOG_FILE=0|false|off|no` によるオプトアウト。
- デーモンディレクトリ内の `latest` シンボリックリンク（`tail -f` 用）。
- serve CLI ドキュメントへの記載。

### 対象外（issue からの非目標）

- OpenTelemetry の置き換えやデーモントレーシングの追加。
- 構造化されたエンタープライズエラーログのエクスポート（issue #2014）。
- 既存のセッションデバッグログのローテーションや削除。
- デーモンログ自体のログローテーション / サイズ制限（後続の PR に延期）。起動時に既存ファイルが異常に大きい場合は stderr に警告を出力しますが、自動的な操作は行いません。

## 3. アーキテクチャ

### 3.1 モジュール境界

| レイヤー                                                  | 新規 / 変更 | 責務                                                                                                                          |
| -------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/serve/daemonLogger.ts`                 | **新規**    | シンク: 初期化、フォーマット、ファイル追記、stderr へのティー出力、フラッシュ、latest シンボリックリンク                         |
| `packages/cli/src/serve/runQwenServe.ts`                 | 変更        | 起動時にロガーを初期化; ライフサイクルの `writeStderrLine` を `daemonLog.*` に置き換え; シャットダウン時に `await flush()`; `onDiagnosticLine` を bridge に渡す |
| `packages/cli/src/serve/server.ts`                       | 変更        | `sendBridgeError(...)` が `daemonLog.error(...)` を通るように                                                                    |
| `packages/acp-bridge/src/types.ts` (`BridgeOptions`)     | 変更        | オプションの `onDiagnosticLine?: (line: string, level?: 'info' \| 'warn' \| 'error') => void` を追加                           |
| `packages/acp-bridge/src/bridge.ts:writeServeDebugLine`  | 変更        | `onDiagnosticLine` が注入されていれば、同じ行をティー出力                                                                      |
| `packages/acp-bridge/src/spawnChannel.ts`                | 変更        | 子プロセス stderr 転送がプレフィックス付きの各行を `onDiagnosticLine` にティー出力                                                |

**設計意図**: `daemonLogger.ts` は単一ファイル、cli ローカル、グローバルシングルトンなし。`acp-bridge` は cli について知らないまま — コールバックのみを見る。依存関係グラフは変更なし。

### 3.2 グローバルシングルトンなし

ロガーは `runQwenServe` 内で作成され、クロージャによって必要とする内部 serve モジュールに渡される（またはコールバックとして `acp-bridge` に渡される）。理由:

- `BridgeOptions` がすでに依存関係を注入する方法を反映している。
- `debugLogger` が歴史的に経験したテスト間の状態漏洩（`resetDebugLoggingState()` がそのために存在する）を回避する。

## 4. デーモン ID とファイルパス

- パス: `Storage.getGlobalDebugDir() + '/daemon/<daemon-id>.log'`
  - `${QWEN_RUNTIME_DIR または ~/.qwen}/debug/daemon/<daemon-id>.log` に解決される。
  - `Storage.getGlobalDebugDir()` を再利用するため、ランタイムディレクトリのオーバーライド（環境変数、コンテキスト）が自動的に適用される。
- `daemon-id` = `serve-${pid}-${workspaceHash}`
  - `workspaceHash` = `crypto.createHash('sha256').update(boundWorkspace).digest('hex').slice(0, 8)`
  - `pid` は同じワークスペース上の複数デーモンを区別する。
  - `workspaceHash` は固定長、ファイル名として安全、同じワークスペースパスに対して安定している。
- `latest` シンボリックリンク: `~/.qwen/debug/daemon/latest` → 現在のプロセスのログファイル。既存の `updateSymlink` ヘルパー（`packages/core/src/utils/symlink.ts`）を使用して初期化時に更新。シンボリックリンクの失敗はログに記録され無視される — 主要な書き込みを低下させない。`${runtimeBaseDir}/debug/latest`（セッションスコープ）とは非目標により区別される。
- ファイルモード: `'a'`（`O_APPEND | O_CREAT` による追記）。既存ファイルは再起動後もフォレンジックのために残る。

## 5. 公開 API

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
   * `err.stack` はメッセージの後にインデントされた継続行として追加される。
   * `err` と `ctx` はどちらもオプションで独立している。
   */
  error(message: string, err?: Error | null, ctx?: DaemonLogContext): void;
  /**
   * 呼び出し元がすでに stderr に書き込んでいる行（ACP 子プロセス stderr 転送、
   * `writeServeDebugLine`）のためのファイル専用ティー出力。その行は
   * 標準の `<timestamp> [<LEVEL>] [DAEMON] ` プレフィックスの下で
   * デーモンログに追加される。stderr にはエコー**されない**（オペレーターの出力が二重になるのを防ぐ）。
   */
  raw(line: string, level?: 'info' | 'warn' | 'error'): void;
  /** デーモンログファイルの絶対パス。 */
  getLogPath(): string;
  /** `serve-<pid>-<workspaceHash>`。 */
  getDaemonId(): string;
  /** 保留中の追記をフラッシュする。runQwenServe のシャットダウンハンドラーから呼び出される。 */
  flush(): Promise<void>;
}

export interface InitDaemonLoggerOptions {
  boundWorkspace: string;
  pid?: number; // デフォルト process.pid
  now?: () => Date; // デフォルト () => new Date()
  stderr?: (line: string) => void; // デフォルト writeStderrLine
  baseDir?: string; // デフォルト Storage.getGlobalDebugDir()
}

export function initDaemonLogger(opts: InitDaemonLoggerOptions): DaemonLogger;
```

`initDaemonLogger` は同期的に:

1. `daemonId` + ログパスを計算する。
2. `mkdirSync(parentDir, { recursive: true })` — 失敗 → 何もしないロガーを返し、stderr に一度警告を書き込む。起動は続行する。
3. `appendFileSync(path, '<first line>\n', { flag: 'a' })` — `daemon started pid=<pid> workspace=<boundWorkspace> version=<cli version>` を同期的に書き込む。これは書き込み可能性のプローブも兼ねる。EACCES/ENOSPC の場合、失敗モード = 何もしないロガー + stderr に一度警告。
4. `latest` シンボリックリンクを更新する（ベストエフォート、エラーは飲み込む）。
5. ロガーを返す。その後の `info/warn/error/raw` 呼び出しは非同期の `fs.promises.appendFile` をキューに入れる。

`process.env['QWEN_DAEMON_LOG_FILE']` が `0|false|off|no` のいずれかの場合、`initDaemonLogger` はファイルシステム呼び出しの前にショートサーキットして何もしないロガーになる。

## 6. ログ行のフォーマット

視覚的なパリティのために `debugLogger.buildLogLine` をミラーリング:

```
2026-05-26T03:14:15.926Z [ERROR] [DAEMON] [trace_id=... span_id=...] route=POST /session/:id/prompt sessionId=abc clientId=xyz daemon failed to ...
  at fn (file.ts:42:7)
  at ...
```

- タイムスタンプ: ISO 8601、UTC。
- レベル: `INFO` | `WARN` | `ERROR`。（初期段階では DEBUG なし — `QWEN_SERVE_DEBUG` は `raw()` を介して `INFO` として流れ込む。）
- タグ: リテラル `DAEMON`。
- トレースコンテキスト: 利用可能な場合 `trace.getActiveSpan()`。`debugLogger.getActiveSpanTraceContext` と同じロジック。ヘルパーは共有モジュール（`packages/core/src/utils/traceContext.ts`?）に抽出するか、ローカルに複製する — 計画に委ねる。
- コンテキストフィールド: `key=value` としてレンダリング、固定順序（`route`、`sessionId`、`clientId`、`childPid`、`channelId`）、その後追加のキーを辞書順にソート。空白または `=` を含む値は `JSON.stringify` で引用符で囲む。
- エラースタック: メッセージの後にインデントされた継続行として追加。
- `raw(line, level)` は、標準プレフィックス `<timestamp> [<LEVEL>] [DAEMON] ` の後にそのまま行を書き込み、追加の処理は行わない。

**ティーセマンティクス（重要）:**

- `info` / `warn` / `error` はデーモンログファイル**と** stderr（注入された `stderr` ライターを通じて）の**両方**に書き込む。以前の `writeStderrLine(...)` を置き換える呼び出し元はこれらを直接使用する。個別の stderr 呼び出しは不要。
- `raw` は**ファイルのみ**に書き込む。ACP 子プロセス stderr 転送および `writeServeDebugLine` で使用される。これらの呼び出し元は既存のパスを通じてすでに stderr に書き込んでいるため、二重にするとオペレーターの出力が氾濫する。

## 7. 起動 / シャットダウンフロー

```
runQwenServe(opts):
  ...
  daemonLog = initDaemonLogger({ boundWorkspace })
  writeStderrLine(`qwen serve: daemon log → ${daemonLog.getLogPath()}`)
  // 起動バナーは stderr のみ。行が自分自身を参照するのを避けるため。

  bridge = createHttpAcpBridge({
    ...,
    onDiagnosticLine: (line, level) => daemonLog.raw(line, level),
  })

  app = createServeApp({ ..., daemonLog })  // sendBridgeError のために注入

  shutdownHandler(signal):
    daemonLog.warn(`shutdown signal=${signal}`)
    await drainBridge()
    await daemonLog.flush()
    process.exit(0)
```

- 起動バナーは stderr のみ（パス行が自分自身を参照すると循環するため）。
- `initDaemonLogger` は同期的であるため、失敗は最初のエラー後に埋もれることなく、起動時にすぐに表示される。
- シャットダウン時の `flush()` は `process.exit` の前の最後の待機ステップ。SIGKILL は定義上フラッシュ不可 — それを受け入れる。

## 8. カバレッジテーブル

| ソース                                                       | 現在                                        | 以後                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `runQwenServe.ts` ライフサイクル / シグナル / 設定警告       | `writeStderrLine(...)`                       | `daemonLog.info \| warn(...)`（stderr は依然として発生 — `daemonLog` がティー出力する）        |
| `runQwenServe.ts` "listening on URL"（stdout）               | `writeStdoutLine(...)`                       | 変更なし — オペレータースクリプトは stdout を解析する                                          |
| `server.ts:sendBridgeError`                                  | `writeStderrLine(...)` に route/sessionId 付き | `daemonLog.error(msg, err, { route, sessionId, ... })`（stderr は daemonLog のティーによって依然として出力） |
| `bridge.ts:writeServeDebugLine`（`QWEN_SERVE_DEBUG`）        | `writeStderrLine('qwen serve debug: ...')`   | `onDiagnosticLine(line, 'info')` にティー出力                                                  |
| `spawnChannel.ts` 子プロセス stderr                          | `process.stderr.write(prefix + line + '\n')` | さらに `onDiagnosticLine(prefix + line, 'warn')`                                               |
| `writeStdoutLine` 呼び出し元                                  | 変更なし                                      | 変更なし                                                                                        |
| CLI 使用法 / argparse エラー（`runQwenServe` の初期検証）    | `writeStderrLine(...)`                       | 変更なし（ロガーがまだ存在しない可能性がある）                                                    |

既存のすべての stderr 書き込みは保持される。デーモンログは**追加的**であり、決して代替ではない。

## 9. 書き込みパスとフラッシュ

- 内部キュー: 単一の `Promise<void>` チェーン（`this.pending = this.pending.then(() => fs.promises.appendFile(...))`）。
- 各 `info/warn/error/raw` 呼び出しは追記（ファイル）をキューに入れ、`info/warn/error` の場合は注入された `stderr` ライターも同期的に呼び出す。
- Stderr の書き込み順序は保持される（同期的、追記のキューイング前）。ファイルの追記はキューイング順で結果的に整合性が保たれる。
- 書き込み失敗は内部の `degraded` フラグを設定し、一度だけ stderr 警告を出力する。後続の呼び出しは依然として書き込みを試みるが、カウンターは維持されない。
- `flush()` は現在の末尾の Promise を返す。
- バッファリング層なし: 各呼び出し = 1 つの `appendFile`。ボリュームは低い（ルートエラー + ライフサイクル）。マイクロバッチは時期尚早な最適化。

## 10. 設定

| 環境変数                                        | 動作                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `QWEN_DAEMON_LOG_FILE=0\|false\|off\|no`        | `initDaemonLogger` は何もしないロガーを返す。ティーは何もしない。stderr は変更なし。 |
| `QWEN_DAEMON_LOG_FILE=<その他>` または未設定     | 有効（デフォルト）                                                           |
| `QWEN_RUNTIME_DIR=<path>`                       | `~/.qwen` ルートを再配置。デーモンログもそれに伴って移動する（既存のセマンティクス） |
| `QWEN_SERVE_DEBUG=1`                            | 既存 — `writeServeDebugLine` がアクティブになる。行がデーモンログにもティー出力されるようになる |

`QWEN_DAEMON_LOG_FILE` は意図的に `QWEN_DEBUG_LOG_FILE` とは別にしている。これにより、セッションごとのデバッグログを無効にしても、オペレーターのデーモンログが影響を受けない（逆も同様）。

## 11. エラー処理

- `initDaemonLogger` の mkdir/open 失敗 → 何もしないロガー + stderr に一度警告。デーモンの起動は続行する。オペレーターはファイルには何も表示されないが、stderr は受け取る。
- 追記ごとの失敗 → degraded フラグを反転、stderr に一度警告を出力、試行を継続する。Issue は degradation モードの UI シグナルについて何も言及していないため、公開サーフェスは不要。
- `flush()` の拒否 → シャットダウンハンドラーでキャッチされ、`writeStderrLine` を介してログに記録される。終了をブロックしない。
- `latest` シンボリックリンクの失敗 → 飲み込まれる。主要な書き込みには影響しない。

## 12. テスト

### `daemonLogger.test.ts`（新規）

- サンドボックス化された `baseDir`、モック化された `now`、`pid`、`stderr`。
- 既知の入力に対する 8 文字の `workspaceHash` を含むパスとデーモン ID の導出。
- 同一ディレクトリ内での後続の `initDaemonLogger` 呼び出しで `latest` シンボリックリンクが作成・更新されること。
- レベルフォーマット（INFO/WARN/ERROR）、コンテキストフィールド順序、エラースタックの継続。
- アクティブなスパンが存在する場合のトレースコンテキスト注入。
- `raw(line, level)` がプレフィックス付きの行をそのまま書き込むこと。
- `flush()` はキューに入れられたすべての書き込みがファイルに到達した後にのみ解決されること。
- `QWEN_DAEMON_LOG_FILE=0` → ファイルが作成されないこと。
- `mkdir` 失敗 → 何もしないロガー、stderr に一度警告、後続の呼び出しで例外が発生しないこと。
- `appendFile` 失敗 → degraded フラグが反転、stderr に一度警告。

### `runQwenServe.test.ts`（拡張）

- 起動時に `daemon started ...` 行がログに書き込まれること。
- シャットダウンハンドラーが `process.exit` の前に `daemonLog.flush()` を待機すること。
- Stderr の起動バナーにデーモンログパスが含まれること。

### `server.test.ts`（拡張）

- 例外をスローするルートが、正しい `route` と `sessionId` で `daemonLog.error(...)` にエラーをルーティングすること。

### acp-bridge テスト（拡張）

- `QWEN_SERVE_DEBUG=1` の場合に `writeServeDebugLine` から、また `spawnChannel` の子プロセス stderr 転送から `onDiagnosticLine` コールバックが呼び出されること。テストはキャプチャするフェイクを注入し、ファイルシステムは使用しない。

## 13. ドキュメント

- `docs/cli/serve.md`（または serve がドキュメント化されている場所）に「デーモンログファイル」セクションを追加: パス、デーモン ID フォーマット、`latest` シンボリックリンク、`QWEN_DAEMON_LOG_FILE` オプトアウト、セッションごとの `debug/<sessionId>.txt` との区別。
- `packages/cli/src/serve/` の下に README が存在する場合はそれにも追加。
- このリポジトリには CHANGELOG スタイルのファイルはなし。リリースノートは別途処理。

## 14. ロールバック

- 純粋に追加的な変更。ロールバック = コミットを元に戻す:
  - `daemonLogger.ts` + そのテストを削除。
  - `runQwenServe.ts` のライフサイクル / sendBridgeError / bridge / spawnChannel の変更を元に戻す。
  - `BridgeOptions` から `onDiagnosticLine` を削除。
- ディスク上の状態をクリーンアップする必要なし。既存のデーモンログファイルは孤立するが無害。

## 15. 受け入れ基準（issue より）

| 基準                                                             | 対応方法                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `qwen serve` がシェルリダイレクトなしでデーモンログを作成/追記する | `initDaemonLogger` が起動時にファイルを開く                                                          |
| `POST /session/:id/prompt` からの HTTP 500 がデーモンログで関連付け可能 | `sendBridgeError` が `route=` + `sessionId=` を書き込む                                           |
| ACP 子プロセスの stderr 行もデーモンログに含まれる               | `spawnChannel` が `onDiagnosticLine` を通じてティー出力                                              |
| 最初のセッション前および全セッション終了後もログが機能する       | セッションスコープではない。デーモンのライフタイムで動作する                                        |
| 既存の stderr 動作がそのまま維持される                           | すべての書き込みは追加的。同等のものを残さずに `writeStderrLine` 呼び出しが削除されることはない      |
| ログパスとオプトアウトがドキュメント化される                     | §13 のドキュメントセクション                                                                       |

## 16. 未解決の質問

ブロックするものはなし。考えられるフォローアップ:

- `latest` シンボリックリンクは `~/.qwen/debug/daemon/latest` か `~/.qwen/debug/daemon-latest` のどちらに置くべきか。仕様では前者を選択（ディレクトリの整理のため）。
- 将来のフラグ（例: `QWEN_DAEMON_LOG_FORMAT=json`）として JSON 行出力を提供すべきか。この PR ではスコープ外。構造化エクスポートは #2014 の担当。
```