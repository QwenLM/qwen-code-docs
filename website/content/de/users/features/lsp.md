# Language Server Protocol (LSP)-Unterstützung

Qwen Code bietet native Unterstützung für das Language Server Protocol (LSP) und ermöglicht erweiterte Code-Intelligence-Funktionen wie „Go to Definition“, „Find References“, Diagnosen und Code-Actions. Diese Integration erlaubt es dem KI-Agenten, deinen Code tiefergehend zu verstehen und präzisere Unterstützung zu bieten.

## Übersicht

Die LSP-Unterstützung in Qwen Code funktioniert durch die Verbindung zu Language Servern, die deinen Code verstehen. Sobald du Server über `.lsp.json` (oder Erweiterungen) konfiguriert hast, kann Qwen Code sie starten und für folgende Aufgaben nutzen:

- Zu Symboldefinitionen navigieren
- Alle Referenzen zu einem Symbol finden
- Hover-Informationen abrufen (Dokumentation, Typinformationen)
- Diagnosemeldungen anzeigen (Fehler, Warnungen)
- Auf Code-Actions zugreifen (Quick Fixes, Refactorings)
- Call-Hierarchien analysieren

## Schnellstart

LSP ist ein experimentelles Feature in Qwen Code. Um es zu aktivieren, verwende das Kommandozeilen-Flag `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

LSP-Server werden konfigurationsgesteuert gestartet. Du musst sie in `.lsp.json` (oder über Erweiterungen) definieren, damit Qwen Code sie starten kann.

### Voraussetzungen

Du musst den Language Server für deine Programmiersprache installiert haben:

| Sprache               | Language Server            | Installationsbefehl                                                              |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                           |
| Python                | pylsp                      | `pip install python-lsp-server`                                                  |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                     |
| Rust                  | rust-analyzer              | [Installationsanleitung](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | Installiere LLVM/clangd über deinen Paketmanager                                 |
| Java                  | jdtls                      | Installiere JDTLS und ein JDK                                                    |

## Konfiguration

### `.lsp.json`-Datei

Du kannst Language Server über eine `.lsp.json`-Datei im Projektstammverzeichnis konfigurieren. Jeder Schlüssel der obersten Ebene ist ein Language-Identifier und sein Wert ist das Server-Konfigurationsobjekt.

**Grundlegendes Format:**

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact"
    }
  }
}
```

### C/C++-Konfiguration (clangd)

Abhängigkeiten:

- clangd (LLVM) muss installiert und im `PATH` verfügbar sein.
- Für genaue Ergebnisse ist eine Compile-Datenbank (`compile_commands.json`) oder `compile_flags.txt` erforderlich.

Beispiel:

```json
{
  "cpp": {
    "command": "clangd",
    "args": [
      "--background-index",
      "--clang-tidy",
      "--header-insertion=iwyu",
      "--completion-style=detailed"
    ]
  }
}
```

### Java-Konfiguration (jdtls)

Abhängigkeiten:

- JDK installiert und im `PATH` verfügbar (`java`).
- JDTLS installiert und im `PATH` verfügbar (`jdtls`).

Beispiel:

```json
{
  "java": {
    "command": "jdtls",
    "args": ["-configuration", ".jdtls-config", "-data", ".jdtls-workspace"]
  }
}
```

### Konfigurationsoptionen

#### Erforderliche Felder

| Option    | Typ    | Beschreibung                                                                                                                                       |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Befehl zum Starten des LSP-Servers. Unterstützt einfache Befehlsnamen, die über `PATH` aufgelöst werden (z. B. `clangd`), sowie absolute Pfade (z. B. `/opt/llvm/bin/clangd`). |

#### Optionale Felder

| Option                  | Typ      | Standardwert | Beschreibung                                             |
| ----------------------- | -------- | ------------ | ------------------------------------------------------- |
| `args`                  | string[] | `[]`         | Kommandozeilenargumente                                  |
| `transport`             | string   | `"stdio"`    | Transporttyp: `stdio`, `tcp` oder `socket`               |
| `env`                   | object   | -            | Umgebungsvariablen                                       |
| `initializationOptions` | object   | -            | LSP-Initialisierungsoptionen                             |
| `settings`              | object   | -            | Server-Einstellungen über `workspace/didChangeConfiguration` |
| `extensionToLanguage`   | object   | -            | Ordnet Dateiendungen Language-Identifiern zu             |
| `workspaceFolder`       | string   | -            | Workspace-Verzeichnis überschreiben (muss sich innerhalb des Projektstamms befinden) |
| `startupTimeout`        | number   | `10000`      | Start-Timeout in Millisekunden                           |
| `shutdownTimeout`       | number   | `5000`       | Shutdown-Timeout in Millisekunden                        |
| `restartOnCrash`        | boolean  | `false`      | Automatischer Neustart bei Absturz                       |
| `maxRestarts`           | number   | `3`          | Maximale Anzahl von Neustartversuchen                    |
| `trustRequired`         | boolean  | `true`       | Erfordert vertrauenswürdigen Workspace                   |

### TCP/Socket-Transport

Für Server, die TCP- oder Unix-Socket-Transport verwenden:

```json
{
  "remote-lsp": {
    "transport": "tcp",
    "socket": {
      "host": "127.0.0.1",
      "port": 9999
    },
    "extensionToLanguage": {
      ".custom": "custom"
    }
  }
}
```

## Verfügbare LSP-Operationen

Qwen Code stellt LSP-Funktionalitäten über das einheitliche `lsp`-Tool bereit. Folgende Operationen sind verfügbar:

Standortbasierte Operationen (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` und `prepareCallHierarchy`) erfordern eine exakte `filePath` + `line` + `character`-Position. Wenn du die genaue Position nicht kennst, verwende zuerst `workspaceSymbol` oder `documentSymbol`, um das Symbol zu lokalisieren.

### Code-Navigation

#### Go to Definition

Findet, wo ein Symbol definiert ist.

```
Operation: goToDefinition
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Find References

Findet alle Referenzen zu einem Symbol.

```
Operation: findReferences
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
  - includeDeclaration: Include the declaration itself (optional)
```

#### Go to Implementation

Findet Implementierungen einer Schnittstelle oder abstrakten Methode.

```
Operation: goToImplementation
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

### Symbolinformationen

#### Hover

Ruft Dokumentations- und Typinformationen für ein Symbol ab.

```
Operation: hover
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Document Symbols

Ruft alle Symbole in einem Dokument ab.

```
Operation: documentSymbol
Parameters:
  - filePath: Path to the file
```

#### Workspace-Symbolsuche

Sucht nach Symbolen im gesamten Workspace.

```
Operation: workspaceSymbol
Parameters:
  - query: Search query string
  - limit: Maximum results (optional)
```

### Call-Hierarchie

#### Prepare Call Hierarchy

Ruft das Call-Hierarchie-Element an einer Position ab.

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Path to the file
  - line: Line number (1-based)
  - character: Column number (1-based)
```

#### Incoming Calls

Findet alle Funktionen, die die angegebene Funktion aufrufen.

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

#### Outgoing Calls

Findet alle Funktionen, die von der angegebenen Funktion aufgerufen werden.

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: Item from prepareCallHierarchy
```

### Diagnosen

#### Datei-Diagnosen

Ruft Diagnosemeldungen (Fehler, Warnungen) für eine Datei ab.

```
Operation: diagnostics
Parameters:
  - filePath: Path to the file
```

#### Workspace-Diagnosen

Ruft alle Diagnosemeldungen im gesamten Workspace ab.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximum results (optional)
```

### Code Actions

#### Get Code Actions

Ruft verfügbare Code-Actions (Quick Fixes, Refactorings) an einer Position ab.

```
Operation: codeActions
Parameters:
  - filePath: Path to the file
  - line: Start line number (1-based)
  - character: Start column number (1-based)
  - endLine: End line number (optional, defaults to line)
  - endCharacter: End column (optional, defaults to character)
  - diagnostics: Diagnostics to get actions for (optional)
  - codeActionKinds: Filter by action kind (optional)
```

Code-Action-Typen:

- `quickfix` - Quick Fixes für Fehler/Warnungen
- `refactor` - Refactoring-Operationen
- `refactor.extract` - Extrahieren in Funktion/Variable
- `refactor.inline` - Inline-Funktion/Variable
- `source` - Quellcode-Actions
- `source.organizeImports` - Imports organisieren
- `source.fixAll` - Alle automatisch behebbaren Probleme beheben

## Sicherheit

LSP-Server werden standardmäßig nur in vertrauenswürdigen Workspaces gestartet. Das liegt daran, dass Language Server mit deinen Benutzerberechtigungen laufen und Code ausführen können.

### Vertrauenssteuerung

- **Trusted Workspace**: LSP-Server werden gestartet, wenn sie konfiguriert sind
- **Untrusted Workspace**: LSP-Server werden nicht gestartet, es sei denn, `trustRequired: false` ist in der Serverkonfiguration gesetzt

Um einen Workspace als vertrauenswürdig zu markieren, verwende den `/trust`-Befehl.

### Vertrauens-Override pro Server

Du kannst Vertrauensanforderungen für bestimmte Server in deren Konfiguration überschreiben:

```json
{
  "safe-server": {
    "command": "safe-language-server",
    "args": ["--stdio"],
    "trustRequired": false,
    "extensionToLanguage": {
      ".safe": "safe"
    }
  }
}
```

## Fehlerbehebung

### Server startet nicht

1. **`--experimental-lsp`-Flag prüfen**: Stelle sicher, dass du das Flag beim Starten von Qwen Code verwendest
2. **Installation des Servers prüfen**: Führe den Befehl manuell aus (z. B. `clangd --version`), um dies zu überprüfen
3. **Befehl prüfen**: Die Server-Binary muss sich im systemweiten `PATH` befinden oder als absoluter Pfad angegeben sein (z. B. `/opt/llvm/bin/clangd`). Relative Pfade, die den Workspace verlassen, werden blockiert
4. **Workspace-Vertrauen prüfen**: Der Workspace muss für LSP als vertrauenswürdig markiert sein (verwende `/trust`)
5. **Logs prüfen**: Suche nach `[LSP]`-Einträgen im Debug-Log (siehe Abschnitt „Debugging“ unten)
6. **Prozess prüfen**: Führe `ps aux | grep <server-name>` aus, um zu überprüfen, ob der Serverprozess läuft

### Langsame Performance

1. **Große Projekte**: Erwäge, `node_modules` und andere große Verzeichnisse auszuschließen
2. **Server-Timeout**: Erhöhe `startupTimeout` in der Serverkonfiguration für langsame Server

### Keine Ergebnisse

1. **Server nicht bereit**: Der Server indiziert möglicherweise noch. Für C/C++-Projekte mit clangd stelle sicher, dass `--background-index` in den Args enthalten ist und eine `compile_commands.json` (oder `compile_flags.txt`) im Projektstamm oder einem übergeordneten Verzeichnis existiert. Verwende `--compile-commands-dir=<path>`, falls sie sich in einem Build-Subverzeichnis befindet
2. **Datei nicht gespeichert**: Speichere deine Datei, damit der Server die Änderungen übernimmt
3. **Falsche Sprache**: Prüfe, ob der richtige Server für deine Sprache läuft
4. **Prozess prüfen**: Führe `ps aux | grep <server-name>` aus, um zu überprüfen, ob der Server tatsächlich läuft

### Debugging

LSP-Debug-Logs werden automatisch in Sitzungs-Logdateien unter `~/.qwen/debug/` geschrieben. So prüfst du LSP-bezogene Einträge:

```bash
# View the latest session log
grep '\[LSP\]' ~/.qwen/debug/latest

# Common error messages to look for:
#   "command path is unsafe"  → relative path escapes workspace, use absolute path or add to PATH
#   "command not found"       → server binary not installed or not in PATH
#   "requires trusted workspace" → run /trust first
```

Du kannst außerdem überprüfen, ob der Serverprozess läuft:

```bash
ps aux | grep clangd   # or typescript-language-server, jdtls, etc.
```

## LSP-Konfiguration für Erweiterungen

Erweiterungen können LSP-Serverkonfigurationen über das `lspServers`-Feld in ihrer `plugin.json` bereitstellen. Dies kann entweder ein Inline-Objekt oder ein Pfad zu einer `.lsp.json`-Datei sein. Qwen Code lädt diese Konfigurationen, wenn die Erweiterung aktiviert ist. Das Format entspricht dem gleichen sprachbasierten Layout, das in projektbezogenen `.lsp.json`-Dateien verwendet wird.

## Best Practices

1. **Language Server global installieren**: Dies stellt sicher, dass sie in allen Projekten verfügbar sind
2. **Projektspezifische Einstellungen verwenden**: Konfiguriere Serveroptionen bei Bedarf pro Projekt über `.lsp.json`
3. **Server aktuell halten**: Aktualisiere deine Language Server regelmäßig für optimale Ergebnisse
4. **Vertrauen sorgfältig vergeben**: Markiere nur Workspaces aus vertrauenswürdigen Quellen als sicher

## FAQ

### F: Wie aktiviere ich LSP?

Verwende das `--experimental-lsp`-Flag beim Starten von Qwen Code:

```bash
qwen --experimental-lsp
```

### F: Wie erkenne ich, welche Language Server laufen?

Prüfe das Debug-Log auf `[LSP]`-Einträge (`grep '\[LSP\]' ~/.qwen/debug/latest`) oder überprüfe den Prozess direkt mit `ps aux | grep <server-name>`.

### F: Kann ich mehrere Language Server für denselben Dateityp verwenden?

Ja, aber für jede Operation wird nur einer verwendet. Der erste Server, der Ergebnisse liefert, gewinnt.

### F: Funktioniert LSP im Sandbox-Modus?

LSP-Server laufen außerhalb der Sandbox, um auf deinen Code zuzugreifen. Sie unterliegen den Workspace-Vertrauenseinstellungen.