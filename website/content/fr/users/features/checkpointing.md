# Point de contrôle

Qwen Code inclut une fonctionnalité de point de contrôle qui enregistre automatiquement un instantané de l’état de votre projet avant toute modification de fichiers effectuée par des outils pilotés par l’IA. Cela vous permet d’expérimenter et d’appliquer en toute sécurité des modifications de code, en sachant que vous pouvez revenir immédiatement à l’état antérieur à l’exécution de l’outil.

## Fonctionnement

Lorsque vous approuvez un outil modifiant le système de fichiers (par exemple `write_file` ou `edit`), l’interface en ligne de commande (CLI) crée automatiquement un « point de restauration ». Ce point de restauration comprend :

1.  **Une capture Git :** Un commit est effectué dans un dépôt Git spécial et isolé, situé dans votre répertoire personnel (`~/.qwen/history/<project_hash>`). Cette capture reflète l’état complet des fichiers de votre projet à cet instant précis. Elle **n’interfère pas** avec le dépôt Git de votre projet.
2.  **L’historique de la conversation :** L’intégralité de la discussion que vous avez eue avec l’agent jusqu’à ce moment est sauvegardée.
3.  **L’appel d’outil :** L’appel spécifique de l’outil sur le point d’être exécuté est également stocké.

Si vous souhaitez annuler la modification ou simplement revenir en arrière, utilisez la commande `/restore`. La restauration d’un point de restauration permet de :

- Rétablir tous les fichiers de votre projet à l’état capturé dans la capture Git.
- Restaurer l’historique de la conversation dans la CLI.
- Reproposer l’appel d’outil d’origine, afin que vous puissiez l’exécuter à nouveau, le modifier ou simplement l’ignorer.

Toutes les données liées aux points de restauration — y compris la capture Git et l’historique de la conversation — sont stockées localement sur votre machine. La capture Git est conservée dans le dépôt Git isolé, tandis que l’historique de la conversation et les appels d’outils sont enregistrés dans un fichier JSON du répertoire temporaire de votre projet, généralement situé à `~/.qwen/tmp/<project_hash>/checkpoints`.

## Activation de la fonctionnalité

La fonctionnalité de sauvegarde intermédiaire (« checkpointing ») est désactivée par défaut. Pour l’activer, vous pouvez soit utiliser un indicateur en ligne de commande, soit modifier votre fichier `settings.json`.

### Utilisation de l’indicateur en ligne de commande

Vous pouvez activer la sauvegarde intermédiaire pour la session en cours en utilisant l’indicateur `--checkpointing` au démarrage de Qwen Code :

```bash
qwen --checkpointing
```

### Utilisation du fichier `settings.json`

Pour activer la sauvegarde intermédiaire par défaut dans toutes les sessions, vous devez modifier votre fichier `settings.json`.

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

Une fois activée, la sauvegarde intermédiaire est créée automatiquement. Pour la gérer, utilisez la commande `/restore`.

### Répertorier les points de sauvegarde disponibles

Pour afficher la liste de tous les points de sauvegarde enregistrés pour le projet actuel, exécutez simplement la commande suivante :

```
/restore
```

L’interface CLI affichera la liste des fichiers de points de sauvegarde disponibles. Ces noms de fichiers sont généralement composés d’un horodatage, du nom du fichier modifié et du nom de l’outil sur le point d’être exécuté (par exemple : `2025-06-22T10-00-00_000Z-mon-fichier.txt-write_file`).

### Restaurer un point de sauvegarde spécifique

Pour restaurer votre projet à un point de sauvegarde spécifique, utilisez le fichier de point de sauvegarde issu de la liste :

```
/restore <fichier_point_de_sauvegarde>
```

Par exemple :

```
/restore 2025-06-22T10-00-00_000Z-mon-fichier.txt-write_file
```

Une fois la commande exécutée, vos fichiers et votre conversation seront immédiatement restaurés dans l’état où ils se trouvaient au moment de la création du point de sauvegarde, et l’invite originale de l’outil réapparaîtra.