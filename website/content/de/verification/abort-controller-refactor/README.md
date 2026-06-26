# AbortController Refaktor — Verifikationsplan

Szenarien, die verwendet werden, um die Änderung manuell vor dem Öffnen des PRs zu validieren. Jedes
Szenario erfasst seinen tmux-Pane über `tmux pipe-pane -o 'cat >> <log>'`.

## Einmalige Einrichtung

```sh
# Point WT at your local checkout of the branch under review.
WT=/path/to/qwen-code/worktree
LOGDIR=$WT/docs/verification/abort-controller-refactor/logs
mkdir -p "$LOGDIR"

# Build the CLI once (skip sandbox image, skip vscode).
( cd "$WT" && npm run build:packages )
```

## Szenarien

Für jedes Szenario:

```sh
tmux new-session -d -s qwen-verify-XX
tmux pipe-pane -t qwen-verify-XX -o "cat >> $LOGDIR/XX-name.log"
tmux send-keys -t qwen-verify-XX "cd /path/to/your/test/workspace && exec node $WT/packages/cli/dist/index.js" C-m
tmux attach -t qwen-verify-XX
```

Dann steuere die Sitzung manuell gemäß der untenstehenden Matrix. Drücke `C-b d`, um dich zu trennen (detach); verwende `tmux kill-session -t qwen-verify-XX`, um den Pane zu stoppen.

### 00 — Baseline (Vor-Fix)

- **Setup:** Check out `main`, baue und führe aus mit `NODE_OPTIONS=--trace-warnings`.
- **Eingabe:** Lange 50-Runden-Session mit gemischten Tools (shell + edit + grep + agent).
- **Erwartet:** Nach etwa 30–40 Runden wird `MaxListenersExceededWarning: ... 1500+ abort listeners added to [AbortSignal]` auf stderr ausgegeben.
- **Log:** `00-baseline-reproduction.log`.

### 01 — Lange Session, DEBUG-Modus (dieser Branch)

- **Setup:** `NODE_OPTIONS=--trace-warnings DEBUG=1 qwen`.
- **Eingabe:** Gleiches 50-Runden-Skript wie in #00.
- **Erwartet:** Kein `MaxListenersExceededWarning` wird ausgegeben; alle anderen Warnungen werden weiterhin ausgegeben.
- **Log:** `01-long-session-debug.log`.

### 02 — Lange Session, Produktionsmodus (dieser Branch)

- **Setup:** `qwen` (keine Debug-Umgebung).
- **Eingabe:** Gleiches 50-Runden-Skript.
- **Erwartet:** Saubere Ausgabe; ein temporärer `console.error`-Test innerhalb des Handlers (hinzugefügt und dann entfernt) bestätigt, dass der Filter feuert.
- **Log:** `02-long-session-prod.log`.

### 03 — Strg-C Abbruch mitten im Stream

- **Setup:** Dieser Branch, interaktiv.
- **Eingabe:** Frage nach einer langen Generierung (>30s); drücke Strg-C während des Streams.
- **Erwartet:** Der Stream stoppt innerhalb von ~200ms, der „Cancelled“-Banner wird angezeigt, die nächste Eingabeaufforderung akzeptiert Eingaben. `process._getActiveHandles()`-Zähler kehrt zum Ausgangswert zurück (verwende `:debug handles`).
- **Log:** `03-ctrlc-streaming.log`.

### 04 — Lang laufende Shell abbrechen

- **Setup:** Dieser Branch.
- **Eingabe:** Führe `sleep 60` über das Shell-Tool aus; brich die Ausführung ab.
- **Erwartet:** Der Kindprozess wird beendet (überprüfe mit `pgrep -f sleep`, dass kein Eintrag zurückkommt), das Tool-Ergebnis zeigt den Abbruch an, der Agent akzeptiert die nächste Eingabeaufforderung.
- **Log:** `04-shell-cancel.log`.

### 05 — Sub-Agent-Abbruch

- **Setup:** Dieser Branch.
- **Eingabe:** Starte eine lange Agent-Aufgabe über das Agent-Tool; brich sie vom Elternprozess aus ab.
- **Erwartet:** Die laufenden Tool-Aufrufe des Sub-Agents werden abgebrochen, der Modell-Stream des Sub-Agents stoppt, der Elternprozess erhält das Abbruchereignis.
- **Log:** `05-subagent-cancel.log`.

### 06 — Headless / nicht-interaktiver Abbruch

- **Setup:** `qwen --prompt "do a long task"`; sende `SIGINT` von außen mit `kill -INT <pid>`.
- **Erwartet:** Sauberes Herunterfahren, Exit-Code 130, keine Warnungen.
- **Log:** `06-headless-abort.log`.

### 07 — Hintergrund-Agent-Ablauf

- **Setup:** Interaktiv.
- **Eingabe:** Starte einen Hintergrund-Agenten (`run_in_background: true`); lass ihn vollenden; starte einen zweiten; brich den zweiten während der Ausführung ab.
- **Erwartet:** Der erste Agent wird normal abgeschlossen; der zweite wird sauber abgebrochen; kein Listener-Leck zwischen den beiden.
- **Log:** `07-background-agent.log`.

### 08 — Speicher-Baseline

- **Setup:** `qwen --inspect`, verbinde Chrome DevTools.
- **Eingabe:** 100-Runden-Session.
- **Erwartet:** Heap-Snapshots bei Runde 0/50/100. Die Anzahl der `AbortSignal`-Instanzen und die Listener-Anzahl pro Signal sind stabil (kein monotones Wachstum).
- **Log:** `08-memory-snapshots/`.

### 09 — Vorhandener combinedAbortSignal-Verbraucher

- **Setup:** Löse einen HTTP-Hook sowohl mit einem externen Signal als auch mit Timeout aus.
- **Eingabe:** (a) Externes Signal während des Hooks abbrechen; (b) Timeout in einem separaten Durchlauf auslösen lassen.
- **Erwartet:** Der Hook wird in beiden Fällen sauber abgebrochen; der Deprecation-Shim-Pfad wird durchlaufen.
- **Log:** `09-http-hook-shim.log`.

## Automatisierte (nicht interaktive) Überprüfungen

Die folgenden automatisierten Prüfungen wurden während der Entwicklung durchgeführt und in
`automated-results.md` festgehalten:

- Alle Unit-Tests für `abortController.test.ts` bestehen (26 Tests; 1 GC-Test wird ohne `--expose-gc` übersprungen).
- Alle Tests für `warningHandler.test.ts` bestehen (13 Tests inklusive eines integrierten Tests der stderr eines erzeugten Kindprozesses).
- Alle Tests für `combineAbortSignals`-Verbraucher bestehen (`httpHookRunner.test.ts`); der veraltete `createCombinedAbortSignal`-Shim plus die zugehörige Testdatei wurden entfernt, sobald der einzige Aufrufer migriert war.
- Alle Tests für Agent-Runtime / Followup / openAiContentGenerator / Hooks bestehen.
- Migrationsumfang (absichtlich): Nur die Eltern→Kind-Kette der Agent-Runtime (`agent-interactive.ts`, `agent-core.ts`, `agent-headless.ts`) plus `promptHookRunner.ts` (echtes Cleanup-Leck) wurden auf den Helfer umgestellt. Unabhängige kurzlebige Controller (pro Shell-Befehl, pro Fetch, pro Recall usw.) bleiben bei rohem `new AbortController()` – sie werden schnell vom GC erfasst und sammeln keine Listener auf einem langlebigen Elternobjekt. Siehe `migration-completeness.txt` für das erfasste grep und die Begründung.
- Der TypeScript-Strict-Mode-Typ-Check besteht sowohl für `packages/core` als auch für `packages/cli`.
- Der Prettier-Check besteht für alle geänderten Dateien.

Siehe `automated-results.md` für die tatsächliche Ausgabe der Befehle.

## Wie man die Artefakte für den PR-Body erfasst

Nachdem jedes Szenario ausgeführt wurde, hänge die Transkriptdatei (oder einen relevanten Auszug)
an den PR an. Für #08 (Speicher) exportiere die Heap-Snapshots und füge die
Differenz der Listener-Anzahl zwischen den Snapshots bei.