# Dual Output

Dual Output は、インタラクティブな TUI 用のサイドカーモードです。Qwen Code が通常通り `stdout` にレンダリングを継続する一方で、構造化された JSON イベントストリームを別のチャネルに並行して出力します。これにより、IDE 拡張機能、Web フロントエンド、CI パイプライン、自動化スクリプトなどの外部プログラムがセッションを監視・制御できるようになります。

また、逆方向のチャネルも提供します。外部プログラムは TUI が監視するファイルに JSONL コマンドを書き込むことができ、これにより、キーボードを操作する人間と同様にプロンプトの送信やツール権限リクエストへの応答が可能になります。

Dual Output は完全にオプションです。以下のフラグが指定されていない場合、TUI は追加の I/O や動作変更なしで、これまでと同様に動作します。

## Use cases

Dual Output は低レベルな基盤プリミティブです。これにより実現される具体的な統合例を以下に示します。

### Terminal + Chat dual-mode real-time sync

代表的なユースケースです。Web またはデスクトップの ChatUI が PTY 内で TUI をホストし、構造化イベントストリームによって駆動される並列の会話ビューをレンダリングします。

- ユーザーは TUI（ターミナルネイティブな上級者向け）または Web UI（リッチな UX、共有可能なリンク、モバイル対応）のどちらの画面でも入力できます。すべてのメッセージが同じ JSON イベントを経由するため、両方のビューは常に同期されます。
- ツール承認プロンプトは両方の場所に表示され、最初に承認した側の操作が有効になります。
- セッション履歴は `--json-file` からそのままキャプチャされるため、サーバー側は ANSI をパースすることなく、正規の機械可読なトランスクリプトを取得できます。

### IDE extensions (VS Code / JetBrains / Cursor / Neovim)

IDE 内に Qwen Code を組み込みます。TUI は必要に応じてエディタの統合ターミナルパネルで実行され、拡張機能は `--json-fd` / `--json-file` イベントを消費して以下を駆動します。

- エージェントがファイルに触れた際のインライン差分オーバーレイ。
- フォーマット済み Markdown、シンタックスハイライト付きツール呼び出し、クリック可能な引用を含む Webview サイドパネル。
- ステータスバーインジケーター（思考中 / 応答中 / 承認待ち）。
- ユーザーがネイティブ IDE の承認ボタンをクリックした際のプログラムによる `confirmation_response` の書き込み。

### Browser-based Chat frontends

Node/Bun サーバーがレンダリングセマンティクス用に PTY 内で TUI を起動しますが、ブラウザに対して WebSocket チャネルを公開します。`--json-file` 上のイベントはクライアントに転送され、ブラウザで入力されたユーザーメッセージは `--input-file` 経由で注入されます。両側で ANSI パースは不要です。

### CI / automation observers

CI ジョブがタスクプロンプト付きで Qwen Code を実行します。人間はジョブログで TUI を確認し、CI システムは `--json-file` を tail して以下を行います。

- `result` イベントがエラーを報告した場合にジョブを失敗させる。
- `token usage` / `duration_ms` / `tool_use` カウントをメトリクスにプッシュする。
- 完全なトランスクリプトをビルドアーティファクトとしてアーカイブする。

### Multi-agent orchestration

スーパーバイザーエージェントが複数の TUI ワーカーを起動し、それぞれに独自のイベント/入力ファイルのペアを割り当てます。進捗を監視し、フォローアッププロンプトを注入し、すべてのワーカー間でツール呼び出しを承認または拒否することで、グローバルな予算/セキュリティポリシーを強制します。

### Session recording, audit, and replay

`--json-file` を使用してすべての TUI セッションを通常のファイルに tee します。後で以下が可能になります。

- コンプライアンス監査で実行内容を正確に再現できる。
- モデルバージョン間で実行結果を比較する自動回帰テスト。
- リプレイツールが同じプロトコル経由でイベントを再送信し、可視化ダッシュボードに供給できる。

### Observability dashboards

`--json-file` を Loki / OTEL / JSONL を受け入れる任意のパイプラインにストリーミングします。`usage.input_tokens`、`tool_use.name`、`result.duration_api_ms` を Grafana のファーストクラスメトリクスとして抽出します。ログパース用の正規表現は不要です。

### Testing and QA

統合テストは Qwen Code をヘッドレスで起動し、`--input-file` スクリプトで駆動し、`--json-file` イベントに対してアサートを行います。stdout の ANSI をパースする場合と異なり、UI リファクタリングに関係なくアサーションは安定します。

## Flags

| Flag                  | Type             | Purpose                                                                                                                                    |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `--json-fd <n>`       | number, `n >= 3` | 構造化 JSON イベントをファイルディスクリプタ `n` に書き込みます。呼び出し側は spawn の `stdio` 設定またはシェルのリダイレクト経由でこの fd を提供する必要があります。 |
| `--json-file <path>`  | path             | 構造化 JSON イベントをファイルに書き込みます。パスは通常のファイル、FIFO（名前付きパイプ）、または `/dev/fd/N` にできます。                               |
| `--input-file <path>` | path             | 外部プログラムによって書き込まれた JSONL コマンドを監視します。                                                                         |

`--json-fd` と `--json-file` は相互に排他です。TUI 自体の出力が破損するのを防ぐため、fd 0、1、2 は拒否されます。

## Why two output flags? (`--json-fd` vs `--json-file`)

一見すると `--json-fd` で十分に見えます。呼び出し側が追加のファイルディスクリプタ付きで Qwen Code を spawn し、TUI がそこにイベントを書き込むだけで完了します。しかし実際には、最も重要な埋め込みシナリオである疑似ターミナル（PTY）内での TUI 実行において、fd 受け渡しは機能しません。そのため、この機能ではパスベースの代替手段も公開しています。

### When `--json-fd` works

純粋な `child_process.spawn` と `stdio` 配列を使用する場合：

```ts
const child = spawn('qwen', ['--json-fd', '3'], {
  stdio: ['inherit', 'inherit', 'inherit', eventsFd],
});
```

Node の spawn は任意の `stdio` エントリをサポートしており、fd 3 は子プロセスに継承され、直接書き込みが可能です。ゼロコピー、ゼロバッファ、ファイルシステム不要の最速パスです。

### Why `--json-fd` does **not** work under PTY

PTY ラッパーである [`node-pty`](https://github.com/microsoft/node-pty) や [`bun-pty`](https://github.com/oven-sh/bun) は、IDE 拡張機能、Web ターミナル、tmux ライクなマルチプレクサーなど、本格的な埋め込み環境がインタラクティブな TUI をホストする方法です。これらは以下の3つの理由により、追加の fd を子プロセスに転送できません。

1. **API surface.** `node-pty.spawn(file, args, options)` は `cwd`、`env`、`cols`、`rows`、`encoding` などを受け付けますが、**`stdio` 配列はありません**。API 上に「子プロセスの fd 3 としてこの fd もアタッチする」と指定する場所が単純に存在しません。`bun-pty` も同じ形状を公開しています。
2. **`forkpty(3)` semantics.** 内部では、PTY ラッパーが `forkpty(3)`（または同等の `posix_openpt` + `login_tty` の処理）を呼び出します。このシステムコールはマスター/スレーブの疑似ターミナルペアを割り当て、子プロセスの fd 0/1/2 をスレーブ側にリダイレクトし、子プロセスが実際のターミナルに接続されていると認識させます。親プロセスの 2 以上の fd は、`exec` 前に `fd >= 3` に対して `close(fd)` を呼び出す `login_tty` によって閉じられます。追加の fd は継承されず、積極的に消去されます。
3. **Controlling-terminal side effect.** ハッキングで追加の fd を通したとしても、それはターミナルではないため、子プロセスの TUI レンダラー（fd 1 が TTY であると仮定してエスケープシーケンスを書き込む）は依然として出力にスレーブを必要とします。結局、2 つの独立したトランスポートを持つことになります。

要するに、埋め込み側が TUI レンダリングに実際の TTY を必要とする瞬間（すべての IDE 拡張機能、すべての Web ターミナル、すべてのデスクトップチャットアプリ）において、fd の継承は選択肢から外れます。

### `--json-file` fills the gap

ファイルパスは通常の CLI 引数として渡されるため、すべての spawn モデルで機能します。

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

子プロセスは自身でファイルを開き、そこにイベントを書き込みます。埋め込み側は `fs.watch` + 増分読み取りで同じパスを tail します。注意すべき点が3つあります。

- **通常のファイル**、FIFO（名前付きパイプ）、または `/dev/fd/N` のすべてが機能します。両側が同じホスト上にある場合、FIFO が最も低レイテンシなオプションです。
- ブリッジは `O_NONBLOCK` で FIFO を開き、`ENXIO`（まだリーダーがいない）の場合はブロッキングモードにフォールバックするため、PTY の起動がコンシューマー待ちでデッドロックすることはありません。
- マルチセッションの分離には、`$XDG_RUNTIME_DIR` 下のセッションごとのパス、またはモード `0700` の `mkdtemp` ディレクトリを使用します。

### Which flag should I use?

| Embedding style                                   | Use                  |
| ------------------------------------------------- | -------------------- |
| `child_process.spawn` with plain stdio            | `--json-fd`          |
| `node-pty` / `bun-pty` / any PTY host             | `--json-file`        |
| Shell redirection / manual pipeline testing       | either               |
| CI log collection (regular file, read after exit) | `--json-file`        |
| Lowest possible latency on same host              | `--json-file` + FIFO |

一般的なルール：**TUI を正しくレンダリングする必要がある場合は PTY が必要であり、つまり `--json-file` が必要になります。** `--json-fd` は、TUI の忠実度を気にしない、通常は stdout を破棄するプログラム的なラッパーなどの、より単純な埋め込み用です。

## Quick start

3つのチャネルをすべて有効にして Qwen Code を実行します。

```bash
mkfifo /tmp/qwen-events.jsonl /tmp/qwen-input.jsonl
qwen \
  --json-file /tmp/qwen-events.jsonl \
  --input-file /tmp/qwen-input.jsonl
```

2つ目のターミナルで、イベントストリームを tail します。

```bash
cat /tmp/qwen-events.jsonl
```

3つ目のターミナルで、実行中の TUI にプロンプトをプッシュします。

```bash
echo '{"type":"submit","text":"Explain this repo"}' >> /tmp/qwen-input.jsonl
```

プロンプトはユーザーが入力したかのように TUI に表示され、ストリーミング応答は `/tmp/qwen-events.jsonl` にミラーリングされます。

## Output event schema

イベントは JSON Lines（1行に1オブジェクト）として出力されます。スキーマは非インタラクティブな `--output-format=stream-json` モードで使用されるものと同じで、`includePartialMessages` が常に有効になっています。

チャネル上の最初のイベントは常に `system` / `session_start` であり、ブリッジが構築された時点で出力されます。他のイベントが到着する前に、チャネルをセッション ID と関連付けるために使用してください。

```jsonc
// Session lifecycle
{
  "type": "system",
  "subtype": "session_start",
  "uuid": "...",
  "session_id": "...",
  "data": { "session_id": "...", "cwd": "/path/to/cwd" }
}

// Streaming events for an in-progress assistant turn
{ "type": "stream_event", "event": { "type": "message_start", "message": { ... } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_start", "index": 0, "content_block": { "type": "text" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "Hello" } }, ... }
{ "type": "stream_event", "event": { "type": "content_block_stop", "index": 0 }, ... }
{ "type": "stream_event", "event": { "type": "message_stop" }, ... }

// Completed messages
{ "type": "user", "message": { "role": "user", "content": [...] }, ... }
{ "type": "assistant", "message": { "role": "assistant", "content": [...], "usage": { ... } }, ... }
{ "type": "user", "message": { "role": "user", "content": [{ "type": "tool_result", ... }] } }

// Permission control plane (only when a tool needs approval)
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

`control_response` は、TUI 内（ネイティブ承認 UI）で決定が行われた場合でも、外部の `confirmation_response`（下記参照）によって決定が行われた場合でも出力されます。いずれにせよ、すべてのオブザーバーは最終結果を確認できます。

## Input command schema

`--input-file` では以下の2つのコマンド形状が受け入れられます。

```jsonc
// Submit a user message into the prompt queue
{ "type": "submit", "text": "What does this function do?" }

// Reply to a pending control_request
{ "type": "confirmation_response", "request_id": "...", "allowed": true }
```

動作：

- `submit` コマンドはキューに入れられます。TUI が応答でビジー状態の場合、TUI が次にアイドル状態に戻ったときに自動的に再試行されます。
- `confirmation_response` コマンドは即座にディスパッチされ、キューに入れられることはありません。ツール呼び出しはブロッキングであり、応答は以前の `submit` を待たずに基盤の `onConfirm` ハンドラーに到達する必要があるためです。
- 最初にツールを承認した側が有効になり、もう一方の側の遅延した応答は無害に破棄されます。
- JSON としてパースに失敗した行はログに記録され、スキップされます。ウォッチャーが停止することはありません。

## Latency notes

入力ファイルは `fs.watchFile` によって 500ms のポーリング間隔で監視されるため、リモート `submit` の最悪の往復レイテンシは約 0.5 秒です。これは意図的な設計です。ポーリングはプラットフォームやファイルシステム（macOS / ネットワークマウントを含む）間で移植性が高く、この機能が対象とする典型的なヒューマンインザループのペースに一致します。出力チャネルにはポーリングがありません。イベントは TUI が出力する際に同期的に書き込まれます。

## Failure modes

- **Bad fd.** `--json-fd` に渡された fd が開いていないか、0/1/2 のいずれかである場合、TUI は `stderr` に警告を出力し、デュアル出力を無効にして続行します。
- **Bad path.** `--json-file` に渡されたファイルを開けない場合、TUI は警告を出力し、デュアル出力を無効にして続行します。
- **Consumer disconnect.** チャネルの反対側のリーダーが切断された場合（`EPIPE`）、ブリッジは自身をサイレントに無効化し、TUI は実行を継続します。再試行は行われません。
- **Adapter exception.** イベントの出力中にスローされた例外はすべてキャッチされ、ログに記録され、ブリッジが無効になります。デュアル出力の障害によって TUI がクラッシュすることはありません。

## Spawn example

典型的な埋め込み親プロセスは、両方のチャネルを有効にして Qwen Code を spawn します。

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

TUI は依然として stdio 0/1/2 でユーザーのターミナルを所有していますが、埋め込み側は fd 3 を支えるファイルで構造化イベントを読み取り、`/tmp/qwen-input.jsonl` に JSONL 行を追加することでコマンドをプッシュします。

## Settings-based configuration

長期間実行される埋め込みプロセスにとって、起動ごとに CLI フラグをスレッドで渡すのは不便な場合があります。同じチャネルは、トップレベルの `dualOutput` キーの下にある `settings.json` で構成できます。

```jsonc
// ~/.qwen/settings.json  (user-level)
// or <workspace>/.qwen/settings.json  (workspace-level)
{
  "dualOutput": {
    "jsonFile": "/tmp/qwen-events.jsonl",
    "inputFile": "/tmp/qwen-input.jsonl",
  },
}
```

優先度ルール：

- CLI フラグが**設定より優先されます**。コマンドラインで `--json-file /foo` を渡すと、設定の `dualOutput.jsonFile` が上書きされます。
- `--json-fd` に対応する設定はありません。fd 受け渡しは静的に宣言できない spawn 時の問題です。
- フラグも設定も存在しない場合、デュアル出力は無効のままです（現在のデフォルトと同一）。

`requiresRestart: true` フラグは、ブリッジが起動時に一度だけ構築されるため、変更は次回 Qwen Code の起動時にのみ有効になることを意味します。

## Runnable demos

以下のスクリプトはすべてコピー＆ペーストで実行可能です。ビルドにデュアル出力が含まれていることを確認するには POC 1 から始めてください。POC 4 は実際の IDE 拡張機能統合に最も近いアナログです。

### POC 1 — observe the event stream

人間が通常通り使用している間に TUI が出力するすべての構造化イベントを監視します。

```bash
# Terminal A
mkfifo /tmp/qwen-events.jsonl
cat /tmp/qwen-events.jsonl | jq -c 'select(.type != "stream_event") | {type, subtype}'

# Terminal B
qwen --json-file /tmp/qwen-events.jsonl
# ...then chat normally; terminal A shows session_start,
# user/assistant/result/control_request lifecycle in real time.
```

ターミナル A で期待される最初の行：

```json
{ "type": "system", "subtype": "session_start" }
```

### POC 2 — inject prompts from outside

1つ目のターミナルのキーボードに触れることなく、2つ目のターミナルから TUI を駆動します。

```bash
# Terminal A
touch /tmp/qwen-in.jsonl
qwen --input-file /tmp/qwen-in.jsonl

# Terminal B — the TUI responds as if you typed it
echo '{"type":"submit","text":"list files in the current directory"}' \
  >> /tmp/qwen-in.jsonl
```

### POC 3 — remote tool-permission bridge

別のプロセスからツール呼び出しを承認または拒否します。

```bash
# Terminal A — observe control_requests
mkfifo /tmp/qwen-out.jsonl
touch /tmp/qwen-in.jsonl
(cat /tmp/qwen-out.jsonl \
  | jq -c 'select(.type == "control_request")') &

# Terminal B
qwen --json-file /tmp/qwen-out.jsonl --input-file /tmp/qwen-in.jsonl
# Ask Qwen to do something that needs approval, e.g.
# "run `ls -la /tmp`". A control_request will appear in terminal A.
# Copy the request_id, then in a third terminal:
echo '{"type":"confirmation_response","request_id":"<paste-id>","allowed":true}' \
  >> /tmp/qwen-in.jsonl
# The TUI confirmation prompt dismisses and the tool executes.
```

不明な `request_id` で応答した場合、ブリッジは出力チャネルに `subtype: "error"` の `control_response` を出力するため、コンシューマーはそれをログに記録したり再試行したりできます。

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

### POC 4 — Node embedder (IDE-like)

最も現実的な形状です。親プロセスが Qwen Code を spawn し、イベントを tail し、独自のスケジュールでプロンプトを注入します。

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

// Tail the output channel. In production you'd use a proper
// byte-offset tail; this one re-streams from 0 for brevity.
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
    // Feature-detect before using a capability
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

// After 2s, inject a prompt as if the user typed it
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
# Qwen Code TUI opens in the current terminal; the embedder logs
# handshake + turn-end + session_end events to the parent's stdout.
```

### POC 5 — capability handshake feature detection

古い Qwen Code のバージョンは `protocol_version` を出力しません。フィールドをオプションとして扱い、機能検出を行います。

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

### POC 6 — session_end as a clean termination signal

```ts
rl.on('line', (line) => {
  const ev = JSON.parse(line);
  if (ev.type === 'system' && ev.subtype === 'session_end') {
    console.log('[embedder] clean shutdown, session', ev.data.session_id);
    // Flush metrics, close WebSockets, etc.
  }
});
```

`session_end` の前に TUI がクラッシュした場合、出力ストリームは閉じます（次の書き込みで `EPIPE`）。埋め込み側は両方のパスを処理する必要があります。

### POC 7 — failure drills (prove the flags never break the TUI)

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

## Relation to Claude Code

Claude Code は `--print --output-format stream-json` の下で同様の stream-json イベント形式を公開していますが、非インタラクティブモードでのみ利用可能です。TUI と構造化サイドカーチャネルを同時に実行する同等の機能はありません。Dual Output はそのギャップを埋めます。