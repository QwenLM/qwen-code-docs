# MCP-Server mit Qwen Code

Dieses Dokument bietet eine Anleitung zur Konfiguration und Verwendung von Model Context Protocol (MCP)-Servern mit Qwen Code.

## Was ist ein MCP-Server?

Ein MCP-Server ist eine Anwendung, die Tools und Ressourcen über das Model Context Protocol (MCP) für die CLI bereitstellt und es ihr so ermöglicht, mit externen Systemen und Datenquellen zu interagieren. MCP-Server fungieren als Brücke zwischen dem Modell und Ihrer lokalen Umgebung oder anderen Diensten wie APIs.

Ein MCP-Server ermöglicht es der CLI:

- **Tools zu entdecken:** Verfügbare Tools, deren Beschreibungen und Parameter über standardisierte Schemadefinitionen aufzulisten.
- **Tools auszuführen:** Bestimmte Tools mit definierten Argumenten aufzurufen und strukturierte Antworten zu erhalten.
- **Auf Ressourcen zuzugreifen:** Daten aus bestimmten Ressourcen zu lesen (obwohl sich die CLI hauptsächlich auf die Tool-Ausführung konzentriert).

Mit einem MCP-Server können Sie die Fähigkeiten der CLI erweitern, um Aktionen auszuführen, die über die integrierten Funktionen hinausgehen, beispielsweise Interaktionen mit Datenbanken, APIs, benutzerdefinierten Skripten oder spezialisierten Workflows.

## Core-Integrationsarchitektur

Qwen Code integriert sich über ein ausgeklügeltes Entdeckungs- und Ausführungssystem in MCP-Server, das in das Core-Paket integriert ist (`packages/core/src/tools/`):

### Discovery-Layer (`mcp-client.ts`)

Der Discovery-Prozess wird von `discoverMcpTools()` orchestriert, welches:

1. **Durchläuft konfigurierte Server** aus Ihrer `settings.json` `mcpServers`-Konfiguration
2. **Stellt Verbindungen her** unter Verwendung geeigneter Transportmechanismen (Stdio, SSE oder Streamable HTTP)
3. **Ruft Tool-Definitionen** von jedem Server über das MCP-Protokoll ab
4. **Säubert und validiert** Tool-Schemas auf Kompatibilität mit der Qwen API
5. **Registriert Tools** im globalen Tool-Registry mit Konfliktlösung

### Ausführungsschicht (`mcp-tool.ts`)

Jedes gefundene MCP-Tool wird in einer `DiscoveredMCPTool`-Instanz gekapselt, die:

- **Bestätigungslogik** basierend auf Server-Vertrauenseinstellungen und Benutzervorgaben handhabt
- **Tool-Ausführung** verwaltet, indem sie den MCP-Server mit den richtigen Parametern aufruft
- **Antworten verarbeitet** sowohl für den LLM-Kontext als auch für die Benutzeranzeige
- **Verbindungsstatus** aufrechterhält und Timeouts behandelt

### Transportmechanismen

Die CLI unterstützt drei MCP-Transporttypen:

- **Stdio-Transport:** Erzeugt einen Subprozess und kommuniziert über stdin/stdout
- **SSE-Transport:** Stellt eine Verbindung zu Server-Sent Events Endpunkten her
- **Streamfähiger HTTP-Transport:** Verwendet HTTP-Streaming für die Kommunikation

## So richten Sie Ihren MCP-Server ein

Qwen Code verwendet die `mcpServers`-Konfiguration in Ihrer `settings.json`-Datei, um MCP-Server zu finden und eine Verbindung dazu herzustellen. Diese Konfiguration unterstützt mehrere Server mit unterschiedlichen Transportmechanismen.

### Konfigurieren des MCP-Servers in settings.json

Sie können MCP-Server in Ihrer `settings.json`-Datei auf zwei Hauptweisen konfigurieren: über das oberste `mcpServers`-Objekt für spezifische Serverdefinitionen und über das `mcp`-Objekt für globale Einstellungen, die die Serverentdeckung und -ausführung steuern.

#### Globale MCP-Einstellungen (`mcp`)

Das `mcp`-Objekt in Ihrer `settings.json` ermöglicht es Ihnen, globale Regeln für alle MCP-Server zu definieren.

- **`mcp.serverCommand`** (string): Ein globaler Befehl zum Starten eines MCP-Servers.
- **`mcp.allowed`** (Array von Strings): Eine Liste von MCP-Servernamen, die erlaubt sind. Wenn dies gesetzt ist, werden nur Server aus dieser Liste (die mit den Schlüsseln im `mcpServers`-Objekt übereinstimmen) verbunden.
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

#### Server-spezifische Konfiguration (`mcpServers`)

Das `mcpServers`-Objekt ist der Ort, an dem Sie jeden einzelnen MCP-Server definieren, zu dem die CLI eine Verbindung herstellen soll.

### Konfigurationsstruktur

Fügen Sie ein `mcpServers`-Objekt zu Ihrer `settings.json`-Datei hinzu:

```json
{ ...Datei enthält andere Konfigurationsobjekte
  "mcpServers": {
    "serverName": {
      "command": "pfad/zum/server",
      "args": ["--arg1", "wert1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-verzeichnis",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

### Konfigurationseigenschaften

Jede Serverkonfiguration unterstützt die folgenden Eigenschaften:

#### Erforderlich (eine der folgenden)

- **`command`** (string): Pfad zur ausführbaren Datei für Stdio-Transport
- **`url`** (string): SSE-Endpunkt-URL (z.B. `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): HTTP-Streaming-Endpunkt-URL

#### Optional

- **`args`** (string[]): Befehlszeilenargumente für den Stdio-Transport
- **`headers`** (object): Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`
- **`env`** (object): Umgebungsvariablen für den Server-Prozess. Werte können mithilfe der Syntax `$VAR_NAME` oder `${VAR_NAME}` auf Umgebungsvariablen verweisen
- **`cwd`** (string): Arbeitsverzeichnis für den Stdio-Transport
- **`timeout`** (number): Zeitüberschreitung für Anfragen in Millisekunden (Standard: 600.000 ms = 10 Minuten)
- **`trust`** (boolean): Wenn `true`, werden alle Bestätigungen für Tool-Aufrufe für diesen Server umgangen (Standard: `false`)
- **`includeTools`** (string[]): Liste von Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgeführten Tools von diesem Server verfügbar (Whitelist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.
- **`excludeTools`** (string[]): Liste von Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Tools, die hier aufgeführt sind, sind für das Modell nicht verfügbar, selbst wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` - wenn ein Tool in beiden Listen enthalten ist, wird es ausgeschlossen.
- **`targetAudience`** (string): Die OAuth-Client-ID, die auf der IAP-geschützten Anwendung erlaubt ist, auf die Sie zugreifen möchten. Wird zusammen mit `authProviderType: 'service_account_impersonation'` verwendet.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, der imitier werden soll. Wird zusammen mit `authProviderType: 'service_account_impersonation'` verwendet.

### OAuth-Unterstützung für Remote-MCP-Server

Qwen Code unterstützt die OAuth 2.0-Authentifizierung für Remote-MCP-Server unter Verwendung von SSE- oder HTTP-Transports. Dies ermöglicht sicheren Zugriff auf MCP-Server, die Authentifizierung erfordern.

#### Automatische OAuth-Erkennung

Für Server, die OAuth-Erkennung unterstützen, können Sie die OAuth-Konfiguration weglassen und die CLI die Erkennung automatisch durchführen lassen:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

Die CLI führt automatisch folgende Schritte durch:

- Erkennung, wenn ein Server OAuth-Authentifizierung erfordert (401-Antworten)
- Erkennung von OAuth-Endpunkten aus Server-Metadaten
- Durchführung der dynamischen Client-Registrierung, falls unterstützt
- Behandlung des OAuth-Flows und Token-Verwaltung

#### Authentifizierungsablauf

Beim Verbinden mit einem OAuth-fähigen Server:

1. **Erster Verbindungsversuch** schlägt mit 401 Unauthorized fehl
2. **OAuth-Discovery** findet Autorisierungs- und Token-Endpunkte
3. **Browser öffnet sich** für Benutzerauthentifizierung (erfordert lokalen Browser-Zugriff)
4. **Autorisierungscode** wird gegen Zugriffstoken ausgetauscht
5. **Token werden sicher** für zukünftige Verwendung gespeichert
6. **Verbindungsversuch erneut** erfolgreich mit gültigen Token

#### Browser-Weiterleitungsanforderungen

**Wichtig:** OAuth-Authentifizierung erfordert, dass Ihre lokale Maschine:

- Einen Webbrowser für die Authentifizierung öffnen kann
- Weiterleitungen auf `http://localhost:7777/oauth/callback` empfangen kann

Diese Funktion funktioniert nicht in:

- Headless-Umgebungen ohne Browser-Zugriff
- Remote-SSH-Sitzungen ohne X11-Weiterleitung
- Container-Umgebungen ohne Browser-Unterstützung

#### OAuth-Authentifizierung verwalten

Verwenden Sie den Befehl `/mcp auth`, um die OAuth-Authentifizierung zu verwalten:

```bash

# Server auflisten, die Authentifizierung erfordern
/mcp auth
```

# Authentifizierung mit einem bestimmten Server
/mcp auth serverName

# Neu authentifizieren, wenn Tokens ablaufen
/mcp auth serverName
```

#### OAuth-Konfigurationseigenschaften

- **`enabled`** (boolean): OAuth für diesen Server aktivieren
- **`clientId`** (string): OAuth-Client-Identifikator (optional bei dynamischer Registrierung)
- **`clientSecret`** (string): OAuth-Client-Geheimnis (optional für öffentliche Clients)
- **`authorizationUrl`** (string): OAuth-Autorisierungsendpunkt (wird automatisch ermittelt, wenn weggelassen)
- **`tokenUrl`** (string): OAuth-Token-Endpunkt (wird automatisch ermittelt, wenn weggelassen)
- **`scopes`** (string[]): Erforderliche OAuth-Bereiche
- **`redirectUri`** (string): Benutzerdefinierte Weiterleitungs-URI (Standardwert ist `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (string): Abfrageparametername für Tokens in SSE-URLs
- **`audiences`** (string[]): Zielgruppen, für die das Token gültig ist

#### Token-Verwaltung

OAuth-Token werden automatisch:

- **Sicher gespeichert** in `~/.qwen/mcp-oauth-tokens.json`
- **Aktualisiert**, wenn sie abgelaufen sind (wenn Refresh-Tokens verfügbar sind)
- **Überprüft** vor jedem Verbindungsversuch
- **Bereinigt**, wenn sie ungültig oder abgelaufen sind

#### Authentifizierungsanbieter-Typ

Du kannst den Typ des Authentifizierungsanbieters mithilfe der Eigenschaft `authProviderType` angeben:

- **`authProviderType`** (string): Gibt den Authentifizierungsanbieter an. Kann einer der folgenden Werte sein:
  - **`dynamic_discovery`** (Standard): Die CLI wird die OAuth-Konfiguration automatisch vom Server entdecken.
  - **`google_credentials`**: Die CLI wird die Google Application Default Credentials (ADC) verwenden, um sich beim Server zu authentifizieren. Bei Verwendung dieses Anbieters musst du die erforderlichen Bereiche (scopes) angeben.
  - **`service_account_impersonation`**: Die CLI wird einen Google Cloud Service Account imitieren, um sich beim Server zu authentifizieren. Dies ist nützlich für den Zugriff auf IAP-geschützte Dienste (dies wurde speziell für Cloud Run-Dienste entwickelt).

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

#### Service Account Impersonation

Um sich mit einem Server über Service Account Impersonation zu authentifizieren, müssen Sie `authProviderType` auf `service_account_impersonation` setzen und die folgenden Eigenschaften angeben:

- **`targetAudience`** (string): Die OAuth-Client-ID, die auf der IAP-geschützten Anwendung erlaubt ist, auf die Sie zugreifen möchten.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud Service Accounts, dessen Identität Sie annehmen möchten.

Die CLI verwendet Ihre lokalen Application Default Credentials (ADC), um ein OIDC-ID-Token für das angegebene Service-Konto und den Ziel-Audience zu generieren. Dieses Token wird anschließend zur Authentifizierung mit dem MCP-Server verwendet.

#### Einrichtungsanweisungen

1. **[Erstellen](https://cloud.google.com/iap/docs/oauth-client-creation) oder Verwenden einer vorhandenen OAuth 2.0 Client-ID.** Um eine vorhandene OAuth 2.0 Client-ID zu verwenden, folgen Sie den Schritten in [So teilen Sie OAuth-Clients](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Fügen Sie die OAuth-ID zur Zulassungsliste für [programmatischen Zugriff](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) für die Anwendung hinzu.** Da Cloud Run noch nicht als unterstützter Ressourcentyp in gcloud iap verfügbar ist, müssen Sie die Client-ID im Projekt zulassen.
3. **Erstellen Sie ein Service-Konto.** [Dokumentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Cloud Console Link](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Fügen Sie sowohl das Service-Konto als auch Benutzer zur IAP-Richtlinie** im Tab "Security" des Cloud Run Service selbst oder über gcloud hinzu.
5. **Gewähren Sie allen Benutzern und Gruppen**, die auf den MCP-Server zugreifen werden, die erforderlichen Berechtigungen zum [Imitieren des Service-Kontos](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (d.h. `roles/iam.serviceAccountTokenCreator`).
6. **[Aktivieren](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) Sie die IAM Credentials API** für Ihr Projekt.

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

### SSE MCP Server mit SA-Identitätswechsel

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

## Detaillierter Einblick in den Discovery-Prozess

Wenn Qwen Code startet, führt es die MCP-Server-Discovery durch den folgenden detaillierten Prozess durch:

### 1. Server-Iteration und Verbindung

Für jeden konfigurierten Server in `mcpServers`:

1. **Statusverfolgung beginnt:** Der Serverstatus wird auf `CONNECTING` gesetzt
2. **Transportauswahl:** Basierend auf Konfigurationseigenschaften:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Verbindungsherstellung:** Der MCP-Client versucht, sich mit dem konfigurierten Timeout zu verbinden
4. **Fehlerbehandlung:** Verbindungsfehler werden protokolliert und der Serverstatus wird auf `DISCONNECTED` gesetzt

### 2. Tool Discovery

Nach erfolgreichem Verbindungsaufbau:

1. **Tool-Auflistung:** Der Client ruft den Tool-Auflistungs-Endpunkt des MCP-Servers auf
2. **Schema-Validierung:** Die Funktionsdeklaration jedes Tools wird validiert
3. **Tool-Filterung:** Tools werden basierend auf der Konfiguration `includeTools` und `excludeTools` gefiltert
4. **Namensbereinigung:** Tool-Namen werden bereinigt, um den Anforderungen der Qwen API zu entsprechen:
   - Ungültige Zeichen (nicht alphanumerisch, Unterstrich, Punkt, Bindestrich) werden durch Unterstriche ersetzt
   - Namen, die länger als 63 Zeichen sind, werden mit mittlerem Ersatz (`___`) gekürzt

### 3. Konfliktlösung

Wenn mehrere Server Tools mit demselben Namen bereitstellen:

1. **Erste Registrierung gewinnt:** Der erste Server, der einen Tool-Namen registriert, erhält den unpräfixierten Namen
2. **Automatische Präfixierung:** Nachfolgende Server erhalten präfixierte Namen: `serverName__toolName`
3. **Registry-Verfolgung:** Die Tool-Registry verwaltet Abbildungen zwischen Server-Namen und deren Tools

### 4. Schema-Verarbeitung

Tool-Parameterschemas werden zur API-Kompatibilität bereinigt:

- **`$schema`-Eigenschaften** werden entfernt
- **`additionalProperties`** werden entfernt
- **`anyOf` mit `default`** verlieren ihre Standardwerte (Vertex AI-Kompatibilität)
- **Rekursive Verarbeitung** wird auf verschachtelte Schemas angewendet

### 5. Verbindungsverwaltung

Nach der Erkennung:

- **Persistente Verbindungen:** Server, die erfolgreich Tools registrieren, behalten ihre Verbindungen aufrecht
- **Bereinigung:** Server, die keine verwendbaren Tools bereitstellen, haben ihre Verbindungen geschlossen
- **Statusaktualisierungen:** Endgültige Server-Status werden auf `CONNECTED` oder `DISCONNECTED` gesetzt

## Tool-Ausführungsablauf

Wenn das Modell entscheidet, ein MCP-Tool zu verwenden, tritt der folgende Ausführungsablauf auf:

### 1. Tool-Aufruf

Das Modell generiert einen `FunctionCall` mit:

- **Tool-Name:** Der registrierte Name (möglicherweise mit Präfix)
- **Argumente:** JSON-Objekt, das dem Parameterschema des Tools entspricht

### 2. Bestätigungsprozess

Jedes `DiscoveredMCPTool` implementiert eine ausgefeilte Bestätigungslogik:

#### Vertrauensbasierte Umgehung

```typescript
if (this.trust) {
  return false; // Keine Bestätigung erforderlich
}
```

#### Dynamisches Whitelisting

Das System verwaltet interne Whitelists für:

- **Server-Ebene:** `serverName` → Alle Tools von diesem Server sind vertrauenswürdig
- **Tool-Ebene:** `serverName.toolName` → Dieses spezifische Tool ist vertrauenswürdig

#### Behandlung der Benutzerwahl

Wenn eine Bestätigung erforderlich ist, kann der Benutzer wählen zwischen:

- **Einmal ausführen:** Nur dieses Mal ausführen
- **Dieses Tool immer erlauben:** Zur Tool-Whitelist hinzufügen
- **Diesen Server immer erlauben:** Zur Server-Whitelist hinzufügen
- **Abbrechen:** Ausführung abbrechen

### 3. Ausführung

Nach Bestätigung (oder Trust-Bypass):

1. **Parameter-Vorbereitung:** Argumente werden anhand des Schemas des Tools validiert
2. **MCP-Aufruf:** Das zugrunde liegende `CallableTool` ruft den Server auf mit:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Ursprünglicher Server-Tool-Name
       args: params,
     },
   ];
   ```

3. **Antwortverarbeitung:** Ergebnisse werden sowohl für den LLM-Kontext als auch für die Benutzeranzeige formatiert

### 4. Antwortbehandlung

Das Ausführungsergebnis enthält:

- **`llmContent`:** Rohdaten-Antwortteile für den Kontext des Sprachmodells
- **`returnDisplay`:** Formatierter Output für die Benutzeranzeige (häufig JSON in Markdown-Codeblöcken)

## Wie Sie mit Ihrem MCP-Server interagieren

### Verwendung des `/mcp` Befehls

Der Befehl `/mcp` liefert umfassende Informationen zu deinem MCP-Server-Setup:

```bash
/mcp
```

Dies zeigt folgende Informationen an:

- **Serverliste:** Alle konfigurierten MCP-Server
- **Verbindungsstatus:** `VERBUNDEN`, `VERBINDET` oder `GETRENNT`
- **Serverdetails:** Konfigurationsübersicht (ohne sensible Daten)
- **Verfügbare Tools:** Liste der Tools von jedem Server mit Beschreibungen
- **Discovery-Status:** Gesamtstatus des Discovery-Prozesses

### Beispiel für `/mcp` Ausgabe

```
MCP Server Status:

📡 pythonTools (VERBUNDEN)
  Befehl: python -m my_mcp_server --port 8080
  Arbeitsverzeichnis: ./mcp-servers/python
  Timeout: 15000ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (GETRENNT)
  Befehl: node dist/server.js --verbose
  Fehler: Verbindung abgelehnt

🐳 dockerizedServer (VERBUNDEN)
  Befehl: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Discovery-Status: ABGESCHLOSSEN
```

### Tool-Nutzung

Einmal entdeckte MCP-Tools stehen dem Qwen-Modell wie eingebaute Tools zur Verfügung. Das Modell wird automatisch:

1. **Passende Tools auswählen** basierend auf Ihren Anfragen
2. **Bestätigungsdialoge anzeigen** (außer wenn der Server vertrauenswürdig ist)
3. **Tools mit richtigen Parametern ausführen**
4. **Ergebnisse in einem benutzerfreundlichen Format anzeigen**

## Statusüberwachung und Problembehandlung

### Verbindungsstatus

Die MCP-Integration verfolgt mehrere Zustände:

#### Serverstatus (`MCPServerStatus`)

- **`DISCONNECTED`:** Server ist nicht verbunden oder hat Fehler
- **`CONNECTING`:** Verbindungsversuch läuft
- **`CONNECTED`:** Server ist verbunden und bereit

#### Entdeckungsstatus (`MCPDiscoveryState`)

- **`NOT_STARTED`:** Entdeckung hat noch nicht begonnen
- **`IN_PROGRESS`:** Server werden aktuell entdeckt
- **`COMPLETED`:** Entdeckung abgeschlossen (mit oder ohne Fehler)

### Häufige Probleme und Lösungen

#### Server verbindet nicht

**Symptome:** Server zeigt Status `DISCONNECTED` an

**Fehlerbehebung:**

1. **Konfiguration prüfen:** Stellen Sie sicher, dass `command`, `args` und `cwd` korrekt sind
2. **Manuell testen:** Führen Sie den Serverbefehl direkt aus, um sicherzustellen, dass er funktioniert
3. **Abhängigkeiten prüfen:** Stellen Sie sicher, dass alle erforderlichen Pakete installiert sind
4. **Protokolle überprüfen:** Suchen Sie nach Fehlermeldungen in der CLI-Ausgabe
5. **Berechtigungen überprüfen:** Stellen Sie sicher, dass die CLI den Serverbefehl ausführen kann

#### Keine Tools gefunden

**Symptome:** Server verbindet, aber es sind keine Tools verfügbar

**Fehlerbehebung:**

1. **Tool-Registrierung überprüfen:** Stellen Sie sicher, dass Ihr Server tatsächlich Tools registriert
2. **MCP-Protokoll prüfen:** Bestätigen Sie, dass Ihr Server die MCP-Tool-Auflistung korrekt implementiert
3. **Server-Protokolle überprüfen:** Prüfen Sie die stderr-Ausgabe auf serverseitige Fehler
4. **Tool-Auflistung testen:** Testen Sie manuell den Tool-Discovery-Endpunkt Ihres Servers

#### Tools werden nicht ausgeführt

**Symptome:** Tools werden erkannt, scheitern aber bei der Ausführung

**Fehlerbehebung:**

1. **Parameter-Validierung:** Stellen Sie sicher, dass Ihr Tool die erwarteten Parameter akzeptiert
2. **Schema-Kompatibilität:** Überprüfen Sie, ob Ihre Eingabeschemas gültiges JSON Schema sind
3. **Fehlerbehandlung:** Prüfen Sie, ob Ihr Tool unbehandelte Ausnahmen wirft
4. **Timeout-Probleme:** Erwägen Sie, die `timeout`-Einstellung zu erhöhen

#### Sandbox-Kompatibilität

**Symptome:** MCP-Server scheitern, wenn Sandboxing aktiviert ist

**Lösungen:**

1. **Docker-basierte Server:** Verwenden Sie Docker-Container, die alle Abhängigkeiten enthalten
2. **Pfad-Zugänglichkeit:** Stellen Sie sicher, dass Server-Executables in der Sandbox verfügbar sind
3. **Netzwerkzugriff:** Konfigurieren Sie die Sandbox, um notwendige Netzwerkverbindungen zu erlauben
4. **Umgebungsvariablen:** Stellen Sie sicher, dass erforderliche Umgebungsvariablen durchgereicht werden

### Debugging-Tipps

1. **Debug-Modus aktivieren:** Führen Sie die CLI mit `--debug` aus, um ausführliche Ausgaben zu erhalten
2. **stderr prüfen:** Der stderr des MCP-Servers wird erfasst und protokolliert (INFO-Nachrichten werden gefiltert)
3. **Testisolation:** Testen Sie Ihren MCP-Server unabhängig, bevor Sie ihn integrieren
4. **Schrittweise Einrichtung:** Beginnen Sie mit einfachen Tools, bevor Sie komplexe Funktionalitäten hinzufügen
5. **Häufig `/mcp` verwenden:** Überwachen Sie den Serverstatus während der Entwicklung

## Wichtige Hinweise

### Sicherheitsaspekte

- **Vertrauenseinstellungen:** Die Option `trust` umgeht alle Bestätigungsdialoge. Verwenden Sie diese vorsichtig und nur für Server, die Sie vollständig kontrollieren
- **Zugriffstoken:** Seien Sie sich der Sicherheitsaspekte bewusst, wenn Sie Umgebungsvariablen mit API-Schlüsseln oder Tokens konfigurieren
- **Sandbox-Kompatibilität:** Stellen Sie bei Verwendung von Sandboxing sicher, dass MCP-Server innerhalb der Sandbox-Umgebung verfügbar sind
- **Private Daten:** Die Verwendung von breit angelegten persönlichen Zugriffstoken kann zu Informationslecks zwischen Repositories führen

### Leistung und Ressourcenmanagement

- **Verbindungspersistenz:** Die CLI hält persistente Verbindungen zu Servern aufrecht, die erfolgreich Tools registrieren
- **Automatische Bereinigung:** Verbindungen zu Servern, die keine Tools bereitstellen, werden automatisch geschlossen
- **Timeout-Management:** Konfigurieren Sie geeignete Timeouts basierend auf den Antwortverhalten Ihres Servers
- **Ressourcenüberwachung:** MCP-Server laufen als separate Prozesse und verbrauchen Systemressourcen

### Schema-Kompatibilität

- **Schema-Konformitätsmodus:** Standardmäßig (`schemaCompliance: "auto"`) werden Tool-Schemas unverändert durchgereicht. Setzen Sie `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` in Ihrer `settings.json`, um Modelle in das strikte OpenAPI 3.0-Format zu konvertieren.
- **OpenAPI 3.0-Transformationen:** Wenn der `openapi_30`-Modus aktiviert ist, behandelt das System:
  - Nullable Typen: `["string", "null"]` -> `type: "string", nullable: true`
  - Konstante Werte: `const: "foo"` -> `enum: ["foo"]`
  - Exklusive Grenzwerte: numerisches `exclusiveMinimum` -> boolesche Form mit `minimum`
  - Entfernung von Schlüsselwörtern: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Namensbereinigung:** Tool-Namen werden automatisch bereinigt, um den API-Anforderungen zu entsprechen
- **Konfliktlösung:** Tool-Namenkonflikte zwischen Servern werden durch automatisches Präfixieren gelöst

Diese umfassende Integration macht MCP-Server zu einer leistungsstarken Möglichkeit, die Fähigkeiten der CLI zu erweitern, während Sicherheit, Zuverlässigkeit und Benutzerfreundlichkeit erhalten bleiben.

## Rückgabe von Rich Content aus Tools

MCP-Tools sind nicht auf die Rückgabe von einfachem Text beschränkt. Sie können Rich-Content mit mehreren Teilen zurückgeben, einschließlich Text, Bilder, Audio und andere Binärdaten in einer einzigen Tool-Antwort. Dies ermöglicht es Ihnen, leistungsstarke Tools zu erstellen, die in einem einzigen Durchgang diverse Informationen an das Modell liefern können.

Alle vom Tool zurückgegebenen Daten werden verarbeitet und als Kontext für die nächste Generierung an das Modell gesendet, wodurch es in der Lage ist, über die bereitgestellten Informationen zu schlussfolgern oder diese zusammenzufassen.

### Funktionsweise

Um Rich Content zurückzugeben, muss die Antwort Ihres Tools der MCP-Spezifikation für ein [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) entsprechen. Das `content`-Feld des Ergebnisses sollte ein Array von `ContentBlock`-Objekten sein. Die CLI verarbeitet dieses Array korrekt, trennt Text von Binärdaten und verpackt es für das Modell.

Sie können verschiedene Content-Block-Typen im `content`-Array mischen und kombinieren. Die unterstützten Blocktypen umfassen:

- `text`
- `image`
- `audio`
- `resource` (eingebetteter Inhalt)
- `resource_link`

### Beispiel: Rückgabe von Text und einem Bild

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
      "data": "BASE64_KODIERTE_BILDDATEN_HIER",
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

1.  Den gesamten Text extrahieren und zu einem einzigen `functionResponse`-Teil für das Modell kombinieren.
2.  Die Bilddaten als separaten `inlineData`-Teil darstellen.
3.  Eine klare, benutzerfreundliche Zusammenfassung in der CLI bereitstellen, die angibt, dass sowohl Text als auch ein Bild empfangen wurden.

Dies ermöglicht es Ihnen, ausgefeilte Tools zu erstellen, die dem Qwen-Modell reichhaltigen, multimodalen Kontext bereitstellen können.

## MCP-Prompts als Slash-Befehle

Neben Tools können MCP-Server vordefinierte Prompts bereitstellen, die als Slash-Befehle innerhalb von Qwen Code ausgeführt werden können. Dies ermöglicht es Ihnen, Verknüpfungen für häufige oder komplexe Abfragen zu erstellen, die einfach per Namen aufgerufen werden können.

### Definieren von Prompts auf dem Server

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

### Prompts aufrufen

Sobald ein Prompt gefunden wurde, können Sie ihn über seinen Namen als Slash-Befehl aufrufen. Die CLI übernimmt automatisch das Parsen der Argumente.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

oder unter Verwendung von Positionsargumenten:

```bash
/poem-writer "Qwen Code" reverent
```

Wenn Sie diesen Befehl ausführen, führt die CLI die Methode `prompts/get` auf dem MCP-Server mit den bereitgestellten Argumenten aus. Der Server ist dafür verantwortlich, die Argumente in die Prompt-Vorlage einzusetzen und den endgültigen Prompt-Text zurückzugeben. Die CLI sendet diesen Prompt anschließend zur Ausführung an das Modell. Auf diese Weise lässt sich eine bequeme Automatisierung und gemeinsame Nutzung üblicher Workflows realisieren.

## MCP-Server mit `qwen mcp` verwalten

Während Sie MCP-Server immer durch manuelle Bearbeitung Ihrer `settings.json`-Datei konfigurieren können, stellt die CLI einen praktischen Satz von Befehlen bereit, um Ihre Serverkonfigurationen programmgesteuert zu verwalten. Diese Befehle vereinfachen den Prozess des Hinzufügens, Auflistens und Entfernens von MCP-Servern, ohne JSON-Dateien direkt bearbeiten zu müssen.

### Einen Server hinzufügen (`qwen mcp add`)

Der Befehl `add` konfiguriert einen neuen MCP-Server in Ihrer `settings.json`. Basierend auf dem Gültigkeitsbereich (`-s, --scope`) wird er entweder zur Benutzerkonfiguration `~/.qwen/settings.json` oder zur Projekt-Konfigurationsdatei `.qwen/settings.json` hinzugefügt.

**Befehl:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: Ein eindeutiger Name für den Server.
- `<commandOrUrl>`: Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`).
- `[args...]`: Optionale Argumente für einen `stdio`-Befehl.

**Optionen (Flags):**

- `-s, --scope`: Konfigurationsbereich (Benutzer oder Projekt). [Standard: "project"]
- `-t, --transport`: Transporttyp (stdio, sse, http). [Standard: "stdio"]
- `-e, --env`: Umgebungsvariablen festlegen (z.B. -e KEY=value).
- `-H, --header`: HTTP-Header für SSE- und HTTP-Transports festlegen (z.B. -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123").
- `--timeout`: Verbindungs-Timeout in Millisekunden festlegen.
- `--trust`: Dem Server vertrauen (alle Bestätigungsabfragen für Tool-Aufrufe umgehen).
- `--description`: Beschreibung für den Server festlegen.
- `--include-tools`: Eine durch Kommas getrennte Liste von einzuschließenden Tools.
- `--exclude-tools`: Eine durch Kommas getrennte Liste von auszuschließenden Tools.

#### Hinzufügen eines stdio-Servers

Dies ist der Standardtransport für das Ausführen lokaler Server.

```bash

# Grundlegende Syntax
qwen mcp add <name> <befehl> [args...]

# Beispiel: Hinzufügen eines lokalen Servers
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Beispiel: Hinzufügen eines lokalen Python-Servers
qwen mcp add python-server python server.py --port 8080
```

#### Hinzufügen eines HTTP-Servers

Dieser Transport ist für Server gedacht, die den streambaren HTTP-Transport verwenden.

```bash

# Grundlegende Syntax
qwen mcp add --transport http <name> <url>

# Beispiel: Hinzufügen eines HTTP-Servers
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Beispiel: Hinzufügen eines HTTP-Servers mit Authentifizierungs-Header
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Hinzufügen eines SSE-Servers

Dieser Transport ist für Server gedacht, die Server-Sent Events (SSE) verwenden.

```bash

# Grundlegende Syntax
qwen mcp add --transport sse <name> <url>
```

# Beispiel: Hinzufügen eines SSE-Servers
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Beispiel: Hinzufügen eines SSE-Servers mit Authentifizierungs-Header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Server auflisten (`qwen mcp list`)

Um alle derzeit konfigurierten MCP-Server anzuzeigen, verwenden Sie den `list`-Befehl. Er zeigt den Namen jedes Servers, Konfigurationsdetails und den Verbindungsstatus an.

**Befehl:**

```bash
qwen mcp list
```

**Beispielausgabe:**

```sh
✓ stdio-server: command: python3 server.py (stdio) - Verbunden
✓ http-server: https://api.example.com/mcp (http) - Verbunden
✗ sse-server: https://api.example.com/sse (sse) - Getrennt
```

### Einen Server entfernen (`qwen mcp remove`)

Um einen Server aus Ihrer Konfiguration zu löschen, verwenden Sie den Befehl `remove` mit dem Namen des Servers.

**Befehl:**

```bash
qwen mcp remove <name>
```

**Beispiel:**

```bash
qwen mcp remove my-server
```

Dadurch wird der Eintrag "my-server" aus dem `mcpServers`-Objekt in der entsprechenden `settings.json`-Datei basierend auf dem Gültigkeitsbereich (`-s, --scope`) gefunden und gelöscht.