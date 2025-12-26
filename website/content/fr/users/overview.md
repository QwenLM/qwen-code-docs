# Aperçu de Qwen Code

[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Découvrez Qwen Code, l'outil de programmation agentic de Qwen qui vit dans votre terminal et vous aide à transformer vos idées en code plus rapidement que jamais.

## Commencer en 30 secondes

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

### Commencez à utiliser Qwen Code :

```bash
cd your-project
qwen
```

Sélectionnez l'authentification **Qwen OAuth (Gratuit)** et suivez les invites pour vous connecter. Ensuite, commençons par comprendre votre base de code. Essayez l'une de ces commandes :

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Vous serez invité à vous connecter lors de la première utilisation. C'est tout ! [Poursuivez avec le guide de démarrage rapide (5 min) →](./quickstart)

> [!tip]
>
> Consultez la [résolution des problèmes](./support/troubleshooting) si vous rencontrez des difficultés.

> [!note]
>
> **Nouvelle extension VS Code (Bêta)** : Vous préférez une interface graphique ? Notre nouvelle **extension VS Code** offre une expérience native IDE facile à utiliser sans nécessiter de maîtriser le terminal. Installez-la simplement depuis le marketplace et commencez à coder avec Qwen Code directement dans votre barre latérale. Téléchargez et installez dès maintenant [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## Ce que fait Qwen Code pour vous

- **Construire des fonctionnalités à partir de descriptions** : Dites à Qwen Code ce que vous souhaitez créer en langage naturel. Il établira un plan, écrira le code et s'assurera qu'il fonctionne.
- **Déboguer et corriger les problèmes** : Décrivez un bogue ou collez un message d'erreur. Qwen Code analysera votre base de code, identifiera le problème et implémentera une correction.
- **Naviguer dans n'importe quelle base de code** : Posez n'importe quelle question sur la base de code de votre équipe et obtenez une réponse pertinente. Qwen Code maintient une connaissance de l'ensemble de la structure de votre projet, peut rechercher des informations à jour sur le web, et avec [MCP](./features/mcp) peut extraire des données de sources externes comme Google Drive, Figma et Slack.
- **Automatiser les tâches fastidieuses** : Corrigez les problèmes de linting, résolvez les conflits de fusion et rédigez les notes de version. Faites tout cela en une seule commande depuis vos machines de développement, ou automatiquement dans votre CI.

## Pourquoi les développeurs adorent Qwen Code

- **Fonctionne dans votre terminal** : Pas une autre fenêtre de discussion. Pas un autre IDE. Qwen Code vous rejoint là où vous travaillez déjà, avec les outils que vous aimez déjà.
- **Agit concrètement** : Qwen Code peut directement modifier des fichiers, exécuter des commandes et créer des commits. Besoin de plus ? [MCP](./features/mcp) permet à Qwen Code de lire vos documents de conception dans Google Drive, de mettre à jour vos tickets dans Jira ou d'utiliser _vos_ outils de développement personnalisés.
- **Philosophie Unix** : Qwen Code est composable et scriptable. `tail -f app.log | qwen -p "Envoie-moi un message sur Slack si tu détectes des anomalies dans ce flux de logs"` _fonctionne_. Votre CI peut exécuter `qwen -p "S'il y a de nouvelles chaînes de texte, traduis-les en français et crée une PR pour que @lang-fr-team puisse les examiner"`.
