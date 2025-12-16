# Verbinde Qwen Code über MCP mit Tools

Qwen Code kann sich über das [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) mit externen Tools und Datenquellen verbinden. MCP-Server geben Qwen Code Zugriff auf deine Tools, Datenbanken und APIs.

## Was du mit MCP machen kannst

Wenn MCP-Server verbunden sind, kannst du Qwen Code bitten:

- Mit Dateien und Repositories zu arbeiten (Lesen/Suchen/Schreiben, je nach aktivierten Tools)
- Datenbanken abzufragen (Schema-Inspektion, Abfragen, Berichte)
- Interne Dienste zu integrieren (Eigene APIs als MCP-Tools bereitstellen)
- Workflows zu automatisieren (Wiederholbare Aufgaben als Tools/Prompts bereitstellen)

> [!tip]
> Wenn du direkt loslegen willst, springe zum [Schnellstart](#schnellstart).

## Schnellstart

Qwen Code lädt MCP-Server aus dem Eintrag `mcpServers` in deiner `settings.json`. Du kannst Server konfigurieren, indem du entweder:

- Die `settings.json` direkt bearbeitest
- Die `qwen mcp` Befehle verwendest (siehe [CLI Referenz](#qwen-mcp-cli))

### Fügen Sie Ihren ersten Server hinzu

1. Fügen Sie einen Server hinzu (Beispiel: Remote-HTTP-MCP-Server):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Überprüfen Sie, ob er angezeigt wird:

```bash
qwen mcp list
```

3. Starten Sie Qwen Code im selben Projekt neu (oder starten Sie es, falls es noch nicht läuft), und bitten Sie dann das Modell, Tools von diesem Server zu verwenden.

## Wo die Konfiguration gespeichert wird (Bereiche)

Die meisten Benutzer benötigen nur diese zwei Bereiche:

- **Projektbereich (Standard)**: `.qwen/settings.json` im Stammverzeichnis Ihres Projekts
- **Benutzerbereich**: `~/.qwen/settings.json` für alle Projekte auf Ihrem Rechner

In den Benutzerbereich schreiben:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
> Für fortgeschrittene Konfigurationsebenen (Systemstandards/Systemeinstellungen und Vorrangregeln) siehe [Einstellungen](../users/configuration/settings).

## Server konfigurieren

### Wähle einen Transport

| Transport | Anwendungsbereich                                                  | JSON-Feld(er)                              |
| --------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `http`    | Empfohlen für entfernte Dienste; funktioniert gut mit Cloud-MCP-Servern | `httpUrl` (+ optionale `headers`)          |
| `sse`     | Veraltete Server, die nur Server-Sent Events unterstützen           | `url` (+ optionale `headers`)              |
| `stdio`   | Lokaler Prozess (Skripte, CLIs, Docker) auf deinem Rechner         | `command`, `args` (+ optionale `cwd`, `env`) |

> [!note]
> Wenn ein Server beide unterstützt, bevorzuge **HTTP** gegenüber **SSE**.

### Konfiguration über `settings.json` vs `qwen mcp add`

Beide Ansätze erzeugen dieselben `mcpServers`-Einträge in deiner `settings.json`—verwende denjenigen, den du vorziehst.

#### Stdio-Server (lokaler Prozess)

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

CLI (schreibt standardmäßig in den Projektbereich):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP-Server (Remote Streamable HTTP)

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

#### SSE-Server (Remote Server-Sent Events)

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

## Sicherheit und Kontrolle

### Vertrauen (Bestätigungen überspringen)

- **Server-Vertrauen** (`trust: true`): umgeht Bestätigungsabfragen für diesen Server (sparsam verwenden).

### Tool-Filterung (Tools pro Server zulassen/ablehnen)

Verwende `includeTools` / `excludeTools`, um die von einem Server bereitgestellten Tools einzuschränken (aus der Sicht von Qwen Code).

Beispiel: Nur einige wenige Tools zulassen:

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

### Globale Zulassungs-/Ablehnungslisten

Das `mcp`-Objekt in deiner `settings.json` definiert globale Regeln für alle MCP-Server:

- `mcp.allowed`: Liste der erlaubten MCP-Server-Namen (Schlüssel in `mcpServers`)
- `mcp.excluded`: Liste der abgelehnten MCP-Server-Namen

Beispiel:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## Fehlerbehebung

- **Server zeigt „Disconnected“ in `qwen mcp list`**: Überprüfen Sie, ob die URL/das Kommando korrekt ist, und erhöhen Sie dann den `timeout`-Wert.
- **Stdio-Server startet nicht**: Verwenden Sie einen absoluten Pfad für das `command`, und prüfen Sie nochmals `cwd`/`env`.
- **Umgebungsvariablen in JSON werden nicht aufgelöst**: Stellen Sie sicher, dass diese in der Umgebung vorhanden sind, in der Qwen Code ausgeführt wird (Shell- gegenüber GUI-Anwendungsumgebungen können unterschiedlich sein).

## Referenz

### Struktur von `settings.json`

#### Server-spezifische Konfiguration (`mcpServers`)

Fügen Sie ein `mcpServers`-Objekt zu Ihrer `settings.json`-Datei hinzu:

```json
// ... Datei enthält andere Konfigurationsobjekte
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

| Eigenschaft | Beschreibung                                           |
| ----------- | ------------------------------------------------------ |
| `command`   | Pfad zur ausführbaren Datei für den Stdio-Transport    |
| `url`       | SSE-Endpunkt-URL (z. B. `"http://localhost:8080/sse"`) |
| `httpUrl`   | HTTP-Streaming-Endpunkt-URL                            |

Optional:

| Eigenschaft            | Typ/Standard                    | Beschreibung                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | Array                           | Befehlszeilenargumente für den Stdio-Transport                                                                                                                                                                                                                    |
| `headers`              | Objekt                          | Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`                                                                                                                                                                                            |
| `env`                  | Objekt                          | Umgebungsvariablen für den Serverprozess. Werte können Umgebungsvariablen mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren                                                                                                                             |
| `cwd`                  | String                          | Arbeitsverzeichnis für den Stdio-Transport                                                                                                                                                                                                                        |
| `timeout`              | Zahl<br>(Standard: 600.000)     | Anfrage-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)                                                                                                                                                                                              |
| `trust`                | Boolean<br>(Standard: false)    | Wenn `true`, werden alle Toolaufrufbestätigungen für diesen Server umgangen (Standard: `false`)                                                                                                                                                                   |
| `includeTools`         | Array                           | Liste der Toolnamen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgelisteten Tools von diesem Server verfügbar (Whitelist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.     |
| `excludeTools`         | Array                           | Liste der Toolnamen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgelisteten Tools stehen dem Modell nicht zur Verfügung, auch wenn sie vom Server bereitgestellt werden.<br>Hinweis: `excludeTools` hat Vorrang vor `includeTools` – wenn sich ein Tool in beiden Listen befindet, wird es ausgeschlossen. |
| `targetAudience`       | String                          | Die OAuth-Client-ID, die in der IAP-geschützten Anwendung, auf die Sie zugreifen möchten, auf der Allowlist steht. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                        |
| `targetServiceAccount` | String                          | Die E-Mail-Adresse des Google Cloud Service Accounts, der nachgeahmt werden soll. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                         |

<a id="qwen-mcp-cli"></a>

### Verwalten von MCP-Servern mit `qwen mcp`

Sie können MCP-Server jederzeit durch manuelles Bearbeiten von `settings.json` konfigurieren, aber die CLI ist in der Regel schneller.

#### Hinzufügen eines Servers (`qwen mcp add`)

```bash
qwen mcp add [Optionen] <Name> <BefehlOderURL> [Argumente...]
```

| Argument/Option     | Beschreibung                                                        | Standard           | Beispiel                                  |
| ------------------- | ------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| `<name>`            | Ein eindeutiger Name für den Server.                                | —                  | `example-server`                          |
| `<commandOrUrl>`    | Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`). | —                  | `/usr/bin/python` oder `http://localhost:8` |
| `[args...]`         | Optionale Argumente für einen `stdio`-Befehl.                      | —                  | `--port 5000`                             |
| `-s`, `--scope`     | Konfigurationsbereich (Benutzer oder Projekt).                      | `project`          | `-s user`                                 |
| `-t`, `--transport` | Transporttyp (`stdio`, `sse`, `http`).                              | `stdio`            | `-t sse`                                  |
| `-e`, `--env`       | Umgebungsvariablen festlegen.                                        | —                  | `-e KEY=value`                            |
| `-H`, `--header`    | HTTP-Header für SSE- und HTTP-Transporte festlegen.                 | —                  | `-H "X-Api-Key: abc123"`                  |
| `--timeout`         | Verbindungszeitlimit in Millisekunden festlegen.                    | —                  | `--timeout 30000`                         |
| `--trust`           | Dem Server vertrauen (alle Bestätigungsdialoge für Toolaufrufe umgehen). | — (`false`)        | `--trust`                                 |
| `--description`     | Die Beschreibung für den Server festlegen.                          | —                  | `--description "Lokale Tools"`            |
| `--include-tools`   | Eine durch Kommas getrennte Liste der einzuschließenden Tools.       | alle Tools enthalten | `--include-tools mytool,othertool`        |
| `--exclude-tools`   | Eine durch Kommas getrennte Liste der auszuschließenden Tools.       | keine              | `--exclude-tools mytool`                  |

#### Server auflisten (`qwen mcp list`)

```bash
qwen mcp list
```

#### Einen Server entfernen (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```