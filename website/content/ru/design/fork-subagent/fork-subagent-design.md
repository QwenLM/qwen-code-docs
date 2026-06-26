# Дизайн Fork Subagent

> Неявный fork subagent, который наследует полный контекст беседы родителя и использует общий кеш подсказок для экономичной параллельной задачи.

## Обзор

Когда инструмент Agent вызывается без `subagent_type`, он запускает неявный **fork** — фоновый subagent, который наследует историю беседы родителя, системный промпт и определения инструментов. Fork использует `CacheSafeParams`, чтобы его API-запросы имели одинаковый префикс с запросами родителя, что обеспечивает попадание в кеш подсказок DashScope.

## Архитектура

```
Parent conversation: [SystemPrompt | Tools | Msg1 | Msg2 | ... | MsgN (model)]
                              ↑ identical prefix for all forks ↑

Fork A: [...MsgN | placeholder results | "Research A"]  ← shared cache
Fork B: [...MsgN | placeholder results | "Modify B"]    ← shared cache
Fork C: [...MsgN | placeholder results | "Test C"]      ← shared cache
```

## Ключевые компоненты

### 1. FORK_AGENT (`forkSubagent.ts`)

Синтетическая конфигурация агента, не зарегистрированная в `builtInAgents`. Имеет запасной `systemPrompt`, но на практике использует отрисованный системный промпт родителя через `generationConfigOverride`.

### 2. Интеграция CacheSafeParams (`agent.ts` + `forkedQuery.ts`)

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

### 3. Построение истории (`agent.ts` + `forkSubagent.ts`)

`extraHistory` у fork должен заканчиваться сообщением модели, чтобы соблюсти чередование user/model в Gemini API, когда `agent-headless` отправляет `task_prompt`.

Три случая:

| История родителя заканчивается на | Построение extraHistory                                          | task_prompt                    |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| `model` (без вызовов функций)     | `[...rawHistory]` (без изменений)                                | `buildChildMessage(directive)` |
| `model` (с вызовами функций)      | `[...rawHistory, model(clone), user(responses+directive), model(ack)]` | `'Begin.'`                     |
| `user` (необычный случай)         | `rawHistory.slice(0, -1)` (удалить последний user)               | `buildChildMessage(directive)` |

### 4. Предотвращение рекурсивных fork (`forkSubagent.ts`)

`isInForkChild()` сканирует историю беседы на наличие тега `<fork-boilerplate>`. Если тег найден, попытка fork отклоняется с сообщением об ошибке.

### 5. Фоновое выполнение (`agent.ts`)

Fork использует `void executeSubagent()` (запустил и забыл) и немедленно возвращает `FORK_PLACEHOLDER_RESULT` родителю. Ошибки в фоновой задаче перехватываются, логируются и отражаются в состоянии отображения.

## Поток данных

```
1. Модель вызывает инструмент Agent (без subagent_type)
2. agent.ts: import forkSubagent.js
3. agent.ts: getCacheSafeParams() → forkGenerationConfig + forkToolsOverride
4. agent.ts: build extraHistory из parent's getHistory(true)
5. agent.ts: build forkTaskPrompt (directive или 'Begin.')
6. agent.ts: createAgentHeadless(FORK_AGENT, ...)
7. agent.ts: void executeSubagent() — фоновый
8. agent.ts: return FORK_PLACEHOLDER_RESULT родителю немедленно
9. Фоновый процесс:
   a. AgentHeadless.execute(context, signal, {extraHistory, generationConfigOverride, toolsOverride})
   b. AgentCore.createChat() — использует generationConfig родителя (общий кеш)
   c. runReasoningLoop() — использует объявления инструментов родителя
   d. Fork выполняет инструменты, формирует результат
   e. updateDisplay() с финальным статусом
```

## Graceful Degradation

Если `getCacheSafeParams()` возвращает null (первый ход, нет истории), то fork использует запасной вариант:

- `FORK_AGENT.systemPrompt` для системной инструкции
- `prepareTools()` для объявлений инструментов

Это гарантирует, что fork всегда работает, даже без общего кеша.

## Файлы

| Файл                                                           | Роль                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/core/src/agents/runtime/forkSubagent.ts`             | Конфигурация FORK_AGENT, buildForkedMessages(), isInForkChild(), buildChildMessage() |
| `packages/core/src/tools/agent.ts`                             | Путь fork: получение CacheSafeParams, построение extraHistory, фоновое выполнение    |
| `packages/core/src/agents/runtime/agent-headless.ts`           | Опции execute(): generationConfigOverride, toolsOverride                             |
| `packages/core/src/agents/runtime/agent-core.ts`               | CreateChatOptions.generationConfigOverride                                           |
| `packages/core/src/followup/forkedQuery.ts`                    | Инфраструктура CacheSafeParams (существующая, без изменений)                         |