# Qwen Code Hooks

## Обзор

Хуки Qwen Code предоставляют мощный механизм для расширения и настройки поведения приложения Qwen Code. Хуки позволяют пользователям выполнять пользовательские скрипты или программы в определенные моменты жизненного цикла приложения, например, перед выполнением инструмента, после выполнения инструмента, при старте/завершении сессии, а также во время других ключевых событий.

Хуки включены по умолчанию. Вы можете временно отключить все хуки, установив `disableAllHooks` в `true` в вашем файле настроек (на верхнем уровне, рядом с `hooks`):

```json
{
  "disableAllHooks": true,
  "hooks": {
    "PreToolUse": [...]
  }
}
```

Это отключает все хуки без удаления их конфигураций.

## Что такое хуки?

Хуки — это пользовательские скрипты или программы, которые автоматически выполняются Qwen Code в заданных точках потока приложения. Они позволяют пользователям:

- Отслеживать и аудировать использование инструментов
- Применять политики безопасности
- Внедрять дополнительный контекст в диалоги
- Настраивать поведение приложения на основе событий
- Интегрироваться с внешними системами и сервисами
- Программно изменять входные данные инструментов или ответы

## Типы хуков

Qwen Code поддерживает четыре типа исполнителей хуков:

| Тип        | Описание                                                                                     |
| :--------- | :------------------------------------------------------------------------------------------- |
| `command`  | Выполнение shell-команды. Получает JSON через `stdin`, возвращает результат через `stdout`.  |
| `http`     | Отправка JSON в качестве тела `POST`-запроса на указанный URL. Результат возвращается через тело HTTP-ответа. |
| `function` | Прямой вызов зарегистрированной JavaScript-функции (только для хуков уровня сессии).         |
| `prompt`   | Использование LLM для оценки входных данных хука и возврата решения.                         |

### Командные хуки

Командные хуки выполняют команды через дочерние процессы. Входной JSON передаётся через stdin, а вывод возвращается через stdout.

**Конфигурация:**

| Поле             | Тип                      | Обязательное | Описание                                     |
| :--------------- | :----------------------- | :----------- | :------------------------------------------- |
| `type`           | `"command"`              | Да           | Тип хука                                     |
| `command`        | `string`                 | Да           | Команда для выполнения                       |
| `name`           | `string`                 | Нет          | Имя хука (для логирования)                   |
| `description`    | `string`                 | Нет          | Описание хука                                |
| `timeout`        | `number`                 | Нет          | Таймаут в миллисекундах, по умолчанию 60000  |
| `async`          | `boolean`                | Нет          | Запускать ли асинхронно в фоне               |
| `env`            | `Record<string, string>` | Нет          | Переменные окружения                         |
| `shell`          | `"bash" \| "powershell"` | Нет          | Используемая оболочка                        |
| `statusMessage`  | `string`                 | Нет          | Сообщение о статусе, отображаемое во время выполнения |

**Пример:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WriteFile",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/security-check.sh",
            "name": "security-check",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### HTTP-хуки

HTTP-хуки отправляют входные данные хука в виде POST-запросов на указанные URL. Они поддерживают белые списки URL, защиту от SSRF на уровне DNS, интерполяцию переменных окружения и другие функции безопасности.

**Конфигурация:**

| Поле             | Тип                      | Обязательное | Описание                                                    |
| :--------------- | :----------------------- | :----------- | :---------------------------------------------------------- |
| `type`           | `"http"`                 | Да           | Тип хука                                                    |
| `url`            | `string`                 | Да           | Целевой URL                                                 |
| `headers`        | `Record<string, string>` | Нет          | Заголовки запроса (поддерживает интерполяцию переменных окружения) |
| `allowedEnvVars` | `string[]`               | Нет          | Белый список переменных окружения, разрешённых в URL/заголовках |
| `timeout`        | `number`                 | Нет          | Таймаут в секундах, по умолчанию 600                        |
| `name`           | `string`                 | Нет          | Имя хука (для логирования)                                  |
| `statusMessage`  | `string`                 | Нет          | Сообщение о статусе, отображаемое во время выполнения        |
| `once`           | `boolean`                | Нет          | Выполнить только один раз за событие за сессию (только для HTTP-хуков) |

**Функции безопасности:**

- **Белый список URL**: Настройка разрешённых шаблонов URL через `allowedUrls`
- **Защита от SSRF**: Блокировка частных IP-адресов (10.x.x.x, 172.16‑31.x.x, 192.168.x.x и т.д.), но разрешены адреса loopback (127.0.0.1, ::1)
- **DNS-валидация**: Проверка разрешения домена перед запросами для предотвращения атак DNS-ребандинга
- **Интерполяция переменных окружения**: Синтаксис `${VAR}`, разрешены только переменные из белого списка `allowedEnvVars`

**Пример:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:8080/hooks/pre-tool-use",
            "headers": {
              "Authorization": "Bearer ${HOOK_API_KEY}"
            },
            "allowedEnvVars": ["HOOK_API_KEY"],
            "timeout": 10,
            "name": "remote-security-check"
          }
        ]
      }
    ]
  }
}
```

### Функциональные хуки

Функциональные хуки напрямую вызывают зарегистрированные JavaScript/TypeScript-функции. Они используются внутри системы навыков (Skills) и в настоящее время не предоставляются как публичный API для конечных пользователей.

**Примечание**: В большинстве случаев используйте **командные хуки** или **HTTP-хуки**, которые можно настроить в файлах настроек.

### Промпт-хуки

Промпт-хуки используют LLM для оценки входных данных хука и возврата решения. Это полезно для принятия интеллектуальных решений на основе контекста, например, для определения, разрешить или заблокировать операцию.

**Как это работает:**

1. Входной JSON хука вставляется в ваш промпт с помощью плейсхолдера `$ARGUMENTS`
2. Промпт отправляется в LLM (по умолчанию: ваша текущая модель)
3. LLM возвращает JSON-ответ с решением
4. Qwen Code обрабатывает решение и продолжает или блокирует выполнение

**Конфигурация:**

| Поле             | Тип        | Обязательное | Описание                                           |
| :--------------- | :--------- | :----------- | :------------------------------------------------- |
| `type`           | `"prompt"` | Да           | Тип хука                                           |
| `prompt`         | `string`   | Да           | Промпт, отправляемый в LLM. Используйте `$ARGUMENTS` для входных данных хука |
| `model`          | `string`   | Нет          | Модель для использования (по умолчанию ваша текущая модель) |
| `timeout`        | `number`   | Нет          | Таймаут в секундах, по умолчанию 30                |
| `name`           | `string`   | Нет          | Имя хука (для логирования)                         |
| `description`    | `string`   | Нет          | Описание хука                                      |
| `statusMessage`  | `string`   | Нет          | Сообщение о статусе, отображаемое во время выполнения |

**Формат ответа:**

LLM должна вернуть JSON следующей структуры:

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Поле               | Описание                                                                |
| :----------------- | :---------------------------------------------------------------------- |
| `ok`               | `true` — разрешить/продолжить, `false` — заблокировать/остановить       |
| `reason`           | Обязателен, если `ok` равно `false`. Показывается модели для объяснения блокировки |
| `additionalContext` | Опционально. Дополнительный контекст, вставляемый в диалог при разрешении |

**Поддерживаемые события:**

Промпт-хуки можно использовать с большинством событий хуков, включая:

- `PreToolUse` — оценка, разрешить ли вызов инструмента
- `PostToolUse` — оценка результатов инструмента и возможное внедрение контекста
- `Stop` — определение, продолжать или остановиться
- `SubagentStop` — оценка результатов сабэджента
- `UserPromptSubmit` — оценка или обогащение пользовательских промптов

**Пример: хук Stop**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Qwen Code should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Когда `ok` равно `false`, Qwen Code продолжает работу и использует `reason` как контекст для следующего ответа.

**Пример: хук PreToolUse**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate this tool call for security concerns. Tool input: $ARGUMENTS\n\nCheck for:\n- Dangerous commands (rm -rf, curl | sh, etc.)\n- Unauthorized access attempts\n- Data exfiltration patterns\n\nRespond with {\"ok\": true} if safe, or {\"ok\": false, \"reason\": \"concern\"} if blocked.",
            "model": "sonnet",
            "timeout": 30,
            "name": "security-evaluator"
          }
        ]
      }
    ]
  }
}
```

## События хуков

Хуки срабатывают в определённых точках во время сессии Qwen Code. Разные события поддерживают разные матчеры для фильтрации условий срабатывания.

| Событие               | Когда срабатывает                             | Цель матчера                                                 |
| :-------------------- | :-------------------------------------------- | :----------------------------------------------------------- |
| `PreToolUse`          | Перед выполнением инструмента                 | Имя инструмента (`WriteFile`, `ReadFile`, `Bash` и т.д.)     |
| `PostToolUse`         | После успешного выполнения инструмента        | Имя инструмента                                              |
| `PostToolUseFailure`  | После неудачного выполнения инструмента       | Имя инструмента                                              |
| `UserPromptSubmit`    | После отправки пользовательского промпта      | Нет (всегда срабатывает)                                     |
| `SessionStart`        | При старте или возобновлении сессии           | Источник (`startup`, `resume`, `clear`, `compact`)           |
| `SessionEnd`          | При завершении сессии                         | Причина (`clear`, `logout`, `prompt_input_exit` и т.д.)      |
| `Stop`                | Когда Claude готовится завершить ответ        | Нет (всегда срабатывает)                                     |
| `SubagentStart`       | При запуске сабэджента                        | Тип агента (`Bash`, `Explorer`, `Plan` и т.д.)               |
| `SubagentStop`        | При остановке сабэджента                      | Тип агента                                                   |
| `PreCompact`          | Перед компактификацией диалога                | Триггер (`manual`, `auto`)                                   |
| `Notification`        | При отправке уведомлений                      | Тип (`permission_prompt`, `idle_prompt`, `auth_success`)     |
| `PermissionRequest`   | При показе диалога разрешений                 | Имя инструмента                                              |
| `TodoCreated`         | При создании нового элемента todo             | Нет (всегда срабатывает)                                     |
| `TodoCompleted`       | При отметке элемента todo как выполненного    | Нет (всегда срабатывает)                                     |

### Шаблоны матчеров

`matcher` — это регулярное выражение, используемое для фильтрации условий срабатывания.

| Тип события      | События                                                              | Поддержка матчера | Цель матчера                                              |
| :--------------- | :------------------------------------------------------------------- | :---------------- | :-------------------------------------------------------- |
| События инструментов | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Рег. выраж.    | Имя инструмента: `WriteFile`, `ReadFile`, `Bash` и т.д.   |
| События сабэджентов | `SubagentStart`, `SubagentStop`                                      | ✅ Рег. выраж.    | Тип агента: `Bash`, `Explorer` и т.д.                     |
| События сессии   | `SessionStart`                                                       | ✅ Рег. выраж.    | Источник: `startup`, `resume`, `clear`, `compact`         |
| События сессии   | `SessionEnd`                                                         | ✅ Рег. выраж.    | Причина: `clear`, `logout`, `prompt_input_exit` и т.д.    |
| События уведомлений | `Notification`                                                       | ✅ Точное совпад. | Тип: `permission_prompt`, `idle_prompt`, `auth_success`   |
| События компактификации | `PreCompact`                                                         | ✅ Точное совпад. | Триггер: `manual`, `auto`                                 |
| События todo     | `TodoCreated`, `TodoCompleted`                                       | ❌ Нет            | N/A                                                       |
| События промптов | `UserPromptSubmit`                                                   | ❌ Нет            | N/A                                                       |
| События остановки | `Stop`                                                               | ❌ Нет            | N/A                                                       |

**Синтаксис матчера:**

- Пустая строка `""` или `"*"` соответствует всем событиям данного типа
- Поддерживается стандартный синтаксис регулярных выражений (например, `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

**Примеры:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "Write.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'write check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "echo 'all tools' >> /tmp/hooks.log" }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'subagent check' >> /tmp/hooks.log"
          }
        ]
      }
    ]
  }
}
```

## Правила ввода/вывода

### Структура входных данных хука

Все хуки получают стандартизированные входные данные в формате JSON через stdin (для команды) или в теле POST-запроса (для http).

**Общие поля:**

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Поля, специфичные для события, добавляются в зависимости от типа хука. При работе в сабэдженте также включаются `agent_id` и `agent_type`.

### Структура выходных данных хука

Выходные данные хука возвращаются через `stdout` (для команды) или через тело HTTP-ответа (для http) в формате JSON.

**Поведение кода выхода (командные хуки):**

| Код выхода | Поведение                                                                          |
| :--------- | :--------------------------------------------------------------------------------- |
| `0`        | Успех. JSON в `stdout` разбирается для управления поведением.                      |
| `2`        | **Блокирующая ошибка**. `stdout` игнорируется, `stderr` передаётся модели как информация об ошибке. |
| Другой     | Неблокирующая ошибка. `stderr` показывается только в режиме отладки, выполнение продолжается. |

**Структура вывода:**

Вывод хука поддерживает три категории полей:

1. **Общие поля**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Решение верхнего уровня**: `decision`, `reason` (используется некоторыми событиями)
3. **Управление, специфичное для события**: `hookSpecificOutput` (должен содержать `hookEventName`)

```json
{
  "continue": true,
  "decision": "allow",
  "reason": "Operation approved",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Additional context information"
  }
}
```

### Детали отдельных событий хуков

#### PreToolUse

**Назначение**: Выполняется перед использованием инструмента для проверки разрешений, валидации ввода или внедрения контекста.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**Параметры вывода**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" или "ask" (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.permissionDecisionReason`: объяснение решения (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.updatedInput`: изменённые входные параметры инструмента для использования вместо исходных
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация

**Примечание**: Хотя стандартные поля вывода хука, такие как `decision` и `reason`, технически поддерживаются базовым классом, официальный интерфейс ожидает `hookSpecificOutput` с `permissionDecision` и `permissionDecisionReason`.

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Security policy blocks database writes",
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**Назначение**: Выполняется после успешного завершения работы инструмента для обработки результатов, логирования исходов или внедрения дополнительного контекста.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)"
}
```

**Параметры вывода**:

- `decision`: "allow", "deny", "block" (по умолчанию "allow", если не указано)
- `reason`: причина решения
- `hookSpecificOutput.additionalContext`: дополнительная информация для включения

**Пример вывода**:

```json
{
  "decision": "allow",
  "reason": "Tool executed successfully",
  "hookSpecificOutput": {
    "additionalContext": "File modification recorded in audit log"
  }
}
```

#### PostToolUseFailure

**Назначение**: Выполняется при сбое выполнения инструмента для обработки ошибок, отправки оповещений или записи сбоев.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use (internal format, e.g., toolu_xxx)",
  "tool_call_id": "original API call ID from the LLM provider (e.g., call_xxx for OpenAI/Qwen) (optional)",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```
**Output Options**:

- `hookSpecificOutput.additionalContext`: информация об обработке ошибок
- Стандартные поля вывода хуков

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Назначение**: Выполняется, когда пользователь отправляет запрос для изменения, проверки или обогащения входных данных.

**Поля, специфичные для события**:

```json
{
  "prompt": "текст отправленного пользователем запроса"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение принятого решения
- `hookSpecificOutput.additionalContext`: дополнительный контекст, добавляемый к запросу (опционально)

**Примечание**: Поскольку UserPromptSubmitOutput расширяет HookOutput, доступны все стандартные поля, но для этого события определён только `additionalContext` в `hookSpecificOutput`.

**Пример вывода**:

```json
{
  "decision": "allow",
  "reason": "Prompt reviewed and approved",
  "hookSpecificOutput": {
    "additionalContext": "Remember to follow company coding standards."
  }
}
```

#### SessionStart

**Назначение**: Выполняется при запуске новой сессии для выполнения задач инициализации.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "используемая модель",
  "agent_type": "тип агента, если применимо (опционально)"
}
```

**Output Options**:

- `hookSpecificOutput.additionalContext`: контекст, который будет доступен в сессии
- Стандартные поля вывода хуков

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Session started with security policies enabled."
  }
}
```

#### SessionEnd

**Назначение**: Выполняется при завершении сессии для выполнения задач очистки.

**Поля, специфичные для события**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Output Options**:

- Стандартные поля вывода хуков (обычно не используются для блокировки)

#### Stop

**Назначение**: Выполняется перед тем, как Qwen завершит свой ответ, чтобы предоставить итоговую обратную связь или сводку.

**Поля, специфичные для события**:

```json
{
  "stop_hook_active": "логический флаг, указывающий, активен ли хук остановки",
  "last_assistant_message": "последнее сообщение от ассистента"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение принятого решения
- `stopReason`: обратная связь, включаемая в ответ при остановке
- `continue`: установите false для остановки выполнения
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация

**Примечание**: Поскольку StopOutput расширяет HookOutput, доступны все стандартные поля, но для этого события особенно важным является поле `stopReason`.

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Назначение**: Выполняется, когда завершение хода происходит из-за ошибки API (вместо Stop). Это событие типа **«забыл и забыл»** — вывод хука и коды выхода игнорируются.

**Поля, специфичные для события**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "детальное сообщение об ошибке (опционально)",
  "last_assistant_message": "последнее сообщение от ассистента перед ошибкой (опционально)"
}
```

**Сопоставление (Matcher)**: Сопоставляется с полем `error`. Например, `"matcher": "rate_limit"` сработает только для ошибок превышения лимита запросов.

**Output Options**:

- **Нет** — StopFailure является событием типа «забыл и забыл». Все выводы хуков и коды выхода игнорируются.

**Обработка кодов выхода**:

| Код выхода | Поведение                |
| ---------- | ------------------------ |
| Любой      | Игнорируется (забыл и забыл) |

**Пример конфигурации**:

```json
{
  "hooks": {
    "StopFailure": [
      {
        "matcher": "rate_limit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/rate-limit-alert.sh",
            "name": "rate-limit-alerter"
          }
        ]
      }
    ]
  }
}
```

**Варианты использования**:

- Мониторинг и оповещение о превышении лимита запросов
- Логирование ошибок аутентификации
- Уведомления об ошибках выставления счетов
- Сбор статистики ошибок

#### SubagentStart

**Назначение**: Выполняется при запуске подагента (например, инструмента Task) для настройки контекста или прав.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "идентификатор подагента",
  "agent_type": "тип агента (Bash, Explorer, Plan, Custom и т.д.)"
}
```

**Output Options**:

- `hookSpecificOutput.additionalContext`: начальный контекст для подагента
- Стандартные поля вывода хуков

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Subagent initialized with restricted permissions."
  }
}
```

#### SubagentStop

**Назначение**: Выполняется при завершении работы подагента для выполнения задач финализации.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "логический флаг, указывающий, активен ли хук остановки",
  "agent_id": "идентификатор подагента",
  "agent_type": "тип агента",
  "agent_transcript_path": "путь к транскрипту подагента",
  "last_assistant_message": "последнее сообщение от подагента"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение принятого решения

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Назначение**: Выполняется перед сжатием разговора для подготовки или логирования сжатия.

**Поля, специфичные для события**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "текущие настраиваемые инструкции"
}
```

**Output Options**:

- `hookSpecificOutput.additionalContext`: контекст, добавляемый перед сжатием
- Стандартные поля вывода хуков

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**Назначение**: Выполняется после завершения сжатия разговора для архивации сводок или отслеживания использования.

**Поля, специфичные для события**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "сводка, созданная процессом сжатия"
}
```

**Сопоставление (Matcher)**: Сопоставляется с полем `trigger`. Например, `"matcher": "manual"` сработает только при ручном сжатии через команду `/compact`.

**Output Options**:

- `hookSpecificOutput.additionalContext`: дополнительный контекст (только для логирования)
- Стандартные поля вывода хуков (только для логирования)

**Примечание**: PostCompact **не входит** в официальный список событий, поддерживающих режим принятия решений. Поле `decision` и другие управляющие поля не оказывают управляющего эффекта — они используются только для логирования.

**Обработка кодов выхода**:

| Код выхода | Поведение                                                      |
| ---------- | -------------------------------------------------------------- |
| 0          | Успех — stdout показывается пользователю в подробном режиме     |
| Другие     | Неблокирующая ошибка — stderr показывается пользователю в подробном режиме |

**Пример конфигурации**:

```json
{
  "hooks": {
    "PostCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/save-compact-summary.sh",
            "name": "save-summary"
          }
        ]
      }
    ]
  }
}
```

**Варианты использования**:

- Архивирование сводок в файлы или базы данных
- Отслеживание статистики использования
- Мониторинг изменений контекста
- Журналирование аудита для операций сжатия

#### Notification

**Назначение**: Выполняется при отправке уведомлений для их настройки или перехвата.

**Поля, специфичные для события**:

```json
{
  "message": "содержимое уведомления",
  "title": "заголовок уведомления (опционально)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Примечание**: Тип `elicitation_dialog` определён, но в настоящее время не реализован.

**Output Options**:

- `hookSpecificOutput.additionalContext`: дополнительная информация для включения
- Стандартные поля вывода хуков

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Назначение**: Выполняется при отображении диалогов разрешений для автоматизации решений или обновления разрешений.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "имя инструмента, запрашивающего разрешение",
  "tool_input": "объект, содержащий входные параметры инструмента",
  "permission_suggestions": "массив предложенных разрешений (опционально)"
}
```

**Output Options**:

- `hookSpecificOutput.decision`: структурированный объект с деталями решения о разрешении:
  - `behavior`: "allow" или "deny"
  - `updatedInput`: изменённый ввод инструмента (опционально)
  - `updatedPermissions`: изменённые разрешения (опционально)
  - `message`: сообщение для отображения пользователю (опционально)
  - `interrupt`: следует ли прервать рабочий процесс (опционально)

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "Permission granted based on security policy",
      "interrupt": false
    }
  }
}
```

#### TodoCreated

**Назначение**: Выполняется при создании нового элемента todo через инструмент `todo_write`. Позволяет проверять, логировать или блокировать создание todo.

Хуки Todo работают в две фазы:

- `validation`: выполняется перед сохранением. Используйте эту фазу только для проверки; возврат `block` или `deny` предотвращает запись.
- `postWrite`: выполняется после сохранения. Используйте эту фазу для побочных эффектов, таких как логирование или синхронизация; `block` или `deny` в этой фазе игнорируется.

**Поля, специфичные для события**:

```json
{
  "todo_id": "уникальный идентификатор элемента todo",
  "todo_content": "содержание/описание элемента todo",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "массив всех элементов todo в текущем списке",
  "phase": "validation | postWrite"
}
```

**Output Options**:

- `decision`: "allow", "block" или "deny"
- `reason`: понятное человеку объяснение принятого решения (обязательно при блокировке)

**Поведение при блокировке**:

Во время фазы `validation`, когда `decision` равен `block` или `deny` (код выхода 2), создание todo предотвращается. Список todo остаётся неизменным, а причина передаётся модели в качестве обратной связи.

Во время фазы `postWrite` элемент todo уже был сохранён. Хуки могут по-прежнему возвращать вывод, но `block` / `deny` не отменяет запись и не должен использоваться для проверки.

**Пример вывода (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo content validated successfully"
}
```

**Пример вывода (Block)**:

```json
{
  "decision": "block",
  "reason": "Todo content too short. Minimum 5 characters required."
}
```

**Пример скрипта хука**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Validates todo content before creation

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Check minimum length
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Block test-related todos
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Test todos are not allowed in production"}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Пример конфигурации**:

```json
{
  "hooks": {
    "TodoCreated": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-validator.sh",
            "name": "todo-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

#### TodoCompleted

**Назначение**: Выполняется, когда элемент todo отмечается как выполненный. Позволяет проверять, логировать или блокировать завершение todo.

Хуки Todo работают в две фазы:

- `validation`: выполняется перед сохранением. Используйте эту фазу только для проверки; возврат `block` или `deny` предотвращает запись.
- `postWrite`: выполняется после сохранения. Используйте эту фазу для побочных эффектов, таких как логирование или синхронизация; `block` или `deny` в этой фазе игнорируется.

**Поля, специфичные для события**:

```json
{
  "todo_id": "уникальный идентификатор элемента todo",
  "todo_content": "содержание/описание элемента todo",
  "previous_status": "pending | in_progress (статус до завершения)",
  "all_todos": "массив всех элементов todo в текущем списке",
  "phase": "validation | postWrite"
}
```

**Output Options**:

- `decision`: "allow", "block" или "deny"
- `reason`: понятное человеку объяснение принятого решения (обязательно при блокировке)

**Поведение при блокировке**:

Во время фазы `validation`, когда `decision` равен `block` или `deny` (код выхода 2), завершение todo предотвращается. Элемент todo остаётся в предыдущем статусе, а причина передаётся модели в качестве обратной связи.

Во время фазы `postWrite` элемент todo уже был сохранён. Хуки могут по-прежнему возвращать вывод, но `block` / `deny` не отменяет запись и не должен использоваться для проверки.

**Пример вывода (Allow)**:

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**Пример вывода (Block)**:

```json
{
  "decision": "block",
  "reason": "Cannot complete this todo until dependent tasks are finished."
}
```

**Пример скрипта хука**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-completion-validator.sh
# Validates todo completion conditions

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Check if there are incomplete dependent todos (example logic)
INCOMPLETE_COUNT=$(echo "$ALL_TODOS" | jq '[.[] | select(.status != "completed")] | length')

if [ "$INCOMPLETE_COUNT" -gt 5 ]; then
  echo '{"decision": "block", "reason": "Too many incomplete todos. Complete other tasks first."}'
  exit 2
fi

echo '{"decision": "allow"}'
exit 0
```

**Пример конфигурации**:

```json
{
  "hooks": {
    "TodoCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.qwen/hooks/todo-completion-validator.sh",
            "name": "completion-validator",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

**Варианты использования**:

- **Логирование**: Отслеживание создания и завершения todo для аудита или аналитики
- **Проверка**: Контроль стандартов качества содержимого (минимальная длина, обязательные ключевые слова)
- **Управление рабочим процессом**: Блокировка завершения до выполнения предварительных условий
- **Интеграция**: Синхронизация todo с внешними системами управления задачами (Jira, Trello и т.д.)

## Конфигурация хуков

Хуки настраиваются в настройках Qwen Code, обычно в `.qwen/settings.json` или файлах конфигурации пользователя:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^Bash$",
        "sequential": false,
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/security-check.sh",
            "name": "security-check",
            "description": "Run security checks before tool execution",
            "timeout": 30000
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'",
            "name": "session-init"
          }
        ]
      }
    ]
  }
}
```

## Выполнение хуков

### Параллельное и последовательное выполнение

- По умолчанию хуки выполняются параллельно для повышения производительности
- Используйте `sequential: true` в определении хука, чтобы обеспечить порядок выполнения
- Последовательные хуки могут изменять ввод для последующих хуков в цепочке

### Асинхронные хуки

Только тип `command` поддерживает асинхронное выполнение. Установка `"async": true` запускает хук в фоновом режиме без блокировки основного потока.

**Особенности:**

- Не могут возвращать управляющее решение (операция уже произошла)
- Результаты внедряются в следующий ход разговора через `systemMessage` или `additionalContext`
- Подходят для аудита, логирования, фонового тестирования и т.д.

**Пример:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "WriteFile|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$QWEN_PROJECT_DIR/.qwen/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300000
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then exit 0; fi
RESULT=$(npm test 2>&1)
if [ $? -eq 0 ]; then
  echo "{\"systemMessage\": \"Tests passed after editing $FILE_PATH\"}"
else
  echo "{\"systemMessage\": \"Tests failed: $RESULT\"}"
fi
```

### Модель безопасности

- Хуки выполняются в окружении пользователя с его привилегиями
- Хуки на уровне проекта требуют статуса доверенной папки
- Тайм-ауты предотвращают зависание хуков (по умолчанию: 60 секунд)

## Лучшие практики

### Пример 1: Хук проверки безопасности

Хук PreToolUse, который логирует и потенциально блокирует опасные команды:

**security_check.sh**

```bash
#!/bin/bash

# Read input from stdin
INPUT=$(cat)

# Parse the input to extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Check for potentially dangerous operations
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Blocking error
fi

# Log the operation
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Security check passed",
    "additionalContext": "Command approved by security policy"
  }
}'
exit 0
```

Настройка в `.qwen/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${SECURITY_CHECK_SCRIPT}",
            "name": "security-checker",
            "description": "Security validation for bash commands",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

### Пример 2: HTTP-хук аудита

Хук PostToolUse типа HTTP, отправляющий все записи о выполнении инструментов в удалённый сервис аудита:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "https://audit.example.com/api/tool-execution",
            "headers": {
              "Authorization": "Bearer ${AUDIT_API_TOKEN}",
              "Content-Type": "application/json"
            },
            "allowedEnvVars": ["AUDIT_API_TOKEN"],
            "timeout": 10,
            "name": "audit-logger"
          }
        ]
      }
    ]
  }
}
```

### Пример 3: Хук проверки пользовательского запроса

Хук UserPromptSubmit, проверяющий пользовательские запросы на наличие конфиденциальной информации и добавляющий контекст для длинных запросов:

**prompt_validator.py**

```python
import json
import sys
import re

# Load input from stdin
try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    exit(1)

user_prompt = input_data.get("prompt", "")

# Sensitive words list
sensitive_words = ["password", "secret", "token", "api_key"]

# Check for sensitive information
for word in sensitive_words:
    if re.search(rf"\b{word}\b", user_prompt.lower()):
        # Block prompts containing sensitive information
        output = {
            "decision": "block",
            "reason": f"Prompt contains sensitive information '{word}'. Please remove sensitive content and resubmit.",
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit"
            }
        }
        print(json.dumps(output))
        exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    exit(0)

# No processing needed for normal cases
exit(0)
```
## Устранение неполадок

- Проверьте логи приложения для получения подробной информации о выполнении хуков
- Убедитесь, что скрипты хуков имеют правильные разрешения и являются исполняемыми
- Обеспечьте корректное форматирование JSON в выходных данных хуков
- Используйте точные шаблоны сопоставления (matcher), чтобы избежать непреднамеренного выполнения хуков
- Используйте режим `--debug` для просмотра подробной информации о сопоставлении и выполнении хуков
- Временно отключите все хуки: добавьте `"disableAllHooks": true` в настройки