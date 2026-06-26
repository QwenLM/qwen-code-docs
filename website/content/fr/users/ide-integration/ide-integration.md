# Intégration IDE

Qwen Code peut s'intégrer à votre IDE pour offrir une expérience plus fluide et contextuelle. Cette intégration permet au CLI de mieux comprendre votre espace de travail et active des fonctionnalités puissantes comme l'affichage natif des différences dans l'éditeur.

Actuellement, le seul IDE pris en charge est [Visual Studio Code](https://code.visualstudio.com/) ainsi que les autres éditeurs supportant les extensions VS Code. Pour prendre en charge d'autres éditeurs, consultez le [Spécification de l'extension compagnon IDE](../ide-integration/ide-companion-spec).

## Fonctionnalités

- **Contexte de l'espace de travail :** Le CLI prend automatiquement conscience de votre espace de travail pour fournir des réponses plus pertinentes et précises. Ce contexte inclut :
  - Les **10 fichiers les plus récemment accédés** dans votre espace de travail.
  - La position actuelle de votre curseur.
  - Tout texte que vous avez sélectionné (limite de 16 Ko ; les sélections plus longues seront tronquées).

- **Affichage natif des différences :** Lorsque Qwen suggère des modifications de code, vous pouvez visualiser les changements directement dans le visualiseur de différences natif de votre IDE. Cela vous permet d'examiner, modifier, accepter ou rejeter les modifications suggérées en toute fluidité.

- **Commandes VS Code :** Vous pouvez accéder aux fonctionnalités de Qwen Code directement depuis la Palette de commandes VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`) :
  - `Qwen Code: Run` : Démarre une nouvelle session Qwen Code dans le terminal intégré.
  - `Qwen Code: Accept Diff` : Accepte les modifications dans l'éditeur de différences actif.
  - `Qwen Code: Close Diff Editor` : Rejette les modifications et ferme l'éditeur de différences actif.
  - `Qwen Code: View Third-Party Notices` : Affiche les mentions légales des tiers pour l'extension.

## Installation et configuration

Il existe trois façons de configurer l'intégration IDE :

### 1. Invite automatique (recommandé)

Lorsque vous exécutez Qwen Code dans un éditeur pris en charge, il détecte automatiquement votre environnement et vous invite à vous connecter. Répondre « Oui » exécute automatiquement la configuration nécessaire, ce qui inclut l'installation de l'extension compagnon et l'activation de la connexion.

### 2. Installation manuelle depuis le CLI

Si vous avez précédemment ignoré l'invite ou souhaitez installer l'extension manuellement, vous pouvez exécuter la commande suivante dans Qwen Code :

```
/ide install
```

Cela trouvera l'extension correcte pour votre IDE et l'installera.

### 3. Installation manuelle depuis une place de marché

Vous pouvez également installer l'extension directement depuis une place de marché.

- **Pour Visual Studio Code :** Installez-la depuis le [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Pour les forks de VS Code :** Pour prendre en charge les forks de VS Code, l'extension est également publiée sur le [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Suivez les instructions de votre éditeur pour installer des extensions depuis ce registre.

> NOTE :
> L'extension « Qwen Code Companion » peut apparaître en bas des résultats de recherche. Si vous ne la voyez pas immédiatement, essayez de faire défiler vers le bas ou de trier par « Nouvellement publié ».
>
> Après avoir installé manuellement l'extension, vous devez exécuter `/ide enable` dans le CLI pour activer l'intégration.

## Utilisation

### Activation et désactivation

Vous pouvez contrôler l'intégration IDE depuis le CLI :

- Pour activer la connexion à l'IDE, exécutez :
  ```
  /ide enable
  ```
- Pour désactiver la connexion, exécutez :
  ```
  /ide disable
  ```

Lorsqu'elle est activée, Qwen Code tente automatiquement de se connecter à l'extension compagnon IDE.

### Vérification du statut

Pour vérifier l'état de la connexion et voir le contexte que le CLI a reçu de l'IDE, exécutez :

```
/ide status
```

Si connecté, cette commande affiche l'IDE auquel il est connecté ainsi qu'une liste des fichiers récemment ouverts dont il a connaissance.

(Remarque : la liste des fichiers est limitée aux 10 fichiers les plus récemment accédés dans votre espace de travail et n'inclut que les fichiers locaux sur le disque.)

### Travailler avec les différences

Lorsque vous demandez au modèle Qwen de modifier un fichier, il peut ouvrir une vue de différences directement dans votre éditeur.

**Pour accepter une différence**, vous pouvez effectuer l'une des actions suivantes :

- Cliquez sur l'**icône de coche** dans la barre de titre de l'éditeur de différences.
- Enregistrez le fichier (par exemple avec `Cmd+S` ou `Ctrl+S`).
- Ouvrez la Palette de commandes et exécutez **Qwen Code: Accept Diff**.
- Répondez `yes` dans le CLI lorsque vous y êtes invité.

**Pour rejeter une différence**, vous pouvez :

- Cliquez sur l'**icône 'x'** dans la barre de titre de l'éditeur de différences.
- Fermez l'onglet de l'éditeur de différences.
- Ouvrez la Palette de commandes et exécutez **Qwen Code: Close Diff Editor**.
- Répondez `no` dans le CLI lorsque vous y êtes invité.

Vous pouvez également **modifier les changements suggérés** directement dans la vue des différences avant de les accepter.

Si vous sélectionnez « Oui, toujours autoriser » dans le CLI, les changements n'apparaîtront plus dans l'IDE car ils seront automatiquement acceptés.

## Utilisation avec un sandbox

Si vous utilisez Qwen Code dans un sandbox, veuillez noter les points suivants :

- **Sur macOS :** L'intégration IDE nécessite un accès réseau pour communiquer avec l'extension compagnon IDE. Vous devez utiliser un profil Seatbelt qui autorise l'accès réseau.
- **Dans un conteneur Docker :** Si vous exécutez Qwen Code dans un conteneur Docker (ou Podman), l'intégration IDE peut toujours se connecter à l'extension VS Code qui s'exécute sur votre machine hôte. Le CLI est configuré pour trouver automatiquement le serveur IDE sur `host.docker.internal`. Aucune configuration spéciale n'est généralement requise, mais vous devrez peut-être vous assurer que votre configuration réseau Docker permet les connexions du conteneur vers l'hôte.

## Dépannage

Si vous rencontrez des problèmes avec l'intégration IDE, voici quelques messages d'erreur courants et comment les résoudre.

### Erreurs de connexion

- **Message :** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Cause :** Qwen Code n'a pas trouvé les variables d'environnement nécessaires (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) pour se connecter à l'IDE. Cela signifie généralement que l'extension compagnon IDE n'est pas en cours d'exécution ou ne s'est pas initialisée correctement.
  - **Solution :**
    1.  Assurez-vous d'avoir installé l'extension **Qwen Code Companion** dans votre IDE et qu'elle est activée.
    2.  Ouvrez une nouvelle fenêtre de terminal dans votre IDE pour garantir qu'elle récupère le bon environnement.

- **Message :** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Cause :** La connexion à l'extension compagnon IDE a été perdue.
  - **Solution :** Exécutez `/ide enable` pour tenter de vous reconnecter. Si le problème persiste, ouvrez une nouvelle fenêtre de terminal ou redémarrez votre IDE.

### Erreurs de configuration

- **Message :** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Cause :** Le répertoire de travail actuel du CLI se trouve en dehors du dossier ou de l'espace de travail ouvert dans votre IDE.
  - **Solution :** `cd` vers le même répertoire que celui ouvert dans votre IDE et redémarrez le CLI.

- **Message :** `🔴 Disconnected: To use this feature, please open a workspace folder in [IDE Name] and try again.`
  - **Cause :** Vous n'avez aucun espace de travail ouvert dans votre IDE.
  - **Solution :** Ouvrez un espace de travail dans votre IDE et redémarrez le CLI.

### Erreurs générales

- **Message :** `IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: [List of IDEs]`
  - **Cause :** Vous exécutez Qwen Code dans un terminal ou un environnement qui n'est pas un IDE pris en charge.
  - **Solution :** Exécutez Qwen Code depuis le terminal intégré d'un IDE pris en charge, comme VS Code.

- **Message :** `No installer is available for IDE. Please install the Qwen Code Companion extension manually from the marketplace.`
  - **Cause :** Vous avez exécuté `/ide install`, mais le CLI ne dispose pas d'un installateur automatisé pour votre IDE spécifique.
  - **Solution :** Ouvrez la place de marché des extensions de votre IDE, recherchez « Qwen Code Companion » et installez-la manuellement.