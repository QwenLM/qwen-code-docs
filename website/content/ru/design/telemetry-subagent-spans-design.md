# Subagent Trace Tree Design (P3 Phase 3)

> Issue #3731 — Фаза 3 иерархической трассировки сессий. Добавляет span `qwen-code.subagent`, чтобы вызовы subagent'ов получали изолированную, запрашиваемую структуру трассы вместо бесшумного перемешивания под родительским span'ом `qwen-code.interaction`.
>
> Основана на Фазе 1 (#4126), Фазе 1.5 (#4302) и Фазе 2 (#4321).

## Проблема

Сегодня каждый вызов `AgentTool.execute` выполняется под родительским span'ом `qwen-code.interaction`. Три патологии:

1. **Конкурирующие subagent'ы перемешиваются.** `coreToolScheduler.ts:728` помечает `AGENT` как безопасный для конкурентного выполнения — `Promise.all` запускает до 10 subagent'ов параллельно. Их LLM-request / tool / hook span'ы все прикрепляются к одному общему родительскому interaction span'у, поэтому инструменты просмотра трасс не могут отличить «этот LLM-запрос принадлежит subagent'у A» от «этот — subagent'у B».
2. **Нет span'а для самой границы subagent'а.** Существует LogRecord `qwen-code.subagent_execution` (создаётся в `agent-headless.ts:268,329`), который мостится к span'у с тем же именем через `LogToSpanProcessor`, но это самостоятельная метка, а не родитель, в который вкладываются LLM / tool / hook span'ы subagent'а.
3. **Fork / background subagent'ы свободно плавают.** Пути «забыл и забыл» (`runInForkContext` / background) переживают родительский `AgentTool.execute` и создают span'ы во время нескольких последующих пользовательских обращений. Родительский tool span уже завершён к моменту появления этих span'ов, поэтому `context.active()` OTel не помогает — они прикрепляются к тому interaction'у, который случайно был активен в момент запуска, или ни к какому.

## Существующая поверхность (без изменений)

| Компонент                          | Расположение                                                                                                                                                                                         | Почему не трогаем                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Сайт порождения (унифицированный)  | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                                  | Единая точка входа; идеальный хук для 3 вариантов вызова      |
| Три варианта вызова                | foreground-именованный (`runFramed` at `:2154` — ожидание), fork (`void runInForkContext(runFramedFork)` at `:1991` — забыл и забыл), background (`void framedBgBody()` at `:1934` — забыл и забыл) | Жизненный цикл различается — дизайн span'а покрывает все три    |
| Конкурентность                     | `coreToolScheduler.runConcurrently` (`Promise.all`, лимит 10) — управляется `partitionToolCalls`, помечающим AGENT как `concurrent: true`                                                               | То, что делает изоляцию необходимой                            |
| `runInForkContext` ALS             | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                           | Только защита от рекурсивных fork'ов — НЕ распространяет OTel context |
| Agent identity ALS                 | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                            | Уже несёт `agentId`; мы расширяем его на `depth`               |
| LogRecord `SubagentExecutionEvent` | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 потребителя (LogToSpanProcessor мост span'а + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                              | LogRecord остаётся; потребители зависят от него                |

## Вне области видимости (отложено)

- **Агрегация использования токенов на subagent** (`gen_ai.usage.*`, суммированные по всем LLM span'ам внутри subagent'а). Относится к Фазе 4 (декомпозиция LLM-запросов).
- **Миграция LogRecord `qwen-code.subagent_execution` на новый span как события span'а.** RUM и метрики тесно связаны с LogRecord; отложено до последующего изменения, которое сможет пересогласовать всех 3 потребителей вместе.
- **Автоматический подсчёт стоимости.** То же — сначала нужен usage токенов.
- **Удаление маркера `concurrent: true` у AGENT-tool.** Конкурентность верна; мы её инструментируем, а не ограничиваем.

## Ссылки (обоснование решений)

| Источник                                                                                                                 | Ключевой вывод                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [OTel Trace Spec — Links between spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)        | Дословно: «Новая связанная трасса может также представлять долго выполняющуюся асинхронную операцию обработки данных, инициированную одним из множества быстрых входящих запросов.» → fork/background должны быть связанными корнями, а не дочерними элементами.                                                                                                  |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (статус: Development) | Имя span'а `invoke_agent {gen_ai.agent.name}`; обязательные атрибуты `gen_ai.operation.name`, `gen_ai.provider.name`; рекомендуемые: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                                 |
| LangSmith — лимит 25 000 runs / trace                                                                                    | Длинные сессии агентов в конечном итоге требуют разделения трассы; склоняет к hybrid traceId дизайну.                                                                                                                                                                                                                                          |
| [Sentry — distributed tracing](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)                 | «Дочерние транзакции могут переживать транзакции, содержащие их родительские span'ы» — поддерживается дочерний элемент с более долгим временем жизни.                                                                                                                                                                                    |
| claude-code (Anthropic)                                                                                                | Имеет иерархию subagent'ов только в локальном файле Perfetto JSON; экспорт OTel плоский. Переносимого кода нет.                                                                                                                                                                                                                              |
| opencode (sst/opencode)                                                                                                | Использует автоинструментирование `@effect/opentelemetry`; явный `context.with(trace.setSpan(active, span), fn)` для `withRunSpan`. **Подтверждает паттерн изоляции context.with.** Их предупреждение о ручной регистрации `AsyncLocalStorageContextManager` не применимо — `NodeSDK` в qwen-code регистрирует его автоматически. |

## Дизайн — шесть решений, каждое обосновано

### D1 — Жизненный цикл span'а: вызывающий открывает, вызываемый выполняется внутри `context.with(span, fn)`

`agent.ts` (вызывающий) создаёт span. Тело — будь то ожидание (`runFramed`) или «забыл и забыл» (`runInForkContext` / background) — выполняется внутри `runInSubagentSpanContext(span, fn)`, который вызывает `otelContext.with(trace.setSpan(active, span), fn)`.

**Где именно в `AgentTool.execute` открывается span?** Открывать его **НЕПОСРЕДСТВЕННО ПЕРЕД** настройкой, специфичной для типа вызова (`createAgentHeadless` / `createForkSubagent` и т.д.) — чтобы время настройки (сборка конфига, пересборка ToolRegistry, подключение ContextOverride) включалось в длительность `qwen-code.subagent`. Операторы, отслеживающие «почему этот subagent медленный?», видят полную картину. Настройка обычно << времени LLM, так что это без помех.

Рассматривалась альтернатива: открывать после настройки, исключив время настройки. Отклонено, потому что настройка subagent'а — это тоже работа, относимая к subagent'у — её скрытие делает математику общей длительности неверной при суммировании всех span'ов subagent'ов.

**Почему не только вызываемый**: к тому моменту, когда тело fork / background действительно выполняется, вызывающий уже вернул управление. `context.active()` OTel тогда возвращает контекст, который несёт асинхронный runtime — что для `void` «забыл и забыл» после завершения родителя ненадёжно. Родительский span уже закрыт; переназначение родителя post factum неверно.

**Почему не только вызывающий**: foreground отлично работает таким образом, но fork / background span'ы должны продолжать создавать дочерние span'ы (LLM / tool / hook) после возврата из `AgentTool.execute`. Этим дочерним span'ам нужно, чтобы `context.active()` возвращал span subagent'а — что происходит только если тело явно выполняется внутри `context.with(subagentSpan, body)`.

Нужны обе стороны. **Дизайн — это мост** — вызывающий создаёт span + traceId-стратегию, зависящую от типа вызова, затем передаёт управление через `runInSubagentSpanContext`.

### D2 — Гибридный traceId: foreground = дочерний span, fork/background = новый traceId + Link

| Тип вызова  | Родитель                      | TraceId                 | Почему                                                                                                                                                                          |
| ----------- | ----------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`  | дочерний от tool span'а вызывающего | наследует traceId родителя | По умолчанию в OTel; вызывающий полностью охватывает вызываемый по времени                                                                                                          |
| `fork`       | связанный корневой span        | новый traceId             | Вызывающий возвращается немедленно; fork выполняется в нескольких последующих interaction'ах. Спецификация OTel прямо рекомендует Link для этого случая. Избегает раздувания длительности/размера родительской трассы. |
| `background`  | связанный корневой span        | новый traceId             | Та же логика, что и для fork.                                                                                                                                                     |

**Payload Link'а**:

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
  } /* явный context = root, не наследует активный */,
);
```

Возможность запросов между трассами через идентификатор сессии: `gen_ai.conversation.id` устанавливается на каждом span'е subagent'а (как для foreground, так и для связанных корневых), так что запрос ARMS по `session.id` вернёт и трассу родительского interaction'а, и трассы связанных корневых subagent'ов. Сам Link отображается в UI родительской трассы как «Порождён: subagent X (другая трасса)», обеспечивая навигацию.

**Почему не всегда дочерний**: background subagent на 4 часа раздувает длительность родительской трассы по wall-clock до 4 часов; размер трассы превышает лимиты некоторых бэкендов (лимит LangSmith в 25 000 runs — самый чёткий задокументированный порог). Foreground subagent'ы, которых пользователь действительно ожидает, не имеют этой проблемы, потому что они временно заключены внутри родителя.

**Почему не всегда связанный корневой**: foreground ломает естественное дерево трассы. Пользовательский запрос, который запускает синхронный Explore subagent, ДОЛЖЕН показывать одно дерево, а не две связанные трассы.

### D3 — TTL: с учётом типа, subagent fork/background = 4ч, остальные = 30 мин

`session-tracing.ts:124` определяет `SPAN_TTL_MS = 30 * 60 * 1000`. Очистка в `:144-152` уже обрабатывает `tool.blocked_on_user` особым образом, устанавливая `decision: 'aborted' + source: 'system'`. Она уже по духу осведомлена о типе.

**Изменение**: ввести TTL по типу:

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

По истечении TTL span'ы subagent'ов получают пометку:

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**Почему не 30 минут ровно**: законные долгие subagent'ы (анализ большой репы, медленные сборки, задачи глубокого исследования) получают ошибочную пометку как TTL-истекшие. 4 часа покрывают 99-й перцентиль, не будучи настолько свободными, чтобы реальные зависания остались незамеченными.

**Почему не без TTL**: сбой процесса / OOM / kill -9 → span остаётся в Map `activeSpans` навсегда. Защитная сетка в 30 минут предотвращает это; subagent fork/background просто требует более широкого окна, а не удаления TTL.

**Откуда 4 часа**: прагматичная верхняя граница для нетривиальных задач агентов (длительное глубокое исследование / анализ большой кодовой базы). Настраивается через константу, если производственные данные покажут, что мы ошиблись.

### D4 — Сохранение LogRecord: оставить эмиссию, пропустить мост LogToSpanProcessor

LogRecord `SubagentExecutionEvent` имеет 3 потребителя (проверено аудитом репозитория):

| Потребитель                                                                           | Позиция                                          | Действие                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → мостовой span `qwen-code.subagent_execution` | `loggers.ts:773` → `log-to-span-processor.ts:346` | **Пропустить этот мост** для события subagent'а — новый span `qwen-code.subagent` заменяет его |
| QwenLogger RUM (внутренняя статистика Aliyun)                                        | `qwen-logger.ts:573-574`                          | Оставить — RUM не видит OTel span'ы, только LogRecord'ы                                      |
| Счётчик `recordSubagentExecutionMetrics`                                                | `metrics.ts:829`                                  | Оставить — потребитель метрик независим от моста трассировки                                   |

**Пропуск моста** (единственное изменение в LogToSpanProcessor):

```ts
// log-to-span-processor.ts — внутри onEmit, после deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // покрывается нативным span'ом qwen-code.subagent
]);
if (skipBridge.has(eventName)) return;
```

**Влияние на потребителей трасс**: дашборды, фильтрующие по имени span'а `qwen-code.subagent_execution`, начнут возвращать ноль результатов. Их следует обновить на `qwen-code.subagent`. Отметить это в release notes.

**Почему не удалить LogRecord**: это вход для RUM и метрик. Его удаление — это рефакторинг трёх систем; вне области видимости.

**Почему не оставить оба**: в трассе будет отображаться два span'а на subagent (`qwen-code.subagent` + `qwen-code.subagent_execution`) с перекрывающейся информацией — запутывает операторов при чтении трасс, дублирует объём span'ов.

### D5 — Имя span'а + атрибуты: гибридное соответствие спецификации, с вендорным префиксом для расширений

**Имя span'а**: `qwen-code.subagent` (соответствует соглашению кодовой базы Фаз 1/2: `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …).

Спецификация OTel GenAI говорит, что каноническое имя span'а — `invoke_agent {gen_ai.agent.name}` — но **также** говорит «отдельные GenAI системы/фреймворки МОГУТ указывать другие форматы имён span'ов». Мы используем своё имя и устанавливаем `gen_ai.operation.name='invoke_agent'`, чтобы инструменты, знающие спецификацию, всё равно идентифицировали span. Операторы, читающие наше дерево трасс, видят согласованное именование `qwen-code.*`.

**Span kind**: `INTERNAL` (внутрипроцессный вызов subagent'а, согласно спецификации).

**Набор атрибутов**:

| Категория                                                         | Атрибут                                       | Источник                                                               | Примечания                                                                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Обязательный (спецификация)**                                   | `gen_ai.operation.name='invoke_agent'`           | литерал                                                               | требуется спецификацией                                                                                                                                                               |
| **Обязательный (спецификация)**                                   | `gen_ai.provider.name='qwen-code'`              | литерал                                                               | требуется спецификацией; неоднозначно для внутрипроцессных агентов (спецификация писалась для LLM-провайдера). Установка `'qwen-code'` — наиболее честная интерпретация                |
| **Обязательный (двойная эмиссия)**                                | `gen_ai.agent.id` + `qwen-code.subagent.id`     | `agentContext.agentId`                                               | двойная эмиссия до достижения спецификацией статуса Stable; позже удалить вендорный ключ                                                                                              |
| **Обязательный (двойная эмиссия)**                                | `gen_ai.agent.name` + `qwen-code.subagent.name` | `agentConfig.subagentType` (например, `Explore`, `code-reviewer`, `fork`) | та же двойная эмиссия                                                                                                                                                                 |
| **Рекомендуемый (спецификация)**                                  | `gen_ai.conversation.id`                        | `config.getSessionId()`                                              | позволяет запросы между трассами по сессии; сосуществует с существующим атрибутом span'а `session.id` (устанавливается глобально согласно #4367) — оба указывают на один UUID, удалить один, когда спецификация стабилизируется |
| **Рекомендуемый (спецификация)**                                  | `gen_ai.request.model`                          | переопределение модели, если есть                                     | только когда subagent переопределяет модель родителя                                                                                                                                    |
| **Вендорный**                                                     | `qwen-code.subagent.invocation_kind`            | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | управляет TTL + стратегией traceId                                                                                                                                                    |
| **Вендорный**                                                     | `qwen-code.subagent.is_built_in`                | bool                                                                 | фильтр для дашбордов                                                                                                                                                                 |
| **Вендорный**                                                     | `qwen-code.subagent.parent_agent_id`            | родительский ALS `agentId`                                               | для вложенных subagent'ов + межтрассовой родословной                                                                                                                                  |
| **Вендорный**                                                     | `qwen-code.subagent.depth`                      | глубина родителя + 1 (верх = 0)                                       | детектор рекурсионных ошибок                                                                                                                                                         |
| **Вендорный**                                                     | `qwen-code.subagent.invoking_request_id`        | из `agentContext`                                                  | корреляция на уровне запроса                                                                                                                                                        |
| **Спецификация (конец span'а)**                                   | `error.type` (при ошибке)                       | класс ошибки                                                          | стандарт OTel                                                                                                                                                                        |
| **Спецификация (конец span'а)**                                   | `exception.message` (при ошибке)                | `truncateSpanError(error.message)`                                   | стандарт OTel; использует усечение из Фазы 2                                                                                                                                         |
| **Вендорный (конец span'а)**                                      | `qwen-code.subagent.status`                     | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | более детально, чем OTel SpanStatus (который OK / ERROR / UNSET)                                                                                                                      |
| **Вендорный (конец span'а)**                                      | `qwen-code.subagent.terminate_reason`           | из `SubagentExecutionEvent.terminate_reason`                       | например, `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                |
| **Вендорный (конец span'а)**                                      | `qwen-code.subagent.result_summary_present`     | bool                                                                 | «создал ли subagent вывод» — ограничено                                                                                                                                              |
| **Опциональный (чувствительный)** с защитой `includeSensitiveSpanAttributes` | `gen_ai.input.messages`                         | структурированная история чата                                       | использует шлюз из #4097                                                                                                                                                             |
| **Опциональный (чувствительный)**                                  | `gen_ai.output.messages`                        | ответы моделей                                                      | тот же шлюз                                                                                                                                                                          |
| **Опциональный (чувствительный)**                                  | `gen_ai.system_instructions`                    | системный промпт                                                    | тот же шлюз                                                                                                                                                                          |
| **Опциональный (чувствительный)**                                  | `gen_ai.tool.definitions`                       | схемы инструментов                                                  | тот же шлюз                                                                                                                                                                          |
**Сопоставление SpanStatus**:

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` или `'aborted'` → `SpanStatus { code: UNSET }` (соответствует соглашению из Phase 2)

**Почему двойная эмиссия по `id` + `name`**: спецификация находится в стадии Development (на один шаг раньше Experimental). Существует `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` для опционального включения. Имена атрибутов в спецификации могут быть переименованы до перехода в Stable. Двойная эмиссия — это тот же паттерн, который Phase 2 использовал для `call_id` → `tool.call_id`; удалите вендорный ключ, когда спецификация достигнет Stable.

**Почему `qwen-code.subagent.*` (а не `qwen.subagent.*`)**: все существующие ключи с префиксом вендора в `constants.ts` используют `qwen-code.*` (`qwen-code.user_prompt`, `qwen-code.tool_call`, и т.д.). Внутренняя согласованность важнее предпочтений OTel по именованию, так как операторы запрашивают ARMS по префиксу.

**Кардинальность**: атрибуты спана не являются метками метрик в OTel; атрибуты с ключами в формате UUID (`id`, `parent_agent_id`, `invoking_request_id`) безопасны на уровне спана. Не продвигайте их в метки метрик в дальнейшем.

**~10–15 атрибутов на спан** (в зависимости от вида вызова, ошибок, вложенности). То же количество, что и у `qwen-code.tool`.

### D6 — поле `AgentContext.depth` добавлено напрямую

`AgentContext` (`agent-context.ts:32`) **не экспортируется** — только хелперы (`getCurrentAgentId`, `runWithAgentContext`, `getRuntimeContentGenerator`, `runWithRuntimeContentGenerator`). Нулевое количество сломанных downstream-компонентов на уровне TypeScript. 6 известных читателей через `getCurrentAgentId()` читают только `agentId`; добавление `depth?: number` невидимо для них.

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

`runWithAgentContext` уже использует spread `{ ...current, agentId }`, поэтому `depth` сохраняется без изменений в существующих местах вызова. **Обновите `runWithAgentContext`, чтобы он автоматически увеличивал depth** — вызывающий код не должен знать о depth:

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

Суб-агент верхнего уровня: нет родительского ALS → `depth: 0`. Вложенный: depth = parent.depth + 1.

Новый маленький аксессор `getCurrentAgentDepth(): number` возвращает `agentContextStorage.getStore()?.depth ?? 0` — используется в `startSubagentSpan` для заполнения `qwen-code.subagent.depth`.

**Почему не отдельный ALS только для телеметрии**: это дублировало бы ту же форму контекста, которую мы уже поддерживаем. Плохо. Используем существующий.

## Helper API (`session-tracing.ts`)

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
  invokerSpanContext?: SpanContext; // требуется для fork / background (источник Link)
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

`runInSubagentSpanContext` — примитив изоляции:

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
    // Дочерний от текущего активного спана (спан инструмента вызывающего)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: корневой спан с Link
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

### Foreground именованный (общий путь)

```ts
// agent.ts:~2154
// Извлекаем родительский фрейм ALS, чтобы установить parentAgentId на спане. Глубина нового
// дочернего элемента вычисляется автоматически внутри runWithAgentContext (D6) — мы
// читаем её через getCurrentAgentDepth(), когда уже находимся ВНУТРИ дочернего фрейма ALS.
// Два шага:
const parentAgentId = getCurrentAgentId();  // ДО входа в дочерний фрейм

// ... существующий вызов runFramed входит в runWithAgentContext(hookOpts.agentId, ...) ...

// ВНУТРИ runFramed можно прочитать depth потомка:
//   const depth = getCurrentAgentDepth();
//
// Практическое размещение: передать depth как замыкательную переменную, установить после
// того, как сработает runWithAgentContext — ИЛИ вычислить как
// `(getCurrentAgentDepth() снаружи) + 1` со стороны вызывающего (проще).
const depth = getCurrentAgentDepth();  // вне фрейма; дочерний будет depth + 1
// (установить qwen-code.subagent.depth = depth в аргументах startSubagentSpan)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext опущен — foreground наследует естественным образом через context.with
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
// спан живёт на протяжении последующих взаимодействий родительской сессии.
```

### Background

Та же форма, что и fork, с `invocationKind: 'background'` и `bgEventEmitter` вместо `eventEmitter`. TTL = 4ч (то же, что и fork — правило типов из D3).

## Параллельная изоляция — ключевая гарантия

Три одновременных вызова суб-агента из одного пользовательского промпта (модель генерирует 3 блока AGENT tool_use → `coreToolScheduler.runConcurrently` запускает 3 `executeSingleToolCall` параллельно; каждый открывает свой спан `qwen-code.tool` согласно Phase 2):

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [agent call #A]
│  └─ qwen-code.subagent (A, foreground)     [traceId=T0, дочерний]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [agent call #B]
│  └─ qwen-code.subagent (B, foreground)     [traceId=T0, дочерний]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [agent call #C]
   └─ qwen-code.subagent (C, fork)           [traceId=T1, корневой с Link]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, может быть создан спустя часы]
```

`context.with(span, runX)` для каждого из A, B, C выполняется параллельно. `AsyncLocalStorageContextManager` (уже автоматически зарегистрирован NodeSDK в `sdk.ts:273`) разграничивает по волокнам; перекрёстных помех нет. Дочерние LLM / tool / hook спаны каждого суб-агента видят `span` через `context.active()` внутри своей собственной асинхронной цепочки.

Fork (C) — это отдельный trace; его дочерние спаны наследуют `traceId=T1`, даже если они испускаются в течение нескольких последующих взаимодействий родительской сессии. Запрос ARMS по `session.id` возвращает и T0, и T1; Link от корня T1 к вызывающему спану `qwen-code.tool` для C обеспечивает явную навигацию.

## Файлы для изменения

| Файл                                                        | Изменение                                                                                                                                                                                                                                                              | Оценка LOC |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/core/src/telemetry/constants.ts`                  | Добавить `SPAN_SUBAGENT`, `SPAN_TTL_MS_LONG`, константы ключей атрибутов                                                                                                                               | +8         |
| `packages/core/src/telemetry/session-tracing.ts`            | Добавить `startSubagentSpan` (ветвление foreground / linked-root), `endSubagentSpan`, `runInSubagentSpanContext`, типы; расширить объединение `SpanType` значением `'subagent'`; расширить sweep TTL с `ttlFor(ctx)`                                                    | +120       |
| `packages/core/src/telemetry/log-to-span-processor.ts`      | Список пропуска для обхода моста `qwen-code.subagent_execution`                                                                                                                                                                                                        | +6         |
| `packages/core/src/telemetry/index.ts`                      | Переэкспортировать новые хелперы + типы                                                                                                                                                                                                                                | +6         |
| `packages/core/src/agents/runtime/agent-context.ts`         | Добавить `depth?: number` в `AgentContext` + аксессор `getCurrentAgentDepth()`                                                                                                                          | +12        |
| `packages/core/src/tools/agent/agent.ts`                    | Обернуть 3 пути выполнения (foreground / fork / background) в `runInSubagentSpanContext` с try/catch/finally                                                                                                                                                           | +60        |
| `packages/core/src/telemetry/session-tracing.test.ts`       | Новый `describe('subagent spans')`: start/end, дочерний vs linked-root, распространение контекста, depth, TTL по типам, идемпотентный end, NOOP при неинициализированном SDK                                                                                           | +120       |
| `packages/core/src/telemetry/log-to-span-processor.test.ts` | Проверка, что список пропуска обходит мост subagent_execution                                                                                                                                                                                                          | +20        |
| `packages/core/src/tools/agent/agent.test.ts`               | End-to-end: 3 параллельных суб-агента, каждый имеет изолированное поддерево; спаны fork получают новый traceId через Link; жизненный цикл background                                                                                                                   | +80        |

Всего: 9 файлов, ~430 LOC. Больше, чем типичные коммиты Phase 2, но оправдано — изменение TTL затрагивает отдельный файл, пропуск LogToSpanProcessor — отдельный файл, и тестовые файлы удваиваются. Разделение оставило бы неполную поверхность телеметрии.

Если ревьюеры будут против размера: разделить на 2 PR — (A) хелперы телеметрии + тесты, (B) подключение в `agent.ts` + e2e-тесты. Хелперы, внесённые первыми, не изменяют поведение во время выполнения.

## Стратегия тестирования

| Тест                                                                             | Что доказывает                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `startSubagentSpan foreground становится дочерним активного OTel-спана`          | Путь дочернего спана                                           |
| `startSubagentSpan fork создаёт новый traceId + Link к инициатору`               | Путь корневого с Link                                          |
| `runInSubagentSpanContext распространяет спан через awaits / Promise.all`       | Примитив изоляции                                              |
| `3 параллельных спана суб-агента не делят общих потомков`                        | Ключевая гарантия параллелизма                                 |
| `вложенный суб-агент записывает depth + parentAgentId`                           | Метаданные вложенности                                         |
| `endSubagentSpan сопоставление статусов (completed / failed / cancelled / aborted)` | Таксономия статусов                                         |
| `endSubagentSpan двойная эмиссия gen_ai.agent.id + qwen-code.subagent.id`        | Двойная эмиссия для соответствия спецификации                  |
| `жизненный цикл fork: спан переживает возврат AgentTool.execute`                | Корректность «запустил и забыл»                                |
| `TTL: fork суб-агента остаётся дольше 30 мин, получает штамп и завершается через 4ч` | TTL с учётом типа                                           |
| `TTL: foreground суб-агента через 30 мин попадает в стандартный sweep`           | TTL не чрезмерен                                              |
| `LogToSpanProcessor пропускает qwen-code.subagent_execution, но всё ещё эмитирует в RUM` | Пропуск моста работает                                      |
| `runConcurrently для 3 вызовов agent tool порождает 3 различных спана суб-агента` | End-to-end на уровне планировщика                             |
| `failed суб-агент устанавливает exception.message + error.type + SpanStatus=ERROR` | Путь ошибки по стандарту OTel                                 |
| `атрибуты по опции, закрытые includeSensitiveSpanAttributes`                     | Правильно использует гейт из #4097                            |
| `startSubagentSpan возвращает NOOP_SPAN, когда SDK не инициализирован`            | Соответствует дисциплине NOOP из Phase 1/2; downstream-вызовы остаются безопасными |
| `Link.context форк-спана совпадает с spanContext спана инструмента-инициатора`    | Межтрейсовая навигация работает end-to-end                    |
| `runWithAgentContext автоматически увеличивает depth: parent=0, child=1, grandchild=2` | Учёт depth корректен без участия вызывающего кода           |

## Граничные случаи

| Случай                                                                                                                  | Обработка                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Суб-агент внутри инструмента внутри суб-агента (depth > 1)                                                              | Атрибут `depth` отслеживается; рекомендуется мягкий `debugLogger.warn` при depth ≥ 5 (детектор бесконечной рекурсии)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Суб-агент, порождённый во время `awaiting_approval` родительского инструмента                                            | Спан суб-агента является дочерним от спана AGENT-инструмента; `tool.blocked_on_user` AGENT-инструмента — это sibling, а не родитель — оба дочерние от спана AGENT-инструмента. Дерево остаётся корректным                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `signal.aborted` в середине суб-агента                                                                                  | Колбэк `runInSubagentSpanContext` выбрасывает ошибку или завершается; в `finally` устанавливается `status='aborted'`, SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Fork всё ещё жив, когда родительская сессия завершается                                                                  | Срабатывает TTL 4ч; sentinel-атрибуты `qwen-code.span.ttl_expired:true`, `qwen-code.subagent.terminate_reason='ttl_swept'`, `status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `endSubagentSpan` вызван дважды                                                                                          | Идемпотентность — проверяет карту `activeSpans`; второй вызов no-op (соответствует паттерну Phase 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| LLM-вызов суб-агента использует другую модель, чем родительский                                                          | `gen_ai.request.model` установлен на спане суб-агента; под-спан LLM-запроса ТАКЖЕ записывает модель — конфликта нет                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Исключение от прелюдии сестринского суб-агента покидает `attemptExecutionOfScheduledCalls`                               | Попадает в недавно исправленный catch `handleConfirmationResponse` Phase 2, который находится ВНЕ try — не атрибутируется спану подтверждённого инструмента. Спан суб-агента корректно закрывается через собственный try/finally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Одновременные fork + foreground от одного родителя                                                                       | Foreground наследует traceId T0, fork получает T1. У обоих корректное распространение контекста независимо. Родительский спан инструмента завершается, когда возвращается его синхронная работа; форк-спан (отдельный trace) живёт дальше                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Fork-спан запускается в синхронном потоке вызывающего, но тело выполняется позже                                        | `startSubagentSpan` вызывается ДО `void runInForkContext(...)`, поэтому спан (и его Link к инициатору) захватывается, пока spanContext инициатора всё ещё доступен для чтения. Длительность спана, таким образом, включает любую задержку планирования в очереди микрозадач до фактического запуска тела — обычно суб-мс; если в продакшене появятся значительные разрывы, можно добавить отдельный атрибут `qwen-code.subagent.scheduling_delay_ms` (открытый вопрос)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| SDK не инициализирован (телеметрия отключена)                                                                            | `startSubagentSpan` досрочно возвращает NOOP_SPAN (как и все другие хелперы Phase 1/2). `runInSubagentSpanContext(NOOP_SPAN, fn)` всё равно вызывает `fn` нормально. `endSubagentSpan(NOOP_SPAN, …)` — no-op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Спаны log-bridge форка (`tool_call`, `api_request`, и т.д.) используют traceId, производный от сессии, в то время как нативные спаны форка используют T1 | Существующее поведение — спаны log-bridge всегда используют `deriveTraceId(sessionId)`, нативные спаны — OTel context. Расхождение невидимо внутри одного trace, но означает, что поиск по traceId T1 в ARMS не будет включать дочерние log-bridge элементы форка. Выходит за рамки данного PR; отмечено как открытый вопрос #5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Родительские спаны hook-события `SubagentStart` для foreground vs background различаются                                | Foreground запускает `fireSubagentStartEvent` внутри `runSubagentWithHooks` → уже внутри `runInSubagentSpanContext`, поэтому хук-спан становится дочерним от `qwen-code.subagent`. Background запускает его ДО обёртки `runWithSubagentSpan` (так что спан суб-агента ещё не существует), поэтому его хук-спан становится дочерним от AGENT `qwen-code.tool`. Операторы, запрашивающие «хук-спаны под спанами суб-агентов», должны ожидать, что `SubagentStart` для background будет отсутствовать в этом представлении. Перенос вызова хука background внутрь `framedBgBody` механически прост (мутация `contextState` достигает `bgSubagent.execute` в любом случае), но меняет пользовательскую семантику: сегодня хук срабатывает синхронно до того, как `AgentTool.execute` вернёт сообщение «Background agent launched», так что любая синхронная настройка, выполняемая хуком, происходит внутри блокирующего пользователя такта; перенос вызовет отключение хука после возврата сообщения о запуске. Отложено до намеренного решения о том, какая семантика предпочтительнее |
## Откат

Изменение является аддитивным на уровне OTel — существующие дашборды, которые не фильтруют по именам спанов, связанным с субагентом, продолжают работать. Потребители трейсов, группирующие по родительскому спану, увидят новые узлы `qwen-code.subagent` между `qwen-code.tool` и `qwen-code.llm_request`; задокументировать в примечаниях к релизу.

Изменение, влияющее на поведение — пропуск LogToSpanProcessor. Дашборды, ранее потреблявшие спан `qwen-code.subagent_execution`, получат ноль. Смягчение: оставить LogRecord нетронутым (RUM + метрики всё ещё его видят); убирается только мост спанов. Существующие запросы на основе логов не затронуты.

Путь отката: откатить единственный PR. Новые вспомогательные функции для спанов вызываются только из `agent.ts`; удаление разводки + пропуска LogToSpanProcessor восстанавливает предыдущее поведение 1:1.

## Последствия для сэмплирования

| Вызов                                           | Источник решения о сэмплировании                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `foreground` (дочерний спан, тот же traceId)    | Наследует решение родительского трейса о сэмплировании через parent-based sampler       |
| `fork` / `background` (связанный корень, новый traceId) | Независимое решение о сэмплировании при создании корня                                 |

Для текущих настроек qwen-code по умолчанию (см. `tracer.ts:shouldForceSampled()` — parentbased + always_on иначе always_on) каждый спан сэмплируется, поэтому расхождение не проявляется. Для развёртываний, использующих вероятностные сэмплеры (например, `traceidratio=0.1`), это означает:

- Пользовательский запрос может быть сэмплирован (T0 полностью захвачен), но его форк (T1) может быть отброшен, или наоборот.
- Операторы, читающие родительский T0, видят «Link: subagent C (T1)» — переход может привести к 404, если T1 не был сэмплирован.

Смягчение: задокументировать для операторов. Если важен полный захват субагента, принудительно включить сэмплирование для fork/background через будущую настройку. Выходит за рамки этой задачи.

## Конфиденциальные атрибуты (интеграция #4097)

Повторно использовать существующий флаг `includeSensitiveSpanAttributes`. Когда true, устанавливается на спан субагента в точках жизненного цикла, где данные доступны:

| Атрибут спецификации  | Источник                                                     | Когда устанавливается                                                                                 |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `gen_ai.system_instructions` | отрендеренный системный промпт из `agentConfig` / родительского контекста | `startSubagentSpan` (если доступен до открытия спана) или через `setAttributes` в начале тела |
| `gen_ai.tool.definitions`    | объявления инструментов, доступных субагенту                | то же, что выше                                                                                        |
| `gen_ai.input.messages`      | начальный ввод, переданный субагенту (промпт + extraHistory)   | в начале тела                                                                                          |
| `gen_ai.output.messages`     | финальные ответные сообщения, возвращённые субагентом        | в метаданных `endSubagentSpan`                                                                         |

Все они уже защищены флагом; паттерн #4097 — вызывать хелпер `addSubagentSensitiveAttributes(span, opts)` из тела. Детали реализации — дизайн лишь отмечает точку интеграции.

## Последовательность

- Независимо от #4367 (атрибуты ресурса — на ревью). Нет ограничения на порядок слияния, но `gen_ai.conversation.id` на спанах субагента выигрывает от переноса `session.id` из ресурса в #4367. **Рекомендуется сначала принять #4367**, чтобы источник истины `getSessionId()` был зафиксирован.
- Независимо от Фазы 4 (декомпозиция запроса к LLM / TTFT). Фаза 4 прикрепляется к спанам `qwen-code.llm_request` независимо от того, находятся ли они под субагентом или под взаимодействием. Рекомендуется Фаза 3 перед Фазой 4, чтобы метрики за попытку из Фазы 4 можно было агрегировать по субагенту.

## Открытые вопросы

1. **`gen_ai.provider.name`**: спецификация требует его, но пишет описание для провайдера LLM, а не для фреймворка агентов. Установка в `'qwen-code'` — наилучшая интерпретация; если будущая редакция спецификации добавит вариант `agent.provider.name`, следует переключиться.
2. **Имя спана `qwen-code.subagent` против спецификации `invoke_agent {name}`**: выбрана внутренняя согласованность. Если инструментарий, понимающий GenAI, станет популярнее и `invoke_agent ${name}` станет критичным для автоматического обнаружения, можно переключиться — имя спана — самый заменяемый элемент в OTel.
3. **Мягкое предупреждение при глубине ≥ 5**: произвольное число. Может быть настройкой. Отложить, пока данные с продакшена не покажут необходимость.
4. **`SubagentExecutionEvent.result` содержит полный вывод LLM — объёмный**: сегодня это раздувает объём LogRecord. План миграции (LogRecord → события спанов) отложен, но стоит выполнить, когда в Фазе 4 появится агрегация использования токенов.
5. **Спаны лог-моста внутри форка попадают на traceId, полученный из сессии, а не на T1 форка**: см. граничные случаи. Исправление — более широкая проблема «спан взаимодействия не наследует корневой контекст сессии», поднятая в обсуждении sessionId-против-traceId — отдельный дизайн, затрагивающий все нативные спаны, а не только субагента. Выходит за рамки.