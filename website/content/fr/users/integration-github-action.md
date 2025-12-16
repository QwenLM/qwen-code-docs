# Github Actions : qwen-code-action

## Aperçu

`qwen-code-action` est une action GitHub qui intègre [Qwen Code] dans votre flux de développement via l’[interface en ligne de commande Qwen Code]. Elle agit à la fois comme un agent autonome pour les tâches de codage routinières critiques et comme un collaborateur à la demande auquel vous pouvez rapidement déléguer du travail.

Utilisez-la pour effectuer des revues de pull requests GitHub, trier les tickets, réaliser des analyses et modifications de code, et plus encore en utilisant [Qwen Code] de manière conversationnelle (par exemple, `@qwencoder fix this issue`) directement depuis vos dépôts GitHub.

- [qwen-code-action](#qwen-code-action)
  - [Aperçu](#aperçu)
  - [Fonctionnalités](#fonctionnalités)
  - [Démarrage rapide](#démarrage-rapide)
    - [1. Obtenir une clé d'API Qwen](#1-obtenir-une-clé-dapi-qwen)
    - [2. L'ajouter en tant que secret GitHub](#2-lajouter-en-tant-que-secret-github)
    - [3. Mettre à jour votre .gitignore](#3-mettre-à-jour-votre-gitignore)
    - [4. Choisir un workflow](#4-choisir-un-workflow)
    - [5. Faites un essai](#5-faites-un-essai)
  - [Workflows](#workflows)
    - [Qwen Code Dispatch](#qwen-code-dispatch)
    - [Triage des tickets](#triage-des-tickets)
    - [Revue de pull request](#revue-de-pull-request)
    - [Assistant Qwen Code CLI](#assistant-qwen-code-cli)
  - [Configuration](#configuration)
    - [Entrées](#entrées)
    - [Sorties](#sorties)
    - [Variables de dépôt](#variables-de-dépôt)
    - [Secrets](#secrets)
  - [Authentification](#authentification)
    - [Authentification GitHub](#authentification-github)
  - [Extensions](#extensions)
  - [Meilleures pratiques](#meilleures-pratiques)
  - [Personnalisation](#personnalisation)
  - [Contribution](#contribution)

## Fonctionnalités

- **Automatisation** : Déclenchez des workflows en fonction d'événements (par exemple, ouverture d'une issue) ou de planifications (par exemple, exécution nocturne).
- **Collaboration à la demande** : Déclenchez des workflows dans les commentaires d'issues et de pull requests en mentionnant le [Qwen Code CLI] (par exemple, `@qwencoder /review`).
- **Extensible avec des outils** : Exploitez les capacités d'appel d'outils des modèles [Qwen Code] pour interagir avec d'autres CLI comme le [GitHub CLI] (`gh`).
- **Personnalisable** : Utilisez un fichier `QWEN.md` dans votre dépôt pour fournir des instructions et un contexte spécifiques au projet au [Qwen Code CLI].

## Démarrage rapide

Commencez à utiliser Qwen Code CLI dans votre dépôt en quelques minutes seulement :

### 1. Obtenir une clé API Qwen

Récupérez votre clé API depuis [DashScope] (plateforme IA d'Alibaba Cloud)

### 2. Ajoutez-la en tant que secret GitHub

Stockez votre clé API en tant que secret nommé `QWEN_API_KEY` dans votre dépôt :

- Allez dans **Paramètres > Secrets et variables > Actions** de votre dépôt
- Cliquez sur **Nouveau secret de dépôt**
- Nom : `QWEN_API_KEY`, Valeur : votre clé API

### 3. Mettez à jour votre .gitignore

Ajoutez les entrées suivantes à votre fichier `.gitignore` :

```gitignore

# Paramètres de qwen-code-cli
.qwen/

# Identifiants de l'application GitHub
gha-creds-*.json
```

### 4. Choisissez un workflow

Vous avez deux options pour configurer un workflow :

**Option A : Utiliser la commande de configuration (Recommandé)**

1. Démarrez Qwen Code CLI dans votre terminal :

   ```shell
   qwen
   ```

2. Dans Qwen Code CLI dans votre terminal, tapez :

   ```
   /setup-github
   ```

**Option B : Copier manuellement les workflows**

1. Copiez les workflows pré-construits depuis le répertoire [`examples/workflows`](./examples/workflows) vers le répertoire `.github/workflows` de votre dépôt. Remarque : le workflow `qwen-dispatch.yml` doit également être copié, car il déclenche l'exécution des workflows.

### 5. Essayez-le

**Revue de Pull Request :**

- Ouvrez une pull request dans votre dépôt et attendez la revue automatique
- Commentez `@qwencoder /review` sur une pull request existante pour déclencher manuellement une revue

**Tri des Issues :**

- Ouvrez une issue et attendez le tri automatique
- Commentez `@qwencoder /triage` sur des issues existantes pour déclencher manuellement le tri

**Assistance IA Générale :**

- Dans n'importe quelle issue ou pull request, mentionnez `@qwencoder` suivi de votre demande
- Exemples :
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## Workflows

Cette action fournit plusieurs workflows pré-construits pour différents cas d'utilisation. Chaque workflow est conçu pour être copié dans le répertoire `.github/workflows` de votre dépôt et personnalisé selon vos besoins.

### Dispatch du Code Qwen

Ce workflow agit comme un répartiteur central pour l'interface en ligne de commande (CLI) de Qwen Code, acheminant les requêtes vers le workflow approprié en fonction de l'événement déclencheur et de la commande fournie dans le commentaire. Pour un guide détaillé sur la configuration du workflow de répartition, rendez-vous sur la [documentation du workflow de dispatch Qwen Code](./examples/workflows/qwen-dispatch).

### Tri des Tickets

Cette action peut être utilisée pour trier automatiquement les tickets GitHub ou selon une planification. Pour un guide détaillé sur la mise en place du système de tri des tickets, consultez la [documentation du workflow de tri des tickets GitHub](./examples/workflows/issue-triage).

### Revue de Pull Request

Cette action permet d'examiner automatiquement les pull requests lorsqu'elles sont ouvertes. Pour un guide détaillé sur la configuration du système de revue des pull requests, rendez-vous sur la [documentation du workflow de revue des PR GitHub](./examples/workflows/pr-review).

### Assistant CLI Qwen Code

Ce type d'action peut être utilisé pour invoquer un assistant IA Qwen Code
à usage général et conversationnel dans les pull requests et les issues afin d'effectuer un large éventail de
tâches. Pour un guide détaillé sur la configuration du workflow CLI Qwen Code à usage général,
rendez-vous sur la [documentation du workflow de l'assistant Qwen Code](./examples/workflows/qwen-assistant).

## Configuration

### Entrées

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a> : *(Optionnel)\_ La clé API pour l'API Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a> : *(Optionnel, par défaut : `latest`)\_ La version du CLI Qwen Code à installer. Peut être "latest", "preview", "nightly", un numéro de version spécifique, ou une branche, un tag ou un commit git. Pour plus d'informations, voir [les versions du CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a> : *(Optionnel)\_ Active la journalisation de débogage et le streaming de sortie.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a> : *(Optionnel)\_ Le modèle à utiliser avec Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a> : _(Optionnel, par défaut : `You are a helpful assistant.`)_ Une chaîne passée à l'argument [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) du CLI Qwen Code.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a> : _(Optionnel)_ Une chaîne JSON écrite dans `.qwen/settings.json` pour configurer les paramètres _du projet_ du CLI.
  Pour plus de détails, voir la documentation sur les [fichiers de configuration](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a> : *(Optionnel, par défaut : `false`)\_ Indique s'il faut utiliser Code Assist pour accéder au modèle Qwen Code au lieu de la clé API Qwen Code par défaut.
  Pour plus d'informations, voir la [documentation du CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a> : *(Optionnel, par défaut : `false`)\_ Indique s'il faut utiliser Vertex AI pour accéder au modèle Qwen Code au lieu de la clé API Qwen Code par défaut.
  Pour plus d'informations, voir la [documentation du CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a> : _(Optionnel)_ Une liste d'extensions du CLI Qwen Code à installer.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a> : *(Optionnel, par défaut : `false`)\_ Indique s'il faut télécharger les artefacts vers l'action GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a> : *(Optionnel, par défaut : `false`)\_ Indique s'il faut utiliser pnpm au lieu de npm pour installer qwen-code-cli.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a> : *(Optionnel, par défaut : `${{ github.workflow }}`)\_ Le nom du workflow GitHub, utilisé à des fins de télémétrie.

<!-- END_AUTOGEN_INPUTS -->

### Sorties

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a> : Le résumé de la sortie de l'exécution du CLI Qwen Code.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a> : La sortie d'erreur de l'exécution du CLI Qwen Code, le cas échéant.

<!-- END_AUTOGEN_OUTPUTS -->

### Variables de dépôt

Nous recommandons de définir les valeurs suivantes en tant que variables de dépôt afin qu'elles puissent être réutilisées dans tous les workflows. Vous pouvez également les définir en ligne en tant qu'entrées d'action dans des workflows individuels ou pour remplacer les valeurs au niveau du dépôt.

| Nom                | Description                                                | Type     | Requis | Quand requis                 |
| ------------------ | ---------------------------------------------------------- | -------- | ------ | ---------------------------- |
| `DEBUG`            | Active la journalisation de débogage pour le CLI Qwen Code. | Variable | Non    | Jamais                       |
| `QWEN_CLI_VERSION` | Contrôle quelle version du CLI Qwen Code est installée.    | Variable | Non    | Épingler la version du CLI   |
| `APP_ID`           | ID de l'application GitHub pour une authentification personnalisée. | Variable | Non    | Utilisation d'une application GitHub personnalisée |

Pour ajouter une variable de dépôt :

1. Allez dans **Paramètres > Secrets et variables > Actions > Nouvelle variable** de votre dépôt.
2. Entrez le nom et la valeur de la variable.
3. Enregistrez.

Pour plus de détails sur les variables de dépôt, consultez la [documentation GitHub sur les variables][variables].

### Secrets

Vous pouvez définir les secrets suivants dans votre dépôt :

| Nom               | Description                                      | Requis | Quand requis                                  |
| ----------------- | ------------------------------------------------ | ------ | --------------------------------------------- |
| `QWEN_API_KEY`    | Votre clé API Qwen depuis DashScope.              | Oui    | Requis pour tous les workflows appelant Qwen. |
| `APP_PRIVATE_KEY` | Clé privée de votre GitHub App (format PEM).      | Non    | Utilisation d'une GitHub App personnalisée.   |

Pour ajouter un secret :

1. Allez dans **Paramètres > Secrets et variables > Actions > Nouveau secret de dépôt** de votre dépôt.
2. Entrez le nom et la valeur du secret.
3. Enregistrez.

Pour plus d'informations, consultez la
[documentation officielle GitHub sur la création et l'utilisation des secrets chiffrés][secrets].

## Authentification

Cette action nécessite une authentification auprès de l'API GitHub et éventuellement auprès des services Qwen Code.

### Authentification GitHub

Vous pouvez vous authentifier auprès de GitHub de deux manières :

1. **`GITHUB_TOKEN` par défaut :** Pour des cas d'utilisation plus simples, l'action peut utiliser le
   `GITHUB_TOKEN` fourni par défaut par le workflow.
2. **Application GitHub personnalisée (Recommandé) :** Pour une authentification plus sécurisée et flexible,
   nous recommandons de créer une application GitHub personnalisée.

Pour des instructions détaillées sur la configuration de l'authentification pour Qwen et GitHub, rendez-vous dans la
[**documentation d'authentification**](./docs/authentication.md).

## Extensions

La CLI Qwen Code peut être étendue avec des fonctionnalités supplémentaires via des extensions.
Ces extensions sont installées depuis leur source dans leurs dépôts GitHub.

Pour des instructions détaillées sur la manière de configurer et d'utiliser les extensions, rendez-vous dans la
[documentation des extensions](./docs/extensions.md).

## Bonnes pratiques

Pour garantir la sécurité, la fiabilité et l'efficacité de vos flux de travail automatisés, nous vous recommandons fortement de suivre nos bonnes pratiques. Ces directives couvrent des domaines clés tels que la sécurité du dépôt, la configuration des flux de travail et la surveillance.

Les recommandations principales incluent :

- **Sécurisation de votre dépôt :** Mettre en place une protection des branches et des tags, et restreindre les approbateurs des pull requests.
- **Surveillance et audit :** Consulter régulièrement les journaux d’actions et activer OpenTelemetry pour obtenir des informations plus détaillées sur les performances et le comportement.

Pour un guide complet sur la sécurisation de votre dépôt et de vos flux de travail, veuillez consulter notre [**documentation sur les bonnes pratiques**](./docs/best-practices.md).

## Personnalisation

Créez un fichier [QWEN.md] à la racine de votre dépôt afin de fournir
un contexte et des instructions spécifiques au projet pour [Qwen Code CLI]. Cela est utile pour définir
les conventions de codage, les modèles architecturaux ou d'autres directives que le modèle doit
suivre pour un dépôt donné.

## Contribution

Les contributions sont les bienvenues ! Consultez le [**Guide de contribution**](./CONTRIBUTING.md) de Qwen Code CLI pour plus de détails sur la façon de commencer.

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context