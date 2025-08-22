# Qwen Code Extensions

Qwen Code unterstützt Extensions, die verwendet werden können, um seine Funktionalität zu konfigurieren und zu erweitern.

## Wie es funktioniert

Beim Start sucht Qwen Code nach Extensions in zwei Verzeichnissen:

1.  `<workspace>/.qwen/extensions`
2.  `<home>/.qwen/extensions`

Qwen Code lädt alle Extensions aus beiden Verzeichnissen. Wenn eine Extension mit demselben Namen in beiden Verzeichnissen existiert, hat die Extension im Workspace-Verzeichnis Vorrang.

Innerhalb jedes Verzeichnisses sind einzelne Extensions als Unterverzeichnisse organisiert, die eine `qwen-extension.json` Datei enthalten. Zum Beispiel:

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

Erweiterungen können [benutzerdefinierte Befehle](./cli/commands.md#custom-commands) bereitstellen, indem sie TOML-Dateien in einem `commands/` Unterverzeichnis innerhalb des Erweiterungsverzeichnisses ablegen. Diese Befehle folgen dem gleichen Format wie benutzer- und projektspezifische Custom Commands und verwenden standardisierte Namenskonventionen.

### Beispiel

Eine Erweiterung mit dem Namen `gcp` und folgender Struktur:

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

Extension Commands haben die niedrigste Priorität. Wenn ein Konflikt mit User- oder Project Commands auftritt:

1. **Kein Konflikt**: Das Extension Command verwendet seinen natürlichen Namen (z.B. `/deploy`)
2. **Mit Konflikt**: Das Extension Command wird mit dem Extension Prefix umbenannt (z.B. `/gcp.deploy`)

Beispiel: Wenn sowohl ein User als auch die `gcp` Extension ein `deploy` Command definieren:

- `/deploy` - Führt das User Deploy Command aus
- `/gcp.deploy` - Führt das Extension Deploy Command aus (markiert mit `[gcp]` Tag)