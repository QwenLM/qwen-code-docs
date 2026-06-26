# Qwen Code Erweiterungen

Qwen Code Erweiterungen bündeln Prompts, MCP-Server, Subagents, Skills und benutzerdefinierte Befehle in einem vertrauten und benutzerfreundlichen Format. Mit Erweiterungen können Sie die Fähigkeiten von Qwen Code erweitern und diese Fähigkeiten mit anderen teilen. Sie sind so konzipiert, dass sie einfach installiert und geteilt werden können.

Erweiterungen und Plugins aus der [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) und dem [Claude Code Marketplace](https://claudemarketplaces.com/) können direkt in Qwen Code installiert werden. Diese plattformübergreifende Kompatibilität gibt Ihnen Zugriff auf ein reichhaltiges Ökosystem an Erweiterungen und Plugins und erweitert die Fähigkeiten von Qwen Code erheblich, ohne dass die Autoren der Erweiterungen separate Versionen pflegen müssen.

## Erweiterungsverwaltung

Wir bieten eine Reihe von Erweiterungsverwaltungswerkzeugen, sowohl über `qwen extensions` CLI-Befehle als auch über `/extensions` Slash-Befehle innerhalb der interaktiven CLI.

### Laufzeit-Verwaltung von Erweiterungen (Slash-Befehle)

Sie können Erweiterungen zur Laufzeit innerhalb der interaktiven CLI mit `/extensions` Slash-Befehlen verwalten. Diese Befehle unterstützen Hot-Reloading, d. h. Änderungen werden sofort wirksam, ohne dass die Anwendung neu gestartet werden muss.

| Befehl                               | Beschreibung                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/extensions` oder `/extensions manage` | Alle installierten Erweiterungen verwalten                                                          |
| `/extensions install <source>`        | Eine Erweiterung von einer Git-URL, einem lokalen Pfad oder Archiv, einer Archiv-URL, einem npm-Paket oder einem Marktplatz installieren |
| `/extensions explore [source]`        | Die Quellseite für Erweiterungen (Gemini oder ClaudeCode) im Browser öffnen                         |

#### Der interaktive Erweiterungsmanager

Durch Ausführen von `/extensions` (oder `/extensions manage`) wird ein interaktiver Manager mit drei Registerkarten geöffnet. Drücken Sie `Tab` oder die Pfeile `←`/`→`, um zwischen ihnen zu wechseln.

- **Entdecken** — Durchsuchen Sie Plugins aus Ihren konfigurierten Marktplatzquellen. Geben Sie ein, um zu suchen, drücken Sie `Enter`, um die Details eines Plugins anzuzeigen, und installieren Sie es (Sie werden aufgefordert, einen Installationsbereich auszuwählen). Drücken Sie `Ctrl+R`, um die Listings neu zu laden, und `Esc`, um zurückzugehen.
- **Installiert** — Ihre installierten Erweiterungen, gruppiert nach Bereich (**Benutzerebene**, **Projektebene** und Favoriten). Verwenden Sie `↑`/`↓` zum Navigieren, `Leertaste` zum Aktivieren/Deaktivieren einer Erweiterung, `f` zum Favorisieren und `Enter`, um die Details zu öffnen. MCP-Server, die von einer Erweiterung gebündelt werden, werden unter ihrer übergeordneten Erweiterung mit Live-Verbindungsstatus angezeigt; Sie können jeden Server von dort aus einzeln aktivieren oder deaktivieren.
- **Quellen** — Verwalten Sie die Marktplatzquellen, die die Registerkarte „Entdecken“ speisen. Verwenden Sie `↑`/`↓` zum Navigieren, `Enter` zum Auswählen einer Quelle und `d` zum Entfernen einer Quelle. Dies sind dieselben Quellen, die auch von den unten beschriebenen `qwen extensions sources` CLI-Befehlen verwaltet werden.

Hier vorgenommene Änderungen werden sofort per Hot-Reload übernommen, ohne dass Qwen Code neu gestartet werden muss.

### CLI-Erweiterungsverwaltung

Sie können Erweiterungen auch mit `qwen extensions` CLI-Befehlen verwalten. Beachten Sie, dass Änderungen, die über CLI-Befehle vorgenommen werden, in aktiven CLI-Sitzungen erst nach einem Neustart wirksam werden.

### Installieren einer Erweiterung

Sie können eine Erweiterung mit `qwen extensions install` aus verschiedenen Quellen installieren:

#### Vom Claude Code Marketplace

Qwen Code unterstützt auch Plugins aus dem [Claude Code Marketplace](https://claudemarketplaces.com/). Installieren Sie von einem Marktplatz und wählen Sie ein Plugin aus:

```bash
qwen extensions install <marketplace-name>
# or
qwen extensions install <marketplace-github-url>
```

Wenn Sie ein bestimmtes Plugin installieren möchten, können Sie das Format mit dem Plugin-Namen verwenden:

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# or
qwen extensions install <marketplace-github-url>:<plugin-name>
```

Um zum Beispiel das Plugin `prompts.chat` aus dem Marktplatz [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) zu installieren:

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude-Plugins werden während der Installation automatisch in das Qwen Code-Format konvertiert:

- `claude-plugin.json` wird in `qwen-extension.json` konvertiert
- Agent-Konfigurationen werden in das Qwen-Subagent-Format konvertiert
- Skill-Konfigurationen werden in das Qwen-Skill-Format konvertiert
- Tool-Zuordnungen werden automatisch behandelt

Sie können verfügbare Erweiterungen aus verschiedenen Marktplätzen schnell mit dem Befehl `/extensions explore` durchsuchen:

```bash
# Open Gemini CLI Extensions marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode
```

Dieser Befehl öffnet den jeweiligen Marktplatz in Ihrem Standardbrowser, sodass Sie neue Erweiterungen entdecken können, um Ihr Qwen Code-Erlebnis zu verbessern.

> **Plattformübergreifende Kompatibilität**: Dies ermöglicht es Ihnen, die reichhaltigen Erweiterungsökosysteme sowohl von Gemini CLI als auch von Claude Code zu nutzen und die verfügbare Funktionalität für Qwen Code-Benutzer erheblich zu erweitern.

#### Von Gemini CLI-Erweiterungen

Qwen Code unterstützt vollständig Erweiterungen aus der [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/). Installieren Sie sie einfach mit der Git-URL:

```bash
qwen extensions install <gemini-cli-extension-github-url>
# or
qwen extensions install <owner>/<repo>
```

Gemini-Erweiterungen werden während der Installation automatisch in das Qwen Code-Format konvertiert:

- `gemini-extension.json` wird in `qwen-extension.json` konvertiert
- TOML-Befehlsdateien werden automatisch in das Markdown-Format migriert
- MCP-Server, Kontextdateien und Einstellungen bleiben erhalten

#### Aus der npm-Registry

Qwen Code unterstützt die Installation von Erweiterungen aus npm-Registries mit scoped Package-Namen. Dies ist ideal für Teams mit privaten Registries, die bereits über Authentifizierung, Versionierung und Veröffentlichungsinfrastruktur verfügen.

```bash
# Install the latest version
qwen extensions install @scope/my-extension

# Install a specific version
qwen extensions install @scope/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

Es werden nur scoped Packages (`@scope/package-name`) unterstützt, um Verwechslungen mit der `owner/repo`-Kurzform von GitHub zu vermeiden.

**Registry-Auflösung** erfolgt nach dieser Priorität:

1. `--registry` CLI-Flag (explizite Überschreibung)
2. Scoped Registry aus `.npmrc` (z.B. `@scope:registry=https://...`)
3. Standard-Registry aus `.npmrc`
4. Fallback: `https://registry.npmjs.org/`

**Authentifizierung** wird automatisch über die Umgebungsvariable `NPM_TOKEN` oder registriespezifische `_authToken`-Einträge in Ihrer `.npmrc`-Datei gehandhabt.

> **Hinweis:** npm-Erweiterungen müssen eine `qwen-extension.json`-Datei im Paketstammverzeichnis enthalten, die dem gleichen Format wie jede andere Qwen Code-Erweiterung folgt. Siehe [Erweiterungen veröffentlichen](./extension-releasing.md#releasing-through-npm-registry) für Details zur Paketierung.

#### Aus einem Git-Repository

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Dadurch wird die GitHub MCP Server-Erweiterung installiert.

#### Von einem lokalen Pfad

```bash
qwen extensions install /path/to/your/extension
```

Lokale `.zip`- und `.tar.gz`-Archive werden ebenfalls unterstützt:

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

Das Archiv muss eine vollständige Erweiterung im Stammverzeichnis enthalten, oder ein einzelnes übergeordnetes Verzeichnis, das die Erweiterung enthält.

Beachten Sie, dass wir eine Kopie der installierten Erweiterung erstellen. Sie müssen daher `qwen extensions update` ausführen, um Änderungen sowohl von lokal definierten Erweiterungen als auch von solchen auf GitHub zu übernehmen.

#### Von einer Archiv-URL

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

Archiv-URLs können später aktualisiert werden, solange die URL weiterhin auf ein neueres Archiv für dieselbe Erweiterung verweist.

#### Installationsbereich auswählen

Standardmäßig ist eine installierte Erweiterung global aktiviert (Benutzerbereich). Verwenden Sie `--scope project`, um sie nur für den aktuellen Arbeitsbereich zu aktivieren:

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` wird als Alias von `--scope project` akzeptiert. Dies entspricht der Bereichsauswahl, die bei der Installation über die Registerkarte „Entdecken“ in `/extensions manage` angeboten wird.

### Marktplatzquellen verwalten

Marktplatzquellen (Claude-Plugin-Marktplätze) versorgen die Registerkarte „Entdecken“ in `/extensions manage`. Sie können sie auch über die CLI verwalten:

```bash
# Add a marketplace (owner/repo, git URL, https URL to marketplace.json, or local path)
qwen extensions sources add <source>

# List configured marketplaces
qwen extensions sources list

# Re-fetch a marketplace's plugin listing
qwen extensions sources update <name>

# Remove a marketplace
qwen extensions sources remove <name>
```

### Deinstallieren einer Erweiterung

Um zu deinstallieren, führen Sie `qwen extensions uninstall extension-name` aus, also im Fall des Installationsbeispiels:

```
qwen extensions uninstall qwen-cli-security
```

### Deaktivieren einer Erweiterung

Erweiterungen sind standardmäßig in allen Arbeitsbereichen aktiviert. Sie können eine Erweiterung vollständig oder nur für einen bestimmten Arbeitsbereich deaktivieren.

Zum Beispiel deaktiviert `qwen extensions disable extension-name` die Erweiterung auf Benutzerebene, sodass sie überall deaktiviert ist. `qwen extensions disable extension-name --scope=workspace` deaktiviert die Erweiterung nur im aktuellen Arbeitsbereich.

### Aktivieren einer Erweiterung

Sie können Erweiterungen mit `qwen extensions enable extension-name` aktivieren. Sie können eine Erweiterung auch für einen bestimmten Arbeitsbereich aktivieren, indem Sie `qwen extensions enable extension-name --scope=workspace` innerhalb dieses Arbeitsbereichs ausführen.

Dies ist nützlich, wenn Sie eine Erweiterung auf oberster Ebene deaktiviert haben und sie nur an bestimmten Stellen aktivieren möchten.

### Aktualisieren einer Erweiterung

Für Erweiterungen, die von einem lokalen Pfad oder Archiv, einer Archiv-URL, einem Git-Repository oder einer npm-Registry installiert wurden, können Sie explizit auf die neueste Version aktualisieren mit `qwen extensions update extension-name`. Bei npm-Erweiterungen, die ohne Versionsfestlegung installiert wurden (z.B. `@scope/pkg`), wird bei Updates der `latest`-Dist-Tag verwendet. Bei Erweiterungen, die mit einem bestimmten Dist-Tag installiert wurden (z.B. `@scope/pkg@beta`), folgen Updates diesem Tag. Erweiterungen, die auf eine exakte Version festgelegt sind (z.B. `@scope/pkg@1.2.0`), werden immer als aktuell betrachtet.

Sie können alle Erweiterungen aktualisieren mit:

```
qwen extensions update --all
```

## Funktionsweise

Beim Start sucht Qwen Code im Verzeichnis `<home>/.qwen/extensions` nach Erweiterungen.

Erweiterungen liegen als Verzeichnis vor, das eine `qwen-extension.json`-Datei enthält. Zum Beispiel:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Die Datei `qwen-extension.json` enthält die Konfiguration der Erweiterung. Die Datei hat die folgende Struktur:

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

- `name`: Der Name der Erweiterung. Dieser wird verwendet, um die Erweiterung eindeutig zu identifizieren und für die Konfliktlösung, wenn Erweiterungsbefehle denselben Namen wie Benutzer- oder Projektbefehle haben. Der Name sollte aus Kleinbuchstaben oder Zahlen bestehen und Bindestriche anstelle von Unterstrichen oder Leerzeichen verwenden. So werden Benutzer auf Ihre Erweiterung in der CLI verweisen. Beachten Sie, dass dieser Name mit dem Erweiterungsverzeichnisnamen übereinstimmen muss.
- `version`: Die Version der Erweiterung.
- `mcpServers`: Eine Map von MCP-Servern, die konfiguriert werden sollen. Der Schlüssel ist der Name des Servers, der Wert ist die Serverkonfiguration. Diese Server werden beim Start geladen, genau wie MCP-Server, die in einer [`settings.json`-Datei](../configuration/settings.md) konfiguriert sind. Wenn sowohl eine Erweiterung als auch eine `settings.json`-Datei einen MCP-Server mit demselben Namen konfigurieren, hat der in der `settings.json`-Datei definierte Server Vorrang.
  - Beachten Sie, dass alle MCP-Server-Konfigurationsoptionen außer `trust` unterstützt werden.
- `channels`: Eine Map von benutzerdefinierten Channel-Adaptern. Der Schlüssel ist der Channel-Typ-Name, der Wert hat einen `entry` (Pfad zum kompilierten JS-Einstiegspunkt) und optionalen `displayName`. Der Einstiegspunkt muss ein `plugin`-Objekt exportieren, das dem `ChannelPlugin`-Interface entspricht. Siehe [Channel-Plugins](../features/channels/plugins) für eine vollständige Anleitung.
- `contextFileName`: Der Name der Datei, die den Kontext für die Erweiterung enthält. Diese wird verwendet, um den Kontext aus dem Erweiterungsverzeichnis zu laden. Wenn diese Eigenschaft nicht verwendet wird, aber eine `QWEN.md`-Datei im Erweiterungsverzeichnis vorhanden ist, wird diese Datei geladen.
- `commands`: Das Verzeichnis, das benutzerdefinierte Befehle enthält (Standard: `commands`). Befehle sind `.md`-Dateien, die Prompts definieren.
- `skills`: Das Verzeichnis, das benutzerdefinierte Skills enthält (Standard: `skills`). Skills werden automatisch erkannt und sind über den Befehl `/skills` verfügbar.
- `agents`: Das Verzeichnis, das benutzerdefinierte Subagents enthält (Standard: `agents`). Subagents sind `.yaml`- oder `.md`-Dateien, die spezialisierte KI-Assistenten definieren.
- `settings`: Ein Array von Einstellungen, die die Erweiterung benötigt. Bei der Installation werden Benutzer aufgefordert, Werte für diese Einstellungen anzugeben. Die Werte werden sicher gespeichert und an MCP-Server als Umgebungsvariablen übergeben.
  - Jede Einstellung hat die folgenden Eigenschaften:
    - `name`: Anzeigename für die Einstellung
    - `description`: Eine Beschreibung, wofür diese Einstellung verwendet wird
    - `envVar`: Der Name der Umgebungsvariablen, die gesetzt wird
    - `sensitive`: Boolean, der angibt, ob der Wert ausgeblendet werden soll (z.B. API-Schlüssel, Passwörter)

### Erweiterungseinstellungen verwalten

Erweiterungen können über Einstellungen (wie API-Schlüssel oder Anmeldedaten) eine Konfiguration erfordern. Diese Einstellungen können mit dem CLI-Befehl `qwen extensions settings` verwaltet werden:

**Einen Einstellungswert setzen:**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**Alle Einstellungen und aktuellen Werte für eine Erweiterung auflisten:**

```bash
qwen extensions settings list <extension-name>
```

Einstellungen können auf zwei Ebenen konfiguriert werden:

- **Benutzerebene** (Standard): Einstellungen gelten für alle Projekte (`~/.qwen/.env`)
- **Arbeitsbereichsebene**: Einstellungen gelten nur für das aktuelle Projekt (`.qwen/.env`)

Arbeitsbereichseinstellungen haben Vorrang vor Benutzereinstellungen. Vertrauliche Einstellungen werden sicher gespeichert und niemals im Klartext angezeigt.

Beim Start lädt Qwen Code alle Erweiterungen und führt ihre Konfigurationen zusammen. Bei Konflikten hat die Arbeitsbereichskonfiguration Vorrang.

### Benutzerdefinierte Befehle

Erweiterungen können [benutzerdefinierte Befehle](../features/commands.md#4-custom-commands) bereitstellen, indem sie Markdown-Dateien in einem Unterverzeichnis `commands/` innerhalb des Erweiterungsverzeichnisses ablegen. Diese Befehle folgen dem gleichen Format wie benutzerdefinierte Benutzer- und Projektbefehle und verwenden Standard-Namenskonventionen.

> **Hinweis:** Das Befehlsformat wurde von TOML auf Markdown aktualisiert. TOML-Dateien sind veraltet, aber weiterhin unterstützt. Sie können vorhandene TOML-Befehle mit der automatischen Migrationsaufforderung migrieren, die beim Erkennen von TOML-Dateien angezeigt wird.

**Beispiel**

Eine Erweiterung mit dem Namen `gcp` mit der folgenden Struktur:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

Würde diese Befehle bereitstellen:

- `/deploy` - Wird in der Hilfe als `[gcp] Benutzerdefinierter Befehl aus deploy.md` angezeigt
- `/gcs:sync` - Wird in der Hilfe als `[gcp] Benutzerdefinierter Befehl aus sync.md` angezeigt

### Benutzerdefinierte Skills

Erweiterungen können benutzerdefinierte Skills bereitstellen, indem sie Skill-Dateien in einem Unterverzeichnis `skills/` innerhalb des Erweiterungsverzeichnisses ablegen. Jeder Skill sollte eine `SKILL.md`-Datei mit YAML-Frontmatter enthalten, die den Namen und die Beschreibung des Skills definiert.

**Beispiel**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

Der Skill ist über den Befehl `/skills` verfügbar, wenn die Erweiterung aktiv ist.

### Benutzerdefinierte Subagents

Erweiterungen können benutzerdefinierte Subagents bereitstellen, indem sie Agent-Konfigurationsdateien in einem Unterverzeichnis `agents/` innerhalb des Erweiterungsverzeichnisses ablegen. Agents werden mit YAML- oder Markdown-Dateien definiert.

**Beispiel**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Erweiterungs-Subagents erscheinen im Subagent-Manager-Dialog unter dem Abschnitt „Erweiterungs-Agents“.

### Konfliktlösung

Erweiterungsbefehle haben die niedrigste Priorität. Wenn ein Konflikt mit Benutzer- oder Projektbefehlen auftritt:

1. **Kein Konflikt**: Der Erweiterungsbefehl verwendet seinen natürlichen Namen (z.B. `/deploy`)
2. **Mit Konflikt**: Der Erweiterungsbefehl wird mit dem Erweiterungspräfix umbenannt (z.B. `/gcp.deploy`)

Wenn zum Beispiel sowohl ein Benutzer als auch die Erweiterung `gcp` einen `deploy`-Befehl definieren:

- `/deploy` - Führt den deploy-Befehl des Benutzers aus
- `/gcp.deploy` - Führt den deploy-Befehl der Erweiterung aus (gekennzeichnet mit dem Tag `[gcp]`)

## Variablen

Qwen Code-Erweiterungen erlauben die Substitution von Variablen in `qwen-extension.json`. Dies kann nützlich sein, wenn Sie z. B. das aktuelle Verzeichnis benötigen, um einen MCP-Server mit `"cwd": "${extensionPath}${/}run.ts"` auszuführen.

**Unterstützte Variablen:**

| Variable                      | Beschreibung                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`            | Der vollständige Pfad der Erweiterung im Dateisystem des Benutzers, z.B. '/Users/username/.qwen/extensions/example-extension'. Symlinks werden nicht aufgelöst. |
| `${workspacePath}`            | Der vollständige Pfad des aktuellen Arbeitsbereichs.                                                              |
| `${/} oder ${pathSeparator}`   | Der Pfadtrenner (unterschiedlich je nach Betriebssystem).                                                         |