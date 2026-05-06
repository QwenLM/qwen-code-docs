# Наблюдаемость с OpenTelemetry

Узнайте, как включить и настроить OpenTelemetry для Qwen Code.

- [Наблюдаемость с OpenTelemetry](#observability-with-opentelemetry)
  - [Ключевые преимущества](#key-benefits)
  - [Интеграция с OpenTelemetry](#opentelemetry-integration)
  - [Конфигурация](#configuration)
  - [Телеметрия Aliyun](#aliyun-telemetry)
    - [Ручной экспорт OTLP](#manual-otlp-export)
  - [Локальная телеметрия](#local-telemetry)
    - [Вывод в файл (рекомендуется)](#file-based-output-recommended)
    - [Экспорт через коллектор (для продвинутых)](#collector-based-export-advanced)
  - [Логи и метрики](#logs-and-metrics)
    - [Логи](#logs)
    - [Метрики](#metrics)

## Ключевые преимущества

- **🔍 Аналитика использования**: Понимание паттернов взаимодействия и уровня принятия функций в вашей команде
- **⚡ Мониторинг производительности**: Отслеживание времени отклика, потребления токенов и использования ресурсов
- **🐛 Отладка в реальном времени**: Выявление узких мест, сбоев и паттернов ошибок по мере их возникновения
- **📊 Оптимизация рабочих процессов**: Принятие обоснованных решений для улучшения конфигураций и процессов
- **🏢 Корпоративное управление**: Мониторинг использования в командах, отслеживание затрат, обеспечение соответствия требованиям и интеграция с существующей инфраструктурой мониторинга

## Интеграция с OpenTelemetry

Система наблюдаемости Qwen Code построена на **[OpenTelemetry]** — независимом от вендора отраслевом стандарте наблюдаемости — и предоставляет:

- **Универсальная совместимость**: Экспорт в любой бэкенд OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog и др.)
- **Стандартизированные данные**: Использование единых форматов и методов сбора во всей цепочке инструментов
- **Интеграция с заделом на будущее**: Подключение к существующей и будущей инфраструктуре наблюдаемости
- **Отсутствие привязки к вендору**: Переключение между бэкендами без изменения инструментария

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Конфигурация

> [!note]
>
> **⚠️ Важное примечание: Для работы этой функции требуются соответствующие изменения в коде. Данная документация предоставлена заранее; пожалуйста, обращайтесь к будущим обновлениям кода для получения актуальной функциональности.**

Все параметры телеметрии управляются через файл `.qwen/settings.json`.
Эти настройки могут быть переопределены переменными окружения или флагами CLI.

| Настройка               | Переменная окружения                   | Флаг CLI                                                 | Описание                                          | Значения            | По умолчанию                 |
| --------------------- | -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`             | `QWEN_TELEMETRY_ENABLED`               | `--telemetry` / `--no-telemetry`                         | Включение или отключение телеметрии                          | `true`/`false`    | `false`                 |
| `target`              | `QWEN_TELEMETRY_TARGET`                | `--telemetry-target <local\|gcp>`                        | Куда отправлять данные телеметрии                         | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`        | `QWEN_TELEMETRY_OTLP_ENDPOINT`         | `--telemetry-otlp-endpoint <URL>`                        | Эндпоинт OTLP-коллектора                              | URL string        | `http://localhost:4317` |
| `otlpProtocol`        | `QWEN_TELEMETRY_OTLP_PROTOCOL`         | `--telemetry-otlp-protocol <grpc\|http>`                 | Транспортный протокол OTLP                              | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`  | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`  | -                                                        | Переопределение эндпоинта для трейсов (только HTTP)  | URL string        | -                       |
| `otlpLogsEndpoint`    | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`    | -                                                        | Переопределение эндпоинта для логов (только HTTP)    | URL string        | -                       |
| `otlpMetricsEndpoint` | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT` | -                                                        | Переопределение эндпоинта для метрик (только HTTP) | URL string        | -                       |
| `outfile`             | `QWEN_TELEMETRY_OUTFILE`               | `--telemetry-outfile <path>`                             | Сохранение телеметрии в файл (переопределяет `otlpEndpoint`)    | file path         | -                       |
| `logPrompts`          | `QWEN_TELEMETRY_LOG_PROMPTS`           | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Включение промптов в логи телеметрии                    | `true`/`false`    | `true`                  |
| `useCollector`        | `QWEN_TELEMETRY_USE_COLLECTOR`         | -                                                        | Использование внешнего OTLP-коллектора (для продвинутых)               | `true`/`false`    | `false`                 |

**Примечание о булевых переменных окружения:** Для булевых настроек (`enabled`,
`logPrompts`, `useCollector`) установка соответствующей переменной окружения в
`true` или `1` включает функцию. Любое другое значение отключает её.

**Маршрутизация сигналов HTTP OTLP:** При использовании протокола HTTP (`otlpProtocol: "http"`),
Qwen Code автоматически добавляет специфичные для сигнала пути (`/v1/traces`, `/v1/logs`,
`/v1/metrics`) к базовому `otlpEndpoint`. Например, `http://collector:4317`
превращается в `http://collector:4317/v1/traces` для трейсов. Если URL уже заканчивается
путём сигнала, он используется как есть. Переопределения эндпоинтов для отдельных сигналов
(`otlpTracesEndpoint` и др.) имеют приоритет над базовым эндпоинтом и используются
без изменений. Протокол gRPC использует маршрутизацию на основе сервисов и не добавляет пути.

Переменные окружения для эндпоинтов отдельных сигналов также принимают стандартные
имена OpenTelemetry: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`,
`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`.
Варианты `QWEN_TELEMETRY_OTLP_*` имеют приоритет над вариантами `OTEL_*`.

Подробную информацию обо всех параметрах конфигурации см. в
[Руководстве по конфигурации](./cli/configuration.md).

## Телеметрия Aliyun

### Ручной экспорт OTLP

Чтобы просматривать телеметрию Qwen Code в Alibaba Cloud Managed Service for
OpenTelemetry, настройте Qwen Code на экспорт в OTLP-эндпоинт,
предоставленный ARMS.

Установка только `"target": "gcp"` не настраивает конечную точку экспорта.
Если `otlpEndpoint` не задан, Qwen Code по умолчанию использует
`http://localhost:4317`. Если задан `outfile`, он переопределяет
`otlpEndpoint`, и телеметрия записывается в файл вместо отправки
в Alibaba Cloud.

1. Включите телеметрию в вашем `.qwen/settings.json` и задайте OTLP-эндпоинт:

   **Вариант A: Протокол gRPC** (стандартный OTLP-эндпоинт):

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

   **Вариант B: Протокол HTTP с эндпоинтами для отдельных сигналов** (для бэкендов,
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
   > переопределений для отдельных сигналов) Qwen Code добавляет стандартные пути OTLP
   > (`/v1/traces`, `/v1/logs`, `/v1/metrics`) к базовому URL. Если ваш
   > бэкенд использует другие пути, используйте переопределения эндпоинтов для отдельных сигналов, как
   > показано в Варианте B.

2. Если ваш эндпоинт Alibaba Cloud требует аутентификации, передайте заголовки OTLP
   через стандартные переменные окружения OpenTelemetry, такие как
   `OTEL_EXPORTER_OTLP_HEADERS` (или их варианты для отдельных сигналов). Qwen
   Code в настоящее время не предоставляет заголовки аутентификации OTLP напрямую в
   `.qwen/settings.json`.
3. Запустите Qwen Code и отправьте промпты.
4. Просмотр телеметрии в Managed Service for OpenTelemetry:
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
   - В консоли используйте раздел `Applications` для анализа трейсов и топологии сервисов.
   - Для поиска OTLP-эндпоинта и информации о доступе:
     - **Новая консоль** (`trace.console.aliyun.com` или международная):
       перейдите в `Integration Center`.
     - **Устаревшая консоль** (`tracing.console.aliyun.com`): перейдите в
       `Cluster Configurations` → `Access point information`.

## Локальная телеметрия

Для локальной разработки и отладки вы можете собирать данные телеметрии локально:

### Вывод в файл (рекомендуется)

1. Включите телеметрию в вашем `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "local",
       "otlpEndpoint": "",
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```
2. Запустите Qwen Code и отправьте промпты.
3. Просмотрите логи и метрики в указанном файле (например, `.qwen/telemetry.log`).

### Экспорт через коллектор (для продвинутых)

1. Запустите скрипт автоматизации:
   ```bash
   npm run telemetry -- --target=local
   ```
   Это выполнит следующее:
   - Скачает и запустит Jaeger и OTEL-коллектор
   - Настроит ваше рабочее пространство для локальной телеметрии
   - Предоставит интерфейс Jaeger UI по адресу http://localhost:16686
   - Сохранит логи/метрики в `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Остановит коллектор при выходе (например, `Ctrl+C`)
2. Запустите Qwen Code и отправьте промпты.
3. Просмотрите трейсы по адресу http://localhost:16686, а логи и метрики — в файле лога коллектора.

## Логи и метрики

В следующем разделе описана структура логов и метрик, генерируемых для
Qwen Code.

- `sessionId` включается как общий атрибут во все логи и метрики.

### Логи

Логи представляют собой временные метки конкретных событий. Для Qwen Code логируются следующие события:

- `qwen-code.config`: Это событие происходит один раз при запуске с конфигурацией CLI.
  - **Атрибуты**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, типы событий хуков, разделённые запятыми; опускается, если хуки отключены)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" или "json")

- `qwen-code.user_prompt`: Это событие происходит, когда пользователь отправляет промпт.
  - **Атрибуты**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, этот атрибут исключается, если `log_prompts_enabled` настроен как `false`)
    - `auth_type` (string)

- `qwen-code.tool_call`: Это событие происходит для каждого вызова инструмента.
  - **Атрибуты**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept" или "modify", если применимо)
    - `error` (если применимо)
    - `error_type` (если применимо)
    - `content_length` (int, если применимо)
    - `metadata` (если применимо, словарь string -> any)

- `qwen-code.file_operation`: Это событие происходит для каждой операции с файлом.
  - **Атрибуты**:
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, если применимо)
    - `mimetype` (string, если применимо)
    - `extension` (string, если применимо)
    - `programming_language` (string, если применимо)
    - `diff_stat` (json string, если применимо): JSON-строка со следующими полями:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Это событие происходит при выполнении запроса к Qwen API.
  - **Атрибуты**:
    - `model`
    - `request_text` (если применимо)

- `qwen-code.api_error`: Это событие происходит, если запрос к API завершается ошибкой.
  - **Атрибуты**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: Это событие происходит при получении ответа от Qwen API.
  - **Атрибуты**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (опционально)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `response_text` (если применимо)
    - `auth_type`

- `qwen-code.tool_output_truncated`: Это событие происходит, когда вывод вызова инструмента слишком велик и обрезается.
  - **Атрибуты**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: Это событие происходит, когда ответ `generateJson` от Qwen API не может быть разобран как JSON.
  - **Атрибуты**:
    - `model`

- `qwen-code.flash_fallback`: Это событие происходит, когда Qwen Code переключается на flash в качестве резервного варианта.
  - **Атрибуты**:
    - `auth_type`

- `qwen-code.slash_command`: Это событие происходит, когда пользователь выполняет слэш-команду.
  - **Атрибуты**:
    - `command` (string)
    - `subcommand` (string, если применимо)

- `qwen-code.extension_enable`: Это событие происходит при включении расширения
- `qwen-code.extension_install`: Это событие происходит при установке расширения
  - **Атрибуты**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: Это событие происходит при удалении расширения

### Метрики

Метрики представляют собой числовые измерения поведения во времени. Для Qwen Code собираются следующие метрики (имена метрик остаются `qwen-code.*` для совместимости):

- `qwen-code.session.count` (Counter, Int): Увеличивается на единицу при каждом запуске CLI.

- `qwen-code.tool.call.count` (Counter, Int): Подсчитывает вызовы инструментов.
  - **Атрибуты**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject" или "modify", если применимо)
    - `tool_type` (string: "mcp" или "native", если применимо)

- `qwen-code.tool.call.latency` (Histogram, ms): Измеряет задержку вызова инструмента.
  - **Атрибуты**:
    - `function_name`
    - `decision` (string: "accept", "reject" или "modify", если применимо)

- `qwen-code.api.request.count` (Counter, Int): Подсчитывает все запросы к API.
  - **Атрибуты**:
    - `model`
    - `status_code`
    - `error_type` (если применимо)

- `qwen-code.api.request.latency` (Histogram, ms): Измеряет задержку запроса к API.
  - **Атрибуты**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): Подсчитывает количество использованных токенов.
  - **Атрибуты**:
    - `model`
    - `type` (string: "input", "output", "thought" или "cache")

- `qwen-code.file.operation.count` (Counter, Int): Подсчитывает операции с файлами.
  - **Атрибуты**:
    - `operation` (string: "create", "read", "update"): Тип операции с файлом.
    - `lines` (Int, если применимо): Количество строк в файле.
    - `mimetype` (string, если применимо): MIME-тип файла.
    - `extension` (string, если применимо): Расширение файла.
    - `model_added_lines` (Int, если применимо): Количество строк, добавленных/изменённых моделью.
    - `model_removed_lines` (Int, если применимо): Количество строк, удалённых/изменённых моделью.
    - `user_added_lines` (Int, если применимо): Количество строк, добавленных/изменённых пользователем в предложенных ИИ изменениях.
    - `user_removed_lines` (Int, если применимо): Количество строк, удалённых/изменённых пользователем в предложенных ИИ изменениях.
    - `programming_language` (string, если применимо): Язык программирования файла.

- `qwen-code.chat_compression` (Counter, Int): Подсчитывает операции сжатия чата
  - **Атрибуты**:
    - `tokens_before`: (Int): Количество токенов в контексте до сжатия
    - `tokens_after`: (Int): Количество токенов в контексте после сжатия