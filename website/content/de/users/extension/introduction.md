# Qwen-Code-Erweiterungen

Qwen-Code-Erweiterungen fassen Prompts, MCP-Server, Unteragenten, Skills und benutzerdefinierte Befehle in einem vertrauten und benutzerfreundlichen Format zusammen. Mit Erweiterungen können Sie die Funktionalität von Qwen Code erweitern und diese mit anderen teilen. Sie sind so konzipiert, dass sie einfach installierbar und teilbar sind.

Erweiterungen und Plugins aus der [Gemini-CLI-Erweiterungsgalerie](https://geminicli.com/extensions/) und dem [Claude-Code-Marktplatz](https://claudemarketplaces.com/) können direkt in Qwen Code installiert werden. Diese plattformübergreifende Kompatibilität bietet Ihnen Zugriff auf ein umfangreiches Ökosystem an Erweiterungen und Plugins und erweitert die Fähigkeiten von Qwen Code erheblich – ohne dass die Autoren der Erweiterungen separate Versionen pflegen müssen.

## Verwaltung von Erweiterungen

Wir stellen eine Reihe von Werkzeugen zur Verwaltung von Erweiterungen bereit, die sowohl über CLI-Befehle `qwen extensions` als auch über Schrägstrich-Befehle `/extensions` innerhalb der interaktiven CLI genutzt werden können.

### Verwaltung von Laufzeit-Erweiterungen (Slash-Befehle)

Sie können Erweiterungen zur Laufzeit innerhalb der interaktiven CLI mithilfe von Slash-Befehlen wie `/extensions` verwalten. Diese Befehle unterstützen das Hot-Reloading, sodass Änderungen sofort wirksam werden, ohne dass die Anwendung neu gestartet werden muss.

| Befehl                                       | Beschreibung                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `/extensions` oder `/extensions manage`      | Verwalten aller installierten Erweiterungen                                |
| `/extensions install <Quelle>`               | Installieren einer Erweiterung aus einer Git-URL, einem lokalen Pfad oder dem Marktplatz |
| `/extensions explore [Quelle]`               | Öffnen der Quellseite der Erweiterungen (Gemini oder ClaudeCode) im Browser |

### Verwaltung von CLI-Erweiterungen

Sie können Erweiterungen auch über die CLI-Befehle `qwen extensions` verwalten. Beachten Sie, dass Änderungen, die über CLI-Befehle vorgenommen werden, bei einem Neustart in aktiven CLI-Sitzungen wirksam werden.

### Installieren einer Erweiterung

Sie können eine Erweiterung mit `qwen extensions install` aus mehreren Quellen installieren:

#### Aus dem Claude Code Marketplace

Qwen Code unterstützt zudem Plugins aus dem [Claude Code Marketplace](https://claudemarketplaces.com/). Installieren Sie ein Plugin aus dem Marketplace:

```bash
qwen extensions install <marketplace-name>

# oder
qwen extensions install <marketplace-github-url>
```

Wenn Sie ein bestimmtes Plugin installieren möchten, verwenden Sie das Format mit dem Plugin-Namen:

```bash
qwen extensions install <marketplace-name>:<plugin-name>
```

# oder  
qwen extensions install <Marktplatz-GitHub-URL>:<Plugin-Name>  
```  

Beispiel: Um das Plugin `prompts.chat` aus dem Marktplatz [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) zu installieren:  

```bash  
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat  

# oder  
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat  
```  

Claude-Plugins werden beim Installieren automatisch in das Qwen Code-Format konvertiert:  

- `claude-plugin.json` wird in `qwen-extension.json` umgewandelt  
- Agent-Konfigurationen werden in das Qwen-Subagenten-Format konvertiert  
- Skill-Konfigurationen werden in das Qwen-Skill-Format konvertiert  
- Tool-Zuordnungen werden automatisch verarbeitet  

Sie können mithilfe des Befehls `/extensions explore` schnell die verfügbaren Erweiterungen verschiedener Marktplätze durchsuchen:  

```  

# Öffnet den Gemini CLI Extensions-Marktplatz  
/extensions explore Gemini

# Öffne den Claude-Code-Marktplatz  
/extensions erkunden Claude Code  
```  

Dieser Befehl öffnet den jeweiligen Marktplatz in Ihrem Standardbrowser und ermöglicht es Ihnen, neue Erweiterungen zu entdecken, um Ihr Qwen-Code-Erlebnis zu verbessern.  

> **Plattformübergreifende Kompatibilität**: Dadurch können Sie die umfangreichen Erweiterungsökosysteme sowohl von Gemini CLI als auch von Claude Code nutzen und die verfügbare Funktionalität für Qwen-Code-Nutzer erheblich erweitern.  

#### Von Gemini-CLI-Erweiterungen  

Qwen Code unterstützt vollständig Erweiterungen aus der [Gemini-CLI-Erweiterungsgalerie](https://geminicli.com/extensions/). Installieren Sie sie einfach mithilfe der Git-URL:  

```bash  
qwen extensions install <gemini-cli-extension-github-url>  

# oder  
qwen extensions install <Besitzer>/<Repository>  
```  

Gemini-Erweiterungen werden beim Installieren automatisch in das Qwen-Code-Format konvertiert:  

- `gemini-extension.json` wird in `qwen-extension.json` umgewandelt  
- TOML-Befehlsdateien werden automatisch in das Markdown-Format migriert  
- MCP-Server, Kontextdateien und Einstellungen bleiben erhalten

#### Aus einem Git-Repository

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Damit wird die Erweiterung „GitHub MCP Server“ installiert.

#### Aus einem lokalen Pfad

```bash
qwen extensions install /pfad/zu/ihrer/erweiterung
```

Beachten Sie, dass eine Kopie der installierten Erweiterung erstellt wird. Um Änderungen sowohl bei lokal definierten Erweiterungen als auch bei solchen auf GitHub zu übernehmen, müssen Sie `qwen extensions update` ausführen.

### Eine Erweiterung deinstallieren

Führen Sie zum Deinstallieren `qwen extensions uninstall erweiterungsname` aus. Im Fall des obigen Installationsbeispiels lautet der Befehl also:

```
qwen extensions uninstall qwen-cli-security
```

### Eine Erweiterung deaktivieren

Erweiterungen sind standardmäßig in allen Arbeitsbereichen aktiviert. Sie können eine Erweiterung entweder vollständig oder nur für einen bestimmten Arbeitsbereich deaktivieren.

Beispielsweise deaktiviert der Befehl `qwen extensions disable extension-name` die Erweiterung auf Benutzerebene, sodass sie überall deaktiviert ist. Mit `qwen extensions disable extension-name --scope=workspace` wird die Erweiterung hingegen nur im aktuellen Arbeitsbereich deaktiviert.

### Eine Erweiterung aktivieren

Sie können Erweiterungen mit `qwen extensions enable extension-name` aktivieren. Um eine Erweiterung nur für einen bestimmten Arbeitsbereich zu aktivieren, führen Sie innerhalb dieses Arbeitsbereichs den Befehl `qwen extensions enable extension-name --scope=workspace` aus.

Dies ist nützlich, wenn eine Erweiterung auf oberster Ebene deaktiviert ist und nur an bestimmten Stellen aktiviert werden soll.

### Eine Erweiterung aktualisieren

Für Erweiterungen, die über einen lokalen Pfad oder ein Git-Repository installiert wurden, können Sie explizit auf die neueste Version aktualisieren (wie im Feld `version` der Datei `qwen-extension.json` angegeben) mit dem Befehl:

```
qwen extensions update extension-name
```

Sie können alle Erweiterungen mit folgendem Befehl aktualisieren:

```
qwen extensions update --all
```

## Funktionsweise

Beim Start durchsucht Qwen Code das Verzeichnis `<home>/.qwen/extensions` nach Erweiterungen.

Erweiterungen liegen als Verzeichnis vor, das eine Datei `qwen-extension.json` enthält. Beispiel:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Die Datei `qwen-extension.json` enthält die Konfiguration für die Erweiterung. Die Datei weist folgende Struktur auf:

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

- `name`: Der Name der Erweiterung. Dieser wird zur eindeutigen Identifizierung der Erweiterung verwendet und dient der Konfliktlösung, falls Befehle der Erweiterung denselben Namen wie Benutzer- oder Projektbefehle haben. Der Name sollte ausschließlich aus Kleinbuchstaben, Ziffern sowie Gedankenstrichen (anstatt Unterstrichen oder Leerzeichen) bestehen. So werden Benutzer Ihre Erweiterung in der CLI ansprechen. Beachten Sie, dass dieser Name üblicherweise mit dem Namen des Erweiterungsverzeichnisses übereinstimmen muss.
- `version`: Die Version der Erweiterung.
- `mcpServers`: Eine Zuordnung (Map) der zu konfigurierenden MCP-Server. Der Schlüssel ist der Name des Servers, der Wert die Serverkonfiguration. Diese Server werden beim Start geladen, genauso wie MCP-Server, die in einer [`settings.json`-Datei](./cli/configuration.md) konfiguriert sind. Falls sowohl eine Erweiterung als auch eine `settings.json`-Datei einen MCP-Server mit demselben Namen konfigurieren, hat der in der `settings.json`-Datei definierte Server Vorrang.
  - Beachten Sie, dass alle MCP-Server-Konfigurationsoptionen unterstützt werden – mit Ausnahme von `trust`.
- `contextFileName`: Der Name der Datei, die den Kontext für die Erweiterung enthält. Diese Datei wird aus dem Erweiterungsverzeichnis geladen. Falls diese Eigenschaft nicht gesetzt ist, aber eine Datei `QWEN.md` im Erweiterungsverzeichnis vorhanden ist, wird diese stattdessen geladen.
- `commands`: Das Verzeichnis mit benutzerdefinierten Befehlen (Standard: `commands`). Befehle sind `.md`-Dateien, die Prompts definieren.
- `skills`: Das Verzeichnis mit benutzerdefinierten Fähigkeiten (Standard: `skills`). Fähigkeiten werden automatisch erkannt und über den Befehl `/skills` verfügbar.
- `agents`: Das Verzeichnis mit benutzerdefinierten Untergeagenten (Standard: `agents`). Untergeagenten sind `.yaml`- oder `.md`-Dateien, die spezialisierte KI-Assistenten definieren.
- `settings`: Ein Array mit Einstellungen, die die Erweiterung benötigt. Bei der Installation werden Benutzer aufgefordert, Werte für diese Einstellungen anzugeben. Die Werte werden sicher gespeichert und den MCP-Servern als Umgebungsvariablen übergeben.
  - Jede Einstellung besitzt folgende Eigenschaften:
    - `name`: Anzeigename der Einstellung
    - `description`: Beschreibung der Verwendung dieser Einstellung
    - `envVar`: Der Name der Umgebungsvariablen, die gesetzt wird
    - `sensitive`: Boolescher Wert, der angibt, ob der Wert ausgeblendet werden soll (z. B. bei API-Schlüsseln oder Passwörtern)

### Verwalten von Erweiterungseinstellungen

Erweiterungen können Konfigurationen über Einstellungen erfordern (z. B. API-Schlüssel oder Anmeldeinformationen). Diese Einstellungen können mithilfe des CLI-Befehls `qwen extensions settings` verwaltet werden:

**Festlegen eines Einstellungswerts:**

```bash
qwen extensions settings set <erweiterungsname> <einstellungsname> [--scope user|workspace]
```

**Auflisten aller Einstellungen einer Erweiterung:**

```bash
qwen extensions settings list <erweiterungsname>
```

**Anzeigen der aktuellen Werte (Benutzer- und Arbeitsbereichsebene):**

```bash
qwen extensions settings show <erweiterungsname> <einstellungsname>
```

**Entfernen eines Einstellungswerts:**

```bash
qwen extensions settings unset <erweiterungsname> <einstellungsname> [--scope user|workspace]
```

Einstellungen können auf zwei Ebenen konfiguriert werden:

- **Benutzerebene** (Standard): Die Einstellungen gelten für alle Projekte (`~/.qwen/.env`)
- **Arbeitsbereichsebene**: Die Einstellungen gelten nur für das aktuelle Projekt (`.qwen/.env`)

Arbeitsbereichseinstellungen haben Vorrang vor Benutzereinstellungen. Sensible Einstellungen werden sicher gespeichert und niemals als Klartext angezeigt.

Beim Start von Qwen Code werden alle Erweiterungen geladen und ihre Konfigurationen zusammengeführt. Bei Konflikten hat die Konfiguration auf Arbeitsbereichsebene Vorrang.

### Benutzerdefinierte Befehle

Erweiterungen können [benutzerdefinierte Befehle](./cli/commands.md#custom-commands) bereitstellen, indem sie Markdown-Dateien in einem Unterverzeichnis `commands/` innerhalb des Erweiterungsverzeichnisses ablegen. Diese Befehle folgen demselben Format wie benutzer- und projektspezifische benutzerdefinierte Befehle und verwenden die üblichen Namenskonventionen.

> **Hinweis:** Das Befehlsformat wurde von TOML auf Markdown aktualisiert. TOML-Dateien sind veraltet, werden aber weiterhin unterstützt. Sie können vorhandene TOML-Befehle mithilfe der automatischen Migrationsoption migrieren, die angezeigt wird, sobald TOML-Dateien erkannt werden.

**Beispiel**

Eine Erweiterung mit dem Namen `gcp` und folgender Struktur:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

stellt folgende Befehle bereit:

- `/deploy` – Wird in der Hilfe als `[gcp] Benutzerdefinierter Befehl aus deploy.md` angezeigt  
- `/gcs:sync` – Wird in der Hilfe als `[gcp] Benutzerdefinierter Befehl aus sync.md` angezeigt

### Benutzerdefinierte Skills

Erweiterungen können benutzerdefinierte Skills bereitstellen, indem sie Skill-Dateien in ein Unterverzeichnis `skills/` innerhalb des Erweiterungsverzeichnisses ablegen. Jeder Skill muss eine Datei `SKILL.md` enthalten, deren YAML-Frontmatter Name und Beschreibung des Skills definiert.

**Beispiel**

```
.qwen/extensions/meine-erweiterung/
├── qwen-extension.json
└── skills/
    └── pdf-verarbeiter/
        └── SKILL.md
```

Der Skill ist verfügbar über den Befehl `/skills`, sobald die Erweiterung aktiv ist.

### Benutzerdefinierte Subagents

Erweiterungen können benutzerdefinierte Subagents bereitstellen, indem sie Agenten-Konfigurationsdateien in ein Unterverzeichnis `agents/` innerhalb des Erweiterungsverzeichnisses ablegen. Agenten werden mittels YAML- oder Markdown-Dateien definiert.

**Beispiel**

```
.qwen/extensions/meine-erweiterung/
├── qwen-extension.json
└── agents/
    └── test-experte.yaml
```

Subagents von Erweiterungen erscheinen im Subagenten-Manager-Dialog im Abschnitt „Erweiterungs-Agenten“.

### Konfliktlösung

Erweiterungsbefehle haben die niedrigste Priorität. Bei einem Konflikt mit Benutzer- oder Projektbefehlen gilt:

1. **Kein Konflikt**: Der Erweiterungsbefehl verwendet seinen natürlichen Namen (z. B. `/deploy`).
2. **Konflikt vorhanden**: Der Erweiterungsbefehl wird mit dem Erweiterungspräfix umbenannt (z. B. `/gcp.deploy`).

Beispiel: Wenn sowohl ein Benutzer als auch die Erweiterung `gcp` einen Befehl `deploy` definieren:

- `/deploy` – führt den Benutzer-Befehl `deploy` aus  
- `/gcp.deploy` – führt den Erweiterungs-Befehl `deploy` aus (gekennzeichnet mit dem Tag `[gcp]`)

## Variablen

Qwen-Code-Erweiterungen ermöglichen die Verwendung von Variablen in `qwen-extension.json`. Dies ist beispielsweise nützlich, wenn Sie das aktuelle Verzeichnis benötigen, um einen MCP-Server mit `"cwd": "${extensionPath}${/}run.ts"` auszuführen.

**Unterstützte Variablen:**

| Variable                     | Beschreibung                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`           | Der vollständig qualifizierte Pfad der Erweiterung im Dateisystem des Benutzers, z. B. `/Users/username/.qwen/extensions/example-extension`. Symbolische Links werden nicht aufgelöst. |
| `${workspacePath}`           | Der vollständig qualifizierte Pfad des aktuellen Arbeitsbereichs.                                                                                                        |
| `${/}` oder `${pathSeparator}` | Der Pfadtrenner (unterscheidet sich je nach Betriebssystem).                                                                                                            |