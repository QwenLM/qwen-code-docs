# Быстрое отображение git chip в Web Shell: сначала branch + кэш/пуш status

Дата: 2026-07-24
Статус: требует подтверждения

## Контекст и проблема

При создании новой сессии в Web Shell git chip на тулбаре композера появляется
медленно. Корневая причина (подтверждена построчно):

1. **На стороне демона branch блокируется дочерним процессом `git status`** —
   в `WorkspaceGitState.getStatus()`
   (`packages/cli/src/serve/workspace-git-state.ts`) для branch есть быстрый путь
   миллисекундного уровня (`resolveBranchName` читает файл `HEAD` + watcher
   reflog), но HTTP-ответ должен ждать завершения
   `getGitWorkingTreeStatus()` — каждый запрос синхронно запускает
   `git status --porcelain=v1 --branch -z` (`gitDiff.ts` runGit, таймаут 5s,
   нулевой кэш).
2. **Рендер chip на фронтенде гейтится полным status** — при новой сессии текст
   chip признает только `selectedWorkspaceGitStatus?.branch`
   (App.tsx 7860–7871), который ждет полного цикла HTTP + git status
   (effect в App.tsx 1480–1520), прежде чем сделать setState.
3. **Два одновременных запроса к одному маршруту** — получение метаданных в
   `DaemonSessionProvider` (`DaemonSessionProvider.tsx:1320`, использует только
   `.branch`) и git-status effect в App.tsx почти одновременно отправляют
   `GET /workspaces/:ws/git`, и демон запускает два одинаковых дочерних процесса.
4. Последовательный гейтинг: `activeWorkspaceCwd` зависит от предварительного
   завершения `GET /capabilities`.

## Цели и не цели

Цели:

- При новой сессии / первом экране git chip **появляется мгновенно** с текстом
  branch (один локальный HTTP RTT, миллисекундный уровень); счетчики
  dirty/ahead/behind/stash добавляются сразу, как только демон их вычислит
  (fresh-запрос с `wait: true`; при наличии сессии дополнительно есть
  live-пуш через SSE).
- Устранить дублирующие дочерние процессы `git status` (дедупликация конкурентных
  запросов + stale-while-revalidate).
- Без регрессий: chip workspace в сайдбаре (нужны счетчики), chip сессии
  worktree, detached HEAD, не-git workspace, деградация при сбое git.

Не цели:

- Для пути worktree `?cwd=` не вводить watcher/кэш (сохранить текущее поведение:
  прямое вычисление, чтобы не утекал по одному fs watcher на каждый worktree).
  Задержка chip worktree не меняется.
- Не делать прогрев при старте демона (фронтенд все равно запросит сразу после
  capabilities, выгода от прогрева мала).
- Не менять существующую семантику `git_branch_changed`.

## Обзор решения

Три слоя изменений: кэш демона + фоновое обновление + пуш SSE (P0), двухфазный
ответ (P1), потребление SSE фронтендом с сохранением медленного пути для
нуждающихся в нем вызывающих сторон (P2 пересмотрен, см. ниже).

### P0+P1: демон — кэш, дедупликация, фоновое обновление, пуш SSE в `WorkspaceGitState`

Расширение `WorkspaceGitEntry`:

```ts
interface WorkspaceGitEntry {
  branch: string | undefined; // watcher поддерживает свежесть (как сейчас)
  dispose: () => void; // как сейчас
  status?: GitWorkingTreeStatus; // последняя вычисленная сырая working-tree summary
  statusComputedAt?: number; // epoch ms
  statusPromise?: Promise<void>; // дедупликация in-flight
  disposed?: boolean; // запрет publish после dispose
}
```

Семантика `getStatus(cwd, bridge, opts?: { wait?: boolean })` меняется на:

- **По умолчанию (fast path)**: гарантирует существование entry (branch
  возвращается за миллисекунды); запускает одно фоновое обновление по
  stale-while-revalidate (см. ниже); **немедленно возвращает** последний
  кэшированный status (materialize: overlay `entry.branch ?? status.branch`,
  форма v2 + `computedAt`); если никогда не вычислялся, возвращает только branch
  `{ v, workspaceCwd, branch }` (без `computedAt`; фронтенд по этому различает
  «не вычислено» и «clean»).
- **`wait: true`**: ждет (или инициирует и ждет, с переиспользованием in-flight)
  одно свежее вычисление, возвращает полный status. При сбое вычисления
  деградирует до branch-only (текущая семантика).

Фоновое обновление `refreshStatus(entry)`:

- Переиспользование in-flight: если `statusPromise` существует, возвращается он.
- Троттлинг: если с последнего запуска < 2s — пропуск (защита от последовательных
  очередей дочерних процессов git при focus-шторме).
- Вычисление успешно и есть расхождение с кэшированными enriched-полями →
  обновление кэша + пуш materialized полного status через
  `bridge.publishWorkspaceEvent({ type: 'git_status_changed', data })`
  (data — это `DaemonWorkspaceGitStatus`, включает workspaceCwd).
  Первое вычисление (кэш пуст) считается расхождением и пушится всегда — это
  канал добавления счетчиков на chip при холодном старте.
- Нет расхождений → только обновление кэша, без пуша (чтобы polling каждые 30s
  не вызывал setState/re-render фронтенда).
- Сбой вычисления / не git-директория → сохранение старого кэша, без пуша.
- entry уже disposed → без пуша.

**Без TTL**. last-known + фоновое обновление на каждый GET + корректирующий SSE
достаточны; троттлинг 2s выполняет роль «предохранителя от TTL». Вызывающие
стороны с `wait: true` всегда получают свежее вычисление (переиспользование
in-flight).

Маршруты (`packages/cli/src/serve/routes/workspace-git.ts`):

- `/workspace/git` и `/workspaces/:workspace/git` парсят `?wait=1` и прозрачно
  передают его в `getStatus`. По умолчанию fast.
- Ветка worktree `?cwd=` сохраняет текущее поведение (прямой вызов
  `getGitWorkingTreeStatus`, без кэша).

### SDK (`packages/sdk-typescript`)

- `events.ts`: `DAEMON_KNOWN_EVENT_TYPE_VALUES` пополняется `'git_status_changed'`
  (сразу после `'git_branch_changed'`). Старый SDK молча отбрасывает его через
  `asKnownDaemonEvent` — обратная совместимость, bump протокола не нужен
  (та же схема, что у `followup_suggestion`).
- `ui/normalizer.ts`: `case 'git_status_changed': return [];` (как и
  `git_branch_changed`, обрабатывается session mappers, не попадает в поток
  нормализации UI).
- Сигнатура `DaemonClient.workspaceGit` меняется на объект опций:
  `workspaceGit(opts?: { cwd?: string; wait?: boolean })`, сборка query
  (`cwd` и `wait=1` комбинируются). Миграция всех 4 точек вызова (App.tsx,
  WorkspaceSection, DaemonSessionProvider ×2) и юнит-тестов SDK.

### webui (`packages/webui`)

- `session/types.ts`: `DaemonConnectionState` пополняется
  `gitStatus?: DaemonWorkspaceGitStatus` (только полный status текущего
  workspace, поддерживается через SSE).
- `session/mappers.ts`: `updateConnectionFromDaemonEvent` пополняется
  `case 'git_status_changed'` — если `data.workspaceCwd` не совпадает с
  `current.workspaceCwd`, событие игнорируется (зеркало guard из
  `git_branch_changed`), иначе `setConnection({ ...current, gitStatus: data })`.

### web-shell (`packages/web-shell`)

- git-status effect в `App.tsx`: композер использует **клиентский
  stale-while-revalidate** — на каждый запуск отправляются два конкурентных
  запроса (кроме сессий worktree, см. ниже):
  1. `workspaceGit({ cwd: sessionWorktree?.path })` (fast): last-known
     возвращается мгновенно, сразу рендерится (холодный кэш, branch-only);
  2. `workspaceGit({ wait: true })` (fresh): демон возвращает полный status
     сразу после фонового вычисления, добавляя счетчики. Оба запроса на стороне
     демона разделяют одно вычисление (дедупликация in-flight), не увеличивая
     число дочерних процессов git.
- **Почему fresh-запрос обязательно должен существовать (найдено обратным
  аудитом)**: SSE `git_status_changed` идет через поток событий каждой сессии
  (`GET /session/:id/events`), **а состояние новой сессии (deferred connect,
  без sessionId) не имеет подписки SSE** — с одним только fast GET счетчики
  появятся лишь через 30s polling или при focus. fresh-запрос не зависит от
  существования сессии и гарантирует «branch мгновенно, счетчики сразу после
  вычисления» во всех состояниях сессии. (У `git_branch_changed` уже сегодня
  та же слепая зона без сессии, это не регрессия.)
- В `App.tsx` остается и SSE-sync effect: при изменении `connection.gitStatus`,
  совпадении `workspaceCwd` и отсутствии `sessionWorktree` записывается в
  `selectedWorkspaceGitStatus` — покрывает live-пуш между двумя polling-запросами
  **при наличии сессии** (фоновое обновление, инициированное другим
  клиентом/CLI, приходит пушем).
- Сессия worktree отправляет только fast-запрос: путь `?cwd=` и так обходит кэш
  и вычисляет напрямую (fast и wait эквивалентны), поведение не меняется.
- `sidebar/WorkspaceSection.tsx`: `workspaceGit({ wait: true })` — chip сайдбара
  нуждается в счетчиках и не имеет двойного канала SSE/fresh, поэтому сохраняется
  блокирующая семантика (текущее поведение не меняется; у неактивных workspace
  нет канала SSE).

### Пересмотр P2 (обрезка по ценности)

Первоначальный P2 (дедупликация на фронтенде: provider при первом получении
сохраняет полный status для переиспользования App) **понижен до «не делать»**:
дедупликация in-flight на стороне демона в P0 уже устраняет дублирующие
дочерние процессы `git status` (суть исходной проблемы), а остаток — лишь один
миллисекундный локальный HTTP-обмен. Сохранение полного status в provider и его
переиспользование App внесло бы межслойную связанность (протокол начальных
значений provider→App), а выгода примерно нулевая. Оба вызова `workspaceGit()`
в provider берут только `.branch` — достаточно дефолтного fast path, ноль
изменений.

## Совместимость

- Форма ответа маршрутов не меняется (v2, enriched-поля и так опциональны);
  новый query `?wait=1` опционален.
- Изменение семантики дефолтного fast path: вызывающие стороны могут получить
  last-known (старый кэш) вместо свежего вычисления. Все существующие
  вызывающие стороны проверены по одной:
  - `DaemonSessionProvider` (×2): читает только `.branch` — branch всегда свежий
    (watcher), влияния нет.
  - chip композера в App.tsx: именно тот, для кого этот дизайн.
  - WorkspaceSection: явно переведен на `wait: true`, семантика не меняется.
- Новый SSE-событие молча отбрасывается старыми клиентами (механизм known-list SDK).
- `git status_changed` публикуется только в session SSE bus данного workspace
  (существующий механизм `publishWorkspaceEvent`, включая изоляцию нескольких
  workspace).

## Риски и смягчение

| Риск                                                                    | Смягчение                                                                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| chip сначала показывает branch, потом появляются счетчики, ширина тулбара прыгает | Существующая скрытая измерительная копия (ChatEditor toolbar-measure) обрабатывает re-measure; принимается небольшой shift |
| branch-only ответ ошибочно читается как «clean»                          | branch-only не содержит `computedAt`; существующая логика GitBranchIndicator не показывает «clean» без `computedAt` |
| Кэшированный status не совпадает с branch из watcher                     | При materialize накладывается overlay `entry.branch ?? status.branch` (текущая логика сохранена)             |
| Утечка фонового обновления (publish после dispose)                       | guard по флагу `disposed`                                                                                    |
| focus-шторм вызывает последовательные spawn git                          | троттлинг 2s + переиспользование in-flight                                                                    |

## План тестирования

Юнит-тесты:

- `workspace-git-state.test.ts` (расширяется): fast path немедленно возвращает
  last-known; холодный кэш возвращает branch-only без `computedAt`; фоновое
  обновление публикует `git_status_changed` только при расхождении; первое
  вычисление публикуется всегда; конкурентные getStatus запускают только одно
  `getGitWorkingTreeStatus`; троттлинг 2s; `wait: true` ждет свежего вычисления;
  сбой вычисления сохраняет старый кэш без публикации; после dispose публикации нет.
- `routes/workspace-git.test.ts` (расширяется): прозрачная передача `?wait=1`;
  путь worktree `?cwd=` не попадает в кэш (сохраняется прямое вычисление).
- SDK `DaemonClient.test.ts`: сборка query объекта опций (cwd / wait / комбинация).
- webui `mappers.test.ts`: две ветки `git_status_changed` с совпадающим и
  несовпадающим workspaceCwd.

E2E (`.qwen/e2e-tests/2026-07-24-git-chip-fast-branch.md`, добавляется на
этапе верификации): реальный демон + web shell, новая сессия в большом
workspace — chip (branch) появляется сразу после готовности редактора, счетчики
добавляются следом; поведение chip сайдбара не меняется; focus/30s polling
по-прежнему обновляют; chip сессии worktree без изменений.

## Отклоненные альтернативы

- **TTL-кэш (без фонового обновления/SSE)**: ускоряет только повторные запросы,
  холодный старт все равно ждет git status — не решает основную жалобу
  «chip медленный при новой сессии».
- **Прогрев демона после capabilities**: первый GET почти одновременный с
  прогревом, после дедупликации in-flight выгода ≈ 0.
- **Только дедупликация/объединение запросов на фронтенде**: не устраняет
  ожидание дочернего процесса git status, лишь косметика.
