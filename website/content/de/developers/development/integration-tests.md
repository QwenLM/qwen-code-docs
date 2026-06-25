# Integrationstests

Dieses Dokument enthält Informationen über das Integrationstest-Framework, das in diesem Projekt verwendet wird.

## Übersicht

Die Integrationstests sind dazu gedacht, die End-to-End-Funktionalität von Qwen Code zu validieren. Sie führen die erstellte Binärdatei in einer kontrollierten Umgebung aus und überprüfen, ob sie sich wie erwartet verhält, wenn sie mit dem Dateisystem interagiert.

Diese Tests befinden sich im Verzeichnis `integration-tests` und werden mit einem benutzerdefinierten Test-Runner ausgeführt.

## Ausführen der Tests

Die Integrationstests werden nicht als Teil des standardmäßigen `npm run test`-Befehls ausgeführt. Sie müssen explizit mit dem Skript `npm run test:integration:all` ausgeführt werden.

Die Integrationstests können auch mit der folgenden Abkürzung ausgeführt werden:

```bash
npm run test:e2e
```

## Ausführen einer bestimmten Gruppe von Tests

Um eine Teilmenge der Testdateien auszuführen, können Sie `npm run <Integrationstest-Befehl> <Dateiname1> ....` verwenden, wobei &lt;Integrationstest-Befehl&gt; entweder `test:e2e` oder `test:integration*` ist und `<Dateiname>` eine der `.test.ts`-Dateien im Verzeichnis `integration-tests/` ist. Das folgende Beispiel führt `list_directory.test.ts` und `write_file.test.ts` aus:

```bash
npm run test:e2e list_directory write_file
```

### Ausführen eines einzelnen Tests nach Namen

Um einen einzelnen Test nach seinem Namen auszuführen, verwenden Sie das Flag `--test-name-pattern`:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Alle Tests ausführen

Um die gesamte Suite von Integrationstests auszuführen, verwenden Sie den folgenden Befehl:

```bash
npm run test:integration:all
```

### Sandbox-Matrix

Der Befehl `all` führt Tests für `keine Sandbox`, `docker` und `podman` aus.
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

Der Integrationstest-Runner bietet mehrere Diagnoseoptionen, um die Fehlersuche bei Testfehlern zu erleichtern.

### Behalten der Testausgabe

Sie können die während eines Testlaufs erstellten temporären Dateien zur Überprüfung aufbewahren. Dies ist nützlich, um Probleme bei Dateisystemoperationen zu debuggen.

Um die Testausgabe zu behalten, setzen Sie die Umgebungsvariable `KEEP_OUTPUT` auf `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Wenn die Ausgabe behalten wird, gibt der Test-Runner den Pfad zum eindeutigen Verzeichnis des Testlaufs aus.

### Ausführliche Ausgabe

Für ein detaillierteres Debugging setzen Sie die Umgebungsvariable `VERBOSE` auf `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Wenn `VERBOSE=true` und `KEEP_OUTPUT=true` im selben Befehl verwendet werden, wird die Ausgabe an die Konsole gestreamt und auch in einer Log-Datei im temporären Verzeichnis des Tests gespeichert.

Die ausführliche Ausgabe ist so formatiert, dass die Quelle der Logs klar erkennbar ist:

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting und Formatierung

Um Codequalität und Konsistenz zu gewährleisten, werden die Integrationstest-Dateien im Rahmen des Hauptbuild-Prozesses gelintet. Sie können den Linter und die Auto-Fix-Funktion auch manuell ausführen.

### Ausführen des Linters

Um nach Linting-Fehlern zu suchen, führen Sie den folgenden Befehl aus:

```bash
npm run lint
```

Sie können das Flag `:fix` in den Befehl einfügen, um automatisch alle behebbaren Linting-Fehler zu korrigieren:

```bash
npm run lint:fix
```

## Verzeichnisstruktur

Die Integrationstests erstellen für jeden Testlauf ein eindeutiges Verzeichnis im Verzeichnis `.integration-tests`. In diesem Verzeichnis wird für jede Testdatei ein Unterverzeichnis erstellt, und darin wiederum ein Unterverzeichnis für jeden einzelnen Testfall.

Diese Struktur erleichtert das Auffinden der Artefakte für einen bestimmten Testlauf, eine bestimmte Datei oder einen bestimmten Testfall.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.ts/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## Kontinuierliche Integration

Um sicherzustellen, dass die Integrationstests immer ausgeführt werden, ist ein GitHub Actions-Workflow in `.github/workflows/e2e.yml` definiert. Dieser Workflow führt die Integrationstests automatisch für Pull-Requests gegen den `main`-Branch aus oder wenn ein Pull-Request zu einer Merge-Warteschlange hinzugefügt wird.

Der Workflow führt die Tests in verschiedenen Sandbox-Umgebungen aus, um sicherzustellen, dass Qwen Code in jeder Umgebung getestet wird:

- `sandbox:none`: Führt die Tests ohne Sandboxing aus.
- `sandbox:docker`: Führt die Tests in einem Docker-Container aus.
- `sandbox:podman`: Führt die Tests in einem Podman-Container aus.
