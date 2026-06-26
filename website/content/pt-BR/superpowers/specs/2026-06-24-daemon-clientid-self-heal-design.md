# Design: autocorreção de `clientId` em caso de `invalid_client_id` (DaemonSessionClient)

- **Data:** 2026-06-24
- **Componente:** `packages/sdk-typescript` — `DaemonSessionClient`
- **Depende de:** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **merged** (`84745d0f0`)
- **Status:** Implementado (construído sobre a base do #5784 merged)

## Problema

Após uma reinicialização do daemon (ou recarga de sessão), o registro de cliente
em memória do daemon é limpo. Um frontend que ainda mantém um `clientId` antigo
(atribuído pelo servidor) enviará `POST /session/:id/prompt` com esse id
obsoleto. O `resolveTrustedClientId` da bridge não o reconhece e rejeita o
prompt com `InvalidClientIdError`.

Incidente observado em produção (trace `a76a31fe…`, log do daemon 15:24): o prompt
foi enviado por `client_d019b847` enquanto a sessão havia sido (re)carregada com
um id diferente `client_ac36fac9`, então o cliente que enviou o prompt nunca
esteve registrado. A UI ficou em "处理中" indefinidamente porque a falha nunca foi
apresentada como um evento de turno terminal.

O PR #5784 corrige a metade da _apresentação_: `invalid_client_id` agora é
lançado no **momento da admissão**, então `POST /session/:id/prompt` retorna um
`400 invalid_client_id` síncrono (sem `promptId`) em vez de `202` seguido de
falha assíncrona silenciosa. Este design adiciona a metade de _autocorreção_:
quando o SDK recebe esse `400`, ele se re-registra para obter um `clientId` novo
e tenta o prompt novamente uma vez, para que o turno prossiga sem que o usuário
precise reenviar manualmente.

## Escopo

Dentro do escopo (SDK apenas, `DaemonSessionClient`):

- Detectar `invalid_client_id` na chamada de admissão do prompt.
- Re-registrar o cliente contra a sessão (já restaurada) para obter um novo
  `clientId` atribuído pelo servidor.
- Tentar o prompt **uma vez** com o novo `clientId`.

Fora do escopo explicitamente (YAGNI):

- Reconexão do stream SSE — continua sendo responsabilidade da camada de
  aplicação (o app dataworks já possui lógica de `reloadSession`/reconexão).
  `invalid_client_id` só aparece na chamada de admissão, nunca na espera do SSE.
- Autocorreção para outros métodos que usam `clientId` (`btw`, `shell`,
  mensagem no meio do turno, `cancel`, `heartbeat`). Apenas `prompt()` faz
  autocorreção.
- Persistir `clientId` entre reinicializações do daemon.

## Invariantes principais (verificadas contra o código-fonte)

1. **A tentativa é segura porque `invalid_client_id` é uma rejeição no momento
   da admissão.** `resolveTrustedClientId` é executado dentro de `bridge.sendPrompt`
   _antes_ do turno ser registrado e antes da rota emitir `202`. Com o PR #5784,
   isso lança uma exceção sincronamente → `400` antes da aceitação → o prompt
   **nunca foi executado**. Portanto, tentar novamente não pode executar a
   mensagem do usuário duas vezes. Essa invariante é a base inteira para a
   segurança da nova tentativa; depende do #5784.

2. **`registerClient` nunca lança exceção e sempre retorna um id válido.** Para
   um `requestedClientId` desconhecido, ele cai em `createClientId()` e retorna
   um novo `client_<uuid>`. Apenas `resolveTrustedClientId` (usado por
   prompt/cancel/…) lança exceção. Portanto, uma chamada `load`/`resume` sempre
   retorna um `clientId` utilizável.

3. **A resposta de restauração sempre carrega o `clientId` registrado.** Tanto o
   caminho rápido de entrada existente quanto o caminho de restauração a frio
   definem `clientId: registerClient(entry, req.clientId)` na resposta. (A
   observação "ecoado de volta apenas quando o chamador forneceu um clientId" em
   `types.ts` se aplica a `HeartbeatResult`, não à restauração.)

4. **Não há vazamento líquido de attach no cenário de reinicialização, e a
   correção de `close()` melhora.** `resumeSession` faz `attachCount++`. O
   decremento com contagem de referência é `/detach` → `detachClient`
   (`attachCount--` + `unregisterClient`). `close()` → `DELETE /session/:id` →
   `closeSessionImpl` é **destruir-tudo**: ele valida o `clientId` via
   `resolveTrustedClientId` e depois derruba a sessão (`byId.delete`),
   descartando `attachCount` junto com ela. Uma reinicialização do daemon limpa o
   attach pré-reinicialização; `reattach()` restabelece exatamente um attach, e
   um `close()`/reinicialização posterior derruba tudo — sem vazamento líquido.
   Note que `closeSessionImpl` também valida o `clientId`, então antes dessa
   mudança, um `close()` pós-reinicialização com um id obsoleto lançaria
   `InvalidClientIdError`; após um `reattach()` acionado por prompt,
   `this.clientId` é válido, então `close()` funciona. (`close()` não faz
   autocorreção — fora do escopo — mas se beneficia indiretamente.)

5. **A mudança é inerte sem o PR #5784.** Um daemon anterior ao #5784 retorna
   `202` seguido de falha assíncrona, nunca `400 invalid_client_id`, então o
   predicado nunca é verdadeiro e a autocorreção nunca é acionada. No-op
   inofensivo.

## Design

Todas as alterações estão confinadas em
`packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`.

### 1. `isInvalidClientId(err): boolean`

```ts
function isInvalidClientId(err: unknown): boolean {
  return (
    err instanceof DaemonHttpError &&
    err.status === 400 &&
    typeof err.body === 'object' &&
    err.body !== null &&
    (err.body as { code?: unknown }).code === 'invalid_client_id'
  );
}
```

Requer importar `DaemonHttpError` de `./DaemonHttpError.js`.

### 2. `reattach(): Promise<void>` — single-flight

```ts
private reattaching?: Promise<void>;

private async reattach(): Promise<void> {
  // Coalesce concurrent prompts that all observed invalid_client_id so we
  // re-register exactly once (avoids orphaning extra clientIds / attachCount).
  if (this.reattaching) return this.reattaching;
  this.reattaching = (async () => {
    // Pass no clientId so the bridge issues a fresh registration instead of
    // validating the stale one. Pass workspaceCwd explicitly: restoreSession
    // calls resolveWorkspaceKey(req.workspaceCwd) before the existing-entry
    // fast path, and that helper throws on a non-absolute/undefined path.
    const { clientId } = await this.client.resumeSession(
      this.sessionId,
      { workspaceCwd: this.workspaceCwd },
      undefined,
    );
    this.session.clientId = clientId; // only refresh clientId; leave the SSE
                                      // cursor (lastSeenEventId) and state alone
  })();
  try {
    await this.reattaching;
  } finally {
    this.reattaching = undefined;
  }
}
```

`this.session` é uma cópia rasa e `DaemonSession.clientId` não é `readonly`,
então a mutação in-place é válida. `resume` (e não `load`) é usado porque
precisamos apenas do re-registro, não da reprodução do histórico.

### 3. `withClientIdSelfHeal<T>(fn): Promise<T>`

```ts
private async withClientIdSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isInvalidClientId(err)) throw err; // non-invalid_client_id: propagate
    await this.reattach();                  // may throw → propagate
    return await fn();                      // retry exactly once; if it throws
                                            // again (incl. invalid_client_id),
                                            // propagate — no loop
  }
}
```

### 4. Integração no `prompt()`

Envolver apenas a chamada de rede de admissão em ambos os caminhos; manter
`reservePromptSlot`/`releaseAdmission` fora do wrapper para que o slot local
seja reservado uma vez e reutilizado na nova tentativa:

- Caminho bloqueante (`!this.subscriptionActive`):
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- Caminho não bloqueante:
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` é lido **dentro** da closure para que a nova tentativa pegue o
id atualizado. Tudo depois da admissão (o registro `_pendingPrompts` e a
correspondência de eventos SSE de turno por `promptId`) permanece inalterado; a
assinatura SSE é indexada por `sessionId`, então sobrevive à mudança de
`clientId`.

## Tratamento de erros

- Erros que não são `invalid_client_id` (ex.: `500`, `SessionNotFoundError`,
  `DaemonPendingPromptLimitError`): propagados imediatamente, sem `reattach`.
- Falha em `reattach()` (sessão realmente sumiu, rede): propagada — o usuário
  vê um erro real em vez de um travamento.
- Tentativa exaurida (nova tentativa também dá `invalid_client_id`): propagada;
  limitada a uma tentativa, sem loop.
- `AbortSignal`: a chamada `prompt`/`promptNonBlocking` encapsulada executa
  `throwIfAborted()` na entrada, então uma nova tentativa após abortar lança
  `AbortError`. (`resumeSession` não tem parâmetro de sinal; um `reattach` em
  andamento não pode ser abortado — aceitável, é uma única chamada curta.)

## Limitações conhecidas

- **Caso raro de evicção individual:** se um `clientId` for evictado enquanto a
  sessão permanece viva na memória (revogação por vazamento / `client_evicted`),
  `reattach()` adiciona um attach extra (`attachCount++`) sem um `/detach`
  correspondente. Como `close()` é destruir-tudo, a única janela de vazamento é
  uma sessão que é abandonada sem um `close()` explícito e é então impedida de
  ser coletada pelo GC ocioso devido ao `attachCount` travado (limitado a uma
  sessão). O incidente realista é o caso de reinicialização do daemon, que é
  limpo. Documentado em vez de resolvido com engenharia.

## Testes (TDD)

Use o harness `recordingFetch` existente em
`packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts`, interceptando
por URL através de um `DaemonClient` real (exercita o mapeamento real
`failOnError` → `DaemonHttpError`).

1. **Autocorreção não bloqueante:** primeiro `POST /session/s-1/prompt` → `400
{code:'invalid_client_id'}`; `POST /session/s-1/resume` → `clientId: 'client-2'`
   novo; segundo prompt → `202`. Assert: o prompt resolve, a segunda requisição
   de prompt carrega `x-qwen-client-id: client-2`, resume chamado uma vez.
2. **Autocorreção bloqueante** (`subscriptionActive` false): mesmo padrão, via
   caminho `prompt` bloqueante (`200`/`202` + turno completo na nova tentativa).
3. **Tentativa limitada:** prompt → `400 invalid_client_id` duas vezes → o erro
   propaga (assert resume chamado uma vez, erro é `DaemonHttpError`
   invalid_client_id).
4. **Erro não-invalid não é tentado novamente:** prompt → `500` → propaga
   imediatamente, `resume` **nunca** chamado.
5. **Falha no reattach propaga:** prompt → `400 invalid_client_id`; resume →
   `404`/`500` → esse erro propaga.
6. **Single-flight:** duas chamadas `prompt()` concorrentes ambas recebem
   `400 invalid_client_id` → `resume` chamado exatamente uma vez; ambas as novas
   tentativas usam o novo id.