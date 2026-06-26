# Анализ недостаточной детализации спанов на уровне Workflow (P1)

> Основано на ревью кода qwen-code origin/main от 2026-05-13

## Текущее состояние

qwen-code уже имеет инфраструктуру трассировки:

| Компонент            | Расположение                                              | Описание                                                            |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Определение типов Span | `packages/core/src/telemetry/session-tracing.ts`          | `interaction`, `llm_request`, `tool`, `tool.execution`              |
| Инструментарий Tracer | `packages/core/src/telemetry/tracer.ts`                   | session root context, `withSpan`, `startSpanWithContext`            |
| Точка входа взаимодействия | `packages/core/src/core/client.ts`                        | Верхнеуровневое взаимодействие явно запускает span `interaction`    |
| Управление жизненным циклом | —                                                         | AsyncLocalStorage + WeakRef + TTL очистка                           |

В текущем runtime стабильно подключены в основном два типа обобщённых спанов:

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**Вывод: система находится на этапе "есть магистраль трассировки", но границы этапов агентного workflow ещё не полностью закодированы в дерево трассировки.**

### Сравнение: уже реализованные типы спанов в claude-code

См. `claude-code/src/utils/telemetry/sessionTracing.ts` (строка 49):

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## Отсутствующие элементы

| Отсутствующий span / механизм              | Влияние                                                              |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `permission_wait` / `blocked_on_user` span | Невозможно отличить ожидание утверждения от времени выполнения инструмента |
| `hook` span                               | Время hook'а схлопывается в span инструмента, границы неясны         |
| `subagent` root span                      | Вызовы llm/tool внутри subagent не образуют поддерево трассировки     |
| Фактическое подключение `tool.execution`  | Helper объявлен, но не вызывается в основном конвейере                |
| Стабильное parent-child wiring            | Спаны в основном являются sibling'ами корня сессии, а не иерархическими |

## Поэлементный анализ

### 1. Ожидание утверждения пользователя отсутствует в трассировке

При ожидании утверждения для вызова инструмента переход состояния: `awaiting_approval` → `scheduled` → выполнение.

- "Ожидание подтверждения пользователем" — это только переход состояния, не узел трассировки
- В трассировке не видно затраченного времени на утверждение
- При медленной работе инструмента невозможно определить: "застрял на ожидании пользователя" или "инструмент сам выполняется медленно"

### 2. Hook'и имеют запись события, но не независимый span

После выполнения Pre/Post hook'а генерируется `HookCallEvent`, вызывается `logHookCall()`, но не создаётся отдельный OTel span.

- Замедление hook'а проявляется как замедление внешнего span инструмента
- Сбой hook'а выглядит как "сбой инструмента"
- Трассировка не может ответить: "время потрачено на hook или на tool.execution?"

### 3. Subagent — это log/metric, а не поддерево трассировки

Запуск/завершение subagent'а записывается как `SubagentExecutionEvent` и попадает в log/metric, но не формирует явное поддерево span'ов.

- Можно подсчитать, "какой subagent запускался"
- Нельзя проследить по трассе, "какие вызовы llm/tool вызвал этот subagent"
- При параллельных subagent'ах причинно-следственная цепочка размыта

### 4. Helper tool.execution определён, но не подключён к основному конвейеру

В `session-tracing.ts` уже есть `startToolExecutionSpan()` / `endToolExecutionSpan()`, но в не тестовом коде они не вызываются.

Текущее дерево трассировки:

```
session-root
  interaction
    api.generateContent
    tool.Bash
  subagent_execution        (log/metric)
  hook_call                 (event/QwenLogger)
```

Идеальное дерево трассировки:

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

### 5. Parent-child wiring недостаточно стабилен

Span `interaction` существует, но многие работающие span'ы висят как sibling'ы корня сессии, а не дочерние элементы interaction.

- Дерево вызовов плоское
- Причинно-следственные связи между узлами не очевидны
- Путь от одного пользовательского раунда до внутренних вызовов llm/tool/hook/subagent не непрерывен

## Влияние

- Трассировки имеют базовую ценность, но недостаточны для отладки на уровне Workflow
- Невозможно напрямую ответить: "этот раунд медленный из-за ожидания пользователя, hook'а или реального выполнения инструмента"
- Нельзя восстановить процесс работы subagent'а как читаемое поддерево трассировки
- Проблемы hook'а схлопываются в span инструмента, границы неясны
- В Jaeger / Tempo / ARMS дерево более плоское и менее читаемое, чем у claude-code

---

## Анализ применимости решения claude-code

> Основано на глубоком сравнении исходного кода claude-code от 2026-05-13

### Архитектура трассировки claude-code

В `src/utils/telemetry/sessionTracing.ts` claude-code реализована **единая система управления span'ами на основе двойного ALS**:

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

**Ключевой механизм:**

| Механизм   | Реализация                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Двойной ALS | `interactionContext` хранит текущий span interaction; `toolContext` хранит текущий span tool                                                                                                              |
| Parent resolution | Для каждого типа span жёстко задано, из какого ALS брать родителя: `llm_request`/`tool` берут из `interactionContext`; `blocked_on_user`/`execution`/`hook` берут из `toolContext`; `hook` имеет fallback на `interactionContext` |
| Жизненный цикл | enterWith injection → span работает → enterWith(undefined) очистка                                                                                                                                       |
| Поиск span  | Спаны, не хранящиеся в ALS (например, blocked_on_user), ищутся по `activeSpans` Map с ключом `span.type`                                                                                                  |
| Управление памятью | ALS-хранимые span'ы используют WeakRef; span'ы не в ALS используют strongRef для предотвращения GC; TTL 30 мин автоматическая очистка                                                                   |
**claude-code tool span полный жизненный цикл** (`toolExecution.ts`):

```
startToolSpan(name, attrs)                    // → toolContext.enterWith(spanCtx)
  startToolBlockedOnUserSpan()                // → parent = toolContext.getStore()
    [разрешение прав / запрос пользователю]
  endToolBlockedOnUserSpan(decision, source)
  startToolExecutionSpan()                    // → parent = toolContext.getStore()
    [tool.call()]
  endToolExecutionSpan({ success })
endToolSpan(result)                           // → toolContext.enterWith(undefined)
```

**claude-code hook span** (`hooks.ts`):

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [параллельное выполнение hook]
endHookSpan(span, { success, blocking, ... })
```

### qwen-code текущая архитектура vs claude-code

#### Принципиальное различие: два разрозненных пути создания span

Это самая критичная архитектурная проблема qwen-code на данный момент:

| Слой                | Файл                  | Использование                                                                              | Разрешение parent                                          |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| слой session-tracing | `session-tracing.ts`  | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan` | Явно берёт parent из ALS `interactionContext`              |
| слой tracer         | `tracer.ts`           | `withSpan` / `startSpanWithContext`                                                        | Берёт parent из `context.active()`, fallback на session-root |

**Фактическое использование в runtime:**

- `startInteractionSpan` → **уже подключен** (`client.ts` строка 956), записывается в ALS `interactionContext`
- `startLLMRequestSpan` / `endLLMRequestSpan` → **не подключены**, runtime использует `withSpan('api.generateContent', ...)` (в `loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **не подключены**, runtime использует `withSpan('tool.${name}', ...)` (в `coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **не подключены**

**Последствия:**

`getParentContext()` в `withSpan` сначала проверяет `context.active()` (родной контекст OTel), а если активного span не найдено — откатывается к session-root context. Он **вообще не читает** ALS `interactionContext`.

Поэтому interaction span и LLM/tool span становятся **сиблингами** одного уровня под session-root, а не деревом parent-child:

```
session-root
  ├── interaction         (из session-tracing, записан в ALS interactionContext)
  ├── api.generateContent (из withSpan, не читает interactionContext → вешается на session root)
  ├── tool.Bash           (из withSpan, то же самое)
  └── tool.Read           (из withSpan, то же самое)
```

**А в claude-code есть только один путь создания span (`sessionTracing.ts`), все span проходят через одну и ту же логику преобразования ALS → OTel context, поэтому дерево полное.**

#### Поэлементная оценка возможности повторного использования

##### 1. Два ALS + явное разрешение parent — можно повторно использовать, это ключевое исправление

| Измерение       | claude-code                                       | qwen-code                                                      |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Количество ALS  | 2 (`interactionContext` + `toolContext`)          | 1 (`interactionContext`, `toolContext` отсутствует)            |
| Разрешение parent | Для каждого типа span явно указано, из какого ALS брать parent | `withSpan` единообразно использует `context.active()` |
| Внедрение context | `trace.setSpan(otelContext.active(), parentCtx.span)` | Внутри `withSpan` неявно внедряется `startActiveSpan` |

**План повторного использования:**

`session-tracing.ts` в qwen-code уже реализует **почти тот же шаблон разрешения parent**, что и в claude-code:

```typescript
// qwen-code session-tracing.ts (уже есть, но не используется)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

Этот код **полностью идентичен** логике `startLLMRequestSpan` из claude-code.

**Основной путь исправления: удалить вызовы `withSpan('api.*')` / `withSpan('tool.*')` в runtime и заменить их на вызовы типизированных хелперов из `session-tracing`.** Переписывать слой `session-tracing` не нужно — его API уже готов.

Единственное, что нужно добавить:

- Добавить ALS `toolContext` (по аналогии с claude-code)
- Добавить типы span `blocked_on_user` и `hook` и соответствующие хелперы

##### 2. tool.blocked_on_user — требуется адаптация под разницу в потоке утверждения

| Измерение          | claude-code                              | qwen-code                                                                          |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Место утверждения  | Внутри `toolExecution.ts`, внутри tool span | В `coreToolScheduler._schedule()`, до tool span                                   |
| Режим утверждения  | Синхронное ожидание `resolveHookPermissionDecision()` | Управляется конечным автоматом: `validating` → `awaiting_approval` → `scheduled` → `executing` |
| Покрытие span      | Tool span включает blocked + execution     | Tool span (`withSpan`) покрывает только execution (начиная с `executeSingleToolCall`) |

**Ключевое отличие:** вход в `executeSingleToolCall` в qwen-code проверяет `toolCall.status !== 'scheduled'` — то есть к моменту вызова утверждение уже завершено. `withSpan` для tool span не может охватить ожидание утверждения.

**План адаптации (два варианта):**

**Вариант A — перенести начало tool span раньше (рекомендуется):**

Перенести вызов `startToolSpan` из `executeSingleToolCall` в `_schedule` до проверки утверждения, чтобы tool span покрывал полный жизненный цикл. При переходе в состояние `awaiting_approval` вызывать `startToolBlockedOnUserSpan`, а при завершении утверждения (состояние `scheduled`) — `endToolBlockedOnUserSpan`.
```
_schedule():
  startToolSpan(name)                         // ← новый
    startToolBlockedOnUserSpan()              // ← новый, вход в awaiting_approval
      [конечный автомат ожидает]
    endToolBlockedOnUserSpan(decision)        // ← новый, вход в scheduled
executeSingleToolCall():
    startToolExecutionSpan()                  // ← подключить существующий helper
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← нужно в finally
```

**Вариант B — оставить tool span на месте, отслеживать утверждение отдельно:**

В `_schedule` создаётся независимый span `approval_wait` (не как дочерний для tool), вешающийся под interaction. Плюс — меньше изменений, минус — несоответствие модели claude-code, низкая читаемость дерева trace.

**Рекомендуется вариант А**, так как:

- Соответствует структуре дерева trace в claude-code
- Один tool-узел показывает «сколько ждали + сколько выполняли»
- Особенности конечного автомата влияют только на момент start/end span, не на модель parent-child

##### 3. Hook span — можно использовать напрямую

| Измерение          | claude-code                          | qwen-code                                                                       |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------- |
| Точка входа hook   | `executeHooks()` в `hooks.ts`        | `firePreToolUseHook`/`firePostToolUseHook` через `hookEventHandler.ts`           |
| Текущий способ записи | OTel span + Perfetto span            | `HookCallEvent` → `QwenLogger` (без OTel)                                       |
| parent             | `toolContext ?? interactionContext`  | —                                                                               |

**Схема повторного использования:**

1. В `session-tracing.ts` добавить `startHookSpan` / `endHookSpan` (parent = `toolContext ?? interactionContext`, как в claude-code)
2. В `coreToolScheduler.ts` в `executeSingleToolCall` обернуть вызовы pre/post hook в start/end hook span
3. Сохранить существующую запись `logHookCall` (два параллельных механизма, не взаимоисключающих)

Изменения минимальны, не затрагивают логику hook.

##### 4. tool.execution — helper уже есть, осталось подключить

В qwen-code уже полностью реализованы `startToolExecutionSpan(parentToolSpan)` и `endToolExecutionSpan(span, metadata)`. Нужно только вызвать их в `executeSingleToolCall`:

```typescript
// внутри coreToolScheduler.ts executeSingleToolCall
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

Обратите внимание: в qwen-code `startToolExecutionSpan` принимает явный параметр `parentToolSpan`, а в claude-code он неявно получается из ALS `toolContext`. На функциональность это не влияет, разница только в стиле. Если ввести `toolContext` ALS, можно перейти на неявное получение.

##### 5. Subagent trace tree — у обеих сторон неполное, не стоит копировать напрямую

| Измерение             | claude-code                                                              | qwen-code                                                     |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Распространение OTel trace | **Нет** — interaction subagent — новый root                             | **Нет** — у subagent нет явного распространения trace         |
| Связывание            | Perfetto metadata (agent process/thread) + ALS `teammateContextStorage`   | ALS `subagentNameContext` + `SubagentExecutionEvent`           |
| Изоляция конкурентности | В OTel ALS возможна утечка (`enterWith` на уровне процесса, конкурентные subagent перезаписывают друг друга) | Те же риски |

В claude-code с OTel tracing для subagent **тоже не решено**:

- `interactionContext.enterWith()` действует на уровне процесса — конкурентные subagent перезаписывают ALS друг друга
- Реальная иерархия агентов существует только в Perfetto (внутренняя система Anthropic за feature-flag), не в OTel

**Рекомендация:**

- Краткосрочно: оставить существующую схему qwen-code (`subagentNameContext` + логи событий)
- Среднесрочно: при запуске subagent создавать span `subagent` (parent = текущий toolContext), а для изоляции конкурентных subagent использовать `context.with()` вместо `enterWith()`
- Это отдельная задача проектирования, не стоит копировать claude-code

##### 6. LLM request span — путь понятен

В qwen-code сейчас в `loggingContentGenerator.ts` используются `withSpan('api.generateContent', ...)` и `startSpanWithContext('api.generateContentStream', ...)`.

Нужно перейти на вызовы `startLLMRequestSpan` / `endLLMRequestSpan` (уже реализованы в слое session-tracing). Для streaming есть особенности:

- `startLLMRequestSpan` возвращает объект `Span`
- `endLLMRequestSpan(span, metadata)` нужно вызывать вручную
- Это совместимо с ручным управлением `startSpanWithContext`

### Итоги повторного использования

| Что перерабатывается                                                                 | Степень повторного использования                      | Объём изменений                               | Приоритет |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------- | --------- |
| Унификация пути создания span (отказ от runtime `withSpan`, переход на helpers session-tracing) | **Ключевое исправление** — устраняет разрыв parent-child | Средний (~5 точек вызова)                     | P0        |
| Добавление ALS `toolContext`                                                         | Прямое копирование подхода claude-code                 | Низкий (внутри session-tracing.ts)            | P0        |
| Span tool.blocked_on_user                                                            | Вариант А требует адаптации под конечный автомат        | Средний (координация `_schedule` + `executeSingleToolCall`) | P1        |
| Подключение tool.execution                                                           | Helper уже есть, осталось вызвать                     | Низкий (3 строки в `executeSingleToolCall`)    | P1        |
| Hook span                                                                           | Добавить helper + точки вызова                         | Низкий                                         | P1        |
| Переход LLM request span                                                             | Заменить withSpan на типизированный helper            | Низкий (2 точки вызова)                       | P1        |
| Subagent trace tree                                                                 | **Не рекомендуется копировать напрямую** — нужна отдельная разработка | Высокий                                        | P2        |
```
###  Рекомендуемая последовательность внедрения

```
Phase 1 — Исправление структуры дерева trace (P0)
├── 1a. session-tracing.ts: новый toolContext ALS + blocked_on_user / hook span helpers
├── 1b. loggingContentGenerator.ts: withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts: withSpan → startToolSpan/endToolSpan

Phase 2 — Завершение workflow span (P1)
├── 2a. coreToolScheduler._schedule: интеграция blocked_on_user span
├── 2b. coreToolScheduler.executeSingleToolCall: интеграция tool.execution span
└── 2c. места вызова hook pre/post: интеграция hook span

Phase 3 — Дерево trace для subagent (P2)
├── 3a. Разработать схему изоляции context.with() (вместо enterWith)
├── 3b. При запуске subagent создать корневой span subagent
└── 3c. Проверка сценария с параллельными subagent
```
