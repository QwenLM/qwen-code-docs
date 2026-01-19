# Configuration de Qwen Code

> [!tip]
>
> **Authentification / Clés API :** L'authentification (Qwen OAuth vs API compatible OpenAI) et les variables d'environnement liées à l'authentification (comme `OPENAI_API_KEY`) sont documentées dans **[Authentification](../configuration/auth)**.

> [!note]
>
> **Remarque sur le nouveau format de configuration** : Le format du fichier `settings.json` a été mis à jour vers une nouvelle structure plus organisée. L'ancien format sera migré automatiquement.
> Qwen Code propose plusieurs façons de configurer son comportement, notamment par des variables d'environnement, des arguments en ligne de commande et des fichiers de paramètres. Ce document présente les différentes méthodes de configuration et les paramètres disponibles.

## Couches de configuration

La configuration est appliquée selon l'ordre de priorité suivant (les numéros inférieurs sont remplacés par les numéros supérieurs) :

| Niveau | Source de configuration | Description |
|--------|-------------------------|-------------|
| 1 | Valeurs par défaut | Valeurs par défaut codées en dur dans l'application |
| 2 | Fichier des paramètres système par défaut | Paramètres par défaut au niveau du système pouvant être remplacés par d'autres fichiers de paramètres |
| 3 | Fichier des paramètres utilisateur | Paramètres globaux pour l'utilisateur actuel |
| 4 | Fichier des paramètres du projet | Paramètres spécifiques au projet |
| 5 | Fichier des paramètres système | Paramètres au niveau du système remplaçant tous les autres fichiers de paramètres |
| 6 | Variables d'environnement | Variables au niveau du système ou spécifiques à la session, pouvant être chargées depuis des fichiers `.env` |
| 7 | Arguments de ligne de commande | Valeurs transmises lors du lancement de l'interface en ligne de commande |

## Fichiers de paramètres

Qwen Code utilise des fichiers de paramètres JSON pour la configuration persistante. Il existe quatre emplacements pour ces fichiers :

| Type de fichier         | Emplacement                                                                                                                                                                                                                                                                     | Portée                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fichier des valeurs par défaut du système | Linux : `/etc/qwen-code/system-defaults.json`<br>Windows : `C:\ProgramData\qwen-code\system-defaults.json`<br>macOS : `/Library/Application Support/QwenCode/system-defaults.json` <br>Le chemin peut être remplacé à l'aide de la variable d'environnement `QWEN_CODE_SYSTEM_DEFAULTS_PATH`. | Fournit une couche de base de paramètres par défaut au niveau du système. Ces paramètres ont la priorité la plus faible et sont destinés à être remplacés par les paramètres utilisateur, projet ou système.                 |
| Fichier des paramètres utilisateur | `~/.qwen/settings.json` (où `~` est votre répertoire personnel).                                                                                                                                                                                                                 | S'applique à toutes les sessions Qwen Code pour l'utilisateur actuel.                                                                                                                                                     |
| Fichier des paramètres de projet | `.qwen/settings.json` dans le répertoire racine de votre projet.                                                                                                                                                                                                                 | S'applique uniquement lors de l'exécution de Qwen Code depuis ce projet spécifique. Les paramètres du projet remplacent les paramètres utilisateur.                                                                         |
| Fichier des paramètres système | Linux : `/etc/qwen-code/settings.json` <br>Windows : `C:\ProgramData\qwen-code\settings.json` <br>macOS : `/Library/Application Support/QwenCode/settings.json`<br>Le chemin peut être remplacé à l'aide de la variable d'environnement `QWEN_CODE_SYSTEM_SETTINGS_PATH`.                   | S'applique à toutes les sessions Qwen Code sur le système, pour tous les utilisateurs. Les paramètres système remplacent les paramètres utilisateur et projet. Peut être utile pour les administrateurs système en entreprise afin de contrôler les configurations Qwen Code des utilisateurs. |

> [!note]
>
> **Remarque sur les variables d'environnement dans les paramètres :** Les valeurs chaîne dans vos fichiers `settings.json` peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`. Ces variables seront automatiquement résolues lorsque les paramètres seront chargés. Par exemple, si vous avez une variable d'environnement `MY_API_TOKEN`, vous pouvez l'utiliser dans `settings.json` comme ceci : `"apiKey": "$MY_API_TOKEN"`.

### Le répertoire `.qwen` dans votre projet

En plus d'un fichier de configuration du projet, le répertoire `.qwen` d'un projet peut contenir d'autres fichiers spécifiques au projet liés au fonctionnement de Qwen Code, tels que :

- [Profils de sandbox personnalisés](../features/sandbox) (par exemple `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).
- [Compétences d'agent](../features/skills) (expérimental) situées sous `.qwen/skills/` (chaque compétence est un répertoire contenant un fichier `SKILL.md`).

### Paramètres disponibles dans `settings.json`

Les paramètres sont organisés en catégories. Tous les paramètres doivent être placés dans l'objet de catégorie de premier niveau correspondant dans votre fichier `settings.json`.

#### général

| Paramètre                       | Type    | Description                                                                                               | Valeur par défaut |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- | ----------------- |
| `general.preferredEditor`       | string  | L'éditeur préféré pour ouvrir les fichiers.                                                               | `undefined`       |
| `general.vimMode`               | boolean | Activer les raccourcis clavier Vim.                                                                       | `false`           |
| `general.disableAutoUpdate`     | boolean | Désactiver les mises à jour automatiques.                                                                 | `false`           |
| `general.disableUpdateNag`      | boolean | Désactiver les notifications de mise à jour.                                                              | `false`           |
| `general.gitCoAuthor`           | boolean | Ajouter automatiquement un en-tête « Co-authored-by » aux messages de commit Git lorsque ceux-ci sont effectués via Qwen Code. | `true`            |
| `general.checkpointing.enabled` | boolean | Activer la sauvegarde ponctuelle des sessions pour la reprise.                                            | `false`           |

#### output

| Paramètre       | Type   | Description                        | Valeur par défaut | Valeurs possibles    |
| --------------- | ------ | ---------------------------------- | ----------------- | -------------------- |
| `output.format` | string | Le format de la sortie CLI.        | `"text"`          | `"text"`, `"json"`   |

#### ui

| Paramètre                                | Type             | Description                                                                                                                                                                                                                                                                                                                                                                                                         | Valeur par défaut |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `ui.theme`                               | chaîne de caractères | Le thème de couleurs pour l'interface utilisateur. Voir [Thèmes](../configuration/themes) pour les options disponibles.                                                                                                                                                                                                                                                                                             | `undefined`       |
| `ui.customThemes`                        | objet            | Définitions de thèmes personnalisés.                                                                                                                                                                                                                                                                                                                                                                                | `{}`              |
| `ui.hideWindowTitle`                     | booléen          | Masquer la barre de titre de la fenêtre.                                                                                                                                                                                                                                                                                                                                                                            | `false`           |
| `ui.hideTips`                            | booléen          | Masquer les astuces utiles dans l'interface utilisateur.                                                                                                                                                                                                                                                                                                                                                            | `false`           |
| `ui.hideBanner`                          | booléen          | Masquer la bannière de l'application.                                                                                                                                                                                                                                                                                                                                                                               | `false`           |
| `ui.hideFooter`                          | booléen          | Masquer le pied de page de l'interface utilisateur.                                                                                                                                                                                                                                                                                                                                                                 | `false`           |
| `ui.showMemoryUsage`                     | booléen          | Afficher les informations d'utilisation de la mémoire dans l'interface utilisateur.                                                                                                                                                                                                                                                                                                                                 | `false`           |
| `ui.showLineNumbers`                     | booléen          | Afficher les numéros de ligne dans les blocs de code dans la sortie du CLI.                                                                                                                                                                                                                                                                                                                                        | `true`            |
| `ui.showCitations`                       | booléen          | Afficher les citations pour le texte généré dans le chat.                                                                                                                                                                                                                                                                                                                                                           | `true`            |
| `enableWelcomeBack`                      | booléen          | Afficher une boîte de dialogue de bienvenue lors du retour à un projet avec un historique de conversation. Lorsque cette option est activée, Qwen Code détectera automatiquement si vous revenez à un projet avec un résumé de projet précédemment généré (`.qwen/PROJECT_SUMMARY.md`) et affichera une boîte de dialogue vous permettant de poursuivre votre conversation précédente ou d'en commencer une nouvelle. Cette fonctionnalité s'intègre à la commande `/summary` et à la boîte de dialogue de confirmation de fermeture. | `true`            |
| `ui.accessibility.disableLoadingPhrases` | booléen          | Désactiver les phrases de chargement pour l'accessibilité.                                                                                                                                                                                                                                                                                                                                                          | `false`           |
| `ui.accessibility.screenReader`          | booléen          | Active le mode lecteur d'écran, qui ajuste l'interface utilisateur textuelle (TUI) pour une meilleure compatibilité avec les lecteurs d'écran.                                                                                                                                                                                                                                                                      | `false`           |
| `ui.customWittyPhrases`                  | tableau de chaînes | Une liste de phrases personnalisées à afficher pendant les états de chargement. Lorsqu'elle est fournie, le CLI parcourra ces phrases au lieu des phrases par défaut.                                                                                                                                                                                                                                              | `[]`              |

#### ide

| Paramètre          | Type    | Description                                          | Valeur par défaut |
| ------------------ | ------- | ---------------------------------------------------- | ----------------- |
| `ide.enabled`      | boolean | Activer le mode d'intégration IDE.                   | `false`           |
| `ide.hasSeenNudge` | boolean | L'utilisateur a-t-il vu la suggestion d'intégration IDE. | `false`           |

#### confidentialité

| Paramètre                        | Type    | Description                              | Valeur par défaut |
| -------------------------------- | ------- | ---------------------------------------- | ----------------- |
| `privacy.usageStatisticsEnabled` | boolean | Activer la collecte des statistiques d'utilisation. | `true`            |

#### modèle

| Paramètre                                          | Type    | Description                                                                                                                                                                                                                                                                                                                                                            | Valeur par défaut |
| -------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `model.name`                                       | chaîne  | Le modèle Qwen à utiliser pour les conversations.                                                                                                                                                                                                                                                                                                                      | `undefined`       |
| `model.maxSessionTurns`                            | nombre  | Nombre maximum de tours utilisateur/modèle/outil à conserver dans une session. -1 signifie illimité.                                                                                                                                                                                                                                                                   | `-1`              |
| `model.summarizeToolOutput`                        | objet   | Active ou désactive la synthèse des sorties d'outils. Vous pouvez spécifier le budget en jetons pour la synthèse à l'aide du paramètre `tokenBudget`. Remarque : Actuellement, seul l'outil `run_shell_command` est pris en charge. Par exemple `{"run_shell_command": {"tokenBudget": 2000}}`                                                                 | `undefined`       |
| `model.generationConfig`                           | objet   | Remplacements avancés transmis au générateur de contenu sous-jacent. Prend en charge les contrôles de requête tels que `timeout`, `maxRetries`, `disableCacheControl` et `customHeaders` (en-têtes HTTP personnalisés pour les requêtes API), ainsi que les réglages fins sous `samplingParams` (par exemple `temperature`, `top_p`, `max_tokens`). Laisser non défini pour utiliser les valeurs par défaut du fournisseur. | `undefined`       |
| `model.chatCompression.contextPercentageThreshold` | nombre  | Définit le seuil de compression de l'historique des discussions en pourcentage de la limite totale de jetons du modèle. Il s'agit d'une valeur comprise entre 0 et 1 qui s'applique à la fois à la compression automatique et à la commande manuelle `/compress`. Par exemple, une valeur de `0.6` déclenchera la compression lorsque l'historique dépasse 60 % de la limite de jetons. Utilisez `0` pour désactiver entièrement la compression. | `0.7`             |
| `model.skipNextSpeakerCheck`                       | booléen | Ignorer la vérification du prochain intervenant.                                                                                                                                                                                                                                                                                                                       | `false`           |
| `model.skipLoopDetection`                          | booléen | Désactive les vérifications de détection de boucles. La détection de boucles empêche les boucles infinies dans les réponses IA mais peut générer des faux positifs interrompant des flux de travail légitimes. Activez cette option si vous rencontrez fréquemment des interruptions de détection de boucles fausses.                                                                 | `false`           |
| `model.skipStartupContext`                         | booléen | Ignore l'envoi du contexte initial de l'espace de travail (résumé de l'environnement et confirmation) au début de chaque session. Activez cette option si vous préférez fournir le contexte manuellement ou si vous souhaitez économiser des jetons au démarrage.                                                                                                    | `false`           |
| `model.enableOpenAILogging`                        | booléen | Active la journalisation des appels API OpenAI pour le débogage et l'analyse. Lorsque cette option est activée, les requêtes et réponses API sont enregistrées dans des fichiers JSON.                                                                                                                                                                               | `false`           |
| `model.openAILoggingDir`                           | chaîne  | Chemin personnalisé vers le répertoire des journaux OpenAI. Si non spécifié, la valeur par défaut est `logs/openai` dans le répertoire de travail actuel. Prend en charge les chemins absolus, relatifs (résolus depuis le répertoire de travail actuel) et l'expansion `~` (répertoire personnel).                                                                    | `undefined`       |

**Exemple model.generationConfig :**

```json
{
  "model": {
    "generationConfig": {
      "timeout": 60000,
      "disableCacheControl": false,
      "customHeaders": {
        "X-Request-ID": "req-123",
        "X-User-ID": "user-456"
      },
      "samplingParams": {
        "temperature": 0.2,
        "top_p": 0.8,
        "max_tokens": 1024
      }
    }
  }
}
```

Le champ `customHeaders` vous permet d'ajouter des en-têtes HTTP personnalisés à toutes les requêtes API. Cela est utile pour le suivi des requêtes, la surveillance, le routage via une passerelle API ou lorsque différents modèles nécessitent des en-têtes distincts. Si `customHeaders` est défini dans `modelProviders[].generationConfig.customHeaders`, il sera utilisé directement ; sinon, les en-têtes de `model.generationConfig.customHeaders` seront utilisés. Aucune fusion n'est effectuée entre les deux niveaux.

**Exemples model.openAILoggingDir :**

- `"~/qwen-logs"` - Journalise dans le répertoire `~/qwen-logs`
- `"./custom-logs"` - Journalise dans `./custom-logs` relatif au répertoire courant
- `"/tmp/openai-logs"` - Journalise dans le chemin absolu `/tmp/openai-logs`

#### modelProviders

Utilisez `modelProviders` pour déclarer des listes de modèles organisées par type d'authentification entre lesquelles le sélecteur `/model` peut basculer. Les clés doivent être des types d'authentification valides (`openai`, `anthropic`, `gemini`, `vertex-ai`, etc.). Chaque entrée nécessite un `id` et **doit inclure `envKey`**, avec des champs optionnels `name`, `description`, `baseUrl` et `generationConfig`. Les identifiants ne sont jamais persistés dans les paramètres ; le runtime les lit depuis `process.env[envKey]`. Les modèles OAuth Qwen restent codés en dur et ne peuvent pas être remplacés.

##### Exemple

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "customHeaders": {
            "X-Model-Version": "v1.0",
            "X-Request-Priority": "high"
          },
          "samplingParams": { "temperature": 0.2 }
        }
      }
    ],
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com"
      }
    ],
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com"
      }
    ]
  }
}
```

> [!note]
> Seule la commande `/model` expose les types d'authentification non par défaut. Anthropic, Gemini, Vertex AI, etc., doivent être définis via `modelProviders`. La commande `/auth` liste intentionnellement uniquement les flux OAuth intégrés de Qwen et OpenAI.

##### Couches de résolution et atomicité

Les valeurs effectives d'authentification/modèle/identifiants sont choisies par champ en utilisant la précédence suivante (la première présente l'emporte). Vous pouvez combiner `--auth-type` avec `--model` pour pointer directement vers une entrée de fournisseur ; ces indicateurs CLI s'exécutent avant les autres couches.

| Couche (du plus élevé au plus bas) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| ---------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Substitutions programmatiques      | `/auth `                            | `/auth` input                                   | `/auth` input                                       | `/auth` input                                        | —                      | —                                 |
| Sélection du fournisseur de modèle | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| Arguments CLI                      | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (ou équivalents spécifiques au fournisseur) | `--openaiBaseUrl` (ou équivalents spécifiques au fournisseur) | —                      | —                                 |
| Variables d'environnement          | —                                   | Mappage spécifique au fournisseur (ex. `OPENAI_MODEL`) | Mappage spécifique au fournisseur (ex. `OPENAI_API_KEY`) | Mappage spécifique au fournisseur (ex. `OPENAI_BASE_URL`) | —                      | —                                 |
| Paramètres (`settings.json`)       | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Défaut / calculé                   | Retour à `AuthType.QWEN_OAUTH`      | Valeur par défaut intégrée (OpenAI ⇒ `qwen3-coder-plus`) | —                                                   | —                                                    | —                      | `Config.getProxy()` si configuré |

\*Lorsqu'ils sont présents, les indicateurs d'authentification CLI remplacent les paramètres. Sinon, `security.auth.selectedType` ou la valeur par défaut implicite déterminent le type d'authentification. Qwen OAuth et OpenAI sont les seuls types d'authentification exposés sans configuration supplémentaire.

Les valeurs provenant du fournisseur de modèles sont appliquées de manière atomique : une fois qu'un modèle de fournisseur est actif, chaque champ qu'il définit est protégé contre les couches inférieures jusqu'à ce que vous effaciez manuellement les identifiants via `/auth`. Le `generationConfig` final est la projection à travers toutes les couches—les couches inférieures ne remplissent que les lacunes laissées par les couches supérieures, et la couche fournisseur reste imperméable.

La stratégie de fusion pour `modelProviders` est REMPLACER : l'intégralité de `modelProviders` provenant des paramètres du projet remplacera la section correspondante dans les paramètres utilisateur, plutôt que de fusionner les deux.

##### Hiérarchie de la configuration de génération

Ordre de priorité par champ pour `generationConfig` :

1. Remplacements programmatiques (par exemple modifications d'exécution `/model`, `/auth`)
2. `modelProviders[authType][].generationConfig`
3. `settings.model.generationConfig`
4. Valeurs par défaut du générateur de contenu (`getDefaultGenerationConfig` pour OpenAI, `getParameterValue` pour Gemini, etc.)

`samplingParams` et `customHeaders` sont tous deux traités de manière atomique ; les valeurs du fournisseur remplacent l'objet entier. Si `modelProviders[].generationConfig` définit ces champs, ils sont utilisés directement ; sinon, les valeurs de `model.generationConfig` sont utilisées. Aucune fusion ne se produit entre les niveaux de configuration du fournisseur et global. Les valeurs par défaut du générateur de contenu s'appliquent en dernier afin que chaque fournisseur conserve sa base optimisée.

##### Persistance de la sélection et recommandations

> [!important]
> Définissez `modelProviders` dans la portée utilisateur `~/.qwen/settings.json` chaque fois que possible et évitez de persister les substitutions d'identifiants dans n'importe quelle portée. Conserver le catalogue de fournisseurs dans les paramètres utilisateur empêche les conflits de fusion/remplacement entre les portées projet et utilisateur, et garantit que les mises à jour `/auth` et `/model` s'écrivent toujours dans une portée cohérente.

- `/model` et `/auth` persistent `model.name` (lorsque applicable) et `security.auth.selectedType` dans la portée inscriptible la plus proche qui définit déjà `modelProviders` ; sinon, ils reviennent à la portée utilisateur. Cela maintient la synchronisation des fichiers espace de travail/utilisateur avec le catalogue de fournisseurs actif.
- Sans `modelProviders`, le résolveur mélange les couches CLI/env/settings, ce qui convient aux configurations mono-fournisseur mais devient fastidieux lors de changements fréquents. Définissez des catalogues de fournisseurs chaque fois que les flux de travail multi-modèles sont courants afin que les changements restent atomiques, correctement attribués et débogables.

#### context

| Paramètre                                         | Type                       | Description                                                                                                                                                                                                                                                                                                                                                           | Valeur par défaut |
| ------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `context.fileName`                                | chaîne ou tableau de chaînes | Le nom du ou des fichiers de contexte.                                                                                                                                                                                                                                                                                                                                | `undefined`       |
| `context.importFormat`                            | chaîne                     | Le format à utiliser lors de l'importation de la mémoire.                                                                                                                                                                                                                                                                                                             | `undefined`       |
| `context.discoveryMaxDirs`                        | nombre                     | Nombre maximal de répertoires à parcourir pour rechercher la mémoire.                                                                                                                                                                                                                                                                                                 | `200`             |
| `context.includeDirectories`                      | tableau                    | Répertoires supplémentaires à inclure dans le contexte de l'espace de travail. Spécifie un tableau de chemins absolus ou relatifs supplémentaires à inclure dans le contexte de l'espace de travail. Les répertoires manquants seront ignorés avec un avertissement par défaut. Les chemins peuvent utiliser `~` pour désigner le répertoire personnel de l'utilisateur. Ce paramètre peut être combiné avec l'option de ligne de commande `--include-directories`. | `[]`              |
| `context.loadFromIncludeDirectories`              | booléen                    | Contrôle le comportement de la commande `/memory refresh`. Si défini à `true`, les fichiers `QWEN.md` doivent être chargés depuis tous les répertoires ajoutés. Si défini à `false`, les fichiers `QWEN.md` ne doivent être chargés que depuis le répertoire actuel.                                                                                                    | `false`           |
| `context.fileFiltering.respectGitIgnore`          | booléen                    | Respecter les fichiers .gitignore lors de la recherche.                                                                                                                                                                                                                                                                                                               | `true`            |
| `context.fileFiltering.respectQwenIgnore`         | booléen                    | Respecter les fichiers .qwenignore lors de la recherche.                                                                                                                                                                                                                                                                                                              | `true`            |
| `context.fileFiltering.enableRecursiveFileSearch` | booléen                    | Indique s'il faut activer la recherche récursive de noms de fichiers dans l'arborescence actuelle lors de la complétion des préfixes `@` dans l'invite.                                                                                                                                                                                                               | `true`            |
| `context.fileFiltering.disableFuzzySearch`        | booléen                    | Lorsque cette valeur est `true`, désactive les capacités de recherche approximative lors de la recherche de fichiers, ce qui peut améliorer les performances sur les projets comportant un grand nombre de fichiers.                                                                                                                                                  | `false`           |

#### Dépannage des performances de recherche de fichiers

Si vous rencontrez des problèmes de performances avec la recherche de fichiers (par exemple, avec les complétions `@`), particulièrement dans des projets contenant un très grand nombre de fichiers, voici quelques éléments à essayer selon l'ordre de recommandation :

1. **Utilisez `.qwenignore` :** Créez un fichier `.qwenignore` à la racine de votre projet pour exclure les répertoires contenant un grand nombre de fichiers dont vous n'avez pas besoin de référence (par exemple, les artefacts de compilation, les journaux, `node_modules`). Réduire le nombre total de fichiers parcourus est la méthode la plus efficace pour améliorer les performances.
2. **Désactivez la recherche floue :** Si l'ignorance des fichiers n'est pas suffisante, vous pouvez désactiver la recherche floue en définissant `disableFuzzySearch` à `true` dans votre fichier `settings.json`. Cela utilisera un algorithme de correspondance plus simple et non flou, ce qui peut être plus rapide.
3. **Désactivez la recherche récursive de fichiers :** En dernier recours, vous pouvez désactiver entièrement la recherche récursive de fichiers en définissant `enableRecursiveFileSearch` à `false`. Ce sera l'option la plus rapide car elle évite un parcours récursif de votre projet. Cependant, cela signifie que vous devrez taper le chemin complet des fichiers lors de l'utilisation des complétions `@`.

#### outils

| Paramètre                            | Type              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Valeur par défaut | Notes                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.sandbox`                      | booléen ou chaîne | Environnement d'exécution sandbox (peut être un booléen ou une chaîne de chemin).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `undefined`       |                                                                                                                                                                                                                                                      |
| `tools.shell.enableInteractiveShell` | booléen           | Utilise `node-pty` pour une expérience shell interactive. Le repli vers `child_process` s'applique toujours.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `false`           |                                                                                                                                                                                                                                                      |
| `tools.core`                         | tableau de chaînes | Cela peut être utilisé pour restreindre l'ensemble des outils intégrés avec une liste blanche. Vous pouvez également spécifier des restrictions spécifiques à la commande pour les outils qui le prennent en charge, comme l'outil `run_shell_command`. Par exemple, `"tools.core": ["run_shell_command(ls -l)"]` n'autorisera que l'exécution de la commande `ls -l`.                                                                                                                                                                                                                                                                                                            | `undefined`       |                                                                                                                                                                                                                                                      |
| `tools.exclude`                      | tableau de chaînes | Noms d'outils à exclure de la découverte. Vous pouvez également spécifier des restrictions spécifiques à la commande pour les outils qui le prennent en charge, comme l'outil `run_shell_command`. Par exemple, `"tools.exclude": ["run_shell_command(rm -rf)"]` bloquera la commande `rm -rf`. **Note de sécurité :** Les restrictions spécifiques à la commande dans `tools.exclude` pour `run_shell_command` sont basées sur une correspondance de chaîne simple et peuvent facilement être contournées. Cette fonctionnalité **n'est pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter en toute sécurité du code non approuvé. Il est recommandé d'utiliser `tools.core` pour sélectionner explicitement les commandes pouvant être exécutées. | `undefined`       |                                                                                                                                                                                                                                                      |
| `tools.allowed`                      | tableau de chaînes | Une liste de noms d'outils qui contourneront la boîte de dialogue de confirmation. Cela est utile pour les outils auxquels vous faites confiance et que vous utilisez fréquemment. Par exemple, `["run_shell_command(git)", "run_shell_command(npm test)"]` passera la boîte de dialogue de confirmation pour exécuter toutes les commandes `git` et `npm test`.                                                                                                                                                                                                                                                                                                                                 | `undefined`       |                                                                                                                                                                                                                                                      |
| `tools.approvalMode`                 | chaîne            | Définit le mode d'approbation par défaut pour l'utilisation des outils.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `default`         | Valeurs possibles : `plan` (analyser uniquement, ne pas modifier les fichiers ni exécuter les commandes), `default` (nécessite l'approbation avant les modifications de fichiers ou l'exécution des commandes shell), `auto-edit` (approuver automatiquement les modifications de fichiers), `yolo` (approuver automatiquement tous les appels d'outils) |
| `tools.discoveryCommand`             | chaîne            | Commande à exécuter pour la découverte d'outils.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `undefined`       |                                                                                                                                                                                                                                                      |
| `tools.callCommand`                  | chaîne            | Définit une commande shell personnalisée pour appeler un outil spécifique découvert à l'aide de `tools.discoveryCommand`. La commande shell doit remplir les critères suivants : Elle doit prendre le `name` de la fonction (exactement comme dans la [déclaration de fonction](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) comme premier argument de ligne de commande. Elle doit lire les arguments de la fonction au format JSON sur `stdin`, de manière analogue à [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall). Elle doit retourner la sortie de la fonction au format JSON sur `stdout`, de manière analogue à [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse). | `undefined`       |                                                                                                                                                                                                                                                      |
| `tools.useRipgrep`                   | booléen           | Utilise ripgrep pour la recherche de contenu de fichiers au lieu de l'implémentation de repli. Fournit des performances de recherche plus rapides.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `true`            |                                                                                                                                                                                                                                                      |
| `tools.useBuiltinRipgrep`            | booléen           | Utilise le binaire ripgrep intégré. Lorsque cette valeur est `false`, la commande système `rg` sera utilisée à la place. Ce paramètre n'est effectif que lorsque `tools.useRipgrep` est `true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `true`            |                                                                                                                                                                                                                                                      |
| `tools.enableToolOutputTruncation`   | booléen           | Active le troncage des sorties d'outils volumineuses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `true`            | Redémarrage requis : Oui                                                                                                                                                                                                                             |
| `tools.truncateToolOutputThreshold`  | nombre            | Tronque la sortie de l'outil si elle dépasse ce nombre de caractères. S'applique aux outils Shell, Grep, Glob, ReadFile et ReadManyFiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `25000`           | Redémarrage requis : Oui                                                                                                                                                                                                                             |
| `tools.truncateToolOutputLines`      | nombre            | Nombre maximum de lignes ou d'entrées conservées lors du troncage de la sortie de l'outil. S'applique aux outils Shell, Grep, Glob, ReadFile et ReadManyFiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `1000`            | Redémarrage requis : Oui                                                                                                                                                                                                                             |
| `tools.autoAccept`                   | booléen           | Contrôle si l'interface en ligne de commande accepte et exécute automatiquement les appels d'outils considérés comme sûrs (par exemple, les opérations en lecture seule) sans confirmation explicite de l'utilisateur. Si défini sur `true`, l'interface en ligne de commande contournera l'invite de confirmation pour les outils jugés sûrs.                                                                                                                                                                                                                                                                                                                                                                                               | `false`           |                                                                                                                                                                                                                                                      |
| `tools.experimental.skills`          | booléen           | Activer la fonctionnalité expérimentale Agent Skills                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `false`           |                                                                                                                                                                                                                                                      |

#### mcp

| Paramètre           | Type             | Description                                                                                                                                                                                                                                                                  | Valeur par défaut |
| ------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `mcp.serverCommand` | chaîne de caractères | Commande pour démarrer un serveur MCP.                                                                                                                                                                                                                                       | `undefined`       |
| `mcp.allowed`       | tableau de chaînes | Liste blanche des serveurs MCP autorisés. Vous permet de spécifier une liste de noms de serveurs MCP qui devraient être rendus disponibles au modèle. Cela peut être utilisé pour restreindre l'ensemble des serveurs MCP auxquels se connecter. Notez que ceci sera ignoré si `--allowed-mcp-server-names` est défini. | `undefined`       |
| `mcp.excluded`      | tableau de chaînes | Liste noire des serveurs MCP à exclure. Un serveur figurant à la fois dans `mcp.excluded` et dans `mcp.allowed` est exclu. Notez que ceci sera ignoré si `--allowed-mcp-server-names` est défini.                                                                                 | `undefined`       |

> [!note]
>
> **Note de sécurité concernant les serveurs MCP :** Ces paramètres utilisent une correspondance simple de chaînes sur les noms de serveurs MCP, qui peuvent être modifiés. Si vous êtes administrateur système et souhaitez empêcher les utilisateurs de contourner cela, envisagez de configurer les `mcpServers` au niveau des paramètres système afin que l'utilisateur ne puisse pas configurer ses propres serveurs MCP. Cela ne doit pas être utilisé comme un mécanisme de sécurité hermétique.

#### sécurité

| Paramètre                      | Type    | Description                                          | Valeur par défaut |
| ------------------------------ | ------- | ---------------------------------------------------- | ----------------- |
| `security.folderTrust.enabled` | booléen | Paramètre pour suivre si la confiance du dossier est activée. | `false`           |
| `security.auth.selectedType`   | chaîne  | Le type d'authentification actuellement sélectionné. | `undefined`       |
| `security.auth.enforcedType`   | chaîne  | Le type d'authentification requis (utile pour les entreprises). | `undefined`       |
| `security.auth.useExternal`    | booléen | Indique s'il faut utiliser un flux d'authentification externe. | `undefined`       |

#### advanced

| Paramètre                      | Type             | Description                                                                                                                                                                                                                                                                                                                        | Valeur par défaut        |
| ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `advanced.autoConfigureMemory` | booléen          | Configure automatiquement les limites de mémoire de Node.js.                                                                                                                                                                                                                                                                       | `false`                  |
| `advanced.dnsResolutionOrder`  | chaîne de caractères | L'ordre de résolution DNS.                                                                                                                                                                                                                                                                                                       | `undefined`              |
| `advanced.excludedEnvVars`     | tableau de chaînes | Variables d'environnement à exclure du contexte du projet. Spécifie les variables d'environnement qui ne doivent pas être chargées à partir des fichiers `.env` du projet. Cela empêche les variables d'environnement spécifiques au projet (comme `DEBUG=true`) d'interférer avec le comportement de la CLI. Les variables provenant des fichiers `.qwen/.env` ne sont jamais exclues. | `["DEBUG","DEBUG_MODE"]` |
| `advanced.bugCommand`          | objet            | Configuration pour la commande de rapport de bogue. Remplace l'URL par défaut pour la commande `/bug`. Propriétés : `urlTemplate` (chaîne de caractères) : Une URL pouvant contenir les espaces réservés `{title}` et `{info}`. Exemple : `"bugCommand": { "urlTemplate": "https://bug.example.com/new?title={title}&info={info}" }` | `undefined`              |
| `advanced.tavilyApiKey`        | chaîne de caractères | Clé API pour le service de recherche web Tavily. Utilisée pour activer la fonctionnalité de l'outil `web_search`.                                                                                                                                                                                                                 | `undefined`              |

> [!note]
>
> **Remarque concernant advanced.tavilyApiKey :** Il s'agit d'un ancien format de configuration. Pour les utilisateurs Qwen OAuth, le fournisseur DashScope est automatiquement disponible sans aucune configuration. Pour les autres types d'authentification, configurez les fournisseurs Tavily ou Google en utilisant le nouveau format de configuration `webSearch`.

#### mcpServers

Configure les connexions à un ou plusieurs serveurs Model-Context Protocol (MCP) pour découvrir et utiliser des outils personnalisés. Qwen Code tente de se connecter à chaque serveur MCP configuré afin de découvrir les outils disponibles. Si plusieurs serveurs MCP exposent un outil portant le même nom, les noms d'outils seront préfixés avec l'alias du serveur que vous avez défini dans la configuration (par exemple, `serverAlias__actualToolName`) afin d'éviter les conflits. Notez que le système peut supprimer certaines propriétés de schéma des définitions d'outils MCP pour assurer la compatibilité. Au moins un des paramètres suivants doit être fourni : `command`, `url` ou `httpUrl`. Si plusieurs sont spécifiés, l'ordre de priorité est `httpUrl`, puis `url`, puis `command`.

| Propriété                               | Type             | Description                                                                                                                                                                                                                                                        | Optionnel |
| --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `mcpServers.<SERVER_NAME>.command`      | chaîne           | La commande à exécuter pour démarrer le serveur MCP via l'entrée/sortie standard.                                                                                                                                                                                  | Oui       |
| `mcpServers.<SERVER_NAME>.args`         | tableau de chaînes | Arguments à transmettre à la commande.                                                                                                                                                                                                                             | Oui       |
| `mcpServers.<SERVER_NAME>.env`          | objet            | Variables d'environnement à définir pour le processus du serveur.                                                                                                                                                                                                  | Oui       |
| `mcpServers.<SERVER_NAME>.cwd`          | chaîne           | Le répertoire de travail dans lequel démarrer le serveur.                                                                                                                                                                                                          | Oui       |
| `mcpServers.<SERVER_NAME>.url`          | chaîne           | L'URL d'un serveur MCP qui utilise les Server-Sent Events (SSE) pour la communication.                                                                                                                                                                             | Oui       |
| `mcpServers.<SERVER_NAME>.httpUrl`      | chaîne           | L'URL d'un serveur MCP qui utilise un protocole HTTP diffusable en continu pour la communication.                                                                                                                                                                  | Oui       |
| `mcpServers.<SERVER_NAME>.headers`      | objet            | Une table de correspondance des en-têtes HTTP à envoyer avec les requêtes vers `url` ou `httpUrl`.                                                                                                                                                                 | Oui       |
| `mcpServers.<SERVER_NAME>.timeout`      | nombre           | Délai d'attente en millisecondes pour les requêtes vers ce serveur MCP.                                                                                                                                                                                            | Oui       |
| `mcpServers.<SERVER_NAME>.trust`        | booléen          | Faire confiance à ce serveur et ignorer toutes les confirmations d'appel d'outils.                                                                                                                                                                                 | Oui       |
| `mcpServers.<SERVER_NAME>.description`  | chaîne           | Une brève description du serveur, pouvant être utilisée à des fins d'affichage.                                                                                                                                                                                    | Oui       |
| `mcpServers.<SERVER_NAME>.includeTools` | tableau de chaînes | Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsque spécifié, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste blanche). Si non spécifié, tous les outils du serveur sont activés par défaut.                    | Oui       |
| `mcpServers.<SERVER_NAME>.excludeTools` | tableau de chaînes | Liste des noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur. **Remarque :** `excludeTools` a priorité sur `includeTools` - si un outil figure dans les deux listes, il sera exclu. | Oui       |

#### télémétrie

Configure la journalisation et la collecte des métriques pour Qwen Code. Pour plus d'informations, consultez [télémétrie](/developers/development/telemetry).

| Paramètre                | Type    | Description                                                                      | Valeur par défaut |
| ------------------------ | ------- | -------------------------------------------------------------------------------- | ----------------- |
| `telemetry.enabled`      | boolean | Indique si la télémétrie est activée ou non.                                     |                   |
| `telemetry.target`       | string  | La destination pour la télémétrie collectée. Les valeurs prises en charge sont `local` et `gcp`. |                   |
| `telemetry.otlpEndpoint` | string  | Le point de terminaison pour l'exportateur OTLP.                                 |                   |
| `telemetry.otlpProtocol` | string  | Le protocole pour l'exportateur OTLP (`grpc` ou `http`).                         |                   |
| `telemetry.logPrompts`   | boolean | Indique s'il faut inclure ou non le contenu des invites utilisateur dans les journaux. |                   |
| `telemetry.outfile`      | string  | Le fichier dans lequel écrire la télémétrie lorsque `target` est `local`.         |                   |
| `telemetry.useCollector` | boolean | Indique s'il faut utiliser un collecteur OTLP externe.                           |                   |

### Exemple de `settings.json`

Voici un exemple de fichier `settings.json` avec la structure imbriquée, nouvelle à partir de la version 0.3.0 :

```
{
  "general": {
    "vimMode": true,
    "preferredEditor": "code"
  },
  "ui": {
    "theme": "GitHub",
    "hideBanner": true,
    "hideTips": false,
    "customWittyPhrases": [
      "Vous oubliez mille choses chaque jour. Assurez-vous que celle-ci en fait partie",
      "Connexion à l'AGI"
    ]
  },
  "tools": {
    "approvalMode": "yolo",
    "sandbox": "docker",
    "discoveryCommand": "bin/get_tools",
    "callCommand": "bin/call_tool",
    "exclude": ["write_file"]
  },
  "mcpServers": {
    "mainServer": {
      "command": "bin/mcp_server.py"
    },
    "anotherServer": {
      "command": "node",
      "args": ["mcp_server.js", "--verbose"]
    }
  },
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:4317",
    "logPrompts": true
  },
  "privacy": {
    "usageStatisticsEnabled": true
  },
  "model": {
    "name": "qwen3-coder-plus",
    "maxSessionTurns": 10,
    "enableOpenAILogging": false,
    "openAILoggingDir": "~/qwen-logs",
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 100
      }
    }
  },
  "context": {
    "fileName": ["CONTEXT.md", "QWEN.md"],
    "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
    "loadFromIncludeDirectories": true,
    "fileFiltering": {
      "respectGitIgnore": false
    }
  },
  "advanced": {
    "excludedEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
  }
}
```

## Historique du shell

La CLI conserve un historique des commandes shell que vous exécutez. Pour éviter les conflits entre différents projets, cet historique est stocké dans un répertoire spécifique au projet situé dans le dossier personnel de votre utilisateur.

- **Emplacement :** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` est un identifiant unique généré à partir du chemin racine de votre projet.
  - L'historique est stocké dans un fichier nommé `shell_history`.

## Variables d'environnement et fichiers `.env`

Les variables d'environnement constituent un moyen courant de configurer les applications, en particulier pour les informations sensibles (comme les jetons) ou pour les paramètres qui peuvent changer entre différents environnements.

Qwen Code peut charger automatiquement les variables d'environnement à partir des fichiers `.env`.
Pour les variables liées à l'authentification (comme `OPENAI_*`) et la méthode recommandée utilisant `.qwen/.env`, voir **[Authentification](../configuration/auth)**.

> [!tip]
>
> **Exclusion des variables d'environnement :** Certaines variables d'environnement (comme `DEBUG` et `DEBUG_MODE`) sont automatiquement exclues des fichiers `.env` du projet par défaut afin d'éviter toute interférence avec le comportement de la CLI. Les variables provenant des fichiers `.qwen/.env` ne sont jamais exclues. Vous pouvez personnaliser ce comportement en utilisant le paramètre `advanced.excludedEnvVars` dans votre fichier `settings.json`.

### Tableau des variables d'environnement

| Variable                         | Description                                                                                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_TELEMETRY_ENABLED`       | Définir à `true` ou `1` pour activer la télémétrie. Toute autre valeur est considérée comme la désactivant.                                                                  | Remplace le paramètre `telemetry.enabled`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GEMINI_TELEMETRY_TARGET`        | Définit la cible de télémétrie (`local` ou `gcp`).                                                                                                          | Remplace le paramètre `telemetry.target`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GEMINI_TELEMETRY_OTLP_ENDPOINT` | Définit le point de terminaison OTLP pour la télémétrie.                                                                                                                  | Remplace le paramètre `telemetry.otlpEndpoint`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GEMINI_TELEMETRY_OTLP_PROTOCOL` | Définit le protocole OTLP (`grpc` ou `http`).                                                                                                             | Remplace le paramètre `telemetry.otlpProtocol`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GEMINI_TELEMETRY_LOG_PROMPTS`   | Définir à `true` ou `1` pour activer ou désactiver l'enregistrement des invites utilisateur. Toute autre valeur est considérée comme la désactivant.                                         | Remplace le paramètre `telemetry.logPrompts`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `GEMINI_TELEMETRY_OUTFILE`       | Définit le chemin du fichier dans lequel écrire la télémétrie lorsque la cible est `local`.                                                                                   | Remplace le paramètre `telemetry.outfile`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GEMINI_TELEMETRY_USE_COLLECTOR` | Définir à `true` ou `1` pour activer ou désactiver l'utilisation d'un collecteur OTLP externe. Toute autre valeur est considérée comme la désactivant.                                | Remplace le paramètre `telemetry.useCollector`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GEMINI_SANDBOX`                 | Alternative au paramètre `sandbox` dans `settings.json`.                                                                                               | Accepte `true`, `false`, `docker`, `podman` ou une chaîne de commande personnalisée.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SEATBELT_PROFILE`               | (spécifique à macOS) Bascule le profil Seatbelt (`sandbox-exec`) sur macOS.                                                                              | `permissive-open` : (par défaut) Restreint les écritures dans le dossier du projet (et quelques autres dossiers, voir `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) mais autorise les autres opérations. `strict` : Utilise un profil strict qui refuse les opérations par défaut. `<nom_du_profil>` : Utilise un profil personnalisé. Pour définir un profil personnalisé, créez un fichier nommé `sandbox-macos-<nom_du_profil>.sb` dans le répertoire `.qwen/` de votre projet (par exemple, `mon-projet/.qwen/sandbox-macos-personnalise.sb`). |
| `DEBUG` ou `DEBUG_MODE`          | (souvent utilisé par les bibliothèques sous-jacentes ou par l'interface en ligne de commande elle-même) Définir à `true` ou `1` pour activer les journaux de débogage verbeux, ce qui peut être utile pour le dépannage. | **Remarque :** Ces variables sont automatiquement exclues des fichiers `.env` du projet par défaut afin d'éviter toute interférence avec le comportement de l'interface en ligne de commande. Utilisez les fichiers `.qwen/.env` si vous devez définir ces variables spécifiquement pour Qwen Code.                                                                                                                                                                                                                                                               |
| `NO_COLOR`                       | Définir à n'importe quelle valeur pour désactiver toutes les sorties colorées dans l'interface en ligne de commande.                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CLI_TITLE`                      | Définir à une chaîne pour personnaliser le titre de l'interface en ligne de commande.                                                                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `CODE_ASSIST_ENDPOINT`           | Spécifie le point de terminaison du serveur d'assistance de code.                                                                                                     | Ceci est utile pour le développement et les tests.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `TAVILY_API_KEY`                 | Votre clé API pour le service de recherche web Tavily.                                                                                                        | Utilisée pour activer la fonctionnalité de l'outil `web_search`. Exemple : `export TAVILY_API_KEY="tvly-votre-cle-api-ici"`                                                                                                                                                                                                                                                                                                                                                                      |

## Arguments de ligne de commande

Les arguments passés directement lors de l'exécution du CLI peuvent remplacer d'autres configurations pour cette session spécifique.

### Tableau des arguments de ligne de commande

| Argument                     | Alias | Description                                                                                                                                                                             | Valeurs possibles                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--model`                    | `-m`  | Spécifie le modèle Qwen à utiliser pour cette session.                                                                                                                                  | Nom du modèle                          | Exemple : `npm start -- --model qwen3-coder-plus`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--prompt`                   | `-p`  | Utilisé pour transmettre directement une invite à la commande. Cela invoque Qwen Code en mode non interactif.                                                                           | Votre texte d'invite                   | Pour les exemples de scripts, utilisez l'option `--output-format json` pour obtenir une sortie structurée.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--prompt-interactive`       | `-i`  | Démarre une session interactive avec l'invite fournie comme entrée initiale.                                                                                                            | Votre texte d'invite                   | L'invite est traitée dans la session interactive, pas avant celle-ci. Ne peut pas être utilisée lorsqu'on redirige l'entrée depuis stdin. Exemple : `qwen -i "expliquer ce code"`                                                                                                                                                                                                                                                                                                                                                                                 |
| `--output-format`            | `-o`  | Spécifie le format de la sortie CLI pour le mode non interactif.                                                                                                                        | `text`, `json`, `stream-json`          | `text` : (Par défaut) La sortie standard lisible par l'humain. `json` : Une sortie JSON lisible par la machine émise à la fin de l'exécution. `stream-json` : Messages JSON diffusés au fur et à mesure de leur occurrence pendant l'exécution. Pour une sortie structurée et des scripts, utilisez l'option `--output-format json` ou `--output-format stream-json`. Voir [Mode Headless](../features/headless) pour plus d'informations. |
| `--input-format`             |       | Spécifie le format consommé depuis l'entrée standard.                                                                                                                                   | `text`, `stream-json`                  | `text` : (Par défaut) Entrée texte standard depuis stdin ou arguments de ligne de commande. `stream-json` : Protocole de messages JSON via stdin pour une communication bidirectionnelle. Condition : `--input-format stream-json` nécessite que `--output-format stream-json` soit défini. Lors de l'utilisation de `stream-json`, stdin est réservé aux messages de protocole. Voir [Mode Headless](../features/headless) pour plus d'informations. |
| `--include-partial-messages` |       | Inclure les messages partiels de l'assistant lors de l'utilisation du format de sortie `stream-json`. Lorsqu'elle est activée, émet des événements de flux (message_start, content_block_delta, etc.) au fur et à mesure de leur occurrence pendant le streaming. |                                        | Par défaut : `false`. Condition : Nécessite que `--output-format stream-json` soit défini. Voir [Mode Headless](../features/headless) pour plus d'informations sur les événements de flux.                                                                                                                                                                                                                                                                                                                                                                       |
| `--sandbox`                  | `-s`  | Active le mode sandbox pour cette session.                                                                                                                                              |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--sandbox-image`            |       | Définit l'URI de l'image du sandbox.                                                                                                                                                    |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--debug`                    | `-d`  | Active le mode débogage pour cette session, fournissant une sortie plus verbeuse.                                                                                                       |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--all-files`                | `-a`  | Si défini, inclut récursivement tous les fichiers du répertoire courant comme contexte pour l'invite.                                                                                   |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--help`                     | `-h`  | Affiche les informations d'aide sur les arguments de ligne de commande.                                                                                                                 |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--show-memory-usage`        |       | Affiche l'utilisation actuelle de la mémoire.                                                                                                                                           |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--yolo`                     |       | Active le mode YOLO, qui approuve automatiquement tous les appels d'outils.                                                                                                            |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--approval-mode`            |       | Définit le mode d'approbation pour les appels d'outils.                                                                                                                                 | `plan`, `default`, `auto-edit`, `yolo` | Modes pris en charge : `plan` : Analyser uniquement—ne pas modifier les fichiers ni exécuter les commandes. `default` : Nécessite l'approbation pour les modifications de fichiers ou les commandes shell (comportement par défaut). `auto-edit` : Approuver automatiquement les outils de modification (edit, write_file) tout en demandant confirmation pour les autres. `yolo` : Approuver automatiquement tous les appels d'outils (équivalent à `--yolo`). Ne peut pas être utilisé conjointement avec `--yolo`. Utilisez `--approval-mode=yolo` au lieu de `--yolo` pour la nouvelle approche unifiée. Exemple : `qwen --approval-mode auto-edit`<br>Voir davantage sur [Mode d'approbation](../features/approval-mode). |
| `--allowed-tools`            |       | Une liste d'outils séparés par des virgules qui contourneront la boîte de dialogue de confirmation.                                                                                     | Noms d'outils                          | Exemple : `qwen --allowed-tools "Shell(git status)"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--telemetry`                |       | Active la [télémétrie](/developers/development/telemetry).                                                                                                                              |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--telemetry-target`         |       | Définit la cible de télémétrie.                                                                                                                                                         |                                        | Voir [télémétrie](/developers/development/telemetry) pour plus d'informations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--telemetry-otlp-endpoint`  |       | Définit le point de terminaison OTLP pour la télémétrie.                                                                                                                                |                                        | Voir [télémétrie](../../developers/development/telemetry) pour plus d'informations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--telemetry-otlp-protocol`  |       | Définit le protocole OTLP pour la télémétrie (`grpc` ou `http`).                                                                                                                        |                                        | Par défaut `grpc`. Voir [télémétrie](../../developers/development/telemetry) pour plus d'informations.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--telemetry-log-prompts`    |       | Active l'enregistrement des invites pour la télémétrie.                                                                                                                                 |                                        | Voir [télémétrie](../../developers/development/telemetry) pour plus d'informations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--checkpointing`            |       | Active la [sauvegarde ponctuelle](../features/checkpointing).                                                                                                                           |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--acp`                      |       | Active le mode ACP (Agent Client Protocol). Utile pour les intégrations IDE/éditeur comme [Zed](../integration-zed).                                                                     |                                        | Stable. Remplace l'ancienne option `--experimental-acp`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--experimental-skills`      |       | Active les [compétences d'agent](../features/skills) expérimentales (enregistre l'outil `skill` et charge les compétences depuis `.qwen/skills/` et `~/.qwen/skills/`).                 |                                        | Expérimental.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--extensions`               | `-e`  | Spécifie une liste d'extensions à utiliser pour la session.                                                                                                                             | Noms d'extensions                      | Si non fourni, toutes les extensions disponibles sont utilisées. Utilisez le terme spécial `qwen -e none` pour désactiver toutes les extensions. Exemple : `qwen -e my-extension -e my-other-extension`                                                                                                                                                                                                                                                                                                                                                         |
| `--list-extensions`          | `-l`  | Liste toutes les extensions disponibles et quitte.                                                                                                                                      |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--proxy`                    |       | Définit le proxy pour la CLI.                                                                                                                                                           | URL du proxy                           | Exemple : `--proxy http://localhost:7890`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--include-directories`      |       | Inclut des répertoires supplémentaires dans l'espace de travail pour prendre en charge plusieurs répertoires.                                                                           | Chemins des répertoires                | Peut être spécifié plusieurs fois ou sous forme de valeurs séparées par des virgules. Maximum 5 répertoires peuvent être ajoutés. Exemple : `--include-directories /path/to/project1,/path/to/project2` ou `--include-directories /path/to/project1 --include-directories /path/to/project2`                                                                                                                                                                                                                                                            |
| `--screen-reader`            |       | Active le mode lecteur d'écran, qui ajuste l'interface utilisateur textuelle (TUI) pour une meilleure compatibilité avec les lecteurs d'écran.                                           |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--version`                  |       | Affiche la version de la CLI.                                                                                                                                                           |                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--openai-logging`           |       | Active l'enregistrement des appels d'API OpenAI pour le débogage et l'analyse.                                                                                                          |                                        | Cette option remplace le paramètre `enableOpenAILogging` dans `settings.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--openai-logging-dir`       |       | Définit un chemin personnalisé vers le répertoire pour les journaux d'API OpenAI.                                                                                                       | Chemin du répertoire                   | Cette option remplace le paramètre `openAILoggingDir` dans `settings.json`. Prend en charge les chemins absolus, relatifs et l'expansion de `~`. Exemple : `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`                                                                                                                                                                                                                                                                                                                                         |
| `--tavily-api-key`           |       | Définit la clé d'API Tavily pour la fonctionnalité de recherche Web pour cette session.                                                                                                 | Clé d'API                              | Exemple : `qwen --tavily-api-key tvly-your-api-key-here`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Fichiers de contexte (Contexte instructif hiérarchique)

Bien que ne constituant pas strictement une configuration du comportement de l'interface en ligne de commande (CLI), les fichiers de contexte (nommés par défaut `QWEN.md` mais configurables via le paramètre `context.fileName`) sont essentiels pour configurer le _contexte instructif_ (également appelé « mémoire »). Cette fonctionnalité puissante vous permet de fournir à l'IA des instructions spécifiques au projet, des guides de style de codage ou toute autre information contextuelle pertinente, rendant ainsi ses réponses plus adaptées et précises à vos besoins. La CLI inclut des éléments d'interface utilisateur, tels qu'un indicateur dans le pied de page affichant le nombre de fichiers de contexte chargés, afin de vous tenir informé du contexte actif.

- **Objectif :** Ces fichiers Markdown contiennent des instructions, des directives ou un contexte que vous souhaitez que le modèle Qwen prenne en compte pendant vos interactions. Le système est conçu pour gérer ce contexte instructif de manière hiérarchique.

### Exemple de contenu de fichier de contexte (par exemple `QWEN.md`)

Voici un exemple conceptuel du contenu que pourrait avoir un fichier de contexte à la racine d'un projet TypeScript :

```

# Projet : Ma fantastique bibliothèque TypeScript

## Instructions générales :
- Lors de la génération de nouveau code TypeScript, veuillez suivre le style de codage existant.
- Assurez-vous que toutes les nouvelles fonctions et classes disposent de commentaires JSDoc.
- Préférez les paradigmes de programmation fonctionnelle lorsque cela est approprié.
- Tout le code doit être compatible avec TypeScript 5.0 et Node.js 20+.

## Style de codage :
- Utilisez 2 espaces pour l'indentation.
- Les noms d'interfaces doivent être préfixés par `I` (par exemple, `IUserService`).
- Les membres privés des classes doivent être préfixés par un trait de soulignement (`_`).
- Utilisez toujours l'égalité stricte (`===` et `!==`).

## Composant spécifique : `src/api/client.ts`
- Ce fichier gère toutes les requêtes API sortantes.
- Lors de l'ajout de nouvelles fonctions d'appel d'API, assurez-vous qu'elles incluent une gestion d'erreurs et une journalisation robustes.
- Utilisez l'utilitaire existant `fetchWithRetry` pour toutes les requêtes GET.
```

## À propos des dépendances :
- Évitez d'introduire de nouvelles dépendances externes à moins que ce ne soit absolument nécessaire.
- Si une nouvelle dépendance est requise, veuillez indiquer la raison.
```

Cet exemple montre comment vous pouvez fournir un contexte général sur le projet, des conventions de codage spécifiques, et même des notes concernant des fichiers ou composants particuliers. Plus vos fichiers de contexte sont pertinents et précis, mieux l'IA pourra vous aider. Les fichiers de contexte spécifiques au projet sont vivement encouragés afin d'établir des conventions et du contexte.

- **Chargement hiérarchique et priorité :** La CLI implémente un système de mémoire hiérarchique sophistiqué en chargeant les fichiers de contexte (par exemple, `QWEN.md`) depuis plusieurs emplacements. Le contenu des fichiers situés plus bas dans cette liste (plus spécifiques) remplace ou complète généralement le contenu des fichiers situés plus haut (plus généraux). L'ordre exact de concaténation et le contexte final peuvent être consultés à l'aide de la commande `/memory show`. L'ordre de chargement typique est le suivant :
  1. **Fichier de contexte global :**
     - Emplacement : `~/.qwen/<nom-du-fichier-de-contexte-configuré>` (par exemple, `~/.qwen/QWEN.md` dans votre répertoire personnel).
     - Portée : Fournit des instructions par défaut pour tous vos projets.
  2. **Fichiers de contexte racine du projet et ancêtres :**
     - Emplacement : La CLI recherche le fichier de contexte configuré dans le répertoire de travail actuel, puis dans chaque répertoire parent jusqu'au répertoire racine du projet (identifié par un dossier `.git`) ou votre répertoire personnel.
     - Portée : Fournit un contexte pertinent pour l'ensemble du projet ou une partie significative de celui-ci.
  3. **Fichiers de contexte des sous-répertoires (contextuels/locaux) :**
     - Emplacement : La CLI recherche également le fichier de contexte configuré dans les sous-répertoires _situés sous_ le répertoire de travail actuel (en respectant les motifs d'ignorance courants comme `node_modules`, `.git`, etc.). La profondeur de cette recherche est limitée à 200 répertoires par défaut, mais peut être configurée via le paramètre `context.discoveryMaxDirs` dans votre fichier `settings.json`.
     - Portée : Permet des instructions très spécifiques relatives à un composant, module ou sous-section particulière de votre projet.
- **Concaténation et indication dans l'interface :** Le contenu de tous les fichiers de contexte trouvés est concaténé (avec des séparateurs indiquant leur origine et leur chemin) et fourni dans le cadre de l'invite système. Le pied de page de la CLI affiche le nombre de fichiers de contexte chargés, vous donnant ainsi un indicateur visuel rapide sur le contexte d'instructions actif.
- **Importation de contenu :** Vous pouvez modulariser vos fichiers de contexte en important d'autres fichiers Markdown à l'aide de la syntaxe `@chemin/vers/fichier.md`. Pour plus de détails, consultez la [documentation du processeur d'importation de mémoire](../configuration/memory).
- **Commandes pour la gestion de la mémoire :**
  - Utilisez `/memory refresh` pour forcer un nouveau scan et recharger tous les fichiers de contexte depuis tous les emplacements configurés. Cela met à jour le contexte d'instructions de l'IA.
  - Utilisez `/memory show` pour afficher le contexte d'instructions combiné actuellement chargé, vous permettant de vérifier la hiérarchie et le contenu utilisé par l'IA.
  - Consultez la [documentation des commandes](../features/commands) pour obtenir tous les détails sur la commande `/memory` et ses sous-commandes (`show` et `refresh`).

En comprenant et en utilisant ces couches de configuration et la nature hiérarchique des fichiers de contexte, vous pouvez efficacement gérer la mémoire de l'IA et adapter les réponses de Qwen Code à vos besoins et projets spécifiques.

## Sandbox

Qwen Code peut exécuter des opérations potentiellement dangereuses (comme les commandes shell et les modifications de fichiers) au sein d'un environnement isolé (sandbox) afin de protéger votre système.

Le [Sandbox](../features/sandbox) est désactivé par défaut, mais vous pouvez l'activer de plusieurs façons :

- En utilisant l'option `--sandbox` ou `-s`.
- En définissant la variable d'environnement `GEMINI_SANDBOX`.
- Le mode sandbox est activé par défaut lorsque vous utilisez `--yolo` ou `--approval-mode=yolo`.

Par défaut, il utilise une image Docker pré-construite nommée `qwen-code-sandbox`.

Pour répondre à des besoins spécifiques liés au projet, vous pouvez créer un fichier Docker personnalisé à l'emplacement `.qwen/sandbox.Dockerfile` à la racine de votre projet. Ce fichier Docker peut être basé sur l'image de base du sandbox :

```
FROM qwen-code-sandbox

# Ajoutez vos dépendances ou configurations personnalisées ici

# Par exemple :

# RUN apt-get update && apt-get install -y some-package

# COPY ./my-config /app/my-config
```

Lorsque `.qwen/sandbox.Dockerfile` existe, vous pouvez utiliser la variable d'environnement `BUILD_SANDBOX` lors de l'exécution de Qwen Code pour construire automatiquement l'image personnalisée du sandbox :

```
BUILD_SANDBOX=1 qwen -s
```

## Statistiques d'utilisation

Pour nous aider à améliorer Qwen Code, nous collectons des statistiques d'utilisation anonymisées. Ces données nous permettent de comprendre comment la CLI est utilisée, d'identifier les problèmes courants et de prioriser les nouvelles fonctionnalités.

**Ce que nous collectons :**

- **Appels aux outils :** Nous enregistrons les noms des outils appelés, leur succès ou échec, ainsi que leur durée d'exécution. Nous ne collectons pas les arguments passés aux outils ni les données qu'ils renvoient.
- **Requêtes API :** Nous enregistrons le modèle utilisé pour chaque requête, sa durée et son succès. Nous ne collectons pas le contenu des invites ou des réponses.
- **Informations sur la session :** Nous recueillons des informations concernant la configuration de la CLI, telles que les outils activés et le mode d'approbation.

**Ce que nous NE collectons PAS :**

- **Informations personnelles identifiables (PII) :** Nous ne collectons aucune information personnelle, comme votre nom, votre adresse e-mail ou vos clés API.
- **Contenu des invites et des réponses :** Nous n'enregistrons pas le contenu de vos invites ou les réponses du modèle.
- **Contenu des fichiers :** Nous n'enregistrons pas le contenu des fichiers lus ou écrits par la CLI.

**Comment se désinscrire :**

Vous pouvez vous désinscrire de la collecte des statistiques d'utilisation à tout moment en définissant la propriété `usageStatisticsEnabled` à `false` dans la catégorie `privacy` de votre fichier `settings.json` :

```
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

> [!note]
>
> Lorsque les statistiques d'utilisation sont activées, les événements sont envoyés à un point de collecte Alibaba Cloud RUM.