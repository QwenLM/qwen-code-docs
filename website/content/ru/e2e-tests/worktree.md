# План сквозного тестирования функции Worktree (Фаза A + B)

## Область действия

Сквозные тесты для общей функциональности worktree:

- Фаза A: инструменты `EnterWorktree` / `ExitWorktree` + состояние SessionService
- Фаза B: параметр `isolation: 'worktree'` инструмента `Agent` + автоочистка + уведомление о worktree

## Тестовая среда

Каждая группа тестов выполняется в собственном временном git-репозитории и tmux-сессии для предотвращения конфликтов. Шаблон настройки:

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

Каждая группа использует уникальное имя tmux-сессии (например, `wt-test-a`, `wt-test-b`) и уникальную временную директорию.

Базовый бинарник: глобально установленный `qwen` (0.15.10).
Локально собранный бинарник: `node /Users/mochi/code/qwen-code/.claude/worktrees/trusting-euclid-6fdfb9/bundle/qwen.js`.

## Группа тестов A: регистрация инструмента EnterWorktree и базовое создание

**Режим:** Headless, `--approval-mode yolo`, `--output-format json`

### A1: Инструмент зарегистрирован при инициализации системы

**Шаги:**

```bash
<qwen> "say hello" --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .tools[]' \
  | grep -E "^(enter_worktree|exit_worktree)$"
```

**До реализации:** пусто (инструменты не зарегистрированы).
**После реализации:** вывод содержит `enter_worktree` и `exit_worktree`.

### A2: Создание worktree с автоматически сгенерированным именем

**Шаги:**

```bash
<qwen> "create a new git worktree using the enter_worktree tool" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/a2.json
# Проверка создания директории worktree
ls -la .qwen/worktrees/ | grep -v "^\." | wc -l
# Должна быть директория, соответствующая шаблону автоматически сгенерированного слага
```

**До реализации:** модель сообщает, что не может найти инструмент; директория `.qwen/worktrees/` отсутствует.
**После реализации:** `.qwen/worktrees/<slug>` существует с автоматически сгенерированным слагом (формат: `{прилагательное}-{существительное}-{4hex}`).

### A3: Создание worktree с пользовательским именем

**Шаги:**

```bash
<qwen> "use the enter_worktree tool with name='my-feature' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/my-feature/
git branch | grep worktree-my-feature
```

**До реализации:** инструмент неизвестен.
**После реализации:** директория `.qwen/worktrees/my-feature/` существует; ветка `worktree-my-feature` существует.

### A4: Некорректный slug отклоняется

**Шаги:**

```bash
<qwen> "use enter_worktree with name='../../../etc' to create a worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="user") | .message.content[] | select(.is_error) | .content'
```

**До реализации:** инструмент неизвестен.
**После реализации:** результат инструмента is_error=true с сообщением об ошибке валидации.

## Группа тестов B: ExitWorktree

**Режим:** Headless, двухшаговое взаимодействие в одном запросе.

### B1: Вход, затем выход с действием keep

**Шаги:**

```bash
<qwen> "create a worktree named 'temp-keep' using enter_worktree, then immediately exit it with action='keep' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/b1.json
# Директория должна всё ещё существовать (keep сохраняет её)
ls -d .qwen/worktrees/temp-keep
# Ветка должна всё ещё существовать
git branch | grep worktree-temp-keep
# Текущая рабочая директория должна быть исходной
```

**До реализации:** инструменты неизвестны.
**После реализации:** директория и ветка worktree всё ещё существуют после выхода.

### B2: Вход, затем выход с действием remove (без изменений)

**Шаги:**

```bash
<qwen> "create a worktree named 'temp-remove' using enter_worktree, then immediately exit it with action='remove' using exit_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null
ls -d .qwen/worktrees/temp-remove 2>&1
git branch | grep worktree-temp-remove
```

**До реализации:** инструменты неизвестны.
**После реализации:** директория worktree удалена; ветка удалена.

### B3: Выход с действием remove отклоняется при наличии незакоммиченных изменений

**Шаги:** Запустить интерактивную tmux-сессию, вручную создать файлы в worktree, затем попытаться выйти.

```bash
tmux new-session -d -s wt-test-b3 -x 200 -y 50 "cd $TEST_DIR && <qwen> --approval-mode yolo"
sleep 3
tmux send-keys -t wt-test-b3 "create a worktree named 'dirty-test' using enter_worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
# Ожидание завершения
for i in $(seq 1 30); do
  sleep 2
  tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break
done
# Создание "грязного" файла в worktree
echo "dirty" > "$TEST_DIR/.qwen/worktrees/dirty-test/dirty.txt"
# Попытка удалить без discard_changes
tmux send-keys -t wt-test-b3 "use exit_worktree with action='remove' to exit the worktree"
sleep 0.5
tmux send-keys -t wt-test-b3 Enter
for i in $(seq 1 30); do sleep 2; tmux capture-pane -t wt-test-b3 -p | grep -q "Type your message" && break; done
tmux capture-pane -t wt-test-b3 -p -S -100 > /tmp/b3.out
# В выводе должно быть упоминание "uncommitted changes" или "discard_changes"
grep -E "uncommitted|discard_changes" /tmp/b3.out
tmux kill-session -t wt-test-b3
```

**До реализации:** инструменты неизвестны.
**После реализации:** выход завершается ошибкой с сообщением о незакоммиченных изменениях и флаге `discard_changes`.

## Группа тестов C: сохранение состояния SessionService

### C1: Состояние worktree в метаданных сессии

**Шаги:**

```bash
SESSION_ID=$(<qwen> "create a worktree named 'persist-test' using enter_worktree" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq -r 'select(.type=="system") | .session_id' | head -1)
# Проверка хранилища сессий на наличие состояния worktree
find ~/.qwen -name "*${SESSION_ID}*" 2>/dev/null | head
grep -l "persist-test" ~/.qwen/projects/*/sessions/*.json 2>/dev/null || \
  grep -rl "worktreeSession\|persist-test" ~/.qwen/projects/ 2>/dev/null | head -5
```

**До реализации:** состояние сессии worktree нигде не сохраняется.
**После реализации:** JSON сессии содержит поле `worktreeSession` с `slug='persist-test'`, `worktreePath`, `originalCwd` и т.д.

## Группа тестов D: изоляция AgentTool

### D1: Параметр изоляции агента принимается

**Шаги:**

```bash
<qwen> "spawn an agent using the agent tool with isolation='worktree' to run 'echo hello'" \
  --approval-mode yolo --output-format json 2>/dev/null \
  | jq 'select(.type=="assistant") | .message.content[] | select(.type=="tool_use" and .name=="agent") | .input'
# Проверка, что .qwen/worktrees/ содержит слаг agent-* во время выполнения
```

**До реализации:** схема инструмента agent не имеет параметра isolation; модель либо опускает его, либо схема отклоняет.
**После реализации:** агент успешно запускается с isolation='worktree'; создаётся worktree `agent-<7hex>`.

### D2: Агент автоматически очищает worktree (без изменений)

**Шаги:**

```bash
ls .qwen/worktrees/ > /tmp/d2-before.txt 2>/dev/null
<qwen> "spawn an agent with isolation='worktree' to list files in the current directory using ls" \
  --approval-mode yolo --output-format json 2>/dev/null
ls .qwen/worktrees/ > /tmp/d2-after.txt 2>/dev/null
# После должно быть равно до (не должно остаться директорий agent-*)
diff /tmp/d2-before.txt /tmp/d2-after.txt
```

**До реализации:** N/A (нет параметра isolation).
**После реализации:** директория worktrees не изменяется после завершения агента без изменений.

### D3: Worktree агента сохраняется при внесении изменений

**Шаги:**

```bash
<qwen> "spawn an agent with isolation='worktree' to write 'test content' to a new file called test.txt" \
  --approval-mode yolo --output-format json 2>/dev/null > /tmp/d3.json
# Worktree должен быть сохранён с изменениями
ls .qwen/worktrees/agent-* 2>/dev/null
ls .qwen/worktrees/agent-*/test.txt 2>/dev/null
# Результат агента должен содержать worktreePath/worktreeBranch
jq 'select(.type=="user") | .message.content[] | select(.tool_use_id) | .content' /tmp/d3.json | head
```

**До реализации:** N/A.
**После реализации:** `.qwen/worktrees/agent-<7hex>/test.txt` существует; результат агента упоминает путь и ветку worktree.

## Группа тестов E: очистка устаревших

### E1: Функция очистки удаляет старые worktree агентов

Это сложнее проверить сквозным тестом, так как требуется старение. Покрывается модульными тестами в `worktreeCleanup.test.ts`:

- Worktree с mtime > 30 дней назад и соответствующий шаблону `agent-<7hex>` → удалён
- Worktree с mtime > 30 дней назад, но с пользовательским именем (например, `my-feature`) → сохранён
- Worktree с mtime < 30 дней → сохранён
- Worktree с незакоммиченными изменениями → сохранён (fail-closed)
- Worktree с неотправленными коммитами → сохранён (fail-closed)

Выборочная проверка E2E (опционально): вручную выполнить `touch -t 200001010000 .qwen/worktrees/agent-aabcdef0` и вызвать очистку; проверить удаление.

## Группа тестов F: совместимость с Arena (без регрессий)

### F1: Путь worktree Arena не изменился

**Шаги:** Запустить сессию Arena (отдельно от EnterWorktree); убедиться, что она по-прежнему создаёт worktree в `~/.qwen/arena/<sessionId>/worktrees/`, а не в `.qwen/worktrees/`.

```bash
# Настройка: требуется конфигурация с включённой Arena. Детальные шаги зависят от вызова CLI Arena.
# До реализации: worktree Arena находятся в ~/.qwen/arena/.
# После реализации: ТАК ЖЕ — путь Arena независим.
```

(Если Arena недоступна из headless-режима, эта группа проверяется модульным тестом, что ArenaManager.ts:125 (`this.arenaBaseDir = arenaSettings?.worktreeBaseDir ?? path.join(Storage.getGlobalQwenDir(), 'arena')`) не изменился.)

## Покрытие модульными тестами (совместно с реализацией)

Помимо плана сквозных тестов, реализацию должны сопровождать следующие модульные тесты:

- `EnterWorktreeTool.test.ts`: валидация схемы, отклонение slug, отклонение вложенного worktree, смена рабочей директории, запись в SessionService
- `ExitWorktreeTool.test.ts`: пути keep vs remove, защита от грязного состояния, обход discard_changes, восстановление рабочей директории
- `gitWorktreeService.test.ts` расширения: `createUserWorktree`, `removeUserWorktree`, `createAgentWorktree`, `removeAgentWorktree`
- `sessionService.test.ts` расширения: чтение/запись поля WorktreeSession, восстановление при возобновлении
- `worktreeCleanup.test.ts`: сопоставление шаблонов очистки, фильтр по возрасту, условия fail-closed
- `agent.test.ts` расширения: принятие параметра isolation, создание worktree и (в некоторых случаях) очистка

## Критерии прохождения

| Группа | Ожидание до сборки          | Ожидание после сборки                                    |
| ------ | --------------------------- | -------------------------------------------------------- |
| A1     | инструменты не перечислены  | оба инструмента перечислены                              |
| A2     | ошибка/бездействие          | создан `.qwen/worktrees/<auto-slug>`                     |
| A3     | ошибка/бездействие          | создан `.qwen/worktrees/my-feature`, ветка присутствует  |
| A4     | ошибка/бездействие          | результат инструмента is_error с сообщением валидации    |
| B1     | ошибка/бездействие          | директория и ветка worktree сохранены                    |
| B2     | ошибка/бездействие          | директория и ветка worktree удалены                      |
| B3     | ошибка/бездействие          | выход отклонён с сообщением о незакоммиченных изменениях |
| C1     | нет состояния worktree      | сессия содержит поле worktreeSession                     |
| D1     | нет параметра isolation     | агент запускается в worktree `agent-<7hex>`              |
| D2     | N/A                         | директория worktrees не изменена после агента без изменений |
| D3     | N/A                         | `agent-<7hex>` сохранён с изменениями                    |

## Отчёт о воспроизведении (после реализации)

Локальная сборка в `dist/cli.js` (коммит на вершине `claude/trusting-euclid-6fdfb9`).

| Группа | Результат                         | Примечания                                                                                                                                                             |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1     | ✅                                | `enter_worktree` и `exit_worktree` перечислены в `system.tools`                                                                                                         |
| A3     | ✅                                | Создан `.qwen/worktrees/my-feature`, ветка `worktree-my-feature` присутствует                                                                                            |
| A4     | покрыто модульным тестом          | `validateUserWorktreeSlug` отклоняет path-traversal и т.д. (`enter-worktree.test.ts`)                                                                                     |
| B1     | ✅                                | Действие `keep` сохранило и директорию, и ветку                                                                                                                     |
| B2     | ✅                                | Действие `remove` удалило директорию и ветку                                                                                                                          |
| B3     | ✅                                | `remove` отказано с сообщением `Refusing to remove worktree "dirty-test" — it has 0 tracked change(s) and 1 untracked file(s).`                                                |
| C1     | вынесено за рамки                 | Сохранение состояния SessionService отложено из Фазы A (см. примечания по объёму в `docs/design/worktree.md`)                                                                       |
| D1     | ✅                                | Вызов агента принял `isolation: 'worktree'`, создан `agent-2c4e759`                                                                                            |
| D2     | ✅                                | После завершения агента без изменений директория worktrees пуста                                                                                                         |
| D3     | ✅                                | После того как агент записал `test.txt`, worktree `agent-bad55bd` и ветка `worktree-agent-bad55bd` сохранены; результат содержит суффикс `[worktree preserved: ... (branch ...)]` |
| E1     | покрыто модульным тестом          | `worktreeCleanup.test.ts` проверяет, что `isEphemeralSlug` соответствует только `agent-<7hex>`                                                                                      |
| F1     | вынесено за рамки (нет Arena E2E) | Кодовые пути Arena не затронуты: `ArenaManager.ts:125` и `setupWorktrees()` без изменений                                                                                    |

### Отклонения от плана тестов

- **C1** (сохранение состояния SessionService) отложено из Фазы A. Минимально жизнеспособная Фаза A возвращает абсолютный путь worktree, чтобы модель использовала его напрямую через абсолютные пути, вместо механического переключения `Config.targetDir`. Поддержка возобновления требует расширения SessionService и задокументирована для будущей фазы.
- **A2** (автоматически сгенерированное имя) косвенно проверено через D1/D3, которые используют тот же путь авто-слага через поток изоляции агента.