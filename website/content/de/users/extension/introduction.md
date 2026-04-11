# Qwen Code Extensions

Qwen Code Extensions bündeln Prompts, MCP-Server, Subagents, Skills und benutzerdefinierte Befehle in einem vertrauten und benutzerfreundlichen Format. Mit Extensions kannst du die Funktionen von Qwen Code erweitern und diese mit anderen teilen. Sie sind darauf ausgelegt, einfach installiert und geteilt zu werden.

Extensions und Plugins aus der [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) und dem [Claude Code Marketplace](https://claudemarketplaces.com/) können direkt in Qwen Code installiert werden. Diese plattformübergreifende Kompatibilität gibt dir Zugriff auf ein reichhaltiges Ökosystem an Extensions und Plugins und erweitert die Möglichkeiten von Qwen Code erheblich, ohne dass Extension-Autoren separate Versionen pflegen müssen.

## Extension-Verwaltung

Wir bieten eine Reihe von Tools zur Extension-Verwaltung, die sowohl über `qwen extensions` CLI-Befehle als auch über `/extensions` Slash-Befehle in der interaktiven CLI genutzt werden können.

### Laufzeit-Extension-Verwaltung (Slash-Befehle)

Du kannst Extensions zur Laufzeit in der interaktiven CLI über `/extensions` Slash-Befehle verwalten. Diese Befehle unterstützen Hot-Reloading, sodass Änderungen sofort wirksam werden, ohne die Anwendung neu starten zu müssen.

| Command                               | Description                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `/extensions` oder `/extensions manage` | Alle installierten Extensions verwalten                                              |
| `/extensions install <source>`        | Eine Extension von einer Git-URL, einem lokalen Pfad, einem npm-Paket oder einem Marketplace installieren |
| `/extensions explore [source]`        | Die Extensions-Quellseite (Gemini oder ClaudeCode) im Browser öffnen            |

### CLI-Extension-Verwaltung

Du kannst Extensions auch über `qwen extensions` CLI-Befehle verwalten. Beachte, dass Änderungen über CLI-Befehle erst nach einem Neustart in aktiven CLI-Sessions übernommen werden.

### Installation einer Extension

Du kannst eine Extension mit `qwen extensions install` aus verschiedenen Quellen installieren:

#### Vom Claude Code Marketplace

Qwen Code unterstützt auch Plugins vom [Claude Code Marketplace](https://claudemarketplaces.com/). Installiere sie über einen Marketplace und wähle ein Plugin aus:

```bash
qwen extensions install <marketplace-name>
# or
qwen extensions install <marketplace-github-url>
```

Wenn du ein bestimmtes Plugin installieren möchtest, kannst du das Format mit dem Plugin-Namen verwenden:

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# or
qwen extensions install <marketplace-github-url>:<plugin-name>
```

Um beispielsweise das `prompts.chat` Plugin vom [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) Marketplace zu installieren:

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude-Plugins werden während der Installation automatisch in das Qwen Code Format konvertiert:

- `claude-plugin.json` wird zu `qwen-extension.json` konvertiert
- Agent-Konfigurationen werden in das Qwen Subagent-Format konvertiert
- Skill-Konfigurationen werden in das Qwen Skill-Format konvertiert
- Tool-Mappings werden automatisch verarbeitet

Du kannst verfügbare Extensions aus verschiedenen Marketplaces schnell mit dem `/extensions explore` Befehl durchsuchen:

```bash
# Open Gemini CLI Extensions marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode
```

Dieser Befehl öffnet den jeweiligen Marketplace in deinem Standardbrowser, sodass du neue Extensions entdecken kannst, um dein Qwen Code Erlebnis zu erweitern.

> **Plattformübergreifende Kompatibilität**: Dies ermöglicht dir die Nutzung der umfangreichen Extension-Ökosysteme von Gemini CLI und Claude Code und erweitert die verfügbaren Funktionen für Qwen Code Nutzer erheblich.

#### Von Gemini CLI Extensions

Qwen Code unterstützt Extensions aus der [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) vollständig. Installiere sie einfach über die Git-URL:

```bash
qwen extensions install <gemini-cli-extension-github-url>
# or
qwen extensions install <owner>/<repo>
```

Gemini-Extensions werden während der Installation automatisch in das Qwen Code Format konvertiert:

- `gemini-extension.json` wird zu `qwen-extension.json` konvertiert
- TOML-Befehlsdateien werden automatisch in das Markdown-Format migriert
- MCP-Server, Kontextdateien und Einstellungen bleiben erhalten

#### Von der npm Registry

Qwen Code unterstützt die Installation von Extensions aus npm-Registries über scoped Package-Namen. Dies ist ideal für Teams mit privaten Registries, die bereits über Authentifizierungs-, Versionierungs- und Publishing-Infrastruktur verfügen.

```bash
# Install the latest version
qwen extensions install @scope/my-extension

# Install a specific version
qwen extensions install @scope/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

Es werden nur scoped Packages (`@scope/package-name`) unterstützt, um Mehrdeutigkeiten mit dem `owner/repo` GitHub-Kurzformat zu vermeiden.

**Registry-Auflösung** folgt dieser Priorität:

1. `--registry` CLI-Flag (explizites Überschreiben)
2. Scoped Registry aus `.npmrc` (z. B. `@scope:registry=https://...`)
3. Standard-Registry aus `.npmrc`
4. Fallback: `https://registry.npmjs.org/`

**Authentifizierung** wird automatisch über die `NPM_TOKEN` Umgebungsvariable oder registry-spezifische `_authToken` Einträge in deiner `.npmrc` Datei abgewickelt.

> **Hinweis:** npm-Extensions müssen eine `qwen-extension.json` Datei im Package-Root enthalten, die demselben Format wie jede andere Qwen Code Extension folgt. Details zum Packaging findest du unter [Extension Releasing](./extension-releasing.md#releasing-through-npm-registry).

#### Von einem Git Repository

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Dies installiert die GitHub MCP Server Extension.

#### Von einem lokalen Pfad

```bash
qwen extensions install /path/to/your/extension
```

Beachte, dass wir eine Kopie der installierten Extension erstellen. Du musst daher `qwen extensions update` ausführen, um Änderungen sowohl von lokal definierten Extensions als auch von denen auf GitHub zu übernehmen.

### Deinstallation einer Extension

Führe zur Deinstallation `qwen extensions uninstall extension-name` aus. Im Fall des Installationsbeispiels:

```
qwen extensions uninstall qwen-cli-security
```

### Deaktivieren einer Extension

Extensions sind standardmäßig in allen Workspaces aktiviert. Du kannst eine Extension vollständig oder nur für einen bestimmten Workspace deaktivieren.

Beispielsweise deaktiviert `qwen extensions disable extension-name` die Extension auf Benutzerebene, sodass sie überall deaktiviert ist. `qwen extensions disable extension-name --scope=workspace` deaktiviert die Extension nur im aktuellen Workspace.

### Aktivieren einer Extension

Du kannst Extensions mit `qwen extensions enable extension-name` aktivieren. Du kannst eine Extension auch für einen bestimmten Workspace aktivieren, indem du `qwen extensions enable extension-name --scope=workspace` innerhalb dieses Workspaces ausführst.

Dies ist nützlich, wenn du eine Extension auf oberster Ebene deaktiviert hast und sie nur an bestimmten Stellen aktivieren möchtest.

### Aktualisieren einer Extension

Für Extensions, die von einem lokalen Pfad, einem Git Repository oder einer npm Registry installiert wurden, kannst du mit `qwen extensions update extension-name` explizit auf die neueste Version aktualisieren. Bei npm-Extensions, die ohne Versions-Pin installiert wurden (z. B. `@scope/pkg`), prüfen Updates den `latest` Dist-Tag. Bei Installation mit einem bestimmten Dist-Tag (z. B. `@scope/pkg@beta`) verfolgen Updates diesen Tag. Extensions, die auf eine exakte Version gepinnt sind (z. B. `@scope/pkg@1.2.0`), gelten immer als aktuell.

Du kannst alle Extensions mit folgendem Befehl aktualisieren:

```
qwen extensions update --all
```

## Funktionsweise

Beim Start sucht Qwen Code nach Extensions in `<home>/.qwen/extensions`

Extensions liegen als Verzeichnis vor, das eine `qwen-extension.json` Datei enthält. Beispiel:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Die `qwen-extension.json` Datei enthält die Konfiguration der Extension. Die Datei hat folgende Struktur:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  },
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name`: Der Name der Extension. Dieser wird zur eindeutigen Identifizierung und zur Konfliktlösung verwendet, wenn Extension-Befehle denselben Namen wie Benutzer- oder Projektbefehle haben. Der Name sollte aus Kleinbuchstaben oder Zahlen bestehen und Bindestriche statt Unterstrichen oder Leerzeichen verwenden. So bezeichnen Nutzer deine Extension in der CLI. Beachte, dass dieser Name mit dem Verzeichnisnamen der Extension übereinstimmen muss.
- `version`: Die Version der Extension.
- `mcpServers`: Eine Map von MCP-Servern zur Konfiguration. Der Schlüssel ist der Name des Servers, der Wert ist die Serverkonfiguration. Diese Server werden beim Start geladen, genau wie MCP-Server, die in einer [`settings.json` Datei](./cli/configuration.md) konfiguriert sind. Wenn sowohl eine Extension als auch eine `settings.json` Datei einen MCP-Server mit demselben Namen konfigurieren, hat der in der `settings.json` Datei definierte Server Vorrang.
  - Beachte, dass alle MCP-Server-Konfigurationsoptionen außer `trust` unterstützt werden.
- `channels`: Eine Map von benutzerdefinierten Channel-Adaptern. Der Schlüssel ist der Channel-Typname, der Wert enthält einen `entry` (Pfad zum kompilierten JS-Einstiegspunkt) und optional einen `displayName`. Der Einstiegspunkt muss ein `plugin` Objekt exportieren, das der `ChannelPlugin` Schnittstelle entspricht. Eine vollständige Anleitung findest du unter [Channel Plugins](../features/channels/plugins).
- `contextFileName`: Der Name der Datei, die den Kontext für die Extension enthält. Dieser wird verwendet, um den Kontext aus dem Extensions-Verzeichnis zu laden. Wenn diese Eigenschaft nicht verwendet wird, aber eine `QWEN.md` Datei im Extensions-Verzeichnis vorhanden ist, wird diese Datei geladen.
- `commands`: Das Verzeichnis mit benutzerdefinierten Befehlen (Standard: `commands`). Befehle sind `.md` Dateien, die Prompts definieren.
- `skills`: Das Verzeichnis mit benutzerdefinierten Skills (Standard: `skills`). Skills werden automatisch erkannt und sind über den `/skills` Befehl verfügbar.
- `agents`: Das Verzeichnis mit benutzerdefinierten Subagents (Standard: `agents`). Subagents sind `.yaml` oder `.md` Dateien, die spezialisierte KI-Assistenten definieren.
- `settings`: Ein Array von Einstellungen, die die Extension benötigt. Bei der Installation werden Nutzer aufgefordert, Werte für diese Einstellungen anzugeben. Die Werte werden sicher gespeichert und als Umgebungsvariablen an MCP-Server übergeben.
  - Jede Einstellung hat folgende Eigenschaften:
    - `name`: Anzeigename der Einstellung
    - `description`: Beschreibung, wofür diese Einstellung verwendet wird
    - `envVar`: Der Name der Umgebungsvariable, die gesetzt wird
    - `sensitive`: Boolescher Wert, der angibt, ob der Wert verborgen werden soll (z. B. API-Keys, Passwörter)

### Verwaltung von Extension-Einstellungen

Extensions können Konfigurationen über Einstellungen (z. B. API-Keys oder Credentials) erfordern. Diese Einstellungen können über den `qwen extensions settings` CLI-Befehl verwaltet werden:

**Einstellungswert festlegen:**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**Alle Einstellungen einer Extension auflisten:**

```bash
qwen extensions settings list <extension-name>
```

**Aktuelle Werte anzeigen (Benutzer und Workspace):**

```bash
qwen extensions settings show <extension-name> <setting-name>
```

**Einstellungswert entfernen:**

```bash
qwen extensions settings unset <extension-name> <setting-name> [--scope user|workspace]
```

Einstellungen können auf zwei Ebenen konfiguriert werden:

- **Benutzerebene** (Standard): Einstellungen gelten projektübergreifend (`~/.qwen/.env`)
- **Workspace-Ebene**: Einstellungen gelten nur für das aktuelle Projekt (`.qwen/.env`)

Workspace-Einstellungen haben Vorrang vor Benutzereinstellungen. Sensible Einstellungen werden sicher gespeichert und niemals im Klartext angezeigt.

Beim Start von Qwen Code werden alle Extensions geladen und ihre Konfigurationen zusammengeführt. Bei Konflikten hat die Workspace-Konfiguration Vorrang.

### Benutzerdefinierte Befehle

Extensions können [benutzerdefinierte Befehle](./cli/commands.md#custom-commands) bereitstellen, indem Markdown-Dateien in einem `commands/` Unterverzeichnis innerhalb des Extensions-Verzeichnisses abgelegt werden. Diese Befehle folgen demselben Format wie benutzer- und projektspezifische Befehle und verwenden Standard-Namenskonventionen.

> **Hinweis:** Das Befehlsformat wurde von TOML auf Markdown aktualisiert. TOML-Dateien sind veraltet, werden aber weiterhin unterstützt. Du kannst bestehende TOML-Befehle über den automatischen Migrations-Prompt migrieren, der beim Erkennen von TOML-Dateien angezeigt wird.

**Beispiel**

Eine Extension namens `gcp` mit folgender Struktur:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

Stellt folgende Befehle bereit:

- `/deploy` - Wird in der Hilfe als `[gcp] Custom command from deploy.md` angezeigt
- `/gcs:sync` - Wird in der Hilfe als `[gcp] Custom command from sync.md` angezeigt

### Benutzerdefinierte Skills

Extensions können benutzerdefinierte Skills bereitstellen, indem Skill-Dateien in einem `skills/` Unterverzeichnis innerhalb des Extensions-Verzeichnisses abgelegt werden. Jeder Skill sollte eine `SKILL.md` Datei mit YAML-Frontmatter enthalten, die den Namen und die Beschreibung des Skills definiert.

**Beispiel**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

Der Skill ist über den `/skills` Befehl verfügbar, wenn die Extension aktiv ist.

### Benutzerdefinierte Subagents

Extensions können benutzerdefinierte Subagents bereitstellen, indem Agent-Konfigurationsdateien in einem `agents/` Unterverzeichnis innerhalb des Extensions-Verzeichnisses abgelegt werden. Agents werden über YAML- oder Markdown-Dateien definiert.

**Beispiel**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Extension-Subagents erscheinen im Subagent-Manager-Dialog im Bereich "Extension Agents".

### Konfliktlösung

Extension-Befehle haben die niedrigste Priorität. Wenn ein Konflikt mit Benutzer- oder Projektbefehlen auftritt:

1. **Kein Konflikt**: Der Extension-Befehl verwendet seinen natürlichen Namen (z. B. `/deploy`)
2. **Mit Konflikt**: Der Extension-Befehl wird mit dem Extension-Präfix umbenannt (z. B. `/gcp.deploy`)

Wenn beispielsweise sowohl ein Benutzer als auch die `gcp` Extension einen `deploy` Befehl definieren:

- `/deploy` - Führt den deploy-Befehl des Benutzers aus
- `/gcp.deploy` - Führt den deploy-Befehl der Extension aus (gekennzeichnet mit `[gcp]` Tag)

## Variablen

Qwen Code Extensions erlauben die Variablenersetzung in `qwen-extension.json`. Dies ist nützlich, wenn du z. B. das aktuelle Verzeichnis benötigst, um einen MCP-Server mit `"cwd": "${extensionPath}${/}run.ts"` auszuführen.

**Unterstützte Variablen:**

| variable                   | description                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Der vollständige Pfad der Extension im Dateisystem des Benutzers, z. B. `/Users/username/.qwen/extensions/example-extension`. Symlinks werden nicht aufgelöst. |
| `${workspacePath}`         | Der vollständige Pfad des aktuellen Workspaces.                                                                                                            |
| `${/} or ${pathSeparator}` | Das Pfadtrennzeichen (unterschiedlich je nach Betriebssystem).                                                                                                                          |