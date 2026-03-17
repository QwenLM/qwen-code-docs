# Connecter Qwen Code à des outils via MCP

Qwen Code peut se connecter à des outils externes et à des sources de données via le [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Les serveurs MCP donnent à Qwen Code un accès à vos outils, bases de données et API.

## Ce que vous pouvez faire avec MCP

Une fois des serveurs MCP connectés, vous pouvez demander à Qwen Code d’effectuer les actions suivantes :

- Travailler avec des fichiers et des dépôts (lecture/recherche/écriture, selon les outils que vous activez)  
- Interroger des bases de données (inspection du schéma, requêtes, rapports)  
- Intégrer des services internes (en encapsulant vos API sous forme d’outils MCP)  
- Automatiser des workflows (tâches répétables exposées sous forme d’outils ou de invites)

> [!tip]
>
> Si vous recherchez la « commande unique pour démarrer », rendez-vous directement à la section [Démarrage rapide](#démarrage-rapide).

## Démarrage rapide

Qwen Code charge les serveurs MCP depuis la propriété `mcpServers` de votre fichier `settings.json`. Vous pouvez configurer ces serveurs de deux manières :

- En modifiant directement le fichier `settings.json`  
- En utilisant les commandes `qwen mcp` (voir la [référence CLI](#référence-cli-qwen-mcp))

### Ajoutez votre premier serveur

1. Ajoutez un serveur (exemple : serveur MCP HTTP distant) :

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Ouvrez la boîte de dialogue de gestion MCP pour afficher et gérer les serveurs :

```bash
qwen mcp
```

3. Redémarrez Qwen Code dans le même projet (ou démarrez-le s’il n’était pas encore en cours d’exécution), puis demandez au modèle d’utiliser les outils provenant de ce serveur.

## Emplacement du stockage de la configuration (portées)

La plupart des utilisateurs n’ont besoin que de ces deux portées :

- **Portée projet (par défaut)** : `.qwen/settings.json` à la racine de votre projet  
- **Portée utilisateur** : `~/.qwen/settings.json` pour tous les projets de votre machine

Écrivez dans la portée utilisateur :

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Pour les couches de configuration avancées (valeurs par défaut système, paramètres système et règles de priorité), consultez [Paramètres](../configuration/settings).

## Configurer les serveurs

### Choisir un protocole de transport

| Protocole de transport | Quand l’utiliser                                                                 | Champ(s) JSON                                   |
| ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| `http`                 | Recommandé pour les services distants ; fonctionne bien avec les serveurs MCP cloud | `httpUrl` (+ en option `headers`)               |
| `sse`                  | Serveurs anciens ou obsolètes ne prenant en charge que les événements envoyés par le serveur (Server-Sent Events) | `url` (+ en option `headers`)                   |
| `stdio`                | Processus local (scripts, interfaces en ligne de commande, conteneurs Docker) sur votre machine | `command`, `args` (+ en option `cwd`, `env`) |

> [!note]
>
> Si un serveur prend en charge les deux protocoles, privilégiez **HTTP** plutôt que **SSE**.

### Configuration via `settings.json` ou via `qwen mcp add`

Les deux approches produisent les mêmes entrées `mcpServers` dans votre fichier `settings.json` : utilisez celle qui vous convient le mieux.

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

#### Serveur HTTP (flux HTTP distant pouvant être diffusé en continu)

JSON :

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer votre-jeton-api"
      },
      "timeout": 5000
    }
  }
}
```

CLI :

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer votre-jeton-api" --timeout 5000
```

#### Serveur SSE (événements envoyés par le serveur distants)

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

- **Confiance accordée au serveur** (`trust: true`) : contourne les invites de confirmation pour ce serveur (à utiliser avec parcimonie).

### Filtrage des outils (autorisation/refus des outils par serveur)

Utilisez `includeTools` / `excludeTools` pour restreindre les outils exposés par un serveur (du point de vue de Qwen Code).

Exemple : n’inclure que quelques outils :

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

### Listes globales d’autorisation/refus

L’objet `mcp` de votre fichier `settings.json` définit les règles globales applicables à tous les serveurs MCP :

- `mcp.allowed` : liste blanche des noms de serveurs MCP (clés de `mcpServers`)
- `mcp.excluded` : liste noire des noms de serveurs MCP

Exemple :

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## Résolution des problèmes

- **Le serveur affiche « Déconnecté » dans `qwen mcp list`** : vérifiez que l’URL ou la commande est correcte, puis augmentez la valeur de `timeout`.
- **Le serveur stdio ne parvient pas à démarrer** : utilisez un chemin absolu pour `command`, et vérifiez soigneusement les valeurs de `cwd` et `env`.
- **Les variables d’environnement dans le fichier JSON ne sont pas résolues** : assurez-vous qu’elles existent dans l’environnement où Qwen Code s’exécute (les environnements shell et applications graphiques peuvent différer).

## Référence

### Structure du fichier `settings.json`

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
      "cwd": "./repertoire-du-serveur",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

Propriétés de configuration :

Requises (l’une des suivantes) :

| Propriété | Description                                              |
| --------- | -------------------------------------------------------- |
| `command` | Chemin vers l’exécutable utilisé pour le transport Stdio |
| `url`     | URL du point de terminaison SSE (ex. `"http://localhost:8080/sse"`) |
| `httpUrl` | URL du point de terminaison HTTP en streaming            |

Facultatives :

| Propriété               | Type/Valeur par défaut                 | Description                                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | tableau                                | Arguments de ligne de commande pour le transport Stdio                                                                                                                                                                                                            |
| `headers`              | objet                                  | En-têtes HTTP personnalisés utilisés avec `url` ou `httpUrl`                                                                                                                                                                                                      |
| `env`                  | objet                                  | Variables d’environnement pour le processus serveur. Les valeurs peuvent faire référence à des variables d’environnement à l’aide de la syntaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                      |
| `cwd`                  | chaîne de caractères                   | Répertoire de travail pour le transport Stdio                                                                                                                                                                                                                     |
| `timeout`              | nombre<br>(par défaut : 600 000)       | Délai d’expiration de la requête en millisecondes (par défaut : 600 000 ms = 10 minutes)                                                                                                                                                                         |
| `trust`                | booléen<br>(par défaut : `false`)      | Lorsque cette valeur est définie sur `true`, toutes les confirmations d’appels d’outils sont ignorées pour ce serveur (par défaut : `false`)                                                                                                                      |
| `includeTools`         | tableau                                | Liste des noms d’outils à inclure depuis ce serveur MCP. Lorsqu’elle est spécifiée, seuls les outils figurant dans cette liste seront disponibles depuis ce serveur (comportement de liste blanche). Si elle n’est pas spécifiée, tous les outils du serveur sont activés par défaut.                                       |
| `excludeTools`         | tableau                                | Liste des noms d’outils à exclure de ce serveur MCP. Les outils figurant dans cette liste ne seront pas accessibles au modèle, même s’ils sont exposés par le serveur.<br>Remarque : `excludeTools` a priorité sur `includeTools` — si un outil figure dans les deux listes, il sera exclu. |
| `targetAudience`       | chaîne de caractères                   | ID client OAuth autorisé sur l’application protégée par IAP que vous tentez d’accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                         |
| `targetServiceAccount` | chaîne de caractères                   | Adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                                                    |

<a id="qwen-mcp-cli"></a>

### Gérer les serveurs MCP avec `qwen mcp`

Vous pouvez toujours configurer les serveurs MCP en modifiant manuellement le fichier `settings.json`, mais l’interface en ligne de commande est généralement plus rapide.

#### Ajout d’un serveur (`qwen mcp add`)

```bash
qwen mcp add [options] <nom> <commandeOuUrl> [arguments...]
```

| Argument/Option     | Description                                                                 | Valeur par défaut | Exemple                                     |
| ------------------- | --------------------------------------------------------------------------- | ----------------- | ------------------------------------------- |
| `<nom>`             | Nom unique du serveur.                                                      | —                 | `exemple-serveur`                           |
| `<commandeOuUrl>`   | Commande à exécuter (pour `stdio`) ou URL (pour `http`/`sse`).             | —                 | `/usr/bin/python` ou `http://localhost:8`   |
| `[arguments...]`    | Arguments facultatifs pour une commande `stdio`.                           | —                 | `--port 5000`                               |
| `-s`, `--scope`     | Portée de la configuration (utilisateur ou projet).                        | `projet`          | `-s utilisateur`                            |
| `-t`, `--transport` | Type de transport (`stdio`, `sse`, `http`).                                 | `stdio`           | `-t sse`                                    |
| `-e`, `--env`       | Définit des variables d’environnement.                                      | —                 | `-e CLÉ=valeur`                             |
| `-H`, `--header`    | Définit les en-têtes HTTP pour les transports SSE et HTTP.                  | —                 | `-H "X-Api-Key: abc123"`                    |
| `--timeout`         | Définit le délai d’attente de connexion en millisecondes.                  | —                 | `--timeout 30000`                           |
| `--trust`           | Fait confiance au serveur (ignore toutes les demandes de confirmation des appels d’outils). | — (`false`)       | `--trust`                                   |
| `--description`     | Définit la description du serveur.                                          | —                 | `--description "Outils locaux"`             |
| `--include-tools`   | Liste séparée par des virgules des outils à inclure.                       | tous les outils inclus | `--include-tools monoutil,autreoutil`    |
| `--exclude-tools`   | Liste séparée par des virgules des outils à exclure.                       | aucun             | `--exclude-tools monoutil`                  |

#### Suppression d’un serveur (`qwen mcp remove`)

```bash
qwen mcp remove <nom>
```