# Worktrees

> Isolez un travail expérimental dans un [git worktree](https://git-scm.com/docs/git-worktree) temporaire sans quitter votre session en cours. Utile lorsque le modèle s’apprête à effectuer des modifications étendues que vous souhaitez garder séparées de votre checkout principal, ou lorsque vous voulez qu’un sous-agent travaille dans son propre bac à sable.

## Démarrage rapide

### Démarrer la session dans un worktree (drapeau `--worktree`)

Si vous savez d’avance que toute la session doit s’exécuter dans un worktree, passez `--worktree` au lancement :

```bash
# Slug auto-généré (ex. tender-jemison-037f0a)
qwen --worktree

# Nom explicite
qwen --worktree ma-fonctionnalite

# Forme avec `=` (recommandée si vous passez aussi une invite positionnelle — voir l’astuce ci-dessous)
qwen --worktree=ma-fonctionnalite

# Référence PR – récupère refs/pull/<N>/head depuis `origin`
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# Reprendre une session --worktree précédente — se rattache au répertoire existant
qwen --resume <id-session> --worktree=ma-fonctionnalite
```

> **Astuce — `--worktree` nu suivi d’une invite positionnelle est ambigu.** Comme `--worktree` prend une valeur optionnelle, `qwen --worktree "dis bonjour"` fait consommer `"dis bonjour"` par yargs comme slug (et le rejette à cause de l’espace). Utilisez l’une des formes suivantes :
>
> - `qwen --worktree=ma-fonctionnalite "dis bonjour"` (fonctionne toujours — slug explicite via `=`)
> - `qwen "dis bonjour" --worktree` (invite en premier, drapeau à la fin → slug auto)
> - `qwen --worktree --approval-mode yolo "dis bonjour"` (tout drapeau entre eux ancre la forme nue)

> **Astuce — `qwen --resume --worktree foo` (sans ID de session) affiche un sélecteur vide lors de la première utilisation.** Le sélecteur se limite au stockage de session du worktree choisi ; les sessions démarrées en dehors de ce worktree ne sont pas listées. Pour reprendre une session qui a été démarrée dans `foo`, utilisez directement `qwen --resume <id> --worktree foo` — le CLI se rattache au répertoire `foo/` existant plutôt que de le recréer.

`process.cwd()` et l’espace de travail du modèle sont basculés vers le worktree avant que le premier tour ne s’exécute. Quittez avec `Ctrl+C` deux fois et la [boîte de dialogue de sortie](#boîte-de-dialogue-de-sortie-ctrlc--ctrld) vous invite à conserver ou supprimer le worktree.

Le drapeau `--worktree` ne peut pas être combiné avec `--acp`/`--experimental-acp` — pour les hôtes ACP (comme Zed), passez le chemin du worktree comme `cwd` de la requête `loadSession`/`newSession` à la place.

### Ou demander en cours de session

Vous pouvez aussi demander à Qwen Code en langage naturel de créer un worktree depuis une session existante :

```text
> crée un worktree appelé experiment-a
Worktree experiment-a créé sur la branche worktree-experiment-a
.qwen/worktrees/experiment-a
```

À partir de ce moment, le modèle achemine chaque modification de fichier et chaque commande shell via `.qwen/worktrees/experiment-a/`. Votre répertoire de travail d’origine reste intact.

Quand vous avez terminé :

```text
> quitte le worktree et supprime-le
Worktree experiment-a supprimé (branche worktree-experiment-a)
```

Si vous voulez revenir plus tard, demandez à quitter en conservant le worktree sur le disque :

```text
> quitte le worktree mais garde-le
Worktree experiment-a conservé dans .qwen/worktrees/experiment-a
```

## Quand les worktrees sont utilisés

Les worktrees sont activés selon quatre chemins indépendants :

| Déclencheur                                | Ce qui se passe                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Vous lancez avec `--worktree`               | Le CLI crée le worktree avant tout tour du modèle et change le répertoire de la session dedans. Les formes PR (`#N`, URL complète) récupèrent d’abord. |
| Vous demandez explicitement un worktree en session | Le modèle appelle `enter_worktree` ; les modifications de fichiers suivantes s’effectuent à l’intérieur.                              |
| Vous demandez explicitement de quitter      | Le modèle appelle `exit_worktree` avec `keep` ou `remove`.                                                                           |
| Le modèle engendre un sous-agent avec isolation activée | Un worktree jetable (`agent-<hex>`) est créé automatiquement et nettoyé si l’agent n’a pas de différences.                        |

Les deux outils en session (`enter_worktree` / `exit_worktree`) sont volontairement gardés derrière un phrasé explicite — dire « corrige ce bug » ou « crée une branche » ne les **déclenchera pas**. Vous devez dire quelque chose comme « utilise un worktree », « démarre un worktree » ou « dans un worktree ». Le drapeau CLI `--worktree` n’a pas cette protection ; il crée toujours un worktree lorsqu’il est présent.

## Ce qui est créé

Chaque worktree géré par Qwen est placé sous le répertoire `.qwen` de votre projet :

```
<racineDuDepot>/.qwen/worktrees/<slug>/         # Répertoire de travail
                          ↳ branche worktree-<slug>   # Créée à partir de votre branche courante
```

- **Slug** — lettres, chiffres, point, underscore, trait d’union ; 64 caractères max. Si vous ne spécifiez pas de nom, un slug `<adjectif>-<nom>-<6hex>` est auto-généré (ex. `tender-jemison-037f0a`). Les références PR produisent `pr-<N>`.
- **Branche** — toujours `worktree-<slug>`, dérivée de la branche que vous avez extraite au moment de la demande du worktree (pas nécessairement le `HEAD` de l’arbre de travail principal). Pour les worktrees PR, la branche est `worktree-pr-<N>` et est basée sur `FETCH_HEAD` (la pointe de la PR côté GitHub) plutôt que sur votre branche locale.
- **Hooks** — le `core.hooksPath` du worktree est automatiquement pointé vers le `.husky/` du dépôt principal (préféré) ou vers `.git/hooks/` afin que les commits effectués dans le worktree déclenchent toujours vos hooks pre-commit / commit-msg existants.
- **Liens symboliques optionnels** — les répertoires listés dans `worktree.symlinkDirectories` (voir [Paramètres](#paramètres)) sont liés symboliquement depuis le dépôt principal vers le nouveau worktree afin que les gros répertoires comme `node_modules` puissent être réutilisés sans réinstallation.
Le chemin du worktree général **n'est pas configurable** — il doit se trouver sous `<repoRoot>/.qwen/worktrees/` pour que le CLI puisse le retrouver lors du redémarrage et lors des nettoyages de worktrees obsolètes. (Le paramètre distinct `agents.arena.worktreeBaseDir` contrôle uniquement les worktrees de [l'Agent Arena](./arena.md), qui utilisent une arborescence distincte sous `~/.qwen/arena/`.)

## Footer et ligne d'état

Lorsqu'un worktree est actif, le Footer affiche un indicateur atténué sur sa propre ligne :

```
⎇ worktree-experiment-a (experiment-a)
```

Si vous utilisez un [script personnalisé de ligne d'état](./status-line.md), il reçoit également un objet `worktree` dans le payload JSON envoyé via stdin :

```json
{
  "worktree": {
    "name": "experiment-a",
    "path": "/path/to/repo/.qwen/worktrees/experiment-a",
    "branch": "worktree-experiment-a",
    "original_cwd": "/path/to/repo",
    "original_branch": "main"
  }
}
```

Le champ du payload est présent **uniquement** lorsqu'un worktree est actif, donc un test de null (`input.worktree?.name`) suffit.

Si votre ligne d'état personnalisée affiche déjà les informations du worktree, vous pouvez masquer la ligne intégrée du Footer pour éviter les doublons — voir [Paramètres](#settings) ci-dessous.

## Dialogue de sortie (Ctrl+C / Ctrl+D)

Appuyer deux fois sur le raccourci de sortie alors qu'un worktree est actif ouvre le **Dialogue de sortie du worktree** au lieu de fermer le CLI :

```
⎇ Active worktree: "experiment-a" (worktree-experiment-a)

  • 2 new commit(s) on worktree-experiment-a
  • 3 uncommitted file(s)
  Removing the worktree will discard everything above.

What would you like to do?
  ○ Keep worktree (exit without deleting)
  ○ Remove worktree and branch (discards 2 commit(s), 3 file(s))
  ○ Cancel (stay in session)
```

Le dialogue inspecte le worktree à l'ouverture (`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`) et affiche les deux compteurs afin que vous sachiez exactement ce que vous vous apprêtez à supprimer. `ESC` annule.

Si `git status` lui-même échoue (par exemple, index corrompu, répertoire du worktree supprimé pendant l'exécution du CLI), le dialogue affiche un avertissement `⚠ Could not measure worktree state` et les compteurs peuvent être peu fiables — choisissez **Keep** ou **Cancel** jusqu'à ce que vous ayez diagnostiqué le problème sous-jacent du dépôt.

## Restauration via `--resume`

La liaison du worktree actif est persistée dans un fichier sidecar à côté de la transcription de votre session :

```
<chatsDir>/<sessionId>.worktree.json
```

Lorsque vous lancez le CLI avec `--resume <sessionId>` (ou que vous sélectionnez la session depuis `/resume`), trois choses se produisent de manière cohérente dans les modes **TUI interactif**, **headless `-p`** et **ACP/Zed** :

1. Le sidecar est chargé et le répertoire du worktree est vérifié pour s'assurer qu'il existe toujours sur le disque.
2. Si le worktree existe toujours, le modèle reçoit un rappel unique lors de sa prochaine invite :
   ```
   [Resumed] Active worktree: "<slug>" at <path> (branch: <branch>). Continue using this path for all file operations.
   ```
3. Si le répertoire du worktree a été supprimé entre les sessions, le sidecar obsolète est nettoyé automatiquement — aucune erreur, la reprise continue simplement sans contexte de worktree.

Chaque mode choisit son propre mécanisme d'injection, mais le comportement visible par l'utilisateur est identique :

| Mode              | Mécanisme                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Interactif (TUI)  | Élément d'historique `INFO` + préfixe de rappel système sur la prochaine invite utilisateur.           |
| Headless (`-p`)   | Préfixe `<system-reminder>` sur l'invite + événement système JSON `worktree_restored` dans le flux de sortie. |
| ACP (ex. Zed)     | Avis en attente attaché au prochain appel `prompt()`.                                                  |

Le modèle n'est **pas** automatiquement déplacé dans le worktree via `chdir` — c'est le rappel qui lui permet de continuer à diriger les modifications via le chemin du worktree.

## Isolation des sous-agents

L'outil `agent` accepte un paramètre optionnel `isolation: "worktree"`. Lorsqu'il est défini, Qwen Code crée un worktree éphémère sous `<repoRoot>/.qwen/worktrees/agent-<7hex>/` avant le démarrage du sous-agent, et :

- **Aucune modification** → le worktree est automatiquement supprimé lorsque l'agent se termine.
- **Des modifications** → le worktree est conservé ; son chemin et sa branche sont ajoutés au résultat de l'agent, par exemple :
  ```
  …agent output…
  [worktree preserved: /path/to/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  Examinez la diff et fusionnez-la ou supprimez-la manuellement.

Deux contraintes :

- `isolation: "worktree"` nécessite un `subagent_type` — les sous-agents forkés (sans `subagent_type`) réutilisent l'intégralité du contexte de conversation du parent, donc les isoler diviserait l'intention de l'arbre de travail.
- Les agents en arrière-plan (`run_in_background: true`) fonctionnent correctement avec l'isolation ; le nettoyage s'exécute lorsque l'agent signale son achèvement.

### Nettoyage automatique des worktrees obsolètes

Les worktrees éphémères d'agents qui ont survécu à un crash ou à un arrêt avec `--no-cleanup` sont nettoyés à chaque démarrage du CLI, avec des règles conservatrices de type 'fail-closed' :

| Garde                                  | Comportement                                       |
| -------------------------------------- | -------------------------------------------------- |
| Le slug doit correspondre au motif `agent-<7hex>` | Les worktrees nommés que vous avez créés ne sont jamais touchés. |
| `mtime` du répertoire > 30 jours       | Les entrées plus récentes sont ignorées.           |
| Toute modification suivie non commitée | Ignorer l'entrée (ne pas supprimer).               |
| Tout commit inaccessible depuis une remote | Ignorer l'entrée (ne pas supprimer).               |
| Toute erreur lors de la lecture de l'état git | Ignorer l'entrée (ne pas supprimer).               |
Les worktrees nommés par l'utilisateur (slugs `enter_worktree`) ne sont **jamais** nettoyés automatiquement — vous les conservez jusqu'à ce que vous demandiez leur suppression.

## Garanties de sécurité sur `exit_worktree action="remove"`

Trois gardes indépendants se déclenchent avant que le répertoire et la branche ne soient supprimés :

1. **Propriété de session** — chaque worktree porte un marqueur sidecar avec l'ID de session qui l'a créé. Une session différente essayant de le supprimer est refusée avec une erreur claire pointant vers `git worktree remove` pour l'échappatoire manuelle.
2. **Arbre de travail modifié** — les modifications non commitées, suivies ou non, bloquent la suppression. Passez `discard_changes: true` pour outrepasser. (Le contournement nécessite une confirmation explicite de l'utilisateur — `action: "remove"` n'est jamais auto-approuvé en mode AUTO_EDIT.)
3. **Commits non fusionnés** — les commits sur `worktree-<slug>` auxquels aucune autre branche locale ou référence distante ne pointe bloquent la suppression de manière inconditionnelle ; il n'y a pas de drapeau « abandonner les commits » car perdre du travail commité est rarement ce que veulent les utilisateurs. Fusionnez, poussez ou renommez d'abord la branche ailleurs.

Les trois mêmes gardes s'appliquent au bouton `WorktreeExitDialog → Remove`.

## Paramètres

Deux paramètres façonnent l'expérience des worktrees à usage général :

| Clé                               | Type       | Défaut      | Effet                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.hideBuiltinWorktreeIndicator` | boolean    | `false`     | Masque la ligne de pied de page `⎇ worktree-… (…)` intégrée. Le champ `worktree` est toujours transmis aux scripts de barre d'état personnalisés. Mettez à `true` uniquement si votre barre d'état affiche déjà le worktree — sinon vous perdez toute commodité d'interface.                                                       |
| `worktree.symlinkDirectories`     | `string[]` | `undefined` | Répertoires sous le dépôt principal à lier symboliquement dans chaque worktree à usage général lors de la création. Les chemins sont relatifs à la racine du dépôt ; les chemins absolus et toute entrée contenant `..` sont rejetés. Les sources manquantes et les destinations existantes sont ignorées silencieusement (pas d'écrasement). |

Exemple :

```jsonc
// ~/.qwen/settings.json or <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

S'applique à TOUS les chemins de création de worktree : le drapeau `--worktree`, l'outil `enter_worktree` et `agent isolation: "worktree"`.

Paramètres non liés aux worktrees généraux mais bons à connaître :

- `agents.arena.worktreeBaseDir` — contrôle le placement des worktrees **Agent Arena** (par défaut `~/.qwen/arena`). N'affecte pas les worktrees à usage général, qui se trouvent toujours sous `<repoRoot>/.qwen/worktrees/`.

Il n'existe pas encore de schéma pour `worktree.sparsePaths` — c'est un élément de la feuille de route (voir [Limitations](#limitations)).

## Référence des outils

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| Champ  | Type   | Requis | Notes                                                                                                                                       |
| ------ | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `name` | string | non    | Slug. Lettres, chiffres, point, trait de soulignement, trait d'union ; 64 caractères max. Généré automatiquement lorsqu'omis. |

Refuse de s'exécuter quand :

- La CLI n'est pas dans un dépôt git.
- Le répertoire de travail courant est déjà à l'intérieur de `.qwen/worktrees/` (pas de worktrees imbriqués).

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| Champ             | Type                   | Requis                                   | Notes                                                                                |
| ----------------- | ---------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `name`            | string                 | oui                                      | Doit correspondre au slug utilisé dans `enter_worktree`.                             |
| `action`          | `"keep"` \| `"remove"` | oui                                      | `keep` conserve le répertoire et la branche ; `remove` les supprime tous les deux.   |
| `discard_changes` | boolean                | uniquement quand `action="remove"` et modifié | Outrepasse le garde d'arbre modifié. Sans effet pour `action="keep"`. |

`action: "remove"` demande toujours une confirmation, y compris sous le mode d'approbation `AUTO_EDIT` — il est traité comme une opération destructive du shell, pas comme un outil d'information uniquement.

### `agent` — paramètre `isolation`

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| Champ       | Type         | Requis | Notes                                                                            |
| ----------- | ------------ | ------ | -------------------------------------------------------------------------------- |
| `isolation` | `"worktree"` | non    | Exécute l'agent dans un nouveau worktree `agent-<7hex>`. Nécessite que `subagent_type` soit défini (pas de forks). |
Voir [Sub-Agents](./sub-agents.md) pour le reste de la référence des outils de l'agent.

## Référence CLI

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # auto-générer un slug
qwen --worktree my-feature                                    # slug explicite
qwen --worktree=my-feature                                    # forme avec =
qwen --worktree=#123                                          # référence PR
qwen --worktree https://github.com/owner/repo/pull/123        # URL de PR
```

| Entrée                         | Résultat                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Drapeau seul (aucune valeur)  | Slug auto `<adjectif>-<nom>-<6hex>`, branche `worktree-<slug>`, base = branche courante.                                |
| Slug simple                   | Branche `worktree-<slug>`, base = branche courante. Validation du slug : lettres/chiffres/point/underscore/tiret, 64 caractères max. |
| `#N` ou `<url-github>/pull/N` | Slug `pr-<N>`, branche `worktree-pr-<N>`, base = `FETCH_HEAD` après `git fetch origin pull/<N>/head` (timeout 30s).     |

`--worktree` ne peut pas être combiné avec `--acp` / `--experimental-acp`.

Quand `--worktree` est combiné avec `--resume <session-id>`, le worktree l'emporte : le worktree sauvegardé de la session reprise (s'il existe) est écrasé et une ligne stderr + un rappel dans la première invite signalent l'écrasement.

Pour les modes interactif (TUI) et headless (`-p`), le worktree est automatiquement créé et la session se place dedans (`chdir`) avant le premier tour.

Modes d'échec du fetch de PR (code de sortie != 0, aucun worktree créé) :

| Cause                         | Extrait du message                                           |
| ----------------------------- | ------------------------------------------------------------ |
| Remote `origin` manquante     | `requires an "origin" remote that points at GitHub`          |
| La PR n'existe pas sur origin | `Failed to fetch PR #<N>: the PR does not exist on origin`   |
| Timeout réseau de 30s         | `Failed to fetch PR #<N>: timed out after 30s`               |
| Numéro de PR hors limites/zéro| `Invalid PR number`                                          |

## Limitations

Les éléments suivants ne sont volontairement pas implémentés dans la phase actuelle :

- **Pas de checkout partiel.** Les gros monorepos vérifient l'arbre complet. (`worktree.sparsePaths` est un élément de la feuille de route.)
- **Pas d'intégration tmux.** La CLI ne lance pas de sessions worktree dans de nouvelles fenêtres tmux.
- **Les worktrees sont des « projets » séparés pour le stockage des sessions.** Les sessions démarrées avec `--worktree foo` sont sauvegardées dans le répertoire de chat de ce worktree ; pour les reprendre plus tard, vous devez passer `--worktree foo` à nouveau. Les sessions démarrées sans `--worktree` sont sauvegardées dans le checkout principal et n'apparaîtront pas dans le sélecteur de reprise du worktree.
- **Pas de remplacement de session entre slugs.** `qwen --resume <sid> --worktree second` où `<sid>` a été créé avec `--worktree first` échouera à trouver la session — sessions et worktrees sont étroitement liés par `projectHash(cwd)`. Pour changer de worktree sur une session existante, vous devez quitter, puis relancer avec le nouveau `--worktree` et une nouvelle invite. Un changement architectural futur (ancrer le stockage à la racine du repo au lieu de `cwd`) lèverait cette contrainte.
- **`enter_worktree` en cours de session ne change PAS `process.cwd()` ni `Config.targetDir`.** Cet outil utilise la convention réservée au contexte du modèle (voir [Sub-Agents](./sub-agents.md)). Seul le flag `--worktree` de démarrage change réellement le répertoire de travail du processus.
- **Les chemins relatifs dans les autres champs d'arguments sont résolus AVANT le `chdir` du worktree.** Les flags prenant des chemins (`--mcp-config`, `--openai-logging-dir`, `--json-file`, `--input-file`, `--telemetry-outfile`, `--include-directories`) sont normalisés en chemins absolus par rapport au répertoire de lancement quand `--worktree` est défini. Les autres arguments argv en forme de chemin non listés ici sont toujours résolus par rapport au cwd du worktree — utilisez des chemins absolus pour être sûr.

Suivez la feuille de route dans `docs/design/worktree.md`.

## Dépannage

**Le pied de page n'affiche pas d'indicateur de worktree alors que je viens d'en créer un.**
Vérifiez que `ui.hideBuiltinWorktreeIndicator` n'est pas défini sur `true`. Confirmez aussi que le slug n'est pas vide dans le message de succès de l'outil.

**`--resume` ne restaure pas mon worktree.**
Vérifiez l'existence de `<chatsDir>/<sessionId>.worktree.json`. La CLI supprime automatiquement le fichier sidecar quand le répertoire du worktree n'existe plus, donc un sidecar manquant associé à un répertoire manquant est l'état normal « pas de worktree à restaurer » — pas un bug. Lancez avec `--debug` et greppez `restoreWorktreeContext` pour voir la raison.

**`exit_worktree` indique « créé par une session différente ».**
C'est la protection de propriété de session. Reprenez la session originale et quittez à partir de là, ou exécutez la commande suggérée `git worktree remove …` manuellement.

**Des worktrees obsolètes `agent-<hex>` s'accumulent.**
Le seuil de 30 jours est conservateur ; nettoyez manuellement avec `git worktree list && git worktree remove <path>`, ou attendez — le prochain démarrage de la CLI après la limite des 30 jours les supprimera tant qu'ils sont propres et poussés.
