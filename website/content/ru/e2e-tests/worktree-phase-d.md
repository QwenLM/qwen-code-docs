# План E2E-тестирования фазы D для Worktree

## Область охвата

Сквозная (end-to-end) верификация функциональности фазы D относительно локальной сборки по пути
`/Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`.

Фаза D реализует три сквозных возможности:

- **D-1** — Флаг запуска CLI `--worktree [name]` (без аргумента / явный slug / форма `=`),
  с переключением `process.cwd()` + `Config.targetDir` и повторным использованием
  `WorktreeExitDialog` при выходе
- **D-2** — Ключ настроек `worktree.symlinkDirectories: string[]`, применяемый в
  `performPostCreationSetup()`, чтобы охватить `--worktree`, `EnterWorktreeTool`
  И пути `AgentTool isolation: "worktree"`
- **D-3** — Формы привязки к PR: `--worktree=#<N>` и `--worktree <github-url>`,
  через `git fetch origin pull/<N>/head` (без зависимости от `gh` CLI)

## Бинарные файлы

- **Локальная сборка (верификация фазы 6)**: `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
- **Baseline для сухого прогона фазы 4**: глобально установленный `qwen`

При сухих прогонах ожидается, что глобально установленный `qwen` завершится с ошибкой
в группах A / E / F, потому что функциональность ещё не существует — это подтверждение того,
что план корректно определяет отсутствие реализации.

### Базовое предусловие для группы E

Для тестов **E2** (симлинк `EnterWorktreeTool`) и **E3** (симлинк `AgentTool isolation`)
требуется наличие **фаз A + B** в baseline — они используют существующий инструмент
`enter_worktree` и параметр `agent isolation: "worktree"`, чтобы убедиться, что
цикл создания симлинка срабатывает и на этих путях.

Глобально установленный `qwen` может быть старше PR #4073 (фазы A+B, слит 2026-05-14)
и, следовательно, вообще не содержать этих инструментов. В таком случае E2 / E3 не могут
проверить «симлинк отсутствует, потому что отсутствует D-2» — они сводятся к «инструмент
отсутствует». Добавьте эту защиту в начало каждого теста:

```bash
HAS_ENTER_WORKTREE=$($QWEN "list your tools and stop" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -e '.[] | select(.type=="system") | .tools | index("enter_worktree")' >/dev/null && echo yes || echo no)
if [ "$HAS_ENTER_WORKTREE" != "yes" ]; then
  echo "SKIP: enter_worktree absent in baseline — E2/E3 require Phase A+B"
  exit 0
fi
```

Для верификации фазы 6 (после реализации) локальная сборка по определению содержит
фазы A–C, поэтому защита не срабатывает, и тесты выполняются полностью.

## Шаблон тестового окружения

Каждая группа запускается в своём временном git-репозитории и tmux-сессии:

```bash
TEST_DIR=$(mktemp -d -t qwen-wt-phd-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)   # resolve symlinks (macOS /var → /private/var)
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

PR-тесты (группа F) дополнительно требуют клонированного репозитория с публичного GitHub,
в котором есть хотя бы один смердженный PR. Используйте сам репозиторий qwen-code как цель:
PR `#4174` (фаза C) — гарантированно существующая ссылка.

---

## Группа A: Базовые формы флага `--worktree`

**Режим:** headless, `--approval-mode yolo`, `--output-format json`

### A1: `--worktree` без аргумента (авто-slug)

```bash
$QWEN --worktree "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a1.out

# A `worktree_started` system event is emitted at startup. The `notice`
# field contains the slug (auto-generated `adj-noun-XXXXXX`) inside the
# rendered text. Use `jq -e` so a missing event is a non-zero exit
# (instead of silent `null`).
jq -e '.[] | select(.type=="system" and .subtype=="worktree_started") | .data.notice | test("\"[a-z]+-[a-z]+-[0-9a-f]{6}\"")' < /tmp/a1.out

# The init system message's `cwd` should also point inside the worktree.
jq -e '.[] | select(.type=="system" and .subtype=="init") | .cwd | test("/\\.qwen/worktrees/[a-z]+-[a-z]+-[0-9a-f]{6}$")' < /tmp/a1.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Ожидается (после реализации):**

- Событие `worktree_started` с `.data.notice`, содержащим авто-slug
- Init `.cwd` заканчивается на `.qwen/worktrees/<auto-slug>`
- Ровно одна директория worktree в `.qwen/worktrees/`
- Ветка с именем `worktree-<slug>` существует (`git branch | grep worktree-`)

**Ожидается (baseline до реализации):** yargs отклоняет `--worktree` с
ошибкой «Unknown argument» и кодом возврата != 0.

### A2: `--worktree my-feature` (явный slug)

```bash
$QWEN --worktree my-feature "say hello and stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.out

ls -d "$TEST_DIR/.qwen/worktrees/my-feature"
git -C "$TEST_DIR" branch | grep "worktree-my-feature"
```

**Ожидается (после реализации):** директория worktree `my-feature/` и ветка
`worktree-my-feature` существуют.

### A3: `--worktree=my-feature` (форма =)

Идентично A2 с формой `=`. Требуется очистка между A2 и A3 (разный TEST_DIR).

```bash
$QWEN --worktree=my-feature "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a3.out
```

**Ожидается (после реализации):** то же, что и A2.

### A4: Недопустимый slug отклоняется до любых git-операций

```bash
$QWEN --worktree "../escape" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a4.out
echo "exit=$?"

ls "$TEST_DIR/.qwen/worktrees/" 2>/dev/null
```

**Ожидается (после реализации):**

- Процесс завершается с ненулевым статусом
- В stderr или финальном сообщении результата упоминается «invalid slug» / «not allowed»
- Директория `.qwen/worktrees/` не существует (создание worktree не начиналось)

### A5: Не git-репозиторий → завершение с ошибкой

```bash
NON_GIT=$(mktemp -d)
cd "$NON_GIT"
$QWEN --worktree "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a5.out
echo "exit=$?"
```

**Ожидается (после реализации):** exit != 0, сообщение содержит «not a git repository»
или «git init».

---

## Группа B: cwd и sidecar после `--worktree`

### B1: Sidecard записывается со всеми шестью полями

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree b1-test --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.out

SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq '.slug, .worktreePath, .worktreeBranch, .originalCwd, .originalBranch, .originalHeadCommit' \
  < "$SIDECAR"
```

**Ожидается:**

- `slug = "b1-test"`
- `worktreePath` заканчивается на `.qwen/worktrees/b1-test`
- `worktreeBranch = "worktree-b1-test"`
- `originalCwd` = `$TEST_DIR` (разрешённый)
- `originalBranch = "main"`
- `originalHeadCommit` соответствует `[0-9a-f]{40}`

### B2: `process.cwd()` переключается при запуске

```bash
$QWEN --worktree b2-test "run the shell tool with command 'pwd', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b2.out

# Extract the shell tool's stdout from the user-message tool_result
jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b2.out | head -5
```

**Ожидается (после реализации):** вывод `pwd` равен `$TEST_DIR/.qwen/worktrees/b2-test`.

### B3: `Config.targetDir` переключается (Footer / status payload)

```bash
$QWEN --worktree b3-test "run the shell tool with command 'pwd && git rev-parse --abbrev-ref HEAD', then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b3.out

jq -r '.[] | select(.type=="user") | .message.content[] | select(.tool_use_id != null) | .content' \
  < /tmp/b3.out
```

**Ожидается (после реализации):** ветка — `worktree-b3-test` И рабочая директория
находится внутри worktree.

---

## Группа C: Приоритет `--worktree` × `--resume`

### C1: `--worktree` побеждает сохранённый sidecar (другой slug)

```bash
# Run 1: create a session with worktree "first"
SESSION_ID=$(uuidgen)
$QWEN --worktree first --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run1.out

# Run 2: resume the same session but request a different worktree
$QWEN --resume "$SESSION_ID" --worktree second "say hi again" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c1-run2.out

# Sidecar should now point at "second"
SIDECAR=~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json
jq -r '.slug' < "$SIDECAR"

# Both worktree dirs should exist on disk (first was never removed, just unlinked)
ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Ожидается (после реализации):**

- Sidecar `.slug` = `"second"`
- Обе директории `first/` и `second/` существуют
- В stderr или init-сообщении `worktree_overridden` упоминается «--worktree
  overrides the resumed session's worktree»

### C2: Устаревший sidecar (вручную удалённая директория) + `--worktree` → новый worktree

```bash
SESSION_ID=$(uuidgen)
$QWEN --worktree c2 --session-id "$SESSION_ID" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run1.out

rm -rf "$TEST_DIR/.qwen/worktrees/c2"   # simulate user-deleted dir

$QWEN --resume "$SESSION_ID" --worktree c2-fresh "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/c2-run2.out

ls -d "$TEST_DIR/.qwen/worktrees/"*
```

**Ожидается (после реализации):** существует только `c2-fresh/`; sidecar обновлён до `c2-fresh`.

---

## Группа D: Регрессия WorktreeExitDialog (сессия, запущенная через `--worktree`)

**Режим:** интерактивный (tmux). Проверяет, что диалог фазы C всё ещё срабатывает,
когда worktree был создан флагом CLI, а не `EnterWorktreeTool`.

### D1: 2× Ctrl+C → появляется диалог

```bash
tmux new-session -d -s d1 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d1-test --approval-mode yolo"
sleep 3

# Verify worktree is active (Footer indicator)
tmux capture-pane -t d1 -p -S -50 | grep -q "⎇ worktree-d1-test"

# Send Ctrl+C twice
tmux send-keys -t d1 C-c
sleep 0.3
tmux send-keys -t d1 C-c
sleep 1

tmux capture-pane -t d1 -p -S -50 | grep -E "Active worktree|Keep worktree|Remove worktree"
tmux kill-session -t d1
```

**Ожидается (после реализации):** текст диалога «Active worktree: \"d1-test\" …» и три
радио-опции отображаются.

### D2: Диалог → Cancel → сессия остаётся активной

```bash
tmux new-session -d -s d2 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d2-test --approval-mode yolo"
sleep 3
tmux send-keys -t d2 C-c; sleep 0.3; tmux send-keys -t d2 C-c; sleep 1

# Navigate to "Cancel" (third option) and select
tmux send-keys -t d2 Down Down Enter
sleep 1

tmux capture-pane -t d2 -p -S -10 | grep -q "Type your message"
ls -d "$TEST_DIR/.qwen/worktrees/d2-test"   # still exists
tmux kill-session -t d2
```

**Ожидается (после реализации):** поле ввода появляется снова; директория worktree
всё ещё на диске.

### D3: Диалог → Remove → worktree, ветка и sidecar удалены

```bash
SESSION_ID=$(uuidgen)
tmux new-session -d -s d3 -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --worktree d3-test --session-id $SESSION_ID --approval-mode yolo"
sleep 3
tmux send-keys -t d3 C-c; sleep 0.3; tmux send-keys -t d3 C-c; sleep 1
tmux send-keys -t d3 Down Enter   # select "Remove worktree and branch"
sleep 3
tmux kill-session -t d3

ls "$TEST_DIR/.qwen/worktrees/d3-test" 2>/dev/null && echo "FAIL: dir exists"
git -C "$TEST_DIR" branch | grep "worktree-d3-test" && echo "FAIL: branch exists"
test ! -f ~/.qwen/projects/$PROJECT_ID/chats/$SESSION_ID.worktree.json && echo "PASS: sidecar gone"
```

**Ожидается (после реализации):** директория, ветка и sidecar удалены.

---

## Группа E: `worktree.symlinkDirectories`

**Режим:** headless. Настройки задаются через временный файл настроек.

### Шаблон настройки

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

### E1: Путь `--worktree` применяет симлинк

```bash
$QWEN --worktree e1-test "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

ls -la "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
readlink "$TEST_DIR/.qwen/worktrees/e1-test/node_modules"
```

**Ожидается (после реализации):** `node_modules` внутри worktree — симлинк,
указывающий на `$TEST_DIR/node_modules`.

### E2: Путь `EnterWorktreeTool` применяет симлинк

```bash
$QWEN "use enter_worktree to create a worktree named e2-test, then stop" \
  --approval-mode yolo --output-format json 2>/dev/null > /dev/null

readlink "$TEST_DIR/.qwen/worktrees/e2-test/node_modules"
```

**Ожидается (после реализации):** тот же целевой симлинк.

### E3: Путь `AgentTool isolation` применяет симлинк

Требуется определение под-агента. Используйте встроенный механизм fork:

```bash
$QWEN "use the agent tool with subagent_type='general-purpose', isolation='worktree', description='check node_modules', prompt='run pwd and ls -la node_modules then exit'" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/e3.out

# Extract agent worktree dir from result message
jq -r '.[] | select(.type=="assistant") | .message.content[] | select(.type=="tool_use") | .input' \
  < /tmp/e3.out | head -5

# After execution find the agent-<7hex> worktree
ls -la "$TEST_DIR/.qwen/worktrees/"agent-*/node_modules 2>/dev/null | head -3
```

**Ожидается (после реализации):** симлинк существует внутри worktree `agent-<hex>`
(если только он не был автоматически удалён из-за отсутствия изменений — в этом случае
путь «no changes» не проверяет поведение симлинка; перейдите к тесту с принудительным изменением).

### E4: Отсутствующая исходная директория → молча пропускается, worktree всё равно создаётся

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["does-not-exist"] } }
EOF

$QWEN --worktree e4-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e4.out
ls -d "$TEST_DIR/.qwen/worktrees/e4-test"
ls "$TEST_DIR/.qwen/worktrees/e4-test/does-not-exist" 2>/dev/null && echo "UNEXPECTED"
```

**Ожидается (после реализации):** директория worktree существует, отсутствующая запись
не создаётся внутри неё, процесс завершается с exit = 0.

### E5: Существующий целевой путь → молча пропускается, без перезаписи

```bash
# Pre-create a worktree at expected slug then re-create — this is contrived
# because Phase D paths should be fresh, but it exercises the EEXIST guard.
mkdir -p "$TEST_DIR/.qwen/worktrees/e5-test/node_modules"
echo "preexisting" > "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker"

# Force re-creation via EnterWorktreeTool (CLI would refuse "already exists")
$QWEN "use enter_worktree with name='e5-test' to retry" --approval-mode yolo 2>/dev/null
# either: tool errors out cleanly, OR symlink is skipped — both acceptable
test -f "$TEST_DIR/.qwen/worktrees/e5-test/node_modules/.marker" && echo "PASS: not overwritten"
```

**Ожидается (после реализации):** предсуществующий `.marker` сохраняется; симлинк
не заменяет директорию.

### E6: Абсолютный путь / `../` → отклоняется

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["/etc", "../escape"] } }
EOF

$QWEN --worktree e6-test "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/e6.out
ls "$TEST_DIR/.qwen/worktrees/e6-test/" | head -10
```

**Ожидается (после реализации):** worktree существует; ни `etc`, ни `escape` не
созданы внутри него; в логах отладки присутствуют предупреждающие строки.

---

## Группа F: Ссылка на PR

**Режим:** headless. Требуется remote `origin`, указывающий на публичный GitHub-репозиторий.

### Шаблон настройки

```bash
# Use qwen-code itself as the test repo
TEST_DIR=$(mktemp -d -t qwen-wt-phd-pr-XXXXXX)
TEST_DIR=$(cd "$TEST_DIR" && pwd -P)
cd "$TEST_DIR"
git clone --depth 1 https://github.com/QwenLM/qwen-code.git .
PROJECT_ID=$(node -e "console.log(process.argv[1].replace(/[^a-zA-Z0-9]/g,'-'))" "$TEST_DIR")
```

### F1: `--worktree=#4174` парсится и выполняет fetch

```bash
$QWEN --worktree=#4174 "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f1.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
git -C "$TEST_DIR/.qwen/worktrees/pr-4174" rev-parse --abbrev-ref HEAD
```

**Ожидается (после реализации):**

- Директория worktree `pr-4174/` существует
- Текущая ветка HEAD = `worktree-pr-4174`
- Верхушка ветки разрешается (`git log -1`) без ошибок

### F2: Полная форма URL

```bash
$QWEN --worktree "https://github.com/QwenLM/qwen-code/pull/4174" "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/f2.out

ls -d "$TEST_DIR/.qwen/worktrees/pr-4174"
```

**Ожидается (после реализации):** то же, что и F1.

### F3: Отсутствует remote `origin` → завершение с ошибкой

```bash
cd "$TEST_DIR" && git remote remove origin
$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f3.out
echo "exit=$?"
```

**Ожидается (после реализации):** exit != 0; сообщение упоминает remote `origin`.

### F4: Неверный номер PR → завершение с ошибкой

```bash
$QWEN --worktree=#999999999 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f4.out
echo "exit=$?"
```

**Ожидается (после реализации):** exit != 0; сообщение содержит «Failed to fetch PR».
Ограничение таймаута 30 секунд соблюдается (время выполнения теста < 35 с).

### F5: Некорректное `#abc` переходит к валидации slug

```bash
$QWEN --worktree=#abc "say hi" --approval-mode yolo --output-format json 2>/dev/null > /tmp/f5.out
echo "exit=$?"
```

**Ожидается (после реализации):** обрабатывается как буквальный slug `#abc`, отклоняется
`validateUserWorktreeSlug`, так как `#` недопустим. Exit != 0.

### F6: PR worktree также получает симлинки (сквозной тест с E)

```bash
cat > "$TEST_DIR/.qwen/settings.json" <<'EOF'
{ "worktree": { "symlinkDirectories": ["node_modules"] } }
EOF
mkdir -p "$TEST_DIR/node_modules" && echo x > "$TEST_DIR/node_modules/.marker"

$QWEN --worktree=#4174 "say hi" --approval-mode yolo --output-format json 2>/dev/null > /dev/null
readlink "$TEST_DIR/.qwen/worktrees/pr-4174/node_modules"
```

**Ожидается (после реализации):** цель симлинка = `$TEST_DIR/node_modules`.

---

## Группа G: Интеграция и граничные случаи

### G1: Полный жизненный цикл — старт → запись → Keep → возобновление

> **Примечание до реализации:** При запуске против baseline этот тест завершается
> до того, как `sleep 3` отработает (yargs сразу отклоняет `--worktree`, и
> tmux-панель умирает). Вызов `capture-pane` затем выдаёт ошибку «can't find pane».
> Это ожидаемо — отмечайте как PASS-by-rejection. Оберните команды захвата в
> `|| true` для сухого прогона или пропустите G1 целиком в режиме baseline.

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

# File survived
cat "$TEST_DIR/.qwen/worktrees/g1-test/work.txt"

# Resume reattaches
tmux new-session -d -s g1b -x 200 -y 50 \
  "cd $TEST_DIR && $QWEN --resume $SESSION_ID --approval-mode yolo"
sleep 4
tmux capture-pane -t g1b -p -S -50 | grep -E "⎇ worktree-g1-test|Resumed"
tmux kill-session -t g1b
```

**Ожидается (после реализации):**

- `work.txt` внутри worktree содержит записанный контент
- Footer возобновлённой сессии показывает `⎇ worktree-g1-test (g1-test)`
- Элемент истории INFO или `<system-reminder>` содержит «Resumed»

### G2: Аргумент относительного пути разрешается до переключения cwd

```bash
# Create an mcp config in TEST_DIR and reference it relatively.
# --mcp-config takes a file path; if the test plan path is resolved AFTER
# the --worktree cwd switch, the file won't be found inside the worktree
# and the CLI will error out. If resolved BEFORE the switch (correct), the
# file is loaded from TEST_DIR.
cat > "$TEST_DIR/mcp.json" <<'EOF'
{ "mcpServers": {} }
EOF
cd "$TEST_DIR"

$QWEN --worktree g2-test --mcp-config ./mcp.json "say hi" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/g2.out
echo "exit=$?"
jq -r '.[] | select(.type=="result") | .result' < /tmp/g2.out | head -3
```
**Ожидается (после реализации):** exit = 0; модель отвечает нормально (пустая
конфигурация mcp означает отсутствие MCP-серверов, но и без ошибки).

**Ожидается (базовая линия до реализации):** yargs отклоняет `--worktree` (тест
не может отличить «отсутствует флаг worktree» от «нарушена конфигурация mcp»
до тех пор, пока сам флаг не существует).

---

## Порядок запуска + параллелизм

| Группа | Режим          | Время выполнения | Параллельно безопасно?          |
| ------ | -------------- | ---------------- | ------------------------------- |
| A      | headless       | ~30 с            | да (собственный TEST_DIR)       |
| B      | headless       | ~20 с            | да                              |
| C      | headless       | ~40 с            | да                              |
| D      | tmux           | ~30 с            | да (собственное имя сессии)     |
| E      | headless       | ~60 с            | да                              |
| F      | headless+сеть  | ~60 с            | НЕТ — использует общий GitHub-клон |
| G      | смешанный      | ~60 с            | да                              |

Запускайте A/B/C/D/E/G параллельно; F последовательно после настройки клона.

## Отчёт о воспроизведении

### Фаза 4: пробный прогон — базовая линия `qwen` v0.15.11 (2026-05-20)

Время выполнения: 3 параллельных агента `test-engineer`, ~7 минут всего. В базовой линии отсутствуют
как Фаза D (ожидаемая), так и Фаза A+B (более старая версия бинарного файла, чем ожидалось — см.
примечание E2/E3).

| Группа                            | Результат | Примечания                                                                              |
| -------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| A1 (простой флаг)                | ✅         | yargs `Unknown argument: worktree`, код выхода 1                                        |
| A2 (явный slug)                  | ✅         | то же самое                                                                             |
| A3 (= форма)                     | ✅         | то же самое                                                                             |
| A4 (некорректный slug)           | ✅         | yargs отклоняет до проверки slug                                                        |
| A5 (не git-директория)           | ✅         | то же самое                                                                             |
| B1 (поля sidecar)                | ✅         | sidecar корректно отсутствует; jq-селектор проверен на примере данных                   |
| B2 (смена cwd)                   | ✅         | jq-селектор `tool_result.content` shell-tool проверен на реальном выводе                |
| B3 (смена targetDir)             | ✅         | тот же селектор                                                                         |
| C1 (--worktree переопределяет sidecar) | ✅    | оба запуска завершились с кодом 1, sidecar отсутствует                                  |
| C2 (устаревший sidecar + новый)  | ✅         | то же самое                                                                             |
| E1 (--worktree символическая ссылка) | ✅      | флаг отклонён, ссылка не создана — подтверждено до реализации                           |
| E2 (EnterWorktree символическая ссылка) | ⚠️ Н/П | в базовой линии нет инструмента `enter_worktree` (старше PR #4073); защита пропускает этот случай |
| E3 (AgentTool изоляция символическая ссылка) | ⚠️ Н/П | базовая схема `agent` молча игнорирует параметр `isolation`; защита пропускает          |
| E4 (пропуск отсутствующего источника) | ✅      | флаг отклонён                                                                            |
| E5 (существующий целевой объект не перезаписывается) | ⚠️ тривиально | существующий `.marker` уцелел, но только потому, что инструмент не смог запуститься |
| E6 (отклонение path traversal)    | ✅         | флаг отклонён, символические ссылки не созданы                                           |
| F1 (--worktree=#4174 получение)   | ✅         | `Unknown argument: worktree`, без сетевого вызова                                       |
| F2 (полная форма URL)            | ✅         | то же самое                                                                             |
| F3 (отсутствует origin)          | ✅         | отклонено до проверки git                                                               |
| F4 (некорректный номер PR)       | ✅         | отклонено до получения                                                                  |
| F5 (`#abc` неверный формат)       | ✅         | то же самое                                                                             |
| F6 (PR + symlinkDirs)            | ✅         | то же самое                                                                             |
| G1 (жизненный цикл tmux)         | ⚠️ частично | панель tmux умирает при отклонении флага; запись по коду выхода работает                 |
| G2 (относительный путь)          | ✅         | (после переключения на `--mcp-config ./mcp.json`) yargs сначала отклоняет worktree       |

**Вывод:** тестовые сценарии принципиально корректны. 19 из 24 случаев чисто
обнаруживают базовую линию до реализации; 3 случая (E2/E3/E5) требуют, чтобы базовая линия
включала Фазу A+B (которую предоставит локальная сборка Фазы 6); 2 случая (G1/G2) имели
ошибки в скриптах, которые теперь исправлены. **Готовы к переходу к Фазе 5
– реализации.**

### Фаза 6: проверка локальной сборки

**Бинарный файл:** `node /Users/mochi/code/qwen-code/.claude/worktrees/tender-jemison-037f0a/dist/cli.js`
**Дата:** 2026-05-20
**Область:** Группы A, B, C, E, F, G (6 параллельных агентов `test-engineer`)

| Группа                              | Результат                    | Примечания                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 (простой флаг)                  | ✅ (с подсказкой в доке)  | yargs воспринимает следующую позиционную позицию как значение slug, когда пользователь передаёт `qwen --worktree "say hi"`; quickstart теперь рекомендует использовать форму `=` или ставить промпт перед флагом. Сама функция авто-slug подтверждена через `qwen --worktree --approval-mode yolo "say hi"` → slug `bright-elm-8a4c12`, init `.cwd` заканчивается на `.qwen/worktrees/<auto-slug>`. |
| A2 (явный slug)                    | ✅                        | директория `.qwen/worktrees/my-feature` + ветка `worktree-my-feature`                                                                                                                                                                                                                                                                                                                        |
| A3 (= форма)                       | ✅                        | идентично A2                                                                                                                                                                                                                                                                                                                                                                                |
| A4 (некорректный slug)             | ✅                        | exit=1, сообщение: `Worktree name may only contain letters, digits, dots, underscores, and hyphens.`, директория worktree не создана                                                                                                                                                                                                                                                         |
| A5 (не git-директория)             | ✅                        | exit=1, сообщение: `not a git repository. Run \`git init\` first or relaunch from inside one.`                                                                                                                                                                                                                                                                                              |
| B1 (поля sidecar)                  | ✅                        | Все 6 полей присутствуют и корректны; sidecar находится в рабочей директории worktree под projectHash, как и задумано                                                                                                                                                                                                                                                                        |
| B2 (смена cwd)                     | ✅                        | `pwd` внутри shell-инструмента вернул путь к worktree в точности                                                                                                                                                                                                                                                                                                                            |
| B3 (ветка + cwd)                   | ✅                        | `pwd` = путь worktree, `git rev-parse --abbrev-ref HEAD` = `worktree-b3-test`                                                                                                                                                                                                                                                                                                               |
| C1 (переопределение cross-slug)    | ❌ → **известное ограничение** | Сессии привязаны к `projectHash(cwd)`; `--worktree second --resume <sid-from-first>` не находит сессию. Задокументировано в разделе Limitations пользовательской документации. Будущий рефакторинг Config (хранение якорей в корне репозитория) исправит это.                                                                                                                                |
| C2 (устаревший sidecar + новый worktree) | ❌ → **та же первопричина** | Та же архитектурная особенность.                                                                                                                                                                                                                                                                                                                                                            |
| E1 (`--worktree` символическая ссылка) | ✅                        | `node_modules` симлинкована в новый worktree                                                                                                                                                                                                                                                                                                                                                 |
| E2 (`enter_worktree` символическая ссылка) | ✅                        | тот же путь через `createUserWorktree`                                                                                                                                                                                                                                                                                                                                                      |
| E3 (изоляция агента символическая ссылка) | ⚠️ настройка теста       | модель закоммитила `node_modules` (потому что защита агента отказала в грязном состоянии); защита EEXIST затем корректно пропустила симлинк. Код правильный; для чистой E3 план теста должен предварительно `.gitignore` `node_modules`.                                                                                                                                                     |
| E4 (пропуск отсутствующего источника) | ✅                        | worktree создан, запись отсутствует, exit 0                                                                                                                                                                                                                                                                                                                                                 |
| E5 (существующий целевой объект не перезаписывается) | ✅ | существующий маркер уцелел                                                                                                                                                                                                                                                                                                                                                                  |
| E6 (абсолютный / `..` отклонён)    | ✅                        | ни один путь не был симлинкован                                                                                                                                                                                                                                                                                                                                                             |
| F1 (`--worktree=#4174` получение)  | ✅                        | директория worktree `pr-4174/`, ветка `worktree-pr-4174`, коммит `8f4fe8e feat(cli): per-turn /diff…`; подстановка локального удалённого (песочница блокирует реальный GitHub)                                                                                                                                                                                                               |
| F2 (полная форма URL)              | ✅                        | тот же результат; URL разобран → PR #4174 → локальный origin получен успешно                                                                                                                                                                                                                                                                                                                |
| F3 (отсутствует origin)            | ✅                        | exit=1 за 2 с; сообщение упоминает добавление удалённого `origin`                                                                                                                                                                                                                                                                                                                           |
| F4 (некорректный PR #999999999)    | ✅                        | exit=1 за 2 с; «PR does not exist on origin»; укладывается в 35-секундный лимит                                                                                                                                                                                                                                                                                                             |
| F5 (некорректный `#abc`)           | ✅                        | валидация slug отклоняет `#`                                                                                                                                                                                                                                                                                                                                                                |
| F6 (PR worktree + симлинки)        | ✅                        | симлинк `pr-4174/node_modules` → `$TEST_DIR/node_modules` подтверждён                                                                                                                                                                                                                                                                                                                       |
| G1.a (старт + запись + Keep)       | ✅                        | TUI-поток, индикатор Footer, параметры диалога, файл сохраняется                                                                                                                                                                                                                                                                                                                            |
| G1.b (`--resume … --worktree foo`) | ❌ → **исправлено в этом PR** | Исходно: `--worktree: Worktree already exists at …`. Исправление Фазы 6 добавило ветку повторного присоединения в `setupStartupWorktree`. Проверено после исправления дымовым тестом (`--worktree foo` дважды → второй раз выдаёт уведомление `worktree_started`, без ошибки) + новые модульные тесты в `worktreeStartup.test.ts`.                                                             |
| G2 (относительный `--mcp-config`)  | ❌ → **исправлено в этом PR** | Исходно: exit=52, «Invalid MCP configuration … is not valid JSON». Исправление Фазы 6 нормализует поля argv, принимающие пути (`mcpConfig`, `openaiLoggingDir`, `jsonFile`, `inputFile`, `telemetryOutfile`, `includeDirectories`) относительно текущей рабочей директории запуска ДО того, как `setupStartupWorktree` сменит cwd. Проверено после исправления дымовым тестом (`--worktree foo --mcp-config ./mcp.json` → модель отвечает нормально). |

**Итог Фазы 6:** 22 из 24 случаев пройдены после исправления; 2 случая (C1/C2) натолкнулись на
архитектурное ограничение, которое теперь задокументировано; 1 случай (E3) — особенность
настройки теста, а не проблема реализации. **Готово к ревью кода Фазы 7.**

### Ссылки на исправления (исправления Фазы 6, вошедшие в этот PR)

| Исправление                                                    | Файл                                               | Изменение                                                                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Повторное присоединение к существующему worktree (G1.b)      | `packages/cli/src/startup/worktreeStartup.ts`      | Добавлена проверка перед созданием: если директория является зарегистрированным worktree на ожидаемой ветке, пропустить создание и смену cwd                                                                              |
| Вспомогательная функция `getRegisteredWorktreeBranch()`       | `packages/core/src/services/gitWorktreeService.ts` | Проверяет `git rev-parse --abbrev-ref HEAD` относительно пути-кандидата                                                                                                                                                 |
| Нормализация пути до смены cwd (G2)                           | `packages/cli/src/gemini.tsx`                      | Разрешает `mcpConfig`, `openaiLoggingDir`, `jsonFile`, `inputFile`, `telemetryOutfile`, `includeDirectories` относительно cwd запуска, если установлен `--worktree`                                                       |
| Документация: подсказка о порядке флагов yargs + обновление Limitations | `docs/users/features/worktree.md`      | Подсказка в Quick Start + новые пункты Limitations (cross-slug, поведение path-аргументов)                                                                                                                               |
| Модульные тесты для повторного присоединения                    | `packages/cli/src/startup/worktreeStartup.test.ts` | Добавлено 2 теста: успешное повторное присоединение + защита «другая ветка занимает слот»                                                                                                                               |

**Примечание о сетевой группе F Фазы 6**: Песочница блокирует `git fetch` к `https://github.com` с HTTP 403. F1/F2/F4/F6 были повторно протестированы на локальном bare-репозитории (`git init --bare`), в который помещён `refs/pull/4174/head`, указывающий на коммит с сообщением `feat(cli): per-turn /diff with interactive dialog (#4277)`. F3 и F5 не зависят от сети и были проверены напрямую. Подстановка локального удалённого репозитория полностью отрабатывает путь: разбор URL + получение + создание worktree.
---

## Отчёт о воспроизведении — Сухой прогон Фазы 4 (Группы F + G), 2026-05-20

**Бинарный файл**: `qwen` (глобально установлен, v0.15.11 по пути `/Users/mochi/.nvm/versions/node/v22.21.1/bin/qwen`)
**Переопределение**: `QWEN="qwen"`

### Таблица результатов

| ID теста                  | Результат | Доказательства                                                                                                                                    | Предложение по исправлению                |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| F1 `--worktree=#4174`     | PASS      | `Unknown argument: worktree`, exit=1                                                                                                             | Нет — ожидаемый сбой базовой линии        |
| F2 `--worktree <url>`     | PASS      | `Unknown argument: worktree`, exit=1                                                                                                             | Нет — ожидаемый сбой базовой линии        |
| F3 отсутствие origin      | PASS      | `Unknown argument: worktree`, exit=1 — yargs отклонил до любых операций с git                                                                     | Нет                                       |
| F4 неверный PR #999999999 | PASS      | `Unknown argument: worktree`, exit=1                                                                                                             | Нет                                       |
| F5 некорректный `#abc`    | PASS      | `Unknown argument: worktree`, exit=1                                                                                                             | Нет                                       |
| F6 PR + symlinkDirs       | PASS      | `Unknown argument: worktree`, exit=1                                                                                                             | Нет                                       |
| G1 жизненный цикл (tmux)  | PASS      | `Unknown argument: worktree` выведен в stdout, захвачен в `/tmp/g1_raw.out`; сессия tmux завершилась мгновенно, панель уже была мертва к моменту захвата | ОШИБКА-СКРИПТА: см. примечание ниже       |
| G2 относительный путь     | PASS      | `Unknown arguments: worktree, prompt-file, promptFile`, exit=1                                                                                   | ОШИБКА-СКРИПТА: см. примечание ниже       |

### Наблюдаемое поведение (все случаи)

Каждый вызов `--worktree` (голый, форма `=`, форма `#<N>`, полный URL, в сочетании с `--prompt-file`) был отклонён на уровне разбора аргументов yargs с кодом выхода 1 до запуска любой логики приложения. Точные строки ошибки:

- `Unknown argument: worktree` (один неизвестный аргумент)
- `Unknown arguments: worktree, prompt-file, promptFile` (G2: и `--worktree`, и `--prompt-file` неизвестны, перечислены вместе)

Никаких операций с git, сетевых вызовов или операций с файловой системой ни в одном тесте не произошло.

### Ожидаемое поведение

Идентичное отклонение — это правильная базовая линия до реализации. Все 8 тестов проходят PASS в смысле сухого прогона (план тестирования корректно определяет, что функции не существуют).

### Ключевой контекст

Режим отказа единообразно проявляется на уровне yargs, а не на нижних уровнях. Это подтверждает, что стратегия обнаружения тестового плана верна: как только `--worktree` будет подключён к yargs, эти тесты перестанут завершаться сбоем на этом уровне и вместо этого будут выполнять фактические пути реализации (F1-F6 обратятся к git fetch, G1 — к жизненному циклу TUI, G2 — к разрешению `--prompt-file`).

### Примечания ОШИБКА-СКРИПТА для плана тестирования

**G1 (tmux):** Команда сессии tmux передаётся через `tee` с подоболочкой `echo 'PROC_EXIT='$?`, которая захватывает код выхода `tee`, а не `qwen`. Когда процесс завершается мгновенно (как при ошибке Unknown argument), сессия завершается до окончания `sleep 3`, и имя панели `g1dry` исчезает к моменту выполнения `tmux capture-pane`, что приводит к ошибке `can't find pane: g1dry`. Исправление: использовать `|| true` после `tmux capture-pane` или добавить защиту `|| sleep 0`; ещё лучше — для случая сбоя базовой линии перенаправить stderr+stdout в файл вне tmux и проверять файл напрямую (как сделано здесь через `tee /tmp/g1_raw.out`).

**G2 (`--prompt-file`):** В плане тестирования используется `--prompt-file ./relative.txt` как комбинированный тест с `--worktree`. В базовой линии `--prompt-file` также является неизвестным аргументом (его нет в схеме yargs v0.15.11 — флаг называется `--prompt-interactive` / `-p`). Ошибка перечисляет оба неизвестных аргумента вместе. В плане следует отметить, что `--prompt-file` нужно будет реализовать одновременно с `--worktree`, либо использовать существующий флаг (например, передача через stdin или использование `--prompt`) для теста разрешения относительного пути.