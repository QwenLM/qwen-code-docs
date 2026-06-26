# Telemetria: Contexto de Rastreamento de Saída e Propagação de Cabeçalho de ID de Sessão

> Issue correspondente: [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> Issue pai: [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 observabilidade mais profunda)
> PR anterior: #4367 (atributos de recurso — mesclado em 2026-05-21, commit `64401e1`)
> Baseado em 2026-05-21 no branch main do qwen-code + código fonte do claude-code verificado diretamente

## Histórico de Revisão

| Revisão | Data       | Gatilho                                      | Resumo                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1      | 2026-05-21 | Rascunho inicial                             | Broadcast total: todas as requisições LLM de saída carregam `X-Qwen-Code-Session-Id` + `traceparent`                                                                                                                                                                                                                                                                                                                |
| R2      | 2026-05-22 | Revisão R2/R3 do wenshao                     | Segurança de borda: normalização de URL, correspondência de porta, alinhamento de citações, try/catch em staticCorrelationHeaders, fallback de strip host:port                                                                                                                                                                                                                                                       |
| R3      | 2026-05-23 | REQUEST_CHANGES do LaZzyMan                  | **Alteração semântica significativa**: `X-Qwen-Code-Session-Id` tem escopo padrão reduzido para a lista de permissões de host first-party (Alibaba/DashScope). Ver §11 para detalhes.                                                                                                                                                                                                                               |
| R4      | 2026-05-25 | Acompanhamento do round-8 do LaZzyMan (confusão de escopo) | **Escopo do PR drasticamente reduzido**: Este PR agora mantém apenas o span HTTP do cliente + guarda de loop OTLP; `traceparent` fica desligado por padrão (NoopTextMapPropagator); novo namespace de topo `outboundCorrelation.*` para toggles relacionados à segurança; **toda a máquina do `X-Qwen-Code-Session-Id` implementada no R3 é removida deste PR**, movida para um PR de acompanhamento independente. Ver §12 para detalhes. |

**Aviso especial**: Ao ler §3.1 (Objetivos) / §3.2 (Não objetivos) / §4.3 (Design da Parte B) / §4.4 (Impacto no schema de configuração) / §5 (Lista de alterações de arquivos) / §9 (Comparação com claude-code) / §10 (Trabalho futuro) / §11 (Escopo da lista de permissões de host R3), consulte também §12 — **A revisão R4 invalida as afirmações de R1-R3 de que "este PR implementa simultaneamente traceparent + cabeçalho de ID de sessão"**: Este PR agora é apenas para observabilidade de telemetria + um toggle independente de contexto de rastreamento de saída; todo o trabalho de cabeçalho de correlação de saída (incluindo a lista de permissões de host R3) foi movido para um PR de acompanhamento independente. O código do trabalho R3 em si não foi desperdiçado; pode ser reutilizado no PR de acompanhamento.

## 1. Antecedentes

A #4367 resolveu **atributos e cardinalidade na telemetria emitida** (o operador pode adicionar tags como `user.id`/`tenant.id` a spans/logs/métricas). Mas uma coisa que ela não abordou: **o cabeçalho HTTP das requisições LLM de saída**. Hoje, as requisições do qwen-code para DashScope / OpenAI / Gemini / Anthropic **não carregam nenhum cabeçalho de correlação entre processos** — nem o `traceparent` do W3C, nem um ID de sessão.

Consequências:

1. O contexto de rastreamento é interrompido no limite do processo qwen-code. Se o serviço de modelo (por exemplo, DashScope com integração ARMS Tracing) tiver instrumentação OTel própria, os spans gerados por ele e os rastros do qwen-code são independentes; a árvore de rastros ponta a ponta não existe.
2. Sem ID de sessão no fio. O backend precisa correlacionar métricas/logs do qwen-code com logs do servidor offline, combinando trace ID ou timestamp, o que é muito mais complicado do que ler diretamente o cabeçalho.
3. Falta uma camada de span HTTP do lado do cliente nos rastros locais. Hoje só é possível ver o tempo total de `api.generateContent`, não o TTFB da rede, tamanho do corpo da resposta ou número de repetições.

## 2. Situação Atual

### 2.1 Apenas `HttpInstrumentation` está habilitado

`packages/core/src/telemetry/sdk.ts:330`:

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` apenas intercepta os módulos `http`/`https` nativos do Node, **não** cobre o caminho `globalThis.fetch` / undici.

### 2.2 Ambos os SDKs LLM usam fetch / undici

| SDK                                              | Implementação HTTP                                                                                                                         | `HttpInstrumentation` cobre? |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `openai@5.11.0`                                  | `globalThis.fetch` (Node 18+ ou seja, undici). Evidência: erro `'fetch' is not defined as a global` em `node_modules/openai/internal/shims.mjs` | ❌                           |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`. Evidência: chamada `new Headers()` em `dist/node/index.mjs`                                          | ❌                           |
| `@anthropic-ai/sdk` (anthropicContentGenerator)  | Também baseado em fetch                                                                                                                    | ❌                           |

### 2.3 Zero propagação manual na base de código

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ Vazio. Nenhuma chamada a `propagation.inject()`, nenhuma injeção manual de traceparent.

### 2.4 Situação atual do `defaultHeaders` por provedor

Família OpenAI (usa SDK `openai`):

Todos os subprovedores OpenAI estendem `DefaultOpenAICompatibleProvider`. **O comportamento de override do buildHeaders se divide em duas categorias** (já verificado por grep audit):

| Provedor   | Arquivo                | Comportamento de `buildHeaders()`                                                                                | Impacto                                           |
| ---------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Classe base | `default.ts:63-74`     | Fornece `{ 'User-Agent' }` + customHeaders                                                                       | Altere aqui                                       |
| DashScope  | `dashscope.ts:110-124` | **Faz `override` mas não chama `super`** — retorna um novo objeto com `User-Agent` + `X-DashScope-*`              | **Deve ser alterado separadamente**, senão perde cabeçalho de correlação |
| OpenRouter | `openrouter.ts:20-30`  | Faz `override` mas **primeiro `const baseHeaders = super.buildHeaders()`**                                         | Altere classe base, herda automaticamente ✅      |
| DeepSeek   | `deepseek.ts`          | Não faz override de `buildHeaders` (apenas override de `buildRequest` / `getDefaultGenerationConfig`)              | Altere classe base, herda automaticamente ✅      |
| Minimax    | `minimax.ts`           | Igual deepseek                                                                                                    | Herda automaticamente ✅                           |
| Mistral    | `mistral.ts`           | Igual deepseek                                                                                                    | Herda automaticamente ✅                           |
| ModelScope | `modelscope.ts`        | Igual deepseek                                                                                                    | Herda automaticamente ✅                           |

→ **Família OpenAI precisa tocar em 2 arquivos**: `default.ts` e `dashscope.ts`. Os outros 5 herdam automaticamente.

Google Gemini:

| Provedor | Arquivo                          | Caminho de injeção de cabeçalho                                          |
| -------- | -------------------------------- | ------------------------------------------------------------------------ |
| Gemini   | `geminiContentGenerator.ts:59` | `new GoogleGenAI({ httpOptions: { headers } })` — suporte nativo do SDK |

Anthropic:

| Provedor  | Arquivo                                                                                              | Caminho de injeção de cabeçalho        |
| --------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (`defaultHeaders` arg para `new Anthropic`) | `defaultHeaders` |

**Total de 4 pontos de construção de SDK** que precisam injetar o cabeçalho de ID de sessão. Todos os SDKs já suportam `defaultHeaders` / `httpOptions.headers`, não é necessário um wrapper de fetch.

### 2.5 Configurações de proxy e fetch existentes

`provider/default.ts:87-89`:

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` retorna `{ fetch: customFetch }` ou similar quando o usuário configura proxy, acionando `setGlobalDispatcher(new ProxyAgent(...))` (veja `config.ts:1126-1128`). **O modo de dispatcher global do undici é compatível com `UndiciInstrumentation`** — ele coopera com o monkey-patch de `globalThis.fetch` e os diagnósticos de canal do undici, não dependendo de um dispatcher específico.

## 3. Objetivos / Não Objetivos

### 3.1 Objetivos

- Todas as requisições LLM de saída carregam automaticamente o cabeçalho W3C `traceparent` (propagador padrão `W3CTraceContextPropagator` do SDK OTel)
- ~~Todas as~~ requisições LLM de saída carregam o cabeçalho `X-Qwen-Code-Session-Id` (mesmo namespace de produto do claude-code) — **Revisão R3**: por padrão, injeta apenas em hosts first-party (Alibaba/DashScope); provedores terceiros não recebem por padrão; ver §11 para detalhes
- Evitar automaticamente o rastreamento do próprio endpoint do exportador OTLP (feedback loop)
- Adicionar uma camada de span de cliente preciso para requisições LLM (tempo de rede vs tempo de modelo separados)
- Cobrir 4 pontos de construção de provedor: classe base OpenAI, override DashScope, Gemini, Anthropic
- Nenhuma regressão em requisições streaming / modo proxy / cenários de repetição
- Consistente com a filosofia de design da #4367: através de opções nativas do SDK como `defaultHeaders` — **Revisão R1**: devido a problemas de staleness, mudou para wrapper de fetch; **Revisão R3**: dentro do wrapper de fetch, adicionar gate de host

### 3.2 Não Objetivos

- **Cabeçalho `baggage`**: O SDK padrão já suporta, mas o qwen-code não chama `propagation.setBaggage()`, então por padrão não enviará. Este design não o ativa ativamente.
- **Herança da variável de ambiente `TRACEPARENT` para subprocessos**: claude-code injeta `TRACEPARENT` em processos filho Bash/PowerShell. O `BashTool` do qwen-code não faz isso. É um sub-issue de acompanhamento independente.
- **Leitura de `TRACEPARENT` / `TRACESTATE` de entrada**: O modo `-p` do claude-code e o Agent SDK leem traceparent do ambiente para continuar o rastro do processo pai. O qwen-code não faz isso. Acompanhamento independente.
- **`X-Qwen-Code-Request-Id`**: claude-code tem `x-client-request-id`, útil para correlação de tolerância a timeout. Não será feito agora, pode ser o próximo sub-issue.
- **Propagador personalizado (B3 / Jaeger / X-Ray)**: O W3C padrão já cobre 99% dos cenários. Pode ser uma opção de configuração futura.
- ~~**Injeção seletiva por endpoint**: claude-code não envia traceparent para endpoints terceiros (Bedrock / Vertex); qwen-code não precisa de distinção de terceiros, pode enviar uniformemente.~~ — **Revisão R3**: Esta afirmação foi anulada. A revisão do LaZzyMan apontou que o qwen-code é um CLI open source que se conecta a vários provedores terceiros (OpenAI / Anthropic / OpenRouter / etc.), a analogia first-party→first-party do claude-code não se aplica; o cabeçalho de ID de sessão deve ser diferenciado por host. Ver §11. `traceparent` ainda segue o design R1 de injeção total (cabeçalho padrão OTel, e o trace id é o hash sha256(sessionId)), pode ser um toggle por destino (`telemetry.propagateTraceContext`) como follow-up independente.

## 4. Design

### 4.1 Camadas Gerais

```
┌─ processo qwen-code ────────────────────────────────────────────┐
│                                                                │
│  ┌─ session-tracing.ts ─┐                                     │
│  │ contexto span ativo   │                                     │
│  └──────┬───────────────┘                                     │
│         │                                                      │
│         ▼                                                      │
│  ┌─ propagation.inject() (chamado pela instrumentação undici) ┐│
│  │ escreve `traceparent: 00-<traceId>-<spanId>-01` nos cabeçalhos │
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │   fetch() — undici, instrumentado                       │  │
│  │   cria span HTTP do cliente                             │  │
│  │   injeta traceparent nos cabeçalhos da requisição       │  │
│  │   (ignorado via ignoreRequestHook se endpoint for OTLP) │  │
│  └─────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         │   ┌─ defaultHeaders (por construtor do SDK) ───────┐│
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... }   ││
│         └───┴─────────────────────────────────────────────────┘│
│             │                                                  │
└─────────────┼──────────────────────────────────────────────────┘
              │
              ▼ HTTP de saída
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (User-Agent existente, X-DashScope-*, etc.)
```

Duas camadas de injeção independentes, sem dependência mútua:

| Camada                    | Quando injeta                          | Quem injeta                                                      |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------------- |
| `traceparent`            | A cada chamada fetch                   | `UndiciInstrumentation` automaticamente (propagador padrão do SDK OTel) |
| `X-Qwen-Code-Session-Id` | Uma vez na construção do SDK, escrito em `defaultHeaders` | Código da aplicação                                              |

### 4.2 Parte A — `traceparent` via instrumentação undici

**Ponto de alteração**: `packages/core/src/telemetry/sdk.ts`

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

O próprio SDK OTel usa fetch para fazer POST dos dados para o coletor OTLP. Se não pularmos, o UndiciInstrumentation criaria um span também para as requisições de "envio de dados" → esse novo span seria enviado novamente → loop infinito / ruído massivo. Todo projeto OTel já passou por essa armadilha, e a documentação do OTel recomenda explicitamente esse hook.

#### Propagador padrão

O `NodeSDK` do SDK OTel, quando não passamos `textMapPropagator`, usa por padrão `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])`. Não é necessário configurar explicitamente.

#### Formato do `traceparent`

```
traceparent: 00-<32hex traceId>-<16hex spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               versão (fixo 00)                            flags
```

55 bytes fixos, sem padding.

#### `tracestate` e `baggage`

- `tracestate`: só é repassado se vier de upstream; a injeção própria não adiciona ativamente (comportamento do SDK OTel).
- `baggage`: só existe se `propagation.setBaggage(ctx, ...)` for chamado. O qwen-code não chama, então não será enviado.

### 4.3 Parte B — `X-Qwen-Code-Session-Id` via wrapper de fetch (OpenAI / Anthropic) + cabeçalhos estáticos (Gemini)

> **Revisão R3**: O design abaixo descreve a solução de staleness do wrapper de fetch e os 4 pontos de integração de provedores — todos mantidos. Mas o wrapper ganhou um gate de lista de permissões de host internamente, e `staticCorrelationHeaders` também ganhou um parâmetro `destinationUrl`. O código de implementação mais recente com o gate de host e a lista de permissões padrão estão em §11.

#### Crítico: problema de staleness e escolha de solução

A abordagem ingênua (bake-in `getSessionId()` diretamente em `defaultHeaders`) tem **um bug real**:

1. `pipeline.ts:60` constrói o contentGenerator uma vez com `this.client = this.config.provider.buildClient()`, e os `defaultHeaders` do cliente SDK capturam o session id naquele momento
2. `config.ts:1850` o reset de sessão (acionado quando o usuário digita `/clear`) atualiza `this.sessionId` e chama `refreshSessionContext()`, mas **não reconstrói o contentGenerator**
3. Chamadas LLM subsequentes ainda usam o cliente antigo → o cabeçalho no fio ainda tem o session id antigo → correlação no backend incorreta

→ O session id deve ser lido **por requisição**, não pode ser fixado na construção.

#### Solução

```
                   ┌─ suporte a fetch ─┐  Solução
OpenAI SDK          │     ✅            │  wrapper de fetch (lê sessionId por requisição) ✅
Anthropic SDK       │     ✅            │  wrapper de fetch ✅
@google/genai SDK   │     ❌            │  cabeçalhos estáticos httpOptions.headers + aceita staleness
                   └───────────────────┘
```

A interface `HttpOptions` do `@google/genai` não suporta `fetch` (já verificado por grep em `node_modules/@google/genai/dist/genai.d.ts`: só tem `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`). Portanto, Gemini usa cabeçalhos estáticos, inconsistente com OpenAI/Anthropic — isso é uma **limitação conhecida**, veja §8.6.

#### Função auxiliar centralizada (wrapper de fetch por requisição)

Novo arquivo `packages/core/src/telemetry/llm-correlation-fetch.ts`:

```ts
import type { Config } from '../config/config.js';

/**
 * Wraps a fetch implementation so every outbound request gets correlation
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

Função auxiliar complementar para os SDKs que só aceitam cabeçalhos estáticos (Gemini):

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

Alteração em `buildClient()` — compor o `runtimeOptions.fetch` existente (proxy) com nosso wrapper:

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
    // Após o spread, sobrescreve `fetch` para que nosso wrapper de correlação
    // envolva o fetch ciente de proxy (ou globalThis.fetch quando não há proxy).
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` em si permanece inalterado.

#### Ponto de integração 2: `provider/dashscope.ts` (override)

`buildClient()` segue o mesmo padrão de composição (já faz override de buildClient). `buildHeaders()` não mexe.

#### Ponto de integração 3: `geminiContentGenerator/index.ts` (factory, NÃO construtor)

**Corrigindo declaração excessiva do design anterior**: O construtor de `geminiContentGenerator.ts` **não precisa** alterar assinatura. A função factory em `index.ts:48` já recebe `gcConfig: Config` (linha 33 já usa `gcConfig?.getUsageStatisticsEnabled()`), só precisa mesclar os cabeçalhos estáticos de correlação em `httpOptions.headers` dentro da factory:

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... existente x-gemini-api-privileged-user-id ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← novo
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) inalterado
```

Alteração zero na assinatura.

#### Ponto de integração 4: `anthropicContentGenerator.ts`

O SDK Anthropic também aceita custom `fetch` (já está usando `buildRuntimeFetchOptions`). Basta envolver o fetch no caminho `buildClient` da mesma forma que o OpenAI default.ts. `buildHeaders` permanece inalterado.

#### Cadeia de prioridade

Inalterada: os `customHeaders` do usuário ainda ganham na mesclagem de `defaultHeaders` (veja discussão sobre spoofing em §8.2). O `X-Qwen-Code-Session-Id` injetado pelo wrapper de fetch é **adicionado depois** da lista de cabeçalhos do SDK no objeto `Headers` final — pela semântica de `Headers.set()` do Node, isso sobrescreve qualquer cabeçalho de mesmo nome que existia antes (incluindo o mesmo cabeçalho escrito nos customHeaders do usuário).

**Para OpenAI/Anthropic (caminho do wrapper de fetch)**: correlation > customHeaders > padrões do SDK.
**Para Gemini (caminho dos cabeçalhos estáticos)**: customHeaders > correlation > padrões do SDK (seguindo a ordem de spread existente).

A diferença é que no caminho do wrapper de fetch, o spoofing não é mais possível (o wrapper executa depois dos cabeçalhos do SDK). Isso é um **subproduto da correção de bug**, não um aperto intencional — mas é mais seguro. Deve ser explicitado em §8.2.

### 4.4 Impacto no schema de configuração

~~**Quase zero**. Este design não introduz novas configurações~~ — **Revisão R3**: Introduz uma nova configuração `telemetry.sessionIdHeaderHosts: string[]`, para sobrescrever a lista de permissões de host first-party padrão. O item de schema foi adicionado em `packages/cli/src/config/settingsSchema.ts`, com descrição e sintaxe de override (`["*"]` restaura broadcast / `[]` desliga tudo / array personalizado) veja §11. A descrição original abaixo se aplica apenas ao R3 anterior:
- `traceparent` 注入由 telemetry enabled 触发（已有 toggle）
- `X-Qwen-Code-Session-Id` 注入也由 telemetry enabled 触发
- `ignoreRequestHook` 的 OTLP url 已经从现有 config 读

未来可以加的 setting（**out of scope**）：

- `telemetry.outboundCorrelationHeader`: 自定义 header name（默认 `X-Qwen-Code-Session-Id`）
- `telemetry.outboundPropagationDisabled`: 全局关闭（如果 LLM 服务对未知 header 严格）
- ~~per-destination header scope toggle~~ — **R3 已落地**，见 §11

## 5. 文件改动清单

| 文件                                                                            | 改动类型 | 说明                                                                                                                                                            |
| ------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                    | 加依赖   | `@opentelemetry/instrumentation-undici`                                                                                                                         |
| `packages/core/src/telemetry/sdk.ts`                                            | 修改     | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                  |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | 新文件   | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (Gemini fallback)                                                                |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | 修改     | `buildClient()` 在 `new OpenAI({...})` 里加 `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)`                                                             |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | 修改     | 同上（override `buildClient`）                                                                                                                                  |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | 修改     | factory 函数里 merge `staticCorrelationHeaders(gcConfig)` 进 `httpOptions.headers`（**caller 已有 Config，零 signature 改动** — 修正之前的 over-specification） |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | 修改     | `buildClient` 路径下用 `wrapFetchWithCorrelation` 包 SDK 的 `fetch` option                                                                                      |

**显式 audited 但无需改动**（避免 reviewer 怀疑漏路径）：

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator`，用 `DashScopeOpenAICompatibleProvider`，**自动继承 dashscope.ts 的 buildClient 改动**。所有 Qwen OAuth 流程同样受益。
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — wrapper 模式，不构造 SDK client（它包装其他 contentGenerator 做 telemetry logging），无需改动。
- `packages/core/src/core/contentGenerator.ts` — factory 入口，不持有 client。
  | `packages/core/src/telemetry/sdk.test.ts` | 修改 | 加 undici instrumentation 注册 + ignoreRequestHook 测试 |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | 新文件 | telemetry-on/off 行为单测 + per-request 读 sessionId 验证（critical：session reset 后 wrapped fetch 读到新 id） |
  | 各 provider 的 `*.test.ts` | 修改 | 断言 SDK 构造时 `fetch` option 是 wrapped 版本（OpenAI/Anthropic）；断言 Gemini 构造时 `httpOptions.headers` 含 `X-Qwen-Code-Session-Id` |
  | `docs/developers/development/telemetry.md` | 修改 | 新增 "Trace context & session correlation propagation" 段 |
  | `docs/design/telemetry-outbound-propagation-design.md` | 本文件 | 设计文档 |

## 6. 分 PR 拆分

按 review 友好度分两个 PR（也可以合一，规模允许）：

### PR 1 — `traceparent` 自动注入（structural）

- 加 `@opentelemetry/instrumentation-undici` 依赖
- `sdk.ts` 加 `UndiciInstrumentation` + `ignoreRequestHook`
- 测试：SDK 注册、OTLP endpoint 不被 trace
- 文档片段

**风险**：低。Additive。已有 client span 是 net 增益，不会改变现有 span 结构。

### PR 2 — `X-Qwen-Code-Session-Id` header（结合 helper 函数）

- 新文件 `llm-correlation-headers.ts`
- 4 个 provider 集成
- 测试：每个 provider 断言 header 存在；telemetry-off 时不发
- 文档片段

**风险**：低-中。要小心 `geminiContentGenerator` 构造器签名扩展可能波及调用方。

### PR 3（可选） — Docs + E2E verify

- 完善 `telemetry.md` 段落
- 加 E2E verify script（复用 `/tmp/verify-telemetry-pr-4367.mjs` 模式）：实际跑 fetch + 抓 header

也可以合并到 PR 2 里。

### 顺序偏好

PR 1 和 PR 2 技术上**互相独立**——不共享代码。但**推荐 PR 1 先合**：

- `traceparent` 是 OTel **标准** header，任何 OTel-aware collector / 后端立刻识别 → 用户立即获益
- `X-Qwen-Code-Session-Id` 是**产品自定义** header，需要后端配置识别才有价值 → 价值滞后
- 万一 PR 2 review 周期长，PR 1 已经把 cross-process trace 跑通了
- PR 1 是 additive structural（低风险），适合先建立信心

## 7. 测试计划

### 7.1 `sdk.ts` 单测

- ✅ `UndiciInstrumentation` 在 `NodeSDK` 的 `instrumentations` 中存在
- ✅ `ignoreRequestHook` 对 `https://collector:4318/v1/traces` 返回 true
- ✅ `ignoreRequestHook` 对 `https://dashscope.aliyuncs.com/...` 返回 false
- ✅ trailing slash 与无 trailing slash 都正确匹配

### 7.2 `llm-correlation-fetch.ts` 单测

**`wrapFetchWithCorrelation`**：

| 场景                                                    | 期望                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                       | wrapped fetch = baseFetch（不加任何 header）                           |
| `getTelemetryEnabled() === true`, sessionId = "abc-123" | wrapped fetch 发出的 init.headers 含 `X-Qwen-Code-Session-Id: abc-123` |
| `init.headers` 已有 `X-Qwen-Code-Session-Id: spoof`     | wrapper 后覆盖为真 sessionId（fetch wrapper 路径不允许 spoof，§8.1）   |
| **session reset 后 wrapped fetch 被再次调用**           | **读取新 sessionId**（regression guard for staleness fix）             |
| baseFetch reject                                        | wrapper 透传 reject 不吞                                               |

**`staticCorrelationHeaders`**（Gemini path）：

| 场景                                                    | 期望返回                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                       | `{}`                                                             |
| `getTelemetryEnabled() === true`, sessionId = "abc-123" | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                        |
| sessionId 中含 unicode（`會話-1`）                      | 原样返回——HTTP header value 由 SDK 负责编码                      |
| sessionId 为空字符串                                    | `{ 'X-Qwen-Code-Session-Id': '' }`——业务 invariant，不在此层校验 |

### 7.3 Per-provider 集成测试

每个 provider 的 `buildHeaders()` / 构造测试加：

```ts
it('includes X-Qwen-Code-Session-Id when telemetry enabled', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('omits X-Qwen-Code-Session-Id when telemetry disabled', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 E2E verification（tmux + local HTTP server）

⚠️ **不要** mock `globalThis.fetch` 来抓 header：`UndiciInstrumentation` 通过 undici 的 diagnostics channel hook，monkey-patching globalThis.fetch 可能完全 bypass instrumentation（取决于 patch 顺序），让 `traceparent` 注入测不到。**正确做法是起 local HTTP server**，让 SDK 真发请求，server 端记录收到的 headers。

写一个仿 `/tmp/verify-telemetry-pr-4367.mjs` 的脚本：

1. `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` 起本地 server
2. 启 telemetry + outfile + 把 OpenAI SDK 的 `baseURL` 指向 `http://127.0.0.1:<port>`（或者用 mock provider 让 SDK 真发 fetch）
3. 触发一次 `client.chat.completions.create(...)`（要带最小可解析的 mock 响应，否则 SDK 解析报错——本地 server 返回合法但空的 OpenAI 响应即可）
4. 断言 `capturedHeaders[0]` 含 `traceparent: 00-...` 和 `X-Qwen-Code-Session-Id: <sessionId>`
5. 另起一个 OTLP collector mock 在 different port，验证给它发的 OTLP 上报**不**触发 `traceparent` 注入（验证 `ignoreRequestHook`）
6. **额外：staleness 验证** — emit request 1 → call `config.resetSession(...)` → emit request 2 → 断言 request 2 的 `X-Qwen-Code-Session-Id` 是新 session id（**这是 #1 fix 的关键回归测试**）

### 7.5 回归保护

- streaming chat completion 的 fetch（带 `stream: true`）仍正常关闭——`UndiciInstrumentation` 历史上对 streaming response 的 span lifecycle 有过 bug，**实施时需要实际跑一次 streaming completion 端到端验证 client span 正常 end + 无 leaked span + 流不被截断**；不假设具体版本号已修
- proxy mode (`ProxyAgent`) 与 instrumentation 同时启用——`ignoreRequestHook` 仍按 endpoint 字符串匹配，proxy 不影响
- 重试（`maxRetries`）下每次重试都得到独立 client span，但都共享同一个 `traceparent` parent（理想是 retry 作为同一个父 span 下多个 child span — 这部分由 SDK 行为决定，本设计不强制）

## 8. 边界 / 边角

### 8.1 customHeaders override 与 spoofing 的不一致行为

不同 provider 路径的 spoofing 表面**不同**（设计后果，非原意收紧）：

| Provider 路径                           | spoofing 可能? | 原因                                                                                                                |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic (fetch wrapper 路径) | ❌ 不能 spoof  | fetch wrapper 在 SDK headers list 之后 `headers.set('X-Qwen-Code-Session-Id', ...)`，覆盖 user customHeaders 的同名 |
| Gemini (static headers 路径)            | ✅ 可 spoof    | merge 顺序 `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }`——customHeaders 最后赢                      |

claude-code 同样使用 fetch wrapper 路径，行为与 OpenAI/Anthropic 一致（spoofing 不能）。这是修 staleness bug 的副产品，不是原本要做的事。

**不打算"对齐"两条路径**——Gemini 路径的行为是 SDK 限制（没有 `fetch` hook）导致的，反向把 OpenAI 也降级到 static 不合理。

Session id spoofing 不是真威胁（用户控制本地，可以直接改 source code）。文档里要明示这个差异，避免 reviewer 看到 fetch wrapper 路径无法 spoof 时质疑 customHeaders 优先级。

### 8.2 OTLP collector URL 匹配的两类 edge case

#### (a) Auth token in URL

如果用户 OTLP endpoint 形如 `https://collector/path?token=secret`，`ignoreRequestHook` 的 `url.startsWith(e)` 比对应包含 query string。但 undici 给的 `request.path` 只到 path（不含 query），所以比较时 `e` 也只用到 path 部分。为安全起见，剥掉 query：

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) startsWith 跨 hostname 边界的理论 false positive

若 `e = "http://collector"`（无 port），来路 url = `http://collector-fake/v1/traces` 会被 startsWith 错误匹配。

**实际触发概率极低**：

- OTLP endpoint 几乎总带 port（4317 gRPC / 4318 HTTP），`http://collector:4318` 形态后 `-fake` 这种延伸不可能（port 后跟的是 `/`）
- 用户配 endpoint 不带 port 是配置错误，本来 SDK 就要默认 fallback

**如果想 harden**：解析 URL origin + path 分别比较，不用裸 startsWith：

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

本期不做——开销没必要，false positive 实际触发不到。

### 8.3 Vertex AI 模式的 Gemini

`@google/genai` 支持 `vertexai: true` 模式（用 GCP 凭据走 Vertex 端点而非 generative ai endpoint）。两种模式都走 fetch，所以 instrumentation 都覆盖。`httpOptions.headers` 在两种模式下都有效。

### 8.4 Anthropic SDK 已有 `defaultHeaders` 逻辑

`anthropicContentGenerator.ts:177` 已经在调 `buildHeaders()` 然后传给 `new Anthropic({ defaultHeaders })`。但 staleness 同样适用——本设计改用 `fetch` wrapper 路径（与 OpenAI 一致）。

### 8.5 SDK 与 fetch 之间的 trailer header

`openai` SDK 在 streaming 时可能用 `Transfer-Encoding: chunked` 和 trailer headers。这些都不影响 request-time 的 `traceparent` / `X-Qwen-Code-Session-Id` 注入——它们都是请求头，发出时一次性写入。

### 8.6 ⚠️ Known limitation: Gemini 的 session id 在 `/clear` 后 stale

由于 `@google/genai` SDK 不支持 `fetch` hook（`HttpOptions` 接口只有 `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`），Gemini provider 走 static `httpOptions.headers` 路径——session id 在 SDK 构造时 capture，**`/clear` 触发 session reset 后不刷新**。

**实际影响范围**：

- 用户启动 qwen-code → `/clear` → 用 Gemini 模型 → wire 上的 `X-Qwen-Code-Session-Id` 是旧 session id
- 后端 correlation 错位（trace id 和 log 已正确切换到新 session，但 wire header 滞后）

**为什么不修**（本期）：

- OpenAI / Anthropic 路径**没有这个 bug**（fetch wrapper 路径 per-request 读 session id）
- Gemini fix path 有几个选项，全部超出本期 scope（见下）

**Future fix path 选项**（按推荐顺序）：

| 选项                                          | 描述                                                                                 | 代价                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **A. Lazy invalidate** ★ 推荐                 | session reset 时只 mark contentGenerator dirty，下次 LLM 调用时 lazy recreate        | 小：~10 行加在 `resetSession` + LLM 调用入口；同步 API，无侵入                            |
| B. Eager recreate                             | session reset 时立即 `await createContentGenerator(...)`，需 async 化 `resetSession` | 中：API 改动级联多处                                                                      |
| C. Proxy headers object                       | 给 `httpOptions.headers` 包 Proxy 拦截 getter                                        | 风险高：`@google/genai` 内部是否 per-request 重读 headers 不可知，行为可能 silently break |
| D. 推动 `@google/genai` 上游加 `fetch` option | 提 PR 给 google-deepmind/generative-ai-js                                            | 长期；不可控                                                                              |

**文档要在用户面前说明**：使用 Gemini provider 时如果 `/clear` 后立刻有 LLM 调用，wire 上的 session id 在那一刻是旧的。可以靠 trace correlation 间接修正（spans/logs 上 session.id 已经是新的）。

应单开 follow-up sub-issue 跟踪选项 A。

## 9. 与 claude-code 对比

| 维度                         | claude-code                                                                                                                                          | qwen-code 本设计                                                                                                                                                              | 决策依据                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Session id header 命名       | `X-Claude-Code-Session-Id`（产品前缀）                                                                                                               | `X-Qwen-Code-Session-Id`（产品前缀）                                                                                                                                          | ✅ 同样命名空间策略                                                                                                                |
| Session id 注入机制          | SDK `defaultHeaders`（`client.ts:108`）+ 自定义 `buildFetch()` wrapper（`client.ts:370-390`，per-request `randomUUID()` 注入 `x-client-request-id`） | OpenAI/Anthropic 走 fetch wrapper（per-request 读 session id，避免 `/clear` staleness）；Gemini 走 static `httpOptions.headers`（SDK 限制）                                   | 与 claude-code 的 fetch wrapper 模式对齐。claude-code 也用 fetch wrapper 才能 per-request 加 `x-client-request-id`                 |
| Session id 持久性            | claude-code 没有 `/clear`-式 session reset；session = process                                                                                        | 有 `/clear` reset → fetch wrapper 路径自动跟随；static headers 路径会 stale（§8.6）                                                                                           | qwen-code 独有的复杂度                                                                                                             |
| Session id 编码              | HTTP header（不是 baggage）                                                                                                                          | HTTP header                                                                                                                                                                   | ✅ 同——backend 友好                                                                                                                |
| `traceparent` 注入           | 闭源；公开 docs 描述存在；开源 repo 无 `propagation.inject` / `UndiciInstrumentation` 引用                                                           | `@opentelemetry/instrumentation-undici` 自动                                                                                                                                  | claude-code 怎么实现的不可见。我们选 OTel 官方推荐路径，更轻                                                                       |
| `traceparent` 发送范围       | 仅第一方 Anthropic API；不发 Bedrock/Vertex/Foundry                                                                                                  | 发给所有出站 fetch (W3C 标准；trace id 是 `sha256(sessionId)` 哈希)。**R3 修订**：session id header 仅向 first-party (Alibaba/DashScope) 白名单注入，第三方默认不发。详见 §11 | R3 后 qwen-code 的 session header 与 claude-code 同样的 first-party-only 语义；`traceparent` 仍待 per-destination toggle follow-up |
| `x-client-request-id` (随机) | 有，自动                                                                                                                                             | 暂不做（独立 follow-up sub-issue 价值更高）                                                                                                                                   | 范围控制                                                                                                                           |
| 子进程 `TRACEPARENT` env     | 文档承认存在（实现闭源）                                                                                                                             | 不做（独立 follow-up）                                                                                                                                                        | 范围控制                                                                                                                           |
| 入站 `TRACEPARENT` 读取      | 文档承认存在（`-p` / Agent SDK 模式）                                                                                                                | 不做（独立 follow-up）                                                                                                                                                        | 范围控制                                                                                                                           |

**verified vs documented 注解**：

| claim                                           | 验证状态                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders` | ✅ Open source `src/services/api/client.ts:108` 已读                                                                                              |
| `x-client-request-id` via fetch wrapper         | ✅ Open source `src/services/api/client.ts:370-390` 已读                                                                                          |
| `traceparent` 注入                              | ⚠️ 仅 docs.claude.com/docs/en/monitoring-usage.md 提到；开源 repo `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` 返回空 |
## 10. Trabalho Futuro

Acompanhando #3731 P3, este design **não** inclui, mas está relacionado a:

- **`X-Qwen-Code-Request-Id`** UUID aleatório por requisição (equivalente ao `x-client-request-id` do claude-code). Útil para correlação de timeout/erro de tempo limite – quando ocorre timeout, o servidor pode não ter atribuído um request id ainda; o id enviado pelo cliente é o único meio de correlação. Após a revisão R3, essa recomendação se torna mais significativa: um UUID por requisição não tem risco de "perfilamento de comportamento entre requisições" e pode servir como um "header de suporte/depuração enviado a todos os provedores LLM".
- **Escopo `traceparent` por destino com toggle** — A revisão R3 tratou apenas do escopo do session id header; `traceparent` ainda é injetado em todos os `fetch` de saída. Pode-se adicionar `telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'`, usando a mesma allowlist da seção §11 para determinar o comportamento.
- **Invalidação lazy do session id obsoleto do Gemini** (opção A da §8.6): marcar `contentGenerator` como sujo ao `/clear`, e recriar lazy na próxima chamada LLM. Permitindo que o caminho Gemini também usufrua da atualização em tempo real do fetch wrapper.
- **Variável de ambiente `TRACEPARENT` para subprocessos**: injetar env ao executar subprocessos do `BashTool`, permitindo que ferramentas externas continuem o trace. Requer análise separada do ciclo de vida da execução da tool.
- **`TRACEPARENT` de entrada**: ler env ao iniciar no modo `--prompt`, permitindo que CI / orquestrador externo conecte o qwen-code a um trace maior.
- **Nome configurável do `correlationHeader`**: permitir que operações corporativas personalizem o header (padrão `X-Qwen-Code-Session-Id`).
- **Estratégia de propagação `baggage`**: definir ativamente `baggage` para que `user.id` / `tenant.id` etc. também sejam propagados via baggage para downstream. Não feito neste ciclo, aguardando requisitos claros.

## 11. Revisão R3 — Escopo por Host-Allowlist para `X-Qwen-Code-Session-Id`

> Gatilho: [Review REQUEST_CHANGES de LaZzyMan no PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Commit de implementação: `1c8528a56` (implementação central) + `cb162e716` (falha fechada na baseUrl do Vertex + tolerância para `["*"]` com trim)

### 11.1 Gatilho e Argumentação

O design R1 injetava `X-Qwen-Code-Session-Id` em **todas** as requisições LLM de saída, controlado apenas por `telemetry.enabled`. O review de LaZzyMan apontou três problemas progressivos:

1. **Desalinhamento de rótulo**: `feat(telemetry):` + caminho `telemetry/` + gate `getTelemetryEnabled()` faz o usuário entender, razoavelmente, que "dados de observabilidade da própria empresa vão para o próprio collector". Mas `X-Qwen-Code-Session-Id` não chega ao backend OTLP; ele vai nas requisições LLM para DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral. Duas decisões de destino de dados diferentes atreladas a um único switch.

2. **Analogia com claude-code não se sustenta**: R1 na §9 "alinhou" a estratégia de namespace e o padrão fetch wrapper ao claude-code. Mas claude-code é Anthropic → Anthropic (vendor único, direção única), enquanto qwen-code é CLI open-source → múltiplos provedores terceiros. "Um identificador estável cross-request transmitido a todos os terceiros" é uma questão que R1 não respondeu diretamente.

3. **`traceparent` é outro canal da mesma impressão digital**: trace id = `sha256(sessionId).slice(0, 32)`; para o receptor, ainda é um identificador estável por sessão (hash irreversível, mas estável para a mesma sessão).

LaZzyMan classificou a severidade: session id `high` / traceparent `medium`.

### 11.2 Resumo da Solução

**Restringir o escopo padrão apenas a hosts first-party**. Nova configuração:

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // Restaura comportamento de broadcast R1
  "sessionIdHeaderHosts": []                              // Desliga completamente o header
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

A semântica desse conjunto é "provedor LLM, backend ARMS Tracing, mesma entidade legal da distribuição qwen-code" – ou seja, o conjunto correspondente à relação single-vendor / single-direction do claude-code no qwen-code. Provedores terceiros (OpenAI / Anthropic / OpenRouter / etc.) **não** recebem o header por padrão.

### 11.3 Sintaxe de Padrão (intencionalmente pequena)

`matchesTrustedHost(hostname, patterns)` suporta apenas dois padrões, alinhado com `DashScopeOpenAICompatibleProvider.isDashScopeProvider`:

- hostname simples → correspondência exata (case-insensitive)
- `*.suffix` → corresponde ao próprio `suffix` **E** a qualquer subdomínio; âncora de ponto rejeita vetores de ataque como `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld` (typo-suffix)

Não introduz regex, nem globbing que considere porta/scheme – para que as strings nas configurações tenham exatamente a semântica que aparentam.

### 11.4 Diferenças de Implementação vs R1

#### `wrapFetchWithCorrelation` (OpenAI / Anthropic)

O wrapper R1 tinha apenas dois gates: telemetry-enabled e sessionId. R3 insere um terceiro gate entre eles:

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

`trustedHosts` é capturado em um snapshot no momento do wrap (diferente do session id, que é lido a cada requisição). Alterar `telemetry.sessionIdHeaderHosts` durante a execução requer recriação do `contentGenerator` para fazer efeito. Escritas como `[" * "]` com espaços são tratadas via `.trim()`, caindo para broadcast, evitando degradação silenciosa por erro de digitação no `settings.json`.

#### `staticCorrelationHeaders` (Gemini)

Assinatura adiciona um parâmetro `destinationUrl?: string`:

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: sem saber o destino, não envia
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Integração na factory do Gemini

O SDK Gemini tem dois endpoints padrão não visíveis (`generativelanguage.googleapis.com` e `{region}-aiplatform.googleapis.com`, determinados por `vertexai`), e a camada da factory não consegue reconstruir exatamente um deles. R3 opta por "passar `undefined` se `config.baseUrl` não foi definido", fazendo o helper falhar fechado → não enviar header. Operadores que desejam correlação devem definir explicitamente `baseUrl` (a mesma entrada que o SDK usa para resolver o destino). Essa mudança evita que um destino Vertex seja incorretamente atingido pela allowlist.

### 11.5 Novos Arquivos / Novo Código

| Arquivo                                                                                              | Descrição                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (NOVO)                                            | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                                                 |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (NOVO)                                       | Testes unitários, incluindo vetores de ataque TLD-suffix, fail-closed para IPv6, extração de porta/userinfo/query               |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                               | Adiciona gate de host; `staticCorrelationHeaders` adiciona parâmetro `destinationUrl`                                            |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                                          | Adiciona 8 casos para gate de host; `mockConfig` usa `'hosts' in opts` para diferenciar "allowlist padrão" vs "broadcast"       |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`)                                 | Propaga `sessionIdHeaderHosts`                                                                                                  |
| `packages/core/src/config/config.ts`                                                                 | `TelemetrySettings.sessionIdHeaderHosts` + getter `getTelemetrySessionIdHeaderHosts()`                                           |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                             | Passa `config.baseUrl` para o helper; fail-closed quando undefined                                                              |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`                                        | Reescreve testes Gemini com telemetry ativada para corresponder à nova semântica fail-closed                                    |
| `packages/cli/src/config/settingsSchema.ts`                                                          | Entrada JSON schema para `sessionIdHeaderHosts`                                                                                 |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                                         | Regenerado por `npm run generate:settings-schema`                                                                               |
| `docs/developers/development/telemetry.md`                                                           | Seção "Session correlation header" reescrita + escopo padrão + sintaxe de override                                              |

### 11.6 Respostas a Cada Argumento de LaZzyMan

| Argumento de LaZzyMan                                    | Resposta R3                                                                                                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① Desalinhamento de rótulo telemetry                     | **Resolvido**: No caso DashScope, o session id header é literalmente enviado ao backend ARMS Tracing (mesma entidade legal), a semântica de `telemetry.enabled` está alinhada                                          |
| ② Broadcast de identificador estável cross-vendor        | **Resolvido**: A allowlist padrão contém apenas hosts first-party do grupo Alibaba; broadcast é opt-in (`["*"]`)                                                                                                      |
| ③ `traceparent` é outro canal da mesma impressão digital | **Mantido temporariamente**: traceparent ainda é injetado em todos os destinos conforme R1. Justificativa: padrão W3C, trace id é hash sha256, continuação de trace intra-vendor é um cenário central do W3C. O toggle per-destination do traceparent está listado em §10 (trabalho futuro) |

### 11.7 Pendências Conhecidas + Acompanhamento

- **Escopo do `traceparent`** — Veja ponto ③ acima, listado em §10
- **UUID aleatório por requisição** (`X-Qwen-Code-Request-Id`) — Alternativa proposta por LaZzyMan, listada em §10
- **Invalidação lazy de obsolescência do Gemini** (opção A §8.6) — Desacoplado de R3, sub-issue independente
- **Suporte a IPv6 em `matchesTrustedHost`** — Atualmente, destinos IPv6 nunca entram na allowlist (`URL.hostname` retorna `[::1]` com colchetes, a sintaxe de padrão não tem forma correspondente). Atende ao caso de uso "endpoint first-party nomeado". Se houver necessidade futura de allowlist com IPs brutos, expandir.

## 12. Revisão R4 — Separação de Escopo (Scope Conflation)

> Gatilho: [Review de follow-up round-8 de LaZzyMan no PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Implementação: Este PR restringe; todo o conjunto do session id implementado no R3 é movido para um PR de follow-up independente

### 12.1 Gatilho e Argumentação

R3 resolveu a preocupação do primeiro review de LaZzyMan sobre "broadcast de impressão digital estável para provedores terceiros" (severidade: high). Mas no follow-up round-8 ele elevou a objeção a um princípio arquitetural mais profundo:

> "Telemetry não é um contêiner para funcionalidades adjacentes. A propagação cross-process de `traceparent` e a injeção do header `X-Qwen-Code-Session-Id` **não são telemetria**. São trabalho de identidade/correlação de saída que usa algumas APIs OTel internamente como detalhe de implementação."

Seu meta-argumento central:

- **Namespace "telemetry" sugere que o recipient = collector OTLP do próprio usuário**
- Mas os recipients de `traceparent` e `X-Qwen-Code-Session-Id` = **provedores LLM terceiros**
- Dois tipos diferentes de recipients deveriam ter duas árvores de decisão de consentimento diferentes
- Mesmo que o comportamento padrão seja seguro (R3 já implementou), colocar comportamentos de nível de wire sob `telemetry.*` **estabelece um mau precedente**: futuros PRs de telemetry podem continuar a introduzir comportamentos de wire para terceiros
- "Se aceitarmos esse princípio, a separação é mecânica. Se não aceitarmos, este PR não é o lugar certo para debater, porque as correções técnicas já estão em vigor."

### 12.2 Resumo da Solução ("Plano C" — split híbrido)

Após várias discussões internas (incluindo a alternativa de template customHeader proposta por yiliang, que foi descartada por não conseguir transportar valores dinâmicos em tempo de execução), decidiu-se pelo **Plano C**:

**Este PR mantém**:

- Registro do `UndiciInstrumentation` (produz spans HTTP client → collector OTLP do próprio usuário)
- Guarda de feedback-loop OTLP (efeito colateral necessário do anterior)
- **Instalação padrão do `NoopTextMapPropagator`** → `propagation.inject()` é no-op → os `fetch` de saída **não terão mais `traceparent`**
- **Nova configuração `outboundCorrelation.propagateTraceContext: bool` (padrão false)** como configuração de namespace independente no nível superior; quando true, instala o propagador W3C composite padrão
- **Todo o código do session-id da R3** (`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / configuração `telemetry.sessionIdHeaderHosts` / 4 pontos de integração de provedores / todos os testes relacionados) **é completamente removido**

**Movido para um PR de follow-up**:

- Toda a mecânica do header `X-Qwen-Code-Session-Id` (implementação R3 reutilizada)
- Entra no novo namespace `outboundCorrelation.*` (chave de configuração específica TBD, mas **não** se chamará `telemetry.*`)
- O PR de follow-up trará: seção de threat model, revisão independente, docs com marcação de segurança relevante
- O UUID por requisição `X-Qwen-Code-Request-Id` (design alternativo proposto por LaZzyMan na rodada R3) também entra no escopo desse follow-up

### 12.3 Mapeamento com Argumentos R3/R1

| Argumento R1/R3                                                                 | Status após R4                                                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| §3.1 "Todas as requisições LLM de saída com traceparent"                       | ❌ **R4 desliga por padrão**; só ativa com `outboundCorrelation.propagateTraceContext: true`                                       |
| §3.1 "Todas as requisições LLM de saída com `X-Qwen-Code-Session-Id`"          | ❌ **R4 remove todo o conjunto deste PR**, move para PR de follow-up                                                               |
| §4.3 fetch wrapper injeta session id                                            | ❌ Código inteiro não está neste PR; reutilizado no PR de follow-up                                                                |
| §11 host allowlist (design R3)                                                  | ❌ Mesmo que acima; migrado integralmente para o PR de follow-up                                                                   |
| §4.4 Não introduzir nova configuração                                           | ❌ **Este PR adiciona `outboundCorrelation.propagateTraceContext`** um booleano; configurações de session id ficam no PR follow-up |
| §10 trabalho futuro "`X-Qwen-Code-Request-Id`"                                  | ✅ Ainda é trabalho futuro; será projetado junto com o follow-up de session-id                                                     |

### 12.4 Intenção do Design do Novo Namespace

O namespace `outboundCorrelation.*` no nível superior, neste PR, contém apenas um booleano (`propagateTraceContext`), o que pode parecer superestruturado. Mas é **uma escolha deliberada**:

- **Estabelece o namespace como um compromisso**: permite que session-id / request-id / etc. entrem naturalmente nesse namespace no futuro
- **Marcado como relevante para segurança**: a `description` no `settingsSchema.ts` escreve explicitamente "SECURITY-RELEVANT", documentado como "configuração de segurança" em vez de "configuração de observabilidade"
- **Padrões todos desligados**: alinhado ao princípio proposto por LaZzyMan de que "clientes open-source não devem enviar identificadores estáveis para terceiros sem consentimento explícito"
- **Desacoplado de `telemetry.*`**: o usuário que ler `settings.json` verá `outboundCorrelation.*` e identificará imediatamente que isso é um comportamento de wire de saída, não observabilidade

#### Dependência implícita: `telemetry.enabled`

Embora o namespace seja desacoplado de `telemetry.*`, **a execução ainda depende de `telemetry.enabled: true`** — o SDK OTel só é inicializado quando a telemetria está ativada; sem SDK, não há instalador de propagador, não há chamada a `propagation.inject()`, e a flag se torna um no-op silencioso. Uma armadilha fácil: operadores que ativam `propagateTraceContext: true` mas esquecem de ativar telemetry não verão nenhum `traceparent` no servidor de trap, sem erro / sem aviso.

Ambos os painéis voltados ao usuário marcam explicitamente essa dependência:

- A seção `propagateTraceContext` no `telemetry.md` inclui um exemplo JSON completo com ambas as flags
- A `description` no `settingsSchema.ts` **começa com** "Requires `telemetry.enabled: true`" (posicionado antes para evitar que a interface de configuração do VS Code oculte a descrição longa após o colapso)

No futuro, se adicionarmos o session-id header ou outra configuração `outboundCorrelation.*`, **a mesma dependência se aplica** — todos só fazem sentido com a telemetria ativada (pois são injetados via instrumentation/SDK OTel). O PR de follow-up deve herdar esse padrão de aviso para a armadilha.

### 12.5 Implementação

| Arquivo                                                                                           | Alterações                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                            | **Removido**                                                                                                                                                                                                                                      |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                                       | **Removido**                                                                                                                                                                                                                                      |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                                                | **Removido**                                                                                                                                                                                                                                      |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                                           | **Removido**                                                                                                                                                                                                                                      |
| `packages/core/src/telemetry/sdk.ts`                                                              | + `NoopTextMapPropagator`; decide o `textMapPropagator` do SDK conforme `getOutboundCorrelationPropagateTraceContext()`                                                                                                                           |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`                               | Remove referência a `wrapFetchWithCorrelation`                                                                                                                                                                                                    |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`                             | Mesmo acima                                                                                                                                                                                                                                       |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`                   | Mesmo acima                                                                                                                                                                                                                                       |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                          | Remove referência a `staticCorrelationHeaders`                                                                                                                                                                                                    |
| `*.test.ts` dos 4 provedores acima                                                                | Remove casos de teste relacionados a session-id                                                                                                                                                                                                   |
| `packages/core/src/config/config.ts`                                                              | Remove `TelemetrySettings.sessionIdHeaderHosts`, `getTelemetrySessionIdHeaderHosts`; **Adiciona interface `OutboundCorrelationSettings` + campo `outboundCorrelationSettings` + getter `getOutboundCorrelationPropagateTraceContext()`**          |
| `packages/core/src/telemetry/config.ts`                                                           | Remove propagação de `sessionIdHeaderHosts` em `resolveTelemetrySettings`                                                                                                                                                                         |
| `packages/cli/src/config/settingsSchema.ts`                                                       | Remove schema de `sessionIdHeaderHosts`; **Adiciona item de schema `outboundCorrelation` no nível superior**                                                                                                                                      |
| `packages/cli/src/config/config.ts`                                                               | Propaga `outboundCorrelation: settings.outboundCorrelation` para `ConfigParameters`                                                                                                                                                               |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                                      | Regenerado por `npm run generate:settings-schema` (a description será atualizada posteriormente quando sincronizada)                                                                                                                              |
| `docs/developers/development/telemetry.md`                                                        | Reescreve "Trace context propagation" → "Client-side HTTP span on outbound fetch"; Remove seção "Session correlation header" completamente; Adiciona nova seção "Outbound correlation (SECURITY-RELEVANT)" no nível superior; Inclui nota de dependência de `telemetry.enabled` + exemplo de configuração JSON |
| `docs/design/telemetry-outbound-propagation-design.md`                                            | Esta seção + cabeçalho R4 + ponteiro de revisão                                                                                                                                                                                                   |
| `packages/core/src/config/config.test.ts`                                                         | **Adiciona bloco `describe` para `OutboundCorrelation Configuration`**, com `it.each` 4 casos confirmando a invariante de segurança default-false de `getOutboundCorrelationPropagateTraceContext` (omitido / `{}` / explicit true / explicit false) |

### 12.6 Respostas aos Meta-Argumentos de LaZzyMan

| Argumento                                                              | Status após R4                                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| "Namespace Telemetry sugere recipient = collector próprio"             | ✅ Comportamento de wire foi removido de `telemetry.*`; novo namespace `outboundCorrelation.*` indica explicitamente "terceiros de saída" |
| "Comportamento padrão não deve enviar identificadores a terceiros sem consentimento explícito" | ✅ `propagateTraceContext` padrão false; todo o conjunto session-id no PR follow-up também terá padrão desligado      |
| "PR de telemetry não deve introduzir comportamentos de wire"           | ✅ Este PR não adiciona nenhum caminho de código onde "telemetry controla comportamento de wire"; wire é gerenciado unicamente por `outboundCorrelation.*` |
| "A separação é mecânica, o trabalho não é desperdiçado"                | ✅ Código implementado no R3 foi fisicamente removido deste branch, permanece no histórico git para reutilização (ou cherry-pick) no PR follow-up         |
### 12.7 Esboço de PR de acompanhamento (informativo, fora do escopo deste PR)

Os PRs de acompanhamento futuros devem incluir:

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` ou configuração similar
- Reaproveitar o esqueleto de código já implementado no R3: `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS`
- Uma seção de threat model, explicitando: conjunto de destinatários, janela de desanonimização de IDs estáveis, opcional UUID por requisição como complemento
- **Desabilitado por padrão** (sem allowlist padrão — mais restrito que o R3, alinhado com o princípio de CLI open source do LazzyMan)
- Anotação como security-relevant + inclusão em docs/users/configuration/settings.md