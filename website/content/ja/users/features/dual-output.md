# デュアル出力

デュアル出力は、インタラクティブTUIのサイドカーモードです。Qwen Codeが`stdout`で通常通りレンダリングを行いながら、同時に構造化されたJSONイベントストリームを別のチャネルに出力します。これにより、IDE拡張、Webフロントエンド、CIパイプライン、自動化スクリプトなどの外部プログラムがセッションを監視・制御できるようになります。

また、リバースチャネルも提供します。外部プログラムがJSONLコマンドをファイルに書き込むと、TUIがそれを監視し、人間がキーボードを操作しているかのようにプロンプトの送信やツール許可要求への応答を行うことができます。

デュアル出力は完全にオプションです。以下のフラグがない場合、TUIは以前とまったく同じ動作をし、追加のI/Oや動作変更は発生しません。

## ユースケース

デュアル出力は低レベルの配管プリミティブです。以下は、それによって可能になる具体的な統合例です。

### ターミナル + チャット デュアルモードのリアルタイム同期

主要なユースケースです。WebまたはデスクトップのChatUIがPTY内でTUIをホストし、構造化イベントストリームに基づいたパラレルな会話ビューをレンダリングします。

- ユーザーはどちらの画面でも入力できます。TUI（ターミナルネイティブのパワーユーザー向け）またはWeb UI（リッチなUX、共有可能なリンク、モバイル対応）です。すべてのメッセージが同じJSONイベントを通じて流れるため、両方のビューは同期を保ちます。
- ツール承認プロンプトが両方の場所に表示されます。先に承認した方が勝ちです。
- セッション履歴は`--json-file`からそのままキャプチャされるため、サーバー側ではANSIをパースすることなく機械可読な完全なトランスクリプトを取得できます。

### IDE拡張（VS Code / JetBrains / Cursor / Neovim）

IDE内にQwen Codeを埋め込みます。TUIはエディタの統合ターミナルパネルで実行され（ユーザーが希望する場合）、拡張機能は`--json-fd` / `--json-file`のイベントを消費して以下を駆動します。

- エージェントがファイルに触れたときのインラインディフオーバーレイ。
- 整形されたMarkdown、シンタックスハイライトされたツール呼び出し、クリック可能な引用を含むWebビューサイドパネル。
- ステータスバーインジケーター（思考中 / 応答中 / 承認待ち）。
- ユーザーがネイティブIDEの承認ボタンをクリックしたときのプログラムによる`confirmation_response`の書き込み。

### ブラウザベースのチャットフロントエンド

Node/BunサーバーがレンダリングセマンティクスのためにPTY内でTUIを起動しますが、ブラウザにはWebSocketチャネルを公開します。`--json-file`上のイベントはクライアントに転送され、ブラウザで入力されたユーザーメッセージは`--input-file`を介して注入されます。どちらの側でもANSIパースは必要ありません。

### CI / 自動化オブザーバー

CIジョブがタスクプロンプト付きでQwen Codeを実行します。人間はジョブログでTUIを確認できます。CIシステムは`--json-file`を監視して以下を行います。

- `result`イベントがエラーを報告した場合、ジョブを失敗させる。
- `token usage` / `duration_ms` / `tool_use` のカウントをメトリクスにプッシュする。
- 完全なトランスクリプトをビルドアーティファクトとしてアーカイブする。

### マルチエージェントオーケストレーション

スーパーバイザーエージェントが複数のTUIワーカーを起動し、それぞれに独自のイベント/入力ファイルペアを割り当てます。進行状況を監視し、フォローアッププロンプトを注入し、すべてのワーカーにわたってツール呼び出しを承認または拒否することでグローバルな予算/セーフティポリシーを適用します。

### セッション記録、監査、リプレイ

すべてのTUIセッションを`--json-file`で通常のファイルに保存します。後で以下が可能です。

- コンプライアンス監査で、何が実行されたかを正確に再構築できます。
- 自動回帰テストで、モデルバージョン間の実行を比較できます。
- リプレイツールで、同じプロトコルを通じてイベントを再送し、可視化ダッシュボードにフィードできます。

### 可観測性ダッシュボード

`--json-file`をLoki / OTEL / JSONLを受け入れる任意のパイプラインにストリーミングします。`usage.input_tokens`、`tool_use.name`、`result.duration_api_ms`をGrafanaのファーストクラスメトリクスとして抽出します。ログパース用の正規表現は不要です。

### テストとQA

統合テストではQwen Codeをヘッドレスで起動し、`--input-file`スクリプトで駆動し、`--json-file`イベントに対してアサーションを行います。stdoutのANSIをパースするのと異なり、アサーションはUIのリファクタリングに対して安定しています。

## フラグ

| フラグ                  | 型               | 目的                                                                                                                                    |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `--json-fd <n>`       | 数値、`n >= 3` | 構造化JSONイベントをファイルディスクリプタ `n` に書き込みます。呼び出し元は、spawnの`stdio`設定またはシェルリダイレクトでこのfdを提供する必要があります。 |
| `--json-file <path>`  | パス             | 構造化JSONイベントをファイルに書き込みます。パスは通常のファイル、FIFO（名前付きパイプ）、または `/dev/fd/N` にできます。                    |
| `--input-file <path>` | パス             | このファイルを監視して、外部プログラムによって書き込まれたJSONLコマンドを読み取ります。                                                         |

`--json-fd` と `--json-file` は相互排他的です。fd 0、1、2は拒否され、TUI自身の出力を破損するのを防ぎます。

## なぜ2つの出力フラグがあるのか？（`--json-fd` と `--json-file`）

一見すると `--json-fd` で十分に思えます。呼び出し元が追加のファイルディスクリプタ付きでQwen Codeを起動し、TUIがイベントをそこに書き込めば完了です。しかし実際には、fdの受け渡しは最も重要な埋め込みシナリオ、つまり疑似端末（PTY）内でTUIを実行する場合に機能しません。そのため、この機能はパスベースの代替手段も提供します。

### `--json-fd` が機能する場合

純粋な `child_process.spawn` と `stdio` 配列：

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Nodeのspawnは任意の `stdio` エントリをサポートします。fd 3は子プロセスに継承され、直接書き込むことができます。ゼロコピー、ゼロバッファ、ゼロファイルシステム——最速のパスです。

### なぜ `--json-fd` はPTY下では**機能しない**のか

PTYラッパー（[`node-pty`](https://github.com/microsoft/node-pty) や [`bun-pty`](https://github.com/oven-sh/bun)）は、本格的な埋め込み（IDE拡張、Webターミナル、tmuxのようなマルチプレクサ）がインタラクティブTUIをホストする方法です。これらは追加のfdを子プロセスに転送できません。理由は3つあります。

1. **APIサーフェス。** `node-pty.spawn(file, args, options)` は `cwd`、`env`、`cols`、`rows`、`encoding` などを受け入れますが、**`stdio`配列はありません**。APIに「このfdを子プロセスのfd 3としてもアタッチする」という指定方法が単純に存在しません。`bun-pty` も同じ形状を公開しています。
2. **`forkpty(3)` のセマンティクス。** 内部で、PTYラッパーは `forkpty(3)`（または同等の `posix_openpt` + `login_tty` の処理）を呼び出します。このシステムコールはマスター/スレーブ疑似端末ペアを割り当て、子プロセスのfd 0/1/2をスレーブ側にリダイレクトし、子プロセスが実際の端末に接続されていると思い込ませます。親プロセスで2より大きいfdは、`login_tty` によって閉じられます。`login_tty` は `exec` の前に `close(fd)`（`fd >= 3` に対して）を呼び出します。追加のfdは継承されるどころか、積極的に消去されます。
3. **制御端末の副作用。** 仮に追加のfdを通すことができたとしても、それは端末ではないため、子プロセスのTUIレンダラー（fd 1がTTYであることを前提にエスケープシーケンスを書き込む）は、出力のために依然としてスレーブを必要とします。結局、2つの独立したトランスポートになってしまいます。

つまり、TUIレンダリングに実際のTTYが必要な埋め込み（すべてのIDE拡張、Webターミナル、デスクトップチャットアプリ）では、fdの継承は不可能です。

### `--json-file` がそのギャップを埋める

ファイルパスは通常のCLI引数として渡されるため、すべてのspawnモデルで機能します。

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

子プロセスが自分でファイルを開き、イベントを書き込みます。埋め込み側は `fs.watch` とインクリメンタルリードで同じパスを監視します。注意点が3つあります。

- **通常のファイル**、FIFO（名前付きパイプ）、または `/dev/fd/N` のいずれでも動作します。FIFOは、両側が同じホスト上にある場合に最もレイテンシの低いオプションです。
- ブリッジはFIFOを `O_NONBLOCK` で開き、`ENXIO`（リーダー未接続）の場合はブロッキングモードにフォールバックするため、PTY起動がコンシューマー待ちでデッドロックすることはありません。
- マルチセッションの分離には、`$XDG_RUNTIME_DIR` または `mkdtemp` で作成したディレクトリ（モード `0700`）内のセッションごとのパスを使用します。

### どのフラグを使うべきか？

| 埋め込みスタイル                                   | 使用するフラグ       |
| ------------------------------------------------- | -------------------- |
| `child_process.spawn` と通常のstdio           | `--json-fd`          |
| `node-pty` / `bun-pty` / 任意のPTYホスト      | `--json-file`        |
| シェルリダイレクション / 手動パイプライン試験 | どちらでも           |
| CIログ収集（通常ファイル、終了後に読み取り） | `--json-file`        |
| 同一ホスト上の最低レイテンシ                | `--json-file` + FIFO |

一般的なルール：**TUIを正しくレンダリングする必要があるなら、PTYが必要であり、つまり `--json-file` が必要です。** `--json-fd` はTUIの忠実性を気にしない、より単純な埋め込み（通常はstdoutを破棄するプログラムラッパー）向けです。

## クイックスタート

両方のチャネルを有効にしてQwen Codeを通常のファイルで実行します。

```bash
touch /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

2番目のターミナルでイベントストリームを監視します。

```bash
tail -f /tmp/qwen-events.jsonl
```

3番目のターミナルで、実行中のTUIにプロンプトを送信します。

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

プロンプトはユーザーが入力したかのようにTUIに表示され、ストリーミング応答が `/tmp/qwen-events.jsonl` にミラーリングされます。

### イベント出力にFIFO（名前付きパイプ）を使用する

FIFOは通常のファイルよりも低レイテンシ（ディスクI/Oなし）で、両側が同じホスト上にある場合に適しています。ブリッジは `O_RDWR | O_NONBLOCK` でFIFOを開くため、リーダーがまだ接続されていなくても**ブロックしません**。イベントはリーダーが接続するまでカーネルのパイプバッファにバッファリングされます。

> **注:** `--input-file` は通常のファイル（FIFOではない）が必要です。なぜなら、ウォッチャーは新しいデータを検出するために `stat.size` に依存しており、FIFOでは常に0になるからです。

```bash
mkfifo /tmp/qwen-events.jsonl
touch /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
# TUIはすぐに起動します——最初にリーダーを起動する必要はありません。

# 2番目のターミナルで、準備ができたら接続：
cat /tmp/qwen-events.jsonl
```

リーダーがまったく接続されなかった場合、内部バッファが1MBを超えるとブリッジは自動的に無効になります。TUIは通常通り動作を続けます。

## 出力イベントスキーマ

イベントはJSON Lines（1行に1オブジェクト）として出力されます。スキーマは非インタラクティブモード `--output-format=stream-json` で使用されるものと同じで、`includePartialMessages` は常に有効です。

チャネル上の最初のイベントは常に `system` / `session_start` で、ブリッジが構築されたときに出力されます。これを使用して、他のイベントが到着する前にチャネルをセッションIDに関連付けてください。

```jsonc
// セッションライフサイクル
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// アシスタントターン中のストリーミングイベント
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// 完了したメッセージ
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// パーミッションコントロールプレーン（ツールの承認が必要な場合のみ）
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

`control_response` は、決定がTUI（ネイティブ承認UI）で行われたか、外部の `confirmation_response`（下記参照）によって行われたかに関係なく出力されます。いずれにせよ、すべてのオブザーバーは最終結果を見ることができます。

## 入力コマンドスキーマ

`--input-file` では2つのコマンド形式を受け入れます。

```jsonc
// ユーザーメッセージをプロンプトキューに送信
{ "type": "submit", "text": "What does this function do?" }

// 保留中のcontrol_requestに応答
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

動作：

- `submit` コマンドはキューに入れられます。TUIが応答中の場合、次にTUIがアイドル状態に戻ったときに自動的に再試行されます。
- `confirmation_response` コマンドは即座にディスパッチされ、キューに入れられることはありません。ツール呼び出しはブロッキング中であり、応答は以前の `submit` を待たずに基盤の `onConfirm` ハンドラに到達する必要があるためです。
- どちらかの側がツールを最初に承認した方が勝ちです。遅れて到着したもう一方の側の応答は無害に破棄されます。
- JSONとしてパースできない行はログに記録されてスキップされます。ウォッチャーは停止しません。

## レイテンシに関する注意

入力ファイルは `fs.watchFile` によって500msのポーリング間隔で監視されるため、リモートからの `submit` の最悪のラウンドトリップレイテンシは約0.5秒です。これは意図的です。ポーリングはプラットフォームやファイルシステム（macOS / ネットワークマウントを含む）間で移植可能であり、この機能が対象とする典型的な人間参加型のペースに適合します。出力チャネルにはポーリングがありません。イベントはTUIが出力すると同期的に書き込まれます。

## 障害モード

- **不正なfd。** `--json-fd` に渡されたfdが開いていないか、0/1/2の場合、TUIは `stderr` に警告を表示し、デュアル出力なしで続行します。
- **不正なパス。** `--json-file` に渡されたファイルを開けない場合、TUIは警告を表示し、デュアル出力なしで続行します。
- **コンシューマーの切断。** チャネルの反対側のリーダーが切断された場合（`EPIPE`）、ブリッジは静かに無効化され、TUIは動作を続けます。再試行はありません。
- **FIFOバッファオーバーフロー。** リーダーが接続されていないFIFOに書き込むと、イベントはカーネルパイプ（Linuxでは約64KB）とNode.js WriteStreamにバッファリングされます。パイプがいっぱいになるか、内部バッファが1MBを超えると、ブリッジは自身を無効にしてfdを閉じます。この場合、`session_end` は出力されません。コンシューマーは、`session_end` なしでストリームが閉じられた場合、異常終了として扱う必要があります。TUIは通常通り動作を続けます。
- **アダプター例外。** イベント出力中にスローされた例外はキャッチされ、ログに記録され、ブリッジを無効にします。デュアル出力の障害によってTUIがクラッシュすることはありません。

## 起動例

典型的な埋め込み親プロセスは、両方のチャネルを使用してQwen Codeを起動します。

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

TUIは引き続きstdio 0/1/2でユーザーのターミナルを所有し、埋め込み側はfd 3をバックアップするファイル上の構造化イベントを読み取り、`/tmp/qwen-input.jsonl` にJSONL行を追記することでコマンドを送信します。

## 設定ベースの構成

長期間動作する埋め込みでは、起動のたびにCLIフラグを渡すのは不便なことがよくあります。同じチャネルを `settings.json` のトップレベルキー `dualOutput` で設定できます。

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

優先順位ルール：

- CLIフラグが設定よりも**優先されます**。コマンドラインで `--json-file /foo` を渡すと、設定の `dualOutput.jsonFile` を上書きします。
- `--json-fd` には設定に相当するものはありません。fdの受け渡しは起動時の問題であり、静的に宣言できません。
- フラグも設定も存在しない場合、デュアル出力は無効のままです（現在のデフォルトと同じ）。

`requiresRestart: true` フラグは、変更が次回のQwen Code起動時にのみ有効になることを意味します。ブリッジは起動時に一度だけ構築されるためです。

## 実行可能なデモ

以下のスクリプトはすべてコピペでそのまま使用できます。まずPOC 1でビルドにデュアル出力があることを確認し、POC 4は実際のIDE拡張統合に最も近いものです。

### POC 1 — イベントストリームの観察

人間が通常通りTUIを使用している間に、TUIが出力するすべての構造化イベントを監視します。

```bash
# ターミナル A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# ターミナル B
qwen --json-file /tmp/qwen-events.jsonl
# ...あとは通常どおりチャットしてください。ターミナルAには session_start、
# user/assistant/result/control_request のライフサイクルがリアルタイムで表示されます。
```

ターミナルAで期待される最初の行：

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — 外部からのプロンプト注入

1つ目のターミナルのキーボードに触れずに、2つ目のターミナルからTUIを操作します。

```bash
# ターミナル A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# ターミナル B — まるで自分で入力したかのようにTUIが応答します
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — リモートツール権限ブリッジ

別のプロセスからツール呼び出しを承認または拒否します。

```bash
# ターミナル A — control_request を監視
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# ターミナル B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Qwenに承認が必要なことを依頼します。例：
# "run `ls -la /tmp`"。ターミナルAに control_request が表示されます。
# request_id をコピーし、3つ目のターミナルで：
echo '{"type":"confirmation_response","request_id":"<貼り付けたid>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# TUIの承認プロンプトが消え、ツールが実行されます。
```

未知の `request_id` で応答した場合、ブリッジは出力チャネルに `subtype: "error"` の `control_response` を出力するため、コンシューマーはそれをログに記録するか再試行できます。

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

### POC 4 — Node埋め込み（IDE風）

最も現実的な形状です。親プロセスがQwen Codeを起動し、イベントを監視し、独自のスケジュールでプロンプトを注入します。

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

// 出力チャネルを監視します。本番ではバイトオフセットtailを使用すべきですが、
// ここでは簡潔さのために0から再ストリームします。
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
    // 機能を使用する前に機能検出
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

// 2秒後、ユーザーが入力したかのようにプロンプトを注入
setTimeout(() => {
  appendFileSync(
    input,
    JSON.stringify({ type: 'submit', text: 'hello from embedder' }) + '\n',
  );
}, 2000);

child.on('exit', () => process.exit(0));
```
実行方法:

```bash
npx tsx demo-embedder.ts
# Qwen Code TUI が現在のターミナルで開きます。エンベッダーは
# handshake、turn-end、session_end イベントを親プロセスの stdout にログ出力します。
```

### POC 5 — 機能ハンドシェイクによる機能検出

古いバージョンの Qwen Code は `protocol_version` を出力しません。このフィールドはオプションとして扱い、機能検出してください:

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

### POC 6 — session_end をクリーンな終了シグナルとして使用

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // Flush metrics, close WebSockets, etc.
  }
});
```

TUI が `session_end` の前にクラッシュした場合、出力ストリームが閉じられます（次回の書き込みで `EPIPE`）。エンベッダーは両方のパスを処理する必要があります。

### POC 7 — 障害テスト（フラグが TUI を壊さないことの証明）

```bash
qwen --json-fd 1
# stderr: "Warning: dual output disabled — ..."
# TUI still launches normally.

qwen --json-fd 9999
# stderr: "Warning: dual output disabled — fd 9999 not open"
# TUI still launches normally.

qwen --json-fd 3 --json-file /tmp/x.jsonl
# yargs rejects: "--json-fd and --json-file are mutually exclusive."
# Process exits before TUI starts.

qwen --json-file /nonexistent/dir/x.jsonl
# stderr warning; TUI still launches.
```

## Claude Code との関係

Claude Code も `--print --output-format stream-json` で同様のストリーム JSON イベント形式を公開していますが、非インタラクティブモードでのみ利用可能です。TUI を実行しながら構造化されたサイドカーチャンネルを同時に持つ同等の機能はありません。Dual Output がそのギャップを埋めます。