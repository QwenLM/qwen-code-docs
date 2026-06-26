# Worktree Phase C Implementierungsplan

> **Für agentische Arbeiter:** ERFORDERLICHE UNTERFÄHIGKEIT: Verwende Superkräfte:subagent-driven-development (empfohlen) oder Superkräfte:executing-plans, um diesen Plan Aufgabe für Aufgabe umzusetzen. Schritte verwenden die Checkbox-Syntax (`- [ ]`) zur Nachverfolgung.

**Ziel:** Füge dem Worktree Sitzungspersistenz, hooksPath-Initialisierung, Footer-Statusanzeige und einen Beenden-Dialog hinzu, sodass der Worktree nach `--resume` wiederhergestellt werden kann und der Benutzer stets weiß, in welcher isolierten Umgebung er sich befindet.

**Architektur:** Neue `WorktreeSession`-Sidecar-JSON-Datei (parallel zur JSONL-Sitzungsdatei), `EnterWorktree` schreibt sie, `ExitWorktree` löscht sie; CLI-Ebene verwendet `useWorktreeSession`-Hook, um Dateiänderungen zu überwachen und in `UIState.activeWorktree` zu synchronisieren; Footer liest dieses Feld und rendert eine Worktree-Zeile; `WorktreeExitDialog` fängt beim zweiten Strg+C ab, wenn ein aktiver Worktree erkannt wird.

**Tech-Stack:** TypeScript, React (Ink), Node.js `fs.watch`, `simple-git`, Vitest

---

## Dateistruktur

| Aktion | Datei                                                         | Beschreibung                                                                          |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Neu    | `packages/core/src/services/worktreeSessionService.ts`       | WorktreeSession-Schnittstelle + Lese-/Schreib-/Löschfunktionen                         |
| Neu    | `packages/core/src/services/worktreeSessionService.test.ts`  | Unit-Tests                                                                             |
| Ändern | `packages/core/src/services/sessionService.ts`               | Neue öffentliche Methode `getWorktreeSessionPath()` hinzufügen                         |
| Ändern | `packages/core/src/services/gitWorktreeService.ts`           | `createUserWorktree()` / `createAgentWorktree()` nach `core.hooksPath`-Konfiguration   |
| Ändern | `packages/core/src/services/gitWorktreeService.test.ts`      | hooksPath-Tests                                                                        |
| Ändern | `packages/core/src/tools/enter-worktree.ts`                  | Nach Erstellung des Worktrees WorktreeSession schreiben                                |
| Ändern | `packages/core/src/tools/enter-worktree.test.ts`             | Session-Schreibtest                                                                     |
| Ändern | `packages/core/src/tools/exit-worktree.ts`                   | Nach Verlassen des Worktrees WorktreeSession löschen                                   |
| Ändern | `packages/core/src/tools/exit-worktree.test.ts`              | Session-Löschtest                                                                       |
| Neu    | `packages/cli/src/ui/hooks/useWorktreeSession.ts`            | Sidecar-Datei überwachen, aktuelle WorktreeSession zurückgeben                         |
| Ändern | `packages/cli/src/ui/contexts/UIStateContext.tsx`            | Neues Feld `activeWorktree` hinzufügen                                                  |
| Ändern | `packages/cli/src/ui/AppContainer.tsx`                       | `activeWorktree` synchronisieren, Resumekontext einspritzen, Beenden abfangen           |
| Ändern | `packages/cli/src/ui/hooks/useStatusLine.ts`                 | `StatusLineCommandInput` um Feld `worktree` erweitern                                   |
| Ändern | `packages/cli/src/ui/components/Footer.tsx`                  | Eingebaute Worktree-Zeilenanzeige                                                        |
| Neu    | `packages/cli/src/ui/components/WorktreeExitDialog.tsx`      | Beenden-Hinweisdialog                                                                   |
| Neu    | `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx` | Komponententest                                                                         |
| Ändern | `packages/cli/src/ui/components/DialogManager.tsx`           | WorktreeExitDialog registrieren                                                         |

---

## Aufgabe 1: WorktreeSession-Sidecar-Speicher

**Dateien:**

- Erstellen: `packages/core/src/services/worktreeSessionService.ts`
- Erstellen: `packages/core/src/services/worktreeSessionService.test.ts`
- Ändern: `packages/core/src/services/sessionService.ts`

- [ ] **Schritt 1: `worktreeSessionService.ts` neu erstellen**

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
  /** HEAD commit SHA zum Zeitpunkt der Erstellung des Worktrees. Wird von WorktreeExitDialog verwendet, um neue Commits zu zählen. */
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

- [ ] **Schritt 2: Fehlschlagende Tests schreiben**

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
  it('gibt null zurück, wenn die Datei nicht existiert', async () => {
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('liest das Geschriebene zurück', async () => {
    await fs.writeFile(filePath, JSON.stringify(sample), 'utf-8');
    expect(await readWorktreeSession(filePath)).toEqual(sample);
  });
});

describe('writeWorktreeSession', () => {
  it('schreibt eine lesbare JSON-Datei', async () => {
    await writeWorktreeSession(filePath, sample);
    const raw = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(sample);
  });

  it('überschreibt vorhandene Datei', async () => {
    await writeWorktreeSession(filePath, sample);
    const updated = { ...sample, slug: 'updated' };
    await writeWorktreeSession(filePath, updated);
    expect(await readWorktreeSession(filePath)).toEqual(updated);
  });
});

describe('clearWorktreeSession', () => {
  it('löscht die Datei', async () => {
    await writeWorktreeSession(filePath, sample);
    await clearWorktreeSession(filePath);
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('ist ein No-Op, wenn die Datei nicht existiert', async () => {
    await expect(clearWorktreeSession(filePath)).resolves.not.toThrow();
  });
});
```

- [ ] **Schritt 3: Tests ausführen, um Fehlschlag zu bestätigen**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

Erwartet: `FAIL` — Modul existiert nicht.

- [ ] **Schritt 4: `require`-Aufruf in `writeWorktreeSession` reparieren**

In `worktreeSessionService.ts` `path.dirname` verwendet, daher muss `node:path` oben importiert werden:

```typescript
// Ersetze "require('node:path').dirname(filePath)" durch korrekten Import
import * as path from 'node:path';

export async function writeWorktreeSession(
  filePath: string,
  session: WorktreeSession,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}
```

- [ ] **Schritt 5: Tests ausführen, um Bestehen zu bestätigen**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

Erwartet: `PASS` — 6 Tests bestanden.

- [ ] **Schritt 6: `getWorktreeSessionPath()` in `SessionService` hinzufügen**

In `packages/core/src/services/sessionService.ts` die Methode `private getChatsDir()` finden (ca. Zeile 180) und danach hinzufügen:

```typescript
getWorktreeSessionPath(sessionId: string): string {
  return path.join(this.getChatsDir(), `${sessionId}.worktree.json`);
}
```

- [ ] **Schritt 7: Typüberprüfung**

```bash
cd packages/core
npm run typecheck
```

Erwartet: Keine Fehler.

- [ ] **Schritt 8: Commit**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/services/worktreeSessionService.test.ts \
        packages/core/src/services/sessionService.ts
git commit -m "feat(worktree): add WorktreeSession sidecar storage"
```

---

## Aufgabe 2: hooksPath nach Erstellung einrichten

**Dateien:**

- Ändern: `packages/core/src/services/gitWorktreeService.ts:1133-1158` (`createUserWorktree`)
- Ändern: `packages/core/src/services/gitWorktreeService.test.ts`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

In `gitWorktreeService.test.ts` die Testgruppe `createUserWorktree` finden und hinzufügen:

```typescript
it('konfiguriert core.hooksPath auf das Haupt-Repo nach der Erstellung', async () => {
  const result = await service.createUserWorktree('hooks-test');
  expect(result.success).toBe(true);

  const worktreePath = result.worktree!.path;
  const worktreeGit = simpleGit(worktreePath);
  const hooksPath = await worktreeGit.raw([
    'config',
    '--local',
    'core.hooksPath',
  ]);
  // Sollte auf das .git/hooks des Haupt-Repos zeigen
  expect(hooksPath.trim()).toContain('.git/hooks');
});
```

- [ ] **Schritt 2: Tests ausführen, um Fehlschlag zu bestätigen**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configures core.hooksPath"
```

Erwartet: `FAIL` — hooksPath ist leer.

- [ ] **Schritt 3: hooksPath-Konfiguration in `createUserWorktree` anhängen**

In `gitWorktreeService.ts` nach dem `git worktree add`-Aufruf in `createUserWorktree` (ca. Zeile 1140) vor `return { success: true, worktree }` einfügen:

```typescript
// HooksPath konfigurieren, sodass Commits in diesem Worktree die Hooks des
// Haupt-Repos ausführen. Priorität: .husky/ (üblich) → .git/hooks (Fallback).
// Spiegelt die Logik von claude-code's performPostCreationSetup() wider.
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
      // Nicht gefunden – nächsten versuchen.
    }
  }
  if (hooksPath) {
    const worktreeGit = simpleGit(worktreePath);
    // Subprozess überspringen, wenn core.hooksPath bereits auf denselben Wert gesetzt ist
    // (~14ms Spawn-Overhead laut claude-code's Kommentar zu parseGitConfigValue).
    let existing = '';
    try {
      existing = (
        await worktreeGit.raw(['config', '--local', 'core.hooksPath'])
      ).trim();
    } catch {
      // Schlüssel nicht gesetzt – leerer String bedeutet "weitermachen".
    }
    if (existing !== hooksPath) {
      await worktreeGit.raw(['config', 'core.hooksPath', hooksPath]);
    }
  }
} catch (hookError) {
  debugLogger.warn(
    `createUserWorktree: Fehler beim Setzen von core.hooksPath: ${hookError}`,
  );
  // Nicht fatal: Worktree ist nutzbar, nur ohne geerbte Hooks.
}
```

`this.sourceRepoPath` ist ein privates Feld, das im Konstruktor von `GitWorktreeService` zugewiesen wird (`this.sourceRepoPath = path.resolve(sourceRepoPath)`, ca. Zeile 224). Oben in der Datei muss `import * as fs from 'node:fs/promises'` vorhanden sein.

- [ ] **Schritt 4: Gleiche Änderung für `createAgentWorktree` vornehmen**

Die Methode `createAgentWorktree` finden und nach dem `git worktree add` denselben hooksPath-Codeblock einfügen (vollständiger Code wie in Schritt 3, `slug` stammt aus den Parametern des agent worktree).

- [ ] **Schritt 5: Tests ausführen, um Bestehen zu bestätigen**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configures core.hooksPath"
```

Erwartet: `PASS`.

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/services/gitWorktreeService.ts \
        packages/core/src/services/gitWorktreeService.test.ts
git commit -m "feat(worktree): configure core.hooksPath after worktree creation"
```

---

## Aufgabe 3: EnterWorktreeTool schreibt WorktreeSession

**Dateien:**

- Ändern: `packages/core/src/tools/enter-worktree.ts`
- Ändern: `packages/core/src/tools/enter-worktree.test.ts`

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

In `enter-worktree.test.ts` nach einem erfolgreichen Erstellungstest einfügen:

```typescript
import { readWorktreeSession } from '../services/worktreeSessionService.js';

it('schreibt WorktreeSession-Sidecar nach Erstellung des Worktrees', async () => {
  // Arrange: bestehende Testeinrichtung verwenden, die ein echtes Git-Repo erstellt
  // und das Tool aufruft (kopieren aus vorhandenem "custom name"-Test)
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

- [ ] **Schritt 2: Tests ausführen, um Fehlschlag zu bestätigen**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts -t "writes WorktreeSession"
```

Erwartet: `FAIL` — Session-Datei ist null.

- [ ] **Schritt 3: `enter-worktree.ts` ändern, um nach erfolgreicher Erstellung Session zu schreiben**

Import oben in `enter-worktree.ts` hinzufügen:

```typescript
import { writeWorktreeSession } from '../services/worktreeSessionService.js';
```

In der `execute()`-Methode nach dem Abrufen von `baseBranch` und vor dem Aufruf von `createUserWorktree()` den aktuellen HEAD-Commit-SHA erfassen:

```typescript
// HEAD vor dem Branching erfassen – WorktreeExitDialog verwendet dies, um neue
// Commits zu zählen, die im Worktree erstellt wurden (spiegelt claude-code-Ansatz wider).
let originalHeadCommit = '';
try {
  originalHeadCommit = await service.getHeadCommit();
} catch {
  // Nicht fatal.
}
```

Gleichzeitig eine öffentliche Methode in `GitWorktreeService` hinzufügen (`gitWorktreeService.ts`, in der Nähe von `getCurrentBranch()`):

```typescript
async getHeadCommit(): Promise<string> {
  try {
    return (await this.git.raw(['rev-parse', '--short', 'HEAD'])).trim();
  } catch {
    return '';
  }
}
```

Nach dem Aufruf von `writeWorktreeSessionMarker(...)` hinzufügen:

```typescript
// Worktree-Session persistieren, damit --resume den Kontext wiederherstellen kann.
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
  debugLogger.warn(`enter_worktree: Fehler beim Schreiben des Session-Status: ${error}`);
}
```

- [ ] **Schritt 4: Tests ausführen, um Bestehen zu bestätigen**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts
```

Erwartet: Alle bestehen, keine Regression.

- [ ] **Schritt 5: Typüberprüfung**

```bash
cd packages/core && npm run typecheck
```

- [ ] **Schritt 6: Commit**

```bash
git add packages/core/src/tools/enter-worktree.ts \
        packages/core/src/tools/enter-worktree.test.ts
git commit -m "feat(worktree): persist WorktreeSession in EnterWorktreeTool"
```

---

## Aufgabe 4: ExitWorktreeTool löscht WorktreeSession

**Dateien:**

- Ändern: `packages/core/src/tools/exit-worktree.ts`
- Ändern: `packages/core/src/tools/exit-worktree.test.ts`

- [ ] **Schritt 1: Fehlschlagende Tests schreiben**

In `exit-worktree.test.ts` zwei neue Testfälle hinzufügen (sowohl keep als auch remove sollten die Session löschen):

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

it('löscht WorktreeSession nach keep', async () => {
  await seedSession(config, 'exit-keep-test');
  // Worktree zuerst erstellen, damit exit_worktree ihn finden kann
  await config.getWorktreeService().createUserWorktree('exit-keep-test');
  await invokeTool(tool, { name: 'exit-keep-test', action: 'keep' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});

it('löscht WorktreeSession nach remove', async () => {
  await seedSession(config, 'exit-remove-test');
  await config.getWorktreeService().createUserWorktree('exit-remove-test');
  await invokeTool(tool, { name: 'exit-remove-test', action: 'remove' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});
```

- [ ] **Schritt 2: Tests ausführen, um Fehlschlag zu bestätigen**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts -t "clears WorktreeSession"
```

Erwartet: `FAIL`.

- [ ] **Schritt 3: `exit-worktree.ts` ändern**

Import oben hinzufügen:

```typescript
import { clearWorktreeSession } from '../services/worktreeSessionService.js';
```

Den Rückgabepfad für `action === 'keep'` finden (ca. Zeilen 184-196) und vor `return { llmContent: ..., returnDisplay: ... }` einfügen:

```typescript
try {
  await clearWorktreeSession(
    this.config
      .getSessionService()
      .getWorktreeSessionPath(this.config.getSessionId()),
  );
} catch (error) {
  debugLogger.warn(`exit_worktree: Fehler beim Löschen des Session-Status: ${error}`);
}
```

Den erfolgreichen Rückgabepfad für `action === 'remove'` finden (nach `removeUserWorktree`-Aufruf) und denselben `clearWorktreeSession`-Block einfügen.

- [ ] **Schritt 4: Tests ausführen, um Bestehen zu bestätigen**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts
```

Erwartet: Alle bestehen.

- [ ] **Schritt 5: Commit**

```bash
git add packages/core/src/tools/exit-worktree.ts \
        packages/core/src/tools/exit-worktree.test.ts
git commit -m "feat(worktree): clear WorktreeSession in ExitWorktreeTool"
```

---

## Aufgabe 5: useWorktreeSession-Hook + UIState.activeWorktree

**Dateien:**

- Erstellen: `packages/cli/src/ui/hooks/useWorktreeSession.ts`
- Ändern: `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Ändern: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Schritt 1: `activeWorktree`-Feld in `UIStateContext.tsx` hinzufügen**

Das Interface `UIState` finden (ca. Zeile 85) und in der Nähe von `branchName: string | undefined;` hinzufügen:

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

Den Startwert für UIState finden (normalerweise im UIState-Provider von `AppContainer.tsx` oder im defaultValue von `createContext`) und `activeWorktree: null` hinzufügen.

- [ ] **Schritt 2: `useWorktreeSession.ts` neu erstellen**

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
      // Datei existiert noch nicht – Watcher wird beim nächsten Schreibereignis über load() eingerichtet
    }

    return () => {
      watcher?.close();
    };
  }, [config]);

  return session;
}
```
**Wichtig:** `readWorktreeSession` und `WorktreeSession` müssen aus `@qwen-code/qwen-code-core` exportiert werden. Zusätzlich muss in `packages/core/src/index.ts` ein neuer Export hinzugefügt werden:

```typescript
export {
  readWorktreeSession,
  writeWorktreeSession,
  clearWorktreeSession,
  type WorktreeSession,
} from './services/worktreeSessionService.js';
```

- [ ] **Schritt 3: Verwendung des Hooks `useWorktreeSession` in `AppContainer.tsx` zur Synchronisation von `activeWorktree`**

Füge oben in `AppContainer.tsx` den neuen Import hinzu:

```typescript
import { useWorktreeSession } from './hooks/useWorktreeSession.js';
```

Füge innerhalb des `AppContainer`-Funktionskörpers (in der Nähe der Verwendung von `branchName`) Folgendes hinzu:

```typescript
const worktreeSession = useWorktreeSession();
```

Füge im Wert, der an `UIStateContext.Provider` übergeben wird, Folgendes hinzu:

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

- [ ] **Schritt 4: Typprüfung**

```bash
npm run typecheck
```

Aus dem Repository-Stammverzeichnis ausführen (workspaceübergreifende Prüfung). Erwartet: Keine Fehler.

- [ ] **Schritt 5: Commit**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/index.ts \
        packages/cli/src/ui/hooks/useWorktreeSession.ts \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add useWorktreeSession hook and UIState.activeWorktree"
```

---

## Aufgabe 6: `StatusLineCommandInput.worktree`-Feld + Footer-worktree-Zeile

**Dateien:**

- Ändern: `packages/cli/src/ui/hooks/useStatusLine.ts`
- Ändern: `packages/cli/src/ui/components/Footer.tsx`

- [ ] **Schritt 1: `worktree`-Feld in `useStatusLine.ts` hinzufügen**

Finde das Interface `StatusLineCommandInput` (ca. Zeile 21) und füge nach dem Feld `git?: { branch: string }` Folgendes hinzu:

```typescript
worktree?: {
  /** worktree slug (kurzer Name, z. B. "my-feature") */
  name: string;
  /** Physikalischer Pfad des worktree */
  path: string;
  /** Git-Branchname (z. B. "worktree-my-feature") */
  branch: string;
  /** Arbeitsverzeichnis vor Betreten des worktree */
  original_cwd: string;
  /** Branch vor Betreten des worktree */
  original_branch: string;
};
```

Die Feldnamen bleiben wie in claude-code, damit Benutzer Statusline-Skripte zwischen qwen-code und claude-code wiederverwenden können.

Finde die Stelle im `doUpdate`-Callback, an der das Objekt `input: StatusLineCommandInput` konstruiert wird (ca. Zeile 225), und füge nach `...(ui.branchName && { git: { branch: ui.branchName } })` Folgendes hinzu:

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

**Hinweis:** `UIState.activeWorktree` muss auch die Felder `originalCwd` und `originalBranch` enthalten (Ergänzung in der AppContainer-Zuordnung von Aufgabe 5).

- [ ] **Schritt 2: Integrierte worktree-Anzeigezeile in `Footer.tsx` hinzufügen**

Importiere `useUIState` oben in `Footer.tsx` (bereits vorhanden).

Finde den Renderbereich für `statusLineLines` (ca. Zeile 140-148):

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

Füge davor die worktree-Zeile ein (wird angezeigt, wenn `activeWorktree` nicht leer ist und keine benutzerdefinierten Statuszeilen vorhanden sind):

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

- [ ] **Schritt 3: Typprüfung + Build**

```bash
npm run typecheck && npm run build
```

Erwartet: Keine Fehler.

- [ ] **Schritt 4: Commit**

```bash
git add packages/cli/src/ui/hooks/useStatusLine.ts \
        packages/cli/src/ui/components/Footer.tsx
git commit -m "feat(worktree): show active worktree in Footer and StatusLine payload"
```

---

## Aufgabe 7: `--resume` Worktree-Kontextinjektion

**Dateien:**

- Ändern: `packages/cli/src/ui/AppContainer.tsx:459-489`

- [ ] **Schritt 1: Worktree-Kontextnachricht im Resume-Pfad injizieren**

Finde in `AppContainer.tsx` den Resume-Pfad (ca. Zeile 459-489):

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);
  // ...
}
```

Ändere zu:

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);

  // Falls eine aktive Worktree-Sitzung existiert, eine Kontexterinnerung einfügen,
  // damit das Modell sofort weiß, dass es den worktree-Pfad weiterverwenden soll.
  const ws = await readWorktreeSession(
    config.getSessionService().getWorktreeSessionPath(config.getSessionId()),
  );
  if (ws) {
    // Prüfen, ob das worktree-Verzeichnis noch existiert, bevor es als aktiv behandelt wird.
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
      // Veraltete Sidecar – worktree wurde extern gelöscht, bereinigen.
      await clearWorktreeSession(
        config
          .getSessionService()
          .getWorktreeSessionPath(config.getSessionId()),
      );
    }
  }

  // ... Rest des vorhandenen Resume-Codes (Hintergrund-Agents, Session-Name)
}
```

Füge oben in der Datei den neuen Import hinzu:

```typescript
import {
  readWorktreeSession,
  clearWorktreeSession,
} from '@qwen-code/qwen-code-core';
import * as fs from 'node:fs/promises';
```

(`fs` könnte bereits importiert sein – prüfen und ggf. zusammenführen.)

- [ ] **Schritt 2: Typprüfung**

```bash
npm run typecheck
```

- [ ] **Schritt 3: Commit**

```bash
git add packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): inject context message on --resume when worktree is active"
```

---

## Aufgabe 8: WorktreeExitDialog

**Dateien:**

- Erstellen: `packages/cli/src/ui/components/WorktreeExitDialog.tsx`
- Erstellen: `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx`
- Ändern: `packages/cli/src/ui/components/DialogManager.tsx`
- Ändern: `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Ändern: `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Schritt 1: Dialog-Status in `AppContainer.tsx` hinzufügen**

Dialog-Status wie `showWelcomeBackDialog` werden von ihren jeweiligen Hooks an AppContainer zurückgegeben und dann über das UIState-Value-Objekt an den Provider übergeben. Verwende für WorktreeExitDialog dasselbe Muster.

Füge innerhalb des `AppContainer`-Funktionskörpers Folgendes hinzu:

```typescript
const [showWorktreeExitDialog, setShowWorktreeExitDialog] = useState(false);
```

Füge im Value-Objekt des UIState-Providers Folgendes hinzu:

```typescript
showWorktreeExitDialog,
```

Füge im Interface `UIState` (in der Nähe der anderen Dialogfelder) Folgendes hinzu:

```typescript
showWorktreeExitDialog: boolean;
```

- [ ] **Schritt 2: Fehlschlagenden Komponententest schreiben**

```typescript
// packages/cli/src/ui/components/WorktreeExitDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

describe('WorktreeExitDialog', () => {
  it('zeigt initial den Ladezustand an', () => {
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
    // Sollte sofort den Lade-Spinner anzeigen, bevor der Git-Status aufgelöst wird
    expect(lastFrame()).toContain('Prüfe');
  });

  it('rendert slug, branch und Optionen nach dem Laden (keine Änderungen)', async () => {
    // Verwende vi.mock, um execFileNoThrow / execFile zu stubben, sodass git status leer
    // und rev-list "0" zurückgibt. Siehe vorhandene Dialog-Tests für das Mock-Muster.
    // Nach Auflösung des async-Effekts:
    //   - zeigt "my-feature" und "worktree-my-feature"
    //   - zeigt Optionen "Keep" und "Remove"
    //   - zeigt "keine unbestätigten Änderungen" oder ähnlich
  });
});
```

- [ ] **Schritt 3: Test ausführen und Fehlschlagen bestätigen**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

Erwartet: `FAIL` – Modul existiert nicht.

- [ ] **Schritt 4: `WorktreeExitDialog.tsx` neu erstellen**

Orientiere dich am `RadioSelect`-Muster von `WelcomeBackDialog.tsx` und füge beim Mounten eine Dirty-State-Prüfung hinzu (analog zur `loadChanges`-Logik von claude-code `WorktreeExitDialog.tsx`):

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
        // Unbestätigte Änderungen (getrackt + ungetrackt)
        const { stdout: statusOut } = await execa(
          'git',
          ['status', '--porcelain'],
          { cwd: worktreePath },
        );
        const files = statusOut.split('\n').filter((l) => l.trim().length > 0);
        setChangedFiles(files);

        // Neue Commits seit Erstellung des worktree
        if (originalHeadCommit) {
          const { stdout: countOut } = await execa(
            'git',
            ['rev-list', '--count', `${originalHeadCommit}..HEAD`],
            { cwd: worktreePath },
          );
          setCommitCount(parseInt(countOut.trim(), 10) || 0);
        }
      } catch {
        // Falls git fehlschlägt, Dialog ohne Zählungen anzeigen.
      } finally {
        setLoading(false);
      }
    }
    void loadDirtyState();
  }, [worktreePath, originalHeadCommit]);

  const options: Array<RadioSelectItem<Choice>> = [
    {
      key: 'keep',
      label: 'Worktree behalten (Beenden ohne Löschen)',
      value: 'keep',
    },
    {
      key: 'remove',
      label:
        changedFiles.length > 0 || commitCount > 0
          ? `Worktree und Branch entfernen (verwirft ${commitCount} Commit(s), ${changedFiles.length} Datei(en))`
          : 'Worktree und Branch entfernen',
      value: 'remove',
    },
    { key: 'cancel', label: 'Abbrechen (in Sitzung bleiben)', value: 'cancel' },
  ];

  if (loading) {
    return (
      <Box marginY={1} paddingX={2}>
        <Text color={theme.text.secondary}>Prüfe Worktree-Status…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1} paddingX={2}>
      <Text color={theme.status.warning}>
        {`Aktiver Worktree: "${slug}" (${branch})`}
      </Text>
      {(changedFiles.length > 0 || commitCount > 0) && (
        <Box flexDirection="column" marginBottom={1}>
          {commitCount > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${commitCount} neuer Commit(s) auf ${branch}`}
            </Text>
          )}
          {changedFiles.length > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${changedFiles.length} unbestätigte Datei(en)`}
            </Text>
          )}
        </Box>
      )}
      <Text color={theme.text.secondary}>Was möchtest du tun?</Text>
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

**Hinweis:** `execa` ist eine vorhandene Abhängigkeit des Projekts (oder verwende `execFileNoThrow` – siehe den Ansatz von claude-code). Überprüfe `packages/cli/package.json`, um das verfügbare Exec-Tool zu bestätigen; falls `execa` nicht vorhanden ist, verwende eine Wrapper-Funktion für Node.js `execFile`.

- [ ] **Schritt 5: Test ausführen und Bestehen bestätigen**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

Erwartet: Der Test für den Ladezustand besteht.

- [ ] **Schritt 6: In `DialogManager.tsx` registrieren**

Finde den letzten Dialog-Renderblock im `DialogManager` und füge Folgendes hinzu:

```tsx
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

// Füge im von DialogManager zurückgegebenen JSX nach dem letzten Dialog Folgendes ein:
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
        // Worktree direkt über den Service entfernen (kein Tool-Aufruf nötig).
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
          // Nicht fatal – trotzdem beenden.
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

`setShowWorktreeExitDialog` stammt aus dem in Schritt 1 in AppContainer definierten `useState` und muss entweder per Props oder direkt an der Aufrufstelle von `DialogManager` übergeben werden (siehe Übergabemuster der anderen Dialoge).

- [ ] **Schritt 7: Zweites Strg+C in `AppContainer.tsx` abfangen**

Finde im `handleExit`-Callback (ca. Zeile 2387) den Zweig, in dem `pressedOnce` `true` ist und `handleSlashCommand('/quit')` aufgerufen wird:

```typescript
// Schnelles Doppel-Drücken: Direkt beenden (gewohntes Nutzerverhalten bewahren)
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // Direkt beenden
  handleSlashCommand('/quit');
  return;
}
```

Ändere zu:

```typescript
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // Wenn wir uns in einem worktree befinden, den Exit-Dialog anzeigen statt direkt zu beenden.
  if (worktreeSession) {
    setShowWorktreeExitDialog(true);
    return;
  }
  handleSlashCommand('/quit');
  return;
}
```

`worktreeSession` ist der Rückgabewert von `useWorktreeSession()` aus Schritt 1 (bereits im AppContainer-Funktionskörper vorhanden). Füge es dem Abhängigkeitsarray von `handleExit` (`useCallback`) hinzu. `setShowWorktreeExitDialog` stammt aus dem `useState` von Schritt 1.

- [ ] **Schritt 9: Typprüfung + vollständige Tests**

```bash
npm run typecheck
cd packages/core && npx vitest run
cd packages/cli && npx vitest run
```

Erwartet: Alle Tests bestehen, keine Regressionen.

- [ ] **Schritt 10: Build**

```bash
npm run build && npm run bundle
```

Erwartet: `dist/cli.js` wird ohne Fehler erzeugt.

- [ ] **Schritt 11: Commit**

```bash
git add packages/cli/src/ui/components/WorktreeExitDialog.tsx \
        packages/cli/src/ui/components/WorktreeExitDialog.test.tsx \
        packages/cli/src/ui/components/DialogManager.tsx \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add WorktreeExitDialog — intercept Ctrl+C when worktree is active"
```

---

## Abnahmekriterien

| Szenario                                     | Erwartetes Verhalten                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Nach Aufruf von `enter_worktree`              | `<sessionId>.worktree.json` existiert, enthält slug / path / branch                  |
| Nach Aufruf von `exit_worktree`               | `<sessionId>.worktree.json` wird gelöscht                                            |
| `--resume` bei noch existierendem worktree   | Footer zeigt worktree-Zeile; INFO-Nachricht mit Pfadhinweis                          |
| `--resume` bei gelöschtem worktree            | Sidecar-Datei wird bereinigt, keine worktree-Zeile                                   |
| Erstes Strg+C im worktree                    | "Drücke Strg+C erneut, um zu beenden." wird angezeigt                                |
| Zweites Strg+C im worktree                   | WorktreeExitDialog wird angezeigt (keep / remove / cancel)                           |
| Zweites Strg+C außerhalb eines worktree      | Direktes Beenden (Verhalten unverändert)                                             |
| Commit in einem neu erstellten worktree      | `core.hooksPath` zeigt auf Hooks des Hauptrepos, pre-commit wird normal ausgelöst    |
| Statusline-Skript stdin                       | JSON-Payload enthält `worktree.slug` und `worktree.branch`                            |