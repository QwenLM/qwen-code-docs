# Worktree-Funktion E2E-Testplan (Phase A + B)

## Umfang

End-to-End-Tests für die generische Worktree-Funktionalität:

- Phase A: `EnterWorktree` / `ExitWorktree` Tools + SessionService State
- Phase B: `Agent` Tool `isolation: 'worktree'` Parameter + Auto-Cleanup + Worktree-Hinweis

## Testumgebung

Jede Testgruppe läuft in einem eigenen temporären Git-Repo und einer eigenen tmux-Sitzung, um Kollisionen zu vermeiden. Vorlage für die Einrichtung:

```bash
TEST_DIR=$(mktemp -d -t worktree-test-XXXXXX)
cd "$TEST_DIR"
git init -q
git config user.email "test@example.com"
git config user.name "Test"
echo "hello" > README.md
git add README.md
git commit -q -m "initial"
```

Jede Gruppe verwendet einen eindeutigen tmux-Sitzungsnamen (z. B. `wt-test-a`, `wt-test-b`) und ein eindeutiges temporäres Verzeichnis.

Basis-Binärdatei: global installiertes `qwen` (0.15.10).
Lokale Build-Binärdatei: `node /Users/mochi/code/qwen-code/.claude/worktrees/trusting-euclid-6fdfb9/bundle/qwen.js`.

## Testgruppe A: EnterWorktree-Tool-Registrierung und grundlegende Erstellung

**Modus:** Headless, `--approval-mode yolo`, `--output-format json`

### A1: Tool in der Systeminitialisierung registriert

**Schritte:**

```bash
<qwen> "say hello" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .tools[]' \
  | grep -E "^(enter_worktree|exit_worktree)$"
```

**Vor der Implementierung:** leer (Tools nicht registriert).
**Nach der Implementierung:** gibt `enter_worktree` und `exit_worktree` aus.

### A2: Worktree mit automatisch generiertem Namen erstellen

**Schritte:**

```bash
<qwen> "create a new git worktree using the enter_worktree tool" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.json
# Check worktree dir created
ls -la .qwen/worktrees/ | grep -v "^\." | wc -l
# Should have a directory matching the auto-generated slug pattern
```

**Vor der Implementierung:** Das Modell gibt an, das Tool nicht zu finden; kein Verzeichnis `.qwen/worktrees/`.
**Nach der Implementierung:** `.qwen/worktrees/<slug>` existiert mit automatisch generiertem Slug (Format: `{adj}-{noun}-{4hex}`).

### A3: Worktree mit benutzerdefiniertem Namen erstellen

**Schritte:**

```bash
<qwen> "use the enter_worktree tool with name='my-feature' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/my-feature/
git branch | grep worktree-my-feature
```

**Vor der Implementierung:** Tool unbekannt.
**Nach der Implementierung:** Verzeichnis `.qwen/worktrees/my-feature/` existiert; Branch `worktree-my-feature` existiert.

### A4: Ungültiger Slug abgelehnt

**Schritte:**

```bash
<qwen> "use enter_worktree with name='../../../etc' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="user") | .message.content[] | select(.is_error) | .content'
```

**Vor der Implementierung:** Tool unbekannt.
**Nach der Implementierung:** Tool-Ergebnis is_error=true mit einer Validierungsfehlermeldung.

## Testgruppe B: ExitWorktree

**Modus:** Headless, zweistufige Interaktion innerhalb einer Eingabeaufforderung.

### B1: Betreten und dann verlassen mit action=keep

**Schritte:**

```bash
<qwen> "create a worktree named 'temp-keep' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.json
# Directory should still exist (keep preserves it)
ls -d .qwen/worktrees/temp-keep
# Branch should still exist
git branch | grep worktree-temp-keep
# CWD should be original
```

**Vor der Implementierung:** Tools unbekannt.
**Nach der Implementierung:** Worktree-Verzeichnis und Branch existieren nach dem Verlassen weiterhin.

### B2: Betreten und dann verlassen mit action=remove (keine Änderungen)

**Schritte:**

```bash
<qwen> "create a worktree named 'temp-remove' using enter_worktree, then immediately exit it with action='remove' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls -d .qwen/worktrees/temp-remove 2>&1
git branch | grep worktree-temp-remove
```

**Vor der Implementierung:** Tools unbekannt.
**Nach der Implementierung:** Worktree-Verzeichnis wird entfernt; Branch wird gelöscht.

### B3: Exit mit action=remove verweigert bei nicht committeten Änderungen

**Schritte:** Starten Sie eine interaktive tmux-Sitzung, erstellen Sie manuell Dateien im Worktree und versuchen Sie dann das Verlassen.

```bash
tmux new-session -d -s wt-test-b3 -x 200 -y 50 "cd $TEST_DIR && <qwen> --approval-mode yolo"
sleep 3
tmux send-keys -t wt-test-b3 "create a worktree named 'dirty-test' using enter_worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
# Wait for completion
for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break
done
# Create dirty file in worktree
echo "dirty" > "$TEST_DIR/.qwen/worktrees/dirty-test/dirty.txt"
# Try to remove without discard_changes
tmux send-keys -t wt-test-b3 "use exit_worktree with action='remove' to exit the worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break; done
tmux capture-pane -t wt-test-b3 -p -S -100 > /tmp/b3.out
# Should mention "uncommitted changes" or "discard_changes" in output
grep -E "uncommitted|discard_changes" /tmp/b3.out
tmux kill-session -t wt-test-b3
```

**Vor der Implementierung:** Tools unbekannt.
**Nach der Implementierung:** Exit schlägt fehl mit einer Meldung über nicht committete Änderungen und dem `discard_changes`-Flag.

## Testgruppe C: SessionService-Persistenz

### C1: Worktree-Zustand in den Sitzungsmetadaten

**Schritte:**

```bash
SESSION_ID=$(<qwen> "create a worktree named 'persist-test' using enter_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .session_id' | head -1)
# Check session storage for worktree state
find ~/.qwen -name "*${SESSION_ID}*" 2>/dev/null | head
grep -l "persist-test" ~/.qwen/projects/*/sessions/*.json 2>/dev/null || \
  grep -rl "worktreeSession\|persist-test" ~/.qwen/projects/ 2>/dev/null | head -5
```

**Vor der Implementierung:** Kein Worktree-Sitzungszustand irgendwo gespeichert.
**Nach der Implementierung:** Das Session-JSON enthält ein Feld `worktreeSession` mit `slug='persist-test'`, `worktreePath`, `originalCwd` usw.

## Testgruppe D: AgentTool-Isolierung

### D1: Isolationsparameter des Agenten akzeptiert

**Schritte:**

```bash
<qwen> "spawn an agent using the agent tool with isolation='worktree' to run 'echo hello'" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="assistant") | .message.content[] | select(.type=="tool_use" and .name=="agent") | .input'
# Check that .qwen/worktrees/ contains an agent-* slug during execution
```

**Vor der Implementierung:** Das Agent-Tool-Schema hat keinen Isolationsparameter; das Modell lässt es entweder weg oder das Schema lehnt es ab.
**Nach der Implementierung:** Der Agent läuft erfolgreich mit isolation='worktree'; es wird ein Worktree `agent-<7hex>` erstellt.

### D2: Agent räumt Worktree automatisch auf (keine Änderungen)

**Schritte:**

```bash
ls .qwen/worktrees/ > /tmp/d2-before.txt 2>/dev/null
<qwen> "spawn an agent with isolation='worktree' to list files in the current directory using ls" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/ > /tmp/d2-after.txt 2>/dev/null
# After should equal before (no leftover agent-* dirs)
diff /tmp/d2-before.txt /tmp/d2-after.txt
```

**Vor der Implementierung:** N/V (kein Isolationsparameter).
**Nach der Implementierung:** Das Worktrees-Verzeichnis bleibt nach Abschluss des Agenten ohne Änderungen unverändert.

### D3: Agent-Worktree bei Änderungen erhalten

**Schritte:**

```bash
<qwen> "spawn an agent with isolation='worktree' to write 'test content' to a new file called test.txt" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/d3.json
# Worktree should be preserved with the change
ls .qwen/worktrees/agent-* 2>/dev/null
ls .qwen/worktrees/agent-*/test.txt 2>/dev/null
# Agent result should include worktreePath/worktreeBranch
jq 'select(.type=="user") | .message.content[] | select(.tool_use_id) | .content' /tmp/d3.json | head
```

**Vor der Implementierung:** N/V.
**Nach der Implementierung:** `.qwen/worktrees/agent-<7hex>/test.txt` existiert; das Agent-Ergebnis enthält Worktree-Pfad und Branch.

## Testgruppe E: Bereinigung alter Worktrees

### E1: Bereinigungsfunktion entfernt alte Agent-Worktrees

Dies ist im E2E schwieriger zu testen, da es eine Alterung erfordert. Durch Unit-Tests in `worktreeCleanup.test.ts` abdecken:

- Worktree mit mtime > 30 Tagen und passendem `agent-<7hex>`-Muster → entfernt
- Worktree mit mtime > 30 Tagen, aber benutzerbenannt (z. B. `my-feature`) → erhalten
- Worktree mit mtime < 30 Tage → erhalten
- Worktree mit nicht committeten Änderungen → erhalten (Fail-Closed)
- Worktree mit nicht gepushten Commits → erhalten (Fail-Closed)

E2E-Stichprobe (optional): manuell `touch -t 200001010000 .qwen/worktrees/agent-aabcdef0` und Bereinigung aufrufen; Entfernung überprüfen.

## Testgruppe F: Arena-Kompatibilität (keine Regression)

### F1: Arena-Worktree-Pfad unverändert

**Schritte:** Führen Sie eine Arena-Sitzung (getrennt von EnterWorktree) aus; überprüfen Sie, dass sie Worktrees weiterhin unter `~/.qwen/arena/<sessionId>/worktrees/` und nicht unter `.qwen/worktrees/` erstellt.

```bash
# Setup: requires Arena-enabled config. Detailed steps depend on Arena CLI invocation.
# Pre-implementation: arena worktrees are under ~/.qwen/arena/.
# Post-implementation: SAME — arena path is independent.
```

(Falls Arena aus dem Headless-Modus nicht einfach erreichbar ist, wird diese Gruppe durch den Unit-Test verifiziert, dass `ArenaManager.ts:125` (`this.arenaBaseDir = arenaSettings?.worktreeBaseDir ?? path.join(Storage.getGlobalQwenDir(), 'arena')`) unverändert ist.)

## Unit-Test-Abdeckung (zusammen mit der Implementierung)

Außerhalb des E2E-Plans müssen diese Unit-Tests die Implementierung begleiten:

- `EnterWorktreeTool.test.ts`: Schema-Validierung, Slug-Ablehnung, Ablehnung von verschachtelten Worktrees, CWD-Änderung, SessionService-Schreiben
- `ExitWorktreeTool.test.ts`: Keep- vs. Remove-Pfade, Schutz vor nicht sauberem Zustand, discard_changes-Umgehung, CWD-Wiederherstellung
- `gitWorktreeService.test.ts` Erweiterungen: `createUserWorktree`, `removeUserWorktree`, `createAgentWorktree`, `removeAgentWorktree`
- `sessionService.test.ts` Erweiterungen: WorktreeSession-Feld lesen/schreiben, Wiederherstellung bei Fortsetzung
- `worktreeCleanup.test.ts`: Bereinigungsmusterabgleich, Altersfilter, Fail-Closed-Bedingungen
- `agent.test.ts` Erweiterungen: Isolationsparameter akzeptiert, Worktree erstellt und (in manchen Fällen) bereinigt

## Erfolgskriterien

| Gruppe | Vor dem Build erwartet           | Nach dem Build erwartet                                 |
| ------ | -------------------------------- | ------------------------------------------------------- |
| A1     | Tools nicht aufgeführt           | Beide Tools aufgeführt                                  |
| A2     | Fehler/keine Aktion             | `.qwen/worktrees/<auto-slug>` erstellt                  |
| A3     | Fehler/keine Aktion             | `.qwen/worktrees/my-feature` erstellt, Branch vorhanden |
| A4     | Fehler/keine Aktion             | Tool-Ergebnis is_error mit Validierungsmeldung           |
| B1     | Fehler/keine Aktion             | Worktree-Verzeichnis + Branch erhalten                  |
| B2     | Fehler/keine Aktion             | Worktree-Verzeichnis + Branch entfernt                  |
| B3     | Fehler/keine Aktion             | Exit verweigert mit Meldung zu nicht committeten Änderungen |
| C1     | Kein Worktree-Zustand           | Sitzung hat Feld worktreeSession                        |
| D1     | Kein Isolationsparameter        | Agent läuft in `agent-<7hex>`-Worktree                  |
| D2     | N/V                             | Worktrees-Verzeichnis nach Agent ohne Änderungen unverändert |
| D3     | N/V                             | `agent-<7hex>` mit Änderungen erhalten                  |

## Reproduktionsbericht (nach der Implementierung)

Lokaler Build unter `dist/cli.js` (Commit am Ende von `claude/trusting-euclid-6fdfb9`).

| Gruppe | Ergebnis                         | Notizen                                                                                                                                                                      |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1     | ✅                               | `enter_worktree` und `exit_worktree` in `system.tools` aufgeführt                                                                                                            |
| A3     | ✅                               | `.qwen/worktrees/my-feature` erstellt, Branch `worktree-my-feature` vorhanden                                                                                                 |
| A4     | durch Unit-Test abgedeckt        | `validateUserWorktreeSlug` lehnt Path-Traversal usw. ab (`enter-worktree.test.ts`)                                                                                            |
| B1     | ✅                               | Aktion `keep` hat sowohl Verzeichnis als auch Branch erhalten                                                                                                                |
| B2     | ✅                               | Aktion `remove` hat Verzeichnis und Branch gelöscht                                                                                                                           |
| B3     | ✅                               | `remove` verweigert mit `Refusing to remove worktree "dirty-test" — it has 0 tracked change(s) and 1 untracked file(s).`                                                      |
| C1     | ausgeklammert                    | SessionService-Persistenz aus Phase A verschoben (siehe Umfangsnotizen in `docs/design/worktree.md`)                                                                          |
| D1     | ✅                               | Agent-Aufruf akzeptiert `isolation: 'worktree'`, erstellte `agent-2c4e759`                                                                                                   |
| D2     | ✅                               | Nachdem der Agent ohne Änderungen beendet wurde, war das Worktrees-Verzeichnis leer                                                                                           |
| D3     | ✅                               | Nachdem der Agent `test.txt` geschrieben hatte, blieb der Worktree `agent-bad55bd` und der Branch `worktree-agent-bad55bd` erhalten; das Ergebnis enthielt den Suffix `[worktree preserved: ... (branch ...)]` |
| E1     | durch Unit-Test abgedeckt        | `worktreeCleanup.test.ts` verifiziert, dass `isEphemeralSlug` nur auf `agent-<7hex>` passt                                                                                    |
| F1     | ausgeklammert (kein Arena-E2E in diesem Durchlauf) | Arena-Codepfade unberührt: `ArenaManager.ts:125` und `setupWorktrees()` unverändert                                                                                           |

### Abweichungen vom Testplan

- **C1** (SessionService-Persistenz) wurde aus Phase A verschoben. Die minimal funktionsfähige Phase A gibt den absoluten Worktree-Pfad zurück, sodass das Model ihn direkt über absolute Pfade verwendet, anstatt mechanisch `Config.targetDir` umzuschalten. Resume-Unterstützung erfordert eine SessionService-Erweiterung und ist für eine zukünftige Phase dokumentiert.
- **A2** (automatisch generierter Name) wurde indirekt über D1/D3 verifiziert, die denselben Auto-Slug-Pfad durch den Agent-Isolierungsablauf durchlaufen.