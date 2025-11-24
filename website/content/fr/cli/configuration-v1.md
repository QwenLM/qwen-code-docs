# Configuration de Qwen Code

Qwen Code offre plusieurs façons de configurer son comportement, notamment via des variables d’environnement, des arguments en ligne de commande et des fichiers de configuration. Ce document décrit les différentes méthodes de configuration ainsi que les paramètres disponibles.

## Couches de configuration

La configuration est appliquée selon l’ordre de priorité suivant (les niveaux inférieurs sont écrasés par les niveaux supérieurs) :

1. **Valeurs par défaut :** Valeurs codées en dur dans l’application.
2. **Fichier de valeurs système par défaut :** Paramètres par défaut à l’échelle du système, pouvant être remplacés par d’autres fichiers de configuration.
3. **Fichier de paramètres utilisateur :** Paramètres globaux pour l’utilisateur actuel.
4. **Fichier de paramètres projet :** Paramètres spécifiques au projet.
5. **Fichier de paramètres système :** Paramètres à l’échelle du système qui écrasent tous les autres fichiers de configuration.
6. **Variables d’environnement :** Variables définies au niveau du système ou de la session, potentiellement chargées depuis des fichiers `.env`.
7. **Arguments en ligne de commande :** Valeurs passées lors du lancement de la CLI.

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

En plus d'un fichier de configuration du projet, le répertoire `.qwen` d'un projet peut contenir d'autres fichiers spécifiques au projet liés au fonctionnement de Qwen Code, tels que :

- [Profils de sandbox personnalisés](#sandboxing) (ex. : `.qwen/sandbox-macos-custom.sb`, `.qwen/sandbox.Dockerfile`).

### Paramètres disponibles dans `settings.json` :

- **`contextFileName`** (chaîne de caractères ou tableau de chaînes) :
  - **Description :** Spécifie le nom du fichier de contexte (par exemple, `QWEN.md`, `AGENTS.md`). Peut être un seul nom de fichier ou une liste de noms acceptés.
  - **Par défaut :** `QWEN.md`
  - **Exemple :** `"contextFileName": "AGENTS.md"`

- **`bugCommand`** (objet) :
  - **Description :** Remplace l'URL par défaut utilisée pour la commande `/bug`.
  - **Par défaut :** `"urlTemplate": "https://github.com/QwenLM/qwen-code/issues/new?template=bug_report.yml&title={title}&info={info}"`
  - **Propriétés :**
    - **`urlTemplate`** (chaîne de caractères) : Une URL pouvant contenir les espaces réservés `{title}` et `{info}`.
  - **Exemple :**
    ```json
    "bugCommand": {
      "urlTemplate": "https://bug.example.com/new?title={title}&info={info}"
    }
    ```

- **`fileFiltering`** (objet) :
  - **Description :** Contrôle le comportement du filtrage des fichiers compatible avec Git pour les commandes @ et les outils de découverte de fichiers.
  - **Par défaut :** `"respectGitIgnore": true, "enableRecursiveFileSearch": true`
  - **Propriétés :**
    - **`respectGitIgnore`** (booléen) : Indique si les motifs définis dans `.gitignore` doivent être respectés lors de la découverte des fichiers. Si activé (`true`), les fichiers ignorés par Git (comme `node_modules/`, `dist/`, `.env`) sont automatiquement exclus des commandes @ et des opérations de listage de fichiers.
    - **`enableRecursiveFileSearch`** (booléen) : Active ou non la recherche récursive des fichiers sous l’arborescence actuelle lorsque vous complétez un préfixe @ dans le prompt.
    - **`disableFuzzySearch`** (booléen) : Lorsqu’il est défini à `true`, désactive la recherche floue (fuzzy search) lors de la recherche de fichiers, ce qui peut améliorer les performances sur les projets comprenant un grand nombre de fichiers.
  - **Exemple :**
    ```json
    "fileFiltering": {
      "respectGitIgnore": true,
      "enableRecursiveFileSearch": false,
      "disableFuzzySearch": true
    }
    ```

### Résolution des problèmes de performance de recherche de fichiers

Si vous rencontrez des problèmes de performance avec la recherche de fichiers (par exemple, avec les complétions `@`), en particulier dans les projets comportant un très grand nombre de fichiers, voici quelques solutions que vous pouvez essayer par ordre de recommandation :

1. **Utiliser `.qwenignore` :** Créez un fichier `.qwenignore` à la racine de votre projet pour exclure les répertoires contenant un grand nombre de fichiers dont vous n'avez pas besoin de référencer (par exemple, les artefacts de build, les logs, `node_modules`). Réduire le nombre total de fichiers indexés est le moyen le plus efficace d'améliorer les performances.

2. **Désactiver la recherche floue :** Si l'exclusion de fichiers ne suffit pas, vous pouvez désactiver la recherche floue en définissant `disableFuzzySearch` à `true` dans votre fichier `settings.json`. Cela utilisera un algorithme de correspondance plus simple et non flou, ce qui peut être plus rapide.

3. **Désactiver la recherche récursive de fichiers :** En dernier recours, vous pouvez désactiver entièrement la recherche récursive de fichiers en définissant `enableRecursiveFileSearch` à `false`. Cette option sera la plus rapide car elle évite un parcours récursif de votre projet. Cependant, cela signifie que vous devrez taper le chemin complet des fichiers lors de l'utilisation des complétions `@`.

- **`coreTools`** (tableau de chaînes de caractères) :
  - **Description :** Permet de spécifier une liste de noms d’outils principaux qui doivent être mis à disposition du modèle. Cela peut servir à restreindre l’ensemble des outils intégrés. Voir [Outils intégrés](../core/tools-api.md#built-in-tools) pour obtenir la liste des outils principaux. Vous pouvez également spécifier des restrictions spécifiques aux commandes pour les outils qui le permettent, comme `ShellTool`. Par exemple, `"coreTools": ["ShellTool(ls -l)"]` autorisera uniquement l’exécution de la commande `ls -l`.
  - **Par défaut :** Tous les outils disponibles sont utilisables par le modèle.
  - **Exemple :** `"coreTools": ["ReadFileTool", "GlobTool", "ShellTool(ls)"]`.

- **`allowedTools`** (tableau de chaînes de caractères) :
  - **Par défaut :** `undefined`
  - **Description :** Liste des noms d’outils qui contourneront la boîte de dialogue de confirmation. Utile pour les outils fiables et fréquemment utilisés. La logique de correspondance est identique à celle de `coreTools`.
  - **Exemple :** `"allowedTools": ["ShellTool(git status)"]`.

- **`excludeTools`** (tableau de chaînes de caractères) :
  - **Description :** Permet de spécifier une liste d’outils principaux à exclure du modèle. Un outil présent à la fois dans `excludeTools` et `coreTools` sera exclu. Vous pouvez également spécifier des restrictions spécifiques aux commandes pour les outils compatibles, comme `ShellTool`. Par exemple, `"excludeTools": ["ShellTool(rm -rf)"]` bloquera la commande `rm -rf`.
  - **Par défaut :** Aucun outil exclu.
  - **Exemple :** `"excludeTools": ["run_shell_command", "findFiles"]`.
  - **Remarque sur la sécurité :** Les restrictions spécifiques aux commandes dans `excludeTools` pour `run_shell_command` reposent sur une simple correspondance de chaînes de caractères et peuvent facilement être contournées. Cette fonctionnalité **n’est pas un mécanisme de sécurité** et ne doit pas être utilisée pour exécuter en toute sécurité du code non fiable. Il est recommandé d’utiliser `coreTools` pour sélectionner explicitement les commandes pouvant être exécutées.

- **`allowMCPServers`** (tableau de chaînes de caractères) :
  - **Description :** Permet de spécifier une liste de noms de serveurs MCP devant être accessibles au modèle. Cela peut servir à limiter l’ensemble des serveurs MCP auxquels se connecter. Notez que cette option sera ignorée si `--allowed-mcp-server-names` est défini.
  - **Par défaut :** Tous les serveurs MCP sont accessibles au modèle.
  - **Exemple :** `"allowMCPServers": ["myPythonServer"]`.
  - **Remarque sur la sécurité :** Cette fonction utilise une simple correspondance de chaînes de caractères sur les noms de serveurs MCP, qui peuvent être modifiés. Si vous êtes administrateur système et souhaitez empêcher les utilisateurs de contourner ce paramètre, envisagez de configurer `mcpServers` au niveau des paramètres système afin que les utilisateurs ne puissent pas configurer leurs propres serveurs MCP. Ce mécanisme ne doit pas être considéré comme une solution de sécurité infaillible.

- **`excludeMCPServers`** (tableau de chaînes de caractères) :
  - **Description :** Permet de spécifier une liste de noms de serveurs MCP à exclure du modèle. Un serveur figurant à la fois dans `excludeMCPServers` et `allowMCPServers` sera exclu. Notez que cette option sera ignorée si `--allowed-mcp-server-names` est défini.
  - **Par défaut :** Aucun serveur MCP exclu.
  - **Exemple :** `"excludeMCPServers": ["myNodeServer"]`.
  - **Remarque sur la sécurité :** Cette fonction utilise une simple correspondance de chaînes de caractères sur les noms de serveurs MCP, qui peuvent être modifiés. Si vous êtes administrateur système et souhaitez empêcher les utilisateurs de contourner ce paramètre, envisagez de configurer `mcpServers` au niveau des paramètres système afin que les utilisateurs ne puissent pas configurer leurs propres serveurs MCP. Ce mécanisme ne doit pas être considéré comme une solution de sécurité infaillible.

- **`autoAccept`** (booléen) :
  - **Description :** Contrôle si l’interface CLI accepte automatiquement et exécute les appels d’outils jugés sûrs (par exemple, les opérations en lecture seule) sans confirmation explicite de l’utilisateur. Si défini sur `true`, l’interface CLI ignorerait la demande de confirmation pour les outils considérés comme sûrs.
  - **Par défaut :** `false`
  - **Exemple :** `"autoAccept": true`

- **`theme`** (chaîne de caractères) :
  - **Description :** Définit le [thème](./themes.md) visuel de Qwen Code.
  - **Par défaut :** `"Default"`
  - **Exemple :** `"theme": "GitHub"`

- **`vimMode`** (booléen) :
  - **Description :** Active ou désactive le mode vim pour l’édition de texte. Une fois activé, la zone de saisie prend en charge les commandes de navigation et d’édition de style vim avec les modes NORMAL et INSERT. Le statut du mode vim s'affiche dans le pied de page et persiste entre les sessions.
  - **Par défaut :** `false`
  - **Exemple :** `"vimMode": true`

- **`sandbox`** (booléen ou chaîne de caractères) :
  - **Description :** Contrôle si et comment utiliser le bac à sable (sandbox) pour l’exécution des outils. Si défini sur `true`, Qwen Code utilise une image Docker prédéfinie `qwen-code-sandbox`. Pour plus d’informations, voir [Bac à sable (Sandboxing)](#sandboxing).
  - **Par défaut :** `false`
  - **Exemple :** `"sandbox": "docker"`

- **`toolDiscoveryCommand`** (chaîne de caractères) :
  - **Description :** **Aligné avec l’interface CLI de Gemini.** Définit une commande shell personnalisée pour découvrir les outils depuis votre projet. La commande shell doit renvoyer sur `stdout` un tableau JSON de [déclarations de fonctions](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations). Les wrappers d’outils sont facultatifs.
  - **Par défaut :** Vide
  - **Exemple :** `"toolDiscoveryCommand": "bin/get_tools"`

- **`toolCallCommand`** (chaîne de caractères) :
  - **Description :** **Aligné avec l’interface CLI de Gemini.** Définit une commande shell personnalisée pour appeler un outil spécifique découvert via `toolDiscoveryCommand`. La commande shell doit respecter les critères suivants :
    - Elle doit prendre le `nom` de la fonction (exactement tel que dans la [déclaration de fonction](https://ai.google.dev/gemini-api/docs/function-calling#function-declarations)) comme premier argument de ligne de commande.
    - Elle doit lire les arguments de la fonction au format JSON depuis `stdin`, de manière similaire à [`functionCall.args`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functioncall).
    - Elle doit retourner la sortie de la fonction au format JSON sur `stdout`, de manière similaire à [`functionResponse.response.content`](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference#functionresponse).
  - **Par défaut :** Vide
  - **Exemple :** `"toolCallCommand": "bin/call_tool"`

- **`mcpServers`** (objet) :
  - **Description :** Configure les connexions vers un ou plusieurs serveurs utilisant le protocole Model-Context Protocol (MCP) pour découvrir et utiliser des outils personnalisés. Qwen Code tente de se connecter à chaque serveur MCP configuré afin de découvrir les outils disponibles. Si plusieurs serveurs MCP exposent un outil portant le même nom, les noms des outils seront préfixés avec l’alias du serveur défini dans la configuration (par exemple, `serverAlias__actualToolName`) afin d’éviter les conflits. Notez que le système peut supprimer certaines propriétés du schéma des définitions d’outils MCP pour des raisons de compatibilité. Au moins l’un des champs `command`, `url` ou `httpUrl` doit être fourni. Si plusieurs sont spécifiés, l’ordre de priorité est `httpUrl`, puis `url`, puis `command`.
  - **Par défaut :** Vide
  - **Propriétés :**
    - **`<SERVER_NAME>`** (objet) : Paramètres du serveur nommé.
      - `command` (chaîne de caractères, optionnel) : Commande à exécuter pour démarrer le serveur MCP via les E/S standards.
      - `args` (tableau de chaînes de caractères, optionnel) : Arguments à passer à la commande.
      - `env` (objet, optionnel) : Variables d’environnement à définir pour le processus du serveur.
      - `cwd` (chaîne de caractères, optionnel) : Répertoire de travail dans lequel démarrer le serveur.
      - `url` (chaîne de caractères, optionnel) : URL d’un serveur MCP utilisant Server-Sent Events (SSE) pour communiquer.
      - `httpUrl` (chaîne de caractères, optionnel) : URL d’un serveur MCP utilisant HTTP streamable pour communiquer.
      - `headers` (objet, optionnel) : Carte des en-têtes HTTP à envoyer avec les requêtes vers `url` ou `httpUrl`.
      - `timeout` (nombre, optionnel) : Délai d’expiration en millisecondes pour les requêtes vers ce serveur MCP.
      - `trust` (booléen, optionnel) : Faire confiance à ce serveur et ignorer toutes les confirmations d’appel d’outils.
      - `description` (chaîne de caractères, optionnel) : Brève description du serveur, pouvant être utilisée à des fins d’affichage.
      - `includeTools` (tableau de chaînes de caractères, optionnel) : Liste des noms d’outils à inclure depuis ce serveur MCP. Lorsque spécifié, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de type liste blanche). Sinon, tous les outils du serveur sont activés par défaut.
      - `excludeTools` (tableau de chaînes de caractères, optionnel) : Liste des noms d’outils à exclure depuis ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s’ils sont exposés par le serveur. **Remarque :** `excludeTools` prime sur `includeTools` – si un outil figure dans les deux listes, il sera exclu.
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
      },
      "mySseServer": {
        "url": "http://localhost:8081/events",
        "headers": {
          "Authorization": "Bearer $MY_SSE_TOKEN"
        },
        "description": "Un exemple de serveur MCP basé sur SSE."
      },
      "myStreamableHttpServer": {
        "httpUrl": "http://localhost:8082/stream",
        "headers": {
          "X-API-Key": "$MY_HTTP_API_KEY"
        },
        "description": "Un exemple de serveur MCP basé sur HTTP streamable."
      }
    }
    ```

- **`checkpointing`** (objet) :
  - **Description :** Configure la fonction de point de sauvegarde, qui permet d’enregistrer et de restaurer les états des conversations et des fichiers. Voir la [documentation sur les points de sauvegarde](../checkpointing.md) pour plus de détails.
  - **Par défaut :** `{"enabled": false}`
  - **Propriétés :**
    - **`enabled`** (booléen) : Si `true`, la commande `/restore` est disponible.

- **`preferredEditor`** (chaîne de caractères) :
  - **Description :** Spécifie l’éditeur préféré à utiliser pour afficher les différences (diffs).
  - **Par défaut :** `vscode`
  - **Exemple :** `"preferredEditor": "vscode"`

- **`telemetry`** (objet) :
  - **Description :** Configure la journalisation et la collecte de métriques pour Qwen Code. Pour plus d’informations, voir [Télémétrie](../telemetry.md).
  - **Par défaut :** `{"enabled": false, "target": "local", "otlpEndpoint": "http://localhost:4317", "logPrompts": true}`
  - **Propriétés :**
    - **`enabled`** (booléen) : Indique si la télémétrie est activée.
    - **`target`** (chaîne de caractères) : Destination des données de télémétrie collectées. Valeurs supportées : `local` et `gcp`.
    - **`otlpEndpoint`** (chaîne de caractères) : Point de terminaison de l’exportateur OTLP.
    - **`logPrompts`** (booléen) : Indique si le contenu des invites utilisateur doit être inclus dans les journaux.
  - **Exemple :**
    ```json
    "telemetry": {
      "enabled": true,
      "target": "local",
      "otlpEndpoint": "http://localhost:16686",
      "logPrompts": false
    }
    ```

- **`usageStatisticsEnabled`** (booléen) :
  - **Description :** Active ou désactive la collecte des statistiques d’utilisation. Voir [Statistiques d’utilisation](#usage-statistics) pour plus d’informations.
  - **Par défaut :** `true`
  - **Exemple :**
    ```json
    "usageStatisticsEnabled": false
    ```

- **`hideTips`** (booléen) :
  - **Description :** Active ou désactive les conseils utiles dans l’interface CLI.
  - **Par défaut :** `false`
  - **Exemple :**
    ```json
    "hideTips": true
    ```

- **`hideBanner`** (booléen) :
  - **Description :** Active ou

### Exemple de `settings.json` :

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
  "skipNextSpeakerCheck": false,
  "skipLoopDetection": false,
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

Les variables d'environnement sont un moyen courant de configurer les applications, en particulier pour les informations sensibles comme les clés API ou les paramètres qui peuvent varier selon les environnements. Pour la configuration de l'authentification, consultez la [documentation sur l'authentification](./authentication.md) qui couvre toutes les méthodes disponibles.

Le CLI charge automatiquement les variables d'environnement depuis un fichier `.env`. L'ordre de chargement est le suivant :

1. Fichier `.env` dans le répertoire de travail actuel.
2. Si non trouvé, il remonte dans les répertoires parents jusqu'à trouver un fichier `.env`, ou atteindre la racine du projet (identifiée par un dossier `.git`) ou le répertoire utilisateur.
3. Si toujours introuvable, il cherche `~/.env` (dans le répertoire utilisateur).

**Exclusion de variables d’environnement :** Certaines variables (comme `DEBUG` et `DEBUG_MODE`) sont automatiquement exclues des fichiers `.env` du projet afin d’éviter tout conflit avec le comportement du CLI. Les variables provenant des fichiers `.qwen/.env` ne sont jamais exclues. Vous pouvez personnaliser ce comportement via le paramètre `excludedProjectEnvVars` dans votre fichier `settings.json`.

- **`OPENAI_API_KEY`** :
  - Une des nombreuses [méthodes d’authentification](./authentication.md) disponibles.
  - Définissez-la dans votre profil shell (par exemple `~/.bashrc`, `~/.zshrc`) ou dans un fichier `.env`.
- **`OPENAI_BASE_URL`** :
  - Une des nombreuses [méthodes d’authentification](./authentication.md) disponibles.
  - Définissez-la dans votre profil shell (par exemple `~/.bashrc`, `~/.zshrc`) ou dans un fichier `.env`.
- **`OPENAI_MODEL`** :
  - Spécifie le modèle OPENAI à utiliser par défaut.
  - Remplace la valeur codée en dur.
  - Exemple : `export OPENAI_MODEL="qwen3-coder-plus"`
- **`GEMINI_SANDBOX`** :
  - Alternative au paramètre `sandbox` dans `settings.json`.
  - Accepte `true`, `false`, `docker`, `podman`, ou une commande personnalisée sous forme de chaîne.
- **`SEATBELT_PROFILE`** (spécifique à macOS) :
  - Change le profil Seatbelt (`sandbox-exec`) sur macOS.
  - `permissive-open` : (Par défaut) Restreint les écritures au dossier du projet (et quelques autres, voir `packages/cli/src/utils/sandbox-macos-permissive-open.sb`) mais autorise les autres opérations.
  - `strict` : Utilise un profil strict qui refuse les opérations par défaut.
  - `<profile_name>` : Utilise un profil personnalisé. Pour définir un profil personnalisé, créez un fichier nommé `sandbox-macos-<profile_name>.sb` dans le répertoire `.qwen/` de votre projet (ex. : `my-project/.qwen/sandbox-macos-custom.sb`).
- **`DEBUG` ou `DEBUG_MODE`** (souvent utilisées par les bibliothèques sous-jacentes ou le CLI lui-même) :
  - Définir à `true` ou `1` active les logs verbeux utiles pour le débogage.
  - **Remarque :** Ces variables sont automatiquement exclues des fichiers `.env` du projet afin d’éviter tout conflit avec le comportement du CLI. Utilisez plutôt les fichiers `.qwen/.env` si vous devez spécifiquement les utiliser pour Qwen Code.
- **`NO_COLOR`** :
  - Définir n’importe quelle valeur désactive toute sortie colorée dans le CLI.
- **`CLI_TITLE`** :
  - Définir une chaîne permet de personnaliser le titre du CLI.
- **`CODE_ASSIST_ENDPOINT`** :
  - Spécifie l’endpoint du serveur d’aide au code.
  - Utile pour le développement et les tests.
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
  - Permet de passer un prompt directement à la commande. Cela invoque Qwen Code en mode non interactif.
- **`--prompt-interactive <your_prompt>`** (**`-i <your_prompt>`**) :
  - Démarre une session interactive avec le prompt fourni comme entrée initiale.
  - Le prompt est traité dans la session interactive, et non avant celle-ci.
  - Ne peut pas être utilisé lorsque l'entrée provient d'un pipe via stdin.
  - Exemple : `qwen -i "explain this code"`
- **`--sandbox`** (**`-s`**) :
  - Active le mode sandbox pour cette session.
- **`--sandbox-image`** :
  - Définit l’URI de l’image sandbox.
- **`--debug`** (**`-d`**) :
  - Active le mode debug pour cette session, fournissant une sortie plus détaillée.
- **`--all-files`** (**`-a`**) :
  - Si activé, inclut récursivement tous les fichiers du répertoire courant comme contexte pour le prompt.
- **`--help`** (ou **`-h`**) :
  - Affiche les informations d’aide concernant les arguments de ligne de commande.
- **`--show-memory-usage`** :
  - Affiche l’utilisation actuelle de la mémoire.
- **`--yolo`** :
  - Active le mode YOLO, qui approuve automatiquement tous les appels d’outils.
- **`--approval-mode <mode>`** :
  - Définit le mode d’approbation pour les appels d’outils. Modes pris en charge :
    - `plan` : Analyse uniquement — ne modifie pas les fichiers ni n’exécute de commandes.
    - `default` : Nécessite une approbation pour les modifications de fichiers ou les commandes shell (comportement par défaut).
    - `auto-edit` : Approuve automatiquement les outils d’édition (edit, write_file), tout en demandant une validation pour les autres.
    - `yolo` : Approuve automatiquement tous les appels d’outils (équivalent à `--yolo`).
  - Ne peut pas être utilisé conjointement avec `--yolo`. Utilisez plutôt `--approval-mode=yolo` pour adopter la nouvelle approche unifiée.
  - Exemple : `qwen --approval-mode auto-edit`
- **`--allowed-tools <tool1,tool2,...>`** :
  - Liste séparée par des virgules des noms d’outils qui contourneront la boîte de dialogue de confirmation.
  - Exemple : `qwen --allowed-tools "ShellTool(git status)"`
- **`--telemetry`** :
  - Active la [télémétrie](../telemetry.md).
- **`--telemetry-target`** :
  - Définit la cible de télémétrie. Voir [télémétrie](../telemetry.md) pour plus d’informations.
- **`--telemetry-otlp-endpoint`** :
  - Définit le endpoint OTLP pour la télémétrie. Voir [télémétrie](../telemetry.md) pour plus d’informations.
- **`--telemetry-otlp-protocol`** :
  - Définit le protocole OTLP pour la télémétrie (`grpc` ou `http`). Par défaut : `grpc`. Voir [télémétrie](../telemetry.md) pour plus d’informations.
- **`--telemetry-log-prompts`** :
  - Active la journalisation des prompts pour la télémétrie. Voir [télémétrie](../telemetry.md) pour plus d’informations.
- **`--checkpointing`** :
  - Active le [checkpointing](../checkpointing.md).
- **`--extensions <extension_name ...>`** (**`-e <extension_name ...>`**) :
  - Spécifie une liste d’extensions à utiliser pour la session. Si non spécifié, toutes les extensions disponibles sont utilisées.
  - Utilisez le terme spécial `qwen -e none` pour désactiver toutes les extensions.
  - Exemple : `qwen -e my-extension -e my-other-extension`
- **`--list-extensions`** (**`-l`**) :
  - Liste toutes les extensions disponibles et quitte.
- **`--proxy`** :
  - Définit le proxy pour le CLI.
  - Exemple : `--proxy http://localhost:7890`.
- **`--include-directories <dir1,dir2,...>`** :
  - Inclut des répertoires supplémentaires dans l’espace de travail pour prendre en charge plusieurs répertoires.
  - Peut être spécifié plusieurs fois ou sous forme de valeurs séparées par des virgules.
  - Maximum 5 répertoires peuvent être ajoutés.
  - Exemple : `--include-directories /path/to/project1,/path/to/project2` ou `--include-directories /path/to/project1 --include-directories /path/to/project2`
- **`--screen-reader`** :
  - Active le mode lecteur d’écran pour l’accessibilité.
- **`--version`** :
  - Affiche la version du CLI.
- **`--openai-logging`** :
  - Active la journalisation des appels API OpenAI à des fins de débogage et d’analyse. Ce flag remplace le paramètre `enableOpenAILogging` dans `settings.json`.
- **`--openai-logging-dir <directory>`** :
  - Définit un chemin personnalisé pour les logs d’appels OpenAI. Ce flag remplace le paramètre `openAILoggingDir` dans `settings.json`. Supporte les chemins absolus, relatifs et l’expansion `~`.
  - **Exemple :** `qwen --openai-logging-dir "~/qwen-logs" --openai-logging`
- **`--tavily-api-key <api_key>`** :
  - Définit la clé API Tavily pour la fonctionnalité de recherche web pour cette session.
  - Exemple : `qwen --tavily-api-key tvly-your-api-key-here`

## Fichiers de contexte (Contexte hiérarchique d'instructions)

Bien qu'ils ne constituent pas strictement une configuration du _comportement_ de la CLI, les fichiers de contexte (par défaut `QWEN.md`, mais configurable via le paramètre `contextFileName`) sont essentiels pour configurer le _contexte d'instruction_ (également appelé « mémoire »). Cette fonctionnalité puissante vous permet de fournir des instructions spécifiques au projet, des guides de style de code, ou toute autre information pertinente à l'IA, rendant ainsi ses réponses plus adaptées et précises par rapport à vos besoins. La CLI inclut des éléments d'interface utilisateur, comme un indicateur dans le pied de page montrant le nombre de fichiers de contexte chargés, afin de vous informer sur le contexte actif.

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

Cet exemple montre comment vous pouvez fournir un contexte général sur le projet, des conventions de codage spécifiques, ainsi que des notes concernant certains fichiers ou composants particuliers. Plus vos fichiers de contexte sont pertinents et précis, mieux l'IA pourra vous assister. Les fichiers de contexte spécifiques au projet sont fortement encouragés afin d'établir des conventions et un cadre clair.

- **Chargement hiérarchique et priorité :** Le CLI implémente un système de mémoire hiérarchique sophistiqué en chargeant les fichiers de contexte (par exemple `QWEN.md`) depuis plusieurs emplacements. Le contenu des fichiers situés plus bas dans cette liste (plus spécifique) remplace généralement ou complète celui des fichiers situés plus haut (plus général). L'ordre exact de concaténation et le contexte final peuvent être inspectés à l’aide de la commande `/memory show`. L’ordre typique de chargement est le suivant :
  1. **Fichier de contexte global :**
     - Emplacement : `~/.qwen/<contextFileName>` (ex. : `~/.qwen/QWEN.md` dans votre répertoire utilisateur).
     - Portée : Fournit des instructions par défaut pour tous vos projets.
  2. **Fichiers de contexte racine du projet et ses ancêtres :**
     - Emplacement : Le CLI recherche le fichier de contexte configuré dans le répertoire courant, puis dans chaque répertoire parent jusqu’à atteindre soit la racine du projet (identifiée par un dossier `.git`), soit votre répertoire personnel.
     - Portée : Fournit un contexte pertinent pour l’ensemble du projet ou une grande partie de celui-ci.
  3. **Fichiers de contexte des sous-répertoires (contextuels/locaux) :**
     - Emplacement : Le CLI scanne également les sous-répertoires _situés sous_ le répertoire courant (en respectant les motifs ignorés classiques comme `node_modules`, `.git`, etc.) à la recherche du fichier de contexte configuré. Par défaut, cette recherche est limitée à 200 répertoires, mais elle peut être ajustée via le champ `memoryDiscoveryMaxDirs` dans votre fichier `settings.json`.
     - Portée : Permet d’ajouter des instructions très spécifiques liées à un composant, module ou section particulière de votre projet.
- **Concaténation & indication dans l’interface :** Le contenu de tous les fichiers de contexte trouvés est concaténé (avec des séparateurs indiquant leur origine et leur chemin) et inclus dans le prompt système. Le pied de page du CLI affiche le nombre total de fichiers de contexte chargés, donnant ainsi un indicateur visuel rapide du contexte actif.
- **Importation de contenu :** Vous pouvez modulariser vos fichiers de contexte en important d'autres fichiers Markdown grâce à la syntaxe `@chemin/vers/fichier.md`. Pour plus de détails, consultez la [documentation du processeur d'import mémoire](../core/memport.md).
- **Commandes de gestion de la mémoire :**
  - Utilisez `/memory refresh` pour forcer un nouveau scan et recharger tous les fichiers de contexte depuis leurs emplacements configurés. Cela met à jour le contexte instructif utilisé par l’IA.
  - Utilisez `/memory show` pour afficher le contexte instructif combiné actuellement chargé, ce qui vous permet de vérifier la hiérarchie et le contenu pris en compte par l’IA.
  - Consultez la [documentation des commandes](./commands.md#memory) pour obtenir tous les détails sur la commande `/memory` et ses sous-commandes (`show` et `refresh`).

En comprenant et en utilisant ces couches de configuration ainsi que la nature hiérarchique des fichiers de contexte, vous pouvez efficacement gérer la mémoire de l’IA et adapter les réponses de Qwen Code à vos besoins spécifiques et à vos projets.

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
- **Requêtes API :** Nous enregistrons le modèle utilisé pour chaque requête, la durée de celle-ci et son statut (réussite ou échec). Nous ne collectons pas le contenu des prompts ou des réponses.
- **Informations de session :** Nous collectons des informations sur la configuration du CLI, comme les outils activés et le mode d'approbation.

**Ce que nous ne collectons PAS :**

- **Données personnelles (PII) :** Nous ne collectons aucune information personnelle, comme votre nom, adresse e-mail ou clés API.
- **Contenu des prompts et réponses :** Nous n'enregistrons pas le contenu de vos prompts ou des réponses du modèle.
- **Contenu des fichiers :** Nous n'enregistrons pas le contenu des fichiers lus ou écrits par le CLI.

**Comment désactiver la collecte :**

Vous pouvez désactiver la collecte des statistiques d'utilisation à tout moment en définissant la propriété `usageStatisticsEnabled` à `false` dans votre fichier `settings.json` :

```json
{
  "usageStatisticsEnabled": false
}
```

Remarque : Lorsque les statistiques d'utilisation sont activées, les événements sont envoyés à un endpoint de collecte Alibaba Cloud RUM.

- **`enableWelcomeBack`** (booléen) :
  - **Description :** Affiche une boîte de dialogue de bienvenue lors du retour à un projet avec un historique de conversation.
  - **Par défaut :** `true`
  - **Catégorie :** UI
  - **Redémarrage requis :** Non
  - **Exemple :** `"enableWelcomeBack": false`
  - **Détails :** Si activé, Qwen Code détecte automatiquement si vous revenez à un projet contenant un résumé généré précédemment (`/.qwen/PROJECT_SUMMARY.md`) et affiche une boîte de dialogue vous proposant de continuer la conversation précédente ou d'en commencer une nouvelle. Cette fonctionnalité s'intègre à la commande `/chat summary` et à la boîte de dialogue de confirmation de fermeture. Consultez la [documentation Welcome Back](./welcome-back.md) pour plus de détails.