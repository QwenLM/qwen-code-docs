# Режим без графического интерфейса

Режим без графического интерфейса позволяет запускать Qwen Code программно из командной строки
скрипты и инструменты автоматизации без какого-либо интерактивного пользовательского интерфейса. Это идеально подходит для
создания скриптов, автоматизация, конвейеры CI/CD и создание инструментов с поддержкой ИИ.

## Обзор

Режим без графического интерфейса предоставляет интерфейс без графического интерфейса для Qwen Code, который:

- Принимает подсказки через аргументы командной строки или stdin
- Возвращает структурированный вывод (текст или JSON)
- Поддерживает перенаправление файлов и каналов
- Позволяет автоматизировать рабочие процессы и создавать сценарии
- Обеспечивает согласованные коды выхода для обработки ошибок
- Может возобновлять предыдущие сеансы в рамках текущего проекта для многоэтапной автоматизации

## Основное использование

### Прямые подсказки

Используйте флаг `--prompt` (или `-p`) для запуска в режиме без графического интерфейса:

```bash
qwen --prompt "Что такое машинное обучение?"
```

### Ввод Stdin

Передайте входные данные в Qwen Code из вашего терминала:

```bash
echo "Объясните этот код" | qwen
```

### Комбинирование с файловым вводом

Чтение из файлов и обработка с помощью Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Возобновление предыдущих сессий (Headless)

Повторное использование контекста разговора из текущего проекта в headless-скриптах:

```bash

# Продолжить последнюю сессию для этого проекта и выполнить новый запрос
qwen --continue -p "Run the tests again and summarize failures"

# Возобновить конкретную сессию по ID напрямую (без UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Данные сессии представляют собой JSONL, ограниченный областью проекта, и находятся в `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Восстанавливает историю разговора, вывод инструментов и контрольные точки сжатия чата перед отправкой нового запроса.

## Форматы вывода

Qwen Code поддерживает несколько форматов вывода для различных случаев использования:

### Текстовый вывод (по умолчанию)

Стандартный удобочитаемый вывод:

```bash
qwen -p "Какая столица Франции?"
```

Формат ответа:

```
Столицей Франции является Париж.
```

### Вывод в формате JSON

Возвращает структурированные данные в виде массива JSON. Все сообщения буферизуются и выводятся вместе по завершении сессии. Этот формат идеально подходит для программной обработки и автоматизации.

Вывод в формате JSON представляет собой массив объектов сообщений. Вывод включает несколько типов сообщений: системные сообщения (инициализация сессии), сообщения ассистента (ответы ИИ) и результирующие сообщения (сводка выполнения).

#### Пример использования

```bash
qwen -p "Какая столица Франции?" --output-format json
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
          "text": "Столица Франции — Париж."
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
    "result": "Столица Франции — Париж.",
    "usage": {...}
  }
]
```

### Вывод в формате Stream-JSON

Формат Stream-JSON выводит JSON-сообщения сразу по мере их возникновения во время выполнения, что позволяет осуществлять мониторинг в реальном времени. Данный формат использует построчный JSON, где каждое сообщение представляет собой полноценный JSON-объект, размещенный на одной строке.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Вывод (поступает потоком по мере возникновения событий):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

При использовании вместе с флагом `--include-partial-messages` дополнительно генерируются события потока в режиме реального времени (message_start, content_block_delta и т. д.) для обновления пользовательского интерфейса в реальном времени.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Формат ввода

Параметр `--input-format` управляет тем, как Qwen Code потребляет входные данные из стандартного ввода:

- **`text`** (по умолчанию): Стандартный текстовый ввод из stdin или аргументов командной строки
- **`stream-json`**: Протокол сообщений JSON через stdin для двунаправленной связи

> **Примечание:** Режим ввода Stream-json в настоящее время находится в разработке и предназначен для интеграции с SDK. Требует установки `--output-format stream-json`.

### Перенаправление файлов

Сохраните вывод в файлы или передайте его другим командам:

```bash

# Сохранить в файл
qwen -p "Объясни Docker" > docker-explanation.txt
qwen -p "Объясни Docker" --output-format json > docker-explanation.json

# Добавить в файл
qwen -p "Добавь больше деталей" >> docker-explanation.txt

# Передать другим инструментам
qwen -p "Что такое Kubernetes?" --output-format json | jq '.response'
qwen -p "Объясни микросервисы" | wc -w
qwen -p "Перечисли языки программирования" | grep -i "python"```

# Вывод Stream-JSON для обработки в реальном времени
qwen -p "Объясни Docker" --output-format stream-json | jq '.type'
qwen -p "Напиши код" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Параметры конфигурации

Основные параметры командной строки для использования в автоматическом режиме:

| Параметр                     | Описание                                            | Пример                                                                   |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Запуск в автоматическом режиме                      | `qwen -p "запрос"`                                                       |
| `--output-format`, `-o`      | Указать формат вывода (text, json, stream-json)     | `qwen -p "запрос" --output-format json`                                  |
| `--input-format`             | Указать формат ввода (text, stream-json)            | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Включать частичные сообщения в вывод stream-json    | `qwen -p "запрос" --output-format stream-json --include-partial-messages`|
| `--debug`, `-d`              | Включить режим отладки                              | `qwen -p "запрос" --debug`                                               |
| `--all-files`, `-a`          | Включить все файлы в контекст                       | `qwen -p "запрос" --all-files`                                           |
| `--include-directories`      | Включить дополнительные каталоги                    | `qwen -p "запрос" --include-directories src,docs`                        |
| `--yolo`, `-y`               | Автоматически подтверждать все действия             | `qwen -p "запрос" --yolo`                                                |
| `--approval-mode`            | Установить режим подтверждения                      | `qwen -p "запрос" --approval-mode auto_edit`                             |
| `--continue`                 | Возобновить последний сеанс для этого проекта       | `qwen --continue -p "Продолжим с того места, где остановились"`          |
| `--resume [sessionId]`       | Возобновить определённый сеанс (или выбрать интерактивно) | `qwen --resume 123e... -p "Завершить рефакторинг"`                |

Полное описание всех доступных параметров конфигурации, файлов настроек и переменных окружения см. в [Руководстве по конфигурации](/users/configuration/settings).

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
result=$(git diff origin/main...HEAD | qwen -p "Проверь эти изменения на наличие ошибок, проблем безопасности и качества кода" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Анализ логов

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Проанализируй эти ошибки и предложи возможные причины и способы исправления" > error-analysis.txt
```

### Генерация заметок о релизе

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Сгенерируй заметки о релизе на основе этих коммитов" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Отслеживание использования моделей и инструментов

```bash
result=$(qwen -p "Объясни эту схему базы данных" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens токенов, $tool_calls вызовов инструментов ($tools_used) использовано с моделями: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Недавние тенденции использования:"
tail -5 usage.log
```

## Ресурсы

- [Конфигурация CLI](/users/configuration/settings#command-line-arguments) - Полное руководство по настройке
- [Аутентификация](/users/configuration/settings#environment-variables-for-api-access) - Настройка аутентификации
- [Команды](/users/reference/cli-reference) - Интерактивная справка по командам
- [Руководства](/users/quickstart) - Пошаговые руководства по автоматизации