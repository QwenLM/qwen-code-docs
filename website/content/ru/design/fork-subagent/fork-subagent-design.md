# Дизайн форк-субагента

> Неявный форк-субагент, который наследует полный контекст разговора родителя и использует общий кэш промптов для экономичного параллельного выполнения задач.

## Обзор

При вызове инструмента Agent без указания `subagent_type` запускается неявный **форк** — фоновый субагент, который наследует историю разговора, системный промпт и определения инструментов родителя. Форк использует `CacheSafeParams`, чтобы гарантировать, что его API-запросы имеют тот же префикс, что и у родителя, что обеспечивает попадание в кэш промптов DashScope.

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

Синтетическая конфигурация агента, не зарегистрированная в `builtInAgents`. Имеет резервный `systemPrompt`, но на практике использует сформированный системный промпт родителя через `generationConfigOverride`.

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

### 3. Формирование истории (`agent.ts` + `forkSubagent.ts`)

Поле `extraHistory` форка должно заканчиваться сообщением от модели, чтобы сохранить чередование user/model в Gemini API при отправке `task_prompt` через `agent-headless`.

Три случая:

| Завершение истории родителя      | Формирование extraHistory                                              | task_prompt                    |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| `model` (без вызовов функций)   | `[...rawHistory]` (без изменений)                                          | `buildChildMessage(directive)` |
| `model` (с вызовами функций) | `[...rawHistory, model(clone), user(responses+directive), model(ack)]` | `'Begin.'`                     |
| `user` (редкий случай)              | `rawHistory.slice(0, -1)` (удаляет последний user)                         | `buildChildMessage(directive)` |

### 4. Предотвращение рекурсивных форков (`forkSubagent.ts`)

Функция `isInForkChild()` сканирует историю разговора на наличие тега `<fork-boilerplate>`. Если тег найден, попытка создания форка отклоняется с сообщением об ошибке.

### 5. Фоновое выполнение (`agent.ts`)

Форк использует `void executeSubagent()` (fire-and-forget) и немедленно возвращает родителю `FORK_PLACEHOLDER_RESULT`. Ошибки в фоновой задаче перехватываются, логируются и отражаются в состоянии отображения.

## Поток данных

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

## Graceful Degradation

Если `getCacheSafeParams()` возвращает null (первый запрос, история ещё отсутствует), форк переключается на резервный вариант:

- `FORK_AGENT.systemPrompt` для системной инструкции
- `prepareTools()` для описаний инструментов

Это гарантирует работоспособность форка даже без совместного использования кэша.

## Файлы

| Файл                                                 | Роль                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/agents/runtime/forkSubagent.ts`   | Конфигурация FORK_AGENT, buildForkedMessages(), isInForkChild(), buildChildMessage()        |
| `packages/core/src/tools/agent.ts`                   | Логика форка: получение CacheSafeParams, формирование extraHistory, фоновое выполнение |
| `packages/core/src/agents/runtime/agent-headless.ts` | Опции execute(): generationConfigOverride, toolsOverride                            |
| `packages/core/src/agents/runtime/agent-core.ts`     | CreateChatOptions.generationConfigOverride                                            |
| `packages/core/src/followup/forkedQuery.ts`          | Инфраструктура CacheSafeParams (существующая, без изменений)                                 |