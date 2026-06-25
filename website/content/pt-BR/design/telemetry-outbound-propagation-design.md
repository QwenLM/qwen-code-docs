# Telemetria: Propagação de Contexto de Rastreamento e Cabeçalho de ID de Sessão para Saída

> Issue correspondente: [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> Issue pai: [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 observabilidade mais profunda)
> PR anterior: #4367 (atributos de recurso — mesclado em 2026-05-21, commit `64401e1`)
> Baseado no branch main do qwen-code em 2026-05-21 + código-fonte do claude-code verificado diretamente

## Histórico de Revisão

| Revisão | Data       | Gatilho                                       | Resumo                                                                                                                                                                                                                                                                              |
| ------- | ---------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1      | 2026-05-21 | Rascunho inicial                              | Broadcast total: todas as requisições LLM de saída incluem `X-Qwen-Code-Session-Id` + `traceparent`                                                                                                                                                                                 |
| R2      | 2026-05-22 | Revisão wenshao R2/R3                         | Segurança de borda: normalização de URL, correspondência de porta, alinhamento de aspas, try/catch no staticCorrelationHeaders, fallback de host:port strip                                                                                                                          |
| R3      | 2026-05-23 | LaZzyMan REQUEST_CHANGES                      | **Alteração semântica significativa**: o escopo padrão de `X-Qwen-Code-Session-Id` é reduzido para uma lista de permissões de host first-party (Alibaba/DashScope). Veja §11                                                                                                        |
| R4      | 2026-05-25 | Acompanhamento LaZzyMan round-8 (confusão de escopo) | **Escopo do PR drasticamente reduzido**: Este PR agora contém apenas o span HTTP do cliente + proteção de loop OTLP; `traceparent` desligado por padrão (NoopTextMapPropagator); novo namespace de nível superior `outboundCorrelation.*` para alternância de segurança relacionada; toda a máquina de `X-Qwen-Code-Session-Id` implementada no R3 é **removida deste PR**, movida para um PR de acompanhamento independente. Veja §12 |

**Aviso especial**: Ao ler §3.1 (Objetivos) / §3.2 (Não objetivos) / §4.3 (Design da Parte B) / §4.4 (Impacto no schema de configuração) / §5 (Lista de alterações de arquivos) / §9 (Comparação com claude-code) / §10 (Trabalho futuro) / §11 (Escopo da lista de permissões de host do R3), consulte também §12 — **A revisão R4 torna a afirmação de R1-R3 de que "este PR implementa simultaneamente traceparent + session id header" inválida**: Este PR agora é apenas para observabilidade de telemetria + uma alternância independente de contexto de rastreamento de saída; todo o trabalho de cabeçalho de correlação de saída (incluindo a lista de permissões de host do R3) é movido integralmente para um PR de acompanhamento independente. O código do trabalho do R3 não foi desperdiçado; pode ser reutilizado no PR de acompanhamento.

## 1. Contexto

A #4367 resolveu **atributos e cardinalidade na telemetria emitida** (operadores podem adicionar tags como `user.id`/`tenant.id` a spans/logs/métricas). Mas há uma coisa que ela não abordou: **cabeçalhos HTTP de requisições LLM de saída**. Hoje, as requisições do qwen-code para DashScope / OpenAI / Gemini / Anthropic **não carregam nenhum cabeçalho de correlação entre processos** — nem o `traceparent` da W3C, nem um session id.

Consequências:

1. O contexto de rastreamento (trace context) é interrompido no limite do processo qwen-code. Se o serviço de modelo (ex.: DashScope integrado com ARMS Tracing) tiver sua própria instrumentação OTel, os spans que ele gera ficam independentes dos traces do qwen-code; a árvore de trace ponta a ponta não existe.
2. Não há session id no fio (wire). Para associar métricas/logs do qwen-code com logs do lado do servidor, é necessário fazer correspondência offline por trace id ou timestamp, o que é muito menos simples do que ler diretamente o cabeçalho.
3. Falta um span HTTP do lado do cliente no trace local. Hoje só é possível ver o tempo total de `api.generateContent`, sem conseguir ver TTFB de rede / tamanho do corpo da resposta / número de tentativas.

## 2. Situação Atual

### 2.1 Apenas `HttpInstrumentation` está habilitado

`packages/core/src/telemetry/sdk.ts:330`:

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` só hook os módulos `http`/`https` nativos do Node, **não** cobre o caminho `globalThis.fetch` / undici.

### 2.2 Ambos os SDKs LLM usam fetch / undici

| SDK                                              | Implementação HTTP                                                                                                                               | Coberto por `HttpInstrumentation` |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `openai@5.11.0`                                  | `globalThis.fetch` (Node 18+ ou seja, undici). Evidência: erro em `node_modules/openai/internal/shims.mjs` indicando `'fetch' is not defined as a global` | ❌                                |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`. Evidência: chamada a `new Headers()` dentro de `dist/node/index.mjs`                                      | ❌                                |
| `@anthropic-ai/sdk` (anthropicContentGenerator) | Também baseado em fetch                                                                                                                          | ❌                                |

### 2.3 Nenhuma propagação manual no código

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ Vazio. Não há chamadas a `propagation.inject()`, nenhuma injeção manual de traceparent.
### 2.4 Status atual dos `defaultHeaders` por provider

Família OpenAI (usando SDK `openai`):

Todos os sub-providers OpenAI `extends DefaultOpenAICompatibleProvider`. **O comportamento do override de `buildHeaders` é dividido em dois tipos** (verificado por grep audit):

| Provider   | Arquivo               | Comportamento `buildHeaders()`                                                                      | Impacto                                         |
| ---------- | --------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Classe base | `default.ts:63-74`    | Fornece `{ 'User-Agent' }` + customHeaders                                                          | Altere aqui                                     |
| DashScope  | `dashscope.ts:110-124`| **`override` mas não chama `super`** — retorna um novo objeto `User-Agent` + `X-DashScope-*`       | **Deve ser alterado separadamente aqui**, caso contrário o header de correlação é perdido |
| OpenRouter | `openrouter.ts:20-30` | `override` mas **primeiro `const baseHeaders = super.buildHeaders()`**                              | Alterar a classe base herda automaticamente ✅    |
| DeepSeek   | `deepseek.ts`         | Não faz override de `buildHeaders` (apenas override de `buildRequest` / `getDefaultGenerationConfig`) | Alterar a classe base herda automaticamente ✅    |
| Minimax    | `minimax.ts`          | Mesmo que deepseek                                                                                  | Herda automaticamente ✅                         |
| Mistral    | `mistral.ts`          | Mesmo que deepseek                                                                                  | Herda automaticamente ✅                         |
| ModelScope | `modelscope.ts`       | Mesmo que deepseek                                                                                  | Herda automaticamente ✅                         |

→ **Família OpenAI precisa modificar 2 arquivos**: `default.ts` e `dashscope.ts`. Os outros 5 herdam automaticamente.

Google Gemini:

| Provider | Arquivo                         | Caminho de injeção de header                                         |
| -------- | ------------------------------- | -------------------------------------------------------------------- |
| Gemini   | `geminiContentGenerator.ts:59`  | `new GoogleGenAI({ httpOptions: { headers } })` — suporte nativo do SDK |

Anthropic:

| Provider  | Arquivo                                                                                              | Caminho de injeção de header |
| --------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (`defaultHeaders` arg to `new Anthropic`) | `defaultHeaders`             |

**Total de 4 pontos de construção do SDK** precisam injetar o header session id. Todos os SDKs já suportam `defaultHeaders` / `httpOptions.headers`, sem necessidade de fetch wrapper.

### 2.5 Configurações existentes de proxy e fetch

`provider/default.ts:87-89`:

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` retorna `{ fetch: customFetch }` ou similar quando o usuário configura proxy, acionando `setGlobalDispatcher(new ProxyAgent(...))` (veja `config.ts:1126-1128`). **O modo dispatcher global do undici é compatível com `UndiciInstrumentation`** — ele coopera com o diagnostics de canal do undici através de monkey-patch de `globalThis.fetch`, sem depender de dispatcher específico.

## 3. Objetivos / Não objetivos

### 3.1 Objetivos

- Todas as requisições LLM de saída automaticamente incluem o header W3C `traceparent` (`W3CTraceContextPropagator` padrão do OTel SDK)
- ~~Todas as~~ requisições LLM de saída incluem o header `X-Qwen-Code-Session-Id` (mesmo namespace de produto do claude-code) — **Revisão R3**: por padrão, injetado apenas para hosts first-party (Alibaba/DashScope), não enviado para providers terceiros por padrão; veja §11
- Evitar automaticamente trace do próprio endpoint do exportador OTLP (feedback loop)
- Adicionar uma camada precisa de client span para requisições LLM (separação entre tempo de rede vs tempo de modelo)
- Cobrir 4 pontos de construção de provider: classe base OpenAI, override do DashScope, Gemini, Anthropic
- Requisições streaming / modo proxy / cenários de retry não degradam
- Consistente com a filosofia de design do #4367: através de opções SDK-native como `defaultHeaders` — **Revisão R1**: devido a problemas de staleness, mudou para fetch wrapper; **Revisão R3**: dentro do fetch wrapper, adicionar um gate de host

### 3.2 Não objetivos

- **Header `baggage`**: o SDK padrão já suporta, mas qwen-code não chama `propagation.setBaggage()`, então não será enviado por padrão. Este design não ativa ativamente.
- **Herança da env var `TRACEPARENT` para subprocessos**: claude-code injeta `TRACEPARENT` em subprocessos Bash/PowerShell. O `BashTool` do qwen-code não faz isso. É um sub-issue follow-up independente.
- **Leitura de `TRACEPARENT` / `TRACESTATE` de entrada**: o modo `-p` do claude-code e o Agent SDK leem traceparent da env para continuar o trace do processo pai. qwen-code não faz isso. Follow-up independente.
- **`X-Qwen-Code-Request-Id`**: claude-code tem `x-client-request-id`, útil para correlação de tolerância a timeout. Não será feito nesta edição, pode ser um próximo sub-issue.
- **Propagator personalizado (B3 / Jaeger / X-Ray)**: o padrão W3C já cobre 99% dos cenários. Pode ser uma opção de configuração futura.
- ~~**Injeção seletiva por endpoint**: claude-code não envia traceparent para endpoints terceiros (Bedrock / Vertex); qwen-code não tem necessidade de distinção de terceiros, pode enviar uniformemente.~~ — **Revisão R3**: Esta afirmação foi refutada. A revisão do LaZzyMan apontou que qwen-code é um CLI open source que se conecta a múltiplos providers terceiros (OpenAI / Anthropic / OpenRouter / etc.), a analogia first-party→first-party do claude-code não se aplica; o header session id deve ser diferenciado por host. Veja §11. O `traceparent` ainda será injetado totalmente conforme o design R1 (header OTel padrão, e o trace id é o hash `sha256(sessionId)`), pode ser um follow-up independente para adicionar um toggle por destino (`telemetry.propagateTraceContext`).

## 4. Design

### 4.1 Camadas gerais

```
┌─ qwen-code process ────────────────────────────────────────────┐
│                                                                │
│  ┌─ session-tracing.ts ─┐                                     │
│  │ active span ctx      │                                     │
│  └──────┬───────────────┘                                     │
│         │                                                      │
│         ▼                                                      │
│  ┌─ propagation.inject() (called by undici instrumentation) ─┐│
│  │ writes `traceparent: 00-<traceId>-<spanId>-01` to headers ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │   fetch() — undici, instrumented                        │  │
│  │   creates HTTP client span                              │  │
│  │   injects traceparent into request headers              │  │
│  │   (skipped via ignoreRequestHook if endpoint is OTLP)   │  │
│  └─────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         │   ┌─ defaultHeaders (per SDK constructor) ───────┐  │
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... } │  │
│         └───┴────────────────────────────────────────────────┘ │
│             │                                                  │
└─────────────┼──────────────────────────────────────────────────┘
              │
              ▼ outbound HTTP
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (existing User-Agent, X-DashScope-*, etc.)
```
Duas rotas de injeção independentes e não interdependentes:

| Layer                    | Quando injetado                      | Injetado por                                                     |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------- |
| `traceparent`            | A cada chamada fetch                 | `UndiciInstrumentation` automaticamente (do propagator padrão do OTel SDK) |
| `X-Qwen-Code-Session-Id` | Escrito uma vez em `defaultHeaders` na construção do SDK | Código da aplicação                                              |

### 4.2 Parte A — `traceparent` via instrumentação undici

**Ponto de alteração**：`packages/core/src/telemetry/sdk.ts`

```ts
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';

// ...
const otlpUrls = [
  config.getTelemetryOtlpEndpoint(),
  config.getTelemetryOtlpTracesEndpoint(),
  config.getTelemetryOtlpLogsEndpoint(),
  config.getTelemetryOtlpMetricsEndpoint(),
]
  .filter((u): u is string => !!u)
  .map((u) => u.replace(/\/$/, ''));

instrumentations: [
  new HttpInstrumentation(),
  new UndiciInstrumentation({
    ignoreRequestHook: (request) => {
      // request.origin = "https://collector:4318", request.path = "/v1/traces"
      const url = `${request.origin}${request.path}`;
      return otlpUrls.some((e) => url.startsWith(e));
    },
  }),
],
```

#### Por que `ignoreRequestHook` é necessário

O SDK OTel usa fetch para fazer POST dos dados para o coletor OTLP. Se não for ignorado, o UndiciInstrumentation criará um span também para as requisições de "envio de dados" → esse novo span seria enviado novamente → loop infinito / ruído massivo. Todo projeto OTel já esbarrou nesse problema, e a documentação do OTel recomenda explicitamente esse hook.

#### Propagator padrão

Quando o `NodeSDK` do OTel SDK não recebe `textMapPropagator`, o padrão é `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])`. Não é necessário configurar explicitamente.

#### Formato de `traceparent`

```
traceparent: 00-<32hex traceId>-<16hex spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               version (fixo 00)                            flags
```

55 bytes fixos, sem padding.

#### `tracestate` e `baggage`

- `tracestate`: só é repassado se vier de upstream; a injeção própria não o adiciona ativamente (comportamento do SDK OTel).
- `baggage`: só presente se `propagation.setBaggage(ctx, ...)` foi chamado. O qwen-code não chama, então não é enviado.

### 4.3 Parte B — `X-Qwen-Code-Session-Id` via fetch wrapper（OpenAI / Anthropic）+ headers estáticos（Gemini）

> **Revisão R3**：O design descrito abaixo aborda a solução de staleness do fetch wrapper e os 4 pontos de integração de providers — tudo isso é mantido. Mas o wrapper adicionou internamente uma barreira de host allowlist, e `staticCorrelationHeaders` também recebeu o parâmetro `destinationUrl`. O código de implementação mais recente com host gate e a allowlist padrão estão na §11.

#### Crítico：problema de staleness e escolha de solução

A abordagem ingênua (usar `defaultHeaders` diretamente com `getSessionId()` embutido) tem **um bug real**：

1. `pipeline.ts:60` na construção do contentGenerator, `this.client = this.config.provider.buildClient()` é executado uma vez; o `defaultHeaders` do cliente SDK captura o session id daquele momento.
2. O reset de sessão em `config.ts:1850` (acionado quando o usuário faz `/clear`) atualiza `this.sessionId` e chama `refreshSessionContext()`, mas **não reconstrói o contentGenerator**.
3. Chamadas LLM subsequentes ainda usam o cliente antigo → o cabeçalho wire ainda tem o session id antigo → correlação do backend fica desalinhada.

→ É necessário ler o session id **por requisição**, não embuti-lo no momento da construção.

#### Solução

```
                   ┌─ suporte a fetch ─┐   Solução
OpenAI SDK          │         ✅        │  fetch wrapper (lê sessionId por requisição) ✅
Anthropic SDK       │         ✅        │  fetch wrapper ✅
@google/genai SDK   │         ❌        │  static httpOptions.headers + aceita staleness
                   └──────────────────┘
```

A interface `HttpOptions` do `@google/genai` não suporta `fetch` (verificado via grep em `node_modules/@google/genai/dist/genai.d.ts`: apenas `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`). Portanto, Gemini usa headers estáticos, diferente de OpenAI/Anthropic — isso é uma **limitação conhecida**, veja §8.6.

#### Função auxiliar centralizada (fetch wrapper por requisição)

Novo arquivo `packages/core/src/telemetry/llm-correlation-fetch.ts`：

```ts
import type { Config } from '../config/config.js';

/**
 * Wrap a fetch implementation so every outbound request gets correlation
 * headers (`X-Qwen-Code-Session-Id`) populated from the **current** session
 * id, not the value captured when the SDK client was constructed.
 *
 * Matches claude-code's pattern (src/services/api/client.ts:370-390 —
 * `buildFetch()`). Per-request injection is necessary because `/clear`
 * resets the session id mid-process; SDK clients (and their static
 * `defaultHeaders`) are NOT recreated on reset.
 *
 * Caller responsible for choosing the base fetch — usually
 * `runtimeOptions?.fetch ?? globalThis.fetch` so proxy-aware fetch is
 * preserved when ProxyAgent is in use.
 *
 * If telemetry is disabled, returns baseFetch unchanged (no correlation
 * header is added, matching the privacy stance of §3.1).
 */
export function wrapFetchWithCorrelation(
  baseFetch: typeof fetch,
  config: Config,
): typeof fetch {
  return async function correlationFetch(input, init) {
    if (!config.getTelemetryEnabled()) {
      return baseFetch(input, init);
    }
    const sid = config.getSessionId();
    if (!sid) {
      // Defensive: empty header value is rejected by some HTTP middleware.
      // Skip injection rather than send `X-Qwen-Code-Session-Id: `.
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Qwen-Code-Session-Id', sid);
    return baseFetch(input, { ...init, headers });
  };
}
```
Companion helper para os SDKs que só aceitam headers estáticos (Gemini):

```ts
/**
 * Static correlation headers. Captures the session id at call time —
 * **subject to staleness** if the host SDK keeps these headers in a
 * captured-at-construction slot (e.g. `@google/genai`'s `httpOptions.headers`).
 * Prefer `wrapFetchWithCorrelation` whenever the SDK exposes a `fetch` hook.
 */
export function staticCorrelationHeaders(
  config: Config,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  return { 'X-Qwen-Code-Session-Id': config.getSessionId() };
}
```

#### Ponto de integração 1: `provider/default.ts` (classe base OpenAI)

Alterações em `buildClient()` — compor o `runtimeOptions.fetch` existente (proxy) com nosso wrapper:

```ts
buildClient(): OpenAI {
  // ... existente ...
  const runtimeOptions = buildRuntimeFetchOptions('openai', this.cliConfig.getProxy());
  const baseFetch =
    (runtimeOptions as { fetch?: typeof fetch } | undefined)?.fetch
    ?? globalThis.fetch;
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout,
    maxRetries,
    defaultHeaders,
    ...(runtimeOptions || {}),
    // After spread, override `fetch` so our correlation wrapper wraps the
    // proxy-aware fetch (or globalThis.fetch when no proxy).
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` inalterado.

#### Ponto de integração 2: `provider/dashscope.ts` (override)

`buildClient()` mesmo padrão de composição (já faz override de buildClient). `buildHeaders()` inalterado.

#### Ponto de integração 3: `geminiContentGenerator/index.ts` (factory, NÃO construtor)

**Corrigindo a especificação excessiva do design anterior**: o construtor `geminiContentGenerator.ts` **não** precisa de mudança de assinatura. A função factory em `index.ts:48` já recebe `gcConfig: Config` (linha 33 já usa `gcConfig?.getUsageStatisticsEnabled()`), basta no factory fazer o merge dos headers estáticos de correlação dentro de `httpOptions.headers`:

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... x-gemini-api-privileged-user-id existente ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← adicionado
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) inalterado
```

Zero alteração de assinatura.

#### Ponto de integração 4: `anthropicContentGenerator.ts`

O SDK do Anthropic também aceita `fetch` customizado (já está usando `buildRuntimeFetchOptions`). Basta envolver o fetch no caminho de `buildClient`, da mesma forma que no OpenAI default.ts. `buildHeaders` inalterado.

#### Cadeia de prioridade

Inalterada: os `customHeaders` do usuário ainda vencem no merge de `defaultHeaders` (ver discussão de spoofing na §8.2). O `X-Qwen-Code-Session-Id` injetado pelo wrapper do fetch é adicionado **após** a lista de headers do SDK no objeto final `Headers` — com a semântica de `Node Headers.set()`, isso substitui qualquer header com o mesmo nome (incluindo aqueles escritos nos customHeaders do usuário).

**Para OpenAI/Anthropic (caminho do wrapper de fetch)**: correlação > customHeaders > defaults do SDK.
**Para Gemini (caminho de headers estáticos)**: customHeaders > correlação > defaults do SDK (mantendo a ordem de spread existente).

A diferença é que no caminho do wrapper de fetch, o spoofing não é mais possível (o wrapper de fetch é executado após os headers do SDK). Isso é um **subproduto da correção de bug**, não um aperto intencional — mas é mais seguro. Deve ser explicitado na §8.2.

### 4.4 Impacto no schema de configuração

~~**Quase nenhum**. Este design não introduz nova configuração~~ — **Revisão R3**: foi introduzida uma nova configuração `telemetry.sessionIdHeaderHosts: string[]`, para sobrescrever a lista branca padrão de hosts first-party. O schema já foi adicionado em `packages/cli/src/config/settingsSchema.ts`, com descrição e sintaxe de override (`["*"]` restaura broadcast / `[]` desativa completamente / array customizado) na §11. O texto a seguir descreve apenas o cenário anterior ao R3:

- A injeção de `traceparent` é acionada pelo telemetry ativado (já existia toggle)
- A injeção de `X-Qwen-Code-Session-Id` também é acionada pelo telemetry ativado
- A URL do OTLP em `ignoreRequestHook` já é lida da config existente

Configurações futuras (**fora de escopo**):

- `telemetry.outboundCorrelationHeader`: nome customizado do header (padrão `X-Qwen-Code-Session-Id`)
- `telemetry.outboundPropagationDisabled`: desligar globalmente (se o serviço LLM for estrito com headers desconhecidos)
- ~~Toggle de escopo por destino~~ — **R3 já implementado**, veja §11

## 5. Lista de alterações de arquivos

| Arquivo                                                                        | Tipo de alteração | Descrição                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                   | Adicionar dependência | `@opentelemetry/instrumentation-undici`                                                                                                                                             |
| `packages/core/src/telemetry/sdk.ts`                                           | Modificação       | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                                      |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                         | Novo arquivo      | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (fallback Gemini)                                                                                    |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`            | Modificação       | `buildClient()` em `new OpenAI({...})` adicionar `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)`                                                                            |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`          | Modificação       | O mesmo que acima (override de `buildClient`)                                                                                                                                       |
| `packages/core/src/core/geminiContentGenerator/index.ts`                       | Modificação       | Na função factory, fazer merge de `staticCorrelationHeaders(gcConfig)` dentro de `httpOptions.headers` (**quem chama já tem Config, zero alteração de assinatura** — corrigindo especificação excessiva anterior) |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | Modificação       | No caminho de `buildClient`, usar `wrapFetchWithCorrelation` para envolver a opção `fetch` do SDK                                                                                   |
**Explícito auditado mas sem necessidade de alteração** (para evitar que o revisor suspeite de caminho faltante):

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator`, usa `DashScopeOpenAICompatibleProvider`, **herda automaticamente a alteração do buildClient de dashscope.ts**. Todo o fluxo OAuth do Qwen se beneficia da mesma forma.
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — padrão wrapper, não constrói client SDK (ele envolve outros contentGenerator para logging de telemetria), sem necessidade de alteração.
- `packages/core/src/core/contentGenerator.ts` — ponto de entrada da factory, não mantém client.

| `packages/core/src/telemetry/sdk.test.ts` | Modificado | Adiciona registro do instrumentation undici + teste de `ignoreRequestHook` |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | Novo arquivo | Testes unitários de comportamento telemetry-on/off + verificação de sessionId por requisição (crítico: após reset de sessão, o wrapped fetch lê o novo id) |
| `*.test.ts` de cada provider | Modificado | Afirma que a opção `fetch` na construção do SDK é a versão wrapped (OpenAI/Anthropic); afirma que `httpOptions.headers` na construção do Gemini contém `X-Qwen-Code-Session-Id` |
| `docs/developers/development/telemetry.md` | Modificado | Adiciona seção "Trace context & session correlation propagation" |
| `docs/design/telemetry-outbound-propagation-design.md` | Este arquivo | Documento de design |

## 6. Divisão em PRs

Para facilitar a revisão, dividir em dois PRs (também pode ser um só, o tamanho permite):

### PR 1 — Injeção automática de `traceparent` (estrutural)

- Adicionar dependência `@opentelemetry/instrumentation-undici`
- Em `sdk.ts`, adicionar `UndiciInstrumentation` + `ignoreRequestHook`
- Testes: registro do SDK, endpoint OTLP não é traceado
- Fragmento de documentação

**Risco**: Baixo. Aditivo. Os spans de client existentes são um ganho líquido, não alteram a estrutura atual de spans.

### PR 2 — Header `X-Qwen-Code-Session-Id` (combinado com função helper)

- Novo arquivo `llm-correlation-headers.ts`
- Integração em 4 providers
- Testes: cada provider afirma que o header existe; quando telemetry-off, não é enviado
- Fragmento de documentação

**Risco**: Baixo–Médio. É preciso cuidado com a extensão da assinatura do construtor de `geminiContentGenerator`, que pode afetar os chamadores.

### PR 3 (Opcional) — Documentação + Verificação E2E

- Completar parágrafos em `telemetry.md`
- Adicionar script de verificação E2E (reutilizar padrão `/tmp/verify-telemetry-pr-4367.mjs`): executar fetch real + capturar header

Também pode ser mesclado ao PR 2.

### Ordem preferencial

PR 1 e PR 2 são tecnicamente **independentes** — não compartilham código. Mas **recomenda-se que PR 1 seja mesclado primeiro**:

- `traceparent` é um header **padrão** do OTel; qualquer collector/backend que entenda OTel o reconhece imediatamente → benefício imediato para o usuário
- `X-Qwen-Code-Session-Id` é um header **customizado do produto**; só tem valor se o backend estiver configurado para reconhecê-lo → benefício postergado
- Caso a revisão do PR 2 demore, o PR 1 já terá estabelecido o trace cross-process
- PR 1 é aditivo e estrutural (baixo risco), adequado para criar confiança inicial

## 7. Plano de testes

### 7.1 Teste unitário de `sdk.ts`

- ✅ `UndiciInstrumentation` está presente em `instrumentations` do `NodeSDK`
- ✅ `ignoreRequestHook` retorna true para `https://collector:4318/v1/traces`
- ✅ `ignoreRequestHook` retorna false para `https://dashscope.aliyuncs.com/...`
- ✅ Barra final e sem barra final são correspondidas corretamente

### 7.2 Teste unitário de `llm-correlation-fetch.ts`

**`wrapFetchWithCorrelation`**:

| Cenário                                                                         | Expectativa                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                                               | wrapped fetch = baseFetch (nenhum header adicional)                                   |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"                         | wrapped fetch emite `init.headers` contendo `X-Qwen-Code-Session-Id: abc-123`         |
| `init.headers` já contém `X-Qwen-Code-Session-Id: spoof`                        | Após wrapper, é sobrescrito com o sessionId real (caminho do fetch wrapper não permite spoof, §8.1) |
| **Após reset de sessão, wrapped fetch é chamado novamente**                     | **Lê o novo sessionId** (guarda de regressão para correção de stale)                  |
| baseFetch rejeita                                                               | wrapper propaga a rejeição, não engole                                               |

**`staticCorrelationHeaders`** (caminho Gemini):

| Cenário                                                        | Expectativa de retorno                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                              | `{}`                                                            |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"        | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                      |
| sessionId contém unicode (`會話-1`)                            | Retornado como está — a codificação do valor do header HTTP fica a cargo do SDK |
| sessionId é string vazia                                       | `{ 'X-Qwen-Code-Session-Id': '' }` — invariante de negócio, não validado nesta camada |

### 7.3 Testes de integração por provider

Em cada provider, adicionar nos testes de `buildHeaders()` / construção:

```ts
it('inclui X-Qwen-Code-Session-Id quando telemetry está ativado', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('omite X-Qwen-Code-Session-Id quando telemetry está desativado', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 Verificação E2E (tmux + servidor HTTP local)

⚠️ **Não** mockar `globalThis.fetch` para capturar headers: `UndiciInstrumentation` usa o hook do canal de diagnósticos do undici; fazer monkey-patching de `globalThis.fetch` pode ignorar completamente o instrumentation (dependendo da ordem dos patches), fazendo com que a injeção de `traceparent` não seja detectada. **O correto é iniciar um servidor HTTP local**, deixar o SDK fazer a requisição de verdade, e o servidor registrar os headers recebidos.
```javascript
// /tmp/verify-telemetry-pr-4367.mjs
// 仿照 `/tmp/verify-telemetry-pr-4367.mjs` 的 telemetry 验证脚本

import * as http from 'node:http';
import * as assert from 'node:assert/strict';
import { QwenCodeTelemetry, getTelemetry } from '@qwen-code/telemetry';
import OpenAI from 'openai';

// ------------------------------------------------------------
// 1. 本地服务器，捕获所有请求的 headers
// ------------------------------------------------------------
const capturedHeaders = [];

function createCaptureServer(port) {
  const server = http.createServer((req, res) => {
    capturedHeaders.push(req.headers);
    // 返回合法的空 OpenAI 响应（最小可解析）
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-3.5-turbo',
      choices: []
    }));
  });
  server.listen(port);
  return server;
}

// ------------------------------------------------------------
// 2. OTLP collector mock 服务器（验证 ignoreRequestHook）
// ------------------------------------------------------------
const otlpCapturedHeaders = [];

function createOtlpMockServer(port) {
  const server = http.createServer((req, res) => {
    otlpCapturedHeaders.push(req.headers);
    res.writeHead(200);
    res.end('{}');
  });
  server.listen(port);
  return server;
}

// ------------------------------------------------------------
// 主测试
// ------------------------------------------------------------
async function runTest() {
  const port1 = 18999;  // 捕获 OpenAI 请求
  const port2 = 19000;  // OTLP collector mock

  const server1 = createCaptureServer(port1);
  const server2 = createOtlpMockServer(port2);

  // 等待服务器就绪
  await new Promise(r => setTimeout(r, 100));

  // 初始化 telemetry
  const telemetry = getTelemetry();
  telemetry.setup({
    outfile: '/tmp/telemetry-out.jsonl',
    // 假设 telemetry 内部会使用 OTLP exporter，我们需要把 OTLP endpoint 指向 mock
    otlpEndpoint: `http://127.0.0.1:${port2}/v1/traces`,
  });
  telemetry.start();
  await new Promise(r => setTimeout(r, 50));

  // 配置 OpenAI 客户端，baseURL 指向本地捕获服务器
  const client = new OpenAI({
    apiKey: 'test-key',
    baseURL: `http://127.0.0.1:${port1}/v1`,  // 注意路径对应 OpenAI 的 /v1/chat/completions
  });

  // ------------------------------------------------------------
  // 3. 触发一次 chat.completions.create
  // ------------------------------------------------------------
  const response1 = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'hello' }],
  });

  // ------------------------------------------------------------
  // 4. 断言 headers
  // ------------------------------------------------------------
  const reqHeaders = capturedHeaders[0];
  assert.ok(reqHeaders, '应该有至少一个请求被捕获');
  assert.match(reqHeaders.traceparent, /^00-/,
    'traceparent 应以 00- 开头');
  assert.ok(reqHeaders['x-qwen-code-session-id'],
    '应包含 X-Qwen-Code-Session-Id');

  // 记录 session id 供后续 verif
  const sessionId1 = reqHeaders['x-qwen-code-session-id'];

  // ------------------------------------------------------------
  // 5. 验证 OTLP 上报不注入 traceparent
  // ------------------------------------------------------------
  // 等待 OTLP exporter 发送数据（可能需要一些时间 flush）
  await new Promise(r => setTimeout(r, 500));
  for (const otlpHeaders of otlpCapturedHeaders) {
    assert.equal(otlpHeaders.traceparent, undefined,
      'OTLP 请求不应包含 traceparent');
  }

  // ------------------------------------------------------------
  // 6. Staleness 验证
  // ------------------------------------------------------------
  // 步骤 a: 发送请求1（已在上方完成）
  // 步骤 b: 重置 session
  await telemetry.config.resetSession();
  await new Promise(r => setTimeout(r, 50));

  // 步骤 c: 发送请求2
  const response2 = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: 'world' }],
  });

  // 步骤 d: 断言请求2 的 session id 是新值
  const reqHeaders2 = capturedHeaders[1];
  assert.ok(reqHeaders2, '应有第二个请求被捕获');
  const sessionId2 = reqHeaders2['x-qwen-code-session-id'];
  assert.notEqual(sessionId2, sessionId1,
    'resetSession 后 session id 应不同');

  console.log('✅ 所有断言通过');

  // 清理
  server1.close();
  server2.close();
  await telemetry.shutdown();
}

runTest().catch(err => {
  console.error('❌ 测试失败', err);
  process.exit(1);
});
```

> **备注（实施时需注意）**  
> - Streaming completion（`stream: true`）的 fetch 应确保 span 正常结束、无泄漏、流不被截断。可在本脚本基础上扩展一个测试分支，但此处未包含。  
> - Proxy mode (`ProxyAgent`) 与 instrumentation 同时启用时，`ignoreRequestHook` 仍按 endpoint 字符串匹配，proxy 不影响。  
> - 重试（`maxRetries`）下每次重试产生独立 client span，但共享同一个 `traceparent` parent。该行为由 SDK 控制，本设计不强制。  
> - 实际运行前需安装依赖：`npm install @qwen-code/telemetry openai`。
**Documentação a ser explicada ao usuário**: ao usar o provider Gemini, se `/clear` for seguido imediatamente por uma chamada LLM, o session id no wire naquele momento ainda é o antigo. Pode ser corrigido indiretamente por trace correlation (spans/logs já terão o novo `session.id`).

Deve-se abrir uma sub-issue de acompanhamento separada para rastrear a opção A.

## 9. Comparação com claude-code

| Dimensão                         | claude-code                                                                                                                                          | qwen-code (este design)                                                                                                                                                       | Justificativa                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Nome do header Session id        | `X-Claude-Code-Session-Id` (prefixo do produto)                                                                                                      | `X-Qwen-Code-Session-Id` (prefixo do produto)                                                                                                                                 | ✅ Mesma estratégia de namespace                                                                                                  |
| Mecanismo de injeção do Session id | `defaultHeaders` do SDK (`client.ts:108`) + wrapper `buildFetch()` customizado (`client.ts:370-390`, injeção de `randomUUID()` por requisição como `x-client-request-id`) | OpenAI/Anthropic via fetch wrapper (lê session id por requisição, evitando stale após `/clear`); Gemini via `httpOptions.headers` estático (limitação do SDK)                  | Alinhado ao padrão de fetch wrapper do claude-code. claude-code também usa fetch wrapper para adicionar `x-client-request-id` por requisição |
| Persistência do Session id       | claude-code não tem reset de sessão no estilo `/clear`; sessão = processo                                                                            | Tem reset com `/clear` → caminho do fetch wrapper acompanha automaticamente; caminho de headers estáticos fica stale (§8.6)                                                    | Complexidade exclusiva do qwen-code                                                                                               |
| Codificação do Session id        | HTTP header (não baggage)                                                                                                                            | HTTP header                                                                                                                                                                   | ✅ O mesmo — amigável para backend                                                                                                |
| Injeção de `traceparent`         | Código fechado; docs públicas indicam existência; repo open-source não tem referência a `propagation.inject` / `UndiciInstrumentation`               | `@opentelemetry/instrumentation-undici` automático                                                                                                                            | Como a implementação do claude-code não é visível. Escolhemos o caminho recomendado pelo OTel, mais leve.                         |
| Escopo de envio de `traceparent` | Apenas API da Anthropic (first-party); não enviado para Bedrock/Vertex/Foundry                                                                       | Enviado para todos os fetches de saída (padrão W3C; trace id é hash `sha256(sessionId)`). **Revisão R3**: header session id é injetado apenas na whitelist first-party (Alibaba/DashScope); por padrão não enviado a terceiros. Ver §11 | Após R3, o header de sessão do qwen-code tem a mesma semântica first-party-only do claude-code; `traceparent` ainda aguarda follow-up de toggle por destino |
| `x-client-request-id` (aleatório) | Sim, automático                                                                                                                                      | Não implementado agora (sub-issue de acompanhamento independente tem mais valor)                                                                                               | Controle de escopo                                                                                                                |
| Variável de ambiente `TRACEPARENT` em subprocessos | Documentação reconhece existência (implementação fechada)                                                                                            | Não implementado (acompanhamento independente)                                                                                                                                | Controle de escopo                                                                                                                |
| Leitura de `TRACEPARENT` de entrada | Documentação reconhece existência (modo `-p` / Agent SDK)                                                                                            | Não implementado (acompanhamento independente)                                                                                                                                | Controle de escopo                                                                                                                |
**verified vs documented anotações**：

| claim                                           | status de verificação                                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders` | ✅ Open source `src/services/api/client.ts:108` lido                                                                                                                        |
| `x-client-request-id` via fetch wrapper         | ✅ Open source `src/services/api/client.ts:370-390` lido                                                                                                                    |
| Injeção de `traceparent`                        | ⚠️ Mencionado apenas em docs.claude.com/docs/en/monitoring-usage.md; repo open source `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` retorna vazio |

## 10. Trabalho Futuro

Acompanhando em #3731 P3, este design **não** inclui, mas está relacionado a:

- **`X-Qwen-Code-Request-Id`** UUID aleatório por requisição (equivalente do claude-code: `x-client-request-id`). Útil para correlação de timeout/erros de timeout — quando ocorre timeout, o servidor pode ainda não ter atribuído um request id; o id enviado primeiro pelo cliente é o único meio de correlação. Após a revisão R3, esta sugestão se torna mais significativa: UUID por requisição não tem o risco de "perfilamento de comportamento entre requisições", podendo servir como "header de suporte/depuração enviado a todos os provedores LLM".
- **Alternância de escopo por destino do `traceparent`** — a revisão R3 tratou apenas o escopo do header session id; o `traceparent` ainda é injetado em todas as fetch de saída. Podemos adicionar `telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'`, usando a mesma allowlist da §11 para determinar o comportamento.
- **Correção de lazy-invalidate para stale session id do Gemini** (opção A da §8.6): marcar `contentGenerator` como sujo ao `/clear`, recriá-lo lazy na próxima chamada LLM. Permitir que o caminho Gemini também usufrua da atualidade em tempo real do wrapper fetch.
- **Env `TRACEPARENT` para subprocessos**: injetar env ao executar subprocessos do `BashTool`, permitindo que ferramentas externas continuem a trace. Precisa de análise separada do ciclo de vida da execução de tools.
- **`TRACEPARENT` de entrada**: ler env no modo `--prompt`, permitindo que CI / orquestradores externos conectem o qwen-code a uma trace maior.
- **Nome configurável do `correlationHeader`**: permitir que operações de empresa customizem o header (padrão `X-Qwen-Code-Session-Id`).
- **Estratégia de propagação de `baggage`**: definir ativamente baggage para que `user.id` / `tenant.id` etc. também sejam propagados via baggage para downstream. Não será feito nesta iteração, aguardar requisitos claros.

## 11. Revisão R3 — Escopo com Host-Allowlist para `X-Qwen-Code-Session-Id`

> Gatilho: [REQUEST_CHANGES de LaZzyMan na PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Commits de implementação: `1c8528a56` (implementação central) + `cb162e716` (fail-closed de Vertex baseUrl + tolerância para trim de `["*"]`)

### 11.1 Gatilho e Argumentação

O design R1 injetava `X-Qwen-Code-Session-Id` em **todas** as requisições LLM de saída, controlado apenas por `telemetry.enabled`. A review de LaZzyMan apontou três problemas progressivos:

1. **Desalinhamento de rótulo**: `feat(telemetry):` + caminho `telemetry/` + gate `getTelemetryEnabled()` faziam o usuário entender razoavelmente que "os dados de observabilidade próprios fluem para o próprio collector". Mas `X-Qwen-Code-Session-Id` não chega ao backend OTLP; ele viaja nas requisições da API LLM enviadas para DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral. Duas decisões diferentes de saída de dados atreladas a uma única chave.

2. **Analogia com claude-code não se sustenta**: R1 na §9 "alinhou" a estratégia de namespace e o padrão fetch wrapper com o claude-code. Mas claude-code é parte da Anthropic → parte da Anthropic (single vendor, single direction), enquanto qwen-code é um CLI open source → múltiplos provedores terceiros. "Um UUID estável cross-request transmitido para todos os terceiros" é uma questão que R1 não respondeu diretamente.

3. **traceparent é outro canal da mesma impressão digital**: trace id = `sha256(sessionId).slice(0, 32)`, continua sendo um identificador estável por sessão para o receptor (irreversível após hash, mas estável na mesma sessão).

LaZzyMan classificou a severidade: session id `high` / traceparent `medium`.

### 11.2 Resumo da Solução

**Reduzir o escopo padrão para hosts first-party**. Adicionar uma nova config:

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // restaura comportamento de broadcast do R1
  "sessionIdHeaderHosts": []                              // desliga completamente o header
  "sessionIdHeaderHosts": ["api.mycompany.com",
                           "*.gateway.mycompany.internal"]
}
```

Valor padrão (de `packages/core/src/telemetry/trusted-llm-hosts.ts:DEFAULT_SESSION_ID_HEADER_HOSTS`):

```
dashscope.aliyuncs.com
dashscope-intl.aliyuncs.com
*.dashscope.aliyuncs.com
*.dashscope-intl.aliyuncs.com
*.alibaba-inc.com
*.aliyun-inc.com
```

A semântica desse conjunto é "provedor LLM, backend ARMS Tracing, mesma entidade legal da distribuição qwen-code" — ou seja, o equivalente para qwen-code da relação single-vendor / single-direction do claude-code. Provedores terceiros (OpenAI / Anthropic / OpenRouter / etc.) **não** recebem o header por padrão.

### 11.3 Sintaxe de Pattern (intencionalmente mínima)

`matchesTrustedHost(hostname, patterns)` suporta apenas dois modos, alinhado com `DashScopeOpenAICompatibleProvider.isDashScopeProvider`:

- bare hostname → correspondência exata (case-insensitive)
- `*.suffix` → corresponde ao próprio `suffix` **E** a qualquer subdomínio; ancorado por ponto para rejeitar vetores de ataque typo-suffix como `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld`

Não introduz regex, nem globbing consciente de porta/esquema — para que as strings nas configurações tenham exatamente a semântica que parecem ter.

### 11.4 Diferenças de Implementação vs R1

#### `wrapFetchWithCorrelation` (OpenAI / Anthropic)

O wrapper do R1 tinha apenas dois gates: telemetry-enabled + sessionId. O R3 insere um terceiro gate entre eles:

```ts
const trustedHosts =
  config.getTelemetrySessionIdHeaderHosts?.() ??
  DEFAULT_SESSION_ID_HEADER_HOSTS;
const broadcastAll = trustedHosts.some((p) => p.trim() === '*');

return async function correlationFetch(input, init) {
  if (!config.getTelemetryEnabled()) return baseFetch(input, init);
  if (!broadcastAll) {
    const host = extractRequestHost(input);
    if (!host || !matchesTrustedHost(host, trustedHosts)) {
      return baseFetch(input, init); // gate de host
    }
  }
  const sid = config.getSessionId();
  if (!sid) return baseFetch(input, init);
  // ... injeção de header
};
```
`trustedHosts` é capturado em um snapshot único no momento do wrap (diferente do "leitura por requisição em tempo real" do session id). Modificar `telemetry.sessionIdHeaderHosts` durante a execução exige recriar o `contentGenerator` para ter efeito. Escritas como `[" * "]` com espaços são tratadas via `.trim()` e viram broadcast, evitando que erros de digitação no `settings.json` silenciosamente degradem o comportamento.

#### `staticCorrelationHeaders` (Gemini)

Adicionar um parâmetro `destinationUrl?: string`:

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: não sabe o destino, não envia
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Integração com a fábrica Gemini

O SDK Gemini possui dois endpoints padrão invisíveis (`generativelanguage.googleapis.com` e `{region}-aiplatform.googleapis.com`, determinados por `vertexai`), e a camada de fábrica não consegue reconstruir exatamente um deles. A R3 opta por "se `config.baseUrl` não foi definido, passar `undefined`", fazendo com que o helper falhe de forma fechada → não envie o cabeçalho. Operadores que desejam correlação precisam definir explicitamente `baseUrl` (que é a mesma entrada usada pelo SDK para resolver o destino). Essa mudança evita que, ao adivinhar o destino do Vertex incorretamente, a lista de permissões seja acionada erroneamente.

### 11.5 Novos arquivos / novo código

| Arquivo                                                                                          | Descrição                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (NOVO)                                        | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                                              |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (NOVO)                                   | Testes unitários, incluindo vetores de ataque com sufixo TLD, IPv6 fail-closed, extração de porta/userinfo/query             |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                           | Adiciona proteção de host; `staticCorrelationHeaders` ganha parâmetro `destinationUrl`                                      |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                                      | Adiciona 8 casos para proteção de host; `mockConfig` usa `'hosts' in opts` para diferenciar "lista de permissões padrão" de "broadcast" |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`)                             | Repassa `sessionIdHeaderHosts`                                                                                              |
| `packages/core/src/config/config.ts`                                                             | `TelemetrySettings.sessionIdHeaderHosts` + getter `getTelemetrySessionIdHeaderHosts()`                                       |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                         | Passa `config.baseUrl` para o helper; fail-closed quando indefinido                                                         |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`                                    | Reescreve testes do Gemini com telemetry ativada para corresponder à nova semântica de fail-closed                          |
| `packages/cli/src/config/settingsSchema.ts`                                                      | Entrada do schema JSON para `sessionIdHeaderHosts`                                                                          |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                                     | Regenerado por `npm run generate:settings-schema`                                                                           |
| `docs/developers/development/telemetry.md`                                                       | Trecho "Session correlation header" reescrito + escopo padrão + sintaxe de sobrescrita                                      |

### 11.6 Respostas a cada argumento do LazzyMan

| Argumento do LazzyMan                    | Resposta da R3                                                                                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① Rótulo de telemetria deslocado         | **Resolvido**: No caso de uso do DashScope, o cabeçalho de session id é literalmente enviado para o backend ARMS Tracing (mesma entidade legal), e a semântica de `telemetry.enabled` fica alinhada                     |
| ② Identificador estável cross-vendor em broadcast | **Resolvido**: A lista de permissões padrão contém apenas hosts first-party do ecossistema Alibaba; broadcast é opt-in (`["*"]`)                                                                                |
| ③ `traceparent` é outro canal da mesma impressão digital | **Mantido temporariamente**: `traceparent` continua sendo injetado em todos conforme R1. Justificativa: padrão W3C, trace id é hash sha256, continuação de trace in-vendor é o caso de uso central do W3C. Alternância de `traceparent` por destino listada em §10 (trabalho futuro) |

### 11.7 Itens conhecidos pendentes + acompanhamento

- **Escopo do `traceparent`** — vide ponto ③ acima, listado em §10
- **UUID aleatório por requisição** (`X-Qwen-Code-Request-Id`) — alternativa proposta pelo LazzyMan, listada em §10
- **Invalidação preguiçosa de obsoleto do Gemini** (§8.6 opção A) — desacoplado da R3, sub-issue independente
- **Suporte a IPv6 no `matchesTrustedHost`** — Atualmente, destinos IPv6 nunca estão na lista de permissões (`URL.hostname` retorna `[::1]` com colchetes, e a sintaxe de padrão não tem forma correspondente). Atende ao caso de uso de "nomear endpoint first-party". Se no futuro houver necessidade de lista de permissões com IP bruto, pode ser estendido.

## 12. R4 — Separação da Confusão de Escopo

> Gatilho: [Revisão de acompanhamento do LaZzyMan na rodada 8 para o PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Implementação: Este PR estreita o escopo; todo o conjunto de session-id implementado na R3 é movido para um PR de acompanhamento independente

### 12.1 Gatilho e argumentação

A R3 resolveu a preocupação da primeira rodada de revisão do LaZzyMan sobre "transmissão de impressão digital estável para provedores terceiros" (gravidade: alta). Porém, no acompanhamento da rodada 8, ele elevou a objeção para um princípio arquitetural mais profundo:

> "Telemetria não é um contêiner para funcionalidades adjacentes. A propagação entre processos do `traceparent` e a injeção do cabeçalho `X-Qwen-Code-Session-Id` **não são telemetria**. São trabalhos de identidade/correlação de saída que usam algumas APIs do OTel internamente como detalhe de implementação."
Seu núcleo de meta-argumentos:

- O namespace **"telemetry"**  sugere que o destinatário = seu próprio coletor OTLP
- Mas `traceparent` e `X-Qwen-Code-Session-Id` têm destinatário = **provedor LLM de terceiros**
- Dois tipos diferentes de destinatários devem ter duas árvores de decisão de consentimento diferentes
- Mesmo que o comportamento padrão seja seguro (R3 já implementado), colocar o comportamento wire-level sob `telemetry.*` **estabelece um mau precedente**: futuros PRs de telemetria podem continuar embutindo comportamento wire para terceiros
- "Se aceitarmos esse princípio, a divisão é mecânica. Se não aceitarmos, este PR não é o lugar certo para debater, porque os ajustes técnicos já estão no lugar."

### 12.2 Resumo da solução ("Esquema C" divisão híbrida)

Após várias rodadas de discussões internas (incluindo a alternativa de template `customHeader` proposta por yiliang, que foi descartada porque `customHeader` não pode carregar valores dinâmicos em tempo de execução), decidiu-se pelo **Esquema C**:

**Este PR mantém**:

- Registro do `UndiciInstrumentation` (produz span HTTP client → seu próprio coletor OTLP)
- Guard loop de feedback do OTLP (efeito colateral necessário do anterior)
- **Instalação padrão do `NoopTextMapPropagator`** → `propagation.inject()` é no-op → **não há mais `traceparent`** no `fetch` de saída
- **Adiciona `outboundCorrelation.propagateTraceContext: bool` (padrão false)** como configuração de nível superior no namespace independente; quando true, instala o propagator composite W3C padrão
- Todo o código do **R3 de session-id** (`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / setting `telemetry.sessionIdHeaderHosts` / 4 pontos de integração de provedores / todos os testes relacionados) **removido completamente**

**Movido para PR follow-up**:

- Toda a mecânica do header `X-Qwen-Code-Session-Id` (reutilização da implementação do R3)
- Entra no novo namespace `outboundCorrelation.*` (a chave de configuração específica TBD, mas **não** será chamada de `telemetry.*`)
- O PR follow-up traz: seção de threat model, revisão independente, docs marcados como security-relevant
- `X-Qwen-Code-Request-Id` UUID por requisição (design alternativo proposto por LazzyMan na rodada R3) também fica no escopo deste follow-up

### 12.3 Mapeamento com os argumentos R3 / R1

| Argumento R1/R3                                                              | Estado pós-R4                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| §3.1 "Todas as requisições LLM de saída carregam `traceparent`"              | ❌ **R4 desligado por padrão**; requer `outboundCorrelation.propagateTraceContext: true` para ativar                       |
| §3.1 "Todas as requisições LLM de saída carregam `X-Qwen-Code-Session-Id`"  | ❌ **R4 remove tudo deste PR**, move para PR follow-up                                                                      |
| §4.3 fetch wrapper injeta session id                                         | ❌ Código inteiro não está neste PR; será reutilizado no PR follow-up                                                       |
| §11 allowlist de hosts (design R3)                                           | ❌ Mesmo que acima; migração completa para PR follow-up                                                                     |
| §4.4 Não introduzir nova configuração                                        | ❌ **Este PR adiciona `outboundCorrelation.propagateTraceContext`** um booleano; configuração de session id fica no follow-up |
| §10 trabalho futuro "`X-Qwen-Code-Request-Id`"                               | ✅ Ainda trabalho futuro; será projetado junto com o follow-up de session-id                                                |

### 12.4 Intenção de design do novo namespace

O namespace `outboundCorrelation.*` de nível superior neste PR tem apenas um booleano (`propagateTraceContext`), o que parece excessivamente estruturado. Mas é **intencional**:

- **Estabelece o namespace como um compromisso**: permite que session-id / request-id / etc. subsequentes entrem naturalmente neste namespace
- **Marcado como security-relevant**: a descrição no `settingsSchema.ts` escreve explicitamente "SECURITY-RELEVANT", documentado como "configuração de segurança" em vez de "configuração de observabilidade"
- **Todos os defaults desligados**: alinhado com o princípio de LazzyMan de que "clientes open-source não devem enviar IDs estáveis para terceiros sem consentimento explícito"
- **Desacoplado de `telemetry.*`**: o usuário ao ler o `settings.json` vê `outboundCorrelation.*` e imediatamente identifica que é comportamento wire de saída, não observabilidade

#### Dependência implícita: `telemetry.enabled`

Embora o namespace esteja desacoplado de `telemetry.*`, **a ativação em tempo de execução ainda depende de `telemetry.enabled: true`** — o SDK OTel só é inicializado quando a telemetria está ativada; sem SDK não há instalação de propagator, não há chamada a `propagation.inject()`, a flag fica silenciosamente em no-op. Um footgun fácil de pisar: o operador adiciona `propagateTraceContext: true` mas esquece de ativar a telemetria, e o servidor de trap não vê nenhum `traceparent`, sem erro / sem aviso.

Ambos os painéis voltados ao usuário marcam explicitamente essa dependência:

- A seção `propagateTraceContext` no `telemetry.md` vem com um exemplo JSON completo de duas flags
- A string de descrição no `settingsSchema.ts` **começa com** "Requires `telemetry.enabled: true`" (posicionada no início para evitar que a descrição longa na UI de configurações do VS Code seja ocultada após colapso)

Se no futuro for adicionado um header de session-id ou outra configuração `outboundCorrelation.*`, a **mesma dependência se aplica** — tudo só faz sentido se a telemetria estiver ativada (pois tudo é injetado via instrumentation/SDK OTel). O PR follow-up deve herdar esse padrão de aviso de footgun.

### 12.5 Implementação

| Arquivo                                                                                     | Alteração                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                      | **Removido**                                                                                                                                                                                                                                              |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                                 | **Removido**                                                                                                                                                                                                                                              |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                                          | **Removido**                                                                                                                                                                                                                                              |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                                     | **Removido**                                                                                                                                                                                                                                              |
| `packages/core/src/telemetry/sdk.ts`                                                        | + `NoopTextMapPropagator`; decide o `textMapPropagator` do SDK baseado em `getOutboundCorrelationPropagateTraceContext()`                                                                                                                                 |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`                         | Remove referência a `wrapFetchWithCorrelation`                                                                                                                                                                                                            |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`                       | Mesmo que acima                                                                                                                                                                                                                                           |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`             | Mesmo que acima                                                                                                                                                                                                                                           |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                    | Remove referência a `staticCorrelationHeaders`                                                                                                                                                                                                            |
| `*.test.ts` dos 4 provedores acima                                                          | Remove casos de teste relacionados a session-id                                                                                                                                                                                                           |
| `packages/core/src/config/config.ts`                                                        | Remove `TelemetrySettings.sessionIdHeaderHosts`, `getTelemetrySessionIdHeaderHosts`; **adiciona interface `OutboundCorrelationSettings` + campo `outboundCorrelationSettings` + getter `getOutboundCorrelationPropagateTraceContext()`**                  |
| `packages/core/src/telemetry/config.ts`                                                     | Remove passagem de `sessionIdHeaderHosts` em `resolveTelemetrySettings`                                                                                                                                                                                   |
| `packages/cli/src/config/settingsSchema.ts`                                                 | Remove schema de `sessionIdHeaderHosts`; **adiciona item de schema de nível superior `outboundCorrelation`**                                                                                                                                              |
| `packages/cli/src/config/config.ts`                                                         | Passa `outboundCorrelation: settings.outboundCorrelation` para `ConfigParameters`                                                                                                                                                                         |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                                | Regenerado com `npm run generate:settings-schema` (atualizar description posteriormente quando for sincronizado)                                                                                                                                          |
| `docs/developers/development/telemetry.md`                                                  | Reescreve "Trace context propagation" → "Client-side HTTP span on outbound fetch"; remove seção "Session correlation header"; adiciona nova seção de nível superior "Outbound correlation (SECURITY-RELEVANT)"; inclui nota de dependência `telemetry.enabled` + exemplo de configuração JSON |
| `docs/design/telemetry-outbound-propagation-design.md`                                      | Esta seção + cabeçalho da tabela R4 + ponteiro de revisão                                                                                                                                                                                                 |
| `packages/core/src/config/config.test.ts`                                                   | **Adiciona bloco describe `OutboundCorrelation Configuration`**, `it.each` com 4 casos travando `getOutboundCorrelationPropagateTraceContext` com invariante de segurança default-false (omitido / `{}` / explícito true / explícito false)               |
### 12.6 Resposta aos Meta-argumentos de LazzyMan

| Argumento                                                                                              | Status pós-R4                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Namespace telemetry sugere receptor de coletor próprio"                                                | ✅ O comportamento wire foi movido para fora de `telemetry.*`; o novo namespace `outboundCorrelation.*` identifica explicitamente a semântica "terceiro de saída"      |
| "O comportamento padrão não deve enviar identificadores a terceiros sem consentimento explícito"       | ✅ `propagateTraceContext` false por padrão; o conjunto completo de session-id no follow-up PR também será desligado por padrão                                     |
| "O PR de telemetry não deve introduzir comportamentos wire-level sorrateiramente"                      | ✅ Este PR não adiciona mais nenhum caminho de código onde "telemetry controla comportamento wire"; o comportamento wire é gerenciado uniformemente por `outboundCorrelation.*` |
| "a divisão é mecânica, o trabalho não é desperdiçado"                                                  | ✅ O código implementado no R3 foi removido fisicamente deste branch, permanecendo no histórico do git para reutilização no follow-up PR (ou cherry-pick)             |

### 12.7 Esboço do follow-up PR (informativo, fora do escopo deste PR)

O follow-up PR futuro deve conter:

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` ou configuração similar
- Reutilizar o esqueleto de código já implementado no R3: `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS`
- Uma seção de modelo de ameaça, explicitando: conjunto de destinatários, janela de desanonimização de IDs estáveis, opcional UUID por requisição como complemento
- **Desligado por padrão** (sem lista de permissão padrão – mais rigoroso que o R3, de acordo com o princípio de CLI open source de LazzyMan)
- Marcação de relevância de segurança + inclusão em docs/users/configuration/settings.md
