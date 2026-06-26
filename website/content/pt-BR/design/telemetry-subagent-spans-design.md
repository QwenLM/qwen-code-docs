# Design da Árvore de Trace de Subagente (P3 Fase 3)

> Issue #3731 — Fase 3 do rastreamento hierárquico de sessão. Adiciona um span `qwen-code.subagent` para que invocações de subagentes tenham uma estrutura de trace isolada e consultável, em vez de se misturarem silenciosamente sob o span pai `qwen-code.interaction`.
>
> Baseia-se na Fase 1 (#4126), Fase 1.5 (#4302) e Fase 2 (#4321).

## Problema

Hoje, toda execução de `AgentTool.execute` roda sob o span `qwen-code.interaction` do pai. Três patologias:

1. **Subagentes concorrentes se misturam.** `coreToolScheduler.ts:728` marca `AGENT` como seguro para concorrência — `Promise.all` executa até 10 subagentes em paralelo. Seus spans de LLM-request / tool / hook se anexam todos ao único span de interação pai compartilhado, então exploradores de trace não conseguem distinguir "esta requisição LLM pertence ao subagente A" de "esta pertence ao subagente B".
2. **Nenhum span para a própria fronteira do subagente.** Existe um LogRecord `qwen-code.subagent_execution` (emitido de `agent-headless.ts:268,329`) conectado a um span de mesmo nome via `LogToSpanProcessor`, mas é um marcador independente, não um pai que aninhe os spans de LLM / tool / hook do subagente abaixo dele.
3. **Subagentes fork / background flutuam soltos.** Caminhos fire-and-forget (`runInForkContext` / background) sobrevivem ao `AgentTool.execute` pai e emitem spans ao longo de múltiplas interações subsequentes do usuário. O span da tool pai já foi encerrado quando esses spans aparecem, então o `context.active()` do OTel não ajuda — eles se anexam a qualquer interação que estivesse ativa no momento da execução, ou a nenhuma.

## Superfície existente (nenhuma alteração)

| Componente                          | Localização                                                                                                                                                                                         | Por que não mexemos                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Local de spawn (unificado)          | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                                 | Ponto de entrada único; gancho ideal para 3 tipos de invocação |
| Três tipos de invocação             | foreground-named (`runFramed` em `:2154` — aguardado), fork (`void runInForkContext(runFramedFork)` em `:1991` — fire-and-forget), background (`void framedBgBody()` em `:1934` — fire-and-forget) | O ciclo de vida difere — o design do span cobre todos os três |
| Concorrência                        | `coreToolScheduler.runConcurrently` (`Promise.all`, cap 10) — impulsionado por `partitionToolCalls` marcando AGENT como `concurrent: true`                                                         | A razão que torna o isolamento necessário                |
| `runInForkContext` ALS              | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                         | Apenas guardião recursivo-fork — NÃO propaga contexto OTel |
| ALS de identidade do agente         | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                         | Já carrega `agentId`; estendemos com `depth`              |
| LogRecord `SubagentExecutionEvent`  | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 downstreams (ponte de span LogToSpanProcessor + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                              | LogRecord permanece; downstreams dependem dele            |

## Fora do escopo (adiado)

- **Agregação de uso de token por subagente** (`gen_ai.usage.*` somados em todos os spans LLM dentro de um subagente). Pertence à Fase 4 (decomposição de requisição LLM).
- **Migração do LogRecord `qwen-code.subagent_execution` para o novo span como eventos de span.** RUM e métricas estão fortemente acoplados ao LogRecord; adiado para um follow-up que possa renegociar todos os 3 consumidores juntos.
- **Rollup automático de custos.** Mesma razão — precisa primeiro do uso de token.
- **Remoção do marcador `concurrent: true` da tool AGENT.** Concorrência está correta; nós a instrumentamos, não a restringimos.

## Referências (evidência de decisão)

| Fonte                                                                                                                 | Principal conclusão                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OTel Trace Spec — Links entre spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)        | Textualmente: "O novo Trace vinculado também pode representar uma operação de processamento de dados assíncrona de longa duração que foi iniciada por uma das muitas requisições rápidas de entrada." → fork/background devem ser roots vinculados, não filhos.                                                                                                  |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (status: Em desenvolvimento) | Nome do span `invoke_agent {gen_ai.agent.name}`; atributos obrigatórios `gen_ai.operation.name`, `gen_ai.provider.name`; recomendados: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                                 |
| LangSmith — limite de 25.000 execuções / trace                                                                        | Sessões longas de agente forçam eventual divisão de trace; favorece design de traceId híbrido.                                                                                                                                                                                                                                      |
| [Sentry — rastreamento distribuído](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)           | "Transações-filho podem sobreviver às transações que contêm seus spans pai" — filho com vida mais longa que o pai é suportado.                                                                                                                                                                                                      |
| claude-code (Anthropic)                                                                                               | Possui hierarquia de subagente em arquivo Perfetto local apenas; export OTel é plano. Nenhum código portável.                                                                                                                                                                                                                       |
| opencode (sst/opencode)                                                                                               | Usa instrumentação automática `@effect/opentelemetry`; `context.with(trace.setSpan(active, span), fn)` explícito para `withRunSpan`. **Valida o padrão de isolamento context.with.** O aviso deles sobre registro manual de `AsyncLocalStorageContextManager` não se aplica — o `NodeSDK` do qwen-code o registra automaticamente. |

## Design — seis decisões, cada uma justificada

### D1 — Ciclo de vida do span: chamador abre, calado executa dentro de `context.with(span, fn)`

`agent.ts` (chamador) constrói o span. O corpo — seja aguardado (`runFramed`) ou fire-and-forget (`runInForkContext` / background) — executa dentro de `runInSubagentSpanContext(span, fn)`, que chama `otelContext.with(trace.setSpan(active, span), fn)`.

**Onde exatamente em `AgentTool.execute` o span abre?** Abra-o **logo ANTES da configuração específica do tipo de invocação** (`createAgentHeadless` / `createForkSubagent` etc.) — para que o tempo de setup (construção de config, reconstrução de ToolRegistry, fiação de ContextOverride) SEJA incluído na duração de `qwen-code.subagent`. Operadores rastreando "por que este subagente está lento?" veem o quadro completo. Setup tipicamente << tempo LLM, então isso é livre de ruído.

Alternativa considerada: abrir após o setup, excluindo o tempo de setup. Rejeitada porque o setup do subagente é em si mesmo trabalho atribuível ao subagente — escondê-lo torna a matemática de duração total errada ao somar todos os spans de subagentes.

**Por que não apenas no calado**: quando o corpo de fork/background realmente executa, o chamador já retornou. O `context.active()` do OTel então retorna qualquer contexto ambiente que o runtime assíncrono carregue — que para `void` fire-and-forget após o fim do pai é não confiável. O span pai já foi fechado; reparentalização posterior é errada.

**Por que não apenas no chamador**: foreground funciona bem assim, mas spans de fork/background precisam continuar emitindo spans-filho (LLM / tool / hook) após `AgentTool.execute` retornar. Esses spans-filho precisam que `context.active()` retorne o span do subagente — o que só acontece se o corpo executar explicitamente dentro de `context.with(subagentSpan, body)`.

Ambas as pontas são necessárias. **O design é a ponte** — chamador cria span + estratégia de traceId de acordo com o tipo de invocação, então entrega via `runInSubagentSpanContext`.

### D2 — traceId híbrido: foreground = span filho, fork/background = novo traceId + Link

| Tipo de invocação | Pai                        | traceId                 | Por que                                                                                                                                                                          |
| ----------------- | -------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`      | filho do span de tool do chamador | herda traceId do pai   | Padrão OTel; chamador envolve completamente o calado temporalmente                                                                                                                 |
| `fork`            | span root vinculado        | novo traceId             | Chamador retorna imediatamente; fork executa em múltiplas interações subsequentes. Especificação OTel recomenda textualmente Link para isso. Evita inflar duração/tamanho do trace pai. |
| `background`      | span root vinculado        | novo traceId             | Mesmo raciocínio que fork.                                                                                                                                                      |

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
  } /* contexto explícito = root, não herdando active */,
);
```

Capacidade de consulta entre traces via id de sessão: `gen_ai.conversation.id` é definido em todo span de subagente (foreground e root vinculado igualmente), então uma consulta ARMS por `session.id` retorna tanto o trace da interação pai QUANTO os traces dos subagentes root vinculados. O Link em si aparece na UI do trace pai como "Spawned: subagent X (other trace)" para que a navegação funcione.

**Por que não sempre filho**: subagente background de 4 horas infla a duração wall-clock do trace pai para 4 horas; o tamanho do trace cresce além dos limites de vários backends (o limite de 25.000 execuções do LangSmith é o mais claramente documentado). Subagentes foreground que o usuário está realmente aguardando não têm esse problema porque estão temporalmente contidos.

**Por que não sempre root vinculado**: foreground quebra a árvore de trace natural. Um prompt do usuário que executa um subagente Explore síncrono DEVERIA mostrar uma árvore, não dois traces vinculados.

### D3 — TTL: ciente do tipo, subagente fork/background = 4h, outros = 30min

`session-tracing.ts:124` define `SPAN_TTL_MS = 30 * 60 * 1000`. A varredura em `:144-152` já trata `tool.blocked_on_user` especialmente para marcar `decision: 'aborted' + source: 'system'`. Já é ciente do tipo em espírito.

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

Na expiração do TTL, spans de subagente recebem marcação:

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**Por que não 30min fixo**: subagentes longos legítimos (análise grande de repositório, builds lentos, tarefas profundas de pesquisa) são marcados incorretamente como expirados por TTL. 4h cobre o percentil 99 sem ser tão frouxo que travamentos reais passem despercebidos.

**Por que não sem TTL**: crash de processo / OOM / kill -9 → span permanece no mapa `activeSpans` para sempre. A rede de segurança de 30min protege contra isso; subagente fork/background precisa apenas de uma janela maior, não de remoção.

**De onde veio 4h**: limite superior pragmático para tarefas não triviais de agente (pesquisa profunda longa / análise de codebase grande). Configurável via constante se dados de produção mostrarem que estamos errados.

### D4 — Retenção do LogRecord: manter emissão, pular a ponte LogToSpanProcessor

O LogRecord `SubagentExecutionEvent` tem 3 consumidores downstream (verificado por auditoria do repositório):

| Consumidor                                                                         | Posição                                          | Ação                                                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → span ponte `qwen-code.subagent_execution` | `loggers.ts:773` → `log-to-span-processor.ts:346` | **Pular esta ponte** para o evento de subagente — novo span `qwen-code.subagent` o substitui |
| Ingestão QwenLogger RUM (estatísticas internas Aliyun)                             | `qwen-logger.ts:573-574`                         | Manter — RUM não vê spans OTel, apenas LogRecords                                      |
| Contador `recordSubagentExecutionMetrics`                                          | `metrics.ts:829`                                 | Manter — consumidor de métrica é independente da ponte de trace                        |

**Pulo da ponte** (a única mudança no LogToSpanProcessor):

```ts
// log-to-span-processor.ts — dentro de onEmit, após deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // coberto pelo span nativo qwen-code.subagent
]);
if (skipBridge.has(eventName)) return;
```

**Impacto no consumidor de trace**: dashboards que filtram pelo nome do span `qwen-code.subagent_execution` começarão a retornar zero resultados. Eles devem ser atualizados para `qwen-code.subagent`. Notar isso nas notas de release.

**Por que não deletar o LogRecord**: é a entrada para RUM e métricas. Deletá-lo é um refator de 3 sistemas; fora do escopo aqui.

**Por que não manter ambos**: o trace mostraria dois spans por subagente (`qwen-code.subagent` + `qwen-code.subagent_execution`) carregando informações sobrepostas — confuso para operadores lendo traces, volume duplicado de spans.

### D5 — Nome do span + atributos: conformidade híbrida com especificação, prefixo do vendor para extensões

**Nome do span**: `qwen-code.subagent` (corresponde à convenção da base de código das Fases 1/2: `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …).

A especificação OTel GenAI diz que o nome canônico do span é `invoke_agent {gen_ai.agent.name}` — mas **também** diz que "sistemas/frameworks GenAI individuais PODEM especificar formatos de nome de span diferentes." Usamos nosso próprio nome e definimos `gen_ai.operation.name='invoke_agent'` para que ferramentas cientes da especificação ainda identifiquem o span. Operadores lendo nossa árvore de trace veem nomenclatura consistente `qwen-code.*`.

**Tipo do span**: `INTERNAL` (invocação de subagente intra-processo, conforme especificação).

**Conjunto de atributos**:

| Categoria                                                         | Atributo                                       | Fonte                                                               | Notas                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Obrigatório espec**                                            | `gen_ai.operation.name='invoke_agent'`          | literal                                                              | exigido pela especificação                                                                                                                                                        |
| **Obrigatório espec**                                            | `gen_ai.provider.name='qwen-code'`              | literal                                                              | exigido pela especificação; ambíguo para agentes intra-processo (especificação foi escrita para provedor LLM). Definir como `'qwen-code'` é a interpretação mais honesta          |
| **Obrigatório (dupla emissão)**                                   | `gen_ai.agent.id` + `qwen-code.subagent.id`     | `agentContext.agentId`                                               | dupla emissão até especificação atingir Stable; remover chave do vendor depois                                                                                                     |
| **Obrigatório (dupla emissão)**                                   | `gen_ai.agent.name` + `qwen-code.subagent.name` | `agentConfig.subagentType` (ex. `Explore`, `code-reviewer`, `fork`) | mesma dupla emissão                                                                                                                                                               |
| **Recomendado espec**                                             | `gen_ai.conversation.id`                        | `config.getSessionId()`                                              | permite consultas entre traces por sessão; coexiste com o atributo de span `session.id` existente (definido globalmente por #4367) — ambos apontam para o mesmo UUID, remover um quando especificação estabilizar |
| **Recomendado espec**                                             | `gen_ai.request.model`                          | model override se houver                                             | apenas quando subagente sobrescreve modelo do pai                                                                                                                                 |
| **Vendor**                                                        | `qwen-code.subagent.invocation_kind`            | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | direciona estratégia de TTL + traceId                                                                                                                                             |
| **Vendor**                                                        | `qwen-code.subagent.is_built_in`                | bool                                                                 | filtro de dashboard                                                                                                                                                               |
| **Vendor**                                                        | `qwen-code.subagent.parent_agent_id`            | ALS pai `agentId`                                                    | para subagentes aninhados + linhagem entre traces                                                                                                                                 |
| **Vendor**                                                        | `qwen-code.subagent.depth`                      | profundidade pai + 1 (topo = 0)                                      | detector de bug de recursão                                                                                                                                                       |
| **Vendor**                                                        | `qwen-code.subagent.invoking_request_id`        | de `agentContext`                                                    | correlação em nível de requisição                                                                                                                                                 |
| **Especificação de fim de span**                                   | `error.type` (em falha)                         | classe de erro                                                       | padrão OTel                                                                                                                                                                       |
| **Especificação de fim de span**                                   | `exception.message` (em falha)                  | `truncateSpanError(error.message)`                                   | padrão OTel; reutiliza truncamento da Fase 2                                                                                                                                      |
| **Vendor de fim de span**                                         | `qwen-code.subagent.status`                     | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | mais fino que SpanStatus do OTel (que é OK / ERROR / UNSET)                                                                                                                       |
| **Vendor de fim de span**                                         | `qwen-code.subagent.terminate_reason`           | de `SubagentExecutionEvent.terminate_reason`                         | ex. `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                    |
| **Vendor de fim de span**                                         | `qwen-code.subagent.result_summary_present`     | bool                                                                 | "subagente produziu saída" — limitado                                                                                                                                             |
| **Opt-in (sensível)** protegido por `includeSensitiveSpanAttributes` | `gen_ai.input.messages`                         | histórico de chat estruturado                                       | reutiliza gate de #4097                                                                                                                                                            |
| **Opt-in (sensível)**                                           | `gen_ai.output.messages`                        | respostas do modelo                                                  | mesmo gate                                                                                                                                                                        |
| **Opt-in (sensível)**                                           | `gen_ai.system_instructions`                    | prompt do sistema                                                    | mesmo gate                                                                                                                                                                        |
| **Opt-in (sensível)**                                           | `gen_ai.tool.definitions`                       | esquemas de ferramenta                                               | mesmo gate                                                                                                                                                                        |
**Mapeamento SpanStatus**:

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` ou `'aborted'` → `SpanStatus { code: UNSET }` (segue a convenção da Fase 2)

**Por que dual-emit em `id` + `name`**: a spec está em Desenvolvimento (um passo antes do Experimental). `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` existe para opt-in. Os nomes dos atributos da spec podem ser renomeados antes do Stable. Dual-emit é o mesmo padrão que a Fase 2 usou para `call_id` → `tool.call_id`; remova a chave do fornecedor quando a spec atingir o Stable.

**Por que `qwen-code.subagent.*` (não `qwen.subagent.*`)**: toda chave existente com prefixo do fornecedor em `constants.ts` usa `qwen-code.*` (`qwen-code.user_prompt`, `qwen-code.tool_call`, etc.). Consistência interna > preferência de nomenclatura OTel, já que operadores consultam ARMS por prefixo.

**Cardinalidade**: atributos de span não são labels de métricas no OTel; atributos com chave UUID (`id`, `parent_agent_id`, `invoking_request_id`) são seguros na camada de span. Não os promova a labels de métricas depois.

**~10-15 atributos por span** (dependendo do tipo de invocação, falha, aninhamento). Mesma ordem que `qwen-code.tool`.

### D6 — Campo `AgentContext.depth` adicionado diretamente

`AgentContext` (`agent-context.ts:32`) **não é exportado** — apenas os helpers (`getCurrentAgentId`, `runWithAgentContext`, `getRuntimeContentGenerator`, `runWithRuntimeContentGenerator`) são. Zero quebra downstream no TypeScript. Os 6 leitores conhecidos via `getCurrentAgentId()` só leem `agentId`; adicionar `depth?: number` é invisível para eles.

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

`runWithAgentContext` já usa spread `{ ...current, agentId }`, então `depth` sobrevive inalterado nos locais de chamada existentes. **Atualize `runWithAgentContext` para incrementar depth automaticamente internamente** — nenhum chamador precisa saber sobre depth:

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // incremento automático
  };
  return agentContextStorage.run(next, fn);
}
```

Subagent de nível superior: sem ALS pai → `depth: 0`. Aninhado: depth do pai +1.

Um novo accessor mínimo `getCurrentAgentDepth(): number` retorna `agentContextStorage.getStore()?.depth ?? 0` — usado por `startSubagentSpan` para preencher `qwen-code.subagent.depth`.

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
  invokerSpanContext?: SpanContext; // necessário para fork / background (fonte do Link)
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
    // Filho do span ativo atual (span da ferramenta do chamador)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: raiz linkada
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

## Conexão do Ciclo de Vida

### Foreground nomeado (o caminho comum)

```ts
// agent.ts:~2154
// Pega o frame ALS pai para definir parentAgentId no span. A profundidade do novo filho
// é calculada dentro de runWithAgentContext automaticamente (D6) — a lemos
// via getCurrentAgentDepth() uma vez que estamos DENTRO do frame ALS filho.
// Duas etapas:
const parentAgentId = getCurrentAgentId();  // ANTES de entrar no frame filho

// ... chamada runFramed existente entra em runWithAgentContext(hookOpts.agentId, ...) ...

// DENTRO de runFramed, podemos ler a profundidade do filho:
//   const depth = getCurrentAgentDepth();
//
// Posicionamento prático: passe `depth` como variável de closure, definida após
// runWithAgentContext surtir efeito — OU calcule como
// `(getCurrentAgentDepth() externo) + 1` do lado do chamador (mais simples).
const depth = getCurrentAgentDepth();  // fora do frame; o filho será este + 1
// (define qwen-code.subagent.depth = depth nos args de startSubagentSpan)

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

### Fork (fire-and-forget)

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
// AgentTool.execute retorna FORK_PLACEHOLDER_RESULT imediatamente;
// o span vive por interações subsequentes da sessão pai.
```

### Background

Mesma forma do fork, com `invocationKind: 'background'` e `bgEventEmitter` no lugar de `eventEmitter`. TTL é 4h (igual ao fork — regra de tipo do D3).

## Isolamento concorrente — a garantia principal

Três invocações concorrentes de subagent a partir de um prompt de usuário (o modelo emite 3 blocos AGENT tool_use → `coreToolScheduler.runConcurrently` executa 3 `executeSingleToolCall` em paralelo; cada uma abre seu próprio span `qwen-code.tool` conforme Fase 2):

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [chamada de agente #A]
│  └─ qwen-code.subagent (A, foreground)     [traceId=T0, filho]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [chamada de agente #B]
│  └─ qwen-code.subagent (B, foreground)     [traceId=T0, filho]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [chamada de agente #C]
   └─ qwen-code.subagent (C, fork)           [traceId=T1, raiz linkada]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, pode emitir horas depois]
```

`context.with(span, runX)` para cada um de A, B, C executa concorrentemente. `AsyncLocalStorageContextManager` (já registrado automaticamente pelo NodeSDK em `sdk.ts:273`) escopa por fiber; sem interferência. Os spans filhos LLM / ferramenta / hook de cada subagent veem `span` via `context.active()` dentro de sua própria cadeia async.

Fork (C) é um trace separado — seus spans filhos herdam `traceId=T1` mesmo quando emitidos em múltiplas interações subsequentes da sessão pai. ARMS consulta por `session.id` retorna tanto T0 quanto T1; o Link da raiz de T1 → span `qwen-code.tool` invocador de C fornece navegação explícita.

## Arquivos a modificar

| Arquivo                                                        | Alteração                                                                                                                                                                                                                                                    | LOC est |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `packages/core/src/telemetry/constants.ts`                     | Adicionar `SPAN_SUBAGENT`, `SPAN_TTL_MS_LONG`, constantes de chaves de atributo                                                                                                                                                                              | +8      |
| `packages/core/src/telemetry/session-tracing.ts`               | Adicionar `startSubagentSpan` (ramo foreground/raiz linkada), `endSubagentSpan`, `runInSubagentSpanContext`, tipos; estender união `SpanType` com `'subagent'`; estender varredura TTL com `ttlFor(ctx)`                                                       | +120    |
| `packages/core/src/telemetry/log-to-span-processor.ts`         | Lista de bypass para evitar a ponte de `qwen-code.subagent_execution`                                                                                                                                                                                         | +6      |
| `packages/core/src/telemetry/index.ts`                         | Reexportar novos helpers + tipos                                                                                                                                                                                                                             | +6      |
| `packages/core/src/agents/runtime/agent-context.ts`            | Adicionar `depth?: number` a `AgentContext` + accessor `getCurrentAgentDepth()`                                                                                                                                                                              | +12     |
| `packages/core/src/tools/agent/agent.ts`                       | Envolver 3 caminhos de execução (foreground/fork/background) em `runInSubagentSpanContext` com try/catch/finally                                                                                                                                              | +60     |
| `packages/core/src/telemetry/session-tracing.test.ts`          | Novo `describe('subagent spans')`: start/end, filho vs raiz linkada, propagação de contexto, depth, TTL por tipo, finalização idempotente, NOOP quando SDK não inicializado                                                                                   | +120    |
| `packages/core/src/telemetry/log-to-span-processor.test.ts`    | Afirmar que a lista de bypass interrompe a ponte de subagent_execution                                                                                                                                                                                       | +20     |
| `packages/core/src/tools/agent/agent.test.ts`                  | Fim a fim: 3 subagents concorrentes cada um obtém subárvore isolada; spans do fork herdam novo traceId via Link; ciclo de vida do background                                                                                                                 | +80     |

Total: 9 arquivos, ~430 LOC. Maior que commits típicos da Fase 2, mas justificado — alteração TTL toca um arquivo separado, bypass do LogToSpanProcessor é um arquivo separado, e os arquivos de teste dobram. Dividir resultaria numa superfície de telemetria incompleta.

Se a revisão rejeitar o tamanho: dividir em 2 PRs — (A) helpers de telemetria + testes, (B) conexão `agent.ts` + testes e2e. Helpers lançados primeiro não alteram comportamento em tempo de execução.

## Estratégia de teste

| Teste                                                                                         | O que prova                                                      |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `startSubagentSpan foreground cria pai do span OTel ativo`                                   | Caminho do span filho                                            |
| `startSubagentSpan fork cria novo traceId + Link para o invocador`                           | Caminho da raiz linkada                                          |
| `runInSubagentSpanContext propaga span através de awaits / Promise.all`                      | Primitiva de isolamento                                          |
| `3 spans de subagent concorrentes não compartilham filhos`                                   | Garantia principal de concorrência                               |
| `subagent aninhado registra depth + parentAgentId`                                           | Metadados de aninhamento                                         |
| `endSubagentSpan mapeamento de status (completed / failed / cancelled / aborted)`            | Taxonomia de status                                              |
| `endSubagentSpan faz dual-emit de gen_ai.agent.id + qwen-code.subagent.id`                   | Dual-emit de conformidade com a spec                             |
| `fork lifecycle: span sobrevive ao retorno de AgentTool.execute`                            | Correção de fire-and-forget                                      |
| `TTL: fork do subagent permanece após 30min, é carimbado e finalizado às 4h`                | TTL ciente do tipo                                               |
| `TTL: foreground do subagent em 30min recebe varredura padrão`                              | TTL não se estende demais                                        |
| `LogToSpanProcessor ignora qwen-code.subagent_execution, mas continua emitindo para RUM`    | Bypass da ponte funciona                                         |
| `runConcurrently de 3 chamadas de ferramenta de agente produz 3 spans de subagent distintos`| Fim a fim no nível do agendador                                  |
| `subagent com falha define exception.message + error.type + SpanStatus=ERROR`               | Caminho de erro padrão OTel                                      |
| `Atributos opt-in protegidos por includeSensitiveSpanAttributes`                            | Reutiliza corretamente o gate do #4097                           |
| `startSubagentSpan retorna NOOP_SPAN quando SDK não inicializado`                           | Corresponde à disciplina NOOP da Fase 1/2; chamadas downstream permanecem seguras |
| `Link.context do fork corresponde ao spanContext do span da ferramenta invocadora`          | Navegação entre traces funciona de ponta a ponta                 |
| `runWithAgentContext incrementa depth automaticamente: pai=0, filho=1, neto=2`              | Contabilidade de depth correta sem cooperação do chamador        |

## Casos limite

| Caso                                                                                                                       | Tratamento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subagent dentro de ferramenta dentro de subagent (depth > 1)                                                               | Atributo `depth` rastreia; recomendar `debugLogger.warn` suave em depth ≥ 5 (detector de recursão infinita)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Subagent gerado durante `awaiting_approval` de uma ferramenta pai                                                          | O span do subagent é filho do span da ferramenta AGENT; o `tool.blocked_on_user` da ferramenta AGENT é um irmão, não pai — ambos filhos do span da ferramenta AGENT. A árvore permanece correta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `signal.aborted` no meio do subagent                                                                                       | O callback de `runInSubagentSpanContext` lança ou resolve; `finally` define `status='aborted'`, SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Fork ainda ativo quando a sessão pai termina                                                                              | O TTL de 4h dispara; atributos sentinela `qwen-code.span.ttl_expired:true`, `qwen-code.subagent.terminate_reason='ttl_swept'`, `status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `endSubagentSpan` chamado duas vezes                                                                                       | Idempotente — verifica mapa `activeSpans`; segunda chamada não faz nada (segue padrão da Fase 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Chamada LLM do subagent usa um modelo diferente do pai                                                                     | `gen_ai.request.model` definido no span do subagent; o sub-span LLM-request TAMBÉM registra o modelo — sem conflito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Exceção do prelúdio de subagent irmão escapa de `attemptExecutionOfScheduledCalls`                                         | Cai no catch de `handleConfirmationResponse` corrigido recentemente na Fase 2, que está FORA do try — não atribuído ao span da ferramenta confirmada. O span do subagent fecha corretamente via seu próprio try/finally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Fork + foreground concorrentes de um mesmo pai                                                                             | Foreground herda traceId T0, fork obtém T1. Ambos têm propagação de contexto correta independentemente. O span da ferramenta pai termina quando seu trabalho síncrono retorna; o span do fork (trace separado) continua                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Fork inicia no fluxo síncrono do chamador, mas o corpo executa depois                                                     | `startSubagentSpan` é chamado ANTES de `void runInForkContext(...)` para que o span (e seu Link para o invocador) seja capturado enquanto o spanContext do invocador ainda é legível. A duração do span, portanto, inclui qualquer atraso de escalonamento na fila de microtasks antes do corpo realmente iniciar — tipicamente sub-ms; se a produção mostrar lacunas significativas, um atributo separado `qwen-code.subagent.scheduling_delay_ms` pode ser adicionado (questão em aberto)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| SDK não inicializado (telemetria desabilitada)                                                                             | `startSubagentSpan` retorna NOOP_SPAN antecipadamente (segue todos os outros helpers da Fase 1/2). `runInSubagentSpanContext(NOOP_SPAN, fn)` ainda chama `fn` normalmente. `endSubagentSpan(NOOP_SPAN, …)` não faz nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Spans de ponte de log do fork (`tool_call`, `api_request`, etc.) usam traceId derivado da sessão enquanto spans nativos do fork usam T1 | Comportamento pré-existente — spans de ponte de log sempre usam `deriveTraceId(sessionId)`, spans nativos usam contexto OTel. A divergência é invisível dentro de um trace, mas significa que uma consulta ARMS por traceId em T1 não incluirá filhos de ponte de log do fork. Fora do escopo deste PR; apontado como questão em aberto #5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Pais do span do hook `SubagentStart` diferem entre foreground e background                                                | Foreground dispara `fireSubagentStartEvent` dentro de `runSubagentWithHooks` → já dentro de `runInSubagentSpanContext`, então o hook span parents abaixo de `qwen-code.subagent`. Background dispara ANTES do wrapping `runWithSubagentSpan` (então o span do subagent ainda não existe), logo seu hook span parents abaixo de `qwen-code.tool` do AGENT. Operadores consultando "hook spans sob subagent spans" devem esperar que `SubagentStart` de bg esteja ausente dessa visão. Mover o disparo do hook de bg para dentro de `framedBgBody` é mecanicamente simples (a mutação `contextState` alcança `bgSubagent.execute` de qualquer forma), mas muda a semântica visível ao usuário: hoje o hook dispara sincronamente antes de `AgentTool.execute` retornar a mensagem "Agente em background lançado", então qualquer trabalho síncrono de configuração que o hook faça acontece dentro do turno que bloqueia o usuário; movê-lo faz o hook disparar de forma destacada após a mensagem de lançamento retornar. Adiado até uma decisão deliberada sobre qual semântica é preferida |
## Rollback

A mudança é aditiva no nível OTel — dashboards existentes que não filtram por nomes de span relacionados a subagentes continuam funcionando. Consumidores de trace que agrupam por span pai verão novos nós `qwen-code.subagent` entre `qwen-code.tool` e `qwen-code.llm_request`; documentar nas notas de release.

A mudança que afeta o comportamento é a omissão do LogToSpanProcessor — dashboards que anteriormente consumiam o span `qwen-code.subagent_execution` retornam zero. Mitigação: manter o LogRecord intacto (RUM + métricas ainda o veem); apenas a ponte de span é removida. Consultas existentes baseadas em log não são afetadas.

Caminho de rollback: reverter o único PR. Os novos helpers de span são invocados apenas a partir de `agent.ts`; remover a fiação + a omissão do LogToSpanProcessor restaura o comportamento anterior 1:1.

## Implicações de amostragem

| Invocação                                       | Fonte da decisão de amostragem                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `foreground` (span filho, mesmo traceId)         | Herda a decisão de amostragem do trace pai via amostrador baseado no pai       |
| `fork` / `background` (raiz vinculada, novo traceId) | Decisão de amostragem independente na criação da raiz                        |

Para o padrão atual do qwen-code (conforme `tracer.ts:shouldForceSampled()` — parentbased + always_on senão always_on), todo span é amostrado, então a divergência não afeta. Para implantações que usam amostradores probabilísticos (ex.: `traceidratio=0.1`), isso significa:

- Um prompt de usuário pode ser amostrado (T0 totalmente capturado), mas seu fork (T1) pode ser descartado, ou vice-versa.
- Operadores lendo o T0 pai veem "Link: subagent C (T1)" — clicar pode resultar em 404 se T1 não foi amostrado.

Mitigação: documentar para operadores. Se a captura completa do subagente for importante, forçar a amostragem para fork/background por meio de um futuro knob de configuração. Fora do escopo aqui.

## Atributos sensíveis (integração #4097)

Reutilizar o gate `includeSensitiveSpanAttributes` existente. Quando verdadeiro, definir no span do subagente nos hooks de ciclo de vida onde os dados estão disponíveis:

| Atributo da especificação | Fonte                                                      | Quando definido                                                                                 |
| ------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions` | prompt de sistema renderizado a partir de `agentConfig` / contexto pai | `startSubagentSpan` (se disponível antes da abertura do span) ou via `setAttributes` no início do corpo |
| `gen_ai.tool.definitions`    | declarações de ferramenta disponíveis para o subagente    | o mesmo que acima                                                                               |
| `gen_ai.input.messages`      | entrada inicial passada para o subagente (prompt + extraHistory) | no início do corpo                                                                              |
| `gen_ai.output.messages`     | mensagens de resposta final retornadas pelo subagente      | na metadata de `endSubagentSpan`                                                                |

Todos esses já estão protegidos por gate; o padrão da #4097 é chamar o helper `addSubagentSensitiveAttributes(span, opts)` de dentro do corpo. Detalhe de implementação — o design apenas observa o ponto de integração.

## Sequenciamento

- Independente da #4367 (atributos de recurso — em revisão). Sem restrição de ordem de merge, mas `gen_ai.conversation.id` em spans de subagente se beneficia da #4367 com `session.id` movido do recurso. **Recomendamos integrar a #4367 primeiro** para que a fonte da verdade de `getSessionId()` seja estabelecida.
- Independente da Fase 4 (decomposição de requisição LLM / TTFT). A Fase 4 se anexa a spans `qwen-code.llm_request` independentemente de estarem sob um subagente ou uma interação. Recomendamos a Fase 3 antes da Fase 4 para que as métricas por tentativa da Fase 4 possam ser agregadas por subagente.

## Perguntas em aberto

1. **`gen_ai.provider.name`**: a especificação exige, mas escreve a descrição para provedor LLM, não para framework de agente. Definir como `'qwen-code'` é a melhor interpretação; se uma revisão futura da especificação adicionar uma variante `agent.provider.name`, devemos trocar.
2. **Nome do span `qwen-code.subagent` vs especificação `invoke_agent {name}`**: optamos por consistência interna. Se a adoção de ferramentas que entendem GenAI crescer e `invoke_agent ${name}` se tornar crítico para descoberta automática, podemos trocar — o nome do span é a coisa mais rebrandável no OTel.
3. **Aviso suave na profundidade ≥ 5**: número arbitrário. Pode ser um knob de configuração. Adiar até que dados de produção mostrem necessidade.
4. **A saída LLM completa de `SubagentExecutionEvent.result` é grande**: hoje incha o volume de LogRecord. O plano de migração (LogRecord → eventos de span) é adiado, mas vale a pena fazer quando a agregação de uso de token chegar na Fase 4.
5. **Spans de ponte de log dentro de um fork acabam no traceId derivado da sessão, não no T1 do fork**: ver casos de borda. A correção é o problema mais amplo "span de interação não herda contexto raiz da sessão" levantado no tópico sessionId-vs-traceId — um design separado que afeta todos os spans nativos, não apenas subagente. Fora do escopo.