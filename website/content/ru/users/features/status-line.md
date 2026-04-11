# Строка состояния

> Отображение пользовательской информации в нижней панели с помощью shell-команды.

Строка состояния позволяет запускать shell-команду, вывод которой отображается в левой части нижней панели. Команда получает структурированный JSON-контекст через stdin, поэтому может показывать информацию, привязанную к сессии: текущую модель, использование токенов, git-ветку или любые другие данные, которые можно получить скриптом.

```
With status line (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
└─────────────────────────────────────────────────────────────────┘

With status line + non-default mode (2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

При настройке строка состояния заменяет стандартную подсказку "? for shortcuts". Сообщения с высоким приоритетом (подсказки выхода по Ctrl+C/D, Esc, режим vim INSERT) временно перекрывают строку состояния. Текст строки состояния обрезается, чтобы поместиться в доступную ширину.

## Предварительные требования

- Для парсинга JSON-входа рекомендуется использовать [`jq`](https://jqlang.github.io/jq/) (установка через `brew install jq`, `apt install jq` и т.д.)
- Простые команды, не требующие JSON-данных (например, `git branch --show-current`), работают без `jq`

## Быстрая настройка

Самый простой способ настроить строку состояния — команда `/statusline`. Она запускает агент настройки, который считывает конфигурацию PS1 вашего shell и генерирует соответствующую строку состояния:

```
/statusline
```

Вы также можете передать конкретные инструкции:

```
/statusline show model name and context usage percentage
```

## Ручная настройка

Добавьте объект `statusLine` в ключ `ui` файла `~/.qwen/settings.json`:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

| Поле      | Тип         | Обязательно | Описание                                                                                          |
| --------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `type`    | `"command"` | Да          | Должно быть `"command"`                                                                           |
| `command` | string      | Да          | Выполняемая shell-команда. Получает JSON через stdin, отображается первая строка stdout.          |

## JSON-входные данные

Команда получает JSON-объект через stdin со следующими полями:

```json
{
  "session_id": "abc-123",
  "version": "0.14.1",
  "model": {
    "display_name": "qwen-3-235b"
  },
  "context_window": {
    "context_window_size": 131072,
    "used_percentage": 34.3,
    "remaining_percentage": 65.7,
    "current_usage": 45000,
    "total_input_tokens": 30000,
    "total_output_tokens": 5000
  },
  "workspace": {
    "current_dir": "/home/user/project"
  },
  "git": {
    "branch": "main"
  },
  "metrics": {
    "models": {
      "qwen-3-235b": {
        "api": {
          "total_requests": 10,
          "total_errors": 0,
          "total_latency_ms": 5000
        },
        "tokens": {
          "prompt": 30000,
          "completion": 5000,
          "total": 35000,
          "cached": 10000,
          "thoughts": 2000
        }
      }
    },
    "files": {
      "total_lines_added": 120,
      "total_lines_removed": 30
    }
  },
  "vim": {
    "mode": "INSERT"
  }
}
```

| Поле                                  | Тип              | Описание                                                                                           |
| ------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| `session_id`                          | string           | Уникальный идентификатор сессии                                                                    |
| `version`                             | string           | Версия Qwen Code                                                                                   |
| `model.display_name`                  | string           | Имя текущей модели                                                                                 |
| `context_window.context_window_size`  | number           | Общий размер контекстного окна в токенах                                                           |
| `context_window.used_percentage`      | number           | Использование контекстного окна в процентах (0–100)                                                |
| `context_window.remaining_percentage` | number           | Оставшееся место в контекстном окне в процентах (0–100)                                            |
| `context_window.current_usage`        | number           | Количество токенов из последнего API-вызова (текущий размер контекста)                             |
| `context_window.total_input_tokens`   | number           | Общее количество входных токенов, потреблённых за сессию                                           |
| `context_window.total_output_tokens`  | number           | Общее количество выходных токенов, потреблённых за сессию                                          |
| `workspace.current_dir`               | string           | Текущий рабочий каталог                                                                            |
| `git`                                 | object \| отсутствует | Присутствует только внутри git-репозитория.                                                    |
| `git.branch`                          | string           | Имя текущей ветки                                                                                  |
| `metrics.models.<id>.api`             | object           | Статистика API по моделям: `total_requests`, `total_errors`, `total_latency_ms`                    |
| `metrics.models.<id>.tokens`          | object           | Использование токенов по моделям: `prompt`, `completion`, `total`, `cached`, `thoughts`            |
| `metrics.files`                       | object           | Статистика изменений файлов: `total_lines_added`, `total_lines_removed`                            |
| `vim`                                 | object \| отсутствует | Присутствует только при включённом режиме vim. Содержит `mode` (`"INSERT"` или `"NORMAL"`).  |

> **Важно:** stdin можно прочитать только один раз. Всегда сначала сохраняйте его в переменную: `input=$(cat)`.

## Примеры

### Модель и использование токенов

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

Вывод: `qwen-3-235b  ctx:34%`

### Git-ветка + каталог

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // empty'); dir=$(basename \"$(echo \"$input\" | jq -r '.workspace.current_dir')\"); echo \"$dir${branch:+ ($branch)}\""
    }
  }
}
```

Вывод: `my-project (main)`

> Примечание: Поле `git.branch` передаётся напрямую в JSON-входе — нет необходимости вызывать `git` через shell.

### Статистика изменений файлов

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); added=$(echo \"$input\" | jq -r '.metrics.files.total_lines_added'); removed=$(echo \"$input\" | jq -r '.metrics.files.total_lines_removed'); echo \"+$added/-$removed lines\""
    }
  }
}
```

Вывод: `+120/-30 lines`

### Файл скрипта для сложных команд

Для длинных команд сохраните файл скрипта по пути `~/.qwen/statusline-command.sh`:

```bash
#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
pct=$(echo "$input" | jq -r '.context_window.used_percentage')
branch=$(echo "$input" | jq -r '.git.branch // empty')
added=$(echo "$input" | jq -r '.metrics.files.total_lines_added')
removed=$(echo "$input" | jq -r '.metrics.files.total_lines_removed')

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$branch" ] && parts+=("($branch)")
[ "$pct" != "0" ] 2>/dev/null && parts+=("ctx:${pct}%")
([ "$added" -gt 0 ] || [ "$removed" -gt 0 ]) 2>/dev/null && parts+=("+${added}/-${removed}")

echo "${parts[*]}"
```

Затем укажите его в настройках:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "bash ~/.qwen/statusline-command.sh"
    }
  }
}
```

## Поведение

- **Триггеры обновления**: Строка состояния обновляется при смене модели, отправке нового сообщения (изменение количества токенов), переключении режима vim, смене git-ветки, завершении вызовов инструментов или изменениях файлов. Обновления применяются с задержкой (debounce) 300 мс.
- **Таймаут**: Команды, выполняющиеся дольше 5 секунд, принудительно завершаются. При ошибке строка состояния очищается.
- **Вывод**: Используется только первая строка stdout. Текст отображается приглушёнными цветами в левой части нижней панели и обрезается, если превышает доступную ширину.
- **Горячая перезагрузка**: Изменения `ui.statusLine` в настройках применяются мгновенно — перезапуск не требуется.
- **Shell**: Команды выполняются через `/bin/sh` на macOS/Linux. В Windows по умолчанию используется `cmd.exe` — оборачивайте POSIX-команды в `bash -c "..."` или указывайте путь к bash-скрипту (например, `bash ~/.qwen/statusline-command.sh`).
- **Удаление**: Удалите ключ `ui.statusLine` из настроек, чтобы отключить функцию. Вернётся подсказка "? for shortcuts".

## Устранение неполадок

| Проблема                      | Причина                          | Решение                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Строка состояния не отображается | Конфигурация указана по неверному пути | Должна находиться в `ui.statusLine`, а не в `statusLine` на корневом уровне                                                                                                                                                                                                                                                                                                                                |
| Пустой вывод                  | Команда завершается с ошибкой без вывода | Проверьте вручную: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'ваша_команда'` |
| Устаревшие данные             | Триггер не сработал              | Отправьте сообщение или переключите модель, чтобы запустить обновление                                                                                                                                                                                                                                                                                                                                     |
| Команда выполняется слишком долго | Сложный скрипт                   | Оптимизируйте скрипт или перенесите тяжёлые вычисления в фоновый кэш                                                                                                                                                                                                                                                                                                                                       |