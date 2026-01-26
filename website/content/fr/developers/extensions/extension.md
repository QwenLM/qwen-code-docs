# Extensions Qwen Code

Les extensions Qwen Code regroupent des invites, des serveurs MCP et des commandes personnalisées dans un format familier et convivial. Grâce aux extensions, vous pouvez étendre les capacités de Qwen Code et partager ces capacités avec d'autres utilisateurs. Elles sont conçues pour être faciles à installer et à partager.

## Gestion des extensions

Nous proposons une suite d'outils de gestion d'extensions via les commandes `qwen extensions`.

Notez que ces commandes ne sont pas prises en charge depuis l'interface en ligne de commande (CLI), bien que vous puissiez lister les extensions installées à l'aide de la sous-commande `/extensions list`.

Notez que toutes ces commandes ne seront prises en compte dans les sessions CLI actives qu'après redémarrage.

### Installation d'une extension

Vous pouvez installer une extension en utilisant `qwen extensions install` avec soit une URL GitHub, soit un chemin local.

Notez que nous créons une copie de l'extension installée, vous devrez donc exécuter `qwen extensions update` pour récupérer les modifications provenant à la fois des extensions définies localement et de celles hébergées sur GitHub.

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

Cela installera l'extension Qwen Code Security, qui offre un support pour la commande `/security:analyze`.

### Désinstallation d'une extension

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

Pour les extensions installées à partir d'un chemin local ou d'un dépôt git, vous pouvez explicitement mettre à jour vers la dernière version (telle que reflétée dans le champ `version` du fichier `qwen-extension.json`) avec `qwen extensions update nom-de-l-extension`.

Vous pouvez mettre à jour toutes les extensions avec :

```
qwen extensions update --all
```

## Création d'extension

Nous proposons des commandes pour faciliter le développement d'extensions.

### Créer une extension modèle

Nous proposons plusieurs exemples d'extensions : `context`, `custom-commands`, `exclude-tools` et `mcp-server`. Vous pouvez consulter ces exemples [ici](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples).

Pour copier l'un de ces exemples dans un répertoire de développement en utilisant le type de votre choix, exécutez :

```
qwen extensions new chemin/vers/le/répertoire custom-commands
```

### Lier une extension locale

La commande `qwen extensions link` va créer un lien symbolique depuis le répertoire d'installation de l'extension vers le chemin de développement.

Cela est utile pour ne pas avoir à exécuter `qwen extensions update` à chaque fois que vous effectuez des modifications que vous souhaitez tester.

```
qwen extensions link chemin/vers/répertoire
```

## Fonctionnement

Au démarrage, Qwen Code recherche les extensions dans `<home>/.qwen/extensions`

Les extensions existent sous forme d'un répertoire contenant un fichier `qwen-extension.json`. Par exemple :

`<home>/.qwen/extensions/mon-extension/qwen-extension.json`

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
  "excludeTools": ["run_shell_command"]
}
```

- `name` : Le nom de l'extension. Cela sert à identifier de manière unique l'extension et à résoudre les conflits lorsque les commandes d'extension ont le même nom que les commandes utilisateur ou projet. Le nom doit être en minuscules ou des chiffres et utiliser des tirets au lieu de traits de soulignement ou d'espaces. C'est ainsi que les utilisateurs feront référence à votre extension dans le CLI. Notez que ce nom doit correspondre au nom du répertoire de l'extension.
- `version` : La version de l'extension.
- `mcpServers` : Une carte des serveurs MCP à configurer. La clé est le nom du serveur, et la valeur est la configuration du serveur. Ces serveurs seront chargés au démarrage, tout comme les serveurs MCP configurés dans un [fichier `settings.json`](./cli/configuration.md). Si une extension et un fichier `settings.json` configurent un serveur MCP portant le même nom, le serveur défini dans le fichier `settings.json` est prioritaire.
  - Notez que toutes les options de configuration du serveur MCP sont prises en charge, sauf `trust`.
- `contextFileName` : Le nom du fichier qui contient le contexte de l'extension. Celui-ci sera utilisé pour charger le contexte depuis le répertoire de l'extension. Si cette propriété n'est pas utilisée mais qu'un fichier `QWEN.md` est présent dans votre répertoire d'extension, alors ce fichier sera chargé.
- `excludeTools` : Un tableau de noms d'outils à exclure du modèle. Vous pouvez également spécifier des restrictions spécifiques aux commandes pour les outils qui les prennent en charge, comme l'outil `run_shell_command`. Par exemple, `"excludeTools": ["run_shell_command(rm -rf)"]` bloquera la commande `rm -rf`. Notez que cela diffère de la fonctionnalité `excludeTools` du serveur MCP, qui peut être listée dans la configuration du serveur MCP. **Important :** Les outils spécifiés dans `excludeTools` seront désactivés pour l'ensemble du contexte de conversation et affecteront toutes les requêtes ultérieures dans la session en cours.

Lorsque Qwen Code démarre, il charge toutes les extensions et fusionne leurs configurations. En cas de conflits, la configuration de l'espace de travail est prioritaire.

### Commandes personnalisées

Les extensions peuvent fournir des [commandes personnalisées](./cli/commands.md#custom-commands) en plaçant des fichiers TOML dans un sous-répertoire `commands/` au sein du répertoire de l'extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet, et utilisent les conventions de nommage standard.

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

- `/deploy` - S'affiche comme `[gcp] Custom command from deploy.toml` dans l'aide
- `/gcs:sync` - S'affiche comme `[gcp] Custom command from sync.toml` dans l'aide

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