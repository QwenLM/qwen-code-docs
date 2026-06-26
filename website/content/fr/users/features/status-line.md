# Barre d'état

> Affichez des informations personnalisées dans le pied de page.

La barre d'état affiche des informations contextuelles propres à la session — nom du modèle, utilisation des tokens, branche Git, etc. — dans la partie gauche du pied de page. Deux modes de configuration sont disponibles :

- **Mode préréglé (preset)** — choisissez parmi des éléments de données intégrés via un dialogue interactif ou un fichier JSON. Aucun script requis.
- **Mode commande (command)** — exécutez une commande shell qui reçoit un contexte JSON structuré sur l'entrée standard. Flexibilité totale pour un formatage personnalisé.

```
Barre d'état sur une seule ligne (mode d'approbation par défaut — 1 ligne) :
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← barre d'état
└─────────────────────────────────────────────────────────────────┘

Barre d'état multi-lignes (jusqu'à 2 lignes — 2 lignes) :
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← barre d'état 1
│  ████████░░░░░░░░░░ 34% context                                │  ← barre d'état 2
└─────────────────────────────────────────────────────────────────┘

Barre d'état multi-lignes + mode non par défaut (3 lignes max) :
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← barre d'état 1
│  ████████░░░░░░░░░░ 34% context                                │  ← barre d'état 2
│  auto-accept edits (shift + tab to cycle)                       │  ← indicateur de mode
└─────────────────────────────────────────────────────────────────┘
```

Lorsqu'elle est configurée, la barre d'état remplace l'indice par défaut « ? for shortcuts ». Les messages haute priorité (invites Ctrl+C/D de sortie, Esc, mode INSERT vim) prennent temporairement le pas sur la barre d'état. Le texte de la barre d'état est tronqué pour s'adapter à la largeur disponible.

## Configuration rapide

La façon la plus simple de configurer une barre d'état est la commande `/statusline`. Elle ouvre un dialogue interactif dans lequel vous pouvez sélectionner des éléments prédéfinis, activer/désactiver les couleurs du thème et voir un aperçu en direct :

```
/statusline
```

Cette commande ouvre le configurateur du mode préréglé. Utilisez les touches fléchées pour naviguer, la barre d'espace pour activer/désactiver les éléments et Entrée pour confirmer. Votre sélection est automatiquement sauvegardée dans les paramètres.

Vous pouvez également donner des instructions spécifiques à `/statusline` pour lui faire générer une configuration en mode commande :

```
/statusline show model name and context usage percentage
```

---

## Mode préréglé (preset)

Le mode préréglé fournit un ensemble d'éléments de données intégrés que vous pouvez sélectionner et combiner — pas de commandes shell, pas de `jq`, pas de script. Les éléments sont rendus sous la forme `élément1 | élément2 | élément3` sur une seule ligne.

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

| Champ                  | Type       | Obligatoire | Description                                                                                                              |
| ---------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `type`                 | `"preset"` | Oui         | Doit être `"preset"`                                                                                                     |
| `items`                | string[]   | Oui         | Liste ordonnée des identifiants des éléments prédéfinis à afficher (voir tableau ci-dessous). Les éléments sont joints avec `\|` comme séparateur. |
| `useThemeColors`       | boolean    | Non         | Applique la couleur du `/theme` actif au texte de la barre d'état. Par défaut : `true`.                                  |
| `hideContextIndicator` | boolean    | Non         | Masque l'indicateur d'utilisation du contexte intégré dans la partie droite du pied de page. Par défaut : `false`.       |

### Éléments prédéfinis disponibles

| Identifiant              | Par défaut | Description                                                             |
| ------------------------ | ---------- | ----------------------------------------------------------------------- |
| `model-with-reasoning`   | Oui        | Nom du modèle actuel avec niveau de raisonnement (ex. `qwen-3-235b high`) |
| `model`                  |            | Nom du modèle actuel sans niveau de raisonnement                        |
| `git-branch`             | Oui        | Nom de la branche Git actuelle (caché hors d'un dépôt Git)              |
| `context-remaining`      | Oui        | Pourcentage restant de la fenêtre de contexte (ex. `Context 65.7% left`) |
| `total-input-tokens`     |            | Total cumulé des tokens d'entrée dans la session (ex. `30.0k total in`) |
| `total-output-tokens`    |            | Total cumulé des tokens de sortie dans la session (ex. `5.0k total out`) |
| `current-dir`            | Oui        | Répertoire de travail actuel                                             |
| `project-name`           |            | Nom du projet (nom du répertoire de travail)                            |
| `pull-request-number`    |            | Numéro de PR ouvert pour la branche actuelle (nécessite l'outil `gh`)   |
| `branch-changes`         |            | Statistiques des modifications de fichiers de la session (ex. `+120 -30`) |
| `context-used`           | Oui        | Pourcentage de la fenêtre de contexte utilisé (ex. `Context 34.3% used`) |
| `run-state`              |            | État compact de la session (`Ready`, `Working` ou `Confirm`)            |
| `qwen-version`           |            | Version de Qwen Code (ex. `v0.14.1`)                                    |
| `context-window-size`    |            | Taille totale de la fenêtre de contexte (ex. `131.1k window`)           |
| `used-tokens`            |            | Nombre actuel de tokens d'invite (ex. `45.0k used`)                     |
| `session-id`             |            | Identifiant de la session actuelle                                      |

Les éléments marqués **Par défaut** sont pré-sélectionnés lorsque vous ouvrez le dialogue `/statusline` pour la première fois.

`total-input-tokens` et `total-output-tokens` sont des totaux cumulés par session. Ils additionnent l'utilisation de tokens au fil des tours, donc les tokens d'entrée peuvent augmenter rapidement car chaque nouvelle requête au modèle réinclut le contexte actuel de la conversation. Utilisez `used-tokens` lorsque vous souhaitez la taille de l'invite actuelle plutôt que le cumul de la session.

### Exemple de résultat

Avec les éléments par défaut, la barre d'état ressemble à :

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### Personnalisation via le dialogue

Exécuter `/statusline` ouvre un dialogue interactif de sélection multiple :

```
┌ Configurer la barre d'état ────────────────────────────────────┐
│ Sélectionnez les éléments à afficher dans la barre d'état.     │
│                                                                │
│ Tapez pour rechercher                                          │
│ >                                                              │
│                                                                │
│ [x] Utiliser les couleurs du thème    Appliquer les couleurs du│
│                                      thème actif               │
│ ───────────────────────                                        │
│ [x] model-with-reasoning    Nom du modèle actuel avec raisonn. │
│ [ ] model-only              Nom du modèle actuel sans raisonn. │
│ [x] git-branch              Branche Git actuelle, si disponible│
│ [x] context-remaining       Pourcentage de contexte restant    │
│ ...                                                            │
│                                                                │
│ Aperçu                                                         │
│ qwen-3-235b high | main | Context 65.7% left                  │
│                                                                │
│ Utilisez ↑/↓ pour naviguer, espace pour sélectionner, Entrée  │
│ pour confirmer                                                 │
└────────────────────────────────────────────────────────────────┘
```

- Tapez pour filtrer les éléments par nom ou description
- Un aperçu en direct se met à jour lorsque vous activez/désactivez des éléments
- Appuyez sur Entrée pour sauvegarder la configuration

---

## Mode commande (command)

Le mode commande exécute une commande shell dont la sortie standard est affichée dans la barre d'état. La commande reçoit un contexte JSON structuré via stdin pour une sortie tenant compte du contexte de la session.

### Prérequis

- [`jq`](https://jqlang.github.io/jq/) est recommandé pour analyser l'entrée JSON (installez-le avec `brew install jq`, `apt install jq`, etc.)
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

| Champ                  | Type        | Obligatoire | Description                                                                                                                         |
| ---------------------- | ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | Oui         | Doit être `"command"`                                                                                                               |
| `command`              | string      | Oui         | Commande shell à exécuter. Reçoit du JSON sur stdin, stdout est affiché (jusqu'à 2 lignes).                                         |
| `refreshInterval`      | number      | Non         | Relance la commande toutes les N secondes (minimum 1). Utile pour des données qui changent sans événement d'état de l'Agent (horloge, quota, uptime). |
| `respectUserColors`    | boolean     | Non         | Conserve les codes de couleur ANSI dans la sortie de la commande au lieu d'appliquer un style de pied de page atténué. Par défaut : `false`. |
| `hideContextIndicator` | boolean     | Non         | Masque l'indicateur d'utilisation du contexte intégré dans la partie droite du pied de page. Par défaut : `false`.                   |

### Entrée JSON

La commande reçoit un objet JSON sur stdin avec les champs suivants :

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

| Champ                                | Type             | Description                                                                  |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `session_id`                          | string           | Identifiant unique de la session                                             |
| `version`                             | string           | Version de Qwen Code                                                         |
| `model.display_name`                  | string           | Nom du modèle actuel                                                         |
| `context_window.context_window_size`  | number           | Taille totale de la fenêtre de contexte en tokens                            |
| `context_window.used_percentage`      | number           | Pourcentage d'utilisation de la fenêtre de contexte (0–100)                  |
| `context_window.remaining_percentage` | number           | Pourcentage restant de la fenêtre de contexte (0–100)                        |
| `context_window.current_usage`        | number           | Nombre de tokens du dernier appel API (taille actuelle du contexte)          |
| `context_window.total_input_tokens`   | number           | Total des tokens d'entrée consommés durant cette session                     |
| `context_window.total_output_tokens`  | number           | Total des tokens de sortie consommés durant cette session                    |
| `workspace.current_dir`               | string           | Répertoire de travail actuel                                                 |
| `git`                                 | object \| absent | Présent uniquement dans un dépôt Git.                                        |
| `git.branch`                          | string           | Nom de la branche actuelle                                                   |
| `worktree`                            | object \| absent | Présent uniquement lorsque vous êtes dans un worktree actif (créé par `enter_worktree`). |
| `worktree.name`                       | string           | Nom abrégé du worktree                                                       |
| `worktree.path`                       | string           | Chemin absolu vers le répertoire du worktree                                 |
| `worktree.branch`                     | string           | Branche extraite dans le worktree                                            |
| `worktree.original_cwd`               | string           | Répertoire de travail avant d'entrer dans le worktree                        |
| `worktree.original_branch`            | string           | Branche active avant d'entrer dans le worktree                               |
| `metrics.models.<id>.api`             | object           | Statistiques API par modèle : `total_requests`, `total_errors`, `total_latency_ms` |
| `metrics.models.<id>.tokens`          | object           | Utilisation des tokens par modèle : `prompt`, `completion`, `total`, `cached`, `thoughts` |
| `metrics.files`                       | object           | Statistiques de modifications de fichiers : `total_lines_added`, `total_lines_removed` |
| `vim`                                 | object \| absent | Présent uniquement lorsque le mode vim est activé. Contient `mode` (`"INSERT"` ou `"NORMAL"`). |

> **Important :** stdin ne peut être lu qu'une seule fois. Stockez-le toujours dans une variable en premier : `input=$(cat)`.

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

Résultat : `qwen-3-235b  ctx:34%`

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

Résultat : `my-project (main)`

> Note : le champ `git.branch` est fourni directement dans l'entrée JSON — pas besoin de lancer `git` séparément.

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

Résultat : `+120/-30 lines`

#### Horloge en direct et branche Git

Utilisez `refreshInterval` lorsque la barre d'état affiche des données qui changent sans événement de l'Agent (ex. l'horloge, l'uptime ou les compteurs de limites de débit) :

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

Résultat (actualisé chaque seconde) : `14:32:07  (main)`

#### Fichier de script pour les commandes complexes

Pour les commandes plus longues, sauvegardez un fichier de script à `~/.qwen/statusline-command.sh` :

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

- **Déclencheurs de mise à jour** : La barre d'état se met à jour lorsque le modèle change, qu'un nouveau message est envoyé (le nombre de tokens change), que le mode vim est activé/désactivé, que la branche Git change, que des appels d'outils sont terminés ou que des fichiers sont modifiés. Les mises à jour sont anti-rebond (debounce) à 300 ms.
- **Sortie** : Jusqu'à 2 lignes. Chaque ligne est affichée comme une ligne séparée dans la partie gauche du pied de page. Les lignes qui dépassent la largeur disponible sont tronquées.
- **Rechargement à chaud** : Les modifications de `ui.statusLine` dans les paramètres prennent effet immédiatement — aucun redémarrage nécessaire.
- **Suppression** : Supprimez la clé `ui.statusLine` des paramètres pour désactiver la barre d'état. L'indice « ? for shortcuts » réapparaît.

**Mode commande uniquement :**

- **Délai d'attente (timeout)** : Les commandes qui prennent plus de 5 secondes sont tuées. La barre d'état s'efface en cas d'échec.
- **Actualisation** : Définissez `refreshInterval` (en secondes) pour relancer la commande sur une minuterie — utile pour des données qui changent sans événement de l'Agent (horloge, limites de débit, état de construction).
- **Shell** : Les commandes sont exécutées via `/bin/sh` sous macOS/Linux. Sous Windows, `cmd.exe` est utilisé par défaut — enveloppez les commandes POSIX avec `bash -c "..."` ou pointez vers un script bash (ex. `bash ~/.qwen/statusline-command.sh`).

**Mode préréglé uniquement :**

- **Aucune dépendance externe** : Les éléments prédéfinis sont calculés en interne — pas de commandes shell, pas de `jq`, pas de timeout.
- **Intégration du thème** : Lorsque `useThemeColors` est `true` (par défaut), le texte de la barre d'état utilise la couleur du `/theme` actif. Lorsqu'il est `false`, un style atténué de pied de page est appliqué.
- **Recherche de PR** : L'élément `pull-request-number` exécute `gh pr view` en arrière-plan (timeout de 2s). Il ne se déclenche que lorsque la branche change, pas à chaque mise à jour.

## Dépannage

| Problème                       | Cause                             | Solution                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La barre d'état ne s'affiche pas | Configuration au mauvais endroit  | Doit être sous `ui.statusLine`, pas à la racine avec `statusLine`                                                                                                                                                                                                                                                                                                                                 |
| Sortie vide (mode commande)    | La commande échoue silencieusement | Testez manuellement : `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'votre_commande'` |
| Données obsolètes (mode commande) | Aucun déclencheur ne s'est produit | Envoyez un message ou changez de modèle pour déclencher une mise à jour — ou définissez `refreshInterval` pour relancer la commande sur une minuterie                                                                                                                                                                                                                                             |
| Commande trop lente            | Script complexe                    | Optimisez le script ou déplacez le travail lourd dans un cache en arrière-plan                                                                                                                                                                                                                                                                                                                   |
| Éléments prédéfinis manquants  | Éléments conditionnels sans donnée | `git-branch` est caché hors des dépôts Git ; `context-used` est caché lorsque l'utilisation est 0 ; `branch-changes` est caché lorsque aucun fichier n'a été modifié. C'est normal — les éléments apparaissent dès que leurs données sont disponibles                                                                                                                                                              |
| Le numéro de PR ne s'affiche pas | Outil CLI `gh` non installé       | Installez [GitHub CLI](https://cli.github.com/) et authentifiez-vous avec `gh auth login`. La recherche a un timeout de 2s.                                                                                                                                                                                                                                                                      |