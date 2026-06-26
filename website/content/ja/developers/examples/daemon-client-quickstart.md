# DaemonClient クイックスタート (TypeScript)

最小限のエンドツーエンドの例: 別のターミナルで `qwen serve` デーモンを起動し、SDK の `DaemonClient` を使って Node スクリプトから操作します。関連: [デーモンモードユーザーガイド](../../users/qwen-serve.md) と [HTTP プロトコルリファレンス](../qwen-serve-protocol.md)。

## セットアップ

1 つ目のターミナルで:

```bash
cd your-project/
qwen serve --port 4170
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
```

[#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 により、各デーモンは起動時に 1 つのワークスペースにバインドされます (現在の `cwd`、または `--workspace /path/to/dir` で上書き可能)。デーモンのバインドされたパスは `/capabilities.workspaceCwd` で公開されるため、クライアントは事前にチェックし、`POST /session` から `cwd` を省略できます。

もう 1 つのターミナルで:

```bash
npm install @qwen-code/sdk
```

## Hello デーモン

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): `token` を省略すると、DaemonClient は自動的に
  // `process.env.QWEN_SERVER_TOKEN` にフォールバックします — これは
  // デーモンの `--token` CLI フラグがフォールバックするのと同じ環境変数です。
  // つまり、次のいずれか:
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # 使い捨て
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # ユーザー管理ファイル
  //   const client = new DaemonClient({ baseUrl: '...' });
  // または、異なる環境変数名を使用する場合は明示的に渡します:
  //   token: process.env.MY_TOKEN,
});

// 1. デーモンに到達可能であることを確認し、機能に基づいて UI をゲートし、
//    デーモンのバインドされたワークスペースを読み取ります (#3803 §02)。
const caps = await client.capabilities();
console.log('Daemon features:', caps.features);
console.log('Daemon workspace:', caps.workspaceCwd); // 正規化されたバインドパス

// 2. セッションを生成またはアタッチします。2 つの等しく有効な形式:
//    (a) `workspaceCwd: caps.workspaceCwd` を渡して明示的にする
//    (b) `workspaceCwd` を完全に省略する — SDK は `cwd` フィールドを送信せず、
//        デーモンルートはバインドされたワークスペースにフォールバックします。
//        (b) の形式は簡潔ですが、`caps.workspaceCwd` が意図したものであると
//        信頼していることが前提です。
//    デーモンのバインドされたパスに正規化されない空でない `workspaceCwd` は
//    `400 workspace_mismatch` を返します (下記「ワークスペースの不一致」参照)。
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. イベントストリームを購読します。`lastEventId: 0` を渡すと、デーモンは
//    セッション開始時からすべてをリプレイします。これがないと、
//    `subscribeEvents()` がイテレータを返してから、実際の SSE 接続が
//    開かれるまでに (fetch 1 ラウンドトリップ分) TOCTOU ウィンドウが存在し、
//    その間に高速に開始するエージェントがイベントを発行する可能性があります。
//    それらはセッションごとのリングバッファには入りますが、カーソルなしの
//    新規購読者にはストリーミングされません。`lastEventId: 0` により、
//    リプレイバッファがそのギャップをカバーします (および後述の再接続も)。
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. プロンプトを送信し、終了するのを待ちます (操作順序の注意:
//    `prompt()` が SSE ハンドシェイク完了前に発火しても、
//    ステップ 3 の `lastEventId: 0` によりすべてのイベントが
//    イテレータに届くことが保証されます)。
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Summarize src/main.ts in one sentence.' }],
});
console.log('stop reason:', result.stopReason);

// 5. 購読を解除してスクリプトが終了できるようにします。
abort.abort();
await subscription;

function handleEvent(event: DaemonEvent): void {
  switch (event.type) {
    case 'session_update': {
      const data = event.data as {
        sessionUpdate: string;
        content?: { text?: string };
      };
      if (data.sessionUpdate === 'agent_message_chunk' && data.content?.text) {
        process.stdout.write(data.content.text);
      }
      break;
    }
    case 'permission_request':
      // 「権限の投票」のファーストレスポンダーセマンティクスを参照。
      console.log('\n[needs permission]', event.data);
      break;
    case 'permission_resolved':
      console.log('\n[permission resolved]', event.data);
      break;
    case 'session_died':
      console.error('\n[agent crashed]', event.data);
      break;
    default:
      console.log(`\n[${event.type}]`, event.data);
  }
}
```

## ワークスペースファイルヘルパー

ファイルルートはセッションスコープではなくワークスペーススコープのため、`DaemonClient` に直接存在します:

```ts
const file = await client.readWorkspaceFile('src/main.ts');

const updated = await client.editWorkspaceFile({
  path: 'src/main.ts',
  oldText: 'timeout: 30000',
  newText: 'timeout: 60000',
  expectedHash: file.hash!,
});

console.log(updated.hash);
```

`expectedHash` はディスク上の raw バイトに対する SHA-256 です。`mode: "replace"` および `editWorkspaceFile()` はこれを必須とし、古いクライアントが読み取ったばかりのファイルを上書きしないようにします。書き込み/編集にはループバックでも Bearer トークンの設定が必要です。使用する前に `--token` または `QWEN_SERVER_TOKEN` を指定してデーモンを起動してください。

## `Last-Event-ID` による再接続

クライアントプロセスがセッション途中で再起動した場合、見逃したイベントをリプレイします:

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // この ID 以降から再開; undefined はライブのみ
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

デーモンはセッションごとに最新 8000 イベントをリングバッファに保持します。そのウィンドウを超えたギャップは再配信できません。

## 権限の投票

エージェントがツールの実行許可を求めると、接続されているすべてのクライアントが `permission_request` イベントを受け取ります。**最初に応答したクライアントが勝ち** — 1 つのクライアントが投票すると、他のクライアントが同じ `requestId` に投票しようとすると `404` が返ります。

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // 希望するオプションを選択 — `proceed_once`、`allow` など
  const choice = req.options.find((o) => o.kind === 'allow_once') ?? req.options[0];
  const accepted = await client.respondToPermission(req.requestId, {
    outcome: { outcome: 'selected', optionId: choice.optionId },
  });
  if (!accepted) {
    console.log('別のクライアントが先に投票しました。何もしません。');
  }
  break;
}
```

## 共有セッションコラボレーション

**同じデーモン**を指す 2 つのクライアントは、同じセッションになります。#3803 §02 により、各デーモンは起動時に 1 つのワークスペースにバインドされるため、`qwen serve --workspace /work/repo` (または `cd /work/repo && qwen serve`) として起動されたデーモンが、両方のクライアントの接続先になります:

```ts
// デーモンは `qwen serve --workspace /work/repo` として起動されたため、
// 両方のクライアントで `caps.workspaceCwd === '/work/repo'` になります。

// クライアント A (例: IDE プラグイン)
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false — A がエージェントを生成

// クライアント B (例: 同じマシン上の Web UI)
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true — B が A のセッションに参加
console.log(a.sessionId === b.sessionId); // true
```

両方のクライアントは同じ `session_update` / `permission_request` ストリームを見ます。どちらもプロンプトを送信できます。エージェントの「セッションごとに 1 つのアクティブプロンプト」保証により FIFO キューイングされます。

## ワークスペースの不一致

`workspaceCwd` がデーモンのバインドされたワークスペースと一致しない場合、`createOrAttachSession` は `DaemonHttpError` で拒否され、ステータス `400` と構造化ボディが返ります:

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.createOrAttachSession({ workspaceCwd: '/some/other/project' });
} catch (err) {
  if (err instanceof DaemonHttpError && err.status === 400) {
    const body = err.body as {
      code?: string;
      boundWorkspace?: string;
      requestedWorkspace?: string;
    };
    if (body.code === 'workspace_mismatch') {
      console.error(
        `このデーモンは ${body.boundWorkspace} にバインドされています。` +
          `${body.requestedWorkspace} ではありません。そのワークスペース用に個別のデーモンを` +
          `起動するか、正しい方にルーティングしてください。`,
      );
    }
  }
}
```

マルチワークスペースデプロイメントでは、ワークスペースごとに 1 つのデーモンを別々のポートで実行します。§02 ではデーモン内ルーティングはありません。オーケストレータ (またはユーザーのランチャー) が、クライアントが通信したいプロジェクトに基づいて適切なデーモンを選択します。

## 認証

デーモンがトークン付きで起動された場合 (非ループバックバインドではトークンが必須):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**SDK 環境変数フォールバック (PR 27, v0.16-alpha)** — `DaemonClient` は `token` が省略された場合、自動的に環境変数 `QWEN_SERVER_TOKEN` を読み取ります。これはデーモン自身の `--token` CLI フラグのフォールバックと同じです。したがって、シェルに `export QWEN_SERVER_TOKEN=...` が設定されていれば、上記と同等です:

```ts
// token: process.env.QWEN_SERVER_TOKEN と同じ効果ですが、定型コードなしで済みます。
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

フォールバックは先頭/末尾の空白を除去し ( `export QWEN_SERVER_TOKEN="$(cat token.txt)"` で `cat` が改行を追加する場合に便利)、空または空白のみの値は未設定として扱います (古い `export QWEN_SERVER_TOKEN=""` が誤ってトークンなしの `Authorization: Bearer ` を送信するのを防ぎます)。フォールバックはコンストラクタで 1 回実行されます。その後の `process.env` の変更は既に構築されたクライアントには影響しません。ブラウザバンドル (例: `@qwen-code/webui` 経由) では `globalThis.process` が存在しないため、きれいに `undefined` になります。

間違ったトークンや欠落したトークンは、統一されたボディとともに `401` を返します。SDK はルートハンドラからのすべての 4xx/5xx で `DaemonHttpError` をスローします。

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.health();
} catch (err) {
  if (err instanceof DaemonHttpError) {
    console.error(`Daemon error ${err.status}:`, err.body);
  } else {
    throw err;
  }
}
```

## 進行中のプロンプトのキャンセル

ユーザーが Esc キーを押した場合:

```ts
await client.cancel(session.sessionId);
// イベントストリームで、プロンプトが stopReason: "cancelled" で解決されるのを確認できます
```

キャンセルは**アクティブな**プロンプトのみを終了します。既に POST 済みで後ろにキューイングされているものは引き続き実行されます。(理由についてはプロトコルリファレンスを参照してください。)

## 次のステップ

- [HTTP プロトコルリファレンス](../qwen-serve-protocol.md) — ステータスコード付きの完全なルート仕様
- [デーモンモードユーザーガイド](../../users/qwen-serve.md) — 運用者向けドキュメント
- ソース: `packages/sdk-typescript/src/daemon/`