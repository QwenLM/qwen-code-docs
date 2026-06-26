# Python SDK

## `qwen-code-sdk`

`qwen-code-sdk` ist ein experimentelles Python-SDK für Qwen Code. Version 1 zielt auf das bestehende `stream-json` CLI-Protokoll ab und hält die Transportoberfläche klein und testbar.

## Umfang

- Paketname: `qwen-code-sdk`
- Importpfad: `qwen_code_sdk`
- Laufzeitvoraussetzung: Python `>=3.10`
- CLI-Abhängigkeit: In v1 wird ein externes `qwen`-Programm benötigt
- Transportumfang: Nur Prozess-Transport
- Nicht in v1 enthalten: ACP-Transport, SDK-eingebettete MCP-Server

## Installation

```bash
pip install qwen-code-sdk
```

Für Vorabversionen:

```bash
pip install --pre qwen-code-sdk
```

Falls `qwen` nicht im `PATH` ist, geben Sie `path_to_qwen_executable` explizit an.

Stellen Sie vor dem Schreiben von SDK-Code sicher, dass die CLI in derselben Shell funktioniert:

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

`asyncio.run()` eignet sich für eigenständige Skripte. Wenn Ihre Anwendung bereits eine Ereignisschleife ausführt, z. B. Jupyter, FastAPI oder pytest-asyncio, rufen Sie stattdessen `await main()` auf.

## Synchrone Nutzung

Verwenden Sie `query_sync`, wenn Ihre Host-Anwendung nicht asynchron ist:

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
- `AsyncIterable[SDKUserMessage]` für mehrteilige Streams

### `Query`

- Asynchron iterierbar über SDK-Nachrichten
- `close()`
- `interrupt()`
- `set_model(model)`
- `set_permission_mode(mode)`
- `supported_commands()`
- `mcp_server_status()`
- `get_session_id()`
- `is_closed()`

### `QueryOptions`

| Option                     | Typ / Werte                                                  | Beschreibung                                                                                                           |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `cwd`                      | `str`                                                        | Arbeitsverzeichnis für den CLI-Prozess.                                                                                |
| `model`                    | `str`                                                        | Modell-Override für diese SDK-Sitzung.                                                                                 |
| `path_to_qwen_executable`  | `str`                                                        | `qwen`, ein expliziter Binärpfad oder ein `.js`-CLI-Bundle.                                                            |
| `permission_mode`          | `default`, `plan`, `auto-edit`, `yolo`                       | Genehmigungsmodus für Werkzeugausführung. `yolo` genehmigt alle Werkzeuge automatisch; nur in vertrauenswürdigen oder Sandbox-Umgebungen verwenden. |
| `can_use_tool`             | asynchroner Callback                                         | Benutzerdefinierter Genehmigungs-Callback für Werkzeuganfragen.                                                        |
| `env`                      | `dict[str, str]`                                             | Zusätzliche Umgebungsvariablen, die an den CLI-Prozess übergeben werden.                                                |
| `system_prompt`            | `str`                                                        | Überschreibt den System-Prompt.                                                                                        |
| `append_system_prompt`     | `str`                                                        | Hängt zusätzliche Anweisungen an den System-Prompt an.                                                                 |
| `debug`                    | `bool`                                                       | Leitet CLI-stderr an stderr weiter, wenn kein `stderr`-Hook vorhanden ist.                                             |
| `max_session_turns`        | `int`                                                        | Maximale Anzahl von Runden, bevor die CLI die Sitzung beendet.                                                         |
| `core_tools`               | `list[str]`                                                  | Beschränkt den verfügbaren Werkzeugsatz.                                                                               |
| `exclude_tools`            | `list[str]`                                                  | Schließt passende Werkzeuge aus.                                                                                       |
| `allowed_tools`            | `list[str]`                                                  | Erlaubt passende Werkzeuge ohne Callback-Genehmigung.                                                                  |
| `auth_type`                | `openai`, `anthropic`, `qwen-oauth`, `gemini`, `vertex-ai`   | Authentifizierungsmodus, der an die CLI übergeben wird.                                                                |
| `include_partial_messages` | `bool`                                                       | Sendet partielle Assistant-Stream-Ereignisse.                                                                          |
| `resume`                   | UUID-String                                                  | Setzt eine bekannte Sitzungs-ID fort.                                                                                  |
| `continue_session`         | `bool`                                                       | Setzt die letzte CLI-Sitzung fort.                                                                                     |
| `session_id`               | UUID-String                                                  | Startet eine Sitzung oder ordnet sie einer bekannten ID zu.                                                            |
| `timeout`                  | Mapping                                                      | Timeouts in Sekunden.                                                                                                  |
| `stderr`                   | aufrufbar                                                    | Empfängt CLI-stderr-Zeilen.                                                                                            |
Verwenden Sie nur eine von `resume`, `continue_session` oder `session_id` in einer Anfrage. Das SDK löst `ValidationError` aus, wenn diese Sitzungsoptionen kombiniert werden.

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

Timeout-Werte sind in Sekunden. `env` wird über die Umgebung des übergeordneten Prozesses gelegt, daher müssen Sie nur Variablen übergeben, die für diese SDK-Sitzung abweichen sollen. Legen Sie Geheimnisse wie `OPENAI_API_KEY` in der übergeordneten Umgebung oder einem Secrets-Manager fest, anstatt sie fest im Quellcode zu codieren.

## Berechtigungsbehandlung

Wenn die CLI eine `can_use_tool`-Kontrollanfrage ausgibt, leitet das SDK sie durch `can_use_tool(tool_name, tool_input, context)`.

- Standardverhalten: verweigern
- Standard-Timeout: 60 Sekunden, konfigurierbar mit `timeout.can_use_tool`
- Timeout-Fallback: verweigern
- Callback-Ausnahmen: werden mit einer Fehlermeldung in eine Verweigerung umgewandelt
- Callback-Kontext: `cancel_event`, `suggestions` und `blocked_path`
- Callback-Vertrag: `can_use_tool` muss asynchron mit 3 Positionsargumenten sein; `stderr` muss 1 Positionsargument vom Typ String akzeptieren

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

Wenn Sie `can_use_tool` nicht übergeben, verweigert das SDK standardmäßig Berechtigungsanfragen.

## Sitzungen mit mehreren Durchgängen

Für Sitzungen mit mehreren Durchgängen übergeben Sie ein asynchrones Iterable von `SDKUserMessage`-Objekten:

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

Alle Nachrichten im asynchronen Iterable müssen im Voraus bekannt sein. Das SDK sendet sie sequenziell an die CLI, kann aber keine vorherige Antwort zurück in den Generator einspeisen. Wenn Sie einen Konversationsablauf mit abwechselnden Beiträgen benötigen, verwalten Sie jeden Durchgang als separaten `query()`-Aufruf.

## Laufzeitsteuerung

Das zurückgegebene `Query`-Objekt kann den laufenden CLI-Prozess steuern:
```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Untersuche dieses Repository und erkläre die Teststruktur.",
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
                    print(f"Fehler: {error.get('message', 'Unbekannter Fehler')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Verwende `interrupt()`, um den aktuellen Vorgang abzubrechen, `close()`, um den
zugrunde liegenden Prozess zu bereinigen, und `get_session_id()`, um eine
Sitzungs-ID für später zu speichern.

## Sitzung fortsetzen

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    # Eine bekannte Sitzung anhand ihrer ID fortsetzen.
    async with query(
        "Setze diese Sitzung fort.",
        {
            "path_to_qwen_executable": "qwen",
            "resume": "123e4567-e89b-12d3-a456-426614174000",
        },
    ) as known:
        async for message in known:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Fehler: {error.get('message', 'Unbekannter Fehler')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

Die letzte Sitzung stattdessen fortsetzen:

```python
import asyncio

from qwen_code_sdk import is_sdk_result_message, query


async def main():
    async with query(
        "Setze die letzte Sitzung fort.",
        {
            "path_to_qwen_executable": "qwen",
            "continue_session": True,
        },
    ) as latest:
        async for message in latest:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Fehler: {error.get('message', 'Unbekannter Fehler')}")
                else:
                    print(message.get("result", ""))


asyncio.run(main())
```

`resume` ist nützlich, wenn deine Anwendung Sitzungs-IDs speichert.
`continue_session` delegiert die Auswahl der letzten Sitzung an die CLI.

## Fehlermodell

- `ValidationError`: ungültige Optionen, ungültige UUIDs, nicht unterstützte Kombinationen
- `ControlRequestTimeoutError`: Initialisierung, Unterbrechung oder andere Steuerungsanfrage
  ist abgelaufen
- `ProcessExitError`: CLI wurde mit einem Nicht-Null-Exit beendet
- `AbortError`: Steuerungsanfrage oder Sitzung wurde abgebrochen

```python
from qwen_code_sdk import (
    ProcessExitError,
    ValidationError,
    is_sdk_result_message,
    query_sync,
)

try:
    with query_sync("Sag Hallo", {"path_to_qwen_executable": "qwen"}) as result:
        for message in result:
            if is_sdk_result_message(message):
                if message.get("is_error"):
                    error = message.get("error") or {}
                    print(f"Fehler: {error.get('message', 'Unbekannter Fehler')}")
                else:
                    print(message.get("result", ""))
except ValidationError as exc:
    print(f"Ungültige SDK-Optionen: {exc}")
except ProcessExitError as exc:
    print(f"qwen wurde mit Exit-Code {exc.exit_code} beendet: {exc}")
```

## Fehlerbehebung

Wenn das SDK die CLI nicht starten kann:

- Überprüfe, ob `qwen --version` in der Zielumgebung funktioniert
- Übergib `path_to_qwen_executable`, wenn deine Shell `nvm`, `pyenv` oder eine andere
  nicht standardmäßige PATH-Konfiguration verwendet
- Verwende `debug=True` oder `stderr=print`, um CLI-Stderr während der Fehlersuche auszugeben

Wenn Sitzungssteuerungsaufrufe ein Zeitlimit überschreiten:

- Überprüfe, ob die Ziel-`qwen`-Version `--input-format stream-json` unterstützt
- Erhöhe `timeout.control_request`
- Stelle sicher, dass kein Wrapper-Script stdout/stderr verschluckt

## Repository-Integration

Hilfsbefehle auf Repository-Ebene:

- `npm run test:sdk:python`
- `npm run lint:sdk:python`
- `npm run typecheck:sdk:python`
- `npm run smoke:sdk:python -- --qwen qwen`

## Echter E2E-Smoketest

Für eine echte Laufzeitprüfung (tatsächlicher `qwen`-Prozess + echter Modellaufruf)
vom Repository-Stammverzeichnis ausführen. Der npm-Helfer verwendet `python3`,
also stelle sicher, dass es auf einen Python-Interpreter `>=3.10` verweist:

```bash
npm run smoke:sdk:python -- --qwen qwen
```

Dieses Skript führt aus:

- asynchrone Single-Turn-Abfrage
- asynchrone Steuerungsabläufe (`supported_commands`, Berechtigungsmodusaktualisierungen)
- synchrone `query_sync`-Abfrage

Es gibt JSON aus und liefert einen Nicht-Null-Exit bei Fehlschlag.
