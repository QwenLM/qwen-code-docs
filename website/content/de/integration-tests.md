# Integration Tests

Dieses Dokument enthält Informationen über das Integration Testing Framework, das in diesem Projekt verwendet wird.

## Übersicht

Die Integration Tests dienen dazu, die End-to-End-Funktionalität von Qwen Code zu validieren. Sie führen die gebaute Binary in einer kontrollierten Umgebung aus und prüfen, ob sie sich wie erwartet verhält, wenn sie mit dem Dateisystem interagiert.

Diese Tests befinden sich im Verzeichnis `integration-tests` und werden mit einem eigenen Test Runner ausgeführt.

## Tests ausführen

Die Integration Tests werden nicht als Teil des Standardbefehls `npm run test` ausgeführt. Sie müssen explizit mit dem Script `npm run test:integration:all` gestartet werden.

Alternativ können die Integration Tests auch mit folgendem Shortcut ausgeführt werden:

```bash
npm run test:e2e
```

## Ausführen einer bestimmten Testsammlung

Um eine Teilmenge von Testdateien auszuführen, kannst du `npm run <integration test command> <file_name1> ....` verwenden, wobei `<integration test command>` entweder `test:e2e` oder `test:integration*` ist und `<file_name>` eine der `.test.js`-Dateien im Verzeichnis `integration-tests/` darstellt. Der folgende Befehl führt beispielsweise `list_directory.test.js` und `write_file.test.js` aus:

```bash
npm run test:e2e list_directory write_file
```

### Ausführen eines einzelnen Tests anhand des Namens

Um einen einzelnen Test anhand seines Namens auszuführen, verwende das Flag `--test-name-pattern`:

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

Um die Test-Ausgabe zu behalten, kannst du entweder das Flag `--keep-output` verwenden oder die Umgebungsvariable `KEEP_OUTPUT` auf `true` setzen.

```bash

# Mit dem Flag
npm run test:integration:sandbox:none -- --keep-output

# Verwendung der Umgebungsvariable
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Wenn die Ausgabe beibehalten wird, gibt der Test-Runner den Pfad zum eindeutigen Verzeichnis für den Testlauf aus.

### Ausführliche Ausgabe

Für detaillierteres Debugging streamt das `--verbose` Flag die Echtzeitausgabe des `qwen` Befehls an die Konsole.

```bash
npm run test:integration:sandbox:none -- --verbose
```

Wenn `--verbose` und `--keep-output` im selben Befehl verwendet werden, wird die Ausgabe sowohl an die Konsole gestreamt als auch in einer Log-Datei innerhalb des temporären Verzeichnisses des Tests gespeichert.

Die ausführliche Ausgabe ist so formatiert, dass die Quelle der Logs klar identifiziert werden kann:

```
--- TEST: <file-name-without-js>:<test-name> ---
... Ausgabe des qwen Befehls ...
--- END TEST: <file-name-without-js>:<test-name> ---
```

## Linting und Formatierung

Um die Codequalität und Konsistenz zu gewährleisten, werden die Integrationstest-Dateien als Teil des Haupt-Build-Prozesses gelintet. Du kannst den Linter auch manuell ausführen und automatisch korrigieren lassen.

### Linter ausführen

Um auf Linting-Fehler zu prüfen, führe den folgenden Befehl aus:

```bash
npm run lint
```

Du kannst das `:fix`-Flag zum Befehl hinzufügen, um alle behebbaren Linting-Fehler automatisch zu korrigieren:

```bash
npm run lint:fix
```

## Verzeichnisstruktur

Die Integrationstests erstellen für jeden Testlauf ein eigenes Verzeichnis innerhalb des `.integration-tests`-Verzeichnisses. Innerhalb dieses Verzeichnisses wird für jede Testdatei ein Unterverzeichnis angelegt, und darin wiederum ein Unterverzeichnis für jeden einzelnen Testfall.

Diese Struktur erleichtert das Auffinden der Artefakte für einen bestimmten Testlauf, eine Testdatei oder einen Testfall.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...weitere Test-Artefakte...
```

## Continuous Integration

Um sicherzustellen, dass die Integrationstests immer ausgeführt werden, ist ein GitHub Actions Workflow in `.github/workflows/e2e.yml` definiert. Dieser Workflow führt automatisch die Integrationstests für Pull Requests gegen den `main` Branch aus, oder wenn ein Pull Request zu einer Merge Queue hinzugefügt wird.

Der Workflow führt die Tests in verschiedenen Sandboxing-Umgebungen aus, um sicherzustellen, dass Qwen Code in jeder Umgebung getestet wird:

- `sandbox:none`: Führt die Tests ohne Sandboxing aus.
- `sandbox:docker`: Führt die Tests in einem Docker-Container aus.
- `sandbox:podman`: Führt die Tests in einem Podman-Container aus.