# Unterstützung für das Language Server Protocol (LSP)

Qwen Code bietet native Unterstützung für das Language Server Protocol (LSP) und ermöglicht damit erweiterte Code-Intelligence-Funktionen wie „Go to Definition“, „Find References“, Diagnosen und Code Actions. Diese Integration ermöglicht es dem KI-Agenten, deinen Code tiefer zu verstehen und präzisere Unterstützung zu bieten.

## Übersicht

Die LSP-Unterstützung in Qwen Code funktioniert durch die Verbindung zu Language Servern, die deinen Code verstehen. Sobald du Server über `.lsp.json` (oder Erweiterungen) konfiguriert hast, kann Qwen Code diese starten und für folgende Aufgaben nutzen:

- Zu Symboldefinitionen navigieren
- Alle Referenzen zu einem Symbol finden
- Hover-Informationen abrufen (Dokumentation, Typinformationen)
- Diagnosemeldungen anzeigen (Fehler, Warnungen)
- Auf Code Actions zugreifen (Quick Fixes, Refactorings)
- Aufrufhierarchien analysieren

## Schnellstart

LSP ist ein experimentelles Feature in Qwen Code. Um es zu aktivieren, verwende das Kommandozeilen-Flag `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

LSP-Server werden konfigurationsgesteuert. Du musst sie in `.lsp.json` (oder über Erweiterungen) definieren, damit Qwen Code sie starten kann.

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

Du kannst Language Server über eine `.lsp.json`-Datei im Projektstammverzeichnis konfigurieren. Dabei wird das Format mit Sprache als Schlüssel verwendet, das in der [Referenz zur LSP-Konfiguration für Claude Code-Plugins](https://code.claude.com/docs/en/plugins-reference#lsp-servers) beschrieben ist.

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

### Konfiguration für C/C++ (clangd)

Abhängigkeiten:

- clangd (LLVM) muss installiert und im `PATH` verfügbar sein.
- Eine Compile-Datenbank (`compile_commands.json`) oder `compile_flags.txt` ist für präzise Ergebnisse erforderlich.

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

### Konfiguration für Java (jdtls)

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

| Option    | Typ    | Beschreibung                                          |
| --------- | ------ | ----------------------------------------------------- |
| `command` | string | Befehl zum Starten des LSP-Servers (muss im `PATH` liegen) |

#### Optionale Felder

| Option                  | Typ      | Standardwert | Beschreibung                                              |
| ----------------------- | -------- | ------------ | --------------------------------------------------------- |
| `args`                  | string[] | `[]`         | Kommandozeilenargumente                                   |
| `transport`             | string   | `"stdio"`    | Transporttyp: `stdio`, `tcp` oder `socket`                |
| `env`                   | object   | -            | Umgebungsvariablen                                        |
| `initializationOptions` | object   | -            | LSP-Initialisierungsoptionen                              |
| `settings`              | object   | -            | Servereinstellungen über `workspace/didChangeConfiguration` |
| `extensionToLanguage`   | object   | -            | Ordnet Dateierweiterungen Sprach-IDs zu                   |
| `workspaceFolder`       | string   | -            | Workspace-Verzeichnis überschreiben (muss innerhalb des Projektstamms liegen) |
| `startupTimeout`        | number   | `10000`      | Start-Timeout in Millisekunden                            |
| `shutdownTimeout`       | number   | `5000`       | Shutdown-Timeout in Millisekunden                         |
| `restartOnCrash`        | boolean  | `false`      | Automatischer Neustart bei Absturz                        |
| `maxRestarts`           | number   | `3`          | Maximale Anzahl von Neustartversuchen                     |
| `trustRequired`         | boolean  | `true`       | Erfordert vertrauenswürdigen Workspace                    |

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

Qwen Code stellt LSP-Funktionen über das einheitliche `lsp`-Tool bereit. Folgende Operationen sind verfügbar:

### Code-Navigation

#### Go to Definition

Findet die Definition eines Symbols.

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

Ruft Dokumentation und Typinformationen für ein Symbol ab.

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

#### Workspace Symbol Search

Sucht nach Symbolen im gesamten Workspace.

```
Operation: workspaceSymbol
Parameters:
  - query: Search query string
  - limit: Maximum results (optional)
```

### Call Hierarchy

#### Prepare Call Hierarchy

Ruft das Call-Hierarchy-Element an einer Position ab.

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

#### File Diagnostics

Ruft Diagnosemeldungen (Fehler, Warnungen) für eine Datei ab.

```
Operation: diagnostics
Parameters:
  - filePath: Path to the file
```

#### Workspace Diagnostics

Ruft alle Diagnosemeldungen im gesamten Workspace ab.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximum results (optional)
```

### Code Actions

#### Get Code Actions

Ruft verfügbare Code Actions (Quick Fixes, Refactorings) an einer Position ab.

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

Code Action-Kategorien:

- `quickfix` - Quick Fixes für Fehler/Warnungen
- `refactor` - Refactoring-Operationen
- `refactor.extract` - Extrahieren in Funktion/Variable
- `refactor.inline` - Funktion/Variable inline einfügen
- `source` - Quellcode-Actions
- `source.organizeImports` - Imports organisieren
- `source.fixAll` - Alle automatisch behebbaren Probleme beheben

## Sicherheit

LSP-Server werden standardmäßig nur in vertrauenswürdigen Workspaces gestartet. Das liegt daran, dass Language Server mit deinen Benutzerberechtigungen ausgeführt werden und Code ausführen können.

### Trust-Steuerung

- **Trusted Workspace**: LSP-Server werden gestartet, wenn sie konfiguriert sind
- **Untrusted Workspace**: LSP-Server werden nicht gestartet, es sei denn, `trustRequired: false` ist in der Serverkonfiguration festgelegt

Um einen Workspace als vertrauenswürdig zu markieren, verwende den `/trust`-Befehl oder konfiguriere vertrauenswürdige Ordner in den Einstellungen.

### Trust-Überschreibung pro Server

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

1. **Prüfe, ob der Server installiert ist**: Führe den Befehl manuell aus, um dies zu überprüfen
2. **Prüfe den `PATH`**: Stelle sicher, dass die Server-Binary im System-`PATH` liegt
3. **Prüfe den Workspace-Trust**: Der Workspace muss für LSP als vertrauenswürdig eingestuft sein
4. **Prüfe die Logs**: Suche nach Fehlermeldungen in der Konsolenausgabe
5. **Überprüfe das `--experimental-lsp`-Flag**: Stelle sicher, dass du das Flag beim Start von Qwen Code verwendest

### Langsame Performance

1. **Große Projekte**: Erwäge, `node_modules` und andere große Verzeichnisse auszuschließen
2. **Server-Timeout**: Erhöhe `startupTimeout` in der Serverkonfiguration für langsame Server

### Keine Ergebnisse

1. **Server nicht bereit**: Der Server indiziert möglicherweise noch
2. **Datei nicht gespeichert**: Speichere deine Datei, damit der Server die Änderungen übernimmt
3. **Falsche Sprache**: Prüfe, ob der richtige Server für deine Sprache läuft

### Debugging

Aktiviere Debug-Logging, um die LSP-Kommunikation einzusehen:

```bash
DEBUG=lsp* qwen --experimental-lsp
```

Oder sieh dir den LSP-Debugging-Guide unter `packages/cli/LSP_DEBUGGING_GUIDE.md` an.

## Kompatibilität mit Claude Code

Qwen Code unterstützt `.lsp.json`-Konfigurationsdateien im Claude Code-Stil im Format mit Sprache als Schlüssel, das in der [Claude Code-Plugin-Referenz](https://code.claude.com/docs/en/plugins-reference#lsp-servers) definiert ist. Wenn du von Claude Code migrierst, verwende das Layout mit der Sprache als Schlüssel in deiner Konfiguration.

### Konfigurationsformat

Das empfohlene Format folgt der Spezifikation von Claude Code:

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

Claude Code LSP-Plugins können auch `lspServers` in `plugin.json` (oder einer referenzierten `.lsp.json`) bereitstellen. Qwen Code lädt diese Konfigurationen, wenn die Erweiterung aktiviert ist, und sie müssen dasselbe Format mit Sprache als Schlüssel verwenden.

## Best Practices

1. **Installiere Language Server global**: Das stellt sicher, dass sie in allen Projekten verfügbar sind
2. **Verwende projektspezifische Einstellungen**: Konfiguriere Serveroptionen bei Bedarf pro Projekt über `.lsp.json`
3. **Halte Server aktuell**: Aktualisiere deine Language Server regelmäßig für optimale Ergebnisse
4. **Vertraue mit Bedacht**: Vertraue nur Workspaces aus vertrauenswürdigen Quellen

## FAQ

### F: Wie aktiviere ich LSP?

Verwende das `--experimental-lsp`-Flag beim Start von Qwen Code:

```bash
qwen --experimental-lsp
```

### F: Woran erkenne ich, welche Language Server laufen?

Verwende den `/lsp status`-Befehl, um alle konfigurierten und laufenden Language Server anzuzeigen.

### F: Kann ich mehrere Language Server für denselben Dateityp verwenden?

Ja, aber für jede Operation wird nur einer verwendet. Der erste Server, der Ergebnisse liefert, gewinnt.

### F: Funktioniert LSP im Sandbox-Modus?

LSP-Server laufen außerhalb der Sandbox, um auf deinen Code zuzugreifen. Sie unterliegen den Workspace-Trust-Kontrollen.