# Outil de mémoire (`save_memory`)

Ce document décrit l’outil `save_memory` pour Qwen Code.

## Description

Utilisez `save_memory` pour enregistrer et rappeler des informations entre vos sessions Qwen Code. Grâce à `save_memory`, vous pouvez demander à l’interface CLI de mémoriser des détails clés d’une session à l’autre, ce qui permet une assistance personnalisée et ciblée.

### Arguments

`save_memory` accepte un seul argument :

- `fact` (chaîne de caractères, requis) : Le fait ou l’information spécifique à retenir. Il doit s’agir d’une affirmation claire et autonome rédigée en langage naturel.

## Utilisation de `save_memory` avec Qwen Code

Cet outil ajoute le `fact` fourni au fichier de contexte situé dans le répertoire personnel de l’utilisateur (`~/.qwen/QWEN.md` par défaut). Ce nom de fichier peut être personnalisé via l’option `contextFileName`.

Une fois ajouté, chaque fait est stocké sous la section `## Qwen Added Memories`. Ce fichier est chargé comme contexte lors des sessions suivantes, permettant ainsi à l’interface CLI de restituer les informations sauvegardées.

Utilisation :

```
save_memory(fact="Votre fait ici.")
```

### Exemples de `save_memory`

Mémoriser une préférence utilisateur :

```
save_memory(fact="Mon langage de programmation préféré est Python.")
```

Stocker un détail spécifique à un projet :

```
save_memory(fact="Le projet sur lequel je travaille actuellement s'appelle « qwen-code ».")
```

## Remarques importantes

- **Utilisation générale :** Cet outil doit être utilisé pour mémoriser des faits concis et importants. Il n’est pas conçu pour stocker de grandes quantités de données ou l’historique d’une conversation.
- **Fichier de mémoire :** Le fichier de mémoire est un fichier Markdown brut, que vous pouvez donc consulter et modifier manuellement si nécessaire.