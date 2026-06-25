# Телеметрия: Исходящий контекст трассировки и распространение заголовка Session ID

> Связанный issue: [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> Родительский issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 deeper observability)
> Предыдущий PR: #4367 (resource attributes — merged 2026-05-21, commit `64401e1`)
> Основано на ветке main qwen-code по состоянию на 2026-05-21 + исходном коде claude-code, проверенном напрямую

## История изменений

| Ревизия | Дата       | Триггер                                          | Описание                                                                                                                                                                                                                                                                              |
| ------- | ---------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1      | 2026-05-21 | Первая версия                                    | Полная рассылка: все исходящие запросы LLM содержат `X-Qwen-Code-Session-Id` + `traceparent`                                                                                                                                                                                          |
| R2      | 2026-05-22 | wenshao R2/R3 review                             | Безопасность границ: нормализация URL, сопоставление портов, выравнивание кавычек, try/catch для `staticCorrelationHeaders`, удаление fallback `host:port`                                                                                                                            |
| R3      | 2026-05-23 | LaZzyMan REQUEST_CHANGES                         | **Существенное изменение семантики**: область действия `X-Qwen-Code-Session-Id` по умолчанию сужается до белого списка хостов first-party (Alibaba/DashScope). Подробнее в §11                                                                                                        |
| R4      | 2026-05-25 | LaZzyMan round-8 follow-up (scope conflation)    | **Значительное сужение области PR**: этот PR оставляет только client HTTP span + OTLP loop guard; `traceparent` по умолчанию выключен (NoopTextMapPropagator); добавлено новое пространство имен верхнего уровня `outboundCorrelation.*` для переключателей безопасности; весь механизм `X-Qwen-Code-Session-Id`, реализованный в R3, **удален из этого PR**, перенесен в отдельный follow-up PR. Подробнее в §12 |

**Важное замечание**: При чтении §3.1 (цели) / §3.2 (не-цели) / §4.3 (дизайн Part B) / §4.4 (влияние на схему конфигурации) / §5 (список изменений файлов) / §9 (сравнение с claude-code) / §10 (будущие работы) / §11 (ограничение R3 по белому списку хостов) обязательно обращайтесь к §12 — **Пересмотр R4 делает утверждения R1-R3 о том, что «этот PR одновременно реализует traceparent + session id header», недействительными**: теперь этот PR — только телеметрическая наблюдаемость + независимый переключатель исходящего контекста трассировки, вся работа с корреляционными заголовками исходящих запросов (включая белый список хостов из R3) целиком перенесена в отдельный follow-up PR. Код, написанный в R3, не пропал — его можно повторно использовать в follow-up PR.

## 1. Предыстория

#4367 решил **атрибуты и кардинальность на испускаемой телеметрии** (оператор может ставить на span/log/metric такие теги, как `user.id`/`tenant.id`). Но есть одна вещь, которую он не затронул: **HTTP-заголовки исходящих запросов LLM**. Сегодня запросы qwen-code к DashScope / OpenAI / Gemini / Anthropic **вообще не содержат никаких кросс-процессных корреляционных заголовков** — ни W3C `traceparent`, ни session id.

Последствия:

1. Контекст трассировки обрывается на границе процесса qwen-code. Если сервис модели (например, DashScope с подключенным ARMS Tracing) сам имеет инструментирование OTel, порождаемые им span'ы и trace qwen-code существуют независимо — сквозное дерево трассировки отсутствует.
2. На проводе нет session id. Чтобы связать метрики/логи qwen-code с серверными логами, бэкенду требуется офлайн-сопоставление по trace id или временным меткам, что гораздо сложнее, чем чтение заголовка напрямую.
3. Локальной трассе не хватает одного слоя client-side HTTP span. Сегодня можно видеть только общее время выполнения `api.generateContent`, но не сетевой TTFB / размер тела ответа / количество повторов.

## 2. Текущее состояние

### 2.1 Включена только `HttpInstrumentation`

`packages/core/src/telemetry/sdk.ts:330`:

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` перехватывает только встроенные модули `http`/`https` Node.js, **не** затрагивая путь `globalThis.fetch` / undici.

### 2.2 Оба LLM SDK используют fetch / undici

| SDK                                              | HTTP-реализация                                                                                                                         | Перехватывается ли `HttpInstrumentation` |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `openai@5.11.0`                                  | `globalThis.fetch` (Node 18+ — undici). Доказательство: `node_modules/openai/internal/shims.mjs` выдаёт ошибку `'fetch' is not defined as a global` | ❌                                       |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`. Доказательство: вызов `new Headers()` внутри `dist/node/index.mjs`                                | ❌                                       |
| `@anthropic-ai/sdk` (anthropicContentGenerator)  | Тоже на основе fetch                                                                                                                    | ❌                                       |

### 2.3 В кодовой базе ручное распространение отсутствует

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ Пусто. Нет вызовов `propagation.inject()`, нет ручного внедрения traceparent.
### 2.4 Текущее состояние `defaultHeaders` у разных провайдеров

Семейство OpenAI (с использованием SDK `openai`):

Все подпровайдеры OpenAI наследуются от `DefaultOpenAICompatibleProvider`. **Поведение переопределения buildHeaders разделяется на два типа** (подтверждено grep-аудитом):

| Provider   | Файл                    | Поведение `buildHeaders()`                                                                        | Влияние                                             |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Базовый класс | `default.ts:63-74`      | Предоставляет `{ 'User-Agent' }` + customHeaders                                                  | Изменить здесь                                     |
| DashScope  | `dashscope.ts:110-124`  | **`override`, но не вызывает `super`** — возвращает новый объект `User-Agent` + `X-DashScope-*`   | **Необходимо изменять отдельно здесь**, иначе заголовок correlation будет потерян |
| OpenRouter | `openrouter.ts:20-30`   | `override`, но **сначала `const baseHeaders = super.buildHeaders()`**                            | Изменение базового класса наследуется автоматически ✅ |
| DeepSeek   | `deepseek.ts`            | Не переопределяет `buildHeaders` (переопределяет только `buildRequest` / `getDefaultGenerationConfig`) | Изменение базового класса наследуется автоматически ✅ |
| Minimax    | `minimax.ts`             | То же, что и deepseek                                                                              | Автоматическое наследование ✅                       |
| Mistral    | `mistral.ts`             | То же, что и deepseek                                                                              | Автоматическое наследование ✅                       |
| ModelScope | `modelscope.ts`          | То же, что и deepseek                                                                              | Автоматическое наследование ✅                       |

→ **Семейству OpenAI потребуется изменить 2 файла**: `default.ts` и `dashscope.ts`. Остальные 5 наследуют автоматически.

Google Gemini:

| Provider | Файл                            | Путь внедрения заголовка                                           |
| -------- | ------------------------------- | ------------------------------------------------------------------ |
| Gemini   | `geminiContentGenerator.ts:59`  | `new GoogleGenAI({ httpOptions: { headers } })` — нативная поддержка SDK |

Anthropic:

| Provider  | Файл                                                                                                    | Путь внедрения заголовка              |
| --------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (аргумент `defaultHeaders` в `new Anthropic`) | `defaultHeaders` |

**Всего 4 точки создания SDK**, в которые нужно внедрить заголовок session id. Все SDK уже поддерживают `defaultHeaders` / `httpOptions.headers`, обёртка fetch не требуется.

### 2.5 Существующая конфигурация прокси и fetch

`provider/default.ts:87-89`:

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` при наличии прокси в конфигурации пользователя возвращает `{ fetch: customFetch }` или аналог, что вызывает `setGlobalDispatcher(new ProxyAgent(...))` (см. `config.ts:1126-1128`). **Глобальный режим диспетчера undici совместим с `UndiciInstrumentation`** — он работает через monkey-patch `globalThis.fetch` и диагностические каналы undici, не завися от конкретного диспетчера.

## 3. Цели / Не-цели

### 3.1 Цели

- Все исходящие запросы к LLM автоматически содержат заголовок W3C `traceparent` (стандартный `W3CTraceContextPropagator` из OTel SDK)
- ~~Все~~ исходящие запросы к LLM содержат заголовок `X-Qwen-Code-Session-Id` (пространство имён продукта, аналогичного claude-code) — **исправление R3**: по умолчанию внедряется только для first-party хостов (Alibaba/DashScope), для сторонних провайдеров по умолчанию не отправляется; см. §11
- Автоматическое исключение трассировки собственных OTLP exporter endpoint (предотвращение feedback loop)
- Добавление точного client span для запросов к LLM (разделение времени сети и времени модели)
- Покрытие 4 точек создания провайдеров: базовый класс OpenAI, переопределение DashScope, Gemini, Anthropic
- Без регрессий в сценариях streaming, прокси, повторных запросов
- Согласованность с дизайном #4367: использование SDK-native опций через `defaultHeaders` — **исправление R1**: из-за проблемы staleness переключено на fetch wrapper; **исправление R3**: внутри fetch wrapper добавлен host gate

### 3.2 Не-цели

- **Заголовок `baggage`**: стандартный SDK поддерживает, но qwen-code не вызывает `propagation.setBaggage()`, по умолчанию не отправляется. Текущий дизайн не активирует это.
- **Наследование `TRACEPARENT` в дочерних процессах**: claude-code внедряет `TRACEPARENT` в подпроцессы Bash/PowerShell. В qwen-code `BashTool` этого не делает. Это отдельный подвопрос для последующей реализации.
- **Чтение входящих `TRACEPARENT` / `TRACESTATE`**: Режим `-p` в claude-code и Agent SDK читают traceparent из окружения для продолжения трассировки родительского процесса. В qwen-code этого нет. Отдельный подвопрос.
- **`X-Qwen-Code-Request-Id`**: В claude-code есть `x-client-request-id`, полезный для корреляции при таймаутах. В текущей версии не делаем, можно как следующий подвопрос.
- **Пользовательский propagator (B3 / Jaeger / X-Ray)**: Стандартный W3C покрывает 99% сценариев. Можно добавить как опцию конфигурации в будущем.
- ~~**Выборочное внедрение для каждого endpoint**: В claude-code не отправляют traceparent на сторонние endpoint (Bedrock / Vertex); qwen-code не требуется различие сторонних, отправляем везде.~~ — **исправление R3**: Этот вывод опровергнут. Рецензия LaZzyMan показала, что qwen-code — это открытый CLI, подключающийся к нескольким сторонним провайдерам (OpenAI / Anthropic / OpenRouter / и др.), поэтому аналогия claude-code first-party→first-party неприменима; session id header должен различаться по хосту. См. §11. `traceparent` по-прежнему внедряется повсеместно по дизайну R1 (стандартный заголовок OTel, trace id — хэш `sha256(sessionId)`), возможно добавление отдельного подвопроса с переключателем `telemetry.propagateTraceContext`.

## 4. Дизайн

### 4.1 Общая архитектура уровней

```
┌─ процесс qwen-code ────────────────────────────────────────────┐
│                                                                │
│  ┌─ session-tracing.ts ─┐                                     │
│  │ активный span ctx    │                                     │
│  └──────┬───────────────┘                                     │
│         │                                                      │
│         ▼                                                      │
│  ┌─ propagation.inject() (вызывается undici instrumentation) ─┐│
│  │ записывает `traceparent: 00-<traceId>-<spanId>-01` в заголовки ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │   fetch() — undici, инструментировано                   │  │
│  │   создаёт HTTP client span                              │  │
│  │   внедряет traceparent в заголовки запроса             │  │
│  │   (пропускается через ignoreRequestHook, если endpoint OTLP) │  │
│  └─────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         │   ┌─ defaultHeaders (для каждого конструктора SDK) ─┐  │
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... }    │  │
│         └───┴──────────────────────────────────────────────────┘ │
│             │                                                  │
└─────────────┼──────────────────────────────────────────────────┘
              │
              ▼ исходящий HTTP
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (существующие User-Agent, X-DashScope-*, и т.д.)
```
Два пути инъекции независимы и не зависят друг от друга:

| Layer                    | Когда инжектируется                         | Кто инжектирует                                                      |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------- |
| `traceparent`            | При каждом вызове fetch                     | `UndiciInstrumentation` автоматически (от стандартного propagator'а OTel SDK) |
| `X-Qwen-Code-Session-Id` | Однократно при создании SDK, записывается в `defaultHeaders` | Код приложения                                                      |

### 4.2 Часть A — `traceparent` через инструментирование undici

**Изменяемый файл**: `packages/core/src/telemetry/sdk.ts`

```ts
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';

// ...
const otlpUrls = [
  config.getTelemetryOtlpEndpoint(),
  config.getTelemetryOtlpTracesEndpoint(),
  config.getTelemetryOtlpLogsEndpoint(),
  config.getTelemetryOtlpMetricsEndpoint(),
]
  .filter((u): u is string => !!u)
  .map((u) => u.replace(/\/$/, ''));

instrumentations: [
  new HttpInstrumentation(),
  new UndiciInstrumentation({
    ignoreRequestHook: (request) => {
      // request.origin = "https://collector:4318", request.path = "/v1/traces"
      const url = `${request.origin}${request.path}`;
      return otlpUrls.some((e) => url.startsWith(e));
    },
  }),
],
```

#### Почему `ignoreRequestHook` обязателен

OTel SDK сам использует fetch для POST'а данных в OTLP collector. Если не пропустить, UndiciInstrumentation создаст span для запроса «отправки данных» → этот новый span будет снова отправлен → бесконечный цикл / огромный шум. Каждый проект на OTel проходил через эту граблю, и документация OTel явно рекомендует такой хук.

#### Стандартный propagator

OTel SDK `NodeSDK` при отсутствии явного `textMapPropagator` по умолчанию использует `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])`. Явная установка не требуется.

#### Формат `traceparent`

```
traceparent: 00-<32 hex-знаков traceId>-<16 hex-знаков spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               version (фиксированно 00)                    flags
```

Фиксированная длина 55 байт, без выравнивания.

#### `tracestate` и `baggage`

- `tracestate`: передаётся только если был получен от вышестоящей службы; при собственной инъекции не добавляется (поведение OTel SDK).
- `baggage`: присутствует только если был вызван `propagation.setBaggage(ctx, ...)`. qwen-code не вызывает, поэтому не отправляются.

### 4.3 Часть B — `X-Qwen-Code-Session-Id` через обёртку fetch (OpenAI / Anthropic) + статические заголовки (Gemini)

> **Изменения R3**: Следующее описание описывает решение проблемы устаревания в обёртке fetch и четыре точки интеграции с провайдерами — всё это сохраняется. Однако внутрь обёртки добавлен gate на основе разрешённого списка хостов, а `staticCorrelationHeaders` получил параметр `destinationUrl`. Актуальный код реализации с gate и список разрешённых по умолчанию см. в §11.

#### Критично: проблема устаревания и выбор решения

Наивный подход (прямая вставка `getSessionId()` в `defaultHeaders`) содержит **настоящую ошибку**:

1. В `pipeline.ts:60` при создании contentGenerator однократно выполняется `this.client = this.config.provider.buildClient()`, и `defaultHeaders` SDK-клиента фиксируют session id на этот момент.
2. Сброс сессии в `config.ts:1850` (при `/clear` от пользователя) обновляет `this.sessionId` и вызывает `refreshSessionContext()`, но **не пересоздаёт contentGenerator**.
3. Последующие вызовы LLM продолжают использовать старый клиент → в wire-заголовке остаётся старый session id → корреляция на бэкенде нарушается.

→ Необходимо читать session id **для каждого запроса**, нельзя зашивать при создании.

#### Решение

```
                   ┌─ поддержка fetch ─┐   Решение
OpenAI SDK          │     ✅            │   Обёртка fetch (чтение sessionId для каждого запроса) ✅
Anthropic SDK       │     ✅            │   Обёртка fetch ✅
@google/genai SDK   │     ❌            │   Статические httpOptions.headers + допустимость устаревания
                   └───────────────────┘
```

Интерфейс `HttpOptions` в `@google/genai` не поддерживает `fetch` (проверено grep по `node_modules/@google/genai/dist/genai.d.ts`: доступны только `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`). Поэтому Gemini использует статические заголовки, что отличается от OpenAI/Anthropic — это **известное ограничение** (см. §8.6).

#### Вспомогательная функция (обёртка fetch для каждого запроса)

Новый файл `packages/core/src/telemetry/llm-correlation-fetch.ts`:

```ts
import type { Config } from '../config/config.js';

/**
 * Wrap a fetch implementation so every outbound request gets correlation
 * headers (`X-Qwen-Code-Session-Id`) populated from the **current** session
 * id, not the value captured when the SDK client was constructed.
 *
 * Matches claude-code's pattern (src/services/api/client.ts:370-390 —
 * `buildFetch()`). Per-request injection is necessary because `/clear`
 * resets the session id mid-process; SDK clients (and their static
 * `defaultHeaders`) are NOT recreated on reset.
 *
 * Caller responsible for choosing the base fetch — usually
 * `runtimeOptions?.fetch ?? globalThis.fetch` so proxy-aware fetch is
 * preserved when ProxyAgent is in use.
 *
 * If telemetry is disabled, returns baseFetch unchanged (no correlation
 * header is added, matching the privacy stance of §3.1).
 */
export function wrapFetchWithCorrelation(
  baseFetch: typeof fetch,
  config: Config,
): typeof fetch {
  return async function correlationFetch(input, init) {
    if (!config.getTelemetryEnabled()) {
      return baseFetch(input, init);
    }
    const sid = config.getSessionId();
    if (!sid) {
      // Defensive: empty header value is rejected by some HTTP middleware.
      // Skip injection rather than send `X-Qwen-Code-Session-Id: `.
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Qwen-Code-Session-Id', sid);
    return baseFetch(input, { ...init, headers });
  };
}
```
Вспомогательный helper для SDK, которые принимают только статические заголовки (Gemini):

```ts
/**
 * Статические заголовки корреляции. Фиксируют идентификатор сессии в момент вызова —
 * **могут устареть**, если SDK хранит эти заголовки в слоте, захваченном при создании
 * (например, `@google/genai`'s `httpOptions.headers`).
 * Предпочитайте `wrapFetchWithCorrelation`, когда SDK предоставляет хук `fetch`.
 */
export function staticCorrelationHeaders(
  config: Config,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  return { 'X-Qwen-Code-Session-Id': config.getSessionId() };
}
```

#### Интеграционная точка 1: `provider/default.ts` (базовый класс OpenAI)

Изменения в `buildClient()` — композиция существующего `runtimeOptions.fetch` (прокси) с нашим wrapper:

```ts
buildClient(): OpenAI {
  // ... существующий код ...
  const runtimeOptions = buildRuntimeFetchOptions('openai', this.cliConfig.getProxy());
  const baseFetch =
    (runtimeOptions as { fetch?: typeof fetch } | undefined)?.fetch
    ?? globalThis.fetch;
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout,
    maxRetries,
    defaultHeaders,
    ...(runtimeOptions || {}),
    // После spread переопределяем `fetch`, чтобы наш correlation wrapper оборачивал
    // fetch с поддержкой прокси (или globalThis.fetch, если прокси нет).
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` сам по себе не меняется.

#### Интеграционная точка 2: `provider/dashscope.ts` (override)

В `buildClient()` та же композиция (он и так переопределяет `buildClient`). `buildHeaders()` не трогаем.

#### Интеграционная точка 3: `geminiContentGenerator/index.ts` (фабрика, НЕ конструктор)

**Исправление предыдущей избыточной спецификации**: сигнатуру конструктора `geminiContentGenerator.ts` **менять не нужно**. Фабричная функция в `index.ts:48` уже принимает `gcConfig: Config` (строка 33 уже использует `gcConfig?.getUsageStatisticsEnabled()`), нужно лишь в фабрике подмешать статические заголовки correlation в `httpOptions.headers`:

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... существующий x-gemini-api-privileged-user-id ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← добавлено
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) без изменений
```

Никаких изменений сигнатуры.

#### Интеграционная точка 4: `anthropicContentGenerator.ts`

Anthropic SDK тоже принимает кастомный `fetch` (уже использует `buildRuntimeFetchOptions`). Оборачиваем fetch в пути `buildClient` аналогично OpenAI default.ts. `buildHeaders` не меняем.

#### Цепочка приоритетов

Без изменений: пользовательские `customHeaders` по-прежнему побеждают в merge `defaultHeaders` (см. обсуждение подмены в §8.2). Заголовок `X-Qwen-Code-Session-Id`, внедряемый fetch wrapper, добавляется в финальный объект `Headers` **после** списка заголовков SDK — по семантике `Headers.set()` в Node это означает перезапись любого ранее установленного заголовка с тем же именем (включая одноимённый заголовок из пользовательских customHeaders).

**Для OpenAI/Anthropic (путь fetch wrapper)**: correlation > customHeaders > SDK defaults.
**Для Gemini (путь статических заголовков)**: customHeaders > correlation > SDK defaults (следует существующему порядку spread).

Разница в том, что при использовании fetch wrapper подмена становится невозможной (fetch wrapper выполняется после заголовков SDK). Это **побочный результат исправления бага**, а не намеренное ужесточение — но так безопаснее. Нужно явно указать в §8.2.

### 4.4 Влияние на схему конфигурации

~~**Практически нулевое**. Данный дизайн не вводит новых настроек~~ — **R3, исправлено**: добавлена новая настройка `telemetry.sessionIdHeaderHosts: string[]`, позволяющая переопределить белый список хостов first-party по умолчанию. Элемент схемы добавлен в `packages/cli/src/config/settingsSchema.ts`; описание и синтаксис переопределения (`["*"]` для восстановления вещания / `[]` для полного отключения / произвольный массив) — см. §11. Нижеследующее описание применимо только к версии до R3:

- Внедрение `traceparent` включается при включённой телеметрии (существующий toggle).
- Внедрение `X-Qwen-Code-Session-Id` также включается при включённой телеметрии.
- `ignoreRequestHook` для OTLP url уже читается из существующей конфигурации.

Настройки, которые можно добавить в будущем (**вне рамок**):

- `telemetry.outboundCorrelationHeader`: кастомное имя заголовка (по умолчанию `X-Qwen-Code-Session-Id`)
- `telemetry.outboundPropagationDisabled`: глобальное отключение (если LLM-сервис строг к неизвестным заголовкам)
- ~~переключение области действия заголовка по назначению~~ — **R3 уже реализовано**, см. §11

## 5. Список изменений файлов

| Файл                                                                           | Тип изменения | Описание                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                    | Добавление зависимости | `@opentelemetry/instrumentation-undici`                                                                                                                         |
| `packages/core/src/telemetry/sdk.ts`                                            | Изменение     | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                  |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | Новый файл    | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (запасной вариант для Gemini)                                                                |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | Изменение     | В `buildClient()` в `new OpenAI({...})` добавлено `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)`                                                             |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | Изменение     | Аналогично (переопределение `buildClient`)                                                                                                                                  |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | Изменение     | В фабричной функции подмешивание `staticCorrelationHeaders(gcConfig)` в `httpOptions.headers` (**у вызывающего уже есть Config, ноль изменений сигнатуры** — исправление предыдущей избыточной спецификации) |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | Изменение     | В пути `buildClient` использование `wrapFetchWithCorrelation` для обёртки опции `fetch` SDK                                                                                       |
**Явно аудировано, но изменений не требуется** (чтобы избежать подозрений в пропуске paths со стороны ревьювера):

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator`, использует `DashScopeOpenAICompatibleProvider`, **автоматически наследует изменения buildClient из dashscope.ts**. Все потоки Qwen OAuth также выигрывают.
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — паттерн wrapper, не создаёт SDK client (оборачивает другой contentGenerator для telemetry logging), изменений не требуется.
- `packages/core/src/core/contentGenerator.ts` — фабричный вход, не содержит client.
  | `packages/core/src/telemetry/sdk.test.ts` | изменение | добавлена регистрация undici instrumentation + тест ignoreRequestHook |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | новый файл | модульные тесты поведения telemetry-on/off + проверка чтения sessionId для каждого запроса (critical: после сброса session обёрнутый fetch читает новый id) |
  | `*.test.ts` каждого провайдера | изменение | утверждения, что при конструировании SDK опция `fetch` является обёрнутой версией (OpenAI/Anthropic); утверждения, что при конструировании Gemini `httpOptions.headers` содержит `X-Qwen-Code-Session-Id` |
  | `docs/developers/development/telemetry.md` | изменение | добавлен раздел "Trace context & session correlation propagation" |
  | `docs/design/telemetry-outbound-propagation-design.md` | данный файл | проектный документ |

## 6. Разбиение на PR

Для удобства ревью разбиваем на два PR (можно и объединить, если объём позволяет):

### PR 1 — Автоматическое внедрение `traceparent` (structural)

- Добавить зависимость `@opentelemetry/instrumentation-undici`
- В `sdk.ts` добавить `UndiciInstrumentation` + `ignoreRequestHook`
- Тесты: регистрация SDK, OTLP endpoint не трейсится
- Фрагмент документации

**Риск**: низкий. Аддитивное. Добавленные client span — это чистый выигрыш, не изменяют существующую структуру span.

### PR 2 — Заголовок `X-Qwen-Code-Session-Id` (с использованием helper-функции)

- Новый файл `llm-correlation-headers.ts`
- Интеграция в 4 провайдера
- Тесты: каждый провайдер проверяет наличие заголовка; при выключенной телеметрии заголовок не отправляется
- Фрагмент документации

**Риск**: низкий–средний. Следует быть осторожным с расширением сигнатуры конструктора `geminiContentGenerator`, так как это может затронуть вызывающий код.

### PR 3 (опционально) — Документация + E2E проверка

- Доработать раздел в `telemetry.md`
- Добавить скрипт E2E проверки (по образцу `/tmp/verify-telemetry-pr-4367.mjs`): реальный fetch + захват заголовков

Можно также объединить с PR 2.

### Предпочтительный порядок

PR 1 и PR 2 технически **независимы** — не имеют общего кода. Но **рекомендуется сначала смержить PR 1**:

- `traceparent` — это **стандартный** заголовок OTel, любой OTel-aware collector / бэкенд сразу его распознаёт → пользователь получает пользу немедленно
- `X-Qwen-Code-Session-Id` — это **продуктовый кастомный** заголовок, для ценности требуется настройка бэкенда → польза отложена
- Если PR 2 задержится на ревью, PR 1 уже обеспечит сквозной трейсинг между процессами
- PR 1 является аддитивным структурным изменением (низкий риск), подходит для первого шага, чтобы завоевать доверие

## 7. План тестирования

### 7.1 Модульные тесты `sdk.ts`

- ✅ `UndiciInstrumentation` присутствует в `instrumentations` объекта `NodeSDK`
- ✅ `ignoreRequestHook` возвращает `true` для `https://collector:4318/v1/traces`
- ✅ `ignoreRequestHook` возвращает `false` для `https://dashscope.aliyuncs.com/...`
- ✅ Корректное сопоставление как с конечным слэшом, так и без него

### 7.2 Модульные тесты `llm-correlation-fetch.ts`

**`wrapFetchWithCorrelation`**:

| Сценарий                                                        | Ожидаемый результат                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                               | Обёрнутый fetch = baseFetch (без добавления каких-либо заголовков)                                                |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"         | Обёрнутый fetch добавляет в `init.headers` заголовок `X-Qwen-Code-Session-Id: abc-123`                            |
| В `init.headers` уже есть `X-Qwen-Code-Session-Id: spoof`       | После обёртки заменяется на настоящий sessionId (путь через wrapper fetch не допускает подмену, §8.1)              |
| **После сброса session обёрнутый fetch вызывается снова**       | **Читает новый sessionId** (защита от регрессии устаревшего значения)                                             |
| baseFetch отклоняет промис                                       | Обёртка прозрачно передаёт отклонение, не подавляя его                                                             |

**`staticCorrelationHeaders`** (путь Gemini):

| Сценарий                                                        | Ожидаемый возврат                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                               | `{}`                                                                |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"         | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                           |
| sessionId содержит unicode (`會話-1`)                            | Возвращается как есть — кодировкой HTTP-заголовка занимается SDK    |
| sessionId — пустая строка                                       | `{ 'X-Qwen-Code-Session-Id': '' }` — бизнес-инвариант, не проверяется на этом уровне |

### 7.3 Интеграционные тесты для каждого провайдера

В тесты `buildHeaders()` / конструктора каждого провайдера добавляем:

```ts
it('включает X-Qwen-Code-Session-Id, когда телеметрия включена', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('опускает X-Qwen-Code-Session-Id, когда телеметрия выключена', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 E2E верификация (tmux + локальный HTTP-сервер)

⚠️ **Не** используйте mock для `globalThis.fetch` для захвата заголовков: `UndiciInstrumentation` подключается через diagnostics channel undici, а monkey-patching `globalThis.fetch` может полностью обойти инструментирование (в зависимости от порядка патча), что не позволит проверить внедрение `traceparent`. **Правильный подход — поднять локальный HTTP-сервер**, чтобы SDK действительно отправлял запросы, а сервер записывал полученные заголовки.
Вот перевод вашего текста на русский язык в соответствии с заданными правилами:

Напишите скрипт, аналогичный `/tmp/verify-telemetry-pr-4367.mjs`:

1.  `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` — запустить локальный сервер
2.  Включить telemetry + outfile + направить `baseURL` OpenAI SDK на `http://127.0.0.1:<port>` (или использовать mock-провайдер, чтобы SDK реально выполнял fetch)
3.  Вызвать `client.chat.completions.create(...)` (нужно минимальный разбираемый mock-ответ, иначе SDK выбросит ошибку парсинга — локальный сервер возвращает легальный, но пустой ответ OpenAI)
4.  Утверждать, что `capturedHeaders[0]` содержит `traceparent: 00-...` и `X-Qwen-Code-Session-Id: <sessionId>`
5.  Запустить ещё один mock-коллектор OTLP на другом порту, проверить, что OTLP-отправка **не** вызывает вставку `traceparent` (проверка `ignoreRequestHook`)
6.  **Дополнительно: проверка устаревания** — выполнить request 1 → вызвать `config.resetSession(...)` → выполнить request 2 → утверждать, что `X-Qwen-Code-Session-Id` в request 2 — это новый session id (**ключевой регрессионный тест для #1 fix**)

### 7.5 Регрессионная защита

- Fetch для streaming chat completion (с `stream: true`) по-прежнему корректно закрывается — у `UndiciInstrumentation` исторически были баги с жизненным циклом span для streaming-ответов, **при реализации необходимо запустить реальный streaming completion end-to-end, чтобы проверить, что client span нормально завершается, нет утечки span, поток не обрезается**; не предполагать, что конкретная версия уже исправлена.
- Режим прокси (`ProxyAgent`) вместе с инструментированием — `ignoreRequestHook` всё равно работает по совпадению строки endpoint, прокси не влияет.
- Повторные попытки (`maxRetries`): каждая повторная попытка получает отдельный client span, но все они разделяют один и тот же `traceparent` parent (в идеале retry — это несколько child span под одним родительским span — это поведение определяется SDK, настоящий дизайн не принуждает).

## 8. Границы / краевые случаи

### 8.1 Несогласованное поведение переопределения customHeaders и подмены (spoofing)

Поведение подмены (spoofing) на разных путях провайдеров **различается** (следствие дизайна, не преднамеренное ужесточение):

| Путь провайдера                            | Возможна подмена? | Причина                                                                                                                                                     |
| ------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic (путь fetch-обёртки)    | ❌ Невозможно     | fetch-обёртка устанавливает `headers.set('X-Qwen-Code-Session-Id', ...)` после списка заголовков SDK, перезаписывая одноимённый customHeaders пользователя |
| Gemini (путь статических headers)          | ✅ Возможно       | Порядок слияния `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }` — `customHeaders` побеждают последними                                       |

`claude-code` также использует путь fetch-обёртки, поведение совпадает с OpenAI/Anthropic (подмена невозможна). Это побочный результат исправления бага устаревания, а не изначальная задача.

**Не планируется "выравнивать" два пути** — поведение пути Gemini обусловлено ограничением SDK (отсутствие хука `fetch`), и снижать OpenAI до статического пути неразумно.

Подмена session id не является реальной угрозой (пользователь контролирует локальную среду, может напрямую изменить исходный код). В документации нужно явно указать это различие, чтобы рецензенты не сомневались в приоритете customHeaders, если путь fetch-обёртки не позволяет подмену.

### 8.2 Два типа граничных случаев для URL-сопоставления OTLP-коллектора

#### (a) Auth token в URL

Если OTLP-endpoint пользователя имеет вид `https://collector/path?token=secret`, то `ignoreRequestHook` с `url.startsWith(e)` будет сравнивать с учётом строки запроса. Но `request.path`, предоставляемый undici, указывает только на путь (без строки запроса), поэтому при сравнении `e` тоже используется только часть пути. Для безопасности удаляем строку запроса:

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) Теоретический ложноположительный результат startsWith через границу hostname

Если `e = "http://collector"` (без порта), то пришедший URL `http://collector-fake/v1/traces` будет ложно сопоставлен через startsWith.

**Вероятность реального срабатывания крайне низка**:

- OTLP-endpoint почти всегда содержит порт (4317 gRPC / 4318 HTTP), после `http://collector:4318` такое расширение как `-fake` невозможно (после порта идёт `/`).
- Если пользователь указал endpoint без порта — это ошибка конфигурации, SDK и так должен использовать fallback по умолчанию.

**Если нужно усилить**: разобрать URL на origin + path и сравнивать их отдельно, не используя сырой startsWith:

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

В текущей версии не делаем — издержки не оправданы, ложное срабатывание практически невозможно.

### 8.3 Режим Vertex AI для Gemini

`@google/genai` поддерживает режим `vertexai: true` (использует учётные данные GCP и направляет запросы на Vertex endpoint, а не на generative ai endpoint). Оба режима используют fetch, поэтому инструментирование покрывает их. `httpOptions.headers` работает в обоих режимах.

### 8.4 Логика `defaultHeaders` в Anthropic SDK

`anthropicContentGenerator.ts:177` уже вызывает `buildHeaders()`, а затем передаёт результат в `new Anthropic({ defaultHeaders })`. Но проблема устаревания применима и здесь — настоящий дизайн использует путь fetch-обёртки (как и для OpenAI).

### 8.5 Trailer-заголовки между SDK и fetch

`openai` SDK при потоковой передаче может использовать `Transfer-Encoding: chunked` и trailer-заголовки. Это не влияет на вставку `traceparent` / `X-Qwen-Code-Session-Id` во время запроса — все они являются заголовками запроса и записываются однократно при отправке.

### 8.6 ⚠️ Известное ограничение: session id в Gemini остаётся устаревшим после `/clear`

Поскольку SDK `@google/genai` не поддерживает хук `fetch` (интерфейс `HttpOptions` содержит только `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`), провайдер Gemini использует статический путь `httpOptions.headers` — session id захватывается при конструировании SDK и **не обновляется** после сброса сессии через `/clear`.

**Фактическая область влияния**:

- Пользователь запускает qwen-code → `/clear` → использует модель Gemini → в проводе `X-Qwen-Code-Session-Id` — это старый session id.
- Корреляция на бэкенде нарушается (trace id и логи уже переключились на новую сессию, но wire-заголовок отстаёт).

**Почему не исправляется** (в текущей версии):

- Путь OpenAI / Anthropic **не содержит этой ошибки** (fetch-обёртка читает session id при каждом запросе).
- У исправления для Gemini есть несколько вариантов, все выходят за рамки текущей версии (см. ниже).

**Варианты будущего исправления** (в порядке рекомендации):

| Вариант                                           | Описание                                                                                | Затраты                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **A. Ленивая инвалидация** ★ рекомендовано        | При сбросе сессии только пометить contentGenerator как грязный, при следующем вызове LLM лениво пересоздать | Небольшие: ~10 строк в `resetSession` + точка входа вызова LLM; синхронный API, без вторжений |
| B. Немедленное пересоздание                       | При сбросе сессии сразу `await createContentGenerator(...)`, требуется асинхронизация `resetSession` | Средние: изменения API каскадно затрагивают несколько мест                                    |
| C. Прокси-объект для headers                      | Обернуть `httpOptions.headers` в Proxy, перехватывающий геттер                          | Высокий риск: неизвестно, перечитывает ли `@google/genai` заголовки при каждом запросе; поведение может незаметно сломаться |
| D. Продвижение опции `fetch` в `@google/genai`    | Отправить PR в google-deepmind/generative-ai-js                                         | Долгосрочно; неконтролируемо                                                                  |
## 9. Сравнение с claude-code

| Измерение                         | claude-code                                                                                                                                          | qwen-code (данный дизайн)                                                                                                                                                              | Обоснование                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Именование заголовка Session id   | `X-Claude-Code-Session-Id` (префикс продукта)                                                                                                        | `X-Qwen-Code-Session-Id` (префикс продукта)                                                                                                                                            | ✅ Та же стратегия пространства имён                                                                                                 |
| Механизм инъекции Session id      | SDK `defaultHeaders` (`client.ts:108`) + кастомная обёртка `buildFetch()` (`client.ts:370-390`, per-request `randomUUID()` инъекция `x-client-request-id`)  | OpenAI/Anthropic через fetch-обёртку (per-request чтение session id, избегает устаревания при `/clear`); Gemini через статичные `httpOptions.headers` (ограничения SDK)               | Выравнивание с fetch-обёрткой claude-code. Claude-code также использует fetch-обёртку для per-request добавления `x-client-request-id`. |
| Персистентность Session id        | У claude-code нет сброса сессии через `/clear`; session = процесс                                                                                    | Есть сброс через `/clear` → fetch-обёртка автоматически подхватывает; статичный путь устаревает (§8.6)                                                                                | Уникальная сложность qwen-code                                                                                                          |
| Кодирование Session id             | HTTP-заголовок (не baggage)                                                                                                                          | HTTP-заголовок                                                                                                                                                                        | ✅ То же самое — удобно для бэкенда                                                                                                   |
| Инъекция `traceparent`            | Закрытый исходный код; публичная документация описывает наличие; в открытом репозитории нет ссылок на `propagation.inject` / `UndiciInstrumentation`  | `@opentelemetry/instrumentation-undici` автоматически                                                                                                                                  | Как это реализовано в claude-code — не видно. Мы выбираем официальный рекомендованный OTel путь, он легче.                           |
| Диапазон отправки `traceparent`   | Только собственное API Anthropic; не отправляет в Bedrock/Vertex/Foundry                                                                            | Отправляется во все исходящие fetch (стандарт W3C; trace id — хеш `sha256(sessionId)`). **Редакция R3**: заголовок session id отправляется только по белому списку first-party (Alibaba/DashScope), сторонним серверам по умолчанию не отправляется. См. §11 | После R3 семантика session header в qwen-code такая же first-party-only, как в claude-code; `traceparent` требует отдельного переключателя на точку назначения (follow-up) |
| `x-client-request-id` (случайный) | Есть, автоматически                                                                                                                                 | Пока не делаем (отдельный follow-up sub-issue с большей ценностью)                                                                                                                     | Контроль объёма                                                                                                                       |
| Переменная окружения `TRACEPARENT` в дочерних процессах | Документация признаёт существование (реализация закрыта)                                                                                             | Не делаем (отдельный follow-up)                                                                                                                                                     | Контроль объёма                                                                                                                       |
| Чтение входящего `TRACEPARENT`    | Документация признаёт существование (режим `-p` / Agent SDK)                                                                                         | Не делаем (отдельный follow-up)                                                                                                                                                     | Контроль объёма                                                                                                                       |
## Примечания к `verified vs documented`:

| Утверждение                                                                 | Статус проверки                                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` через `defaultHeaders`                          | ✅ Open source `src/services/api/client.ts:108` — прочитано                                                                                        |
| `x-client-request-id` через fetch-обёртку                                    | ✅ Open source `src/services/api/client.ts:370-390` — прочитано                                                                                   |
| Внедрение `traceparent`                                                     | ⚠️ Упоминается только в docs.claude.com/docs/en/monitoring-usage.md; поиск в open source репозитории `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` не дал результатов |

## 10. Будущие работы

Зафиксировано под #3731 P3, не входит в данный проект **но** связано с ним:

- **`X-Qwen-Code-Request-Id`** — случайный UUID на запрос (аналог claude-code: `x-client-request-id`). Полезен для корреляции при тайм-аутах / ошибках — сервер может ещё не назначить request id, а отправленный клиентом id — единственное средство связи. После R3 это предложение стало более осмысленным: UUID на запрос не несёт риска «профилирования поведения между запросами» и может использоваться как «заголовок поддержки/отладки, отправляемый всем LLM-провайдерам».
- **Per-destination scope toggle для `traceparent`** — R3 обработал только область действия заголовка сессионного id; `traceparent` по-прежнему внедряется во все исходящие fetch-запросы. Можно добавить `telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'`, используя тот же список разрешённых хостов, что и в §11.
- **Ленивая инвалидация устаревшего session id для Gemini (fix), вариант A из §8.6**: при `/clear` помечать contentGenerator как грязный, при следующем вызове LLM — лениво пересоздавать. Так путь Gemini тоже получит «живость» fetch-обёртки.
- **Переменная окружения `TRACEPARENT` в дочерних процессах**: внедрять env в дочерние процессы, запускаемые `BashTool`, чтобы внешние инструменты могли продолжить трассировку. Требует отдельного рассмотрения жизненного цикла tool.
- **Входящий `TRACEPARENT`**: при запуске в режиме `--prompt` читать env, чтобы CI / внешние оркестраторы могли включить qwen-code в более широкую трассировку.
- **Настраиваемое имя `correlationHeader`**: позволить корпоративным ops настраивать заголовок (по умолчанию `X-Qwen-Code-Session-Id`).
- **Стратегия распространения `baggage`**: стоит ли активно устанавливать baggage, чтобы `user.id` / `tenant.id` и другие передавались в baggage до downstream. В этом выпуске не делаем, ждём прояснения требований.

## 11. R3 — Ограничение `X-Qwen-Code-Session-Id` по списку доверенных хостов

> Триггер: [REQUEST_CHANGES от LaZzyMan в PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Коммиты реализации: `1c8528a56` (ядро) + `cb162e716` (Vertex baseUrl fail-closed + `["*"]` trim fault tolerance)

### 11.1 Триггер и обоснование

В дизайне R1 заголовок `X-Qwen-Code-Session-Id` внедрялся во **все** исходящие LLM-запросы, управляясь только `telemetry.enabled`. LaZzyMan в review указал на три последовательные проблемы:

1. **Неверная маркировка**: `feat(telemetry):` + путь `telemetry/` + шлюз `getTelemetryEnabled()` позволяют пользователю обоснованно считать, что «собственные данные observability направляются в собственный collector». Но `X-Qwen-Code-Session-Id` не попадает в OTLP-бэкенд; он идёт в запросах к LLM API для DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral. Два разных решения о направлении данных привязаны к одному переключателю.

2. **Аналогия с claude-code несостоятельна**: В §9 R1 «выровнял» политику пространства имён и шаблон fetch-обёртки под claude-code. Но claude-code — это Anthropic → Anthropic (один вендор, одно направление), тогда как qwen-code — это open source CLI → множество сторонних провайдеров. «Стабильный межзапросный UUID, передаваемый всем третьим лицам» — вопрос, на который R1 не дал прямого ответа.

3. **`traceparent` — ещё один канал для той же метки**: trace id = `sha256(sessionId).slice(0, 32)` — для получателя это всё равно стабильный per-session идентификатор (хэш необратим, но в рамках одной сессии стабилен).

LaZzyMan оценил серьёзность: session id `высокая` / traceparent `средняя`.

### 11.2 Краткое описание решения

**Сузить действие по умолчанию до first-party хостов**. Добавляется новая настройка:

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // восстановить поведение R1 — всем
  "sessionIdHeaderHosts": []                              // полностью отключить заголовок
  "sessionIdHeaderHosts": ["api.mycompany.com",
                           "*.gateway.mycompany.internal"]
}
```

Значение по умолчанию (из `packages/core/src/telemetry/trusted-llm-hosts.ts:DEFAULT_SESSION_ID_HEADER_HOSTS`):

```
dashscope.aliyuncs.com
dashscope-intl.aliyuncs.com
*.dashscope.aliyuncs.com
*.dashscope-intl.aliyuncs.com
*.alibaba-inc.com
*.aliyun-inc.com
```

Семантика этого набора: «LLM-провайдер, бэкенд ARMS Tracing, то же юридическое лицо, что и дистрибутив qwen-code» — то есть аналог single-vendor / single-direction отношения claude-code в qwen-code. Сторонние провайдеры (OpenAI / Anthropic / OpenRouter и т.д.) **не** получают заголовок по умолчанию.

### 11.3 Синтаксис шаблонов (intentionally tiny)

`matchesTrustedHost(hostname, patterns)` поддерживает только два вида шаблонов, в соответствии с `DashScopeOpenAICompatibleProvider.isDashScopeProvider`:

- голое имя хоста → точное совпадение (регистронезависимо)
- `*.suffix` → совпадает с `suffix` **и** любым субдоменом; точка фиксирована, что исключает `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld` и другие векторы атак через опечатку суффикса

Регулярные выражения, glob с учётом порта/схемы не вводятся — строки в настройках означают ровно то, что написано.

### 11.4 Отличия реализации от R1

#### `wrapFetchWithCorrelation` (OpenAI / Anthropic)

В R1 обёртка имела только два шлюза: telemetry-enabled + sessionId. В R3 между ними добавляется третий шлюз:

```ts
const trustedHosts =
  config.getTelemetrySessionIdHeaderHosts?.() ??
  DEFAULT_SESSION_ID_HEADER_HOSTS;
const broadcastAll = trustedHosts.some((p) => p.trim() === '*');

return async function correlationFetch(input, init) {
  if (!config.getTelemetryEnabled()) return baseFetch(input, init);
  if (!broadcastAll) {
    const host = extractRequestHost(input);
    if (!host || !matchesTrustedHost(host, trustedHosts)) {
      return baseFetch(input, init); // шлюз по хосту
    }
  }
  const sid = config.getSessionId();
  if (!sid) return baseFetch(input, init);
  // ... внедрение заголовка
};
```
`trustedHosts` при обёртывании снимается единовременным снимком (в отличие от «чтения в реальном времени для каждого запроса» идентификатора сессии). Изменение `telemetry.sessionIdHeaderHosts` в процессе работы требует пересоздания contentGenerator, чтобы изменения вступили в силу. Записи вида `[" * "]` с пробелами обрабатываются через `.trim()` с понижением до broadcast, чтобы избежать молчаливой деградации из-за опечаток в settings.json.

#### `staticCorrelationHeaders` (Gemini)

Добавлен параметр `destinationUrl?: string`:

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: не знаем назначения — не отправляем
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Интеграция с фабрикой Gemini

SDK Gemini имеет две неявные конечные точки по умолчанию (`generativelanguage.googleapis.com` и `{region}-aiplatform.googleapis.com`, выбираемые флагом `vertexai`); фабричный слой не может точно восстановить ни одну из них. R3 выбирает подход: если `config.baseUrl` не задан, передаётся `undefined`, и хелпер по принципу fail-closed → не отправляет заголовок. Операторам, желающим получить корреляцию, необходимо явно указать `baseUrl` (тот же вход, который SDK использует для определения назначения). Это изменение предотвращает ошибочное попадание в разрешённый список для Vertex destination при неверном предположении.

### 11.5 Новые файлы / новый код

| Файл                                                                 | Описание                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (НОВЫЙ)           | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                   |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (НОВЫЙ)      | Модульные тесты, включая TLD-suffix атаки, IPv6 fail-closed, извлечение port/userinfo/query       |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`               | Добавлен host gate; `staticCorrelationHeaders` получил параметр `destinationUrl`                   |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`          | Добавлены 8 случаев host-gate; `mockConfig` использует `'hosts' in opts` для разделения "default allowlist" и "broadcast" |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`) | Проброс `sessionIdHeaderHosts`                                                                    |
| `packages/core/src/config/config.ts`                                 | `TelemetrySettings.sessionIdHeaderHosts` + геттер `getTelemetrySessionIdHeaderHosts()`            |
| `packages/core/src/core/geminiContentGenerator/index.ts`             | Передача `config.baseUrl` в хелпер; fail-closed при undefined                                     |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`        | Переписан тест telemetry-on для Gemini под новую семантику fail-closed                            |
| `packages/cli/src/config/settingsSchema.ts`                          | Точка входа JSON schema для `sessionIdHeaderHosts`                                                |
| `packages/vscode-ide-companion/schemas/settings.schema.json`         | Перегенерирован командой `npm run generate:settings-schema`                                       |
| `docs/developers/development/telemetry.md`                           | Переписан раздел "Session correlation header" + область по умолчанию + синтаксис переопределения   |

### 11.6 Ответы на аргументы LaZzyMan

| Аргумент LaZzyMan                         | Ответ R3                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① Неверная привязка телеметрии            | **Снято**: в сценарии DashScope заголовок идентификатора сессии буквально отправляется в бэкенд ARMS Tracing (одно юридическое лицо), семантика `telemetry.enabled` согласована    |
| ② Cross-vendor stable identifier broadcast | **Снято**: список разрешённых по умолчанию содержит только хосты первой стороны Alibaba; broadcast понижен до opt-in (`["*"]`)                                                       |
| ③ traceparent как ещё один канал того же отпечатка | **Отложено**: traceparent по-прежнему внедряется везде, как в R1. Обоснование: стандарт W3C, trace id — это SHA-256 хэш, продолжение внутривендорного trace — ключевой сценарий W3C. Переключатель traceparent для каждого назначения перенесён в §10 future work |

### 11.7 Известные остатки + дальнейшие шаги

- **traceparent scope** — см. пункт ③ выше, перенесён в §10
- **Per-request random UUID** (`X-Qwen-Code-Request-Id`) — альтернатива, предложенная LaZzyMan, перенесена в §10
- **Gemini staleness lazy-invalidate** (§8.6 вариант A) — не связано с R3, выделено в отдельный под-вопрос
- **Поддержка IPv6 в `matchesTrustedHost`** — в текущей реализации IPv6 destination никогда не попадает в список разрешённых (`URL.hostname` возвращает `[::1]` с квадратными скобками, синтаксис pattern не поддерживает такую форму). Текущая реализация покрывает сценарий «именованные first-party endpoints». Если в будущем потребуется поддержка raw IP allowlist, функционал будет расширен.

## 12. R4 — Исправление: разделение conflated scope

> Триггер: [LaZzyMan round-8 follow-up review на PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Реализация: текущий PR сужает область; весь набор session-id из R3 перенесён в отдельный follow-up PR

### 12.1 Триггер и обоснование

R3 снял опасения LaZzyMan из первого раунда ревью относительно «трансляции стабильного отпечатка стороннему провайдеру» (severity: high). Однако в follow-up round-8 он поднял возражение на более глубоком архитектурном уровне:

> «Телеметрия — не контейнер для смежных функций. Распространение `traceparent` между процессами и внедрение заголовка `X-Qwen-Code-Session-Id` — это **не телеметрия**. Это работа по исходящей идентификации / исходящей корреляции, которая использует некоторые OTel API внутри как деталь реализации.»
Его основные мета-аргументы:

- Пространство имен `telemetry` подразумевает, что получатель = собственный OTLP-коллектор пользователя
- Но `traceparent` и `X-Qwen-Code-Session-Id` получают = **сторонний LLM-провайдер**
- Два разных типа получателей должны иметь два разных дерева решений о согласии
- Даже если поведение по умолчанию безопасно (R3 уже реализовано), размещение поведения на уровне провода под `telemetry.*` **создает плохой прецедент**: будущие PR по телеметрии смогут продолжать протаскивать поведение на уровне провода третьим сторонам
- "Если мы принимаем этот принцип, разделение является механическим. Если нет — этот PR не то место, где это нужно обсуждать, потому что технические исправления уже внесены."

### 12.2 Краткое описание решения («Вариант C» — гибридное разделение)

После нескольких внутренних обсуждений (включая альтернативу с шаблоном customHeader, предложенную yiliang, было окончательно решено, что customHeader не может нести динамические значения времени выполнения), выбрали **Вариант C**:

**В этом PR остается**:

- Регистрация `UndiciInstrumentation` (создает client HTTP span → собственный OTLP-коллектор пользователя)
- Защита от обратной связи OTLP (необходимый побочный эффект предыдущего)
- **Установка по умолчанию `NoopTextMapPropagator`** → `propagation.inject()` является no-op → в исходящих `fetch`-запросах **больше нет `traceparent`**
- **Добавлен `outboundCorrelation.propagateTraceContext: bool` (по умолчанию false)** как настройка верхнего уровня в независимом пространстве имен; при значении true устанавливается стандартный композитный propagator W3C
- **Весь код R3 для `session-id` (`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / настройка `telemetry.sessionIdHeaderHosts` / 4 точки интеграции провайдеров / все связанные тесты) полностью удален**

**Перенесено в follow-up PR**:

- Полная инфраструктура заголовка `X-Qwen-Code-Session-Id` (повторно использует реализацию R3)
- Переходит в новое пространство имен `outboundCorrelation.*` (конкретный ключ настройки TBD, но **не будет называться `telemetry.*`**)
- Follow-up PR будет содержать: раздел threat model, отдельный обзор, документацию с пометкой security-relevant
- `X-Qwen-Code-Request-Id` (per-request UUID, альтернативный дизайн, предложенный LazzyMan в раунде R3) также рассматривается в этом follow-up

### 12.3 Соответствие аргументам R1/R3

| Аргумент R1/R3                                          | Состояние после R4                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| §3.1 "Все исходящие LLM-запросы содержат traceparent"   | ❌ **R4: отключено по умолчанию**; включается только при `outboundCorrelation.propagateTraceContext: true`       |
| §3.1 "Все исходящие LLM-запросы содержат `X-Qwen-Code-Session-Id`" | ❌ **R4: полностью удалено из этого PR**, перенесено в follow-up PR                              |
| §4.3 fetch wrapper внедряет session id                  | ❌ Весь код не в этом PR; будет повторно использован в follow-up PR                                             |
| §11 белый список хостов (дизайн R3)                     | ❌ То же самое; весь переехал в follow-up PR                                                                     |
| §4.4 Не вводить новых настроек                          | ❌ **В этом PR добавлена одна boolean-настройка `outboundCorrelation.propagateTraceContext`**; настройки session id в follow-up PR |
| §10 future work "`X-Qwen-Code-Request-Id`"              | ✅ Остается future work; проектируется вместе с follow-up session-id                                            |

### 12.4 Замысел нового пространства имен

Верхнеуровневое пространство имен `outboundCorrelation.*` в этом PR содержит только один boolean (`propagateTraceContext`), что может показаться избыточно структурированным. Но это **продуманный выбор**:

- **Создание пространства имен как обязательства**: чтобы последующие session-id / request-id / etc. естественным образом попадали в это пространство имен
- **Пометка как security-relevant**: в `settingsSchema.ts` описание явно содержит "SECURITY-RELEVANT", документируется как "настройка безопасности", а не "настройка observability"
- **Все значения по умолчанию выключены**: соответствует принципу LazzyMan "клиент с открытым исходным кодом не должен отправлять стабильные идентификаторы третьим сторонам без явного согласия"
- **Развязка с `telemetry.*`**: пользователь, читая settings.json, видит `outboundCorrelation.*` и сразу понимает, что это поведение исходящего провода, а не observability

#### Неявная зависимость: `telemetry.enabled`

Хотя пространство имен развязано с `telemetry.*`, **для работы во время выполнения все равно требуется `telemetry.enabled: true`** — OTel SDK инициализируется только при включенной телеметрии; без SDK нет установки propagator, нет вызовов `propagation.inject()`, и флаг просто молча превращается в no-op. Легкая ловушка: оператор ставит `propagateTraceContext: true`, но забывает включить телеметрию, на сервере trap не видно ни одного `traceparent`, ошибок/предупреждений нет.

Оба пользовательских интерфейса явно помечают эту зависимость:

- В `telemetry.md` у раздела `propagateTraceContext` прилагается полный пример JSON с двумя флагами
- В `settingsSchema.ts` **первая строка** description: "Requires `telemetry.enabled: true`" (размещено в начале, чтобы в UI настроек VS Code при свернутом длинном описании эта фраза была видна)

В будущем, при добавлении session-id header или других `outboundCorrelation.*` настроек, **та же зависимость применима** — они имеют смысл только при включенной телеметрии (поскольку внедряются через OTel instrumentation/SDK). Follow-up PR должен унаследовать этот шаблон предупреждения о ловушке.

### 12.5 Реализация

| Файл                                                                             | Изменения                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | **Удален**                                                                                                                                                                                                                      |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                     | **Удален**                                                                                                                                                                                                                      |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                              | **Удален**                                                                                                                                                                                                                      |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                         | **Удален**                                                                                                                                                                                                                      |
| `packages/core/src/telemetry/sdk.ts`                                            | + `NoopTextMapPropagator`; SDK textMapPropagator определяется по `getOutboundCorrelationPropagateTraceContext()`                                                                                                                |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | Удалена ссылка на `wrapFetchWithCorrelation`                                                                                                                                                                                    |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | То же                                                                                                                                                                                                                           |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | То же                                                                                                                                                                                                                           |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | Удалена ссылка на `staticCorrelationHeaders`                                                                                                                                                                                    |
| `*.test.ts` для 4 провайдеров выше                                              | Удалены тест-кейсы, связанные с session-id                                                                                                                                                                                      |
| `packages/core/src/config/config.ts`                                            | Удалены `TelemetrySettings.sessionIdHeaderHosts`, `getTelemetrySessionIdHeaderHosts`; **добавлены интерфейс `OutboundCorrelationSettings` + поле `outboundCorrelationSettings` + геттер `getOutboundCorrelationPropagateTraceContext()`** |
| `packages/core/src/telemetry/config.ts`                                         | Удалена передача `sessionIdHeaderHosts` в `resolveTelemetrySettings`                                                                                                                                                             |
| `packages/cli/src/config/settingsSchema.ts`                                     | Удалена схема `sessionIdHeaderHosts`; **добавлена схема верхнего уровня `outboundCorrelation`**                                                                                                                                 |
| `packages/cli/src/config/config.ts`                                             | Передача `outboundCorrelation: settings.outboundCorrelation` в `ConfigParameters`                                                                                                                                                |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                    | Перегенерировано через `npm run generate:settings-schema` (обновляется синхронно при изменении описаний)                                                                                                                         |
| `docs/developers/development/telemetry.md`                                      | Переписан раздел "Trace context propagation" → "Client-side HTTP span on outbound fetch"; удален весь раздел "Session correlation header"; добавлен раздел верхнего уровня "Outbound correlation (SECURITY-RELEVANT)" с описанием зависимости от `telemetry.enabled` и примером JSON-конфигурации |
| `docs/design/telemetry-outbound-propagation-design.md`                          | Эта секция + заголовок R4 + указатели на изменения                                                                                                                                                                              |
| `packages/core/src/config/config.test.ts`                                       | **Добавлен describe block `OutboundCorrelation Configuration`** с `it.each` 4 кейсами, фиксирующими безопасность по умолчанию `getOutboundCorrelationPropagateTraceContext` (опущен, `{}`, explicit true, explicit false)       |
### 12.6 Ответ на мета-аргументы LazzyMan

| Аргумент                                                               | Статус после R4                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| "Пространство имён Telemetry подразумевает приёмник собственного коллектора" | ✅ Поведение wire вынесено из `telemetry.*`; новое пространство `outboundCorrelation.*` явно обозначает семантику "исходящий сторонний" |
| "Поведение по умолчанию не должно отправлять идентификаторы третьим лицам без явного согласия" | ✅ `propagateTraceContext` по умолчанию false; последующий PR с session-id также будет по умолчанию выключен |
| "Telemetry PR не должен протаскивать поведение уровня wire"             | ✅ Данный PR больше не добавляет никаких путей кода, где "telemetry управляет поведением wire"; поведение wire теперь единообразно управляется через `outboundCorrelation.*` |
| "Split is mechanical, work isn't wasted"                               | ✅ Код, реализованный в R3, физически удалён из этой ветки, но остаётся в истории git для повторного использования (или cherry-pick) в последующих PR |

### 12.7 План последующего PR (информационно, не входит в данный PR)

Будущий последующий PR должен включать:

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` или аналогичная настройка
- Повторное использование каркаса кода, реализованного в R3: `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS`
- Раздел threat model: набор получателей, окно деанонимизации стабильных идентификаторов, опциональный UUID на запрос
- **По умолчанию выключено** (нет allowlist по умолчанию — строже, чем в R3, соответствует принципам LazzyMan для CLI с открытым исходным кодом)
- Пометка security-relevant + включение в docs/users/configuration/settings.md
