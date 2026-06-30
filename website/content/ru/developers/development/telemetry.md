# Наблюдаемость с OpenTelemetry

Узнайте, как включить и настроить OpenTelemetry для Qwen Code.

- [Наблюдаемость с OpenTelemetry](#наблюдаемость-с-opentelemetry)
  - [Ключевые преимущества](#ключевые-преимущества)
  - [Интеграция с OpenTelemetry](#интеграция-с-opentelemetry)
  - [Конфигурация](#конфигурация)
  - [Телеметрия Aliyun](#aliyun-telemetry)
    - [Ручной экспорт OTLP](#manual-otlp-export)
  - [Локальная телеметрия](#local-telemetry)
    - [Вывод в файл (рекомендуется)](#file-based-output-recommended)
    - [Экспорт через коллектор (продвинутый)](#collector-based-export-advanced)
  - [Логи и метрики](#logs-and-metrics)
    - [Логи](#logs)
    - [Метрики](#metrics)
    - [Метрики демона](#daemon-metrics)
    - [Спаны](#spans)
    - [Метрики ресурсов](#resource-metrics)
    - [Мониторинг производительности (зарезервировано)](#performance-monitoring-reserved)

## Примечания к миграции

- Имя `tool_output_truncated` было изменено на `qwen-code.tool_output_truncated` для согласованности неймспейсов — системам-потребителям, фильтрующим по старому имени, следует обновить свои запросы.

- В документации к гистограмме `tool.call.latency` ранее указывался атрибут `decision` — этот атрибут никогда не устанавливался для гистограммы (записывается только `function_name`). Счетчик `tool.call.count` по-прежнему включает `decision`.

- В документации к событию лога `qwen-code.file_operation` и метрике `file.operation.count` ранее указывались атрибуты diff-stat (`model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`) — они никогда не устанавливались ни для того, ни для другого. Данные diff-stat доступны через атрибут `metadata` события лога `tool_call`.

## Ключевые преимущества

- **🔍 Аналитика использования**: Понимание паттернов взаимодействия и внедрения функций в вашей команде
- **⚡ Мониторинг производительности**: Отслеживание времени отклика, потребления токенов и использования ресурсов
- **🐛 Отладка в реальном времени**: Выявление узких мест, сбоев и паттернов ошибок по мере их возникновения
- **📊 Оптимизация рабочих процессов**: Принятие обоснованных решений для улучшения конфигураций и процессов
- **🏢 Корпоративное управление**: Мониторинг использования в командах, отслеживание затрат, обеспечение соответствия требованиям и интеграция с существующей инфраструктурой мониторинга

## Интеграция с OpenTelemetry

Система наблюдаемости Qwen Code построена на базе **[OpenTelemetry]** — независимого от вендоров отраслевого стандарта фреймворка наблюдаемости — и предоставляет:

- **Универсальная совместимость**: Экспорт в любой бэкенд OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog и т. д.)
- **Стандартизированные данные**: Использование согласованных форматов и методов сбора во всем вашем инструментарии
- **Интеграция, ориентированная на будущее**: Подключение к существующей и будущей инфраструктуре наблюдаемости
- **Отсутствие привязки к вендору**: Переключение между бэкендами без изменения инструментации

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Конфигурация

Все поведение телеметрии управляется через ваш файл `.qwen/settings.json`. Эти настройки могут быть переопределены переменными окружения или флагами CLI.

| Настройка                           | Переменная окружения                                 | Флаг CLI                                                 | Описание                                                                                                                                    | Значения            | По умолчанию            |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                             | `--telemetry` / `--no-telemetry`                         | Включить или отключить телеметрию                                                                                                            | `true`/`false`    | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                              | `--telemetry-target <local\|gcp>` _(устарело)_         | Информационная метка назначения; не управляет маршрутизацией экспортера — установите `otlpEndpoint` или `outfile`, чтобы настроить, куда отправляются данные           | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | `--telemetry-otlp-endpoint <URL>`                        | Эндпоинт OTLP-коллектора                                                                                                                        | URL string        | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | `--telemetry-otlp-protocol <grpc\|http>`                 | Транспортный протокол OTLP                                                                                                                        | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                | -                                                        | Переопределение эндпоинта для каждого сигнала для трейсов (только HTTP)                                                                                            | URL string        | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                  | -                                                        | Переопределение эндпоинта для каждого сигнала для логов (только HTTP)                                                                                              | URL string        | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`               | -                                                        | Переопределение эндпоинта для каждого сигнала для метрик (только HTTP)                                                                                           | URL string        | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                             | `--telemetry-outfile <path>`                             | Сохранение телеметрии в файл (переопределяет экспорт OTLP)                                                                                                 | file path         | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                         | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Включать промпты в логи телеметрии                                                                                                              | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | -                                                        | Включать пользовательские промпты, системные промпты, ввод/вывод инструментов и вывод модели как нативные атрибуты спанов (в дополнение к спанам моста log-to-span)           | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | -                                                        | Максимальная длина JavaScript-строки для полезной нагрузки каждого чувствительного нативного атрибута спана. Установите меньшее значение, если ваш бэкенд отклоняет большие атрибуты. | `1..104857600`    | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)   | -                                                        | Статические атрибуты ресурсов, прикрепляемые к каждому экспортируемому спану / логу / метрике. См. [Атрибуты ресурсов](#resource-attributes) ниже.              | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`          | -                                                        | Включать `session.id` в точки данных метрик. **Отключено по умолчанию** для защиты бэкендов метрик от разрастания временных рядов.                       | `true`/`false`    | `false`                 |

**Примечание о булевых переменных окружения:** Для булевых настроек (`enabled`, `logPrompts`, `includeSensitiveSpanAttributes`) установка соответствующей переменной окружения в `true` или `1` включит функцию. Любое другое значение отключит её.

**Примечание о целочисленных переменных окружения:** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` должно быть положительным целым числом при установке. Неверные значения приводят к сбою разрешения конфигурации телеметрии вместо тихого отката.

**Чувствительные атрибуты спанов:** Когда `includeSensitiveSpanAttributes` включен, происходят две вещи:

1. **Нативные атрибуты спанов (`qwen-code.interaction`, `api.generateContent*`, `tool.<name>`)** содержат дословное содержимое разговора:
   - Пользовательские промпты (`new_context`)
   - Системные промпты (`system_prompt` — полный текст один раз за сессию, дедуплицируется по SHA-256 хешу; последующие спаны несут только `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length`)
   - Схемы инструментов (выдаются как события `tool_schema`, также дедуплицируются по хешу)
   - Ввод инструментов (`tool_input`) и результаты инструментов (`tool_result`)
   - Вывод модели (`response.model_output`)

   Каждая полезная нагрузка усекается до `sensitiveSpanAttributeMaxLength` единиц JavaScript-строки. По умолчанию это 1 МиБ (`1048576`), увеличено с предыдущего значения по умолчанию 60 КиБ; установите `61440`, чтобы сохранить старый лимит. Лимит должен быть между `1` и `104857600` (100 МиБ). Для именованных атрибутов фиксированные метки, такие как `[USER PROMPT]`, `[TOOL INPUT: ...]` и `[TOOL RESULT: ...]`, учитываются в лимите; маркер усечения также учитывается. Лимит измеряется как длина JavaScript-строки, а не байты UTF-8. Поэтому не-ASCII контент может занимать больше байт после экспорта OTLP. Для большинства типов полезной нагрузки усечение добавляет как `*_truncated`, так и `*_original_length`. Системные промпты также устанавливают `system_prompt_truncated` при усечении, но используют всегда присутствующий `system_prompt_length` для исходной длины.

2. **Спаны моста log-to-span** (используются, когда HTTP-трейсы экспортируются без эндпоинта логов) сохраняют свои существующие поля `prompt`, `function_args` и `response_text` вместо того, чтобы быть отброшенными.

⚠️ **Предупреждение о безопасности:** включение этого флага передает полную историю разговоров, содержимое файлов, прочитанное с помощью `read_file`, shell-команды и их вывод (включая секреты в переменных окружения или аргументах), а также ответы модели на настроенный OTLP-бэкенд. Относитесь к бэкенду как к привилегированному хранилищу данных. По умолчанию флаг установлен в `false`.

**Стоимость / размер полезной нагрузки:** Активная сессия с лимитом по умолчанию (системный промпт 1 МиБ плюс 10 вызовов инструментов, каждый с вводом до 1 МиБ + результатом до 1 МиБ, плюс вывод модели 1 МиБ) может создать до ~22 МиБ полезной нагрузки атрибутов перед сжатием OTLP, плюс до 1 МиБ на каждую выданную схему инструмента в рабочих пространствах с большими определениями инструментов. Это ограничение на стороне приложения Qwen Code, а не гарантия того, что каждый коллектор или бэкенд примет атрибут такого размера. Если спаны отклоняются или отбрасываются, уменьшите `sensitiveSpanAttributeMaxLength` (например, до `61440`) и отслеживайте пропускную способность экспортера.

Эта настройка не отключает чувствительные данные в логах OTel или других приемниках телеметрии; телеметрия ответов не-внутреннего API может заполнять `response_text`, поэтому логи OTel, телеметрия UI и запись чата могут получать текст ответа независимо от этой настройки. QwenLogger не включает `response_text`.

**Маршрутизация сигналов HTTP OTLP:** При использовании протокола HTTP (`otlpProtocol: "http"`) Qwen Code автоматически добавляет специфичные для сигнала пути (`/v1/traces`, `/v1/logs`, `/v1/metrics`) к базовому `otlpEndpoint`. Например, `http://collector:4318` становится `http://collector:4318/v1/traces` для трейсов. Если URL уже заканчивается путем сигнала, он используется как есть. Переопределения эндпоинтов для каждого сигнала (`otlpTracesEndpoint` и т. д.) имеют приоритет над базовым эндпоинтом и используются дословно. Протокол gRPC использует маршрутизацию на основе сервисов и не добавляет пути.

Переменные окружения для эндпоинтов каждого сигнала также принимают стандартные имена OpenTelemetry: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. Варианты `QWEN_TELEMETRY_OTLP_*` имеют приоритет над вариантами `OTEL_*`.

Подробную информацию обо всех параметрах конфигурации см. в [Руководстве по конфигурации](../../users/configuration/settings.md).

### Атрибуты ресурсов

Атрибуты ресурсов — это статические пары ключ-значение, прикрепляемые к каждому спану, логу и метрике, экспортируемым через OTLP. Используйте их для среза телеметрии по команде, окружению, региону развертывания или любому другому измерению, которое важно для вашего бэкенда.

Два источника, объединяемые в порядке приоритета (от низшего к высшему):

1. Стандартная переменная окружения `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` в `.qwen/settings.json` (переопределяет переменную окружения при конфликте ключей)

`OTEL_SERVICE_NAME` — это отдельный механизм переопределения: при установке он переопределяет `service.name` из любого другого источника (согласно спецификации OpenTelemetry).

#### Примеры

**Срез всей телеметрии по команде / окружению:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**Маршрутизация в коллектор для каждого арендатора через `service.name`:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Базовая линия флота (`~/.qwen/settings.json`) + переопределение для каждого хоста:**

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

```bash
# Добавление разовой метки без изменения настроек:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Зарезервированные ключи

Некоторые ключи контролируются средой выполнения и не могут быть переопределены:

- `service.version` — всегда устанавливается в версию работающего CLI. Установка из любого источника тихо отклоняется с предупреждением.
- `session.id` — внедряется средой выполнения для каждой сессии. Предоставленные пользователем значения из переменных окружения или настроек отклоняются с предупреждением. Причина в том, что атрибуты ресурсов автоматически прикрепляются к каждой точке данных метрик; разрешение пользовательского переопределения обошло бы [Контроли кардинальности](#cardinality-controls) ниже. Спаны и логи всегда несут `session.id`.

`service.name` **не** зарезервирован; он следует цепочке приоритетов, описанной выше.

#### Формат

`OTEL_RESOURCE_ATTRIBUTES` следует спецификации OpenTelemetry: `key1=value1,key2=value2`, где значения закодированы в формате percent-encoding. Пробелы в значениях должны быть закодированы как `%20`, **запятые как `%2C`** (незакодированные запятые разделяют значение в неправильной границе, и вторая половина отбрасывается как некорректная). Некорректные пары пропускаются с предупреждением, а не приводят к сбою запуска телеметрии.

#### Устранение неполадок: когда предоставленный пользователем атрибут, кажется, не вступает в силу

Зарезервированные ключи (`service.version`, `session.id`), некорректные пары, нестроковые значения настроек и некорректный percent-encoding тихо отклоняются, а предупреждение логируется через диагностический канал OpenTelemetry. Этот канал направляется в файл debug-лога (`~/.qwen/log/otel-*.log`), **а не** в консоль, поэтому поведение может выглядеть как тихий сбой.

Если пользовательский атрибут ресурса не появляется в экспортируемой телеметрии:

1. Проверьте `~/.qwen/log/otel-*.log` на наличие строк, соответствующих `cannot override` (зарезервированный ключ отклонен), `Skipping malformed` (некорректная пара в переменной окружения) или `must be a string` (нестроковое значение настройки).
2. Убедитесь, что переменная окружения установлена в окружении процесса qwen-code (а не только в вашей оболочке) и что значения закодированы в формате percent-encoding.
3. Подтвердите, что `telemetry.enabled` равно `true` — инициализация телеметрии запускается только если она включена.

### Контроли кардинальности

Метрики агрегируются по набору атрибутов на бэкенде — каждая уникальная комбинация значений атрибутов создает новый временной ряд. Прикрепление поля с высокой кардинальностью, такого как `session.id`, к метрике вызывает разрастание временных рядов, пропорциональное количеству сессий, что быстро истощает хранилище бэкенда метрик.

Чтобы предотвратить это, Qwen Code по умолчанию исключает атрибуты с высокой кардинальностью из точек данных метрик. Спаны и логи создаются для каждого события и не затрагиваются, поэтому они продолжают нести `session.id` для корреляции трейсов и логов.

#### `telemetry.metrics.includeSessionId` (по умолчанию: `false`)

Установка значения `true` (через настройки или `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) повторно прикрепляет `session.id` к каждой точке данных метрик.

⚠️ **Предупреждение:** каждая сессия CLI создает новое значение. Оставление этого параметра включенным для флота приведет к взрывному росту хранилища метрик. Рекомендуется только для краткосрочной отладки. Для долгосрочной корреляции сессий вместо этого запрашивайте бэкенды трейсов или логов.

#### Миграция с предыдущих версий

До этого релиза `session.id` прикреплялся к метрикам по умолчанию. Если ваши запросы Prometheus / дашборды Grafana / правила алертов ссылаются на `session_id` в метрике, у вас есть два варианта:

**Вариант A** — восстановить предыдущее поведение для краткосрочной отладки:

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

или:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

**Вариант B (рекомендуется)** — перенести анализ на уровне сессий с метрик. Спаны и логи по-прежнему несут `session.id`, а бэкенды трейсов / логов (Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing) нативно обрабатывают срезы по сессиям без давления на кардинальность.

### Клиентский HTTP-спан для исходящих fetch-запросов

Когда телеметрия включена, Qwen Code регистрирует `UndiciInstrumentation`, который создает клиентский HTTP-спан для каждого исходящего запроса `fetch()`, инициированного процессом, включая LLM SDK (`openai`, `@google/genai`, `@anthropic-ai/sdk`), MCP StreamableHTTP клиент, инструмент `WebFetch` и любые вызовы из отдельных процессов IDE-расширений. Спан позволяет видеть сетевую задержку (TTFB / передачу тела ответа) отдельно от времени обработки модели на стороне провайдера, что один только существующий спан `api.generateContent` различить не может.

Эти спаны отправляются в **ваш собственный** OTLP-коллектор (или файл вывода) так же, как и остальная телеметрия — они не влияют на то, что записывается в сам исходящий HTTP-запрос. Будет ли заголовок W3C `traceparent` также записываться в исходящий поток запроса, управляется **отдельной, важной для безопасности настройкой**, описанной в разделе [Исходящая корреляция (важно для безопасности)](#outbound-correlation-security-relevant) ниже.

**Избегание петли обратной связи.** OTel SDK использует `fetch` внутри себя для загрузки данных OTLP. Без защиты инструментация `fetch` трассировала бы эти загрузки, которые, в свою очередь, были бы загружены, вызывая бесконечный цикл. Инструментация undici в Qwen Code настроена с `ignoreRequestHook`, который пропускает URL-адреса, соответствующие префиксам настроенных `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint`. В режиме вывода в файл исходящих HTTP-загрузок нет, поэтому хук является no-op.

## Исходящая корреляция (ВАЖНО ДЛЯ БЕЗОПАСНОСТИ)

Эти настройки намеренно находятся в **отдельном неймспейсе верхнего уровня**, отличном от `telemetry.*`: телеметрия управляет потоком данных в собственный бэкенд наблюдаемости оператора, в то время как `outboundCorrelation.*` управляет тем, какие данные клиентской корреляции qwen-code записывает **в исходящие потоки запросов к LLM API**, которые достигают эндпоинтов сторонних провайдеров LLM (DashScope, OpenAI, Anthropic и т. д.). Разные получатели, разные решения о согласии. **Все значения по умолчанию отключены.** См. обсуждение в ревью PR #4390 для обоснования такого подхода.
### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // default
}
```

При значении `false` (по умолчанию) Qwen Code устанавливает no-op `TextMapPropagator` в OTel SDK. UndiciInstrumentation по-прежнему создает клиентские HTTP-спаны для вашего OTLP-коллектора, но `propagation.inject()` является no-op, поэтому **в исходящие запросы не записывается `traceparent`**. Trace ID остаются внутренними для коллектора оператора.

При значении `true` устанавливается композитный W3C-пропагатор SDK по умолчанию
(`tracecontext` + `baggage`), и стандартный заголовок `traceparent`
записывается в каждый исходящий `fetch`:

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

Кроме того, переменные окружения `TRACEPARENT` и `TRACESTATE` устанавливаются в
дочерних процессах оболочки (Bash tool, hooks, monitor), чтобы порожденные команды могли
участвовать в том же распределенном трейсе.

Включайте эту опцию только в том случае, если LLM-провайдер также отправляет данные в ваш OTel-коллектор
для сшивания кросс-процессных трейсов — например, ARMS Tracing для DashScope.
Для большинства операторов значение равно `false`; кросс-вендорное продолжение трейсов —
это нишевый сценарий.

**Зависит от `telemetry.enabled: true`.** OTel SDK инициализируется
только при включенной телеметрии, поэтому `propagateTraceContext` вступает в силу
только в этом состоянии. Установка значения `true` при отключенной телеметрии является
скрытым no-op — нет SDK, нет пропагатора, нет `traceparent` в сети.
Проверьте оба флага при настройке корреляции ARMS+DashScope:

```jsonc
{
  "telemetry": {
    "enabled": true,
    "otlpTracesEndpoint": "http://tracing-analysis-...",
  },
  "outboundCorrelation": {
    "propagateTraceContext": true,
  },
}
```

### Другие заголовки исходящей корреляции

`X-Qwen-Code-Session-Id` и `X-Qwen-Code-Request-Id` **не являются частью
этого PR**. Они будут спроектированы и предложены в собственных последующих
PR в том же неймспейсе `outboundCorrelation.*`, каждый со своей
моделью угроз и процессом получения согласия оператора. Ревью PR #4390 (LaZzyMan)
закрепило принцип: "сфера работы телеметрии не включает отправку идентификаторов LLM-провайдерам";
работа над заголовками корреляции переносится в отдельное обсуждение дизайна,
а не попадает в телеметрию.

## Телеметрия Aliyun

### Ручной экспорт OTLP

Чтобы просматривать телеметрию Qwen Code в Alibaba Cloud Managed Service for
OpenTelemetry, настройте Qwen Code на экспорт в OTLP-эндпоинт,
предоставленный ARMS.

Одной установки `"target": "gcp"` недостаточно для настройки назначения
экспорта. Если `otlpEndpoint` не задан, Qwen Code по умолчанию использует
`http://localhost:4317`. Если задан `outfile`, он переопределяет
`otlpEndpoint`, и телеметрия записывается в файл вместо отправки
в Alibaba Cloud.

1. Включите телеметрию в `.qwen/settings.json` и задайте OTLP-эндпоинт:

   **Вариант A: протокол gRPC** (стандартный OTLP-эндпоинт):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "otlpEndpoint": "https://<your-otlp-endpoint>",
       "otlpProtocol": "grpc"
     }
   }
   ```

   **Вариант B: протокол HTTP с эндпоинтами для каждого сигнала** (для бэкендов,
   использующих нестандартные пути, например, `/api/otlp/traces` вместо
   `/v1/traces`):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "otlpProtocol": "http",
       "otlpTracesEndpoint": "http://<host>/<token>/api/otlp/traces",
       "otlpLogsEndpoint": "http://<host>/<token>/api/otlp/logs",
       "otlpMetricsEndpoint": "http://<host>/<token>/api/otlp/metrics"
     }
   }
   ```

   > **Примечание:** При использовании протокола HTTP только с `otlpEndpoint` (без
   > переопределений для каждого сигнала) Qwen Code добавляет стандартные пути OTLP
   > (`/v1/traces`, `/v1/logs`, `/v1/metrics`) к базовому URL. Если ваш
   > бэкенд использует другие пути, используйте переопределения эндпоинтов для каждого сигнала, как
   > показано в Варианте B.

2. Если ваш эндпоинт Alibaba Cloud требует аутентификации, передайте заголовки OTLP
   через стандартные переменные окружения OpenTelemetry, такие как
   `OTEL_EXPORTER_OTLP_HEADERS` (или специфичные для сигнала варианты). Qwen
   Code в настоящее время не предоставляет заголовки аутентификации OTLP напрямую в
   `.qwen/settings.json`.
3. Запустите Qwen Code и отправьте промпты.
4. Просматривайте телеметрию в Managed Service for OpenTelemetry:
   - Обзор продукта:
     [Что такое Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Начало работы:
     [Начало работы с Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Точки входа в консоль:
     - Материковый Китай:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (устаревшая консоль:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - Международная версия:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - В консоли используйте `Applications` для проверки трейсов и топологии
     сервисов.
   - Чтобы найти OTLP-эндпоинт и информацию о доступе:
     - **Новая консоль** (`trace.console.aliyun.com` или международная):
       перейдите в `Integration Center`.
     - **Устаревшая консоль** (`tracing.console.aliyun.com`): перейдите в
       `Cluster Configurations` → `Access point information`.

## Локальная телеметрия

Для локальной разработки и отладки вы можете собирать телеметрические данные локально:

### Вывод в файл (рекомендуется)

1. Включите телеметрию в `.qwen/settings.json`:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Примечание:** При установке `outfile` экспорт OTLP автоматически отключается.
   > Настройки `target` и `otlpEndpoint` не нужны для вывода только в файл
   > и могут быть безопасно опущены в конфигурации.

2. Запустите Qwen Code и отправьте промпты.
3. Просматривайте логи и метрики в указанном файле (например, `.qwen/telemetry.log`).

### Экспорт через коллектор (продвинутый)

1. Запустите скрипт автоматизации:
   ```bash
   npm run telemetry -- --target=local
   ```
   Это позволит:
   - Скачать и запустить Jaeger и OTEL-коллектор
   - Настроить ваше рабочее пространство для локальной телеметрии
   - Предоставить Jaeger UI по адресу http://localhost:16686
   - Сохранять логи/метрики в `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Останавливать коллектор при выходе (например, `Ctrl+C`)
2. Запустите Qwen Code и отправьте промпты.
3. Просматривайте трейсы по адресу http://localhost:16686, а логи/метрики — в файле лога
   коллектора.

## Логи и метрики

В следующем разделе описывается структура логов, метрик и спанов,
генерируемых для Qwen Code.

- `sessionId` включается в качестве общего атрибута во все логи и метрики.

### Логи

Логи — это записи конкретных событий с временными метками. Все записи логов автоматически включают атрибуты `event.name` и `event.timestamp`.

Регистрируются следующие события:

#### Основные события сессии

- `qwen-code.config`: Генерируется один раз при запуске с конфигурацией CLI.
  - **Атрибуты**: `model`, `sandbox_enabled`, `core_tools_enabled`, `approval_mode`, `file_filtering_respect_git_ignore`, `debug_mode`, `truncate_tool_output_threshold`, `truncate_tool_output_lines`, `hooks` (через запятую, пропускается, если отключено), `ide_enabled`, `interactive_shell_enabled`, `mcp_servers`, `mcp_servers_count`, `mcp_tools`, `mcp_tools_count`, `output_format`, `skills`, `subagents`

- `qwen-code.user_prompt`: Пользователь отправляет промпт.
  - **Атрибуты**: `prompt_length` (int), `prompt_id` (string), `prompt` (string, исключается, если `log_prompts_enabled` равно false), `auth_type` (string)

- `qwen-code.user_retry`: Пользователь повторяет последний промпт.
  - **Атрибуты**: `prompt_id` (string)

- `qwen-code.conversation_finished`: Завершается последовательность ходов диалога.
  - **Атрибуты**: `approvalMode` (string), `turnCount` (int)

- `qwen-code.user_feedback`: Пользователь отправляет отзыв о сессии.
  - **Атрибуты**: `session_id` (string), `rating` (int: 1=плохо, 2=нормально, 3=хорошо), `model` (string), `approval_mode` (string), `prompt_id` (string, опционально)

#### События инструментов

- `qwen-code.tool_call`: Каждый вызов функции/инструмента.
  - **Атрибуты**: `function_name` (string), `function_args` (object), `duration_ms` (int), `status` (string: "success", "error" или "cancelled"), `success` (boolean), `decision` (string: "accept", "reject", "auto_accept" или "modify", опционально), `error` (string, опционально), `error_type` (string, опционально), `prompt_id` (string), `response_id` (string, опционально), `content_length` (int, опционально), `tool_type` (string: "native" или "mcp"), `mcp_server_name` (string, опционально), `metadata` (object, опционально — для инструментов записи файлов содержит `model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`, `model_added_chars`, `model_removed_chars`, `user_added_chars`, `user_removed_chars`)

- `qwen-code.file_operation`: Каждая операция с файлом.
  - **Атрибуты**: `tool_name` (string), `operation` (string: "create", "read", "update"), `lines` (int, опционально), `mimetype` (string, опционально), `extension` (string, опционально), `programming_language` (string, опционально)

- `qwen-code.tool_output_truncated`: Вывод инструмента превысил пороговый размер.
  - **Атрибуты**: `tool_name` (string), `original_content_length` (int), `truncated_content_length` (int), `threshold` (int), `lines` (int), `prompt_id` (string)

#### События API

- `qwen-code.api_request`: Исходящий запрос к API LLM.
  - **Атрибуты**: `model` (string), `prompt_id` (string), `request_text` (string, опционально), `subagent_name` (string, опционально)

- `qwen-code.api_response`: Ответ, полученный от API LLM.
  - **Атрибуты**: `response_id` (string), `model` (string), `status_code` (int/string, опционально), `duration_ms` (int), `input_token_count` (int), `output_token_count` (int), `cached_content_token_count` (int), `thoughts_token_count` (int), `total_token_count` (int), `prompt_id` (string), `auth_type` (string, опционально), `response_text` (string, опционально), `subagent_name` (string, опционально)

- `qwen-code.api_error`: Сбой запроса к API.
  - **Атрибуты**: `model` (string), `prompt_id` (string), `duration_ms` (int), `error_message` (string), `response_id` (string, опционально), `auth_type` (string, опционально), `error_type` (string, опционально), `status_code` (int/string, опционально), `subagent_name` (string, опционально)

  Дополнительно для совместимости генерируются стандартные алиасы OTel (`http.status_code`, `error.message`, `model_name`, `duration`).

- `qwen-code.api_cancel`: Запрос к API отменен пользователем.
  - **Атрибуты**: `model` (string), `prompt_id` (string), `auth_type` (string, опционально), `loop_wakeups_cancelled` (int, опционально)

- `qwen-code.api_retry`: Повтор запроса по HTTP-статусу (429/5xx) при вызове LLM. Отличается от `chat.content_retry`, который обрабатывает повторы `InvalidStreamError` по отдельному бюджету.
  - **Атрибуты**: `model` (string), `prompt_id` (string, опционально), `attempt_number` (int), `error_type` (string, опционально), `error_message` (string), `status_code` (int/string, опционально), `retry_delay_ms` (int), `duration_ms` (int, равно retry_delay_ms — время ожидания backoff, а не HTTP round-trip; длительность попытки см. в спане qwen-code.llm_request), `subagent_name` (string, опционально)

- `qwen-code.malformed_json_response`: Ответ `generateJson` не удалось распарсить.
  - **Атрибуты**: `model` (string)

- `qwen-code.flash_fallback`: Переключение на flash-модель в качестве запасного варианта.
  - **Атрибуты**: `auth_type` (string)

- `qwen-code.ripgrep_fallback`: Переключение на grep в качестве запасного варианта.
  - **Атрибуты**: `use_ripgrep` (boolean), `use_builtin_ripgrep` (boolean), `error` (string, опционально)

#### События отказоустойчивости

- `qwen-code.chat.content_retry`: Повтор при ошибке контента (например, пустой поток).
  - **Атрибуты**: `attempt_number` (int), `error_type` (string), `retry_delay_ms` (int), `model` (string)

- `qwen-code.chat.content_retry_failure`: Все повторы контента исчерпаны.
  - **Атрибуты**: `total_attempts` (int), `final_error_type` (string), `total_duration_ms` (int, опционально), `model` (string)

- `qwen-code.chat.invalid_chunk`: Из потока получен невалидный чанк.
  - **Атрибуты**: `error.message` (string, опционально)

#### События команд и расширений

- `qwen-code.slash_command`: Пользователь выполняет слэш-команду.
  - **Атрибуты**: `command` (string), `subcommand` (string, опционально), `status` (string: "success" или "error", опционально)

- `qwen-code.slash_command.model`: Пользователь переключает модель с помощью команды `/model`.
  - **Атрибуты**: `model_name` (string)

- `qwen-code.skill_launch`: Запускается скилл.
  - **Атрибуты**: `skill_name` (string), `success` (boolean), `prompt_id` (string)

- `qwen-code.extension_install`: Расширение установлено.
  - **Атрибуты**: `extension_name` (string), `extension_version` (string), `extension_source` (string), `status` (string: "success"/"error")

- `qwen-code.extension_uninstall`: Расширение удалено.
  - **Атрибуты**: `extension_name` (string), `status` (string)

- `qwen-code.extension_enable`: Расширение включено.
  - **Атрибуты**: `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_disable`: Расширение отключено.
  - **Атрибуты**: `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_update`: Расширение обновлено.
  - **Атрибуты**: `extension_name` (string), `extension_id` (string), `extension_previous_version` (string), `extension_version` (string), `extension_source` (string), `status` (string: "success"/"error")

- `qwen-code.ide_connection`: Событие подключения к IDE.
  - **Атрибуты**: `connection_type` (string: "start" или "session")

- `qwen-code.auth`: Событие аутентификации.
  - **Атрибуты**: `auth_type` (string), `action_type` ("auto", "manual", "coding-plan"), `status` ("success", "error", "cancelled"), `error_message` (опционально)

#### События субагентов

- `qwen-code.subagent_execution`: Событие жизненного цикла субагента.
  - **Атрибуты**: `subagent_name` (string), `status` ("started", "completed", "failed", "cancelled"), `terminate_reason` (опционально), `result` (опционально), `execution_summary` (опционально)

#### События арены

- `qwen-code.arena_session_started`: Начинается сессия арены.
  - **Атрибуты**: `arena_session_id` (string), `model_ids` (JSON-массив строк), `task_length` (int)

- `qwen-code.arena_agent_completed`: Агент арены завершает работу.
  - **Атрибуты**: `arena_session_id` (string), `agent_session_id` (string), `agent_model_id` (string), `status` (string: "completed"/"failed"/"cancelled"), `duration_ms` (int), `rounds` (int), `total_tokens` (int), `input_tokens` (int), `output_tokens` (int), `tool_calls` (int), `successful_tool_calls` (int), `failed_tool_calls` (int)

- `qwen-code.arena_session_ended`: Сессия арены завершается.
  - **Атрибуты**: `arena_session_id` (string), `status` (string: "selected"/"discarded"/"failed"/"cancelled"), `duration_ms` (int), `display_backend` (string, опционально), `agent_count` (int), `completed_agents` (int), `failed_agents` (int), `cancelled_agents` (int), `winner_model_id` (string, опционально)

#### События воркфлоу

- `qwen-code.workflow_keyword`: Срабатывает триггер ключевого слова воркфлоу.

- `qwen-code.workflow_run`: Запуск воркфлоу достигает терминального состояния.
  - **Атрибуты**: `status` (string), `agents_dispatched` (int), `agents_completed` (int), `phase_count` (int), `tokens_spent` (int), `duration_ms` (int)

#### События автопамяти

- `qwen-code.memory.extract`: Завершено извлечение памяти.
  - **Атрибуты**: `trigger` ("auto"/"manual"), `status` ("completed"/"skipped"/"failed"), `skipped_reason` (опционально), `patches_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.dream`: Завершена консолидация памяти (dream).
  - **Атрибуты**: `trigger` ("auto"/"manual"), `status` ("updated"/"noop"/"failed"/"cancelled"), `deduped_entries` (int), `touched_topics_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.recall`: Завершена операция отзыва памяти.
  - **Атрибуты**: `query_length` (int), `docs_scanned` (int), `docs_selected` (int), `strategy` ("none"/"heuristic"/"model"), `duration_ms` (int)

#### События предложений промптов и спекуляций

- `qwen-code.prompt_suggestion`: Результат предложения промпта.
  - **Атрибуты**: `outcome` ("accepted"/"ignored"/"suppressed"), `prompt_id` (опционально), `accept_method` ("tab"/"enter"/"right", опционально), `accept_source` ("live"/"fallback", опционально), `time_to_accept_ms` (опционально), `time_to_ignore_ms` (опционально), `time_to_first_keystroke_ms` (опционально), `suggestion_length` (опционально), `similarity` (опционально), `was_focused_when_shown` (опционально), `reason` (опционально)

- `qwen-code.speculation`: Результат спекулятивного выполнения.
  - **Атрибуты**: `outcome` ("accepted"/"aborted"/"failed"), `turns_used` (int), `files_written` (int), `tool_use_count` (int), `duration_ms` (int), `boundary_type` (опционально), `had_pipelined_suggestion` (boolean)

#### Другие события

- `qwen-code.chat_compression`: Контекст чата сжат.
  - **Атрибуты**: `tokens_before` (int), `tokens_after` (int), `compression_input_token_count` (int, опционально), `compression_output_token_count` (int, опционально)

- `qwen-code.next_speaker_check`: Определение следующего говорящего.
  - **Атрибуты**: `prompt_id` (string), `finish_reason` (string), `result` (string)

- `loop_detected`: Обнаружена зацикленность во время выполнения агентом. _(Примечание: генерируется без префикса `qwen-code.` — исторически сложившееся несоответствие.)_
  - **Атрибуты**: `loop_type` (string), `prompt_id` (string)

- `kitty_sequence_overflow`: Последовательность протокола графики Kitty превысила размер буфера. _(Примечание: генерируется без префикса `qwen-code.` — исторически сложившееся несоответствие.)_
  - **Атрибуты**: `sequence_length` (int), `truncated_sequence` (string, первые 20 символов)

### Метрики

Метрики — это числовые измерения поведения во времени. Имена метрик используют префикс `qwen-code.*`.

#### Основные метрики

- `qwen-code.session.count` (Counter, Int): Увеличивается на единицу при каждом запуске CLI.

- `qwen-code.tool.call.count` (Counter, Int): Подсчитывает вызовы инструментов.
  - **Атрибуты**: `function_name`, `success` (boolean), `decision` ("accept"/"reject"/"auto_accept"/"modify", опционально), `tool_type` ("mcp"/"native", опционально)

- `qwen-code.tool.call.latency` (Histogram, ms): Измеряет задержку вызова инструмента.
  - **Атрибуты**: `function_name` (string)

- `qwen-code.api.request.count` (Counter, Int): Подсчитывает все запросы к API.
  - **Атрибуты**: `model`, `status_code`, `error_type` (опционально)

- `qwen-code.api.request.latency` (Histogram, ms): Измеряет задержку запроса к API.
  - **Атрибуты**: `model` (string)

- `qwen-code.token.usage` (Counter, Int): Подсчитывает использованные токены.
  - **Атрибуты**: `model`, `type` ("input"/"output"/"thought"/"cache")

- `qwen-code.file.operation.count` (Counter, Int): Подсчитывает операции с файлами.
  - **Атрибуты**: `operation` ("create"/"read"/"update"), `lines` (опционально), `mimetype` (опционально), `extension` (опционально), `programming_language` (опционально)

- `qwen-code.chat_compression` (Counter, Int): Подсчитывает операции сжатия чата.
  - **Атрибуты**: `tokens_before` (int), `tokens_after` (int)

- `qwen-code.slash_command.model.call_count` (Counter, Int): Подсчитывает вызовы слэш-команды модели.
  - **Атрибуты**: `slash_command.model.model_name` (string)

- `qwen-code.subagent.execution.count` (Counter, Int): Подсчитывает события выполнения субагентов.
  - **Атрибуты**: `subagent_name`, `status` ("started"/"completed"/"failed"/"cancelled"), `terminate_reason` (опционально)

#### Метрики отказоустойчивости

- `qwen-code.api.retry.count` (Counter, Int): Повторы по HTTP-статусу (429/5xx) при вызовах LLM.
  - **Атрибуты**: `model` (string)

- `qwen-code.chat.content_retry.count` (Counter, Int): Повторы из-за ошибок контента.

- `qwen-code.chat.content_retry_failure.count` (Counter, Int): Все повторы контента исчерпаны.

- `qwen-code.chat.invalid_chunk.count` (Counter, Int): Невалидные чанки из потока.

#### Метрики арены

- `qwen-code.arena.session.count` (Counter, Int): Сессии арены по статусу.
  - **Атрибуты**: `status`, `display_backend` (опционально)
- `qwen-code.arena.session.duration` (Histogram, ms): Длительность сессии Arena.
  - **Атрибуты**: `status`

- `qwen-code.arena.agent.count` (Counter, Int): Количество завершений агента Arena.
  - **Атрибуты**: `status`, `model_id`

- `qwen-code.arena.agent.duration` (Histogram, ms): Длительность выполнения агента Arena.
  - **Атрибуты**: `model_id`

- `qwen-code.arena.agent.tokens` (Counter, Int): Использование токенов агентами Arena.
  - **Атрибуты**: `model_id`, `type` ("input"/"output")

- `qwen-code.arena.result.selected` (Counter, Int): Количество выборов результата в Arena.
  - **Атрибуты**: `model_id`

#### Метрики Auto-Memory

- `qwen-code.memory.extract.count` (Counter, Int): Количество запусков извлечения Auto-Memory.
  - **Атрибуты**: `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.extract.duration` (Histogram, ms): Длительность извлечения.
  - **Атрибуты**: `trigger`, `status`

- `qwen-code.memory.dream.count` (Counter, Int): Количество запусков dream в Auto-Memory.
  - **Атрибуты**: `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.dream.duration` (Histogram, ms): Длительность выполнения dream.
  - **Атрибуты**: `trigger`, `status`

- `qwen-code.memory.recall.count` (Counter, Int): Количество операций recall в Auto-Memory.
  - **Атрибуты**: `strategy` ("none"/"heuristic"/"model")

- `qwen-code.memory.recall.duration` (Histogram, ms): Длительность recall.
  - **Атрибуты**: `strategy`

#### Детализация API-запросов

- `qwen-code.api.request.breakdown` (Histogram, ms): Детализация времени API-запроса по фазам.
  - **Атрибуты**: `model`, `phase` ("request_preparation"/"network_latency"/"response_processing"/"token_processing")

### Метрики демона

Процесс демона (режим долгоживущего HTTP-сервера) предоставляет собственные метрики.

> **Note:** Три Observable Gauge (`daemon.session.active`, `daemon.sse.active`, `daemon.process.heap_used`) — это метрики на основе callback-функций, которые обновляются при каждом интервале сбора; `registerDaemonGaugeCallbacks()` должна вызываться при инициализации демона для регистрации callback-функций наблюдения.

#### HTTP

- `qwen-code.daemon.http.request.count` (Counter, Int): Количество запросов по маршрутам и классам статуса.
  - **Атрибуты**: `route`, `status_class` ("2xx"/"4xx"/"5xx")

- `qwen-code.daemon.http.request.duration` (Histogram, ms): Длительность запроса.
  - **Атрибуты**: `route`
  - **Корзины**: 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000

#### Сессии

- `qwen-code.daemon.session.active` (ObservableGauge, Int): Текущие активные сессии.

- `qwen-code.daemon.session.lifecycle` (Counter, Int): События жизненного цикла сессии.
  - **Атрибуты**: `action` ("spawn"/"close"/"die")

#### Каналы

- `qwen-code.daemon.channel.lifecycle` (Counter, Int): События жизненного цикла ACP-канала.
  - **Атрибуты**: `action` ("spawn"/"exit"), `expected` (boolean, optional)

#### Промпты

- `qwen-code.daemon.prompt.queue_wait` (Histogram, ms): Время ожидания промпта в FIFO-очереди.
  - **Корзины**: 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000

- `qwen-code.daemon.prompt.duration` (Histogram, ms): Сквозная длительность обработки промпта.
  - **Корзины**: 100, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000, 600000

#### Ошибки

- `qwen-code.daemon.bridge.error.count` (Counter, Int): Ошибки bridge по типам.
  - **Атрибуты**: `error_type` (известное имя класса или "unknown")

- `qwen-code.daemon.cancel.count` (Counter, Int): Количество запросов на отмену.

#### Ресурсы

- `qwen-code.daemon.sse.active` (ObservableGauge, Int): Активные SSE-соединения.

- `qwen-code.daemon.process.heap_used` (ObservableGauge, Int, bytes): Использование памяти кучи.

### Спаны

Спаны распределенной трассировки образуют дерево с корнем в `qwen-code.interaction`. Каждое взаимодействие является корнем трейса со своим `traceId`; для кросс-промптной корреляции используется атрибут `session.id`.

- `qwen-code.interaction`: Корневой спан для каждого хода пользовательского промпта.
  - **Атрибуты**: `session.id`, `qwen-code.prompt_id`, `qwen-code.message_type`, `qwen-code.model`, `qwen-code.approval_mode`, `interaction.sequence`, `interaction.duration_ms`, `qwen-code.turn_status` ("ok"/"error"/"cancelled")

- `qwen-code.llm_request`: Оборачивает одиночный вызов LLM API.
  - **Атрибуты**: `session.id`, `qwen-code.model`, `qwen-code.prompt_id`, `llm_request.context` ("subagent"/"interaction"/"standalone"), `gen_ai.request.model`, `duration_ms`, `input_tokens`, `output_tokens`, `cached_input_tokens`, `ttft_ms`, `request_setup_ms`, `attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`, `success`, `error`, `response_id`, `finish_reason`, `thoughts_token_count`, `subagent_name`, `error_type`, `error_status_code`

- `qwen-code.tool`: Оборачивает полный жизненный цикл инструмента (ожидание подтверждения + выполнение).
  - **Атрибуты**: `session.id`, `tool.name`, `duration_ms`, `success`, `error`

- `qwen-code.tool.execution`: Оборачивает фазу выполнения инструмента (после подтверждения).
  - **Атрибуты**: `session.id`, `duration_ms`, `success`, `error`

- `qwen-code.tool.blocked_on_user`: Время, которое инструмент тратит на ожидание подтверждения от пользователя.
  - **Атрибуты**: `session.id`, `tool.name`, `tool.call_id`, `duration_ms`, `decision` ("proceed_once"/"proceed_always"/"cancel"/"aborted"/"auto_approved"/"error"), `source` ("cli"/"ide"/"hook"/"auto"/"system")

- `qwen-code.hook`: Оборачивает каждое место срабатывания хука pre/post-tool-use.
  - **Атрибуты**: `session.id`, `hook_event` ("PreToolUse"/"PostToolUse"/"PostToolUseFailure"/"PostToolBatch"), `tool.name`, `tool.use_id` (optional), `is_interrupt` (boolean, optional), `duration_ms`, `success`, `should_proceed` (optional), `should_stop` (optional), `block_type` (optional), `error` (optional)

- `qwen-code.subagent`: Оборачивает одиночный вызов подагента.
  - **Атрибуты**: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`, `qwen-code.subagent.id`, `qwen-code.subagent.name`, `qwen-code.subagent.invocation_kind` ("foreground"/"fork"/"background"), `qwen-code.subagent.is_built_in`, `qwen-code.subagent.depth`, `qwen-code.subagent.status`, `qwen-code.subagent.terminate_reason`, `qwen-code.subagent.duration_ms`

- `qwen-code.daemon.request`: Оборачивает HTTP-запрос демона.
  - **Атрибуты**: `http.request.method`, `http.route`, `qwen-code.daemon.operation`, `session.id`, `http.response.status_code`

- `qwen-code.daemon.bridge`: Оборачивает операции bridge демона.
  - **Атрибуты**: `qwen-code.daemon.operation`

#### Метрики ресурсов

- `qwen-code.memory.usage` (Histogram, bytes): Использование памяти. Записывается монитором нехватки памяти, когда телеметрия включена.
  - **Атрибуты**: `memory_type` (string: "heap_used"/"rss")

- `qwen-code.cpu.usage` (Histogram, percent): Процент использования CPU. Записывается монитором нехватки памяти, когда телеметрия включена.
  - **Атрибуты**: (отсутствуют)

### Мониторинг производительности (Зарезервировано)

Следующие метрики определены, но **еще не включены в продакшене**. Они будут активированы через специальный флаг конфигурации мониторинга производительности.

- `qwen-code.startup.duration` (Histogram, ms): Время запуска CLI по фазам.
  - **Атрибуты**: `phase` (string)

- `qwen-code.tool.queue.depth` (Histogram, count): Количество инструментов в очереди на выполнение.

- `qwen-code.tool.execution.breakdown` (Histogram, ms): Время выполнения инструмента по фазам.
  - **Атрибуты**: `function_name`, `phase` ("validation"/"preparation"/"execution"/"result_processing")

- `qwen-code.token.efficiency` (Histogram, ratio): Метрики эффективности использования токенов.
  - **Атрибуты**: `model`, `metric`, `context` (optional)

- `qwen-code.performance.score` (Histogram, score): Сводная оценка производительности (0-100).
  - **Атрибуты**: `category`, `baseline` (optional)

- `qwen-code.performance.regression` (Counter, Int): События обнаружения регрессии.
  - **Атрибуты**: `metric`, `severity` ("low"/"medium"/"high"), `current_value`, `baseline_value`

- `qwen-code.performance.regression.percentage_change` (Histogram, percent): Процентное изменение относительно базового значения.
  - **Атрибуты**: `metric`, `severity`, `current_value`, `baseline_value`

- `qwen-code.performance.baseline.comparison` (Histogram, percent): Производительность относительно базового значения.
  - **Атрибуты**: `metric`, `category`, `current_value`, `baseline_value`