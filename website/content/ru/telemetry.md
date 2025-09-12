# Руководство по наблюдаемости Qwen Code

Телеметрия предоставляет данные о производительности, состоянии и использовании Qwen Code. Включив её, вы сможете отслеживать операции, отлаживать проблемы и оптимизировать использование инструментов с помощью трассировок, метрик и структурированных логов.

Система телеметрии Qwen Code построена на стандарте **[OpenTelemetry] (OTEL)**, что позволяет отправлять данные в любой совместимый бэкенд.

[OpenTelemetry]: https://opentelemetry.io/

## Включение телеметрии

Телеметрию можно включить несколькими способами. Основная настройка осуществляется через файл [`.qwen/settings.json`](./cli/configuration.md) и переменные окружения, но флаги CLI могут переопределять эти настройки для конкретной сессии.

### Порядок приоритета

Ниже перечислен порядок приоритета применения настроек телеметрии, где элементы, указанные выше, имеют больший приоритет:

1.  **Флаги CLI (для команды `qwen`):**
    - `--telemetry` / `--no-telemetry`: Переопределяет `telemetry.enabled`.
    - `--telemetry-target <local|gcp>`: Переопределяет `telemetry.target`.
    - `--telemetry-otlp-endpoint <URL>`: Переопределяет `telemetry.otlpEndpoint`.
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`: Переопределяет `telemetry.logPrompts`.
    - `--telemetry-outfile <path>`: Перенаправляет вывод телеметрии в файл. См. [Экспорт в файл](#exporting-to-a-file).

1.  **Переменные окружения:**
    - `OTEL_EXPORTER_OTLP_ENDPOINT`: Переопределяет `telemetry.otlpEndpoint`.

1.  **Файл настроек рабочей области (`.qwen/settings.json`):** Значения из объекта `telemetry` в этом файле, специфичном для проекта.

1.  **Файл пользовательских настроек (`~/.qwen/settings.json`):** Значения из объекта `telemetry` в этом глобальном файле пользователя.

1.  **Значения по умолчанию:** применяются, если не заданы выше.
    - `telemetry.enabled`: `false`
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true`

**Для скрипта `npm run telemetry -- --target=<gcp|local>`:**
Аргумент `--target` для этого скрипта _только_ переопределяет `telemetry.target` на время выполнения и для целей этого скрипта (т.е. выбора collector'а, который нужно запустить). Он не изменяет ваш `settings.json` на постоянной основе. Скрипт сначала проверит `settings.json` на наличие `telemetry.target`, чтобы использовать его как значение по умолчанию.

### Пример настроек

Следующий код можно добавить в настройки рабочей области (`.qwen/settings.json`) или пользователя (`~/.qwen/settings.json`), чтобы включить телеметрию и отправлять данные в Google Cloud:

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp"
  },
  "sandbox": false
}
```

### Экспорт в файл

Вы можете экспортировать все данные телеметрии в файл для локального анализа.

Чтобы включить экспорт в файл, используйте флаг `--telemetry-outfile`, указав путь к желаемому файлу вывода. Это необходимо запускать с параметром `--telemetry-target=local`.

```bash

# Укажите путь к файлу, в который хотите сохранить телеметрию
TELEMETRY_FILE=".qwen/telemetry.log"

# Запустите Qwen Code с локальной телеметрией

# ПРИМЕЧАНИЕ: --telemetry-otlp-endpoint="" требуется для отключения стандартного

# экспортера OTLP и обеспечения записи телеметрии в локальный файл.
qwen --telemetry \
  --telemetry-target=local \
  --telemetry-otlp-endpoint="" \
  --telemetry-outfile="$TELEMETRY_FILE" \
  --prompt "What is OpenTelemetry?"
```

## Запуск OTEL Collector

OTEL Collector — это сервис, который получает, обрабатывает и экспортирует телеметрические данные.  
CLI может отправлять данные, используя либо протокол OTLP/gRPC, либо OTLP/HTTP.  
Выбрать протокол можно с помощью флага `--telemetry-otlp-protocol`  
или настройки `telemetry.otlpProtocol` в файле `settings.json`. Подробнее — в  
[документации по конфигурации](./cli/configuration.md#--telemetry-otlp-protocol).

Узнать больше о стандартной конфигурации OTEL exporter можно в [документации][otel-config-docs].

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### Local

Используйте команду `npm run telemetry -- --target=local`, чтобы автоматизировать процесс настройки локального telemetry pipeline, включая конфигурацию необходимых параметров в вашем файле `.qwen/settings.json`. Скрипт устанавливает `otelcol-contrib` (OpenTelemetry Collector) и `jaeger` (Jaeger UI для просмотра трассировок). Чтобы начать работу:

1.  **Выполните команду**:
    Запустите команду из корня репозитория:

    ```bash
    npm run telemetry -- --target=local
    ```

    Скрипт выполнит следующие действия:
    - Загрузит Jaeger и OTEL, если это необходимо.
    - Запустит локальный экземпляр Jaeger.
    - Запустит OTEL collector, настроенный на получение данных от Qwen Code.
    - Автоматически включит telemetry в настройках вашего workspace.
    - При завершении отключит telemetry.

1.  **Просмотр трассировок**:
    Откройте браузер и перейдите по адресу **http://localhost:16686**, чтобы получить доступ к Jaeger UI. Здесь вы сможете изучить подробные трассировки операций Qwen Code.

1.  **Просмотр логов и метрик**:
    Скрипт перенаправляет вывод OTEL collector (включая логи и метрики) в файл `~/.qwen/tmp/<projectHash>/otel/collector.log`. Скрипт также предоставит ссылки для просмотра и команду для отслеживания ваших telemetry данных (трассировки, метрики, логи) в реальном времени.

1.  **Остановка сервисов**:
    Нажмите `Ctrl+C` в терминале, где запущен скрипт, чтобы остановить OTEL Collector и Jaeger.

### Google Cloud

Используйте команду `npm run telemetry -- --target=gcp`, чтобы автоматизировать настройку локального OpenTelemetry collector, который будет пересылать данные в ваш проект Google Cloud, включая конфигурацию необходимых параметров в файле `.qwen/settings.json`. Скрипт устанавливает `otelcol-contrib`. Чтобы использовать его:

1.  **Предварительные требования**:
    - У вас должен быть ID проекта Google Cloud.
    - Экспортируйте переменную окружения `GOOGLE_CLOUD_PROJECT`, чтобы она была доступна для OTEL collector.
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - Пройдите аутентификацию в Google Cloud (например, выполните `gcloud auth application-default login` или убедитесь, что установлена переменная `GOOGLE_APPLICATION_CREDENTIALS`).
    - Убедитесь, что у вашей учетной записи Google Cloud или сервисной учетной записи есть необходимые роли IAM: "Cloud Trace Agent", "Monitoring Metric Writer" и "Logs Writer".

1.  **Выполните команду**:
    Запустите команду из корня репозитория:

    ```bash
    npm run telemetry -- --target=gcp
    ```

    Скрипт выполнит следующие действия:
    - Загрузит бинарный файл `otelcol-contrib`, если это необходимо.
    - Запустит OTEL collector, настроенный на получение данных от Qwen Code и их экспорт в указанный проект Google Cloud.
    - Автоматически включит телеметрию и отключит sandbox mode в настройках вашего workspace (`.qwen/settings.json`).
    - Предоставит прямые ссылки для просмотра трассировок, метрик и логов в Google Cloud Console.
    - При завершении работы (Ctrl+C) попытается восстановить исходные настройки телеметрии и sandbox mode.

1.  **Запустите Qwen Code**:
    В отдельном терминале выполните команды Qwen Code. Это сгенерирует данные телеметрии, которые будут захвачены collector.

1.  **Просмотр телеметрии в Google Cloud**:
    Используйте ссылки, предоставленные скриптом, чтобы перейти в Google Cloud Console и просмотреть трассировки, метрики и логи.

1.  **Просмотр логов локального collector**:
    Скрипт перенаправляет вывод локального OTEL collector в `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log`. Скрипт также предоставляет ссылки и команды для просмотра логов collector локально.

1.  **Остановка сервиса**:
    Нажмите `Ctrl+C` в терминале, где запущен скрипт, чтобы остановить OTEL Collector.

## Справочник по логам и метрикам

В данном разделе описывается структура логов и метрик, генерируемых для Qwen Code.

- `sessionId` включается как общий атрибут во все логи и метрики.

### Логи

Логи — это записи с меткой времени о конкретных событиях. Для Qwen Code логируются следующие события:

- `qwen-code.config`: Это событие происходит один раз при запуске и содержит конфигурацию CLI.
  - **Атрибуты**:
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)

- `qwen-code.user_prompt`: Это событие происходит, когда пользователь отправляет prompt.
  - **Атрибуты**:
    - `prompt_length`
    - `prompt` (этот атрибут исключается, если `log_prompts_enabled` установлен в `false`)
    - `auth_type`

- `qwen-code.tool_call`: Это событие происходит при каждом вызове функции.
  - **Атрибуты**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept", или "modify", если применимо)
    - `error` (если применимо)
    - `error_type` (если применимо)
    - `metadata` (если применимо, словарь string -> any)

- `qwen-code.api_request`: Это событие происходит при отправке запроса к Qwen API.
  - **Атрибуты**:
    - `model`
    - `request_text` (если применимо)

- `qwen-code.api_error`: Это событие происходит, если запрос к API завершился ошибкой.
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
    - `tool_token_count`
    - `response_text` (если применимо)
    - `auth_type`

- `qwen-code.flash_fallback`: Это событие происходит, когда Qwen Code переключается на flash в качестве резервного варианта.
  - **Атрибуты**:
    - `auth_type`

- `qwen-code.slash_command`: Это событие происходит, когда пользователь выполняет slash-команду.
  - **Атрибуты**:
    - `command` (string)
    - `subcommand` (string, если применимо)

### Метрики

Метрики — это числовые измерения поведения за определённый период времени. Для Qwen Code собираются следующие метрики (названия метрик остаются `qwen-code.*` для совместимости):

- `qwen-code.session.count` (Counter, Int): Увеличивается на 1 при каждом запуске CLI.

- `qwen-code.tool.call.count` (Counter, Int): Считает количество вызовов инструментов.
  - **Атрибуты**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", или "modify", если применимо)
    - `tool_type` (string: "mcp", или "native", если применимо)

- `qwen-code.tool.call.latency` (Histogram, ms): Измеряет задержку вызовов инструментов.
  - **Атрибуты**:
    - `function_name`
    - `decision` (string: "accept", "reject", или "modify", если применимо)

- `qwen-code.api.request.count` (Counter, Int): Считает все API-запросы.
  - **Атрибуты**:
    - `model`
    - `status_code`
    - `error_type` (если применимо)

- `qwen-code.api.request.latency` (Histogram, ms): Измеряет задержку API-запросов.
  - **Атрибуты**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): Считает количество использованных токенов.
  - **Атрибуты**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache", или "tool")

- `qwen-code.file.operation.count` (Counter, Int): Считает количество операций с файлами.
  - **Атрибуты**:
    - `operation` (string: "create", "read", "update"): Тип операции с файлом.
    - `lines` (Int, если применимо): Количество строк в файле.
    - `mimetype` (string, если применимо): MIME-тип файла.
    - `extension` (string, если применимо): Расширение файла.
    - `ai_added_lines` (Int, если применимо): Количество строк, добавленных/изменённых AI.
    - `ai_removed_lines` (Int, если применимо): Количество строк, удалённых/изменённых AI.
    - `user_added_lines` (Int, если применимо): Количество строк, добавленных/изменённых пользователем в предложенных AI изменениях.
    - `user_removed_lines` (Int, если применимо): Количество строк, удалённых/изменённых пользователем в предложенных AI изменениях.

- `qwen-code.chat_compression` (Counter, Int): Считает количество операций сжатия чата.
  - **Атрибуты**:
    - `tokens_before`: (Int): Количество токенов в контексте до сжатия.
    - `tokens_after`: (Int): Количество токенов в контексте после сжатия.