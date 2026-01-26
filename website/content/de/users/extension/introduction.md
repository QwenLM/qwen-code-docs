# Qwen Code-Erweiterungen

Qwen Code-Erweiterungen packen Prompts, MCP-Server, Subagenten, Skills und benutzerdefinierte Befehle in ein vertrautes und benutzerfreundliches Format. Mit Erweiterungen können Sie die Funktionen von Qwen Code erweitern und diese Fähigkeiten mit anderen teilen. Sie sind so konzipiert, dass sie einfach zu installieren und weiterzuverbreiten sind.

Erweiterungen und Plugins aus der [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) und dem [Claude Code Marketplace](https://claudemarketplaces.com/) können direkt in Qwen Code installiert werden. Diese plattformübergreifende Kompatibilität gibt Ihnen Zugang zu einem reichen Ökosystem an Erweiterungen und Plugins und erweitert die Funktionalität von Qwen Code erheblich, ohne dass Autoren von Erweiterungen separate Versionen pflegen müssen.

## Erweiterungsverwaltung

Wir bieten eine Reihe von Tools zur Verwaltung von Erweiterungen über die `qwen extensions` CLI-Befehle sowie über die `/extensions` Slash-Befehle innerhalb der interaktiven CLI an.

### Laufzeit-Erweiterungsverwaltung (Slash-Befehle)

Sie können Erweiterungen zur Laufzeit innerhalb der interaktiven CLI mithilfe von `/extensions` Slash-Befehlen verwalten. Diese Befehle unterstützen das Hot-Reloading, was bedeutet, dass Änderungen sofort wirksam werden, ohne die Anwendung neu starten zu müssen.

| Befehl                                                 | Beschreibung                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `/extensions` oder `/extensions list`                  | Liste aller installierten Erweiterungen mit ihrem Status          |
| `/extensions install <quelle>`                         | Installiere eine Erweiterung aus einer Git-URL, lokalen Pfad oder Marktplatz |
| `/extensions uninstall <name>`                         | Deinstalliere eine Erweiterung                                    |
| `/extensions enable <name> --scope <user\|workspace>`  | Aktiviere eine Erweiterung                                        |
| `/extensions disable <name> --scope <user\|workspace>` | Deaktiviere eine Erweiterung                                      |
| `/extensions update <name>`                            | Aktualisiere eine bestimmte Erweiterung                           |
| `/extensions update --all`                             | Aktualisiere alle Erweiterungen mit verfügbaren Updates           |
| `/extensions detail <name>`                            | Zeige Details einer Erweiterung                                   |
| `/extensions explore [quelle]`                         | Öffne die Erweiterungsquellenseite (Gemini oder ClaudeCode) in deinem Browser |

### Verwaltung von CLI-Erweiterungen

Sie können Erweiterungen auch über die Befehle `qwen extensions` in der CLI verwalten. Beachten Sie, dass Änderungen, die über CLI-Befehle vorgenommen werden, sich bei Neustart in aktiven CLI-Sitzungen widerspiegeln.

### Installation einer Erweiterung

Sie können eine Erweiterung mit `qwen extensions install` aus verschiedenen Quellen installieren:

#### Aus dem Claude Code Marktplatz

Qwen Code unterstützt auch Plugins aus dem [Claude Code Marketplace](https://claudemarketplaces.com/). Installieren Sie aus einem Marktplatz und wählen Sie ein Plugin:

```bash
qwen extensions install <marktplatz-name>

# oder
qwen extensions install <marktplatz-github-url>
```

Wenn Sie ein bestimmtes Plugin installieren möchten, können Sie das Format mit dem Plugin-Namen verwenden:

```bash
qwen extensions install <marktplatz-name>:<plugin-name>
```

# oder
qwen extensions install <markt-github-url>:<plugin-name>
```

Zum Beispiel, um das Plugin `prompts.chat` aus dem Marketplace [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) zu installieren:

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat

# oder
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude-Plugins werden während der Installation automatisch ins Qwen Code-Format konvertiert:

- `claude-plugin.json` wird zu `qwen-extension.json` konvertiert
- Agenten-Konfigurationen werden ins Qwen-Subagentenformat konvertiert
- Skill-Konfigurationen werden ins Qwen-Skillformat konvertiert
- Tool-Mappings werden automatisch verarbeitet

Sie können mit dem Befehl `/extensions explore` schnell verfügbare Erweiterungen aus verschiedenen Marketplaces durchsuchen:

```bash

# Öffne den Gemini CLI Extensions Marketplace
/extensions explore Gemini

# Qwen Code Marketplace öffnen
/extensions QwenCode erkunden
```

Dieser Befehl öffnet den jeweiligen Marktplatz in Ihrem Standardbrowser und ermöglicht es Ihnen, neue Erweiterungen zu entdecken, die Ihr Qwen Code-Erlebnis verbessern.

> **Plattformübergreifende Kompatibilität**: Dadurch können Sie auf die umfangreichen Erweiterungsökosysteme von Gemini CLI und Claude Code zugreifen, was die verfügbare Funktionalität für Qwen Code-Benutzer erheblich erweitert.

#### Von Gemini CLI-Erweiterungen

Qwen Code unterstützt vollständig Erweiterungen aus der [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/). Installieren Sie sie einfach über die Git-URL:

```bash
qwen extensions install <gemini-cli-extension-github-url>

# oder
qwen extensions install <owner>/<repo>
```

Gemini-Erweiterungen werden während der Installation automatisch ins Qwen Code-Format konvertiert:

- `gemini-extension.json` wird in `qwen-extension.json` umgewandelt
- TOML-Befehlsdateien werden automatisch ins Markdown-Format migriert
- MCP-Server, Kontextdateien und Einstellungen bleiben erhalten

#### Von Git-Repository

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Dadurch wird die GitHub-MCP-Server-Erweiterung installiert.

#### Vom lokalen Pfad

```bash
qwen extensions install /path/to/your/extension
```

Beachten Sie, dass wir eine Kopie der installierten Erweiterung erstellen, daher müssen Sie `qwen extensions update` ausführen, um Änderungen sowohl von lokal definierten Erweiterungen als auch von denen auf GitHub zu übernehmen.

### Deinstallieren einer Erweiterung

Zum Deinstallieren führen Sie `qwen extensions uninstall extension-name` aus, also im Fall des Installationsbeispiels:

```
qwen extensions uninstall qwen-cli-security
```

### Deaktivieren einer Erweiterung

Erweiterungen sind standardmäßig in allen Arbeitsbereichen aktiviert. Sie können eine Erweiterung vollständig oder nur für einen bestimmten Arbeitsbereich deaktivieren.

Beispielsweise wird durch `qwen extensions disable extension-name` die Erweiterung auf Benutzerebene deaktiviert, sodass sie überall deaktiviert ist. `qwen extensions disable extension-name --scope=workspace` deaktiviert die Erweiterung nur im aktuellen Arbeitsbereich.

### Aktivieren einer Erweiterung

Sie können Erweiterungen mit `qwen extensions enable extension-name` aktivieren. Sie können auch eine Erweiterung für einen bestimmten Arbeitsbereich aktivieren, indem Sie `qwen extensions enable extension-name --scope=workspace` innerhalb dieses Arbeitsbereichs ausführen.

Dies ist nützlich, wenn Sie eine Erweiterung auf oberster Ebene deaktiviert haben und sie nur an bestimmten Stellen aktivieren möchten.

### Aktualisieren einer Erweiterung

Für Erweiterungen, die aus einem lokalen Pfad oder einem Git-Repository installiert wurden, können Sie explizit auf die neueste Version aktualisieren (wie sie im `version`-Feld der `qwen-extension.json` angegeben ist) mit `qwen extensions update Erweiterungsname`.

Sie können alle Erweiterungen mit folgendem Befehl aktualisieren:

```
qwen extensions update --all
```

## Funktionsweise

Beim Start sucht Qwen Code nach Erweiterungen in `<home>/.qwen/extensions`.

Erweiterungen existieren als Verzeichnis, das eine `qwen-extension.json`-Datei enthält. Beispiel:

`<home>/.qwen/extensions/meine-erweiterung/qwen-extension.json`

### `qwen-extension.json`

Die Datei `qwen-extension.json` enthält die Konfiguration für die Erweiterung. Die Datei hat folgende Struktur:

```json
{
  "name": "meine-erweiterung",
  "version": "1.0.0",
  "mcpServers": {
    "mein-server": {
      "command": "node mein-server.js"
    }
  },
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "API-Schlüssel",
      "description": "Ihr API-Schlüssel für den Dienst",
      "envVar": "MEIN_API_SCHLUESSEL",
      "sensitive": true
    }
  ]
}
```

- `name`: Der Name der Erweiterung. Dies wird verwendet, um die Erweiterung eindeutig zu identifizieren und zur Konfliktlösung, wenn Befehle der Erweiterung denselben Namen wie Benutzer- oder Projektbefehle haben. Der Name sollte aus Kleinbuchstaben oder Zahlen bestehen und Bindestriche statt Unterstrichen oder Leerzeichen verwenden. So werden Benutzer Ihre Erweiterung in der CLI ansprechen. Beachten Sie, dass dieser Name mit dem Verzeichnisnamen der Erweiterung übereinstimmen sollte.
- `version`: Die Version der Erweiterung.
- `mcpServers`: Eine Abbildung von MCP-Servern zur Konfiguration. Der Schlüssel ist der Name des Servers und der Wert ist die Serverkonfiguration. Diese Server werden beim Start geladen, genau wie MCP-Server, die in einer [`settings.json`-Datei](./cli/configuration.md) konfiguriert sind. Wenn sowohl eine Erweiterung als auch eine `settings.json`-Datei einen MCP-Server mit gleichem Namen konfigurieren, hat der in der `settings.json`-Datei definierte Server Vorrang.
  - Beachten Sie, dass alle MCP-Server-Konfigurationsoptionen unterstützt werden, außer `trust`.
- `contextFileName`: Der Name der Datei, die den Kontext für die Erweiterung enthält. Dies wird verwendet, um den Kontext aus dem Erweiterungsverzeichnis zu laden. Wenn diese Eigenschaft nicht verwendet wird, aber eine `QWEN.md`-Datei im Erweiterungsverzeichnis vorhanden ist, wird diese Datei geladen.
- `commands`: Das Verzeichnis, das benutzerdefinierte Befehle enthält (Standard: `commands`). Befehle sind `.md`-Dateien, die Prompts definieren.
- `skills`: Das Verzeichnis, das benutzerdefinierte Fähigkeiten enthält (Standard: `skills`). Fähigkeiten werden automatisch erkannt und über den Befehl `/skills` verfügbar.
- `agents`: Das Verzeichnis, das benutzerdefinierte Subagenten enthält (Standard: `agents`). Subagenten sind `.yaml`- oder `.md`-Dateien, die spezialisierte KI-Assistenten definieren.
- `settings`: Ein Array von Einstellungen, die die Erweiterung benötigt. Beim Installieren werden Benutzer gebeten, Werte für diese Einstellungen bereitzustellen. Die Werte werden sicher gespeichert und als Umgebungsvariablen an MCP-Server übergeben.
  - Jede Einstellung hat folgende Eigenschaften:
    - `name`: Anzeigename für die Einstellung
    - `description`: Eine Beschreibung dafür, wofür diese Einstellung verwendet wird
    - `envVar`: Der Name der Umgebungsvariablen, die gesetzt wird
    - `sensitive`: Boolescher Wert, der angibt, ob der Wert verborgen werden soll (z.B. API-Schlüssel, Passwörter)

### Verwaltung von Erweiterungseinstellungen

Erweiterungen können eine Konfiguration über Einstellungen erfordern (z. B. API-Schlüssel oder Anmeldedaten). Diese Einstellungen können mit dem CLI-Befehl `qwen extensions settings` verwaltet werden:

**Einen Einstellungswert festlegen:**

```bash
qwen extensions settings set <Erweiterungsname> <Einstellungsname> [--scope user|workspace]
```

**Alle Einstellungen für eine Erweiterung auflisten:**

```bash
qwen extensions settings list <Erweiterungsname>
```

**Aktuelle Werte anzeigen (Benutzer und Arbeitsbereich):**

```bash
qwen extensions settings show <Erweiterungsname> <Einstellungsname>
```

**Einen Einstellungswert entfernen:**

```bash
qwen extensions settings unset <Erweiterungsname> <Einstellungsname> [--scope user|workspace]
```

Einstellungen können auf zwei Ebenen konfiguriert werden:

- **Benutzerebene** (Standard): Einstellungen gelten für alle Projekte (`~/.qwen/.env`)
- **Arbeitsbereichsebene**: Einstellungen gelten nur für das aktuelle Projekt (`.qwen/.env`)

Einstellungen des Arbeitsbereichs haben Vorrang vor Benutzereinstellungen. Sensible Einstellungen werden sicher gespeichert und niemals im Klartext angezeigt.

Wenn Qwen Code startet, lädt es alle Erweiterungen und führt deren Konfigurationen zusammen. Bei Konflikten hat die Konfiguration des Arbeitsbereichs Vorrang.

### Benutzerdefinierte Befehle

Erweiterungen können [benutzerdefinierte Befehle](./cli/commands.md#custom-commands) bereitstellen, indem sie Markdown-Dateien in einem `commands/`-Unterverzeichnis innerhalb des Erweiterungsverzeichnisses ablegen. Diese Befehle folgen dem gleichen Format wie benutzer- und projektspezifische Befehle und verwenden Standard-Namenskonventionen.

> **Hinweis:** Das Befehlsformat wurde von TOML auf Markdown aktualisiert. TOML-Dateien sind veraltet, werden aber weiterhin unterstützt. Sie können vorhandene TOML-Befehle mithilfe der automatischen Migrationsaufforderung migrieren, die erscheint, wenn TOML-Dateien erkannt werden.

**Beispiel**

Eine Erweiterung mit dem Namen `gcp` mit folgender Struktur:

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

### Benutzerdefinierte Fähigkeiten

Erweiterungen können benutzerdefinierte Fähigkeiten bereitstellen, indem sie Skill-Dateien in einem `skills/`-Unterverzeichnis innerhalb des Erweiterungsverzeichnisses ablegen. Jeder Skill sollte eine `SKILL.md`-Datei mit YAML-Frontmatter enthalten, die den Namen und die Beschreibung des Skills definiert.

**Beispiel**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

Der Skill ist über den Befehl `/skills` verfügbar, wenn die Erweiterung aktiv ist.

### Benutzerdefinierte Subagenten

Erweiterungen können benutzerdefinierte Subagenten bereitstellen, indem sie Agenten-Konfigurationsdateien in einem `agents/`-Unterverzeichnis innerhalb des Erweiterungsverzeichnisses ablegen. Agenten werden mithilfe von YAML- oder Markdown-Dateien definiert.

**Beispiel**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Subagenten von Erweiterungen erscheinen im Subagenten-Manager-Dialog unter dem Abschnitt "Erweiterungs-Agenten".

### Konfliktlösung

Erweiterungsbefehle haben die niedrigste Priorität. Wenn ein Konflikt mit Benutzer- oder Projektbefehlen auftritt:

1. **Kein Konflikt**: Der Erweiterungsbefehl verwendet seinen natürlichen Namen (z.B. `/deploy`)
2. **Bei Konflikt**: Der Erweiterungsbefehl wird mit dem Erweiterungspräfix umbenannt (z.B. `/gcp.deploy`)

Beispielsweise, wenn sowohl ein Benutzer als auch die `gcp`-Erweiterung einen `deploy`-Befehl definieren:

- `/deploy` - Führt den Deploy-Befehl des Benutzers aus
- `/gcp.deploy` - Führt den Deploy-Befehl der Erweiterung aus (gekennzeichnet mit dem `[gcp]`-Tag)

## Variablen

Qwen Code-Erweiterungen ermöglichen die Verwendung von Variablen in der Datei `qwen-extension.json`. Dies kann nützlich sein, wenn Sie z. B. das aktuelle Verzeichnis benötigen, um einen MCP-Server mit `"cwd": "${extensionPath}${/}run.ts"` auszuführen.

**Unterstützte Variablen:**

| Variable                   | Beschreibung                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Der vollständige Pfad zur Erweiterung im Dateisystem des Benutzers, z. B. `/Users/Benutzername/.qwen/extensions/beispiel-erweiterung`. Symlinks werden nicht aufgelöst. |
| `${workspacePath}`         | Der vollständige Pfad zum aktuellen Arbeitsbereich.                                                                                                           |
| `${/} oder ${pathSeparator}` | Das Betriebssystem-spezifische Pfadtrennzeichen.                                                                                                              |