# Language Server Protocol (LSP) Unterstützung

Qwen Code bietet native Unterstützung für das Language Server Protocol (LSP) und ermöglicht damit erweiterte Code-Intelligenzfunktionen wie Gehe-zu-Definition, Referenzen suchen, Diagnosen und Code-Aktionen. Diese Integration erlaubt es dem KI-Agenten, Ihren Code tiefer zu verstehen und präzisere Hilfe zu leisten.

## Übersicht

Die LSP-Unterstützung in Qwen Code funktioniert durch die Verbindung mit Sprachservern, die Ihren Code verstehen. Sobald Sie Server über `.lsp.json` (oder Erweiterungen) konfigurieren, kann Qwen Code diese starten und nutzen, um:

- Zu Symboldefinitionen zu navigieren
- Alle Referenzen eines Symbols zu finden
- Hover-Informationen (Dokumentation, Typinformationen) abzurufen
- Diagnosemeldungen (Fehler, Warnungen) anzuzeigen
- Code-Aktionen (Schnellkorrekturen, Refactorings) auszuführen
- Aufrufhierarchien zu analysieren

## Schnellstart

LSP ist eine experimentelle Funktion in Qwen Code. Um sie zu aktivieren, verwenden Sie das Befehlszeilenflag `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

LSP-Server werden über Konfiguration gesteuert. Sie müssen sie in `.lsp.json` (oder über Erweiterungen) definieren, damit Qwen Code sie starten kann.

### Voraussetzungen

Sie müssen den Sprachserver für Ihre Programmiersprache installiert haben:

| Sprache               | Sprachserver               | Installationsbefehl                                                                 |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                              |
| Python                | pylsp                       | `pip install python-lsp-server`                                                     |
| Go                    | gopls                       | `go install golang.org/x/tools/gopls@latest`                                        |
| Rust                  | rust-analyzer               | [Installationsanleitung](https://rust-analyzer.github.io/manual.html#installation)  |
| C/C++                 | clangd                      | Installieren Sie LLVM/clangd über Ihren Paketmanager                                |
| Java                  | jdtls                       | Installieren Sie JDTLS und ein JDK                                                  |

## Konfiguration

### .lsp.json-Datei

Sie können Sprachserver mithilfe einer `.lsp.json`-Datei im Stammverzeichnis Ihres Projekts konfigurieren. Jeder Schlüssel der obersten Ebene ist eine Sprachkennung, und sein Wert ist das Server-Konfigurationsobjekt.

**Grundformat:**

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

### C/C++ (clangd) Konfiguration

Abhängigkeiten:

- clangd (LLVM) muss installiert und im PATH verfügbar sein.
- Eine Kompilierungsdatenbank (`compile_commands.json`) oder `compile_flags.txt` ist für genaue Ergebnisse erforderlich.

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

### Java (jdtls) Konfiguration

Abhängigkeiten:

- JDK muss installiert und im PATH verfügbar sein (`java`).
- JDTLS muss installiert und im PATH verfügbar sein (`jdtls`).

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

| Option    | Typ    | Beschreibung                                                                                                                                |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Befehl zum Starten des LSP-Servers. Unterstützt einfache Befehlsnamen, die über `PATH` aufgelöst werden (z.B. `clangd`), und absolute Pfade (z.B. `/opt/llvm/bin/clangd`) |

#### Optionale Felder

| Option                  | Typ      | Standard  | Beschreibung                                                      |
| ----------------------- | -------- | --------- | ----------------------------------------------------------------- |
| `args`                  | string[] | `[]`      | Befehlszeilenargumente                                             |
| `transport`             | string   | `"stdio"` | Transporttyp: `stdio`, `tcp` oder `socket`                        |
| `env`                   | object   | -         | Umgebungsvariablen                                                 |
| `initializationOptions` | object   | -         | LSP-Initialisierungsoptionen                                      |
| `settings`              | object   | -         | Servereinstellungen über `workspace/didChangeConfiguration`        |
| `extensionToLanguage`   | object   | -         | Ordnet Dateierweiterungen Sprachkennungen zu                      |
| `workspaceFolder`       | string   | -         | Überschreibt den Arbeitsbereichsordner (muss innerhalb des Projektstamms liegen) |
| `startupTimeout`        | number   | `10000`   | Start-Timeout in Millisekunden                                    |
| `shutdownTimeout`       | number   | `5000`    | Herunterfahr-Timeout in Millisekunden                              |
| `restartOnCrash`        | boolean  | `false`   | Automatischer Neustart bei Absturz                                 |
| `maxRestarts`           | number   | `3`       | Maximale Anzahl von Neustartversuchen                              |
| `trustRequired`         | boolean  | `true`    | Erfordert einen vertrauenswürdigen Arbeitsbereich                  |
### TCP/Socket Transport

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

Qwen Code stellt LSP-Funktionalität über das einheitliche `lsp`-Werkzeug bereit. Hier sind die verfügbaren Operationen:

Ortsbasierte Operationen (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` und `prepareCallHierarchy`) erfordern eine genaue Position (`filePath`, `line`, `character`). Wenn Sie die genaue Position nicht kennen, verwenden Sie zuerst `workspaceSymbol` oder `documentSymbol`, um das Symbol zu lokalisieren.

### Code-Navigation

#### Gehe zu Definition

Findet, wo ein Symbol definiert ist.

```
Operation: goToDefinition
Parameters:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

#### Referenzen finden

Findet alle Referenzen zu einem Symbol.

```
Operation: findReferences
Parameters:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
  - includeDeclaration: Deklaration selbst einbeziehen (optional)
```

#### Gehe zu Implementierung

Findet Implementierungen eines Interfaces oder einer abstrakten Methode.

```
Operation: goToImplementation
Parameters:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

### Symbol-Informationen

#### Hover

Ruft Dokumentation und Typinformationen für ein Symbol ab.

```
Operation: hover
Parameters:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

#### Dokument-Symbole

Ruft alle Symbole in einem Dokument ab.

```
Operation: documentSymbol
Parameters:
  - filePath: Pfad zur Datei
```

#### Workspace-Symbol-Suche

Durchsucht den gesamten Workspace nach Symbolen.

```
Operation: workspaceSymbol
Parameters:
  - query: Suchbegriff
  - limit: Maximale Ergebnisse (optional)
```

### Aufrufhierarchie

#### Aufrufhierarchie vorbereiten

Ruft das Aufrufhierarchieelement an einer Position ab.

```
Operation: prepareCallHierarchy
Parameters:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

#### Eingehende Aufrufe

Findet alle Funktionen, die die gegebene Funktion aufrufen.

```
Operation: incomingCalls
Parameters:
  - callHierarchyItem: Element von prepareCallHierarchy
```

#### Ausgehende Aufrufe

Findet alle Funktionen, die von der gegebenen Funktion aufgerufen werden.

```
Operation: outgoingCalls
Parameters:
  - callHierarchyItem: Element von prepareCallHierarchy
```

### Diagnose

#### Datei-Diagnose

Ruft Diagnosemeldungen (Fehler, Warnungen) für eine Datei ab.

```
Operation: diagnostics
Parameters:
  - filePath: Pfad zur Datei
```

#### Workspace-Diagnose

Ruft alle Diagnosemeldungen im gesamten Workspace ab.

```
Operation: workspaceDiagnostics
Parameters:
  - limit: Maximale Ergebnisse (optional)
```

### Code-Aktionen

#### Code-Aktionen abrufen

Ruft verfügbare Code-Aktionen (Schnellkorrekturen, Refactorings) an einer Position ab.

```
Operation: codeActions
Parameters:
  - filePath: Pfad zur Datei
  - line: Startzeilennummer (1-basiert)
  - character: Startspaltennummer (1-basiert)
  - endLine: Endzeilennummer (optional, standardmäßig line)
  - endCharacter: Endspaltennummer (optional, standardmäßig character)
  - diagnostics: Diagnose, für die Aktionen abgerufen werden sollen (optional)
  - codeActionKinds: Nach Aktionsart filtern (optional)
```

Arten von Code-Aktionen:

- `quickfix` – Schnellkorrekturen für Fehler/Warnungen
- `refactor` – Refactoring-Operationen
- `refactor.extract` – In Funktion/Variable extrahieren
- `refactor.inline` – Funktion/Variable inline setzen
- `source` – Quellcode-Aktionen
- `source.organizeImports` – Importe organisieren
- `source.fixAll` – Alle automatisch behebbaren Probleme beheben

## Sicherheit

LSP-Server werden standardmäßig nur in vertrauenswürdigen Workspaces gestartet. Grund dafür ist, dass Sprachserver mit Ihren Benutzerberechtigungen laufen und Code ausführen können.

### Vertrauenssteuerung

- **Vertrauenswürdiger Workspace**: LSP-Server starten, wenn konfiguriert
- **Nicht vertrauenswürdiger Workspace**: LSP-Server starten nicht, es sei denn, `trustRequired: false` ist in der Serverkonfiguration gesetzt

Um einen Workspace als vertrauenswürdig zu markieren, verwenden Sie den Befehl `/trust`.

### Serverspezifische Vertrauensüberschreibung

Sie können Vertrauensanforderungen für bestimmte Server in deren Konfiguration überschreiben:

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

1. **Überprüfen Sie das `--experimental-lsp`-Flag**: Stellen Sie sicher, dass Sie das Flag beim Start von Qwen Code verwenden
2. **Prüfen Sie, ob der Server installiert ist**: Führen Sie den Befehl manuell aus (z. B. `clangd --version`), um dies zu überprüfen
3. **Überprüfen Sie den Befehl**: Die Server-Binärdatei muss sich in Ihrem System-`PATH` befinden oder als absoluter Pfad angegeben sein (z. B. `/opt/llvm/bin/clangd`). Relative Pfade, die den Workspace verlassen, werden blockiert
4. **Überprüfen Sie die Workspace-Vertrauensstellung**: Der Workspace muss für LSP vertrauenswürdig sein (verwenden Sie `/trust`)
5. **Überprüfen Sie die Logs**: Starten Sie Qwen Code mit `--debug` und suchen Sie dann nach LSP-bezogenen Einträgen im Debug-Log (siehe Abschnitt Debugging unten)
6. **Überprüfen Sie den Prozess**: Führen Sie `ps aux | grep <server-name>` aus, um zu prüfen, ob der Serverprozess läuft
### Langsame Performance

1. **Große Projekte**: Erwägen Sie, `node_modules` und andere große Verzeichnisse auszuschließen
2. **Server-Timeout**: Erhöhen Sie `startupTimeout` in der Serverkonfiguration für langsame Server

### Keine Ergebnisse

1. **Server nicht bereit**: Der Server indiziert möglicherweise noch. Stellen Sie bei C/C++-Projekten mit clangd sicher, dass `--background-index` in den Argumenten enthalten ist und eine `compile_commands.json` (oder `compile_flags.txt`) im Projektstammverzeichnis oder einem übergeordneten Verzeichnis vorhanden ist. Verwenden Sie `--compile-commands-dir=<path>`, wenn es sich in einem Build-Unterverzeichnis befindet
2. **Datei nicht gespeichert**: Speichern Sie Ihre Datei, damit der Server Änderungen übernehmen kann
3. **Falsche Sprache**: Überprüfen Sie, ob der richtige Server für Ihre Sprache läuft
4. **Prozess überprüfen**: Führen Sie `ps aux | grep <server-name>` aus, um zu überprüfen, ob der Server tatsächlich läuft

### Debugging

LSP hat kein separates Debug-Flag. Verwenden Sie den normalen Debug-Modus von Qwen Code zusammen mit dem LSP-Feature-Flag:

```bash
qwen --experimental-lsp --debug
```

Debug-Logs werden in das Sitzungs-Debug-Log-Verzeichnis geschrieben. So überprüfen Sie LSP-bezogene Einträge:

```bash
# Default runtime directory
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# Or, without ripgrep:
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# If QWEN_RUNTIME_DIR is configured
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

Nützliche Einträge sind:

- `[LSP] ...`: Logs, die vom nativen LSP-Dienst und Server-Manager ausgegeben werden.
- `[CONFIG] Native LSP status after discovery: ...`: LSP-Serverkonfiguration, die für die Sitzung erkannt wurde.
- `[CONFIG] Native LSP status after startup: ...`: Server-Start-Ergebnis, einschließlich Bereit-/Fehlgeschlagen-Zählungen.
- `[STATUS] LSP status snapshot for /status: ...`: Status-Snapshot, der bei Ausführung von `/status` im Debug-Modus ausgegeben wird.

Sie können auch `/status` in der CLI ausführen, um eine kurze LSP-Zusammenfassung zu sehen:

```text
LSP: disabled
LSP: enabled, 1/1 ready
LSP: enabled, 0/1 ready (1 failed)
LSP: enabled, no servers configured
LSP: enabled, status unavailable
```

Für Details pro Server führen Sie `/lsp` aus:

```text
**LSP Server Status**

| Server | Befehl | Sprachen | Status |
|--------|--------|----------|--------|
| clangd | `clangd` | c, cpp | BEREIT |
| pyright | `pyright-langserver` | python | FEHLGESCHLAGEN - Start fehlgeschlagen |
```

Häufige Fehlermeldungen, auf die Sie achten sollten:

```text
command path is unsafe        -> relative path escapes workspace, use absolute path or add to PATH
command not found             -> server binary not installed or not in PATH
requires trusted workspace    -> run /trust first
LSP connection closed         -> server started but exited or closed stdio before replying to initialize
```

Bei Fehlern beim Start von clangd überprüfen Sie den Server direkt aus dem Projektstammverzeichnis:

```bash
clangd --version
clangd --check=/path/to/file.cpp --log=verbose
```

C/C++-Projekte sollten normalerweise eine `compile_commands.json` oder `compile_flags.txt` bereitstellen. Wenn sich die Compile-Datenbank in einem Build-Verzeichnis befindet, übergeben Sie sie an clangd:

```json
{
  "cpp": {
    "command": "clangd",
    "args": ["--background-index", "--compile-commands-dir=build"]
  }
}
```

```bash
ps aux | grep clangd   # or typescript-language-server, jdtls, etc.
```

## LSP-Konfiguration für Erweiterungen

Erweiterungen können LSP-Serverkonfigurationen über das Feld `lspServers` in ihrer `plugin.json` bereitstellen. Dies kann entweder ein Inline-Objekt oder ein Pfad zu einer `.lsp.json`-Datei sein. Qwen Code lädt diese Konfigurationen, wenn die Erweiterung aktiviert ist. Das Format ist dasselbe sprachbezogene Layout, das in Projekt-`.lsp.json`-Dateien verwendet wird.

## Bewährte Methoden

1. **Sprachserver global installieren**: Dadurch wird sichergestellt, dass sie in allen Projekten verfügbar sind
2. **Projektspezifische Einstellungen verwenden**: Konfigurieren Sie Serveroptionen bei Bedarf pro Projekt über `.lsp.json`
3. **Server aktualisieren**: Aktualisieren Sie Ihre Sprachserver regelmäßig für beste Ergebnisse
4. **Vertrauen mit Bedacht**: Vertrauen Sie nur Arbeitsbereichen von vertrauenswürdigen Quellen

## FAQ

### F: Wie aktiviere ich LSP?

Verwenden Sie das Flag `--experimental-lsp` beim Starten von Qwen Code:

```bash
qwen --experimental-lsp
```

### F: Wie erkenne ich, welche Sprachserver laufen?

Starten Sie Qwen Code mit aktiviertem LSP- und Debug-Modus:

```bash
qwen --experimental-lsp --debug
```

Führen Sie dann `/status` für eine kurze Zusammenfassung, `/lsp` für den Status pro Server aus oder überprüfen Sie das Debug-Log:

```bash
# Default runtime directory
rg "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest
# Or:
grep -E "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest

# If QWEN_RUNTIME_DIR is configured
rg "LSP|Native LSP|<server-name>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP verwendet den normalen `--debug`-Modus von Qwen Code; es gibt kein separates LSP-Debug-Flag.

### F: Kann ich mehrere Sprachserver für denselben Dateityp verwenden?

Ja, aber für jede Operation wird nur einer verwendet. Der erste Server, der Ergebnisse liefert, gewinnt.

### F: Funktioniert LSP im Sandbox-Modus?

LSP-Server laufen außerhalb der Sandbox, um auf Ihren Code zuzugreifen. Sie unterliegen den Arbeitsbereichsvertrauenssteuerungen.
