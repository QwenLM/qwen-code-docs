# Qwen Code Extensions

Qwen Code unterstützt Extensions, die verwendet werden können, um seine Funktionalität zu konfigurieren und zu erweitern.

## Wie es funktioniert

Beim Start sucht Qwen Code nach Extensions in zwei Verzeichnissen:

1.  `<workspace>/.qwen/extensions`
2.  `<home>/.qwen/extensions`

Qwen Code lädt alle Extensions aus beiden Verzeichnissen. Wenn eine Extension mit demselben Namen in beiden Verzeichnissen existiert, hat die Extension im Workspace-Verzeichnis Vorrang.

Innerhalb jedes Verzeichnisses existieren einzelne Extensions als Unterverzeichnis, das eine `qwen-extension.json` Datei enthält. Zum Beispiel:

`<workspace>/.qwen/extensions/my-extension/qwen-extension.json`

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

- `name`: Der Name der Extension. Dieser wird verwendet, um die Extension eindeutig zu identifizieren und zur Konfliktlösung, wenn Extension-Befehle denselben Namen wie Benutzer- oder Projekt-Befehle haben.
- `version`: Die Version der Extension.
- `mcpServers`: Eine Map von MCP-Servern, die konfiguriert werden sollen. Der Schlüssel ist der Name des Servers, der Wert ist die Server-Konfiguration. Diese Server werden beim Start genauso geladen wie MCP-Server, die in einer [`settings.json` Datei](./cli/configuration.md) konfiguriert sind. Wenn sowohl eine Extension als auch eine `settings.json` Datei einen MCP-Server mit demselben Namen konfigurieren, hat der in der `settings.json` Datei definierte Server Vorrang.
- `contextFileName`: Der Name der Datei, die den Kontext für die Extension enthält. Diese wird verwendet, um den Kontext aus dem Workspace zu laden. Wenn diese Eigenschaft nicht verwendet wird, aber eine `QWEN.md` Datei im Extension-Verzeichnis vorhanden ist, wird diese Datei geladen.
- `excludeTools`: Ein Array von Tool-Namen, die vom Modell ausgeschlossen werden sollen. Du kannst auch Befehlsspezifische Einschränkungen für Tools angeben, die dies unterstützen, wie z. B. das `run_shell_command` Tool. Beispiel: `"excludeTools": ["run_shell_command(rm -rf)"]` blockiert den `rm -rf` Befehl.

Wenn Qwen Code startet, lädt es alle Extensions und führt deren Konfigurationen zusammen. Bei Konflikten hat die Workspace-Konfiguration Vorrang.

## Extension Commands

Erweiterungen können [benutzerdefinierte Befehle](./cli/commands.md#custom-commands) bereitstellen, indem sie TOML-Dateien in einem `commands/` Unterverzeichnis innerhalb des Erweiterungsverzeichnisses ablegen. Diese Befehle folgen demselben Format wie benutzer- und projektspezifische benutzerdefinierte Befehle und verwenden Standard-Namenskonventionen.

### Beispiel

Eine Erweiterung mit dem Namen `gcp` und der folgenden Struktur:

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

Stellt diese Befehle zur Verfügung:

- `/deploy` - Wird in der Hilfe als `[gcp] Custom command from deploy.toml` angezeigt
- `/gcs:sync` - Wird in der Hilfe als `[gcp] Custom command from sync.toml` angezeigt

### Konfliktlösung

Erweiterungsbefehle haben die niedrigste Priorität. Wenn ein Konflikt mit Benutzer- oder Projektbefehlen auftritt:

1. **Kein Konflikt**: Der Erweiterungsbefehl verwendet seinen natürlichen Namen (z. B. `/deploy`)
2. **Mit Konflikt**: Der Erweiterungsbefehl wird mit dem Präfix der Erweiterung umbenannt (z. B. `/gcp.deploy`)

Wenn zum Beispiel sowohl ein Benutzer als auch die `gcp`-Erweiterung einen `deploy`-Befehl definieren:

- `/deploy` – Führt den Deploy-Befehl des Benutzers aus
- `/gcp.deploy` – Führt den Deploy-Befehl der Erweiterung aus (gekennzeichnet mit dem Tag `[gcp]`)

## Installation von Erweiterungen

Du kannst Erweiterungen mithilfe des `install`-Befehls installieren. Dieser Befehl ermöglicht es, Erweiterungen aus einem Git-Repository oder einem lokalen Pfad zu installieren.

### Verwendung

`qwen extensions install <source> | [options]`

### Optionen

- `source <url> positional argument`: Die URL eines Git-Repositorys, von dem die Erweiterung installiert werden soll. Das Repository muss eine `qwen-extension.json`-Datei im Stammverzeichnis enthalten.
- `--path <path>`: Der Pfad zu einem lokalen Verzeichnis, das als Erweiterung installiert werden soll. Das Verzeichnis muss eine `qwen-extension.json`-Datei enthalten.

# Variablen

Qwen Code Erweiterungen erlauben die Verwendung von Variablen in `qwen-extension.json`. Dies kann nützlich sein, wenn du z. B. das aktuelle Verzeichnis benötigst, um einen MCP-Server mit `"cwd": "${extensionPath}${/}run.ts"` auszuführen.

**Unterstützte Variablen:**

| Variable                   | Beschreibung                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Der vollständige Pfad der Erweiterung im Dateisystem des Benutzers, z. B. '/Users/username/.qwen/extensions/example-extension'. Symbolische Links werden nicht aufgelöst. |
| `${/} or ${pathSeparator}` | Der Pfadtrenner (unterscheidet sich je nach Betriebssystem).                                                                                              |