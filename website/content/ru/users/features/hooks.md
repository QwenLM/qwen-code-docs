# Хуки Qwen Code

## Обзор

Хуки Qwen Code предоставляют мощный механизм для расширения и настройки поведения приложения Qwen Code. Хуки позволяют пользователям выполнять пользовательские скрипты или программы в определенные моменты жизненного цикла приложения, например, перед выполнением инструмента, после выполнения инструмента, при начале/завершении сессии и во время других ключевых событий.

Хуки включены по умолчанию. Вы можете временно отключить все хуки, установив для параметра `disableAllHooks` значение `true` в файле настроек (на верхнем уровне, рядом с `hooks`):

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

Хуки — это пользовательские скрипты или программы, которые автоматически выполняются Qwen Code в заранее определенных точках потока приложения. Они позволяют пользователям:

- Отслеживать и аудировать использование инструментов
- Обеспечивать соблюдение политик безопасности
- Внедрять дополнительный контекст в диалоги
- Настраивать поведение приложения в зависимости от событий
- Интегрироваться с внешними системами и сервисами
- Программно изменять входные данные или ответы инструментов

## Типы хуков

Qwen Code поддерживает четыре типа исполнителей хуков:

| Тип        | Описание                                                                                       |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Выполняет shell-команду. Получает JSON через `stdin`, возвращает результаты через `stdout`.    |
| `http`     | Отправляет JSON в теле `POST`-запроса на указанный URL. Возвращает результаты через тело HTTP-ответа. |
| `function` | Напрямую вызывает зарегистрированную JavaScript-функцию (только для хуков уровня сессии).      |
| `prompt`   | Использует LLM для оценки входных данных хука и возврата решения.                              |

### Command-хуки

Command-хуки выполняют команды через дочерние процессы. Входной JSON передается через stdin, а выходные данные возвращаются через stdout.

**Конфигурация:**

| Поле            | Тип                      | Обязательно | Описание                                      |
| :-------------- | :----------------------- | :---------- | :-------------------------------------------- |
| `type`          | `"command"`              | Да          | Тип хука                                      |
| `command`       | `string`                 | Да          | Команда для выполнения                        |
| `name`          | `string`                 | Нет         | Имя хука (для логирования)                    |
| `description`   | `string`                 | Нет         | Описание хука                                 |
| `timeout`       | `number`                 | Нет         | Таймаут в миллисекундах, по умолчанию 60000   |
| `async`         | `boolean`                | Нет         | Запускать ли асинхронно в фоновом режиме      |
| `env`           | `Record<string, string>` | Нет         | Переменные окружения                          |
| `shell`         | `"bash" \| "powershell"` | Нет         | Используемая оболочка                         |
| `statusMessage` | `string`                 | Нет         | Сообщение о статусе, отображаемое во время выполнения |

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

| Поле             | Тип                      | Обязательно | Описание                                                |
| :--------------- | :----------------------- | :---------- | :------------------------------------------------------ |
| `type`           | `"http"`                 | Да          | Тип хука                                                |
| `url`            | `string`                 | Да          | Целевой URL                                             |
| `headers`        | `Record<string, string>` | Нет         | Заголовки запроса (поддерживают интерполяцию переменных окружения) |
| `allowedEnvVars` | `string[]`               | Нет         | Белый список переменных окружения, разрешенных в URL/заголовках |
| `timeout`        | `number`                 | Нет         | Таймаут в секундах, по умолчанию 600                    |
| `name`           | `string`                 | Нет         | Имя хука (для логирования)                              |
| `statusMessage`  | `string`                 | Нет         | Сообщение о статусе, отображаемое во время выполнения   |
| `once`           | `boolean`                | Нет         | Выполнять только один раз для каждого события в рамках сессии (только для HTTP-хуков) |

**Функции безопасности:**

- **Белый список URL**: настройка разрешенных шаблонов URL через `allowedUrls`
- **Защита от SSRF**: блокирует приватные IP-адреса (10.x.x.x, 172.16-31.x.x, 192.168.x.x и т.д.), но разрешает loopback-адреса (127.0.0.1, ::1)
- **Валидация DNS**: проверяет разрешение доменов перед запросами для предотвращения атак DNS rebinding
- **Интерполяция переменных окружения**: синтаксис `${VAR}`, разрешает только переменные из белого списка `allowedEnvVars`

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

### Function-хуки

Function-хуки напрямую вызывают зарегистрированные JavaScript/TypeScript-функции. Они используются внутри системы Skill и в настоящее время не доступны как публичный API для конечных пользователей.

**Примечание**: для большинства случаев использования лучше применять **command-хуки** или **HTTP-хуки**, которые можно настраивать в файлах конфигурации.

### Prompt-хуки

Prompt-хуки используют LLM для оценки входных данных хука и возврата решения. Это полезно для принятия интеллектуальных решений на основе контекста, например, для определения того, разрешить или заблокировать операцию.

**Как это работает:**

1. Входной JSON хука внедряется в ваш промпт с помощью плейсхолдера `$ARGUMENTS`
2. Промпт отправляется в LLM (по умолчанию используется ваша текущая модель)
3. LLM возвращает JSON-ответ с решением
4. Qwen Code обрабатывает решение и соответственно продолжает или блокирует выполнение

**Конфигурация:**

| Поле            | Тип        | Обязательно | Описание                                          |
| :-------------- | :--------- | :---------- | :------------------------------------------------ |
| `type`          | `"prompt"` | Да          | Тип хука                                          |
| `prompt`        | `string`   | Да          | Промпт, отправляемый в LLM. Используйте `$ARGUMENTS` для входных данных хука |
| `model`         | `string`   | Нет         | Используемая модель (по умолчанию ваша текущая модель) |
| `timeout`       | `number`   | Нет         | Таймаут в секундах, по умолчанию 30               |
| `name`          | `string`   | Нет         | Имя хука (для логирования)                        |
| `description`   | `string`   | Нет         | Описание хука                                     |
| `statusMessage` | `string`   | Нет         | Сообщение о статусе, отображаемое во время выполнения |

**Формат ответа:**

LLM должна вернуть JSON со следующей структурой:

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Поле                | Описание                                                               |
| :------------------ | :--------------------------------------------------------------------- |
| `ok`                | `true` для разрешения/продолжения, `false` для блокировки/остановки    |
| `reason`            | Обязательно, если `ok` равно `false`. Передается модели для объяснения блокировки |
| `additionalContext` | Опционально. Дополнительный контекст для внедрения в диалог при разрешении |

**Поддерживаемые события:**

Prompt-хуки можно использовать с большинством событий хуков, включая:

- `PreToolUse` — оценка того, разрешить ли вызов инструмента
- `PostToolUse` — оценка результатов инструмента и потенциальное внедрение контекста
- `Stop` — определение, продолжать ли работу или остановиться
- `SubagentStop` — оценка результатов подагента
- `UserPromptSubmit` — оценка или обогащение промптов пользователя

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

Если `ok` равно `false`, Qwen Code продолжит работу и использует `reason` как контекст для следующего ответа.

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

Хуки срабатывают в определенные моменты во время сессии Qwen Code. Различные события поддерживают разные матчеры для фильтрации условий срабатывания.

| Событие              | Когда срабатывает                           | Цель матчера                                              |
| :------------------- | :------------------------------------------ | :-------------------------------------------------------- |
| `PreToolUse`         | До выполнения инструмента                   | Имя инструмента (`WriteFile`, `ReadFile`, `Bash` и т.д.)  |
| `PostToolUse`        | После успешного выполнения инструмента      | Имя инструмента                                           |
| `PostToolUseFailure` | После сбоя при выполнении инструмента       | Имя инструмента                                           |
| `UserPromptSubmit`   | После отправки промпта пользователем        | Нет (срабатывает всегда)                                  |
| `SessionStart`       | При запуске или возобновлении сессии        | Источник (`startup`, `resume`, `clear`, `compact`)        |
| `SessionEnd`         | При завершении сессии                       | Причина (`clear`, `logout`, `prompt_input_exit` и т.д.)   |
| `Stop`               | Когда Claude готовится завершить ответ      | Нет (срабатывает всегда)                                  |
| `SubagentStart`      | При запуске подагента                       | Тип агента (`Bash`, `Explorer`, `Plan` и т.д.)            |
| `SubagentStop`       | При остановке подагента                     | Тип агента                                                |
| `PreCompact`         | Перед сжатием диалога                       | Триггер (`manual`, `auto`)                                |
| `Notification`       | При отправке уведомлений                    | Тип (`permission_prompt`, `idle_prompt`, `auth_success`)  |
| `PermissionRequest`  | При отображении диалога запроса разрешений  | Имя инструмента                                           |
| `TodoCreated`        | При создании нового элемента todo           | Нет (срабатывает всегда)                                  |
| `TodoCompleted`      | Когда элемент todo помечается как выполненный | Нет (срабатывает всегда)                                |

### Паттерны матчеров

`matcher` — это регулярное выражение, используемое для фильтрации условий срабатывания.

| Тип события         | События                                                              | Поддержка матчера | Цель матчера                                           |
| :------------------ | :------------------------------------------------------------------- | :---------------- | :----------------------------------------------------- |
| События инструментов | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex          | Имя инструмента: `WriteFile`, `ReadFile`, `Bash` и т.д. |
| События подагентов  | `SubagentStart`, `SubagentStop`                                      | ✅ Regex          | Тип агента: `Bash`, `Explorer` и т.д.                  |
| События сессии      | `SessionStart`                                                       | ✅ Regex          | Источник: `startup`, `resume`, `clear`, `compact`      |
| События сессии      | `SessionEnd`                                                         | ✅ Regex          | Причина: `clear`, `logout`, `prompt_input_exit` и т.д. |
| События уведомлений | `Notification`                                                       | ✅ Точное совпадение | Тип: `permission_prompt`, `idle_prompt`, `auth_success` |
| События сжатия      | `PreCompact`                                                         | ✅ Точное совпадение | Триггер: `manual`, `auto`                              |
| События Todo        | `TodoCreated`, `TodoCompleted`                                       | ❌ Нет            | Н/Д                                                    |
| События промптов    | `UserPromptSubmit`                                                   | ❌ Нет            | Н/Д                                                    |
| События остановки   | `Stop`                                                               | ❌ Нет            | Н/Д                                                    |

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

Все хуки получают стандартизированные входные данные в формате JSON через stdin (для command) или в теле POST-запроса (для http).

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

Специфичные для события поля добавляются в зависимости от типа хука. При запуске в подагенте дополнительно включаются `agent_id` и `agent_type`.

### Структура выходных данных хука

Выходные данные хука возвращаются через `stdout` (для command) или в теле HTTP-ответа (для http) в формате JSON.

**Поведение кодов завершения (Command-хуки):**

| Код завершения | Поведение                                                                           |
| :------------- | :---------------------------------------------------------------------------------- |
| `0`            | Успех. Парсит JSON в `stdout` для управления поведением.                            |
| `2`            | **Блокирующая ошибка**. Игнорирует `stdout`, передает `stderr` как обратную связь об ошибке модели. |
| Другой         | Неблокирующая ошибка. `stderr` отображается только в режиме отладки, выполнение продолжается. |

**Структура выходных данных:**

Выходные данные хука поддерживают три категории полей:

1. **Общие поля**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Решение верхнего уровня**: `decision`, `reason` (используются некоторыми событиями)
3. **Специфичное для события управление**: `hookSpecificOutput` (должно включать `hookEventName`)

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

**Назначение**: выполняется перед использованием инструмента для проверки разрешений, валидации входных данных или внедрения контекста.

**Специфичные для события поля**:

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
- `hookSpecificOutput.updatedInput`: измененные входные параметры инструмента для использования вместо исходных
- `hookSpecificOutput.additionalContext`: дополнительная информация о контексте

**Примечание**: хотя стандартные поля вывода хука, такие как `decision` и `reason`, технически поддерживаются базовым классом, официальный интерфейс ожидает `hookSpecificOutput` с `permissionDecision` и `permissionDecisionReason`.

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

**Назначение**: выполняется после успешного завершения работы инструмента для обработки результатов, логирования или внедрения дополнительного контекста.

**Специфичные для события поля**:

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

**Назначение**: выполняется при сбое выполнения инструмента для обработки ошибок, отправки оповещений или регистрации сбоев.

**Специфичные для события поля**:

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
**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: информация об обработке ошибок
- Стандартные поля вывода хука

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Error: File not found. Failure logged in monitoring system."
  }
}
```

#### UserPromptSubmit

**Назначение**: Выполняется, когда пользователь отправляет промпт, чтобы изменить, проверить или обогатить ввод.

**Специфичные для события поля**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение решения
- `hookSpecificOutput.additionalContext`: дополнительный контекст для добавления к промпту (опционально)

**Примечание**: Поскольку `UserPromptSubmitOutput` расширяет `HookOutput`, доступны все стандартные поля, но только `additionalContext` в `hookSpecificOutput` специально определен для этого события.

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

**Специфичные для события поля**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: контекст, который будет доступен в сессии
- Стандартные поля вывода хука

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

**Специфичные для события поля**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Варианты вывода**:

- Стандартные поля вывода хука (обычно не используются для блокировки)

#### Stop

**Назначение**: Выполняется перед тем, как Qwen завершит свой ответ, для предоставления финальной обратной связи или сводок.

**Специфичные для события поля**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant",
  "context_usage": "ratio of context window used (may exceed 1 when tokens exceed window; optional)",
  "context_limit": "context window size in tokens (optional)",
  "input_tokens": "prompt token count (may include output tokens depending on provider; optional)"
}
```

Поля `context_usage`, `context_limit` и `input_tokens` позволяют скриптам хуков отслеживать использование контекста и реализовывать пользовательские стратегии сжатия — например, скрипт может выводить напоминание о запуске `/compact`, когда использование превышает пользовательский порог.

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение решения
- `stopReason`: обратная связь для включения в ответ об остановке
- `continue`: установите в false, чтобы остановить выполнение
- `hookSpecificOutput.additionalContext`: дополнительная информация о контексте

**Примечание**: Поскольку `StopOutput` расширяет `HookOutput`, доступны все стандартные поля, но поле `stopReason` особенно актуально для этого события.

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Назначение**: Выполняется, когда ход завершается из-за ошибки API (вместо Stop). Это событие типа **fire-and-forget** — вывод хука и коды выхода игнорируются.

**Специфичные для события поля**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**: Сопоставляется с полем `error`. Например, `"matcher": "rate_limit"` будет срабатывать только для ошибок rate limit.

**Варианты вывода**:

- **Нет** — StopFailure работает по принципу fire-and-forget. Весь вывод хука и коды выхода игнорируются.

**Обработка кодов выхода**:

| Код выхода | Поведение                 |
| ---------- | ------------------------- |
| Любой      | Игнорируется (fire-and-forget) |

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

- Мониторинг и оповещение о rate limit
- Логирование ошибок аутентификации
- Уведомления об ошибках биллинга
- Сбор статистики ошибок

#### SubagentStart

**Назначение**: Выполняется при запуске подагента (например, инструмента Task) для настройки контекста или разрешений.

**Специфичные для события поля**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: начальный контекст для подагента
- Стандартные поля вывода хука

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

**Специфичные для события поля**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "stop_hook_active": "boolean indicating if stop hook is active",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent",
  "agent_transcript_path": "path to the subagent's transcript",
  "last_assistant_message": "the last message from the subagent"
}
```

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение решения

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Назначение**: Выполняется перед сжатием диалога для подготовки или логирования сжатия.

**Специфичные для события поля**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: контекст для включения перед сжатием
- Стандартные поля вывода хука

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Compacting conversation to maintain optimal context window."
  }
}
```

#### PostCompact

**Назначение**: Выполняется после завершения сжатия диалога для архивации сводок или отслеживания использования.

**Специфичные для события поля**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: Сопоставляется с полем `trigger`. Например, `"matcher": "manual"` будет срабатывать только для ручного сжатия с помощью команды `/compact`.

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: дополнительный контекст (только для логирования)
- Стандартные поля вывода хука (только для логирования)

**Примечание**: PostCompact **не** входит в официальный список поддерживаемых событий режима принятия решений. Поле `decision` и другие поля управления не оказывают никакого управляющего эффекта — они используются только для логирования.

**Обработка кодов выхода**:

| Код выхода | Поведение                                                  |
| ---------- | --------------------------------------------------------- |
| 0          | Успех — stdout показывается пользователю в подробном режиме            |
| Другой     | Неблокирующая ошибка — stderr показывается пользователю в подробном режиме |

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

- Архивация сводок в файлы или базы данных
- Отслеживание статистики использования
- Мониторинг изменений контекста
- Аудит-логирование операций сжатия

#### Notification

**Назначение**: Выполняется при отправке уведомлений для их кастомизации или перехвата.

**Специфичные для события поля**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Примечание**: тип `elicitation_dialog` определен, но в настоящее время не реализован.

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: дополнительная информация для включения
- Стандартные поля вывода хука

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Notification processed by monitoring system."
  }
}
```

#### PermissionRequest

**Назначение**: Выполняется при отображении диалогов запроса разрешений для автоматизации принятия решений или обновления разрешений.

**Специфичные для события поля**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool requesting permission",
  "tool_input": "object containing the tool's input parameters",
  "permission_suggestions": "array of suggested permissions (optional)"
}
```

**Варианты вывода**:

- `hookSpecificOutput.decision`: структурированный объект с деталями решения о разрешении:
  - `behavior`: "allow" или "deny"
  - `updatedInput`: измененный входной параметр инструмента (опционально)
  - `updatedPermissions`: измененные разрешения (опционально)
  - `message`: сообщение для показа пользователю (опционально)
  - `interrupt`: прерывать ли рабочий процесс (опционально)

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

**Назначение**: Выполняется при создании новой задачи todo с помощью инструмента `todo_write`. Позволяет проверять, логировать или блокировать создание задач.

Хуки todo выполняются в две фазы:

- `validation`: выполняется до сохранения. Используйте эту фазу только для валидации; возврат `block` или `deny` предотвращает запись.
- `postWrite`: выполняется после сохранения. Используйте эту фазу для побочных эффектов, таких как логирование или синхронизация; `block` или `deny` игнорируются в этой фазе.

**Специфичные для события поля**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**Варианты вывода**:

- `decision`: "allow", "block" или "deny"
- `reason`: понятное человеку объяснение решения (обязательно при блокировке)

**Поведение при блокировке**:

Во время фазы `validation`, если `decision` равно `block` или `deny` (код выхода 2), создание задачи предотвращается. Список задач остается неизменным, а причина предоставляется модели в качестве обратной связи.

Во время фазы `postWrite` задача уже сохранена. Хуки могут возвращать вывод, но `block` / `deny` не отменяет запись и не должен использоваться для валидации.

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
# Проверяет содержимое задачи перед созданием

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Проверяет минимальную длину
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Todo content must be at least 5 characters"}'
  exit 2
fi

# Блокирует задачи, связанные с тестированием
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

**Назначение**: Выполняется, когда задача todo помечается как выполненная. Позволяет проверять, логировать или блокировать завершение задачи.

Хуки todo выполняются в две фазы:

- `validation`: выполняется до сохранения. Используйте эту фазу только для валидации; возврат `block` или `deny` предотвращает запись.
- `postWrite`: выполняется после сохранения. Используйте эту фазу для побочных эффектов, таких как логирование или синхронизация; `block` или `deny` игнорируются в этой фазе.

**Специфичные для события поля**:

```json
{
  "todo_id": "unique identifier for the todo item",
  "todo_content": "content/description of the todo item",
  "previous_status": "pending | in_progress (status before completion)",
  "all_todos": "array of all todo items in the current list",
  "phase": "validation | postWrite"
}
```

**Варианты вывода**:

- `decision`: "allow", "block" или "deny"
- `reason`: понятное человеку объяснение решения (обязательно при блокировке)

**Поведение при блокировке**:

Во время фазы `validation`, если `decision` равно `block` или `deny` (код выхода 2), завершение задачи предотвращается. Задача остается в предыдущем статусе, а причина предоставляется модели в качестве обратной связи.

Во время фазы `postWrite` задача уже сохранена. Хуки могут возвращать вывод, но `block` / `deny` не отменяет запись и не должен использоваться для валидации.

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
# Проверяет условия завершения задачи

INPUT=$(cat)
TODO_ID=$(echo "$INPUT" | jq -r '.todo_id')
ALL_TODOS=$(echo "$INPUT" | jq -r '.all_todos')

# Проверяет, есть ли незавершенные зависимые задачи (пример логики)
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

- **Логирование**: Отслеживание создания и завершения задач для аудита или аналитики
- **Валидация**: Обеспечение стандартов качества контента (минимальная длина, обязательные ключевые слова)
- **Управление рабочим процессом**: Блокировка завершения до выполнения предварительных условий
- **Интеграция**: Синхронизация задач с внешними системами управления задачами (Jira, Trello и т. д.)

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

- По умолчанию хуки выполняются параллельно для лучшей производительности
- Используйте `sequential: true` в определении хука для принудительного выполнения в зависимости от порядка
- Последовательные хуки могут изменять входные данные для последующих хуков в цепочке

### Асинхронные хуки

Только тип `command` поддерживает асинхронное выполнение. Установка `"async": true` запускает хук в фоновом режиме без блокировки основного потока.

**Особенности:**

- Не могут возвращать управление решением (операция уже произошла)
- Результаты внедряются в следующий ход диалога через `systemMessage` или `additionalContext`
- Подходят для аудита, логирования, фонового тестирования и т. д.

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

- Хуки выполняются в окружении пользователя с правами пользователя
- Хуки на уровне проекта требуют статуса доверенной папки
- Таймауты предотвращают зависание хуков (по умолчанию: 60 секунд)

## Лучшие практики

### Пример 1: Хук проверки безопасности

Хук PreToolUse, который логирует и потенциально блокирует опасные команды:

**security_check.sh**

```bash
#!/bin/bash

# Читает ввод из stdin
INPUT=$(cat)

# Разбирает ввод для извлечения информации об инструменте
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TOOL_INPUT=$(echo "$INPUT" | jq -r '.tool_input')

# Проверяет наличие потенциально опасных операций
if echo "$TOOL_INPUT" | grep -qiE "(rm.*-rf|mv.*\/|chmod.*777)"; then
  echo '{
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Security policy blocks dangerous command"
    }
  }'
  exit 2  # Блокирующая ошибка
fi

# Логирует операцию
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Разрешает с дополнительным контекстом
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

### Пример 2: HTTP-хук для аудита

HTTP-хук PostToolUse, который отправляет все записи о выполнении инструментов в удаленный сервис аудита:

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

### Пример 3: Хук валидации пользовательского промпта

Хук UserPromptSubmit, который проверяет пользовательские промпты на наличие конфиденциальной информации и предоставляет контекст для длинных промптов:
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

- Проверьте логи приложения, чтобы получить подробную информацию о выполнении хуков
- Убедитесь, что у скрипта хука есть необходимые права доступа и он исполняемый
- Убедитесь, что выходные данные хука имеют корректный формат JSON
- Используйте специфичные паттерны матчера, чтобы избежать непреднамеренного срабатывания хука
- Используйте режим `--debug` для просмотра подробной информации о сопоставлении и выполнении хуков
- Временно отключите все хуки: добавьте `"disableAllHooks": true` в настройки