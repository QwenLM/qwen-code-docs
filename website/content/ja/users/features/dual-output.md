# デュアル出力

デュアル出力は、インタラクティブ TUI のサイドカーモードです。Qwen Code が `stdout` に通常どおりレンダリングし続けながら、構造化された JSON イベントストリームを別チャンネルに同時出力します。これにより、IDE 拡張機能、Web フロントエンド、CI パイプライン、自動化スクリプトなどの外部プログラムがセッションを監視・操作できます。

逆方向チャンネルも提供されています。外部プログラムが TUI の監視対象ファイルに JSONL コマンドを書き込むことで、プロンプトの送信やツール権限リクエストへの応答を、まるで人間がキーボードを操作しているかのように行えます。

デュアル出力は完全にオプションです。以下のフラグを指定しない場合、TUI は従来どおりの動作を維持し、追加の I/O や動作変更は一切発生しません。

## ユースケース

デュアル出力は低レベルの配管プリミティブです。以下に具体的な活用例を示します。

### ターミナル + チャットのデュアルモードリアルタイム同期

主要なユースケースです。Web またはデスクトップの ChatUI が PTY 内で TUI をホストし、構造化イベントストリームによって駆動される並列会話ビューをレンダリングします。

- ユーザーはどちらの画面でも入力できます。TUI（ターミナルネイティブのパワーユーザー向け）または Web UI（より豊かな UX、共有可能なリンク、モバイル向け）。すべてのメッセージが同じ JSON イベントを通じて流れるため、両方のビューが同期されます。
- ツール承認プロンプトが両方の場所に表示され、先に承認した側が有効になります。
- セッション履歴は `--json-file` から逐語的にキャプチャされるため、サーバーサイドは ANSI を解析せずに正規の機械可読トランスクリプトを取得できます。

### IDE 拡張機能（VS Code / JetBrains / Cursor / Neovim）

Qwen Code を IDE 内に埋め込みます。TUI はエディタの統合ターミナルパネルで実行され（必要なユーザー向け）、拡張機能は `--json-fd` / `--json-file` イベントを消費して以下を実現します。

- エージェントがファイルを変更した際のインライン差分オーバーレイ。
- フォーマットされた Markdown、シンタックスハイライトされたツール呼び出し、クリック可能な引用を含む Webview サイドパネル。
- ステータスバーインジケーター（思考中 / 応答中 / 承認待ち）。
- ユーザーがネイティブ IDE の承認ボタンをクリックした際のプログラムによる `confirmation_response` の書き込み。

### ブラウザベースのチャットフロントエンド

Node/Bun サーバーがレンダリングセマンティクスのために PTY 内で TUI を起動し、WebSocket チャンネルをブラウザに公開します。`--json-file` 上のイベントはクライアントに転送され、ブラウザで入力されたメッセージは `--input-file` 経由で注入されます。どちら側も ANSI の解析は不要です。

### CI / 自動化オブザーバー

CI ジョブがタスクプロンプトを付けて Qwen Code を実行します。人間はジョブログで TUI を確認し、CI システムは `--json-file` を監視して以下を行います。

- `result` イベントがエラーを報告した場合にジョブを失敗させる。
- `token usage` / `duration_ms` / `tool_use` のカウントをメトリクスに送信する。
- 完全なトランスクリプトをビルドアーティファクトとしてアーカイブする。

### マルチエージェントオーケストレーション

スーパーバイザーエージェントが複数の TUI ワーカーを起動し、それぞれに独自のイベント/入力ファイルペアを持たせます。進捗を監視し、フォローアッププロンプトを注入し、すべてのワーカーにわたってツール呼び出しを承認または拒否することでグローバルな予算/安全ポリシーを適用します。

### セッション記録、監査、リプレイ

`--json-file` を使ってすべての TUI セッションを通常ファイルに記録します。その後：

- コンプライアンス監査で何が実行されたかを正確に再現できます。
- 自動回帰テストでモデルバージョン間の実行結果を比較できます。
- リプレイツールが同じプロトコルでイベントを再送信し、可視化ダッシュボードに供給できます。

### オブザーバビリティダッシュボード

`--json-file` を Loki / OTEL / JSONL を受け付ける任意のパイプラインにストリーミングします。`usage.input_tokens`、`tool_use.name`、`result.duration_api_ms` を Grafana のファーストクラスメトリクスとして抽出できます。ログ解析の正規表現は不要です。

### テストと QA

インテグレーションテストが Qwen Code をヘッドレスで起動し、`--input-file` スクリプトで操作して `--json-file` イベントをアサートします。stdout の ANSI を解析するのと異なり、アサーションは UI のリファクタリングをまたいで安定しています。

## フラグ

| フラグ                  | 型               | 目的                                                                                                                                    |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`       | number, `n >= 3` | 構造化 JSON イベントをファイルディスクリプタ `n` に書き込みます。呼び出し元は spawn の `stdio` 設定またはシェルリダイレクトでこの fd を提供する必要があります。 |
| `--json-file <path>`  | path             | 構造化 JSON イベントをファイルに書き込みます。パスは通常ファイル、FIFO（名前付きパイプ）、または `/dev/fd/N` を指定できます。               |
| `--input-file <path>` | path             | 外部プログラムが書き込む JSONL コマンドをこのファイルで監視します。                                                                         |

`--json-fd` と `--json-file` は相互に排他的です。TUI 自身の出力を破壊しないよう、fd 0、1、2 は拒否されます。

## なぜ出力フラグが 2 つあるのか（`--json-fd` vs `--json-file`）

一見 `--json-fd` だけで十分に見えます。呼び出し元が Qwen Code を追加ファイルディスクリプタ付きで起動し、TUI がそこにイベントを書き込むだけです。しかし実際には、最も重要な埋め込みシナリオ（TUI を疑似端末（PTY）内で実行する場合）で fd 受け渡しが機能しなくなります。そのためこの機能ではパスベースの代替手段も提供しています。

### `--json-fd` が機能する場合

`stdio` 配列を使った純粋な `child_process.spawn`：

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node の spawn は任意の `stdio` エントリをサポートします。fd 3 は子プロセスに継承され、直接書き込めます。コピーなし、バッファなし、ファイルシステムなし — 最速のパスです。

### PTY 下で `--json-fd` が**機能しない**理由

[`node-pty`](https://github.com/microsoft/node-pty) や [`bun-pty`](https://github.com/oven-sh/bun) のような PTY ラッパーは、インタラクティブ TUI をホストするための標準的な手段です（IDE 拡張機能、Web ターミナル、tmux ライクなマルチプレクサ）。これらは 3 つの相互に補強する理由から、追加の fd を子プロセスに転送できません。

1. **API の制約。** `node-pty.spawn(file, args, options)` は `cwd`、`env`、`cols`、`rows`、`encoding` などを受け付けますが、**`stdio` 配列は受け付けません**。「fd 3 も子プロセスに fd 3 として接続する」と指定する場所が API に存在しません。`bun-pty` も同じ形状です。
2. **`forkpty(3)` のセマンティクス。** 内部的に PTY ラッパーは `forkpty(3)`（または同等の `posix_openpt` + `login_tty` の組み合わせ）を呼び出します。このシスコールはマスター/スレーブ疑似端末ペアを割り当て、子プロセスの fd 0/1/2 をスレーブ側にリダイレクトして、子プロセスが本物の端末に接続されているように見せます。親プロセスの fd 2 より上はすべて `login_tty` によって閉じられます（`exec` の前に `fd >= 3` に対して `close(fd)` を呼び出す）。追加の fd は継承されず、積極的に消去されます。
3. **制御端末の副作用。** 仮に追加の fd をハックで通せたとしても、それは端末ではないため、子プロセスの TUI レンダラー（fd 1 の TTY を前提にエスケープシーケンスを書き込む）は依然としてスレーブを必要とします。結局 2 つの独立したトランスポートが生まれることになります。

要するに、埋め込み側が TUI レンダリングのために本物の TTY を必要とする瞬間（すべての IDE 拡張機能、すべての Web ターミナル、すべてのデスクトップチャットアプリがそれに当たります）、fd 継承は選択肢から外れます。

### `--json-file` がギャップを埋める

ファイルパスは通常の CLI 引数として渡されるため、あらゆる spawn モデルで機能します。

```ts
import { spawn } from 'node-pty';

const pty = spawn(
  'qwen',
  [
    '--json-file',
    '/tmp/qwen-events.jsonl',
    '--input-file',
    '/tmp/qwen-input.jsonl',
  ],
  { cols: 120, rows: 40 },
);
```

子プロセス自身がファイルを開いてイベントを書き込み、埋め込み側は `fs.watch` + インクリメンタルリードで同じパスを監視します。注意点が 3 つあります。

- **通常ファイル**、FIFO（名前付きパイプ）、`/dev/fd/N` はすべて機能します。FIFO は両側が同じホスト上にある場合に最も低レイテンシーです。
- ブリッジは FIFO を `O_NONBLOCK` で開き、`ENXIO`（まだリーダーなし）時はブロッキングモードにフォールバックするため、コンシューマーを待って PTY の起動がデッドロックすることはありません。
- マルチセッションの分離には、`$XDG_RUNTIME_DIR` 配下または `mkdtemp` で作成したモード `0700` のディレクトリのセッションごとのパスを使用してください。

### どちらのフラグを使うべきか

| 埋め込みスタイル                                   | 使用するフラグ          |
| ------------------------------------------------- | -------------------- |
| `child_process.spawn` を使った通常の stdio        | `--json-fd`          |
| `node-pty` / `bun-pty` / 任意の PTY ホスト       | `--json-file`        |
| シェルリダイレクト / 手動パイプラインテスト         | どちらでも可          |
| CI ログ収集（通常ファイル、終了後に読み取り）       | `--json-file`        |
| 同一ホスト上での最低レイテンシー                    | `--json-file` + FIFO |

一般的なルール：**TUI を正しくレンダリングする必要がある場合は PTY が必要であり、つまり `--json-file` が必要です。** `--json-fd` は、TUI の忠実度を気にしない、通常 stdout を捨てるプログラム的ラッパーのような、よりシンプルな埋め込み側向けです。

## クイックスタート

通常ファイルを使って両方のチャンネルを有効にして Qwen Code を実行します。

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

2 つ目のターミナルでイベントストリームを監視します。

```bash
tail -f /tmp/qwen-events.jsonl
```

3 つ目のターミナルから実行中の TUI にプロンプトを送信します。

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

プロンプトはユーザーが入力したかのように TUI に表示され、ストリーミングレスポンスが `/tmp/qwen-events.jsonl` にミラーリングされます。

### イベント出力に FIFO（名前付きパイプ）を使用する

FIFO は通常ファイルよりも低レイテンシーで（ディスク I/O なし）、両側が同じホスト上にある場合に適しています。ブリッジは FIFO を `O_RDWR | O_NONBLOCK` で開くため、まだリーダーが接続されていなくても**ブロックしません**。イベントはリーダーが接続するまでカーネルのパイプバッファにバッファリングされます。

> **Note:** `--input-file` は通常ファイルが必要です（FIFO は不可）。ウォッチャーが新しいデータを検出するために `stat.size` に依存しており、FIFO では常に 0 になるためです。

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# TUI はすぐに起動します — 先にリーダーを起動する必要はありません。

# 2 つ目のターミナルで準備ができたら接続します：
cat /tmp/qwen-events.jsonl
```

リーダーがまったく接続されない場合、内部バッファが 1 MB を超えるとブリッジは自動的に無効化されます。TUI は通常どおり実行を継続します。

## 出力イベントスキーマ

イベントは JSON Lines 形式（1 行に 1 オブジェクト）で出力されます。スキーマは非インタラクティブの `--output-format=stream-json` モードで使用されるものと同じで、`includePartialMessages` は常に有効になっています。

チャンネルの最初のイベントは常に `system` / `session_start` で、ブリッジ構築時に出力されます。他のイベントが到着する前にチャンネルをセッション ID と関連付けるために使用してください。

```jsonc
// セッションのライフサイクル
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// 処理中のアシスタントターンのストリーミングイベント
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// 完了したメッセージ
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// 権限コントロールプレーン（ツールの承認が必要な場合のみ）
{
  "type": "control_request",
  "request_id": "...",
  "request": {
    "subtype": "can_use_tool",
    "tool_name": "run_shell_command",
    "tool_use_id": "...",
    "input": { "command": "rm -rf /tmp/x" },
    "permission_suggestions": null,
    "blocked_path": null
  }
}
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "...",
    "response": { "allowed": true }
  }
}
```

`control_response` は、決定が TUI（ネイティブ承認 UI）で行われた場合でも、外部の `confirmation_response`（下記参照）で行われた場合でも出力されます。いずれの場合も、すべてのオブザーバーが最終結果を確認できます。

## 入力コマンドスキーマ

`--input-file` では 2 種類のコマンド形式を受け付けます。

```jsonc
// プロンプトキューにユーザーメッセージを送信する
{ "type": "submit", "text": "What does this function do?" }

// 保留中の control_request に返答する
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

動作：

- `submit` コマンドはキューに入れられます。TUI が応答中の場合、次に TUI がアイドル状態に戻ったときに自動的に再試行されます。
- `confirmation_response` コマンドは即座にディスパッチされ、キューには入れられません。ツール呼び出しはブロッキングであり、レスポンスは以前の `submit` を待たずに基盤となる `onConfirm` ハンドラーに届く必要があるためです。
- ツールを最初に承認した側が有効になり、もう一方の遅れた応答は無害に破棄されます。
- JSON として解析できない行はログに記録されてスキップされます。ウォッチャーは停止しません。

## レイテンシーについて

入力ファイルは 500 ms のポーリング間隔で `fs.watchFile` によって監視されます。そのため、リモートの `submit` の最悪ケースのラウンドトリップレイテンシーは約 0.5 秒です。これは意図的な設計です。ポーリングはプラットフォームやファイルシステム（macOS / ネットワークマウントを含む）をまたいでポータブルであり、この機能が対象とする典型的な人間が介在するペースに合っています。出力チャンネルにポーリングはなく、TUI がイベントを出力するたびに同期的に書き込まれます。

## 障害モード

- **不正な fd。** `--json-fd` に渡された fd が開いていない、または 0/1/2 のいずれかである場合、TUI は `stderr` に警告を出力し、デュアル出力を無効にして続行します。
- **不正なパス。** `--json-file` に渡されたファイルが開けない場合、TUI は警告を出力し、デュアル出力を無効にして続行します。
- **コンシューマーの切断。** チャンネルのもう一方のリーダーが消えた場合（`EPIPE`）、ブリッジは静かに自身を無効化し、TUI は実行を継続します。再試行はありません。
- **FIFO バッファオーバーフロー。** リーダーが接続されていない FIFO に書き込む場合、イベントはカーネルパイプ（Linux では約 64 KB）と Node.js の WriteStream にバッファリングされます。パイプがいっぱいになるか内部バッファが 1 MB を超えると、ブリッジは自身を無効化して fd を閉じます。この場合 `session_end` は出力されません。コンシューマーは `session_end` なしでストリームが閉じた場合は異常終了として扱うべきです。TUI は通常どおり実行を継続します。
- **アダプター例外。** イベント出力中にスローされた例外はキャッチされ、ログに記録され、ブリッジを無効化します。デュアル出力の障害で TUI がクラッシュすることはありません。

## Spawn の例

典型的な埋め込み親プロセスが両方のチャンネルを付けて Qwen Code を起動します。

```ts
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';

const eventsFd = openSync('/tmp/qwen-events.jsonl', 'w');
const child = spawn(
  'qwen',
  ['--json-fd', '3', '--input-file', '/tmp/qwen-input.jsonl'],
  { stdio: ['inherit', 'inherit', 'inherit', eventsFd] },
);
```

TUI はユーザーのターミナルを stdio 0/1/2 で引き続き管理し、埋め込み側は fd 3 のバッキングファイルで構造化イベントを読み取り、JSONL 行を `/tmp/qwen-input.jsonl` に追記することでコマンドを送信します。

## 設定ファイルによる構成

長期間稼働する埋め込み側では、毎回の起動で CLI フラグを渡すのが不便な場合があります。同じチャンネルを `settings.json` のトップレベルの `dualOutput` キーで設定できます。

```jsonc
// ~/.qwen/settings.json  (ユーザーレベル)
// または <workspace>/.qwen/settings.json  (ワークスペースレベル)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

優先順位のルール：

- CLI フラグが設定より**優先**されます。コマンドラインで `--json-file /foo` を指定すると、設定の `dualOutput.jsonFile` が上書きされます。
- `--json-fd` には設定での対応がありません。fd 受け渡しは起動時の懸念事項であり、静的に宣言できません。
- フラグも設定もない場合、デュアル出力は無効のままです（現在のデフォルトと同一）。

`requiresRestart: true` フラグは、ブリッジが起動時に一度だけ構築されるため、変更は次回の Qwen Code 起動時にのみ有効になることを意味します。

## 実行可能なデモ

以下のスクリプトはすべてコピー&ペーストで即実行できます。POC&nbsp;1 でビルドにデュアル出力が含まれているか確認し、POC&nbsp;4 が実際の IDE 拡張機能統合に最も近い例です。

### POC 1 — イベントストリームを観察する

人間が通常どおり使用している間、TUI が出力するすべての構造化イベントを監視します。

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...通常どおりチャットすると、Terminal A にリアルタイムで
# session_start、user/assistant/result/control_request のライフサイクルが表示されます。
```

Terminal A の最初の出力行：

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — 外部からプロンプトを注入する

最初のターミナルのキーボードに触れずに、2 つ目のターミナルから TUI を操作します。

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — TUI があなたが入力したかのように応答します
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — リモートツール権限ブリッジ

別プロセスからツール呼び出しを承認または拒否します。

```bash
# Terminal A — control_requests を監視する
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# 承認が必要な操作を Qwen に依頼します（例：「`ls -la /tmp` を実行して」）。
# Terminal A に control_request が表示されます。
# request_id をコピーして、3 つ目のターミナルで実行します：
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# TUI の確認プロンプトが消えてツールが実行されます。
```

不明な `request_id` で返答した場合、ブリッジは出力チャンネルに `subtype: "error"` の `control_response` を出力するため、コンシューマーはログに記録するか再試行できます。

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "...",
    "error": "unknown request_id (already resolved, cancelled, or never issued)"
  }
}
```

### POC 4 — Node 埋め込み（IDE ライク）

最もリアルな形態：親プロセスが Qwen Code を起動し、イベントを監視し、独自のスケジュールでプロンプトを注入します。

```ts
// demo-embedder.ts
import { spawn } from 'node:child_process';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const events = join(tmpdir(), `qwen-events-${process.pid}.jsonl`);
const input = join(tmpdir(), `qwen-input-${process.pid}.jsonl`);
writeFileSync(events, '');
writeFileSync(input, '');

const child = spawn('qwen', ['--json-file', events, '--input-file', input], {
  stdio: 'inherit',
});

// 出力チャンネルを監視します。本番環境では適切な
// バイトオフセットテールを使用します。これは簡潔さのため 0 から再ストリームします。
const rl = createInterface({
  input: createReadStream(events, { encoding: 'utf8' }),
});
rl.on('line', (line) => {
  if (!line.trim()) return;
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    console.log('[embedder] handshake:', {
      protocol_version: ev.data.protocol_version,
      version: ev.data.version,
      supported_events: ev.data.supported_events,
    });
    // 機能を使用する前に機能検出を行う
    if (ev.data.supported_events.includes('control_request')) {
      console.log('[embedder] permission control-plane available');
    }
  }
  if (ev.type === 'assistant') {
    console.log(
      '[embedder] assistant turn ended, tokens =',
      ev.message.usage?.output_tokens,
    );
  }
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] session ended cleanly');
  }
});

// 2 秒後に、ユーザーが入力したかのようにプロンプトを注入する
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```

実行方法：

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI が現在のターミナルで開き、埋め込み側は
# ハンドシェイク + ターン終了 + session_end イベントを親の stdout にログします。
```

### POC 5 — 機能ハンドシェイクによる機能検出

古い Qwen Code バージョンは `protocol_version` を出力しません。フィールドをオプションとして扱い、機能検出を行います。

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_start') {
    const v = ev.data?.protocol_version ?? 0;
    if (v < 1) {
      console.error(
        'qwen-code dual output is present but protocol < 1; ' +
          'falling back to best-effort behavior',
      );
    } else {
      console.log('qwen-code dual output protocol v' + v);
    }
  }
});
```

### POC 6 — クリーン終了シグナルとしての session_end

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // メトリクスのフラッシュ、WebSocket のクローズなど
  }
});
```

TUI が `session_end` の前にクラッシュした場合、出力ストリームは閉じられます（次の書き込み時に `EPIPE`）。埋め込み側は両方のパスを処理する必要があります。

### POC 7 — 障害テスト（フラグが TUI を壊さないことを証明する）

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI は通常どおり起動します。

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI は通常どおり起動します。

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs が拒否: "--json-fd and --json-file are mutually exclusive."
# TUI が起動する前にプロセスが終了します。

qwen --json-file /nonexistent/dir/x.jsonl
# stderr の警告が表示され、TUI は通常どおり起動します。
```

## Claude Code との関係

Claude Code は `--print --output-format stream-json` で同様の stream-json イベント形式を公開していますが、非インタラクティブモードのみです。TUI と構造化サイドカーチャンネルを同時に実行する同等の機能はありません。デュアル出力はそのギャップを埋めます。
