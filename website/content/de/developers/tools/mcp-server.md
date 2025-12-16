# MCP-Server mit Qwen Code

Dieses Dokument bietet eine Anleitung zur Konfiguration und Verwendung von Model Context Protocol (MCP)-Servern mit Qwen Code.

## Was ist ein MCP-Server?

Ein MCP-Server ist eine Anwendung, die über das Model Context Protocol Tools und Ressourcen für die CLI bereitstellt und es ihr dadurch ermöglicht, mit externen Systemen und Datenquellen zu interagieren. MCP-Server fungieren als Brücke zwischen dem Modell und Ihrer lokalen Umgebung oder anderen Diensten wie APIs.

Ein MCP-Server ermöglicht der CLI Folgendes:

- **Tools entdecken:** Verfügbare Tools sowie deren Beschreibungen und Parameter mithilfe standardisierter Schemadefinitionen auflisten.
- **Tools ausführen:** Bestimmte Tools mit definierten Argumenten aufrufen und strukturierte Antworten erhalten.
- **Auf Ressourcen zugreifen:** Daten aus bestimmten Ressourcen lesen (wobei sich die CLI hauptsächlich auf die Tool-Ausführung konzentriert).

Mit einem MCP-Server können Sie die Fähigkeiten der CLI um Aktionen erweitern, die über ihre integrierten Funktionen hinausgehen, beispielsweise die Interaktion mit Datenbanken, APIs, benutzerdefinierten Skripten oder spezialisierten Workflows.

## Kernintegrationsarchitektur

Qwen Code integriert sich über eine ausgeklügelte Entdeckungs- und Ausführungslogik mit MCP-Servern, die im Kernpaket implementiert ist (`packages/core/src/tools/`):

### Entdeckungsschicht (`mcp-client.ts`)

Der Entdeckungsprozess wird von `discoverMcpTools()` orchestriert, welcher:

1. **Durchläuft konfigurierte Server** gemäß der `mcpServers`-Konfiguration in Ihrer `settings.json`
2. **Stellt Verbindungen her** unter Verwendung geeigneter Transportmechanismen (Stdio, SSE oder streambares HTTP)
3. **Ruft Werkzeugdefinitionen** von jedem Server mittels des MCP-Protokolls ab
4. **Bereinigt und validiert** Werkzeugschemas auf Kompatibilität mit der Qwen-API
5. **Registriert Werkzeuge** im globalen Werkzeugregister unter Berücksichtigung möglicher Konflikte

### Execution Layer (`mcp-tool.ts`)

Jedes entdeckte MCP-Tool wird in eine `DiscoveredMCPTool`-Instanz verpackt, die:

- **Bestätigungslogik behandelt**, basierend auf den Vertrauenseinstellungen des Servers und den Benutzereinstellungen
- **Tool-Ausführung verwaltet**, indem der MCP-Server mit korrekten Parametern aufgerufen wird
- **Antworten verarbeitet**, sowohl für den LLM-Kontext als auch zur Anzeige für den Benutzer
- **Verbindungsstatus verwaltet** und Timeouts behandelt

### Transportmechanismen

Die CLI unterstützt drei MCP-Transporttypen:

- **Stdio-Transport:** Startet einen Subprozess und kommuniziert über stdin/stdout
- **SSE-Transport:** Stellt eine Verbindung zu Server-Sent-Events-Endpunkten her
- **Streambarer HTTP-Transport:** Nutzt HTTP-Streaming zur Kommunikation

## So richten Sie Ihren MCP-Server ein

Qwen Code verwendet die `mcpServers`-Konfiguration in Ihrer `settings.json`-Datei, um MCP-Server zu finden und sich mit ihnen zu verbinden. Diese Konfiguration unterstützt mehrere Server mit unterschiedlichen Transportmechanismen.

### Konfigurieren Sie den MCP-Server in settings.json

Sie können MCP-Server in Ihrer `settings.json`-Datei auf zwei Hauptarten konfigurieren: über das `mcpServers`-Objekt auf der obersten Ebene für spezifische Serverdefinitionen und über das `mcp`-Objekt für globale Einstellungen, die die Servererkennung und -ausführung steuern.

#### Globale MCP-Einstellungen (`mcp`)

Das `mcp`-Objekt in Ihrer `settings.json` ermöglicht es Ihnen, globale Regeln für alle MCP-Server zu definieren.

- **`mcp.serverCommand`** (String): Ein globaler Befehl zum Starten eines MCP-Servers.
- **`mcp.allowed`** (Array von Strings): Eine Liste von MCP-Servernamen, die erlaubt sind. Wenn dies festgelegt ist, wird nur zu Servern aus dieser Liste (entsprechend den Schlüsseln im `mcpServers`-Objekt) eine Verbindung hergestellt.
- **`mcp.excluded`** (Array von Strings): Eine Liste von MCP-Servernamen, die ausgeschlossen sind. Zu Servern in dieser Liste wird keine Verbindung hergestellt.

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

Jede Serverkonfiguration unterstützt die folgenden Eigenschaften:

#### Erforderlich (eine der folgenden)

- **`command`** (string): Pfad zur ausführbaren Datei für den Stdio-Transport
- **`url`** (string): SSE-Endpunkt-URL (z. B. `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): HTTP-Streaming-Endpunkt-URL

#### Optional

- **`args`** (string[]): Befehlszeilenargumente für den Stdio-Transport
- **`headers`** (object): Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`
- **`env`** (object): Umgebungsvariablen für den Serverprozess. Werte können Umgebungsvariablen mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren
- **`cwd`** (string): Arbeitsverzeichnis für den Stdio-Transport
- **`timeout`** (number): Anfrage-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)
- **`trust`** (boolean): Wenn `true`, werden alle Tool-Aufrufbestätigungen für diesen Server umgangen (Standard: `false`)
- **`includeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server einbezogen werden sollen. Wenn angegeben, sind nur die hier aufgelisteten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.
- **`excludeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgelisteten Tools stehen dem Modell nicht zur Verfügung, selbst wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn sich ein Tool in beiden Listen befindet, wird es ausgeschlossen.
- **`targetAudience`** (string): Die OAuth-Client-ID, die in der IAP-geschützten Anwendung, auf die Sie zugreifen möchten, auf der Allowlist steht. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, der impersoniert werden soll. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.

### OAuth-Unterstützung für Remote-MCP-Server

Qwen Code unterstützt die OAuth 2.0-Authentifizierung für Remote-MCP-Server unter Verwendung von SSE- oder HTTP-Transporten. Dies ermöglicht sicheren Zugriff auf MCP-Server, die eine Authentifizierung erfordern.

#### Automatische OAuth-Erkennung

Für Server, die OAuth-Erkennung unterstützen, können Sie die OAuth-Konfiguration weglassen und die automatische Erkennung durch die CLI zulassen:

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

- Erkennt, wenn ein Server eine OAuth-Authentifizierung erfordert (401-Antworten)
- Ermittelt OAuth-Endpunkte aus den Server-Metadaten
- Führt eine dynamische Client-Registrierung durch, falls unterstützt
- Verarbeitet den OAuth-Ablauf und das Token-Management

#### Authentifizierungsablauf

Beim Verbinden mit einem OAuth-fähigen Server:

1. **Erster Verbindungsversuch** schlägt mit 401 Unauthorized fehl
2. **OAuth-Erkennung** findet Autorisierungs- und Token-Endpunkte
3. **Browser öffnet sich** zur Benutzerauthentifizierung (erfordert lokalen Browserzugriff)
4. **Autorisierungscode** wird gegen Zugriffstoken eingetauscht
5. **Token werden sicher gespeichert** für zukünftige Verwendung
6. **Verbindungsneuversuch** gelingt mit gültigen Token

#### Anforderungen an Browser-Umleitungen

**Wichtig:** Die OAuth-Authentifizierung erfordert, dass Ihr lokaler Rechner Folgendes kann:

- Einen Webbrowser zur Authentifizierung öffnen
- Umleitungen unter `http://localhost:7777/oauth/callback` empfangen

Diese Funktion funktioniert nicht in:

- Kopflosen Umgebungen ohne Browserzugriff
- Entfernten SSH-Sitzungen ohne X11-Weiterleitung
- Containerisierten Umgebungen ohne Browserunterstützung

#### Verwalten der OAuth-Authentifizierung

Verwenden Sie den Befehl `/mcp auth`, um die OAuth-Authentifizierung zu verwalten:

```bash

# Server auflisten, die eine Authentifizierung erfordern
/mcp auth```

```markdown
# Authentifizierung mit einem bestimmten Server
/mcp auth serverName

# Erneute Authentifizierung bei abgelaufenen Tokens
/mcp auth serverName
```

#### OAuth-Konfigurationseigenschaften

- **`enabled`** (boolean): Aktiviert OAuth für diesen Server
- **`clientId`** (string): OAuth-Client-ID (optional bei dynamischer Registrierung)
- **`clientSecret`** (string): OAuth-Client-Secret (optional für öffentliche Clients)
- **`authorizationUrl`** (string): OAuth-Autorisierungs-Endpunkt (wird automatisch erkannt, wenn weggelassen)
- **`tokenUrl`** (string): OAuth-Token-Endpunkt (wird automatisch erkannt, wenn weggelassen)
- **`scopes`** (string[]): Erforderliche OAuth-Bereiche
- **`redirectUri`** (string): Benutzerdefinierte Redirect-URI (Standardwert ist `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (string): Name des Abfrageparameters für Tokens in SSE-URLs
- **`audiences`** (string[]): Zielgruppen, für die das Token gültig ist
```

#### Token-Verwaltung

OAuth-Token werden automatisch:

- **Sicher gespeichert** in `~/.qwen/mcp-oauth-tokens.json`
- **Aktualisiert**, wenn sie abgelaufen sind (sofern Refresh-Token verfügbar sind)
- **Validiert** vor jedem Verbindungsversuch
- **Bereinigt**, wenn sie ungültig oder abgelaufen sind

#### Authentifizierungsanbieter-Typ

Sie können den Typ des Authentifizierungsanbieters mithilfe der Eigenschaft `authProviderType` angeben:

- **`authProviderType`** (String): Gibt den Authentifizierungsanbieter an. Mögliche Werte sind:
  - **`dynamic_discovery`** (Standard): Die CLI ermittelt die OAuth-Konfiguration automatisch vom Server.
  - **`google_credentials`**: Die CLI verwendet die Google Application Default Credentials (ADC), um sich beim Server zu authentifizieren. Bei Verwendung dieses Anbieters müssen Sie die erforderlichen Scopes angeben.
  - **`service_account_impersonation`**: Die CLI gibt einen Google Cloud Service Account vor, um sich beim Server zu authentifizieren. Dies ist nützlich für den Zugriff auf IAP-geschützte Dienste (speziell entwickelt für Cloud Run-Dienste).

#### Google-Anmeldeinformationen

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

#### Service Account-Impersonation

Um sich mit einem Server über Service Account-Impersonation zu authentifizieren, musst du den `authProviderType` auf `service_account_impersonation` setzen und die folgenden Eigenschaften angeben:

- **`targetAudience`** (String): Die OAuth-Client-ID, die in der Zulassungsliste der IAP-geschützten Anwendung steht, auf die du zugreifen möchtest.
- **`targetServiceAccount`** (String): Die E-Mail-Adresse des Google Cloud Service Accounts, dessen Identität angenommen werden soll.

Die CLI verwendet deine lokalen Application Default Credentials (ADC), um ein OIDC-ID-Token für den angegebenen Service Account und die Zielgruppe zu generieren. Dieses Token wird dann zur Authentifizierung beim MCP-Server verwendet.

#### Einrichtungsanweisungen

1. **[Erstellen](https://cloud.google.com/iap/docs/oauth-client-creation) oder verwenden Sie eine vorhandene OAuth 2.0-Client-ID.** Um eine vorhandene OAuth 2.0-Client-ID zu verwenden, folgen Sie den Schritten unter [So teilen Sie OAuth-Clients](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Fügen Sie die OAuth-ID zur Zulassungsliste für [programmatischen Zugriff](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) für die Anwendung hinzu.** Da Cloud Run noch kein unterstützter Ressourcentyp in gcloud iap ist, müssen Sie die Client-ID auf dem Projekt zulassen.
3. **Erstellen Sie ein Service-Konto.** [Dokumentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Cloud Console Link](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Fügen Sie sowohl das Service-Konto als auch die Benutzer zur IAP-Richtlinie** im „Security“-Tab des Cloud Run-Dienstes selbst oder über gcloud hinzu.
5. **Gewähren Sie allen Benutzern und Gruppen**, die auf den MCP-Server zugreifen werden, die erforderlichen Berechtigungen zur [Service-Account-Imitation](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (d. h. `roles/iam.serviceAccountTokenCreator`).
6. **[Aktivieren](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) Sie die IAM Credentials API** für Ihr Projekt.

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

## Tiefgang zum Discovery-Prozess

Wenn Qwen Code startet, führt es die MCP-Server-Erkennung durch den folgenden detaillierten Prozess durch:

### 1. Server-Iteration und Verbindung

Für jeden konfigurierten Server in `mcpServers`:

1. **Statusverfolgung beginnt:** Der Serverstatus wird auf `CONNECTING` gesetzt
2. **Transportauswahl:** Basierend auf den Konfigurationseigenschaften:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Verbindungsaufbau:** Der MCP-Client versucht, eine Verbindung mit dem konfigurierten Timeout herzustellen
4. **Fehlerbehandlung:** Verbindungsfehler werden protokolliert und der Serverstatus wird auf `DISCONNECTED` gesetzt

### 2. Tool-Erkennung

Nach erfolgreicher Verbindung:

1. **Tool-Auflistung:** Der Client ruft den Tool-Auflistungs-Endpunkt des MCP-Servers auf
2. **Schema-Validierung:** Die Funktionsdeklaration jedes Tools wird validiert
3. **Tool-Filterung:** Tools werden basierend auf der `includeTools`- und `excludeTools`-Konfiguration gefiltert
4. **Namensbereinigung:** Tool-Namen werden bereinigt, um die Qwen-API-Anforderungen zu erfüllen:
   - Ungültige Zeichen (nicht alphanumerisch, Unterstrich, Punkt, Bindestrich) werden durch Unterstriche ersetzt
   - Namen länger als 63 Zeichen werden mit mittlerem Ersatz gekürzt (`___`)

### 3. Konfliktlösung

Wenn mehrere Server Tools mit demselben Namen bereitstellen:

1. **First-Come-First-Served-Prinzip:** Der erste Server, der einen Tool-Namen registriert, erhält den unpräfixierten Namen
2. **Automatische Präfixierung:** Nachfolgende Server erhalten vorangestellte Namen: `serverName__toolName`
3. **Registry-Verfolgung:** Die Tool-Registry verwaltet Zuordnungen zwischen Servernamen und deren Tools

### 4. Schema-Verarbeitung

Tool-Parameter-Schemas werden für die API-Kompatibilität bereinigt:

- **`$schema`-Eigenschaften** werden entfernt
- **`additionalProperties`** werden gestrippt
- **`anyOf` mit `default`** haben ihre Standardwerte entfernt (Vertex AI-Kompatibilität)
- **Rekursive Verarbeitung** wird auf verschachtelte Schemas angewendet

### 5. Verbindungsmanagement

Nach der Erkennung:

- **Persistente Verbindungen:** Server, die Tools erfolgreich registrieren, behalten ihre Verbindungen bei
- **Bereinigung:** Server, die keine nutzbaren Tools bereitstellen, haben ihre Verbindungen geschlossen
- **Statusaktualisierungen:** Die endgültigen Serverstatus werden auf `CONNECTED` oder `DISCONNECTED` gesetzt

## Tool-Ausführungsablauf

Wenn das Modell beschließt, ein MCP-Tool zu verwenden, erfolgt der folgende Ausführungsablauf:

### 1. Tool-Aufruf

Das Modell generiert einen `FunctionCall` mit:

- **Tool-Name:** Der registrierte Name (möglicherweise mit Präfix)
- **Argumente:** JSON-Objekt, das dem Parameter-Schema des Tools entspricht

### 2. Bestätigungsprozess

Jedes `DiscoveredMCPTool` implementiert eine anspruchsvolle Bestätigungslogik:

#### Vertrauensbasierte Umgehung

```typescript
if (this.trust) {
  return false; // Keine Bestätigung erforderlich
}
```

#### Dynamische Zulassungslisten

Das System verwaltet interne Zulassungslisten für:

- **Server-Ebene:** `serverName` → Alle Tools von diesem Server werden vertraut
- **Tool-Ebene:** `serverName.toolName` → Dieses spezifische Tool wird vertraut

#### Umgang mit Benutzerentscheidungen

Wenn eine Bestätigung erforderlich ist, können Benutzer wählen:

- **Einmalig fortfahren:** Nur diesmal ausführen
- **Dieses Tool immer zulassen:** Zur Zulassungsliste auf Tool-Ebene hinzufügen
- **Diesen Server immer zulassen:** Zur Zulassungsliste auf Server-Ebene hinzufügen
- **Abbrechen:** Ausführung abbrechen

### 3. Ausführung

Nach Bestätigung (oder Umgehung der Vertrauensprüfung):

1. **Parameter vorbereiten:** Argumente werden gegen das Schema des Tools validiert
2. **MCP-Aufruf:** Das zugrunde liegende `CallableTool` ruft den Server auf mit:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Ursprünglicher Server-Tool-Name
       args: params,
     },
   ];
   ```

3. **Antwortverarbeitung:** Ergebnisse werden für den LLM-Kontext und die Benutzeranzeige formatiert

### 4. Umgang mit der Antwort

Das Ausführungsergebnis enthält:

- **`llmContent`:** Rohdaten der Antwortanteile für den Kontext des Sprachmodells
- **`returnDisplay`:** Formatierter Output für die Benutzeranzeige (häufig JSON in Markdown-Codeblöcken)

## Wie Sie mit Ihrem MCP-Server interagieren

### Verwendung des Befehls `/mcp`

Der Befehl `/mcp` liefert umfassende Informationen zu deiner MCP-Server-Konfiguration:

```bash
/mcp
```

Dieser zeigt an:

- **Serverliste:** Alle konfigurierten MCP-Server
- **Verbindungsstatus:** `CONNECTED`, `CONNECTING` oder `DISCONNECTED`
- **Serverdetails:** Zusammenfassung der Konfiguration (ohne sensible Daten)
- **Verfügbare Tools:** Liste der Tools von jedem Server mit Beschreibungen
- **Erkennungsstatus:** Gesamtstatus des Erkennungsprozesses

### Beispiel für die Ausgabe von `/mcp`

```
MCP Server Status:

📡 pythonTools (CONNECTED)
  Befehl: python -m my_mcp_server --port 8080
  Arbeitsverzeichnis: ./mcp-servers/python
  Zeitüberschreitung: 15000ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Befehl: node dist/server.js --verbose
  Fehler: Verbindung abgelehnt

🐳 dockerizedServer (CONNECTED)
  Befehl: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Erkennungsstatus: COMPLETED
```

### Werkzeugnutzung

Sobald sie entdeckt wurden, stehen MCP-Werkzeuge dem Qwen-Modell wie integrierte Werkzeuge zur Verfügung. Das Modell wird automatisch:

1. **Passende Werkzeuge auswählen** basierend auf Ihren Anfragen
2. **Bestätigungsdialoge anzeigen** (es sei denn, der Server ist vertrauenswürdig)
3. **Werkzeuge mit korrekten Parametern ausführen**
4. **Ergebnisse in einem benutzerfreundlichen Format darstellen**

## Statusüberwachung und Fehlersuche

### Verbindungsstatus

Die MCP-Integration verfolgt mehrere Zustände:

#### Serverstatus (`MCPServerStatus`)

- **`DISCONNECTED`:** Server ist nicht verbunden oder hat Fehler
- **`CONNECTING`:** Verbindungsversuch läuft
- **`CONNECTED`:** Server ist verbunden und bereit

#### Entdeckungszustand (`MCPDiscoveryState`)

- **`NOT_STARTED`:** Entdeckung hat noch nicht begonnen
- **`IN_PROGRESS`:** Server werden derzeit entdeckt
- **`COMPLETED`:** Entdeckung abgeschlossen (mit oder ohne Fehler)

### Häufige Probleme und Lösungen

#### Server verbindet nicht

**Symptome:** Server zeigt den Status `DISCONNECTED`

**Fehlerbehebung:**

1. **Konfiguration prüfen:** Überprüfen Sie, ob `command`, `args` und `cwd` korrekt sind
2. **Manuell testen:** Führen Sie den Server-Befehl direkt aus, um sicherzustellen, dass er funktioniert
3. **Abhängigkeiten prüfen:** Stellen Sie sicher, dass alle erforderlichen Pakete installiert sind
4. **Protokolle prüfen:** Suchen Sie nach Fehlermeldungen in der CLI-Ausgabe
5. **Berechtigungen überprüfen:** Stellen Sie sicher, dass die CLI den Server-Befehl ausführen kann

#### Keine Tools gefunden

**Symptome:** Server verbindet, aber keine Tools sind verfügbar

**Fehlerbehebung:**

1. **Tool-Registrierung überprüfen:** Stellen Sie sicher, dass Ihr Server tatsächlich Tools registriert
2. **MCP-Protokoll prüfen:** Bestätigen Sie, dass Ihr Server das MCP-Tool-Listing korrekt implementiert
3. **Server-Logs prüfen:** Überprüfen Sie die stderr-Ausgabe auf serverseitige Fehler
4. **Tool-Listing testen:** Testen Sie den Tool-Discovery-Endpunkt Ihres Servers manuell

#### Tools werden nicht ausgeführt

**Symptome:** Tools werden erkannt, schlagen aber bei der Ausführung fehl

**Fehlerbehebung:**

1. **Parameter-Validierung:** Stellen Sie sicher, dass Ihr Tool die erwarteten Parameter akzeptiert
2. **Schema-Kompatibilität:** Überprüfen Sie, ob Ihre Eingabeschemata gültiges JSON Schema sind
3. **Fehlerbehandlung:** Prüfen Sie, ob Ihr Tool unbehandelte Ausnahmen wirft
4. **Timeout-Probleme:** Erwägen Sie, die `timeout`-Einstellung zu erhöhen

#### Sandbox-Kompatibilität

**Symptome:** MCP-Server schlagen fehl, wenn Sandboxing aktiviert ist

**Lösungen:**

1. **Docker-basierte Server:** Verwenden Sie Docker-Container, die alle Abhängigkeiten enthalten
2. **Pfad-Zugriff:** Stellen Sie sicher, dass Server-Executables in der Sandbox verfügbar sind
3. **Netzwerkzugriff:** Konfigurieren Sie die Sandbox so, dass notwendige Netzwerkverbindungen erlaubt sind
4. **Umgebungsvariablen:** Überprüfen Sie, ob erforderliche Umgebungsvariablen durchgereicht werden

### Debugging-Tipps

1. **Debug-Modus aktivieren:** Führe die CLI mit `--debug` aus, um detaillierte Ausgaben zu erhalten
2. **stderr prüfen:** Der stderr des MCP-Servers wird erfasst und protokolliert (INFO-Meldungen werden gefiltert)
3. **Tests isoliert durchführen:** Teste deinen MCP-Server unabhängig, bevor du ihn integrierst
4. **Schrittweise Einrichtung:** Beginne mit einfachen Tools, bevor du komplexe Funktionen hinzufügst
5. **Häufig `/mcp` verwenden:** Überwache den Serverstatus während der Entwicklung

## Wichtige Hinweise

### Sicherheitsaspekte

- **Vertrauenseinstellungen:** Die Option `trust` umgeht alle Bestätigungsdialoge. Verwende sie mit Vorsicht und nur für Server, die du vollständig kontrollierst
- **Zugriffstoken:** Sei dir der Sicherheitsimplikationen bewusst, wenn du Umgebungsvariablen mit API-Schlüsseln oder Tokens konfigurierst
- **Sandbox-Kompatibilität:** Stelle bei der Verwendung von Sandboxing sicher, dass MCP-Server innerhalb der Sandbox-Umgebung verfügbar sind
- **Private Daten:** Die Verwendung von weitreichenden persönlichen Zugriffstokens kann zu einem Informationsleck zwischen Repositorys führen

### Leistung und Ressourcenverwaltung

- **Verbindungspersistenz:** Die CLI behält persistente Verbindungen zu Servern bei, die Tools erfolgreich registrieren
- **Automatische Bereinigung:** Verbindungen zu Servern, die keine Tools bereitstellen, werden automatisch geschlossen
- **Timeout-Management:** Konfigurieren Sie geeignete Timeouts basierend auf den Antwortzeiten Ihres Servers
- **Ressourcenüberwachung:** MCP-Server laufen als separate Prozesse und verbrauchen Systemressourcen

### Schemakompatibilität

- **Eigenschaftsfilterung:** Das System entfernt automatisch bestimmte Schema-Eigenschaften (`$schema`, `additionalProperties`) für die Kompatibilität mit der Qwen-API
- **Namensbereinigung:** Tool-Namen werden automatisch bereinigt, um den API-Anforderungen zu entsprechen
- **Konfliktlösung:** Namenskonflikte von Tools zwischen Servern werden durch automatisches Präfixen gelöst

Diese umfassende Integration macht MCP-Server zu einer leistungsstarken Möglichkeit, die Fähigkeiten der CLI zu erweitern, ohne dabei Sicherheit, Zuverlässigkeit und Benutzerfreundlichkeit zu beeinträchtigen.

## Rückgabe von umfangreichen Inhalten aus Tools

MCP-Tools sind nicht darauf beschränkt, einfache Texte zurückzugeben. Sie können umfangreiche, mehrteilige Inhalte zurückgeben, darunter Text, Bilder, Audio und andere Binärdaten in einer einzigen Tool-Antwort. Dies ermöglicht es Ihnen, leistungsstarke Tools zu erstellen, die dem Modell in einem einzigen Schritt vielfältige Informationen bereitstellen können.

Alle vom Tool zurückgegebenen Daten werden verarbeitet und als Kontext für die nächste Generierung des Modells gesendet, sodass es über die bereitgestellten Informationen nachdenken oder diese zusammenfassen kann.

### So funktioniert es

Um umfangreiche Inhalte zurückzugeben, muss die Antwort Ihres Tools der MCP-Spezifikation für ein [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) entsprechen. Das `content`-Feld des Ergebnisses sollte ein Array von `ContentBlock`-Objekten sein. Die CLI verarbeitet dieses Array korrekt, trennt Text von Binärdaten und paketiert ihn für das Modell.

Sie können verschiedene Content-Block-Typen im `content`-Array mischen und kombinieren. Die unterstützten Blocktypen umfassen:

- `text`
- `image`
- `audio`
- `resource` (eingebetteter Inhalt)
- `resource_link`

### Beispiel: Zurückgeben von Text und einem Bild

Hier ist ein Beispiel für eine gültige JSON-Antwort eines MCP-Tools, das sowohl eine Textbeschreibung als auch ein Bild zurückgibt:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Hier ist das Logo, das Sie angefordert haben."
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "Das Logo wurde 2025 erstellt."
    }
  ]
}
```

Wenn Qwen Code diese Antwort erhält, wird es:

1.  Allen Text extrahieren und zu einem einzigen `functionResponse`-Teil für das Modell zusammenfügen.
2.  Die Bilddaten als separaten `inlineData`-Teil darstellen.
3.  Eine übersichtliche, benutzerfreundliche Zusammenfassung in der CLI anzeigen, die angibt, dass sowohl Text als auch ein Bild empfangen wurden.

Auf diese Weise können Sie anspruchsvolle Tools entwickeln, die dem Qwen-Modell einen umfangreichen, multimodalen Kontext bieten.

## MCP-Prompts als Schrägstrich-Befehle

Zusätzlich zu Tools können MCP-Server vordefinierte Prompts bereitstellen, die als Schrägstrich-Befehle innerhalb von Qwen Code ausgeführt werden können. Dies ermöglicht es Ihnen, Verknüpfungen für häufige oder komplexe Abfragen zu erstellen, die einfach über ihren Namen aufgerufen werden können.

### Definieren von Prompts auf dem Server

Hier ist ein kleines Beispiel eines stdio MCP-Servers, der Prompts definiert:

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

Dies kann in `settings.json` unter `mcpServers` wie folgt eingefügt werden:

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

Sobald ein Prompt entdeckt wurde, kannst du ihn mithilfe seines Namens als Slash-Befehl aufrufen. Die CLI übernimmt automatisch das Parsen der Argumente.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

oder unter Verwendung von Positionsargumenten:

```bash
/poem-writer "Qwen Code" reverent
```

Wenn du diesen Befehl ausführst, führt die CLI die Methode `prompts/get` auf dem MCP-Server mit den angegebenen Argumenten aus. Der Server ist dafür verantwortlich, die Argumente in die Prompt-Vorlage einzusetzen und den finalen Prompt-Text zurückzugeben. Die CLI sendet diesen Prompt dann zur Ausführung an das Modell. Dies bietet eine praktische Möglichkeit, gängige Workflows zu automatisieren und zu teilen.

## Verwalten von MCP-Servern mit `qwen mcp`

Obwohl Sie MCP-Server jederzeit durch manuelles Bearbeiten Ihrer `settings.json`-Datei konfigurieren können, bietet die CLI eine praktische Reihe von Befehlen, um Ihre Serverkonfigurationen programmgesteuert zu verwalten. Diese Befehle vereinfachen den Prozess des Hinzufügens, Auflistens und Entfernens von MCP-Servern, ohne dass Sie JSON-Dateien direkt bearbeiten müssen.

### Hinzufügen eines Servers (`qwen mcp add`)

Der Befehl `add` konfiguriert einen neuen MCP-Server in Ihrer `settings.json`. Abhängig vom Gültigkeitsbereich (`-s, --scope`) wird er entweder zur Benutzerkonfiguration `~/.qwen/settings.json` oder zur Projekt-Konfigurationsdatei `.qwen/settings.json` hinzugefügt.

**Befehl:**

```bash
qwen mcp add [Optionen] <Name> <BefehlOderURL> [Argumente...]
```

- `<Name>`: Ein eindeutiger Name für den Server.
- `<BefehlOderURL>`: Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`).
- `[Argumente...]`: Optionale Argumente für einen `stdio`-Befehl.

**Optionen (Flags):**

- `-s, --scope`: Konfigurationsbereich (Benutzer oder Projekt). [Standard: "project"]
- `-t, --transport`: Transporttyp (stdio, sse, http). [Standard: "stdio"]
- `-e, --env`: Umgebungsvariablen festlegen (z. B. -e SCHLÜSSEL=Wert).
- `-H, --header`: HTTP-Header für SSE- und HTTP-Transporte festlegen (z. B. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Verbindungszeitlimit in Millisekunden festlegen.
- `--trust`: Dem Server vertrauen (alle Bestätigungsdialoge beim Aufruf von Tools umgehen).
- `--description`: Die Beschreibung für den Server festlegen.
- `--include-tools`: Eine durch Kommas getrennte Liste der einzubeziehenden Tools.
- `--exclude-tools`: Eine durch Kommas getrennte Liste der auszuschließenden Tools.

#### Hinzufügen eines stdio-Servers

Dies ist der Standard-Transport für die Ausführung lokaler Server.

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

# Beispiel: Hinzufügen eines HTTP-Servers mit einem Authentifizierungs-Header
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

# Beispiel: Hinzufügen eines SSE-Servers mit einem Authentifizierungs-Header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Server auflisten (`qwen mcp list`)

Um alle aktuell konfigurierten MCP-Server anzuzeigen, verwenden Sie den `list`-Befehl. Er zeigt den Namen jedes Servers, die Konfigurationsdetails und den Verbindungsstatus an.

**Befehl:**

```bash
qwen mcp list
```

**Beispielausgabe:**

```sh
✓ stdio-server: command: python3 server.py (stdio) - Verbunden
✓ http-server: https://api.example.com/mcp (http) - Verbunden
✗ sse-server: https://api.example.com/sse (sse) - Nicht verbunden
```

### Entfernen eines Servers (`qwen mcp remove`)

Um einen Server aus Ihrer Konfiguration zu löschen, verwenden Sie den Befehl `remove` mit dem Namen des Servers.

**Befehl:**

```bash
qwen mcp remove <name>
```

**Beispiel:**

```bash
qwen mcp remove my-server
```

Dadurch wird der Eintrag „my-server“ im Objekt `mcpServers` in der entsprechenden Datei `settings.json` basierend auf dem Gültigkeitsbereich (`-s, --scope`) gefunden und gelöscht.