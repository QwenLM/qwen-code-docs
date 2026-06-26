# Проектирование дерева трасс суб-агентов (P3, фаза 3)

> Задача #3731 — Фаза 3 иерархического трассирования сессий. Добавляет span `qwen-code.subagent`, чтобы вызовы суб-агентов получали изолированную, запрашиваемую структуру трасс вместо бесшумного перемешивания под родительским span `qwen-code.interaction`.
>
> Основывается на Фазе 1 (#4126), Фазе 1.5 (#4302) и Фазе 2 (#4321).

## Проблема

Сегодня каждый вызов `AgentTool.execute` выполняется под родительским span `qwen-code.interaction`. Три патологии:

1. **Параллельные суб-агенты перемешиваются.** `coreToolScheduler.ts:728` помечает `AGENT` как безопасный для конкурентности — `Promise.all` запускает до 10 суб-агентов параллельно. Их LLM-запросы / инструменты / хуки — все прикрепляются к одному общему родительскому span взаимодействия, поэтому инструменты исследования трасс не могут отличить «этот LLM-запрос принадлежит суб-агенту A» от «этот — суб-агенту B».
2. **Нет span для самой границы суб-агента.** Существует LogRecord `qwen-code.subagent_execution` (генерируется в `agent-headless.ts:268,329`), связанный с span того же имени через `LogToSpanProcessor`, но это автономный маркер, а не родитель, под которым вложены LLM / инструменты / хуки суб-агента.
3. **Fork / фоновые суб-агенты висят в воздухе.** Пути «забыл и забыл» (`runInForkContext` / background) переживают родительский `AgentTool.execute` и генерируют spans через несколько последующих пользовательских обращений. Родительский span инструмента уже завершен к моменту появления этих spans, поэтому `context.active()` из OTel не помогает — они прикрепляются к тому взаимодействию, которое было активным в момент запуска, или ни к какому.

## Существующая поверхность (без изменений)

| Компонент                              | Расположение                                                                                                                                                                                   | Почему не трогаем                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Точка порождения (унифицированная)     | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                            | Единая точка входа; идеальный хук для 3 вариантов вызова   |
| Три варианта вызова                   | именованный foreground (`runFramed` в `:2154` — ожидаемый), fork (`void runInForkContext(runFramedFork)` в `:1991` — забыл и забыл), background (`void framedBgBody()` в `:1934` — забыл и забыл) | Жизненный цикл различается — дизайн span покрывает все три |
| Конкурентность                         | `coreToolScheduler.runConcurrently` (`Promise.all`, лимит 10) — управляется `partitionToolCalls`, помечающим AGENT как `concurrent: true`                                                       | То, что делает изоляцию необходимой                       |
| ALS `runInForkContext`                 | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                     | Только защита от рекурсивных fork — НЕ передает контекст OTel |
| ALS идентификации агента               | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                     | Уже несет `agentId`; мы расширяем его `depth`              |
| LogRecord `SubagentExecutionEvent`    | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 потребителя (мост span LogToSpanProcessor + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                              | LogRecord остается; потребители от него зависят            |

## Вне рамок (отложено)

- **Агрегация использования токенов на суб-агента** (`gen_ai.usage.*` суммированные по всем LLM span внутри суб-агента). Относится к Фазе 4 (декомпозиция LLM-запросов).
- **Миграция LogRecord `qwen-code.subagent_execution` на новый span в виде событий span.** RUM и метрики тесно связаны с LogRecord; отложено до последующего обсуждения, которое сможет согласовать всех 3 потребителей вместе.
- **Автоматическая свертка затрат.** Та же причина — сначала нужны токены.
- **Удаление маркера `concurrent: true` у инструмента AGENT.** Конкурентность правильная; мы ее инструментируем, а не ограничиваем.

## Ссылки (обоснование решений)

| Источник                                                                                                              | Ключевой вывод                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Спецификация OTel Trace — Ссылки между spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans) | Дословно: «Новая связанная трасса также может представлять долго выполняющуюся асинхронную операцию обработки данных, инициированную одним из множества быстрых входящих запросов.» → fork/background должны быть связанными корнями, а не дочерними.                                                                      |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (статус: Разработка) | Имя span `invoke_agent {gen_ai.agent.name}`; обязательные атрибуты `gen_ai.operation.name`, `gen_ai.provider.name`; рекомендуемые: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                        |
| LangSmith — лимит 25 000 запусков / трасса                                                                             | Длительные сессии агентов неизбежно требуют разделения трасс; склоняет к гибридному дизайну traceId.                                                                                                                                                                                                                       |
| [Sentry — распределенная трассировка](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)         | «Дочерние транзакции могут переживать транзакции, содержащие их родительские spans» — поддерживается дочерний элемент с более длительным сроком жизни.                                                                                                    |
| claude-code (Anthropic)                                                                                               | Имеет иерархию суб-агентов только в локальном файле Perfetto JSON; экспорт OTel плоский. Переносимого кода нет.                                                                                                                                                                                                             |
| opencode (sst/opencode)                                                                                               | Использует автоинструментирование `@effect/opentelemetry`; явный `context.with(trace.setSpan(active, span), fn)` для `withRunSpan`. **Подтверждает паттерн изоляции context.with.** Их предупреждение о ручной регистрации `AsyncLocalStorageContextManager` не применимо — `NodeSDK` qwen-code регистрирует его автоматически. |
## Дизайн — шесть решений, каждое обосновано

### D1 — Продолжительность жизненного цикла: вызывающий открывает, вызываемый выполняется внутри `context.with(span, fn)`

`agent.ts` (вызывающий) создает span. Тело — будь то ожидаемое (`runFramed`) или запущенное и забытое (`runInForkContext` / background) — выполняется внутри `runInSubagentSpanContext(span, fn)`, которая вызывает `otelContext.with(trace.setSpan(active, span), fn)`.

**Где именно в `AgentTool.execute` открывается span?** Открывайте его **непосредственно ПЕРЕД подготовкой, специфичной для типа вызова** (`createAgentHeadless` / `createForkSubagent` и т.д.) — чтобы время подготовки (сборка конфигурации, пересборка ToolRegistry, подключение ContextOverride) ВКЛЮЧАЛОСЬ в длительность `qwen-code.subagent`. Операторы, отслеживающие "почему этот сабагент медленный?", увидят полную картину. Подготовка обычно << время LLM, так что это не создает шума.

Альтернатива, которая рассматривалась: открывать после подготовки, исключая время подготовки. Отклонена, потому что подготовка сабагента — это тоже работа, относящаяся к сабагенту; скрытие её делает математику общей длительности неверной при суммировании всех span-ов сабагентов.

**Почему не только вызываемый**: к моменту, когда тело fork / background действительно запускается, вызывающий уже вернул управление. `otelContext.active()` тогда возвращает тот контекст, который несет асинхронная среда выполнения — что для `void` fire-and-forget после завершения родителя ненадежно. Родительский span уже закрыт; перепривязка после факта некорректна.

**Почему не только вызывающий**: в foreground это работает нормально, но span-ы fork / background должны продолжать испускать дочерние span-ы (LLM / tool / hook) после того, как `AgentTool.execute` вернулся. Этим дочерним span-ам нужно, чтобы `context.active()` возвращал span сабагента — что происходит только если тело явно выполняется внутри `context.with(subagentSpan, body)`.

Оба конца необходимы. **Дизайн — это мост** — вызывающий создает span + стратегию traceId в зависимости от типа вызова, затем передает управление через `runInSubagentSpanContext`.

### D2 — Гибридный traceId: foreground = дочерний span, fork/background = новый traceId + Link

| Тип вызова     | Родитель                       | TraceId                 | Зачем                                                                                                                                                                          |
| -------------- | ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `foreground`   | дочерний span tool вызывающего | наследует traceId родителя | По умолчанию в OTel; вызывающий полностью заключает вызываемого во времени                                                                                                        |
| `fork`         | корневой span со связью       | новый traceId             | Вызывающий возвращает управление немедленно; fork выполняется в течение нескольких последующих взаимодействий. OTel spec явно рекомендует Link для этого. Избегает раздувания длительности / размера родительского trace. |
| `background`   | корневой span со связью       | новый traceId             | Та же причина, что и для fork.                                                                                                                                                  |

**Полезная нагрузка Link**:

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
  } /* явный контекст = корневой, не наследует активный */,
);
```

Возможность запросов между trace через идентификатор сессии: `gen_ai.conversation.id` устанавливается на каждом span-е сабагента (как foreground, так и связанном корневом), так что запрос ARMS по `session.id` возвращает как trace родительского взаимодействия, так и trace связанных корневых сабагентов. Сам Link отображается в UI родительского trace как "Порожден: сабагент X (другой trace)", что обеспечивает навигацию.

**Почему не всегда дочерний**: 4-часовой background сабагент раздувает длительность родительского trace по стенным часам до 4 часов; размер trace превышает лимиты некоторых бэкендов (ограничение LangSmith в 25,000 запусков — самый явный задокументированный предел). Foreground сабагенты, которых пользователь действительно ждет, не имеют этой проблемы, поскольку они ограничены во времени.

**Почему не всегда связанный корневой**: foreground ломает естественное дерево trace. Запрос пользователя, который запускает синхронный Explore сабагент, ДОЛЖЕН показывать одно дерево, а не два связанных trace.

### D3 — TTL: с учетом типа, subagent fork/background = 4h, остальные = 30min

`session-tracing.ts:124` определяет `SPAN_TTL_MS = 30 * 60 * 1000`. Обход в `:144-152` уже особым образом обрабатывает `tool.blocked_on_user`, устанавливая `decision: 'aborted' + source: 'system'`. Он уже концептуально учитывает типы.

**Изменение**: ввести TTL по типам:

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
При истечении TTL спаны саб-агентов получают отметку:

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**Почему не ровно 30 минут**: легитимные долгие саб-агенты (анализ большого репозитория, медленные сборки, глубокие исследовательские задачи) ошибочно помечаются как TTL-просроченные. 4 часа покрывают 99-й перцентиль, не будучи настолько большими, чтобы реальные зависания остались незамеченными.

**Почему не без TTL**: сбой процесса / OOM / kill -9 → спаны остаются в `activeSpans` Map навсегда. 30-минутная страховка защищает от этого; ответвление / фоновый саб-агент просто требует более широкого окна, а не удаления TTL.

**Откуда взялись 4 часа**: прагматичная верхняя граница для нетривиальных задач агента (глубокое исследование / анализ большой кодовой базы). Настраивается через константу, если эксплуатационные данные покажут, что мы ошиблись.

### D4 — Сохранение LogRecord: оставляем эмиссию, пропускаем мост LogToSpanProcessor

LogRecord `SubagentExecutionEvent` имеет 3 downstream потребителя (подтверждено аудитом репозитория):

| Потребитель                                                                       | Позиция                                           | Действие                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → мостовой спан `qwen-code.subagent_execution` | `loggers.ts:773` → `log-to-span-processor.ts:346` | **Пропустить этот мост** для события саб-агента — новый спан `qwen-code.subagent` заменяет его |
| Приём RUM через QwenLogger (внутренняя статистика Aliyun)                         | `qwen-logger.ts:573-574`                          | Оставить — RUM не видит OTel-спаны, только LogRecords                                   |
| Счётчик `recordSubagentExecutionMetrics`                                          | `metrics.ts:829`                                  | Оставить — потребитель метрик не зависит от моста трассировки                           |

**Пропуск моста** (единственное изменение в LogToSpanProcessor):

```ts
// log-to-span-processor.ts — внутри onEmit, после deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // покрывается нативным спаном qwen-code.subagent
]);
if (skipBridge.has(eventName)) return;
```

**Влияние на потребителей трассировки**: дашборды, фильтрующие по имени спана `qwen-code.subagent_execution`, начнут возвращать ноль результатов. Их следует обновить на `qwen-code.subagent`. Упомянуть это в release notes.

**Почему не удалить LogRecord**: он является входом для RUM и метрик. Удаление потребует рефакторинга трёх систем; выходит за рамки данной задачи.

**Почему не оставить оба**: в трассировке будет два спана на одного саб-агента (`qwen-code.subagent` + `qwen-code.subagent_execution`) с перекрывающейся информацией — запутывает операторов при чтении трассировок, дублирует объём спанов.

### D5 — Имя спана + атрибуты: гибридное соответствие спецификации, с вендорным префиксом для расширений

**Имя спана**: `qwen-code.subagent` (соответствует соглашению кодовой базы Фаз 1/2: `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …).

Спецификация OTel GenAI предписывает каноническое имя спана `invoke_agent {gen_ai.agent.name}` — но **также** говорит, что "отдельные системы/фреймворки GenAI МОГУТ задавать другие форматы имени спана". Мы используем своё имя и устанавливаем `gen_ai.operation.name='invoke_agent'`, чтобы инструменты, знающие спецификацию, всё равно идентифицировали спан. Операторы, читающие наше дерево трассировки, видят единообразное именование `qwen-code.*`.

**Вид спана**: `INTERNAL` (внутрипроцессный вызов саб-агента, по спецификации).

**Набор атрибутов**:

| Категория                                                         | Атрибут                                          | Источник                                                              | Примечания                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Обязательный по спецификации**                                  | `gen_ai.operation.name='invoke_agent'`           | литерал                                                               | требуется по спецификации                                                                                                                                                                       |
| **Обязательный по спецификации**                                  | `gen_ai.provider.name='qwen-code'`               | литерал                                                               | требуется по спецификации; неоднозначно для внутрипроцессных агентов (спецификация писалась для LLM-провайдера). Установка `'qwen-code'` — наиболее честная интерпретация                       |
| **Обязательный (двойная эмиссия)**                                | `gen_ai.agent.id` + `qwen-code.subagent.id`      | `agentContext.agentId`                                                | двойная эмиссия, пока спецификация не достигнет стабильности; позже удалить вендорный ключ                                                                                                      |
| **Обязательный (двойная эмиссия)**                                | `gen_ai.agent.name` + `qwen-code.subagent.name`  | `agentConfig.subagentType` (например, `Explore`, `code-reviewer`, `fork`) | та же двойная эмиссия                                                                                                                                                                           |
| **Рекомендуемый по спецификации**                                 | `gen_ai.conversation.id`                         | `config.getSessionId()`                                                | позволяет выполнять кросс-трассировочные запросы по сессии; сосуществует с существующим атрибутом спана `session.id` (устанавливается глобально, см. #4367) — оба указывают на один UUID, один будет удалён при стабилизации спецификации |
| **Рекомендуемый по спецификации**                                 | `gen_ai.request.model`                           | переопределение модели, если есть                                      | только когда саб-агент переопределяет модель родителя                                                                                                                                            |
| **Вендорный**                                                     | `qwen-code.subagent.invocation_kind`             | `'foreground'` ❘ `'fork'` ❘ `'background'`                            | определяет TTL + стратегию traceId                                                                                                                                                              |
| **Вендорный**                                                     | `qwen-code.subagent.is_built_in`                 | bool                                                                   | фильтр для дашбордов                                                                                                                                                                            |
| **Вендорный**                                                     | `qwen-code.subagent.parent_agent_id`             | `agentId` родительского ALS                                            | для вложенных саб-агентов + кросс-трассировочной линии                                                                                                                                          |
| **Вендорный**                                                     | `qwen-code.subagent.depth`                       | глубина родителя + 1 (верхний = 0)                                    | детектор ошибок рекурсии                                                                                                                                                                        |
| **Вендорный**                                                     | `qwen-code.subagent.invoking_request_id`         | из `agentContext`                                                      | корреляция на уровне запроса                                                                                                                                                                    |
| **По спецификации (в конце спана)**                                | `error.type` (при сбое)                          | класс ошибки                                                          | стандарт OTel                                                                                                                                                                                  |
| **По спецификации (в конце спана)**                                | `exception.message` (при сбое)                   | `truncateSpanError(error.message)`                                    | стандарт OTel; использует усечение из Фазы 2                                                                                                                                                   |
| **Вендорный (в конце спана)**                                     | `qwen-code.subagent.status`                      | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`              | детальнее, чем OTel SpanStatus (OK / ERROR / UNSET)                                                                                                                                             |
| **Вендорный (в конце спана)**                                     | `qwen-code.subagent.terminate_reason`            | из `SubagentExecutionEvent.terminate_reason`                          | например, `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                          |
| **Вендорный (в конце спана)**                                     | `qwen-code.subagent.result_summary_present`      | bool                                                                  | «выдал ли саб-агент результат» — ограниченного размера                                                                                                                                          |
| **Опциональный (чувствительный)** — за воротами `includeSensitiveSpanAttributes` | `gen_ai.input.messages`                          | структурированная история чата                                        | использует ворота из #4097                                                                                                                                                                     |
| **Опциональный (чувствительный)**                                 | `gen_ai.output.messages`                         | ответы модели                                                         | те же ворота                                                                                                                                                                                    |
| **Опциональный (чувствительный)**                                 | `gen_ai.system_instructions`                     | системный промпт                                                      | те же ворота                                                                                                                                                                                    |
| **Опциональный (чувствительный)**                                 | `gen_ai.tool.definitions`                        | схемы инструментов                                                    | те же ворота                                                                                                                                                                                    |
**Сопоставление SpanStatus**:

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` или `'aborted'` → `SpanStatus { code: UNSET }` (соответствует соглашению Фазы 2)

**Почему двойная эмиссия по `id` + `name`**: спецификация находится в стадии Development (на один шаг раньше, чем Experimental). Существует `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` для опционального включения. Имена атрибутов спецификации могут быть переименованы до перехода в Stable. Двойная эмиссия — это тот же паттерн, который Фаза 2 использовала для `call_id` → `tool.call_id`; удалите ключ вендора, когда спецификация достигнет Stable.

**Почему `qwen-code.subagent.*` (не `qwen.subagent.*`)**: каждый существующий ключ с префиксом вендора в `constants.ts` использует `qwen-code.*` (`qwen-code.user_prompt`, `qwen-code.tool_call` и т.д.). Внутренняя согласованность важнее, чем предпочтения OTel по соглашению об именовании, так как операторы запрашивают ARMS по префиксу.

**Кардинальность**: атрибуты span — это не метки метрик в OTel; атрибуты с UUID-ключами (`id`, `parent_agent_id`, `invoking_request_id`) безопасны на уровне span. Не продвигайте их до метрик позже.

**~10-15 атрибутов на span** (в зависимости от типа вызова, ошибки, вложенности). Тот же порядок, что и `qwen-code.tool`.

### D6 — Поле `AgentContext.depth` добавлено напрямую

`AgentContext` (`agent-context.ts:32`) **не экспортируется** — экспортируются только хелперы (`getCurrentAgentId`, `runWithAgentContext`, `getRuntimeContentGenerator`, `runWithRuntimeContentGenerator`). Никаких нарушений на уровне TypeScript. 6 известных читателей через `getCurrentAgentId()` читают только `agentId`; добавление `depth?: number` для них незаметно.

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // НОВОЕ — по умолчанию 0 в читателях
}
```

`runWithAgentContext` уже использует разворот `{ ...current, agentId }`, поэтому `depth` сохраняется без изменений в существующих местах вызова. **Обновите `runWithAgentContext` для автоматического увеличения depth внутри** — ни одному вызывающему не нужно знать о depth:

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // автоинкремент
  };
  return agentContextStorage.run(next, fn);
}
```

Суб-агент верхнего уровня: нет родительского ALS → `depth: 0`. Вложенный: parent depth+1.

Новый маленький аксессор `getCurrentAgentDepth(): number` возвращает `agentContextStorage.getStore()?.depth ?? 0` — используется `startSubagentSpan` для заполнения `qwen-code.subagent.depth`.

**Почему не отдельный ALS только для телеметрии**: это дублировало бы ту же форму контекста, которую мы уже поддерживаем. Плохо. Используйте существующий.

## API хелпера (`session-tracing.ts`)

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
  invokerSpanContext?: SpanContext; // обязательно для fork / background (источник Link)
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

`runInSubagentSpanContext` — это примитив изоляции:

```ts
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = trace.setSpan(otelContext.active(), span);
  return otelContext.with(ctx, fn);
}
```

`startSubagentSpan` внутренне ветвится по `invocationKind`:

```ts
function startSubagentSpan(opts: StartSubagentSpanOptions): Span {
  const attributes = buildSpanAttributes(opts);
  const tracer = getTracer();

  if (opts.invocationKind === 'foreground') {
    // Дочерний от текущего активного span (span инструмента вызывающего)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: связанный корневой span
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
    root: true, // принудительно новый traceId; игнорирует активный контекст как родительский
  });
}
```

## Подключение жизненного цикла

### Foreground named (основной путь)

```ts
// agent.ts:~2154
// Извлекаем родительский ALS frame для установки parentAgentId на span. Глубина нового дочернего
// вычисляется внутри runWithAgentContext автоматически (D6) — мы
// читаем её через getCurrentAgentDepth(), когда уже НАХОДИМСЯ внутри дочернего ALS
// frame. Два шага:
const parentAgentId = getCurrentAgentId();  // ДО входа в дочерний frame

// ... существующий вызов runFramed заходит в runWithAgentContext(hookOpts.agentId, ...) ...

// ВНУТРИ runFramed мы можем прочитать глубину дочернего:
//   const depth = getCurrentAgentDepth();
//
// Практическое расположение: передать `depth` как переменную замыкания, установленную после
// того, как runWithAgentContext вступит в силу — ИЛИ вычислить её как
// `(getCurrentAgentDepth() снаружи) + 1` со стороны вызывающего (проще).
const depth = getCurrentAgentDepth();  // вне frame; дочерний будет this + 1
// (установить qwen-code.subagent.depth = depth в аргументах startSubagentSpan)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext опущен — foreground наследует естественно через context.with
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
### Fork (запустил и забыл)

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
// AgentTool.execute возвращает FORK_PLACEHOLDER_RESULT немедленно;
// span живёт на протяжении последующих взаимодействий родительской сессии.
```

### Фоновый режим

То же, что и fork, но с `invocationKind: 'background'` и `bgEventEmitter` вместо `eventEmitter`. TTL составляет 4ч (как и у fork — правило типа из D3).

## Параллельная изоляция — главное преимущество

Три параллельных вызова саб-агента из одного запроса пользователя (модель испускает 3 блока AGENT tool_use → `coreToolScheduler.runConcurrently` выполняет 3 вызова `executeSingleToolCall` параллельно; каждый открывает свой собственный span `qwen-code.tool` на Фазе 2):

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [вызов агента #A]
│  └─ qwen-code.subagent (A, foreground)     [traceId=T0, дочерний]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [вызов агента #B]
│  └─ qwen-code.subagent (B, foreground)     [traceId=T0, дочерний]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [вызов агента #C]
   └─ qwen-code.subagent (C, fork)           [traceId=T1, связанный корневой]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, может испустить через часы]
```

`context.with(span, runX)` для каждого из A, B, C выполняется конкурентно. `AsyncLocalStorageContextManager` (уже автоматически зарегистрирован NodeSDK в `sdk.ts:273`) изолирует по волокнам; пересечения нет. Дочерние span-ы LLM / инструментов / хуков каждого саб-агента видят `span` через `context.active()` внутри своей собственной асинхронной цепочки.

Fork (C) — это отдельный trace: его дочерние span-ы наследуют `traceId=T1`, даже когда испускаются при нескольких последующих взаимодействиях родительской сессии. Запрос ARMS по `session.id` возвращает как T0, так и T1; Link от корня T1 → вызывающего span-а `qwen-code.tool` C обеспечивает явную навигацию.

## Файлы для изменения

| Файл                                                                               | Изменение                                                                                                                                                                                  | Оценка LOC |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `packages/core/src/telemetry/constants.ts`                                         | Добавить `SPAN_SUBAGENT`, `SPAN_TTL_MS_LONG`, константы ключей атрибутов                                                                                                                   | +8         |
| `packages/core/src/telemetry/session-tracing.ts`                                   | Добавить `startSubagentSpan` (с ветвлением foreground/linked-root), `endSubagentSpan`, `runInSubagentSpanContext`, типы; расширить объединение `SpanType` значением `'subagent'`; расширить очистку TTL с помощью `ttlFor(ctx)` | +120       |
| `packages/core/src/telemetry/log-to-span-processor.ts`                             | Список пропуска для обхода моста `qwen-code.subagent_execution`                                                                                                                            | +6         |
| `packages/core/src/telemetry/index.ts`                                             | Реэкспортировать новые хелперы + типы                                                                                                                                                      | +6         |
| `packages/core/src/agents/runtime/agent-context.ts`                                | Добавить `depth?: number` в `AgentContext` + аксессор `getCurrentAgentDepth()`                                                                                                             | +12        |
| `packages/core/src/tools/agent/agent.ts`                                           | Обернуть 3 пути выполнения (foreground/fork/background) в `runInSubagentSpanContext` с try/catch/finally                                                                                   | +60        |
| `packages/core/src/telemetry/session-tracing.test.ts`                              | Новый `describe('subagent spans')`: start/end, дочерний vs связанный корневой, распространение контекста, глубина, TTL по типу, идемпотентный end, NOOP при неинициализированном SDK         | +120       |
| `packages/core/src/telemetry/log-to-span-processor.test.ts`                        | Проверить, что список пропуска закорачивает мост subagent_execution                                                                                                                        | +20        |
| `packages/core/src/tools/agent/agent.test.ts`                                      | Сквозной тест: 3 конкурентных саб-агента получают изолированное поддерево; fork-овые span-ы наследуют новый traceId через Link; жизненный цикл background                                    | +80        |
Всего: 9 файлов, ~430 строк кода. Больше, чем типичные коммиты второго этапа, но оправдано — изменение TTL затрагивает отдельный файл, пропуск LogToSpanProcessor — отдельный файл, а тестовые файлы удваивают количество. Разбиение привело бы к неполной поверхности телеметрии.

Если при ревью возникнут замечания по размеру: разбить на 2 PR — (A) вспомогательные функции телеметрии + тесты, (B) интеграция в `agent.ts` + e2e-тесты. Вспомогательные функции, попавшие раньше, не меняют поведение во время выполнения.

## Стратегия тестирования

| Тест                                                                         | Что доказывает                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `startSubagentSpan foreground parents to active OTel span`                   | Путь дочернего span                                             |
| `startSubagentSpan fork creates new traceId + Link to invoker`               | Путь связанного корня                                            |
| `runInSubagentSpanContext propagates span through awaits / Promise.all`      | Примитив изоляции                                                |
| `3 concurrent subagent spans don't share children`                           | Ключевая гарантия конкурентности                                |
| `nested subagent records depth + parentAgentId`                              | Метаданные вложенности                                          |
| `endSubagentSpan status mapping (completed / failed / cancelled / aborted)`  | Таксономия статусов                                             |
| `endSubagentSpan dual-emits gen_ai.agent.id + qwen-code.subagent.id`         | Двойная эмиссия по спецификации                                 |
| `fork lifecycle: span survives AgentTool.execute return`                     | Корректность fire-and-forget                                    |
| `TTL: subagent fork stays past 30min, gets stamped + ended at 4h`            | TTL с учётом типа                                               |
| `TTL: foreground subagent at 30min gets default sweep`                       | TTL не выходит за границы                                       |
| `LogToSpanProcessor skips qwen-code.subagent_execution but still RUM-emits`  | Пропуск Bridge работает                                         |
| `runConcurrently of 3 agent tool calls produces 3 distinct subagent spans`   | Сквозная интеграция на уровне планировщика                      |
| `failed subagent sets exception.message + error.type + SpanStatus=ERROR`     | Путь ошибки по стандарту OTel                                   |
| `opt-in attrs gated on includeSensitiveSpanAttributes`                       | Правильное использование гейта из #4097                         |
| `startSubagentSpan returns NOOP_SPAN when SDK is uninitialized`              | Соответствует дисциплине NOOP из Фаз 1/2; последующие вызовы остаются безопасными |
| `fork span Link.context matches invoker tool span's spanContext`             | Сквозная навигация между трассировками работает корректно       |
| `runWithAgentContext auto-increments depth: parent=0, child=1, grandchild=2` | Учёт глубины корректен без участия вызывающего кода             |

## Граничные случаи

| Случай                                                                                                                    | Обработка                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subagent внутри tool внутри subagent (глубина > 1)                                                                        | Атрибут `depth` отслеживается; рекомендуется мягкое `debugLogger.warn` при глубине ≥ 5 (детектор бесконечной рекурсии)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Subagent, созданный во время `awaiting_approval` родительского tool                                                     | span subagent является дочерним span AGENT tool; `tool.blocked_on_user` AGENT tool — sibling, а не родитель — оба дочерние span AGENT tool. Дерево остаётся корректным                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `signal.aborted` в середине subagent                                                                                           | Колбэк `runInSubagentSpanContext` выбрасывает исключение или завершается; `finally` устанавливает `status='aborted'`, SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Fork всё ещё жив, когда завершается родительская сессия                                                                               | Срабатывает TTL в 4 часа; sentinel-атрибуты `qwen-code.span.ttl_expired:true`, `qwen-code.subagent.terminate_reason='ttl_swept'`, `status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `endSubagentSpan` вызван дважды                                                                                          | Идемпотентно — проверяет карту `activeSpans`; второй вызов ничего не делает (соответствует паттерну Фазы 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| LLM-вызов subagent использует модель, отличную от родительской                                                                  | `gen_ai.request.model` устанавливается на span subagent; под-span LLM-запроса ТАКЖЕ записывает модель — конфликтов нет                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Исключение в прелюдии сестринского subagent ускользает из `attemptExecutionOfScheduledCalls`                                                | Попадает в недавно исправленный catch `handleConfirmationResponse` из Фазы 2, который находится ВНЕ try — не приписывается span подтверждённого tool. span subagent корректно закрывается через собственный try/finally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Одновременные fork и foreground от одного родителя                                                                            | Foreground наследует T0 traceId, fork получает T1. Контекст распространяется независимо для обоих. span родительского tool завершается, когда синхронная работа возвращает управление; span fork (отдельная трассировка) продолжает жить                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| span fork начинается в синхронном потоке вызывающего, но тело выполняется позже                                                       | `startSubagentSpan` вызывается ДО `void runInForkContext(...)`, поэтому span (и его Link к вызывающему) захватывается, пока spanContext вызывающего ещё читаем. Длительность span включает любую задержку планирования в очереди микрозадач до фактического запуска тела — обычно <1 мс; если в продуктиве появятся значимые зазоры, можно добавить отдельный атрибут `qwen-code.subagent.scheduling_delay_ms` (открытый вопрос)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SDK не инициализирован (телеметрия отключена)                                                                                | `startSubagentSpan` рано возвращает NOOP_SPAN (соответствует всем остальным помощникам Фазы 1/2). `runInSubagentSpanContext(NOOP_SPAN, fn)` всё равно вызывает `fn` нормально. `endSubagentSpan(NOOP_SPAN, …)` ничего не делает                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Log-bridge-span'ы fork (`tool_call`, `api_request` и т.д.) используют traceId, производный от сессии, в то время как нативные span'ы fork используют T1 | Существующее поведение — log-bridge-span'ы всегда используют `deriveTraceId(sessionId)`, нативные span'ы используют контекст OTel. Это расхождение невидимо внутри одной трассировки, но означает, что поиск по traceId T1 в ARMS не будет включать дочерние log-bridge-span'ы fork. Выходит за рамки этого PR; отмечено как открытый вопрос #5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Родительские span'ы хука `SubagentStart` для foreground и background различаются                                                       | Foreground запускает `fireSubagentStartEvent` внутри `runSubagentWithHooks` → уже внутри `runInSubagentSpanContext`, поэтому span хука является дочерним для `qwen-code.subagent`. Background запускает его ДО обёртки `runWithSubagentSpan` (так что span subagent ещё не существует), поэтому span хука является дочерним для AGENT `qwen-code.tool`. Операторам, которые запрашивают "span'ы хуков под span'ами subagent", следует ожидать, что фоновый `SubagentStart` будет отсутствовать в таком представлении. Перенести запуск фонового хука внутрь `framedBgBody` механически просто (изменение `contextState` всё равно достигает `bgSubagent.execute`), но это меняет видимую пользователем семантику: сегодня хук запускается синхронно до того, как `AgentTool.execute` возвращает сообщение "Фоновый агент запущен", поэтому любая синхронная настройка, выполняемая хуком, происходит в блокирующем пользователя такте; перенос запуска заставит хук выполняться отсоединённо после возврата сообщения о запуске. Отложено до обдуманного решения о предпочтительной семантике
## Откат

Изменение является аддитивным на уровне OTel — существующие дашборды, не фильтрующие по именам спанов, связанным с субагентом, продолжают работать. Потребители трейсов, группирующие по родительскому spans, увидят новые узлы `qwen-code.subagent` между `qwen-code.tool` и `qwen-code.llm_request`; задокументировать в примечаниях к релизу.

Изменение, влияющее на поведение, — пропуск LogToSpanProcessor. Дашборды, ранее потреблявшие span `qwen-code.subagent_execution`, теперь возвращают ноль. Смягчение: сохранить LogRecord нетронутым (RUM + метрики всё ещё его видят); удаляется только мост для спанов. Существующие запросы на основе логов не затрагиваются.

Путь отката: откатить единственный PR. Новые хелперы для спанов вызываются только из `agent.ts`; удаление связки + пропуска LogToSpanProcessor восстанавливает предыдущее поведение 1:1.

## Влияние на сэмплирование

| Вызов                                             | Источник решения о сэмплировании                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `foreground` (дочерний span, тот же traceId)      | Наследует решение parent-трейса (сэмплирован или нет) через parent-based sampler |
| `fork` / `background` (связанный root, новый traceId) | Независимое решение о сэмплировании при создании root |

При текущих настройках по умолчанию qwen-code (согласно `tracer.ts:shouldForceSampled()` — parentbased + always_on иначе always_on) каждый span сэмплируется, поэтому расхождение не проявляется. Для развёртываний, использующих вероятностные сэмплеры (например, `traceidratio=0.1`), это означает:

- Пользовательский запрос может быть сэмплирован (T0 полностью захвачен), но его fork (T1) может быть отброшен, или наоборот.
- Оператор, читающий родительский T0, видит «Ссылка: субагент C (T1)» — переход может привести к 404, если T1 не был сэмплирован.

Смягчение: задокументировать для операторов. Если полный захват субагента важен, принудительно сэмплировать fork/background с помощью будущей ручки конфигурации. Выходит за рамки данной задачи.

## Чувствительные атрибуты (интеграция #4097)

Повторно использовать существующий шлюз `includeSensitiveSpanAttributes`. Если true, устанавливать на span субагента в точках жизненного цикла, где данные доступны:

| Атрибут спеки                  | Источник                                                    | Когда устанавливается                                                                           |
| ------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions`   | сформированный системный промпт из `agentConfig` / родительского контекста | `startSubagentSpan` (если доступно до открытия span) или через `setAttributes` в начале тела    |
| `gen_ai.tool.definitions`      | объявления инструментов, доступные субагенту                | то же, что выше                                                                                 |
| `gen_ai.input.messages`        | начальный ввод, переданный субагенту (промпт + extraHistory) | в начале тела                                                                                   |
| `gen_ai.output.messages`       | финальные сообщения ответа, возвращённые субагентом         | в метаданных `endSubagentSpan`                                                                  |

Всё это уже зашлюзовано; паттерн #4097 — вызывать хелпер `addSubagentSensitiveAttributes(span, opts)` изнутри тела. Детали реализации — дизайн лишь отмечает точку интеграции.

## Порядок выполнения

- Независимо от #4367 (атрибуты ресурсов — на ревью). Нет ограничения на порядок слияния, но `gen_ai.conversation.id` на спанах субагента выигрывает от переноса `session.id` из ресурса в #4367. **Рекомендуется сначала принять #4367**, чтобы источник истины `getSessionId()` был устоявшимся.
- Независимо от Фазы 4 (декомпозиция LLM-запросов / TTFT). Фаза 4 прикрепляется к спанам `qwen-code.llm_request` независимо от того, находятся ли они под субагентом или взаимодействием. Рекомендуется Фаза 3 до Фазы 4, чтобы метрики на попытку из Фазы 4 можно было агрегировать по субагентам.

## Открытые вопросы

1. **`gen_ai.provider.name`**: спецификация требует его, но описывает провайдера LLM, а не фреймворка агента. Установка `'qwen-code'` — лучшая интерпретация; если будущая ревизия спецификации добавит вариант `agent.provider.name`, следует переключиться.
2. **Имя спана `qwen-code.subagent` vs спецификация `invoke_agent {name}`**: выбрали внутреннюю согласованность. Если использование GenAI-совместимых инструментов вырастет и `invoke_agent ${name}` станет критичным для автообнаружения, можно переключиться — имя спана — наиболее переименовываемая вещь в OTel.
3. **Мягкое предупреждение на глубине ≥ 5**: произвольное число. Может быть ручкой конфигурации. Отложить, пока данные с продакшена не покажут необходимость.
4. **`SubagentExecutionEvent.result` содержит полный вывод LLM, что объёмно**: сегодня это раздувает объём LogRecord. План миграции (LogRecord → события спанов) отложен, но стоит выполнить, когда в Фазе 4 появится агрегация использования токенов.
5. **Спаны лог-моста внутри fork попадают на traceId, полученный из сессии, а не на T1 форка**: см. граничные случаи. Исправление — более широкая проблема «span взаимодействия не наследует контекст корня сессии», поднятая в ветке sessionId-vs-traceId — отдельный дизайн, затрагивающий все нативные спаны, не только субагента. Выходит за рамки.
