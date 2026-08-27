# DaemonClient 퀵스타트 (TypeScript)

최소한의 엔드투엔드 예제입니다. 다른 터미널에서 `qwen serve` 데몬을 시작한 다음, SDK의 `DaemonClient`로 Node 스크립트에서 제어합니다. 참고: [데몬 모드 사용자 가이드](../../users/qwen-serve.md) 및 [HTTP 프로토콜 레퍼런스](../qwen-serve-protocol.md).

## 설정

한쪽 터미널에서:

```bash
qwen serve --port 4170 \
  --workspace /path/to/project-a \
  --workspace /path/to/project-b
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/project-a)
```

각 `--workspace` 값은 절대 경로 디렉터리여야 합니다. 첫 번째 시작 workspace가 primary이며, `cwd`를 생략한 요청에 대한 호환성 기본값으로 유지됩니다. `/capabilities.workspaces[]`는 런타임을 명시적으로 선택할 때 클라이언트가 사용해야 하는 카탈로그입니다.

다른 터미널에서:

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

// 1. Confirm we can reach the daemon, gate UI on its features, and
//    select a trusted workspace from the advertised catalog.
const caps = await client.capabilities();
console.log('Daemon features:', caps.features);
const selectedWorkspace =
  caps.workspaces?.find(
    (workspace) => workspace.trusted && !workspace.primary,
  ) ?? caps.workspaces?.find((workspace) => workspace.trusted);
if (!selectedWorkspace) throw new Error('No trusted workspace is available');
console.log('Selected workspace:', selectedWorkspace.id, selectedWorkspace.cwd);

// 2. Spawn-or-attach inside that runtime. The SDK maps `workspaceCwd`
//    to the wire-level POST /session `cwd` field. Omitting it is allowed
//    only when the caller intentionally wants the legacy primary default.
const session = await client.createOrAttachSession({
  workspaceCwd: selectedWorkspace.cwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. Subscribe to the event stream. Pass `lastEventId: 0` so the daemon
//    replays everything from the session's start — without it, there's
//    a TOCTOU window between `subscribeEvents()` returning the iterator
//    and the underlying SSE connection actually opening (one fetch
//    round-trip), during which a fast-starting agent can emit events
//    that go into the per-session ring but won't be streamed to a fresh
//    no-cursor subscriber. `lastEventId: 0` makes the replay buffer
//    cover that gap (and any reconnect later — see below).
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. Send a prompt and wait for it to settle. (Order-of-operations
//    note: even if `prompt()` fires before the SSE handshake
//    completes, step 3's `lastEventId: 0` guarantees every event
//    lands in the iterator.)
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Summarize src/main.ts in one sentence.' }],
});
console.log('stop reason:', result.stopReason);

// 5. Tear down the subscription so the script can exit.
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
      // See "Voting on permissions" below for first-responder semantics.
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

## Workspace 파일 헬퍼

파일 라우트는 세션이 아닌 workspace 스코프입니다. 선택한 workspace id에 바인딩된 헬퍼를 사용하면 모든 요청이 해당 런타임 내부로 유지됩니다.

```ts
const selected = client.workspaceById(selectedWorkspace.id);
const file = await selected.readWorkspaceFile('src/main.ts');

const updated = await selected.editWorkspaceFile({
  path: 'src/main.ts',
  oldText: 'timeout: 30000',
  newText: 'timeout: 60000',
  expectedHash: file.hash!,
});

console.log(updated.hash);
```

`expectedHash`는 디스크의 원시 바이트에 대한 SHA-256입니다. `mode: "replace"` 및 `editWorkspaceFile()`은 오래된 클라이언트가 방금 읽지 않은 파일을 덮어쓰지 않도록 이를 요구합니다. 쓰기/편집은 루프백에서도 bearer token 설정이 필요합니다. 사용하기 전에 데몬을 `--token` 또는 `QWEN_SERVER_TOKEN`과 함께 시작하세요.

## `Last-Event-ID`로 재연결

클라이언트 프로세스가 세션 도중 재시작되면, 놓친 이벤트를 리플레이합니다.

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

데몬은 세션당 마지막 8000개의 이벤트를 링 버퍼에 보관합니다. 이 창을 벗어나는 갭은 재전달할 수 없습니다.

## 권한 투표

에이전트가 도구 실행 권한을 요청하면, 연결된 모든 클라이언트가 `permission_request` 이벤트를 받습니다. **먼저 응답한 클라이언트가 승리합니다** — 한 클라이언트가 투표하면, 나머지 클라이언트는 같은 `requestId`에 투표하려고 할 때 `404`를 받습니다.

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

## 공유 세션 협업

**같은 데몬 workspace**를 가리키는 두 클라이언트는 기본 `sessionScope: 'single'`을 사용할 때 같은 세션에 연결됩니다. `qwen serve --workspace /work/repo` (또는 `cd /work/repo && qwen serve`)로 시작된 단일 workspace 데몬의 경우, 두 클라이언트 모두 해당 primary workspace에 연결됩니다.

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

두 클라이언트 모두 같은 `session_update` / `permission_request` 스트림을 받습니다. 둘 다 프롬프트를 전송할 수 있으며, 에이전트의 "세션당 활성 프롬프트 하나" 보장에 따라 FIFO로 큐잉됩니다.

## Workspace 불일치

`workspaceCwd`가 등록된 광고된 workspace와 일치하지 않으면, `createOrAttachSession`은 상태 `400`과 구조화된 본문을 가진 `DaemonHttpError`를 발생시킵니다. 등록된 후 신뢰되지 않는 secondary workspace는 `403 untrusted_workspace`를 반환하며, primary에 대해 재시도하면 안 됩니다.

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
        `Workspace ${body.requestedWorkspace} is not registered. ` +
          `Refresh capabilities and select an advertised workspace, ` +
          `or register it before retrying.`,
      );
    }
  }
}
```

불일치 후 primary workspace에 재시도하지 마세요. `/capabilities`를 새로고침하고, `workspaces[]`에서 의도한 항목을 선택하거나, `POST /workspaces`를 통해 적절한 동적 workspace를 등록하세요. 인증, 속도 제한, 프로세스 결함 경계도 독립적이어야 하는 경우에만 별도의 데몬을 사용하세요.

## 인증

데몬이 토큰과 함께 시작된 경우 (loopback이 아닌 바인딩에는 토큰이 필요합니다):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**SDK 환경 변수 폴백 (PR 27, v0.16-alpha)** — `DaemonClient`는 `token`이 생략되면 `QWEN_SERVER_TOKEN`을 환경에서 자동으로 읽습니다. 데몬 자체의 `--token` CLI 폴백과 동일합니다. 따라서 셸에 `export QWEN_SERVER_TOKEN=...`이 있으면, 다음 코드와 동일합니다.

```ts
// Same effect as token: process.env.QWEN_SERVER_TOKEN, but without the boilerplate.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

폴백은 앞뒤 공백을 제거하며(`cat`이 개행 문자를 추가하는 `export QWEN_SERVER_TOKEN="$(cat token.txt)"`에 유용), 빈 값 또는 공백만 있는 값을 미설정으로 처리합니다(오래된 `export QWEN_SERVER_TOKEN=""`이 토큰 없이 `Authorization: Bearer `를 실수로 전송하지 않습니다). 폴백은 생성 시 한 번만 실행되며, 이후 `process.env` 변경은 이미 생성된 클라이언트에 영향을 주지 않습니다. 브라우저 번들(예: `@qwen-code/webui` 통함)은 `globalThis.process`가 존재하지 않기 때문에 `undefined`를 cleanly 받습니다.

잘못되었거나 누락된 토큰은 균일한 본문과 함께 `401`을 반환합니다 — SDK는 라우트 핸들러의 4xx/5xx에서 `DaemonHttpError`를 발생시킵니다.

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

## 진행 중인 프롬프트 취소

사용자가 Esc를 누르면:

```ts
await client.cancel(session.sessionId);
// In the event stream you'll see the prompt resolve with stopReason: "cancelled"
```

취소는 **활성** 프롬프트만 종료합니다 — 이미 POST되었고 그 뒤에 큐에 있는 항목은 계속 실행됩니다. (이유는 프로토콜 레퍼런스를 참조하세요.)

## 다음 단계

- [HTTP 프로토콜 레퍼런스](../qwen-serve-protocol.md) — 상태 코드를 포함한 전체 라우트 명세
- [데몬 모드 사용자 가이드](../../users/qwen-serve.md) — 운영자 측 문서
- 소스: `packages/sdk-typescript/src/daemon/`
