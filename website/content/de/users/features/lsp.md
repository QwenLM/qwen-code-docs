# Sprachserver-Protokoll (LSP)-Unterstützung

Qwen Code bietet native Unterstützung für das Sprachserver-Protokoll (LSP), wodurch erweiterte Code-Intelligenzfunktionen wie „Gehe zu Definition“, „Finde alle Verweise“, Diagnosemeldungen und Code-Aktionen aktiviert werden. Diese Integration ermöglicht es dem KI-Agenten, Ihren Code tiefer zu verstehen und präzisere Unterstützung zu leisten.

## Übersicht

Die LSP-Unterstützung in Qwen Code funktioniert durch die Verbindung mit Sprachservern, die Ihren Code verstehen. Wenn Sie mit TypeScript, Python, Go oder anderen unterstützten Sprachen arbeiten, kann Qwen Code automatisch den entsprechenden Sprachserver starten und ihn nutzen, um:

- Zu Symboldefinitionen zu navigieren  
- Alle Verweise auf ein Symbol zu finden  
- Informationen beim Hover abzurufen (Dokumentation, Typinformationen)  
- Diagnosemeldungen anzuzeigen (Fehler, Warnungen)  
- Auf Code-Aktionen zuzugreifen (schnelle Korrekturen, Refactorings)  
- Aufrufhierarchien zu analysieren

## Schnellstart

LSP ist eine experimentelle Funktion in Qwen Code. Um sie zu aktivieren, verwenden Sie die Befehlszeilenoption `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

Für die gängigsten Sprachen erkennt Qwen Code automatisch den passenden Sprachserver und startet ihn, sofern dieser auf Ihrem System installiert ist.

### Voraussetzungen

Sie müssen den Language Server für Ihre Programmiersprache installiert haben:

| Sprache               | Language Server            | Installationsbefehl                                                            |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| TypeScript/JavaScript | typescript-language-server | `npm install -g typescript-language-server typescript`                         |
| Python                | pylsp                      | `pip install python-lsp-server`                                                |
| Go                    | gopls                      | `go install golang.org/x/tools/gopls@latest`                                   |
| Rust                  | rust-analyzer              | [Installationsanleitung](https://rust-analyzer.github.io/manual.html#installation) |

## Konfiguration

### .lsp.json-Datei

Sie können Sprachserver mithilfe einer `.lsp.json`-Datei im Stammverzeichnis Ihres Projekts konfigurieren. Dabei wird das sprachschlüsselbasierte Format verwendet, das in der [Claude Code-Plugin-LSP-Konfigurationsreferenz](https://code.claude.com/docs/en/plugins-reference#lsp-servers) beschrieben ist.

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

| Option                | Typ    | Beschreibung                                             |
| --------------------- | ------ | -------------------------------------------------------- |
| `command`             | Zeichenkette | Befehl zum Starten des LSP-Servers (muss im `PATH` sein) |
| `extensionToLanguage` | Objekt | Ordnet Dateierweiterungen Sprachbezeichnern zu          |

#### Optionale Felder

| Option                  | Typ      | Standardwert | Beschreibung                                            |
| ----------------------- | -------- | ------------ | ------------------------------------------------------- |
| `args`                  | string[] | `[]`         | Befehlszeilenargumente                                  |
| `transport`             | string   | `"stdio"`    | Transportart: `stdio` oder `socket`                   |
| `env`                   | object   | –            | Umgebungsvariablen                                      |
| `initializationOptions` | object   | –            | LSP-Initialisierungsoptionen                            |
| `settings`              | object   | –            | Servereinstellungen über `workspace/didChangeConfiguration` |
| `workspaceFolder`       | string   | –            | Überschreibt den Arbeitsbereichsordner                  |
| `startupTimeout`        | number   | `10000`      | Startzeitüberschreitung in Millisekunden                |
| `shutdownTimeout`       | number   | `5000`       | Herunterfahren-Zeitüberschreitung in Millisekunden      |
| `restartOnCrash`        | boolean  | `false`      | Automatischer Neustart bei Absturz                      |
| `maxRestarts`           | number   | `3`          | Maximale Anzahl von Neustartversuchen                   |
| `trustRequired`         | boolean  | `true`       | Erfordert einen vertrauenswürdigen Arbeitsbereich       |

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

Qwen Code stellt die LSP-Funktionalität über das einheitliche Tool `lsp` bereit. Folgende Operationen stehen zur Verfügung:

### Code-Navigation

#### Zur Definition springen

Sucht die Stelle, an der ein Symbol definiert ist.

```
Operation: goToDefinition
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (basierend auf 1)
  - character: Spaltennummer (basierend auf 1)
```

#### Referenzen suchen

Sucht alle Referenzen zu einem Symbol.

```
Operation: findReferences
Parameter:
  - filePath: Pfad zur Datei
  - line: Zeilennummer (basierend auf 1)
  - character: Spaltennummer (basierend auf 1)
  - includeDeclaration: Die Deklaration selbst einschließen (optional)
```

#### Zur Implementierung gehen

Sucht Implementierungen einer Schnittstelle oder einer abstrakten Methode.

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

#### Arbeitsbereichssymbol-Suche

Durchsucht den gesamten Arbeitsbereich nach Symbolen.

```
Operation: workspaceSymbol
Parameter:
  - query: Suchbegriff
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

Sucht alle Funktionen, die die angegebene Funktion aufrufen.

```
Operation: incomingCalls
Parameter:
  - callHierarchyItem: Element aus prepareCallHierarchy
```

#### Ausgehende Aufrufe

Sucht alle Funktionen, die von der angegebenen Funktion aufgerufen werden.

```
Operation: outgoingCalls
Parameter:
  - callHierarchyItem: Element aus prepareCallHierarchy
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
  - limit: Maximale Anzahl der Ergebnisse (optional)
```

### Code-Aktionen

#### Code-Aktionen abrufen

Ruft verfügbare Code-Aktionen (schnelle Korrekturen, Refactorings) an einer bestimmten Position ab.

```
Operation: codeActions
Parameter:
  - filePath: Pfad zur Datei
  - line: Startzeilennummer (1-basiert)
  - character: Startspaltennummer (1-basiert)
  - endLine: Endzeilennummer (optional, Standardwert ist `line`)
  - endCharacter: Endspalte (optional, Standardwert ist `character`)
  - diagnostics: Diagnosen, für die Aktionen abgerufen werden sollen (optional)
  - codeActionKinds: Filter nach Aktionstyp (optional)
```

Code-Aktionstypen:

- `quickfix` – Schnelle Korrekturen für Fehler/Warnings  
- `refactor` – Refactoring-Operationen  
- `refactor.extract` – Extrahieren in Funktion/Variable  
- `refactor.inline` – Inline-Funktion/Variable  
- `source` – Quellcode-Aktionen  
- `source.organizeImports` – Importe organisieren  
- `source.fixAll` – Alle automatisch behebbaren Probleme beheben  

## Sicherheit  

LSP-Server werden standardmäßig nur in vertrauenswürdigen Arbeitsbereichen gestartet. Grund hierfür ist, dass Sprachserver mit Ihren Benutzerrechten ausgeführt werden und beliebigen Code ausführen können.

### Vertrauenssteuerung

- **Vertrauenswürdiger Arbeitsbereich**: LSP-Server werden automatisch gestartet.  
- **Nicht vertrauenswürdiger Arbeitsbereich**: LSP-Server werden nicht gestartet, es sei denn, in der Serverkonfiguration ist `trustRequired: false` festgelegt.

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

### Server wird nicht gestartet

1. **Überprüfen Sie, ob der Server installiert ist**: Führen Sie den Befehl manuell aus, um dies zu verifizieren  
2. **Überprüfen Sie den PATH**: Stellen Sie sicher, dass die Server-Binärdatei in Ihrem System-PATH enthalten ist  
3. **Überprüfen Sie das Workspace-Vertrauen**: Der Workspace muss für die LSP-Funktion als vertrauenswürdig eingestuft sein  
4. **Überprüfen Sie die Logs**: Suchen Sie nach Fehlermeldungen in der Konsolenausgabe  
5. **Überprüfen Sie das Flag `--experimental-lsp`**: Stellen Sie sicher, dass Sie dieses Flag beim Starten von Qwen Code verwenden  

### Langsame Leistung

1. **Große Projekte**: Erwägen Sie, `node_modules` und andere große Verzeichnisse auszuschließen  
2. **Server-Timeout**: Erhöhen Sie `startupTimeout` in der Server-Konfiguration für langsame Server  

### Keine Ergebnisse

1. **Server noch nicht bereit**: Der Server befindet sich möglicherweise noch im Indexierungsprozess  
2. **Datei nicht gespeichert**: Speichern Sie Ihre Datei, damit der Server die Änderungen erkennt  
3. **Falsche Sprache**: Prüfen Sie, ob der richtige Server für Ihre Programmiersprache ausgeführt wird

### Debugging

Aktivieren Sie die Debug-Protokollierung, um die LSP-Kommunikation anzuzeigen:

```bash
DEBUG=lsp* qwen --experimental-lsp
```

Alternativ lesen Sie die LSP-Debugging-Anleitung unter `packages/cli/LSP_DEBUGGING_GUIDE.md`.

## Kompatibilität mit Claude Code

Qwen Code unterstützt Konfigurationsdateien im Claude-Code-Stil mit der Dateierweiterung `.lsp.json` im sprachschlüsselbasierten Format, das in der [Claude-Code-Plugin-Referenz](https://code.claude.com/docs/en/plugins-reference#lsp-servers) definiert ist. Wenn Sie von Claude Code migrieren, verwenden Sie das Layout mit der Sprache als Schlüssel in Ihrer Konfiguration.

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

Claude-Code-LSP-Plugins können außerdem `lspServers` in `plugin.json` (oder einer referenzierten `.lsp.json`-Datei) bereitstellen. Qwen Code lädt diese Konfigurationen beim Aktivieren der Erweiterung und erfordert, dass sie ebenfalls das sprachschlüsselbasierte Format verwenden.

## Best Practices

1. **Sprachserver global installieren**: Dadurch stehen sie in allen Projekten zur Verfügung.
2. **Projektspezifische Einstellungen verwenden**: Konfigurieren Sie Serveroptionen bei Bedarf pro Projekt über `.lsp.json`.
3. **Server aktuell halten**: Aktualisieren Sie Ihre Sprachserver regelmäßig, um optimale Ergebnisse zu erzielen.
4. **Vertrauen mit Bedacht vergeben**: Vertrauen Sie nur Arbeitsbereichen aus vertrauenswürdigen Quellen.

## FAQ

### F: Wie aktiviere ich LSP?

Verwenden Sie beim Start von Qwen Code das Flag `--experimental-lsp`:

```bash
qwen --experimental-lsp
```

### F: Wie erfahre ich, welche Sprachserver gerade ausgeführt werden?

Verwenden Sie den Befehl `/lsp status`, um alle konfigurierten und laufenden Sprachserver anzuzeigen.

### F: Kann ich mehrere Sprachserver für denselben Dateityp verwenden?

Ja, allerdings wird pro Vorgang nur einer verwendet. Der erste Server, der Ergebnisse zurückgibt, gewinnt.

### F: Funktioniert LSP im Sandbox-Modus?

Sprachserver werden außerhalb der Sandbox ausgeführt, um auf Ihren Code zugreifen zu können. Sie unterliegen den Steuerungsmöglichkeiten für das Vertrauen in Arbeitsbereiche.