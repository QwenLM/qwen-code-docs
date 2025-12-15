# Points de sauvegarde

Qwen Code inclut une fonctionnalité de points de sauvegarde qui enregistre automatiquement un instantané de l'état de votre projet avant toute modification de fichier effectuée par des outils alimentés par l'IA. Cela vous permet d'expérimenter et d'appliquer en toute sécurité des changements de code, sachant que vous pouvez instantanément revenir à l'état précédent l'exécution de l'outil.

## Comment ça marche

Lorsque vous approuvez un outil qui modifie le système de fichiers (comme `write_file` ou `edit`), l'interface en ligne de commande (CLI) crée automatiquement un « point de contrôle ». Ce point de contrôle comprend :

1. **Un instantané Git :** Un commit est effectué dans un dépôt Git spécial et isolé situé dans votre répertoire personnel (`~/.qwen/history/<project_hash>`). Cet instantané capture l'état complet des fichiers de votre projet à ce moment-là. Il **n'interfère pas** avec le dépôt Git de votre propre projet.
2. **L'historique de la conversation :** La totalité de la conversation que vous avez eue avec l'agent jusqu'à ce point est sauvegardée.
3. **L'appel de l'outil :** L'appel spécifique de l'outil sur le point d'être exécuté est également stocké.

Si vous souhaitez annuler la modification ou simplement revenir en arrière, vous pouvez utiliser la commande `/restore`. Restaurer un point de contrôle permet de :

- Rétablir tous les fichiers de votre projet à l'état capturé dans l'instantané.
- Restaurer l'historique de la conversation dans l'interface CLI.
- Reproposer l'appel initial de l'outil, vous permettant de l'exécuter à nouveau, de le modifier ou simplement de l'ignorer.

Toutes les données du point de contrôle, y compris l'instantané Git et l'historique de la conversation, sont stockées localement sur votre machine. L'instantané Git est conservé dans le dépôt isolé, tandis que l'historique de la conversation et les appels d'outils sont enregistrés dans un fichier JSON dans le répertoire temporaire de votre projet, généralement situé à `~/.qwen/tmp/<project_hash>/checkpoints`.

## Activation de la fonctionnalité

La fonctionnalité Checkpointing est désactivée par défaut. Pour l'activer, vous pouvez soit utiliser un drapeau en ligne de commande, soit modifier votre fichier `settings.json`.

### Utilisation du drapeau en ligne de commande

Vous pouvez activer le checkpointing pour la session en cours en utilisant le drapeau `--checkpointing` au démarrage de Qwen Code :

```bash
qwen --checkpointing
```

### Utilisation du fichier `settings.json`

Pour activer le checkpointing par défaut pour toutes les sessions, vous devez modifier votre fichier `settings.json`.

Ajoutez la clé suivante à votre `settings.json` :

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

Une fois activée, les points de contrôle sont créés automatiquement. Pour les gérer, vous utilisez la commande `/restore`.

### Liste des points de contrôle disponibles

Pour voir la liste de tous les points de contrôle enregistrés pour le projet actuel, il suffit d'exécuter :

```
/restore
```

L'interface CLI affichera une liste des fichiers de point de contrôle disponibles. Ces noms de fichiers sont généralement composés d'un horodatage, du nom du fichier modifié et du nom de l'outil qui allait être exécuté (par exemple, `2025-06-22T10-00-00_000Z-my-file.txt-write_file`).

### Restaurer un point de contrôle spécifique

Pour restaurer votre projet à partir d'un point de contrôle spécifique, utilisez le fichier de point de contrôle figurant dans la liste :

```
/restore <checkpoint_file>
```

Par exemple :

```
/restore 2025-06-22T10-00-00_000Z-my-file.txt-write_file
```

Après avoir exécuté la commande, vos fichiers et la conversation seront immédiatement restaurés à l'état où ils se trouvaient lors de la création du point de contrôle, et l'invite de l'outil original réapparaîtra.