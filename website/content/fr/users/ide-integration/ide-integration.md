# Intégration à l’IDE

Qwen Code peut s’intégrer à votre IDE afin d’offrir une expérience plus fluide et mieux adaptée au contexte. Cette intégration permet à l’interface en ligne de commande (CLI) de mieux comprendre votre espace de travail et active des fonctionnalités avancées, comme la comparaison native des différences directement dans l’éditeur.

Pour le moment, le seul IDE pris en charge est [Visual Studio Code](https://code.visualstudio.com/), ainsi que les autres éditeurs compatibles avec les extensions VS Code. Pour ajouter la prise en charge d’autres éditeurs, consultez la [spécification de l’extension IDE Companion](../ide-integration/ide-companion-spec).

## Fonctionnalités

- **Contexte de l’espace de travail** : L’interface en ligne de commande (CLI) prend automatiquement connaissance de votre espace de travail afin de fournir des réponses plus pertinentes et précises. Ce contexte comprend notamment :
  - Les **10 fichiers les plus récemment consultés** dans votre espace de travail.
  - La position active de votre curseur.
  - Tout texte que vous avez sélectionné (jusqu’à une limite de 16 Ko ; les sélections plus longues seront tronquées).

- **Diff natif** : Lorsque Qwen suggère des modifications de code, vous pouvez visualiser ces changements directement dans l’afficheur de différences natif de votre IDE. Cela vous permet d’examiner, de modifier, puis d’accepter ou de rejeter les modifications suggérées de façon transparente.

- **Commandes VS Code** : Vous pouvez accéder aux fonctionnalités de Qwen Code directement depuis la palette de commandes de VS Code (`Cmd+Maj+P` ou `Ctrl+Maj+P`) :
  - `Qwen Code : Exécuter` : démarre une nouvelle session Qwen Code dans le terminal intégré.
  - `Qwen Code : Accepter la différence` : accepte les modifications présentes dans l’éditeur de différences actif.
  - `Qwen Code : Fermer l’éditeur de différences` : rejette les modifications et ferme l’éditeur de différences actif.
  - `Qwen Code : Afficher les mentions relatives aux composants tiers` : affiche les mentions légales relatives aux composants tiers utilisés par l’extension.

## Installation et configuration

Il existe trois façons de configurer l’intégration avec votre environnement de développement intégré (IDE) :

### 1. Invite automatique (recommandé)

Lorsque vous exécutez Qwen Code dans un éditeur pris en charge, celui-ci détecte automatiquement votre environnement et vous invite à établir une connexion. En répondant « Oui », la configuration nécessaire est lancée automatiquement, ce qui inclut l’installation de l’extension complémentaire et l’activation de la connexion.

### 2. Installation manuelle depuis l’interface en ligne de commande (CLI)

Si vous avez précédemment ignoré l’invite ou si vous souhaitez installer l’extension manuellement, exécutez la commande suivante dans Qwen Code :

```
/ide install
```

Celle-ci identifie l’extension adaptée à votre IDE et l’installe.

### 3. Installation manuelle depuis une place de marché

Vous pouvez également installer l’extension directement depuis une place de marché.

- **Pour Visual Studio Code** : installez-la depuis la [place de marché VS Code](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).
- **Pour les versions dérivées de VS Code** : afin de prendre en charge les versions dérivées de VS Code, l’extension est également publiée sur le [registre Open VSX](https://open-vsx.org/extension/qwenlm/qwen-code-vscode-ide-companion). Suivez les instructions de votre éditeur pour installer des extensions à partir de ce registre.

> NOTE :
> L’extension « Qwen Code Companion » peut apparaître vers le bas des résultats de recherche. Si vous ne la voyez pas immédiatement, essayez de faire défiler vers le bas ou de trier les résultats par « Récemment publié ».
>
> Après avoir installé manuellement l’extension, vous devez exécuter la commande `/ide enable` dans l’interface CLI pour activer l’intégration.

## Utilisation

### Activation et désactivation

Vous pouvez contrôler l’intégration avec l’IDE directement depuis l’interface CLI :

- Pour activer la connexion à l’IDE, exécutez :
  ```
  /ide enable
  ```
- Pour désactiver la connexion, exécutez :
  ```
  /ide disable
  ```

Lorsqu’elle est activée, Qwen Code tente automatiquement de se connecter à l’extension compagnon de l’IDE.

### Vérification de l’état

Pour vérifier l’état de la connexion et afficher le contexte reçu par la CLI depuis l’IDE, exécutez :

```
/ide status
```

Si une connexion est établie, cette commande indique l’IDE auquel elle est reliée ainsi qu’une liste des fichiers récemment ouverts dont elle a connaissance.

(Remarque : la liste des fichiers est limitée aux 10 fichiers les plus récemment consultés dans votre espace de travail et ne comprend que les fichiers locaux présents sur le disque.)

### Travailler avec les différences

Lorsque vous demandez au modèle Qwen de modifier un fichier, celui-ci peut ouvrir directement une vue des différences dans votre éditeur.

**Pour accepter une différence**, vous pouvez effectuer l’une des actions suivantes :

- Cliquer sur l’**icône de coche** dans la barre de titre de l’éditeur de différences.
- Enregistrer le fichier (par exemple avec `Cmd+S` ou `Ctrl+S`).
- Ouvrir la palette de commandes et exécuter **Qwen Code : Accepter la différence**.
- Répondre `oui` dans l’interface en ligne de commande (CLI) lorsqu’on vous y invite.

**Pour rejeter une différence**, vous pouvez :

- Cliquer sur l’**icône « × »** dans la barre de titre de l’éditeur de différences.
- Fermer l’onglet de l’éditeur de différences.
- Ouvrir la palette de commandes et exécuter **Qwen Code : Fermer l’éditeur de différences**.
- Répondre `non` dans l’interface en ligne de commande (CLI) lorsqu’on vous y invite.

Vous pouvez également **modifier directement les changements suggérés** dans la vue des différences avant de les accepter.

Si vous sélectionnez « Oui, autoriser toujours » dans l’interface en ligne de commande (CLI), les modifications n’apparaîtront plus dans l’IDE, car elles seront automatiquement acceptées.

## Utilisation avec le bac à sable

Si vous utilisez Qwen Code au sein d’un bac à sable, veuillez prendre en compte les points suivants :

- **Sur macOS :** L’intégration à l’IDE nécessite un accès réseau pour communiquer avec l’extension compagnon de l’IDE. Vous devez utiliser un profil Seatbelt autorisant l’accès réseau.
- **Dans un conteneur Docker :** Si vous exécutez Qwen Code dans un conteneur Docker (ou Podman), l’intégration à l’IDE peut tout de même se connecter à l’extension VS Code exécutée sur votre machine hôte. L’interface en ligne de commande est configurée pour détecter automatiquement le serveur IDE à l’adresse `host.docker.internal`. Aucune configuration particulière n’est généralement requise, mais vous devrez peut-être vérifier que votre configuration réseau Docker autorise les connexions depuis le conteneur vers la machine hôte.

## Résolution des problèmes

Si vous rencontrez des problèmes avec l’intégration à l’IDE, voici quelques messages d’erreur courants ainsi que les solutions associées.

### Erreurs de connexion

- **Message :** `🔴 Déconnecté : impossible de se connecter à l’extension compagnon IDE pour [Nom de l’IDE]. Veuillez vous assurer que l’extension est en cours d’exécution, puis redémarrez votre terminal. Pour installer l’extension, exécutez la commande `/ide install`.`
  - **Cause :** Qwen Code n’a pas pu trouver les variables d’environnement nécessaires (`QWEN_CODE_IDE_WORKSPACE_PATH` ou `QWEN_CODE_IDE_SERVER_PORT`) permettant de se connecter à l’IDE. Cela signifie généralement que l’extension compagnon IDE n’est pas en cours d’exécution ou qu’elle n’a pas été initialisée correctement.
  - **Solution :**
    1.  Assurez-vous d’avoir installé l’extension **Qwen Code Companion** dans votre IDE et qu’elle est activée.
    2.  Ouvrez une nouvelle fenêtre de terminal dans votre IDE afin de garantir qu’elle récupère bien les variables d’environnement appropriées.

- **Message :** `🔴 Déconnecté : erreur de connexion à l’IDE. La connexion a été interrompue de façon inattendue. Veuillez essayer de vous reconnecter en exécutant la commande `/ide enable`.`
  - **Cause :** La connexion à l’extension compagnon IDE a été perdue.
  - **Solution :** Exécutez `/ide enable` pour tenter de rétablir la connexion. Si le problème persiste, ouvrez une nouvelle fenêtre de terminal ou redémarrez votre IDE.

### Erreurs de configuration

- **Message :** `🔴 Déconnecté : Mismatch de répertoire. Qwen Code s’exécute dans un emplacement différent de l’espace de travail ouvert dans [IDE Name]. Veuillez exécuter l’interface CLI depuis le même répertoire que le dossier racine de votre projet.`
  - **Cause :** Le répertoire de travail actuel de l’interface CLI se trouve en dehors du dossier ou de l’espace de travail ouvert dans votre IDE.
  - **Solution :** Utilisez la commande `cd` pour accéder au même répertoire que celui ouvert dans votre IDE, puis redémarrez l’interface CLI.

- **Message :** `🔴 Déconnecté : Pour utiliser cette fonctionnalité, veuillez ouvrir un dossier d’espace de travail dans [IDE Name] et réessayer.`
  - **Cause :** Aucun espace de travail n’est ouvert dans votre IDE.
  - **Solution :** Ouvrez un espace de travail dans votre IDE, puis redémarrez l’interface CLI.

### Erreurs générales

- **Message :** `L’intégration à l’IDE n’est pas prise en charge dans votre environnement actuel. Pour utiliser cette fonctionnalité, exécutez Qwen Code depuis l’un des IDE pris en charge suivants : [Liste des IDE]`
  - **Cause :** Vous exécutez Qwen Code dans un terminal ou un environnement qui n’est pas un IDE pris en charge.
  - **Solution :** Exécutez Qwen Code depuis le terminal intégré d’un IDE pris en charge, comme VS Code.

- **Message :** `Aucun installateur n’est disponible pour cet IDE. Veuillez installer manuellement l’extension Qwen Code Companion depuis le marketplace.`
  - **Cause :** Vous avez exécuté la commande `/ide install`, mais l’interface CLI ne dispose pas d’un installateur automatisé pour votre IDE spécifique.
  - **Solution :** Ouvrez le marketplace d’extensions de votre IDE, recherchez « Qwen Code Companion », puis installez-le manuellement.