---
description: "Bauen Sie einen MCP Server für Qwen Code, um eigene Tools, Datenquellen und Workflows über das Model Context Protocol in AI-Coding einzubinden."
---

# MCP-Server mit Qwen Code

Dieses Dokument bietet eine Anleitung zur Konfiguration und Verwendung von Model Context Protocol (MCP)-Servern mit Qwen Code.

## Was ist ein MCP-Server?

Ein MCP-Server ist eine Anwendung, die Tools und Ressourcen über das Model Context Protocol für die CLI bereitstellt und so die Interaktion mit externen Systemen und Datenquellen ermöglicht. MCP-Server fungieren als Brücke zwischen dem Modell und deiner lokalen Umgebung oder anderen Diensten wie APIs.

Ein MCP-Server ermöglicht der CLI:

- **Tools zu entdecken:** Verfügbare Tools, ihre Beschreibungen und Parameter über standardisierte Schema-Definitionen aufzulisten.
- **Tools auszuführen:** Bestimmte Tools mit definierten Argumenten aufzurufen und strukturierte Antworten zu erhalten.
- **Auf Ressourcen zuzugreifen:** Daten aus bestimmten Ressourcen zu lesen (obwohl die CLI primär auf die Tool-Ausführung fokussiert ist).

Mit einem MCP-Server kannst du die Fähigkeiten der CLI über die integrierten Funktionen hinaus erweitern, z. B. für die Interaktion mit Datenbanken, APIs, benutzerdefinierten Skripten oder spezialisierten Workflows.

## Kern-Integrationsarchitektur

Qwen Code integriert MCP-Server über ein ausgeklügeltes Entdeckungs- und Ausführungssystem, das im Core-Paket (`packages/core/src/tools/`) implementiert ist:

### Discovery-Layer (`mcp-client.ts`)

Der Entdeckungsprozess wird von `discoverMcpTools()` orchestriert, das:

1. **konfigurierte Server durchläuft**, die in deiner `settings.json` unter `mcpServers` definiert sind
2. **Verbindungen aufbaut**, indem es geeignete Transportmechanismen verwendet (Stdio, SSE oder Streamable HTTP)
3. **Tool-Definitionen** von jedem Server über das MCP-Protokoll abruft
4. **Tool-Schemas bereinigt und validiert**, um die Kompatibilität mit der Qwen API sicherzustellen
5. **Tools in der globalen Tool-Registry registriert**, inklusive Konfliktlösung

### Execution-Layer (`mcp-tool.ts`)

Jedes entdeckte MCP-Tool wird in einer `DiscoveredMCPTool`-Instanz gekapselt, die:

- **Bestätigungslogik** basierend auf Server-Vertrauenseinstellungen und Benutzerpräferenzen verarbeitet
- **Die Tool-Ausführung verwaltet**, indem der MCP-Server mit den richtigen Parametern aufgerufen wird
- **Antworten verarbeitet**, sowohl für den LLM-Kontext als auch für die Benutzeranzeige
- **Den Verbindungsstatus verwaltet** und Timeouts behandelt

### Transportmechanismen

Die CLI unterstützt drei MCP-Transporttypen:

- **Stdio-Transport:** Startet einen Subprozess und kommuniziert über stdin/stdout
- **SSE-Transport:** Verbindet sich mit Server-Sent Events-Endpunkten
- **Streamable HTTP-Transport:** Nutzt HTTP-Streaming für die Kommunikation

## So richtest du deinen MCP-Server ein

Qwen Code verwendet die `mcpServers`-Konfiguration in deiner `settings.json`-Datei, um MCP-Server zu lokalisieren und zu verbinden. Diese Konfiguration unterstützt mehrere Server mit unterschiedlichen Transportmechanismen.

### Konfiguration des MCP-Servers in settings.json

Du kannst MCP-Server in deiner `settings.json`-Datei auf zwei Arten konfigurieren: über das `mcpServers`-Objekt der obersten Ebene für spezifische Serverdefinitionen und über das `mcp`-Objekt für globale Einstellungen, die die Serverentdeckung und -ausführung steuern.

#### Globale MCP-Einstellungen (`mcp`)

Das `mcp`-Objekt in deiner `settings.json` ermöglicht es dir, globale Regeln für alle MCP-Server zu definieren.

- **`mcp.serverCommand`** (string): Ein globaler Befehl zum Starten eines MCP-Servers.
- **`mcp.allowed`** (Array von Strings): Eine Liste der zulässigen MCP-Servernamen. Wenn dies gesetzt ist, werden nur Server aus dieser Liste (entsprechend den Keys im `mcpServers`-Objekt) verbunden.
- **`mcp.excluded`** (Array von Strings): Eine Liste der auszuschließenden MCP-Servernamen. Server in dieser Liste werden nicht verbunden.

**Beispiel:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### Serverspezifische Konfiguration (`mcpServers`)

Im `mcpServers`-Objekt definierst du jeden einzelnen MCP-Server, mit dem sich die CLI verbinden soll.

### Konfigurationsstruktur

Füge ein `mcpServers`-Objekt zu deiner `settings.json`-Datei hinzu:

```json
{ ...Datei enthält weitere Konfigurationsobjekte
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

### Konfigurationseigenschaften

Jede Serverkonfiguration unterstützt die folgenden Eigenschaften:

#### Erforderlich (eine der folgenden)

- **`command`** (string): Pfad zur ausführbaren Datei für den Stdio-Transport
- **`url`** (string): SSE-Endpunkt-URL (z. B. `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): URL des HTTP-Streaming-Endpunkts

#### Optional

- **`args`** (string[]): Befehlszeilenargumente für den Stdio-Transport
- **`headers`** (object): Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`
- **`env`** (object): Umgebungsvariablen für den Serverprozess. Werte können Umgebungsvariablen mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren
- **`cwd`** (string): Arbeitsverzeichnis für den Stdio-Transport
- **`timeout`** (number): Request-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)
- **`trust`** (boolean): Wenn `true`, werden alle Tool-Aufruf-Bestätigungen für diesen Server umgangen (Standard: `false`)
- **`includeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server eingebunden werden sollen. Wenn angegeben, sind nur die hier aufgelisteten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.
- **`excludeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgeführten Tools sind für das Modell nicht verfügbar, auch wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen.
- **`targetAudience`** (string): Die OAuth-Client-ID, die für die IAP-geschützte Anwendung, auf die du zugreifen möchtest, auf der Allowlist steht. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, der imitiert werden soll. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.

### OAuth-Unterstützung für Remote-MCP-Server

Qwen Code unterstützt die OAuth 2.0-Authentifizierung für Remote-MCP-Server über SSE- oder HTTP-Transporte. Dies ermöglicht den sicheren Zugriff auf MCP-Server, die eine Authentifizierung erfordern.

#### Automatische OAuth-Entdeckung

Für Server, die die OAuth-Entdeckung unterstützen, kannst du die OAuth-Konfiguration weglassen und die CLI sie automatisch entdecken lassen:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

Die CLI wird automatisch:

- Erkennen, wenn ein Server OAuth-Authentifizierung erfordert (401-Antworten)
- OAuth-Endpunkte aus Server-Metadaten entdecken
- Bei Unterstützung eine dynamische Client-Registrierung durchführen
- Den OAuth-Flow und das Token-Management verarbeiten

#### Authentifizierungsablauf

Beim Verbinden mit einem OAuth-fähigen Server:

1. **Erster Verbindungsversuch** scheitert mit 401 Unauthorized
2. **OAuth-Entdeckung** findet Autorisierungs- und Token-Endpunkte
3. **Browser öffnet sich** zur Benutzerauthentifizierung (erfordert lokalen Browserzugriff)
4. **Autorisierungscode** wird gegen Zugriffstoken eingetauscht
5. **Token werden sicher gespeichert** für die zukünftige Verwendung
6. **Erneuter Verbindungsversuch** gelingt mit gültigen Token

#### Anforderungen an Browser-Weiterleitungen

**Wichtig:** Die OAuth-Authentifizierung erfordert, dass die Weiterleitungs-URI erreichbar ist:

- **Standardverhalten:** Weiterleitung an `http://localhost:7777/oauth/callback` (funktioniert für lokale Setups)
- **Benutzerdefinierte Weiterleitungs-URI:** Verwende `--oauth-redirect-uri` oder konfiguriere `redirectUri` in settings.json, um eine andere URL anzugeben

Für **Remote-/Cloud-Server-Deployments** (z. B. Web-Terminals, SSH-Sessions, Cloud-IDEs):

- Die Standard-`localhost`-Weiterleitung wird NICHT funktionieren
- Du MUSST eine benutzerdefinierte `redirectUri` konfigurieren, die auf eine öffentlich zugängliche URL verweist
- Der Browser des Benutzers muss diese URL erreichen können und zurück zum Server weitergeleitet werden

Beispiel für Remote-Server:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth funktioniert nicht in:

- Headless-Umgebungen ohne Browserzugriff
- Umgebungen, in denen die konfigurierte `redirectUri` vom Browser des Benutzers aus nicht erreichbar ist

#### Verwaltung der OAuth-Authentifizierung

Verwende den `/mcp auth`-Befehl, um die OAuth-Authentifizierung zu verwalten:

```bash
# List servers requiring authentication
/mcp auth

# Authenticate with a specific server
/mcp auth serverName

# Re-authenticate if tokens expire
/mcp auth serverName
```

#### OAuth-Konfigurationseigenschaften

- **`enabled`** (boolean): Aktiviert OAuth für diesen Server
- **`clientId`** (string): OAuth-Client-Bezeichner (optional bei dynamischer Registrierung)
- **`clientSecret`** (string): OAuth-Client-Geheimnis (optional für öffentliche Clients)
- **`authorizationUrl`** (string): OAuth-Autorisierungs-Endpunkt (wird automatisch entdeckt, wenn nicht angegeben)
- **`tokenUrl`** (string): OAuth-Token-Endpunkt (wird automatisch entdeckt, wenn nicht angegeben)
- **`scopes`** (string[]): Erforderliche OAuth-Scopes
- **`redirectUri`** (string): Benutzerdefinierte Weiterleitungs-URI. **Kritisch für Remote-Deployments:** Standardmäßig `http://localhost:7777/oauth/callback`. Wenn du Qwen Code auf Remote-/Cloud-Servern ausführst, setze dies auf eine öffentlich zugängliche URL (z. B. `https://your-server.com/oauth/callback`). Kann über `qwen mcp add --oauth-redirect-uri` oder direkt in settings.json konfiguriert werden.
- **`tokenParamName`** (string): Query-Parametername für Token in SSE-URLs
- **`audiences`** (string[]): Zielgruppen (Audiences), für die das Token gültig ist

#### Token-Verwaltung

OAuth-Token werden automatisch:

- **Sicher gespeichert** in `~/.qwen/mcp-oauth-tokens.json`
- **Aktualisiert**, wenn sie abgelaufen sind (wenn Refresh-Token verfügbar sind)
- **Validiert** vor jedem Verbindungsversuch
- **Bereinigt**, wenn sie ungültig oder abgelaufen sind

#### Authentifizierungsanbieter-Typ

Du kannst den Authentifizierungsanbieter-Typ über die `authProviderType`-Eigenschaft angeben:

- **`authProviderType`** (string): Gibt den Authentifizierungsanbieter an. Kann einer der folgenden sein:
  - **`dynamic_discovery`** (Standard): Die CLI entdeckt die OAuth-Konfiguration automatisch vom Server.
  - **`google_credentials`**: Die CLI verwendet die Google Application Default Credentials (ADC) zur Authentifizierung beim Server. Bei Verwendung dieses Anbieters musst du die erforderlichen Scopes angeben.
  - **`service_account_impersonation`**: Die CLI imitiert einen Google Cloud Service Account zur Authentifizierung beim Server. Dies ist nützlich für den Zugriff auf IAP-geschützte Dienste (speziell für Cloud Run-Dienste konzipiert).

#### Google Credentials

```json
{
  "mcpServers": {
    "googleCloudServer": {
      "httpUrl": "https://my-gcp-service.run.app/mcp",
      "authProviderType": "google_credentials",
      "oauth": {
        "scopes": ["https://www.googleapis.com/auth/userinfo.email"]
      }
    }
  }
}
```

#### Service Account Impersonation

Um dich mit einem Server über Service Account Impersonation zu authentifizieren, musst du `authProviderType` auf `service_account_impersonation` setzen und die folgenden Eigenschaften angeben:

- **`targetAudience`** (string): Die OAuth-Client-ID, die für die IAP-geschützte Anwendung, auf die du zugreifen möchtest, auf der Allowlist steht.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, der imitiert werden soll.

Die CLI verwendet deine lokalen Application Default Credentials (ADC), um ein OIDC-ID-Token für den angegebenen Service Account und die Zielgruppe zu generieren. Dieses Token wird dann zur Authentifizierung beim MCP-Server verwendet.

#### Einrichtungsanleitung

1. **[Erstelle](https://cloud.google.com/iap/docs/oauth-client-creation) oder verwende eine bestehende OAuth 2.0-Client-ID.** Um eine bestehende OAuth 2.0-Client-ID zu verwenden, folge den Schritten unter [How to share OAuth Clients](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Füge die OAuth-ID zur Allowlist für [programmatic access](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) der Anwendung hinzu.** Da Cloud Run noch kein unterstützter Ressourcentyp in `gcloud iap` ist, musst du die Client-ID im Projekt auf die Allowlist setzen.
3. **Erstelle einen Service Account.** [Dokumentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Cloud Console Link](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Füge sowohl den Service Account als auch die Benutzer zur IAP-Richtlinie** im Tab "Security" des Cloud Run-Dienstes selbst oder über `gcloud` hinzu.
5. **Gewähre allen Benutzern und Gruppen**, die auf den MCP-Server zugreifen werden, die notwendigen Berechtigungen, um [den Service Account zu imitieren](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (d. h. `roles/iam.serviceAccountTokenCreator`).
6. **[Aktiviere](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) die IAM Credentials API** für dein Projekt.

### Beispielkonfigurationen

#### Python-MCP-Server (Stdio)

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

#### Node.js-MCP-Server (Stdio)

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["dist/server.js", "--verbose"],
      "cwd": "./mcp-servers/node",
      "trust": true
    }
  }
}
```

#### Docker-basierter MCP-Server

```json
{
  "mcpServers": {
    "dockerizedServer": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "API_KEY",
        "-v",
        "${PWD}:/workspace",
        "my-mcp-server:latest"
      ],
      "env": {
        "API_KEY": "$EXTERNAL_SERVICE_TOKEN"
      }
    }
  }
}
```

#### HTTP-basierter MCP-Server

```json
{
  "mcpServers": {
    "httpServer": {
      "httpUrl": "http://localhost:3000/mcp",
      "timeout": 5000
    }
  }
}
```

#### HTTP-basierter MCP-Server mit benutzerdefinierten Headern

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token",
        "X-Custom-Header": "custom-value",
        "Content-Type": "application/json"
      },
      "timeout": 5000
    }
  }
}
```

#### MCP-Server mit Tool-Filterung

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      // "excludeTools": ["dangerous_tool", "file_deleter"],
      "timeout": 30000
    }
  }
}
```

### SSE-MCP-Server mit SA Impersonation

```json
{
  "mcpServers": {
    "myIapProtectedServer": {
      "url": "https://my-iap-service.run.app/sse",
      "authProviderType": "service_account_impersonation",
      "targetAudience": "YOUR_IAP_CLIENT_ID.apps.googleusercontent.com",
      "targetServiceAccount": "your-sa@your-project.iam.gserviceaccount.com"
    }
  }
}
```

## Der Entdeckungsprozess im Detail

Beim Start von Qwen Code wird die MCP-Server-Entdeckung durch den folgenden detaillierten Prozess durchgeführt:

### 1. Server-Iteration und Verbindungsaufbau

Für jeden konfigurierten Server in `mcpServers`:

1. **Statusverfolgung startet:** Der Serverstatus wird auf `CONNECTING` gesetzt
2. **Transportauswahl:** Basierend auf den Konfigurationseigenschaften:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Verbindungsaufbau:** Der MCP-Client versucht, sich mit dem konfigurierten Timeout zu verbinden
4. **Fehlerbehandlung:** Verbindungsfehler werden protokolliert und der Serverstatus auf `DISCONNECTED` gesetzt

### 2. Tool-Entdeckung

Nach erfolgreicher Verbindung:

1. **Tool-Auflistung:** Der Client ruft den Tool-Listing-Endpunkt des MCP-Servers auf
2. **Schema-Validierung:** Die Funktionsdeklaration jedes Tools wird validiert
3. **Tool-Filterung:** Tools werden basierend auf der `includeTools`- und `excludeTools`-Konfiguration gefiltert
4. **Namensbereinigung:** Tool-Namen werden bereinigt, um die Anforderungen der Qwen API zu erfüllen:
   - Ungültige Zeichen (nicht alphanumerisch, Unterstrich, Punkt, Bindestrich) werden durch Unterstriche ersetzt
   - Namen, die länger als 63 Zeichen sind, werden mit einem mittleren Ersatz (`___`) gekürzt

### 3. Konfliktlösung

Wenn mehrere Server Tools mit demselben Namen bereitstellen:

1. **Erste Registrierung gewinnt:** Der erste Server, der einen Tool-Namen registriert, erhält den nicht präfixierten Namen
2. **Automatische Präfixierung:** Nachfolgende Server erhalten präfixierte Namen: `serverName__toolName`
3. **Registry-Verfolgung:** Die Tool-Registry verwaltet die Zuordnungen zwischen Servernamen und ihren Tools

### 4. Schema-Verarbeitung

Tool-Parameter-Schemas werden für die API-Kompatibilität bereinigt:

- **`$schema`-Eigenschaften** werden entfernt
- **`additionalProperties`** werden entfernt
- **`anyOf` mit `default`** verlieren ihre Standardwerte (Vertex AI-Kompatibilität)
- **Rekursive Verarbeitung** wird auf verschachtelte Schemas angewendet

### 5. Verbindungsverwaltung

Nach der Entdeckung:

- **Persistente Verbindungen:** Server, die erfolgreich Tools registrieren, behalten ihre Verbindungen bei
- **Bereinigung:** Verbindungen zu Servern, die keine nutzbaren Tools bereitstellen, werden geschlossen
- **Statusaktualisierungen:** Die endgültigen Serverstatus werden auf `CONNECTED` oder `DISCONNECTED` gesetzt

## Tool-Ausführungsablauf

Wenn das Modell die Verwendung eines MCP-Tools beschließt, erfolgt der folgende Ausführungsablauf:

### 1. Tool-Aufruf

Das Modell generiert einen `FunctionCall` mit:

- **Tool-Name:** Der registrierte Name (möglicherweise mit Präfix)
- **Argumente:** JSON-Objekt, das dem Parameter-Schema des Tools entspricht

### 2. Bestätigungsprozess

Jedes `DiscoveredMCPTool` implementiert eine ausgeklügelte Bestätigungslogik:

#### Vertrauensbasierte Umgehung

```typescript
if (this.trust) {
  return false; // No confirmation needed
}
```

#### Dynamische Allowlisting

Das System verwaltet interne Allowlists für:

- **Server-Ebene:** `serverName` → Alle Tools dieses Servers sind vertrauenswürdig
- **Tool-Ebene:** `serverName.toolName` → Dieses spezifische Tool ist vertrauenswürdig

#### Verarbeitung der Benutzerentscheidung

Wenn eine Bestätigung erforderlich ist, können Benutzer wählen:

- **Einmalig fortfahren:** Nur dieses Mal ausführen
- **Dieses Tool immer erlauben:** Zur Tool-Ebene-Allowlist hinzufügen
- **Diesen Server immer erlauben:** Zur Server-Ebene-Allowlist hinzufügen
- **Abbrechen:** Ausführung abbrechen

### 3. Ausführung

Nach Bestätigung (oder Vertrauensumgehung):

1. **Parametervorbereitung:** Argumente werden gegen das Schema des Tools validiert
2. **MCP-Aufruf:** Das zugrunde liegende `CallableTool` ruft den Server auf mit:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Original server tool name
       args: params,
     },
   ];
   ```

3. **Antwortverarbeitung:** Ergebnisse werden sowohl für den LLM-Kontext als auch für die Benutzeranzeige formatiert

### 4. Antwortverarbeitung

Das Ausführungsergebnis enthält:

- **`llmContent`:** Rohe Antwortteile für den Kontext des Sprachmodells
- **`returnDisplay`:** Formatierter Output für die Benutzeranzeige (oft JSON in Markdown-Codeblöcken)

## So interagierst du mit deinem MCP-Server

### Verwendung des `/mcp`-Befehls

Der `/mcp`-Befehl liefert umfassende Informationen zu deinem MCP-Server-Setup:

```bash
/mcp
```

Dies zeigt:

- **Serverliste:** Alle konfigurierten MCP-Server
- **Verbindungsstatus:** `CONNECTED`, `CONNECTING` oder `DISCONNECTED`
- **Serverdetails:** Konfigurationszusammenfassung (ohne sensible Daten)
- **Verfügbare Tools:** Liste der Tools jedes Servers mit Beschreibungen
- **Entdeckungsstatus:** Gesamtstatus des Entdeckungsprozesses

### Beispielhafte `/mcp`-Ausgabe

```
MCP Servers Status:

📡 pythonTools (CONNECTED)
  Command: python -m my_mcp_server --port 8080
  Working Directory: ./mcp-servers/python
  Timeout: 15000ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Command: node dist/server.js --verbose
  Error: Connection refused

🐳 dockerizedServer (CONNECTED)
  Command: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Discovery State: COMPLETED
```

### Tool-Nutzung

Sobald sie entdeckt wurden, sind MCP-Tools für das Qwen-Modell wie integrierte Tools verfügbar. Das Modell wird automatisch:

1. **Geeignete Tools auswählen**, basierend auf deinen Anfragen
2. **Bestätigungsdialoge anzeigen** (sofern der Server nicht als vertrauenswürdig eingestuft ist)
3. **Tools ausführen** mit den richtigen Parametern
4. **Ergebnisse anzeigen** in einem benutzerfreundlichen Format

## Statusüberwachung und Fehlerbehebung

### Verbindungsstatus

Die MCP-Integration verfolgt mehrere Status:

#### Serverstatus (`MCPServerStatus`)

- **`DISCONNECTED`:** Server ist nicht verbunden oder hat Fehler
- **`CONNECTING`:** Verbindungsversuch läuft
- **`CONNECTED`:** Server ist verbunden und bereit

#### Entdeckungsstatus (`MCPDiscoveryState`)

- **`NOT_STARTED`:** Entdeckung hat noch nicht begonnen
- **`IN_PROGRESS`:** Server werden aktuell entdeckt
- **`COMPLETED`:** Entdeckung abgeschlossen (mit oder ohne Fehler)

### Häufige Probleme und Lösungen

#### Server verbindet sich nicht

**Symptome:** Server zeigt den Status `DISCONNECTED`

**Fehlerbehebung:**

1. **Konfiguration prüfen:** Stelle sicher, dass `command`, `args` und `cwd` korrekt sind
2. **Manuell testen:** Führe den Serverbefehl direkt aus, um sicherzustellen, dass er funktioniert
3. **Abhängigkeiten prüfen:** Stelle sicher, dass alle erforderlichen Pakete installiert sind
4. **Logs prüfen:** Suche nach Fehlermeldungen in der CLI-Ausgabe
5. **Berechtigungen prüfen:** Stelle sicher, dass die CLI den Serverbefehl ausführen kann

#### Keine Tools entdeckt

**Symptome:** Server verbindet sich, aber keine Tools sind verfügbar

**Fehlerbehebung:**

1. **Tool-Registrierung prüfen:** Stelle sicher, dass dein Server tatsächlich Tools registriert
2. **MCP-Protokoll prüfen:** Bestätige, dass dein Server die MCP-Tool-Auflistung korrekt implementiert
3. **Server-Logs prüfen:** Überprüfe die stderr-Ausgabe auf serverseitige Fehler
4. **Tool-Auflistung testen:** Teste den Tool-Entdeckungs-Endpunkt deines Servers manuell

#### Tools werden nicht ausgeführt

**Symptome:** Tools werden entdeckt, scheitern aber während der Ausführung

**Fehlerbehebung:**

1. **Parameter-Validierung:** Stelle sicher, dass dein Tool die erwarteten Parameter akzeptiert
2. **Schema-Kompatibilität:** Überprüfe, ob deine Eingabe-Schemas gültiges JSON Schema sind
3. **Fehlerbehandlung:** Prüfe, ob dein Tool nicht abgefangene Exceptions wirft
4. **Timeout-Probleme:** Erwäge, die `timeout`-Einstellung zu erhöhen

#### Sandbox-Kompatibilität

**Symptome:** MCP-Server scheitern, wenn Sandboxing aktiviert ist

**Lösungen:**

1. **Docker-basierte Server:** Verwende Docker-Container, die alle Abhängigkeiten enthalten
2. **Pfadzugriff:** Stelle sicher, dass Server-Executables in der Sandbox verfügbar sind
3. **Netzwerkzugriff:** Konfiguriere die Sandbox so, dass notwendige Netzwerkverbindungen erlaubt sind
4. **Umgebungsvariablen:** Überprüfe, ob erforderliche Umgebungsvariablen durchgereicht werden

### Debugging-Tipps

1. **Debug-Modus aktivieren:** Führe die CLI mit `--debug` für eine ausführliche Ausgabe aus
2. **stderr prüfen:** Die stderr-Ausgabe des MCP-Servers wird erfasst und protokolliert (INFO-Meldungen werden gefiltert)
3. **Isoliert testen:** Teste deinen MCP-Server unabhängig, bevor du ihn integrierst
4. **Schrittweises Setup:** Beginne mit einfachen Tools, bevor du komplexe Funktionen hinzufügst
5. **`/mcp` häufig verwenden:** Überwache den Serverstatus während der Entwicklung

## Wichtige Hinweise

### Sicherheitshinweise

- **Vertrauenseinstellungen:** Die `trust`-Option umgeht alle Bestätigungsdialoge. Verwende sie vorsichtig und nur für Server, die du vollständig kontrollierst
- **Zugriffstoken:** Achte auf Sicherheit, wenn du Umgebungsvariablen konfigurierst, die API-Keys oder Token enthalten
- **Sandbox-Kompatibilität:** Stelle bei Verwendung von Sandboxing sicher, dass MCP-Server innerhalb der Sandbox-Umgebung verfügbar sind
- **Private Daten:** Die Verwendung von weit gefassten Personal Access Tokens kann zu Datenlecks zwischen Repositories führen

### Performance und Ressourcenmanagement

- **Verbindungspersistenz:** Die CLI hält persistente Verbindungen zu Servern aufrecht, die erfolgreich Tools registriert haben
- **Automatische Bereinigung:** Verbindungen zu Servern, die keine Tools bereitstellen, werden automatisch geschlossen
- **Timeout-Verwaltung:** Konfiguriere angemessene Timeouts basierend auf den Antwortzeiten deines Servers
- **Ressourcenüberwachung:** MCP-Server laufen als separate Prozesse und verbrauchen Systemressourcen

### Schema-Kompatibilität

- **Schema-Compliance-Modus:** Standardmäßig (`schemaCompliance: "auto"`) werden Tool-Schemas unverändert übergeben. Setze `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` in deiner `settings.json`, um Modelle in das Strict OpenAPI 3.0-Format zu konvertieren.
- **OpenAPI 3.0-Transformationen:** Wenn der `openapi_30`-Modus aktiviert ist, verarbeitet das System:
  - Nullable-Typen: `["string", "null"]` -> `type: "string", nullable: true`
  - Const-Werte: `const: "foo"` -> `enum: ["foo"]`
  - Exklusive Limits: numerisches `exclusiveMinimum` -> boolesche Form mit `minimum`
  - Keyword-Entfernung: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Namensbereinigung:** Tool-Namen werden automatisch bereinigt, um API-Anforderungen zu erfüllen
- **Konfliktlösung:** Tool-Namenskonflikte zwischen Servern werden durch automatische Präfixierung gelöst

Diese umfassende Integration macht MCP-Server zu einer leistungsstarken Möglichkeit, die Fähigkeiten der CLI zu erweitern, während Sicherheit, Zuverlässigkeit und Benutzerfreundlichkeit gewahrt bleiben.

## Rückgabe von Rich Content aus Tools

MCP-Tools sind nicht auf die Rückgabe von einfachem Text beschränkt. Du kannst umfangreiche, mehrteilige Inhalte zurückgeben, einschließlich Text, Bildern, Audio und anderen Binärdaten in einer einzigen Tool-Antwort. Dies ermöglicht dir, leistungsstarke Tools zu erstellen, die dem Modell in einem einzigen Turn vielfältige Informationen bereitstellen können.

Alle vom Tool zurückgegebenen Daten werden verarbeitet und als Kontext für die nächste Generierung an das Modell gesendet, wodurch es in der Lage ist, über die bereitgestellten Informationen zu schlussfolgern oder sie zusammenzufassen.

### Funktionsweise

Um Rich Content zurückzugeben, muss die Antwort deines Tools der MCP-Spezifikation für ein [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) entsprechen. Das `content`-Feld des Ergebnisses sollte ein Array von `ContentBlock`-Objekten sein. Die CLI verarbeitet dieses Array korrekt, trennt Text von Binärdaten und verpackt es für das Modell.

Du kannst verschiedene Content-Block-Typen im `content`-Array kombinieren. Die unterstützten Block-Typen sind:

- `text`
- `image`
- `audio`
- `resource` (embedded content)
- `resource_link`

### Beispiel: Rückgabe von Text und einem Bild

Hier ist ein Beispiel für eine gültige JSON-Antwort eines MCP-Tools, das sowohl eine Textbeschreibung als auch ein Bild zurückgibt:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Here is the logo you requested."
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "The logo was created in 2025."
    }
  ]
}
```

Wenn Qwen Code diese Antwort erhält, wird es:

1. Den gesamten Text extrahieren und zu einem einzigen `functionResponse`-Teil für das Modell kombinieren.
2. Die Bilddaten als separaten `inlineData`-Teil bereitstellen.
3. Eine übersichtliche, benutzerfreundliche Zusammenfassung in der CLI anzeigen, die darauf hinweist, dass sowohl Text als auch ein Bild empfangen wurden.

Dies ermöglicht dir, ausgefeilte Tools zu erstellen, die dem Qwen-Modell einen umfangreichen, multimodalen Kontext bereitstellen können.

## MCP-Prompts als Slash-Befehle

Zusätzlich zu Tools können MCP-Server vordefinierte Prompts bereitstellen, die als Slash-Befehle innerhalb von Qwen Code ausgeführt werden können. Dies ermöglicht dir, Shortcuts für häufige oder komplexe Abfragen zu erstellen, die einfach per Name aufgerufen werden können.

### Definieren von Prompts auf dem Server

Hier ist ein kleines Beispiel eines Stdio-MCP-Servers, der Prompts definiert:

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

server.registerPrompt(
  'poem-writer',
  {
    title: 'Poem Writer',
    description: 'Write a nice haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write a haiku${mood ? ` with the mood ${mood}` : ''} called ${title}. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables `,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Dies kann in `settings.json` unter `mcpServers` wie folgt eingebunden werden:

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["filename.ts"]
    }
  }
}
```

### Aufrufen von Prompts

Sobald ein Prompt entdeckt wurde, kannst du ihn über seinen Namen als Slash-Befehl aufrufen. Die CLI übernimmt automatisch das Parsen der Argumente.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

oder mit positionsbasierten Argumenten:

```bash
/poem-writer "Qwen Code" reverent
```

Wenn du diesen Befehl ausführst, ruft die CLI die `prompts/get`-Methode auf dem MCP-Server mit den bereitgestellten Argumenten auf. Der Server ist dafür verantwortlich, die Argumente in die Prompt-Vorlage einzusetzen und den finalen Prompt-Text zurückzugeben. Die CLI sendet diesen Prompt dann zur Ausführung an das Modell. Dies bietet eine praktische Möglichkeit, häufige Workflows zu automatisieren und zu teilen.

## Verwaltung von MCP-Servern mit `qwen mcp`

Obwohl du MCP-Server immer durch manuelles Bearbeiten deiner `settings.json`-Datei konfigurieren kannst, bietet die CLI eine praktische Reihe von Befehlen, um deine Serverkonfigurationen programmatisch zu verwalten. Diese Befehle vereinfachen das Hinzufügen, Auflisten und Entfernen von MCP-Servern, ohne JSON-Dateien direkt bearbeiten zu müssen.

### Hinzufügen eines Servers (`qwen mcp add`)

Der `add`-Befehl konfiguriert einen neuen MCP-Server in deiner `settings.json`. Je nach Scope (`-s, --scope`) wird er entweder in der Benutzerkonfiguration `~/.qwen/settings.json` oder der Projektkonfiguration `.qwen/settings.json` hinzugefügt.

**Befehl:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: Ein eindeutiger Name für den Server.
- `<commandOrUrl>`: Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`).
- `[args...]`: Optionale Argumente für einen `stdio`-Befehl.

**Optionen (Flags):**

- `-s, --scope`: Konfigurations-Scope (user oder project). [Standard: "project"]
- `-t, --transport`: Transporttyp (stdio, sse, http). [Standard: "stdio"]
- `-e, --env`: Umgebungsvariablen setzen (z. B. -e KEY=value).
- `-H, --header`: HTTP-Header für SSE- und HTTP-Transporte setzen (z. B. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Verbindungs-Timeout in Millisekunden setzen.
- `--trust`: Dem Server vertrauen (umgeht alle Tool-Aufruf-Bestätigungsaufforderungen).
- `--description`: Beschreibung für den Server setzen.
- `--include-tools`: Eine durch Kommas getrennte Liste der einzubindenden Tools.
- `--exclude-tools`: Eine durch Kommas getrennte Liste der auszuschließenden Tools.
- `--oauth-client-id`: OAuth-Client-ID für die MCP-Server-Authentifizierung.
- `--oauth-client-secret`: OAuth-Client-Geheimnis für die MCP-Server-Authentifizierung.
- `--oauth-redirect-uri`: OAuth-Weiterleitungs-URI (z. B. `https://your-server.com/oauth/callback`). Standardmäßig `http://localhost:7777/oauth/callback` für lokale Setups. **Wichtig für Remote-Deployments:** Wenn du Qwen Code auf Remote-/Cloud-Servern ausführst, setze dies auf eine öffentlich zugängliche URL.
- `--oauth-authorization-url`: OAuth-Autorisierungs-URL.
- `--oauth-token-url`: OAuth-Token-URL.
- `--oauth-scopes`: OAuth-Scopes (durch Kommas getrennt).

#### Hinzufügen eines Stdio-Servers

Dies ist der Standardtransport für lokale Server.

```bash
# Basic syntax
qwen mcp add <name> <command> [args...]

# Example: Adding a local server
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Example: Adding a local python server
qwen mcp add python-server python server.py --port 8080
```

#### Hinzufügen eines HTTP-Servers

Dieser Transport ist für Server gedacht, die den Streamable-HTTP-Transport verwenden.

```bash
# Basic syntax
qwen mcp add --transport http <name> <url>

# Example: Adding an HTTP server
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Example: Adding an HTTP server with an authentication header
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Hinzufügen eines SSE-Servers

Dieser Transport ist für Server gedacht, die Server-Sent Events (SSE) verwenden.

```bash
# Basic syntax
qwen mcp add --transport sse <name> <url>

# Example: Adding an SSE server
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Example: Adding an SSE server with an authentication header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Example: Adding an OAuth-enabled SSE server
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### Verwalten von Servern (`qwen mcp`)

Um alle aktuell konfigurierten MCP-Server anzuzeigen und zu verwalten, verwende den `manage`-Befehl oder einfach `qwen mcp`. Dies öffnet ein interaktives TUI-Dialogfeld, in dem du:

- Alle MCP-Server mit ihrem Verbindungsstatus anzeigen
- Server aktivieren/deaktivieren
- Verbindungen zu getrennten Servern wiederherstellen
- Tools und Prompts anzeigen, die von jedem Server bereitgestellt werden
- Server-Logs anzeigen

**Befehl:**

```bash
qwen mcp
# or
qwen mcp manage
```

Das Verwaltungsdialogfeld bietet eine visuelle Oberfläche, die den Namen jedes Servers, Konfigurationsdetails, Verbindungsstatus und verfügbare Tools/Prompts anzeigt.

### Entfernen eines Servers (`qwen mcp remove`)

Um einen Server aus deiner Konfiguration zu löschen, verwende den `remove`-Befehl mit dem Namen des Servers.

**Befehl:**

```bash
qwen mcp remove <name>
```

**Beispiel:**

```bash
qwen mcp remove my-server
```

Dies findet und löscht den Eintrag "my-server" aus dem `mcpServers`-Objekt in der entsprechenden `settings.json`-Datei, basierend auf dem Scope (`-s, --scope`).