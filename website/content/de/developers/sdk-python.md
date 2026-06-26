# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` ist ein experimentelles Python SDK für Qwen Code. v1 zielt auf das bestehende `stream-json` CLI-Protokoll ab und hält die Transportschnittstelle klein und testbar.

## Umfang

- Paketname: `qwen-code-sdk`
- Importpfad: `qwen_code_sdk`
- Laufzeitanforderung: Python `>=3.10`
- CLI-Abhängigkeit: In v1 wird die externe `qwen`-Ausführungsdatei benötigt
- Transportumfang: nur Prozesstransport
- Nicht enthalten in v1: ACP-Transport, SDK-eingebettete MCP-Server

## Installation

```bash
pip install qwen-code-sdk
```

Für Vorabversionen:

```bash
pip install --pre qwen-code-sdk
```

Wenn `qwen` nicht im `PATH` ist, übergebe `path_to_qwen_executable` explizit.

Bevor du SDK-Code schreibst, stelle sicher, dass die CLI in derselben Shell funktioniert:

```bash
qwen --version
```

## Schnellstart

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

`asyncio.run()` ist für eigenständige Skripte geeignet. Wenn deine Anwendung bereits eine Ereignisschleife ausführt, wie Jupyter, FastAPI oder pytest-asyncio, rufe stattdessen `await main()` auf.

## Synchrone Nutzung

Verwende `query_sync`, wenn deine Host-Anwendung nicht asynchron ist:

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

## API-Oberfläche

### Top-Level-Einstiegspunkte

- `query(prompt, options=None) -> Query`
- `query_sync(prompt, options=None) -> SyncQuery`

`prompt` unterstützt entweder:

- `str` für Einzelanfragen
- `AsyncIterable[SDKUserMessage]` für Mehrfachdurchläufe (Multi-Turn Streams)

### `Query`

- Async iterable über SDK-Nachrichten
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| Option                     | Typ / Werte                                                 | Beschreibung                                                                                                     |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `cwd`                      | `str`                                                       | Arbeitsverzeichnis für den CLI-Prozess.                                                                          |
| `model`                    | `str`                                                       | Modellüberschreibung für diese SDK-Sitzung.                                                                      |
| `path_to_qwen_executable`  | `str`                                                       | `qwen`, ein expliziter Binärpfad oder ein `.js` CLI-Bundle.                                                       |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                      | Genehmigungsmodus für Tool-Ausführung. `yolo` genehmigt alle Tools automatisch; verwende es nur in vertrauenswürdigen oder isolierten Umgebungen. |
| `can_use_tool`             | async callback                                              | Benutzerdefinierter Berechtigungs-Callback für Tool-Anfragen.                                                     |
| `env`                      | `dict[str, str]`                                            | Zusätzliche Umgebungsvariablen, die an den CLI-Prozess weitergegeben werden.                                      |
| `system_prompt`            | `str`                                                       | System-Prompt überschreiben.                                                                                      |
| `append_system_prompt`     | `str`                                                       | Zusätzliche Anweisungen an den System-Prompt anhängen.                                                           |
| `debug`                    | `bool`                                                      | Leite CLI stderr an stderr weiter, wenn kein `stderr`-Hook existiert.                                            |
| `max_session_turns`        | `int`                                                       | Maximale Durchläufe, bevor die CLI die Sitzung beendet.                                                          |
| `core_tools`               | `list[str]`                                                 | Verfügbaren Tool-Satz einschränken.                                                                               |
| `exclude_tools`            | `list[str]`                                                 | Übereinstimmende Tools ausschließen.                                                                             |
| `allowed_tools`            | `list[str]`                                                 | Übereinstimmende Tools ohne Callback-Genehmigung zulassen.                                                       |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai` | Authentifizierungsmodus, der an die CLI übergeben wird.                                                          |
| `include_partial_messages` | `bool`                                                      | Teilweise Assistant-Stream-Ereignisse ausgeben.                                                                  |
| `resume`                   | UUID-String                                                 | Eine bekannte Sitzungs-ID fortsetzen.                                                                            |
| `continue_session`         | `bool`                                                      | Die letzte CLI-Sitzung fortsetzen.                                                                               |
| `session_id`               | UUID-String                                                 | Eine Sitzung mit einer bekannten ID starten oder verknüpfen.                                                     |
| `timeout`                  | mapping                                                     | Timeouts in Sekunden.                                                                                             |
| `stderr`                   | callable                                                    | Empfängt CLI-stderr-Zeilen.                                                                                      |

Verwende nur eine der Optionen `resume`, `continue_session` oder `session_id` in einer Anfrage. Das SDK wirft einen `ValidationError`, wenn diese Sitzungsoptionen kombiniert werden.

Nicht unterstützt in v1:

- `mcp_servers`

### Allgemeine Konfiguration

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

Timeout-Werte sind in Sekunden. `env` wird über die Umgebung des übergeordneten Prozesses gelegt, sodass du nur Variablen übergeben musst, die sich für diese SDK-Sitzung unterscheiden sollen. Setze Geheimnisse wie `OPENAI_API_KEY` in der übergeordneten Umgebung oder einem Secrets Manager, anstatt sie im Quellcode fest zu codieren.

## Berechtigungsverwaltung

Wenn die CLI eine `can_use_tool`-Steuerungsanfrage ausgibt, leitet das SDK sie durch `can_use_tool(tool_name, tool_input, context)`.

- Standardverhalten: ablehnen
- Standard-Timeout: 60 Sekunden, konfigurierbar mit `timeout.can_use_tool`
- Timeout-Fallback: ablehnen
- Callback-Ausnahmen: in Ablehnung mit Fehlermeldung umgewandelt
- Callback-Kontext: `cancel_event`, `suggestions` und `blocked_path`
- Callback-Vertrag: `can_use_tool` muss async mit 3 Positionsargumenten sein; `stderr` muss 1 Positions-String-Argument akzeptieren

Beispiel:

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

Wenn du kein `can_use_tool` übergibst, lehnt das SDK standardmäßig Berechtigungsanfragen ab.

## Multi-Turn-Sitzungen

Für Multi-Turn-Sitzungen übergib ein asynchrones Iterable von `SDKUserMessage`-Objekten:

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

Alle Nachrichten im asynchronen Iterable müssen im Voraus bekannt sein. Das SDK sendet sie sequenziell an die CLI, kann aber keine vorherige Antwort in den Generator zurückführen. Wenn du einen konversationellen Wechsel benötigst, verwalte jede Runde als separaten `query()`-Aufruf.

## Laufzeitsteuerung

Das zurückgegebene `Query`-Objekt kann den laufenden CLI-Prozess steuern:

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

Verwende `interrupt()`, um den aktuellen Vorgang abzubrechen, `close()`, um den zugrunde liegenden Prozess zu bereinigen, und `get_session_id()`, um eine Sitzungs-ID für später zu speichern.

## Sitzungsfortsetzung

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # Resume a known session by its id.
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

Um stattdessen die letzte Sitzung fortzusetzen:

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

`resume` ist nützlich, wenn deine Anwendung Sitzungs-IDs speichert. `continue_session` delegiert die Auswahl der letzten Sitzung an die CLI.

## Fehlermodell

- `ValidationError`: ungültige Optionen, ungültige UUIDs, nicht unterstützte Kombinationen
- `ControlRequestTimeoutError`: Initialisierungs-, Unterbrechungs- oder andere Steuerungsanfrage ist abgelaufen
- `ProcessExitError`: CLI wurde mit einem Nicht-Null-Exit-Code beendet
- `AbortError`: Steuerungsanfrage oder Sitzung wurde abgebrochen

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

## Fehlerbehebung

Wenn das SDK die CLI nicht starten kann:

- Überprüfe, ob `qwen --version` in der Zielumgebung funktioniert
- Übergib `path_to_qwen_executable`, wenn deine Shell `nvm`, `pyenv` oder andere nicht standardmäßige PATH-Einstellungen verwendet
- Verwende `debug=True` oder `stderr=print`, um während der Fehlersuche CLI-stderr sichtbar zu machen

Wenn Sitzungssteuerungsaufrufe ein Timeout auslösen:

- Überprüfe, ob die Zielversion von `qwen` `--input-format stream-json` unterstützt
- Erhöhe `timeout.control_request`
- Vergewissere dich, dass kein Wrapper-Skript stdout/stderr schluckt

## Repository-Integration

Hilfsbefehle auf Repository-Ebene:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Echter E2E-Smoke-Test

Für eine echte Laufzeitprüfung (tatsächlicher `qwen`-Prozess + echter Modellaufruf) führe vom Repository-Stammverzeichnis aus. Der npm-Helfer verwendet `python3`, stelle also sicher, dass er auf einen Python-`>=3.10`-Interpreter verweist:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Dieses Skript führt aus:

- asynchrone Einzelanfrage
- asynchroner Kontrollfluss (`supported_commands`, Berechtigungsmodus-Updates)
- synchrone `query_sync`-Abfrage

Es gibt JSON aus und gibt bei Fehlern einen von Null abweichenden Wert zurück.