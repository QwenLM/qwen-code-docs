# Dossiers de confiance

La fonctionnalité des dossiers de confiance est un paramètre de sécurité qui vous permet de contrôler quels projets peuvent utiliser l'ensemble des capacités de Qwen Code. Elle empêche l'exécution de code potentiellement malveillant en vous demandant d'approuver un dossier avant que le CLI ne charge les configurations spécifiques au projet depuis celui-ci.

## Activer la fonctionnalité

La fonctionnalité des dossiers de confiance est **désactivée par défaut**. Pour l'utiliser, vous devez d'abord l'activer dans vos paramètres.

Ajoutez ce qui suit à votre fichier `settings.json` utilisateur :

```json
{
  "security": {
    "folderTrust": {
      "enabled": true
    }
  }
}
```

## Comment ça marche : La boîte de dialogue de confiance

Une fois la fonctionnalité activée, la première fois que vous exécutez Qwen Code depuis un dossier, une boîte de dialogue apparaîtra automatiquement pour vous demander de faire un choix :

- **Trust folder** : Accorde une confiance totale au dossier courant (ex. `my-project`).
- **Trust parent folder** : Accorde la confiance au répertoire parent (ex. `safe-projects`), ce qui permet de faire confiance automatiquement à tous ses sous-répertoires. Utile si vous stockez tous vos projets sûrs dans un même endroit.
- **Don't trust** : Marque le dossier comme non fiable. Le CLI fonctionnera alors en "safe mode" restreint.

Votre choix est enregistré dans un fichier central (`~/.qwen/trustedFolders.json`), donc vous ne serez interrogé qu'une seule fois par dossier.

## Pourquoi la Confiance Est Importante : L'Impact d'un Espace de Travail Non Fiable

Lorsqu'un dossier est **non fiable**, Qwen Code s'exécute en mode « sans échec » restreint pour vous protéger. Dans ce mode, les fonctionnalités suivantes sont désactivées :

1.  **Les paramètres de l'espace de travail sont ignorés** : Le CLI ne chargera **pas** le fichier `.qwen/settings.json` depuis le projet. Cela empêche le chargement d'outils personnalisés ou d'autres configurations potentiellement dangereuses.

2.  **Les variables d'environnement sont ignorées** : Le CLI ne chargera **aucun** fichier `.env` du projet.

3.  **La gestion des extensions est limitée** : Vous **ne pouvez pas installer, mettre à jour ou désinstaller** d'extensions.

4.  **L'acceptation automatique des outils est désactivée** : Une confirmation sera toujours demandée avant l'exécution de n'importe quel outil, même si l'option d'acceptation automatique est activée globalement.

5.  **Le chargement automatique de la mémoire est désactivé** : Le CLI ne chargera pas automatiquement les fichiers dans le contexte à partir des répertoires spécifiés dans les paramètres locaux.

Accorder votre confiance à un dossier permet de débloquer toutes les fonctionnalités de Qwen Code pour cet espace de travail.

## Gérer vos paramètres de confiance

Si vous devez modifier une décision ou consulter tous vos paramètres, vous avez plusieurs options :

- **Modifier la confiance du dossier actuel** : Exécutez la commande `/permissions` depuis le CLI. Cela affichera le même dialogue interactif, vous permettant de changer le niveau de confiance pour le dossier courant.

- **Voir toutes les règles de confiance** : Pour afficher la liste complète de tous vos dossiers approuvés et non approuvés, vous pouvez inspecter le contenu du fichier `~/.qwen/trustedFolders.json` situé dans votre répertoire personnel.

## Le processus de vérification de confiance (Avancé)

Pour les utilisateurs avancés, il peut être utile de connaître l'ordre exact des opérations utilisé pour déterminer la confiance :

1. **Signal de confiance de l'IDE** : Si vous utilisez [l'intégration IDE](./ide-integration.md), le CLI demande d'abord à l'IDE si l'espace de travail est approuvé. La réponse de l'IDE a la priorité la plus élevée.

2. **Fichier local de confiance** : Si l'IDE n'est pas connecté, le CLI consulte le fichier central `~/.qwen/trustedFolders.json`.