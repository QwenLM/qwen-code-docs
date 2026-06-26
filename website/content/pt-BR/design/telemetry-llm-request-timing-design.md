# Decomposição Temporal da Requisição LLM - Design (P3 Fase 4)

> Issue #3731 — Fase 4 do rastreamento hierárquico de sessão. Adiciona tempo-para-primeiro-token, duração de configuração da requisição, duração de amostragem e telemetria de tentativas por retry ao span `qwen-code.llm_request`, permitindo que operadores respondam "por que essa chamada LLM foi lenta?" sem precisar adivinhar.
>
> Baseia-se na Fase 1 (#4126), Fase 1.5 (#4302), Fase 2 (#4321). Independente da Fase 3 (#4410, em revisão) — recomenda-se finalizar a Fase 3 primeiro para que os campos por tentativa da Fase 4 sejam agregados de forma limpa nas subárvores dos subagentes.

## Problema

Atualmente, os spans `qwen-code.llm_request` carregam apenas `model`, `prompt_id`, `input_tokens`, `output_tokens`, `success`, `error`, `duration_ms`. Operadores que analisam um único trace não conseguem saber:

1. **Quanto do `duration_ms` foi o modelo pensando vs. a configuração de rede.** Um `duration_ms` de 12 segundos pode ser 11s de tentativas seguidas de 1s de geração rápida, ou 100ms de configuração seguidos de 12s de streaming lento — o trace não informa.
2. **Quando o usuário viu o primeiro token.** TTFT (time-to-first-token) é o SLO de latência padrão para UIs de chat. Não podemos calculá-lo; não o capturamos.
3. **O que aconteceu durante as tentativas.** `retryWithBackoff` (`utils/retry.ts:285`) chama apenas `debugLogger.warn` — nenhum evento OTel, nenhum atributo de span. Os 4 pontos de chamada LLM que passam por ele (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) têm visibilidade zero de tentativas em traces ou métricas. `ContentRetryEvent` existe para tentativas de recuperação de conteúdo dentro de `geminiChat.ts:806,830`, mas não para as tentativas mais comuns de rate-limit / 5xx.
4. **Que `api.request.breakdown` é código morto.** A métrica é definida em `metrics.ts:242-251` com 4 valores `ApiRequestPhase`, exportada de `index.ts:117`, testada em `metrics.test.ts:646-675` — mas `recordApiRequestBreakdown()` não tem nenhum chamador em código de produção. A infraestrutura da métrica já é paga; o fluxo de dados nunca foi conectado.

Essas lacunas tornam `qwen-code.llm_request` o span menos informativo da árvore de trace. Spans de ferramenta (#4126/#4321) e spans de subagente (#4410) expõem fases do ciclo de vida; spans LLM colapsam toda a requisição em uma única duração opaca.

## Superfície existente (sem alteração)

| Componente                                                    | Localização                                                     | Por que não mexemos                                                                                                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ciclo de vida do span de requisição LLM                      | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | A Fase 1 (#4126) estabeleceu os helpers. Estendemos a interface de metadados, não reestruturamos                                                                                                        |
| Propagação de span ativo para generators dos provedores       | `loggingContentGenerator.ts:213,287`                            | A Fase 1 (#4126) substituiu `withSpan('api.*')` por helpers nativos; o contexto ativo já alcança o wrapper de stream                                                                                     |
| Schema + consumidores do `ContentRetryEvent`                  | `types.ts:626`, `qwen-logger.ts:947`, `loggers.ts:717`           | O evento existente mantém sua forma e downstreams; adicionamos uma classe de evento irmão para o caminho `retryWithBackoff`                                                                              |
| Spans de ponte de log do `LogToSpanProcessor`                 | `log-to-span-processor.ts`                                       | A ponte existente do ContentRetryEvent continua aninhada sob o span LLM ativo. A Fase 4 não altera isso                                                                                                  |
| Enum `ApiRequestPhase`                                        | `metrics.ts:330-334`                                             | Superfície pública (4 valores). Populamos 3 dos 4 a partir do código de produção; deixamos o enum inalterado para compatibilidade reversa                                                               |
| Normalização de chunks por provedor → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                             | Cada provedor já normaliza para a forma `GenerateContentResponse` do Google antes que o LoggingContentGenerator veja o stream. A detecção de TTFT roda centralizadamente sobre essa forma normalizada; nenhum código por provedor |
| `retryWithBackoff` de propósito geral                         | `utils/retry.ts:140`                                             | Usado tanto por chamadores LLM quanto não-LLM (`channels/weixin/src/api.ts`). Estendemos com um callback `onRetry` opcional em vez de acoplar rigidamente à telemetria LLM                               |
| `generateContent` sem streaming                               | `loggingContentGenerator.ts:212`                                 | TTFT não é significativo para não-streaming; os novos campos permanecem `undefined`. Ciclo de vida do span e atributos existentes inalterados                                                            |

## Fora do escopo (adiado)

- **Tentativas em nível de SDK** (openai SDK `maxRetries=3`, google-genai SDK tentativas internas). Elas acontecem inteiramente dentro do SDK de terceiros; observá-las exige desabilitar as tentativas do SDK e reimplementar em `retryWithBackoff`. Decisão separada, não é Fase 4.
- **Métricas de streaming por token** (latência entre tokens, tamanho por chunk). Úteis para depuração de desempenho do motor de inferência, não para as questões de latência percebida pelo usuário que a Fase 4 aborda.
- **TTFT separado para blocos de raciocínio/pensamento.** "Primeiro token" inclui conteúdo de pensamento (ver D1). Uma melhoria futura poderia separar `ttft_to_reasoning_ms` vs `ttft_to_answer_ms`, mas apenas após sabermos que há demanda.
- **Fase de amostragem como um span filho dedicado.** Calculável a partir de `duration_ms - ttft_ms - request_setup_ms`; um span filho não adiciona nada para backends somente OTel (claude-code usa um apenas para Perfetto). Armazenado como um atributo de span — ver D6.
- **Limitação de taxa em nível de evento do modo de tentativa persistente (`QWEN_CODE_UNATTENDED_RETRY`).** Uma única requisição LLM pode produzir 50+ registros de `ContentRetryEvent` / `ApiRetryEvent` sob tentativa persistente. Limitar a emissão é um follow-up — a Fase 4 emite todos os eventos; se os volumes de produção se mostrarem insuportáveis, adicione um limite de emissão por span com um evento de resumo "+N mais tentativas (truncadas)" em um PR futuro.
- **Fase de breakdown `TOKEN_PROCESSING`.** O valor do enum existe, mas o qwen-code não tem processamento local pós-stream real que valha a pena medir (<10ms típico). Pulado nos chamadores de produção; valor do enum mantido para uso futuro ou para chamadores que não controlamos.
- **Migração do `ContentRetryEvent` para eventos de span no span LLM.** Mesma lógica que o LogRecord `subagent_execution` da Fase 3: consumidores existentes (qwen-logger RUM, métricas futuras) estão fortemente acoplados ao LogRecord. A cobertura via spans de ponte é suficientemente boa.

## Referências (evidências para decisão)

| Fonte                                                                                                                      | Principais conclusões                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                  | TTFT capturado como `Date.now() - start` no evento SSE `message_start`; `start` reiniciado por tentativa. `requestSetupMs = start - startIncludingRetries`. Array `attemptStartTimes` preservado por tentativa. Confirma a viabilidade da abordagem; a semântica de TTFT deles é "primeiro evento de stream" (divergimos para "primeiro conteúdo" — ver D1) |
| claude-code `perfettoTracing.ts:549-671`                                                                                    | Renderiza Request Setup → Attempt N (retry) → First Token → Sampling como pares B/E aninhados. Demonstra a decomposição visual; qwen-code faz a mesma decomposição com atributos OTel, já que não temos Perfetto                                                                                                                     |
| claude-code `sessionTracing.ts:447`                                                                                         | Apenas `ttft_ms` chega ao span OTel (não `requestSetupMs`, não `samplingMs`, não tempos por tentativa). Colocamos deliberadamente mais no span — claude-code tem Perfetto para visualização; nós não temos                                                                                                                            |
| opencode (sst/opencode) `session/llm.ts`, `route/client.ts`                                                                 | Nenhuma medição de TTFT. Um único span `LLM.run` Effect cobre tudo. Valida que a lacuna existe em ferramentas concorrentes; não é referência sobre o que fazer                                                                                                                                                                      |
| [Convenções Semânticas GenAI do OTel](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (status: Desenvolvimento / Experimental) | `gen_ai.usage.input_tokens` (Stable), `gen_ai.usage.output_tokens` (Stable), `gen_ai.usage.cached_tokens` (Experimental), `gen_ai.request.model` (Stable), `gen_ai.server.time_to_first_token` (Experimental, segundos como double). Padrão de emissão dupla segue precedente da #4410                                                |
| [Especificação de Trace OTel — Eventos de Span](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)             | "Eventos NÃO DEVEM ser usados para registrar informações que são melhor capturadas como Atributos de Span." Confirma que informações por tentativa pertencem aos atributos do span LLM + spans de ponte de log, não como Eventos de Span no pai                                                                                     |
| Documento de design da Fase 3 (`telemetry-subagent-spans-design.md`)                                                        | Estabeleceu o padrão de emissão dupla (`qwen-code.subagent.id` + `gen_ai.agent.id`) e a regra "nome privado é autoritativo". A Fase 4 segue a mesma convenção para TTFT e campos de token                                                                                                                                           |

## Design — sete decisões, cada uma justificada

### D1 — Semântica de TTFT: "primeiro chunk contendo conteúdo visível ao usuário"

TTFT mede o tempo de relógio desde o **envio da requisição da tentativa bem-sucedida** até o **primeiro chunk do stream que contém saída visível ao usuário**. Um chunk é "visível ao usuário" se qualquer `Part` normalizada em `candidates[0].content.parts` for um de:

- `text` com string não vazia
- `functionCall` (uso de ferramenta)
- `inlineData` (imagem, binário)
- `executableCode`
- `thought` / conteúdo de raciocínio (o que o provedor expuser — `thought` do Gemini, bloco `<thinking>` do Anthropic, chunk de raciocínio do OpenAI o1)

Chunks contendo apenas metadados `role` ou apenas `usageMetadata` (chunk de resumo final de uso) não disparam TTFT.

**Por que não "primeiro evento de stream de qualquer tipo" (escolha do claude-code)**: claude-code mede TTFT no `message_start`, um evento de metadados específico do Anthropic que dispara 50–300ms antes de qualquer conteúdo real. O `headlessProfiler.ts` interno deles já separa `time_to_first_response_ms` para a semântica "usuário viu algo", reconhecendo a distinção. O qwen-code opera com múltiplos provedores (Anthropic, OpenAI, Gemini, Qwen) — escolher a semântica de evento de metadados faria com que o TTFT para Anthropic fosse fundamentalmente diferente do TTFT para OpenAI (que não tem um primeiro evento apenas de metadados análogo). A semântica de conteúdo visível ao usuário é uniforme entre todos os 4 provedores e corresponde literalmente a "tempo-para-primeiro-token".

**Por que incluir `thought` / raciocínio**: da perspectiva do operador, chunks de raciocínio ainda são "o modelo produziu saída." Excluí-los subestimaria o TTFT para modelos pesados em raciocínio (o1, variantes thinking do Qwen). Uma divisão futura em `ttft_to_reasoning_ms` vs `ttft_to_answer_ms` é possível; não é Fase 4.

**Por que incluir chunks de apenas chamada de ferramenta**: chamadas LLM para decisão de ferramenta do agente (um `tool_use`, sem texto) são comuns no fluxo de trabalho do qwen-code. Excluí-las significa que TTFT é indefinido para essas requisições. A Part `functionCall` é uma saída significativa.

**Nota de comparação entre produtos**: o documento de design afirma explicitamente que `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`. Operadores comparando entre produtos devem se alinhar à semântica de conteúdo visível ao usuário.

### D2 — Local da medição de TTFT: variáveis locais do método em `LoggingContentGenerator.generateContentStream`

A detecção do primeiro chunk roda dentro do wrapper de stream existente em `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`). Variáveis por chamada (`start`, `ttftMs`) vivem no closure do método; **nunca como campos de instância**.

**Por que nunca campos de instância**: `LoggingContentGenerator` é instanciado **uma vez por `ContentGenerator`** (`contentGenerator.ts:377`) e compartilhado entre todas as chamadas concorrentes de `generateContentStream` — fan-out de subagentes, consultas de warmup, consultas paralelas de `geminiChat`. Um campo de instância seria sobrescrito entre chamadas concorrentes, produzindo TTFT sem sentido para uma de cada duas requisições intercaladas.

**Por que não AsyncLocalStorage**: ALS funcionaria, mas adiciona uma camada de gerenciamento de contexto para um estado que não precisa escapar do método. Local ao método é mais simples, zero overhead, zero risco de vazamento.

```ts
// loggingContentGenerator.ts — dentro de generateContentStream
const attemptStart = Date.now(); // local por chamada
const requestEntryTime = Date.now(); // também local por chamada — ver D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// o wrapper de stream inspeciona cada chunk; o primeiro que corresponder a hasUserVisibleContent:
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` é um pequeno helper independente co-localizado com o wrapper, exportado para testes:

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
      // @ts-expect-error — `thought` não está em todas as versões do SDK, mas provedores o emitem
      p.thought !== undefined,
  );
}
```

### D3 — Cálculo de `request_setup_ms`: tempo de entrada vs. início da tentativa bem-sucedida

`request_setup_ms` mede o tempo de relógio desde a entrada em `generateContentStream`/`generateContent` até o **início da tentativa bem-sucedida** — incluindo todas as tentativas falhas, pausas de backoff e qualquer trabalho de preparação pré-tentativa.

```ts
request_setup_ms = attemptStart_da_tentativa_bem_sucedida - requestEntryTime;
```

Quando `attempt === 1` e não houve tentativas, `request_setup_ms` é pequeno (apenas setup do SDK). Quando ocorreram tentativas, ele captura toda a sobrecarga do orçamento de retry.

**Colocando no span OTel (divergência do claude-code, que coloca apenas no Perfetto)**: justificativa em três níveis:

1. **Sem Perfetto** — o qwen-code não tem camada de visualização fora de banda. Atributos OTel são o único canal.
2. **Depuração em trace único** — operador vê `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → diagnostica instantaneamente "tentativas consumiram 11,5s, o modelo em si foi rápido." Calcular `request_setup_ms` a partir de outros campos exigiria também expor `sampling_ms`, o que fazemos de qualquer forma (D6).
3. **Custo insignificante** — 1 atributo INT64. Mesma ordem de grandeza dos atributos existentes `input_tokens`, `output_tokens`. O custo de ingestão no backend não é material.

### D4 — Telemetria de tentativas: callback `onRetry` opcional em `retryWithBackoff` + `ApiRetryEvent` + propagação via AsyncLocalStorage

> **Atualização da Fase 4b (descoberta pós-design)**: esta seção foi originalmente escrita assumindo o padrão "um span LLM é dono do loop de tentativa" do claude-code. Durante a implementação da Fase 4b, descobrimos que os 4 pontos de chamada `retryWithBackoff` do qwen-code (`client.ts:2109`, `baseLlmClient.ts:235,333`, `geminiChat.ts:2035` — números de linha conforme no merge) todos envolvem `apiCall = () => contentGenerator.generateContent(...)`. A camada de tentativa está **acima** do LoggingContentGenerator. Cada tentativa invoca `apiCall()` novamente → novo span `qwen-code.llm_request`. Não há um único span compartilhado entre tentativas. Um acumulador dentro do LoggingContentGenerator não funcionaria.
>
> **Resolução**: propagar estado de tentativa via `AsyncLocalStorage` (`retryContext` em `packages/core/src/utils/retryContext.ts`). `retryWithBackoff` envolve cada `await fn()` com `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)`. `LoggingContentGenerator` lê o ALS em seu prelúdio síncrono e encaminha os valores para `endLLMRequestSpan`. Isso realmente fornece **observabilidade mais rica** do que o plano original — cada span por tentativa tem seu próprio `duration_ms` / `ttft_ms` / detalhes de erro E sabe onde está no orçamento de tentativa através dos atributos por tentativa `attempt` / `requestSetupMs` / `retryTotalDelayMs`.
>
> A abordagem ALS corresponde a padrões existentes no código-fonte (`promptIdContext`, `subagentNameContext`, `agent-context`) — superfície nova mínima, semântica bem compreendida. O processo de revisão em modo-plano capturou esta revisão através de 3 rodadas de revisão encontrando 22 problemas, todos resolvidos antes do merge.

`retryWithBackoff` atualmente chama `logRetryAttempt` (`retry.ts:343`) que apenas escreve em `debugLogger.warn`. Estendemos a interface `RetryOptions` com um callback opcional:

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... campos existentes ...
  /**
   * Opcional. Chamado uma vez por tentativa falha, antes da pausa de backoff.
   * Recebe o número da tentativa (base 1), o erro e o atraso antes da
   * próxima tentativa. Use para emitir eventos de telemetria para pontos
   * de chamada LLM; deixe indefinido para chamadores não-LLM (ex.: channels/weixin)
   * para que permaneçam silenciosos em canais de telemetria específicos de LLM.
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // base 1, corresponde à saída do debugLogger
  error: unknown;
  errorStatus?: number;
  delayMs: number; // atraso de backoff antes da próxima tentativa
}
```

Os 4 pontos de chamada LLM (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) registram um callback que emite um novo `ApiRetryEvent`:
```ts
// types.ts — nova classe de evento, irmã de ContentRetryEvent
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // baseado em 1
  error_type: string;
  error_message: string; // truncado para 256 caracteres
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms é definido como retry_delay_ms para que o LogToSpanProcessor renderize
  // um bridge span com largura significativa
  duration_ms: number;
}
```

**Por que uma nova classe de evento, ao invés de estender `ContentRetryEvent`**:

- `ContentRetryEvent` tem 2 consumidores downstream (qwen-logger, exportação de log-record). Alterar seu payload corre o risco de quebrá-los.
- O nome "content retry" semanticamente se refere a retentativas de recuperação de conteúdo (stream inválido, reparo de schema) — estendê-lo para cobrir retentativas por limite de taxa confundiria o schema.
- Novo evento é aditivo; nenhuma surpresa para os consumidores.

**Por que não embutir o callback DENTRO de `retry.ts`**: `retry.ts` também é chamado por `channels/weixin/src/api.ts` (retentativas da API de mensageria da Microsoft). Acoplar rigidamente telemetria de LLM dentro de retry.ts emitiria `ApiRetryEvent` para retentativas não‑LLM. O callback `onRetry` é opt-in por chamador — chamadores de LLM optam por usar, o chamador weixin não.

**Coexistência com ContentRetryEvent**: ContentRetryEvent permanece como está para retentativas de recuperação de conteúdo dentro de `geminiChat.ts:806,830`. ApiRetryEvent cobre as retentativas por limite de taxa / 5xx vindas de `retryWithBackoff`. Os dois eventos são disparados de camadas diferentes e nunca se duplicam. O comportamento existente do log‑bridge para ambos os eventos é preservado via `LogToSpanProcessor` — ambos os eventos se aninham automaticamente sob o span LLM ativo (a fiação da Fase 1 garante que o span LLM esteja ativo durante as retentativas).

**Modo de retentativa persistente (`QWEN_CODE_UNATTENDED_RETRY`)**: uma única requisição em loop 429 pode emitir mais de 50 eventos. Está fora do escopo limitar a emissão na Fase 4 — se os volumes em produção se mostrarem insuportáveis, adicione um limite por span com evento resumido em um PR futuro. Os atributos agregados `attempt` e `retry_total_delay_ms` no span LLM pai (D5) permanecem precisos independentemente do limite de eventos.

### D5 — Agregação no span LLM pai: apenas atributos escalares (sem atributos do tipo mapa)

Atributos de span no OTel são escalares (`string | number | boolean | array destes`). Atributos do tipo mapa (como `retry_count_by_status: {429:2, 503:1}`) exigem serialização JSON e são difíceis de consultar. Pule‑os.

| Atributo                  | Tipo   | Semântica                                                                                                                            |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `attempt`                 | int    | Contador monotônico baseado em 1 vindo de `retryContext.attempt` (iteração desta tentativa). Sempre preenchido (padrão 1 quando não há contexto de retentativa) |
| `retry_total_delay_ms`    | int    | Atraso cumulativo do backoff ANTES do início desta tentativa. Indefinido para chamadas diretas; 0 para tentativa 1; > 0 para tentativas subsequentes com retentativa |
| `ttft_ms`                 | int    | TTFT conforme D1; indefinido para requisições não‑streaming ou abortadas antes do primeiro chunk                                      |
| `request_setup_ms`        | int    | Conforme D3                                                                                                                          |
| `sampling_ms`             | int    | Conforme D6                                                                                                                          |
| `output_tokens_per_second`| double | Derivado; `output_tokens / (sampling_ms / 1000)`; indefinido quando `sampling_ms === 0`                                               |

A distribuição de código de status por tentativa (ex.: "2 das 3 tentativas foram 429") é consultável a partir dos spans bridge de log dos registros `ApiRetryEvent`. Não há necessidade de duplicá‑la como um atributo achatado no pai.

**Por que `sampling_ms` e `output_tokens_per_second` no span**: deriváveis, mas trabalhosos de computar em consultas no backend quando somados entre muitos spans. Mesmo custo‑benefício que `request_setup_ms` (D3).

### D6 — Ativar `recordApiRequestBreakdown()` para 3 das 4 fases

Em `endLLMRequestSpan` (ou no wrapper que a chama), após calcular TTFT/setup/sampling, emitir:

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = latência de rede + geração do primeiro token
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**Por que pular `TOKEN_PROCESSING`**: qwen‑code faz o processamento de chunks do stream inline (a consolidação ocorre no wrapper em `loggingContentGenerator.ts:644`); a fase pós‑stream wrap‑up é <10ms e não é arquiteturalmente distinta. Preenchê‑la com um valor sem sentido polui o histograma. Deixar o valor do enum sem uso é seguro — `apiRequestBreakdownHistogram.record(value, {model, phase})` é apenas um histograma com `phase` como rótulo; rótulos ausentes simplesmente não aparecem nas consultas.

**Por que não redefinir `NETWORK_LATENCY`**: o nome na especificação é um pouco enganoso (é latência de rede + geração do primeiro token, não latência de rede pura), mas:

- O enum faz parte de `metrics.ts:330-334`, que é exportado de `index.ts:117` e testado.
- Dashboards no backend podem já referenciar esses nomes de fase.
- Renomear ou adicionar uma nova fase seria uma mudança que quebra para uma melhoria de precisão trivialmente marginal.

Documente a semântica no design doc; deixe o enum inalterado.

**Por que no caminho do span, não em paralelo**: mantém `recordApiRequestBreakdown` co‑localizado com as escritas de atributos do span — ponto único de emissão controlado (veja D7 idempotência), única invariante de ordenação.

### D7 — Idempotência de `endLLMRequestSpan`: gravação de métrica protegida pelo guarda duplo existente

A Fase 1.5 (#4302) estabeleceu que `endLLMRequestSpan` pode ser chamada duas vezes (caminho de aborto + caminho de erro colidindo). O guarda existente em `session-tracing.ts:~470` (`if (!activeSpans.has(...)) return;`) evita `span.end()` duplo. A gravação de métrica da Fase 4 (D6) **deve ficar dentro do mesmo bloco protegido**, antes de `span.end()`:

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // já finalizado — guarda duplo
activeSpans.delete(spanRef);    // reivindica a finalização

// ... calcula duração, define atributos ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // NOVO — protegido
  recordTokenUsageMetrics(...); // existente
}

span.end();
```

Isso garante que a métrica seja gravada **exatamente uma vez** por requisição LLM, acompanhando o ciclo de vida do span.

**Por que não gravar em `loggingContentGenerator`**: ele não vê o caminho de aborto. Gravar na camada do ciclo de vida do span garante que toda requisição LLM que abre um span produza exatamente uma amostra de breakdown, independentemente de sucesso/erro/aborto.

### D8 — Dupla emissão de convenções semânticas GenAI (nome privado como autoritativo)

Cada atributo da Fase 4 que corresponde a um atributo semconv OTel GenAI é escrito duas vezes no span:

| qwen-code privado (autoritativo)           | GenAI semconv (camada de compatibilidade)         | Conversão de unidade | Status da especificação |
| ------------------------------------------ | ------------------------------------------------- | -------------------- | ----------------------- |
| `ttft_ms` (ms, int)                        | `gen_ai.server.time_to_first_token` (s, double)   | `ttftMs / 1000`      | Experimental            |
| `input_tokens` (int)                       | `gen_ai.usage.input_tokens` (int)                 | idêntico             | Stable                  |
| `output_tokens` (int)                      | `gen_ai.usage.output_tokens` (int)                | idêntico             | Stable                  |
| `cached_input_tokens` (int) (quando presente)| `gen_ai.usage.cached_tokens` (int)                | idêntico             | Experimental            |
| `qwen-code.model` (string)                 | `gen_ai.request.model` (string)                   | idêntico             | Stable                  |

**Nomes de atributos de token existentes** no span LLM (definidos em `endLLMRequestSpan` antes da Fase 4): qwen‑code já usa `input_tokens` e `output_tokens` puros. A Fase 4 adiciona os irmãos `gen_ai.usage.*` para seguir o padrão de #4410. Os nomes puros permanecem; **não renomeie**.

Campos sem equivalente semconv GenAI — `request_setup_ms`, `sampling_ms`, `retry_total_delay_ms`, `attempt`, `output_tokens_per_second` — são emitidos apenas sob o namespace qwen‑code.

**Por que "privado autoritativo, semconv como compat"**:

- Dashboards internos, SLOs, saída do debugLogger, RUM do qwen-logger, consultas ARMS — todos referenciam `ttft_ms`, etc. Tratá‑los como canônicos evita uma migração de dia‑D.
- O semconv GenAI Experimental pode renomear `gen_ai.server.time_to_first_token` antes de atingir Stable. Se/quando isso acontecer, atualizamos a emissão semconv; os nomes qwen‑code não se movem.
- Backends futuros conscientes de especificação (visualizações AI do Datadog, AI do Honeycomb, dashboards GenAI do ARMS) captam automaticamente os atributos `gen_ai.*` sem nosso envolvimento.

**Por que conversão de unidade na dupla emissão** (ms ↔ segundos): GenAI semconv escolheu segundos‑como‑double para latência; qwen‑code escolheu ms‑como‑int (combina com `duration_ms` já no span). Ambas as representações têm valor; a conversão é barata.

## API auxiliar (aditiva a `session-tracing.ts`)

```ts
// session-tracing.ts — interface LLMRequestMetadata estendida (aditiva)
export interface LLMRequestMetadata {
  // ... campos existentes: inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** Tempo desde o início da tentativa bem‑sucedida até o primeiro chunk de conteúdo visível ao usuário (ms). Indefinido para requisições não‑streaming ou abortadas antes do primeiro chunk. */
  ttftMs?: number;

  /** Tempo desde a entrada em generateContent até o início da tentativa bem‑sucedida (ms). Inclui todas as retentativas falhas + backoff. */
  requestSetupMs?: number;

  /** Número da tentativa final (baseado em 1). 1 = sem retentativas. */
  attempt?: number;

  /** Soma de todos os atrasos de backoff antes da tentativa bem‑sucedida (ms). */
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
  duration_ms: number;  // = retry_delay_ms, controla a largura do bridge span do LogToSpanProcessor

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — Extensão de RetryOptions
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

## Fiação do ciclo de vida

### Caminho streaming (o caso comum)

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // Usa o startLLMRequestSpan existente (Fase 1)
  // Passa callback onRetry para qualquer camada de retentativa em uso:
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // estamos prestes a iniciar tentativa N+1
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // aproximado; o reset real é no topo da próxima tentativa
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

  // wrapper do stream detecta o primeiro chunk visível ao usuário:
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

Ao final do span (já no fluxo `endLLMRequestSpan` da Fase 1), incluir os novos campos em `LLMRequestMetadata`:

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

### Caminho não‑streaming

`generateContent` (`loggingContentGenerator.ts:212`) não produz chunks de stream. TTFT é `undefined`; `request_setup_ms` ainda é significativo (captura a sobrecarga de retentativas). A métrica de breakdown registra 2 fases (REQUEST_PREPARATION + RESPONSE_PROCESSING onde `RESPONSE_PROCESSING = duration_ms - request_setup_ms`), não 3.

### Integração com a camada de retentativa (4 locais)

Cada um dos 4 pontos de chamada de `retryWithBackoff` de LLM adiciona `onRetry`:

```ts
// client.ts:1540 (similar em baseLlmClient.ts:193, 282, geminiChat.ts:1039)
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
    // também alimenta o acumulador local de retentativas do LoggingContentGenerator
    // (quando está no escopo — para chamadores que não passam pelo LoggingContentGenerator,
    // o span LLM ainda recebe `attempt` e `retry_total_delay_ms` via
    // o caminho de metadados porque endLLMRequestSpan é chamado na camada LLM)
  },
});
```

O chamador não‑LLM (`channels/weixin/src/api.ts`) **não registra `onRetry`** — nenhum `ApiRetryEvent` é emitido para suas retentativas, mantendo o comportamento atual.

## Segurança concorrente — a garantia principal

A instância de `LoggingContentGenerator` é compartilhada (uma por `ContentGenerator`, `contentGenerator.ts:377`). Três chamadas concorrentes a `generateContentStream` (ex.: 3 subagentes em paralelo via `coreToolScheduler.runConcurrently`) executam três closures independentes de `generateContentStream`:

```
call_A: attemptStart_A, ttftMs_A, ... (closure)
call_B: attemptStart_B, ttftMs_B, ... (closure)
call_C: attemptStart_C, ttftMs_C, ... (closure)
```

As variáveis locais de cada chamada nunca se sobrepõem. Chunks de stream são detectados em relação ao `attemptStart` local de cada chamada. Atributos do span são definidos no `endLLMRequestSpan` de cada chamada.

O `AsyncLocalStorageContextManager` (registrado pelo NodeSDK em `sdk.ts:273`) já garante que o contexto OTel ativo — e portanto o span pai passado para `startLLMRequestSpan` — esteja correto por fiber.

## Arquivos a serem alterados

| Arquivo                                                                           | Alteração                                                                                                                                                                                                                                   | LOC est |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/telemetry/constants.ts`                                        | Adicionar constante `EVENT_API_RETRY`                                                                                                                                                                                                       | +2      |
| `packages/core/src/telemetry/types.ts`                                            | Adicionar classe `ApiRetryEvent` + membro da união                                                                                                                                                                                          | +40     |
| `packages/core/src/telemetry/loggers.ts`                                          | Adicionar função `logApiRetry()`                                                                                                                                                                                                            | +20     |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                          | Adicionar `logApiRetryEvent()` para consistência do RUM downstream                                                                                                                                                                           | +20     |
| `packages/core/src/telemetry/session-tracing.ts`                                  | Estender `LLMRequestMetadata` (ttftMs, requestSetupMs, attempt, retryTotalDelayMs); estender `endLLMRequestSpan` para definir novos atributos + métrica de breakdown + dupla emissão gen_ai.*                                                | +60     |
| `packages/core/src/telemetry/metrics.ts`                                          | Conectar ponto de chamada de `recordApiRequestBreakdown` dentro de `endLLMRequestSpan` (nenhuma alteração no gravador existente)                                                                                                             | 0       |
| `packages/core/src/utils/retry.ts`                                                | Adicionar `onRetry?: (info: RetryAttemptInfo) => void` a RetryOptions; exportar `RetryAttemptInfo`; invocar callback no local existente de logRetryAttempt                                                                                   | +25     |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`       | Captura de TTFT: acumuladores locais ao método + helper `hasUserVisibleContent` + detecção de primeiro chunk no wrapper do stream; passar novos metadados para `endLLMRequestSpan`                                                            | +80     |
| `packages/core/src/core/client.ts`                                                | Conectar callback `onRetry` no local de chamada de `retryWithBackoff` (`client.ts:1540`)                                                                                                                                                     | +15     |
| `packages/core/src/core/baseLlmClient.ts`                                         | Conectar callback `onRetry` em 2 locais de chamada de `retryWithBackoff`                                                                                                                                                                     | +25     |
| `packages/core/src/core/geminiChat.ts`                                            | Conectar callback `onRetry` no local de chamada de `retryWithBackoff` (`geminiChat.ts:1039`)                                                                                                                                                 | +15     |
| `packages/core/src/telemetry/session-tracing.test.ts`                             | `endLLMRequestSpan` define ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + dupla emissão gen_ai + métrica de breakdown (cada fase) + finalização idempotente                        | +120    |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts`  | `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only); chamadas concorrentes não se contaminam; TTFT indefinido quando abortado antes do primeiro chunk; TTFT indefinido em não‑streaming | +100    |
| `packages/core/src/utils/retry.test.ts`                                           | `onRetry` invocado por tentativa falha com `attempt`, `delayMs`, `error`, `errorStatus` corretos; ausência de `onRetry` é silenciosa (nenhuma telemetria emitida)                                                                             | +50     |
| `packages/core/src/telemetry/loggers.test.ts`                                     | `logApiRetry` emite LogRecord com payload esperado; faz bridge através de LogToSpanProcessor para span aninhado sob o span LLM ativo                                                                                                          | +40     |
Total: 14 arquivos, ~610 LOC. Maior que a Fase 2 (#4321) mas comparável à Fase 3 (#4410) e justificado pela amplitude da integração (4 locais de retry + infraestrutura de telemetria + wrapper de streaming).

Se a revisão pressionar pelo tamanho: dividir em **Fase 4a + 4b + 4c**:

- **4a** (~200 LOC): captura de TTFT + `LLMRequestMetadata` estendido + emissão dupla. Valor autocontido (visibilidade de TTFT desde o primeiro dia).
- **4b** (~250 LOC): callback `onRetry` + `ApiRetryEvent` + integração de 4 chamadores. **Independentemente, uma correção de bug** para a lacuna de telemetria do `retryWithBackoff`.
- **4c** (~160 LOC): ativação de `recordApiRequestBreakdown` + atributos de agregação do span pai (`attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`). Depende de 4a + 4b.

## Estratégia de teste

| Teste                                                                                                                                         | O que prova                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `hasUserVisibleContent` retorna true para text/functionCall/inlineData/executableCode/thought                                                 | Semântica D1 entre tipos de parte              |
| `hasUserVisibleContent` retorna false para chunks apenas de role e apenas de usage                                                            | Casos negativos D1                             |
| streaming: TTFT medido do início da tentativa até o primeiro chunk visível ao usuário                                                         | Detecção ponta a ponta de TTFT                 |
| streaming: TTFT indefinido se o stream abortar antes de qualquer chunk visível ao usuário                                                    | Caso de borda                                  |
| streaming: TTFT calculado a partir do início da tentativa final (não da primeira tentativa)                                                  | D3 — TTFT reiniciado no retry                  |
| non-streaming: TTFT permanece indefinido                                                                                                     | Decisão S3                                     |
| chamadas concorrentes de `generateContentStream` não contaminam o TTFT                                                                       | D2 — garantia local ao método                  |
| `endLLMRequestSpan` define todos os atributos da Fase 4 (ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second) | Presença de atributos                          |
| `endLLMRequestSpan` emite duplamente gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model                              | D8 emissão dupla                               |
| `endLLMRequestSpan` registra métrica de detalhamento com 3 fases para streaming, 2 para non-streaming                                       | D6                                             |
| `endLLMRequestSpan` chamado duas vezes: métrica registrada exatamente uma vez, atributos não redefinidos                                     | D7 idempotência                                |
| `retryWithBackoff` com `onRetry`: callback invocado por tentativa falha com argumentos corretos                                              | Contrato do callback D4                        |
| `retryWithBackoff` sem `onRetry`: nenhuma telemetria emitida (silencioso para chamadores não-LLM)                                            | P2 — proteção de escopo channels/weixin        |
| os locais de chamada de retry em `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` emitem `ApiRetryEvent` ao fazer retry                    | Integração de D4 em 4 locais                   |
| o LogRecord `ApiRetryEvent` faz a ponte via LogToSpanProcessor para um span filho sob o span LLM ativo                                       | Correção da árvore de rastreamento             |
| o campo `attempt` do span LLM reflete corretamente o número da tentativa final sob retries                                                   | Agregação D5                                   |
| `retry_total_delay_ms` do span LLM soma corretamente os delays de onRetry                                                                    | Agregação D5                                   |
| `output_tokens_per_second` indefinido quando `sampling_ms === 0` (sem streaming)                                                             | Evitar divisão por zero                        |

## Casos de borda

| Caso                                                                        | Tratamento                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream aborta antes de qualquer chunk chegar                                | `ttftMs = undefined`, `sampling_ms = undefined`, `output_tokens_per_second = undefined`. `attempt`, `request_setup_ms` ainda definidos. `success = false`                                                                  |
| Stream aborta após o primeiro chunk                                         | `ttftMs` definido; `sampling_ms` = `duration_ms - ttftMs - request_setup_ms`; reflete o tempo de resposta parcial. `success = false`                                                                                       |
| Retry bem-sucedido na tentativa 1 (sem retries)                             | `attempt = 1`, `retry_total_delay_ms = 0`, nenhum `ApiRetryEvent` emitido, métrica de detalhamento registra `request_setup_ms` próximo de 0                                                                                |
| Modo de retry persistente com 50+ tentativas                                | 50+ registros `ApiRetryEvent` emitidos (limite fora do escopo adiado); span LLM `attempt = 51`, `retry_total_delay_ms = soma de todos os delays`. Operador vê visão agregada no span; detalhes completos por tentativa nos spans de ponte de log |
| Chamador não-LLM de `retryWithBackoff` (channels/weixin)                    | Nenhum `onRetry` registrado; apenas o `debugLogger.warn` existente é disparado. Nenhum `ApiRetryEvent`; nenhuma métrica de detalhamento (o chamador não é um site LLM)                                                      |
| `endLLMRequestSpan` chamado duas vezes (corrida entre abort e erro)         | O guardião da Fase 1.5 em `activeSpans.delete()` retorna cedo na segunda chamada; `recordApiRequestBreakdown` está dentro do guardião, registrado exatamente uma vez                                                       |
| Chunk `message_start` da Anthropic chega antes do conteúdo                   | `hasUserVisibleContent` retorna false para ele (sem partes com text/functionCall/etc.); TTFT não é acionado até o chunk subsequente `content_block_delta`                                                                 |
| Primeiro chunk da OpenAI com `delta.content` vazio mas apenas `role`        | `hasUserVisibleContent` retorna false; TTFT não é acionado até o primeiro chunk com delta não vazio                                                                                                                       |
| Resposta apenas com chamada de ferramenta (sem texto)                       | O primeiro chunk com a Parte `functionCall` aciona o TTFT; `output_tokens_per_second` calculado com base na contagem de tokens da chamada de ferramenta                                                                    |
| Subagentes concorrentes (3 chamadas em andamento)                            | Cada closure de chamada tem seu próprio `attemptStart`, `ttftMs`, `attemptStartTimes`. Cada span por chamada recebe seus próprios metadados em `endLLMRequestSpan`. Sem intercalação (D2)                                  |
| Retries em nível de SDK dentro do openai-sdk (`maxRetries=3`)               | Invisível para a telemetria do qwen-code — acontece inteiramente dentro do SDK antes que o retryWithBackoff veja a requisição. `attempt` reflete apenas tentativas do retryWithBackoff. Fora do escopo (veja Fora do escopo)                              |
| Renomeação da especificação de `gen_ai.server.time_to_first_token` antes de chegar a Stable | Atualização em um único arquivo: `session-tracing.ts:endLLMRequestSpan`. O nativo do qwen-code `ttft_ms` permanece autoritativo — sem impacto downstream                                                                    |
| Requisição LLM do subagente                                                  | O pai é o span do subagente (Fase 3). Os campos da Fase 4 aninham-se corretamente. Agregações agrupadas por `qwen-code.subagent.id` fornecem desempenho LLM por subagente — design-doc-future, fácil acompanhamento         |
| Modelo de raciocínio com longos blocos de pensamento                        | A primeira Parte `thought` aciona o TTFT; `sampling_ms` inclui ambas as fases de pensamento e resposta. Divisão em métricas separadas adiada                                                                               |

## Rollback

A mudança é aditiva no nível de OTel e métrica — cada novo atributo é opcional, cada novo evento é uma nova classe. Dashboards existentes que não filtram pelos novos campos continuam funcionando inalterados.

Mudanças que afetam o comportamento:

- Novo LogRecord `ApiRetryEvent` começa a fluir → o volume de log aumenta proporcionalmente à taxa de retry (tipicamente <1% das requisições fazem retry). Mitigue amostrando o LogRecord na camada SDK se necessário.
- Nova métrica de detalhamento `qwen-code.api.request.breakdown` começa a produzir séries temporais → leve aumento de cardinalidade do Prometheus (`{model, phase}` — limitado).
- O atributo derivado `output_tokens_per_second` pode parecer incomum em dashboards filtrando 'todos os atributos' — documente.

Caminho de rollback: reverter o PR único (ou cada um de 4a/4b/4c independentemente). Todos os novos campos usam defaults defensivos (undefined / 0) e não alteram a estrutura do span.

## Sequenciamento

- **Após a Fase 3 (#4410, em revisão)**: não é uma dependência obrigatória. Os atributos da Fase 4 se anexam aos spans `qwen-code.llm_request` independentemente de estarem sob um pai `qwen-code.subagent` (Fase 3) ou `qwen-code.interaction` (Fase 1). Recomendo que a Fase 3 seja aprovada primeiro para que a agregação por tentativa sob as subárvores de subagente funcione naturalmente.
- **Independente de #4384** (propagação de saída de `traceparent` + `X-Qwen-Code-Session-Id`). Eles tocam a camada HTTP; a Fase 4 toca a camada de stream/retry/métrica.
- **Independente do acompanhamento de compressão de chat `clearDetailedSpanState`** (acompanhamento de #4097). Superfície diferente.

## Perguntas em aberto

1. **Semântica de disparo do callback `onRetry`**: invocado **antes** do sleep de backoff (proposta atual) ou **depois** (quando a próxima tentativa está prestes a começar)? Antes é mais simples — o callback tem todas as informações imediatamente; depois exigiria capturar o delay recém-concluído separadamente. Pré-sleep é a recomendação; documente no contrato do callback.
2. **Tempo por tentativa no span LLM**: devemos adicionar um array `attempt_durations_ms: number[]`? OTel suporta atributos de array de primitivos. Útil para diagnósticos de "qual tentativa de N foi lenta". Adie até que dados de produção mostrem demanda — os spans de ponte de log já carregam o equivalente.
3. **Limite de emissão do modo de retry persistente**: a partir de qual limiar `attempt > N` devemos começar a amostrar? `N = 5` depois 1 em 10? `N = 10` depois apenas resumo? Adie até termos dados de volume de produção.
4. **Fase `TOKEN_PROCESSING`**: manter o valor enum dormente ou conectá-lo a algo (ex.: tempo de consolidação)? Adie — espere por um caso de uso real.
5. **Resumos LLM em nível de subagente**: acompanhamento trivial assim que a Fase 4 for implementada — somar `ttft_ms`/`output_tokens`/`input_tokens` por subárvore de subagente. Não está no escopo da Fase 4, mas o fluxo de dados possibilita isso.