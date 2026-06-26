# Github Actions：qwen-code-action

## Vue d'ensemble

`qwen-code-action` est une action GitHub qui intègre [Qwen Code] dans votre workflow de développement via le [Qwen Code CLI]. Elle agit à la fois comme un agent autonome pour les tâches de codage routinières critiques, et comme un collaborateur à la demande auquel vous pouvez rapidement déléguer du travail.

Utilisez-la pour effectuer des revues de pull requests GitHub, trier des issues, analyser et modifier du code, et plus encore, en utilisant [Qwen Code] de manière conversationnelle (par exemple, `@qwencoder corrige ce problème`) directement dans vos dépôts GitHub.

## Fonctionnalités

- **Automatisation** : Déclenchez des workflows basés sur des événements (ex. ouverture d'issue) ou des plannings (ex. nocturne).
- **Collaboration à la demande** : Déclenchez des workflows dans les commentaires d'issues et de pull requests en mentionnant le [Qwen Code CLI](./features/commands) (ex. `@qwencoder /review`).
- **Extensible avec des outils** : Exploitez les capacités d'appel d'outils des modèles [Qwen Code](../developers/tools/introduction.md) pour interagir avec d'autres CLI comme [GitHub CLI] (`gh`).
- **Personnalisable** : Utilisez un fichier `QWEN.md` dans votre dépôt pour fournir des instructions et un contexte spécifiques au projet à [Qwen Code CLI](./features/commands).

## Démarrage rapide

Commencez avec Qwen Code CLI dans votre dépôt en quelques minutes :

### 1. Obtenez une clé API Qwen

Obtenez votre clé API depuis [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (la plateforme IA d'Alibaba Cloud)

### 2. Ajoutez-la comme secret GitHub

Stockez votre clé API comme un secret nommé `QWEN_API_KEY` dans votre dépôt :

- Allez dans **Settings > Secrets and variables > Actions** de votre dépôt
- Cliquez sur **New repository secret**
- Nom : `QWEN_API_KEY`, Valeur : votre clé API

### 3. Mettez à jour votre .gitignore

Ajoutez les entrées suivantes à votre fichier `.gitignore` :

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. Choisissez un workflow

Vous avez deux options pour configurer un workflow :

**Option A : Utiliser la commande de configuration (Recommandé)**

1. Lancez Qwen Code CLI dans votre terminal :

   ```shell
   qwen
   ```

2. Dans Qwen Code CLI dans votre terminal, tapez :

   ```
   /setup-github
   ```

**Option B : Copier manuellement les workflows**

1. Copiez les workflows préconstruits depuis le répertoire [`examples/workflows`](./common-workflow) vers le répertoire `.github/workflows` de votre dépôt. Remarque : le workflow `qwen-dispatch.yml` doit également être copié, car il déclenche l'exécution des workflows.

### 5. Essayez-le

**Revue de pull request :**

- Ouvrez une pull request dans votre dépôt et attendez la revue automatique
- Commentez `@qwencoder /review` sur une pull request existante pour déclencher manuellement une revue

**Tri des issues :**

- Ouvrez une issue et attendez le tri automatique
- Commentez `@qwencoder /triage` sur des issues existantes pour déclencher manuellement le tri

**Assistance IA générale :**

- Dans toute issue ou pull request, mentionnez `@qwencoder` suivi de votre demande
- Exemples :
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Workflows

Cette action fournit plusieurs workflows préconstruits pour différents cas d'utilisation. Chaque workflow est conçu pour être copié dans le répertoire `.github/workflows` de votre dépôt et personnalisé selon vos besoins.

### Qwen Code Dispatch

Ce workflow agit comme un répartiteur central pour Qwen Code CLI, acheminant les requêtes vers le workflow approprié en fonction de l'événement déclencheur et de la commande fournie dans le commentaire. Pour un guide détaillé sur la configuration du workflow de répartition, consultez la [documentation du workflow Qwen Code Dispatch](./common-workflow).

### Issue Triage

Cette action peut être utilisée pour trier automatiquement les issues GitHub selon un planning ou à la demande. Pour un exemple fonctionnel de configuration de tri automatique d'issues, consultez le [workflow de tri automatique d'issues](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Pull Request Review

Cette action peut être utilisée pour revoir automatiquement les pull requests lorsqu'elles sont ouvertes. Pour un guide détaillé sur la configuration du système de revue de pull requests, consultez la [documentation du workflow de revue GitHub PR](./common-workflow).

### Qwen Code CLI Assistant

Ce type d'action peut être utilisé pour invoquer un assistant IA conversationnel généraliste basé sur Qwen Code dans les pull requests et les issues afin d'effectuer une large gamme de tâches. Pour un guide détaillé sur la configuration du workflow généraliste Qwen Code CLI, consultez la [documentation du workflow Assistant Qwen Code](./common-workflow).

## Configuration

### Entrées (Inputs)

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optionnelle)\_ La clé API pour l'API Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optionnelle, défaut : `latest`)\_ La version de Qwen Code CLI à installer. Peut être "latest", "preview", "nightly", un numéro de version spécifique, ou une branche, un tag ou un commit git. Pour plus d'informations, consultez les [versions de Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optionnelle)\_ Active les logs de débogage et le streaming de sortie.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optionnelle)\_ Le modèle à utiliser avec Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: *(Optionnelle, défaut : `You are a helpful assistant.`)* Une chaîne passée à l'argument [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) de Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: *(Optionnelle)* Une chaîne JSON écrite dans `.qwen/settings.json` pour configurer les paramètres *projet* du CLI. Pour plus de détails, consultez la documentation sur les [fichiers de paramètres](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optionnelle, défaut : `false`)* Indique s'il faut utiliser Code Assist pour l'accès au modèle Qwen Code au lieu de la clé API Qwen par défaut. Pour plus d'informations, consultez la [documentation de Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optionnelle, défaut : `false`)* Indique s'il faut utiliser Vertex AI pour l'accès au modèle Qwen Code au lieu de la clé API Qwen par défaut. Pour plus d'informations, consultez la [documentation de Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: *(Optionnelle)* Une liste d'extensions Qwen Code CLI à installer.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optionnelle, défaut : `false`)* Indique s'il faut télécharger des artefacts vers l'action GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optionnelle, défaut : `false`)* Indique s'il faut utiliser pnpm au lieu de npm pour installer qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optionnelle, défaut : `${{ github.workflow }}`)* Le nom du workflow GitHub, utilisé à des fins de télémétrie.

<!-- END_AUTOGEN_INPUTS -->

### Sorties (Outputs)

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: La sortie résumée de l'exécution de Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: La sortie d'erreur de l'exécution de Qwen Code CLI, le cas échéant.

<!-- END_AUTOGEN_OUTPUTS -->

### Variables de dépôt

Nous recommandons de définir les valeurs suivantes comme variables de dépôt afin qu'elles puissent être réutilisées dans tous les workflows. Vous pouvez également les définir en ligne comme entrées d'action dans des workflows individuels ou pour remplacer les valeurs au niveau du dépôt.

| Nom               | Description                                               | Type     | Requise | Quand elle est requise           |
| ----------------- | --------------------------------------------------------- | -------- | ------- | -------------------------------- |
| `DEBUG`           | Active les logs de débogage pour Qwen Code CLI.           | Variable | Non     | Jamais                           |
| `QWEN_CLI_VERSION`| Contrôle la version de Qwen Code CLI installée.            | Variable | Non     | Pour fixer la version du CLI     |
| `APP_ID`          | ID de l'App GitHub pour l'authentification personnalisée. | Variable | Non     | Lors de l'utilisation d'une App GitHub personnalisée |

Pour ajouter une variable de dépôt :

1. Allez dans **Settings > Secrets and variables > Actions > New variable** de votre dépôt.
2. Saisissez le nom et la valeur de la variable.
3. Enregistrez.

Pour plus de détails sur les variables de dépôt, reportez-vous à la [documentation GitHub sur les variables][variables].

### Secrets

Vous pouvez définir les secrets suivants dans votre dépôt :

| Nom              | Description                                   | Requise | Quand elle est requise                |
| -----------------| --------------------------------------------- | ------- | ------------------------------------- |
| `QWEN_API_KEY`   | Votre clé API Qwen depuis DashScope.          | Oui     | Requise pour tous les workflows appelant Qwen. |
| `APP_PRIVATE_KEY`| Clé privée pour votre App GitHub (format PEM).| Non     | Lors de l'utilisation d'une App GitHub personnalisée. |

Pour ajouter un secret :

1. Allez dans **Settings > Secrets and variables > Actions > New repository secret** de votre dépôt.
2. Saisissez le nom et la valeur du secret.
3. Enregistrez.

Pour plus d'informations, reportez-vous à la [documentation officielle GitHub sur la création et l'utilisation de secrets chiffrés][secrets].

## Authentification

Cette action nécessite une authentification auprès de l'API GitHub et éventuellement auprès des services Qwen Code.

### Authentification GitHub

Vous pouvez vous authentifier avec GitHub de deux manières :

1. **`GITHUB_TOKEN` par défaut :** Pour les cas d'utilisation simples, l'action peut utiliser le `GITHUB_TOKEN` par défaut fourni par le workflow.
2. **App GitHub personnalisée (Recommandé) :** Pour l'authentification la plus sécurisée et flexible, nous recommandons de créer une App GitHub personnalisée.

Pour des instructions détaillées de configuration pour l'authentification Qwen et GitHub, consultez la [**documentation d'authentification**](./configuration/auth).

## Extensions

Le CLI Qwen Code peut être étendu avec des fonctionnalités supplémentaires via des extensions. Ces extensions sont installées depuis la source de leurs dépôts GitHub.

Pour des instructions détaillées sur la configuration et l'installation des extensions, consultez la [documentation des extensions](./extension/introduction.md).

## Bonnes pratiques

Pour garantir la sécurité, la fiabilité et l'efficacité de vos workflows automatisés, nous vous recommandons vivement de suivre nos bonnes pratiques. Ces directives couvrent des domaines clés tels que la sécurité du dépôt, la configuration des workflows et la supervision.

Recommandations principales :

- **Sécurisation de votre dépôt :** Mettre en place des protections de branches et de tags, et restreindre les approbateurs de pull requests.
- **Supervision et audit :** Consulter régulièrement les logs des actions et activer OpenTelemetry pour obtenir des informations approfondies sur les performances et le comportement.

Pour un guide complet sur la sécurisation de votre dépôt et de vos workflows, veuillez consulter notre [**documentation des bonnes pratiques**](./common-workflow).

## Personnalisation

Créez un fichier `QWEN.md` à la racine de votre dépôt pour fournir un contexte et des instructions spécifiques au projet à [Qwen Code CLI](./common-workflow). Cela est utile pour définir des conventions de codage, des schémas architecturaux ou d'autres directives que le modèle doit suivre pour un dépôt donné.

## Contribuer

Les contributions sont les bienvenues ! Consultez le **Guide de contribution** de Qwen Code CLI pour plus de détails sur la façon de commencer.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context