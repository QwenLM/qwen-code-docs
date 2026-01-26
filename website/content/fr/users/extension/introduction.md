# Extensions Qwen Code

Les extensions Qwen Code regroupent des invites, des serveurs MCP, des sous-agents, des compétences et des commandes personnalisées dans un format familier et convivial. Grâce aux extensions, vous pouvez étendre les capacités de Qwen Code et partager ces capacités avec d'autres utilisateurs. Elles sont conçues pour être facilement installables et partageables.

Les extensions et plugins provenant de la [Galerie d'extensions Gemini CLI](https://geminicli.com/extensions/) et du [Marché Claude Code](https://claudemarketplaces.com/) peuvent être directement installés dans Qwen Code. Cette compatibilité multiplateforme vous donne accès à un écosystème riche d'extensions et de plugins, étendant considérablement les capacités de Qwen Code sans obliger les auteurs d'extensions à maintenir des versions séparées.

## Gestion des extensions

Nous proposons une suite d'outils de gestion d'extensions utilisant à la fois les commandes CLI `qwen extensions` et les commandes slash `/extensions` au sein du CLI interactif.

### Gestion des extensions à l'exécution (commandes slash)

Vous pouvez gérer les extensions à l'exécution dans l'interface CLI interactive en utilisant les commandes slash `/extensions`. Ces commandes prennent en charge le rechargement à chaud, ce qui signifie que les modifications prennent effet immédiatement sans redémarrer l'application.

| Commande                                               | Description                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `/extensions` ou `/extensions list`                    | Liste toutes les extensions installées avec leur statut                     |
| `/extensions install <source>`                         | Installe une extension depuis une URL Git, un chemin local ou le marketplace |
| `/extensions uninstall <name>`                         | Désinstalle une extension                                                     |
| `/extensions enable <name> --scope <user\|workspace>`  | Active une extension                                                          |
| `/extensions disable <name> --scope <user\|workspace>` | Désactive une extension                                                       |
| `/extensions update <name>`                            | Met à jour une extension spécifique                                           |
| `/extensions update --all`                             | Met à jour toutes les extensions pour lesquelles des mises à jour sont disponibles |
| `/extensions detail <name>`                            | Affiche les détails d'une extension                                           |
| `/extensions explore [source]`                         | Ouvre la page source des extensions (Gemini ou ClaudeCode) dans votre navigateur |

### Gestion des extensions CLI

Vous pouvez également gérer les extensions à l'aide des commandes CLI `qwen extensions`. Notez que les modifications effectuées via les commandes CLI seront reflétées dans les sessions CLI actives après redémarrage.

### Installation d'une extension

Vous pouvez installer une extension en utilisant `qwen extensions install` à partir de plusieurs sources :

#### Depuis le Claude Code Marketplace

Qwen Code prend également en charge les plugins du [Claude Code Marketplace](https://claudemarketplaces.com/). Installez depuis un marketplace et choisissez un plugin :

```bash
qwen extensions install <nom-du-marketplace>

# ou
qwen extensions install <url-github-du-marketplace>
```

Si vous souhaitez installer un plugin spécifique, vous pouvez utiliser le format avec le nom du plugin :

```bash
qwen extensions install <nom-du-marketplace>:<nom-du-plugin>
```

# ou
qwen extensions install <marketplace-github-url>:<plugin-name>
```

Par exemple, pour installer le plugin `prompts.chat` depuis le marketplace [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) :

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat

# ou
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Les plugins Claude sont automatiquement convertis au format Qwen Code pendant l'installation :

- `claude-plugin.json` est converti en `qwen-extension.json`
- Les configurations d'agent sont converties au format sous-agent Qwen
- Les configurations de compétences sont converties au format compétence Qwen
- Les mappages d'outils sont gérés automatiquement

Vous pouvez parcourir rapidement les extensions disponibles provenant de différents marketplaces en utilisant la commande `/extensions explore` :

```bash

# Ouvrir le marketplace des extensions Gemini CLI
/extensions explore Gemini

# Ouvrir le marketplace Claude Code
/extensions explore ClaudeCode
```

Cette commande ouvre le marketplace respectif dans votre navigateur par défaut, vous permettant de découvrir de nouvelles extensions pour améliorer votre expérience avec Qwen Code.

> **Compatibilité multiplateforme** : Cela vous permet d'utiliser les riches écosystèmes d'extensions de Gemini CLI et de Claude Code, élargissant considérablement les fonctionnalités disponibles pour les utilisateurs de Qwen Code.

#### À partir des extensions Gemini CLI

Qwen Code prend entièrement en charge les extensions provenant de la [Galerie d'extensions Gemini CLI](https://geminicli.com/extensions/). Installez-les simplement en utilisant l'URL git :

```bash
qwen extensions install <url-github-extension-gemini-cli>

# ou
qwen extensions install <propriétaire>/<dépôt>
```

Les extensions Gemini sont automatiquement converties au format Qwen Code pendant l'installation :

- `gemini-extension.json` est converti en `qwen-extension.json`
- Les fichiers de commandes TOML sont automatiquement migrés vers le format Markdown
- Les serveurs MCP, les fichiers de contexte et les paramètres sont conservés

#### Depuis un dépôt Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Cela installera l'extension du serveur MCP GitHub.

#### Depuis un chemin local

```bash
qwen extensions install /path/to/your/extension
```

Notez que nous créons une copie de l'extension installée, vous devrez donc exécuter `qwen extensions update` pour récupérer les modifications provenant à la fois des extensions définies localement et de celles hébergées sur GitHub.

### Désinstaller une extension

Pour désinstaller, exécutez `qwen extensions uninstall nom-de-l-extension`, ainsi, dans le cas de l'exemple d'installation :

```
qwen extensions uninstall qwen-cli-security
```

### Désactiver une extension

Les extensions sont, par défaut, activées dans tous les espaces de travail. Vous pouvez désactiver une extension entièrement ou pour un espace de travail spécifique.

Par exemple, `qwen extensions disable extension-name` désactivera l'extension au niveau utilisateur, donc elle sera désactivée partout. `qwen extensions disable extension-name --scope=workspace` ne désactivera l'extension que dans l'espace de travail actuel.

### Activer une extension

Vous pouvez activer des extensions en utilisant `qwen extensions enable extension-name`. Vous pouvez également activer une extension pour un espace de travail spécifique en utilisant `qwen extensions enable extension-name --scope=workspace` depuis cet espace de travail.

Cela est utile si vous avez une extension désactivée au niveau supérieur et uniquement activée dans des endroits spécifiques.

### Mise à jour d'une extension

Pour les extensions installées à partir d'un chemin local ou d'un dépôt git, vous pouvez explicitement mettre à jour vers la dernière version (telle qu'elle est reflétée dans le champ `version` du fichier `qwen-extension.json`) avec `qwen extensions update nom-de-l-extension`.

Vous pouvez mettre à jour toutes les extensions avec :

```
qwen extensions update --all
```

## Fonctionnement

Au démarrage, Qwen Code recherche les extensions dans `<home>/.qwen/extensions`

Les extensions existent sous forme de répertoires contenant un fichier `qwen-extension.json`. Par exemple :

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Le fichier `qwen-extension.json` contient la configuration de l'extension. Le fichier possède la structure suivante :

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

- `name` : Le nom de l'extension. Cela est utilisé pour identifier de manière unique l'extension et pour résoudre les conflits lorsque les commandes d'extension ont le même nom que les commandes utilisateur ou projet. Le nom doit être en minuscules ou des chiffres et utiliser des tirets au lieu de traits de soulignement ou d'espaces. C'est ainsi que les utilisateurs feront référence à votre extension dans le CLI. Notez que ce nom doit correspondre au nom du répertoire de l'extension.
- `version` : La version de l'extension.
- `mcpServers` : Une carte des serveurs MCP à configurer. La clé est le nom du serveur, et la valeur est la configuration du serveur. Ces serveurs seront chargés au démarrage, tout comme les serveurs MCP configurés dans un [fichier `settings.json`](./cli/configuration.md). Si une extension et un fichier `settings.json` configurent un serveur MCP portant le même nom, le serveur défini dans le fichier `settings.json` est prioritaire.
  - Notez que toutes les options de configuration du serveur MCP sont prises en charge, sauf `trust`.
- `contextFileName` : Le nom du fichier qui contient le contexte de l'extension. Celui-ci sera utilisé pour charger le contexte depuis le répertoire de l'extension. Si cette propriété n'est pas utilisée mais qu'un fichier `QWEN.md` est présent dans votre répertoire d'extension, alors ce fichier sera chargé.
- `commands` : Le répertoire contenant les commandes personnalisées (par défaut : `commands`). Les commandes sont des fichiers `.md` qui définissent des invites.
- `skills` : Le répertoire contenant les compétences personnalisées (par défaut : `skills`). Les compétences sont découvertes automatiquement et deviennent disponibles via la commande `/skills`.
- `agents` : Le répertoire contenant les sous-agents personnalisés (par défaut : `agents`). Les sous-agents sont des fichiers `.yaml` ou `.md` qui définissent des assistants IA spécialisés.
- `settings` : Un tableau des paramètres requis par l'extension. Lors de l'installation, les utilisateurs seront invités à fournir des valeurs pour ces paramètres. Les valeurs sont stockées de manière sécurisée et transmises aux serveurs MCP en tant que variables d'environnement.
  - Chaque paramètre possède les propriétés suivantes :
    - `name` : Nom d'affichage du paramètre
    - `description` : Une description de l'utilisation de ce paramètre
    - `envVar` : Le nom de la variable d'environnement qui sera définie
    - `sensitive` : Booléen indiquant si la valeur doit être masquée (par exemple, clés API, mots de passe)

### Gestion des paramètres d'extensions

Les extensions peuvent nécessiter une configuration via des paramètres (tels que des clés API ou des identifiants). Ces paramètres peuvent être gérés à l'aide de la commande CLI `qwen extensions settings` :

**Définir une valeur de paramètre :**

```bash
qwen extensions settings set <nom-extension> <nom-paramètre> [--scope user|workspace]
```

**Lister tous les paramètres d'une extension :**

```bash
qwen extensions settings list <nom-extension>
```

**Afficher les valeurs actuelles (utilisateur et espace de travail) :**

```bash
qwen extensions settings show <nom-extension> <nom-paramètre>
```

**Supprimer une valeur de paramètre :**

```bash
qwen extensions settings unset <nom-extension> <nom-paramètre> [--scope user|workspace]
```

Les paramètres peuvent être configurés à deux niveaux :

- **Niveau utilisateur** (par défaut) : Les paramètres s'appliquent à tous les projets (`~/.qwen/.env`)
- **Niveau espace de travail** : Les paramètres ne s'appliquent qu'au projet courant (`.qwen/.env`)

Les paramètres au niveau de l'espace de travail ont priorité sur ceux au niveau utilisateur. Les paramètres sensibles sont stockés de manière sécurisée et jamais affichés en texte brut.

Lorsque Qwen Code démarre, il charge toutes les extensions et fusionne leurs configurations. En cas de conflits, la configuration de l'espace de travail est prioritaire.

### Commandes personnalisées

Les extensions peuvent fournir des [commandes personnalisées](./cli/commands.md#custom-commands) en plaçant des fichiers Markdown dans un sous-répertoire `commands/` au sein du répertoire de l'extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet et utilisent les conventions de nommage standard.

> **Remarque :** Le format de commande a été mis à jour de TOML vers Markdown. Les fichiers TOML sont obsolètes mais toujours pris en charge. Vous pouvez migrer les commandes TOML existantes à l'aide de l'invite de migration automatique qui apparaît lorsque des fichiers TOML sont détectés.

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

- `/deploy` - S'affiche comme `[gcp] Commande personnalisée depuis deploy.md` dans l'aide
- `/gcs:sync` - S'affiche comme `[gcp] Commande personnalisée depuis sync.md` dans l'aide

### Compétences personnalisées

Les extensions peuvent fournir des compétences personnalisées en plaçant les fichiers de compétence dans un sous-répertoire `skills/` au sein du répertoire de l'extension. Chaque compétence doit avoir un fichier `SKILL.md` avec des métadonnées YAML définissant le nom et la description de la compétence.

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

Les extensions peuvent fournir des sous-agents personnalisés en plaçant les fichiers de configuration d'agent dans un sous-répertoire `agents/` au sein du répertoire de l'extension. Les agents sont définis à l'aide de fichiers YAML ou Markdown.

**Exemple**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Les sous-agents d'extension apparaissent dans la boîte de dialogue du gestionnaire de sous-agents sous la section "Agents d'extension".

### Résolution des conflits

Les commandes d'extension ont la priorité la plus faible. Lorsqu'un conflit survient avec les commandes utilisateur ou projet :

1. **Aucun conflit** : La commande d'extension utilise son nom naturel (par exemple, `/deploy`)
2. **En cas de conflit** : La commande d'extension est renommée avec le préfixe de l'extension (par exemple, `/gcp.deploy`)

Par exemple, si un utilisateur et l'extension `gcp` définissent tous deux une commande `deploy` :

- `/deploy` - Exécute la commande deploy de l'utilisateur
- `/gcp.deploy` - Exécute la commande deploy de l'extension (marquée avec l'étiquette `[gcp]`)

## Variables

Les extensions Qwen Code permettent la substitution de variables dans `qwen-extension.json`. Cela peut être utile si, par exemple, vous avez besoin du répertoire courant pour exécuter un serveur MCP en utilisant `"cwd": "${extensionPath}${/}run.ts"`.

**Variables prises en charge :**

| variable                   | description                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Le chemin complet de l'extension dans le système de fichiers de l'utilisateur, par exemple, '/Users/username/.qwen/extensions/example-extension'. Les liens symboliques ne seront pas déréférencés. |
| `${workspacePath}`         | Le chemin complet de l'espace de travail actuel.                                                                                                              |
| `${/} ou ${pathSeparator}` | Le séparateur de chemin (diffère selon le système d'exploitation).                                                                                             |