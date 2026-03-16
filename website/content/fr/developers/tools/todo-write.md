# Outil Todo Write (`todo_write`)

Ce document décrit l’outil `todo_write` pour Qwen Code.

## Description

Utilisez `todo_write` pour créer et gérer une liste de tâches structurée pendant votre session de codage en cours. Cet outil aide l’assistant IA à suivre l’avancement et à organiser des tâches complexes, ce qui vous permet de visualiser clairement les travaux en cours.

### Arguments

`todo_write` accepte un seul argument :

- `todos` (tableau, requis) : Un tableau d’éléments todo, chacun contenant :
  - `content` (chaîne de caractères, requis) : La description de la tâche.
  - `status` (chaîne de caractères, requis) : Le statut actuel (`pending`, `in_progress` ou `completed`).
  - `activeForm` (chaîne de caractères, requis) : La forme à l’indicatif présent continu décrivant l’action en cours (par exemple « Exécution des tests », « Construction du projet »).

## Comment utiliser `todo_write` avec Qwen Code

L’assistant IA utilise automatiquement cet outil lorsqu’il travaille sur des tâches complexes comportant plusieurs étapes. Vous n’avez pas besoin de le demander explicitement, mais vous pouvez inviter l’assistant à créer une liste de tâches si vous souhaitez consulter l’approche planifiée pour votre demande.

Cet outil stocke les listes de tâches dans votre répertoire personnel (`~/.qwen/todos/`) sous forme de fichiers spécifiques à chaque session, de sorte que chaque session de développement conserve sa propre liste de tâches.

## Cas d’utilisation de cet outil par l’IA

L’assistant utilise `todo_write` dans les cas suivants :

- Tâches complexes nécessitant plusieurs étapes  
- Implémentations de fonctionnalités comportant plusieurs composants  
- Opérations de refactorisation portant sur plusieurs fichiers  
- Toute tâche impliquant 3 actions ou plus distinctes  

L’assistant n’utilise pas cet outil pour les tâches simples en une seule étape ou pour les demandes purement informatives.

### Exemples de `todo_write`

Création d’un plan d’implémentation de fonctionnalité :

```
todo_write(todos=[
  {
    "content": "Créer le modèle des préférences utilisateur",
    "status": "pending",
    "activeForm": "Création du modèle des préférences utilisateur"
  },
  {
    "content": "Ajouter des points de terminaison API pour les préférences",
    "status": "pending",
    "activeForm": "Ajout des points de terminaison API pour les préférences"
  },
  {
    "content": "Implémenter les composants frontend",
    "status": "pending",
    "activeForm": "Implémentation des composants frontend"
  }
])
```

## Remarques importantes

- **Utilisation automatique :** L’assistant IA gère automatiquement les listes de tâches pendant les tâches complexes.
- **Visibilité de l’avancement :** Les listes de tâches sont mises à jour en temps réel au fur et à mesure de l’avancement du travail.
- **Isolation par session :** Chaque session de développement possède sa propre liste de tâches, sans interférence avec les autres sessions.