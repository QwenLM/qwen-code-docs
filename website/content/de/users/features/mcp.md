# Qwen Code über MCP mit Tools verbinden

Qwen Code kann über das [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) eine Verbindung zu externen Tools und Datenquellen herstellen. MCP-Server geben Qwen Code Zugriff auf deine Tools, Datenbanken und APIs.

## Was du mit MCP tun kannst

Mit verbundenen MCP-Servern kannst du Qwen Code auffordern:

- Mit Dateien und Repos zu arbeiten (lesen/suchen/schreiben, abhängig von den aktivierten Tools)
- Datenbanken abzufragen (Schema-Inspektion, Queries, Reporting)
- Interne Services zu integrieren (deine APIs als MCP-Tools bereitzustellen)
- Workflows zu automatisieren (wiederholbare Aufgaben, die als Tools/Prompts bereitgestellt werden)

> [!tip]
>
> Wenn du nach dem "einen Befehl für den Einstieg" suchst, spring direkt zu [Quick start](#quick-start).

## Quick start

Qwen Code lädt MCP-Server aus `mcpServers` in deiner `settings.json`. Du kannst Server entweder konfigurieren:

- Durch direktes Bearbeiten der `settings.json`
- Durch Verwenden von `qwen mcp`-Befehlen (siehe [CLI-Referenz](#manage-mcp-servers-with-qwen-mcp))

### Deinen ersten Server hinzufügen

1. Füge einen Server hinzu (Beispiel: Remote-HTTP-MCP-Server):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Starte Qwen Code und öffne den MCP-Verwaltungsdialog, um Server anzuzeigen und zu verwalten:

```bash
qwen
```

Gib dann Folgendes ein:

```text
/mcp
```

3. Wenn Qwen Code bereits lief, bevor du den Server hinzugefügt hast, starte es im selben Projekt neu. Bitte das Modell dann, die Tools von diesem Server zu verwenden.

## Wo die Konfiguration gespeichert wird (Scopes)

Die meisten Benutzer benötigen nur diese zwei Scopes:

- **User scope (Standard)**: `~/.qwen/settings.json` für alle Projekte auf deinem Rechner
- **Project scope**: `.qwen/settings.json` in deinem Projekt-Root

In den User scope schreiben:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Für erweiterte Konfigurationsebenen (System-Defaults/Systemeinstellungen und Prioritätsregeln) siehe [Settings](../configuration/settings).

## Server konfigurieren

### Transport auswählen

| Transport | Wann zu verwenden                                                       | JSON-Feld(er)                               |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Empfohlen für Remote-Services; funktioniert gut für Cloud-MCP-Server | `httpUrl` (+ optionale `headers`)            |
| `sse`     | Legacy/veraltete Server, die nur Server-Sent Events unterstützen    | `url` (+ optionale `headers`)                |
| `stdio`   | Lokaler Prozess (Skripte, CLIs, Docker) auf deinem Rechner             | `command`, `args` (+ optionale `cwd`, `env`) |

> [!note]
>
> Wenn ein Server beides unterstützt, bevorzuge **HTTP** gegenüber **SSE**.

### Konfiguration über `settings.json` vs. `qwen mcp add`

Beide Ansätze erzeugen dieselben `mcpServers`-Einträge in deiner `settings.json` – verwende einfach das, was dir lieber ist.

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

CLI (schreibt standardmäßig in den User scope):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP-Server (Remote streamable HTTP)

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

## MCP-Prompts und -Ressourcen verwenden

Neben Tools erkennt Qwen Code zwei weitere MCP-Primitiven und macht sie verfügbar.

### Prompts (Slash-Befehle)

Jeder Prompt, den ein Server über `prompts/list` ankündigt, wird zu einem ausführbaren **Slash-Befehl**. Nach der Erkennung gibst du `/` ein und siehst den Prompt in der Liste (gekennzeichnet mit `MCP: <server>`); führe ihn wie jeden anderen Befehl aus:

```text
/my_prompt --arg1="value" --arg2="value"
# positional form also works:
/my_prompt "value" "value"
# show the prompt's arguments:
/my_prompt help
```

Die Nachrichten des Prompts werden an das Modell gesendet, das dann darauf reagiert.

> Die Erkennung ist tolerant gegenüber der deklarierten `prompts`-Capability: Einige Server implementieren `prompts/list`, lassen aber `prompts` in ihren `initialize`-Capabilities weg. Qwen Code versucht trotzdem `prompts/list`, sodass diese Prompts dennoch angezeigt werden. Ein Server, der wirklich keine Prompts hat, antwortet einfach mit `Method not found`, was ignoriert wird.

### Ressourcen

Ressourcen, die ein Server über `resources/list` ankündigt, werden pro Server erkannt. Öffne den Verwaltungsdialog mit `/mcp` und wähle einen Server aus, um dessen **Ressourcen**-Anzahl zusammen mit den Tools und Prompts zu sehen. Wähle **View resources**, um die Ressourcen-URIs des Servers zu durchsuchen; die Auswahl einer Ressource zeigt deren Beschreibung und MIME-Typ zusammen mit der genauen `@server:uri`-Referenz zum Einfügen in eine Nachricht. Wie bei Prompts muss die `resources`-Capability nicht deklariert sein.

Füge den Inhalt einer Ressource mit der `@server:uri`-Syntax in deine Nachricht ein – tippe `@`, dann den Servernamen, einen Doppelpunkt und die Ressourcen-URI:

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

Das Tippen von `@myserver:` zeigt eine Autovervollständigungsliste der Ressourcen dieses Servers; tippe weiter, um zu filtern, wobei (Groß-/Kleinschreibung wird ignoriert) entweder die Ressourcen-URI oder der freundliche Name/Titel übereinstimmt. Du musst keine URI auswendig kennen – bevor du den Doppelpunkt erreichst, schlägt das Tippen eines Teils des Servernamens auch passende Server vor, die Ressourcen bereitstellen, sodass du einen auswählen und direkt in dessen Ressourcenliste eintauchen kannst. Beim Absenden wird die referenzierte Ressource gelesen und ihr Inhalt an deine Nachricht angehängt (Text inline, Binär-Blobs als Anhänge); die `@server:uri`-Referenz bleibt im Prompt erhalten, damit das Modell weiß, was es betrachtet. Das `server`-Präfix muss mit einem konfigurierten MCP-Server übereinstimmen – andernfalls wird das Token als normaler Dateipfad behandelt, sodass vorhandene `@path/to/file`-Referenzen unberührt bleiben. Das Lesen von Ressourcen ist in nicht vertrauenswürdigen Ordnern deaktiviert.

## Progressive Verfügbarkeit und Discovery-Timeouts

Qwen Code erkennt MCP-Server im Hintergrund, nachdem die UI bereits interaktiv ist. Du siehst den ersten Prompt der CLI innerhalb weniger hundert Millisekunden, selbst wenn einer deiner MCP-Server mehrere Sekunden braucht (oder nie antwortet), und die Tool-Liste des Modells aktualisiert sich innerhalb von etwa einem Frame (~16 ms), nachdem jeder Server seinen Discovery-Handshake abgeschlossen hat.

- **Interaktiver Modus**: Die UI erscheint sofort; ein MCP-Status-Pill unten rechts zeigt `N/M MCP servers ready`, während die Erkennung läuft. Das Senden eines Prompts vor Abschluss von MCP bedeutet einfach, dass das Modell die Tools sieht, die _in diesem Moment_ bereit sind; nachfolgende Prompts sehen mehr Tools, wenn Server online gehen.
- **Nicht-interaktiver Modus** (`--prompt`, stream-json, ACP): Die CLI wartet dennoch darauf, dass sich die MCP-Erkennung beruhigt, bevor der erste Prompt gesendet wird, sodass skriptgesteuerte / gepipete Aufrufe denselben vollständigen Tool-Satz sehen, den das alte synchrone Verhalten erzeugt hat.

### `discoveryTimeoutMs` pro Server

Jeder MCP-Server erhält ein reines Discovery-Timeout, das begrenzt, wie lange der initiale Handshake (`connect` + `tools/list` + `prompts/list` + `resources/list`) dauern darf. Standardwerte:

- **Stdio-Server**: 30 s
- **Remote-HTTP-/SSE-Server**: 5 s (das Netzwerkrisiko ist höher)

Bei Bedarf pro Server überschreiben:

```jsonc
{
  "mcpServers": {
    "slow-stdio": {
      "command": "node",
      "args": ["./slow-server.js"],
      "discoveryTimeoutMs": 60000,
    },
    "flaky-remote": {
      "httpUrl": "https://example.com/mcp",
      "discoveryTimeoutMs": 10000,
    },
  },
}
```

Das vorhandene `timeout`-Feld ist das **Tool-Call**-Timeout (wird für jede `tools/call`-Anfrage verwendet, Standard 10 Minuten) und wird von `discoveryTimeoutMs` nicht beeinflusst – ein lang laufender Tool-Aufruf ist kein Startproblem.

### Rollback von progressivem MCP

Wenn du das alte synchrone Verhalten benötigst (die CLI wartet auf jeden MCP-Server, bevor sie eine UI anzeigt), setze `QWEN_CODE_LEGACY_MCP_BLOCKING=1` in deiner Umgebung. Dies bleibt mindestens für ein Release als Notausgang erhalten.

## Sicherheit und Kontrolle

### Trust (Bestätigungen überspringen)

- **Server trust** (`trust: true`): Umgeht Bestätigungsabfragen für diesen Server (sparsam verwenden).

### OAuth-Authentifizierung

Qwen Code unterstützt die OAuth-2.0-Authentifizierung für MCP-Server. Dies ist nützlich beim Zugriff auf Remote-Server, die eine Authentifizierung erfordern.

#### Grundlegende Verwendung

Wenn du einen MCP-Server mit OAuth-Anmeldedaten hinzufügst, übernimmt Qwen Code automatisch die Abwicklung des Authentifizierungsflows:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Wichtig: Redirect-URI-Konfiguration

Der OAuth-Flow erfordert eine Redirect-URI, an die der Autorisierungsprovider den Authentifizierungscode sendet.

- **Lokale Entwicklung**: Standardmäßig verwendet Qwen Code `http://localhost:7777/oauth/callback`. Dies funktioniert, wenn du Qwen Code auf deinem lokalen Rechner mit einem lokalen Browser ausführst.

- **Remote-/Cloud-Deployments**: Wenn du Qwen Code auf Remote-Servern, Cloud-IDEs oder Web-Terminals ausführst, funktioniert die Standard-`localhost`-Redirect **nicht**. Du **musst** `--oauth-redirect-uri` so konfigurieren, dass es auf eine öffentlich zugängliche URL zeigt, die den OAuth-Callback empfangen kann.

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
| `enabled`          | Aktiviert OAuth für diesen Server (boolean)                                                                                |
| `clientId`         | OAuth-Client-Identifier (string, optional bei dynamischer Registrierung)                                                  |
| `clientSecret`     | OAuth-Client-Secret (string, optional für Public Clients)                                                             |
| `authorizationUrl` | OAuth-Autorisierungsendpunkt (string, wird bei Weglassen automatisch erkannt)                                                     |
| `tokenUrl`         | OAuth-Token-Endpunkt (string, wird bei Weglassen automatisch erkannt)                                                             |
| `scopes`           | Erforderliche OAuth-Scopes (Array von Strings)                                                                              |
| `redirectUri`      | Benutzerdefinierte Redirect-URI (string). **Kritisch für Remote-Deployments**. Standardmäßig `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | Query-Parametername für Tokens in SSE-URLs (string)                                                                  |
| `audiences`        | Audiences, für die das Token gültig ist (Array von Strings)                                                                   |

#### Token-Verwaltung

OAuth-Tokens werden automatisch:

- **Gespeichert** standardmäßig in `~/.qwen/mcp-oauth-tokens.json` (Klartext, Modus 0600). Wenn `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` gesetzt ist, verwendet Qwen Code wo verfügbar Keychain-gestützten Speicher oder `~/.qwen/mcp-oauth-tokens-v2.json` mit AES-256-GCM-Verschlüsselung.
- **Aktualisiert**, wenn sie abgelaufen sind (sofern Refresh-Tokens verfügbar sind)
- **Validiert** vor jedem Verbindungsversuch

> [!WARNING]
> Standardmäßig werden OAuth-Tokens unverschlüsselt auf der Festplatte gespeichert. Setze auf gemeinsam genutzten oder Multi-User-Rechnern `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`, um die Anmeldedaten zu schützen.

Verwende den `/mcp`-Dialog in Qwen Code, um MCP-Server zu inspizieren und die Authentifizierung interaktiv zu verwalten.

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

Beide Listen unterstützen Glob-Muster: `*` passt auf jede beliebige Zeichenfolge und `?` passt auf ein einzelnes Zeichen (z. B. passt `"*puppeteer*"` auf jeden Server, dessen Name `puppeteer` enthält). Einträge ohne Glob-Zeichen werden exakt abgeglichen. Wenn ein Server auf beide Listen passt, hat `mcp.excluded` Vorrang.

Beispiel:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server", "*-internal"],
    "excluded": ["experimental-server"]
  }
}
```

## Fehlerbehebung

- **Server zeigt "Disconnected" in `qwen mcp list`**: Überprüfe, ob URL/Befehl korrekt sind, und erhöhe dann `timeout`.
- **Stdio-Server startet nicht**: Verwende einen absoluten `command`-Pfad und überprüfe `cwd`/`env` noch einmal.
- **Umgebungsvariablen in JSON werden nicht aufgelöst**: Stelle sicher, dass sie in der Umgebung vorhanden sind, in der Qwen Code ausgeführt wird (Shell- und GUI-App-Umgebungen können sich unterscheiden).

## Referenz

### `settings.json`-Struktur

#### Serverspezifische Konfiguration (`mcpServers`)

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

| Eigenschaft               | Typ/Standard                 | Beschreibung                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Befehlszeilenargumente für den Stdio-Transport                                                                                                                                                                                                                        |
| `headers`              | object                       | Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`                                                                                                                                                                                                                 |
| `env`                  | object                       | Umgebungsvariablen für den Serverprozess. Werte können über die Syntax `$VAR_NAME` oder `${VAR_NAME}` auf Umgebungsvariablen verweisen                                                                                                                                |
| `cwd`                  | string                       | Arbeitsverzeichnis für den Stdio-Transport                                                                                                                                                                                                                             |
| `timeout`              | number<br>(Standard: 600.000) | Anfrage-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)                                                                                                                                                                                                 |
| `trust`                | boolean<br>(Standard: false)  | Wenn `true`, werden alle Tool-Call-Bestätigungen für diesen Server umgangen (Standard: `false`)                                                                                                                                                                              |
| `includeTools`         | array                        | Liste der Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.                                       |
| `excludeTools`         | array                        | Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgeführten Tools stehen dem Modell nicht zur Verfügung, auch wenn sie vom Server bereitgestellt werden.<br>Hinweis: `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen enthalten ist, wird es ausgeschlossen. |
| `targetAudience`       | string                       | Die OAuth-Client-ID, die auf der IAP-geschützten Anwendung, auf die du zugreifen möchtest, in der Allowlist steht. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                         |
| `targetServiceAccount` | string                       | Die E-Mail-Adresse des zu imitierenden Google Cloud Service Accounts. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### MCP-Server mit `qwen mcp` verwalten

Du kannst MCP-Server immer durch manuelles Bearbeiten der `settings.json` konfigurieren, aber die CLI ist normalerweise schneller.

#### Hinzufügen eines Servers (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option             | Beschreibung                                                         | Standard                                | Beispiel                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | Ein eindeutiger Name für den Server.                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`). | —                                      | `/usr/bin/python` oder `http://localhost:8`                          |
| `[args...]`                 | Optionale Argumente für einen `stdio`-Befehl.                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | Konfigurations-Scope (user oder project).                              | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | Transporttyp (`stdio`, `sse`, `http`).                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | Umgebungsvariablen setzen.                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | HTTP-Header für SSE- und HTTP-Transporte setzen.                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | Verbindungs-Timeout in Millisekunden setzen.                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | Dem Server vertrauen (alle Tool-Call-Bestätigungsabfragen umgehen).       | — (`false`)                            | `--trust`                                                          |
| `--description`             | Die Beschreibung für den Server setzen.                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | Eine durch Kommas getrennte Liste der einzuschließenden Tools.                         | alle Tools eingeschlossen                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | Eine durch Kommas getrennte Liste der auszuschließenden Tools.                         | keine                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | OAuth-Client-ID für die MCP-Server-Authentifizierung.                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | OAuth-Client-Secret für die MCP-Server-Authentifizierung.                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | OAuth-Redirect-URI für den Authentifizierungs-Callback.                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth-Autorisierungs-URL.                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth-Token-URL.                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth-Scopes (durch Kommas getrennt).                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |
> Die `--oauth-*`-Flags gelten nur für `--transport sse` und `--transport http`. Eine Kombination mit `--transport stdio` wird abgelehnt.

#### Einen Server entfernen (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```