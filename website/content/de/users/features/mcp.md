---
description: "Verbinden Sie Qwen Code per MCP mit Datenbanken, APIs, Google Drive, Jira, Figma und weiteren Tools, um Kontext und Automatisierung gezielt zu erweitern."
---

# Qwen Code über MCP mit Tools verbinden

Qwen Code kann über das [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) mit externen Tools und Datenquellen verbunden werden. MCP-Server gewähren Qwen Code Zugriff auf deine Tools, Datenbanken und APIs.

## Was du mit MCP machen kannst

Mit verbundenen MCP-Servern kannst du Qwen Code bitten:

- Mit Dateien und Repos zu arbeiten (lesen/suchen/schreiben, abhängig von den aktivierten Tools)
- Datenbanken abzufragen (Schema-Inspektion, Queries, Reporting)
- Interne Dienste zu integrieren (deine APIs als MCP-Tools kapseln)
- Workflows zu automatisieren (wiederkehrende Aufgaben als Tools/Prompts bereitstellen)

> [!tip]
>
> Wenn du den „einen Befehl für den Einstieg“ suchst, springe direkt zu [Schnellstart](#quick-start).

## Schnellstart

Qwen Code lädt MCP-Server aus `mcpServers` in deiner `settings.json`. Du kannst Server auf zwei Arten konfigurieren:

- Durch direktes Bearbeiten von `settings.json`
- Durch Verwendung von `qwen mcp`-Befehlen (siehe [CLI-Referenz](#qwen-mcp-cli))

### Füge deinen ersten Server hinzu

1. Füge einen Server hinzu (Beispiel: Remote-HTTP-MCP-Server):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Öffne den MCP-Verwaltungsdialog, um Server anzuzeigen und zu verwalten:

```bash
qwen mcp
```

3. Starte Qwen Code im selben Projekt neu (oder starte es, falls es noch nicht läuft) und fordere das Modell dann auf, Tools von diesem Server zu verwenden.

## Wo die Konfiguration gespeichert wird (Scopes)

Die meisten Nutzer benötigen nur diese beiden Scopes:

- **Projekt-Scope (Standard)**: `.qwen/settings.json` im Projektstammverzeichnis
- **User-Scope**: `~/.qwen/settings.json` für alle Projekte auf deinem Rechner

In den User-Scope schreiben:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Für erweiterte Konfigurationsebenen (Systemstandards/Systemeinstellungen und Vorrangregeln) siehe [Einstellungen](../configuration/settings).

## Server konfigurieren

### Transport wählen

| Transport | Wann verwenden | JSON-Feld(er) |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Empfohlen für Remote-Dienste; funktioniert gut für Cloud-MCP-Server | `httpUrl` (+ optional `headers`)            |
| `sse`     | Legacy-/veraltete Server, die nur Server-Sent Events unterstützen    | `url` (+ optional `headers`)                |
| `stdio`   | Lokaler Prozess (Skripte, CLIs, Docker) auf deinem Rechner             | `command`, `args` (+ optional `cwd`, `env`) |

> [!note]
>
> Wenn ein Server beides unterstützt, bevorzuge **HTTP** gegenüber **SSE**.

### Konfiguration über `settings.json` vs. `qwen mcp add`

Beide Ansätze erzeugen dieselben `mcpServers`-Einträge in deiner `settings.json` – verwende die Methode, die dir besser gefällt.

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

CLI (schreibt standardmäßig in den Projekt-Scope):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP-Server (Remote-Streamable-HTTP)

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

### Trust (Bestätigungen überspringen)

- **Server-Trust** (`trust: true`): Umgeht Bestätigungsabfragen für diesen Server (sparsam verwenden).

### OAuth-Authentifizierung

Qwen Code unterstützt OAuth 2.0-Authentifizierung für MCP-Server. Dies ist nützlich beim Zugriff auf Remote-Server, die eine Authentifizierung erfordern.

#### Grundlegende Verwendung

Wenn du einen MCP-Server mit OAuth-Credentials hinzufügst, verwaltet Qwen Code den Authentifizierungsablauf automatisch:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Wichtig: Konfiguration der Redirect-URI

Der OAuth-Ablauf erfordert eine Redirect-URI, an die der Autorisierungsanbieter den Authentifizierungscode sendet.

- **Lokale Entwicklung**: Standardmäßig verwendet Qwen Code `http://localhost:7777/oauth/callback`. Dies funktioniert, wenn Qwen Code auf deinem lokalen Rechner mit einem lokalen Browser ausgeführt wird.

- **Remote-/Cloud-Deployments**: Wenn Qwen Code auf Remote-Servern, Cloud-IDEs oder Webterminals läuft, funktioniert die standardmäßige `localhost`-Redirect-URI **nicht**. Du MUSST `--oauth-redirect-uri` so konfigurieren, dass es auf eine öffentlich zugängliche URL verweist, die den OAuth-Callback empfangen kann.

Beispiel für Remote-Server:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### Manuelle Konfiguration über settings.json

Du kannst OAuth auch konfigurieren, indem du `settings.json` direkt bearbeitest:

```json
{
  "mcpServers": {
    "oauthServer": {
      "url": "https://api.example.com/sse/",
      "oauth": {
        "enabled": true,
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authorizationUrl": "https://provider.example.com/authorize",
        "tokenUrl": "https://provider.example.com/token",
        "redirectUri": "https://your-server.com/oauth/callback",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

OAuth-Konfigurationseigenschaften:

| Eigenschaft           | Beschreibung                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | Aktiviert OAuth für diesen Server (Boolean)                                                                                |
| `clientId`         | OAuth-Client-Identifier (String, optional bei dynamischer Registrierung)                                                  |
| `clientSecret`     | OAuth-Client-Secret (String, optional für Public Clients)                                                             |
| `authorizationUrl` | OAuth-Autorisierungs-Endpunkt (String, wird bei Fehlen automatisch erkannt)                                                     |
| `tokenUrl`         | OAuth-Token-Endpunkt (String, wird bei Fehlen automatisch erkannt)                                                             |
| `scopes`           | Erforderliche OAuth-Scopes (Array von Strings)                                                                              |
| `redirectUri`      | Benutzerdefinierte Redirect-URI (String). **Kritisch für Remote-Deployments**. Standardwert: `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | Query-Parametername für Tokens in SSE-URLs (String)                                                                  |
| `audiences`        | Zielgruppen (Audiences), für die das Token gültig ist (Array von Strings)                                                                   |

#### Token-Verwaltung

OAuth-Tokens werden automatisch:

- **Sicher gespeichert** in `~/.qwen/mcp-oauth-tokens.json`
- **Aktualisiert**, wenn sie abgelaufen sind (falls Refresh-Tokens verfügbar sind)
- **Validiert** vor jedem Verbindungsversuch

Verwende den Befehl `/mcp auth` innerhalb von Qwen Code, um die OAuth-Authentifizierung interaktiv zu verwalten.

### Tool-Filterung (Tools pro Server erlauben/verweigern)

Verwende `includeTools` / `excludeTools`, um die von einem Server bereitgestellten Tools einzuschränken (aus Sicht von Qwen Code).

Beispiel: Nur wenige Tools einschließen:

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

### Globale Allow-/Deny-Listen

Das `mcp`-Objekt in deiner `settings.json` definiert globale Regeln für alle MCP-Server:

- `mcp.allowed`: Allow-Liste von MCP-Servernamen (Keys in `mcpServers`)
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

## Fehlerbehebung

- **Server zeigt „Disconnected“ in `qwen mcp list` an**: Überprüfe, ob die URL/das Befehl korrekt ist, und erhöhe dann `timeout`.
- **Stdio-Server startet nicht**: Verwende einen absoluten `command`-Pfad und überprüfe `cwd`/`env` erneut.
- **Umgebungsvariablen in JSON werden nicht aufgelöst**: Stelle sicher, dass sie in der Umgebung existieren, in der Qwen Code läuft (Shell- und GUI-App-Umgebungen können sich unterscheiden).

## Referenz

### `settings.json`-Struktur

#### Serverspezifische Konfiguration (`mcpServers`)

Füge ein `mcpServers`-Objekt zu deiner `settings.json`-Datei hinzu:

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
| `command` | Pfad zur ausführbaren Datei für Stdio-Transport             |
| `url`     | SSE-Endpunkt-URL (z. B. `"http://localhost:8080/sse"`) |
| `httpUrl` | HTTP-Streaming-Endpunkt-URL                            |

Optional:

| Eigenschaft               | Typ/Standardwert                 | Beschreibung                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | Array                        | Befehlszeilenargumente für Stdio-Transport                                                                                                                                                                                                                        |
| `headers`              | Objekt                       | Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`                                                                                                                                                                                                                 |
| `env`                  | Objekt                       | Umgebungsvariablen für den Serverprozess. Werte können Umgebungsvariablen mit der `$VAR_NAME`- oder `${VAR_NAME}`-Syntax referenzieren                                                                                                                                |
| `cwd`                  | String                       | Arbeitsverzeichnis für Stdio-Transport                                                                                                                                                                                                                             |
| `timeout`              | Number<br>(Standard: 600.000) | Request-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)                                                                                                                                                                                                 |
| `trust`                | Boolean<br>(Standard: false)  | Bei `true` werden alle Tool-Call-Bestätigungen für diesen Server umgangen (Standard: `false`)                                                                                                                                                                              |
| `includeTools`         | Array                        | Liste der Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.                                       |
| `excludeTools`         | Array                        | Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgeführten Tools sind für das Modell nicht verfügbar, auch wenn sie vom Server bereitgestellt werden.<br>Hinweis: `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen. |
| `targetAudience`       | String                       | Die OAuth-Client-ID, die auf der IAP-geschützten Anwendung, auf die du zugreifen möchtest, auf der Allowlist steht. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                         |
| `targetServiceAccount` | String                       | Die E-Mail-Adresse des Google Cloud Service Accounts, der imitiert werden soll. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### MCP-Server mit `qwen mcp` verwalten

Du kannst MCP-Server immer durch manuelles Bearbeiten von `settings.json` konfigurieren, aber die CLI ist in der Regel schneller.

#### Server hinzufügen (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option             | Beschreibung                                                         | Standardwert                                | Beispiel                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | Ein eindeutiger Name für den Server.                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`). | —                                      | `/usr/bin/python` oder `http://localhost:8`                          |
| `[args...]`                 | Optionale Argumente für einen `stdio`-Befehl.                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | Konfigurations-Scope (user oder project).                              | `project`                              | `-s user`                                                          |
| `-t`, `--transport`         | Transporttyp (`stdio`, `sse`, `http`).                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | Umgebungsvariablen setzen.                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | HTTP-Header für SSE- und HTTP-Transporte setzen.                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | Verbindungs-Timeout in Millisekunden setzen.                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | Dem Server vertrauen (alle Tool-Call-Bestätigungsabfragen umgehen).       | — (`false`)                            | `--trust`                                                          |
| `--description`             | Beschreibung für den Server setzen.                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | Eine durch Kommas getrennte Liste der einzuschließenden Tools.                         | Alle Tools eingeschlossen                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | Eine durch Kommas getrennte Liste der auszuschließenden Tools.                         | Keine                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | OAuth-Client-ID für die MCP-Server-Authentifizierung.                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | OAuth-Client-Secret für die MCP-Server-Authentifizierung.                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | OAuth-Redirect-URI für den Authentifizierungs-Callback.                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth-Autorisierungs-URL.                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth-Token-URL.                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth-Scopes (durch Kommas getrennt).                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |

> `--oauth-*`-Flags gelten nur für `--transport sse` und `--transport http`. Eine Kombination mit `--transport stdio` wird abgelehnt.

#### Server entfernen (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```