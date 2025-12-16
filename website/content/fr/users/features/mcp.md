# Connecter Qwen Code aux outils via MCP

Qwen Code peut se connecter à des outils externes et des sources de données via le [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Les serveurs MCP donnent à Qwen Code l'accès à vos outils, bases de données et API.

## Ce que vous pouvez faire avec MCP

Avec des serveurs MCP connectés, vous pouvez demander à Qwen Code de :

- Travailler avec des fichiers et des dépôts (lire/rechercher/écrire, selon les outils activés)
- Interroger des bases de données (inspection du schéma, requêtes, rapports)
- Intégrer des services internes (encapsuler vos API en tant qu'outils MCP)
- Automatiser des workflows (tâches reproductibles exposées sous forme d'outils/prompts)

> [!tip]
> Si vous cherchez la « commande unique pour démarrer », rendez-vous directement à la section [Démarrage rapide](#démarrage-rapide).

## Démarrage rapide

Qwen Code charge les serveurs MCP depuis `mcpServers` dans votre fichier `settings.json`. Vous pouvez configurer les serveurs soit :

- En modifiant directement le fichier `settings.json`
- En utilisant les commandes `qwen mcp` (voir [Référence CLI](#référence-cli-qwen-mcp))

### Ajouter votre premier serveur

1. Ajoutez un serveur (exemple : serveur MCP HTTP distant) :

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Vérifiez qu'il apparaît :

```bash
qwen mcp list
```

3. Redémarrez Qwen Code dans le même projet (ou démarrez-le s'il ne tournait pas encore), puis demandez au modèle d'utiliser des outils provenant de ce serveur.

## Emplacement de stockage de la configuration (portées)

La plupart des utilisateurs n'ont besoin que de ces deux portées :

- **Portée projet (par défaut)** : `.qwen/settings.json` à la racine de votre projet
- **Portée utilisateur** : `~/.qwen/settings.json` pour tous les projets sur votre machine

Écrire dans la portée utilisateur :

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
> Pour les couches de configuration avancées (valeurs par défaut du système/paramètres système et règles de priorité), voir [Paramètres](../users/configuration/settings).

## Configurer les serveurs

### Choisir un transport

| Transport | Quand l'utiliser                                                  | Champ(s) JSON                              |
| --------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `http`    | Recommandé pour les services distants ; fonctionne bien avec les serveurs MCP cloud | `httpUrl` (+ `headers` facultatifs)        |
| `sse`     | Serveurs hérités/obsolètes qui ne prennent en charge que les événements envoyés par le serveur | `url` (+ `headers` facultatifs)            |
| `stdio`   | Processus local (scripts, CLI, Docker) sur votre machine          | `command`, `args` (+ `cwd`, `env` facultatifs) |

> [!note]
> Si un serveur prend en charge les deux, préférez **HTTP** à **SSE**.

### Configuration via `settings.json` vs `qwen mcp add`

Les deux approches produisent les mêmes entrées `mcpServers` dans votre `settings.json` — utilisez celle que vous préférez.

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

CLI (écrit dans la portée du projet par défaut) :

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### Serveur HTTP (flux HTTP distant)

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

- **Confiance du serveur** (`trust: true`) : contourne les invites de confirmation pour ce serveur (à utiliser avec parcimonie).

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

### Listes globales d'autorisation/exclusion

L'objet `mcp` dans votre `settings.json` définit des règles globales pour tous les serveurs MCP :

- `mcp.allowed` : liste d'autorisation des noms de serveurs MCP (clés dans `mcpServers`)
- `mcp.excluded` : liste d'exclusion des noms de serveurs MCP

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

- **Le serveur affiche « Disconnected » dans `qwen mcp list`** : vérifiez que l'URL/la commande est correcte, puis augmentez le `timeout`.
- **Le serveur stdio ne démarre pas** : utilisez un chemin absolu pour `command`, et vérifiez soigneusement `cwd`/`env`.
- **Les variables d’environnement dans le JSON ne se résolvent pas** : assurez-vous qu’elles existent dans l’environnement où Qwen Code s’exécute (les environnements shell et application graphique peuvent différer).

## Référence

### Structure de `settings.json`

#### Configuration spécifique au serveur (`mcpServers`)

Ajoutez un objet `mcpServers` à votre fichier `settings.json` :

```json
// ... le fichier contient d'autres objets de configuration
{
  "mcpServers": {
    "serverName": {
      "command": "chemin/vers/le/serveur",
      "args": ["--arg1", "valeur1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./répertoire-serveur",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Propriétés de configuration :

Requis (l'une des propriétés suivantes) :

| Propriété | Description                                               |
| --------- | --------------------------------------------------------- |
| `command` | Chemin vers l'exécutable pour le transport Stdio          |
| `url`     | URL du point de terminaison SSE (ex : `"http://localhost:8080/sse"`) |
| `httpUrl` | URL du point de terminaison de streaming HTTP             |

Optionnel :

| Propriété              | Type/Valeur par défaut           | Description                                                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | tableau                          | Arguments de ligne de commande pour le transport Stdio                                                                                                                                                                                                           |
| `headers`              | objet                            | En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`                                                                                                                                                                                          |
| `env`                  | objet                            | Variables d'environnement pour le processus du serveur. Les valeurs peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                           |
| `cwd`                  | chaîne de caractères             | Répertoire de travail pour le transport Stdio                                                                                                                                                                                                                    |
| `timeout`              | nombre<br>(par défaut : 600 000) | Délai d'expiration des requêtes en millisecondes (par défaut : 600 000 ms = 10 minutes)                                                                                                                                                                          |
| `trust`                | booléen<br>(par défaut : false)  | Si `true`, contourne toutes les confirmations d'appel d'outils pour ce serveur (par défaut : `false`)                                                                                                                                                             |
| `includeTools`         | tableau                          | Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsque cette propriété est spécifiée, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste autorisée). Si non spécifié, tous les outils du serveur sont activés par défaut. |
| `excludeTools`         | tableau                          | Liste des noms d'outils à exclure depuis ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur.<br>Note : `excludeTools` prime sur `includeTools` – si un outil figure dans les deux listes, il sera exclu. |
| `targetAudience`       | chaîne de caractères             | L'ID client OAuth mis sur liste blanche sur l'application protégée par IAP à laquelle vous tentez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                  |
| `targetServiceAccount` | chaîne de caractères             | Adresse e-mail du compte de service Google Cloud à impersonnaliser. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                                           |

<a id="qwen-mcp-cli"></a>

### Gérer les serveurs MCP avec `qwen mcp`

Vous pouvez toujours configurer les serveurs MCP en modifiant manuellement `settings.json`, mais l'interface en ligne de commande est généralement plus rapide.

#### Ajouter un serveur (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option     | Description                                                         | Valeur par défaut  | Exemple                                   |
| ------------------- | ------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| `<name>`            | Un nom unique pour le serveur.                                      | —                  | `example-server`                          |
| `<commandOrUrl>`    | La commande à exécuter (pour `stdio`) ou l'URL (pour `http`/`sse`). | —                  | `/usr/bin/python` ou `http://localhost:8` |
| `[args...]`         | Arguments optionnels pour une commande `stdio`.                     | —                  | `--port 5000`                             |
| `-s`, `--scope`     | Portée de la configuration (utilisateur ou projet).                 | `project`          | `-s user`                                 |
| `-t`, `--transport` | Type de transport (`stdio`, `sse`, `http`).                         | `stdio`            | `-t sse`                                  |
| `-e`, `--env`       | Définir des variables d'environnement.                              | —                  | `-e KEY=value`                            |
| `-H`, `--header`    | Définir des en-têtes HTTP pour les transports SSE et HTTP.          | —                  | `-H "X-Api-Key: abc123"`                  |
| `--timeout`         | Définir le délai d'attente de connexion en millisecondes.           | —                  | `--timeout 30000`                         |
| `--trust`           | Faire confiance au serveur (contourne toutes les confirmations d'appel d'outils). | — (`false`)        | `--trust`                                 |
| `--description`     | Définir la description du serveur.                                  | —                  | `--description "Outils locaux"`           |
| `--include-tools`   | Liste d'outils à inclure, séparés par des virgules.                 | tous les outils inclus | `--include-tools mytool,othertool`        |
| `--exclude-tools`   | Liste d'outils à exclure, séparés par des virgules.                 | aucun              | `--exclude-tools mytool`                  |

#### Liste des serveurs (`qwen mcp list`)

```bash
qwen mcp list
```

#### Suppression d'un serveur (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```