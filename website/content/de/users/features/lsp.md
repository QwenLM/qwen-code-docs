# Language Server Protocol (LSP)-Unterstützung

Qwen Code bietet native Language Server Protocol (LSP)-Unterstützung und ermöglicht damit erweiterte Code-Intelligenz-Funktionen wie Gehe-zu-Definition, Referenzen suchen, Diagnosen und Code-Aktionen. Diese Integration erlaubt es dem KI-Agenten, Ihren Code tiefergehend zu verstehen und präzisere Hilfe zu leisten.

## Überblick

Die LSP-Unterstützung in Qwen Code funktioniert, indem sie sich mit Language Servern verbindet, die Ihren Code verstehen. Sobald Sie Server über `.lsp.json` (oder Erweiterungen) konfigurieren, kann Qwen Code diese starten und nutzen, um:

- Zu Symboldefinitionen navigieren
- Alle Referenzen zu einem Symbol finden
- Hover-Informationen abrufen (Dokumentation, Typinformationen)
- Diagnosemeldungen anzeigen (Fehler, Warnungen)
- Code-Aktionen ausführen (Schnellkorrekturen, Refactorings)
- Aufrufhierarchien analysieren

## Schnellstart

LSP ist eine experimentelle Funktion in Qwen Code. Um sie zu aktivieren, verwenden Sie das Flag `--experimental-lsp` in der Befehlszeile:

```bash
qwen --experimental-lsp
```

LSP-Server werden über Konfigurationen gesteuert. Sie müssen sie in `.lsp.json` (oder über Erweiterungen) definieren, damit Qwen Code sie startet.

### Voraussetzungen

Sie müssen den Language Server für Ihre Programmiersprache installiert haben:

| Sprache             | Language Server            | Installationsbefehl                                                            |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Installationsanleitung](https://rust-analyzer.github.io/manual.html#installation) |
| C/C++                 | clangd                     | Installieren Sie LLVM/clangd über Ihren Paketmanager                            |
| Java                  | jdtls                      | Installieren Sie JDTLS und ein JDK                                             |

## Konfiguration

### .lsp.json-Datei

Sie können Language Server mithilfe einer `.lsp.json`-Datei im Stammverzeichnis Ihres Projekts konfigurieren. Jeder Schlüssel der obersten Ebene ist ein Sprachbezeichner, und sein Wert ist das Server-Konfigurationsobjekt.

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

### C/C++ (clangd)-Konfiguration

Abhängigkeiten:

- clangd (LLVM) muss installiert und im PATH verfügbar sein.
- Eine Compile-Datenbank (`compile_commands.json`) oder `compile_flags.txt` wird für genaue Ergebnisse benötigt.

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

### Java (jdtls)-Konfiguration

Abhängigkeiten:

- JDK installiert und im PATH verfügbar (`java`).
- JDTLS installiert und im PATH verfügbar (`jdtls`).

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

| Option    | Typ    | Beschreibung                                                                                                                             |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `command` | string | Befehl zum Starten des LSP-Servers. Unterstützt einfache Befehlsnamen, die über `PATH` aufgelöst werden (z. B. `clangd`) sowie absolute Pfade (z. B. `/opt/llvm/bin/clangd`) |

#### Optionale Felder

| Option                  | Typ      | Standard   | Beschreibung                                                               |
| ----------------------- | -------- | ---------- | -------------------------------------------------------------------------- |
| `args`                  | string[] | `[]`       | Befehlszeilenargumente                                                     |
| `transport`             | string   | `"stdio"`  | Transporttyp: `stdio`, `tcp` oder `socket`                                 |
| `env`                   | object   | –          | Umgebungsvariablen                                                         |
| `initializationOptions` | object   | –          | LSP-Initialisierungsoptionen                                               |
| `settings`              | object   | –          | Servereinstellungen über `workspace/didChangeConfiguration`                |
| `extensionToLanguage`   | object   | –          | Ordnet Dateierweiterungen Sprachbezeichnern zu                            |
| `workspaceFolder`       | string   | –          | Überschreibt den Arbeitsbereichsordner (muss innerhalb des Projektstammverzeichnisses liegen) |
| `startupTimeout`        | number   | `10000`    | Zeitlimit für den Start in Millisekunden                                   |
| `shutdownTimeout`       | number   | `5000`     | Zeitlimit für das Herunterfahren in Millisekunden                          |
| `restartOnCrash`        | boolean  | `false`    | Automatischer Neustart bei Absturz                                         |
| `maxRestarts`           | number   | `3`        | Maximale Anzahl von Neustartversuchen                                      |
| `trustRequired`         | boolean  | `true`     | Vertrauenswürdiger Arbeitsbereich erforderlich                             |

### TCP/Socket-Transport

Für Server, die TCP oder Unix-Socket-Transport verwenden:

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

Qwen Code stellt die LSP-Funktionalität über das einheitliche `lsp`-Werkzeug zur Verfügung. Hier sind die verfügbaren Operationen:

Ortsbasierte Operationen (`goToDefinition`, `findReferences`, `hover`, `goToImplementation` und `prepareCallHierarchy`) erfordern eine exakte Position (`filePath` + `line` + `character`). Wenn Sie die genaue Position nicht kennen, verwenden Sie zuerst `workspaceSymbol` oder `documentSymbol`, um das Symbol zu lokalisieren.

### Code-Navigation

#### Gehe zu Definition

Findet, wo ein Symbol definiert ist.

```
Operation: goToDefinition
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

#### Referenzen suchen

Findet alle Referenzen auf ein Symbol.

```
Operation: findReferences
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
  - includeDeclaration: Die Deklaration selbst einschließen (optional)
```

#### Gehe zu Implementierung

Findet Implementierungen eines Interfaces oder einer abstrakten Methode.

```
Operation: goToImplementation
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

### Symbolinformationen

#### Hover

Ruft Dokumentation und Typinformationen für ein Symbol ab.

```
Operation: hover
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

#### Dokument-Symbole

Ruft alle Symbole in einem Dokument ab.

```
Operation: documentSymbol
Parameter:
  - filePath: Pfad zur Datei
```

#### Arbeitsbereich-Symbolsuche

Durchsucht Symbole im gesamten Arbeitsbereich.

```
Operation: workspaceSymbol
Parameter:
  - query: Suchzeichenfolge
  - limit: Maximale Anzahl von Ergebnissen (optional)
```

### Aufrufhierarchie

#### Aufrufhierarchie vorbereiten

Ruft das Aufrufhierarchie-Element an einer Position ab.

```
Operation: prepareCallHierarchy
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

#### Eingehende Aufrufe

Findet alle Funktionen, die die angegebene Funktion aufrufen.

```
Operation: incomingCalls
Parameter:
  - callHierarchyItem: Element von prepareCallHierarchy
```

#### Ausgehende Aufrufe

Findet alle Funktionen, die von der angegebenen Funktion aufgerufen werden.

```
Operation: outgoingCalls
Parameter:
  - callHierarchyItem: Element von prepareCallHierarchy
```

### Diagnosen

#### Datei-Diagnosen

Ruft Diagnosemeldungen (Fehler, Warnungen) für eine Datei ab.

```
Operation: diagnostics
Parameter:
  - filePath: Pfad zur Datei
```

#### Arbeitsbereich-Diagnosen

Ruft alle Diagnosemeldungen im gesamten Arbeitsbereich ab.

```
Operation: workspaceDiagnostics
Parameter:
  - limit: Maximale Anzahl von Ergebnissen (optional)
```

### Code-Aktionen

#### Code-Aktionen abrufen

Ruft verfügbare Code-Aktionen (Schnellkorrekturen, Refactorings) an einer Position ab.

```
Operation: codeActions
Parameter:
  - filePath: Pfad zur Datei
  - line: Startzeilennummer (1-basiert)
  - character: Startspaltennummer (1-basiert)
  - endLine: Endzeilennummer (optional, standardmäßig line)
  - endCharacter: Endspalte (optional, standardmäßig character)
  - diagnostics: Diagnosen, für die Aktionen abgerufen werden sollen (optional)
  - codeActionKinds: Filter nach Aktionsart (optional)
```

Arten von Code-Aktionen:

- `quickfix` – Schnellkorrekturen für Fehler/Warnungen
- `refactor` – Refactoring-Operationen
- `refactor.extract` – In Funktion/Variable extrahieren
- `refactor.inline` – Funktion/Variable inline setzen
- `source` – Quellcode-Aktionen
- `source.organizeImports` – Importe organisieren
- `source.fixAll` – Alle automatisch korrigierbaren Probleme beheben

## Sicherheit

LSP-Server werden standardmäßig nur in vertrauenswürdigen Arbeitsbereichen gestartet. Dies liegt daran, dass Language Server mit Ihren Benutzerberechtigungen laufen und Code ausführen können.

### Vertrauenskontrollen

- **Vertrauenswürdiger Arbeitsbereich**: LSP-Server starten, wenn konfiguriert
- **Nicht vertrauenswürdiger Arbeitsbereich**: LSP-Server starten nicht, es sei denn, in der Serverkonfiguration ist `trustRequired: false` gesetzt

Um einen Arbeitsbereich als vertrauenswürdig zu markieren, verwenden Sie den Befehl `/trust`.

### Serverspezifische Vertrauensüberschreibung

Sie können die Vertrauensanforderungen für bestimmte Server in deren Konfiguration überschreiben:

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

1. **Überprüfen Sie das Flag `--experimental-lsp`**: Stellen Sie sicher, dass Sie das Flag beim Start von Qwen Code verwenden
2. **Prüfen Sie, ob der Server installiert ist**: Führen Sie den Befehl manuell aus (z. B. `clangd --version`), um dies zu überprüfen
3. **Überprüfen Sie den Befehl**: Die Server-Binärdatei muss sich in Ihrem System-`PATH` befinden oder als absoluter Pfad angegeben sein (z. B. `/opt/llvm/bin/clangd`). Relative Pfade, die den Arbeitsbereich verlassen, werden blockiert
4. **Arbeitsbereich-Vertrauen prüfen**: Der Arbeitsbereich muss für LSP vertrauenswürdig sein (verwenden Sie `/trust`)
5. **Protokolle prüfen**: Starten Sie Qwen Code mit `--debug` und suchen Sie dann nach LSP-bezogenen Einträgen im Debug-Protokoll (siehe Abschnitt Debuggen unten)
6. **Prozess prüfen**: Führen Sie `ps aux | grep <server-name>` aus, um zu überprüfen, ob der Serverprozess läuft

### Langsame Leistung

1. **Große Projekte**: Erwägen Sie, `node_modules` und andere große Verzeichnisse auszuschließen
2. **Server-Timeout**: Erhöhen Sie `startupTimeout` in der Serverkonfiguration für langsame Server

### Keine Ergebnisse

1. **Server nicht bereit**: Der Server indiziert möglicherweise noch. Stellen Sie bei C/C++-Projekten mit clangd sicher, dass `--background-index` in den Argumenten enthalten ist und dass eine `compile_commands.json` (oder `compile_flags.txt`) im Projektstammverzeichnis oder einem übergeordneten Verzeichnis existiert. Verwenden Sie `--compile-commands-dir=<Pfad>`, wenn sie sich in einem Build-Unterverzeichnis befindet
2. **Datei nicht gespeichert**: Speichern Sie Ihre Datei, damit der Server Änderungen übernimmt
3. **Falsche Sprache**: Prüfen Sie, ob der richtige Server für Ihre Sprache läuft
4. **Prozess prüfen**: Führen Sie `ps aux | grep <server-name>` aus, um zu überprüfen, ob der Server tatsächlich läuft

### Debuggen

LSP hat kein separates Debug-Flag. Verwenden Sie den normalen Debug-Modus von Qwen Code zusammen mit dem LSP-Feature-Flag:

```bash
qwen --experimental-lsp --debug
```

Debug-Protokolle werden in das Sitzungs-Debug-Protokollverzeichnis geschrieben. Um LSP-bezogene Einträge zu überprüfen:

```bash
# Standard-Runtime-Verzeichnis
rg "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest
# Oder ohne ripgrep:
grep -E "LSP|Native LSP|clangd|connection closed" ~/.qwen/debug/latest

# Wenn QWEN_RUNTIME_DIR konfiguriert ist
rg "LSP|Native LSP|clangd|connection closed" "$QWEN_RUNTIME_DIR/debug/latest"
```

Nützliche Einträge umfassen:

- `[LSP] ...`: Vom nativen LSP-Dienst und Server-Manager ausgegebene Protokolle.
- `[CONFIG] Native LSP status after discovery: ...`: LSP-Serverkonfiguration, die für die Sitzung ermittelt wurde.
- `[CONFIG] Native LSP status after startup: ...`: Server-Start-Ergebnis, einschließlich bereiter/fehlgeschlagener Zählungen.
- `[STATUS] LSP status snapshot for /status: ...`: Status-Snapshot, der bei der Ausführung von `/status` im Debug-Modus ausgegeben wird.

Sie können auch `/status` in der CLI ausführen, um eine kurze LSP-Zusammenfassung zu erhalten:

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

| Server | Command | Languages | Status |
|--------|---------|-----------|--------|
| clangd | `clangd` | c, cpp | READY |
| pyright | `pyright-langserver` | python | FAILED - startup failed |
```

Häufige Fehlermeldungen, nach denen Sie suchen sollten:

```text
command path is unsafe        -> relativer Pfad verlässt Arbeitsbereich, verwenden Sie absoluten Pfad oder fügen Sie ihn zu PATH hinzu
command not found             -> Server-Binärdatei nicht installiert oder nicht im PATH
requires trusted workspace    -> führen Sie zuerst /trust aus
LSP connection closed         -> Server gestartet, aber beendet oder stdio geschlossen, bevor er auf initialize antwortete
```

Bei fehlgeschlagenen clangd-Starts überprüfen Sie den Server direkt aus dem Projektstammverzeichnis:

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
ps aux | grep clangd   # oder typescript-language-server, jdtls, etc.
```

## LSP-Konfiguration durch Erweiterungen

Erweiterungen können LSP-Serverkonfigurationen über das Feld `lspServers` in ihrer `plugin.json` bereitstellen. Dies kann entweder ein Inline-Objekt oder ein Pfad zu einer `.lsp.json`-Datei sein. Qwen Code lädt diese Konfigurationen, wenn die Erweiterung aktiviert ist. Das Format ist dasselbe sprachbasierte Layout, das auch in Projekt-`.lsp.json`-Dateien verwendet wird.

## Bewährte Vorgehensweisen

1. **Language Server global installieren**: So sind sie in allen Projekten verfügbar
2. **Projektspezifische Einstellungen verwenden**: Konfigurieren Sie Serveroptionen pro Projekt bei Bedarf über `.lsp.json`
3. **Server aktuell halten**: Aktualisieren Sie Ihre Language Server regelmäßig für optimale Ergebnisse
4. **Vertrauen mit Bedacht schenken**: Vertrauen Sie nur Arbeitsbereichen aus vertrauenswürdigen Quellen

## FAQ

### F: Wie aktiviere ich LSP?

Verwenden Sie das Flag `--experimental-lsp` beim Start von Qwen Code:

```bash
qwen --experimental-lsp
```

### F: Wie erfahre ich, welche Language Server laufen?

Starten Sie Qwen Code mit aktiviertem LSP- und Debug-Modus:

```bash
qwen --experimental-lsp --debug
```

Führen Sie dann `/status` für eine kurze Zusammenfassung aus, `/lsp` für den Status pro Server, oder überprüfen Sie das Debug-Protokoll:

```bash
# Standard-Runtime-Verzeichnis
rg "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest
# Oder:
grep -E "LSP|Native LSP|<server-name>" ~/.qwen/debug/latest

# Wenn QWEN_RUNTIME_DIR konfiguriert ist
rg "LSP|Native LSP|<server-name>" "$QWEN_RUNTIME_DIR/debug/latest"
```

LSP verwendet den normalen `--debug`-Modus von Qwen Code; es gibt kein separates LSP-Debug-Flag.

### F: Kann ich mehrere Language Server für denselben Dateityp verwenden?

Ja, aber nur einer wird für jede Operation verwendet. Der erste Server, der Ergebnisse liefert, gewinnt.

### F: Funktioniert LSP im Sandbox-Modus?

LSP-Server laufen außerhalb der Sandbox, um auf Ihren Code zuzugreifen. Sie unterliegen den Vertrauenskontrollen des Arbeitsbereichs.