# Design: auto-recuperação de clientId em `invalid_client_id` (DaemonSessionClient)

- **Data:** 2026-06-24
- **Componente:** `packages/sdk-typescript` — `DaemonSessionClient`
- **Depende de:** PR #5784 (`fix(daemon): Reject stale prompt client admission`) — **merged** (`84745d0f0`)
- **Status:** Implementado (construído sobre a base do #5784 já merged)

## Problema

Após a reinicialização do daemon (ou recarga da sessão), o registro de clientes em memória do daemon é apagado. Um frontend que ainda possui um `clientId` mais antigo atribuído pelo servidor enviará `POST /session/:id/prompt` com esse id desatualizado. O `resolveTrustedClientId` da bridge não o reconhece e rejeita o prompt com `InvalidClientIdError`.

Incidente de produção observado (trace `a76a31fe…`, log do daemon 15:24): o prompt foi enviado por `client_d019b847` enquanto a sessão havia sido (re)carregada sob um id diferente `client_ac36fac9`, então o cliente que enviou o prompt nunca foi registrado. A UI permaneceu em "Processando" indefinidamente porque a falha nunca foi exposta como um evento de turno terminal.

O PR #5784 corrige a metade da _exposição_: `invalid_client_id` agora é lançado no **momento da admissão** para que `POST /session/:id/prompt` retorne um `400 invalid_client_id` síncrono (sem `promptId`) em vez de `202` seguido de falha assíncrona silenciosa. Este design adiciona a metade da _auto-recuperação_: quando o SDK recebe esse `400`, ele se registra novamente para obter um novo `clientId` e tenta o prompt novamente uma vez, para que o turno prossiga sem que o usuário precise reenviar manualmente.

## Escopo

No escopo (apenas SDK, `DaemonSessionClient`):

- Detectar `invalid_client_id` na chamada de admissão do prompt.
- Registrar novamente o cliente na sessão (já restaurada) para obter um novo `clientId` atribuído pelo servidor.
- Tentar o prompt novamente **uma vez** com o novo `clientId`.

Explicitamente fora do escopo (YAGNI):

- Reconexão do stream SSE — continua sendo responsabilidade da camada de app existente (o app dataworks já é dono da lógica de `reloadSession`/reconexão). `invalid_client_id` só é exposto na chamada de admissão, nunca na espera do SSE.
- Auto-recuperação para outros métodos que carregam `clientId` (`btw`, `shell`, mensagem de meio de turno, `cancel`, `heartbeat`). Apenas `prompt()` faz auto-recuperação.
- Persistir `clientId` entre reinicializações do daemon.

## Invariantes chave (verificadas no código-fonte)

1. **A tentativa é segura porque `invalid_client_id` é uma rejeição no momento da admissão.**
   O `resolveTrustedClientId` é executado dentro de `bridge.sendPrompt` _antes_ de o turno ser registrado e antes de a rota emitir `202`. Com o PR #5784, isso lança uma exceção de forma síncrona → `400` antes da aceitação → o prompt **nunca é executado**. Portanto, tentar novamente não pode executar a mensagem do usuário duas vezes. Esta invariante é a base inteira para a segurança da nova tentativa; ela depende do #5784.

2. **`registerClient` nunca lança exceção e sempre produz um id válido.** Para um `requestedClientId` desconhecido, ele prossegue para `createClientId()` e retorna um novo `client_<uuid>`. Apenas `resolveTrustedClientId` (usado por prompt/cancel/…) lança exceção. Portanto, uma chamada `load`/`resume` sempre retorna um `clientId` utilizável.

3. **A resposta de restauração sempre carrega o `clientId` registrado.** Tanto o caminho rápido de entrada existente quanto o caminho de restauração a frio definem `clientId: registerClient(entry, req.clientId)` na resposta. (A nota "devolvido apenas quando o chamador forneceu um clientId" em `types.ts` aplica-se a `HeartbeatResult`, não à restauração.)

4. **Sem vazamento líquido de attach no cenário de reinicialização, e a correção de `close()` melhora.** `resumeSession` faz `attachCount++`. O decremento por contagem de referências é `/detach` → `detachClient` (`attachCount--` + `unregisterClient`). `close()` → `DELETE /session/:id` → `closeSessionImpl` é **destruir-tudo**: ele valida o clientId via `resolveTrustedClientId` e então derruba a sessão (`byId.delete`), descartando o `attachCount` junto. Uma reinicialização do daemon apaga o attach pré-reinicialização; `reattach()` restabelece exatamente um attach, e um `close()`/reinicialização posterior derruba tudo — sem vazamento líquido. Note que `closeSessionImpl` também valida o clientId, então antes desta mudança um `close()` pós-reinicialização com um id desatualizado lançaria `InvalidClientIdError`; após um `reattach()` disparado por prompt, `this.clientId` é válido, então `close()` tem sucesso. (`close()` não faz auto-recuperação em si — fora do escopo — mas se beneficia indiretamente.)

5. **A mudança é inerte sem o PR #5784.** Um daemon pré-#5784 retorna `202` seguido de falha assíncrona, nunca `400 invalid_client_id`, então o predicado nunca corresponde e a auto-recuperação nunca é disparada. Inócuo, no-op.

## Design

Todas as alterações estão confinadas a
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

Requer a importação de `DaemonHttpError` de `./DaemonHttpError.js`.

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

`this.session` é uma cópia superficial e `DaemonSession.clientId` não é `readonly`, então a mutação in-place é válida. `resume` (e não `load`) é usado porque precisamos apenas do novo registro, não da reexecução do histórico.

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

### 4. Integração em `prompt()`

Envolva apenas a chamada de rede de admissão em ambos os caminhos; mantenha `reservePromptSlot`/`releaseAdmission` fora do wrapper para que o slot local seja reservado uma vez e reutilizado na nova tentativa:

- Caminho de bloqueio (`!this.subscriptionActive`):
  `return await this.withClientIdSelfHeal(() => this.client.prompt(this.sessionId, req, signal, this.clientId));`
- Caminho sem bloqueio:
  `accepted = await this.withClientIdSelfHeal(() => this.client.promptNonBlocking(this.sessionId, req, signal, this.clientId));`

`this.clientId` é lido **dentro** do closure para que a nova tentativa pegue o id atualizado. Tudo após a admissão (o registro de `_pendingPrompts` e a correspondência de eventos de turno do SSE por `promptId`) permanece inalterado; a assinatura do SSE é chaveada por `sessionId`, então ela sobrevive à mudança de `clientId`.

## Tratamento de erros

- Erros que não sejam `invalid_client_id` (ex.: `500`, `SessionNotFoundError`, `DaemonPendingPromptLimitError`): propagados imediatamente, sem `reattach`.
- Falha em `reattach()` (sessão realmente perdida, rede): propagada — o usuário vê um erro real em vez de um travamento.
- Nova tentativa esgotada (a nova tentativa também retorna `invalid_client_id`): propagada; limitada a uma nova tentativa, sem loop.
- `AbortSignal`: a chamada envolvida `prompt`/`promptNonBlocking` chama `throwIfAborted()` na entrada, então uma nova tentativa após um abort lança `AbortError`. (`resumeSession` não tem parâmetro de signal; um `reattach` em andamento não é abortável — aceitável, é uma única chamada curta.)

## Limitações conhecidas

- **Caso extremo raro de evicção individual:** se um `clientId` for removido enquanto a sessão permanece viva na memória (revogação por vazamento / `client_evicted`), `reattach()` adiciona um attach extra (`attachCount++`) sem um `/detach` correspondente. Como `close()` é destruir-tudo, a única janela de vazamento é uma sessão que é abandonada sem um `close()` explícito e então é impedida de sofrer idle-GC pelo `attachCount` travado (limitado a uma sessão). O incidente realista é o caso de reinicialização do daemon, que é limpo. Documentado em vez de contornado via engenharia.

## Testes (TDD)

Use o harness `recordingFetch` existente em
`packages/sdk-typescript/test/unit/DaemonSessionClient.test.ts`, interceptando por URL através de um `DaemonClient` real (exercita o mapeamento real `failOnError` → `DaemonHttpError`).

1. **Auto-recuperação sem bloqueio:** primeiro `POST /session/s-1/prompt` → `400 {code:'invalid_client_id'}`; `POST /session/s-1/resume` → novo `clientId: 'client-2'`; segundo prompt → `202`. Assert: prompt resolve, a segunda requisição de prompt carrega `x-qwen-client-id: client-2`, resume chamado uma vez.
2. **Auto-recuperação com bloqueio** (`subscriptionActive` false): o mesmo, via o caminho de bloqueio do `prompt` (`200`/`202`+turno completo na nova tentativa).
3. **Nova tentativa limitada:** prompt → `400 invalid_client_id` duas vezes → o erro é propagado (assert resume chamado uma vez, erro é `DaemonHttpError` `invalid_client_id`).
4. **Erro não inválido não é tentado novamente:** prompt → `500` → propagado imediatamente, `resume` **nunca** chamado.
5. **Falha em reattach é propagada:** prompt → `400 invalid_client_id`; resume → `404`/`500` → esse erro é propagado.
6. **Single-flight:** duas chamadas `prompt()` concorrentes ambas recebem `400 invalid_client_id` → `resume` chamado exatamente uma vez; ambas as novas tentativas usam o novo id.