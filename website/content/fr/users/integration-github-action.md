# GitHub Actions : qwen-code-action

## Vue d'ensemble

`qwen-code-action` est une GitHub Action qui intègre [Qwen Code] dans votre flux de développement via la [Qwen Code CLI]. Elle agit à la fois comme un agent autonome pour les tâches de codage routinières critiques et comme un collaborateur à la demande auquel vous pouvez rapidement déléguer du travail.

Utilisez-la pour effectuer des revues de pull requests GitHub, trier les issues, analyser et modifier du code, et bien plus encore, en interagissant de manière conversationnelle avec [Qwen Code] (par ex., `@qwencoder fix this issue`) directement dans vos dépôts GitHub.

## Fonctionnalités

- **Automatisation** : Déclenchez des workflows en fonction d'événements (par ex. ouverture d'une issue) ou de planifications (par ex. exécution nocturne).
- **Collaboration à la demande** : Déclenchez des workflows dans les commentaires d'issues et de pull requests en mentionnant la [Qwen Code CLI](./features/commands) (par ex., `@qwencoder /review`).
- **Extensible avec des outils** : Exploitez les capacités d'appel d'outils des modèles [Qwen Code](../developers/tools/introduction.md) pour interagir avec d'autres CLI comme la [GitHub CLI] (`gh`).
- **Personnalisable** : Utilisez un fichier `QWEN.md` dans votre dépôt pour fournir des instructions et un contexte spécifiques au projet à la [Qwen Code CLI](./features/commands).

## Démarrage rapide

Commencez à utiliser la Qwen Code CLI dans votre dépôt en quelques minutes :

### 1. Obtenir une clé API Qwen

Obtenez votre clé API depuis [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (la plateforme IA d'Alibaba Cloud)

### 2. L'ajouter en tant que secret GitHub

Stockez votre clé API en tant que secret nommé `QWEN_API_KEY` dans votre dépôt :

- Accédez à **Settings > Secrets and variables > Actions** de votre dépôt
- Cliquez sur **New repository secret**
- Nom : `QWEN_API_KEY`, Valeur : votre clé API

### 3. Mettre à jour votre .gitignore

Ajoutez les entrées suivantes à votre fichier `.gitignore` :

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. Choisir un workflow

Vous disposez de deux options pour configurer un workflow :

**Option A : Utiliser la commande de configuration (Recommandé)**

1. Démarrez la Qwen Code CLI dans votre terminal :

   ```shell
   qwen
   ```

2. Dans la Qwen Code CLI de votre terminal, saisissez :

   ```
   /setup-github
   ```

**Option B : Copier manuellement les workflows**

1. Copiez les workflows préconfigurés depuis le répertoire [`examples/workflows`](./common-workflow) vers le répertoire `.github/workflows` de votre dépôt. Remarque : le workflow `qwen-dispatch.yml` doit également être copié, car il déclenche l'exécution des autres workflows.

### 5. Tester

**Revue de Pull Request :**

- Ouvrez une pull request dans votre dépôt et attendez la revue automatique
- Commentez `@qwencoder /review` sur une pull request existante pour déclencher manuellement une revue

**Tri des Issues :**

- Ouvrez une issue et attendez le tri automatique
- Commentez `@qwencoder /triage` sur des issues existantes pour déclencher manuellement le tri

**Assistance IA générale :**

- Dans n'importe quelle issue ou pull request, mentionnez `@qwencoder` suivi de votre demande
- Exemples :
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Workflows

Cette action propose plusieurs workflows préconfigurés pour différents cas d'utilisation. Chaque workflow est conçu pour être copié dans le répertoire `.github/workflows` de votre dépôt et personnalisé selon vos besoins.

### Qwen Code Dispatch

Ce workflow agit comme un répartiteur central pour la Qwen Code CLI, acheminant les requêtes vers le workflow approprié en fonction de l'événement déclencheur et de la commande fournie dans le commentaire. Pour un guide détaillé sur la configuration du workflow de dispatch, consultez la [documentation du workflow Qwen Code Dispatch](./common-workflow).

### Issue Triage

Cette action permet de trier automatiquement les GitHub Issues ou selon une planification. Pour un guide détaillé sur la configuration du système de tri des issues, consultez la [documentation du workflow GitHub Issue Triage](./examples/workflows/issue-triage).

### Pull Request Review

Cette action permet de réviser automatiquement les pull requests lors de leur ouverture. Pour un guide détaillé sur la configuration du système de revue de pull requests, consultez la [documentation du workflow GitHub PR Review](./common-workflow).

### Qwen Code CLI Assistant

Ce type d'action permet d'invoquer un assistant IA Qwen Code conversationnel à usage général au sein des pull requests et des issues pour effectuer une large gamme de tâches. Pour un guide détaillé sur la configuration du workflow Qwen Code CLI à usage général, consultez la [documentation du workflow Qwen Code Assistant](./common-workflow).

## Configuration

### Inputs

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)\_ La clé API pour l'API Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, default: `latest`)\_ La version de la Qwen Code CLI à installer. Peut être "latest", "preview", "nightly", un numéro de version spécifique, ou une branche, un tag ou un commit git. Pour plus d'informations, consultez les [versions de la Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)\_ Active la journalisation de débogage et le streaming de la sortie.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)\_ Le modèle à utiliser avec Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Optional, default: `You are a helpful assistant.`)_ Une chaîne transmise à l'[argument `--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) de la Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Optional)_ Une chaîne JSON écrite dans `.qwen/settings.json` pour configurer les paramètres _projet_ de la CLI.
  Pour plus de détails, consultez la documentation sur les [fichiers de paramètres](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, default: `false`)\_ Indique s'il faut utiliser Code Assist pour accéder aux modèles Qwen Code au lieu de la clé API Qwen Code par défaut.
  Pour plus d'informations, consultez la [documentation de la Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, default: `false`)\_ Indique s'il faut utiliser Vertex AI pour accéder aux modèles Qwen Code au lieu de la clé API Qwen Code par défaut.
  Pour plus d'informations, consultez la [documentation de la Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Optional)_ Une liste d'extensions de la Qwen Code CLI à installer.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, default: `false`)\_ Indique s'il faut télécharger les artefacts vers l'action GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, default: `false`)\_ Indique s'il faut utiliser pnpm au lieu de npm pour installer qwen-code-cli

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, default: `${{ github.workflow }}`)\_ Le nom du workflow GitHub, utilisé à des fins de télémétrie.

<!-- END_AUTOGEN_INPUTS -->

### Outputs

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: La sortie résumée de l'exécution de la Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: La sortie d'erreur de l'exécution de la Qwen Code CLI, le cas échéant.

<!-- END_AUTOGEN_OUTPUTS -->

### Variables de dépôt

Nous vous recommandons de définir les valeurs suivantes en tant que variables de dépôt afin qu'elles puissent être réutilisées dans tous les workflows. Vous pouvez également les définir directement en tant qu'inputs d'action dans des workflows individuels ou pour remplacer les valeurs au niveau du dépôt.

| Nom                | Description                                               | Type     | Requis | Quand requis             |
| ------------------ | --------------------------------------------------------- | -------- | ------ | ------------------------ |
| `DEBUG`            | Active la journalisation de débogage pour la Qwen Code CLI.              | Variable | Non    | Jamais                   |
| `QWEN_CLI_VERSION` | Contrôle la version de la Qwen Code CLI installée. | Variable | Non    | Pour épingler la version de la CLI   |
| `APP_ID`           | ID de l'application GitHub pour une authentification personnalisée.                  | Variable | Non    | Lors de l'utilisation d'une GitHub App personnalisée |

Pour ajouter une variable de dépôt :

1. Accédez à **Settings > Secrets and variables > Actions > New variable** de votre dépôt.
2. Saisissez le nom et la valeur de la variable.
3. Enregistrez.

Pour plus de détails sur les variables de dépôt, consultez la [documentation GitHub sur les variables][variables].

### Secrets

Vous pouvez définir les secrets suivants dans votre dépôt :

| Nom               | Description                                   | Requis | Quand requis                              |
| ----------------- | --------------------------------------------- | ------ | ----------------------------------------- |
| `QWEN_API_KEY`    | Votre clé API Qwen depuis DashScope.             | Oui    | Requis pour tous les workflows qui appellent Qwen. |
| `APP_PRIVATE_KEY` | Clé privée de votre GitHub App (format PEM). | Non    | Lors de l'utilisation d'une GitHub App personnalisée.                 |

Pour ajouter un secret :

1. Accédez à **Settings > Secrets and variables > Actions > New repository secret** de votre dépôt.
2. Saisissez le nom et la valeur du secret.
3. Enregistrez.

Pour plus d'informations, consultez la [documentation officielle GitHub sur la création et l'utilisation de secrets chiffrés][secrets].

## Authentification

Cette action nécessite une authentification auprès de l'API GitHub et, en option, auprès des services Qwen Code.

### Authentification GitHub

Vous pouvez vous authentifier auprès de GitHub de deux manières :

1. **`GITHUB_TOKEN` par défaut :** Pour les cas d'utilisation simples, l'action peut utiliser le `GITHUB_TOKEN` par défaut fourni par le workflow.
2. **GitHub App personnalisée (Recommandé) :** Pour une authentification plus sécurisée et flexible, nous vous recommandons de créer une GitHub App personnalisée.

Pour des instructions détaillées sur la configuration de l'authentification Qwen et GitHub, consultez la [**documentation sur l'authentification**](./configuration/auth).

## Extensions

La Qwen Code CLI peut être étendue avec des fonctionnalités supplémentaires via des extensions.
Ces extensions sont installées depuis la source de leurs dépôts GitHub.

Pour des instructions détaillées sur la configuration des extensions, consultez la [documentation sur les extensions](../developers/extensions/extension).

## Bonnes pratiques

Pour garantir la sécurité, la fiabilité et l'efficacité de vos workflows automatisés, nous vous recommandons vivement de suivre nos bonnes pratiques. Ces directives couvrent des domaines clés tels que la sécurité du dépôt, la configuration des workflows et la surveillance.

Les recommandations clés incluent :

- **Sécurisation de votre dépôt :** Mise en place de la protection des branches et des tags, et restriction des approbateurs de pull requests.
- **Surveillance et audit :** Examen régulier des journaux d'actions et activation d'OpenTelemetry pour une analyse approfondie des performances et du comportement.

Pour un guide complet sur la sécurisation de votre dépôt et de vos workflows, consultez notre [**documentation sur les bonnes pratiques**](./common-workflow).

## Personnalisation

Créez un fichier `QWEN.md` à la racine de votre dépôt pour fournir un contexte et des instructions spécifiques au projet à la [Qwen Code CLI](./common-workflow). Cela est utile pour définir des conventions de codage, des modèles architecturaux ou d'autres directives que le modèle doit suivre pour un dépôt donné.

## Contribution

Les contributions sont les bienvenues ! Consultez le **Guide de contribution** de la Qwen Code CLI pour plus de détails sur la marche à suivre.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context