# Barre d'état

> Afficher des informations personnalisées dans le pied de page.

La barre d'état affiche des informations contextuelles à la session — nom du modèle, utilisation des tokens, branche Git, etc. — dans la partie gauche du pied de page. Deux modes de configuration existent :

- **Mode prédéfini** — choisissez parmi les éléments de données intégrés via un dialogue interactif ou une configuration JSON. Aucun script nécessaire.
- **Mode commande** — exécutez une commande shell qui reçoit un contexte JSON structuré via stdin. Flexibilité totale pour un formatage personnalisé.

```
Barre d'état sur une seule ligne (mode d'approbation par défaut — 1 ligne) :
┌─────────────────────────────────────────────────────────────────┐
│  utilisateur@hôte ~/projet (main) ctx:34%   🔒 docker | Debug | 67%  │  ← barre d'état
└─────────────────────────────────────────────────────────────────┘

Barre d'état sur plusieurs lignes (jusqu'à 2 lignes — 2 lignes) :
┌─────────────────────────────────────────────────────────────────┐
│  utilisateur@hôte ~/projet (main) ctx:34%   🔒 docker | Debug | 67%  │  ← barre d'état 1
│  ████████░░░░░░░░░░ 34% contexte                                │  ← barre d'état 2
└─────────────────────────────────────────────────────────────────┘

Barre d'état multi-lignes + mode non par défaut (3 lignes max) :
┌─────────────────────────────────────────────────────────────────┐
│  utilisateur@hôte ~/projet (main) ctx:34%   🔒 docker | Debug | 67%  │  ← barre d'état 1
│  ████████░░░░░░░░░░ 34% contexte                                │  ← barre d'état 2
│  auto-accepter les modifications (shift + tab pour parcourir)   │  ← indicateur de mode
└─────────────────────────────────────────────────────────────────┘
```

Une fois configurée, la barre d'état remplace l'indice par défaut « ? pour les raccourcis ». Les messages haute priorité (invites Ctrl+C/D, Échap, mode INSERT de vim) prennent temporairement le dessus sur la barre d'état. Le texte de la barre d'état est tronqué pour tenir dans la largeur disponible.

## Configuration rapide

Le moyen le plus simple de configurer une barre d'état est la commande `/statusline`. Elle ouvre un dialogue interactif où vous pouvez sélectionner des éléments prédéfinis, activer les couleurs du thème et voir un aperçu en direct :

```
/statusline
```

Ceci ouvre le configurateur de mode prédéfini. Utilisez les touches fléchées pour naviguer, la barre d'espace pour sélectionner/désélectionner les éléments, et Entrée pour confirmer. Votre sélection est automatiquement sauvegardée dans les paramètres.

Vous pouvez aussi donner des instructions spécifiques à `/statusline` pour qu'il génère une configuration en mode commande :

```
/statusline affiche le nom du modèle et le pourcentage d'utilisation du contexte
```

---

## Mode prédéfini

Le mode prédéfini fournit un ensemble d'éléments de données intégrés que vous pouvez choisir et combiner — pas de commandes shell, pas de `jq`, pas de script. Les éléments sont affichés sous forme `élément1 | élément2 | élément3` sur une seule ligne.

### Configuration

Ajoutez un objet `statusLine` sous la clé `ui` dans `~/.qwen/settings.json` :

```json
{
  "ui": {
    "statusLine": {
      "type": "preset",
      "items": [
        "model-with-reasoning",
        "git-branch",
        "context-remaining",
        "current-dir",
        "context-used"
      ],
      "useThemeColors": true
    }
  }
}
```

| Champ                  | Type       | Requis | Description                                                                                                |
| ---------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `type`                 | `"preset"` | Oui    | Doit être `"preset"`                                                                                       |
| `items`                | string[]   | Oui    | Liste ordonnée des identifiants d'éléments prédéfinis à afficher (voir tableau ci-dessous). Les éléments sont joints avec `\|` comme séparateur. |
| `useThemeColors`       | boolean    | Non    | Applique la couleur du thème actif (`/theme`) au texte de la barre d'état. Par défaut `true`.              |
| `hideContextIndicator` | boolean    | Non    | Masque l'indicateur d'utilisation du contexte intégré dans la partie droite du pied de page. Par défaut `false`. |

### Éléments prédéfinis disponibles

| Identifiant            | Défaut | Description                                                        |
| ---------------------- | ------ | ------------------------------------------------------------------ |
| `model-with-reasoning` | Oui    | Nom du modèle actuel avec niveau de raisonnement (ex. `qwen-3-235b high`) |
| `model`                |        | Nom du modèle actuel sans niveau de raisonnement                   |
| `git-branch`           | Oui    | Nom de la branche Git actuelle (caché si hors d'un dépôt Git)      |
| `context-remaining`    | Oui    | Pourcentage de fenêtre de contexte restant (ex. `Contexte 65.7% restant`) |
| `total-input-tokens`   |        | Tokens d'entrée cumulés dans la session (ex. `30.0k entrés total`)    |
| `total-output-tokens`  |        | Tokens de sortie cumulés dans la session (ex. `5.0k sortis total`)   |
| `current-dir`          | Oui    | Répertoire de travail actuel                                       |
| `project-name`         |        | Nom du projet (nom de base du répertoire de travail)               |
| `pull-request-number`  |        | Numéro de PR ouverte pour la branche actuelle (nécessite l'outil `gh`) |
| `branch-changes`       |        | Statistiques de modifications de fichiers de la session (ex. `+120 -30`) |
| `context-used`         | Oui    | Pourcentage de la fenêtre de contexte utilisé (ex. `Contexte 34.3% utilisé`) |
| `run-state`            |        | État compact de la session (`Pret`, `Travail` ou `Confirmer`)      |
| `qwen-version`         |        | Version de Qwen Code (ex. `v0.14.1`)                               |
| `context-window-size`  |        | Taille totale de la fenêtre de contexte (ex. `131.1k fenêtre`)      |
| `used-tokens`          |        | Nombre de tokens de la requête actuelle (ex. `45.0k utilisé`)      |
| `session-id`           |        | Identifiant de la session actuelle                                 |
Les éléments marqués **Par défaut** sont présélectionnés lorsque vous ouvrez la boîte de dialogue `/statusline` pour la première fois.

`total-input-tokens` et `total-output-tokens` sont des totaux de session. Ils additionnent l'utilisation des jetons à travers les tours, donc les jetons d'entrée peuvent augmenter rapidement car chaque nouvelle requête au modèle inclut à nouveau le contexte de la conversation actuelle. Utilisez `used-tokens` lorsque vous souhaitez la taille actuelle du prompt plutôt que le cumul de dépenses de la session.

### Exemple de sortie

Avec les éléments par défaut, la barre d'état ressemble à :

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### Personnalisation via la boîte de dialogue

L'exécution de `/statusline` ouvre une boîte de dialogue de sélection multiple interactive :

```
┌ Configure Status Line ────────────────────────────────────────┐
│ Select which items to display in the status line.             │
│                                                               │
│ Type to search                                                │
│ >                                                             │
│                                                               │
│ [x] Use theme colors        Apply colors from the active /theme│
│ ───────────────────────                                       │
│ [x] model-with-reasoning    Current model name with reasoning │
│ [ ] model-only              Current model name without reason │
│ [x] git-branch              Current Git branch when available │
│ [x] context-remaining       Percentage of context remaining   │
│ ...                                                           │
│                                                               │
│ Preview                                                       │
│ qwen-3-235b high | main | Context 65.7% left                 │
│                                                               │
│ Use up/down to navigate, space to select, enter to confirm    │
└───────────────────────────────────────────────────────────────┘
```

- Tapez pour filtrer les éléments par nom ou description
- Un aperçu en direct se met à jour lorsque vous basculez les éléments
- Appuyez sur Entrée pour enregistrer la configuration

---

## Mode commande

Le mode commande exécute une commande shell dont la sortie standard est affichée dans la barre d'état. La commande reçoit un contexte JSON structuré via l'entrée standard pour une sortie tenant compte de la session.

### Prérequis

- [`jq`](https://jqlang.github.io/jq/) est recommandé pour analyser l'entrée JSON (installation via `brew install jq`, `apt install jq`, etc.)
- Les commandes simples qui n'ont pas besoin de données JSON (par ex. `git branch --show-current`) fonctionnent sans `jq`

### Configuration

Ajoutez un objet `statusLine` sous la clé `ui` dans `~/.qwen/settings.json` :

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

| Champ                   | Type        | Requis | Description                                                                                                                         |
| ----------------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `type`                  | `"command"` | Oui    | Doit être `"command"`                                                                                                               |
| `command`               | string      | Oui    | Commande shell à exécuter. Reçoit du JSON via stdin, la sortie standard est affichée (jusqu'à 2 lignes).                            |
| `refreshInterval`       | number      | Non    | Réexécute la commande toutes les N secondes (minimum 1). Utile pour les données qui changent sans événement d'état de l'Agent (horloge, quota, uptime). |
| `respectUserColors`     | boolean     | Non    | Préserve les codes de couleur ANSI dans la sortie de la commande au lieu d'appliquer un style de pied de page atténué. Par défaut `false`. |
| `hideContextIndicator`  | boolean     | Non    | Masque l'indicateur d'utilisation du contexte intégré dans la section droite du pied de page. Par défaut `false`.                   |

### Entrée JSON

La commande reçoit un objet JSON via stdin avec les champs suivants :

```json
{
  "session_id": "abc-123",
  "version": "0.14.1",
  "model": {
    "display_name": "qwen-3-235b"
  },
  "context_window": {
    "context_window_size": 131072,
    "used_percentage": 34.3,
    "remaining_percentage": 65.7,
    "current_usage": 45000,
    "total_input_tokens": 30000,
    "total_output_tokens": 5000
  },
  "workspace": {
    "current_dir": "/home/user/project"
  },
  "git": {
    "branch": "main"
  },
  "worktree": {
    "name": "fix-auth",
    "path": "/home/user/project/.qwen/worktrees/fix-auth",
    "branch": "fix-auth",
    "original_cwd": "/home/user/project",
    "original_branch": "main"
  },
  "metrics": {
    "models": {
      "qwen-3-235b": {
        "api": {
          "total_requests": 10,
          "total_errors": 0,
          "total_latency_ms": 5000
        },
        "tokens": {
          "prompt": 30000,
          "completion": 5000,
          "total": 35000,
          "cached": 10000,
          "thoughts": 2000
        }
      }
    },
    "files": {
      "total_lines_added": 120,
      "total_lines_removed": 30
    }
  },
  "vim": {
    "mode": "INSERT"
  }
}
```
| Champ                               | Type             | Description                                                                          |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `session_id`                        | string           | Identifiant unique de session                                                        |
| `version`                           | string           | Version de Qwen Code                                                                 |
| `model.display_name`                | string           | Nom du modèle actuel                                                                 |
| `context_window.context_window_size`| number           | Taille totale de la fenêtre de contexte en tokens                                    |
| `context_window.used_percentage`    | number           | Utilisation de la fenêtre de contexte en pourcentage (0–100)                         |
| `context_window.remaining_percentage`| number          | Fenêtre de contexte restante en pourcentage (0–100)                                  |
| `context_window.current_usage`      | number           | Nombre de tokens de la dernière requête API (taille actuelle du contexte)             |
| `context_window.total_input_tokens` | number           | Total des tokens d’entrée consommés pendant cette session                            |
| `context_window.total_output_tokens`| number           | Total des tokens de sortie consommés pendant cette session                           |
| `workspace.current_dir`             | string           | Répertoire de travail actuel                                                         |
| `git`                               | object \| absent  | Présent uniquement dans un dépôt git.                                                |
| `git.branch`                        | string           | Nom de la branche actuelle                                                           |
| `worktree`                          | object \| absent  | Présent uniquement dans un worktree actif (créé par `enter_worktree`).               |
| `worktree.name`                     | string           | Nom slug du worktree                                                                 |
| `worktree.path`                     | string           | Chemin absolu vers le répertoire du worktree                                         |
| `worktree.branch`                   | string           | Branche extraite dans le worktree                                                    |
| `worktree.original_cwd`             | string           | Répertoire de travail avant d’entrer dans le worktree                                |
| `worktree.original_branch`          | string           | Branche active avant d’entrer dans le worktree                                       |
| `metrics.models.<id>.api`           | object           | Statistiques API par modèle : `total_requests`, `total_errors`, `total_latency_ms`   |
| `metrics.models.<id>.tokens`        | object           | Utilisation des tokens par modèle : `prompt`, `completion`, `total`, `cached`, `thoughts` |
| `metrics.files`                     | object           | Statistiques de modifications de fichiers : `total_lines_added`, `total_lines_removed`|
| `vim`                               | object \| absent  | Présent uniquement lorsque le mode vim est activé. Contient `mode` (`"INSERT"` ou `"NORMAL"`). |

> **Important :** stdin ne peut être lu qu’une seule fois. Stockez-le toujours dans une variable d’abord : `input=$(cat)`.

### Exemples

#### Utilisation du modèle et des tokens

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

Sortie : `qwen-3-235b  ctx:34%`

#### Branche Git + répertoire

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // empty'); dir=$(basename \"$(echo \"$input\" | jq -r '.workspace.current_dir')\"); echo \"$dir${branch:+ ($branch)}\""
    }
  }
}
```

Sortie : `my-project (main)`

> Note : Le champ `git.branch` est fourni directement dans l’entrée JSON — pas besoin d’appeler `git` en shell.

#### Statistiques de modifications de fichiers

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); added=$(echo \"$input\" | jq -r '.metrics.files.total_lines_added'); removed=$(echo \"$input\" | jq -r '.metrics.files.total_lines_removed'); echo \"+$added/-$removed lines\""
    }
  }
}
```

Sortie : `+120/-30 lignes`

#### Horloge en direct et branche Git

Utilisez `refreshInterval` lorsque la barre d’état affiche des données qui changent sans événement Agent (par exemple l’horloge, le temps d’activité ou les compteurs de limite de débit) :

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // \"no-git\"'); echo \"$(date +%H:%M:%S)  ($branch)\"",
      "refreshInterval": 1
    }
  }
}
```
Sortie (rafraîchie chaque seconde) : `14:32:07 (main)`

#### Fichier de script pour les commandes complexes

Pour des commandes plus longues, enregistrez un fichier de script dans `~/.qwen/statusline-command.sh` :

```bash
#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
pct=$(echo "$input" | jq -r '.context_window.used_percentage')
branch=$(echo "$input" | jq -r '.git.branch // empty')
added=$(echo "$input" | jq -r '.metrics.files.total_lines_added')
removed=$(echo "$input" | jq -r '.metrics.files.total_lines_removed')

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$branch" ] && parts+=("($branch)")
[ "$pct" != "0" ] 2>/dev/null && parts+=("ctx:${pct}%")
([ "$added" -gt 0 ] || [ "$removed" -gt 0 ]) 2>/dev/null && parts+=("+${added}/-${removed}")

echo "${parts[*]}"
```

Référencez-le ensuite dans les paramètres :

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "bash ~/.qwen/statusline-command.sh"
    }
  }
}
```

## Comportement

**Les deux modes :**

- **Déclencheurs de mise à jour** : La ligne d'état se met à jour lorsque le modèle change, un nouveau message est envoyé (le compteur de jetons change), le mode vim est activé/désactivé, la branche git change, les appels d'outils se terminent ou des modifications de fichiers se produisent. Les mises à jour sont anti-rebond (300 ms).
- **Sortie** : Jusqu'à 2 lignes. Chaque ligne est rendue comme une rangée distincte dans la section gauche du pied de page. Les lignes qui dépassent la largeur disponible sont tronquées.
- **Rechargement à chaud** : Les modifications apportées à `ui.statusLine` dans les paramètres prennent effet immédiatement – aucun redémarrage n'est nécessaire.
- **Suppression** : Supprimez la clé `ui.statusLine` des paramètres pour désactiver la fonction. L'indice "? pour les raccourcis" réapparaît.

**Mode commande uniquement :**

- **Délai d'attente** : Les commandes qui prennent plus de 5 secondes sont tuées. La ligne d'état s'efface en cas d'échec.
- **Rafraîchissement** : Définissez `refreshInterval` (en secondes) pour réexécuter la commande périodiquement – utile pour des données qui changent sans événement Agent (horloge, limites de taux, état de compilation).
- **Interpréteur** : Les commandes sont exécutées via `/bin/sh` sur macOS/Linux. Sous Windows, `cmd.exe` est utilisé par défaut – encapsulez les commandes POSIX avec `bash -c "..."` ou pointez vers un script bash (ex. `bash ~/.qwen/statusline-command.sh`).

**Mode prédéfini uniquement :**

- **Aucune dépendance externe** : Les éléments prédéfinis sont calculés en interne – pas de commandes shell, pas de `jq`, pas de délais d'attente.
- **Intégration du thème** : Lorsque `useThemeColors` est `true` (par défaut), le texte de la ligne d'état utilise la couleur du `/theme` actif. Quand il est `false`, le style atténué du pied de page est appliqué.
- **Recherche de PR** : L'élément `pull-request-number` exécute `gh pr view` en arrière-plan (délai d'attente de 2 s). Il ne se déclenche que lorsque la branche change, pas à chaque mise à jour.

## Dépannage

| Problème                      | Cause                                  | Correctif                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La ligne d'état ne s'affiche pas | La configuration est au mauvais endroit | Doit se trouver sous `ui.statusLine`, pas au niveau racine `statusLine`                                                                                                                                                                                                                                                                                                                              |
| Sortie vide (mode commande)   | La commande échoue silencieusement     | Testez manuellement : `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'votre_commande'` |
| Données obsolètes (mode commande) | Aucun déclencheur ne s'est produit       | Envoyez un message ou changez de modèle pour déclencher une mise à jour – ou définissez `refreshInterval` pour réexécuter la commande périodiquement                                                                                                                                                                                                                                                 |
| Commande trop lente           | Script complexe                        | Optimisez le script ou déplacez le travail lourd vers un cache en arrière-plan                                                                                                                                                                                                                                                                                                                         |
| Éléments prédéfinis manquants | Éléments conditionnels sans données     | `git-branch` est caché en dehors des dépôts git ; `context-used` est caché quand l'utilisation est à 0 ; `branch-changes` est caché quand aucun fichier n'a changé. Ce comportement est attendu – les éléments apparaissent dès que leurs données sont disponibles                                                                                                                                     |
| Le numéro de PR ne s'affiche pas | CLI `gh` non installé                  | Installez [GitHub CLI](https://cli.github.com/) et authentifiez-vous avec `gh auth login`. La recherche s'exécute avec un délai d'attente de 2 s                                                                                                                                                                                                                                                        |
