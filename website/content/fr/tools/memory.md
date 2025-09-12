# Outil Mémoire (`save_memory`)

Ce document décrit l'outil `save_memory` pour Qwen Code.

## Description

Utilisez `save_memory` pour sauvegarder et rappeler des informations entre vos sessions Qwen Code. Avec `save_memory`, vous pouvez indiquer au CLI de mémoriser des détails importants d'une session à l'autre, offrant ainsi une assistance personnalisée et ciblée.

### Arguments

`save_memory` prend un seul argument :

- `fact` (string, requis) : Le fait ou l'information spécifique à mémoriser. Il doit s'agir d'une déclaration claire et autonome rédigée en langage naturel.

## Comment utiliser `save_memory` avec Qwen Code

L'outil ajoute le `fact` fourni à votre fichier de contexte situé dans le répertoire utilisateur (`~/.qwen/QWEN.md` par défaut). Ce nom de fichier peut être configuré via `contextFileName`.

Une fois ajoutés, les faits sont stockés sous une section intitulée `## Qwen Added Memories`. Ce fichier est chargé comme contexte lors des sessions suivantes, permettant au CLI de se rappeler les informations sauvegardées.

Utilisation :

```
save_memory(fact="Votre fait ici.")
```

### Exemples avec `save_memory`

Mémoriser une préférence utilisateur :

```
save_memory(fact="Mon langage de programmation préféré est Python.")
```

Stocker un détail spécifique à un projet :

```
save_memory(fact="Le projet sur lequel je travaille actuellement s'appelle 'qwen-code'.")
```

## Notes importantes

- **Utilisation générale :** Cet outil doit être utilisé pour des faits concis et importants. Il n'est pas destiné au stockage de grandes quantités de données ou de l'historique des conversations.
- **Fichier mémoire :** Le fichier mémoire est un fichier Markdown en texte brut, vous pouvez donc le consulter et le modifier manuellement si nécessaire.