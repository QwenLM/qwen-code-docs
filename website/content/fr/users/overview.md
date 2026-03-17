# Aperçu de Qwen Code

[![@qwen-code/qwen-code téléchargements](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)  
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Découvrez Qwen Code, l’outil de programmation autonome de Qwen, intégré directement à votre terminal et conçu pour vous aider à transformer vos idées en code plus rapidement que jamais.

## Commencez en 30 secondes

### Installer Qwen Code :

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (exécuter l’invite de commandes en tant qu’administrateur)**

```sh
curl -fsSL -o %TEMP%\install-qwen.bat https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat && %TEMP%\install-qwen.bat
```

> [!note]
>
> Il est recommandé de redémarrer votre terminal après l’installation afin de vous assurer que les variables d’environnement sont prises en compte. Si l’installation échoue, veuillez consulter la section [Installation manuelle](./quickstart#manual-installation) du guide de démarrage rapide.

### Commencez à utiliser Qwen Code :

```bash
cd your-project
qwen
```

Sélectionnez l’authentification **Qwen OAuth (gratuite)** et suivez les invites pour vous connecter. Ensuite, commençons par comprendre votre base de code. Essayez l’une de ces commandes :

```
À quoi sert ce projet ?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Vous devrez vous connecter lors de la première utilisation. C’est tout ! [Passez au guide de démarrage rapide (5 minutes) →](./quickstart)

> [!tip]
>
> Consultez la section [résolution des problèmes](./support/troubleshooting) si vous rencontrez des difficultés.

> [!note]
>
> **Nouvelle extension VS Code (version bêta)** : Vous préférez une interface graphique ? Notre nouvelle **extension VS Code** offre une expérience IDE native simple d’utilisation, sans nécessiter de connaissances en ligne de commande. Installez-la simplement depuis le marketplace et commencez immédiatement à coder avec Qwen Code directement depuis votre barre latérale. Téléchargez et installez dès maintenant le [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## Ce que Qwen Code fait pour vous

- **Créez des fonctionnalités à partir de descriptions** : Expliquez à Qwen Code ce que vous souhaitez développer, en langage naturel. Il établira un plan, rédigera le code correspondant et s’assurera qu’il fonctionne correctement.
- **Déboguez et corrigez les problèmes** : Décrivez un bogue ou collez un message d’erreur. Qwen Code analysera votre base de code, identifiera la cause du problème et appliquera une correction.
- **Parcourez n’importe quelle base de code** : Posez toutes vos questions concernant la base de code de votre équipe et obtenez des réponses réfléchies. Qwen Code conserve une connaissance complète de la structure de votre projet, peut récupérer des informations actualisées depuis le web, et, grâce à [MCP](./features/mcp), peut également extraire des données provenant de sources externes telles que Google Drive, Figma et Slack.
- **Automatisez les tâches répétitives** : Corrigez les problèmes liés aux outils de linting, résolvez les conflits de fusion et générez des notes de version. Effectuez toutes ces opérations via une seule commande exécutée depuis vos machines de développement, ou automatiquement dans votre pipeline d’intégration continue (CI).

## Pourquoi les développeurs adorent Qwen Code

- **Fonctionne dans votre terminal** : Pas une autre fenêtre de discussion. Pas un autre IDE. Qwen Code vous rejoint là où vous travaillez déjà, avec les outils que vous appréciez déjà.
- **Agit concrètement** : Qwen Code peut modifier directement des fichiers, exécuter des commandes et créer des commits. Vous souhaitez plus de fonctionnalités ? [MCP](./features/mcp) permet à Qwen Code de lire vos documents de conception dans Google Drive, de mettre à jour vos tickets dans Jira ou d’utiliser _vos propres_ outils de développement personnalisés.
- **Philosophie Unix** : Qwen Code est composable et scriptable. La commande `tail -f app.log | qwen -p "Envoie-moi un message Slack si tu détectes des anomalies dans ce flux de logs"` _fonctionne_. Votre pipeline CI peut exécuter `qwen -p "Si de nouvelles chaînes de texte apparaissent, traduis-les en français et crée une demande d’incorporation (PR) pour examen par l’équipe @lang-fr-team"`.