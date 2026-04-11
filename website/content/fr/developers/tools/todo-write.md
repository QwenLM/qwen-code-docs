# Outil Todo Write (`todo_write`)

Ce document décrit l'outil `todo_write` pour Qwen Code.

## Description

Utilisez `todo_write` pour créer et gérer une liste de `todo` structurée pour votre session de codage actuelle. Cet outil aide l'assistant IA à suivre la progression et à organiser les tâches complexes, en vous offrant une visibilité sur le travail en cours.

### Arguments

`todo_write` prend un seul argument :

- `todos` (array, obligatoire) : Un tableau d'éléments `todo`, où chaque élément contient :
  - `content` (string, obligatoire) : La description du `todo`.
  - `status` (string, obligatoire) : Le statut actuel (`pending`, `in_progress` ou `completed`).
  - `activeForm` (string, obligatoire) : La forme au présent continu décrivant l'action en cours (par ex. "Running tests", "Building the project").

## Comment utiliser `todo_write` avec Qwen Code

L'assistant IA utilisera automatiquement cet outil lorsqu'il travaillera sur des tâches complexes en plusieurs étapes. Vous n'avez pas besoin de le demander explicitement, mais vous pouvez inviter l'assistant à créer une liste de `todo` si vous souhaitez connaître l'approche prévue pour votre demande.

L'outil stocke les listes de `todo` dans votre répertoire personnel (`~/.qwen/todos/`) sous forme de fichiers spécifiques à chaque session, ce qui permet à chaque session de codage de conserver sa propre liste.

## Quand l'IA utilise cet outil

L'assistant utilise `todo_write` pour :

- Les tâches complexes nécessitant plusieurs étapes
- Les implémentations de fonctionnalités comportant plusieurs composants
- Les opérations de refactoring sur plusieurs fichiers
- Tout travail impliquant 3 actions distinctes ou plus

L'assistant n'utilisera pas cet outil pour des tâches simples en une seule étape ou pour des demandes purement informatives.

### Exemples d'utilisation de `todo_write`

Création d'un plan d'implémentation de fonctionnalité :

```
todo_write(todos=[
  {
    "content": "Create user preferences model",
    "status": "pending",
    "activeForm": "Creating user preferences model"
  },
  {
    "content": "Add API endpoints for preferences",
    "status": "pending",
    "activeForm": "Adding API endpoints for preferences"
  },
  {
    "content": "Implement frontend components",
    "status": "pending",
    "activeForm": "Implementing frontend components"
  }
])
```

## Notes importantes

- **Utilisation automatique :** L'assistant IA gère automatiquement les listes de `todo` lors des tâches complexes.
- **Visibilité de la progression :** Vous verrez les listes de `todo` se mettre à jour en temps réel au fur et à mesure de l'avancement du travail.
- **Isolation des sessions :** Chaque session de codage dispose de sa propre liste de `todo`, sans interférence avec les autres.