# Extensions Qwen Code

Les extensions Qwen Code regroupent des prompts, des serveurs MCP, des sous-agents, des skills et des commandes personnalisées dans un format familier et convivial. Grâce aux extensions, vous pouvez étendre les fonctionnalités de Qwen Code et les partager avec d'autres. Elles sont conçues pour être facilement installables et partageables.

Les extensions et plugins de la [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) et du [Claude Code Marketplace](https://claudemarketplaces.com/) peuvent être installés directement dans Qwen Code. Cette compatibilité multiplateforme vous donne accès à un riche écosystème d'extensions et de plugins, élargissant considérablement les capacités de Qwen Code sans obliger les auteurs à maintenir des versions distinctes.

## Gestion des extensions

Nous proposons une suite d'outils de gestion des extensions via les commandes CLI `qwen extensions` et les commandes slash `/extensions` dans l'interface CLI interactive.

### Gestion des extensions à l'exécution (commandes slash)

Vous pouvez gérer les extensions à l'exécution dans l'interface CLI interactive à l'aide des commandes slash `/extensions`. Ces commandes prennent en charge le hot-reloading, ce qui signifie que les modifications sont appliquées immédiatement sans redémarrer l'application.

| Commande                              | Description                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `/extensions` ou `/extensions manage` | Gérer toutes les extensions installées                                       |
| `/extensions install <source>`        | Installer une extension depuis une URL git, un chemin local, un package npm ou un marketplace |
| `/extensions explore [source]`        | Ouvrir la page source des extensions (Gemini ou ClaudeCode) dans votre navigateur |

### Gestion des extensions via la CLI

Vous pouvez également gérer les extensions via les commandes CLI `qwen extensions`. Notez que les modifications effectuées via la CLI seront prises en compte dans les sessions CLI actives après un redémarrage.

### Installation d'une extension

Vous pouvez installer une extension avec `qwen extensions install` depuis plusieurs sources :

#### Depuis le Claude Code Marketplace

Qwen Code prend également en charge les plugins du [Claude Code Marketplace](https://claudemarketplaces.com/). Installez depuis un marketplace et choisissez un plugin :

```bash
qwen extensions install <marketplace-name>
# or
qwen extensions install <marketplace-github-url>
```

Pour installer un plugin spécifique, utilisez le format suivant avec le nom du plugin :

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# or
qwen extensions install <marketplace-github-url>:<plugin-name>
```

Par exemple, pour installer le plugin `prompts.chat` depuis le marketplace [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) :

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Les plugins Claude sont automatiquement convertis au format Qwen Code lors de l'installation :

- `claude-plugin.json` est converti en `qwen-extension.json`
- Les configurations d'agent sont converties au format sous-agent Qwen
- Les configurations de skill sont converties au format skill Qwen
- Les mappages d'outils sont gérés automatiquement

Vous pouvez parcourir rapidement les extensions disponibles sur différents marketplaces avec la commande `/extensions explore` :

```bash
# Open Gemini CLI Extensions marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode
```

Cette commande ouvre le marketplace correspondant dans votre navigateur par défaut, vous permettant de découvrir de nouvelles extensions pour enrichir votre expérience Qwen Code.

> **Compatibilité multiplateforme** : Cela vous permet de tirer parti des riches écosystèmes d'extensions de Gemini CLI et de Claude Code, élargissant considérablement les fonctionnalités disponibles pour les utilisateurs de Qwen Code.

#### Depuis les extensions Gemini CLI

Qwen Code prend entièrement en charge les extensions de la [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/). Installez-les simplement via l'URL git :

```bash
qwen extensions install <gemini-cli-extension-github-url>
# or
qwen extensions install <owner>/<repo>
```

Les extensions Gemini sont automatiquement converties au format Qwen Code lors de l'installation :

- `gemini-extension.json` est converti en `qwen-extension.json`
- Les fichiers de commandes TOML sont automatiquement migrés au format Markdown
- Les serveurs MCP, les fichiers de contexte et les paramètres sont conservés

#### Depuis le registre npm

Qwen Code permet d'installer des extensions depuis des registres npm en utilisant des noms de packages scopés. C'est idéal pour les équipes disposant de registres privés avec une infrastructure d'authentification, de gestion de versions et de publication déjà en place.

```bash
# Install the latest version
qwen extensions install @scope/my-extension

# Install a specific version
qwen extensions install @scope/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

Seuls les packages scopés (`@scope/package-name`) sont pris en charge pour éviter toute ambiguïté avec le format raccourci GitHub `owner/repo`.

La **résolution du registre** suit cette priorité :

1. Flag CLI `--registry` (remplacement explicite)
2. Registre scopé depuis `.npmrc` (ex. `@scope:registry=https://...`)
3. Registre par défaut depuis `.npmrc`
4. Fallback : `https://registry.npmjs.org/`

L'**authentification** est gérée automatiquement via la variable d'environnement `NPM_TOKEN` ou les entrées `_authToken` spécifiques au registre dans votre fichier `.npmrc`.

> **Note :** Les extensions npm doivent inclure un fichier `qwen-extension.json` à la racine du package, en respectant le même format que toute autre extension Qwen Code. Consultez [Extension Releasing](./extension-releasing.md#releasing-through-npm-registry) pour les détails sur l'empaquetage.

#### Depuis un dépôt Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Cela installera l'extension github mcp server.

#### Depuis un chemin local

```bash
qwen extensions install /path/to/your/extension
```

Notez qu'une copie de l'extension installée est créée. Vous devrez donc exécuter `qwen extensions update` pour récupérer les modifications, que l'extension soit définie localement ou hébergée sur GitHub.

### Désinstallation d'une extension

Pour désinstaller, exécutez `qwen extensions uninstall extension-name`. Par exemple, pour l'installation précédente :

```
qwen extensions uninstall qwen-cli-security
```

### Désactivation d'une extension

Par défaut, les extensions sont activées dans tous les workspaces. Vous pouvez désactiver une extension globalement ou pour un workspace spécifique.

Par exemple, `qwen extensions disable extension-name` désactive l'extension au niveau utilisateur, donc partout. `qwen extensions disable extension-name --scope=workspace` ne la désactive que dans le workspace actuel.

### Activation d'une extension

Vous pouvez activer des extensions avec `qwen extensions enable extension-name`. Vous pouvez également activer une extension pour un workspace spécifique en exécutant `qwen extensions enable extension-name --scope=workspace` depuis ce workspace.

Cela est utile si vous avez désactivé une extension au niveau global et souhaitez ne l'activer qu'à certains endroits.

### Mise à jour d'une extension

Pour les extensions installées depuis un chemin local, un dépôt git ou un registre npm, vous pouvez explicitement passer à la dernière version avec `qwen extensions update extension-name`. Pour les extensions npm installées sans version figée (ex. `@scope/pkg`), les mises à jour vérifient le dist-tag `latest`. Pour celles installées avec un dist-tag spécifique (ex. `@scope/pkg@beta`), les mises à jour suivent ce tag. Les extensions épinglées à une version exacte (ex. `@scope/pkg@1.2.0`) sont toujours considérées à jour.

Vous pouvez mettre à jour toutes les extensions avec :

```
qwen extensions update --all
```

## Fonctionnement

Au démarrage, Qwen Code recherche les extensions dans `<home>/.qwen/extensions`

Une extension correspond à un répertoire contenant un fichier `qwen-extension.json`. Par exemple :

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Le fichier `qwen-extension.json` contient la configuration de l'extension. Il suit la structure suivante :

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  },
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key for the service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name` : Le nom de l'extension. Il sert à identifier l'extension de manière unique et à résoudre les conflits lorsque des commandes d'extension portent le même nom que des commandes utilisateur ou projet. Le nom doit être en minuscules ou contenir des chiffres, et utiliser des tirets au lieu d'espaces ou de underscores. C'est ainsi que les utilisateurs feront référence à votre extension dans la CLI. Notez que ce nom doit correspondre au nom du répertoire de l'extension.
- `version` : La version de l'extension.
- `mcpServers` : Un mappage des serveurs MCP à configurer. La clé correspond au nom du serveur et la valeur à sa configuration. Ces serveurs sont chargés au démarrage, tout comme les serveurs MCP configurés dans un [fichier `settings.json`](./cli/configuration.md). Si une extension et un fichier `settings.json` configurent un serveur MCP portant le même nom, la définition du fichier `settings.json` est prioritaire.
  - Notez que toutes les options de configuration des serveurs MCP sont prises en charge, à l'exception de `trust`.
- `channels` : Un mappage d'adaptateurs de canal personnalisés. La clé correspond au type de canal et la valeur contient un `entry` (chemin vers le point d'entrée JS compilé) et un `displayName` optionnel. Le point d'entrée doit exporter un objet `plugin` conforme à l'interface `ChannelPlugin`. Consultez [Channel Plugins](../features/channels/plugins) pour un guide complet.
- `contextFileName` : Le nom du fichier contenant le contexte de l'extension. Il sera utilisé pour charger le contexte depuis le répertoire de l'extension. Si cette propriété n'est pas définie mais qu'un fichier `QWEN.md` est présent dans le répertoire, ce fichier sera chargé.
- `commands` : Le répertoire contenant les commandes personnalisées (par défaut : `commands`). Les commandes sont des fichiers `.md` qui définissent des prompts.
- `skills` : Le répertoire contenant les skills personnalisés (par défaut : `skills`). Les skills sont découverts automatiquement et deviennent disponibles via la commande `/skills`.
- `agents` : Le répertoire contenant les sous-agents personnalisés (par défaut : `agents`). Les sous-agents sont des fichiers `.yaml` ou `.md` qui définissent des assistants IA spécialisés.
- `settings` : Un tableau de paramètres requis par l'extension. Lors de l'installation, les utilisateurs seront invités à fournir des valeurs pour ces paramètres. Les valeurs sont stockées de manière sécurisée et transmises aux serveurs MCP sous forme de variables d'environnement.
  - Chaque paramètre possède les propriétés suivantes :
    - `name` : Nom affiché pour le paramètre
    - `description` : Description de l'utilité de ce paramètre
    - `envVar` : Nom de la variable d'environnement qui sera définie
    - `sensitive` : Booléen indiquant si la valeur doit être masquée (ex. clés API, mots de passe)

### Gestion des paramètres des extensions

Les extensions peuvent nécessiter une configuration via des paramètres (comme des clés API ou des identifiants). Ces paramètres peuvent être gérés avec la commande CLI `qwen extensions settings` :

**Définir la valeur d'un paramètre :**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**Lister tous les paramètres d'une extension :**

```bash
qwen extensions settings list <extension-name>
```

**Afficher les valeurs actuelles (utilisateur et workspace) :**

```bash
qwen extensions settings show <extension-name> <setting-name>
```

**Supprimer la valeur d'un paramètre :**

```bash
qwen extensions settings unset <extension-name> <setting-name> [--scope user|workspace]
```

Les paramètres peuvent être configurés à deux niveaux :

- **Niveau utilisateur** (par défaut) : Les paramètres s'appliquent à tous les projets (`~/.qwen/.env`)
- **Niveau workspace** : Les paramètres s'appliquent uniquement au projet actuel (`.qwen/.env`)

Les paramètres de workspace sont prioritaires sur ceux de l'utilisateur. Les paramètres sensibles sont stockés de manière sécurisée et ne sont jamais affichés en clair.

Au démarrage, Qwen Code charge toutes les extensions et fusionne leurs configurations. En cas de conflit, la configuration du workspace est prioritaire.

### Commandes personnalisées

Les extensions peuvent fournir des [commandes personnalisées](./cli/commands.md#custom-commands) en plaçant des fichiers Markdown dans un sous-répertoire `commands/` au sein du répertoire de l'extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet, et respectent les conventions de nommage standard.

> **Note :** Le format des commandes est passé de TOML à Markdown. Les fichiers TOML sont dépréciés mais restent pris en charge. Vous pouvez migrer les commandes TOML existantes via l'invite de migration automatique qui s'affiche lors de la détection de fichiers TOML.

**Exemple**

Une extension nommée `gcp` avec la structure suivante :

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

Fournirait ces commandes :

- `/deploy` - Affiché comme `[gcp] Custom command from deploy.md` dans l'aide
- `/gcs:sync` - Affiché comme `[gcp] Custom command from sync.md` dans l'aide

### Skills personnalisés

Les extensions peuvent fournir des skills personnalisés en plaçant les fichiers de skill dans un sous-répertoire `skills/` au sein du répertoire de l'extension. Chaque skill doit contenir un fichier `SKILL.md` avec un frontmatter YAML définissant le nom et la description du skill.

**Exemple**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

Le skill sera disponible via la commande `/skills` lorsque l'extension est active.

### Sous-agents personnalisés

Les extensions peuvent fournir des sous-agents personnalisés en plaçant les fichiers de configuration d'agent dans un sous-répertoire `agents/` au sein du répertoire de l'extension. Les agents sont définis à l'aide de fichiers YAML ou Markdown.

**Exemple**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Les sous-agents d'extension apparaissent dans la boîte de dialogue du gestionnaire de sous-agents, sous la section "Extension Agents".

### Résolution des conflits

Les commandes d'extension ont la priorité la plus faible. En cas de conflit avec des commandes utilisateur ou projet :

1. **Aucun conflit** : La commande d'extension utilise son nom naturel (ex. `/deploy`)
2. **Conflit** : La commande d'extension est renommée avec le préfixe de l'extension (ex. `/gcp.deploy`)

Par exemple, si un utilisateur et l'extension `gcp` définissent tous deux une commande `deploy` :

- `/deploy` - Exécute la commande deploy de l'utilisateur
- `/gcp.deploy` - Exécute la commande deploy de l'extension (marquée avec le tag `[gcp]`)

## Variables

Les extensions Qwen Code permettent la substitution de variables dans `qwen-extension.json`. Cela peut être utile si, par exemple, vous avez besoin du répertoire courant pour exécuter un serveur MCP avec `"cwd": "${extensionPath}${/}run.ts"`.

**Variables prises en charge :**

| variable                   | description                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Le chemin absolu de l'extension dans le système de fichiers de l'utilisateur, ex. '/Users/username/.qwen/extensions/example-extension'. Les liens symboliques ne sont pas résolus. |
| `${workspacePath}`         | Le chemin absolu du workspace actuel.                                                                                                            |
| `${/} or ${pathSeparator}` | Le séparateur de chemin (varie selon l'OS).                                                                                                                          |