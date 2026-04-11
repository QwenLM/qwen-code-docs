# Connecter Qwen Code à des outils via MCP

Qwen Code peut se connecter à des outils et des sources de données externes via le [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Les serveurs MCP donnent à Qwen Code accès à vos outils, bases de données et API.

## Ce que vous pouvez faire avec MCP

Avec des serveurs MCP connectés, vous pouvez demander à Qwen Code de :

- Travailler avec des fichiers et des dépôts (lecture/recherche/écriture, selon les outils que vous activez)
- Interroger des bases de données (inspection de schéma, requêtes, rapports)
- Intégrer des services internes (exposer vos API sous forme d'outils MCP)
- Automatiser des workflows (tâches répétitives exposées sous forme d'outils/prompts)

> [!tip]
>
> Si vous cherchez la « commande unique pour commencer », passez directement à [Démarrage rapide](#quick-start).

## Démarrage rapide

Qwen Code charge les serveurs MCP depuis `mcpServers` dans votre `settings.json`. Vous pouvez configurer les serveurs de deux manières :

- En modifiant directement `settings.json`
- En utilisant les commandes `qwen mcp` (voir [Référence CLI](#qwen-mcp-cli))

### Ajouter votre premier serveur

1. Ajoutez un serveur (exemple : serveur MCP HTTP distant) :

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Ouvrez la boîte de dialogue de gestion MCP pour afficher et gérer les serveurs :

```bash
qwen mcp
```

3. Redémarrez Qwen Code dans le même projet (ou lancez-le s'il n'était pas encore en cours d'exécution), puis demandez au modèle d'utiliser les outils de ce serveur.

## Où la configuration est stockée (portées)

La plupart des utilisateurs n'ont besoin que de ces deux portées :

- **Portée projet (par défaut)** : `.qwen/settings.json` à la racine de votre projet
- **Portée utilisateur** : `~/.qwen/settings.json` pour tous les projets sur votre machine

Écrire dans la portée utilisateur :

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Pour les couches de configuration avancées (paramètres système par défaut et règles de priorité), consultez [Paramètres](../configuration/settings).

## Configurer les serveurs

### Choisir un transport

| Transport | Quand l'utiliser | Champ(s) JSON |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Recommandé pour les services distants ; fonctionne bien pour les serveurs MCP cloud | `httpUrl` (+ `headers` optionnel)            |
| `sse`     | Serveurs hérités/dépréciés qui ne prennent en charge que les Server-Sent Events    | `url` (+ `headers` optionnel)                |
| `stdio`   | Processus local (scripts, CLI, Docker) sur votre machine             | `command`, `args` (+ `cwd`, `env` optionnels) |

> [!note]
>
> Si un serveur prend en charge les deux, privilégiez **HTTP** plutôt que **SSE**.

### Configurer via `settings.json` ou `qwen mcp add`

Les deux approches génèrent les mêmes entrées `mcpServers` dans votre `settings.json` : utilisez celle que vous préférez.

#### Serveur Stdio (processus local)

JSON (`.qwen/settings.json`) :

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

CLI (écrit dans la portée projet par défaut) :

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### Serveur HTTP (HTTP streamable distant)

JSON :

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token"
      },
      "timeout": 5000
    }
  }
}
```

CLI :

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### Serveur SSE (Server-Sent Events distant)

JSON :

```json
{
  "mcpServers": {
    "sseServer": {
      "url": "http://localhost:8080/sse",
      "timeout": 30000
    }
  }
}
```

CLI :

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## Sécurité et contrôle

### Confiance (ignorer les confirmations)

- **Confiance serveur** (`trust: true`) : ignore les invites de confirmation pour ce serveur (à utiliser avec parcimonie).

### Filtrage des outils (autoriser/refuser des outils par serveur)

Utilisez `includeTools` / `excludeTools` pour restreindre les outils exposés par un serveur (du point de vue de Qwen Code).

Exemple : inclure uniquement quelques outils :

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      "timeout": 30000
    }
  }
}
```

### Listes d'autorisation/refus globales

L'objet `mcp` dans votre `settings.json` définit les règles globales pour tous les serveurs MCP :

- `mcp.allowed` : liste d'autorisation des noms de serveurs MCP (clés dans `mcpServers`)
- `mcp.excluded` : liste de refus des noms de serveurs MCP

Exemple :

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## Dépannage

- **Le serveur affiche « Disconnected » dans `qwen mcp list`** : vérifiez que l'URL/commande est correcte, puis augmentez `timeout`.
- **Le serveur Stdio ne démarre pas** : utilisez un chemin `command` absolu et vérifiez `cwd`/`env`.
- **Les variables d'environnement dans le JSON ne sont pas résolues** : assurez-vous qu'elles existent dans l'environnement où Qwen Code s'exécute (les environnements shell et application GUI peuvent différer).

## Référence

### Structure de `settings.json`

#### Configuration spécifique au serveur (`mcpServers`)

Ajoutez un objet `mcpServers` à votre fichier `settings.json` :

```json
// ... file contains other config objects
{
  "mcpServers": {
    "serverName": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-directory",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Propriétés de configuration :

Obligatoire (l'un des suivants) :

| Propriété  | Description                                            |
| --------- | ------------------------------------------------------ |
| `command` | Chemin vers l'exécutable pour le transport Stdio             |
| `url`     | URL du point de terminaison SSE (ex. `"http://localhost:8080/sse"`) |
| `httpUrl` | URL du point de terminaison de streaming HTTP                            |

Optionnel :

| Propriété               | Type/Valeur par défaut                 | Description                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Arguments de ligne de commande pour le transport Stdio                                                                                                                                                                                                                        |
| `headers`              | object                       | En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`                                                                                                                                                                                                                 |
| `env`                  | object                       | Variables d'environnement pour le processus serveur. Les valeurs peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                                                |
| `cwd`                  | string                       | Répertoire de travail pour le transport Stdio                                                                                                                                                                                                                             |
| `timeout`              | number<br>(par défaut : 600 000) | Délai d'expiration de la requête en millisecondes (par défaut : 600 000 ms = 10 minutes)                                                                                                                                                                                                 |
| `trust`                | boolean<br>(par défaut : false)  | Lorsque `true`, ignore toutes les confirmations d'appel d'outil pour ce serveur (par défaut : `false`)                                                                                                                                                                              |
| `includeTools`         | array                        | Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsqu'elle est spécifiée, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste d'autorisation). Si non spécifiée, tous les outils du serveur sont activés par défaut.                                       |
| `excludeTools`         | array                        | Liste des noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur.<br>Remarque : `excludeTools` est prioritaire sur `includeTools` - si un outil figure dans les deux listes, il sera exclu. |
| `targetAudience`       | string                       | L'ID client OAuth autorisé sur l'application protégée par IAP que vous essayez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                         |
| `targetServiceAccount` | string                       | L'adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### Gérer les serveurs MCP avec `qwen mcp`

Vous pouvez toujours configurer les serveurs MCP en modifiant manuellement `settings.json`, mais la CLI est généralement plus rapide.

#### Ajouter un serveur (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option     | Description                                                         | Par défaut            | Exemple                                   |
| ------------------- | ------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| `<name>`            | Nom unique pour le serveur.                                       | —                  | `example-server`                          |
| `<commandOrUrl>`    | Commande à exécuter (pour `stdio`) ou URL (pour `http`/`sse`). | —                  | `/usr/bin/python` ou `http://localhost:8` |
| `[args...]`         | Arguments optionnels pour une commande `stdio`.                           | —                  | `--port 5000`                             |
| `-s`, `--scope`     | Portée de configuration (utilisateur ou projet).                              | `project`          | `-s user`                                 |
| `-t`, `--transport` | Type de transport (`stdio`, `sse`, `http`).                            | `stdio`            | `-t sse`                                  |
| `-e`, `--env`       | Définir des variables d'environnement.                                          | —                  | `-e KEY=value`                            |
| `-H`, `--header`    | Définir des en-têtes HTTP pour les transports SSE et HTTP.                       | —                  | `-H "X-Api-Key: abc123"`                  |
| `--timeout`         | Définir le délai d'expiration de la connexion en millisecondes.                             | —                  | `--timeout 30000`                         |
| `--trust`           | Faire confiance au serveur (ignorer toutes les invites de confirmation d'appel d'outil).       | — (`false`)        | `--trust`                                 |
| `--description`     | Définir la description du serveur.                                 | —                  | `--description "Local tools"`             |
| `--include-tools`   | Liste d'outils à inclure, séparés par des virgules.                         | tous les outils inclus | `--include-tools mytool,othertool`        |
| `--exclude-tools`   | Liste d'outils à exclure, séparés par des virgules.                         | aucun               | `--exclude-tools mytool`                  |

#### Supprimer un serveur (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```