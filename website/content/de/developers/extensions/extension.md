# Qwen Code-Erweiterungen

Qwen Code-Erweiterungen bündeln Prompts, MCP-Server und benutzerdefinierte Befehle in einem vertrauten und benutzerfreundlichen Format. Mit Erweiterungen können Sie die Funktionen von Qwen Code erweitern und diese Funktionen mit anderen teilen. Sie sind so konzipiert, dass sie einfach installierbar und teilbar sind.

## Erweiterungsverwaltung

Wir bieten eine Reihe von Tools zur Erweiterungsverwaltung mit den Befehlen `qwen extensions`.

Beachten Sie, dass diese Befehle nicht innerhalb der CLI unterstützt werden, obwohl Sie installierte Erweiterungen mit dem Unterbefehl `/extensions list` auflisten können.

Beachten Sie, dass alle diese Befehle nur in aktiven CLI-Sitzungen nach einem Neustart wirksam werden.

### Installation einer Erweiterung

Du kannst eine Erweiterung mithilfe von `qwen extensions install` entweder mit einer GitHub-URL oder einem lokalen Pfad installieren.

Beachte, dass wir eine Kopie der installierten Erweiterung erstellen. Daher musst du `qwen extensions update` ausführen, um Änderungen sowohl von lokal definierten Erweiterungen als auch von solchen auf GitHub zu übernehmen.

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

Dadurch wird die Qwen Code Security-Erweiterung installiert, welche Unterstützung für den Befehl `/security:analyze` bietet.

### Deinstallation einer Erweiterung

Zum Deinstallieren führe `qwen extensions uninstall extension-name` aus. Im Fall des vorherigen Installationsbeispiels wäre das:

```
qwen extensions uninstall qwen-cli-security
```

### Deaktivieren einer Erweiterung

Erweiterungen sind standardmäßig in allen Arbeitsbereichen aktiviert. Sie können eine Erweiterung entweder vollständig oder für einen bestimmten Arbeitsbereich deaktivieren.

Zum Beispiel wird `qwen extensions disable extension-name` die Erweiterung auf Benutzerebene deaktivieren, sodass sie überall deaktiviert ist. `qwen extensions disable extension-name --scope=workspace` deaktiviert die Erweiterung nur im aktuellen Arbeitsbereich.

### Aktivieren einer Erweiterung

Sie können Erweiterungen mit `qwen extensions enable extension-name` aktivieren. Sie können eine Erweiterung auch für einen bestimmten Arbeitsbereich aktivieren, indem Sie `qwen extensions enable extension-name --scope=workspace` innerhalb dieses Arbeitsbereichs verwenden.

Dies ist nützlich, wenn Sie eine Erweiterung auf der obersten Ebene deaktiviert haben und sie nur an bestimmten Stellen aktivieren möchten.

### Aktualisieren einer Erweiterung

Für Erweiterungen, die von einem lokalen Pfad oder einem Git-Repository installiert wurden, kannst du explizit auf die neueste Version aktualisieren (entsprechend dem `version`-Feld in der `qwen-extension.json`) mit dem Befehl `qwen extensions update extension-name`.

Du kannst alle Erweiterungen aktualisieren mit:

```
qwen extensions update --all
```

## Erstellung von Erweiterungen

Wir bieten Befehle an, um die Entwicklung von Erweiterungen zu vereinfachen.

### Eine Boilerplate-Erweiterung erstellen

Wir bieten mehrere Beispiel-Erweiterungen an: `context`, `custom-commands`, `exclude-tools` und `mcp-server`. Diese Beispiele kannst du dir [hier](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples) anschauen.

Um eines dieser Beispiele in ein Entwicklungsverzeichnis zu kopieren, führe folgenden Befehl mit dem Typ deiner Wahl aus:

```
qwen extensions new path/to/directory custom-commands
```

### Verknüpfen einer lokalen Erweiterung

Der Befehl `qwen extensions link` erstellt einen symbolischen Link vom Installationsverzeichnis der Erweiterung zum Entwicklungsverzeichnis.

Dies ist nützlich, damit Sie nicht jedes Mal `qwen extensions update` ausführen müssen, wenn Sie Änderungen vornehmen möchten, die Sie testen wollen.

```
qwen extensions link pfad/zum/verzeichnis
```

## Funktionsweise

Beim Start sucht Qwen Code nach Erweiterungen im Verzeichnis `<home>/.qwen/extensions`.

Erweiterungen liegen als Verzeichnis vor, das eine Datei namens `qwen-extension.json` enthält. Zum Beispiel:

`<home>/.qwen/extensions/meine-erweiterung/qwen-extension.json`

### `qwen-extension.json`

Die Datei `qwen-extension.json` enthält die Konfiguration für die Erweiterung. Die Datei hat folgende Struktur:

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

- `name`: Der Name der Erweiterung. Dieser wird verwendet, um die Erweiterung eindeutig zu identifizieren und zur Auflösung von Konflikten, wenn Erweiterungsbefehle denselben Namen wie Benutzer- oder Projektbefehle haben. Der Name sollte aus Kleinbuchstaben oder Zahlen bestehen und Bindestriche statt Unterstriche oder Leerzeichen verwenden. So werden Benutzer Ihre Erweiterung in der CLI referenzieren. Beachten Sie, dass wir erwarten, dass dieser Name mit dem Verzeichnisnamen der Erweiterung übereinstimmt.
- `version`: Die Version der Erweiterung.
- `mcpServers`: Eine Zuordnung von MCP-Servern zur Konfiguration. Der Schlüssel ist der Name des Servers und der Wert ist die Serverkonfiguration. Diese Server werden beim Start genauso geladen wie MCP-Server, die in einer [`settings.json`-Datei](./cli/configuration.md) konfiguriert sind. Wenn sowohl eine Erweiterung als auch eine `settings.json`-Datei einen MCP-Server mit demselben Namen konfigurieren, hat der in der `settings.json`-Datei definierte Server Vorrang.
  - Beachten Sie, dass alle MCP-Server-Konfigurationsoptionen unterstützt werden, außer `trust`.
- `contextFileName`: Der Name der Datei, die den Kontext für die Erweiterung enthält. Diese wird verwendet, um den Kontext aus dem Erweiterungsverzeichnis zu laden. Wenn diese Eigenschaft nicht verwendet wird, aber eine `QWEN.md`-Datei im Erweiterungsverzeichnis vorhanden ist, wird diese Datei geladen.
- `excludeTools`: Ein Array von Tool-Namen, die vom Modell ausgeschlossen werden sollen. Sie können auch Befehlsspezifische Einschränkungen für Tools angeben, die dies unterstützen, wie z.B. das `run_shell_command`-Tool. Zum Beispiel blockiert `"excludeTools": ["run_shell_command(rm -rf)"]` den Befehl `rm -rf`. Beachten Sie, dass sich dies von der MCP-Server-Funktionalität `excludeTools` unterscheidet, die in der MCP-Server-Konfiguration aufgelistet werden kann. **Wichtig:** In `excludeTools` angegebene Tools werden für den gesamten Gesprächskontext deaktiviert und beeinflussen alle nachfolgenden Abfragen in der aktuellen Sitzung.

Wenn Qwen Code startet, lädt es alle Erweiterungen und führt deren Konfigurationen zusammen. Bei Konflikten hat die Workspace-Konfiguration Vorrang.

### Benutzerdefinierte Befehle

Erweiterungen können [benutzerdefinierte Befehle](./cli/commands.md#custom-commands) bereitstellen, indem sie TOML-Dateien in einem Unterverzeichnis `commands/` innerhalb des Erweiterungsverzeichnisses ablegen. Diese Befehle folgen dem gleichen Format wie benutzer- und projektspezifische benutzerdefinierte Befehle und verwenden Standard-Namenskonventionen.

**Beispiel**

Eine Erweiterung mit dem Namen `gcp` und der folgenden Struktur:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

Stellt diese Befehle bereit:

- `/deploy` - Wird in der Hilfe als `[gcp] Benutzerdefinierter Befehl aus deploy.toml` angezeigt
- `/gcs:sync` - Wird in der Hilfe als `[gcp] Benutzerdefinierter Befehl aus sync.toml` angezeigt

### Konfliktlösung

Erweiterungsbefehle haben die niedrigste Priorität. Wenn ein Konflikt mit Benutzer- oder Projektbefehlen auftritt:

1. **Kein Konflikt**: Der Erweiterungsbefehl verwendet seinen natürlichen Namen (z. B. `/deploy`)
2. **Mit Konflikt**: Der Erweiterungsbefehl wird mit dem Präfix der Erweiterung umbenannt (z. B. `/gcp.deploy`)

Wenn zum Beispiel sowohl ein Benutzer als auch die `gcp`-Erweiterung einen `deploy`-Befehl definieren:

- `/deploy` - Führt den Deploy-Befehl des Benutzers aus
- `/gcp.deploy` - Führt den Deploy-Befehl der Erweiterung aus (gekennzeichnet mit dem Tag `[gcp]`)

## Variablen

Qwen Code-Erweiterungen ermöglichen die Variablensubstitution in `qwen-extension.json`. Dies kann nützlich sein, wenn z. B. das aktuelle Verzeichnis benötigt wird, um einen MCP-Server mit `"cwd": "${extensionPath}${/}run.ts"` auszuführen.

**Unterstützte Variablen:**

| Variable                   | Beschreibung                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Der vollständig qualifizierte Pfad der Erweiterung im Dateisystem des Benutzers, z. B. '/Users/username/.qwen/extensions/example-extension'. Symbolische Links werden nicht aufgelöst. |
| `${workspacePath}`         | Der vollständig qualifizierte Pfad des aktuellen Arbeitsbereichs.                                                                                        |
| `${/} or ${pathSeparator}` | Das Pfadtrennzeichen (unterscheidet sich je nach Betriebssystem).                                                                                        |