# Qwen Code Extensions

Qwen Code Extensions packen Prompts, MCP-Server und benutzerdefinierte Befehle in ein vertrautes und benutzerfreundliches Format. Mit Extensions kannst du die Funktionalität von Qwen Code erweitern und diese Funktionen mit anderen teilen. Sie sind so konzipiert, dass sie einfach installierbar und teilbar sind.

## Extension-Verwaltung

Wir bieten eine Suite an Tools zur Verwaltung von Extensions über die `qwen extensions` Befehle.

Beachte, dass diese Befehle nicht innerhalb der CLI unterstützt werden, obwohl du installierte Extensions mit dem Subbefehl `/extensions list` auflisten kannst.

Beachte, dass alle diese Befehle erst in aktiven CLI-Sitzungen nach einem Neustart wirksam werden.

### Installation einer Extension

Du kannst eine Extension mit `qwen extensions install` entweder über eine GitHub-URL oder einen lokalen Pfad installieren.

Beachte, dass wir eine Kopie der installierten Extension erstellen. Daher musst du `qwen extensions update` ausführen, um Änderungen sowohl von lokal definierten Extensions als auch von solchen auf GitHub zu übernehmen.

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

Damit wird die Qwen Code Security Extension installiert, die Unterstützung für den Befehl `/security:analyze` bietet.

### Deinstallation einer Extension

Zum Deinstallieren führe `qwen extensions uninstall extension-name` aus. Im Fall des vorherigen Beispiels wäre das:

```
qwen extensions uninstall qwen-cli-security
```

### Eine Erweiterung deaktivieren

Erweiterungen sind standardmäßig in allen Workspaces aktiviert. Du kannst eine Erweiterung entweder komplett oder nur für bestimmte Workspaces deaktivieren.

Beispiel: `qwen extensions disable extension-name` deaktiviert die Erweiterung auf Benutzerebene, sodass sie überall deaktiviert ist.  
`qwen extensions disable extension-name --scope=workspace` deaktiviert die Erweiterung nur im aktuellen Workspace.

### Eine Erweiterung aktivieren

Du kannst Erweiterungen mit `qwen extensions enable extension-name` aktivieren.  
Mit `qwen extensions enable extension-name --scope=workspace` kannst du eine Erweiterung gezielt für einen bestimmten Workspace aktivieren, indem du den Befehl innerhalb dieses Workspaces ausführst.

Das ist nützlich, wenn du eine Erweiterung global deaktiviert hast, sie aber an bestimmten Orten aktivieren möchtest.

### Aktualisieren einer Extension

Für Extensions, die von einem lokalen Pfad oder einem Git-Repository installiert wurden, kannst du explizit auf die neueste Version aktualisieren (gemäß dem `version`-Feld in der `qwen-extension.json`) mit:

```
qwen extensions update extension-name
```

Alle Extensions können mit folgendem Befehl aktualisiert werden:

```
qwen extensions update --all
```

## Erstellung von Extensions

Wir bieten Befehle an, um die Entwicklung von Extensions zu vereinfachen.

### Eine Boilerplate-Extension erstellen

Wir stellen mehrere Beispiel-Extensions bereit: `context`, `custom-commands`, `exclude-tools` und `mcp-server`. Diese Beispiele findest du [hier](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples).

Um eines dieser Beispiele in ein Entwicklungsverzeichnis zu kopieren, führe folgenden Befehl mit dem gewünschten Typ aus:

```
qwen extensions new path/to/directory custom-commands
```

### Lokale Extension verknüpfen

Der Befehl `qwen extensions link` erstellt einen symbolischen Link vom Installationsverzeichnis der Extension zum Entwicklungsverzeichnis.

Das ist nützlich, damit du nicht jedes Mal `qwen extensions update` ausführen musst, wenn du Änderungen testen möchtest.

```
qwen extensions link path/to/directory
```

## Wie es funktioniert

Beim Start sucht Qwen Code nach Extensions im Verzeichnis `<home>/.qwen/extensions`

Extensions liegen als Verzeichnis vor, das eine `qwen-extension.json` Datei enthält. Zum Beispiel:

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Die Datei `qwen-extension.json` enthält die Konfiguration für die Extension. Die Datei hat folgende Struktur:

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "QWEN.md",
  "excludeTools": ["run_shell_command"]
}
```

- `name`: Der Name der Extension. Dieser wird verwendet, um die Extension eindeutig zu identifizieren und zur Auflösung von Namenskonflikten, wenn Extension-Befehle denselben Namen wie Benutzer- oder Projekt-Befehle haben. Der Name sollte aus Kleinbuchstaben oder Zahlen bestehen und Bindestriche statt Unterstriche oder Leerzeichen verwenden. So werden Benutzer deine Extension in der CLI ansprechen. Beachte, dass wir erwarten, dass dieser Name mit dem Verzeichnisnamen der Extension übereinstimmt.
- `version`: Die Version der Extension.
- `mcpServers`: Eine Map von MCP-Servern, die konfiguriert werden sollen. Der Schlüssel ist der Name des Servers, der Wert ist die Server-Konfiguration. Diese Server werden beim Start genauso geladen wie MCP-Server, die in einer [`settings.json` Datei](./cli/configuration.md) konfiguriert sind. Wenn sowohl eine Extension als auch eine `settings.json` Datei einen MCP-Server mit demselben Namen konfigurieren, hat der in der `settings.json` definierte Server Vorrang.
  - Beachte, dass alle MCP-Server-Konfigurationsoptionen unterstützt werden, außer `trust`.
- `contextFileName`: Der Name der Datei, die den Kontext für die Extension enthält. Diese wird verwendet, um den Kontext aus dem Extension-Verzeichnis zu laden. Wenn diese Eigenschaft nicht gesetzt ist, aber eine `QWEN.md` Datei im Extension-Verzeichnis vorhanden ist, wird diese Datei geladen.
- `excludeTools`: Ein Array von Tool-Namen, die vom Modell ausgeschlossen werden sollen. Du kannst auch Befehlsspezifische Einschränkungen für Tools angeben, die dies unterstützen, wie z. B. das `run_shell_command` Tool. Zum Beispiel blockiert `"excludeTools": ["run_shell_command(rm -rf)"]` den Befehl `rm -rf`. Beachte, dass sich dies vom `excludeTools` Funktionsumfang des MCP-Servers unterscheidet, welcher direkt in der MCP-Server-Konfiguration aufgelistet werden kann.

Wenn Qwen Code startet, lädt es alle Extensions und führt deren Konfigurationen zusammen. Bei Konflikten hat die Workspace-Konfiguration Vorrang.

### Custom commands

Erweiterungen können [Custom Commands](./cli/commands.md#custom-commands) bereitstellen, indem sie TOML-Dateien in einem `commands/` Unterverzeichnis innerhalb des Erweiterungsverzeichnisses ablegen. Diese Commands folgen dem gleichen Format wie benutzerdefinierte und projektspezifische Custom Commands und verwenden standardisierte Namenskonventionen.

**Beispiel**

Eine Erweiterung mit dem Namen `gcp` und folgender Struktur:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

Stellt diese Commands bereit:

- `/deploy` - Wird in der Hilfe als `[gcp] Custom command from deploy.toml` angezeigt
- `/gcs:sync` - Wird in der Hilfe als `[gcp] Custom command from sync.toml` angezeigt

### Konfliktlösung

Extension Commands haben die niedrigste Priorität. Wenn ein Konflikt mit User- oder Project Commands auftritt:

1. **Kein Konflikt**: Das Extension Command verwendet seinen natürlichen Namen (z.B. `/deploy`)
2. **Bei Konflikt**: Das Extension Command wird mit dem Extension-Präfix umbenannt (z.B. `/gcp.deploy`)

Beispiel: Wenn sowohl ein User als auch die `gcp` Extension ein `deploy` Command definieren:

- `/deploy` - Führt das User-deploy Command aus
- `/gcp.deploy` - Führt das Extension-deploy Command aus (markiert mit `[gcp]` Tag)

## Variablen

Qwen Code Erweiterungen erlauben die Verwendung von Variablen in `qwen-extension.json`. Dies kann nützlich sein, wenn du z. B. das aktuelle Verzeichnis benötigst, um einen MCP-Server mit `"cwd": "${extensionPath}${/}run.ts"` zu starten.

**Unterstützte Variablen:**

| Variable                   | Beschreibung                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Der vollständige Pfad der Erweiterung im Dateisystem des Benutzers, z. B. '/Users/username/.qwen/extensions/example-extension'. Symlinks werden nicht aufgelöst. |
| `${workspacePath}`         | Der vollständige Pfad des aktuellen Workspaces.                                                                                                       |
| `${/} or ${pathSeparator}` | Der Pfadtrenner (unterscheidet sich je nach Betriebssystem).                                                                                        |