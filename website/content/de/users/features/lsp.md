# Language Server Protocol (LSP) Unterstützung

Qwen Code bietet native Unterstützung für das Language Server Protocol (LSP), wodurch erweiterte Code-Intelligenzfunktionen wie Gehe-zu-Definition, Referenzen finden, Diagnosen und Code-Aktionen ermöglicht werden. Diese Integration erlaubt es dem KI-Agenten, Ihren Code tiefergehend zu verstehen und genauere Unterstützung zu bieten.

## Übersicht

Die LSP-Unterstützung in Qwen Code funktioniert durch die Verbindung mit Sprachservern, die Ihren Code verstehen. Wenn Sie mit TypeScript, Python, Go oder anderen unterstützten Sprachen arbeiten, kann Qwen Code automatisch den entsprechenden Sprachserver starten und diesen verwenden, um:

- Zu Symboldefinitionen zu navigieren
- Alle Referenzen eines Symbols zu finden
- Hover-Informationen abzurufen (Dokumentation, Typinformationen)
- Diagnosemeldungen anzuzeigen (Fehler, Warnungen)
- Auf Code-Aktionen zuzugreifen (Quick Fixes, Refactorings)
- Aufrufhierarchien zu analysieren

## Schnellstart

LSP ist eine experimentelle Funktion in Qwen Code. Um sie zu aktivieren, verwenden Sie das Befehlszeilenflag `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

Für die meisten gängigen Sprachen erkennt Qwen Code automatisch den entsprechenden Sprachserver und startet ihn, sofern er auf Ihrem System installiert ist.

### Voraussetzungen

Sie müssen den Language Server für Ihre Programmiersprache installiert haben:

| Sprache               | Language Server            | Installationsbefehl                                                            |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Installationsanleitung](https://rust-analyzer.github.io/manual.html#installation) |

## Konfiguration

### .lsp.json Datei

Sie können Sprachserver mithilfe einer `.lsp.json`-Datei in Ihrem Projektstamm konfigurieren. Dies verwendet das sprachbasierte Format, das in der [Claude Code Plugin LSP-Konfigurationsreferenz](https://code.claude.com/docs/en/plugins-reference#lsp-servers) beschrieben ist.

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

### Konfigurationsoptionen

#### Erforderliche Felder

| Option                | Typ    | Beschreibung                                            |
| --------------------- | ------ | ------------------------------------------------------- |
| `command`             | string | Befehl zum Starten des LSP-Servers (muss im PATH sein)  |
| `extensionToLanguage` | object | Ordnet Dateierweiterungen zu Sprachkennungen zu        |

#### Optionale Felder

| Option                  | Typ      | Standard  | Beschreibung                                           |
| ----------------------- | -------- | --------- | ------------------------------------------------------ |
| `args`                  | string[] | `[]`      | Befehlszeilenargumente                                 |
| `transport`             | string   | `"stdio"` | Transporttyp: `stdio` oder `socket`                    |
| `env`                   | object   | -         | Umgebungsvariablen                                     |
| `initializationOptions` | object   | -         | LSP-Initialisierungsoptionen                           |
| `settings`              | object   | -         | Servereinstellungen über `workspace/didChangeConfiguration` |
| `workspaceFolder`       | string   | -         | Arbeitsbereichsordner überschreiben                    |
| `startupTimeout`        | number   | `10000`   | Start-Timeout in Millisekunden                         |
| `shutdownTimeout`       | number   | `5000`    | Herunterfahr-Timeout in Millisekunden                  |
| `restartOnCrash`        | boolean  | `false`   | Automatischer Neustart nach Absturz                    |
| `maxRestarts`           | number   | `3`       | Maximale Anzahl von Neustartversuchen                  |
| `trustRequired`         | boolean  | `true`    | Vertrauenswürdigen Arbeitsbereich erforderlich         |

### TCP-/Socket-Transport

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

Qwen Code stellt LSP-Funktionalitäten über das einheitliche `lsp`-Tool bereit. Hier sind die verfügbaren Operationen:

### Code-Navigation

#### Gehe zur Definition

Findet, wo ein Symbol definiert ist.

```
Operation: goToDefinition
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
```

#### Referenzen suchen

Findet alle Referenzen zu einem Symbol.

```
Operation: findReferences
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (1-basiert)
  - character: Spaltennummer (1-basiert)
  - includeDeclaration: Die Deklaration selbst einbeziehen (optional)
```

#### Gehe zu Implementierung

Finde Implementierungen einer Schnittstelle oder abstrakten Methode.

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

#### Dokumentsymbole

Ruft alle Symbole in einem Dokument ab.

```
Operation: documentSymbol
Parameter:
  - filePath: Pfad zur Datei
```

#### Workspacesymbol-Suche

Sucht nach Symbolen über den gesamten Arbeitsbereich hinweg.

```
Operation: workspaceSymbol
Parameter:
  - query: Suchabfrage-String
  - limit: Maximale Anzahl an Ergebnissen (optional)
```

### Aufrufhierarchie

#### Aufrufhierarchie vorbereiten

Ruft das Element der Aufrufhierarchie an einer bestimmten Position ab.

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

### Diagnose

#### Dateidiagnose

Ruft Diagnosemeldungen (Fehler, Warnungen) für eine Datei ab.

```
Operation: diagnostics
Parameter:
  - filePath: Pfad zur Datei
```

#### Arbeitsbereichsdiagnose

Ruft alle Diagnosemeldungen im gesamten Arbeitsbereich ab.

```
Operation: workspaceDiagnostics
Parameter:
  - limit: Maximale Anzahl an Ergebnissen (optional)
```

### Code-Aktionen

#### Code-Aktionen abrufen

Verfügbare Code-Aktionen (Quick Fixes, Refactorings) an einer bestimmten Position abrufen.

```
Vorgang: codeActions
Parameter:
  - filePath: Pfad zur Datei
  - line: Startzeilennummer (1-basiert)
  - character: Startspaltennummer (1-basiert)
  - endLine: Endzeilennummer (optional, Standardwert ist line)
  - endCharacter: Endspalte (optional, Standardwert ist character)
  - diagnostics: Diagnoseinformationen, für die Aktionen abgerufen werden sollen (optional)
  - codeActionKinds: Nach Aktionsart filtern (optional)
```

Arten von Code-Aktionen:

- `quickfix` - Schnelle Fehlerbehebungen für Fehler/Warnungen
- `refactor` - Refactoring-Operationen
- `refactor.extract` - In Funktion/Variable extrahieren
- `refactor.inline` - Funktion/Variable einbinden
- `source` - Quellcode-Aktionen
- `source.organizeImports` - Importe organisieren
- `source.fixAll` - Alle automatisch behebbaren Probleme beheben

## Sicherheit

LSP-Server werden standardmäßig nur in vertrauenswürdigen Arbeitsbereichen gestartet. Dies liegt daran, dass Sprachserver mit Ihren Benutzerrechten ausgeführt werden und Code ausführen können.

### Vertrauenskontrollen

- **Vertrauenswürdiger Arbeitsbereich**: LSP-Server starten automatisch
- **Nicht vertrauenswürdiger Arbeitsbereich**: LSP-Server starten nicht, es sei denn, `trustRequired: false` ist in der Serverkonfiguration gesetzt

Um einen Arbeitsbereich als vertrauenswürdig zu kennzeichnen, verwenden Sie den Befehl `/trust` oder konfigurieren Sie vertrauenswürdige Ordner in den Einstellungen.

### Vertrauensüberschreibung pro Server

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

## Problembehandlung

### Server startet nicht

1. **Überprüfen Sie, ob der Server installiert ist**: Führen Sie den Befehl manuell aus, um dies zu verifizieren
2. **Überprüfen Sie den PATH**: Stellen Sie sicher, dass die Server-Binärdatei in Ihrem System-PATH vorhanden ist
3. **Überprüfen Sie das Vertrauen des Arbeitsbereichs**: Der Arbeitsbereich muss für LSP als vertrauenswürdig eingestuft sein
4. **Überprüfen Sie die Protokolle**: Suchen Sie nach Fehlermeldungen in der Konsolenausgabe
5. **Überprüfen Sie das Flag --experimental-lsp**: Stellen Sie sicher, dass Sie dieses Flag beim Start von Qwen Code verwenden

### Langsame Leistung

1. **Große Projekte**: Erwägen Sie das Ausschließen von `node_modules` und anderen großen Verzeichnissen
2. **Server-Timeout**: Erhöhen Sie `startupTimeout` in der Server-Konfiguration für langsame Server

### Keine Ergebnisse

1. **Server nicht bereit**: Der Server indiziert möglicherweise noch
2. **Datei nicht gespeichert**: Speichern Sie Ihre Datei, damit der Server die Änderungen übernehmen kann
3. **Falsche Sprache**: Überprüfen Sie, ob der richtige Server für Ihre Sprache ausgeführt wird

### Debuggen

Aktivieren Sie das Debug-Logging, um die LSP-Kommunikation zu sehen:

```bash
DEBUG=lsp* qwen --experimental-lsp
```

Oder schauen Sie sich den LSP-Debugging-Leitfaden unter `packages/cli/LSP_DEBUGGING_GUIDE.md` an.

## Claude Code-Kompatibilität

Qwen Code unterstützt `.lsp.json`-Konfigurationsdateien im Claude Code-Stil im sprachbasierten Format, das in der [Claude Code Plugins-Referenz](https://code.claude.com/docs/en/plugins-reference#lsp-servers) definiert ist. Wenn Sie von Claude Code migrieren, verwenden Sie das Sprache-als-Schlüssel-Layout in Ihrer Konfiguration.

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

Claude Code LSP-Plugins können auch `lspServers` in `plugin.json` (oder einer referenzierten `.lsp.json`) bereitstellen. Qwen Code lädt diese Konfigurationen, wenn die Erweiterung aktiviert ist, und sie müssen dasselbe sprachbasierte Format verwenden.

## Best Practices

1. **Installieren Sie Sprachserver global**: Dadurch stellen Sie sicher, dass sie in allen Projekten verfügbar sind
2. **Verwenden Sie projektspezifische Einstellungen**: Konfigurieren Sie Serveroptionen pro Projekt nach Bedarf über `.lsp.json`
3. **Halten Sie die Server auf dem neuesten Stand**: Aktualisieren Sie Ihre Sprachserver regelmäßig für optimale Ergebnisse
4. **Vertrauen Sie mit Bedacht**: Vertrauen Sie nur Arbeitsbereichen aus vertrauenswürdigen Quellen

## FAQ

### F: Wie aktiviere ich LSP?

Verwenden Sie das Flag `--experimental-lsp`, wenn Sie Qwen Code starten:

```bash
qwen --experimental-lsp
```

### F: Woher weiß ich, welche Sprachserver ausgeführt werden?

Verwenden Sie den Befehl `/lsp status`, um alle konfigurierten und laufenden Sprachserver anzuzeigen.

### F: Kann ich mehrere Sprachserver für denselben Dateityp verwenden?

Ja, aber nur einer wird für jede Operation verwendet. Der erste Server, der Ergebnisse zurückgibt, gewinnt.

### F: Funktioniert LSP im Sandbox-Modus?

Sprachserver laufen außerhalb der Sandbox, um auf Ihren Code zugreifen zu können. Sie unterliegen den Vertrauenskontrollen des Arbeitsbereichs.