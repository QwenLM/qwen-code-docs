# Démarrage rapide

> 👏 Bienvenue dans Qwen Code !

Ce guide de démarrage rapide vous permettra d’utiliser une assistance à la programmation basée sur l’IA en quelques minutes seulement. À la fin de ce guide, vous saurez comment utiliser Qwen Code pour les tâches de développement courantes.

## Avant de commencer

Assurez-vous de disposer des éléments suivants :

- Un **terminal** ou une invite de commandes ouverte
- Un projet de code sur lequel travailler
- Un compte [Qwen Code](https://chat.qwen.ai/auth?mode=register)

## Étape 1 : Installer Qwen Code

Pour installer Qwen Code, utilisez l’une des méthodes suivantes :

### Installation rapide (recommandée)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (exécuter CMD en tant qu’administrateur)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Il est recommandé de redémarrer votre terminal après l’installation afin de garantir que les variables d’environnement soient correctement prises en compte.

### Installation manuelle

**Prérequis**

Assurez-vous que Node.js 20 ou une version ultérieure est installé. Téléchargez-le depuis [nodejs.org](https://nodejs.org/fr/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Étape 2 : Connectez-vous à votre compte

Qwen Code nécessite un compte pour être utilisé. Lorsque vous démarrez une session interactive avec la commande `qwen`, vous devrez vous connecter :

```bash

# Vous serez invité à vous connecter lors de la première utilisation
qwen
```

# Suivez les invites pour vous connecter avec votre compte  
`/auth`  

Sélectionnez `Qwen OAuth`, connectez-vous à votre compte et suivez les invites pour confirmer. Une fois connecté, vos identifiants sont enregistrés et vous n’aurez plus besoin de vous reconnecter.

> [!note]  
>  
> Lors de la première authentification de Qwen Code avec votre compte Qwen, un espace de travail nommé « .qwen » est automatiquement créé pour vous. Cet espace de travail permet un suivi centralisé des coûts et une gestion unifiée de l’ensemble des utilisations de Qwen Code au sein de votre organisation.

> [!tip]  
>  
> Si vous devez vous reconnecter ou changer de compte, utilisez la commande `/auth` dans Qwen Code.

## Étape 3 : Lancez votre première session  

Ouvrez votre terminal dans n’importe quel répertoire de projet, puis démarrez Qwen Code :

```bash
# optionnel
cd /chemin/vers/votre/projet

# démarrer qwen
qwen
```

Vous verrez l’écran d’accueil de Qwen Code, affichant les informations relatives à votre session, vos conversations récentes ainsi que les dernières mises à jour. Tapez `/help` pour obtenir la liste des commandes disponibles.

## Discutez avec Qwen Code

### Posez votre première question

Qwen Code analysera vos fichiers et en fournira un résumé. Vous pouvez également poser des questions plus précises :

```
expliquez la structure des dossiers
```

Vous pouvez aussi interroger Qwen Code sur ses propres fonctionnalités :

```
que peut faire Qwen Code ?
```

> [!note]
>
> Qwen Code lit vos fichiers selon les besoins — vous n’avez pas à ajouter manuellement du contexte. Qwen Code a également accès à sa propre documentation et peut répondre aux questions concernant ses fonctionnalités et capacités.

### Effectuez votre première modification de code

Passons maintenant à la pratique : demandons à Qwen Code d’écrire du code. Essayez une tâche simple :

```
ajoutez une fonction « hello world » au fichier principal
```

Qwen Code effectuera les étapes suivantes :

1. Identifier le fichier approprié  
2. Vous montrer les modifications proposées  
3. Demander votre validation  
4. Appliquer la modification  

> [!note]
>
> Qwen Code demande toujours votre autorisation avant de modifier des fichiers. Vous pouvez valider individuellement chaque modification ou activer le mode « Accepter toutes » pour une session donnée.

### Utiliser Git avec Qwen Code

Qwen Code rend les opérations Git conversationnelles :

```
quels fichiers ai-je modifiés ?
```

```
valider mes modifications avec un message descriptif
```

Vous pouvez également demander des opérations Git plus complexes :

```
créer une nouvelle branche nommée feature/quickstart
```

```
afficher les 5 derniers commits
```

```
aidez-moi à résoudre les conflits de fusion
```

### Corriger un bogue ou ajouter une fonctionnalité

Qwen Code maîtrise parfaitement le débogage et l’implémentation de nouvelles fonctionnalités.

Décrivez ce que vous souhaitez en langage naturel :

```
ajouter une validation des entrées au formulaire d’inscription des utilisateurs
```

Ou corrigez des problèmes existants :

```
il y a un bogue qui permet aux utilisateurs de soumettre des formulaires vides — corrigez-le
```

Qwen Code va :

- Localiser le code concerné  
- Comprendre le contexte  
- Mettre en œuvre une solution  
- Exécuter les tests, le cas échéant

### Tester d’autres flux de travail courants

Il existe plusieurs façons de travailler avec Qwen Code :

**Refactoriser le code**

```
refactoriser le module d’authentification pour utiliser async/await au lieu des fonctions de rappel
```

**Écrire des tests**

```
écrire des tests unitaires pour les fonctions de la calculatrice
```

**Mettre à jour la documentation**

```
mettre à jour le fichier README avec les instructions d’installation
```

**Revue de code**

```
examiner mes modifications et proposer des améliorations
```

> [!tip]
>
> **À retenir** : Qwen Code est votre programmeur pair IA. Parlez-lui comme vous le feriez avec un collègue compétent : décrivez ce que vous souhaitez accomplir, et il vous aidera à y parvenir.

## Commandes essentielles

Voici les commandes les plus importantes pour une utilisation quotidienne :

| Commande              | Fonctionnalité                                   | Exemple                       |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | Démarrer Qwen Code                               | `qwen`                        |
| `/auth`               | Changer la méthode d’authentification            | `/auth`                       |
| `/help`               | Afficher l’aide relative aux commandes disponibles | `/help` ou `/?`               |
| `/compress`           | Remplacer l’historique des échanges par un résumé afin d’économiser des jetons | `/compress`                   |
| `/clear`              | Effacer le contenu de l’écran du terminal        | `/clear` (raccourci : `Ctrl+L`) |
| `/theme`              | Modifier le thème visuel de Qwen Code            | `/theme`                      |
| `/language`           | Afficher ou modifier les paramètres linguistiques | `/language`                   |
| → `ui [langue]`       | Définir la langue de l’interface utilisateur      | `/language ui zh-CN`          |
| → `output [langue]`   | Définir la langue de sortie du modèle LLM        | `/language output Chinese`    |
| `/quit`               | Quitter Qwen Code immédiatement                 | `/quit` ou `/exit`            |

Consultez la [référence CLI](./features/commands) pour obtenir la liste complète des commandes.

## Conseils pratiques pour les débutants

**Soyez précis dans vos demandes**

- Au lieu de : « Corrigez le bogue »  
- Essayez plutôt : « Corrigez le bogue de connexion où les utilisateurs voient un écran vide après avoir saisi des identifiants incorrects »

**Utilisez des instructions pas à pas**

- Décomposez les tâches complexes en étapes :

```
1. créez une nouvelle table de base de données pour les profils utilisateurs
2. créez un point de terminaison d’API permettant de récupérer et de mettre à jour les profils utilisateurs
3. développez une page web permettant aux utilisateurs de consulter et de modifier leurs informations
```

**Laissez Qwen Code explorer d’abord**

- Avant d’apporter des modifications, laissez Qwen Code analyser votre code :

```
analysez le schéma de la base de données
```

```
construisez un tableau de bord affichant les produits les plus souvent retournés par nos clients du Royaume-Uni
```

**Gagnez du temps avec les raccourcis clavier**

- Appuyez sur `?` pour afficher la liste complète des raccourcis clavier disponibles  
- Utilisez la touche Tab pour la complétion automatique des commandes  
- Appuyez sur ↑ pour accéder à l’historique des commandes  
- Tapez `/` pour afficher la liste de toutes les commandes commençant par un slash

## Obtenir de l’aide

- **Dans Qwen Code** : Tapez `/help` ou posez une question comme « Comment faire… ? »
- **Documentation** : Vous y êtes déjà ! Parcourez les autres guides.
- **Communauté** : Rejoignez nos [discussions GitHub](https://github.com/QwenLM/qwen-code/discussions) pour obtenir des conseils et du soutien.