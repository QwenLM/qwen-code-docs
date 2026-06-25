# Démarrage rapide

> 👏 Bienvenue dans Qwen Code !

Ce guide de démarrage rapide vous permettra d'utiliser l'assistance de codage alimentée par l'IA en quelques minutes seulement. À la fin, vous comprendrez comment utiliser Qwen Code pour les tâches de développement courantes.

## Avant de commencer

Assurez-vous d'avoir :

- Un **terminal** ou une invite de commande ouvert(e)
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
> Il est recommandé de redémarrer votre terminal après l'installation pour que les variables d'environnement soient prises en compte.

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

Lorsque vous démarrez une session interactive avec la commande `qwen`, il vous sera demandé de configurer l'authentification :

```bash
# You'll be prompted to set up authentication on first use
qwen
```

```bash
# Or run /auth anytime to change authentication method
/auth
```

Le menu de première exécution vous permet de connecter un fournisseur de modèle. Choisissez l'un des suivants :

- **Alibaba ModelStudio** — la configuration recommandée. Ouvre un sous-menu :
  - **Coding Plan** : pour les développeurs individuels, avec un quota hebdomadaire inclus et diverses options de modèle. Consultez le [guide Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) pour les instructions de configuration.
  - **Token Plan** : facturation à l'utilisation avec un point de terminaison dédié, destiné aux équipes et aux entreprises.
  - **Clé API standard** : connectez-vous avec une clé API existante d'Alibaba Cloud ModelStudio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Voir le guide de configuration API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) pour plus de détails.
- **Fournisseurs tiers** — choisissez un fournisseur intégré (DeepSeek, MiniMax, Z.AI, ModelScope, OpenRouter, Requesty, etc.) et connectez-vous avec une clé API.
- **Fournisseur personnalisé** — connectez manuellement un serveur local, un proxy ou un fournisseur non pris en charge.

> ⚠️ **Note** : Qwen OAuth a été interrompu le 15 avril 2026. Si vous utilisiez auparavant Qwen OAuth, veuillez passer à l'une des méthodes ci-dessus.

> [!note]
>
> Lorsque vous authentifiez Qwen Code pour la première fois avec votre compte Qwen, un espace de travail appelé ".qwen" est automatiquement créé pour vous. Cet espace de travail fournit un suivi et une gestion centralisés des coûts pour toute l'utilisation de Qwen Code dans votre organisation.

> [!tip]
>
> Pour configurer l'authentification, démarrez Qwen Code et exécutez `/auth`. Utilisez `/doctor` pour vérifier votre configuration actuelle à tout moment. Consultez la page [Authentification](./configuration/auth) pour plus de détails.

## Étape 3 : Démarrer votre première session

Ouvrez votre terminal dans n'importe quel répertoire de projet et démarrez Qwen Code :

```bash
# optional
cd /path/to/your/project
# start qwen
qwen
```

Vous verrez l'écran d'accueil de Qwen Code avec les informations de votre session, les conversations récentes et les dernières mises à jour. Tapez `/help` pour les commandes disponibles.

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

Faisons maintenant faire du vrai code à Qwen Code. Essayez une tâche simple :

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
> Qwen Code demande toujours la permission avant de modifier des fichiers. Vous pouvez approuver les modifications individuellement ou activer le mode « Tout accepter » pour une session.

### Utiliser Git avec Qwen Code

Qwen Code rend les opérations Git conversationnelles :

```
what files have I changed?
```
```
valider mes modifications avec un message descriptif
```

Vous pouvez aussi demander des opérations Git plus complexes :

```
créer une nouvelle branche appelée feature/quickstart
```

```
montre-moi les 5 derniers commits
```

```
aide-moi à résoudre les conflits de fusion
```

### Corriger un bug ou ajouter une fonctionnalité

Qwen Code est compétent pour le débogage et l'implémentation de fonctionnalités.

Décrivez ce que vous voulez en langage naturel :

```
ajouter une validation de saisie au formulaire d'inscription utilisateur
```

Ou corrigez des problèmes existants :

```
il y a un bug où les utilisateurs peuvent soumettre des formulaires vides - corrige-le
```

Qwen Code va :

- Localiser le code concerné
- Comprendre le contexte
- Implémenter une solution
- Exécuter les tests s'ils existent

### Tester d'autres flux de travail courants

Il existe plusieurs façons de travailler avec Qwen Code :

**Refactoriser du code**

```
refactoriser le module d'authentification pour utiliser async/await au lieu des callbacks
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
> **Rappel** : Qwen Code est votre programmeur jumeau IA. Parlez-lui comme à un collègue serviable - décrivez ce que vous voulez accomplir, et il vous aidera à y parvenir.

## Commandes essentielles

Voici les commandes les plus importantes pour une utilisation quotidienne :

| Commande             | Ce qu'elle fait                                     | Exemple                       |
| -------------------- | --------------------------------------------------- | ----------------------------- |
| `qwen`               | démarrer Qwen Code                                  | `qwen`                        |
| `/auth`              | changer la méthode d'authentification (en session)  | `/auth`                       |
| `/doctor`            | vérifier l'authentification et l'environnement      | `/doctor`                     |
| `/help`              | afficher l'aide pour les commandes disponibles      | `/help` ou `/?`               |
| `/compress`          | remplacer l'historique de chat par un résumé pour économiser des tokens | `/compress`                   |
| `/clear`             | effacer le contenu de l'écran du terminal           | `/clear` (raccourci : `Ctrl+L`) |
| `/theme`             | changer le thème visuel de Qwen Code                | `/theme`                      |
| `/language`          | voir ou modifier les paramètres de langue           | `/language`                   |
| → `ui [langue]`      | définir la langue de l'interface utilisateur        | `/language ui zh-CN`          |
| → `output [langue]`  | définir la langue de sortie du LLM                  | `/language output Chinese`    |
| `/quit`              | quitter Qwen Code immédiatement                     | `/quit` ou `/exit`            |

Consultez la [référence CLI](./features/commands) pour une liste complète des commandes.

## Astuces pour débutants

**Soyez précis dans vos demandes**

- Au lieu de : "corrige le bug"
- Essayez : "corrige le bug de connexion où les utilisateurs voient un écran blanc après avoir saisi des identifiants incorrects"

**Utilisez des instructions étape par étape**

- Décomposez les tâches complexes en étapes :

```
1. créer une nouvelle table de base de données pour les profils utilisateurs
2. créer un point d'API pour obtenir et mettre à jour les profils utilisateurs
3. construire une page web qui permet aux utilisateurs de voir et modifier leurs informations
```

**Laissez Qwen Code explorer d'abord**

- Avant de faire des modifications, laissez Qwen Code comprendre votre code :

```
analyser le schéma de la base de données
```

```
construire un tableau de bord montrant les produits les plus fréquemment retournés par nos clients britanniques
```

**Gagnez du temps avec les raccourcis**

- Appuyez sur `?` pour voir tous les raccourcis clavier disponibles
- Utilisez Tab pour la complétion des commandes
- Appuyez sur ↑ pour l'historique des commandes
- Tapez `/` pour voir toutes les commandes slash

## Obtenir de l'aide

- **Dans Qwen Code** : Tapez `/help` ou demandez "comment faire..."
- **Documentation** : Vous y êtes ! Parcourez les autres guides
- **Communauté** : Rejoignez notre [Discussion GitHub](https://github.com/QwenLM/qwen-code/discussions) pour des astuces et du support
