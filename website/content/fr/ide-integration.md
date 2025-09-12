# Intégration IDE

Qwen Code peut s'intégrer à votre IDE pour offrir une expérience plus fluide et contextuelle. Cette intégration permet au CLI de mieux comprendre votre espace de travail et active des fonctionnalités puissantes comme le diffing natif directement dans l'éditeur.

Actuellement, le seul IDE supporté est [Visual Studio Code](https://code.visualstudio.com/) ainsi que les autres éditeurs compatibles avec les extensions VS Code.

## Fonctionnalités

- **Contexte de l'espace de travail :** Le CLI prend automatiquement connaissance de votre espace de travail pour fournir des réponses plus pertinentes et précises. Ce contexte inclut :
  - Les **10 fichiers les plus récemment consultés** dans votre espace de travail.
  - La position actuelle de votre curseur.
  - Tout texte sélectionné (jusqu'à une limite de 16 Ko ; les sélections plus longues seront tronquées).

- **Diffing natif :** Lorsque Qwen propose des modifications de code, vous pouvez visualiser les changements directement dans le visualiseur de différences natif de votre IDE. Cela vous permet de revoir, modifier, accepter ou rejeter facilement les modifications suggérées.

- **Commandes VS Code :** Vous pouvez accéder aux fonctionnalités de Qwen Code directement depuis la Palette de commandes de VS Code (`Cmd+Shift+P` ou `Ctrl+Shift+P`) :
  - `Qwen Code: Run` : Démarre une nouvelle session Qwen Code dans le terminal intégré.
  - `Qwen Code: Accept Diff` : Accepte les modifications dans l'éditeur de différences actif.
  - `Qwen Code: Close Diff Editor` : Rejette les modifications et ferme l'éditeur de différences actif.
  - `Qwen Code: View Third-Party Notices` : Affiche les mentions relatives aux logiciels tiers utilisés par l'extension.

## Installation et Configuration

Il existe trois façons de configurer l'intégration IDE :

### 1. Invitation Automatique (Recommandé)

Lorsque vous exécutez Qwen Code dans un éditeur pris en charge, il détectera automatiquement votre environnement et vous invitera à vous connecter. Répondre par "Yes" lancera automatiquement la configuration nécessaire, qui inclut l'installation de l'extension companion et l'activation de la connexion.

### 2. Installation Manuelle depuis le CLI

Si vous avez précédemment ignoré l'invite ou si vous souhaitez installer l'extension manuellement, vous pouvez exécuter la commande suivante dans Qwen Code :

```
/ide install
```

Cette commande trouvera l'extension appropriée pour votre IDE et l'installera.

### 3. Installation manuelle depuis un Marketplace

Vous pouvez également installer l'extension directement depuis un marketplace.

- **Pour Visual Studio Code :** Installez depuis le [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Pour les forks de VS Code :** Pour supporter les forks de VS Code, l'extension est également publiée sur le [Open VSX Registry](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Suivez les instructions de votre éditeur pour installer des extensions depuis ce registre.

Après n'importe quelle méthode d'installation, il est recommandé d'ouvrir une nouvelle fenêtre de terminal pour vous assurer que l'intégration est activée correctement. Une fois installée, vous pouvez utiliser `/ide enable` pour vous connecter.

## Usage

### Activation et Désactivation

Vous pouvez contrôler l'intégration de l'IDE directement depuis le CLI :

- Pour activer la connexion à l'IDE, exécutez :
  ```
  /ide enable
  ```
- Pour désactiver la connexion, exécutez :
  ```
  /ide disable
  ```

Lorsque l'option est activée, Qwen Code tentera automatiquement de se connecter à l'extension compagnon de l'IDE.

### Vérification du Statut

Pour vérifier l'état de la connexion et voir le contexte que le CLI a reçu de l'IDE, exécutez :

```
/ide status
```

Si la connexion est établie, cette commande affichera l'IDE auquel il est connecté ainsi qu'une liste des fichiers récemment ouverts dont il a connaissance.

(Note : La liste des fichiers est limitée aux 10 fichiers récents accédés dans votre espace de travail et inclut uniquement les fichiers locaux présents sur le disque.)

### Travailler avec les diffs

Quand vous demandez à Gemini de modifier un fichier, il peut ouvrir directement une vue de diff dans votre éditeur.

**Pour accepter un diff**, vous pouvez effectuer l'une des actions suivantes :

- Cliquer sur l'**icône de validation (✓)** dans la barre de titre de l'éditeur de diff.
- Sauvegarder le fichier (par exemple avec `Cmd+S` ou `Ctrl+S`).
- Ouvrir la Command Palette et exécuter **Qwen Code: Accept Diff**.
- Répondre par `yes` dans le CLI quand vous y êtes invité.

**Pour rejeter un diff**, vous pouvez :

- Cliquer sur l'**icône 'x'** dans la barre de titre de l'éditeur de diff.
- Fermer l'onglet de l'éditeur de diff.
- Ouvrir la Command Palette et exécuter **Qwen Code: Close Diff Editor**.
- Répondre par `no` dans le CLI quand vous y êtes invité.

Vous pouvez également **modifier les changements suggérés** directement dans la vue de diff avant de les accepter.

Si vous sélectionnez ‘Yes, allow always’ dans le CLI, les modifications n’apparaîtront plus dans l'IDE car elles seront automatiquement acceptées.

## Utilisation avec le Sandboxing

Si vous utilisez Qwen Code dans un environnement sandbox, veuillez prendre en compte les points suivants :

- **Sur macOS :** L'intégration avec l'IDE nécessite un accès réseau pour communiquer avec l'extension compagnon de l'IDE. Vous devez utiliser un profil Seatbelt qui autorise l'accès réseau.
- **Dans un conteneur Docker :** Si vous exécutez Qwen Code à l'intérieur d'un conteneur Docker (ou Podman), l'intégration avec l'IDE peut toujours se connecter à l'extension VS Code qui s'exécute sur votre machine hôte. La CLI est configurée pour trouver automatiquement le serveur IDE sur `host.docker.internal`. Aucune configuration spéciale n'est généralement requise, mais vous devrez peut-être vérifier que votre configuration réseau Docker autorise les connexions depuis le conteneur vers l'hôte.

## Dépannage

Si vous rencontrez des problèmes avec l'intégration IDE, voici quelques messages d'erreur courants et les méthodes pour les résoudre.

### Erreurs de connexion

- **Message :** `🔴 Disconnected: Failed to connect to IDE companion extension for [IDE Name]. Please ensure the extension is running and try restarting your terminal. To install the extension, run /ide install.`
  - **Cause :** Qwen Code n’a pas pu trouver les variables d’environnement nécessaires (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) pour se connecter à l’IDE. Cela signifie généralement que l’extension companion de l’IDE n’est pas en cours d’exécution ou qu’elle n’a pas été initialisée correctement.
  - **Solution :**
    1. Assurez-vous d’avoir installé l’extension **Qwen Code Companion** dans votre IDE et qu’elle est activée.
    2. Ouvrez une nouvelle fenêtre de terminal dans votre IDE pour vous assurer qu’elle récupère le bon environnement.

- **Message :** `🔴 Disconnected: IDE connection error. The connection was lost unexpectedly. Please try reconnecting by running /ide enable`
  - **Cause :** La connexion à l’extension companion de l’IDE a été perdue.
  - **Solution :** Exécutez `/ide enable` pour tenter de vous reconnecter. Si le problème persiste, ouvrez une nouvelle fenêtre de terminal ou redémarrez votre IDE.

### Erreurs de configuration

- **Message :** `🔴 Disconnected: Directory mismatch. Qwen Code is running in a different location than the open workspace in [IDE Name]. Please run the CLI from the same directory as your project's root folder.`
  - **Cause :** Le répertoire de travail actuel de la CLI se trouve en dehors du dossier ou de l'espace de travail que vous avez ouvert dans votre IDE.
  - **Solution :** Utilisez `cd` pour accéder au même répertoire que celui ouvert dans votre IDE, puis redémarrez la CLI.

- **Message :** `🔴 Disconnected: To use this feature, please open a single workspace folder in [IDE Name] and try again.`
  - **Cause :** Vous avez plusieurs dossiers d'espace de travail ouverts dans votre IDE, ou aucun dossier n'est ouvert. L'intégration avec l'IDE nécessite un seul dossier racine d'espace de travail pour fonctionner correctement.
  - **Solution :** Ouvrez un seul dossier de projet dans votre IDE et redémarrez la CLI.

### Erreurs générales

- **Message :** `L'intégration IDE n'est pas prise en charge dans votre environnement actuel. Pour utiliser cette fonctionnalité, exécutez Qwen Code dans l'un de ces IDE pris en charge : [Liste des IDE]`
  - **Cause :** Vous exécutez Qwen Code dans un terminal ou un environnement qui n'est pas un IDE pris en charge.
  - **Solution :** Exécutez Qwen Code depuis le terminal intégré d'un IDE pris en charge, comme VS Code.

- **Message :** `Aucun installateur n'est disponible pour [Nom de l'IDE]. Veuillez installer l'extension IDE manuellement depuis son marketplace.`
  - **Cause :** Vous avez exécuté `/ide install`, mais le CLI ne dispose pas d'un installateur automatisé pour votre IDE spécifique.
  - **Solution :** Ouvrez le marketplace d'extensions de votre IDE, recherchez "Qwen Code Companion", et installez-le manuellement.