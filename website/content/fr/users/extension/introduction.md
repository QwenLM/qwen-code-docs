# Extensions Qwen Code

Les extensions Qwen Code regroupent les prompts, les serveurs MCP, les sous-agents, les skills et les commandes personnalisées dans un format familier et convivial. Avec les extensions, vous pouvez étendre les capacités de Qwen Code et les partager avec d'autres. Elles sont conçues pour être facilement installables et partageables.

Les extensions et plugins provenant de la [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/) et du [Claude Code Marketplace](https://claudemarketplaces.com/) peuvent être installés directement dans Qwen Code. Cette compatibilité multiplateforme vous donne accès à un riche écosystème d'extensions et de plugins, élargissant considérablement les capacités de Qwen Code sans obliger les auteurs d'extensions à maintenir des versions séparées.

## Gestion des extensions

Nous proposons une suite d'outils de gestion des extensions utilisant à la fois les commandes CLI `qwen extensions` et les commandes slash `/extensions` dans le CLI interactif.

### Gestion des extensions en cours d'exécution (commandes slash)

Vous pouvez gérer les extensions en cours d'exécution dans le CLI interactif à l'aide des commandes slash `/extensions`. Ces commandes prennent en charge le rechargement à chaud, ce qui signifie que les modifications prennent effet immédiatement sans redémarrer l'application.

| Commande                               | Description                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/extensions` ou `/extensions manage` | Gérer toutes les extensions installées                                                               |
| `/extensions install <source>`        | Installer une extension depuis une URL git, un chemin local ou une archive, une URL d'archive, un paquet npm, ou un marketplace |
| `/extensions explore [source]`        | Ouvrir la page des sources d'extensions (Gemini ou ClaudeCode) dans votre navigateur                 |

#### Le gestionnaire d'extensions interactif

Lancer `/extensions` (ou `/extensions manage`) ouvre un gestionnaire interactif avec trois onglets. Appuyez sur `Tab` ou sur les flèches `←`/`→` pour basculer entre eux.

- **Découvrir** — parcourir les plugins de vos sources de marketplace configurées. Tapez pour rechercher, `Entrée` pour voir les détails d'un plugin et l'installer (il vous sera demandé de choisir une portée d'installation). Appuyez sur `Ctrl+R` pour recharger la liste, et `Échap` pour revenir en arrière.
- **Installées** — vos extensions installées, regroupées par portée (**Niveau utilisateur**, **Niveau projet** et favoris). Utilisez `↑`/`↓` pour naviguer, `Espace` pour activer/désactiver une extension, `f` pour la mettre en favori, et `Entrée` pour ouvrir ses détails. Les serveurs MCP fournis par une extension apparaissent imbriqués sous leur extension parente avec l'état de connexion en direct ; vous pouvez activer ou désactiver chaque serveur individuellement à partir de là.
- **Sources** — gérer les sources de marketplace qui alimentent l'onglet Découvrir. Utilisez `↑`/`↓` pour naviguer, `Entrée` pour sélectionner une source, et `d` pour en supprimer une. Ce sont les mêmes sources que celles gérées par les commandes CLI `qwen extensions sources` décrites ci-dessous.

Les modifications effectuées ici se rechargent à chaud immédiatement, sans redémarrer Qwen Code.

### Gestion des extensions via CLI

Vous pouvez également gérer les extensions à l'aide des commandes CLI `qwen extensions`. Notez que les modifications apportées via les commandes CLI seront reflétées dans les sessions CLI actives au redémarrage.

### Installation d'une extension

Vous pouvez installer une extension avec `qwen extensions install` depuis plusieurs sources :

#### Depuis le Claude Code Marketplace

Qwen Code prend également en charge les plugins du [Claude Code Marketplace](https://claudemarketplaces.com/). Installez depuis un marketplace et choisissez un plugin :

```bash
qwen extensions install <marketplace-name>
# ou
qwen extensions install <marketplace-github-url>
```

Si vous souhaitez installer un plugin spécifique, vous pouvez utiliser le format avec le nom du plugin :

```bash
qwen extensions install <marketplace-name>:<plugin-name>
# ou
qwen extensions install <marketplace-github-url>:<plugin-name>
```

Par exemple, pour installer le plugin `prompts.chat` depuis le marketplace [f/awesome-chatgpt-prompts](https://claudemarketplaces.com/plugins/f-awesome-chatgpt-prompts) :

```bash
qwen extensions install f/awesome-chatgpt-prompts:prompts.chat
# ou
qwen extensions install https://github.com/f/awesome-chatgpt-prompts:prompts.chat
```

Les plugins Claude sont automatiquement convertis au format Qwen Code lors de l'installation :

- `claude-plugin.json` est converti en `qwen-extension.json`
- Les configurations d'agent sont converties au format sous-agent Qwen
- Les configurations de skill sont converties au format skill Qwen
- Les mappages d'outils sont automatiquement gérés

Vous pouvez parcourir rapidement les extensions disponibles depuis différents marketplaces à l'aide de la commande `/extensions explore` :

```bash
# Ouvrir le marketplace Gemini CLI Extensions
/extensions explore Gemini

# Ouvrir le marketplace Claude Code
/extensions explore ClaudeCode
```

Cette commande ouvre le marketplace respectif dans votre navigateur par défaut, vous permettant de découvrir de nouvelles extensions pour enrichir votre expérience Qwen Code.

> **Compatibilité multiplateforme** : Cela vous permet de tirer parti des riches écosystèmes d'extensions de Gemini CLI et de Claude Code, élargissant considérablement les fonctionnalités disponibles pour les utilisateurs de Qwen Code.

#### Depuis les extensions Gemini CLI

Qwen Code prend totalement en charge les extensions de la [Gemini CLI Extensions Gallery](https://geminicli.com/extensions/). Installez-les simplement en utilisant l'URL git :

```bash
qwen extensions install <gemini-cli-extension-github-url>
# ou
qwen extensions install <owner>/<repo>
```

Les extensions Gemini sont automatiquement converties au format Qwen Code lors de l'installation :

- `gemini-extension.json` est converti en `qwen-extension.json`
- Les fichiers de commandes TOML sont automatiquement migrés au format Markdown
- Les serveurs MCP, les fichiers de contexte et les paramètres sont conservés

#### Depuis le registre npm

Qwen Code prend en charge l'installation d'extensions depuis des registres npm en utilisant des noms de packages scoped. C'est idéal pour les équipes disposant de registres privés qui ont déjà une infrastructure d'authentification, de versioning et de publication.

```bash
# Installer la dernière version
qwen extensions install @scope/my-extension

# Installer une version spécifique
qwen extensions install @scope/my-extension@1.2.0

# Installer depuis un registre personnalisé
qwen extensions install @scope/my-extension --registry https://your-registry.com
```

Seuls les packages scoped (`@scope/package-name`) sont pris en charge pour éviter toute ambiguïté avec le format abrégé `owner/repo` de GitHub.

**La résolution de registre** suit cette priorité :

1. Le drapeau CLI `--registry` (surcharge explicite)
2. Le registre scoped depuis `.npmrc` (par ex. `@scope:registry=https://...`)
3. Le registre par défaut depuis `.npmrc`
4. Repli : `https://registry.npmjs.org/`

**L'authentification** est gérée automatiquement via la variable d'environnement `NPM_TOKEN` ou les entrées `_authToken` spécifiques au registre dans votre fichier `.npmrc`.

> **Note :** Les extensions npm doivent inclure un fichier `qwen-extension.json` à la racine du package, suivant le même format que toute autre extension Qwen Code. Consultez [Publication d'extensions](./extension-releasing.md#releasing-through-npm-registry) pour les détails d'empaquetage.

#### Depuis un dépôt Git

```bash
qwen extensions install https://github.com/github/github-mcp-server
```

Cela installera l'extension github mcp server.

#### Depuis un chemin local

```bash
qwen extensions install /path/to/your/extension
```

Les archives locales `.zip` et `.tar.gz` sont également prises en charge :

```bash
qwen extensions install /path/to/your/extension.zip
qwen extensions install /path/to/your/extension.tar.gz
```

L'archive doit contenir une extension complète à sa racine, ou un seul répertoire de premier niveau contenant l'extension.

Notez que nous créons une copie de l'extension installée, vous devrez donc exécuter `qwen extensions update` pour récupérer les modifications des extensions définies localement et de celles sur GitHub.

#### Depuis une URL d'archive

```bash
qwen extensions install https://example.com/your/extension.zip
qwen extensions install https://example.com/your/extension.tar.gz
```

Les URL d'archive peuvent être mises à jour ultérieurement tant que l'URL continue de pointer vers une archive plus récente pour la même extension.

#### Choisir une portée d'installation

Par défaut, une extension installée est activée globalement (portée utilisateur). Passez `--scope project` pour l'activer uniquement pour l'espace de travail actuel :

```bash
qwen extensions install <source> --scope project
```

`--scope workspace` est accepté comme alias de `--scope project`. Cela correspond au choix de portée proposé lors de l'installation depuis l'onglet Découvrir de `/extensions manage`.

### Gestion des sources de marketplace

Les sources de marketplace (marketplaces de plugins Claude) alimentent l'onglet Découvrir dans `/extensions manage`. Vous pouvez également les gérer depuis le CLI :

```bash
# Ajouter un marketplace (owner/repo, URL git, URL https vers marketplace.json, ou chemin local)
qwen extensions sources add <source>

# Lister les marketplaces configurés
qwen extensions sources list

# Recharger la liste des plugins d'un marketplace
qwen extensions sources update <name>

# Supprimer un marketplace
qwen extensions sources remove <name>
```

### Désinstallation d'une extension

Pour désinstaller, exécutez `qwen extensions uninstall extension-name`, par exemple avec l'exemple d'installation précédent :

```
qwen extensions uninstall qwen-cli-security
```

### Désactivation d'une extension

Par défaut, les extensions sont activées dans tous les espaces de travail. Vous pouvez désactiver une extension complètement ou pour un espace de travail spécifique.

Par exemple, `qwen extensions disable extension-name` désactivera l'extension au niveau utilisateur, elle sera donc désactivée partout. `qwen extensions disable extension-name --scope=workspace` ne désactivera l'extension que dans l'espace de travail actuel.

### Activation d'une extension

Vous pouvez activer les extensions avec `qwen extensions enable extension-name`. Vous pouvez également activer une extension pour un espace de travail spécifique en utilisant `qwen extensions enable extension-name --scope=workspace` depuis cet espace de travail.

C'est utile si vous avez une extension désactivée au niveau supérieur et activée uniquement dans des endroits spécifiques.

### Mise à jour d'une extension

Pour les extensions installées depuis un chemin local ou une archive, une URL d'archive, un dépôt git ou un registre npm, vous pouvez explicitement mettre à jour vers la dernière version avec `qwen extensions update extension-name`. Pour les extensions npm installées sans version fixe (par ex. `@scope/pkg`), les mises à jour vérifient le dist-tag `latest`. Pour celles installées avec un dist-tag spécifique (par ex. `@scope/pkg@beta`), les mises à jour suivent ce tag. Les extensions épinglées à une version exacte (par ex. `@scope/pkg@1.2.0`) sont toujours considérées comme à jour.

Vous pouvez mettre à jour toutes les extensions avec :

```
qwen extensions update --all
```

## Comment ça fonctionne

Au démarrage, Qwen Code cherche les extensions dans `<home>/.qwen/extensions`

Les extensions sont des répertoires contenant un fichier `qwen-extension.json`. Par exemple :

`<home>/.qwen/extensions/my-extension/qwen-extension.json`

### `qwen-extension.json`

Le fichier `qwen-extension.json` contient la configuration de l'extension. Le fichier a la structure suivante :

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

- `name` : Le nom de l'extension. Il est utilisé pour identifier de manière unique l'extension et pour la résolution des conflits lorsque les commandes de l'extension ont le même nom que les commandes utilisateur ou projet. Le nom doit être en minuscules ou chiffres et utiliser des tirets au lieu de underscores ou espaces. C'est ainsi que les utilisateurs feront référence à votre extension dans le CLI. Notez que ce nom doit correspondre au nom du répertoire de l'extension.
- `version` : La version de l'extension.
- `mcpServers` : Une carte des serveurs MCP à configurer. La clé est le nom du serveur, et la valeur est la configuration du serveur. Ces serveurs seront chargés au démarrage, tout comme les serveurs MCP configurés dans un fichier [`settings.json`](../configuration/settings.md). Si une extension et un fichier `settings.json` configurent tous deux un serveur MCP avec le même nom, le serveur défini dans le fichier `settings.json` a priorité.
  - Notez que toutes les options de configuration des serveurs MCP sont prises en charge, à l'exception de `trust`.
- `channels` : Une carte d'adaptateurs de canaux personnalisés. La clé est le nom du type de canal, et la valeur a une `entry` (chemin vers le point d'entrée JS compilé) et un `displayName` optionnel. Le point d'entrée doit exporter un objet `plugin` conforme à l'interface `ChannelPlugin`. Consultez [Plugins de canaux](../features/channels/plugins) pour un guide complet.
- `contextFileName` : Le nom du fichier contenant le contexte de l'extension. Il sera utilisé pour charger le contexte depuis le répertoire de l'extension. Si cette propriété n'est pas utilisée mais qu'un fichier `QWEN.md` est présent dans votre répertoire d'extension, ce fichier sera chargé.
- `commands` : Le répertoire contenant les commandes personnalisées (par défaut : `commands`). Les commandes sont des fichiers `.md` qui définissent des prompts.
- `skills` : Le répertoire contenant les skills personnalisés (par défaut : `skills`). Les skills sont découverts automatiquement et deviennent disponibles via la commande `/skills`.
- `agents` : Le répertoire contenant les sous-agents personnalisés (par défaut : `agents`). Les sous-agents sont des fichiers `.yaml` ou `.md` qui définissent des assistants IA spécialisés.
- `settings` : Un tableau de paramètres dont l'extension a besoin. Lors de l'installation, les utilisateurs seront invités à fournir des valeurs pour ces paramètres. Les valeurs sont stockées de manière sécurisée et transmises aux serveurs MCP en tant que variables d'environnement.
  - Chaque paramètre a les propriétés suivantes :
    - `name` : Nom d'affichage du paramètre
    - `description` : Une description de l'utilisation de ce paramètre
    - `envVar` : Le nom de la variable d'environnement qui sera définie
    - `sensitive` : Booléen indiquant si la valeur doit être masquée (par exemple, clés API, mots de passe)

### Gestion des paramètres d'extension

Les extensions peuvent nécessiter une configuration via des paramètres (tels que des clés API ou des identifiants). Ces paramètres peuvent être gérés à l'aide de la commande CLI `qwen extensions settings` :

**Définir une valeur de paramètre :**

```bash
qwen extensions settings set <extension-name> <setting-name> [--scope user|workspace]
```

**Lister tous les paramètres et valeurs actuelles d'une extension :**

```bash
qwen extensions settings list <extension-name>
```

Les paramètres peuvent être configurés à deux niveaux :

- **Niveau utilisateur** (par défaut) : Les paramètres s'appliquent à tous les projets (`~/.qwen/.env`)
- **Niveau espace de travail** : Les paramètres s'appliquent uniquement au projet courant (`.qwen/.env`)

Les paramètres d'espace de travail ont priorité sur les paramètres utilisateur. Les paramètres sensibles sont stockés de manière sécurisée et jamais affichés en texte clair.

Lorsque Qwen Code démarre, il charge toutes les extensions et fusionne leurs configurations. En cas de conflit, la configuration de l'espace de travail a priorité.

### Commandes personnalisées

Les extensions peuvent fournir des [commandes personnalisées](../features/commands.md#4-custom-commands) en plaçant des fichiers Markdown dans un sous-répertoire `commands/` au sein du répertoire de l'extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet, et utilisent les conventions de nommage standard.

> **Note :** Le format des commandes a été mis à jour de TOML vers Markdown. Les fichiers TOML sont dépréciés mais toujours pris en charge. Vous pouvez migrer les commandes TOML existantes en utilisant l'invite de migration automatique qui apparaît lorsque des fichiers TOML sont détectés.

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

- `/deploy` - S'affiche comme `[gcp] Commande personnalisée de deploy.md` dans l'aide
- `/gcs:sync` - S'affiche comme `[gcp] Commande personnalisée de sync.md` dans l'aide

### Skills personnalisés

Les extensions peuvent fournir des skills personnalisés en plaçant des fichiers skill dans un sous-répertoire `skills/` au sein du répertoire de l'extension. Chaque skill doit avoir un fichier `SKILL.md` avec un frontmatter YAML définissant le nom et la description du skill.

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

Les extensions peuvent fournir des sous-agents personnalisés en plaçant des fichiers de configuration d'agent dans un sous-répertoire `agents/` au sein du répertoire de l'extension. Les agents sont définis à l'aide de fichiers YAML ou Markdown.

**Exemple**

```
.qwen/extensions/my-extension/
├── qwen-extension.json
└── agents/
    └── testing-expert.yaml
```

Les sous-agents d'extension apparaissent dans la boîte de dialogue du gestionnaire de sous-agents sous la section « Agents d'extension ».

### Résolution des conflits

Les commandes d'extension ont la priorité la plus basse. En cas de conflit avec des commandes utilisateur ou projet :

1. **Pas de conflit** : La commande d'extension utilise son nom naturel (par ex., `/deploy`)
2. **Avec conflit** : La commande d'extension est renommée avec le préfixe de l'extension (par ex., `/gcp.deploy`)

Par exemple, si un utilisateur et l'extension `gcp` définissent tous deux une commande `deploy` :

- `/deploy` - Exécute la commande deploy de l'utilisateur
- `/gcp.deploy` - Exécute la commande deploy de l'extension (marquée avec le tag `[gcp]`)

## Variables

Les extensions Qwen Code permettent la substitution de variables dans `qwen-extension.json`. Cela peut être utile, par exemple, si vous avez besoin du répertoire courant pour exécuter un serveur MCP en utilisant `"cwd": "${extensionPath}${/}run.ts"`.

**Variables prises en charge :**

| variable                   | description                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Le chemin absolu de l'extension dans le système de fichiers de l'utilisateur, par exemple '/Users/username/.qwen/extensions/example-extension'. Cela ne déboucle pas les liens symboliques. |
| `${workspacePath}`         | Le chemin absolu de l'espace de travail actuel.                                                                                                               |
| `${/}` ou `${pathSeparator}` | Le séparateur de chemin (varie selon le système d'exploitation).                                                                                                |