# Configuration de Qwen Code

**Note sur le nouveau format de configuration**

Le format du fichier `settings.json` a été mis à jour vers une nouvelle structure plus organisée. L'ancien format sera migré automatiquement.

Pour plus de détails sur l'ancien format, consultez la [documentation de configuration v1](./configuration-v1.md).

Qwen Code propose plusieurs façons de configurer son comportement, notamment via des variables d'environnement, des arguments en ligne de commande et des fichiers de configuration. Ce document décrit les différentes méthodes de configuration ainsi que les paramètres disponibles.

## Couches de configuration

La configuration est appliquée dans l'ordre de priorité suivant (les nombres plus bas sont écrasés par les nombres plus élevés) :

1.  **Valeurs par défaut :** Valeurs codées en dur dans l'application.
2.  **Fichier de paramètres système :** Paramètres par défaut à l'échelle du système qui peuvent être écrasés par d'autres fichiers de configuration.
3.  **Fichier de paramètres utilisateur :** Paramètres globaux pour l'utilisateur actuel.
4.  **Fichier de paramètres projet :** Paramètres spécifiques au projet.
5.  **Fichier de paramètres système :** Paramètres à l'échelle du système qui écrasent tous les autres fichiers de configuration.
6.  **Variables d'environnement :** Variables à l'échelle du système ou spécifiques à la session, potentiellement chargées depuis des fichiers `.env`.
7.  **Arguments de ligne de commande :** Valeurs passées lors du lancement du CLI.

## Fichiers de configuration

Qwen Code utilise des fichiers de configuration au format JSON pour stocker les paramètres de manière persistante. Ces fichiers peuvent être situés à quatre endroits différents :

- **Fichier des valeurs par défaut du système :**
  - **Emplacement :** `/etc/qwen-code/system-defaults.json` (Linux), `C:\ProgramData\qwen-code\system-defaults.json` (Windows) ou `/Library/Application Support/QwenCode/system-defaults.json` (macOS). Ce chemin peut être modifié via la variable d’environnement `QWEN_CODE_SYSTEM_DEFAULTS_PATH`.
  - **Portée :** Fournit une couche de base contenant les paramètres par défaut à l’échelle du système. Ces paramètres ont la priorité la plus faible et sont destinés à être écrasés par les paramètres utilisateur, projet ou système.

- **Fichier des paramètres utilisateur :**
  - **Emplacement :** `~/.qwen/settings.json` (où `~` représente votre répertoire personnel).
  - **Portée :** S’applique à toutes les sessions Qwen Code de l’utilisateur courant.

- **Fichier des paramètres projet :**
  - **Emplacement :** `.qwen/settings.json` dans le répertoire racine de votre projet.
  - **Portée :** Ne s’applique que lorsque vous exécutez Qwen Code depuis ce projet spécifique. Les paramètres projet prennent le pas sur les paramètres utilisateur.

- **Fichier des paramètres système :**
  - **Emplacement :** `/etc/qwen-code/settings.json` (Linux), `C:\ProgramData\qwen-code\settings.json` (Windows) ou `/Library/Application Support/QwenCode/settings.json` (macOS). Ce chemin peut également être personnalisé avec la variable d’environnement `QWEN_CODE_SYSTEM_SETTINGS_PATH`.
  - **Portée :** S’applique à toutes les sessions Qwen Code sur l’ensemble du système, pour tous les utilisateurs. Ces paramètres remplacent ceux définis au niveau utilisateur ou projet. Ils peuvent être utiles aux administrateurs système dans un environnement professionnel souhaitant imposer certains réglages pour les installations Qwen Code des utilisateurs.

**Remarque sur l’utilisation des variables d’environnement dans les paramètres :** Dans vos fichiers `settings.json`, les valeurs de type chaîne peuvent faire référence à des variables d’environnement en utilisant soit la syntaxe `$VAR_NAME`, soit `${VAR_NAME}`. Ces variables seront automatiquement résolues lors du chargement des paramètres. Par exemple, si vous avez une variable d’environnement nommée `MY_API_TOKEN`, vous pouvez l’utiliser dans `settings.json` comme ceci : `"apiKey": "$MY_API_TOKEN"`.

### Le répertoire `.qwen` dans votre projet

En plus du fichier de configuration du projet, le répertoire `.qwen` d'un projet peut contenir d'autres fichiers spécifiques au projet liés au fonctionnement de Qwen Code, tels que :

- [Profils de sandbox personnalisés](#sandboxing) (ex : `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

### Paramètres disponibles dans `settings.json`

Les paramètres sont organisés par catégories. Tous les paramètres doivent être placés dans l'objet de catégorie de premier niveau correspondant dans votre fichier `settings.json`.

#### `general`

- **`general.preferredEditor`** (string) :
  - **Description :** L'éditeur préféré pour ouvrir les fichiers.
  - **Default :** `undefined`

- **`general.vimMode`** (boolean) :
  - **Description :** Activer les raccourcis clavier Vim.
  - **Default :** `false`

- **`general.disableAutoUpdate`** (boolean) :
  - **Description :** Désactiver les mises à jour automatiques.
  - **Default :** `false`

- **`general.disableUpdateNag`** (boolean) :
  - **Description :** Désactiver les notifications de mise à jour.
  - **Default :** `false`

- **`general.checkpointing.enabled`** (boolean) :
  - **Description :** Activer la sauvegarde des sessions pour la récupération.
  - **Default :** `false`

#### `output`

- **`output.format`** (string) :
  - **Description :** Le format de sortie du CLI.
  - **Default :** `"text"`
  - **Valeurs :** `"text"`, `"json"`

#### `ui`

- **`ui.theme`** (string):
  - **Description :** Le thème de couleurs pour l'interface utilisateur. Voir [Themes](./themes.md) pour les options disponibles.
  - **Par défaut :** `undefined`

- **`ui.customThemes`** (objet):
  - **Description :** Définitions de thèmes personnalisés.
  - **Par défaut :** `{}`

- **`ui.hideWindowTitle`** (booléen):
  - **Description :** Masquer la barre de titre de la fenêtre.
  - **Par défaut :** `false`

- **`ui.hideTips`** (booléen):
  - **Description :** Masquer les astuces utiles dans l'interface utilisateur.
  - **Par défaut :** `false`

- **`ui.hideBanner`** (booléen):
  - **Description :** Masquer la bannière de l'application.
  - **Par défaut :** `false`

- **`ui.hideFooter`** (booléen):
  - **Description :** Masquer le pied de page de l'interface utilisateur.
  - **Par défaut :** `false`

- **`ui.showMemoryUsage`** (booléen):
  - **Description :** Afficher les informations d'utilisation de la mémoire dans l'interface utilisateur.
  - **Par défaut :** `false`

- **`ui.showLineNumbers`** (booléen):
  - **Description :** Afficher les numéros de ligne dans le chat.
  - **Par défaut :** `false`

- **`ui.showCitations`** (booléen):
  - **Description :** Afficher les citations pour le texte généré dans le chat.
  - **Par défaut :** `true`

- **`enableWelcomeBack`** (booléen):
  - **Description :** Afficher une boîte de dialogue de bienvenue lors du retour à un projet avec un historique de conversation.
  - **Par défaut :** `true`

- **`ui.accessibility.disableLoadingPhrases`** (booléen):
  - **Description :** Désactiver les phrases de chargement pour l'accessibilité.
  - **Par défaut :** `false`

- **`ui.customWittyPhrases`** (tableau de chaînes de caractères):
  - **Description :** Une liste de phrases personnalisées à afficher pendant les états de chargement. Lorsque cette option est renseignée, le CLI parcourt ces phrases au lieu des phrases par défaut.
  - **Par défaut :** `[]`

#### `ide`

- **`ide.enabled`** (boolean):
  - **Description:** Active le mode d'intégration IDE.
  - **Default:** `false`

- **`ide.hasSeenNudge`** (boolean):
  - **Description:** Indique si l'utilisateur a vu la notification d'intégration IDE.
  - **Default:** `false`

#### `privacy`

- **`privacy.usageStatisticsEnabled`** (boolean):
  - **Description:** Active la collecte des statistiques d'utilisation.
  - **Default:** `true`

#### `model`

- **`model.name`** (string):
  - **Description :** Le modèle Qwen à utiliser pour les conversations.
  - **Par défaut :** `undefined`

- **`model.maxSessionTurns`** (number):
  - **Description :** Nombre maximum de tours utilisateur/modèle/outils à conserver dans une session. La valeur `-1` signifie illimité.
  - **Par défaut :** `-1`

- **`model.summarizeToolOutput`** (object):
  - **Description :** Active ou désactive la synthèse de la sortie des outils. Vous pouvez spécifier le budget de tokens pour la synthèse via le paramètre `tokenBudget`. Remarque : Actuellement, seul l'outil `run_shell_command` est pris en charge. Exemple : `{"run_shell_command": {"tokenBudget": 2000}}`
  - **Par défaut :** `undefined`

- **`model.chatCompression.contextPercentageThreshold`** (number):
  - **Description :** Définit le seuil de compression de l'historique de discussion en pourcentage de la limite totale de tokens du modèle. Il s'agit d'une valeur entre 0 et 1 qui s'applique à la fois à la compression automatique et à la commande manuelle `/compress`. Par exemple, une valeur de `0.6` déclenchera la compression lorsque l'historique dépasse 60 % de la limite de tokens. Utilisez `0` pour désactiver complètement la compression.
  - **Par défaut :** `0.7`

- **`model.generationConfig`** (object):
  - **Description :** Paramètres avancés transmis au générateur de contenu sous-jacent. Prend en charge des contrôles comme `timeout`, `maxRetries` et `disableCacheControl`, ainsi que des réglages fins dans `samplingParams` (par exemple `temperature`, `top_p`, `max_tokens`). Laissez ce champ vide pour utiliser les valeurs par défaut du fournisseur.
  - **Par défaut :** `undefined`
  - **Exemple :**

    ```json
    {
      "model": {
        "generationConfig": {
          "timeout": 60000,
          "disableCacheControl": false,
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 1024
          }
        }
      }
    }
    ```

- **`model.skipNextSpeakerCheck`** (boolean):
  - **Description :** Ignore la vérification du prochain intervenant.
  - **Par défaut :** `false`

- **`model.skipLoopDetection`** (boolean):
  - **Description :** Désactive la détection des boucles infinies. Cette fonctionnalité empêche les réponses IA de tomber dans des boucles infinies mais peut générer des faux positifs qui interrompent des flux légitimes. Activez cette option si vous rencontrez fréquemment de telles interruptions.
  - **Par défaut :** `false`

- **`model.skipStartupContext`** (boolean):
  - **Description :** Ne pas envoyer le contexte initial de l'espace de travail (résumé de l'environnement et accusé de réception) au début de chaque session. Activez cette option si vous préférez fournir le contexte manuellement ou si vous souhaitez économiser des tokens au démarrage.
  - **Par défaut :** `false`

- **`model.enableOpenAILogging`** (boolean):
  - **Description :** Active la journalisation des appels à l’API OpenAI à des fins de débogage et d’analyse. Si activé, les requêtes et réponses sont enregistrées dans des fichiers JSON.
  - **Par défaut :** `false`

- **`model.openAILoggingDir`** (string):
  - **Description :** Chemin personnalisé vers le répertoire des journaux de l’API OpenAI. S’il n’est pas spécifié, le chemin par défaut est `logs/openai` dans le répertoire courant. Supporte les chemins absolus, relatifs (résolus depuis le répertoire courant), ainsi que l’expansion `~` (répertoire personnel).
  - **Par défaut :** `undefined`
  - **Exemples :**
    - `"~/qwen-logs"` – Enregistre les logs dans le dossier `~/qwen-logs`
    - `"./custom-logs"` – Enregistre les logs dans `./custom-logs` relatif au répertoire courant
    - `"/tmp/openai-logs"` – Enregistre les logs dans le chemin absolu `/tmp/openai-logs`

#### `context`

- **`context.fileName`** (string ou tableau de strings) :
  - **Description :** Le nom du ou des fichiers de contexte.
  - **Default :** `undefined`

- **`context.importFormat`** (string) :
  - **Description :** Le format à utiliser lors de l'import de la mémoire.
  - **Default :** `undefined`

- **`context.discoveryMaxDirs`** (number) :
  - **Description :** Nombre maximal de répertoires à explorer pour trouver la mémoire.
  - **Default :** `200`

- **`context.includeDirectories`** (array) :
  - **Description :** Répertoires supplémentaires à inclure dans le contexte de l'espace de travail. Les répertoires manquants seront ignorés avec un avertissement.
  - **Default :** `[]`

- **`context.loadFromIncludeDirectories`** (boolean) :
  - **Description :** Contrôle le comportement de la commande `/memory refresh`. Si défini sur `true`, les fichiers `QWEN.md` doivent être chargés depuis tous les répertoires ajoutés. Si défini sur `false`, seuls les fichiers `QWEN.md` du répertoire courant doivent être chargés.
  - **Default :** `false`

- **`context.fileFiltering.respectGitIgnore`** (boolean) :
  - **Description :** Respecter les fichiers `.gitignore` lors de la recherche.
  - **Default :** `true`

- **`context.fileFiltering.respectQwenIgnore`** (boolean) :
  - **Description :** Respecter les fichiers `.qwenignore` lors de la recherche.
  - **Default :** `true`

- **`context.fileFiltering.enableRecursiveFileSearch`** (boolean) :
  - **Description :** Activer ou non la recherche récursive des noms de fichiers sous l’arborescence actuelle lors de la complétion des préfixes `@` dans le prompt.
  - **Default :** `true`

#### `tools`

- **`tools.sandbox`** (boolean ou string) :
  - **Description :** Environnement d'exécution sandboxé (peut être un booléen ou une chaîne de caractères représentant un chemin).
  - **Par défaut :** `undefined`

- **`tools.shell.enableInteractiveShell`** (boolean) :

  Utilise `node-pty` pour une expérience de shell interactive. Le fallback vers `child_process` reste applicable. Valeur par défaut : `false`.

- **`tools.core`** (tableau de strings) :
  - **Description :** Peut être utilisé pour restreindre l'ensemble des outils intégrés [via une liste autorisée](./enterprise.md#restricting-tool-access). Voir [Outils intégrés](../core/tools-api.md#built-in-tools) pour la liste complète. La logique de correspondance est identique à celle de `tools.allowed`.
  - **Par défaut :** `undefined`

- **`tools.exclude`** (tableau de strings) :
  - **Description :** Noms des outils à exclure lors de la découverte.
  - **Par défaut :** `undefined`

- **`tools.allowed`** (tableau de strings) :
  - **Description :** Liste des noms d’outils qui contourneront la boîte de dialogue de confirmation. Utile pour les outils fiables et fréquemment utilisés. Par exemple, `["run_shell_command(git)", "run_shell_command(npm test)"]` permet d’exécuter sans confirmation toutes les commandes `git` et `npm test`. Voir [Restrictions sur les commandes Shell](../tools/shell.md#command-restrictions) pour plus de détails sur le préfixe de correspondance, le chaînage des commandes, etc.
  - **Par défaut :** `undefined`

- **`tools.approvalMode`** (string) :
  - **Description :** Définit le mode d’approbation par défaut pour l’utilisation des outils. Les valeurs acceptées sont :
    - `plan` : Analyse uniquement, aucun fichier modifié ni commande exécutée.
    - `default` : Demande une approbation avant modification de fichiers ou exécution de commandes shell.
    - `auto-edit` : Approuve automatiquement les modifications de fichiers.
    - `yolo` : Approuve automatiquement tous les appels aux outils.
  - **Par défaut :** `default`

- **`tools.discoveryCommand`** (string) :
  - **Description :** Commande à exécuter pour découvrir les outils disponibles.
  - **Par défaut :** `undefined`

- **`tools.callCommand`** (string) :
  - **Description :** Définit une commande shell personnalisée pour appeler un outil spécifique découvert via `tools.discoveryCommand`. Cette commande doit respecter les critères suivants :
    - Elle doit prendre en premier argument le nom de la fonction (exactement comme dans la [déclaration de fonction](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)).
    - Elle doit lire les arguments de la fonction au format JSON depuis `stdin`, similaire à [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Elle doit renvoyer la sortie de la fonction au format JSON sur `stdout`, similaire à [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Par défaut :** `undefined`

- **`tools.useRipgrep`** (boolean) :
  - **Description :** Utiliser ripgrep pour la recherche dans le contenu des fichiers au lieu de l'implémentation par défaut. Offre de meilleures performances.
  - **Par défaut :** `true`

- **`tools.useBuiltinRipgrep`** (boolean) :
  - **Description :** Utiliser le binaire ripgrep fourni avec l'application. Si défini à `false`, la commande système `rg` sera utilisée à la place. Ce paramètre n’a d’effet que si `tools.useRipgrep` est activé (`true`).
  - **Par défaut :** `true`

- **`tools.enableToolOutputTruncation`** (boolean) :
  - **Description :** Activer la troncature des grandes sorties d’outils.
  - **Par défaut :** `true`
  - **Redémarrage requis :** Oui

- **`tools.truncateToolOutputThreshold`** (nombre) :
  - **Description :** Tronquer la sortie d’un outil si elle dépasse ce nombre de caractères. S’applique aux outils Shell, Grep, Glob, ReadFile et ReadManyFiles.
  - **Par défaut :** `25000`
  - **Redémarrage requis :** Oui

- **`tools.truncateToolOutputLines`** (nombre) :
  - **Description :** Nombre maximum de lignes ou entrées conservées lors de la troncature de la sortie d’un outil. S’applique aux outils Shell, Grep, Glob, ReadFile et ReadManyFiles.
  - **Par défaut :** `1000`
  - **Redémarrage requis :** Oui

#### `mcp`

- **`mcp.serverCommand`** (string) :
  - **Description :** Commande pour démarrer un serveur MCP.
  - **Default :** `undefined`

- **`mcp.allowed`** (tableau de strings) :
  - **Description :** Une liste d'autorisation des serveurs MCP autorisés.
  - **Default :** `undefined`

- **`mcp.excluded`** (tableau de strings) :
  - **Description :** Une liste de refus des serveurs MCP à exclure.
  - **Default :** `undefined`

#### `security`

- **`security.folderTrust.enabled`** (boolean) :
  - **Description :** Paramètre permettant de savoir si la confiance des dossiers est activée.
  - **Default :** `false`

- **`security.auth.selectedType`** (string) :
  - **Description :** Le type d'authentification actuellement sélectionné.
  - **Default :** `undefined`

- **`security.auth.enforcedType`** (string) :
  - **Description :** Le type d'authentification requis (utile pour les entreprises).
  - **Default :** `undefined`

- **`security.auth.useExternal`** (boolean) :
  - **Description :** Indique s'il faut utiliser un flux d'authentification externe.
  - **Default :** `undefined`

#### `advanced`

- **`advanced.autoConfigureMemory`** (boolean) :
  - **Description :** Configure automatiquement les limites de mémoire de Node.js.
  - **Défaut :** `false`

- **`advanced.dnsResolutionOrder`** (string) :
  - **Description :** Ordre de résolution DNS.
  - **Défaut :** `undefined`

- **`advanced.excludedEnvVars`** (tableau de strings) :
  - **Description :** Variables d’environnement à exclure du contexte du projet.
  - **Défaut :** `["DEBUG","DEBUG_MODE"]`

- **`advanced.bugCommand`** (objet) :
  - **Description :** Configuration de la commande de rapport de bug.
  - **Défaut :** `undefined`

- **`advanced.tavilyApiKey`** (string) :
  - **Description :** Clé API pour le service de recherche web Tavily. Utilisée pour activer la fonctionnalité de l’outil `web_search`.
  - **Note :** Il s'agit d'un format de configuration hérité. Pour les utilisateurs Qwen OAuth, le provider DashScope est automatiquement disponible sans aucune configuration. Pour les autres types d'authentification, configurez les providers Tavily ou Google en utilisant le nouveau format de configuration `webSearch`.
  - **Défaut :** `undefined`

#### `mcpServers`

Configure les connexions vers un ou plusieurs serveurs Model-Context Protocol (MCP) pour découvrir et utiliser des outils personnalisés. Qwen Code tente de se connecter à chaque serveur MCP configuré afin de découvrir les outils disponibles. Si plusieurs serveurs MCP exposent un outil portant le même nom, les noms des outils seront préfixés avec l'alias du serveur défini dans la configuration (par exemple, `serverAlias__actualToolName`) afin d'éviter les conflits. Notez que le système peut supprimer certaines propriétés du schéma des définitions d’outils MCP pour des raisons de compatibilité. Au moins un des champs `command`, `url` ou `httpUrl` doit être renseigné. Si plusieurs sont spécifiés, l'ordre de priorité est : `httpUrl`, puis `url`, puis `command`.

- **`mcpServers.<SERVER_NAME>`** (objet) : Les paramètres du serveur identifié par ce nom.
  - `command` (chaîne, optionnel) : La commande à exécuter pour démarrer le serveur MCP via les entrées/sorties standards.
  - `args` (tableau de chaînes, optionnel) : Arguments à passer à la commande.
  - `env` (objet, optionnel) : Variables d’environnement à définir pour le processus du serveur.
  - `cwd` (chaîne, optionnel) : Le répertoire de travail dans lequel démarrer le serveur.
  - `url` (chaîne, optionnel) : L’URL d’un serveur MCP utilisant Server-Sent Events (SSE) pour communiquer.
  - `httpUrl` (chaîne, optionnel) : L’URL d’un serveur MCP utilisant HTTP en streaming pour communiquer.
  - `headers` (objet, optionnel) : Une map des en-têtes HTTP à envoyer avec les requêtes vers `url` ou `httpUrl`.
  - `timeout` (nombre, optionnel) : Délai d’expiration en millisecondes pour les requêtes vers ce serveur MCP.
  - `trust` (booléen, optionnel) : Faire confiance à ce serveur et ignorer toutes les confirmations d’appel d’outils.
  - `description` (chaîne, optionnel) : Une brève description du serveur, pouvant être utilisée à des fins d'affichage.
  - `includeTools` (tableau de chaînes, optionnel) : Liste des noms d’outils à inclure depuis ce serveur MCP. Lorsque cette liste est spécifiée, seuls les outils listés ici seront accessibles depuis ce serveur (comportement de type allowlist). Si non spécifié, tous les outils du serveur sont activés par défaut.
  - `excludeTools` (tableau de chaînes, optionnel) : Liste des noms d’outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas accessibles au modèle, même s'ils sont exposés par le serveur. **Remarque :** `excludeTools` prime sur `includeTools` — si un outil figure dans les deux listes, il sera exclu.

#### `telemetry`

Configure la collecte de logs et de métriques pour Qwen Code. Pour plus d'informations, voir [Telemetry](../telemetry.md).

- **Propriétés :**
  - **`enabled`** (boolean) : Indique si la télémétrie est activée ou non.
  - **`target`** (string) : La destination des données de télémétrie collectées. Les valeurs supportées sont `local` et `gcp`.
  - **`otlpEndpoint`** (string) : L'endpoint de l'OTLP Exporter.
  - **`otlpProtocol`** (string) : Le protocole utilisé par l'OTLP Exporter (`grpc` ou `http`).
  - **`logPrompts`** (boolean) : Indique s'il faut inclure le contenu des prompts utilisateur dans les logs.
  - **`outfile`** (string) : Le fichier dans lequel écrire les données de télémétrie lorsque `target` est `local`.
  - **`useCollector`** (boolean) : Indique s'il faut utiliser un collecteur OTLP externe.

### Exemple de `settings.json`

Voici un exemple de fichier `settings.json` avec la structure imbriquée, introduite depuis la version v0.3.0 :

```json
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
      "You forget a thousand things every day. Make sure this is one of ’em",
      "Connecting to AGI"
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

## Historique du Shell

Le CLI conserve un historique des commandes shell que vous exécutez. Pour éviter les conflits entre différents projets, cet historique est stocké dans un répertoire spécifique au projet, situé dans le dossier home de votre utilisateur.

- **Emplacement :** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` est un identifiant unique généré à partir du chemin racine de votre projet.
  - L'historique est enregistré dans un fichier nommé `shell_history`.

## Variables d'environnement et fichiers `.env`

Les variables d'environnement sont une méthode courante pour configurer les applications, en particulier pour les informations sensibles comme les clés API ou les paramètres qui peuvent varier selon les environnements. Pour la configuration de l'authentification, consultez la [documentation sur l'authentification](./authentication.md) qui couvre toutes les méthodes disponibles.

Le CLI charge automatiquement les variables d’environnement depuis un fichier `.env`. L’ordre de chargement est le suivant :

1. Fichier `.env` dans le répertoire courant.
2. Si non trouvé, il remonte dans les répertoires parents jusqu’à trouver un fichier `.env`, ou atteindre la racine du projet (identifiée par un dossier `.git`) ou le répertoire utilisateur.
3. Si toujours introuvable, il cherche `~/.env` (dans le répertoire utilisateur).

**Exclusion de variables d’environnement :** Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont exclues automatiquement des fichiers `.env` du projet afin d’éviter tout conflit avec le comportement du CLI. Les variables provenant des fichiers `.qwen/.env` ne sont jamais exclues. Vous pouvez personnaliser ce comportement via le paramètre `advanced.excludedEnvVars` dans votre fichier `settings.json`.

- **`OPENAI_API_KEY`** :
  - Une des nombreuses [méthodes d’authentification](./authentication.md) disponibles.
  - Définissez-la dans votre profil shell (ex. `~/.bashrc`, `~/.zshrc`) ou dans un fichier `.env`.
- **`OPENAI_BASE_URL`** :
  - Une des nombreuses [méthodes d’authentification](./authentication.md) disponibles.
  - Définissez-la dans votre profil shell (ex. `~/.bashrc`, `~/.zshrc`) ou dans un fichier `.env`.
- **`OPENAI_MODEL`** :
  - Spécifie le modèle OPENAI à utiliser par défaut.
  - Remplace le modèle codé en dur.
  - Exemple : `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_TELEMETRY_ENABLED`** :
  - Définir à `true` ou `1` active la télémétrie. Toute autre valeur la désactive.
  - Remplace le paramètre `telemetry.enabled`.
- **`GEMINI_TELEMETRY_TARGET`** :
  - Définit la cible de télémétrie (`local` ou `gcp`).
  - Remplace le paramètre `telemetry.target`.
- **`GEMINI_TELEMETRY_OTLP_ENDPOINT`** :
  - Définit l’endpoint OTLP utilisé pour la télémétrie.
  - Remplace le paramètre `telemetry.otlpEndpoint`.
- **`GEMINI_TELEMETRY_OTLP_PROTOCOL`** :
  - Définit le protocole OTLP (`grpc` ou `http`).
  - Remplace le paramètre `telemetry.otlpProtocol`.
- **`GEMINI_TELEMETRY_LOG_PROMPTS`** :
  - Définir à `true` ou `1` active/désactive la journalisation des prompts utilisateur. Toute autre valeur la désactive.
  - Remplace le paramètre `telemetry.logPrompts`.
- **`GEMINI_TELEMETRY_OUTFILE`** :
  - Définit le chemin du fichier où écrire les données de télémétrie lorsque la cible est `local`.
  - Remplace le paramètre `telemetry.outfile`.
- **`GEMINI_TELEMETRY_USE_COLLECTOR`** :
  - Définir à `true` ou `1` active/désactive l'utilisation d’un collecteur externe OTLP. Toute autre valeur la désactive.
  - Remplace le paramètre `telemetry.useCollector`.
- **`GEMINI_SANDBOX`** :
  - Alternative au paramètre `sandbox` dans `settings.json`.
  - Accepte `true`, `false`, `docker`, `podman`, ou une commande personnalisée sous forme de chaîne.
- **`SEATBELT_PROFILE`** (spécifique à macOS) :
  - Change le profil Seatbelt (`sandbox-exec`) sur macOS.
  - `permissive-open` : (Par défaut) Restreint les écritures au dossier du projet (et quelques autres, voir `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) mais autorise les autres opérations.
  - `strict` : Utilise un profil strict qui refuse les opérations par défaut.
  - `<profile_name>` : Utilise un profil personnalisé. Pour définir un tel profil, créez un fichier nommé `sandbox-macos-<profile_name>.sb` dans le répertoire `.qwen/` de votre projet (par exemple `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` ou `DEBUG_MODE`** (souvent utilisées par les bibliothèques sous-jacentes ou le CLI lui-même) :
  - Définir à `true` ou `1` active la journalisation détaillée, utile pour le débogage.
  - **Remarque :** Ces variables sont automatiquement exclues des fichiers `.env` du projet afin d’éviter tout conflit avec le comportement du CLI. Utilisez plutôt les fichiers `.qwen/.env` si vous devez spécifiquement activer ces options pour Qwen Code.
- **`NO_COLOR`** :
  - Définir n’importe quelle valeur désactive toute sortie colorée dans le CLI.
- **`CLI_TITLE`** :
  - Permet de personnaliser le titre affiché dans le CLI.
- **`TAVILY_API_KEY`** :
  - Votre clé API pour le service de recherche web Tavily.
  - Nécessaire pour activer la fonctionnalité de l’outil `web_search`.
  - **Remarque :** Pour les utilisateurs Qwen OAuth, le fournisseur DashScope est automatiquement disponible sans configuration supplémentaire. Pour les autres types d’authentification, configurez Tavily ou Google pour activer la recherche web.
  - Exemple : `export TAVILY_API_KEY="tvly-your-api-key-here"`

## Arguments de ligne de commande

Les arguments passés directement lors de l'exécution du CLI peuvent remplacer les autres configurations pour cette session spécifique.

- **`--model <model_name>`** (**`-m <model_name>`**) :
  - Spécifie le modèle Qwen à utiliser pour cette session.
  - Exemple : `npm start -- --model qwen3-coder-plus`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**) :
  - Utilisé pour passer un prompt directement à la commande. Cela invoque Qwen Code en mode non interactif.
  - Pour des exemples de scripts, utilisez le flag `--output-format json` afin d'obtenir une sortie structurée.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**) :
  - Démarre une session interactive avec le prompt fourni comme entrée initiale.
  - Le prompt est traité dans la session interactive, et non avant celle-ci.
  - Ne peut pas être utilisé lorsque l'entrée provient d'un pipe via stdin.
  - Exemple : `qwen -i "explain this code"`
- **`--output-format <format>`** (**`-o <format>`**) :
  - **Description :** Spécifie le format de la sortie CLI en mode non interactif.
  - **Valeurs :**
    - `text` : (Par défaut) Sortie standard lisible par un humain.
    - `json` : Sortie JSON lisible par une machine émise à la fin de l'exécution.
    - `stream-json` : Messages JSON diffusés au fur et à mesure de leur apparition pendant l'exécution.
  - **Remarque :** Pour une sortie structurée et l'utilisation dans des scripts, utilisez le flag `--output-format json` ou `--output-format stream-json`. Voir [Mode Headless](../features/headless.md) pour plus d'informations.
- **`--input-format <format>`** :
  - **Description :** Spécifie le format consommé depuis l'entrée standard.
  - **Valeurs :**
    - `text` : (Par défaut) Entrée texte standard provenant de stdin ou des arguments de ligne de commande.
    - `stream-json` : Protocole de messages JSON via stdin pour une communication bidirectionnelle.
  - **Condition requise :** L'utilisation de `--input-format stream-json` nécessite que `--output-format stream-json` soit également défini.
  - **Remarque :** En utilisant `stream-json`, stdin est réservé aux messages du protocole. Voir [Mode Headless](../features/headless.md) pour plus d'informations.
- **`--include-partial-messages`** :
  - **Description :** Inclut les messages partiels de l’assistant lors de l’utilisation du format de sortie `stream-json`. Si activé, émet des événements de flux (message_start, content_block_delta, etc.) au fur et à mesure de leur apparition pendant le streaming.
  - **Par défaut :** `false`
  - **Condition requise :** Nécessite que `--output-format stream-json` soit défini.
  - **Remarque :** Voir [Mode Headless](../features/headless.md) pour plus d'informations sur les événements de flux.
- **`--sandbox`** (**`-s`**) :
  - Active le mode sandbox pour cette session.
- **`--sandbox-image`** :
  - Définit l'URI de l'image sandbox.
- **`--debug`** (**`-d`**) :
  - Active le mode debug pour cette session, fournissant une sortie plus verbeuse.
- **`--all-files`** (**`-a`**) :
  - Si défini, inclut récursivement tous les fichiers du répertoire courant comme contexte pour le prompt.
- **`--help`** (ou **`-h`**) :
  - Affiche les informations d'aide concernant les arguments de ligne de commande.
- **`--show-memory-usage`** :
  - Affiche l'utilisation actuelle de la mémoire.
- **`--yolo`** :
  - Active le mode YOLO, qui approuve automatiquement tous les appels d'outils.
- **`--approval-mode <mode>`** :
  - Définit le mode d'approbation pour les appels d'outils. Modes pris en charge :
    - `plan` : Analyse uniquement — ne modifie pas les fichiers ni n’exécute de commandes.
    - `default` : Demande une approbation pour les modifications de fichiers ou les commandes shell (comportement par défaut).
    - `auto-edit` : Approuve automatiquement les outils d'édition (edit, write_file), tout en demandant une validation pour les autres.
    - `yolo` : Approuve automatiquement tous les appels d'outils (équivalent à `--yolo`).
  - Ne peut pas être utilisé conjointement avec `--yolo`. Utilisez plutôt `--approval-mode=yolo` pour adopter la nouvelle approche unifiée.
  - Exemple : `qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`** :
  - Liste séparée par des virgules des noms d'outils qui contourneront la boîte de dialogue de confirmation.
  - Exemple : `qwen --allowed-tools "Shell(git status)"`
- **`--telemetry`** :
  - Active la [télémétrie](../telemetry.md).
- **`--telemetry-target`** :
  - Définit la cible de télémétrie. Voir [télémétrie](../telemetry.md) pour plus d'informations.
- **`--telemetry-otlp-endpoint`** :
  - Définit le endpoint OTLP pour la télémétrie. Voir [télémétrie](../telemetry.md) pour plus d'informations.
- **`--telemetry-otlp-protocol`** :
  - Définit le protocole OTLP pour la télémétrie (`grpc` ou `http`). Par défaut : `grpc`. Voir [télémétrie](../telemetry.md) pour plus d'informations.
- **`--telemetry-log-prompts`** :
  - Active la journalisation des prompts pour la télémétrie. Voir [télémétrie](../telemetry.md) pour plus d'informations.
- **`--checkpointing`** :
  - Active le [checkpointing](../checkpointing.md).
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**) :
  - Spécifie une liste d'extensions à utiliser pour la session. Si non spécifié, toutes les extensions disponibles sont utilisées.
  - Utilisez le terme spécial `qwen -e none` pour désactiver toutes les extensions.
  - Exemple : `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**) :
  - Liste toutes les extensions disponibles et quitte.
- **`--proxy`** :
  - Définit le proxy pour le CLI.
  - Exemple : `--proxy http://localhost:7890`.
- **`--include-directories <dir1,dir2,...>`** :
  - Inclut des répertoires supplémentaires dans l'espace de travail pour prendre en charge plusieurs répertoires.
  - Peut être spécifié plusieurs fois ou sous forme de valeurs séparées par des virgules.
  - Un maximum de 5 répertoires peuvent être ajoutés.
  - Exemple : `--include-directories /path/to/project1,/path/to/project2` ou `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`** :
  - Active le mode lecteur d’écran, ajustant l’interface utilisateur textuelle (TUI) pour une meilleure compatibilité avec les lecteurs d’écran.
- **`--version`** :
  - Affiche la version du CLI.
- **`--openai-logging`** :
  - Active la journalisation des appels à l'API OpenAI à des fins de débogage et d'analyse. Ce flag remplace le paramètre `enableOpenAILogging` dans `settings.json`.
- **`--openai-logging-dir <directory>`** :
  - Définit un chemin personnalisé pour les journaux de l'API OpenAI. Ce flag remplace le paramètre `openAILoggingDir` dans `settings.json`. Prend en charge les chemins absolus, relatifs ainsi que l’expansion de `~`.
  - **Exemple :** `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`
- **`--tavily-api-key <api_key>`** :
  - Définit la clé API Tavily pour la fonctionnalité de recherche Web pour cette session.
  - Exemple : `qwen --tavily-api-key tvly-your-api-key-here`

## Fichiers de contexte (Contexte hiérarchique d'instructions)

Bien qu'ils ne constituent pas strictement une configuration du _comportement_ de la CLI, les fichiers de contexte (par défaut `QWEN.md`, mais configurable via le paramètre `context.fileName`) sont essentiels pour configurer le _contexte d'instruction_ (également appelé « mémoire »). Cette fonctionnalité puissante vous permet de fournir des instructions spécifiques au projet, des guides de style de codage ou toute information contextuelle pertinente à l'IA, rendant ainsi ses réponses plus adaptées et précises selon vos besoins. La CLI inclut des éléments d'interface utilisateur, comme un indicateur dans le pied de page montrant le nombre de fichiers de contexte chargés, afin de vous tenir informé du contexte actif.

- **Objectif :** Ces fichiers Markdown contiennent des instructions, des directives ou du contexte que vous souhaitez que le modèle Qwen prenne en compte durant vos interactions. Le système est conçu pour gérer ce contexte d'instruction de manière hiérarchique.

### Exemple de contenu d'un fichier contexte (ex. `QWEN.md`)

Voici un exemple conceptuel du contenu d’un fichier contexte à la racine d’un projet TypeScript :

```markdown

# Projet : My Awesome TypeScript Library

## Instructions générales :

- Lors de la génération de nouveau code TypeScript, veuillez suivre le style de codage existant.
- Assurez-vous que toutes les nouvelles fonctions et classes possèdent des commentaires JSDoc.
- Privilégiez les paradigmes de programmation fonctionnelle lorsque cela est pertinent.
- Tout le code doit être compatible avec TypeScript 5.0 et Node.js 20+.

## Style de codage :

- Utilisez 2 espaces pour l’indentation.
- Les noms d’interfaces doivent être préfixés par `I` (ex. : `IUserService`).
- Les membres privés des classes doivent être préfixés par un tiret bas (`_`).
- Utilisez toujours l’égalité stricte (`===` et `!==`).

## Composant spécifique : `src/api/client.ts`

- Ce fichier gère toutes les requêtes API sortantes.
- Lors de l'ajout de nouvelles fonctions d’appel API, assurez-vous qu’elles incluent une gestion d’erreurs robuste ainsi qu’un logging adéquat.
- Utilisez l’utilitaire `fetchWithRetry` déjà présent pour toutes les requêtes GET.
```

## Concernant les dépendances :

- Évitez d'introduire de nouvelles dépendances externes sauf si c'est absolument nécessaire.
- Si une nouvelle dépendance est requise, veuillez indiquer la raison.
```

Cet exemple montre comment vous pouvez fournir un contexte général sur le projet, des conventions de codage spécifiques, ainsi que des notes concernant certains fichiers ou composants en particulier. Plus vos fichiers de contexte sont pertinents et précis, mieux l'IA pourra vous assister. Les fichiers de contexte spécifiques au projet sont fortement encouragés afin d'établir des conventions et un cadre clair.

- **Chargement hiérarchique et priorité :** Le CLI implémente un système de mémoire sophistiqué en chargeant les fichiers de contexte (par ex. `QWEN.md`) depuis plusieurs emplacements. Le contenu des fichiers situés plus bas dans cette liste (plus spécifiques) remplace généralement ou complète celui des fichiers situés plus haut (plus généraux). L'ordre exact de concaténation et le contexte final peuvent être inspectés via la commande `/memory show`. L'ordre typique de chargement est :
  1.  **Fichier de contexte global :**
      - Emplacement : `~/.qwen/<nom-du-fichier-de-contexte-configuré>` (ex. `~/.qwen/QWEN.md` dans votre répertoire utilisateur).
      - Portée : Fournit des instructions par défaut pour tous vos projets.
  2.  **Fichiers de contexte à la racine du projet et dans ses ancêtres :**
      - Emplacement : Le CLI recherche le fichier de contexte configuré dans le répertoire courant, puis dans chaque répertoire parent jusqu'à atteindre soit la racine du projet (identifiée par un dossier `.git`), soit votre répertoire personnel.
      - Portée : Fournit un contexte pertinent pour l’ensemble du projet ou une grande partie de celui-ci.
  3.  **Fichiers de contexte dans les sous-répertoires (contextuels/locaux) :**
      - Emplacement : Le CLI scanne également les sous-réportes _sous_ le répertoire courant (en respectant les motifs ignorés classiques comme `node_modules`, `.git`, etc.) à la recherche du fichier de contexte configuré. La profondeur de ce scan est limitée à 200 répertoires par défaut, mais peut être ajustée avec le paramètre `context.discoveryMaxDirs` dans votre fichier `settings.json`.
      - Portée : Permet d’ajouter des instructions très précises applicables à un composant, module ou section spécifique de votre projet.
- **Concaténation & indication dans l’interface :** Le contenu de tous les fichiers de contexte trouvés est concaténé (avec des séparateurs indiquant leur origine et leur chemin) et inclus dans le prompt système. Le pied de page du CLI affiche le nombre total de fichiers de contexte chargés, donnant ainsi un indicateur visuel rapide du contexte actif.
- **Importation de contenu :** Vous pouvez modulariser vos fichiers de contexte en important d'autres fichiers Markdown grâce à la syntaxe `@chemin/vers/fichier.md`. Pour plus de détails, consultez la [documentation du processeur d'import mémoire](../core/memport.md).
- **Commandes de gestion de la mémoire :**
  - Utilisez `/memory refresh` pour forcer un nouveau scan et recharger tous les fichiers de contexte depuis leurs emplacements configurés. Cela met à jour le contexte instructif utilisé par l'IA.
  - Utilisez `/memory show` pour afficher le contexte instructif combiné actuellement chargé, afin de vérifier la hiérarchie et le contenu pris en compte par l'IA.
  - Consultez la [documentation des commandes](./commands.md#memory) pour obtenir tous les détails sur la commande `/memory` et ses sous-commandes (`show` et `refresh`).

En comprenant et en utilisant ces couches de configuration ainsi que la nature hiérarchique des fichiers de contexte, vous pouvez efficacement gérer la mémoire de l'IA et adapter les réponses de Qwen Code à vos besoins spécifiques et à vos projets.

## Sandboxing

Qwen Code peut exécuter des opérations potentiellement non sécurisées (comme les commandes shell et les modifications de fichiers) dans un environnement sandboxé pour protéger votre système.

Le sandboxing est désactivé par défaut, mais vous pouvez l'activer de plusieurs façons :

- En utilisant le flag `--sandbox` ou `-s`.
- En définissant la variable d'environnement `GEMINI_SANDBOX`.
- Le sandbox est activé par défaut lorsque vous utilisez `--yolo` ou `--approval-mode=yolo`.

Par défaut, il utilise une image Docker pré-construite `qwen-code-sandbox`.

Pour des besoins spécifiques au projet en matière de sandboxing, vous pouvez créer un Dockerfile personnalisé à l'emplacement `.qwen/sandbox.Dockerfile` dans le répertoire racine de votre projet. Ce Dockerfile peut être basé sur l'image de base du sandbox :

```dockerfile
FROM qwen-code-sandbox

# Ajoutez vos dépendances ou configurations personnalisées ici

# Par exemple :

# RUN apt-get update && apt-get install -y some-package
```

# COPY ./my-config /app/my-config
```

Quand `.qwen/sandbox.Dockerfile` existe, tu peux utiliser la variable d'environnement `BUILD_SANDBOX` lors de l'exécution de Qwen Code pour automatiquement construire l'image du sandbox personnalisé :

```bash
BUILD_SANDBOX=1 qwen -s
```

## Statistiques d'utilisation

Pour nous aider à améliorer Qwen Code, nous collectons des statistiques d'utilisation anonymisées. Ces données nous permettent de comprendre comment le CLI est utilisé, d'identifier les problèmes courants et de prioriser les nouvelles fonctionnalités.

**Ce que nous collectons :**

- **Appels d'outils :** Nous enregistrons les noms des outils appelés, qu'ils réussissent ou échouent, ainsi que leur durée d'exécution. Nous ne collectons pas les arguments passés aux outils ni les données retournées par ceux-ci.
- **Requêtes API :** Nous enregistrons le modèle utilisé pour chaque requête, la durée de celle-ci et son statut (réussie ou non). Nous ne collectons pas le contenu des prompts ou des réponses.
- **Informations de session :** Nous collectons des informations sur la configuration du CLI, comme les outils activés et le mode d'approbation.

**Ce que nous NE collectons PAS :**

- **Données personnelles (PII) :** Nous ne collectons aucune information personnelle telle que votre nom, adresse e-mail ou clés API.
- **Contenu des prompts et réponses :** Nous n'enregistrons pas le contenu de vos prompts ou des réponses du modèle.
- **Contenu des fichiers :** Nous n'enregistrons pas le contenu des fichiers lus ou écrits par le CLI.

**Comment désactiver la collecte :**

Vous pouvez désactiver la collecte des statistiques d'utilisation à tout moment en définissant la propriété `usageStatisticsEnabled` à `false` dans la catégorie `privacy` de votre fichier `settings.json` :

```json
{
  "privacy": {
    "usageStatisticsEnabled": false
  }
}
```

Remarque : Lorsque les statistiques d'utilisation sont activées, les événements sont envoyés à un endpoint de collecte RUM d'Alibaba Cloud.