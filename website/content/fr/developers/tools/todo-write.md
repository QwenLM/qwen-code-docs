# Outil Todo Write (`todo_write`)

Ce document décrit l'outil `todo_write` pour Qwen Code.

## Description

Utilisez `todo_write` pour créer et gérer une liste de tâches structurée pour votre session de codage en cours. Cet outil aide l'assistant IA à suivre la progression et à organiser les tâches complexes, vous offrant une visibilité sur le travail en cours.

L'outil est désactivé par défaut. Activez-le dans `settings.json` et redémarrez Qwen Code :

```json
{
  "tools": {
    "todoWrite": {
      "enabled": true
    }
  }
}
```

### Arguments

`todo_write` prend un argument :

- `todos` (array, required) : Un tableau d'éléments de tâches, où chaque élément contient :
  - `content` (string, required) : La description de la tâche.
  - `status` (string, required) : Le statut actuel (`pending`, `in_progress`, ou `completed`).
  - `id` (string, required) : Un identifiant unique pour l'élément de tâche.

## Comment utiliser `todo_write` avec Qwen Code

Lorsque l'outil est activé, l'assistant IA peut l'utiliser pour des tâches complexes et multi-étapes. Vous pouvez également demander à l'assistant de créer une liste de tâches si vous souhaitez voir l'approche planifiée pour votre demande.

L'outil stocke les listes de tâches dans votre répertoire personnel (`~/.qwen/todos/`) avec des fichiers spécifiques à chaque session, afin que chaque session de codage maintienne sa propre liste de tâches.

## Quand l'IA utilise cet outil

L'assistant utilise `todo_write` pour :

- Les tâches complexes nécessitant plusieurs étapes
- Les implémentations de fonctionnalités avec plusieurs composants
- Les opérations de refactoring sur plusieurs fichiers
- Tout travail impliquant 3 actions distinctes ou plus

L'assistant n'utilisera pas cet outil pour des tâches simples en une seule étape ou des demandes purement informatives.

### Exemples `todo_write`

Création d'un plan d'implémentation de fonctionnalité :

```
todo_write(todos=[
  {
    "id": "1",
    "content": "Create user preferences model",
    "status": "pending"
  },
  {
    "id": "2",
    "content": "Add API endpoints for preferences",
    "status": "pending"
  },
  {
    "id": "3",
    "content": "Implement frontend components",
    "status": "pending"
  }
])
```

## Notes importantes

- **Opt-in :** Définissez `tools.todoWrite.enabled` sur `true` et redémarrez Qwen Code avant d'utiliser l'outil.
- **Utilisation automatique une fois activé :** L'assistant IA gère les listes de tâches pendant les tâches complexes.
- **Visibilité de la progression :** Vous verrez les listes de tâches mises à jour en temps réel au fur et à mesure de l'avancement du travail.
- **Isolation des sessions :** Chaque session de codage a sa propre liste de tâches qui n'interfère pas avec les autres.