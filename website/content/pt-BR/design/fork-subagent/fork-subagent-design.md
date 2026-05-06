# Design do Subagente Fork

> Subagente fork implícito que herda o contexto completo da conversa do pai e compartilha o cache de prompt para execução paralela de tarefas com custo eficiente.

## Visão Geral

Quando a ferramenta Agent é chamada sem `subagent_type`, ela aciona um **fork** implícito — um subagente em segundo plano que herda o histórico de conversas, o prompt do sistema e as definições de ferramentas do pai. O fork usa `CacheSafeParams` para garantir que suas requisições de API compartilhem o mesmo prefixo das do pai, permitindo acertos no cache de prompt do DashScope.

## Arquitetura

```
Parent conversation: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (model)]
                              ↑ identical prefix for all forks ↑

Fork A: [...MsgN | placeholder results | "Research A"]  ← shared cache
Fork B: [...MsgN | placeholder results | "Modify B"]    ← shared cache
Fork C: [...MsgN | placeholder results | "Test C"]      ← shared cache
```

## Componentes Principais

### 1. FORK_AGENT (`forkSubagent.ts`)

Configuração de agente sintético, não registrada em `builtInAgents`. Possui um `systemPrompt` de fallback, mas na prática usa o prompt do sistema renderizado do pai por meio de `generationConfigOverride`.

### 2. Integração com CacheSafeParams (`agent.ts` + `forkedQuery.ts`)

```
agent.ts (fork path)
  │
  ├── getCacheSafeParams()          ← parent's generationConfig snapshot
  │     ├── generationConfig        ← systemInstruction + tools + temp/topP
  │     └── history                 ← (not used — we build extraHistory instead)
  │
  ├── forkGenerationConfig          ← passed as generationConfigOverride
  └── forkToolsOverride             ← FunctionDeclaration[] extracted from tools
        │
        ▼
  AgentHeadless.execute(context, signal, {
    extraHistory,                   ← parent conversation history
    generationConfigOverride,       ← parent's exact systemInstruction + tools
    toolsOverride,                  ← parent's exact tool declarations
  })
        │
        ▼
  AgentCore.createChat(context, {
    extraHistory,
    generationConfigOverride,       ← bypasses buildChatSystemPrompt()
  })                                   AND skips getInitialChatHistory()
        │                              (extraHistory already has env context)
        ▼
  new GeminiChat(config, generationConfig, startHistory)
                          ↑ byte-identical to parent's config
```

### 3. Construção do Histórico (`agent.ts` + `forkSubagent.ts`)

O `extraHistory` do fork deve terminar com uma mensagem do modelo para manter a alternância user/model da API Gemini quando o `agent-headless` envia o `task_prompt`.

Três casos:

| Histórico do pai termina com  | Construção do extraHistory                                             | task_prompt                    |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `model` (sem chamadas de função) | `[...rawHistory]` (inalterado)                                      | `buildChildMessage(directive)` |
| `model` (com chamadas de função) | `[...rawHistory, model(clone), user(responses+directive), model(ack)]` | `'Begin.'`                     |
| `user` (incomum)              | `rawHistory.slice(0, -1)` (remove user final)                        | `buildChildMessage(directive)` |

### 4. Prevenção de Fork Recursivo (`forkSubagent.ts`)

`isInForkChild()` verifica o histórico de conversas em busca da tag `<fork-boilerplate>`. Se encontrada, a tentativa de fork é rejeitada com uma mensagem de erro.

### 5. Execução em Segundo Plano (`agent.ts`)

O fork usa `void executeSubagent()` (fire-and-forget) e retorna `FORK_PLACEHOLDER_RESULT` imediatamente para o pai. Erros na tarefa em segundo plano são capturados, registrados em log e refletidos no estado de exibição.

## Fluxo de Dados

```
1. Model calls Agent tool (no subagent_type)
2. agent.ts: import forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: build extraHistory from parent's getHistory(true)
5. agent.ts: build forkTaskPrompt (directive or 'Begin.')
6. agent.ts: createAgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — background
8. agent.ts: return FORK_PLACEHOLDER_RESULT to parent immediately
9. Background:
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — uses parent's generationConfig (cache-shared)
   c. runReasoningLoop() — uses parent's tool declarations
   d. Fork executes tools, produces result
   e. updateDisplay() with final status
```

## Degradação Graciosa

Se `getCacheSafeParams()` retornar null (primeira interação, sem histórico ainda), o fork recorre a:

- `FORK_AGENT.systemPrompt` para a instrução do sistema
- `prepareTools()` para as declarações de ferramentas

Isso garante que o fork sempre funcione, mesmo sem compartilhamento de cache.

## Arquivos

| Arquivo                                              | Função                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`   | Configuração do FORK_AGENT, buildForkedMessages(), isInForkChild(), buildChildMessage() |
| `packages/core/src/tools/agent.ts`                   | Caminho do fork: recuperação de CacheSafeParams, construção do extraHistory, execução em segundo plano |
| `packages/core/src/agents/runtime/agent-headless.ts` | Opções do execute(): generationConfigOverride, toolsOverride                          |
| `packages/core/src/agents/runtime/agent-core.ts`     | CreateChatOptions.generationConfigOverride                                            |
| `packages/core/src/followup/forkedQuery.ts`          | Infraestrutura do CacheSafeParams (existente, sem alterações)                         |