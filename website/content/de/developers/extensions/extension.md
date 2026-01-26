# Qwen Code-Erweiterungen

Qwen Code-Erweiterungen packen Prompts, MCP-Server und benutzerdefinierte Befehle in ein vertrautes und benutzerfreundliches Format. Mit Erweiterungen können Sie die Funktionen von Qwen Code erweitern und diese Fähigkeiten mit anderen teilen. Sie sind so konzipiert, dass sie einfach zu installieren und weiterzugeben sind.

## Erweiterungsverwaltung

Wir bieten eine Reihe von Tools zur Verwaltung von Erweiterungen über die Befehle `qwen extensions` an.

Beachten Sie, dass diese Befehle nicht innerhalb der CLI unterstützt werden, obwohl Sie installierte Erweiterungen mit dem Unterbefehl `/extensions list` auflisten können.

Beachten Sie, dass sich alle diese Befehle erst nach einem Neustart auf aktive CLI-Sitzungen auswirken.

### Installieren einer Erweiterung

Sie können eine Erweiterung mit `qwen extensions install` installieren, entweder über eine GitHub-URL oder einen lokalen Pfad.

Beachten Sie, dass wir eine Kopie der installierten Erweiterung erstellen, daher müssen Sie `qwen extensions update` ausführen, um Änderungen sowohl von lokal definierten Erweiterungen als auch von denen auf GitHub zu übernehmen.

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

Dadurch wird die Qwen Code Security-Erweiterung installiert, die Unterstützung für den Befehl `/security:analyze` bietet.

### Deinstallieren einer Erweiterung

Zum Deinstallieren führen Sie `qwen extensions uninstall extension-name` aus, also in diesem Beispiel:

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

Für Erweiterungen, die aus einem lokalen Pfad oder einem Git-Repository installiert wurden, können Sie mit `qwen extensions update Erweiterungsname` explizit auf die neueste Version aktualisieren (wie sie im `version`-Feld der `qwen-extension.json` angegeben ist).

Sie können alle Erweiterungen aktualisieren mit:

```
qwen extensions update --all
```

## Erstellung von Erweiterungen

Wir bieten Befehle an, um die Entwicklung von Erweiterungen zu vereinfachen.

### Erstellen einer Beispiel-Erweiterung

Wir bieten mehrere Beispiel-Erweiterungen wie `context`, `custom-commands`, `exclude-tools` und `mcp-server`. Diese Beispiele können Sie [hier](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples) einsehen.

Um eines dieser Beispiele in ein Entwicklungsverzeichnis zu kopieren, verwenden Sie den gewünschten Typ:

```
qwen extensions new pfad/zu/verzeichnis custom-commands
```

### Eine lokale Erweiterung verknüpfen

Der Befehl `qwen extensions link` erstellt einen symbolischen Link vom Installationsverzeichnis der Erweiterung zum Entwicklungsverzeichnis.

Dies ist nützlich, damit Sie nicht jedes Mal `qwen extensions update` ausführen müssen, wenn Sie Änderungen testen möchten.

```
qwen extensions link pfad/zu/verzeichnis
```

## Funktionsweise

Beim Start sucht Qwen Code nach Erweiterungen in `<home>/.qwen/extensions`.

Erweiterungen bestehen aus einem Verzeichnis, das eine Datei namens `qwen-extension.json` enthält. Beispiel:

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
  "excludeTools": ["run_shell_command"]
}
```

- `name`: Der Name der Erweiterung. Dies wird verwendet, um die Erweiterung eindeutig zu identifizieren und zur Konfliktlösung, wenn Erweiterungsbefehle denselben Namen wie Benutzer- oder Projektbefehle haben. Der Name sollte aus Kleinbuchstaben oder Zahlen bestehen und Bindestriche statt Unterstrichen oder Leerzeichen verwenden. So werden Benutzer Ihre Erweiterung in der CLI ansprechen. Beachten Sie, dass dieser Name mit dem Verzeichnisnamen der Erweiterung übereinstimmen sollte.
- `version`: Die Version der Erweiterung.
- `mcpServers`: Eine Abbildung von MCP-Servern zur Konfiguration. Der Schlüssel ist der Name des Servers und der Wert ist die Serverkonfiguration. Diese Server werden beim Start geladen, genau wie MCP-Server, die in einer [`settings.json`-Datei](./cli/configuration.md) konfiguriert sind. Wenn sowohl eine Erweiterung als auch eine `settings.json`-Datei einen MCP-Server mit demselben Namen konfigurieren, hat der in der `settings.json`-Datei definierte Server Vorrang.
  - Beachten Sie, dass alle MCP-Server-Konfigurationsoptionen unterstützt werden, außer `trust`.
- `contextFileName`: Der Name der Datei, die den Kontext für die Erweiterung enthält. Dies wird verwendet, um den Kontext aus dem Erweiterungsverzeichnis zu laden. Wenn diese Eigenschaft nicht verwendet wird, aber eine `QWEN.md`-Datei im Erweiterungsverzeichnis vorhanden ist, wird diese Datei geladen.
- `excludeTools`: Ein Array von Tool-Namen, die vom Modell ausgeschlossen werden sollen. Sie können auch befehlspezifische Einschränkungen für Tools angeben, die dies unterstützen, wie das `run_shell_command`-Tool. Zum Beispiel wird `"excludeTools": ["run_shell_command(rm -rf)"]` den Befehl `rm -rf` blockieren. Beachten Sie, dass dies sich von der `excludeTools`-Funktionalität des MCP-Servers unterscheidet, die in der MCP-Server-Konfiguration aufgelistet werden kann. **Wichtig:** In `excludeTools` angegebene Tools werden für den gesamten Gesprächskontext deaktiviert und beeinflussen alle nachfolgenden Abfragen in der aktuellen Sitzung.

Wenn Qwen Code startet, lädt es alle Erweiterungen und führt deren Konfigurationen zusammen. Bei Konflikten hat die Arbeitsbereichskonfiguration Vorrang.

### Benutzerdefinierte Befehle

Erweiterungen können [benutzerdefinierte Befehle](./cli/commands.md#custom-commands) bereitstellen, indem sie TOML-Dateien in einem `commands/`-Unterverzeichnis innerhalb des Erweiterungsverzeichnisses ablegen. Diese Befehle folgen dem gleichen Format wie benutzer- und projektspezifische benutzerdefinierte Befehle und verwenden Standard-Namenskonventionen.

**Beispiel**

Eine Erweiterung mit dem Namen `gcp` mit der folgenden Struktur:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

Würde diese Befehle bereitstellen:

- `/deploy` - Wird in der Hilfe als `[gcp] Benutzerdefinierter Befehl aus deploy.toml` angezeigt
- `/gcs:sync` - Wird in der Hilfe als `[gcp] Benutzerdefinierter Befehl aus sync.toml` angezeigt

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