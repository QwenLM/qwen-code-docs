# Qwen Code Konfiguration

Qwen Code bietet mehrere Möglichkeiten, um sein Verhalten zu konfigurieren, darunter Umgebungsvariablen, Kommandozeilenargumente und Einstellungsdateien. Dieses Dokument beschreibt die verschiedenen Konfigurationsmethoden und verfügbaren Einstellungen.

## Konfigurationsebenen

Die Konfiguration wird in der folgenden Reihenfolge der Priorität angewendet (niedrigere Nummern werden von höheren überschrieben):

1.  **Standardwerte:** Fest codierte Standardwerte innerhalb der Anwendung.
2.  **Benutzereinstellungsdatei:** Globale Einstellungen für den aktuellen Benutzer.
3.  **Projekteinstellungsdatei:** Projektspezifische Einstellungen.
4.  **Systemeinstellungsdatei:** Systemweite Einstellungen.
5.  **Umgebungsvariablen:** Systemweite oder sitzungsspezifische Variablen, möglicherweise geladen aus `.env` Dateien.
6.  **Kommandozeilenargumente:** Werte, die beim Starten der CLI übergeben werden.

## Settings-Dateien

Qwen Code verwendet `settings.json` Dateien für die persistente Konfiguration. Es gibt drei Speicherorte für diese Dateien:

- **User Settings-Datei:**
  - **Speicherort:** `~/.qwen/settings.json` (wobei `~` dein Home-Verzeichnis ist).
  - **Gültigkeitsbereich:** Gilt für alle Qwen Code Sessions des aktuellen Benutzers.
- **Project Settings-Datei:**
  - **Speicherort:** `.qwen/settings.json` im Root-Verzeichnis deines Projekts.
  - **Gültigkeitsbereich:** Gilt nur, wenn Qwen Code aus diesem spezifischen Projekt heraus gestartet wird. Project Settings überschreiben User Settings.

- **System Settings-Datei:**
  - **Speicherort:** `/etc/qwen-code/settings.json` (Linux), `C:\ProgramData\qwen-code\settings.json` (Windows) oder `/Library/Application Support/QwenCode/settings.json` (macOS). Der Pfad kann mit der Umgebungsvariable `QWEN_CODE_SYSTEM_SETTINGS_PATH` überschrieben werden.
  - **Gültigkeitsbereich:** Gilt für alle Qwen Code Sessions auf dem System, für alle Benutzer. System Settings überschreiben User und Project Settings. Kann für Systemadministratoren in Unternehmen nützlich sein, um Kontrolle über die Qwen Code Einrichtungen der Benutzer zu haben.

**Hinweis zu Umgebungsvariablen in Settings:** String-Werte innerhalb deiner `settings.json` Dateien können Umgebungsvariablen mit der Syntax `$VAR_NAME` oder `${VAR_NAME}` referenzieren. Diese Variablen werden automatisch aufgelöst, wenn die Settings geladen werden. Wenn du zum Beispiel eine Umgebungsvariable `MY_API_TOKEN` hast, kannst du sie in der `settings.json` so verwenden: `"apiKey": "$MY_API_TOKEN"`.

### Das `.qwen`-Verzeichnis in deinem Projekt

Neben einer Projekt-Einstellungsdatei kann das `.qwen`-Verzeichnis eines Projekts auch andere projektspezifische Dateien enthalten, die für den Betrieb von Qwen Code relevant sind, wie z. B.:

- [Benutzerdefinierte Sandbox-Profile](#sandboxing) (z. B. `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

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
    - **`respectGitIgnore`** (boolean): Ob `.gitignore`-Muster bei der Dateierkennung berücksichtigt werden sollen. Bei `true` werden git-ignorierte Dateien (wie `node_modules/`, `dist/`, `.env`) automatisch von @-Befehlen und Dateilisten ausgeschlossen.
    - **`enableRecursiveFileSearch`** (boolean): Ob rekursive Suche nach Dateinamen unterhalb des aktuellen Verzeichnisses aktiviert ist, wenn @-Präfixe im Prompt vervollständigt werden.
  - **Beispiel:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`** (Array von Strings):
  - **Beschreibung:** Ermöglicht es, eine Liste von Core-Tool-Namen anzugeben, die dem Modell zur Verfügung gestellt werden sollen. Damit kann die Menge der eingebauten Tools eingeschränkt werden. Siehe [Built-in Tools](../core/tools-api.md#built-in-tools) für eine Liste der Core-Tools. Es können auch Tool-spezifische Einschränkungen für Tools wie `ShellTool` festgelegt werden. Beispiel: `"coreTools": ["ShellTool(ls -l)"]` erlaubt nur den Befehl `ls -l`.
  - **Standard:** Alle Tools sind standardmäßig verfügbar.
  - **Beispiel:** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`.

- **`excludeTools`** (Array von Strings):
  - **Beschreibung:** Ermöglicht es, eine Liste von Core-Tool-Namen anzugeben, die vom Modell ausgeschlossen werden sollen. Ein Tool, das sowohl in `excludeTools` als auch in `coreTools` aufgeführt ist, wird ausgeschlossen. Es können auch Tool-spezifische Einschränkungen wie bei `ShellTool` festgelegt werden. Beispiel: `"excludeTools": ["ShellTool(rm -rf)"]` blockiert den Befehl `rm -rf`.
  - **Standard:** Keine Tools ausgeschlossen.
  - **Beispiel:** `"excludeTools": ["run_shell_command", "findFiles"]`.
  - **Sicherheitshinweis:** Die Einschränkungen in `excludeTools` basieren auf einfacher Stringvergleichung und können leicht umgangen werden. Diese Funktion ist **kein Sicherheitsmechanismus** und sollte nicht verwendet werden, um das sichere Ausführen von nicht vertrauenswürdigem Code zu gewährleisten. Es wird empfohlen, `coreTools` zu verwenden, um explizit erlaubte Befehle auszuwählen.

- **`allowMCPServers`** (Array von Strings):
  - **Beschreibung:** Ermöglicht es, eine Liste von MCP-Servernamen anzugeben, die dem Modell zur Verfügung gestellt werden sollen. Damit kann die Menge der verfügbaren MCP-Server eingeschränkt werden. Diese Einstellung wird ignoriert, wenn `--allowed-mcp-server-names` gesetzt ist.
  - **Standard:** Alle MCP-Server sind standardmäßig verfügbar.
  - **Beispiel:** `"allowMCPServers": ["myPythonServer"]`.
  - **Sicherheitshinweis:** Diese Funktion verwendet einfache Stringvergleiche auf Servernamen, die manipuliert werden können. Systemadministratoren sollten ggf. die `mcpServers` auf Systemebene konfigurieren, um zu verhindern, dass Benutzer eigene Server konfigurieren. Diese Funktion sollte **nicht als sicherer Mechanismus** betrachtet werden.

- **`excludeMCPServers`** (Array von Strings):
  - **Beschreibung:** Ermöglicht es, eine Liste von MCP-Servernamen anzugeben, die vom Modell ausgeschlossen werden sollen. Ein Server, der sowohl in `excludeMCPServers` als auch in `allowMCPServers` aufgeführt ist, wird ausgeschlossen. Diese Einstellung wird ignoriert, wenn `--allowed-mcp-server-names` gesetzt ist.
  - **Standard:** Keine MCP-Server ausgeschlossen.
  - **Beispiel:** `"excludeMCPServers": ["myNodeServer"]`.
  - **Sicherheitshinweis:** Diese Funktion verwendet einfache Stringvergleiche auf Servernamen, die manipuliert werden können. Systemadministratoren sollten ggf. die `mcpServers` auf Systemebene konfigurieren, um zu verhindern, dass Benutzer eigene Server konfigurieren. Diese Funktion sollte **nicht als sicherer Mechanismus** betrachtet werden.

- **`autoAccept`** (boolean):
  - **Beschreibung:** Legt fest, ob die CLI Tool-Aufrufe, die als sicher gelten (z. B. read-only-Operationen), automatisch akzeptiert und ausgeführt werden, ohne explizite Benutzerbestätigung. Bei `true` wird die Bestätigungsabfrage für sichere Tools übersprungen.
  - **Standard:** `false`
  - **Beispiel:** `"autoAccept": true`

- **`theme`** (string):
  - **Beschreibung:** Setzt das visuelle [Theme](./themes.md) für Qwen Code.
  - **Standard:** `"Default"`
  - **Beispiel:** `"theme": "GitHub"`

- **`vimMode`** (boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert den Vim-Modus für die Eingabebearbeitung. Im aktivierten Zustand unterstützt der Eingabebereich Vim-Befehle mit NORMAL- und INSERT-Modus. Der Status wird in der Fußzeile angezeigt und bleibt zwischen Sitzungen erhalten.
  - **Standard:** `false`
  - **Beispiel:** `"vimMode": true`

- **`sandbox`** (boolean oder string):
  - **Beschreibung:** Steuert, ob und wie Sandboxing für Toolausführung verwendet wird. Bei `true` verwendet Qwen Code das vorgefertigte Docker-Image `qwen-code-sandbox`. Weitere Informationen unter [Sandboxing](#sandboxing).
  - **Standard:** `false`
  - **Beispiel:** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (string):
  - **Beschreibung:** Definiert einen benutzerdefinierten Shell-Befehl zur Erkennung von Tools aus dem Projekt. Der Befehl muss auf `stdout` ein JSON-Array von [Function Declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) zurückgeben. Tool-Wrappers sind optional.
  - **Standard:** Leer
  - **Beispiel:** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (string):
  - **Beschreibung:** Definiert einen benutzerdefinierten Shell-Befehl zum Aufrufen eines bestimmten Tools, das über `toolDiscoveryCommand` gefunden wurde. Der Befehl muss folgende Kriterien erfüllen:
    - Der erste Parameter muss der Funktionsname sein (genau wie in der [Function Declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)).
    - Die Funktionsargumente müssen als JSON über `stdin` gelesen werden (analog zu [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall)).
    - Die Funktionsausgabe muss als JSON über `stdout` zurückgegeben werden (analog zu [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse)).
  - **Standard:** Leer
  - **Beispiel:** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (object):
  - **Beschreibung:** Konfiguriert Verbindungen zu einem oder mehreren Model-Context Protocol (MCP)-Servern zur Erkennung und Nutzung benutzerdefinierter Tools. Qwen Code versucht, sich mit jedem konfigurierten MCP-Server zu verbinden, um verfügbare Tools zu erkennen. Wenn mehrere Server ein Tool mit demselben Namen anbieten, wird der Name mit dem Server-Alias vorangestellt (z. B. `serverAlias__actualToolName`), um Konflikte zu vermeiden. Das System kann bestimmte Schema-Eigenschaften aus MCP-Tooldefinitionen entfernen, um Kompatibilität zu gewährleisten. Mindestens eines der Felder `command`, `url` oder `httpUrl` muss angegeben werden. Die Priorität ist: `httpUrl`, dann `url`, dann `command`.
  - **Standard:** Leer
  - **Eigenschaften:**
    - **`<SERVER_NAME>`** (object): Die Serverparameter für den benannten Server.
      - `command` (string, optional): Der Befehl zum Starten des MCP-Servers über Standard-I/O.
      - `args` (Array von Strings, optional): Argumente für den Befehl.
      - `env` (object, optional): Umgebungsvariablen für den Serverprozess.
      - `cwd` (string, optional): Arbeitsverzeichnis zum Starten des Servers.
      - `url` (string, optional): URL eines MCP-Servers, der Server-Sent Events (SSE) verwendet.
      - `httpUrl` (string, optional): URL eines MCP-Servers, der streambare HTTP-Kommunikation verwendet.
      - `headers` (object, optional): HTTP-Header, die mit Anfragen an `url` oder `httpUrl` gesendet werden.
      - `timeout` (number, optional): Zeitlimit in Millisekunden für Anfragen an diesen MCP-Server.
      - `trust` (boolean, optional): Vertraue diesem Server und umgehe alle Tool-Bestätigungen.
      - `description` (string, optional): Kurze Beschreibung des Servers, z. B. für Anzeigezwecke.
      - `includeTools` (Array von Strings, optional): Liste der Tool-Namen, die von diesem Server verwendet werden sollen. Wenn angegeben, sind nur diese Tools verfügbar (Whitelist). Andernfalls sind alle Tools standardmäßig aktiviert.
      - `excludeTools` (Array von Strings, optional): Liste der Tool-Namen, die von diesem Server ausgeschlossen werden sollen. Diese Tools sind dann nicht verfügbar, auch wenn sie vom Server angeboten werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen.
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
      },
      "mySseServer": {
        "url": "http://localhost:8081/events",
        "headers": {
          "Authorization": "Bearer $MY_SSE_TOKEN"
        },
        "description": "Ein Beispiel-SSE-basierter MCP-Server."
      },
      "myStreamableHttpServer": {
        "httpUrl": "http://localhost:8082/stream",
        "headers": {
          "X-API-Key": "$MY_HTTP_API_KEY"
        },
        "description": "Ein Beispiel-Streamable-HTTP-basierter MCP-Server."
      }
    }
    ```

- **`checkpointing`** (object):
  - **Beschreibung:** Konfiguriert die Checkpointing-Funktion, mit der Konversations- und Dateizustände gespeichert und wiederhergestellt werden können. Weitere Informationen unter [Checkpointing documentation](../checkpointing.md).
  - **Standard:** `{"enabled": false}`
  - **Eigenschaften:**
    - **`enabled`** (boolean): Bei `true` ist der `/restore`-Befehl verfügbar.

- **`preferredEditor`** (string):
  - **Beschreibung:** Gibt den bevorzugten Editor zum Anzeigen von Diffs an.
  - **Standard:** `vscode`
  - **Beispiel:** `"preferredEditor": "vscode"`

- **`telemetry`** (object)
  - **Beschreibung:** Konfiguriert das Logging und die Erfassung von Metriken für Qwen Code. Weitere Informationen unter [Telemetry](../telemetry.md).
  - **Standard:** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **Eigenschaften:**
    - **`enabled`** (boolean): Ob Telemetrie aktiviert ist.
    - **`target`** (string): Ziel für gesammelte Telemetriedaten. Unterstützte Werte: `local` und `gcp`.
    - **`otlpEndpoint`** (string): Endpunkt für den OTLP Exporter.
    - **`logPrompts`** (boolean): Ob der Inhalt von Benutzerprompts in Logs enthalten sein soll.
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
  - **Beschreibung:** Aktiviert oder deaktiviert die Erfassung von Nutzungsstatistiken. Weitere Informationen unter [Usage Statistics](#usage-statistics).
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
  - **Beschreibung:** Legt die maximale Anzahl von Turns pro Sitzung fest. Wenn das Limit überschritten wird, stoppt die CLI und startet einen neuen Chat.
  - **Standard:** `-1` (unbegrenzt)
  - **Beispiel:**
    ```json
    "maxSessionTurns": 10
    ```

- **`summarizeToolOutput`** (object):
  - **Beschreibung:** Aktiviert oder deaktiviert die Zusammenfassung von Toolausgaben. Mit der Einstellung `tokenBudget` kann das Token-Budget für die Zusammenfassung festgelegt werden.
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
  - **Beschreibung:** Gibt Umgebungsvariablen an, die aus Projekt-`.env`-Dateien ausgeschlossen werden sollen. Dies verhindert, dass projektspezifische

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

Umgebungsvariablen sind eine gängige Methode, um Anwendungen zu konfigurieren – besonders für sensible Informationen wie API keys oder Einstellungen, die sich zwischen verschiedenen Umgebungen unterscheiden. Informationen zur Authentifizierung findest du in der [Authentication Dokumentation](./authentication.md), die alle verfügbaren Authentifizierungsmethoden abdeckt.

Die CLI lädt Umgebungsvariablen automatisch aus einer `.env` Datei. Die Ladereihenfolge ist:

1. `.env` Datei im aktuellen Arbeitsverzeichnis.
2. Falls nicht gefunden, sucht sie rekursiv in den übergeordneten Verzeichnissen, bis eine `.env` Datei gefunden wird oder das Projekt-Root-Verzeichnis (erkennbar an einem `.git` Ordner) oder das Home-Verzeichnis erreicht ist.
3. Falls immer noch nichts gefunden wurde, wird `~/.env` (im Home-Verzeichnis des Benutzers) geladen.

**Ausschluss von Umgebungsvariablen:** Bestimmte Umgebungsvariablen (wie `DEBUG` und `DEBUG_MODE`) werden standardmäßig aus Projekt `.env` Dateien ausgeschlossen, um Störungen im CLI-Verhalten zu vermeiden. Variablen aus `.qwen/.env` Dateien werden niemals ausgeschlossen. Du kannst dieses Verhalten über die Einstellung `excludedProjectEnvVars` in deiner `settings.json` Datei anpassen.

- **`OPENAI_API_KEY`**:
  - Eine von mehreren verfügbaren [Authentifizierungsmethoden](./authentication.md).
  - Setze diesen Wert in deinem Shell-Profil (z. B. `~/.bashrc`, `~/.zshrc`) oder in einer `.env` Datei.
- **`OPENAI_BASE_URL`**:
  - Eine von mehreren verfügbaren [Authentifizierungsmethoden](./authentication.md).
  - Setze diesen Wert in deinem Shell-Profil (z. B. `~/.bashrc`, `~/.zshrc`) oder in einer `.env` Datei.
- **`OPENAI_MODEL`**:
  - Legt das standardmäßig zu verwendende OPENAI-Modell fest.
  - Überschreibt den fest codierten Standardwert.
  - Beispiel: `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`**:
  - Alternative zur `sandbox` Einstellung in der `settings.json`.
  - Akzeptiert `true`, `false`, `docker`, `podman` oder einen benutzerdefinierten Befehl als String.
- **`SEATBELT_PROFILE`** (nur macOS):
  - Wechselt das Seatbelt (`sandbox-exec`) Profil unter macOS.
  - `permissive-open`: (Standard) Beschränkt Schreibzugriffe auf den Projektordner (und einige andere, siehe `packages/cli/src/utils/sandbox-macos-permissive-open.sb`), erlaubt aber andere Operationen.
  - `strict`: Verwendet ein striktes Profil, das standardmäßig alle Operationen ablehnt.
  - `<profile_name>`: Verwendet ein benutzerdefiniertes Profil. Um ein solches Profil zu definieren, erstelle eine Datei mit dem Namen `sandbox-macos-<profile_name>.sb` im `.qwen/` Verzeichnis deines Projekts (z. B. `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` oder `DEBUG_MODE`** (häufig von zugrunde liegenden Bibliotheken oder der CLI selbst verwendet):
  - Auf `true` oder `1` setzen, um detaillierte Debug-Logs zu aktivieren – hilfreich bei der Fehlersuche.
  - **Hinweis:** Diese Variablen werden standardmäßig aus Projekt `.env` Dateien ausgeschlossen, um das CLI-Verhalten nicht zu beeinträchtigen. Verwende `.qwen/.env` Dateien, wenn du diese speziell für Qwen Code setzen musst.
- **`NO_COLOR`**:
  - Auf einen beliebigen Wert setzen, um alle farbigen Ausgaben in der CLI zu deaktivieren.
- **`CLI_TITLE`**:
  - Auf einen String setzen, um den Titel der CLI anzupassen.
- **`CODE_ASSIST_ENDPOINT`**:
  - Gibt den Endpunkt für den Code Assist Server an.
  - Nützlich für Entwicklung und Tests.
- **`TAVILY_API_KEY`**:
  - Dein API key für den Tavily Web-Suchdienst.
  - Erforderlich, um die `web_search` Tool-Funktionalität zu aktivieren.
  - Wenn nicht konfiguriert, wird das Web-Suchtool deaktiviert und übersprungen.
  - Beispiel: `export TAVILY_API_KEY="tvly-your-api-key-here"`

## Command-Line Arguments

Argumente, die direkt beim Ausführen der CLI übergeben werden, können andere Konfigurationen für diese spezifische Sitzung überschreiben.

- **`--model <model_name>`** (**`-m <model_name>`**):
  - Gibt das Qwen-Modell an, das für diese Sitzung verwendet werden soll.
  - Beispiel: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - Wird verwendet, um einen Prompt direkt an den Befehl zu übergeben. Dies startet Qwen Code im nicht-interaktiven Modus.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - Startet eine interaktive Sitzung mit dem übergebenen Prompt als initiale Eingabe.
  - Der Prompt wird innerhalb der interaktiven Sitzung verarbeitet, nicht davor.
  - Kann nicht verwendet werden, wenn Eingaben über stdin gepiped werden.
  - Beispiel: `qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - Aktiviert den Sandbox-Modus für diese Sitzung.
- **`--sandbox-image`**:
  - Setzt die URI des Sandbox-Images.
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
- **`--approval-mode <mode>`**:
  - Setzt den Genehmigungsmodus für Tool-Aufrufe. Verfügbare Modi:
    - `default`: Fordert bei jedem Tool-Aufruf eine Genehmigung an (Standardverhalten)
    - `auto_edit`: Genehmigt automatisch Edit-Tools (edit, write_file), während für andere eine Eingabe erforderlich ist
    - `yolo`: Genehmigt automatisch alle Tool-Aufrufe (äquivalent zu `--yolo`)
  - Kann nicht zusammen mit `--yolo` verwendet werden. Verwende stattdessen `--approval-mode=yolo` für den neuen einheitlichen Ansatz.
  - Beispiel: `qwen --approval-mode auto_edit`
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
- **`--version`**:
  - Zeigt die Version der CLI an.
- **`--openai-logging`**:
  - Aktiviert das Logging von OpenAI-API-Aufrufen zur Fehlersuche und Analyse. Dieses Flag überschreibt die `enableOpenAILogging`-Einstellung in der `settings.json`.
- **`--tavily-api-key <api_key>`**:
  - Setzt den Tavily-API-Key für die Web-Suchfunktion dieser Sitzung.
  - Beispiel: `qwen --tavily-api-key tvly-your-api-key-here`

## Context Files (Hierarchischer Instruktionskontext)

Auch wenn es sich nicht um eine strikte Konfiguration des CLI-Verhaltens handelt, sind Context Files (standardmäßig `QWEN.md`, aber konfigurierbar über die Einstellung `contextFileName`) entscheidend für die Konfiguration des _Instruktionskontexts_ (auch als "Memory" bezeichnet). Diese leistungsstarke Funktion ermöglicht es dir, projektspezifische Anweisungen, Coding-Standards oder andere relevante Hintergrundinformationen an das KI-Modell zu übergeben, wodurch die Antworten gezielter und präziser auf deine Anforderungen abgestimmt werden. Die CLI enthält UI-Elemente, wie z. B. einen Indikator in der Fußzeile, der die Anzahl der geladenen Context Files anzeigt, um dich über den aktiven Kontext zu informieren.

- **Zweck:** Diese Markdown-Dateien enthalten Anweisungen, Richtlinien oder Kontextinformationen, die du möchtest, dass das Qwen-Modell während eurer Interaktionen berücksichtigt. Das System ist so konzipiert, dass es diesen Instruktionskontext hierarchisch verwaltet.

### Beispiel für den Inhalt einer Context-Datei (z. B. `QWEN.md`)

Hier ist ein konzeptionelles Beispiel dafür, was eine Context-Datei im Stammverzeichnis eines TypeScript-Projekts enthalten könnte:

```markdown

# Project: My Awesome TypeScript Library

## Allgemeine Anweisungen:

- Wenn du neuen TypeScript-Code generierst, halte dich bitte an den bestehenden Codierungsstil.
- Stelle sicher, dass alle neuen Funktionen und Klassen über JSDoc-Kommentare verfügen.
- Bevorzuge funktionale Programmierparadigmen, wo dies angemessen ist.
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

Dieses Beispiel zeigt, wie du allgemeinen Projektkontext, spezifische Coding-Konventionen und sogar Hinweise zu bestimmten Dateien oder Komponenten bereitstellen kannst. Je relevanter und präziser deine Kontextdateien sind, desto besser kann die KI dir helfen. Projekt-spezifische Kontextdateien sind sehr empfohlen, um Konventionen und Kontext festzulegen.

- **Hierarchisches Laden und Priorität:** Die CLI implementiert ein ausgeklügeltes hierarchisches Speichersystem, indem sie Kontextdateien (z. B. `QWEN.md`) aus mehreren Verzeichnissen lädt. Inhalte aus Dateien weiter unten in dieser Liste (also spezifischer) überschreiben oder ergänzen in der Regel die Inhalte aus Dateien weiter oben (also allgemeiner). Die genaue Reihenfolge der Verkettung und der finale Kontext können mit dem Befehl `/memory show` eingesehen werden. Die typische Ladereihenfolge ist:
  1.  **Globale Kontextdatei:**
      - Ort: `~/.qwen/<contextFileName>` (z. B. `~/.qwen/QWEN.md` in deinem Benutzerverzeichnis).
      - Geltungsbereich: Stellt Standardanweisungen für alle deine Projekte bereit.
  2.  **Projektstamm & übergeordnete Verzeichnisse:**
      - Ort: Die CLI sucht nach der konfigurierten Kontextdatei im aktuellen Arbeitsverzeichnis und dann in jedem übergeordneten Verzeichnis bis entweder zum Projektstamm (erkennbar an einem `.git`-Ordner) oder zu deinem Home-Verzeichnis.
      - Geltungsbereich: Stellt Kontext bereit, der für das gesamte Projekt oder einen großen Teil davon relevant ist.
  3.  **Unterverzeichnisse (Kontextuell/Lokal):**
      - Ort: Die CLI scannt auch nach der konfigurierten Kontextdatei in Unterverzeichnissen _unterhalb_ des aktuellen Arbeitsverzeichnisses (unter Beachtung gängiger Ignoriermuster wie `node_modules`, `.git`, etc.). Die Breite dieser Suche ist standardmäßig auf 200 Verzeichnisse begrenzt, kann aber über das Feld `memoryDiscoveryMaxDirs` in deiner `settings.json`-Datei konfiguriert werden.
      - Geltungsbereich: Ermöglicht hochspezifische Anweisungen, die für eine bestimmte Komponente, ein Modul oder einen Teil deines Projekts relevant sind.
- **Verkettung & UI-Anzeige:** Die Inhalte aller gefundenen Kontextdateien werden verkettet (mit Trennzeichen, die ihren Ursprung und Pfad angeben) und als Teil des Systemprompts bereitgestellt. In der CLI-Fußzeile wird die Anzahl der geladenen Kontextdateien angezeigt, was dir einen schnellen visuellen Hinweis auf den aktiven Anweisungskontext gibt.
- **Inhalte importieren:** Du kannst deine Kontextdateien modularisieren, indem du andere Markdown-Dateien mit der Syntax `@path/to/file.md` importierst. Weitere Details findest du in der [Dokumentation zum Memory Import Processor](../core/memport.md).
- **Befehle zur Speicherverwaltung:**
  - Verwende `/memory refresh`, um einen erneuten Scan und Reload aller Kontextdateien aus allen konfigurierten Orten zu erzwingen. Dies aktualisiert den Anweisungskontext der KI.
  - Verwende `/memory show`, um den aktuell geladenen, kombinierten Anweisungskontext anzuzeigen, sodass du die Hierarchie und den von der KI verwendeten Inhalt überprüfen kannst.
  - Die vollständigen Details zum `/memory`-Befehl und seinen Unterbefehlen (`show` und `refresh`) findest du in der [Befehlsdokumentation](./commands.md#memory).

Durch das Verstehen und Nutzen dieser Konfigurationsebenen sowie der hierarchischen Struktur von Kontextdateien kannst du den Speicher der KI effektiv verwalten und die Antworten von Qwen Code an deine spezifischen Anforderungen und Projekte anpassen.

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

- **Tool-Aufrufe:** Wir protokollieren die Namen der aufgerufenen Tools, ob sie erfolgreich waren oder fehlschlugen, sowie deren Ausführungszeit. Wir sammeln weder die an die Tools übergebenen Argumente noch von ihnen zurückgegebene Daten.
- **API-Anfragen:** Wir protokollieren das für jede Anfrage verwendete Modell, die Dauer der Anfrage und ob sie erfolgreich war. Wir sammeln weder den Inhalt der Prompts noch der Antworten.
- **Sitzungsinformationen:** Wir sammeln Informationen zur Konfiguration der CLI, wie z. B. die aktivierten Tools und der Genehmigungsmodus.

**Was wir NICHT sammeln:**

- **Personenbezogene Daten (PII):** Wir sammeln keine persönlichen Informationen wie Ihren Namen, Ihre E-Mail-Adresse oder API-Keys.
- **Prompt- und Antwortinhalte:** Wir protokollieren weder den Inhalt Ihrer Prompts noch die Antworten des Modells.
- **Dateiinhalte:** Wir protokollieren nicht den Inhalt von Dateien, die von der CLI gelesen oder geschrieben werden.

**So deaktivieren Sie die Sammlung:**

Sie können die Sammlung von Nutzungsstatistiken jederzeit deaktivieren, indem Sie die Eigenschaft `usageStatisticsEnabled` in Ihrer `settings.json`-Datei auf `false` setzen:

```json
{
  "usageStatisticsEnabled": false
}
```

Hinweis: Wenn die Nutzungsstatistiken aktiviert sind, werden Ereignisse an einen Alibaba Cloud RUM-Sammlungsendpunkt gesendet.

- **`enableWelcomeBack`** (boolean):
  - **Beschreibung:** Zeigt einen „Willkommen zurück“-Dialog an, wenn Sie zu einem Projekt mit Konversationsverlauf zurückkehren.
  - **Standardwert:** `true`
  - **Kategorie:** UI
  - **Neustart erforderlich:** Nein
  - **Beispiel:** `"enableWelcomeBack": false`
  - **Details:** Wenn aktiviert, erkennt Qwen Code automatisch, ob Sie zu einem Projekt mit einer zuvor generierten Projektzusammenfassung (`.qwen/PROJECT_SUMMARY.md`) zurückkehren, und zeigt einen Dialog an, der es Ihnen ermöglicht, Ihre vorherige Konversation fortzusetzen oder neu zu beginnen. Diese Funktion ist mit dem Befehl `/chat summary` und dem Beendigungsbestätigungsdialog integriert. Weitere Informationen finden Sie in der [Welcome Back Dokumentation](./welcome-back.md).