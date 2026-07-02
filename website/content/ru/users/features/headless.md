# Headless-режим

Headless-режим позволяет запускать Qwen Code программно из скриптов командной строки и инструментов автоматизации без какого-либо интерактивного пользовательского интерфейса. Это идеально подходит для написания скриптов, автоматизации, CI/CD пайплайнов и создания инструментов на базе ИИ.

## Обзор

Headless-режим предоставляет headless-интерфейс Qwen Code, который:

- Принимает промпты через аргументы командной строки или stdin
- Возвращает структурированный вывод (текст или JSON)
- Поддерживает перенаправление вывода и конвейеры
- Обеспечивает автоматизацию и скриптовые рабочие процессы
- Предоставляет согласованные коды завершения для обработки ошибок
- Может возобновлять предыдущие сессии в рамках текущего проекта для многошаговой автоматизации

## Базовое использование

### Прямые промпты

Используйте флаг `--prompt` (или `-p`) для запуска в headless-режиме:

```bash
qwen --prompt "What is machine learning?"
```

### Ввод через stdin

Направьте ввод в Qwen Code из терминала:

```bash
echo "Explain this code" | qwen
```

### Комбинирование с вводом из файла

Читайте данные из файлов и обрабатывайте их с помощью Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Возобновление предыдущих сессий (Headless)

Переиспользуйте контекст диалога из текущего проекта в headless-скриптах:

```bash
# Продолжить самую последнюю сессию для этого проекта и выполнить новый промпт
qwen --continue -p "Run the tests again and summarize failures"

# Возобновить конкретный ID сессии напрямую (без UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Данные сессии представляют собой JSONL-файлы в рамках проекта, расположенные в `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Восстанавливает историю диалога, результаты работы инструментов и чекпоинты сжатия чата перед отправкой нового промпта.

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

Вы можете комбинировать оба флага, если хотите использовать кастомный базовый промпт плюс дополнительную инструкцию для конкретного запуска:

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

Стандартный читаемый человеком вывод:

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

### Stream-JSON вывод

Формат Stream-JSON отправляет JSON-сообщения немедленно по мере их появления во время выполнения, что позволяет осуществлять мониторинг в реальном времени. Этот формат использует JSON с разделением по строкам, где каждое сообщение представляет собой полный JSON-объект в одной строке.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Вывод (потоковая передача по мере возникновения событий):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

При использовании совместно с `--include-partial-messages` дополнительные события потока выводятся в реальном времени (message_start, content_block_delta и т. д.) для обновления UI в реальном времени.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Формат ввода

Параметр `--input-format` управляет тем, как Qwen Code потребляет ввод из стандартного ввода (stdin):

- **`text`** (по умолчанию): Стандартный текстовый ввод из stdin или аргументов командной строки
- **`stream-json`**: Протокол JSON-сообщений через stdin для двусторонней связи

> **Примечание:** Режим ввода stream-json находится в стадии разработки и предназначен для интеграции с SDK. Он требует установки `--output-format stream-json`.

### Перенаправление вывода

Сохраняйте вывод в файлы или передавайте его в другие команды:

```bash
# Сохранить в файл
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Дописать в файл
qwen -p "Add more details" >> docker-explanation.txt

# Передать в другие инструменты
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Вывод Stream-JSON для обработки в реальном времени
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
| `--include-partial-messages` | Включение частичных сообщений в вывод stream-json                                                                                                                                                                                                                                                                                                                                                                              | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | Переопределение системного промпта основной сессии для данного запуска                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Добавление дополнительных инструкций к системному промпту основной сессии для данного запуска                                                                                                                                                                                                                                                                                                                                  | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Включение режима отладки                                                                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --debug`                                                |
| `--safe-mode`                | Отключение всех кастомизаций — файлов контекста, хуков, расширений, навыков (skills), MCP-серверов, кастомных подагентов (загружаются только встроенные подагенты), правил разрешений, переопределений режима одобрения из настроек, функций памяти и настроек песочницы — для изоляции проблем; CLI-флаги `--yolo` и `--approval-mode` продолжают действовать. См. [Troubleshooting](../support/troubleshooting). Также можно установить через `QWEN_CODE_SAFE_MODE=true`. | `qwen -p "query" --safe-mode`                                            |
| `--all-files`, `-a`          | Включение всех файлов в контекст                                                                                                                                                                                                                                                                                                                                                                                               | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Включение дополнительных директорий                                                                                                                                                                                                                                                                                                                                                                                            | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Автоматическое одобрение всех действий                                                                                                                                                                                                                                                                                                                                                                                         | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Установка режима одобрения                                                                                                                                                                                                                                                                                                                                                                                                     | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Возобновление самой последней сессии для данного проекта                                                                                                                                                                                                                                                                                                                                                                       | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Возобновление конкретной сессии (или интерактивный выбор)                                                                                                                                                                                                                                                                                                                                                                      | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | Ограничение количества ходов пользователь/модель/инструмент в запуске                                                                                                                                                                                                                                                                                                                                                          | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | Бюджет реального времени; принимает `90` (с), `30s`, `5m`, `1h`, `1.5h`                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | Суммарный бюджет вызовов инструментов для запуска                                                                                                                                                                                                                                                                                                                                                                              | `qwen -p "..." --max-tool-calls 50`                                      |

Полную информацию обо всех доступных параметрах конфигурации, файлах настроек и переменных окружения см. в [Руководстве по конфигурации](../configuration/settings).

## Безопасность при автономных запусках

Запуски в headless-режиме / CI в сочетании с `--yolo` (или `--approval-mode=yolo`) автоматически одобряют каждый вызов инструмента, включая `shell`, `write` и `edit`. **`--yolo` не включает песочницу** — эти инструменты выполняются с уровнем привилегий хост-процесса. Когда Qwen Code обнаруживает эту комбинацию без настроенной песочницы, он выводит однострочное предупреждение в stderr при запуске. Подавите предупреждение с помощью `QWEN_CODE_SUPPRESS_YOLO_WARNING=1`, как только вы оцените все риски.

### Бюджеты на уровне запуска

Qwen Code может прервать автономный запуск при превышении одного из следующих порогов. По умолчанию каждый из них равен `-1` (без ограничений); установки любого из них достаточно, чтобы ограничить неконтролируемое выполнение. Они применяются совместно к одному и тому же `AbortController`, который уже обрабатывает SIGINT, поэтому прерывание из-за бюджета генерирует структурированную ошибку `FatalBudgetExceededError` (код завершения **55**) — отличающуюся от кода 53 при достижении лимита ходов и кода 130 для SIGINT, чтобы скрипты CI могли ветвиться в зависимости от причины.

| Flag                  | Settings key               | What it bounds                                                                                                                                                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | Продолжительность всего запуска в реальном времени. Флаг принимает `90` (с), `30s`, `5m`, `1h`, `1.5h` (поддерживаются дробные единицы). Минимум 1 с — значения меньше секунды отклоняются как опечатки. В настройках указывается в секундах.               |
| `--max-tool-calls`    | `model.maxToolCalls`       | Суммарное количество вызовов инструментов верхнего уровня, отправленных основным циклом запуска (считаются как успешные, _так и_ неудачные вызовы — модель потребляет токены даже при ошибках). См. раздел "Область действия" ниже для исключений, касающихся подагентов / структурированного вывода. |
| `--max-session-turns` | `model.maxSessionTurns`    | Количество ходов пользователь/модель/инструмент; существовало ранее. Завершается с кодом 53 при превышении лимита (отличается от кода 55 при превышении бюджета).                                                                                                  |

#### Область действия

- **`--max-tool-calls` учитывает только вызовы верхнего уровня.** Когда модель вызывает инструмент `agent`, этот вызов считается как **1**; внутренние вызовы инструментов, выполняемые созданным подагентом, **не** учитываются. Модель, которая направляет работу через подагентов, может выполнять неограниченную внутреннюю работу в рамках небольшого бюджета верхнего уровня. Используйте совместно с `--exclude-tools agent`, если вам нужно более строгое ограничение.
- **`structured_output` не учитывается в `--max-tool-calls`.** При использовании `--json-schema` терминальный вызов `structured_output` моделью — это контракт «я закончил», а не реальная работа — он не учитывается в `--max-tool-calls`, чтобы завершение на грани бюджета не прерывалось как ложное срабатывание. Исключение является безусловным (включая неудачные проверки Ajv), поэтому модель, застрявшая в цикле повторных попыток из-за некорректного вывода, **не** ограничивается `--max-tool-calls`; используйте совместно с `--max-session-turns` или `--max-wall-time`, чтобы ограничить количество повторных попыток.
- **`structured_output` НЕ исключается из `--max-session-turns`.** Этот счетчик существовал ранее и увеличивается на каждом ходу, включая терминальный контракт. Установите `--max-session-turns` в значение `N+1`, если вы хотите разрешить `N` ходов реальной работы при использовании `--json-schema`.
- **Одиночный запуск против `--input-format stream-json`:** в режиме ввода stream-json демон сбрасывает счетчики бюджета в начале каждого сообщения пользователя; бюджет рассчитывается на сообщение, а не на процесс.
- **Сессии `qwen serve` / ACP:** путь сессии ACP демона в настоящее время **не** учитывает `--max-wall-time` / `--max-tool-calls` из settings.json. Эти бюджеты применяются только к одиночным запускам `qwen -p` и сессиям `--input-format stream-json`. (`qwen serve` выдает предупреждение YOLO-no-sandbox при запуске, если в настройках установлено `tools.approvalMode: 'yolo'`.)
### Рекомендуемые комбинации

- **Доверенная изолированная среда (эфемерный CI runner, контейнер):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Зафиксируйте лимит на количество ходов и общее время выполнения, чтобы застрявший агент не израсходовал все минуты CI, и используйте `--output-format json` для постобработки / аудита вызовов инструментов.
- **Локальная машина или общая инфраструктура:** также передавайте `--sandbox` (или установите `QWEN_SANDBOX=1`), чтобы инструменты shell / write / edit выполнялись внутри образа песочницы.
- **Длительные CI-задачи с повторными попытками при rate limit:** объедините `QWEN_CODE_UNATTENDED_RETRY=1` с `--max-wall-time`. Переменная окружения для повторных попыток поддерживает выполнение задачи при временных ответах 429 / 529; лимит общего времени гарантирует, что постоянно падающий провайдер не сможет бесконечно продлевать выполнение задачи.
- **Ограниченный аудит / исследование:** для задач только на чтение `--max-tool-calls 25` ограничивает агрессивность, с которой модель может использовать grep / read. Объедините это с `--exclude-tools shell,write,edit`, чтобы ограничение имело смысл.

## Примеры

### Ревью кода

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### Генерация сообщений для коммитов

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

При запуске Qwen Code в CI/CD пайплайнах или в качестве фонового демона кратковременный сбой API (rate limiting или перегрузка) не должен прерывать многочасовую задачу. **Режим постоянных повторных попыток** заставляет Qwen Code бесконечно повторять временные ошибки API до восстановления сервиса.

### Как это работает

- **Только временные ошибки**: HTTP 429 (Rate Limit) и 529 (Overloaded) повторяются бесконечно. Другие ошибки (400, 500 и т.д.) по-прежнему приводят к обычному сбою.
- **Экспоненциальная задержка с ограничением**: Задержки между повторными попытками растут экспоненциально, но ограничены **5 минутами** на одну попытку.
- **Heartbeat keepalive**: Во время длительного ожидания строка статуса выводится в stderr каждые **30 секунд**, чтобы предотвратить завершение процесса CI runner'ами из-за неактивности.
- **Корректная деградация**: Постоянные ошибки и интерактивный режим работают абсолютно без изменений.

### Активация

Установите для переменной окружения `QWEN_CODE_UNATTENDED_RETRY` значение `true` или `1` (строгое соответствие, с учетом регистра):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Для режима постоянных повторных попыток требуется **явное включение**. Одной только переменной `CI=true` **недостаточно** для его активации — скрытая замена быстро падающей CI-задачи на задачу с бесконечным ожиданием была бы опасна. Всегда явно устанавливайте `QWEN_CODE_UNATTENDED_RETRY` в конфигурации вашего пайплайна.

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

Во время постоянных повторных попыток heartbeat-сообщения выводятся в **stderr**:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Эти сообщения поддерживают активность CI runner'ов и позволяют отслеживать прогресс. Они не выводятся в stdout, поэтому JSON-вывод, передаваемый по пайпу другим инструментам, остается чистым.

## Ресурсы

- [Конфигурация CLI](../configuration/settings#command-line-arguments) - Полное руководство по конфигурации
- [Аутентификация](../configuration/auth.md) - Настройка аутентификации
- [Команды](../features/commands) - Справочник по интерактивным командам
- [Обучающие материалы](../quickstart) - Пошаговые руководства по автоматизации