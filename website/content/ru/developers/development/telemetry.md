# Наблюдаемость с OpenTelemetry

Узнайте, как включить и настроить OpenTelemetry для Qwen Code.

- [Наблюдаемость с OpenTelemetry](#observability-with-opentelemetry)
  - [Ключевые преимущества](#key-benefits)
  - [Интеграция с OpenTelemetry](#opentelemetry-integration)
  - [Конфигурация](#configuration)
  - [Телеметрия Aliyun](#aliyun-telemetry)
    - [Предварительные требования](#prerequisites)
    - [Прямой экспорт (рекомендуется)](#direct-export-recommended)
  - [Локальная телеметрия](#local-telemetry)
    - [Вывод в файл (рекомендуется)](#file-based-output-recommended)
    - [Экспорт через коллектор (для продвинутых)](#collector-based-export-advanced)
  - [Логи и метрики](#logs-and-metrics)
    - [Логи](#logs)
    - [Метрики](#metrics)

## Ключевые преимущества

- **🔍 Аналитика использования**: Понимание паттернов взаимодействия и уровня внедрения функций в вашей команде
- **⚡ Мониторинг производительности**: Отслеживание времени отклика, потребления токенов и использования ресурсов
- **🐛 Отладка в реальном времени**: Выявление узких мест, сбоев и паттернов ошибок по мере их возникновения
- **📊 Оптимизация рабочих процессов**: Принятие обоснованных решений для улучшения конфигураций и процессов
- **🏢 Корпоративное управление**: Мониторинг использования в командах, отслеживание затрат, обеспечение соответствия требованиям и интеграция с существующей инфраструктурой мониторинга

## Интеграция с OpenTelemetry

Построенная на базе **[OpenTelemetry]** — независимого от вендора отраслевого стандарта наблюдаемости — система наблюдаемости Qwen Code предоставляет:

- **Универсальная совместимость**: Экспорт в любой бэкенд OpenTelemetry (Aliyun, Jaeger, Prometheus, Datadog и др.)
- **Стандартизированные данные**: Использование единых форматов и методов сбора во всем вашем наборе инструментов
- **Интеграция с заделом на будущее**: Подключение к существующей и будущей инфраструктуре наблюдаемости
- **Отсутствие привязки к вендору**: Переключение между бэкендами без изменения вашего инструментария

[OpenTelemetry]: https://opentelemetry.io/

## Конфигурация

> [!note]
>
> **⚠️ Важное примечание: Для работы этой функции требуются соответствующие изменения в коде. Эта документация предоставлена заранее; пожалуйста, обращайтесь к будущим обновлениям кода для получения актуальной функциональности.**

Все параметры телеметрии управляются через файл `.qwen/settings.json`.
Эти настройки могут быть переопределены переменными окружения или флагами CLI.

| Настройка        | Переменная окружения           | Флаг CLI                                                 | Описание                                       | Значения             | По умолчанию                 |
| -------------- | ------------------------------ | -------------------------------------------------------- | ------------------------------------------------- | ------------------ | ----------------------- |
| `enabled`      | `QWEN_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | Включение или отключение телеметрии                       | `true`/`false`     | `false`                 |
| `target`       | `QWEN_TELEMETRY_TARGET`        | `--telemetry-target <local\|qwen>`                       | Куда отправлять данные телеметрии                      | `"qwen"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | Эндпоинт OTLP-коллектора                           | URL string         | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | Транспортный протокол OTLP                           | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `QWEN_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                             | Сохранение телеметрии в файл (переопределяет `otlpEndpoint`) | file path          | -                       |
| `logPrompts`   | `QWEN_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Включение промптов в логи телеметрии                 | `true`/`false`     | `true`                  |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR` | -                                                        | Использование внешнего OTLP-коллектора (для продвинутых)            | `true`/`false`     | `false`                 |

**Примечание о булевых переменных окружения:** Для булевых настроек (`enabled`,
`logPrompts`, `useCollector`) установка соответствующей переменной окружения в
`true` или `1` включит функцию. Любое другое значение отключит её.

Подробную информацию обо всех параметрах конфигурации см. в
[Руководстве по конфигурации](./cli/configuration.md).

## Телеметрия Aliyun

### Прямой экспорт (рекомендуется)

Отправляет телеметрию напрямую в сервисы Aliyun. Коллектор не требуется.

1. Включите телеметрию в вашем `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Запустите Qwen Code и отправляйте промпты.
3. Просматривайте логи и метрики в консоли Aliyun.

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
2. Запустите Qwen Code и отправляйте промпты.
3. Просматривайте логи и метрики в указанном файле (например, `.qwen/telemetry.log`).

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
2. Запустите Qwen Code и отправляйте промпты.
3. Просматривайте трейсы по адресу http://localhost:16686, а логи и метрики — в файле лога коллектора.

## Логи и метрики

В следующем разделе описана структура логов и метрик, генерируемых для
Qwen Code.

- `sessionId` включен как общий атрибут во все логи и метрики.

### Логи

Логи представляют собой записи конкретных событий с временными метками. Для Qwen Code логируются следующие события:

- `qwen-code.config`: Это событие возникает один раз при запуске вместе с конфигурацией CLI.
  - **Attributes**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, comma-separated hook event types, omitted if hooks disabled)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" or "json")

- `qwen-code.user_prompt`: Это событие возникает при отправке промпта пользователем.
  - **Attributes**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, этот атрибут исключается, если `log_prompts_enabled` настроен как `false`)
    - `auth_type` (string)

- `qwen-code.tool_call`: Это событие возникает для каждого вызова функции.
  - **Attributes**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept" или "modify", если применимо)
    - `error` (если применимо)
    - `error_type` (если применимо)
    - `content_length` (int, если применимо)
    - `metadata` (если применимо, словарь string -> any)

- `qwen-code.file_operation`: Это событие возникает для каждой операции с файлом.
  - **Attributes**:
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

- `qwen-code.api_request`: Это событие возникает при выполнении запроса к Qwen API.
  - **Attributes**:
    - `model`
    - `request_text` (если применимо)

- `qwen-code.api_error`: Это событие возникает, если запрос к API завершается ошибкой.
  - **Attributes**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: Это событие возникает при получении ответа от Qwen API.
  - **Attributes**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (опционально)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
    - `response_text` (если применимо)
    - `auth_type`

- `qwen-code.tool_output_truncated`: Это событие возникает, когда вывод вызова инструмента слишком большой и обрезается.
  - **Attributes**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: Это событие возникает, когда ответ `generateJson` от Qwen API не может быть распарсен как JSON.
  - **Attributes**:
    - `model`

- `qwen-code.flash_fallback`: Это событие возникает, когда Qwen Code переключается на flash в качестве резервного варианта.
  - **Attributes**:
    - `auth_type`

- `qwen-code.slash_command`: Это событие возникает при выполнении пользователем слэш-команды.
  - **Attributes**:
    - `command` (string)
    - `subcommand` (string, если применимо)

- `qwen-code.extension_enable`: Это событие возникает при включении расширения
- `qwen-code.extension_install`: Это событие возникает при установке расширения
  - **Attributes**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: Это событие возникает при удалении расширения

### Метрики

Метрики представляют собой числовые измерения поведения во времени. Для Qwen Code собираются следующие метрики (имена метрик остаются `qwen-code.*` для обеспечения совместимости):

- `qwen-code.session.count` (Counter, Int): Увеличивается на единицу при каждом запуске CLI.

- `qwen-code.tool.call.count` (Counter, Int): Подсчитывает вызовы инструментов.
  - **Attributes**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject" или "modify", если применимо)
    - `tool_type` (string: "mcp" или "native", если применимо)

- `qwen-code.tool.call.latency` (Histogram, ms): Измеряет задержку вызова инструмента.
  - **Attributes**:
    - `function_name`
    - `decision` (string: "accept", "reject" или "modify", если применимо)

- `qwen-code.api.request.count` (Counter, Int): Подсчитывает все запросы к API.
  - **Attributes**:
    - `model`
    - `status_code`
    - `error_type` (если применимо)

- `qwen-code.api.request.latency` (Histogram, ms): Измеряет задержку запроса к API.
  - **Attributes**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): Подсчитывает количество использованных токенов.
  - **Attributes**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache" или "tool")

- `qwen-code.file.operation.count` (Counter, Int): Подсчитывает операции с файлами.
  - **Attributes**:
    - `operation` (string: "create", "read", "update"): Тип операции с файлом.
    - `lines` (Int, если применимо): Количество строк в файле.
    - `mimetype` (string, если применимо): MIME-тип файла.
    - `extension` (string, если применимо): Расширение файла.
    - `model_added_lines` (Int, если применимо): Количество строк, добавленных/измененных моделью.
    - `model_removed_lines` (Int, если применимо): Количество строк, удаленных/измененных моделью.
    - `user_added_lines` (Int, если применимо): Количество строк, добавленных/измененных пользователем в предложенных ИИ изменениях.
    - `user_removed_lines` (Int, если применимо): Количество строк, удаленных/измененных пользователем в предложенных ИИ изменениях.
    - `programming_language` (string, если применимо): Язык программирования файла.

- `qwen-code.chat_compression` (Counter, Int): Подсчитывает операции сжатия чата
  - **Attributes**:
    - `tokens_before`: (Int): Количество токенов в контексте до сжатия
    - `tokens_after`: (Int): Количество токенов в контексте после сжатия