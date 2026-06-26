# Worktrees

> Isolez le travail expérimental dans un [git worktree](https://git-scm.com/docs/git-worktree) temporaire sans quitter votre session en cours. Utile lorsque le modèle s'apprête à faire des modifications étendues que vous souhaitez garder séparées de votre checkout principal, ou lorsque vous voulez qu'un sous-agent travaille dans son propre bac à sable.

## Démarrage rapide

### Démarrer la session dans un worktree (flag `--worktree`)

Si vous savez d'avance que toute la session doit s'exécuter dans un worktree, passez `--worktree` au lancement :

```bash
# Slug généré automatiquement (ex. tender-jemison-037f0a)
qwen --worktree

# Nom explicite
qwen --worktree my-feature

# Forme avec `=` (recommandée quand on passe aussi un prompt positionnel — voir astuce ci-dessous)
qwen --worktree=my-feature

# Référence PR — récupère refs/pull/<N>/head depuis `origin`
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# Reprendre une session --worktree précédente — se rattache au répertoire existant
qwen --resume <session-id> --worktree=my-feature
```

> **Astuce — `--worktree` nu suivi d'un prompt positionnel est ambigu.** Comme `--worktree` prend une valeur optionnelle, `qwen --worktree "say hi"` fait consommer `"say hi"` comme slug par yargs (et le rejette à cause de l'espace). Utilisez l'une des formes suivantes :
>
> - `qwen --worktree=my-feature "say hi"` (fonctionne toujours — slug explicite via `=`)
> - `qwen "say hi" --worktree` (positionnel d'abord, flag à la fin → slug auto)
> - `qwen --worktree --approval-mode yolo "say hi"` (n'importe quel flag entre les deux ancre la forme nue)

> **Astuce — `qwen --resume --worktree foo` (sans ID de session) affiche un sélecteur vide au premier usage.** Le sélecteur se limite au stockage de session du worktree choisi ; les sessions démarrées en dehors de ce worktree ne sont pas listées. Pour reprendre une session qui a été démarrée dans `foo`, utilisez directement `qwen --resume <id> --worktree foo` — la CLI se rattache au répertoire `foo/` existant plutôt que de le recréer.

`process.cwd()` et l'espace de travail du modèle sont basculés vers le worktree avant que le premier tour s'exécute. Quittez avec `Ctrl+C` deux fois et la [Boîte de dialogue de sortie](#boîte-de-dialogue-de-sortie-ctrlc--ctrld) propose de conserver ou de supprimer le worktree.

Le flag `--worktree` ne peut pas être combiné avec `--acp`/`--experimental-acp` — pour les hôtes ACP (comme Zed), passez le chemin du worktree comme `cwd` de la requête `loadSession`/`newSession` à la place.

### Ou demander en cours de session

Vous pouvez aussi demander à Qwen Code en langage naturel de créer un worktree depuis une session existante :

```text
> crée un worktree appelé experiment-a
Worktree experiment-a créé sur la branche worktree-experiment-a
.qwen/worktrees/experiment-a
```

À partir de là, le modèle achemine chaque modification de fichier et chaque commande shell via `.qwen/worktrees/experiment-a/`. Votre répertoire de travail d'origine reste intact.

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

| Déclencheur                                | Ce qui se passe                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vous lancez avec `--worktree`              | La CLI crée le worktree avant tout tour du modèle et effectue un chdir dans la session. Les formulaires PR (`#N`, URL complète) font d'abord un fetch.   |
| Vous demandez explicitement un worktree en cours de session | Le modèle appelle `enter_worktree` ; les modifications de fichiers suivantes vont à l'intérieur.                                                          |
| Vous demandez explicitement de quitter      | Le modèle appelle `exit_worktree` avec `keep` ou `remove`.                                                                                               |
| Le modèle engendre un sous-agent avec isolement activé | Un worktree jetable (`agent-<hex>`) est créé automatiquement et nettoyé si l'agent n'a pas de diffs.                                                     |

Les deux outils de session (`enter_worktree` / `exit_worktree`) sont délibérément verrouillés derrière une formulation explicite — dire « corrige ce bug » ou « crée une branche » ne les déclenchera **pas**. Vous devez dire quelque chose comme « utilise un worktree », « démarre un worktree » ou « dans un worktree ». Le flag CLI `--worktree` n'a pas cette garde ; il crée toujours un worktree lorsqu'il est présent.

## Ce qui est créé

Chaque worktree géré par Qwen est placé sous le répertoire `.qwen` de votre projet :

```
<repoRoot>/.qwen/worktrees/<slug>/         # Répertoire de travail
                          ↳ branche worktree-<slug>   # Créée à partir de votre branche courante
```

- **Slug** — lettres, chiffres, point, underscore, trait d'union ; 64 caractères max. Si vous ne spécifiez pas de nom, un slug `<adjectif>-<nom>-<6hex>` est généré automatiquement (ex. `tender-jemison-037f0a`). Les références PR produisent `pr-<N>`.
- **Branche** — toujours `worktree-<slug>`, créée à partir de la branche que vous avez checkoutée au moment de la demande (pas nécessairement le `HEAD` de l'arbre de travail principal). Pour les worktrees PR, la branche est `worktree-pr-<N>` et est basée sur `FETCH_HEAD` (le sommet de la PR côté GitHub) plutôt que votre branche locale.
- **Hooks** — le `core.hooksPath` du worktree est automatiquement pointé vers `.husky/` (préféré) ou `.git/hooks/` du dépôt principal, de sorte que les commits dans le worktree déclenchent toujours vos hooks pre-commit / commit-msg existants.
- **Liens symboliques optionnels** — les répertoires listés dans `worktree.symlinkDirectories` (voir [Paramètres](#paramètres)) sont liés symboliquement depuis le dépôt principal vers le nouveau worktree, afin que les répertoires lourds comme `node_modules` puissent être réutilisés sans réinstallation.

Le chemin du worktree à usage général **n'est pas configurable** — il doit vivre sous `<repoRoot>/.qwen/worktrees/` pour que la CLI puisse le retrouver au redémarrage et lors des nettoyages de données périmées. (Le paramètre `agents.arena.worktreeBaseDir`, indépendant, ne contrôle que les worktrees de l'[Arène des agents](./arena.md), qui utilisent une arborescence séparée sous `~/.qwen/arena/`.)

## Pied de page et ligne d'état

Quand un worktree est actif, le pied de page affiche un indicateur atténué sur sa propre ligne :

```
⎇ worktree-experiment-a (experiment-a)
```

Si vous utilisez un [script de ligne d'état personnalisé](./status-line.md), il reçoit également un objet `worktree` dans le payload JSON envoyé via stdin :

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

Le champ du payload est présent **uniquement** quand un worktree est actif, donc un test de nullité (`input.worktree?.name`) suffit.

Si votre ligne d'état personnalisée affiche déjà les informations du worktree, vous pouvez masquer la ligne intégrée du pied de page pour éviter la duplication — voir [Paramètres](#paramètres) ci-dessous.

## Boîte de dialogue de sortie (Ctrl+C / Ctrl+D)

Appuyer deux fois sur le raccourci de sortie alors qu'un worktree est actif ouvre la **Boîte de dialogue de sortie du worktree** au lieu de fermer la CLI :

```
⎇ Worktree actif : "experiment-a" (worktree-experiment-a)

  • 2 nouveau(x) commit(s) sur worktree-experiment-a
  • 3 fichier(s) non commit(s)
  La suppression du worktree effacera tout ce qui précède.

Que souhaitez-vous faire ?
  ○ Garder le worktree (quitter sans supprimer)
  ○ Supprimer le worktree et la branche (perd 2 commit(s), 3 fichier(s))
  ○ Annuler (rester dans la session)
```

La boîte de dialogue inspecte le worktree à l'ouverture (`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`) et affiche les deux compteurs pour que vous sachiez exactement ce que vous risquez de perdre. `ESC` annule.

Si `git status` lui-même échoue (ex. index corrompu, répertoire du worktree supprimé sous la CLI), la boîte de dialogue affiche un avertissement `⚠ Impossible de mesurer l'état du worktree` et les compteurs peuvent être peu fiables — choisissez **Garder** ou **Annuler** jusqu'à ce que vous ayez diagnostiqué le problème sous-jacent du dépôt.

## Restauration avec `--resume`

La liaison du worktree actif est persistée dans un fichier annexe à côté de la transcription de votre session :

```
<chatsDir>/<sessionId>.worktree.json
```

Lorsque vous lancez la CLI avec `--resume <sessionId>` (ou que vous sélectionnez la session via `/resume`), trois choses se produisent de manière cohérente dans les modes **TUI interactif**, **headless `-p`** et **ACP/Zed** :

1. Le fichier annexe est chargé et le répertoire du worktree est vérifié comme existant toujours sur le disque.
2. S'il est vivant, le modèle reçoit un rappel unique sur son prompt suivant :
   ```
   [Repris] Worktree actif : "<slug>" à <path> (branche : <branch>). Continuez à utiliser ce chemin pour toutes les opérations sur les fichiers.
   ```
3. Si le répertoire du worktree a été supprimé entre les sessions, le fichier annexe périmé est nettoyé automatiquement — pas d'erreur, la reprise continue simplement sans contexte de worktree.

Chaque mode choisit son propre mécanisme d'injection, mais le comportement visible par l'utilisateur est identique :

| Mode                  | Mécanisme                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Interactif (TUI)      | Élément d'historique `INFO` + préfixe de rappel système sur le prochain prompt utilisateur.                 |
| Headless (`-p`)       | Préfixe `<system-reminder>` sur le prompt + événement système JSON `worktree_restored` dans le flux de sortie. |
| ACP (ex. Zed)         | Notification en attente attachée au prochain appel `prompt()`.                                               |

Le modèle n'est **pas** automatiquement `chdir`'é dans le worktree — le rappel est ce qui le maintient sur la voie d'acheminement des modifications via le chemin du worktree.

## Isolement des sous-agents

L'outil `agent` accepte un paramètre optionnel `isolation: "worktree"`. Lorsqu'il est défini, Qwen Code crée un worktree éphémère à `<repoRoot>/.qwen/worktrees/agent-<7hex>/` avant que le sous-agent ne démarre, et :

- **Aucune modification** → le worktree est automatiquement supprimé lorsque l'agent se termine.
- **Il y a des modifications** → le worktree est conservé ; son chemin et sa branche sont ajoutés au résultat de l'agent, ex :
  ```
  …sortie de l'agent…
  [worktree conservé : /path/to/.qwen/worktrees/agent-3f2a1b9 (branche worktree-agent-3f2a1b9)]
  ```
  Examinez le diff et fusionnez ou supprimez-le manuellement.

Deux contraintes :

- `isolation: "worktree"` nécessite un `subagent_type` — les sous-agents forkés (sans `subagent_type`) réutilisent tout le contexte de conversation du parent, donc les isoler diviserait l'intention de l'arbre de travail.
- Les agents en arrière-plan (`run_in_background: true`) fonctionnent correctement avec l'isolement ; le nettoyage a lieu lorsque l'agent signale la fin.

### Nettoyage automatique des données périmées

Les worktrees d'agents éphémères qui ont survécu à un crash ou à un arrêt avec `--no-cleanup` sont récoltés à chaque démarrage de la CLI, avec des règles conservatrices de fermeture sur échec :

| Garde                                     | Comportement                                         |
| ----------------------------------------- | ---------------------------------------------------- |
| Le slug doit correspondre au motif `agent-<7hex>` | Les worktrees nommés que vous avez créés ne sont jamais touchés. |
| `mtime` du répertoire > 30 jours          | Les entrées plus récentes sont ignorées.             |
| Tout changement suivi non commit          | Ignorer l'entrée (ne pas supprimer).                 |
| Tout commit non accessible depuis une remote | Ignorer l'entrée (ne pas supprimer).                 |
| Toute erreur de lecture de l'état git     | Ignorer l'entrée (ne pas supprimer).                 |

Les worktrees nommés par l'utilisateur (slugs `enter_worktree`) ne sont **jamais** nettoyés automatiquement — vous les conservez jusqu'à ce que vous demandiez leur suppression.

## Gardes de sécurité sur `exit_worktree action="remove"`

Trois gardes indépendantes sont déclenchées avant que le répertoire et la branche soient supprimés :

1. **Propriété de la session** — chaque worktree porte un marqueur annexe avec l'ID de session qui l'a créé. Une session différente tentant de le supprimer se verra refuser avec une erreur claire pointant vers `git worktree remove` pour la trappe de sortie manuelle.
2. **Arbre de travail sale** — les modifications suivies non commit ou les fichiers non suivis bloquent la suppression. Passez `discard_changes: true` pour outrepasser. (Le contournement nécessite une confirmation explicite de l'utilisateur — `action: "remove"` n'est jamais auto-approuvé en mode AUTO_EDIT.)
3. **Commits non fusionnés** — les commits sur `worktree-<slug>` qu'aucune autre branche locale ou référence distante ne pointe bloquent la suppression sans condition ; il n'y a pas de flag « ignorer les commits » car perdre du travail commité est rarement ce que les utilisateurs veulent. Fusionnez, poussez ou renommez la branche ailleurs d'abord.

Les trois mêmes gardes s'appliquent au bouton `Supprimer` de la `Boîte de dialogue de sortie du worktree`.

## Paramètres

Deux paramètres façonnent l'expérience des worktrees à usage général :

| Clé                               | Type       | Défaut      | Effet                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ui.hideBuiltinWorktreeIndicator` | boolean    | `false`     | Masque la ligne intégrée `⎇ worktree-… (…)` du pied de page. Le champ `worktree` est toujours délivré aux scripts de ligne d'état personnalisés. Mettez à `true` uniquement si votre ligne d'état affiche déjà le worktree — sinon vous perdez toute indication dans l'interface.                 |
| `worktree.symlinkDirectories`     | `string[]` | `undefined` | Répertoires sous le dépôt principal à lier symboliquement dans chaque worktree à usage général lors de la création. Les chemins sont relatifs à la racine du dépôt ; les chemins absolus et toute entrée contenant `..` sont rejetés. Les sources manquantes et les destinations existantes sont ignorées silencieusement (pas d'écrasement). |

Exemple :

```jsonc
// ~/.qwen/settings.json ou <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

S'applique à TOUS les chemins de création de worktree : flag `--worktree`, outil `enter_worktree`, et `agent isolation: "worktree"`.

Paramètres sans rapport avec les worktrees généraux mais bons à connaître :

- `agents.arena.worktreeBaseDir` — contrôle le placement des worktrees de l'**Arène des agents** (défaut `~/.qwen/arena`). N'affecte pas les worktrees à usage général, qui vivent toujours sous `<repoRoot>/.qwen/worktrees/`.

Il n'y a pas encore de schéma pour `worktree.sparsePaths` — c'est un élément de la feuille de route (voir [Limitations](#limitations)).

## Référence des outils

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| Champ  | Type   | Requis | Notes                                                                                              |
| ------ | ------ | ------ | -------------------------------------------------------------------------------------------------- |
| `name` | string | non    | Slug. Lettres, chiffres, point, underscore, trait d'union ; 64 caractères max. Généré automatiquement si omis. |

Refuse de s'exécuter quand :

- La CLI n'est pas dans un dépôt git.
- Le répertoire de travail courant est déjà dans `.qwen/worktrees/` (pas de worktrees imbriqués).

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| Champ             | Type                   | Requis                                | Notes                                                                     |
| ----------------- | ---------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `name`            | string                 | oui                                   | Doit correspondre au slug utilisé dans `enter_worktree`.                  |
| `action`          | `"keep"` \| `"remove"` | oui                                   | `keep` conserve le répertoire + la branche ; `remove` supprime les deux.  |
| `discard_changes` | boolean                | uniquement quand `action="remove"` et sale | Outrepasse la garde de l'arbre sale. Sans effet pour `action="keep"`.     |

`action: "remove"` demande toujours confirmation, y compris en mode d'approbation `AUTO_EDIT` — il est traité comme une opération destructive du shell, et non comme un outil d'information pure.

### `agent` — paramètre `isolation`

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| Champ       | Type         | Requis | Notes                                                                                  |
| ----------- | ------------ | ------ | -------------------------------------------------------------------------------------- |
| `isolation` | `"worktree"` | non    | Exécute l'agent dans un nouveau worktree `agent-<7hex>`. Nécessite `subagent_type` (pas de fork). |

Voir [Sous-agents](./sub-agents.md) pour le reste de la référence de l'outil agent.

## Référence CLI

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # générer automatiquement le slug
qwen --worktree my-feature                                    # slug explicite
qwen --worktree=my-feature                                    # forme avec =
qwen --worktree=#123                                          # référence PR
qwen --worktree https://github.com/owner/repo/pull/123        # URL PR
```

| Entrée                         | Résultat                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Flag nu (pas de valeur)        | Slug auto `<adjectif>-<nom>-<6hex>`, branche `worktree-<slug>`, base = branche courante.                                        |
| Slug simple                    | Branche `worktree-<slug>`, base = branche courante. Validation du slug : lettres/chiffres/point/underscore/trait d'union, max 64 caractères. |
| `#N` ou `<url-github>/pull/N`  | Slug `pr-<N>`, branche `worktree-pr-<N>`, base = `FETCH_HEAD` après `git fetch origin pull/<N>/head` (timeout de 30s).           |

`--worktree` ne peut pas être combiné avec `--acp` / `--experimental-acp`.

Quand `--worktree` est combiné avec `--resume <session-id>`, le worktree l'emporte : le worktree sauvegardé de la session reprise (s'il y en a un) est écrasé et une ligne stderr + un rappel sur le premier signalent l'écrasement.

Pour les modes interactif (TUI) et headless (`-p`), le worktree est automatiquement créé et la session effectue un chdir dedans avant le premier tour.

Modes d'échec du fetch PR (code de sortie != 0, aucun worktree créé) :

| Cause                          | Extrait du message                                           |
| ------------------------------ | ------------------------------------------------------------ |
| Remote `origin` manquante      | `nécessite une remote "origin" qui pointe vers GitHub`      |
| La PR n'existe pas sur origin  | `Échec du fetch de PR #<N> : la PR n'existe pas sur origin` |
| Timeout réseau de 30s          | `Échec du fetch de PR #<N> : timeout après 30s`             |
| Numéro de PR hors plage / zéro | `Numéro de PR invalide`                                      |

## Limitations

Les éléments suivants ne sont intentionnellement pas implémentés dans la phase actuelle :

- **Pas de checkout partiel.** Les grands monorepos check-outent l'arbre complet. (`worktree.sparsePaths` est un élément de la feuille de route.)
- **Pas d'intégration tmux.** La CLI ne lance pas de sessions worktree dans de nouvelles fenêtres tmux.
- **Les worktrees sont des « projets » séparés pour le stockage des sessions.** Les sessions démarrées avec `--worktree foo` sont sauvegardées sous le répertoire de chats de ce worktree ; pour les reprendre plus tard, vous devez repasser `--worktree foo`. Les sessions démarrées sans `--worktree` sont sauvegardées sous le checkout principal et n'apparaîtront pas dans le sélecteur de reprise du worktree.
- **Pas de remplacement de session entre slugs.** `qwen --resume <sid> --worktree second` où `<sid>` a été créé avec `--worktree first` échouera à trouver la session — les sessions et les worktrees sont étroitement liés par `projectHash(cwd)`. Pour changer de worktree sur une session existante, vous devez quitter, puis relancer avec le nouveau `--worktree` et un nouveau prompt. Un futur changement architectural (ancrer le stockage à la racine du dépôt plutôt qu'à `cwd`) lèverait cette contrainte.
- **`enter_worktree` en cours de session NE change PAS `process.cwd()` ni `Config.targetDir`.** Cet outil utilise la convention de contexte de modèle uniquement (voir [Sous-agents](./sub-agents.md)). Seul le flag de démarrage `--worktree` change réellement le répertoire de travail du processus.
- **Les chemins relatifs dans les autres champs d'arguments sont résolus AVANT le chdir du worktree.** Les flags prenant des chemins (`--mcp-config`, `--openai-logging-dir`, `--json-file`, `--input-file`, `--telemetry-outfile`, `--include-directories`) sont normalisés en chemins absolus par rapport au cwd de lancement lorsque `--worktree` est défini. Les autres champs de argv en forme de chemin non listés ici se résolvent toujours par rapport au cwd du worktree — utilisez des chemins absolus pour être sûr.
Suivez la feuille de route dans `docs/design/worktree.md`.

## Dépannage

**Le pied de page n'affiche aucun indicateur de worktree alors que je viens d'en créer un.**
Vérifiez que `ui.hideBuiltinWorktreeIndicator` n'est pas défini sur `true`. Confirmez également que le slug n'est pas vide dans le message de succès de l'outil.

**`--resume` ne restaure pas mon worktree.**
Vérifiez que le fichier `<chatsDir>/<sessionId>.worktree.json` existe. Le CLI supprime automatiquement le sidecar lorsque le répertoire du worktree disparaît. Un sidecar manquant accompagné d'un répertoire manquant est donc l'état normal « aucun worktree à restaurer » — ce n'est pas un bug. Exécutez avec `--debug` et recherchez `restoreWorktreeContext` pour en connaître la raison.

**`exit_worktree` indique « créé par une session différente ».**
Il s'agit de la garde de propriété de session. Reprenez la session d'origine et quittez-la depuis celle-ci, ou exécutez manuellement la commande `git worktree remove …` suggérée.

**Les worktrees `agent-<hex>` obsolètes s'accumulent.**
Le délai de 30 jours est conservateur ; faites un nettoyage manuel avec `git worktree list && git worktree remove <path>`, ou attendez — au prochain démarrage du CLI après le cap des 30 jours, ils seront supprimés tant qu'ils sont propres et poussés.