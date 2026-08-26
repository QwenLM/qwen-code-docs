# Headless-режим

Headless-режим позволяет запускать Qwen Code программно из скриптов командной строки и инструментов автоматизации без какого-либо интерактивного интерфейса. Это идеально подходит для написания скриптов, автоматизации, CI/CD пайплайнов и создания инструментов на базе ИИ.

## Обзор

Headless-режим предоставляет программный интерфейс Qwen Code, который:

- Принимает промпты через аргументы командной строки или stdin
- Возвращает структурированный вывод (текст или JSON)
- Поддерживает перенаправление файлов и конвейеры
- Позволяет автоматизировать рабочие процессы и создавать скрипты
- Возвращает предсказуемые коды завершения для обработки ошибок
- Может возобновлять предыдущие сессии в рамках текущего проекта для многошаговой автоматизации

## Базовое использование

### Прямые промпты

Используйте флаг `--prompt` (или `-p`) для запуска в headless-режиме:

```bash
qwen --prompt "What is machine learning?"
```

### Ввод через stdin

Передайте ввод в Qwen Code через конвейер из терминала:

```bash
echo "Explain this code" | qwen
```

### Комбинирование с вводом из файла

Читайте файлы и обрабатывайте их с помощью Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Возобновление предыдущих сессий (Headless)

Повторно используйте контекст диалога из текущего проекта в headless-скриптах:

```bash
# Continue the most recent session for this project and run a new prompt
qwen --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Данные сессии хранятся в формате JSONL в рамках проекта по пути `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Восстанавливает историю диалога, результаты работы инструментов и контрольные точки сжатия чата перед отправкой нового промпта.

## Запуск постоянных целей

Headless-режим принимает `/goal` в качестве полного промпта. Состояние цели хранится вместе с сессией, поэтому используйте `--continue` или `--resume <sessionId>`, чтобы проверить или управлять той же целью из последующего процесса. Для этого требуется, чтобы `general.chatRecording` оставалась включённой (по умолчанию).

```bash
# Создать цель и запустить её обработчик
qwen -p "/goal Finish the release checklist"

# Проверить сохранённое состояние в той же сессии
qwen --continue -p "/goal"
```

Используйте тот же паттерн `qwen --continue -p "<control>"` для остальных операций:

| Управление                             | Поведение                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/goal`                                | Сообщить сохранённое состояние без вызова модели.                                        |
| `/goal <objective>` или `/goal set …`  | Создать или заменить цель и запустить headless-работу над цельюю.                        |
| `/goal edit <objective>`               | Изменить незавершённую цель; работа начинается немедленно, если результирующее состояние активно. |
| `/goal pause`                          | Приостановить активную цель без вызова модели.                                           |
| `/goal resume`                         | Возобновить доступную цель и запустить headless-работу над цельюю.                       |
| `/goal clear`                          | Очистить цель без подтверждения и вызова модели.                                         |

Запланированные средой выполнения сегменты продолжения цели не учитываются в `--max-session-turns`, но реальные промпты пользователя по-прежнему учитываются. Явные бюджеты `--max-wall-time` и `--max-tool-calls` продолжают действовать; превышение любого из них приостанавливает активную работу над цельюю перед завершением запуска с ошибкой, специфичной для данного бюджета.

При использовании `--output-format stream-json` каждое изменение состояния цели генерирует `stream_event`, у которого `event.type` равен `goal_state`. Это каноническое событие состояния генерируется даже без `--include-partial-messages`. Когда частичные сообщения включены, более старое событие `active_goal` следует как проекция для обратной совместимости; автоматизация должна считать `goal_state` авторитетным источником.

> [!note]
>
> Это поведение относится к стандартным запускам headless-режима через CLI. ACP по-прежнему использует устаревший путь команд Goal.

## Настройка системного промпта основной сессии

Вы можете изменить системный промпт основной сессии для одного запуска CLI без редактирования файлов общей памяти.

### Переопределение встроенного системного промпта

Используйте `--system-prompt`, чтобы заменить встроенный промпт основной сессии Qwen Code для текущего запуска:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Добавление дополнительных инструкций

Используйте `--append-system-prompt`, чтобы сохранить встроенный промпт и добавить дополнительные инструкции для этого запуска:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Вы можете объединить оба флага, если хотите использовать пользовательский базовый промпт вместе с дополнительной инструкцией для конкретного запуска:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` применяется только к основной сессии текущего запуска.
> - Загруженные файлы памяти и контекста, такие как `QWEN.md`, по-прежнему добавляются после `--system-prompt`.
> - `--append-system-prompt` применяется после встроенного промпта и загруженной памяти, и может использоваться совместно с `--system-prompt`.

## Форматы вывода

Qwen Code поддерживает несколько форматов вывода для различных сценариев использования:

### Текстовый вывод (по умолчанию)

Стандартный читаемый текстовый вывод:

```bash
qwen -p "What is the capital of France?"
```

Формат ответа:

```
The capital of France is Paris.
```

### JSON-вывод

Возвращает структурированные данные в виде JSON-массива. Все сообщения буферизуются и выводятся вместе после завершения сессии. Этот формат идеально подходит для программной обработки и скриптов автоматизации.

JSON-вывод представляет собой массив объектов сообщений. Вывод включает несколько типов сообщений: системные сообщения (инициализация сессии), сообщения ассистента (ответы ИИ) и сообщения с результатами (сводка выполнения).

#### Пример использования

```bash
qwen -p "What is the capital of France?" --output-format json
```

Вывод (в конце выполнения):

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Вывод в формате Stream-JSON

Формат Stream-JSON отправляет JSON-сообщения немедленно по мере их появления во время выполнения, что позволяет отслеживать процесс в реальном времени. Этот формат использует JSON с разделением по строкам, где каждое сообщение представляет собой полный JSON-объект в одной строке.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Вывод (потоковая передача по мере возникновения событий):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

При использовании совместно с флагом `--include-partial-messages` дополнительные события потока передаются в реальном времени (message_start, content_block_delta и т.д.) для обновления интерфейса в реальном времени.

Для вывода в форматах JSON и stream-JSON текстовые значения `tool_result.content` ограничиваются до 65 536 байт UTF-8 после сериализации в JSON-строку. Превышающие размер значения выводятся как детерминированные превью начала и конца. То же ограничение применяется к постоянным сессиям stream-JSON, транспортам SDK, результатам инструментов субагентов и Dual Output. Текстовый режим по-прежнему выводит только финальный ответ, сохраняя внутри только ограниченный превью. Этот лимит не ограничивает JSON-сессию целиком, событие JSONL, ввод инструмента или частичное сообщение.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Формат ввода

Параметр `--input-format` управляет тем, как Qwen Code потребляет ввод из стандартного ввода:

- **`text`** (по умолчанию): Стандартный текстовый ввод из stdin или аргументов командной строки
- **`stream-json`**: Протокол JSON-сообщений через stdin для двусторонней связи

> **Примечание:** Режим ввода stream-json находится в стадии разработки и предназначен для интеграции с SDK. Он требует установки `--output-format stream-json`.

### Перенаправление файлов

Сохраните вывод в файлы или передайте его в другие команды через конвейер:

```bash
# Save to file
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Append to file
qwen -p "Add more details" >> docker-explanation.txt

# Pipe to other tools
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON output for real-time processing
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Параметры конфигурации

Основные параметры командной строки для использования в headless-режиме:

| Option                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                    | Example                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Запуск в headless-режиме                                                                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Указание формата вывода (text, json, stream-json)                                                                                                                                                                                                                                                                                                                                                                              | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Указание формата ввода (text, stream-json)                                                                                                                                                                                                                                                                                                                                                                                     | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Включение частичных сообщений в выводе stream-json                                                                                                                                                                                                                                                                                                                                                                             | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Переопределение системного промпта основной сессии для данного запуска                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Добавление дополнительных инструкций к системному промпту основной сессии для данного запуска                                                                                                                                                                                                                                                                                                                                  | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Включение режима отладки                                                                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --debug`                                                |
| `--safe-mode`                | Отключение всех кастомизаций — файлов контекста, хуков, расширений, навыков, MCP-серверов, пользовательских субагентов (загружаются только встроенные субагенты), правил разрешений, переопределений режима одобрения из настроек, функций памяти и настроек песочницы — для изоляции проблем; флаги CLI `--yolo` и `--approval-mode` по-прежнему действуют. См. [Troubleshooting](../support/troubleshooting). Также можно установить через `QWEN_CODE_SAFE_MODE=true`. | `qwen -p "query" --safe-mode`                                            |
| `--model`, `-m`              | Модель, используемая для данного запуска                                                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --model qwen3-coder-plus`                               |
| `--include-directories`      | Включение дополнительных директорий                                                                                                                                                                                                                                                                                                                                                                                            | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Автоматическое одобрение всех действий                                                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Установка режима одобрения (`plan`, `default`, `auto-edit`, `auto`, `yolo`)                                                                                                                                                                                                                                                                                                                                                    | `qwen -p "query" --approval-mode auto-edit`                              |
| `--continue`                 | Возобновление самой последней сессии для данного проекта                                                                                                                                                                                                                                                                                                                                                                       | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Возобновление конкретной сессии (или интерактивный выбор)                                                                                                                                                                                                                                                                                                                                                                      | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | Ограничение количества ходов пользователя/модели/инструментов в запуске                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | Бюджет реального времени; принимает `90` (с), `30s`, `5m`, `1h`, `1.5h`                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | Суммарный бюджет вызовов инструментов для запуска                                                                                                                                                                                                                                                                                                                                                                              | `qwen -p "..." --max-tool-calls 50`                                      |
Полную информацию обо всех доступных параметрах конфигурации, файлах настроек и переменных окружения см. в [Руководстве по конфигурации](../configuration/settings).

## Безопасность при автономном запуске

Запуск в headless-режиме или CI в сочетании с `--yolo` (или `--approval-mode=yolo`) автоматически одобряет каждый вызов инструмента, включая `shell`, `write` и `edit`. **`--yolo` не включает песочницу** — эти инструменты выполняются с правами хост-процесса. Если Qwen Code обнаруживает такую комбинацию без настроенной песочницы, при запуске он выводит однострочное предупреждение в stderr. После оценки рисков вы можете подавить это предупреждение с помощью `QWEN_CODE_SUPPRESS_YOLO_WARNING=1`.

### Лимиты на уровне запуска

Qwen Code может прервать автономный запуск при превышении одного из следующих порогов. По умолчанию для каждого установлено значение `-1` (без ограничений); достаточно задать хотя бы один, чтобы ограничить неконтролируемое выполнение. Они применяются совместно к тому же `AbortController`, который уже обрабатывает SIGINT, поэтому прерывание по лимиту генерирует структурированную ошибку `FatalBudgetExceededError` (код выхода **55**) — она отличается от кода выхода 53 при достижении лимита ходов и кода 130 для SIGINT, что позволяет CI-скриптам ветвиться в зависимости от причины.

| Флаг                  | Ключ настроек               | Что ограничивает                                                                                                                                                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | Общее астрономическое время выполнения. Флаг принимает значения `90` (с), `30s`, `5m`, `1h`, `1.5h` (поддерживаются дробные единицы). Минимум 1 с — значения меньше секунды отклоняются как опечатки. В настройках указывается в секундах.               |
| `--max-tool-calls`    | `model.maxToolCalls`       | Суммарное количество вызовов инструментов верхнего уровня, диспетчеризуемых главным циклом выполнения (учитываются как успешные, _так и_ неудачные вызовы — модель потребляет токены даже при ошибках). Исключения для подагентов и структурированного вывода см. в разделе "Область действия" ниже. |
| `--max-session-turns` | `model.maxSessionTurns`    | Количество ходов пользователь/модель/инструмент; существовало ранее. При превышении завершается с кодом 53 (отличается от кода 55 при превышении лимита).                                                                                                  |

#### Область действия

- **`--max-tool-calls` учитывает только диспетчеризации верхнего уровня.** Когда модель вызывает инструмент `agent`, эта диспетчеризация считается как **1**; внутренние вызовы инструментов, выполняемые запущенным подагентом, **не** учитываются. Модель, которая передает работу подагентам, может выполнять неограниченную внутреннюю работу в рамках небольшого лимита верхнего уровня. Используйте в сочетании с `--exclude-tools agent`, если требуется более строгое ограничение.
- **`structured_output` не учитывается в `--max-tool-calls`.** При использовании `--json-schema` терминальный вызов `structured_output` моделью — это контракт "я закончил", а не реальная работа — он не учитывается в `--max-tool-calls`, чтобы завершение на грани лимита не прерывалось как ложное срабатывание. Исключение безусловно (включая неудачные проверки Ajv), поэтому модель, застрявшая в цикле повторных попыток из-за некорректного вывода, НЕ ограничивается `--max-tool-calls`; используйте в сочетании с `--max-session-turns` или `--max-wall-time` для ограничения повторных попыток.
- **`structured_output` НЕ исключается из `--max-session-turns`.** Этот счетчик существовал ранее и увеличивается на каждый ход, включая терминальный контракт. Установите `--max-session-turns` в значение `N+1`, если хотите разрешить `N` ходов реальной работы при использовании `--json-schema`.
- **Одиночный запуск и `--input-format stream-json`:** в режиме ввода stream-json демон сбрасывает счетчики лимитов в начале каждого сообщения пользователя; лимит действует на сообщение, а не на процесс.
- **`qwen serve` / ACP-сессии:** путь ACP-сессии демона в настоящее время НЕ учитывает `--max-wall-time` / `--max-tool-calls` из settings.json. Эти лимиты применяются только к одиночным запускам `qwen -p` и сессиям `--input-format stream-json`. (`qwen serve` выдает предупреждение об отсутствии песочницы для YOLO при запуске, если в настройках установлено `tools.approvalMode: 'yolo'`.)

### Рекомендуемые комбинации

- **Доверенная изолированная среда (эфемерный CI-раннер, контейнер):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Задайте лимит ходов и астрономическое время, чтобы застрявший агент не израсходовал все минуты CI, и используйте `--output-format json` для аудита использования и вызовов инструментов после запуска.
- **Локальная машина или общая инфраструктура:** также передайте `--sandbox` (или установите `QWEN_SANDBOX=1`), чтобы инструменты shell / write / edit выполнялись внутри образа песочницы.
- **Длительный CI с повторными попытками при rate-limit:** объедините `QWEN_CODE_UNATTENDED_RETRY=1` с `--max-wall-time`. Переменная окружения для повторных попыток поддерживает выполнение при временных ответах 429 / 529; лимит астрономического времени гарантирует, что постоянно ошибающийся провайдер не сможет бесконечно продлевать задачу.
- **Ограниченный аудит / исследование:** для задач только на чтение `--max-tool-calls 25` ограничивает агрессивность, с которой модель может использовать grep / read. Используйте в сочетании с `--exclude-tools shell,write,edit`, чтобы ограничение имело смысл.

## Примеры

### Проверка кода

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### Генерация сообщений коммитов

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### Документация API

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Пакетный анализ кода

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### Проверка кода в PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Анализ логов

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Генерация описания релиза

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Отслеживание использования моделей и инструментов

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## Режим постоянных повторных попыток

Когда Qwen Code работает в CI/CD-пайплайнах или в качестве фонового демона, кратковременный сбой API (rate limiting или перегрузка) не должен прерывать многочасовую задачу. **Режим постоянных повторных попыток** заставляет Qwen Code бесконечно повторять запросы при временных ошибках API, пока сервис не восстановится.

### Как это работает

- **Только временные ошибки**: HTTP 429 (Rate Limit) и 529 (Overloaded) повторяются бесконечно. Другие ошибки (400, 500 и т. д.) по-прежнему приводят к обычному сбою.
- **Экспоненциальная задержка с ограничением**: Задержки между повторными попытками растут экспоненциально, но ограничены **5 минутами** на одну попытку.
- **Heartbeat для поддержания активности**: Во время длительного ожидания в stderr каждые **30 секунд** выводится строка состояния, чтобы CI-раннеры не завершали процесс из-за неактивности.
- **Устойчивость к сбоям**: Постоянные ошибки и интерактивный режим не затрагиваются.

### Активация

Установите для переменной окружения `QWEN_CODE_UNATTENDED_RETRY` значение `true` или `1` (строгое соответствие, с учетом регистра):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Для режима постоянных повторных попыток требуется **явное включение**. Одного `CI=true` **недостаточно** для его активации — неявное превращение быстро завершающейся CI-задачи в задачу с бесконечным ожиданием было бы опасным. Всегда явно устанавливайте `QWEN_CODE_UNATTENDED_RETRY` в конфигурации вашего пайплайна.

### Примеры

#### GitHub Actions

```yaml
- name: Automated code review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Review all files in src/ for security issues" \
      --output-format json \
      --yolo > review.json
```

#### Ночная пакетная обработка

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### Фоновый демон

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### Мониторинг

Во время постоянных повторных попыток сообщения heartbeat выводятся в **stderr**:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Эти сообщения поддерживают активность CI-раннеров и позволяют отслеживать прогресс. Они не выводятся в stdout, поэтому JSON-вывод, передаваемый через пайп другим инструментам, остается чистым.

## Ресурсы

- [Конфигурация CLI](../configuration/settings#command-line-arguments) - Полное руководство по конфигурации
- [Аутентификация](../configuration/auth.md) - Настройка аутентификации
- [Команды](../features/commands) - Справочник по интерактивным командам
- [Обучающие материалы](../quickstart) - Пошаговые руководства по автоматизации