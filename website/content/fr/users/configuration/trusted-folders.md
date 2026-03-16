# Dossiers approuvés

La fonctionnalité « Dossiers approuvés » est un paramètre de sécurité qui vous permet de contrôler quels projets peuvent utiliser l’intégralité des fonctionnalités de Qwen Code. Elle empêche l’exécution de code potentiellement malveillant en vous demandant d’approuver un dossier avant que l’interface en ligne de commande (CLI) n’en charge les configurations spécifiques au projet.

## Activation de la fonctionnalité

La fonctionnalité « Dossiers approuvés » est **désactivée par défaut**. Pour l’utiliser, vous devez d’abord l’activer dans vos paramètres.

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

## Fonctionnement : la boîte de dialogue de confiance

Une fois la fonctionnalité activée, la première fois que vous exécutez Qwen Code depuis un dossier, une boîte de dialogue apparaît automatiquement pour vous demander de faire un choix :

- **Faire confiance au dossier** : accorde une confiance totale au dossier actuel (par exemple `my-project`).
- **Faire confiance au dossier parent** : accorde la confiance au répertoire parent (par exemple `safe-projects`), ce qui accorde automatiquement la confiance à tous ses sous-répertoires. Cette option est utile si vous stockez tous vos projets fiables au même endroit.
- **Ne pas faire confiance** : marque le dossier comme non fiable. L’interface en ligne de commande (CLI) fonctionne alors en mode « sécurisé » restreint.

Votre choix est enregistré dans un fichier central (`~/.qwen/trustedFolders.json`), aussi ne serez-vous interrogé qu’une seule fois par dossier.

## Pourquoi la confiance est essentielle : impact d’un espace de travail non fiable

Lorsqu’un dossier est **non fiable**, Qwen Code s’exécute en mode restreint, appelé « mode sécurisé », afin de vous protéger. Dans ce mode, les fonctionnalités suivantes sont désactivées :

1.  **Les paramètres de l’espace de travail sont ignorés** : L’interface CLI **ne chargera pas** le fichier `.qwen/settings.json` du projet. Cela empêche le chargement d’outils personnalisés et d’autres configurations potentiellement dangereuses.

2.  **Les variables d’environnement sont ignorées** : L’interface CLI **ne chargera aucun** fichier `.env` du projet.

3.  **La gestion des extensions est restreinte** : Vous **ne pouvez ni installer, ni mettre à jour, ni désinstaller** d’extensions.

4.  **L’acceptation automatique des outils est désactivée** : Vous serez systématiquement invité avant l’exécution de tout outil, même si l’acceptation automatique est activée globalement.

5.  **Le chargement automatique de mémoire est désactivé** : L’interface CLI ne chargera pas automatiquement de fichiers dans le contexte à partir des répertoires spécifiés dans les paramètres locaux.

Accorder votre confiance à un dossier débloque l’intégralité des fonctionnalités de Qwen Code pour cet espace de travail.

## Gestion de vos paramètres de confiance

Si vous devez modifier une décision ou consulter l’ensemble de vos paramètres, plusieurs options s’offrent à vous :

- **Modifier la confiance du dossier actuel** : exécutez la commande `/permissions` depuis l’interface CLI. Une boîte de dialogue interactive identique s’affichera, vous permettant de modifier le niveau de confiance du dossier courant.

- **Afficher toutes les règles de confiance** : pour obtenir la liste complète de tous vos dossiers approuvés et non approuvés, examinez le contenu du fichier `~/.qwen/trustedFolders.json` situé dans votre répertoire personnel.

## Processus de vérification de la confiance (avancé)

Pour les utilisateurs avancés, il peut être utile de connaître précisément l’ordre des opérations utilisé pour déterminer la confiance :

1.  **Signal de confiance fourni par l’IDE** : si vous utilisez l’[intégration avec un IDE](../ide-integration/ide-integration), la CLI interroge d’abord l’IDE afin de savoir si l’espace de travail est fiable. La réponse de l’IDE a la priorité absolue.

2.  **Fichier local de confiance** : si l’IDE n’est pas connecté, la CLI consulte le fichier central `~/.qwen/trustedFolders.json`.