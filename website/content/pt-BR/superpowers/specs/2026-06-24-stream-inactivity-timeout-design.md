# Design: timeout de inatividade de streaming para o pipeline compatível com OpenAI

- **Data:** 2026-06-24
- **Componente:** `packages/core` — `openaiContentGenerator/pipeline.ts`
- **Status:** Design aprovado (auditado em 7 rodadas), pronto para TDD
- **Escopo:** apenas medidas #1 + #2 (watchdog + abort + ETIMEDOUT sintético). Fora
  do escopo: evento SSE terminal para a UI (#9), caminho não-streaming.

## Problema

Um incidente no DataAgent ("一直运行不返回") teve causa raiz no gateway de modelo
(Aliyun PrivateLink → DashScope/Bailian `compatible-mode`, qwen3.7-max) aceitando
uma requisição (HTTP 200) mas **streamando nada** — o corpo SSE permaneceu aberto
e silencioso por ~595s sem `finish_reason`.

O qwen-code não tinha recuperação efetiva:

- O `timeout` do cliente OpenAI (`DEFAULT_TIMEOUT = 120_000`) é **em nível de requisição**
  (conectar + obter o objeto de resposta). Uma vez
  que `chat.completions.create({stream:true})` retorna o stream após um 200 rápido,
  a inatividade entre chunks durante `for await` é **ilimitada**.
- O único timer de inatividade (`STREAM_IDLE_TIMEOUT_MS = 5min` em
  `loggingContentGenerator.ts`) é **apenas de telemetria** — ele fecha o span do OTel
  para não vazar, mas **não** aborta a requisição nem lança exceção.

Portanto, um stream 200-mas-silencioso fica pendurado até a conexão morrer ou o TTL
de interação de 30 minutos, e o loop de retry de conteúdo (`NO_FINISH_REASON`) nunca
é acionado porque o stream nunca completa.

## Insight chave

A camada de transporte _deveria_ ter produzido um `ETIMEDOUT` em um socket ocioso,
mas não produziu (o socket permaneceu aberto sem dados). A correção é **adicionar o
timeout de inatividade que o transporte não possui, e sintetizar o `ETIMEDOUT` que
ele deixou de emitir** — tornando uma parada silenciosa indistinguível de um timeout
real de leitura, que a pilha existente de retry/backoff/fallback já trata.

## Mecânicas verificadas (auditoria)

1. `pipeline.executeStream` cria `perRequestAc = createChildAbortController(parentSignal)`
   e passa `perRequestAc.signal` para o SDK. Este é o controller que
   efetivamente cancela o fetch. O wrapper de logging uma camada acima tem apenas o
   signal somente-leitura — então o watchdog deve viver no **pipeline**.
2. `classifyRetryError` verifica `isRetryAbortError` (isAbortError ||
   name==='CanceledError') **primeiro** → qualquer abort = `{kind:'abort',
diagnosis:'fail-fast'}` = **não retentável**. Portanto, o watchdog NÃO deve expor um
   AbortError bruto.
3. `getTransportCode(err)` lê `err.code` / `err.cause.code`; um simples
   `Object.assign(new Error(...), {code:'ETIMEDOUT'})` →
   `{kind:'transport', diagnosis:'retryable', transportCode:'ETIMEDOUT'}`.
4. O stream-transport-retry do geminiChat é acionado quando
   `classification.kind==='transport' && transportCode ∈ {ECONNRESET, ETIMEDOUT}
&& !streamYieldedChunk` (`TRANSPORT_STREAM_RETRY_CONFIG.maxRetries = 2`). Portanto, um
   timeout de **primeiro byte / zero chunks** (exatamente o incidente) faz auto-retry;
   uma parada **após** chunks aparece como erro de transporte (sem retry — aceitável).

## Decisões (fixadas)

| Decisão                          | Escolha                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| Valor do timeout e configuração  | Novo `contentGenerator.streamIdleTimeoutMs`, padrão **120000ms**  |
| Ao timeout                       | **Abort + ETIMEDOUT sintético** (reutiliza transport-retry)       |
| Escopo do PR                     | **Apenas #1 + #2** (evento SSE terminal é um PR separado)         |
| Timer de inatividade de 5 min    | **Manter como backstop** (inalterado)                             |

## Design

Todas as alterações em `packages/core/src/core/openaiContentGenerator/`.

### 1. Config

Adicionar `streamIdleTimeoutMs?: number` a `ContentGeneratorConfig`
(`contentGenerator.ts`). O pipeline resolve como
`this.contentGeneratorConfig.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS`
(`120_000`). Um valor `<= 0` desabilita o watchdog (passthrough).

### 2. Gerador de timeout de inatividade (`pipeline.ts`)

Um gerador assíncrono privado envolve o **stream bruto de chunks do SDK** antes
de `processStreamWithLogging`:

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

O timer **reinicia a cada chunk bruto** (incluindo deltas de pensamento/raciocínio),
portanto um modelo que pensa longamente e streameia raciocínio nunca é abortado
indevidamente; apenas silêncio real (nenhum chunk por `idleMs`) o dispara.

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

### 3. Conexão em `executeStream`

Após o Stage 1 criar `stream`, envolvê-lo antes do Stage 2. Requisições de streaming
sempre usam um controller por requisição para que o watchdog possa abortar a requisição
do SDK mesmo quando o chamador não forneceu um signal pai:

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

- 200-mas-silencioso (zero chunks) → após `idleMs`: abort fetch + lança ETIMEDOUT →
  `{transport, retryable}` → transport-retry (×2, `!streamYieldedChunk`) →
  auto-recupera; na exaustão aparece como erro de transporte.
- Parada após alguns chunks → ETIMEDOUT lançado; `streamYieldedChunk` é true, portanto
  **não** é retentado via transport — aparece como erro (sem replay arriscado
  no meio da geração).
- Stream ativo (incluindo pensamento) → timer reinicia a cada chunk; nunca dispara.
- Abort do pai/usuário → AbortError propagado sem alteração (cancelamento rápido
  do usuário).
- O timer de telemetria de 5 min se torna um backstop que o watchdog de ~120s
  antecipa; permanece inalterado.

## Fora do escopo

- Evento SSE terminal `turn_error` na exaustão de retries (#9) — PR separado.
- `execute()` não-streaming — já limitado pelo timeout de nível de requisição
  de 120s.

## Testes (TDD)

Em `pipeline.test.ts`, usando `vi.useFakeTimers()` e um mock de stream controlável
(renderiza N chunks e então `next()` retorna uma promise que nunca resolve):

1. **Parada com zero chunks** → consumir o stream rejeita com um erro cujo
   `code === 'ETIMEDOUT'` após avançar `idleMs`.
2. **Parada após chunks** → os chunks entregues passam, então rejeita com
   `code === 'ETIMEDOUT'`.
3. **Stream ativo reinicia o timer** → chunks chegando dentro de `idleMs` nunca
   disparam o watchdog; o stream completa normalmente.
4. **Precedência de abort do pai** → com o signal pai abortado no timeout,
   o erro é um AbortError, não ETIMEDOUT.
5. **Desabilitado quando `streamIdleTimeoutMs <= 0`** → um stream pendurado não
   lança exceção no avanço do timer (passthrough).
6. **`streamIdleTimeoutMs` customizado** → o valor configurado é respeitado
   (dispara nos ms configurados, não no padrão).
7. **Rejeição órfã do `next()` do SDK** → após o watchdog abortar a requisição,
   uma rejeição posterior do SDK `AbortError` vinda do `next()` pendente é
   engolida e não emite `unhandledRejection`.