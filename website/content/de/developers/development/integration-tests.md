# Integrationstests

Dieses Dokument enthält Informationen über das Framework für Integrationstests, das in diesem Projekt verwendet wird.

## Übersicht

Die Integrationstests wurden entwickelt, um die End-to-End-Funktionalität von Qwen Code zu validieren. Sie führen die erstellte Binärdatei in einer kontrollierten Umgebung aus und überprüfen, ob sie sich wie erwartet verhält, wenn sie mit dem Dateisystem interagiert.

Diese Tests befinden sich im Verzeichnis `integration-tests` und werden mit einem benutzerdefinierten Test-Runner ausgeführt.

## Ausführen der Tests

Die Integrationstests werden nicht als Teil des Standardbefehls `npm run test` ausgeführt. Sie müssen explizit mit dem Skript `npm run test:integration:all` gestartet werden.

Die Integrationstests können auch mit folgendem Kürzel ausgeführt werden:

```bash
npm run test:e2e
```

## Ausführen einer bestimmten Gruppe von Tests

Um eine Teilmenge von Testdateien auszuführen, können Sie `npm run <integration test command> <Dateiname1> ....` verwenden, wobei &lt;integration test command&gt; entweder `test:e2e` oder `test:integration*` ist und `<Dateiname>` eine der `.test.ts`-Dateien im Verzeichnis `integration-tests/`. Das folgende Beispiel führt `list_directory.test.ts` und `write_file.test.ts` aus:

```bash
npm run test:e2e list_directory write_file
```

### Ausführen eines einzelnen Tests nach Namen

Um einen einzelnen Test nach seinem Namen auszuführen, verwenden Sie das Flag `--test-name-pattern`:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Ausführen aller Tests

Um die gesamte Suite der Integrationstests auszuführen, verwenden Sie den folgenden Befehl:

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

Der Integrationstest-Runner bietet verschiedene Optionen zur Diagnose, um Testfehler aufzuspüren.

### Testausgabe behalten

Sie können die während eines Testlaufs erstellten temporären Dateien zur Inspektion aufbewahren. Dies ist nützlich, um Probleme mit Dateisystemoperationen zu debuggen.

Um die Testausgabe zu behalten, setzen Sie die Umgebungsvariable `KEEP_OUTPUT` auf `true`.

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

Wenn die Ausgabe behalten wird, gibt der Test-Runner den Pfad zum eindeutigen Verzeichnis für den Testlauf aus.

### Ausführliche Ausgabe

Für detailliertere Debugging-Informationen setzen Sie die Umgebungsvariable `VERBOSE` auf `true`.

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

Bei Verwendung von `VERBOSE=true` und `KEEP_OUTPUT=true` im selben Befehl wird die Ausgabe an die Konsole gestreamt und auch in einer Logdatei im temporären Verzeichnis des Tests gespeichert.

Die ausführliche Ausgabe ist so formatiert, dass die Quelle der Logs klar erkennbar ist:

```
--- TEST: <log dir>:<test-name> ---
... Ausgabe des qwen-Befehls ...
--- END TEST: <log dir>:<test-name> ---
```

## Linting und Formatierung

Um Codequalität und Konsistenz zu gewährleisten, werden die Integrationstest-Dateien als Teil des Hauptbuild-Prozesses gelintet. Sie können den Linter und die automatische Fehlerbehebung auch manuell ausführen.

### Ausführen des Linters

Um auf Linting-Fehler zu prüfen, führen Sie den folgenden Befehl aus:

```bash
npm run lint
```

Sie können das Flag `:fix` im Befehl hinzufügen, um automatisch behebbare Linting-Fehler zu korrigieren:

```bash
npm run lint:fix
```

## Verzeichnisstruktur

Die Integrationstests erstellen für jeden Testlauf ein eindeutiges Verzeichnis innerhalb des Verzeichnisses `.integration-tests`. In diesem Verzeichnis wird für jede Testdatei ein Unterverzeichnis und darin für jeden einzelnen Testfall ein weiteres Unterverzeichnis erstellt.

Diese Struktur erleichtert das Auffinden der Artefakte für einen bestimmten Testlauf, eine Datei oder einen Fall.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.ts/
        └── <test-case-name>/
            ├── output.log
            └── ...weitere Test-Artefakte...
```

## Kontinuierliche Integration

Um sicherzustellen, dass die Integrationstests immer ausgeführt werden, ist ein GitHub Actions-Workflow in `.github/workflows/e2e.yml` definiert. Dieser Workflow führt die Integrationstests automatisch für Pull Requests gegen den `main`-Branch oder wenn ein Pull Request zu einer Merge-Queue hinzugefügt wird, aus.

Der Workflow führt die Tests in verschiedenen Sandboxing-Umgebungen aus, um sicherzustellen, dass Qwen Code in jeder Umgebung getestet wird:

- `sandbox:none`: Führt die Tests ohne Sandboxing aus.
- `sandbox:docker`: Führt die Tests in einem Docker-Container aus.
- `sandbox:podman`: Führt die Tests in einem Podman-Container aus.