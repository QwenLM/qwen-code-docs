# Guia rápido do DaemonClient (TypeScript)

Um exemplo mínimo de ponta a ponta: inicie um daemon `qwen serve` em outro terminal e controle-o a partir de um script Node com o `DaemonClient` do SDK. Veja também: [Guia do usuário do modo Daemon](../../users/qwen-serve.md) e [Referência do protocolo HTTP](../qwen-serve-protocol.md).

## Configuração

Em um terminal:

```bash
qwen serve --port 4170 \
  --workspace /path/to/project-a \
  --workspace /path/to/project-b
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/project-a)
```

Cada valor de `--workspace` deve ser um diretório absoluto. O primeiro workspace de inicialização é o primário e continua sendo o padrão de compatibilidade para requisições que omitem `cwd`; `/capabilities.workspaces[]` é o catálogo que os clientes devem usar ao selecionar qualquer runtime explicitamente.

Em outro terminal:

```bash
npm install @qwen-code/sdk
```

## Olá, daemon

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

// 1. Confirme que podemos alcançar o daemon, baseie a UI em suas
//    features e selecione um workspace confiável do catálogo anunciado.
const caps = await client.capabilities();
console.log('Daemon features:', caps.features);
const selectedWorkspace =
  caps.workspaces?.find(
    (workspace) => workspace.trusted && !workspace.primary,
  ) ?? caps.workspaces?.find((workspace) => workspace.trusted);
if (!selectedWorkspace) throw new Error('No trusted workspace is available');
console.log('Selected workspace:', selectedWorkspace.id, selectedWorkspace.cwd);

// 2. Spawn-or-attach dentro desse runtime. O SDK mapeia `workspaceCwd`
//    para o campo `cwd` no nível de wire do POST /session. Omiti-lo é
//    permitido apenas quando o chamador intencionalmente quer o padrão
//    primário legado.
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

## Helpers de arquivos do workspace

As rotas de arquivo têm escopo de workspace, não de sessão. Vincule um helper qualificado ao id do workspace selecionado para que cada requisição permaneça dentro daquele runtime:

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

O `expectedHash` é o SHA-256 sobre os bytes brutos do disco. Tanto o `mode: "replace"` quanto o `editWorkspaceFile()` exigem isso para que clientes desatualizados não sobrescrevam um arquivo que acabaram de ler. As operações de escrita/edição exigem configuração do token de portador mesmo em loopback; inicie o daemon com `--token` ou `QWEN_SERVER_TOKEN` antes de usá-las.

## Reconexão com `Last-Event-ID`

Se o seu processo cliente for reiniciado no meio de uma sessão, reproduza os eventos que você perdeu:

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

O daemon retém os últimos 8000 eventos por sessão em um buffer circular; lacunas além dessa janela não poderão ser reentregues.

## Votação em permissões

Quando o agente solicita permissão para executar uma ferramenta, todos os clientes conectados veem o evento `permission_request`. **O primeiro respondedor vence** – assim que um cliente vota, os demais recebem `404` se tentarem votar no mesmo `requestId`.

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

## Colaboração em sessão compartilhada

Dois clientes apontados para o **mesmo workspace do daemon** acabam na mesma sessão quando usam o `sessionScope: 'single'` padrão. Para um daemon single-workspace iniciado como `qwen serve --workspace /work/repo` (ou `cd /work/repo && qwen serve`), ambos os clientes conectam àquele workspace primário:

```ts
// Daemon foi iniciado como `qwen serve --workspace /work/repo` então
// `caps.workspaceCwd === '/work/repo'` para ambos os clientes.

// Cliente A (ex.: um plugin de IDE)
const a = await clientA.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(a.attached); // false — A gerou o agente

// Cliente B (ex.: uma interface web na mesma máquina)
const b = await clientB.createOrAttachSession({ workspaceCwd: '/work/repo' });
console.log(b.attached); // true — B entrou na sessão de A
console.log(a.sessionId === b.sessionId); // true
```

Ambos os clientes veem o mesmo fluxo de `session_update` / `permission_request`. Qualquer um pode enviar um prompt; eles entram em uma fila FIFO conforme a garantia do agente de "um prompt ativo por sessão".

## Incompatibilidade de workspace

Se `workspaceCwd` não corresponder a nenhum workspace anunciado registrado, `createOrAttachSession` rejeita com `DaemonHttpError` carregando status `400` e um corpo estruturado. Um workspace secundário registrado mas não confiável retorna `403 untrusted_workspace` e não deve ser retestado contra o primário:

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
        `Workspace ${body.requestedWorkspace} não está registrado. ` +
          `Atualize as capabilities e selecione um workspace anunciado, ` +
          `ou registre-o antes de tentar novamente.`,
      );
    }
  }
}
```

Não faça retry contra o workspace primário após um mismatch. Atualize `/capabilities`, selecione a entrada pretendida de `workspaces[]` ou registre um workspace dinâmico elegível via `POST /workspaces`. Use daemons separados apenas quando autenticação, limite de taxa ou boundaries de falha de processo também precisarem ser independentes.

## Autenticação

Quando o daemon foi iniciado com um token (qualquer vinculação não-loopback exige um):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**Fallback de env do SDK (PR 27, v0.16-alpha)** — `DaemonClient` lê `QWEN_SERVER_TOKEN` do ambiente automaticamente quando `token` é omitido, espelhando o fallback da própria flag `--token` da CLI do daemon. Então, se o seu shell possui `export QWEN_SERVER_TOKEN=...`, isso é equivalente ao acima:

```ts
// Same effect as token: process.env.QWEN_SERVER_TOKEN, but without the boilerplate.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

O fallback remove espaços em branco no início/fim (útil para `export QWEN_SERVER_TOKEN="$(cat token.txt)"` onde `cat` adiciona uma nova linha) e trata valores vazios/compostos apenas de espaços como não definidos (um `export QWEN_SERVER_TOKEN=""` desatualizado não enviará acidentalmente `Authorization: Bearer ` sem token). O fallback é executado uma vez na construção; mutações posteriores em `process.env` não afetam clientes já construídos. Pacotes de navegador (ex.: via `@qwen-code/webui`) obtêm `undefined` corretamente porque `globalThis.process` não existe lá.

Tokens incorretos ou ausentes retornam `401` com um corpo uniforme – o SDK lança `DaemonHttpError` em qualquer 4xx/5xx de um manipulador de rota.

```ts
import { DaemonHttpError } from '@qwen-code/sdk';

try {
  await client.health();
} catch (err) {
  if (err instanceof DaemonHttpError) {
    console.error(`Erro do daemon ${err.status}:`, err.body);
  } else {
    throw err;
  }
}
```

## Cancelar um prompt em andamento

Se o usuário apertar Esc:

```ts
await client.cancel(session.sessionId);
// No fluxo de eventos, você verá o prompt resolver com stopReason: "cancelled"
```

Cancelar apenas encerra o prompt **ativo** – qualquer coisa que você já tenha enviado por POST e que ainda esteja na fila atrás dele continuará sendo executada. (Consulte a referência do protocolo para a justificativa.)

## Próximos passos

- [Referência do protocolo HTTP](../qwen-serve-protocol.md) — especificação completa das rotas com códigos de status
- [Guia do usuário do modo Daemon](../../users/qwen-serve.md) — documentação do lado do operador
- Código-fonte: `packages/sdk-typescript/src/daemon/`