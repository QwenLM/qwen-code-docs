# MCP-Server mit Qwen Code

Dieses Dokument bietet eine Anleitung zur Konfiguration und Verwendung von Model Context Protocol (MCP)-Servern mit Qwen Code.

## Was ist ein MCP-Server?

Ein MCP-Server ist eine Anwendung, die der CLI über das Model Context Protocol Tools und Ressourcen zur Verfügung stellt, sodass sie mit externen Systemen und Datenquellen interagieren kann. MCP-Server fungieren als Brücke zwischen dem Modell und Ihrer lokalen Umgebung oder anderen Diensten wie APIs.

Ein MCP-Server ermöglicht der CLI Folgendes:

- **Tools entdecken:** Verfügbare Tools, deren Beschreibungen und Parameter über standardisierte Schema-Definitionen auflisten.
- **Tools ausführen:** Bestimmte Tools mit definierten Argumenten aufrufen und strukturierte Antworten erhalten.
- **Auf Ressourcen zugreifen:** Daten von bestimmten Ressourcen lesen (obwohl sich die CLI hauptsächlich auf die Tool-Ausführung konzentriert).

Mit einem MCP-Server können Sie die Fähigkeiten der CLI über die integrierten Funktionen hinaus erweitern, z. B. um mit Datenbanken, APIs, benutzerdefinierten Skripten oder spezialisierten Workflows zu interagieren.

## Kern-Integrationsarchitektur

Qwen Code integriert sich mit MCP-Servern über ein ausgeklügeltes Erkennungs- und Ausführungssystem, das im Kernpaket (`packages/core/src/tools/`) eingebaut ist:

### Erkennungsschicht (`mcp-client.ts`)

Der Erkennungsprozess wird von `discoverMcpTools()` orchestriert, welches:

1. **Durch die konfigurierten Server iteriert** aus Ihrer `settings.json`-Konfiguration `mcpServers`
2. **Verbindungen herstellt** unter Verwendung geeigneter Transportmechanismen (Stdio, SSE oder Streamable HTTP)
3. **Tool-Definitionen von jedem Server abruft** unter Verwendung des MCP-Protokolls
4. **Tool-Schemata bereinigt und validiert** für die Kompatibilität mit der Qwen-API
5. **Tools im globalen Tool-Registrierungsdienst registriert** mit Konfliktauflösung

### Ausführungsschicht (`mcp-tool.ts`)

Jedes erkannte MCP-Tool wird in einer `DiscoveredMCPTool`-Instanz gekapselt, die:

- **Bestätigungslogik behandelt** basierend auf Server-Vertrauenseinstellungen und Benutzerpräferenzen
- **Tool-Ausführung verwaltet** durch Aufruf des MCP-Servers mit den richtigen Parametern
- **Antworten verarbeitet** sowohl für den LLM-Kontext als auch für die Benutzeranzeige
- **Verbindungsstatus verwaltet** und Timeouts behandelt

### Transportmechanismen

Die CLI unterstützt drei MCP-Transportarten:

- **Stdio-Transport:** Startet einen Unterprozess und kommuniziert über stdin/stdout
- **SSE-Transport:** Verbindet sich mit Server-Sent Events-Endpunkten
- **Streamable HTTP-Transport:** Nutzt HTTP-Streaming für die Kommunikation

## So richten Sie Ihren MCP-Server ein

Qwen Code verwendet die Konfiguration `mcpServers` in Ihrer `settings.json`-Datei, um MCP-Server zu finden und zu verbinden. Diese Konfiguration unterstützt mehrere Server mit verschiedenen Transportmechanismen.

### Konfigurieren des MCP-Servers in settings.json

Sie können MCP-Server in Ihrer `settings.json`-Datei auf zwei Arten konfigurieren: über das `mcpServers`-Objekt auf oberster Ebene für spezifische Serverdefinitionen und über das `mcp`-Objekt für globale Einstellungen, die die Servererkennung und -ausführung steuern.

#### Globale MCP-Einstellungen (`mcp`)

Das `mcp`-Objekt in Ihrer `settings.json` ermöglicht es Ihnen, globale Regeln für alle MCP-Server zu definieren.

- **`mcp.serverCommand`** (string): Ein globaler Befehl zum Starten eines MCP-Servers.
- **`mcp.allowed`** (array of strings): Eine Liste von MCP-Servernamen, die erlaubt sind. Wenn dies gesetzt ist, werden nur Server aus dieser Liste (entsprechend den Schlüsseln im `mcpServers`-Objekt) verbunden.
- **`mcp.excluded`** (array of strings): Eine Liste von MCP-Servernamen, die ausgeschlossen werden sollen. Server in dieser Liste werden nicht verbunden.

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

Das `mcpServers`-Objekt ist der Ort, an dem Sie jeden einzelnen MCP-Server definieren, mit dem die CLI verbunden werden soll.

### Konfigurationsstruktur

Fügen Sie ein `mcpServers`-Objekt zu Ihrer `settings.json`-Datei hinzu:

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
- **`timeout`** (number): Request-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)
- **`trust`** (boolean): Wenn `true`, werden alle Tool-Aufruf-Bestätigungen für diesen Server umgangen (Standard: `false`)
- **`includeTools`** (string[]): Liste von Toolnamen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Tools von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools vom Server aktiviert.
- **`excludeTools`** (string[]): Liste von Toolnamen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgeführten Tools sind für das Modell nicht verfügbar, selbst wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen.
- **`targetAudience`** (string): Die OAuth-Client-ID, die in der Whitelist der IAP-geschützten Anwendung steht, auf die Sie zugreifen möchten. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud-Dienstkontos, das Sie impersonieren möchten. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.

## OAuth-Unterstützung für entfernte MCP-Server

Qwen Code unterstützt OAuth 2.0-Authentifizierung für entfernte MCP-Server unter Verwendung von SSE- oder HTTP-Transports. Dies ermöglicht den sicheren Zugriff auf MCP-Server, die eine Authentifizierung erfordern.

### Automatische OAuth-Erkennung

Für Server, die die OAuth-Erkennung unterstützen, können Sie die OAuth-Konfiguration weglassen und die CLI die automatische Erkennung durchführen lassen:

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

- Erkennen, wenn ein Server eine OAuth-Authentifizierung erfordert (401-Antworten)
- OAuth-Endpunkte aus den Server-Metadaten ermitteln
- Dynamische Client-Registrierung durchführen, falls unterstützt
- Den OAuth-Ablauf und die Token-Verwaltung übernehmen

### Authentifizierungsablauf

Bei der Verbindung zu einem OAuth-fähigen Server:

1. **Erster Verbindungsversuch** schlägt mit 401 Unauthorized fehl
2. **OAuth-Erkennung** findet Autorisierungs- und Token-Endpunkte
3. **Browser öffnet sich** für die Benutzerauthentifizierung (erfordert lokalen Browserzugriff)
4. **Autorisierungscode** wird gegen Access-Token eingetauscht
5. **Tokens werden sicher** für die zukünftige Verwendung gespeichert
6. **Wiederholung der Verbindung** gelingt mit gültigen Tokens

### Browser-Weiterleitungsanforderungen

**Wichtig:** Die OAuth-Authentifizierung erfordert, dass die Redirect-URI erreichbar ist:

- **Standardverhalten**: Weiterleitung an `http://localhost:7777/oauth/callback` (funktioniert für lokale Einrichtungen)
- **Benutzerdefinierte Redirect-URI**: Verwenden Sie `--oauth-redirect-uri` oder konfigurieren Sie `redirectUri` in der settings.json, um eine andere URL anzugeben

Für **entfernte/Cloud-Server-Bereitstellungen** (z. B. Web-Terminals, SSH-Sitzungen, Cloud-IDEs):

- Die standardmäßige `localhost`-Weiterleitung wird NICHT funktionieren
- Sie MÜSSEN eine benutzerdefinierte `redirectUri` konfigurieren, die auf eine öffentlich erreichbare URL verweist
- Der Browser des Benutzers muss diese URL erreichen und zurück zum Server umleiten können

Beispiel für entfernte Server:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth funktioniert nicht in:

- Headless-Umgebungen ohne Browserzugriff
- Umgebungen, in denen die konfigurierte `redirectUri` vom Browser des Benutzers nicht erreichbar ist

### Verwalten der OAuth-Authentifizierung

Verwenden Sie den `/mcp`-Dialog innerhalb einer interaktiven Qwen Code-Sitzung, um MCP-Server zu überprüfen und die OAuth-Authentifizierung zu verwalten.

#### OAuth-Konfigurationseigenschaften

- **`enabled`** (boolean): OAuth für diesen Server aktivieren
- **`clientId`** (string): OAuth-Client-Identifikator (optional bei dynamischer Registrierung)
- **`clientSecret`** (string): OAuth-Client-Secret (optional für öffentliche Clients)
- **`authorizationUrl`** (string): OAuth-Autorisierungsendpunkt (wird automatisch erkannt, wenn weggelassen)
- **`tokenUrl`** (string): OAuth-Token-Endpunkt (wird automatisch erkannt, wenn weggelassen)
- **`scopes`** (string[]): Erforderliche OAuth-Bereiche
- **`redirectUri`** (string): Benutzerdefinierte Redirect-URI. **Kritisch für entfernte Bereitstellungen**: Standardmäßig `http://localhost:7777/oauth/callback`. Wenn Sie Qwen Code auf entfernten/Cloud-Servern ausführen, setzen Sie dies auf eine öffentlich erreichbare URL (z. B. `https://your-server.com/oauth/callback`). Kann über `qwen mcp add --oauth-redirect-uri` oder direkt in der settings.json konfiguriert werden.
- **`tokenParamName`** (string): Name des Query-Parameters für Tokens in SSE-URLs
- **`audiences`** (string[]): Zielgruppen, für die das Token gültig ist

#### Token-Verwaltung

OAuth-Tokens werden automatisch:

- **Gespeichert** in `~/.qwen/mcp-oauth-tokens.json` (Klartext, Modus 0600) standardmäßig. Wenn `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` gesetzt ist, verwendet Qwen Code nach Möglichkeit eine Keychain-gestützte Speicherung oder `~/.qwen/mcp-oauth-tokens-v2.json` mit AES-256-GCM-Verschlüsselung.
- **Aktualisiert** wenn abgelaufen (falls Refresh-Tokens verfügbar sind)
- **Validiert** vor jedem Verbindungsversuch
- **Bereinigt** wenn ungültig oder abgelaufen

> [!WARNING]
> Standardmäßig werden OAuth-Tokens unverschlüsselt auf der Festplatte gespeichert. Setzen Sie auf gemeinsam genutzten oder Multi-User-Maschinen `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`, um die Anmeldeinformationen zu schützen.

#### Authentifizierungsanbieter-Typ

Sie können den Authentifizierungsanbieter-Typ mit der Eigenschaft `authProviderType` angeben:

- **`authProviderType`** (string): Gibt den Authentifizierungsanbieter an. Kann einer der folgenden sein:
  - **`dynamic_discovery`** (Standard): Die CLI erkennt automatisch die OAuth-Konfiguration vom Server.
  - **`google_credentials`**: Die CLI verwendet die Google Application Default Credentials (ADC), um sich beim Server zu authentifizieren. Bei Verwendung dieses Anbieters müssen Sie die erforderlichen Bereiche angeben.
  - **`service_account_impersonation`**: Die CLI impersoniert ein Google Cloud-Dienstkonto, um sich beim Server zu authentifizieren. Dies ist nützlich für den Zugriff auf IAP-geschützte Dienste (dies wurde speziell für Cloud Run-Dienste entwickelt).

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

#### Dienstkonto-Impersonation

Um sich mit einem Server über Dienstkonto-Impersonation zu authentifizieren, müssen Sie `authProviderType` auf `service_account_impersonation` setzen und die folgenden Eigenschaften angeben:

- **`targetAudience`** (string): Die OAuth-Client-ID, die in der Whitelist der IAP-geschützten Anwendung steht.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud-Dienstkontos, das Sie impersonieren möchten.

Die CLI verwendet Ihre lokalen Application Default Credentials (ADC), um ein OIDC-ID-Token für das angegebene Dienstkonto und die Zielgruppe zu generieren. Dieses Token wird dann zur Authentifizierung beim MCP-Server verwendet.

#### Einrichtungsanweisungen

1. **[Erstellen](https://cloud.google.com/iap/docs/oauth-client-creation) oder verwenden Sie eine vorhandene OAuth 2.0-Client-ID.** Um eine vorhandene OAuth 2.0-Client-ID zu verwenden, folgen Sie den Schritten unter [So teilen Sie OAuth-Clients](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Fügen Sie die OAuth-ID zur Whitelist für den [programmatischen Zugriff](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) auf die Anwendung hinzu.** Da Cloud Run noch kein unterstützter Ressourcentyp in gcloud iap ist, müssen Sie die Client-ID im Projekt in die Whitelist aufnehmen.
3. **Erstellen Sie ein Dienstkonto.** [Dokumentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Cloud Console Link](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Fügen Sie sowohl das Dienstkonto als auch die Benutzer zur IAP-Richtlinie hinzu** auf der Registerkarte „Sicherheit“ des Cloud Run-Dienstes selbst oder über gcloud.
5. **Gewähren Sie allen Benutzern und Gruppen** die auf den MCP-Server zugreifen, die erforderlichen Berechtigungen, um das Dienstkonto zu [impersonieren](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (d. h. `roles/iam.serviceAccountTokenCreator`).
6. **[Aktivieren](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) Sie die IAM Credentials API** für Ihr Projekt.

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

### SSE-MCP-Server mit SA-Impersonation

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

## Tiefer Einblick in den Erkennungsprozess

Wenn Qwen Code startet, führt es die MCP-Servererkennung mit dem folgenden detaillierten Prozess durch:

### 1. Server-Iteration und Verbindung

Für jeden konfigurierten Server in `mcpServers`:

1. **Statusverfolgung beginnt:** Serverstatus wird auf `CONNECTING` gesetzt
2. **Transportauswahl:** Basierend auf den Konfigurationseigenschaften:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Verbindungsaufbau:** Der MCP-Client versucht, mit dem konfigurierten Timeout eine Verbindung herzustellen
4. **Fehlerbehandlung:** Verbindungsfehler werden protokolliert und der Serverstatus wird auf `DISCONNECTED` gesetzt

### 2. Tool-Erkennung

Bei erfolgreicher Verbindung:

1. **Tool-Auflistung:** Der Client ruft den Tool-Auflistungs-Endpunkt des MCP-Servers auf
2. **Schema-Validierung:** Die Funktionsdeklaration jedes Tools wird validiert
3. **Tool-Filterung:** Tools werden basierend auf der Konfiguration von `includeTools` und `excludeTools` gefiltert
4. **Namensbereinigung:** Toolnamen werden bereinigt, um die Anforderungen der Qwen-API zu erfüllen:
   - Ungültige Zeichen (nicht alphanumerisch, Unterstrich, Punkt, Bindestrich) werden durch Unterstriche ersetzt
   - Namen länger als 63 Zeichen werden mit Ersetzung in der Mitte (`___`) gekürzt

### 3. Konfliktauflösung

Wenn mehrere Server Tools mit demselben Namen bereitstellen:

1. **Erste Registrierung gewinnt:** Der erste Server, der einen Toolnamen registriert, erhält den nicht-präfixierten Namen
2. **Automatische Präfixierung:** Nachfolgende Server erhalten präfixierte Namen: `serverName__toolName`
3. **Registry-Nachverfolgung:** Der Tool-Registry pflegt Zuordnungen zwischen Servernamen und deren Tools

### 4. Schema-Verarbeitung

Tool-Parameter-Schemata werden für die API-Kompatibilität bereinigt:

- **`$schema`-Eigenschaften** werden entfernt
- **`additionalProperties`** werden entfernt
- **`anyOf` mit `default`** werden von ihren Standardwerten befreit (Vertex AI-Kompatibilität)
- **Rekursive Verarbeitung** gilt für verschachtelte Schemata

### 5. Verbindungsverwaltung

Nach der Erkennung:

- **Dauerhafte Verbindungen:** Server, die erfolgreich Tools registrieren, behalten ihre Verbindungen
- **Bereinigung:** Server, die keine nutzbaren Tools bereitstellen, werden getrennt
- **Status-Updates:** Endgültige Server-Status werden auf `CONNECTED` oder `DISCONNECTED` gesetzt

## Tool-Ausführungsablauf

Wenn das Modell entscheidet, ein MCP-Tool zu verwenden, erfolgt der folgende Ausführungsablauf:

### 1. Tool-Aufruf

Das Modell erzeugt einen `FunctionCall` mit:

- **Toolname:** Der registrierte Name (möglicherweise mit Präfix)
- **Argumente:** JSON-Objekt, das dem Parameter-Schema des Tools entspricht

### 2. Bestätigungsprozess

Jede `DiscoveredMCPTool` implementiert eine ausgefeilte Bestätigungslogik:

#### Vertrauensbasierte Umgehung

```typescript
if (this.trust) {
  return false; // Keine Bestätigung erforderlich
}
```

#### Dynamische Allow-Liste

Das System verwaltet interne Allow-Listen für:

- **Server-Ebene:** `serverName` → Alle Tools von diesem Server sind vertrauenswürdig
- **Tool-Ebene:** `serverName.toolName` → Dieses bestimmte Tool ist vertrauenswürdig

#### Behandlung von Benutzerentscheidungen

Wenn eine Bestätigung erforderlich ist, können Benutzer wählen:

- **Einmalig ausführen:** Dieses Mal nur ausführen
- **Dieses Tool immer zulassen:** Zur Tool-Ebene Allow-Liste hinzufügen
- **Diesen Server immer zulassen:** Zur Server-Ebene Allow-Liste hinzufügen
- **Abbrechen:** Ausführung abbrechen

### 3. Ausführung

Nach der Bestätigung (oder Vertrauensumgehung):

1. **Parameter-Vorbereitung:** Argumente werden gegen das Schema des Tools validiert
2. **MCP-Aufruf:** Das zugrunde liegende `CallableTool` ruft den Server auf mit:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Originaler Server-Toolname
       args: params,
     },
   ];
   ```

3. **Antwortverarbeitung:** Ergebnisse werden sowohl für den LLM-Kontext als auch für die Benutzeranzeige formatiert

### 4. Antwortbehandlung

Das Ausführungsergebnis enthält:

- **`llmContent`:** Rohe Antwortteile für den Kontext des Sprachmodells
- **`returnDisplay`:** Formatierte Ausgabe zur Anzeige für den Benutzer (oft JSON in Markdown-Codeblöcken)

## So interagieren Sie mit Ihrem MCP-Server

### Verwenden des `/mcp`-Befehls

Der `/mcp`-Befehl bietet umfassende Informationen über Ihre MCP-Server-Einrichtung:

```bash
/mcp
```

Dies zeigt:

- **Serverliste:** Alle konfigurierten MCP-Server
- **Verbindungsstatus:** `CONNECTED`, `CONNECTING` oder `DISCONNECTED`
- **Serverdetails:** Konfigurationszusammenfassung (ohne sensible Daten)
- **Verfügbare Tools:** Liste der Tools von jedem Server mit Beschreibungen
- **Erkennungsstatus:** Gesamter Status des Erkennungsprozesses

### Beispiel für die `/mcp`-Ausgabe

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

Nach der Erkennung stehen MCP-Tools dem Qwen-Modell wie eingebaute Tools zur Verfügung. Das Modell führt automatisch Folgendes durch:

1. **Auswahl geeigneter Tools** basierend auf Ihren Anforderungen
2. **Anzeigen von Bestätigungsdialogen** (sofern der Server nicht vertrauenswürdig ist)
3. **Ausführen von Tools** mit den entsprechenden Parametern
4. **Anzeigen der Ergebnisse** in einem benutzerfreundlichen Format

## Statusüberwachung und Fehlerbehebung

### Verbindungszustände

Die MCP-Integration verfolgt mehrere Zustände:

#### Server-Status (`MCPServerStatus`)

- **`DISCONNECTED`:** Server ist nicht verbunden oder hat Fehler
- **`CONNECTING`:** Verbindungsversuch läuft
- **`CONNECTED`:** Server ist verbunden und bereit

#### Erkennungszustand (`MCPDiscoveryState`)

- **`NOT_STARTED`:** Erkennung wurde noch nicht gestartet
- **`IN_PROGRESS`:** Server werden gerade erkannt
- **`COMPLETED`:** Erkennung abgeschlossen (mit oder ohne Fehler)

### Häufige Probleme und Lösungen

#### Server stellt keine Verbindung her

**Symptome:** Server zeigt Status `DISCONNECTED`

**Fehlerbehebung:**

1. **Konfiguration prüfen:** Stellen Sie sicher, dass `command`, `args` und `cwd` korrekt sind.
2. **Manuell testen:** Führen Sie den Serverbefehl direkt aus, um zu prüfen, ob er funktioniert.
3. **Abhängigkeiten prüfen:** Stellen Sie sicher, dass alle erforderlichen Pakete installiert sind.
4. **Logs überprüfen:** Suchen Sie in der CLI-Ausgabe nach Fehlermeldungen.
5. **Berechtigungen prüfen:** Stellen Sie sicher, dass die CLI den Serverbefehl ausführen kann.

#### Keine Tools erkannt

**Symptome:** Server verbindet sich, aber es sind keine Tools verfügbar.

**Fehlerbehebung:**

1. **Tool-Registrierung prüfen:** Stellen Sie sicher, dass Ihr Server tatsächlich Tools registriert.
2. **MCP-Protokoll prüfen:** Vergewissern Sie sich, dass Ihr Server die MCP-Tool-Liste korrekt implementiert.
3. **Server-Logs überprüfen:** Prüfen Sie die stderr-Ausgabe auf serverseitige Fehler.
4. **Tool-Liste testen:** Testen Sie den Tool-Erkennungsendpunkt Ihres Servers manuell.

#### Tools werden nicht ausgeführt

**Symptome:** Tools werden erkannt, schlagen aber bei der Ausführung fehl.

**Fehlerbehebung:**

1. **Parametervalidierung:** Stellen Sie sicher, dass Ihr Tool die erwarteten Parameter akzeptiert.
2. **Schema-Kompatibilität:** Überprüfen Sie, ob Ihre Eingabeschemata gültige JSON-Schemata sind.
3. **Fehlerbehandlung:** Prüfen Sie, ob Ihr Tool nicht abgefangene Ausnahmen auslöst.
4. **Timeout-Probleme:** Erwägen Sie, die `timeout`-Einstellung zu erhöhen.

#### Sandbox-Kompatibilität

**Symptome:** MCP-Server schlagen fehl, wenn die Sandbox aktiviert ist.

**Lösungen:**

1. **Docker-basierte Server:** Verwenden Sie Docker-Container, die alle Abhängigkeiten enthalten.
2. **Pfadzugänglichkeit:** Stellen Sie sicher, dass ausführbare Serverdateien in der Sandbox verfügbar sind.
3. **Netzwerkzugriff:** Konfigurieren Sie die Sandbox, um erforderliche Netzwerkverbindungen zuzulassen.
4. **Umgebungsvariablen:** Überprüfen Sie, ob erforderliche Umgebungsvariablen durchgereicht werden.

### Debugging-Tipps

1. **Debug-Modus aktivieren:** Führen Sie die CLI mit `--debug` für ausführliche Ausgabe aus.
2. **stderr prüfen:** Die stderr des MCP-Servers wird erfasst und protokolliert (INFO-Nachrichten werden gefiltert).
3. **Test-Isolation:** Testen Sie Ihren MCP-Server unabhängig, bevor Sie ihn integrieren.
4. **Schrittweiser Aufbau:** Beginnen Sie mit einfachen Tools, bevor Sie komplexe Funktionalität hinzufügen.
5. **`/mcp` häufig nutzen:** Überwachen Sie den Serverstatus während der Entwicklung.

## Wichtige Hinweise

### Sicherheitsaspekte

- **Vertrauenseinstellungen:** Die Option `trust` umgeht alle Bestätigungsdialoge. Verwenden Sie diese mit Vorsicht und nur für Server, die Sie vollständig kontrollieren.
- **Zugriffstoken:** Seien Sie sicherheitsbewusst bei der Konfiguration von Umgebungsvariablen, die API-Schlüssel oder Token enthalten.
- **Sandbox-Kompatibilität:** Wenn Sie Sandboxing verwenden, stellen Sie sicher, dass MCP-Server innerhalb der Sandbox-Umgebung verfügbar sind.
- **Private Daten:** Die Verwendung von weitgefassten persönlichen Zugriffstoken kann zu Informationslecks zwischen Repositorys führen.

### Leistung und Ressourcenverwaltung

- **Verbindungspersistenz:** Die CLI hält dauerhafte Verbindungen zu Servern aufrecht, die erfolgreich Tools registrieren.
- **Automatische Bereinigung:** Verbindungen zu Servern, die keine Tools bereitstellen, werden automatisch geschlossen.
- **Timeout-Verwaltung:** Konfigurieren Sie angemessene Timeouts basierend auf den Antwortcharakteristiken Ihres Servers.
- **Ressourcenüberwachung:** MCP-Server laufen als separate Prozesse und verbrauchen Systemressourcen.

### Schema-Kompatibilität

- **Schema-Compliance-Modus:** Standardmäßig (`schemaCompliance: "auto"`) werden Toolschemata unverändert durchgereicht. Setzen Sie `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` in Ihrer `settings.json`, um Modelle in das strenge OpenAPI 3.0-Format zu konvertieren.
- **OpenAPI 3.0-Transformationen:** Wenn der Modus `openapi_30` aktiviert ist, verarbeitet das System:
  - Nullable-Typen: `["string", "null"]` -> `type: "string", nullable: true`
  - Const-Werte: `const: "foo"` -> `enum: ["foo"]`
  - Exklusive Limits: numerisches `exclusiveMinimum` -> boolesche Form mit `minimum`
  - Schlüsselwortentfernung: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Namensbereinigung:** Toolnamen werden automatisch bereinigt, um API-Anforderungen zu erfüllen.
- **Konfliktlösung:** Toolnamenkonflikte zwischen Servern werden durch automatisches Präfixing gelöst.

Diese umfassende Integration macht MCP-Server zu einer leistungsstarken Möglichkeit, die Fähigkeiten der CLI zu erweitern, während Sicherheit, Zuverlässigkeit und Benutzerfreundlichkeit gewahrt bleiben.

## Rückgabe von umfangreichen Inhalten aus Tools

MCP-Tools sind nicht darauf beschränkt, einfachen Text zurückzugeben. Sie können umfangreiche, mehrteilige Inhalte zurückgeben, darunter Text, Bilder, Audio und andere Binärdaten in einer einzigen Tool-Antwort. Dies ermöglicht es Ihnen, leistungsstarke Tools zu erstellen, die dem Modell vielfältige Informationen in einem einzigen Durchlauf bereitstellen können.

Alle vom Tool zurückgegebenen Daten werden verarbeitet und dem Modell als Kontext für seine nächste Generierung übergeben, sodass es die bereitgestellten Informationen begründen oder zusammenfassen kann.

### Funktionsweise

Um umfangreiche Inhalte zurückzugeben, muss die Antwort Ihres Tools der MCP-Spezifikation für ein [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) entsprechen. Das `content`-Feld des Ergebnisses sollte ein Array von `ContentBlock`-Objekten sein. Die CLI verarbeitet dieses Array korrekt, trennt Text von Binärdaten und verpackt es für das Modell.

Sie können verschiedene Inhaltsblocktypen im `content`-Array mischen und kombinieren. Die unterstützten Blocktypen umfassen:

- `text`
- `image`
- `audio`
- `resource` (eingebettete Inhalte)
- `resource_link`

### Beispiel: Text und ein Bild zurückgeben

Hier ist ein Beispiel einer gültigen JSON-Antwort von einem MCP-Tool, das sowohl eine Textbeschreibung als auch ein Bild zurückgibt:

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

1.  Den gesamten Text extrahieren und zu einem einzigen `functionResponse`-Teil für das Modell zusammenfassen.
2.  Die Bilddaten als separaten `inlineData`-Teil präsentieren.
3.  Eine saubere, benutzerfreundliche Zusammenfassung in der CLI anzeigen, die angibt, dass sowohl Text als auch ein Bild empfangen wurden.

Dies ermöglicht es Ihnen, anspruchsvolle Tools zu erstellen, die dem Qwen-Modell umfangreichen, multimodalen Kontext bereitstellen können.

## MCP-Prompts als Slash-Befehle

Zusätzlich zu Tools können MCP-Server vordefinierte Prompts bereitstellen, die als Slash-Befehle innerhalb von Qwen Code ausgeführt werden können. Dies ermöglicht es Ihnen, Abkürzungen für häufige oder komplexe Abfragen zu erstellen, die einfach per Name aufgerufen werden können.

### Definieren von Prompts auf dem Server

Hier ist ein kleines Beispiel eines stdio-MCP-Servers, der Prompts definiert:

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

Sobald ein Prompt erkannt wurde, können Sie ihn über seinen Namen als Slash-Befehl aufrufen. Die CLI verarbeitet die Argumente automatisch.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

oder mit positionsbasierten Argumenten:

```bash
/poem-writer "Qwen Code" reverent
```

Wenn Sie diesen Befehl ausführen, führt die CLI die Methode `prompts/get` auf dem MCP-Server mit den bereitgestellten Argumenten aus. Der Server ist dafür verantwortlich, die Argumente in die Prompt-Vorlage einzusetzen und den endgültigen Prompt-Text zurückzugeben. Die CLI sendet diesen Prompt dann zur Ausführung an das Modell. Dies bietet eine bequeme Möglichkeit, allgemeine Arbeitsabläufe zu automatisieren und zu teilen.

## Verwalten von MCP-Servern mit `qwen mcp`

Während Sie MCP-Server jederzeit durch manuelles Bearbeiten Ihrer `settings.json`-Datei konfigurieren können, bietet die CLI einen praktischen Satz von Befehlen, um Ihre Serverkonfigurationen programmatisch zu verwalten. Diese Befehle optimieren das Hinzufügen, Auflisten und Entfernen von MCP-Servern, ohne dass Sie JSON-Dateien direkt bearbeiten müssen.

### Hinzufügen eines Servers (`qwen mcp add`)

Der Befehl `add` konfiguriert einen neuen MCP-Server in Ihrer `settings.json`. Abhängig vom Gültigkeitsbereich (`-s, --scope`) wird er entweder zur Benutzerkonfiguration `~/.qwen/settings.json` oder zur Projektkonfiguration `.qwen/settings.json` hinzugefügt.

**Befehl:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: Ein eindeutiger Name für den Server.
- `<commandOrUrl>`: Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`).
- `[args...]`: Optionale Argumente für einen `stdio`-Befehl.

**Optionen (Flags):**

- `-s, --scope`: Konfigurationsbereich (user oder project). [Standard: "project"]
- `-t, --transport`: Transporttyp (stdio, sse, http). [Standard: "stdio"]
- `-e, --env`: Umgebungsvariablen setzen (z.B. -e KEY=value).
- `-H, --header`: HTTP-Header für SSE- und HTTP-Transporte setzen (z.B. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Verbindungs-Timeout in Millisekunden festlegen.
- `--trust`: Server als vertrauenswürdig einstufen (alle Bestätigungsaufforderungen bei Tool-Aufrufen umgehen).
- `--description`: Beschreibung für den Server festlegen.
- `--include-tools`: Kommagetrennte Liste der einzuschließenden Tools.
- `--exclude-tools`: Kommagetrennte Liste der auszuschließenden Tools.
- `--oauth-client-id`: OAuth-Client-ID für die MCP-Server-Authentifizierung.
- `--oauth-client-secret`: OAuth-Client-Secret für die MCP-Server-Authentifizierung.
- `--oauth-redirect-uri`: OAuth-Weiterleitungs-URI (z.B. `https://your-server.com/oauth/callback`). Standardmäßig `http://localhost:7777/oauth/callback` für lokale Einrichtungen. **Wichtig für entfernte Bereitstellungen**: Wenn Sie Qwen Code auf entfernten/Cloud-Servern ausführen, setzen Sie dies auf eine öffentlich zugängliche URL.
- `--oauth-authorization-url`: OAuth-Autorisierungs-URL.
- `--oauth-token-url`: OAuth-Token-URL.
- `--oauth-scopes`: OAuth-Bereiche (kommagetrennt).

#### Hinzufügen eines stdio-Servers

Dies ist der Standardtransport für die Ausführung lokaler Server.

```bash
# Grundlegende Syntax
qwen mcp add <name> <command> [args...]

# Beispiel: Hinzufügen eines lokalen Servers
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Beispiel: Hinzufügen eines lokalen Python-Servers
qwen mcp add python-server python server.py --port 8080
```

#### Hinzufügen eines HTTP-Servers

Dieser Transport ist für Server, die den streamable HTTP-Transport verwenden.

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

# Beispiel: Hinzufügen eines SSE-Servers
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Beispiel: Hinzufügen eines SSE-Servers mit einem Authentifizierungs-Header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Beispiel: Hinzufügen eines OAuth-fähigen SSE-Servers
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### Verwalten von Servern (`/mcp`)

Um alle aktuell konfigurierten MCP-Server anzuzeigen und zu verwalten, öffnen Sie den `/mcp`-Dialog innerhalb einer interaktiven Qwen Code-Sitzung. Dieser Dialog ermöglicht Ihnen:

- Alle MCP-Server mit ihrem Verbindungsstatus anzuzeigen
- Server zu aktivieren/deaktivieren
- Verbindung zu getrennten Servern wiederherzustellen
- Tools und Prompts jedes Servers anzuzeigen
- Server-Logs anzuzeigen

**Befehl:**

```bash
qwen
```

Geben Sie dann Folgendes ein:

```text
/mcp
```

Der Verwaltungsdialog bietet eine visuelle Oberfläche, die den Namen jedes Servers, Konfigurationsdetails, Verbindungsstatus und verfügbare Tools/Prompts anzeigt.

### Entfernen eines Servers (`qwen mcp remove`)

Um einen Server aus Ihrer Konfiguration zu löschen, verwenden Sie den Befehl `remove` mit dem Servernamen.

**Befehl:**

```bash
qwen mcp remove <name>
```

**Beispiel:**

```bash
qwen mcp remove my-server
```

Dies findet und löscht den Eintrag "my-server" aus dem `mcpServers`-Objekt in der entsprechenden `settings.json`-Datei, basierend auf dem Gültigkeitsbereich (`-s, --scope`).