# Qwen Code Konfiguration

**Hinweis zum neuen Konfigurationsformat**

Das Format der `settings.json`-Datei wurde auf eine neue, besser strukturierte Form aktualisiert. Das alte Format wird automatisch migriert.

Details zum vorherigen Format findest du in der [v1 Konfigurationsdokumentation](./configuration-v1.md).

Qwen Code bietet mehrere Möglichkeiten, sein Verhalten zu konfigurieren, darunter Umgebungsvariablen, Command-Line-Argumente und Settings-Dateien. Dieses Dokument beschreibt die verschiedenen Konfigurationsmethoden und verfügbaren Einstellungen.

## Konfigurationsebenen

Die Konfiguration wird in der folgenden Reihenfolge angewendet (niedrigere Nummern werden von höheren überschrieben):

1.  **Standardwerte:** Fest in der Anwendung kodierten Standardwerte.
2.  **System-Standard-Datei:** Systemweite Standardeinstellungen, die von anderen Einstellungsdateien überschrieben werden können.
3.  **Benutzereinstellungsdatei:** Globale Einstellungen für den aktuellen Benutzer.
4.  **Projekteinstellungsdatei:** Projektspezifische Einstellungen.
5.  **Systemeinstellungsdatei:** Systemweite Einstellungen, die alle anderen Einstellungsdateien überschreiben.
6.  **Umgebungsvariablen:** Systemweite oder sessionspezifische Variablen, möglicherweise aus `.env` Dateien geladen.
7.  **Kommandozeilenargumente:** Werte, die beim Starten der CLI übergeben werden.

## Einstellungsdateien

Qwen Code verwendet JSON-Einstellungsdateien für die persistente Konfiguration. Es gibt vier Speicherorte für diese Dateien:

- **System-Standarddatei:**
  - **Speicherort:** `/etc/qwen-code/system-defaults.json` (Linux), `C:\ProgramData\qwen-code\system-defaults.json` (Windows) oder `/Library/Application Support/QwenCode/system-defaults.json` (macOS). Der Pfad kann mithilfe der Umgebungsvariable `QWEN_CODE_SYSTEM_DEFAULTS_PATH` überschrieben werden.
  - **Geltungsbereich:** Stellt eine Basisebene von systemweiten Standardeinstellungen bereit. Diese Einstellungen haben die niedrigste Priorität und sollen durch Benutzer-, Projekt- oder Systemüberschreibungseinstellungen überschrieben werden.

- **Benutzereinstellungsdatei:**
  - **Speicherort:** `~/.qwen/settings.json` (wobei `~` Ihr Home-Verzeichnis ist).
  - **Geltungsbereich:** Gilt für alle Qwen Code-Sitzungen des aktuellen Benutzers.

- **Projekteinstellungsdatei:**
  - **Speicherort:** `.qwen/settings.json` im Stammverzeichnis Ihres Projekts.
  - **Geltungsbereich:** Gilt nur, wenn Qwen Code aus diesem spezifischen Projekt heraus ausgeführt wird. Projekteinstellungen überschreiben Benutzereinstellungen.

- **Systemeinstellungsdatei:**
  - **Speicherort:** `/etc/qwen-code/settings.json` (Linux), `C:\ProgramData\qwen-code\settings.json` (Windows) oder `/Library/Application Support/QwenCode/settings.json` (macOS). Der Pfad kann mithilfe der Umgebungsvariable `QWEN_CODE_SYSTEM_SETTINGS_PATH` überschrieben werden.
  - **Geltungsbereich:** Gilt für alle Qwen Code-Sitzungen auf dem System, für alle Benutzer. Systemeinstellungen überschreiben Benutzer- und Projekteinstellungen. Kann für Systemadministratoren in Unternehmen nützlich sein, um Kontrolle über die Qwen Code-Konfigurationen der Benutzer zu haben.

**Hinweis zu Umgebungsvariablen in den Einstellungen:** Zeichenkettenwerte innerhalb Ihrer `settings.json`-Dateien können Umgebungsvariablen enthalten, indem sie entweder die Syntax `$VAR_NAME` oder `${VAR_NAME}` verwenden. Diese Variablen werden automatisch aufgelöst, sobald die Einstellungen geladen werden. Wenn Sie zum Beispiel eine Umgebungsvariable namens `MY_API_TOKEN` haben, könnten Sie diese in der `settings.json` wie folgt verwenden: `"apiKey": "$MY_API_TOKEN"`.

### Das `.qwen`-Verzeichnis in deinem Projekt

Neben einer Projekt-Einstellungsdatei kann das `.qwen`-Verzeichnis eines Projekts weitere projektspezifische Dateien enthalten, die für den Betrieb von Qwen Code relevant sind, wie z.B.:

- [Benutzerdefinierte Sandbox-Profile](#sandboxing) (z.B. `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

### Verfügbare Einstellungen in `settings.json`

Die Einstellungen sind in Kategorien organisiert. Alle Einstellungen sollten innerhalb ihres entsprechenden Hauptkategorie-Objekts in deiner `settings.json`-Datei platziert werden.

#### `general`

- **`general.preferredEditor`** (string):
  - **Beschreibung:** Der bevorzugte Editor zum Öffnen von Dateien.
  - **Standard:** `undefined`

- **`general.vimMode`** (boolean):
  - **Beschreibung:** Aktiviere Vim-Keybindings.
  - **Standard:** `false`

- **`general.disableAutoUpdate`** (boolean):
  - **Beschreibung:** Deaktiviere automatische Updates.
  - **Standard:** `false`

- **`general.disableUpdateNag`** (boolean):
  - **Beschreibung:** Deaktiviere Update-Benachrichtigungen.
  - **Standard:** `false`

- **`general.checkpointing.enabled`** (boolean):
  - **Beschreibung:** Aktiviere Session-Checkpointing für die Wiederherstellung.
  - **Standard:** `false`

#### `output`

- **`output.format`** (string):
  - **Beschreibung:** Das Format der CLI-Ausgabe.
  - **Standard:** `"text"`
  - **Werte:** `"text"`, `"json"`

#### `ui`

- **`ui.theme`** (string):
  - **Beschreibung:** Das Farbthema für die UI. Siehe [Themes](./themes.md) für verfügbare Optionen.
  - **Standardwert:** `undefined`

- **`ui.customThemes`** (object):
  - **Beschreibung:** Benutzerdefinierte Themendefinitionen.
  - **Standardwert:** `{}`

- **`ui.hideWindowTitle`** (boolean):
  - **Beschreibung:** Blendet die Fenstertitelleiste aus.
  - **Standardwert:** `false`

- **`ui.hideTips`** (boolean):
  - **Beschreibung:** Blendet hilfreiche Tipps in der UI aus.
  - **Standardwert:** `false`

- **`ui.hideBanner`** (boolean):
  - **Beschreibung:** Blendet das Anwendungsbanner aus.
  - **Standardwert:** `false`

- **`ui.hideFooter`** (boolean):
  - **Beschreibung:** Blendet den Footer aus der UI aus.
  - **Standardwert:** `false`

- **`ui.showMemoryUsage`** (boolean):
  - **Beschreibung:** Zeigt Speichernutzungsinformationen in der UI an.
  - **Standardwert:** `false`

- **`ui.showLineNumbers`** (boolean):
  - **Beschreibung:** Zeigt Zeilennummern im Chat an.
  - **Standardwert:** `false`

- **`ui.showCitations`** (boolean):
  - **Beschreibung:** Zeigt Zitate für generierten Text im Chat an.
  - **Standardwert:** `true`

- **`enableWelcomeBack`** (boolean):
  - **Beschreibung:** Zeigt einen „Willkommen zurück“-Dialog an, wenn man zu einem Projekt mit Konversationsverlauf zurückkehrt.
  - **Standardwert:** `true`

- **`ui.accessibility.disableLoadingPhrases`** (boolean):
  - **Beschreibung:** Deaktiviert Ladehinweise zur Verbesserung der Barrierefreiheit.
  - **Standardwert:** `false`

- **`ui.customWittyPhrases`** (Array aus Strings):
  - **Beschreibung:** Eine Liste benutzerdefinierter Phrasen, die während des Ladezustands angezeigt werden. Wenn angegeben, durchläuft die CLI diese Phrasen statt der Standardphrasen.
  - **Standardwert:** `[]`

#### `ide`

- **`ide.enabled`** (boolean):
  - **Beschreibung:** Aktiviert den IDE-Integrationsmodus.
  - **Standardwert:** `false`

- **`ide.hasSeenNudge`** (boolean):
  - **Beschreibung:** Gibt an, ob der Benutzer den Hinweis zur IDE-Integration bereits gesehen hat.
  - **Standardwert:** `false`

#### `privacy`

- **`privacy.usageStatisticsEnabled`** (boolean):
  - **Beschreibung:** Aktiviert die Sammlung von Nutzungsstatistiken.
  - **Standardwert:** `true`

#### `model`

- **`model.name`** (string):
  - **Beschreibung:** Das Qwen-Modell, das für Gespräche verwendet werden soll.
  - **Standardwert:** `undefined`

- **`model.maxSessionTurns`** (number):
  - **Beschreibung:** Maximale Anzahl an Benutzer-/Modell-/Tool-Runden, die in einer Sitzung gespeichert werden. -1 bedeutet unbegrenzt.
  - **Standardwert:** `-1`

- **`model.summarizeToolOutput`** (object):
  - **Beschreibung:** Aktiviert oder deaktiviert die Zusammenfassung von Tool-Ausgaben. Du kannst das Token-Budget für die Zusammenfassung über die `tokenBudget`-Einstellung festlegen. Hinweis: Derzeit wird nur das `run_shell_command`-Tool unterstützt. Beispiel: `{"run_shell_command": {"tokenBudget": 2000}}`
  - **Standardwert:** `undefined`

- **`model.chatCompression.contextPercentageThreshold`** (number):
  - **Beschreibung:** Legt den Schwellenwert für die Komprimierung des Chatverlaufs als Prozentsatz des maximalen Token-Limits des Modells fest. Dies ist ein Wert zwischen 0 und 1, der sowohl für die automatische Komprimierung als auch für den manuellen Befehl `/compress` gilt. Ein Wert von `0.6` löst beispielsweise die Komprimierung aus, sobald der Chatverlauf 60 % des Token-Limits überschreitet.
  - **Standardwert:** `0.7`

- **`model.skipNextSpeakerCheck`** (boolean):
  - **Beschreibung:** Überspringt die Prüfung des nächsten Sprechers.
  - **Standardwert:** `false`

- **`model.skipLoopDetection`** (boolean):
  - **Beschreibung:** Deaktiviert die Erkennung von Schleifen. Die Schleifenerkennung verhindert Endlosschleifen in KI-Antworten, kann aber auch Fehlalarme auslösen, die legitime Workflows unterbrechen. Aktiviere diese Option, wenn du häufige Unterbrechungen durch Fehlalarme bei der Schleifenerkennung feststellst.
  - **Standardwert:** `false`

#### `context`

- **`context.fileName`** (string oder Array aus Strings):
  - **Beschreibung:** Der Name der Context-Datei(en).
  - **Standardwert:** `undefined`

- **`context.importFormat`** (string):
  - **Beschreibung:** Das Format, das beim Importieren von Memory verwendet wird.
  - **Standardwert:** `undefined`

- **`context.discoveryMaxDirs`** (number):
  - **Beschreibung:** Maximale Anzahl an Verzeichnissen, die bei der Suche nach Memory durchsucht werden.
  - **Standardwert:** `200`

- **`context.includeDirectories`** (Array):
  - **Beschreibung:** Zusätzliche Verzeichnisse, die im Workspace-Kontext berücksichtigt werden sollen. Fehlende Verzeichnisse werden mit einer Warnung übersprungen.
  - **Standardwert:** `[]`

- **`context.loadFromIncludeDirectories`** (boolean):
  - **Beschreibung:** Steuert das Verhalten des Befehls `/memory refresh`. Wenn auf `true` gesetzt, sollten `QWEN.md`-Dateien aus allen hinzugefügten Verzeichnissen geladen werden. Bei `false` soll `QWEN.md` nur aus dem aktuellen Verzeichnis geladen werden.
  - **Standardwert:** `false`

- **`context.fileFiltering.respectGitIgnore`** (boolean):
  - **Beschreibung:** Berücksichtigt `.gitignore`-Dateien bei der Suche.
  - **Standardwert:** `true`

- **`context.fileFiltering.respectQwenIgnore`** (boolean):
  - **Beschreibung:** Berücksichtigt `.qwenignore`-Dateien bei der Suche.
  - **Standardwert:** `true`

- **`context.fileFiltering.enableRecursiveFileSearch`** (boolean):
  - **Beschreibung:** Legt fest, ob rekursiv nach Dateinamen unterhalb des aktuellen Verzeichnisbaums gesucht werden soll, wenn `@`-Präfixe im Prompt vervollständigt werden.
  - **Standardwert:** `true`

#### `tools`

- **`tools.sandbox`** (boolean oder string):
  - **Beschreibung:** Sandbox-Ausführungsumgebung (kann ein Boolean oder ein Pfad-String sein).
  - **Standardwert:** `undefined`

- **`tools.shell.enableInteractiveShell`** (boolean):

  Verwendet `node-pty` für ein interaktives Shell-Erlebnis. Der Fallback auf `child_process` bleibt weiterhin möglich. Standardmäßig auf `false` gesetzt.

- **`tools.core`** (Array von Strings):
  - **Beschreibung:** Kann verwendet werden, um die Menge der integrierten Tools [mittels einer Allowlist](./enterprise.md#restricting-tool-access) einzuschränken. Eine Liste der Core-Tools findest du unter [Built-in Tools](../core/tools-api.md#built-in-tools). Die Matching-Logik entspricht der von `tools.allowed`.
  - **Standardwert:** `undefined`

- **`tools.exclude`** (Array von Strings):
  - **Beschreibung:** Tool-Namen, die von der Erkennung ausgeschlossen werden sollen.
  - **Standardwert:** `undefined`

- **`tools.allowed`** (Array von Strings):
  - **Beschreibung:** Liste von Tool-Namen, für die der Bestätigungsdialog übersprungen wird. Nützlich für Tools, denen du vertraust und die du häufig verwendest. Beispiel: `["run_shell_command(git)", "run_shell_command(npm test)"]` überspringt den Bestätigungsdialog beim Ausführen beliebiger `git`- und `npm test`-Befehle. Details zu Präfix-Matching, Befehlsverkettung usw. findest du unter [Shell Tool command restrictions](../tools/shell.md#command-restrictions).
  - **Standardwert:** `undefined`

- **`tools.approvalMode`** (string):
  - **Beschreibung:** Legt den Standard-Approval-Modus für die Tool-Nutzung fest. Mögliche Werte:
    - `plan`: Nur Analyse, keine Dateiänderungen oder Befehlsausführung.
    - `default`: Bestätigung erforderlich vor Dateiänderungen oder Shell-Befehlen.
    - `auto-edit`: Automatische Genehmigung von Dateiänderungen.
    - `yolo`: Automatische Genehmigung aller Tool-Aufrufe.
  - **Standardwert:** `default`

- **`tools.discoveryCommand`** (string):
  - **Beschreibung:** Befehl, der zur Tool-Erkennung ausgeführt wird.
  - **Standardwert:** `undefined`

- **`tools.callCommand`** (string):
  - **Beschreibung:** Definiert einen benutzerdefinierten Shell-Befehl zum Aufrufen eines spezifischen Tools, das über `tools.discoveryCommand` erkannt wurde. Der Shell-Befehl muss folgende Kriterien erfüllen:
    - Er muss den Funktionsnamen (exakt wie in der [Funktionsdeklaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) als erstes Kommandozeilenargument entgegennehmen.
    - Er muss Funktionsargumente als JSON von `stdin` lesen, analog zu [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Er muss die Funktionsausgabe als JSON auf `stdout` zurückgeben, analog zu [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Standardwert:** `undefined`

#### `mcp`

- **`mcp.serverCommand`** (string):
  - **Beschreibung:** Befehl zum Starten eines MCP-Servers.
  - **Standardwert:** `undefined`

- **`mcp.allowed`** (Array aus Strings):
  - **Beschreibung:** Eine Allowlist von erlaubten MCP-Servern.
  - **Standardwert:** `undefined`

- **`mcp.excluded`** (Array aus Strings):
  - **Beschreibung:** Eine Denylist von auszuschließenden MCP-Servern.
  - **Standardwert:** `undefined`

#### `security`

- **`security.folderTrust.enabled`** (boolean):
  - **Beschreibung:** Einstellung zur Aktivierung des Folder Trust.
  - **Standardwert:** `false`

- **`security.auth.selectedType`** (string):
  - **Beschreibung:** Der aktuell ausgewählte Authentifizierungstyp.
  - **Standardwert:** `undefined`

- **`security.auth.enforcedType`** (string):
  - **Beschreibung:** Der erforderliche Authentifizierungstyp (nützlich für Unternehmen).
  - **Standardwert:** `undefined`

- **`security.auth.useExternal`** (boolean):
  - **Beschreibung:** Gibt an, ob ein externer Authentifizierungsablauf verwendet werden soll.
  - **Standardwert:** `undefined`

#### `advanced`

- **`advanced.autoConfigureMemory`** (boolean):
  - **Beschreibung:** Automatische Konfiguration der Node.js Speicherlimits.
  - **Standardwert:** `false`

- **`advanced.dnsResolutionOrder`** (string):
  - **Beschreibung:** Die DNS-Auflösungsreihenfolge.
  - **Standardwert:** `undefined`

- **`advanced.excludedEnvVars`** (Array aus Strings):
  - **Beschreibung:** Umgebungsvariablen, die vom Projekt-Kontext ausgeschlossen werden sollen.
  - **Standardwert:** `["DEBUG","DEBUG_MODE"]`

- **`advanced.bugCommand`** (Objekt):
  - **Beschreibung:** Konfiguration für den Bug-Report Befehl.
  - **Standardwert:** `undefined`

- **`advanced.tavilyApiKey`** (string):
  - **Beschreibung:** API-Key für den Tavily Web-Suchdienst. Wird benötigt, um die Funktionalität des `web_search` Tools zu aktivieren. Falls nicht konfiguriert, wird das Web-Suchtool deaktiviert und übersprungen.
  - **Standardwert:** `undefined`

#### `mcpServers`

Konfiguriert Verbindungen zu einem oder mehreren Model-Context Protocol (MCP)-Servern, um benutzerdefinierte Tools zu entdecken und zu verwenden. Qwen Code versucht, sich mit jedem konfigurierten MCP-Server zu verbinden, um verfügbare Tools zu erkennen. Wenn mehrere MCP-Server ein Tool mit demselben Namen bereitstellen, werden die Tool-Namen mit dem von dir definierten Server-Alias vorangestellt (z. B. `serverAlias__actualToolName`), um Namenskonflikte zu vermeiden. Beachte, dass das System möglicherweise bestimmte Schema-Eigenschaften aus den MCP-Tool-Definitionen entfernt, um die Kompatibilität sicherzustellen. Mindestens eines der Felder `command`, `url` oder `httpUrl` muss angegeben werden. Werden mehrere Felder angegeben, gilt folgende Reihenfolge der Priorität: `httpUrl`, dann `url`, dann `command`.

- **`mcpServers.<SERVER_NAME>`** (Objekt): Die Serverparameter für den benannten Server.
  - `command` (String, optional): Der Befehl zum Starten des MCP-Servers über Standard-I/O.
  - `args` (Array von Strings, optional): Argumente, die an den Befehl übergeben werden.
  - `env` (Objekt, optional): Umgebungsvariablen, die für den Serverprozess gesetzt werden.
  - `cwd` (String, optional): Das Arbeitsverzeichnis, in dem der Server gestartet wird.
  - `url` (String, optional): Die URL eines MCP-Servers, der Server-Sent Events (SSE) zur Kommunikation verwendet.
  - `httpUrl` (String, optional): Die URL eines MCP-Servers, der streambares HTTP zur Kommunikation verwendet.
  - `headers` (Objekt, optional): Eine Map von HTTP-Headers, die bei Anfragen an `url` oder `httpUrl` gesendet werden.
  - `timeout` (Zahl, optional): Zeitlimit in Millisekunden für Anfragen an diesen MCP-Server.
  - `trust` (Boolean, optional): Dem Server vertrauen und alle Bestätigungen beim Aufruf von Tools umgehen.
  - `description` (String, optional): Eine kurze Beschreibung des Servers, die z. B. zu Anzeigezwecken verwendet werden kann.
  - `includeTools` (Array von Strings, optional): Liste der Tool-Namen, die von diesem MCP-Server verwendet werden sollen. Wenn angegeben, sind nur die hier aufgelisteten Tools dieses Servers verfügbar (Whitelist-Verhalten). Ohne Angabe sind standardmäßig alle Tools des Servers aktiviert.
  - `excludeTools` (Array von Strings, optional): Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgelisteten Tools stehen dem Modell nicht zur Verfügung, selbst wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen.

#### `telemetry`

Konfiguriert das Logging und die Metrikerfassung für Qwen Code. Weitere Informationen findest du unter [Telemetry](../telemetry.md).

- **Eigenschaften:**
  - **`enabled`** (boolean): Gibt an, ob Telemetrie aktiviert ist.
  - **`target`** (string): Das Ziel für die gesammelten Telemetriedaten. Unterstützte Werte sind `local` und `gcp`.
  - **`otlpEndpoint`** (string): Der Endpoint für den OTLP Exporter.
  - **`otlpProtocol`** (string): Das Protokoll für den OTLP Exporter (`grpc` oder `http`).
  - **`logPrompts`** (boolean): Gibt an, ob der Inhalt von User-Prompts in die Logs aufgenommen werden soll.
  - **`outfile`** (string): Die Datei, in die Telemetriedaten geschrieben werden, wenn `target` auf `local` gesetzt ist.
  - **`useCollector`** (boolean): Gibt an, ob ein externer OTLP Collector verwendet werden soll.

### Beispiel `settings.json`

Hier ist ein Beispiel für eine `settings.json` Datei mit der verschachtelten Struktur, neu ab v0.3.0:

```json
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideBanner": true,
    "hideTips": false,
    "customWittyPhrases": [
      "You forget a thousand things every day. Make sure this is one of ’em",
      "Connecting to AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 100
      }
    }
  },
  "context": {
    "fileName": ["CONTEXT.md", "QWEN.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## Shell-Historie

Die CLI speichert eine Historie der ausgeführten Shell-Befehle. Um Konflikte zwischen verschiedenen Projekten zu vermeiden, wird diese Historie in einem projektspezifischen Verzeichnis innerhalb des Home-Ordners des Benutzers gespeichert.

- **Speicherort:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` ist ein eindeutiger Identifier, der aus dem Root-Pfad deines Projekts generiert wird.
  - Die Historie wird in einer Datei mit dem Namen `shell_history` gespeichert.

## Umgebungsvariablen & `.env`-Dateien

Umgebungsvariablen sind eine gängige Methode, um Anwendungen zu konfigurieren – besonders für sensible Informationen wie API keys oder Einstellungen, die sich zwischen verschiedenen Umgebungen unterscheiden. Informationen zur Authentifizierung findest du in der [Authentifizierungsdokumentation](./authentication.md), die alle verfügbaren Authentifizierungsmethoden abdeckt.

Die CLI lädt Umgebungsvariablen automatisch aus einer `.env`-Datei. Die Ladereihenfolge ist wie folgt:

1. `.env`-Datei im aktuellen Arbeitsverzeichnis.
2. Falls nicht gefunden, sucht sie rekursiv in den übergeordneten Verzeichnissen, bis eine `.env`-Datei gefunden wird oder das Projekt-Root-Verzeichnis (erkennbar an einem `.git`-Ordner) oder das Home-Verzeichnis erreicht ist.
3. Wenn immer noch nichts gefunden wurde, wird nach `~/.env` (im Home-Verzeichnis des Benutzers) gesucht.

**Ausschluss von Umgebungsvariablen:** Einige Umgebungsvariablen (wie `DEBUG` und `DEBUG_MODE`) werden standardmäßig aus Projekt-`.env`-Dateien ausgeschlossen, um das Verhalten der CLI nicht zu beeinträchtigen. Variablen aus `.qwen/.env`-Dateien werden niemals ausgeschlossen. Du kannst dieses Verhalten über die Einstellung `advanced.excludedEnvVars` in deiner `settings.json`-Datei anpassen.

- **`OPENAI_API_KEY`**:
  - Eine von mehreren verfügbaren [Authentifizierungsmethoden](./authentication.md).
  - Setze diesen Wert in deinem Shell-Profil (z. B. `~/.bashrc`, `~/.zshrc`) oder in einer `.env`-Datei.
- **`OPENAI_BASE_URL`**:
  - Eine von mehreren verfügbaren [Authentifizierungsmethoden](./authentication.md).
  - Setze diesen Wert in deinem Shell-Profil (z. B. `~/.bashrc`, `~/.zshrc`) oder in einer `.env`-Datei.
- **`OPENAI_MODEL`**:
  - Legt das standardmäßig zu verwendende OPENAI-Modell fest.
  - Überschreibt den fest codierten Standardwert.
  - Beispiel: `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_TELEMETRY_ENABLED`**:
  - Auf `true` oder `1` setzen, um Telemetrie zu aktivieren. Jeder andere Wert deaktiviert sie.
  - Überschreibt die Einstellung `telemetry.enabled`.
- **`GEMINI_TELEMETRY_TARGET`**:
  - Legt das Ziel für die Telemetrie fest (`local` oder `gcp`).
  - Überschreibt die Einstellung `telemetry.target`.
- **`GEMINI_TELEMETRY_OTLP_ENDPOINT`**:
  - Legt den OTLP-Endpunkt für die Telemetrie fest.
  - Überschreibt die Einstellung `telemetry.otlpEndpoint`.
- **`GEMINI_TELEMETRY_OTLP_PROTOCOL`**:
  - Legt das OTLP-Protokoll fest (`grpc` oder `http`).
  - Überschreibt die Einstellung `telemetry.otlpProtocol`.
- **`GEMINI_TELEMETRY_LOG_PROMPTS`**:
  - Auf `true` oder `1` setzen, um das Logging von Benutzerprompts zu aktivieren. Jeder andere Wert deaktiviert es.
  - Überschreibt die Einstellung `telemetry.logPrompts`.
- **`GEMINI_TELEMETRY_OUTFILE`**:
  - Legt den Dateipfad fest, in den Telemetriedaten geschrieben werden, wenn das Ziel `local` ist.
  - Überschreibt die Einstellung `telemetry.outfile`.
- **`GEMINI_TELEMETRY_USE_COLLECTOR`**:
  - Auf `true` oder `1` setzen, um einen externen OTLP-Collector zu aktivieren. Jeder andere Wert deaktiviert ihn.
  - Überschreibt die Einstellung `telemetry.useCollector`.
- **`GEMINI_SANDBOX`**:
  - Alternative zur `sandbox`-Einstellung in `settings.json`.
  - Akzeptiert `true`, `false`, `docker`, `podman` oder einen benutzerdefinierten Befehl als String.
- **`SEATBELT_PROFILE`** (nur macOS):
  - Wechselt das Seatbelt- (`sandbox-exec`) Profil unter macOS.
  - `permissive-open`: (Standard) Beschränkt Schreibzugriffe auf den Projektordner (und einige andere, siehe `packages/cli/src/utils/sandbox-macos-permissive-open.sb`), erlaubt aber andere Operationen.
  - `strict`: Verwendet ein striktes Profil, das standardmäßig alle Operationen ablehnt.
  - `<profile_name>`: Verwendet ein benutzerdefiniertes Profil. Um ein solches Profil zu definieren, erstelle eine Datei namens `sandbox-macos-<profile_name>.sb` im `.qwen/`-Verzeichnis deines Projekts (z. B. `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` oder `DEBUG_MODE`** (häufig von zugrunde liegenden Bibliotheken oder der CLI selbst verwendet):
  - Auf `true` oder `1` setzen, um detailliertes Debug-Logging zu aktivieren – hilfreich bei der Fehlersuche.
  - **Hinweis:** Diese Variablen werden standardmäßig aus Projekt-`.env`-Dateien ausgeschlossen, um das CLI-Verhalten nicht zu stören. Verwende `.qwen/.env`-Dateien, wenn du diese speziell für Qwen Code setzen musst.
- **`NO_COLOR`**:
  - Auf einen beliebigen Wert setzen, um die farbige Ausgabe der CLI zu deaktivieren.
- **`CLI_TITLE`**:
  - Auf einen String setzen, um den Titel der CLI anzupassen.
- **`TAVILY_API_KEY`**:
  - Dein API key für den Tavily-Websuchdienst.
  - Erforderlich, um die Funktionalität des `web_search`-Tools zu aktivieren.
  - Wenn nicht konfiguriert, wird das Web-Suchtool deaktiviert und übersprungen.
  - Beispiel: `export TAVILY_API_KEY="tvly-your-api-key-here"`

## Command-Line Arguments

Argumente, die direkt beim Ausführen der CLI übergeben werden, können andere Konfigurationen für diese spezifische Sitzung überschreiben.

- **`--model <model_name>`** (**`-m <model_name>`**):
  - Gibt das Qwen-Modell an, das für diese Sitzung verwendet werden soll.
  - Beispiel: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - Wird verwendet, um einen Prompt direkt an den Befehl zu übergeben. Dies ruft Qwen Code im nicht-interaktiven Modus auf.
  - Für Skriptbeispiele verwende das Flag `--output-format json`, um eine strukturierte Ausgabe zu erhalten.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - Startet eine interaktive Sitzung mit dem übergebenen Prompt als initiale Eingabe.
  - Der Prompt wird innerhalb der interaktiven Sitzung verarbeitet, nicht davor.
  - Kann nicht verwendet werden, wenn Eingaben von stdin gepiped werden.
  - Beispiel: `qwen -i "explain this code"`
- **`--output-format <format>`**:
  - **Beschreibung:** Legt das Format der CLI-Ausgabe im nicht-interaktiven Modus fest.
  - **Werte:**
    - `text`: (Standard) Die normale menschenlesbare Ausgabe.
    - `json`: Eine maschinenlesbare JSON-Ausgabe.
  - **Hinweis:** Für strukturierte Ausgaben und Skripting verwende das Flag `--output-format json`.
- **`--sandbox`** (**`-s`**):
  - Aktiviert den Sandbox-Modus für diese Sitzung.
- **`--sandbox-image`**:
  - Setzt den URI des Sandbox-Images.
- **`--debug`** (**`-d`**):
  - Aktiviert den Debug-Modus für diese Sitzung und liefert eine ausführlichere Ausgabe.
- **`--all-files`** (**`-a`**):
  - Falls gesetzt, werden rekursiv alle Dateien im aktuellen Verzeichnis als Kontext für den Prompt einbezogen.
- **`--help`** (oder **`-h`**):
  - Zeigt Hilfsinformationen zu den Command-Line Arguments an.
- **`--show-memory-usage`**:
  - Zeigt den aktuellen Speicherverbrauch an.
- **`--yolo`**:
  - Aktiviert den YOLO-Modus, bei dem alle Tool-Aufrufe automatisch genehmigt werden.
- **`--approval-mode <mode>`**:
  - Legt den Genehmigungsmodus für Tool-Aufrufe fest. Unterstützte Modi:
    - `plan`: Nur Analyse – keine Dateiänderungen oder Befehlsausführungen.
    - `default`: Genehmigung für Dateiänderungen oder Shell-Befehle erforderlich (Standardverhalten).
    - `auto-edit`: Automatische Genehmigung von Edit-Tools (edit, write_file), andere Tools benötigen Bestätigung.
    - `yolo`: Automatische Genehmigung aller Tool-Aufrufe (äquivalent zu `--yolo`).
  - Kann nicht zusammen mit `--yolo` verwendet werden. Verwende stattdessen `--approval-mode=yolo` für den neuen einheitlichen Ansatz.
  - Beispiel: `qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**:
  - Eine durch Kommas getrennte Liste von Tool-Namen, die den Bestätigungsdialog umgehen.
  - Beispiel: `qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**:
  - Aktiviert [Telemetrie](../telemetry.md).
- **`--telemetry-target`**:
  - Setzt das Ziel für die Telemetrie. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--telemetry-otlp-endpoint`**:
  - Setzt den OTLP-Endpunkt für die Telemetrie. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--telemetry-otlp-protocol`**:
  - Setzt das OTLP-Protokoll für die Telemetrie (`grpc` oder `http`). Standardmäßig `grpc`. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--telemetry-log-prompts`**:
  - Aktiviert das Logging von Prompts für die Telemetrie. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--checkpointing`**:
  - Aktiviert [Checkpointing](../checkpointing.md).
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - Gibt eine Liste von Erweiterungen an, die für die Sitzung verwendet werden sollen. Falls nicht angegeben, werden alle verfügbaren Erweiterungen verwendet.
  - Verwende den speziellen Begriff `qwen -e none`, um alle Erweiterungen zu deaktivieren.
  - Beispiel: `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - Listet alle verfügbaren Erweiterungen auf und beendet sich danach.
- **`--proxy`**:
  - Setzt den Proxy für die CLI.
  - Beispiel: `--proxy http://localhost:7890`.
- **`--include-directories <dir1,dir2,...>`**:
  - Fügt zusätzliche Verzeichnisse zum Workspace hinzu, um Multi-Directory-Unterstützung zu ermöglichen.
  - Kann mehrfach oder als kommagetrennte Werte angegeben werden.
  - Maximal 5 Verzeichnisse können hinzugefügt werden.
  - Beispiel: `--include-directories /path/to/project1,/path/to/project2` oder `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`**:
  - Aktiviert den Screenreader-Modus, der das TUI für bessere Kompatibilität mit Screenreadern anpasst.
- **`--version`**:
  - Zeigt die Version der CLI an.
- **`--openai-logging`**:
  - Aktiviert das Logging von OpenAI-API-Aufrufen zur Fehlersuche und Analyse. Dieses Flag überschreibt die Einstellung `enableOpenAILogging` in der `settings.json`.
- **`--tavily-api-key <api_key>`**:
  - Setzt den Tavily-API-Key für die Web-Suchfunktion dieser Sitzung.
  - Beispiel: `qwen --tavily-api-key tvly-your-api-key-here`

## Kontextdateien (Hierarchischer Anweisungskontext)

Auch wenn es sich nicht um eine strikte Konfiguration des CLI-_Verhaltens_ handelt, sind Kontextdateien (standardmäßig `QWEN.md`, aber konfigurierbar über die Einstellung `context.fileName`) entscheidend für die Konfiguration des _Anweisungskontexts_ (auch als „Speicher“ bezeichnet). Diese leistungsstarke Funktion ermöglicht es Ihnen, projektspezifische Anweisungen, Codierungsrichtlinien oder andere relevante Hintergrundinformationen an das KI-Modell zu übergeben, wodurch die Antworten gezielter und präziser auf Ihre Bedürfnisse abgestimmt werden. Die CLI enthält UI-Elemente, wie z. B. einen Indikator in der Fußzeile, der die Anzahl der geladenen Kontextdateien anzeigt, um Sie über den aktiven Kontext zu informieren.

- **Zweck:** Diese Markdown-Dateien enthalten Anweisungen, Richtlinien oder Kontextinformationen, die dem Qwen-Modell während Ihrer Interaktionen bekannt sein sollen. Das System ist so konzipiert, dass es diesen Anweisungskontext hierarchisch verwaltet.

### Beispiel für den Inhalt einer Context-Datei (z. B. `QWEN.md`)

Hier ist ein konzeptionelles Beispiel dafür, was eine Context-Datei im Root-Verzeichnis eines TypeScript-Projekts enthalten könnte:

```markdown

# Project: My Awesome TypeScript Library

## General Instructions:

- When generating new TypeScript code, please follow the existing coding style.
- Ensure all new functions and classes have JSDoc comments.
- Prefer functional programming paradigms where appropriate.
- All code should be compatible with TypeScript 5.0 and Node.js 20+.

## Coding Style:

- Use 2 spaces for indentation.
- Interface names should be prefixed with `I` (e.g., `IUserService`).
- Private class members should be prefixed with an underscore (`_`).
- Always use strict equality (`===` and `!==`).

## Specific Component: `src/api/client.ts`

- This file handles all outbound API requests.
- When adding new API call functions, ensure they include robust error handling and logging.
- Use the existing `fetchWithRetry` utility for all GET requests.
```

## Zu den Abhängigkeiten:

- Vermeide es, neue externe Abhängigkeiten einzuführen, es sei denn, es ist unbedingt notwendig.
- Falls eine neue Abhängigkeit erforderlich ist, gib bitte den Grund dafür an.
```

Dieses Beispiel zeigt, wie du allgemeinen Projektkontext, spezifische Coding-Konventionen und sogar Hinweise zu bestimmten Dateien oder Komponenten bereitstellen kannst. Je relevanter und präziser deine Kontextdateien sind, desto besser kann die KI dir helfen. Projekt-spezifische Kontextdateien sind sehr empfohlen, um Konventionen und Kontext festzulegen.

- **Hierarchisches Laden und Priorität:** Die CLI implementiert ein ausgeklügeltes hierarchisches Speichersystem, indem sie Kontextdateien (z. B. `QWEN.md`) aus mehreren Verzeichnissen lädt. Inhalte aus Dateien weiter unten in dieser Liste (spezifischer) überschreiben oder ergänzen in der Regel Inhalte aus Dateien weiter oben (allgemeiner). Die genaue Reihenfolge der Verkettung und der finale Kontext können mit dem Befehl `/memory show` eingesehen werden. Die typische Ladereihenfolge ist:
  1.  **Globale Kontextdatei:**
      - Ort: `~/.qwen/<konfigurierter-kontext-dateiname>` (z. B. `~/.qwen/QWEN.md` in deinem Benutzerverzeichnis).
      - Geltungsbereich: Stellt Standardanweisungen für alle deine Projekte bereit.
  2.  **Projektstamm & übergeordnete Verzeichnisse:**
      - Ort: Die CLI sucht nach der konfigurierten Kontextdatei im aktuellen Arbeitsverzeichnis und dann in jedem übergeordneten Verzeichnis bis entweder zum Projektstamm (erkennbar an einem `.git`-Ordner) oder zu deinem Home-Verzeichnis.
      - Geltungsbereich: Stellt Kontext bereit, der für das gesamte Projekt oder einen großen Teil davon relevant ist.
  3.  **Unterverzeichnisse (Kontextuell/Lokal):**
      - Ort: Die CLI scannt auch nach der konfigurierten Kontextdatei in Unterverzeichnissen _unterhalb_ des aktuellen Arbeitsverzeichnisses (unter Berücksichtigung gängiger Ignoriermuster wie `node_modules`, `.git`, etc.). Die Breite dieser Suche ist standardmäßig auf 200 Verzeichnisse begrenzt, kann aber über die Einstellung `context.discoveryMaxDirs` in deiner `settings.json`-Datei konfiguriert werden.
      - Geltungsbereich: Ermöglicht hochspezifische Anweisungen, die für eine bestimmte Komponente, ein Modul oder einen Teil deines Projekts relevant sind.
- **Verkettung & UI-Anzeige:** Die Inhalte aller gefundenen Kontextdateien werden verkettet (mit Trennzeichen, die ihren Ursprung und Pfad angeben) und als Teil des Systemprompts bereitgestellt. Die CLI-Fußzeile zeigt die Anzahl der geladenen Kontextdateien an, was dir einen schnellen visuellen Hinweis auf den aktiven Anweisungskontext gibt.
- **Inhalte importieren:** Du kannst deine Kontextdateien modularisieren, indem du andere Markdown-Dateien mit der Syntax `@pfad/zu/datei.md` importierst. Weitere Details findest du in der [Dokumentation zum Memory Import Processor](../core/memport.md).
- **Befehle zur Speicherverwaltung:**
  - Verwende `/memory refresh`, um einen erneuten Scan und Reload aller Kontextdateien aus allen konfigurierten Orten zu erzwingen. Dies aktualisiert den Anweisungskontext der KI.
  - Verwende `/memory show`, um den aktuell geladenen kombinierten Anweisungskontext anzuzeigen, sodass du die Hierarchie und den von der KI verwendeten Inhalt überprüfen kannst.
  - Siehe die [Befehlsdokumentation](./commands.md#memory) für vollständige Details zum `/memory`-Befehl und seinen Unterbefehlen (`show` und `refresh`).

Durch das Verstehen und Nutzen dieser Konfigurationsebenen sowie der hierarchischen Struktur von Kontextdateien kannst du den Speicher der KI effektiv verwalten und die Antworten von Qwen Code an deine spezifischen Bedürfnisse und Projekte anpassen.

## Sandboxing

Qwen Code kann potenziell unsichere Operationen (wie Shell-Befehle und Dateiänderungen) innerhalb einer sandboxed Umgebung ausführen, um dein System zu schützen.

Sandboxing ist standardmäßig deaktiviert, aber du kannst es auf verschiedene Arten aktivieren:

- Mit dem Flag `--sandbox` oder `-s`.
- Durch Setzen der Umgebungsvariable `GEMINI_SANDBOX`.
- Sandboxing ist standardmäßig aktiviert, wenn du `--yolo` oder `--approval-mode=yolo` verwendest.

Standardmäßig wird ein vorgefertigtes Docker-Image namens `qwen-code-sandbox` verwendet.

Für projektspezifische Anforderungen kannst du ein eigenes Dockerfile unter `.qwen/sandbox.Dockerfile` im Root-Verzeichnis deines Projekts erstellen. Dieses Dockerfile kann auf dem Basis-Sandbox-Image basieren:

```dockerfile
FROM qwen-code-sandbox

# Füge hier deine eigenen Abhängigkeiten oder Konfigurationen hinzu

# Zum Beispiel:

# RUN apt-get update && apt-get install -y some-package
```

# COPY ./my-config /app/my-config
```

Wenn `.qwen/sandbox.Dockerfile` existiert, kannst du die `BUILD_SANDBOX` Umgebungsvariable verwenden, wenn du Qwen Code ausführst, um automatisch das benutzerdefinierte Sandbox-Image zu bauen:

```bash
BUILD_SANDBOX=1 qwen -s
```

## Nutzungsstatistiken

Um uns bei der Verbesserung von Qwen Code zu unterstützen, sammeln wir anonymisierte Nutzungsstatistiken. Diese Daten helfen uns zu verstehen, wie die CLI verwendet wird, häufige Probleme zu identifizieren und neue Funktionen zu priorisieren.

**Was wir sammeln:**

- **Tool-Aufrufe:** Wir protokollieren die Namen der aufgerufenen Tools, ob sie erfolgreich waren oder fehlschlugen sowie deren Ausführungszeit. Wir sammeln weder die übergebenen Argumente noch von den Tools zurückgegebene Daten.
- **API-Anfragen:** Wir protokollieren das für jede Anfrage verwendete Modell, die Dauer der Anfrage und ihren Erfolg. Die Inhalte der Prompts oder Responses werden nicht gesammelt.
- **Sitzungsinformationen:** Wir erfassen Informationen zur Konfiguration der CLI, z. B. aktivierte Tools und der Genehmigungsmodus.

**Was wir NICHT sammeln:**

- **Personenbezogene Daten (PII):** Es werden keinerlei persönliche Informationen wie Name, E-Mail-Adresse oder API-Schlüssel gesammelt.
- **Prompt- und Response-Inhalte:** Weder der Inhalt eurer Prompts noch die vom Modell generierten Responses werden protokolliert.
- **Dateiinhalte:** Der Inhalt von Dateien, die von der CLI gelesen oder geschrieben werden, wird nicht erfasst.

**So deaktivierst du die Sammlung:**

Du kannst die Sammlung von Nutzungsdaten jederzeit deaktivieren, indem du die Eigenschaft `usageStatisticsEnabled` unter der Kategorie `privacy` in deiner `settings.json`-Datei auf `false` setzt:

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

Hinweis: Wenn die Nutzungsstatistik aktiviert ist, werden Ereignisse an einen Alibaba Cloud RUM-Sammlungsendpunkt gesendet.