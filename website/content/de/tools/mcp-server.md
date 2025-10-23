# MCP-Server mit Qwen Code

Dieses Dokument bietet eine Anleitung zur Konfiguration und Verwendung von Model Context Protocol (MCP)-Servern mit Qwen Code.

## Was ist ein MCP-Server?

Ein MCP-Server ist eine Anwendung, die Tools und Ressourcen über das Model Context Protocol für die CLI verfügbar macht, wodurch diese mit externen Systemen und Datenquellen interagieren kann. MCP-Server fungieren als Brücke zwischen dem Modell und deiner lokalen Umgebung oder anderen Services wie APIs.

Ein MCP-Server ermöglicht der CLI Folgendes:

- **Tools entdecken:** Verfügbare Tools, deren Beschreibungen und Parameter über standardisierte Schema-Definitionen auflisten.
- **Tools ausführen:** Bestimmte Tools mit definierten Argumenten aufrufen und strukturierte Antworten erhalten.
- **Auf Ressourcen zugreifen:** Daten aus bestimmten Ressourcen lesen (wobei sich die CLI hauptsächlich auf die Tool-Ausführung konzentriert).

Mit einem MCP-Server kannst du die Fähigkeiten der CLI erweitern, um Aktionen auszuführen, die über die integrierten Funktionen hinausgehen, wie z. B. die Interaktion mit Datenbanken, APIs, benutzerdefinierten Skripten oder spezialisierten Workflows.

## Core Integration Architecture

Qwen Code integriert sich über MCP-Server durch ein ausgeklügeltes Discovery- und Execution-System, das im Core-Package implementiert ist (`packages/core/src/tools/`):

### Discovery Layer (`mcp-client.ts`)

Der Discover-Prozess wird von `discoverMcpTools()` orchestriert, welches:

1. **Durchläuft die konfigurierten Server** aus der `mcpServers`-Konfiguration in deiner `settings.json`
2. **Stellt Verbindungen her** unter Verwendung geeigneter Transportmechanismen (Stdio, SSE oder Streamable HTTP)
3. **Ruft Tool-Definitionen** von jedem Server mittels des MCP-Protokolls ab
4. **Bereinigt und validiert** die Tool-Schemas für Kompatibilität mit der Qwen-API
5. **Registriert Tools** im globalen Tool-Registry mit Konfliktlösung

### Execution Layer (`mcp-tool.ts`)

Jedes gefundene MCP-Tool wird in eine `DiscoveredMCPTool`-Instanz verpackt, die:

- **Bestätigungslogik behandelt**, basierend auf den Server-Vertrauenseinstellungen und Benutzerpräferenzen
- **Tool-Ausführung verwaltet**, indem der MCP-Server mit korrekten Parametern aufgerufen wird
- **Antworten verarbeitet**, sowohl für den LLM-Kontext als auch zur Anzeige für den Benutzer
- **Verbindungsstatus verwaltet** und Timeouts behandelt

### Transportmechanismen

Die CLI unterstützt drei MCP-Transporttypen:

- **Stdio Transport:** Startet einen Subprozess und kommuniziert über stdin/stdout
- **SSE Transport:** Verbindet sich mit Server-Sent Events Endpoints
- **Streamable HTTP Transport:** Nutzt HTTP Streaming zur Kommunikation

## Wie du deinen MCP-Server einrichtest

Qwen Code verwendet die `mcpServers`-Konfiguration in deiner `settings.json`-Datei, um MCP-Server zu finden und sich mit ihnen zu verbinden. Diese Konfiguration unterstützt mehrere Server mit unterschiedlichen Transportmechanismen.

### Konfiguriere den MCP-Server in settings.json

Du kannst MCP-Server in deiner `settings.json` Datei auf zwei Hauptarten konfigurieren: über das Top-Level `mcpServers` Objekt für spezifische Server-Definitionen und über das `mcp` Objekt für globale Einstellungen, die die Server-Erkennung und Ausführung steuern.

#### Globale MCP-Einstellungen (`mcp`)

Das `mcp` Objekt in deiner `settings.json` erlaubt dir globale Regeln für alle MCP-Server zu definieren.

- **`mcp.serverCommand`** (string): Ein globaler Befehl zum Starten eines MCP-Servers.
- **`mcp.allowed`** (Array aus Strings): Eine Liste von MCP-Server-Namen, die erlaubt sind. Wenn dies gesetzt ist, werden nur Server aus dieser Liste (die mit den Keys im `mcpServers` Objekt übereinstimmen) verbunden.
- **`mcp.excluded`** (Array aus Strings): Eine Liste von MCP-Server-Namen, die ausgeschlossen sind. Server in dieser Liste werden nicht verbunden.

**Beispiel:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### Server-spezifische Konfiguration (`mcpServers`)

Das `mcpServers`-Objekt ist der Ort, an dem du jeden einzelnen MCP-Server definierst, mit dem sich die CLI verbinden soll.

### Konfigurationsstruktur

Füge ein `mcpServers`-Objekt zu deiner `settings.json`-Datei hinzu:

```json
{ ...Datei enthält andere Konfigurationsobjekte
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

Jede Server-Konfiguration unterstützt folgende Eigenschaften:

#### Erforderlich (eine der folgenden)

- **`command`** (string): Pfad zur ausführbaren Datei für den Stdio-Transport
- **`url`** (string): SSE-Endpoint-URL (z. B. `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): HTTP-Streaming-Endpoint-URL

#### Optional

- **`args`** (string[]): Kommandozeilenargumente für den Stdio-Transport
- **`headers`** (object): Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`
- **`env`** (object): Umgebungsvariablen für den Server-Prozess. Werte können mithilfe der Syntax `$VAR_NAME` oder `${VAR_NAME}` auf Umgebungsvariablen verweisen
- **`cwd`** (string): Arbeitsverzeichnis für den Stdio-Transport
- **`timeout`** (number): Request-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)
- **`trust`** (boolean): Wenn `true`, werden alle Tool-Aufrufbestätigungen für diesen Server umgangen (Standard: `false`)
- **`includeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server eingebunden werden sollen. Wenn angegeben, sind nur die hier gelisteten Tools von diesem Server verfügbar (Allowlist-Verhalten). Falls nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.
- **`excludeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier gelisteten Tools stehen dem Modell nicht zur Verfügung, selbst wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen enthalten ist, wird es ausgeschlossen.
- **`targetAudience`** (string): Die OAuth Client ID, die in der IAP-geschützten Anwendung allowlisted ist, auf die du zugreifen möchtest. Wird verwendet mit `authProviderType: 'service_account_impersonation'`.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, der impersonated werden soll. Wird verwendet mit `authProviderType: 'service_account_impersonation'`.

### OAuth-Unterstützung für Remote-MCP-Server

Qwen Code unterstützt die OAuth 2.0-Authentifizierung für Remote-MCP-Server über SSE- oder HTTP-Transports. Dies ermöglicht sicheren Zugriff auf MCP-Server, die eine Authentifizierung erfordern.

#### Automatische OAuth-Erkennung

Für Server, die OAuth-Discovery unterstützen, kannst du die OAuth-Konfiguration weglassen und die automatische Erkennung durch die CLI zulassen:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

Die CLI führt dann automatisch folgende Schritte aus:

- Erkennt, wenn ein Server eine OAuth-Authentifizierung benötigt (401-Antworten)
- Findet OAuth-Endpunkte über die Server-Metadaten
- Führt eine dynamische Client-Registrierung durch, falls unterstützt
- Verarbeitet den OAuth-Ablauf und das Token-Management

#### Authentifizierungsablauf

Beim Verbinden mit einem OAuth-fähigen Server:

1. **Erster Verbindungsversuch** schlägt mit 401 Unauthorized fehl
2. **OAuth-Discovery** findet Authorization- und Token-Endpoints
3. **Browser öffnet sich** für die Benutzerauthentifizierung (erfordert lokalen Browserzugriff)
4. **Authorization Code** wird gegen Access Tokens eingetauscht
5. **Tokens werden sicher gespeichert** für zukünftige Verwendung
6. **Verbindungsneuversuch** gelingt mit gültigen Tokens

#### Browser-Redirect-Anforderungen

**Wichtig:** Die OAuth-Authentifizierung erfordert, dass dein lokaler Rechner:

- Einen Webbrowser für die Authentifizierung öffnen kann
- Redirects unter `http://localhost:7777/oauth/callback` empfangen kann

Dieses Feature funktioniert nicht in:

- Headless-Umgebungen ohne Browserzugriff
- Remote-SSH-Sessions ohne X11-Weiterleitung
- Containerisierten Umgebungen ohne Browser-Unterstützung

#### Verwalten der OAuth-Authentifizierung

Verwende den Befehl `/mcp auth`, um die OAuth-Authentifizierung zu verwalten:

```bash

# Server auflisten, die Authentifizierung erfordern
/mcp auth
```

```markdown
# Authentifizierung mit einem bestimmten Server
/mcp auth serverName

# Erneute Authentifizierung, wenn Token abgelaufen sind
/mcp auth serverName
```

#### OAuth-Konfigurationseigenschaften

- **`enabled`** (boolean): Aktiviert OAuth für diesen Server
- **`clientId`** (string): OAuth-Client-ID (optional bei dynamischer Registrierung)
- **`clientSecret`** (string): OAuth-Client-Secret (optional für Public Clients)
- **`authorizationUrl`** (string): OAuth-Autorisierungs-Endpoint (wird automatisch erkannt, wenn weggelassen)
- **`tokenUrl`** (string): OAuth-Token-Endpoint (wird automatisch erkannt, wenn weggelassen)
- **`scopes`** (string[]): Erforderliche OAuth-Scopes
- **`redirectUri`** (string): Benutzerdefinierte Redirect-URI (Standardwert: `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (string): Name des Query-Parameters für Tokens in SSE-URLs
- **`audiences`** (string[]): Zielgruppen, für die der Token gültig ist
```

#### Token Management

OAuth-Tokens werden automatisch:

- **Sicher gespeichert** in `~/.qwen/mcp-oauth-tokens.json`
- **Erneuert**, wenn sie abgelaufen sind (sofern Refresh-Tokens verfügbar sind)
- **Validiert** vor jedem Verbindungsversuch
- **Bereinigt**, wenn sie ungültig oder abgelaufen sind

#### Authentifizierungs-Provider-Typ

Du kannst den Authentifizierungs-Provider-Typ über die `authProviderType`-Property angeben:

- **`authProviderType`** (string): Gibt den Authentifizierungs-Provider an. Mögliche Werte:
  - **`dynamic_discovery`** (Standard): Die CLI ermittelt die OAuth-Konfiguration automatisch vom Server.
  - **`google_credentials`**: Die CLI verwendet die Google Application Default Credentials (ADC), um sich beim Server zu authentifizieren. Bei Verwendung dieses Providers musst du die benötigten Scopes angeben.
  - **`service_account_impersonation`**: Die CLI impersoniert einen Google Cloud Service Account, um sich beim Server zu authentifizieren. Das ist nützlich für den Zugriff auf IAP-geschützte Services (wurde speziell für Cloud Run Services entwickelt).

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

Um dich mit einem Server über Service Account Impersonation zu authentifizieren, musst du den `authProviderType` auf `service_account_impersonation` setzen und die folgenden Eigenschaften angeben:

- **`targetAudience`** (string): Die OAuth Client ID, die in der Allowlist der IAP-geschützten Anwendung enthalten ist, auf die du zugreifen möchtest.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, dessen Identität angenommen werden soll.

Die CLI verwendet deine lokalen Application Default Credentials (ADC), um ein OIDC-ID-Token für den angegebenen Service Account und die Zielgruppe zu generieren. Dieses Token wird dann zur Authentifizierung beim MCP-Server verwendet.

#### Setup-Anweisungen

1. **[Erstelle](https://cloud.google.com/iap/docs/oauth-client-creation) oder verwende eine vorhandene OAuth 2.0 Client-ID.** Um eine bestehende OAuth 2.0 Client-ID zu verwenden, folge den Schritten unter [How to share OAuth Clients](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Füge die OAuth-ID zur Allowlist für den [programmatischen Zugriff](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) für die Anwendung hinzu.** Da Cloud Run noch kein unterstützter Ressourcentyp in gcloud iap ist, musst du die Client-ID auf Projektebene auf die Allowlist setzen.
3. **Erstelle einen Service Account.** [Dokumentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Cloud Console Link](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Füge sowohl den Service Account als auch die Benutzer zur IAP-Richtlinie hinzu** im „Security“-Tab des Cloud Run Services selbst oder über gcloud.
5. **Gib allen Benutzern und Gruppen**, die auf den MCP Server zugreifen werden, die erforderlichen Berechtigungen, um den [Service Account zu impersonalisieren](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (d. h. `roles/iam.serviceAccountTokenCreator`).
6. **[Aktiviere](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) die IAM Credentials API** für dein Projekt.

### Beispielkonfigurationen

#### Python MCP Server (Stdio)

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

#### Node.js MCP Server (Stdio)

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

#### Docker-basierter MCP Server

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

#### HTTP-basierter MCP Server

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

#### HTTP-basierter MCP Server mit Custom Headern

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

#### MCP Server mit Tool-Filtering

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

### SSE MCP Server mit SA-Impersonation

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

## Deep Dive in den Discovery-Prozess

Wenn Qwen Code startet, führt es die MCP-Server-Discovery durch den folgenden detaillierten Prozess durch:

### 1. Server-Iteration und Verbindung

Für jeden konfigurierten Server in `mcpServers`:

1. **Statusverfolgung beginnt:** Der Serverstatus wird auf `CONNECTING` gesetzt
2. **Transport-Auswahl:** Basierend auf den Konfigurationseigenschaften:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Verbindungsaufbau:** Der MCP-Client versucht, eine Verbindung mit dem konfigurierten Timeout herzustellen
4. **Fehlerbehandlung:** Verbindungsfehler werden protokolliert und der Serverstatus auf `DISCONNECTED` gesetzt

### 2. Tool Discovery

Nach erfolgreicher Verbindung:

1. **Tool-Auflistung:** Der Client ruft den Tool-Listing-Endpoint des MCP-Servers auf
2. **Schema-Validierung:** Die Funktionsdeklaration jedes Tools wird validiert
3. **Tool-Filterung:** Tools werden basierend auf der `includeTools`- und `excludeTools`-Konfiguration gefiltert
4. **Namensbereinigung:** Tool-Namen werden bereinigt, um den Qwen-API-Anforderungen zu entsprechen:
   - Ungültige Zeichen (nicht alphanumerisch, Unterstrich, Punkt, Bindestrich) werden durch Unterstriche ersetzt
   - Namen, die länger als 63 Zeichen sind, werden gekürzt mit mittlerem Ersatz (`___`)

### 3. Konfliktlösung

Wenn mehrere Server Tools mit demselben Namen anbieten:

1. **First-come-first-served:** Der erste Server, der einen Tool-Namen registriert, erhält den unpräfixten Namen
2. **Automatische Präfixierung:** Nachfolgende Server erhalten vorangestellte Namen: `serverName__toolName`
3. **Registry-Verfolgung:** Die Tool-Registry verwaltet die Zuordnungen zwischen Servernamen und deren Tools

### 4. Schema-Verarbeitung

Tool-Parameter-Schemas werden für die API-Kompatibilität bereinigt:

- **`$schema`-Eigenschaften** werden entfernt
- **`additionalProperties`** werden gestrippt
- **`anyOf` mit `default`** bekommen ihre Default-Werte entfernt (Vertex AI-Kompatibilität)
- **Rekursive Verarbeitung** wird auf verschachtelte Schemas angewendet

### 5. Verbindungsmanagement

Nach der Discovery:

- **Persistente Verbindungen:** Server, die Tools erfolgreich registrieren, behalten ihre Verbindungen bei
- **Aufräumen:** Server, die keine nutzbaren Tools bereitstellen, bekommen ihre Verbindungen geschlossen
- **Statusaktualisierungen:** Die finalen Server-Status werden auf `CONNECTED` oder `DISCONNECTED` gesetzt

## Tool-Ausführungsflow

Wenn das Modell beschließt, ein MCP-Tool zu verwenden, erfolgt der folgende Ausführungsflow:

### 1. Tool-Aufruf

Das Modell generiert einen `FunctionCall` mit:

- **Tool-Name:** Der registrierte Name (möglicherweise mit Präfix)
- **Argumente:** JSON-Objekt, das dem Parameter-Schema des Tools entspricht

### 2. Bestätigungsprozess

Jedes `DiscoveredMCPTool` implementiert eine ausgeklügelte Bestätigungslogik:

#### Trust-basierte Umgehung

```typescript
if (this.trust) {
  return false; // Keine Bestätigung erforderlich
}
```

#### Dynamische Allow-listing

Das System verwaltet interne Allow-lists für:

- **Server-Ebene:** `serverName` → Alle Tools von diesem Server werden vertraut
- **Tool-Ebene:** `serverName.toolName` → Dieses spezifische Tool wird vertraut

#### Umgang mit Benutzerentscheidungen

Wenn eine Bestätigung erforderlich ist, können Benutzer folgende Optionen wählen:

- **Einmalig fortfahren:** Nur diesmal ausführen
- **Dieses Tool immer erlauben:** Zur Tool-Ebene Allow-list hinzufügen
- **Diesen Server immer erlauben:** Zur Server-Ebene Allow-list hinzufügen
- **Abbrechen:** Ausführung abbrechen

### 3. Ausführung

Nach Bestätigung (oder Umgehung der Vertrauensprüfung):

1. **Parameter vorbereiten:** Argumente werden gegen das Schema des Tools validiert
2. **MCP-Aufruf:** Das zugrunde liegende `CallableTool` ruft den Server auf mit:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Originaler Server-Tool-Name
       args: params,
     },
   ];
   ```

3. **Antwortverarbeitung:** Ergebnisse werden für den LLM-Kontext und die Benutzeranzeige formatiert

### 4. Umgang mit der Antwort

Das Ausführungsergebnis enthält:

- **`llmContent`:** Rohdaten der Antwortanteile für den Kontext des Sprachmodells
- **`returnDisplay`:** Formatierter Output für die Benutzeranzeige (häufig JSON in Markdown-Codeblöcken)

## Wie du mit deinem MCP-Server interagierst

### Verwendung des `/mcp` Befehls

Der `/mcp` Befehl liefert umfassende Informationen zu deiner MCP-Server-Konfiguration:

```bash
/mcp
```

Dieser zeigt folgende Informationen an:

- **Serverliste:** Alle konfigurierten MCP-Server
- **Verbindungsstatus:** `CONNECTED`, `CONNECTING` oder `DISCONNECTED`
- **Serverdetails:** Zusammenfassung der Konfiguration (ohne sensible Daten)
- **Verfügbare Tools:** Liste der Tools von jedem Server mit Beschreibungen
- **Discovery-Status:** Gesamtstatus des Discovery-Prozesses

### Beispiel `/mcp` Ausgabe

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

Sobald MCP-Tools entdeckt wurden, stehen sie dem Qwen-Modell wie eingebaute Tools zur Verfügung. Das Modell wird automatisch:

1. **Passende Tools auswählen** basierend auf deinen Anfragen
2. **Bestätigungsdialoge anzeigen** (es sei denn, der Server ist vertrauenswürdig)
3. **Tools mit korrekten Parametern ausführen**
4. **Ergebnisse in einem benutzerfreundlichen Format darstellen**

## Statusüberwachung und Fehlersuche

### Verbindungsstatus

Die MCP-Integration verfolgt mehrere Zustände:

#### Server-Status (`MCPServerStatus`)

- **`DISCONNECTED`:** Server ist nicht verbunden oder es liegen Fehler vor
- **`CONNECTING`:** Verbindungsversuch läuft
- **`CONNECTED`:** Server ist verbunden und bereit

#### Discovery-Status (`MCPDiscoveryState`)

- **`NOT_STARTED`:** Discovery wurde noch nicht gestartet
- **`IN_PROGRESS`:** Server werden aktuell gesucht
- **`COMPLETED`:** Discovery abgeschlossen (mit oder ohne Fehler)

### Häufige Probleme und Lösungen

#### Server verbindet nicht

**Symptome:** Server zeigt den Status `DISCONNECTED`

**Fehlerbehebung:**

1. **Konfiguration prüfen:** Überprüfe, ob `command`, `args` und `cwd` korrekt sind
2. **Manueller Test:** Führe den Server-Befehl direkt aus, um sicherzustellen, dass er funktioniert
3. **Abhängigkeiten prüfen:** Stelle sicher, dass alle benötigten Pakete installiert sind
4. **Logs überprüfen:** Suche nach Fehlermeldungen in der CLI-Ausgabe
5. **Berechtigungen verifizieren:** Stelle sicher, dass die CLI den Server-Befehl ausführen kann

#### Keine Tools gefunden

**Symptome:** Server verbindet, aber keine Tools sind verfügbar

**Fehlerbehebung:**

1. **Tool-Registrierung verifizieren:** Stelle sicher, dass dein Server tatsächlich Tools registriert
2. **MCP-Protokoll prüfen:** Bestätige, dass dein Server das MCP-Tool-Listing korrekt implementiert
3. **Server-Logs überprüfen:** Prüfe die stderr-Ausgabe auf serverseitige Fehler
4. **Tool-Listing testen:** Teste den Tool-Discovery-Endpoint deines Servers manuell

#### Tools werden nicht ausgeführt

**Symptome:** Tools werden erkannt, schlagen aber bei der Ausführung fehl

**Fehlerbehebung:**

1. **Parameter-Validierung:** Stellen Sie sicher, dass Ihr Tool die erwarteten Parameter akzeptiert
2. **Schema-Kompatibilität:** Überprüfen Sie, ob Ihre Input-Schemas gültige JSON Schema sind
3. **Fehlerbehandlung:** Prüfen Sie, ob Ihr Tool unbehandelte Exceptions wirft
4. **Timeout-Probleme:** Erwägen Sie, die `timeout`-Einstellung zu erhöhen

#### Sandbox-Kompatibilität

**Symptome:** MCP-Server schlagen fehl, wenn Sandboxing aktiviert ist

**Lösungen:**

1. **Docker-basierte Server:** Verwenden Sie Docker-Container, die alle Abhängigkeiten enthalten
2. **Pfad-Zugriff:** Stellen Sie sicher, dass Server-Executables in der Sandbox verfügbar sind
3. **Netzwerkzugriff:** Konfigurieren Sie die Sandbox so, dass notwendige Netzwerkverbindungen erlaubt sind
4. **Umgebungsvariablen:** Überprüfen Sie, ob erforderliche Environment-Variablen durchgereicht werden

### Debugging-Tipps

1. **Debug-Modus aktivieren:** Führe das CLI mit `--debug` aus, um detaillierte Ausgaben zu erhalten  
2. **stderr prüfen:** MCP-Server-Fehlerausgaben (stderr) werden erfasst und geloggt (INFO-Meldungen werden gefiltert)  
3. **Isoliert testen:** Teste deinen MCP-Server unabhängig, bevor du ihn integrierst  
4. **Schrittweise Einrichtung:** Beginne mit einfachen Tools, bevor du komplexe Funktionalitäten hinzufügst  
5. **Häufig `/mcp` nutzen:** Überwache den Server-Status während der Entwicklung  

## Wichtige Hinweise

### Sicherheitshinweise

- **Vertrauenseinstellungen:** Die `trust`-Option umgeht alle Bestätigungsdialoge. Verwende sie mit Vorsicht und nur für Server, die du vollständig kontrollierst  
- **Zugriffstoken:** Sei dir der Sicherheitsimplikationen bewusst, wenn du Umgebungsvariablen mit API-Keys oder Tokens konfigurierst  
- **Sandbox-Kompatibilität:** Stelle bei der Verwendung von Sandboxing sicher, dass MCP-Server innerhalb der Sandbox-Umgebung erreichbar sind  
- **Private Daten:** Die Verwendung von allgemein gültigen Personal Access Tokens kann zu unbeabsichtigtem Datenleck zwischen Repositories führen

### Performance und Ressourcenmanagement

- **Connection Persistence:** Die CLI hält persistente Verbindungen zu Servern aufrecht, die Tools erfolgreich registrieren
- **Automatische Bereinigung:** Verbindungen zu Servern, die keine Tools bereitstellen, werden automatisch geschlossen
- **Timeout-Management:** Konfiguriere angemessene Timeouts basierend auf den Antwortzeiten deines Servers
- **Ressourcenmonitoring:** MCP-Server laufen als separate Prozesse und verbrauchen Systemressourcen

### Schema-Kompatibilität

- **Property-Stripping:** Das System entfernt automatisch bestimmte Schema-Eigenschaften (`$schema`, `additionalProperties`) für die Kompatibilität mit der Qwen-API
- **Namensbereinigung:** Tool-Namen werden automatisch bereinigt, um die API-Anforderungen zu erfüllen
- **Konfliktlösung:** Namenskonflikte von Tools zwischen Servern werden durch automatisches Präfixen gelöst

Diese umfassende Integration macht MCP-Server zu einer leistungsstarken Möglichkeit, die Fähigkeiten der CLI zu erweitern, ohne dabei Sicherheit, Stabilität und Benutzerfreundlichkeit zu vernachlässigen.

## Rückgabe von Rich Content aus Tools

MCP-Tools sind nicht darauf beschränkt, einfachen Text zurückzugeben. Du kannst Rich Content mit mehreren Teilen zurückgeben, darunter Text, Bilder, Audio und andere Binärdaten – alles in einer einzigen Tool-Antwort. Dies ermöglicht es dir, leistungsstarke Tools zu erstellen, die dem Modell in einem einzigen Schritt vielfältige Informationen liefern können.

Alle vom Tool zurückgegebenen Daten werden verarbeitet und als Kontext für die nächste Generierung an das Modell gesendet, sodass es die bereitgestellten Informationen verarbeiten oder zusammenfassen kann.

### Wie es funktioniert

Um Rich Content zurückzugeben, muss die Antwort deines Tools der MCP-Spezifikation für ein [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) entsprechen. Das `content`-Feld des Results sollte ein Array von `ContentBlock`-Objekten sein. Die CLI verarbeitet dieses Array korrekt, trennt Text von Binärdaten und paketiert es für das Modell.

Du kannst verschiedene Content Block-Typen im `content`-Array mischen und kombinieren. Die unterstützten Block-Typen sind:

- `text`
- `image`
- `audio`
- `resource` (eingebetteter Content)
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

1.  Den gesamten Text extrahieren und zu einem einzigen `functionResponse`-Teil für das Modell zusammenfügen.
2.  Die Bilddaten als separaten `inlineData`-Teil darstellen.
3.  Eine übersichtliche, benutzerfreundliche Zusammenfassung in der CLI anzeigen, die angibt, dass sowohl Text als auch ein Bild empfangen wurden.

Dadurch kannst du anspruchsvolle Tools entwickeln, die dem Qwen-Modell einen umfangreichen, multimodalen Kontext liefern.

## MCP Prompts als Slash Commands

Neben Tools können MCP-Server auch vordefinierte Prompts bereitstellen, die als Slash Commands innerhalb von Qwen Code ausgeführt werden können. Dadurch kannst du Shortcuts für häufige oder komplexe Abfragen erstellen, die einfach über ihren Namen aufgerufen werden können.

### Prompts auf dem Server definieren

Hier ist ein kleines Beispiel für einen stdio MCP-Server, der Prompts definiert:

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

Dieser kann in der `settings.json` unter `mcpServers` wie folgt eingetragen werden:

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

### Prompts aufrufen

Sobald ein Prompt gefunden wurde, kannst du ihn über seinen Namen als Slash-Befehl aufrufen. Die CLI übernimmt automatisch das Parsen der Argumente.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

oder mit Positionsargumenten:

```bash
/poem-writer "Qwen Code" reverent
```

Wenn du diesen Befehl ausführst, führt die CLI die Methode `prompts/get` auf dem MCP-Server mit den übergebenen Argumenten aus. Der Server ist dafür verantwortlich, die Argumente in das Prompt-Template einzusetzen und den finalen Prompt-Text zurückzugeben. Die CLI sendet diesen Prompt dann zur Ausführung an das Modell. Dies bietet eine praktische Möglichkeit, gängige Workflows zu automatisieren und zu teilen.

## Verwaltung von MCP-Servern mit `qwen mcp`

Auch wenn du MCP-Server jederzeit durch manuelles Bearbeiten der `settings.json` konfigurieren kannst, bietet das CLI eine praktische Reihe von Befehlen, um deine Server-Konfigurationen programmatisch zu verwalten. Diese Befehle vereinfachen den Prozess des Hinzufügens, Auflistens und Entfernens von MCP-Servern, ohne dass du direkt JSON-Dateien bearbeiten musst.

### Einen Server hinzufügen (`qwen mcp add`)

Der `add`-Befehl konfiguriert einen neuen MCP-Server in deiner `settings.json`. Je nach Gültigkeitsbereich (`-s, --scope`) wird er entweder zur Benutzerkonfiguration `~/.qwen/settings.json` oder zur Projekt-Konfigurationsdatei `.qwen/settings.json` hinzugefügt.

**Befehl:**

```bash
qwen mcp add [Optionen] <Name> <BefehlOderURL> [Argumente...]
```

- `<Name>`: Ein eindeutiger Name für den Server.
- `<BefehlOderURL>`: Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`).
- `[Argumente...]`: Optionale Argumente für einen `stdio`-Befehl.

**Optionen (Flags):**

- `-s, --scope`: Konfigurationsbereich (user oder project). [Standard: "project"]
- `-t, --transport`: Transporttyp (stdio, sse, http). [Standard: "stdio"]
- `-e, --env`: Umgebungsvariablen setzen (z.B. -e SCHLÜSSEL=wert).
- `-H, --header`: HTTP-Header für SSE- und HTTP-Transporte festlegen (z.B. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Verbindungszeitlimit in Millisekunden festlegen.
- `--trust`: Dem Server vertrauen (alle Bestätigungsdialoge beim Aufruf von Tools umgehen).
- `--description`: Beschreibung des Servers festlegen.
- `--include-tools`: Eine durch Kommas getrennte Liste der einzubeziehenden Tools.
- `--exclude-tools`: Eine durch Kommas getrennte Liste der auszuschließenden Tools.

#### Hinzufügen eines stdio-Servers

Dies ist der Standard-Transport für lokale Server.

```bash

# Grundlegende Syntax
qwen mcp add <name> <command> [args...]

# Beispiel: Hinzufügen eines lokalen Servers
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Beispiel: Hinzufügen eines lokalen Python-Servers
qwen mcp add python-server python server.py --port 8080
```

#### Hinzufügen eines HTTP-Servers

Dieser Transport ist für Server, die den streambaren HTTP-Transport verwenden.

```bash

# Grundlegende Syntax
qwen mcp add --transport http <name> <url>

# Beispiel: Hinzufügen eines HTTP-Servers
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Beispiel: Hinzufügen eines HTTP-Servers mit Authentifizierungs-Header
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Hinzufügen eines SSE-Servers

Dieser Transport ist für Server, die Server-Sent Events (SSE) verwenden.

```bash

# Grundlegende Syntax
qwen mcp add --transport sse <name> <url>
```

```markdown
# Beispiel: Hinzufügen eines SSE-Servers
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Beispiel: Hinzufügen eines SSE-Servers mit einem Authentication-Header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Server auflisten (`qwen mcp list`)

Um alle aktuell konfigurierten MCP-Server anzuzeigen, verwende den `list`-Befehl. Er zeigt den Namen jedes Servers, die Konfigurationsdetails und den Verbindungsstatus an.

**Befehl:**

```bash
qwen mcp list
```

**Beispielausgabe:**

```sh
✓ stdio-server: command: python3 server.py (stdio) - Connected
✓ http-server: https://api.example.com/mcp (http) - Connected
✗ sse-server: https://api.example.com/sse (sse) - Disconnected
```

### Server entfernen (`qwen mcp remove`)

Um einen Server aus deiner Konfiguration zu löschen, verwende den `remove`-Befehl mit dem Namen des Servers.

**Befehl:**

```bash
qwen mcp remove <name>
```

**Beispiel:**

```bash
qwen mcp remove my-server
```

Dieser Befehl sucht den Eintrag "my-server" im `mcpServers`-Objekt der entsprechenden `settings.json`-Datei und löscht ihn. Der Speicherort der Datei hängt vom verwendeten Scope (`-s, --scope`) ab.