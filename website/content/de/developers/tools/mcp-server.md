# MCP-Server mit Qwen Code

Dieses Dokument enthält eine Anleitung zum Konfigurieren und Verwenden von Model Context Protocol (MCP)-Servern mit Qwen Code.

## Was ist ein MCP-Server?

Ein MCP-Server ist eine Anwendung, die Tools und Ressourcen über das Model Context Protocol (MCP) für die CLI bereitstellt und es ihr so ermöglicht, mit externen Systemen und Datenquellen zu interagieren. MCP-Server fungieren als Brücke zwischen dem Modell und Ihrer lokalen Umgebung oder anderen Diensten wie APIs.

Ein MCP-Server ermöglicht es der CLI, folgende Aktionen durchzuführen:

- **Tools zu entdecken:** Verfügbare Tools samt Beschreibungen und Parametern über standardisierte Schemadefinitionen aufzulisten.
- **Tools auszuführen:** Spezifische Tools mit definierten Argumenten aufzurufen und strukturierte Antworten zu erhalten.
- **Auf Ressourcen zuzugreifen:** Daten aus bestimmten Ressourcen zu lesen (obwohl sich die CLI hauptsächlich auf die Ausführung von Tools konzentriert).

Mit einem MCP-Server können Sie die Funktionalität der CLI erweitern, um Aktionen jenseits ihrer integrierten Features durchzuführen – beispielsweise die Interaktion mit Datenbanken, APIs, benutzerdefinierten Skripten oder spezialisierten Workflows.

## Kern-Integrationsarchitektur

Qwen Code integriert sich über ein ausgeklügeltes Entdeckungs- und Ausführungssystem – das in das Core-Paket (`packages/core/src/tools/`) eingebettet ist – mit MCP-Servern:

### Entdeckungsschicht (`mcp-client.ts`)

Der Entdeckungsprozess wird von `discoverMcpTools()` gesteuert, das folgende Schritte ausführt:

1. **Durchläuft konfigurierte Server**, die in Ihrer `settings.json` unter der Konfiguration `mcpServers` angegeben sind  
2. **Stellt Verbindungen her**, wobei geeignete Transportmechanismen verwendet werden (Stdio, SSE oder Streamable HTTP)  
3. **Ruft Tool-Definitionen** von jedem Server mithilfe des MCP-Protokolls ab  
4. **Säubert und validiert** die Tool-Schemata hinsichtlich ihrer Kompatibilität mit der Qwen-API  
5. **Registriert Tools** im globalen Tool-Register unter Berücksichtigung von Konfliktlösungsstrategien

### Ausführungsschicht (`mcp-tool.ts`)

Jedes erkannte MCP-Tool wird in eine Instanz von `DiscoveredMCPTool` eingebettet, die folgende Aufgaben übernimmt:

- **Verwaltung der Bestätigungslogik**, basierend auf den Vertrauenseinstellungen des Servers und den Benutzereinstellungen  
- **Verwaltung der Tool-Ausführung**, indem der MCP-Server mit den richtigen Parametern aufgerufen wird  
- **Verarbeitung der Antworten**, sowohl für den LLM-Kontext als auch zur Anzeige an den Benutzer  
- **Verwaltung des Verbindungsstatus** sowie Behandlung von Timeouts  

### Transportmechanismen

Die CLI unterstützt drei MCP-Transporttypen:

- **Stdio-Transport:** Startet einen Unterprozess und kommuniziert über stdin/stdout  
- **SSE-Transport:** Stellt eine Verbindung zu Server-Sent-Events-Endpunkten her  
- **Streamfähiger HTTP-Transport:** Nutzt HTTP-Streaming für die Kommunikation  

## So richten Sie Ihren MCP-Server ein

Qwen Code verwendet die Konfiguration `mcpServers` in Ihrer Datei `settings.json`, um MCP-Server zu lokalisieren und eine Verbindung herzustellen. Diese Konfiguration unterstützt mehrere Server mit unterschiedlichen Transportmechanismen.

### Konfigurieren des MCP-Servers in `settings.json`

Sie können MCP-Server in Ihrer Datei `settings.json` auf zwei Hauptarten konfigurieren: über das oberste `mcpServers`-Objekt für spezifische Serverdefinitionen und über das `mcp`-Objekt für globale Einstellungen, die die Servererkennung und -ausführung steuern.

#### Globale MCP-Einstellungen (`mcp`)

Das `mcp`-Objekt in Ihrer `settings.json` ermöglicht es Ihnen, globale Regeln für alle MCP-Server festzulegen.

- **`mcp.serverCommand`** (Zeichenkette): Ein globaler Befehl zum Starten eines MCP-Servers.
- **`mcp.allowed`** (Array von Zeichenketten): Eine Liste von MCP-Servernamen, die zugelassen werden sollen. Ist diese Einstellung aktiviert, werden ausschließlich Server aus dieser Liste (entsprechend den Schlüsseln im `mcpServers`-Objekt) verbunden.
- **`mcp.excluded`** (Array von Zeichenketten): Eine Liste von MCP-Servernamen, die ausgeschlossen werden sollen. Server aus dieser Liste werden nicht verbunden.

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

Das Objekt `mcpServers` dient zur Definition jedes einzelnen MCP-Servers, mit dem die CLI eine Verbindung herstellen soll.

### Konfigurationsstruktur

Fügen Sie ein `mcpServers`-Objekt in Ihre Datei `settings.json` ein:

```json
{ ...die Datei enthält weitere Konfigurationsobjekte
  "mcpServers": {
    "serverName": {
      "command": "Pfad/zum/Server",
      "args": ["--arg1", "Wert1"],
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

- **`command`** (Zeichenkette): Pfad zur ausführbaren Datei für die Stdio-Übertragung  
- **`url`** (Zeichenkette): URL des SSE-Endpunkts (z. B. `"http://localhost:8080/sse"`)  
- **`httpUrl`** (Zeichenkette): URL des HTTP-Streaming-Endpunkts

#### Optional

- **`args`** (string[]): Befehlszeilenargumente für die Stdio-Übertragung
- **`headers`** (Objekt): Benutzerdefinierte HTTP-Header bei Verwendung von `url` oder `httpUrl`
- **`env`** (Objekt): Umgebungsvariablen für den Serverprozess. Werte können auf Umgebungsvariablen mittels der Syntax `$VAR_NAME` oder `${VAR_NAME}` verweisen.
- **`cwd`** (string): Arbeitsverzeichnis für die Stdio-Übertragung
- **`timeout`** (Zahl): Anfragetimeout in Millisekunden (Standard: 600.000 ms = 10 Minuten)
- **`trust`** (boolean): Wenn `true`, werden alle Bestätigungen für Tool-Aufrufe für diesen Server umgangen (Standard: `false`)
- **`includeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server einbezogen werden sollen. Wenn angegeben, sind ausschließlich die hier aufgeführten Tools über diesen Server verfügbar (Whitelist-Verhalten). Falls nicht angegeben, sind standardmäßig alle vom Server bereitgestellten Tools aktiviert.
- **`excludeTools`** (string[]): Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgeführten Tools stehen dem Modell nicht zur Verfügung, selbst wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – ist ein Tool in beiden Listen enthalten, wird es ausgeschlossen.
- **`targetAudience`** (string): Die OAuth-Client-ID, die für die IAP-geschützte Anwendung, auf die Sie zugreifen möchten, in einer Whitelist geführt ist. Wird zusammen mit `authProviderType: 'service_account_impersonation'` verwendet.
- **`targetServiceAccount`** (string): Die E-Mail-Adresse des Google Cloud-Dienstkontos, das imitiert werden soll. Wird zusammen mit `authProviderType: 'service_account_impersonation'` verwendet.

### OAuth-Unterstützung für entfernte MCP-Server

Qwen Code unterstützt die OAuth-2.0-Authentifizierung für entfernte MCP-Server, die SSE- oder HTTP-Transporte verwenden. Dadurch wird ein sicherer Zugriff auf MCP-Server ermöglicht, die eine Authentifizierung erfordern.

#### Automatische OAuth-Erkennung

Für Server, die OAuth-Erkennung unterstützen, können Sie die OAuth-Konfiguration weglassen und die CLI die Konfiguration automatisch erkennen lassen:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

Die CLI führt automatisch folgende Schritte aus:

- Erkennung, wenn ein Server eine OAuth-Authentifizierung erfordert (Antworten mit Statuscode 401)
- Ermittlung der OAuth-Endpunkte aus den Server-Metadaten
- Durchführung einer dynamischen Client-Registrierung, falls unterstützt
- Verwaltung des OAuth-Flows und der Token

#### Authentifizierungsablauf

Beim Verbinden mit einem OAuth-fähigen Server:

1. Der **erste Verbindungsversuch** schlägt mit dem Statuscode 401 „Unauthorized“ fehl.
2. Die **OAuth-Erkennung** identifiziert die Autorisierungs- und Token-Endpunkte.
3. Ein **Webbrowser wird geöffnet**, um die Benutzerauthentifizierung durchzuführen (dazu ist Zugriff auf einen lokalen Browser erforderlich).
4. Der **Autorisierungscode** wird gegen Zugriffstoken eingetauscht.
5. Die **Tokens werden sicher für zukünftige Verwendungen gespeichert**.
6. Der **erneute Verbindungsversuch** gelingt mit den gültigen Tokens.

#### Anforderungen an die Browser-Umleitung

**Wichtig:** Für die OAuth-Authentifizierung muss Ihre lokale Maschine folgende Voraussetzungen erfüllen:

- Öffnen eines Webbrowsers zur Durchführung der Authentifizierung
- Empfangen von Umleitungen an `http://localhost:7777/oauth/callback`

Diese Funktion funktioniert **nicht** in folgenden Umgebungen:

- Headless-Umgebungen ohne Browserzugriff
- Entfernten SSH-Sitzungen ohne X11-Weiterleitung
- Containerisierten Umgebungen ohne Browserunterstützung

#### Verwaltung der OAuth-Authentifizierung

Verwenden Sie den Befehl `/mcp auth`, um die OAuth-Authentifizierung zu verwalten:

```bash

# Liste der Server, die eine Authentifizierung erfordern
/mcp auth

# Authentifizierung mit einem bestimmten Server  
`/mcp auth serverName`

# Neuauthentifizierung bei Ablauf der Tokens  
`/mcp auth serverName`  

#### OAuth-Konfigurationseigenschaften  

- **`enabled`** (boolesch): Aktiviert OAuth für diesen Server  
- **`clientId`** (Zeichenkette): OAuth-Client-ID (optional bei dynamischer Registrierung)  
- **`clientSecret`** (Zeichenkette): OAuth-Client-Geheimnis (optional für öffentliche Clients)  
- **`authorizationUrl`** (Zeichenkette): OAuth-Autorisierungsendpunkt (wird automatisch ermittelt, falls nicht angegeben)  
- **`tokenUrl`** (Zeichenkette): OAuth-Token-Endpunkt (wird automatisch ermittelt, falls nicht angegeben)  
- **`scopes`** (Zeichenketten-Array): Erforderliche OAuth-Bereiche  
- **`redirectUri`** (Zeichenkette): Benutzerdefinierte Umleitungs-URI (Standardwert: `http://localhost:7777/oauth/callback`)  
- **`tokenParamName`** (Zeichenkette): Name des Abfrageparameter für Tokens in SSE-URLs  
- **`audiences`** (Zeichenketten-Array): Zielgruppen, für die das Token gültig ist

#### Token-Verwaltung

OAuth-Tokens werden automatisch:

- **Sicher gespeichert** in `~/.qwen/mcp-oauth-tokens.json`
- **Aktualisiert**, sobald sie ablaufen (sofern Refresh-Tokens verfügbar sind)
- **Überprüft**, bevor jeder Verbindungsversuch gestartet wird
- **Entfernt**, sobald sie ungültig oder abgelaufen sind

#### Typ des Authentifizierungsanbieters

Sie können den Typ des Authentifizierungsanbieters mithilfe der Eigenschaft `authProviderType` angeben:

- **`authProviderType`** (Zeichenfolge): Gibt den Authentifizierungsanbieter an. Folgende Werte sind zulässig:
  - **`dynamic_discovery`** (Standard): Die CLI ermittelt die OAuth-Konfiguration automatisch vom Server.
  - **`google_credentials`**: Die CLI verwendet die Google Application Default Credentials (ADC), um sich beim Server zu authentifizieren. Bei Verwendung dieses Anbieters müssen Sie die erforderlichen Bereiche (Scopes) angeben.
  - **`service_account_impersonation`**: Die CLI nimmt die Identität eines Google Cloud-Dienstkontos an, um sich beim Server zu authentifizieren. Dies ist nützlich für den Zugriff auf IAP-geschützte Dienste (dies wurde speziell für Cloud Run-Dienste entwickelt).

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

#### Dienstkonto-Imitation (Service Account Impersonation)

Um sich bei einem Server mittels Dienstkonto-Imitation zu authentifizieren, müssen Sie `authProviderType` auf `service_account_impersonation` festlegen und die folgenden Eigenschaften angeben:

- **`targetAudience`** (Zeichenkette): Die OAuth-Client-ID, die für die IAP-geschützte Anwendung, auf die Sie zugreifen möchten, in der zulässigen Liste („allowlisted“) steht.
- **`targetServiceAccount`** (Zeichenkette): Die E-Mail-Adresse des Google Cloud-Dienstkontos, das imitiert werden soll.

Die CLI verwendet Ihre lokalen Application Default Credentials (ADC), um ein OIDC-ID-Token für das angegebene Dienstkonto und den angegebenen Audience-Wert zu generieren. Dieses Token wird anschließend zur Authentifizierung beim MCP-Server verwendet.

#### Einrichtungsanweisungen

1. **[Erstellen](https://cloud.google.com/iap/docs/oauth-client-creation) Sie eine OAuth 2.0-Client-ID oder verwenden Sie eine vorhandene.** Um eine vorhandene OAuth 2.0-Client-ID zu verwenden, befolgen Sie die Schritte unter [So teilen Sie OAuth-Clients](https://cloud.google.com/iap/docs/sharing-oauth-clients).
2. **Fügen Sie die OAuth-ID der Zulassungsliste für den [programmgesteuerten Zugriff](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) auf die Anwendung hinzu.** Da Cloud Run derzeit noch kein unterstützter Ressourcentyp in `gcloud iap` ist, müssen Sie die Client-ID auf Projektebene zulassen.
3. **Erstellen Sie ein Dienstkonto.** [Dokumentation](https://cloud.google.com/iam/docs/service-accounts-create#creating), [Link zur Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Fügen Sie sowohl das Dienstkonto als auch die Benutzer der IAP-Richtlinie** im Reiter „Sicherheit“ des Cloud Run-Dienstes selbst oder über `gcloud` hinzu.
5. **Gewähren Sie allen Benutzern und Gruppen**, die auf den MCP-Server zugreifen werden, die erforderlichen Berechtigungen zum [Imitieren des Dienstkontos](https://cloud.google.com/docs/authentication/use-service-account-impersonation) (d. h. `roles/iam.serviceAccountTokenCreator`).
6. **[Aktivieren](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) Sie die IAM-Credentials-API** für Ihr Projekt.

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

### SSE-MCP-Server mit SA-Imitation

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

## Tiefenanalyse des Ermittlungsprozesses

Wenn Qwen Code gestartet wird, führt er die Ermittlung von MCP-Servern über den folgenden detaillierten Prozess durch:

### 1. Server-Iteration und Verbindung

Für jeden konfigurierten Server in `mcpServers`:

1. **Statusüberwachung beginnt:** Der Serverstatus wird auf `CONNECTING` gesetzt.
2. **Transportauswahl:** Basierend auf den Konfigurationseigenschaften:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **Verbindungsherstellung:** Der MCP-Client versucht, eine Verbindung mit dem konfigurierten Timeout herzustellen.
4. **Fehlerbehandlung:** Bei Verbindungsfehlern wird ein Eintrag ins Protokoll geschrieben, und der Serverstatus wird auf `DISCONNECTED` gesetzt.

### 2. Tool-Ermittlung

Nach einer erfolgreichen Verbindung:

1. **Tool-Liste abrufen:** Der Client ruft den Tool-Liste-Endpunkt des MCP-Servers auf.
2. **Schemavalidierung:** Die Funktionsdeklaration jedes Tools wird validiert.
3. **Tool-Filterung:** Die Tools werden anhand der Konfigurationsoptionen `includeTools` und `excludeTools` gefiltert.
4. **Namensbereinigung:** Tool-Namen werden bereinigt, um die Anforderungen der Qwen-API zu erfüllen:
   - Ungültige Zeichen (nicht alphanumerisch, kein Unterstrich, kein Punkt, kein Gedankenstrich) werden durch Unterstriche ersetzt.
   - Namen mit mehr als 63 Zeichen werden mittels Ersetzung durch `___` gekürzt.

### 3. Konfliktlösung

Wenn mehrere Server Tools mit demselben Namen bereitstellen:

1. **Erste Registrierung gewinnt:** Der erste Server, der einen Tool-Namen registriert, erhält den Namen ohne Präfix.
2. **Automatische Präfixierung:** Aufeinanderfolgende Server erhalten präfixierte Namen: `serverName__toolName`.
3. **Registrierungsverfolgung:** Die Tool-Registry verwaltet Zuordnungen zwischen Servernamen und deren Tools.

### 4. Schemaverarbeitung

Tool-Parameterschemata werden zur Sicherstellung der API-Kompatibilität bereinigt:

- **`$schema`-Eigenschaften** werden entfernt  
- **`additionalProperties`** werden gestrichen  
- Bei **`anyOf` mit `default`** werden die Standardwerte entfernt (zur Kompatibilität mit Vertex AI)  
- **Rekursive Verarbeitung** wird auf geschachtelte Schemata angewendet  

### 5. Verbindungsverwaltung  

Nach der Erkennung:  

- **Dauerhafte Verbindungen:** Server, die Tools erfolgreich registrieren, behalten ihre Verbindungen bei  
- **Aufräumen:** Server, die keine nutzbaren Tools bereitstellen, verlieren ihre Verbindungen  
- **Statusaktualisierungen:** Der endgültige Status der Server wird auf `CONNECTED` oder `DISCONNECTED` gesetzt  

## Tool-Ausführungsablauf  

Wenn das Modell entscheidet, ein MCP-Tool zu verwenden, erfolgt der folgende Ausführungsablauf:  

### 1. Tool-Aufruf  

Das Modell generiert einen `FunctionCall` mit:  

- **Tool-Name:** Der registrierte Name (ggf. mit Präfix)  
- **Argumente:** Ein JSON-Objekt, das dem Parameterschema des Tools entspricht

### 2. Bestätigungsprozess

Jedes `DiscoveredMCPTool` implementiert eine ausgefeilte Bestätigungslogik:

#### Vertrauensbasierte Umgehung

```typescript
if (this.trust) {
  return false; // Keine Bestätigung erforderlich
}
```

#### Dynamische Zulassungsliste

Das System führt interne Zulassungslisten für folgende Fälle:

- **Auf Serverebene:** `serverName` → Alle Tools von diesem Server sind vertrauenswürdig  
- **Auf Tool-Ebene:** `serverName.toolName` → Dieses spezifische Tool ist vertrauenswürdig

#### Behandlung der Benutzerwahl

Wenn eine Bestätigung erforderlich ist, kann der Benutzer wählen zwischen:

- **Einmal ausführen:** Nur dieses Mal ausführen  
- **Dieses Tool immer zulassen:** Zum Zulassungsverzeichnis auf Tool-Ebene hinzufügen  
- **Diesen Server immer zulassen:** Zum Zulassungsverzeichnis auf Serverebene hinzufügen  
- **Abbrechen:** Ausführung abbrechen

### 3. Ausführung

Nach Bestätigung (oder bei Umgehung der Vertrauensprüfung):

1. **Vorbereitung der Parameter:** Die Argumente werden anhand des Schemas des Tools validiert.
2. **MCP-Aufruf:** Das zugrunde liegende `CallableTool` ruft den Server mit folgendem Code auf:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Originaler Name des Server-Tools
       args: params,
     },
   ];
   ```

3. **Verarbeitung der Antwort:** Die Ergebnisse werden sowohl für den Kontext des Sprachmodells als auch für die Anzeige an den Benutzer formatiert.

### 4. Antwortverarbeitung

Das Ausführungsergebnis enthält:

- **`llmContent`:** Rohdaten der Antwort für den Kontext des Sprachmodells
- **`returnDisplay`:** Formatierter Ausgabeinhalt für die Darstellung an den Benutzer (häufig als JSON in Markdown-Codeblöcken)

## So interagieren Sie mit Ihrem MCP-Server

### Verwenden des `/mcp`-Befehls

Der `/mcp`-Befehl liefert umfassende Informationen zu Ihrer MCP-Server-Konfiguration:

```bash
/mcp
```

Dies zeigt Folgendes an:

- **Serverliste:** Alle konfigurierten MCP-Server  
- **Verbindungsstatus:** `VERBUNDEN`, `VERBINDE…` oder `GETRENNT`  
- **Serverdetails:** Konfigurationszusammenfassung (ohne sensible Daten)  
- **Verfügbare Tools:** Liste der Tools von jedem Server mit Beschreibungen  
- **Erkennungsstatus:** Gesamtstatus des Erkennungsprozesses  

### Beispielhafte Ausgabe von `/mcp`

```
Status der MCP-Server:

📡 pythonTools (VERBUNDEN)
  Befehl: python -m my_mcp_server --port 8080
  Arbeitsverzeichnis: ./mcp-servers/python
  Timeout: 15000 ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (GETRENNT)
  Befehl: node dist/server.js --verbose
  Fehler: Verbindung abgelehnt

🐳 dockerizedServer (VERBUNDEN)
  Befehl: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Erkennungsstatus: ABGESCHLOSSEN
```

### Verwendung von Tools

Sobald sie entdeckt wurden, stehen MCP-Tools dem Qwen-Modell wie eingebaute Tools zur Verfügung. Das Modell führt automatisch folgende Schritte aus:

1. **Auswahl geeigneter Tools** basierend auf Ihren Anfragen  
2. **Anzeige von Bestätigungsdialogen** (sofern der Server nicht als vertrauenswürdig eingestuft ist)  
3. **Ausführung der Tools** mit den richtigen Parametern  
4. **Anzeige der Ergebnisse** in einem benutzerfreundlichen Format  

## Statusüberwachung und Fehlerbehebung  

### Verbindungsstatus  

Die MCP-Integration überwacht mehrere Zustände:  

#### Serverstatus (`MCPServerStatus`)  

- **`DISCONNECTED`:** Der Server ist nicht verbunden oder weist Fehler auf.  
- **`CONNECTING`:** Ein Verbindungsversuch ist im Gange.  
- **`CONNECTED`:** Der Server ist verbunden und bereit.  

#### Entdeckungsstatus (`MCPDiscoveryState`)  

- **`NOT_STARTED`:** Die Entdeckung hat noch nicht begonnen.  
- **`IN_PROGRESS`:** Es werden aktuell Server entdeckt.  
- **`COMPLETED`:** Die Entdeckung ist abgeschlossen (mit oder ohne Fehler).  

### Häufige Probleme und Lösungen

#### Server verbindet nicht

**Symptome:** Der Server zeigt den Status `DISCONNECTED` an.

**Fehlerbehebung:**

1. **Überprüfen Sie die Konfiguration:** Stellen Sie sicher, dass `command`, `args` und `cwd` korrekt sind.
2. **Manueller Test:** Führen Sie den Serverbefehl direkt aus, um sicherzustellen, dass er funktioniert.
3. **Abhängigkeiten prüfen:** Stellen Sie sicher, dass alle erforderlichen Pakete installiert sind.
4. **Protokolle überprüfen:** Suchen Sie in der CLI-Ausgabe nach Fehlermeldungen.
5. **Berechtigungen überprüfen:** Stellen Sie sicher, dass die CLI den Serverbefehl ausführen darf.

#### Keine Tools gefunden

**Symptome:** Der Server verbindet sich, aber es stehen keine Tools zur Verfügung.

**Fehlerbehebung:**

1. **Registrierung der Tools überprüfen:** Stellen Sie sicher, dass Ihr Server Tools tatsächlich registriert.
2. **MCP-Protokoll überprüfen:** Bestätigen Sie, dass Ihr Server die Tool-Auflistung gemäß dem MCP-Protokoll korrekt implementiert.
3. **Serverprotokolle überprüfen:** Prüfen Sie die stderr-Ausgabe auf serverseitige Fehler.
4. **Tool-Auflistung testen:** Testen Sie manuell den Tool-Ermittlungsendpunkt Ihres Servers.

#### Tools werden nicht ausgeführt

**Symptome:** Tools werden erkannt, scheitern jedoch während der Ausführung.

**Fehlerbehebung:**

1. **Parameterüberprüfung:** Stellen Sie sicher, dass Ihr Tool die erwarteten Parameter akzeptiert.
2. **Schemakompatibilität:** Überprüfen Sie, ob Ihre Eingabeschemas gültige JSON-Schemas sind.
3. **Fehlerbehandlung:** Prüfen Sie, ob Ihr Tool unbehandelte Ausnahmen auslöst.
4. **Timeout-Probleme:** Erwägen Sie eine Erhöhung der `timeout`-Einstellung.

#### Sandbox-Kompatibilität

**Symptome:** MCP-Server schlagen fehl, wenn die Sandbox-Funktion aktiviert ist.

**Lösungen:**

1. **Docker-basierte Server:** Verwenden Sie Docker-Container, die alle erforderlichen Abhängigkeiten enthalten.
2. **Pfadzugriff:** Stellen Sie sicher, dass die ausführbaren Serverdateien innerhalb der Sandbox verfügbar sind.
3. **Netzwerkzugriff:** Konfigurieren Sie die Sandbox so, dass sie die erforderlichen Netzwerkverbindungen zulässt.
4. **Umgebungsvariablen:** Stellen Sie sicher, dass die erforderlichen Umgebungsvariablen an die Sandbox weitergegeben werden.

### Tipps zur Fehlersuche

1. **Debug-Modus aktivieren:** Führen Sie die CLI mit `--debug` aus, um detaillierte Ausgaben zu erhalten.  
2. **stderr überprüfen:** Der stderr-Ausgabestrom des MCP-Servers wird erfasst und protokolliert (INFO-Meldungen werden gefiltert).  
3. **Isolierte Tests:** Testen Sie Ihren MCP-Server unabhängig, bevor Sie ihn integrieren.  
4. **Schrittweise Einrichtung:** Beginnen Sie mit einfachen Tools, bevor Sie komplexe Funktionalität hinzufügen.  
5. **Häufig `/mcp` verwenden:** Überwachen Sie den Serverstatus während der Entwicklung.

## Wichtige Hinweise

### Sicherheitsaspekte

- **Vertrauenseinstellungen:** Die Option `trust` überspringt sämtliche Bestätigungsdialoge. Verwenden Sie sie mit Vorsicht und ausschließlich für Server, die Sie vollständig kontrollieren.  
- **Zugriffstoken:** Achten Sie bei der Konfiguration von Umgebungsvariablen, die API-Schlüssel oder Token enthalten, auf Sicherheitsaspekte.  
- **Kompatibilität mit Sandboxes:** Stellen Sie sicher, dass MCP-Server innerhalb der Sandbox-Umgebung verfügbar sind, falls Sandboxing verwendet wird.  
- **Private Daten:** Die Verwendung weitreichender persönlicher Zugriffstoken kann zu einer Informationsverteilung zwischen Repositories führen.

### Leistung und Ressourcenverwaltung

- **Verbindungspersistenz:** Die CLI behält persistente Verbindungen zu Servern bei, die Tools erfolgreich registriert haben.  
- **Automatische Bereinigung:** Verbindungen zu Servern, die keine Tools bereitstellen, werden automatisch geschlossen.  
- **Timeout-Verwaltung:** Konfigurieren Sie geeignete Timeouts basierend auf den Antwortcharakteristiken Ihres Servers.  
- **Ressourcenüberwachung:** MCP-Server laufen als separate Prozesse und beanspruchen Systemressourcen.

### Schema-Kompatibilität

- **Schema-Konformitätsmodus:** Standardmäßig (`schemaCompliance: "auto"`) werden Tool-Schemas unverändert übernommen. Legen Sie in Ihrer `settings.json` `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` fest, um Modelle in das strenge OpenAPI-3.0-Format zu konvertieren.
- **OpenAPI-3.0-Transformationen:** Im `openapi_30`-Modus verarbeitet das System:
  - Nullable-Typen: `["string", "null"]` → `type: "string", nullable: true`
  - Konstante Werte: `const: "foo"` → `enum: ["foo"]`
  - Exklusive Grenzwerte: numerisches `exclusiveMinimum` → boolesche Form mit `minimum`
  - Entfernung von Schlüsselwörtern: `$schema`, `$id`, `dependencies`, `patternProperties`
- **Namensbereinigung:** Tool-Namen werden automatisch bereinigt, um API-Anforderungen zu erfüllen.
- **Konfliktlösung:** Namenskonflikte zwischen Servern werden durch automatisches Präfixing gelöst.

Diese umfassende Integration macht MCP-Server zu einer leistungsstarken Methode, die Funktionalität der CLI zu erweitern – bei gleichzeitiger Gewährleistung von Sicherheit, Zuverlässigkeit und Benutzerfreundlichkeit.

## Zurückgeben von Rich Content aus Tools

MCP-Tools sind nicht auf die Rückgabe einfacher Texte beschränkt. Sie können reichhaltigen, mehrteiligen Content zurückgeben – darunter Text, Bilder, Audio und andere Binärdaten – in einer einzigen Tool-Antwort. Dadurch lassen sich leistungsstarke Tools erstellen, die dem Modell innerhalb eines einzigen Durchlaufs vielfältige Informationen bereitstellen.

Alle vom Tool zurückgegebenen Daten werden verarbeitet und als Kontext für die nächste Generierung des Modells an dieses übermittelt. Dadurch kann das Modell über die bereitgestellten Informationen nachdenken oder sie zusammenfassen.

### So funktioniert es

Um umfangreiche Inhalte zurückzugeben, muss die Antwort Ihres Tools der MCP-Spezifikation für ein [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) entsprechen. Das Feld `content` des Ergebnisses muss ein Array von `ContentBlock`-Objekten sein. Die CLI verarbeitet dieses Array korrekt, trennt Textinhalte von Binärdaten und verpackt sie für das Modell.

Sie können verschiedene Typen von Inhaltsblöcken im `content`-Array beliebig kombinieren. Unterstützte Blocktypen sind:

- `text`
- `image`
- `audio`
- `resource` (eingebettete Inhalte)
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
      "data": "BASE64_KODIERTE_BILDDATEN_HIER",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "Das Logo wurde im Jahr 2025 erstellt."
    }
  ]
}
```

Wenn Qwen Code diese Antwort erhält, führt es folgende Schritte aus:

1.  Extrahiert den gesamten Text und fasst ihn zu einem einzelnen `functionResponse`-Teil für das Modell zusammen.
2.  Stellt die Bilddaten als separaten `inlineData`-Teil bereit.
3.  Gibt im CLI eine übersichtliche, benutzerfreundliche Zusammenfassung aus, die darauf hinweist, dass sowohl Text als auch ein Bild empfangen wurden.

Dadurch können Sie anspruchsvolle Tools erstellen, die dem Qwen-Modell reichhaltigen, multimodalen Kontext liefern.

## MCP-Aufforderungen als Schrägstrichbefehle

Neben Tools können MCP-Server vordefinierte Aufforderungen bereitstellen, die innerhalb von Qwen Code als Schrägstrichbefehle ausgeführt werden können. Dadurch können Sie Verknüpfungen für häufige oder komplexe Abfragen erstellen, die einfach über ihren Namen aufgerufen werden können.

### Eingabeaufforderungen auf dem Server definieren

Hier ist ein kleines Beispiel für einen stdio-MCP-Server, der Eingabeaufforderungen definiert:

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
    title: 'Gedichtschreiber',
    description: 'Schreibe ein schönes Haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Schreibe ein Haiku${mood ? ` mit der Stimmung ${mood}` : ''} mit dem Titel ${title}. Beachte, dass ein Haiku aus 5 Silben, gefolgt von 7 Silben und dann wieder 5 Silben besteht.`,
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

Sobald ein Prompt gefunden wurde, können Sie ihn über seinen Namen als Slash-Befehl aufrufen. Die CLI übernimmt automatisch das Parsen der Argumente.

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

oder mit positionsbasierten Argumenten:

```bash
/poem-writer "Qwen Code" reverent
```

Bei Ausführung dieses Befehls ruft die CLI die Methode `prompts/get` auf dem MCP-Server mit den angegebenen Argumenten auf. Der Server ist dafür verantwortlich, die Argumente in die Prompt-Vorlage einzufügen und den fertigen Prompt-Text zurückzugeben. Anschließend sendet die CLI diesen Prompt an das Modell zur Ausführung. Dadurch wird eine bequeme Möglichkeit bereitgestellt, gängige Workflows zu automatisieren und gemeinsam zu nutzen.

## Verwalten von MCP-Servern mit `qwen mcp`

Obwohl Sie MCP-Server stets manuell durch Bearbeiten der Datei `settings.json` konfigurieren können, bietet die CLI eine praktische Befehlsgruppe zum programmatischen Verwalten Ihrer Serverkonfigurationen. Mit diesen Befehlen lässt sich das Hinzufügen, Auflisten und Entfernen von MCP-Servern vereinfachen, ohne dass Sie JSON-Dateien direkt bearbeiten müssen.

### Einen Server hinzufügen (`qwen mcp add`)

Der Befehl `add` konfiguriert einen neuen MCP-Server in Ihrer Datei `settings.json`. Abhängig vom Gültigkeitsbereich (`-s, --scope`) wird der Eintrag entweder in die Benutzerkonfigurationsdatei `~/.qwen/settings.json` oder in die Projekt-Konfigurationsdatei `.qwen/settings.json` eingetragen.

**Befehl:**

```bash
qwen mcp add [Optionen] <Name> <BefehlOderUrl> [Argumente...]
```

- `<Name>`: Ein eindeutiger Name für den Server.
- `<BefehlOderUrl>`: Der auszuführende Befehl (für `stdio`) oder die URL (für `http`/`sse`).
- `[Argumente...]`: Optionale Argumente für einen `stdio`-Befehl.

**Optionen (Flags):**

- `-s, --scope`: Gültigkeitsbereich der Konfiguration (Benutzer oder Projekt). [Standard: „project“]
- `-t, --transport`: Transportart (`stdio`, `sse`, `http`). [Standard: „stdio“]
- `-e, --env`: Umgebungsvariablen festlegen (z. B. `-e SCHLÜSSEL=Wert`).
- `-H, --header`: HTTP-Header für SSE- und HTTP-Transports festlegen (z. B. `-H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"`).
- `--timeout`: Verbindungszeitüberschreitung in Millisekunden festlegen.
- `--trust`: Server als vertrauenswürdig kennzeichnen (alle Bestätigungsabfragen für Tool-Aufrufe umgehen).
- `--description`: Beschreibung für den Server festlegen.
- `--include-tools`: Durch Kommas getrennte Liste der einzuschließenden Tools.
- `--exclude-tools`: Durch Kommas getrennte Liste der auszuschließenden Tools.

#### Hinzufügen eines stdio-Servers

Dies ist der Standard-Transport für das Ausführen lokaler Server.

```bash

# Grundlegende Syntax
qwen mcp add <Name> <Befehl> [Argumente...]

# Beispiel: Hinzufügen eines lokalen Servers
qwen mcp add my-stdio-server -e API_KEY=123 /pfad/zu/server arg1 arg2 arg3

# Beispiel: Hinzufügen eines lokalen Python-Servers
qwen mcp add python-server python server.py --port 8080
```

#### Hinzufügen eines HTTP-Servers

Dieser Transport ist für Server gedacht, die den streamfähigen HTTP-Transport verwenden.

```bash

# Grundlegende Syntax
qwen mcp add --transport http <Name> <URL>

# Beispiel: Hinzufügen eines HTTP-Servers
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Beispiel: Hinzufügen eines HTTP-Servers mit Authentifizierungsheader
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### Hinzufügen eines SSE-Servers

Dieser Transport ist für Server gedacht, die Server-Sent Events (SSE) verwenden.

```bash

# Grundlegende Syntax
qwen mcp add --transport sse <Name> <URL>
```

# Beispiel: Hinzufügen eines SSE-Servers
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Beispiel: Hinzufügen eines SSE-Servers mit Authentifizierungsheader
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### Server verwalten (`qwen mcp`)

Um alle derzeit konfigurierten MCP-Server anzuzeigen und zu verwalten, verwenden Sie den Befehl `manage` oder einfach `qwen mcp`. Dadurch wird ein interaktives TUI-Dialogfeld geöffnet, in dem Sie Folgendes tun können:

- Alle MCP-Server mit ihrem Verbindungsstatus anzeigen
- Server aktivieren/deaktivieren
- Mit getrennten Servern erneut eine Verbindung herstellen
- Die von jedem Server bereitgestellten Tools und Prompts anzeigen
- Die Server-Protokolle anzeigen

**Befehl:**

```bash
qwen mcp

# oder
qwen mcp manage
```

Der Verwaltungsdialog bietet eine grafische Oberfläche, die für jeden Server dessen Namen, Konfigurationsdetails, Verbindungsstatus sowie verfügbare Tools und Prompts anzeigt.

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

Dieser Befehl sucht den Eintrag „my-server“ im Objekt `mcpServers` der entsprechenden Datei `settings.json` (basierend auf dem Gültigkeitsbereich `-s, --scope`) und löscht ihn.