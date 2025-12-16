# Présentation de Qwen Code

> Découvrez Qwen Code, l'outil de codage agentic de Qwen qui réside dans votre terminal et vous aide à transformer vos idées en code plus rapidement que jamais.

## Commencez en 30 secondes

Prérequis :

- Un compte [Qwen Code](https://chat.qwen.ai/auth?mode=register)
- Nécessite [Node.js 20+](https://nodejs.org/zh-cn/download), vous pouvez utiliser `node -v` pour vérifier la version. Si ce n'est pas installé, utilisez la commande suivante pour l'installer.

### Installer Qwen Code :

**NPM** (recommandé)

```bash
npm install -g @qwen-code/qwen-code@latest
```

**Homebrew** (macOS, Linux)

```bash
brew install qwen-code
```

### Commencer à utiliser Qwen Code :

```bash
cd your-project
qwen
```

Sélectionnez l'authentification **Qwen OAuth (Gratuit)** et suivez les instructions pour vous connecter. Ensuite, commençons par comprendre votre base de code. Essayez l'une de ces commandes :

```
what does this project do?
```

![](https://gw.alicdn.com/imgextra/i2/O1CN01XoPbZm1CrsZzvMQ6m_!!6000000000135-1-tps-772-646.gif)

Vous serez invité à vous connecter lors de la première utilisation. C'est tout ! [Continuer avec le démarrage rapide (5 minutes) →](../users/quickstart)

> [!tip]
>
> Consultez la section [dépannage](../users/support/troubleshooting) si vous rencontrez des problèmes.

> [!note]
>
> **Nouvelle extension VS Code (Bêta)** : Préférez une interface graphique ? Notre nouvelle **extension VS Code** offre une expérience IDE native facile d'utilisation, sans nécessiter de familiarité avec le terminal. Installez simplement depuis le marketplace et commencez à coder avec Qwen Code directement dans votre barre latérale. Vous pouvez rechercher **Qwen Code** dans le VS Code Marketplace et le télécharger.

## Ce que Qwen Code fait pour vous

- **Construire des fonctionnalités à partir de descriptions** : Dites à Qwen Code ce que vous souhaitez construire en langage naturel. Il établira un plan, écrira le code et s'assurera qu'il fonctionne.
- **Déboguer et corriger les problèmes** : Décrivez un bug ou collez un message d'erreur. Qwen Code analysera votre base de code, identifiera le problème et implémentera une correction.
- **Naviguer dans n'importe quelle base de code** : Posez n'importe quelle question concernant la base de code de votre équipe et obtenez une réponse réfléchie. Qwen Code conserve une conscience de l'ensemble de la structure de votre projet, peut trouver des informations à jour sur le web, et avec [MCP](../users/features/mcp) peut tirer des données externes comme Google Drive, Figma et Slack.
- **Automatiser les tâches fastidieuses** : Corriger les problèmes de lint fastidieux, résoudre les conflits de fusion et rédiger des notes de version. Faites tout cela en une seule commande depuis vos machines de développement, ou automatiquement dans CI.

## Pourquoi les développeurs adorent Qwen Code

- **Fonctionne dans votre terminal** : Pas une autre fenêtre de chat. Pas un autre IDE. Qwen Code vous rejoint là où vous travaillez déjà, avec les outils que vous aimez déjà.
- **Prend des initiatives** : Qwen Code peut directement modifier des fichiers, exécuter des commandes et créer des commits. Besoin de plus ? [MCP](../users/features/mcp) permet à Qwen Code de lire vos documents de conception dans Google Drive, de mettre à jour vos tickets dans Jira, ou d'utiliser _vos_ outils de développement personnalisés.
- **Philosophie Unix** : Qwen Code est composable et scriptable. `tail -f app.log | qwen -p "Envoie-moi un message Slack si tu vois des anomalies apparaître dans ce flux de logs"` _fonctionne_. Votre CI peut exécuter `qwen -p "Si de nouvelles chaînes de texte apparaissent, traduis-les en français et crée une PR pour que l'équipe @lang-fr-team les examine"`.