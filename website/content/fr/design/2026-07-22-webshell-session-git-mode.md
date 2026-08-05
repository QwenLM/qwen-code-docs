# Sélection du mode Git pour les nouvelles sessions du Web Shell

## Contexte

Au quotidien, lorsqu'un utilisateur crée une nouvelle session, il a trois
flux de travail Git :

1. **Branche courante** — développer directement sur la branche courante
   (comportement par défaut)
2. **Isolation par worktree** — créer un worktree + une branche
   indépendants, le répertoire principal n'est pas affecté
3. **Nouvelle branche** — créer une nouvelle branche dans le même répertoire
   de travail et basculer dessus

Les scénarios 1 et 2 sont déjà entièrement pris en charge (le scénario 2,
voir
[2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md)
et
[2026-07-20-worktree-empty-state-toggle.md](./2026-07-20-worktree-empty-state-toggle.md)).
Le scénario 3 manque — lorsque l'utilisateur veut « ouvrir une nouvelle
branche pour cette tâche », il doit d'abord exécuter manuellement
`git checkout -b` puis créer la session, ou est forcé d'utiliser un worktree
(qui introduit une isolation de répertoire inutile).

## Objectifs

- Fournir un **sélecteur de mode Git** unifié dans l'état vide du chat,
  couvrant les trois scénarios.
- Mode « Nouvelle branche » : le démon exécute automatiquement
  `git checkout -b` lors du `POST /session`, la session démarre directement
  sur la nouvelle branche.
- Réutiliser la chaîne de création de worktree existante, sans changer le
  comportement des worktrees.
- Rétrocompatibilité : sans les nouveaux paramètres, le comportement est
  totalement inchangé.

## Non-objectifs

- Pas de prise en charge du checkout d'une branche existante (la v1 ne fait
  que la création ; la bascule vers une branche existante pourra être
  ajoutée ultérieurement de manière incrémentale).
- Pas de retour automatique à la branche d'origine à la fin de la session
  (pour éviter de perdre l'état de l'utilisateur).
- Pas d'UI de merge-back.
- Pas de changement du comportement des outils `enter_worktree` /
  `exit_worktree`.

## Conception

### UI de l'état vide : Git Chip dans le composer

Le sélecteur de mode n'est pas un bloc indépendant, mais est **intégré à la
barre d'outils inférieure du composer** — en réutilisant l'emplacement de la
git chip existante (sous le champ de saisie, à gauche du bouton d'envoi). La
chip affiche par défaut la branche courante `⎇ main` ; un clic ouvre une
popover pour choisir le mode :

```text
┌─ composer ───────────────────────────────────────────────┐
│  Décrivez votre tâche…                                    │
│                                                           │
│  📎  @  🎙              [⎇ main ▾]  [Envoyer]             │
└───────────────────────────────────────────────────────────┘
                              │ clic
                              ▼
              ┌─ Popover modes Git ────────────────┐
              │  ● Branche courante  directement   │
              │    sur main                        │
              │  ○ Nouvelle branche  créée depuis  │
              │    main                            │
              │    [saisie du nom — dépliée si     │
              │     sélectionnée]                  │
              │  ○ Worktree  copie indépendante,   │
              │    parallélisable                  │
              │  ────────────────────────────────  │
              │  $ git checkout -b feat/x ← main   │
              │                  [Créer la branche]│
              └────────────────────────────────────┘
```

- **Branche courante** (défaut) : la chip affiche `⎇ main` (vert),
  équivalent au comportement existant. Une fois sélectionnée, la popover se
  ferme automatiquement.
- **Nouvelle branche** : la popover déplie un champ de saisie du nom de
  branche + une notice de concurrence, avec validation en temps réel (nom de
  branche git valide, pas de conflit avec une branche existante). Après
  confirmation, la chip devient `⎇ → feat/xxx` (orange), avec un ✕ pour
  revenir au défaut en un clic.
- **Isolation par worktree** : affiche un aperçu du slug généré
  automatiquement. Après confirmation, la chip devient `⎇ worktree isolé`
  (violet), avec un ✕ pour revenir au défaut en un clic.

Le bas de la popover prévisualise en temps réel la commande git qui sera
exécutée (`git checkout -b …` / `git worktree add …`), afin que
l'utilisateur sache précisément ce qui va se passer.

Avantages de l'approche chip : elle n'occupe pas d'espace vertical dans la
zone de bienvenue ; l'entrée est dans le composer où se trouve l'attention de
l'utilisateur ; en état non vide (session existante), la chip reste visible,
avec une sémantique cohérente.

Les conditions de visibilité sont les mêmes que pour le toggle worktree
existant : workspace fiable + dépôt git. Si elles ne sont pas satisfaites,
la chip se replie en un simple indicateur de branche en lecture seule
(comportement existant).

#### Machine à états

Étendre `pendingWorktreeRef` / `worktreePending` en une intention pending
unifiée :

```typescript
type SessionGitIntent =
  | { mode: 'current' }
  | { mode: 'branch'; name: string }
  | { mode: 'worktree'; slug?: string };
```

- Sélectionner « Branche courante » → `{ mode: 'current' }` (équivalent à
  `undefined`, aucun paramètre transmis).
- Sélectionner « Nouvelle branche » → `{ mode: 'branch', name }`.
- Sélectionner « Worktree » → `{ mode: 'worktree', slug? }` (réutilise la
  logique existante).
- Envoi du premier message → `ensureSessionForPrompt` porte le paramètre
  correspondant selon l'intention.
- Après une création réussie, l'intention est effacée ; en cas d'échec, elle
  est conservée pour un retry.

### Changements d'API

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

`branch` et `worktree` sont mutuellement exclusifs ; transmettre les deux
renvoie 400.

#### Réponses `DaemonSession` / `DaemonSessionSummary`

```typescript
export interface DaemonBranchInfo {
  name: string; // nom de la nouvelle branche créée
  baseBranch: string; // branche de base au moment de la création
}

export interface DaemonSession {
  // ... existing fields ...
  worktree?: DaemonWorktreeInfo;
  branch?: DaemonBranchInfo;
}
```

#### Traitement de la route `POST /session` (`routes/session.ts`)

Avant la logique de traitement worktree existante, ajouter le traitement de
branch :

```text
1. Valider l'exclusivité mutuelle branch / worktree
2. Valider que branch.name est un nom de branche git valide
3. Vérifier que le nom de branche n'entre pas en conflit avec une branche existante (git rev-parse --verify)
4. Détecter un arbre sale (git status --porcelain), s'il y a des modifications renvoyer 409 branch_dirty_tree
5. Enregistrer baseBranch = branche courante (git rev-parse --abbrev-ref HEAD)
6. git checkout -b <name>
7. branchMeta = { name, baseBranch }
8. Forcer sessionScope = 'thread'
9. spawnOrAttach normal (cwd inchangé)
10. Rollback en cas d'échec : git checkout <baseBranch> && git branch -D <name>
```

Pas besoin de `changeSessionCwd` (le répertoire de travail ne change pas),
pas besoin de marqueur de worktree.

#### Codes d'erreur

| Code d'erreur                    | Signification                                                          |
| -------------------------------- | ---------------------------------------------------------------------- |
| `branch_and_worktree_conflict` | `branch` et `worktree` transmis simultanément                          |
| `invalid_branch`               | le champ `branch` n'est pas un objet (doit être `{"name":"..."}`)      |
| `branch_invalid_name`          | nom de branche invalide                                                |
| `branch_session_conflict`      | ce workspace a déjà une session de branche, ou une autre session active existe déjà sur le checkout partagé |
| `branch_init_failed`           | échec de l'initialisation du service git                               |
| `branch_not_git_repo`          | le workspace n'est pas un dépôt git                                    |
| `branch_already_exists`        | le nom de branche existe déjà                                          |
| `branch_status_failed`         | échec de la vérification de l'état du répertoire de travail            |
| `branch_dirty_tree`            | le répertoire de travail a des modifications non commitées, commit ou stash requis d'abord |
| `branch_checkout_failed`       | échec de `git checkout -b` (autre raison)                              |

### Chaîne de transmission des paramètres côté front

```text
App.tsx (état gitIntent)
  → sessionPreparation.ts createAndAttachSessionForPrompt({ branch })
    → actions.ts createSession({ branch })
      → DaemonClient.createOrAttachSession({ branch })
        → POST /session { branch: { name } }
```

Totalement symétrique avec la chaîne worktree, chaque couche ajoute la
transmission de `branch`.

### Affichage dans la barre latérale

- Session worktree : badge `GitForkIcon` existant, inchangé.
- Session de branche : badge `GitBranchIcon` + nom de branche.
- Session ordinaire : pas de badge, inchangé.

### Limite de concurrence

Une session « nouvelle branche » du même workspace modifie le HEAD du
répertoire de travail partagé ; plusieurs sessions de branche entrent en
conflit. Stratégie de limitation :

- **Côté serveur** : lorsque `POST /session` porte `branch`, vérifier si le
  même workspace a déjà une session de branche active (via la liste de
  sessions du bridge + `branchMeta`). Si oui, renvoyer 409
  `branch_session_conflict`.
- **Côté front** : lorsque « Nouvelle branche » est sélectionné dans l'état
  vide et qu'une session de branche active existe déjà, afficher une notice
  et désactiver.

Les sessions worktree ne sont pas soumises à cette limite (chacune a son
répertoire indépendant).

### Modifications de fichiers

| Fichier                                                              | Modification                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`                 | ajout du champ `branch` à `CreateSessionRequest`                            |
| `packages/sdk-typescript/src/daemon/types.ts`                        | `DaemonBranchInfo`, `DaemonSession.branch`, `DaemonSessionSummary.branch`   |
| `packages/cli/src/serve/routes/session.ts`                           | logique de création de branch de `POST /session` + rollback                 |
| `packages/webui/src/daemon/session/actions.ts`                       | transmission de `branch` par `createSession`                                |
| `packages/webui/src/daemon/session/types.ts`                         | ajout de `branch` à la signature de `createSession`                         |
| `packages/web-shell/client/App.tsx`                                  | machine à états `SessionGitIntent`, UI du sélecteur de mode, vérification de concurrence |
| `packages/web-shell/client/App.module.css`                           | styles du sélecteur                                                         |
| `packages/web-shell/client/utils/sessionPreparation.ts`              | transmission de `branch`                                                    |
| `packages/web-shell/client/i18n.tsx`                                 | nouvelles clés i18n (en/zh)                                                 |
| `packages/web-shell/client/components/sidebar/WebShellSidebar.tsx`   | badge de session de branch                                                  |

### i18n

| Clé                              | EN                                                     | ZH                                       |
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

## Questions tranchées

1. **Valeur par défaut du nom de branche** : pas de génération automatique,
   saisie par l'utilisateur. Champ laissé vide + placeholder en indice (par
   exemple `feat/my-feature`), pour réduire les préconfigurations.
2. **Working tree sale** : le serveur détecte l'état sale avant
   `git checkout -b` (`git status --porcelain`). S'il y a des modifications
   non commitées, renvoyer 409 `branch_dirty_tree` ; le front invite
   l'utilisateur à committer ou stash avant de créer une session de branche.
   Pas de prédétection au niveau UI (pour éviter une divergence avec le
   comportement réel de git), le serveur décide uniformément.
3. **Reprise de session (resume)** : pas besoin de sidecar. Le worktree a
   besoin d'un sidecar parce que le répertoire de travail est séparé du
   dépôt principal, et le resume doit connaître le chemin du worktree. Le
   répertoire de travail d'une session de branche est le répertoire
   d'origine, et `git branch` suffit à connaître la branche courante, aucun
   enregistrement supplémentaire n'est requis. À noter :
   `DaemonSessionSummary.branch` n'est actuellement conservé qu'en mémoire
   (mapping du bridge), il est perdu après le redémarrage du démon, donc le
   badge de la barre latérale et la garde de concurrence ne survivent pas à
   un redémarrage ; la persistance relève d'un travail ultérieur.
