# DaemonClient クイックスタート (TypeScript)

最小構成のエンドツーエンドサンプルです。別のターミナルで `qwen serve` デーモンを起動し、SDK の `DaemonClient` を使って Node スクリプトから操作します。関連ドキュメント: [デーモンモード ユーザーガイド](../../users/qwen-serve.md) および [HTTP プロトコルリファレンス](../qwen-serve-protocol.md)。

## セットアップ

ターミナル 1:

```bash
cd your-project/
qwen serve --port 4170
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
```

[#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 の仕様により、各デーモンは起動時に 1 つのワークスペースにバインドされます（現在の `cwd`、または `--workspace /path/to/dir` で上書き可能）。デーモンのバインドパスは `/capabilities.workspaceCwd` で公開されるため、クライアントは事前確認を行い、`POST /session` の `cwd` を省略できます。

ターミナル 2:

```bash
npm install @qwen-code/sdk
```

## Hello daemon

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): when `token` is omitted, DaemonClient falls
  // back to `process.env.QWEN_SERVER_TOKEN` automatically — same env
  // var the daemon's `--token` CLI flag falls back to. So either:
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # one-shot
  //   export QWEN_SERVER_TOKEN="$(cat ./my-token-file)"    # user-managed file
  //   const client = new DaemonClient({ baseUrl: '...' });
  // OR pass it explicitly when you have a different env-var name:
  //   token: process.env.MY_TOKEN,
});

// 1. デーモンへの疎通確認、機能確認、バインドされたワークスペースの取得 (#3803 §02)
const caps = await client.capabilities();
console.log('Daemon features:', caps.features);
console.log('Daemon workspace:', caps.workspaceCwd); // canonical bound path

// 2. セッションの生成またはアタッチ。2 つの等価な記述方法:
//    (a) 明示的に `workspaceCwd: caps.workspaceCwd` を渡す、または
//    (b) `workspaceCwd` を省略 — SDK は `cwd` フィールドを送らず、
//        デーモンルートはバインドされたワークスペースにフォールバックする。
//        (b) は簡潔だが、`caps.workspaceCwd` が意図通りであることを前提とする。
//    空でない `workspaceCwd` がデーモンのバインドパスに正規化されない場合、
//    `400 workspace_mismatch` が返される（後述の「ワークスペースの不一致」参照）。
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. イベントストリームを購読する。`lastEventId: 0` を渡すことで、
//    セッション開始からのイベントをデーモンがリプレイする。
//    指定しない場合、`subscribeEvents()` がイテレータを返してから
//    SSE 接続が実際に開くまでの間（1 フェッチ往復分）に TOCTOU ウィンドウが生じ、
//    高速起動したエージェントが発行したイベントがリングバッファに入っても
//    カーソルなしの新規サブスクライバーにはストリームされない。
//    `lastEventId: 0` を指定するとリプレイバッファがそのギャップを埋め
//    （後述の再接続時も同様）。
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. プロンプトを送信して完了を待つ。（実行順序の注意:
//    SSE ハンドシェイク完了前に `prompt()` が発火しても、
//    手順 3 の `lastEventId: 0` によりすべてのイベントがイテレータに届く。）
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Summarize src/main.ts in one sentence.' }],
});
console.log('stop reason:', result.stopReason);

// 5. 購読を解除してスクリプトを終了できるようにする。
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
      // 先着優先のセマンティクスについては後述の「権限への投票」を参照。
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

ファイルルートはセッションスコープではなくワークスペーススコープのため、`DaemonClient` に直接定義されています。

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

`expectedHash` はディスク上の生バイトに対する SHA-256 です。`mode: "replace"` と `editWorkspaceFile()` はこの値を必須とするため、古いクライアントが直前に読んでいないファイルを上書きすることを防ぎます。書き込み・編集操作はループバック接続でも Bearer トークン設定が必要です。使用前にデーモンを `--token` または `QWEN_SERVER_TOKEN` 付きで起動してください。

## `Last-Event-ID` による再接続

クライアントプロセスがセッション中に再起動した場合、見逃したイベントをリプレイできます。

```ts
let cursor: number | undefined;

for await (const event of client.subscribeEvents(session.sessionId, {
  signal: abort.signal,
  lastEventId: cursor, // resume from after this id; undefined = live only
})) {
  if (typeof event.id === 'number') cursor = event.id;
  handleEvent(event);
}
```

デーモンはセッションごとに最新 8000 イベントをリングバッファで保持します。そのウィンドウを超えたギャップは再配信できません。

## 権限への投票

エージェントがツール実行の権限を要求すると、接続中のすべてのクライアントが `permission_request` イベントを受け取ります。**先着優先** — 一方のクライアントが投票すると、同じ `requestId` に投票しようとした残りのクライアントは `404` を受け取ります。

```ts
case 'permission_request': {
  const req = event.data as {
    requestId: string;
    options: Array<{ optionId: string; name: string; kind: string }>;
  };
  // Pick whichever option you want — `proceed_once`, `allow`, etc.
  const choice = req.options.find((o) => o.kind === 'allow_once') ?? req.options[0];
  const accepted = await client.respondToPermission(req.requestId, {
    outcome: { outcome: 'selected', optionId: choice.optionId },
  });
  if (!accepted) {
    console.log('Another client voted first; nothing to do.');
  }
  break;
}
```

## セッション共有によるコラボレーション

**同じデーモン**を指す 2 つのクライアントは同じセッションに入ります。#3803 §02 の仕様により各デーモンは起動時に 1 つのワークスペースにバインドされるため、`qwen serve --workspace /work/repo` で起動された（または `cd /work/repo && qwen serve` で起動された）デーモンに両クライアントが接続します。

```ts
// Daemon was launched as `qwen serve --workspace /work/repo` so
// `caps.workspaceCwd === '/work/repo'` for both clients.

// Client A (e.g. an IDE plugin)
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false — A spawned the agent

// Client B (e.g. a web UI on the same machine)
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true — B joined A's session
console.log(a.sessionId === b.sessionId); // true
```

両クライアントは同じ `session_update` / `permission_request` ストリームを受け取ります。どちらからでもプロンプトを送信できますが、エージェントの「1 セッションにつきアクティブなプロンプトは 1 つ」という保証に基づき FIFO キューで処理されます。

## ワークスペースの不一致

`workspaceCwd` がデーモンのバインドワークスペースと一致しない場合、`createOrAttachSession` はステータス `400` と構造化されたボディを持つ `DaemonHttpError` でリジェクトされます。

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
        `This daemon is bound to ${body.boundWorkspace}, ` +
          `not ${body.requestedWorkspace}. Start a separate daemon ` +
          `for that workspace, or route to the right one.`,
      );
    }
  }
}
```

マルチワークスペース構成では、ワークスペースごとに別々のポートでデーモンを 1 つずつ起動します — §02 ではデーモン間のルーティングは行われません。オーケストレーター（またはユーザーのランチャー）がクライアントの接続先プロジェクトに基づいて適切なデーモンを選択します。

## 認証

トークン付きでデーモンを起動した場合（ループバック以外のバインドには必須）:

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**SDK 環境変数フォールバック (PR 27, v0.16-alpha)** — `token` が省略された場合、`DaemonClient` はデーモン自身の `--token` CLI フォールバックと同様に、環境変数から `QWEN_SERVER_TOKEN` を自動で読み取ります。シェルに `export QWEN_SERVER_TOKEN=...` が設定されている場合、以下は上記と等価です。

```ts
// Same effect as token: process.env.QWEN_SERVER_TOKEN, but without the boilerplate.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

このフォールバックは先頭・末尾の空白を除去します（`export QWEN_SERVER_TOKEN="$(cat token.txt)"` で `cat` が改行を追加した場合に便利です）。また、空文字列や空白のみの値は未設定として扱われるため、古い `export QWEN_SERVER_TOKEN=""` が誤って `Authorization: Bearer ` をトークンなしで送信することはありません。フォールバックはコンストラクタ実行時に一度だけ評価されるため、その後の `process.env` の変更は構築済みのクライアントには影響しません。ブラウザバンドル（`@qwen-code/webui` 経由など）では `globalThis.process` が存在しないため、クリーンに `undefined` が返されます。

トークンが誤っているか欠落している場合、統一されたボディとともに `401` が返されます — SDK はルートハンドラからの 4xx/5xx に対して `DaemonHttpError` をスローします。

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

## 実行中のプロンプトのキャンセル

ユーザーが Esc を押した場合:

```ts
await client.cancel(session.sessionId);
// In the event stream you'll see the prompt resolve with stopReason: "cancelled"
```

キャンセルは**アクティブな**プロンプトのみを停止します — すでに POST 済みでキューに残っているプロンプトはそのまま実行され続けます（詳細はプロトコルリファレンスを参照）。

## 次のステップ

- [HTTP プロトコルリファレンス](../qwen-serve-protocol.md) — ステータスコードを含む完全なルート仕様
- [デーモンモード ユーザーガイド](../../users/qwen-serve.md) — オペレーター向けドキュメント
- ソース: `packages/sdk-typescript/src/daemon/`
