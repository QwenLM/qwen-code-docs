# Démarrage rapide

> 👏 Bienvenue sur Qwen Code !

Ce guide de démarrage rapide vous permettra d'utiliser l'assistance de codage alimentée par l'IA en quelques minutes seulement. À la fin de ce guide, vous comprendrez comment utiliser Qwen Code pour les tâches de développement courantes.

## Avant de commencer

Assurez-vous d'avoir :

- Un **terminal** ou une invite de commande ouverte
- Un projet de code sur lequel travailler
- Un compte [Qwen Code](https://chat.qwen.ai/auth?mode=register)

## Étape 1 : Installer Qwen Code

Pour installer Qwen Code, utilisez l'une des méthodes suivantes :

### NPM (recommandé)

Nécessite [Node.js 20+](https://nodejs.org/download), vous pouvez utiliser `node -v` pour vérifier la version. Si ce n'est pas installé, utilisez la commande suivante pour l'installer.

Si vous avez [Node.js ou une version plus récente installée](https://nodejs.org/en/download/) :

```sh
npm install -g @qwen-code/qwen-code@latest
```

### Homebrew (macOS, Linux)

```sh
brew install qwen-code
```

## Étape 2 : Connectez-vous à votre compte

Qwen Code nécessite un compte pour être utilisé. Lorsque vous démarrez une session interactive avec la commande `qwen`, vous devrez vous connecter :

```bash

# Vous serez invité à vous connecter lors de la première utilisation
qwen
```

```bash

# Suivez les invites pour vous connecter avec votre compte
/auth
```

Sélectionnez `Qwen OAuth`, connectez-vous à votre compte et suivez les invites pour confirmer. Une fois connecté, vos identifiants sont stockés et vous n'aurez plus besoin de vous reconnecter.

> [!note]
>
> Lorsque vous authentifiez Qwen Code avec votre compte Qwen pour la première fois, un espace de travail appelé ".qwen" est automatiquement créé pour vous. Cet espace de travail fournit un suivi et une gestion centralisés des coûts pour toutes les utilisations de Qwen Code au sein de votre organisation.

> [!tip]
>
> Si vous devez vous reconnecter ou changer de compte, utilisez la commande `/auth` dans Qwen Code.

## Étape 3 : Démarrez votre première session

Ouvrez votre terminal dans n'importe quel répertoire de projet et démarrez Qwen Code :

```bash

# optionnel
cd /chemin/vers/votre/projet
```

# démarrer qwen
qwen
```

Vous verrez l'écran d'accueil de Qwen Code avec les informations de votre session, les conversations récentes et les dernières mises à jour. Tapez `/help` pour voir les commandes disponibles.

## Discuter avec Qwen Code

### Poser votre première question

Qwen Code analysera vos fichiers et fournira un résumé. Vous pouvez également poser des questions plus spécifiques :

```
explain the folder structure
```

Vous pouvez aussi interroger Qwen Code sur ses propres capacités :

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code lit vos fichiers lorsque nécessaire – vous n'avez pas besoin d'ajouter manuellement le contexte. Qwen Code a également accès à sa propre documentation et peut répondre aux questions concernant ses fonctionnalités et ses capacités.

### Effectuez votre première modification de code

Faisons maintenant écrire du vrai code à Qwen Code. Essayez une tâche simple :

```
ajouter une fonction hello world au fichier principal
```

Qwen Code va :

1. Trouver le bon fichier
2. Vous montrer les modifications proposées
3. Demander votre approbation
4. Effectuer la modification

> [!note]
>
> Qwen Code demande toujours l'autorisation avant de modifier des fichiers. Vous pouvez approuver chaque changement individuellement ou activer le mode « Accepter tout » pour une session.

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
créer une nouvelle branche appelée feature/quickstart
```

```
afficher les 5 derniers commits
```

```
m'aider à résoudre les conflits de fusion
```

### Corriger un bug ou ajouter une fonctionnalité

Qwen Code est compétent pour le débogage et l'implémentation de fonctionnalités.

Décrivez ce que vous souhaitez en langage naturel :

```
ajouter la validation des entrées au formulaire d'inscription utilisateur
```

Ou corriger des problèmes existants :

```
il y a un bug où les utilisateurs peuvent soumettre des formulaires vides - corrigez-le
```

Qwen Code va :

- Localiser le code pertinent
- Comprendre le contexte
- Implémenter une solution
- Exécuter les tests si disponibles

### Tester d'autres workflows courants

Il existe plusieurs façons de travailler avec Claude :

**Refactorer du code**

```
refactoriser le module d'authentification pour utiliser async/await au lieu de callbacks
```

**Écrire des tests**

```
écrire des tests unitaires pour les fonctions de la calculatrice
```

**Mettre à jour la documentation**

```
mettre à jour le README avec les instructions d'installation
```

**Revue de code**

```
revoir mes modifications et suggérer des améliorations
```

> [!tip]
>
> **Rappelez-vous** : Qwen Code est votre programmeur en binôme IA. Parlez-lui comme vous le feriez avec un collègue serviable – décrivez ce que vous souhaitez accomplir, et il vous aidera à y parvenir.

## Commandes essentielles

Voici les commandes les plus importantes pour une utilisation quotidienne :

| Commande              | Description                                      | Exemple                       |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | Démarrer Qwen Code                               | `qwen`                        |
| `/auth`               | Changer la méthode d'authentification            | `/auth`                       |
| `/help`               | Afficher l'aide sur les commandes disponibles    | `/help` ou `/?`               |
| `/compress`           | Remplacer l'historique par un résumé pour économiser des Tokens | `/compress`                   |
| `/clear`              | Effacer le contenu de l'écran du terminal        | `/clear` (raccourci : `Ctrl+L`) |
| `/theme`              | Changer le thème visuel de Qwen Code             | `/theme`                      |
| `/language`           | Voir ou modifier les paramètres linguistiques    | `/language`                   |
| → `ui [language]`     | Définir la langue de l'interface utilisateur     | `/language ui zh-CN`          |
| → `output [language]` | Définir la langue de sortie du LLM               | `/language output Chinese`    |
| `/quit`               | Quitter immédiatement Qwen Code                  | `/quit` ou `/exit`            |

Consultez la [référence CLI](../users/reference/cli-reference) pour obtenir la liste complète des commandes.

## Conseils pour les débutants

**Soyez précis dans vos demandes**

- Au lieu de : « corrigez le bug »
- Essayez : « corrigez le bug de connexion où les utilisateurs voient un écran vide après avoir saisi des identifiants incorrects »

**Utilisez des instructions pas à pas**

- Divisez les tâches complexes en étapes :

```
1. créer une nouvelle table de base de données pour les profils utilisateur
2. créer un point de terminaison API pour récupérer et mettre à jour les profils utilisateur
3. construire une page web permettant aux utilisateurs de voir et modifier leurs informations
```

**Laissez Claude explorer en premier**

- Avant d'apporter des modifications, laissez Claude comprendre votre code :

```
analyser le schéma de la base de données
```

```
construire un tableau de bord affichant les produits qui sont le plus souvent retournés par nos clients du Royaume-Uni
```

**Gagnez du temps avec des raccourcis**

- Appuyez sur `?` pour voir tous les raccourcis clavier disponibles
- Utilisez Tab pour la complétion des commandes
- Appuyez sur ↑ pour l'historique des commandes
- Tapez `/` pour voir toutes les commandes slash

## Obtenir de l'aide

- **Dans Qwen Code** : Tapez `/help` ou demandez « comment faire pour... »
- **Documentation** : Vous êtes ici ! Parcourez les autres guides
- **Communauté** : Rejoignez notre [discussion GitHub](https://github.com/QwenLM/qwen-code/discussions) pour des conseils et du support