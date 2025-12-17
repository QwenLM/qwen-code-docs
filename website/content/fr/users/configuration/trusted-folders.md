# Dossiers de confiance

La fonctionnalité des dossiers de confiance est un paramètre de sécurité qui vous permet de contrôler quels projets peuvent utiliser l'ensemble des capacités du code Qwen. Elle empêche l'exécution de code potentiellement malveillant en vous demandant d'approuver un dossier avant que l'interface CLI ne charge les configurations spécifiques au projet à partir de celui-ci.

## Activation de la fonctionnalité

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

## Fonctionnement : La boîte de dialogue de confiance

Une fois la fonctionnalité activée, la première fois que vous exécutez Qwen Code depuis un dossier, une boîte de dialogue apparaîtra automatiquement, vous invitant à faire un choix :

- **Faire confiance au dossier** : Accorde une confiance totale au dossier actuel (par exemple `my-project`).
- **Faire confiance au dossier parent** : Accorde la confiance au répertoire parent (par exemple `safe-projects`), ce qui accorde automatiquement la confiance à tous ses sous-répertoires. C'est utile si vous conservez tous vos projets sécurisés dans un même emplacement.
- **Ne pas faire confiance** : Marque le dossier comme non fiable. L'interface CLI fonctionnera alors en « mode sécurisé » restreint.

Votre choix est enregistré dans un fichier central (`~/.qwen/trustedFolders.json`), vous ne serez donc interrogé qu'une seule fois par dossier.

## Pourquoi la Confiance Est Importante : L'Impact d'un Espace de Travail Non Fiable

Lorsqu'un dossier est **non fiable**, Qwen Code s'exécute en mode « sans échec » restreint pour vous protéger. Dans ce mode, les fonctionnalités suivantes sont désactivées :

1.  **Les paramètres de l'espace de travail sont ignorés** : L'interface en ligne de commande (CLI) ne chargera **pas** le fichier `.qwen/settings.json` du projet. Cela empêche le chargement d'outils personnalisés et d'autres configurations potentiellement dangereuses.

2.  **Les variables d'environnement sont ignorées** : L'interface en ligne de commande (CLI) ne chargera **aucun** fichier `.env` du projet.

3.  **La gestion des extensions est limitée** : Vous ne pouvez **ni installer, ni mettre à jour, ni désinstaller** d'extensions.

4.  **L'acceptation automatique des outils est désactivée** : Une confirmation sera toujours demandée avant l'exécution de n'importe quel outil, même si l'acceptation automatique est activée globalement.

5.  **Le chargement automatique de la mémoire est désactivé** : L'interface en ligne de commande (CLI) ne chargera pas automatiquement les fichiers dans le contexte à partir des répertoires spécifiés dans les paramètres locaux.

Accorder votre confiance à un dossier déverrouille toutes les fonctionnalités de Qwen Code pour cet espace de travail.

## Gestion de vos paramètres de confiance

Si vous devez modifier une décision ou consulter tous vos paramètres, vous avez plusieurs options :

- **Modifier la confiance du dossier actuel** : Exécutez la commande `/permissions` depuis l'interface CLI. Cela affichera le même dialogue interactif, vous permettant de modifier le niveau de confiance pour le dossier actuel.

- **Afficher toutes les règles de confiance** : Pour voir la liste complète de tous vos dossiers approuvés et non approuvés, vous pouvez inspecter le contenu du fichier `~/.qwen/trustedFolders.json` dans votre répertoire personnel.

## Le processus de vérification de la confiance (Avancé)

Pour les utilisateurs avancés, il est utile de connaître l'ordre exact des opérations déterminant la confiance :

1. **Signal de confiance de l'IDE** : Si vous utilisez l'[intégration IDE](../ide-integration/ide-integration), l'interface CLI demande d'abord à l'IDE si l'espace de travail est approuvé. La réponse de l'IDE a la priorité la plus élevée.

2. **Fichier local de confiance** : Si l'IDE n'est pas connecté, l'interface CLI consulte le fichier central `~/.qwen/trustedFolders.json`.