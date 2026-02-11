# Режим без графического интерфейса

Режим без графического интерфейса позволяет запускать Qwen Code программно из сценариев командной строки
и инструментов автоматизации без какого-либо интерактивного пользовательского интерфейса. Это идеальный вариант для
создания скриптов, автоматизации, конвейеров CI/CD и разработки инструментов с искусственным интеллектом.

## Обзор

Режим без графического интерфейса предоставляет интерфейс без графического интерфейса для Qwen Code, который:

- Принимает запросы через аргументы командной строки или stdin
- Возвращает структурированный вывод (текст или JSON)
- Поддерживает перенаправление файлов и передачу данных через pipe
- Позволяет автоматизировать рабочие процессы и создавать скрипты
- Обеспечивает согласованные коды завершения для обработки ошибок
- Может возобновлять предыдущие сессии в рамках текущего проекта для многоступенчатой автоматизации

## Основное использование

### Прямые запросы

Используйте флаг `--prompt` (или `-p`) для запуска в режиме без графического интерфейса:

```bash
qwen --prompt "Что такое машинное обучение?"
```

### Ввод через stdin

Передайте ввод в Qwen Code из вашего терминала:

```bash
echo "Объясните этот код" | qwen
```

### Комбинирование с вводом из файла

Чтение из файлов и обработка с помощью Qwen Code:

```bash
cat README.md | qwen --prompt "Кратко опиши эту документацию"
```

### Возобновление предыдущих сессий (в фоновом режиме)

Повторное использование контекста разговора из текущего проекта в скриптах без интерфейса:

```bash

# Продолжить последнюю сессию для этого проекта и выполнить новый запрос
qwen --continue -p "Запустить тесты снова и кратко описать ошибки"

# Возобновить конкретную сессию по ID напрямую (без интерфейса)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Применить последующую рефакторизацию"
```

> [!note]
>
> - Данные сессии хранятся в формате JSONL в директории `~/.qwen/projects/<sanitized-cwd>/chats`, ограниченные проектом.
> - Восстанавливает историю разговора, вывод инструментов и контрольные точки сжатия чата перед отправкой нового запроса.

## Форматы вывода

Qwen Code поддерживает несколько форматов вывода для различных случаев использования:

### Текстовый вывод (по умолчанию)

Стандартный вывод в удобочитаемом формате:

```bash
qwen -p "Какова столица Франции?"
```

Формат ответа:

```
Столица Франции — Париж.
```

### Вывод в формате JSON

Возвращает структурированные данные в виде массива JSON. Все сообщения буферизуются и выводятся вместе после завершения сессии. Этот формат идеально подходит для программной обработки и автоматизации скриптов.

Вывод в формате JSON — это массив объектов сообщений. Вывод включает несколько типов сообщений: системные сообщения (инициализация сессии), сообщения помощника (ответы ИИ) и сообщения результатов (сводка выполнения).

#### Пример использования

```bash
qwen -p "Какова столица Франции?" --output-format json
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

Формат Stream-JSON немедленно выдает JSON-сообщения по мере их появления во время выполнения, обеспечивая возможность мониторинга в реальном времени. В этом формате используется разделенный строками JSON, где каждое сообщение представляет собой полный JSON-объект в одной строке.

```bash
qwen -p "Объясните TypeScript" --output-format stream-json
```

Вывод (потоковая передача по мере возникновения событий):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

При использовании вместе с `--include-partial-messages` дополнительные события потока выдаются в режиме реального времени (message_start, content_block_delta и т.д.) для обновления пользовательского интерфейса в режиме реального времени.

```bash
qwen -p "Напишите скрипт на Python" --output-format stream-json --include-partial-messages
```

### Формат ввода

Параметр `--input-format` управляет тем, как Qwen Code потребляет ввод из стандартного потока ввода:

- **`text`** (по умолчанию): Стандартный текстовый ввод из stdin или аргументов командной строки
- **`stream-json`**: Протокол обмена сообщениями JSON через stdin для двусторонней связи

> **Примечание:** Режим ввода stream-json находится в стадии разработки и предназначен для интеграции с SDK. Требует установки параметра `--output-format stream-json`.

### Перенаправление файлов

Сохраняйте вывод в файлы или передавайте в другие команды:

```bash

# Сохранить в файл
qwen -p "Объясните Docker" > docker-explanation.txt
qwen -p "Объясните Docker" --output-format json > docker-explanation.json

# Добавить в файл
qwen -p "Добавьте больше деталей" >> docker-explanation.txt

# Передать в другие инструменты
qwen -p "Что такое Kubernetes?" --output-format json | jq '.response'
qwen -p "Объясните микросервисы" | wc -w
qwen -p "Перечислите языки программирования" | grep -i "python"

# Потоковый вывод JSON для обработки в реальном времени
qwen -p "Объясните Docker" --output-format stream-json | jq '.type'
qwen -p "Напишите код" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Параметры конфигурации

Основные параметры командной строки для использования в режиме headless:

| Параметр                     | Описание                                            | Пример                                                                   |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Запуск в режиме headless                            | `qwen -p "запрос"`                                                       |
| `--output-format`, `-o`      | Указать формат вывода (text, json, stream-json)     | `qwen -p "запрос" --output-format json`                                  |
| `--input-format`             | Указать формат ввода (text, stream-json)            | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Включать частичные сообщения в вывод stream-json    | `qwen -p "запрос" --output-format stream-json --include-partial-messages`|
| `--debug`, `-d`              | Включить режим отладки                              | `qwen -p "запрос" --debug`                                               |
| `--all-files`, `-a`          | Включить все файлы в контекст                       | `qwen -p "запрос" --all-files`                                           |
| `--include-directories`      | Включить дополнительные каталоги                    | `qwen -p "запрос" --include-directories src,docs`                        |
| `--yolo`, `-y`               | Автоматически подтверждать все действия            | `qwen -p "запрос" --yolo`                                                |
| `--approval-mode`            | Установить режим подтверждения                      | `qwen -p "запрос" --approval-mode auto_edit`                             |
| `--continue`                 | Возобновить последнюю сессию для этого проекта       | `qwen --continue -p "Продолжим с того места, где остановились"`          |
| `--resume [sessionId]`       | Возобновить конкретную сессию (или выбрать интерактивно) | `qwen --resume 123e... -p "Завершить рефакторинг"`                  |

Для получения полной информации обо всех доступных параметрах конфигурации, файлах настроек и переменных окружения см. [Руководство по конфигурации](../configuration/settings).

## Примеры

### Проверка кода

```bash
cat src/auth.py | qwen -p "Проверь этот код аутентификации на наличие проблем с безопасностью" > security-review.txt
```

### Генерация сообщений коммитов

```bash
result=$(git diff --cached | qwen -p "Напиши краткое сообщение коммита для этих изменений" --output-format json)
echo "$result" | jq -r '.response'
```

### Документация API

```bash
result=$(cat api/routes.js | qwen -p "Сгенерируй спецификацию OpenAPI для этих маршрутов" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Пакетный анализ кода

```bash
for file in src/*.py; do
    echo "Анализ $file..."
    result=$(cat "$file" | qwen -p "Найди потенциальные ошибки и предложи улучшения" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Завершен анализ $(basename "$file")" >> reports/progress.log
done
```

### Код-ревью PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Проверь эти изменения на наличие багов, проблем с безопасностью и качества кода" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Анализ логов

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Проанализируй эти ошибки и предложи основную причину и способы исправления" > error-analysis.txt
```

### Генерация заметок о выпуске

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Создай заметки о выпуске из этих коммитов" --output-format json)
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
echo "Последние тенденции использования:"
tail -5 usage.log
```

## Ресурсы

- [Конфигурация CLI](../configuration/settings#command-line-arguments) — Полное руководство по настройке
- [Аутентификация](../configuration/settings#environment-variables-for-api-access) — Настройка аутентификации
- [Команды](../features/commands) — Справочник интерактивных команд
- [Руководства](../quickstart) — Пошаговые инструкции по автоматизации