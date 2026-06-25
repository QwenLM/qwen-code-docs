# Design da Árvore de Trace do Subagente (P3 Fase 3)

> Issue #3731 — Fase 3 do rastreamento hierárquico de sessão. Adiciona um span `qwen-code.subagent` para que as invocações de subagentes obtenham uma estrutura de trace isolada e consultável, em vez de se intercalarem silenciosamente sob o span pai `qwen-code.interaction`.
>
> Baseia-se na Fase 1 (#4126), Fase 1.5 (#4302) e Fase 2 (#4321).

## Problema

Hoje, toda execução de `AgentTool.execute` é executada sob o span `qwen-code.interaction` do pai. Três patologias:

1. **Subagentes concorrentes se intercalam.** `coreToolScheduler.ts:728` marca `AGENT` como seguro para concorrência — `Promise.all` executa até 10 subagentes em paralelo. Seus spans de requisição-LLM / ferramenta / hook são todos anexados ao único span de interação pai compartilhado, então os exploradores de trace não conseguem distinguir "esta requisição LLM pertence ao subagente A" de "esta pertence ao subagente B".
2. **Nenhum span para o próprio limite do subagente.** Existe um LogRecord `qwen-code.subagent_execution` (emitido de `agent-headless.ts:268,329`) conectado a um span de mesmo nome via `LogToSpanProcessor`, mas é um marcador independente, não um pai que aninha os spans de LLM / ferramenta / hook do subagente abaixo dele.
3. **Subagentes fork / background flutuam livres.** Caminhos fire-and-forget (`runInForkContext` / background) sobrevivem ao `AgentTool.execute` pai e emitem spans em várias interações subsequentes do usuário. O span da ferramenta pai já terminou quando esses spans aparecem, então o `context.active()` do OTel não ajuda — eles se anexam a qualquer interação que estava ativa no momento da execução, ou a nenhuma.

## Superfície existente (sem alteração)

| Componente                      | Localização                                                                                                                                                                                         | Por que não alteramos                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Local de spawn (unificado)      | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                                 | Ponto de entrada único; gancho ideal para 3 sabores de invocação |
| Três sabores de invocação       | foreground-named (`runFramed` em `:2154` — aguardado), fork (`void runInForkContext(runFramedFork)` em `:1991` — fire-and-forget), background (`void framedBgBody()` em `:1934` — fire-and-forget) | Ciclo de vida difere — design do span cobre todos os três |
| Concorrência                    | `coreToolScheduler.runConcurrently` (`Promise.all`, limite 10) — impulsionado por `partitionToolCalls` marcando AGENT como `concurrent: true`                                                       | O que torna o isolamento necessário                        |
| `runInForkContext` ALS          | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                         | Apenas proteção contra fork recursivo — NÃO propaga contexto OTel |
| ALS de identidade do agente     | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                          | Já carrega `agentId`; estendemos com `depth`               |
| LogRecord `SubagentExecutionEvent` | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 consumidores downstream (ponte de span LogToSpanProcessor + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                 | LogRecord permanece; downstreams dependem dele             |

## Fora do escopo (adiado)

- **Agregação de uso de tokens por subagente** (`gen_ai.usage.*` somado em todos os spans LLM dentro de um subagente). Pertence à Fase 4 (decomposição de requisição LLM).
- **Migrar o LogRecord `qwen-code.subagent_execution` para o novo span como eventos de span.** RUM e métricas estão fortemente acoplados ao LogRecord; adiado para um follow-up que possa renegociar todos os 3 consumidores juntos.
- **Consolidação automática de custos.** Mesmo motivo — precisa primeiro do uso de tokens.
- **Remover o marcador `concurrent: true` da ferramenta AGENT.** Concorrência é correta; nós a instrumentamos, não a restringimos.

## Referências (evidência de decisão)

| Fonte                                                                                                               | Conclusão principal                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Especificação OTel Trace — Links entre spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans) | Textual: "O novo Trace vinculado também pode representar uma operação de processamento de dados assíncrona de longa duração que foi iniciada por uma das muitas requisições rápidas de entrada." → fork/background devem ser raízes vinculadas, não filhos.                                                                 |
| [Spans de Agente GenAI do OTel](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (status: Desenvolvimento) | Nome do span `invoke_agent {gen_ai.agent.name}`; atributos obrigatórios `gen_ai.operation.name`, `gen_ai.provider.name`; recomendados: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                       |
| LangSmith — limite de 25.000 execuções / trace                                                                      | Sessões longas de agente eventualmente forçam a divisão do trace; favorece o design com traceId híbrido.                                                                                                                                                                                                                     |
| [Sentry — tracing distribuído](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)             | "Transações filhas podem sobreviver às transações que contêm seus spans pais" — filho com vida mais longa que o pai é suportado.                                                                                                                                                                                              |
| claude-code (Anthropic)                                                                                              | Possui hierarquia de subagentes apenas em arquivo JSON local do Perfetto; exportação OTel é plana. Nenhum código portável.                                                                                                                                                                                                    |
| opencode (sst/opencode)                                                                                              | Usa instrumentação automática `@effect/opentelemetry`; `context.with(trace.setSpan(active, span), fn)` explícito para `withRunSpan`. **Valida o padrão de isolamento context.with.** O aviso sobre registro manual de `AsyncLocalStorageContextManager` não se aplica — o `NodeSDK` do qwen-code o registra automaticamente. |
## Design — seis decisões, cada uma justificada

### D1 — Ciclo de vida do span: chamador abre, chamado executa dentro de `context.with(span, fn)`

`agent.ts` (chamador) constrói o span. O corpo — seja aguardado (`runFramed`) ou fire-and-forget (`runInForkContext` / background) — executa dentro de `runInSubagentSpanContext(span, fn)`, que chama `otelContext.with(trace.setSpan(active, span), fn)`.

**Onde exatamente em `AgentTool.execute` o span é aberto?** Abra-o **logo ANTES da configuração específica do tipo de invocação** (`createAgentHeadless` / `createForkSubagent` etc.) — para que o tempo de configuração (construção de config, reconstrução do ToolRegistry, fiação do ContextOverride) SEJA incluído na duração de `qwen-code.subagent`. Operadores monitorando "por que este subagent está lento?" veem o quadro completo. A configuração tipicamente << tempo de LLM, então isso não introduz ruído.

Alternativa considerada: abrir depois da configuração, excluindo o tempo de configuração. Rejeitada porque a configuração do subagent é, por si só, trabalho atribuível ao subagent — ocultá-la torna o cálculo de duração total incorreto ao somar todos os spans de subagent.

**Por que não apenas no chamado**: quando o corpo de fork / background realmente executa, o chamador já retornou. O `context.active()` do OTel então retorna o contexto ambiente que o runtime assíncrono carrega — o que para `void` fire-and-forget após o pai terminar é imprevisível. O span pai já foi fechado; reparentalização após o fato é incorreta.

**Por que não apenas no chamador**: foreground funciona bem assim, mas spans de fork / background precisam continuar emitindo spans filhos (LLM / tool / hook) depois que `AgentTool.execute` retornar. Esses spans filhos precisam que `context.active()` retorne o span do subagent — o que só acontece se o corpo executar explicitamente dentro de `context.with(subagentSpan, body)`.

Ambos os lados são necessários. **O design é a ponte** — o chamador cria o span + estratégia de traceId ciente do tipo de invocação, depois passa o bastão via `runInSubagentSpanContext`.

### D2 — traceId híbrido: foreground = span filho, fork/background = novo traceId + Link

| Tipo de invocação | Pai                      | TraceId                 | Motivo                                                                                                                                                                          |
| --------------- | --------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`    | filho do span de tool do chamador | herda o traceId do pai | Padrão OTel; o chamador encapsula totalmente o chamado temporalmente                                                                                                                        |
| `fork`          | span raiz vinculado (linked) | novo traceId             | O chamador retorna imediatamente; o fork executa através de múltiplas interações subsequentes. A especificação OTel recomenda Link para este caso. Evita inflar a duração / tamanho do trace pai. |
| `background`    | span raiz vinculado (linked) | novo traceId             | Mesmo raciocínio do fork.                                                                                                                                                      |

**Payload do Link**:

```ts
tracer.startSpan(
  'qwen-code.subagent',
  {
    kind: SpanKind.INTERNAL,
    links: [
      {
        context: invokerSpanContext,
        attributes: { 'qwen-code.link.kind': 'invoker' },
      },
    ],
  } /* contexto explícito = root, sem herdar o ativo */,
);
```

Consultabilidade entre traces via id de sessão: `gen_ai.conversation.id` é definido em todo span de subagent (tanto foreground quanto root vinculado), então uma consulta ARMS por `session.id` retorna tanto o trace da interação pai QUANTO os traces dos subagents root vinculados. O Link em si aparece na interface do trace pai como "Spawned: subagent X (other trace)", permitindo navegação.

**Por que não sempre filho**: um background subagent de 4 horas infla a duração de parede do trace pai para 4 horas; o tamanho do trace cresce além dos limites de vários backends (o limite de 25.000 runs do LangSmith é o limite documentado mais claro). Subagents foreground que o usuário está realmente esperando não têm esse problema porque estão temporalmente contidos.

**Por que não sempre root vinculado**: foreground quebra a árvore natural do trace. Uma prompt de usuário que executa um subagent Explore síncrono DEVE mostrar uma árvore, não dois traces vinculados.

### D3 — TTL: ciente do tipo, subagent fork/background = 4h, outros = 30min

`session-tracing.ts:124` define `SPAN_TTL_MS = 30 * 60 * 1000`. A varredura em `:144-152` já trata `tool.blocked_on_user` de forma especial para marcar `decision: 'aborted' + source: 'system'`. Já é ciente do tipo em espírito.

**Mudança**: introduzir TTL por tipo:

```ts
const SPAN_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30min
const SPAN_TTL_MS_LONG = 4 * 60 * 60 * 1000; // 4h

function ttlFor(ctx: SpanContext): number {
  if (
    ctx.type === 'subagent' &&
    ctx.attributes['qwen-code.subagent.invocation_kind'] !== 'foreground'
  ) {
    return SPAN_TTL_MS_LONG;
  }
  return SPAN_TTL_MS_DEFAULT;
}
```
Ao expirar o TTL, os spans de subagente recebem a seguinte marcação:

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**Por que não 30 minutos fixos**: subagentes longos legítimos (análise de repositórios grandes, builds lentos, tarefas de pesquisa aprofundada) seriam marcados erroneamente como expirados por TTL. 4 horas cobre o percentil 99 sem ser tão folgado que travamentos reais passem despercebidos.

**Por que não sem TTL**: falha do processo / OOM / kill -9 → o span permanece no mapa `activeSpans` para sempre. A rede de segurança de 30 minutos protege contra isso; o subagente fork/background só precisa de uma janela maior, não da remoção.

**De onde vieram as 4 horas**: limite superior pragmático para tarefas de agente não triviais (pesquisa aprofundada longa / análise de base de código grande). Configurável via constante se dados de produção mostrarem que estamos errados.

### D4 — Retenção de LogRecord: manter emissão, pular a ponte LogToSpanProcessor

O LogRecord `SubagentExecutionEvent` tem 3 consumidores downstream (verificado por auditoria do repositório):

| Consumer                                                                                     | Posição                                             | Ação                                                                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → span ponte `qwen-code.subagent_execution`            | `loggers.ts:773` → `log-to-span-processor.ts:346` | **Pular essa ponte** para o evento do subagente — novo span `qwen-code.subagent` o substitui        |
| Ingestão QwenLogger RUM (estatísticas internas Aliyun)                                       | `qwen-logger.ts:573-574`                            | Manter — RUM não vê spans OTel, apenas LogRecords                                                   |
| Contador `recordSubagentExecutionMetrics`                                                    | `metrics.ts:829`                                    | Manter — consumidor de métricas é independente da ponte de rastreamento                             |

**Pulo da ponte** (a única alteração no LogToSpanProcessor):

```ts
// log-to-span-processor.ts — dentro de onEmit, depois de deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // coberto pelo span nativo qwen-code.subagent
]);
if (skipBridge.has(eventName)) return;
```

**Impacto no consumidor de rastreamento**: dashboards que filtram pelo nome de span `qwen-code.subagent_execution` começarão a retornar zero resultados. Eles devem ser atualizados para `qwen-code.subagent`. Observar isso nas notas de versão.

**Por que não deletar o LogRecord**: ele é a entrada para RUM e métricas. Deletá-lo é uma refatoração de 3 sistemas; fora do escopo aqui.

**Por que não manter ambos**: o rastreamento mostraria dois spans por subagente (`qwen-code.subagent` + `qwen-code.subagent_execution`) carregando informações sobrepostas — confuso para operadores lendo rastreamentos, volume duplicado de spans.

### D5 — Nome do span + atributos: conformidade híbrida com a especificação, prefixo de fornecedor para extensões

**Nome do span**: `qwen-code.subagent` (corresponde à convenção da base de código das Fases 1/2: `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …).

A especificação OTel GenAI diz que o nome canônico do span é `invoke_agent {gen_ai.agent.name}` — mas **também** diz que "sistemas/frameworks GenAI individuais PODEM especificar formatos de nome de span diferentes". Usamos nosso próprio nome e definimos `gen_ai.operation.name='invoke_agent'` para que ferramentas cientes da especificação ainda identifiquem o span. Operadores lendo nossa árvore de rastreamento veem nomes consistentes `qwen-code.*`.

**Tipo de span**: `INTERNAL` (invocação de subagente em processo, conforme a especificação).

**Conjunto de atributos**:

| Categoria                                                              | Atributo                                        | Fonte                                                                | Notas                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Especificação obrigatória**                                          | `gen_ai.operation.name='invoke_agent'`          | literal                                                              | obrigatório pela especificação                                                                                                                                                 |
| **Especificação obrigatória**                                          | `gen_ai.provider.name='qwen-code'`              | literal                                                              | obrigatório pela especificação; ambíguo para agentes em processo (a especificação foi escrita para provedor de LLM). Definir como `'qwen-code'` é a interpretação mais honesta |
| **Obrigatório (emissão dupla)**                                        | `gen_ai.agent.id` + `qwen-code.subagent.id`     | `agentContext.agentId`                                               | emitir em duplicata até a especificação atingir Stable; remover chave do fornecedor depois                                                                                     |
| **Obrigatório (emissão dupla)**                                        | `gen_ai.agent.name` + `qwen-code.subagent.name` | `agentConfig.subagentType` (ex. `Explore`, `code-reviewer`, `fork`) | mesma emissão dupla                                                                                                                                                            |
| **Recomendado pela especificação**                                     | `gen_ai.conversation.id`                        | `config.getSessionId()`                                              | permite consultas entre rastreamentos por sessão; coexiste com o atributo de span `session.id` existente (definido globalmente conforme #4367) — ambos apontam para o mesmo UUID, remover um quando a especificação estabilizar |
| **Recomendado pela especificação**                                     | `gen_ai.request.model`                          | substituição de modelo, se houver                                    | apenas quando o subagente substitui o modelo pai                                                                                                                               |
| **Fornecedor**                                                         | `qwen-code.subagent.invocation_kind`            | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | direciona estratégia de TTL + traceId                                                                                                                                          |
| **Fornecedor**                                                         | `qwen-code.subagent.is_built_in`                | bool                                                                 | filtro de dashboard                                                                                                                                                            |
| **Fornecedor**                                                         | `qwen-code.subagent.parent_agent_id`            | `agentId` do ALS pai                                                  | para subagentes aninhados + linhagem entre rastreamentos                                                                                                                        |
| **Fornecedor**                                                         | `qwen-code.subagent.depth`                      | profundidade pai + 1 (topo = 0)                                      | detector de bugs de recursão                                                                                                                                                   |
| **Fornecedor**                                                         | `qwen-code.subagent.invoking_request_id`        | de `agentContext`                                                    | correlação em nível de requisição                                                                                                                                              |
| **Especificação de fim de span**                                       | `error.type` (em falha)                         | classe do erro                                                       | padrão OTel                                                                                                                                                                    |
| **Especificação de fim de span**                                       | `exception.message` (em falha)                  | `truncateSpanError(error.message)`                                   | padrão OTel; reutiliza truncamento da Fase 2                                                                                                                                   |
| **Fornecedor de fim de span**                                          | `qwen-code.subagent.status`                     | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | mais refinado que o SpanStatus do OTel (que é OK / ERROR / UNSET)                                                                                                               |
| **Fornecedor de fim de span**                                          | `qwen-code.subagent.terminate_reason`           | de `SubagentExecutionEvent.terminate_reason`                         | ex. `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                |
| **Fornecedor de fim de span**                                          | `qwen-code.subagent.result_summary_present`     | bool                                                                 | "o subagente produziu saída?" — limitado                                                                                                                                       |
| **Opt-in (sensível)** controlado por `includeSensitiveSpanAttributes` | `gen_ai.input.messages`                         | histórico de chat estruturado                                        | reutiliza a proteção de #4097                                                                                                                                                  |
| **Opt-in (sensível)**                                                  | `gen_ai.output.messages`                        | respostas do modelo                                                  | mesma proteção                                                                                                                                                                 |
| **Opt-in (sensível)**                                                  | `gen_ai.system_instructions`                    | prompt do sistema                                                    | mesma proteção                                                                                                                                                                 |
| **Opt-in (sensível)**                                                  | `gen_ai.tool.definitions`                       | esquemas de ferramentas                                              | mesma proteção                                                                                                                                                                 |
**Mapeamento de SpanStatus**:

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` ou `'aborted'` → `SpanStatus { code: UNSET }` (segue a convenção da Fase 2)

**Por que emitir em dupla para `id` + `name`**: a especificação está em Desenvolvimento (um estágio antes de Experimental). Existe `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` para opt-in. Os nomes de atributos da especificação podem ser renomeados antes de Stable. A emissão dupla é o mesmo padrão que a Fase 2 usou para `call_id` → `tool.call_id`; remova a chave do vendor quando a especificação atingir Stable.

**Por que `qwen-code.subagent.*` (não `qwen.subagent.*`)**: toda chave existente com prefixo de vendor em `constants.ts` usa `qwen-code.*` (`qwen-code.user_prompt`, `qwen-code.tool_call`, etc.). Consistência interna > preferência de convenção de nomenclatura OTel, já que operadores consultam ARMS pelo prefixo.

**Cardinalidade**: atributos de span não são rótulos de métrica no OTel; atributos com chave UUID (`id`, `parent_agent_id`, `invoking_request_id`) são seguros na camada de span. Não os promova a rótulos de métrica posteriormente.

**~10-15 atributos por span** (dependendo do tipo de invocação, falha, aninhamento). Mesma ordem que `qwen-code.tool`.

### D6 — Campo `AgentContext.depth` adicionado diretamente

`AgentContext` (`agent-context.ts:32`) **não é exportada** — apenas os helpers (`getCurrentAgentId`, `runWithAgentContext`, `getRuntimeContentGenerator`, `runWithRuntimeContentGenerator`) são. Zero quebra downstream em nível TypeScript. Os 6 leitores conhecidos via `getCurrentAgentId()` apenas leem `agentId`; adicionar `depth?: number` é invisível para eles.

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // NOVO — padrão 0 nos leitores
}
```

`runWithAgentContext` já usa espalhamento `{ ...current, agentId }`, então `depth` sobrevive aos pontos de chamada existentes sem alterações. **Atualize `runWithAgentContext` para incrementar `depth` automaticamente internamente** — nenhum chamador precisa saber sobre `depth`:

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // auto-incremento
  };
  return agentContextStorage.run(next, fn);
}
```

Subagente de nível superior: nenhum ALS pai → `depth: 0`. Aninhado: depth do pai + 1.

Um novo acessor minúsculo `getCurrentAgentDepth(): number` retorna `agentContextStorage.getStore()?.depth ?? 0` — usado por `startSubagentSpan` para preencher `qwen-code.subagent.depth`.

**Por que não um ALS separado apenas para telemetria**: duplicaria a mesma forma de contexto que já mantemos. Ruim. Reutilize o existente.

## API Helper (`session-tracing.ts`)

```ts
// constants.ts
export const SPAN_SUBAGENT = 'qwen-code.subagent';

// session-tracing.ts
export interface StartSubagentSpanOptions {
  agentId: string;
  subagentName: string;
  invocationKind: 'foreground' | 'fork' | 'background';
  isBuiltIn: boolean;
  parentAgentId?: string;
  depth: number;
  invokingRequestId?: string;
  sessionId: string;
  modelOverride?: string;
  invokerSpanContext?: SpanContext; // obrigatório para fork / background (fonte do Link)
}

export interface SubagentSpanMetadata {
  status: 'completed' | 'failed' | 'cancelled' | 'aborted';
  terminateReason?: string;
  resultSummaryPresent?: boolean;
  error?: string;
  errorType?: string;
}

export function startSubagentSpan(opts: StartSubagentSpanOptions): Span;
export function endSubagentSpan(
  span: Span,
  metadata: SubagentSpanMetadata,
): void;
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T>;
```

`runInSubagentSpanContext` é a primitiva de isolamento:

```ts
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = trace.setSpan(otelContext.active(), span);
  return otelContext.with(ctx, fn);
}
```

`startSubagentSpan` internamente ramifica com base em `invocationKind`:

```ts
function startSubagentSpan(opts: StartSubagentSpanOptions): Span {
  const attributes = buildSpanAttributes(opts);
  const tracer = getTracer();

  if (opts.invocationKind === 'foreground') {
    // Filho do span ativo atual (span de ferramenta do chamador)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: span raiz vinculado
  return tracer.startSpan(SPAN_SUBAGENT, {
    kind: SpanKind.INTERNAL,
    attributes,
    links: opts.invokerSpanContext
      ? [
          {
            context: opts.invokerSpanContext,
            attributes: { 'qwen-code.link.kind': 'invoker' },
          },
        ]
      : undefined,
    root: true, // força novo traceId; ignora contexto ativo como pai
  });
}
```

## Integração do ciclo de vida

### Foreground nomeado (o caminho comum)

```ts
// agent.ts:~2154
// Puxa o frame ALS pai para definir parentAgentId no span. A profundidade do
// novo filho é calculada automaticamente dentro de runWithAgentContext (D6) —
// a leitura é feita via getCurrentAgentDepth() uma vez que estamos DENTRO do
// frame ALS filho. Duas etapas:
const parentAgentId = getCurrentAgentId();  // ANTES de entrar no frame filho

// ... a chamada runFramed existente entra em runWithAgentContext(hookOpts.agentId, ...) ...

// DENTRO de runFramed, podemos ler a profundidade do filho:
//   const depth = getCurrentAgentDepth();
//
// Posicionamento prático: passe `depth` como uma variável de closure, definida
// depois que runWithAgentContext entra em vigor — OU calcule como
// `(getCurrentAgentDepth() fora) + 1` do lado do chamador (mais simples).
const depth = getCurrentAgentDepth();  // fora do frame; o filho será este + 1
// (defina qwen-code.subagent.depth = depth nos argumentos de startSubagentSpan)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext omitido — foreground herda naturalmente via context.with
});
let metadata: SubagentSpanMetadata = { status: 'aborted' };
try {
  await runInSubagentSpanContext(span, () =>
    runFramed(() => this.runSubagentWithHooks(...)),
  );
  metadata = { status: 'completed' /* + resultSummaryPresent */ };
} catch (error) {
  metadata = {
    status: signal.aborted ? 'aborted' : 'failed',
    error: error instanceof Error ? error.message : String(error),
    errorType: error?.constructor?.name,
  };
  throw error;
} finally {
  endSubagentSpan(span, metadata);
}
```
### Fork (dispara-e-esquece)

```ts
const invokerSpanContext = trace.getSpan(otelContext.active())?.spanContext();
const span = startSubagentSpan({
  ..., invocationKind: 'fork', invokerSpanContext,
});
void runInForkContext(() =>
  runInSubagentSpanContext(span, async () => {
    let metadata: SubagentSpanMetadata = { status: 'aborted' };
    try {
      await runFramedFork();
      metadata = { status: 'completed' };
    } catch (error) {
      metadata = {
        status: signal.aborted ? 'aborted' : 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      endSubagentSpan(span, metadata);
    }
  }),
);
// AgentTool.execute returns FORK_PLACEHOLDER_RESULT immediately;
// span lives across subsequent interactions of the parent session.
```

### Background

Mesma estrutura do fork, com `invocationKind: 'background'` e `bgEventEmitter` em vez de `eventEmitter`. TTL é 4h (igual ao fork — regra de tipo do D3).

## Isolamento concorrente — a garantia principal

Três invocações de subagente concorrentes a partir de um prompt de usuário (o modelo emite 3 blocos AGENT tool_use → `coreToolScheduler.runConcurrently` executa 3 `executeSingleToolCall` em paralelo; cada uma abre seu próprio span `qwen-code.tool` conforme a Fase 2):

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [agent call #A]
│  └─ qwen-code.subagent (A, foreground)     [traceId=T0, child]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [agent call #B]
│  └─ qwen-code.subagent (B, foreground)     [traceId=T0, child]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [agent call #C]
   └─ qwen-code.subagent (C, fork)           [traceId=T1, linked root]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, may emit hours later]
```

`context.with(span, runX)` para cada um de A, B, C executa concorrentemente. O `AsyncLocalStorageContextManager` (já registrado automaticamente pelo NodeSDK em `sdk.ts:273`) define escopo por fibra; sem interferência. Cada LLM filho do subagente, ferramenta / spans de hook veem `span` via `context.active()` dentro de sua própria cadeia assíncrona.

O fork (C) é um trace separado — seus spans filhos herdam `traceId=T1` mesmo quando emitidos em múltiplas interações subsequentes da sessão pai. A consulta ARMS por `session.id` retorna tanto T0 quanto T1; o Link da raiz de T1 → span `qwen-code.tool` invocador de C fornece navegação explícita.

## Arquivos a serem alterados

| Arquivo                                                                               | Mudança                                                                                                                                                                                                                       | LOC est. |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `packages/core/src/telemetry/constants.ts`                                            | Adicionar constantes `SPAN_SUBAGENT`, `SPAN_TTL_MS_LONG`, chaves de atributo                                                                                                                                                  | +8       |
| `packages/core/src/telemetry/session-tracing.ts`                                      | Adicionar `startSubagentSpan` (branch foreground/linked-root), `endSubagentSpan`, `runInSubagentSpanContext`, tipos; estender união `SpanType` com `'subagent'`; estender varredura TTL com `ttlFor(ctx)`                      | +120     |
| `packages/core/src/telemetry/log-to-span-processor.ts`                                | Lista de skip para ignorar a ponte `qwen-code.subagent_execution`                                                                                                                                                             | +6       |
| `packages/core/src/telemetry/index.ts`                                                | Re-exportar novos helpers + tipos                                                                                                                                                                                             | +6       |
| `packages/core/src/agents/runtime/agent-context.ts`                                   | Adicionar `depth?: number` a `AgentContext` + acessador `getCurrentAgentDepth()`                                                                                                                                              | +12      |
| `packages/core/src/tools/agent/agent.ts`                                              | Envolver 3 caminhos de execução (foreground/fork/background) em `runInSubagentSpanContext` com try/catch/finally                                                                                                              | +60      |
| `packages/core/src/telemetry/session-tracing.test.ts`                                 | Novo `describe('subagent spans')`: start/end, child vs linked-root, propagação de contexto, depth, TTL por tipo, end idempotente, NOOP sob SDK não inicializado                                                              | +120     |
| `packages/core/src/telemetry/log-to-span-processor.test.ts`                           | Verificar que a lista de skip ignora a ponte subagent_execution                                                                                                                                                               | +20      |
| `packages/core/src/tools/agent/agent.test.ts`                                         | End-to-end: 3 subagentes concorrentes cada um com subárvore isolada; spans do fork herdam novo traceId via Link; ciclo de vida background                                                                                     | +80      |
Total: 9 arquivos, ~430 LOC. Maior que commits típicos da Fase 2, mas justificado — a alteração de TTL toca um arquivo separado, o skip do LogToSpanProcessor é um arquivo separado, e os arquivos de teste dobram o total. Dividir resultaria em uma superfície de telemetria incompleta.

Se a revisão pressionar pelo tamanho: dividir em 2 PRs — (A) helpers de telemetria + testes, (B) conexão `agent.ts` + testes e2e. Helpers lançados primeiro não alteram comportamento de runtime.

## Estratégia de teste

| Teste                                                                                  | O que prova                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `startSubagentSpan foreground parenteia o span ativo do OTel`                          | Caminho de span filho                                              |
| `startSubagentSpan fork cria novo traceId + Link para o invocador`                     | Caminho de raiz vinculada                                          |
| `runInSubagentSpanContext propaga span através de awaits / Promise.all`                | Primitiva de isolamento                                            |
| `3 spans de subagente concorrentes não compartilham filhos`                            | Garantia de concorrência principal                                 |
| `subagente aninhado registra depth + parentAgentId`                                    | Metadados de aninhamento                                           |
| `endSubagentSpan mapeamento de status (completed / failed / cancelled / aborted)`      | Taxonomia de status                                                |
| `endSubagentSpan emite em dual gen_ai.agent.id + qwen-code.subagent.id`                | Emissão dupla conforme especificação                               |
| `Ciclo de vida fork: span sobrevive ao retorno de AgentTool.execute`                   | Correção de fire-and-forget                                        |
| `TTL: subagente fork persiste além de 30min, é carimbado e finalizado às 4h`           | TTL ciente do tipo                                                 |
| `TTL: subagente foreground aos 30min recebe sweep padrão`                              | TTL não se estende além do necessário                              |
| `LogToSpanProcessor ignora qwen-code.subagent_execution mas ainda emite para RUM`      | Skip da ponte funciona                                             |
| `runConcurrently de 3 chamadas de ferramentas de agente produz 3 spans de subagente distintos` | Teste ponta a ponta no nível do escalonador               |
| `subagente com falha define exception.message + error.type + SpanStatus=ERROR`         | Caminho de erro padrão OTel                                        |
| `Atributos opcionais controlados por includeSensitiveSpanAttributes`                   | Reutiliza a porta de #4097 corretamente                            |
| `startSubagentSpan retorna NOOP_SPAN quando SDK não está inicializado`                 | Corresponde à disciplina NOOP das Fases 1/2; chamadas posteriores permanecem seguras |
| `Link.context do span fork corresponde ao spanContext do span da ferramenta invocadora` | Navegação entre traces funciona ponta a ponta                    |
| `runWithAgentContext incrementa automaticamente depth: parent=0, child=1, grandchild=2`| A contabilidade de depth está correta sem cooperação do chamador   |

## Casos de borda

| Caso                                                                                                                       | Tratamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subagente dentro de ferramenta dentro de subagente (depth > 1)                                                             | Atributo `depth` rastreia; recomenda-se `debugLogger.warn` suave em depth ≥ 5 (detector de recursão infinita)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Subagente gerado durante `awaiting_approval` de uma ferramenta pai                                                         | O span do subagente é filho do span AGENT TOOL; o `tool.blocked_on_user` da ferramenta AGENT é irmão, não pai — ambos são filhos do span AGENT TOOL. A árvore permanece correta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `signal.aborted` no meio do subagente                                                                                      | O callback de `runInSubagentSpanContext` lança exceção ou resolve; `finally` define `status='aborted'`, SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Fork ainda vivo quando a sessão pai termina                                                                                | TTL de 4h é acionado; atributos sentinela `qwen-code.span.ttl_expired:true`, `qwen-code.subagent.terminate_reason='ttl_swept'`, `status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `endSubagentSpan` chamado duas vezes                                                                                       | Idempotente — verifica o mapa `activeSpans`; segunda chamada não faz nada (corresponde ao padrão da Fase 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Chamada LLM do subagente usa um modelo diferente do pai                                                                   | `gen_ai.request.model` definido no span do subagente; o sub-span da requisição LLM TAMBÉM registra o modelo — sem conflito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Exceção no prelúdio de subagente irmão escapa de `attemptExecutionOfScheduledCalls`                                        | Cai no catch recém-corrigido da Fase 2 de `handleConfirmationResponse`, que está FORA do try — não atribuído ao span da ferramenta confirmada. O span do subagente fecha corretamente via seu próprio try/finally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Fork concorrente + foreground a partir de um mesmo pai                                                                     | Foreground herda traceId T0, fork obtém T1. Ambos têm propagação de contexto correta independentemente. O span da ferramenta pai termina quando seu trabalho síncrono retorna; o span fork (trace separado) continua                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Span fork inicia no fluxo síncrono do chamador, mas o corpo executa depois                                                | `startSubagentSpan` é chamado ANTES de `void runInForkContext(...)`, então o span (e seu Link para o invocador) é capturado enquanto o spanContext do invocador ainda está legível. A duração do span, portanto, inclui qualquer atraso de agendamento na fila de microtasks antes de o corpo realmente iniciar — tipicamente sub-ms; se em produção surgirem lacunas não triviais, um atributo separado `qwen-code.subagent.scheduling_delay_ms` pode ser adicionado (questão em aberto)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| SDK não inicializado (telemetria desabilitada)                                                                             | `startSubagentSpan` retorna cedo NOOP_SPAN (corresponde a todos os outros helpers das Fases 1/2). `runInSubagentSpanContext(NOOP_SPAN, fn)` ainda chama `fn` normalmente. `endSubagentSpan(NOOP_SPAN, …)` não faz nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Spans da ponte de log do fork (`tool_call`, `api_request`, etc.) usam traceId derivado da sessão, enquanto spans nativos do fork usam T1 | Comportamento preexistente — spans da ponte de log sempre usam `deriveTraceId(sessionId)`, spans nativos usam contexto OTel. A divergência é invisível dentro de um único trace, mas significa que uma consulta ARMS por traceId em T1 não incluirá filhos da ponte de log do fork. Fora do escopo deste PR; apontado como questão em aberto #5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Pais do span hook `SubagentStart` diferem entre foreground e background                                                    | Foreground dispara `fireSubagentStartEvent` dentro de `runSubagentWithHooks` → já dentro de `runInSubagentSpanContext`, então o span hook parenteia sob `qwen-code.subagent`. Background dispara ANTES do wrapping `runWithSubagentSpan` (portanto o span do subagente ainda não existe), então seu span hook parenteia sob o AGENT `qwen-code.tool`. Operadores consultando "spans hook sob spans de subagente" devem esperar que o `SubagentStart` de bg esteja ausente dessa visão. Mover o disparo do hook bg para dentro de `framedBgBody` é mecanicamente simples (a mutação de `contextState` chega a `bgSubagent.execute` de qualquer forma), mas muda a semântica visível ao usuário: hoje o hook dispara de forma síncrona antes de `AgentTool.execute` retornar a mensagem "Agente em segundo plano lançado", então qualquer trabalho síncrono de configuração que o hook faça ocorre dentro do turno de bloqueio do usuário; movê-lo faz o hook disparar de forma desprendida após a mensagem de lançamento retornar. Adiado enquanto se decide deliberadamente qual semântica é preferida. |
## Rollback

A alteração é aditiva no nível do OTel — dashboards existentes que não filtram por nomes de span relacionados a subagentes continuam funcionando. Consumidores de trace que agrupam por span pai verão novos nós `qwen-code.subagent` entre `qwen-code.tool` e `qwen-code.llm_request`; documentar nas notas de lançamento.

A alteração que afeta o comportamento é a omissão do LogToSpanProcessor — dashboards que consumiam o span `qwen-code.subagent_execution` passarão a retornar zero. Mitigação: manter o LogRecord intacto (RUM + métricas ainda o veem); apenas a bridge de span é removida. Consultas existentes baseadas em log não são afetadas.

Caminho de rollback: reverter o único PR. Os novos helpers de span são invocados apenas a partir de `agent.ts`; remover a conexão + a omissão do LogToSpanProcessor restaura o comportamento anterior 1:1.

## Implicações de amostragem

| Invocação                                          | Fonte da decisão de amostragem                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `foreground` (span filho, mesmo traceId)            | Herda a decisão de amostrar ou não do trace pai via amostrador baseado no pai |
| `fork` / `background` (root vinculado, novo traceId) | Decisão independente de amostragem na criação da raiz                         |

Para o padrão atual do qwen-code (conforme `tracer.ts:shouldForceSampled()` — parentbased + always_on, caso contrário always_on), todo span é amostrado, então a divergência não afeta. Para implantações que usam amostradores probabilísticos (ex.: `traceidratio=0.1`), isso significa:

- Um prompt de usuário pode ser amostrado (T0 totalmente capturado), mas seu fork (T1) pode ser descartado, ou vice-versa.
- Operadores lendo o T0 pai veem "Link: subagent C (T1)" — clicar pode resultar em 404 se T1 não foi amostrado.

Mitigação: documentar para operadores. Se a captura completa de subagentes for importante, forçar amostragem para fork/background por meio de um futuro knob de configuração. Fora do escopo aqui.

## Atributos sensíveis (integração #4097)

Reutilizar a porta existente `includeSensitiveSpanAttributes`. Quando verdadeiro, definir no span do subagente nos hooks do ciclo de vida onde os dados estão disponíveis:

| Atributo spec                 | Fonte                                                      | Quando definir                                                                             |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `gen_ai.system_instructions`  | prompt de sistema renderizado do `agentConfig` / contexto pai | `startSubagentSpan` (se disponível antes da abertura do span) ou via `setAttributes` no início do corpo |
| `gen_ai.tool.definitions`     | declarações de ferramenta disponíveis para o subagente       | o mesmo que acima                                                                          |
| `gen_ai.input.messages`       | entrada inicial passada ao subagente (prompt + extraHistory) | no início do corpo                                                                         |
| `gen_ai.output.messages`      | mensagens de resposta final retornadas pelo subagente        | nos metadados de `endSubagentSpan`                                                          |

Todos já estão protegidos; o padrão do #4097 é chamar o helper `addSubagentSensitiveAttributes(span, opts)` de dentro do corpo. Detalhe de implementação — o design apenas anota o ponto de integração.

## Sequenciamento

- Independente do #4367 (atributos de recurso — em revisão). Nenhuma restrição de ordem de merge, mas `gen_ai.conversation.id` nos spans de subagente se beneficia do `session.id` movido para fora do recurso no #4367. **Recomendamos landing do #4367 primeiro** para que a fonte da verdade de `getSessionId()` esteja estabelecida.
- Independente da Fase 4 (decomposição da requisição LLM / TTFT). A Fase 4 se anexa aos spans `qwen-code.llm_request` independentemente de estarem sob um subagente ou uma interação. Recomendamos a Fase 3 antes da Fase 4 para que as métricas por tentativa da Fase 4 possam ser agregadas por subagente.

## Perguntas em aberto

1. **`gen_ai.provider.name`**: a spec exige, mas escreve a descrição para provedor LLM, não para framework de agente. Definir como `'qwen-code'` é a melhor interpretação; se uma revisão futura da spec adicionar uma variante `agent.provider.name`, devemos trocar.
2. **Nome do span `qwen-code.subagent` vs spec `invoke_agent {name}`**: optou-se por consistência interna. Se a adoção de ferramentas com conhecimento de GenAI crescer e `invoke_agent ${name}` se tornar crítico para autodescoberta, podemos trocar — o nome do span é a coisa mais rebrandável do OTel.
3. **Aviso suave para profundidade ≥ 5**: número arbitrário. Poderia ser um knob de configuração. Adiar até que dados de produção mostrem necessidade.
4. **A saída completa do LLM de `SubagentExecutionEvent.result` é grande**: hoje isso aumenta o volume de LogRecord. O plano de migração (LogRecord → eventos de span) é adiado, mas vale a pena fazer uma vez que a agregação de uso de tokens chegar na Fase 4.
5. **Spans de bridge de log dentro de um fork acabam no traceId derivado da sessão, não no T1 do fork**: ver casos de borda. A correção é o problema mais amplo "o span de interação não herda o contexto raiz da sessão" levantado no tópico sessionId-vs-traceId — um design separado que afeta todos os spans nativos, não apenas subagentes. Fora do escopo.
