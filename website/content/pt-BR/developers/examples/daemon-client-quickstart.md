# Início rápido do DaemonClient (TypeScript)

Um exemplo mínimo de ponta a ponta: inicie um daemon `qwen serve` em outro terminal, depois controle-o a partir de um script Node com o `DaemonClient` do SDK. Veja também: [Guia do usuário do modo Daemon](../../users/qwen-serve.md) e [Referência do protocolo HTTP](../qwen-serve-protocol.md).

## Configuração

Em um terminal:

```bash
cd seu-projeto/
qwen serve --port 4170
# → qwen serve ouvindo em http://127.0.0.1:4170 (mode=http-bridge, workspace=/caminho/para/seu-projeto)
```

Conforme [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02, cada daemon se vincula a um workspace na inicialização (o `cwd` atual, ou sobrescreva com `--workspace /caminho/para/dir`). O caminho vinculado do daemon é anunciado em `/capabilities.workspaceCwd` para que os clientes possam fazer uma verificação prévia e omitir `cwd` de `POST /session`.

Em outro:

```bash
npm install @qwen-code/sdk
```

## Olá, daemon

```ts
import { DaemonClient, type DaemonEvent } from '@qwen-code/sdk';

const client = new DaemonClient({
  baseUrl: 'http://127.0.0.1:4170',
  // PR 27 (v0.16-alpha): quando `token` é omitido, o DaemonClient recorre
  // automaticamente a `process.env.QWEN_SERVER_TOKEN` — a mesma variável
  // de ambiente para a qual a flag `--token` do daemon também recorre. Então:
  //   export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"   # único uso
  //   export QWEN_SERVER_TOKEN="$(cat ./meu-arquivo-token)" # arquivo gerenciado pelo usuário
  //   const client = new DaemonClient({ baseUrl: '...' });
  // OU passe explicitamente quando tiver um nome de variável de ambiente diferente:
  //   token: process.env.ME_TOKEN,
});

// 1. Confirme que podemos alcançar o daemon, controle a IU com base em seus
//    recursos e leia o workspace vinculado do daemon (#3803 §02).
const caps = await client.capabilities();
console.log('Recursos do daemon:', caps.features);
console.log('Workspace do daemon:', caps.workspaceCwd); // caminho vinculado canônico

// 2. Inicie ou anexe a uma sessão. Duas formas igualmente válidas:
//    (a) passe `workspaceCwd: caps.workspaceCwd` para ser explícito, ou
//    (b) omita `workspaceCwd` completamente — o SDK então não envia nenhum
//        campo `cwd` e a rota do daemon recorre ao seu workspace vinculado.
//        A forma (b) é concisa, mas pressupõe que você confia que
//        `caps.workspaceCwd` é o que você pretendia.
//    Um `workspaceCwd` não vazio que não canonicamente para o caminho
//    vinculado do daemon resulta em `400 workspace_mismatch` (veja
//    "Incompatibilidade de workspace" abaixo).
const session = await client.createOrAttachSession({
  workspaceCwd: caps.workspaceCwd,
});
console.log(`session=${session.sessionId} attached=${session.attached}`);

// 3. Inscreva-se no fluxo de eventos. Passe `lastEventId: 0` para que o
//    daemon reproduza tudo desde o início da sessão — sem isso, há uma
//    janela TOCTOU entre o momento em que `subscribeEvents()` retorna o
//    iterador e a conexão SSE subjacente ser realmente aberta (um round-trip
//    fetch), durante a qual um agente de inicialização rápida pode emitir
//    eventos que vão para o anel por sessão, mas não serão transmitidos para
//    um assinante novo sem cursor. `lastEventId: 0` faz o buffer de
//    reprodução cobrir essa lacuna (e qualquer reconexão posterior — veja
//    abaixo).
const abort = new AbortController();
const subscription = (async () => {
  for await (const event of client.subscribeEvents(session.sessionId, {
    signal: abort.signal,
    lastEventId: 0,
  })) {
    handleEvent(event);
  }
})();

// 4. Envie um prompt e aguarde a conclusão. (Nota sobre ordem de operações:
//    mesmo que `prompt()` dispare antes do handshake SSE ser concluído,
//    `lastEventId: 0` do passo 3 garante que todo evento chegue no iterador.)
const result = await client.prompt(session.sessionId, {
  prompt: [{ type: 'text', text: 'Resuma src/main.ts em uma frase.' }],
});
console.log('Motivo da parada:', result.stopReason);

// 5. Encerre a assinatura para que o script possa sair.
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
      // Veja "Votação em permissões" abaixo para semântica do primeiro respondedor.
      console.log('\n[precisa de permissão]', event.data);
      break;
    case 'permission_resolved':
      console.log('\n[permissão resolvida]', event.data);
      break;
    case 'session_died':
      console.error('\n[agente travou]', event.data);
      break;
    default:
      console.log(`\n[${event.type}]`, event.data);
  }
}
```

## Auxiliares de arquivos do workspace

As rotas de arquivos têm escopo de workspace, não de sessão, portanto ficam
diretamente no `DaemonClient`:

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
`expectedHash` é o SHA-256 dos bytes brutos no disco. `mode: "replace"` e `editWorkspaceFile()` o exigem para que clientes desatualizados não sobrescrevam um arquivo que acabaram de ler. Operações de escrita/edição exigem configuração de bearer-token mesmo em loopback; inicie o daemon com `--token` ou `QWEN_SERVER_TOKEN` antes de usá-las.

## Reconectar com `Last-Event-ID`

Se o seu processo cliente reiniciar no meio de uma sessão, reproduza os eventos que perdeu:

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

O daemon mantém os últimos 8000 eventos por sessão em um buffer circular; lacunas além dessa janela não serão reentregues.

## Votação em permissões

Quando o agente solicita permissão para executar uma ferramenta, todos os clientes conectados veem o evento `permission_request`. **O primeiro a responder vence** — assim que um cliente vota, os demais recebem `404` se tentarem votar no mesmo `requestId`.

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

Dois clientes apontados para o **mesmo daemon** acabam na mesma sessão. De acordo com #3803 §02, cada daemon está vinculado a UM único espaço de trabalho (workspace) na inicialização, então o daemon iniciado como `qwen serve --workspace /work/repo` (ou `cd /work/repo && qwen serve`) é o que ambos os clientes se conectam:

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

Ambos os clientes veem o mesmo fluxo de `session_update` / `permission_request`. Qualquer um pode enviar um prompt; eles enfileiram em FIFO conforme a garantia do agente de "um prompt ativo por sessão".

## Incompatibilidade de workspace

Se `workspaceCwd` não corresponder ao workspace vinculado ao daemon, `createOrAttachSession` rejeita com `DaemonHttpError` carregando status `400` e um corpo estruturado:

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

Implantações com vários workspaces executam um daemon por workspace em portas separadas — não há roteamento intra-daemon segundo §02. Um orquestrador (ou o lançador do usuário) escolhe o daemon correto baseado no projeto com o qual o cliente deseja se comunicar.

## Autenticação

Quando o daemon foi iniciado com um token (qualquer vinculação não-loopback exige um):

```ts
const client = new DaemonClient({
  baseUrl: 'https://your-host:4170',
  token: process.env.QWEN_SERVER_TOKEN,
});
```

**Fallback de env no SDK (PR 27, v0.16-alpha)** — `DaemonClient` lê `QWEN_SERVER_TOKEN` do ambiente automaticamente quando `token` é omitido, espelhando o próprio fallback de `--token` do CLI do daemon. Então, se seu shell tem `export QWEN_SERVER_TOKEN=...`, isso é equivalente ao anterior:

```ts
// Same effect as token: process.env.QWEN_SERVER_TOKEN, but without the boilerplate.
const client = new DaemonClient({ baseUrl: 'https://your-host:4170' });
```

O fallback remove espaços em branco no início/fim (útil para `export QWEN_SERVER_TOKEN="$(cat token.txt)"` onde `cat` adiciona uma nova linha) e trata valores vazios ou apenas com espaços como não definidos (um `export QWEN_SERVER_TOKEN=""` antigo não enviará acidentalmente `Authorization: Bearer ` sem token). O fallback é executado uma vez na construção; mutações posteriores em `process.env` não afetam clientes já construídos. Bundles de navegador (ex.: via `@qwen-code/webui`) obtêm `undefined` limpo porque `globalThis.process` não existe lá.

Tokens errados / ausentes retornam `401` com um corpo uniforme — o SDK lança `DaemonHttpError` em qualquer 4xx/5xx de um manipulador de rota.
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

## Cancelar um prompt em andamento

Se o usuário pressionar Esc:

```ts
await client.cancel(session.sessionId);
// In the event stream you'll see the prompt resolve with stopReason: "cancelled"
```

Cancelar interrompe apenas o **prompt ativo** — qualquer coisa que você já tenha enviado via POST e que ainda esteja na fila atrás dele continuará a ser executada. (Veja a referência do protocolo para a lógica.)

## O que vem a seguir

- [Referência do protocolo HTTP](../qwen-serve-protocol.md) — especificação completa das rotas com códigos de status
- [Guia do usuário do modo Daemon](../../users/qwen-serve.md) — documentação do operador
- Fonte: `packages/sdk-typescript/src/daemon/`
