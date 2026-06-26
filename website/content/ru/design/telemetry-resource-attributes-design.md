# Telemetry: Пользовательские атрибуты ресурсов + Контроль кардинальности метрик

> Связанный issue: [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> Родительский issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> Основано на ревизии кода ветки qwen-code main от 2026-05-21

## 1. Предыстория

qwen-code уже интегрирован с OpenTelemetry SDK, но способ построения Resource делает его непригодным в двух распространённых производственных сценариях:

1. **Невозможность добавить пользовательские измерения**: со стороны эксплуатации хочется добавить ко всем телеметрическим данным метки `team` / `env` / `cost_center` / `user_id`, но на сегодня нет никакого механизма для этого. Даже установка стандартной переменной окружения `OTEL_RESOURCE_ATTRIBUTES` **полностью не работает**.
2. **Неуправляемая кардинальность (cardinality) метрик**: `session.id` внедряется в слой Resource и автоматически прикрепляется к каждой точке метрики. Каждый новый сеанс CLI создаёт новое значение, что приводит к переполнению бэкенда метрик (Prometheus / Alibaba Cloud ARMS Metric / VictoriaMetrics) неограниченным количеством временных рядов.

Эти две проблемы связаны: решение первой позволит пользователям **легче** добавлять поля с высокой кардинальностью, поэтому необходимо также предоставить второе.

## 2. Текущее состояние

### 2.1 Построение Resource

`packages/core/src/telemetry/sdk.ts:156-161`:

```ts
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  'session.id': config.getSessionId(),
});
```

`sdk.ts:274-278`:

```ts
sdk = new NodeSDK({
  resource,
  // Disable async host/process/env resource detectors: they leave attributes
  // pending and trigger an OTel diag.error on any resource attribute read
  // before the detectors settle (e.g. during HttpInstrumentation span creation).
  autoDetectResources: false,
  ...
});
```

`autoDetectResources: false` отключает стандартный `envDetector` из OTel — тот самый слой, который обычно читает `OTEL_RESOURCE_ATTRIBUTES` и `OTEL_SERVICE_NAME`. Это сделано по причине (детектор асинхронный, вызывает `diag.error` до завершения), но побочный эффект в том, что эти две стандартные переменные окружения **полностью неэффективны** в qwen-code.

### 2.2 `session.id` фактически внедряется тройным образом

| Местоположение                    | Строка                    | Влияние                                  |
| --------------------------------- | ------------------------- | ---------------------------------------- |
| Resource                          | `sdk.ts:160`              | Все сигналы (spans / logs / metrics)     |
| Per-span                          | `session-tracing.ts:169`  | spans                                    |
| Per-log                           | `loggers.ts:128`          | logs                                     |
| **`getCommonAttributes()`**       | `metrics.ts:57`           | **Явно добавляется к каждой записи метрики** |

То есть **простого удаления `session.id` из Resource недостаточно** — `baseMetricDefinition.getCommonAttributes()` из `metrics.ts:57` разворачивается в 30+ точках вызова метрик через `...spread`, и снова вставляет `session.id`.

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

Хорошая новость: все точки вызова метрик (30+) проходят через эту функцию, что является естественным bottleneck.

### 2.3 Паттерн config resolver

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` использует единую цепочку приоритетов:

```
argv (наивысший)  >  QWEN_* env  >  OTEL_* env  >  settings.json (низший)
```

Новые поля следуют этому же паттерну.

### 2.4 Текущее состояние schema настроек

`packages/cli/src/config/settingsSchema.ts:998-1018` определяет JSON schema для `telemetry`:

```ts
telemetry: {
  type: 'object',
  // ...
  jsonSchemaOverride: {
    type: 'object',
    properties: {
      includeSensitiveSpanAttributes: { ... },
    },
    additionalProperties: true,  // ← сегодня не проверяет другие поля telemetry.*
  },
}
```

`additionalProperties: true` означает, что сейчас schema пропускает без проверки такие поля, как `otlpEndpoint` / `otlpProtocol` / `resourceAttributes`. При добавлении полей `resourceAttributes` / `metrics` следует синхронно дополнить schema, чтобы обеспечить автодополнение в IDE и корректную настройку UI.

### 2.5 Кодовые пути вне рамок данного дизайна

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` — это **собственный канал отправки данных qwen-code** (основанный на внутреннем протоколе Alibaba RUM `RumResourceEvent`), полностью независимый от SDK OTel. Он имеет свой endpoint, прокси и модель данных, **не затрагивается данным дизайном**. Подробнее см. §3.

### 2.6 Поддерживаемые/неподдерживаемые переменные окружения `OTEL_*`

| Переменная окружения                                       | Статус                              |
| ---------------------------------------------------------- | ----------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                              | ✅ Поддерживается (`config.ts:79`)  |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT`        | ✅ Поддерживается                   |
| `OTEL_EXPORTER_OTLP_HEADERS`                               | ✅ Читается напрямую экспортёром    |
| `OTEL_TRACES_SAMPLER`                                      | ✅ Поддерживается (`tracer.ts:247`) |
| **`OTEL_RESOURCE_ATTRIBUTES`**                              | ❌ Полностью не поддерживается      |
| **`OTEL_SERVICE_NAME`**                                    | ❌ Полностью не поддерживается      |
| **`OTEL_METRICS_INCLUDE_*`**                               | ❌ Полностью не поддерживается (стиль claude-code) |

## 3. Цели / Нецели

### 3.1 Цели

- Позволить эксплуатации добавлять пользовательские resource attributes ко всем экспортируемым OTLP span/log/metric через стандартную `OTEL_RESOURCE_ATTRIBUTES` и собственный `settings.json`
- Обеспечить корректную работу `OTEL_SERVICE_NAME` в соответствии со спецификацией OTel (включая приоритет над `service.name` из `OTEL_RESOURCE_ATTRIBUTES`)
- По умолчанию метрики **не** должны содержать `session.id` (защита кардинальности бэкенда)
- Предоставить явный переключатель для пользователей, которым нужна корреляция на уровне метрик с session.id, чтобы включить его обратно
- Сохранить `session.id` на spans и logs (корреляция трассировок обязательна)
- Сохранить `autoDetectResources: false`, не регрессировать исправленный баг с `diag.error`
- Синхронно обновить `settingsSchema.ts`, чтобы новые поля были видны в UI настроек и IDE

### 3.2 Нецели

- **Собственный канал отправки `qwen-logger`**: полностью независимый канал RUM, не входит в рамки данного дизайна. Поля, которые он отправляет (device id, user agent и т.д.), определяются протоколом RUM и не должны подмешиваться пользовательскими атрибутами ресурса. Если в будущем потребуется добавить пользовательские измерения в `qwen-logger`, это будет отдельным дизайном.
- **Per-span динамический хук атрибутов**: позволить пользователям писать код/хуки для вычисления атрибутов каждого span. claude-code тоже не решил эту задачу — сложность высокая, выгода низкая.
- **Контроль кардинальности `service.version`**: частота изменения версий низкая (месячная), рост временных рядов контролируем. При необходимости — через v2 с использованием OTel View API.
- **Per-query resource attrs в форме Agent SDK**: в qwen-code сейчас нет сценариев вызова SDK.
- **Конфигурация заголовков OTLP (auth headers)** : это отдельная линия issue (#3731 P1), не пересекающаяся с данным дизайном.
- **Resource attribute в форме CLI flags**: переменные окружения + settings.json уже покрывают сценарии временных и базовых настроек; CLI флаги сделают командную строку многословной без явной выгоды.

## 4. Дизайн

### 4.1 Общая структура уровней

```
┌─ Resource（sdk.ts:156）────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [зарезервировано]│
│   ...user attrs       ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id удалён                                           │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169，сохраняется）
       ├──→ Logs      ＋ session.id（loggers.ts:128，сохраняется）
       └──→ Metrics   ＋ getCommonAttributes() — по умолчанию {}
                          toggle ON: { session.id }
```

### 4.2 Приоритет / порядок слияния

#### Общие атрибуты

От низшего к высшему:

1. `OTEL_RESOURCE_ATTRIBUTES` (стандартная переменная окружения OTel)
2. `settings.telemetry.resourceAttributes`
3. Встроенные зарезервированные ключи (переопределяют одноимённые из любых источников)

**Обоснование**: переменные окружения — временное переопределение на уровне ops (CI / отладка на одной машине), settings.json — базовая конфигурация fleet, встроенные — контракт продукта. Базовый уровень должен иметь приоритет выше временных переменных, а встроенный — выше всего.

#### Специальная обработка `service.name`

`service.name` должен следовать [спецификации OTel](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/):

> **`OTEL_SERVICE_NAME` имеет приоритет над `service.name`, определённым с помощью переменной `OTEL_RESOURCE_ATTRIBUTES`.**

Поэтому для `service.name` применяется отдельная цепочка приоритетов (от высшего к низшему):

1. `OTEL_SERVICE_NAME` (наивысший, согласно стандартной спецификации OTel)
2. `settings.resourceAttributes.service.name` (settings имеют приоритет над env, следуя общему правилу этого дизайна)
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. Встроенное значение по умолчанию `'qwen-code'`

`service.name` разрешается переопределять через settings — это идентификатор сервиса; для корпоративного fleet конфигурация service.name через единый settings.json — распространённый и разумный подход, запрет этого заблокирует сценарий GitOps-дистрибуции. `OTEL_SERVICE_NAME` как канал с «наивысшим приоритетом» согласно спецификации OTel всё ещё может временно переопределять settings при CI или отладке на одной машине.

Конкретные правила:

| Источник                                               | Запись `service.name` срабатывает            |
| ------------------------------------------------------ | -------------------------------------------- |
| `OTEL_SERVICE_NAME=foo`                                | ✅ Наивысший приоритет (переопределяет любой другой источник) |
| `settings.resourceAttributes={ "service.name": "foo" }`| ✅ Срабатывает только при отсутствии `OTEL_SERVICE_NAME` |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`            | ✅ Срабатывает только при отсутствии обоих выше |

### 4.3 Стратегия зарезервированных ключей

| Ключ               | Может ли пользователь переопределить                                         | Обоснование                                                                                                |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `service.name`     | ✅ Переопределяется через env var и settings (см. §4.2 цепочка приоритетов)  | Идентификатор сервиса, следует разрешить управление ops                                                    |
| `service.version`  | ❌ Отбрасывается из любого источника + warn                                  | Достоверность телеметрии — не позволяем пользователю завышать версию                                       |
| `session.id`       | ❌ Отбрасывается из любого источника + warn (на метриках дополнительно toggle для контроля runtime-инъекции) | Только runtime; запись в Resource обходит toggle кардинальности метрик (Resource attr автоматически применяется ко всем сигналам) |
| Префикс `qwen.*`   | ⚠️ Не резервируется принудительно, но docs советуют оставить для собственных нужд продукта | Чтобы избежать конфликтов между будущими встроенными атрибутами и пользовательскими |

**Зарезервированные ключи поддерживаются централизованно в константе**:

```ts
// telemetry/resource-attributes.ts (новый файл)
/** Ключи, которые нельзя переопределить ни из какого источника (env или settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` **не** входит в список RESERVED — он идёт по своей цепочке приоритетов (§4.2) и не подпадает под семантику «глобальный запрет на переопределение». RESERVED означает «при записи из любого источника выдаётся предупреждение и отбрасывается», распространяется на оба входа: env и settings.

### 4.4 Разбор `OTEL_RESOURCE_ATTRIBUTES`

Синхронная реализация, обходит встроенный асинхронный envDetector OTel:

```ts
function parseOtelResourceAttributes(
  raw: string | undefined,
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      diag.warn(
        `Skipping malformed OTEL_RESOURCE_ATTRIBUTES entry: ${trimmed}`,
      );
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const valueRaw = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    let value: string;
    try {
      value = decodeURIComponent(valueRaw);
    } catch {
      diag.warn(
        `Invalid percent-encoding in OTEL_RESOURCE_ATTRIBUTES for key "${key}", using raw value`,
      );
      value = valueRaw;
    }
    out[key] = value; // duplicate keys: last wins (matches OTel reference impls)
  }
  return out;
}
```

Формат строго по спецификации OTel: `key1=val1,key2=val2`, значения percent-encoded.

### 4.5 Фильтр атрибутов метрик

Единственное место изменения `metrics.ts:55-59`:

```ts
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => {
    const out: Attributes = {};
    if (config.getTelemetryMetricsIncludeSessionId()) {
      out['session.id'] = config.getSessionId();
    }
    return out;
  },
};
```

Точки вызова (30+) — нулевые изменения: разворот `...spread` пустого объекта эквивалентен отсутствию полей.

### 4.6 Граничные случаи и проверка

| Вход                                                             | Поведение                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (пустая строка)                    | Возвращает `{}`, нормальный запуск                                          |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (без `=`)                         | Пропускает элемент + `diag.warn`, продолжает разбор остальных               |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (пустой ключ)                  | Пропускает элемент, продолжает разбор остальных                             |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (пустое значение)            | `a=''`, `b='2'` (OTel допускает пустое значение)                            |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (неверное percent-encoding) | Оставляет исходное `val%ZZbad` + `diag.warn`                                |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (дублирующийся ключ)        | Побеждает последний `a=2` (согласовано с реализацией OTel SDK)              |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (с пробелами)             | Автоматический trim                                                         |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                     | Молча отбрасывает `service.version` + `diag.warn`, остальные ключи сохраняются |
| `settings.resourceAttributes={ "service.name": "x" }`            | Принимается (settings разрешают service.name, см. §4.2)                     |
| `settings.resourceAttributes={ "service.version": "x" }`         | Молча отбрасывается + `diag.warn`                                           |
| `settings.resourceAttributes={ "team": 123 }` (не строка)        | Блокируется типом TypeScript; при runtime — валидатор JSON schema settings отклонит |
| Общий размер Resource > ограничение OTel (4KB?)                  | Обрабатывается базовым SDK OTel, проверка на этом уровне не выполняется     |

**Почему не выполняется проверка наименования ключа атрибута на этом уровне** (например, паттерн `[a-z][a-z0-9_.]*`, рекомендуемый OTel): OTel SDK сам проверяет при экспорте; повторная проверка на этом уровне и замедлит, и может отклониться от поведения SDK. Мы делаем только разбор формата, без семантической проверки.

**Принудительная защита зарезервированных ключей действует для обоих входов**:

```ts
// Применяется к атрибутам, разобранным из env
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envAttrs[k];
  }
}

// Применяется к атрибутам из settings
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in settingsAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsAttrs[k];
  }
}
```

### 4.7 Жизненный цикл и многопроцессность

- **Время инициализации SDK**: Resource создаётся однократно при `initializeTelemetry()` и **неизменяем в рамках процесса**. Это согласуется с дизайном SDK OTel.
- **Fork subagent**: subagent в qwen-code выполняется в том же процессе (`subagent-runtime.ts`), разделяет Resource. Если в будущем появится межпроцессный subagent, дочерний процесс будет **повторно инициализировать SDK**, снова считывая переменные окружения и settings — при условии передачи переменных окружения поведение будет согласованным.
- **Hot reload**: изменения settings **не приводят к перестроению Resource**. Оператору необходимо перезапустить CLI для применения. В документации следует явно указать это.
- **`refreshSessionContext()`** (`sdk.ts:306`): обновляет только контекст сессии ALS, **не перестраивает Resource** — потому что `session.id` больше нет на Resource (одно из ключевых изменений этого дизайна).

## 5. Изменения в схеме Config

### 5.1 Интерфейс `TelemetrySettings` (`packages/core/src/config/config.ts:293`)

```ts
export interface TelemetrySettings {
  // ... существующие поля
  /** Статические resource attributes, прикрепляемые к каждому span/log/metric. */
  resourceAttributes?: Record<string, string>;
  /** Контроль кардинальности для каждого сигнала. */
  metrics?: {
    /** Включать session.id в точки данных метрик (по умолчанию: false). */
    includeSessionId?: boolean;
  };
}
```

### 5.2 Геттер в `Config` (тот же файл)

```ts
class Config {
  getTelemetryResourceAttributes(): Record<string, string> {
    return this.telemetrySettings.resourceAttributes ?? {};
  }
  getTelemetryMetricsIncludeSessionId(): boolean {
    return this.telemetrySettings.metrics?.includeSessionId ?? false;
  }
}
```

### 5.3 Дополнение `resolveTelemetrySettings()`

```ts
const envResourceAttrs = parseOtelResourceAttributes(
  env['OTEL_RESOURCE_ATTRIBUTES'],
);
const settingsResourceAttrs = { ...(settings.resourceAttributes ?? {}) };

// Убираем зарезервированные ключи из обоих источников (предупреждаем, если пользователь пытался их установить).
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envResourceAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envResourceAttrs[k];
  }
  if (k in settingsResourceAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsResourceAttrs[k];
  }
}

// Слияние: env < settings (settings побеждает при конфликте).
const merged: Record<string, string> = {
  ...envResourceAttrs,
  ...settingsResourceAttrs,
};

// Приоритет service.name: OTEL_SERVICE_NAME (только env, escape) побеждает всё остальное.
// settings уже перезаписали env в spread выше.
if (env['OTEL_SERVICE_NAME']) {
  merged['service.name'] = env['OTEL_SERVICE_NAME'];
}

const resourceAttributes = merged;

const metricsIncludeSessionId =
  parseBooleanEnvFlag(env['QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID']) ??
  settings.metrics?.includeSessionId ??
  false;

return {
  // ... существующие поля
  resourceAttributes,
  metrics: { includeSessionId: metricsIncludeSessionId },
};
```

### 5.4 Изменение построения Resource в `sdk.ts`

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version всегда встроенный; service.name проходит через userAttrs
// (в резолвере он уже разрешён с приоритетом OTEL_SERVICE_NAME).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id намеренно НЕ помещается в Resource — см. дизайн-документ §4.1
});
```

### 5.5 Изменения в `settingsSchema.ts`

В `packages/cli/src/config/settingsSchema.ts:998-1018` в `telemetry.jsonSchemaOverride.properties` добавить:

```ts
{
  // ... существующий includeSensitiveSpanAttributes
  resourceAttributes: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Static resource attributes attached to all telemetry data. ' +
      'Keys must be strings; values must be strings. ' +
      'Reserved keys (service.name, service.version) are silently dropped.',
    default: {},
  },
  metrics: {
    type: 'object',
    additionalProperties: false,
    properties: {
      includeSessionId: {
        type: 'boolean',
        default: false,
        description:
          'Include session.id on every metric data point. ' +
          'WARNING: each CLI session creates a new value, causing unbounded ' +
          'metric time-series fan-out. Only enable for short-term debugging.',
      },
    },
  },
}
```

Также необходимо пересмотреть `additionalProperties: true` — сейчас он разрешительный, можно оставить или сделать строгим. Рекомендуется оставить разрешительным, чтобы не вызвать критические изменения для других не объявленных в schema полей `telemetry.*`, но в документации явно указать «не объявленные поля игнорируются».

## 6. Список изменений файлов

| Файл                                                           | Изменения                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                           | Изменить построение Resource (объединение user attrs, удаление `session.id`)|
| `packages/core/src/telemetry/resource-attributes.ts` (новый)   | `parseOtelResourceAttributes()` + константа `RESERVED_RESOURCE_ATTRIBUTE_KEYS` |
| `packages/core/src/telemetry/config.ts`                        | В resolver добавить `resourceAttributes` + разбор и слияние `metrics.includeSessionId` |
| `packages/core/src/telemetry/metrics.ts`                       | `getCommonAttributes()` добавить gate toggle                                |
| `packages/core/src/config/config.ts`                           | Схема `TelemetrySettings` + два геттера                                     |
| `packages/cli/src/config/settingsSchema.ts`                    | В `jsonSchemaOverride` добавить `resourceAttributes` + `metrics`            |
| `docs/developers/development/telemetry.md`                     | Добавить разделы "Resource attributes" + "Cardinality controls" + примечания по миграции + примеры |
| `packages/core/src/telemetry/resource-attributes.test.ts` (нов)| Юнит-тесты парсера (покрытие всех вариантов из §4.6)                        |
| `packages/core/src/telemetry/sdk.test.ts`                      | Приоритет слияния / зарезервированные ключи / `OTEL_SERVICE_NAME`           |
| `packages/core/src/telemetry/metrics.test.ts`                  | Проверка появления/отсутствия `session.id` при toggle off/on                |
| `packages/core/src/telemetry/config.test.ts`                   | Слияние env / settings                                                      |
| `CHANGELOG.md` или release notes                               | Описание breaking change для PR 2                                           |

## 7. Разбивка по PR

Для удобства ревью и минимизации взрываемости (blast radius) разделить на три PR:

### PR 1 — Пользовательские resource attributes (аддитивно, без разрушений)

- Новый файл `resource-attributes.ts`: `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- Поле `TelemetrySettings.resourceAttributes` + логика слияния в resolver
- Подключение `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES` с приоритетом по §4.2
- Включение в Resource (`sdk.ts`)
- Добавление `resourceAttributes` в JSON schema `settingsSchema.ts`
- **Не трогать** позицию `session.id` на Resource
- Добавить в docs раздел "Resource attributes"
**Риск**: низкий. Полностью аддитивно, не изменяет существующее поведение. Экспортируемые данные не меняются, пока пользователь явно не установит переменную окружения или настройку.

### PR 2 — Управление кардинальностью (семантический разрыв)

- Удалить `session.id` из Resource (строка `sdk.ts:160`)
- Добавить переключатель `metrics.includeSessionId` (settings + env) + шлюз `getCommonAttributes()`
- Добавить JSON-схему `metrics` в `settingsSchema.ts`
- CHANGELOG / миграционные заметки
- Snapshot-тесты, фиксирующие набор metric-атрибутов (защита от регрессии)
- Добавить раздел "Cardinality controls" в Docs + руководство по миграции

**Риск**: средний. Любые Prometheus-запросы / Grafana-дашборды / правила оповещений, которые зависят от `session.id` на метриках, перестанут работать. Требуется явный release note и миграционное окно на 1-2 версии.

**Вариант opt-in переходного периода** (кандидат, в этой итерации **не рекомендуется**):

> PR 2 можно внедрить как "opt-out" — по умолчанию `session.id` по-прежнему inject'ится в метрики, но добавляется warn log "this default will flip in v0.X". Через один релиз перевернуть умолчание.

Причины не рекомендовать: (1) текущая база пользователей qwen-code невелика, зона поражения ограничена; (2) это баг кардинальности — чем раньше безопасно по умолчанию, тем лучше; (3) двухэтапный выпуск увеличивает нагрузку на документацию. Если владелец родительского issue хочет более консервативный подход, можно принять.

### PR 3 — Полировка документации + примеры (cleanup)

- Дополнить `docs/developers/development/telemetry.md` примерами (см. §10)
- Примеры подключения к Alibaba Cloud ARMS / Prometheus / Grafana
- Добавить фрагменты settings.json для всех типовых use cases

## 8. План тестирования

### 8.1 Модульные тесты `parseOtelResourceAttributes()`

Параметризованное покрытие всех строк из таблицы §4.6 (рекомендуется vitest `it.each`):

```ts
it.each([
  ['', {}],
  ['a=1', { a: '1' }],
  ['a=1,b=2', { a: '1', b: '2' }],
  ['a=hello%20world', { a: 'hello world' }],
  ['a=val%ZZbad', { a: 'val%ZZbad' }], // invalid percent
  ['malformed', {}],
  ['=val', {}],
  ['a=', { a: '' }],
  ['a=1,a=2', { a: '2' }],
  [' a = 1 , b = 2 ', { a: '1', b: '2' }],
])('parses %j → %j', (input, expected) => {
  expect(parseOtelResourceAttributes(input)).toEqual(expected);
});
```

### 8.2 Тесты слияния Resolver

| Сценарий                                                                 | Ожидаемый `service.name`                          | Ожидаемый user attr                      |
| ------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------- |
| Всё пусто                                                                | `'qwen-code'`                                     | отсутствует                              |
| Только env `OTEL_SERVICE_NAME=A`                                         | `'A'`                                             | —                                        |
| Только env `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                     | `'B'`                                             | —                                        |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`        | `'A'` (приоритет OTEL_SERVICE_NAME)               | —                                        |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                      | `'A'` (приоритет OTEL_SERVICE_NAME)               | —                                        |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}`  | `'C'` (settings важнее env, когда нет OTEL_SERVICE_NAME) | —                                |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                  | `'qwen-code'`                                     | `team='y'` (приоритет settings)          |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                          | `'qwen-code'` + warn                              | service.version остаётся настоящей версией CLI |
| `settings={service.version:fake}`                                        | `'qwen-code'` + warn                              | service.version остаётся настоящей версией CLI |

### 8.3 Snapshot-тесты содержимого Resource

Используя `InMemorySpanExporter`, взять span и проверить:

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // ключевое
expect(span.resource.attributes['team']).toBe('platform'); // добавлено пользователем
```

### 8.4 Тестирование переключателя атрибутов метрик

```ts
it('does not emit session.id on metrics by default', async () => {
  // emit one tool call counter
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBeUndefined();
});

it('emits session.id when toggle is true', async () => {
  config.telemetrySettings.metrics = { includeSessionId: true };
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBe(KNOWN_SESSION_ID);
});
```

### 8.5 Тесты сохранения поведения для Spans / Logs

- spans по-прежнему содержат `session.id` (не затрагиваются переключателем метрик)
- logs по-прежнему содержат `session.id` (не затрагиваются переключателем метрик)

### 8.6 Защита от регрессии

- `autoDetectResources: false` остаётся неизменным (проверка в конфиге)
- Во время запуска не появляется новых `diag.error` (перехватывать логи OTel diag и проверять)
- Все существующие тесты телеметрии проходят (CI)

### 8.7 Тестирование warn-сообщений Diag

Проверить, что следующие входные данные вызывают одно `diag.warn`:

- `settings.resourceAttributes = { 'service.version': 'x' }` (зарезервировано)
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x` (зарезервировано, env тоже warn)
- `OTEL_RESOURCE_ATTRIBUTES=malformed` (без `=`)
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ` (некорректный percent-encoding)

Проверить, что следующие входные данные **не** вызывают warn (легальные пути):

- `settings.resourceAttributes = { 'service.name': 'x' }` (settings разрешают устанавливать service.name)
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }` (OTEL_SERVICE_NAME приоритетен, warn не нужен)

## 9. Миграция / Критические изменения

### 9.1 Критические изменения (PR 2)

**`session.id` по умолчанию исчезает из метрик**. Это повлияет на:

- Агрегации в Prometheus-запросах с `by (session_id)` / `group_left(session_id)`
- Графики на Grafana-дашбордах, разрезанные по сессиям
- Любые правила оповещений, группирующие по session.id

Примечание: на spans и logs `session.id` **не влияет**.

### 9.2 Путь миграции

В документации дать два варианта:

**Вариант A**: восстановить старое поведение (рекомендуется для краткосрочной отладки)

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

или `settings.json`:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **Предупреждение**: длительное включение приведёт к тому, что количество metric time-series станет равно числу исторических сессий, что перегрузит бэкенд. Использовать только для краткосрочной отладки.

**Вариант B**: перейти на spans / logs для разрезки по сессиям (рекомендуется)

- В spans / logs по-прежнему есть `session.id`, можно делать разрезку по сессиям в trace-бэкенде (Jaeger / Aliyun ARMS Tracing) / log-бэкенде (Loki / SLS)
- Эти типы данных изначально хранятся per-event, кардинальность не взрывается
- Подходит для анализа на уровне сессий (drill-down)

### 9.3 Шаблон Release note

```
**Критическое изменение (атрибут метрик):**

Атрибут `session.id` больше не прикрепляется к точкам данных метрик
по умолчанию. Это защищает бэкенды метрик от неограниченного
разрастания time-series.

- Spans и logs не затронуты — `session.id` по-прежнему присутствует.
- Чтобы восстановить предыдущее поведение (только для краткосрочной
  отладки), установите
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` или в settings.json:
  `telemetry.metrics.includeSessionId: true`.
- Для долгосрочной корреляции по сессиям используйте trace / log
  бэкенды вместо метрических.

Подробности: docs/developers/development/telemetry.md "Migration".
```

## 10. Примеры конфигураций (для документации)

### 10.1 Разрезка всей телеметрии по team / env

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

Результат: все span / log / metric будут иметь `team=platform`, `env=prod`, `cost_center=eng-123`.

### 10.2 Использование `OTEL_SERVICE_NAME` для маршрутизации в общем collector

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

Результат: `service.name=qwen-code-ci`, мультитенантный OTel collector может маршрутизировать по service.name в разные бэкенды.

### 10.3 Базовые настройки fleet + переопределение на конкретной машине

Общий `~/.qwen/settings.json` для fleet (распространяется через GitOps):

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

Временное переопределение на отдельной машине (без изменения settings):

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# settings'овые deployment.environment / service.namespace продолжают действовать
# дополнительно этот запуск получает debug_run=true
```

### 10.4 Краткосрочная отладка: включить metric session.id

```bash
# разовый отладочный запуск
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "инвестиционный анализ"
```

После завершения отключить, не сохранять в settings.

### 10.5 Подключение к Alibaba Cloud ARMS Metric (рекомендуемая конфигурация)

```json
{
  "telemetry": {
    "enabled": true,
    "otlpEndpoint": "http://<arms-endpoint>/api/v1/...",
    "otlpProtocol": "http",
    "resourceAttributes": {
      "team": "platform",
      "deployment.environment": "production"
    },
    "metrics": {
      "includeSessionId": false
    }
  }
}
```

## 11. Сравнение с реализацией claude-code

| Измерение                    | claude-code                                      | qwen-code (текущий дизайн)                       | Обоснование решения                              |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| Стандартные env var OTel      | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ совпадает                                     | Стандартный контракт                             |
| Приоритет `OTEL_SERVICE_NAME`| Следует спецификации OTel                        | ✅ следует                                       | В спецификации чётко определено                  |
| Именование переключателя кардинальности | `OTEL_METRICS_INCLUDE_*`              | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | Не засоряем стандартное пространство имён OTel   |
| Область действия переключателя| Только метрики                                  | ✅ только метрики                                | Spans / logs per-event, проблемы кардинальности нет |
| Значение по умолчанию        | Атрибуты высокой кардинальности по умолчанию false | ✅ по умолчанию false                           | Безопасность прежде всего                        |
| Гранулярность по атрибутам   | По одному переключателю на атрибут               | ✅ совпадает                                     | Гибко, соответствует реальным потребностям диагностики |
| Эквивалент settings.json     | ❌ нет                                           | ✅ есть `telemetry.resourceAttributes` + `metrics` | Для fleet-развёртывания с base config            |
| Per-span динамический hook   | ❌ нет                                           | ❌ нет                                           | Сложность высока, в claude-code тоже нет, в этой итерации не делаем |
| Мультитенантный `account_uuid`| Есть                                           | ❌ нет                                           | В метриках qwen-code такого атрибута нет         |
| Agent SDK `options.env`      | Есть                                             | ❌ нет                                           | В qwen-code нет аналогичного паттерна            |
| Политика зарезервированных ключей | Нельзя перезаписать встроенный id            | ✅ совпадает                                     | Достоверность телеметрии                         |
| Собственный канал отправки   | У claude-code есть отдельный собственный канал (изолирован от OTel) | ✅ qwen-logger также изолирован | Разделение ответственности между собственным и сторонним каналом |

**Два наиболее ценных заимствования**:

1. **Соглашение об именах**: `*_INCLUDE_*` с первого взгляда понятно по смыслу, чище, чем обратные имена (`*_EXCLUDE_*` / `*_DROP_*`)
2. **Ограничение области**: шлюзировать только метрики, не трогать span/log — очевидно, что claude-code уже наступал на эти грабли, мы получаем выгоду напрямую

**Что qwen-code делает лучше**:

- Поддержка settings.json: claude-code полностью полагается на env var, что неудобно для fleet-сценариев
- Чёткая политика зарезервированных ключей (`service.version` нельзя перезаписать): снижает вероятность загрязнения телеметрии
- Изоляция собственного канала: qwen-logger идёт по отдельному каналу, полностью независим от настроек OTLP пользователя

## 12. Будущие работы (v2 + кандидаты)

- **Управление кардинальностью `service.version`**: использовать OTel View API для сброса атрибута на уровне метрик
- **Больше переключателей кардинальности**: если в будущем на метриках появятся `user.account_uuid` / `model` и т.д., добавлять переключатели по мере необходимости
- **Per-span динамический hook атрибутов**: можно опираться на собственную систему hooks qwen-code, добавить колбэк `OnSpanStart(span, context) => attrs`. Требует отдельного дизайна.
- **Валидация схемы resource-атрибутов**: ограничить пространство имён ключей (например, запретить перезапись встроенных атрибутов, кроме префикса `service.*`). Сейчас достаточно жёстко заданного списка зарезервированных ключей.
- **Hot reload Resource**: когда settings.json изменяется внутри процесса (например, в daemon-режиме qwen-serve), Resource сейчас не перестраивается. Если daemon-сценарий станет зрелым, можно добавить путь перезагрузки.
- **Межпроцессное распространение контекста subagent**: когда subagent работает в другом процессе, передавать родительский trace-контекст (включая resource) через стандартные заголовки OTel context propagation. Требует отдельного дизайна.