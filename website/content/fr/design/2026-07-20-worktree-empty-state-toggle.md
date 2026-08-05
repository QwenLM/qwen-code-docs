# Commutateur d'isolation worktree de l'état vide du Web Shell

## Contexte

Les sessions isolées par worktree (voir
[2026-07-19-webshell-worktree-sessions.md](./2026-07-19-webshell-worktree-sessions.md))
ont actuellement pour seule entrée le **menu déroulant de la capsule de
branche git** dans l'en-tête de workspace de la barre latérale
(`WorkspaceSection.tsx`), et leur rendu exige que les trois conditions
`onOpenGitDiff`, `workspace.trusted` et `gitStatus?.branch` soient
satisfaites simultanément. Il est très difficile pour un utilisateur de
découvrir qu'une git pill est cliquable ; la fonctionnalité est trop
profondément cachée.

Le Web Shell n'a pas de « page de création de session » indépendante — après
un clic sur nouvelle session, c'est l'état vide du chat (WelcomeHeader +
champ de saisie) qui s'affiche, et c'est la page de création de session de
fait. L'état vide possède déjà l'UI de badge worktree pending prête à
l'emploi (`worktreeWelcomeBadge` dans `App.tsx`) et la machine à états
pending complète (`pendingWorktreeRef` / `worktreePending`) ; la session
n'est réellement créée qu'à l'envoi du premier message (création paresseuse),
donc le « commutateur » se contente de poser une intention pending.

## Objectifs

- Fournir un commutateur d'isolation worktree visible dans l'état vide du
  chat ; après un clic, réutiliser la machine à états pending existante et la
  chaîne de création paresseuse.
- Une fois activé, afficher le badge pending existant et fournir une voie
  d'annulation.
- Conserver inchangée l'entrée du menu de la git pill de la barre latérale
  (entrée rapide par workspace).

## Non-objectifs

- Ne pas modifier le SDK, le routage du démon ni `GitWorktreeService` — la
  chaîne de création est entièrement réutilisée.
- Ne pas changer la sémantique établie « l'intention suit le workspace » :
  l'intention pending s'applique toujours au workspace résolu lors de la
  prochaine création de session (`lockedWorkspaceCwd ?? selectedWorkspaceCwd
  ?? primary`), en cohérence avec l'état actuel de l'entrée de la barre
  latérale.
- Ne pas gérer le message d'échec « bascule vers un workspace non git alors
  que pending est activé » (l'état actuel produit déjà une erreur, hors de la
  portée de cette itération).

## Conception

### Visibilité du commutateur (eligibility)

L'état vide affiche le commutateur uniquement lorsque toutes les conditions
suivantes sont satisfaites :

| Condition                          | Signal                                                        | Raison                                                            |
| ---------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| État vide du chat                  | `welcomeHeader` n'est rendu que lorsque `isChatEmptyState`    | Naturellement satisfait, aucune vérification supplémentaire       |
| Workspace courant fiable           | `workspaces.find(e => e.cwd === activeWorkspaceCwd)?.trusted` | Cohérent avec l'entrée de la barre latérale : pas de modification git sur un workspace non fiable |
| Workspace courant est un dépôt git | `selectedWorkspaceGitStatus?.branch`                          | Le démon échoue durement sur les dépôts non git (`worktree_not_git_repo`), masquer en amont |

`activeWorkspaceCwd` réutilise le memo existant (`connection.sessionId ?
connection.workspaceCwd : (locked ?? selected ?? primary)`), et
`selectedWorkspaceGitStatus` réutilise l'effect de récupération existant.
Les deux sont des états existants, aucune nouvelle requête réseau. Avant la
fin du chargement du git status, le commutateur ne s'affiche pas, en
cohérence avec le comportement de porte `gitStatus?.branch` de la barre
latérale.

### Interaction

- **État désactivé** : à l'emplacement du badge, rendre un bouton ghost
  discret (icône fork + libellé `worktree.welcomeTitle`). Clic →
  `pendingWorktreeRef.current = {}` + `setWorktreePending(true)`.
- **État activé** : rendre le `worktreeWelcomeBadge` existant (icône +
  titre + description), avec un bouton X d'annulation en haut à droite
  (`aria-label` avec une nouvelle clé i18n). Clic →
  `pendingWorktreeRef.current = undefined` + `setWorktreePending(false)`.
- Envoi du premier message → `ensureSessionForPrompt` porte `worktree: {}`
  selon la logique existante, et efface automatiquement le pending en cas de
  succès ; en cas d'échec, le badge est conservé pour un retry (état actuel
  inchangé).
- Les chemins existants tels que clic sur « nouvelle session » de la barre
  latérale ou chargement d'une session existante conservent leur logique
  d'effacement du pending.

### Modifications de fichiers

| Fichier                                                             | Modification                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/web-shell/client/App.tsx`                                 | memo d'eligibility, handlers d'activation/annulation, rendu du commutateur/badge dans le memo welcomeHeader |
| `packages/web-shell/client/App.module.css`                          | styles du bouton ghost du commutateur, styles du bouton d'annulation du badge |
| `packages/web-shell/client/i18n.tsx`                                | ajout de `worktree.cancel` (en/zh)                                         |
| `packages/web-shell/client/App.test.tsx`                            | tests unitaires : porte de visibilité, activation/annulation, envoi avec `worktree: {}` |
| `packages/web-shell/client/e2e/utils/mockDaemon.ts`                 | ajout de la capacité `workspaces` (avec `trusted`) et de la route `/workspaces/:cwd/git` |
| `packages/web-shell/client/e2e/web-shell.worktree-toggle.spec.ts`   | nouvel E2E Playwright : apparition/activation/annulation du commutateur, corps de requête contenant `worktree` |

## Questions ouvertes

Aucune.
