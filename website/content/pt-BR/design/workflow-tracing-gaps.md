# Análise de Granularidade Insuficiente de Span em Nível de Workflow (P1)

> Com base na revisão de qwen-code origin/main em 2026-05-13

## Situação Atual

O qwen-code já possui uma infraestrutura de tracing:

| Componente                     | Localização                                      | Descrição                                                              |
| ------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------- |
| Definição de tipo de Span      | `packages/core/src/telemetry/session-tracing.ts` | `interaction`、`llm_request`、`tool`、`tool.execution`                |
| Ferramenta Tracer              | `packages/core/src/telemetry/tracer.ts`          | session root context、`withSpan`、`startSpanWithContext`               |
| Ponto de entrada da interação  | `packages/core/src/core/client.ts`               | Interação de alto nível inicia o span `interaction` explicitamente     |
| Gerenciamento do ciclo de vida | —                                                | AsyncLocalStorage + WeakRef + TTL cleanup                              |

Atualmente, no runtime, os principais spans genéricos integrados de forma estável são:

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**Conclusão: já entramos na fase de 'ter um backbone de tracing', mas ainda não codificamos completamente os limites das fases do agent workflow na árvore de trace.**

### Comparação: tipos de span já implementados pelo claude-code

Consulte `claude-code/src/utils/telemetry/sessionTracing.ts` (linha 49):

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## Lacunas

| Span / Mecanismo ausente                           | Impacto                                                   |
| -------------------------------------------------- | --------------------------------------------------------- |
| Span `permission_wait` / `blocked_on_user`         | Incapacidade de distinguir espera de aprovação vs tempo de execução da ferramenta |
| Span `hook`                                        | Tempo do hook fica embutido no span da ferramenta, limites pouco claros |
| Span raiz `subagent`                               | Chamadas llm/tool internas do subagent não formam subárvore de trace |
| Integração real do `tool.execution`                | Helper já definido, mas não chamado no fluxo principal    |
| Parent-child wiring estável                        | Spans são mais irmãos sob o session root do que uma árvore hierárquica |

## Análise item por item

### 1. Espera por aprovação do usuário não está no trace

Quando uma chamada de ferramenta aguarda aprovação, o caminho de transição de estado é `awaiting_approval` → `scheduled` → execução.

- "Aguardando confirmação do usuário" é apenas uma transição de estado, não um nó de trace
- Não é possível ver o tempo de espera da aprovação no trace
- Quando a ferramenta está lenta, não é possível distinguir se está "travada aguardando usuário" ou "a ferramenta em si é lenta"

### 2. Hook tem registro de evento, mas não tem span independente

A execução de hooks Pre/Post gera um `HookCallEvent`, passando por `logHookCall()`, mas não cria um span OTel independente.

- Quando o hook fica lento, parece que o span da ferramenta externa ficou lento
- Quando o hook falha, aparece como "falha da ferramenta"
- O trace não consegue responder "o tempo foi gasto no hook ou no tool.execution"

### 3. Subagent é log/métrica, não subárvore de trace

O início/término do subagent registra `SubagentExecutionEvent` e entra em log/métrica, mas não forma uma subárvore explícita de span.

- É possível estatísticas de "qual subagent foi executado"
- Não é possível acompanhar pelo trace "quais chamadas llm/tool esse subagent acionou"
- Em cenários com subagents concorrentes, a cadeia causal não é clara

### 4. Helper tool.execution já definido, mas não integrado ao fluxo principal

`session-tracing.ts` já possui `startToolExecutionSpan()` / `endToolExecutionSpan()`, mas nenhum ponto de chamada fora de código de teste.

Árvore de trace atual:

```
session-root
  interaction
    api.generateContent
    tool.Bash
  subagent_execution        (log/metric)
  hook_call                 (event/QwenLogger)
```

Árvore de trace ideal:

```
interaction
  llm_request
    tool
      tool.blocked_on_user
      hook(pre)
      tool.execution
      hook(post)
  subagent
    interaction
      llm_request
        tool
```

### 5. Parent-child wiring não é estável o suficiente

O span `interaction` já existe, mas muitos spans em execução ficam sob o session root como irmãos, em vez de filhos da interação.

- Árvore de chamadas achatada
- Relação de causa e efeito entre nós não é intuitiva
- A experiência de rastrear de uma rodada do usuário até as chamadas internas de llm/tool/hook/subagent não é contínua

## Impactos

- Traces têm valor básico, mas insuficientes para diagnóstico de problemas em nível de workflow
- Não é possível responder diretamente "essa rodada foi lenta por espera do usuário, hook ou execução real da ferramenta?"
- Não é possível reconstruir o processo de execução do subagent como uma subárvore de trace legível
- Problemas de hook são embutidos no span da ferramenta, limites pouco claros
- A árvore no Jaeger / Tempo / ARMS é mais achatada e mais difícil de ler do que no claude-code

---

## Análise de reaproveitamento da solução do claude-code

> Com base na comparação aprofundada do código-fonte do claude-code em 2026-05-13

### Arquitetura de tracing do claude-code

O claude-code implementa em `src/utils/telemetry/sessionTracing.ts` um **sistema unificado de gerenciamento de spans baseado em ALS duplo**:

```
                    interactionContext (ALS)          toolContext (ALS)
                          │                                │
                          ▼                                ▼
              ┌─────────────────────┐           ┌─────────────────────┐
              │  interaction span   │           │    tool span        │
              │  (session root)     │           │  (child of intxn)   │
              └─────────────────────┘           └─────────────────────┘
                   ▲ parent of                       ▲ parent of
                   │                                 │
           ┌───────┴───────┐              ┌──────────┼──────────┐
           │               │              │          │          │
      llm_request      tool          blocked    execution    hook
                                     _on_user
```

**Mecanismos principais:**

| Mecanismo        | Implementação                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ALS duplo        | `interactionContext` armazena o span interaction atual; `toolContext` armazena o span tool atual                                                                                                         |
| Resolução parent | Cada tipo de span codifica de qual ALS obter o parent: `llm_request`/`tool` obtém de `interactionContext`; `blocked_on_user`/`execution`/`hook` obtém de `toolContext`; `hook` tem fallback para `interactionContext` |
| Ciclo de vida    | enterWith injeta → span executa → enterWith(undefined) limpa                                                                                                                                             |
| Busca de span    | Spans não armazenados em ALS (ex: blocked_on_user) são encontrados via Map `activeSpans` pela chave `span.type`                                                                                          |
| Gerenciamento    | Spans mantidos em ALS usam WeakRef; spans não mantidos em ALS usam strongRef para evitar GC; TTL 30min para limpeza automática                                                                          |

**Ciclo de vida completo do tool span no claude-code** (`toolExecution.ts`):

```
startToolSpan(name, attrs)                    // → toolContext.enterWith(spanCtx)
  startToolBlockedOnUserSpan()                // → parent = toolContext.getStore()
    [permission resolution / user prompt]
  endToolBlockedOnUserSpan(decision, source)
  startToolExecutionSpan()                    // → parent = toolContext.getStore()
    [tool.call()]
  endToolExecutionSpan({ success })
endToolSpan(result)                           // → toolContext.enterWith(undefined)
```

**Hook span no claude-code** (`hooks.ts`):

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [parallel hook execution]
endHookSpan(span, { success, blocking, ... })
```

### Arquitetura atual do qwen-code vs claude-code

#### Diferença fundamental: dois caminhos de criação de span desconectados

Esta é a questão arquitetural mais crítica no qwen-code atualmente:

| Camada               | Arquivo                | Uso                                                                                            | Resolução parent                                          |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Camada session-tracing | `session-tracing.ts` | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan`     | Obtém parent explicitamente do ALS `interactionContext`  |
| Camada tracer        | `tracer.ts`            | `withSpan` / `startSpanWithContext`                                                             | Obtém parent de `context.active()`, fallback para session root |

**Situação real de chamadas no runtime:**

- `startInteractionSpan` → **já integrado** (`client.ts` linha 956), escreve no ALS `interactionContext`
- `startLLMRequestSpan` / `endLLMRequestSpan` → **não integrado**, runtime usa `withSpan('api.generateContent', ...)` (em `loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **não integrado**, runtime usa `withSpan('tool.${name}', ...)` (em `coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **não integrado**

**Consequências:**

O `getParentContext()` do `withSpan` primeiro verifica `context.active()` (contexto nativo do OTel) e, quando não encontra span ativo, recai para o session root context. Ele **não lê o ALS `interactionContext`**.

Portanto, o span interaction e os spans LLM/tool tornam-se **irmãos** sob o session root, em vez de uma árvore pai-filho:

```
session-root
  ├── interaction         (vindo de session-tracing, escreveu no ALS interactionContext)
  ├── api.generateContent (vindo de withSpan, não lê interactionContext → pendurado no session root)
  ├── tool.Bash           (vindo de withSpan, idem)
  └── tool.Read           (vindo de withSpan, idem)
```

**Já no claude-code, há apenas um caminho de criação de span (sessionTracing.ts), todos os spans seguem a mesma lógica de conversão ALS → OTel context, então a árvore é completa.**

#### Avaliação de reaproveitamento item por item

##### 1. ALS duplo + resolução explícita de parent — Reaproveitável, é a correção central

| Dimensão        | claude-code                                          | qwen-code                                  |
| --------------- | ---------------------------------------------------- | ------------------------------------------ |
| Qtde ALS        | 2 (`interactionContext` + `toolContext`)             | 1 (`interactionContext`, sem `toolContext`)|
| Resolução parent| Cada tipo de span especifica explicitamente de qual ALS obter parent | `withSpan` usa `context.active()` unificado |
| Injeção context | `trace.setSpan(otelContext.active(), parentCtx.span)`| `withSpan` injeta implicitamente via `startActiveSpan` |

**Plano de reaproveitamento:**

O `session-tracing.ts` do qwen-code já implementa um padrão de resolução parent **quase idêntico** ao do claude-code:

```typescript
// qwen-code session-tracing.ts (já existe mas não é usado)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

Esse código é **totalmente consistente** com a lógica do `startLLMRequestSpan` do claude-code.

**Caminho de correção central: abandonar as chamadas `withSpan('api.*')` / `withSpan('tool.*')` no runtime e passar a chamar os typed helpers do session-tracing.** Não é necessário reescrever a camada session-tracing — sua API já está pronta.

Apenas é necessário adicionar:

- Adicionar ALS `toolContext` (similar ao claude-code)
- Adicionar tipos de span `blocked_on_user` e `hook` e funções helper

##### 2. tool.blocked_on_user — Precisa adaptar as diferenças do fluxo de aprovação

| Dimensão         | claude-code                                       | qwen-code                                                                 |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Local da aprovação | Dentro de `toolExecution.ts`, dentro do tool span | Dentro de `coreToolScheduler._schedule()`, antes do tool span             |
| Modo de aprovação | Espera síncrona `resolveHookPermissionDecision()` | Orientado a máquina de estados: `validating` → `awaiting_approval` → `scheduled` → `executing` |
| Cobertura do span | tool span contém blocked + execution              | tool span (`withSpan`) contém apenas execution (a partir de `executeSingleToolCall`) |

**Diferença chave:** A entrada de `executeSingleToolCall` no qwen-code verifica se `toolCall.status !== 'scheduled'` para continuar — ou seja, quando a chamada chega aqui, a aprovação já foi concluída. O `withSpan` do tool span não abrange o tempo de espera da aprovação.

**Planos de adaptação (dois):**

**Plano A — Mover o início do tool span para antes (recomendado):**

Mover a chamada `startToolSpan` de `executeSingleToolCall` para dentro de `_schedule` antes da verificação de aprovação, fazendo o tool span cobrir todo o ciclo de vida. Ao entrar no estado `awaiting_approval`, chama `startToolBlockedOnUserSpan`; ao concluir a aprovação (`scheduled`), chama `endToolBlockedOnUserSpan`.

```
_schedule():
  startToolSpan(name)                         // ← novo
    startToolBlockedOnUserSpan()              // ← novo, ao entrar em awaiting_approval
      [máquina de estados aguardando]
    endToolBlockedOnUserSpan(decision)        // ← novo, ao entrar em scheduled
executeSingleToolCall():
    startToolExecutionSpan()                  // ← integrar helper existente
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← precisa estar em finally
```

**Plano B — Manter tool span na posição atual, rastrear aprovação separadamente:**

Criar um span `approval_wait` independente dentro de `_schedule` (não como filho do tool), pendurado sob interaction. Vantagem: menos alterações. Desvantagem: inconsistente com o modelo do claude-code, legibilidade da árvore de trace prejudicada.

**Recomenda-se adotar o Plano A** porque:

- Consistente com a estrutura da árvore de trace do claude-code
- Um único nó tool no trace mostra "quanto tempo esperou + quanto tempo executou"
- A característica orientada a máquina de estados afeta apenas o momento de início/término do span, não o modelo pai-filho

##### 3. hook span — Pode ser diretamente reaproveitado

| Dimensão           | claude-code                         | qwen-code                                                             |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| Ponto de execução hook | `executeHooks()` in `hooks.ts`      | `firePreToolUseHook`/`firePostToolUseHook` via `hookEventHandler.ts` |
| Modo de registro atual  | OTel span + Perfetto span           | `HookCallEvent` → `QwenLogger` (sem OTel)                             |
| Parent             | `toolContext ?? interactionContext` | —                                                                     |

**Plano de reaproveitamento:**

1. Adicionar `startHookSpan` / `endHookSpan` em `session-tracing.ts` (parent = `toolContext ?? interactionContext`, consistente com claude-code)
2. Em `coreToolScheduler.ts` no `executeSingleToolCall`, iniciar/finalizar hook span antes/depois das chamadas de hook pre/post
3. Manter o registro existente de `logHookCall` (os dois paralelos, não mutuamente exclusivos)

Alteração pequena, não afeta a lógica de hook existente.

##### 4. tool.execution — Helper já existe, só precisa conectar

O `startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` do qwen-code já está completamente implementado, basta chamar em `executeSingleToolCall`:

```typescript
// coreToolScheduler.ts dentro de executeSingleToolCall
const toolSpan = startToolSpan(toolName, attrs);
// ... hook pre ...
const execSpan = startToolExecutionSpan(toolSpan);
try {
  // ... invocation.execute() ...
  endToolExecutionSpan(execSpan, { success: true });
} catch (e) {
  endToolExecutionSpan(execSpan, { success: false, error: e.message });
}
// ... hook post ...
endToolSpan(toolSpan);
```

Observação: o `startToolExecutionSpan` do qwen-code recebe um parâmetro explícito `parentToolSpan`, enquanto no claude-code é obtido implicitamente do ALS `toolContext`. Isso não afeta a funcionalidade, apenas diferença de estilo. Se o ALS `toolContext` for introduzido, pode-se unificar para obtenção implícita.

##### 5. subagent trace tree — Ambos incompletos, não recomendado reaproveitar diretamente

| Dimensão              | claude-code                                                                 | qwen-code                                          |
| --------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| Propagação trace OTel | **Nenhuma** — a interaction do subagent é uma nova root                     | **Nenhuma** — subagent não tem propagação explícita de trace |
| Associação de identidade | Perfetto metadata (agent process/thread) + ALS `teammateContextStorage`   | ALS `subagentNameContext` + `SubagentExecutionEvent` |
| Isolamento concorrente | Risco de vazamento no ALS OTel (`enterWith` é nível de processo, subagents concorrentes podem se sobrescrever) | Mesmo risco                                        |

O claude-code **também não resolveu bem** o tracing OTel de subagent:

- `interactionContext.enterWith()` é nível de processo, subagents concorrentes sobrescrevem os valores ALS uns dos outros
- A verdadeira árvore hierárquica de agentes existe apenas no Perfetto (um sistema interno da Anthropic com feature flag), não no OTel

**Recomendações:**

- Curto prazo: manter o esquema existente de `subagentNameContext` + log de eventos do qwen-code
- Médio prazo: ao iniciar um subagent, criar um span `subagent` (parent = current toolContext) e usar `context.with()` em vez de `enterWith()` para isolar o contexto OTel de subagents concorrentes
- É um item de trabalho que precisa de design independente, não recomendado copiar diretamente o claude-code

##### 6. LLM request span — Caminho claro

Atualmente o qwen-code usa `withSpan('api.generateContent', ...)` e `startSpanWithContext('api.generateContentStream', ...)` em `loggingContentGenerator.ts`.

Basta mudar para chamar `startLLMRequestSpan` / `endLLMRequestSpan` (já implementados na camada session-tracing). Cenário de streaming requer atenção:

- `startLLMRequestSpan` retorna um objeto `Span`
- É necessário chamar `endLLMRequestSpan(span, metadata)` manualmente para finalizar
- Isso é compatível com o modo de gerenciamento manual do `startSpanWithContext`

### Resumo do reaproveitamento

| Item de modificação                                                              | Grau de reaproveitamento                          | Volume de alteração         | Prioridade |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------- | ---------- |
| Unificar caminho de criação de span (abandonar `withSpan` do runtime, usar helpers session-tracing) | **Correção central** — resolve a desconexão pai-filho | Médio (~5 pontos de chamada) | P0         |
| Adicionar ALS `toolContext`                                                      | Copiar diretamente o padrão do claude-code        | Baixo (dentro de session-tracing.ts) | P0         |
| Span tool.blocked_on_user                                                        | Plano A precisa adaptar máquina de estados        | Médio (coordenação entre `_schedule` e `executeSingleToolCall`) | P1         |
| Conexão tool.execution                                                           | Helper já existe, só precisa chamar               | Baixo (3 linhas dentro de `executeSingleToolCall`) | P1         |
| Span hook                                                                        | Adicionar helper + ponto de chamada               | Baixo                                         | P1         |
| Troca LLM request span                                                           | Substituir `withSpan` por typed helper            | Baixo (2 pontos de chamada)                   | P1         |
| subagent trace tree                                                              | **Não recomendado reaproveitar diretamente** — precisa design independente | Alto | P2         |

### Ordem de implementação recomendada

```
Fase 1 — Corrigir estrutura da árvore de trace (P0)
├── 1a. session-tracing.ts: adicionar ALS toolContext + helpers de span blocked_on_user / hook
├── 1b. loggingContentGenerator.ts: withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts: withSpan → startToolSpan/endToolSpan

Fase 2 — Completar spans de workflow (P1)
├── 2a. coreToolScheduler._schedule: integrar span blocked_on_user
├── 2b. coreToolScheduler.executeSingleToolCall: integrar span tool.execution
└── 2c. Nos pontos de chamada hook pre/post: integrar span hook

Fase 3 — Subagent trace tree (P2)
├── 3a. Projetar esquema de isolamento com context.with() (substituir enterWith)
├── 3b. Criar span raiz subagent ao iniciar subagent
└── 3c. Validar cenário de subagents concorrentes
```