# Dossiers de confiance

La fonctionnalité Dossiers de confiance est un paramètre de sécurité qui vous permet de contrôler quels projets peuvent utiliser toutes les capacités de Qwen Code. Elle empêche l'exécution de code potentiellement malveillant en vous demandant d'approuver un dossier avant que le CLI charge les configurations spécifiques au projet.

## Activation de la fonctionnalité

La fonctionnalité Dossiers de confiance est **désactivée par défaut**. Pour l'utiliser, vous devez d'abord l'activer dans vos paramètres.

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

## Fonctionnement : La boîte de dialogue de confiance

Une fois la fonctionnalité activée, la première fois que vous exécutez Qwen Code depuis un dossier, une boîte de dialogue apparaîtra automatiquement, vous invitant à faire un choix :

- **Approuver le dossier** : Accorde une confiance totale au dossier actuel (par ex. `my-project`).
- **Approuver le dossier parent** : Accorde la confiance au répertoire parent (par ex. `safe-projects`), ce qui approuve automatiquement tous ses sous-dossiers. Utile si vous conservez tous vos projets fiables au même endroit.
- **Ne pas approuver** : Marque le dossier comme non approuvé. Le CLI fonctionnera alors en « mode sécurisé » restreint.

Votre choix est enregistré dans un fichier central (`~/.qwen/trustedFolders.json`), vous ne serez donc interrogé qu'une seule fois par dossier.

## Pourquoi la confiance est importante : Impact d'un espace de travail non approuvé

Lorsqu'un dossier est **non approuvé**, Qwen Code s'exécute en « mode sécurisé » restreint pour vous protéger. Dans ce mode, les fonctionnalités suivantes sont désactivées :

1.  **Les paramètres de l'espace de travail sont ignorés** : Le CLI ne **chargera pas** le fichier `.qwen/settings.json` du projet. Cela empêche le chargement d'outils personnalisés et d'autres configurations potentiellement dangereuses.

2.  **Les variables d'environnement sont ignorées** : Le CLI ne **chargera pas** les fichiers `.env` du projet.

3.  **La gestion des extensions est restreinte** : Vous **ne pouvez pas installer, mettre à jour ou désinstaller** d'extensions.

4.  **L'acceptation automatique des outils est désactivée** : Vous serez toujours invité avant l'exécution d'un outil, même si l'acceptation automatique est activée globalement.

5.  **Le chargement automatique de la mémoire est désactivé** : Le CLI ne chargera pas automatiquement des fichiers dans le contexte à partir des répertoires spécifiés dans les paramètres locaux.

Accorder la confiance à un dossier débloque toutes les fonctionnalités de Qwen Code pour cet espace de travail.

## Gestion de vos paramètres de confiance

Si vous devez modifier une décision ou voir tous vos paramètres, vous avez plusieurs options :

- **Modifier la confiance du dossier actuel** : Exécutez la commande `/permissions` dans le CLI. Cela fera apparaître la même boîte de dialogue interactive, vous permettant de modifier le niveau de confiance pour le dossier actuel.

- **Voir toutes les règles de confiance** : Pour afficher la liste complète de toutes vos règles de dossiers approuvés et non approuvés, vous pouvez inspecter le contenu du fichier `~/.qwen/trustedFolders.json` dans votre répertoire personnel.

## Le processus de vérification de la confiance (Avancé)

Pour les utilisateurs avancés, il est utile de connaître l'ordre exact des opérations pour déterminer la confiance :

1.  **Signal de confiance de l'IDE** : Si vous utilisez l'[intégration IDE](../ide-integration/ide-integration), le CLI demande d'abord à l'IDE si l'espace de travail est approuvé. La réponse de l'IDE a la priorité la plus élevée.

2.  **Fichier de confiance local** : Si l'IDE n'est pas connecté, le CLI vérifie le fichier central `~/.qwen/trustedFolders.json`.