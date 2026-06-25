# Github Actions：qwen-code-action

## Aperçu

`qwen-code-action` est une Action GitHub qui intègre [Qwen Code] dans votre flux de travail de développement via le [Qwen Code CLI]. Elle agit à la fois comme un agent autonome pour les tâches de codage courantes et critiques, et comme un collaborateur à la demande à qui vous pouvez rapidement déléguer du travail.

Utilisez-la pour effectuer des revues de pull requests GitHub, trier des issues, réaliser des analyses et modifications de code, et bien plus encore, en utilisant [Qwen Code] de manière conversationnelle (par exemple, `@qwencoder résous ce problème`) directement dans vos dépôts GitHub.

## Fonctionnalités

- **Automatisation** : Déclenchez des workflows basés sur des événements (par ex. ouverture d'issue) ou des plannings (par ex. toutes les nuits).
- **Collaboration à la demande** : Déclenchez des workflows dans les commentaires d'issues et de pull requests en mentionnant le [CLI Qwen Code](./features/commands) (par ex., `@qwencoder /review`).
- **Extensible avec des outils** : Exploitez les capacités d'appel d'outils des modèles [Qwen Code](../developers/tools/introduction.md) pour interagir avec d'autres CLI comme le [GitHub CLI] (`gh`).
- **Personnalisable** : Utilisez un fichier `QWEN.md` dans votre dépôt pour fournir des instructions et du contexte spécifiques au projet au [CLI Qwen Code](./features/commands).

## Démarrage rapide

Commencez à utiliser le CLI Qwen Code dans votre dépôt en quelques minutes :

### 1. Obtenez une clé API Qwen

Obtenez votre clé API depuis [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (la plateforme IA d'Alibaba Cloud).

### 2. Ajoutez-la comme secret GitHub

Stockez votre clé API en tant que secret nommé `QWEN_API_KEY` dans votre dépôt :

- Allez dans **Settings > Secrets and variables > Actions** de votre dépôt.
- Cliquez sur **New repository secret**.
- Nom : `QWEN_API_KEY`, Valeur : votre clé API.

### 3. Mettez à jour votre fichier .gitignore

Ajoutez les entrées suivantes à votre fichier `.gitignore` :

```gitignore
# paramètres qwen-code-cli
.qwen/

# identifiants d'application GitHub
gha-creds-*.json
```

### 4. Choisissez un workflow

Vous avez deux options pour configurer un workflow :

**Option A : Utiliser la commande de configuration (recommandée)**

1. Lancez le CLI Qwen Code dans votre terminal :

   ```shell
   qwen
   ```

2. Dans le CLI Qwen Code dans votre terminal, tapez :

   ```
   /setup-github
   ```

**Option B : Copier manuellement les workflows**

1. Copiez les workflows pré-construits depuis le répertoire [`examples/workflows`](./common-workflow) vers le répertoire `.github/workflows` de votre dépôt. Note : le workflow `qwen-dispatch.yml` doit également être copié, car il déclenche l'exécution des workflows.

### 5. Essayez-le

**Revue de pull request :**

- Ouvrez une pull request dans votre dépôt et attendez la revue automatique.
- Commentez `@qwencoder /review` sur une pull request existante pour déclencher manuellement une revue.

**Tri d'issue :**

- Ouvrez une issue et attendez le tri automatique.
- Commentez `@qwencoder /triage` sur des issues existantes pour déclencher manuellement le tri.

**Assistance IA générale :**

- Dans n'importe quelle issue ou pull request, mentionnez `@qwencoder` suivi de votre demande.
- Exemples :
  - `@qwencoder explique ce changement de code`
  - `@qwencoder suggère des améliorations pour cette fonction`
  - `@qwencoder aide-moi à déboguer cette erreur`
  - `@qwencoder écris des tests unitaires pour ce composant`

## Workflows

Cette action fournit plusieurs workflows pré-construits pour différents cas d'utilisation. Chaque workflow est conçu pour être copié dans le répertoire `.github/workflows` de votre dépôt et personnalisé selon vos besoins.

### Dispatch Qwen Code

Ce workflow agit comme un répartiteur central pour le CLI Qwen Code, en dirigeant les requêtes vers le workflow approprié en fonction de l'événement déclencheur et de la commande fournie dans le commentaire. Pour un guide détaillé sur la configuration du workflow de dispatch, consultez la [documentation du workflow Qwen Code Dispatch](./common-workflow).

### Tri d'issue

Cette action peut être utilisée pour trier automatiquement les issues GitHub ou selon un planning. Pour une configuration fonctionnelle de tri d'issues, consultez le [workflow de tri automatisé d'issues](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml).

### Revue de pull request

Cette action peut être utilisée pour revoir automatiquement les pull requests lorsqu'elles sont ouvertes. Pour un guide détaillé sur la configuration du système de revue de pull requests, consultez la [documentation du workflow de revue PR GitHub](./common-workflow).

### Assistant CLI Qwen Code

Ce type d'action peut être utilisé pour invoquer un assistant IA conversationnel polyvalent de Qwen Code dans les pull requests et les issues afin d'effectuer un large éventail de tâches. Pour un guide détaillé sur la configuration du workflow général du CLI Qwen Code, consultez la [documentation du workflow Assistant Qwen Code](./common-workflow).

## Configuration

### Entrées

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a> : *(Optionnel)* La clé API pour l'API Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a> : *(Optionnel, défaut : `latest`)* La version du CLI Qwen Code à installer. Peut être "latest", "preview", "nightly", un numéro de version spécifique, ou une branche git, un tag, ou un commit. Pour plus d'informations, consultez les [versions du CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).
- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Facultatif)* Active les journaux de débogage et le flux de sortie.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Facultatif)* Le modèle à utiliser avec Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Facultatif, défaut : `You are a helpful assistant.`)_ Une chaîne passée à l'argument [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) de l'interface en ligne de commande Qwen Code.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Facultatif)_ Une chaîne JSON écrite dans `.qwen/settings.json` pour configurer les paramètres de *projet* de l'interface en ligne de commande.
  Pour plus de détails, consultez la documentation sur les [fichiers de paramètres](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Facultatif, défaut : `false`)* Indique s'il faut utiliser Code Assist pour l'accès au modèle Qwen Code au lieu de la clé API Qwen Code par défaut.
  Pour plus d'informations, consultez la [documentation de l'interface en ligne de commande Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Facultatif, défaut : `false`)* Indique s'il faut utiliser Vertex AI pour l'accès au modèle Qwen Code au lieu de la clé API Qwen Code par défaut.
  Pour plus d'informations, consultez la [documentation de l'interface en ligne de commande Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Facultatif)_ Une liste d'extensions de l'interface en ligne de commande Qwen Code à installer.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Facultatif, défaut : `false`)* Indique s'il faut télécharger les artefacts vers l'action GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Facultatif, défaut : `false`)* Indique s'il faut utiliser pnpm plutôt que npm pour installer qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Facultatif, défaut : `${{ github.workflow }}`)* Le nom du workflow GitHub, utilisé à des fins de télémétrie.

<!-- END_AUTOGEN_INPUTS -->

### Sorties

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Le résultat résumé de l'exécution de l'interface en ligne de commande Qwen Code.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: La sortie d'erreur de l'exécution de l'interface en ligne de commande Qwen Code, le cas échéant.

<!-- END_AUTOGEN_OUTPUTS -->

### Variables de dépôt

Nous recommandons de définir les valeurs suivantes comme variables de dépôt afin qu'elles puissent être réutilisées dans tous les workflows. Vous pouvez également les définir en ligne comme entrées d'action dans des workflows individuels ou pour remplacer les valeurs au niveau du dépôt.

| Nom               | Description                                               | Type     | Requis | Quand requis                 |
| ----------------- | --------------------------------------------------------- | -------- | ------ | ---------------------------- |
| `DEBUG`           | Active la journalisation de débogage pour l'interface en ligne de commande Qwen Code. | Variable | Non    | Jamais                       |
| `QWEN_CLI_VERSION` | Contrôle la version de l'interface en ligne de commande Qwen Code qui est installée. | Variable | Non    | Pour épingler la version de l'interface |
| `APP_ID`          | ID de l'application GitHub pour l'authentification personnalisée. | Variable | Non    | En utilisant une application GitHub personnalisée |

Pour ajouter une variable de dépôt :

1. Accédez à **Paramètres > Secrets et variables > Actions > Nouvelle variable** de votre dépôt.
2. Saisissez le nom et la valeur de la variable.
3. Enregistrez.

Pour plus de détails sur les variables de dépôt, reportez-vous à la [documentation GitHub sur les variables][variables].

### Secrets

Vous pouvez définir les secrets suivants dans votre dépôt :

| Nom              | Description                                   | Requis | Quand requis                              |
| ---------------- | --------------------------------------------- | ------ | ----------------------------------------- |
| `QWEN_API_KEY`   | Votre clé API Qwen depuis DashScope.          | Oui    | Requis pour tous les workflows qui appellent Qwen. |
| `APP_PRIVATE_KEY`| Clé privée de votre application GitHub (format PEM). | Non    | En utilisant une application GitHub personnalisée. |

Pour ajouter un secret :

1. Accédez à **Paramètres > Secrets et variables > Actions > Nouveau secret de dépôt** de votre dépôt.
2. Saisissez le nom et la valeur du secret.
3. Enregistrez.

Pour plus d'informations, reportez-vous à la [documentation officielle GitHub sur la création et l'utilisation de secrets chiffrés][secrets].
## Authentification

Cette action nécessite une authentification auprès de l'API GitHub et optionnellement auprès des services Qwen Code.

### Authentification GitHub

Vous pouvez vous authentifier avec GitHub de deux manières :

1. **Jeton `GITHUB_TOKEN` par défaut :** Pour les cas d'utilisation simples, l'action peut utiliser le jeton `GITHUB_TOKEN` par défaut fourni par le workflow.
2. **Application GitHub personnalisée (recommandée) :** Pour une authentification la plus sécurisée et flexible possible, nous recommandons de créer une application GitHub personnalisée.

Pour des instructions détaillées de configuration pour l'authentification Qwen et GitHub, consultez la [**documentation d'authentification**](./configuration/auth).

## Extensions

Le Qwen Code CLI peut être étendu avec des fonctionnalités supplémentaires via des extensions. Ces extensions sont installées depuis leur code source via leurs dépôts GitHub.

Pour des instructions détaillées sur la configuration des extensions, consultez la [documentation des extensions](./extension/introduction.md).

## Bonnes pratiques

Pour garantir la sécurité, la fiabilité et l'efficacité de vos workflows automatisés, nous vous recommandons vivement de suivre nos bonnes pratiques. Ces directives couvrent des domaines clés tels que la sécurité du dépôt, la configuration des workflows et la supervision.

Les recommandations clés incluent :

- **Sécurisation de votre dépôt :** Mise en place de la protection des branches et des tags, et restriction des approbateurs de pull requests.
- **Supervision et audit :** Examen régulier des journaux d'action et activation d'OpenTelemetry pour une meilleure compréhension des performances et du comportement.

Pour un guide complet sur la sécurisation de votre dépôt et de vos workflows, veuillez consulter notre [**documentation des bonnes pratiques**](./common-workflow).

## Personnalisation

Créez un fichier QWEN.md à la racine de votre dépôt pour fournir un contexte et des instructions spécifiques au projet au [Qwen Code CLI](./common-workflow). Ceci est utile pour définir des conventions de codage, des modèles architecturaux ou d'autres directives que le modèle doit suivre pour un dépôt donné.

## Contribution

Les contributions sont les bienvenues ! Consultez le **Guide de contribution** du Qwen Code CLI pour plus de détails sur la façon de commencer.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context
