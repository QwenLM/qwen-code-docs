# GitHub Actions : qwen-code-action

## Vue d'ensemble

`qwen-code-action` est une GitHub Action qui intègre [Qwen Code] à votre workflow de développement via [Qwen Code CLI]. Il agit à la fois comme un agent autonome pour les tâches de codage routinières critiques, et comme un collaborateur à la demande auquel vous pouvez rapidement déléguer du travail.

Utilisez-le pour effectuer des revues de pull requests GitHub, trier les issues, effectuer des analyses et modifications de code, et bien plus encore en utilisant [Qwen Code] de manière conversationnelle (par exemple, `@qwencoder fix this issue`) directement dans vos dépôts GitHub.

## Fonctionnalités

- **Automatisation** : Déclenchez des workflows basés sur des événements (par exemple, l'ouverture d'une issue) ou des planifications (par exemple, chaque nuit).
- **Collaboration à la demande** : Déclenchez des workflows dans les commentaires des issues et des pull requests en mentionnant [Qwen Code CLI](./features/commands) (par exemple, `@qwencoder /review`).
- **Extensible avec des outils** : Tirez parti des capacités d'appel d'outils des modèles [Qwen Code](../developers/tools/introduction.md) pour interagir avec d'autres CLI comme [GitHub CLI] (`gh`).
- **Personnalisable** : Utilisez un fichier `QWEN.md` dans votre dépôt pour fournir des instructions et un contexte spécifiques au projet à [Qwen Code CLI](./features/commands).

## Démarrage rapide

Commencez à utiliser Qwen Code CLI dans votre dépôt en quelques minutes seulement :

### 1. Obtenir une clé API Qwen

Obtenez votre clé API depuis [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (la plateforme d'IA d'Alibaba Cloud).

### 2. L'ajouter en tant que secret GitHub

Stockez votre clé API en tant que secret nommé `QWEN_API_KEY` dans votre dépôt :

- Allez dans **Paramètres > Secrets et variables > Actions** de votre dépôt
- Cliquez sur **Nouveau secret de dépôt**
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

Vous avez deux options pour configurer un workflow :

**Option A : Utiliser la commande setup (Recommandé)**

1. Démarrez Qwen Code CLI dans votre terminal :

   ```shell
   qwen
   ```

2. Dans Qwen Code CLI dans votre terminal, tapez :

   ```
   /setup-github
   ```

**Option B : Copier manuellement les workflows**

1. Copiez les workflows préconstruits depuis le répertoire [`examples/workflows`](./common-workflow) vers le répertoire `.github/workflows` de votre dépôt. Remarque : le workflow `qwen-dispatch.yml` doit également être copié, car il déclenche l'exécution des workflows.

### 5. Tester

**Revue de Pull Request :**

- Ouvrez une pull request dans votre dépôt et attendez la revue automatique
- Commentez `@qwencoder /review` sur une pull request existante pour déclencher manuellement une revue

**Tri des Issues :**

- Ouvrez une issue et attendez le tri automatique
- Commentez `@qwencoder /triage` sur des issues existantes pour déclencher manuellement le tri

**Assistance IA Générale :**

- Dans n'importe quelle issue ou pull request, mentionnez `@qwencoder` suivi de votre demande
- Exemples :
  - `@qwencoder explique ce changement de code`
  - `@qwencoder suggère des améliorations pour cette fonction`
  - `@qwencoder aide-moi à déboguer cette erreur`
  - `@qwencoder écris des tests unitaires pour ce composant`

## Workflows

Cette action fournit plusieurs workflows préconstruits pour différents cas d'utilisation. Chaque workflow est conçu pour être copié dans le répertoire `.github/workflows` de votre dépôt et personnalisé selon vos besoins.

### Qwen Code Dispatch

Ce workflow agit comme un répartiteur central pour Qwen Code CLI, acheminant les requêtes vers le workflow approprié en fonction de l'événement déclencheur et de la commande fournie dans le commentaire. Pour un guide détaillé sur la configuration du workflow de dispatch, consultez la [documentation du workflow Qwen Code Dispatch](./common-workflow).

### Tri des Issues

Cette action peut être utilisée pour trier les issues GitHub automatiquement ou à la demande. Pour une configuration fonctionnelle de tri des issues, consultez le [workflow de tri Qwen](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-triage.yml).

### Revue de Pull Request

Cette action peut être utilisée pour revoir automatiquement les pull requests lors de leur ouverture. Pour un guide détaillé sur la configuration du système de revue de pull requests, consultez la [documentation du workflow GitHub PR Review](./common-workflow).

### Assistant Qwen Code CLI

Ce type d'action peut être utilisé pour invoquer un assistant IA Qwen Code conversationnel et polyvalent dans les pull requests et les issues afin d'effectuer un large éventail de tâches. Pour un guide détaillé sur la configuration du workflow Qwen Code CLI polyvalent, consultez la [documentation du workflow Qwen Code Assistant](./common-workflow).

## Configuration

### Entrées

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Facultatif)* La clé API pour l'API Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Facultatif, par défaut : `latest`)* La version de Qwen Code CLI à installer. Peut être "latest", "preview", "nightly", un numéro de version spécifique, ou une branche, un tag ou un commit git. Pour plus d'informations, consultez les [versions de Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Facultatif)* Activer la journalisation de débogage et le streaming de sortie.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Facultatif)* Le modèle à utiliser avec Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: *(Facultatif, par défaut : `You are a helpful assistant.`)* Une chaîne de caractères passée à l'[`argument --prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) de Qwen Code CLI.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: *(Facultatif)* Une chaîne JSON écrite dans `.qwen/settings.json` pour configurer les paramètres de _projet_ de la CLI.
  Pour plus de détails, consultez la documentation sur les [fichiers de paramètres](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Facultatif, par défaut : `false`)* Indique s'il faut utiliser Code Assist pour l'accès au modèle Qwen Code au lieu de la clé API Qwen Code par défaut.
  Pour plus d'informations, consultez la [documentation de Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Facultatif, par défaut : `false`)* Indique s'il faut utiliser Vertex AI pour l'accès au modèle Qwen Code au lieu de la clé API Qwen Code par défaut.
  Pour plus d'informations, consultez la [documentation de Qwen Code CLI](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: *(Facultatif)* Une liste d'extensions Qwen Code CLI à installer.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Facultatif, par défaut : `false`)* Indique s'il faut téléverser les artefacts vers l'action GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Facultatif, par défaut : `false`)* Indique s'il faut utiliser pnpm au lieu de npm pour installer qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Facultatif, par défaut : `${{ github.workflow }}`)* Le nom du workflow GitHub, utilisé à des fins de télémétrie.

<!-- END_AUTOGEN_INPUTS -->

### Sorties

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: La sortie résumée de l'exécution de Qwen Code CLI.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: La sortie d'erreur de l'exécution de Qwen Code CLI, le cas échéant.

<!-- END_AUTOGEN_OUTPUTS -->

### Variables de dépôt

Nous recommandons de définir les valeurs suivantes en tant que variables de dépôt afin qu'elles puissent être réutilisées dans tous les workflows. Vous pouvez également les définir en ligne en tant qu'entrées d'action dans des workflows individuels ou pour remplacer les valeurs au niveau du dépôt.

| Nom               | Description                                               | Type     | Obligatoire | Quand obligatoire         |
| ----------------- | --------------------------------------------------------- | -------- | ----------- | ------------------------- |
| `DEBUG`           | Active la journalisation de débogage pour Qwen Code CLI.  | Variable | Non         | Jamais                    |
| `QWEN_CLI_VERSION`| Contrôle la version de Qwen Code CLI installée.           | Variable | Non         | Épinglage de la version de la CLI |
| `APP_ID`          | ID de l'application GitHub pour l'authentification personnalisée. | Variable | Non  | Utilisation d'une application GitHub personnalisée |

Pour ajouter une variable de dépôt :

1. Allez dans **Paramètres > Secrets et variables > Actions > Nouvelle variable** de votre dépôt.
2. Saisissez le nom et la valeur de la variable.
3. Enregistrez.

Pour plus de détails sur les variables de dépôt, consultez la [documentation GitHub sur les variables][variables].

### Secrets

Vous pouvez définir les secrets suivants dans votre dépôt :

| Nom              | Description                                   | Obligatoire | Quand obligatoire                          |
| ---------------- | --------------------------------------------- | ----------- | ------------------------------------------ |
| `QWEN_API_KEY`   | Votre clé API Qwen de DashScope.              | Oui         | Requis pour tous les workflows qui appellent Qwen. |
| `APP_PRIVATE_KEY`| Clé privée de votre application GitHub (format PEM). | Non    | Utilisation d'une application GitHub personnalisée. |

Pour ajouter un secret :

1. Allez dans **Paramètres > Secrets et variables > Actions > Nouveau secret de dépôt** de votre dépôt.
2. Saisissez le nom et la valeur du secret.
3. Enregistrez.

Pour plus d'informations, consultez la [documentation officielle GitHub sur la création et l'utilisation de secrets chiffrés][secrets].

## Authentification

Cette action nécessite une authentification auprès de l'API GitHub et, optionnellement, auprès des services Qwen Code.

### Authentification GitHub

Vous pouvez vous authentifier auprès de GitHub de deux manières :

1. **`GITHUB_TOKEN` par défaut :** Pour les cas d'utilisation simples, l'action peut utiliser le `GITHUB_TOKEN` par défaut fourni par le workflow.
2. **Application GitHub personnalisée (Recommandé) :** Pour une authentification plus sûre et plus flexible, nous recommandons de créer une application GitHub personnalisée.

Pour des instructions de configuration détaillées pour l'authentification Qwen et GitHub, consultez la [**documentation sur l'authentification**](./configuration/auth).

## Extensions

Qwen Code CLI peut être étendu avec des fonctionnalités supplémentaires via des extensions.
Ces extensions sont installées depuis la source de leurs dépôts GitHub.

Pour des instructions détaillées sur la configuration des extensions, consultez la [documentation sur les extensions](./extension/introduction.md).

## Bonnes pratiques

Pour garantir la sécurité, la fiabilité et l'efficacité de vos workflows automatisés, nous vous recommandons fortement de suivre nos bonnes pratiques. Ces directives couvrent des domaines clés tels que la sécurité du dépôt, la configuration des workflows et le monitoring.

Les recommandations clés incluent :

- **Sécurisation de votre dépôt :** Mise en œuvre de la protection des branches et des tags, et restriction des approbateurs de pull requests.
- **Monitoring et audit :** Révision régulière des journaux d'action et activation d'OpenTelemetry pour une meilleure visibilité sur les performances et le comportement.

Pour un guide complet sur la sécurisation de votre dépôt et de vos workflows, veuillez consulter notre [**documentation sur les bonnes pratiques**](./common-workflow).

## Personnalisation

Créez un fichier QWEN.md à la racine de votre dépôt pour fournir un contexte et des instructions spécifiques au projet à [Qwen Code CLI](./common-workflow). Cela est utile pour définir des conventions de codage, des modèles architecturaux ou d'autres directives que le modèle doit suivre pour un dépôt donné.
## Contribuer

Les contributions sont les bienvenues ! Consultez le **guide de contribution** de Qwen Code CLI pour plus de détails sur les premiers pas.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context