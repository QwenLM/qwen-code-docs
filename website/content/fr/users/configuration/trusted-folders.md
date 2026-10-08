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

La fonctionnalité est fail closed : tant que vous n'avez pas fait de choix, un dossier est considéré comme **non approuvé**, et non comme approuvé par défaut. Si ce fichier est absent — nouvelle machine, répertoire personnel restauré, configuration de dotfiles synchronisés — chaque dossier qu'aucun signal prioritaire ne décide (voir « Le processus de vérification de la confiance (Avancé) » ci-dessous) commence non approuvé, y compris les dossiers que vous aviez approuvés auparavant. Lorsqu'une vérification de confiance atteint les règles du fichier, un fichier illisible, une syntaxe JSONC invalide ou un document non-objet constitue une erreur de configuration irréversible. Un échec de chargement en cache fait arrêter le CLI avec « Please fix the configuration file and try again. » et les vérifications de confiance v1 du démon répondent `500 trusted_folders_invalid` ; une décision de confiance IDE antérieure peut contourner ces vérifications de fichier. Le writer de concession valide toujours le fichier avant de persister une règle. Réparez ou supprimez le fichier à la main, puis redémarrez le démon pour effacer le chargement échoué. Les commentaires et les virgules finales sont acceptés. Les valeurs de niveau de confiance invalides sont détectées par le writer de concession et le lecteur de politique v2, mais ne sont pas validées par le lecteur v1 hérité ; v2 signale les erreurs de politique avec `200` et `configured.state: "error"`. Un fichier qui devient invalide après le chargement en cache peut plutôt échouer lors de l'écriture de la concession avec `500 internal_error`, ou lors de la vérification de politique post-écriture avec `409 trust_grant_ineffective`.

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

- **Approuver un espace de travail depuis le Web Shell** : Ouvrez la vue d'ensemble des workspaces et utilisez l'action **Trust** sur un workspace non approuvé. Cela enregistre la même décision sans avoir besoin d'un terminal, ce qui est le moyen de revenir en arrière si chaque workspace est apparu comme non approuvé parce qu'aucune règle ne les a décidés. L'action apparaît uniquement lorsque le démon connecté annonce `workspace_trust_grant`, ce qu'il fait seulement là où le rechargement à chaud de la confiance applique la décision au runtime en cours d'exécution — un démon qui sert les routes de concession sans rechargement à chaud masque l'action. Là-bas, une concession enregistrée via l'API de ce démon met à jour le fichier de confiance et le statut de confiance v1 immédiatement, mais les portes de runtime liées au démarrage nécessitent un redémarrage. Une décision enregistrée par un processus de terminal séparé ou une modification de fichier n'est pas immédiatement visible pour le statut v1 en cache du démon ; redémarrez le démon pour la charger. Là où l'action est disponible, le workspace finit par être approuvé une fois que le démon a reconstruit son runtime, ce qui prend un moment.

- **Voir toutes les règles de confiance** : Pour afficher la liste complète de toutes vos règles de dossiers approuvés et non approuvés, vous pouvez inspecter le contenu du fichier `~/.qwen/trustedFolders.json` dans votre répertoire personnel.

## Le processus de vérification de la confiance (Avancé)

Pour les utilisateurs avancés, il est utile de connaître l'ordre exact des opérations pour déterminer la confiance :

1.  **Signal de confiance de l'IDE** : Si vous utilisez l'[intégration IDE](../ide-integration/ide-integration), le CLI demande d'abord à l'IDE si l'espace de travail est approuvé. La réponse de l'IDE a la priorité la plus élevée.

2.  **Fichier de confiance local** : Si l'IDE n'est pas connecté, le CLI vérifie le fichier central `~/.qwen/trustedFolders.json`.