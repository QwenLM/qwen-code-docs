# Verbinden von Qwen Code mit Tools über MCP

Qwen Code kann über das [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) eine Verbindung zu externen Tools und Datenquellen herstellen. MCP-Server geben Qwen Code Zugriff auf Ihre Tools, Datenbanken und APIs.

## Was Sie mit MCP tun können

Mit verbundenen MCP-Servern können Sie Qwen Code bitten:

- Mit Dateien und Repositories zu arbeiten (Lesen/Suchen/Schreiben, je nach den von Ihnen aktivierten Tools)
- Datenbanken abzufragen (Schema-Inspektion, Abfragen, Berichte)
- Interne Dienste zu integrieren (Ihre APIs als MCP-Tools bereitstellen)
- Workflows zu automatisieren (wiederholbare Aufgaben, die als Tools/Prompts verfügbar gemacht werden)

> [!tip]
>
> Wenn Sie nach dem „ein Befehl zum Starten“ suchen, springen Sie zu [Quick start](#quick-start).

## Quick start

Qwen Code lädt MCP-Server aus `mcpServers` in Ihrer `settings.json`. Sie können Server entweder konfigurieren:

- Durch direktes Bearbeiten von `settings.json`
- Durch Verwendung von `qwen mcp`-Befehlen (siehe [CLI-Referenz](#manage-mcp-servers-with-qwen-mcp))

### Ihren ersten Server hinzufügen

1. Fügen Sie einen Server hinzu (Beispiel: entfernter HTTP-MCP-Server):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Starten Sie Qwen Code und öffnen Sie den MCP-Verwaltungsdialog, um Server anzuzeigen und zu verwalten:

```bash
qwen
```

Geben Sie dann ein:

```text
/mcp
```

3. Falls Qwen Code bereits ausgeführt wurde, bevor Sie den Server hinzugefügt haben, starten Sie es im selben Projekt neu. Bitten Sie dann das Modell, Tools von diesem Server zu verwenden.

## Wo die Konfiguration gespeichert wird (Bereiche)

Die meisten Benutzer benötigen nur diese beiden Bereiche:

- **Benutzerbereich (Standard)**: `~/.qwen/settings.json` für alle Projekte auf Ihrem Rechner
- **Projektbereich**: `.qwen/settings.json` im Stammverzeichnis Ihres Projekts

In den Benutzerbereich schreiben:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Für fortgeschrittene Konfigurationsebenen (Systemstandards/Systemeinstellungen und Vorrangregeln) siehe [Einstellungen](../configuration/settings).

## Server konfigurieren

### Einen Transport auswählen

| Transport | Wann verwenden                                                      | JSON-Feld(er)                              |
| --------- | ------------------------------------------------------------------- | ------------------------------------------ |
| `http`    | Empfohlen für entfernte Dienste; funktioniert gut für Cloud-MCP-Server | `httpUrl` (+ optional `headers`)           |
| `sse`     | Legacy-/veraltete Server, die nur Server-Sent Events unterstützen   | `url` (+ optional `headers`)               |
| `stdio`   | Lokaler Prozess (Skripte, CLIs, Docker) auf Ihrem Rechner           | `command`, `args` (+ optional `cwd`, `env`) |

> [!note]
>
> Wenn ein Server beides unterstützt, bevorzugen Sie **HTTP** gegenüber **SSE**.

### Konfiguration über `settings.json` vs. `qwen mcp add`

Beide Ansätze erzeugen dieselben `mcpServers`-Einträge in Ihrer `settings.json` – verwenden Sie, was Ihnen lieber ist.

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

CLI (schreibt standardmäßig in den Benutzerbereich):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP-Server (entferntes streamable HTTP)

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

#### SSE-Server (entferntes Server-Sent Events)

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

Neben Tools erkennt und bereitstellt Qwen Code zwei weitere MCP-Primitive.

### Prompts (Slash-Befehle)

Jeder Prompt, den ein Server über `prompts/list` bereitstellt, wird zu einem ausführbaren **Slash-Befehl**. Nach der Erkennung geben Sie `/` ein und sehen den Prompt aufgeführt (gekennzeichnet mit `MCP: <server>`); führen Sie ihn wie jeden anderen Befehl aus:

```text
/my_prompt --arg1="value" --arg2="value"
# Positionsform funktioniert auch:
/my_prompt "value" "value"
# Argumente des Prompts anzeigen:
/my_prompt help
```

Die Nachrichten des Prompts werden an das Modell gesendet, das dann darauf reagiert.

> Die Erkennung ist tolerant bezüglich der deklarierten `prompts`-Fähigkeit: Manche Server implementieren `prompts/list`, lassen aber `prompts` aus ihren `initialize`-Fähigkeiten weg. Qwen Code versucht trotzdem `prompts/list`, sodass diese Prompts weiterhin erscheinen. Ein Server, der wirklich keine Prompts hat, antwortet lediglich mit `Method not found`, was ignoriert wird.
### Resources

Ressourcen, die ein Server über `resources/list` anbietet, werden pro Server erkannt.
Öffnen Sie den Verwaltungsdialog mit `/mcp` und wählen Sie einen Server aus, um seine **Resources**-Anzahl zusammen mit seinen Tools und Prompts zu sehen. Wählen Sie **View resources**, um die Ressourcen-URIs des Servers zu durchsuchen. Wenn Sie eine auswählen, werden deren Beschreibung und MIME-Typ sowie die genaue `@server:uri`-Referenz angezeigt, die Sie in eine Nachricht einfügen können. Wie bei Prompts muss die `resources`-Fähigkeit nicht deklariert werden.

Fügen Sie den Inhalt einer Ressource mit der `@server:uri`-Syntax in Ihre Nachricht ein – geben Sie `@` ein, dann den Servernamen, einen Doppelpunkt und die Ressourcen-URI:

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

Die Eingabe von `@myserver:` zeigt eine Autovervollständigungsliste der Ressourcen dieses Servers; tippen Sie weiter, um zu filtern, wobei (Groß-/Kleinschreibung nicht beachtet) entweder die Ressourcen-URI oder deren Anzeigename/Titel übereinstimmt. Sie müssen keine URI auswendig kennen – bevor Sie den Doppelpunkt erreichen, schlägt die Eingabe eines Teils des Servernamens auch passende Server vor, die Ressourcen bereitstellen, sodass Sie einen auswählen und direkt in dessen Ressourcenliste eintauchen können. Beim Absenden wird die referenzierte Ressource gelesen und ihr Inhalt an Ihre Nachricht angehängt (Text inline, binäre Blobs als Anhänge); die `@server:uri`-Referenz bleibt im Prompt erhalten, damit das Modell weiß, was es betrachtet. Das `server`-Präfix muss mit einem konfigurierten MCP-Server übereinstimmen – sonst wird das Token als normaler Dateipfad behandelt, sodass bestehende `@path/to/file`-Referenzen nicht beeinträchtigt werden. Ressourcen-Lesen ist in nicht vertrauenswürdigen Ordnern deaktiviert.

## Progressive availability and discovery timeouts

Qwen Code entdeckt MCP-Server im Hintergrund, nachdem die Benutzeroberfläche bereits interaktiv ist. Sie sehen die erste Eingabeaufforderung der CLI innerhalb weniger hundert Millisekunden, selbst wenn einer Ihrer MCP-Server mehrere Sekunden braucht (oder nie antwortet), und die Tool-Liste des Modells wird innerhalb von etwa einem Frame (~16 ms) aktualisiert, nachdem jeder Server seinen Discovery-Handshake abgeschlossen hat.

- **Interaktiver Modus**: Die UI erscheint sofort; eine MCP-Status-Pille unten rechts zeigt `N/M MCP servers ready` an, während die Erkennung läuft. Das Senden eines Prompts vor Abschluss der MCP-Erkennung bedeutet lediglich, dass das Modell die Tools sieht, die _zu diesem Zeitpunkt_ bereit sind; nachfolgende Prompts sehen mehr Tools, wenn Server online kommen.
- **Nicht-interaktiver Modus** (`--prompt`, stream-json, ACP): Die CLI wartet weiterhin, bis die MCP-Erkennung abgeschlossen ist, bevor sie den ersten Prompt sendet, sodass scripted/piped-Aufrufe denselben vollständigen Tool-Satz sehen, den das alte synchrone Verhalten erzeugt hat.

### Per-server `discoveryTimeoutMs`

Jeder MCP-Server erhält ein Discovery-Timeout, das begrenzt, wie lange der initiale Handshake (`connect` + `tools/list` + `prompts/list` + `resources/list`) dauern darf. Standardwerte:

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

Das vorhandene `timeout`-Feld ist das **Tool-Call**-Timeout (wird für jede `tools/call`-Anfrage verwendet, Standard 10 Minuten) und wird von `discoveryTimeoutMs` nicht beeinflusst – ein lang laufender Tool-Aufruf ist keine Start-Pathologie.

### Rolling back progressive MCP

Wenn Sie das alte synchrone Verhalten benötigen (CLI wartet auf jeden MCP-Server, bevor eine UI angezeigt wird), setzen Sie `QWEN_CODE_LEGACY_MCP_BLOCKING=1` in Ihrer Umgebung. Dies wird für mindestens eine Version als Notlösung beibehalten.

## Safety and control

### Trust (skip confirmations)

- **Server-Vertrauen** (`trust: true`): umgeht Bestätigungsaufforderungen für diesen Server (sparsam verwenden).

### OAuth authentication

Qwen Code unterstützt OAuth 2.0-Authentifizierung für MCP-Server. Dies ist nützlich, wenn auf entfernte Server zugegriffen wird, die eine Authentifizierung erfordern.

#### Basic usage

Wenn Sie einen MCP-Server mit OAuth-Anmeldeinformationen hinzufügen, übernimmt Qwen Code automatisch den Authentifizierungsablauf:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Important: Redirect URI configuration

Der OAuth-Ablauf erfordert eine Redirect-URI, an die der Autorisierungsanbieter den Authentifizierungscode sendet.

- **Lokale Entwicklung**: Standardmäßig verwendet Qwen Code `http://localhost:7777/oauth/callback`. Dies funktioniert, wenn Qwen Code auf Ihrem lokalen Rechner mit einem lokalen Browser ausgeführt wird.
- **Remote-/Cloud-Bereitstellungen**: Wenn Qwen Code auf entfernten Servern, Cloud-IDEs oder Webterminals ausgeführt wird, funktioniert die standardmäßige `localhost`-Umleitung NICHT. Sie MÜSSEN `--oauth-redirect-uri` so konfigurieren, dass sie auf eine öffentlich zugängliche URL verweist, die den OAuth-Callback empfangen kann.

Beispiel für entfernte Server:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```
#### Manuelle Konfiguration über settings.json

Sie können OAuth auch konfigurieren, indem Sie `settings.json` direkt bearbeiten:

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

| Eigenschaft         | Beschreibung                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`           | OAuth für diesen Server aktivieren (boolesch)                                                                                             |
| `clientId`          | OAuth-Clientkennung (Zeichenfolge, optional bei dynamischer Registrierung)                                                               |
| `clientSecret`      | OAuth-Client-Geheimnis (Zeichenfolge, optional für öffentliche Clients)                                                                   |
| `authorizationUrl`  | OAuth-Autorisierungsendpunkt (Zeichenfolge, wird automatisch erkannt, falls ausgelassen)                                                  |
| `tokenUrl`          | OAuth-Tokenendpunkt (Zeichenfolge, wird automatisch erkannt, falls ausgelassen)                                                           |
| `scopes`            | Erforderliche OAuth-Bereiche (Array von Zeichenfolgen)                                                                                    |
| `redirectUri`       | Benutzerdefinierte Weiterleitungs-URI (Zeichenfolge). **Kritisch für Remote-Bereitstellungen**. Standardmäßig `http://localhost:7777/oauth/callback` |
| `tokenParamName`    | Name des Abfrageparameters für Token in SSE-URLs (Zeichenfolge)                                                                           |
| `audiences`         | Zielgruppen, für die das Token gültig ist (Array von Zeichenfolgen)                                                                       |

#### Token-Verwaltung

OAuth-Token werden automatisch:

- **Gespeichert** standardmäßig in `~/.qwen/mcp-oauth-tokens.json` (Klartext, Modus 0600). Wenn `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` gesetzt ist, verwendet Qwen Code nach Möglichkeit eine sichere Schlüsselbund-Ablage oder `~/.qwen/mcp-oauth-tokens-v2.json` mit AES-256-GCM-Verschlüsselung.
- **Erneuert**, wenn sie abgelaufen sind (sofern Aktualisierungstoken verfügbar)
- **Validiert** vor jedem Verbindungsversuch

> [!WARNING]
> Standardmäßig werden OAuth-Token unverschlüsselt auf der Festplatte gespeichert. Setzen Sie auf gemeinsam genutzten oder Mehrbenutzer-Rechnern `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`, um die Anmeldeinformationen zu schützen.

Verwenden Sie den `/mcp`-Dialog in Qwen Code, um MCP-Server zu inspizieren und die Authentifizierung interaktiv zu verwalten.

### Tool-Filterung (Tools pro Server erlauben/verbieten)

Verwenden Sie `includeTools` / `excludeTools`, um die von einem Server bereitgestellten Tools einzuschränken (aus Sicht von Qwen Code).

Beispiel: Nur einige Tools einschließen:

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

### Globale Erlaubnis-/Verbotsliste

Das Objekt `mcp` in Ihrer `settings.json` definiert globale Regeln für alle MCP-Server:

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

- **Server zeigt „Getrennt“ in `qwen mcp list` an**: Überprüfen Sie, ob die URL/der Befehl korrekt ist, und erhöhen Sie dann `timeout`.
- **Stdio-Server startet nicht**: Verwenden Sie einen absoluten `command`-Pfad und überprüfen Sie `cwd`/`env`.
- **Umgebungsvariablen in JSON werden nicht aufgelöst**: Stellen Sie sicher, dass sie in der Umgebung vorhanden sind, in der Qwen Code ausgeführt wird (Shell- und GUI-App-Umgebungen können sich unterscheiden).

## Referenz

### `settings.json`-Struktur

#### Serverspezifische Konfiguration (`mcpServers`)

Fügen Sie ein Objekt `mcpServers` zu Ihrer `settings.json`-Datei hinzu:

```json
// ... die Datei enthält andere Konfigurationsobjekte
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
| `command`   | Pfad zur ausführbaren Datei für den Stdio-Transport            |
| `url`       | SSE-Endpunkt-URL (z.B. `"http://localhost:8080/sse"`)          |
| `httpUrl`   | HTTP-Streaming-Endpunkt-URL                                    |

Optional:

| Eigenschaft             | Typ/Standard                    | Beschreibung                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                  | Array                           | Kommandozeilenargumente für den Stdio-Transport                                                                                                                                                                                                                                                                  |
| `headers`               | Objekt                          | Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`                                                                                                                                                                                                                                            |
| `env`                   | Objekt                          | Umgebungsvariablen für den Serverprozess. Werte können mit `$VAR_NAME` oder `${VAR_NAME}`-Syntax auf Umgebungsvariablen verweisen                                                                                                                                                                                 |
| `cwd`                   | Zeichenfolge                    | Arbeitsverzeichnis für den Stdio-Transport                                                                                                                                                                                                                                                                       |
| `timeout`               | Zahl<br>(Standard: 600.000)     | Timeout für Anfragen in Millisekunden (Standard: 600.000 ms = 10 Minuten)                                                                                                                                                                                                                                        |
| `trust`                 | boolesch<br>(Standard: false)   | Wenn `true`, werden alle Toolaufruf-Bestätigungen für diesen Server umgangen (Standard: `false`)                                                                                                                                                                                                                 |
| `includeTools`          | Array                           | Liste der Toolnamen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.                                                    |
| `excludeTools`          | Array                           | Liste der Toolnamen, die von diesem MCP-Server ausgeschlossen werden sollen. Hier aufgeführte Tools stehen dem Modell nicht zur Verfügung, selbst wenn sie vom Server bereitgestellt werden.<br>Hinweis: `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen. |
| `targetAudience`        | Zeichenfolge                    | Die OAuth-Client-ID, die auf der IAP-geschützten Anwendung, auf die Sie zugreifen möchten, in der Whitelist steht. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                                       |
| `targetServiceAccount`  | Zeichenfolge                    | Die E-Mail-Adresse des Google Cloud-Dienstkontos, das Sie impersonieren möchten. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.                                                                                                                                                         |
<a id="qwen-mcp-cli"></a>

### MCP-Server mit `qwen mcp` verwalten

Sie können MCP-Server jederzeit durch manuelles Bearbeiten der `settings.json` konfigurieren, die CLI ist jedoch in der Regel schneller.

#### Server hinzufügen (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option             | Beschreibung                                                         | Standard                               | Beispiel                                                            |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | Ein eindeutiger Name für den Server.                                 | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`). | —                                      | `/usr/bin/python` oder `http://localhost:8`                          |
| `[args...]`                 | Optionale Argumente für einen `stdio`-Befehl.                        | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | Konfigurationsbereich (Benutzer oder Projekt).                       | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | Transporttyp (`stdio`, `sse`, `http`).                               | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | Umgebungsvariablen setzen.                                           | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | HTTP-Header für SSE- und HTTP-Transporte setzen.                     | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | Verbindungs-Timeout in Millisekunden setzen.                         | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | Server als vertrauenswürdig einstufen (alle Tool-Aufruf-Bestätigungen umgehen). | — (`false`)                            | `--trust`                                                          |
| `--description`             | Beschreibung für den Server festlegen.                               | —                                      | `--description "Lokale Tools"`                                     |
| `--include-tools`           | Kommagetrennte Liste der einzuschließenden Tools.                    | alle Tools sind eingeschlossen         | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | Kommagetrennte Liste der auszuschließenden Tools.                    | keine                                  | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | OAuth-Client-ID für die MCP-Server-Authentifizierung.                | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | OAuth-Client-Secret für die MCP-Server-Authentifizierung.            | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | OAuth-Weiterleitungs-URI für den Authentifizierungs-Rückruf.         | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth-Autorisierungs-URL.                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth-Token-URL.                                                     | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth-Bereiche (kommagetrennt).                                      | —                                      | `--oauth-scopes scope1,scope2`                                     |

> Die `--oauth-*`-Flags gelten ausschließlich für `--transport sse` und `--transport http`. Eine Kombination mit `--transport stdio` wird zurückgewiesen.

#### Server entfernen (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```
