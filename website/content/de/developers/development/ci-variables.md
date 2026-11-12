# CI- und Release-Variablen

Mehrere Stellschrauben der CI- und Release-Pipelines sind als GitHub-Actions-Repository-Variablen (der `vars.*`-Kontext) verfügbar, damit Operatoren sie anpassen können, ohne einen Pull Request zu eröffnen. Diese Seite listet die Variablen auf, die die Testausführung in `.github/workflows/ci.yml` und `.github/workflows/release.yml` beeinflussen, zusammen mit ihren Standardwerten und ihrem jeweiligen Anwendungsbereich.

## Eine Variable setzen

Repository-Maintainer setzen diese unter **Settings → Secrets and variables → Actions → Variables**. Eine nicht gesetzte (oder leere) Variable verwendet den Fallback im Workflow-Ausdruck. Das Worker-Limit gilt nur auf reservierten Runnern, selbst wenn die zugehörige Variable gesetzt ist.

Die Workflow-Dateien sind die maßgebliche Quelle für diese Stellschrauben, und die Test-Suites pinnen die Workflow-Ausdrücke Byte für Byte: `scripts/tests/package-scripts.test.js` pinnt den gemeinsamen Worker-Cap-Ausdruck in `release.yml` (`QWEN_CI_VITEST_MAX_WORKERS` mit dem `ecs-qwen-`-Guard), `scripts/tests/no-ak-integration-ci.test.js` pinnt den Worker-Cap-Ausdruck in `ci.yml`, und `scripts/tests/release-workflow.test.js` pinnt die Retry- und Workspace-Test-Timeout-Ausdrücke in `release.yml`. `scripts/tests/package-scripts.test.js` prüft außerdem die dokumentierten Standardwerte und Workflow-Pfade gegen beide Workflows. Da dieser Guard auf der Full-Profile-CI-Lane (`test:scripts`) statt auf Docs-only-Checks läuft, sollten Änderungen an diese Seite vor dem Eröffnen eines Pull Requests lokal mit `npm run test:scripts` (oder `npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/package-scripts.test.js`) verifiziert werden. Falls die Dokumentation und die Workflows jemals voneinander abweichen, sind die Workflows maßgeblich – diese Seite ist dann im selben Change zu aktualisieren.

## Variablen

| Variable                                 | Standard | Verwendet in            | Steuert                                                                                   |
| ---------------------------------------- | -------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `QWEN_CI_VITEST_RETRY`                   | `2`      | `ci.yml`                | Retry-Anzahl für den Haupt-CI-Workspace- und Skript-Test-Schritt                          |
| `QWEN_RELEASE_VITEST_RETRY`              | `2`      | `release.yml`           | Retry-Anzahl für die Release-Workspace-Test-Shards                                        |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES` | `45`     | `release.yml`           | Job-Timeout jedes Release-Workspace-Test-Shards                                           |
| `QWEN_CI_VITEST_MAX_WORKERS`             | `4`      | `ci.yml`, `release.yml` | Worker-Limit für Haupt-CI-Unit-Tests und Release-Workspace/Quality-Tests auf reservierten Runnern |

### Retry-Anzahlen

`QWEN_CI_VITEST_RETRY` und `QWEN_RELEASE_VITEST_RETRY` werden im Haupt-CI-Test-Schritt (jedes Workspace-`test:ci`, den dieser Schritt in zwei parallelen Lanes ausführt, und `npm run test:scripts:unit`) bzw. auf der Release-Lane (`npm run test:release:workspaces`) als `--retry=<n>` an Vitest übergeben. Die beiden Lanes haben separate Variablen, damit sie unabhängig voneinander angepasst werden können.

Vitest führt fehlgeschlagene Tests innerhalb desselben Runs erneut aus. Das kann bei intermittierenden contention-bedingten Fehlern helfen, aber ein Fehler, der sich innerhalb des Retry-Budgets erholt, setzt den Check auf grün und wird vom Flaky-Rerun-Tracker nicht als Fehlschlag erfasst. Halte das Budget knapp, statt mit Retries eine fehleranfällige Suite zu überdecken. Beide Variablen akzeptieren auch den Literalwert `off`, der das `--retry`-Flag vollständig weglässt, statt `--retry=0` zu übergeben (ein Kommandozeilen-`--retry=0` hat Vorrang vor der Vitest-Konfiguration des Workspace und würde eine beabsichtigte Retry-Richtlinie deaktivieren).

### Workspace-Test-Timeout

`QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES` setzt das Job-level `timeout-minutes` jedes der drei `workspace_tests`-Shards in der Release-Pipeline. Das Timeout richtet sich nach der Auslastung des reservierten Hosts statt nach der Suite selbst – erhöhe es also, wenn der Host überlastet ist, statt von einer Test-Regression auszugehen.

### Vitest-Worker-Limit auf Self-Hosted Runnern

`QWEN_CI_VITEST_MAX_WORKERS` begrenzt die Vitest-Prozesse in den unten aufgeführten Schritten (`VITEST_MAX_THREADS` / `VITEST_MAX_FORKS`, wobei das zugehörige Minimum auf `1` erzwungen wird) auf den reservierten Self-Hosted Runnern, deren Name mit `ecs-qwen-` beginnt. Die Variable wird nur vom Haupt-CI-Workspace-Test-Schritt und den Release-Schritten `workspace_tests` und `quality_scripts` exportiert; andere Integrationstests, die Vitest verwenden und auf denselben reservierten Pool in den CI- und Release-Workflows treffen, verbrauchen sie nicht – sie verwenden ihre eigenen Vitest-Limits. Der WebShell-E2E-Smoke läuft auf dem ARM64-Pool mit seinen eigenen zwei Playwright-Workern, daher gilt das Limit dafür nicht. Auf GitHub-hosted Runnern wird die Variable ignoriert und Vitest verwendet seine eigenen Standardwerte.

Jeder Vitest-Run wendet das Limit eigenständig an. Der Haupt-CI-Workspace-Test-Schritt führt zwei Lanes gleichzeitig aus (`.github/scripts/ci/run-unit-test-lanes.sh`): die Haupt-Lane führt die CLI- und Core-Suites mit dem Limit aus, und die Neben-Lane führt die Suites der anderen Workspaces und `npm run test:scripts:unit` mit der Hälfte des Limits aus, mindestens 1, sodass der Schritt auf seinem Höhepunkt das Limit plus dieser Hälfte ausführt. Auf GitHub-hosted Runnern verwenden die Vitest-Runs der Neben-Lane 2 Worker.

Der Schritt läuft in zwei Shards (`Linux unit tests (shard N/2)`), wobei jeder `--shard=N/2` an jeden dieser Vitest-Runs übergibt. Die Shards wenden das Limit ebenfalls eigenständig an, sodass der Pool bis zu zwei solcher Schritte gleichzeitig sieht. Sie installieren ohne den `prepare`-Build und entpacken den Tree, den `test_build` einmal gebaut hat. `Test (ubuntu-latest, Node 22.x)` ist nur bestanden, wenn der Build und jeder Shard bestanden sind.

`test_build` ist der einzige Job, der baut. Er baut über `scripts/ci-build-cache.mjs`: ein Pull Request stellt den Build wieder her, den der `main`-Push seines Base-Commits gespeichert hat (`key --at <base>`), fällt auf den neuesten zwischengespeicherten Build zurück und baut nur die Workspaces neu, deren Inputs sich geändert haben: die getrackten Dateien eines Workspaces außer Tests, die Root-Dateien, `patches/` und `scripts/` außerhalb von `scripts/tests/`, sowie die Workspaces, von denen er abhängt. Ein Push auf `main` baut immer von Grund auf neu und speichert diesen Build. Der Cache-Key trägt keine CPU-Architektur: der x64-labelisierte Pool umfasst ARM64-Hosts, und die einzige architekturspezifische Ausgabe – die native opentui-Bibliothek des Bundles – wird nach jedem Restore und Unpack neu für den Host kopiert (`ci-build-cache.mjs host-assets`).

Die Unit-Test-Shards, die zwei `Integration Tests (no-AK, shard N/2)`-Shards und die zwei WebShell-Smoke-Shards entpacken alle diesen einen Tree. `test_build` führt außerdem die Checks aus, die ihn lesen, die Serve-Fast-Path-Bundle-Closure, die Core-Subpath-Exports und den Settings-Schema-Frische-Check, für den `Lint & Static` früher gebaut hat. `Integration Tests (no-AK, No Sandbox)` ist nur bestanden, wenn der Build und jeder Integration- Shard bestanden sind. Ein Draft-Pull Request überspringt die Integration-Shards und den Browser-Smoke; ihn als Ready for Review zu markieren, startet den Lauf, der sie einschließt. Eine Änderung, die auf `packages/managed-agent-server/` oder `packages/sdk-java/` beschränkt ist (außer den Dateien, die die TypeScript-Suites lesen), wird als `java_only` klassifiziert: `Lint & Static` führt seine Payload plus die `scripts/tests`-Suites aus, die diese Trees benennen, und die TypeScript-Build- und Test-Lanes überspringen.

### Verwandte Variablen außerhalb der Testausführung

`release.yml` exponiert außerdem `QWEN_RELEASE_STATIC_TIMEOUT_MINUTES` (Standard `60`, steuert die `quality_static`-Lint-Lane) und `QWEN_RELEASE_BUILD_TIMEOUT_MINUTES` (Standard `45`, steuert die `quality_build`-Packaging-Lane). Da sie statisches Linting und Artifact-Builds statt der Testausführung steuern, liegen sie außerhalb des Testausführungs-Scope dieser Seite.