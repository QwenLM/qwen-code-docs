---
description: "Integrieren Sie KI-Coding mit dem Qwen Code Python SDK. Lernen Sie Installation, Authentifizierung, Beispiele und Agent Workflows für Python-Projekte."
---

# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` ist ein experimentelles Python SDK für Qwen Code. v1 nutzt das bestehende `stream-json` CLI-Protokoll und hält die Transportebene klein und testbar.

## Umfang

- Paketname: `qwen-code-sdk`
- Import-Pfad: `qwen_code_sdk`
- Laufzeitanforderung: Python `>=3.10`
- CLI-Abhängigkeit: In v1 ist eine externe `qwen`-Executable erforderlich
- Transport-Umfang: Ausschließlich Prozess-Transport
- Nicht in v1 enthalten: ACP-Transport, SDK-eingebettete MCP-Server

## Installation

```bash
pip install qwen-code-sdk
```

Falls `qwen` nicht im `PATH` liegt, übergib `path_to_qwen_executable` explizit.

## Schnellstart

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

## API-Oberfläche

### Top-Level-Einstiegspunkte

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` unterstützt entweder:

- `str` für Single-Turn-Anfragen
- `AsyncIterable[SDKUserMessage]` für Multi-Turn-Streams

### `Query`

- Async-Iterable über SDK-Nachrichten
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

In v1 unterstützte Optionen:

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

Die Priorität der Session-Argumente ist festgelegt als:

1. `resume`
2. `continue_session`
3. `session_id`

## Berechtigungsverwaltung

Wenn die CLI eine `can_use_tool`-Control-Request sendet, leitet das SDK diese an `can_use_tool(tool_name, tool_input, context)` weiter.

- Standardverhalten: Ablehnen
- Standard-Timeout: 60 Sekunden
- Fallback bei Timeout: Ablehnen
- Callback-Exceptions: Werden in eine Ablehnung mit Fehlermeldung umgewandelt
- Callback-Kontext: `cancel_event`, `suggestions` und `blocked_path`
- Callback-Vertrag: `can_use_tool` muss async mit 3 positional Arguments sein; `stderr` muss 1 positional String-Argument akzeptieren

## Fehlermodell

- `ValidationError`: Ungültige Optionen, ungültige UUIDs, nicht unterstützte Kombinationen
- `ControlRequestTimeoutError`: Timeout bei Initialize-, Interrupt- oder anderen Control-Requests
- `ProcessExitError`: CLI wurde mit Exit-Code ungleich null beendet
- `AbortError`: Control-Request oder Session wurde abgebrochen

## Fehlerbehebung

Falls das SDK die CLI nicht starten kann:

- Prüfe, ob `qwen --version` in der Zielumgebung funktioniert
- Übergib `path_to_qwen_executable`, falls deine Shell `nvm`, `pyenv` oder ein anderes nicht-standardmäßiges PATH-Setup verwendet
- Verwende `debug=True` oder `stderr=print`, um CLI-stderr während des Debuggings auszugeben

Falls Session-Control-Calls ein Timeout haben:

- Stelle sicher, dass die Ziel-`qwen`-Version `--input-format stream-json` unterstützt
- Erhöhe `timeout.control_request`
- Prüfe, ob kein Wrapper-Skript stdout/stderr verschluckt

## Repository-Integration

Helfer-Befehle auf Repository-Ebene:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Echter E2E-Smoke-Test

Für einen echten Laufzeit-Check (tatsächlicher `qwen`-Prozess + echter Model-Call) führe den Befehl vom Repository-Root aus. Der npm-Helfer nutzt `python3`, stelle also sicher, dass er auf einen Python `>=3.10`-Interpreter verweist:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Dieses Skript führt Folgendes aus:

- Async-Single-Turn-Query
- Async-Control-Flow (`supported_commands`, Permission-Mode-Updates)
- Sync-`query_sync`-Query

Es gibt JSON aus und beendet sich bei einem Fehler mit einem Exit-Code ungleich null.