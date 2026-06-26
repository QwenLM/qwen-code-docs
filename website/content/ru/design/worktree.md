# Проектирование универсальной возможности Worktree

## Постановка задачи

В настоящее время в qwen-code существует только внутренняя реализация worktree для сценариев многомодельного сравнения Arena (`GitWorktreeService`). Пользователи не могут использовать worktree для изоляции работы в обычных сессиях, а AgentTool не поддерживает создание изолированной среды worktree для подчинённых агентов (subagent).

Цель — сделать worktree универсальной возможностью, поддерживающей изоляцию на уровне сессии пользователя и на уровне агента, при этом полностью сохранить существующий функционал Arena.

## Сравнение текущего состояния

| Функция                               | qwen-code       | claude-code | Этап    |
| ------------------------------------- | --------------- | ----------- | ------- |
| Инструмент `EnterWorktree`            | ✅ (Phase A)    | ✅          | —       |
| Инструмент `ExitWorktree`             | ✅ (Phase A)    | ✅          | —       |
| AgentTool `isolation: 'worktree'`     | ✅ (Phase B)    | ✅          | —       |
| Автоматическая очистка устаревших worktree | ✅ (Phase B) | ✅          | —       |
| Персистентность и восстановление состояния сессии worktree | ❌ | ✅ | Phase C |
| Настройка после создания (конфигурация хуков) | ❌ | ✅ | Phase C |
| Отображение состояния worktree в StatusLine | ❌ | ✅ | Phase C |
| WorktreeExitDialog (подтверждение выхода) | ❌ | ✅ | Phase C |
| Флаг запуска CLI `--worktree`         | ✅ (Phase D)    | ✅          | —       |
| Символические ссылки на каталоги (node_modules и т.д.) | ✅ (Phase D) | ✅ | —       |
| Ссылка на PR (`--worktree=#123`)      | ✅ (Phase D)    | ✅          | —       |
| Sparse checkout                       | ❌              | ✅          | Future  |
| Интеграция с tmux                     | ❌              | ✅          | Future  |
| Изоляция worktree в Arena для нескольких моделей | ✅ (только qwen) | ❌ | — |
| Перезапись грязного состояния (stash + copy) | ✅ | ✅ | —       |
| Отслеживание baseline commit          | ✅ (только qwen) | ❌          | —       |

## Принципы проектирования

**Worktree — это универсальная возможность, Arena является её приложением верхнего уровня.**

- Универсальный слой worktree: инструменты `EnterWorktree`/`ExitWorktree`, параметр `isolation` у AgentTool, управление состоянием сессии, автоматическая очистка.
- Слой Arena: многомодельное параллельное планирование, пользовательский путь `worktreeBaseDir`, массовое создание и сравнение diff. Продолжает использовать существующую логику `GitWorktreeService.setupWorktrees()`, не подвергаясь изменениям универсального слоя.

Параметр `isolation: 'worktree'` у AgentTool использует только универсальный путь. Arena не создаёт worktree через этот параметр, пути независимы.

## Пути и конфигурация

### Универсальный путь worktree

Worktree, создаваемые инструментом `EnterWorktree` или AgentTool с `isolation: 'worktree'`, фиксированно размещаются в:

```
{корень git-репозитория}/.qwen/worktrees/{slug}
```

Путь не настраивается. Правила именования slug:

- Worktree пользовательской сессии: имя, указанное пользователем, или автоматически сгенерированное (формат: `{прилагательное}-{существительное}-{4 случайных символа}`).
- Worktree агента: `agent-{7 случайных шестнадцатеричных символов}`.

### Путь worktree для Arena (существующий, без изменений)

Путь worktree для Arena управляется параметром `agents.arena.worktreeBaseDir`, по умолчанию `~/.qwen/arena` (`ArenaManager.ts:125`). Полностью независим от универсального пути, изменений не требуется.

### Расширенная конфигурация

| Параметр конфигурации              | Тип        | Назначение                                                     | Этап    |
| ---------------------------------- | ---------- | -------------------------------------------------------------- | ------- |
| `ui.hideBuiltinWorktreeIndicator`  | `boolean`  | Скрыть встроенную строку `⎇ worktree-… (…)` в Footer, оставить пользовательскому statusline | Phase C |
| `worktree.symlinkDirectories`      | `string[]` | Создать символические ссылки на указанные каталоги (например, `node_modules`) в worktree, чтобы избежать лишнего расхода диска | Phase D |
| `worktree.sparsePaths`             | `string[]` | Режим конуса git sparse-checkout: в больших monorepo записывать только указанные пути | Future  |

На этапах Phase A / B новые параметры конфигурации не добавляются.

## Проектирование инструментов

### EnterWorktree

**Условие запуска:** Пользователь явно говорит: "start a worktree", "use a worktree", "create a worktree" и т.п. Инструмент не должен запускаться автоматически, когда пользователь говорит "исправить баг", "разработать функцию".

**Схема ввода:**

```
name?: string  // Необязательно, формат slug: буквы/цифры/точки/подчёркивания/дефисы, максимум 64 символа
```

**Поведение:**

1. Проверить, что мы ещё не находимся в worktree (предотвратить вложенность).
2. Разрешить корень git-репозитория (обработать случай, когда мы уже в подкаталоге).
3. Вызвать `GitWorktreeService` для создания worktree, путь: `.qwen/worktrees/{slug}`.
4. Записать сессию worktree в `SessionService`.
5. Переключить рабочий каталог на путь worktree.
6. Очистить кеш файлов.

**Вывод:** `worktreePath`, `worktreeBranch`, `message`.

### ExitWorktree

**Условие запуска:** Пользователь говорит: "exit the worktree", "leave the worktree", "go back" и т.п.

**Схема ввода:**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // Действительно только при action='remove'
```

**Гарантии безопасности:**

- Работает только с worktree, созданным данной сессией через `EnterWorktree`.
- Если `action='remove'` и есть незакоммиченные изменения, выполнение отклоняется (если только `discard_changes: true`).

**Поведение:**

- `keep`: очистить состояние worktree в сессии, сохранить каталог worktree и ветку, восстановить исходный рабочий каталог.
- `remove`: удалить каталог worktree, удалить соответствующую ветку git, очистить состояние сессии, восстановить исходный рабочий каталог.

**Вывод:** `action`, `originalCwd`, `worktreePath`, `worktreeBranch`.

## Способы запуска пользователем

| Способ                | Пример                                                   | Этап реализации |
| --------------------- | -------------------------------------------------------- | --------------- |
| Явный запрос в сессии | Пользователь говорит "начать работу в worktree" → модель вызывает EnterWorktree | Phase A |
| Изоляция агента       | Модель устанавливает `isolation: 'worktree'` для subagent | Phase B |
| Флаг запуска CLI      | `qwen --worktree my-feature`                              | Phase D |

Слеши (slash-команды) отсутствуют. Запуск worktree в сессии зависит от явного упоминания пользователем; `isolation: 'worktree'` — это сценарий самостоятельного решения модели.

## Поэтапный план реализации

### Phase A: Основные инструменты (worktree на уровне сессии пользователя)

**Цель:** Пользователь может войти / выйти из worktree в сессии.

**Реализуемые функции:**

- Инструмент `EnterWorktree`: создать worktree, переключить рабочий каталог, записать состояние сессии.
- Инструмент `ExitWorktree`: два способа выхода (keep / remove), гарантии безопасности.
- Расширение `GitWorktreeService`: добавить методы `createUserWorktree()` / `removeUserWorktree()` для однопользовательской сессии, используя существующую логику git, не изменяя массовые интерфейсы, используемые Arena.
- Расширение `SessionService`: добавить поле `WorktreeSession` с записью `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`; при `--resume` восстанавливать рабочий каталог worktree.
- Промпты инструментов: написать инструкции по использованию для каждого инструмента, указать, когда вызывать, а когда нет.

**Затрагиваемые файлы:**

| Файл                                               | Тип изменения                                    |
| -------------------------------------------------- | ------------------------------------------------ |
| `packages/core/src/tools/tool-names.ts`            | Добавить константы `ENTER_WORKTREE`, `EXIT_WORKTREE` |
| `packages/core/src/tools/EnterWorktreeTool/`       | Новый каталог: `EnterWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`        | Новый каталог: `ExitWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/services/gitWorktreeService.ts` | Добавить интерфейсы для сессий пользователей (не изменять интерфейсы Arena) |
| `packages/core/src/services/sessionService.ts`     | Добавить поле `WorktreeSession` и методы чтения/записи |
| `packages/core/src/tools/` точка регистрации       | Зарегистрировать новые инструменты               |

**Что не входит в Phase A:**

- Изоляция агента (Phase B)
- Настройка после создания, например конфигурация хуков (Phase C)
- Отображение состояния UI (Phase C)

---

### Phase B: Изоляция агента (AgentTool `isolation: 'worktree'`) + обновление описаний

**Цель:** Модель может создавать временный изолированный worktree для subagent; после завершения агента он автоматически очищается. Одновременно обновляются описания затронутых инструментов и промпты.

**Реализуемые функции:**

_Основная изоляция агента:_

- Добавить параметр `isolation?: 'worktree'` в `AgentTool`.
- При запуске агента создавать временный worktree (slug: `agent-{7hex}`, путь: `.qwen/worktrees/agent-{7hex}`).
- После завершения агента: если изменений нет — автоматически удалить; если есть — сохранить, вернуть путь и ветку в результате.
- Автоматическая очистка устаревших worktree: сканировать `.qwen/worktrees/`, находить записи с шаблоном `agent-{7hex}`, старше 30 дней и без непереданных коммитов — удалить. Стратегия fail-closed.

_Обновление описаний и промптов:_

- Дополнить description `AgentTool` описанием параметра `isolation: 'worktree'` (см. `claude-code AgentTool/prompt.ts:272`).
- Добавить `buildWorktreeNotice()`: при запуске fork subagent в worktree вставлять контекстную подсказку о том, что он находится в изолированном worktree, путь наследуется от родительского агента, перед редактированием необходимо перечитать файлы (см. `claude-code forkSubagent.ts:buildWorktreeNotice`).

_Без изменений:_

- review skill (`SKILL.md`): review использует независимый механизм (путь `.qwen/tmp/review-pr-<n>`, создаётся через команду `qwen review fetch-pr`), полностью отличается от универсального пути и механизма worktree, путаницы нет.

**Гарантии совместимости Arena:** Arena не создаёт worktree через параметр `isolation`, это изменение не затрагивает код Arena.

**Затрагиваемые файлы:**

| Файл                                               | Тип изменения                                           |
| -------------------------------------------------- | ------------------------------------------------------- |
| `packages/core/src/tools/agent/agent.ts`           | Добавить параметр `isolation` и логику создания/очистки worktree |
| `packages/core/src/tools/agent/fork-subagent.ts`   | Добавить `buildWorktreeNotice()` и внедрение в режиме worktree |
| `packages/core/src/services/gitWorktreeService.ts` | Добавить `createAgentWorktree()` / `removeAgentWorktree()` |
| `packages/core/src/services/worktreeCleanup.ts`    | Новый файл: логика автоматической очистки устаревших worktree |

---

### Phase C: Полнота сессии (персистентность SessionService + UI защитная сетка)

**Цель:** Состояние worktree восстанавливается после прерывания сессии; пользователь всегда видит, в каком worktree находится; при выходе из сессии появляется предупреждение.

**Реализуемые функции:**

_Персистентность состояния worktree в SessionService + восстановление через `--resume`:_

- Расширить поле `WorktreeSession` в `SessionService`, запись `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`.
- `EnterWorktreeTool` вызывает `sessionService.setWorktreeSession()` для записи состояния.
- `ExitWorktreeTool` вызывает `sessionService.clearWorktreeSession()` для очистки состояния.
- При запуске с `--resume` читать это поле, восстанавливать `targetDir` и вставлять контекстную подсказку для модели.

_Настройка после создания (post-creation setup):_

- После создания worktree автоматически выполнять `git config core.hooksPath <mainRepo>/.git/hooks`, чтобы коммиты внутри worktree вели себя согласованно с хуками основного репозитория.

_Отображение worktree в StatusLine:_

- Добавить поле `activeWorktree` в `UIStateContext` (читать из состояния сессии), обновлять при входе/выходе из worktree.
- Добавить поле `worktree?: { slug: string; branch: string }` в payload `StatusLineCommandInput` для использования в пользовательских скриптах statusline.
- В `Footer` при непустом `activeWorktree` встроенно отображать строку `⎇ <branch> (<slug>)`, обеспечивая базовую видимость без необходимости настройки скрипта statusline.

_WorktreeExitDialog:_

- Добавить новый компонент `WorktreeExitDialog.tsx`, используя существующий подход Dialog.
- Изменить обработку клавиш выхода (Ctrl+C / Ctrl+D): при обнаружении непустого `activeWorktree` перехватывать второе подтверждение, показывать диалог с выбором keep или remove.
- Действия keep/remove используют существующий путь `ExitWorktreeTool`.

**Затрагиваемые файлы:**

| Файл                                                          | Тип изменения                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionService.ts`                | Добавить поле `WorktreeSession` и методы чтения/записи                             |
| `packages/core/src/tools/enter-worktree.ts`                   | Вызывать `sessionService.setWorktreeSession()`                                     |
| `packages/core/src/tools/exit-worktree.ts`                    | Вызывать `sessionService.clearWorktreeSession()`                                   |
| `packages/core/src/services/gitWorktreeService.ts`            | В `createUserWorktree()` / `createAgentWorktree()` после создания добавить настройку `core.hooksPath` |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`             | Добавить поле `activeWorktree` и действия set/clear                                |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                  | Добавить поле `worktree` в `StatusLineCommandInput`                                |
| `packages/cli/src/ui/components/Footer.tsx`                   | Встроенное отображение строки worktree                                             |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`       | Новый файл                                                                         |
| `packages/cli/src/ui/components/DialogManager.tsx`            | Зарегистрировать `WorktreeExitDialog`                                              |
| `packages/cli/src/ui/components/ExitWarning.tsx` или обработка клавиш выхода | Проверять `activeWorktree` и перехватывать выход                |

---

### Phase D: Конфигурация при запуске (флаг CLI `--worktree` + символические ссылки на каталоги + ссылка на PR)

**Цель:** Поддержка входа в worktree непосредственно при запуске, уменьшение дисковых накладных расходов для больших проектов с помощью символических ссылок, а также быстрое создание worktree на основе pull request по ссылке на PR.

**Область:** Три функции реализуются в одном этапе, так как все они привязаны к одной точке входа при запуске, а symlink/PR fetch должны выполняться сразу после создания worktree — разделение привело бы к дублированию последовательности начальной загрузки (bootstrap).

#### D-1: Флаг запуска CLI `--worktree [name]`

**Форма параметра:** Опция yargs принимает три формы:

| Форма                     | Поведение                                               |
| ------------------------- | ------------------------------------------------------- |
| `qwen --worktree`         | bare flag, автоматическая генерация slug (`{прилагательное}-{существительное}-{6hex}`) |
| `qwen --worktree my-name` | Явный slug, используются те же правила валидации, что и в `EnterWorktreeTool` |
| `qwen --worktree=my-name` | Эквивалентно предыдущей                                 |

Короткий алиас `-w` не предоставляется (короткие алиасы в qwen-code зарезервированы только для самых частых параметров, чтобы избежать конфликтов имён).

**Последовательность запуска:** Worktree создаётся на следующем шаге:

1. `parseArguments()` — разбор argv (уже есть).
2. Выбор возобновляемой сессии (resume picker) (уже есть, строки 588-629 в `gemini.tsx`).
3. `loadCliConfig()` — инициализация Config + auth (уже есть, строки 643-653).
4. **Новое:** Если `argv.worktree !== undefined`, вызвать `createUserWorktree()`
   - Записать sidecar (`writeWorktreeSession()`).
   - Установить `process.chdir(worktreePath)` и одновременно `Config.setTargetDir(worktreePath)`.
   - Путь повторного подключения (re-attach) к тому же worktree: пропустить `git worktree add` и сделать chdir на месте (исправление в Phase 6). Комбинация `--resume` × `--worktree` с разными projectHash приведёт к ошибке на этапе поиска сессии (см. ниже "Приоритет с `--resume`").
5. Главный цикл (TUI / headless `-p` / ACP — все три точки входа должны пройти через шаг 4).

**Отличие от упрощения в Phase A:** Инструмент `EnterWorktreeTool` в Phase A **не** изменяет `Config.targetDir`, полагаясь на то, что модель прочитает абсолютный путь из результата инструмента и продолжит использовать его. Флаг CLI в Phase D вступает в силу при запуске, контекст исполняющейся модели отсутствует, поэтому **непосредственно переключается `targetDir` и `process.cwd()`** — это более сильная гарантия изоляции. Поведение двух путей различается, это должно быть отражено в пользовательской документации.

**Поведение при выходе:** Используется существующий `WorktreeExitDialog` (реализован в Phase C). Два нажатия Ctrl+C/D → пользователь выбирает keep / remove / cancel. Новый путь кода не требуется.

**Приоритет с `--resume`:**

Поскольку хранение сессии использует `projectHash(process.cwd())` в качестве ключа, а `--worktree` выполняет chdir в worktree до resume picker / `loadCliConfig`, сценарий "запустить сессию в worktree X, возобновить её из worktree Y" **архитектурно невозможен** (разные projectHash, файлы сессий лежат в разных каталогах). В таблице ниже отражено фактическое поведение после реализации D-1 и исправления re-attach в Phase 6:

| Состояние `--resume`              | Состояние `--worktree`          | Результат                                                                                  |
| --------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| Нет                               | Нет                             | Обычная сессия, нет worktree                                                               |
| Нет                               | Есть (новый slug)               | Создать новый worktree                                                                     |
| Нет                               | Есть (существующий slug)        | **Повторно подключиться** к существующему worktree (исправление Phase 6)                   |
| Есть                              | Нет                             | Восстановить старый worktree (поведение Phase C, если sidecar найден — вставить reminder)  |
| Есть (sid из того же worktree)    | Есть (тот же slug, re-attach)   | re-attach + попадание в сессию: нормальное возобновление                                   |
| Есть (sid из main checkout)       | Есть (любой slug)               | **Ошибка поиска сессии**: `No saved session found with ID …`, exit 1. Documented limitation |
| Есть (sid из worktree X)          | Есть (slug Y, X != Y)           | То же самое: сессию нельзя найти через projectHash                                         |

Семантика принудительного переопределения projectHash (`--worktree` с переносом между разными worktree / main checkout) требует привязки хранилища к корню репозитория, а не к projectHash, производному от cwd. Это относится к будущей реконфигурации Config. Код ветки `overrodeResumedWorktree` внутри `persistStartupWorktreeSidecar` сохраняется на случай, если после рефакторинга он автоматически вступит в силу; в настоящее время на продакшн-пути он не срабатывает.

#### D-2: Параметр конфигурации `worktree.symlinkDirectories`

**Схема:**

```jsonc
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "dist", ".turbo"],
  },
}
```

- Тип: `string[]`, по умолчанию `undefined` (не включено, opt-in).
- Пространство имён верхнего уровня `worktree` является новым (в `settingsSchema.ts` вставляется по алфавиту между `tools` и `ui`).
- Пути **относительно корня основного репозитория**. Абсолютные пути или пути, содержащие `..`, отклоняются защитой от обхода пути.

**Область действия:** Все worktree, созданные универсальным слоем, включая:
- `EnterWorktreeTool` (Phase A)
- `AgentTool` `isolation: 'worktree'` (Phase B)
- Флаг CLI `--worktree` (Phase D-1)

Worktree Arena не проходят через универсальный слой и **не** затрагиваются этой конфигурацией.

**Место реализации:** `GitWorktreeService.performPostCreationSetup()` — сразу за существующей `configureHooksPath()` (шаблон, установленный в Phase C). Добавляется новый метод `symlinkConfiguredDirectories()`, который проходит по конфигурации и вызывает `fs.symlink(absSource, absDest, 'dir')`.

**Обработка ошибок (fail-open):**

| Сценарий                        | Поведение                           |
| ------------------------------- | ----------------------------------- |
| Исходный каталог не существует (ENOENT) | Пропустить молча, debug log        |
| Целевой путь уже существует (EEXIST)    | Пропустить молча, debug log (не перезаписывать) |
| Обход пути (`../`, абсолютные пути и т.д.) | Отклонить эту запись, debug log warn |
| Другие ошибки ввода-вывода      | debug log warn, продолжить обработку следующих |

Само создание worktree **не** прерывается из-за ошибки symlink — тот же принцип "best-effort post-creation setup", что и `configureHooksPath()`.

#### D-3: Разрешение ссылки на PR (`--worktree=#<N>` / полный URL)

**Поддерживаемые формы:**

| Форма                                                           | Разрешённый номер PR |
| --------------------------------------------------------------- | -------------------- |
| `--worktree=#123`                                               | 123                  |
| `--worktree '#123'`                                             | 123                  |
| `--worktree https://github.com/foo/bar/pull/123`                | 123                  |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux` | 123                  |

**Именование slug и ветки:**

- slug: `pr-<N>` (специальный зарезервированный префикс, отличающийся от пользовательских slug).
- Ветка: `worktree-pr-<N>` (используется существующее правило именования `worktree-<slug>` из qwen-code; не используется прямое имя `pr-<N>`, чтобы избежать конфликта с локальными ветками `pr-<N>`).

**Стратегия fetch:**

```
git fetch origin pull/<N>/head
→ Использовать FETCH_HEAD как основу для нового worktree
```

Не полагается на CLI `gh` — чистый git fetch, поддерживает любой экземпляр GitHub (публичный или корпоративный), если удалённый репозиторий `origin` указывает на GitHub.

**Пути ошибок:**

| Сценарий                     | Сообщение об ошибке                                                              |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Удалённый репозиторий `origin` отсутствует | `--worktree=#<N> requires an "origin" remote that points at GitHub.`   |
| `git fetch` не удался        | `Failed to fetch PR #<N>: PR may not exist or origin remote is unreachable.`     |
| Тайм-аут сети (30 с)         | То же, дополнительно `(timeout)`                                                 |
| Удалённый репозиторий `origin` — не GitHub | Активная проверка не выполняется, `git fetch` сам завершится ошибкой (протокол PR специфичен для GitHub) |

**Связь с D-2:** К worktree для PR **также** применяется `symlinkDirectories` (пользователь ожидает сразу запустить тесты на PR, каталоги зависимостей должны быть доступны).

#### Затрагиваемые файлы

| Файл                                                         | Тип изменения                                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts`                          | Добавить опцию yargs `--worktree`; в интерфейс `CliArgs` добавить `worktree?: string \| boolean`                                               |
| `packages/cli/src/gemini.tsx`                                | После `loadCliConfig()` и до главного цикла вызвать новый helper `setupStartupWorktree()`                                                      |
| `packages/cli/src/startup/worktreeStartup.ts`                | Новый файл: `setupStartupWorktree()` для обработки разрешения slug, fetch PR, записи sidecar, смены cwd                                        |
| `packages/cli/src/nonInteractiveCli.ts`                      | Использовать тот же helper (уже есть логика внедрения `restoreWorktreeContext`, изменения не требуются)                                        |
| `packages/cli/src/acp-integration/acpAgent.ts`               | Использовать тот же helper                                                                                                                      |
| `packages/core/src/services/gitWorktreeService.ts`           | Добавить `parsePRReference()`, `fetchPullRequestRef()`, `symlinkConfiguredDirectories()`; `createUserWorktree()` может принимать опциональный параметр `baseBranchRef` |
| `packages/cli/src/config/settingsSchema.ts`                  | Добавить элемент верхнего уровня `worktree.symlinkDirectories: string[]`                                                                        |
| `packages/vscode-ide-companion/schemas/settings.schema.json` | Перегенерировать                                                                                                                                 |
| `docs/users/features/worktree.md`                            | Добавить раздел Quick Start CLI flag, добавить строку в таблицу Settings                                                                        |

#### Безопасность и откат

- **fail-open vs fail-close:** Ошибка symlink/hooks **не прерывает** создание worktree (тот же шаблон Phase C); ошибка fetch PR **прерывает** запуск (без базового ref невозможно создать worktree); ошибка валидации slug **прерывает** запуск (согласуется с `EnterWorktreeTool`).
- **Обход пути (path traversal):** Элементы `symlinkDirectories` должны разрешаться внутри `repoRoot`, иначе элемент отклоняется с записью в лог.
- **Тайм-аут fetch PR:** Жёсткий тайм-аут 30 секунд, чтобы не допустить зависания запуска при неотвечающей сети.
- **Побочные эффекты смены cwd:** После смены `process.cwd()` разрешение относительных путей (например, `--prompt-file ./foo.txt`) изменится. **Контрмера:** перед сменой cwd разрешить все относительные пути (конкретно — нормализовать на входе `setupStartupWorktree()`).

#### Открытые вопросы

1. **`--worktree-keep-on-exit`?** У claude-code нет, нужен ли qwen-code флаг CLI, чтобы Exit Dialog по умолчанию выбирал keep? Предлагается **пока не добавлять**, ждать отзывов пользователей.
2. **Требуется ли `worktree.symlinkDirectories` переопределение на уровне проекта?** Текущие настройки уже поддерживают трёхуровневое объединение (user/workspace/project), дополнительная обработка не нужна.
3. **Должен ли fetch PR получать `merge` ref (`pull/<N>/merge`, т.е. ref после слияния с base) вместо `head`?** claude-code использует `head` на том основании, что пользователь обычно хочет увидеть фактические изменения в PR. Следуем этому выбору.

---

### Future: Расширенные функции (по мере необходимости)

Следующие функции ориентированы на более специфические сценарии использования. На текущем этапе они не входят в планы, будут оцениваться после появления явных потребностей пользователей.

| Функция                  | Описание                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Sparse checkout          | Параметр конфигурации `worktree.sparsePaths`; в больших monorepo checkout только указанных путей, сокращение времени создания и дискового пространства |
| Файл `.worktreeinclude`  | Автоматически копировать в worktree файлы, игнорируемые gitignore (`.env`, `secrets.json` и т.д.)         |
| Интеграция с tmux        | `--worktree --tmux` — запуск сессии worktree в новом окне tmux                                           |