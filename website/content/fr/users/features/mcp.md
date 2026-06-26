# Connecter Qwen Code aux outils via MCP

Qwen Code peut se connecter à des outils externes et des sources de données via le [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Les serveurs MCP donnent à Qwen Code un accès à vos outils, bases de données et API.

## Ce que vous pouvez faire avec MCP

Avec des serveurs MCP connectés, vous pouvez demander à Qwen Code de :

- Travailler avec des fichiers et des dépôts (lecture/recherche/écriture, selon les outils que vous activez)
- Interroger des bases de données (inspection de schéma, requêtes, rapports)
- Intégrer des services internes (encapsuler vos API en outils MCP)
- Automatiser des workflows (tâches répétables exposées sous forme d’outils/prompts)

> [!tip]
>
> Si vous cherchez la « commande unique pour démarrer », rendez-vous directement au [Démarrage rapide](#démarrage-rapide).

## Démarrage rapide

Qwen Code charge les serveurs MCP depuis `mcpServers` dans votre `settings.json`. Vous pouvez configurer les serveurs soit :

- En modifiant directement `settings.json`
- En utilisant les commandes `qwen mcp` (voir [Référence CLI](#gérer-les-serveurs-mcp-avec-qwen-mcp))

### Ajouter votre premier serveur

1. Ajoutez un serveur (exemple : serveur MCP HTTP distant) :

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Lancez Qwen Code et ouvrez la boîte de dialogue de gestion MCP pour voir et gérer les serveurs :

```bash
qwen
```

Puis saisissez :

```text
/mcp
```

3. Si Qwen Code était déjà en cours d’exécution avant l’ajout du serveur, redémarrez-le dans le même projet. Ensuite, demandez au modèle d’utiliser les outils de ce serveur.

## Où la configuration est stockée (scopes)

La plupart des utilisateurs n’ont besoin que de ces deux scopes :

- **Scope utilisateur (par défaut)** : `~/.qwen/settings.json` pour tous les projets sur votre machine
- **Scope projet** : `.qwen/settings.json` à la racine de votre projet

Écrire dans le scope utilisateur :

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Pour les couches de configuration avancées (paramètres système par défaut et règles de précédence), voir [Paramètres](../configuration/settings).

## Configurer les serveurs

### Choisir un transport

| Transport | Quand utiliser                                                     | Champ(s) JSON                              |
| --------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `http`    | Recommandé pour les services distants ; fonctionne bien pour les serveurs MCP cloud | `httpUrl` (+ `headers` optionnel)          |
| `sse`     | Serveurs existants/dépréciés qui ne supportent que les Server-Sent Events | `url` (+ `headers` optionnel)              |
| `stdio`   | Processus local (scripts, CLI, Docker) sur votre machine           | `command`, `args` (+ `cwd`, `env` optionnels) |

> [!note]
>
> Si un serveur supporte les deux, préférez **HTTP** plutôt que **SSE**.

### Configurer via `settings.json` vs `qwen mcp add`

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

CLI (écrit dans le scope utilisateur par défaut) :

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

## Utiliser les prompts et ressources MCP

En plus des outils, Qwen Code découvre et expose deux autres primitives MCP.

### Prompts (commandes slash)

Tout prompt annoncé par un serveur via `prompts/list` devient une **commande slash** exécutable. Après la découverte, tapez `/` et vous verrez le prompt listé (étiqueté `MCP: <server>`) ; exécutez-le comme n’importe quelle autre commande :

```text
/my_prompt --arg1="value" --arg2="value"
# la forme positionnelle fonctionne aussi :
/my_prompt "value" "value"
# afficher les arguments du prompt :
/my_prompt help
```

Les messages du prompt sont envoyés au modèle, qui agit ensuite en conséquence.

> La découverte est tolérante quant à la capacité `prompts` déclarée : certains serveurs implémentent `prompts/list` mais omettent `prompts` dans leurs capacités `initialize`. Qwen Code tente quand même `prompts/list`, donc ces prompts apparaissent. Un serveur qui n’a vraiment aucun prompt répond simplement `Method not found`, ce qui est ignoré.

### Ressources

Les ressources annoncées par un serveur via `resources/list` sont découvertes par serveur. Ouvrez la boîte de dialogue de gestion avec `/mcp` et sélectionnez un serveur pour voir son nombre de **Ressources** à côté de ses outils et prompts. Choisissez **Voir les ressources** pour parcourir les URI de ressources du serveur ; en sélectionner une affiche sa description et son type MIME, ainsi que la référence exacte `@server:uri` à coller dans un message. Comme pour les prompts, la capacité `resources` n’a pas besoin d’être déclarée.

Injectez le contenu d’une ressource dans votre message avec la syntaxe `@server:uri` — tapez `@`, puis le nom du serveur, deux-points et l’URI de la ressource :

```text
résume @myserver:file:///docs/spec.md et liste les questions ouvertes
```

En tapant `@myserver:`, une liste d’autocomplétion des ressources de ce serveur apparaît ; continuez à taper pour filtrer, en faisant correspondre (sans distinction de casse) soit l’URI de la ressource, soit son nom/titre convivial. Vous n’avez pas besoin de connaître une URI par cœur — avant d’atteindre les deux-points, taper une partie du nom du serveur suggère également les serveurs correspondants qui exposent des ressources, vous pouvez donc en choisir un et accéder directement à sa liste de ressources. Lors de l’envoi, la ressource référencée est lue et son contenu est ajouté à votre message (texte en ligne, blobs binaires en pièces jointes) ; la référence `@server:uri` est conservée dans le prompt pour que le modèle sache ce qu’il regarde. Le préfixe `server` doit correspondre à un serveur MCP configuré — sinon le jeton est traité comme un chemin de fichier normal, donc les références existantes `@path/to/file` ne sont pas affectées. Les lectures de ressources sont désactivées dans les dossiers non fiables.

## Disponibilité progressive et délais d’expiration de découverte

Qwen Code découvre les serveurs MCP en arrière-plan une fois l’interface utilisateur déjà interactive. Vous voyez la première invite CLI en quelques centaines de millisecondes, même si l’un de vos serveurs MCP prend plusieurs secondes (ou ne répond jamais), et la liste des outils du modèle se met à jour en environ une image (~16 ms) après que chaque serveur a terminé sa poignée de main de découverte.

- **Mode interactif** : l’interface apparaît immédiatement ; un indicateur d’état MCP en bas à droite affiche `N/M serveurs MCP prêts` pendant la découverte. Envoyer un prompt avant la fin de la découverte MCP signifie simplement que le modèle voit les outils _prêts à ce moment-là_ ; les prompts suivants voient plus d’outils au fur et à mesure que les serveurs se connectent.
- **Mode non interactif** (`--prompt`, stream-json, ACP) : la CLI attend toujours que la découverte MCP soit terminée avant d’envoyer le premier prompt, de sorte que les invocations scriptées / par pipe voient le même ensemble complet d’outils que le comportement synchrone hérité.

### `discoveryTimeoutMs` par serveur

Chaque serveur MCP dispose d’un délai d’expiration dédié à la découverte qui limite la durée de la poignée de main initiale (`connect` + `tools/list` + `prompts/list` + `resources/list`). Valeurs par défaut :

- **Serveurs stdio** : 30 s
- **Serveurs HTTP / SSE distants** : 5 s (le risque réseau est plus élevé)

Remplacez par serveur si nécessaire :

```jsonc
{
  "mcpServers": {
    "slow-stdio": {
      "command": "node",
      "args": ["./slow-server.js"],
      "discoveryTimeoutMs": 60000,
    },
    "flaky-remote": {
      "httpUrl": "https://example.com/mcp",
      "discoveryTimeoutMs": 10000,
    },
  },
}
```

Le champ `timeout` existant est le délai d’expiration **d’appel d’outil** (utilisé pour chaque requête `tools/call`, par défaut 10 minutes) et n’est pas affecté par `discoveryTimeoutMs` — une invocation longue d’outil n’est pas un problème de démarrage.

### Revenir au MCP progressif

Si vous avez besoin de l’ancien comportement synchrone (la CLI attend chaque serveur MCP avant d’afficher l’interface), définissez `QWEN_CODE_LEGACY_MCP_BLOCKING=1` dans votre environnement. Cette option est conservée comme échappatoire pendant au moins une version.

## Sécurité et contrôle

### Confiance (ignorer les confirmations)

- **Confiance serveur** (`trust: true`) : ignore les invites de confirmation pour ce serveur (à utiliser avec parcimonie).

### Authentification OAuth

Qwen Code prend en charge l’authentification OAuth 2.0 pour les serveurs MCP. Cela est utile lors de l’accès à des serveurs distants nécessitant une authentification.

#### Utilisation de base

Lorsque vous ajoutez un serveur MCP avec des identifiants OAuth, Qwen Code gère automatiquement le flux d’authentification :

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Important : Configuration de l’URI de redirection

Le flux OAuth nécessite une URI de redirection où le fournisseur d’autorisation envoie le code d’authentification.

- **Développement local** : Par défaut, Qwen Code utilise `http://localhost:7777/oauth/callback`. Cela fonctionne lorsque vous exécutez Qwen Code sur votre machine locale avec un navigateur local.

- **Déploiements distants/cloud** : Lorsque vous exécutez Qwen Code sur des serveurs distants, des IDE cloud ou des terminaux web, la redirection `localhost` par défaut ne fonctionnera PAS. Vous DEVEZ configurer `--oauth-redirect-uri` pour pointer vers une URL accessible publiquement qui peut recevoir le callback OAuth.

Exemple pour des serveurs distants :

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### Configuration manuelle via settings.json

Vous pouvez également configurer OAuth en modifiant directement `settings.json` :

```json
{
  "mcpServers": {
    "oauthServer": {
      "url": "https://api.example.com/sse/",
      "oauth": {
        "enabled": true,
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authorizationUrl": "https://provider.example.com/authorize",
        "tokenUrl": "https://provider.example.com/token",
        "redirectUri": "https://your-server.com/oauth/callback",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

Propriétés de configuration OAuth :

| Propriété         | Description                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`         | Activer OAuth pour ce serveur (booléen)                                                                                        |
| `clientId`        | Identifiant client OAuth (chaîne, optionnel avec enregistrement dynamique)                                                      |
| `clientSecret`    | Secret client OAuth (chaîne, optionnel pour les clients publics)                                                               |
| `authorizationUrl`| Point de terminaison d’autorisation OAuth (chaîne, auto-découvert si omis)                                                     |
| `tokenUrl`        | Point de terminaison de jeton OAuth (chaîne, auto-découvert si omis)                                                           |
| `scopes`          | Scopes OAuth requis (tableau de chaînes)                                                                                       |
| `redirectUri`     | URI de redirection personnalisée (chaîne). **Critique pour les déploiements distants**. Par défaut : `http://localhost:7777/oauth/callback` |
| `tokenParamName`  | Nom du paramètre de requête pour les jetons dans les URL SSE (chaîne)                                                          |
| `audiences`       | Audiences pour lesquelles le jeton est valide (tableau de chaînes)                                                              |

#### Gestion des jetons

Les jetons OAuth sont automatiquement :

- **Stockés** dans `~/.qwen/mcp-oauth-tokens.json` (texte brut, mode 0600) par défaut. Si `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` est défini, Qwen Code utilise un stockage basé sur le trousseau d’accès lorsque disponible, ou `~/.qwen/mcp-oauth-tokens-v2.json` avec chiffrement AES-256-GCM.
- **Rafraîchis** lorsqu’ils arrivent à expiration (si des jetons de rafraîchissement sont disponibles)
- **Validés** avant chaque tentative de connexion

> [!WARNING]
> Par défaut, les jetons OAuth sont stockés non chiffrés sur le disque. Sur les machines partagées ou multi-utilisateurs, définissez `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` pour protéger les identifiants.

Utilisez la boîte de dialogue `/mcp` dans Qwen Code pour inspecter les serveurs MCP et gérer l’authentification de manière interactive.

### Filtrage des outils (autoriser/interdire des outils par serveur)

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

### Listes globales d’autorisation/interdiction

L’objet `mcp` dans votre `settings.json` définit les règles globales pour tous les serveurs MCP :

- `mcp.allowed` : liste d’autorisation de noms de serveurs MCP (clés dans `mcpServers`)
- `mcp.excluded` : liste d’interdiction de noms de serveurs MCP

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

- **Le serveur affiche « Déconnecté » dans `qwen mcp list`** : vérifiez que l’URL/la commande est correcte, puis augmentez `timeout`.
- **Le serveur Stdio ne démarre pas** : utilisez un chemin absolu pour `command` et vérifiez `cwd`/`env`.
- **Les variables d’environnement dans JSON ne se résolvent pas** : assurez-vous qu’elles existent dans l’environnement où Qwen Code s’exécute (les environnements shell et GUI peuvent différer).

## Référence

### Structure de `settings.json`

#### Configuration spécifique au serveur (`mcpServers`)

Ajoutez un objet `mcpServers` à votre fichier `settings.json` :

```json
// ... le fichier contient d’autres objets de configuration
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

Requis (un des éléments suivants) :

| Propriété | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `command` | Chemin vers l’exécutable pour le transport Stdio             |
| `url`     | URL du point de terminaison SSE (ex. `"http://localhost:8080/sse"`) |
| `httpUrl` | URL du point de terminaison HTTP streaming                   |

Optionnel :

| Propriété             | Type/Défaut                  | Description                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                | tableau                      | Arguments de ligne de commande pour le transport Stdio                                                                                                                                                                                                              |
| `headers`             | objet                        | En-têtes HTTP personnalisés lors de l’utilisation de `url` ou `httpUrl`                                                                                                                                                                                             |
| `env`                 | objet                        | Variables d’environnement pour le processus serveur. Les valeurs peuvent référencer des variables d’environnement avec la syntaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                      |
| `cwd`                 | chaîne                       | Répertoire de travail pour le transport Stdio                                                                                                                                                                                                                       |
| `timeout`             | nombre<br>(défaut : 600 000) | Délai d’expiration de requête en millisecondes (défaut : 600 000 ms = 10 minutes)                                                                                                                                                                                   |
| `trust`               | booléen<br>(défaut : false)  | Quand `true`, ignore toutes les confirmations d’appel d’outil pour ce serveur (défaut : `false`)                                                                                                                                                                    |
| `includeTools`        | tableau                      | Liste des noms d’outils à inclure depuis ce serveur MCP. Lorsqu’elle est spécifiée, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste blanche). Si non spécifiée, tous les outils du serveur sont activés par défaut.            |
| `excludeTools`        | tableau                      | Liste des noms d’outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s’ils sont exposés par le serveur.<br>Remarque : `excludeTools` a priorité sur `includeTools` – si un outil est dans les deux listes, il sera exclu. |
| `targetAudience`      | chaîne                       | L’identifiant client OAuth autorisé sur l’application protégée par IAP à laquelle vous essayez d’accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                        |
| `targetServiceAccount`| chaîne                       | L’adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                                                     |

<a id="qwen-mcp-cli"></a>

### Gérer les serveurs MCP avec `qwen mcp`

Vous pouvez toujours configurer les serveurs MCP en modifiant manuellement `settings.json`, mais la CLI est généralement plus rapide.

#### Ajouter un serveur (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option               | Description                                                                  | Par défaut                             | Exemple                                                            |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                      | Un nom unique pour le serveur.                                               | —                                      | `example-server`                                                   |
| `<commandOrUrl>`              | La commande à exécuter (pour `stdio`) ou l’URL (pour `http`/`sse`).          | —                                      | `/usr/bin/python` ou `http://localhost:8`                          |
| `[args...]`                   | Arguments optionnels pour une commande `stdio`.                              | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`               | Scope de configuration (utilisateur ou projet).                              | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`           | Type de transport (`stdio`, `sse`, `http`).                                  | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`                 | Définir des variables d’environnement.                                       | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`              | Définir des en-têtes HTTP pour les transports SSE et HTTP.                   | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                   | Définir le délai d’expiration de connexion en millisecondes.                 | —                                      | `--timeout 30000`                                                  |
| `--trust`                     | Faire confiance au serveur (ignorer toutes les invites de confirmation d’appel d’outil). | — (`false`)                | `--trust`                                                          |
| `--description`               | Définir la description du serveur.                                           | —                                      | `--description "Outils locaux"`                                    |
| `--include-tools`             | Liste séparée par des virgules des outils à inclure.                         | tous les outils inclus                 | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`             | Liste séparée par des virgules des outils à exclure.                         | aucun                                  | `--exclude-tools mytool`                                           |
| `--oauth-client-id`           | Identifiant client OAuth pour l’authentification du serveur MCP.             | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`       | Secret client OAuth pour l’authentification du serveur MCP.                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`        | URI de redirection OAuth pour le callback d’authentification.                | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url`   | URL d’autorisation OAuth.                                                    | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`           | URL de jeton OAuth.                                                          | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`              | Scopes OAuth (séparés par des virgules).                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |
> Les drapeaux `--oauth-*` s'appliquent uniquement à `--transport sse` et `--transport http`. Les combiner avec `--transport stdio` est rejeté.

#### Suppression d'un serveur (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```