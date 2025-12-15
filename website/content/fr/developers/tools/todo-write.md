# Outil Todo Write (`todo_write`)

Ce document décrit l'outil `todo_write` pour Qwen Code.

## Description

Utilisez `todo_write` pour créer et gérer une liste de tâches structurée pour votre session de codage actuelle. Cet outil aide l'assistant IA à suivre les progrès et organiser les tâches complexes, vous offrant une visibilité sur le travail en cours.

### Arguments

`todo_write` prend un seul argument :

- `todos` (tableau, requis) : Un tableau d'éléments todo, où chaque élément contient :
  - `content` (chaîne, requis) : La description de la tâche.
  - `status` (chaîne, requis) : Le statut actuel (`pending`, `in_progress`, ou `completed`).
  - `activeForm` (chaîne, requis) : La forme progressive décrivant ce qui est en train d'être fait (par exemple, "Exécution des tests", "Construction du projet").

## Comment utiliser `todo_write` avec Qwen Code

L'assistant IA utilisera automatiquement cet outil lorsqu'il travaille sur des tâches complexes comportant plusieurs étapes. Vous n'avez pas besoin de le demander explicitement, mais vous pouvez demander à l'assistant de créer une liste de tâches si vous souhaitez voir l'approche prévue pour votre demande.

L'outil stocke les listes de tâches dans votre répertoire personnel (`~/.qwen/todos/`) avec des fichiers spécifiques à chaque session, afin que chaque session de codage conserve sa propre liste de tâches.

## Quand l'IA utilise cet outil

L'assistant utilise `todo_write` pour :

- Les tâches complexes nécessitant plusieurs étapes
- Les implémentations de fonctionnalités comportant plusieurs composants
- Les opérations de refactorisation sur plusieurs fichiers
- Tout travail impliquant 3 actions distinctes ou plus

L'assistant n'utilisera pas cet outil pour les tâches simples d'une seule étape ou les demandes purement informatives.

### Exemples de `todo_write`

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

- **Utilisation automatique :** L'assistant IA gère automatiquement les listes de tâches pendant les tâches complexes.
- **Visibilité de la progression :** Vous verrez les listes de tâches mises à jour en temps réel au fur et à mesure de l'avancement du travail.
- **Isolation des sessions :** Chaque session de codage possède sa propre liste de tâches qui n'interfère pas avec les autres.