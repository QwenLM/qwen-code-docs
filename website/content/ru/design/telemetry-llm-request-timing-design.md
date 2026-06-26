# LLM Request Timing Decomposition Design (P3 Phase 4)

> Issue #3731 — Фаза 4 иерархической трассировки сессий. Добавляет время до первого токена, длительность настройки запроса, длительность семплирования и телеметрию повторных попыток на каждый attempt в спан `qwen-code.llm_request`, чтобы операторы могли ответить на вопрос «почему этот LLM-вызов был медленным?» без гаданий.
>
> Основано на Фазе 1 (#4126), Фазе 1.5 (#4302), Фазе 2 (#4321). Независимо от Фазы 3 (#4410, на рассмотрении) — рекомендуется сначала внедрить Фазу 3, чтобы поля на каждый attempt из Фазы 4 чисто агрегировались в поддеревьях сабагентов.

## Проблема

Спаны `qwen-code.llm_request` сегодня содержат только `model`, `prompt_id`, `input_tokens`, `output_tokens`, `success`, `error`, `duration_ms`. Операторы, читающие один трейс, не могут определить:

1. **Какая часть `duration_ms` пришлась на размышления модели, а какая — на сетевую настройку.** `duration_ms` = 12 секунд может означать 11 секунд повторных попыток с последующей 1-секундной быстрой генерацией, или 100 мс настройки с последующей 12-секундной медленной потоковой передачей — трейс не скажет.
2. **Когда пользователь увидел первый токен.** TTFT (time-to-first-token) — стандартный SLO задержки для чат-интерфейсов. Мы не можем его вычислить; мы его не фиксируем.
3. **Что происходило во время повторных попыток.** `retryWithBackoff` (`utils/retry.ts:285`) вызывает только `debugLogger.warn` — никакого OTel-события, никакого атрибута спана. 4 LLM-сайта вызова, которые проходят через него (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`), имеют нулевую видимость повторных попыток в трейсах или метриках. `ContentRetryEvent` существует для повторных попыток восстановления контента внутри `geminiChat.ts:806,830`, но не для более распространённых повторных попыток из-за лимитов скорости / ошибок 5xx.
4. **Что `api.request.breakdown` — мёртвый код.** Метрика определена в `metrics.ts:242-251` с 4 значениями `ApiRequestPhase`, экспортирована из `index.ts:117`, протестирована в `metrics.test.ts:646-675` — но `recordApiRequestBreakdown()` не имеет ни одного вызова в продакшн-коде. Инфраструктура метрики оплачена; поток данных так и не был подключён.

Эти пробелы делают `qwen-code.llm_request` наименее информативным спаном в дереве трейса. Спаны инструментов (#4126/#4321) и спаны сабагентов (#4410) отображают фазы жизненного цикла; LLM-спаны схлопывают весь запрос в одну непрозрачную длительность.

## Существующая поверхность (без изменений)

| Компонент                                                    | Расположение                                                     | Почему не трогаем                                                                                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Жизненный цикл спана LLM-запроса                             | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | Фаза 1 (#4126) установила хелперы. Мы расширяем интерфейс метаданных, не перестраиваем                                                                                                                  |
| Распространение активного спана в генераторы провайдеров     | `loggingContentGenerator.ts:213,287`                             | Фаза 1 (#4126) заменила `withSpan('api.*')` на нативные хелперы; активный контекст уже достигает обёртки потока                                                                                         |
| Схема `ContentRetryEvent` + потребители                      | `types.ts:626`, `qwen-logger.ts:947`, `loggers.ts:717`           | Существующее событие сохраняет свою форму и downstream-потребителей; мы добавляем родственный класс событий для пути `retryWithBackoff`                                                                   |
| Спаны моста логов `LogToSpanProcessor`                       | `log-to-span-processor.ts`                                       | Существующий мост ContentRetryEvent продолжает вкладываться под активный LLM-спан. Фаза 4 это не меняет                                                                                               |
| Перечисление `ApiRequestPhase`                               | `metrics.ts:330-334`                                             | Публичная поверхность (4 значения). Мы заполняем 3 из 4 из продакшн-кода; оставляем перечисление неизменным для обратной совместимости                                                                 |
| Нормализация чанков от провайдера → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                             | Каждый провайдер уже нормализуется к форме Google `GenerateContentResponse` до того, как LoggingContentGenerator видит поток. Определение TTFT работает централизованно над этой нормализованной формой; никакого кода на провайдер |
| `retryWithBackoff` — общая повторная попытка                 | `utils/retry.ts:140`                                             | Используется как LLM-вызывающими, так и не-LLM (`channels/weixin/src/api.ts`). Мы расширяем опциональным колбэком `onRetry`, а не жёстко привязываем к телеметрии LLM                                         |
| Непотоковый `generateContent`                                | `loggingContentGenerator.ts:212`                                 | TTFT не имеет смысла для непотокового режима; новые поля остаются `undefined`. Жизненный цикл спана и существующие атрибуты без изменений                                                               |

## Вне области видимости (отложено)

- **Повторные попытки на уровне SDK** (openai SDK `maxRetries=3`, внутренние повторные попытки google-genai SDK). Они происходят полностью внутри стороннего SDK; наблюдение за ними требует отключения повторных попыток SDK и их повторной реализации в `retryWithBackoff`. Отдельное решение, не Фаза 4.
- **Потоковые метрики на каждый токен** (задержка между токенами, размер каждого чанка). Полезно для отладки производительности инференс-движка, но не для вопросов о воспринимаемой пользователем задержке, на которые нацелена Фаза 4.
- **Отдельный TTFT для блоков рассуждений/мышления.** «Первый токен» включает контент размышлений (см. D1). Будущее улучшение может разделить `ttft_to_reasoning_ms` и `ttft_to_answer_ms`, но только после того, как мы узнаем, что есть спрос.
- **Фаза семплирования как отдельный дочерний спан.** Вычисляется из `duration_ms - ttft_ms - request_setup_ms`; дочерний спан не добавляет ничего для бэкендов на OTel (claude-code использует один для Perfetto). Вместо этого хранится как атрибут спана — см. D6.
- **Лимитирование событий по уровню в персистентном режиме повторных попыток (`QWEN_CODE_UNATTENDED_RETRY`).** Один LLM-запрос может породить 50+ записей `ContentRetryEvent` / `ApiRetryEvent` при персистентных повторных попытках. Ограничение эмиссии — последующая задача; Фаза 4 отправляет все события; если объёмы в продакшне окажутся непереносимыми, добавьте лимит эмиссии на спан с итоговым событием «+N ещё попыток (обрезано)» в последующем PR.
- **Фаза разбивки `TOKEN_PROCESSING`.** Значение перечисления существует, но qwen-code не имеет реальной пост-потоковой локальной обработки, которую стоило бы измерять (обычно <10 мс). Пропущено в вызывающих продакшн-коде; значение перечисления сохранено для будущего использования или для вызывающих, которых мы не контролируем.
- **Миграция `ContentRetryEvent` на LLM-спан как событий спана.** Та же логика, что у `subagent_execution` LogRecord из Фазы 3: существующие потребители (qwen-logger RUM, будущие метрики) жёстко привязаны к LogRecord. Покрытие через мостовые спаны достаточно хорошее.

## Ссылки (доказательства решений)

| Источник                                                                                                                      | Ключевой вывод                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                  | TTFT фиксируется как `Date.now() - start` на SSE-событии `message_start`; `start` сбрасывается на каждую попытку повтора. `requestSetupMs = start - startIncludingRetries`. Массив `attemptStartTimes` сохраняется для каждой попытки. Подтверждает осуществимость подхода; их семантика TTFT — «первое событие потока» (мы отходим к «первому контенту» — см. D1) |
| claude-code `perfettoTracing.ts:549-671`                                                                                    | Отображает Request Setup → Attempt N (retry) → First Token → Sampling как вложенные пары B/E. Демонстрирует визуальную декомпозицию; qwen-code делает то же самое с атрибутами OTel, так как у нас нет Perfetto                                                                                                                |
| claude-code `sessionTracing.ts:447`                                                                                         | В OTel-спан попадает только `ttft_ms` (не `requestSetupMs`, не `samplingMs`, не тайминги на попытку). Мы намеренно помещаем в спан больше — у claude-code есть Perfetto для визуализации; у нас его нет                                                                                                                           |
| opencode (sst/opencode) `session/llm.ts`, `route/client.ts`                                                                 | Измерения TTFT нет. Один спан Effect `LLM.run` покрывает всё. Подтверждает, что разрыв существует и у конкурирующих инструментов; не является эталоном для того, что делать                                                                                                                                                          |
| [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (статус: Development / Experimental) | `gen_ai.usage.input_tokens` (Stable), `gen_ai.usage.output_tokens` (Stable), `gen_ai.usage.cached_tokens` (Experimental), `gen_ai.request.model` (Stable), `gen_ai.server.time_to_first_token` (Experimental, секунды как double). Паттерн двойной эмиссии следует прецеденту #4410                                                        |
| [OTel Trace Spec — Span Events](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)                             | «События НЕ ДОЛЖНЫ использоваться для записи информации, которая лучше фиксируется как атрибуты спана». Подтверждает, что информация о попытках должна быть в атрибутах спана LLM + мостовых спанах логов, а не как события спана на родителе                                                                                     |
| Документ дизайна Фазы 3 (`telemetry-subagent-spans-design.md`)                                                               | Установил паттерн двойной эмиссии (`qwen-code.subagent.id` + `gen_ai.agent.id`) и правило «частное имя является авторитетным». Фаза 4 следует тому же соглашению для TTFT и полей токенов                                                                                                                                        |

## Дизайн — семь решений, каждое обосновано

### D1 — Семантика TTFT: «первый чанк, содержащий видимый пользователю контент»

TTFT измеряет астрономическое время от **отправки успешной попытки** до **первого чанка потока, содержащего видимый пользователю вывод**. Чанк считается «видимым пользователю», если любая нормализованная `Part` в `candidates[0].content.parts` является одним из:

- `text` с непустой строкой
- `functionCall` (использование инструмента)
- `inlineData` (изображение, бинарные данные)
- `executableCode`
- `thought` / контент рассуждений (что бы провайдер ни выдавал — `thought` Gemini, блок `<thinking>` Anthropic, чанк рассуждений o1 от OpenAI)

Чанки, содержащие только метаданные `role` или только `usageMetadata` (финальный итоговый чанк) не инициируют TTFT.

**Почему не «первое событие потока любого рода» (выбор claude-code)**: claude-code измеряет TTFT на `message_start`, метаданном событии, специфичном для Anthropic, которое происходит за 50–300 мс до любого реального контента. Их внутренний `headlessProfiler.ts` уже разделяет `time_to_first_response_ms` для семантики «пользователь что-то увидел», признавая различие. qwen-code поддерживает несколько провайдеров (Anthropic, OpenAI, Gemini, Qwen) — выбор семантики метаданного события означает, что TTFT для Anthropic принципиально отличается от TTFT для OpenAI (у которого нет аналогичного первого события только с метаданными). Семантика видимого пользователю контента единообразна для всех 4 провайдеров и буквально соответствует time-to-first-token.

**Почему включён `thought` / рассуждения**: с точки зрения оператора, чанки рассуждений всё равно являются «выводом, произведённым моделью». Их исключение занизило бы TTFT для моделей, интенсивно использующих рассуждения (o1, варианты Qwen с мышлением). Будущее разделение на `ttft_to_reasoning_ms` vs `ttft_to_answer_ms` возможно; не в Фазе 4.

**Почему включены чанки только с вызовом инструмента**: LLM-вызовы, принимающие решения об инструментах агентом (один `tool_use`, без текста), распространены в рабочем процессе qwen-code. Их исключение означает, что TTFT не определён для этих запросов. Часть `functionCall` — значимый вывод.

**Примечание о сравнении между продуктами**: документ дизайна явно утверждает, что `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`. Операторы, сравнивающие продукты, должны сходиться на семантике видимого пользователю контента.

### D2 — Место измерения TTFT: локальные переменные метода в `LoggingContentGenerator.generateContentStream`

Обнаружение первого чанка происходит внутри существующей обёртки потока в `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`). Переменные на один вызов (`start`, `ttftMs`) живут в замыкании метода; **никогда как поля экземпляра**.

**Почему никогда как поля экземпляра**: `LoggingContentGenerator` инстанциируется **один раз на `ContentGenerator`** (`contentGenerator.ts:377`) и используется совместно всеми одновременными вызовами `generateContentStream` — развёртывание сабагентов, прогревочные запросы, побочные запросы из `geminiChat`. Поле экземпляра было бы перезаписано при конкурентных вызовах, порождая бессмысленный TTFT для одного из каждых двух перемежающихся запросов.

**Почему не AsyncLocalStorage**: ALS сработал бы, но добавляет уровень управления контекстом для состояния, которое не должно покидать метод. Локальные переменные метода проще, нулевые накладные расходы, нулевой риск утечки.

```ts
// loggingContentGenerator.ts — внутри generateContentStream
const attemptStart = Date.now(); // локальная переменная на вызов
const requestEntryTime = Date.now(); // также локальная переменная на вызов — см. D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// обёртка потока проверяет каждый чанк; первый, соответствующий hasUserVisibleContent:
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` — небольшой автономный хелпер, расположенный рядом с обёрткой, экспортирован для тестов:

```ts
function hasUserVisibleContent(chunk: GenerateContentResponse): boolean {
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts?.length) return false;
  return parts.some(
    (p) =>
      (typeof p.text === 'string' && p.text.length > 0) ||
      p.functionCall !== undefined ||
      p.inlineData !== undefined ||
      p.executableCode !== undefined ||
      // @ts-expect-error — `thought` есть не во всех версиях SDK, но провайдеры его отправляют
      p.thought !== undefined,
  );
}
```

### D3 — Вычисление `request_setup_ms`: время входа vs начало успешной попытки

`request_setup_ms` измеряет астрономическое время от входа в `generateContentStream`/`generateContent` до **начала успешной попытки** — включая все неудачные повторные попытки, задержки backoff и любую подготовительную работу перед повторными попытками.

```ts
request_setup_ms = attemptStart_of_successful_attempt - requestEntryTime;
```

Когда `attempt === 1` и повторных попыток не было, `request_setup_ms` мало (только настройка SDK). Когда были повторные попытки, он отражает все накладные расходы бюджета повторных попыток.

**Размещение в OTel-спане (отход от claude-code, который помещает это только в Perfetto)**: обоснование на трёх уровнях:

1. **Нет Perfetto** — у qwen-code нет внешнего слоя визуализации. Единственный канал — атрибуты OTel.
2. **Отладка одного трейса** — оператор видит `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → мгновенно диагностирует «повторные попытки съели 11,5 с, сама модель работала быстро». Вычисление `request_setup_ms` из других полей требует также раскрытия `sampling_ms`, что мы и так делаем (D6).
3. **Незначительная стоимость** — 1 атрибут INT64. Тот же порядок величины, что и существующие `input_tokens`, `output_tokens`. Стоимость приёма на бэкенде несущественна.

### D4 — Телеметрия повторных попыток: опция колбэка `onRetry` в `retryWithBackoff` + `ApiRetryEvent` + AsyncLocalStorage propagation

> **Обновление фазы 4b (обнаружено после дизайна)**: этот раздел изначально был написан в предположении паттерна claude-code «один LLM-спан владеет циклом повторных попыток». При реализации фазы 4b мы обнаружили, что 4 сайта вызова `retryWithBackoff` в qwen-code (`client.ts:2109`, `baseLlmClient.ts:235,333`, `geminiChat.ts:2035` — номера строк на момент слияния) все оборачивают `apiCall = () => contentGenerator.generateContent(...)`. Слой повторных попыток находится **выше** LoggingContentGenerator. Каждая попытка повтора вызывает `apiCall()` заново → новый спан `qwen-code.llm_request`. Нет единого общего спана между попытками. Аккумулятор внутри `LoggingContentGenerator` не сработал бы.
>
> **Решение**: распространять состояние повторных попыток через `AsyncLocalStorage` (`retryContext` в `packages/core/src/utils/retryContext.ts`). `retryWithBackoff` оборачивает каждый `await fn()` в `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)`. `LoggingContentGenerator` читает ALS в своём синхронном прелюдии и передаёт значения в `endLLMRequestSpan`. Фактически это даёт **более богатую** наблюдаемость, чем первоначальный план — каждый спан на попытку имеет собственные `duration_ms` / `ttft_ms` / детали ошибки И знает, где в бюджете повторных попыток он находится, через атрибуты `attempt` / `requestSetupMs` / `retryTotalDelayMs`.
>
> Подход ALS соответствует существующим паттернам в кодовой базе (`promptIdContext`, `subagentNameContext`, `agent-context`) — минимальная новая поверхность, хорошо понятная семантика. Процесс ревью в plan-mode зафиксировал эту доработку через 3 раунда ревью, обнаружив 22 проблемы, все устранены до слияния.

`retryWithBackoff` в настоящее время вызывает `logRetryAttempt` (`retry.ts:343`), который только пишет в `debugLogger.warn`. Мы расширяем интерфейс `RetryOptions` опциональным колбэком:

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... существующие поля ...
  /**
   * Опционально. Вызывается один раз на каждую неудачную попытку, до задержки backoff.
   * Получает номер попытки (начиная с 1), ошибку и задержку перед
   * следующей попыткой. Используйте это для отправки событий телеметрии для LLM-сайтов вызова;
   * оставьте undefined для не-LLM вызывающих (например, channels/weixin), чтобы они
   * оставались тихими в LLM-специфичных каналах телеметрии.
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // начиная с 1, соответствует выводу debugLogger
  error: unknown;
  errorStatus?: number;
  delayMs: number; // задержка backoff перед следующей попыткой
}
```

4 LLM-сайта вызова (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) регистрируют колбэк, который отправляет новое `ApiRetryEvent`:
```ts
// types.ts — новый класс события, дополнение к ContentRetryEvent
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // начиная с 1
  error_type: string;
  error_message: string; // обрезано до 256 символов
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms установлено равным retry_delay_ms, чтобы LogToSpanProcessor
  // создавал bridge-спан разумной ширины
  duration_ms: number;
}
```

**Почему новый класс события, а не расширение `ContentRetryEvent`**:

- У `ContentRetryEvent` есть 2 потребителя (qwen-logger, экспорт log-record). Изменение его полезной нагрузки может их сломать.
- Название «content retry» семантически относится к повторным попыткам восстановления контента (некорректный поток, исправление схемы) — расширение его для покрытия повторных попыток по ограничению скорости размыло бы схему.
- Новое событие — аддитивно; никаких сюрпризов для потребителей.

**Почему не встраивать колбэк ВНУТРИ `retry.ts`**: `retry.ts` также вызывается из `channels/weixin/src/api.ts` (повторные попытки для Microsoft Messaging API). Жёсткая привязка телеметрии LLM внутри retry.ts приводила бы к эмиссии `ApiRetryEvent` для повторных попыток, не связанных с LLM. Колбэк `onRetry` является опциональным для каждого вызывающего — вызывающие LLM подписываются, вызывающий weixin — нет.

**Сосуществование с `ContentRetryEvent`**: `ContentRetryEvent` остаётся как есть для повторных попыток восстановления контента внутри `geminiChat.ts:806,830`. `ApiRetryEvent` покрывает повторные попытки по ограничению скорости / 5xx из `retryWithBackoff`. Два события запускаются на разных уровнях и никогда не дублируются. Существующее поведение log-bridge для обоих событий сохраняется через `LogToSpanProcessor` — оба события автоматически вкладываются под активный LLM спан (разводка Фазы 1 гарантирует, что LLM спан активен во время повторных попыток).

**Постоянный режим повторных попыток (`QWEN_CODE_UNATTENDED_RETRY`)**: один запрос с циклом 429 может сгенерировать 50+ событий. Выходит за рамки Фазы 4 ограничивать эмиссию по частоте — если в продакшене объёмы окажутся неприемлемыми, добавьте лимит на спан с суммарным событием в следующем PR. Агрегированные `attempt` и `retry_total_delay_ms` на родительском LLM спане (D5) остаются точными независимо от ограничения событий.

### D5 — Агрегация родительского LLM спана: только скалярные атрибуты (без атрибутов типа map)

Атрибуты OTel span — скаляры (`string | number | boolean | массив из них`). Атрибуты типа map (например, `retry_count_by_status: {429:2, 503:1}`) требуют JSON-сериализации и неудобны для запросов. Пропускаем их.

| Атрибут                  | Тип    | Семантика                                                                                                                              |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                | int    | Монотонный счётчик, начиная с 1, из `retryContext.attempt` (итерация текущей попытки). Всегда заполнен (по умолчанию 1 при отсутствии контекста повторных попыток) |
| `retry_total_delay_ms`   | int    | Суммарная задержка backoff ДО начала этой попытки. Не определено для прямых вызовов; 0 для попытки 1; > 0 для последующих повторных попыток |
| `ttft_ms`                | int    | TTFT согласно D1; не определено для не-стриминговых или прерванных до первого чанка запросов                                           |
| `request_setup_ms`       | int    | Согласно D3                                                                                                                            |
| `sampling_ms`            | int    | Согласно D6                                                                                                                            |
| `output_tokens_per_second` | double | Производное; `output_tokens / (sampling_ms / 1000)`; не определено при `sampling_ms === 0`                                            |

Распределение кодов состояния по попыткам (например, «2 из 3 попыток были 429») можно получить из log-bridge спанов записей `ApiRetryEvent`. Нет необходимости дублировать это как плоский атрибут на родителе.

**Почему `sampling_ms` и `output_tokens_per_second` на спане**: выводимо, но громоздко вычислять в бэкендовых запросах при суммировании по многим спанам. Те же затраты/выгоды, что и для `request_setup_ms` (D3).

### D6 — Активировать `recordApiRequestBreakdown()` для 3 из 4 фаз

В `endLLMRequestSpan` (или обёртке, которая его вызывает) после вычисления TTFT/setup/sampling генерировать:

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = задержка сети + генерация первого токена
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**Почему пропускаем `TOKEN_PROCESSING`**: qwen-code обрабатывает потоковые чанки встроенно (консолидация происходит в обёртке в `loggingContentGenerator.ts:644`); фаза после завершения потока занимает <10 мс и не является архитектурно обособленной. Заполнение её бессмысленным значением загрязняет гистограмму. Оставление неиспользуемого значения enum безопасно — `apiRequestBreakdownHistogram.record(value, {model, phase})` — это просто гистограмма с `phase` в качестве метки; отсутствующие метки просто отсутствуют в запросах.

**Почему не переопределять `NETWORK_LATENCY`**: название спецификации немного вводит в заблуждение (это сеть + генерация первого токена, а не чистая задержка сети), но:

- Enum является частью `metrics.ts:330-334`, который экспортируется из `index.ts:117` и протестирован.
- Бэкендовые дашборды могут уже ссылаться на эти названия фаз.
- Переименование или добавление новой фазы было бы ломающим изменением ради тривиально незначительного улучшения точности.

Документируйте семантику в дизайн-документе; оставьте enum без изменений.

**Почему на пути спана, а не параллельно**: сохраняет `recordApiRequestBreakdown` рядом с записями атрибутов спана — единая точка эмиссии с защитой (см. D7 идемпотентность), единый инвариант порядка.

### D7 — Идемпотентность `endLLMRequestSpan`: запись метрик защищена существующим двойным guard

Фаза 1.5 (#4302) установила, что `endLLMRequestSpan` может быть вызван дважды (коллизия пути прерывания и пути ошибки). Существующий guard в `session-tracing.ts:~470` (`if (!activeSpans.has(...)) return;`) предотвращает двойной `span.end()`. Запись метрик Фазы 4 (D6) **должна находиться внутри того же защищённого блока**, перед `span.end()`:

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // уже завершён — guard от двойного завершения
activeSpans.delete(spanRef);    // захватываем завершение

// ... вычисляем длительность, устанавливаем атрибуты ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // НОВОЕ — защищено
  recordTokenUsageMetrics(...); // существующее
}

span.end();
```

Это гарантирует, что метрика записывается **ровно один раз** для каждого LLM запроса, соответствуя жизненному циклу спана.

**Почему не записывать в `loggingContentGenerator`**: он не видит путь прерывания. Запись на уровне жизненного цикла спана гарантирует, что каждый LLM запрос, открывающий спан, производит ровно один образец разбивки, независимо от успеха/неудачи/прерывания.

### D8 — Двойная эмиссия семантических конвенций GenAI (частное имя является авторитетным)

Каждый атрибут Фазы 4, соответствующий атрибуту OTel GenAI semconv, записывается на спане дважды:

| qwen-code частное (авторитетное)          | GenAI semconv (уровень совместимости)                    | Преобразование единиц | Статус спецификации |
| ------------------------------------------ | -------------------------------------------------------- | --------------------- | ------------------- |
| `ttft_ms` (мс, int)                        | `gen_ai.server.time_to_first_token` (с, double)         | `ttftMs / 1000`       | Экспериментальный   |
| `input_tokens` (int)                       | `gen_ai.usage.input_tokens` (int)                       | идентично             | Стабильный          |
| `output_tokens` (int)                      | `gen_ai.usage.output_tokens` (int)                      | идентично             | Стабильный          |
| `cached_input_tokens` (int) (при наличии)  | `gen_ai.usage.cached_tokens` (int)                      | идентично             | Экспериментальный   |
| `qwen-code.model` (string)                 | `gen_ai.request.model` (string)                         | идентично             | Стабильный          |

**Существующие названия атрибутов токенов** на LLM спане (устанавливаются в `endLLMRequestSpan` до Фазы 4): qwen-code уже использует голые `input_tokens` и `output_tokens`. Фаза 4 добавляет родственные `gen_ai.usage.*` для соответствия шаблону #4410. Голые названия остаются; **не переименовывайте**.

Поля, не имеющие эквивалента в GenAI semconv — `request_setup_ms`, `sampling_ms`, `retry_total_delay_ms`, `attempt`, `output_tokens_per_second` — генерируются только в пространстве имён qwen-code.

**Почему «частное — авторитетно, semconv — как совместимость»**:

- Внутренние дашборды, SLO, вывод debugLogger, qwen-logger RUM, запросы ARMS — все ссылаются на `ttft_ms` и т.д. Их сохранение в качестве канонических позволяет избежать миграции в стиле flag-day.
- Экспериментальный GenAI semconv может переименовать `gen_ai.server.time_to_first_token` до достижения стабильности. Если это произойдёт, мы обновим эмиссию semconv; имена qwen-code не изменятся.
- Будущие бэкенды, поддерживающие спецификацию (Datadog AI views, Honeycomb AI, ARMS GenAI dashboards), автоматически подхватят атрибуты `gen_ai.*` без нашего участия.

**Почему двойная эмиссия требует преобразования единиц** (мс ↔ секунды): GenAI semconv выбрал секунды (double) для задержки; qwen-code выбрал мс (int) (соответствует `duration_ms`, уже присутствующему на спане). Оба представления имеют ценность; преобразование дешёво.

## Вспомогательный API (добавляется в `session-tracing.ts`)

```ts
// session-tracing.ts — интерфейс LLMRequestMetadata расширен (аддитивно)
export interface LLMRequestMetadata {
  // ... существующие поля: inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** Время от начала успешной попытки до первого видимого пользователю чанка контента (мс). Не определено для не-стриминговых или прерванных до первого чанка запросов. */
  ttftMs?: number;

  /** Время от входа в generateContent до начала успешной попытки (мс). Включает все неудачные повторные попытки + backoff. */
  requestSetupMs?: number;

  /** Номер финальной попытки (начиная с 1). 1 = без повторных попыток. */
  attempt?: number;

  /** Сумма всех задержек backoff перед успешной попыткой (мс). */
  retryTotalDelayMs?: number;
}

// Нет новых экспортируемых хелперов — Фаза 4 повторно использует startLLMRequestSpan / endLLMRequestSpan с расширенными метаданными.
```

```ts
// types.ts — новый класс события
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY = EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number;
  error_type: string;
  error_message: string;
  status_code?: number;
  retry_delay_ms: number;
  duration_ms: number;  // = retry_delay_ms, управляет шириной bridge-спана LogToSpanProcessor

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — расширение RetryOptions
interface RetryOptions<T> {
  // ... существующие ...
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number;
  error: unknown;
  errorStatus?: number;
  delayMs: number;
}

// Внутри retryWithBackoff, где сегодня вызывается logRetryAttempt:
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // существующий вызов debugLogger без изменений
```

## Разводка жизненного цикла

### Путь стриминга (обычный случай)

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // Используем существующий startLLMRequestSpan (Фаза 1)
  // Передаём колбэк onRetry в используемый слой повторных попыток:
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // мы собираемся начать попытку N+1
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // приблизительно; фактический сброс производится в начале следующей попытки
    attemptStartTimes.push(attemptStart);
    // генерируем ApiRetryEvent
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // обёртка потока обнаруживает первый видимый пользователю чанк:
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

В конце спана (уже в потоке `endLLMRequestSpan` Фазы 1) включаем новые поля в `LLMRequestMetadata`:

```ts
endLLMRequestSpan(llmSpan, {
  success: true,
  inputTokens,
  outputTokens,
  cachedInputTokens,
  ttftMs,
  requestSetupMs: attemptStart - requestEntryTime,
  attempt: finalAttempt,
  retryTotalDelayMs,
});
```

### Путь без стриминга

`generateContent` (`loggingContentGenerator.ts:212`) не производит потоковых чанков. TTFT равен `undefined`; `request_setup_ms` по-прежнему имеет смысл (отражает накладные расходы повторных попыток). Метрика разбивки записывает 2 фазы (REQUEST_PREPARATION + RESPONSE_PROCESSING, где `RESPONSE_PROCESSING = duration_ms - request_setup_ms`), а не 3.

### Интеграция со слоем повторных попыток (4 места)

Каждое из 4 мест вызова `retryWithBackoff` для LLM добавляет `onRetry`:

```ts
// client.ts:1540 (аналогично в baseLlmClient.ts:193, 282, geminiChat.ts:1039)
const result = await retryWithBackoff(apiCall, {
  ...existingOptions,
  onRetry: (info) => {
    logApiRetry(
      this.config,
      new ApiRetryEvent({
        model,
        promptId: userPromptId,
        attemptNumber: info.attempt,
        error: info.error,
        statusCode: info.errorStatus,
        retryDelayMs: info.delayMs,
      }),
    );
    // также передаём обратно в локальный аккумулятор повторных попыток LoggingContentGenerator
    // (когда он в области видимости — для вызывающих, которые не проходят через LoggingContentGenerator,
    // LLM спан всё равно получает `attempt` и `retry_total_delay_ms` через путь метаданных,
    // потому что endLLMRequestSpan вызывается на уровне LLM)
  },
});
```

Вызывающий не-LLM (`channels/weixin/src/api.ts`) **не регистрирует `onRetry`** — для его повторных попыток `ApiRetryEvent` не генерируется, что соответствует текущему поведению.

## Параллельная безопасность — основное обещание

Экземпляр `LoggingContentGenerator` является общим (один на `ContentGenerator`, `contentGenerator.ts:377`). Три параллельных вызова `generateContentStream` (например, 3 сабагента, запущенных через `coreToolScheduler.runConcurrently`) выполняют три независимых замыкания `generateContentStream`:

```
call_A: attemptStart_A, ttftMs_A, ... (замыкание)
call_B: attemptStart_B, ttftMs_B, ... (замыкание)
call_C: attemptStart_C, ttftMs_C, ... (замыкание)
```

Локальные переменные каждого вызова никогда не пересекаются. Чанки потока обнаруживаются относительно локального `attemptStart` каждого вызова. Атрибуты спана устанавливаются в собственном `endLLMRequestSpan` каждого вызова.

`AsyncLocalStorageContextManager` (зарегистрирован NodeSDK в `sdk.ts:273`) уже гарантирует, что активный контекст OTel — и, следовательно, родительский спан, передаваемый в `startLLMRequestSpan` — корректен для каждой «нити».

## Файлы для изменения

| Файл                                                                             | Изменение                                                                                                                                                                                                                                    | Оценка LOC |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/core/src/telemetry/constants.ts`                                       | Добавить константу `EVENT_API_RETRY`                                                                                                                                                                                                         | +2         |
| `packages/core/src/telemetry/types.ts`                                           | Добавить класс `ApiRetryEvent` + член объединения                                                                                                                                                                                            | +40        |
| `packages/core/src/telemetry/loggers.ts`                                         | Добавить функцию `logApiRetry()`                                                                                                                                                                                                             | +20        |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                         | Добавить `logApiRetryEvent()` для согласованности с RUM                                                                                                                                                                                      | +20        |
| `packages/core/src/telemetry/session-tracing.ts`                                 | Расширить `LLMRequestMetadata` (ttftMs, requestSetupMs, attempt, retryTotalDelayMs); расширить `endLLMRequestSpan` для установки новых атрибутов + метрики разбивки + двойной эмиссии gen_ai.*                                                 | +60        |
| `packages/core/src/telemetry/metrics.ts`                                         | Встроить вызов `recordApiRequestBreakdown` внутри `endLLMRequestSpan` (без изменения существующего регистратора)                                                                                                                              | 0          |
| `packages/core/src/utils/retry.ts`                                               | Добавить `onRetry?: (info: RetryAttemptInfo) => void` в RetryOptions; экспортировать `RetryAttemptInfo`; вызвать колбэк в существующем месте вызова logRetryAttempt                                                                           | +25        |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`      | Захват TTFT: локальные аккумуляторы метода + хелпер `hasUserVisibleContent` + обнаружение первого чанка в обёртке потока; передать новые метаданные в `endLLMRequestSpan`                                                                     | +80        |
| `packages/core/src/core/client.ts`                                               | Встроить колбэк `onRetry` в месте вызова `retryWithBackoff` (`client.ts:1540`)                                                                                                                                                                | +15        |
| `packages/core/src/core/baseLlmClient.ts`                                        | Встроить колбэк `onRetry` в 2 местах вызова `retryWithBackoff`                                                                                                                                                                                | +25        |
| `packages/core/src/core/geminiChat.ts`                                           | Встроить колбэк `onRetry` в месте вызова `retryWithBackoff` (`geminiChat.ts:1039`)                                                                                                                                                            | +15        |
| `packages/core/src/telemetry/session-tracing.test.ts`                            | `endLLMRequestSpan` устанавливает ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + двойная эмиссия gen_ai + метрика разбивки (каждая фаза) + идемпотентное завершение                    | +120       |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` | `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only); параллельные вызовы не пересекаются; TTFT не определено при прерывании до первого чанка; TTFT не определено для не-стриминга | +100       |
| `packages/core/src/utils/retry.test.ts`                                          | `onRetry` вызывается для каждой неудачной попытки с правильными `attempt`, `delayMs`, `error`, `errorStatus`; отсутствие `onRetry` молчаливо (телеметрия не генерируется)                                                                     | +50        |
| `packages/core/src/telemetry/loggers.test.ts`                                    | `logApiRetry` генерирует LogRecord с ожидаемой полезной нагрузкой; проходит через LogToSpanProcessor к вложенному спану под активным LLM спаном                                                                                                | +40        |
Всего: 14 файлов, ~610 LOC. Больше, чем Фаза 2 (#4321), но сравнимо с Фазой 3 (#4410) и оправдано широтой интеграции (4 места повторов + телеметрическая обвязка + обёртка потоковой передачи).

Если при ревью возникнут возражения по размеру: разбить на **Фазу 4a + 4b + 4c**:

- **4a** (~200 LOC): захват TTFT + расширенное `LLMRequestMetadata` + двукратная эмиссия. Самодостаточная ценность (видимость TTFT с первого дня).
- **4b** (~250 LOC): колбэк `onRetry` + `ApiRetryEvent` + подключение 4 вызывающих сторон. **Самостоятельное исправление бага** для пробела телеметрии в `retryWithBackoff`.
- **4c** (~160 LOC): активация `recordApiRequestBreakdown` + атрибуты агрегации родительского спана (`attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`). Зависит от 4a + 4b.

## Стратегия тестирования

| Тест                                                                                                                                         | Что проверяет                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `hasUserVisibleContent` returns true for text/functionCall/inlineData/executableCode/thought                                                 | Семантика D1 для различных типов частей |
| `hasUserVisibleContent` returns false for role-only and usage-only chunks                                                                    | Отрицательные случаи D1             |
| streaming: TTFT measured from attempt start to first user-visible chunk                                                                      | Сквозное обнаружение TTFT           |
| streaming: TTFT undefined if stream aborts before any user-visible chunk                                                                     | Граничный случай                    |
| streaming: TTFT computed from final attempt's start (not first attempt)                                                                      | D3 — сброс TTFT при повторной попытке |
| non-streaming: TTFT remains undefined                                                                                                        | Решение S3                          |
| concurrent `generateContentStream` calls don't cross-contaminate TTFT                                                                        | D2 — гарантия локальности метода    |
| `endLLMRequestSpan` sets all Phase 4 attrs (ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second) | Наличие атрибутов                   |
| `endLLMRequestSpan` dual-emits gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model                                    | D8 двукратная эмиссия               |
| `endLLMRequestSpan` records breakdown metric with 3 phases for streaming, 2 for non-streaming                                                | D6                                  |
| `endLLMRequestSpan` called twice: metric recorded exactly once, attrs not re-set                                                             | D7 идемпотентность                  |
| `retryWithBackoff` with `onRetry`: callback invoked per failed attempt with correct args                                                     | D4 контракт колбэка                 |
| `retryWithBackoff` without `onRetry`: no telemetry emitted (silent for non-LLM callers)                                                      | P2 — защита области видимости каналов/weixin |
| `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` retry callsites emit `ApiRetryEvent` on retry                                             | Интеграция D4 в 4 местах            |
| `ApiRetryEvent` LogRecord bridges via LogToSpanProcessor to a child span under active LLM span                                               | Правильность дерева трассировки     |
| LLM span `attempt` field correctly reflects final attempt number under retries                                                               | D5 агрегация                        |
| LLM span `retry_total_delay_ms` correctly sums onRetry delays                                                                                | D5 агрегация                        |
| `output_tokens_per_second` undefined when `sampling_ms === 0` (no streaming)                                                                 | Избегание деления на ноль           |

## Граничные случаи

| Случай                                                                    | Обработка                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Поток прерывается до получения первого чанка                            | `ttftMs = undefined`, `sampling_ms = undefined`, `output_tokens_per_second = undefined`. `attempt`, `request_setup_ms` по-прежнему установлены. `success = false`                                                         |
| Поток прерывается после первого чанка                                   | `ttftMs` установлен; `sampling_ms` = `duration_ms - ttftMs - request_setup_ms`; отражает время частичного ответа. `success = false`                                                                                      |
| Повторная попытка успешна с первой попытки (без повторов)               | `attempt = 1`, `retry_total_delay_ms = 0`, событие `ApiRetryEvent` не испускается, метрика breakdow записывает `request_setup_ms` близким к 0                                                                            |
| Режим постоянных повторных попыток, 50+ попыток                         | Будет испущено 50+ записей `ApiRetryEvent` (ограничение выборки отложено как выходящее за рамки); LLM-спан `attempt = 51`, `retry_total_delay_ms = сумма всех задержек`. Оператор видит агрегированный вид на спане; полная детализация каждой попытки в журнальных спан-мостах |
| Вызывающая сторона `retryWithBackoff` не LLM (channels/weixin)          | Не зарегистрирован `onRetry`; срабатывает только существующий `debugLogger.warn`. Никакого `ApiRetryEvent`; никакой метрики breakdown (вызывающая сторона не является LLM-местом)                                         |
| `endLLMRequestSpan` вызывается дважды (гонка abort + error)            | Защита Фазы 1.5 в `activeSpans.delete()` приводит к досрочному возврату при втором вызове; `recordApiRequestBreakdown` находится внутри защиты, записывается ровно один раз                                                |
| Чанк Anthropic `message_start` приходит до контента                    | `hasUserVisibleContent` возвращает false для него (нет частей с text/functionCall/etc.); TTFT не срабатывает до последующего чанка `content_block_delta`                                                                  |
| Первый чанк OpenAI с пустым `delta.content`, но только `role`           | `hasUserVisibleContent` возвращает false; TTFT не срабатывает до первого чанка с непустым delta                                                                                                                            |
| Ответ только с вызовом инструмента (без текста)                        | Первый чанк с частью `functionCall` запускает TTFT; `output_tokens_per_second` вычисляется относительно количества токенов вызова инструмента                                                                            |
| Конкурентные суб-агенты (3 одновременных вызова)                        | Каждый вызов имеет свой собственный `attemptStart`, `ttftMs`, `attemptStartTimes`. Каждый спан получает свои собственные метаданные в `endLLMRequestSpan`. Интерливинга нет (D2)                                            |
| Повторы на уровне SDK внутри openai-sdk (`maxRetries=3`)               | Невидимы для телеметрии qwen-code — происходят полностью внутри SDK до того, как `retryWithBackoff` увидит запрос. `attempt` отражает только попытки `retryWithBackoff`. Вне рамок (см. «Вне рамок»)                       |
| Спецификация `gen_ai.server.time_to_first_token` переименовывается до достижения Stable | Одним файлом: `session-tracing.ts:endLLMRequestSpan`. Собственный `ttft_ms` qwen-code остаётся авторитетным — без влияния на нижестоящие системы                                                                         |
| LLM-запрос суб-агента                                                  | Родитель — спан суб-агента (Фаза 3). Поля Фазы 4 вкладываются корректно. Агрегации, сгруппированные по `qwen-code.subagent.id`, дают производительность LLM для каждого суб-агента — отложено до дизайн-документа, лёгкое последующее улучшение |
| Модель рассуждений с длинными блоками мыслей                            | Первая часть `thought` запускает TTFT; `sampling_ms` включает как фазу размышления, так и фазу ответа. Разделение на отдельные метрики отложено                                                                          |

## Откат

Изменение является аддитивным на уровне OTel и метрик — каждый новый атрибут является опциональным, каждое новое событие — новый класс. Существующие дашборды, которые не фильтруют по новым полям, продолжают работать без изменений.

Изменения, влияющие на поведение:

- Новая запись `ApiRetryEvent` LogRecord начинает поступать → объём журнала растёт пропорционально частоте повторных попыток (обычно <1% запросов повторяется). При необходимости можно уменьшить выборку LogRecord на уровне SDK.
- Новая метрика breakdown `qwen-code.api.request.breakdown` начинает создавать временные ряды → небольшое увеличение числа уникальных меток Prometheus (`{model, phase}` — ограничено).
- Производный атрибут `output_tokens_per_second` может выглядеть необычно на дашбордах, фильтрующих «все атрибуты» — документируйте.

Путь отката: откатить один PR (или каждую из 4a/4b/4c независимо). Все новые поля используют защитные значения по умолчанию (undefined / 0) и не меняют структуру спана.

## Последовательность

- **После Фазы 3 (#4410, на ревью)**: не жёсткая зависимость. Атрибуты Фазы 4 прикрепляются к спанам `qwen-code.llm_request` независимо от того, находятся ли они под родительским `qwen-code.subagent` (Фаза 3) или `qwen-code.interaction` (Фаза 1). Рекомендуется сначала принять Фазу 3, чтобы агрегация по попыткам в поддеревьях суб-агентов работала естественно.
- **Не зависит от #4384** (исходящее распространение `traceparent` + `X-Qwen-Code-Session-Id`). Они затрагивают уровень HTTP; Фаза 4 затрагивает уровень потоков/повторов/метрик.
- **Не зависит от последующей работы по сжатию чата `clearDetailedSpanState`** (последействие #4097). Разные поверхности.

## Открытые вопросы

1. **Семантика срабатывания колбэка `onRetry`**: вызывается **до** ожидания backoff (текущее предложение) или **после** (когда должна начаться следующая попытка)? «До» проще — у колбэка есть вся информация сразу; «после» потребовало бы отдельного захвата только что завершённой задержки. Рекомендуется «до сна»; документировать в контракте колбэка.
2. **Время каждой попытки в LLM-спане**: следует ли добавить массив `attempt_durations_ms: number[]`? OTel поддерживает массивы примитивов в атрибутах. Полезно для диагностики «какая из N попыток была медленной». Отложить до появления производственных данных, показывающих потребность — спан-мосты журнала уже несут эквивалентную информацию.
3. **Ограничение испускания в режиме постоянных повторных попыток**: на каком пороге `attempt > N` следует начинать выборку? `N = 5` затем 1 из 10? `N = 10` затем только сводка? Отложить до появления данных о производственном объёме.
4. **Фаза `TOKEN_PROCESSING`**: оставить значение перечисления неактивным или привязать к чему-либо (например, времени консолидации)? Отложить — дождаться реального варианта использования.
5. **Сводные данные по LLM для суб-агентов**: тривиальное последующее улучшение после принятия Фазы 4 — суммировать `ttft_ms`/`output_tokens`/`input_tokens` по поддереву суб-агента. Не входит в объём Фазы 4, но поток данных это обеспечивает.