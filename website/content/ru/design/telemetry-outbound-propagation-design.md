```markdown
# Telemetry: Outbound Trace Context & Session ID Header Propagation

> Связанный issue: [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> Родительский issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 более глубокая наблюдаемость)
> Предшествующий PR: #4367 (атрибуты ресурсов — смержен 2026-05-21, коммит `64401e1`)
> Основано на состоянии ветки main репозитория qwen-code от 2026-05-21 + прямой анализ исходного кода claude-code

## История изменений

| Версия | Дата       | Триггер                                        | Краткое содержание                                                                                                                                                                                                                                                                             |
| ------ | ---------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1     | 2026-05-21 | Первый черновик                                | Полное вещание: все исходящие запросы к LLM содержат `X-Qwen-Code-Session-Id` + `traceparent`                                                                                                                                                                                                  |
| R2     | 2026-05-22 | Ревью wenshao R2/R3                            | Безопасность границ: нормализация URL, сопоставление портов, выравнивание кавычек, try/catch для staticCorrelationHeaders, удаление неверного формата host:port                                                                                                                                |
| R3     | 2026-05-23 | LaZzyMan REQUEST_CHANGES                       | **Существенное семантическое изменение**: область действия `X-Qwen-Code-Session-Id` по умолчанию сужена до белого списка first-party (Alibaba/DashScope) хостов. Подробнее в §11                                                                                                               |
| R4     | 2026-05-25 | LaZzyMan round-8 follow-up (смешение области)  | **Область PR значительно сужена**: данный PR сохраняет только клиентский HTTP span + защиту цикла OTLP; `traceparent` по умолчанию выключен (NoopTextMapPropagator); добавлено новое пространство имён верхнего уровня `outboundCorrelation.*` для переключателей безопасности; вся машинерия `X-Qwen-Code-Session-Id` из R3 **удалена из этого PR** и перенесена в отдельный follow-up PR. Подробнее в §12 |

**Важное примечание**: при чтении §3.1 (цели) / §3.2 (не-цели) / §4.3 (дизайн части B) / §4.4 (влияние на схему конфигурации) / §5 (список изменений файлов) / §9 (сравнение с claude-code) / §10 (будущие работы) / §11 (R3 host-allowlist scoping) одновременно обращайтесь к §12 — **изменение R4 делает утверждения R1-R3 о том, что «данный PR одновременно реализует traceparent + session id header», недействительными**: данный PR теперь является только телеметрической наблюдаемостью + независимым переключателем outbound trace-context. Вся работа с outbound correlation header (включая host allowlist из R3) полностью перенесена в отдельный follow-up PR. Код из R3 не потерян, его можно повторно использовать в follow-up PR.

## 1. Предпосылки

PR #4367 решил проблему **атрибутов и кардинальности на передаваемой телеметрии** (оператор может добавлять к span/log/metric такие метки, как `user.id`/`tenant.id`). Но он не затронул одну категорию: **HTTP-заголовки исходящих запросов к LLM**. Сегодня запросы qwen-code к DashScope / OpenAI / Gemini / Anthropic **вообще не содержат никаких cross-process correlation header** — ни W3C `traceparent`, ни session id.

Последствия:

1. Контекст трассировки обрывается на границе процесса qwen-code. Если сервис модели (например, DashScope с подключённым ARMS Tracing) сам имеет инструментацию OTel, его спаны не связаны с трейсами qwen-code, полное дерево трассировки «из конца в конец» отсутствует.
2. Нет session id в проводе. Для связывания метрик/логов qwen-code с серверными логами бэкенду требуется офлайн-сопоставление по trace id или временным меткам, что гораздо сложнее, чем просто прочитать заголовок.
3. Не хватает клиентского HTTP-спана на локальной трассировке. Сегодня можно видеть только общее время выполнения `api.generateContent`, но не сетевой TTFB / размер тела ответа / количество повторных попыток.

## 2. Текущее состояние

### 2.1 Включена только `HttpInstrumentation`

`packages/core/src/telemetry/sdk.ts:330`:

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` перехватывает только встроенные модули Node `http`/`https`, **не** затрагивая `globalThis.fetch` / undici.

### 2.2 Оба SDK для LLM используют fetch / undici

| SDK                                              | Реализация HTTP                                                                                                                          | `HttpInstrumentation` перехватывает? |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `openai@5.11.0`                                  | `globalThis.fetch` (Node 18+ — undici). Доказательство: ошибка `'fetch' is not defined as a global` в `node_modules/openai/internal/shims.mjs` | ❌                                  |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`. Доказательство: вызовы `new Headers()` в `dist/node/index.mjs`                                        | ❌                                  |
| `@anthropic-ai/sdk` (anthropicContentGenerator)   | Также основан на fetch                                                                                                                   | ❌                                  |

### 2.3 Нет ручного распространения в кодовой базе

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ Пусто. Нет вызовов `propagation.inject()`, нет ручной вставки traceparent.

### 2.4 Текущее состояние `defaultHeaders` для каждого провайдера

Семейство OpenAI (использует SDK `openai`):

Все суб-провайдеры OpenAI наследуются от `DefaultOpenAICompatibleProvider`. **Поведение переопределения buildHeaders делится на два типа** (подтверждено grep-аудитом):

| Провайдер  | Файл                    | Поведение `buildHeaders()`                                                                           | Влияние                                        |
| ---------- | ----------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Базовый    | `default.ts:63-74`      | Предоставляет `{ 'User-Agent' }` + customHeaders                                                     | Изменять здесь                                 |
| DashScope  | `dashscope.ts:110-124`  | **`override` без вызова `super`** — возвращает новый объект с `User-Agent` + `X-DashScope-*`          | **Требуется отдельное изменение**, иначе correlation header потерян |
| OpenRouter | `openrouter.ts:20-30`   | `override`, но **сначала `const baseHeaders = super.buildHeaders()`**                                 | Изменение базового класса наследуется автоматически ✅ |
| DeepSeek   | `deepseek.ts`           | Не переопределяет `buildHeaders` (только `buildRequest` / `getDefaultGenerationConfig`)              | Наследуется автоматически ✅                    |
| Minimax    | `minimax.ts`            | То же, что и DeepSeek                                                                                | Наследуется автоматически ✅                    |
| Mistral    | `mistral.ts`            | То же, что и DeepSeek                                                                                | Наследуется автоматически ✅                    |
| ModelScope | `modelscope.ts`         | То же, что и DeepSeek                                                                                | Наследуется автоматически ✅                    |

→ **Для семейства OpenAI нужно затронуть 2 файла**: `default.ts` и `dashscope.ts`. Остальные 5 наследуются автоматически.

Google Gemini:

| Провайдер | Файл                          | Путь вставки заголовка                                               |
| --------- | ----------------------------- | -------------------------------------------------------------------- |
| Gemini    | `geminiContentGenerator.ts:59` | `new GoogleGenAI({ httpOptions: { headers } })` — нативная поддержка SDK |

Anthropic:

| Провайдер | Файл                                                                                                   | Путь вставки заголовка |
| --------- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (аргумент `defaultHeaders` для `new Anthropic`) | `defaultHeaders`       |

**Всего 4 точки создания SDK**, в которые нужно внедрить session id header. Все SDK уже поддерживают `defaultHeaders` / `httpOptions.headers`, обёртка над fetch не требуется.

### 2.5 Существующие конфигурации proxy и fetch

`provider/default.ts:87-89`:

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` при наличии прокси у пользователя возвращает `{ fetch: customFetch }` или аналогичное, что запускает `setGlobalDispatcher(new ProxyAgent(...))` (см. `config.ts:1126-1128`). **Режим глобального диспетчера undici совместим с `UndiciInstrumentation`** — он работает через monkey-patch `globalThis.fetch` и взаимодействует с channel diagnostics undici, не завися от конкретного диспетчера.

## 3. Цели / Не-цели

### 3.1 Цели

- Все исходящие запросы к LLM автоматически содержат W3C-заголовок `traceparent` (стандартный `W3CTraceContextPropagator` из OTel SDK)
- ~~Все~~ исходящие запросы к LLM содержат заголовок `X-Qwen-Code-Session-Id` (пространство имён продукта как у claude-code) — **изменение R3**: по умолчанию внедряется только для first-party (Alibaba/DashScope) хостов, для сторонних провайдеров по умолчанию не отправляется; подробнее в §11
- Автоматическое исключение собственного endpoint OTLP экспортера из трассировки (избежание цикла обратной связи)
- Добавление точного клиентского спана для запросов к LLM (разделение времени сети и времени модели)
- Охват 4 точек создания провайдеров: базовый класс OpenAI, переопределение DashScope, Gemini, Anthropic
- Отсутствие регрессий для streaming запросов / режима прокси / сценариев повторных попыток
- Согласованность с философией дизайна #4367: использование нативных для SDK опций типа `defaultHeaders` — **изменение R1**: из-за проблемы устаревания (staleness) переход на обёртку fetch; **изменение R3**: поверх обёртки fetch дополнительный шлюз по хосту

### 3.2 Не-цели

- **Заголовок `baggage`**: стандартный SDK его поддерживает, но qwen-code не вызывает `propagation.setBaggage()`, поэтому по умолчанию не отправляется. Данный дизайн не включает его активацию.
- **Наследование переменной окружения `TRACEPARENT` для дочерних процессов**: claude-code внедряет `TRACEPARENT` в дочерние процессы Bash/PowerShell. `BashTool` в qwen-code этого не делает. Это отдельный под-issue для последующей реализации.
- **Чтение входящих `TRACEPARENT` / `TRACESTATE`**: claude-code в режиме `-p` и Agent SDK считывают traceparent из окружения для продолжения родительского трейса. qwen-code этого не делает. Отдельный follow-up.
- **`X-Qwen-Code-Request-Id`**: у claude-code есть `x-client-request-id`, полезный для корреляции при тайм-аутах. В этот раз не делаем, можно как следующий под-issue.
- **Пользовательский propagator (B3 / Jaeger / X-Ray)**: стандартного W3C достаточно для 99% сценариев. Можно добавить как будущую опцию конфигурации.
- ~~**Выборное внедрение по endpoint**: claude-code не отправляет traceparent для сторонних endpoint (Bedrock / Vertex); qwen-code не требует различения сторонних провайдеров, достаточно отправлять всем одинаково.~~ — **изменение R3**: это утверждение опровергнуто. Ревью LaZzyMan показало, что qwen-code — это open-source CLI, подключающийся к нескольким сторонним провайдерам (OpenAI / Anthropic / OpenRouter и др.), аналогия с first-party→first-party из claude-code неприменима; заголовок session id необходимо различать по хосту. Подробнее в §11. `traceparent` по-прежнему внедряется везде по дизайну R1 (стандартный заголовок OTel, и trace id — хеш `sha256(sessionId)`), можно добавить как отдельный follow-up переключатель для конкретных направлений (`telemetry.propagateTraceContext`).

## 4. Дизайн

### 4.1 Общая архитектура

```
┌─ процесс qwen-code ─────────────────────────────────────────┐
│                                                              │
│  ┌─ session-tracing.ts ─┐                                   │
│  │ активный контекст span │                                   │
│  └──────┬───────────────┘                                   │
│         │                                                    │
│         ▼                                                    │
│  ┌─ propagation.inject() (вызывается instrumentation undici) ┐│
│  │ записывает `traceparent: 00-<traceId>-<spanId>-01` в заголовки │
│  └───────────────────────────────────────────────────────────┘│
│         │                                                    │
│  ┌──────▼────────────────────────────────────────────────┐   │
│  │   fetch() — undici, инструментировано                  │   │
│  │   создаёт HTTP-спан клиента                            │   │
│  │   внедряет traceparent в заголовки запроса             │   │
│  │   (пропускается через ignoreRequestHook, если endpoint OTLP) │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                    │
│         │   ┌─ defaultHeaders (на конструктор SDK) ───────┐   │
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... } │   │
│         └───┴──────────────────────────────────────────────┘   │
│             │                                                │
└─────────────┼────────────────────────────────────────────────┘
              │
              ▼ исходящий HTTP
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (существующие User-Agent, X-DashScope-*, etc.)
```

Два пути внедрения независимы и не зависят друг от друга:

| Слой                    | Когда внедряется                | Кем внедряется                                               |
| ----------------------- | ------------------------------- | ------------------------------------------------------------ |
| `traceparent`           | При каждом вызове fetch         | Автоматически `UndiciInstrumentation` (из стандартного propagator OTel SDK) |
| `X-Qwen-Code-Session-Id`| Однократно при создании SDK в `defaultHeaders` | Код приложения                                               |

### 4.2 Часть A — `traceparent` через undici instrumentation

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

#### Почему необходим `ignoreRequestHook`

OTel SDK сам использует fetch для POST-отправки данных в OTLP collector. Если не пропускать эти запросы, UndiciInstrumentation будет создавать спан для «запросов отправки данных» → этот новый спан будет снова отправлен → бесконечный цикл / огромный шум. Каждый проект на OTel сталкивался с этой проблемой, документация OTel явно рекомендует такой хук.

#### Пропагатор по умолчанию

При вызове `NodeSDK` без передачи `textMapPropagator` по умолчанию используется `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])`. Явная установка не требуется.

#### Формат `traceparent`

```
traceparent: 00-<32hex traceId>-<16hex spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               версия (фиксированная 00)                     флаги
```

Фиксированные 55 байт, без дополнения.

#### `tracestate` и `baggage`

- `tracestate`: передаётся дальше, если пришёл от вышестоящего; при собственном внедрении не добавляется (поведение OTel SDK).
- `baggage`: появляется только если был вызван `propagation.setBaggage(ctx, ...)`. qwen-code его не вызывает, поэтому не отправляется.

### 4.3 Часть B — `X-Qwen-Code-Session-Id` через обёртку fetch (OpenAI / Anthropic) + статические заголовки (Gemini)

> **Изменение R3**: нижеследующее описание дизайна касается решения проблемы устаревания fetch-обёртки и точек интеграции для 4 провайдеров — они сохраняются. Однако внутри обёртки добавлен шлюз по белому списку хостов, а `staticCorrelationHeaders` получила параметр `destinationUrl`. Актуальный код реализации с шлюзом и белый список по умолчанию см. в §11.

#### Важно: проблема устаревания (staleness) и выбор решения

Наивный подход (прямое включение `getSessionId()` в `defaultHeaders`) содержит **реальную ошибку**:

1. `pipeline.ts:60` при создании contentGenerator однократно выполняет `this.client = this.config.provider.buildClient()`, и `defaultHeaders` клиента SDK захватывают session id на этот момент.
2. `config.ts:1850` сброс сессии (вызывается при `/clear`) обновляет `this.sessionId` и вызывает `refreshSessionContext()`, но **не пересоздаёт contentGenerator**.
3. Последующие вызовы LLM всё ещё используют старый клиент → заголовок в проводе содержит старый session id → корреляция на бэкенде нарушена.

→ Необходимо читать session id **на каждый запрос**, а не фиксировать при создании.

#### Решение

```
                   ┌─ поддержка fetch ─┐  Решение
OpenAI SDK          │     ✅            │  обёртка fetch (чтение sessionId на каждый запрос) ✅
Anthropic SDK       │     ✅            │  обёртка fetch ✅
@google/genai SDK   │     ❌            │  статические httpOptions.headers + принятие устаревания
                   └──────────────────┘
```

Интерфейс `HttpOptions` у `@google/genai` не поддерживает `fetch` (проверено grep-ом `node_modules/@google/genai/dist/genai.d.ts`: доступны только `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`). Поэтому Gemini идёт по пути статических заголовков, что отличается от OpenAI/Anthropic — это **известное ограничение**, см. §8.6.

#### Вспомогательная функция (fetch-обёртка на каждый запрос)

Новый файл `packages/core/src/telemetry/llm-correlation-fetch.ts`:

```ts
import type { Config } from '../config/config.js';

/**
 * Оборачивает реализацию fetch так, чтобы каждый исходящий запрос получал
 * correlation-заголовки (`X-Qwen-Code-Session-Id`) из **текущего** session id,
 * а не из значения, захваченного при создании клиента SDK.
 *
 * Соответствует паттерну claude-code (src/services/api/client.ts:370-390 —
 * `buildFetch()`). Внедрение на каждый запрос необходимо, потому что `/clear`
 * сбрасывает session id в процессе работы; клиенты SDK (и их статические
 * `defaultHeaders`) НЕ пересоздаются при сбросе.
 *
 * Вызывающий отвечает за выбор базового fetch — обычно
 * `runtimeOptions?.fetch ?? globalThis.fetch`, чтобы сохранить прокси-специфичный
 * fetch при использовании ProxyAgent.
 *
 * Если телеметрия отключена, возвращает baseFetch без изменений (correlation
 * заголовок не добавляется, что соответствует позиции приватности из §3.1).
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
      // Защита: пустое значение заголовка отвергается некоторым HTTP middleware.
      // Пропускаем внедрение, а не отправляем `X-Qwen-Code-Session-Id: `.
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Qwen-Code-Session-Id', sid);
    return baseFetch(input, { ...init, headers });
  };
}
```

Вспомогательная функция для SDK, которые могут принимать только статические заголовки (Gemini):

```ts
/**
 * Статические correlation-заголовки. Захватывает session id на момент вызова —
 * **подвержено устареванию**, если SDK хранит эти заголовки в слоте,
 * захваченном при создании (например, `httpOptions.headers` у `@google/genai`).
 * Предпочтительнее использовать `wrapFetchWithCorrelation` везде, где SDK
 * предоставляет хук на fetch.
 */
export function staticCorrelationHeaders(
  config: Config,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  return { 'X-Qwen-Code-Session-Id': config.getSessionId() };
}
```

#### Точка интеграции 1: `provider/default.ts` (базовый класс OpenAI)

Изменение в `buildClient()` — композиция существующего `runtimeOptions.fetch` (прокси) с нашей обёрткой:

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
    // После spread переопределяем `fetch`, чтобы наша correlation-обёртка
    // оборачивала прокси-специфичный fetch (или globalThis.fetch при отсутствии прокси).
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` остаётся без изменений.

#### Точка интеграции 2: `provider/dashscope.ts` (переопределение)

В `buildClient()` аналогичный паттерн композиции (он и так переопределяет buildClient). `buildHeaders()` не трогаем.

#### Точка интеграции 3: `geminiContentGenerator/index.ts` (фабрика, НЕ конструктор)

**Исправление чрезмерных заявлений предыдущего дизайна**: сигнатура конструктора `geminiContentGenerator.ts` **не требует** изменений. Фабричная функция в `index.ts:48` уже принимает `gcConfig: Config` (строка 33 уже использует `gcConfig?.getUsageStatisticsEnabled()`), нужно только в фабрике объединить статические correlation-заголовки с `httpOptions.headers`:

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

Изменений сигнатуры ноль.

#### Точка интеграции 4: `anthropicContentGenerator.ts`

Anthropic SDK также принимает кастомный `fetch` (уже использует `buildRuntimeFetchOptions`). Оборачиваем fetch в пути `buildClient` аналогично OpenAI default.ts. `buildHeaders` не меняется.

#### Цепочка приоритетов

Без изменений: пользовательские `customHeaders` в слиянии `defaultHeaders` по-прежнему имеют приоритет (см. обсуждение спуфинга в §8.2). `X-Qwen-Code-Session-Id`, внедрённый через fetch-обёртку, добавляется к итоговому объекту `Headers` **после** списка заголовков SDK — по семантике `Headers.set()` в Node это переопределяет любой предыдущий заголовок с тем же именем (включая тот же заголовок, записанный пользователем в customHeaders).

**Для OpenAI/Anthropic (путь fetch-обёртки)**: correlation > customHeaders > значения по умолчанию SDK.
**Для Gemini (путь статических заголовков)**: customHeaders > correlation > значения по умолчанию SDK (существующий порядок spread сохранён).

Разница в том, что на пути fetch-обёртки спуфинг становится невозможен (fetch-обёртка выполняется после заголовков SDK). Это **побочный эффект исправления ошибки**, а не преднамеренное ужесточение — но более безопасно. Необходимо явно указать это в §8.2.

### 4.4 Влияние на схему конфигурации

~~**Практически нулевое**. Данный дизайн не вводит новых настроек~~ — **изменение R3**: вводится одна новая настройка `telemetry.sessionIdHeaderHosts: string[]`, предназначенная для переопределения белого списка first-party хостов по умолчанию. Соответствующий элемент схемы добавлен в `packages/cli/src/config/settingsSchema.ts`, описание и синтаксис переопределения (`["*"]` возвращает широковещательный режим / `[]` полностью отключает / пользовательский массив) см. в §11. Нижеследующий текст описывает состояние только до R3.
```
- `traceparent` 注入由 telemetry enabled 触发（已有 toggle）
- `X-Qwen-Code-Session-Id` 注入也由 telemetry enabled 触发
- `ignoreRequestHook` 的 OTLP url 已经从现有 config 读

未来可以加的 setting（**out of scope**）：

- `telemetry.outboundCorrelationHeader`: 自定义 header name（默认 `X-Qwen-Code-Session-Id`）
- `telemetry.outboundPropagationDisabled`: 全局关闭（如果 LLM 服务对未知 header 严格）
- ~~per-destination header scope toggle~~ — **R3 已落地**，见 §11

## 5. 文件改动清单

| 文件                                                                            | 改动类型 | 说明                                                                                                                                                            |
| ------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                    | 加依赖   | `@opentelemetry/instrumentation-undici`                                                                                                                         |
| `packages/core/src/telemetry/sdk.ts`                                            | 修改     | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                  |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | 新文件   | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (Gemini fallback)                                                                |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | 修改     | `buildClient()` 在 `new OpenAI({...})` 里加 `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)`                                                             |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | 修改     | 同上（override `buildClient`）                                                                                                                                  |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | 修改     | factory 函数里 merge `staticCorrelationHeaders(gcConfig)` 进 `httpOptions.headers`（**caller 已有 Config，零 signature 改动** — 修正之前的 over-specification） |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | 修改     | `buildClient` 路径下用 `wrapFetchWithCorrelation` 包 SDK 的 `fetch` option                                                                                      |

**显式 audited 但无需改动**（避免 reviewer 怀疑漏路径）：

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator`，用 `DashScopeOpenAICompatibleProvider`，**自动继承 dashscope.ts 的 buildClient 改动**。所有 Qwen OAuth 流程同样受益。
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — wrapper 模式，不构造 SDK client（它包装其他 contentGenerator 做 telemetry logging），无需改动。
- `packages/core/src/core/contentGenerator.ts` — factory 入口，不持有 client。
  | `packages/core/src/telemetry/sdk.test.ts` | 修改 | 加 undici instrumentation 注册 + ignoreRequestHook 测试 |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | 新文件 | telemetry-on/off 行为单测 + per-request 读 sessionId 验证（critical：session reset 后 wrapped fetch 读到新 id） |
  | 各 provider 的 `*.test.ts` | 修改 | 断言 SDK 构造时 `fetch` option 是 wrapped 版本（OpenAI/Anthropic）；断言 Gemini 构造时 `httpOptions.headers` 含 `X-Qwen-Code-Session-Id` |
  | `docs/developers/development/telemetry.md` | 修改 | 新增 "Trace context & session correlation propagation" 段 |
  | `docs/design/telemetry-outbound-propagation-design.md` | 本文件 | 设计文档 |

## 6. 分 PR 拆分

按 review 友好度分两个 PR（也可以合一，规模允许）：

### PR 1 — `traceparent` 自动注入（structural）

- 加 `@opentelemetry/instrumentation-undici` 依赖
- `sdk.ts` 加 `UndiciInstrumentation` + `ignoreRequestHook`
- 测试：SDK 注册、OTLP endpoint 不被 trace
- 文档片段

**风险**：低。Additive。已有 client span 是 net 增益，不会改变现有 span 结构。

### PR 2 — `X-Qwen-Code-Session-Id` header（结合 helper 函数）

- 新文件 `llm-correlation-headers.ts`
- 4 个 provider 集成
- 测试：每个 provider 断言 header 存在；telemetry-off 时不发
- 文档片段

**风险**：低-中。要小心 `geminiContentGenerator` 构造器签名扩展可能波及调用方。

### PR 3（可选） — Docs + E2E verify

- 完善 `telemetry.md` 段落
- 加 E2E verify script（复用 `/tmp/verify-telemetry-pr-4367.mjs` 模式）：实际跑 fetch + 抓 header

也可以合并到 PR 2 里。

### 顺序偏好

PR 1 和 PR 2 技术上**互相独立**——不共享代码。但**推荐 PR 1 先合**：

- `traceparent` 是 OTel **标准** header，任何 OTel-aware collector / 后端立刻识别 → 用户立即获益
- `X-Qwen-Code-Session-Id` 是**产品自定义** header，需要后端配置识别才有价值 → 价值滞后
- 万一 PR 2 review 周期长，PR 1 已经把 cross-process trace 跑通了
- PR 1 是 additive structural（低风险），适合先建立信心

## 7. 测试计划

### 7.1 `sdk.ts` 单测

- ✅ `UndiciInstrumentation` 在 `NodeSDK` 的 `instrumentations` 中存在
- ✅ `ignoreRequestHook` 对 `https://collector:4318/v1/traces` 返回 true
- ✅ `ignoreRequestHook` 对 `https://dashscope.aliyuncs.com/...` 返回 false
- ✅ trailing slash 与无 trailing slash 都正确匹配

### 7.2 `llm-correlation-fetch.ts` 单测

**`wrapFetchWithCorrelation`**：

| 场景                                                    | 期望                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                       | wrapped fetch = baseFetch（不加任何 header）                           |
| `getTelemetryEnabled() === true`, sessionId = "abc-123" | wrapped fetch 发出的 init.headers 含 `X-Qwen-Code-Session-Id: abc-123` |
| `init.headers` 已有 `X-Qwen-Code-Session-Id: spoof`     | wrapper 后覆盖为真 sessionId（fetch wrapper 路径不允许 spoof，§8.1）   |
| **session reset 后 wrapped fetch 被再次调用**           | **读取新 sessionId**（regression guard for staleness fix）             |
| baseFetch reject                                        | wrapper 透传 reject 不吞                                               |

**`staticCorrelationHeaders`**（Gemini path）：

| 场景                                                    | 期望返回                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                       | `{}`                                                             |
| `getTelemetryEnabled() === true`, sessionId = "abc-123" | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                        |
| sessionId 中含 unicode（`會話-1`）                      | 原样返回——HTTP header value 由 SDK 负责编码                      |
| sessionId 为空字符串                                    | `{ 'X-Qwen-Code-Session-Id': '' }`——业务 invariant，不在此层校验 |

### 7.3 Per-provider 集成测试

每个 provider 的 `buildHeaders()` / 构造测试加：

```ts
it('includes X-Qwen-Code-Session-Id when telemetry enabled', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('omits X-Qwen-Code-Session-Id when telemetry disabled', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 E2E verification（tmux + local HTTP server）

⚠️ **不要** mock `globalThis.fetch` 来抓 header：`UndiciInstrumentation` 通过 undici 的 diagnostics channel hook，monkey-patching globalThis.fetch 可能完全 bypass instrumentation（取决于 patch 顺序），让 `traceparent` 注入测不到。**正确做法是起 local HTTP server**，让 SDK 真发请求，server 端记录收到的 headers。

写一个仿 `/tmp/verify-telemetry-pr-4367.mjs` 的脚本：

1. `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` 起本地 server
2. 启 telemetry + outfile + 把 OpenAI SDK 的 `baseURL` 指向 `http://127.0.0.1:<port>`（或者用 mock provider 让 SDK 真发 fetch）
3. 触发一次 `client.chat.completions.create(...)`（要带最小可解析的 mock 响应，否则 SDK 解析报错——本地 server 返回合法但空的 OpenAI 响应即可）
4. 断言 `capturedHeaders[0]` 含 `traceparent: 00-...` 和 `X-Qwen-Code-Session-Id: <sessionId>`
5. 另起一个 OTLP collector mock 在 different port，验证给它发的 OTLP 上报**不**触发 `traceparent` 注入（验证 `ignoreRequestHook`）
6. **额外：staleness 验证** — emit request 1 → call `config.resetSession(...)` → emit request 2 → 断言 request 2 的 `X-Qwen-Code-Session-Id` 是新 session id（**这是 #1 fix 的关键回归测试**）

### 7.5 回归保护

- streaming chat completion 的 fetch（带 `stream: true`）仍正常关闭——`UndiciInstrumentation` 历史上对 streaming response 的 span lifecycle 有过 bug，**实施时需要实际跑一次 streaming completion 端到端验证 client span 正常 end + 无 leaked span + 流不被截断**；不假设具体版本号已修
- proxy mode (`ProxyAgent`) 与 instrumentation 同时启用——`ignoreRequestHook` 仍按 endpoint 字符串匹配，proxy 不影响
- 重试（`maxRetries`）下每次重试都得到独立 client span，但都共享同一个 `traceparent` parent（理想是 retry 作为同一个父 span 下多个 child span — 这部分由 SDK 行为决定，本设计不强制）

## 8. 边界 / 边角

### 8.1 customHeaders override 与 spoofing 的不一致行为

不同 provider 路径的 spoofing 表面**不同**（设计后果，非原意收紧）：

| Provider 路径                           | spoofing 可能? | 原因                                                                                                                |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic (fetch wrapper 路径) | ❌ 不能 spoof  | fetch wrapper 在 SDK headers list 之后 `headers.set('X-Qwen-Code-Session-Id', ...)`，覆盖 user customHeaders 的同名 |
| Gemini (static headers 路径)            | ✅ 可 spoof    | merge 顺序 `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }`——customHeaders 最后赢                      |

claude-code 同样使用 fetch wrapper 路径，行为与 OpenAI/Anthropic 一致（spoofing 不能）。这是修 staleness bug 的副产品，不是原本要做的事。

**不打算"对齐"两条路径**——Gemini 路径的行为是 SDK 限制（没有 `fetch` hook）导致的，反向把 OpenAI 也降级到 static 不合理。

Session id spoofing 不是真威胁（用户控制本地，可以直接改 source code）。文档里要明示这个差异，避免 reviewer 看到 fetch wrapper 路径无法 spoof 时质疑 customHeaders 优先级。

### 8.2 OTLP collector URL 匹配的两类 edge case

#### (a) Auth token in URL

如果用户 OTLP endpoint 形如 `https://collector/path?token=secret`，`ignoreRequestHook` 的 `url.startsWith(e)` 比对应包含 query string。但 undici 给的 `request.path` 只到 path（不含 query），所以比较时 `e` 也只用到 path 部分。为安全起见，剥掉 query：

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) startsWith 跨 hostname 边界的理论 false positive

若 `e = "http://collector"`（无 port），来路 url = `http://collector-fake/v1/traces` 会被 startsWith 错误匹配。

**实际触发概率极低**：

- OTLP endpoint 几乎总带 port（4317 gRPC / 4318 HTTP），`http://collector:4318` 形态后 `-fake` 这种延伸不可能（port 后跟的是 `/`）
- 用户配 endpoint 不带 port 是配置错误，本来 SDK 就要默认 fallback

**如果想 harden**：解析 URL origin + path 分别比较，不用裸 startsWith：

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

本期不做——开销没必要，false positive 实际触发不到。

### 8.3 Vertex AI 模式的 Gemini

`@google/genai` 支持 `vertexai: true` 模式（用 GCP 凭据走 Vertex 端点而非 generative ai endpoint）。两种模式都走 fetch，所以 instrumentation 都覆盖。`httpOptions.headers` 在两种模式下都有效。

### 8.4 Anthropic SDK 已有 `defaultHeaders` 逻辑

`anthropicContentGenerator.ts:177` 已经在调 `buildHeaders()` 然后传给 `new Anthropic({ defaultHeaders })`。但 staleness 同样适用——本设计改用 `fetch` wrapper 路径（与 OpenAI 一致）。

### 8.5 SDK 与 fetch 之间的 trailer header

`openai` SDK 在 streaming 时可能用 `Transfer-Encoding: chunked` 和 trailer headers。这些都不影响 request-time 的 `traceparent` / `X-Qwen-Code-Session-Id` 注入——它们都是请求头，发出时一次性写入。

### 8.6 ⚠️ Known limitation: Gemini 的 session id 在 `/clear` 后 stale

由于 `@google/genai` SDK 不支持 `fetch` hook（`HttpOptions` 接口只有 `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`），Gemini provider 走 static `httpOptions.headers` 路径——session id 在 SDK 构造时 capture，**`/clear` 触发 session reset 后不刷新**。

**实际影响范围**：

- 用户启动 qwen-code → `/clear` → 用 Gemini 模型 → wire 上的 `X-Qwen-Code-Session-Id` 是旧 session id
- 后端 correlation 错位（trace id 和 log 已正确切换到新 session，但 wire header 滞后）

**为什么不修**（本期）：

- OpenAI / Anthropic 路径**没有这个 bug**（fetch wrapper 路径 per-request 读 session id）
- Gemini fix path 有几个选项，全部超出本期 scope（见下）

**Future fix path 选项**（按推荐顺序）：

| 选项                                          | 描述                                                                                 | 代价                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **A. Lazy invalidate** ★ 推荐                 | session reset 时只 mark contentGenerator dirty，下次 LLM 调用时 lazy recreate        | 小：~10 行加在 `resetSession` + LLM 调用入口；同步 API，无侵入                            |
| B. Eager recreate                             | session reset 时立即 `await createContentGenerator(...)`，需 async 化 `resetSession` | 中：API 改动级联多处                                                                      |
| C. Proxy headers object                       | 给 `httpOptions.headers` 包 Proxy 拦截 getter                                        | 风险高：`@google/genai` 内部是否 per-request 重读 headers 不可知，行为可能 silently break |
| D. 推动 `@google/genai` 上游加 `fetch` option | 提 PR 给 google-deepmind/generative-ai-js                                            | 长期；不可控                                                                              |

**文档要在用户面前说明**：使用 Gemini provider 时如果 `/clear` 后立刻有 LLM 调用，wire 上的 session id 在那一刻是旧的。可以靠 trace correlation 间接修正（spans/logs 上 session.id 已经是新的）。

应单开 follow-up sub-issue 跟踪选项 A。

## 9. 与 claude-code 对比

| 维度                         | claude-code                                                                                                                                          | qwen-code 本设计                                                                                                                                                              | 决策依据                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Session id header 命名       | `X-Claude-Code-Session-Id`（产品前缀）                                                                                                               | `X-Qwen-Code-Session-Id`（产品前缀）                                                                                                                                          | ✅ 同样命名空间策略                                                                                                                |
| Session id 注入机制          | SDK `defaultHeaders`（`client.ts:108`）+ 自定义 `buildFetch()` wrapper（`client.ts:370-390`，per-request `randomUUID()` 注入 `x-client-request-id`） | OpenAI/Anthropic 走 fetch wrapper（per-request 读 session id，避免 `/clear` staleness）；Gemini 走 static `httpOptions.headers`（SDK 限制）                                   | 与 claude-code 的 fetch wrapper 模式对齐。claude-code 也用 fetch wrapper 才能 per-request 加 `x-client-request-id`                 |
| Session id 持久性            | claude-code 没有 `/clear`-式 session reset；session = process                                                                                        | 有 `/clear` reset → fetch wrapper 路径自动跟随；static headers 路径会 stale（§8.6）                                                                                           | qwen-code 独有的复杂度                                                                                                             |
| Session id 编码              | HTTP header（不是 baggage）                                                                                                                          | HTTP header                                                                                                                                                                   | ✅ 同——backend 友好                                                                                                                |
| `traceparent` 注入           | 闭源；公开 docs 描述存在；开源 repo 无 `propagation.inject` / `UndiciInstrumentation` 引用                                                           | `@opentelemetry/instrumentation-undici` 自动                                                                                                                                  | claude-code 怎么实现的不可见。我们选 OTel 官方推荐路径，更轻                                                                       |
| `traceparent` 发送范围       | 仅第一方 Anthropic API；不发 Bedrock/Vertex/Foundry                                                                                                  | 发给所有出站 fetch (W3C 标准；trace id 是 `sha256(sessionId)` 哈希)。**R3 修订**：session id header 仅向 first-party (Alibaba/DashScope) 白名单注入，第三方默认不发。详见 §11 | R3 后 qwen-code 的 session header 与 claude-code 同样的 first-party-only 语义；`traceparent` 仍待 per-destination toggle follow-up |
| `x-client-request-id` (随机) | 有，自动                                                                                                                                             | 暂不做（独立 follow-up sub-issue 价值更高）                                                                                                                                   | 范围控制                                                                                                                           |
| 子进程 `TRACEPARENT` env     | 文档承认存在（实现闭源）                                                                                                                             | 不做（独立 follow-up）                                                                                                                                                        | 范围控制                                                                                                                           |
| 入站 `TRACEPARENT` 读取      | 文档承认存在（`-p` / Agent SDK 模式）                                                                                                                | 不做（独立 follow-up）                                                                                                                                                        | 范围控制                                                                                                                           |

**verified vs documented 注解**：

| claim                                           | 验证状态                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders` | ✅ Open source `src/services/api/client.ts:108` 已读                                                                                              |
| `x-client-request-id` via fetch wrapper         | ✅ Open source `src/services/api/client.ts:370-390` 已读                                                                                          |
| `traceparent` 注入                              | ⚠️ 仅 docs.claude.com/docs/en/monitoring-usage.md 提到；开源 repo `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` 返回空 |
## 10. Будущие работы

Относится к #3731 P3, настоящий дизайн **не** включает, но связан:

- **`X-Qwen-Code-Request-Id`** — случайный UUID на запрос (аналог claude-code: `x-client-request-id`). Полезен для корреляции при таймаутах/ошибках — когда сервер мог еще не назначить request id, клиентский id — единственное средство связи. После доработки R3 эта рекомендация стала более осмысленной: UUID на запрос не несет риска «профилирования между запросами» и может использоваться как «поддерживающий/отладочный заголовок, отправляемый всем LLM-провайдерам».
- **Контроль области действия `traceparent` для каждого назначения** — доработка R3 обработала только область заголовка session id; `traceparent` все еще внедряется во все исходящие fetch. Можно добавить `telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'`, используя тот же список разрешенных, что и в §11, для определения поведения.
- **Ленивая инвалидация устаревшего session id для Gemini** (опция A из §8.6): при `/clear` помечать contentGenerator как «грязный», при следующем вызове LLM лениво пересоздавать. Позволит пути Gemini также получить актуальность обертки fetch.
- **Переменная окружения `TRACEPARENT` для дочерних процессов**: внедрять env при выполнении дочерних процессов `BashTool`, чтобы внешние инструменты могли продолжить трассировку. Требует отдельного рассмотрения жизненного цикла выполнения инструментов.
- **Входящий `TRACEPARENT`**: читать env при запуске в режиме `--prompt`, чтобы CI / внешний оркестратор могли подключить qwen-code к более крупной трассе.
- **Настраиваемое имя `correlationHeader`**: позволить корпоративным ops настраивать заголовок (по умолчанию `X-Qwen-Code-Session-Id`).
- **Стратегия распространения `baggage`**: стоит ли активно устанавливать baggage, чтобы `user.id` / `tenant.id` и т.д. также передавались ниже по цепочке через baggage. В текущей версии не делаем, ждем прояснения требований.

## 11. Доработка R3 — Ограничение области действия `X-Qwen-Code-Session-Id` через список разрешенных хостов

> Триггер: [REQUEST_CHANGES review от LaZzyMan в PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Реализовано в коммитах: `1c8528a56` (основная реализация) + `cb162e716` (защита от сбоя при пустом baseUrl Vertex + обработка пробелов в `[" * "]`)

### 11.1 Триггер и обоснование

Дизайн R1 внедрял `X-Qwen-Code-Session-Id` во **все** исходящие LLM-запросы, управляемый только `telemetry.enabled`. В обзоре LaZzyMan указал на три нарастающие проблемы:

1. **Неверное обозначение**: `feat(telemetry):` + путь `telemetry/` + гейт `getTelemetryEnabled()` заставляют пользователя обоснованно думать «собственные наблюдаемые данные идут в собственный коллектор». Но `X-Qwen-Code-Session-Id` не попадает в бэкенд OTLP, он идет в запросах к LLM API: DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral. Два различных решения об экспорте данных привязаны к одному переключателю.

2. **Аналогия с claude-code несостоятельна**: R1 в §9 «выровнял» стратегию пространства имен и паттерн обертки fetch по claude-code. Но claude-code — это один Anthropic → один Anthropic (один вендор, одно направление), а qwen-code — это открытый CLI → множество сторонних провайдеров. «Стабильный сквозной идентификатор UUID, транслируемый всем третьим лицам» — это вопрос, на который R1 не ответил напрямую.

3. **traceparent — это другой канал для того же отпечатка**: trace id = `sha256(sessionId).slice(0, 32)`, для получателя это все еще стабильный идентификатор сессии (хеш необратим, но в рамках одной сессии он стабилен).

LaZzyMan оценил серьезность: session id `high` / traceparent `medium`.

### 11.2 Краткое описание решения

**Сузить область действия по умолчанию до хостов первого уровня**. Добавлен новый параметр:

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // восстановить поведение R1 (широковещательное)
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

Семантика этого набора: «LLM-провайдер, бэкенд ARMS Tracing, распространение qwen-code — одно юридическое лицо» — то есть аналог отношения single-vendor / single-direction из claude-code для qwen-code. Сторонние провайдеры (OpenAI / Anthropic / OpenRouter и др.) по умолчанию **не** получают заголовок.

### 11.3 Синтаксис шаблонов (намеренно минимальный)

`matchesTrustedHost(hostname, patterns)` поддерживает только два шаблона, в соответствии с `DashScopeOpenAICompatibleProvider.isDashScopeProvider`:

- простое имя хоста → точное совпадение (без учета регистра)
- `*.suffix` → соответствует самому `suffix` **И** любому поддомену; фиксация на точке предотвращает такие векторы атак, как `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld` (опечатки в суффиксе)

Без regex, без учета порта/схемы — строки в настройках имеют ровно ту семантику, которую выглядят.

### 11.4 Отличия реализации от R1

#### `wrapFetchWithCorrelation` (OpenAI / Anthropic)

Обертка R1 имела только два гейта: telemetry-enabled + sessionId. R3 добавляет третий гейт между ними:

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
      return baseFetch(input, init); // гейт хоста
    }
  }
  const sid = config.getSessionId();
  if (!sid) return baseFetch(input, init);
  // ... внедрение заголовка
};
```

`trustedHosts` снэпшотится однократно при оборачивании (в отличие от session id, который читается при каждом запросе). Изменение `telemetry.sessionIdHeaderHosts` в процессе работы требует пересоздания contentGenerator, чтобы вступило в силу. Форматы с пробелами, например `[" * "]`, обрабатываются через `.trim()` с переходом в широковещательный режим, чтобы опечатки в settings.json не приводили к молчаливой деградации.

#### `staticCorrelationHeaders` (Gemini)

В сигнатуру добавлен необязательный параметр `destinationUrl?: string`:

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: если не знаем назначения, не отправляем
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Интеграция с фабрикой Gemini

Gemini SDK имеет две неявные конечные точки по умолчанию (`generativelanguage.googleapis.com` и `{region}-aiplatform.googleapis.com`, определяемые `vertexai`), и фабричный слой не может точно восстановить одну из них. R3 выбирает: «если `config.baseUrl` не задан, передаём `undefined`», чтобы вспомогательная функция работала в режиме fail-closed → не отправляла заголовок. Операторам, желающим получить корреляцию, необходимо явно задать `baseUrl` (тот же вход, который SDK использует для определения пункта назначения). Это изменение предотвращает случайное попадание в список разрешенных при неверном определении назначения Vertex.

### 11.5 Новые файлы / новый код

| Файл                                                                 | Описание                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (НОВЫЙ)           | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                       |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (НОВЫЙ)      | Модульные тесты, включая векторы атак с TLD-суффиксом, fail-closed для IPv6, извлечение порта/userinfo/запроса |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`               | Добавлен гейт хоста; в `staticCorrelationHeaders` добавлен параметр `destinationUrl`                  |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`          | Добавлено 8 тестов для гейта хоста; `mockConfig` использует `'hosts' in opts` для различения «список по умолчанию» vs «широковещательный» |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`) | Проброс `sessionIdHeaderHosts`                                                                        |
| `packages/core/src/config/config.ts`                                 | `TelemetrySettings.sessionIdHeaderHosts` + геттер `getTelemetrySessionIdHeaderHosts()`                |
| `packages/core/src/core/geminiContentGenerator/index.ts`             | Передача `config.baseUrl` в вспомогательную функцию; fail-closed при undefined                        |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`        | Переписаны тесты Gemini с включенной телеметрией для соответствия новой семантике fail-closed          |
| `packages/cli/src/config/settingsSchema.ts`                          | Вход в JSON-схему для `sessionIdHeaderHosts`                                                          |
| `packages/vscode-ide-companion/schemas/settings.schema.json`         | Перегенерировано с помощью `npm run generate:settings-schema`                                         |
| `docs/developers/development/telemetry.md`                           | Переписан раздел «Session correlation header» + область по умолчанию + синтаксис переопределения       |

### 11.6 Ответы на аргументы LaZzyMan

| Аргумент LaZzyMan                         | Ответ R3                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ① Неверное обозначение telemetry         | **Устранено**: в случае DashScope заголовок session id буквально отправляется в бэкенд ARMS Tracing (то же юридическое лицо), семантика `telemetry.enabled` выровнена                |
| ② Широковещательный стабильный идентификатор между вендорами | **Устранено**: список разрешенных по умолчанию включает только хосты первого уровня Alibaba; широковещательная рассылка — opt-in (`["*"]`)                                              |
| ③ traceparent — другой канал для того же отпечатка | **Пока оставлено**: traceparent по-прежнему внедряется везде, как в R1. Обоснование: стандарт W3C, trace id — это sha256-хеш, продолжение трассы внутри вендора — основная область применения W3C. Переключатель области traceparent для каждого назначения вынесен в §10 future work |

### 11.7 Известные остаточные вопросы и дальнейшие шаги

- **Область traceparent** — см. пункт ③ выше, вынесено в §10
- **Случайный UUID на запрос** (`X-Qwen-Code-Request-Id`) — альтернатива, предложенная LaZzyMan, вынесена в §10
- **Ленивая инвалидация устаревшего Gemini** (опция A §8.6) — отделено от R3, будет отдельный подзапрос
- **Поддержка IPv6 в `matchesTrustedHost`** — в текущей версии IPv6-адреса назначения никогда не попадают в список разрешенных (URL.hostname возвращает `[::1]` с квадратными скобками, а синтаксис шаблонов не имеет соответствующей формы). Пока удовлетворяет сценарию «именованная конечная точка первого уровня». Если в будущем потребуется список разрешенных для сырых IP, будет расширено.

## 12. Доработка R4 — Разделение объединенных областей

> Триггер: [Повторный обзор LaZzyMan после раунда 8 в PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Реализация: текущий PR сужает; весь механизм session-id из R3 перенесен в отдельный последующий PR

### 12.1 Триггер и обоснование

R3 устранил опасения первого обзора LaZzyMan относительно «широковещательной передачи стабильного отпечатка сторонним провайдерам» (серьезность: high). Однако в последующем обзоре (раунд 8) он повысил уровень возражения до более глубокого архитектурного принципа:

> «Телеметрия — не контейнер для смежных функций. Распространение `traceparent` между процессами и внедрение заголовка `X-Qwen-Code-Session-Id` — **это не телеметрия**. Это работа по исходящей идентификации/корреляции, которая внутри использует некоторые OTel API как деталь реализации.»

Его ключевые мета-аргументы:

- **Пространство имен «telemetry» подразумевает получателя = собственный OTLP-коллектор пользователя**
- Но получатели `traceparent` и `X-Qwen-Code-Session-Id` — это **сторонние LLM-провайдеры**
- Два разных типа получателей должны иметь два разных дерева решений о согласии
- Даже если поведение по умолчанию безопасно (R3 это уже реализовал), размещение поведения на уровне проводов под `telemetry.*` **создает плохой прецедент**: будущие PR по телеметрии смогут продолжать протаскивать проводное поведение к третьим лицам
- «Если мы принимаем этот принцип, разделение механическое. Если нет — этот PR — неподходящее место для дебатов, потому что технические исправления уже внесены.»

### 12.2 Краткое описание решения («план C» — гибридное разделение)

После нескольких раундов внутреннего обсуждения (включая предложение yiliang об альтернативе customHeader, которая в итоге была признана неспособной нести динамические значения времени выполнения) было решено выбрать **план C**:

**В текущем PR остаются**:

- Регистрация `UndiciInstrumentation` (создает клиентские HTTP span → в собственный OTLP-коллектор пользователя)
- Защита от обратной связи OTLP (необходимый побочный эффект предыдущего)
- **Установка `NoopTextMapPropagator` по умолчанию** → `propagation.inject()` является no-op → в исходящем `fetch` **больше не будет `traceparent`**
- **Добавлен новый параметр `outboundCorrelation.propagateTraceContext: bool` (по умолчанию false)** как параметр верхнего уровня в независимом пространстве имен; при значении true устанавливается стандартный композитный пропагатор W3C
- **Весь код R3 для session-id** (`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / настройка `telemetry.sessionIdHeaderHosts` / 4 точки интеграции с провайдерами / все соответствующие тесты) **полностью удален**

**Перенесено в последующий PR**:

- Весь механизм `X-Qwen-Code-Session-Id` (реализация R3 используется повторно)
- Перемещается в новое пространство имен `outboundCorrelation.*` (конкретный ключ настройки TBD, но **не будет** называться `telemetry.*`)
- Последующий PR включает: раздел с моделью угроз, независимый обзор, документацию с пометкой «security-relevant»
- `X-Qwen-Code-Request-Id` (случайный UUID на запрос, альтернативный дизайн, предложенный LaZzyMan в раунде R3) также будет рассмотрен в рамках этого последующего PR

### 12.3 Соответствие аргументам R1/R3

| Аргумент R1/R3                                          | Статус после R4                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| §3.1 «Все исходящие LLM-запросы имеют traceparent»      | ❌ **R4 по умолчанию выключен**; включается только при `outboundCorrelation.propagateTraceContext: true`                  |
| §3.1 «Все исходящие LLM-запросы имеют `X-Qwen-Code-Session-Id`» | ❌ **R4 полностью удаляет из текущего PR**, переносит в последующий PR                                          |
| §4.3 Обертка fetch для внедрения session id             | ❌ Весь код не в текущем PR; будет использован повторно в последующем PR                                                   |
| §11 Список разрешенных хостов (дизайн R3)               | ❌ То же самое; полностью перенесено в последующий PR                                                                     |
| §4.4 Не вводить новых настроек                          | ❌ **Текущий PR добавляет один boolean `outboundCorrelation.propagateTraceContext`**; настройки session id — в последующем PR |
| §10 Будущие работы «`X-Qwen-Code-Request-Id`»           | ✅ Остается будущей работой; проектируется вместе с последующим PR по session-id                                            |

### 12.4 Цель дизайна нового пространства имен

Пространство имен верхнего уровня `outboundCorrelation.*` в текущем PR содержит только один boolean (`propagateTraceContext`), что может выглядеть избыточно структурированным. Но это **намеренный выбор**:

- **Устанавливает пространство имен как обязательство**: позволяет будущим session-id / request-id / и т.д. естественным образом войти в это пространство имен
- **Помечено как security-relevant**: описание в `settingsSchema.ts` явно содержит «SECURITY-RELEVANT», документировано как «настройка безопасности», а не «настройка наблюдаемости»
- **Все defaults выключены**: соответствует принципу, предложенному LaZzyMan: «клиент с открытым исходным кодом не должен отправлять стабильные идентификаторы третьим лицам без явного согласия»
- **Отделено от telemetry.\***: пользователь, читая settings.json, видит `outboundCorrelation.*` и сразу понимает, что это поведение на уровне проводов, а не наблюдаемость

#### Неявная зависимость: `telemetry.enabled`

Хотя пространство имен отделено от `telemetry.*`, **для работы во время выполнения все равно требуется `telemetry.enabled: true`** — OTel SDK инициализируется только при включенной телеметрии; без SDK нет установки пропагатора, нет вызова `propagation.inject()`, и флаг молчаливо не работает. Легко споткнуться: оператор устанавливает `propagateTraceContext: true`, но забывает включить telemetry; на сервере-ловушке нет никакого `traceparent`, при этом нет ошибки / предупреждения.

Обе пользовательские панели явно указывают эту зависимость:

- Раздел `propagateTraceContext` в `telemetry.md` содержит полный пример JSON с обоими флагами
- Описание в `settingsSchema.ts` **начинается** с «Requires `telemetry.enabled: true`» (чтобы в UI настроек VS Code, где длинные описания могут быть свернуты, это было видно)

В будущем, если будут добавлены заголовок session-id или другие параметры `outboundCorrelation.*`, **та же зависимость сохранится** — все они имеют смысл только при включенной телеметрии (так как внедряются через инструментирование/SDK OTel). Последующие PR должны унаследовать этот паттерн предупреждения.

### 12.5 Реализация

| Файл                                                                            | Изменения                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | **Удален**                                                                                                                                                                                                                         |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                     | **Удален**                                                                                                                                                                                                                         |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                              | **Удален**                                                                                                                                                                                                                         |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                         | **Удален**                                                                                                                                                                                                                         |
| `packages/core/src/telemetry/sdk.ts`                                            | + `NoopTextMapPropagator`; в зависимости от `getOutboundCorrelationPropagateTraceContext()` выбирается SDK textMapPropagator                                                                                                      |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | Удалена ссылка на `wrapFetchWithCorrelation`                                                                                                                                                                                      |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | То же                                                                                                                                                                                                                             |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | То же                                                                                                                                                                                                                             |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | Удалена ссылка на `staticCorrelationHeaders`                                                                                                                                                                                      |
| Файлов `*.test.ts` для указанных 4 провайдеров                                  | Удалены тестовые сценарии, связанные с session-id                                                                                                                                                                                  |
| `packages/core/src/config/config.ts`                                            | Удалены `TelemetrySettings.sessionIdHeaderHosts`, `getTelemetrySessionIdHeaderHosts`; **добавлен интерфейс `OutboundCorrelationSettings`** + **поле `outboundCorrelationSettings`** + **геттер `getOutboundCorrelationPropagateTraceContext()`** |
| `packages/core/src/telemetry/config.ts`                                         | Удалена передача `sessionIdHeaderHosts` из `resolveTelemetrySettings`                                                                                                                                                              |
| `packages/cli/src/config/settingsSchema.ts`                                     | Удалена схема `sessionIdHeaderHosts`; **добавлена схема верхнего уровня `outboundCorrelation`**                                                                                                                                   |
| `packages/cli/src/config/config.ts`                                             | Проброс `outboundCorrelation: settings.outboundCorrelation` в `ConfigParameters`                                                                                                                                                   |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                    | Перегенерировано `npm run generate:settings-schema` (обновляется синхронно при последующем обновлении описания)                                                                                                                   |
| `docs/developers/development/telemetry.md`                                      | Переписан раздел «Trace context propagation» → «Client-side HTTP span on outbound fetch»; удален весь раздел «Session correlation header»; **добавлен новый раздел верхнего уровня «Outbound correlation (SECURITY-RELEVANT)»**; добавлено описание зависимости от `telemetry.enabled` + пример конфигурации JSON |
| `docs/design/telemetry-outbound-propagation-design.md`                          | Этот раздел + заголовок R4 + указатель на доработку                                                                                                                                                                                 |
| `packages/core/src/config/config.test.ts`                                       | **Добавлен блок describe `OutboundCorrelation Configuration`**, `it.each` 4 теста, проверяющие неизменность значения по умолчанию `getOutboundCorrelationPropagateTraceContext` (omitted / `{}` / explicit true / explicit false) |

### 12.6 Ответы на мета-аргументы LaZzyMan

| Аргумент                                            | Статус после R4                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| «Пространство имен telemetry подразумевает получателя = собственный коллектор» | ✅ Проводное поведение вынесено из `telemetry.*`; новое пространство имен `outboundCorrelation.*` явно указывает семантику «исходящие третьим лицам» |
| «Поведение по умолчанию не должно отправлять идентификаторы третьим лицам без явного согласия» | ✅ `propagateTraceContext` по умолчанию false; весь последующий PR по session-id также будет выключен по умолчанию |
| «PR по телеметрии не должен протаскивать поведение на уровне проводов» | ✅ Текущий PR больше не добавляет ни одного пути кода, где «телеметрия управляет проводным поведением»; проводное поведение единообразно управляется `outboundCorrelation.*` |
| «Разделение механическое, работа не пропадает»      | ✅ Код R3 физически удален из текущей ветки, но остается в git history для повторного использования (или cherry-pick) в последующем PR |
### 12.7 План follow-up PR (информационный, вне рамок текущего PR)

Будущие follow-up PR должны включать:

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` или аналогичную настройку
- Переиспользование каркаса кода `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS`, уже реализованного в R3
- Раздел threat model, где явно указаны: набор получателей (recipient), окно деанонимизации для стабильного id, опциональный per-request UUID
- **По умолчанию выключено** (нет allowlist по умолчанию — строже, чем в R3, соответствует принципам открытого CLI от LazzyMan)
- Пометка security-relevant + добавление в docs/users/configuration/settings.md