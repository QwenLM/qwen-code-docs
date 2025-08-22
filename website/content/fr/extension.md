# Extensions Qwen Code

Qwen Code prend en charge les extensions qui peuvent être utilisées pour configurer et étendre ses fonctionnalités.

## Fonctionnement

Au démarrage, Qwen Code recherche les extensions dans deux emplacements :

1.  `<workspace>/.qwen/extensions`
2.  `<home>/.qwen/extensions`

Qwen Code charge toutes les extensions depuis ces deux emplacements. Si une extension portant le même nom existe dans les deux emplacements, l'extension du répertoire workspace prend le pas.

Dans chaque emplacement, les extensions individuelles existent sous forme de répertoire contenant un fichier `qwen-extension.json`. Par exemple :

`<workspace>/.qwen/extensions/my-extension/qwen-extension.json`

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

- `name` : Le nom de l'extension. Il est utilisé pour identifier de manière unique l'extension et pour résoudre les conflits lorsque les commandes de l'extension portent le même nom que les commandes utilisateur ou projet.
- `version` : La version de l'extension.
- `mcpServers` : Une map des serveurs MCP à configurer. La clé est le nom du serveur, et la valeur est la configuration du serveur. Ces serveurs seront chargés au démarrage, tout comme les serveurs MCP configurés dans un fichier [`settings.json`](./cli/configuration.md). Si à la fois une extension et un fichier `settings.json` configurent un serveur MCP avec le même nom, le serveur défini dans le fichier `settings.json` prend le pas.
- `contextFileName` : Le nom du fichier contenant le contexte de l'extension. Ce fichier sera utilisé pour charger le contexte depuis l'espace de travail. Si cette propriété n'est pas utilisée mais qu'un fichier `QWEN.md` est présent dans le répertoire de votre extension, alors ce fichier sera chargé.
- `excludeTools` : Un tableau contenant les noms des outils à exclure du modèle. Vous pouvez également spécifier des restrictions spécifiques à certaines commandes pour les outils qui le permettent, comme l'outil `run_shell_command`. Par exemple, `"excludeTools": ["run_shell_command(rm -rf)"]` bloquera la commande `rm -rf`.

Lorsque Qwen Code démarre, il charge toutes les extensions et fusionne leurs configurations. En cas de conflit, la configuration de l'espace de travail est prioritaire.

## Commandes d'extension

Les extensions peuvent fournir des [commandes personnalisées](./cli/commands.md#custom-commands) en plaçant des fichiers TOML dans un sous-répertoire `commands/` au sein du répertoire de l'extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet, et utilisent les conventions de nommage standard.

### Exemple

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