# Outil Todo Write (`todo_write`)

Ce document décrit l'outil `todo_write` pour Qwen Code.

## Description

Utilisez `todo_write` pour créer et gérer une liste de tâches structurée pour votre session de codage en cours. Cet outil aide l'assistant IA à suivre la progression et à organiser des tâches complexes, en vous donnant une visibilité sur le travail en cours.

### Arguments

`todo_write` prend un argument :

- `todos` (tableau, obligatoire) : Un tableau d'éléments de tâches, où chaque élément contient :
  - `content` (chaîne, obligatoire) : La description de la tâche.
  - `status` (chaîne, obligatoire) : Le statut actuel (`pending`, `in_progress` ou `completed`).
  - `id` (chaîne, obligatoire) : Un identifiant unique pour l'élément de tâche.

## Comment utiliser `todo_write` avec Qwen Code

L'assistant IA utilisera automatiquement cet outil lorsqu'il travaillera sur des tâches complexes en plusieurs étapes. Vous n'avez pas besoin de le demander explicitement, mais vous pouvez demander à l'assistant de créer une liste de tâches si vous souhaitez voir l'approche planifiée pour votre requête.

L'outil stocke les listes de tâches dans votre répertoire personnel (`~/.qwen/todos/`) avec des fichiers spécifiques à chaque session, de sorte que chaque session de codage conserve sa propre liste de tâches.

## Quand l'IA utilise cet outil

L'assistant utilise `todo_write` pour :

- Les tâches complexes nécessitant plusieurs étapes
- Les implémentations de fonctionnalités avec plusieurs composants
- Les opérations de refactorisation sur plusieurs fichiers
- Tout travail impliquant 3 actions distinctes ou plus

L'assistant n'utilisera pas cet outil pour des tâches simples en une seule étape ou des demandes purement informationnelles.

### Exemples d'utilisation de `todo_write`

Création d'un plan d'implémentation de fonctionnalité :

```
todo_write(todos=[
  {
    "id": "1",
    "content": "Créer le modèle de préférences utilisateur",
    "status": "pending"
  },
  {
    "id": "2",
    "content": "Ajouter les points d'API pour les préférences",
    "status": "pending"
  },
  {
    "id": "3",
    "content": "Implémenter les composants frontend",
    "status": "pending"
  }
])
```

## Remarques importantes

- **Utilisation automatique :** L'assistant IA gère automatiquement les listes de tâches lors de tâches complexes.
- **Visibilité de la progression :** Vous verrez les listes de tâches mises à jour en temps réel au fur et à mesure de l'avancement.
- **Isolation des sessions :** Chaque session de codage possède sa propre liste de tâches qui n'interfère pas avec les autres.
