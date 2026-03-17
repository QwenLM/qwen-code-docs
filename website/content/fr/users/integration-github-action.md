# GitHub Actions : qwen-code-action

## Aperçu

`qwen-code-action` est une action GitHub qui intègre [Qwen Code] à votre flux de développement via la [CLI Qwen Code]. Elle agit à la fois comme un agent autonome pour les tâches de codage courantes critiques et comme un collaborateur à la demande auquel vous pouvez rapidement déléguer des travaux.

Utilisez-la pour effectuer des revues de demandes d’incorporation (pull requests) GitHub, trier les problèmes (issues), analyser et modifier du code, et bien plus encore, en interagissant avec [Qwen Code] de manière conversationnelle (par exemple, `@qwencoder corrige ce problème`) directement depuis vos dépôts GitHub.

## Fonctionnalités

- **Automatisation** : Déclenchez des workflows en fonction d’événements (par exemple, ouverture d’un problème) ou de planifications (par exemple, exécution nocturne).
- **Collaboration à la demande** : Déclenchez des workflows directement depuis les commentaires associés à un problème ou à une *pull request* en mentionnant la [CLI Qwen Code](./features/commands) (par exemple, `@qwencoder /review`).
- **Extensibilité via des outils** : Profitez des capacités d’appel d’outils des modèles [Qwen Code](../developers/tools/introduction.md) pour interagir avec d’autres interfaces en ligne de commande, comme la [CLI GitHub] (`gh`).
- **Personnalisable** : Utilisez un fichier `QWEN.md` dans votre dépôt pour fournir des instructions et un contexte spécifiques au projet à la [CLI Qwen Code](./features/commands).

## Démarrage rapide

Commencez à utiliser la CLI Qwen Code dans votre dépôt en quelques minutes seulement :

### 1. Obtenez une clé API Qwen

Récupérez votre clé API sur [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) (la plateforme IA d’Alibaba Cloud)

### 2. Ajoutez-la comme secret GitHub

Stockez votre clé API sous forme de secret nommé `QWEN_API_KEY` dans votre dépôt :

- Accédez aux **Paramètres > Secrets et variables > Actions** de votre dépôt.
- Cliquez sur **Nouveau secret de dépôt**.
- Nom : `QWEN_API_KEY`, Valeur : votre clé API.

### 3. Mettez à jour votre fichier `.gitignore`

Ajoutez les entrées suivantes à votre fichier `.gitignore` :

```gitignore

# Paramètres de qwen-code-cli
.qwen/

# Identifiants de l’application GitHub
gha-creds-*.json
```

### 4. Choisissez un workflow

Vous avez deux options pour configurer un workflow :

**Option A : Utilisez la commande de configuration (recommandée)**

1. Lancez l’interface CLI Qwen Code dans votre terminal :

   ```shell
   qwen
   ```

2. Dans l’interface CLI Qwen Code, saisissez :

   ```
   /setup-github
   ```

**Option B : Copiez manuellement les workflows**

1. Copiez les workflows préconfigurés depuis le répertoire [`examples/workflows`](./common-workflow) vers le répertoire `.github/workflows` de votre dépôt. Remarque : le workflow `qwen-dispatch.yml` doit également être copié, car il déclenche l’exécution des autres workflows.

### 5. Essayez-le

**Examen des demandes de tirage (pull requests) :**

- Ouvrez une demande de tirage dans votre dépôt et attendez l’examen automatique  
- Commentez `@qwencoder /review` sur une demande de tirage existante pour déclencher manuellement un examen  

**Tri des problèmes (issues) :**

- Ouvrez un problème et attendez le tri automatique  
- Commentez `@qwencoder /triage` sur des problèmes existants pour déclencher manuellement le tri  

**Assistance générale par IA :**

- Dans n’importe quel problème ou demande de tirage, mentionnez `@qwencoder`, suivi de votre demande  
- Exemples :  
  - `@qwencoder expliquez cette modification de code`  
  - `@qwencoder suggérez des améliorations pour cette fonction`  
  - `@qwencoder aidez-moi à déboguer cette erreur`  
  - `@qwencoder écrivez des tests unitaires pour ce composant`  

## Flux de travail

Cette action fournit plusieurs flux de travail prédéfinis adaptés à divers cas d’usage. Chaque flux de travail est conçu pour être copié dans le répertoire `.github/workflows` de votre dépôt et personnalisé selon vos besoins.

### Dispatcheur Qwen Code

Ce workflow agit comme un dispatcheur central pour l’interface en ligne de commande (CLI) Qwen Code, acheminant les requêtes vers le workflow approprié en fonction de l’événement déclencheur et de la commande fournie dans le commentaire. Pour un guide détaillé sur la configuration du workflow de dispatch, consultez la [documentation du workflow Qwen Code Dispatch](./common-workflow).

### Tri des problèmes (Issues)

Cette action permet de trier automatiquement les problèmes GitHub, soit à la demande, soit selon une planification régulière. Pour un guide détaillé sur la configuration du système de tri des problèmes, consultez la [documentation du workflow de tri des problèmes GitHub](./examples/workflows/issue-triage).

### Revue des demandes d’intégration (Pull Requests)

Cette action permet de passer automatiquement en revue les demandes d’intégration dès qu’elles sont ouvertes. Pour un guide détaillé sur la configuration du système de revue des demandes d’intégration, consultez la [documentation du workflow de revue des PR GitHub](./common-workflow).

### Assistant CLI Qwen Code

Ce type d’action permet d’invoquer, au sein des *pull requests* et des *issues*, un assistant conversationnel Qwen Code polyvalent, capable d’accomplir une grande variété de tâches. Pour un guide détaillé sur la configuration du flux de travail généraliste Qwen Code CLI, consultez la [documentation du flux de travail de l’assistant Qwen Code](./common-workflow).

## Configuration

### Entrées

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a> : *(Facultatif)* Clé API pour l’API Qwen.

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a> : *(Facultatif, valeur par défaut : `latest`)* Version de l’interface en ligne de commande (CLI) Qwen Code à installer. Peut valoir `latest`, `preview`, `nightly`, un numéro de version spécifique, ou encore une branche Git, une étiquette (tag) ou un commit. Pour plus d’informations, consultez les [versions publiées de la CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md).

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a> : *(Facultatif)* Active les journaux de débogage et le flux de sortie.

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a> : *(Facultatif)* Modèle à utiliser avec Qwen Code.

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a> : *(Facultatif, valeur par défaut : `You are a helpful assistant.`)* Chaîne de caractères transmise à l’argument [`--prompt`](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) de la CLI Qwen Code.

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a> : *(Facultatif)* Chaîne JSON écrite dans le fichier `.qwen/settings.json` afin de configurer les paramètres _projet_ de la CLI.  
  Pour plus de détails, consultez la documentation relative aux [fichiers de paramètres](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files).

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a> : *(Facultatif, valeur par défaut : `false`)* Indique si l’assistance codée (Code Assist) doit être utilisée pour accéder au modèle Qwen Code, plutôt que la clé API Qwen Code par défaut.  
  Pour plus d’informations, consultez la [documentation de la CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a> : *(Facultatif, valeur par défaut : `false`)* Indique si Vertex AI doit être utilisé pour accéder au modèle Qwen Code, plutôt que la clé API Qwen Code par défaut.  
  Pour plus d’informations, consultez la [documentation de la CLI Qwen Code](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md).

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a> : *(Facultatif)* Liste des extensions de la CLI Qwen Code à installer.

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a> : *(Facultatif, valeur par défaut : `false`)* Indique si les artefacts doivent être transférés vers l’action GitHub.

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a> : *(Facultatif, valeur par défaut : `false`)* Indique si pnpm doit être utilisé à la place de npm pour installer `qwen-code-cli`.

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a> : *(Facultatif, valeur par défaut : `${{ github.workflow }}`)* Nom du workflow GitHub, utilisé à des fins de télémétrie.

<!-- END_AUTOGEN_INPUTS -->

### Sorties

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a> : Résultat résumé de l’exécution de l’interface CLI Qwen Code.

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a> : Sortie d’erreur de l’exécution de l’interface CLI Qwen Code, le cas échéant.

<!-- END_AUTOGEN_OUTPUTS -->

### Variables du référentiel

Nous vous recommandons de définir les valeurs suivantes comme variables du référentiel afin qu’elles puissent être réutilisées dans tous les workflows. Vous pouvez également les définir en ligne comme entrées d’action dans des workflows individuels, ou pour remplacer les valeurs définies au niveau du référentiel.

| Nom                | Description                                               | Type     | Requis   | Quand elles sont requises |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | Active la journalisation détaillée pour l’interface CLI Qwen Code. | Variable | Non      | Jamais                    |
| `QWEN_CLI_VERSION` | Contrôle la version de l’interface CLI Qwen Code à installer. | Variable | Non      | Pour figer la version de l’interface CLI |
| `APP_ID`           | ID de l’application GitHub utilisée pour une authentification personnalisée. | Variable | Non      | Lors de l’utilisation d’une application GitHub personnalisée |

Pour ajouter une variable de référentiel :

1. Accédez aux **Paramètres > Secrets et variables > Actions > Nouvelle variable** de votre référentiel.
2. Saisissez le nom et la valeur de la variable.
3. Enregistrez.

Pour plus de détails sur les variables de référentiel, consultez la [documentation GitHub relative aux variables][variables].

### Secrets

Vous pouvez définir les secrets suivants dans votre référentiel :

| Nom               | Description                                              | Obligatoire | Quand il est requis                              |
| ----------------- | -------------------------------------------------------- | ----------- | ------------------------------------------------ |
| `QWEN_API_KEY`    | Votre clé API Qwen provenant de DashScope.               | Oui         | Obligatoire pour tous les workflows appelant Qwen. |
| `APP_PRIVATE_KEY` | Clé privée de votre application GitHub (format PEM).     | Non         | Lorsque vous utilisez une application GitHub personnalisée. |

Pour ajouter un secret :

1. Accédez aux **Paramètres > Secrets et variables > Actions > Nouveau secret de référentiel** de votre référentiel.
2. Saisissez le nom et la valeur du secret.
3. Enregistrez.

Pour plus d’informations, consultez la [documentation officielle GitHub sur la création et l’utilisation de secrets chiffrés][secrets].

## Authentification

Cette action nécessite une authentification auprès de l’API GitHub et, facultativement, auprès des services Qwen Code.

### Authentification GitHub

Vous pouvez vous authentifier sur GitHub de deux manières :

1. **`GITHUB_TOKEN` par défaut :** Pour les cas d’utilisation plus simples, l’action peut utiliser le `GITHUB_TOKEN` par défaut fourni par le workflow.
2. **Application GitHub personnalisée (recommandée) :** Pour une authentification plus sécurisée et flexible, nous recommandons de créer une application GitHub personnalisée.

Pour obtenir des instructions détaillées sur la configuration de l’authentification pour Qwen et GitHub, consultez la [**documentation sur l’authentification**](./configuration/auth).

## Extensions

L’interface CLI Qwen Code peut être étendue avec des fonctionnalités supplémentaires via des extensions.  
Ces extensions sont installées à partir de leur code source, hébergé sur leurs dépôts GitHub.

Pour obtenir des instructions détaillées sur la configuration et l’installation des extensions, consultez la [documentation sur les extensions](../developers/extensions/extension).

## Bonnes pratiques

Pour garantir la sécurité, la fiabilité et l’efficacité de vos workflows automatisés, nous vous recommandons vivement de suivre nos bonnes pratiques. Ces lignes directrices couvrent des domaines clés tels que la sécurité du référentiel, la configuration des workflows et la supervision.

Les recommandations principales sont les suivantes :

- **Sécurisation de votre référentiel** : mise en œuvre de la protection des branches et des étiquettes, ainsi que restriction des personnes autorisées à approuver les demandes d’intégration.
- **Supervision et audit** : examen régulier des journaux des actions et activation d’OpenTelemetry pour obtenir des informations plus approfondies sur les performances et le comportement.

Pour un guide complet sur la sécurisation de votre référentiel et de vos workflows, veuillez consulter notre [**documentation sur les bonnes pratiques**](./common-workflow).

## Personnalisation

Créez un fichier QWEN.md à la racine de votre référentiel afin de fournir un contexte et des instructions spécifiques au projet pour le [CLI Qwen Code](./common-workflow). Cela s’avère utile pour définir les conventions de codage, les modèles architecturaux ou toute autre directive que le modèle doit suivre pour un référentiel donné.

## Contribution

Les contributions sont les bienvenues ! Consultez le **Guide de contribution** de l’interface en ligne de commande Qwen Code pour plus de détails sur la manière de commencer.

[secrets]: https://docs.github.com/fr/actions/security-guides/using-secrets-in-github-actions  
[Qwen Code]: https://github.com/QwenLM/qwen-code  
[DashScope]: https://dashscope.console.aliyun.com/apiKey  
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/  
[variables]: https://docs.github.com/fr/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository  
[GitHub CLI]: https://docs.github.com/fr/github-cli/github-cli  
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context