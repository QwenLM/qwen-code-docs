# Telemetry: Custom Resource Attributes + Metric Cardinality Controls

> Сопутствующий issue: [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> Родительский issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> Основано на ревизии кода ветки main qwen-code от 2026-05-21

## 1. Обоснование

qwen-code уже интегрировал OpenTelemetry SDK, но способ построения Resource делает его непригодным для двух распространённых производственных сценариев:

1. **Невозможность добавления пользовательских измерений** — эксплуатационная команда хочет добавить к данным телеметрии теги `team`/`env`/`cost_center`/`user_id`, но сегодня для этого нет никакого механизма. Даже установка стандартной переменной окружения `OTEL_RESOURCE_ATTRIBUTES` **полностью не работает**.
2. **Неограниченная кардинальность метрик** — `session.id` встраивается в уровень Resource и автоматически прикрепляется к каждой точке данных метрики. Каждый сеанс CLI порождает новое значение, что может перегрузить бэкенд метрик (Prometheus / Alibaba Cloud ARMS Metric / VictoriaMetrics) неограниченным количеством временных рядов.

Эти две проблемы связаны: решение первой облегчает пользователям **добавление полей с высокой кардинальностью**, поэтому необходимо также предусмотреть вторую.

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

`autoDetectResources: false` отключает стандартный `envDetector` OTel — тот самый уровень, который обычно считывает `OTEL_RESOURCE_ATTRIBUTES` и `OTEL_SERVICE_NAME`. Это сделано по причине (детекторы асинхронны и вызывают `diag.error` до завершения), но побочный эффект — обе стандартные переменные окружения **полностью не работают** в qwen-code.

### 2.2 Фактически тройное внедрение `session.id`

| Местоположение                | Строка                 | Влияние                                    |
| ----------------------------- | ---------------------- | ------------------------------------------ |
| Resource                      | `sdk.ts:160`           | Все сигналы (spans / logs / metrics)       |
| Per-span                      | `session-tracing.ts:169` | spans                                      |
| Per-log                       | `loggers.ts:128`        | logs                                       |
| **`getCommonAttributes()`**   | `metrics.ts:57`         | **Явное наложение на каждую запись метрики** |

То есть **простого удаления `session.id` из Resource недостаточно**: `baseMetricDefinition.getCommonAttributes()` в `metrics.ts:57` разворачивается оператором `...spread` в более чем 30 точках вызова метрик, снова вставляя `session.id`.

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

Хорошая новость: все точки вызова метрик (30+) проходят через эту единственную функцию, что создаёт естественную узкую точку (chokepoint).

### 2.3 Паттерн разрешения конфигурации

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` использует единую цепочку приоритетов:

```
argv (наивысший)  >  QWEN_* env  >  OTEL_* env  >  settings.json (наинизший)
```

Новые поля следуют тому же паттерну.

### 2.4 Текущее состояние схемы настроек

В `packages/cli/src/config/settingsSchema.ts:998-1018` определена JSON-схема для `telemetry`:

```ts
telemetry: {
  type: 'object',
  // ...
  jsonSchemaOverride: {
    type: 'object',
    properties: {
      includeSensitiveSpanAttributes: { ... },
    },
    additionalProperties: true,  // ← сегодня не проверяются другие ключи telemetry.*
  },
}
```

`additionalProperties: true` означает, что сегодня схема пропускает без проверки такие поля, как `otlpEndpoint`, `otlpProtocol`, `resourceAttributes`. При добавлении новых полей `resourceAttributes`/`metrics` необходимо синхронно дополнить схему для поддержки автодополнения в IDE и отображения в UI настроек.

### 2.5 Кодовые пути, не входящие в рамки данного проекта

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` — это **собственный канал отправки данных первой стороны** (на основе внутреннего протокола Alibaba RUM `RumResourceEvent`), полностью независимый от OpenTelemetry SDK. Он имеет собственные endpoint, proxy и модель данных и **не затрагивается данным проектом**. Подробнее в разделе 3.

### 2.6 Поддерживаемые / неподдерживаемые переменные окружения `OTEL_*`

| Переменная окружения                                     | Статус                      |
| -------------------------------------------------------- | -------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                            | ✅ Поддерживается (`config.ts:79`) |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT`      | ✅ Поддерживается          |
| `OTEL_EXPORTER_OTLP_HEADERS`                             | ✅ Читается напрямую нижележащим экспортёром |
| `OTEL_TRACES_SAMPLER`                                    | ✅ Поддерживается (`tracer.ts:247`) |
| **`OTEL_RESOURCE_ATTRIBUTES`**                           | ❌ Полностью не поддерживается |
| **`OTEL_SERVICE_NAME`**                                  | ❌ Полностью не поддерживается |
| **`OTEL_METRICS_INCLUDE_*`**                             | ❌ Полностью не поддерживается (стиль claude-code) |

## 3. Цели / Не-цели

### 3.1 Цели

- Обеспечить возможность эксплуатации добавлять пользовательские resource attributes ко всем экспортируемым OTLP span / log / metric через стандартную переменную `OTEL_RESOURCE_ATTRIBUTES` и собственный `settings.json`.
- Обеспечить корректную работу `OTEL_SERVICE_NAME` в соответствии со спецификацией OTel (включая приоритет над `service.name` из `OTEL_RESOURCE_ATTRIBUTES`).
- По умолчанию **не включать** `session.id` в метрики (защита бэкенда от высокой кардинальности).
- Предоставить явный флаг для включения корреляции на уровне метрик для пользователей, которым это необходимо.
- Сохранить `session.id` в spans и logs (корреляция трейсов обязательна).
- Сохранить `autoDetectResources: false`, не допуская регрессии исправленной ошибки `diag.error`.
- Синхронно обновить `settingsSchema.ts`, чтобы новые поля были видны в UI настроек и IDE.

### 3.2 Не-цели

- **Собственный канал отправки `qwen-logger`** — полностью независимый RUM-канал, не входит в рамки данного проекта. Поля, отправляемые этим каналом (device id, user agent и др.), определяются протоколом RUM и не должны изменяться пользовательскими resource attributes. Если в будущем потребуется добавить пользовательские измерения в `qwen-logger`, это будет отдельный проект.
- **Динамический хук атрибутов на уровне span** — предоставление пользователям возможности писать код/хуки для вычисления атрибутов каждого span. Claude-code тоже не решил эту задачу; сложность высока, выгода низка.
- **Контроль кардинальности `service.version`** — частота изменения версий низкая (месячная), рост временных рядов контролируем. При необходимости — в v2 с использованием OTel View API.
- **Per-query resource attrs в форме Agent SDK** — в qwen-code пока нет сценариев вызова SDK.
- **Настройка заголовков OTLP (аутентификация)** — это отдельная линия issue (#3731 P1), не зависимая от данного проекта.
- **Resource attribute в виде флага CLI** — переменные окружения + settings.json уже покрывают временные и базовые сценарии; флаг CLI сделал бы командную строку громоздкой без явного выигрыша.
## 4. 设计

### 4.1 总体分层

```
┌─ Resource（sdk.ts:156）────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [reserved]     │
│   ...user attrs       ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id 移走                                            │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169，保留）
       ├──→ Logs      ＋ session.id（loggers.ts:128，保留）
       └──→ Metrics   ＋ getCommonAttributes() — 默认 {}
                          toggle ON: { session.id }
```

### 4.2 优先级 / merge 顺序

#### 一般 attribute

低 → 高：

1. `OTEL_RESOURCE_ATTRIBUTES`（标准 OTel env var）
2. `settings.telemetry.resourceAttributes`
3. 内建保留键（覆盖以上任何同名）

**理由**：环境变量是 ops-time 临时覆盖（CI / 单机 debug），settings.json 是 fleet-baked 基线，内建是产品契约——基线优先级应高于临时变量，内建优先级应高于一切。

#### `service.name` 特殊处理

`service.name` 必须遵守 [OTel 规范](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/)：

> **`OTEL_SERVICE_NAME` takes precedence over `service.name` defined with the `OTEL_RESOURCE_ATTRIBUTES` variable.**

因此对 `service.name` 单独应用这条优先级链（高 → 低）：

1. `OTEL_SERVICE_NAME`（最高，标准 OTel 规范规定）
2. `settings.resourceAttributes.service.name`（settings 优先于 env，沿用本设计一般规则）
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. 内建默认 `'qwen-code'`

`service.name` 允许通过 settings 覆盖——它是 service 身份，企业 fleet 用统一 settings.json 配置 service.name 是常见且合理的做法，禁止反而会阻断 GitOps 分发场景。`OTEL_SERVICE_NAME` 作为标准 OTel 规范规定的"最高优先级"通道，仍然可以在 CI / 单机调试时临时覆盖 settings。

具体规则：

| 来源                                                    | 写入 `service.name` 是否生效           |
| ------------------------------------------------------- | -------------------------------------- |
| `OTEL_SERVICE_NAME=foo`                                 | ✅ 最高优先级（覆盖任何其他来源）      |
| `settings.resourceAttributes={ "service.name": "foo" }` | ✅ 仅在没有 `OTEL_SERVICE_NAME` 时生效 |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`             | ✅ 仅在以上两者都没有时生效            |

### 4.3 保留键策略

| 键                | 用户能否覆盖                                                            | 理由                                                                                                  |
| ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `service.name`    | ✅ env var + settings 都可（见 §4.2 优先级链）                          | service 身份，应允许 ops 控制                                                                         |
| `service.version` | ❌ 任何来源都丢弃 + warn                                                | 遥测可信度——不允许用户谎报版本                                                                        |
| `session.id`      | ❌ 任何来源都丢弃 + warn（在 metric 上额外有 toggle 控制 runtime 注入） | runtime-only；用户写到 Resource 会绕过 metric cardinality toggle（Resource attr 自动附到所有 signal） |
| `qwen.*` 前缀     | ⚠️ 不强制保留，但 docs 建议留给产品自用                                 | 避免未来内建 attr 与用户 attr 冲突                                                                    |

**保留键以常量集中维护**：

```ts
// telemetry/resource-attributes.ts (new file)
/** Keys that cannot be overridden from any source (env or settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` **不**在 RESERVED 列表里——它走自己的优先级链（§4.2），不属于"全局禁止覆盖"语义。RESERVED 是"任何来源写了都警告并丢弃"，统一适用于 env 和 settings 两个入口。

### 4.4 `OTEL_RESOURCE_ATTRIBUTES` 解析

同步实现，绕开 OTel 自带的异步 envDetector：

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

格式严格按 OTel 规范：`key1=val1,key2=val2`，值 percent-encoded。

### 4.5 Metric attribute filter

唯一改动点 `metrics.ts:55-59`：

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
(30+ точек) нулевые изменения — `...spread` пустого объекта эквивалентен отсутствию разворачиваемых полей.

### 4.6 Граничные случаи и валидация

| Входные данные                                                   | Поведение                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (пустая строка)                    | Возвращает `{}`, нормальный запуск                                      |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (без `=`)                         | Пропускает этот элемент + `diag.warn`, продолжает разбор остальных      |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (пустой ключ)                  | Пропускает этот элемент, продолжает разбор остальных                    |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (пустое значение)             | `a=''`, `b='2'` (спецификация OTel допускает пустые значения)           |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (невалидный percent-encoding) | Сохраняет исходное `val%ZZbad` + `diag.warn`                           |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (дублирующийся ключ)        | Последнее значение побеждает `a=2` (согласовано с эталонной реализацией OTel SDK) |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (с пробелами)             | Автоматически обрезает пробелы                                           |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                     | Тихий пропуск `service.version` + `diag.warn`, остальные ключи сохраняются |
| `settings.resourceAttributes={ "service.name": "x" }`            | Принимается (настройки могут задавать service.name, см. §4.2)            |
| `settings.resourceAttributes={ "service.version": "x" }`         | Тихий пропуск + `diag.warn`                                              |
| `settings.resourceAttributes={ "team": 123 }` (не строка)        | TypeScript-типизация блокирует; во время выполнения передачу отклоняет JSON schema validator settings |
| Общий размер ресурса > ограничение OTel (4 КБ?)                  | Обрабатывается нижележащим OTel SDK, на данном уровне не проверяется    |

**Почему на данном уровне не выполняется проверка имен атрибутов** (например, по рекомендованному OTel шаблону `[a-z][a-z0-9_.]*`): OTel SDK сам проверяет их при экспорте, дублирование проверки на данном уровне замедляет работу и может расходиться с поведением SDK. Мы выполняем только разбор формата, а не семантическую валидацию.

**Принудительная защита зарезервированных ключей действует для обоих входных точек**:

```ts
// Применяется к атрибутам, полученным из переменных окружения
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES не может переопределить "${k}"; игнорируется`);
    delete envAttrs[k];
  }
}

// Применяется к атрибутам из настроек
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in settingsAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes не может переопределить "${k}"; игнорируется`,
    );
    delete settingsAttrs[k];
  }
}
```

### 4.7 Жизненный цикл и многопроцессность

- **Момент инициализации SDK**: Resource создается однократно при `initializeTelemetry()`, **неизменяем внутри процесса**. Это соответствует дизайну OTel SDK.
- **Форк subagent**: subagent qwen-code выполняется в том же процессе (`subagent-runtime.ts`), разделяет Resource. Если в будущем появится межпроцессный subagent, дочерний процесс **повторно инициализирует SDK**, заново читая переменные окружения и настройки — при передаче окружения поведение будет одинаковым.
- **Hot reload**: После изменения настроек Resource **не пересоздается**. Для вступления изменений в силу необходимо перезапустить CLI. Это должно быть четко указано в документации.
- **`refreshSessionContext()`** (`sdk.ts:306`): обновляет только контекст сессии ALS, **не пересоздает Resource** — так как на Resource больше нет `session.id` (одно из ключевых изменений данного дизайна).

## 5. Изменения в схеме Config

### 5.1 Интерфейс `TelemetrySettings` (`packages/core/src/config/config.ts:293`)

```ts
export interface TelemetrySettings {
  // ... существующие поля
  /** Статические атрибуты ресурса, прикрепляемые к каждому span/log/metric. */
  resourceAttributes?: Record<string, string>;
  /** Управление кардинальностью по сигналам. */
  metrics?: {
    /** Включать session.id в точки данных метрик (по умолчанию: false). */
    includeSessionId?: boolean;
  };
}
```

### 5.2 Геттер `Config` (тот же файл)

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

### 5.3 Добавлено в `resolveTelemetrySettings()`

```ts
const envResourceAttrs = parseOtelResourceAttributes(
  env['OTEL_RESOURCE_ATTRIBUTES'],
);
const settingsResourceAttrs = { ...(settings.resourceAttributes ?? {}) };

// Удаление зарезервированных ключей из обоих источников (предупреждение, если пользователь попытался их задать).
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envResourceAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES не может переопределить "${k}"; игнорируется`);
    delete envResourceAttrs[k];
  }
  if (k in settingsResourceAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes не может переопределить "${k}"; игнорируется`,
    );
    delete settingsResourceAttrs[k];
  }
}

// Слияние: сначала окружение, затем настройки (настройки переопределяют при конфликте).
const merged: Record<string, string> = {
  ...envResourceAttrs,
  ...settingsResourceAttrs,
};

// Приоритет service.name: OTEL_SERVICE_NAME (только из окружения) переопределяет все остальное.
// Настройки уже переопределили окружение в spread выше.
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
### 5.4 Изменения в построении Resource в `sdk.ts`

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version is always built-in; service.name flows through userAttrs
// (it was already resolved with OTEL_SERVICE_NAME precedence in resolver).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id deliberately NOT placed on Resource — see design doc §4.1
});
```

### 5.5 Изменения в `settingsSchema.ts`

Добавить в `telemetry.jsonSchemaOverride.properties` в файле `packages/cli/src/config/settingsSchema.ts:998-1018`:

```ts
{
  // ... existing includeSensitiveSpanAttributes
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

Также следует пересмотреть `additionalProperties: true` — сейчас оно разрешено (permissive), можно оставить или сделать строгим (strict). Рекомендуется оставить permissive, чтобы избежать ломающих изменений для других полей `telemetry.*`, не объявленных в схеме, но в документации чётко указать, что «необъявленные поля игнорируются».

## 6. Список изменений в файлах

| Файл                                                           | Изменения                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                           | Изменено построение Resource (объединение user attrs, удалён `session.id`)                       |
| `packages/core/src/telemetry/resource-attributes.ts` (новый файл)  | Функция `parseOtelResourceAttributes()` + константа `RESERVED_RESOURCE_ATTRIBUTE_KEYS`  |
| `packages/core/src/telemetry/config.ts`                        | В resolver добавлены парсинг и слияние `resourceAttributes` + `metrics.includeSessionId` |
| `packages/core/src/telemetry/metrics.ts`                       | В `getCommonAttributes()` добавлен переключатель (toggle gate)                                     |
| `packages/core/src/config/config.ts`                           | Схема `TelemetrySettings` + два геттера                                   |
| `packages/cli/src/config/settingsSchema.ts`                    | В `jsonSchemaOverride` добавлены `resourceAttributes` + `metrics`                   |
| `docs/developers/development/telemetry.md`                     | Добавлены разделы "Resource attributes" + "Cardinality controls" + примечания по миграции + примеры   |
| `packages/core/src/telemetry/resource-attributes.test.ts` (новый) | Модульные тесты парсера (покрывают все примеры из §4.6)                                       |
| `packages/core/src/telemetry/sdk.test.ts`                      | Приоритет слияния / сохранённые ключи / `OTEL_SERVICE_NAME`                                |
| `packages/core/src/telemetry/metrics.test.ts`                  | Появление `session.id` при включённом/выключенном переключателе                                     |
| `packages/core/src/telemetry/config.test.ts`                   | Слияние env / settings                                                        |
| `CHANGELOG.md` или release notes                                | Описание breaking change для PR 2                                               |

## 7. Разделение на PR

Разделите на три PR в соответствии с удобством ревью и радиусом взрыва (blast radius):

### PR 1 — Пользовательские атрибуты ресурса (additive, без ломающих изменений)

- Новый файл `resource-attributes.ts`: `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- Поле `TelemetrySettings.resourceAttributes` + логика слияния в resolver
- Интеграция `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES` в соответствии с приоритетами из §4.2
- Объединение в Resource (`sdk.ts`)
- В `settingsSchema.ts` добавлена JSON-схема для `resourceAttributes`
- **Не трогать** расположение `session.id` в Resource
- В документы добавлен раздел "Resource attributes" 

**Риск**: низкий. Полностью аддитивный (additive), не меняет существующее поведение. Если пользователь не задаёт переменные окружения или настройки, экспортируемые данные не изменятся.

### PR 2 — Контроль кардинальности (семантическое ломающее изменение)

- Удалить `session.id` из Resource (строка `sdk.ts:160`)
- Добавить переключатель `metrics.includeSessionId` (настройки + окружение) + шлюз в `getCommonAttributes()`
- В `settingsSchema.ts` добавить JSON-схему для `metrics`
- CHANGELOG / примечания по миграции
- Снэпшот-тесты фиксируют набор метрических атрибутов (защита от регрессий)
- В документы добавлен раздел "Cardinality controls" + руководство по миграции

**Риск**: средний. Любые запросы Prometheus, дашборды Grafana или правила оповещений, зависящие от `session.id` в метриках, перестанут работать. Требуются явное примечание к релизу и миграционный период в 1-2 версии.

**Опциональный переходной план** (кандидат, в данном релизе **не рекомендуется**):

> PR 2 может быть реализован в режиме «opt-out» — по умолчанию `session.id` всё ещё будет добавляться в метрики, но будет выводиться предупреждение «this default will flip in v0.X». После одного релиза значение по умолчанию изменится.

Причины не рекомендовать:
(1) Текущая база пользователей qwen-code невелика, поверхность разрушения ограничена; (2) Это ошибка кардинальности, чем раньше будет безопасное значение по умолчанию, тем лучше; (3) Двухэтапный выпуск увеличивает документационную нагрузку. Если владелец родительского issue хочет более консервативного подхода, можно принять.
### PR 3 — Полировка документации + примеры (очистка)

- `docs/developers/development/telemetry.md` — добавлены примеры (см. §10)
- Примеры интеграции с Alibaba Cloud ARMS / Prometheus / Grafana
- Добавлены фрагменты `settings.json` для всех типовых сценариев использования

## 8. План тестирования

### 8.1 Модульные тесты `parseOtelResourceAttributes()`

Параметризованное покрытие всех строк таблицы из §4.6 (рекомендуется `vitest` `it.each`):

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

| Сценарий                                                                 | Ожидаемое `service.name`                                | Ожидаемый user attr                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------- |
| Всё пусто                                                                | `'qwen-code'`                                           | отсутствует                            |
| Только env `OTEL_SERVICE_NAME=A`                                         | `'A'`                                                   | —                                      |
| Только env `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                     | `'B'`                                                   | —                                      |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`        | `'A'` (приоритет `OTEL_SERVICE_NAME`)                   | —                                      |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                      | `'A'` (приоритет `OTEL_SERVICE_NAME`)                   | —                                      |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}`  | `'C'` (settings имеет приоритет над env, когда нет `OTEL_SERVICE_NAME`) | —          |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                  | `'qwen-code'`                                           | `team='y'` (приоритет settings)        |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                          | `'qwen-code'` + warn                                    | service.version остаётся реальной версией CLI |
| `settings={service.version:fake}`                                        | `'qwen-code'` + warn                                    | service.version остаётся реальной версией CLI |

### 8.3 Тесты снепшотов содержимого Resource

Используем `InMemorySpanExporter`, берём один span и проверяем:

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // ключевой момент
expect(span.resource.attributes['team']).toBe('platform'); // добавлено пользователем
```

### 8.4 Тесты переключателя атрибутов метрик

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

### 8.5 Проверка сохранения поведения Spans / Logs

- spans по-прежнему содержат `session.id` (не зависит от переключателя метрик)
- logs по-прежнему содержат `session.id` (не зависит от переключателя метрик)

### 8.6 Регрессионная защита

- `autoDetectResources: false` остаётся без изменений (проверка в конфиге)
- Во время запуска не появляется новых `diag.error` (перехватываем логи OTel diag для проверки)
- Все существующие тесты телеметрии проходят (CI)

### 8.7 Тесты Diag warn

Проверяем, что следующие входные данные вызывают один вызов `diag.warn`:

- `settings.resourceAttributes = { 'service.version': 'x' }` (зарезервировано)
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x` (зарезервировано, env тоже должно вызывать warn)
- `OTEL_RESOURCE_ATTRIBUTES=malformed` (нет `=`)
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ` (некорректный percent-encoding)

Проверяем, что следующие входные данные **не** вызывают warn (корректные пути):

- `settings.resourceAttributes = { 'service.name': 'x' }` (settings разрешает устанавливать service.name)
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }` (достаточно приоритета `OTEL_SERVICE_NAME`, warn не нужен)

## 9. Миграция / критические изменения

### 9.1 Критические изменения (PR 2)

**`session.id` по умолчанию исчезает из метрик**. Это влияет на:

- Агрегации `by (session_id)` / `group_left(session_id)` в запросах Prometheus
- Графики в Grafana, разбитые по сессиям
- Любые правила алертинга, сгруппированные по session.id

Примечание: `session.id` в spans и logs **не затрагивается**.

### 9.2 Пути миграции

В документации предлагаются два варианта:

**Вариант A**: восстановить старое поведение (рекомендуется для краткосрочной отладки)

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

или в `settings.json`:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **Предупреждение**: при долгосрочном включении количество временных рядов метрик будет равно количеству исторических сессий, что может переполнить бэкенд. Используйте только для краткосрочной отладки.

**Вариант B**: использовать spans / logs для разбивки по сессиям (рекомендуется)
- на spans / logs всё ещё есть `session.id`, можно срезать по session в trace backends (например, Jaeger / Aliyun ARMS Tracing) / log backends (например, Loki / SLS)
- эти два типа данных по своей природе хранятся per-event, cardinality не взорвётся
- подходит для анализа drill-down на уровне сессий

### 9.3 Шаблон release note

```
**Breaking change (metric attribute):**

The `session.id` attribute is no longer attached to metric data
points by default. This protects metric backends from unbounded
time-series fan-out.

- Spans and logs are unaffected — `session.id` is still present.
- To restore the previous behavior (short-term debugging only), set
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` or in settings.json:
  `telemetry.metrics.includeSessionId: true`.
- For long-term session correlation, query against trace / log
  backends instead of metric backends.

See docs/developers/development/telemetry.md "Migration" for details.
```

## 10. Примеры конфигурации (для документации)

### 10.1 Сегментация всей телеметрии по team / env

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

Результат: все span / log / metric будут иметь `team=platform` `env=prod` `cost_center=eng-123`.

### 10.2 Маршрутизация через `OTEL_SERVICE_NAME` в общем collector

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

Результат: `service.name=qwen-code-ci`, multi-tenant OTel collector может маршрутизировать по service.name в разные backend.

### 10.3 Fleet baseline + переопределение на отдельной машине

`~/.qwen/settings.json` для fleet компании (распространяется через GitOps):

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
# deployment.environment / service.namespace из settings всё ещё действуют
# при этом текущий запуск дополнительно несёт debug_run=true
```

### 10.4 Кратковременная отладка с включением session.id в метрики

```bash
# Одноразовый отладочный запуск
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "инвестиционный анализ"
```

После завершения сразу выключить, не сохранять в settings.

### 10.5 Подключение Aliyun ARMS Metric (рекомендуемая конфигурация)

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

| Измерение                     | claude-code                                      | qwen-code (данный дизайн)                        | Обоснование решения                               |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------| ------------------------------------------------- |
| Стандартные OTel env var       | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ Совпадает                                     | Стандартный контракт                               |
| Приоритет `OTEL_SERVICE_NAME` | Соблюдает спецификацию OTel                       | ✅ Соблюдает                                     | Спецификация чётко определяет                      |
| Именование переключателя cardinality | `OTEL_METRICS_INCLUDE_*`                   | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | Не засоряет пространство имён стандартного OTel   |
| Область действия переключателя | Только метрики                                  | ✅ Только метрики                                 | Spans / logs — per-event, нет проблемы взрыва cardinality |
| Значение по умолчанию         | Атрибуты с высокой cardinality по умолчанию false | ✅ По умолчанию false                            | Безопасность в приоритете                          |
| Детализация per-attribute     | По одному toggle на атрибут                      | ✅ Совпадает                                     | Гибко, соответствует реальным диагностическим нуждам |
| Аналог settings.json          | ❌ Нет                                           | ✅ Есть `telemetry.resourceAttributes` + `metrics`| Корпоративный fleet развёртывает базовый config   |
| Per-span динамический hook    | ❌ Нет                                           | ❌ Нет                                           | Высокая сложность, у claude-code тоже нет, в этой версии не делаем |
| Multi-tenant `account_uuid`   | Есть                                            | ❌ Нет                                           | В метриках qwen-code нет такого атрибута           |
| Agent SDK `options.env`       | Есть                                            | ❌ Нет                                           | В qwen-code нет аналогичного паттерна              |
| Политика защищённых ключей    | Не разрешает переопределять built-in id          | ✅ Совпадает                                     | Достоверность телеметрии                           |
| Первичный канал отправки      | У claude-code тоже есть отдельный первичный канал (изолирован от OTel) | ✅ qwen-logger так же изолирован              | Первичный и сторонний каналы разделены по ответственности |

**Два наиболее ценных заимствования**:

1. **Соглашение об именовании**: `*_INCLUDE_*` с первого взгляда ясно по семантике, понятнее, чем обратное именование (`*_EXCLUDE_*` / `*_DROP_*`)
2. **Ограничение области**: шлюз только для метрик, не для span/log — очевидно, claude-code уже наступал на эту границу, мы выигрываем напрямую

**Что qwen-code сделал лучше**:

- Поддержка settings.json: claude-code полностью полагается на env var, что неудобно для корпоративного fleet
- Чёткая политика защищённых ключей (`service.version` нельзя переопределить): снижает риск загрязнения телеметрии
- Изоляция первичного канала: qwen-logger идёт по независимому каналу, полностью отделён от пользовательских настроек OTLP

## 12. Будущие работы (v2 + кандидаты)

- **Контроль cardinality для `service.version`**: использовать OTel View API для удаления атрибута на уровне метрик
- **Больше переключателей cardinality**: если в будущем в метрики будут добавлены `user.account_uuid` / `model` и т.п., добавить toggle по необходимости
- **Per-span динамический attribute hook**: можно заимствовать систему hooks самого qwen-code, добавить колбэк `OnSpanStart(span, context) => attrs`. Требует отдельного проектирования.
- **Валидация схемы resource attribute**: ограничить пространство имён ключей (например, запретить переопределять встроенные атрибуты, кроме префикса `service.*`). Пока достаточно жёстко закодированного списка защищённых ключей.
- **Горячая перезагрузка Resource**: когда settings.json изменяется внутри процесса (например, в сценарии демона qwen-serve), сейчас Resource не перестраивается. Если сценарий демона станет зрелым, можно добавить путь перезагрузки.
- **Межпроцессное распространение контекста subagent**: при межпроцессном взаимодействии subagent передавать контекст трассировки родителя (включая resource) через стандартные заголовки OTel context propagation. Требует отдельного проектирования.
