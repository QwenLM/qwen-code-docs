# Plan d'implémentation de la phase C de Worktree

> **Pour les travailleurs agentiques :** COMPÉTENCE REQUISE : Utilisez les super-pouvoirs : développement piloté par sous-agent (recommandé) ou super-pouvoirs : exécution de plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe de case à cocher (`- [ ]`) pour le suivi.

**Objectif :** Ajouter la persistance de session, l'initialisation de hooksPath, l'affichage du statut dans le Footer et la boîte de dialogue de sortie pour worktree, afin que worktree soit récupérable après `--resume` et que l'utilisateur sache toujours dans quel environnement isolé il se trouve.

**Architecture :** Nouveau fichier sidecar `WorktreeSession` au format JSON (coexistant avec le fichier de session JSONL), écrit par `EnterWorktree` et effacé par `ExitWorktree` ; la couche CLI utilise le hook `useWorktreeSession` pour surveiller les changements de fichier et les synchroniser dans `UIState.activeWorktree` ; le Footer lit ce champ et affiche une ligne worktree intégrée ; `WorktreeExitDialog` intercepte un deuxième Ctrl+C lorsqu'un worktree actif est détecté.

**Stack technique :** TypeScript, React (Ink), Node.js `fs.watch`, `simple-git`, Vitest

---

## Structure des fichiers

| Opération | Fichier                                                        | Description                                                                 |
| --------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Création  | `packages/core/src/services/worktreeSessionService.ts`         | Interface WorktreeSession + fonctions de lecture/écriture/effacement        |
| Création  | `packages/core/src/services/worktreeSessionService.test.ts`    | Tests unitaires                                                             |
| Modification | `packages/core/src/services/sessionService.ts`                 | Ajout de la méthode publique `getWorktreeSessionPath()`                     |
| Modification | `packages/core/src/services/gitWorktreeService.ts`             | Ajout de la configuration `core.hooksPath` après `createUserWorktree()` / `createAgentWorktree()` |
| Modification | `packages/core/src/services/gitWorktreeService.test.ts`        | Tests hooksPath                                                             |
| Modification | `packages/core/src/tools/enter-worktree.ts`                    | Écriture de WorktreeSession après la création du worktree                   |
| Modification | `packages/core/src/tools/enter-worktree.test.ts`               | Tests d'écriture de session                                                 |
| Modification | `packages/core/src/tools/exit-worktree.ts`                     | Effacement de WorktreeSession après la sortie du worktree                   |
| Modification | `packages/core/src/tools/exit-worktree.test.ts`                | Tests d'effacement de session                                               |
| Création  | `packages/cli/src/ui/hooks/useWorktreeSession.ts`              | Surveillance du fichier sidecar, retourne la WorktreeSession courante       |
| Modification | `packages/cli/src/ui/contexts/UIStateContext.tsx`              | Ajout du champ `activeWorktree`                                             |
| Modification | `packages/cli/src/ui/AppContainer.tsx`                         | Synchronisation de `activeWorktree`, injection du contexte de reprise, interception de la sortie |
| Modification | `packages/cli/src/ui/hooks/useStatusLine.ts`                   | Ajout du champ `worktree` dans `StatusLineCommandInput`                     |
| Modification | `packages/cli/src/ui/components/Footer.tsx`                    | Affichage intégré de la ligne worktree                                      |
| Création  | `packages/cli/src/ui/components/WorktreeExitDialog.tsx`        | Boîte de dialogue de confirmation de sortie                                 |
| Création  | `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx`   | Tests du composant                                                          |
| Modification | `packages/cli/src/ui/components/DialogManager.tsx`            | Enregistrement de WorktreeExitDialog                                        |

---

## Tâche 1 : Stockage sidecar WorktreeSession

**Fichiers :**

- Créer : `packages/core/src/services/worktreeSessionService.ts`
- Créer : `packages/core/src/services/worktreeSessionService.test.ts`
- Modifier : `packages/core/src/services/sessionService.ts`

- [ ] **Étape 1 : Créer `worktreeSessionService.ts`**

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
  /** HEAD commit SHA au moment de la création du worktree. Utilisé par WorktreeExitDialog pour compter les nouveaux commits. */
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

- [ ] **Étape 2 : Écrire les tests en échec**

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
  it('retourne null quand le fichier n\'existe pas', async () => {
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('lit ce qui a été écrit', async () => {
    await fs.writeFile(filePath, JSON.stringify(sample), 'utf-8');
    expect(await readWorktreeSession(filePath)).toEqual(sample);
  });
});

describe('writeWorktreeSession', () => {
  it('écrit un fichier JSON lisible', async () => {
    await writeWorktreeSession(filePath, sample);
    const raw = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(sample);
  });

  it('écrase le fichier existant', async () => {
    await writeWorktreeSession(filePath, sample);
    const updated = { ...sample, slug: 'updated' };
    await writeWorktreeSession(filePath, updated);
    expect(await readWorktreeSession(filePath)).toEqual(updated);
  });
});

describe('clearWorktreeSession', () => {
  it('supprime le fichier', async () => {
    await writeWorktreeSession(filePath, sample);
    await clearWorktreeSession(filePath);
    expect(await readWorktreeSession(filePath)).toBeNull();
  });

  it('ne fait rien si le fichier n\'existe pas', async () => {
    await expect(clearWorktreeSession(filePath)).resolves.not.toThrow();
  });
});
```

- [ ] **Étape 3 : Exécuter les tests pour confirmer l'échec**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

Attendu : `FAIL` — le module n'existe pas.

- [ ] **Étape 4 : Corriger l'appel `require` dans `writeWorktreeSession`**

Dans `worktreeSessionService.ts`, utiliser `path.dirname`, il faut importer `node:path` en haut du fichier :

```typescript
// Remplacer "require('node:path').dirname(filePath)" par une importation correcte
import * as path from 'node:path';

export async function writeWorktreeSession(
  filePath: string,
  session: WorktreeSession,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
}
```

- [ ] **Étape 5 : Exécuter les tests pour confirmer le succès**

```bash
cd packages/core
npx vitest run src/services/worktreeSessionService.test.ts
```

Attendu : `PASS` — 6 tests réussis.

- [ ] **Étape 6 : Ajouter `getWorktreeSessionPath()` dans `SessionService`**

Dans `packages/core/src/services/sessionService.ts`, trouver la méthode `private getChatsDir()` (environ ligne 180), ajouter après :

```typescript
getWorktreeSessionPath(sessionId: string): string {
  return path.join(this.getChatsDir(), `${sessionId}.worktree.json`);
}
```

- [ ] **Étape 7 : Vérification de type**

```bash
cd packages/core
npm run typecheck
```

Attendu : aucune erreur.

- [ ] **Étape 8 : Commit**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/services/worktreeSessionService.test.ts \
        packages/core/src/services/sessionService.ts
git commit -m "feat(worktree): ajout du stockage sidecar WorktreeSession"
```

---

## Tâche 2 : Configuration de hooksPath après création

**Fichiers :**

- Modifier : `packages/core/src/services/gitWorktreeService.ts:1133-1158` (`createUserWorktree`)
- Modifier : `packages/core/src/services/gitWorktreeService.test.ts`

- [ ] **Étape 1 : Écrire un test en échec**

Dans `gitWorktreeService.test.ts`, trouver le groupe de tests `createUserWorktree`, ajouter :

```typescript
it('configure core.hooksPath sur le dépôt principal après création', async () => {
  const result = await service.createUserWorktree('hooks-test');
  expect(result.success).toBe(true);

  const worktreePath = result.worktree!.path;
  const worktreeGit = simpleGit(worktreePath);
  const hooksPath = await worktreeGit.raw([
    'config',
    '--local',
    'core.hooksPath',
  ]);
  // Doit pointer vers .git/hooks du dépôt principal
  expect(hooksPath.trim()).toContain('.git/hooks');
});
```

- [ ] **Étape 2 : Exécuter le test pour confirmer l'échec**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configure core.hooksPath"
```

Attendu : `FAIL` — hooksPath est vide.

- [ ] **Étape 3 : Ajouter la configuration hooksPath dans `createUserWorktree`**

Dans `gitWorktreeService.ts`, trouver `createUserWorktree` après l'appel `git worktree add` (environ ligne 1140), avant `return { success: true, worktree }` ajouter :

```typescript
// Configurer hooksPath pour que les commits dans ce worktree utilisent
// les hooks du dépôt principal. Priorité : .husky/ (courant) → .git/hooks (fallback).
// Reprend la logique de performPostCreationSetup() de claude-code.
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
      // Non trouvé — essayer le suivant.
    }
  }
  if (hooksPath) {
    const worktreeGit = simpleGit(worktreePath);
    // Ignorer le sous-processus si core.hooksPath est déjà défini à la même valeur
    // (~14ms d'overhead de spawn selon le commentaire de claude-code sur parseGitConfigValue).
    let existing = '';
    try {
      existing = (
        await worktreeGit.raw(['config', '--local', 'core.hooksPath'])
      ).trim();
    } catch {
      // Clé non définie — chaîne vide signifie "continuer".
    }
    if (existing !== hooksPath) {
      await worktreeGit.raw(['config', 'core.hooksPath', hooksPath]);
    }
  }
} catch (hookError) {
  debugLogger.warn(
    `createUserWorktree: échec de la définition de core.hooksPath : ${hookError}`,
  );
  // Non bloquant : le worktree est utilisable, juste sans hooks hérités.
}
```

`this.sourceRepoPath` est un champ privé assigné dans le constructeur de `GitWorktreeService` (`this.sourceRepoPath = path.resolve(sourceRepoPath)`, environ ligne 224). Vérifier que `import * as fs from 'node:fs/promises'` est présent en haut du fichier.

- [ ] **Étape 4 : Appliquer la même modification à `createAgentWorktree`**

Trouver la méthode `createAgentWorktree`, après son `git worktree add`, ajouter le même bloc de code hooksPath (code complet identique à l'étape 3, le `slug` provient des paramètres du worktree agent).

- [ ] **Étape 5 : Exécuter les tests pour confirmer le succès**

```bash
cd packages/core
npx vitest run src/services/gitWorktreeService.test.ts -t "configure core.hooksPath"
```

Attendu : `PASS`.

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/services/gitWorktreeService.ts \
        packages/core/src/services/gitWorktreeService.test.ts
git commit -m "feat(worktree): configurer core.hooksPath après création du worktree"
```

---

## Tâche 3 : EnterWorktreeTool écrit WorktreeSession

**Fichiers :**

- Modifier : `packages/core/src/tools/enter-worktree.ts`
- Modifier : `packages/core/src/tools/enter-worktree.test.ts`

- [ ] **Étape 1 : Écrire un test en échec**

Dans `enter-worktree.test.ts`, après le cas de création réussie, ajouter :

```typescript
import { readWorktreeSession } from '../services/worktreeSessionService.js';

it('écrit le sidecar WorktreeSession après création du worktree', async () => {
  // Arrange : utiliser la configuration de test existante qui crée un vrai dépôt git
  // et invoque l'outil (copier depuis le test existant "custom name")
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

- [ ] **Étape 2 : Exécuter le test pour confirmer l'échec**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts -t "écrit WorktreeSession"
```

Attendu : `FAIL` — le fichier de session est null.

- [ ] **Étape 3 : Modifier `enter-worktree.ts` pour écrire la session après création réussie**

Ajouter l'import en haut de `enter-worktree.ts` :

```typescript
import { writeWorktreeSession } from '../services/worktreeSessionService.js';
```

Dans la méthode `execute()`, après avoir récupéré baseBranch et avant l'appel à `createUserWorktree()`, capturer le SHA du HEAD actuel :

```typescript
// Capturer HEAD avant le branching — WorktreeExitDialog utilise ceci pour compter
// les nouveaux commits créés dans le worktree (reprend l'approche de claude-code).
let originalHeadCommit = '';
try {
  originalHeadCommit = await service.getHeadCommit();
} catch {
  // Non bloquant.
}
```

Ajouter également une méthode publique dans `GitWorktreeService` (`gitWorktreeService.ts`, à placer près de `getCurrentBranch()`) :

```typescript
async getHeadCommit(): Promise<string> {
  try {
    return (await this.git.raw(['rev-parse', '--short', 'HEAD'])).trim();
  } catch {
    return '';
  }
}
```

Après l'appel à `writeWorktreeSessionMarker(...)`, ajouter :

```typescript
// Persister la session worktree pour que --resume puisse restaurer le contexte.
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
  debugLogger.warn(`enter_worktree: échec de l'écriture de l'état de session : ${error}`);
}
```

- [ ] **Étape 4 : Exécuter les tests pour confirmer le succès**

```bash
cd packages/core
npx vitest run src/tools/enter-worktree.test.ts
```

Attendu : tous les tests passent, sans régression.

- [ ] **Étape 5 : Vérification de type**

```bash
cd packages/core && npm run typecheck
```

- [ ] **Étape 6 : Commit**

```bash
git add packages/core/src/tools/enter-worktree.ts \
        packages/core/src/tools/enter-worktree.test.ts
git commit -m "feat(worktree): persistance de WorktreeSession dans EnterWorktreeTool"
```

---

## Tâche 4 : ExitWorktreeTool efface WorktreeSession

**Fichiers :**

- Modifier : `packages/core/src/tools/exit-worktree.ts`
- Modifier : `packages/core/src/tools/exit-worktree.test.ts`

- [ ] **Étape 1 : Écrire des tests en échec**

Dans `exit-worktree.test.ts`, ajouter deux cas (keep et remove doivent tous deux effacer la session) :

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

it('efface WorktreeSession après keep', async () => {
  await seedSession(config, 'exit-keep-test');
  // Créer d'abord le worktree pour que exit_worktree puisse le trouver
  await config.getWorktreeService().createUserWorktree('exit-keep-test');
  await invokeTool(tool, { name: 'exit-keep-test', action: 'keep' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});

it('efface WorktreeSession après remove', async () => {
  await seedSession(config, 'exit-remove-test');
  await config.getWorktreeService().createUserWorktree('exit-remove-test');
  await invokeTool(tool, { name: 'exit-remove-test', action: 'remove' });

  const sessionPath = config
    .getSessionService()
    .getWorktreeSessionPath(config.getSessionId());
  expect(await readWorktreeSession(sessionPath)).toBeNull();
});
```

- [ ] **Étape 2 : Exécuter les tests pour confirmer l'échec**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts -t "efface WorktreeSession"
```

Attendu : `FAIL`.

- [ ] **Étape 3 : Modifier `exit-worktree.ts`**

Ajouter l'import en haut :

```typescript
import { clearWorktreeSession } from '../services/worktreeSessionService.js';
```

Trouver le chemin de retour pour `action === 'keep'` (environ lignes 184-196), avant `return { llmContent: ..., returnDisplay: ... }`, ajouter :

```typescript
try {
  await clearWorktreeSession(
    this.config
      .getSessionService()
      .getWorktreeSessionPath(this.config.getSessionId()),
  );
} catch (error) {
  debugLogger.warn(`exit_worktree: échec de l'effacement de l'état de session : ${error}`);
}
```

Trouver le chemin de retour pour `action === 'remove'` (après l'appel à `removeUserWorktree`), ajouter le même bloc `clearWorktreeSession`.

- [ ] **Étape 4 : Exécuter les tests pour confirmer le succès**

```bash
cd packages/core
npx vitest run src/tools/exit-worktree.test.ts
```

Attendu : tous les tests passent.

- [ ] **Étape 5 : Commit**

```bash
git add packages/core/src/tools/exit-worktree.ts \
        packages/core/src/tools/exit-worktree.test.ts
git commit -m "feat(worktree): effacement de WorktreeSession dans ExitWorktreeTool"
```

---

## Tâche 5 : Hook useWorktreeSession + UIState.activeWorktree

**Fichiers :**

- Créer : `packages/cli/src/ui/hooks/useWorktreeSession.ts`
- Modifier : `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Modifier : `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Étape 1 : Ajouter le champ `activeWorktree` dans `UIStateContext.tsx`**

Trouver l'interface `UIState` (environ ligne 85), près de `branchName: string | undefined;`, ajouter :

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

Trouver la valeur initiale de UIState (généralement dans le provider UIState dans `AppContainer.tsx`) ou la defaultValue de `createContext`, ajouter `activeWorktree: null`.

- [ ] **Étape 2 : Créer `useWorktreeSession.ts`**

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
      // Le fichier n'existe pas encore — le watcher sera configuré lors du prochain événement d'écriture via load()
    }

    return () => {
      watcher?.close();
    };
  }, [config]);

  return session;
}
```
> [!note]  
> `readWorktreeSession` et `WorktreeSession` doivent être exportés depuis `@qwen-code/qwen-code-core` et ajoutés dans `packages/core/src/index.ts` :

```typescript
export {
  readWorktreeSession,
  writeWorktreeSession,
  clearWorktreeSession,
  type WorktreeSession,
} from './services/worktreeSessionService.js';
```

- [ ] **Étape 3 : Utiliser le hook dans `AppContainer.tsx` pour synchroniser `activeWorktree`**

Ajouter l'import en haut de `AppContainer.tsx` :

```typescript
import { useWorktreeSession } from './hooks/useWorktreeSession.js';
```

Dans le corps de la fonction `AppContainer` (près de l'endroit où `branchName` est utilisé), ajouter :

```typescript
const worktreeSession = useWorktreeSession();
```

Dans la valeur passée au `UIStateContext.Provider`, ajouter :

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

- [ ] **Étape 4 : Vérification de type**

```bash
npm run typecheck
```

Exécuter depuis la racine du dépôt (vérification inter-workspace). Attendu : aucune erreur.

- [ ] **Étape 5 : Commit**

```bash
git add packages/core/src/services/worktreeSessionService.ts \
        packages/core/src/index.ts \
        packages/cli/src/ui/hooks/useWorktreeSession.ts \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add useWorktreeSession hook and UIState.activeWorktree"
```

---

## Tâche 6 : Champ worktree dans StatusLineCommandInput + Ligne worktree dans le Footer

**Fichiers :**

- Modifier : `packages/cli/src/ui/hooks/useStatusLine.ts`
- Modifier : `packages/cli/src/ui/components/Footer.tsx`

- [ ] **Étape 1 : Ajouter le champ `worktree` dans `useStatusLine.ts`**

Trouver l'interface `StatusLineCommandInput` (environ ligne 21), après le champ `git?: { branch: string }`, ajouter :

```typescript
worktree?: {
  /** slug du worktree (nom court, ex. "my-feature") */
  name: string;
  /** chemin physique du worktree */
  path: string;
  /** nom de la branche git (ex. "worktree-my-feature") */
  branch: string;
  /** répertoire de travail avant d'entrer dans le worktree */
  original_cwd: string;
  /** branche avant d'entrer dans le worktree */
  original_branch: string;
};
```

Les noms de champs sont cohérents avec ceux de claude-code, permettant aux utilisateurs de réutiliser les scripts statusline entre qwen-code et claude-code.

Trouver l'endroit où l'objet `input: StatusLineCommandInput` est construit dans le callback `doUpdate` (environ ligne 225), après `...(ui.branchName && { git: { branch: ui.branchName } })`, ajouter :

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

Remarque : `UIState.activeWorktree` doit également inclure les champs `originalCwd` et `originalBranch` (à compléter dans le mapping AppContainer de la Tâche 5).

- [ ] **Étape 2 : Ajouter une ligne d'affichage intégrée pour le worktree dans `Footer.tsx`**

Importer `useUIState` en haut de `Footer.tsx` (déjà présent).

Trouver la zone de rendu de `statusLineLines` (environ lignes 140-148) :

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

Avant cela, insérer la ligne worktree (affichée quand `activeWorktree` est non nul et qu'il n'y a pas de statusline utilisateur) :

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

- [ ] **Étape 3 : Vérification de type + Build**

```bash
npm run typecheck && npm run build
```

Attendu : aucune erreur.

- [ ] **Étape 4 : Commit**

```bash
git add packages/cli/src/ui/hooks/useStatusLine.ts \
        packages/cli/src/ui/components/Footer.tsx
git commit -m "feat(worktree): show active worktree in Footer and StatusLine payload"
```

---

## Tâche 7 : Injection du contexte worktree dans --resume

**Fichiers :**

- Modifier : `packages/cli/src/ui/AppContainer.tsx:459-489`

- [ ] **Étape 1 : Injecter un message de contexte worktree dans le chemin de reprise**

Dans `AppContainer.tsx`, trouver le chemin de reprise (env. lignes 459-489) :

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);
  // ...
}
```

Modifier en :

```typescript
const resumedSessionData = config.getResumedSessionData();
if (resumedSessionData) {
  const historyItems = buildResumedHistoryItems(resumedSessionData, config);
  historyManager.loadHistory(historyItems);

  // S'il existe une session worktree active, injecter un rappel de contexte pour
  // que le modèle sache immédiatement qu'il doit continuer à utiliser le chemin du worktree.
  const ws = await readWorktreeSession(
    config.getSessionService().getWorktreeSessionPath(config.getSessionId()),
  );
  if (ws) {
    // Vérifier que le répertoire du worktree existe toujours avant de le considérer comme actif.
    const worktreeAlive = await fs
      .stat(ws.worktreePath)
      .then((s) => s.isDirectory())
      .catch(() => false);

    if (worktreeAlive) {
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text:
            `[Reprise] Worktree actif : "${ws.slug}" dans ${ws.worktreePath} ` +
            `(branche : ${ws.worktreeBranch}). Continuer à utiliser ce chemin pour toutes les opérations sur les fichiers.`,
        },
        Date.now(),
      );
    } else {
      // sidecar obsolète — le worktree a été supprimé de l'extérieur, nettoyer.
      await clearWorktreeSession(
        config
          .getSessionService()
          .getWorktreeSessionPath(config.getSessionId()),
      );
    }
  }

  // ... suite du code de reprise existant (agents d'arrière-plan, nom de session)
}
```

En haut du fichier, ajouter les imports :

```typescript
import {
  readWorktreeSession,
  clearWorktreeSession,
} from '@qwen-code/qwen-code-core';
import * as fs from 'node:fs/promises';
```

(`fs` est peut-être déjà importé, vérifier et fusionner.)

- [ ] **Étape 2 : Vérification de type**

```bash
npm run typecheck
```

- [ ] **Étape 3 : Commit**

```bash
git add packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): inject context message on --resume when worktree is active"
```

---

## Tâche 8 : WorktreeExitDialog

**Fichiers :**

- Créer : `packages/cli/src/ui/components/WorktreeExitDialog.tsx`
- Créer : `packages/cli/src/ui/components/WorktreeExitDialog.test.tsx`
- Modifier : `packages/cli/src/ui/components/DialogManager.tsx`
- Modifier : `packages/cli/src/ui/contexts/UIStateContext.tsx`
- Modifier : `packages/cli/src/ui/AppContainer.tsx`

- [ ] **Étape 1 : Ajouter l'état du dialogue dans `AppContainer.tsx`**

Les états de dialogue comme `showWelcomeBackDialog` sont retournés par leurs hooks respectifs à AppContainer, puis passés via l'objet value de UIState au Provider. Faire pareil pour WorktreeExitDialog :

Dans le corps de la fonction `AppContainer.tsx`, ajouter :

```typescript
const [showWorktreeExitDialog, setShowWorktreeExitDialog] = useState(false);
```

Dans l'objet value de UIState Provider, ajouter :

```typescript
showWorktreeExitDialog,
```

Dans l'interface `UIState`, ajouter (près des autres champs de dialogue) :

```typescript
showWorktreeExitDialog: boolean;
```

- [ ] **Étape 2 : Écrire le test du composant (échec attendu)**

```typescript
// packages/cli/src/ui/components/WorktreeExitDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

describe('WorktreeExitDialog', () => {
  it('affiche l'état de chargement initialement', () => {
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
    // Doit afficher le spinner de chargement immédiatement avant que git status ne résolve
    expect(lastFrame()).toContain('Vérification');
  });

  it('affiche slug, branche et options après le chargement (aucune modification)', async () => {
    // Utiliser vi.mock pour stubber execFileNoThrow / execFile afin que git status retourne vide
    // et rev-list retourne "0". Voir les tests de dialogues existants pour le modèle de mock.
    // Après résolution de l'effet asynchrone :
    //   - affiche "my-feature" et "worktree-my-feature"
    //   - affiche les options Keep et Remove
    //   - affiche "aucune modification non commitée" ou similaire
  });
});
```

- [ ] **Étape 3 : Exécuter le test pour confirmer l'échec**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

Attendu : `FAIL` — le module n'existe pas.

- [ ] **Étape 4 : Créer `WorktreeExitDialog.tsx`**

S'inspirer du modèle RadioSelect de `WelcomeBackDialog.tsx`, en ajoutant une vérification de l'état sale au montage (aligné sur la logique `loadChanges` de `WorktreeExitDialog.tsx` de claude-code) :

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
        // Modifications non commitées (suivies + non suivies)
        const { stdout: statusOut } = await execa(
          'git',
          ['status', '--porcelain'],
          { cwd: worktreePath },
        );
        const files = statusOut.split('\n').filter((l) => l.trim().length > 0);
        setChangedFiles(files);

        // Nouveaux commits depuis la création du worktree
        if (originalHeadCommit) {
          const { stdout: countOut } = await execa(
            'git',
            ['rev-list', '--count', `${originalHeadCommit}..HEAD`],
            { cwd: worktreePath },
          );
          setCommitCount(parseInt(countOut.trim(), 10) || 0);
        }
      } catch {
        // Si git échoue, afficher le dialogue sans les comptages.
      } finally {
        setLoading(false);
      }
    }
    void loadDirtyState();
  }, [worktreePath, originalHeadCommit]);

  const options: Array<RadioSelectItem<Choice>> = [
    {
      key: 'keep',
      label: 'Conserver le worktree (quitter sans supprimer)',
      value: 'keep',
    },
    {
      key: 'remove',
      label:
        changedFiles.length > 0 || commitCount > 0
          ? `Supprimer le worktree et la branche (abandonne ${commitCount} commit(s), ${changedFiles.length} fichier(s))`
          : 'Supprimer le worktree et la branche',
      value: 'remove',
    },
    { key: 'cancel', label: 'Annuler (rester dans la session)', value: 'cancel' },
  ];

  if (loading) {
    return (
      <Box marginY={1} paddingX={2}>
        <Text color={theme.text.secondary}>Vérification du statut du worktree…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1} paddingX={2}>
      <Text color={theme.status.warning}>
        {`Worktree actif : "${slug}" (${branch})`}
      </Text>
      {(changedFiles.length > 0 || commitCount > 0) && (
        <Box flexDirection="column" marginBottom={1}>
          {commitCount > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${commitCount} nouveau(x) commit(s) sur ${branch}`}
            </Text>
          )}
          {changedFiles.length > 0 && (
            <Text color={theme.text.secondary}>
              {`  ${changedFiles.length} fichier(s) non commité(s)`}
            </Text>
          )}
        </Box>
      )}
      <Text color={theme.text.secondary}>Que souhaitez-vous faire ?</Text>
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

Remarque : `execa` est déjà une dépendance du projet (ou utiliser `execFileNoThrow`, voir la méthode de claude-code). Vérifier `packages/cli/package.json` pour l'outil exec disponible ; si `execa` n'est pas présent, utiliser l'`execFile` natif de Node.js enveloppé.

- [ ] **Étape 5 : Exécuter le test pour confirmer la réussite**

```bash
cd packages/cli
npx vitest run src/ui/components/WorktreeExitDialog.test.tsx
```

Attendu : le test sur l'état de chargement réussit.

- [ ] **Étape 6 : Enregistrer dans `DialogManager.tsx`**

Trouver le dernier bloc de rendu de dialogue dans DialogManager, ajouter :

```tsx
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

// Dans le JSX retourné par DialogManager, après le dernier dialogue, ajouter :
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
        // Supprimer le worktree directement via le service (pas besoin d'appel d'outil).
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
          // Non-fatal — quitter quand même.
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

`setShowWorktreeExitDialog` vient du useState défini dans AppContainer à l'étape 1 ; il doit être passé via props ou directement à l'endroit où DialogManager est appelé (voir le modèle de passage des autres dialogues).

- [ ] **Étape 7 : Intercepter le deuxième Ctrl+C dans `AppContainer.tsx`**

Dans le callback `handleExit` (environ ligne 2387), trouver la branche où `pressedOnce` est `true` et appelle `handleSlashCommand('/quit')` :

```typescript
// Double pression rapide : quitter directement (préserver l'habitude de l'utilisateur)
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // Quitter directement
  handleSlashCommand('/quit');
  return;
}
```

Modifier en :

```typescript
if (pressedOnce) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  // Si on est dans un worktree, afficher le dialogue de sortie au lieu de quitter directement.
  if (worktreeSession) {
    setShowWorktreeExitDialog(true);
    return;
  }
  handleSlashCommand('/quit');
  return;
}
```

`worktreeSession` est la valeur retournée par `useWorktreeSession()` à l'étape 1 (déjà dans le corps de AppContainer). L'ajouter au tableau de dépendances du `useCallback` de `handleExit`. `setShowWorktreeExitDialog` vient du useState de l'étape 1.

- [ ] **Étape 9 : Vérification de type + tests complets**

```bash
npm run typecheck
cd packages/core && npx vitest run
cd packages/cli && npx vitest run
```

Attendu : tout passe, aucune régression.

- [ ] **Étape 10 : Build**

```bash
npm run build && npm run bundle
```

Attendu : `dist/cli.js` généré sans erreur.

- [ ] **Étape 11 : Commit**

```bash
git add packages/cli/src/ui/components/WorktreeExitDialog.tsx \
        packages/cli/src/ui/components/WorktreeExitDialog.test.tsx \
        packages/cli/src/ui/components/DialogManager.tsx \
        packages/cli/src/ui/contexts/UIStateContext.tsx \
        packages/cli/src/ui/AppContainer.tsx
git commit -m "feat(worktree): add WorktreeExitDialog — intercept Ctrl+C when worktree is active"
```

---

## Critères d'acceptation

| Scénario                          | Comportement attendu                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| Après l'appel à `enter_worktree`  | `<sessionId>.worktree.json` existe, contient slug / path / branch  |
| Après l'appel à `exit_worktree`   | `<sessionId>.worktree.json` est supprimé                           |
| `--resume` avec worktree existant | Le Footer affiche la ligne worktree ; message INFO avec le chemin  |
| `--resume` avec worktree supprimé | Le fichier sidecar est nettoyé, pas de ligne worktree affichée     |
| Premier Ctrl+C dans le worktree   | Affiche "Press Ctrl+C again to exit."                              |
| Deuxième Ctrl+C dans le worktree  | Affiche WorktreeExitDialog (keep / remove / cancel)                |
| Deuxième Ctrl+C hors worktree     | Quitte directement (comportement inchangé)                         |
| Commit dans un nouveau worktree   | `core.hooksPath` pointe vers les hooks du dépôt principal, pre-commit déclenché normalement |
| Entrée standard du script statusline | Le payload JSON contient `worktree.slug` et `worktree.branch`   |