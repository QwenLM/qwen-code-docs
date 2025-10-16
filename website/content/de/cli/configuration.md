# Qwen Code Konfiguration

Qwen Code bietet mehrere Möglichkeiten, sein Verhalten zu konfigurieren, darunter Umgebungsvariablen, Kommandozeilenargumente und Einstellungsdateien. Dieses Dokument beschreibt die verschiedenen Konfigurationsmethoden und verfügbaren Einstellungen.

## Konfigurationsebenen

Die Konfiguration wird in der folgenden Reihenfolge der Priorität angewendet (niedrigere Nummern werden von höheren überschrieben):

1.  **Standardwerte:** Fest codierte Standardwerte innerhalb der Anwendung.
2.  **System-Standarddatei:** Systemweite Standardeinstellungen, die durch andere Einstellungsdateien überschrieben werden können.
3.  **Benutzereinstellungsdatei:** Globale Einstellungen für den aktuellen Benutzer.
4.  **Projekteinstellungsdatei:** Projektspezifische Einstellungen.
5.  **Systemeinstellungsdatei:** Systemweite Einstellungen, die alle anderen Einstellungsdateien überschreiben.
6.  **Umgebungsvariablen:** Systemweite oder sitzungsspezifische Variablen, möglicherweise geladen aus `.env` Dateien.
7.  **Kommandozeilenargumente:** Werte, die beim Starten der CLI übergeben werden.

## Einstellungsdateien

Qwen Code verwendet JSON-Einstellungsdateien für die persistente Konfiguration. Es gibt vier Speicherorte für diese Dateien:

- **System-Standarddatei:**
  - **Speicherort:** `/etc/qwen-code/system-defaults.json` (Linux), `C:\ProgramData\qwen-code\system-defaults.json` (Windows) oder `/Library/Application Support/QwenCode/system-defaults.json` (macOS). Der Pfad kann mithilfe der Umgebungsvariable `QWEN_CODE_SYSTEM_DEFAULTS_PATH` überschrieben werden.
  - **Geltungsbereich:** Stellt eine Basisebene mit systemweiten Standardeinstellungen bereit. Diese Einstellungen haben die niedrigste Priorität und sollen durch Benutzer-, Projekt- oder Systemüberschreibungseinstellungen überschrieben werden.

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

Neben einer Projekt-Einstellungsdatei kann das `.qwen`-Verzeichnis eines Projekts auch andere projektspezifische Dateien enthalten, die für den Betrieb von Qwen Code relevant sind, wie z. B.:

- [Benutzerdefinierte Sandbox-Profile](#sandboxing) (z. B. `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

### Verfügbare Einstellungen in `settings.json`:

- **`contextFileName`** (String oder Array aus Strings):
  - **Beschreibung:** Gibt den Dateinamen für Kontextdateien an (z. B. `QWEN.md`, `AGENTS.md`). Kann ein einzelner Dateiname oder eine Liste akzeptierter Dateinamen sein.
  - **Standardwert:** `QWEN.md`
  - **Beispiel:** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (Objekt):
  - **Beschreibung:** Überschreibt die Standard-URL für den `/bug`-Befehl.
  - **Standardwert:** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **Eigenschaften:**
    - **`urlTemplate`** (String): Eine URL, die Platzhalter `{title}` und `{info}` enthalten kann.
  - **Beispiel:**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (Objekt):
  - **Beschreibung:** Steuert das git-basierte Filterverhalten für @-Befehle und Datei-Suchwerkzeuge.
  - **Standardwert:** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **Eigenschaften:**
    - **`respectGitIgnore`** (Boolean): Legt fest, ob `.gitignore`-Muster bei der Dateisuche berücksichtigt werden. Bei `true` werden git-ignorierte Dateien (wie `node_modules/`, `dist/`, `.env`) automatisch von @-Befehlen und Dateilisten ausgeschlossen.
    - **`enableRecursiveFileSearch`** (Boolean): Legt fest, ob rekursiv nach Dateinamen im aktuellen Verzeichnisbaum gesucht wird, wenn @-Präfixe im Prompt vervollständigt werden.
    - **`disableFuzzySearch`** (Boolean): Wenn `true`, wird die Fuzzy-Suche beim Auffinden von Dateien deaktiviert, was die Performance in Projekten mit vielen Dateien verbessern kann.
  - **Beispiel:**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false,
      "disableFuzzySearch": true
    }
    ```

### Problemlösung bei der Dateisuche-Performance

Wenn du Performance-Probleme bei der Dateisuche (z. B. mit `@`-Vervollständigungen) hast – besonders in Projekten mit sehr vielen Dateien – kannst du folgende Maßnahmen in der angegebenen Reihenfolge ausprobieren:

1. **Verwende `.qwenignore`:** Erstelle eine `.qwenignore`-Datei im Projektverzeichnis, um Verzeichnisse auszuschließen, die viele Dateien enthalten, auf die du nicht zugreifen musst (z. B. Build-Artefakte, Logs, `node_modules`). Die Reduzierung der Anzahl der durchsuchten Dateien ist die effektivste Methode zur Verbesserung der Performance.

2. **Deaktiviere Fuzzy Search:** Wenn das Ignorieren von Dateien nicht ausreicht, kannst du die Fuzzy-Suche deaktivieren, indem du `disableFuzzySearch` in deiner `settings.json` auf `true` setzt. Dadurch wird ein einfacherer, nicht-fuzzy-basierter Algorithmus verwendet, der schneller sein kann.

3. **Deaktiviere rekursive Dateisuche:** Als letztes Mittel kannst du die rekursive Dateisuche komplett deaktivieren, indem du `enableRecursiveFileSearch` auf `false` setzt. Dies ist die schnellste Option, da dadurch der rekursive Durchlauf des Projekts vermieden wird. Du musst dann jedoch den vollständigen Pfad zu Dateien eingeben, wenn du `@`-Vervollständigungen verwendest.

---

- **`coreTools`** (Array aus Strings):
  - **Beschreibung:** Ermöglicht es dir, eine Liste von Core-Tool-Namen anzugeben, die für das Modell verfügbar gemacht werden sollen. Damit kannst du die Menge der integrierten Tools einschränken. Eine Liste der Core-Tools findest du unter [Built-in Tools](../core/tools-api.md#built-in-tools). Du kannst auch Befehlseinschränkungen für Tools festlegen, die dies unterstützen, wie z. B. das `ShellTool`. Beispiel: `"coreTools": ["ShellTool(ls -l)"]` erlaubt nur die Ausführung des Befehls `ls -l`.
  - **Standardwert:** Alle Tools sind für das Modell verfügbar.
  - **Beispiel:** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`.

- **`allowedTools`** (Array aus Strings):
  - **Standardwert:** `undefined`
  - **Beschreibung:** Eine Liste von Tool-Namen, die den Bestätigungsdialog umgehen. Das ist nützlich für Tools, denen du vertraust und die du häufig verwendest. Die Matching-Logik entspricht der von `coreTools`.
  - **Beispiel:** `"allowedTools": ["ShellTool(git status)"]`.

- **`excludeTools`** (Array aus Strings):
  - **Beschreibung:** Ermöglicht es dir, eine Liste von Core-Tool-Namen anzugeben, die vom Modell ausgeschlossen werden sollen. Ein Tool, das sowohl in `excludeTools` als auch in `coreTools` aufgeführt ist, wird ausgeschlossen. Du kannst auch Befehlseinschränkungen für Tools festlegen, die dies unterstützen, wie z. B. das `ShellTool`. Beispiel: `"excludeTools": ["ShellTool(rm -rf)"]` blockiert den Befehl `rm -rf`.
  - **Standardwert:** Keine Tools ausgeschlossen.
  - **Beispiel:** `"excludeTools": ["run_shell_command", "findFiles"]`.
  - **Sicherheitshinweis:** Befehlseinschränkungen in `excludeTools` für `run_shell_command` basieren auf einfacher String-Matching und können leicht umgangen werden. Diese Funktion ist **kein Sicherheitsmechanismus** und sollte nicht darauf verlassen werden, um nicht vertrauenswürdigen Code sicher auszuführen. Es wird empfohlen, `coreTools` zu verwenden, um explizit die Befehle auszuwählen, die ausgeführt werden dürfen.

- **`allowMCPServers`** (Array aus Strings):
  - **Beschreibung:** Ermöglicht es dir, eine Liste von MCP-Servernamen anzugeben, die für das Modell verfügbar gemacht werden sollen. Damit kannst du die Menge der MCP-Server einschränken, mit denen verbunden wird. Beachte, dass diese Einstellung ignoriert wird, wenn `--allowed-mcp-server-names` gesetzt ist.
  - **Standardwert:** Alle MCP-Server sind für das Modell verfügbar.
  - **Beispiel:** `"allowMCPServers": ["myPythonServer"]`.
  - **Sicherheitshinweis:** Hierbei wird einfaches String-Matching auf MCP-Servernamen verwendet, die manipuliert werden können. Wenn du als Systemadministrator verhindern möchtest, dass Benutzer dies umgehen, solltest du `mcpServers` auf Systemebene konfigurieren, sodass Benutzer keine eigenen MCP-Server konfigurieren können. Dies sollte **nicht** als absoluter Sicherheitsmechanismus betrachtet werden.

- **`excludeMCPServers`** (Array aus Strings):
  - **Beschreibung:** Ermöglicht es dir, eine Liste von MCP-Servernamen anzugeben, die vom Modell ausgeschlossen werden sollen. Ein Server, der sowohl in `excludeMCPServers` als auch in `allowMCPServers` aufgeführt ist, wird ausgeschlossen. Beachte, dass diese Einstellung ignoriert wird, wenn `--allowed-mcp-server-names` gesetzt ist.
  - **Standardwert:** Keine MCP-Server ausgeschlossen.
  - **Beispiel:** `"excludeMCPServers": ["myNodeServer"]`.
  - **Sicherheitshinweis:** Hierbei wird einfaches String-Matching auf MCP-Servernamen verwendet, die manipuliert werden können. Wenn du als Systemadministrator verhindern möchtest, dass Benutzer dies umgehen, solltest du `mcpServers` auf Systemebene konfigurieren, sodass Benutzer keine eigenen MCP-Server konfigurieren können. Dies sollte **nicht** als absoluter Sicherheitsmechanismus betrachtet werden.

- **`autoAccept`** (Boolean):
  - **Beschreibung:** Legt fest, ob die CLI automatisch Tool-Aufrufe akzeptiert und ausführt, die als sicher gelten (z. B. schreibgeschützte Operationen), ohne explizite Benutzerbestätigung. Bei `true` wird der Bestätigungsdialog für sichere Tools übersprungen.
  - **Standardwert:** `false`
  - **Beispiel:** `"autoAccept": true`

- **`theme`** (String):
  - **Beschreibung:** Setzt das visuelle [Theme](./themes.md) für Qwen Code.
  - **Standardwert:** `"Default"`
  - **Beispiel:** `"theme": "GitHub"`

- **`vimMode`** (Boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert den Vim-Modus für die Eingabebearbeitung. Im aktivierten Zustand unterstützt der Eingabebereich Vim-artige Navigations- und Bearbeitungsbefehle mit NORMAL- und INSERT-Modus. Der Status des Vim-Modus wird in der Fußzeile angezeigt und bleibt zwischen Sitzungen erhalten.
  - **Standardwert:** `false`
  - **Beispiel:** `"vimMode": true`

- **`sandbox`** (Boolean oder String):
  - **Beschreibung:** Legt fest, ob und wie Sandboxing für die Toolausführung verwendet wird. Bei `true` verwendet Qwen Code ein vorgebautes `qwen-code-sandbox` Docker-Image. Weitere Informationen findest du unter [Sandboxing](#sandboxing).
  - **Standardwert:** `false`
  - **Beispiel:** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (String):
  - **Beschreibung:** **Gemäß Gemini CLI.** Definiert einen benutzerdefinierten Shell-Befehl zum Entdecken von Tools aus deinem Projekt. Der Shell-Befehl muss auf `stdout` ein JSON-Array von [Function Declarations](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations) zurückgeben. Tool-Wrappers sind optional.
  - **Standardwert:** Leer
  - **Beispiel:** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (String):
  - **Beschreibung:** **Gemäß Gemini CLI.** Definiert einen benutzerdefinierten Shell-Befehl zum Aufrufen eines bestimmten Tools, das über `toolDiscoveryCommand` entdeckt wurde. Der Shell-Befehl muss folgende Kriterien erfüllen:
    - Er muss den Funktionsnamen (genau wie in der [Function Declaration](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) als erstes Kommandozeilenargument entgegennehmen.
    - Er muss Funktionsargumente als JSON von `stdin` lesen, analog zu [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Er muss die Funktionsausgabe als JSON auf `stdout` zurückgeben, analog zu [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Standardwert:** Leer
  - **Beispiel:** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (Objekt):
  - **Beschreibung:** Konfiguriert Verbindungen zu einem oder mehreren Model-Context Protocol (MCP)-Servern zum Entdecken und Nutzen von benutzerdefinierten Tools. Qwen Code versucht, sich mit jedem konfigurierten MCP-Server zu verbinden, um verfügbare Tools zu entdecken. Wenn mehrere MCP-Server ein Tool mit demselben Namen bereitstellen, werden die Tool-Namen mit dem Server-Alias aus der Konfiguration vorangestellt (z. B. `serverAlias__actualToolName`), um Konflikte zu vermeiden. Beachte, dass das System möglicherweise bestimmte Schema-Eigenschaften aus MCP-Tooldefinitionen entfernt, um die Kompatibilität zu gewährleisten. Mindestens eines von `command`, `url` oder `httpUrl` muss angegeben werden. Falls mehrere angegeben sind, gilt die Priorität: `httpUrl`, dann `url`, dann `command`.
  - **Standardwert:** Leer
  - **Eigenschaften:**
    - **`<SERVER_NAME>`** (Objekt): Die Serverparameter für den benannten Server.
      - `command` (String, optional): Der Befehl zum Starten des MCP-Servers über Standard-I/O.
      - `args` (Array aus Strings, optional): Argumente, die an den Befehl übergeben werden.
      - `env` (Objekt, optional): Umgebungsvariablen, die für den Serverprozess gesetzt werden.
      - `cwd` (String, optional): Das Arbeitsverzeichnis, in dem der Server gestartet wird.
      - `url` (String, optional): Die URL eines MCP-Servers, der Server-Sent Events (SSE) für die Kommunikation verwendet.
      - `httpUrl` (String, optional): Die URL eines MCP-Servers, der streambare HTTP-Kommunikation verwendet.
      - `headers` (Objekt, optional): Eine Zuordnung von HTTP-Headers, die mit Anfragen an `url` oder `httpUrl` gesendet werden.
      - `timeout` (Zahl, optional): Zeitlimit in Millisekunden für Anfragen an diesen MCP-Server.
      - `trust` (Boolean, optional): Dem Server vertrauen und alle Tool-Aufrufbestätigungen umgehen.
      - `description` (String, optional): Eine kurze Beschreibung des Servers, die zu Anzeigezwecken verwendet werden kann.
      - `includeTools` (Array aus Strings, optional): Liste der Tool-Namen, die von diesem MCP-Server eingeschlossen werden sollen. Wenn angegeben, sind nur die hier aufgelisteten Tools von diesem Server verfügbar (Whitelist-Verhalten). Wenn nicht angegeben, sind standardmäßig alle Tools des Servers aktiviert.
      - `excludeTools` (Array aus Strings, optional): Liste der Tool-Namen, die von diesem MCP-Server ausgeschlossen werden sollen. Die hier aufgelisteten Tools stehen dem Modell nicht zur Verfügung, selbst wenn sie vom Server bereitgestellt werden. **Hinweis:** `excludeTools` hat Vorrang vor `includeTools` – wenn ein Tool in beiden Listen steht, wird es ausgeschlossen.
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
        "description": "Ein Beispiel-HTTP-basierter MCP-Server mit Streaming."
      }
    }
    ```

- **`checkpointing`** (Objekt):
  - **Beschreibung:** Konfiguriert die Checkpoint-Funktion, mit der du Gesprächs- und Dateizustände speichern und wiederherstellen kannst. Weitere Details findest du in der [Checkpointing-Dokumentation](../checkpointing.md).
  - **Standardwert:** `{"enabled": false}`
  - **Eigenschaften:**
    - **`enabled`** (Boolean): Wenn `true`, ist der Befehl `/restore` verfügbar.

- **`preferredEditor`** (String):
  - **Beschreibung:** Gibt den bevorzugten Editor zum Anzeigen von Diffs an.
  - **Standardwert:** `vscode`
  - **Beispiel:** `"preferredEditor": "vscode"`

- **`telemetry`** (Objekt)
  - **Beschreibung:** Konfiguriert das Logging und die Erfassung von Metriken für Qwen Code. Weitere Informationen findest du unter [Telemetrie](../telemetry.md).
  - **Standardwert:** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **Eigenschaften:**
    - **`enabled`** (Boolean): Ob Telemetrie aktiviert ist oder nicht.
    - **`target`** (String): Das Ziel für die gesammelten Telemetriedaten. Unterstützte Werte sind `local` und `gcp`.
    - **`otlpEndpoint`** (String): Der Endpunkt für den OTLP-Exporter.
    - **`logPrompts`** (Boolean): Ob der Inhalt von Benutzerprompts in die Logs aufgenommen werden soll.
  - **Beispiel:**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```

- **`usageStatisticsEnabled`** (Boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert die Erfassung von Nutzungsstatistiken. Weitere Informationen findest du unter [Nutzungsstatistiken](#usage-statistics).
  - **Standardwert:** `true`
  - **Beispiel:**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`** (Boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert hilfreiche Tipps in der CLI-Oberfläche.
  - **Standardwert:** `false`
  - **Beispiel:**
    ```json
    "hideTips": true
    ```

- **`hideBanner`** (Boolean):
  - **Beschreibung:** Aktiviert oder deaktiviert das Startbanner (ASCII-Art-Logo) in der CLI-Oberfläche.
  - **Standardwert:** `false`
  - **Beispiel:**
    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`** (Zahl):
  - **Beschreibung:** Legt die maximale Anzahl von Turns pro Session fest. Wenn die Session dieses Limit überschreitet, stoppt die CLI die Verarbeitung und beginnt einen neuen Chat.
  - **Standardwert:** `-1` (unbegrenzt)
  - **Beispiel:**
    ```json
    "maxSessionTurns":

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
  "skipNextSpeakerCheck": false,
  "skipLoopDetection": false,
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

## Shell-Historie

Die CLI speichert eine Historie der Shell-Befehle, die du ausführst. Um Konflikte zwischen verschiedenen Projekten zu vermeiden, wird diese Historie in einem projektspezifischen Verzeichnis innerhalb deines Benutzer-Home-Ordners gespeichert.

- **Speicherort:** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` ist ein eindeutiger Identifier, der aus dem Root-Pfad deines Projekts generiert wird.
  - Die Historie wird in einer Datei mit dem Namen `shell_history` gespeichert.

## Umgebungsvariablen & `.env` Dateien

Umgebungsvariablen sind eine gängige Methode zur Konfiguration von Anwendungen – besonders für sensible Informationen wie API Keys oder Einstellungen, die sich zwischen verschiedenen Umgebungen unterscheiden können. Für das Setup der Authentifizierung siehe die [Authentifizierungs-Dokumentation](./authentication.md), die alle verfügbaren Authentifizierungsmethoden abdeckt.

Die CLI lädt automatisch Umgebungsvariablen aus einer `.env` Datei. Die Ladereihenfolge ist wie folgt:

1.  `.env` Datei im aktuellen Arbeitsverzeichnis.
2.  Falls nicht gefunden, sucht sie rekursiv in den übergeordneten Verzeichnissen nach einer `.env` Datei, bis entweder eine gefunden wird oder das Projektstammverzeichnis (erkennbar an einem `.git` Ordner) oder das Home-Verzeichnis erreicht ist.
3.  Wenn immer noch keine gefunden wurde, wird `~/.env` (im Benutzer-Home-Verzeichnis) geladen.

**Ausschluss von Umgebungsvariablen:** Bestimmte Umgebungsvariablen (wie `DEBUG` und `DEBUG_MODE`) werden standardmäßig aus Projekt `.env` Dateien ausgeschlossen, um mögliche Beeinträchtigungen des CLI-Verhaltens zu vermeiden. Variablen aus `.qwen/.env` Dateien werden niemals ausgeschlossen. Du kannst dieses Verhalten über die Einstellung `excludedProjectEnvVars` in deiner `settings.json` Datei anpassen.

- **`OPENAI_API_KEY`**:
  - Eine von mehreren verfügbaren [Authentifizierungsmethoden](./authentication.md).
  - Setze diesen Wert in deinem Shell-Profil (z. B. `~/.bashrc`, `~/.zshrc`) oder in einer `.env` Datei.
- **`OPENAI_BASE_URL`**:
  - Eine von mehreren verfügbaren [Authentifizierungsmethoden](./authentication.md).
  - Setze diesen Wert in deinem Shell-Profil (z. B. `~/.bashrc`, `~/.zshrc`) oder in einer `.env` Datei.
- **`OPENAI_MODEL`**:
  - Legt das Standard-OPENAI Modell fest.
  - Überschreibt den fest codierten Default-Wert.
  - Beispiel: `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`**:
  - Alternative zur `sandbox` Einstellung in `settings.json`.
  - Akzeptiert Werte wie `true`, `false`, `docker`, `podman` oder einen benutzerdefinierten Befehl als String.
- **`SEATBELT_PROFILE`** (nur macOS):
  - Wechselt das Seatbelt (`sandbox-exec`) Profil unter macOS.
  - `permissive-open`: (Standard) Beschränkt Schreibzugriffe auf den Projektordner (und einige andere, siehe `packages/cli/src/utils/sandbox-macos-permissive-open.sb`), erlaubt aber andere Operationen.
  - `strict`: Nutzt ein striktes Profil, das standardmäßig alle Operationen ablehnt.
  - `<profile_name>`: Nutzt ein benutzerdefiniertes Profil. Um eines zu definieren, erstelle eine Datei mit dem Namen `sandbox-macos-<profile_name>.sb` im `.qwen/` Verzeichnis deines Projekts (z. B. `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` oder `DEBUG_MODE`** (häufig genutzt von zugrunde liegenden Bibliotheken oder der CLI selbst):
  - Auf `true` oder `1` setzen, um detaillierte Debug-Ausgaben zu aktivieren – hilfreich bei der Fehlersuche.
  - **Hinweis:** Diese Variablen werden standardmäßig aus Projekt `.env` Dateien ausgeschlossen, um das CLI-Verhalten nicht zu beeinträchtigen. Verwende stattdessen `.qwen/.env` Dateien, wenn du diese explizit für Qwen Code setzen musst.
- **`NO_COLOR`**:
  - Auf einen beliebigen Wert setzen, um jegliche Farbausgabe in der CLI zu deaktivieren.
- **`CLI_TITLE`**:
  - Auf einen String setzen, um den Titel der CLI anzupassen.
- **`CODE_ASSIST_ENDPOINT`**:
  - Gibt den Endpunkt für den Code Assist Server an.
  - Nützlich für Entwicklung und Tests.
- **`TAVILY_API_KEY`**:
  - Dein API Key für den Tavily Web-Suchdienst.
  - Erforderlich, um die Funktionalität des `web_search` Tools zu aktivieren.
  - Ohne Konfiguration wird das Web-Suchtool deaktiviert und übersprungen.
  - Beispiel: `export TAVILY_API_KEY="tvly-your-api-key-here"`

## Command-Line Arguments

Argumente, die direkt beim Ausführen der CLI übergeben werden, können andere Konfigurationen für diese spezifische Sitzung überschreiben.

- **`--model <model_name>`** (**`-m <model_name>`**):
  - Gibt das Qwen-Modell an, das für diese Sitzung verwendet werden soll.
  - Beispiel: `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**):
  - Wird verwendet, um einen Prompt direkt an den Befehl zu übergeben. Dies ruft Qwen Code im nicht-interaktiven Modus auf.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**):
  - Startet eine interaktive Sitzung mit dem angegebenen Prompt als initiale Eingabe.
  - Der Prompt wird innerhalb der interaktiven Sitzung verarbeitet, nicht davor.
  - Kann nicht verwendet werden, wenn Eingaben von stdin weitergeleitet werden.
  - Beispiel: `qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**):
  - Aktiviert den Sandbox-Modus für diese Sitzung.
- **`--sandbox-image`**:
  - Legt die URI des Sandbox-Images fest.
- **`--debug`** (**`-d`**):
  - Aktiviert den Debug-Modus für diese Sitzung und gibt ausführlichere Ausgaben zurück.
- **`--all-files`** (**`-a`**):
  - Falls gesetzt, werden rekursiv alle Dateien im aktuellen Verzeichnis als Kontext für den Prompt einbezogen.
- **`--help`** (oder **`-h`**):
  - Zeigt Hilfsinformationen zu den Command-Line Arguments an.
- **`--show-memory-usage`**:
  - Zeigt den aktuellen Speicherverbrauch an.
- **`--yolo`**:
  - Aktiviert den YOLO-Modus, bei dem automatisch alle Tool-Aufrufe genehmigt werden.
- **`--approval-mode <mode>`**:
  - Legt den Genehmigungsmodus für Tool-Aufrufe fest. Unterstützte Modi:
    - `plan`: Nur analysieren – keine Dateien ändern oder Befehle ausführen.
    - `default`: Genehmigung für Dateiänderungen oder Shell-Befehle erforderlich (Standardverhalten).
    - `auto-edit`: Automatische Genehmigung von Editierwerkzeugen (edit, write_file), während andere nachgefragt werden.
    - `yolo`: Automatische Genehmigung aller Tool-Aufrufe (äquivalent zu `--yolo`).
  - Kann nicht zusammen mit `--yolo` verwendet werden. Verwende stattdessen `--approval-mode=yolo`, um den neuen vereinheitlichten Ansatz zu nutzen.
  - Beispiel: `qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`**:
  - Eine durch Kommas getrennte Liste von Tool-Namen, die den Bestätigungsdialog umgehen.
  - Beispiel: `qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`**:
  - Aktiviert [Telemetrie](../telemetry.md).
- **`--telemetry-target`**:
  - Legt das Ziel für Telemetriedaten fest. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--telemetry-otlp-endpoint`**:
  - Legt den OTLP-Endpunkt für Telemetrie fest. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--telemetry-otlp-protocol`**:
  - Legt das OTLP-Protokoll für Telemetrie fest (`grpc` oder `http`). Standardmäßig ist `grpc` eingestellt. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--telemetry-log-prompts`**:
  - Aktiviert das Logging von Prompts für Telemetrie-Zwecke. Siehe [Telemetrie](../telemetry.md) für weitere Informationen.
- **`--checkpointing`**:
  - Aktiviert [Checkpointing](../checkpointing.md).
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**):
  - Gibt eine Liste von Erweiterungen an, die für die Sitzung verwendet werden sollen. Wenn nichts angegeben wird, werden alle verfügbaren Erweiterungen verwendet.
  - Nutze den speziellen Begriff `qwen -e none`, um alle Erweiterungen zu deaktivieren.
  - Beispiel: `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**):
  - Listet alle verfügbaren Erweiterungen auf und beendet sich danach.
- **`--proxy`**:
  - Setzt den Proxy für die CLI.
  - Beispiel: `--proxy http://localhost:7890`.
- **`--include-directories <dir1,dir2,...>`**:
  - Fügt zusätzliche Verzeichnisse zum Workspace hinzu, um Unterstützung für mehrere Verzeichnisse zu ermöglichen.
  - Kann mehrfach oder als kommagetrennte Werte angegeben werden.
  - Maximal 5 Verzeichnisse können hinzugefügt werden.
  - Beispiel: `--include-directories /path/to/project1,/path/to/project2` oder `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`**:
  - Aktiviert den Screenreader-Modus zur Barrierefreiheit.
- **`--version`**:
  - Zeigt die Version der CLI an.
- **`--openai-logging`**:
  - Aktiviert das Logging von OpenAI-API-Aufrufen zum Debuggen und Analysieren. Dieses Flag überschreibt die Einstellung `enableOpenAILogging` in der `settings.json`.
- **`--tavily-api-key <api_key>`**:
  - Setzt den Tavily-API-Schlüssel für die Web-Suche-Funktionalität dieser Sitzung.
  - Beispiel: `qwen --tavily-api-key tvly-your-api-key-here`

## Context Files (Hierarchischer Instruktionskontext)

Auch wenn es sich nicht um eine direkte Konfiguration des CLI-Verhaltens handelt, sind Context Files (standardmäßig `QWEN.md`, konfigurierbar über die Einstellung `contextFileName`) entscheidend für die Konfiguration des _Instruktionskontexts_ (auch „Memory“ genannt). Diese leistungsstarke Funktion ermöglicht es dir, projektspezifische Anweisungen, Coding-Standards oder andere relevante Hintergrundinformationen an das KI-Modell zu übergeben, wodurch die Antworten gezielter und präziser auf deine Anforderungen abgestimmt werden. Die CLI bietet UI-Elemente, wie z. B. eine Anzeige in der Fußzeile, die die Anzahl der geladenen Context Files zeigt, um dich über den aktiven Kontext zu informieren.

- **Zweck:** Diese Markdown-Dateien enthalten Anweisungen, Richtlinien oder Kontextinformationen, die das Qwen-Modell während der Interaktionen kennen sollte. Das System ist so konzipiert, dass es diesen Instruktionskontext hierarchisch verwaltet.

### Beispiel für den Inhalt einer Context-Datei (z. B. `QWEN.md`)

Hier ist ein konzeptionelles Beispiel dafür, was eine Context-Datei im Root eines TypeScript-Projekts enthalten könnte:

```markdown

# Projekt: My Awesome TypeScript Library

## Allgemeine Anweisungen:

- Wenn du neuen TypeScript-Code generierst, halte dich bitte an den bestehenden Codierungsstil.
- Stelle sicher, dass alle neuen Funktionen und Klassen über JSDoc-Kommentare verfügen.
- Bevorzuge funktionale Programmierparadigmen, wo es sinnvoll ist.
- Der gesamte Code sollte mit TypeScript 5.0 und Node.js 20+ kompatibel sein.

## Codierungsstil:

- Verwende 2 Leerzeichen für die Einrückung.
- Interface-Namen sollten mit `I` beginnen (z. B. `IUserService`).
- Private Klassenmember sollten mit einem Unterstrich (`_`) gekennzeichnet werden.
- Verwende immer strikte Gleichheit (`===` und `!==`).

## Spezifische Komponente: `src/api/client.ts`

- Diese Datei behandelt alle ausgehenden API-Anfragen.
- Wenn du neue API-Aufruffunktionen hinzufügst, stelle sicher, dass diese eine robuste Fehlerbehandlung und Logging enthalten.
- Verwende das vorhandene `fetchWithRetry`-Utility für alle GET-Anfragen.
```

## Zu den Abhängigkeiten:

- Vermeide es, neue externe Abhängigkeiten einzuführen, es sei denn, es ist unbedingt notwendig.
- Falls eine neue Abhängigkeit erforderlich ist, gib bitte den Grund dafür an.
```

Dieses Beispiel zeigt, wie du allgemeinen Projektkontext, spezifische Coding-Konventionen und sogar Hinweise zu bestimmten Dateien oder Komponenten bereitstellen kannst. Je relevanter und präziser deine Kontextdateien sind, desto besser kann die KI dich unterstützen. Projekt-spezifische Kontextdateien sind sehr empfehlenswert, um Konventionen und Kontext festzulegen.

- **Hierarchisches Laden und Priorität:** Die CLI implementiert ein ausgeklügeltes hierarchisches Speichersystem, indem sie Kontextdateien (z. B. `QWEN.md`) aus mehreren Verzeichnissen lädt. Inhalte aus Dateien weiter unten in dieser Liste (spezifischer) überschreiben oder ergänzen in der Regel Inhalte aus Dateien weiter oben (allgemeiner). Die genaue Reihenfolge der Verkettung und der finale Kontext können mit dem Befehl `/memory show` eingesehen werden. Die typische Ladereihenfolge ist:
  1.  **Globale Kontextdatei:**
      - Ort: `~/.qwen/<contextFileName>` (z. B. `~/.qwen/QWEN.md` in deinem Benutzerverzeichnis).
      - Geltungsbereich: Stellt Standardanweisungen für alle deine Projekte bereit.
  2.  **Projektstamm & übergeordnete Verzeichnisse:**
      - Ort: Die CLI sucht nach der konfigurierten Kontextdatei im aktuellen Arbeitsverzeichnis und anschließend in jedem übergeordneten Verzeichnis bis zum Projektstamm (erkennbar an einem `.git`-Ordner) oder deinem Home-Verzeichnis.
      - Geltungsbereich: Stellt Kontext bereit, der für das gesamte Projekt oder einen großen Teil davon relevant ist.
  3.  **Unterverzeichnisse (kontextuell/lokal):**
      - Ort: Die CLI scannt auch nach der konfigurierten Kontextdatei in Unterverzeichnissen _unterhalb_ des aktuellen Arbeitsverzeichnisses (unter Beachtung gängiger Ignoriermuster wie `node_modules`, `.git`, etc.). Die Breite dieser Suche ist standardmäßig auf 200 Verzeichnisse begrenzt, kann aber über das Feld `memoryDiscoveryMaxDirs` in deiner `settings.json`-Datei konfiguriert werden.
      - Geltungsbereich: Ermöglicht hochspezifische Anweisungen, die für eine bestimmte Komponente, ein Modul oder einen Teil deines Projekts relevant sind.
- **Verkettung & UI-Anzeige:** Die Inhalte aller gefundenen Kontextdateien werden verkettet (mit Trennzeichen, die ihren Ursprung und Pfad angeben) und als Teil des Systemprompts bereitgestellt. In der CLI-Fußzeile wird die Anzahl der geladenen Kontextdateien angezeigt, was dir einen schnellen visuellen Hinweis auf den aktiven Anweisungskontext gibt.
- **Inhalte importieren:** Du kannst deine Kontextdateien modularisieren, indem du andere Markdown-Dateien mit der Syntax `@path/to/file.md` importierst. Weitere Details findest du in der [Dokumentation zum Memory Import Processor](../core/memport.md).
- **Befehle zur Speicherverwaltung:**
  - Verwende `/memory refresh`, um einen erneuten Scan und Reload aller Kontextdateien aus allen konfigurierten Orten zu erzwingen. Dies aktualisiert den Anweisungskontext der KI.
  - Verwende `/memory show`, um den aktuell geladenen, kombinierten Anweisungskontext anzuzeigen, sodass du die Hierarchie und den von der KI verwendeten Inhalt überprüfen kannst.
  - Die vollständigen Details zum `/memory`-Befehl und seinen Unterbefehlen (`show` und `refresh`) findest du in der [Befehlsdokumentation](./commands.md#memory).

Durch das Verstehen und Nutzen dieser Konfigurationsebenen sowie der hierarchischen Struktur von Kontextdateien kannst du den Speicher der KI effektiv verwalten und die Antworten von Qwen Code auf deine spezifischen Bedürfnisse und Projekte zuschneiden.

## Sandboxing

Qwen Code kann potenziell unsichere Operationen (wie Shell-Befehle und Dateiänderungen) innerhalb einer sandboxed Umgebung ausführen, um dein System zu schützen.

Sandboxing ist standardmäßig deaktiviert, aber du kannst es auf verschiedene Arten aktivieren:

- Mit dem Flag `--sandbox` oder `-s`.
- Durch Setzen der Umgebungsvariable `GEMINI_SANDBOX`.
- Sandboxing ist standardmäßig aktiviert, wenn du `--yolo` oder `--approval-mode=yolo` verwendest.

Standardmäßig wird ein vorgefertigtes `qwen-code-sandbox` Docker-Image verwendet.

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

Um uns bei der Verbesserung von Qwen Code zu helfen, sammeln wir anonymisierte Nutzungsdaten. Diese Daten ermöglichen es uns zu verstehen, wie die CLI verwendet wird, häufige Probleme zu erkennen und neue Funktionen gezielt zu priorisieren.

**Was wir sammeln:**

- **Tool-Aufrufe:** Wir protokollieren die Namen der aufgerufenen Tools, ob diese erfolgreich oder fehlerhaft ausgeführt wurden sowie deren Ausführungszeit. Die übergebenen Argumente oder von den Tools zurückgegebenen Daten werden nicht erfasst.
- **API-Anfragen:** Wir erfassen das für jede Anfrage verwendete Modell, die Dauer der Anfrage sowie deren Erfolg. Der Inhalt der Prompts oder Responses wird nicht gespeichert.
- **Sitzungsinformationen:** Informationen zur Konfiguration der CLI, wie z. B. aktivierte Tools und der Genehmigungsmodus, werden ebenfalls erfasst.

**Was wir NICHT sammeln:**

- **Personenbezogene Daten (PII):** Es werden keinerlei persönliche Informationen wie Name, E-Mail-Adresse oder API-Schlüssel gesammelt.
- **Prompt- und Response-Inhalte:** Weder der Inhalt eurer Prompts noch die Antworten des Modells werden protokolliert.
- **Dateiinhalte:** Jeglicher Inhalt von Dateien, die von der CLI gelesen oder geschrieben werden, wird nicht erfasst.

**So deaktivierst du die Sammlung von Nutzungsdaten:**

Du kannst die Erfassung von Nutzungsstatistiken jederzeit deaktivieren, indem du die Eigenschaft `usageStatisticsEnabled` in deiner `settings.json`-Datei auf `false` setzt:

```json
{
  "usageStatisticsEnabled": false
}
```

Hinweis: Wenn die Nutzungsstatistik aktiviert ist, werden Ereignisse an einen Alibaba Cloud RUM-Sammlungsendpunkt gesendet.

- **`enableWelcomeBack`** (boolean):
  - **Beschreibung:** Zeigt beim Zurückkehren zu einem Projekt mit Konversationsverlauf einen „Willkommen zurück“-Dialog an.
  - **Standardwert:** `true`
  - **Kategorie:** UI
  - **Neustart erforderlich:** Nein
  - **Beispiel:** `"enableWelcomeBack": false`
  - **Details:** Ist diese Option aktiviert, erkennt Qwen Code automatisch, wenn du zu einem Projekt mit einer zuvor generierten Projektsynthese (`.qwen/PROJECT_SUMMARY.md`) zurückkehrst, und zeigt einen Dialog an, der dir erlaubt, entweder die vorherige Unterhaltung fortzusetzen oder neu zu beginnen. Diese Funktion ist eng mit dem Befehl `/chat summary` und dem Beenden-Bestätigungsdialog verknüpft. Weitere Informationen findest du in der [Welcome Back Dokumentation](./welcome-back.md).