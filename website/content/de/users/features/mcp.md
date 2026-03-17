# Verbinden Sie Qwen Code mit Tools über MCP

Qwen Code kann über das [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) mit externen Tools und Datenquellen verbunden werden. MCP-Server gewähren Qwen Code Zugriff auf Ihre Tools, Datenbanken und APIs.

## Was Sie mit MCP tun können

Wenn MCP-Server verbunden sind, können Sie Qwen Code auffordern, Folgendes zu tun:

- Mit Dateien und Repositories zu arbeiten (Lesen/Suchen/Schreiben – je nach den aktivierten Tools)
- Datenbanken abzufragen (Schema-Inspektion, Abfragen, Berichte)
- Interne Dienste einzubinden (Ihre APIs als MCP-Tools kapseln)
- Workflows zu automatisieren (wiederholbare Aufgaben als Tools oder Prompts bereitstellen)

> [!tip]
>
> Wenn Sie nach dem „einen Befehl zum Einstieg“ suchen, springen Sie direkt zu [Schnellstart](#schnellstart).

## Schnellstart

Qwen Code lädt MCP-Server aus dem Eintrag `mcpServers` in Ihrer `settings.json`. Sie können Server auf zwei Arten konfigurieren:

- Durch direktes Bearbeiten der `settings.json`
- Mithilfe der `qwen mcp`-Befehle (siehe [CLI-Referenz](#qwen-mcp-cli))

### Fügen Sie Ihren ersten Server hinzu

1. Fügen Sie einen Server hinzu (Beispiel: entfernter HTTP-MCP-Server):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Öffnen Sie den MCP-Verwaltungsdialog, um Server anzuzeigen und zu verwalten:

```bash
qwen mcp
```

3. Starten Sie Qwen Code im selben Projekt neu (oder starten Sie es, falls es noch nicht läuft), und fordern Sie das Modell dann auf, Tools von diesem Server zu nutzen.

## Speicherort der Konfiguration (Geltungsbereiche)

Die meisten Benutzer benötigen nur diese beiden Geltungsbereiche:

- **Projekt-Geltungsbereich (Standard)**: `.qwen/settings.json` im Stammverzeichnis Ihres Projekts  
- **Benutzer-Geltungsbereich**: `~/.qwen/settings.json` für alle Projekte auf Ihrem Rechner

Schreiben Sie in den Benutzer-Geltungsbereich:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Für fortgeschrittene Konfigurationsebenen (Systemstandards/Systemeinstellungen und Prioritätsregeln) siehe [Einstellungen](../configuration/settings).

## Konfigurieren Sie Server

### Wählen Sie ein Transportprotokoll

| Transport | Wann zu verwenden                                                                 | JSON-Feld(er)                               |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Empfohlen für Remote-Dienste; funktioniert gut mit Cloud-MCP-Servern              | `httpUrl` (+ optional `headers`)            |
| `sse`     | Veraltete/veraltete Server, die ausschließlich Server-Sent Events unterstützen    | `url` (+ optional `headers`)                |
| `stdio`   | Lokaler Prozess (Skripte, CLIs, Docker) auf Ihrem Rechner                         | `command`, `args` (+ optional `cwd`, `env`) |

> [!note]
>
> Falls ein Server beide Protokolle unterstützt, bevorzugen Sie **HTTP** gegenüber **SSE**.

### Konfiguration über `settings.json` oder `qwen mcp add`

Beide Ansätze erzeugen dieselben Einträge in `mcpServers` in Ihrer `settings.json` – verwenden Sie die Methode, die Ihnen besser gefällt.

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

CLI (schreibt standardmäßig im Projektkontext):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP-Server (streamfähiger Remote-HTTP-Server)

JSON:

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer Ihr-API-Token"
      },
      "timeout": 5000
    }
  }
}
```

CLI:

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer Ihr-API-Token" --timeout 5000
```

#### SSE-Server (Remote-Server-Sent-Events)

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

- **Serververtrauen** (`trust: true`): Umgeht Bestätigungsabfragen für diesen Server (nur sparsam verwenden).

### Filtern von Tools (Zulassen/Verweigern von Tools pro Server)

Verwenden Sie `includeTools` bzw. `excludeTools`, um die von einem Server bereitgestellten Tools einzuschränken (aus Sicht von Qwen Code).

Beispiel: Nur einige Tools zulassen:

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

### Globale Zulassen-/Verweigern-Listen

Das Objekt `mcp` in Ihrer Datei `settings.json` definiert globale Regeln für alle MCP-Server:

- `mcp.allowed`: Liste der zulässigen MCP-Servernamen (Schlüssel in `mcpServers`)
- `mcp.excluded`: Liste der ausgeschlossenen MCP-Servernamen

Beispiel:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## Problembehandlung

- **Server zeigt „Getrennt“ in `qwen mcp list` an**: Überprüfen Sie, ob die URL bzw. der Befehl korrekt ist, und erhöhen Sie anschließend den Wert für `timeout`.
- **Stdio-Server startet nicht**: Verwenden Sie einen absoluten Pfad für `command` und überprüfen Sie `cwd`/`env` erneut.
- **Umgebungsvariablen in JSON werden nicht aufgelöst**: Stellen Sie sicher, dass sie in der Umgebung vorhanden sind, in der Qwen Code ausgeführt wird (Shell- und GUI-Anwendungsumgebungen können sich unterscheiden).

## Referenz

### Struktur von `settings.json`

#### Server-spezifische Konfiguration (`mcpServers`)

Fügen Sie ein `mcpServers`-Objekt zu Ihrer Datei `settings.json` hinzu:

```json
// ... die Datei enthält andere Konfigurationsobjekte
{
  "mcpServers": {
    "serverName": {
      "command": "Pfad/zum/Server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-verzeichnis",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Konfigurationseigenschaften:

Erforderlich (eine der folgenden):

| Eigenschaft | Beschreibung                                              |
| ----------- | --------------------------------------------------------- |
| `command`   | Pfad zur ausführbaren Datei für die Stdio-Übertragung     |
| `url`       | SSE-Endpunkt-URL (z. B. `"http://localhost:8080/sse"`)     |
| `httpUrl`   | HTTP-Streaming-Endpunkt-URL                               |

Optional:

| Eigenschaft               | Typ/Standardwert              | Beschreibung                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                    | Array                         | Befehlszeilenargumente für die Stdio-Übertragung                                                                                                                                                                                                                  |
| `headers`                 | Objekt                        | Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`                                                                                                                                                                                            |
| `env`                     | Objekt                        | Umgebungsvariablen für den Serverprozess. Werte können auf Umgebungsvariablen mittels der Syntax `$VAR_NAME` oder `${VAR_NAME}` verweisen.                                                                                                                        |
| `cwd`                     | Zeichenkette                  | Arbeitsverzeichnis für die Stdio-Übertragung                                                                                                                                                                                                                      |
| `timeout`                 | Zahl<br>(Standard: 600 000)  | Anfragetimeout in Millisekunden (Standard: 600 000 ms = 10 Minuten)                                                                                                                                                                                               |
| `trust`                   | Boolean<br>(Standard: `false`)| Wenn `true`, werden alle Bestätigungen für Tool-Aufrufe für diesen Server umgangen (Standard: `false`).                                                                                                                                                            |
| `includeTools`            | Array                         | Liste der Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind ausschließlich die hier aufgeführten Tools über diesen Server verfügbar („Allowlist“-Verhalten). Falls nicht angegeben, sind standardmäßig alle vom Server bereitgestellten Tools aktiviert. |
| `excludeTools`            | Array                         | Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Tools, die hier aufgelistet sind, stehen dem Modell nicht zur Verfügung, selbst wenn sie vom Server bereitgestellt werden.<br>Hinweis: `excludeTools` hat Vorrang vor `includeTools` – ist ein Tool in beiden Listen enthalten, wird es ausgeschlossen. |
| `targetAudience`          | Zeichenkette                  | Die OAuth-Client-ID, die für die IAP-geschützte Anwendung, auf die Sie zugreifen möchten, freigegeben ist. Wird zusammen mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                         |
| `targetServiceAccount`    | Zeichenkette                  | Die E-Mail-Adresse des Google Cloud-Dienstkonto, das imitiert werden soll. Wird zusammen mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                        |

<a id="qwen-mcp-cli"></a>

### MCP-Server mit `qwen mcp` verwalten

Sie können MCP-Server stets manuell durch Bearbeiten der Datei `settings.json` konfigurieren, doch die CLI ist in der Regel schneller.

#### Einen Server hinzufügen (`qwen mcp add`)

```bash
qwen mcp add [Optionen] <Name> <BefehlOderUrl> [Argumente...]
```

| Argument/Option     | Beschreibung                                                                 | Standardwert       | Beispiel                                   |
| ------------------- | ---------------------------------------------------------------------------- | ------------------ | ------------------------------------------ |
| `<Name>`            | Ein eindeutiger Name für den Server.                                         | —                  | `example-server`                           |
| `<BefehlOderUrl>`   | Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`).      | —                  | `/usr/bin/python` oder `http://localhost:8` |
| `[Argumente...]`    | Optionale Argumente für einen `stdio`-Befehl.                                | —                  | `--port 5000`                              |
| `-s`, `--scope`     | Konfigurationsbereich (Benutzer oder Projekt).                               | `project`          | `-s user`                                  |
| `-t`, `--transport` | Transporttyp (`stdio`, `sse`, `http`).                                       | `stdio`            | `-t sse`                                   |
| `-e`, `--env`       | Umgebungsvariablen festlegen.                                                | —                  | `-e KEY=value`                             |
| `-H`, `--header`    | HTTP-Header für SSE- und HTTP-Transports festlegen.                          | —                  | `-H "X-Api-Key: abc123"`                   |
| `--timeout`         | Verbindungszeitüberschreitung in Millisekunden festlegen.                    | —                  | `--timeout 30000`                          |
| `--trust`           | Server vertrauen (alle Bestätigungsaufforderungen für Tool-Aufrufe umgehen). | — (`false`)        | `--trust`                                  |
| `--description`     | Beschreibung für den Server festlegen.                                       | —                  | `--description "Lokale Tools"`             |
| `--include-tools`   | Durch Kommas getrennte Liste der einzuschließenden Tools.                    | alle Tools werden eingebunden | `--include-tools mytool,othertool`        |
| `--exclude-tools`   | Durch Kommas getrennte Liste der auszuschließenden Tools.                    | keine              | `--exclude-tools mytool`                   |

#### Entfernen eines Servers (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```