# Хуки Qwen Code

## Обзор

Хуки Qwen Code предоставляют мощный механизм для расширения и настройки поведения приложения Qwen Code. Хуки позволяют пользователям выполнять пользовательские скрипты или программы в определенные моменты жизненного цикла приложения, например, до выполнения инструмента, после выполнения инструмента, при начале/завершении сессии и во время других ключевых событий.

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
- Добавлять дополнительный контекст в диалоги
- Настраивать поведение приложения в зависимости от событий
- Интегрироваться с внешними системами и сервисами
- Программно изменять входные данные или ответы инструментов

## Типы хуков

Qwen Code поддерживает четыре типа исполнителей хуков:

| Тип        | Описание                                                                                       |
| :--------- | :--------------------------------------------------------------------------------------------- |
| `command`  | Выполняет команду оболочки. Получает JSON через `stdin`, возвращает результаты через `stdout`. |
| `http`     | Отправляет JSON в теле `POST`-запроса на указанный URL. Возвращает результаты через тело HTTP-ответа. |
| `function` | Напрямую вызывает зарегистрированную JavaScript-функцию (только для хуков уровня сессии).      |
| `prompt`   | Использует LLM для оценки входных данных хука и возврата решения.                              |

### Хуки command

Хуки command выполняют команды через дочерние процессы. Входной JSON передается через stdin, а вывод возвращается через stdout.

**Конфигурация:**

| Поле            | Тип                      | Обязательно | Описание                                    |
| :-------------- | :----------------------- | :---------- | :------------------------------------------ |
| `type`          | `"command"`              | Да          | Тип хука                                    |
| `command`       | `string`                 | Да          | Команда для выполнения                      |
| `name`          | `string`                 | Нет         | Имя хука (для логирования)                  |
| `description`   | `string`                 | Нет         | Описание хука                               |
| `timeout`       | `number`                 | Нет         | Таймаут в миллисекундах, по умолчанию 60000 |
| `async`         | `boolean`                | Нет         | Запускать ли асинхронно в фоновом режиме    |
| `env`           | `Record<string, string>` | Нет         | Переменные окружения                        |
| `shell`         | `"bash" \| "powershell"` | Нет         | Используемая оболочка                       |
| `statusMessage` | `string`                 | Нет         | Сообщение о статусе, отображаемое во время выполнения |

**Пример:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "write_file",
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

### Хуки http

Хуки http отправляют входные данные хука в виде POST-запросов на указанные URL. Они поддерживают белые списки URL, защиту от SSRF на уровне DNS, интерполяцию переменных окружения и другие функции безопасности.

**Конфигурация:**

| Поле             | Тип                      | Обязательно | Описание                                                  |
| :--------------- | :----------------------- | :---------- | :-------------------------------------------------------- |
| `type`           | `"http"`                 | Да          | Тип хука                                                  |
| `url`            | `string`                 | Да          | Целевой URL                                               |
| `headers`        | `Record<string, string>` | Нет         | Заголовки запроса (поддерживают интерполяцию переменных окружения) |
| `allowedEnvVars` | `string[]`               | Нет         | Белый список переменных окружения, разрешенных в URL/заголовках |
| `timeout`        | `number`                 | Нет         | Таймаут в секундах, по умолчанию 600                      |
| `name`           | `string`                 | Нет         | Имя хука (для логирования)                                |
| `statusMessage`  | `string`                 | Нет         | Сообщение о статусе, отображаемое во время выполнения     |
| `once`           | `boolean`                | Нет         | Выполнять только один раз для каждого события в сессии (только для хуков http) |

**Функции безопасности:**

- **Белый список URL**: Настройка разрешенных шаблонов URL через `allowedUrls`
- **Защита от SSRF**: Блокирует приватные IP-адреса (10.x.x.x, 172.16-31.x.x, 192.168.x.x и т.д.), но разрешает адреса loopback (127.0.0.1, ::1)
- **Валидация DNS**: Проверяет разрешение доменов перед запросами для предотвращения атак DNS rebinding
- **Интерполяция переменных окружения**: Синтаксис `${VAR}`, разрешает использование только переменных из белого списка `allowedEnvVars`

#### Разрешение хуков для приватных сетей (только для управляемых сред)

По умолчанию HTTP-хуки не могут обращаться к приватным или link-local диапазонам IP-адресов. В управляемых платформой средах, где приёмник хука является внутренним endpoint'ом первой стороны в VPC (например, внутренний шлюз API с разрешением в `172.16.0.0/12`), можно ослабить проверки диапазонов IP:

```json
{
  "security": {
    "allowPrivateNetworkHooks": true
  }
}
```

- Этот параметр **учитывается только для областей настроек User, System и SystemDefaults**. Значение, установленное в области Workspace (проект), игнорируется и записывается в лог как предупреждение, чтобы клонированный репозиторий не мог самостоятельно предоставить этот обход.
- Флаг ослабляет только общие проверки диапазонов **private/CGNAT/link-local**. Endpoint'ы метаданных облачных провайдеров остаются заблокированными при любой конфигурации: список `BLOCKED_HOSTS` сопоставляется буквально (`metadata.google.internal`, `metadata.azure.internal`, ...), а IP-адреса метаданных `169.254.169.254` и `100.100.100.200` блокируются во всех сериализованных формах (включая IPv4-mapped IPv6, такие как `::ffff:a9fe:a9fe`) и после резолвинга DNS.
- Белый список `security.allowedHttpHookUrls` по-прежнему применяется независимо. В управляемых средах используйте этот флаг вместе с белым списком, чтобы доступны были только нужные внутренние endpoint'ы. Белый список в настройках Workspace (проект) учитывается только тогда, когда ни одна из областей User, System или SystemDefaults не устанавливает свой; в противном случае он игнорируется и записывается в лог как предупреждение, так что репозиторий может сузить, куда отправляются данные его хуков, но никогда не может заменить настроенный вами белый список (пустой белый список означает «разрешить всё»).
- HTTP-хуки никогда не следуют за редиректами. Ответ 3xx обрабатывается как любой другой статус, отличный от 2xx: неблокирующий сбой хука, а целевой адрес редиректа никогда не вызывается.

> **Warning:** Включение этого флага позволяет хукам обращаться к внутренней инфраструктуре в вашей сети. Включайте его только в доверенных управляемых средах — никогда в репозитории, которым вы не управляете.

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

**Пример: адаптер сервиса внешнего суждения**

Конфигурация `remote-security-check` выше предполагает, что на `http://127.0.0.1:8080/hooks/pre-tool-use` уже работает сервис, реализующий данный контракт (принимает POST `{tool_name, tool_input, ...}`, возвращает `hookSpecificOutput.permissionDecision`). Ниже — минимальный адаптер только на стандартной библиотеке, который заполняет эту недостающую часть и подключён к конкретному бэкенду суждения, чтобы всё можно было запустить и протестировать сквозным образом, а не было заглушкой. Только функция `review()` зависит от бэкенда — замените её тело и форму запроса/ответа на контракт вашего сервиса; всё остальное (сервер, обработка fail-open, форма ответа хука) остаётся неизменным независимо от бэкенда.

_Раскрытие: бэкенд, использованный ниже, [invinoveritas](https://api.babyblueviper.com), — сервис, с автором которого связана аффилиация — использован здесь потому, что именно он был проверен сквозным образом для этого примера, а не как рекомендация. Любой HTTP-сервис, возвращающий JSON-вердикт, работает так же хорошо; достаточно изменить только `review()`._

_Обработка данных: при `matcher: "*"` полный `tool_input` **каждого** вызова инструмента отправляется бэкенду суждения — относитесь к этим входным данным как к чувствительным (они могут содержать содержимое файлов, пути или секреты). Сузьте matcher (например, до `run_shell_command`), если нужно оценивать только команды оболочки._

```python
#!/usr/bin/env python3
# judgment_hook.py -- run: JUDGMENT_API_KEY=... python3 judgment_hook.py
import json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

JUDGMENT_API_KEY = os.environ["JUDGMENT_API_KEY"]
JUDGMENT_URL = os.environ.get("JUDGMENT_URL", "https://api.babyblueviper.com/review")

def review(tool_name, tool_input):
    """POST the call to the judgment backend and return its verdict. This is the
    one function to change for a different backend -- request/response shape
    below matches invinoveritas's /review; adapt both to your own backend's
    contract if you swap it out."""
    body = json.dumps({
        "artifact": json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        "artifact_type": "shell_command" if tool_name in ("run_shell_command", "shell") else "general",
        "context": f"qwen-code PreToolUse: {tool_name}",
    }).encode()
    req = urllib.request.Request(
        JUDGMENT_URL, data=body,
        headers={"Authorization": f"Bearer {JUDGMENT_API_KEY}", "Content-Type": "application/json"},
    )
    # Keep this below the HTTP hook's own timeout (10s in the config above), so a "deny"
    # verdict is always returned before the hook gives up and fails open on its own.
    with urllib.request.urlopen(req, timeout=8) as resp:
        return json.loads(resp.read())  # response includes a "verdict" field: "reject" denies, anything else allows

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        tool_name, tool_input = payload.get("tool_name", "unknown"), payload.get("tool_input", {})
        try:
            verdict = review(tool_name, tool_input)
            decision = "deny" if verdict.get("verdict") == "reject" else "allow"
            reason = verdict.get("summary", f"judgment verdict: {verdict.get('verdict')}")
        except Exception as e:
            decision, reason = "allow", "judgment backend unavailable, failing open"  # never block on a review-side outage
            print(f"judgment backend unavailable for {tool_name}, failing open: {e}", file=sys.stderr)
        out = {"continue": True, "decision": decision, "hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": decision, "permissionDecisionReason": reason,
        }}
        body = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
```

Протестировано вживую сквозным образом с реальным продакшн API выше: реально деструктивный ввод (`{"tool_name": "run_shell_command", "tool_input": {"command": "rm -rf /important_data"}}`) вернул `permissionDecision: "deny"` с реальным объяснением; безобидный (`ls -la`) вернул `"allow"`. При любой проблеме с сетью/таймаутом/некорректным ответом от бэкенда суждения срабатывает fail-open, так что сбой никогда не блокирует легитимные вызовы инструментов — та же дисциплина, что и в примерах `command`-хуков выше с их кодами завершения.

### Хуки function

Хуки function напрямую вызывают зарегистрированные JavaScript/TypeScript-функции. Они используются внутри системы Skill и в настоящее время не доступны как публичный API для конечных пользователей.

**Примечание**: Для большинства сценариев использования вместо них применяйте **хуки command** или **хуки http**, которые можно настраивать в файлах настроек.

### Хуки prompt

Хуки prompt используют LLM для оценки входных данных хука и возврата решения. Это полезно для принятия интеллектуальных решений на основе контекста, например, для определения того, разрешить или заблокировать операцию.

> **Обработка данных:** Хук prompt отправляет входные данные события настроенному провайдеру модели. Когда включено файловое отладочное логирование, полностью развёрнутый запрос хука prompt также записывается в отладочный лог сессии. Относитесь к входным данным хука и отладочным логам как к потенциально чувствительным.

**Как это работает:**

1. Входной JSON хука внедряется в ваш промпт с помощью плейсхолдера `$ARGUMENTS`
2. Промпт отправляется в LLM (по умолчанию: ваша текущая модель)
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

LLM должна возвращать JSON со следующей структурой:

```json
{
  "ok": true,
  "reason": "Explanation of the decision",
  "additionalContext": "Optional context to inject into the conversation"
}
```

| Поле                | Описание                                                                 |
| :------------------ | :----------------------------------------------------------------------- |
| `ok`                | `true` для разрешения/продолжения, `false` для блокировки/остановки      |
| `reason`            | Обязательно, если `ok` равно `false`. Показывается модели для объяснения блокировки |
| `additionalContext` | Опционально. Дополнительный контекст для внедрения в диалог при разрешении |

**Поддерживаемые события:**

Хуки prompt можно использовать с большинством событий хуков, включая:

- `PreToolUse` — Оценка того, разрешить ли вызов инструмента
- `PostToolUse` — Оценка результатов инструмента и потенциальное внедрение контекста
- `Stop` — Определение того, продолжать ли работу или остановиться
- `SubagentStop` — Оценка результатов подагента
- `UserPromptSubmit` — Оценка или обогащение допустимых промптов, привязанных к модели

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

Если `ok` равно `false`, Qwen Code продолжит работу и использует `reason` в качестве контекста для следующего ответа.

**Пример: хук PreToolUse**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "run_shell_command",
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

Хуки срабатывают в определенные моменты во время сессии Qwen Code. Разные события поддерживают разные матчеры для фильтрации условий срабатывания.

| Событие                | Когда срабатывается                                 | Цель матчера                                                 |
| :--------------------- | :-------------------------------------------------- | :----------------------------------------------------------- |
| `PreToolUse`           | До выполнения инструмента                           | Tool id (`write_file`, `read_file`, `run_shell_command` и т.д.) |
| `PostToolUse`          | После успешного выполнения инструмента              | Tool id                                                      |
| `PostToolUseFailure`   | После сбоя при выполнении инструмента               | Tool id                                                      |
| `UserPromptSubmit`     | Перед поддерживаемыми вызовами модели               | Нет                                                          |
| `SessionStart`         | При запуске или возобновлении сессии                | Источник (`startup`, `resume`, `clear`, `compact`)           |
| `SessionEnd`           | При завершении сессии                               | Причина (`clear`, `logout`, `prompt_input_exit` и т.д.)      |
| `SessionDelete`        | После удаления явно выбранной сессии                | Нет (срабатывает всегда)                                     |
| `MessageDisplay`       | Многократно, по мере потоковой передачи ответа      | Нет (срабатывает всегда)                                     |
| `Stop`                 | Когда Claude готовится завершить ответ              | Нет (срабатывает всегда)                                     |
| `SubagentStart`        | При запуске подагента                               | Тип агента (`Bash`, `Explorer`, `Plan` и т.д.)               |
| `SubagentStop`         | При остановке подагента                             | Тип агента                                                   |
| `PreCompact`           | Перед сжатием диалога                               | Триггер (`manual`, `auto`)                                   |
| `Notification`         | При отправке уведомлений                            | Тип (`permission_prompt`, `idle_prompt`, `auth_success`)     |
| `PermissionRequest`    | При отображении диалога запроса разрешений          | Tool id                                                      |
| `PermissionDenied`     | Когда разрешение на инструмент отклонено            | Tool id                                                      |
| `TodoCreated`          | При создании нового элемента todo                   | Нет (срабатывает всегда)                                     |
| `TodoCompleted`        | Когда элемент todo помечен как выполненный          | Нет (срабатывает всегда)                                     |

### Паттерны матчера

`matcher` — это регулярное выражение, используемое для фильтрации условий срабатывания.

| Тип события           | События                                                                                     | Поддержка матчера | Цель матчера                                                |
| :-------------------- | :----------------------------------------------------------------------------------------- | :---------------- | :---------------------------------------------------------- |
| События инструментов  | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` | ✅ Regex          | Tool id: `write_file`, `read_file`, `run_shell_command` и т.д. |
| События подагентов    | `SubagentStart`, `SubagentStop`                                                            | ✅ Regex          | Тип агента: `Bash`, `Explorer` и т.д.                       |
| События сессии        | `SessionStart`                                                                             | ✅ Regex          | Источник: `startup`, `resume`, `clear`, `compact`           |
| События сессии        | `SessionEnd`                                                                               | ✅ Regex          | Причина: `clear`, `logout`, `prompt_input_exit` и т.д.      |
| События сессии        | `SessionDelete`                                                                            | ❌ Нет            | Н/Д                                                         |
| События уведомлений   | `Notification`                                                                             | ✅ Точное совпадение | Тип: `permission_prompt`, `idle_prompt`, `auth_success`    |
| События сжатия        | `PreCompact`                                                                               | ✅ Точное совпадение | Триггер: `manual`, `auto`                                   |
| События Todo          | `TodoCreated`, `TodoCompleted`                                                             | ❌ Нет            | Н/Д                                                         |
| События промпта       | `UserPromptSubmit`                                                                         | ❌ Нет            | Н/Д                                                         |
| События остановки     | `Stop`                                                                                     | ❌ Нет            | Н/Д                                                         |
| Отображение сообщений | `MessageDisplay`                                                                           | ❌ Нет            | Н/Д                                                         |

**Синтаксис матчера:**

- Пустая строка `""` или `"*"` соответствует всем событиям данного типа
- Поддерживается стандартный синтаксис регулярных выражений (например, `^run_shell_command$`, `read_.*`, `(write_file|edit)`)
- Хуки инструментов получают runtime tool id в поле `tool_name` (например, `write_file`). Встроенные отображаемые имена, такие как `WriteFile` и `ReadFile`, также принимаются как алиасы matcher'а для совместимости, но в новых конфигурациях следует предпочитать runtime id.

**Примеры:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash check' >> /tmp/hooks.log"
          }
        ]
      },
      {
        "matcher": "write_.*",
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

Все исполнители хуков получают стандартизированные входные данные события. Граница доставки зависит от исполнителя:

| Тип хука   | Получатель входных данных                                       |
| :--------- | :-------------------------------------------------------------- |
| `command`  | Дочерний процесс через JSON на `stdin`                          |
| `http`     | Настроенный endpoint через JSON-тело `POST`-запроса             |
| `function` | Доверенный внутрипроцессный callback                            |
| `prompt`   | Настроенный провайдер модели после замены `$ARGUMENTS` во входных данных |

Хуки function — это доверенный код, выполняющийся в процессе Qwen. Они получают внутрипроцессный объект, поэтому поля не должны рассматриваться как неизменяемые для хука function.

Qwen не контролирует, сохраняет ли процесс хука, endpoint, callback или провайдер модели свои входные данные и пересылает ли их. Ознакомьтесь с политикой обработки данных каждого настроенного исполнителя.

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

Входные данные хука представляют собой расширяемый JSON-контракт: в существующие события могут добавляться новые опциональные поля. Потребители должны игнорировать неизвестные поля. Строгий декодер, отклоняющий неизвестные свойства, должен быть обновлён для явного разрешения каждого нового опционального поля перед обновлением Qwen Code. Для хуков, чувствительных к безопасности, сбой декодера может изменить поведение fail-open или fail-closed, поэтому администраторы должны валидировать обновлённые данные относительно развёрнутого хука перед релизом.

### Структура выходных данных хука

Выходные данные хука возвращаются через `stdout` (command) или тело HTTP-ответа (http) в формате JSON.

**Поведение кодов завершения (хуки command):**

| Код завершения | Поведение                                                                              |
| :------------- | :------------------------------------------------------------------------------------- |
| `0`            | Успех. Парсит JSON в `stdout` для управления поведением.                               |
| `2`            | **Блокирующая ошибка**. Игнорирует `stdout`, передает `stderr` как обратную связь об ошибке модели. |
| Другой         | Неблокирующая ошибка. `stderr` отображается только в режиме отладки, выполнение продолжается.           |

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

**Назначение**: Выполняется перед использованием инструмента для проверки разрешений, валидации входных данных или внедрения контекста.

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

**Варианты вывода**:

- `hookSpecificOutput.permissionDecision`: "allow", "deny" или "ask" (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.permissionDecisionReason`: объяснение решения (ОБЯЗАТЕЛЬНО)
- `hookSpecificOutput.updatedInput`: измененные входные параметры инструмента для использования вместо исходных
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация

Значение `permissionDecision` управляет запуском инструмента:

- `"allow"` — запустить инструмент без обычного запроса на подтверждение.
- `"deny"` — заблокировать инструмент; он не выполняется, и модели возвращается ошибка.
- `"ask"` — приостановить выполнение и запросить у пользователя подтверждение вызова инструмента в TUI перед его запуском. Подтверждение запускает инструмент один раз; отмена отменяет его. В контекстах, где невозможно запросить подтверждение — headless-запуски (`--prompt`) и фоновые подагенты — `"ask"` переключается на `"deny"`.

Для `"ask"` TUI отображает `permissionDecisionReason` как буквальный текст, не интерпретируя встроенный Markdown. Это сохраняет маркеры форматирования и цели ссылок видимыми для пользователя.

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

**Варианты вывода**:

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

**Назначение**: Выполняется при сбое выполнения инструмента для обработки ошибок, отправки оповещений или регистрации сбоев.

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

**Назначение**: Выполняется перед поддерживаемыми вызовами модели для валидации, блокировки или обогащения текущего промпта, привязанного к модели. Событие в настоящее время охватывает отправку `UserQuery`, `ToolResult` и `Hook`, тогда как отправки `Retry`, `Steer`, `Cron`, `Notification` и `Teammate` пропускаются. Таким образом, оно может возникать на путях продолжения, и `prompt` не должен считаться исходным пользовательским вводом.

**Специфичные для события поля**:

```json
{
  "prompt": "current model-bound prompt for this hook invocation",
  "submitted_prompt": "optional user text captured at a supported interactive TUI submission boundary"
}
```

`submitted_prompt` — опциональное поле. Оно присутствует только тогда, когда Qwen может сохранить происхождение от поддерживаемой интерактивной отправки в TUI к новому `UserQuery`. Оно отсутствует для неподдерживаемых источников и машинных путей, таких как steering в том же ходу, продолжения tool-result, повторы, cron, уведомления и трафик teammate. ACP, headless, `serve`, SDK и пути удалённого ввода не генерируют его в текущей версии.

Отложенный ввод может сохранять поле, когда его происхождение остаётся полным. Комбинированный пакет сохраняет происхождение только тогда, когда каждый его элемент имеет его; отредактированный, частично известный или иной неоднозначный ввод опускает поле. Навигация по промптам, командной и shell-истории, выбранные поисковые совпадения, восстановление stash'а после перезапуска и восстановление отката диалога также опускают его, потому что эти пути могут возвращать привязанный к модели текст без его исходного происхождения. Потребители, которым требуется отправленный пользователем текст, должны трактовать отсутствие как недоступное, а не переключаться на `prompt`.

После очистки или отправки восстановленного ввода или ввода без происхождения, композер также очищает свою историю undo и redo. Это предотвращает восстановление развёрнутого текста через undo после потребления его маркера или sidecar.

Плейсхолдеры больших вставок остаются компактными в `submitted_prompt`; развёрнутое содержимое вставки появляется только в `prompt`. Потребители должны трактовать это поле как проекцию текста TUI, а не как побайтовую запись ввода из буфера обмена.

Любой непустой ввод при включённом режиме Vim опускает `submitted_prompt`, в том числе после отключения Vim, потому что регистры Vim не переносят происхождение в текущей версии. Это консервативное правило также охватывает черновики, введённые до включения Vim. Очистка композера начинает новый допустимый ввод.

Это поле — происхождение, не аутентификация, идентичность тенанта, авторизация или DLP. Это данные, предоставленные вызывающей стороной. Каждый исполнитель, настроенный для этого события, получает его; в частности, HTTP-хуки отправляют его на свой endpoint, а хуки prompt — своему провайдеру модели.

Когда оба поля присутствуют, payload'ы хуков prompt содержат перекрывающийся текст и могут потреблять дополнительные токены входных данных модели. В текущей версии нет подавления полей для отдельных хуков.

Последовательные хуки UserPromptSubmit могут добавлять `additionalContext` к `prompt`; `submitted_prompt` продолжает представлять захваченную отправку. Хуки function — это доверенный код в том же процессе и не ограничены гарантией неизменности.

Когда финальный вывод хука содержит непустой `additionalContext`, Qwen сначала
санирует значение и затем отправляет его модели как отдельную текстовую часть:

```xml
<qwen:user-prompt-submit-context>
санированный контекст хука
</qwen:user-prompt-submit-context>
```

Тег сообщает модели и потребителям транскрипта, что часть пришла из
настроенного хука, а не из пользовательского промпта. Это маркер происхождения,
а не аутентификация, авторизация или общая граница доверия.

Для `UserQuery` с этим добавленным контекстом, JSONL-запись сессии сохраняет
привязанные к модели части, включая помеченную часть, и добавляет следующий
`systemPayload`:

```json
{
  "displayText": "проекция отображения до хука",
  "hookContext": "санированный контекст хука"
}
```

Этот двухполевой payload записывается только для этого вида записи пользовательского промпта.
`hookContext` намеренно дублирует помеченную часть, чтобы офлайн- и
сторонние потребители могли определить его происхождение без парсинга текста модели.
`displayText` — это проекция отображения до хука и никогда не включает контекст хука.
Для поддерживаемой интерактивной отправки TUI это сырая проекция композера,
переносимая `submitted_prompt`; ACP, headless, `serve`, SDK, удалённый
ввод и другие пути без этого происхождения записывают развёрнутый промпт до хука.

Потребители отображения транскрипта трактуют `displayText` как эту проекцию пользовательского промпта,
когда `systemPayload.hookContext` является строкой. Для совместимости с выпущенными
записями пользовательских промптов только с `displayText`, полный помеченный контекст в финальной
части после хотя бы одной другой части является эквивалентным свидетельством пары. Записи
уведомлений, cron и mid-turn также могут иметь `displayText`, но эти значения являются
компактными отображаемыми метками и не должны подставляться вместо их привязанного к модели текста
без этого свидетельства.
Устаревшие записи с голым контекстом сохраняют своё привязанное к модели поведение отображения, потому что
контекст не может быть надёжно разделён. Для записей без метаданных, использующих
текущую помеченную форму, потребители совместимости могут удалить ту же полную
финальную помеченную часть; они не должны делать вывод, что произвольный похожий на тег пользовательский текст является
происхождением хука.

Атрибуты чувствительной телеметрии промптов, когда включены, и управляемое автопамять
оба используют промпт до хука. Они не включают
контекст, добавленный `UserPromptSubmit`.

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение решения
- `hookSpecificOutput.additionalContext`: дополнительный контекст для добавления к промпту (опционально)

При отправке модели внедрённый `additionalContext` добавляется как собственная часть сообщения, обёрнутая в зарезервированный тег `<qwen:user-prompt-submit-context>...</qwen:user-prompt-submit-context>`, чтобы он оставался отличимым от авторского текста пользователя в истории модели и транскриптах сессии. Угловые скобки в выводе хука экранируются перед обёрткой, поэтому содержимое хука не может закрыть или подделать тег. Транскрипт сессии также записывает исходный текст промпта пользователя отдельно; интерактивный TUI и путь воспроизведения транскрипта ACP/экспорт отображают этот исходный текст, а не внедрённый контекст.

**Примечание**: Поскольку UserPromptSubmitOutput расширяет HookOutput, доступны все стандартные поля, но только additionalContext в hookSpecificOutput специально определен для этого события.

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

**Специфичные для события поля**:

```json
{
  "reason": "clear | logout | prompt_input_exit | bypass_permissions_disabled | other"
}
```

**Варианты вывода**:

- Стандартные поля вывода хука (обычно не используются для блокировки)

#### SessionDelete

**Назначение**: Выполняется после того, как явно выбранная сессия была безвозвратно удалена. Это событие по принципу fire-and-forget: выходные данные и сбои не могут отменить удаление.

**Специфичные для события поля**:

```json
{
  "deleted_session_id": "the session that was deleted"
}
```

Хук использует обычные поля сессии удаляющего runtime'а (`session_id`, `transcript_path` и `cwd`); через ACP `transcript_path` пуст, потому что удаляющий runtime не имеет собственного транскрипта. `SessionDelete` в настоящее время срабатывает для интерактивного потока `/delete` и явного метода `deleteSession` в ACP; пакетное удаление через daemon REST и внутренняя очистка его не генерируют. Командный хук остаётся завершаться, если Qwen выходит после диспетчеризации; его stdout и stderr игнорируются и остаются независимыми от каналов Qwen.

#### MessageDisplay

**Назначение**: Срабатывает многократно по мере потоковой передачи ответа ассистента — до `Stop`, который срабатывает один раз в конце хода. Полезно для live-наррации, инкрементального логирования или любого потребителя, который хочет реагировать на ответ по мере его написания, а не постфактум. Это событие по принципу **fire-and-forget** — выходные данные и коды завершения хука игнорируются.

**Специфичные для события поля**:

```json
{
  "message_id": "stable id for the whole streamed message",
  "displayed_text": "the CUMULATIVE text streamed so far for this message (not a delta)",
  "is_final": "true on the last firing for this message, false otherwise"
}
```

`displayed_text` является накопительным, а не дельтой, чтобы скриптам хуков не нужно было самостоятельно собирать куски — каждый запуск несёт полный текст на данный момент. Срабатывание debounced (не чаще ~200 мс), за исключением финального запуска (`is_final: true`), который всегда срабатывает по завершении сообщения, так что хвост ответа никогда не теряется в ожидании окна debounce.

**Семантика доставки** — на что может опираться скрипт хука:

- **Медленные хуки видят меньше, но более свежие payload'ы.** Одновременно в полёте находится не более одного выполнения хука в середине потока для каждого сообщения; пока одно выполняется, новые debounced payload'ы _заменяют_ тот, что в очереди, а не накапливаются за ним. Таким образом, хук медленнее окна debounce пропускает промежуточные снимки — без потерь, поскольку каждый payload несёт полный накопительный текст.
- **`is_final` никогда не стоит в очереди за устаревшей доставкой.** Финальный payload отправляется в момент завершения сообщения — одновременно с ещё выполняющимся выполнением в середине потока, если такое есть (единственное исключение из правила «один за раз», обоснованное так же: финальный накопительный текст строго заменяет то, что обрабатывает это выполнение). Ваш хук всегда получает payload `is_final` и получает его до срабатывания хука `Stop`. Следствие для хуков с состоянием: когда финальное выполнение пересекается с вытесненным промежуточным, порядок их _завершения_ не определён — устаревшее выполнение может завершиться после финального (даже после `Stop`). Трактуйте `is_final` как терминальный для `message_id` и позволяйте накопительному тексту побеждать, а не предполагайте, что последнее завершённое выполнение несёт новейшее состояние.
- **Ход ждёт завершения доставки `is_final` — но не бесконечно.** Завершение хода (и хук `Stop`, когда он срабатывает) ждёт до 5 секунд завершения финальной доставки. Хук, завершающийся в рамках этого бюджета, сохраняет самую сильную гарантию: headless-запуск (`qwen -p ...`) выходит только после завершения хука, и выполнение `is_final` завершается до начала `Stop`. Более медленный хук всё равно получает `is_final` первым — ограничено только ожидание его завершения: в терминальном UI или ACP-сессии выполнение просто завершается в фоне, тогда как headless-запуск выходит без ожидания. Процесс хука не убивается при выходе; ему даётся завершиться самостоятельно, так что скрипт с цепочкой `qwen -p … && next-step` может наблюдать запуск `next-step`, пока медленный хук ещё работает. Превышение этого таймаута выводит предупреждение в stderr.
- **Поведение отмены зависит от тайминга.** Ход, отменённый _до диспетчеризации `is_final`_, не генерирует `is_final` — сообщение трактуется как заброшенное, и потребитель, буферизующий до `is_final`, должен трактовать тишину отмены как сигнал сброса/отбрасывания (например, фолбэк по таймауту). Критерий — состояние сигнала отмены в момент завершения хода, а не то, успели ли уже передаться все чанки — отмена, попавшая в короткий промежуток перед этой проверкой, всё ещё может подавить `is_final` для сообщения, текст которого фактически уже полностью прибыл. Отмена _после диспетчеризации `is_final`_ (во время ожидания drain) — это другое: ещё выполняющееся выполнение хука может быть прервано на полёте (SIGTERM), но сам payload уже был доставлен.
- **`displayed_text` является предварительным до `is_final`.** Он отражает то, что было передано к данному моменту; трактуйте промежуточные payload'ы как состояние отображения, а не как авторитетное финальное содержимое.
- **Ход с использованием инструментов генерирует несколько сообщений.** Каждый вызов модели получает свой `message_id` со своим запуском `is_final: true`: текст до вызова инструмента — одно сообщение, продолжение после результата инструмента — другое. Вызовы модели, не генерирующие отображаемый текст (только вызов инструмента), ничего не генерируют.

**Примечание**: Срабатывает в терминальном UI, headless (`-p`) и ACP (IDE/редактор/`qwen serve`) сессиях с одинаковым контрактом payload на каждой поверхности.

#### Stop

**Назначение**: Выполняется перед тем, как Qwen завершит свой ответ, для предоставления итоговой обратной связи или резюме.

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

Поля `context_usage`, `context_limit` и `input_tokens` позволяют скриптам хуков отслеживать использование контекста и реализовывать пользовательские стратегии сжатия — например, скрипт, который выводит напоминание о запуске `/compact`, когда использование превышает пользовательский порог.

**Варианты вывода**:

- `decision`: "allow", "deny", "block" или "ask"
- `reason`: понятное человеку объяснение решения
- `stopReason`: обратная связь для включения в ответ об остановке
- `continue`: установите в false, чтобы остановить выполнение
- `hookSpecificOutput.additionalContext`: дополнительная контекстная информация

**Примечание**: Поскольку StopOutput расширяет HookOutput, доступны все стандартные поля, но поле stopReason особенно актуально для этого события.

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### StopFailure

**Назначение**: Выполняется, когда ход завершается из-за ошибки API или обнаружения цикла (вместо Stop). Это событие по принципу **fire-and-forget** — выходные данные хука и коды завершения игнорируются.

**Специфичные для события поля**:

```json
{
  "error": "rate_limit | authentication_failed | billing_error | invalid_request | server_error | max_output_tokens | loop_detected | unknown",
  "error_details": "detailed error message (optional)",
  "last_assistant_message": "the last message from the assistant before the error (optional)"
}
```

**Matcher**: Сопоставляется с полем `error`. Например, `"matcher": "rate_limit"` будет срабатывать только для ошибок rate limit.

**Варианты вывода**:

- **None** - StopFailure работает в режиме fire-and-forget. Весь вывод хуков и коды завершения игнорируются.

**Обработка кодов завершения**:

| Код завершения | Поведение                  |
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

- Мониторинг и алертинг rate limit
- Логирование ошибок аутентификации
- Уведомления об ошибках биллинга
- Сбор статистики ошибок

Командный хук остаётся завершаться, если Qwen выходит после диспетчеризации; его stdout и stderr игнорируются и остаются независимыми от каналов Qwen.

#### SubagentStart

**Назначение**: Выполняется при запуске подагента (например, инструмента Task) для настройки контекста или прав доступа.

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

**Назначение**: Выполняется при завершении работы подагента для выполнения финальных задач.

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
- `reason`: понятное человеку объяснение принятого решения

**Пример вывода**:

```json
{
  "decision": "block",
  "reason": "Must be provided when Qwen Code is blocked from stopping"
}
```

#### PreCompact

**Назначение**: Выполняется перед сжатием диалога (compaction) для подготовки или логирования сжатия.

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

**Назначение**: Выполняется после завершения сжатия диалога для архивации резюме или отслеживания использования.

**Специфичные для события поля**:

```json
{
  "trigger": "manual | auto",
  "compact_summary": "the summary generated by the compaction process"
}
```

**Matcher**: Сопоставляется с полем `trigger`. Например, `"matcher": "manual"` будет срабатывать только для ручного сжатия через команду `/compact`.

**Варианты вывода**:

- `hookSpecificOutput.additionalContext`: дополнительный контекст (только для логирования)
- Стандартные поля вывода хука (только для логирования)

**Примечание**: PostCompact **не** входит в официальный список событий, поддерживающих decision mode. Поле `decision` и другие управляющие поля не оказывают никакого управляющего эффекта — они используются только для логирования.

**Обработка кодов завершения**:

| Код завершения | Поведение                                                  |
| --------- | --------------------------------------------------------- |
| 0         | Успех - stdout показывается пользователю в verbose-режиме            |
| Другой     | Неблокирующая ошибка - stderr показывается пользователю в verbose-режиме |

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

- Архивация резюме в файлы или базы данных
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

**Назначение**: Выполняется при отображении диалогов запроса прав доступа для автоматизации принятия решений или обновления прав.

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

- `hookSpecificOutput.decision`: структурированный объект с деталями решения о правах доступа:
  - `behavior`: "allow" или "deny"
  - `updatedInput`: измененные входные данные инструмента (опционально)
  - `updatedPermissions`: измененные права доступа (опционально)
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

**Назначение**: Выполняется при создании нового элемента todo с помощью инструмента `todo_write`. Позволяет валидировать, логировать или блокировать создание todo.

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
- `reason`: понятное человеку объяснение принятого решения (обязательно при блокировке)

**Поведение при блокировке**:

В фазе `validation`, если `decision` равно `block` или `deny` (код завершения 2), создание todo предотвращается. Список todo остается неизменным, а причина предоставляется модели в качестве обратной связи.

В фазе `postWrite` todo уже сохранен. Хуки могут возвращать вывод, но `block` / `deny` не отменяет запись и не должно использоваться для валидации.

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

**Назначение**: Выполняется, когда элемент todo помечается как выполненный. Позволяет валидировать, логировать или блокировать завершение todo.

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
- `reason`: понятное человеку объяснение принятого решения (обязательно при блокировке)

**Поведение при блокировке**:

В фазе `validation`, если `decision` равно `block` или `deny` (код завершения 2), завершение todo предотвращается. Элемент todo остается в предыдущем статусе, а причина предоставляется модели в качестве обратной связи.

В фазе `postWrite` todo уже сохранен. Хуки могут возвращать вывод, но `block` / `deny` не отменяет запись и не должно использоваться для валидации.

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
- **Валидация**: Обеспечение стандартов качества контента (минимальная длина, обязательные ключевые слова)
- **Управление рабочим процессом**: Блокировка завершения до выполнения предварительных условий
- **Интеграция**: Синхронизация todo с внешними системами управления задачами (Jira, Trello и т. д.)

## Конфигурация хуков

Хуки настраиваются в настройках Qwen Code, обычно в файле `.qwen/settings.json` или пользовательских конфигурационных файлах:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^run_shell_command$",
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
- Используйте `sequential: true` в определении хука, чтобы принудительно задать порядок выполнения
- Последовательные хуки могут изменять входные данные для последующих хуков в цепочке

### Асинхронные хуки

Только тип `command` поддерживает асинхронное выполнение. Установка `"async": true` запускает хук в фоновом режиме, не блокируя основной поток.

Асинхронные хуки ограничены процессом Qwen, потому что их захваченный вывод доставляется через внутрипроцессный реестр асинхронных хуков. В POSIX Qwen завершает всё ещё работающее дерево процессов асинхронного хука при выходе, за исключением типов событий, разделы которых явно гарантируют выполнение по принципу fire-and-forget после выхода. В Windows невозможно восстановить дерево потомков после выхода корневого процесса, поэтому полное завершение при выходе родителя требует Job Object или отслеживания потомков.

**Особенности:**

- Нельзя вернуть управление решением (операция уже произошла)
- Результаты внедряются в следующий ход диалога через `systemMessage` или `additionalContext`, за исключением типов событий по принципу fire-and-forget с игнорируемым выводом, описанных выше
- Подходит для аудита, логирования, фонового тестирования и т.д.

**Пример:**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "write_file|edit",
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

- Хуки выполняются в окружении пользователя с его правами доступа
- Хуки на уровне проекта требуют статуса доверенной папки
- Таймауты предотвращают зависание хуков (по умолчанию: 60 секунд)

## Лучшие практики

### Пример 1: Хук проверки безопасности

Хук PreToolUse, который логирует и при необходимости блокирует опасные команды:

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

### Пример 2: HTTP-хук для аудита

HTTP-хук PostToolUse, который отправляет все записи о выполнении инструментов в удаленную службу аудита:

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

### Пример 3: Хук валидации промпта, отправленного через интерактивный TUI

Чтобы проверить текущее содержимое, привязанное к модели, читайте поле `prompt`. Это поле может содержать сгенерированное или развёрнутое содержимое, не является исходным пользовательским вводом и не подразумевает, что `UserPromptSubmit` охватывает каждую отправку модели. Не переключайтесь молча с `submitted_prompt` на `prompt`, когда требуется происхождение источника.

Хук UserPromptSubmit, который проверяет поддерживаемые интерактивные отправки TUI на наличие конфиденциальной информации и добавляет контекст для длинных промптов. Он пропускает вызовы, где происхождение источника недоступно. Проверка по ключевым словам приведена для иллюстрации и не является полной политикой DLP:

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
    sys.exit(1)

user_prompt = input_data.get("submitted_prompt")
if user_prompt is None:
    # Do not mistake model-bound or machine-generated content for raw input.
    sys.exit(0)

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
        sys.exit(0)

# Check prompt length and add warning context if too long
if len(user_prompt) > 1000:
    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Note: User submitted a long prompt. Please read carefully and ensure all requirements are understood."
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# No processing needed for normal cases
sys.exit(0)
```

## Устранение неполадок

- Проверьте логи приложения для получения подробностей о выполнении хуков
- Убедитесь в наличии прав доступа и исполняемости скриптов хуков
- Убедитесь в правильности форматирования JSON в выходных данных хуков
- Используйте конкретные паттерны matcher, чтобы избежать непреднамеренного выполнения хуков
- Используйте режим `--debug` для просмотра подробной информации о сопоставлении и выполнении хуков. Входные данные хуков prompt могут записываться в отладочный лог сессии, поэтому применяйте соответствующие контроли доступа и хранения.
- Временно отключите все хуки: добавьте `"disableAllHooks": true` в настройки