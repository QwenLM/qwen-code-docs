# Integrationstests

Dieses Dokument enthält Informationen über das Integrationstest-Framework, das in diesem Projekt verwendet wird.

## Übersicht

Die Integrationstests dienen dazu, die End-to-End-Funktionalität von Qwen Code zu validieren. Sie führen die erstellte Binärdatei in einer kontrollierten Umgebung aus und überprüfen, ob sie sich wie erwartet verhält, wenn sie mit dem Dateisystem interagiert.

Diese Tests befinden sich im Verzeichnis `integration-tests` und werden mit einem benutzerdefinierten Test-Runner ausgeführt.

## Ausführen der Tests

Die Integrationstests werden nicht als Teil des Standardbefehls `npm run test` ausgeführt. Sie müssen explizit mit dem Skript `npm run test:integration:all` gestartet werden.

Die Integrationstests können auch mit folgendem Shortcut ausgeführt werden:

```bash
npm run test:e2e
```

## Ausführen einer bestimmten Testsammlung

Um eine Teilmenge von Testdateien auszuführen, kannst du `npm run <Integrationstest-Befehl> <Dateiname1> ...` verwenden, wobei &lt;Integrationstest-Befehl&gt; entweder `test:e2e` oder `test:integration*` ist und `<Dateiname>` eine beliebige `.test.js`-Datei im Verzeichnis `integration-tests/` darstellt. Der folgende Befehl führt beispielsweise `list_directory.test.js` und `write_file.test.js` aus:

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

Der Befehl `all` führt Tests für `keine Sandboxing`, `docker` und `podman` aus.
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

### Testausgabe behalten

Sie können die temporären Dateien, die während eines Testlaufs erstellt wurden, zur Überprüfung aufbewahren. Dies ist nützlich, um Probleme mit Dateisystemoperationen zu debuggen.

Um die Testausgabe zu behalten, setzen Sie die Umgebungsvariable `KEEP_OUTPUT` auf `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Wenn die Ausgabe behalten wird, gibt der Test-Runner den Pfad zum eindeutigen Verzeichnis für den Testlauf aus.

### Ausführliche Ausgabe

Für detailliertere Debugging-Ausgaben setzen Sie die Umgebungsvariable `VERBOSE` auf `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Wenn Sie `VERBOSE=true` und `KEEP_OUTPUT=true` im selben Befehl verwenden, wird die Ausgabe sowohl auf der Konsole gestreamt als auch in einer Logdatei innerhalb des temporären Verzeichnisses des Tests gespeichert.

Die ausführliche Ausgabe ist so formatiert, dass die Quelle der Logs klar identifiziert werden kann:

```
--- TEST: <log dir>:<test-name> ---
... Ausgabe vom qwen-Befehl ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting und Formatierung

Um die Codequalität und Konsistenz sicherzustellen, werden die Integrationstest-Dateien im Rahmen des Hauptbuild-Prozesses gelintet. Sie können den Linter auch manuell ausführen sowie automatisch Fehler beheben lassen.

### Den Linter ausführen

Um nach Linting-Fehlern zu suchen, führen Sie folgenden Befehl aus:

```bash
npm run lint
```

Sie können das Flag `:fix` zum Befehl hinzufügen, um alle behebbaren Linting-Fehler automatisch zu korrigieren:

```bash
npm run lint:fix
```

## Verzeichnisstruktur

Die Integrationstests erstellen für jeden Testlauf ein eindeutiges Verzeichnis innerhalb des `.integration-tests`-Verzeichnisses. Innerhalb dieses Verzeichnisses wird für jede Testdatei ein Unterverzeichnis und darin wiederum für jeden einzelnen Testfall ein weiteres Unterverzeichnis angelegt.

Diese Struktur erleichtert das Auffinden der Artefakte für einen bestimmten Testlauf, eine Datei oder einen Fall.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...weitere Testartefakte...
```

## Kontinuierliche Integration

Um sicherzustellen, dass die Integrationstests immer ausgeführt werden, ist ein GitHub Actions-Workflow in `.github/workflows/e2e.yml` definiert. Dieser Workflow führt automatisch die Integrationstests für Pull Requests gegen den `main`-Branch aus oder wenn ein Pull Request zu einer Merge-Queue hinzugefügt wird.

Der Workflow führt die Tests in verschiedenen Sandbox-Umgebungen aus, um sicherzustellen, dass Qwen Code in jeder Umgebung getestet wird:

- `sandbox:none`: Führt die Tests ohne Sandboxing aus.
- `sandbox:docker`: Führt die Tests in einem Docker-Container aus.
- `sandbox:podman`: Führt die Tests in einem Podman-Container aus.