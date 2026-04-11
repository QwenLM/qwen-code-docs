# Outil de mémoire (`save_memory`)

Ce document décrit l'outil `save_memory` pour Qwen Code.

## Description

Utilisez `save_memory` pour enregistrer et rappeler des informations entre vos sessions Qwen Code. Avec `save_memory`, vous pouvez demander au CLI de mémoriser des détails clés d'une session à l'autre, afin de bénéficier d'une assistance personnalisée et ciblée.

### Arguments

`save_memory` accepte un seul argument :

- `fact` (string, obligatoire) : Le fait ou l'information spécifique à mémoriser. Il doit s'agir d'une déclaration claire et autonome, rédigée en langage naturel.

## Comment utiliser `save_memory` avec Qwen Code

L'outil ajoute le `fact` fourni à votre fichier de contexte dans le répertoire personnel de l'utilisateur (`~/.qwen/QWEN.md` par défaut). Ce nom de fichier peut être configuré via `contextFileName`.

Une fois ajoutés, les faits sont stockés sous une section `## Qwen Added Memories`. Ce fichier est chargé comme contexte lors des sessions suivantes, permettant au CLI de rappeler les informations enregistrées.

Utilisation :

```
save_memory(fact="Your fact here.")
```

### Exemples d'utilisation de `save_memory`

Mémoriser une préférence utilisateur :

```
save_memory(fact="My preferred programming language is Python.")
```

Enregistrer un détail spécifique à un projet :

```
save_memory(fact="The project I'm currently working on is called 'qwen-code'.")
```

## Notes importantes

- **Utilisation générale :** Cet outil doit être utilisé pour des faits importants et concis. Il n'est pas conçu pour stocker de grandes quantités de données ou l'historique des conversations.
- **Fichier de mémoire :** Le fichier de mémoire est un fichier Markdown en texte brut, vous pouvez donc le consulter et le modifier manuellement si nécessaire.