# Intégration IDE

Gemini CLI peut s'intégrer à votre IDE pour offrir une expérience plus fluide et contextuelle. Cette intégration permet au CLI de mieux comprendre votre espace de travail et active des fonctionnalités puissantes comme le diffing natif dans l'éditeur.

Actuellement, le seul IDE supporté est [Visual Studio Code](https://code.visualstudio.com/) ainsi que les autres éditeurs qui supportent les extensions VS Code.

## Fonctionnalités

- **Contexte de l'espace de travail :** Le CLI prend automatiquement connaissance de votre espace de travail pour fournir des réponses plus pertinentes et précises. Ce contexte inclut :
  - Les **10 fichiers les plus récemment consultés** dans votre espace de travail.
  - La position actuelle de votre curseur.
  - Tout texte sélectionné (jusqu'à une limite de 16 Ko ; les sélections plus longues seront tronquées).

- **Diffing natif :** Lorsque Gemini propose des modifications de code, vous pouvez visualiser les changements directement dans le visualiseur de différences natif de votre IDE. Cela vous permet de revoir, modifier, accepter ou rejeter les changements suggérés de manière fluide.

- **Commandes VS Code :** Vous pouvez accéder aux fonctionnalités du CLI Gemini directement depuis la Palette de commandes de VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`) :
  - `Gemini CLI: Run` : Démarre une nouvelle session CLI Gemini dans le terminal intégré.
  - `Gemini CLI: Accept Diff` : Accepte les modifications dans l'éditeur de différences actif.
  - `Gemini CLI: Close Diff Editor` : Rejette les modifications et ferme l'éditeur de différences actif.
  - `Gemini CLI: View Third-Party Notices` : Affiche les mentions tierces pour l'extension.

## Installation et Configuration

Il existe trois façons de configurer l'intégration IDE :

### 1. Invitation Automatique (Recommandé)

Lorsque vous exécutez Gemini CLI dans un éditeur pris en charge, il détectera automatiquement votre environnement et vous proposera de vous connecter. Répondre "Yes" exécutera automatiquement la configuration nécessaire, qui inclut l'installation de l'extension companion et l'activation de la connexion.

### 2. Installation Manuelle depuis le CLI

Si vous avez précédemment ignoré l'invitation ou si vous souhaitez installer l'extension manuellement, vous pouvez exécuter la commande suivante dans Gemini CLI :

```
/ide install
```

Cette commande trouvera l'extension appropriée pour votre IDE et l'installera.

### 3. Installation manuelle depuis un marketplace

Vous pouvez également installer l'extension directement depuis un marketplace.

- **Pour Visual Studio Code :** Installez depuis le [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=google.gemini-cli-vscode-ide-companion).
- **Pour les forks de VS Code :** Pour supporter les forks de VS Code, l'extension est également publiée sur le [Open VSX Registry](https://open-vsx.org/extension/google/gemini-cli-vscode-ide-companion). Suivez les instructions de votre éditeur pour installer des extensions depuis ce registry.

Après n'importe quelle méthode d'installation, il est recommandé d'ouvrir une nouvelle fenêtre de terminal pour vous assurer que l'intégration est activée correctement. Une fois installée, vous pouvez utiliser `/ide enable` pour vous connecter.

## Usage

### Activation et Désactivation

Vous pouvez contrôler l'intégration IDE depuis le CLI :

- Pour activer la connexion à l'IDE, exécutez :
  ```
  /ide enable
  ```
- Pour désactiver la connexion, exécutez :
  ```
  /ide disable
  ```

Lorsque activée, l'IDE CLI tentera automatiquement de se connecter à l'extension compagnon de l'IDE.

### Vérification du Statut

Pour vérifier l'état de la connexion et voir le contexte que le CLI a reçu de l'IDE, exécutez :

```
/ide status
```

Si connecté, cette commande affichera l'IDE auquel il est connecté et une liste des fichiers récemment ouverts dont il a connaissance.

(Note : La liste des fichiers est limitée aux 10 fichiers récemment consultés dans votre workspace et inclut uniquement les fichiers locaux sur le disque.)

### Travailler avec les diffs

Quand vous demandez à Gemini de modifier un fichier, il peut ouvrir directement une vue diff dans votre éditeur.

**Pour accepter un diff**, vous pouvez effectuer l'une des actions suivantes :

- Cliquer sur l'**icône en forme de checkmark** dans la barre de titre de l'éditeur de diff.
- Sauvegarder le fichier (par exemple avec `Cmd+S` ou `Ctrl+S`).
- Ouvrir la Command Palette et exécuter **Gemini CLI: Accept Diff**.
- Répondre par `yes` dans le CLI quand vous y êtes invité.

**Pour rejeter un diff**, vous pouvez :

- Cliquer sur l'**icône 'x'** dans la barre de titre de l'éditeur de diff.
- Fermer l'onglet de l'éditeur de diff.
- Ouvrir la Command Palette et exécuter **Gemini CLI: Close Diff Editor**.
- Répondre par `no` dans le CLI quand vous y êtes invité.

Vous pouvez également **modifier les changements suggérés** directement dans la vue diff avant de les accepter.

Si vous sélectionnez 'Yes, allow always' dans le CLI, les modifications n'apparaîtront plus dans l'IDE car elles seront automatiquement acceptées.

## Utilisation avec le Sandboxing

Si vous utilisez Gemini CLI dans un environnement sandbox, veuillez prendre en compte les points suivants :

- **Sur macOS :** L'intégration avec l'IDE nécessite un accès réseau pour communiquer avec l'extension compagnon de l'IDE. Vous devez utiliser un profil Seatbelt qui autorise l'accès réseau.
- **Dans un conteneur Docker :** Si vous exécutez Gemini CLI à l'intérieur d'un conteneur Docker (ou Podman), l'intégration avec l'IDE peut toujours se connecter à l'extension VS Code qui s'exécute sur votre machine hôte. Le CLI est configuré pour trouver automatiquement le serveur IDE sur `host.docker.internal`. Aucune configuration spéciale n'est généralement requise, mais vous devrez peut-être vérifier que votre configuration réseau Docker autorise les connexions depuis le conteneur vers l'hôte.

## Dépannage

Si vous rencontrez des problèmes avec l'intégration IDE, voici quelques messages d'erreur courants et les méthodes pour les résoudre.

### Erreurs de connexion

- **Message :** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Cause :** Gemini CLI n'a pas pu trouver les variables d'environnement nécessaires (`GEMINI_CLI_IDE_WORKSPACE_PATH` ou `GEMINI_CLI_IDE_SERVER_PORT`) pour se connecter à l'IDE. Cela signifie généralement que l'extension compagnon de l'IDE n'est pas en cours d'exécution ou qu'elle n'a pas été initialisée correctement.
  - **Solution :**
    1. Assurez-vous d'avoir installé l'extension **Gemini CLI Companion** dans votre IDE et qu'elle est activée.
    2. Ouvrez une nouvelle fenêtre de terminal dans votre IDE pour vous assurer qu'elle récupère le bon environnement.

- **Message :** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Cause :** La connexion à l'extension compagnon de l'IDE a été perdue.
  - **Solution :** Exécutez `/ide enable` pour tenter de vous reconnecter. Si le problème persiste, ouvrez une nouvelle fenêtre de terminal ou redémarrez votre IDE.

### Erreurs de configuration

- **Message :** `🔴 Disconnected: Directory mismatch. Gemini CLI is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Cause :** Le répertoire de travail actuel de la CLI est en dehors du dossier ou de l'espace de travail que vous avez ouvert dans votre IDE.
  - **Solution :** Exécutez `cd` pour accéder au même répertoire que celui ouvert dans votre IDE, puis redémarrez la CLI.

- **Message :** `🔴 Disconnected: To use this feature, please open a single workspace folder in [IDE Name] and try again.`
  - **Cause :** Vous avez plusieurs dossiers d'espace de travail ouverts dans votre IDE, ou aucun dossier n'est ouvert. L'intégration IDE nécessite un seul dossier racine d'espace de travail pour fonctionner correctement.
  - **Solution :** Ouvrez un seul dossier de projet dans votre IDE et redémarrez la CLI.

### Erreurs générales

- **Message :** `L'intégration IDE n'est pas prise en charge dans votre environnement actuel. Pour utiliser cette fonctionnalité, exécutez Gemini CLI dans l'un de ces IDE pris en charge : [Liste des IDE]`
  - **Cause :** Vous exécutez Gemini CLI dans un terminal ou un environnement qui n'est pas un IDE pris en charge.
  - **Solution :** Exécutez Gemini CLI depuis le terminal intégré d'un IDE pris en charge, comme VS Code.

- **Message :** `Aucun installateur n'est disponible pour [Nom de l'IDE]. Veuillez installer l'extension IDE manuellement depuis son marketplace.`
  - **Cause :** Vous avez exécuté `/ide install`, mais le CLI ne dispose pas d'un installateur automatique pour votre IDE spécifique.
  - **Solution :** Ouvrez le marketplace d'extensions de votre IDE, recherchez "Gemini CLI Companion", et installez-le manuellement.