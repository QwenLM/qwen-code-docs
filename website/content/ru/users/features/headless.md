# Безголовый режим

Безголовый режим позволяет запускать Qwen Code программно из скриптов командной строки и инструментов автоматизации без какого-либо интерактивного интерфейса. Это идеально подходит для написания скриптов, автоматизации, пайплайнов CI/CD и создания инструментов на базе ИИ.

## Обзор

Безголовый режим предоставляет безголовый интерфейс для Qwen Code, который:

- Принимает подсказки через аргументы командной строки или stdin
- Возвращает структурированный вывод (текст или JSON)
- Поддерживает перенаправление в файлы и конвейеры (piping)
- Обеспечивает автоматизацию и написание скриптов
- Предоставляет согласованные коды возврата для обработки ошибок
- Может возобновлять предыдущие сессии, ограниченные текущим проектом, для многошаговой автоматизации

## Базовое использование

### Прямые подсказки

Используйте флаг `--prompt` (или `-p`) для запуска в безголовом режиме:

```bash
qwen --prompt "What is machine learning?"
```

### Ввод через stdin

Передайте ввод в Qwen Code из терминала:

```bash
echo "Explain this code" | qwen
```

### Комбинирование с вводом из файла

Чтение из файлов и обработка с помощью Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Возобновление предыдущих сессий (безголовый режим)

Повторное использование контекста разговора из текущего проекта в безголовых скриптах:

```bash
# Продолжить самую последнюю сессию для этого проекта и выполнить новую подсказку
qwen --continue -p "Run the tests again and summarize failures"

# Возобновить конкретную сессию по ID напрямую (без UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Данные сессии — это JSONL с привязкой к проекту, хранящиеся в `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Восстанавливает историю разговора, результаты работы инструментов и контрольные точки сжатия чата перед отправкой новой подсказки.

## Настройка основного системного запроса сессии

Вы можете изменить основной системный запрос сессии для одного запуска CLI без редактирования общих файлов памяти.

### Переопределение встроенного системного запроса

Используйте `--system-prompt`, чтобы заменить встроенный системный запрос основной сессии Qwen Code для текущего запуска:

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
> - `--system-prompt` применяется только к основной сессии текущего запуска.
> - Загруженные файлы памяти и контекста, такие как `QWEN.md`, по-прежнему добавляются после `--system-prompt`.
> - `--append-system-prompt` применяется после встроенного запроса и загруженной памяти; может использоваться вместе с `--system-prompt`.

## Форматы вывода

Qwen Code поддерживает несколько форматов вывода для разных случаев использования:

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

Возвращает структурированные данные в виде массива JSON. Все сообщения буферизуются и выводятся вместе по завершении сессии. Этот формат идеален для программной обработки и скриптов автоматизации.

JSON-вывод — это массив объектов сообщений. Вывод включает несколько типов сообщений: системные сообщения (инициализация сессии), сообщения ассистента (ответы ИИ) и сообщения результатов (сводка выполнения).

#### Пример использования

```bash
qwen -p "What is the capital of France?" --output-format json
```

Вывод (по окончании выполнения):

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

### Потоковый JSON-вывод (Stream-JSON)

Формат Stream-JSON отправляет JSON-сообщения немедленно по мере их возникновения во время выполнения, что позволяет вести мониторинг в реальном времени. Используются JSON-сообщения с разделителями строк, где каждое сообщение является полным JSON-объектом на одной строке.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Вывод (потоковый по мере событий):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

В комбинации с `--include-partial-messages` в реальном времени отправляются дополнительные потоковые события (message_start, content_block_delta и т.д.) для обновления UI в реальном времени.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Формат ввода

Параметр `--input-format` управляет тем, как Qwen Code потребляет ввод из стандартного потока ввода:

- **`text`** (по умолчанию): Стандартный текстовый ввод из stdin или аргументов командной строки
- **`stream-json`**: Протокол JSON-сообщений через stdin для двунаправленной связи

> **Примечание:** Режим ввода stream-json в настоящее время находится в разработке и предназначен для интеграции через SDK. Для его работы требуется установить `--output-format stream-json`.

### Перенаправление вывода в файл

Сохранение вывода в файлы или передача другим командам:

```bash
# Сохранить в файл
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Добавить в файл
qwen -p "Add more details" >> docker-explanation.txt

# Передать другим инструментам
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Потоковый JSON-вывод для обработки в реальном времени
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Параметры конфигурации

Ключевые параметры командной строки для безголового режима:

| Параметр                    | Описание                                                                                | Пример                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `--prompt`, `-p`            | Запуск в безголовом режиме                                                              | `qwen -p "query"`                                                        |
| `--output-format`, `-o`     | Формат вывода (text, json, stream-json)                                                 | `qwen -p "query" --output-format json`                                   |
| `--input-format`            | Формат ввода (text, stream-json)                                                        | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages`| Включить частичные сообщения в потоковый JSON-вывод                                     | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`           | Переопределить системный запрос основной сессии для данного запуска                     | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`    | Добавить дополнительные инструкции к системному запросу основной сессии для данного запуска | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`             | Включить режим отладки                                                                  | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`         | Включить все файлы в контекст                                                           | `qwen -p "query" --all-files`                                            |
| `--include-directories`     | Включить дополнительные директории                                                      | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`              | Автоматически подтверждать все действия                                                 | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`           | Установить режим подтверждения                                                          | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                | Возобновить самую последнюю сессию для этого проекта                                   | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`      | Возобновить конкретную сессию (или выбрать интерактивно)                               | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`       | Ограничить количество циклов пользователь/модель/инструмент в запуске                   | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`           | Бюджет времени выполнения; принимает `90` (с), `30s`, `5m`, `1h`, `1.5h`               | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`          | Совокупный бюджет вызовов инструментов для запуска                                      | `qwen -p "..." --max-tool-calls 50`                                      |

Полные сведения о всех доступных параметрах конфигурации, файлах настроек и переменных окружения см. в [Руководстве по конфигурации](../configuration/settings).

## Безопасность при неавтоматизированном запуске

Запуски в безголовом режиме / CI в сочетании с `--yolo` (или `--approval-mode=yolo`) автоматически подтверждают каждый вызов инструмента, включая `shell`, `write` и `edit`. **`--yolo` не включает песочницу** — эти инструменты выполняются с уровнем привилегий хост-процесса. Когда Qwen Code обнаруживает эту комбинацию без настроенной песочницы, он выводит предупреждение в одну строку в stderr при запуске. Отключите предупреждение с помощью `QWEN_CODE_SUPPRESS_YOLO_WARNING=1`, если вы рассмотрели компромиссы.

### Бюджеты уровня запуска

Qwen Code может прервать неавтоматизированный запуск при превышении одного из следующих порогов. Каждый из них по умолчанию равен `-1` (без ограничений); установка любого одного достаточна для ограничения неконтролируемого поведения. Они применяются совместно через тот же `AbortController`, который уже обрабатывает SIGINT, поэтому прерывание по бюджету генерирует структурированную ошибку `FatalBudgetExceededError` (код выхода **55**) — в отличие от кода выхода 53 при превышении числа ходов и кода SIGINT 130, что позволяет CI-скриптам различать причины.

| Флаг                     | Ключ настроек               | Что ограничивает                                                                                                                                                                                                                                                                      |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`        | `model.maxWallTimeSeconds`  | Реальное время выполнения всего запуска. Флаг принимает `90` (с), `30s`, `5m`, `1h`, `1.5h` (поддерживаются дробные единицы). Минимум 1 с — значения менее секунды отклоняются как опечатки. В настройках — секунды.                                                                |
| `--max-tool-calls`       | `model.maxToolCalls`        | Совокупное количество вызовов инструментов верхнего уровня, отправленных основным циклом выполнения (учитываются как успешные, так и неудачные — модель всё равно потребляет токены на ошибках). См. "Область действия" ниже для исключений для под-агентов и структурированного вывода. |
| `--max-session-turns`    | `model.maxSessionTurns`     | Количество циклов пользователь/модель/инструмент; существующее ограничение. При превышении выходит с кодом 53 (отличается от кода 55 для бюджета).                                                                                                                                     |

#### Область действия

- **`--max-tool-calls` учитывает только вызовы верхнего уровня.** Когда модель вызывает инструмент `agent`, такой вызов считается как **1**; внутренние вызовы инструментов, выполняемые порождённым под-агентом, **не** учитываются. Модель, которая перенаправляет работу через под-агентов, может выполнять неограниченную внутреннюю работу при небольшом бюджете верхнего уровня. Комбинируйте с `--exclude-tools agent`, если требуется более жесткое ограничение.
- **`structured_output` исключён из `--max-tool-calls`.** При использовании `--json-schema` финальный вызов `structured_output` модели — это контракт "я закончил", а не реальная работа — он не учитывается в `--max-tool-calls`, чтобы завершение на границе бюджета не было прервано как ложное срабатывание. Исключение безусловно (включая неудачные проверки Ajv), поэтому модель, застрявшая в цикле повторных попыток с некорректным выводом, НЕ ограничивается `--max-tool-calls`; комбинируйте с `--max-session-turns` или `--max-wall-time`, чтобы ограничить повторы.
- **`structured_output` НЕ исключён из `--max-session-turns`.** Этот счетчик существует ранее и увеличивается на каждом ходу, включая завершающий контракт. Устанавливайте `--max-session-turns` как `N+1`, если хотите разрешить `N` реальных рабочих ходов с `--json-schema`.
- **Однократный запуск vs `--input-format stream-json`:** в режиме ввода stream-json демон сбрасывает счетчики бюджета при начале каждого сообщения пользователя; бюджет действует на одно сообщение, а не на процесс.
- **`qwen serve` / сессии ACP:** путь сессии ACP демона в настоящее время НЕ учитывает `--max-wall-time` / `--max-tool-calls` из settings.json. Эти бюджеты применяются только к однократным запускам `qwen -p` и сессиям `--input-format stream-json`. (`qwen serve` всё же выводит предупреждение YOLO-без-песочницы при запуске, если в настройках установлено `tools.approvalMode: 'yolo'`.)

### Рекомендуемые комбинации

- **Доверенное, изолированное окружение (эпизодический CI-раннер, контейнер):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Установите бюджеты ходов и реального времени, чтобы застрявший агент не сжигал минуты CI, и используйте `--output-format json` для последующего анализа использования / аудита вызовов инструментов.
- **Локальная машина или общая инфраструктура:** также передайте `--sandbox` (или установите `QWEN_SANDBOX=1`), чтобы инструменты shell/write/edit выполнялись внутри образа песочницы.
- **Долго работающий CI с повторными попытками при ограничении скорости:** комбинируйте `QWEN_CODE_UNATTENDED_RETRY=1` с `--max-wall-time`. Переменная окружения для повторных попыток поддерживает выполнение при временных ответах 429/529; бюджет реального времени гарантирует, что постоянно ошибающийся провайдер не сможет бесконечно продлевать задание.
- **Ограниченный аудит / исследование:** для задач только на чтение `--max-tool-calls 25` ограничивает, насколько агрессивно модель может grepping/читать. Комбинируйте с `--exclude-tools shell,write,edit`, чтобы ограничение было осмысленным.

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

### API-документация

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

### Ревью PR

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Анализ логов

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Генерация заметок к релизу

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

## Постоянный режим повторных попыток

Когда Qwen Code запускается в пайплайнах CI/CD или в качестве фонового демона, кратковременный сбой API (ограничение скорости или перегрузка) не должен убивать задачу, выполняющуюся несколько часов. **Постоянный режим повторных попыток** заставляет Qwen Code повторять временные ошибки API бесконечно, пока сервис не восстановится.

### Как это работает

- **Только временные ошибки**: HTTP 429 (превышение лимита) и 529 (перегрузка) повторяются бесконечно. Другие ошибки (400, 500 и т.д.) по-прежнему приводят к сбою.
- **Экспоненциальная задержка с ограничением**: Задержки между повторами растут экспоненциально, но ограничены **5 минутами** на один повтор.
- **Поддержка активности (heartbeat)**: Во время длительного ожидания каждые **30 секунд** в stderr выводится строка состояния, чтобы CI-раннеры не убивали процесс из-за бездействия.
- **Безопасная деградация**: Нетранзиентные ошибки и интерактивный режим полностью не затрагиваются.

### Активация

Установите переменную окружения `QWEN_CODE_UNATTENDED_RETRY` в значение `true` или `1` (строгое совпадение, с учётом регистра):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Постоянный режим повторных попыток требует **явного согласия**. Один `CI=true` его **не** активирует — молча превратить задачу CI, которая должна быстро завершаться с ошибкой, в бесконечно ожидающую, было бы опасно. Всегда явно задавайте `QWEN_CODE_UNATTENDED_RETRY` в конфигурации вашего пайплайна.

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

#### Пакетная обработка на ночь

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

Во время постоянного повтора сообщения heartbeat выводятся в **stderr**:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Эти сообщения поддерживают активность CI-раннеров и позволяют отслеживать прогресс. Они не появляются в stdout, поэтому JSON-вывод, передаваемый другим инструментам, остаётся чистым.

## Ресурсы

- [Конфигурация CLI](../configuration/settings#command-line-arguments) - Полное руководство по настройке
- [Аутентификация](../configuration/auth.md) - Настройка аутентификации
- [Команды](../features/commands) - Справочник интерактивных команд
- [Учебные пособия](../quickstart) - Пошаговые руководства по автоматизации