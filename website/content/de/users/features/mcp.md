# Verbinde Qwen Code mit Tools über MCP

Qwen Code kann über das [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) mit externen Tools und Datenquellen verbunden werden. MCP-Server geben Qwen Code Zugriff auf deine Tools, Datenbanken und APIs.

## Was du mit MCP tun kannst

Mit angeschlossenen MCP-Servern kannst du Qwen Code bitten:

- Mit Dateien und Repos zu arbeiten (lesen/suchen/schreiben, je nach aktivierten Tools)
- Datenbanken abzufragen (Schema-Inspection, Abfragen, Reports)
- Interne Dienste zu integrieren (deine APIs als MCP-Tools bereitstellen)
- Workflows zu automatisieren (wiederholbare Aufgaben als Tools/Prompts bereitgestellt)

> [!tip]
>
> Wenn du nach dem „Ein-Befehl-zum-Start“ suchst, springe direkt zu [Schnellstart](#schnellstart).

## Schnellstart

Qwen Code lädt MCP-Server aus `mcpServers` in deiner `settings.json`. Du kannst Server entweder konfigurieren:

- Indem du `settings.json` direkt bearbeitest
- Oder mit `qwen mcp`-Befehlen (siehe [CLI-Referenz](#mcp-server-mit-qwen-mcp-verwalten))

### Ersten Server hinzufügen

1. Server hinzufügen (Beispiel: Remote-HTTP-MCP-Server):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Starte Qwen Code und öffne den MCP-Verwaltungsdialog, um Server anzuzeigen und zu verwalten:

```bash
qwen
```

Gib dann ein:

```text
/mcp
```

3. Wenn Qwen Code bereits lief, bevor du den Server hinzugefügt hast, starte es im selben Projekt neu. Bitte dann das Modell, Tools von diesem Server zu verwenden.

## Wo die Konfiguration gespeichert wird (Scopes)

Die meisten Nutzer benötigen nur diese beiden Scopes:

- **User-Scope (Standard)**: `~/.qwen/settings.json` für alle Projekte auf deinem Rechner
- **Projekt-Scope**: `.qwen/settings.json` im Projektstammverzeichnis

In den User-Scope schreiben:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Für fortgeschrittene Konfigurationsebenen (System-Standards/Systemeinstellungen und Vorrangregeln) siehe [Einstellungen](../configuration/settings).

## Server konfigurieren

### Einen Transport wählen

| Transport | Wann verwenden                                                    | JSON-Feld(er)                              |
| --------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `http`    | Empfohlen für Remote-Dienste; funktioniert gut für Cloud-MCP-Server | `httpUrl` (+ optional `headers`)           |
| `sse`     | Legacy-/Deprecated-Server, die nur Server-Sent Events unterstützen | `url` (+ optional `headers`)               |
| `stdio`   | Lokaler Prozess (Skripte, CLIs, Docker) auf deinem Rechner         | `command`, `args` (+ optional `cwd`, `env`) |

> [!note]
>
> Wenn ein Server beide unterstützt, bevorzuge **HTTP** gegenüber **SSE**.

### Konfiguration via `settings.json` vs. `qwen mcp add`

Beide Ansätze erzeugen dieselben `mcpServers`-Einträge in deiner `settings.json` – verwende, was dir lieber ist.

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

CLI (schreibt standardmäßig in den User-Scope):

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

## MCP-Prompts und -Ressourcen verwenden

Neben Tools entdeckt und präsentiert Qwen Code zwei weitere MCP-Primitive.

### Prompts (Slash-Befehle)

Jeder Prompt, den ein Server über `prompts/list` anbietet, wird zu einem ausführbaren **Slash-Befehl**. Nach der Erkennung tippe `/` und du siehst den Prompt aufgelistet (markiert als `MCP: <server>`); führe ihn aus wie jeden anderen Befehl:

```text
/my_prompt --arg1="value" --arg2="value"
# Positionsform funktioniert auch:
/my_prompt "value" "value"
# Zeige die Argumente des Prompts:
/my_prompt help
```

Die Nachrichten des Prompts werden an das Modell gesendet, das dann darauf reagiert.

> Die Erkennung ist nachsichtig bezüglich der deklarierten `prompts`-Fähigkeit: Manche Server implementieren `prompts/list`, lassen aber `prompts` in ihren `initialize`-Fähigkeiten weg. Qwen Code versucht trotzdem `prompts/list`, sodass diese Prompts trotzdem erscheinen. Ein Server, der wirklich keine Prompts hat, antwortet einfach mit `Method not found`, was ignoriert wird.

### Ressourcen

Ressourcen, die ein Server über `resources/list` anbietet, werden pro Server erkannt. Öffne den Verwaltungsdialog mit `/mcp` und wähle einen Server aus, um seine **Ressourcen**-Anzahl neben seinen Tools und Prompts zu sehen. Wähle **Ressourcen anzeigen**, um die Ressourcen-URIs des Servers zu durchsuchen; durch Auswahl einer wird deren Beschreibung und MIME-Typ zusammen mit der genauen `@server:uri`-Referenz zum Einfügen in eine Nachricht angezeigt. Wie bei Prompts muss die `resources`-Fähigkeit nicht deklariert sein.

Füge den Inhalt einer Ressource mit der `@server:uri`-Syntax in deine Nachricht ein – tippe `@`, dann den Servernamen, einen Doppelpunkt und die Ressourcen-URI:

```text
fasse @myserver:file:///docs/spec.md zusammen und liste die offenen Fragen auf
```

Die Eingabe von `@myserver:` zeigt eine Autovervollständigungsliste der Ressourcen dieses Servers; tippe weiter, um zu filtern, wobei (Groß-/Kleinschreibung egal) entweder die Ressourcen-URI oder ihr Anzeigename/Titel gematcht wird. Du musst keine URI auswendig kennen – bevor du den Doppelpunkt erreichst, schlägt die Eingabe eines Teils des Servernamens auch passende Server vor, die Ressourcen bereitstellen, sodass du einen auswählen und direkt in dessen Ressourcenliste einsteigen kannst. Beim Absenden wird die referenzierte Ressource gelesen und ihr Inhalt an deine Nachricht angehängt (Text inline, binäre Blobs als Anhänge); die `@server:uri`-Referenz bleibt im Prompt erhalten, damit das Modell weiß, was es sieht. Das `server`-Präfix muss mit einem konfigurierten MCP-Server übereinstimmen – andernfalls wird das Token als normaler Dateipfad behandelt, sodass vorhandene `@path/to/file`-Referenzen nicht beeinträchtigt werden. Das Lesen von Ressourcen ist in nicht vertrauenswürdigen Ordnern deaktiviert.

## Progressive Verfügbarkeit und Erkennungs-Timeout

Qwen Code erkennt MCP-Server im Hintergrund, nachdem die Benutzeroberfläche bereits interaktiv ist. Du siehst den ersten Prompt der CLI innerhalb weniger hundert Millisekunden, selbst wenn einer deiner MCP-Server mehrere Sekunden braucht (oder nie antwortet), und die Tool-Liste des Modells wird innerhalb ungefähr eines Frames (~16 ms) aktualisiert, sobald jeder Server seinen Erkennungs-Handshake abgeschlossen hat.

- **Interaktiver Modus**: Die UI erscheint sofort; ein MCP-Status-Pill unten rechts zeigt `N/M MCP-Server bereit`, während die Erkennung läuft. Das Senden eines Prompts vor Abschluss der MCP-Erkennung bedeutet lediglich, dass das Modell die Tools sieht, die _zu diesem Zeitpunkt_ bereit sind; nachfolgende Prompts sehen weitere Tools, sobald Server online kommen.
- **Nicht-interaktiver Modus** (`--prompt`, stream-json, ACP): Die CLI wartet trotzdem, bis die MCP-Erkennung abgeschlossen ist, bevor sie den ersten Prompt sendet, sodass scriptierte / gepipelte Aufrufe denselben vollständigen Tool-Satz sehen wie das alte synchrone Verhalten.

### Pro-Server `discoveryTimeoutMs`

Jeder MCP-Server erhält ein reines Erkennungs-Timeout, das die maximale Dauer des initialen Handshakes (`connect` + `tools/list` + `prompts/list` + `resources/list`) begrenzt. Standardwerte:

- **stdio-Server**: 30 s
- **Remote-HTTP-/SSE-Server**: 5 s (Netzwerkrisiko ist höher)

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

Das vorhandene `timeout`-Feld ist das **Tool-Call**-Timeout (wird für jede `tools/call`-Anfrage verwendet, Standard 10 Minuten) und wird von `discoveryTimeoutMs` nicht beeinflusst – ein langlaufender Tool-Aufruf ist kein Startproblem.

### Progressives MCP rückgängig machen

Wenn du das alte synchrone Verhalten benötigst (CLI wartet auf jeden MCP-Server, bevor sie eine UI anzeigt), setze `QWEN_CODE_LEGACY_MCP_BLOCKING=1` in deiner Umgebung. Dies bleibt für mindestens ein Release als Notausstieg erhalten.

## Sicherheit und Kontrolle

### Vertrauen (Bestätigungen überspringen)

- **Server-Vertrauen** (`trust: true`): überspringt Bestätigungsaufforderungen für diesen Server (sparsam verwenden).

### OAuth-Authentifizierung

Qwen Code unterstützt die OAuth-2.0-Authentifizierung für MCP-Server. Dies ist nützlich beim Zugriff auf Remote-Server, die eine Authentifizierung erfordern.

#### Grundlegende Verwendung

Wenn du einen MCP-Server mit OAuth-Anmeldeinformationen hinzufügst, kümmert sich Qwen Code automatisch um den Authentifizierungsablauf:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Wichtig: Redirect-URI-Konfiguration

Der OAuth-Ablauf erfordert eine Redirect-URI, an die der Autorisierungsanbieter den Authentifizierungscode sendet.

- **Lokale Entwicklung**: Standardmäßig verwendet Qwen Code `http://localhost:7777/oauth/callback`. Dies funktioniert, wenn Qwen Code auf deinem lokalen Rechner mit einem lokalen Browser ausgeführt wird.

- **Remote-/Cloud-Bereitstellungen**: Wenn Qwen Code auf entfernten Servern, Cloud-IDEs oder Web-Terminals ausgeführt wird, funktioniert das standardmäßige `localhost`-Redirect NICHT. Du MUSST `--oauth-redirect-uri` so konfigurieren, dass es auf eine öffentlich erreichbare URL verweist, die den OAuth-Callback empfangen kann.

Beispiel für Remote-Server:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### Manuelle Konfiguration über settings.json

Du kannst OAuth auch durch direktes Bearbeiten von `settings.json` konfigurieren:

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

Eigenschaften der OAuth-Konfiguration:

| Eigenschaft       | Beschreibung                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`         | OAuth für diesen Server aktivieren (boolean)                                                                                      |
| `clientId`        | OAuth-Client-Identifikator (string, optional bei dynamischer Registrierung)                                                       |
| `clientSecret`    | OAuth-Client-Geheimnis (string, optional für öffentliche Clients)                                                                 |
| `authorizationUrl`| OAuth-Autorisierungsendpunkt (string, wird bei Weglassen automatisch erkannt)                                                     |
| `tokenUrl`        | OAuth-Token-Endpunkt (string, wird bei Weglassen automatisch erkannt)                                                             |
| `scopes`          | Erforderliche OAuth-Scopes (Array von Strings)                                                                                    |
| `redirectUri`     | Benutzerdefinierte Redirect-URI (string). **Entscheidend für Remote-Bereitstellungen**. Standardmäßig `http://localhost:7777/oauth/callback` |
| `tokenParamName`  | Name des Abfrageparameters für Token in SSE-URLs (string)                                                                         |
| `audiences`       | Zielgruppen, für die das Token gültig ist (Array von Strings)                                                                     |

#### Token-Verwaltung

OAuth-Token werden automatisch:

- **Gespeichert** standardmäßig in `~/.qwen/mcp-oauth-tokens.json` (Klartext, Modus 0600). Wenn `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` gesetzt ist, verwendet Qwen Code nach Möglichkeit eine Schlüsselbund-gestützte Speicherung oder `~/.qwen/mcp-oauth-tokens-v2.json` mit AES-256-GCM-Verschlüsselung.
- **Aktualisiert**, wenn sie ablaufen (falls Refresh-Token verfügbar sind)
- **Valid vor** jedem Verbindungsversuch

> [!WARNING]
> Standardmäßig werden OAuth-Token unverschlüsselt auf der Festplatte gespeichert. Auf gemeinsamen oder Multi-User-Rechnern setze `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`, um die Anmeldeinformationen zu schützen.

Verwende den `/mcp`-Dialog innerhalb von Qwen Code, um MCP-Server zu inspizieren und die Authentifizierung interaktiv zu verwalten.

### Tool-Filterung (Tools pro Server erlauben/verbieten)

Verwende `includeTools` / `excludeTools`, um die von einem Server bereitgestellten Tools einzuschränken (aus der Perspektive von Qwen Code).

Beispiel: nur einige Tools einschließen:

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

### Globale Erlauben-/Verbieten-Listen

Das `mcp`-Objekt in deiner `settings.json` definiert globale Regeln für alle MCP-Server:

- `mcp.allowed`: Erlaubnisliste der MCP-Servernamen (Schlüssel in `mcpServers`)
- `mcp.excluded`: Verbotsliste der MCP-Servernamen

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

- **Server zeigt „Getrennt" in `qwen mcp list`**: Überprüfe, ob die URL/der Befehl korrekt ist, und erhöhe dann `timeout`.
- **Stdio-Server startet nicht**: Verwende einen absoluten Pfad für `command` und überprüfe `cwd`/`env`.
- **Umgebungsvariablen in JSON werden nicht aufgelöst**: Stelle sicher, dass sie in der Umgebung existieren, in der Qwen Code ausgeführt wird (Shell- vs. GUI-App-Umgebungen können sich unterscheiden).

## Referenz

### Struktur von `settings.json`

#### Serverspezifische Konfiguration (`mcpServers`)

Füge ein `mcpServers`-Objekt zu deiner `settings.json`-Datei hinzu:

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

Erforderlich (eines der folgenden):

| Eigenschaft | Beschreibung                                                   |
| ----------- | -------------------------------------------------------------- |
| `command`   | Pfad zur ausführbaren Datei für Stdio-Transport                |
| `url`       | SSE-Endpunkt-URL (z. B. `"http://localhost:8080/sse"`)         |
| `httpUrl`   | HTTP-Streaming-Endpunkt-URL                                    |

Optional:

| Eigenschaft           | Typ/Standard               | Beschreibung                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                | Array                     | Kommandozeilenargumente für Stdio-Transport                                                                                                                                                                                                                         |
| `headers`             | Objekt                    | Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`                                                                                                                                                                                               |
| `env`                 | Objekt                    | Umgebungsvariablen für den Serverprozess. Werte können Umgebungsvariablen mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren                                                                                                                                |
| `cwd`                 | String                    | Arbeitsverzeichnis für Stdio-Transport                                                                                                                                                                                                                               |
| `timeout`             | Zahl<br>(Standard: 600.000) | Anforderungs-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)                                                                                                                                                                                            |
| `trust`               | boolean<br>(Standard: false) | Wenn `true`, werden alle Tool-Call-Bestätigungen für diesen Server übersprungen (Standard: `false`)                                                                                                                                                                  |
| `includeTools`        | Array                     | Liste der Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert. |
| `excludeTools`        | Array                     | Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Hier aufgeführte Tools stehen dem Modell nicht zur Verfügung, auch wenn sie vom Server bereitgestellt werden.<br>Hinweis: `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen. |
| `targetAudience`      | String                    | Die OAuth-Client-ID, die in der durch IAP geschützten Anwendung, auf die du zugreifen möchtest, zugelassen ist. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                          |
| `targetServiceAccount`| String                    | Die E-Mail-Adresse des Google Cloud-Dienstkontos, das du impersonieren möchtest. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                             |

<a id="qwen-mcp-cli"></a>

### MCP-Server mit `qwen mcp` verwalten

Du kannst MCP-Server immer durch manuelles Bearbeiten von `settings.json` konfigurieren, aber die CLI ist normalerweise schneller.

#### Server hinzufügen (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option               | Beschreibung                                                        | Standard                               | Beispiel                                                           |
| ----------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                      | Ein eindeutiger Name für den Server.                                | —                                      | `example-server`                                                   |
| `<commandOrUrl>`              | Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`). | —                                      | `/usr/bin/python` oder `http://localhost:8`                         |
| `[args...]`                   | Optionale Argumente für einen `stdio`-Befehl.                       | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`               | Konfigurationsbereich (user oder project).                          | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`           | Transporttyp (`stdio`, `sse`, `http`).                              | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`                 | Umgebungsvariablen setzen.                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`              | HTTP-Header für SSE- und HTTP-Transporte setzen.                    | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                   | Verbindungs-Timeout in Millisekunden setzen.                        | —                                      | `--timeout 30000`                                                  |
| `--trust`                     | Server vertrauen (alle Tool-Call-Bestätigungen überspringen).       | — (`false`)                            | `--trust`                                                          |
| `--description`               | Beschreibung für den Server setzen.                                 | —                                      | `--description "Lokale Tools"`                                     |
| `--include-tools`             | Kommagetrennte Liste der einzuschließenden Tools.                   | alle Tools eingeschlossen              | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`             | Kommagetrennte Liste der auszuschließenden Tools.                  | keine                                  | `--exclude-tools mytool`                                           |
| `--oauth-client-id`           | OAuth-Client-ID für die MCP-Server-Authentifizierung.               | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`       | OAuth-Client-Geheimnis für die MCP-Server-Authentifizierung.        | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`        | OAuth-Redirect-URI für den Authentifizierungs-Callback.             | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url`   | OAuth-Autorisierungs-URL.                                           | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`           | OAuth-Token-URL.                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`              | OAuth-Scopes (kommagetrennt).                                       | —                                      | `--oauth-scopes scope1,scope2`                                     |
> Die `--oauth-*`-Flags gelten nur für `--transport sse` und `--transport http`. Eine Kombination mit `--transport stdio` wird abgelehnt.

#### Entfernen eines Servers (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```