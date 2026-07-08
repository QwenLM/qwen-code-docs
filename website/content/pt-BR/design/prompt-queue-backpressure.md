# Backpressure da Fila de Prompts

## Resumo

O `qwen serve` agora aplica backpressure de admissão de prompts por sessão. O limite padrão é de `5` prompts pendentes por sessão. Um prompt pendente é aquele que o daemon aceitou através do `sendPrompt` e que ainda não foi resolvido, incluindo prompts aguardando na FIFO por sessão e o prompt atualmente em execução.

O `branchSession` continua serializado atrás da mesma FIFO por sessão, mas não é um prompt e não consome esse limite de prompts.

## Semântica

- Padrão: `maxPendingPromptsPerSession = 5`.
- Desativado: `0` ou `Infinity` significa ilimitado.
- Inválido: números negativos, frações e `NaN` são rejeitados pela construção da bridge e pelo `runQwenServe`. A flag da CLI aceita inteiros não negativos; `0` desativa o limite.
- Autoridade: a bridge é o portão de admissão. A contabilidade no lado do SDK é uma proteção de falha antecipada, não um substituto para a aplicação no servidor.
- Prazo do prompt: `--prompt-deadline-ms` ainda se aplica apenas a prompts que já foram aceitos. Não é um limite de admissão na fila.

## Comportamento da Bridge

O `SessionEntry` rastreia o `pendingPromptCount`. O `sendPrompt` intencionalmente não é `async`, para que a verificação de admissão possa lançar uma exceção de forma síncrona antes que as rotas HTTP retornem `202 Accepted`.

Fluxo de admissão:

1. Buscar a sessão.
2. Rejeitar sinais pré-abortados antes de incrementar o contador.
3. Se `pendingPromptCount >= maxPendingPromptsPerSession`, lançar `PromptQueueFullError`.
4. Incrementar o contador e enfileirar o prompt na FIFO.
5. Liberar o slot exatamente uma vez quando a promise do prompt visível para o chamador for resolvida.

Falhas não envenenam a FIFO porque a cauda da fila ainda consome cada resultado de prompt. O chamador original ainda recebe a rejeição do prompt.

## Comportamento HTTP

O `POST /session/:id/prompt` captura o `PromptQueueFullError` síncrono antes de emitir uma resposta de aceitação. A rota retorna:

- Status: `503`
- Header: `Retry-After: 5`
- Body: `{ code: 'prompt_queue_full', error, sessionId, limit, pendingCount }`

Nenhum `promptId` é retornado quando a admissão falha.

O `/capabilities` anuncia:

```json
{
  "limits": {
    "maxPendingPromptsPerSession": 5
  }
}
```

Quando o limite é desativado, o valor anunciado é `null`.

## Comportamento HTTP do ACP

O transporte ACP JSON-RPC mapeia o `PromptQueueFullError` para um formato de erro estável, em vez de propagar para um erro interno não estruturado:

```json
{
  "data": {
    "errorKind": "prompt_queue_full",
    "sessionId": "...",
    "limit": 5,
    "pendingCount": 5
  }
}
```

## Comportamento do SDK

O `DaemonClient` tem uma reserva local por sessão para chamadas de `prompt()`. Ele reserva antes de enviar a requisição HTTP e libera em:

- conclusão bloqueante legada `200`,
- conclusão de turno não bloqueante `202`,
- `turn_error`,
- abortamento pelo chamador,
- fim do SSE,
- falha no fetch ou no parsing da resposta.

`DaemonPendingPromptLimitError` significa que o SDK rejeitou localmente e não enviou a requisição do prompt.

A opção do SDK aceita o valor numérico da capability diretamente; `null` desativa o limite local para corresponder a `/capabilities.limits.maxPendingPromptsPerSession`.

O `DaemonSessionClient` aplica o mesmo limite local para o caminho de assinatura de longa duração. Os métodos estáticos `createOrAttach`, `load` e `resume` mantêm suas posições de parâmetros existentes; a construção direta pode sobrescrever o limite local.