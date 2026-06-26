# План E2E-тестирования фазы C Worktree

## Область проверки

Сквозная верификация функций фазы C для локальной сборки в
`/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`.

Фаза C включает:

- **Задачи 1, 3, 4** — JSON-файл `WorktreeSession` (sidecar) по пути
  `~/.qwen/tmp/<projectHash>/chats/<sessionId>.worktree.json`
- **Задача 2** — `core.hooksPath`, настроенный внутри новых worktree
- **Задачи 5–6** — хук `useWorktreeSession`, `UIState.activeWorktree`, индикатор worktree в Footer, поле `StatusLineCommandInput.worktree`
- **Задача 7** — `--resume` добавляет элемент истории типа INFO, если активный worktree всё ещё существует; в противном случае удаляет устаревший sidecar
- **Задача 8** — `WorktreeExitDialog` с проверкой на несохранённые изменения, перехватывает второе нажатие Ctrl+C в активном worktree

## Исполняемые файлы

- **Локальная сборка**: `node /Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`
- **Базовая версия (для сравнения до реализации, если потребуется)**: глобально установленный `qwen`

## Шаблон тестового окружения

Каждая группа выполняется в собственном временном git-репозитории и сессии tmux:

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phc-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # resolve symlinks (macOS /var → /private/var)
cd "$TEST_DIR"
git init -q -b main
git config user.email t@e.com
git config user.name t
git config commit.gpgsign false
echo "hello" > README.md
git add README.md
git commit -q -m "initial" --no-verify
```

`QWEN=/Users/mochi/code/qwen-code/.claude/worktrees/romantic-burnell-b6e48c/dist/cli.js`

---

## Группа A: Sidecar WorktreeSession (headless)

**Режим:** headless, `--approval-mode yolo`, `--output-format json`

### A1: enter_worktree создаёт sidecar со всеми полями

**Шаги:**

```bash
SESSION=$(node $QWEN "use the enter_worktree tool with name='a1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# Verify all fields present
cat "$SIDECAR" | jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit'
```

**Ожидаемый результат:**

- `slug` = "a1-test"
- `worktreePath` заканчивается на `.qwen/worktrees/a1-test`
- `worktreeBranch` = "worktree-a1-test"
- `originalCwd` = `$TEST_DIR` (разрешённый)
- `originalBranch` = "main"
- `originalHeadCommit` соответствует `[0-9a-f]{40}`

### A2: exit_worktree (keep) удаляет sidecar

**Шаги:**

```bash
SESSION=$(node $QWEN "create a worktree named 'a2-test' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS: sidecar removed" || echo "FAIL: sidecar still exists"
```

**Ожидаемый результат:** после вызова exit_worktree файл sidecar отсутствует.

### A3: exit_worktree (remove) удаляет sidecar

**Шаги:**

```bash
SESSION=$(node $QWEN "create a worktree named 'a3-test' using enter_worktree, then immediately exit it with action='remove' and discard_changes=true using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json
test ! -f "$SIDECAR" && echo "PASS: sidecar removed" || echo "FAIL: sidecar still exists"
# Also verify the worktree dir is gone
test ! -d "$TEST_DIR/.qwen/worktrees/a3-test" && echo "PASS: worktree dir removed"
```

**Ожидаемый результат:** удалены и sidecar, и каталог worktree.

---

## Группа B: Настройка hooksPath (headless)

### B1: Без `.husky/`, hooksPath = `<repo>/.git/hooks`

**Шаги:**

```bash
node $QWEN "use enter_worktree with name='b1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b1-test" config --local core.hooksPath)
echo "Got hooksPath: $HOOKS_PATH"
test "$HOOKS_PATH" = "$TEST_DIR/.git/hooks" && echo "PASS" || echo "FAIL"
```

**Ожидаемый результат:** `$TEST_DIR/.git/hooks`

### B2: С `.husky/`, hooksPath = `<repo>/.husky`

**Шаги:**

```bash
mkdir -p "$TEST_DIR/.husky"
echo '#!/bin/sh' > "$TEST_DIR/.husky/pre-commit"
chmod +x "$TEST_DIR/.husky/pre-commit"

node $QWEN "use enter_worktree with name='b2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

HOOKS_PATH=$(git -C "$TEST_DIR/.qwen/worktrees/b2-test" config --local core.hooksPath)
test "$HOOKS_PATH" = "$TEST_DIR/.husky" && echo "PASS" || echo "FAIL got=$HOOKS_PATH"
```

**Ожидаемый результат:** `$TEST_DIR/.husky`

### B3: Хуки из основного репозитория срабатывают изнутри worktree

**Шаги:**

```bash
# Set up a hook that writes a marker file
mkdir -p "$TEST_DIR/.git/hooks"
cat > "$TEST_DIR/.git/hooks/pre-commit" <<'EOF'
#!/bin/sh
echo "hook-fired" > /tmp/qwen-wt-hook-marker
EOF
chmod +x "$TEST_DIR/.git/hooks/pre-commit"

node $QWEN "use enter_worktree with name='b3-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

# Commit something inside the worktree
WT="$TEST_DIR/.qwen/worktrees/b3-test"
echo "x" > "$WT/file.txt"
git -C "$WT" add file.txt
rm -f /tmp/qwen-wt-hook-marker
git -C "$WT" commit -m "trigger hook" 2>&1
test -f /tmp/qwen-wt-hook-marker && echo "PASS: hook fired" || echo "FAIL: hook did not fire"
rm -f /tmp/qwen-wt-hook-marker
```

**Ожидаемый результат:** после коммита файл `/tmp/qwen-wt-hook-marker` существует.

---

## Группа C: --resume восстановление worktree (headless)

### C1: --resume добавляет контекст worktree, если sidecar существует и каталог жив

**Шаги:**

```bash
# Create initial session with worktree
INIT_OUT=$(node $QWEN "use enter_worktree with name='c1-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)

# Resume the session and ask "what's my context?"
RESUMED=$(node $QWEN --resume "$SESSION" "say SIDECAR-CONFIRM" \
  --approval-mode yolo --output-format json 2>/dev/null)

# Look for the injected INFO message text in the conversation
echo "$RESUMED" | grep -q "Resumed.*Active worktree.*c1-test" && echo "PASS" || echo "FAIL: no context injection"
```

**Ожидаемый результат:** JSON-поток содержит сообщение INFO, ссылающееся на `c1-test`.

### C2: --resume удаляет устаревший sidecar, если каталог worktree удалён

**Шаги:**

```bash
INIT_OUT=$(node $QWEN "use enter_worktree with name='c2-test' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null)
SESSION=$(echo "$INIT_OUT" | jq -r '.[] | select(.type=="system") | .session_id' | head -1)
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION.worktree.json

# Delete the worktree directory out-of-band
rm -rf "$TEST_DIR/.qwen/worktrees/c2-test"
test -f "$SIDECAR" || { echo "SKIP: sidecar was already gone"; exit 0; }

# Resume — should clean up the stale sidecar
node $QWEN --resume "$SESSION" "hello" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
test ! -f "$SIDECAR" && echo "PASS: stale sidecar cleaned" || echo "FAIL: stale sidecar still present"
```

**Ожидаемый результат:** файл sidecar удалён.

---

## Группа D: Индикатор worktree в Footer (интерактивный tmux)

### D1: Footer показывает индикатор worktree после enter_worktree

**Шаги:**

```bash
tmux new-session -d -s wt-d1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d1 "use enter_worktree with name='d1-test'"
sleep 0.5
tmux send-keys -t wt-d1 Enter

for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-d1 -p | grep -q "Type your message" && break
done

# Capture and look for the worktree indicator line in Footer area
tmux capture-pane -t wt-d1 -p -S -100 > /tmp/wt-d1.out
grep -E "⎇.*worktree-d1-test.*\(d1-test\)" /tmp/wt-d1.out && echo "PASS" || \
  { echo "FAIL — captured output:"; cat /tmp/wt-d1.out; }
tmux kill-session -t wt-d1
```

**Ожидаемый результат:** Footer содержит строку вида `⎇ worktree-d1-test (d1-test)`.

### D2: Индикатор в Footer исчезает после exit_worktree (keep)

**Шаги:**

```bash
tmux new-session -d -s wt-d2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-d2 "use enter_worktree with name='d2-test'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Type your message" && break; done

# Verify indicator showed
tmux capture-pane -t wt-d2 -p -S -100 | grep -q "⎇.*d2-test" || { echo "FAIL: indicator missing before exit"; tmux kill-session -t wt-d2; exit 1; }

# Exit the worktree (keep)
tmux send-keys -t wt-d2 "use exit_worktree with name='d2-test' action='keep'"
sleep 0.5
tmux send-keys -t wt-d2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-d2 -p | grep -q "Kept worktree" && break; done

sleep 2  # give Footer a tick to refresh after sidecar removal
tmux capture-pane -t wt-d2 -p -S -100 > /tmp/wt-d2-after.out
# After exit, the indicator should be gone from the bottom panel area
tail -5 /tmp/wt-d2-after.out | grep -q "⎇.*d2-test" && \
  echo "FAIL: indicator still showing" || echo "PASS"
tmux kill-session -t wt-d2
```

**Ожидаемый результат:** индикатор worktree исчезает из Footer в течение ~2 секунд после `exit_worktree`.

---

## Группа E: WorktreeExitDialog (интерактивный tmux)

### E1: Второе Ctrl+C в worktree показывает диалог вместо выхода

**Шаги:**

```bash
tmux new-session -d -s wt-e1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e1 "use enter_worktree with name='e1-test'"
sleep 0.5
tmux send-keys -t wt-e1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e1 -p | grep -q "Type your message" && break; done

# First Ctrl+C (cleanup; should show "Press Ctrl+C again to exit")
tmux send-keys -t wt-e1 C-c
sleep 0.3
tmux capture-pane -t wt-e1 -p | grep -q "Press Ctrl+C again" || \
  { echo "FAIL: first Ctrl+C didn't show warning"; tmux kill-session -t wt-e1; exit 1; }

# Second Ctrl+C — should show the WorktreeExitDialog, NOT quit
tmux send-keys -t wt-e1 C-c
sleep 2

# Verify the dialog rendered
tmux capture-pane -t wt-e1 -p -S -50 > /tmp/wt-e1.out
grep -q "Active worktree.*e1-test" /tmp/wt-e1.out && \
  grep -q "Keep worktree" /tmp/wt-e1.out && \
  grep -q "Remove worktree" /tmp/wt-e1.out && \
  echo "PASS" || { echo "FAIL — captured:"; cat /tmp/wt-e1.out; }
tmux kill-session -t wt-e1
```

**Ожидаемый результат:** диалог показывает три варианта (Keep / Remove / Cancel), и процесс всё ещё жив.

### E2: Диалог показывает счётчики несохранённых изменений (коммиты + файлы)

**Шаги:**

```bash
tmux new-session -d -s wt-e2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e2 "use enter_worktree with name='e2-test'"
sleep 0.5
tmux send-keys -t wt-e2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e2 -p | grep -q "Type your message" && break; done

# Make the worktree dirty: 1 new commit + 1 uncommitted file
WT="$TEST_DIR/.qwen/worktrees/e2-test"
echo "new" > "$WT/new.txt"
git -C "$WT" add new.txt
git -C "$WT" commit -q -m "test commit" --no-verify
echo "dirty" > "$WT/uncommitted.txt"

# Trigger exit dialog via Ctrl+C double-press
tmux send-keys -t wt-e2 C-c
sleep 0.3
tmux send-keys -t wt-e2 C-c
sleep 3   # allow time for git status / rev-list

tmux capture-pane -t wt-e2 -p -S -50 > /tmp/wt-e2.out
grep -qE "new commit|uncommitted file" /tmp/wt-e2.out && echo "PASS" || \
  { echo "FAIL — captured:"; cat /tmp/wt-e2.out; }
tmux kill-session -t wt-e2
```

**Ожидаемый результат:** тело диалога содержит и "X new commit(s)", и "Y uncommitted file(s)".

### E3: Отмена (Cancel) закрывает диалог без выхода

**Шаги:**

```bash
tmux new-session -d -s wt-e3 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e3 "use enter_worktree with name='e3-test'"
sleep 0.5
tmux send-keys -t wt-e3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && break; done

# Trigger dialog
tmux send-keys -t wt-e3 C-c
sleep 0.3
tmux send-keys -t wt-e3 C-c
sleep 3

# Navigate to Cancel (DOWN DOWN) and press Enter
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Down
sleep 0.2
tmux send-keys -t wt-e3 Enter
sleep 2

# Dialog should be gone; input prompt should be back
tmux capture-pane -t wt-e3 -p | grep -q "Type your message" && echo "PASS" || \
  { echo "FAIL — captured:"; tmux capture-pane -t wt-e3 -p; }

# Verify the worktree was NOT removed
test -d "$TEST_DIR/.qwen/worktrees/e3-test" && echo "worktree intact" || echo "FAIL: worktree gone"
tmux kill-session -t wt-e3
```

**Ожидаемый результат:** диалог закрывается, приглашение ввода возвращается, каталог worktree всё ещё существует.

### E4: Keep завершает сессию, но сохраняет worktree

**Шаги:**

```bash
tmux new-session -d -s wt-e4 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e4 "use enter_worktree with name='e4-test'"
sleep 0.5
tmux send-keys -t wt-e4 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e4 -p | grep -q "Type your message" && break; done

# Trigger dialog and pick Keep (first option, already selected)
tmux send-keys -t wt-e4 C-c
sleep 0.3
tmux send-keys -t wt-e4 C-c
sleep 3
tmux send-keys -t wt-e4 Enter

# Wait for process to exit
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e4 2>/dev/null || break
  tmux capture-pane -t wt-e4 -p | grep -q "\$ " && break  # shell prompt back
done

# Worktree directory should still exist
test -d "$TEST_DIR/.qwen/worktrees/e4-test" && echo "PASS: worktree preserved" || \
  echo "FAIL: worktree was removed"
tmux kill-session -t wt-e4 2>/dev/null || true
```

**Ожидаемый результат:** процесс завершается, каталог worktree остаётся на диске.

### E5: Remove завершает сессию и удаляет worktree

**Шаги:**

```bash
tmux new-session -d -s wt-e5 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

tmux send-keys -t wt-e5 "use enter_worktree with name='e5-test'"
sleep 0.5
tmux send-keys -t wt-e5 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-e5 -p | grep -q "Type your message" && break; done

# Trigger dialog and pick Remove (DOWN, Enter)
tmux send-keys -t wt-e5 C-c
sleep 0.3
tmux send-keys -t wt-e5 C-c
sleep 3
tmux send-keys -t wt-e5 Down
sleep 0.2
tmux send-keys -t wt-e5 Enter

# Wait for exit
for i in $(seq 1 20); do
  sleep 1
  tmux has-session -t wt-e5 2>/dev/null || break
  tmux capture-pane -t wt-e5 -p | grep -q "\$ " && break
done

# Worktree directory should be GONE
test ! -d "$TEST_DIR/.qwen/worktrees/e5-test" && echo "PASS: worktree removed" || \
  echo "FAIL: worktree still on disk"
# Branch should also be deleted
git -C "$TEST_DIR" branch --list | grep -q "worktree-e5-test" && \
  echo "FAIL: branch still present" || echo "PASS: branch removed"
tmux kill-session -t wt-e5 2>/dev/null || true
```

**Ожидаемый результат:** процесс завершается, каталог worktree удалён, ветка `worktree-e5-test` удалена.

---

## Группа F: Имитация рабочего процесса реального пользователя (интерактивный tmux)

### F1: Полный цикл enter → edit → commit → resume → exit (keep)

**Шаги:**

```bash
tmux new-session -d -s wt-f1 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 3

# Step 1: enter worktree
tmux send-keys -t wt-f1 "use enter_worktree with name='f1-feature' to create a worktree"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Step 2: read the absolute worktree path so the model knows where to write
WT="$TEST_DIR/.qwen/worktrees/f1-feature"
tmux send-keys -t wt-f1 "write the file $WT/hello.txt with content 'hi from worktree'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 60); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Type your message" && break; done

# Verify the file was actually written INSIDE the worktree
test -f "$WT/hello.txt" && grep -q "hi from worktree" "$WT/hello.txt" && \
  echo "PASS: file written inside worktree" || echo "FAIL: file not in worktree"

# Step 3: Exit with keep via the tool
tmux send-keys -t wt-f1 "use exit_worktree with name='f1-feature' action='keep'"
sleep 0.5
tmux send-keys -t wt-f1 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f1 -p | grep -q "Kept worktree" && break; done

# Step 4: Verify worktree still on disk after exit
test -d "$WT" && echo "PASS: worktree kept" || echo "FAIL: worktree removed"
test -f "$WT/hello.txt" && echo "PASS: file persists" || echo "FAIL"

tmux kill-session -t wt-f1
```

**Ожидаемый результат:**

- Файл записан в каталог worktree (не в основной репозиторий)
- После выхода с `keep` остаются и каталог worktree, и файл

### F2: Пользовательская statusline получает полезную нагрузку `worktree`

**Шаги:**

```bash
# Create a statusline script that prints the JSON it receives via stdin
SETTINGS_DIR=~/.qwen
SETTINGS_FILE=$SETTINGS_DIR/settings.json
cp -f "$SETTINGS_FILE" /tmp/qwen-settings-backup.json 2>/dev/null || true
mkdir -p "$SETTINGS_DIR"
SL_SCRIPT=/tmp/qwen-wt-statusline.sh
cat > $SL_SCRIPT <<'EOF'
#!/bin/sh
INPUT=$(cat)
echo "$INPUT" > /tmp/qwen-wt-statusline-input.json
WT_NAME=$(echo "$INPUT" | jq -r '.worktree.name // "no-worktree"')
echo "WT=$WT_NAME"
EOF
chmod +x $SL_SCRIPT

cat > "$SETTINGS_FILE" <<EOF
{"ui":{"statusLine":{"type":"command","command":"$SL_SCRIPT"}}}
EOF

tmux new-session -d -s wt-f2 -x 200 -y 50 \
  "cd $TEST_DIR && node $QWEN --approval-mode yolo"
sleep 5  # statusline needs an extra tick

tmux send-keys -t wt-f2 "use enter_worktree with name='f2-test'"
sleep 0.5
tmux send-keys -t wt-f2 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-f2 -p | grep -q "Type your message" && break; done

sleep 3  # let statusline refresh after sidecar change

# Inspect the captured payload
cat /tmp/qwen-wt-statusline-input.json | jq '.worktree.name, .worktree.path, .worktree.branch'

# Verify built-in Footer indicator is HIDDEN when custom statusline is active
tmux capture-pane -t wt-f2 -p -S -100 > /tmp/wt-f2.out
grep -q "WT=f2-test" /tmp/wt-f2.out && echo "PASS: custom statusline rendered" || echo "FAIL"
tmux kill-session -t wt-f2

# Restore settings
cp -f /tmp/qwen-settings-backup.json "$SETTINGS_FILE" 2>/dev/null || rm -f "$SETTINGS_FILE"
```

**Ожидаемый результат:**

- `/tmp/qwen-wt-statusline-input.json` содержит `.worktree.name == "f2-test"`, `.path`, `.branch`
- Вывод пользовательской statusline `WT=f2-test` отображается в Footer
- Встроенная строка `⎇ worktree-...` НЕ отображается (подавлена пользовательской statusline)

---

## Сводка критериев прохождения

| Группа | Тест                             | Ожидаемый результат                                    |
| ------ | -------------------------------- | ------------------------------------------------------ |
| A      | A1 enter создаёт sidecar         | заполнены все 6 полей                                  |
| A      | A2 keep удаляет sidecar          | файл удалён                                             |
| A      | A3 remove удаляет sidecar        | файл + каталог удалены                                  |
| B      | B1 hooksPath fallback            | `<repo>/.git/hooks`                                    |
| B      | B2 hooksPath husky               | `<repo>/.husky`                                        |
| B      | B3 хук срабатывает в worktree    | маркерный файл записан                                  |
| C      | C1 resume добавляет контекст     | сообщение INFO присутствует                             |
| C      | C2 очистка устаревшего sidecar   | sidecar удалён                                          |
| D      | D1 footer показывает worktree    | отображается `⎇ worktree-...`                          |
| D      | D2 footer скрывается после exit  | индикатор исчезает                                      |
| E      | E1 диалог на 2-е Ctrl+C         | диалог виден, процесс жив                               |
| E      | E2 счётчики несохран. изменений | показаны коммиты + файлы                                |
| E      | E3 Cancel                        | диалог закрыт, сессия активна                           |
| E      | E4 Keep                          | сессия завершена, worktree сохранён                     |
| E      | E5 Remove                        | сессия завершена, worktree удалён                       |
| F      | F1 полный рабочий процесс        | файл в worktree, сохраняется после keep                 |
| F      | F2 пользовательская statusline   | полезная нагрузка worktree получена, footer подавлен   |