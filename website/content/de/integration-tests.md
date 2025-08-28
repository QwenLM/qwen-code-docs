# Integration Tests

Dieses Dokument enthält Informationen über das Integration Testing Framework, das in diesem Projekt verwendet wird.

## Übersicht

Die Integration Tests dienen dazu, die End-to-End-Funktionalität von Qwen Code zu validieren. Sie führen die gebaute Binary in einer kontrollierten Umgebung aus und prüfen, ob sie wie erwartet mit dem Dateisystem interagiert.

Diese Tests befinden sich im Verzeichnis `integration-tests` und werden mit einem eigenen Test Runner ausgeführt.

## Tests ausführen

Die Integration Tests werden nicht als Teil des Standardbefehls `npm run test` ausgeführt. Sie müssen explizit mit dem Script `npm run test:integration:all` gestartet werden.

Alternativ können die Integration Tests auch mit folgendem Shortcut ausgeführt werden:

```bash
npm run test:e2e
```

## Ausführen einer bestimmten Testsammlung

Um eine Teilmenge von Testdateien auszuführen, kannst du `npm run <integration test command> <file_name1> ....` verwenden, wobei `<integration test command>` entweder `test:e2e` oder `test:integration*` ist und `<file_name>` eine der `.test.js` Dateien im `integration-tests/` Verzeichnis ist. Der folgende Befehl führt beispielsweise `list_directory.test.js` und `write_file.test.js` aus:

```bash
npm run test:e2e list_directory write_file
```

### Ausführen eines einzelnen Tests anhand des Namens

Um einen einzelnen Test anhand seines Namens auszuführen, verwende das `--test-name-pattern` Flag:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Ausführen aller Tests

Um die gesamte Suite der Integrationstests auszuführen, verwende den folgenden Befehl:

```bash
npm run test:integration:all
```

### Sandbox-Matrix

Der Befehl `all` führt Tests für `no sandboxing`, `docker` und `podman` aus.  
Jeder einzelne Typ kann mit den folgenden Befehlen ausgeführt werden:

```bash
npm run test:integration:sandbox:none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## Diagnose

Der Integrationstest-Runner bietet mehrere Optionen zur Diagnose, um bei der Fehlersuche in Tests zu helfen.

### Test-Ausgabe behalten

Du kannst die temporären Dateien, die während eines Testlaufs erstellt wurden, zur Überprüfung erhalten. Das ist besonders nützlich, um Probleme mit Dateisystemoperationen zu debuggen.

Um die Test-Ausgabe zu behalten, setze die Umgebungsvariable `KEEP_OUTPUT` auf `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Wenn die Ausgabe behalten wird, gibt der Test-Runner den Pfad zum eindeutigen Verzeichnis des Testlaufs aus.

### Ausführliche Ausgabe (Verbose output)

Für detailliertere Debugging-Ausgaben kannst du die Umgebungsvariable `VERBOSE` auf `true` setzen.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Wenn du `VERBOSE=true` und `KEEP_OUTPUT=true` im selben Befehl verwendest, wird die Ausgabe sowohl in der Konsole gestreamt als auch in einer Log-Datei innerhalb des temporären Verzeichnisses des Tests gespeichert.

Die ausführliche Ausgabe ist so formatiert, dass die Quelle der Logs klar identifizierbar ist:

```
--- TEST: <log dir>:<test-name> ---
... Ausgabe vom qwen-Befehl ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting und Formatierung

Um die Codequalität und Konsistenz sicherzustellen, werden die Integrationstest-Dateien im Rahmen des Haupt-Build-Prozesses gelintet. Du kannst den Linter auch manuell ausführen und automatisch Fehler beheben lassen.

### Den Linter ausführen

Um auf Linting-Fehler zu prüfen, führe folgenden Befehl aus:

```bash
npm run lint
```

Du kannst den `:fix`-Flag zum Befehl hinzufügen, um alle behebbaren Linting-Fehler automatisch zu korrigieren:

```bash
npm run lint:fix
```

## Verzeichnisstruktur

Die Integrationstests erstellen für jeden Testlauf ein eindeutiges Verzeichnis innerhalb des `.integration-tests` Verzeichnisses. Innerhalb dieses Verzeichnisses wird für jede Testdatei ein Unterverzeichnis angelegt, und darin wiederum ein Unterverzeichnis für jeden einzelnen Testfall.

Diese Struktur erleichtert das Auffinden der Artefakte für einen bestimmten Testlauf, eine Datei oder einen Fall.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...andere Test-Artefakte...
```

## Continuous Integration

Um sicherzustellen, dass die Integrationstests immer ausgeführt werden, ist ein GitHub Actions Workflow in `.github/workflows/e2e.yml` definiert. Dieser Workflow führt automatisch die Integrationstests für Pull Requests gegen den `main` Branch aus, oder wenn ein Pull Request zu einer Merge Queue hinzugefügt wird.

Der Workflow führt die Tests in verschiedenen Sandboxing-Umgebungen aus, um sicherzustellen, dass Qwen Code in jeder Umgebung getestet wird:

- `sandbox:none`: Führt die Tests ohne Sandboxing aus.
- `sandbox:docker`: Führt die Tests in einem Docker-Container aus.
- `sandbox:podman`: Führt die Tests in einem Podman-Container aus.