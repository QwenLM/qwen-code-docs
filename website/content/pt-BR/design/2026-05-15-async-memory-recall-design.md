# Recuperação Assíncrona de Memória — Especificação de Design

**Data:** 2026-05-15  
**Status:** Aprovado  
**Issues relacionadas:** #3761, #3759  
**PRs relacionados:** #3814, #3866  

---

## Problema

`relevanceSelector.ts` usa `AbortSignal.timeout(1_000)` (introduzido por #3866). Em cold starts da primeira sessão, qwen3.5-flash leva em média ~908 ms — consistentemente atingindo o limite de 1 s. O deadline externo de 2,5 s em `resolveAutoMemoryWithDeadline` significa que cada UserQuery pode bloquear por até 2,5 s mesmo quando a recuperação sempre falha.

Causa raiz: o caminho de requisição do agente principal `await` o resultado da recuperação antes de enviar ao modelo. Qualquer lentidão na consulta lateral de recuperação adiciona diretamente à latência visível para o usuário.

---

## Design

### Ideia central

Disparar a recuperação no UserQuery e nunca fazer `await` dele. Consumir o resultado em dois pontos oportunistas — o que ocorrer primeiro:

1. **Ponto de consumo do UserQuery** — verificação síncrona `settledAt !== null` logo antes de `turn.run()`. Sem espera: se já estiver resolvido, usa; se não, ignora.
2. **Ponto de injeção do ToolResult** — mesma verificação em cada turno de ToolResult. Injeta a memória como um `system-reminder` **anexado após** as partes de functionResponse em `requestToSend`, dando ao modelo contexto de memória antes de sua próxima resposta. (Anexar, não antepor: a API Qwen exige que o functionResponse venha imediatamente após o functionCall do modelo — veja a restrição existente de pular IDE-context `hasPendingToolCall` para a mesma razão.)

Isso corresponde ao padrão usado upstream pelo Claude Code (`startRelevantMemoryPrefetch` / polling `settledAt` em `query.ts`).

---

## Estruturas de dados

### Novo tipo `MemoryPrefetchHandle` (em `client.ts`)

```typescript
type MemoryPrefetchHandle = {
  promise: Promise<RelevantAutoMemoryPromptResult>;
  /** Definido por promise.finally(). null até a promise resolver. */
  settledAt: number | null;
  /** Verdadeiro após a memória ser injetada — evita injeção dupla. */
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

Excluir a função completamente. Ela é substituída pelo mecanismo de flag `settledAt`.

### 2. `client.ts` — Caminho de disparo do UserQuery

Substituir a chamada `resolveAutoMemoryWithDeadline` por:

```typescript
// Cancela qualquer prefetch em andamento de um UserQuery anterior antes de
// instalar o novo handle (evita consultas laterais órfãs quando o usuário digita
// novamente antes da recuperação resolver).
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;

const controller = new AbortController();
// Ponte do sinal do chamador para o controller do prefetch, para que um abort
// do usuário (Ctrl-C / Esc) no turno pai também termine a consulta lateral.
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
      debugLogger.warn('Falha no prefetch de recuperação automática de memória.', error);
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
  const result = await prefetchHandle.promise; // já resolvido, retorna imediatamente
  if (result.prompt) {
    // unshift, não push: mantém a memória na frente dos systemReminders para
    // que lidere o bloco system-reminder nos turnos de UserQuery. (Turnos de
    // ToolResult, por outro lado, anexam em requestToSend para preservar o
    // pareamento functionCall / functionResponse — veja abaixo.)
    systemReminders.unshift(result.prompt);
    for (const doc of result.selectedDocs) {
      this.surfacedRelevantAutoMemoryPaths.add(doc.filePath);
    }
  }
}
```

### 4. `client.ts` — Ponto de injeção do ToolResult (novo)

Após montar `requestToSend`, antes de `turn.run()`, adicionar:

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
      // Anexa (não antepõe) para que as partes de functionResponse permaneçam primeiro
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
### 5. `client.ts` — caminhos de limpeza

O handle é liberado por dois mecanismos distintos:

**5 locais de abortar e limpar** (a pré-busca ainda está pendente, abortar o controlador antes de descartar a referência). Substitua `pendingRecallAbortController?.abort()` + `= undefined` por:

```typescript
this.pendingMemoryPrefetch?.controller.abort();
this.pendingMemoryPrefetch = undefined;
```

Locais: `resetChat()`, retorno antecipado de `MaxSessionTurns`, retorno antecipado de `boundedTurns=0`, retorno antecipado de `SessionTokenLimitExceeded`, retorno antecipado do sinal de controle da Arena. O próprio caminho de disparo também realiza esse abortar-e-substituir quando uma nova UserQuery chega enquanto a pré-busca anterior ainda está em andamento.

**2 locais apenas de limpeza** (a pré-busca já foi concluída e a estamos consumindo — nenhum controlador para abortar, apenas descarte a referência):

```typescript
prefetchHandle.consumed = true;
this.pendingMemoryPrefetch = undefined;
```

Locais: ponto de consumo de UserQuery, ponto de injeção de ToolResult.

### 6. `relevanceSelector.ts` — remova `AbortSignal.timeout(1_000)`

Remova a combinação `AbortSignal.any([AbortSignal.timeout(1_000), callerAbortSignal])` e passe `callerAbortSignal` diretamente.

---

## Comparação de comportamento

| Cenário                                     | Antes                              | Depois                                                  |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| recall completa antes da preparação do modelo | injetar em UserQuery, ~0 espera    | injetar em UserQuery, ~0 espera                          |
| recall lento (cold start)                    | bloquear por até 2.5 s             | pular UserQuery, injetar no primeiro ToolResult          |
| recall atinge timeout (1 s)                  | abortar, resultado vazio, sem memória | sem timeout rígido; injetar quando concluído             |
| sem chamadas de ferramenta, recall lento     | bloquear por até 2.5 s, depois pular | pular UserQuery, sem oportunidade de ToolResult — perder |
| usuário envia 2ª mensagem antes do recall concluir | 2º recall compete com o 1º handle | 1º handle abortado quando 2ª UserQuery dispara novo handle |

---

## Fora do escopo

- Alterar o formato de injeção de memória de `system-reminder` para anexo `tool-result` (estilo CC)
- Portão de salto de orçamento de bytes por sessão
- Portão de salto de prompt de palavra única
