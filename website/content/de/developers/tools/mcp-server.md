# MCP server mit Qwen Code

Dieses Dokument bietet eine Anleitung zur Konfiguration und Nutzung von Model Context Protocol (MCP) Servern mit Qwen Code.

## Was ist ein MCP Server?

Ein MCP Server ist eine Anwendung, die der CLI Werkzeuge und Ressourcen über das Model Context Protocol bereitstellt, sodass sie mit externen Systemen und Datenquellen interagieren kann. MCP Server dienen als Brücke zwischen dem Modell und Ihrer lokalen Umgebung oder anderen Diensten wie APIs.

Ein MCP Server ermöglicht der CLI Folgendes:

- **Werkzeuge entdecken:** Verfügbare Werkzeuge, deren Beschreibungen und Parameter durch standardisierte Schema-Definitionen auflisten.
- **Werkzeuge ausführen:** Spezifische Werkzeuge mit definierten Argumenten aufrufen und strukturierte Antworten erhalten.
- **Auf Ressourcen zugreifen:** Daten von bestimmten Ressourcen lesen (obwohl die CLI sich hauptsächlich auf die Ausführung von Werkzeugen konzentriert).

Mit einem MCP Server können Sie die Fähigkeiten der CLI erweitern, um Aktionen auszuführen, die über ihre integrierten Funktionen hinausgehen, wie z. B. die Interaktion mit Datenbanken, APIs, benutzerdefinierten Skripten oder spezialisierten Workflows.

## Kernarchitektur der Integration

Qwen Code integriert MCP Server über ein ausgeklügeltes System zur Erkennung und Ausführung, das im Kernpaket (`packages/core/src/tools/`) eingebaut ist:

### Erkennungsschicht (`mcp-client.ts`)

Der Erkennungsprozess wird von `discoverMcpTools()` orchestriert, welches:

1. **Durch die konfigurierten Server** aus Ihrer `settings.json` `mcpServers`-Konfiguration iteriert
2. **Verbindungen herstellt**, indem es geeignete Transportmechanismen (Stdio, SSE oder Streamable HTTP) verwendet
3. **Werkzeugdefinitionen** von jedem Server über das MCP-Protokoll abruft
4. **Werkzeugschemata bereinigt und validiert** für die Kompatibilität mit der Qwen API
5. **Werkzeuge im globalen Werkzeugregister** mit Konfliktlösung registriert

### Ausführungsschicht (`mcp-tool.ts`)

Jedes entdeckte MCP Werkzeug wird in eine `DiscoveredMCPTool`-Instanz eingewickelt, die:

- **Bestätigungslogik** basierend auf Server-Vertrauenseinstellungen und Benutzerpräferenzen handhabt
- **Die Werkzeugausführung verwaltet**, indem sie den MCP Server mit den richtigen Parametern aufruft
- **Antworten verarbeitet** sowohl für den LLM-Kontext als auch für die Benutzeranzeige
- **Den Verbindungsstatus verwaltet** und Timeouts behandelt

### Transportmechanismen

Die CLI unterstützt drei MCP-Transporttypen:

- **Stdio Transport:** Startet einen Unterprozess und kommuniziert über stdin/stdout
- **SSE Transport:** Stellt eine Verbindung zu Server-Sent Events Endpunkten her
- **Streamable HTTP Transport:** Nutzt HTTP-Streaming zur Kommunikation

## So richten Sie Ihren MCP Server ein

Qwen Code verwendet die `mcpServers`-Konfiguration in Ihrer `settings.json`-Datei, um MCP Server zu lokalisieren und zu verbinden. Diese Konfiguration unterstützt mehrere Server mit unterschiedlichen Transportmechanismen.

### Konfigurieren des MCP Servers in settings.json

Sie können MCP Server in Ihrer `settings.json`-Datei auf zwei Arten konfigurieren: über das `mcpServers`-Objekt auf oberster Ebene für spezifische Serverdefinitionen und über das `mcp`-Objekt für globale Einstellungen, die die Servererkennung und -ausführung steuern.

#### Globale MCP Einstellungen (`mcp`)

Mit dem `mcp`-Objekt in Ihrer `settings.json` können Sie globale Regeln für alle MCP Server festlegen.

- **`mcp.serverCommand`** (string): Ein globaler Befehl zum Starten eines MCP Servers.
- **`mcp.allowed`** (array of strings): Eine Liste von MCP Server-Namen, die erlaubt sind. Wenn gesetzt, werden nur Server aus dieser Liste (die den Schlüsseln im `mcpServers`-Objekt entsprechen) verbunden.
- **`mcp.excluded`** (array of strings): Eine Liste von MCP Server-Namen, die ausgeschlossen werden. Server in dieser Liste werden nicht verbunden.

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

Im `mcpServers`-Objekt definieren Sie jeden einzelnen MCP Server, mit dem die CLI verbunden werden soll.

### Konfigurationsstruktur

Fügen Sie Ihrer `settings.json`-Datei ein `mcpServers`-Objekt hinzu:

```json
{ ...datei enthält andere Konfigurationsobjekte
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

#### Erforderlich (eines der folgenden)

- **`command`** (string): Pfad zur ausführbaren Datei für Stdio Transport
- **`url`** (string): SSE Endpunkt-URL (z. B. `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): HTTP-Streaming Endpunkt-URL

#### Optional

- **`args`** (string[]): Befehlszeilenargumente für Stdio Transport
- **`headers`** (object): Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`
- **`env`** (object): Umgebungsvariablen für den Serverprozess. Werte können Umgebungsvariablen mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren
- **`cwd`** (string): Arbeitsverzeichnis für Stdio Transport
- **`timeout`** (number): Request-Timeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)
- **`trust`** (boolean): Wenn `true`, werden alle Werkzeugaufrufbestätigungen für diesen Server umgangen (Standard: `false`)
- **`includeTools`** (string[]): Liste von Werkzeugnamen, die von diesem MCP Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Werkzeuge von diesem Server verfügbar (Allowlist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Werkzeuge des Servers aktiviert.
- **`excludeTools`** (string[]): Liste von Werkzeugnamen, die von diesem MCP Server ausgeschlossen werden sollen. Die hier aufgeführten Werkzeuge stehen dem Modell nicht zur Verfügung, selbst wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Werkzeug in beiden Listen vorkommt, wird es ausgeschlossen.
- **`targetAudience`** (string): Die OAuth Client ID, die für die IAP-geschützte Anwendung, auf die Sie zugreifen möchten, auf die Whitelist gesetzt wurde. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Account, den Sie impersonieren möchten. Wird mit `authProviderType: 'service_account_impersonation'` verwendet.
### OAuth-Unterstützung für entfernte MCP-Server

Qwen Code unterstützt die OAuth 2.0-Authentifizierung für entfernte MCP-Server, die SSE- oder HTTP-Transporte verwenden. Dies ermöglicht einen sicheren Zugriff auf MCP-Server, die eine Authentifizierung erfordern.

#### Automatische OAuth-Erkennung

Bei Servern, die OAuth-Erkennung unterstützen, können Sie die OAuth-Konfiguration weglassen und die CLI die Erkennung automatisch durchführen lassen:

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
- OAuth-Endpunkte aus Server-Metadaten erkennen
- Dynamische Client-Registrierung durchführen, falls unterstützt
- Den OAuth-Ablauf und die Token-Verwaltung handhaben

#### Authentifizierungsablauf

Beim Verbinden mit einem OAuth-fähigen Server:

1. **Erster Verbindungsversuch** schlägt mit 401 Unauthorized fehl
2. **OAuth-Erkennung** findet Autorisierungs- und Token-Endpunkte
3. **Browser öffnet sich** für die Benutzerauthentifizierung (erfordert lokalen Browserzugriff)
4. **Autorisierungscode** wird gegen Zugriffstoken eingetauscht
5. **Token werden sicher** für die zukünftige Verwendung gespeichert
6. **Wiederholungsversuch der Verbindung** gelingt mit gültigen Token

#### Anforderungen an die Browser-Weiterleitung

**Wichtig:** Die OAuth-Authentifizierung erfordert, dass die Weiterleitungs-URI erreichbar ist:

- **Standardverhalten**: Weiterleitung an `http://localhost:7777/oauth/callback` (funktioniert für lokale Einrichtungen)
- **Benutzerdefinierte Weiterleitungs-URI**: Verwenden Sie `--oauth-redirect-uri` oder konfigurieren Sie `redirectUri` in settings.json, um eine andere URL anzugeben.

Für **Remote-/Cloud-Server-Bereitstellungen** (z. B. Web-Terminals, SSH-Sitzungen, Cloud-IDEs):

- Die standardmäßige `localhost`-Weiterleitung wird NICHT funktionieren
- Sie MÜSSEN eine benutzerdefinierte `redirectUri` konfigurieren, die auf eine öffentlich zugängliche URL verweist
- Der Browser des Benutzers muss diese URL erreichen und zum Server zurückleiten können

Beispiel für entfernte Server:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth wird nicht funktionieren:

- In headless Umgebungen ohne Browserzugriff
- In Umgebungen, in denen die konfigurierte `redirectUri` vom Browser des Benutzers nicht erreichbar ist

#### Verwalten der OAuth-Authentifizierung

Verwenden Sie den `/mcp`-Dialog innerhalb einer interaktiven Qwen Code-Sitzung, um MCP-Server zu inspizieren und die OAuth-Authentifizierung zu verwalten.

#### Eigenschaften der OAuth-Konfiguration

- **`enabled`** (boolean): OAuth für diesen Server aktivieren
- **`clientId`** (string): OAuth-Client-Identifikator (optional bei dynamischer Registrierung)
- **`clientSecret`** (string): OAuth-Client-Geheimnis (optional für öffentliche Clients)
- **`authorizationUrl`** (string): OAuth-Autorisierungsendpunkt (wird automatisch erkannt, wenn ausgelassen)
- **`tokenUrl`** (string): OAuth-Token-Endpunkt (wird automatisch erkannt, wenn ausgelassen)
- **`scopes`** (string[]): Erforderliche OAuth-Bereiche
- **`redirectUri`** (string): Benutzerdefinierte Weiterleitungs-URI. **Kritisch für Remote-Bereitstellungen**: Standardmäßig auf `http://localhost:7777/oauth/callback` gesetzt. Wenn Qwen Code auf Remote-/Cloud-Servern ausgeführt wird, setzen Sie dies auf eine öffentlich zugängliche URL (z. B. `https://ihr-server.com/oauth/callback`). Kann über `qwen mcp add --oauth-redirect-uri` oder direkt in settings.json konfiguriert werden.
- **`tokenParamName`** (string): Query-Parameter-Name für Token in SSE-URLs
- **`audiences`** (string[]): Zielgruppen, für die das Token gültig ist

#### Token-Verwaltung

OAuth-Token werden automatisch:

- **Gespeichert** in `~/.qwen/mcp-oauth-tokens.json` (Klartext, Modus 0600) standardmäßig. Wenn `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` gesetzt ist, verwendet Qwen Code nach Möglichkeit einen schlüsselbundgestützten Speicher oder `~/.qwen/mcp-oauth-tokens-v2.json` mit AES-256-GCM-Verschlüsselung.
- **Aktualisiert** bei Ablauf (falls Aktualisierungstoken verfügbar)
- **Validiert** vor jedem Verbindungsversuch
- **Bereinigt** wenn ungültig oder abgelaufen

> [!WARNING]
> Standardmäßig werden OAuth-Token unverschlüsselt auf der Festplatte gespeichert. Setzen Sie auf gemeinsam genutzten oder Mehrbenutzerrechnern `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`, um die Anmeldeinformationen zu schützen.

#### Authentifizierungsanbietertyp

Sie können den Authentifizierungsanbietertyp mit der Eigenschaft `authProviderType` angeben:

- **`authProviderType`** (string): Gibt den Authentifizierungsanbieter an. Kann einer der folgenden sein:
  - **`dynamic_discovery`** (Standard): Die CLI erkennt die OAuth-Konfiguration automatisch vom Server.
  - **`google_credentials`**: Die CLI verwendet die Google Application Default Credentials (ADC), um sich beim Server zu authentifizieren. Bei Verwendung dieses Anbieters müssen Sie die erforderlichen Bereiche angeben.
  - **`service_account_impersonation`**: Die CLI imitiert ein Google Cloud-Dienstkonto, um sich beim Server zu authentifizieren. Dies ist nützlich für den Zugriff auf IAP-geschützte Dienste (dies wurde speziell für Cloud Run-Dienste entwickelt).

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
#### Dienstkonto-Identitätswechsel (Service Account Impersonation)

Um sich mit einem Server unter Verwendung des Dienstkonto-Identitätswechsels zu authentifizieren, müssen Sie `authProviderType` auf `service_account_impersonation` setzen und die folgenden Eigenschaften angeben:

- **`targetAudience`** (string): Die OAuth-Client-ID, die für die IAP-geschützte Anwendung, auf die Sie zugreifen möchten, in der Zulassungsliste eingetragen ist.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud-Dienstkontos, dessen Identität angenommen werden soll.

Die CLI verwendet Ihre lokalen Anwendungsstandard-Anmeldedaten (Application Default Credentials, ADC), um ein OIDC-ID-Token für das angegebene Dienstkonto und die Zielgruppe zu generieren. Dieses Token wird dann zur Authentifizierung beim MCP-Server verwendet.

#### Einrichtungsanleitung

1. **[Erstellen](https://cloud.google.com/iap/docs/oauth-client-creation) Sie eine OAuth 2.0-Client-ID oder verwenden Sie eine vorhandene.** Um eine vorhandene OAuth 2.0-Client-ID zu verwenden, befolgen Sie die Schritte unter [OAuth-Clients freigeben](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Fügen Sie die OAuth-ID zur Zulassungsliste für den [programmatischen Zugriff](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) auf die Anwendung hinzu.** Da Cloud Run noch kein unterstützter Ressourcentyp in gcloud iap ist, müssen Sie die Client-ID auf Projektebene in die Zulassungsliste aufnehmen.
3. **Erstellen Sie ein Dienstkonto.** [Dokumentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Cloud Console-Link](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Fügen Sie sowohl das Dienstkonto als auch die Benutzer zur IAP-Richtlinie hinzu** – entweder im Reiter "Sicherheit" des Cloud Run-Dienstes selbst oder über gcloud.
5. **Gewähren Sie allen Benutzern und Gruppen**, die auf den MCP-Server zugreifen werden, die erforderlichen Berechtigungen, um die Identität des Dienstkontos anzunehmen (d.h. `roles/iam.serviceAccountTokenCreator`).
6. **[Aktivieren Sie](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) die IAM Credentials API** für Ihr Projekt.

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

### SSE MCP-Server mit Dienstkonto-Identitätswechsel

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

## Tiefergehende Betrachtung des Erkennungsprozesses

Beim Start von Qwen Code wird die MCP-Servererkennung gemäß dem folgenden detaillierten Prozess durchgeführt:

### 1. Server-Durchlauf und Verbindungsaufbau

Für jeden konfigurierten Server in `mcpServers`:

1. **Statusverfolgung beginnt:** Der Serverstatus wird auf `CONNECTING` gesetzt
2. **Transportauswahl:** Basierend auf den Konfigurationseigenschaften:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Verbindungsaufbau:** Der MCP-Client versucht, sich mit dem konfigurierten Timeout zu verbinden
4. **Fehlerbehandlung:** Verbindungsfehler werden protokolliert und der Serverstatus auf `DISCONNECTED` gesetzt

### 2. Tool-Erkennung

Nach erfolgreicher Verbindung:

1. **Tool-Auflistung:** Der Client ruft den Endpunkt zur Auflistung der Tools des MCP-Servers auf
2. **Schema-Validierung:** Die Funktionsdeklaration jedes Tools wird validiert
3. **Tool-Filterung:** Tools werden basierend auf der Konfiguration von `includeTools` und `excludeTools` gefiltert
4. **Namensbereinigung:** Toolnamen werden bereinigt, um die Anforderungen der Qwen-API zu erfüllen:
   - Ungültige Zeichen (nicht alphanumerisch, Unterstrich, Punkt, Bindestrich) werden durch Unterstriche ersetzt
   - Namen, die länger als 63 Zeichen sind, werden mit mittlerer Ersetzung (`___`) gekürzt
### 3. Konfliktlösung

Wenn mehrere Server Werkzeuge mit demselben Namen bereitstellen:

1. **Erste Registrierung gewinnt:** Der erste Server, der einen Werkzeugnamen registriert, erhält den unpräfixierten Namen
2. **Automatische Präfixierung:** Nachfolgende Server erhalten präfixierte Namen: `serverName__toolName`
3. **Registry-Nachverfolgung:** Die Werkzeug-Registry verwaltet Zuordnungen zwischen Servernamen und ihren Werkzeugen

### 4. Schema-Verarbeitung

Werkzeug-Parameterschemata werden zur API-Kompatibilität bereinigt:

- **`$schema`-Eigenschaften** werden entfernt
- **`additionalProperties`** werden entfernt
- **`anyOf` mit `default`** deren Standardwerte werden entfernt (Vertex AI-Kompatibilität)
- **Rekursive Verarbeitung** gilt für verschachtelte Schemata

### 5. Verbindungsverwaltung

Nach der Erkennung:

- **Persistente Verbindungen:** Server, die erfolgreich Werkzeuge registrieren, behalten ihre Verbindungen bei
- **Bereinigung:** Server, die keine nutzbaren Werkzeuge bereitstellen, werden getrennt
- **Statusaktualisierungen:** Endgültige Serverstatus werden auf `CONNECTED` oder `DISCONNECTED` gesetzt

## Ausführungsablauf von Werkzeugen

Wenn das Modell beschließt, ein MCP-Werkzeug zu verwenden, erfolgt folgender Ausführungsablauf:

### 1. Werkzeugaufruf

Das Modell erzeugt einen `FunctionCall` mit:

- **Werkzeugname:** Der registrierte Name (ggf. mit Präfix)
- **Argumente:** JSON-Objekt, das dem Parameterschema des Werkzeugs entspricht

### 2. Bestätigungsprozess

Jedes `DiscoveredMCPTool` implementiert eine anspruchsvolle Bestätigungslogik:

#### Vertrauensbasierte Umgehung

```typescript
if (this.trust) {
  return false; // Keine Bestätigung erforderlich
}
```

#### Dynamische Zulassungsliste

Das System verwaltet interne Zulassungslisten für:

- **Server-Ebene:** `serverName` → Alle Werkzeuge von diesem Server sind vertrauenswürdig
- **Werkzeug-Ebene:** `serverName.toolName` → Dieses spezifische Werkzeug ist vertrauenswürdig

#### Benutzerauswahl

Wenn eine Bestätigung erforderlich ist, können Benutzer wählen:

- **Einmal ausführen:** Nur dieses Mal ausführen
- **Dieses Werkzeug immer zulassen:** Zur Zulassungsliste auf Werkzeug-Ebene hinzufügen
- **Diesen Server immer zulassen:** Zur Zulassungsliste auf Server-Ebene hinzufügen
- **Abbrechen:** Ausführung abbrechen

### 3. Ausführung

Nach Bestätigung (oder vertrauensbasierter Umgehung):

1. **Parameteraufbereitung:** Argumente werden gegen das Schema des Werkzeugs validiert
2. **MCP-Aufruf:** Das zugrundeliegende `CallableTool` ruft den Server auf mit:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Ursprünglicher Servertoolname
       args: params,
     },
   ];
   ```

3. **Antwortverarbeitung:** Ergebnisse werden sowohl für den LLM-Kontext als auch für die Benutzeranzeige aufbereitet

### 4. Antwortbehandlung

Das Ausführungsergebnis enthält:

- **`llmContent`:** Rohe Antwortteile für den Kontext des Sprachmodells
- **`returnDisplay`:** Formatierte Ausgabe für die Benutzeranzeige (oft JSON in Markdown-Codeblöcken)

## So interagieren Sie mit Ihrem MCP-Server

### Verwendung des `/mcp`-Befehls

Der `/mcp`-Befehl liefert umfassende Informationen über Ihre MCP-Serverkonfiguration:

```bash
/mcp
```

Dies zeigt:

- **Serverliste:** Alle konfigurierten MCP-Server
- **Verbindungsstatus:** `CONNECTED`, `CONNECTING` oder `DISCONNECTED`
- **Serverdetails:** Konfigurationsübersicht (ohne sensible Daten)
- **Verfügbare Werkzeuge:** Liste der Werkzeuge jedes Servers mit Beschreibungen
- **Erkennungsstatus:** Gesamtstatus des Erkennungsprozesses

### Beispiel `/mcp`-Ausgabe

```
MCP-Server-Status:

📡 pythonTools (CONNECTED)
  Befehl: python -m my_mcp_server --port 8080
  Arbeitsverzeichnis: ./mcp-servers/python
  Timeout: 15000ms
  Werkzeuge: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Befehl: node dist/server.js --verbose
  Fehler: Verbindung abgelehnt

🐳 dockerizedServer (CONNECTED)
  Befehl: docker run -i --rm -e API_KEY my-mcp-server:latest
  Werkzeuge: docker__deploy, docker__status

Erkennungsstatus: ABGESCHLOSSEN
```

### Werkzeugnutzung

Nach der Erkennung stehen MCP-Werkzeuge dem Qwen-Modell wie integrierte Werkzeuge zur Verfügung. Das Modell wird automatisch:

1. **Geeignete Werkzeuge auswählen** basierend auf Ihren Anfragen
2. **Bestätigungsdialoge anzeigen** (sofern der Server nicht als vertrauenswürdig eingestuft ist)
3. **Werkzeuge mit den richtigen Parametern ausführen**
4. **Ergebnisse in einem benutzerfreundlichen Format anzeigen**

## Statusüberwachung und Fehlerbehebung

### Verbindungszustände

Die MCP-Integration verfolgt mehrere Zustände:

#### Server-Status (`MCPServerStatus`)

- **`DISCONNECTED`:** Server ist nicht verbunden oder hat Fehler
- **`CONNECTING`:** Verbindungsaufbau läuft
- **`CONNECTED`:** Server ist verbunden und bereit

#### Erkennungsstatus (`MCPDiscoveryState`)

- **`NOT_STARTED`:** Erkennung wurde noch nicht gestartet
- **`IN_PROGRESS`:** Server werden gerade erkannt
- **`COMPLETED`:** Erkennung abgeschlossen (mit oder ohne Fehler)

### Häufige Probleme und Lösungen

#### Server kann keine Verbindung herstellen

**Symptome:** Server zeigt Status `DISCONNECTED`

**Fehlerbehebung:**

1. **Konfiguration prüfen:** Stellen Sie sicher, dass `command`, `args` und `cwd` korrekt sind
2. **Manuell testen:** Führen Sie den Serverbefehl direkt aus, um sicherzustellen, dass er funktioniert
3. **Abhängigkeiten prüfen:** Stellen Sie sicher, dass alle erforderlichen Pakete installiert sind
4. **Logs prüfen:** Suchen Sie nach Fehlermeldungen in der CLI-Ausgabe
5. **Berechtigungen prüfen:** Stellen Sie sicher, dass die CLI den Serverbefehl ausführen kann
#### Keine Tools gefunden

**Symptome:** Server verbindet, aber keine Tools verfügbar

**Fehlersuche:**

1. **Tool-Registrierung überprüfen:** Stellen Sie sicher, dass Ihr Server tatsächlich Tools registriert
2. **MCP-Protokoll prüfen:** Bestätigen Sie, dass Ihr Server die MCP-Tool-Auflistung korrekt implementiert
3. **Server-Logs prüfen:** Überprüfen Sie die stderr-Ausgabe auf serverseitige Fehler
4. **Tool-Auflistung testen:** Testen Sie manuell den Tool-Erkennungs-Endpunkt Ihres Servers

#### Tools werden nicht ausgeführt

**Symptome:** Tools werden gefunden, schlagen aber während der Ausführung fehl

**Fehlersuche:**

1. **Parameter-Validierung:** Stellen Sie sicher, dass Ihr Tool die erwarteten Parameter akzeptiert
2. **Schema-Kompatibilität:** Überprüfen Sie, ob Ihre Eingabeschemata gültiges JSON Schema sind
3. **Fehlerbehandlung:** Prüfen Sie, ob Ihr Tool unbehandelte Ausnahmen auslöst
4. **Timeout-Probleme:** Erwägen Sie, die `timeout`-Einstellung zu erhöhen

#### Sandbox-Kompatibilität

**Symptome:** MCP-Server schlagen fehl, wenn Sandboxing aktiviert ist

**Lösungen:**

1. **Docker-basierte Server:** Verwenden Sie Docker-Container, die alle Abhängigkeiten enthalten
2. **Pfadzugänglichkeit:** Stellen Sie sicher, dass Server-Ausführungsdateien in der Sandbox verfügbar sind
3. **Netzwerkzugriff:** Konfigurieren Sie die Sandbox, um notwendige Netzwerkverbindungen zu erlauben
4. **Umgebungsvariablen:** Überprüfen Sie, ob erforderliche Umgebungsvariablen durchgereicht werden

### Tipps zur Fehlersuche

1. **Debug-Modus aktivieren:** Führen Sie die CLI mit `--debug` für ausführliche Ausgabe aus
2. **stderr prüfen:** MCP-Server-stderr wird erfasst und protokolliert (INFO-Nachrichten werden gefiltert)
3. **Test-Isolation:** Testen Sie Ihren MCP-Server unabhängig, bevor Sie ihn integrieren
4. **Schrittweiser Aufbau:** Beginnen Sie mit einfachen Tools, bevor Sie komplexe Funktionen hinzufügen
5. **`/mcp` häufig nutzen:** Überwachen Sie den Serverstatus während der Entwicklung

## Wichtige Hinweise

### Sicherheitsaspekte

- **Vertrauenseinstellungen:** Die `trust`-Option umgeht alle Bestätigungsdialoge. Verwenden Sie sie mit Vorsicht und nur für Server, die Sie vollständig kontrollieren
- **Zugriffstoken:** Seien Sie sicherheitsbewusst bei der Konfiguration von Umgebungsvariablen, die API-Schlüssel oder Token enthalten
- **Sandbox-Kompatibilität:** Stellen Sie bei Verwendung von Sandboxing sicher, dass MCP-Server innerhalb der Sandbox-Umgebung verfügbar sind
- **Private Daten:** Die Verwendung von weit gefassten persönlichen Zugriffstoken kann zu Informationslecks zwischen Repositories führen

### Leistung und Ressourcenverwaltung

- **Verbindungspersistenz:** Die CLI hält dauerhafte Verbindungen zu Servern aufrecht, die erfolgreich Tools registrieren
- **Automatische Bereinigung:** Verbindungen zu Servern, die keine Tools bereitstellen, werden automatisch geschlossen
- **Timeout-Verwaltung:** Konfigurieren Sie angemessene Timeouts basierend auf den Antwortcharakteristiken Ihres Servers
- **Ressourcenüberwachung:** MCP-Server laufen als separate Prozesse und verbrauchen Systemressourcen

### Schema-Kompatibilität

- **Schema-Compliance-Modus:** Standardmäßig (`schemaCompliance: "auto"`) werden Tool-Schemata unverändert durchgereicht. Setzen Sie `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` in Ihrer `settings.json`, um Modelle in das strenge OpenAPI 3.0-Format zu konvertieren.
- **OpenAPI 3.0-Transformationen:** Wenn der `openapi_30`-Modus aktiviert ist, übernimmt das System:
  - Nullable-Typen: `["string", "null"]` -> `type: "string", nullable: true`
  - Const-Werte: `const: "foo"` -> `enum: ["foo"]`
  - Exklusive Grenzen: numerisches `exclusiveMinimum` -> boolesche Form mit `minimum`
  - Schlüsselwortentfernung: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Namensbereinigung:** Tool-Namen werden automatisch bereinigt, um API-Anforderungen zu erfüllen
- **Konfliktlösung:** Tool-Namenskonflikte zwischen Servern werden durch automatische Präfixe gelöst

Diese umfassende Integration macht MCP-Server zu einer leistungsstarken Möglichkeit, die Fähigkeiten der CLI zu erweitern, während Sicherheit, Zuverlässigkeit und Benutzerfreundlichkeit erhalten bleiben.

## Rückgabe von Rich Content aus Tools

MCP-Tools sind nicht darauf beschränkt, einfachen Text zurückzugeben. Sie können umfangreiche, mehrteilige Inhalte zurückgeben, einschließlich Text, Bilder, Audio und andere binäre Daten in einer einzigen Tool-Antwort. Dies ermöglicht es Ihnen, leistungsstarke Tools zu erstellen, die dem Modell in einem einzigen Durchlauf vielfältige Informationen bereitstellen können.

Alle vom Tool zurückgegebenen Daten werden verarbeitet und als Kontext für die nächste Generierung an das Modell gesendet, sodass es in der Lage ist, über die bereitgestellten Informationen nachzudenken oder sie zusammenzufassen.

### Wie es funktioniert

Um Rich Content zurückzugeben, muss die Antwort Ihres Tools der MCP-Spezifikation für ein [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) entsprechen. Das `content`-Feld des Ergebnisses sollte ein Array von `ContentBlock`-Objekten sein. Die CLI verarbeitet dieses Array korrekt, trennt Text von Binärdaten und verpackt es für das Modell.

Sie können verschiedene Content-Block-Typen im `content`-Array mischen. Die unterstützten Block-Typen umfassen:

- `text`
- `image`
- `audio`
- `resource` (eingebetteter Inhalt)
- `resource_link`

### Beispiel: Rückgabe von Text und einem Bild

Hier ist ein Beispiel einer gültigen JSON-Antwort eines MCP-Tools, die sowohl eine Textbeschreibung als auch ein Bild zurückgibt:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Hier ist das angeforderte Logo."
    },
    {
      "type": "image",
      "data": "BASE64_ENKODIERTE_BILDDATEN_HIER",
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

1.  Den gesamten Text extrahieren und ihn für das Modell zu einem einzigen `functionResponse`-Teil zusammenfassen.
2.  Die Bilddaten als separaten `inlineData`-Teil präsentieren.
3.  Eine übersichtliche, benutzerfreundliche Zusammenfassung in der CLI bereitstellen, die anzeigt, dass sowohl Text als auch ein Bild empfangen wurden.

Damit können Sie anspruchsvolle Werkzeuge entwickeln, die dem Qwen-Modell einen umfangreichen, multimodalen Kontext bieten können.

## MCP-Prompts als Slash-Befehle

Neben Werkzeugen können MCP-Server vordefinierte Prompts bereitstellen, die innerhalb von Qwen Code als Slash-Befehle ausgeführt werden können. So können Sie Verknüpfungen für häufige oder komplexe Abfragen erstellen, die einfach per Name aufgerufen werden können.

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

Dies kann in der `settings.json` unter `mcpServers` mit folgendem Code eingebunden werden:

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

Sobald ein Prompt entdeckt wurde, können Sie ihn über seinen Namen als Slash-Befehl aufrufen. Die CLI übernimmt automatisch das Parsen der Argumente.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

oder mit Positionsargumenten:

```bash
/poem-writer "Qwen Code" reverent
```

Wenn Sie diesen Befehl ausführen, ruft die CLI die Methode `prompts/get` auf dem MCP-Server mit den angegebenen Argumenten auf. Der Server ist dafür verantwortlich, die Argumente in die Prompt-Vorlage einzusetzen und den endgültigen Prompt-Text zurückzugeben. Die CLI sendet diesen Prompt dann zur Ausführung an das Modell. Dies bietet eine bequeme Möglichkeit, häufige Arbeitsabläufe zu automatisieren und gemeinsam zu nutzen.

## Verwalten von MCP-Servern mit `qwen mcp`

Sie können MCP-Server zwar jederzeit durch manuelles Bearbeiten Ihrer `settings.json` konfigurieren, aber die CLI bietet eine Reihe praktischer Befehle, um Ihre Serverkonfigurationen programmatisch zu verwalten. Diese Befehle vereinfachen das Hinzufügen, Auflisten und Entfernen von MCP-Servern, ohne dass Sie direkt JSON-Dateien bearbeiten müssen.

### Hinzufügen eines Servers (`qwen mcp add`)

Der Befehl `add` konfiguriert einen neuen MCP-Server in Ihrer `settings.json`. Je nach Bereich (`-s, --scope`) wird er entweder zur Benutzerkonfiguration `~/.qwen/settings.json` oder zur Projektkonfiguration `.qwen/settings.json` hinzugefügt.

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
- `-e, --env`: Umgebungsvariablen setzen (z. B. -e KEY=value).
- `-H, --header`: HTTP-Header für SSE- und HTTP-Transports setzen (z. B. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Verbindungstimeout in Millisekunden setzen.
- `--trust`: Dem Server vertrauen (alle Bestätigungsdialoge für Tool-Aufrufe umgehen).
- `--description`: Beschreibung für den Server setzen.
- `--include-tools`: Eine durch Kommas getrennte Liste der einzuschließenden Tools.
- `--exclude-tools`: Eine durch Kommas getrennte Liste der auszuschließenden Tools.
- `--oauth-client-id`: OAuth-Client-ID für die MCP-Server-Authentifizierung.
- `--oauth-client-secret`: OAuth-Client-Secret für die MCP-Server-Authentifizierung.
- `--oauth-redirect-uri`: OAuth-Weiterleitungs-URI (z. B. `https://your-server.com/oauth/callback`). Standardmäßig `http://localhost:7777/oauth/callback` für lokale Einrichtungen. **Wichtig für entfernte Bereitstellungen**: Wenn Sie Qwen Code auf entfernten/Cloud-Servern ausführen, setzen Sie dies auf eine öffentlich zugängliche URL.
- `--oauth-authorization-url`: OAuth-Autorisierungs-URL.
- `--oauth-token-url`: OAuth-Token-URL.
- `--oauth-scopes`: OAuth-Bereiche (durch Kommas getrennt).

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

Dieser Transport ist für Server gedacht, die den streamable HTTP Transport verwenden.

```bash
# Grundlegende Syntax
qwen mcp add --transport http <name> <url>

# Beispiel: Hinzufügen eines HTTP-Servers
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Beispiel: Hinzufügen eines HTTP-Servers mit einem Authentifizierungsheader
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Hinzufügen eines SSE-Servers

Dieser Transport ist für Server gedacht, die Server-Sent Events (SSE) verwenden.

```bash
# Grundlegende Syntax
qwen mcp add --transport sse <name> <url>

# Beispiel: Hinzufügen eines SSE-Servers
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Beispiel: Hinzufügen eines SSE-Servers mit einem Authentifizierungsheader
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Beispiel: Hinzufügen eines OAuth-fähigen SSE-Servers
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### Verwalten von Servern (`/mcp`)

Um alle aktuell konfigurierten MCP-Server anzuzeigen und zu verwalten, öffnen Sie den
`/mcp`-Dialog innerhalb einer interaktiven Qwen Code-Sitzung. Dieser Dialog ermöglicht Ihnen:

- Alle MCP-Server mit ihrem Verbindungsstatus anzuzeigen
- Server zu aktivieren/deaktivieren
- Die Verbindung zu getrennten Servern wiederherzustellen
- Die von jedem Server bereitgestellten Tools und Prompts anzuzeigen
- Server-Logs anzuzeigen

**Befehl:**

```bash
qwen
```

Geben Sie dann Folgendes ein:

```text
/mcp
```

Der Verwaltungsdialog bietet eine visuelle Oberfläche, die den Namen jedes Servers, Konfigurationsdetails, Verbindungsstatus sowie verfügbare Tools und Prompts anzeigt.

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

Dieser sucht den Eintrag "my-server" im `mcpServers`-Objekt in der entsprechenden `settings.json`-Datei (basierend auf dem Gültigkeitsbereich `-s, --scope`) und löscht ihn.
