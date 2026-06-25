# Análise de Granularidade de Span em Nível de Workflow (P1)

> Baseado na revisão de 2026-05-13 do qwen-code origin/main

## Situação Atual

O qwen-code já possui infraestrutura de tracing:

| Componente                   | Localização                                                     | Descrição                                                                 |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Definições de tipo de Span   | `packages/core/src/telemetry/session-tracing.ts`                | `interaction`, `llm_request`, `tool`, `tool.execution`                    |
| Ferramenta Tracer            | `packages/core/src/telemetry/tracer.ts`                         | session root context, `withSpan`, `startSpanWithContext`                  |
| Ponto de entrada de interação | `packages/core/src/core/client.ts`                              | A interação de alto nível inicia explicitamente o span `interaction`      |
| Gerenciamento de ciclo de vida | —                                                               | AsyncLocalStorage + WeakRef + limpeza por TTL                             |

No runtime atual, os principais spans genéricos integrados de forma estável são dois tipos:

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**Conclusão: Já entramos no estágio de "tracing backbone", mas ainda não codificamos completamente os limites das fases do workflow do agent na árvore de trace.**

### Comparação: tipos de span já implementados pelo claude-code

Consulte `claude-code/src/utils/telemetry/sessionTracing.ts` (linha 49):

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## Itens Ausentes

| Span / Mecanismo Ausente                      | Impacto                                                       |
| --------------------------------------------- | ------------------------------------------------------------- |
| `permission_wait` / `blocked_on_user` span    | Não é possível distinguir espera por aprovação vs. tempo de execução da ferramenta |
| `hook` span                                   | Tempo de hook fica oculto dentro do span tool, limites de localização imprecisos |
| `subagent` root span                          | Chamadas llm/tool internas do subagent não formam subárvore de trace |
| `tool.execution` real                         | Helper já definido, mas não chamado na cadeia principal       |
| Conexão pai-filho estável                     | Spans são em sua maioria irmãos sob session root, não uma árvore hierárquica |

## Análise Item por Item

### 1. Espera por aprovação do usuário não está no trace

Quando a execução de uma ferramenta aguarda aprovação, o caminho de transição de estado é `awaiting_approval` → `scheduled` → execução.

- "Aguardando confirmação do usuário" é apenas uma transição de estado, não um nó de trace
- O trace não mostra o tempo gasto na espera por aprovação
- Quando a ferramenta está lenta, não é possível distinguir se "está travado esperando o usuário" ou "a própria ferramenta está executando lentamente"

### 2. Hook tem registro de evento, mas não tem span independente

Após a execução dos hooks Pre/Post, é gerado um `HookCallEvent` via `logHookCall()`, mas não é criado um span OTel independente.

- Quando o hook está lento, parece que o span tool externo está lento
- Quando o hook falha, parece que "a ferramenta falhou"
- O trace não consegue responder "o tempo foi gasto no hook ou no tool.execution"

### 3. Subagent é log/metric, não uma subárvore de trace

Quando o subagent inicia/conclui, é registrado um `SubagentExecutionEvent` e entra no log/metric, mas não forma uma subárvore de span explícita.

- É possível contar "qual subagent foi executado"
- Não é possível seguir o trace para ver "quais chamadas llm/tool esse subagent disparou"
- Em cenários com subagentes concorrentes, a cadeia causal fica confusa

### 4. Helper tool.execution já definido, mas não conectado à cadeia principal

`session-tracing.ts` já possui `startToolExecutionSpan()` / `endToolExecutionSpan()`, mas nenhum ponto de chamada foi encontrado fora do código de teste.

Árvore de trace real atual:

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

### 5. Conexão pai-filho não é suficientemente estável

O span interaction já existe, mas muitos spans em execução ficam pendurados como irmãos sob o session root, em vez de filhos do interaction.

- Árvore de chamadas plana
- Relação de causa e efeito entre nós não é intuitiva
- A experiência de rastrear de uma rodada do usuário até as chamadas internas llm/tool/hook/subagent não é contínua

## Impacto

- Traces têm valor básico, mas não são suficientes para depuração em nível de workflow
- Não é possível responder diretamente "essa rodada foi lenta por esperar o usuário, pelo hook ou pela execução real da tool"
- Não é possível reconstruir o processo de execução do subagent como uma subárvore de trace legível
- Problemas de hook ficam ocultos dentro do span tool, limites de localização imprecisos
- Na árvore exibida no Jaeger / Tempo / ARMS, fica mais plana e mais difícil de ler do que a do claude-code

---

## Análise de Reutilização da Abordagem do claude-code

> Com base em uma comparação aprofundada do código-fonte do claude-code em 2026-05-13

### Arquitetura de tracing do claude-code

O claude-code implementa em `src/utils/telemetry/sessionTracing.ts` um **sistema unificado de gerenciamento de spans baseado em ALS duplo**:

```
                    interactionContext (ALS)          toolContext (ALS)
                          │                                │
                          ▼                                ▼
              ┌─────────────────────┐           ┌─────────────────────┐
              │  interaction span   │           │    tool span        │
              │  (root da sessão)   │           │  (filho do intxn)   │
              └─────────────────────┘           └─────────────────────┘
                   ▲ pai de                       ▲ pai de
                   │                                 │
           ┌───────┴───────┐              ┌──────────┼──────────┐
           │               │              │          │          │
      llm_request      tool          blocked    execution    hook
                                     _on_user
```

**Mecanismos principais:**

| Mecanismo   | Implementação                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ALS duplo   | `interactionContext` armazena o span interaction atual; `toolContext` armazena o span tool atual                                                                                                       |
| Resolução de pai | Cada tipo de span codifica de qual ALS obter o pai: `llm_request`/`tool` obtêm de `interactionContext`; `blocked_on_user`/`execution`/`hook` obtêm de `toolContext`; `hook` tem fallback para `interactionContext` |
| Ciclo de vida | enterWith injeta → span executa → enterWith(undefined) limpa                                                                                                                                           |
| Busca de span | Spans não armazenados em ALS (ex.: blocked_on_user) são encontrados via mapa `activeSpans` por `span.type`                                                                                             |
| Gerenciamento de memória | Spans mantidos em ALS usam WeakRef; spans não mantidos em ALS usam strongRef para evitar GC; limpeza automática com TTL de 30min                                                                   |
**ciclo de vida completo do span tool do claude-code** (`toolExecution.ts`):

```
startToolSpan(name, attrs)                    // → toolContext.enterWith(spanCtx)
  startToolBlockedOnUserSpan()                // → parent = toolContext.getStore()
    [resolução de permissão / prompt do usuário]
  endToolBlockedOnUserSpan(decision, source)
  startToolExecutionSpan()                    // → parent = toolContext.getStore()
    [tool.call()]
  endToolExecutionSpan({ success })
endToolSpan(result)                           // → toolContext.enterWith(undefined)
```

**span de hook do claude-code** (`hooks.ts`):

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [execução paralela de hooks]
endHookSpan(span, { success, blocking, ... })
```

### Arquitetura atual do qwen-code vs claude-code

#### Diferença fundamental: dois caminhos quebrados de criação de spans

Este é o problema arquitetural mais crítico do qwen-code atualmente:

| Camada                | Arquivo               | Uso                                                                                             | Resolução do parent                                          |
| --------------------- | --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| camada session-tracing | `session-tracing.ts`  | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan`    | O parent é explicitamente obtido do ALS `interactionContext` |
| camada tracer         | `tracer.ts`           | `withSpan` / `startSpanWithContext`                                                             | O parent é obtido de `context.active()`, fallback para session root |

**Chamadas reais em runtime:**

- `startInteractionSpan` → **já está integrado** (`client.ts` linha 956), escreve no ALS `interactionContext`
- `startLLMRequestSpan` / `endLLMRequestSpan` → **não integrado**, runtime usa `withSpan('api.generateContent', ...)` (em `loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **não integrado**, runtime usa `withSpan('tool.${name}', ...)` (em `coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **não integrado**

**Consequência:**

`getParentContext()` do `withSpan` primeiro verifica `context.active()` (contexto nativo do OpenTelemetry), e quando não encontra span ativo, faz fallback para o contexto raiz da sessão. Ele **não lê** o ALS `interactionContext`.

Portanto, interaction span e LLM/tool spans se tornam **irmãos (siblings) no mesmo nível** abaixo do session root, em vez de uma árvore pai-filho:

```
session-root
  ├── interaction         (vindo de session-tracing, escreveu no ALS interactionContext)
  ├── api.generateContent (vindo de withSpan, não lê interactionContext → anexado ao session root)
  ├── tool.Bash           (vindo de withSpan, o mesmo)
  └── tool.Read           (vindo de withSpan, o mesmo)
```

**Já no claude-code, existe apenas um caminho de criação de spans (sessionTracing.ts). Todos os spans passam pelo mesmo ALS → lógica de conversão de contexto OTel, então a árvore é completa.**

#### Avaliação de reutilização item por item

##### 1. ALS duplo + resolução explícita de parent — reutilizável, é o reparo central

| Dimensão        | claude-code                                               | qwen-code                                          |
| --------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Quantidade de ALS | 2 (`interactionContext` + `toolContext`)                  | 1 (`interactionContext`, sem `toolContext`)        |
| Resolução de parent | Cada tipo de span especifica explicitamente de qual ALS obter o parent | `withSpan` usa `context.active()` uniformemente |
| Injeção de contexto | `trace.setSpan(otelContext.active(), parentCtx.span)`     | `withSpan` injeta implicitamente via `startActiveSpan` |

**Plano de reutilização:**

O `session-tracing.ts` do qwen-code já implementa um padrão de resolução de parent **quase idêntico** ao do claude-code:

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

Este código é **exatamente o mesmo** que a lógica de `startLLMRequestSpan` do claude-code.

**Caminho de reparo central:** Remover as chamadas `withSpan('api.*')` / `withSpan('tool.*')` no runtime e substituí-las pelas chamadas aos helpers tipados do session-tracing. **Não é necessário reescrever a camada session-tracing** — sua API já está pronta.

O que precisa ser adicionado é apenas:

- Adicionar o ALS `toolContext` (semelhante ao claude-code)
- Adicionar os tipos de span `blocked_on_user` e `hook` e suas funções helper

##### 2. tool.blocked_on_user — precisa de adaptação para diferenças no fluxo de aprovação

| Dimensão         | claude-code                                       | qwen-code                                                                                             |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Local da aprovação | Dentro de `toolExecution.ts`, dentro do span tool | Dentro de `coreToolScheduler._schedule()`, antes do span tool                                         |
| Modo de aprovação | Espera síncrona por `resolveHookPermissionDecision()` | Orientado a máquina de estados: `validating` → `awaiting_approval` → `scheduled` → `executing`        |
| Cobertura do span   | O span tool cobre blocked + execution             | O span tool (`withSpan`) cobre apenas execution (a partir de `executeSingleToolCall`)                 |

**Diferença chave:** A entrada de `executeSingleToolCall` no qwen-code verifica se `toolCall.status !== 'scheduled'` para continuar — ou seja, quando chega aqui a aprovação já foi concluída. O `withSpan` do tool span não engloba a espera de aprovação.

**Plano de adaptação (dois):**

**Plano A — mover o início do tool span para antes (recomendado):**

Mover a chamada de `startToolSpan` de `executeSingleToolCall` para `_schedule`, antes da verificação de aprovação, de modo que o tool span cubra todo o ciclo de vida. Ao entrar no estado `awaiting_approval`, chamar `startToolBlockedOnUserSpan`; ao finalizar a aprovação (estado `scheduled`), chamar `endToolBlockedOnUserSpan`.
```
_schedule():
  startToolSpan(name)                         // ← novo
    startToolBlockedOnUserSpan()              // ← novo, ao entrar em awaiting_approval
      [máquina de estados aguarda]
    endToolBlockedOnUserSpan(decision)        // ← novo, ao entrar em scheduled
executeSingleToolCall():
    startToolExecutionSpan()                  // ← reutiliza helper existente
      [hook + execução]
    endToolExecutionSpan()
  endToolSpan()                               // ← deve estar no finally
```

**Opção B — manter posição do tool span inalterada, rastrear aprovação separadamente:**

Criar um span `approval_wait` independente (não como filho do tool) em `_schedule`, anexado ao interaction. Vantagem: menos alterações. Desvantagem: inconsistente com o modelo do claude-code, legibilidade da árvore de trace prejudicada.

**Recomenda-se adotar a Opção A**, porque:

- Consistente com a estrutura da árvore de trace do claude-code
- Um nó tool no trace já mostra "tempo de espera + tempo de execução"
- A característica de máquina de estados afeta apenas o momento de início/fim do span, não o modelo pai-filho

##### 3. hook span — pode ser reutilizado diretamente

| Dimensão            | claude-code                         | qwen-code                                                            |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| Ponto de entrada do hook| `executeHooks()` in `hooks.ts`      | `firePreToolUseHook`/`firePostToolUseHook` via `hookEventHandler.ts` |
| Forma atual de registro | OTel span + Perfetto span           | `HookCallEvent` → `QwenLogger` (sem OTel)                           |
| parent              | `toolContext ?? interactionContext` | —                                                                    |

**Plano de reutilização:**

1. Adicionar `startHookSpan` / `endHookSpan` em `session-tracing.ts` (parent = `toolContext ?? interactionContext`, consistente com claude-code)
2. Em `coreToolScheduler.ts` no `executeSingleToolCall`, chamar start/end hook span antes e depois dos hooks pre/post
3. Manter o registro existente de `logHookCall` (dois sistemas em paralelo, não mutuamente exclusivos)

Baixo impacto de alteração, sem afetar a lógica atual dos hooks.

##### 4. tool.execution — helper já existente, só conectar

O `startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` do qwen-code já está completo. Basta chamar em `executeSingleToolCall`:

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

Nota: o `startToolExecutionSpan` do qwen-code recebe o parâmetro explícito `parentToolSpan`, enquanto no claude-code ele é obtido implicitamente de `toolContext` ALS. Isso não afeta a funcionalidade, é apenas diferença de estilo. Se `toolContext` ALS for introduzido, pode ser unificado para obtenção implícita.

##### 5. subagent trace tree — ambos incompletos, não recomendado reutilizar diretamente

| Dimensão            | claude-code                                                             | qwen-code                                            |
| ------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Propagação de trace OTel | **Nenhum** — interaction do subagent é nova raiz                        | **Nenhum** — subagent não tem propagação explícita de trace |
| Associação de identidade | Perfetto metadata (agent process/thread) + `teammateContextStorage` ALS | `subagentNameContext` ALS + `SubagentExecutionEvent` |
| Isolamento de concorrência | Risco de vazamento de ALS OTel (`enterWith` é nível de processo, subagentes concorrentes sobrescrevem uns aos outros) | Mesmo risco |

O claude-code **também não resolveu bem** o OTel tracing de subagent:

- `interactionContext.enterWith()` é nível de processo; subagentes concorrentes sobrescrevem os valores ALS uns dos outros
- A verdadeira árvore hierárquica de agentes só existe no Perfetto (sistema feature-flagged interno da Anthropic), não no OTel

**Recomendação:**

- Curto prazo: manter o esquema existente do qwen-code com `subagentNameContext` + logs de eventos
- Médio prazo: criar um span `subagent` (parent = toolContext atual) ao iniciar o subagent, e usar `context.with()` em vez de `enterWith()` para isolar o contexto OTel de subagentes concorrentes
- É um item de trabalho que requer design independente, não recomendado copiar diretamente do claude-code

##### 6. LLM request span — caminho claro

Atualmente no qwen-code, usa-se `withSpan('api.generateContent', ...)` e `startSpanWithContext('api.generateContentStream', ...)` em `loggingContentGenerator.ts`.

Basta substituir por chamadas a `startLLMRequestSpan` / `endLLMRequestSpan` (já implementados na camada session-tracing). Cenário de streaming requer atenção:

- `startLLMRequestSpan` retorna objeto `Span`
- Necessário chamar manualmente `endLLMRequestSpan(span, metadata)` para finalizar
- Isso é compatível com o modo de gerenciamento manual de `startSpanWithContext`

### Resumo da reutilização

| Item de modificação                                                       | Grau de reutilização              | Esforço                                        | Prioridade |
| ------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------- | ---------- |
| Unificar caminho de criação de spans (abandonar `withSpan` do runtime, usar helpers session-tracing) | **Correção principal** — resolve quebra pai-filho | Médio (~5 pontos de chamada)                   | P0         |
| Adicionar `toolContext` ALS                                               | Copiar diretamente padrão do claude-code | Baixo (dentro de session-tracing.ts)           | P0         |
| tool.blocked_on_user span                                                 | Opção A precisa adaptar à máquina de estados | Médio (coordenação `_schedule` + `executeSingleToolCall`) | P1         |
| Conexão tool.execution                                                    | Helper já existe, só chamar        | Baixo (3 linhas em `executeSingleToolCall`)    | P1         |
| hook span                                                                 | Adicionar helper + pontos de chamada | Baixo                                          | P1         |
| Troca de LLM request span                                                 | Substituir `withSpan` por helper tipado | Baixo (2 pontos de chamada)                    | P1         |
| Árvore de trace de subagent                                               | **Não recomendado reutilizar diretamente** — requer design independente | Alto                                           | P2         |
```
### Ordem de implementação recomendada

```
Phase 1 — Corrigir estrutura da árvore de trace (P0)
├── 1a. session-tracing.ts: novo toolContext ALS + blocked_on_user / hook span helpers
├── 1b. loggingContentGenerator.ts: withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts: withSpan → startToolSpan/endToolSpan

Phase 2 — Completar workflow span (P1)
├── 2a. coreToolScheduler._schedule: integração do span blocked_on_user
├── 2b. coreToolScheduler.executeSingleToolCall: integração do span tool.execution
└── 2c. pontos de chamada hook pre/post: integração do span hook

Phase 3 — Subagent trace tree (P2)
├── 3a. Projetar solução de isolamento com context.with() (substituir enterWith)
├── 3b. Criar subagent root span ao iniciar subagent
└── 3c. Validação de cenário com subagents concorrentes
```
