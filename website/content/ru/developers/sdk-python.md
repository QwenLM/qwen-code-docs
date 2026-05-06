# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` — экспериментальный Python SDK для Qwen Code. Версия v1 работает с
существующим CLI-протоколом `stream-json` и сохраняет минимальную и легко тестируемую
поверхность транспорта.

## Область применения

- Имя пакета: `qwen-code-sdk`
- Путь импорта: `qwen_code_sdk`
- Требования к среде выполнения: Python `>=3.10`
- Зависимость от CLI: в v1 требуется внешний исполняемый файл `qwen`
- Транспорт: только через процессы
- Не входит в v1: транспорт ACP, встроенные в SDK MCP-серверы

## Установка

```bash
pip install qwen-code-sdk
```

Если `qwen` отсутствует в `PATH`, передайте `path_to_qwen_executable` явно.

## Быстрый старт

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main() -> None:
    result = query(
        "Explain the repository structure.",
        {
            "cwd": "/path/to/project",
            "path_to_qwen_executable": "qwen",
        },
    )

    async for message in result:
        if is_sdk_result_message(message):
            print(message["result"])


asyncio.run(main())
```

## Доступный API

### Точки входа верхнего уровня

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

Параметр `prompt` поддерживает:

- `str` для одношаговых запросов
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

Поддерживаемые опции в v1:

- `cwd`
- `model`
- `path_to_qwen_executable`
- `permission_mode`
- `can_use_tool`
- `env`
- `system_prompt`
- `append_system_prompt`
- `debug`
- `max_session_turns`
- `core_tools`
- `exclude_tools`
- `allowed_tools`
- `auth_type`
- `include_partial_messages`
- `resume`
- `continue_session`
- `session_id`
- `timeout`
- `mcp_servers`
- `stderr`

Приоритет аргументов сессии фиксирован:

1. `resume`
2. `continue_session`
3. `session_id`

## Обработка разрешений

Когда CLI отправляет управляющий запрос `can_use_tool`, SDK направляет его через
`can_use_tool(tool_name, tool_input, context)`.

- Поведение по умолчанию: запрет
- Таймаут по умолчанию: 60 секунд
- Действие при таймауте: запрет
- Исключения в колбэке: преобразуются в запрет с сообщением об ошибке
- Контекст колбэка: `cancel_event`, `suggestions` и `blocked_path`
- Контракт колбэка: `can_use_tool` должен быть асинхронным и принимать 3 позиционных аргумента;
  `stderr` должен принимать 1 позиционный строковый аргумент

## Модель ошибок

- `ValidationError`: некорректные опции, невалидные UUID, неподдерживаемые комбинации
- `ControlRequestTimeoutError`: истекло время ожидания инициализации, прерывания или другого управляющего запроса
- `ProcessExitError`: CLI завершился с ненулевым кодом выхода
- `AbortError`: управляющий запрос или сессия были отменены

## Устранение неполадок

Если SDK не может запустить CLI:

- Убедитесь, что `qwen --version` работает в целевой среде
- Передайте `path_to_qwen_executable`, если ваша оболочка использует `nvm`, `pyenv` или другую
  нестандартную настройку `PATH`
- Используйте `debug=True` или `stderr=print`, чтобы выводить stderr CLI при отладке

Если вызовы управления сессией завершаются по таймауту:

- Убедитесь, что целевая версия `qwen` поддерживает `--input-format stream-json`
- Увеличьте `timeout.control_request`
- Убедитесь, что скрипт-обёртка не поглощает stdout/stderr

## Интеграция с репозиторием

Вспомогательные команды на уровне репозитория:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Реальное E2E-тестирование (Smoke)

Для реальной проверки в среде выполнения (фактический процесс `qwen` + реальный вызов модели) запустите команду из
корня репозитория. npm-хелпер использует `python3`, поэтому убедитесь, что он указывает на
интерпретатор Python `>=3.10`:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Этот скрипт выполняет:

- асинхронный одношаговый запрос
- асинхронный управляющий поток (`supported_commands`, обновление режима разрешений)
- синхронный запрос `query_sync`

Скрипт выводит JSON и возвращает ненулевой код при ошибке.