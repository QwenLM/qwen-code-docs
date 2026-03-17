# Extensions Qwen Code

Les extensions Qwen Code regroupent des invites, des serveurs MCP, des sous-agents, des compétences et des commandes personnalisées dans un format familier et convivial. Grâce aux extensions, vous pouvez étendre les fonctionnalités de Qwen Code et partager ces fonctionnalités avec d’autres utilisateurs. Elles sont conçues pour être facilement installables et partageables.

Les extensions et plugins provenant de la [Galerie d’extensions CLI Gemini](https://geminicli.com/extensions/) et du [Marché Claude Code](https://claudemarketplaces.com/) peuvent être directement installés dans Qwen Code. Cette compatibilité multiplateforme vous donne accès à un écosystème riche d’extensions et de plugins, élargissant considérablement les capacités de Qwen Code sans obliger les auteurs d’extensions à maintenir des versions distinctes.

## Gestion des extensions

Nous proposons une suite d’outils de gestion des extensions, utilisant à la fois les commandes CLI `qwen extensions` et les commandes en barre oblique `/extensions` au sein de l’interface CLI interactive.

### Gestion des extensions à l’exécution (commandes obliques)

Vous pouvez gérer les extensions à l’exécution dans l’interface CLI interactive à l’aide des commandes obliques `/extensions`. Ces commandes prennent en charge le rechargement à chaud, ce qui signifie que les modifications prennent effet immédiatement, sans nécessiter de redémarrage de l’application.

| Commande                                   | Description                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `/extensions` ou `/extensions manage`      | Gérer toutes les extensions installées                                      |
| `/extensions install <source>`             | Installer une extension depuis une URL Git, un chemin local ou une place de marché |
| `/extensions explore [source]`             | Ouvrir la page source des extensions (Gemini ou ClaudeCode) dans votre navigateur |

### Gestion des extensions CLI

Vous pouvez également gérer les extensions à l’aide des commandes CLI `qwen extensions`. Notez que les modifications apportées via les commandes CLI seront prises en compte dans les sessions CLI actives au redémarrage.

### Installation d’une extension

Vous pouvez installer une extension à l’aide de la commande `qwen extensions install`, depuis plusieurs sources :

#### Depuis le Claude Code Marketplace

Qwen Code prend également en charge les plugins du [Claude Code Marketplace](https://claudemarketplaces.com/). Installez un plugin depuis le marketplace :

```bash
qwen extensions install <nom-du-marketplace>

# ou
qwen extensions install <url-github-du-marketplace>
```

Si vous souhaitez installer un plugin spécifique, utilisez le format incluant le nom du plugin :

```bash
qwen extensions install <nom-du-marketplace>:<nom-du-plugin>
# ou
qwen extensions install <url-github-marché>:<nom-du-plugin>
```

Par exemple, pour installer le plugin `prompts.chat` depuis le marché [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) :

```bash  
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat  

# ou  
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat  
```  

Les plugins Claude sont automatiquement convertis au format Qwen Code lors de l’installation :  

- Le fichier `claude-plugin.json` est converti en `qwen-extension.json`  
- Les configurations d’agent sont converties au format sous-agent Qwen  
- Les configurations de compétences sont converties au format compétence Qwen  
- Les mappages d’outils sont gérés automatiquement  

Vous pouvez parcourir rapidement les extensions disponibles provenant de différents marchés à l'aide de la commande `/extensions explore` :

```bash
# Ouvrir le marché des extensions Gemini CLI
/extensions explore Gemini

# Ouvrir le marché Claude Code
/extensions explore ClaudeCode
```

Cette commande ouvre le marché correspondant dans votre navigateur par défaut, vous permettant de découvrir de nouvelles extensions pour enrichir votre expérience avec Qwen Code.

> **Compatibilité multiplateforme** : Cette fonctionnalité vous permet d’exploiter les riches écosystèmes d’extensions de Gemini CLI et de Claude Code, étendant considérablement les fonctionnalités disponibles pour les utilisateurs de Qwen Code.  

#### À partir des extensions Gemini CLI  

Qwen Code prend entièrement en charge les extensions provenant de la [Galerie d’extensions Gemini CLI](https://geminicli.com/extensions/). Installez-les simplement à l’aide de leur URL Git :  

```bash  
qwen extensions install <url-github-extension-gemini-cli>  

# ou  
qwen extensions install <propriétaire>/<dépôt>  
```  

Les extensions Gemini sont automatiquement converties au format Qwen Code lors de l’installation :  

- Le fichier `gemini-extension.json` est converti en `qwen-extension.json`  
- Les fichiers de commandes au format TOML sont migrés automatiquement vers le format Markdown  
- Les serveurs MCP, les fichiers de contexte et les paramètres sont conservés

#### Depuis un dépôt Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Cela installera l’extension du serveur MCP GitHub.

#### Depuis un chemin local

```bash
qwen extensions install /chemin/vers/votre/extension
```

Notez que nous créons une copie de l’extension installée ; vous devrez donc exécuter `qwen extensions update` pour intégrer les modifications apportées aux extensions définies localement ainsi qu’à celles hébergées sur GitHub.

### Désinstallation d’une extension

Pour désinstaller une extension, exécutez `qwen extensions uninstall nom-de-l-extension`. Ainsi, dans le cas de l’exemple d’installation ci-dessus :

```
qwen extensions uninstall qwen-cli-security
```

### Désactivation d’une extension

Par défaut, les extensions sont activées dans tous les espaces de travail. Vous pouvez désactiver une extension entièrement ou uniquement pour un espace de travail spécifique.

Par exemple, la commande `qwen extensions disable extension-name` désactive l’extension au niveau utilisateur, ce qui la désactive partout. En revanche, `qwen extensions disable extension-name --scope=workspace` ne désactive l’extension que dans l’espace de travail courant.

### Activation d’une extension

Vous pouvez activer une extension à l’aide de la commande `qwen extensions enable extension-name`. Vous pouvez également l’activer pour un espace de travail spécifique en exécutant `qwen extensions enable extension-name --scope=workspace` depuis cet espace de travail.

Cela s’avère utile si une extension est désactivée au niveau supérieur et n’est activée que dans certains espaces de travail précis.

### Mise à jour d’une extension

Pour les extensions installées à partir d’un chemin local ou d’un dépôt Git, vous pouvez explicitement mettre à jour vers la dernière version (telle qu’indiquée dans le champ `version` du fichier `qwen-extension.json`) à l’aide de la commande suivante :

```
qwen extensions update nom-de-l-extension
```

Vous pouvez mettre à jour toutes les extensions avec :

```
qwen extensions update --all
```

## Fonctionnement

Au démarrage, Qwen Code recherche les extensions dans le répertoire `<home>/.qwen/extensions`.

Chaque extension est un répertoire contenant un fichier `qwen-extension.json`. Par exemple :

`<home>/.qwen/extensions/ma-extension/qwen-extension.json`

### `qwen-extension.json`

Le fichier `qwen-extension.json` contient la configuration de l’extension. Ce fichier suit la structure suivante :

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "node my-server.js"
    }
  },
  "contextFileName": "QWEN.md",
  "commands": "commands",
  "skills": "skills",
  "agents": "agents",
  "settings": [
    {
      "name": "Clé API",
      "description": "Votre clé API pour le service",
      "envVar": "MY_API_KEY",
      "sensitive": true
    }
  ]
}
```

- `name` : Le nom de l’extension. Il sert à l’identifier de façon unique et à résoudre les conflits lorsque les commandes de l’extension portent le même nom que des commandes utilisateur ou projet. Le nom doit être en minuscules ou composé de chiffres, et utiliser des tirets plutôt que des underscores ou des espaces. C’est ainsi que les utilisateurs feront référence à votre extension dans l’interface en ligne de commande (CLI). Notez que ce nom doit correspondre au nom du répertoire de l’extension.
- `version` : La version de l’extension.
- `mcpServers` : Une table de hachage des serveurs MCP à configurer. La clé est le nom du serveur, et la valeur est sa configuration. Ces serveurs sont chargés au démarrage, tout comme les serveurs MCP configurés dans un [fichier `settings.json`](./cli/configuration.md). Si une extension et un fichier `settings.json` définissent tous deux un serveur MCP portant le même nom, la définition figurant dans le fichier `settings.json` a priorité.
  - Notez que toutes les options de configuration des serveurs MCP sont prises en charge, à l’exception de `trust`.
- `contextFileName` : Le nom du fichier contenant le contexte de l’extension. Ce fichier est utilisé pour charger le contexte depuis le répertoire de l’extension. Si cette propriété n’est pas définie mais qu’un fichier `QWEN.md` est présent dans le répertoire de l’extension, ce dernier sera chargé.
- `commands` : Le répertoire contenant les commandes personnalisées (par défaut : `commands`). Les commandes sont des fichiers `.md` définissant des invites (prompts).
- `skills` : Le répertoire contenant les compétences personnalisées (par défaut : `skills`). Les compétences sont détectées automatiquement et deviennent disponibles via la commande `/skills`.
- `agents` : Le répertoire contenant les sous-agents personnalisés (par défaut : `agents`). Les sous-agents sont des fichiers `.yaml` ou `.md` définissant des assistants IA spécialisés.
- `settings` : Un tableau des paramètres requis par l’extension. Lors de l’installation, les utilisateurs sont invités à fournir des valeurs pour ces paramètres. Les valeurs sont stockées de façon sécurisée et transmises aux serveurs MCP sous forme de variables d’environnement.
  - Chaque paramètre possède les propriétés suivantes :
    - `name` : Nom affiché du paramètre
    - `description` : Description de l’usage de ce paramètre
    - `envVar` : Nom de la variable d’environnement qui sera définie
    - `sensitive` : Valeur booléenne indiquant si la valeur doit rester masquée (par exemple, clés API, mots de passe)

### Gestion des paramètres des extensions

Les extensions peuvent nécessiter une configuration via des paramètres (par exemple, des clés API ou des identifiants). Ces paramètres peuvent être gérés à l’aide de la commande CLI `qwen extensions settings` :

**Définir la valeur d’un paramètre :**

```bash
qwen extensions settings set <nom-extension> <nom-paramètre> [--scope user|workspace]
```

**Lister tous les paramètres d’une extension :**

```bash
qwen extensions settings list <nom-extension>
```

**Afficher les valeurs actuelles (utilisateur et espace de travail) :**

```bash
qwen extensions settings show <nom-extension> <nom-paramètre>
```

**Supprimer la valeur d’un paramètre :**

```bash
qwen extensions settings unset <nom-extension> <nom-paramètre> [--scope user|workspace]
```

Les paramètres peuvent être configurés à deux niveaux :

- **Niveau utilisateur** (par défaut) : les paramètres s’appliquent à tous les projets (`~/.qwen/.env`)  
- **Niveau espace de travail** : les paramètres s’appliquent uniquement au projet courant (`.qwen/.env`)

Les paramètres définis au niveau espace de travail ont priorité sur ceux définis au niveau utilisateur. Les paramètres sensibles sont stockés de façon sécurisée et ne sont jamais affichés en clair.

Lorsque Qwen Code démarre, il charge toutes les extensions et fusionne leurs configurations. En cas de conflit, la configuration de l’espace de travail prend le pas.

### Commandes personnalisées

Les extensions peuvent fournir des [commandes personnalisées](./cli/commands.md#custom-commands) en plaçant des fichiers Markdown dans un sous-répertoire `commands/` au sein du répertoire de l’extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet, et utilisent les conventions de nommage standard.

> **Note :** Le format des commandes a été mis à jour, passant de TOML à Markdown. Les fichiers TOML sont désormais obsolètes, mais restent pris en charge. Vous pouvez migrer vos commandes TOML existantes à l’aide de l’invite de migration automatique qui s’affiche lorsque des fichiers TOML sont détectés.

**Exemple**

Une extension nommée `gcp`, avec la structure suivante :

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.md
    └── gcs/
        └── sync.md
```

fournit les commandes suivantes :

- `/deploy` — Affichée comme `[gcp] Commande personnalisée issue de deploy.md` dans l’aide
- `/gcs:sync` — Affichée comme `[gcp] Commande personnalisée issue de sync.md` dans l’aide

### Compétences personnalisées

Les extensions peuvent fournir des compétences personnalisées en plaçant des fichiers de compétence dans un sous-répertoire `skills/` au sein du répertoire de l’extension. Chaque compétence doit comporter un fichier `SKILL.md` contenant un en-tête YAML définissant le nom et la description de la compétence.

**Exemple**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── skills/
    └── pdf-processor/
        └── SKILL.md
```

La compétence sera disponible via la commande `/skills` lorsque l’extension est activée.

### Sous-agents personnalisés

Les extensions peuvent fournir des sous-agents personnalisés en plaçant des fichiers de configuration d’agent dans un sous-répertoire `agents/` au sein du répertoire de l’extension. Les agents sont définis à l’aide de fichiers YAML ou Markdown.

**Exemple**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Les sous-agents fournis par les extensions apparaissent dans la boîte de dialogue du gestionnaire de sous-agents, dans la section « Agents d’extension ».

### Résolution des conflits

Les commandes d’extension ont la priorité la plus faible. Lorsqu’un conflit survient avec des commandes utilisateur ou de projet :

1. **Aucun conflit** : la commande d’extension utilise son nom naturel (par exemple `/deploy`)  
2. **Conflit présent** : la commande d’extension est renommée en lui ajoutant le préfixe de l’extension (par exemple `/gcp.deploy`)

Par exemple, si une commande `deploy` est définie à la fois par un utilisateur et par l’extension `gcp` :

- `/deploy` — exécute la commande `deploy` de l’utilisateur  
- `/gcp.deploy` — exécute la commande `deploy` de l’extension (marquée avec l’étiquette `[gcp]`)

## Variables

Les extensions Qwen Code permettent la substitution de variables dans le fichier `qwen-extension.json`. Cela peut être utile, par exemple, si vous avez besoin du répertoire courant pour exécuter un serveur MCP à l’aide de `"cwd": "${extensionPath}${/}run.ts"`.

**Variables prises en charge :**

| Variable                     | Description                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`           | Le chemin complet de l’extension dans le système de fichiers de l’utilisateur, par exemple `/Users/username/.qwen/extensions/example-extension`. Les liens symboliques ne sont pas résolus. |
| `${workspacePath}`           | Le chemin complet de l’espace de travail actuel.                                                                                                            |
| `${/}` ou `${pathSeparator}` | Le séparateur de chemin (diffère selon le système d’exploitation).                                                                                          |