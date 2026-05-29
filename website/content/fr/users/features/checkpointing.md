---
description: "Découvrez Qwen Code Checkpointing pour sauvegarder et restaurer des états clés lors de refactorings, expériences et longues sessions de coding IA."
---

# Checkpointing

Qwen Code inclut une fonctionnalité de checkpointing qui enregistre automatiquement un instantané de l'état de votre projet avant toute modification de fichier par des outils alimentés par l'IA. Cela vous permet d'expérimenter et d'appliquer des modifications de code en toute sécurité, sachant que vous pouvez revenir instantanément à l'état précédent l'exécution de l'outil.

## Fonctionnement

Lorsque vous approuvez un outil qui modifie le système de fichiers (comme `write_file` ou `edit`), la CLI crée automatiquement un « checkpoint ». Ce checkpoint comprend :

1.  **Un instantané Git :** Un commit est effectué dans un dépôt Git spécial et isolé (shadow repository), situé dans votre répertoire personnel (`~/.qwen/history/<project_hash>`). Cet instantané capture l'état complet des fichiers de votre projet à ce moment précis. Il n'interfère **pas** avec le dépôt Git de votre propre projet.
2.  **L'historique des conversations :** L'intégralité de la conversation que vous avez eue avec l'agent jusqu'à ce point est sauvegardée.
3.  **L'appel d'outil :** L'appel d'outil spécifique qui était sur le point d'être exécuté est également stocké.

Si vous souhaitez annuler la modification ou simplement revenir en arrière, vous pouvez utiliser la commande `/restore`. La restauration d'un checkpoint permet de :

- Rétablir tous les fichiers de votre projet dans l'état capturé par l'instantané.
- Restaurer l'historique des conversations dans la CLI.
- Re-proposer l'appel d'outil d'origine, ce qui vous permet de l'exécuter à nouveau, de le modifier ou de simplement l'ignorer.

Toutes les données de checkpoint, y compris l'instantané Git et l'historique des conversations, sont stockées localement sur votre machine. L'instantané Git est conservé dans le dépôt isolé, tandis que l'historique des conversations et les appels d'outils sont enregistrés dans un fichier JSON situé dans le répertoire temporaire de votre projet, généralement à l'emplacement `~/.qwen/tmp/<project_hash>/checkpoints`.

## Activation de la fonctionnalité

La fonctionnalité de checkpointing est désactivée par défaut. Pour l'activer, vous pouvez utiliser un indicateur en ligne de commande ou modifier votre fichier `settings.json`.

### Utilisation de l'indicateur en ligne de commande

Vous pouvez activer le checkpointing pour la session en cours en utilisant l'indicateur `--checkpointing` au démarrage de Qwen Code :

```bash
qwen --checkpointing
```

### Utilisation du fichier `settings.json`

Pour activer le checkpointing par défaut pour toutes les sessions, vous devez modifier votre fichier `settings.json`.

Ajoutez la clé suivante à votre fichier `settings.json` :

```json
{
  "general": {
    "checkpointing": {
      "enabled": true
    }
  }
}
```

## Utilisation de la commande `/restore`

Une fois activée, la création des checkpoints est automatique. Pour les gérer, utilisez la commande `/restore`.

### Lister les checkpoints disponibles

Pour afficher la liste de tous les checkpoints sauvegardés pour le projet actuel, exécutez simplement :

```
/restore
```

La CLI affichera une liste des fichiers de checkpoint disponibles. Ces noms de fichiers sont généralement composés d'un horodatage, du nom du fichier modifié et du nom de l'outil sur le point d'être exécuté (par ex. `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Restaurer un checkpoint spécifique

Pour restaurer votre projet à un checkpoint spécifique, utilisez le fichier de checkpoint issu de la liste :

```
/restore <checkpoint_file>
```

Par exemple :

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Après l'exécution de la commande, vos fichiers et votre conversation seront immédiatement restaurés dans l'état où ils se trouvaient lors de la création du checkpoint, et le prompt de l'outil d'origine réapparaîtra.