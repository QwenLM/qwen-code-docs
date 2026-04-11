# Headless-режим

Headless-режим позволяет запускать Qwen Code программно из скриптов командной строки и инструментов автоматизации без интерактивного интерфейса. Это идеально подходит для написания скриптов, автоматизации, CI/CD-пайплайнов и создания инструментов на базе ИИ.

## Обзор

Headless-режим предоставляет интерфейс Qwen Code без графического интерфейса, который:

- принимает промпты через аргументы командной строки или stdin
- возвращает структурированный вывод (текст или JSON)
- поддерживает перенаправление файлов и конвейерную обработку (piping)
- позволяет автоматизировать рабочие процессы и скрипты
- предоставляет согласованные коды завершения для обработки ошибок
- может возобновлять предыдущие сессии в контексте текущего проекта для многошаговой автоматизации

## Базовое использование

### Прямые промпты

Используйте флаг `--prompt` (или `-p`) для запуска в headless-режиме:

```bash
qwen --prompt "What is machine learning?"
```

### Ввод через stdin

Передайте ввод в Qwen Code из терминала:

```bash
echo "Explain this code" | qwen
```

### Комбинирование с вводом из файла

Считывайте данные из файлов и обрабатывайте их с помощью Qwen Code:

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
> - Данные сессий хранятся в формате JSONL в контексте проекта по пути `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Восстанавливает историю диалога, результаты работы инструментов и чекпоинты сжатия чата перед отправкой нового промпта.

## Настройка системного промпта основной сессии

Вы можете изменить системный промпт основной сессии для одного запуска через CLI без редактирования файлов общей памяти.

### Переопределение встроенного системного промпта

Используйте `--system-prompt`, чтобы заменить встроенный системный промпт основной сессии Qwen Code для текущего запуска:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Добавление дополнительных инструкций

Используйте `--append-system-prompt`, чтобы сохранить встроенный промпт и добавить дополнительные инструкции для этого запуска:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Вы можете комбинировать оба флага, если вам нужен пользовательский базовый промпт плюс дополнительная инструкция для конкретного запуска:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` применяется только к основной сессии текущего запуска.
> - Загруженные файлы памяти и контекста, такие как `QWEN.md`, по-прежнему добавляются после `--system-prompt`.
> - `--append-system-prompt` применяется после встроенного промпта и загруженной памяти, и может использоваться вместе с `--system-prompt`.

## Форматы вывода

Qwen Code поддерживает несколько форматов вывода для различных сценариев использования:

### Текстовый вывод (по умолчанию)

Стандартный вывод, удобный для чтения:

```bash
qwen -p "What is the capital of France?"
```

Формат ответа:

```
The capital of France is Paris.
```

### Вывод в формате JSON

Возвращает структурированные данные в виде JSON-массива. Все сообщения буферизуются и выводятся вместе после завершения сессии. Этот формат идеально подходит для программной обработки и скриптов автоматизации.

Вывод в формате JSON представляет собой массив объектов сообщений. Он включает несколько типов сообщений: системные (инициализация сессии), сообщения ассистента (ответы ИИ) и сообщения с результатами (сводка выполнения).

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

Формат Stream-JSON немедленно выводит JSON-сообщения по мере их появления во время выполнения, что позволяет отслеживать процесс в реальном времени. Этот формат использует JSON с разделением по строкам, где каждое сообщение представляет собой полный JSON-объект в одной строке.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Вывод (потоковая передача по мере возникновения событий):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

При использовании вместе с `--include-partial-messages` в реальном времени генерируются дополнительные потоковые события (`message_start`, `content_block_delta` и т.д.) для обновления интерфейса в реальном времени.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Формат ввода

Параметр `--input-format` управляет тем, как Qwen Code обрабатывает ввод из стандартного потока ввода:

- **`text`** (по умолчанию): стандартный текстовый ввод из stdin или аргументов командной строки
- **`stream-json`**: протокол JSON-сообщений через stdin для двусторонней связи

> **Примечание:** Режим ввода stream-json находится в разработке и предназначен для интеграции с SDK. Для его работы требуется установить `--output-format stream-json`.

### Перенаправление файлов

Сохраняйте вывод в файлы или передавайте его другим командам:

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

| Option                       | Description                                                              | Example                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Запуск в headless-режиме                                                 | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Указание формата вывода (text, json, stream-json)                        | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Указание формата ввода (text, stream-json)                               | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Включение частичных сообщений в вывод stream-json                        | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Переопределение системного промпта основной сессии для этого запуска     | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Добавление дополнительных инструкций к системному промпту основной сессии для этого запуска | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Включение режима отладки                                                 | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Включение всех файлов в контекст                                         | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Включение дополнительных директорий                                      | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Автоматическое подтверждение всех действий                               | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Установка режима подтверждения                                           | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Возобновление последней сессии для этого проекта                         | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Возобновление конкретной сессии (или интерактивный выбор)                | `qwen --resume 123e... -p "Finish the refactor"`                         |

Полную информацию обо всех доступных параметрах конфигурации, файлах настроек и переменных окружения см. в [Руководстве по конфигурации](../configuration/settings).

## Примеры

### Ревью кода

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

### Ревью кода в PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Анализ логов

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Генерация примечаний к релизу

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

## Ресурсы

- [Конфигурация CLI](../configuration/settings#command-line-arguments) — полное руководство по конфигурации
- [Аутентификация](../configuration/settings#environment-variables-for-api-access) — настройка аутентификации
- [Команды](../features/commands) — справочник по интерактивным командам
- [Руководства](../quickstart) — пошаговые инструкции по автоматизации