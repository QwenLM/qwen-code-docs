# Extensions Qwen Code

Les extensions Qwen Code regroupent des invites, des serveurs MCP et des commandes personnalisées dans un format familier et convivial. Grâce aux extensions, vous pouvez étendre les capacités de Qwen Code et partager ces fonctionnalités avec d'autres utilisateurs. Elles sont conçues pour être facilement installables et partageables.

## Gestion des extensions

Nous proposons une suite d'outils de gestion des extensions à l'aide des commandes `qwen extensions`.

Notez que ces commandes ne sont pas prises en charge depuis l'intérieur de l'interface CLI, bien que vous puissiez lister les extensions installées en utilisant la sous-commande `/extensions list`.

Notez que toutes ces commandes ne seront prises en compte que dans les sessions CLI actives après redémarrage.

### Installation d'une extension

Vous pouvez installer une extension en utilisant `qwen extensions install` avec soit une URL GitHub, soit un chemin local.

Notez que nous créons une copie de l'extension installée, vous devrez donc exécuter `qwen extensions update` pour récupérer les modifications à la fois des extensions définies localement et de celles présentes sur GitHub.

```
qwen extensions install https://github.com/qwen-cli-extensions/security
```

Cela installera l'extension Qwen Code Security, qui propose un support pour la commande `/security:analyze`.

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

Pour les extensions installées depuis un chemin local ou un dépôt Git, vous pouvez explicitement mettre à jour vers la dernière version (telle que reflétée dans le champ `version` du fichier `qwen-extension.json`) avec la commande :

```
qwen extensions update nom-de-l-extension
```

Vous pouvez mettre à jour toutes les extensions avec :

```
qwen extensions update --all
```

## Création d'extensions

Nous proposons des commandes pour faciliter le développement d'extensions.

### Créer une extension basique

Nous fournissons plusieurs exemples d'extensions : `context`, `custom-commands`, `exclude-tools` et `mcp-server`. Vous pouvez consulter ces exemples [ici](https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/extensions/examples).

Pour copier l'un de ces exemples dans un répertoire de développement en choisissant le type souhaité, exécutez :

```
qwen extensions new chemin/vers/répertoire custom-commands
```

### Lier une extension locale

La commande `qwen extensions link` créera un lien symbolique depuis le répertoire d'installation des extensions vers le chemin de développement.

Cela est utile pour ne pas avoir à exécuter `qwen extensions update` chaque fois que vous apportez des modifications que vous souhaitez tester.

```
qwen extensions link chemin/vers/répertoire
```

## Fonctionnement

Au démarrage, Qwen Code recherche les extensions dans `<home>/.qwen/extensions`

Les extensions existent sous forme de répertoire contenant un fichier `qwen-extension.json`. Par exemple :

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

- `name` : Le nom de l'extension. Il est utilisé pour identifier de manière unique l'extension et pour résoudre les conflits lorsque les commandes d'extension portent le même nom que les commandes utilisateur ou projet. Le nom doit être en minuscules ou en chiffres et utiliser des tirets au lieu de traits de soulignement ou d'espaces. C'est ainsi que les utilisateurs feront référence à votre extension dans l'interface CLI. Notez que nous attendons que ce nom corresponde au nom du répertoire de l'extension.
- `version` : La version de l'extension.
- `mcpServers` : Une carte des serveurs MCP à configurer. La clé est le nom du serveur, et la valeur est la configuration du serveur. Ces serveurs seront chargés au démarrage, tout comme les serveurs MCP configurés dans un fichier [`settings.json`](./cli/configuration.md). Si une extension et un fichier `settings.json` configurent tous deux un serveur MCP avec le même nom, le serveur défini dans le fichier `settings.json` prendra le pas.
  - Notez que toutes les options de configuration du serveur MCP sont prises en charge, à l'exception de `trust`.
- `contextFileName` : Le nom du fichier qui contient le contexte de l'extension. Ce fichier sera utilisé pour charger le contexte depuis le répertoire de l'extension. Si cette propriété n'est pas utilisée mais qu'un fichier `QWEN.md` est présent dans le répertoire de votre extension, alors ce fichier sera chargé.
- `excludeTools` : Un tableau de noms d'outils à exclure du modèle. Vous pouvez également spécifier des restrictions spécifiques aux commandes pour les outils qui le permettent, comme l'outil `run_shell_command`. Par exemple, `"excludeTools": ["run_shell_command(rm -rf)"]` bloquera la commande `rm -rf`. Notez que cela diffère de la fonctionnalité `excludeTools` du serveur MCP, qui peut être listée dans la configuration du serveur MCP. **Important :** Les outils spécifiés dans `excludeTools` seront désactivés pour l'ensemble du contexte de conversation et affecteront toutes les requêtes suivantes dans la session en cours.

Au démarrage de Qwen Code, toutes les extensions sont chargées et leurs configurations fusionnées. En cas de conflit, la configuration de l'espace de travail prévaut.

### Commandes personnalisées

Les extensions peuvent fournir des [commandes personnalisées](./cli/commands.md#custom-commands) en plaçant des fichiers TOML dans un sous-répertoire `commands/` au sein du répertoire de l'extension. Ces commandes suivent le même format que les commandes personnalisées utilisateur et projet, et utilisent des conventions de nommage standards.

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

Les commandes d'extension ont la priorité la plus faible. Lorsqu'un conflit survient avec les commandes utilisateur ou de projet :

1. **Pas de conflit** : La commande d'extension utilise son nom naturel (par exemple, `/deploy`)
2. **Avec conflit** : La commande d'extension est renommée avec le préfixe de l'extension (par exemple, `/gcp.deploy`)

Par exemple, si à la fois un utilisateur et l'extension `gcp` définissent une commande `deploy` :

- `/deploy` - Exécute la commande deploy de l'utilisateur
- `/gcp.deploy` - Exécute la commande deploy de l'extension (marquée avec le tag `[gcp]`)

## Variables

Les extensions Qwen Code permettent la substitution de variables dans `qwen-extension.json`. Cela peut être utile si, par exemple, vous avez besoin du répertoire courant pour exécuter un serveur MCP en utilisant `"cwd": "${extensionPath}${/}run.ts"`.

**Variables prises en charge :**

| variable                   | description                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `${extensionPath}`         | Le chemin complet de l'extension dans le système de fichiers de l'utilisateur, par exemple '/Users/username/.qwen/extensions/example-extension'. Ne suit pas les liens symboliques. |
| `${workspacePath}`         | Le chemin complet de l'espace de travail actuel.                                                                                                                 |
| `${/} or ${pathSeparator}` | Le séparateur de chemin (varie selon le système d'exploitation).                                                                                                |