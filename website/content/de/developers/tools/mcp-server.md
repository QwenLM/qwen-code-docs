# MCP-Server mit Qwen Code

Dieses Dokument bietet eine Anleitung zur Konfiguration und Verwendung von Model Context Protocol (MCP)-Servern mit Qwen Code.

## Was ist ein MCP-Server?

Ein MCP-Server ist eine Anwendung, die Tools und Ressourcen über das Model Context Protocol für die CLI bereitstellt und so die Interaktion mit externen Systemen und Datenquellen ermöglicht. MCP-Server fungieren als Brücke zwischen dem Modell und deiner lokalen Umgebung oder anderen Diensten wie APIs.

Ein MCP-Server ermöglicht der CLI:

- **Tools zu entdecken:** Verfügbare Tools, ihre Beschreibungen und Parameter über standardisierte Schemadefinitionen aufzulisten.
- **Tools auszuführen:** Spezifische Tools mit definierten Argumenten aufzurufen und strukturierte Antworten zu erhalten.
- **Auf Ressourcen zuzugreifen:** Daten aus bestimmten Ressourcen zu lesen (wobei sich die CLI primär auf die Tool-Ausführung konzentriert).

Mit einem MCP-Server kannst du die Funktionen der CLI über die integrierten Features hinaus erweitern, z. B. für die Interaktion mit Datenbanken, APIs, benutzerdefinierten Skripten oder spezialisierten Workflows.

## Kern-Integrationsarchitektur

Qwen Code integriert sich über ein ausgeklügeltes Entdeckungs- und Ausführungssystem, das im Core-Paket (`packages/core/src/tools/`) integriert ist, mit MCP-Servern:

### Discovery-Layer (`mcp-client.ts`)

Der Entdeckungsprozess wird von `discoverMcpTools()` orchestriert, das:

1. **Konfigurierte Server durchläuft** aus deiner `mcpServers`-Konfiguration in `settings.json`
2. **Verbindungen herstellt** unter Verwendung der passenden Transportmechanismen (Stdio, SSE oder Streamable HTTP)
3. **Tool-Definitionen abruft** von jedem Server über das MCP-Protokoll
4. **Tool-Schemas bereinigt und validiert** auf Kompatibilität mit der Qwen API
5. **Tools registriert** in der globalen Tool-Registry mit Konfliktlösung

### Execution-Layer (`mcp-tool.ts`)

Jedes entdeckte MCP-Tool wird in einer `DiscoveredMCPTool`-Instanz gekapselt, die:

- **Bestätigungslogik handhabt** basierend auf Server-Vertrauenseinstellungen und Benutzerpräferenzen
- **Tool-Ausführung verwaltet** durch Aufruf des MCP-Servers mit den richtigen Parametern
- **Antworten verarbeitet** sowohl für den LLM-Kontext als auch für die Benutzeranzeige
- **Verbindungsstatus verwaltet** und Timeouts behandelt

### Transportmechanismen

Die CLI unterstützt drei MCP-Transporttypen:

- **Stdio-Transport:** Startet einen Subprozess und kommuniziert über stdin/stdout
- **SSE-Transport:** Stellt eine Verbindung zu Server-Sent Events-Endpunkten her
- **Streamable HTTP-Transport:** Nutzt HTTP-Streaming für die Kommunikation

## So richtest du deinen MCP-Server ein

Qwen Code verwendet die `mcpServers`-Konfiguration in deiner `settings.json`-Datei, um MCP-Server zu lokalisieren und zu verbinden. Diese Konfiguration unterstützt mehrere Server mit unterschiedlichen Transportmechanismen.

### Konfiguration des MCP-Servers in settings.json

Du kannst MCP-Server in deiner `settings.json`-Datei auf zwei Hauptwegen konfigurieren: über das `mcpServers`-Objekt auf oberster Ebene für spezifische Serverdefinitionen und über das `mcp`-Objekt für globale Einstellungen, die Serverentdeckung und -ausführung steuern.

#### Globale MCP-Einstellungen (`mcp`)

Das `mcp`-Objekt in deiner `settings.json` ermöglicht es dir, globale Regeln für alle MCP-Server zu definieren.

- **`mcp.serverCommand`** (string): Ein globaler Befehl zum Starten eines MCP-Servers.
- **`mcp.allowed`** (Array von Strings): Eine Liste von MCP-Servernamen, die erlaubt sind. Wenn dies gesetzt ist, werden nur Server aus dieser Liste (die den Schlüsseln im `mcpServers`-Objekt entsprechen) verbunden.
- **`mcp.excluded`** (Array von Strings): Eine Liste von MCP-Servernamen, die ausgeschlossen werden sollen. Server in dieser Liste werden nicht verbunden.

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

Das `mcpServers`-Objekt ist der Ort, an dem du jeden einzelnen MCP-Server definierst, mit dem sich die CLI verbinden soll.

### Konfigurationsstruktur

Füge ein `mcpServers`-Objekt zu deiner `settings.json`-Datei hinzu:

```json
{ ...file contains other config objects
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
- **`httpUrl`** (string): HTTP-Streaming-Endpunkt-URL

#### Optional

- **`args`** (string[]): Befehlszeilenargumente für den Stdio-Transport
- **`headers`** (object): Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`
- **`env`** (object): Umgebungsvariablen für den Serverprozess. Werte können Umgebungsvariablen mit der `$VAR_NAME`- oder `${VAR_NAME}`-Syntax referenzieren
- **`cwd`** (string): Arbeitsverzeichnis für den Stdio-Transport
- **`timeout`** (number): Request-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)
- **`trust`** (boolean): Wenn `true`, werden alle Tool-Aufruf-Bestätigungen für diesen Server umgangen (Standard: `false`)
- **`includeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgelisteten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.
- **`excludeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgelisteten Tools stehen dem Modell nicht zur Verfügung, auch wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen.
- **`targetAudience`** (string): Die OAuth-Client-ID, die auf der IAP-geschützten Anwendung, auf die du zugreifen möchtest, auf der Allowlist steht. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, der imitiert werden soll. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.

### OAuth-Unterstützung für Remote-MCP-Server

Qwen Code unterstützt OAuth 2.0-Authentifizierung für Remote-MCP-Server über SSE- oder HTTP-Transporte. Dies ermöglicht den sicheren Zugriff auf MCP-Server, die eine Authentifizierung erfordern.

#### Automatische OAuth-Entdeckung

Für Server, die OAuth-Entdeckung unterstützen, kannst du die OAuth-Konfiguration weglassen und die CLI sie automatisch entdecken lassen:

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
- Dynamische Client-Registrierung durchführen, falls unterstützt
- Den OAuth-Flow und das Token-Management handhaben

#### Authentifizierungsablauf

Beim Verbinden mit einem OAuth-fähigen Server:

1. **Erster Verbindungsversuch** schlägt mit 401 Unauthorized fehl
2. **OAuth-Entdeckung** findet Autorisierungs- und Token-Endpunkte
3. **Browser öffnet sich** zur Benutzerauthentifizierung (erfordert lokalen Browserzugriff)
4. **Autorisierungscode** wird gegen Access-Tokens eingetauscht
5. **Tokens werden sicher gespeichert** für die zukünftige Verwendung
6. **Verbindungs-Wiederholung** gelingt mit gültigen Tokens

#### Browser-Redirect-Anforderungen

**Wichtig:** Für die OAuth-Authentifizierung muss dein lokaler Rechner in der Lage sein:

- Einen Webbrowser zur Authentifizierung zu öffnen
- Redirects auf `http://localhost:7777/oauth/callback` zu empfangen

Dieses Feature funktioniert nicht in:

- Headless-Umgebungen ohne Browserzugriff
- Remote-SSH-Sessions ohne X11-Forwarding
- Containerisierten Umgebungen ohne Browserunterstützung

#### OAuth-Authentifizierung verwalten

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

- **`enabled`** (boolean): OAuth für diesen Server aktivieren
- **`clientId`** (string): OAuth-Client-Identifier (optional bei dynamischer Registrierung)
- **`clientSecret`** (string): OAuth-Client-Secret (optional für öffentliche Clients)
- **`authorizationUrl`** (string): OAuth-Autorisierungs-Endpunkt (wird bei Weglassung automatisch entdeckt)
- **`tokenUrl`** (string): OAuth-Token-Endpunkt (wird bei Weglassung automatisch entdeckt)
- **`scopes`** (string[]): Erforderliche OAuth-Scopes
- **`redirectUri`** (string): Benutzerdefinierte Redirect-URI (Standard: `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (string): Query-Parametername für Tokens in SSE-URLs
- **`audiences`** (string[]): Zielgruppen, für die das Token gültig ist

#### Token-Management

OAuth-Tokens werden automatisch:

- **Sicher gespeichert** in `~/.qwen/mcp-oauth-tokens.json`
- **Aktualisiert**, wenn sie ablaufen (sofern Refresh-Tokens verfügbar sind)
- **Validiert** vor jedem Verbindungsversuch
- **Bereinigt**, wenn sie ungültig oder abgelaufen sind

#### Authentifizierungsanbieter-Typ

Du kannst den Authentifizierungsanbieter-Typ über die `authProviderType`-Eigenschaft angeben:

- **`authProviderType`** (string): Gibt den Authentifizierungsanbieter an. Kann einer der folgenden sein:
  - **`dynamic_discovery`** (Standard): Die CLI entdeckt die OAuth-Konfiguration automatisch vom Server.
  - **`google_credentials`**: Die CLI verwendet die Google Application Default Credentials (ADC) zur Authentifizierung beim Server. Bei Verwendung dieses Anbieters musst du die erforderlichen Scopes angeben.
  - **`service_account_impersonation`**: Die CLI imitiert einen Google Cloud Service Account zur Authentifizierung beim Server. Dies ist nützlich für den Zugriff auf IAP-geschützte Dienste (dies wurde speziell für Cloud Run-Dienste entwickelt).

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

- **`targetAudience`** (string): Die OAuth-Client-ID, die auf der Allowlist der IAP-geschützten Anwendung steht, auf die du zugreifen möchtest.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, der imitiert werden soll.

Die CLI verwendet deine lokalen Application Default Credentials (ADC), um ein OIDC-ID-Token für den angegebenen Service Account und die Zielgruppe zu generieren. Dieses Token wird dann zur Authentifizierung beim MCP-Server verwendet.

#### Einrichtungsanleitung

1. **[Erstelle](https://cloud.google.com/iap/docs/oauth-client-creation) oder verwende eine bestehende OAuth 2.0-Client-ID.** Um eine bestehende OAuth 2.0-Client-ID zu verwenden, folge den Schritten unter [So teilst du OAuth-Clients](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Füge die OAuth-ID zur Allowlist für [programmatic access](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) der Anwendung hinzu.** Da Cloud Run noch kein unterstützter Ressourcentyp in `gcloud iap` ist, musst du die Client-ID auf Projektebene auf die Allowlist setzen.
3. **Erstelle ein Service Account.** [Dokumentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Cloud Console Link](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Füge sowohl das Service Account als auch die Benutzer zur IAP-Richtlinie hinzu** im Tab "Sicherheit" des Cloud Run-Dienstes selbst oder über `gcloud`.
5. **Gewähre allen Benutzern und Gruppen**, die auf den MCP-Server zugreifen werden, die notwendigen Berechtigungen, um [das Service Account zu imitieren](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (d. h. `roles/iam.serviceAccountTokenCreator`).
6. **[Aktiviere](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) die IAM Credentials API** für dein Projekt.

### Beispielkonfigurationen

#### Python MCP-Server (Stdio)

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

#### Node.js MCP-Server (Stdio)

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

### SSE MCP-Server mit SA-Impersonation

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

## Discovery-Prozess im Detail

Wenn Qwen Code startet, führt es die MCP-Server-Entdeckung durch den folgenden detaillierten Prozess durch:

### 1. Server-Iteration und Verbindung

Für jeden konfigurierten Server in `mcpServers`:

1. **Status-Tracking beginnt:** Der Serverstatus wird auf `CONNECTING` gesetzt
2. **Transportauswahl:** Basierend auf den Konfigurationseigenschaften:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Verbindungsaufbau:** Der MCP-Client versucht, sich mit dem konfigurierten Timeout zu verbinden
4. **Fehlerbehandlung:** Verbindungsfehler werden protokolliert und der Serverstatus auf `DISCONNECTED` gesetzt

### 2. Tool-Entdeckung

Nach erfolgreicher Verbindung:

1. **Tool-Auflistung:** Der Client ruft den Tool-Auflistungs-Endpunkt des MCP-Servers auf
2. **Schema-Validierung:** Die Funktionsdeklaration jedes Tools wird validiert
3. **Tool-Filterung:** Tools werden basierend auf der `includeTools`- und `excludeTools`-Konfiguration gefiltert
4. **Namensbereinigung:** Tool-Namen werden bereinigt, um die Anforderungen der Qwen API zu erfüllen:
   - Ungültige Zeichen (nicht alphanumerisch, Unterstrich, Punkt, Bindestrich) werden durch Unterstriche ersetzt
   - Namen, die länger als 63 Zeichen sind, werden mit einem mittleren Ersatz (`___`) gekürzt

### 3. Konfliktlösung

Wenn mehrere Server Tools mit demselben Namen bereitstellen:

1. **Erste Registrierung gewinnt:** Der erste Server, der einen Tool-Namen registriert, erhält den nicht-präfixierten Namen
2. **Automatische Präfixierung:** Nachfolgende Server erhalten präfixierte Namen: `serverName__toolName`
3. **Registry-Tracking:** Die Tool-Registry verwaltet Mappings zwischen Servernamen und ihren Tools

### 4. Schema-Verarbeitung

Tool-Parameter-Schemas werden für die API-Kompatibilität bereinigt:

- **`$schema`-Eigenschaften** werden entfernt
- **`additionalProperties`** werden entfernt
- **`anyOf` mit `default`** verlieren ihre Standardwerte (Vertex AI-Kompatibilität)
- **Rekursive Verarbeitung** wird auf verschachtelte Schemas angewendet

### 5. Verbindungsverwaltung

Nach der Entdeckung:

- **Persistente Verbindungen:** Server, die Tools erfolgreich registrieren, behalten ihre Verbindungen
- **Bereinigung:** Server, die keine nutzbaren Tools bereitstellen, schließen ihre Verbindungen
- **Status-Updates:** Finale Serverstatus werden auf `CONNECTED` oder `DISCONNECTED` gesetzt

## Tool-Ausführungsablauf

Wenn das Modell beschließt, ein MCP-Tool zu verwenden, findet folgender Ausführungsablauf statt:

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

- **Server-Ebene:** `serverName` → Alle Tools von diesem Server sind vertrauenswürdig
- **Tool-Ebene:** `serverName.toolName` → Dieses spezifische Tool ist vertrauenswürdig

#### Umgang mit Benutzerentscheidungen

Wenn eine Bestätigung erforderlich ist, können Benutzer wählen:

- **Einmal fortfahren:** Nur dieses Mal ausführen
- **Dieses Tool immer erlauben:** Zur Tool-Ebene Allowlist hinzufügen
- **Diesen Server immer erlauben:** Zur Server-Ebene Allowlist hinzufügen
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

### 4. Antwortbehandlung

Das Ausführungsergebnis enthält:

- **`llmContent`:** Rohe Antwortteile für den Kontext des Sprachmodells
- **`returnDisplay`:** Formatierter Output für die Benutzeranzeige (oft JSON in Markdown-Codeblöcken)

## So interagierst du mit deinem MCP-Server

### Verwendung des `/mcp`-Befehls

Der `/mcp`-Befehl bietet umfassende Informationen über dein MCP-Server-Setup:

```bash
/mcp
```

Dies zeigt:

- **Serverliste:** Alle konfigurierten MCP-Server
- **Verbindungsstatus:** `CONNECTED`, `CONNECTING` oder `DISCONNECTED`
- **Serverdetails:** Konfigurationszusammenfassung (ohne sensible Daten)
- **Verfügbare Tools:** Liste der Tools von jedem Server mit Beschreibungen
- **Discovery-Status:** Gesamtstatus des Entdeckungsprozesses

### Beispiel-/mcp-Output

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

Sobald sie entdeckt wurden, stehen MCP-Tools dem Qwen-Modell wie integrierte Tools zur Verfügung. Das Modell wird automatisch:

1. **Passende Tools auswählen** basierend auf deinen Anfragen
2. **Bestätigungsdialoge anzeigen** (sofern der Server nicht vertrauenswürdig ist)
3. **Tools ausführen** mit den richtigen Parametern
4. **Ergebnisse anzeigen** in einem benutzerfreundlichen Format

## Statusüberwachung und Fehlerbehebung

### Verbindungszustände

Die MCP-Integration verfolgt mehrere Zustände:

#### Serverstatus (`MCPServerStatus`)

- **`DISCONNECTED`:** Server ist nicht verbunden oder weist Fehler auf
- **`CONNECTING`:** Verbindungsversuch läuft
- **`CONNECTED`:** Server ist verbunden und bereit

#### Discovery-Status (`MCPDiscoveryState`)

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
5. **Berechtigungen prüfen:** Stelle sicher, dass die CLI den Serverbefehl ausführen darf

#### Keine Tools entdeckt

**Symptome:** Server verbindet sich, aber keine Tools sind verfügbar

**Fehlerbehebung:**

1. **Tool-Registrierung prüfen:** Stelle sicher, dass dein Server tatsächlich Tools registriert
2. **MCP-Protokoll prüfen:** Bestätige, dass dein Server die MCP-Tool-Auflistung korrekt implementiert
3. **Server-Logs prüfen:** Prüfe die stderr-Ausgabe auf serverseitige Fehler
4. **Tool-Auflistung testen:** Teste manuell den Tool-Entdeckungs-Endpunkt deines Servers

#### Tools werden nicht ausgeführt

**Symptome:** Tools werden entdeckt, schlagen aber während der Ausführung fehl

**Fehlerbehebung:**

1. **Parametervalidierung:** Stelle sicher, dass dein Tool die erwarteten Parameter akzeptiert
2. **Schema-Kompatibilität:** Prüfe, ob deine Input-Schemas gültiges JSON Schema sind
3. **Fehlerbehandlung:** Prüfe, ob dein Tool nicht abgefangene Exceptions wirft
4. **Timeout-Probleme:** Erwäge, die `timeout`-Einstellung zu erhöhen

#### Sandbox-Kompatibilität

**Symptome:** MCP-Server schlagen fehl, wenn Sandboxing aktiviert ist

**Lösungen:**

1. **Docker-basierte Server:** Verwende Docker-Container, die alle Abhängigkeiten enthalten
2. **Pfadzugriff:** Stelle sicher, dass Server-Executables in der Sandbox verfügbar sind
3. **Netzwerkzugriff:** Konfiguriere die Sandbox so, dass notwendige Netzwerkverbindungen erlaubt sind
4. **Umgebungsvariablen:** Prüfe, ob erforderliche Umgebungsvariablen durchgereicht werden

### Debugging-Tipps

1. **Debug-Modus aktivieren:** Führe die CLI mit `--debug` für eine ausführliche Ausgabe aus
2. **stderr prüfen:** Die stderr-Ausgabe des MCP-Servers wird erfasst und protokolliert (INFO-Meldungen werden gefiltert)
3. **Isoliert testen:** Teste deinen MCP-Server unabhängig, bevor du ihn integrierst
4. **Inkrementelles Setup:** Beginne mit einfachen Tools, bevor du komplexe Funktionen hinzufügst
5. **Verwende `/mcp` häufig:** Überwache den Serverstatus während der Entwicklung

## Wichtige Hinweise

### Sicherheitsaspekte

- **Vertrauenseinstellungen:** Die `trust`-Option umgeht alle Bestätigungsdialoge. Verwende sie vorsichtig und nur für Server, die du vollständig kontrollierst
- **Access-Tokens:** Sei sicherheitsbewusst, wenn du Umgebungsvariablen konfigurierst, die API-Keys oder Tokens enthalten
- **Sandbox-Kompatibilität:** Stelle bei Verwendung von Sandboxing sicher, dass MCP-Server innerhalb der Sandbox-Umgebung verfügbar sind
- **Private Daten:** Die Verwendung von weit gefassten Personal Access Tokens kann zu Informationslecks zwischen Repositories führen

### Performance- und Ressourcenmanagement

- **Verbindungspersistenz:** Die CLI hält persistente Verbindungen zu Servern aufrecht, die Tools erfolgreich registriert haben
- **Automatische Bereinigung:** Verbindungen zu Servern, die keine Tools bereitstellen, werden automatisch geschlossen
- **Timeout-Management:** Konfiguriere angemessene Timeouts basierend auf den Antwortmerkmalen deines Servers
- **Ressourcenüberwachung:** MCP-Server laufen als separate Prozesse und verbrauchen Systemressourcen

### Schema-Kompatibilität

- **Schema-Compliance-Modus:** Standardmäßig (`schemaCompliance: "auto"`) werden Tool-Schemas unverändert durchgereicht. Setze `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` in deiner `settings.json`, um Modelle in das strikte OpenAPI 3.0-Format zu konvertieren.
- **OpenAPI 3.0-Transformationen:** Wenn der `openapi_30`-Modus aktiviert ist, verarbeitet das System:
  - Nullable-Typen: `["string", "null"]` -> `type: "string", nullable: true`
  - Const-Werte: `const: "foo"` -> `enum: ["foo"]`
  - Exklusive Limits: numerisches `exclusiveMinimum` -> boolesche Form mit `minimum`
  - Keyword-Entfernung: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Namensbereinigung:** Tool-Namen werden automatisch bereinigt, um API-Anforderungen zu erfüllen
- **Konfliktlösung:** Tool-Namenskonflikte zwischen Servern werden durch automatische Präfixierung gelöst

Diese umfassende Integration macht MCP-Server zu einer leistungsstarken Möglichkeit, die Funktionen der CLI zu erweitern, während Sicherheit, Zuverlässigkeit und Benutzerfreundlichkeit gewahrt bleiben.

## Rückgabe von Rich Content aus Tools

MCP-Tools sind nicht auf die Rückgabe von einfachem Text beschränkt. Du kannst umfangreiche, mehrteilige Inhalte zurückgeben, einschließlich Text, Bildern, Audio und anderen Binärdaten in einer einzigen Tool-Antwort. Dies ermöglicht dir, leistungsstarke Tools zu erstellen, die dem Modell in einem einzigen Turn vielfältige Informationen bereitstellen können.

Alle vom Tool zurückgegebenen Daten werden verarbeitet und als Kontext für die nächste Generation an das Modell gesendet, sodass es über die bereitgestellten Informationen nachdenken oder sie zusammenfassen kann.

### So funktioniert es

Um Rich Content zurückzugeben, muss die Antwort deines Tools der MCP-Spezifikation für ein [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) entsprechen. Das `content`-Feld des Ergebnisses sollte ein Array von `ContentBlock`-Objekten sein. Die CLI verarbeitet dieses Array korrekt, trennt Text von Binärdaten und verpackt es für das Modell.

Du kannst verschiedene Content-Block-Typen im `content`-Array kombinieren. Die unterstützten Blocktypen umfassen:

- `text`
- `image`
- `audio`
- `resource` (eingebetteter Inhalt)
- `resource_link`

### Beispiel: Rückgabe von Text und einem Bild

Hier ist ein Beispiel für eine gültige JSON-Antwort von einem MCP-Tool, das sowohl eine Textbeschreibung als auch ein Bild zurückgibt:

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
3. Eine saubere, benutzerfreundliche Zusammenfassung in der CLI anzeigen, die darauf hinweist, dass sowohl Text als auch ein Bild empfangen wurden.

Dies ermöglicht dir, ausgefeilte Tools zu erstellen, die dem Qwen-Modell einen umfangreichen, multimodalen Kontext bereitstellen können.

## MCP-Prompts als Slash-Befehle

Zusätzlich zu Tools können MCP-Server vordefinierte Prompts bereitstellen, die als Slash-Befehle innerhalb von Qwen Code ausgeführt werden können. Dies ermöglicht dir, Shortcuts für häufige oder komplexe Abfragen zu erstellen, die einfach per Name aufgerufen werden können.

### Definieren von Prompts auf dem Server

Hier ist ein kleines Beispiel für einen Stdio-MCP-Server, der Prompts definiert:

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

Dies kann in `settings.json` unter `mcpServers` mit folgendem Eintrag eingebunden werden:

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

oder, unter Verwendung von Positionsargumenten:

```bash
/poem-writer "Qwen Code" reverent
```

Wenn du diesen Befehl ausführst, führt die CLI die `prompts/get`-Methode auf dem MCP-Server mit den bereitgestellten Argumenten aus. Der Server ist dafür verantwortlich, die Argumente in die Prompt-Vorlage einzusetzen und den finalen Prompt-Text zurückzugeben. Die CLI sendet diesen Prompt dann zur Ausführung an das Modell. Dies bietet eine bequeme Möglichkeit, häufige Workflows zu automatisieren und zu teilen.

## Verwaltung von MCP-Servern mit `qwen mcp`

Während du MCP-Server immer durch manuelles Bearbeiten deiner `settings.json`-Datei konfigurieren kannst, bietet die CLI einen praktischen Satz von Befehlen, um deine Serverkonfigurationen programmatisch zu verwalten. Diese Befehle vereinfachen das Hinzufügen, Auflisten und Entfernen von MCP-Servern, ohne JSON-Dateien direkt bearbeiten zu müssen.

### Hinzufügen eines Servers (`qwen mcp add`)

Der `add`-Befehl konfiguriert einen neuen MCP-Server in deiner `settings.json`. Basierend auf dem Scope (`-s, --scope`) wird er entweder zur Benutzerkonfiguration `~/.qwen/settings.json` oder zur Projektkonfiguration `.qwen/settings.json` hinzugefügt.

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
- `--include-tools`: Eine durch Kommas getrennte Liste von Tools, die eingeschlossen werden sollen.
- `--exclude-tools`: Eine durch Kommas getrennte Liste von Tools, die ausgeschlossen werden sollen.

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

Dieser Transport ist für Server gedacht, die den streamable HTTP-Transport verwenden.

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
```

### Verwalten von Servern (`qwen mcp`)

Um alle aktuell konfigurierten MCP-Server anzuzeigen und zu verwalten, verwende den `manage`-Befehl oder einfach `qwen mcp`. Dies öffnet einen interaktiven TUI-Dialog, in dem du:

- Alle MCP-Server mit ihrem Verbindungsstatus anzeigen kannst
- Server aktivieren/deaktivieren kannst
- Dich mit getrennten Servern erneut verbinden kannst
- Tools und Prompts anzeigen kannst, die von jedem Server bereitgestellt werden
- Server-Logs anzeigen kannst

**Befehl:**

```bash
qwen mcp
# or
qwen mcp manage
```

Der Verwaltungsdialog bietet eine visuelle Oberfläche, die den Namen jedes Servers, Konfigurationsdetails, Verbindungsstatus und verfügbare Tools/Prompts anzeigt.

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

Dies sucht und löscht den "my-server"-Eintrag aus dem `mcpServers`-Objekt in der entsprechenden `settings.json`-Datei basierend auf dem Scope (`-s, --scope`).