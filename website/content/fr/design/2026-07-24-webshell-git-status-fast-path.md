# Affichage rapide du chip git de Web Shell : branch d'abord + cache/push du status

Date : 2026-07-24
Statut : à confirmer

## Contexte et problème

Lors de la création d'une nouvelle session Web Shell, le chip git de la barre
d'outils du composer apparaît lentement. Cause racine (confirmée ligne par
ligne) :

1. **Côté démon, la branch est ralentie par un sous-processus `git status`** —
   dans `WorkspaceGitState.getStatus()`
   (`packages/cli/src/serve/workspace-git-state.ts`), la branch dispose d'un
   fast path à l'échelle de la milliseconde
   (`resolveBranchName` lit le fichier `HEAD` + watcher reflog), mais la
   réponse HTTP doit attendre la fin de `getGitWorkingTreeStatus()` — chaque
   requête spawn synchrone `git status --porcelain=v1 --branch -z`
   (`gitDiff.ts` runGit, timeout de 5 s, zéro cache).
2. **Côté frontend, le rendu du chip est bloqué par le status complet** — lors
   de la création d'une nouvelle session, le texte du chip n'accepte que
   `selectedWorkspaceGitStatus?.branch` (App.tsx 7860–7871), qui attend tout
   l'aller-retour HTTP + git status (l'effect App.tsx 1480–1520) avant de
   faire un setState.
3. **La même route est appelée deux fois en parallèle** — la récupération des
   métadonnées de `DaemonSessionProvider`
   (`DaemonSessionProvider.tsx:1320`, qui n'utilise que `.branch`) et l'effect
   git-status d'App.tsx envoient presque simultanément
   `GET /workspaces/:ws/git` ; côté démon, deux sous-processus identiques sont
   spawnés.
4. Blocage séquentiel : `activeWorkspaceCwd` dépend de la complétion préalable
   de `GET /capabilities`.

## Objectifs et non-objectifs

Objectifs :

- Lors de la création d'une session / du premier écran, le chip git
  **apparaît immédiatement** avec le texte de branch (un seul RTT HTTP local,
  à l'échelle de la milliseconde) ; les compteurs dirty/ahead/behind/stash
  sont complétés dès que le démon a terminé le calcul (requête fraîche
  `wait: true` ; en présence de session, un push SSE temps réel est également
  disponible).
- Éliminer les sous-processus `git status` en double (déduplication concurrente
  + stale-while-revalidate).
- Pas de régression : le chip du workspace dans la barre latérale (qui a
  besoin des compteurs), le chip des sessions worktree, le HEAD détaché, les
  workspaces non git, la dégradation en cas d'échec git.

Non-objectifs :

- Pas de watcher/cache introduit pour le chemin worktree `?cwd=` (maintien du
  statu quo : calcul direct, pour éviter une fuite d'un fs watcher par
  worktree). La latence du chip worktree reste inchangée.
- Pas de préchauffage au démarrage du démon (le frontend appelle immédiatement
  après capabilities, le gain du préchauffage est faible).
- Pas de modification de la sémantique existante de `git_branch_changed`.

## Vue d'ensemble de la solution

Trois niveaux de changements : cache démon + rafraîchissement en arrière-plan
+ push SSE (P0), réponse en deux phases (P1), le frontend consomme le SSE et
conserve le chemin lent pour les appelants qui en ont besoin (P2, réévalué,
voir ci-dessous).

### P0+P1 : démon — cache, déduplication, rafraîchissement en arrière-plan et push SSE pour `WorkspaceGitState`

Extension de `WorkspaceGitEntry` :

```ts
interface WorkspaceGitEntry {
  branch: string | undefined; // le watcher maintient la fraîcheur (statu quo)
  dispose: () => void; // statu quo
  status?: GitWorkingTreeStatus; // dernier résumé working-tree brut calculé
  statusComputedAt?: number; // ms epoch
  statusPromise?: Promise<void>; // déduplication in-flight
  disposed?: boolean; // publish interdit après dispose
}
```

La sémantique de `getStatus(cwd, bridge, opts?: { wait?: boolean })` devient :

- **Par défaut (fast path)** : garantit l'existence de l'entrée (retour
  immédiat pour la branch) ; déclenche un rafraîchissement en arrière-plan
  selon stale-while-revalidate (voir ci-dessous) ; **retourne immédiatement**
  le dernier status en cache (matérialisation : superposition de
  `entry.branch ?? status.branch`, forme v2 + `computedAt`) ; si rien n'a
  jamais été calculé, retourne un `{ v, workspaceCwd, branch }` branch-only
  (sans `computedAt` ; le frontend distingue ainsi « non calculé » de
  « clean »).
- **`wait: true`** : attend (ou initie puis attend, réutilisation des
  in-flight) un calcul frais, et retourne le status complet. En cas d'échec du
  calcul, dégradation vers branch-only (sémantique actuelle).

Rafraîchissement en arrière-plan `refreshStatus(entry)` :

- Réutilisation in-flight : si `statusPromise` existe, retourne directement
  celui-ci.
- Throttle : si moins de 2 s se sont écoulées depuis le dernier lancement,
  saute (pour éviter que des focus storms ne sérialisent des sous-processus
  git).
- Calcul réussi et différent des champs enrichis du cache → mise à jour du
  cache + push du status complet matérialisé via
  `bridge.publishWorkspaceEvent({ type: 'git_status_changed', data })`
  (data est `DaemonWorkspaceGitStatus`, avec workspaceCwd).
  Le premier calcul (cache vide) est considéré comme différent, push
  obligatoire — c'est le canal qui complète les compteurs du chip au démarrage
  à froid.
- Pas de différence → mise à jour du cache uniquement, pas de push (pour
  éviter que le polling de 30 s ne provoque à chaque fois un setState/re-render
  côté frontend).
- Échec du calcul / répertoire non git → conservation de l'ancien cache, pas
  de push.
- Entrée déjà disposed → pas de push.

**Pas de TTL**. Le dernier connu + un rafraîchissement en arrière-plan
déclenché à chaque GET + la correction SSE suffisent ; le throttle de 2 s
assume le rôle de « limite anti-explosion du TTL ». Les appelants `wait: true`
obtiennent toujours un calcul frais (réutilisation in-flight).

Routes (`packages/cli/src/serve/routes/workspace-git.ts`) :

- `/workspace/git` et `/workspaces/:workspace/git` parsent `?wait=1` et le
  transmettent à `getStatus`. Fast par défaut.
- La branche worktree `?cwd=` est inchangée (`getGitWorkingTreeStatus`
  direct, sans entrer dans le cache).

### SDK (`packages/sdk-typescript`)

- `events.ts` : ajout de `'git_status_changed'` dans
  `DAEMON_KNOWN_EVENT_TYPE_VALUES` (juste après `'git_branch_changed'`). Les
  anciens SDK le silencient via `asKnownDaemonEvent` — rétrocompatible, aucun
  bump de protocole requis (même modèle que `followup_suggestion`).
- `ui/normalizer.ts` : `case 'git_status_changed': return [];` (comme
  `git_branch_changed`, traité par les mappers de session, n'entre pas dans le
  flux de normalisation UI).
- La signature de `DaemonClient.workspaceGit` devient un objet d'options :
  `workspaceGit(opts?: { cwd?: string; wait?: boolean })`, assemblage de la
  query (`cwd` et `wait=1` combinables). Migration des 4 points d'appel
  (App.tsx, WorkspaceSection, DaemonSessionProvider ×2) et des tests
  unitaires SDK.

### webui (`packages/webui`)

- `session/types.ts` : ajout de
  `gitStatus?: DaemonWorkspaceGitStatus` dans `DaemonConnectionState`
  (uniquement le status complet du workspace courant, maintenu par SSE).
- `session/mappers.ts` : ajout de `case 'git_status_changed'` dans
  `updateConnectionFromDaemonEvent` — si `data.workspaceCwd` ne correspond
  pas à `current.workspaceCwd`, ignore (reflète la garde de
  `git_branch_changed`), sinon `setConnection({ ...current, gitStatus: data })`.

### web-shell (`packages/web-shell`)

- Effect git-status d'`App.tsx` : le composer utilise
  **stale-while-revalidate côté client** — à chaque déclenchement, deux
  requêtes concurrentes (sauf pour les sessions worktree, voir ci-dessous) :
  1. `workspaceGit({ cwd: sessionWorktree?.path })` (fast) : retour immédiat
     du dernier connu, rendu immédiat (cache froid branch-only) ;
  2. `workspaceGit({ wait: true })` (frais) : le démon retourne le status
     complet dès la fin du calcul en arrière-plan, complétant les compteurs.
     Les deux requêtes partagent le même calcul côté démon (déduplication
     in-flight), sans augmenter le nombre de sous-processus git.
- **Pourquoi la requête fraîche doit exister (découvert lors d'un audit
  inverse)** : le SSE `git_status_changed` passe par le flux d'événements par
  session (`GET /session/:id/events`) ; **l'état de nouvelle session
  (deferred connect, sans sessionId) n'a pas d'abonnement SSE** — en
  n'envoyant que le GET fast, les compteurs attendraient le polling de 30 s
  ou un focus pour être complétés. La requête fraîche ne dépend pas de
  l'existence d'une session et garantit « branch immédiate, compteurs dès la
  fin du calcul » dans tous les états de session. (`git_branch_changed`
  présente déjà aujourd'hui la même zone aveugle sans session ; ce n'est pas
  une régression.)
- `App.tsx` conserve par ailleurs un effect de synchronisation SSE : quand
  `connection.gitStatus` change, que `workspaceCwd` correspond et qu'il n'y a
  pas de `sessionWorktree`, écrit dans
  `selectedWorkspaceGitStatus` — couvre le push temps réel entre deux polls
  **en présence de session** (push d'un rafraîchissement en arrière-plan
  déclenché par un autre client/CLI).
- Les sessions worktree n'envoient que la requête fast : le chemin `?cwd=`
  contourne déjà le cache et calcule directement (fast et wait équivalents),
  comportement inchangé.
- `sidebar/WorkspaceSection.tsx` : `workspaceGit({ wait: true })` — le chip de
  la barre latérale a besoin des compteurs et n'a pas de double canal
  SSE/frais, conservation de la sémantique bloquante (comportement actuel
  inchangé ; les workspaces inactifs n'ont pas de canal SSE).

### Réévaluation P2 (réduit selon la valeur)

Le P2 initial (déduplication frontend : la première récupération du provider
stocke le status complet pour réutilisation par App) est **rétrogradé en
« ne pas faire »** : la déduplication in-flight côté démon de P0 élimine déjà
les sous-processus `git status` en double (le cœur du problème initial) ; il
ne reste qu'un aller-retour HTTP local à l'échelle de la milliseconde. Stocker
le status complet dans le provider pour que App le réutilise introduirait un
couplage inter-couches (protocole de valeur initiale provider→App) pour un
gain quasi nul. Les deux appels `workspaceGit()` du provider ne lisent que
`.branch` ; le fast path par défaut suffit, zéro changement.

## Compatibilité

- La forme des réponses de route est inchangée (v2, les champs enrichis sont
  déjà optionnels) ; la nouvelle query `?wait=1` est optionnelle.
- Changement de sémantique du fast path par défaut : les appelants peuvent
  recevoir le dernier connu (ancien cache) plutôt qu'un calcul frais. Tous les
  appelants existants ont été vérifiés un par un :
  - `DaemonSessionProvider` (×2) : ne lit que `.branch` — la branch est
    toujours fraîche (watcher), aucun impact.
  - Chip du composer App.tsx : c'est précisément l'objet de ce design.
  - WorkspaceSection : modifié explicitement en `wait: true`, sémantique
    inchangée.
- Le nouvel événement SSE est silencieusement ignoré par les anciens clients
  (mécanisme de known-list SDK).
- `git_status_changed` n'est publié que sur le bus SSE de session du workspace
  concerné (mécanisme existant de `publishWorkspaceEvent`, avec isolation
  multi-workspace).

## Risques et atténuations

| Risque                                            | Atténuation                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Le chip affiche d'abord la branch puis les compteurs, faisant varier la largeur de la barre d'outils | La copie de mesure cachée existante (ChatEditor toolbar-measure) gère la re-mesure ; léger décalage accepté                    |
| Une réponse branch-only interprétée à tort comme « clean »                | branch-only ne porte pas de `computedAt` ; la logique existante de GitBranchIndicator n'affiche pas « clean » quand `computedAt` est absent |
| Incohérence entre le status en cache et la branch du watcher            | Superposition de `entry.branch ?? status.branch` à la matérialisation (logique existante conservée)                           |
| Fuite du rafraîchissement en arrière-plan (publish après dispose)              | Garde sur le flag `disposed`                                                                             |
| Focus storms déclenchant des spawns git sérialisés                    | Throttle de 2 s + réutilisation in-flight                                                                         |

## Plan de test

Tests unitaires :

- `workspace-git-state.test.ts` (extension) : le fast path retourne
  immédiatement le dernier connu ; un cache froid retourne un branch-only sans
  `computedAt` ; le rafraîchissement en arrière-plan ne publie
  `git_status_changed` qu'en cas de différence ; le premier calcul publie
  toujours ; des getStatus concurrents ne déclenchent qu'un seul
  `getGitWorkingTreeStatus` ; throttle de 2 s ; `wait: true` attend un calcul
  frais ; en cas d'échec du calcul, conservation de l'ancien cache sans
  publication ; pas de publication après dispose.
- `routes/workspace-git.test.ts` (extension) : transmission de `?wait=1` ; le
  chemin worktree `?cwd=` n'entre pas dans le cache (calcul direct conservé).
- `DaemonClient.test.ts` SDK : assemblage de la query en objet d'options
  (cwd / wait / combinaison).
- `mappers.test.ts` webui : les deux branches de correspondance/non-correspondance
  de workspaceCwd pour `git_status_changed`.

E2E (`.qwen/e2e-tests/2026-07-24-git-chip-fast-branch.md`, à compléter en
phase de validation) : vrai démon + web shell, grand workspace et nouvelle
session — le chip (branch) apparaît immédiatement après que l'éditeur est
prêt, les compteurs sont complétés ensuite ; le comportement du chip de la
barre latérale est inchangé ; le focus/le polling de 30 s rafraîchissent
toujours ; le chip des sessions worktree est inchangé.

## Alternatives rejetées

- **Cache TTL (sans rafraîchissement en arrière-plan/SSE)** : n'accélère que
  les requêtes répétées ; le démarrage à froid attend toujours git status —
  ne résout pas le problème principal « chip lent sur nouvelle session ».
- **Préchauffage du démon après capabilities** : le premier GET arrive presque
  simultanément avec le préchauffage ; gain ≈ 0 après déduplication in-flight.
- **Déduplication/fusion de requêtes côté frontend uniquement** : n'élimine
  pas l'attente du sous-processus git status ; traitement superficiel.
