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

`QWEN_CI_VITEST_RETRY` und `QWEN_RELEASE_VITEST_RETRY` werden im Haupt-CI-Test-Schritt (`npm run test:ci:workspaces` und `npm run test:scripts`) bzw. auf der Release-Lane (`npm run test:release:workspaces`) als `--retry=<n>` an Vitest übergeben. Die beiden Lanes haben separate Variablen, damit sie unabhängig voneinander angepasst werden können.

Vitest führt fehlgeschlagene Tests innerhalb desselben Runs erneut aus. Das kann bei intermittierenden contention-bedingten Fehlern helfen, aber ein Fehler, der sich innerhalb des Retry-Budgets erholt, setzt den Check auf grün und wird vom Flaky-Rerun-Tracker nicht als Fehlschlag erfasst. Halte das Budget knapp, statt mit Retries eine fehleranfällige Suite zu überdecken. Beide Variablen akzeptieren auch den Literalwert `off`, der das `--retry`-Flag vollständig weglässt, statt `--retry=0` zu übergeben (ein Kommandozeilen-`--retry=0` hat Vorrang vor der Vitest-Konfiguration des Workspace und würde eine beabsichtigte Retry-Richtlinie deaktivieren).

### Workspace-Test-Timeout

`QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES` setzt das Job-level `timeout-minutes` jedes der drei `workspace_tests`-Shards in der Release-Pipeline. Das Timeout richtet sich nach der Auslastung des reservierten Hosts statt nach der Suite selbst – erhöhe es also, wenn der Host überlastet ist, statt von einer Test-Regression auszugehen.

### Vitest-Worker-Limit auf Self-Hosted Runnern

`QWEN_CI_VITEST_MAX_WORKERS` begrenzt die Vitest-Prozesse in den unten aufgeführten Schritten (`VITEST_MAX_THREADS` / `VITEST_MAX_FORKS`, wobei das zugehörige Minimum auf `1` erzwungen wird) auf den reservierten Self-Hosted Runnern, deren Name mit `ecs-qwen-` beginnt. Die Variable wird nur vom Haupt-CI-Workspace-Test-Schritt und den Release-Schritten `workspace_tests` und `quality_scripts` exportiert; andere Integrationstests, die Vitest verwenden und auf denselben reservierten Pool in den CI- und Release-Workflows treffen, verbrauchen sie nicht – sie verwenden ihre eigenen Vitest-Limits. Der WebShell-E2E-Smoke ist auf `ubuntu-latest` gepinnt, daher kann das Limit dort nicht greifen. Auf GitHub-hosted Runnern wird die Variable ignoriert und Vitest verwendet seine eigenen Standardwerte.

### Verwandte Variablen außerhalb der Testausführung

`release.yml` exponiert außerdem `QWEN_RELEASE_STATIC_TIMEOUT_MINUTES` (Standard `60`, steuert die `quality_static`-Lint-Lane) und `QWEN_RELEASE_BUILD_TIMEOUT_MINUTES` (Standard `45`, steuert die `quality_build`-Packaging-Lane). Da sie statisches Linting und Artifact-Builds statt der Testausführung steuern, liegen sie außerhalb des Testausführungs-Scope dieser Seite.