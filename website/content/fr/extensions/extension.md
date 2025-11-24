# Extensions Qwen Code

Les extensions Qwen Code regroupent des prompts, des serveurs MCP et des commandes personnalisées dans un format familier et convivial. Grâce aux extensions, vous pouvez étendre les fonctionnalités de Qwen Code et partager ces capacités avec d'autres utilisateurs. Elles sont conçues pour être facilement installables et partageables.

## Gestion des extensions

Nous proposons une suite d'outils de gestion des extensions via les commandes `qwen extensions`.

Notez que ces commandes ne sont pas prises en charge depuis l'intérieur du CLI, bien que vous puissiez lister les extensions installées en utilisant la sous-commande `/extensions list`.

Notez également que toutes ces commandes ne seront prises en compte que dans les sessions CLI actives après redémarrage.

### Installation d'une extension

Vous pouvez installer une extension en utilisant `qwen extensions install` avec soit une URL GitHub, soit un chemin local.

Notez que nous créons une copie de l'extension installée, donc vous devrez exécuter `qwen extensions update` pour récupérer les modifications depuis les extensions définies localement ainsi que celles présentes sur GitHub.

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

Cela installera l'extension Qwen Code Security, qui propose le support de la commande `/security:analyze`.

### Désinstallation d'une extension

Pour désinstaller, exécutez `qwen extensions uninstall nom-extension`, donc dans le cas de l'exemple d'installation :

```
qwen extensions uninstall qwen-cli-security
```

### Désactiver une extension

Les extensions sont, par défaut, activées dans tous les espaces de travail. Vous pouvez désactiver une extension entièrement ou pour un espace de travail spécifique.

Par exemple, `qwen extensions disable extension-name` désactivera l'extension au niveau utilisateur, donc elle sera désactivée partout. `qwen extensions disable extension-name --scope=workspace` désactivera uniquement l'extension dans l'espace de travail actuel.

### Activer une extension

Vous pouvez activer des extensions en utilisant `qwen extensions enable extension-name`. Vous pouvez également activer une extension pour un espace de travail spécifique en utilisant `qwen extensions enable extension-name --scope=workspace` depuis cet espace de travail.

Cela est utile si vous avez une extension désactivée au niveau supérieur et activée uniquement dans certains endroits.

### Mise à jour d'une extension

Pour les extensions installées depuis un chemin local ou un dépôt Git, vous pouvez explicitement mettre à jour vers la dernière version (telle que définie dans le champ `version` du fichier `qwen-extension.json`) avec la commande :

```
qwen extensions update nom-de-l-extension
```

Vous pouvez également mettre à jour toutes les extensions en exécutant :

```
qwen extensions update --all
```

## Création d'extensions

Nous fournissons des commandes pour faciliter le développement d'extensions.

### Créer une extension basique

Nous proposons plusieurs exemples d'extensions : `context`, `custom-commands`, `exclude-tools` et `mcp-server`. Vous pouvez consulter ces exemples [ici](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples).

Pour copier l’un de ces exemples dans un répertoire de développement en choisissant son type, exécutez :

```
qwen extensions new chemin/vers/répertoire custom-commands
```

### Lier une extension locale

La commande `qwen extensions link` va créer un lien symbolique depuis le répertoire d'installation des extensions vers le chemin de développement.

C'est pratique pour ne pas avoir à exécuter `qwen extensions update` à chaque fois que vous faites des changements que vous souhaitez tester.

```
qwen extensions link path/to/directory
```

## Comment ça marche

Au démarrage, Qwen Code cherche les extensions dans `<home>/.qwen/extensions`

Les extensions sont stockées dans un répertoire contenant un fichier `qwen-extension.json`. Par exemple :

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
  "contextFileName": "QWEN.md",
  "excludeTools": ["run_shell_command"]
}
```

- `name` : Le nom de l'extension. Il est utilisé pour identifier de manière unique l'extension et pour résoudre les conflits lorsque les commandes d'une extension ont le même nom que celles définies par l'utilisateur ou le projet. Le nom doit être en minuscules ou en chiffres, avec des tirets au lieu de traits soulignés ou d'espaces. C'est ainsi que les utilisateurs feront référence à votre extension dans la CLI. Notez que ce nom doit correspondre au nom du répertoire de l'extension.
- `version` : La version de l'extension.
- `mcpServers` : Une map des serveurs MCP à configurer. La clé est le nom du serveur, et la valeur est la configuration du serveur. Ces serveurs seront chargés au démarrage, tout comme les serveurs configurés dans un fichier [`settings.json`](./cli/configuration.md). Si une extension et un fichier `settings.json` configurent un serveur MCP avec le même nom, celui défini dans le fichier `settings.json` prendra le dessus.
  - Notez que toutes les options de configuration des serveurs MCP sont prises en charge, sauf `trust`.
- `contextFileName` : Le nom du fichier contenant le contexte de l'extension. Ce fichier sera utilisé pour charger le contexte depuis le répertoire de l'extension. Si cette propriété n’est pas définie mais qu’un fichier `QWEN.md` est présent dans le répertoire de l’extension, alors ce fichier sera automatiquement chargé.
- `excludeTools` : Un tableau contenant les noms des outils à exclure du modèle. Vous pouvez également spécifier des restrictions spécifiques aux commandes pour les outils qui le permettent, comme l’outil `run_shell_command`. Par exemple, `"excludeTools": ["run_shell_command(rm -rf)"]` bloquera la commande `rm -rf`. Notez que cela diffère de la fonctionnalité `excludeTools` côté serveur MCP, qui peut être listée directement dans la configuration du serveur MCP. **Important :** Les outils spécifiés dans `excludeTools` seront désactivés pour l’ensemble du contexte de conversation et affecteront toutes les requêtes suivantes dans la session courante.

Au démarrage de Qwen Code, toutes les extensions sont chargées et leurs configurations fusionnées. En cas de conflit, la configuration au niveau de l’espace de travail (workspace) prime.

### Commandes personnalisées

Les extensions peuvent fournir des [commandes personnalisées](./cli/commands.md#custom-commands) en plaçant des fichiers TOML dans un sous-répertoire `commands/` au sein du répertoire de l'extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet, et utilisent les conventions de nommage standards.

**Exemple**

Une extension nommée `gcp` avec la structure suivante :

```
.qwen/extensions/gcp/
├── qwen-extension.json
└── commands/
    ├── deploy.toml
    └── gcs/
        └── sync.toml
```

Fournirait ces commandes :

- `/deploy` - Apparaît comme `[gcp] Custom command from deploy.toml` dans l'aide
- `/gcs:sync` - Apparaît comme `[gcp] Custom command from sync.toml` dans l'aide

### Résolution des conflits

Les commandes d'extension ont la priorité la plus faible. Lorsqu'un conflit survient avec les commandes utilisateur ou projet :

1. **Pas de conflit** : La commande d'extension utilise son nom naturel (ex. : `/deploy`)
2. **Avec conflit** : La commande d'extension est renommée avec le préfixe de l'extension (ex. : `/gcp.deploy`)

Par exemple, si à la fois un utilisateur et l'extension `gcp` définissent une commande `deploy` :

- `/deploy` - Exécute la commande deploy de l'utilisateur
- `/gcp.deploy` - Exécute la commande deploy de l'extension (marquée avec le tag `[gcp]`)

## Variables

Les extensions Qwen Code permettent la substitution de variables dans le fichier `qwen-extension.json`. Cela peut être utile si, par exemple, vous avez besoin du répertoire courant pour lancer un serveur MCP en utilisant `"cwd": "${extensionPath}${/}run.ts"`.

**Variables supportées :**

| Variable                    | Description                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`          | Le chemin complet de l'extension dans le système de fichiers de l'utilisateur, par exemple : `/Users/username/.qwen/extensions/example-extension`. Ne suit pas les liens symboliques. |
| `${workspacePath}`          | Le chemin complet de l'espace de travail actuel.                                                                                                                 |
| `${/} or ${pathSeparator}`  | Le séparateur de chemin (varie selon l'OS).                                                                                                                      |