# Qwen Code Hooks

## Обзор

Qwen Code hooks предоставляют мощный механизм для расширения и настройки поведения приложения Qwen Code. Хуки позволяют пользователям выполнять пользовательские скрипты или программы в определённых точках жизненного цикла приложения, например, перед выполнением инструмента, после выполнения инструмента, при начале/завершении сессии, а также во время других ключевых событий.

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

Хуки — это пользовательские скрипты или программы, которые автоматически выполняются Qwen Code в заданных точках потока приложения. Они позволяют:

- Отслеживать и аудировать использование инструментов
- Применять политики безопасности
- Внедрять дополнительный контекст в диалоги
- Настраивать поведение приложения в зависимости от событий
- Интегрироваться с внешними системами и сервисами
- Программно изменять входные данные инструментов или ответы

## Типы хуков

Qwen Code поддерживает четыре типа исполнителей хуков:

| Тип        | Описание                                                                                      |
| :--------- | :-------------------------------------------------------------------------------------------- |
| `command`  | Выполнение команды оболочки. Получает JSON через `stdin`, возвращает результат через `stdout`. |
| `http`     | Отправка JSON в теле POST-запроса на указанный URL. Результат возвращается через тело ответа HTTP. |
| `function` | Прямой вызов зарегистрированной JavaScript-функции (только для хуков уровня сессии).          |
| `prompt`   | Использование LLM для оценки входных данных хука и принятия решения.                          |

### Командные хуки

Командные хуки выполняют команды через дочерние процессы. Входной JSON передаётся через stdin, а вывод возвращается через stdout.

**Конфигурация:**

| Поле             | Тип                       | Обязательно | Описание                                        |
| :--------------- | :------------------------ | :---------- | :---------------------------------------------- |
| `type`           | `"command"`               | Да          | Тип хука                                        |
| `command`        | `string`                  | Да          | Команда для выполнения                          |
| `name`           | `string`                  | Нет         | Имя хука (для логирования)                      |
| `description`    | `string`                  | Нет         | Описание хука                                   |
| `timeout`        | `number`                  | Нет         | Тайм-аут в миллисекундах, по умолчанию 60000    |
| `async`          | `boolean`                 | Нет         | Запускать ли асинхронно в фоне                  |
| `env`            | `Record<string, string>`  | Нет         | Переменные окружения                            |
| `shell`          | `"bash" \| "powershell"`  | Нет         | Используемая оболочка                           |
| `statusMessage`  | `string`                  | Нет         | Сообщение о статусе, отображаемое во время выполнения |

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

| Поле              | Тип                       | Обязательно | Описание                                                       |
| :---------------- | :------------------------ | :---------- | :------------------------------------------------------------- |
| `type`            | `"http"`                  | Да          | Тип хука                                                       |
| `url`             | `string`                  | Да          | Целевой URL                                                    |
| `headers`         | `Record<string, string>`  | Нет         | Заголовки запроса (поддерживает интерполяцию переменных окружения) |
| `allowedEnvVars`  | `string[]`                | Нет         | Белый список переменных окружения, разрешённых в URL/заголовках |
| `timeout`         | `number`                  | Нет         | Тайм-аут в секундах, по умолчанию 600                          |
| `name`            | `string`                  | Нет         | Имя хука (для логирования)                                     |
| `statusMessage`   | `string`                  | Нет         | Сообщение о статусе, отображаемое во время выполнения          |
| `once`            | `boolean`                 | Нет         | Выполнить только один раз за событие за сессию (только для HTTP-хуков) |

**Функции безопасности:**

- **Белый список URL**: Настройка разрешённых шаблонов URL через `allowedUrls`
- **Защита от SSRF**: Блокировка частных IP-адресов (10.x.x.x, 172.16-31.x.x, 192.168.x.x и т.д.), но разрешение адресов обратной петли (127.0.0.1, ::1)
- **Проверка DNS**: Валидация разрешения доменных имён перед запросами для предотвращения атак с перепривязкой DNS
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

### Function Hooks

Хуки типа «функция» напрямую вызывают зарегистрированные JavaScript/TypeScript-функции. Они используются внутри системы навыков (Skill system) и в настоящее время не представлены как публичный API для конечных пользователей.

**Примечание**: В большинстве случаев используйте **хуки команд (command hooks)** или **хуки HTTP**, которые можно настроить в файлах конфигурации.

### Prompt Hooks

Хуки типа «prompt» используют LLM для оценки входных данных хука и возврата решения. Это полезно для принятия интеллектуальных решений на основе контекста, например, разрешить или заблокировать операцию.

**Как это работает:**

1. Входной JSON хука вставляется в ваш промпт с помощью заполнителя `$ARGUMENTS`
2. Промпт отправляется в LLM (по умолчанию — ваша текущая модель)
3. LLM возвращает JSON-ответ с решением
4. Qwen Code обрабатывает решение и продолжает или блокирует выполнение

**Конфигурация:**

| Поле             | Тип         | Обязательно | Описание                                                    |
| :--------------- | :---------- | :---------- | :---------------------------------------------------------- |
| `type`           | `"prompt"`  | Да          | Тип хука                                                     |
| `prompt`         | `string`    | Да          | Промпт, отправляемый в LLM. Используйте `$ARGUMENTS` для ввода хука |
| `model`          | `string`    | Нет         | Модель для использования (по умолчанию — ваша текущая модель) |
| `timeout`        | `number`    | Нет         | Тайм-аут в секундах, по умолчанию 30                         |
| `name`           | `string`    | Нет         | Имя хука (для логирования)                                   |
| `description`    | `string`    | Нет         | Описание хука                                                |
| `statusMessage`  | `string`    | Нет         | Сообщение о статусе, отображаемое во время выполнения         |

**Формат ответа:**

LLM должна вернуть JSON со следующей структурой:

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Поле               | Описание                                                                   |
| :----------------- | :------------------------------------------------------------------------- |
| `ok`               | `true` — разрешить/продолжить, `false` — заблокировать/остановить          |
| `reason`           | Обязательно, если `ok` равно `false`. Показывается модели для объяснения блокировки |
| `additionalContext`| Необязательно. Дополнительный контекст, который нужно внедрить в диалог при разрешении |

**Поддерживаемые события:**

Хуки типа «prompt» можно использовать с большинством событий хуков, включая:

- `PreToolUse` — оценить, разрешить ли вызов инструмента
- `PostToolUse` — оценить результаты инструмента и, возможно, внедрить контекст
- `Stop` — определить, нужно ли продолжать или остановиться
- `SubagentStop` — оценить результаты сабагента
- `UserPromptSubmit` — оценить или обогатить пользовательские промпты

**Пример: Stop Hook**

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

Когда `ok` равно `false`, Qwen Code продолжит работу и использует `reason` как контекст для следующего ответа.

**Пример: PreToolUse Hook**

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

Хуки срабатывают в определённые моменты сессии Qwen Code. Разные события поддерживают разные сопоставители (matcher) для фильтрации условий срабатывания.

| Событие               | Момент срабатывания                            | Цель сопоставителя (matcher target)                       |
| :--------------------- | :--------------------------------------------- | :-------------------------------------------------------- |
| `PreToolUse`           | Перед выполнением инструмента                   | Имя инструмента (`WriteFile`, `ReadFile`, `Bash` и т.д.)  |
| `PostToolUse`          | После успешного выполнения инструмента          | Имя инструмента                                           |
| `PostToolUseFailure`   | После неудачного выполнения инструмента         | Имя инструмента                                           |
| `UserPromptSubmit`     | После отправки промпта пользователем            | Нет (срабатывает всегда)                                  |
| `SessionStart`         | При запуске или возобновлении сессии            | Источник (`startup`, `resume`, `clear`, `compact`)        |
| `SessionEnd`           | При завершении сессии                           | Причина (`clear`, `logout`, `prompt_input_exit` и т.д.)   |
| `Stop`                 | Когда Claude готовится завершить ответ          | Нет (срабатывает всегда)                                  |
| `SubagentStart`        | При запуске сабагента                           | Тип агента (`Bash`, `Explorer`, `Plan` и т.д.)            |
| `SubagentStop`         | При остановке сабагента                         | Тип агента                                                |
| `PreCompact`           | Перед сжатием (compaction) истории диалога      | Триггер (`manual`, `auto`)                                |
| `Notification`         | При отправке уведомлений                        | Тип (`permission_prompt`, `idle_prompt`, `auth_success`)  |
| `PermissionRequest`    | При показе диалога разрешений                   | Имя инструмента                                           |
| `TodoCreated`          | При создании нового пункта задач                | Нет (срабатывает всегда)                                  |
| `TodoCompleted`        | При отметке пункта задач как выполненного       | Нет (срабатывает всегда)                                  |
### Шаблоны Matcher

`matcher` — это регулярное выражение, используемое для фильтрации условий срабатывания.

| Тип события            | События                                                               | Поддержка Matcher | Цель Matcher                                                 |
| :--------------------- | :-------------------------------------------------------------------- | :---------------- | :----------------------------------------------------------- |
| События инструментов   | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | ✅ Regex          | Имя инструмента: `WriteFile`, `ReadFile`, `Bash` и т.д.       |
| События саб-агентов    | `SubagentStart`, `SubagentStop`                                       | ✅ Regex          | Тип агента: `Bash`, `Explorer` и т.д.                        |
| События сессии         | `SessionStart`                                                        | ✅ Regex          | Источник: `startup`, `resume`, `clear`, `compact`            |
| События сессии         | `SessionEnd`                                                          | ✅ Regex          | Причина: `clear`, `logout`, `prompt_input_exit` и т.д.       |
| События уведомлений    | `Notification`                                                        | ✅ Точное совпадение | Тип: `permission_prompt`, `idle_prompt`, `auth_success`      |
| События сжатия         | `PreCompact`                                                          | ✅ Точное совпадение | Триггер: `manual`, `auto`                                    |
| События задач          | `TodoCreated`, `TodoCompleted`                                        | ❌ Нет            | N/A                                                          |
| События подсказок      | `UserPromptSubmit`                                                    | ❌ Нет            | N/A                                                          |
| События остановки      | `Stop`                                                                | ❌ Нет            | N/A                                                          |

**Синтаксис Matcher:**

- Пустая строка `""` или `"*"` соответствует всем событиям этого типа
- Поддерживается стандартный синтаксис регулярных выражений (напр., `^Bash$`, `Read.*`, `(WriteFile|Edit)`)

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

### Структура ввода Hook

Все хуки получают стандартизированный ввод в формате JSON через stdin (команда) или тело POST-запроса (http).

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

Поля, специфичные для события, добавляются в зависимости от типа хука. При работе в субагенте дополнительно включаются `agent_id` и `agent_type`.

### Структура вывода Hook

Вывод хука возвращается через `stdout` (команда) или тело HTTP-ответа (http) в формате JSON.

**Поведение кода возврата (командные хуки):**

| Код возврата | Поведение                                                                                        |
| :----------- | :----------------------------------------------------------------------------------------------- |
| `0`          | Успешно. Разберите JSON из `stdout` для управления поведением.                                   |
| `2`          | **Блокирующая ошибка**. Игнорирует `stdout`, передаёт `stderr` как сообщение об ошибке модели.   |
| Другое       | Неблокирующая ошибка. `stderr` отображается только в режиме отладки, выполнение продолжается.      |

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
**Output Options**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" или "ask" (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.permissionDecisionReason`: пояснение решения (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.updatedInput`: изменённые параметры ввода инструмента для использования вместо исходных
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация

**Примечание**: Хотя стандартные поля вывода хука, такие как `decision` и `reason`, технически поддерживаются базовым классом, официальный интерфейс ожидает `hookSpecificOutput` с полями `permissionDecision` и `permissionDecisionReason`.

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Политика безопасности блокирует запись в базу данных",
    "additionalContext": "Текущее окружение: production. Действуйте с осторожностью."
  }
}
```

#### PostToolUse

**Назначение**: Выполняется после успешного завершения работы инструмента для обработки результатов, логирования или добавления дополнительного контекста.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "имя выполненного инструмента",
  "tool_input": "объект с входными параметрами инструмента",
  "tool_response": "объект с ответом инструмента",
  "tool_use_id": "уникальный идентификатор данного вызова инструмента (внутренний формат, например, toolu_xxx)",
  "tool_call_id": "оригинальный ID вызова API от LLM-провайдера (например, call_xxx для OpenAI/Qwen) (опционально)"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" (по умолчанию "allow", если не указано)
- `reason`: причина решения
- `hookSpecificOutput.additionalContext`: дополнительная информация для включения

**Пример вывода**:

```json
{
  "decision": "allow",
  "reason": "Инструмент выполнен успешно",
  "hookSpecificOutput": {
    "additionalContext": "Изменение файла записано в журнал аудита"
  }
}
```

#### PostToolUseFailure

**Назначение**: Выполняется при сбое выполнения инструмента для обработки ошибок, отправки оповещений или записи ошибок.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_use_id": "уникальный идентификатор вызова инструмента (внутренний формат, например, toolu_xxx)",
  "tool_call_id": "оригинальный ID вызова API от LLM-провайдера (например, call_xxx для OpenAI/Qwen) (опционально)",
  "tool_name": "имя инструмента, который завершился ошибкой",
  "tool_input": "объект с входными параметрами инструмента",
  "error": "сообщение об ошибке с описанием сбоя",
  "is_interrupt": "логический флаг: был ли сбой вызван прерыванием пользователем (опционально)"
}
```

**Output Options**:

- `hookSpecificOutput.additionalContext`: информация об обработке ошибки
- Стандартные поля вывода хука

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Ошибка: файл не найден. Сбой зарегистрирован в системе мониторинга."
  }
}
```

#### UserPromptSubmit

**Назначение**: Выполняется при отправке пользователем запроса для модификации, проверки или обогащения ввода.

**Поля, специфичные для события**:

```json
{
  "prompt": "текст отправленного пользователем запроса"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку пояснение решения
- `hookSpecificOutput.additionalContext`: дополнительный контекст, который будет добавлен к запросу (опционально)

**Примечание**: Поскольку UserPromptSubmitOutput наследует HookOutput, доступны все стандартные поля, но в hookSpecificOutput специально определён только additionalContext для этого события.

**Пример вывода**:

```json
{
  "decision": "allow",
  "reason": "Запрос проверен и одобрен",
  "hookSpecificOutput": {
    "additionalContext": "Не забывайте следовать стандартам кодирования компании."
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
- Стандартные поля вывода хука

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Сессия запущена с включёнными политиками безопасности."
  }
}
```

#### SessionEnd

**Назначение**: Выполняется при завершении сессии для задач очистки.

**Поля, специфичные для события**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Output Options**:

- Стандартные поля вывода хука (обычно не используются для блокировки)

#### Stop

**Назначение**: Выполняется перед тем, как Qwen завершает свой ответ, чтобы предоставить финальную обратную связь или сводку.

**Поля, специфичные для события**:

```json
{
  "stop_hook_active": "логический флаг, указывающий, активен ли хук остановки",
  "last_assistant_message": "последнее сообщение ассистента"
}
```

**Output Options**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку пояснение решения
- `stopReason`: обратная связь для включения в ответ при остановке
- `continue`: установите `false` для остановки выполнения
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация
**Примечание**: Поскольку StopOutput расширяет HookOutput, все стандартные поля доступны, но поле stopReason особенно актуально для этого события.

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Назначение**: Выполняется, когда оборот завершается из-за ошибки API (вместо Stop). Это **однонаправленное событие (fire-and-forget)** — результат хука и коды возврата игнорируются.

**Поля, специфичные для события**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Сопоставление**: Сопоставляется с полем `error`. Например, `"matcher": "rate_limit"` сработает только для ошибок ограничения частоты запросов.

**Варианты вывода**:

- **Нет** — StopFailure является однонаправленным событием. Все результаты хуков и коды возврата игнорируются.

**Обработка кодов возврата**:

| Код возврата | Поведение                          |
| ------------ | ---------------------------------- |
| Любой        | Игнорируется (однонаправленное)    |

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

- Мониторинг и оповещение об ограничениях частоты запросов
- Логирование ошибок аутентификации
- Уведомления об ошибках биллинга
- Сбор статистики ошибок

#### SubagentStart

**Назначение**: Выполняется при запуске под-агента (например, инструмента Task) для настройки контекста или разрешений.

**Поля, специфичные для события**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "agent_id": "identifier for the subagent",
  "agent_type": "type of agent (Bash, Explorer, Plan, Custom, etc.)"
}
```

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: начальный контекст для под-агента
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

**Назначение**: Выполняется при завершении работы под-агента для выполнения задач финализации.

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

**Назначение**: Выполняется перед сжатием разговора для подготовки или логирования процесса сжатия.

**Поля, специфичные для события**:

```json
{
  "trigger": "manual | auto",
  "custom_instructions": "custom instructions currently set"
}
```

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: контекст, который следует включить до сжатия
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

**Назначение**: Выполняется после завершения сжатия разговора для архивирования сводок или отслеживания использования.

**Поля, специфичные для события**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Сопоставление**: Сопоставляется с полем `trigger`. Например, `"matcher": "manual"` сработает только для ручного сжатия через команду `/compact`.

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: дополнительный контекст (только для логирования)
- Стандартные поля вывода хука (только для логирования)

**Примечание**: PostCompact **не** входит в официальный список событий, поддерживающих режим принятия решений (decision mode). Поле `decision` и другие управляющие поля не оказывают управляющего воздействия — они используются только в целях логирования.

**Обработка кодов возврата**:

| Код возврата | Поведение                                                       |
| ------------ | --------------------------------------------------------------- |
| 0            | Успешно — stdout отображается пользователю в подробном режиме    |
| Другой       | Некритическая ошибка — stderr отображается пользователю в подробном режиме |

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
- Аудиторское логирование операций сжатия
#### Notification

**Назначение**: Выполняется при отправке уведомлений для их настройки или перехвата.

**Событийно-специфичные поля**:

```json
{
  "message": "содержимое сообщения уведомления",
  "title": "заголовок уведомления (опционально)",
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
    "additionalContext": "Уведомление обработано системой мониторинга."
  }
}
```

#### PermissionRequest

**Назначение**: Выполняется при отображении диалогов разрешений для автоматизации принятия решений или обновления разрешений.

**Событийно-специфичные поля**:

```json
{
  "permission_mode": "default | plan | auto_edit | yolo",
  "tool_name": "название инструмента, запрашивающего разрешение",
  "tool_input": "объект, содержащий входные параметры инструмента",
  "permission_suggestions": "массив предлагаемых разрешений (опционально)"
}
```

**Варианты вывода**:

- `hookSpecificOutput.decision`: структурированный объект с деталями решения о разрешении:
  - `behavior`: "allow" или "deny"
  - `updatedInput`: изменённый ввод инструмента (опционально)
  - `updatedPermissions`: изменённые разрешения (опционально)
  - `message`: сообщение для отображения пользователю (опционально)
  - `interrupt`: прерывать ли рабочий процесс (опционально)

**Пример вывода**:

```json
{
  "hookSpecificOutput": {
    "decision": {
      "behavior": "allow",
      "message": "Разрешение предоставлено на основе политики безопасности",
      "interrupt": false
    }
  }
}
```

#### TodoCreated

**Назначение**: Выполняется при создании нового элемента задачи через инструмент `todo_write`. Позволяет выполнять проверку, логирование или блокировку создания задачи.

Хуки задач выполняются в две фазы:

- `validation`: выполняется перед сохранением. Используйте эту фазу только для проверки; возврат `block` или `deny` предотвращает запись.
- `postWrite`: выполняется после сохранения. Используйте эту фазу для побочных эффектов, таких как логирование или синхронизация; `block` или `deny` в этой фазе игнорируется.

**Событийно-специфичные поля**:

```json
{
  "todo_id": "уникальный идентификатор задачи",
  "todo_content": "содержимое/описание задачи",
  "todo_status": "pending | in_progress | completed",
  "all_todos": "массив всех задач в текущем списке",
  "phase": "validation | postWrite"
}
```

**Варианты вывода**:

- `decision`: "allow", "block" или "deny"
- `reason`: понятное человеку объяснение решения (требуется при блокировке)

**Поведение при блокировке**:

На фазе `validation`, когда `decision` имеет значение `block` или `deny` (код выхода 2), создание задачи предотвращается. Список задач остаётся неизменным, а причина предоставляется модели в качестве обратной связи.

На фазе `postWrite` задача уже сохранена. Хуки всё ещё могут возвращать вывод, но `block` / `deny` не отменяет запись и не должен использоваться для проверки.

**Пример вывода (Разрешить)**:

```json
{
  "decision": "allow",
  "reason": "Содержимое задачи успешно проверено"
}
```

**Пример вывода (Заблокировать)**:

```json
{
  "decision": "block",
  "reason": "Содержимое задачи слишком короткое. Требуется минимум 5 символов."
}
```

**Пример скрипта хука**:

```bash
#!/bin/bash
# ~/.qwen/hooks/todo-validator.sh
# Проверяет содержимое задачи перед созданием

INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.todo_content')

# Проверка минимальной длины
if [ ${#CONTENT} -lt 5 ]; then
  echo '{"decision": "block", "reason": "Содержимое задачи должно содержать не менее 5 символов"}'
  exit 2
fi

# Блокировка тестовых задач
if [[ "$CONTENT" =~ "test" ]]; then
  echo '{"decision": "block", "reason": "Тестовые задачи не разрешены в рабочей среде"}'
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

**Назначение**: Выполняется при отметке задачи как выполненной. Позволяет выполнять проверку, логирование или блокировку завершения задачи.

Хуки задач выполняются в две фазы:

- `validation`: выполняется перед сохранением. Используйте эту фазу только для проверки; возврат `block` или `deny` предотвращает запись.
- `postWrite`: выполняется после сохранения. Используйте эту фазу для побочных эффектов, таких как логирование или синхронизация; `block` или `deny` в этой фазе игнорируется.

**Событийно-специфичные поля**:

```json
{
  "todo_id": "уникальный идентификатор задачи",
  "todo_content": "содержимое/описание задачи",
  "previous_status": "pending | in_progress (статус до завершения)",
  "all_todos": "массив всех задач в текущем списке",
  "phase": "validation | postWrite"
}
```

**Варианты вывода**:

- `decision`: "allow", "block" или "deny"
- `reason`: понятное человеку объяснение решения (требуется при блокировке)

**Поведение при блокировке**:
Во время фазы `validation`, когда `decision` равно `block` или `deny` (код выхода 2), завершение todo блокируется. Элемент todo остаётся в предыдущем статусе, а причина передаётся модели в качестве обратной связи.

Во время фазы `postWrite` todo уже сохранён. Хуки всё ещё могут возвращать вывод, но `block` / `deny` не отменяют запись и не должны использоваться для валидации.

**Пример вывода (Разрешить)**:

```json
{
  "decision": "allow",
  "reason": "Todo completion approved"
}
```

**Пример вывода (Заблокировать)**:

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

**Сценарии использования**:

- **Логирование**: отслеживание создания и завершения задач для аудита или аналитики
- **Валидация**: обеспечение стандартов качества контента (минимальная длина, обязательные ключевые слова)
- **Управление рабочим процессом**: блокировка завершения до выполнения предварительных условий
- **Интеграция**: синхронизация задач с внешними системами управления (Jira, Trello и т.д.)

## Конфигурация хуков

Хуки настраиваются в параметрах Qwen Code, обычно в `.qwen/settings.json` или файлах конфигурации пользователя:

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

### Параллельное vs последовательное выполнение

- По умолчанию хуки выполняются параллельно для лучшей производительности
- Используйте `sequential: true` в определении хука, чтобы обеспечить выполнение с учётом порядка
- Последовательные хуки могут изменять входные данные для последующих хуков в цепочке

### Асинхронные хуки

Только тип `command` поддерживает асинхронное выполнение. Установка `"async": true` запускает хук в фоне без блокировки основного потока.

**Особенности:**

- Не могут возвращать решение управления (операция уже произошла)
- Результаты внедряются в следующий виток беседы через `systemMessage` или `additionalContext`
- Подходит для аудита, логирования, фонового тестирования и т.д.

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
- Хуки уровня проекта требуют статуса доверенной папки
- Таймауты предотвращают зависание хуков (по умолчанию: 60 секунд)

## Рекомендации

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
Настройте в файле `.qwen/settings.json`:

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

HTTP-хук PostToolUse, отправляющий все записи о выполнении инструментов в удалённый сервис аудита:

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

### Пример 3: Хук валидации пользовательского запроса

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

- Проверьте логи приложения для получения подробной информации о выполнении хуков.
- Убедитесь, что скрипт хука имеет правильные разрешения и исполняемый.
- Следите за правильным форматированием JSON в выходных данных хука.
- Используйте конкретные шаблоны `matcher`, чтобы избежать непреднамеренного выполнения хуков.
- Используйте режим `--debug` для просмотра подробной информации о сопоставлении и выполнении хуков.
- Временно отключите все хуки: добавьте `"disableAllHooks": true` в настройки.
