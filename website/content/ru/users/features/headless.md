# Безголовый режим

Безголовый режим позволяет запускать Qwen Code программно из скриптов командной строки и инструментов автоматизации без интерактивного пользовательского интерфейса. Это идеально подходит для написания скриптов, автоматизации, конвейеров CI/CD и создания инструментов на базе ИИ.

## Обзор

Безголовый режим предоставляет безголовый интерфейс к Qwen Code, который:

- Принимает запросы через аргументы командной строки или stdin
- Возвращает структурированный вывод (текст или JSON)
- Поддерживает перенаправление файлов и конвейеры (pipes)
- Включает автоматизацию и скриптовые рабочие процессы
- Предоставляет согласованные коды выхода для обработки ошибок
- Может возобновлять предыдущие сессии, ограниченные текущим проектом, для многошаговой автоматизации

## Базовое использование

### Прямые запросы

Используйте флаг `--prompt` (или `-p`) для запуска в безголовом режиме:

```bash
qwen --prompt "What is machine learning?"
```

### Ввод через stdin

Передайте ввод в Qwen Code через терминал:

```bash
echo "Explain this code" | qwen
```

### Комбинирование с вводом из файла

Читайте из файлов и обрабатывайте с помощью Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Возобновление предыдущих сессий (безголовый режим)

Повторно используйте контекст разговора из текущего проекта в безголовых скриптах:

```bash
# Continue the most recent session for this project and run a new prompt
qwen --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Данные сессии хранятся в формате JSONL с привязкой к проекту в `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Перед отправкой нового запроса восстанавливаются история разговора, выводы инструментов и контрольные точки сжатия чата.

## Настройка основного системного запроса сессии

Вы можете изменить системный запрос основной сессии для одного запуска CLI без редактирования общих файлов памяти.

### Переопределение встроенного системного запроса

Используйте `--system-prompt` для замены встроенного запроса основной сессии Qwen Code для текущего запуска:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Добавление дополнительных инструкций

Используйте `--append-system-prompt`, чтобы сохранить встроенный запрос и добавить дополнительные инструкции для этого запуска:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Вы можете комбинировать оба флага, когда нужен пользовательский базовый запрос плюс дополнительная инструкция для конкретного запуска:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` применяется только к текущей основной сессии запуска.
> - Загруженные файлы памяти и контекста, такие как `QWEN.md`, по-прежнему добавляются после `--system-prompt`.
> - `--append-system-prompt` применяется после встроенного запроса и загруженной памяти, и может использоваться вместе с `--system-prompt`.

## Форматы вывода

Qwen Code поддерживает несколько форматов вывода для разных сценариев использования:

### Текстовый вывод (по умолчанию)

Стандартный человекочитаемый вывод:

```bash
qwen -p "What is the capital of France?"
```

Формат ответа:

```
The capital of France is Paris.
```

### JSON-вывод

Возвращает структурированные данные в виде JSON-массива. Все сообщения буферизуются и выводятся вместе после завершения сессии. Этот формат идеально подходит для программной обработки и скриптов автоматизации.

JSON-вывод представляет собой массив объектов сообщений. Вывод включает несколько типов сообщений: системные сообщения (инициализация сессии), сообщения ассистента (ответы ИИ) и сообщения-результаты (сводка выполнения).

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

### Потоковый JSON-вывод

Формат Stream-JSON отправляет JSON-сообщения сразу по мере их возникновения во время выполнения, обеспечивая мониторинг в реальном времени. В этом формате используется JSON, разделенный строками, где каждое сообщение представляет собой полный JSON-объект на одной строке.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Вывод (потоковая передача по мере возникновения событий):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```
При совместном использовании с `--include-partial-messages` в режиме реального времени излучаются дополнительные события потока (`message_start`, `content_block_delta` и т. д.) для обновлений интерфейса в реальном времени.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Формат ввода

Параметр `--input-format` определяет, как Qwen Code потребляет входные данные из стандартного ввода:

- **`text`** (по умолчанию): обычный текстовый ввод из stdin или аргументов командной строки
- **`stream-json`**: протокол JSON-сообщений через stdin для двустороннего общения

> **Примечание:** Режим потокового JSON-ввода сейчас находится в разработке и предназначен для интеграции с SDK. Для его работы необходимо установить `--output-format stream-json`.

### Перенаправление файлов

Сохраняйте вывод в файлы или передавайте другим командам:

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

Ключевые параметры командной строки для использования без графического интерфейса:

| Параметр                        | Описание                                                                 | Пример                                                                   |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`                | Запуск в автоматическом режиме                                           | `qwen -p "query"`                                                        |
| `--output-format`, `-o`         | Указать формат вывода (text, json, stream-json)                          | `qwen -p "query" --output-format json`                                   |
| `--input-format`                | Указать формат ввода (text, stream-json)                                 | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages`    | Включать частичные сообщения в вывод stream-json                         | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`               | Переопределить основной системный промпт сессии для данного запуска      | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`        | Добавить дополнительные инструкции к основному системному промпту сессии | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`                 | Включить режим отладки                                                   | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`             | Включить все файлы в контекст                                            | `qwen -p "query" --all-files`                                            |
| `--include-directories`         | Включить дополнительные директории                                       | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`                  | Автоматически подтверждать все действия                                  | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`               | Установить режим подтверждения                                           | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                    | Возобновить последний сеанс для этого проекта                            | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`          | Возобновить определённый сеанс (или выбрать интерактивно)                | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`           | Ограничить количество ходов пользователь/модель/инструмент               | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`               | Бюджет реального времени; принимает `90` (с), `30s`, `5m`, `1h`, `1.5h`  | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`              | Суммарный бюджет на вызовы инструментов за сеанс                         | `qwen -p "..." --max-tool-calls 50`                                      |

Полные сведения обо всех доступных параметрах конфигурации, файлах настроек и переменных окружения см. в [Руководстве по конфигурации](../configuration/settings).

## Безопасность при автоматическом запуске

Запуски в автоматическом / CI‑режиме в сочетании с `--yolo` (или `--approval-mode=yolo`) автоматически подтверждают каждый вызов инструмента, включая `shell`, `write` и `edit`. **`--yolo` не включает песочницу** — эти инструменты выполняются с уровнем привилегий хост-процесса. Когда Qwen Code обнаруживает такую комбинацию без настроенной песочницы, он выводит однострочное предупреждение в stderr при запуске. Подавите предупреждение с помощью `QWEN_CODE_SUPPRESS_YOLO_WARNING=1`, предварительно оценив связанные риски.
### Бюджеты на уровне запуска

Qwen Code может прервать фоновый запуск при превышении одного из следующих порогов. Каждый по умолчанию равен `-1` (без ограничений); установка любого из них достаточна для ограничения неконтролируемого поведения. Они работают совместно с тем же `AbortController`, который обрабатывает SIGINT, поэтому прерывание по бюджету порождает структурированную ошибку `FatalBudgetExceededError` (код выхода **55**) — что отличается от кода выхода 53 при превышении лимита ходов и кода 130 от SIGINT, чтобы CI-скрипты могли разветвляться по причине.

| Флаг                  | Ключ настроек               | Что ограничивает                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds`  | Длительность всего запуска по настенным часам. Флаг принимает `90` (с), `30s`, `5m`, `1h`, `1.5h` (поддерживаются дробные единицы). Минимум 1 с — значения меньше секунды отвергаются как опечатки. Настройка — в секундах.                                                         |
| `--max-tool-calls`    | `model.maxToolCalls`        | Суммарное количество вызовов инструментов верхнего уровня, отправленных основным циклом выполнения (учитываются как успешные, так и неудачные — модель всё равно потребляет токены на ошибках). См. «Область действия» ниже для исключений для subagent / structured_output. |
| `--max-session-turns` | `model.maxSessionTurns`     | Количество ходов пользователь/модель/инструмент; существующий параметр. При превышении завершается с кодом 53 (отличается от кода выхода по бюджету 55).                                                                                                                          |

#### Область действия

- **`--max-tool-calls` учитывает только вызовы верхнего уровня.** Когда модель вызывает инструмент `agent`, этот вызов считается за **1**; внутренние вызовы инструментов, выполненные порождённым subagent, **не учитываются**. Модель, направляющая работу через subagent, может выполнять неограниченную внутреннюю работу при небольшом бюджете верхнего уровня. При необходимости более строгого ограничения комбинируйте с `--exclude-tools agent`.
- **`structured_output` не учитывается в `--max-tool-calls`.** В режиме `--json-schema` завершающий вызов `structured_output` модели — это контракт «я закончил», а не реальная работа; он не засчитывается в `--max-tool-calls`, чтобы завершение на границе бюджета не прерывалось как ложное срабатывание. Исключение безусловное (включая неудачные валидации Ajv), поэтому модель, застрявшая в цикле повторных попыток с некорректным выводом, НЕ ограничивается `--max-tool-calls`; комбинируйте с `--max-session-turns` или `--max-wall-time` для ограничения повторных попыток.
- **`structured_output` НЕ освобождается от `--max-session-turns`.** Этот счётчик существовал ранее и увеличивается на каждом ходу, включая завершающий контракт. Устанавливайте `--max-session-turns` равным `N+1`, если хотите разрешить `N` рабочих ходов в режиме `--json-schema`.
- **Однократный запуск vs `--input-format stream-json`:** в режиме ввода stream-json демон сбрасывает счётчики бюджета в начале каждого сообщения пользователя; бюджет действует на одно сообщение, а не на процесс.
- **`qwen serve` / сессии ACP:** путь сессии ACP демона в настоящее время НЕ учитывает `--max-wall-time` / `--max-tool-calls` из settings.json. Эти бюджеты применяются только к однократным запускам `qwen -p` и к сессиям `--input-format stream-json`. (`qwen serve` выводит предупреждение YOLO-без-песочницы при загрузке, если в настройках установлено `tools.approvalMode: 'yolo'`.)

### Рекомендуемые комбинации

- **Надёжная изолированная среда (эпизодический CI-раннер, контейнер):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Зафиксируйте бюджет по ходам и по настенным часам, чтобы зависший агент не сжигал минуты CI, и используйте `--output-format json` для пост-анализа использования / аудита вызовов инструментов.
- **Локальная машина или общая инфраструктура:** дополнительно передайте `--sandbox` (или установите `QWEN_SANDBOX=1`), чтобы команды shell/write/edit выполнялись внутри образа песочницы.
- **Длительный CI с повторными попытками при ограничении скорости:** комбинируйте `QWEN_CODE_UNATTENDED_RETRY=1` с `--max-wall-time`. Переменная окружения для повторных попыток поддерживает запуск при временных ответах 429/529; бюджет по настенным часам гарантирует, что постоянно сбоящий провайдер не сможет продлить задачу бесконечно.
- **Ограниченное аудирование / исследование:** для задач только на чтение `--max-tool-calls 25` ограничивает, насколько агрессивно модель может выполнять grep / чтение. Комбинируйте с `--exclude-tools shell,write,edit`, чтобы ограничение было осмысленным.

## Примеры

### Код-ревью

```bash
cat src/auth.py | qwen -p "Проверьте этот код аутентификации на наличие проблем безопасности" > security-review.txt
```

### Генерация сообщений коммитов

```bash
result=$(git diff --cached | qwen -p "Напишите краткое сообщение коммита для этих изменений" --output-format json)
echo "$result" | jq -r '.response'
```

### API-документация

```bash
result=$(cat api/routes.js | qwen -p "Сгенерируйте спецификацию OpenAPI для этих маршрутов" --output-format json)
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

### Ревью кода PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Анализ логов

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Генерация заметок о релизе

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Отслеживание использования модели и инструментов

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

Когда Qwen Code работает в пайплайнах CI/CD или в качестве фонового демона, кратковременный сбой API (ограничение скорости или перегрузка) не должен прерывать задачу, выполняющуюся несколько часов. **Режим постоянных повторных попыток** заставляет Qwen Code повторять временные ошибки API бесконечно, пока сервис не восстановится.

### Как это работает

- **Только временные ошибки**: HTTP 429 (ограничение скорости) и 529 (перегрузка) повторяются бесконечно. Другие ошибки (400, 500 и т.д.) по-прежнему завершаются с ошибкой.
- **Экспоненциальная задержка с ограничением**: задержки повторных попыток растут экспоненциально, но ограничены **5 минутами** на одну попытку.
- **Heartbeat keepalive**: во время длительного ожидания каждые **30 секунд** в stderr выводится строка состояния, чтобы предотвратить завершение процесса CI-раннером из-за бездействия.
- **Graceful degradation**: нетранзиентные ошибки и интерактивный режим полностью не затрагиваются.

### Активация

Установите переменную окружения `QWEN_CODE_UNATTENDED_RETRY` в значение `true` или `1` (строгое соответствие, с учётом регистра):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Для постоянных повторных попыток требуется **явное согласие**. Только `CI=true` **не активирует** этот режим — молчаливое превращение быстрой CI-задачи в бесконечно ожидающую было бы опасным. Всегда явно задавайте `QWEN_CODE_UNATTENDED_RETRY` в конфигурации вашего пайплайна.

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

Эти сообщения поддерживают активность CI-раннеров и позволяют отслеживать прогресс. Они не появляются в stdout, поэтому JSON-вывод, передаваемый другим инструментам, остаётся чистым.

## Ресурсы

- [Конфигурация CLI](../configuration/settings#command-line-arguments) - Полное руководство по конфигурации
- [Аутентификация](../configuration/auth.md) - Настройка аутентификации
- [Команды](../features/commands) - Справочник интерактивных команд
- [Учебные пособия](../quickstart) - Пошаговые руководства по автоматизации
