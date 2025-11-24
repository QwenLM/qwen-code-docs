# Режим headless

Режим headless позволяет запускать Qwen Code программно из командной строки,
скриптов и инструментов автоматизации без интерактивного пользовательского
интерфейса. Это идеально подходит для написания скриптов, автоматизации,
CI/CD-пайплайнов и создания инструментов с использованием ИИ.

- [Режим headless](#headless-mode)
  - [Обзор](#overview)
  - [Базовое использование](#basic-usage)
    - [Прямые запросы](#direct-prompts)
    - [Ввод через stdin](#stdin-input)
    - [Комбинирование с вводом из файла](#combining-with-file-input)
  - [Форматы вывода](#output-formats)
    - [Текстовый вывод (по умолчанию)](#text-output-default)
    - [Вывод в формате JSON](#json-output)
      - [Пример использования](#example-usage)
    - [Потоковый вывод в формате JSON](#stream-json-output)
    - [Формат ввода](#input-format)
    - [Перенаправление файлов](#file-redirection)
  - [Опции конфигурации](#configuration-options)
  - [Примеры](#examples)
    - [Code review](#code-review)
    - [Генерация сообщений коммитов](#generate-commit-messages)
    - [Документация API](#api-documentation)
    - [Пакетный анализ кода](#batch-code-analysis)
    - [Code review для pull request'ов](#pr-code-review)
    - [Анализ логов](#log-analysis)
    - [Генерация release notes](#release-notes-generation)
    - [Отслеживание использования моделей и инструментов](#model-and-tool-usage-tracking)
  - [Ресурсы](#resources)

## Обзор

Режим headless предоставляет интерфейс без графического окна для Qwen Code, который:

- Принимает запросы через аргументы командной строки или stdin  
- Возвращает структурированный вывод (текст или JSON)  
- Поддерживает перенаправление файлов и пайпы  
- Позволяет автоматизировать процессы и создавать скрипты  
- Предоставляет единые коды завершения для обработки ошибок  

## Базовое использование

### Прямые запросы

Используйте флаг `--prompt` (или `-p`) для запуска в режиме headless:

```bash
qwen --prompt "Что такое машинное обучение?"
```

### Ввод через Stdin

Передайте данные в Qwen Code через pipe из терминала:

```bash
echo "Объясни этот код" | qwen
```

### Комбинирование с файловым вводом

Читайте данные из файла и обрабатывайте их с помощью Qwen Code:

```bash
cat README.md | qwen --prompt "Кратко опиши эту документацию"
```

## Форматы вывода

Qwen Code поддерживает несколько форматов вывода под разные задачи:

### Текстовый вывод (по умолчанию)

Стандартный человекочитаемый вывод:

```bash
qwen -p "Какая столица Франции?"
```

Формат ответа:

```
Столица Франции — Париж.
```

### Вывод в формате JSON

Возвращает структурированные данные в виде массива JSON. Все сообщения буферизуются и выводятся вместе по завершении сессии. Этот формат идеально подходит для программной обработки и автоматизации с помощью скриптов.

Вывод в формате JSON представляет собой массив объектов сообщений. В выводе содержатся различные типы сообщений: системные сообщения (инициализация сессии), сообщения ассистента (ответы AI) и результирующие сообщения (сводка выполнения).

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

### Stream-JSON Output

Формат Stream-JSON выводит JSON-сообщения сразу по мере их возникновения во время выполнения, что позволяет осуществлять мониторинг в реальном времени. Данный формат использует line-delimited JSON, где каждое сообщение представляет собой полноценный JSON-объект, записанный в одну строку.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Вывод (поступает потоком по мере возникновения событий):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

При использовании вместе с флагом `--include-partial-messages` дополнительно генерируются события потока в режиме реального времени (message_start, content_block_delta и т. д.), которые можно применять для обновления пользовательского интерфейса в реальном времени.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Формат ввода

Параметр `--input-format` управляет тем, как Qwen Code обрабатывает входные данные из стандартного потока ввода:

- **`text`** (по умолчанию): Стандартный текстовый ввод через stdin или аргументы командной строки
- **`stream-json`**: Протокол сообщений в формате JSON через stdin для двунаправленной связи

> **Примечание:** Режим ввода `stream-json` находится в разработке и предназначен для интеграции с SDK. Требует установки параметра `--output-format stream-json`.

### Перенаправление файлов

Сохраняйте вывод в файлы или передавайте его другим командам через пайпы:

```bash

# Сохранить в файл
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Добавить в конец файла
qwen -p "Add more details" >> docker-explanation.txt

# Передать другим инструментам через pipe
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"
```

# Stream-JSON output для обработки в реальном времени
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Параметры конфигурации

Основные опции командной строки для работы в headless-режиме:

| Опция                        | Описание                                        | Пример                                                                   |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Запуск в headless-режиме                        | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Указать формат вывода (text, json, stream-json) | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Указать формат ввода (text, stream-json)        | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Включать частичные сообщения в вывод stream-json | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Включить режим отладки                          | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Включить все файлы в контекст                   | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Включить дополнительные директории              | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Автоматически подтверждать все действия         | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Установить режим подтверждения                  | `qwen -p "query" --approval-mode auto_edit`                              |

Полное описание всех доступных параметров конфигурации, файлов настроек и переменных окружения можно найти в [Configuration Guide](./cli/configuration.md).

## Примеры

### Code review

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

### Code review для pull request

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Анализ логов

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Генерация release notes

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

- [Конфигурация CLI](./cli/configuration.md) - Полное руководство по настройке
- [Аутентификация](./cli/authentication.md) - Настройка аутентификации
- [Команды](./cli/commands.md) - Интерактивная справка по командам
- [Туториалы](./cli/tutorials.md) - Пошаговые руководства по автоматизации