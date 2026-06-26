# Connecter Qwen Code aux outils via MCP

Qwen Code peut se connecter à des outils externes et à des sources de données via le [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Les serveurs MCP donnent à Qwen Code l'accès à vos outils, bases de données et API.

## Ce que vous pouvez faire avec MCP

Avec des serveurs MCP connectés, vous pouvez demander à Qwen Code de :

- Travailler avec des fichiers et des dépôts (lire/rechercher/écrire, selon les outils que vous activez)
- Interroger des bases de données (inspection de schéma, requêtes, rapports)
- Intégrer des services internes (encapsuler vos API en tant qu'outils MCP)
- Automatiser des flux de travail (tâches répétables exposées comme outils/prompts)

> [!tip]
>
> Si vous cherchez la « commande unique pour démarrer », rendez-vous dans la section [Démarrage rapide](#quick-start).

## Démarrage rapide

Qwen Code charge les serveurs MCP depuis `mcpServers` dans votre `settings.json`. Vous pouvez configurer les serveurs soit :

- En modifiant `settings.json` directement
- En utilisant les commandes `qwen mcp` (voir la [référence CLI](#manage-mcp-servers-with-qwen-mcp))

### Ajouter votre premier serveur

1. Ajoutez un serveur (exemple : serveur MCP HTTP distant) :

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Démarrez Qwen Code et ouvrez la boîte de dialogue de gestion MCP pour voir et gérer les serveurs :

```bash
qwen
```

Puis saisissez :

```text
/mcp
```

3. Si Qwen Code était déjà en cours d'exécution avant d'ajouter le serveur, redémarrez-le dans le même projet. Ensuite, demandez au modèle d'utiliser les outils de ce serveur.

## Où la configuration est stockée (portées)

La plupart des utilisateurs n'ont besoin que de ces deux portées :

- **Portée utilisateur (par défaut)** : `~/.qwen/settings.json` sur tous les projets de votre machine
- **Portée projet** : `.qwen/settings.json` à la racine de votre projet

Écrire dans la portée utilisateur :

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Pour les couches de configuration avancées (paramètres système par défaut et règles de précédence), consultez [Paramètres](../configuration/settings).

## Configurer les serveurs

### Choisir un transport

| Transport | Quand l'utiliser                                                      | Champ(s) JSON                             |
| --------- | --------------------------------------------------------------------- | ----------------------------------------- |
| `http`    | Recommandé pour les services distants ; adapté aux serveurs MCP cloud | `httpUrl` (+ optionnel `headers`)         |
| `sse`     | Serveurs hérités/dépréciés ne supportant que les Server-Sent Events   | `url` (+ optionnel `headers`)             |
| `stdio`   | Processus local (scripts, CLI, Docker) sur votre machine              | `command`, `args` (+ optionnel `cwd`, `env`) |

> [!note]
>
> Si un serveur supporte les deux, préférez **HTTP** à **SSE**.

### Configurer via `settings.json` ou `qwen mcp add`

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

CLI (écrit dans la portée utilisateur par défaut) :

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### Serveur HTTP (HTTP distant streamable)

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

Tout prompt qu'un serveur annonce via `prompts/list` devient une **commande slash** exécutable. Après la découverte, tapez `/` et vous verrez le prompt listé (étiqueté `MCP: <server>`) ; exécutez-le comme n'importe quelle autre commande :

```text
/my_prompt --arg1="value" --arg2="value"
# positional form also works:
/my_prompt "value" "value"
# show the prompt's arguments:
/my_prompt help
```

Les messages du prompt sont envoyés au modèle, qui agit ensuite en conséquence.

> La découverte est permissive concernant la capacité `prompts` déclarée : certains serveurs implémentent `prompts/list` mais omettent `prompts` de leurs capacités d'initialisation. Qwen Code essaie quand même `prompts/list`, donc ces prompts apparaissent toujours. Un serveur qui n'a vraiment aucun prompt répond simplement `Method not found`, ce qui est ignoré.
### Ressources

Les ressources qu'un serveur expose via `resources/list` sont découvertes par
serveur. Ouvrez la boîte de dialogue de gestion avec `/mcp` et sélectionnez un serveur pour voir
son compteur de **Ressources** ainsi que ses outils et prompts. Choisissez **Voir les
ressources** pour parcourir les URI de ressources du serveur ; en sélectionner une affiche sa
description et son type MIME ainsi que la référence exacte `@serveur:uri` à
coller dans un message. Comme pour les prompts, la capacité `resources` n'est pas obligatoire.

Injectez le contenu d'une ressource dans votre message avec la syntaxe `@serveur:uri`
— tapez `@`, puis le nom du serveur, deux-points, et l'URI de la ressource :

```text
résume @monserveur:file:///docs/spec.md et liste les questions ouvertes
```

Taper `@monserveur:` affiche une liste d'autocomplétion des ressources de ce serveur ;
continuez à taper pour filtrer, en cherchant (insensible à la casse) soit l'URI de la ressource
soit son nom/titre amical. Vous n'avez pas besoin de connaître une URI par cœur — avant
d'atteindre les deux-points, taper une partie du nom du serveur suggère aussi les
serveurs correspondants qui exposent des ressources, vous pouvez donc en choisir un et plonger
directement dans sa liste de ressources. Lors de l'envoi, la ressource référencée est lue et son contenu est
ajouté à votre message (texte en ligne, blobs binaires en pièces jointes) ; la
référence `@serveur:uri` est conservée dans le prompt pour que le modèle sache
ce qu'il regarde. Le préfixe `serveur` doit correspondre à un serveur MCP configuré —
sinon le jeton est traité comme un chemin de fichier normal, donc les
références existantes `@chemin/vers/fichier` ne sont pas affectées. Les lectures de ressources sont désactivées dans
les dossiers non fiables.

## Disponibilité progressive et timeouts de découverte

Qwen Code découvre les serveurs MCP en arrière-plan après que l'UI est déjà
interactive. Vous voyez le premier prompt du cli en quelques centaines de
millisecondes même si l'un de vos serveurs MCP prend plusieurs secondes
(ou ne répond jamais), et la liste d'outils du modèle se met à jour en environ
une image (~16 ms) après que chaque serveur a terminé sa poignée de main de découverte.

- **Mode interactif** : l'UI apparaît immédiatement ; un indicateur d'état MCP dans
  le coin inférieur droit indique `N/M serveurs MCP prêts` tant que la découverte est
  en cours. Envoyer un prompt avant la fin de MCP signifie simplement que le modèle
  voit les outils qui sont prêts _à cet instant_ ; les prompts suivants verront
  plus d'outils au fur et à mesure que les serveurs se connectent.
- **Mode non interactif** (`--prompt`, stream-json, ACP) : le cli attend
  toujours que la découverte MCP se stabilise avant d'envoyer le premier prompt, donc
  les invocations scriptées / pipées voient le même ensemble d'outils complet que
  le comportement synchrone existant produisait.

### `discoveryTimeoutMs` par serveur

Chaque serveur MCP a un timeout dédié à la découverte qui limite la durée
autorisée pour la poignée de main initiale (`connect` + `tools/list` + `prompts/list` +
`resources/list`). Valeurs par défaut :

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

Le champ `timeout` existant est le timeout d'**appel d'outil** (utilisé pour chaque
requête `tools/call`, par défaut 10 minutes) et n'est pas affecté par
`discoveryTimeoutMs` — une invocation d'outil longue n'est pas une pathologie de démarrage.

### Revenir en arrière sur le MCP progressif

Si vous avez besoin de l'ancien comportement synchrone (le cli attend chaque serveur MCP
avant d'afficher l'UI), définissez `QWEN_CODE_LEGACY_MCP_BLOCKING=1` dans votre
environnement. Ce paramètre est conservé comme échappatoire pour au moins une version.

## Sécurité et contrôle

### Confiance (sauter les confirmations)

- **Confiance au serveur** (`trust: true`) : ignore les fenêtres de confirmation pour ce serveur (à utiliser avec parcimonie).

### Authentification OAuth

Qwen Code prend en charge l'authentification OAuth 2.0 pour les serveurs MCP. Cela est utile lors de l'accès à des serveurs distants nécessitant une authentification.

#### Utilisation de base

Lorsque vous ajoutez un serveur MCP avec des identifiants OAuth, Qwen Code gère automatiquement le flux d'authentification :

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### Important : Configuration de l'URI de redirection

Le flux OAuth nécessite une URI de redirection où le fournisseur d'autorisation envoie le code d'authentification.

- **Développement local** : Par défaut, Qwen Code utilise `http://localhost:7777/oauth/callback`. Cela fonctionne lorsque vous exécutez Qwen Code sur votre machine locale avec un navigateur local.

- **Déploiements distants/cloud** : Lorsque vous exécutez Qwen Code sur des serveurs distants, des IDE cloud ou des terminaux web, la redirection par défaut vers `localhost` ne fonctionnera PAS. Vous DEVEZ configurer `--oauth-redirect-uri` pour pointer vers une URL accessible publiquement pouvant recevoir le callback OAuth.

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

| Propriété           | Description                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`           | Activer OAuth pour ce serveur (booléen)                                                                                          |
| `clientId`          | Identifiant client OAuth (chaîne, facultatif avec enregistrement dynamique)                                                      |
| `clientSecret`      | Secret client OAuth (chaîne, facultatif pour les clients publics)                                                               |
| `authorizationUrl`  | Point de terminaison d'autorisation OAuth (chaîne, découvert automatiquement si omis)                                            |
| `tokenUrl`          | Point de terminaison de jeton OAuth (chaîne, découvert automatiquement si omis)                                                  |
| `scopes`            | Périmètres OAuth requis (tableau de chaînes)                                                                                     |
| `redirectUri`       | URI de redirection personnalisée (chaîne). **Critique pour les déploiements distants**. Par défaut `http://localhost:7777/oauth/callback` |
| `tokenParamName`    | Nom du paramètre de requête pour les jetons dans les URL SSE (chaîne)                                                            |
| `audiences`         | Audiences pour lesquelles le jeton est valide (tableau de chaînes)                                                               |

#### Gestion des jetons

Les jetons OAuth sont automatiquement :

- **Stockés** dans `~/.qwen/mcp-oauth-tokens.json` (texte clair, mode 0600) par défaut. Si `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` est défini, Qwen Code utilise un stockage basé sur le trousseau (keychain) lorsque disponible, ou `~/.qwen/mcp-oauth-tokens-v2.json` avec chiffrement AES-256-GCM.
- **Actualisés** à l'expiration (si des jetons d'actualisation sont disponibles)
- **Validés** avant chaque tentative de connexion

> [!WARNING]
> Par défaut, les jetons OAuth sont stockés non chiffrés sur le disque. Sur les machines partagées ou multi-utilisateurs, définissez `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` pour protéger les informations d'identification.

Utilisez le dialogue `/mcp` dans Qwen Code pour inspecter les serveurs MCP et gérer l'authentification de manière interactive.

### Filtrage d'outils (autoriser/interdire des outils par serveur)

Utilisez `includeTools` / `excludeTools` pour restreindre les outils exposés par un serveur (du point de vue de Qwen Code).

Exemple : n'inclure que quelques outils :

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

### Listes globales d'autorisation/d'interdiction

L'objet `mcp` dans votre `settings.json` définit des règles globales pour tous les serveurs MCP :

- `mcp.allowed` : liste d'autorisation des noms de serveurs MCP (clés dans `mcpServers`)
- `mcp.excluded` : liste d'interdiction des noms de serveurs MCP

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

- **Le serveur affiche « Déconnecté » dans `qwen mcp list`** : vérifiez que l'URL/la commande est correcte, puis augmentez le `timeout`.
- **Le serveur Stdio ne démarre pas** : utilisez un chemin absolu pour `command`, et vérifiez `cwd`/`env`.
- **Les variables d'environnement dans JSON ne sont pas résolues** : assurez-vous qu'elles existent dans l'environnement où Qwen Code s'exécute (les environnements shell et GUI peuvent différer).

## Référence

### Structure de `settings.json`

#### Configuration spécifique au serveur (`mcpServers`)

Ajoutez un objet `mcpServers` à votre fichier `settings.json` :

```json
// ... le fichier contient d'autres objets de configuration
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

Requis (l'un des éléments suivants) :

| Propriété  | Description                                            |
| ---------- | ------------------------------------------------------ |
| `command`  | Chemin vers l'exécutable pour le transport Stdio       |
| `url`      | URL du point de terminaison SSE (ex. `"http://localhost:8080/sse"`) |
| `httpUrl`  | URL du point de terminaison de streaming HTTP          |

Facultatif :

| Propriété             | Type/Valeur par défaut        | Description                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                | tableau                       | Arguments de ligne de commande pour le transport Stdio                                                                                                                                                                                                                        |
| `headers`             | objet                         | En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`                                                                                                                                                                                                       |
| `env`                 | objet                         | Variables d'environnement pour le processus serveur. Les valeurs peuvent référencer des variables d'environnement avec la syntaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                                |
| `cwd`                 | chaîne                        | Répertoire de travail pour le transport Stdio                                                                                                                                                                                                                                 |
| `timeout`             | nombre<br>(défaut : 600 000)  | Délai d'expiration de la requête en millisecondes (défaut : 600 000 ms = 10 minutes)                                                                                                                                                                                          |
| `trust`               | booléen<br>(défaut : false)   | Lorsqu'il est `true`, contourne toutes les confirmations d'appel d'outil pour ce serveur (défaut : `false`)                                                                                                                                                                    |
| `includeTools`        | tableau                       | Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsqu'elle est spécifiée, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste d'autorisation). Si non spécifié, tous les outils du serveur sont activés par défaut.             |
| `excludeTools`        | tableau                       | Liste des noms d'outils à exclure depuis ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur.<br>Remarque : `excludeTools` a priorité sur `includeTools` – si un outil figure dans les deux listes, il sera exclu. |
| `targetAudience`      | chaîne                        | L'ID client OAuth autorisé sur l'application protégée par IAP à laquelle vous essayez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                             |
| `targetServiceAccount`| chaîne                        | L'adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                                                               |
<a id="qwen-mcp-cli"></a>

### Gérer les serveurs MCP avec `qwen mcp`

Vous pouvez toujours configurer les serveurs MCP en modifiant manuellement `settings.json`, mais la CLI est généralement plus rapide.

#### Ajouter un serveur (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option             | Description                                                                    | Valeur par défaut              | Exemple                                                          |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------- |
| `<name>`                    | Un nom unique pour le serveur.                                                 | —                              | `example-server`                                                 |
| `<commandOrUrl>`            | La commande à exécuter (pour `stdio`) ou l'URL (pour `http`/`sse`).            | —                              | `/usr/bin/python` ou `http://localhost:8`                        |
| `[args...]`                 | Arguments optionnels pour une commande `stdio`.                                | —                              | `--port 5000`                                                    |
| `-s`, `--scope`             | Portée de la configuration (utilisateur ou projet).                            | `user`                         | `-s user`                                                        |
| `-t`, `--transport`         | Type de transport (`stdio`, `sse`, `http`).                                    | `stdio`                        | `-t sse`                                                         |
| `-e`, `--env`               | Définir des variables d'environnement.                                         | —                              | `-e KEY=value`                                                   |
| `-H`, `--header`            | Définir des en-têtes HTTP pour les transports SSE et HTTP.                     | —                              | `-H "X-Api-Key: abc123"`                                         |
| `--timeout`                 | Définir le délai d'attente de connexion en millisecondes.                      | —                              | `--timeout 30000`                                                |
| `--trust`                   | Approuver le serveur (ignorer toutes les invites de confirmation d'appels d'outils). | — (`false`)                | `--trust`                                                        |
| `--description`             | Définir la description du serveur.                                             | —                              | `--description "Outils locaux"`                                  |
| `--include-tools`           | Liste d'outils à inclure, séparés par des virgules.                            | tous les outils inclus         | `--include-tools mytool,othertool`                               |
| `--exclude-tools`           | Liste d'outils à exclure, séparés par des virgules.                            | aucun                          | `--exclude-tools mytool`                                         |
| `--oauth-client-id`         | ID client OAuth pour l'authentification du serveur MCP.                        | —                              | `--oauth-client-id your-client-id`                               |
| `--oauth-client-secret`     | Secret client OAuth pour l'authentification du serveur MCP.                    | —                              | `--oauth-client-secret your-client-secret`                       |
| `--oauth-redirect-uri`      | URI de redirection OAuth pour le callback d'authentification.                  | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`    |
| `--oauth-authorization-url` | URL d'autorisation OAuth.                                                      | —                              | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | URL du jeton OAuth.                                                            | —                              | `--oauth-token-url https://provider.example.com/token`           |
| `--oauth-scopes`            | Portées OAuth (séparées par des virgules).                                     | —                              | `--oauth-scopes scope1,scope2`                                   |

> Les options `--oauth-*` s'appliquent uniquement aux transports `--transport sse` et `--transport http`. Les combiner avec `--transport stdio` est refusé.

#### Supprimer un serveur (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```
