# Qwen Code Erweiterungen

Qwen Code Erweiterungen bündeln Prompts, MCP-Server, Subagenten, Fähigkeiten und benutzerdefinierte Befehle in einem vertrauten und benutzerfreundlichen Format. Mit Erweiterungen kannst du die Fähigkeiten von Qwen Code erweitern und diese Fähigkeiten mit anderen teilen. Sie sind so gestaltet, dass sie einfach installiert und geteilt werden können.

Erweiterungen und Plugins aus der [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) und dem [Claude Code Marketplace](https://claudemarketplaces.com/) können direkt in Qwen Code installiert werden. Diese plattformübergreifende Kompatibilität bietet dir Zugang zu einem reichhaltigen Ökosystem an Erweiterungen und Plugins, was die Fähigkeiten von Qwen Code enorm erweitert, ohne dass die Autoren der Erweiterungen separate Versionen pflegen müssen.

## Erweiterungsverwaltung

Wir bieten eine Reihe von Werkzeugen zur Erweiterungsverwaltung, sowohl über `qwen extensions` CLI-Befehle als auch über `/extensions` Schrägstrich-Befehle innerhalb der interaktiven CLI.

### Laufzeit-Erweiterungsverwaltung (Schrägstrich-Befehle)

Du kannst Erweiterungen zur Laufzeit innerhalb der interaktiven CLI mit `/extensions` Schrägstrich-Befehlen verwalten. Diese Befehle unterstützen Hot-Reloading, d.h. Änderungen werden sofort wirksam, ohne dass die Anwendung neu gestartet werden muss.

| Befehl                               | Beschreibung                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/extensions` oder `/extensions manage` | Alle installierten Erweiterungen verwalten                                                                        |
| `/extensions install <quell> `         | Eine Erweiterung aus einer Git-URL, einem lokalen Pfad oder Archiv, einer Archiv-URL, einem npm-Paket oder einem Marktplatz installieren |
| `/extensions explore [quell] `         | Die Quellseite der Erweiterungen (Gemini oder ClaudeCode) im Browser öffnen                                     |

#### Der interaktive Erweiterungsmanager

Die Ausführung von `/extensions` (oder `/extensions manage`) öffnet einen interaktiven Manager mit drei Registerkarten. Drücke `Tab` oder die Pfeiltasten `←`/`→`, um zwischen ihnen zu wechseln.

- **Entdecken** — Durchsuche Plugins aus deinen konfigurierten Marktplatzquellen. Gib einen Suchbegriff ein, `Enter` öffnet die Details eines Plugins und du kannst es installieren (du wirst aufgefordert, einen Installationsbereich zu wählen). Drücke `Strg+R`, um die Auflistungen neu zu laden, und `Esc`, um zurückzugehen.
- **Installiert** — Deine installierten Erweiterungen, gruppiert nach Bereich (**Benutzerebene**, **Projektebene**) und Favoriten. Verwende `↑`/`↓` zum Navigieren, `Leertaste` zum Aktivieren/Deaktivieren einer Erweiterung, `f` zum Favorisieren und `Enter` zum Öffnen der Details. MCP-Server, die von einer Erweiterung gebündelt werden, werden unter ihrer übergeordneten Erweiterung mit Live-Verbindungsstatus eingerückt angezeigt; du kannst dort jeden Server einzeln aktivieren oder deaktivieren.
- **Quellen** — Verwalte die Marktplatzquellen, die die Registerkarte „Entdecken“ speisen. Verwende `↑`/`↓` zum Navigieren, `Enter` zum Auswählen einer Quelle und `d` zum Entfernen einer Quelle. Dies sind dieselben Quellen, die auch mit den unten beschriebenen `qwen extensions sources` CLI-Befehlen verwaltet werden.

Änderungen, die hier vorgenommen werden, werden sofort per Hot-Reload übernommen, ohne dass Qwen Code neu gestartet werden muss.

### CLI-Erweiterungsverwaltung

Du kannst Erweiterungen auch mit `qwen extensions` CLI-Befehlen verwalten. Beachte, dass Änderungen über CLI-Befehle erst nach einem Neustart in aktiven CLI-Sitzungen sichtbar werden.

### Installieren einer Erweiterung

Du kannst eine Erweiterung mit `qwen extensions install` aus mehreren Quellen installieren:

#### Vom Claude Code Marketplace

Qwen Code unterstützt auch Plugins vom [Claude Code Marketplace](https://claudemarketplaces.com/). Installiere von einem Marktplatz und wähle ein Plugin aus:

```bash
qwen extensions install <marktplatz-name>
# oder
qwen extensions install <marktplatz-github-url>
```

Wenn du ein bestimmtes Plugin installieren möchtest, kannst du das Format mit Plugin-Namen verwenden:

```bash
qwen extensions install <marktplatz-name>:<plugin-name>
# oder
qwen extensions install <marktplatz-github-url>:<plugin-name>
```

Um zum Beispiel das Plugin `prompts.chat` aus dem Marktplatz [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) zu installieren:

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# oder
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Claude-Plugins werden während der Installation automatisch in das Qwen Code-Format konvertiert:

- `claude-plugin.json` wird in `qwen-extension.json` umgewandelt
- Agentenkonfigurationen werden in das Qwen Subagenten-Format konvertiert
- Fähigkeitskonfigurationen werden in das Qwen-Fähigkeitsformat konvertiert
- Tool-Zuordnungen werden automatisch verarbeitet

Du kannst schnell über verschiedene Marktplätze verfügbare Erweiterungen durchsuchen, indem du den Befehl `/extensions explore` verwendest:

```bash
# Gemini CLI Extensions Marktplatz öffnen
/extensions explore Gemini

# Claude Code Marktplatz öffnen
/extensions explore ClaudeCode
```

Dieser Befehl öffnet den jeweiligen Marktplatz in deinem Standardbrowser, sodass du neue Erweiterungen entdecken kannst, um deine Qwen Code-Erfahrung zu verbessern.

> **Plattformübergreifende Kompatibilität**: Auf diese Weise kannst du die reichhaltigen Erweiterungsökosysteme sowohl von Gemini CLI als auch von Claude Code nutzen, was die verfügbare Funktionalität für Qwen Code-Benutzer enorm erweitert.
#### Von Gemini CLI Erweiterungen

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

#### Von der npm-Registry

Qwen Code unterstützt die Installation von Erweiterungen aus npm-Registries mittels gescopten Paketnamen. Dies ist ideal für Teams mit privaten Registries, die bereits über Authentifizierung, Versionierung und Veröffentlichungsinfrastruktur verfügen.

```bash
# Die neueste Version installieren
qwen extensions install @scope/meine-erweiterung

# Eine bestimmte Version installieren
qwen extensions install @scope/meine-erweiterung@1.2.0

# Von einer benutzerdefinierten Registry installieren
qwen extensions install @scope/meine-erweiterung --registry https://ihre-registry.com
```

Es werden nur gescopte Pakete (`@scope/paket-name`) unterstützt, um Verwechslungen mit der GitHub-Kurzform `owner/repo` zu vermeiden.

**Registry-Auflösung** folgt dieser Priorität:

1. `--registry` CLI-Flag (explizite Überschreibung)
2. Gescopte Registry aus `.npmrc` (z. B. `@scope:registry=https://...`)
3. Standard-Registry aus `.npmrc`
4. Fallback: `https://registry.npmjs.org/`

**Authentifizierung** wird automatisch über die Umgebungsvariable `NPM_TOKEN` oder über registriespezifische `_authToken`-Einträge in Ihrer `.npmrc`-Datei behandelt.

> **Hinweis:** npm-Erweiterungen müssen im Paketstammverzeichnis eine `qwen-extension.json`-Datei enthalten, die dem gleichen Format wie jede andere Qwen Code-Erweiterung folgt. Einzelheiten zur Paketierung finden Sie unter [Erweiterungen veröffentlichen](./extension-releasing.md#veröffentlichen-über-die-npm-registry).

#### Von einem Git-Repository

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Dadurch wird die GitHub-MCP-Server-Erweiterung installiert.

#### Von einem lokalen Pfad

```bash
qwen extensions install /pfad/zu/ihrer/erweiterung
```

Lokale `.zip`- und `.tar.gz`-Archive werden ebenfalls unterstützt:

```bash
qwen extensions install /pfad/zu/ihrer/erweiterung.zip
qwen extensions install /pfad/zu/ihrer/erweiterung.tar.gz
```

Das Archiv muss eine vollständige Erweiterung im Stammverzeichnis enthalten, oder ein einzelnes oberes Verzeichnis, das die Erweiterung enthält.

Beachten Sie, dass wir eine Kopie der installierten Erweiterung erstellen. Sie müssen daher `qwen extensions update` ausführen, um Änderungen sowohl von lokal definierten Erweiterungen als auch von solchen auf GitHub zu übernehmen.

#### Von einer Archiv-URL

```bash
qwen extensions install https://example.com/ihre/erweiterung.zip
qwen extensions install https://example.com/ihre/erweiterung.tar.gz
```

Archiv-URLs können später aktualisiert werden, solange die URL weiterhin auf ein neueres Archiv für dieselbe Erweiterung verweist.

#### Installationsbereich wählen

Standardmäßig ist eine installierte Erweiterung global aktiviert (Benutzerbereich). Übergeben Sie `--scope project`, um sie nur für das aktuelle Arbeitsverzeichnis zu aktivieren:

```bash
qwen extensions install <quelle> --scope project
```

`--scope workspace` wird als Alias für `--scope project` akzeptiert. Dies entspricht der Bereichsauswahl, die bei der Installation über den Reiter `/extensions manage` Entdecken angeboten wird.

### Marketplace-Quellen verwalten

Marketplace-Quellen (Claude-Plugin-Marktplätze) versorgen den Reiter Entdecken unter `/extensions manage`. Sie können diese auch über die CLI verwalten:

```bash
# Einen Marketplace hinzufügen (owner/repo, Git-URL, HTTPS-URL zu marketplace.json oder lokaler Pfad)
qwen extensions sources add <quelle>

# Konfigurierte Marktplätze auflisten
qwen extensions sources list

# Die Plugin-Liste eines Marktplatzes erneut abrufen
qwen extensions sources update <name>

# Einen Marketplace entfernen
qwen extensions sources remove <name>
```

### Eine Erweiterung deinstallieren

Zum Deinstallieren führen Sie `qwen extensions uninstall erweiterungsname` aus, also im Beispiel der Installation:

```
qwen extensions uninstall qwen-cli-security
```

### Eine Erweiterung deaktivieren

Erweiterungen sind standardmäßig in allen Arbeitsbereichen aktiviert. Sie können eine Erweiterung vollständig oder nur für einen bestimmten Arbeitsbereich deaktivieren.

Beispielsweise deaktiviert `qwen extensions disable erweiterungsname` die Erweiterung auf Benutzerebene, sodass sie überall deaktiviert ist. `qwen extensions disable erweiterungsname --scope=workspace` deaktiviert die Erweiterung nur im aktuellen Arbeitsbereich.

### Eine Erweiterung aktivieren

Sie können Erweiterungen mit `qwen extensions enable erweiterungsname` aktivieren. Sie können eine Erweiterung auch für einen bestimmten Arbeitsbereich aktivieren, indem Sie `qwen extensions enable erweiterungsname --scope=workspace` in diesem Arbeitsbereich ausführen.

Dies ist nützlich, wenn Sie eine Erweiterung auf oberster Ebene deaktiviert haben und sie nur an bestimmten Stellen aktiviert sein soll.

### Eine Erweiterung aktualisieren

Für Erweiterungen, die von einem lokalen Pfad oder Archiv, einer Archiv-URL, einem Git-Repository oder einer npm-Registry installiert wurden, können Sie explizit auf die neueste Version aktualisieren mit `qwen extensions update erweiterungsname`. Bei npm-Erweiterungen, die ohne Version-Pin installiert wurden (z. B. `@scope/pkg`), prüfen Aktualisierungen den `latest`-Dist-Tag. Bei solchen, die mit einem bestimmten Dist-Tag installiert wurden (z. B. `@scope/pkg@beta`), folgen Aktualisierungen diesem Tag. Erweiterungen, die auf eine exakte Version festgelegt sind (z. B. `@scope/pkg@1.2.0`), werden immer als aktuell betrachtet.
Sie können alle Erweiterungen aktualisieren mit:

```
qwen extensions update --all
```

## Funktionsweise

Beim Start sucht Qwen Code nach Erweiterungen in `<home>/.qwen/extensions`.

Erweiterungen existieren als Verzeichnis, das eine `qwen-extension.json`-Datei enthält. Zum Beispiel:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Die `qwen-extension.json`-Datei enthält die Konfiguration für die Erweiterung. Die Datei hat die folgende Struktur:

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

- `name`: Der Name der Erweiterung. Hiermit wird die Erweiterung eindeutig identifiziert und zur Konfliktlösung verwendet, wenn Erweiterungsbefehle denselben Namen wie Benutzer- oder Projektbefehle haben. Der Name sollte aus Kleinbuchstaben oder Zahlen bestehen und Bindestriche anstelle von Unterstrichen oder Leerzeichen verwenden. So beziehen sich Benutzer im CLI auf Ihre Erweiterung. Beachten Sie, dass dieser Name mit dem Verzeichnisnamen der Erweiterung übereinstimmen sollte.
- `version`: Die Version der Erweiterung.
- `mcpServers`: Eine Map von MCP-Servern, die konfiguriert werden sollen. Der Schlüssel ist der Name des Servers, der Wert die Serverkonfiguration. Diese Server werden beim Start geladen, genau wie MCP-Server, die in einer [`settings.json`-Datei](../configuration/settings.md) konfiguriert sind. Wenn sowohl eine Erweiterung als auch eine `settings.json`-Datei einen MCP-Server mit demselben Namen konfigurieren, hat der in der `settings.json`-Datei definierte Server Vorrang.
  - Beachten Sie, dass alle MCP-Server-Konfigurationsoptionen unterstützt werden, außer `trust`.
- `channels`: Eine Map von benutzerdefinierten Channel-Adaptern. Der Schlüssel ist der Channel-Typ-Name, der Wert hat einen `entry` (Pfad zum kompilierten JS-Einstiegspunkt) und optional `displayName`. Der Einstiegspunkt muss ein `plugin`-Objekt exportieren, das dem `ChannelPlugin`-Interface entspricht. Siehe [Channel-Plugins](../features/channels/plugins) für eine vollständige Anleitung.
- `contextFileName`: Der Name der Datei, die den Kontext für die Erweiterung enthält. Diese wird verwendet, um den Kontext aus dem Erweiterungsverzeichnis zu laden. Wenn diese Eigenschaft nicht verwendet wird, aber eine `QWEN.md`-Datei in Ihrem Erweiterungsverzeichnis vorhanden ist, wird diese Datei geladen.
- `commands`: Das Verzeichnis, das benutzerdefinierte Befehle enthält (Standard: `commands`). Befehle sind `.md`-Dateien, die Prompts definieren.
- `skills`: Das Verzeichnis, das benutzerdefinierte Skills enthält (Standard: `skills`). Skills werden automatisch erkannt und über den `/skills`-Befehl verfügbar gemacht.
- `agents`: Das Verzeichnis, das benutzerdefinierte Subagenten enthält (Standard: `agents`). Subagenten sind `.yaml`- oder `.md`-Dateien, die spezialisierte KI-Assistenten definieren.
- `settings`: Ein Array von Einstellungen, die die Erweiterung benötigt. Bei der Installation werden Benutzer aufgefordert, Werte für diese Einstellungen anzugeben. Die Werte werden sicher gespeichert und als Umgebungsvariablen an MCP-Server übergeben.
  - Jede Einstellung hat die folgenden Eigenschaften:
    - `name`: Anzeigename für die Einstellung
    - `description`: Eine Beschreibung, wofür diese Einstellung verwendet wird
    - `envVar`: Der Name der Umgebungsvariable, die gesetzt wird
    - `sensitive`: Boolean, der angibt, ob der Wert verborgen werden soll (z. B. API-Schlüssel, Passwörter)

### Einstellungen von Erweiterungen verwalten

Erweiterungen können eine Konfiguration über Einstellungen erfordern (wie API-Schlüssel oder Anmeldedaten). Diese Einstellungen können mit dem CLI-Befehl `qwen extensions settings` verwaltet werden:

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
- **Workspace-Ebene**: Einstellungen gelten nur für das aktuelle Projekt (`.qwen/.env`)

Workspace-Einstellungen haben Vorrang vor Benutzereinstellungen. Sensible Einstellungen werden sicher gespeichert und niemals im Klartext angezeigt.

Wenn Qwen Code startet, lädt es alle Erweiterungen und führt deren Konfigurationen zusammen. Bei Konflikten hat die Workspace-Konfiguration Vorrang.

### Benutzerdefinierte Befehle

Erweiterungen können [benutzerdefinierte Befehle](../features/commands.md#4-custom-commands) bereitstellen, indem sie Markdown-Dateien in einem `commands/`-Unterverzeichnis innerhalb des Erweiterungsverzeichnisses ablegen. Diese Befehle folgen dem gleichen Format wie benutzerdefinierte Befehle von Benutzern und Projekten und verwenden die Standard-Namenskonventionen.

> **Hinweis:** Das Befehlsformat wurde von TOML auf Markdown aktualisiert. TOML-Dateien sind veraltet, werden aber weiterhin unterstützt. Sie können vorhandene TOML-Befehle mithilfe der automatischen Migrationsaufforderung migrieren, die angezeigt wird, wenn TOML-Dateien erkannt werden.
**Beispiel**

Eine Erweiterung namens `gcp` mit folgender Struktur:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

Würde diese Befehle bereitstellen:

- `/deploy` - Wird als `[gcp] Custom command from deploy.md` in der Hilfe angezeigt
- `/gcs:sync` - Wird als `[gcp] Custom command from sync.md` in der Hilfe angezeigt

### Benutzerdefinierte Skills

Erweiterungen können benutzerdefinierte Skills bereitstellen, indem sie Skill-Dateien in einem Unterverzeichnis `skills/` im Erweiterungsverzeichnis ablegen. Jeder Skill sollte eine `SKILL.md`-Datei mit YAML-Frontmatter enthalten, die den Namen und die Beschreibung des Skills definiert.

**Beispiel**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

Der Skill ist über den Befehl `/skills` verfügbar, wenn die Erweiterung aktiv ist.

### Benutzerdefinierte Sub-Agents

Erweiterungen können benutzerdefinierte Sub-Agents bereitstellen, indem sie Agent-Konfigurationsdateien in einem Unterverzeichnis `agents/` im Erweiterungsverzeichnis ablegen. Agents werden mit YAML- oder Markdown-Dateien definiert.

**Beispiel**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Sub-Agents von Erweiterungen erscheinen im Sub-Agent-Manager-Dialog unter dem Abschnitt „Extension Agents".

### Konfliktauflösung

Befehle von Erweiterungen haben die niedrigste Priorität. Wenn ein Konflikt mit Benutzer- oder Projektbefehlen auftritt:

1. **Kein Konflikt**: Der Erweiterungsbefehl verwendet seinen natürlichen Namen (z. B. `/deploy`)
2. **Mit Konflikt**: Der Erweiterungsbefehl wird mit dem Erweiterungspräfix umbenannt (z. B. `/gcp.deploy`)

Wenn beispielsweise sowohl ein Benutzer als auch die `gcp`-Erweiterung einen `deploy`-Befehl definieren:

- `/deploy` - Führt den Benutzer-deploy-Befehl aus
- `/gcp.deploy` - Führt den Erweiterungs-deploy-Befehl aus (gekennzeichnet mit `[gcp]`-Tag)

## Variablen

Qwen Code-Erweiterungen erlauben die Variablensubstitution in `qwen-extension.json`. Dies kann nützlich sein, wenn Sie z. B. das aktuelle Verzeichnis benötigen, um einen MCP-Server mit `"cwd": "${extensionPath}${/}run.ts"` auszuführen.

**Unterstützte Variablen:**

| Variable                   | Beschreibung                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Der vollqualifizierte Pfad der Erweiterung im Dateisystem des Benutzers, z. B. '/Users/username/.qwen/extensions/example-extension'. Symlinks werden nicht aufgelöst. |
| `${workspacePath}`         | Der vollqualifizierte Pfad des aktuellen Workspace.                                                                                                            |
| `${/} oder ${pathSeparator}` | Der Pfadtrenner (unterscheidet sich je nach Betriebssystem).                                                                                                   |
