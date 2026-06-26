# План реализации фазы C для Worktree

> **Для агентных работников:** ОБЯЗАТЕЛЬНЫЙ ДОПОЛНИТЕЛЬНЫЙ НАВЫК: Используйте superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans для реализации плана задача за задачей. Шаги используют синтаксис чекбоксов (`- [ ]`) для отслеживания.

**Цель:** Добавить постоянство сессий для worktree, инициализацию hooksPath, отображение статуса в Footer и диалог выхода, чтобы worktree можно было восстановить после `--resume`, а пользователь всегда знал, в какой изоляционной среде находится.

**Архитектура:** Добавить sidecar JSON-файл `WorktreeSession` (сосуществует с JSONL session-файлами), который записывается при `EnterWorktree` и очищается при `ExitWorktree`; CLI-слой через хук `useWorktreeSession` отслеживает изменения файла и синхронизирует их с `UIState.activeWorktree`; Footer читает это поле и встроенно отображает строку worktree; `WorktreeExitDialog` перехватывает второе нажатие Ctrl+C при обнаружении активного worktree.

**Tech Stack:** TypeScript, React (Ink), Node.js `fs.watch`, `simple-git`, Vitest

---

## Структура файлов

| Действие | Файл                                                         | Описание                                                                     |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Создание | `packages/core/src/services/worktreeSessionService.ts`       | Интерфейс WorktreeSession + функции чтения/записи/очистки                    |
| Создание | `packages/core/src/services/worktreeSessionService.test.ts`  | Модульные тесты                                                              |
| Изменение | `packages/core/src/services/sessionService.ts`               | Добавить публичный метод `getWorktreeSessionPath()`                          |
| Изменение | `packages/core/src/services/gitWorktreeService.ts`           | После `createUserWorktree()` / `createAgentWorktree()` добавить настройку `core.hooksPath` |
| Изменение | `packages/core/src/services/gitWorktreeService.test.ts`      | Тесты для hooksPath                                                          |
| Изменение | `packages/core/src/tools/enter-worktree.ts`                  | После создания worktree записать WorktreeSession                             |
| Изменение | `packages/core/src/tools/enter-worktree.test.ts`             | Тесты записи сессии                                                          |
| Изменение | `packages/core/src/tools/exit-worktree.ts`                   | После выхода из worktree очистить WorktreeSession                            |
| Изменение | `packages/core/src/tools/exit-worktree.test.ts`              | Тесты очистки сессии                                                         |
| Создание | `packages/cli/src/ui/hooks/useWorktreeSession.ts`            | Отслеживать sidecar-файл, возвращать текущий WorktreeSession                 |
| Изменение | `packages/cli/src/ui/contexts/UIStateContext.tsx`            | Добавить поле `activeWorktree`                                               |
| Изменение | `packages/cli/src/ui/AppContainer.tsx`                       | Синхронизировать `activeWorktree`, передавать контекст resume, перехватывать выход |
| Изменение | `packages/cli/src/ui/hooks/useStatusLine.ts`                 | В `StatusLineCommandInput` добавить поле `worktree`                          |
| Изменение | `packages/cli/src/ui/components/Footer.tsx`                  | Встроить отображение строки worktree                                         |
| Создание | `packages/cli/src/ui/components/WorktreeExitDialog.tsx`      | Диалог-подсказка при выходе                                                  |
| Создание | `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx` | Тесты компонента                                                             |
| Изменение | `packages/cli/src/ui/components/DialogManager.tsx`           | Зарегистрировать WorktreeExitDialog                                          |

---

## Задача 1: Sidecar-хранение WorktreeSession

**Файлы:**

- Создать: `packages/core/src/services/worktreeSessionService.ts`
- Создать: `packages/core/src/services/worktreeSessionService.test.ts`
- Изменить: `packages/core/src/services/sessionService.ts`

- [ ] **Шаг 1: Создать `worktreeSessionService.ts`**

```typescript
// packages/core/src/services/worktreeSessionService.ts
import * as fs from 'node:fs/promises';
import { isNodeError } from '../utils/errors.js';

export interface WorktreeSession {
  slug: string;
  worktreePath: string;
  worktreeBranch: string;
  originalCwd: string;
  originalBranch: string;
  /** HEAD commit SHA at the moment the worktree was created. Used by WorktreeExitDialog to count new commits. */
  originalHeadCommit: string;
}

export async function readWorktreeSession(
  filePath: string,
): Promise<WorktreeSession | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as WorktreeSession;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeWorktreeSession(
  filePath: string,
  session: WorktreeSession,
): Promise<void> {
  await fs.mkdir(require('node:path').dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}

export async function clearWorktreeSession(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return;
    throw error;
  }
}
```

- [ ] **Шаг 2: Написать провальные тесты**

```typescript
// packages/core/src/services/worktreeSessionService.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readWorktreeSession,
  writeWorktreeSession,
  clearWorktreeSession,
  type WorktreeSession,
} from './worktreeSessionService.js';

const sample: WorktreeSession = {
  slug: 'my-feature',
  worktreePath: '/repo/.qwen/worktrees/my-feature',
  worktreeBranch: 'worktree-my-feature',
  originalCwd: '/repo',
  originalBranch: 'main',
};

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wt-session-test-'));
  filePath = path.join(tmpDir, 'test.worktree.json');
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('readWorktreeSession', () => {
  it('returns null when file does not exist', async () => {
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('reads back what was written', async () => {
    await fs.writeFile(filePath, JSON.stringify(sample), 'utf-8');
    expect(await readWorktreeSession(filePath)).toEqual(sample);
  });
});

describe('writeWorktreeSession', () => {
  it('writes a readable JSON file', async () => {
    await writeWorktreeSession(filePath, sample);
    const raw = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(sample);
  });

  it('overwrites existing file', async () => {
    await writeWorktreeSession(filePath, sample);
    const updated = { ...sample, slug: 'updated' };
    await writeWorktreeSession(filePath, updated);
    expect(await readWorktreeSession(filePath)).toEqual(updated);
  });
});

describe('clearWorktreeSession', () => {
  it('deletes the file', async () => {
    await writeWorktreeSession(filePath, sample);
    await clearWorktreeSession(filePath);
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('is a no-op when file does not exist', async () => {
    await expect(clearWorktreeSession(filePath)).resolves.not.toThrow();
  });
});
```

- [ ] **Шаг 3: Запустить тесты и убедиться, что они падают**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

Ожидаемый результат: `FAIL` — модуль не существует.

- [ ] **Шаг 4: Исправить вызов require в `writeWorktreeSession`**

В `worktreeSessionService.ts` используется `path.dirname`, нужно импортировать `node:path` вверху файла:

```typescript
// Заменить "require('node:path').dirname(filePath)" на правильный импорт
import * as path from 'node:path';

export async function writeWorktreeSession(
  filePath: string,
  session: WorktreeSession,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}
```

- [ ] **Шаг 5: Запустить тесты и убедиться, что они проходят**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

Ожидаемый результат: `PASS` — 6 тестов пройдено.

- [ ] **Шаг 6: Добавить `getWorktreeSessionPath()` в `SessionService`**

В `packages/core/src/services/sessionService.ts` найти метод `private getChatsDir()` (примерно строка 180), после него добавить:

```typescript
getWorktreeSessionPath(sessionId: string): string {
  return path.join(this.getChatsDir(), `${sessionId}.worktree.json`);
}
```

- [ ] **Шаг 7: Проверка типов**

```bash
cd packages/core
npm run typecheck
```

Ожидаемый результат: без ошибок.

- [ ] **Шаг 8: Коммит**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/services/worktreeSessionService.test.ts \
        packages/core/src/services/sessionService.ts
git commit -m "feat(worktree): add WorktreeSession sidecar storage"
```

---

## Задача 2: Настройка hooksPath после создания

**Файлы:**

- Изменить: `packages/core/src/services/gitWorktreeService.ts:1133-1158` (`createUserWorktree`)
- Изменить: `packages/core/src/services/gitWorktreeService.test.ts`

- [ ] **Шаг 1: Написать провальные тесты**

В `gitWorktreeService.test.ts` найти группу тестов `createUserWorktree`, добавить:

```typescript
it('configures core.hooksPath to main repo after creation', async () => {
  const result = await service.createUserWorktree('hooks-test');
  expect(result.success).toBe(true);

  const worktreePath = result.worktree!.path;
  const worktreeGit = simpleGit(worktreePath);
  const hooksPath = await worktreeGit.raw([
    'config',
    '--local',
    'core.hooksPath',
  ]);
  // Should point to the main repo's .git/hooks
  expect(hooksPath.trim()).toContain('.git/hooks');
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configures core.hooksPath"
```

Ожидаемый результат: `FAIL` — hooksPath пуст.

- [ ] **Шаг 3: Добавить настройку hooksPath в `createUserWorktree`**

В `gitWorktreeService.ts` найти `createUserWorktree`, после вызова `git worktree add` (примерно строка 1140), перед `return { success: true, worktree }` добавить:

```typescript
// Configure hooksPath so commits inside this worktree run the main
// repo's hooks. Priority: .husky/ (common) → .git/hooks (fallback).
// Mirrors claude-code's performPostCreationSetup() logic.
try {
  const huskyPath = path.join(this.sourceRepoPath, '.husky');
  const gitHooksPath = path.join(this.sourceRepoPath, '.git', 'hooks');
  let hooksPath: string | null = null;
  for (const candidate of [huskyPath, gitHooksPath]) {
    try {
      await fs.stat(candidate);
      hooksPath = candidate;
      break;
    } catch {
      // Not found — try next.
    }
  }
  if (hooksPath) {
    const worktreeGit = simpleGit(worktreePath);
    // Skip the subprocess if core.hooksPath is already set to the same value
    // (~14ms spawn overhead per claude-code's comment on parseGitConfigValue).
    let existing = '';
    try {
      existing = (
        await worktreeGit.raw(['config', '--local', 'core.hooksPath'])
      ).trim();
    } catch {
      // Key not set — empty string means "proceed".
    }
    if (existing !== hooksPath) {
      await worktreeGit.raw(['config', 'core.hooksPath', hooksPath]);
    }
  }
} catch (hookError) {
  debugLogger.warn(
    `createUserWorktree: failed to set core.hooksPath: ${hookError}`,
  );
  // Non-fatal: worktree is usable, just without inherited hooks.
}
```

`this.sourceRepoPath` — это приватное поле, присваиваемое в конструкторе `GitWorktreeService` (`this.sourceRepoPath = path.resolve(sourceRepoPath)`, примерно строка 224). Необходимо убедиться, что вверху файла есть `import * as fs from 'node:fs/promises'`.

- [ ] **Шаг 4: Сделать то же самое для `createAgentWorktree`**

Найти метод `createAgentWorktree` и после вызова `git worktree add` добавить такой же блок кода для hooksPath (полный код из шага 3; `slug` берётся из параметров agent worktree).

- [ ] **Шаг 5: Запустить тесты и убедиться, что они проходят**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configures core.hooksPath"
```

Ожидаемый результат: `PASS`.

- [ ] **Шаг 6: Коммит**

```bash
git add packages/core/src/services/gitWorktreeService.ts \
        packages/core/src/services/gitWorktreeService.test.ts
git commit -m "feat(worktree): configure core.hooksPath after worktree creation"
```

---

## Задача 3: EnterWorktreeTool записывает WorktreeSession

**Файлы:**

- Изменить: `packages/core/src/tools/enter-worktree.ts`
- Изменить: `packages/core/src/tools/enter-worktree.test.ts`

- [ ] **Шаг 1: Написать провальные тесты**

После успешного теста создания в `enter-worktree.test.ts` добавить:

```typescript
import { readWorktreeSession } from '../services/worktreeSessionService.js';

it('writes WorktreeSession sidecar after creating worktree', async () => {
  // Arrange: use the existing test setup that creates a real git repo
  // and invokes the tool (copy from existing "custom name" test)
  const result = await invokeTool(tool, { name: 'session-test' });
  expect(result.error).toBeUndefined();

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  const session = await readWorktreeSession(sessionPath);

  expect(session).not.toBeNull();
  expect(session!.slug).toBe('session-test');
  expect(session!.worktreePath).toContain('session-test');
  expect(session!.worktreeBranch).toBe('worktree-session-test');
  expect(session!.originalCwd).toBeTruthy();
  expect(session!.originalBranch).toBeTruthy();
  expect(session!.originalHeadCommit).toMatch(/^[0-9a-f]{7,40}$/);
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts -t "writes WorktreeSession"
```

Ожидаемый результат: `FAIL` — файл сессии отсутствует.

- [ ] **Шаг 3: Изменить `enter-worktree.ts`, добавив запись сессии после успешного создания**

Вверху `enter-worktree.ts` добавить импорт:

```typescript
import { writeWorktreeSession } from '../services/worktreeSessionService.js';
```

В методе `execute()` после получения `baseBranch` и до вызова `createUserWorktree()` захватить текущий HEAD commit:

```typescript
// Capture HEAD before branching — WorktreeExitDialog uses this to count
// new commits created inside the worktree (mirrors claude-code approach).
let originalHeadCommit = '';
try {
  originalHeadCommit = await service.getHeadCommit();
} catch {
  // Non-fatal.
}
```

Также добавить публичный метод в `GitWorktreeService` (`gitWorktreeService.ts`, рядом с `getCurrentBranch()`):

```typescript
async getHeadCommit(): Promise<string> {
  try {
    return (await this.git.raw(['rev-parse', '--short', 'HEAD'])).trim();
  } catch {
    return '';
  }
}
```

После вызова `writeWorktreeSessionMarker(...)` добавить:

```typescript
// Persist worktree session so --resume can restore context.
try {
  await writeWorktreeSession(
    this.config
      .getSessionService()
      .getWorktreeSessionPath(this.config.getSessionId()),
    {
      slug,
      worktreePath: result.worktree.path,
      worktreeBranch: result.worktree.branch,
      originalCwd: projectRoot,
      originalBranch: baseBranch ?? 'HEAD',
      originalHeadCommit,
    },
  );
} catch (error) {
  debugLogger.warn(`enter_worktree: failed to write session state: ${error}`);
}
```

- [ ] **Шаг 4: Запустить тесты и убедиться, что они проходят**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts
```

Ожидаемый результат: все тесты пройдены, регрессий нет.

- [ ] **Шаг 5: Проверка типов**

```bash
cd packages/core && npm run typecheck
```

- [ ] **Шаг 6: Коммит**

```bash
git add packages/core/src/tools/enter-worktree.ts \
        packages/core/src/tools/enter-worktree.test.ts
git commit -m "feat(worktree): persist WorktreeSession in EnterWorktreeTool"
```

---

## Задача 4: ExitWorktreeTool очищает WorktreeSession

**Файлы:**

- Изменить: `packages/core/src/tools/exit-worktree.ts`
- Изменить: `packages/core/src/tools/exit-worktree.test.ts`

- [ ] **Шаг 1: Написать провальные тесты**

В `exit-worktree.test.ts` добавить два кейса (и keep, и remove должны очищать сессию):

```typescript
import {
  writeWorktreeSession,
  readWorktreeSession,
} from '../services/worktreeSessionService.js';

async function seedSession(cfg: Config, slug: string) {
  await writeWorktreeSession(
    cfg.getSessionService().getWorktreeSessionPath(cfg.getSessionId()),
    {
      slug,
      worktreePath: `/repo/.qwen/worktrees/${slug}`,
      worktreeBranch: `worktree-${slug}`,
      originalCwd: '/repo',
      originalBranch: 'main',
    },
  );
}

it('clears WorktreeSession after keep', async () => {
  await seedSession(config, 'exit-keep-test');
  // Create the worktree first so exit_worktree can find it
  await config.getWorktreeService().createUserWorktree('exit-keep-test');
  await invokeTool(tool, { name: 'exit-keep-test', action: 'keep' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});

it('clears WorktreeSession after remove', async () => {
  await seedSession(config, 'exit-remove-test');
  await config.getWorktreeService().createUserWorktree('exit-remove-test');
  await invokeTool(tool, { name: 'exit-remove-test', action: 'remove' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts -t "clears WorktreeSession"
```

Ожидаемый результат: `FAIL`.

- [ ] **Шаг 3: Изменить `exit-worktree.ts`**

Добавить импорт вверху:

```typescript
import { clearWorktreeSession } from '../services/worktreeSessionService.js';
```

Найти путь возврата для `action === 'keep'` (примерно строки 184‑196), перед `return { llmContent: ..., returnDisplay: ... }` добавить:

```typescript
try {
  await clearWorktreeSession(
    this.config
      .getSessionService()
      .getWorktreeSessionPath(this.config.getSessionId()),
  );
} catch (error) {
  debugLogger.warn(`exit_worktree: failed to clear session state: ${error}`);
}
```

Найти путь успешного возврата для `action === 'remove'` (после вызова `removeUserWorktree`), добавить точно такой же блок `clearWorktreeSession`.

- [ ] **Шаг 4: Запустить тесты и убедиться, что они проходят**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts
```

Ожидаемый результат: все тесты пройдены.

- [ ] **Шаг 5: Коммит**

```bash
git add packages/core/src/tools/exit-worktree.ts \
        packages/core/src/tools/exit-worktree.test.ts
git commit -m "feat(worktree): clear WorktreeSession in ExitWorktreeTool"
```

---

## Задача 5: Хук useWorktreeSession + UIState.activeWorktree

**Файлы:**

- Создать: `packages/cli/src/ui/hooks/useWorktreeSession.ts`
- Изменить: `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Изменить: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Шаг 1: Добавить поле `activeWorktree` в `UIStateContext.tsx`**

Найти интерфейс `UIState` (примерно строка 85), рядом с `branchName: string | undefined;` добавить:

```typescript
activeWorktree: {
  slug: string;
  branch: string;
  path: string;
  originalCwd: string;
  originalBranch: string;
  originalHeadCommit: string;
} | null;
```

Найти начальное значение UIState (обычно в `AppContainer.tsx` в провайдере UIState или в defaultValue для `createContext`) и добавить `activeWorktree: null`.

- [ ] **Шаг 2: Создать `useWorktreeSession.ts`**

```typescript
// packages/cli/src/ui/hooks/useWorktreeSession.ts
import { useState, useEffect } from 'react';
import * as fs from 'node:fs';
import {
  readWorktreeSession,
  type WorktreeSession,
} from '@qwen-code/qwen-code-core';
import { useConfig } from '../contexts/ConfigContext.js';

export function useWorktreeSession(): WorktreeSession | null {
  const config = useConfig();
  const [session, setSession] = useState<WorktreeSession | null>(null);

  useEffect(() => {
    const sessionService = config.getSessionService();
    const sessionId = config.getSessionId();
    const filePath = sessionService.getWorktreeSessionPath(sessionId);

    let watcher: fs.FSWatcher | undefined;

    const load = async () => {
      try {
        const ws = await readWorktreeSession(filePath);
        setSession(ws);
      } catch {
        setSession(null);
      }
    };

    void load();

    try {
      watcher = fs.watch(filePath, () => void load());
    } catch {
      // File does not exist yet — watcher set up on next write event via load()
    }

    return () => {
      watcher?.close();
    };
  }, [config]);

  return session;
}
```
注意：`readWorktreeSession`  и `WorktreeSession` должны быть экспортированы из `@qwen-code/qwen-code-core`. Также необходимо добавить новый экспорт в `packages/core/src/index.ts`:

```typescript
export {
  readWorktreeSession,
  writeWorktreeSession,
  clearWorktreeSession,
  type WorktreeSession,
} from './services/worktreeSessionService.js';
```

- [ ] **Шаг 3: Используйте хук в `AppContainer.tsx` для синхронизации `activeWorktree`**

Добавьте импорт в начало `AppContainer.tsx`:

```typescript
import { useWorktreeSession } from './hooks/useWorktreeSession.js';
```

В теле функции `AppContainer` (рядом с местом использования `branchName`) добавьте:

```typescript
const worktreeSession = useWorktreeSession();
```

В значение, передаваемое в `UIStateContext.Provider`, добавьте:

```typescript
activeWorktree: worktreeSession
  ? {
      slug: worktreeSession.slug,
      branch: worktreeSession.worktreeBranch,
      path: worktreeSession.worktreePath,
      originalCwd: worktreeSession.originalCwd,
      originalBranch: worktreeSession.originalBranch,
      originalHeadCommit: worktreeSession.originalHeadCommit,
    }
  : null,
```

- [ ] **Шаг 4: Проверка типов**

```bash
npm run typecheck
```

Запуск из корня репозитория (проверка cross-workspace). Ожидается: без ошибок.

- [ ] **Шаг 5: Коммит**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/index.ts \
        packages/cli/src/ui/hooks/useWorktreeSession.ts \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add useWorktreeSession hook and UIState.activeWorktree"
```

---

## Задача 6: Поле worktree в StatusLineCommandInput + Строка worktree в Footer

**Файлы:**

- Изменить: `packages/cli/src/ui/hooks/useStatusLine.ts`
- Изменить: `packages/cli/src/ui/components/Footer.tsx`

- [ ] **Шаг 1: Добавьте поле `worktree` в `useStatusLine.ts`**

Найдите интерфейс `StatusLineCommandInput` (примерно строка 21) и после поля `git?: { branch: string }` добавьте:

```typescript
worktree?: {
  /** slug worktree (короткое имя, например "my-feature") */
  name: string;
  /** физический путь worktree */
  path: string;
  /** имя ветки git (например "worktree-my-feature") */
  branch: string;
  /** рабочая директория до входа в worktree */
  original_cwd: string;
  /** ветка до входа в worktree */
  original_branch: string;
};
```

Имена полей должны совпадать с claude-code, чтобы пользователи могли повторно использовать скрипты statusline между qwen-code и claude-code.

Найдите место, где в колбэке `doUpdate` строится объект `input: StatusLineCommandInput` (примерно строка 225), и после `...(ui.branchName && { git: { branch: ui.branchName } })` добавьте:

```typescript
...(uiStateRef.current.activeWorktree && {
  worktree: {
    name: uiStateRef.current.activeWorktree.slug,
    path: uiStateRef.current.activeWorktree.path,
    branch: uiStateRef.current.activeWorktree.branch,
    original_cwd: uiStateRef.current.activeWorktree.originalCwd,
    original_branch: uiStateRef.current.activeWorktree.originalBranch,
  },
}),
```

Примечание: `UIState.activeWorktree` также должен содержать поля `originalCwd` и `originalBranch` (дополнить в маппинге AppContainer из Задачи 5).

- [ ] **Шаг 2: Добавьте встроенную строку отображения worktree в `Footer.tsx`**

В начале `Footer.tsx` импортируйте `useUIState` (уже есть).

Найдите область рендеринга `statusLineLines` (примерно строки 140-148):

```tsx
{
  statusLineLines.length > 0 &&
    !uiState.ctrlCPressedOnce &&
    !uiState.ctrlDPressedOnce &&
    statusLineLines.map((line, i) => (
      <Text key={`status-line-${i}`} dimColor wrap="truncate">
        {line}
      </Text>
    ));
}
```

Перед ней вставьте строку worktree (отображается, когда `activeWorktree` не пуст и нет пользовательской statusline):

```tsx
{
  uiState.activeWorktree &&
    !uiState.ctrlCPressedOnce &&
    !uiState.ctrlDPressedOnce &&
    statusLineLines.length === 0 && (
      <Text dimColor wrap="truncate">
        {`⎇ ${uiState.activeWorktree.branch} (${uiState.activeWorktree.slug})`}
      </Text>
    );
}
```

- [ ] **Шаг 3: Проверка типов + сборка**

```bash
npm run typecheck && npm run build
```

Ожидается: без ошибок.

- [ ] **Шаг 4: Коммит**

```bash
git add packages/cli/src/ui/hooks/useStatusLine.ts \
        packages/cli/src/ui/components/Footer.tsx
git commit -m "feat(worktree): show active worktree in Footer and StatusLine payload"
```

---

## Задача 7: Внедрение контекста worktree при `--resume`

**Файлы:**

- Изменить: `packages/cli/src/ui/AppContainer.tsx:459-489`

- [ ] **Шаг 1: Внедрите сообщение контекста worktree в путь resume**

Найдите в `AppContainer.tsx` путь resume (примерно строки 459-489):

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);
  // ...
}
```

Измените на:

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);

  // Если есть активная сессия worktree, добавьте напоминание, чтобы
  // модель сразу знала, что нужно продолжать использовать путь worktree.
  const ws = await readWorktreeSession(
    config.getSessionService().getWorktreeSessionPath(config.getSessionId()),
  );
  if (ws) {
    // Проверьте, что директория worktree всё ещё существует,
    // прежде чем считать её активной.
    const worktreeAlive = await fs
      .stat(ws.worktreePath)
      .then((s) => s.isDirectory())
      .catch(() => false);

    if (worktreeAlive) {
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text:
            `[Resumed] Active worktree: "${ws.slug}" at ${ws.worktreePath} ` +
            `(branch: ${ws.worktreeBranch}). Continue using this path for all file operations.`,
        },
        Date.now(),
      );
    } else {
      // Устаревший sidecar — worktree был удалён внешне, очистите.
      await clearWorktreeSession(
        config
          .getSessionService()
          .getWorktreeSessionPath(config.getSessionId()),
      );
    }
  }

  // ... остальной код resume (background agents, session name)
}
```

Добавьте импорты в начале файла:

```typescript
import {
  readWorktreeSession,
  clearWorktreeSession,
} from '@qwen-code/qwen-code-core';
import * as fs from 'node:fs/promises';
```

(`fs` возможно уже импортирован — проверьте и объедините.)

- [ ] **Шаг 2: Проверка типов**

```bash
npm run typecheck
```

- [ ] **Шаг 3: Коммит**

```bash
git add packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): inject context message on --resume when worktree is active"
```

---

## Задача 8: WorktreeExitDialog

**Файлы:**

- Создать: `packages/cli/src/ui/components/WorktreeExitDialog.tsx`
- Создать: `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx`
- Изменить: `packages/cli/src/ui/components/DialogManager.tsx`
- Изменить: `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Изменить: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Шаг 1: Добавьте состояние dialog в `AppContainer.tsx`**

Состояния dialog, такие как `showWelcomeBackDialog`, возвращаются из соответствующих хуков в AppContainer, а затем передаются в Provider через объект значения UIState. Используйте тот же подход для WorktreeExitDialog:

Добавьте в тело функции `AppContainer.tsx`:

```typescript
const [showWorktreeExitDialog, setShowWorktreeExitDialog] = useState(false);
```

Добавьте в объект значения Provider UIState:

```typescript
showWorktreeExitDialog,
```

Добавьте в интерфейс `UIState` (рядом с другими полями dialog):

```typescript
showWorktreeExitDialog: boolean;
```

- [ ] **Шаг 2: Напишите тест для компонента (ожидается провал)**

```typescript
// packages/cli/src/ui/components/WorktreeExitDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

describe('WorktreeExitDialog', () => {
  it('отображает состояние загрузки изначально', () => {
    const { lastFrame } = render(
      <WorktreeExitDialog
        slug="my-feature"
        branch="worktree-my-feature"
        worktreePath="/tmp/repo/.qwen/worktrees/my-feature"
        originalHeadCommit="abc1234"
        onKeep={vi.fn()}
        onRemove={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // Должен показывать спиннер загрузки сразу, до разрешения статуса git
    expect(lastFrame()).toContain('Checking');
  });

  it('отображает slug, branch и опции после загрузки (без изменений)', async () => {
    // Используйте vi.mock для мока execFileNoThrow / execFile, чтобы git status возвращал пустой
    // и rev-list возвращал "0". См. существующие тесты dialog для шаблона мока.
    // После разрешения асинхронного эффекта:
    //   - показывает "my-feature" и "worktree-my-feature"
    //   - показывает опции Keep и Remove
    //   - показывает "нет незакоммиченных изменений" или подобное
  });
});
```

- [ ] **Шаг 3: Запустите тест, убедитесь, что он проваливается**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

Ожидается: `FAIL` — модуль не существует.

- [ ] **Шаг 4: Создайте `WorktreeExitDialog.tsx`**

Используйте шаблон RadioSelect из `WelcomeBackDialog.tsx`, добавив проверку грязного состояния при монтировании (аналогично логике `loadChanges` в claude-code `WorktreeExitDialog.tsx`):

```tsx
// packages/cli/src/ui/components/WorktreeExitDialog.tsx
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { execa } from 'execa';
import { RadioSelect } from '../shared/RadioSelect.js';
import type { RadioSelectItem } from '../shared/RadioSelect.js';
import { theme } from '../semantic-colors.js';

interface WorktreeExitDialogProps {
  slug: string;
  branch: string;
  worktreePath: string;
  originalHeadCommit: string;
  onKeep: () => void;
  onRemove: () => void;
  onCancel: () => void;
}

type Choice = 'keep' | 'remove' | 'cancel';

export const WorktreeExitDialog: React.FC<WorktreeExitDialogProps> = ({
  slug,
  branch,
  worktreePath,
  originalHeadCommit,
  onKeep,
  onRemove,
  onCancel,
}) => {
  const [loading, setLoading] = useState(true);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [commitCount, setCommitCount] = useState(0);
  const [selected, setSelected] = useState<Choice>('keep');

  useEffect(() => {
    async function loadDirtyState() {
      try {
        // Незакоммиченные изменения (tracked + untracked)
        const { stdout: statusOut } = await execa(
          'git',
          ['status', '--porcelain'],
          { cwd: worktreePath },
        );
        const files = statusOut.split('\n').filter((l) => l.trim().length > 0);
        setChangedFiles(files);

        // Новые коммиты с момента создания worktree
        if (originalHeadCommit) {
          const { stdout: countOut } = await execa(
            'git',
            ['rev-list', '--count', `${originalHeadCommit}..HEAD`],
            { cwd: worktreePath },
          );
          setCommitCount(parseInt(countOut.trim(), 10) || 0);
        }
      } catch {
        // Если git не сработал, отображаем dialog без подсчётов.
      } finally {
        setLoading(false);
      }
    }
    void loadDirtyState();
  }, [worktreePath, originalHeadCommit]);

  const options: Array<RadioSelectItem<Choice>> = [
    {
      key: 'keep',
      label: 'Keep worktree (exit without deleting)',
      value: 'keep',
    },
    {
      key: 'remove',
      label:
        changedFiles.length > 0 || commitCount > 0
          ? `Remove worktree and branch (discards ${commitCount} commit(s), ${changedFiles.length} file(s))`
          : 'Remove worktree and branch',
      value: 'remove',
    },
    { key: 'cancel', label: 'Cancel (stay in session)', value: 'cancel' },
  ];

  if (loading) {
    return (
      <Box marginY={1} paddingX={2}>
        <Text color={theme.text.secondary}>Checking worktree status…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1} paddingX={2}>
      <Text color={theme.status.warning}>
        {`Active worktree: "${slug}" (${branch})`}
      </Text>
      {(changedFiles.length > 0 || commitCount > 0) && (
        <Box flexDirection="column" marginBottom={1}>
          {commitCount > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${commitCount} new commit(s) on ${branch}`}
            </Text>
          )}
          {changedFiles.length > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${changedFiles.length} uncommitted file(s)`}
            </Text>
          )}
        </Box>
      )}
      <Text color={theme.text.secondary}>What would you like to do?</Text>
      <RadioSelect
        items={options}
        selectedValue={selected}
        onSelect={(value) => {
          if (value === 'keep') onKeep();
          else if (value === 'remove') onRemove();
          else onCancel();
        }}
        onChange={setSelected}
      />
    </Box>
  );
};
```

Примечание: `execa` уже есть в зависимостях проекта (или используйте `execFileNoThrow`, как в claude-code). Проверьте `packages/cli/package.json` для доступного exec-инструмента; если `execa` нет, используйте обёртку над встроенным Node.js `execFile`.

- [ ] **Шаг 5: Запустите тест, убедитесь, что проходит**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

Ожидается: тест состояния загрузки проходит.

- [ ] **Шаг 6: Зарегистрируйте в `DialogManager.tsx`**

Найдите последний блок рендеринга dialog в `DialogManager` и добавьте:

```tsx
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

// В JSX, возвращаемом DialogManager, после последнего dialog добавьте:
{
  uiState.showWorktreeExitDialog && uiState.activeWorktree && (
    <WorktreeExitDialog
      slug={uiState.activeWorktree.slug}
      branch={uiState.activeWorktree.branch}
      worktreePath={uiState.activeWorktree.path}
      originalHeadCommit={uiState.activeWorktree.originalHeadCommit}
      onKeep={() => {
        setShowWorktreeExitDialog(false);
        handleSlashCommand('/quit');
      }}
      onRemove={async () => {
        setShowWorktreeExitDialog(false);
        // Удаляем worktree напрямую через сервис (без вызова инструмента).
        try {
          const svc = new GitWorktreeService(config.getTargetDir());
          await svc.removeUserWorktree(uiState.activeWorktree!.slug, {
            deleteBranch: true,
          });
          await clearWorktreeSession(
            config
              .getSessionService()
              .getWorktreeSessionPath(config.getSessionId()),
          );
        } catch {
          // Не фатально — всё равно выходим.
        }
        handleSlashCommand('/quit');
      }}
      onCancel={() => {
        setShowWorktreeExitDialog(false);
      }}
    />
  );
}
```

`setShowWorktreeExitDialog` берётся из `useState`, определённого в Шаге 1 в `AppContainer`. Его нужно передать через props или напрямую в месте вызова `DialogManager` (см. шаблон передачи других dialog).

- [ ] **Шаг 7: Перехватите второе Ctrl+C в `AppContainer.tsx`**

В колбэке `handleExit` (примерно строка 2387) найдите ветку, где `pressedOnce === true` и вызывается `handleSlashCommand('/quit')`:

```typescript
// Быстрое двойное нажатие: прямой выход (сохраняет привычку пользователя)
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // Выходим напрямую
  handleSlashCommand('/quit');
  return;
}
```

Измените на:

```typescript
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // Если внутри worktree, показываем dialog выхода вместо прямого выхода.
  if (worktreeSession) {
    setShowWorktreeExitDialog(true);
    return;
  }
  handleSlashCommand('/quit');
  return;
}
```

`worktreeSession` — это возвращаемое значение `useWorktreeSession()` из Шага 1 (уже есть в теле AppContainer). Добавьте его в массив зависимостей `useCallback` для `handleExit`. `setShowWorktreeExitDialog` из Шага 1.

- [ ] **Шаг 9: Проверка типов + полное тестирование**

```bash
npm run typecheck
cd packages/core && npx vitest run
cd packages/cli && npx vitest run
```

Ожидается: всё проходит, без регрессий.

- [ ] **Шаг 10: Сборка**

```bash
npm run build && npm run bundle
```

Ожидается: `dist/cli.js` генерируется без ошибок.

- [ ] **Шаг 11: Коммит**

```bash
git add packages/cli/src/ui/components/WorktreeExitDialog.tsx \
        packages/cli/src/ui/components/WorktreeExitDialog.test.tsx \
        packages/cli/src/ui/components/DialogManager.tsx \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add WorktreeExitDialog — intercept Ctrl+C when worktree is active"
```

---

## Критерии приёмки

| Сценарий                                     | Ожидаемое поведение                                          |
| -------------------------------------------- | ------------------------------------------------------------ |
| После вызова `enter_worktree`                | Существует `<sessionId>.worktree.json`, содержащий slug / path / branch |
| После вызова `exit_worktree`                 | `<sessionId>.worktree.json` удалён                           |
| `--resume`, worktree всё ещё существует      | Footer показывает строку worktree; сообщение INFO с путём    |
| `--resume`, worktree был удалён              | Sidecar-файл очищен, строка worktree не отображается         |
| Первое Ctrl+C внутри worktree                | Отображается "Press Ctrl+C again to exit."                   |
| Второе Ctrl+C внутри worktree                | Отображается WorktreeExitDialog (keep / remove / cancel)     |
| Второе Ctrl+C вне worktree                   | Прямой выход (поведение не меняется)                         |
| Коммит внутри нового worktree                | `core.hooksPath` указывает на hooks главного репозитория, pre-commit срабатывает нормально |
| Скрипт statusline получает stdin             | JSON payload содержит `worktree.slug` и `worktree.branch`    |