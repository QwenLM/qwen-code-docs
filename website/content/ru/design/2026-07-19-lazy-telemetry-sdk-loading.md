# Ленивая загрузка SDK OpenTelemetry вне пути запуска дочернего процесса ACP

- **Issue**: #4748 (Оптимизация холодного старта демона и задержки fast-path qwen serve)
- **Статус**: реализовано
- **Дата**: 2026-07-19
- **Зависит от**: #7182 (удаление модулей TUI), описанный ниже аудит metafile

## Проблема

`channel.initialize` (~1035 мс P50 на 2C4G) — доминирующая стоимость первой
холодной сессии демона, и ~67% из нее — загрузка модулей в дочернем процессе
ACP. Аудит metafile бандла после #7182 (коммит `de962a5ecf`, metafile esbuild
с `DEV=true`) показывает, что жадное статическое замыкание дочернего процесса
ACP составляет **17,24 МиБ / 2420 модулей**, из которых кластер OpenTelemetry —
единственный крупнейший связный блок:

| группа                                                                 | байты (после tree-shake)        |
| ---------------------------------------------------------------------- | ------------------------------- |
| `@grpc/grpc-js`                                                        | 577 КиБ                         |
| `@opentelemetry/otlp-transformer`                                      | 479 КиБ                         |
| `protobufjs` + `long` + `@grpc/proto-loader`                           | 305 КиБ                         |
| `@opentelemetry/sdk-metrics` / `sdk-node` / `sdk-trace-*` / `sdk-logs` | ~260 КиБ                        |
| `@opentelemetry/instrumentation-*` + `instrumentation`                 | ~132 КиБ                        |
| остальные `@opentelemetry/*` (экспортеры, пропараторы, ресурсы, …)     | ~250 КиБ                        |
| **весь кластер телеметрии**                                            | **2,16 МиБ**                    |

Каждый байт из этого вычисляется при старте дочернего процесса ACP, несмотря на то что:

1. Телеметрия **отключена по умолчанию** — типичный случай платит полную
   модульную дань за код, который `initializeTelemetry()` затем отказывается
   выполнять (ранний return `!config.getTelemetryEnabled()` в `sdk.ts:202`).
2. Даже когда она включена, ничто не нуждается в SDK до первого спана/лога/метрики,
   что всегда происходит после ACK на `initialize`.

Для калибровки: #7182 убрал 1,16 МиБ и сократил время импорта ACP с 115 до 52 мс
(-63 мс). Этот кластер почти вдвое больше, поэтому эффект того же порядка
правдоподобен — при условии прохождения measurement gate из issue (ниже).

## Почему цепочка импортов жадная

`sdk.ts` статически импортирует все на верхнем уровне (`sdk.ts:13-32`): шесть
OTLP-экспортеров (gRPC + HTTP × traces/logs/metrics), `NodeSDK`, пакетные
процессоры, `PeriodicExportingMetricReader` и обе инструментации. Сам `sdk.ts`
достигается статически из core-barrel через `telemetry/index.ts` и не может быть
сделан полностью ленивым, потому что два модуля горячего пути статически зависят
от его дешевого геттера состояния:

- `telemetry/loggers.ts:80` → `isTelemetrySdkInitialized()` (гейтит каждый лог)
- `telemetry/session-tracing.ts:31` → то же (гейтит каждый хелпер спанов)

Поэтому разделение должно отделить **дешевый фасад состояния** от **тяжелой
сборки SDK**, а не просто обернуть шесть импортов экспортеров в `await import()` —
импорты `NodeSDK` / инструментаций / sdk-metrics (~0,7 МиБ) столь же устранимы
и живут в том же файле.

## Дизайн

### Разделение файлов внутри `packages/core/src/telemetry/`

**`sdk.ts` (остается; становится фасадом — без тяжелых импортов).** Сохраняет
без изменений по имени и семантике все, чего статически достигают другие модули:

- состояние модуля: `sdk`, `telemetryInitialized`, `telemetryShutdownPromise`,
  `activeMetricReader` (типизировано через `import type`, поэтому без рантайм-загрузки)
- `isTelemetrySdkInitialized()`, `refreshSessionContext()`,
  `shutdownTelemetry()`, `forceFlushMetrics()`
- `resolveHttpOtlpUrl()` (экспортируется, чистая; без тяжелых зависимостей)
- побочный эффект `diag.setLogger(...)` (нуждается только в `@opentelemetry/api`,
  который уже вездесущ и дешев — 56 КиБ, также используется
  `loggers.ts`/`metrics.ts`)

Его единственный рантайм-импорт `@opentelemetry/*` — это `@opentelemetry/api`.

**`sdk-impl.ts` (новый; тяжелая половина).** Получает без изменений: шесть
импортов OTLP-экспортеров, `NodeSDK`, `BatchSpanProcessor`,
`BatchLogRecordProcessor`, `PeriodicExportingMetricReader`, обе инструментации,
`CompressionAlgorithm`, `resourceFromAttributes`, `SessionIdSpanProcessor`,
`parseOtlpEndpoint`, `validateUrl`, `normalizeOtlpPrefix` + сопоставление
префиксов, гейт пропараторов и тело сегодняшней `initializeTelemetry()` начиная
с построения ресурса. Экспортирует одну функцию:

```ts
export function startTelemetrySdk(config: TelemetryRuntimeConfig):
  | {
      sdk: NodeSDK;
      metricReader: PeriodicExportingMetricReader | undefined;
    }
  | undefined;
```

возвращающую `undefined` на существующем пути пропуска «gRPC без базового
endpoint'а». `file-exporters.ts` и `log-to-span-processor.ts` тоже перемещаются
за `sdk-impl.ts` (сегодня их импортирует только `sdk.ts`, и они тянут
`sdk-logs`/`sdk-metrics`/`sdk-trace-base`).

### `initializeTelemetry` становится асинхронной

В фасаде:

```ts
let telemetryInitPromise: Promise<void> | undefined;

export function initializeTelemetry(
  config: TelemetryRuntimeConfig,
): Promise<void> {
  if (telemetryInitialized || !config.getTelemetryEnabled()) {
    return Promise.resolve();
  }
  telemetryInitPromise ??= (async () => {
    const { startTelemetrySdk } = await import('./sdk-impl.js');
    const started = startTelemetrySdk(config);
    if (!started) return;
    sdk = started.sdk;
    // sdk.start() + telemetryInitialized = true + setSessionContext +
    // setShellTracePropagation + initializeMetrics — тот же порядок, что и
    // сегодня, тот же try/catch, который только логирует.
  })().finally(() => {
    telemetryInitPromise = undefined;
  });
  return telemetryInitPromise;
}
```

Ключевые свойства:

- **Отключенный путь остается синхронным и бесплатным** — проверка
  `getTelemetryEnabled()` выполняется до динамического импорта, поэтому
  пользователи с конфигурацией по умолчанию вообще никогда не загружают кластер
  в 2,16 МиБ. Это и есть реальный выигрыш для дочернего процесса ACP.
- Защита single-flight (`telemetryInitPromise`) сохраняет идемпотентность
  функции при конкурентных вызывающих, соответствуя сегодняшней перепроверке
  `telemetryInitialized`.
- `shutdownTelemetry()` не требует изменений: она оперирует переменной `sdk`
  фасада и уже ничего не делает при `!telemetryInitialized`.

### Обработка точек вызова (все три продакшен-вызывающих)

1. **`packages/core/src/config/config.ts:2192`** (конструктор Config —
   синхронный контекст; это путь, которым идет дочерний процесс ACP, поскольку
   `deferTelemetryInitialization` равен false для режима ACP, см.
   `packages/cli/src/config/config.ts:2075`). Fire-and-forget с логируемым
   catch:

   ```ts
   void initializeTelemetry(this).catch(...)
   ```

   Анализ риска: единственное следствие позднего старта — спаны/логи,
   эмитированные в промежутке, отбрасываются гейтами
   `isTelemetrySdkInitialized()` — что _уже_ является поведением для всего окна
   до конструктора и для интерактивного пути TUI, где инициализация телеметрии
   отложена в фоновую задачу (`startup-prefetch.ts:259`). Новых режимов сбоя нет.

   Изменение поведения (намеренное, задокументированное): на неотложенных путях —
   дочерний процесс ACP и headless-запуски `-p`, где `deferTelemetryInitialization`
   равен false, — телеметрия ранее была полностью зарегистрирована к моменту
   возврата синхронного вызова `initializeTelemetry`; теперь она устаканивается
   асинхронно, поэтому существующее окно потерь расширяется на стоимость
   динамического импорта (~50–150 мс). Мы намеренно здесь не делаем `await`:
   await вернул бы импорт 2,16 МиБ на критический путь дочернего процесса ACP и
   перечеркнул выигрыш. Вызывающие, которым нужна гарантированная готовность
   телеметрии перед продолжением (рантайм демона, вызывающий 3), делают `await`
   явно.

2. **`packages/cli/src/startup/startup-prefetch.ts:261`** (раннер отложенных
   задач). Изменить замыкание задачи, чтобы оно возвращало промис
   (`() => initializeTelemetry(config)`), тогда существующая обработка ошибок
   `runDeferredTask` будет наблюдать отклонения. Семантика в остальном не меняется.

3. **`packages/cli/src/serve/run-qwen-serve.ts:2925`** (рантайм демона).
   **Обязан делать `await`.** Следующая же строка вызывает
   `initializeDaemonMetrics()`, а `metrics.getMeter()` OTel кеширует noop-метр
   навсегда, если вызван до регистрации SDK глобального MeterProvider — метрики
   демона молча умрут. Окружающая функция уже асинхронна, поэтому `await
core.initializeTelemetry(...)` — изменение в одно слово. Это добавляет
   стоимость загрузки модулей к загрузке _рантайма демона_ (отложенной, вне
   fast path) только когда телеметрия включена — приемлемо, и строго лучше, чем
   платить ее в каждом дочернем процессе ACP.

   Та же опасность порядка существует в принципе для `initializeMetrics()`
   (`metrics.ts:409`), но она вызывается _внутри_ промиса инициализации после
   `sdk.start()`, поэтому порядок сохраняется по построению.

### Расширение защиты бандла

Расширить проверку границы ACP в `scripts/check-serve-fast-path-bundle.js`
(`findAcpImportBoundaryOffenders`) черным списком телеметрии, чтобы разделение
не могло тихо регрессировать:

```
@grpc/grpc-js, @grpc/proto-loader, protobufjs,
@opentelemetry/otlp-transformer, @opentelemetry/sdk-node,
@opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/exporter-logs-otlp-grpc,
@opentelemetry/exporter-metrics-otlp-grpc,
@opentelemetry/instrumentation-http, @opentelemetry/instrumentation-undici
```

(`@opentelemetry/api`, `semantic-conventions`, `core`, `resources`, `api-logs`
не входят в черный список — они легитимно достижимы из `loggers.ts`,
`metrics.ts` и экспортов уровня типов.)

## Что это НЕ меняет

- Никаких изменений поведения при включенной телеметрии — те же экспортеры, те
  же процессоры, те же хуки инструментации, та же семантика shutdown/flush.
- Никакого удаления публичного API: тип возвращаемого значения
  `initializeTelemetry` меняется с `void → Promise<void>`, что обратно
  совместимо по исходникам для существующих fire-and-forget вызывающих (все
  точки вызова все равно обновлены в том же коммите; это изменение пакета core,
  авторства мейнтейнеров согласно AGENTS.md).
- Экспорты barrel'а `telemetry/index.ts` сохраняют те же имена.

## Принятие (measurement gate issue #4748)

Байты не конвертируются в миллисекунды; изменение должно пройти действующую
дисциплину issue перед объединением:

1. **2C4G, 30 последовательных холодных стартов подряд**, телеметрия отключена
   (конфигурация по умолчанию): сравнить P50/P95 `channel.initialize` и P50
   процесс→первая сессия с базовой линией `de962a5ecf`. Выкатывать, только если
   P50 улучшается за пределы шума между запусками.
2. **Функциональный прогон с включенной телеметрией**: OTLP-цели gRPC и HTTP
   каждая получают traces/logs/metrics после изменения (существующая матрица
   `sdk.test.ts` плюс одна ручная end-to-end против локального коллектора);
   файловые экспортеры `--telemetry-outfile` по-прежнему пишут.
3. **Метрики демона**: при включенной телеметрии метрики Status демона звенят и
   gauge'и `initializeDaemonMetrics()` по-прежнему сообщают значения (защищает
   await в точке вызова 3).
4. **Защита бандла**: `node scripts/check-serve-fast-path-bundle.js` зелен с
   расширенным черным списком; повторно выполнить аудит замыкания
   (`.qwen/scripts/acp-closure-audit.mjs`) и записать новый итог замыкания ACP
   (ожидается ≈ 17,24 − ~2,0 МиБ минус то, что `@opentelemetry/api` и компания
   оставляют жадным).
5. **Юнит-тесты**: `sdk.test.ts` делает `await initializeTelemetry` (15 точек
   вызова); тесты, проверяющие построение экспортеров, перемещаются в
   `sdk-impl.ts` или мокают его.

## Рассмотренные альтернативы

- **Лениво импортировать только шесть классов экспортеров, оставив
  `initializeTelemetry` синхронной.** Отклонено: без причины оставляет ~0,7 МиБ
  (`NodeSDK`, инструментации, `sdk-metrics`, пакетные процессоры) жадными и все
  равно вынуждает асинхронную границу где-нибудь — включенный путь строит
  экспортеры безусловно, поэтому функция становится асинхронной в любом случае.
- **Сделать весь модуль `telemetry/sdk.ts` динамическим.** Отклонено:
  `loggers.ts` и `session-tracing.ts` гейтят каждый вызов телеметрии через
  `isTelemetrySdkInitialized()`; асинхронность этого гейта отравила бы десятки
  горячих синхронных точек вызова.
- **Полностью пропускать телеметрию в дочернем процессе ACP.** Уже отклонено в
  issue (огульные пропуски меняют наблюдаемое поведение для пользователей,
  включающих телеметрию).
