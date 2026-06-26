# Conception de la capacité universelle Worktree

## Énoncé du problème

qwen-code ne dispose actuellement que d'une implémentation interne de worktree (`GitWorktreeService`) dédiée au scénario de comparaison multi-modèles Arena. Les utilisateurs ne peuvent pas utiliser le worktree pour isoler leur travail dans des sessions ordinaires, et `AgentTool` ne prend pas en charge la création d'un environnement de travail isolé via worktree pour les sous-agents.

L'objectif est de faire du worktree une capacité universelle, prenant en charge l'isolation au niveau session utilisateur et au niveau agent, tout en garantissant que l'expérience fonctionnelle existante d'Arena reste totalement inchangée.

## Comparaison actuelle

| Fonctionnalité                         | qwen-code       | claude-code | Phase    |
| -------------------------------------- | --------------- | ----------- | -------- |
| Outil `EnterWorktree`                  | ✅ (Phase A)    | ✅          | —        |
| Outil `ExitWorktree`                   | ✅ (Phase A)    | ✅          | —        |
| `AgentTool isolation: 'worktree'`      | ✅ (Phase B)    | ✅          | —        |
| Nettoyage automatique des worktrees obsolètes | ✅ (Phase B)   | ✅          | —        |
| Persistance et restauration de l'état de session worktree | ❌ | ✅ | Phase C |
| Configuration post-création (hooks)   | ❌              | ✅          | Phase C |
| Affichage de l'état worktree dans la StatusLine | ❌ | ✅ | Phase C |
| WorktreeExitDialog (invite de sortie) | ❌              | ✅          | Phase C |
| Indicateur CLI `--worktree`            | ✅ (Phase D)    | ✅          | —        |
| Répertoires de liens symboliques (node_modules, etc.) | ✅ (Phase D) | ✅ | — |
| Référence de PR (`--worktree=#123`)   | ✅ (Phase D)    | ✅          | —        |
| sparse checkout                        | ❌              | ✅          | Future   |
| Intégration tmux                       | ❌              | ✅          | Future   |
| Isolation worktree multi-modèles Arena | ✅ (spécifique qwen) | ❌ | — |
| Gestion de l'état sale (stash + copie) | ✅              | ✅          | —        |
| Suivi du commit de base (baseline commit) | ✅ (spécifique qwen) | ❌ | — |

## Principes de conception

**Le worktree est une capacité universelle, Arena en est une application de plus haut niveau.**

- Couche universelle worktree : outils `EnterWorktree`/`ExitWorktree`, paramètre `isolation` d'`AgentTool`, gestion de l'état de session, nettoyage automatique
- Couche Arena : planification parallèle multi-modèles, chemin personnalisé `worktreeBaseDir`, création en masse et comparaison de différences ; continue d'utiliser la logique existante de `GitWorktreeService.setupWorktrees()`, sans être affectée par les modifications de la couche universelle

L'`isolation: 'worktree'` d'`AgentTool` emprunte uniquement le chemin universel. Arena ne passe pas par ce paramètre pour créer des worktrees ; les deux chemins sont indépendants.

## Chemins et configuration

### Chemin universel du worktree

Les worktrees créés par l'outil `EnterWorktree` ou par `isolation: 'worktree'` d'`AgentTool` sont stockés de manière fixe dans :

```
{racine du dépôt git}/.qwen/worktrees/{slug}
```

Le chemin n'est pas configurable. Règles de nommage du slug :

- Worktree de session utilisateur : nom spécifié par l'utilisateur, ou généré automatiquement (format : `{adjectif}-{nom}-{4 aléatoires}`)
- Worktree d'agent : `agent-{7 hex aléatoires}`

### Chemin worktree Arena (existant, inchangé)

Le chemin worktree d'Arena est contrôlé par `agents.arena.worktreeBaseDir`, par défaut `~/.qwen/arena` (`ArenaManager.ts:125`), totalement indépendant du chemin universel. Aucune modification n'est apportée.

### Configuration étendue

| Option de configuration               | Type       | Utilisation                                                         | Phase    |
| -------------------------------------- | ---------- | ------------------------------------------------------------------- | -------- |
| `ui.hideBuiltinWorktreeIndicator`      | `boolean`  | Masque la ligne `⎇ worktree-… (…)` intégrée dans le Footer, réservé à la statusline personnalisée | Phase C |
| `worktree.symlinkDirectories`          | `string[]` | Crée des liens symboliques de répertoires spécifiques (ex. `node_modules`) vers le worktree pour éviter le gaspillage de disque | Phase D |
| `worktree.sparsePaths`                 | `string[]` | Mode cône de git sparse-checkout ; pour les gros monorepos, n'écrit que les chemins spécifiés | Future  |

Phase A / B : aucun nouvel élément de configuration.

## Conception des outils

### EnterWorktree

**Condition de déclenchement :** L'utilisateur mentionne explicitement "start a worktree", "use a worktree", "create a worktree", etc. Ne doit pas se déclencher automatiquement quand l'utilisateur dit "corriger un bug" ou "développer une fonctionnalité".

**Schéma d'entrée :**

```
name?: string  // optionnel, format slug : lettres/chiffres/point/tiret bas/tiret, max 64 caractères
```

**Comportement :**

1. Vérifie qu'on n'est pas déjà dans un worktree (évite l'imbrication)
2. Résout la racine du dépôt git (gère le cas où on est déjà dans un sous-répertoire)
3. Appelle `GitWorktreeService` pour créer le worktree, chemin `.qwen/worktrees/{slug}`
4. Écrit la session worktree dans `SessionService`
5. Bascule le répertoire de travail vers le chemin du worktree
6. Vide le cache de fichiers

**Sortie :** `worktreePath`, `worktreeBranch`, `message`

### ExitWorktree

**Condition de déclenchement :** L'utilisateur dit "exit the worktree", "leave the worktree", "go back", etc.

**Schéma d'entrée :**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // valide uniquement si action='remove'
**

**Garde de sécurité :**

- Opère uniquement sur le worktree créé par `EnterWorktree` dans cette session
- Si `action='remove'` et qu'il existe des modifications non commitées, l'exécution est refusée (sauf si `discard_changes: true`)

**Comportement :**

- `keep` : vide l'état worktree de la session, conserve le répertoire et la branche du worktree, restaure le répertoire de travail d'origine
- `remove` : supprime le répertoire du worktree, supprime la branche git correspondante, vide l'état de la session, restaure le répertoire de travail d'origine

**Sortie :** `action`, `originalCwd`, `worktreePath`, `worktreeBranch`

## Modes de déclenchement utilisateur

| Mode               | Exemple                                                             | Phase de mise en œuvre |
| ------------------ | ------------------------------------------------------------------- | ---------------------- |
| Demande explicite dans la session | L'utilisateur dit "commencer à travailler dans un worktree" → le modèle appelle `EnterWorktree` | Phase A |
| Isolation d'agent  | Le modèle définit `isolation: 'worktree'` pour un sous-agent        | Phase B                |
| Indicateur CLI     | `qwen --worktree my-feature`                                        | Phase D                |

Pas de commande slash. Le déclenchement du worktree dans la session dépend d'une mention explicite de l'utilisateur ; `isolation: 'worktree'` est le seul scénario où le modèle prend la décision de manière autonome.

## Plan de mise en œuvre par phases

### Phase A : Outils principaux (worktree au niveau session utilisateur)

**Objectif :** L'utilisateur peut entrer/sortir d'un worktree dans une session.

**Fonctionnalités à implémenter :**

- Outil `EnterWorktree` : crée le worktree, bascule le répertoire de travail, enregistre l'état de session
- Outil `ExitWorktree` : deux modes de sortie (keep / remove), garde de sécurité
- Extension de `GitWorktreeService` : nouvelles méthodes `createUserWorktree()` / `removeUserWorktree()` orientées session utilisateur unique, réutilisant la logique git existante, sans modifier les interfaces batch utilisées par Arena
- Extension de `SessionService` : nouveau champ `WorktreeSession`, enregistrant `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` ; restaure le répertoire de travail worktree lors du `--resume`
- Prompt des outils : rédiger des instructions d'utilisation pour chaque outil, précisant clairement quand appeler et quand ne pas appeler

**Fichiers impactés :**

| Fichier                                              | Type de modification                         |
| ---------------------------------------------------- | -------------------------------------------- |
| `packages/core/src/tools/tool-names.ts`              | Ajout des constantes `ENTER_WORKTREE`, `EXIT_WORKTREE` |
| `packages/core/src/tools/EnterWorktreeTool/`         | Nouveaux dossiers : `EnterWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`          | Nouveaux dossiers : `ExitWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/services/gitWorktreeService.ts`   | Ajout de l'interface niveau session utilisateur (sans modifier l'interface Arena) |
| `packages/core/src/services/sessionService.ts`       | Ajout du champ `WorktreeSession` et des méthodes de lecture/écriture |
| `packages/core/src/tools/` point d'enregistrement    | Enregistrement des nouveaux outils           |

**Hors périmètre de la Phase A :**

- Isolation d'agent (Phase B)
- Configuration post-création comme hooks (Phase C)
- Affichage de l'état UI (Phase C)

---

### Phase B : Isolation d'agent (`AgentTool isolation: 'worktree'`) + mise à jour des descriptions

**Objectif :** Le modèle peut créer un worktree temporaire isolé pour un sous-agent, qui est automatiquement nettoyé après la fin de l'agent ; mise à jour simultanée des descriptions d'outils et des prompts impactés.

**Fonctionnalités à implémenter :**

_Cœur de l'isolation d'agent :_

- `AgentTool` ajoute le paramètre `isolation?: 'worktree'`
- Au démarrage de l'agent, crée un worktree temporaire (slug : `agent-{7hex}`, chemin : `.qwen/worktrees/agent-{7hex}`)
- Après la fin de l'agent : s'il n'y a pas de modification, suppression automatique ; s'il y a des modifications, conservation, retour du chemin et de la branche dans le résultat
- Nettoyage automatique des worktrees obsolètes : scanne `.qwen/worktrees/`, repère les motifs `agent-{7hex}`, supprime ceux de plus de 30 jours sans commit non poussé, stratégie fail-closed

_Mise à jour des descriptions et prompts :_

- La description d'`AgentTool` complète la documentation du paramètre `isolation: 'worktree'` (référence : `AgentTool/prompt.ts:272` de claude-code)
- Nouveau `buildWorktreeNotice()` : lorsqu'un sous-agent forké s'exécute dans un worktree, injecte un contexte indiquant qu'il est dans un worktree isolé, que le chemin est hérité de l'agent parent, et qu'il faut re-lire les fichiers avant de modifier (référence : `forkSubagent.ts:buildWorktreeNotice` de claude-code)

_Aucune modification nécessaire :_

- review skill (`SKILL.md`) : review utilise un mécanisme indépendant (chemin `.qwen/tmp/review-pr-<n>`, créé via la commande `qwen review fetch-pr`), totalement différent du chemin et du mécanisme universel du worktree ; pas de confusion possible

**Garantie de compatibilité Arena :** Arena ne passe pas par le paramètre `isolation` pour créer des worktrees ; cette modification ne touche pas au code d'Arena.

**Fichiers impactés :**

| Fichier                                              | Type de modification                         |
| ---------------------------------------------------- | -------------------------------------------- |
| `packages/core/src/tools/agent/agent.ts`             | Ajout du paramètre `isolation` et de la logique de création/nettoyage du worktree |
| `packages/core/src/tools/agent/fork-subagent.ts`     | Ajout de `buildWorktreeNotice()` et injection en mode worktree |
| `packages/core/src/services/gitWorktreeService.ts`   | Ajout de `createAgentWorktree()` / `removeAgentWorktree()` |
| `packages/core/src/services/worktreeCleanup.ts`      | Nouveau fichier : logique de nettoyage automatique des worktrees obsolètes |

---

### Phase C : Intégrité de session (persistance SessionService + filet de sécurité UI)

**Objectif :** L'état du worktree peut être restauré après une interruption de session ; l'utilisateur sait toujours dans quel worktree il se trouve via l'interface ; une invite de sécurité s'affiche lors de la sortie de session.

**Fonctionnalités à implémenter :**

_Persistance de l'état worktree dans SessionService + restauration `--resume` :_

- `SessionService` étend le champ `WorktreeSession`, enregistre `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`
- `EnterWorktreeTool` appelle `sessionService.setWorktreeSession()` pour écrire l'état
- `ExitWorktreeTool` appelle `sessionService.clearWorktreeSession()` pour effacer l'état
- Le chemin de démarrage `--resume` lit ce champ, restaure `targetDir` et injecte un contexte d'information au modèle

_Configuration post-création :_

- Après la création du worktree, exécute automatiquement `git config core.hooksPath <mainRepo>/.git/hooks` pour garantir que les commits dans le worktree respectent le comportement des hooks du dépôt principal

_Affichage worktree dans StatusLine :_

- `UIStateContext` ajoute un champ `activeWorktree` (lu depuis l'état de session), mis à jour lors de l'entrée/sortie du worktree
- Le payload `StatusLineCommandInput` ajoute un champ `worktree?: { slug: string; branch: string }` destiné aux scripts de statusline utilisateur
- Le `Footer` affiche intégré une ligne `⎇ <branch> (<slug>)` lorsque `activeWorktree` n'est pas vide, sans nécessiter de configuration de script statusline pour une visibilité de base

_WorktreeExitDialog :_

- Nouveau composant `WorktreeExitDialog.tsx`, reprenant la structure existante des Dialog
- Modification de la gestion des touches de sortie (Ctrl+C / Ctrl+D) : détecte si `activeWorktree` n'est pas vide, intercepte une deuxième confirmation, affiche la Dialog pour demander à l'utilisateur de choisir keep ou remove
- Les actions keep/remove réutilisent les chemins existants de `ExitWorktreeTool`

**Fichiers impactés :**

| Fichier                                                         | Type de modification                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/core/src/services/sessionService.ts`                  | Ajout du champ `WorktreeSession` et des méthodes de lecture/écriture                 |
| `packages/core/src/tools/enter-worktree.ts`                     | Appel à `sessionService.setWorktreeSession()`                                       |
| `packages/core/src/tools/exit-worktree.ts`                      | Appel à `sessionService.clearWorktreeSession()`                                     |
| `packages/core/src/services/gitWorktreeService.ts`              | Ajout de la configuration `core.hooksPath` après `createUserWorktree()` / `createAgentWorktree()` |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`                | Ajout du champ `activeWorktree` et des actions set/clear                             |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                    | Ajout du champ `worktree` dans `StatusLineCommandInput`                              |
| `packages/cli/src/ui/components/Footer.tsx`                     | Affichage intégré de la ligne worktree                                               |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`         | Nouveau fichier                                                                      |
| `packages/cli/src/ui/components/DialogManager.tsx`              | Enregistrement de `WorktreeExitDialog`                                               |
| `packages/cli/src/ui/components/ExitWarning.tsx` ou gestion des touches de sortie | Détection de `activeWorktree` et interception de la sortie          |

---

### Phase D : Configuration au démarrage (indicateur CLI `--worktree` + liens symboliques de répertoires + référence PR)

**Objectif :** Prendre en charge l'entrée directe dans un worktree au démarrage, réduire la consommation de disque pour les grands projets via des liens symboliques de répertoires, et créer rapidement un worktree basé sur une pull request via une référence PR.

**Périmètre :** Les trois fonctionnalités sont mises en œuvre ensemble dans une même phase car elles sont toutes accrochées au même point d'entrée de démarrage, et les liens symboliques / le fetch PR doivent être exécutés immédiatement après la création du worktree — les diviser nécessiterait de modifier deux fois la séquence de bootstrap.

#### D-1 : Indicateur CLI `--worktree [name]`

**Forme du paramètre :** L'option yargs accepte trois formes :

| Forme                      | Comportement                                                    |
| -------------------------- | --------------------------------------------------------------- |
| `qwen --worktree`          | bare flag, génération automatique du slug (`{adjectif}-{nom}-{6hex}`) |
| `qwen --worktree mon-nom`  | slug explicite, reprend les règles de validation de slug de `EnterWorktreeTool` |
| `qwen --worktree=mon-nom`  | équivalent à la forme précédente                               |

Pas d'alias court `-w` (les alias courts de qwen-code sont réservés aux paramètres les plus fréquents pour éviter les conflits de noms).

**Séquence de démarrage :** Le worktree est créé à l'emplacement suivant :

1. `parseArguments()` analyse argv (existant)
2. resume picker (existant, lignes 588-629 de `gemini.tsx`)
3. `loadCliConfig()` initialise Config + auth (existant, lignes 643-653)
4. **Nouveau :** si `argv.worktree !== undefined`, appelle `createUserWorktree()`
   - Écrit un sidecar (`writeWorktreeSession()`)
   - Définit `process.chdir(worktreePath)` et `Config.setTargetDir(worktreePath)`
   - Chemin de re-attachement au même worktree : saute `git worktree add` et fait un chdir sur place (correction Phase 6). La combinaison `--resume` × `--worktree` avec des projectHash différents échouera lors de la recherche de session, voir la priorité avec `--resume` ci-dessous.
5. Boucle principale (entrées TUI / headless `-p` / ACP : toutes doivent passer par l'étape 4)

**Différence avec la simplification de la Phase A :** L'outil `EnterWorktreeTool` de la Phase A **ne modifie pas** `Config.targetDir`, le modèle lit le chemin absolu depuis le résultat de l'outil et continue à l'utiliser. Le flag CLI de la Phase D agit au démarrage, sans contexte de modèle en cours d'exécution, donc **bascule directement `targetDir` et `process.cwd()`** — c'est une garantie d'isolation plus forte. Les deux chemins ont des comportements différents, à documenter dans la documentation utilisateur.

**Comportement de sortie :** Réutilise `WorktreeExitDialog` (déjà implémenté en Phase C). Ctrl+C/D deux fois → l'utilisateur choisit entre keep / remove / cancel. Pas de nouveau chemin de code.

**Priorité avec `--resume` :**

Le stockage de session étant basé sur `projectHash(process.cwd())` comme clé, et `--worktree` effectue un chdir vers le worktree avant le resume picker / `loadCliConfig`, "démarrer une session dans le worktree X et la reprendre depuis le worktree Y" est **architecturalement impossible** (leurs projectHash sont différents, les fichiers de session tombent dans des répertoires différents). Le tableau ci-dessous reflète le comportement réel après l'implémentation de D-1 + la correction de re-attachement de la Phase 6 :

| État `--resume`              | État `--worktree`               | Résultat                                                                              |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| Aucun                        | Aucun                           | Session normale, pas de worktree                                                      |
| Aucun                        | Présent (nouveau slug)          | Création d'un nouveau worktree                                                        |
| Aucun                        | Présent (slug existant)         | **Re-attachement** au worktree existant (correction Phase 6)                          |
| Présent                      | Aucun                           | Reprise de l'ancien worktree (comportement Phase C, sidecar trouvé → injection d'un rappel) |
| Présent (sid du même worktree) | Présent (même slug, re-attachement) | Re-attachement + session trouvée : reprise normale                                   |
| Présent (sid du main checkout) | Présent (slug quelconque)      | **Échec de recherche de session** : `No saved session found with ID …`, exit 1. Limitation documentée |
| Présent (sid du worktree X) | Présent (slug Y, X != Y)        | Idem, session non trouvable entre différents projectHash                              |

Le remplacement de la clé projectHash par un ancrage sur la racine du dépôt pour le stockage intersession (permettant de transférer une session entre différents worktrees / main checkout) relève d'une future refonte de Config. Le code de la branche `overrodeResumedWorktree` dans `persistStartupWorktreeSidecar` est conservé pour s'activer automatiquement après cette refonte, mais ne sera pas déclenché dans le chemin de production actuel.

#### D-2 : Option de configuration `worktree.symlinkDirectories`

**Schéma :**

```jsonc
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "dist", ".turbo"],
  },
}
```

- Type : `string[]`, valeur par défaut `undefined` (non activé, opt-in)
- Le namespace de premier niveau `worktree` est nouveau (inséré entre `tools` et `ui` dans `settingsSchema.ts`, par ordre alphabétique)
- Les chemins sont **relatifs à la racine du dépôt principal** ; les chemins absolus ou contenant `..` sont rejetés par une garde anti-traversée de répertoire

**Périmètre d'application :** Tous les worktrees créés par la couche universelle, y compris :

- `EnterWorktreeTool` (Phase A)
- `AgentTool isolation: 'worktree'` (Phase B)
- Flag CLI `--worktree` (Phase D-1)

Les worktrees d'Arena ne passent pas par la couche universelle, ils **ne sont pas** affectés par cette configuration.

**Emplacement d'implémentation :** `GitWorktreeService.performPostCreationSetup()` — immédiatement après l'existant `configureHooksPath()` (modèle établi en Phase C). Ajout de la méthode `symlinkConfiguredDirectories()` qui parcourt les éléments de configuration et appelle `fs.symlink(absSource, absDest, 'dir')`.

**Gestion des erreurs (fail-open) :**

| Scénario                       | Comportement                       |
| ------------------------------ | ---------------------------------- |
| Répertoire source inexistant (ENOENT) | Ignoré silencieusement, debug log |
| Chemin de destination existant (EEXIST) | Ignoré silencieusement, debug log (pas de remplacement) |
| Traversée de répertoire (`../`, chemins absolus, etc.) | Refus de cet élément, debug log warn |
| Autres erreurs I/O             | debug log warn, continue avec les éléments suivants |

La création du worktree elle-même **n'est pas** interrompue par un échec de lien symbolique — même principe de "best-effort post-creation setup" que `configureHooksPath()`.

#### D-3 : Résolution de référence PR (`--worktree=#<N>` / URL complète)

**Formes supportées :**

| Forme                                                           | Numéro PR résolu |
| --------------------------------------------------------------- | ---------------- |
| `--worktree=#123`                                               | 123              |
| `--worktree '#123'`                                             | 123              |
| `--worktree https://github.com/foo/bar/pull/123`                | 123              |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux` | 123              |

**Nommage du slug et de la branche :**

- slug : `pr-<N>` (préfixe réservé spécial, distinct des slugs utilisateur)
- Branche : `worktree-pr-<N>` (reprend la règle de nommage existante `worktree-<slug>` de qwen-code ; n'utilise pas le nommage direct `pr-<N>` de claude-code pour éviter les conflits avec les branches locales `pr-<N>`)

**Stratégie de fetch :**

```
git fetch origin pull/<N>/head
→ utilise FETCH_HEAD comme base du nouveau worktree
```

Ne dépend pas de l'outil `gh` — purement git fetch, supporte toute instance GitHub (publique ou entreprise), tant que le remote `origin` pointe vers GitHub.

**Cas d'erreur :**

| Scénario                     | Message d'erreur                                                             |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Remote `origin` manquant      | `--worktree=#<N> requires an "origin" remote that points at GitHub.`          |
| Échec de `git fetch`         | `Failed to fetch PR #<N>: PR may not exist or origin remote is unreachable.` |
| Timeout réseau (30s)         | Idem, avec `(timeout)`                                                        |
| Le remote `origin` n'est pas GitHub | Aucune vérification active, échec naturel de `git fetch` (le protocole PR est spécifique à GitHub) |

**Relation avec D-2 :** Le worktree PR **applique également** `symlinkDirectories` (l'utilisateur s'attend à pouvoir exécuter des tests immédiatement sur la PR, les répertoires de dépendances doivent être réutilisés).

#### Fichiers impactés

| Fichier                                                        | Type de modification                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts`                            | Ajout de l'option `--worktree` à yargs ; interface `CliArgs` ajoute `worktree?: string \| boolean`                    |
| `packages/cli/src/gemini.tsx`                                  | Appel au nouveau helper `setupStartupWorktree()` après `loadCliConfig()`, avant la boucle principale                   |
| `packages/cli/src/startup/worktreeStartup.ts`                  | Nouveau fichier : `setupStartupWorktree()` gère la résolution de slug, le fetch PR, l'écriture du sidecar, le changement de cwd |
| `packages/cli/src/nonInteractiveCli.ts`                        | Réutilise le même helper (logique d'injection `restoreWorktreeContext` existante, aucune modification)                 |
| `packages/cli/src/acp-integration/acpAgent.ts`                 | Réutilise le même helper                                                                                                |
| `packages/core/src/services/gitWorktreeService.ts`             | Ajout de `parsePRReference()`, `fetchPullRequestRef()`, `symlinkConfiguredDirectories()` ; `createUserWorktree()` accepte un paramètre optionnel `baseBranchRef` |
| `packages/cli/src/config/settingsSchema.ts`                    | Ajout de l'élément de premier niveau `worktree.symlinkDirectories: string[]`                                           |
| `packages/vscode-ide-companion/schemas/settings.schema.json`   | Régénération                                                                                                            |
| `docs/users/features/worktree.md`                              | Ajout d'une section Quick Start CLI flag, ajout d'une ligne dans le tableau Settings                                   |

#### Sécurité et rollback

- **fail-open vs fail-close :** Un échec des liens symboliques / hooks **n'interrompt pas** la création du worktree (même modèle que la Phase C) ; un échec du fetch PR **interrompt** le démarrage (sans base ref, impossible de créer le worktree) ; un échec de validation du slug **interrompt** le démarrage (identique à `EnterWorktreeTool`).
- **Traversée de répertoire :** Les éléments de `symlinkDirectories` doivent, après résolution, rester dans `repoRoot` ; sinon, l'élément est refusé et loggé.
- **Timeout du fetch PR :** 30 secondes strictes, pour éviter qu'un réseau sans réponse ne bloque le démarrage.
- **Effet secondaire du changement de cwd :** Après avoir changé `process.cwd()`, la résolution des chemins relatifs (ex. `--prompt-file ./foo.txt`) est affectée. **Contre-mesure :** Avant de changer le cwd, normaliser tous les paramètres de chemin relatifs (faire une normalisation à l'entrée de `setupStartupWorktree()`).

#### Questions ouvertes

1. **`--worktree-keep-on-exit` ?** claude-code n'en a pas ; qwen-code a-t-il besoin d'un flag CLI pour que la Dialog de sortie choisisse par défaut keep ? Suggestion : **ne pas ajouter pour l'instant**, attendre les retours utilisateurs.
2. **`worktree.symlinkDirectories` nécessite-t-il un remplacement par projet ?** Les paramètres actuels supportent déjà la fusion à trois niveaux (user/workspace/project), aucun traitement spécial nécessaire.
3. **Le fetch PR doit-il récupérer la ref `merge` (`pull/<N>/merge`, c'est-à-dire la ref après fusion avec la base) plutôt que `head` ?** claude-code choisit `head`, arguant que l'utilisateur souhaite généralement voir les modifications réelles de la PR. On conserve ce choix.

---

### Future : Fonctionnalités avancées (à implémenter selon les besoins)

Les fonctionnalités suivantes sont destinées à des cas d'utilisation plus spécifiques et ne sont pas planifiées pour l'instant. Leur implémentation sera évaluée lorsque les besoins utilisateurs seront clairs.

| Fonctionnalité           | Description                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| sparse checkout          | Option de configuration `worktree.sparsePaths` ; pour les gros monorepos, ne checkout que les chemins spécifiés, réduisant le temps de création et l'occupation disque |
| Fichier `.worktreeinclude` | Copie automatique dans le worktree des fichiers ignorés par gitignore (`.env`, `secrets.json`, etc.)       |
| Intégration tmux         | `--worktree --tmux` démarre la session worktree dans une nouvelle fenêtre tmux                                |