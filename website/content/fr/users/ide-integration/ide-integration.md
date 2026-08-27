# Intégration IDE

Qwen Code peut s'intégrer à votre IDE pour offrir une expérience plus fluide et consciente du contexte. Cette intégration permet à la CLI de mieux comprendre votre espace de travail et active des fonctionnalités puissantes comme la visualisation native des diffs directement dans l'éditeur.

Actuellement, le seul IDE pris en charge est [Visual Studio Code](https://code.visualstudio.com/) et les autres éditeurs compatibles avec les extensions VS Code. Pour ajouter la prise en charge d'autres éditeurs, consultez la [spécification de l'extension IDE Companion](../ide-integration/ide-companion-spec).

## Fonctionnalités

- **Contexte de l'espace de travail :** La CLI prend automatiquement connaissance de votre espace de travail pour fournir des réponses plus pertinentes et précises. Ce contexte inclut :
  - Les **10 fichiers les plus récemment consultés** de votre espace de travail.
  - La position active de votre curseur.
  - Tout texte que vous avez sélectionné (dans la limite de 16 Ko ; les sélections plus longues seront tronquées).

- **Diff natif :** Lorsque Qwen suggère des modifications de code, vous pouvez visualiser les changements directement dans le visualiseur de diff natif de votre IDE. Cela vous permet de revoir, modifier, accepter ou rejeter les modifications suggérées de manière transparente.

- **Commandes VS Code :** Vous pouvez accéder aux fonctionnalités de Qwen Code directement depuis la palette de commandes de VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`) :
  - `Qwen Code: Run` : Démarre une nouvelle session Qwen Code dans le terminal intégré.
  - `Qwen Code: Accept Diff` : Accepte les modifications dans l'éditeur de diff actif.
  - `Qwen Code: Close Diff Editor` : Rejette les modifications et ferme l'éditeur de diff actif.
  - `Qwen Code: View Third-Party Notices` : Affiche les mentions légales des tiers pour l'extension.

## Installation et configuration

Il existe trois façons de configurer l'intégration IDE :

### 1. Suggestion automatique (recommandé)

Lorsque vous exécutez Qwen Code dans un éditeur pris en charge, il détecte automatiquement votre environnement et vous propose de vous connecter. Répondre « Oui » exécutera automatiquement la configuration nécessaire, ce qui inclut l'installation de l'extension companion et l'activation de la connexion.

### 2. Installation manuelle depuis la CLI

Si vous avez précédemment ignoré la proposition ou si vous souhaitez installer l'extension manuellement, vous pouvez exécuter la commande suivante dans Qwen Code :

```
/ide install
```

Cela trouvera l'extension appropriée pour votre IDE et l'installera.

### 3. Installation manuelle depuis une Marketplace

Vous pouvez également installer l'extension directement depuis une Marketplace.

- **Pour Visual Studio Code :** Installez-la depuis le [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Pour les forks de VS Code :** Pour prendre en charge les forks de VS Code, l'extension est également publiée sur le [registre Open VSX](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Suivez les instructions de votre éditeur pour installer les extensions depuis ce registre.

> NOTE:
> L'extension « Qwen Code Companion » peut apparaître vers le bas des résultats de recherche. Si vous ne la voyez pas immédiatement, essayez de faire défiler vers le bas ou de trier par « Publiés récemment ».
>
> Après avoir installé l'extension manuellement, vous devez exécuter `/ide enable` dans la CLI pour activer l'intégration.

## Utilisation

### Activation et désactivation

Vous pouvez contrôler l'intégration IDE depuis la CLI :

- Pour activer la connexion à l'IDE, exécutez :
  ```
  /ide enable
  ```
- Pour désactiver la connexion, exécutez :
  ```
  /ide disable
  ```

Une fois activée, Qwen Code tentera automatiquement de se connecter à l'extension IDE Companion.

### Vérification du statut

Pour vérifier le statut de la connexion et voir le contexte que la CLI a reçu de l'IDE, exécutez :

```
/ide status
```

Si la connexion est établie, cette commande affichera l'IDE auquel elle est connectée ainsi qu'une liste des fichiers récemment ouverts dont elle a connaissance.

(Remarque : La liste des fichiers est limitée aux 10 fichiers les plus récemment consultés dans votre espace de travail et n'inclut que les fichiers locaux sur le disque.)

### Gestion des diffs

Lorsque vous demandez au modèle Qwen de modifier un fichier, il peut ouvrir une vue de diff directement dans votre éditeur.

**Pour accepter un diff**, vous pouvez effectuer l'une des actions suivantes :

- Cliquez sur l'**icône de coche** dans la barre de titre de l'éditeur de diff.
- Enregistrez le fichier (par exemple, avec `Cmd+S` ou `Ctrl+S`).
- Ouvrez la palette de commandes et exécutez **Qwen Code: Accept Diff**.
- Répondez `yes` dans la CLI lorsque vous y êtes invité.

**Pour rejeter un diff**, vous pouvez :

- Cliquez sur l'**icône « x »** dans la barre de titre de l'éditeur de diff.
- Fermez l'onglet de l'éditeur de diff.
- Ouvrez la palette de commandes et exécutez **Qwen Code: Close Diff Editor**.
- Répondez `no` dans la CLI lorsque vous y êtes invité.

Vous pouvez également **modifier les changements suggérés** directement dans la vue de diff avant de les accepter.

Si vous sélectionnez « Yes, allow always » dans la CLI, les modifications ne s'afficheront plus dans l'IDE car elles seront acceptées automatiquement.

## Utilisation avec un sandbox

Si vous utilisez Qwen Code dans un sandbox, veuillez prendre en compte les points suivants :

- **Sur macOS :** L'intégration IDE nécessite un accès réseau pour communiquer avec l'extension IDE Companion. Vous devez utiliser un profil Seatbelt qui autorise l'accès réseau.
- **Dans un conteneur Docker :** Si vous exécutez Qwen Code dans un conteneur Docker (ou Podman), l'intégration IDE peut tout de même se connecter à l'extension VS Code s'exécutant sur votre machine hôte. La CLI est configurée pour trouver automatiquement le serveur IDE sur `host.docker.internal`. Aucune configuration spéciale n'est généralement requise, mais vous devrez peut-être vous assurer que votre configuration réseau Docker autorise les connexions du conteneur vers l'hôte.

## Dépannage

Si vous rencontrez des problèmes avec l'intégration IDE, voici quelques messages d'erreur courants et la manière de les résoudre.

### Erreurs de connexion

- **Message :** `● Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Cause :** Qwen Code n'a pas pu trouver les variables d'environnement nécessaires (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) pour se connecter à l'IDE. Cela signifie généralement que l'extension IDE Companion n'est pas en cours d'exécution ou ne s'est pas initialisée correctement.
  - **Solution :**
    1. Assurez-vous d'avoir installé l'extension **Qwen Code Companion** dans votre IDE et qu'elle est activée.
    2. Ouvrez une nouvelle fenêtre de terminal dans votre IDE pour vous assurer qu'il récupère le bon environnement.

- **Message :** `● Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Cause :** La connexion à l'IDE Companion a été perdue.
  - **Solution :** Exécutez `/ide enable` pour tenter de vous reconnecter. Si le problème persiste, ouvrez une nouvelle fenêtre de terminal ou redémarrez votre IDE.

### Erreurs de configuration

- **Message :** `● Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Cause :** Le répertoire de travail actuel de la CLI se trouve en dehors du dossier ou de l'espace de travail que vous avez ouvert dans votre IDE.
  - **Solution :** Utilisez `cd` pour aller dans le même répertoire que celui ouvert dans votre IDE et redémarrez la CLI.

- **Message :** `● Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Cause :** Vous n'avez aucun espace de travail ouvert dans votre IDE.
  - **Solution :** Ouvrez un espace de travail dans votre IDE et redémarrez la CLI.

### Erreurs générales

- **Message :** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **Cause :** Vous exécutez Qwen Code dans un terminal ou un environnement qui n'est pas un IDE pris en charge.
  - **Solution :** Exécutez Qwen Code depuis le terminal intégré d'un IDE pris en charge, comme VS Code.

- **Message :** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **Cause :** Vous avez exécuté `/ide install`, mais la CLI ne dispose pas d'un installateur automatisé pour votre IDE spécifique.
  - **Solution :** Ouvrez la Marketplace d'extensions de votre IDE, recherchez « Qwen Code Companion » et installez-la manuellement.