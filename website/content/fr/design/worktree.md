# Conception des capacités génériques de Worktree

## Énoncé du problème

qwen-code ne dispose actuellement que d'une implémentation interne de worktree dédiée au scénario de comparaison multi-modèles Arena (`GitWorktreeService`). Les utilisateurs ne peuvent pas utiliser un worktree pour isoler leur travail dans une session ordinaire, et AgentTool ne prend pas non plus en charge la création d'un environnement worktree isolé pour les sous-agents.

L'objectif est de faire du worktree une capacité générique, prenant en charge l'isolation au niveau de la session utilisateur et au niveau de l'agent, tout en garantissant que l'expérience fonctionnelle existante d'Arena reste totalement inchangée.

## Comparaison de l'état actuel

| Fonctionnalité                        | qwen-code       | claude-code | Phase    |
| ------------------------------------- | --------------- | ----------- | -------- |
| Outil `EnterWorktree`                 | ✅ (Phase A)    | ✅          | —        |
| Outil `ExitWorktree`                  | ✅ (Phase A)    | ✅          | —        |
| AgentTool `isolation: 'worktree'`     | ✅ (Phase B)    | ✅          | —        |
| Nettoyage automatique des worktrees expirés | ✅ (Phase B)    | ✅          | —        |
| Persistance et restauration de l'état de session worktree | ❌              | ✅          | Phase C  |
| Configuration post-création (hooks)   | ❌              | ✅          | Phase C  |
| Affichage de l'état worktree dans StatusLine | ❌              | ✅          | Phase C  |
| WorktreeExitDialog (boîte de dialogue de sortie) | ❌              | ✅          | Phase C  |
| Drapeau CLI `--worktree`              | ✅ (Phase D)    | ✅          | —        |
| Répertoires de liens symboliques (node_modules, etc.) | ✅ (Phase D)    | ✅          | —        |
| Référence PR (`--worktree=#123`)      | ✅ (Phase D)    | ✅          | —        |
| checkout partiel (sparse checkout)    | ❌              | ✅          | Futur    |
| Intégration tmux                      | ❌              | ✅          | Futur    |
| Isolation worktree multi-modèles Arena | ✅ (propre à qwen) | ❌          | —        |
| Gestion de l'état sale (stash + copie) | ✅              | ✅          | —        |
| Suivi du commit de base (baseline)    | ✅ (propre à qwen) | ❌          | —        |

## Principes de conception

**Le worktree est une capacité générique, Arena est son application de niveau supérieur.**

- Couche générique de worktree : outils `EnterWorktree`/`ExitWorktree`, paramètre `isolation` d'AgentTool, gestion de l'état de session, nettoyage automatique
- Couche Arena : ordonnancement parallèle multi-modèles, chemin personnalisé `worktreeBaseDir`, création en masse et comparaison de diffs, continue d'utiliser la logique existante de `GitWorktreeService.setupWorktrees()`, sans être affectée par les modifications de la couche générique

Le paramètre `isolation: 'worktree'` d'AgentTool emprunte uniquement le chemin générique ; à l'intérieur d'Arena, la création de worktree ne passe pas par ce paramètre ; les deux chemins sont indépendants.

## Chemins et configuration

### Chemin générique du worktree

Les worktrees créés par l'outil `EnterWorktree` ou par AgentTool `isolation: 'worktree'` sont stockés de manière fixe dans :

```
{racine du dépôt git}/.qwen/worktrees/{slug}
```

Le chemin n'est pas configurable. Règles de nommage pour slug :

- Worktree de session utilisateur : nom spécifié par l'utilisateur, ou généré automatiquement (format : `{adjectif}-{nom}-{4 caractères aléatoires}`)
- Worktree d'agent : `agent-{7 caractères hexadécimaux aléatoires}`

### Chemin du worktree Arena (existant, inchangé)

Le chemin du worktree Arena est contrôlé par `agents.arena.worktreeBaseDir`, par défaut `~/.qwen/arena` (`ArenaManager.ts:125`), complètement indépendant du chemin générique, aucune modification n'est apportée.

### Configuration étendue

| Élément de configuration              | Type       | Utilisation                                                      | Phase    |
| ------------------------------------- | ---------- | ---------------------------------------------------------------- | -------- |
| `ui.hideBuiltinWorktreeIndicator`    | `boolean`  | Masquer la ligne intégrée `⎇ worktree-… (…)` dans le Footer, laisser la place à une statusline personnalisée | Phase C |
| `worktree.symlinkDirectories`        | `string[]` | Lier symboliquement des répertoires spécifiques (ex : `node_modules`) vers le worktree pour éviter le gaspillage de disque | Phase D |
| `worktree.sparsePaths`               | `string[]` | Mode cône git sparse-checkout, pour les grands monorepos, n'écrire que les chemins spécifiés | Futur  |

Phase A / B n'ajoute aucun nouvel élément de configuration.

## Conception des outils

### EnterWorktree

**Condition de déclenchement :** L'utilisateur mentionne explicitement des expressions comme "start a worktree", "use a worktree", "create a worktree", etc. Ne doit pas être déclenché automatiquement lorsque l'utilisateur dit "corriger un bug", "développer une fonctionnalité".

**Schéma d'entrée :**

```
name?: string  // optionnel, format slug : lettres/chiffres/points/tirets bas/tirets, max 64 caractères
```

**Comportement :**

1. Vérifier que l'on n'est pas déjà dans un worktree (empêcher l'imbrication)
2. Résoudre la racine du dépôt git (gérer le cas où l'on est déjà dans un sous-répertoire)
3. Appeler `GitWorktreeService` pour créer le worktree, chemin : `.qwen/worktrees/{slug}`
4. Écrire la session worktree dans `SessionService`
5. Changer le répertoire de travail vers le chemin du worktree
6. Vider le cache de fichiers

**Sortie :** `worktreePath`, `worktreeBranch`, `message`

### ExitWorktree

**Condition de déclenchement :** L'utilisateur dit "exit the worktree", "leave the worktree", "go back", etc.

**Schéma d'entrée :**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // valide uniquement si action='remove'
**

**Garde de sécurité :**

- Ne manipule que le worktree créé par `EnterWorktree` de la session courante
- Si `action='remove'` et qu'il existe des modifications non commitées, l'exécution est refusée (sauf si `discard_changes: true`)

**Comportement :**

- `keep` : Efface l'état worktree de la session, conserve le répertoire worktree et la branche, restaure le répertoire de travail d'origine
- `remove` : Supprime le répertoire worktree, supprime la branche git correspondante, efface l'état de session, restaure le répertoire de travail d'origine

**Sortie :** `action`, `originalCwd`, `worktreePath`, `worktreeBranch`

## Modes de déclenchement utilisateur

| Mode                     | Exemple                                                    | Phase d'implémentation |
| ------------------------ | ---------------------------------------------------------- | ---------------------- |
| Demande explicite en session | L'utilisateur dit "commencer à travailler dans un worktree" → le modèle appelle EnterWorktree | Phase A |
| Isolation d'agent        | Le modèle définit `isolation: 'worktree'` pour un sous-agent | Phase B |
| Drapeau de lancement CLI | `qwen --worktree my-feature`                               | Phase D |

Pas de commande slash. Le déclenchement du worktree en session repose sur la mention explicite de l'utilisateur ; `isolation: 'worktree'` est le scénario où le modèle prend la décision de manière autonome.

## Plan d'implémentation par phase

### Phase A : Outils principaux (worktree au niveau session utilisateur)

**Objectif :** L'utilisateur peut entrer / sortir d'un worktree dans une session.

**Fonctionnalités à implémenter :**

- Outil `EnterWorktree` : Créer un worktree, changer de répertoire de travail, enregistrer l'état de session
- Outil `ExitWorktree` : Deux modes de sortie (keep / remove), garde de sécurité
- Extension de `GitWorktreeService` : Ajouter des méthodes `createUserWorktree()` / `removeUserWorktree()` orientées session utilisateur unique, réutiliser la logique git existante, sans modifier les interfaces batch utilisées par Arena
- Extension de `SessionService` : Ajouter un champ `WorktreeSession`, enregistrer `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` ; restaurer le répertoire de travail du worktree lors de `--resume`
- Prompt des outils : Rédiger des instructions d'utilisation pour chaque outil, préciser quand appeler et quand ne pas appeler

**Fichiers impactés :**

| Fichier                                            | Type de modification                                  |
| -------------------------------------------------- | ----------------------------------------------------- |
| `packages/core/src/tools/tool-names.ts`            | Ajouter les constantes `ENTER_WORKTREE`, `EXIT_WORKTREE` |
| `packages/core/src/tools/EnterWorktreeTool/`       | Nouveau répertoire : `EnterWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`        | Nouveau répertoire : `ExitWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/services/gitWorktreeService.ts` | Ajouter une interface au niveau session utilisateur (sans modifier l'interface Arena) |
| `packages/core/src/services/sessionService.ts`     | Ajouter le champ `WorktreeSession` et les méthodes de lecture/écriture |
| Point d'enregistrement `packages/core/src/tools/`  | Enregistrer les nouveaux outils                        |
**Hors du périmètre de la phase A :**

- Isolation des agents (phase B)
- Configuration des hooks et autres post-création (phase C)
- Affichage de l'état dans l'interface utilisateur (phase C)

---

### Phase B : Isolation des agents (AgentTool `isolation: 'worktree'`) + mise à jour des descriptions

**Objectif :** Le modèle peut créer un worktree d'isolation temporaire pour un sous-agent, qui est automatiquement supprimé à la fin de l’agent ; mettre à jour simultanément les descriptions d’outils et les messages-guides affectés.

**Fonctionnalités à implémenter :**

_Cœur de l’isolation des agents :_

- Ajout du paramètre `isolation?: 'worktree'` dans `AgentTool`
- Création d’un worktree temporaire au démarrage de l’agent (slug : `agent-{7hex}`, chemin : `.qwen/worktrees/agent-{7hex}`)
- À la fin de l’agent : suppression automatique si aucun changement ; conservation avec retour du chemin et de la branche dans le résultat s’il y a des changements
- Nettoyage automatique des worktrees expirés : scan de `.qwen/worktrees/`, correspondance au motif `agent-{7hex}`, suppression si plus de 30 jours et aucun commit non poussé, stratégie fail-closed

_Mise à jour des descriptions et messages-guides :_

- Description d’`AgentTool` : ajout des explications sur le paramètre `isolation: 'worktree'` (référence : `AgentTool/prompt.ts:272` de Claude Code)
- Nouvelle fonction `buildWorktreeNotice()` : quand un sous-agent bifurqué s’exécute dans un worktree, injecte un message de contexte indiquant qu’il est dans un worktree isolé, que le chemin est hérité de l’agent parent, et qu’il doit relire les fichiers avant de les modifier (référence : `forkSubagent.ts:buildWorktreeNotice` de Claude Code)

_Aucune modification nécessaire :_

- Compétence review (`SKILL.md`) : les reviews utilisent un mécanisme indépendant (chemin `.qwen/tmp/review-pr-<n>`, créé par la commande `qwen review fetch-pr`), totalement différent du chemin et du mécanisme générique des worktrees – pas de confusion possible

**Garantie de compatibilité Arena :** Arena ne passe pas par le paramètre `isolation` pour créer des worktrees ; cette modification ne touche pas le code d’Arena.

**Fichiers impactés :**

| Fichier                                             | Type de modification                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/core/src/tools/agent/agent.ts`            | Ajout du paramètre `isolation` et logique de création / nettoyage de worktree |
| `packages/core/src/tools/agent/fork-subagent.ts`    | Ajout de `buildWorktreeNotice()` et injection en mode worktree                |
| `packages/core/src/services/gitWorktreeService.ts`  | Ajout de `createAgentWorktree()` / `removeAgentWorktree()`                     |
| `packages/core/src/services/worktreeCleanup.ts`     | Nouveau fichier : logique de nettoyage automatique des worktrees expirés      |

---

### Phase C : Intégrité de session (persistance SessionService + filet de sécurité UI)

**Objectif :** L’état du worktree peut être restauré après une interruption de session ; l’utilisateur sait toujours dans quel worktree il se trouve via l’interface, et reçoit un avertissement de sécurité lors de la sortie de session.

**Fonctionnalités à implémenter :**

_Persistance de l’état du worktree dans SessionService + restauration via `--resume` :_

- Extension de `SessionService` avec le champ `WorktreeSession` : enregistre `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`
- `EnterWorktreeTool` appelle `sessionService.setWorktreeSession()` pour écrire l’état
- `ExitWorktreeTool` appelle `sessionService.clearWorktreeSession()` pour effacer l’état
- Le chemin de démarrage `--resume` lit ce champ, restaure `targetDir` et injecte un message de contexte au modèle

_Configuration post-création :_

- Après la création d’un worktree, exécution automatique de `git config core.hooksPath <mainRepo>/.git/hooks` pour garantir que les commits dans le worktree suivent le comportement des hooks du dépôt principal

_Affichage du worktree dans StatusLine :_

- Ajout du champ `activeWorktree` dans `UIStateContext` (lu depuis l’état de session), mis à jour lors de l’entrée / sortie du worktree
- Ajout du champ `worktree?: { slug: string; branch: string }` dans le payload de `StatusLineCommandInput`, pour usage par les scripts statusline personnalisés
- Affichage intégré dans `Footer` d’une ligne `⎇ <branch> (<slug>)` lorsque `activeWorktree` n’est pas vide, sans nécessiter de configuration statusline pour une visibilité de base

_WorktreeExitDialog :_

- Nouveau composant `WorktreeExitDialog.tsx` (s’inspire des Dialog existants)
- Modification de la gestion des touches de sortie (Ctrl+C / Ctrl+D) : détection de `activeWorktree` non vide, interception lors de la deuxième confirmation, affichage du Dialog proposant de conserver ou supprimer le worktree
- Les actions keep / remove réutilisent les chemins existants d’`ExitWorktreeTool`

**Fichiers impactés :**

| Fichier                                                         | Type de modification                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionService.ts`                  | Ajout du champ `WorktreeSession` et des méthodes de lecture/écriture               |
| `packages/core/src/tools/enter-worktree.ts`                     | Appel à `sessionService.setWorktreeSession()`                                      |
| `packages/core/src/tools/exit-worktree.ts`                      | Appel à `sessionService.clearWorktreeSession()`                                    |
| `packages/core/src/services/gitWorktreeService.ts`              | Ajout de la configuration `core.hooksPath` après `createUserWorktree()` / `createAgentWorktree()` |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`               | Ajout du champ `activeWorktree` et des actions set/clear                            |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                    | Ajout du champ `worktree` dans `StatusLineCommandInput`                             |
| `packages/cli/src/ui/components/Footer.tsx`                     | Affichage intégré de la ligne worktree                                              |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`         | Nouveau fichier                                                                     |
| `packages/cli/src/ui/components/DialogManager.tsx`              | Enregistrement de `WorktreeExitDialog`                                              |
| `packages/cli/src/ui/components/ExitWarning.tsx` ou gestion des touches de sortie | Détection de `activeWorktree` et interception de la sortie            |

---

### Phase D : Configuration au démarrage (option CLI `--worktree` + liens symboliques de répertoire + référence PR)

**Objectif :** Permettre d’entrer directement dans un worktree au démarrage, de réduire l’espace disque pour les gros projets via des liens symboliques de répertoire, et de créer rapidement un worktree basé sur une pull request via une référence PR.

**Périmètre :** Les trois fonctionnalités sont livrées ensemble dans une même phase, car elles s’accrochent toutes au même point d’entrée de démarrage, et les symlinks / PR fetch doivent être exécutés immédiatement après la création du worktree – les diviser entraînerait des modifications redondantes de la séquence de bootstrap.

#### D-1 : Option de démarrage `--worktree [name]`

**Forme du paramètre :** Option yargs acceptant trois formes :

| Forme                     | Comportement                                                             |
| ------------------------- | ------------------------------------------------------------------------ |
| `qwen --worktree`         | Drapeau nu, slug généré automatiquement (`{adjectif}-{nom}-{6hex}`)       |
| `qwen --worktree my-name` | Slug explicite, suit les règles de validation de slug d’`EnterWorktreeTool` |
| `qwen --worktree=my-name` | Équivalent à la forme précédente                                         |
不提供短别名 `-w`（qwen-code 短别名只保留给最高频参数，避免命名冲突）。

**Séquence de démarrage :** le worktree est créé à l'emplacement suivant :

1. `parseArguments()` analyse argv (déjà fait)
2. resume picker (déjà fait, lignes 588-629 de `gemini.tsx`)
3. `loadCliConfig()` initialise Config + auth (déjà fait, lignes 643-653)
4. **Nouveau :** si `argv.worktree !== undefined`, appeler `createUserWorktree()`
   - Écrire le sidecar (`writeWorktreeSession()`)
   - Définir `process.chdir(worktreePath)` et en même temps `Config.setTargetDir(worktreePath)`
   - Chemin de re‑attachement au même worktree : sauter `git worktree add` et faire chdir sur place (correction Phase 6). Les combinaisons `--resume` × `--worktree` avec des projectHash différents échouent lors de la recherche de session, voir ci‑dessous « Priorité avec `--resume` ».
5. Boucle principale (les trois points d’entrée TUI / headless `-p` / ACP doivent passer par l’étape 4)

**Différence avec la simplification Phase A :** Le `EnterWorktreeTool` de Phase A **ne** modifie **pas** `Config.targetDir` ; il se fie au modèle qui lit le chemin absolu depuis le résultat de l’outil et continue à l’utiliser. Le flag CLI de Phase D prend effet au démarrage, sans contexte de modèle en cours d’exécution à prendre en compte, donc **il bascule directement `targetDir` et `process.cwd()`** – c’est une garantie d’isolement plus forte. Les deux chemins se comportent différemment, ce qui doit être expliqué dans la documentation utilisateur.

**Comportement de sortie :** Réutiliser le `WorktreeExitDialog` existant (implémenté en Phase C). Ctrl+C/D deux fois → l’utilisateur choisit entre keep / remove / cancel. Pas besoin d’un nouveau chemin de code.

**Priorité avec `--resume` :**

Étant donné que le stockage des sessions utilise `projectHash(process.cwd())` comme clé, et que `--worktree` fait chdir vers le worktree avant le resume picker / `loadCliConfig`, « reprendre une session démarrée dans le worktree X depuis le worktree Y » est **architecturalement inaccessible** (les projectHash sont différents, les fichiers de session tombent dans des répertoires différents). Le tableau ci‑dessous reflète le comportement réel après l’implémentation D-1 + la correction de re‑attachement de Phase 6 :

| État `--resume`                  | État `--worktree`               | Résultat                                                                                     |
| ------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| Aucun                           | Aucun                           | Session normale, pas de worktree                                                             |
| Aucun                           | Oui (nouveau slug)              | Création d’un nouveau worktree                                                               |
| Aucun                           | Oui (slug existant)             | **Re‑attachement** au worktree existant (correction Phase 6)                                 |
| Oui                             | Aucun                           | Reprise d’un ancien worktree (comportement Phase C, sidecar trouvé → injection reminder)     |
| Oui (sid issu du même worktree) | Oui (même slug, re‑attachement) | Re‑attachement + session trouvée : reprise normale                                           |
| Oui (sid issu du main checkout) | Oui (slug quelconque)           | **Recherche de session échouée** : `No saved session found with ID …`, exit 1. Limitation documentée |
| Oui (sid issu du worktree X)    | Oui (slug Y, X != Y)            | Idem, session introuvable car projectHash différent                                          |

La sémantique de forçage d’un projectHash différent (transférer `--worktree` entre sessions de worktree / checkout principal) nécessite un ancrage du stockage à la racine du dépôt plutôt qu’au projectHash dérivé de cwd ; cela relève d’une future refonte de Config. Le code de la branche `overrodeResumedWorktree` dans `persistStartupWorktreeSidecar` est conservé pour s’activer automatiquement après cette refonte, mais il n’est actuellement pas déclenché en production.

#### D-2 : Option de configuration `worktree.symlinkDirectories`

**Schéma :**

```jsonc
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "dist", ".turbo"],
  },
}
```

- Type : `string[]`, valeur par défaut `undefined` (pas activé, opt‑in)
- L’espace de noms `worktree` au niveau supérieur est nouveau (inséré par ordre alphabétique entre `tools` et `ui` dans `settingsSchema.ts`)
- Les chemins sont **relatifs à la racine du dépôt principal** ; les chemins absolus ou contenant `..` sont refusés par le garde de traversée de répertoire.

**Périmètre :** Tous les worktrees créés par la couche générique, y compris :

- `EnterWorktreeTool` (Phase A)
- `AgentTool` `isolation: 'worktree'` (Phase B)
- `--worktree` CLI flag (Phase D-1)

Les worktrees d’Arena ne passent pas par la couche générique et **ne sont pas** affectés par cette configuration.

**Emplacement d’implémentation :** `GitWorktreeService.performPostCreationSetup()` – juste après le `configureHooksPath()` existant (modèle établi en Phase C). Ajouter une méthode `symlinkConfiguredDirectories()` qui parcourt les éléments de configuration et appelle `fs.symlink(absSource, absDest, 'dir')`.

**Gestion des erreurs (fail‑open) :**

| Scénario                                    | Comportement                                    |
| ------------------------------------------- | ----------------------------------------------- |
| Répertoire source inexistant (ENOENT)       | Ignorer silencieusement, debug log               |
| Chemin cible déjà existant (EEXIST)         | Ignorer silencieusement, debug log (ne pas écraser) |
| Traversée de répertoire (`../`, chemin absolu, etc.) | Refuser l’élément, debug log warn        |
| Autres erreurs I/O                          | debug log warn, continuer avec les éléments suivants |

La création du worktree elle‑même **n’est pas** interrompue par un échec de symlink – même principe de « best‑effort post‑creation setup » que `configureHooksPath()`.

#### D-3 : Résolution de références PR (`--worktree=#<N>` / URL complète)

**Formes supportées :**

| Forme                                                                 | Numéro PR résolu |
| --------------------------------------------------------------------- | ---------------- |
| `--worktree=#123`                                                     | 123              |
| `--worktree '#123'`                                                   | 123              |
| `--worktree https://github.com/foo/bar/pull/123`                      | 123              |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux`       | 123              |

**Dénomination du slug et de la branche :**

- slug : `pr-<N>` (préfixe réservé spécial, distinct des slugs utilisateur)
- branche : `worktree-pr-<N>` (suit la règle existante de qwen-code `worktree-<slug>` ; n’utilise pas le nom direct `pr-<N>` de claude-code pour éviter les conflits avec une branche locale `pr-<N>`)

**Stratégie de fetch :**

```
git fetch origin pull/<N>/head
→ utiliser FETCH_HEAD comme base du nouveau worktree
```

Ne nécessite pas le CLI `gh` – simple `git fetch`, supporte toute instance GitHub (publique ou entreprise), à condition que le remote `origin` pointe vers GitHub.

**Chemins d’erreur :**

| Scénario                                          | Message d’erreur                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Remote `origin` manquant                          | `--worktree=#<N> requires an "origin" remote that points at GitHub.`               |
| Échec de `git fetch`                              | `Failed to fetch PR #<N>: PR may not exist or origin remote is unreachable.`       |
| Délai d’attente réseau dépassé (30s)              | Idem, en ajoutant `(timeout)`                                                      |
| Le remote `origin` n’est pas GitHub               | Aucune vérification active ; l’échec naturel de `git fetch` (protocole PR spécifique à GitHub) |
**Relation avec D-2 :** PR worktree applique **également** `symlinkDirectories` (l'utilisateur s'attend à pouvoir lancer les tests immédiatement sur la PR, les répertoires de dépendances doivent être réutilisés).

#### Fichiers impactés

| Fichier                                                         | Type de modification                                                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts`                            | Nouvelle option `--worktree` dans yargs ; ajout de `worktree?: string \| boolean` dans l'interface `CliArgs`                                  |
| `packages/cli/src/gemini.tsx`                                  | Appel du nouveau helper `setupStartupWorktree()` après `loadCliConfig()`, avant la boucle principale                                          |
| `packages/cli/src/startup/worktreeStartup.ts`                  | Nouveau fichier : `setupStartupWorktree()` gère l'analyse du slug, le fetch de la PR, l'écriture du sidecar, le changement de cwd            |
| `packages/cli/src/nonInteractiveCli.ts`                        | Réutilisation du même helper (la logique d'injection `restoreWorktreeContext` existe déjà, pas de modification)                                |
| `packages/cli/src/acp-integration/acpAgent.ts`                 | Réutilisation du même helper                                                                                                                  |
| `packages/core/src/services/gitWorktreeService.ts`             | Ajout de `parsePRReference()`, `fetchPullRequestRef()`, `symlinkConfiguredDirectories()` ; `createUserWorktree()` accepte le paramètre optionnel `baseBranchRef` |
| `packages/cli/src/config/settingsSchema.ts`                    | Ajout de la propriété de niveau supérieur `worktree.symlinkDirectories: string[]`                                                              |
| `packages/vscode-ide-companion/schemas/settings.schema.json`   | Régénéré                                                                                                                                       |
| `docs/users/features/worktree.md`                              | Ajout d'une section sur le Quick Start CLI flag, ajout d'une ligne dans le tableau Settings                                                    |

#### Sécurité & Rollback

- **fail-open vs fail-close :** Un échec de symlink / hooks **n'arrête pas** la création du worktree (même principe que la Phase C) ; un échec du fetch de la PR **arrête** le démarrage (sans base ref, impossible de créer le worktree) ; un échec de validation du slug **arrête** le démarrage (cohérent avec `EnterWorktreeTool`).
- **Path traversal :** Les éléments de `symlinkDirectories` doivent, après résolution, rester dans `repoRoot`, sinon l'élément est refusé avec un log.
- **Timeout du fetch de la PR :** Timeout strict de 30 secondes pour éviter qu'un réseau sans réponse ne bloque le démarrage.
- **Effet de bord du changement de cwd :** Après avoir changé `process.cwd()`, la résolution des chemins relatifs (ex: `--prompt-file ./foo.txt`) est affectée. **Solution :** Normaliser tous les paramètres de chemin relatif avant de changer le cwd (effectué à l'entrée de `setupStartupWorktree()`).

#### Questions ouvertes

1. **`--worktree-keep-on-exit` ?** claude-code ne l'a pas. Est-ce que qwen-code a besoin d'un flag CLI pour que le dialogue de sortie choisisse par défaut keep ? Suggestion : **ne pas ajouter pour l'instant**, attendre les retours utilisateurs.
2. **`worktree.symlinkDirectories` nécessite-t-il un override par projet ?** Actuellement les settings supportent déjà une fusion à trois niveaux (user/workspace/project), pas de traitement spécial nécessaire.
3. **Le fetch de la PR doit-il tirer la ref `merge` (`pull/<N>/merge`, c'est-à-dire la ref fusionnée avec la base) plutôt que `head` ?** claude-code choisit `head`, car l'utilisateur veut généralement voir les modifications réelles de la PR. Nous suivons ce choix.

---

### Futur : Fonctionnalités avancées (à implémenter selon les besoins)

Les fonctionnalités suivantes correspondent à des cas d'usage plus spécifiques. Elles ne sont pas planifiées pour l'instant et seront évaluées lorsque les besoins utilisateurs seront clairs.

| Fonctionnalité          | Description                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| sparse checkout         | Option de configuration `worktree.sparsePaths`. Pour les gros monorepos, ne checkout que les chemins spécifiés, réduisant le temps de création et l'occupation disque |
| Fichier `.worktreeinclude` | Copie automatique dans le worktree des fichiers ignorés par gitignore (`.env`, `secrets.json`, etc.)     |
| Intégration tmux        | `--worktree --tmux` lance une session worktree dans une nouvelle fenêtre tmux                           |
