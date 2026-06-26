# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` — это экспериментальный Python SDK для Qwen Code. Версия v1 нацелена на существующий CLI-протокол `stream-json` и сохраняет транспортную поверхность небольшой и тестируемой.

## Область применения

- Имя пакета: `qwen-code-sdk`
- Путь импорта: `qwen_code_sdk`
- Требования к среде выполнения: Python `>=3.10`
- Зависимость от CLI: в v1 требуется внешний исполняемый файл `qwen`
- Область транспорта: только процессный транспорт
- Не входит в v1: ACP-транспорт, встроенные в SDK MCP-серверы

## Установка

```bash
pip install qwen-code-sdk
```

Для предварительных версий:

```bash
pip install --pre qwen-code-sdk
```

Если `qwen` не находится в `PATH`, явно укажите `path_to_qwen_executable`.

Перед написанием кода SDK убедитесь, что CLI работает в той же оболочке:

```bash
qwen --version
```

## Быстрый старт

```python
import asyncio

from qwen_code_sdk import (
    is_sdk_assistant_message,
    is_sdk_result_message,
    query,
)


def extract_text(message):
    content = message.get("message", {}).get("content", [])
    if not isinstance(content, list):
        return repr(content)
    texts = [
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    return "".join(texts) if texts else "[no text content]"


def print_result(message):
    if message.get("is_error"):
        error = message.get("error") or {}
        print(f"Error: {error.get('message', 'Unknown error')}")
        return
    print(message.get("result", ""))


async def main() -> None:
    async with query(
        "Explain the repository structure.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    ) as result:
        async for message in result:
            if is_sdk_assistant_message(message):
                print(extract_text(message))
            elif is_sdk_result_message(message):
                print_result(message)


asyncio.run(main())
```

`asyncio.run()` подходит для автономных скриптов. Если ваше приложение уже запускает цикл событий, например Jupyter, FastAPI или pytest-asyncio, используйте `await main()`.

## Синхронное использование

Используйте `query_sync`, когда ваше хост-приложение не асинхронно:

```python
from qwen_code_sdk import is_sdk_result_message, query_sync


with query_sync(
    "Summarize this repository in one paragraph.",
    {
        "cwd": "/path/to/project",
        "path_to_qwen_executable": "qwen",
    },
) as result:
    for message in result:
        if is_sdk_result_message(message):
            if message.get("is_error"):
                error = message.get("error") or {}
                print(f"Error: {error.get('message', 'Unknown error')}")
            else:
                print(message.get("result", ""))
```

## API-поверхность

### Точки входа верхнего уровня

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` поддерживает:

- `str` для однократных запросов
- `AsyncIterable[SDKUserMessage]` для многошаговых потоков

### `Query`

- Асинхронный итератор по сообщениям SDK
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| Опция                      | Тип / значения                                                | Описание                                                                                                                       |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`                      | `str`                                                        | Рабочий каталог для процесса CLI.                                                                                             |
| `model`                    | `str`                                                        | Переопределение модели для данной сессии SDK.                                                                                    |
| `path_to_qwen_executable`  | `str`                                                        | `qwen`, явный путь к бинарному файлу или `.js` CLI-бандл.                                                                      |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                       | Режим подтверждения выполнения инструментов. `yolo` автоматически одобряет все инструменты; используйте только в доверенной или изолированной среде. |
| `can_use_tool`             | асинхронный callback                                         | Пользовательский callback разрешений для запросов инструментов.                                                                  |
| `env`                      | `dict[str, str]`                                             | Дополнительные переменные окружения, передаваемые процессу CLI.                                                                  |
| `system_prompt`            | `str`                                                        | Переопределение системного промпта.                                                                                             |
| `append_system_prompt`     | `str`                                                        | Добавление дополнительных инструкций к системному промпту.                                                                      |
| `debug`                    | `bool`                                                       | Перенаправлять stderr CLI в stderr, если не задан обработчик `stderr`.                                                           |
| `max_session_turns`        | `int`                                                        | Максимальное число шагов, после которого CLI завершает сессию.                                                                  |
| `core_tools`               | `list[str]`                                                  | Ограничить доступный набор инструментов.                                                                                        |
| `exclude_tools`            | `list[str]`                                                  | Исключить совпадающие инструменты.                                                                                               |
| `allowed_tools`            | `list[str]`                                                  | Разрешить совпадающие инструменты без одобрения callback.                                                                       |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai`   | Режим аутентификации, передаваемый CLI.                                                                                         |
| `include_partial_messages` | `bool`                                                       | Отправлять частичные события потока ассистента.                                                                                 |
| `resume`                   | UUID строка                                                  | Возобновить известную сессию по её идентификатору.                                                                              |
| `continue_session`         | `bool`                                                       | Продолжить последнюю сессию CLI.                                                                                              |
| `session_id`               | UUID строка                                                  | Запустить или привязать сессию к известному идентификатору.                                                                     |
| `timeout`                  | отображение (mapping)                                        | Таймауты в секундах.                                                                                                           |
| `stderr`                   | вызываемый объект                                            | Получает строки stderr CLI.                                                                                                     |

Используйте только один из `resume`, `continue_session` или `session_id` в запросе. SDK вызывает `ValidationError`, если эти опции сессии объединены.

Не поддерживается в v1:

- `mcp_servers`

### Общая конфигурация

```python
options = {
    "cwd": "/path/to/project",
    "path_to_qwen_executable": "qwen",
    "model": "qwen-plus",
    "permission_mode": "plan",
    "max_session_turns": 1,
    "env": {
        "OPENAI_MODEL": "qwen-plus",
    },
    "timeout": {
        "control_request": 60,
        "can_use_tool": 60,
        "stream_close": 60,
    },
}
```

Значения таймаутов в секундах. `env` объединяется поверх окружения родительского процесса, поэтому вам нужно передавать только те переменные, которые должны отличаться для этой сессии SDK. Устанавливайте секреты, такие как `OPENAI_API_KEY`, в родительском окружении или менеджере секретов, а не жёстко кодируйте в исходном коде.

## Обработка разрешений

Когда CLI отправляет управляющий запрос `can_use_tool`, SDK направляет его через `can_use_tool(tool_name, tool_input, context)`.

- Поведение по умолчанию: запретить
- Таймаут по умолчанию: 60 секунд, настраивается через `timeout.can_use_tool`
- Таймаут по умолчанию: запретить
- Исключения в callback: преобразуются в отказ с сообщением об ошибке
- Контекст callback: `cancel_event`, `suggestions` и `blocked_path`
- Контракт callback: `can_use_tool` должен быть асинхронным с 3 позиционными аргументами; `stderr` должен принимать 1 строковый аргумент позиционно

Пример:

```python
import asyncio
from pathlib import Path

from qwen_code_sdk import is_sdk_result_message, query

PROJECT_ROOT = Path("/path/to/project").resolve()


def project_path(tool_name, tool_input):
    key = "path" if tool_name == "list_directory" else "file_path"
    raw_path = tool_input.get(key)
    if not isinstance(raw_path, str) or not raw_path:
        return None

    resolved = (PROJECT_ROOT / raw_path).resolve()
    try:
        resolved.relative_to(PROJECT_ROOT)
    except ValueError:
        return None
    return resolved


async def can_use_tool(tool_name, tool_input, context):
    if tool_name in {"read_file", "list_directory", "write_file"}:
        resolved = project_path(tool_name, tool_input)
        if resolved is None:
            return {
                "behavior": "deny",
                "message": "Only project-local paths are allowed",
            }

        if tool_name == "write_file" and resolved.suffix != ".md":
            return {"behavior": "deny", "message": "Only .md files can be written"}

        return {"behavior": "allow", "updatedInput": tool_input}

    return {
        "behavior": "deny",
        "message": f"{tool_name} is not allowed by this application",
    }


async def main():
    async with query(
        "Update README.md with a short summary.",
        {
            "cwd": str(PROJECT_ROOT),
            "path_to_qwen_executable": "qwen",
            "can_use_tool": can_use_tool,
        },
    ) as result:
        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Если вы не передаёте `can_use_tool`, SDK по умолчанию отклоняет запросы на разрешение.

## Многошаговые сессии

Для многошаговых сессий передайте асинхронный итератор объектов `SDKUserMessage`:

```python
import asyncio

from qwen_code_sdk import SDKUserMessage, is_sdk_result_message, query

SESSION_ID = "123e4567-e89b-12d3-a456-426614174000"


async def prompts():
    first: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "Create a concise project summary.",
        },
        "parent_tool_use_id": None,
    }
    yield first

    second: SDKUserMessage = {
        "type": "user",
        "session_id": SESSION_ID,
        "message": {
            "role": "user",
            "content": "Also list the test files.",
        },
        "parent_tool_use_id": None,
    }
    yield second


async def main():
    async with query(
        prompts(),
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
            "session_id": SESSION_ID,
        },
    ) as result:
        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Все сообщения в асинхронном итераторе должны быть известны заранее. SDK отправляет их последовательно в CLI, но не может передать предыдущий ответ обратно в генератор. Если вам нужен диалоговый обмен, управляйте каждым шагом как отдельным вызовом `query()`.

## Управление во время выполнения

Возвращаемый объект `Query` может управлять запущенным процессом CLI:

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Inspect this repository and explain the test layout.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    ) as result:
        commands = await result.supported_commands()
        print(commands)

        await result.set_permission_mode("plan")
        await result.set_model("qwen-plus")

        async for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Используйте `interrupt()` для отмены текущей операции, `close()` для очистки базового процесса и `get_session_id()` для сохранения идентификатора сессии для последующего использования.

## Возобновление сессии

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # Возобновить известную сессию по её id.
    async with query(
        "Continue from this session.",
        {
            "path_to_qwen_executable": "qwen",
            "resume": "123e4567-e89b-12d3-a456-426614174000",
        },
    ) as known:
        async for message in known:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Чтобы продолжить последнюю сессию, используйте:

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Continue the latest session.",
        {
            "path_to_qwen_executable": "qwen",
            "continue_session": True,
        },
    ) as latest:
        async for message in latest:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

`resume` удобен, когда ваше приложение хранит идентификаторы сессий. `continue_session` делегирует выбор последней сессии CLI.

## Модель ошибок

- `ValidationError`: недопустимые опции, неверные UUID, неподдерживаемые комбинации
- `ControlRequestTimeoutError`: истекло время ожидания инициализации, прерывания или другого управляющего запроса
- `ProcessExitError`: CLI завершился с ненулевым кодом
- `AbortError`: управляющий запрос или сессия были отменены

```python
from qwen_code_sdk import (
    ProcessExitError,
    ValidationError,
    is_sdk_result_message,
    query_sync,
)

try:
    with query_sync("Say hello", {"path_to_qwen_executable": "qwen"}) as result:
        for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Error: {error.get('message', 'Unknown error')}")
                else:
                    print(message.get("result", ""))
except ValidationError as exc:
    print(f"Invalid SDK options: {exc}")
except ProcessExitError as exc:
    print(f"qwen exited with {exc.exit_code}: {exc}")
```

## Устранение неполадок

Если SDK не может запустить CLI:

- Убедитесь, что `qwen --version` работает в целевой среде
- Передайте `path_to_qwen_executable`, если ваша оболочка использует `nvm`, `pyenv` или другую нестандартную настройку PATH
- Используйте `debug=True` или `stderr=print` для вывода stderr CLI во время отладки

Если вызовы управления сессией истекают по таймауту:

- Проверьте, что целевая версия `qwen` поддерживает `--input-format stream-json`
- Увеличьте `timeout.control_request`
- Убедитесь, что скрипт-обёртка не перехватывает stdout/stderr

## Интеграция с репозиторием

Вспомогательные команды на уровне репозитория:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Реальный E2E smoke-тест

Для реальной проверки времени выполнения (фактический процесс `qwen` + вызов реальной модели) запустите из корня репозитория. npm-помощник использует `python3`, поэтому убедитесь, что он разрешается в интерпретатор Python `>=3.10`:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Этот скрипт запускает:

- асинхронный однократный запрос
- асинхронный поток управления (`supported_commands`, обновление режима разрешений)
- синхронный запрос через `query_sync`

Он выводит JSON и возвращает ненулевой код при ошибке.