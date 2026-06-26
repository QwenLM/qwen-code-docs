# Aperçu de Qwen Code

[![Téléchargements @qwen-code/qwen-code](https://img.shields.io/npm/dw/@qwen-code/qwen-code.svg)](https://npm-compare.com/@qwen-code/qwen-code)
[![Version @qwen-code/qwen-code](https://img.shields.io/npm/v/@qwen-code/qwen-code.svg)](https://www.npmjs.com/package/@qwen-code/qwen-code)

> Découvrez Qwen Code, l'outil de codage agentique de Qwen qui vit dans votre terminal et vous aide à transformer des idées en code plus rapidement que jamais.

## Commencez en 30 secondes

### Installer Qwen Code :

Le programme d'installation recommandé utilise une archive autonome lorsqu'elle est disponible pour votre plateforme. En cas de repli sur npm, Node.js 22 ou ultérieur avec npm doit être disponible dans le PATH.

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
> Il est recommandé de redémarrer votre terminal après l'installation si `qwen` n'est pas immédiatement disponible dans le PATH. Si l'installation échoue, veuillez vous référer à la section [Installation manuelle](./quickstart#manual-installation) du guide de démarrage rapide. Pour une installation hors ligne, téléchargez une archive de version et exécutez le programme d'installation avec `--archive PATH` ; conservez le fichier `SHA256SUMS` à côté de l'archive.

### Commencer à utiliser Qwen Code :

```bash
cd votre-projet
qwen
```

Au premier lancement, il vous sera demandé de connecter un fournisseur de modèle. Le menu propose **Alibaba ModelStudio** (Coding Plan, Token Plan ou clé API Standard), **Fournisseurs tiers** (fournisseurs intégrés tels que DeepSeek, MiniMax, Z.AI et OpenRouter, connectés avec une clé API), et **Fournisseur personnalisé** (un serveur local, un proxy ou un fournisseur non pris en charge). Pour le [Coding Plan Alibaba Cloud](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) ([intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)), choisissez **Alibaba ModelStudio → Coding Plan** ; pour utiliser une clé API ModelStudio, choisissez **Alibaba ModelStudio → Clé API Standard** et suivez le guide de configuration de l'API ([Pékin](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)). Ensuite, commençons par comprendre votre base de code. Essayez l'une de ces commandes :

```
que fait ce projet ?
```

![](https://cloud.video.taobao.com/vod/j7-QtQScn8UEAaEdiv619fSkk5p-t17orpDbSqKVL5A.mp4)

Une connexion vous sera demandée lors de la première utilisation. C'est tout ! [Continuez avec le démarrage rapide (5 min) →](./quickstart)

> [!tip]
>
> Consultez la [résolution des problèmes](./support/troubleshooting) si vous rencontrez des difficultés.

> [!note]
>
> **Nouvelle extension VS Code (Bêta)** : Vous préférez une interface graphique ? Notre nouvelle **extension VS Code** offre une expérience IDE native facile à utiliser, sans nécessiter de familiarité avec le terminal. Il suffit de l'installer depuis le marketplace et de commencer à coder avec Qwen Code directement dans votre barre latérale. Téléchargez et installez [Qwen Code Companion](https://marketplace.visualstudio.com/items?itemName=qwenlm.qwen-code-vscode-ide-companion) dès maintenant.

## Ce que Qwen Code fait pour vous

- **Construire des fonctionnalités à partir de descriptions** : Dites à Qwen Code ce que vous voulez construire en langage naturel. Il établira un plan, écrira le code et s'assurera que tout fonctionne.
- **Déboguer et corriger des problèmes** : Décrivez un bogue ou collez un message d'erreur. Qwen Code analysera votre base de code, identifiera le problème et mettra en œuvre une correction.
- **Naviguer dans n'importe quelle base de code** : Posez n'importe quelle question sur la base de code de votre équipe et obtenez une réponse réfléchie. Qwen Code reste conscient de toute la structure de votre projet, peut trouver des informations à jour sur le web et, avec [MCP](./features/mcp), peut interroger des sources de données externes comme Google Drive, Figma et Slack.
- **Automatiser les tâches fastidieuses** : Corrigez les problèmes de lint, résolvez les conflits de fusion et rédigez des notes de version. Faites tout cela en une seule commande depuis vos machines de développement, ou automatiquement dans CI.
- **[Suggestions de suivi](./features/followup-suggestions)** : Qwen Code prédit ce que vous voulez taper ensuite et l'affiche sous forme de texte fantôme. Appuyez sur Tab pour accepter, ou continuez à taper pour ignorer.

## Pourquoi les développeurs adorent Qwen Code

- **Fonctionne dans votre terminal** : Pas une autre fenêtre de chat. Pas un autre IDE. Qwen Code vous rencontre là où vous travaillez déjà, avec les outils que vous aimez déjà.
- **Passe à l'action** : Qwen Code peut directement modifier des fichiers, exécuter des commandes et créer des commits. Besoin de plus ? [MCP](./features/mcp) permet à Qwen Code de lire vos documents de conception dans Google Drive, de mettre à jour vos tickets dans Jira, ou d'utiliser _vos_ outils de développement personnalisés.
- **Philosophie Unix** : Qwen Code est composable et scriptable. `tail -f app.log | qwen -p "Envoie-moi un message sur Slack si tu vois des anomalies apparaître dans ce flux de logs"` _fonctionne_. Votre CI peut exécuter `qwen -p "S'il y a de nouvelles chaînes de texte, traduis-les en français et crée une PR pour que l'équipe @lang-fr-team la révise"`.
