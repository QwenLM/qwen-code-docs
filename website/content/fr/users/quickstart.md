# Démarrage rapide

> 👏 Bienvenue dans Qwen Code !

Ce guide de démarrage rapide vous permettra d'utiliser l'assistance au codage basée sur l'IA en quelques minutes. À la fin, vous comprendrez comment utiliser Qwen Code pour les tâches de développement courantes.

## Avant de commencer

Assurez-vous d'avoir :

- Un **terminal** ou une invite de commande ouvert
- Un projet de code avec lequel travailler
- Une clé API d'Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)), ou un abonnement Alibaba Cloud Coding Plan ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index))

## Étape 1 : Installer Qwen Code

Pour installer Qwen Code, utilisez l'une des méthodes suivantes :

### Installation rapide (recommandée)

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
```

> [!note]
>
> Il est recommandé de redémarrer votre terminal après l'installation pour vous assurer que les variables d'environnement prennent effet.

### Installation manuelle

**Prérequis**

Assurez-vous d'avoir Node.js 22 ou une version ultérieure installée. Téléchargez-le depuis [nodejs.org](https://nodejs.org/en/download).

**NPM**

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew (macOS, Linux)**

```bash
brew install qwen-code
```

## Étape 2 : Configurer l'authentification

Lorsque vous démarrez une session interactive avec la commande `qwen`, vous serez invité à configurer l'authentification :

```bash
# Vous serez invité à configurer l'authentification lors de la première utilisation
qwen
```

```bash
# Ou exécutez /auth à tout moment pour changer la méthode d'authentification
/auth
```

Le menu de première exécution vous permet de connecter un fournisseur de modèle. Choisissez parmi :

- **Alibaba ModelStudio** — la configuration recommandée. Ouvre un sous-menu :
  - **Coding Plan** : pour les développeurs individuels, avec un quota hebdomadaire inclus et diverses options de modèle. Voir le [guide Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) pour les instructions de configuration.
  - **Token Plan** : facturation à l'utilisation avec un point de terminaison dédié, destiné aux équipes et aux entreprises.
  - **Standard API Key** : connectez-vous avec une clé API existante d'Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Voir le guide de configuration de l'API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) pour plus de détails.
- **Fournisseurs tiers** — choisissez un fournisseur intégré (DeepSeek, MiniMax, Z.AI, ModelScope, OpenRouter, Requesty, etc.) et connectez-vous avec une clé API.
- **Fournisseur personnalisé** — connectez manuellement un serveur local, un proxy ou un fournisseur non pris en charge.

> ⚠️ **Note** : Qwen OAuth a été interrompu le 15 avril 2026. Si vous utilisiez auparavant Qwen OAuth, veuillez passer à l'une des méthodes ci-dessus.

> [!note]
>
> Lors de la première authentification de Qwen Code avec votre compte Qwen, un espace de travail appelé ".qwen" est automatiquement créé pour vous. Cet espace de travail offre un suivi et une gestion centralisés des coûts pour toute l'utilisation de Qwen Code dans votre organisation.

> [!tip]
>
> Pour configurer l'authentification, démarrez Qwen Code et exécutez `/auth`. Utilisez `/doctor` pour vérifier votre configuration actuelle à tout moment. Voir la page [Authentification](./configuration/auth) pour plus de détails.

## Étape 3 : Démarrer votre première session

Ouvrez votre terminal dans n'importe quel répertoire de projet et démarrez Qwen Code :

```bash
# facultatif
cd /chemin/vers/votre/projet
# démarrer qwen
qwen
```

Vous verrez l'écran d'accueil de Qwen Code avec vos informations de session, vos conversations récentes et les dernières mises à jour. Tapez `/help` pour obtenir les commandes disponibles.

## Discuter avec Qwen Code

### Poser votre première question

Qwen Code analysera vos fichiers et fournira un résumé. Vous pouvez également poser des questions plus spécifiques :

```
explain the folder structure
```

Vous pouvez également demander à Qwen Code ses propres capacités :

```
what can Qwen Code do?
```

> [!note]
>
> Qwen Code lit vos fichiers selon les besoins — vous n'avez pas à ajouter manuellement du contexte. Qwen Code a également accès à sa propre documentation et peut répondre à des questions sur ses fonctionnalités et capacités.

### Effectuer votre première modification de code

Maintenant, faisons faire du vrai codage à Qwen Code. Essayez une tâche simple :

```
add a hello world function to the main file
```

Qwen Code va :

1. Trouver le fichier approprié
2. Vous montrer les modifications proposées
3. Demander votre approbation
4. Effectuer la modification

> [!note]
>
> Qwen Code demande toujours la permission avant de modifier les fichiers. Vous pouvez approuver les modifications individuellement ou activer le mode « Tout accepter » pour une session.

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

Qwen Code est compétent en débogage et en implémentation de fonctionnalités.

Décrivez ce que vous voulez en langage naturel :

```
add input validation to the user registration form
```

Ou corrigez des problèmes existants :

```
there's a bug where users can submit empty forms - fix it
```

Qwen Code va :

- Localiser le code pertinent
- Comprendre le contexte
- Implémenter une solution
- Exécuter les tests si disponibles

### Tester d'autres workflows courants

Il existe plusieurs façons de travailler avec Qwen Code :

**Refactoriser le code**

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
> **Rappelez-vous** : Qwen Code est votre programmeur en binôme IA. Parlez-lui comme vous le feriez avec un collègue serviable — décrivez ce que vous voulez accomplir, et il vous aidera à y parvenir.

## Commandes essentielles

Voici les commandes les plus importantes pour une utilisation quotidienne :

| Commande              | Ce qu'elle fait                                        | Exemple                        |
| --------------------- | ------------------------------------------------------ | ------------------------------ |
| `qwen`                | Démarrer Qwen Code                                     | `qwen`                         |
| `/auth`               | Changer la méthode d'authentification (en session)     | `/auth`                        |
| `/doctor`             | Vérifier l'authentification et l'environnement actuels | `/doctor`                      |
| `/help`               | Afficher l'aide pour les commandes disponibles         | `/help` ou `/?`                |
| `/compress`           | Remplacer l'historique de la discussion par un résumé pour économiser des Tokens | `/compress` |
| `/clear`              | Effacer le contenu de l'écran du terminal              | `/clear` (raccourci : `Ctrl+L`) |
| `/theme`              | Changer le thème visuel de Qwen Code                   | `/theme`                       |
| `/language`           | Afficher ou modifier les paramètres de langue          | `/language`                    |
| → `ui [language]`     | Définir la langue de l'interface utilisateur           | `/language ui zh-CN`           |
| → `output [language]` | Définir la langue de sortie du LLM                     | `/language output Chinese`     |
| `/quit`               | Quitter Qwen Code immédiatement                        | `/quit` ou `/exit`             |

Voir la [référence CLI](./features/commands) pour une liste complète des commandes.

## Conseils de pro pour les débutants

**Soyez précis dans vos demandes**

- Au lieu de : « corrige le bug »
- Essayez : « corrige le bug de connexion où les utilisateurs voient un écran blanc après avoir saisi des identifiants erronés »

**Utilisez des instructions étape par étape**

- Décomposez les tâches complexes en étapes :

```
1. create a new database table for user profiles
2. create an API endpoint to get and update user profiles
3. build a webpage that allows users to see and edit their information
```

**Laissez Qwen Code explorer d'abord**

- Avant d'effectuer des modifications, laissez Qwen Code comprendre votre code :

```
analyze the database schema
```

```
build a dashboard showing products that are most frequently returned by our UK customers
```

**Gagnez du temps avec les raccourcis**

- Appuyez sur `?` pour voir tous les raccourcis clavier disponibles
- Utilisez Tab pour la complétion de commande
- Appuyez sur ↑ pour l'historique des commandes
- Tapez `/` pour voir toutes les commandes slash

## Obtenir de l'aide

- **Dans Qwen Code** : Tapez `/help` ou demandez « comment faire pour... »
- **Documentation** : Vous y êtes ! Parcourez d'autres guides
- **Communauté** : Rejoignez notre [Discussion GitHub](https://github.com/QwenLM/qwen-code/discussions) pour des conseils et du support