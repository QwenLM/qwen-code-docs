# Intégration IDE

Qwen Code peut s'intégrer à votre IDE pour offrir une expérience plus fluide et contextuelle. Cette intégration permet au CLI de mieux comprendre votre espace de travail et active des fonctionnalités puissantes comme le diff natif dans l'éditeur.

Actuellement, le seul IDE pris en charge est [Visual Studio Code](https://code.visualstudio.com/) ainsi que les autres éditeurs qui supportent les extensions VS Code. Pour développer le support d'autres éditeurs, consultez la [Spécification de l'Extension Compagnon IDE](../users/ide-integration/ide-companion-spec).

## Fonctionnalités

- **Contexte de l'espace de travail :** L'interface en ligne de commande (CLI) prend automatiquement connaissance de votre espace de travail pour fournir des réponses plus pertinentes et précises. Ce contexte inclut :
  - Les **10 fichiers les plus récemment consultés** dans votre espace de travail.
  - La position actuelle de votre curseur.
  - Tout texte sélectionné (jusqu'à une limite de 16 Ko ; les sélections plus longues seront tronquées).

- **Comparaison native :** Lorsque Qwen propose des modifications de code, vous pouvez visualiser directement ces changements dans l'outil de comparaison natif de votre IDE. Cela vous permet d'examiner, modifier, puis accepter ou rejeter facilement les suggestions.

- **Commandes VS Code :** Vous pouvez accéder aux fonctionnalités de Qwen Code directement depuis la palette de commandes de VS Code (`Cmd+Maj+P` ou `Ctrl+Maj+P`) :
  - `Qwen Code: Run` : Démarre une nouvelle session Qwen Code dans le terminal intégré.
  - `Qwen Code: Accept Diff` : Accepte les modifications dans l'éditeur de différences actif.
  - `Qwen Code: Close Diff Editor` : Rejette les modifications et ferme l'éditeur de différences actif.
  - `Qwen Code: View Third-Party Notices` : Affiche les mentions relatives aux logiciels tiers utilisés par l'extension.

## Installation et Configuration

Il existe trois façons de configurer l'intégration de l'IDE :

### 1. Invitation Automatique (Recommandé)

Lorsque vous exécutez Qwen Code dans un éditeur pris en charge, il détectera automatiquement votre environnement et vous invitera à vous connecter. Répondre par "Oui" exécutera automatiquement la configuration nécessaire, ce qui inclut l'installation de l'extension associée et l'activation de la connexion.

### 2. Installation Manuelle via CLI

Si vous avez précédemment ignoré l'invite ou si vous souhaitez installer l'extension manuellement, vous pouvez exécuter la commande suivante dans Qwen Code :

```
/ide install
```

Cette commande trouvera l'extension appropriée pour votre IDE et l'installera.

### 3. Installation manuelle depuis un marketplace

Vous pouvez également installer l'extension directement depuis un marketplace.

- **Pour Visual Studio Code :** Installez depuis le [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Pour les variantes de VS Code :** Afin de prendre en charge les variantes de VS Code, l'extension est également publiée sur le [Registre Open VSX](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Suivez les instructions de votre éditeur pour installer des extensions depuis ce registre.

> REMARQUE :
> L'extension « Qwen Code Companion » peut apparaître vers le bas des résultats de recherche. Si vous ne la voyez pas immédiatement, essayez de faire défiler vers le bas ou triez par « Nouvellement publié ».
>
> Après avoir installé manuellement l'extension, vous devez exécuter `/ide enable` dans la CLI pour activer l'intégration.

## Utilisation

### Activation et Désactivation

Vous pouvez contrôler l'intégration de l'IDE depuis l'interface en ligne de commande (CLI) :

- Pour activer la connexion à l'IDE, exécutez :
  ```
  /ide enable
  ```
- Pour désactiver la connexion, exécutez :
  ```
  /ide disable
  ```

Lorsqu'elle est activée, Qwen Code tentera automatiquement de se connecter à l'extension compagnon de l'IDE.

### Vérification du Statut

Pour vérifier l'état de la connexion et voir le contexte que la CLI a reçu de l'IDE, exécutez :

```
/ide status
```

Si la connexion est établie, cette commande affichera l'IDE auquel elle est connectée ainsi qu'une liste des fichiers récemment ouverts dont elle a connaissance.

(Remarque : La liste des fichiers est limitée aux 10 fichiers récemment consultés dans votre espace de travail et inclut uniquement les fichiers locaux présents sur le disque.)

### Travailler avec les diffs

Lorsque vous demandez au modèle Qwen de modifier un fichier, il peut ouvrir directement une vue de diff dans votre éditeur.

**Pour accepter un diff**, vous pouvez effectuer l'une des actions suivantes :

- Cliquez sur l'**icône de coche** dans la barre de titre de l'éditeur de diff.
- Enregistrez le fichier (par exemple, avec `Cmd+S` ou `Ctrl+S`).
- Ouvrez la palette de commandes et exécutez **Qwen Code: Accept Diff**.
- Répondez par `yes` dans l'interface en ligne de commande (CLI) lorsque vous y êtes invité.

**Pour rejeter un diff**, vous pouvez :

- Cliquez sur l'**icône 'x'** dans la barre de titre de l'éditeur de diff.
- Fermez l'onglet de l'éditeur de diff.
- Ouvrez la palette de commandes et exécutez **Qwen Code: Close Diff Editor**.
- Répondez par `no` dans l'interface en ligne de commande (CLI) lorsque vous y êtes invité.

Vous pouvez également **modifier les changements suggérés** directement dans la vue de diff avant de les accepter.

Si vous sélectionnez « Yes, allow always » dans l'interface en ligne de commande (CLI), les modifications n'apparaîtront plus dans l'IDE car elles seront automatiquement acceptées.

## Utilisation avec le bac à sable (Sandboxing)

Si vous utilisez Qwen Code dans un environnement sandbox, veuillez prendre en compte les points suivants :

- **Sur macOS :** L'intégration avec l'IDE nécessite un accès réseau pour communiquer avec l'extension compagnon de l'IDE. Vous devez utiliser un profil Seatbelt qui autorise l'accès réseau.
- **Dans un conteneur Docker :** Si vous exécutez Qwen Code à l'intérieur d'un conteneur Docker (ou Podman), l'intégration avec l'IDE peut toujours se connecter à l'extension VS Code installée sur votre machine hôte. La CLI est configurée pour trouver automatiquement le serveur IDE sur `host.docker.internal`. Aucune configuration particulière n'est généralement requise, mais il se peut que vous deviez vérifier que la configuration réseau de votre Docker autorise les connexions du conteneur vers l'hôte.

## Dépannage

Si vous rencontrez des problèmes avec l'intégration de l'IDE, voici quelques messages d'erreur courants et les moyens de les résoudre.

### Erreurs de connexion

- **Message :** `🔴 Déconnecté : Échec de la connexion à l'extension compagnon de l'IDE pour [Nom de l'IDE]. Veuillez vous assurer que l'extension est en cours d'exécution et essayez de redémarrer votre terminal. Pour installer l'extension, exécutez /ide install.`
  - **Cause :** Qwen Code n'a pas pu trouver les variables d'environnement nécessaires (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) pour se connecter à l'IDE. Cela signifie généralement que l'extension compagnon de l'IDE n'est pas en cours d'exécution ou qu'elle ne s'est pas initialisée correctement.
  - **Solution :**
    1. Assurez-vous d'avoir installé l'extension **Qwen Code Companion** dans votre IDE et qu'elle est activée.
    2. Ouvrez une nouvelle fenêtre de terminal dans votre IDE pour vous assurer qu'il récupère le bon environnement.

- **Message :** `🔴 Déconnecté : Erreur de connexion à l'IDE. La connexion a été perdue de manière inattendue. Veuillez essayer de vous reconnecter en exécutant /ide enable`
  - **Cause :** La connexion à l'extension compagnon de l'IDE a été perdue.
  - **Solution :** Exécutez `/ide enable` pour tenter de vous reconnecter. Si le problème persiste, ouvrez une nouvelle fenêtre de terminal ou redémarrez votre IDE.

### Erreurs de configuration

- **Message :** `🔴 Déconnecté : Incompatibilité de répertoire. Qwen Code s'exécute dans un emplacement différent de celui du workspace ouvert dans [IDE Name]. Veuillez exécuter la CLI depuis le même répertoire que le dossier racine de votre projet.`
  - **Cause :** Le répertoire de travail actuel de la CLI se trouve en dehors du dossier ou workspace ouvert dans votre IDE.
  - **Solution :** Exécutez la commande `cd` pour accéder au même répertoire que celui ouvert dans votre IDE, puis redémarrez la CLI.

- **Message :** `🔴 Déconnecté : Pour utiliser cette fonctionnalité, veuillez ouvrir un dossier de workspace dans [IDE Name] et réessayer.`
  - **Cause :** Aucun workspace n'est ouvert dans votre IDE.
  - **Solution :** Ouvrez un workspace dans votre IDE et redémarrez la CLI.

### Erreurs générales

- **Message :** `L'intégration IDE n'est pas prise en charge dans votre environnement actuel. Pour utiliser cette fonctionnalité, exécutez Qwen Code dans l'un de ces IDE pris en charge : [Liste des IDE]`
  - **Cause :** Vous exécutez Qwen Code dans un terminal ou un environnement qui n'est pas un IDE pris en charge.
  - **Solution :** Exécutez Qwen Code depuis le terminal intégré d'un IDE pris en charge, comme VS Code.

- **Message :** `Aucun installateur n'est disponible pour l'IDE. Veuillez installer manuellement l'extension Qwen Code Companion depuis le marketplace.`
  - **Cause :** Vous avez exécuté `/ide install`, mais la CLI ne dispose pas d'un installateur automatisé pour votre IDE spécifique.
  - **Solution :** Ouvrez le marketplace d'extensions de votre IDE, recherchez "Qwen Code Companion" et installez-le manuellement.