# Présentation de Qwen Code

[![@qwen-code/qwen-code downloads](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Découvrez Qwen Code, l'outil de développement agentique de Qwen qui fonctionne directement dans votre terminal et vous aide à transformer vos idées en code plus rapidement que jamais.

## Prise en main en 30 secondes

### Installer Qwen Code :

**Linux / macOS**

```sh
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.sh | bash
```

**Windows (Exécuter en tant qu'administrateur)**

```cmd
powershell -Command "Invoke-WebRequest 'https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen.bat' -OutFile (Join-Path $env:TEMP 'install-qwen.bat'); & (Join-Path $env:TEMP 'install-qwen.bat')"
```

> [!note]
>
> Il est recommandé de redémarrer votre terminal après l'installation pour que les variables d'environnement prennent effet. En cas d'échec de l'installation, consultez la section [Installation manuelle](./quickstart#manual-installation) du guide de démarrage rapide.

### Commencer à utiliser Qwen Code :

```bash
cd your-project
qwen
```

Choisissez votre méthode d'authentification — **API Key** ou **[Alibaba Cloud Coding Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index)** ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)) — et suivez les instructions pour la configurer. Consultez le guide de configuration de l'API ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)) pour des instructions étape par étape. Commençons ensuite par l'analyse de votre base de code. Essayez l'une de ces commandes :

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Une connexion vous sera demandée lors de la première utilisation. C'est tout ! [Poursuivre avec le guide de démarrage rapide (5 min) →](./quickstart)

> [!tip]
>
> Consultez la section [dépannage](./support/troubleshooting) en cas de problème.

> [!note]
>
> **Nouvelle extension VS Code (Bêta)** : Vous préférez une interface graphique ? Notre nouvelle **extension VS Code** offre une expérience IDE native intuitive, sans nécessiter de maîtrise du terminal. Installez-la simplement depuis le marketplace et commencez à coder avec Qwen Code directement dans votre barre latérale. Téléchargez et installez dès maintenant [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion).

## Ce que Qwen Code fait pour vous

- **Créer des fonctionnalités à partir de descriptions** : Décrivez à Qwen Code ce que vous souhaitez construire en langage naturel. Il élaborera un plan, écrira le code et vérifiera son bon fonctionnement.
- **Déboguer et résoudre les problèmes** : Décrivez un bug ou collez un message d'erreur. Qwen Code analysera votre base de code, identifiera le problème et appliquera une correction.
- **Naviguer dans n'importe quelle base de code** : Posez n'importe quelle question sur la base de code de votre équipe et obtenez une réponse détaillée. Qwen Code conserve une vue d'ensemble de la structure de votre projet, peut rechercher des informations à jour sur le web et, grâce à [MCP](./features/mcp), extraire des données depuis des sources externes comme Google Drive, Figma et Slack.
- **Automatiser les tâches fastidieuses** : Corrigez les problèmes de lint fastidieux, résolvez les conflits de fusion et rédigez les notes de version. Exécutez tout cela en une seule commande depuis votre machine de développement, ou automatiquement dans votre CI.
- **[Suggestions de suivi](./features/followup-suggestions)** : Qwen Code prédit ce que vous souhaitez taper ensuite et l'affiche sous forme de texte fantôme. Appuyez sur Tab pour accepter, ou continuez à taper pour ignorer.

## Pourquoi les développeurs adorent Qwen Code

- **Fonctionne dans votre terminal** : Pas une fenêtre de chat supplémentaire. Pas un autre IDE. Qwen Code vous rejoint là où vous travaillez déjà, avec les outils que vous aimez déjà.
- **Passe à l'action** : Qwen Code peut modifier directement des fichiers, exécuter des commandes et créer des commits. Besoin de plus ? [MCP](./features/mcp) permet à Qwen Code de lire vos documents de conception sur Google Drive, de mettre à jour vos tickets Jira ou d'utiliser _vos_ outils de développement personnalisés.
- **Philosophie Unix** : Qwen Code est composable et scriptable. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _fonctionne_. Votre CI peut exécuter `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.