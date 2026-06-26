# Design do Fork Subagent

> Subagent fork implícito que herda o contexto completo da conversa do pai e compartilha o cache de prompt para execução paralela eficiente de tarefas.

## Visão Geral

Quando a ferramenta Agent é chamada sem `subagent_type`, ela dispara um **fork** implícito — um subagent em segundo plano que herda o histórico de conversa, o prompt de sistema e as definições de ferramentas do pai. O fork usa `CacheSafeParams` para garantir que suas requisições de API compartilhem o mesmo prefixo que as do pai, habilitando o reuso de cache de prompt do DashScope.

## Arquitetura

```
Conversa pai: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (model)]
                              ↑ prefixo idêntico para todos os forks ↑

Fork A: [...MsgN | placeholder results | "Research A"]  ← cache compartilhado
Fork B: [...MsgN | placeholder results | "Modify B"]    ← cache compartilhado
Fork C: [...MsgN | placeholder results | "Test C"]      ← cache compartilhado
```

## Componentes Principais

### 1. FORK_AGENT (`forkSubagent.ts`)

Configuração de agente sintético, não registrado em `builtInAgents`. Possui um `systemPrompt` de fallback, mas na prática usa o prompt de sistema renderizado do pai via `generationConfigOverride`.

### 2. Integração com CacheSafeParams (`agent.ts` + `forkedQuery.ts`)

```
agent.ts (caminho do fork)
  │
  ├── getCacheSafeParams()          ← snapshot do generationConfig do pai
  │     ├── generationConfig        ← systemInstruction + tools + temp/topP
  │     └── history                 ← (não usado — construímos extraHistory)
  │
  ├── forkGenerationConfig          ← passado como generationConfigOverride
  └── forkToolsOverride             ← FunctionDeclaration[] extraído das tools
        │
        ▼
  AgentHeadless.execute(context, signal, {
    extraHistory,                   ← histórico da conversa pai
    generationConfigOverride,       ← systemInstruction + tools exatos do pai
    toolsOverride,                  ← declarações de ferramentas exatas do pai
  })
        │
        ▼
  AgentCore.createChat(context, {
    extraHistory,
    generationConfigOverride,       ← desvia de buildChatSystemPrompt()
  })                                   E pula getInitialChatHistory()
        │                              (extraHistory já tem contexto de ambiente)
        ▼
  new GeminiChat(config, generationConfig, startHistory)
                          ↑ byte a byte idêntico ao config do pai
```

### 3. Construção do Histórico (`agent.ts` + `forkSubagent.ts`)

O `extraHistory` do fork deve terminar com uma mensagem do modelo para manter a alternância entre usuário e modelo da API Gemini quando `agent-headless` envia o `task_prompt`.

Três casos:

| Histórico do pai termina com   | Construção do extraHistory                                                              | task_prompt                    |
| ------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------ |
| `model` (sem chamadas de função) | `[...rawHistory]` (inalterado)                                                          | `buildChildMessage(directive)` |
| `model` (com chamadas de função) | `[...rawHistory, model(clone), user(responses+directive), model(ack)]`                  | `'Begin.'`                     |
| `user` (incomum)               | `rawHistory.slice(0, -1)` (remove último user)                                          | `buildChildMessage(directive)` |

### 4. Prevenção de Fork Recursivo (`forkSubagent.ts`)

`isInForkChild()` varre o histórico da conversa em busca da tag `<fork-boilerplate>`. Se encontrada, a tentativa de fork é rejeitada com uma mensagem de erro.

### 5. Execução em Segundo Plano (`agent.ts`)

O fork usa `void executeSubagent()` (fire-and-forget) e retorna `FORK_PLACEHOLDER_RESULT` imediatamente para o pai. Erros da tarefa em segundo plano são capturados, registrados e refletidos no estado de exibição.

## Fluxo de Dados

```
1. Model chama ferramenta Agent (sem subagent_type)
2. agent.ts: importa forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: constrói extraHistory a partir do pai getHistory(true)
5. agent.ts: constrói forkTaskPrompt (directive ou 'Begin.')
6. agent.ts: cria AgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — segundo plano
8. agent.ts: retorna FORK_PLACEHOLDER_RESULT para o pai imediatamente
9. Segundo plano:
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — usa generationConfig do pai (cache compartilhado)
   c. runReasoningLoop() — usa declarações de ferramentas do pai
   d. Fork executa ferramentas, produz resultado
   e. updateDisplay() com status final
```

## Degradação Graciosa

Se `getCacheSafeParams()` retornar `null` (primeira interação, nenhum histórico ainda), o fork cai para:

- `FORK_AGENT.systemPrompt` como instrução de sistema
- `prepareTools()` como declarações de ferramentas

Isso garante que o fork sempre funcione, mesmo sem compartilhamento de cache.

## Arquivos

| Arquivo                                                | Função                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/core/src/agents/runtime/forkSubagent.ts`     | Configuração do FORK_AGENT, buildForkedMessages(), isInForkChild(), buildChildMessage()     |
| `packages/core/src/tools/agent.ts`                     | Caminho do fork: recuperação CacheSafeParams, construção extraHistory, execução em segundo plano |
| `packages/core/src/agents/runtime/agent-headless.ts`   | Opções do execute(): generationConfigOverride, toolsOverride                               |
| `packages/core/src/agents/runtime/agent-core.ts`       | CreateChatOptions.generationConfigOverride                                                 |
| `packages/core/src/followup/forkedQuery.ts`            | Infraestrutura CacheSafeParams (existente, sem alterações)                                 |