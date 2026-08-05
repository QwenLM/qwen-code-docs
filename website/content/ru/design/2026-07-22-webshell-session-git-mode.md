# Выбор Git-режима новой сессии в Web Shell

## Контекст

В повседневной разработке при создании новой сессии у пользователя есть три Git-воркфлоу:

1. **Текущая ветка** — разработка прямо на текущей ветке (поведение по умолчанию)
2. **Изоляция worktree** — создается независимый worktree + ветка, основная директория не затрагивается
3. **Новая ветка** — создается новая ветка в той же рабочей директории и выполняется переключение на нее

Сценарии 1 и 2 уже полностью поддерживаются (сценарий 2 см. в
[2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md)
и
[2026-07-20-worktree-empty-state-toggle.md](./2026-07-20-worktree-empty-state-toggle.md)).
Сценарий 3 отсутствует — если пользователь хочет «открыть новую ветку для этой задачи»,
ему приходится сначала вручную выполнять `git checkout -b`, а затем создавать сессию,
либо вынужденно использовать worktree (привнося ненужную изоляцию директорий).

## Цели

- Предоставить в пустом состоянии чата единый **селектор Git-режима**, покрывающий три сценария.
- Режим «новая ветка»: демон автоматически выполняет `git checkout -b` при `POST /session`,
  сессия запускается прямо на новой ветке.
- Переиспользовать существующую цепочку создания worktree, не меняя поведение worktree.
- Обратная совместимость: без передачи новых параметров поведение полностью неизменно.

## Не цели

- Не поддерживать checkout существующих веток (v1 делает только создание; переключение на существующую ветку можно добавить инкрементально позже).
- Не делать автоматического переключения обратно на исходную ветку при завершении сессии (чтобы не терять состояние пользователя).
- Не делать UI merge-back.
- Не менять поведение инструментов `enter_worktree` / `exit_worktree`.

## Дизайн

### UI пустого состояния: Git Chip внутри Composer

Селектор режима не делается отдельным блоком, а **встраивается в нижнюю панель инструментов composer** —
переиспользуя положение существующего git chip (под полем ввода, слева от кнопки отправки).
Chip по умолчанию показывает текущую ветку `⎇ main`, клик открывает popover выбора режима:

```text
┌─ composer ───────────────────────────────────────────┐
│  描述你的任务…                                        │
│                                                      │
│  📎  @  🎙              [⎇ main ▾]  [发送]           │
└──────────────────────────────────────────────────────┘
                              │ 点击
                              ▼
              ┌─ Git 模式 popover ─────────────┐
              │  ● 当前分支   直接在 main 上    │
              │  ○ 新建分支   从 main 创建      │
              │    [分支名输入框 — 选中时展开]   │
              │  ○ Worktree   独立副本，可并行   │
              │  ─────────────────────────────  │
              │  $ git checkout -b feat/x ← main│
              │                    [创建分支]    │
              └─────────────────────────────────┘
```

- **Текущая ветка** (по умолчанию): chip показывает `⎇ main` (зеленым), эквивалентно существующему поведению.
  После выбора popover автоматически закрывается.
- **Новая ветка**: внутри popover раскрывается поле ввода имени ветки + предупреждение о параллельности, валидация в реальном времени
  (легитимное имя git-ветки, отсутствие конфликта с существующими ветками). После подтверждения chip становится
  `⎇ → feat/xxx` (оранжевым) с ✕ для возврата к значению по умолчанию в один клик.
- **Изоляция worktree**: показывается автоматически сгенерированный предпросмотр slug. После подтверждения chip становится
  `⎇ worktree 隔离` (фиолетовым) с ✕ для возврата к значению по умолчанию в один клик.

Внизу popover в реальном времени предпросматривается git-команда, которая будет выполнена (`git checkout -b …` /
`git worktree add …`), чтобы пользователь точно понимал, что произойдет.

Преимущества варианта с chip: не занимает вертикальное пространство зоны welcome; точка входа находится внутри
composer, где сосредоточено внимание пользователя; в непустом состоянии (уже есть сессия) chip по-прежнему виден, семантика консистентна.

Условия видимости совпадают с существующим переключателем worktree: workspace доверен + является git-репозиторием.
При невыполнении chip деградирует в индикатор ветки только для чтения (существующее поведение).

#### Машина состояний

`pendingWorktreeRef` / `worktreePending` расширяются до единого намерения pending:

```typescript
type SessionGitIntent =
  | { mode: 'current' }
  | { mode: 'branch'; name: string }
  | { mode: 'worktree'; slug?: string };
```

- Выбор «текущая ветка» → `{ mode: 'current' }` (эквивалентно `undefined`, параметры не передаются).
- Выбор «новая ветка» → `{ mode: 'branch', name }`.
- Выбор «Worktree» → `{ mode: 'worktree', slug? }` (переиспользует существующую логику).
- Отправка первого сообщения → `ensureSessionForPrompt` в соответствии с intent несет соответствующие параметры.
- После успешного создания intent очищается; при сбое сохраняется для повторной попытки.

### Изменения API

#### `CreateSessionRequest` (SDK)

```typescript
export interface CreateSessionRequest {
  // ... existing fields ...
  worktree?: { slug?: string };
  /**
   * Create a new git branch and check it out before starting the
   * session. The session runs in the same working directory but on
   * the new branch. Mutually exclusive with `worktree`.
   */
  branch?: { name: string };
}
```

`branch` и `worktree` взаимно исключают друг друга; одновременная передача возвращает 400.

#### Ответы `DaemonSession` / `DaemonSessionSummary`

```typescript
export interface DaemonBranchInfo {
  name: string; // имя новой созданной ветки
  baseBranch: string; // базовая ветка на момент создания
}

export interface DaemonSession {
  // ... existing fields ...
  worktree?: DaemonWorktreeInfo;
  branch?: DaemonBranchInfo;
}
```

#### Обработка маршрута `POST /session` (`routes/session.ts`)

Перед существующей логикой обработки worktree добавляется обработка branch:

```text
1. 校验 branch / worktree 互斥
2. 校验 branch.name 是合法 git 分支名
3. 检查分支名不与现有分支冲突（git rev-parse --verify）
4. 检测 dirty tree（git status --porcelain），有改动则 409 branch_dirty_tree
5. 记录 baseBranch = 当前分支（git rev-parse --abbrev-ref HEAD）
6. git checkout -b <name>
7. branchMeta = { name, baseBranch }
8. 强制 sessionScope = 'thread'
9. 正常 spawnOrAttach（cwd 不变）
10. 失败回滚：git checkout <baseBranch> && git branch -D <name>
```

`changeSessionCwd` не нужен (рабочая директория не меняется), маркер worktree не нужен.

#### Коды ошибок

| Код ошибки                       | Значение                                                                  |
| -------------------------------- | ------------------------------------------------------------------------- |
| `branch_and_worktree_conflict` | Одновременно переданы `branch` и `worktree`                               |
| `invalid_branch`               | Поле `branch` не является объектом (должно быть `{"name":"..."}`)        |
| `branch_invalid_name`          | Имя ветки нелегитимно                                                     |
| `branch_session_conflict`      | В этом workspace уже есть branch-сессия, либо на общем чекауте уже есть другая активная сессия |
| `branch_init_failed`           | Не удалось инициализировать git-сервис                                    |
| `branch_not_git_repo`          | Workspace не является git-репозиторием                                    |
| `branch_already_exists`        | Имя ветки уже существует                                                  |
| `branch_status_failed`         | Не удалось проверить состояние рабочей директории                         |
| `branch_dirty_tree`            | В рабочей директории есть незакоммиченные изменения, сначала нужен commit или stash |
| `branch_checkout_failed`       | `git checkout -b` не удался (по другим причинам)                          |

### Цепочка передачи параметров фронтенда

```text
App.tsx (gitIntent state)
  → sessionPreparation.ts createAndAttachSessionForPrompt({ branch })
    → actions.ts createSession({ branch })
      → DaemonClient.createOrAttachSession({ branch })
        → POST /session { branch: { name } }
```

Полностью симметрична цепочке worktree; на каждом уровне добавляется проброс `branch`.

### Отображение в сайдбаре

- Сессия worktree: существующий бейдж `GitForkIcon`, без изменений.
- Сессия branch: отображается `GitBranchIcon` + бейдж с именем ветки.
- Обычная сессия: без бейджа, без изменений.

### Ограничения параллельности

Сессия «новая ветка» в одном workspace меняет HEAD общей рабочей директории; несколько
branch-сессий конфликтуют друг с другом. Стратегия ограничения:

- **Серверная сторона**: `POST /session` с `branch` проверяет, есть ли в том же workspace уже
  активная branch-сессия (через список сессий бриджа + `branchMeta`).
  Если есть, возвращает 409 `branch_session_conflict`.
- **Фронтенд**: при выборе «новой ветки» в пустом состоянии, если уже есть активная branch-сессия, показывается подсказка
  и выбор отключается.

На сессии worktree это ограничение не распространяется (у каждой своя независимая директория).

### Изменения файлов

| Файл                                                               | Изменение                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`               | В `CreateSessionRequest` добавлено поле `branch`                           |
| `packages/sdk-typescript/src/daemon/types.ts`                      | `DaemonBranchInfo`, `DaemonSession.branch`, `DaemonSessionSummary.branch`  |
| `packages/cli/src/serve/routes/session.ts`                         | Логика создания branch в `POST /session` + откат                           |
| `packages/webui/src/daemon/session/actions.ts`                     | Проброс `branch` в `createSession`                                          |
| `packages/webui/src/daemon/session/types.ts`                       | В сигнатуру `createSession` добавлен `branch`                              |
| `packages/web-shell/client/App.tsx`                                | Машина состояний `SessionGitIntent`, UI селектора режима, проверка параллельности |
| `packages/web-shell/client/App.module.css`                         | Стили селектора                                                            |
| `packages/web-shell/client/utils/sessionPreparation.ts`            | Проброс `branch`                                                            |
| `packages/web-shell/client/i18n.tsx`                               | Новые i18n-ключи (en/zh)                                                    |
| `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx` | Бейдж branch-сессии                                                        |

### i18n

| Ключ                             | EN                                                     | ZH                                       |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `gitMode.current`                | `Current branch`                                       | `当前分支`                               |
| `gitMode.branch`                 | `New branch`                                           | `新建分支`                               |
| `gitMode.worktree`               | `Worktree`                                             | `Worktree 隔离`                          |
| `gitMode.branch.placeholder`     | `Branch name`                                          | `分支名`                                 |
| `gitMode.branch.hint`            | `Switches the working directory to a new branch`       | `在工作目录中切换到新分支`               |
| `gitMode.branch.conflictWarning` | `Only one branch session per workspace at a time`      | `同一 workspace 同时只能有一个分支会话`  |
| `gitMode.branch.invalidName`     | `Invalid branch name`                                  | `分支名不合法`                           |
| `gitMode.branch.exists`          | `Branch already exists`                                | `分支已存在`                             |
| `gitMode.branch.dirtyTree`       | `Uncommitted changes detected. Commit or stash first.` | `检测到未提交改动，请先 commit 或 stash` |

## Решенные вопросы

1. **Значение имени ветки по умолчанию**: не генерировать автоматически, вводится пользователем. Поле ввода пустое + подсказка placeholder
   (например, `feat/my-feature`), меньше предположений.
2. **Dirty working tree**: серверная сторона перед `git checkout -b` проверяет состояние dirty
   (`git status --porcelain`). Если есть незакоммиченные изменения, возвращает 409
   `branch_dirty_tree`, фронтенд подсказывает пользователю сначала сделать commit или stash, затем создавать branch-сессию.
   Пре-проверка на уровне UI не делается (чтобы не расходиться с реальным поведением git), решение унифицированно принимает серверная сторона.
3. **Возобновление сессии (resume)**: sidecar не нужен. Worktree требует sidecar, потому что
   рабочая директория отделена от основного репозитория, и при resume необходимо знать путь worktree. У branch-сессии
   рабочая директория — исходная, `git branch` позволяет узнать текущую ветку, дополнительные записи не нужны.
   Замечание: `DaemonSessionSummary.branch` в настоящее время хранится только в памяти (маппинг бриджа),
   после перезапуска демона теряется, поэтому бейдж сайдбара и защита параллельности не переживают перезапуск;
   персистентность относится к последующей работе.
