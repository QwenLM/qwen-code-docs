# Recuperação de Memória Assíncrona — Especificação de Design

**Data:** 2026-05-15
**Status:** Aprovado
**Issues relacionadas:** #3761, #3759
**PRs relacionadas:** #3814, #3866

---

## Problema

`relevanceSelector.ts` utiliza `AbortSignal.timeout(1_000)` (introduzido por #3866). Em cold starts de primeira sessão, o qwen3.5-flash leva em média ~908 ms — atingindo consistentemente o limite de 1 s. O prazo externo de 2,5 s em `resolveAutoMemoryWithDeadline` significa que cada UserQuery pode bloquear por até 2,5 s mesmo quando a recuperação sempre falha.

Causa raiz: o caminho de requisição do agente principal `await`a o resultado da recuperação antes de enviar para o modelo. Qualquer lentidão na consulta lateral de recuperação adiciona diretamente à latência visível ao usuário.

---

## Design

### Ideia principal

Disparar a recuperação no UserQuery e nunca fazer `await` dela. Consumir o resultado em dois pontos oportunistas — o que disparar primeiro:

1. **Ponto de consumo do UserQuery** — verificação síncrona `settledAt !== null` logo antes de `turn.run()`. Sem espera: se já estiver resolvido, use; se não, pule.
2. **Ponto de injeção em ToolResult** — mesma verificação em cada turno de ToolResult. Injeta a memória como um `system-reminder` **anexado após** as partes de functionResponse em `requestToSend`, dando ao modelo contexto de memória antes de sua próxima resposta. (Anexar, não prefixar: a API Qwen exige que o functionResponse siga imediatamente o functionCall do modelo — veja o `hasPendingToolCall` atual de skip do contexto IDE para a mesma restrição.)

Isso corresponde ao padrão usado pelo Claude Code upstream (`startRelevantMemoryPrefetch` / polling de `settledAt` em `query.ts`).

---

## Estruturas de dados

### Novo tipo `MemoryPrefetchHandle` (em `client.ts`)

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** Set by promise.finally(). null until the promise settles. */
  settledAt: number | null;
  /** True after memory has been injected — prevents double-inject. */
  consumed: boolean;
  controller: AbortController;
};
```

### Mudança de campo em `GeminiClient`

| Remover                                                       | Adicionar                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `pendingRecallAbortController: AbortController \| undefined`  | `pendingMemoryPrefetch: MemoryPrefetchHandle \| undefined`    |

---

## Mudanças

### 1. `client.ts` — remover `resolveAutoMemoryWithDeadline`

Remover a função por completo. Ela é substituída pelo mecanismo da flag `settledAt`.

### 2. `client.ts` — Caminho de disparo do UserQuery

Substituir a chamada a `resolveAutoMemoryWithDeadline` por:

```typescript
// Aborta qualquer pré-busca em andamento de um UserQuery anterior antes de instalar
// o novo handle (evita consultas laterais órfãs quando o usuário digita novamente
// antes de a recuperação ser resolvida).
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// Ponte do sinal do chamador para o controlador de pré-busca para que um abort
// do usuário (Ctrl-C / Esc) no turno pai também termine a consulta lateral de recuperação.
const onParentAbort = () => controller.abort();
if (signal.aborted) {
  controller.abort();
} else {
  signal.addEventListener('abort', onParentAbort, { once: true });
}

const promise = this.config
  .getMemoryManager()
  .recall(projectRoot, partToString(request), {
    config: this.config,
    excludedFilePaths: this.surfacedRelevantAutoMemoryPaths,
    abortSignal: controller.signal,
  })
  .catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      debugLogger.warn('Managed auto-memory recall prefetch failed.', error);
    }
    return EMPTY_RELEVANT_AUTO_MEMORY_RESULT;
  });

const handle: MemoryPrefetchHandle = {
  promise,
  settledAt: null,
  consumed: false,
  controller,
};
void promise.finally(() => {
  handle.settledAt = Date.now();
  signal.removeEventListener('abort', onParentAbort);
});
this.pendingMemoryPrefetch = handle;
// sem await — continua imediatamente
```

### 3. `client.ts` — Ponto de consumo do UserQuery (substitui `await relevantAutoMemoryPromise`)

```typescript
const prefetchHandle = this.pendingMemoryPrefetch;
if (
  prefetchHandle &&
  prefetchHandle.settledAt !== null &&
  !prefetchHandle.consumed
) {
  prefetchHandle.consumed = true;
  this.pendingMemoryPrefetch = undefined;
  const result = await prefetchHandle.promise; // já resolvida, retorna imediatamente
  if (result.prompt) {
    // unshift, não push: manter a memória na frente dos systemReminders para que
    // lidere o bloco de system-reminder nos turnos de UserQuery. (Turnos de ToolResult
    // em vez disso anexam a requestToSend para preservar o pareamento functionCall /
    // functionResponse — veja abaixo.)
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — Ponto de injeção em ToolResult (novo)

Após `requestToSend` ser montado, antes de `turn.run()`, adicionar:

```typescript
if (messageType === SendMessageType.ToolResult) {
  const prefetchHandle = this.pendingMemoryPrefetch;
  if (
    prefetchHandle &&
    prefetchHandle.settledAt !== null &&
    !prefetchHandle.consumed
  ) {
    prefetchHandle.consumed = true;
    this.pendingMemoryPrefetch = undefined;
    const result = await prefetchHandle.promise;
    if (result.prompt) {
      // Anexar (não prefixar) para que as partes de functionResponse permaneçam primeiro
      // e o pareamento functionCall/functionResponse do modelo
      // não seja quebrado no caminho nativo do Gemini.
      requestToSend = [...requestToSend, result.prompt];
      for (const doc of result.selectedDocs) {
        this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
      }
    }
  }
}
```

### 5. `client.ts` — Caminhos de limpeza

O handle é liberado por dois mecanismos distintos:

**5 locais de abortar-e-limpar** (a pré-busca ainda está pendente, abortar o controlador antes de descartar a referência). Substituir `pendingRecallAbortController?.abort()` + `= undefined` por:

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

Locais: `resetChat()`, retorno antecipado de `MaxSessionTurns`, retorno antecipado de `boundedTurns=0`, retorno antecipado de `SessionTokenLimitExceeded`, retorno antecipado de sinal de controle Arena. O próprio caminho de disparo também realiza este abortar-e-substituir quando um novo UserQuery chega enquanto a pré-busca anterior ainda está em andamento.

**2 locais de apenas limpar** (a pré-busca já foi resolvida e estamos consumindo — nenhum controlador para abortar, apenas descartar a referência):

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

Locais: ponto de consumo do UserQuery, ponto de injeção em ToolResult.

### 6. `relevanceSelector.ts` — remover `AbortSignal.timeout(1_000)`

Remover a combinação `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` e passar `callerAbortSignal` diretamente.

---

## Comparação de comportamento

| Cenário                                       | Antes                           | Depois                                                    |
| --------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| recall completa antes da preparação do modelo | injeta no UserQuery, ~0 espera  | injeta no UserQuery, ~0 espera                            |
| recall lento (cold start)                     | bloqueia por até 2,5 s          | pula UserQuery, injeta no primeiro ToolResult             |
| recall expira (1 s)                           | aborta, resultado vazio, sem memória | sem timeout rígido; injeta quando for resolvido         |
| sem chamadas de ferramenta, recall lento      | bloqueia por até 2,5 s, depois pula | pula UserQuery, sem oportunidade de ToolResult — perde |
| usuário envia 2ª mensagem antes do recall resolver | 2º recall compete com o 1º handle | 1º handle abortado quando 2º UserQuery dispara novo handle |

---

## Fora do escopo

- Alterar o formato de injeção de memória de `system-reminder` para anexação a `tool-result` (estilo CC)
- Portão de salto por orçamento de bytes por sessão
- Portão de salto para prompt de palavra única