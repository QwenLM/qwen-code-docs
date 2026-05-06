# Barre d'état

> Affichez des informations personnalisées dans le pied de page à l'aide d'une commande shell.

La barre d'état vous permet d'exécuter une commande shell dont la sortie s'affiche dans la section gauche du pied de page. La commande reçoit un contexte JSON structuré via stdin, ce qui lui permet d'afficher des informations liées à la session, comme le modèle actuel, l'utilisation des tokens, la branche git, ou tout autre élément scriptable.

```
Single-line status (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
└─────────────────────────────────────────────────────────────────┘

Multi-line status (up to 2 lines — 2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
└─────────────────────────────────────────────────────────────────┘

Multi-line status + non-default mode (3 rows max):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

Une fois configurée, la barre d'état remplace l'indication par défaut « ? pour les raccourcis ». Les messages prioritaires (invitations de sortie Ctrl+C/D, Esc, mode INSERT de vim) remplacent temporairement la barre d'état. Le texte de la barre d'état est tronqué pour tenir dans la largeur disponible.

## Prérequis

- [`jq`](https://jqlang.github.io/jq/) est recommandé pour analyser l'entrée JSON (installez-le via `brew install jq`, `apt install jq`, etc.)
- Les commandes simples qui ne nécessitent pas de données JSON (ex. `git branch --show-current`) fonctionnent sans `jq`

## Configuration rapide

La méthode la plus simple pour configurer une barre d'état est d'utiliser la commande `/statusline`. Elle lance un agent de configuration qui lit votre configuration shell PS1 et génère une barre d'état correspondante :

```
/statusline
```

Vous pouvez également lui fournir des instructions spécifiques :

```
/statusline show model name and context usage percentage
```

## Configuration manuelle

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

| Champ             | Type        | Obligatoire | Description                                                                                                                       |
| ----------------- | ----------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `"command"` | Oui         | Doit être `"command"`                                                                                                             |
| `command`         | string      | Oui         | Commande shell à exécuter. Reçoit le JSON via stdin, la sortie stdout est affichée (jusqu'à 2 lignes).                            |
| `refreshInterval` | number      | Non         | Réexécute la commande toutes les N secondes (minimum 1). Utile pour les données qui changent sans événement d'état de l'Agent (horloge, quota, temps de fonctionnement). |

## Entrée JSON

La commande reçoit un objet JSON via stdin contenant les champs suivants :

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

| Champ                                 | Type             | Description                                                                        |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | Identifiant unique de la session                                                   |
| `version`                             | string           | Version de Qwen Code                                                               |
| `model.display_name`                  | string           | Nom du modèle actuel                                                               |
| `context_window.context_window_size`  | number           | Taille totale de la fenêtre de contexte en tokens                                  |
| `context_window.used_percentage`      | number           | Utilisation de la fenêtre de contexte en pourcentage (0–100)                       |
| `context_window.remaining_percentage` | number           | Espace restant dans la fenêtre de contexte en pourcentage (0–100)                  |
| `context_window.current_usage`        | number           | Nombre de tokens de la dernière requête API (taille actuelle du contexte)          |
| `context_window.total_input_tokens`   | number           | Total des tokens d'entrée consommés durant cette session                           |
| `context_window.total_output_tokens`  | number           | Total des tokens de sortie consommés durant cette session                          |
| `workspace.current_dir`               | string           | Répertoire de travail actuel                                                       |
| `git`                                 | object \| absent | Présent uniquement à l'intérieur d'un dépôt git.                                   |
| `git.branch`                          | string           | Nom de la branche actuelle                                                         |
| `metrics.models.<id>.api`             | object           | Statistiques API par modèle : `total_requests`, `total_errors`, `total_latency_ms` |
| `metrics.models.<id>.tokens`          | object           | Utilisation des tokens par modèle : `prompt`, `completion`, `total`, `cached`, `thoughts` |
| `metrics.files`                       | object           | Statistiques de modification de fichiers : `total_lines_added`, `total_lines_removed` |
| `vim`                                 | object \| absent | Présent uniquement lorsque le mode vim est activé. Contient `mode` (`"INSERT"` ou `"NORMAL"`). |

> **Important :** stdin ne peut être lu qu'une seule fois. Stockez-le toujours d'abord dans une variable : `input=$(cat)`.

## Exemples

### Modèle et utilisation des tokens

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

### Branche git + répertoire

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

> Remarque : Le champ `git.branch` est fourni directement dans l'entrée JSON — inutile d'appeler `git` via le shell.

### Statistiques de modification de fichiers

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

### Horloge en temps réel et branche git

Utilisez `refreshInterval` lorsque la barre d'état affiche des données qui changent sans événement de l'Agent (ex. l'horloge, le temps de fonctionnement ou les compteurs de limites de débit) :

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

### Fichier script pour les commandes complexes

Pour les commandes plus longues, enregistrez un fichier script dans `~/.qwen/statusline-command.sh` :

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

- **Déclencheurs de mise à jour** : La barre d'état se met à jour lorsque le modèle change, qu'un nouveau message est envoyé (le nombre de tokens change), que le mode vim est activé/désactivé, que la branche git change, que des appels d'outils se terminent ou que des modifications de fichiers surviennent. Les mises à jour sont anti-rebondies (300 ms). Définissez `refreshInterval` (en secondes) pour réexécuter la commande périodiquement — utile pour les données qui changent sans événement de l'Agent (horloge, limites de débit, statut de build).
- **Délai d'expiration** : Les commandes qui prennent plus de 5 secondes sont interrompues. La barre d'état est effacée en cas d'échec.
- **Sortie** : La sortie multiligne est prise en charge (jusqu'à 2 lignes ; les lignes supplémentaires sont ignorées). Chaque ligne est affichée sur une rangée distincte avec des couleurs atténuées dans la section gauche du pied de page. Les lignes qui dépassent la largeur disponible sont tronquées.
- **Rechargement à chaud** : Les modifications apportées à `ui.statusLine` dans les paramètres prennent effet immédiatement — aucun redémarrage n'est nécessaire.
- **Shell** : Les commandes s'exécutent via `/bin/sh` sur macOS/Linux. Sur Windows, `cmd.exe` est utilisé par défaut — encapsulez les commandes POSIX avec `bash -c "..."` ou pointez vers un script bash (ex. `bash ~/.qwen/statusline-command.sh`).
- **Suppression** : Supprimez la clé `ui.statusLine` des paramètres pour désactiver la fonction. L'indication « ? pour les raccourcis » réapparaît.

## Dépannage

| Problème                 | Cause                  | Solution                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| La barre d'état ne s'affiche pas | Configuration au mauvais chemin   | Doit se trouver sous `ui.statusLine`, et non `statusLine` à la racine                                                                                                                                                                                                                                                                                                                                             |
| Sortie vide            | La commande échoue silencieusement | Testez manuellement : `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'votre_commande'` |
| Données obsolètes              | Aucun déclencheur activé       | Envoyez un message ou changez de modèle pour déclencher une mise à jour — ou définissez `refreshInterval` pour réexécuter la commande périodiquement                                                                                                                                                                                                                                                                                       |
| Commande trop lente        | Script complexe         | Optimisez le script ou déplacez les traitements lourds vers un cache en arrière-plan                                                                                                                                                                                                                                                                                                                                           |