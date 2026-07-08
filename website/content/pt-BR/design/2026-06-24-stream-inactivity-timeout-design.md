# Design: timeout de inatividade de streaming para o pipeline compatível com OpenAI

- **Data:** 2026-06-24
- **Componente:** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **Status:** Design aprovado (auditado em 7 rodadas), pronto para TDD
- **Escopo:** apenas as medidas #1 + #2 (watchdog + abort + ETIMEDOUT sintético). Fora
  do escopo: evento SSE terminal para a UI (#9), caminho não-streaming.

## Problema

Um incidente no DataAgent ("executando continuamente sem retornar") teve como causa raiz o gateway do modelo
(Aliyun PrivateLink → DashScope/Bailian `compatible-mode`, qwen3.7-max) aceitar
uma requisição (HTTP 200) mas então **não fazer streaming de nada** — o corpo SSE permaneceu aberto
e silencioso por ~595s sem `finish_reason`.

O qwen-code não tinha uma recuperação efetiva:

- O `timeout` do cliente OpenAI (`DEFAULT_TIMEOUT = 120_000`) é **nível de requisição**
  (conexão + obtenção do objeto de resposta). Uma vez que
  `chat.completions.create({stream:true})` retorna o stream após um 200 rápido,
  a inatividade entre chunks durante o `for await` é **ilimitada**.
- O único timer de inatividade (`STREAM_IDLE_TIMEOUT_MS = 5min` em
  `loggingContentGenerator.ts`) é **apenas para telemetria** — ele fecha o span do OTel
  para não vazar, mas **não** aborta a requisição nem lança exceção.

Assim, um stream 200-e-depois-silencioso fica travado até que a conexão morra ou o TTL
de interação de 30 minutos expire, e o loop de retry de conteúdo (`NO_FINISH_REASON`) nunca é acionado
porque o stream nunca é concluído.

## Insight principal

A camada de transporte _deveria_ ter gerado um `ETIMEDOUT` em um socket ocioso, mas
não o fez (o socket permaneceu aberto sem dados). A correção é **adicionar o timeout de inatividade que falta ao transporte e sintetizar o `ETIMEDOUT` que ele falhou em emitir** — tornando um travamento silencioso indistinguível de um timeout de leitura real, que a pilha existente de retry/backoff/fallback já lida.

## Mecânica verificada (auditoria)

1. `pipeline.executeStream` cria `perRequestAc = createChildAbortController(parentSignal)`
   e passa `perRequestAc.signal` para o SDK. Este é o controlador que
   realmente cancela o fetch. O wrapper de logging uma camada acima tem apenas o signal read-only — portanto, o watchdog deve viver no **pipeline**.
2. `classifyRetryError` verifica `isRetryAbortError` (`isAbortError ||`
   `name==='CanceledError'`) **primeiro** → qualquer abort = `{kind:'abort',`
   `diagnosis:'fail-fast'}` = **não é retryable**. Portanto, o watchdog NÃO DEVE expor um
   `AbortError` bruto.
3. `getTransportCode(err)` lê `err.code` / `err.cause.code`; um simples
   `Object.assign(new Error(...), {code:'ETIMEDOUT'})` resulta em
   `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`.
4. O `stream-transport-retry` do `geminiChat` é disparado quando
   `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT}`
   `&& !streamYieldedChunk` (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`). Assim, um
   timeout de primeiro byte / zero chunks (exatamente o incidente) faz auto-retry; um travamento
   **após** chunks surge como um erro de transporte (sem retry — aceitável).

## Decisões (bloqueadas)

| Decisão | Escolha |
| -------------------------- | ---------------------------------------------------------------- |
| Valor e config do timeout | Novo `contentGenerator.streamIdleTimeoutMs`, padrão **120000ms** |
| No timeout | **Abort + ETIMEDOUT sintético** (reutiliza transport-retry) |
| Escopo do PR | **Apenas #1 + #2** (evento SSE terminal é um PR separado) |
| Timer de inatividade de telemetria de 5 min | **Manter como backstop** (intocado) |

## Design

Todas as alterações em `packages/core/src/core/openaiContentGenerator/`.

### 1. Config

Adicione `streamIdleTimeoutMs?: number` ao `ContentGeneratorConfig`
(`contentGenerator.ts`). O pipeline resolve isso como
`this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS`
(`120_000`). Um valor `<= 0` desativa o watchdog (passthrough).

### 2. Gerador de timeout de inatividade (`pipeline.ts`)

Um gerador assíncrono privado envolve o **stream de chunks bruto do SDK** antes
do `processStreamWithLogging`:

```ts
async function* withStreamInactivityTimeout(
  source: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
  idleMs: number,
  abortRequest: () => void, // aborts perRequestAc → frees the socket
  parentSignal: AbortSignal | undefined,
): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk> {
  const it = source[Symbol.asyncIterator]();
  const streamStartedAt = Date.now();
  let chunksReceived = 0;
  try {
    while (true) {
      const nextPromise = it.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // User cancel takes precedence over our timeout relabel.
          // Use a plain Error (NOT DOMException): error redaction clones via
          // Object.create(getPrototypeOf(err)), which corrupts a DOMException
          // (its `name` is an internal-slot getter the clone lacks). `name ===
          // 'AbortError'` satisfies isAbortError.
          if (parentSignal?.aborted) {
            const abortErr = new Error('Aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          } else {
            abortRequest(); // abort perRequestAc → fetch tears down
            reject(
              new StreamInactivityTimeoutError(
                idleMs,
                chunksReceived,
                Date.now() - streamStartedAt,
              ),
            ); // code: 'ETIMEDOUT'
          }
        }, idleMs);
        timer.unref?.();
      });
      let result: IteratorResult<OpenAI.Chat.ChatCompletionChunk>;
      try {
        result = await Promise.race([nextPromise, timeout]);
      } catch (err) {
        // After we abort, the orphaned nextPromise rejects with AbortError;
        // swallow it so it is not an unhandled rejection.
        void Promise.resolve(nextPromise).catch(() => {});
        throw err;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) return;
      chunksReceived += 1;
      yield result.value; // a chunk arrived → next loop starts a fresh timer
    }
  } finally {
    abortRequest();
    try {
      await it.return?.();
    } catch {
      // The abort above is the cleanup that matters; ignore return failures.
    }
  }
}
```

O timer **é resetado a cada chunk bruto** (incluindo deltas de thinking/reasoning), então
um modelo de pensamento longo que faz streaming de raciocínio nunca é abortado incorretamente; apenas o silêncio real (nenhum chunk por `idleMs`) o dispara.

```ts
class StreamInactivityTimeoutError extends Error {
  readonly code = 'ETIMEDOUT' as const;

  constructor(
    readonly idleMs: number,
    readonly chunksReceived: number,
    readonly streamLifetimeMs: number,
  ) {
    super(`No stream activity for ${idleMs}ms (inactivity timeout)`);
    this.name = 'StreamInactivityTimeoutError';
  }
}
```

### 3. Integração no `executeStream`

Após o Estágio 1 criar o `stream`, envolva-o antes do Estágio 2. Requisições de streaming
sempre usam um controlador por requisição para que o watchdog possa abortar a requisição do SDK
mesmo quando o chamador não forneceu um signal pai:

```ts
const idleMs =
  this.contentGeneratorConfig.streamIdleTimeoutMs ??
  DEFAULT_STREAM_IDLE_TIMEOUT_MS;
const guarded =
  idleMs > 0
    ? withStreamInactivityTimeout(
        stream,
        idleMs,
        () => perRequestAc.abort(),
        parentSignal,
      )
    : stream;
// ...processStreamWithLogging(guarded, context, request) as today,
// keeping the existing drainThenCleanup wrapper.
```

## Comportamento após a alteração

- 200-e-depois-silencioso (zero chunks) → após `idleMs`: aborta o fetch + lança `ETIMEDOUT` →
  `{transport, retryable}` → transport-retry (×2, `!streamYieldedChunk`) →
  auto-recuperação; na exaustão, surge como um erro de transporte.
- Travamento após alguns chunks → `ETIMEDOUT` lançado; `streamYieldedChunk` é true, então
  **não** é transport-retried — surge como um erro (sem replay arriscado no meio da geração).
- Stream ativo (incl. thinking) → o timer é resetado a cada chunk; nunca é disparado.
- Abort pai/usuário → `AbortError` propagado inalterado (cancelamento fail-fast do usuário).
- O timer de inatividade de telemetria de 5 min torna-se um backstop que o watchdog de ~120s
  preempta; deixado intocado.

## Fora do escopo

- `turn_error` SSE terminal na exaustão do retry (#9) — PR separado.
- `execute()` não-streaming — já limitado pelo timeout de 120s no nível da requisição.

## Testes (TDD)

Em `pipeline.test.ts`, com `vi.useFakeTimers()` e um stream mock controlável
(retorna N chunks e então `next()` retorna uma promise que nunca resolve):

1. **Travamento de zero chunks** → consumir o stream rejeita com um erro cujo
   `code === 'ETIMEDOUT'` após avançar `idleMs`.
2. **Travamento após chunks** → os chunks retornados passam, então rejeita com
   `code === 'ETIMEDOUT'`.
3. **Stream ativo reseta o timer** → chunks que chegam dentro de `idleMs` nunca
   disparam o watchdog; o stream é concluído normalmente.
4. **Precedência de abort pai** → com o signal pai abortado no timeout, o
   erro é um `AbortError`, não `ETIMEDOUT`.
5. **Desativado quando `streamIdleTimeoutMs <= 0`** → um stream travado não lança exceção
   no avanço do timer (passthrough).
6. **`streamIdleTimeoutMs` customizado** → o valor configurado é respeitado (dispara no
   ms configurado, não no padrão).
7. **Rejeição órfã de `next()` do SDK** → após o watchdog abortar a requisição,
   uma rejeição posterior de `AbortError` do SDK do `next()` pendente é suprimida e
   não emite `unhandledRejection`.