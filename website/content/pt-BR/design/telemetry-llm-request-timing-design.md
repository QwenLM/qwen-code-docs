# Design de Decomposição de Temporização de Solicitação LLM (P3 Fase 4)

> Issue #3731 — Fase 4 do rastreamento hierárquico de sessões. Adiciona tempo-para-o-primeiro-token, duração de configuração da solicitação, duração de amostragem e telemetria de tentativas de repetição por tentativa ao span `qwen-code.llm_request` para que operadores possam responder "por que essa chamada LLM foi lenta?" sem precisar adivinhar.
>
> Baseia-se na Fase 1 (#4126), Fase 1.5 (#4302), Fase 2 (#4321). Independente da Fase 3 (#4410, em revisão) — recomenda-se que a Fase 3 seja implementada primeiro para que os campos por tentativa da Fase 4 sejam agregados de forma limpa sob as subárvores do subagente.

## Problema

Atualmente, os spans `qwen-code.llm_request` carregam apenas `model`, `prompt_id`, `input_tokens`, `output_tokens`, `success`, `error`, `duration_ms`. Operadores lendo um único trace não conseguem determinar:

1. **Quanto do `duration_ms` foi o modelo pensando versus a configuração de rede.** Um `duration_ms` de 12 segundos poderia ser 11s de tentativas seguidas por 1s de geração rápida, ou 100ms de configuração seguidos por 12s de streaming lento — o trace não informa.
2. **Quando o usuário viu o primeiro token.** TTFT (tempo-para-o-primeiro-token) é o SLO de latência padrão para interfaces de chat. Não podemos calculá-lo; não o capturamos.
3. **O que aconteceu durante as tentativas de repetição.** `retryWithBackoff` (`utils/retry.ts:285`) apenas chama `debugLogger.warn` — nenhum evento OTel, nenhum atributo de span. Os 4 locais de chamada LLM que passam por ele (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) têm zero visibilidade de repetição em traces ou métricas. `ContentRetryEvent` existe para tentativas de recuperação de conteúdo dentro de `geminiChat.ts:806,830`, mas não para as tentativas mais comuns de limite de taxa / 5xx.
4. **Que `api.request.breakdown` é código morto.** A métrica é definida em `metrics.ts:242-251` com 4 valores `ApiRequestPhase`, exportada de `index.ts:117`, testada em `metrics.test.ts:646-675` — mas `recordApiRequestBreakdown()` tem zero chamadores no código de produção. A infraestrutura de métricas está implementada; o fluxo de dados nunca foi conectado.

Essas lacunas tornam `qwen-code.llm_request` o span menos informativo na árvore de trace. Os spans de ferramenta (#4126/#4321) e os spans de subagente (#4410) ambos expõem fases do ciclo de vida; os spans LLM colapsam a solicitação inteira em uma única duração opaca.

## Superfície existente (sem alteração)

| Componente                                                    | Localização                                                         | Por que não mexemos nisso                                                                                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ciclo de vida do span de solicitação LLM                                   | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | A Fase 1 (#4126) estabeleceu os auxiliares. Estendemos a interface de metadados, não reestruturamos                                                                                                                |
| Propagação de span ativo para geradores de provedor             | `loggingContentGenerator.ts:213,287`                             | A Fase 1 (#4126) substituiu `withSpan('api.*')` por auxiliares nativos; o contexto ativo já alcança o wrapper de stream                                                                                     |
| Esquema `ContentRetryEvent` + consumidores                       | `types.ts:626`, `qwen-logger.ts:947`, `loggers.ts:717`           | O evento existente mantém sua forma e downstreams; adicionamos uma classe de evento irmã para o caminho `retryWithBackoff`                                                                                                |
| Spans de ponte de log do `LogToSpanProcessor`                        | `log-to-span-processor.ts`                                       | A ponte existente do ContentRetryEvent continua a aninhar sob o span LLM ativo. A Fase 4 não altera isso                                                                                               |
| Enum `ApiRequestPhase`                                       | `metrics.ts:330-334`                                             | Superfície pública (4 valores). Preenchemos 3 dos 4 a partir do código de produção; deixamos o enum inalterado para compatibilidade retroativa                                                                                 |
| Normalização de chunk por provedor → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                             | Cada provedor já normaliza para a forma `GenerateContentResponse` do Google antes que o LoggingContentGenerator veja o stream. A detecção de TTFT é executada centralmente sobre essa forma normalizada; nenhum código por provedor |
| Tentativa de repetição de propósito geral `retryWithBackoff`                     | `utils/retry.ts:140`                                             | Usado tanto por chamadores LLM quanto não LLM (`channels/weixin/src/api.ts`). Estendemos com um callback `onRetry` opcional, em vez de acoplamento rígido à telemetria LLM                                                 |
| `generateContent` não streaming                              | `loggingContentGenerator.ts:212`                                 | TTFT não é significativo para não streaming; os novos campos permanecem `undefined`. Ciclo de vida do span e atributos existentes inalterados                                                                                      |
## Fora do escopo (adiado)

- **Retentativas em nível de SDK** (`maxRetries=3` do SDK openai, retentativas internas do SDK google-genai). Essas ocorrem totalmente dentro do SDK de terceiros; observá-las requer desabilitar as retentativas do SDK e reimplementá-las em `retryWithBackoff`. Decisão separada, não é Fase 4.
- **Métricas de streaming por token** (latência entre tokens, tamanho por chunk). Útil para depuração de desempenho do motor de inferência, não para as questões de latência percebida pelo usuário que a Fase 4 tem como alvo.
- **TTFT separado para blocos de raciocínio/thinking.** "Primeiro token" inclui conteúdo de thinking (veja D1). Uma melhoria futura poderia dividir `ttft_to_reasoning_ms` vs `ttft_to_answer_ms`, mas apenas depois de sabermos que há demanda.
- **Fase de amostragem como um span filho dedicado.** Calculável a partir de `duration_ms - ttft_ms - request_setup_ms`; um span filho não acrescenta nada para backends apenas OTel (claude-code usa um apenas para Perfetto). Armazenado como um atributo de span — veja D6.
- **Limitação de taxa em nível de evento no modo de retentativa persistente (`QWEN_CODE_UNATTENDED_RETRY`).** Uma única requisição LLM pode produzir 50+ registros de `ContentRetryEvent` / `ApiRetryEvent` sob retentativa persistente. Limitar a emissão é um acompanhamento — a Fase 4 emite todos os eventos; se os volumes de produção se mostrarem insuportáveis, adicione um limite de emissão por span com um evento de resumo "+N mais tentativas (truncado)" em um PR futuro.
- **Fase de detalhamento `TOKEN_PROCESSING`.** O valor da enum existe, mas o qwen-code não tem nenhum processamento local pós-stream significativo para medir (<10ms típico). Ignorado em chamadores de produção; o valor da enum é mantido para uso futuro ou para chamadores que não controlamos.
- **Migração de `ContentRetryEvent` para o span LLM como eventos de span.** Mesmo raciocínio do LogRecord `subagent_execution` da Fase 3: consumidores existentes (qwen-logger RUM, métricas futuras) estão fortemente acoplados ao LogRecord. A cobertura por bridge-span é suficientemente boa.

## Referências (evidências de decisão)

| Fonte                                                                                                                      | Principal conclusão                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                  | TTFT capturado como `Date.now() - start` no evento SSE `message_start`; `start` redefinido por tentativa de retentativa. `requestSetupMs = start - startIncludingRetries`. Array `attemptStartTimes` preservado por tentativa. Confirma viabilidade da abordagem; a semântica de TTFT deles é "primeiro evento de stream" (divergimos para "primeiro conteúdo" — veja D1) |
| claude-code `perfettoTracing.ts:549-671`                                                                                    | Renderiza Request Setup → Attempt N (retry) → First Token → Sampling como pares B/E aninhados. Demonstra a decomposição visual; o qwen-code faz a mesma decomposição com atributos OTel já que não temos Perfetto                                                                                                                |
| claude-code `sessionTracing.ts:447`                                                                                         | Apenas `ttft_ms` vai para o span OTel (não `requestSetupMs`, não `samplingMs`, nem temporização por tentativa). Colocamos deliberadamente mais no span — o claude-code tem Perfetto para visualização; nós não                                                                                                                                 |
| opencode (sst/opencode) `session/llm.ts`, `route/client.ts`                                                                 | Nenhuma medição de TTFT. Um único span LLM.run do Effect cobre tudo. Valida que a lacuna existe em ferramentas concorrentes; não é uma referência para o que fazer                                                                                                                                                                          |
| [Convenções Semânticas GenAI do OTel](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (status: Desenvolvimento / Experimental) | `gen_ai.usage.input_tokens` (Estável), `gen_ai.usage.output_tokens` (Estável), `gen_ai.usage.cached_tokens` (Experimental), `gen_ai.request.model` (Estável), `gen_ai.server.time_to_first_token` (Experimental, segundos como double). Padrão de emissão dupla segue o precedente #4410                                                        |
| [Especificação de Trace OTel — Eventos de Span](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)                             | "Eventos NÃO DEVEM ser usados para registrar informações que são melhor capturadas como Atributos de Span." Confirma que informações por tentativa pertencem aos atributos do span LLM + spans de bridge de log, não como Eventos de Span no pai                                                                                                                     |
| Documento de design da Fase 3 (`telemetry-subagent-spans-design.md`)                                                                   | Estabeleceu o padrão de emissão dupla (`qwen-code.subagent.id` + `gen_ai.agent.id`) e a regra de "nome privado é autoritativo". A Fase 4 segue a mesma convenção para TTFT e campos de token                                                                                                                                        |
## Design — sete decisões, cada uma justificada

### D1 — Semântica do TTFT: "primeiro bloco contendo conteúdo visível ao usuário"

TTFT mede o tempo de parede desde o **envio da tentativa bem-sucedida** até o **primeiro bloco do stream que contém saída visível ao usuário**. Um bloco é "visível ao usuário" se qualquer `Part` normalizada em `candidates[0].content.parts` for uma das seguintes:

- `text` com string não vazia
- `functionCall` (uso de ferramenta)
- `inlineData` (imagem, binário)
- `executableCode`
- `thought` / conteúdo de raciocínio (qualquer coisa que o provedor exponha — `thought` do Gemini, bloco `<thinking>` da Anthropic, chunk de raciocínio do OpenAI o1)

Blocos contendo apenas metadados `role` ou apenas `usageMetadata` (bloco final de sumário de uso) não disparam o TTFT.

**Por que não "primeiro evento de stream de qualquer tipo" (escolha do claude-code)**: claude-code mede TTFT no `message_start`, um evento de metadados específico da Anthropic que é disparado 50–300ms antes de qualquer conteúdo real. O `headlessProfiler.ts` interno deles já separa `time_to_first_response_ms` para a semântica "o usuário viu algo", reconhecendo a distinção. O qwen-code atende múltiplos provedores (Anthropic, OpenAI, Gemini, Qwen) — escolher a semântica de evento de metadados significa que o TTFT para Anthropic é fundamentalmente diferente do TTFT para OpenAI (que não tem um primeiro evento análogo apenas de metadados). A semântica de conteúdo visível ao usuário é uniforme entre todos os 4 provedores e corresponde literalmente a "time-to-first-token".

**Por que incluir `thought` / raciocínio**: da perspectiva do operador, chunks de raciocínio ainda são "saída produzida pelo modelo". Excluí-los subestimaria o TTFT para modelos pesados em raciocínio (o1, variantes de pensamento do Qwen). Uma divisão futura em `ttft_to_reasoning_ms` vs `ttft_to_answer_ms` é possível; não é Fase 4.

**Por que incluir chunks de apenas chamada de ferramenta**: chamadas LLM para decisão de ferramenta em agentes (um `tool_use`, sem texto) são comuns no fluxo de trabalho do qwen-code. Excluí-los torna o TTFT indefinido para essas requisições. A `Part` `functionCall` é uma saída significativa.

**Nota de comparação entre produtos**: o documento de design afirma explicitamente que `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`. Operadores comparando entre produtos devem alinhar-se à semântica de conteúdo visível ao usuário.

### D2 — Local de medição do TTFT: variáveis locais ao método em `LoggingContentGenerator.generateContentStream`

A detecção do primeiro bloco ocorre dentro do wrapper de stream existente em `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`). Variáveis por chamada (`start`, `ttftMs`) vivem no closure do método; **nunca como campos de instância**.

**Por que nunca campos de instância**: `LoggingContentGenerator` é instanciado **uma vez por `ContentGenerator`** (`contentGenerator.ts:377`) e compartilhado entre todas as chamadas concorrentes de `generateContentStream` — fan-out de subagentes, consultas de warmup, consultas secundárias de `geminiChat`. Um campo de instância seria sobrescrito entre chamadas concorrentes, produzindo TTFT sem sentido para uma a cada duas requisições intercaladas.

**Por que não AsyncLocalStorage**: ALS funcionaria, mas adiciona uma camada de gerenciamento de contexto para um estado que não precisa escapar do método. Local ao método é mais simples, zero overhead, zero risco de vazamento.

```ts
// loggingContentGenerator.ts — inside generateContentStream
const attemptStart = Date.now(); // per-call local
const requestEntryTime = Date.now(); // also per-call local — see D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// stream wrapper inspects each chunk; first one matching hasUserVisibleContent:
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` é um pequeno helper autônomo colocado junto com o wrapper, exportado para testes:

```ts
function hasUserVisibleContent(chunk: GenerateContentResponse): boolean {
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts?.length) return false;
  return parts.some(
    (p) =>
      (typeof p.text === 'string' && p.text.length > 0) ||
      p.functionCall !== undefined ||
      p.inlineData !== undefined ||
      p.executableCode !== undefined ||
      // @ts-expect-error — `thought` is not on all SDK versions but providers emit it
      p.thought !== undefined,
  );
}
```

### D3 — Cálculo de `request_setup_ms`: tempo de entrada vs início da tentativa bem-sucedida

`request_setup_ms` mede o tempo de parede desde a entrada em `generateContentStream`/`generateContent` até o **início da tentativa bem-sucedida** — incluindo todas as retentativas falhas, pausas de backoff e qualquer trabalho de preparação pré-retentativa.

```ts
request_setup_ms = attemptStart_of_successful_attempt - requestEntryTime;
```

Quando `attempt === 1` e nenhuma retentativa ocorreu, `request_setup_ms` é pequeno (apenas setup do SDK). Quando ocorreram retentativas, ele captura toda a sobrecarga do orçamento de retentativas.

**Colocando no span do OTel (divergência do claude-code, que coloca apenas no Perfetto)**: justificativa em três níveis:

1. **Sem Perfetto** — qwen-code não tem camada de visualização fora de banda. Atributos OTel são o único canal.
2. **Depuração com um único trace** — operador vê `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → diagnostica instantaneamente "retentativas consumiram 11.5s, o modelo em si foi rápido". Calcular `request_setup_ms` a partir de outros campos exigiria expor também `sampling_ms`, o que fazemos de qualquer forma (D6).
3. **Custo insignificante** — 1 atributo INT64. Mesma ordem de grandeza que os atributos existentes `input_tokens`, `output_tokens`. O custo de ingestão no backend não é material.
### D4 — Telemetria de repetição: callback `onRetry` em `retryWithBackoff` + `ApiRetryEvent` + propagação AsyncLocalStorage

> **Atualização da Fase 4b (descoberta pós-design)**: esta seção foi originalmente escrita assumindo o padrão "um span de LLM é dono do loop de repetição" do claude-code. Durante a implementação da Fase 4b, descobrimos que os 4 pontos de chamada de `retryWithBackoff` do qwen-code (`client.ts:2109`, `baseLlmClient.ts:235,333`, `geminiChat.ts:2035` — números de linha no momento do merge) todos envolvem `apiCall = () => contentGenerator.generateContent(...)`. A camada de repetição fica **acima** do LoggingContentGenerator. Cada tentativa de repetição invoca `apiCall()` novamente → um novo span `qwen-code.llm_request`. Não há um único span compartilhado entre as tentativas. Um acumulador dentro do `LoggingContentGenerator` não funcionaria.
>
> **Resolução**: propagar o estado de repetição via `AsyncLocalStorage` (`retryContext` em `packages/core/src/utils/retryContext.ts`). `retryWithBackoff` envolve cada `await fn()` em `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)`. `LoggingContentGenerator` lê o ALS em seu prelúdio síncrono e encaminha os valores para `endLLMRequestSpan`. Isso na verdade oferece **observabilidade mais rica** do que o plano original — cada span por tentativa tem seu próprio `duration_ms` / `ttft_ms` / detalhes de erro **e** sabe onde está dentro do orçamento de repetição por meio dos atributos `attempt` / `requestSetupMs` / `retryTotalDelayMs` por tentativa.
>
> A abordagem ALS condiz com padrões existentes no código (`promptIdContext`, `subagentNameContext`, `agent-context`) — superfície nova mínima, semânticas bem compreendidas. O processo de revisão em modo de plano capturou essa revisão em 3 rodadas de revisão encontrando 22 problemas, todos resolvidos antes do merge.

`retryWithBackoff` atualmente chama `logRetryAttempt` (`retry.ts:343`) que só escreve em `debugLogger.warn`. Estendemos a interface `RetryOptions` com um callback opt-in:

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... existing fields ...
  /**
   * Optional. Called once per failed attempt, before the backoff sleep.
   * Receives the attempt number (1-based), the error, and the delay before
   * the next attempt. Use this to emit telemetry events for LLM call sites;
   * leave undefined for non-LLM callers (e.g., channels/weixin) so they
   * stay silent in LLM-specific telemetry channels.
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // 1-based, matches debugLogger output
  error: unknown;
  errorStatus?: number;
  delayMs: number; // backoff delay before next attempt
}
```

Os 4 pontos de chamada de LLM (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) registram um callback que emite um novo `ApiRetryEvent`:

```ts
// types.ts — new event class, sibling to ContentRetryEvent
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // 1-based
  error_type: string;
  error_message: string; // truncated to 256 chars
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms set to retry_delay_ms so LogToSpanProcessor renders
  // a bridge span of meaningful width
  duration_ms: number;
}
```

**Por que uma nova classe de evento, e não estender `ContentRetryEvent`**:

- `ContentRetryEvent` tem 2 consumidores downstream (qwen-logger, exportação de log-record). Alterar sua carga útil corre o risco de quebrá-los.
- O nome "content retry" se refere semanticamente a repetições de recuperação de conteúdo (fluxo inválido, reparo de esquema) — estendê-lo para cobrir repetições por limite de taxa confundiria o esquema.
- Novo evento é aditivo; nenhuma surpresa para o consumidor.

**Por que não embutir o callback DENTRO de `retry.ts`**: `retry.ts` também é chamado por `channels/weixin/src/api.ts` (repetições da API de mensagens da Microsoft). Acoplar rigidamente a telemetria de LLM dentro de retry.ts emitiria `ApiRetryEvent` para repetições que não são de LLM. O callback `onRetry` é opt-in por chamador — chamadores de LLM optam por ele, o chamador weixin não.

**Coexistência com ContentRetryEvent**: ContentRetryEvent permanece como está para repetições de recuperação de conteúdo dentro de `geminiChat.ts:806,830`. ApiRetryEvent cobre as repetições por limite de taxa / 5xx de `retryWithBackoff`. Os dois eventos disparam de camadas diferentes e nunca duplicam. O comportamento existente de ponte de log para ambos os eventos é preservado via `LogToSpanProcessor` — ambos os eventos se aninham automaticamente sob o span LLM ativo (a fiação da Fase 1 garante que o span LLM está ativo durante as repetições).

**Modo de repetição persistente (`QWEN_CODE_UNATTENDED_RETRY`)**: um único loop de requisição 429 pode emitir 50+ eventos. Está fora do escopo limitar a emissão na Fase 4 — se os volumes de produção se mostrarem insuportáveis, adicione um limite por span com evento de resumo em um PR seguinte. Os atributos agregados `attempt` e `retry_total_delay_ms` no span LLM pai (D5) permanecem precisos independentemente do limite de eventos.

### D5 — Agregação do span LLM pai: apenas atributos escalares (sem atributos do tipo mapa)

Atributos de span OTel são escalares (`string | number | boolean | array destes`). Atributos do tipo mapa (como `retry_count_by_status: {429:2, 503:1}`) exigem serialização JSON e são incômodos de consultar. Pule-os.
| Atributo                    | Tipo   | Semântica                                                                                                                               |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                   | int    | Contador monotônico baseado em 1 de `retryContext.attempt` (iteração desta tentativa). Sempre preenchido (padrão 1 quando não há contexto de repetição) |
| `retry_total_delay_ms`      | int    | Atraso de backoff acumulado ANTES desta tentativa começar. Indefinido para chamadas diretas; 0 para tentativa 1; > 0 para tentativas repetidas subsequentes |
| `ttft_ms`                   | int    | TTFT por D1; indefinido para não-streaming ou solicitações abortadas antes do primeiro chunk                                           |
| `request_setup_ms`          | int    | Por D3                                                                                                                                    |
| `sampling_ms`               | int    | Por D6                                                                                                                                    |
| `output_tokens_per_second`  | double | Derivado; `output_tokens / (sampling_ms / 1000)`; indefinido quando `sampling_ms === 0`                                                  |

A distribuição de código de status por tentativa (ex.: "2 das 3 tentativas foram 429") é consultável a partir de spans log-bridge de registros `ApiRetryEvent`. Não é necessário duplicar como um atributo achatado no pai.

**Por que `sampling_ms` e `output_tokens_per_second` no span**: deriváveis, mas complicados de calcular em consultas de backend ao somar muitos spans. Mesmo custo-benefício que `request_setup_ms` (D3).

### D6 — Ativar `recordApiRequestBreakdown()` para 3 de 4 fases

Em `endLLMRequestSpan` (ou no wrapper que a chama), após calcular TTFT/setup/sampling, emita:

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = network + first-token-generation
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**Por que pular `TOKEN_PROCESSING`**: qwen-code processa chunks de stream inline (a consolidação ocorre no wrapper em `loggingContentGenerator.ts:644`); a fase de pós-stream é <10ms e não é arquiteturalmente distinta. Preenchê-la com um valor sem sentido polui o histograma. Deixar o valor do enum não utilizado é seguro — `apiRequestBreakdownHistogram.record(value, {model, phase})` é apenas um histograma com `phase` como rótulo; rótulos ausentes simplesmente não aparecem nas consultas.

**Por que não redefinir `NETWORK_LATENCY`**: o nome da especificação é levemente enganoso (é network + first-token-generation, não latência de rede pura), mas:

- O enum faz parte de `metrics.ts:330-334` que é exportado de `index.ts:117` e testado.
- Os dashboards de backend podem já referenciar esses nomes de fase.
- Renomear ou adicionar uma nova fase quebraria a compatibilidade para uma melhoria de precisão marginal e trivial.

Documente a semântica no design doc; deixe o enum inalterado.

**Por que no caminho do span, não em paralelo**: mantém `recordApiRequestBreakdown` co-localizado com as escritas de atributos do span — ponto de emissão único protegido (veja D7 idempotência), invariante de ordenação único.

### D7 — `endLLMRequestSpan` idempotência: gravação de métrica protegida pela guarda de dupla finalização existente

A fase 1.5 (#4302) estabeleceu que `endLLMRequestSpan` pode ser chamada duas vezes (colisão entre caminho de aborto e caminho de erro). A guarda existente em `session-tracing.ts:~470` (`if (!activeSpans.has(...)) return;`) impede `span.end()` duplo. A gravação de métrica da fase 4 (D6) **deve ficar dentro do mesmo bloco protegido**, antes de `span.end()`:

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // já finalizado — guarda de dupla finalização
activeSpans.delete(spanRef);    // reivindica a finalização

// ... calcular duração, definir atributos ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // NOVO — protegido
  recordTokenUsageMetrics(...); // existente
}

span.end();
```

Isso garante que a métrica seja gravada **exatamente uma vez** por solicitação LLM, correspondendo ao ciclo de vida do span.

**Por que não gravar em `loggingContentGenerator`**: ele não vê o caminho de aborto. Gravar na camada do ciclo de vida do span garante que toda solicitação LLM que abre um span produza exatamente uma amostra de detalhamento, independentemente de sucesso/falha/aborto.

### D8 — Convenções semânticas GenAI (emissão dupla: privado autoritativo)

Cada atributo da fase 4 que corresponde a um atributo semconv OTel GenAI é escrito duas vezes no span:

| Privado do qwen-code (autoritativo)          | GenAI semconv (camada de compatibilidade)                    | Conversão de unidade | Status da especificação |
| ------------------------------------------- | ------------------------------------------------------------ | -------------------- | ----------------------- |
| `ttft_ms` (ms, int)                         | `gen_ai.server.time_to_first_token` (s, double)              | `ttftMs / 1000`      | Experimental            |
| `input_tokens` (int)                        | `gen_ai.usage.input_tokens` (int)                            | idêntico             | Estável                 |
| `output_tokens` (int)                       | `gen_ai.usage.output_tokens` (int)                           | idêntico             | Estável                 |
| `cached_input_tokens` (int) (quando presente) | `gen_ai.usage.cached_tokens` (int)                           | idêntico             | Experimental            |
| `qwen-code.model` (string)                  | `gen_ai.request.model` (string)                              | idêntico             | Estável                 |
**Nomes de atributos de token existentes** no span LLM (definidos em `endLLMRequestSpan` antes da Fase 4): o qwen-code já usa `input_tokens` e `output_tokens` simples. A Fase 4 adiciona os equivalentes `gen_ai.usage.*` para corresponder ao padrão da #4410. Os nomes simples permanecem; **não renomeie**.

Campos sem equivalente no semconv GenAI — `request_setup_ms`, `sampling_ms`, `retry_total_delay_ms`, `attempt`, `output_tokens_per_second` — são emitidos apenas sob o namespace qwen-code.

**Por que "privado autoritativo, semconv como compatibilidade"**:

- Painéis internos, SLOs, saída do debugLogger, RUM do qwen-logger, consultas ARMS — todos referenciam `ttft_ms` etc. Tratá-los como canônicos evita uma migração com flag-day.
- O semconv GenAI Experimental pode renomear `gen_ai.server.time_to_first_token` antes de atingir o status Stable. Quando/se isso acontecer, atualizamos a emissão do semconv; os nomes qwen-code não mudam.
- Backends futuros com conhecimento de especificação (visualizações de IA do Datadog, colmeias de IA da Honeycomb, painéis GenAI do ARMS) capturam automaticamente os atributos `gen_ai.*` sem nossa intervenção.

**Por que emissão dupla com conversão de unidade** (ms ↔ segundos): o semconv GenAI escolheu segundos como double para latência; o qwen-code escolheu ms como int (combina com `duration_ms` já presente no span). Ambas as representações têm valor; a conversão é barata.

## API Auxiliar (aditiva a `session-tracing.ts`)

```ts
// session-tracing.ts — interface LLMRequestMetadata estendida (aditiva)
export interface LLMRequestMetadata {
  // ... campos existentes: inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** Tempo desde o início da tentativa bem-sucedida até o primeiro bloco de conteúdo visível ao usuário (ms). Indefinido para requisições não-streaming ou abortadas antes do primeiro bloco. */
  ttftMs?: number;

  /** Tempo desde a entrada em generateContent até o início da tentativa bem-sucedida (ms). Inclui todas as repetições falhas + backoff. */
  requestSetupMs?: number;

  /** Número da tentativa final (baseado em 1). 1 = sem repetições. */
  attempt?: number;

  /** Soma de todos os atrasos de backoff antes da tentativa bem-sucedida (ms). */
  retryTotalDelayMs?: number;
}

// Nenhum novo helper exportado — Fase 4 reutiliza startLLMRequestSpan / endLLMRequestSpan com metadados estendidos.
```

```ts
// types.ts — nova classe de evento
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY = EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number;
  error_type: string;
  error_message: string;
  status_code?: number;
  retry_delay_ms: number;
  duration_ms: number;  // = retry_delay_ms, impulsiona a largura do span da ponte LogToSpanProcessor

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — extensão de RetryOptions
interface RetryOptions<T> {
  // ... existentes ...
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number;
  error: unknown;
  errorStatus?: number;
  delayMs: number;
}

// Dentro de retryWithBackoff, onde logRetryAttempt é chamado hoje:
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // chamada existente do debugLogger inalterada
```

## Encadeamento do ciclo de vida

### Caminho de streaming (o caso comum)

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // Usa startLLMRequestSpan existente (Fase 1)
  // Passa callback onRetry para qualquer camada de repetição em uso:
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // estamos prestes a iniciar tentativa N+1
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // aproximado; o reset real ocorre no topo da próxima tentativa
    attemptStartTimes.push(attemptStart);
    // emite ApiRetryEvent
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // wrapper de stream detecta o primeiro bloco visível ao usuário:
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

No final do span (já no fluxo `endLLMRequestSpan` da Fase 1), inclua os novos campos em `LLMRequestMetadata`:

```ts
endLLMRequestSpan(llmSpan, {
  success: true,
  inputTokens,
  outputTokens,
  cachedInputTokens,
  ttftMs,
  requestSetupMs: attemptStart - requestEntryTime,
  attempt: finalAttempt,
  retryTotalDelayMs,
});
```
### Caminho não-streaming

`generateContent` (`loggingContentGenerator.ts:212`) não produz chunks de streaming. TTFT é `undefined`; `request_setup_ms` ainda é significativo (captura overhead de retry). A métrica de breakdown registra 2 fases (REQUEST_PREPARATION + RESPONSE_PROCESSING onde `RESPONSE_PROCESSING = duration_ms - request_setup_ms`), não 3.

### Integração da camada de retry (4 locais)

Cada um dos 4 locais de chamada `retryWithBackoff` do LLM adiciona `onRetry`:

```ts
// client.ts:1540 (similar at baseLlmClient.ts:193, 282, geminiChat.ts:1039)
const result = await retryWithBackoff(apiCall, {
  ...existingOptions,
  onRetry: (info) => {
    logApiRetry(
      this.config,
      new ApiRetryEvent({
        model,
        promptId: userPromptId,
        attemptNumber: info.attempt,
        error: info.error,
        statusCode: info.errorStatus,
        retryDelayMs: info.delayMs,
      }),
    );
    // also feed back into LoggingContentGenerator's local retry accumulator
    // (when in scope — for callers that don't go through LoggingContentGenerator,
    // the LLM span still gets `attempt` and `retry_total_delay_ms` via the
    // metadata path because endLLMRequestSpan is called at the LLM layer)
  },
});
```

O chamador não-LLM (`channels/weixin/src/api.ts`) **não registra `onRetry`** — nenhum `ApiRetryEvent` é emitido para seus retries, mantendo o comportamento atual.

## Segurança concorrente — a garantia principal

A instância de `LoggingContentGenerator` é compartilhada (uma por `ContentGenerator`, `contentGenerator.ts:377`). Três chamadas concorrentes a `generateContentStream` (ex.: 3 subagentes executando em paralelo via `coreToolScheduler.runConcurrently`) executam três closures independentes de `generateContentStream`:

```
call_A: attemptStart_A, ttftMs_A, ... (closure)
call_B: attemptStart_B, ttftMs_B, ... (closure)
call_C: attemptStart_C, ttftMs_C, ... (closure)
```

As variáveis locais por chamada nunca se sobrepõem. Os chunks de streaming são detectados em relação ao `attemptStart` local de cada chamada. Os atributos do span são definidos no próprio `endLLMRequestSpan` de cada chamada.

`AsyncLocalStorageContextManager` (registrado pelo NodeSDK em `sdk.ts:273`) já garante que o contexto OTel ativo — e, portanto, o span pai passado para `startLLMRequestSpan` — esteja correto por fiber.

## Arquivos para alterar

| Arquivo                                                                             | Alteração                                                                                                                                                                                                                                    | LOC est |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/telemetry/constants.ts`                                          | Adicionar constante `EVENT_API_RETRY`                                                                                                                                                                                                        | +2      |
| `packages/core/src/telemetry/types.ts`                                              | Adicionar classe `ApiRetryEvent` + membro de união                                                                                                                                                                                          | +40     |
| `packages/core/src/telemetry/loggers.ts`                                            | Adicionar função `logApiRetry()`                                                                                                                                                                                                             | +20     |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                            | Adicionar `logApiRetryEvent()` para consistência downstream de RUM                                                                                                                                                                           | +20     |
| `packages/core/src/telemetry/session-tracing.ts`                                    | Estender `LLMRequestMetadata` (ttftMs, requestSetupMs, attempt, retryTotalDelayMs); estender `endLLMRequestSpan` para definir novos atributos + métrica de breakdown + emissão dupla gen_ai.*                                                  | +60     |
| `packages/core/src/telemetry/metrics.ts`                                            | Conectar o local de chamada `recordApiRequestBreakdown` dentro de `endLLMRequestSpan` (sem alteração no recorder existente)                                                                                                                 | 0       |
| `packages/core/src/utils/retry.ts`                                                  | Adicionar `onRetry?: (info: RetryAttemptInfo) => void` a RetryOptions; exportar `RetryAttemptInfo`; invocar callback no local existente de logRetryAttempt                                                                                  | +25     |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`        | Captura de TTFT: acumuladores locais do método + helper `hasUserVisibleContent` + detecção de primeiro chunk no wrapper de stream; passar novos metadados para `endLLMRequestSpan`                                                            | +80     |
| `packages/core/src/core/client.ts`                                                  | Conectar callback `onRetry` no local de chamada `retryWithBackoff` (`client.ts:1540`)                                                                                                                                                        | +15     |
| `packages/core/src/core/baseLlmClient.ts`                                            | Conectar callback `onRetry` em 2 locais de chamada `retryWithBackoff`                                                                                                                                                                        | +25     |
| `packages/core/src/core/geminiChat.ts`                                               | Conectar callback `onRetry` no local de chamada `retryWithBackoff` (`geminiChat.ts:1039`)                                                                                                                                                    | +15     |
| `packages/core/src/telemetry/session-tracing.test.ts`                                | `endLLMRequestSpan` define ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + emissão dupla gen_ai + métrica de breakdown (cada fase) + finalização idempotente                         | +120    |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts`    | `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only); chamadas concorrentes não se contaminam; TTFT undefined quando abortado antes do primeiro chunk; TTFT undefined em non-streaming | +100    |
| `packages/core/src/utils/retry.test.ts`                                              | `onRetry` invocado por tentativa falha com `attempt`, `delayMs`, `error`, `errorStatus` corretos; ausência de `onRetry` é silenciosa (nenhuma telemetria emitida)                                                                             | +50     |
| `packages/core/src/telemetry/loggers.test.ts`                                        | `logApiRetry` emite LogRecord com payload esperado; faz a ponte através de LogToSpanProcessor para span aninhado sob o span LLM ativo                                                                                                        | +40     |
Total: 14 arquivos, ~610 LOC. Maior que a Fase 2 (#4321) mas comparável à Fase 3 (#4410) e justificado pela amplitude da integração (4 locais de retry + canalização de telemetria + wrapper de streaming).

Se a revisão rejeitar por tamanho: dividir em **Fase 4a + 4b + 4c**:

- **4a** (~200 LOC): captura de TTFT + `LLMRequestMetadata` estendido + emissão dupla. Valor autocontido (visibilidade de TTFT desde o primeiro dia).
- **4b** (~250 LOC): callback `onRetry` + `ApiRetryEvent` + conexão com 4 chamadores. **Independentemente uma correção de bug** para a lacuna de telemetria do `retryWithBackoff`.
- **4c** (~160 LOC): ativação de `recordApiRequestBreakdown` + atributos de agregação do span pai (`attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`). Depende de 4a + 4b.

## Estratégia de teste

| Teste                                                                                                                                     | O que prova                              |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `hasUserVisibleContent` retorna true para text/functionCall/inlineData/executableCode/thought                                             | Semântica D1 entre tipos de parte        |
| `hasUserVisibleContent` retorna false para chunks apenas de role e apenas de uso                                                          | Casos negativos D1                       |
| streaming: TTFT medido desde o início da tentativa até o primeiro chunk visível ao usuário                                                | Detecção de TTFT ponta a ponta           |
| streaming: TTFT indefinido se o stream abortar antes de qualquer chunk visível ao usuário                                                | Caso extremo                             |
| streaming: TTFT calculado a partir do início da tentativa final (não da primeira tentativa)                                              | D3 — TTFT resetado na repetição          |
| não-streaming: TTFT permanece indefinido                                                                                                  | Decisão S3                               |
| chamadas concorrentes a `generateContentStream` não contaminam TTFT entre si                                                             | D2 — garantia local ao método            |
| `endLLMRequestSpan` define todos os atributos da Fase 4 (ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second) | Presença de atributos                    |
| `endLLMRequestSpan` emite dualmente gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model                           | D8 emissão dupla                         |
| `endLLMRequestSpan` registra métrica de detalhamento com 3 fases para streaming, 2 para não-streaming                                    | D6                                       |
| `endLLMRequestSpan` chamado duas vezes: métrica registrada exatamente uma vez, atributos não redefinidos                                  | D7 idempotência                          |
| `retryWithBackoff` com `onRetry`: callback invocado por tentativa falha com argumentos corretos                                          | D4 contrato do callback                  |
| `retryWithBackoff` sem `onRetry`: nenhuma telemetria emitida (silencioso para chamadores não-LLM)                                         | P2 — proteção de escopo channels/weixin   |
| locais de retry em `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` emitem `ApiRetryEvent` na repetição                                | Integração de D4 em 4 locais             |
| LogRecord de `ApiRetryEvent` faz ponte via LogToSpanProcessor para um span filho sob o span LLM ativo                                     | Correção da árvore de traces             |
| Campo `attempt` do span LLM reflete corretamente o número da tentativa final sob repetições                                              | Agregação D5                             |
| Campo `retry_total_delay_ms` do span LLM soma corretamente os atrasos de onRetry                                                          | Agregação D5                             |
| `output_tokens_per_second` indefinido quando `sampling_ms === 0` (sem streaming)                                                          | Evitar divisão por zero                  |

## Casos extremos

| Caso                                                                      | Tratamento                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream aborta antes de qualquer chunk chegar                              | `ttftMs = undefined`, `sampling_ms = undefined`, `output_tokens_per_second = undefined`. `attempt`, `request_setup_ms` ainda definidos. `success = false`                                                                                     |
| Stream aborta após o primeiro chunk                                       | `ttftMs` definido; `sampling_ms` = `duration_ms - ttftMs - request_setup_ms`; reflete tempo de resposta parcial. `success = false`                                                                                                             |
| Repetição bem-sucedida na tentativa 1 (sem repetições)                    | `attempt = 1`, `retry_total_delay_ms = 0`, nenhum `ApiRetryEvent` emitido, métrica de detalhamento registra `request_setup_ms` próximo de 0                                                                                                     |
| Modo de repetição persistente com 50+ tentativas                          | 50+ registros de `ApiRetryEvent` emitidos (limite de teto adiado); span LLM `attempt = 51`, `retry_total_delay_ms = soma de todos os atrasos`. Operador vê visão agregada no span; detalhe completo por tentativa nos spans de ponte de log |
| Chamador não-LLM do `retryWithBackoff` (channels/weixin)                 | Nenhum `onRetry` registrado; apenas o `debugLogger.warn` existente dispara. Nenhum `ApiRetryEvent`; nenhuma métrica de detalhamento (o chamador não é um local LLM)                                                                              |
| `endLLMRequestSpan` chamado duas vezes (condição de corrida abort + erro) | Proteção da Fase 1.5 em `activeSpans.delete()` retorna cedo na segunda chamada; `recordApiRequestBreakdown` está dentro da proteção, registrado exatamente uma vez                                                                              |
| Chunk `message_start` da Anthropic chega antes do conteúdo                | `hasUserVisibleContent` retorna false para ele (sem partes com text/functionCall/etc.); TTFT não acionado até o chunk `content_block_delta` subsequente                                                                                        |
| Primeiro chunk da OpenAI com `delta.content` vazio mas apenas `role`      | `hasUserVisibleContent` retorna false; TTFT não acionado até o primeiro chunk com delta não vazio                                                                                                                                              |
| Resposta apenas de chamada de ferramenta (sem texto)                      | Primeiro chunk com parte `functionCall` aciona TTFT; `output_tokens_per_second` calculado com base na contagem de tokens da chamada de ferramenta                                                                                               |
| Subagentes concorrentes (3 chamadas em andamento)                         | A closure de cada chamada tem seu próprio `attemptStart`, `ttftMs`, `attemptStartTimes`. Cada span por chamada recebe seus próprios metadados em `endLLMRequestSpan`. Sem intercalação (D2)                                                     |
| Repetições em nível de SDK dentro do openai-sdk (`maxRetries=3`)          | Invisível para telemetria do qwen-code — acontece inteiramente dentro do SDK antes de o retryWithBackoff ver a requisição. `attempt` reflete apenas as tentativas do retryWithBackoff. Fora do escopo (ver Fora do escopo)                     |
| Renomeação da especificação `gen_ai.server.time_to_first_token` antes de atingir Estável | Atualização em único arquivo: `session-tracing.ts:endLLMRequestSpan`. O `ttft_ms` nativo do qwen-code permanece autoritativo — nenhum impacto a jusante                                                                                         |
| Requisição LLM de subagente                                                | Pai é o span do subagente (Fase 3). Campos da Fase 4 se aninham corretamente. Agregações agrupadas por `qwen-code.subagent.id` dão desempenho de LLM por subagente — documentação de design futura, fácil acompanhamento                         |
| Modelo de raciocínio com longos blocos de pensamento                      | Primeira parte `thought` aciona TTFT; `sampling_ms` inclui tanto a fase de pensamento quanto a de resposta. Divisão em métricas separadas adiada                                                                                                |
## Reversão

A mudança é aditiva no nível de OTel e métrica — todo novo atributo é opcional, todo novo evento é uma nova classe. Painéis existentes que não filtram pelos novos campos continuam funcionando inalterados.

Mudanças que afetam o comportamento:

- O novo LogRecord `ApiRetryEvent` começa a fluir → o volume de logs aumenta proporcionalmente à taxa de retry (tipicamente <1% das requisições fazem retry). Mitigue amostrando o LogRecord na camada do SDK, se necessário.
- A nova métrica de detalhamento `qwen-code.api.request.breakdown` começa a produzir séries temporais → leve aumento de cardinalidade no Prometheus (`{model, phase}` — limitado).
- O atributo derivado `output_tokens_per_second` pode parecer incomum em painéis que filtram "todos os atributos" — documente.

Caminho de reversão: reverta o único PR (ou cada um dos 4a/4b/4c independentemente). Todos os novos campos usam padrões defensivos (undefined / 0) e não alteram a estrutura de spans.

## Sequenciamento

- **After Phase 3 (#4410, em revisão)**: não é uma dependência rígida. Os atributos da Fase 4 são anexados aos spans `qwen-code.llm_request` independentemente de estarem sob um pai `qwen-code.subagent` (Fase 3) ou `qwen-code.interaction` (Fase 1). Recomenda-se que a Fase 3 seja implementada primeiro para que a agregação por tentativa em subárvores de subagent funcione naturalmente.
- **Independente de #4384** (propagação de saída `traceparent` + `X-Qwen-Code-Session-Id`). Eles afetam a camada HTTP; a Fase 4 afeta a camada de stream/retry/métrica.
- **Independente do follow-up de compressão de chat `clearDetailedSpanState`** (#4097 follow-up). Superfície diferente.

## Perguntas em aberto

1. **Semântica de disparo do callback `onRetry`**: invocado **antes** do sleep de backoff (proposta atual) ou **depois** (quando a próxima tentativa está prestes a começar)? Antes é mais simples — o callback tem todas as informações imediatamente; depois exigiria capturar o atraso recém-concluído separadamente. A recomendação é pré-sleep; documente no contrato do callback.
2. **Tempo por tentativa no span LLM**: devemos adicionar o array `attempt_durations_ms: number[]`? OTel suporta atributos de array de primitivos. Útil para diagnósticos de "qual tentativa de N foi lenta". Adie até que dados de produção mostrem demanda — spans de bridge de log já carregam o equivalente.
3. **Limite de emissão no modo de retry persistente**: em qual limiar `attempt > N` devemos começar a amostrar? `N = 5` então 1 em 10? `N = 10` então apenas resumo? Adie até termos dados de volume de produção.
4. **Fase `TOKEN_PROCESSING`**: manter o valor do enum dormente ou conectá-lo a algo (ex.: tempo de consolidação)? Adie — espere por um caso de uso real.
5. **Agregações de LLM no nível de subagent**: follow-up trivial assim que a Fase 4 for implementada — some `ttft_ms`/`output_tokens`/`input_tokens` por subárvore de subagent. Não está no escopo da Fase 4, mas o fluxo de dados permite.
