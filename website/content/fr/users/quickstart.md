# Démarrage rapide

> 👏 Bienvenue dans Qwen Code !

Ce guide de démarrage rapide vous permettra d'utiliser l'assistance au codage alimentée par l'IA en quelques minutes. À la fin, vous saurez comment utiliser Qwen Code pour les tâches de développement courantes.

## Avant de commencer

Assurez-vous d'avoir :

- Un **terminal** ou une invite de commande ouvert
- Un projet de code sur lequel travailler
- Un compte [Qwen Code](https://chat.qwen.ai/auth?mode=register)

## Étape 1 : Installer Qwen Code

Pour installer Qwen Code, utilisez l'une des méthodes suivantes :

### Installation rapide (recommandée)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (exécuter CMD en tant qu'administrateur)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Il est recommandé de redémarrer votre terminal après l'installation pour vous assurer que les variables d'environnement sont prises en compte.

### Installation manuelle

**Prérequis**

Assurez-vous d'avoir Node.js 20 ou une version ultérieure installée. Téléchargez-le depuis [nodejs.org](https://nodejs.org/en/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Étape 2 : Se connecter à votre compte

L'utilisation de Qwen Code nécessite un compte. Lorsque vous démarrez une session interactive avec la commande `qwen`, vous serez invité à vous connecter :

```bash
# You'll be prompted to log in on first use
qwen
```

```bash
# Follow the prompts to log in with your account
/auth
```

Sélectionnez `Qwen OAuth`, connectez-vous à votre compte et suivez les instructions pour confirmer. Une fois connecté, vos identifiants sont stockés et vous n'aurez plus besoin de vous reconnecter.

> [!note]
>
> Lors de votre première authentification de Qwen Code avec votre compte Qwen, un espace de travail nommé ".qwen" est automatiquement créé pour vous. Cet espace de travail offre un suivi et une gestion centralisés des coûts pour toute l'utilisation de Qwen Code au sein de votre organisation.

> [!tip]
>
> Vous pouvez également configurer l'authentification directement depuis le terminal sans démarrer de session en exécutant `qwen auth`. Utilisez `qwen auth status` pour vérifier votre configuration actuelle à tout moment. Consultez la page [Authentication](./configuration/auth) pour plus de détails.

## Étape 3 : Démarrer votre première session

Ouvrez votre terminal dans n'importe quel répertoire de projet et démarrez Qwen Code :

```bash
# optiona
cd /path/to/your/project
# start qwen
qwen
```

Vous verrez l'écran d'accueil de Qwen Code avec les informations de votre session, les conversations récentes et les dernières mises à jour. Tapez `/help` pour voir les commandes disponibles.

## Discuter avec Qwen Code

### Poser votre première question

Qwen Code analysera vos fichiers et fournira un résumé. Vous pouvez également poser des questions plus spécifiques :

```
explain the folder structure
```

Vous pouvez également interroger Qwen Code sur ses propres capacités :

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code lit vos fichiers selon les besoins - vous n'avez pas à ajouter manuellement du contexte. Qwen Code a également accès à sa propre documentation et peut répondre aux questions sur ses fonctionnalités et capacités.

### Effectuer votre première modification de code

Faisons maintenant coder Qwen Code. Essayez une tâche simple :

```
add a hello world function to the main file
```

Qwen Code va :

1. Trouver le fichier approprié
2. Vous afficher les modifications proposées
3. Demander votre approbation
4. Appliquer la modification

> [!note]
>
> Qwen Code demande toujours la permission avant de modifier des fichiers. Vous pouvez approuver les modifications individuellement ou activer le mode "Tout accepter" pour une session.

### Utiliser Git avec Qwen Code

Qwen Code rend les opérations Git conversationnelles :

```
what files have I changed?
```

```
commit my changes with a descriptive message
```

Vous pouvez également demander des opérations Git plus complexes :

```
create a new branch called feature/quickstart
```

```
show me the last 5 commits
```

```
help me resolve merge conflicts
```

### Corriger un bug ou ajouter une fonctionnalité

Qwen Code excelle dans le débogage et l'implémentation de fonctionnalités.

Décrivez ce que vous souhaitez en langage naturel :

```
add input validation to the user registration form
```

Ou corrigez des problèmes existants :

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code va :

- Localiser le code concerné
- Comprendre le contexte
- Implémenter une solution
- Exécuter les tests si disponibles

### Tester d'autres workflows courants

Il existe plusieurs façons de travailler avec Qwen Code :

**Refactoriser du code**

```
refactor the authentication module to use async/await instead of callbacks
```

**Écrire des tests**

```
write unit tests for the calculator functions
```

**Mettre à jour la documentation**

```
update the README with installation instructions
```

**Revue de code**

```
review my changes and suggest improvements
```

> [!tip]
>
> **Rappel** : Qwen Code est votre binôme de programmation IA. Parlez-lui comme à un collègue serviable - décrivez ce que vous souhaitez accomplir, et il vous aidera à y parvenir.

## Commandes essentielles

Voici les commandes les plus importantes pour une utilisation quotidienne :

| Commande               | Description                                                  | Exemple                       |
| --------------------- | ------------------------------------------------------------ | ----------------------------- |
| `qwen`                | Démarrer Qwen Code                                           | `qwen`                        |
| `/auth`               | Changer la méthode d'authentification (en session)           | `/auth`                       |
| `qwen auth`           | Configurer l'authentification depuis le terminal             | `qwen auth`                   |
| `qwen auth status`    | Vérifier l'état actuel de l'authentification                 | `qwen auth status`            |
| `/help`               | Afficher l'aide pour les commandes disponibles               | `/help` ou `/?`               |
| `/compress`           | Remplacer l'historique du chat par un résumé pour économiser des Tokens | `/compress`                   |
| `/clear`              | Effacer le contenu de l'écran du terminal                    | `/clear` (raccourci : `Ctrl+L`) |
| `/theme`              | Changer le thème visuel de Qwen Code                         | `/theme`                      |
| `/language`           | Afficher ou modifier les paramètres de langue                | `/language`                   |
| → `ui [langue]`       | Définir la langue de l'interface utilisateur                 | `/language ui zh-CN`          |
| → `output [langue]`   | Définir la langue de sortie du LLM                           | `/language output Chinese`    |
| `/quit`               | Quitter Qwen Code immédiatement                              | `/quit` ou `/exit`            |

Consultez la [référence CLI](./features/commands) pour la liste complète des commandes.

## Conseils pour les débutants

**Soyez précis dans vos demandes**

- Au lieu de : "fix the bug"
- Essayez : "corrige le bug de connexion où les utilisateurs voient un écran vide après avoir saisi des identifiants incorrects"

**Utilisez des instructions étape par étape**

- Décomposez les tâches complexes en étapes :

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Laissez Qwen Code explorer d'abord**

- Avant d'apporter des modifications, laissez Qwen Code comprendre votre code :

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Gagnez du temps avec les raccourcis**

- Appuyez sur `?` pour voir tous les raccourcis clavier disponibles
- Utilisez Tab pour la complétion des commandes
- Appuyez sur ↑ pour l'historique des commandes
- Tapez `/` pour voir toutes les commandes slash

## Obtenir de l'aide

- **Dans Qwen Code** : Tapez `/help` ou demandez "comment faire..."
- **Documentation** : Vous y êtes ! Parcourez les autres guides
- **Communauté** : Rejoignez nos [GitHub Discussions](https://github.com/QwenLM/qwen-code/discussions) pour des conseils et du support