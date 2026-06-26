# Workflow-уровень: недостаточная гранулярность Span'ов (P1)

> На основе ревью `qwen-code origin/main` от 2026-05-13

## Текущее состояние

В qwen-code уже есть инфраструктура tracing'а:

| Компонент            | Расположение                                         | Описание                                                         |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Определения Span'ов  | `packages/core/src/telemetry/session-tracing.ts`     | `interaction`, `llm_request`, `tool`, `tool.execution`           |
| Инструменты Tracer'а | `packages/core/src/telemetry/tracer.ts`              | session root context, `withSpan`, `startSpanWithContext`         |
| Точка входа интеракций | `packages/core/src/core/client.ts`                 | Явный запуск `interaction` span при верхнеуровневом взаимодействии |
| Управление жизненным циклом | —                                              | AsyncLocalStorage + WeakRef + TTL cleanup                        |

В текущей runtime стабильно задействованы два типа generic span'ов:

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**Вывод: проект находится на стадии «есть магистраль tracing'а», но границы этапов agent workflow ещё не закодированы в дерево trace целиком.**

### Сравнение: типы span'ов, реализованные в claude-code

См. `claude-code/src/utils/telemetry/sessionTracing.ts` (строка 49):

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## Недостающие элементы

| Отсутствующий span / механизм                  | Влияние                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| `permission_wait` / `blocked_on_user` span     | Невозможно отделить время ожидания одобрения от времени выполнения инструмента |
| `hook` span                                    | Время выполнения hook'а скрыто внутри tool span, граница неясна |
| `subagent` root span                           | Внутренние вызовы llm/tool внутри subagent не образуют поддерево trace |
| `tool.execution` – реальное подключение        | Helper определён, но основная цепочка вызовов не использует его |
| Стабильное выстраивание parent-child           | Span'ы в основном siblings корневого сессии, а не деревья |

## Поэлементный анализ

### 1. Ожидание одобрения пользователя отсутствует в trace

При ожидании одобрения инструмента путь перехода состояний: `awaiting_approval` → `scheduled` → выполнение.

- «Ожидание подтверждения пользователем» – это лишь переход состояний, а не узел trace
- В trace не видно затраченного на одобрение времени
- При медленной работе инструмента невозможно определить: «застрял в ожидании пользователя» или «инструмент сам работает медленно»

### 2. Hook'и имеют запись событий, но не имеют собственного span

После выполнения Pre/Post hook'а создаётся `HookCallEvent`, запись производится через `logHookCall()`, однако отдельный OTel span не создаётся.

- Если hook замедляется, это проявляется как замедление внешнего tool span
- Если hook завершается с ошибкой, это выглядит как «ошибка инструмента»
- Trace не может ответить на вопрос «время потрачено на hook или на tool.execution»

### 3. Subagent – это log/metric, а не поддерево trace

При запуске/завершении subagent записывается `SubagentExecutionEvent` и попадает в log/metric, но явное поддерево span не формируется.

- Можно подсчитать, «какой subagent выполнялся»
- Нельзя проследить по trace, «какие вызовы llm/tool запустил этот subagent»
- При параллельных subagent'ах цепочка причинно-следственных связей неясна

### 4. Helper tool.execution определён, но не подключён к основной цепочке

В `session-tracing.ts` уже есть `startToolExecutionSpan()` / `endToolExecutionSpan()`, но точки вызова в не-тестовом коде отсутствуют.

Текущее дерево trace:

```
session-root
  interaction
    api.generateContent
    tool.Bash
  subagent_execution        (log/metric)
  hook_call                 (event/QwenLogger)
```

Идеальное дерево trace:

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

### 5. Parent-child связи недостаточно стабильны

Interaction span существует, но многие span'ы во время выполнения висят под session root как siblings, а не как дочерние узлы interaction.

- Дерево вызовов плоское
- Связи между узлами неочевидны
- Опыт отслеживания от пользовательского раунда до внутренних llm/tool/hook/subagent разрознен

## Влияние

- Trace'ы имеют базовую ценность, но недостаточны для диагностики на уровне workflow
- Невозможно напрямую ответить на вопрос: «Этот раунд медленный из-за ожидания пользователя, hook'а или настоящего выполнения инструмента?»
- Невозможно восстановить процесс выполнения subagent как читаемое поддерево trace
- Проблемы с hook'ом скрыты внутри tool span, границы неясны
- В Jaeger / Tempo / ARMS дерево более плоское и менее читаемое по сравнению с claude-code

---

## Анализ возможности повторного использования подхода claude-code

> На основе глубокого сравнения исходного кода claude-code от 2026-05-13

### Архитектура tracing'а в claude-code

В claude-code в `src/utils/telemetry/sessionTracing.ts` реализована **единая система управления span'ами на основе двойного ALS**:

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

**Ключевые механизмы:**

| Механизм     | Реализация                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Двойной ALS  | `interactionContext` хранит текущий interaction span; `toolContext` хранит текущий tool span                                                                                                        |
| Разрешение parent | Для каждого типа span жёстко задано, из какого ALS брать parent: `llm_request`/`tool` берут из `interactionContext`; `blocked_on_user`/`execution`/`hook` берут из `toolContext`; у `hook` есть fallback на `interactionContext` |
| Жизненный цикл | enterWith (внедрение) → выполнение span → enterWith(undefined) (очистка)                                                                                                                            |
| Поиск span    | Для span'ов, не хранящихся в ALS (например, blocked_on_user), используется `activeSpans` Map с обратным поиском по `span.type`                                                                      |
| Управление памятью | Span'ы в ALS – WeakRef; span'ы не в ALS – strongRef во избежание сборки мусора; TTL 30 мин, автоматическая очистка                                                                                  |

**Полный жизненный цикл tool span в claude-code** (`toolExecution.ts`):

```
startToolSpan(name, attrs)                    // → toolContext.enterWith(spanCtx)
  startToolBlockedOnUserSpan()                // → parent = toolContext.getStore()
    [разрешение разрешений / запрос пользователю]
  endToolBlockedOnUserSpan(decision, source)
  startToolExecutionSpan()                    // → parent = toolContext.getStore()
    [tool.call()]
  endToolExecutionSpan({ success })
endToolSpan(result)                           // → toolContext.enterWith(undefined)
```

**Hook span в claude-code** (`hooks.ts`):

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [параллельное выполнение hook'ов]
endHookSpan(span, { success, blocking, ... })
```

### Текущая архитектура qwen-code vs claude-code

#### Ключевое различие: два разрозненных пути создания span'ов

Это самая важная архитектурная проблема qwen-code на данный момент:

| Уровень            | Файл                 | Использование                                                                                | Разрешение parent                                    |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| session-tracing    | `session-tracing.ts` | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan` | Явное извлечение parent из `interactionContext` ALS   |
| tracer             | `tracer.ts`          | `withSpan` / `startSpanWithContext`                                                          | Из `context.active()`, fallback на session root       |

**Фактическое использование в runtime:**

- `startInteractionSpan` → **подключён** (`client.ts` строка 956), записывает в `interactionContext` ALS
- `startLLMRequestSpan` / `endLLMRequestSpan` → **не подключён**, runtime использует `withSpan('api.generateContent', ...)` (в `loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **не подключён**, runtime использует `withSpan('tool.${name}', ...)` (в `coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **не подключён**

**Последствия:**

`getParentContext()` в `withSpan` сначала проверяет `context.active()` (родной контекст OTel), а если активного span нет, откатывается на session root context. Он **вообще не читает `interactionContext` ALS**.

Поэтому interaction span и LLM/tool span'ы становятся **sibling** на одном уровне под session root, а не parent-child деревом:

```
session-root
  ├── interaction         (из session-tracing, записан в interactionContext ALS)
  ├── api.generateContent (из withSpan, не читает interactionContext → висит на session root)
  ├── tool.Bash           (из withSpan, аналогично)
  └── tool.Read           (из withSpan, аналогично)
```

**А в claude-code есть только один путь создания span'ов (sessionTracing.ts), все span'ы проходят через одну и ту же логику преобразования ALS → OTel context, поэтому дерево полное.**

#### Поэлементная оценка возможности повторного использования

##### 1. Двойной ALS + явное разрешение parent — можно использовать повторно, это ключевое исправление

| Аспект          | claude-code                                            | qwen-code                                    |
| --------------- | ------------------------------------------------------ | -------------------------------------------- |
| Количество ALS  | 2 (`interactionContext` + `toolContext`)               | 1 (`interactionContext`, нет `toolContext`)   |
| Разрешение parent | Каждый тип span явно указывает, из какого ALS брать parent | `withSpan` единообразно через `context.active()` |
| Внедрение context | `trace.setSpan(otelContext.active(), parentCtx.span)` | `withSpan` внутри неявно через `startActiveSpan` |

**План повторного использования:**

В `session-tracing.ts` qwen-code уже реализован **почти такой же шаблон разрешения parent**, как в claude-code:

```typescript
// qwen-code session-tracing.ts (существует, но не используется)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

Этот код **полностью идентичен** логике `startLLMRequestSpan` из claude-code.

**Основной путь исправления: заменить вызовы `withSpan('api.*')` / `withSpan('tool.*')` в runtime на вызовы типизированных хелперов из session-tracing.** Не нужно переписывать слой session-tracing — его API уже готов.

Что нужно добавить:

- Добавить ALS `toolContext` (по аналогии с claude-code)
- Добавить типы span `blocked_on_user` и `hook` и соответствующие хелперы

##### 2. tool.blocked_on_user — требуется адаптация под различия в процессе одобрения

| Аспект          | claude-code                                | qwen-code                                                                  |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Место одобрения | Внутри `toolExecution.ts`, внутри tool span | Внутри `coreToolScheduler._schedule()`, перед tool span                     |
| Режим одобрения | Синхронное ожидание `resolveHookPermissionDecision()` | Управляется конечным автоматом: `validating` → `awaiting_approval` → `scheduled` → `executing` |
| Охват span      | Tool span включает blocked + execution     | Tool span (`withSpan`) покрывает только выполнение (начиная с `executeSingleToolCall`) |

**Ключевое различие:** В qwen-code точка входа `executeSingleToolCall` проверяет `toolCall.status !== 'scheduled'` и продолжает только если одобрение уже получено. То есть tool span с `withSpan` не охватывает ожидание одобрения.

**Варианты адаптации (два варианта):**

**Вариант А — перенести начало tool span вперёд (рекомендуется):**

Перенести вызов `startToolSpan` из `executeSingleToolCall` в `_schedule` перед проверкой одобрения, чтобы tool span покрывал полный жизненный цикл. При входе в состояние `awaiting_approval` вызывать `startToolBlockedOnUserSpan`, при переходе в `scheduled` — `endToolBlockedOnUserSpan`.

```
_schedule():
  startToolSpan(name)                         // ← добавить
    startToolBlockedOnUserSpan()              // ← добавить, при входе в awaiting_approval
      [ожидание конечного автомата]
    endToolBlockedOnUserSpan(decision)        // ← добавить, при переходе в scheduled
executeSingleToolCall():
    startToolExecutionSpan()                  // ← подключить существующий helper
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← нужно в finally
```

**Вариант Б — оставить tool span на месте, отслеживать одобрение отдельно:**

Создавать в `_schedule` независимый span `approval_wait` (не как дочерний для tool), привязать к interaction. Плюс: меньше изменений. Минус: несоответствие модели claude-code, ухудшение читаемости дерева trace.

**Рекомендуется вариант А**, так как:

- Структура дерева trace совпадает с claude-code
- Один узел tool покажет «сколько ждали + сколько выполняли»
- Особенности управления конечным автоматом влияют только на моменты запуска/остановки span, но не на моделирование parent-child

##### 3. Hook span — можно использовать напрямую

| Аспект          | claude-code                         | qwen-code                                                            |
| --------------- | ----------------------------------- | -------------------------------------------------------------------- |
| Точка входа hook | `executeHooks()` в `hooks.ts`      | `firePreToolUseHook`/`firePostToolUseHook` через `hookEventHandler.ts` |
| Существующая запись | OTel span + Perfetto span         | `HookCallEvent` → `QwenLogger` (без OTel)                            |
| Parent          | `toolContext ?? interactionContext` | —                                                                    |

**План повторного использования:**

1. В `session-tracing.ts` добавить `startHookSpan` / `endHookSpan` (parent = `toolContext ?? interactionContext`, как в claude-code)
2. В `coreToolScheduler.ts` внутри `executeSingleToolCall` — запускать/останавливать hook span до и после вызова pre/post hook
3. Сохранить существующую запись `logHookCall` (оба механизма работают параллельно, не исключая друг друга)

Объём изменений невелик, на существующую логику hook'ов не влияет.

##### 4. tool.execution — helper уже есть, нужно только подключить

В qwen-code `startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` уже полностью реализованы, осталось вызвать их в `executeSingleToolCall`:

```typescript
// coreToolScheduler.ts, внутри executeSingleToolCall
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

Примечание: `startToolExecutionSpan` в qwen-code принимает явный параметр `parentToolSpan`, а в claude-code он получается неявно из ALS `toolContext`. Функционально разницы нет, только стиль. Если добавить ALS `toolContext`, можно перейти на неявное получение.

##### 5. Subagent trace tree — у обоих проектов неполно, прямое заимствование не рекомендуется

| Аспект            | claude-code                                                             | qwen-code                                            |
| ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Распространение OTel trace | **Нет** — interaction subagent — новый корень                           | **Нет** — subagent не имеет явного распространения trace |
| Связь идентификаторов | Perfetto metadata (agent process/thread) + `teammateContextStorage` ALS | `subagentNameContext` ALS + `SubagentExecutionEvent` |
| Изоляция параллельных вызовов | Утечка в OTel ALS (enterWith процесс-уровневый, параллельные subagent'ы могут перезаписывать друг друга) | Тот же риск |

В claude-code **сами не решили** проблему OTel tracing для subagent:

- `interactionContext.enterWith()` — процесс-уровневый, параллельные subagent'ы перезаписывают значения ALS друг друга
- Настоящее иерархическое дерево агентов существует только в Perfetto (внутренняя система Anthropic с feature flag) — не в OTel

**Рекомендации:**

- Краткосрочно: оставить существующую схему `subagentNameContext` + журнал событий
- Среднесрочно: при запуске subagent создавать `subagent` span (parent = текущий toolContext) и использовать `context.with()` вместо `enterWith()` для изоляции OTel контекста параллельных subagent'ов
- Это отдельная задача, требующая проектирования — копировать claude-code напрямую не стоит

##### 6. LLM request span — путь ясен

Сейчас в qwen-code в `loggingContentGenerator.ts` используется `withSpan('api.generateContent', ...)` и `startSpanWithContext('api.generateContentStream', ...)`.

Достаточно заменить на вызовы `startLLMRequestSpan` / `endLLMRequestSpan` (уже реализованы в слое session-tracing). Для streaming-сценария нужно учесть:

- `startLLMRequestSpan` возвращает объект `Span`
- Нужно явно завершить вызовом `endLLMRequestSpan(span, metadata)`
- Это совместимо с режимом ручного управления в `startSpanWithContext`

### Итоги повторного использования

| Изменение                                                                         | Степень готовности к заимствованию                         | Объём изменений                               | Приоритет |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- | --------- |
| Унификация пути создания span'ов (замена `withSpan` в runtime на хелперы session-tracing) | **Ключевое исправление** — решает проблему parent-child | Средний (около 5 точек вызова)                | P0        |
| Добавление ALS `toolContext`                                                      | Прямое копирование подхода claude-code                     | Низкий (внутри session-tracing.ts)            | P0        |
| tool.blocked_on_user span                                                         | Вариант А требует адаптации под конечный автомат           | Средний (координация _schedule + executeSingleToolCall) | P1        |
| Подключение tool.execution                                                        | Helper уже есть, нужно вызвать                             | Низкий (3 строки в executeSingleToolCall)     | P1        |
| Hook span                                                                         | Добавление helper'а + точка вызова                        | Низкий                                        | P1        |
| Переключение LLM request span                                                     | Замена withSpan на типизированный helper                   | Низкий (2 точки вызова)                       | P1        |
| Subagent trace tree                                                               | **Прямое заимствование не рекомендуется** — требуется отдельное проектирование | Высокий                                       | P2        |

### Рекомендуемая последовательность внедрения

```
Фаза 1 — Исправление структуры дерева trace (P0)
├── 1a. session-tracing.ts: добавить ALS toolContext + хелперы для blocked_on_user / hook
├── 1b. loggingContentGenerator.ts: withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts: withSpan → startToolSpan/endToolSpan

Фаза 2 — Восполнение workflow span'ов (P1)
├── 2a. coreToolScheduler._schedule: подключить blocked_on_user span
├── 2b. coreToolScheduler.executeSingleToolCall: подключить tool.execution span
└── 2c. В местах вызова hook pre/post: подключить hook span

Фаза 3 — Subagent trace tree (P2)
├── 3a. Спроектировать схему изоляции с context.with() (вместо enterWith)
├── 3b. При запуске subagent создавать subagent root span
└── 3c. Валидация сценария параллельных subagent'ов
```