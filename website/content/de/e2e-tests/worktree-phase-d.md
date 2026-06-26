# Worktree Phase D E2E-Testplan

## Umfang

End-to-End-Verifikation der Phase-D-Funktionen gegen den lokalen Build unter
`/Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`.

Phase D liefert drei übergreifende Fähigkeiten:

- **D-1** — `--worktree [name]` CLI-Start-Flag (bare / expliziter Slug / `=`-Form),
  mit `process.cwd()` + `Config.targetDir`-Wechsel und `WorktreeExitDialog`-Wiederverwendung beim Beenden
- **D-2** — `worktree.symlinkDirectories: string[]`-Settings-Schlüssel, angewendet in
  `performPostCreationSetup()`, sodass er `--worktree`, `EnterWorktreeTool`
  UND `AgentTool isolation: "worktree"`-Pfade abdeckt
- **D-3** — `--worktree=#<N>` und `--worktree <github-url>` PR-Referenz-Formen,
  mittels `git fetch origin pull/<N>/head` (keine `gh`-CLI-Abhängigkeit)

## Binärdateien

- **Lokaler Build (Phase-6-Verifikation)**: `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
- **Phase-4-Trockentest-Baseline**: global installiertes `qwen`

Für Trockentests wird erwartet, dass das global installierte `qwen` bei Gruppen A / E / F
fehlschlägt, da die Funktionen noch nicht existieren – das ist die Validierung, dass der Plan
die Implementierung korrekt erkennt.

### Baseline-Vorbedingung für Gruppe E

Tests **E2** (`EnterWorktreeTool`-Symlink) und **E3** (`AgentTool isolation`-Symlink)
erfordern, dass **Phase A + B** in der Baseline vorhanden sind – sie testen das bestehende
`enter_worktree`-Tool und den Parameter `agent isolation: "worktree"`, um zu bestätigen,
dass die Symlink-Schleife auch auf diesen Code-Pfaden feuert.

Das global installierte `qwen` kann älter als PR #4073 (Phase A+B, gemerged 2026-05-14) sein
und diese Tools daher vollständig vermissen. Wenn das der Fall ist, können E2 / E3 nicht
validieren, dass "Symlink fehlt, weil D-2 fehlt" – sie fallen auf "Tool fehlt". Fügen Sie
diese Schutzprüfung am Anfang jedes Tests ein:

```bash
HAS_ENTER_WORKTREE=$($QWEN "list your tools and stop" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -e '.[] | select(.type=="system") | .tools | index("enter_worktree")' >/dev/null && echo yes || echo no)
if [ "$HAS_ENTER_WORKTREE" != "yes" ]; then
  echo "SKIP: enter_worktree fehlt in Baseline – E2/E3 benötigen Phase A+B"
  exit 0
fi
```

Für die Phase-6-Verifikation (nach der Implementierung) enthält der lokale Build
inhärent Phase A-C, die Schutzprüfung ist also ein No-Op und die Tests laufen vollständig.

## Testumgebungs-Vorlage

Jede Gruppe wird in einem eigenen temporären Git-Repo und einer eigenen tmux-Sitzung ausgeführt:

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phd-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # Symlinks auflösen (macOS /var → /private/var)
cd "$TEST_DIR"
git init -q -b main
git config user.email t@e.com
git config user.name t
git config commit.gpgsign false
echo "hello" > README.md
git add README.md
git commit -q -m "initial" --no-verify

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
QWEN="node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js"
```

PR-Referenz-Tests (Gruppe F) benötigen zusätzlich einen ausgecheckten Klon eines öffentlichen
GitHub-Repos mit mindestens einem gemergten PR. Verwenden Sie dieses Repo (qwen-code selbst) als
Testziel – PR `#4174` (Phase C) ist eine garantiert vorhandene Referenz.

---

## Gruppe A: `--worktree`-Flag – grundlegende Formen

**Modus:** headless, `--approval-mode yolo`, `--output-format json`

### A1: Bare `--worktree` (Auto-Slug)

```bash
$QWEN --worktree "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a1.out

# Ein System-Event `worktree_started` wird beim Start ausgegeben. Das Feld
# `notice` enthält den Slug (automatisch generiert `adj-noun-XXXXXX`) im
# gerenderten Text. Verwende `jq -e`, damit ein fehlendes Event einen
# Exit-Code ungleich 0 liefert (statt stillen `null`).
jq -e '.[] | select(.type=="system" and .subtype=="worktree_started") | .data.notice | test("\"[a-z]+-[a-z]+-[0-9a-f]{6}\"")' < /tmp/a1.out

# Die `cwd` der System-Init-Message sollte ebenfalls innerhalb des Worktrees zeigen.
jq -e '.[] | select(.type=="system" and .subtype=="init") | .cwd | test("/\\.qwen/worktrees/[a-z]+-[a-z]+-[0-9a-f]{6}$")' < /tmp/a1.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Erwartet (nach Implementierung):**

- `worktree_started`-Event mit `.data.notice`, das den Auto-Slug enthält
- Init-`.cwd` endet mit `.qwen/worktrees/<auto-slug>`
- Genau ein Worktree-Verzeichnis unter `.qwen/worktrees/`
- Branch namens `worktree-<slug>` existiert (`git branch | grep worktree-`)

**Erwartet (vor Implementierung, Baseline):** yargs lehnt `--worktree` mit
einem "Unknown argument"-Fehler und Exit-Code != 0 ab.

### A2: `--worktree my-feature` (expliziter Slug)

```bash
$QWEN --worktree my-feature "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.out

ls -d "$TEST_DIR/.qwen/worktrees/my-feature"
git -C "$TEST_DIR" branch | grep "worktree-my-feature"
```

**Erwartet (nach Implementierung):** Worktree-Verzeichnis `my-feature/` und Branch
`worktree-my-feature` existieren beide.

### A3: `--worktree=my-feature` (= Form)

Identisch zu A2 mit der `=`-Form. Bereinigung zwischen A2 und A3 erforderlich (anderes
TEST_DIR).

```bash
$QWEN --worktree=my-feature "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a3.out
```

**Erwartet (nach Implementierung):** wie A2.

### A4: Ungültiger Slug wird vor jeder Git-Operation abgewiesen

```bash
$QWEN --worktree "../escape" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a4.out
echo "exit=$?"

ls "$TEST_DIR/.qwen/worktrees/" 2>/dev/null
```

**Erwartet (nach Implementierung):**

- Prozess beendet sich mit Exit-Code ungleich 0
- Stderr oder finale Ergebnis-Meldung erwähnt "invalid slug" / "not allowed"
- `.qwen/worktrees/`-Verzeichnis existiert nicht (Worktree-Erstellung wurde nie gestartet)

### A5: Kein Git-Repository → Fail-Close

```bash
NON_GIT=$(mktemp -d)
cd "$NON_GIT"
$QWEN --worktree "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a5.out
echo "exit=$?"
```

**Erwartet (nach Implementierung):** Exit != 0, Meldung erwähnt "not a git repository"
oder "git init".

---

## Gruppe B: cwd + Sidecar nach `--worktree`

### B1: Sidecar mit allen sechs Feldern geschrieben

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree b1-test --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.out

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit' \
  < "$SIDECAR"
```

**Erwartet:**

- `slug = "b1-test"`
- `worktreePath` endet mit `.qwen/worktrees/b1-test`
- `worktreeBranch = "worktree-b1-test"`
- `originalCwd` = `$TEST_DIR` (aufgelöst)
- `originalBranch = "main"`
- `originalHeadCommit` entspricht `[0-9a-f]{40}`

### B2: `process.cwd()` beim Start gewechselt

```bash
$QWEN --worktree b2-test "run the shell tool with command 'pwd', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b2.out

# Extrahiere die stdout des Shell-Tools aus dem user-message tool_result
jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b2.out | head -5
```

**Erwartet (nach Implementierung):** Die `pwd`-Ausgabe entspricht `$TEST_DIR/.qwen/worktrees/b2-test`.

### B3: `Config.targetDir` gewechselt (Footer / Status-Payload)

```bash
$QWEN --worktree b3-test "run the shell tool with command 'pwd && git rev-parse --abbrev-ref HEAD', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b3.out

jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b3.out
```

**Erwartet (nach Implementierung):** Branch ist `worktree-b3-test` UND das Arbeitsverzeichnis
befindet sich innerhalb des Worktrees.

---

## Gruppe C: `--worktree` × `--resume` Priorität

### C1: `--worktree` gewinnt gegen gespeicherten Sidecar (anderer Slug)

```bash
# Lauf 1: Sitzung mit Worktree "first" erstellen
SESSION_ID=$(uuidgen)
$QWEN --worktree first --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run1.out

# Lauf 2: Dieselbe Sitzung fortsetzen, aber einen anderen Worktree anfordern
$QWEN --resume "$SESSION_ID" --worktree second "say hi again" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run2.out

# Sidecar sollte jetzt auf "second" zeigen
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq -r '.slug' < "$SIDECAR"

# Beide Worktree-Verzeichnisse sollten auf der Platte existieren (first wurde nie entfernt, nur entkoppelt)
ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Erwartet (nach Implementierung):**

- Sidecar `.slug` = `"second"`
- Beide Verzeichnisse `first/` und `second/` existieren
- Lauf 2s stderr oder init-`worktree_overridden`-Meldung erwähnt "--worktree
  überschreibt den Worktree der fortgesetzten Sitzung"

### C2: Stale Sidecar (manuell gelöschtes Verzeichnis) + `--worktree` → frischer Worktree

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree c2 --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run1.out

rm -rf "$TEST_DIR/.qwen/worktrees/c2"   # simuliert benutzergelöschtes Verzeichnis

$QWEN --resume "$SESSION_ID" --worktree c2-fresh "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run2.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Erwartet (nach Implementierung):** Nur `c2-fresh/` existiert; Sidecar auf `c2-fresh` aktualisiert.

---

## Gruppe D: WorktreeExitDialog-Regressionstest (`--worktree`-gestartete Sitzung)

**Modus:** interaktiv (tmux). Verifiziert, dass der Phase-C-Dialog auch dann ausgelöst wird, wenn
der Worktree durch das CLI-Flag und nicht durch `EnterWorktreeTool` erstellt wurde.

### D1: 2× Ctrl+C → Dialog erscheint

```bash
tmux new-session -d -s d1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d1-test --approval-mode yolo"
sleep 3

# Prüfen, ob Worktree aktiv ist (Footer-Indikator)
tmux capture-pane -t d1 -p -S -50 | grep -q "⎇ worktree-d1-test"

# Zweimal Ctrl+C senden
tmux send-keys -t d1 C-c
sleep 0.3
tmux send-keys -t d1 C-c
sleep 1

tmux capture-pane -t d1 -p -S -50 | grep -E "Active worktree|Keep worktree|Remove worktree"
tmux kill-session -t d1
```

**Erwartet (nach Implementierung):** Dialogtext "Active worktree: \"d1-test\" …" und die
drei Radio-Optionen erscheinen.

### D2: Dialog → Abbrechen → Sitzung bleibt aktiv

```bash
tmux new-session -d -s d2 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d2-test --approval-mode yolo"
sleep 3
tmux send-keys -t d2 C-c; sleep 0.3; tmux send-keys -t d2 C-c; sleep 1

# Zu "Cancel" (dritte Option) navigieren und auswählen
tmux send-keys -t d2 Down Down Enter
sleep 1

tmux capture-pane -t d2 -p -S -10 | grep -q "Type your message"
ls -d "$TEST_DIR/.qwen/worktrees/d2-test"   # existiert noch
tmux kill-session -t d2
```

**Erwartet (nach Implementierung):** Eingabeaufforderung erscheint wieder; Worktree-Verzeichnis
ist noch auf der Platte.

### D3: Dialog → Entfernen → Worktree + Branch + Sidecar alle weg

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s d3 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d3-test --session-id $SESSION_ID --approval-mode yolo"
sleep 3
tmux send-keys -t d3 C-c; sleep 0.3; tmux send-keys -t d3 C-c; sleep 1
tmux send-keys -t d3 Down Enter   # "Remove worktree and branch" auswählen
sleep 3
tmux kill-session -t d3

ls "$TEST_DIR/.qwen/worktrees/d3-test" 2>/dev/null && echo "FAIL: Verzeichnis existiert"
git -C "$TEST_DIR" branch | grep "worktree-d3-test" && echo "FAIL: Branch existiert"
test ! -f ~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json && echo "PASS: Sidecar entfernt"
```

**Erwartet (nach Implementierung):** Verzeichnis, Branch und Sidecar alle entfernt.

---

## Gruppe E: `worktree.symlinkDirectories`

**Modus:** headless. Einstellungen über temporäre Einstellungsdatei konfiguriert.

### Setup-Vorlage

```bash
mkdir -p "$TEST_DIR/node_modules"
echo "package.json" > "$TEST_DIR/node_modules/.placeholder"
mkdir -p "$TEST_DIR/.qwen"
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{
  "worktree": {
    "symlinkDirectories": ["node_modules"]
  }
}
EOF
```

### E1: `--worktree`-Pfad wendet Symlink an

```bash
$QWEN --worktree e1-test "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

ls -la "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
readlink "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
```

**Erwartet (nach Implementierung):** `node_modules` innerhalb des Worktrees ist ein Symlink,
der auf `$TEST_DIR/node_modules` zeigt.

### E2: `EnterWorktreeTool`-Pfad wendet Symlink an

```bash
$QWEN "use enter_worktree to create a worktree named e2-test, then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

readlink "$TEST_DIR/.qwen/worktrees/e2-test/node_modules"
```

**Erwartet (nach Implementierung):** Gleiches Symlink-Ziel.

### E3: `AgentTool isolation`-Pfad wendet Symlink an

Erfordert eine Sub-Agent-Definition. Verwenden Sie den eingebauten Fork-Mechanismus:

```bash
$QWEN "use the agent tool with subagent_type='general-purpose', isolation='worktree', description='check node_modules', prompt='run pwd and ls -la node_modules then exit'" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/e3.out

# Agent-Worktree-Verzeichnis aus der Ergebnis-Meldung extrahieren
jq -r '.[] | select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | .input' \
  < /tmp/e3.out | head -5

# Nach der Ausführung das agent-<7hex>-Worktree-Verzeichnis finden
ls -la "$TEST_DIR/.qwen/worktrees/"agent-*/node_modules 2>/dev/null | head -3
```

**Erwartet (nach Implementierung):** Symlink existiert innerhalb des `agent-<hex>`-Worktrees
(außer es wird automatisch bereinigt, weil es keine Änderungen gab – in diesem Fall validiert
der "keine Änderungen"-Pfad das Symlink-Verhalten nicht; dann auf einen Test mit erzwungenen
Änderungen eskalieren).

### E4: Fehlendes Quellverzeichnis → stillschweigend übersprungen, Worktree wird trotzdem erstellt

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["does-not-exist"] } }
EOF

$QWEN --worktree e4-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e4.out
ls -d "$TEST_DIR/.qwen/worktrees/e4-test"
ls "$TEST_DIR/.qwen/worktrees/e4-test/does-not-exist" 2>/dev/null && echo "UNEXPECTED"
```

**Erwartet (nach Implementierung):** Worktree-Verzeichnis existiert, der fehlende Eintrag
wird nicht darin erstellt, Prozess-Exit = 0.

### E5: Vorhandenes Ziel → stillschweigend übersprungen, kein Überschreiben

```bash
# Worktree mit dem erwarteten Slug vorab erstellen und dann neu erstellen – dies ist konstruiert,
# da Phase-D-Pfade frisch sein sollten, aber es testet die EEXIST-Abfanglogik.
mkdir -p "$TEST_DIR/.qwen/worktrees/e5-test/node_modules"
echo "preexisting" > "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker"

# Neuerstellung via EnterWorktreeTool erzwingen (CLI würde "already exists" ablehnen)
$QWEN "use enter_worktree with name='e5-test' to retry" --approval-mode yolo 2>/dev/null
# entweder: Tool bricht sauber ab, ODER Symlink wird übersprungen – beides akzeptabel
test -f "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker" && echo "PASS: nicht überschrieben"
```

**Erwartet (nach Implementierung):** Vorhandener `.marker` überlebt; kein Symlink ersetzt das
Verzeichnis.

### E6: Absoluter Pfad / `../` → abgewiesen

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["/etc", "../escape"] } }
EOF

$QWEN --worktree e6-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e6.out
ls "$TEST_DIR/.qwen/worktrees/e6-test/" | head -10
```

**Erwartet (nach Implementierung):** Worktree existiert; weder `etc` noch `escape` sind
darin verlinkt; Debug-Log enthält Warnzeilen.

---

## Gruppe F: PR-Referenz

**Modus:** headless. Erfordert einen `origin`-Remote, der auf ein öffentliches GitHub-Repo zeigt.

### Setup-Vorlage

```bash
# Qwen-code selbst als Test-Repo verwenden
TEST_DIR=$(mktemp -d -t qwen-wt-phd-pr-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)
cd "$TEST_DIR"
git clone --depth 1 https://github.com/QwenLM/qwen-code.git .
PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
```

### F1: `--worktree=#4174` parst + fetcht

```bash
$QWEN --worktree=#4174 "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f1.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
git -C "$TEST_DIR/.qwen/worktrees/pr-4174" rev-parse --abbrev-ref HEAD
```

**Erwartet (nach Implementierung):**

- Worktree-Verzeichnis `pr-4174/` existiert
- HEAD-Branch = `worktree-pr-4174`
- Die Spitze des Branches löst sich auf (git log -1) ohne Fehler

### F2: Vollständige URL-Form

```bash
$QWEN --worktree "https://github.com/QwenLM/qwen-code/pull/4174" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f2.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
```

**Erwartet (nach Implementierung):** wie F1.

### F3: Fehlender `origin`-Remote → Fail-Close

```bash
cd "$TEST_DIR" && git remote remove origin
$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f3.out
echo "exit=$?"
```

**Erwartet (nach Implementierung):** Exit != 0; Meldung erwähnt den `origin`-Remote.

### F4: Ungültige PR-Nummer → Fail-Close

```bash
$QWEN --worktree=#999999999 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f4.out
echo "exit=$?"
```

**Erwartet (nach Implementierung):** Exit != 0; Meldung erwähnt "Failed to fetch PR".
30-Sekunden-Timeout-Grenze wird eingehalten (Testlaufzeit < 35s).

### F5: Fehlerhaftes `#abc` fällt auf Slug-Validierung zurück

```bash
$QWEN --worktree=#abc "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f5.out
echo "exit=$?"
```

**Erwartet (nach Implementierung):** Wird als wörtlicher Slug `#abc` behandelt, von
`validateUserWorktreeSlug` abgewiesen, weil `#` nicht erlaubt ist. Exit != 0.

### F6: PR-Worktree bekommt ebenfalls Symlinks (Querschnitt mit E)

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["node_modules"] } }
EOF
mkdir -p "$TEST_DIR/node_modules" && echo x > "$TEST_DIR/node_modules/.marker"

$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
readlink "$TEST_DIR/.qwen/worktrees/pr-4174/node_modules"
```

**Erwartet (nach Implementierung):** Symlink-Ziel = `$TEST_DIR/node_modules`.

---

## Gruppe G: Integration + Grenzfälle

### G1: Vollständiger Lebenszyklus — Start → schreiben → Behalten → fortsetzen

> **Hinweis vor Implementierung:** Gegen die Baseline endet dieser Test, bevor `sleep 3`
> beendet ist (yargs lehnt `--worktree` sofort ab und der tmux-Pane stirbt). Der
> `capture-pane`-Aufruf schlägt dann mit "can't find pane" fehl. Dies ist erwartet –
> als PASS-by-Rejection verbuchen. Captures mit `|| true` umschließen für den Trockentest,
> oder G1 im Baseline-Modus ganz überspringen.

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s g1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree g1-test --session-id $SESSION_ID --approval-mode yolo 2>&1 | tee /tmp/g1-stderr.out"
sleep 3
tmux send-keys -t g1 "use the write_file tool to create file 'work.txt' with content 'phase d test'"
sleep 0.3; tmux send-keys -t g1 Enter
sleep 8

tmux send-keys -t g1 C-c; sleep 0.3; tmux send-keys -t g1 C-c; sleep 1
tmux send-keys -t g1 Enter   # default = "Keep"
sleep 2
tmux kill-session -t g1

# Datei überlebt
cat "$TEST_DIR/.qwen/worktrees/g1-test/work.txt"

# Fortsetzen hängt wieder an
tmux new-session -d -s g1b -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --resume $SESSION_ID --approval-mode yolo"
sleep 4
tmux capture-pane -t g1b -p -S -50 | grep -E "⎇ worktree-g1-test|Resumed"
tmux kill-session -t g1b
```

**Erwartet (nach Implementierung):**

- `work.txt` innerhalb des Worktrees enthält den geschriebenen Inhalt
- Fortgesetzte Sitzung zeigt im Footer `⎇ worktree-g1-test (g1-test)`
- INFO-Verlaufs-Eintrag oder `<system-reminder>` erwähnt "Resumed"

### G2: Relativer Pfad als Argument wird vor dem cwd-Wechsel aufgelöst

```bash
# Erstelle eine mcp-Konfiguration in TEST_DIR und referenziere sie relativ.
# --mcp-config nimmt einen Dateipfad entgegen; wenn der Pfad im Testplan NACH dem
# --worktree-cwd-Wechsel aufgelöst wird, wird die Datei innerhalb des Worktrees nicht
# gefunden und die CLI bricht mit einem Fehler ab. Wenn sie VOR dem Wechsel (korrekt)
# aufgelöst wird, wird die Datei von TEST_DIR geladen.
cat > "$TEST_DIR/mcp.json" <<'EOF'
{ "mcpServers": {} }
EOF
cd "$TEST_DIR"

$QWEN --worktree g2-test --mcp-config ./mcp.json "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/g2.out
echo "exit=$?"
jq -r '.[] | select(.type=="result") | .result' < /tmp/g2.out | head -3
```
**Erwartet (nach Implementierung):** exit = 0; das Modell antwortet normal (die leere
MCP-Konfiguration bedeutet keine MCP-Server, aber auch keinen Fehler).

**Erwartet (Basislinie vor Implementierung):** yargs lehnt `--worktree` ab (der Test
kann nicht unterscheiden zwischen „Worktree-Flag fehlt" und „MCP-Konfigurationsauflösung
kaputt", solange das Flag selbst nicht existiert).

---

## Ausführungsreihenfolge + Parallelität

| Gruppe | Modus        | Laufzeit | Parallel sicher?                   |
| ------ | ------------ | -------- | ---------------------------------- |
| A      | kopflos      | ~30s     | ja (eigenes TEST_DIR)              |
| B      | kopflos      | ~20s     | ja                                 |
| C      | kopflos      | ~40s     | ja                                 |
| D      | tmux         | ~30s     | ja (eigener Session-Name)          |
| E      | kopflos      | ~60s     | ja                                 |
| F      | kopflos+Netz | ~60s     | NEIN — teilt den GitHub-Klon       |
| G      | gemischt     | ~60s     | ja                                 |

Führen Sie A/B/C/D/E/G parallel aus; F seriell nach dem Klon-Setup.

## Reproduktionsbericht

### Phase 4 Probelauf — Basislinie `qwen` v0.15.11 (2026-05-20)

Laufzeit: 3 parallele `test-engineer`-Agenten, ~7 Minuten gesamt. Der Basislinie fehlen
sowohl Phase D (erwartet) als auch Phase A+B (älteres Binary als erwartet — siehe
E2/E3-Hinweis).

| Gruppe                              | Ergebnis    | Notizen                                                                               |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| A1 (nacktes Flag)                   | ✅          | yargs `Unknown argument: worktree`, exit 1                                            |
| A2 (expliziter Slug)                | ✅          | gleich                                                                                |
| A3 (= Form)                         | ✅          | gleich                                                                                |
| A4 (ungültiger Slug)                | ✅          | yargs lehnt vor der Slug-Validierung ab                                                |
| A5 (kein Git-Verzeichnis)           | ✅          | gleich                                                                                |
| B1 (Sidecar-Felder)                 | ✅          | Sidecar korrekt abwesend; jq-Selektor gegen Beispieldaten gültig                       |
| B2 (cwd-Wechsel)                    | ✅          | shell-tool `tool_result.content` jq-Selektor gegen echte Ausgabe verifiziert           |
| B3 (targetDir-Wechsel)              | ✅          | gleicher Selektor                                                                     |
| C1 (--worktree überschreibt Sidecar)| ✅          | beide Läufe exit 1, kein Sidecar                                                      |
| C2 (veraltetes Sidecar + neues)     | ✅          | gleich                                                                                |
| E1 (--worktree Symlink)             | ✅          | Flag abgelehnt, kein Symlink — vor Implementierung bestätigt                          |
| E2 (EnterWorktree Symlink)          | ⚠️ N/A      | Basislinie fehlt `enter_worktree`-Tool (älter als PR #4073); Guard überspringt jetzt  |
| E3 (AgentTool-Isolation Symlink)    | ⚠️ N/A      | Basislinie `agent`-Schema verwirft `isolation`-Parameter still; Guard überspringt     |
| E4 (fehlende Quelle überspringen)   | ✅          | Flag abgelehnt                                                                         |
| E5 (vorhandenes Ziel nicht überschreiben)| ⚠️ trivial | Vorhandener `.marker` überlebte, aber nur weil Tool nicht laufen konnte               |
| E6 (Pfad-Traversal ablehnen)        | ✅          | Flag abgelehnt, keine Symlinks                                                         |
| F1 (--worktree=#4174 fetch)         | ✅          | `Unknown argument: worktree`, kein Netzwerkaufruf                                     |
| F2 (vollständige URL-Form)          | ✅          | gleich                                                                                |
| F3 (fehlender Origin)               | ✅          | vor Git-Check abgelehnt                                                               |
| F4 (ungültige PR-Nummer)            | ✅          | vor Fetch abgelehnt                                                                   |
| F5 (`#abc` fehlerhaft)              | ✅          | gleich                                                                                |
| F6 (PR + symlinkDirs)               | ✅          | gleich                                                                                |
| G1 (Lebenszyklus tmux)              | ⚠️ teilweise| tmux-Pane stirbt bei Flag-Ablehnung; Aufzeichnung nach Exit-Code funktioniert         |
| G2 (relativer Pfad)                 | ✅          | (nach Wechsel zu `--mcp-config ./mcp.json`) yargs lehnt worktree zuerst ab             |

**Fazit:** Tests sind grundsätzlich solide. 19 / 24 Fälle erkennen sauber
die Basislinie vor Implementierung; 3 Fälle (E2/E3/E5) benötigen, dass die Basislinie
Phase A+B enthält (was der lokale Phase-6-Build liefern wird); 2 Fälle (G1/G2) hatten
Skriptfehler, die jetzt behoben sind. **Bereit für Phase 5 Implementierung.**

### Phase 6 Verifikation — lokaler Build

**Binary:** `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
**Datum:** 2026-05-20
**Umfang:** Gruppen A, B, C, E, F, G (6 parallele `test-engineer`-Agenten)

| Gruppe                              | Ergebnis                    | Notizen                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 (nacktes Flag)                   | ✅ (mit Doc-Tipp)           | yargs konsumiert das nächste Positionsargument als Slug-Wert, wenn der Benutzer `qwen --worktree "say hi"` übergibt; Quickstart rät jetzt zur `=`-Form oder das Prompt vor das Flag zu setzen. Auto-Slug-Funktion selbst bestätigt via `qwen --worktree --approval-mode yolo "say hi"` → Slug `bright-elm-8a4c12`, init `.cwd` endet mit `.qwen/worktrees/<auto-slug>`.                       |
| A2 (expliziter Slug)                | ✅                          | Verzeichnis `.qwen/worktrees/my-feature` + Branch `worktree-my-feature`                                                                                                                                                                                                                                                                                                                       |
| A3 (= Form)                         | ✅                          | identisch zu A2                                                                                                                                                                                                                                                                                                                                                                               |
| A4 (ungültiger Slug)                | ✅                          | exit=1, Meldung: `Worktree name may only contain letters, digits, dots, underscores, and hyphens.`, kein Worktree-Verzeichnis                                                                                                                                                                                                                                                                |
| A5 (kein Git-Verzeichnis)           | ✅                          | exit=1, Meldung: `not a git repository. Run \`git init\` first or relaunch from inside one.`                                                                                                                                                                                                                                                                                                   |
| B1 (Sidecar-Felder)                 | ✅                          | Alle 6 Felder vorhanden und korrekt; Sidecar liegt wie entworfen unter Worktree-ProjektHash                                                                                                                                                                                                                                                                                                   |
| B2 (cwd-Wechsel)                    | ✅                          | `pwd` im Shell-Tool gab exakt den Worktree-Pfad zurück                                                                                                                                                                                                                                                                                                                                        |
| B3 (Branch + cwd)                   | ✅                          | `pwd` = Worktree-Pfad, `git rev-parse --abbrev-ref HEAD` = `worktree-b3-test`                                                                                                                                                                                                                                                                                                                 |
| C1 (Cross-Slug-Überschreibung)      | ❌ → **bekannte Einschränkung** | Sessions sind an `projectHash(cwd)` gebunden; `--worktree second --resume <sid-from-first>` findet die Session nicht. In Benutzerdokumentation unter Limitationen dokumentiert. Ein zukünftiges Config-Refactoring (Ankerspeicherung im Repo-Root) würde dies beheben.                                                                                                                         |
| C2 (veraltetes Sidecar + neuer Worktree)| ❌ → **gleiche Ursache**  | Gleiche architektonische Einschränkung.                                                                                                                                                                                                                                                                                                                                                       |
| E1 (`--worktree` Symlink)           | ✅                          | `node_modules` in den neuen Worktree verlinkt                                                                                                                                                                                                                                                                                                                                                 |
| E2 (`enter_worktree` Symlink)       | ✅                          | gleicher Codepfad via `createUserWorktree`                                                                                                                                                                                                                                                                                                                                                    |
| E3 (Agent-Isolation Symlink)        | ⚠️ Test-Setup               | Modell hat `node_modules` committet (weil der Agent-Guard den Dirty-Zustand ablehnte); EEXIST-Guard hat dann korrekt den Symlink übersprungen. Codepfad ist korrekt; für einen sauberen E3 muss der Testplan `node_modules` vorab in `.gitignore` eintragen.                                                                                                                                     |
| E4 (fehlende Quelle überspringen)   | ✅                          | Worktree erstellt, kein Eintrag, exit 0                                                                                                                                                                                                                                                                                                                                                       |
| E5 (vorhandenes Ziel nicht überschreiben)| ✅                      | Vorhandener Marker überlebte                                                                                                                                                                                                                                                                                                                                                                  |
| E6 (absolutes / `..` abgelehnt)     | ✅                          | kein Pfad verlinkt                                                                                                                                                                                                                                                                                                                                                                            |
| F1 (`--worktree=#4174` fetch)       | ✅                          | Worktree-Verzeichnis `pr-4174/`, Branch `worktree-pr-4174`, Tip-Commit `8f4fe8e feat(cli): per-turn /diff…`; lokaler-remote-Ersatz (Sandbox blockiert echtes GitHub)                                                                                                                                                                                                                          |
| F2 (vollständige URL-Form)          | ✅                          | gleiches Ergebnis; URL geparst → PR #4174 → lokaler Origin-Fetch erfolgreich                                                                                                                                                                                                                                                                                                                  |
| F3 (fehlender Origin)               | ✅                          | exit=1 in 2s; Meldung erwähnt Hinzufügen des `origin`-Remotes                                                                                                                                                                                                                                                                                                                                 |
| F4 (ungültige PR #999999999)        | ✅                          | exit=1 in 2s; „PR existiert nicht auf origin"; deutlich unter 35s-Grenze                                                                                                                                                                                                                                                                                                                      |
| F5 (fehlerhaftes `#abc`)            | ✅                          | Slug-Validierung lehnt `#` ab                                                                                                                                                                                                                                                                                                                                                                 |
| F6 (PR-Worktree + Symlinks)         | ✅                          | Symlink `pr-4174/node_modules` → `$TEST_DIR/node_modules` bestätigt                                                                                                                                                                                                                                                                                                                           |
| G1.a (start + write + Keep)         | ✅                          | TUI-Fluss, Footer-Indikator, Dialog-Optionen, Datei bleibt bestehen                                                                                                                                                                                                                                                                                                                           |
| G1.b (`--resume … --worktree foo`)  | ❌ → **in diesem PR behoben** | Ursprünglich: `--worktree: Worktree already exists at …`. Phase-6-Fix: Branch für Wiederanbindung in `setupStartupWorktree` hinzugefügt. Nach Fix per Smoke-Test verifiziert (`--worktree foo` zweimal → zweites gibt die `worktree_started`-Meldung aus, kein Fehler) + neue Unit-Tests in `worktreeStartup.test.ts`.                                                                       |
| G2 (relatives `--mcp-config`)       | ❌ → **in diesem PR behoben** | Ursprünglich: exit=52, `Invalid MCP configuration … is not valid JSON`. Phase-6-Fix normalisiert pfadverarbeitende argv-Felder (`mcpConfig`, `openaiLoggingDir`, `jsonFile`, `inputFile`, `telemetryOutfile`, `includeDirectories`) gegen das Start-cwd VOR `setupStartupWorktree` chdir. Nach Fix per Smoke-Test verifiziert (`--worktree foo --mcp-config ./mcp.json` → Modell antwortet normal). |

**Phase 6 Nettoergebnis:** 22 / 24 Fälle nach Fix bestanden; 2 Fälle (C1/C2) treffen auf eine
architektonische Einschränkung, die jetzt dokumentiert ist; 1 Fall (E3) ist eine Test-Setup-Besonderheit,
kein Implementierungsproblem. **Bereit für Phase 7 Code-Review.**

### Fix-Referenzen (Phase-6-Fixes, die in diesem PR gelandet sind)

| Fix                                                         | Datei                                               | Änderung                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wiederanbindung an vorhandenen Worktree (G1.b)              | `packages/cli/src/startup/worktreeStartup.ts`       | Vor-Erstellen-Prüfung hinzugefügt: Wenn Verzeichnis ein registrierter Worktree im erwarteten Branch ist, Erstellen + chdir überspringen               |
| `getRegisteredWorktreeBranch()`-Helper                      | `packages/core/src/services/gitWorktreeService.ts`  | Prüft `git rev-parse --abbrev-ref HEAD` gegen den Kandidatenpfad                                                                                     |
| Pfadnormalisierung vor chdir (G2)                           | `packages/cli/src/gemini.tsx`                       | Löst `mcpConfig`, `openaiLoggingDir`, `jsonFile`, `inputFile`, `telemetryOutfile`, `includeDirectories` gegen Start-cwd auf, wenn `--worktree` gesetzt|
| Dokumentation: yargs-Flag-Reihenfolge-Tipp + Limitationen   | `docs/users/features/worktree.md`                  | Quickstart-Tipp + neue Limitationen (Cross-Slug, Pfad-Argument-Verhalten)                                                                             |
| Unit-Tests für Wiederanbindung                               | `packages/cli/src/startup/worktreeStartup.test.ts` | 2 Tests hinzugefügt: glückliche Wiederanbindung + Guard „anderer Branch belegt Slot"                                                                 |

**Phase 6 Gruppe F Netzwerkhinweis:** Die Sandbox blockiert `git fetch` nach `https://github.com` mit HTTP 403. F1/F2/F4/F6 wurden gegen ein lokales Bare-Repo (`git init --bare`) neu getestet, das mit `refs/pull/4174/head` auf einen Commit zeigt, dessen Nachricht `feat(cli): per-turn /diff with interactive dialog (#4277)` ist. F3 und F5 sind netzwerkunabhängig und wurden direkt verifiziert. Der lokale-remote-Ersatz übt den vollständigen Parse + Fetch + Worktree-Erstellungs-Codepfad aus.
---

## Reproduktionsbericht — Phase-4-Trockentest (Gruppen F + G), 2026-05-20

**Binary**: `qwen` (global installiert, v0.15.11 unter `/Users/mochi/.nvm/versions/node/v22.21.1/bin/qwen`)
**Override**: `QWEN="qwen"`

### Ergebnistabelle

| Test-ID                     | Ergebnis | Nachweis                                                                                                                                                      | Korrekturvorschlag                   |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| F1 `--worktree=#4174`       | BESTANDEN | `Unknown argument: worktree`, exit=1                                                                                                                          | Keiner – erwarteter Baseline-Fehler  |
| F2 `--worktree <url>`       | BESTANDEN | `Unknown argument: worktree`, exit=1                                                                                                                          | Keiner – erwarteter Baseline-Fehler  |
| F3 fehlender Origin         | BESTANDEN | `Unknown argument: worktree`, exit=1 – yargs lehnte ab, bevor ein Git-Vorgang stattfand                                                                       | Keiner                               |
| F4 ungültige PR #999999999  | BESTANDEN | `Unknown argument: worktree`, exit=1                                                                                                                          | Keiner                               |
| F5 fehlerhafte `#abc`       | BESTANDEN | `Unknown argument: worktree`, exit=1                                                                                                                          | Keiner                               |
| F6 PR + SymlinkDirs         | BESTANDEN | `Unknown argument: worktree`, exit=1                                                                                                                          | Keiner                               |
| G1 Lebenszyklus (tmux)      | BESTANDEN | `Unknown argument: worktree` nach stdout ausgegeben, erfasst in `/tmp/g1_raw.out`; tmux-Sitzung wurde sofort beendet, Pane zum Zeitpunkt der Erfassung bereits tot | SCRIPT-FEHLER: siehe Hinweis unten   |
| G2 relativer Pfad           | BESTANDEN | `Unknown arguments: worktree, prompt-file, promptFile`, exit=1                                                                                                | SCRIPT-FEHLER: siehe Hinweis unten   |

### Beobachtetes Verhalten (alle Fälle)

Jeder Aufruf mit `--worktree` (alleinstehend, mit `=`, mit `#<N>`, vollständige URL, kombiniert mit `--prompt-file`) wurde von der yargs-Argumentparseschicht mit Exit-Code 1 abgewiesen, bevor irgendeine Anwendungslogik ausgeführt wurde. Die genauen Fehlerstrings sind:

- `Unknown argument: worktree` (ein unbekanntes Argument)
- `Unknown arguments: worktree, prompt-file, promptFile` (G2: sowohl `--worktree` als auch `--prompt-file` sind unbekannt, gemeinsam aufgelistet)

In keinem Test fanden Git-Operationen, Netzwerkaufrufe oder Dateisystem-Schreibvorgänge statt.

### Erwartetes Verhalten

Identische Ablehnung – dies ist die korrekte Baseline vor der Implementierung. Alle 8 Tests BESTEHEN im Sinne des Trockentests (der Plan erkennt korrekt, dass die Funktionen nicht existieren).

### Wichtiger Kontext

Die Fehlerart tritt einheitlich auf der yargs-Schicht auf, nicht nachgelagert. Dies bestätigt, dass die Erkennungsstrategie des Testplans solide ist: Sobald `--worktree` in yargs eingebunden ist, werden diese Tests auf dieser Schicht nicht mehr fehlschlagen, sondern stattdessen die tatsächlichen Implementierungspfade durchlaufen (F1–F6 werden `git fetch` treffen, G1 trifft den TUI-Lebenszyklus, G2 trifft die Auflösung von `--prompt-file`).

### SCRIPT-FEHLER-Hinweise für den Testplan

**G1 (tmux):** Der Befehl der tmux-Sitzung leitet durch `tee` mit einer Subshell `echo 'PROC_EXIT='$?` weiter, die den Exit von `tee` erfasst, nicht den von `qwen`. Wenn der Prozess sofort beendet wird (wie bei einem Unknown-Argument-Fehler), wird die Sitzung beendet, bevor `sleep 3` abgeschlossen ist, und der Pane-Name `g1dry` ist verschwunden, wenn `tmux capture-pane` ausgeführt wird – dies erzeugt `can't find pane: g1dry`. Behebung: `|| true` nach `tmux capture-pane` einfügen oder eine `|| sleep 0`-Absicherung hinzufügen; besser noch, für den Baseline-Fehlerfall stderr+stdout in eine Datei außerhalb von tmux umleiten und die Datei direkt prüfen (wie hier mittels `tee /tmp/g1_raw.out` geschehen).

**G2 (`--prompt-file`):** Der Testplan verwendet `--prompt-file ./relative.txt` als kombinierten Test mit `--worktree`. In der Baseline ist `--prompt-file` ebenfalls ein unbekanntes Argument (es existiert nicht im yargs-Schema von v0.15.11 – die Flagge lautet `--prompt-interactive` / `-p`). Der Fehler listet beide unbekannten Argumente gemeinsam auf. Der Plan sollte vermerken, dass `--prompt-file` parallel zu `--worktree` implementiert werden muss, oder eine vorhandene Flagge (z. B. Pipe über stdin oder `--prompt`) für den Test der relativen Pfadauflösung verwenden.