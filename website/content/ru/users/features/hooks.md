# Документация по хукам Qwen Code

## Обзор

Хуки Qwen Code предоставляют мощный механизм для расширения и кастомизации поведения приложения Qwen Code. Хуки позволяют пользователям запускать собственные скрипты или программы в определённые моменты жизненного цикла приложения, например, до или после выполнения инструмента, при начале/завершении сессии и во время других ключевых событий.

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

Хуки — это пользовательские скрипты или программы, которые автоматически запускаются Qwen Code в заранее определённые моменты рабочего процесса. Они позволяют пользователям:

- Отслеживать и аудировать использование инструментов
- Применять политики безопасности
- Добавлять дополнительный контекст в диалоги
- Кастомизировать поведение приложения на основе событий
- Интегрироваться с внешними системами и сервисами
- Программно изменять входные данные или ответы инструментов

## Архитектура хуков

Система хуков Qwen Code состоит из нескольких ключевых компонентов:

1. **Hook Registry**: хранит и управляет всеми настроенными хуками
2. **Hook Planner**: определяет, какие хуки должны запуститься для каждого события
3. **Hook Runner**: выполняет отдельные хуки с соответствующим контекстом
4. **Hook Aggregator**: объединяет результаты от нескольких хуков
5. **Hook Event Handler**: координирует срабатывание хуков для событий

## События хуков

Хуки срабатывают в определённые моменты сессии Qwen Code. Когда происходит событие и срабатывает matcher, Qwen Code передаёт JSON-контекст события вашему обработчику хука. Для command-хуков входные данные поступают через stdin. Ваш обработчик может проанализировать входные данные, выполнить действия и при необходимости вернуть решение. Некоторые события срабатывают один раз за сессию, другие — многократно внутри агентного цикла.

<div align="center">
<img src="https://img.alicdn.com/imgextra/i4/O1CN01sYWUTh1RDJl7Lz2ne_!!6000000002077-2-tps-812-1212.png" alt="Hook Lifecycle Diagram" width="400"/>
</div>

В следующей таблице перечислены все доступные события хуков в Qwen Code:

| Event Name           | Описание                                      | Сценарий использования                              |
| -------------------- | --------------------------------------------- | --------------------------------------------------- |
| `PreToolUse`         | Срабатывает до выполнения инструмента         | Проверка прав, валидация входных данных, логирование |
| `PostToolUse`        | Срабатывает после успешного выполнения инструмента | Логирование, обработка вывода, мониторинг           |
| `PostToolUseFailure` | Срабатывает при сбое выполнения инструмента   | Обработка ошибок, оповещения, восстановление        |
| `Notification`       | Срабатывает при отправке уведомлений          | Кастомизация уведомлений, логирование               |
| `UserPromptSubmit`   | Срабатывает при отправке промпта пользователем | Обработка входных данных, валидация, инъекция контекста |
| `SessionStart`       | Срабатывает при запуске новой сессии          | Инициализация, настройка контекста                  |
| `Stop`               | Срабатывает до завершения ответа Qwen         | Завершение, очистка                                 |
| `SubagentStart`      | Срабатывает при запуске субагента             | Инициализация субагента                             |
| `SubagentStop`       | Срабатывает при остановке субагента           | Завершение работы субагента                         |
| `PreCompact`         | Срабатывает до сжатия диалога                 | Обработка перед сжатием                             |
| `SessionEnd`         | Срабатывает при завершении сессии             | Очистка, отчётность                                 |
| `PermissionRequest`  | Срабатывает при отображении диалогов запроса прав | Автоматизация прав, применение политик              |

## Правила ввода/вывода

### Структура входных данных хука

Все хуки получают стандартизированные входные данные в формате JSON через stdin. Общие поля, присутствующие в каждом событии хука:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "hook_event_name": "string",
  "timestamp": "string"
}
```

Специфичные для события поля добавляются в зависимости от типа хука. Ниже приведены эти поля для каждого события:

### Детали отдельных событий хуков

#### PreToolUse

**Назначение**: выполняется до использования инструмента для проверки прав, валидации входных данных или инъекции контекста.

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
- `hookSpecificOutput.permissionDecisionReason`: пояснение к решению (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.updatedInput`: изменённые входные параметры инструмента для использования вместо оригинальных
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация

**Примечание**: хотя стандартные поля вывода хука, такие как `decision` и `reason`, технически поддерживаются базовым классом, официальный интерфейс ожидает `hookSpecificOutput` с `permissionDecision` и `permissionDecisionReason`.

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

#### PostToolUse

**Назначение**: выполняется после успешного завершения работы инструмента для обработки результатов, логирования или инъекции дополнительного контекста.

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

**Назначение**: выполняется при сбое выполнения инструмента для обработки ошибок, отправки оповещений или регистрации сбоев.

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

**Назначение**: выполняется при отправке промпта пользователем для изменения, валидации или обогащения входных данных.

**Поля, специфичные для события**:

```json
{
  "prompt": "the user's submitted prompt text"
}
```

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: пояснение к решению в читаемом формате
- `hookSpecificOutput.additionalContext`: дополнительный контекст для добавления к промпту (опционально)

**Примечание**: поскольку `UserPromptSubmitOutput` расширяет `HookOutput`, доступны все стандартные поля, но для этого события специально определено только `additionalContext` внутри `hookSpecificOutput`.

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

**Назначение**: выполняется при запуске новой сессии для выполнения задач инициализации.

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

**Назначение**: выполняется при завершении сессии для выполнения задач очистки.

**Поля, специфичные для события**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Варианты вывода**:

- Стандартные поля вывода хука (обычно не используются для блокировки)

#### Stop

**Назначение**: выполняется до завершения ответа Qwen для предоставления финальной обратной связи или сводок.

**Поля, специфичные для события**:

```json
{
  "stop_hook_active": "boolean indicating if stop hook is active",
  "last_assistant_message": "the last message from the assistant"
}
```

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: пояснение к решению в читаемом формате
- `stopReason`: обратная связь для включения в ответ остановки
- `continue`: установите `false` для остановки выполнения
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация

**Примечание**: поскольку `StopOutput` расширяет `HookOutput`, доступны все стандартные поля, но поле `stopReason` особенно актуально для этого события.

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### SubagentStart

**Назначение**: выполняется при запуске субагента (например, инструмента Task) для настройки контекста или прав.

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

**Назначение**: выполняется при завершении работы субагента для выполнения задач финализации.

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
- `reason`: пояснение к решению в читаемом формате

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Назначение**: выполняется до сжатия диалога для подготовки или логирования процесса сжатия.

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

#### Notification

**Назначение**: выполняется при отправке уведомлений для их кастомизации или перехвата.

**Поля, специфичные для события**:

```json
{
  "message": "notification message content",
  "title": "notification title (optional)",
  "notification_type": "permission_prompt | idle_prompt | auth_success"
}
```

> **Примечание**: тип `elicitation_dialog` определён, но в настоящее время не реализован.

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

**Назначение**: выполняется при отображении диалогов запроса прав для автоматизации решений или обновления прав.

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

- `hookSpecificOutput.decision`: структурированный объект с деталями решения по правам:
  - `behavior`: "allow" или "deny"
  - `updatedInput`: изменённые входные данные инструмента (опционально)
  - `updatedPermissions`: изменённые права (опционально)
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

Хуки настраиваются в параметрах Qwen Code, обычно в `.qwen/settings.json` или пользовательских конфигурационных файлах:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$", // Regex to match tool names
        "sequential": false, // Whether to run hooks sequentially
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
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

### Паттерны матчеров

Матчеры позволяют фильтровать хуки на основе контекста. Не все события хуков поддерживают матчеры:

| Тип события         | События                                                              | Поддержка матчеров | Цель матчера (значения)                                                              |
| ------------------- | -------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| События инструментов | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Да (regex)      | Название инструмента: `bash`, `read_file`, `write_file`, `edit`, `glob`, `grep_search` и т.д. |
| События субагентов  | `SubagentStart`, `SubagentStop`                                      | ✅ Да (regex)      | Тип агента: `Bash`, `Explorer` и т.д.                                                |
| События сессий      | `SessionStart`                                                       | ✅ Да (regex)      | Источник: `startup`, `resume`, `clear`, `compact`                                    |
| События сессий      | `SessionEnd`                                                         | ✅ Да (regex)      | Причина: `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| События уведомлений | `Notification`                                                       | ✅ Да (точное)     | Тип: `permission_prompt`, `idle_prompt`, `auth_success`                              |
| События сжатия      | `PreCompact`                                                         | ✅ Да (точное)     | Триггер: `manual`, `auto`                                                            |
| События промптов    | `UserPromptSubmit`                                                   | ❌ Нет             | Н/Д                                                                                  |
| События остановки   | `Stop`                                                               | ❌ Нет             | Н/Д                                                                                  |

**Синтаксис матчеров**:

- Regex-паттерн, сопоставляемый с целевым полем
- Пустая строка `""` или `"*"` соответствует всем событиям данного типа
- Поддерживается стандартный синтаксис regex (например, `^bash$`, `read.*`, `(bash|run_shell_command)`)

**Примеры**:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^bash$",           // Only match bash tool
        "hooks": [...]
      },
      {
        "matcher": "read.*",           // Match read_file, read_multiple_files, etc.
        "hooks": [...]
      },
      {
        "matcher": "",                 // Match all tools (same as "*" or omitting matcher)
        "hooks": [...]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "^(Bash|Explorer)$", // Only match Bash and Explorer agents
        "hooks": [...]
      }
    ],
    "SessionStart": [
      {
        "matcher": "^(startup|resume)$", // Only match startup and resume sources
        "hooks": [...]
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

### Модель безопасности

- Хуки запускаются в среде пользователя с его привилегиями
- Хуки на уровне проекта требуют статуса доверенной папки
- Таймауты предотвращают зависание хуков (по умолчанию: 60 секунд)

### Коды выхода

Скрипты хуков передают результат через коды выхода:

| Код выхода | Значение             | Поведение                                           |
| ---------- | -------------------- | --------------------------------------------------- |
| `0`        | Успех                | stdout/stderr не отображаются                       |
| `2`        | Блокирующая ошибка   | Показать stderr модели и заблокировать вызов инструмента |
| Другой     | Неблокирующая ошибка | Показать stderr только пользователю, но продолжить вызов инструмента |

**Примеры**:

```bash
#!/bin/bash

# Success (exit 0 is default, can be omitted)
echo '{"decision": "allow"}'
exit 0

# Blocking error - prevents operation
echo "Dangerous operation blocked by security policy" >&2
exit 2
```

> **Примечание**: если код выхода не указан, скрипт по умолчанию возвращает `0` (успех).

## Рекомендации

### Пример 1: хук валидации безопасности

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
    "decision": "deny",
    "reason": "Potentially dangerous operation detected",
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Dangerous command blocked by security policy"
    }
  }'
  exit 2  # Blocking error
fi

# Allow the operation with a log
echo "INFO: Tool $TOOL_NAME executed safely at $(date)" >> /var/log/qwen-security.log

# Allow with additional context
echo '{
  "decision": "allow",
  "reason": "Operation approved by security checker",
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

### Пример 2: хук валидации пользовательских промптов

Хук UserPromptSubmit, который проверяет промпты пользователя на наличие конфиденциальной информации и добавляет контекст для длинных промптов:

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
- Убедитесь в наличии прав на выполнение скриптов хуков
- Убедитесь в корректном форматировании JSON в выводах хуков
- Используйте конкретные паттерны матчеров, чтобы избежать непреднамеренного срабатывания хуков