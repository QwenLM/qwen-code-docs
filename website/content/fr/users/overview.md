# Présentation de Qwen Code

[![@qwen-code/qwen-code téléchargements](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code) [![@qwen-code/qwen-code version](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Découvrez Qwen Code, l'outil de codage agentique de Qwen qui vit dans votre terminal et vous aide à transformer vos idées en code plus rapidement que jamais.

## Démarrez en 30 secondes

### Installez Qwen Code :

Le programme d'installation recommandé utilise une archive autonome lorsqu'elle est disponible pour votre plateforme. S'il revient à npm, Node.js 22 ou ultérieur avec npm doit être disponible sur le PATH.

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
> Il est recommandé de redémarrer votre terminal après l'installation si `qwen` n'est pas immédiatement disponible sur le PATH. Si l'installation échoue, veuillez consulter [Installation manuelle](./quickstart#manual-installation) dans le guide de démarrage rapide. Pour une installation hors ligne, téléchargez une archive de release et exécutez le programme d'installation avec `--archive PATH` ; conservez `SHA256SUMS` à côté de l'archive.

### Commencez à utiliser Qwen Code :

```bash
cd your-project
qwen
```

Au premier lancement, il vous sera demandé de connecter un fournisseur de modèles. Le menu propose [**Compte Qwen avec Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) (utilisez un abonnement Qwen Plus ou Pro depuis [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)), **QwenCloud** (la configuration officielle recommandée), **Alibaba ModelStudio**, **Fournisseurs tiers** (fournisseurs intégrés tels que DeepSeek, MiniMax, Z.AI, Kimi et OpenRouter, connectés avec une clé API) et **Fournisseur personnalisé** (un serveur local, un proxy ou un fournisseur non pris en charge).

Pour utiliser votre abonnement Qwen, choisissez [**Compte Qwen avec Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) et connectez-vous avec votre compte Qwen. Un **abonnement Plus ou Pro** débloque l'accès à **Qwen Code et Agent**. Si vous n'avez pas encore d'abonnement, visitez [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) pour souscrire à Plus ou Pro, puis revenez à Qwen Code et sélectionnez [**Compte Qwen avec Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).

Pour une clé QwenCloud, choisissez **QwenCloud → Token Plan** ou **QwenCloud → Standard API Key** puis sélectionnez la plateforme (Chine ou International) — voir [Authentification](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/).

Pour le [Token Plan Alibaba Cloud](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) ([intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model)), choisissez **Alibaba ModelStudio → Token Plan** ; pour utiliser une clé API ModelStudio, choisissez **Alibaba ModelStudio → Standard API Key** et suivez le guide de configuration de l'API ([Pékin](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).

Commençons par comprendre votre base de code. Essayez l'une de ces commandes :

```
what does this project do?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Vous serez invité à vous connecter lors de la première utilisation. C'est tout ! [Poursuivez avec le guide de démarrage rapide (5 min) →](./quickstart)

> [!tip]
>
> Consultez la section [dépannage](./support/troubleshooting) si vous rencontrez des problèmes.

> [!note]
>
> **Nouvelle extension VS Code (Beta)** : Vous préférez une interface graphique ? Notre nouvelle **extension VS Code** offre une expérience IDE native facile à utiliser sans nécessiter de familiarité avec le terminal. Il suffit de l'installer depuis le marketplace et de commencer à coder avec Qwen Code directement dans votre barre latérale. Téléchargez et installez [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) dès maintenant.

## Ce que Qwen Code fait pour vous

- **Construire des fonctionnalités à partir de descriptions** : Dites à Qwen Code ce que vous voulez construire en langage naturel. Il élaborera un plan, écrira le code et s'assurera qu'il fonctionne.
- **Déboguer et corriger des problèmes** : Décrivez un bug ou collez un message d'erreur. Qwen Code analysera votre codebase, identifiera le problème et appliquera une correction.
- **Naviguer dans n'importe quelle codebase** : Posez n'importe quelle question sur le codebase de votre équipe et obtenez une réponse réfléchie. Qwen Code maintient une connaissance de l'ensemble de la structure de votre projet, peut trouver des informations à jour sur le web et, grâce à [MCP](./features/mcp), peut interroger des sources de données externes comme Google Drive, Figma et Slack.
- **Automatiser les tâches fastidieuses** : Corrigez les problèmes de lint, résolvez les conflits de fusion et rédigez des notes de version. Faites tout cela en une seule commande depuis vos machines de développement, ou automatiquement dans votre CI.
- **[Suggestions de suivi](./features/followup-suggestions)** : Qwen Code prédit ce que vous voulez taper ensuite et l'affiche sous forme de texte fantôme. Appuyez sur Tab pour accepter, ou continuez à taper pour ignorer.

## Pourquoi les développeurs adorent Qwen Code

- **Fonctionne dans votre terminal** : Pas une autre fenêtre de chat. Pas un autre IDE. Qwen Code vous rejoint là où vous travaillez déjà, avec les outils que vous aimez déjà.
- **Agit** : Qwen Code peut directement éditer des fichiers, exécuter des commandes et créer des commits. Besoin de plus ? [MCP](./features/mcp) permet à Qwen Code de lire vos documents de conception dans Google Drive, mettre à jour vos tickets dans Jira, ou utiliser _vos_ outils de développement personnalisés.
- **Philosophie Unix** : Qwen Code est composable et scriptable. `tail -f app.log | qwen -p "Slack me if you see any anomalies appear in this log stream"` _fonctionne_. Votre CI peut exécuter `qwen -p "If there are new text strings, translate them into French and raise a PR for @lang-fr-team to review"`.
