# Extensions de Qwen Code

Les extensions de Qwen Code regroupent des prompts, des serveurs MCP, des sous-agents, des compétences et des commandes personnalisées dans un format familier et convivial. Avec les extensions, vous pouvez étendre les capacités de Qwen Code et partager ces capacités avec d’autres. Elles sont conçues pour être facilement installables et partageables.

Les extensions et plugins provenant de [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) et du [Claude Code Marketplace](https://claudemarketplaces.com/) peuvent être installés directement dans Qwen Code. Cette compatibilité multiplateforme vous donne accès à un riche écosystème d’extensions et de plugins, ce qui étend considérablement les capacités de Qwen Code sans obliger les auteurs d’extensions à maintenir des versions séparées.

## Gestion des extensions

Nous offrons un ensemble d’outils de gestion des extensions grâce aux commandes CLI `qwen extensions` et aux commandes slash `/extensions` dans le CLI interactif.

### Gestion des extensions à l’exécution (commandes slash)

Vous pouvez gérer les extensions à l’exécution dans le CLI interactif à l’aide des commandes slash `/extensions`. Ces commandes prennent en charge le rechargement à chaud, ce qui signifie que les modifications prennent effet immédiatement sans redémarrer l’application.

| Commande                               | Description                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/extensions` ou `/extensions manage`  | Gérer toutes les extensions installées                                                              |
| `/extensions install <source>`         | Installer une extension depuis une URL git, un chemin local ou une archive, une URL d’archive, un package npm, ou une place de marché |
| `/extensions explore [source]`         | Ouvrir la page source des extensions (Gemini ou ClaudeCode) dans votre navigateur                    |

#### Le gestionnaire d’extensions interactif

Exécuter `/extensions` (ou `/extensions manage`) ouvre un gestionnaire interactif avec trois onglets. Appuyez sur `Tab` ou les flèches `←`/`→` pour basculer entre eux.

- **Discover** — parcourez les plugins de vos sources de place de marché configurées. Tapez pour rechercher, `Entrée` pour afficher les détails d’un plugin et l’installer (il vous sera demandé de choisir une portée d’installation). Appuyez sur `Ctrl+R` pour recharger les listes, et `Esc` pour revenir en arrière.
- **Installed** — vos extensions installées, regroupées par portée (**User level**, **Project level** et favoris). Utilisez `↑`/`↓` pour naviguer, `Espace` pour activer/désactiver une extension, `f` pour l’ajouter aux favoris, et `Entrée` pour ouvrir ses détails. Les serveurs MCP intégrés par une extension apparaissent imbriqués sous leur extension parente avec l’état de connexion en direct ; vous pouvez activer ou désactiver chaque serveur individuellement à partir de là.
- **Sources** — gérez les sources de place de marché qui alimentent l’onglet Découvrir. Utilisez `↑`/`↓` pour naviguer, `Entrée` pour sélectionner une source, et `d` pour en supprimer une. Ce sont les mêmes sources que celles gérées par les commandes CLI `qwen extensions sources` décrites ci-dessous.

Les modifications effectuées ici sont rechargées à chaud immédiatement, sans redémarrer Qwen Code.

### Gestion des extensions en CLI

Vous pouvez également gérer les extensions à l’aide des commandes CLI `qwen extensions`. Notez que les modifications effectuées via les commandes CLI seront répercutées dans les sessions CLI actives au redémarrage.

### Installation d’une extension

Vous pouvez installer une extension avec `qwen extensions install` à partir de plusieurs sources :

#### Depuis la place de marché Claude Code

Qwen Code prend également en charge les plugins du [Claude Code Marketplace](https://claudemarketplaces.com/). Installez depuis une place de marché et choisissez un plugin :

```bash
qwen extensions install <marketplace-name>
# or
qwen extensions install <marketplace-github-url>
```

Si vous souhaitez installer un plugin spécifique, vous pouvez utiliser le format avec le nom du plugin :

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# or
qwen extensions install <marketplace-github-url>:<plugin-name>
```

Par exemple, pour installer le plugin `prompts.chat` depuis la place de marché [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) :

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# or
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Les plugins Claude sont automatiquement convertis au format Qwen Code lors de l’installation :

- `claude-plugin.json` est converti en `qwen-extension.json`
- Les configurations d’agent sont converties au format sous-agent Qwen
- Les configurations de compétence sont converties au format compétence Qwen
- Les correspondances d’outils sont gérées automatiquement

Vous pouvez parcourir rapidement les extensions disponibles de différentes places de marché en utilisant la commande `/extensions explore` :

```bash
# Open Gemini CLI Extensions marketplace
/extensions explore Gemini

# Open Claude Code marketplace
/extensions explore ClaudeCode
```

Cette commande ouvre la place de marché correspondante dans votre navigateur par défaut, vous permettant de découvrir de nouvelles extensions pour améliorer votre expérience Qwen Code.

> **Compatibilité multiplateforme** : Cela vous permet de tirer parti des riches écosystèmes d’extensions de Gemini CLI et Claude Code, élargissant considérablement les fonctionnalités disponibles pour les utilisateurs de Qwen Code.
#### From Gemini CLI Extensions

Qwen Code prend en charge intégralement les extensions de la [Galerie d'extensions Gemini CLI](https://geminicli.com/extensions/). Installez‑les simplement en utilisant l'URL git :

```bash
qwen extensions install <gemini-cli-extension-github-url>
# or
qwen extensions install <owner>/<repo>
```

Les extensions Gemini sont automatiquement converties au format Qwen Code lors de l'installation :

- `gemini-extension.json` est converti en `qwen-extension.json`
- Les fichiers de commandes TOML sont automatiquement migrés au format Markdown
- Les serveurs MCP, les fichiers de contexte et les paramètres sont conservés

#### From npm Registry

Qwen Code prend en charge l'installation d'extensions depuis des registres npm à l'aide de noms de packages scopés. C'est idéal pour les équipes disposant déjà d'une infrastructure d'authentification, de versioning et de publication sur leurs registres privés.

```bash
# Install the latest version
qwen extensions install @scope/my-extension

# Install a specific version
qwen extensions install @scope/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

Seuls les packages scopés (`@scope/package-name`) sont pris en charge pour éviter toute ambiguïté avec le format court GitHub `owner/repo`.

**Résolution du registre** suit cette priorité :

1. Drapeau `--registry` (surcharge explicite)
2. Registre scopé depuis `.npmrc` (ex. `@scope:registry=https://...`)
3. Registre par défaut depuis `.npmrc`
4. Solution de repli : `https://registry.npmjs.org/`

**L'authentification** est gérée automatiquement via la variable d'environnement `NPM_TOKEN` ou les entrées `_authToken` spécifiques au registre dans votre fichier `.npmrc`.

> **Remarque :** les extensions npm doivent inclure un fichier `qwen-extension.json` à la racine du package, respectant le même format que toute autre extension Qwen Code. Voir [Publication d'extension](./extension-releasing.md#releasing-through-npm-registry) pour les détails d'empaquetage.

#### From Git Repository

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Cela installera l'extension du serveur MCP github.

#### From Local Path

```bash
qwen extensions install /path/to/your/extension
```

Les archives locales `.zip` et `.tar.gz` sont également prises en charge :

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

L'archive doit contenir une extension complète à sa racine, ou un seul répertoire de premier niveau contenant l'extension.

Notez que nous créons une copie de l'extension installée ; vous devrez donc exécuter `qwen extensions update` pour récupérer les modifications des extensions définies localement et de celles sur GitHub.

#### From Archive URL

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

Les URLs d'archives peuvent être mises à jour ultérieurement tant qu'elles pointent vers une archive plus récente pour la même extension.

#### Choosing an install scope

Par défaut, une extension installée est activée globalement (scope utilisateur). Passez `--scope project` pour l'activer uniquement dans l'espace de travail courant :

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` est accepté comme alias de `--scope project`. Cela correspond au choix de scope proposé lors de l'installation depuis l'onglet Découverte de `/extensions manage`.

### Managing marketplace sources

Les sources de place de marché (places de marché de plugins Claude) alimentent l'onglet Découverte dans `/extensions manage`. Vous pouvez également les gérer depuis la CLI :

```bash
# Add a marketplace (owner/repo, git URL, https URL to marketplace.json, or local path)
qwen extensions sources add <source>

# List configured marketplaces
qwen extensions sources list

# Re-fetch a marketplace's plugin listing
qwen extensions sources update <name>

# Remove a marketplace
qwen extensions sources remove <name>
```

### Uninstalling an extension

Pour désinstaller, exécutez `qwen extensions uninstall extension-name`, donc, dans le cas de l'exemple d'installation :

```
qwen extensions uninstall qwen-cli-security
```

### Disabling an extension

Par défaut, les extensions sont activées dans tous les espaces de travail. Vous pouvez désactiver une extension complètement ou pour un espace de travail spécifique.

Par exemple, `qwen extensions disable extension-name` désactivera l'extension au niveau utilisateur, donc elle sera désactivée partout. `qwen extensions disable extension-name --scope=workspace` désactivera l'extension uniquement dans l'espace de travail courant.

### Enabling an extension

Vous pouvez activer des extensions avec `qwen extensions enable extension-name`. Vous pouvez également activer une extension pour un espace de travail spécifique en utilisant `qwen extensions enable extension-name --scope=workspace` depuis cet espace de travail.

C'est utile si vous avez une extension désactivée au niveau supérieur et activée uniquement à des endroits spécifiques.

### Updating an extension

Pour les extensions installées depuis un chemin local ou une archive, une URL d'archive, un dépôt git ou un registre npm, vous pouvez explicitement mettre à jour vers la dernière version avec `qwen extensions update extension-name`. Pour les extensions npm installées sans verrouillage de version (ex. `@scope/pkg`), les mises à jour vérifient le dist-tag `latest`. Pour celles installées avec un dist-tag spécifique (ex. `@scope/pkg@beta`), les mises à jour suivent ce tag. Les extensions verrouillées sur une version exacte (ex. `@scope/pkg@1.2.0`) sont toujours considérées comme à jour.
Vous pouvez mettre à jour toutes les extensions avec :

```
qwen extensions update --all
```

## Fonctionnement

Au démarrage, Qwen Code recherche les extensions dans `<home>/.qwen/extensions`

Les extensions existent sous forme de répertoire contenant un fichier `qwen-extension.json`. Par exemple :

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Le fichier `qwen-extension.json` contient la configuration de l'extension. Il a la structure suivante :

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

- `name` : Le nom de l'extension. Il est utilisé pour identifier l'extension de manière unique et pour la résolution des conflits lorsque des commandes d'extension portent le même nom que des commandes utilisateur ou de projet. Le nom doit être en minuscules ou en chiffres, et utiliser des tirets au lieu de underscores ou d'espaces. C'est ainsi que les utilisateurs feront référence à votre extension dans l'interface en ligne de commande. Notez que ce nom doit correspondre au nom du répertoire de l'extension.
- `version` : La version de l'extension.
- `mcpServers` : Une map des serveurs MCP à configurer. La clé est le nom du serveur, et la valeur est la configuration du serveur. Ces serveurs seront chargés au démarrage, tout comme les serveurs MCP configurés dans un fichier [`settings.json`](../configuration/settings.md). Si une extension et un fichier `settings.json` configurent tous deux un serveur MCP avec le même nom, le serveur défini dans le fichier `settings.json` prévaut.
  - Notez que toutes les options de configuration des serveurs MCP sont prises en charge, à l'exception de `trust`.
- `channels` : Une map d'adaptateurs de canaux personnalisés. La clé est le nom du type de canal, et la valeur possède une propriété `entry` (chemin vers le point d'entrée JS compilé) et une propriété optionnelle `displayName`. Le point d'entrée doit exporter un objet `plugin` conforme à l'interface `ChannelPlugin`. Voir [Plugins de canal](../features/channels/plugins) pour un guide complet.
- `contextFileName` : Le nom du fichier contenant le contexte de l'extension. Il sera utilisé pour charger le contexte depuis le répertoire de l'extension. Si cette propriété n'est pas utilisée mais qu'un fichier `QWEN.md` est présent dans votre répertoire d'extension, alors ce fichier sera chargé.
- `commands` : Le répertoire contenant les commandes personnalisées (par défaut : `commands`). Les commandes sont des fichiers `.md` qui définissent des invites.
- `skills` : Le répertoire contenant les compétences personnalisées (par défaut : `skills`). Les compétences sont détectées automatiquement et deviennent disponibles via la commande `/skills`.
- `agents` : Le répertoire contenant les sous-agents personnalisés (par défaut : `agents`). Les sous-agents sont des fichiers `.yaml` ou `.md` qui définissent des assistants IA spécialisés.
- `settings` : Un tableau de paramètres requis par l'extension. Lors de l'installation, les utilisateurs seront invités à fournir des valeurs pour ces paramètres. Les valeurs sont stockées de manière sécurisée et transmises aux serveurs MCP en tant que variables d'environnement.
  - Chaque paramètre a les propriétés suivantes :
    - `name` : Nom affiché pour le paramètre.
    - `description` : Une description de l'utilisation de ce paramètre.
    - `envVar` : Le nom de la variable d'environnement qui sera définie.
    - `sensitive` : Booléen indiquant si la valeur doit être masquée (par exemple, clés API, mots de passe).

### Gestion des paramètres d'extension

Les extensions peuvent nécessiter une configuration via des paramètres (tels que des clés API ou des identifiants). Ces paramètres peuvent être gérés à l'aide de la commande CLI `qwen extensions settings` :

**Définir une valeur de paramètre :**

```bash
qwen extensions settings set <nom-extension> <nom-paramètre> [--scope user|workspace]
```

**Lister tous les paramètres et leurs valeurs actuelles pour une extension :**

```bash
qwen extensions settings list <nom-extension>
```

Les paramètres peuvent être configurés à deux niveaux :

- **Niveau utilisateur** (par défaut) : Les paramètres s'appliquent à tous les projets (`~/.qwen/.env`)
- **Niveau espace de travail** : Les paramètres s'appliquent uniquement au projet courant (`.qwen/.env`)

Les paramètres d'espace de travail prévalent sur les paramètres utilisateur. Les paramètres sensibles sont stockés de manière sécurisée et ne sont jamais affichés en clair.

Lorsque Qwen Code démarre, il charge toutes les extensions et fusionne leurs configurations. En cas de conflit, la configuration de l'espace de travail prévaut.

### Commandes personnalisées

Les extensions peuvent fournir des [commandes personnalisées](../features/commands.md#4-custom-commands) en plaçant des fichiers Markdown dans un sous-répertoire `commands/` au sein du répertoire de l'extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet, et utilisent les conventions de nommage standard.

> **Remarque :** Le format des commandes a été mis à jour de TOML vers Markdown. Les fichiers TOML sont obsolètes mais toujours pris en charge. Vous pouvez migrer les commandes TOML existantes à l'aide de l'invite de migration automatique qui apparaît lorsque des fichiers TOML sont détectés.
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

- `/deploy` - S'affiche comme `[gcp] Custom command from deploy.md` dans l'aide
- `/gcs:sync` - S'affiche comme `[gcp] Custom command from sync.md` dans l'aide

### Compétences personnalisées

Les extensions peuvent fournir des compétences personnalisées en plaçant des fichiers de compétences dans un sous-répertoire `skills/` au sein du répertoire de l'extension. Chaque compétence doit avoir un fichier `SKILL.md` avec un frontmatter YAML définissant le nom et la description de la compétence.

**Exemple**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

La compétence sera disponible via la commande `/skills` lorsque l'extension est active.

### Sous-agents personnalisés

Les extensions peuvent fournir des sous-agents personnalisés en plaçant des fichiers de configuration d'agent dans un sous-répertoire `agents/` au sein du répertoire de l'extension. Les agents sont définis à l'aide de fichiers YAML ou Markdown.

**Exemple**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Les sous-agents d'extension apparaissent dans la boîte de dialogue du gestionnaire de sous-agents sous la section "Extension Agents".

### Résolution des conflits

Les commandes d'extension ont la priorité la plus basse. Lorsqu'un conflit survient avec des commandes utilisateur ou de projet :

1. **Aucun conflit** : La commande d'extension utilise son nom naturel (par exemple, `/deploy`)
2. **Avec conflit** : La commande d'extension est renommée avec le préfixe de l'extension (par exemple, `/gcp.deploy`)

Par exemple, si à la fois un utilisateur et l'extension `gcp` définissent une commande `deploy` :

- `/deploy` - Exécute la commande deploy de l'utilisateur
- `/gcp.deploy` - Exécute la commande deploy de l'extension (marquée avec la balise `[gcp]`)

## Variables

Les extensions Qwen Code permettent la substitution de variables dans `qwen-extension.json`. Cela peut être utile si, par exemple, vous avez besoin du répertoire actuel pour exécuter un serveur MCP en utilisant `"cwd": "${extensionPath}${/}run.ts"`.

**Variables prises en charge :**

| variable                        | description                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`              | Le chemin absolu de l'extension dans le système de fichiers de l'utilisateur, par exemple '/Users/username/.qwen/extensions/example-extension'. Cela ne déréférencera pas les liens symboliques. |
| `${workspacePath}`              | Le chemin absolu de l'espace de travail actuel.                                                                                                                                  |
| `${/} ou ${pathSeparator}` | Le séparateur de chemin (diffère selon l'OS).                                                                                                                                    |
