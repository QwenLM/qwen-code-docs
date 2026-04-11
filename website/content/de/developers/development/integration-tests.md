# Integrationstests

Dieses Dokument enthält Informationen über das in diesem Projekt verwendete Framework für Integrationstests.

## Übersicht

Die Integrationstests dienen dazu, die End-to-End-Funktionalität von Qwen Code zu validieren. Sie führen die kompilierte Binary in einer kontrollierten Umgebung aus und überprüfen, ob sie sich bei der Interaktion mit dem Dateisystem wie erwartet verhält.

Diese Tests befinden sich im Verzeichnis `integration-tests` und werden mit einem eigenen Test-Runner ausgeführt.

## Tests ausführen

Die Integrationstests werden nicht standardmäßig über den Befehl `npm run test` ausgeführt. Sie müssen explizit über das Skript `npm run test:integration:all` gestartet werden.

Die Integrationstests können auch über folgenden Shortcut ausgeführt werden:

```bash
npm run test:e2e
```

## Bestimmte Tests ausführen

Um eine Teilmenge von Testdateien auszuführen, kannst du `npm run <integration test command> <file_name1> ...` verwenden. Dabei ist `<integration test command>` entweder `test:e2e` oder `test:integration*` und `<file_name>` eine beliebige `.test.js`-Datei im Verzeichnis `integration-tests/`. Der folgende Befehl führt beispielsweise `list_directory.test.js` und `write_file.test.js` aus:

```bash
npm run test:e2e list_directory write_file
```

### Einzelnen Test nach Namen ausführen

Um einen einzelnen Test anhand seines Namens auszuführen, verwende das Flag `--test-name-pattern`:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Alle Tests ausführen

Um die gesamte Suite der Integrationstests auszuführen, verwende folgenden Befehl:

```bash
npm run test:integration:all
```

### Sandbox-Matrix

Der `all`-Befehl führt Tests für `no sandboxing`, `docker` und `podman` aus.
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

Der Integrationstest-Runner bietet verschiedene Diagnoseoptionen, um Testfehler einzugrenzen.

### Testausgabe beibehalten

Du kannst die während eines Testlaufs erstellten temporären Dateien zur Überprüfung aufbewahren. Dies ist nützlich, um Probleme bei Dateisystemoperationen zu debuggen.

Um die Testausgabe beizubehalten, setze die Umgebungsvariable `KEEP_OUTPUT` auf `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Wenn die Ausgabe beibehalten wird, gibt der Test-Runner den Pfad zum eindeutigen Verzeichnis für den Testlauf aus.

### Ausführliche Ausgabe

Für ein detaillierteres Debugging setze die Umgebungsvariable `VERBOSE` auf `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Wenn `VERBOSE=true` und `KEEP_OUTPUT=true` im selben Befehl verwendet werden, wird die Ausgabe an die Konsole gestreamt und zusätzlich in einer Logdatei im temporären Verzeichnis des Tests gespeichert.

Die ausführliche Ausgabe ist so formatiert, dass die Quelle der Logs klar erkennbar ist:

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting und Formatierung

Um Codequalität und Konsistenz sicherzustellen, werden die Integrationstest-Dateien im Rahmen des Haupt-Build-Prozesses gelintet. Du kannst den Linter und den Auto-Fixer auch manuell ausführen.

### Linter ausführen

Um auf Linting-Fehler zu prüfen, führe folgenden Befehl aus:

```bash
npm run lint
```

Du kannst das `:fix`-Flag zum Befehl hinzufügen, um behebbare Linting-Fehler automatisch zu korrigieren:

```bash
npm run lint:fix
```

## Verzeichnisstruktur

Die Integrationstests erstellen für jeden Testlauf ein eigenes Verzeichnis innerhalb des `.integration-tests`-Verzeichnisses. Innerhalb dieses Verzeichnisses wird für jede Testdatei ein Unterverzeichnis erstellt, und darin wiederum ein Unterverzeichnis für jeden einzelnen Testfall.

Diese Struktur erleichtert das Auffinden der Artefakte für einen bestimmten Testlauf, eine Datei oder einen Fall.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## Continuous Integration

Um sicherzustellen, dass die Integrationstests immer ausgeführt werden, ist ein GitHub Actions Workflow in `.github/workflows/e2e.yml` definiert. Dieser Workflow führt die Integrationstests automatisch für Pull Requests gegen den `main`-Branch aus oder wenn ein Pull Request zu einer Merge Queue hinzugefügt wird.

Der Workflow führt die Tests in verschiedenen Sandbox-Umgebungen aus, um sicherzustellen, dass Qwen Code in jeder Umgebung getestet wird:

- `sandbox:none`: Führt die Tests ohne Sandbox aus.
- `sandbox:docker`: Führt die Tests in einem Docker-Container aus.
- `sandbox:podman`: Führt die Tests in einem Podman-Container aus.