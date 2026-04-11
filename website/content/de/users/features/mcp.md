# Connect Qwen Code to tools via MCP

Qwen Code kann über das [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) mit externen Tools und Datenquellen verbunden werden. MCP-Server gewähren Qwen Code Zugriff auf deine Tools, Datenbanken und APIs.

## What you can do with MCP

Mit verbundenen MCP-Servern kannst du Qwen Code bitten:

- Mit Dateien und Repos zu arbeiten (lesen/suchen/schreiben, abhängig von den aktivierten Tools)
- Datenbanken abzufragen (Schema-Inspektion, Queries, Reporting)
- Interne Dienste zu integrieren (deine APIs als MCP-Tools kapseln)
- Workflows zu automatisieren (wiederkehrende Aufgaben als Tools/Prompts bereitstellen)

> [!tip]
>
> Wenn du den „einen Befehl für den Einstieg“ suchst, springe direkt zu [Schnellstart](#quick-start).

## Quick start

Qwen Code lädt MCP-Server aus `mcpServers` in deiner `settings.json`. Du kannst Server auf zwei Arten konfigurieren:

- Durch direktes Bearbeiten von `settings.json`
- Durch Verwendung von `qwen mcp`-Befehlen (siehe [CLI-Referenz](#qwen-mcp-cli))

### Add your first server

1. Füge einen Server hinzu (Beispiel: entfernter HTTP-MCP-Server):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Öffne den MCP-Verwaltungsdialog, um Server anzuzeigen und zu verwalten:

```bash
qwen mcp
```

3. Starte Qwen Code im selben Projekt neu (oder starte es, falls es noch nicht läuft) und fordere das Modell dann auf, Tools von diesem Server zu verwenden.

## Where configuration is stored (scopes)

Die meisten Nutzer benötigen nur diese beiden Scopes:

- **Projekt-Scope (Standard)**: `.qwen/settings.json` im Projektstammverzeichnis
- **User-Scope**: `~/.qwen/settings.json` für alle Projekte auf deinem Rechner

In den User-Scope schreiben:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Für erweiterte Konfigurationsebenen (System-Standards/Systemeinstellungen und Vorrangregeln) siehe [Einstellungen](../configuration/settings).

## Configure servers

### Choose a transport

| Transport | Wann verwenden | JSON-Feld(er) |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Empfohlen für entfernte Dienste; funktioniert gut für Cloud-MCP-Server | `httpUrl` (+ optional `headers`)            |
| `sse`     | Legacy-/veraltete Server, die nur Server-Sent Events unterstützen    | `url` (+ optional `headers`)                |
| `stdio`   | Lokaler Prozess (Skripte, CLIs, Docker) auf deinem Rechner             | `command`, `args` (+ optional `cwd`, `env`) |

> [!note]
>
> Wenn ein Server beides unterstützt, bevorzuge **HTTP** gegenüber **SSE**.

### Configure via `settings.json` vs `qwen mcp add`

Beide Ansätze erzeugen dieselben `mcpServers`-Einträge in deiner `settings.json` – verwende die Methode, die dir besser gefällt.

#### Stdio server (local process)

JSON (`.qwen/settings.json`):

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

CLI (schreibt standardmäßig in den Projekt-Scope):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP server (remote streamable HTTP)

JSON:

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token"
      },
      "timeout": 5000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### SSE server (remote Server-Sent Events)

JSON:

```json
{
  "mcpServers": {
    "sseServer": {
      "url": "http://localhost:8080/sse",
      "timeout": 30000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## Safety and control

### Trust (skip confirmations)

- **Server-Vertrauen** (`trust: true`): Umgeht Bestätigungsabfragen für diesen Server (sparsam verwenden).

### Tool filtering (allow/deny tools per server)

Verwende `includeTools` / `excludeTools`, um die von einem Server bereitgestellten Tools einzuschränken (aus Sicht von Qwen Code).

Beispiel: Nur wenige Tools einbeziehen:

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      "timeout": 30000
    }
  }
}
```

### Global allow/deny lists

Das `mcp`-Objekt in deiner `settings.json` definiert globale Regeln für alle MCP-Server:

- `mcp.allowed`: Allow-Liste von MCP-Servernamen (Schlüssel in `mcpServers`)
- `mcp.excluded`: Deny-Liste von MCP-Servernamen

Beispiel:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## Troubleshooting

- **Server zeigt „Disconnected“ in `qwen mcp list` an**: Überprüfe, ob die URL/der Befehl korrekt ist, und erhöhe dann `timeout`.
- **Stdio-Server startet nicht**: Verwende einen absoluten `command`-Pfad und überprüfe `cwd`/`env` erneut.
- **Umgebungsvariablen in JSON werden nicht aufgelöst**: Stelle sicher, dass sie in der Umgebung existieren, in der Qwen Code ausgeführt wird (Shell- und GUI-App-Umgebungen können sich unterscheiden).

## Reference

### `settings.json` structure

#### Server-specific configuration (`mcpServers`)

Füge deiner `settings.json`-Datei ein `mcpServers`-Objekt hinzu:

```json
// ... file contains other config objects
{
  "mcpServers": {
    "serverName": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-directory",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Konfigurationseigenschaften:

Erforderlich (eine der folgenden):

| Eigenschaft  | Beschreibung                                            |
| --------- | ------------------------------------------------------ |
| `command` | Pfad zur ausführbaren Datei für den Stdio-Transport             |
| `url`     | SSE-Endpunkt-URL (z. B. `"http://localhost:8080/sse"`) |
| `httpUrl` | HTTP-Streaming-Endpunkt-URL                            |

Optional:

| Eigenschaft               | Typ/Standardwert                 | Beschreibung                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Befehlszeilenargumente für den Stdio-Transport                                                                                                                                                                                                                        |
| `headers`              | object                       | Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`                                                                                                                                                                                                                 |
| `env`                  | object                       | Umgebungsvariablen für den Serverprozess. Werte können Umgebungsvariablen mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren                                                                                                                                |
| `cwd`                  | string                       | Arbeitsverzeichnis für den Stdio-Transport                                                                                                                                                                                                                             |
| `timeout`              | number<br>(Standard: 600.000) | Request-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)                                                                                                                                                                                                 |
| `trust`                | boolean<br>(Standard: false)  | Wenn `true`, werden alle Tool-Aufruf-Bestätigungen für diesen Server umgangen (Standard: `false`)                                                                                                                                                                              |
| `includeTools`         | array                        | Liste der Tool-Namen, die von diesem MCP-Server einbezogen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.                                       |
| `excludeTools`         | array                        | Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgeführten Tools stehen dem Modell nicht zur Verfügung, auch wenn sie vom Server bereitgestellt werden.<br>Hinweis: `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen. |
| `targetAudience`       | string                       | Die OAuth-Client-ID, die auf der IAP-geschützten Anwendung, auf die du zugreifen möchtest, auf der Allowlist steht. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                         |
| `targetServiceAccount` | string                       | Die E-Mail-Adresse des Google Cloud Service Accounts, der imitiert werden soll. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### Manage MCP servers with `qwen mcp`

Du kannst MCP-Server immer durch manuelles Bearbeiten von `settings.json` konfigurieren, aber die CLI ist in der Regel schneller.

#### Adding a server (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option     | Beschreibung                                                         | Standard            | Beispiel                                   |
| ------------------- | ------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| `<name>`            | Ein eindeutiger Name für den Server.                                       | —                  | `example-server`                          |
| `<commandOrUrl>`    | Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`). | —                  | `/usr/bin/python` oder `http://localhost:8` |
| `[args...]`         | Optionale Argumente für einen `stdio`-Befehl.                           | —                  | `--port 5000`                             |
| `-s`, `--scope`     | Konfigurations-Scope (user oder project).                              | `project`          | `-s user`                                 |
| `-t`, `--transport` | Transporttyp (`stdio`, `sse`, `http`).                            | `stdio`            | `-t sse`                                  |
| `-e`, `--env`       | Umgebungsvariablen festlegen.                                          | —                  | `-e KEY=value`                            |
| `-H`, `--header`    | HTTP-Header für SSE- und HTTP-Transporte festlegen.                       | —                  | `-H "X-Api-Key: abc123"`                  |
| `--timeout`         | Verbindungs-Timeout in Millisekunden festlegen.                             | —                  | `--timeout 30000`                         |
| `--trust`           | Dem Server vertrauen (alle Tool-Aufruf-Bestätigungsabfragen umgehen).       | — (`false`)        | `--trust`                                 |
| `--description`     | Beschreibung für den Server festlegen.                                 | —                  | `--description "Local tools"`             |
| `--include-tools`   | Eine durch Kommas getrennte Liste der einzubeziehenden Tools.                         | alle Tools einbezogen | `--include-tools mytool,othertool`        |
| `--exclude-tools`   | Eine durch Kommas getrennte Liste der auszuschließenden Tools.                         | keine               | `--exclude-tools mytool`                  |

#### Removing a server (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```