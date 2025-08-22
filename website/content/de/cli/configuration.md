# Qwen Code Konfiguration

Qwen Code bietet mehrere Möglichkeiten, sein Verhalten zu konfigurieren, darunter Umgebungsvariablen, Kommandozeilenargumente und Einstellungsdateien. Dieses Dokument beschreibt die verschiedenen Konfigurationsmethoden und verfügbaren Einstellungen.

## Konfigurationsebenen

Die Konfiguration wird in der folgenden Reihenfolge der Priorität angewendet (niedrigere Nummern werden von höheren überschrieben):

1.  **Standardwerte:** Fest codierte Standardwerte innerhalb der Anwendung.
2.  **Benutzereinstellungsdatei:** Globale Einstellungen für den aktuellen Benutzer.
3.  **Projekteinstellungsdatei:** Projektspezifische Einstellungen.
4.  **Systemeinstellungsdatei:** Systemweite Einstellungen.
5.  **Umgebungsvariablen:** Systemweite oder sitzungsspezifische Variablen, möglicherweise geladen aus `.env` Dateien.
6.  **Kommandozeilenargumente:** Werte, die beim Starten der CLI übergeben werden.

## Settings files

Qwen Code verwendet `settings.json` Dateien für die persistente Konfiguration. Es gibt drei Speicherorte für diese Dateien:

- **User settings file:**
  - **Location:** `~/.qwen/settings.json` (wobei `~` dein Home-Verzeichnis ist).
  - **Scope:** Gilt für alle Qwen Code Sessions des aktuellen Benutzers.
- **Project settings file:**
  - **Location:** `.qwen/settings.json` innerhalb des Root-Verzeichnisses deines Projekts.
  - **Scope:** Gilt nur, wenn Qwen Code aus diesem spezifischen Projekt heraus gestartet wird. Project settings überschreiben User settings.
- **System settings file:**
  - **Location:** `/etc/gemini-cli/settings.json` (Linux), `C:\ProgramData\gemini-cli\settings.json` (Windows) oder `/Library/Application Support/GeminiCli/settings.json` (macOS). Der Pfad kann mit der Umgebungsvariable `GEMINI_CLI_SYSTEM_SETTINGS_PATH` überschrieben werden.
  - **Scope:** Gilt für alle Qwen Code Sessions auf dem System, für alle Benutzer. System settings überschreiben User- und Project settings. Kann für Systemadministratoren in Unternehmen nützlich sein, um Kontrolle über die Qwen Code Setups der Benutzer zu haben.

**Hinweis zu Umgebungsvariablen in Settings:** String-Werte innerhalb deiner `settings.json` Dateien können Umgebungsvariablen mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren. Diese Variablen werden automatisch aufgelöst, wenn die Settings geladen werden. Wenn du z. B. eine Umgebungsvariable `MY_API_TOKEN` hast, kannst du sie in der `settings.json` so verwenden: `"apiKey": "$MY_API_TOKEN"`.

### Das `.qwen`-Verzeichnis in deinem Projekt

Neben einer Projekt-Einstellungsdatei kann das `.qwen`-Verzeichnis eines Projekts auch andere projektspezifische Dateien enthalten, die für den Betrieb von Qwen Code relevant sind, wie z. B.:

- [Benutzerdefinierte Sandbox-Profile](#sandboxing) (z. B. `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

### Verfügbare Einstellungen in `settings.json`:

- **`contextFileName`** (string oder Array von Strings):
  - **Beschreibung:** Gibt den Dateinamen für Kontextdateien an (z. B. `QWEN.md`, `AGENTS.md`). Kann ein einzelner Dateiname oder eine Liste akzeptierter Dateinamen sein.
  - **Standard:** `QWEN.md`
  - **Beispiel:** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (object):
  - **Beschreibung:** Überschreibt die Standard-URL für den `/bug`-Befehl.
  - **Standard:** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **Eigenschaften:**
    - **`urlTemplate`** (string): Eine URL, die Platzhalter `{title}` und `{info}` enthalten kann.
  - **Beispiel:**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (object):
  - **Beschreibung:** Steuert das git-basierte Dateifilterverhalten für @-Befehle und Datei-Suchwerkzeuge.
  - **Standard:** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **Eigenschaften:**
    - **`respectGitIgnore`** (boolean): Ob `.gitignore`-Muster bei der Dateierkennung berücksichtigt werden sollen. Bei `true` werden git-ignorierte Dateien (wie `node_modules/`, `dist/`, `.env`) automatisch von @-Befehlen und Dateilistenoperationen ausgeschlossen.
    - **`enableRecursiveFileSearch`** (boolean): Ob rekursive Suche nach Dateinamen unterhalb des aktuellen Verzeichnisses aktiviert werden soll, wenn @-Präfixe im Prompt vervollständigt werden.
  - **Beispiel:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`** (Array von Strings):
  - **Beschreibung:** Ermöglicht es, eine Liste von Core-Tool-Namen anzugeben, die dem Modell zur Verfügung gestellt werden sollen. Damit kann die Menge der eingebauten Tools eingeschränkt werden. Siehe [Built-in Tools](../core/tools-api.md#built-in-tools) für eine Liste der Core-Tools. Es können auch Befehlsspezifische Einschränkungen für Tools wie `ShellTool` festgelegt werden. Beispiel: `"coreTools": ["ShellTool(ls -l)"]` erlaubt nur die Ausführung von `ls -l`.
  - **Standard:** Alle Tools, die dem Modell zur Verfügung stehen.
  - **Beispiel:** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`.

- **`excludeTools`** (Array von Strings):
  - **Beschreibung:** Ermöglicht es, eine Liste von Core-Tool-Namen anzugeben, die vom Modell ausgeschlossen werden sollen. Ein Tool, das sowohl in `excludeTools` als auch in `coreTools` aufgeführt ist, wird ausgeschlossen. Es können auch Befehlsspezifische Einschränkungen für Tools wie `ShellTool` festgelegt werden. Beispiel: `"excludeTools": ["ShellTool(rm -rf)"]` blockiert den Befehl `rm -rf`.
  - **Standard:** Keine Tools ausgeschlossen.
  - **Beispiel:** `"excludeTools": ["run_shell_command", "findFiles"]`.
  - **Sicherheitshinweis:** Befehlsspezifische Einschränkungen in `excludeTools` für `run_shell_command` basieren auf einfacher Stringvergleichung und können leicht umgangen werden. Diese Funktion ist **kein Sicherheitsmechanismus** und sollte nicht verwendet werden, um das sichere Ausführen von nicht vertrauenswürdigem Code zu gewährleisten. Es wird empfohlen, `coreTools` zu verwenden, um explizit die ausführbaren Befehle auszuwählen.

- **`allowMCPServers`** (Array von Strings):
  - **Beschreibung:** Ermöglicht es, eine Liste von MCP-Servernamen anzugeben, die dem Modell zur Verfügung gestellt werden sollen. Damit kann die Menge der MCP-Server eingeschränkt werden, mit denen eine Verbindung hergestellt wird. Diese Einstellung wird ignoriert, wenn `--allowed-mcp-server-names` gesetzt ist.
  - **Standard:** Alle MCP-Server stehen dem Modell zur Verfügung.
  - **Beispiel:** `"allowMCPServers": ["myPythonServer"]`.
  - **Sicherheitshinweis:** Diese Einstellung verwendet einfache Stringvergleiche für MCP-Servernamen, die manipuliert werden können. Wenn du als Systemadministrator verhindern möchtest, dass Benutzer diese Einstellung umgehen, solltest du `mcpServers` auf Systemebene konfigurieren, sodass Benutzer keine eigenen MCP-Server konfigurieren können. Diese Funktion sollte **nicht als absoluter Sicherheitsmechanismus** betrachtet werden.

- **`excludeMCPServers`** (Array von Strings):
  - **Beschreibung:** Ermöglicht es, eine Liste von MCP-Servernamen anzugeben, die vom Modell ausgeschlossen werden sollen. Ein Server, der sowohl in `excludeMCPServers` als auch in `allowMCPServers` aufgeführt ist, wird ausgeschlossen. Diese Einstellung wird ignoriert, wenn `--allowed-mcp-server-names` gesetzt ist.
  - **Standard:** Keine MCP-Server ausgeschlossen.
  - **Beispiel:** `"excludeMCPServers": ["myNodeServer"]`.
  - **Sicherheitshinweis:** Diese Einstellung verwendet einfache Stringvergleiche für MCP-Servernamen, die manipuliert werden können. Wenn du als Systemadministrator verhindern möchtest, dass Benutzer diese Einstellung umgehen, solltest du `mcpServers` auf Systemebene konfigurieren, sodass Benutzer keine eigenen MCP-Server konfigurieren können. Diese Funktion sollte **nicht als absoluter Sicherheitsmechanismus** betrachtet werden.

- **`autoAccept`** (boolean):
  - **Beschreibung:** Legt fest, ob die CLI automatisch sichere Tool-Aufrufe (z. B. schreibgeschützte Operationen) akzeptiert und ausführt, ohne explizite Benutzerbestätigung. Bei `true` wird die Bestätigungsabfrage für als sicher eingestufte Tools übersprungen.
  - **Standard:** `false`
  - **Beispiel:** `"autoAccept": true`

- **`theme`** (string):
  - **Beschreibung:** Setzt das visuelle [Theme](./themes.md) für Qwen Code.
  - **Standard:** `"Default"`
  - **Beispiel:** `"theme": "GitHub"`

- **`vimMode`** (boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert den vim-Modus für die Eingabebearbeitung. Wenn aktiviert, unterstützt der Eingabebereich vim-ähnliche Navigation und Bearbeitungsbefehle mit NORMAL- und INSERT-Modus. Der vim-Modus-Status wird in der Fußzeile angezeigt und bleibt zwischen Sitzungen erhalten.
  - **Standard:** `false`
  - **Beispiel:** `"vimMode": true`

- **`sandbox`** (boolean oder string):
  - **Beschreibung:** Steuert, ob und wie Sandboxing für die Toolausführung verwendet wird. Bei `true` verwendet Qwen Code ein vorgefertigtes `qwen-code-sandbox` Docker-Image. Weitere Informationen findest du unter [Sandboxing](#sandboxing).
  - **Standard:** `false`
  - **Beispiel:** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (string):
  - **Beschreibung:** Definiert einen benutzerdefinierten Shell-Befehl zum Auffinden von Tools aus deinem Projekt. Der Shell-Befehl muss auf `stdout` ein JSON-Array von [Funktionsdeklarationen](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) zurückgeben. Tool-Wrapper sind optional.
  - **Standard:** Leer
  - **Beispiel:** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (string):
  - **Beschreibung:** Definiert einen benutzerdefinierten Shell-Befehl zum Aufrufen eines bestimmten Tools, das über `toolDiscoveryCommand` gefunden wurde. Der Shell-Befehl muss folgende Kriterien erfüllen:
    - Er muss den Funktionsnamen (genau wie in der [Funktionsdeklaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) als erstes Kommandozeilenargument entgegennehmen.
    - Er muss Funktionsargumente als JSON von `stdin` lesen, analog zu [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Er muss die Funktionsausgabe als JSON auf `stdout` zurückgeben, analog zu [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Standard:** Leer
  - **Beispiel:** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (object):
  - **Beschreibung:** Konfiguriert Verbindungen zu einem oder mehreren Model-Context Protocol (MCP)-Servern zum Auffinden und Verwenden benutzerdefinierter Tools. Qwen Code versucht, sich mit jedem konfigurierten MCP-Server zu verbinden, um verfügbare Tools zu erkennen. Wenn mehrere MCP-Server ein Tool mit demselben Namen bereitstellen, werden die Toolnamen mit dem Server-Alias aus der Konfiguration vorangestellt (z. B. `serverAlias__actualToolName`), um Konflikte zu vermeiden. Beachte, dass das System bestimmte Schema-Eigenschaften aus MCP-Tooldefinitionen aus Kompatibilitätsgründen entfernen kann.
  - **Standard:** Leer
  - **Eigenschaften:**
    - **`<SERVER_NAME>`** (object): Die Serverparameter für den benannten Server.
      - `command` (string, erforderlich): Der Befehl zum Starten des MCP-Servers.
      - `args` (Array von Strings, optional): Argumente, die an den Befehl übergeben werden.
      - `env` (object, optional): Umgebungsvariablen, die für den Serverprozess gesetzt werden.
      - `cwd` (string, optional): Das Arbeitsverzeichnis, in dem der Server gestartet wird.
      - `timeout` (number, optional): Zeitlimit in Millisekunden für Anfragen an diesen MCP-Server.
      - `trust` (boolean, optional): Vertraue diesem Server und umgehe alle Tool-Aufrufbestätigungen.
      - `includeTools` (Array von Strings, optional): Liste der Toolnamen, die von diesem MCP-Server verwendet werden sollen. Wenn angegeben, sind nur die hier aufgelisteten Tools vom Server verfügbar (Whitelist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.
      - `excludeTools` (Array von Strings, optional): Liste der Toolnamen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgelisteten Tools stehen dem Modell nicht zur Verfügung, auch wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen.
  - **Beispiel:**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000,
        "includeTools": ["safe_tool", "file_reader"],
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node",
        "excludeTools": ["dangerous_tool", "file_deleter"]
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      }
    }
    ```

- **`checkpointing`** (object):
  - **Beschreibung:** Konfiguriert die Checkpointing-Funktion, mit der du Gesprächs- und Dateizustände speichern und wiederherstellen kannst. Weitere Informationen findest du in der [Checkpointing-Dokumentation](../checkpointing.md).
  - **Standard:** `{"enabled": false}`
  - **Eigenschaften:**
    - **`enabled`** (boolean): Wenn `true`, ist der `/restore`-Befehl verfügbar.

- **`preferredEditor`** (string):
  - **Beschreibung:** Gibt den bevorzugten Editor zum Anzeigen von Diffs an.
  - **Standard:** `vscode`
  - **Beispiel:** `"preferredEditor": "vscode"`

- **`telemetry`** (object)
  - **Beschreibung:** Konfiguriert Logging und Metrikerfassung für Qwen Code. Weitere Informationen findest du unter [Telemetry](../telemetry.md).
  - **Standard:** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **Eigenschaften:**
    - **`enabled`** (boolean): Ob Telemetrie aktiviert ist.
    - **`target`** (string): Das Ziel für gesammelte Telemetriedaten. Unterstützte Werte sind `local` und `gcp`.
    - **`otlpEndpoint`** (string): Der Endpunkt für den OTLP Exporter.
    - **`logPrompts`** (boolean): Ob der Inhalt von Benutzerprompts in die Logs aufgenommen werden soll.
  - **Beispiel:**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```

- **`usageStatisticsEnabled`** (boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert die Erfassung von Nutzungsstatistiken. Weitere Informationen findest du unter [Usage Statistics](#usage-statistics).
  - **Standard:** `true`
  - **Beispiel:**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`** (boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert hilfreiche Tipps in der CLI-Oberfläche.
  - **Standard:** `false`
  - **Beispiel:**
    ```json
    "hideTips": true
    ```

- **`hideBanner`** (boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert das Startbanner (ASCII-Art-Logo) in der CLI-Oberfläche.
  - **Standard:** `false`
  - **Beispiel:**
    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`** (number):
  - **Beschreibung:** Legt die maximale Anzahl an Turns pro Sitzung fest. Wenn die Sitzung dieses Limit überschreitet, stoppt die CLI die Verarbeitung und startet einen neuen Chat.
  - **Standard:** `-1` (unbegrenzt)
  - **Beispiel:**
    ```json
    "maxSessionTurns": 10
    ```

- **`summarizeToolOutput`** (object):
  - **Beschreibung:** Aktiviert oder deaktiviert die Zusammenfassung der Toolausgabe. Du kannst das Token-Budget für die Zusammenfassung über die `tokenBudget`-Einstellung festlegen.
  - Hinweis: Derzeit wird nur das `run_shell_command`-Tool unterstützt.
  - **Standard:** `{}` (standardmäßig deaktiviert)
  - **Beispiel:**
    ```json
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 2000
      }
    }
    ```

- **`excludedProjectEnvVars`** (Array von Strings):
  - **Beschreibung:** Gibt Umgebungsvariablen an, die beim Laden aus Projekt-`.env`-Dateien ausgeschlossen werden sollen. Dadurch wird verhindert, dass projektspezifische Umgebungsvariablen (wie `DEBUG=true`) das CLI-Verhalten beeinträchtigen. Variablen aus `.qwen/.env`-Dateien werden nie ausgeschlossen.
  - **Standard:** `["DEBUG", "DEBUG_MODE"]`
  - **Beispiel:**
    ```json
    "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
    ``

### Beispiel `settings.json`:

```json
{
  "theme": "GitHub",
  "sandbox": "docker",
  "toolDiscoveryCommand": "bin/get_tools",
  "toolCallCommand": "bin/call_tool",
  "tavilyApiKey": "$TAVILY_API_KEY",
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
  "usageStatisticsEnabled": true,
  "hideTips": false,
  "hideBanner": false,
  "maxSessionTurns": 10,
  "summarizeToolOutput": {
    "run_shell_command": {
      "tokenBudget": 100
    }
  },
  "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"],
  "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
  "loadMemoryFromIncludeDirectories": true
}
```

## Shell History

Die CLI speichert einen Verlauf der Shell-Befehle, die du ausführst. Um Konflikte zwischen verschiedenen Projekten zu vermeiden, wird dieser Verlauf in einem projektspezifischen Verzeichnis innerhalb deines Benutzer-Home-Ordners gespeichert.

- **Speicherort:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` ist eine eindeutige Kennung, die aus dem Root-Pfad deines Projekts generiert wird.
  - Der Verlauf wird in einer Datei mit dem Namen `shell_history` gespeichert.

## Umgebungsvariablen & `.env` Dateien

Umgebungsvariablen sind eine gängige Methode, um Anwendungen zu konfigurieren – besonders für sensible Informationen wie API keys oder Einstellungen, die sich zwischen Umgebungen unterscheiden können.

Die CLI lädt Umgebungsvariablen automatisch aus einer `.env` Datei. Die Ladereihenfolge ist:

1. `.env` Datei im aktuellen Arbeitsverzeichnis.
2. Falls nicht gefunden, sucht sie rekursiv in den übergeordneten Verzeichnissen nach einer `.env` Datei, bis entweder eine gefunden wird oder das Projektverzeichnis (erkennbar an einem `.git` Ordner) oder das Home-Verzeichnis erreicht ist.
3. Wenn immer noch keine gefunden wurde, wird `~/.env` (im Home-Verzeichnis des Benutzers) geladen.

**Ausschluss von Umgebungsvariablen:** Einige Umgebungsvariablen (wie `DEBUG` und `DEBUG_MODE`) werden standardmäßig aus Projekt `.env` Dateien ausgeschlossen, um Interferenzen mit dem CLI-Verhalten zu vermeiden. Variablen aus `.qwen/.env` Dateien werden niemals ausgeschlossen. Du kannst dieses Verhalten über die Einstellung `excludedProjectEnvVars` in deiner `settings.json` Datei anpassen.

- **`GEMINI_API_KEY`** (Erforderlich):
  - Dein API key für die Gemini API.
  - **Wichtig für den Betrieb.** Ohne diesen funktioniert die CLI nicht.
  - Setze ihn in deinem Shell-Profil (z. B. `~/.bashrc`, `~/.zshrc`) oder in einer `.env` Datei.
- **`GEMINI_MODEL`**:
  - Legt das Standard-Gemini-Modell fest.
  - Überschreibt den fest codierten Standardwert.
  - Beispiel: `export GEMINI_MODEL="gemini-2.5-flash"`
- **`GOOGLE_API_KEY`**:
  - Dein Google Cloud API key.
  - Erforderlich für die Nutzung von Vertex AI im Express-Modus.
  - Stelle sicher, dass du die nötigen Berechtigungen hast.
  - Beispiel: `export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"`.
- **`GOOGLE_CLOUD_PROJECT`**:
  - Deine Google Cloud Project ID.
  - Erforderlich für die Nutzung von Code Assist oder Vertex AI.
  - Bei Verwendung von Vertex AI stelle sicher, dass du die notwendigen Berechtigungen in diesem Projekt besitzt.
  - **Cloud Shell Hinweis:** In einer Cloud Shell Umgebung wird diese Variable standardmäßig auf ein spezielles Projekt gesetzt, das für Cloud Shell Nutzer bereitgestellt wird. Wenn du `GOOGLE_CLOUD_PROJECT` bereits global in deiner Cloud Shell-Umgebung gesetzt hast, wird es durch diesen Standardwert überschrieben. Um ein anderes Projekt in Cloud Shell zu verwenden, musst du `GOOGLE_CLOUD_PROJECT` in einer `.env` Datei definieren.
  - Beispiel: `export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_APPLICATION_CREDENTIALS`** (string):
  - **Beschreibung:** Der Pfad zu deiner Google Application Credentials JSON-Datei.
  - **Beispiel:** `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/credentials.json"`
- **`OTLP_GOOGLE_CLOUD_PROJECT`**:
  - Deine Google Cloud Project ID für Telemetrie in Google Cloud.
  - Beispiel: `export OTLP_GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_CLOUD_LOCATION`**:
  - Dein Google Cloud Projektstandort (z. B. us-central1).
  - Erforderlich für die Nutzung von Vertex AI im Nicht-Express-Modus.
  - Beispiel: `export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"`.
- **`GEMINI_SANDBOX`**:
  - Alternative zur `sandbox` Einstellung in `settings.json`.
  - Akzeptiert `true`, `false`, `docker`, `podman` oder einen benutzerdefinierten Befehl als String.
- **`SEATBELT_PROFILE`** (macOS-spezifisch):
  - Wechselt das Seatbelt (`sandbox-exec`) Profil unter macOS.
  - `permissive-open`: (Standard) Beschränkt Schreibzugriffe auf den Projektordner (und einige andere, siehe `packages/cli/src/utils/sandbox-macos-permissive-open.sb`), erlaubt aber andere Operationen.
  - `strict`: Nutzt ein striktes Profil, das standardmäßig alle Operationen ablehnt.
  - `<profile_name>`: Nutzt ein benutzerdefiniertes Profil. Um ein solches zu definieren, erstelle eine Datei namens `sandbox-macos-<profile_name>.sb` im `.qwen/` Verzeichnis deines Projekts (z. B. `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` oder `DEBUG_MODE`** (häufig von zugrunde liegenden Bibliotheken oder der CLI selbst verwendet):
  - Auf `true` oder `1` setzen, um detaillierte Debug-Logs zu aktivieren – hilfreich bei der Fehlersuche.
  - **Hinweis:** Diese Variablen werden standardmäßig aus Projekt `.env` Dateien ausgeschlossen, um Interferenzen mit dem CLI-Verhalten zu vermeiden. Verwende `.qwen/.env` Dateien, wenn du diese speziell für Qwen Code setzen musst.
- **`NO_COLOR`**:
  - Auf einen beliebigen Wert setzen, um alle Farbausgaben der CLI zu deaktivieren.
- **`CLI_TITLE`**:
  - Auf einen String setzen, um den Titel der CLI anzupassen.
- **`CODE_ASSIST_ENDPOINT`**:
  - Gibt den Endpunkt des Code Assist Servers an.
  - Nützlich für Entwicklung und Tests.
- **`TAVILY_API_KEY`**:
  - Dein API key für den Tavily Web-Suchdienst.
  - Erforderlich, um die `web_search` Tool-Funktionalität zu aktivieren.
  - Wenn nicht konfiguriert, wird das Web-Suchtool deaktiviert und übersprungen.
  - Beispiel: `export TAVILY_API_KEY="tvly-your-api-key-here"`

## Command-Line Arguments

Argumente, die direkt beim Ausführen des CLI übergeben werden, können andere Konfigurationen für diese spezifische Sitzung überschreiben.

- **`--model <model_name>`** (**`-m <model_name>`**):
  - Gibt das Gemini-Modell an, das für diese Sitzung verwendet werden soll.
  - Beispiel: `npm start -- --model gemini-1.5-pro-latest`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - Wird verwendet, um einen Prompt direkt an den Befehl zu übergeben. Dies ruft Qwen Code im nicht-interaktiven Modus auf.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - Startet eine interaktive Sitzung mit dem übergebenen Prompt als initiale Eingabe.
  - Der Prompt wird innerhalb der interaktiven Sitzung verarbeitet, nicht davor.
  - Kann nicht verwendet werden, wenn Eingaben von stdin gepiped werden.
  - Beispiel: `qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - Aktiviert den Sandbox-Modus für diese Sitzung.
- **`--sandbox-image`**:
  - Legt die URI des Sandbox-Images fest.
- **`--debug`** (**`-d`**):
  - Aktiviert den Debug-Modus für diese Sitzung und gibt detailliertere Ausgaben aus.
- **`--all-files`** (**`-a`**):
  - Falls gesetzt, werden rekursiv alle Dateien im aktuellen Verzeichnis als Kontext für den Prompt einbezogen.
- **`--help`** (oder **`-h`**):
  - Zeigt Hilfsinformationen zu den Command-Line Arguments an.
- **`--show-memory-usage`**:
  - Zeigt den aktuellen Speicherverbrauch an.
- **`--yolo`**:
  - Aktiviert den YOLO-Modus, bei dem alle Tool-Aufrufe automatisch genehmigt werden.
- **`--telemetry`**:
  - Aktiviert [Telemetrie](../telemetry.md).
- **`--telemetry-target`**:
  - Legt das Telemetrie-Ziel fest. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--telemetry-otlp-endpoint`**:
  - Legt den OTLP-Endpunkt für die Telemetrie fest. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--telemetry-log-prompts`**:
  - Aktiviert das Logging von Prompts für die Telemetrie. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--checkpointing`**:
  - Aktiviert [Checkpointing](../checkpointing.md).
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - Gibt eine Liste von Erweiterungen an, die für die Sitzung verwendet werden sollen. Falls nicht angegeben, werden alle verfügbaren Erweiterungen verwendet.
  - Verwende den speziellen Begriff `qwen -e none`, um alle Erweiterungen zu deaktivieren.
  - Beispiel: `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - Listet alle verfügbaren Erweiterungen auf und beendet sich anschließend.
- **`--proxy`**:
  - Legt den Proxy für das CLI fest.
  - Beispiel: `--proxy http://localhost:7890`.
- **`--include-directories <dir1,dir2,...>`**:
  - Fügt zusätzliche Verzeichnisse zum Workspace hinzu, um Multi-Directory-Support zu ermöglichen.
  - Kann mehrfach oder als kommagetrennte Werte angegeben werden.
  - Maximal 5 Verzeichnisse können hinzugefügt werden.
  - Beispiel: `--include-directories /path/to/project1,/path/to/project2` oder `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--version`**:
  - Zeigt die Version des CLI an.
- **`--openai-logging`**:
  - Aktiviert das Logging von OpenAI-API-Aufrufen zur Fehlersuche und Analyse. Dieses Flag überschreibt die Einstellung `enableOpenAILogging` in der `settings.json`.
- **`--tavily-api-key <api_key>`**:
  - Legt den Tavily-API-Schlüssel für die Web-Suchfunktion dieser Sitzung fest.
  - Beispiel: `qwen --tavily-api-key tvly-your-api-key-here`

## Context Files (Hierarchischer Instruktionskontext)

Auch wenn es sich nicht um eine strikte Konfiguration des CLI-_Verhaltens_ handelt, sind Context Files (standardmäßig `QWEN.md`, aber konfigurierbar über die Einstellung `contextFileName`) entscheidend für die Konfiguration des _Instruktionskontexts_ (auch als "Memory" bezeichnet). Diese leistungsstarke Funktion ermöglicht es dir, projektspezifische Anweisungen, Coding-Standards oder andere relevante Hintergrundinformationen an die KI zu übermitteln, wodurch die Antworten gezielter und präziser auf deine Anforderungen abgestimmt werden. Die CLI enthält UI-Elemente, wie z. B. einen Indikator in der Fußzeile, der die Anzahl der geladenen Context Files anzeigt, um dich über den aktiven Kontext zu informieren.

- **Zweck:** Diese Markdown-Dateien enthalten Anweisungen, Richtlinien oder Kontextinformationen, die du möchtest, dass das Gemini-Modell während eurer Interaktionen berücksichtigt. Das System ist so konzipiert, dass es diesen Instruktionskontext hierarchisch verwaltet.

### Beispiel für den Inhalt einer Context-Datei (z. B. `QWEN.md`)

Hier ist ein konzeptionelles Beispiel dafür, was eine Context-Datei im Stammverzeichnis eines TypeScript-Projekts enthalten könnte:

```markdown

# Project: My Awesome TypeScript Library

## Allgemeine Anweisungen:

- Wenn du neuen TypeScript-Code generierst, halte dich bitte an den bestehenden Codierungsstil.
- Stelle sicher, dass alle neuen Funktionen und Klassen über JSDoc-Kommentare verfügen.
- Bevorzuge funktionale Programmierparadigmen, wo immer es sinnvoll ist.
- Der gesamte Code sollte mit TypeScript 5.0 und Node.js 20+ kompatibel sein.

## Codierungsstil:

- Verwende 2 Leerzeichen für die Einrückung.
- Interface-Namen sollten mit `I` beginnen (z. B. `IUserService`).
- Private Klassenmember sollten mit einem Unterstrich (`_`) beginnen.
- Verwende immer strikte Gleichheit (`===` und `!==`).

## Spezifische Komponente: `src/api/client.ts`

- Diese Datei behandelt alle ausgehenden API-Anfragen.
- Wenn du neue API-Aufruffunktionen hinzufügst, stelle sicher, dass diese eine robuste Fehlerbehandlung und Protokollierung enthalten.
- Verwende das vorhandene `fetchWithRetry`-Utility für alle GET-Anfragen.

## Zu den Abhängigkeiten:

- Vermeide es, neue externe Abhängigkeiten einzuführen, es sei denn, es ist unbedingt notwendig.
- Falls eine neue Abhängigkeit erforderlich ist, gib bitte den Grund dafür an.
```

Dieses Beispiel zeigt, wie du allgemeinen Projektkontext, spezifische Coding-Konventionen und sogar Hinweise zu bestimmten Dateien oder Komponenten bereitstellen kannst. Je relevanter und präziser deine Kontextdateien sind, desto besser kann die KI dich unterstützen. Projekt-spezifische Kontextdateien sind sehr empfohlen, um Konventionen und Kontext festzulegen.

- **Hierarchisches Laden und Priorität:** Die CLI implementiert ein ausgeklügeltes hierarchisches Speichersystem, indem sie Kontextdateien (z. B. `QWEN.md`) aus mehreren Verzeichnissen lädt. Inhalte aus Dateien weiter unten in dieser Liste (spezifischer) überschreiben oder ergänzen in der Regel Inhalte aus Dateien weiter oben (allgemeiner). Die genaue Reihenfolge der Verkettung und der finale Kontext können mit dem Befehl `/memory show` eingesehen werden. Die typische Ladereihenfolge ist:
  1.  **Globale Kontextdatei:**
      - Ort: `~/.qwen/<contextFileName>` (z. B. `~/.qwen/QWEN.md` in deinem Benutzer-Home-Verzeichnis).
      - Geltungsbereich: Stellt Standardanweisungen für alle deine Projekte bereit.
  2.  **Projekt-Hauptverzeichnis & übergeordnete Verzeichnisse:**
      - Ort: Die CLI sucht nach der konfigurierten Kontextdatei im aktuellen Arbeitsverzeichnis und danach in jedem übergeordneten Verzeichnis bis entweder zum Projektstamm (erkennbar an einem `.git`-Ordner) oder zu deinem Home-Verzeichnis.
      - Geltungsbereich: Stellt Kontext bereit, der für das gesamte Projekt oder einen großen Teil davon relevant ist.
  3.  **Unterverzeichnis-Kontextdateien (kontextuell/lokal):**
      - Ort: Die CLI scannt auch nach der konfigurierten Kontextdatei in Unterverzeichnissen _unterhalb_ des aktuellen Arbeitsverzeichnisses (unter Beachtung gängiger Ignoriermuster wie `node_modules`, `.git`, etc.). Die Breite dieser Suche ist standardmäßig auf 200 Verzeichnisse begrenzt, kann aber über das Feld `memoryDiscoveryMaxDirs` in deiner `settings.json`-Datei konfiguriert werden.
      - Geltungsbereich: Ermöglicht hochspezifische Anweisungen, die für eine bestimmte Komponente, ein Modul oder einen Abschnitt deines Projekts relevant sind.
- **Verkettung & UI-Anzeige:** Die Inhalte aller gefundenen Kontextdateien werden verkettet (mit Trennzeichen, die ihren Ursprung und Pfad angeben) und als Teil des Systemprompts bereitgestellt. In der CLI-Fußzeile wird die Anzahl der geladenen Kontextdateien angezeigt, was dir einen schnellen visuellen Hinweis auf den aktiven Anweisungskontext gibt.
- **Inhalte importieren:** Du kannst deine Kontextdateien modularisieren, indem du andere Markdown-Dateien mit der Syntax `@path/to/file.md` importierst. Weitere Details findest du in der [Dokumentation zum Memory Import Processor](../core/memport.md).
- **Befehle zur Speicherverwaltung:**
  - Nutze `/memory refresh`, um einen erneuten Scan und Reload aller Kontextdateien von allen konfigurierten Orten zu erzwingen. Dies aktualisiert den Anweisungskontext der KI.
  - Nutze `/memory show`, um den aktuell geladenen kombinierten Anweisungskontext anzuzeigen, sodass du die Hierarchie und den von der KI verwendeten Inhalt überprüfen kannst.
  - Die vollständigen Details zum `/memory`-Befehl und seinen Unterbefehlen (`show` und `refresh`) findest du in der [Befehlsdokumentation](./commands.md#memory).

Durch das Verstehen und Nutzen dieser Konfigurationsebenen sowie der hierarchischen Struktur von Kontextdateien kannst du den Speicher der KI effektiv verwalten und die Antworten von Qwen Code an deine spezifischen Bedürfnisse und Projekte anpassen.

## Sandboxing

Qwen Code kann potenziell unsichere Operationen (wie Shell-Befehle und Dateiänderungen) innerhalb einer sandboxed Umgebung ausführen, um dein System zu schützen.

Sandboxing ist standardmäßig deaktiviert, aber du kannst es auf verschiedene Arten aktivieren:

- Mit dem Flag `--sandbox` oder `-s`.
- Durch Setzen der Umgebungsvariable `GEMINI_SANDBOX`.
- Im `--yolo`-Modus ist Sandboxing standardmäßig aktiviert.

Standardmäßig wird ein vorgefertigtes Docker-Image namens `qwen-code-sandbox` verwendet.

Für projektspezifische Anforderungen kannst du ein eigenes Dockerfile unter `.qwen/sandbox.Dockerfile` im Root-Verzeichnis deines Projekts anlegen. Dieses Dockerfile kann auf dem Basis-Sandbox-Image aufbauen:

```dockerfile
FROM qwen-code-sandbox

# Hier kannst du eigene Abhängigkeiten oder Konfigurationen hinzufügen

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

Um uns bei der Verbesserung von Qwen Code zu helfen, sammeln wir anonymisierte Nutzungsstatistiken. Diese Daten helfen uns zu verstehen, wie die CLI verwendet wird, häufige Probleme zu identifizieren und neue Funktionen zu priorisieren.

**Was wir sammeln:**

- **Tool-Aufrufe:** Wir protokollieren die Namen der Tools, die aufgerufen werden, ob sie erfolgreich sind oder fehlschlagen, und wie lange ihre Ausführung dauert. Wir sammeln keine Argumente, die an die Tools übergeben werden, noch Daten, die von ihnen zurückgegeben werden.
- **API-Anfragen:** Wir protokollieren das für jede Anfrage verwendete Modell, die Dauer der Anfrage und ob sie erfolgreich war. Wir sammeln nicht den Inhalt der Prompts oder Responses.
- **Sitzungsinformationen:** Wir sammeln Informationen zur Konfiguration der CLI, wie z. B. die aktivierten Tools und der Genehmigungsmodus.

**Was wir NICHT sammeln:**

- **Personenbezogene Daten (PII):** Wir sammeln keine persönlichen Informationen wie Ihren Namen, Ihre E-Mail-Adresse oder API-Keys.
- **Prompt- und Response-Inhalte:** Wir protokollieren nicht den Inhalt Ihrer Prompts oder die Antworten des Modells.
- **Dateiinhalte:** Wir protokollieren nicht den Inhalt von Dateien, die von der CLI gelesen oder geschrieben werden.

**So deaktivieren Sie die Sammlung:**

Sie können die Sammlung von Nutzungsstatistiken jederzeit deaktivieren, indem Sie die Eigenschaft `usageStatisticsEnabled` in Ihrer `settings.json`-Datei auf `false` setzen:

```json
{
  "usageStatisticsEnabled": false
}
```

Hinweis: Wenn die Nutzungsstatistiken aktiviert sind, werden Ereignisse an einen Alibaba Cloud RUM-Sammlungsendpunkt gesendet.