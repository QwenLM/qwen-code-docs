# Ligne d'état

> Affichez des informations personnalisées dans le pied de page.

La ligne d'état affiche des informations contextuelles de la session — nom du modèle, utilisation des tokens, branche git, etc. — dans la section gauche du pied de page. Il existe deux modes de configuration :

- **Mode prédéfini** — choisissez parmi les éléments de données intégrés via une boîte de dialogue interactive ou une configuration JSON. Aucun script requis.
- **Mode commande** — exécutez une commande shell qui reçoit un contexte JSON structuré via stdin. Flexibilité totale pour le formatage personnalisé.

```
Single-line status (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← ligne d'état
└─────────────────────────────────────────────────────────────────┘

Multi-line status (up to 2 lines — 2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← ligne d'état 1
│  ████████░░░░░░░░░░ 34% context                                │  ← ligne d'état 2
└─────────────────────────────────────────────────────────────────┘

Multi-line status + non-default mode (3 rows max):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← ligne d'état 1
│  ████████░░░░░░░░░░ 34% context                                │  ← ligne d'état 2
│  auto-accept edits (shift + tab to cycle)                       │  ← indicateur de mode
└─────────────────────────────────────────────────────────────────┘
```

Une fois configurée, la ligne d'état remplace l'indication par défaut "? pour les raccourcis". Les messages prioritaires (invitations de sortie Ctrl+C/D, Esc, mode INSERT de vim) remplacent temporairement la ligne d'état. Le texte de la ligne d'état est tronqué pour s'adapter à la largeur disponible.

## Configuration rapide

Le moyen le plus simple de configurer une ligne d'état est la commande `/statusline`. Elle ouvre une boîte de dialogue interactive où vous pouvez sélectionner des éléments prédéfinis, activer les couleurs du thème et voir un aperçu en direct :

```
/statusline
```

Cela ouvre le configurateur du mode prédéfini. Utilisez les touches fléchées pour naviguer, la barre d'espace pour activer/désactiver les éléments, et Entrée pour confirmer. Votre sélection est automatiquement enregistrée dans les paramètres.

Vous pouvez également donner des instructions spécifiques à `/statusline` pour qu'elle génère une configuration en mode commande :

```
/statusline show model name and context usage percentage
```

---

## Mode prédéfini

Le mode prédéfini fournit un ensemble d'éléments de données intégrés que vous pouvez sélectionner et combiner — pas de commandes shell, pas de `jq`, pas de script. Les éléments sont affichés sous la forme `item1 | item2 | item3` sur une seule ligne.

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

| Field                  | Type       | Required | Description                                                                                                |
| ---------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `type`                 | `"preset"` | Oui      | Doit être `"preset"`                                                                                       |
| `items`                | string[]   | Oui      | Liste ordonnée des ID d'éléments prédéfinis à afficher (voir tableau ci-dessous). Les éléments sont joints avec `\|` comme séparateur. |
| `useThemeColors`       | boolean    | Non      | Applique la couleur du `/theme` actif au texte de la ligne d'état. La valeur par défaut est `true`.        |
| `hideContextIndicator` | boolean    | Non      | Masque l'indicateur d'utilisation du contexte intégré dans la section droite du pied de page. La valeur par défaut est `false`. |

### Éléments prédéfinis disponibles

| Item ID                | Default | Description                                                        |
| ---------------------- | ------- | ------------------------------------------------------------------ |
| `model-with-reasoning` | Oui     | Nom du modèle actuel avec le niveau de raisonnement (ex. `qwen-3-235b high`)  |
| `model`                |         | Nom du modèle actuel sans le niveau de raisonnement                |
| `git-branch`           | Oui     | Nom de la branche Git actuelle (masqué si hors d'un dépôt git)     |
| `context-remaining`    | Oui     | Pourcentage de la fenêtre de contexte restant (ex. `Context 65.7% left`) |
| `total-input-tokens`   |         | Total cumulé des tokens d'entrée utilisés dans la session (ex. `30.0k total in`) |
| `total-output-tokens`  |         | Total cumulé des tokens de sortie utilisés dans la session (ex. `5.0k total out`) |
| `current-dir`          | Oui     | Répertoire de travail actuel                                       |
| `project-name`         |         | Nom du projet (basename du répertoire de travail)                  |
| `pull-request-number`  |         | Numéro de la PR ouverte pour la branche actuelle (nécessite le CLI `gh`) |
| `branch-changes`       |         | Statistiques des modifications de fichiers de la session (ex. `+120 -30`) |
| `context-used`         | Oui     | Pourcentage de la fenêtre de contexte utilisé (ex. `Context 34.3% used`) |
| `run-state`            |         | État compact de la session (`Ready`, `Working`, ou `Confirm`)      |
| `qwen-version`         |         | Version de Qwen Code (ex. `v0.14.1`)                               |
| `context-window-size`  |         | Taille totale de la fenêtre de contexte (ex. `131.1k window`)      |
| `used-tokens`          |         | Nombre de tokens du prompt actuel (ex. `45.0k used`)               |
| `session-id`           |         | Identifiant de la session actuelle                                 |

Les éléments marqués **Oui** dans la colonne Default sont présélectionnés lorsque vous ouvrez la boîte de dialogue `/statusline` pour la première fois.

`total-input-tokens` et `total-output-tokens` sont les totaux de la session. Ils additionnent l'utilisation des tokens au fil des tours, donc les tokens d'entrée peuvent augmenter rapidement car chaque nouvelle requête au modèle inclut à nouveau le contexte de la conversation actuelle. Utilisez `used-tokens` si vous souhaitez connaître la taille du prompt actuel plutôt que la consommation cumulative de la session.

### Exemple de sortie

Avec les éléments par défaut, la ligne d'état ressemble à ceci :

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### Personnalisation via la boîte de dialogue

L'exécution de `/statusline` ouvre une boîte de dialogue interactive à sélection multiple :

```
┌ Configurer la ligne d'état ───────────────────────────────────┐
│ Sélectionnez les éléments à afficher dans la ligne d'état.    │
│                                                               │
│ Tapez pour rechercher                                         │
│ >                                                             │
│                                                               │
│ [x] Utiliser les couleurs du thème  Applique les couleurs du /theme actif│
│ ───────────────────────                                       │
│ [x] model-with-reasoning    Nom du modèle actuel avec raisonnement │
│ [ ] model-only              Nom du modèle actuel sans raisonnement │
│ [x] git-branch              Branche Git actuelle si disponible │
│ [x] context-remaining       Pourcentage de contexte restant   │
│ ...                                                           │
│                                                               │
│ Aperçu                                                        │
│ qwen-3-235b high | main | Context 65.7% left                 │
│                                                               │
│ Utilisez haut/bas pour naviguer, espace pour sélectionner, entrée pour confirmer │
└───────────────────────────────────────────────────────────────┘
```

- Tapez pour filtrer les éléments par nom ou description
- Un aperçu en direct se met à jour lorsque vous activez/désactivez les éléments
- Appuyez sur Entrée pour enregistrer la configuration

---

## Mode commande

Le mode commande exécute une commande shell dont la sortie standard (stdout) est affichée dans la ligne d'état. La commande reçoit un contexte JSON structuré via stdin pour une sortie adaptée à la session.

### Prérequis

- [`jq`](https://jqlang.github.io/jq/) est recommandé pour analyser l'entrée JSON (installez-le via `brew install jq`, `apt install jq`, etc.)
- Les commandes simples qui n'ont pas besoin de données JSON (ex. `git branch --show-current`) fonctionnent sans `jq`

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

| Field                  | Type        | Required | Description                                                                                                                       |
| ---------------------- | ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | Oui      | Doit être `"command"`                                                                                                             |
| `command`              | string      | Oui      | Commande shell à exécuter. Reçoit le JSON via stdin, la sortie standard est affichée (jusqu'à 2 lignes).                          |
| `refreshInterval`      | number      | Non      | Réexécute la commande toutes les N secondes (minimum 1). Utile pour les données qui changent sans événement d'état de l'Agent (horloge, quota, uptime). |
| `respectUserColors`    | boolean     | Non      | Préserve les codes couleur ANSI dans la sortie de la commande au lieu d'appliquer le style estompé du pied de page. La valeur par défaut est `false`. |
| `hideContextIndicator` | boolean     | Non      | Masque l'indicateur d'utilisation du contexte intégré dans la section droite du pied de page. La valeur par défaut est `false`.   |

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

| Field                                 | Type             | Description                                                                        |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | Identifiant unique de la session                                                   |
| `version`                             | string           | Version de Qwen Code                                                               |
| `model.display_name`                  | string           | Nom du modèle actuel                                                               |
| `context_window.context_window_size`  | number           | Taille totale de la fenêtre de contexte en tokens                                  |
| `context_window.used_percentage`      | number           | Utilisation de la fenêtre de contexte en pourcentage (0–100)                       |
| `context_window.remaining_percentage` | number           | Espace restant dans la fenêtre de contexte en pourcentage (0–100)                  |
| `context_window.current_usage`        | number           | Nombre de tokens du dernier appel API (taille du contexte actuel)                  |
| `context_window.total_input_tokens`   | number           | Total des tokens d'entrée consommés cette session                                  |
| `context_window.total_output_tokens`  | number           | Total des tokens de sortie consommés cette session                                 |
| `workspace.current_dir`               | string           | Répertoire de travail actuel                                                       |
| `git`                                 | object \| absent | Présent uniquement à l'intérieur d'un dépôt git.                                   |
| `git.branch`                          | string           | Nom de la branche actuelle                                                         |
| `worktree`                            | object \| absent | Présent uniquement à l'intérieur d'un worktree actif (créé par `enter_worktree`).  |
| `worktree.name`                       | string           | Nom slug du worktree                                                               |
| `worktree.path`                       | string           | Chemin absolu vers le répertoire du worktree                                       |
| `worktree.branch`                     | string           | Branche extraite (checkout) dans le worktree                                       |
| `worktree.original_cwd`               | string           | Répertoire de travail avant d'entrer dans le worktree                              |
| `worktree.original_branch`            | string           | Branche qui était active avant d'entrer dans le worktree                           |
| `metrics.models.<id>.api`             | object           | Statistiques API par modèle : `total_requests`, `total_errors`, `total_latency_ms` |
| `metrics.models.<id>.tokens`          | object           | Utilisation des tokens par modèle : `prompt`, `completion`, `total`, `cached`, `thoughts` |
| `metrics.files`                       | object           | Statistiques des modifications de fichiers : `total_lines_added`, `total_lines_removed` |
| `vim`                                 | object \| absent | Présent uniquement lorsque le mode vim est activé. Contient `mode` (`"INSERT"` ou `"NORMAL"`). |

> **Important :** stdin ne peut être lu qu'une seule fois. Stockez-le toujours dans une variable d'abord : `input=$(cat)`.

### Exemples

#### Modèle et utilisation des tokens

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

> Remarque : Le champ `git.branch` est fourni directement dans l'entrée JSON — pas besoin de faire appel à `git` via le shell.

#### Statistiques des modifications de fichiers

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

Sortie : `+120/-30 lines`

#### Horloge en direct et branche Git

Utilisez `refreshInterval` lorsque la ligne d'état affiche des données qui changent sans événement de l'Agent (ex. l'horloge, l'uptime, ou les compteurs de rate-limit) :

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

Sortie (actualisée chaque seconde) : `14:32:07  (main)`

#### Fichier de script pour les commandes complexes

Pour les commandes plus longues, enregistrez un fichier de script dans `~/.qwen/statusline-command.sh` :

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

- **Déclencheurs de mise à jour** : La ligne d'état se met à jour lorsque le modèle change, qu'un nouveau message est envoyé (le nombre de tokens change), que le mode vim est activé/désactivé, que la branche git change, que des appels d'outils se terminent, ou que des fichiers sont modifiés. Les mises à jour sont temporisées (délai de 300 ms).
- **Sortie** : Jusqu'à 2 lignes. Chaque ligne est affichée sous la forme d'une rangée distincte dans la section gauche du pied de page. Les lignes qui dépassent la largeur disponible sont tronquées.
- **Rechargement à chaud** : Les modifications de `ui.statusLine` dans les paramètres prennent effet immédiatement — pas besoin de redémarrer.
- **Suppression** : Supprimez la clé `ui.statusLine` des paramètres pour la désactiver. L'indication "? pour les raccourcis" réapparaît.

**Mode commande uniquement :**

- **Délai d'expiration (Timeout)** : Les commandes qui prennent plus de 5 secondes sont tuées. La ligne d'état s'efface en cas d'échec.
- **Actualisation** : Définissez `refreshInterval` (en secondes) pour réexécuter la commande périodiquement — utile pour les données qui changent sans événement de l'Agent (horloge, limites de débit, statut de build).
- **Shell** : Les commandes s'exécutent via `/bin/sh` sur macOS/Linux. Sur Windows, `cmd.exe` est utilisé par défaut — enveloppez les commandes POSIX avec `bash -c "..."` ou pointez vers un script bash (ex. `bash ~/.qwen/statusline-command.sh`).

**Mode prédéfini uniquement :**

- **Aucune dépendance externe** : Les éléments prédéfinis sont calculés en interne — pas de commandes shell, pas de `jq`, pas de délai d'expiration.
- **Intégration du thème** : Lorsque `useThemeColors` est à `true` (par défaut), le texte de la ligne d'état utilise la couleur du `/theme` actif. Lorsque c'est `false`, le style estompé du pied de page est appliqué.
- **Recherche de PR** : L'élément `pull-request-number` exécute `gh pr view` en arrière-plan (délai de 2 s). Il ne se déclenche que lorsque la branche change, pas à chaque mise à jour.

## Dépannage

| Problem                     | Cause                          | Fix                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| La ligne d'état ne s'affiche pas | Configuration au mauvais chemin | Doit être sous `ui.statusLine`, et non `statusLine` à la racine                                                                                                                                                                                                                                                                                                                                        |
| Sortie vide (mode commande) | La commande échoue silencieusement | Testez manuellement : `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| Données obsolètes (mode commande) | Aucun déclencheur n'a été activé | Envoyez un message ou changez de modèle pour déclencher une mise à jour — ou définissez `refreshInterval` pour réexécuter la commande périodiquement                                                                                                                                                                                                                                                   |
| Commande trop lente         | Script complexe                | Optimisez le script ou déplacez le travail lourd vers un cache en arrière-plan                                                                                                                                                                                                                                                                                                                         |
| Éléments prédéfinis manquants | Les éléments conditionnels n'ont pas de données | `git-branch` est masqué hors des dépôts git ; `context-used` est masqué lorsque l'utilisation est à 0 ; `branch-changes` est masqué lorsqu'aucun fichier n'a changé. C'est normal — les éléments apparaissent une fois que leurs données sont disponibles                                                                                                                                             |
| Le numéro de PR ne s'affiche pas | Le CLI `gh` n'est pas installé | Installez [GitHub CLI](https://cli.github.com/) et authentifiez-vous avec `gh auth login`. La recherche s'exécute avec un délai de 2 s                                                                                                                                                                                                                                                                 |