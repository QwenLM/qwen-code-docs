# Qwen Code Hooks

## Обзор

Хуки Qwen Code предоставляют мощный механизм для расширения и кастомизации поведения приложения Qwen Code. Хуки позволяют пользователям запускать собственные скрипты или программы в определённые моменты жизненного цикла приложения: перед выполнением инструмента, после него, при старте/завершении сессии и во время других ключевых событий.

Хуки включены по умолчанию. Вы можете временно отключить все хуки, установив `disableAllHooks` в `true` в файле настроек (на верхнем уровне, рядом с `hooks`):

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

Хуки — это пользовательские скрипты или программы, которые автоматически запускаются Qwen Code в заранее определённых точках потока выполнения приложения. Они позволяют пользователям:

- Мониторить и аудировать использование инструментов
- Обеспечивать соблюдение политик безопасности
- Внедрять дополнительный контекст в диалоги
- Кастомизировать поведение приложения на основе событий
- Интегрироваться с внешними системами и сервисами
- Программно изменять входные данные или ответы инструментов

## Типы хуков

Qwen Code поддерживает три типа исполнителей хуков:

| Тип | Описание |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Выполняет shell-команду. Получает JSON через `stdin`, возвращает результат через `stdout`.              |
| `http`     | Отправляет JSON в теле `POST`-запроса на указанный URL. Возвращает результат в теле HTTP-ответа. |
| `function` | Прямой вызов зарегистрированной JavaScript-функции (только для хуков уровня сессии).                     |

### Хуки типа command

Хуки типа command выполняют команды через дочерние процессы. Входной JSON передаётся через stdin, а результат возвращается через stdout.

**Конфигурация:**

| Поле           | Тип                     | Обязательно | Описание                                 |
| :-------------- | :----------------------- | :------- | :------------------------------------------ |
| `type`          | `"command"`              | Да      | Тип хука                                   |
| `command`       | `string`                 | Да      | Команда для выполнения                          |
| `name`          | `string`                 | Нет       | Имя хука (для логирования)                     |
| `description`   | `string`                 | Нет       | Описание хука                            |
| `timeout`       | `number`                 | Нет       | Таймаут в миллисекундах, по умолчанию 60000      |
| `async`         | `boolean`                | Нет       | Запускать асинхронно в фоне |
| `env`           | `Record<string, string>` | Нет       | Переменные окружения                       |
| `shell`         | `"bash" \| "powershell"` | Нет       | Используемая оболочка                                |
| `statusMessage` | `string`                 | Нет       | Статусное сообщение, отображаемое во время выполнения   |

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

| Поле            | Тип                     | Обязательно | Описание                                               |
| :--------------- | :----------------------- | :------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Да      | Тип хука                                                 |
| `url`            | `string`                 | Да      | Целевой URL                                                |
| `headers`        | `Record<string, string>` | Нет       | Заголовки запроса (поддерживают интерполяцию переменных окружения)          |
| `allowedEnvVars` | `string[]`               | Нет       | Белый список переменных окружения, разрешённых в URL/заголовках |
| `timeout`        | `number`                 | Нет       | Таймаут в секундах, по умолчанию 600                           |
| `name`           | `string`                 | Нет       | Имя хука (для логирования)                                   |
| `statusMessage`  | `string`                 | Нет       | Статусное сообщение, отображаемое во время выполнения                 |
| `once`           | `boolean`                | Нет       | Выполнять только один раз для каждого события в сессии (только для HTTP-хуков) |

**Функции безопасности:**

- **Белый список URL**: Настройка разрешённых паттернов URL через `allowedUrls`
- **Защита от SSRF**: Блокирует приватные IP-адреса (10.x.x.x, 172.16-31.x.x, 192.168.x.x и т.д.), но разрешает loopback-адреса (127.0.0.1, ::1)
- **Валидация DNS**: Проверяет разрешение домена перед запросами для предотвращения атак DNS rebinding
- **Интерполяция переменных окружения**: Синтаксис `${VAR}`, разрешает только переменные из белого списка `allowedEnvVars`

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

### Хуки типа function

Хуки типа function напрямую вызывают зарегистрированные JavaScript/TypeScript-функции. Они используются внутри системы Skill и в настоящее время не доступны как публичный API для конечных пользователей.

**Примечание**: В большинстве случаев используйте **хуки типа command** или **HTTP-хуки**, которые можно настроить в файлах конфигурации.

## События хуков

Хуки срабатывают в определённые моменты сессии Qwen Code. Разные события поддерживают разные матчеры для фильтрации условий запуска.

| Событие                | Когда срабатывает                            | Цель матчера                                            |
| :------------------- | :---------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`         | Перед выполнением инструмента                     | Имя инструмента (`WriteFile`, `ReadFile`, `Bash` и т.д.)         |
| `PostToolUse`        | После успешного выполнения инструмента           | Имя инструмента                                                 |
| `PostToolUseFailure` | После ошибки выполнения инструмента                | Имя инструмента                                                 |
| `UserPromptSubmit`   | После отправки промпта пользователем                 | Нет (срабатывает всегда)                                       |
| `SessionStart`       | При старте или возобновлении сессии            | Источник (`startup`, `resume`, `clear`, `compact`)          |
| `SessionEnd`         | При завершении сессии                         | Причина (`clear`, `logout`, `prompt_input_exit` и т.д.)     |
| `Stop`               | Когда Claude готовится завершить ответ | Нет (срабатывает всегда)                                       |
| `SubagentStart`      | При запуске субагента                      | Тип агента (`Bash`, `Explorer`, `Plan` и т.д.)             |
| `SubagentStop`       | При остановке субагента                       | Тип агента                                                |
| `PreCompact`         | Перед сжатием диалога            | Триггер (`manual`, `auto`)                                |
| `Notification`       | При отправке уведомлений               | Тип (`permission_prompt`, `idle_prompt`, `auth_success`) |
| `PermissionRequest`  | При отображении диалога запроса разрешения           | Имя инструмента                                                 |

### Паттерны матчеров

`matcher` — это регулярное выражение, используемое для фильтрации условий запуска.

| Тип события          | События                                                                 | Поддержка матчера | Цель матчера                                           |
| :------------------ | :--------------------------------------------------------------------- | :-------------- | :------------------------------------------------------- |
| События инструментов         | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex        | Имя инструмента: `WriteFile`, `ReadFile`, `Bash` и т.д.         |
| События субагентов     | `SubagentStart`, `SubagentStop`                                        | ✅ Regex        | Тип агента: `Bash`, `Explorer` и т.д.                     |
| События сессии      | `SessionStart`                                                         | ✅ Regex        | Источник: `startup`, `resume`, `clear`, `compact`          |
| События сессии      | `SessionEnd`                                                           | ✅ Regex        | Причина: `clear`, `logout`, `prompt_input_exit` и т.д.     |
| События уведомлений | `Notification`                                                         | ✅ Точное совпадение  | Тип: `permission_prompt`, `idle_prompt`, `auth_success` |
| События сжатия      | `PreCompact`                                                           | ✅ Точное совпадение  | Триггер: `manual`, `auto`                                |
| События промптов       | `UserPromptSubmit`                                                     | ❌ Нет           | Н/Д                                                      |
| События остановки         | `Stop`                                                                 | ❌ Нет           | Н/Д                                                      |

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

Все хуки получают стандартизированные входные данные в формате JSON через stdin (command) или тело POST-запроса (http).

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

Поля, специфичные для события, добавляются в зависимости от типа хука. При запуске в субагенте дополнительно включаются `agent_id` и `agent_type`.

### Структура выходных данных хука

Результат работы хука возвращается через `stdout` (command) или тело HTTP-ответа (http) в формате JSON.

**Поведение кодов выхода (хуки command):**

| Код выхода | Поведение                                                                              |
| :-------- | :------------------------------------------------------------------------------------ |
| `0`       | Успех. Парсит JSON из `stdout` для управления поведением.                                  |
| `2`       | **Блокирующая ошибка**. Игнорирует `stdout`, передаёт `stderr` как фидбек об ошибке модели. |
| Другой     | Неблокирующая ошибка. `stderr` отображается только в режиме отладки, выполнение продолжается.           |

**Структура вывода:**

Вывод хука поддерживает три категории полей:

1. **Общие поля**: `continue`, `stopReason`, `suppressOutput`, `systemMessage`
2. **Решение верхнего уровня**: `decision`, `reason` (используются некоторыми событиями)
3. **Управление, специфичное для события**: `hookSpecificOutput` (должно включать `hookEventName`)

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

**Назначение**: Выполняется перед использованием инструмента для проверки разрешений, валидации входных данных или внедрения контекста.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool being executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Варианты вывода**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" или "ask" (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.permissionDecisionReason`: объяснение решения (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.updatedInput`: изменённые входные параметры инструмента для использования вместо оригинальных
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

**Назначение**: Выполняется после успешного завершения работы инструмента для обработки результатов, логирования или внедрения дополнительного контекста.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "name of the tool that was executed",
  "tool_input": "object containing the tool's input parameters",
  "tool_response": "object containing the tool's response",
  "tool_use_id": "unique identifier for this tool use instance"
}
```

**Варианты вывода**:

- `decision`: "allow", "deny", "block" (по умолчанию "allow", если не указано)
- `reason`: причина принятия решения
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

**Назначение**: Выполняется при ошибке выполнения инструмента для обработки ошибок, отправки оповещений или фиксации сбоев.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "unique identifier for the tool use",
  "tool_name": "name of the tool that failed",
  "tool_input": "object containing the tool's input parameters",
  "error": "error message describing the failure",
  "is_interrupt": "boolean indicating if failure was due to user interruption (optional)"
}
```

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: информация об обработке ошибки
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

**Назначение**: Выполняется при отправке промпта пользователем для модификации, валидации или обогащения входных данных.

**Поля, специфичные для события**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение решения
- `hookSpecificOutput.additionalContext`: дополнительный контекст для добавления к промпту (опционально)

**Примечание**: Поскольку `UserPromptSubmitOutput` наследует `HookOutput`, доступны все стандартные поля, но только `additionalContext` в `hookSpecificOutput` специально определён для этого события.

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

**Назначение**: Выполняется при старте новой сессии для выполнения задач инициализации.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "source": "startup | resume | clear | compact",
  "model": "the model being used",
  "agent_type": "the type of agent if applicable (optional)"
}
```

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: контекст, доступный в сессии
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

**Поля, специфичные для события**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Варианты вывода**:

- Стандартные поля вывода хука (обычно не используются для блокировки)

#### Stop

**Назначение**: Выполняется перед завершением ответа Qwen для предоставления финального фидбека или сводок.

**Поля, специфичные для события**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение решения
- `stopReason`: фидбек для включения в ответ при остановке
- `continue`: установите в false для остановки выполнения
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация

**Примечание**: Поскольку `StopOutput` наследует `HookOutput`, доступны все стандартные поля, но поле `stopReason` особенно важно для этого события.

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Назначение**: Выполняется, когда ход завершается из-за ошибки API (вместо `Stop`). Это событие типа **fire-and-forget** — вывод хука и коды выхода игнорируются.

**Поля, специфичные для события**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Матчер**: Сопоставляется с полем `error`. Например, `"matcher": "rate_limit"` сработает только при ошибках ограничения частоты запросов.

**Варианты вывода**:

- **Нет** — `StopFailure` работает по принципу fire-and-forget. Весь вывод хука и коды выхода игнорируются.

**Обработка кодов выхода**:

| Код выхода | Поведение                  |
| --------- | ------------------------- |
| Любой       | Игнорируется (fire-and-forget) |

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

- Мониторинг и оповещение об ограничении частоты запросов
- Логирование ошибок аутентификации
- Уведомления об ошибках биллинга
- Сбор статистики ошибок

#### SubagentStart

**Назначение**: Выполняется при запуске субагента (например, инструмента Task) для настройки контекста или разрешений.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: начальный контекст для субагента
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

**Назначение**: Выполняется при завершении работы субагента для выполнения задач финализации.

**Поля, специфичные для события**:

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

**Назначение**: Выполняется перед сжатием диалога для подготовки или логирования процесса.

**Поля, специфичные для события**:

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

**Назначение**: Выполняется после завершения сжатия диалога для архивирования сводок или отслеживания использования.

**Поля, специфичные для события**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Матчер**: Сопоставляется с полем `trigger`. Например, `"matcher": "manual"` сработает только при ручном сжатии через команду `/compact`.

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: дополнительный контекст (только для логирования)
- Стандартные поля вывода хука (только для логирования)

**Примечание**: `PostCompact` **не входит** в официальный список событий, поддерживающих режим принятия решений. Поле `decision` и другие поля управления не оказывают влияния на выполнение — они используются только для логирования.

**Обработка кодов выхода**:

| Код выхода | Поведение                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Успех — stdout отображается пользователю в режиме verbose            |
| Другой     | Неблокирующая ошибка — stderr отображается пользователю в режиме verbose |

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
- Аудит операций сжатия

#### Notification

**Назначение**: Выполняется при отправке уведомлений для их кастомизации или перехвата.

**Поля, специфичные для события**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Примечание**: Тип `elicitation_dialog` определён, но в настоящее время не реализован.

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

**Назначение**: Выполняется при отображении диалогов запроса разрешений для автоматизации решений или обновления прав.

**Поля, специфичные для события**:

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
  - `updatedInput`: изменённые входные данные инструмента (опционально)
  - `updatedPermissions`: изменённые разрешения (опционально)
  - `message`: сообщение для отображения пользователю (опционально)
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

## Конфигурация хуков

Хуки настраиваются в параметрах Qwen Code, обычно в `.qwen/settings.json` или пользовательских файлах конфигурации:

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
- Используйте `sequential: true` в определении хука для принудительного выполнения в заданном порядке
- Последовательные хуки могут изменять входные данные для последующих хуков в цепочке

### Асинхронные хуки

Асинхронное выполнение поддерживает только тип `command`. Установка `"async": true` запускает хук в фоне без блокировки основного потока.

**Особенности:**

- Не может возвращать управление решением (операция уже произошла)
- Результаты внедряются в следующий ход диалога через `systemMessage` или `additionalContext`
- Подходит для аудита, логирования, фоновых тестов и т.д.

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

- Хуки выполняются в окружении пользователя с его правами
- Хуки уровня проекта требуют статуса доверенной папки
- Таймауты предотвращают зависание хуков (по умолчанию: 60 секунд)

## Лучшие практики

### Пример 1: Хук валидации безопасности

Хук `PreToolUse`, который логирует и потенциально блокирует опасные команды:

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

HTTP-хук `PostToolUse`, который отправляет все записи выполнения инструментов в удалённый сервис аудита:

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

Хук `UserPromptSubmit`, который проверяет промпты пользователя на наличие конфиденциальной информации и предоставляет контекст для длинных промптов:

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

- Проверьте логи приложения для получения деталей выполнения хуков
- Убедитесь в наличии прав на выполнение и исполняемости скриптов хуков
- Убедитесь в корректном форматировании JSON в выводе хуков
- Используйте конкретные паттерны матчеров, чтобы избежать непреднамеренного запуска хуков
- Используйте режим `--debug` для просмотра детальной информации о сопоставлении и выполнении хуков
- Временно отключите все хуки: добавьте `"disableAllHooks": true` в настройки