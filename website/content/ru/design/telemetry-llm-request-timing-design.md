# Декомпозиция времени выполнения LLM-запроса: проект (P3, Фаза 4)

> Issue #3731 — Фаза 4 иерархического трассирования сессий. Добавляет время до первого токена, длительность настройки запроса, длительность сэмплирования и телеметрию повторных попыток на каждый запрос в span `qwen-code.llm_request`, чтобы операторы могли ответить на вопрос «почему этот LLM-вызов был медленным?» без гаданий.
>
> Основывается на Фазе 1 (#4126), Фазе 1.5 (#4302), Фазе 2 (#4321). Независимо от Фазы 3 (#4410, на ревью) — рекомендуется сначала завершить Фазу 3, чтобы поля количества попыток из Фазы 4 чисто агрегировались в поддеревьях субагентов.

## Проблема

В настоящее время span'ы `qwen-code.llm_request` содержат только `model`, `prompt_id`, `input_tokens`, `output_tokens`, `success`, `error`, `duration_ms`. Операторы, читающие один трейс, не могут определить:

1. **Какая часть `duration_ms` приходится на размышления модели, а какая — на настройку сети.** Значение `duration_ms` в 12 секунд может означать 11 секунд повторных попыток с последующей быстрой генерацией за 1 секунду, или 100 мс настройки с последующей медленной потоковой передачей в течение 12 секунд — трейс этого не показывает.
2. **Когда пользователь увидел первый токен.** TTFT (время до первого токена) — стандартный SLO по задержке для чат-интерфейсов. Мы не можем его вычислить, так как не фиксируем его.
3. **Что происходило во время повторных попыток.** `retryWithBackoff` (`utils/retry.ts:285`) только вызывает `debugLogger.warn` — ни OTel-события, ни атрибута span'а. Четыре точки вызова LLM, проходящие через него (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`), не имеют видимости повторных попыток ни в трейсах, ни в метриках. `ContentRetryEvent` существует для повторных попыток восстановления контента внутри `geminiChat.ts:806,830`, но не для более распространённых повторных попыток при ограничении скорости / ошибках 5xx.
4. **Что `api.request.breakdown` — мёртвый код.** Метрика определена в `metrics.ts:242-251` с 4 значениями `ApiRequestPhase`, экспортируется из `index.ts:117`, тестируется в `metrics.test.ts:646-675` — но `recordApiRequestBreakdown()` не вызывается нигде в production-коде. Инфраструктура метрик оплачена, но поток данных так и не был подключён.

Эти пробелы делают `qwen-code.llm_request` наименее информативным span'ом в дереве трейса. Span'ы инструментов (#4126/#4321) и субагентов (#4410) отображают фазы жизненного цикла; span'ы LLM сворачивают весь запрос в одну непрозрачную длительность.

## Существующая поверхность (без изменений)

| Компонент                                                    | Расположение                                                     | Почему мы не трогаем                                                                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Жизненный цикл span'а LLM-запроса                            | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | Фаза 1 (#4126) определила вспомогательные функции. Мы расширяем интерфейс метаданных, не перестраивая.                                                                                                       |
| Передача активного span'а в генераторы провайдеров           | `loggingContentGenerator.ts:213,287`                             | Фаза 1 (#4126) заменила `withSpan('api.*')` на нативные помощники; активный контекст уже достигает обёртки потока.                                                                                          |
| Схема и потребители `ContentRetryEvent`                      | `types.ts:626`, `qwen-logger.ts:947`, `loggers.ts:717`           | Существующее событие сохраняет свою форму и целевую аудиторию; мы добавляем родственный класс событий для пути `retryWithBackoff`.                                                                           |
| Span'ы моста логов `LogToSpanProcessor`                      | `log-to-span-processor.ts`                                       | Существующий мост ContentRetryEvent продолжает вкладываться под активный span LLM. Фаза 4 не меняет это.                                                                                                    |
| Перечисление `ApiRequestPhase`                               | `metrics.ts:330-334`                                             | Публичная поверхность (4 значения). Мы заполняем 3 из 4 в production-коде; оставляем перечисление без изменений для обратной совместимости.                                                                 |
| Нормализация чанков провайдера → `GenerateContentResponse`   | `loggingContentGenerator.ts:286-393`                             | Каждый провайдер уже нормализует вывод до формы `GenerateContentResponse` от Google, прежде чем LoggingContentGenerator увидит поток. Обнаружение TTFT выполняется централизованно над этой нормализованной формой; кода для каждого провайдера нет. |
| Общая повторная попытка `retryWithBackoff`                   | `utils/retry.ts:140`                                             | Используется как LLM-вызывающими, так и не-LLM (`channels/weixin/src/api.ts`). Мы расширяем с помощью опционального колбэка `onRetry`, а не жёстко привязываем к телеметрии LLM.                            |
| Непотоковый `generateContent`                                | `loggingContentGenerator.ts:212`                                 | TTFT не имеет смысла для непотокового режима; новые поля остаются `undefined`. Жизненный цикл span'а и существующие атрибуты без изменений.                                                                 |
## Out-of-scope (отложено)

- **Повторные попытки на уровне SDK** (openai SDK `maxRetries=3`, внутренние повторные попытки google-genai SDK). Они происходят полностью внутри стороннего SDK; для их наблюдения требуется отключить повторные попытки SDK и перереализовать в `retryWithBackoff`. Отдельное решение, не относится к Фазе 4.
- **Потоковые метрики на токен** (задержка между токенами, размер порции). Полезно для отладки производительности механизма инференса, но не для вопросов задержки, воспринимаемой пользователем, которые решает Фаза 4.
- **Раздельный TTFT для блоков рассуждений/мышления.** «Первый токен» включает содержимое рассуждений (см. D1). Будущее улучшение может разделить `ttft_to_reasoning_ms` и `ttft_to_answer_ms`, но только после того, как мы убедимся в наличии спроса.
- **Фаза сэмплирования как отдельный дочерний span.** Вычисляется как `duration_ms - ttft_ms - request_setup_ms`; дочерний span ничего не добавляет для бэкендов только на OTel (claude-code использует его только для Perfetto). Хранится как атрибут span — см. D6.
- **Постоянный режим повторных попыток (`QWEN_CODE_UNATTENDED_RETRY`): ограничение частоты событий.** Один LLM-запрос может генерировать 50+ записей `ContentRetryEvent` / `ApiRetryEvent` при постоянных повторных попытках. Ограничение выдачи — это последующая доработка; Фаза 4 генерирует все события; если объемы в продакшне окажутся непомерными, добавьте лимит на выдачу на span с итоговым событием «+N попыток (усечено)» в последующем PR.
- **Фаза разбора `TOKEN_PROCESSING`.** Значение перечисления существует, но qwen-code не имеет реальной пост-потоковой локальной обработки, которую стоило бы измерять (обычно <10 мс). Пропущено в продакшн-вызовах; значение перечисления сохранено для будущего использования или для вызывающих сторон, которые мы не контролируем.
- **Миграция `ContentRetryEvent` на LLM span как события span.** Та же причина, что и для LogRecord `subagent_execution` в Фазе 3: существующие потребители (qwen-logger RUM, будущие метрики) тесно связаны с LogRecord. Покрытие через bridge-span достаточно хорошее.

## References (обоснование решений)

| Источник                                                                                      | Ключевой вывод                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                    | TTFT вычисляется как `Date.now() - start` при событии SSE `message_start`; `start` сбрасывается при каждой попытке повторной отправки. `requestSetupMs = start - startIncludingRetries`. Массив `attemptStartTimes` сохраняется для каждой попытки. Подтверждает реализуемость подхода; их семантика TTFT — «первое событие потока» (мы отступаем к «первому содержимому» — см. D1) |
| claude-code `perfettoTracing.ts:549-671`                                                      | Отображает последовательность Setup запроса → Попытка N (повторная) → Первый токен → Сэмплирование как вложенные пары B/E. Демонстрирует визуальную декомпозицию; qwen-code выполняет ту же декомпозицию с помощью атрибутов OTel, так как у нас нет Perfetto                                                                     |
| claude-code `sessionTracing.ts:447`                                                           | В OTel-span попадает только `ttft_ms` (не `requestSetupMs`, не `samplingMs`, не тайминги каждой попытки). Мы намеренно выводим больше на span — у claude-code есть Perfetto для визуализации; у нас его нет                                                                                                                         |
| opencode (sst/opencode) `session/llm.ts`, `route/client.ts`                                   | Нет измерения TTFT. Один span Effect `LLM.run` покрывает всё. Подтверждает, что разрыв существует и у конкурирующих инструментов; не является примером для того, что делать                                                                                                                                                        |
| [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (статус: Development / Experimental) | `gen_ai.usage.input_tokens` (стабильный), `gen_ai.usage.output_tokens` (стабильный), `gen_ai.usage.cached_tokens` (экспериментальный), `gen_ai.request.model` (стабильный), `gen_ai.server.time_to_first_token` (экспериментальный, секунды с плавающей точкой). Двойной шаблон выдачи следует прецеденту #4410              |
| [OTel Trace Spec — Span Events](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events) | «События НЕ ДОЛЖНЫ использоваться для записи информации, которая лучше фиксируется как атрибуты Span.» Подтверждает, что информация о каждой попытке должна находиться в атрибутах LLM span + log-bridge spans, а не как события span на родительском span                                                                       |
| Документ дизайна Фазы 3 (`telemetry-subagent-spans-design.md`)                                 | Утвердил двойной шаблон выдачи (`qwen-code.subagent.id` + `gen_ai.agent.id`) и правило «частное имя является авторитетным». Фаза 4 следует той же конвенции для полей TTFT и токенов                                                                                                                                             |
## Дизайн — семь решений, каждое обосновано

### D1 — Семантика TTFT: «первый чанк, содержащий видимый пользователю контент»

TTFT измеряет время настенных часов от отправки запроса **успешной попытки** до **первого чанка потока, который содержит видимый пользователю вывод**. Чанк считается «видимым пользователю», если любой нормализованный `Part` в `candidates[0].content.parts` является одним из:

- `text` с непустой строкой
- `functionCall` (использование инструмента)
- `inlineData` (изображение, бинарные данные)
- `executableCode`
- `thought` / reasoning-контент (в зависимости от провайдера — Gemini `thought`, блок Anthropic `<thinking>`, reasoning-чанк OpenAI o1)

Чанки, содержащие только метаданные `role` или только `usageMetadata` (финальный чанк со сводкой использования), не вызывают срабатывание TTFT.

**Почему не «первое событие потока любого типа» (выбор claude-code)**: claude-code измеряет TTFT на `message_start` — метаданном событии, специфичном для Anthropic, которое возникает за 50–300 мс до любого реального контента. Их внутренний `headlessProfiler.ts` уже разделяет `time_to_first_response_ms` для семантики «пользователь что-то увидел», признавая это различие. qwen-code работает с несколькими провайдерами (Anthropic, OpenAI, Gemini, Qwen) — выбор семантики метаданных означает, что TTFT для Anthropic принципиально отличается от TTFT для OpenAI (у которого нет аналогичного первого события, содержащего только метаданные). Семантика видимого пользователю контента единообразна для всех 4 провайдеров и дословно соответствует «времени до первого токена».

**Почему включаем `thought` / reasoning**: с точки зрения оператора, reasoning-чанки всё равно являются выводом модели. Исключение их занизило бы TTFT для моделей, сильно использующих reasoning (o1, варианты Qwen с мышлением). В будущем возможно разделение на `ttft_to_reasoning_ms` и `ttft_to_answer_ms`; это не относится к Фазе 4.

**Почему включаем чанки только с вызовом инструментов**: в workflow qwen-code распространены LLM-вызовы для принятия агентом решений о действиях (один `tool_use`, без текста). Исключение их означало бы, что TTFT не определён для этих запросов. `Part` типа `functionCall` является значимым выводом.

**Примечание о сравнении между продуктами**: дизайн-документ явно указывает, что `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`. Операторам, сравнивающим продукты, следует придерживаться семантики видимого пользователю контента.

### D2 — Место измерения TTFT: локальные переменные метода в `LoggingContentGenerator.generateContentStream`

Обнаружение первого чанка выполняется внутри существующего враппера потока в `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`). Переменные, относящиеся к одному вызову (`start`, `ttftMs`), живут в замыкании метода; **никогда не являются полями экземпляра**.

**Почему никогда не поля экземпляра**: `LoggingContentGenerator` создаётся **один раз на каждый `ContentGenerator`** (`contentGenerator.ts:377`) и используется совместно всеми параллельными вызовами `generateContentStream` — развёртывание под-агентов, прогревочные запросы, побочные запросы от `geminiChat`. Поле экземпляра было бы перезаписано при параллельных вызовах, порождая бессмысленные значения TTFT для одного из двух перемежающихся запросов.

**Почему не AsyncLocalStorage**: ALS сработало бы, но добавляет уровень управления контекстом для состояния, которому не нужно покидать метод. Локальные переменные метода проще, с нулевыми накладными расходами и нулевым риском утечки.

```ts
// loggingContentGenerator.ts — inside generateContentStream
const attemptStart = Date.now(); // per-call local
const requestEntryTime = Date.now(); // also per-call local — see D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// stream wrapper inspects each chunk; first one matching hasUserVisibleContent:
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` — небольшая изолированная вспомогательная функция, расположенная вместе с враппером и экспортированная для тестов:

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
      // @ts-expect-error — `thought` is not on all SDK versions but providers emit it
      p.thought !== undefined,
  );
}
```

### D3 — Вычисление `request_setup_ms`: время входа против начала успешной попытки

`request_setup_ms` измеряет время настенных часов от входа в `generateContentStream`/`generateContent` до **начала успешной попытки** — включая все неудачные повторные попытки, паузы при экспоненциальной задержке и любую подготовительную работу перед повторной попыткой.

```ts
request_setup_ms = attemptStart_of_successful_attempt - requestEntryTime;
```

Когда `attempt === 1` и повторных попыток не было, `request_setup_ms` мало (просто настройка SDK). Когда были повторные попытки, это значение отражает все накладные расходы из бюджета повторений.

**Помещение его в span OTel (отклонение от claude-code, который помещает его только в Perfetto)**: обоснование на трёх уровнях:

1. **Нет Perfetto** — у qwen-code нет отдельного визуализационного слоя. Атрибуты OTel — единственный канал.
2. **Отладка по одному трейсу** — оператор видит `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → мгновенно диагностирует «повторные попытки съели 11.5 с, сама модель отработала быстро». Вычисление `request_setup_ms` из других полей требует также раскрытия `sampling_ms`, что мы и так делаем (D6).
3. **Пренебрежимо малая стоимость** — 1 атрибут INT64. Тот же порядок величины, что и существующие атрибуты `input_tokens`, `output_tokens`. Затраты на приём бэкендом несущественны.
### D4 — Телеметрия повторных попыток: опция обратного вызова `onRetry` для `retryWithBackoff` + `ApiRetryEvent` + распространение AsyncLocalStorage

> **Обновление фазы 4b (обнаружено после проектирования)**: этот раздел изначально был написан в предположении, что claude-code использует паттерн «один LLM-спан владеет циклом повторных попыток». В ходе реализации фазы 4b мы обнаружили, что 4 места вызова `retryWithBackoff` в qwen-code (`client.ts:2109`, `baseLlmClient.ts:235,333`, `geminiChat.ts:2035` — номера строк на момент слияния) оборачивают `apiCall = () => contentGenerator.generateContent(...)`. Слой повторных попыток находится **над** LoggingContentGenerator. Каждая попытка повторного вызова вызывает `apiCall()` заново → новый спан `qwen-code.llm_request`. Нет единого общего спана между попытками. Аккумулятор внутри `LoggingContentGenerator` не сработал бы.
>
> **Решение**: распространять состояние повторных попыток через `AsyncLocalStorage` (`retryContext` в `packages/core/src/utils/retryContext.ts`). `retryWithBackoff` оборачивает каждый `await fn()` в `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)`. `LoggingContentGenerator` читает ALS в своем синхронном прелюдии и передает значения в `endLLMRequestSpan`. На самом деле это дает **более богатую** наблюдаемость, чем исходный план — каждый спан каждой попытки имеет свои собственные `duration_ms` / `ttft_ms` / детали ошибки И знает, где он находится в бюджете повторных попыток, через атрибуты попытки `attempt` / `requestSetupMs` / `retryTotalDelayMs`.
>
> Подход с ALS соответствует существующим паттернам в кодовой базе (`promptIdContext`, `subagentNameContext`, `agent-context`) — минимальная новая поверхность, хорошо понятная семантика. Процесс рецензирования в режиме планирования выявил эту доработку в ходе 3 раундов рецензирования, найдя 22 проблемы, все были устранены до слияния.

`retryWithBackoff` в настоящее время вызывает `logRetryAttempt` (`retry.ts:343`), которая только пишет в `debugLogger.warn`. Мы расширяем интерфейс `RetryOptions` опциональным обратным вызовом:

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... existing fields ...
  /**
   * Optional. Called once per failed attempt, before the backoff sleep.
   * Receives the attempt number (1-based), the error, and the delay before
   * the next attempt. Use this to emit telemetry events for LLM call sites;
   * leave undefined for non-LLM callers (e.g., channels/weixin) so they
   * stay silent in LLM-specific telemetry channels.
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // 1-based, matches debugLogger output
  error: unknown;
  errorStatus?: number;
  delayMs: number; // backoff delay before next attempt
}
```

Четыре LLM-сайта вызова (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) регистрируют обратный вызов, который порождает новое `ApiRetryEvent`:

```ts
// types.ts — new event class, sibling to ContentRetryEvent
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // 1-based
  error_type: string;
  error_message: string; // truncated to 256 chars
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms set to retry_delay_ms so LogToSpanProcessor renders
  // a bridge span of meaningful width
  duration_ms: number;
}
```

**Почему новый класс событий, а не расширение `ContentRetryEvent`**:

- У `ContentRetryEvent` есть 2 downstream-потребителя (qwen-logger, экспорт log-record). Изменение его полезной нагрузки может их сломать.
- Название «content retry» семантически относится к повторным попыткам восстановления контента (неверный стрим, восстановление схемы) — расширение его на повторные попытки из-за лимитов скорости замутило бы схему.
- Новое событие является аддитивным; нет сюрпризов для потребителей.

**Почему не встраивать обратный вызов в `retry.ts`**: `retry.ts` также вызывается из `channels/weixin/src/api.ts` (повторные попытки для API Microsoft Messaging). Жёсткая привязка LLM-телеметрии внутри `retry.ts` приводила бы к отправке `ApiRetryEvent` для не-LLM повторных попыток. Обратный вызов `onRetry` является опциональным для каждого вызывающего — LLM-вызывающие его включают, вызывающий weixin — нет.

**Сосуществование с `ContentRetryEvent`**: `ContentRetryEvent` остаётся как есть для повторных попыток восстановления контента внутри `geminiChat.ts:806,830`. `ApiRetryEvent` охватывает повторные попытки по лимиту скорости / 5xx из `retryWithBackoff`. Два события срабатывают на разных уровнях и никогда не дублируются. Существующее поведение log-bridge для обоих событий сохраняется через `LogToSpanProcessor` — оба события автоматически вкладываются в активный LLM-спан (разводка Фазы 1 гарантирует, что LLM-спан активен во время повторных попыток).

**Постоянный режим повторных попыток (`QWEN_CODE_UNATTENDED_RETRY`)**: один запрос в цикле 429 может породить 50+ событий. Ограничение частоты отправки выходит за рамки Фазы 4 — если производственные объёмы окажутся неподъёмными, добавьте лимит на спан с итоговым событием в последующем PR. Агрегированные атрибуты `attempt` и `retry_total_delay_ms` на родительском LLM-спане (D5) остаются точными независимо от лимита событий.

### D5 — Агрегация родительского LLM-спана: только скалярные атрибуты (без атрибутов типа map)

Атрибуты OTel-спана — скаляры (`string | number | boolean | array of these`). Атрибуты типа map (например, `retry_count_by_status: {429:2, 503:1}`) требуют JSON-сериализации и неудобны для запросов. Пропускаем их.
| Attribute                  | Type   | Семантика                                                                                                                              |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                  | int    | Монотонный счётчик начиная с 1 из `retryContext.attempt` (итерация текущей попытки). Всегда заполнено (по умолчанию 1, если контекст повторных попыток отсутствует) |
| `retry_total_delay_ms`     | int    | Суммарная задержка (backoff) ДО начала этой попытки. Не определено для прямых вызовов; 0 для попытки 1; > 0 для последующих повторных попыток   |
| `ttft_ms`                  | int    | TTFT на D1; не определено для непотоковых запросов или запросов, прерванных до первого чанка                                                          |
| `request_setup_ms`         | int    | На D3                                                                                                                                   |
| `sampling_ms`              | int    | На D6                                                                                                                                   |
| `output_tokens_per_second` | double | Производное: `output_tokens / (sampling_ms / 1000)`; не определено, когда `sampling_ms === 0`                                                      |

Распределение кодов состояния по попыткам (например, «2 из 3 попыток были 429») можно получить из логических span’ов записей `ApiRetryEvent`. Нет необходимости дублировать это в виде плоского атрибута на родительском span’е.

**Почему `sampling_ms` и `output_tokens_per_second` в span’е**: значения выводимы, но их сложно вычислять в запросах к бэкенду при суммировании по многим span’ам. Та же оценка затрат/выгод, что и для `request_setup_ms` (D3).

### D6 — Активировать `recordApiRequestBreakdown()` для 3 из 4 фаз

В `endLLMRequestSpan` (или обёртке, которая его вызывает), после вычисления TTFT/настройки/сэмплирования, добавить:

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = задержка сети + генерация первого токена
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**Почему пропускаем `TOKEN_PROCESSING`**: qwen-code обрабатывает чанки потока встроенно (консолидация происходит в обёртке в `loggingContentGenerator.ts:644`); фаза пост-потоковой обработки занимает <10 мс и архитектурно не выделяется. Заполнение её бессмысленным значением засоряет гистограмму. Отказ от использования значения перечисления безопасен — `apiRequestBreakdownHistogram.record(value, {model, phase})` — это просто гистограмма с `phase` в качестве метки; отсутствующие метки просто не учитываются в запросах.

**Почему не переопределяем `NETWORK_LATENCY`**: название спецификации немного вводит в заблуждение (это задержка сети + генерация первого токена, а не чисто сетевая задержка), но:

- Перечисление является частью `metrics.ts:330-334`, которое экспортируется из `index.ts:117` и протестировано.
- Панели управления бэкенда уже могут ссылаться на эти названия фаз.
- Переименование или добавление новой фазы было бы обратно несовместимым изменением ради тривиального незначительного улучшения точности.

Задокументируйте семантику в документе дизайна; оставьте перечисление без изменений.

**Почему на пути span’а, а не параллельно**: обеспечивает совместное размещение `recordApiRequestBreakdown` с записью атрибутов span’а — единая точка выдачи с защитой (см. идемпотентность D7), единый инвариант порядка.

### D7 — Идемпотентность `endLLMRequestSpan`: запись метрик защищена существующим guard’ом двойного завершения

Фаза 1.5 (#4302) установила, что `endLLMRequestSpan` может быть вызван дважды (коллизия пути прерывания и пути ошибки). Существующий guard в `session-tracing.ts:~470` (`if (!activeSpans.has(...)) return;`) предотвращает двойной вызов `span.end()`. Запись метрик фазы 4 (D6) **должна находиться внутри того же защищённого блока**, перед `span.end()`:

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // уже завершено — guard двойного завершения
activeSpans.delete(spanRef);    // захватить завершение

// ... вычисление длительности, установка атрибутов ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // НОВОЕ — защищено
  recordTokenUsageMetrics(...); // существующее
}

span.end();
```

Это гарантирует, что метрика записывается **ровно один раз** на каждый LLM-запрос, соответствуя жизненному циклу span’а.

**Почему не записывать в `loggingContentGenerator`**: он не видит путь прерывания. Запись на уровне жизненного цикла span’а гарантирует, что каждый LLM-запрос, открывший span, создаёт ровно один образец breakdown, независимо от успеха/неудачи/прерывания.

### D8 — Двойная эмиссия семантических конвенций GenAI (частное название — авторитетное)

Каждый атрибут фазы 4, соответствующий атрибуту семантической конвенции OTel GenAI, записывается дважды в span:

| qwen-code частное (авторитетное)           | GenAI semconv (слой совместимости)                | Конвертация единиц | Статус спецификации |
| ------------------------------------------ | ----------------------------------------------- | ------------------ | ------------------- |
| `ttft_ms` (мс, int)                        | `gen_ai.server.time_to_first_token` (с, double) | `ttftMs / 1000`    | Экспериментальный   |
| `input_tokens` (int)                       | `gen_ai.usage.input_tokens` (int)               | идентично          | Стабильный          |
| `output_tokens` (int)                      | `gen_ai.usage.output_tokens` (int)              | идентично          | Стабильный          |
| `cached_input_tokens` (int) (при наличии) | `gen_ai.usage.cached_tokens` (int)              | идентично          | Экспериментальный   |
| `qwen-code.model` (string)                 | `gen_ai.request.model` (string)                 | идентично          | Стабильный          |
**Существующие имена атрибутов токенов** на span LLM (устанавливаются в `endLLMRequestSpan` до Фазы 4): qwen-code уже использует голые `input_tokens` и `output_tokens`. Фаза 4 добавляет родственные атрибуты `gen_ai.usage.*` для соответствия шаблону #4410. Голые имена остаются; **не переименовывайте**.

Поля, не имеющие эквивалента в GenAI semconv — `request_setup_ms`, `sampling_ms`, `retry_total_delay_ms`, `attempt`, `output_tokens_per_second` — отправляются только в пространстве имен qwen-code.

**Почему «частные авторитетные, semconv как совместимые»**:

- Внутренние дашборды, SLO, вывод debugLogger, qwen-logger RUM, запросы ARMS — все ссылаются на `ttft_ms` и т.д. Рассмотрение их как канонических позволяет избежать миграции с флаг-днем.
- Экспериментальный GenAI semconv может переименовать `gen_ai.server.time_to_first_token` до перехода в Stable. Если это произойдет, мы обновим эмиссию semconv; имена qwen-code не изменятся.
- Будущие бэкенды, учитывающие спецификацию (Datadog AI views, Honeycomb AI, ARMS GenAI dashboards), автоматически подхватят атрибуты `gen_ai.*` без нашего участия.

**Почему двойная эмиссия с преобразованием единиц** (мс ↔ секунды): GenAI semconv выбрал секунды как double для задержки; qwen-code выбрал мс как int (совпадает с `duration_ms`, уже присутствующим на span). Оба представления имеют ценность; преобразование дешево.

## Вспомогательный API (дополнение к `session-tracing.ts`)

```ts
// session-tracing.ts — LLMRequestMetadata interface extended (additive)
export interface LLMRequestMetadata {
  // ... existing fields: inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** Time from successful attempt start to first user-visible content chunk (ms). Undefined for non-streaming or aborted-before-first-chunk requests. */
  ttftMs?: number;

  /** Time from generateContent entry to start of successful attempt (ms). Includes all failed retries + backoff. */
  requestSetupMs?: number;

  /** Final attempt number (1-based). 1 = no retries. */
  attempt?: number;

  /** Sum of all backoff delays before the successful attempt (ms). */
  retryTotalDelayMs?: number;
}

// No new exported helpers — Phase 4 reuses startLLMRequestSpan / endLLMRequestSpan with extended metadata.
```

```ts
// types.ts — new event class
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
  duration_ms: number;  // = retry_delay_ms, drives LogToSpanProcessor bridge span width

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — RetryOptions extension
interface RetryOptions<T> {
  // ... existing ...
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number;
  error: unknown;
  errorStatus?: number;
  delayMs: number;
}

// Inside retryWithBackoff, where logRetryAttempt is called today:
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // existing debugLogger call unchanged
```

## Проводка жизненного цикла

### Путь потоковой передачи (распространенный случай)

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // Use existing startLLMRequestSpan (Phase 1)
  // Pass onRetry callback to whatever retry layer is in use:
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // we're about to start attempt N+1
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // approximate; actual reset is at top of next attempt
    attemptStartTimes.push(attemptStart);
    // emit ApiRetryEvent
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // stream wrapper detects first user-visible chunk:
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

В конце span (уже в потоке Фазы 1 `endLLMRequestSpan`) включаем новые поля в `LLMRequestMetadata`:

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
### Непотоковый путь

`generateContent` (`loggingContentGenerator.ts:212`) не генерирует потоковые чанки. TTFT равен `undefined`; `request_setup_ms` все еще значим (фиксирует накладные расходы повторных попыток). Метрика разбивки записывает 2 фазы (REQUEST_PREPARATION + RESPONSE_PROCESSING, где `RESPONSE_PROCESSING = duration_ms - request_setup_ms`), а не 3.

### Интеграция уровня повторных попыток (4 места вызова)

Каждое из 4 мест вызова `retryWithBackoff` в LLM добавляет `onRetry`:

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
    // также передается обратно в локальный аккумулятор повторных попыток LoggingContentGenerator
    // (когда в области видимости — для вызывающих кодов, не проходящих через LoggingContentGenerator,
    // LLM-спан все равно получает `attempt` и `retry_total_delay_ms` через путь метаданных,
    // потому что endLLMRequestSpan вызывается на уровне LLM)
  },
});
```

Не-LLM вызывающий код (`channels/weixin/src/api.ts`) **не регистрирует `onRetry`** — для его повторных попыток не отправляется `ApiRetryEvent`, что соответствует текущему поведению.

## Параллельная безопасность — главная гарантия

Экземпляр `LoggingContentGenerator` общий (один на `ContentGenerator`, `contentGenerator.ts:377`). Три одновременных вызова `generateContentStream` (например, 3 саб-агента, выполняющие фан-аут через `coreToolScheduler.runConcurrently`) выполняют три независимых замыкания `generateContentStream`:

```
call_A: attemptStart_A, ttftMs_A, ... (замыкание)
call_B: attemptStart_B, ttftMs_B, ... (замыкание)
call_C: attemptStart_C, ttftMs_C, ... (замыкание)
```

Локальные переменные каждого вызова никогда не пересекаются. Потоковые чанки обнаруживаются относительно локального `attemptStart` каждого вызова. Атрибуты спана устанавливаются в собственном `endLLMRequestSpan` каждого вызова.

`AsyncLocalStorageContextManager` (зарегистрирован NodeSDK в `sdk.ts:273`) уже гарантирует, что активный OTel-контекст – и, следовательно, родительский спан, передаваемый в `startLLMRequestSpan` – корректен для каждой нити выполнения.

## Файлы для изменения

| Файл                                                                             | Изменение                                                                                                                                                                                                                                                                                  | Оценка LOC |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `packages/core/src/telemetry/constants.ts`                                       | Добавить константу `EVENT_API_RETRY`                                                                                                                                                                                                                                                       | +2         |
| `packages/core/src/telemetry/types.ts`                                           | Добавить класс `ApiRetryEvent` + член объединения                                                                                                                                                                                                                                          | +40        |
| `packages/core/src/telemetry/loggers.ts`                                         | Добавить функцию `logApiRetry()`                                                                                                                                                                                                                                                           | +20        |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                         | Добавить `logApiRetryEvent()` для согласованности с RUM                                                                                                                                                                                                                                    | +20        |
| `packages/core/src/telemetry/session-tracing.ts`                                 | Расширить `LLMRequestMetadata` (ttftMs, requestSetupMs, attempt, retryTotalDelayMs); расширить `endLLMRequestSpan` для установки новых атрибутов + метрика разбивки + дуальная отправка gen_ai.*                                                                                             | +60        |
| `packages/core/src/telemetry/metrics.ts`                                         | Подключить вызов `recordApiRequestBreakdown` внутри `endLLMRequestSpan` (без изменений существующего регистратора)                                                                                                                                                                          | 0          |
| `packages/core/src/utils/retry.ts`                                               | Добавить `onRetry?: (info: RetryAttemptInfo) => void` в RetryOptions; экспортировать `RetryAttemptInfo`; вызвать колбэк в существующем месте logRetryAttempt                                                                                                                               | +25        |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`      | Захват TTFT: локальные аккумуляторы метода + хелпер `hasUserVisibleContent` + обнаружение первого чанка в обертке потока; передать новые метаданные в `endLLMRequestSpan`                                                                                                                    | +80        |
| `packages/core/src/core/client.ts`                                               | Подключить колбэк `onRetry` в месте вызова `retryWithBackoff` (`client.ts:1540`)                                                                                                                                                                                                           | +15        |
| `packages/core/src/core/baseLlmClient.ts`                                        | Подключить колбэк `onRetry` в 2 местах вызова `retryWithBackoff`                                                                                                                                                                                                                           | +25        |
| `packages/core/src/core/geminiChat.ts`                                           | Подключить колбэк `onRetry` в месте вызова `retryWithBackoff` (`geminiChat.ts:1039`)                                                                                                                                                                                                       | +15        |
| `packages/core/src/telemetry/session-tracing.test.ts`                            | `endLLMRequestSpan` устанавливает ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + дуальная отправка gen_ai + метрика разбивки (каждая фаза) + идемпотентный end                                                                     | +120       |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` | `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only); одновременные вызовы не перекрестно загрязняют; TTFT undefined при прерывании до первого чанка; TTFT undefined при нестриминге                                                | +100       |
| `packages/core/src/utils/retry.test.ts`                                          | `onRetry` вызывается при каждой неудачной попытке с правильными `attempt`, `delayMs`, `error`, `errorStatus`; отсутствие `onRetry` не вызывает действий (телеметрия не отправляется)                                                                                                         | +50        |
| `packages/core/src/telemetry/loggers.test.ts`                                    | `logApiRetry` отправляет LogRecord с ожидаемой полезной нагрузкой; проходит через LogToSpanProcessor во вложенный спан под активным LLM-спаном                                                                                                                                              | +40        |
Всего: 14 файлов, ~610 строк. Больше, чем Фаза 2 (#4321), но сопоставимо с Фазой 3 (#4410) и оправдано широтой интеграции (4 точки повторных попыток + прокладка телеметрии + обёртка потоковой передачи).

Если по итогам ревью объём окажется велик, разбить на **Фазу 4a + 4b + 4c**:

- **4a** (~200 строк): захват TTFT + расширение `LLMRequestMetadata` + двойная отправка. Самодостаточная ценность (видимость TTFT с первого дня).
- **4b** (~250 строк): колбэк `onRetry` + `ApiRetryEvent` + привязка к 4 вызывающим сайтам. **Самостоятельное исправление бага** для восполнения пробела телеметрии в `retryWithBackoff`.
- **4c** (~160 строк): активация `recordApiRequestBreakdown` + атрибуты агрегации родительского спана (`attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`). Зависит от 4a + 4b.

## Стратегия тестирования

| Тест | Что доказывает |
| --- | --- |
| `hasUserVisibleContent` возвращает `true` для text/functionCall/inlineData/executableCode/thought | Семантика D1 для разных типов частей |
| `hasUserVisibleContent` возвращает `false` для чанков, содержащих только роль и только использование | Отрицательные случаи D1 |
| Потоковая передача: TTFT измеряется от начала попытки до первого видимого пользователю чанка | Сквозное обнаружение TTFT |
| Потоковая передача: TTFT не определён, если поток прерван до появления любого видимого пользователю чанка | Граничный случай |
| Потоковая передача: TTFT вычисляется от начала последней попытки (не первой) | D3 — сброс TTFT при повторной попытке |
| Непотоковая передача: TTFT остаётся неопределённым | Решение S3 |
| Одновременные вызовы `generateContentStream` не приводят к перекрёстному загрязнению TTFT | D2 — гарантия на уровне метода |
| `endLLMRequestSpan` устанавливает все атрибуты Фазы 4 (ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second) | Присутствие атрибутов |
| `endLLMRequestSpan` дважды отправляет gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model | D8 двойная отправка |
| `endLLMRequestSpan` записывает метрику разбивки с 3 фазами для потоковой передачи, с 2 — для непотоковой | D6 |
| `endLLMRequestSpan` вызван дважды: метрика записана ровно один раз, атрибуты не переустанавливаются | D7 идемпотентность |
| `retryWithBackoff` с `onRetry`: колбэк вызывается для каждой неудачной попытки с корректными аргументами | D4 контракт колбэка |
| `retryWithBackoff` без `onRetry`: телеметрия не отправляется (молчание для не-LLM вызывающих сайтов) | P2 — защита области видимости channels/weixin |
| Точки повторных попыток в `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` отправляют `ApiRetryEvent` при повторной попытке | Интеграция D4 в 4 точках |
| `LogRecord` от `ApiRetryEvent` связывается через `LogToSpanProcessor` с дочерним span'ом под активным LLM span'ом | Корректность дерева трассировки |
| Поле `attempt` в LLM span'е корректно отражает номер последней попытки при повторных попытках | Агрегация D5 |
| Поле `retry_total_delay_ms` в LLM span'е корректно суммирует задержки из `onRetry` | Агрегация D5 |
| `output_tokens_per_second` не определён, когда `sampling_ms === 0` (нет потоковой передачи) | Избежать деления на ноль |

## Граничные случаи

| Случай | Обработка |
| --- | --- |
| Поток прерван до получения любого чанка | `ttftMs = undefined`, `sampling_ms = undefined`, `output_tokens_per_second = undefined`. `attempt`, `request_setup_ms` всё ещё установлены. `success = false` |
| Поток прерван после первого чанка | `ttftMs` установлен; `sampling_ms = duration_ms - ttftMs - request_setup_ms`; отражает время частичного ответа. `success = false` |
| Повторная попытка успешна с первой попытки (без повторных попыток) | `attempt = 1`, `retry_total_delay_ms = 0`, `ApiRetryEvent` не отправлен, метрика разбивки записывает `request_setup_ms` близким к 0 |
| Постоянный режим повторных попыток, 50+ попыток | Отправлено 50+ записей `ApiRetryEvent` (ограничение отложено — вне зоны ответственности); LLM span: `attempt = 51`, `retry_total_delay_ms = сумма всех задержек`. Оператор видит агрегированное представление на span'е; полная детализация по каждой попытке — в span'ах, связываемых через логи |
| Не-LLM вызывающий сайт `retryWithBackoff` (channels/weixin) | Колбэк `onRetry` не зарегистрирован; срабатывает только существующий `debugLogger.warn`. `ApiRetryEvent` не отправляется; метрика разбивки отсутствует (вызывающий сайт не является LLM-точкой) |
| `endLLMRequestSpan` вызван дважды (гонка между прерыванием и ошибкой) | Защита Фазы 1.5: `activeSpans.delete()` возвращает управление рано при втором вызове; `recordApiRequestBreakdown` находится внутри защиты, записывается ровно один раз |
| Чанк `message_start` от Anthropic приходит до контента | `hasUserVisibleContent` возвращает для него `false` (нет частей с text/functionCall/etc.); TTFT не срабатывает до последующего чанка `content_block_delta` |
| Первый чанк OpenAI с пустым `delta.content`, но с указанием `role` | `hasUserVisibleContent` возвращает `false`; TTFT не срабатывает до первого чанка с непустым `delta` |
| Ответ только с вызовом инструмента (без текста) | Первый чанк с частью `functionCall` запускает TTFT; `output_tokens_per_second` вычисляется относительно количества токенов вызова инструмента |
| Одновременные под-агенты (3 вызова в полёте) | У каждого вызова свои замыкания с `attemptStart`, `ttftMs`, `attemptStartTimes`. Каждый span вызова получает собственные метаданные в `endLLMRequestSpan`. Без перемешивания (D2) |
| Повторные попытки на уровне SDK внутри openai-sdk (`maxRetries=3`) | Невидимы для телеметрии qwen-code — происходят полностью внутри SDK до того, как `retryWithBackoff` увидит запрос. `attempt` отражает только попытки `retryWithBackoff`. Вне зоны ответственности (см. «Вне зоны ответственности») |
| Переименование спецификации `gen_ai.server.time_to_first_token` до достижения Stable | Единое обновление файла: `session-tracing.ts:endLLMRequestSpan`. Собственный `ttft_ms` qwen-code остаётся авторитетным — без влияния на downstream |
| LLM-запрос под-агента | Родитель — span под-агента (Фаза 3). Поля Фазы 4 вкладываются корректно. Агрегации, сгруппированные по `qwen-code.subagent.id`, дают производительность LLM по под-агентам — запланировано в design-doc, легко реализовать позже |
| Модель рассуждений с длинными блоками мыслей | Первая часть `thought` запускает TTFT; `sampling_ms` включает обе фазы: мышление и ответ. Разделение на отдельные метрики отложено |
## Откат

Изменение является аддитивным на уровне OTel и метрик — каждый новый атрибут является опциональным, каждое новое событие — это новый класс. Существующие дашборды, которые не фильтруют по новым полям, продолжают работать без изменений.

Изменения, влияющие на поведение:

- Начинают поступать новые записи журнала `ApiRetryEvent` LogRecord → объём журнала увеличивается пропорционально частоте повторных попыток (обычно <1% запросов повторяются). Смягчить можно семплированием LogRecord на уровне SDK, если необходимо.
- Новая метрика детализации `qwen-code.api.request.breakdown` начинает генерировать временные ряды → небольшое увеличение кардинальности Prometheus (`{model, phase}` — ограничено).
- Производный атрибут `output_tokens_per_second` может выглядеть необычно на дашбордах, фильтрующих "все атрибуты" — задокументируйте.

Путь отката: откатить единственный PR (или каждый из 4a/4b/4c независимо). Все новые поля используют защитные значения по умолчанию (undefined / 0) и не меняют структуру span.

## Последовательность

- **После Фазы 3 (#4410, на ревью)**: не жёсткая зависимость. Атрибуты Фазы 4 прикрепляются к span'ам `qwen-code.llm_request` независимо от того, находятся ли они под родительским span'ом `qwen-code.subagent` (Фаза 3) или `qwen-code.interaction` (Фаза 1). Рекомендуется сначала внедрить Фазу 3, чтобы агрегация по попыткам в поддеревьях subagent работала естественным образом.
- **Независимо от #4384** (исходящая передача `traceparent` + `X-Qwen-Code-Session-Id`). Они затрагивают уровень HTTP; Фаза 4 затрагивает уровень потоков/повторов/метрик.
- **Независимо от последующего улучшения сжатия чата `clearDetailedSpanState`** (#4097 follow-up). Разные области.

## Открытые вопросы

1. **Семантика вызова callback'а `onRetry`**: вызывается **до** паузы backoff (текущее предложение) или **после** (когда должна начаться следующая попытка)? До — проще: callback имеет всю информацию немедленно; после потребовалось бы отдельно захватывать только что завершённую задержку. Рекомендуется вызывать до паузы; задокументируйте это в контракте callback'а.
2. **Время выполнения каждой попытки на LLM span**: стоит ли добавить массив `attempt_durations_ms: number[]`? OTel поддерживает атрибуты-массивы примитивов. Полезно для диагностики "какая попытка из N была медленной". Отложить до тех пор, пока данные из продакшена не покажут потребность — log-bridge span'ы уже несут эквивалентную информацию.
3. **Лимит эмиссии для постоянного режима повтора**: при каком пороге `попытка > N` следует начать семплирование? `N = 5` затем 1 из 10? `N = 10` затем только сводка? Отложить до получения данных об объёмах в продакшене.
4. **Фаза `TOKEN_PROCESSING`**: оставить значение перечисления спящим или привязать к чему-то (например, время консолидации)? Отложить — дождаться реального сценария использования.
5. **Сводки LLM на уровне subagent**: тривиальное последующее улучшение после внедрения Фазы 4 — суммировать `ttft_ms`/`output_tokens`/`input_tokens` в каждом поддереве subagent. Не входит в объём Фазы 4, но поток данных это позволяет.
