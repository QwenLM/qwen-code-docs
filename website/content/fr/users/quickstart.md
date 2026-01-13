# Démarrage rapide

> 👏 Bienvenue dans Qwen Code !

Ce guide de démarrage rapide vous permettra d'utiliser l'assistance de codage alimentée par l'IA en quelques minutes seulement. À la fin, vous comprendrez comment utiliser Qwen Code pour les tâches de développement courantes.

## Avant de commencer

Assurez-vous d'avoir :

- Un **terminal** ou une invite de commande ouverte
- Un projet de code avec lequel travailler
- Un compte [Qwen Code](https://chat.qwen.ai/auth?mode=register)

## Étape 1 : Installer Qwen Code

Pour installer Qwen Code, utilisez l'une des méthodes suivantes :

### NPM (recommandé)

Nécessite [Node.js 20+](https://nodejs.org/download), vous pouvez utiliser `node -v` pour vérifier la version. Si ce n'est pas installé, utilisez la commande suivante pour l'installer.

Si vous avez [Node.js ou une version plus récente installée](https://nodejs.org/en/download/):

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
> Lorsque vous authentifiez Qwen Code pour la première fois avec votre compte Qwen, un espace de travail appelé ".qwen" est automatiquement créé pour vous. Cet espace de travail fournit un suivi centralisé des coûts et une gestion de toutes les utilisations de Qwen Code dans votre organisation.

> [!tip]
>
> Si vous devez vous reconnecter ou changer de compte, utilisez la commande `/auth` dans Qwen Code.

## Étape 3 : Démarrez votre première session

Ouvrez votre terminal dans n'importe quel répertoire de projet et lancez Qwen Code :

```bash

# optionnel
cd /chemin/vers/votre/projet

# démarrer qwen
qwen
```

Vous verrez l'écran d'accueil de Qwen Code avec les informations de votre session, les conversations récentes et les dernières mises à jour. Tapez `/help` pour voir les commandes disponibles.

## Discuter avec Qwen Code

### Posez votre première question

Qwen Code analysera vos fichiers et fournira un résumé. Vous pouvez également poser des questions plus spécifiques :

```
expliquer la structure du dossier
```

Vous pouvez également demander à Qwen Code ses propres capacités :

```
que peut faire Qwen Code ?
```

> [!note]
>
> Qwen Code lit vos fichiers selon les besoins - vous n'avez pas à ajouter manuellement le contexte. Qwen Code a également accès à sa propre documentation et peut répondre aux questions concernant ses fonctionnalités et capacités.

### Faites votre première modification de code

Maintenant, faisons en sorte que Qwen Code effectue du codage réel. Essayez une tâche simple :

```
ajouter une fonction hello world au fichier principal
```

Qwen Code va :

1. Trouver le fichier approprié
2. Vous montrer les modifications proposées
3. Demander votre approbation
4. Effectuer la modification

> [!note]
>
> Qwen Code demande toujours la permission avant de modifier des fichiers. Vous pouvez approuver les modifications individuellement ou activer le mode "Tout accepter" pour une session.

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
montrer les 5 derniers commits
```

```
m'aider à résoudre les conflits de fusion
```

### Corriger un bogue ou ajouter une fonctionnalité

Qwen Code excelle dans le débogage et l'implémentation de fonctionnalités.

Décrivez ce que vous souhaitez en langage naturel :

```
ajouter la validation des entrées au formulaire d'inscription des utilisateurs
```

Ou corrigez les problèmes existants :

```
il y a un bogue qui permet aux utilisateurs de soumettre des formulaires vides - corrigez-le
```

Qwen Code va :

- Localiser le code pertinent
- Comprendre le contexte
- Implémenter une solution
- Exécuter les tests si disponibles

### Essayez d'autres flux de travail courants

Il existe plusieurs façons de travailler avec Qwen Code :

**Remanier le code**

```
remodeler le module d'authentification pour utiliser async/await au lieu des callbacks
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
examiner mes modifications et suggérer des améliorations
```

> [!tip]
>
> **Rappelez-vous** : Qwen Code est votre programmeur partenaire IA. Parlez-lui comme vous le feriez avec un collègue utile : décrivez ce que vous souhaitez accomplir, et il vous aidera à y parvenir.

## Commandes essentielles

Voici les commandes les plus importantes pour une utilisation quotidienne :

| Commande              | Fonction                                         | Exemple                       |
| --------------------- | ------------------------------------------------ | ----------------------------- |
| `qwen`                | lance Qwen Code                                  | `qwen`                        |
| `/auth`               | Changer la méthode d'authentification            | `/auth`                       |
| `/help`               | Afficher les informations d'aide pour les commandes disponibles | `/help` ou `/?`               |
| `/compress`           | Remplacer l'historique de discussion par un résumé pour économiser des jetons | `/compress`                   |
| `/clear`              | Effacer le contenu de l'écran du terminal        | `/clear` (raccourci : `Ctrl+L`) |
| `/theme`              | Changer le thème visuel de Qwen Code             | `/theme`                      |
| `/language`           | Afficher ou modifier les paramètres de langue    | `/language`                   |
| → `ui [language]`     | Définir la langue de l'interface utilisateur     | `/language ui fr-FR`          |
| → `output [language]` | Définir la langue de sortie du modèle LLM        | `/language output French`     |
| `/quit`               | Quitter Qwen Code immédiatement                  | `/quit` ou `/exit`            |

Consultez la [référence CLI](./features/commands) pour obtenir la liste complète des commandes.

## Conseils professionnels pour les débutants

**Soyez précis dans vos demandes**

- Au lieu de : "corrige le bogue"
- Essayez : "corrige le bogue de connexion où les utilisateurs voient un écran vide après avoir saisi des identifiants incorrects"

**Utilisez des instructions étape par étape**

- Divisez les tâches complexes en étapes :

```
1. créer une nouvelle table de base de données pour les profils utilisateur
2. créer un point de terminaison API pour obtenir et mettre à jour les profils utilisateur
3. créer une page web permettant aux utilisateurs de voir et modifier leurs informations
```

**Laissez Qwen Code explorer en premier**

- Avant d'apporter des modifications, laissez Qwen Code comprendre votre code :

```
analyser le schéma de la base de données
```

```
créer un tableau de bord montrant les produits les plus fréquemment retournés par nos clients britanniques
```

**Gagnez du temps avec les raccourcis**

- Appuyez sur `?` pour voir tous les raccourcis clavier disponibles
- Utilisez Tab pour la complétion des commandes
- Appuyez sur ↑ pour l'historique des commandes
- Tapez `/` pour voir toutes les commandes slash

## Obtenir de l'aide

- **Dans Qwen Code** : Tapez `/help` ou demandez "comment faire..."
- **Documentation** : Vous êtes ici ! Parcourez les autres guides
- **Communauté** : Rejoignez notre [Discussion GitHub](https://github.com/QwenLM/qwen-code/discussions) pour obtenir des conseils et du soutien