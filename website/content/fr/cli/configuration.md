# Configuration de Qwen Code

Qwen Code offre plusieurs façons de configurer son comportement, notamment via des variables d'environnement, des arguments en ligne de commande et des fichiers de configuration. Ce document décrit les différentes méthodes de configuration ainsi que les paramètres disponibles.

## Couches de configuration

La configuration est appliquée selon l'ordre de priorité suivant (les numéros inférieurs sont écrasés par les numéros supérieurs) :

1.  **Valeurs par défaut :** Valeurs codées en dur dans l'application.
2.  **Fichier de configuration utilisateur :** Paramètres globaux pour l'utilisateur courant.
3.  **Fichier de configuration projet :** Paramètres spécifiques au projet.
4.  **Fichier de configuration système :** Paramètres applicables à l'ensemble du système.
5.  **Variables d'environnement :** Variables globales au système ou spécifiques à une session, pouvant être chargées depuis des fichiers `.env`.
6.  **Arguments en ligne de commande :** Valeurs passées lors du lancement de la CLI.

## Fichiers de configuration

Qwen Code utilise des fichiers `settings.json` pour la configuration persistante. Il existe trois emplacements possibles pour ces fichiers :

- **Fichier de configuration utilisateur :**
  - **Emplacement :** `~/.qwen/settings.json` (où `~` représente votre répertoire personnel).
  - **Portée :** S'applique à toutes les sessions Qwen Code de l'utilisateur courant.
- **Fichier de configuration projet :**
  - **Emplacement :** `.qwen/settings.json` à la racine de votre projet.
  - **Portée :** S'applique uniquement lorsque Qwen Code est exécuté depuis ce projet spécifique. Les paramètres du projet prennent le pas sur ceux de l'utilisateur.
- **Fichier de configuration système :**
  - **Emplacement :** `/etc/gemini-cli/settings.json` (Linux), `C:\ProgramData\gemini-cli\settings.json` (Windows) ou `/Library/Application Support/GeminiCli/settings.json` (macOS). Ce chemin peut être modifié via la variable d’environnement `GEMINI_CLI_SYSTEM_SETTINGS_PATH`.
  - **Portée :** S'applique à toutes les sessions Qwen Code sur le système, pour tous les utilisateurs. Les paramètres système ont priorité sur les paramètres utilisateur et projet. Peut être utile aux administrateurs système dans un environnement d'entreprise pour contrôler les configurations Qwen Code des utilisateurs.

**Remarque sur les variables d’environnement dans les fichiers de configuration :** Les valeurs de type chaîne dans vos fichiers `settings.json` peuvent référencer des variables d’environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`. Ces variables seront automatiquement résolues au chargement des paramètres. Par exemple, si vous avez une variable d’environnement `MY_API_TOKEN`, vous pouvez l’utiliser dans `settings.json` comme ceci : `"apiKey": "$MY_API_TOKEN"`.

### Le répertoire `.qwen` dans votre projet

En plus d'un fichier de configuration du projet, le répertoire `.qwen` d'un projet peut contenir d'autres fichiers spécifiques au projet liés au fonctionnement de Qwen Code, tels que :

- [Profils de sandbox personnalisés](#sandboxing) (ex. : `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

### Paramètres disponibles dans `settings.json` :

- **`contextFileName`** (string ou tableau de strings) :
  - **Description :** Spécifie le nom du fichier de contexte (ex. `QWEN.md`, `AGENTS.md`). Peut être un seul nom de fichier ou une liste de noms acceptés.
  - **Par défaut :** `QWEN.md`
  - **Exemple :** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (objet) :
  - **Description :** Remplace l'URL par défaut pour la commande `/bug`.
  - **Par défaut :** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **Propriétés :**
    - **`urlTemplate`** (string) : Une URL pouvant contenir les placeholders `{title}` et `{info}`.
  - **Exemple :**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (objet) :
  - **Description :** Contrôle le comportement de filtrage des fichiers compatible Git pour les commandes @ et les outils de découverte de fichiers.
  - **Par défaut :** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **Propriétés :**
    - **`respectGitIgnore`** (boolean) : Indique si les patterns de `.gitignore` doivent être respectés lors de la découverte des fichiers. Si `true`, les fichiers ignorés par Git (comme `node_modules/`, `dist/`, `.env`) sont automatiquement exclus des commandes @ et des listages de fichiers.
    - **`enableRecursiveFileSearch`** (boolean) : Indique si la recherche récursive des fichiers doit être activée lors de la complétion des préfixes @ dans le prompt.
  - **Exemple :**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false
    }
    ```

- **`coreTools`** (tableau de strings) :
  - **Description :** Permet de spécifier une liste d'outils intégrés qui doivent être disponibles pour le modèle. Cela peut servir à restreindre les outils intégrés. Voir [Built-in Tools](../core/tools-api.md#built-in-tools) pour la liste des outils. Vous pouvez également spécifier des restrictions par commande pour les outils qui le supportent, comme `ShellTool`. Par exemple, `"coreTools": ["ShellTool(ls -l)"]` n'autorisera que la commande `ls -l`.
  - **Par défaut :** Tous les outils disponibles pour le modèle.
  - **Exemple :** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`.

- **`excludeTools`** (tableau de strings) :
  - **Description :** Permet de spécifier une liste d'outils intégrés à exclure du modèle. Un outil présent dans `excludeTools` et `coreTools` est exclu. Vous pouvez également spécifier des restrictions par commande pour les outils qui le supportent, comme `ShellTool`. Par exemple, `"excludeTools": ["ShellTool(rm -rf)"]` bloquera la commande `rm -rf`.
  - **Par défaut :** Aucun outil exclu.
  - **Exemple :** `"excludeTools": ["run_shell_command", "findFiles"]`.
  - **Note de sécurité :** Les restrictions par commande dans `excludeTools` pour `run_shell_command` reposent sur une simple correspondance de chaînes de caractères et peuvent être facilement contournées. Cette fonctionnalité **n'est pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter du code non fiable. Il est recommandé d'utiliser `coreTools` pour sélectionner explicitement les commandes autorisées.

- **`allowMCPServers`** (tableau de strings) :
  - **Description :** Permet de spécifier une liste de serveurs MCP qui doivent être disponibles pour le modèle. Cela peut servir à restreindre les serveurs MCP auxquels se connecter. Notez que ce paramètre est ignoré si `--allowed-mcp-server-names` est défini.
  - **Par défaut :** Tous les serveurs MCP sont disponibles.
  - **Exemple :** `"allowMCPServers": ["myPythonServer"]`.
  - **Note de sécurité :** Ce paramètre utilise une simple correspondance de chaînes de caractères sur les noms de serveurs MCP, qui peuvent être modifiés. Si vous êtes administrateur système et souhaitez empêcher les utilisateurs de contourner ce paramètre, configurez `mcpServers` au niveau des paramètres système de sorte que l'utilisateur ne puisse pas configurer ses propres serveurs MCP. Ne pas utiliser comme mécanisme de sécurité strict.

- **`excludeMCPServers`** (tableau de strings) :
  - **Description :** Permet de spécifier une liste de serveurs MCP à exclure du modèle. Un serveur présent dans `excludeMCPServers` et `allowMCPServers` est exclu. Notez que ce paramètre est ignoré si `--allowed-mcp-server-names` est défini.
  - **Par défaut :** Aucun serveur MCP exclu.
  - **Exemple :** `"excludeMCPServers": ["myNodeServer"]`.
  - **Note de sécurité :** Ce paramètre utilise une simple correspondance de chaînes de caractères sur les noms de serveurs MCP, qui peuvent être modifiés. Si vous êtes administrateur système et souhaitez empêcher les utilisateurs de contourner ce paramètre, configurez `mcpServers` au niveau des paramètres système de sorte que l'utilisateur ne puisse pas configurer ses propres serveurs MCP. Ne pas utiliser comme mécanisme de sécurité strict.

- **`autoAccept`** (boolean) :
  - **Description :** Contrôle si le CLI accepte automatiquement et exécute les appels d'outils considérés comme sûrs (ex. opérations en lecture seule) sans confirmation explicite de l'utilisateur. Si `true`, le CLI contourne la demande de confirmation pour les outils jugés sûrs.
  - **Par défaut :** `false`
  - **Exemple :** `"autoAccept": true`

- **`theme`** (string) :
  - **Description :** Définit le [thème](./themes.md) visuel de Qwen Code.
  - **Par défaut :** `"Default"`
  - **Exemple :** `"theme": "GitHub"`

- **`vimMode`** (boolean) :
  - **Description :** Active ou désactive le mode vim pour l'édition de texte. Lorsqu'il est activé, la zone de saisie prend en charge les commandes de navigation et d'édition de type vim avec les modes NORMAL et INSERT. Le statut du mode vim est affiché dans le pied de page et persiste entre les sessions.
  - **Par défaut :** `false`
  - **Exemple :** `"vimMode": true`

- **`sandbox`** (boolean ou string) :
  - **Description :** Contrôle si et comment utiliser le sandboxing pour l'exécution des outils. Si `true`, Qwen Code utilise une image Docker pré-construite `qwen-code-sandbox`. Pour plus d'informations, voir [Sandboxing](#sandboxing).
  - **Par défaut :** `false`
  - **Exemple :** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (string) :
  - **Description :** Définit une commande shell personnalisée pour découvrir les outils depuis votre projet. La commande doit retourner sur `stdout` un tableau JSON de [déclarations de fonctions](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations). Les wrappers d'outils sont optionnels.
  - **Par défaut :** Vide
  - **Exemple :** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (string) :
  - **Description :** Définit une commande shell personnalisée pour appeler un outil spécifique découvert via `toolDiscoveryCommand`. La commande doit respecter les critères suivants :
    - Prendre le `name` de la fonction (exactement comme dans la [déclaration de fonction](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) comme premier argument.
    - Lire les arguments de la fonction au format JSON depuis `stdin`, de manière similaire à [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Retourner la sortie de la fonction au format JSON sur `stdout`, de manière similaire à [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Par défaut :** Vide
  - **Exemple :** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (objet) :
  - **Description :** Configure les connexions à un ou plusieurs serveurs Model-Context Protocol (MCP) pour découvrir et utiliser des outils personnalisés. Qwen Code tente de se connecter à chaque serveur MCP configuré pour découvrir les outils disponibles. Si plusieurs serveurs MCP exposent un outil avec le même nom, les noms des outils seront préfixés avec l'alias du serveur défini dans la configuration (ex. `serverAlias__actualToolName`) pour éviter les conflits. Le système peut retirer certaines propriétés de schéma des définitions d'outils MCP pour des raisons de compatibilité.
  - **Par défaut :** Vide
  - **Propriétés :**
    - **`<SERVER_NAME>`** (objet) : Les paramètres du serveur nommé.
      - `command` (string, requis) : La commande à exécuter pour démarrer le serveur MCP.
      - `args` (tableau de strings, optionnel) : Arguments à passer à la commande.
      - `env` (objet, optionnel) : Variables d'environnement à définir pour le processus du serveur.
      - `cwd` (string, optionnel) : Le répertoire de travail dans lequel démarrer le serveur.
      - `timeout` (number, optionnel) : Délai d'attente en millisecondes pour les requêtes vers ce serveur MCP.
      - `trust` (boolean, optionnel) : Faire confiance à ce serveur et contourner toutes les confirmations d'appel d'outils.
      - `includeTools` (tableau de strings, optionnel) : Liste des noms d'outils à inclure depuis ce serveur MCP. Si spécifié, seuls les outils listés ici seront disponibles (comportement en liste blanche). Sinon, tous les outils du serveur sont activés par défaut.
      - `excludeTools` (tableau de strings, optionnel) : Liste des noms d'outils à exclure depuis ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur. **Note :** `excludeTools` a priorité sur `includeTools` – si un outil est dans les deux listes, il sera exclu.
  - **Exemple :**
    ```json
    "mcpServers": {
      "myPythonServer": {
        "command": "python",
        "args": ["mcp_server.py", "--port", "8080"],
        "cwd": "./mcp_tools/python",
        "timeout": 5000,
        "includeTools": ["safe_tool", "file_reader"],
      },
      "myNodeServer": {
        "command": "node",
        "args": ["mcp_server.js"],
        "cwd": "./mcp_tools/node",
        "excludeTools": ["dangerous_tool", "file_deleter"]
      },
      "myDockerServer": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "-e", "API_KEY", "ghcr.io/foo/bar"],
        "env": {
          "API_KEY": "$MY_API_TOKEN"
        }
      }
    }
    ```

- **`checkpointing`** (objet) :
  - **Description :** Configure la fonctionnalité de checkpointing, qui permet de sauvegarder et restaurer l'état des conversations et des fichiers. Voir la [documentation sur le checkpointing](../checkpointing.md) pour plus de détails.
  - **Par défaut :** `{"enabled": false}`
  - **Propriétés :**
    - **`enabled`** (boolean) : Si `true`, la commande `/restore` est disponible.

- **`preferredEditor`** (string) :
  - **Description :** Spécifie l'éditeur préféré à utiliser pour afficher les diffs.
  - **Par défaut :** `vscode`
  - **Exemple :** `"preferredEditor": "vscode"`

- **`telemetry`** (objet) :
  - **Description :** Configure la journalisation et la collecte de métriques pour Qwen Code. Pour plus d'informations, voir [Telemetry](../telemetry.md).
  - **Par défaut :** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **Propriétés :**
    - **`enabled`** (boolean) : Active ou désactive la télémétrie.
    - **`target`** (string) : Destination des données de télémétrie. Valeurs supportées : `local` et `gcp`.
    - **`otlpEndpoint`** (string) : Endpoint de l'exportateur OTLP.
    - **`logPrompts`** (boolean) : Indique si le contenu des prompts utilisateur doit être inclus dans les logs.
  - **Exemple :**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```

- **`usageStatisticsEnabled`** (boolean) :
  - **Description :** Active ou désactive la collecte de statistiques d'utilisation. Voir [Usage Statistics](#usage-statistics) pour plus d'informations.
  - **Par défaut :** `true`
  - **Exemple :**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`** (boolean) :
  - **Description :** Active ou désactive les conseils utiles dans l'interface CLI.
  - **Par défaut :** `false`
  - **Exemple :**
    ```json
    "hideTips": true
    ```

- **`hideBanner`** (boolean) :
  - **Description :** Active ou désactive la bannière de démarrage (logo ASCII) dans l'interface CLI.
  - **Par défaut :** `false`
  - **Exemple :**
    ```json
    "hideBanner": true
    ```

- **`maxSessionTurns`** (number) :
  - **Description :** Définit le nombre maximum de tours dans une session. Si la session dépasse cette limite, le CLI arrête le traitement et démarre une nouvelle conversation.
  - **Par défaut :** `-1` (illimité)
  - **Exemple :**
    ```json
    "maxSessionTurns": 10
    ```

- **`summarizeToolOutput`** (objet) :
  - **Description :** Active ou désactive le résumé de la sortie des outils. Vous pouvez spécifier le budget de tokens pour le résumé via le paramètre `tokenBudget`.
  - Note : Actuellement, seul l'outil `run_shell_command` est supporté.
  - **Par défaut :** `{}` (désactivé par défaut)
  - **Exemple :**
    ```json
    "summarizeToolOutput": {
      "run_shell_command": {
        "tokenBudget": 2000
      }
    }
    ```

- **`excludedProjectEnvVars`** (tableau de strings) :
  - **Description :** Spécifie les variables d'environnement à exclure du chargement depuis les fichiers `.env` du projet. Cela empêche les variables spécifiques au projet (comme `DEBUG=true`) d'interférer avec le comportement du CLI. Les variables des fichiers `.qwen/.env` ne sont jamais exclues.
  - **Par défaut :** `["DEBUG", "DEBUG_MODE"]`
  - **Exemple :**
    ```json
    "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"]
    ```

- **`includeDirectories`** (tableau de strings) :
  - **Description :** Spécifie un tableau de chemins absolus ou relatifs supplémentaires à inclure dans le contexte de l'espace de travail. Cela permet de travailler avec des fichiers situés dans plusieurs répertoires comme s'ils étaient dans un seul. Les chemins peuvent utiliser `~` pour faire référence au répertoire personnel de l'utilisateur. Ce paramètre peut être combiné avec le flag `--include-directories` en ligne de commande.
  - **Par défaut :** `[]`
  - **Exemple :**
    ```json
    "includeDirectories": [

### Exemple `settings.json` :

```json
{
  "theme": "GitHub",
  "sandbox": "docker",
  "toolDiscoveryCommand": "bin/get_tools",
  "toolCallCommand": "bin/call_tool",
  "tavilyApiKey": "$TAVILY_API_KEY",
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
  "usageStatisticsEnabled": true,
  "hideTips": false,
  "hideBanner": false,
  "maxSessionTurns": 10,
  "summarizeToolOutput": {
    "run_shell_command": {
      "tokenBudget": 100
    }
  },
  "excludedProjectEnvVars": ["DEBUG", "DEBUG_MODE", "NODE_ENV"],
  "includeDirectories": ["path/to/dir1", "~/path/to/dir2", "../path/to/dir3"],
  "loadMemoryFromIncludeDirectories": true
}
```

## Historique du Shell

Le CLI conserve un historique des commandes shell que vous exécutez. Pour éviter les conflits entre différents projets, cet historique est stocké dans un répertoire spécifique au projet, situé dans le dossier home de votre utilisateur.

- **Emplacement :** `~/.qwen/tmp/<project_hash>/shell_history`
  - `<project_hash>` est un identifiant unique généré à partir du chemin racine de votre projet.
  - L'historique est enregistré dans un fichier nommé `shell_history`.

## Variables d'environnement et fichiers `.env`

Les variables d'environnement sont un moyen courant de configurer les applications, en particulier pour les informations sensibles comme les clés API ou les paramètres qui peuvent varier selon les environnements.

Le CLI charge automatiquement les variables d'environnement depuis un fichier `.env`. L'ordre de chargement est le suivant :

1. Fichier `.env` dans le répertoire de travail courant.
2. Si non trouvé, il remonte dans les répertoires parents jusqu'à trouver un fichier `.env`, ou atteindre la racine du projet (identifiée par un dossier `.git`) ou le répertoire utilisateur.
3. Si toujours non trouvé, il cherche `~/.env` (dans le répertoire utilisateur).

**Exclusion de variables d'environnement :** Certaines variables d'environnement (comme `DEBUG` et `DEBUG_MODE`) sont automatiquement exclues des fichiers `.env` du projet par défaut afin d'éviter toute interférence avec le comportement du CLI. Les variables provenant des fichiers `.qwen/.env` ne sont jamais exclues. Vous pouvez personnaliser ce comportement en utilisant le paramètre `excludedProjectEnvVars` dans votre fichier `settings.json`.

- **`GEMINI_API_KEY`** (Requis) :
  - Votre clé API pour l'API Gemini.
  - **Essentiel au fonctionnement.** Le CLI ne fonctionnera pas sans cette clé.
  - Définissez-la dans votre profil shell (ex. `~/.bashrc`, `~/.zshrc`) ou dans un fichier `.env`.
- **`GEMINI_MODEL`** :
  - Spécifie le modèle Gemini par défaut à utiliser.
  - Remplace le modèle codé en dur par défaut.
  - Exemple : `export GEMINI_MODEL="gemini-2.5-flash"`
- **`GOOGLE_API_KEY`** :
  - Votre clé API Google Cloud.
  - Requise pour utiliser Vertex AI en mode express.
  - Assurez-vous d'avoir les permissions nécessaires.
  - Exemple : `export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"`.
- **`GOOGLE_CLOUD_PROJECT`** :
  - L'ID de votre projet Google Cloud.
  - Requis pour utiliser Code Assist ou Vertex AI.
  - Si vous utilisez Vertex AI, assurez-vous d'avoir les permissions nécessaires sur ce projet.
  - **Note Cloud Shell :** Lorsque vous exécutez le CLI dans un environnement Cloud Shell, cette variable est définie par défaut sur un projet spécial alloué aux utilisateurs Cloud Shell. Si vous avez défini `GOOGLE_CLOUD_PROJECT` dans votre environnement global dans Cloud Shell, elle sera remplacée par cette valeur par défaut. Pour utiliser un autre projet dans Cloud Shell, vous devez définir `GOOGLE_CLOUD_PROJECT` dans un fichier `.env`.
  - Exemple : `export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_APPLICATION_CREDENTIALS`** (string) :
  - **Description :** Le chemin vers votre fichier JSON de Google Application Credentials.
  - **Exemple :** `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/credentials.json"`
- **`OTLP_GOOGLE_CLOUD_PROJECT`** :
  - L'ID de votre projet Google Cloud pour la télémétrie dans Google Cloud.
  - Exemple : `export OTLP_GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`.
- **`GOOGLE_CLOUD_LOCATION`** :
  - La région de votre projet Google Cloud (ex. us-central1).
  - Requis pour utiliser Vertex AI en mode non express.
  - Exemple : `export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"`.
- **`GEMINI_SANDBOX`** :
  - Alternative au paramètre `sandbox` dans `settings.json`.
  - Accepte `true`, `false`, `docker`, `podman`, ou une commande personnalisée sous forme de chaîne.
- **`SEATBELT_PROFILE`** (spécifique macOS) :
  - Change le profil Seatbelt (`sandbox-exec`) sur macOS.
  - `permissive-open` : (Par défaut) Restreint les écritures au dossier du projet (et quelques autres dossiers, voir `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) mais autorise les autres opérations.
  - `strict` : Utilise un profil strict qui refuse les opérations par défaut.
  - `<profile_name>` : Utilise un profil personnalisé. Pour définir un profil personnalisé, créez un fichier nommé `sandbox-macos-<profile_name>.sb` dans le répertoire `.qwen/` de votre projet (ex. `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` ou `DEBUG_MODE`** (souvent utilisés par les bibliothèques sous-jacentes ou le CLI lui-même) :
  - Définir à `true` ou `1` active la journalisation détaillée, utile pour le débogage.
  - **Note :** Ces variables sont automatiquement exclues des fichiers `.env` du projet par défaut afin d'éviter toute interférence avec le comportement du CLI. Utilisez les fichiers `.qwen/.env` si vous devez les définir spécifiquement pour Qwen Code.
- **`NO_COLOR`** :
  - Définir à n'importe quelle valeur désactive toute sortie colorée dans le CLI.
- **`CLI_TITLE`** :
  - Définir à une chaîne pour personnaliser le titre du CLI.
- **`CODE_ASSIST_ENDPOINT`** :
  - Spécifie l'endpoint du serveur d'assistance au code.
  - Utile pour le développement et les tests.
- **`TAVILY_API_KEY`** :
  - Votre clé API pour le service de recherche web Tavily.
  - Requise pour activer la fonctionnalité de l'outil `web_search`.
  - Si non configurée, l'outil de recherche web sera désactivé et ignoré.
  - Exemple : `export TAVILY_API_KEY="tvly-your-api-key-here"`

## Arguments de ligne de commande

Les arguments passés directement lors de l'exécution du CLI peuvent remplacer les autres configurations pour cette session spécifique.

- **`--model <model_name>`** (**`-m <model_name>`**) :
  - Spécifie le modèle Gemini à utiliser pour cette session.
  - Exemple : `npm start -- --model gemini-1.5-pro-latest`
- **`--prompt <your_prompt>`** (**`-p <your_prompt>`**) :
  - Permet de passer un prompt directement à la commande. Cela invoque Qwen Code en mode non interactif.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**) :
  - Démarre une session interactive avec le prompt fourni comme entrée initiale.
  - Le prompt est traité dans la session interactive, et non avant celle-ci.
  - Ne peut pas être utilisé lorsque l'entrée provient d'un pipe via stdin.
  - Exemple : `qwen -i "explain this code"`
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
  - Définit le mode d'approbation pour les appels d'outils. Modes disponibles :
    - `default` : Demande une approbation pour chaque appel d'outil (comportement par défaut)
    - `auto_edit` : Approuve automatiquement les outils d'édition (replace, write_file) tout en demandant une validation pour les autres
    - `yolo` : Approuve automatiquement tous les appels d'outils (équivalent à `--yolo`)
  - Ne peut pas être utilisé conjointement avec `--yolo`. Utilisez plutôt `--approval-mode=yolo` pour la nouvelle approche unifiée.
  - Exemple : `qwen --approval-mode auto_edit`
- **`--telemetry`** :
  - Active la [télémétrie](../telemetry.md).
- **`--telemetry-target`** :
  - Définit la cible de télémétrie. Voir [télémétrie](../telemetry.md) pour plus d'informations.
- **`--telemetry-otlp-endpoint`** :
  - Définit le endpoint OTLP pour la télémétrie. Voir [télémétrie](../telemetry.md) pour plus d'informations.
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
  - Un maximum de 5 répertoires peut être ajouté.
  - Exemple : `--include-directories /path/to/project1,/path/to/project2` ou `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--version`** :
  - Affiche la version du CLI.
- **`--openai-logging`** :
  - Active la journalisation des appels à l'API OpenAI à des fins de débogage et d'analyse. Cet argument remplace le paramètre `enableOpenAILogging` dans `settings.json`.
- **`--tavily-api-key <api_key>`** :
  - Définit la clé API Tavily pour la fonctionnalité de recherche web pour cette session.
  - Exemple : `qwen --tavily-api-key tvly-your-api-key-here`

## Fichiers de contexte (Contexte hiérarchique d'instructions)

Bien qu'ils ne constituent pas strictement une configuration du _comportement_ de la CLI, les fichiers de contexte (par défaut `QWEN.md`, mais configurable via le paramètre `contextFileName`) sont essentiels pour configurer le _contexte d'instructions_ (également appelé « mémoire »). Cette fonctionnalité puissante vous permet de fournir des instructions spécifiques au projet, des guides de style de codage ou toute information contextuelle pertinente à l'IA, rendant ainsi ses réponses plus adaptées et précises par rapport à vos besoins. La CLI inclut des éléments d'interface utilisateur, comme un indicateur dans le pied de page indiquant le nombre de fichiers de contexte chargés, afin de vous tenir informé du contexte actif.

- **Objectif :** Ces fichiers Markdown contiennent des instructions, des directives ou du contexte que vous souhaitez que le modèle Gemini prenne en compte durant vos interactions. Le système est conçu pour gérer ce contexte d'instructions de manière hiérarchique.

### Exemple de contenu d'un fichier contexte (ex. `QWEN.md`)

Voici un exemple conceptuel du contenu d'un fichier contexte à la racine d'un projet TypeScript :

```markdown

# Projet : My Awesome TypeScript Library

## Instructions générales :

- Lors de la génération de nouveau code TypeScript, veuillez suivre le style de codage existant.
- Assurez-vous que toutes les nouvelles fonctions et classes possèdent des commentaires JSDoc.
- Privilégiez les paradigmes de programmation fonctionnelle lorsque cela est approprié.
- Tout le code doit être compatible avec TypeScript 5.0 et Node.js 20+.

## Style de codage :

- Utilisez 2 espaces pour l'indentation.
- Les noms d'interfaces doivent être préfixés avec `I` (ex. : `IUserService`).
- Les membres privés des classes doivent être préfixés avec un underscore (`_`).
- Utilisez toujours l'égalité stricte (`===` et `!==`).

## Composant spécifique : `src/api/client.ts`

- Ce fichier gère toutes les requêtes API sortantes.
- Lors de l'ajout de nouvelles fonctions d'appel API, assurez-vous qu'elles incluent une gestion d'erreurs robuste et une journalisation.
- Utilisez l'utilitaire `fetchWithRetry` existant pour toutes les requêtes GET.
```

## Concernant les dépendances :

- Évitez d'introduire de nouvelles dépendances externes sauf si c'est absolument nécessaire.
- Si une nouvelle dépendance est requise, veuillez indiquer la raison.
```

Cet exemple montre comment vous pouvez fournir un contexte général sur le projet, des conventions de codage spécifiques, ainsi que des notes concernant certains fichiers ou composants particuliers. Plus vos fichiers de contexte sont pertinents et précis, mieux l'IA pourra vous assister. L'utilisation de fichiers de contexte spécifiques au projet est fortement encouragée afin d'établir clairement les conventions et le contexte.

- **Chargement hiérarchique et priorité :** Le CLI implémente un système de mémoire hiérarchique sophistiqué en chargeant les fichiers de contexte (par exemple `QWEN.md`) depuis plusieurs emplacements. Le contenu des fichiers situés plus bas dans cette liste (plus spécifiques) remplace généralement ou complète celui des fichiers situés plus haut (plus généraux). L'ordre exact de concaténation et le contexte final peuvent être inspectés via la commande `/memory show`. L'ordre typique de chargement est le suivant :
  1.  **Fichier de contexte global :**
      - Emplacement : `~/.qwen/<contextFileName>` (par exemple `~/.qwen/QWEN.md` dans votre répertoire utilisateur).
      - Portée : Fournit des instructions par défaut pour tous vos projets.
  2.  **Fichiers de contexte à la racine du projet et dans les répertoires parents :**
      - Emplacement : Le CLI recherche le fichier de contexte configuré dans le répertoire courant, puis dans chaque répertoire parent jusqu'à atteindre soit la racine du projet (identifiée par un dossier `.git`), soit votre répertoire personnel.
      - Portée : Fournit un contexte pertinent pour l'ensemble du projet ou une grande partie de celui-ci.
  3.  **Fichiers de contexte dans les sous-répertoires (contextuels/locaux) :**
      - Emplacement : Le CLI scanne également les sous-répertoires _situés sous_ le répertoire courant (en respectant les motifs d'exclusion usuels tels que `node_modules`, `.git`, etc.) à la recherche du fichier de contexte configuré. Par défaut, cette recherche est limitée à 200 répertoires, mais ce seuil peut être ajusté via le champ `memoryDiscoveryMaxDirs` dans votre fichier `settings.json`.
      - Portée : Permet d'appliquer des instructions très spécifiques relatives à un composant, module ou section particulière de votre projet.
- **Concaténation & Indication dans l'interface utilisateur :** Le contenu de tous les fichiers de contexte trouvés est concaténé (avec des séparateurs indiquant leur origine et leur chemin) et inclus dans le prompt système. Le pied de page du CLI affiche le nombre total de fichiers de contexte chargés, vous donnant ainsi un indicateur visuel rapide du contexte instructionnel actif.
- **Importation de contenu :** Vous pouvez modulariser vos fichiers de contexte en important d'autres fichiers Markdown en utilisant la syntaxe `@path/to/file.md`. Pour plus de détails, consultez la [documentation du processeur d'import mémoire](../core/memport.md).
- **Commandes de gestion de la mémoire :**
  - Utilisez `/memory refresh` pour forcer un nouveau scan et recharger tous les fichiers de contexte depuis tous les emplacements configurés. Cela met à jour le contexte instructionnel de l'IA.
  - Utilisez `/memory show` pour afficher le contexte instructionnel combiné actuellement chargé, vous permettant ainsi de vérifier la hiérarchie et le contenu utilisé par l'IA.
  - Consultez la [documentation des commandes](./commands.md#memory) pour obtenir tous les détails sur la commande `/memory` et ses sous-commandes (`show` et `refresh`).

En comprenant et en exploitant ces couches de configuration ainsi que la nature hiérarchique des fichiers de contexte, vous pouvez efficacement gérer la mémoire de l'IA et adapter les réponses de Qwen Code à vos besoins et projets spécifiques.

## Sandboxing

Qwen Code peut exécuter des opérations potentiellement non sécurisées (comme des commandes shell et des modifications de fichiers) dans un environnement sandboxé pour protéger votre système.

Le sandboxing est désactivé par défaut, mais vous pouvez l'activer de plusieurs façons :

- En utilisant le flag `--sandbox` ou `-s`.
- En définissant la variable d'environnement `GEMINI_SANDBOX`.
- Le sandbox est activé par défaut lorsque vous utilisez `--yolo` ou `--approval-mode=yolo`.

Par défaut, il utilise une image Docker pré-construite `qwen-code-sandbox`.

Pour des besoins de sandboxing spécifiques à un projet, vous pouvez créer un Dockerfile personnalisé à l'emplacement `.qwen/sandbox.Dockerfile` dans le répertoire racine de votre projet. Ce Dockerfile peut être basé sur l'image de base du sandbox :

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

- **Appels d'outils :** Nous enregistrons les noms des outils appelés, qu'ils réussissent ou échouent, ainsi que leur durée d'exécution. Nous ne collectons pas les arguments passés aux outils ni les données qu'ils retournent.
- **Requêtes API :** Nous enregistrons le modèle utilisé pour chaque requête, la durée de la requête et son succès ou échec. Nous ne collectons pas le contenu des prompts ou des réponses.
- **Informations de session :** Nous collectons des informations sur la configuration du CLI, comme les outils activés et le mode d'approbation.

**Ce que nous ne collectons PAS :**

- **Informations personnelles identifiables (PII) :** Nous ne collectons aucune information personnelle, comme votre nom, votre adresse e-mail ou vos clés API.
- **Contenu des prompts et réponses :** Nous n'enregistrons pas le contenu de vos prompts ou des réponses du modèle.
- **Contenu des fichiers :** Nous n'enregistrons pas le contenu des fichiers lus ou écrits par le CLI.

**Comment désactiver la collecte :**

Vous pouvez désactiver la collecte des statistiques d'utilisation à tout moment en définissant la propriété `usageStatisticsEnabled` sur `false` dans votre fichier `settings.json` :

```json
{
  "usageStatisticsEnabled": false
}
```

Remarque : Lorsque les statistiques d'utilisation sont activées, les événements sont envoyés à un endpoint de collecte Alibaba Cloud RUM.