```markdown
# Режим Headless

Режим headless позволяет запускать Qwen Code программно из командной строки
и инструментов автоматизации без интерактивного пользовательского интерфейса. Это идеально подходит для
скриптов, автоматизации, CI/CD pipelines и создания инструментов с поддержкой AI.

- [Режим Headless](#headless-mode)
  - [Обзор](#overview)
  - [Базовое использование](#basic-usage)
    - [Прямые запросы](#direct-prompts)
    - [Ввод через Stdin](#stdin-input)
    - [Комбинирование с вводом из файла](#combining-with-file-input)
  - [Форматы вывода](#output-formats)
    - [Текстовый вывод (по умолчанию)](#text-output-default)
    - [Вывод в формате JSON](#json-output)
      - [Схема ответа](#response-schema)
      - [Пример использования](#example-usage)
    - [Перенаправление в файл](#file-redirection)
  - [Параметры конфигурации](#configuration-options)
  - [Примеры](#examples)
    - [Code review](#code-review)
    - [Генерация сообщений коммитов](#generate-commit-messages)
    - [Документация API](#api-documentation)
    - [Пакетный анализ кода](#batch-code-analysis)
    - [Code review](#code-review-1)
    - [Анализ логов](#log-analysis)
    - [Генерация release notes](#release-notes-generation)
    - [Отслеживание использования моделей и инструментов](#model-and-tool-usage-tracking)
  - [Ресурсы](#resources)
```

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
qwen --prompt "What is machine learning?"
```

### Ввод через Stdin

Передайте данные в Qwen Code через pipe из терминала:

```bash
echo "Explain this code" | qwen
```

### Комбинирование с файловым вводом

Читайте данные из файла и обрабатывайте их с помощью Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

## Форматы вывода

### Текстовый вывод (по умолчанию)

Стандартный человекочитаемый формат:

```bash
qwen -p "What is the capital of France?"
```

Формат ответа:

```
The capital of France is Paris.
```

### Вывод в формате JSON

Возвращает структурированные данные, включая response, statistics и metadata. Этот
формат идеально подходит для программной обработки и скриптов автоматизации.

#### Схема ответа

Структура JSON-ответа имеет следующий вид:

```json
{
  "response": "string", // Основной контент, сгенерированный ИИ, отвечающий на ваш запрос
  "stats": {
    // Метрики использования и данные о производительности
    "models": {
      // Статистика использования API и токенов по каждой модели
      "[model-name]": {
        "api": {
          /* количество запросов, ошибок, задержка */
        },
        "tokens": {
          /* количество токенов в запросе, ответе, кэшированных, общее количество */
        }
      }
    },
    "tools": {
      // Статистика выполнения инструментов
      "totalCalls": "number",
      "totalSuccess": "number",
      "totalFail": "number",
      "totalDurationMs": "number",
      "totalDecisions": {
        /* количество accept, reject, modify, auto_accept */
      },
      "byName": {
        /* подробная статистика по каждому инструменту */
      }
    },
    "files": {
      // Статистика изменений в файлах
      "totalLinesAdded": "number",
      "totalLinesRemoved": "number"
    }
  },
  "error": {
    // Присутствует только при возникновении ошибки
    "type": "string", // Тип ошибки (например, "ApiError", "AuthError")
    "message": "string", // Человекочитаемое описание ошибки
    "code": "number" // Опциональный код ошибки
  }
}
```

#### Пример использования

```bash
qwen -p "What is the capital of France?" --output-format json
```

Ответ:

```json
{
  "response": "The capital of France is Paris.",
  "stats": {
    "models": {
      "qwen3-coder-plus": {
        "api": {
          "totalRequests": 2,
          "totalErrors": 0,
          "totalLatencyMs": 5053
        },
        "tokens": {
          "prompt": 24939,
          "candidates": 20,
          "total": 25113,
          "cached": 21263,
          "thoughts": 154,
          "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 1,
      "totalSuccess": 1,
      "totalFail": 0,
      "totalDurationMs": 1881,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 1
      },
      "byName": {
        "google_web_search": {
          "count": 1,
          "success": 1,
          "fail": 0,
          "durationMs": 1881,
          "decisions": {
            "accept": 0,
            "reject": 0,
            "modify": 0,
            "auto_accept": 1
          }
        }
      }
    },
    "files": {
      "totalLinesAdded": 0,
      "totalLinesRemoved": 0
    }
  }
}
```

### Перенаправление файлов

Сохраняйте вывод в файлы или передавайте его другим командам через pipe:

```bash

# Сохранить в файл
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Добавить в файл
qwen -p "Add more details" >> docker-explanation.txt

# Передать другим инструментам через pipe
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"
```

## Параметры конфигурации

Основные опции командной строки для работы в headless-режиме:

| Опция                   | Описание                           | Пример                                           |
| ----------------------- | ---------------------------------- | ------------------------------------------------ |
| `--prompt`, `-p`        | Запуск в headless-режиме           | `qwen -p "query"`                                |
| `--output-format`       | Формат вывода (text, json)         | `qwen -p "query" --output-format json`           |
| `--model`, `-m`         | Указать модель Qwen                | `qwen -p "query" -m qwen3-coder-plus`            |
| `--debug`, `-d`         | Включить режим отладки             | `qwen -p "query" --debug`                        |
| `--all-files`, `-a`     | Включить все файлы в контекст      | `qwen -p "query" --all-files`                    |
| `--include-directories` | Добавить директории                | `qwen -p "query" --include-directories src,docs` |
| `--yolo`, `-y`          | Автоматически подтверждать действия| `qwen -p "query" --yolo`                         |
| `--approval-mode`       | Режим подтверждения                | `qwen -p "query" --approval-mode auto_edit`      |

Полное описание всех доступных параметров конфигурации, файлов настроек и переменных окружения можно найти в [Configuration Guide](./cli/configuration.md).

## Примеры

#### Code review

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

#### Генерация сообщений коммитов

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

#### Документация API

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

#### Пакетный анализ кода

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

#### Code review

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

#### Анализ логов

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

#### Генерация release notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

#### Отслеживание использования моделей и инструментов

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