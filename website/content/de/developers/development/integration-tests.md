# Integrationstests

Dieses Dokument enthält Informationen über das Integrationstest-Framework, das in diesem Projekt verwendet wird.

## Übersicht

Die Integrationstests dienen der Validierung der End-to-End-Funktionalität von Qwen Code. Sie führen die kompilierte Binärdatei in einer kontrollierten Umgebung aus und überprüfen, ob sie beim Zugriff auf das Dateisystem wie erwartet reagiert.

Diese Tests befinden sich im Verzeichnis `integration-tests` und werden mithilfe eines benutzerdefinierten Test-Runners ausgeführt.

## Ausführen der Tests

Die Integrationstests werden nicht automatisch im Rahmen des Standardbefehls `npm run test` ausgeführt. Sie müssen explizit mit dem Skript `npm run test:integration:all` gestartet werden.

Alternativ können die Integrationstests auch über die folgende Abkürzung ausgeführt werden:

```bash
npm run test:e2e
```

## Ausführen einer bestimmten Testgruppe

Um eine Teilmenge von Testdateien auszuführen, können Sie `npm run <Integrations-Test-Befehl> <Dateiname1> ...` verwenden, wobei `<Integrations-Test-Befehl>` entweder `test:e2e` oder `test:integration*` ist und `<Dateiname>` einer der `.test.js`-Dateien im Verzeichnis `integration-tests/` entspricht. Beispielsweise führt der folgende Befehl `list_directory.test.js` und `write_file.test.js` aus:

```bash
npm run test:e2e list_directory write_file
```

### Ausführen eines einzelnen Tests nach Name

Um einen einzelnen Test anhand seines Namens auszuführen, verwenden Sie die Option `--test-name-pattern`:

```bash
npm run test:e2e -- --test-name-pattern "liest eine Datei"
```

### Ausführen aller Tests

Um die gesamte Integrationstestsuite auszuführen, verwenden Sie den folgenden Befehl:

```bash
npm run test:integration:all
```

### Sandbox-Matrix

Der Befehl `all` führt Tests für „keine Sandbox“, „Docker“ und „Podman“ aus.  
Jeder einzelne Typ kann mit den folgenden Befehlen separat ausgeführt werden:

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

Der Integrationstest-Runner bietet mehrere Optionen zur Diagnose, um Testfehler zu lokalisieren.

### Beibehalten der Testausgabe

Sie können die während eines Testlaufs erstellten temporären Dateien zur Untersuchung beibehalten. Dies ist hilfreich, um Probleme mit Dateisystemoperationen zu debuggen.

Um die Testausgabe beizubehalten, setzen Sie die Umgebungsvariable `KEEP_OUTPUT` auf `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Wenn die Ausgabe beibehalten wird, gibt der Test-Runner den Pfad zum eindeutigen Verzeichnis des jeweiligen Testlaufs aus.

### Ausführliche Ausgabe

Für detailliertere Debugging-Informationen setzen Sie die Umgebungsvariable `VERBOSE` auf `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Wenn `VERBOSE=true` und `KEEP_OUTPUT=true` im selben Befehl verwendet werden, wird die Ausgabe sowohl an die Konsole gestreamt als auch in einer Protokolldatei im temporären Verzeichnis des Tests gespeichert.

Die ausführliche Ausgabe ist so formatiert, dass die Herkunft der Protokolleintragungen klar erkennbar ist:

```
--- TEST: <Log-Verzeichnis>:<Test-Name> ---
... Ausgabe des qwen-Befehls ...
--- ENDE TEST: <Log-Verzeichnis>:<Test-Name> ---
```

## Linting und Formatierung

Um die Codequalität und Konsistenz sicherzustellen, werden die Integrations-Testdateien im Rahmen des Hauptbuildprozesses überprüft. Sie können den Linter und den automatischen Korrekturmechanismus (Auto-Fixer) aber auch manuell ausführen.

### Ausführen des Linters

Um nach Linting-Fehlern zu suchen, führen Sie den folgenden Befehl aus:

```bash
npm run lint
```

Sie können dem Befehl das Flag `:fix` hinzufügen, um alle korrigierbaren Linting-Fehler automatisch zu beheben:

```bash
npm run lint:fix
```

## Verzeichnisstruktur

Die Integrationstests erstellen für jeden Testlauf ein eigenes Verzeichnis innerhalb des Verzeichnisses `.integration-tests`. In diesem Verzeichnis wird für jede Testdatei ein Unterverzeichnis angelegt, und darin wiederum für jeden einzelnen Testfall ein weiteres Unterverzeichnis.

Diese Struktur erleichtert das Auffinden der Artefakte für einen bestimmten Testlauf, eine bestimmte Testdatei oder einen bestimmten Testfall.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...andere Testartefakte...
```

## Continuous Integration

Um sicherzustellen, dass die Integrations-Tests stets ausgeführt werden, ist ein GitHub Actions-Workflow in `.github/workflows/e2e.yml` definiert. Dieser Workflow führt die Integrations-Tests automatisch für Pull Requests aus, die auf den `main`-Branch gerichtet sind, oder wenn ein Pull Request einer Merge-Warteschlange hinzugefügt wird.

Der Workflow führt die Tests in verschiedenen Sandbox-Umgebungen aus, um sicherzustellen, dass Qwen Code in allen folgenden Umgebungen getestet wird:

- `sandbox:none`: Führt die Tests ohne Sandbox-Umgebung aus.
- `sandbox:docker`: Führt die Tests in einem Docker-Container aus.
- `sandbox:podman`: Führt die Tests in einem Podman-Container aus.