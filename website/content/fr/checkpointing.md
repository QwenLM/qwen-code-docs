# Checkpointing

Qwen Code inclut une fonctionnalité de Checkpointing qui sauvegarde automatiquement un snapshot de l'état de votre projet avant que des modifications de fichiers ne soient effectuées par des outils alimentés par l'IA. Cela vous permet d'expérimenter et d'appliquer des changements de code en toute sécurité, sachant que vous pouvez instantanément revenir à l'état précédent l'exécution de l'outil.

## Fonctionnement

Lorsque vous approuvez un outil qui modifie le système de fichiers (comme `write_file` ou `edit`), le CLI crée automatiquement un "checkpoint". Ce checkpoint inclut :

1.  **Un snapshot Git :** Un commit est effectué dans un dépôt Git spécial et caché situé dans votre répertoire personnel (`~/.qwen/history/<project_hash>`). Ce snapshot capture l'état complet des fichiers de votre projet à ce moment-là. Il n'interfère **pas** avec le dépôt Git de votre propre projet.
2.  **L'historique de la conversation :** La conversation entière que vous avez eue avec l'agent jusqu'à ce point est sauvegardée.
3.  **L'appel de l'outil :** L'appel spécifique de l'outil sur le point d'être exécuté est également stocké.

Si vous souhaitez annuler la modification ou simplement revenir en arrière, vous pouvez utiliser la commande `/restore`. Restaurer un checkpoint va :

- Rétablir tous les fichiers de votre projet à l'état capturé dans le snapshot.
- Restaurer l'historique de la conversation dans le CLI.
- Reproposer l'appel initial de l'outil, vous permettant de le relancer, le modifier ou simplement l'ignorer.

Toutes les données des checkpoints, y compris le snapshot Git et l'historique de conversation, sont stockées localement sur votre machine. Le snapshot Git est conservé dans le dépôt caché, tandis que l'historique de conversation et les appels d'outils sont enregistrés dans un fichier JSON dans le répertoire temporaire de votre projet, généralement situé à `~/.qwen/tmp/<project_hash>/checkpoints`.

## Activation de la fonctionnalité

La fonction Checkpointing est désactivée par défaut. Pour l'activer, vous pouvez soit utiliser un flag en ligne de commande, soit modifier votre fichier `settings.json`.

### Utilisation du flag en ligne de commande

Vous pouvez activer le checkpointing pour la session en cours en utilisant le flag `--checkpointing` au démarrage de Qwen Code :

```bash
qwen --checkpointing
```

### Utilisation du fichier `settings.json`

Pour activer le checkpointing par défaut pour toutes les sessions, vous devez modifier votre fichier `settings.json`.

Ajoutez la clé suivante à votre `settings.json` :

```json
{
  "checkpointing": {
    "enabled": true
  }
}
```

## Utilisation de la commande `/restore`

Une fois activée, les checkpoints sont créés automatiquement. Pour les gérer, vous utilisez la commande `/restore`.

### Liste des Checkpoints Disponibles

Pour voir la liste de tous les checkpoints sauvegardés pour le projet en cours, il suffit d'exécuter :

```
/restore
```

Le CLI affichera la liste des fichiers de checkpoint disponibles. Ces noms de fichiers sont généralement composés d'un timestamp, du nom du fichier modifié, et du nom de l'outil qui allait être exécuté (par exemple, `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Restaurer un Checkpoint Spécifique

Pour restaurer votre projet à partir d'un checkpoint spécifique, utilisez le fichier de checkpoint de la liste :

```
/restore <checkpoint_file>
```

Par exemple :

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Après avoir exécuté la commande, vos fichiers et la conversation seront immédiatement restaurés à l'état dans lequel ils se trouvaient lors de la création du checkpoint, et le prompt de l'outil original réapparaîtra.