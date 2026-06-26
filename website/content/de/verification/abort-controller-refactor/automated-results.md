# Automatisierte Verifikationsergebnisse

Erfasst am 20.05.2026 während des AbortController-Refactorings.

## 1. Listener-Ansammlungs-Reproduktion

Direkte Simulation des Listener-Ansammlungsmusters, das in langen
Sitzungen beobachtet wurde (1500+ Abbruch-Listener auf einem einzelnen
AbortSignal). Das Skript befindet sich unter
`listener-accumulation-repro.mjs`.

```text
$ node docs/verification/abort-controller-refactor/listener-accumulation-repro.mjs
Simuliere 2000 Durchläufe für jedes Muster.

OLD pattern Listener-Anzahl auf langlebigem Parent: 2000
NEW pattern Listener-Anzahl auf langlebigem Parent: 0
BESTANDEN: OLD pattern hat >1500 Listener angesammelt (reproduziert den Fehler).
BESTANDEN: NEW pattern hielt Listener-Anzahl bei 0 – der Helfer verhindert Ansammlung.
```

Dies ist ein in sich geschlossener Proof: Das OLD-Muster (rohes `addEventListener`
ohne `{once:true}` oder Reverse-Cleanup) sammelt über 2000 Durchläufe
2000 Listener an – weit über der vom Benutzer beobachteten 1500er-Schwelle. Das
NEW-Muster (`createChildAbortController` aus `packages/core/src/utils/abortController.ts`)
hält die Parent-Listener-Anzahl über 2000 Durchläufe bei 0, da der
Reverse-Cleanup-Listener jedes Kindes den Parent-Listener entfernt, wenn das Kind abbricht.

## 2. Migrationsumfang (beabsichtigt)

Nur die Agent-Runtime-Parent→Child-Kette, die tatsächlich Listener auf einem
langlebigen Parent-Signal ansammelt, wird auf den Helfer migriert:

- `packages/core/src/agents/runtime/agent-interactive.ts` (Master + Pro-Nachricht-Runde)
- `packages/core/src/agents/runtime/agent-core.ts` (Pro-Iteration-Runde + waitForExternalInputs + processFunctionCalls try/finally)
- `packages/core/src/agents/runtime/agent-headless.ts` (external → execution)
- `packages/core/src/hooks/promptHookRunner.ts` (hatte ein echtes Cleanup-Leck: manuelles addEventListener ohne `{once:true}` und niemals entfernt)

Plus drei `{once:true}`-nur Korrekturen (kein Helferwechsel, nur defensive
Korrektheit):

- `packages/core/src/hooks/hookRunner.ts`
- `packages/core/src/hooks/functionHookRunner.ts`
- `packages/core/src/confirmation-bus/message-bus.ts`

Unabhängige kurzlebige Controller (pro Shell-Befehl in `tools/shell.ts`,
pro Monitor in `tools/monitor.ts`, pro Arena-Sitzung in
`agents/arena/ArenaManager.ts`, pro Abruf in `core/client.ts`,
pro Fetch in `utils/fetch.ts`, pro Dream / pro Title / pro Judge / pro Resume
usw.) bleiben bei rohem `new AbortController()` – sie werden bei Verwendungsende
vom GC erfasst und sammeln sich nicht auf einem langlebigen Parent an.

Siehe `migration-completeness.txt` für das tatsächliche Grep und die Begründung.

## 3. Betroffene Test-Suites

Alle 71 betroffenen Testdateien / 2085 Tests bestehen (3 übersprungen – 1 ist der GC-Test,
der `--expose-gc` erfordert, 2 sind bereits vorhandene Überspringungen in der Headless-Suite).

```text
 Test Files  71 passed (71)
      Tests  2085 passed | 3 skipped (2088)
   Duration  16.71s
```

Abdeckung:

- `packages/core/src/utils/abortController.test.ts` – 26 Tests: Factory-Cap (Standard + benutzerdefiniert), Child-Weitergabe, Reverse-Cleanup, Fast Path, undefinierter Parent, benutzerdefinierte maxListeners-Durchleitung, `combineAbortSignals`-Semantik (einschl. Cleanup-bricht-Timeout, Timeout-reinigt-Eingabe-Listener, `timeoutMs <= 0`-Grenze, defensive Prüfung während der Iteration), GC-Sicherheit (best-effort).
- `packages/cli/src/utils/warningHandler.test.ts` – 13 Tests: Idempotenz, AbortSignal-Unterdrückung (einschl. `[AbortSignal{...}]`-Form), generisches EventTarget NICHT unterdrückt, Debug-Modus-Durchleitung, Fan-Out zu vorherigen Listenern, erzeugte Child-End-to-End-Stderr-Integration.
- `packages/core/src/hooks/httpHookRunner.test.ts` – deckt den migrierten `combineAbortSignals`-Konsumenten ab (der veraltete `createCombinedAbortSignal`-Shim plus seine Testdatei wurden entfernt, sobald der einzige Aufrufer migriert war).
- `packages/core/src/agents/runtime/{agent-core,agent-interactive,agent-headless,agent-context,agent-statistics}.test.ts` – 102 Tests, die die hochwirksamen migrierten Dateien abdecken.
- `packages/core/src/core/openaiContentGenerator/**` – 280+ Tests, einschließlich der Pipeline, die den `raiseAbortListenerCap`-Notbehelf verloren hat.
- `packages/core/src/followup/**` – 100+ Tests, einschließlich des migrierten Spekulationscontrollers.
- `packages/core/src/tools/agent/**`, `packages/core/src/tools/shell.test.ts`, `packages/core/src/services/**`, `packages/core/src/hooks/**`, `packages/core/src/confirmation-bus/**` – alle migrierten Tool-/Hook-/Service-Dateien.

## 4. TypeScript Strict-Mode-Typcheck

```sh
$ node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit
(keine Ausgabe, Exit 0)

$ node_modules/.bin/tsc -p packages/cli/tsconfig.json --noEmit
(keine Ausgabe, Exit 0)
```

## 5. Prettier-Formatierung

```sh
$ node_modules/.bin/prettier --check packages/core/src/agents/runtime/agent-core.ts \
    packages/core/src/agents/runtime/agent-headless.ts \
    packages/cli/src/utils/warningHandler.ts \
    packages/cli/src/utils/warningHandler.test.ts \
    packages/core/src/utils/abortController.ts \
    packages/core/src/utils/abortController.test.ts
Überprüfe Formatierung...
Alle übereinstimmenden Dateien verwenden den Prettier-Code-Stil!
```

## 6. Build + Binär-Smoke-Test

```sh
$ npm run build:packages
(erfolgreich für alle 5 Workspace-Pakete)

$ NODE_OPTIONS=--trace-warnings node packages/cli/dist/index.js --version
0.15.11
EXIT=0

$ node packages/cli/dist/index.js --help
Usage: qwen [options] [command]
...
```

Beim Start mit `--trace-warnings` wurden keine Warnungen ausgegeben.

## 7. Codex-unabhängige Überprüfung

Zwei vollständige Durchläufe über den `codex:codex-rescue`-Agenten (jedes Mal
unabhängiger Kontext). Der erste Durchlauf ergab 3 Probleme – alle wurden in
nachfolgenden Commits behoben:

1. **Throw zwischen Controller-Erstellung und explizitem Abbruch verliert Listener**
   im `agent-core.ts`-Pro-Iteration-Rumpf und im `agent-headless.ts`-Setup vor dem
   try-Block. Behoben durch Umwickeln jedes Blocks mit `try { ... } finally {
abortController.abort(); }`.
2. **Warnungsunterdrücker-Regex `EventTarget` zu breit**. Eingeschränkt auf
   ausschließlich `AbortSignal` (jede Form, die Node ≥20 produziert).
3. **`process.removeAllListeners('warning')` entfernt Drittanbieter-Listener**.
   Entfernt – verlassen auf Node-Semantik "keine Listener → Standard-Drucker feuert",
   sodass das Hinzufügen unseres Handlers implizit den Standard-Druckpfad deaktiviert,
   während Drittanbieter-Telemetrie-Listener intakt bleiben.

Der zweite Durchlauf bestätigte alle Korrekturen als korrekt, keine weiteren
Blockaden.

## Was für die interaktive Verifikation übrig bleibt

Die in `README.md` nummerierten Szenarien 00–09 erfordern eine echte interaktive
Sitzung gegen die Modell-API (lange Konversationen mit gemischten Tools, Strg-C
mitten im Stream, Unteragenten-Abbruch, Heap-Snapshots). Diese sind für die
manuelle Ausführung dokumentiert, und die Transkripte sollten dem PR-Body
beigefügt werden, wenn sie ausgeführt werden.