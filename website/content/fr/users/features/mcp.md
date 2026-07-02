# Connecter Qwen Code aux outils via MCP

Qwen Code peut se connecter à des outils et sources de données externes via le [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction). Les serveurs MCP donnent à Qwen Code accès à vos outils, bases de données et API.

## Ce que vous pouvez faire avec MCP

Avec des serveurs MCP connectés, vous pouvez demander à Qwen Code de :

- Travailler avec des fichiers et des repos (lire/rechercher/écrire, selon les outils que vous activez)
- Interroger des bases de données (inspection de schéma, requêtes, reporting)
- Intégrer des services internes (exposer vos API en tant qu'outils MCP)
- Automatiser des workflows (tâches répétables exposées en tant qu'outils/prompts)

> [!tip]
>
> Si vous cherchez la "commande unique pour commencer", passez directement à [Démarrage rapide](#quick-start).

## Démarrage rapide

Qwen Code charge les serveurs MCP depuis `mcpServers` dans votre `settings.json`. Vous pouvez configurer les serveurs soit :

- En modifiant `settings.json` directement
- En utilisant les commandes `qwen mcp` (voir [Référence CLI](#manage-mcp-servers-with-qwen-mcp))

### Ajouter votre premier serveur

1. Ajoutez un serveur (exemple : serveur MCP HTTP distant) :

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Démarrez Qwen Code et ouvrez la boîte de dialogue de gestion MCP pour afficher et gérer
   les serveurs :

```bash
qwen
```

Entrez ensuite :

```text
/mcp
```

3. Si Qwen Code était déjà en cours d'exécution avant l'ajout du serveur, redémarrez-le dans
   le même projet. Demandez ensuite au modèle d'utiliser les outils de ce serveur.

## Emplacement de stockage de la configuration (scopes)

La plupart des utilisateurs n'ont besoin que de ces deux scopes :

- **Scope utilisateur (par défaut)** : `~/.qwen/settings.json` pour tous les projets de votre machine
- **Scope projet** : `.qwen/settings.json` à la racine de votre projet

Écrire dans le scope utilisateur :

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> Pour les couches de configuration avancées (valeurs par défaut du système/paramètres système et règles de priorité), consultez [Settings](../configuration/settings).

## Configurer les serveurs

### Choisir un transport

| Transport | Quand l'utiliser                                                       | Champ(s) JSON                               |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | Recommandé pour les services distants ; fonctionne bien pour les serveurs MCP cloud | `httpUrl` (+ `headers` optionnels)            |
| `sse`     | Serveurs hérités/dépréciés qui ne prennent en charge que les Server-Sent Events    | `url` (+ `headers` optionnels)                |
| `stdio`   | Processus local (scripts, CLIs, Docker) sur votre machine             | `command`, `args` (+ `cwd`, `env` optionnels) |

> [!note]
>
> Si un serveur prend en charge les deux, préférez **HTTP** à **SSE**.

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

Outre les outils, Qwen Code découvre et expose deux autres primitives MCP.

### Prompts (commandes slash)

Tout prompt qu'un serveur annonce via `prompts/list` devient une **commande slash**
exécutable. Après la découverte, tapez `/` et vous verrez le prompt
listé (étiqueté `MCP: <server>`) ; exécutez-le comme n'importe quelle autre commande :

```text
/my_prompt --arg1="value" --arg2="value"
# la forme positionnelle fonctionne aussi :
/my_prompt "value" "value"
# afficher les arguments du prompt :
/my_prompt help
```

Les messages du prompt sont envoyés au modèle, qui agit ensuite en conséquence.

> La découverte est tolérante concernant la capacité `prompts` déclarée : certains
> serveurs implémentent `prompts/list` mais omettent `prompts` de leurs
> capacités `initialize`. Qwen Code tente tout de même `prompts/list`, de sorte que
> ces prompts apparaissent quand même. Un serveur qui n'a réellement aucun prompt
> répond simplement `Method not found`, ce qui est ignoré.

### Ressources

Les ressources qu'un serveur annonce via `resources/list` sont découvertes par
serveur. Ouvrez la boîte de dialogue de gestion avec `/mcp` et sélectionnez un serveur pour voir
son compteur de **Ressources** à côté de ses outils et prompts. Choisissez **View
resources** pour parcourir les URI des ressources du serveur ; en sélectionner une affiche sa
description et son type MIME, ainsi que la référence exacte `@server:uri` à
coller dans un message. Comme pour les prompts, la capacité `resources` n'a pas
besoin d'être déclarée.

Injectez le contenu d'une ressource dans votre message avec la syntaxe `@server:uri`
— tapez `@`, puis le nom du serveur, un deux-points, et l'URI de la ressource :

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

Taper `@myserver:` affiche une liste d'autocomplétion des ressources de ce serveur ;
continuez à taper pour filtrer, en correspondant (sans casse) soit à l'URI de la ressource
ou à son nom/titre convivial. Vous n'avez pas besoin de connaître une URI par cœur — avant
d'atteindre le deux-points, taper une partie du nom d'un serveur suggère également les serveurs
correspondants qui exposent des ressources, afin que vous puissiez en choisir un et accéder directement à
sa liste de ressources. Lors de la soumission, la ressource référencée est lue et son contenu est
ajouté à votre message (texte en ligne, blobs binaires en pièces jointes) ; la
référence `@server:uri` est conservée dans le prompt afin que le modèle sache ce qu'il
regarde. Le préfixe `server` doit correspondre à un serveur MCP configuré —
sinon, le token est traité comme un chemin de fichier normal, de sorte que les
références `@path/to/file` existantes ne sont pas affectées. Les lectures de ressources sont désactivées dans
les dossiers non fiables.

## Disponibilité progressive et timeouts de découverte

Qwen Code découvre les serveurs MCP en arrière-plan après que l'interface utilisateur est déjà
interactive. Vous voyez le premier prompt du CLI en quelques centaines de
millisecondes, même si l'un de vos serveurs MCP prend plusieurs secondes
(ou ne répond jamais), et la liste des outils du modèle se met à jour en environ
une frame (~16 ms) après que chaque serveur a terminé son handshake de découverte.

- **Mode interactif** : l'interface utilisateur apparaît immédiatement ; un badge de statut MCP en
  bas à droite affiche `N/M MCP servers ready` pendant que la découverte est en
  cours. Envoyer un prompt avant la fin de MCP signifie simplement que le modèle
  voit les outils qui sont prêts _à ce moment-là_ ; les prompts suivants voient
  plus d'outils au fur et à mesure que les serveurs se mettent en ligne.
- **Mode non interactif** (`--prompt`, stream-json, ACP) : le CLI attend
  toujours que la découverte MCP se stabilise avant d'envoyer le premier prompt, de sorte que
  les invocations scriptées / pipées voient le même ensemble d'outils complet que
  le comportement synchrone hérité produisait.

### `discoveryTimeoutMs` par serveur

Chaque serveur MCP dispose d'un timeout réservé à la découverte qui limite la durée maximale
du handshake initial (`connect` + `tools/list` + `prompts/list` +
`resources/list`). Valeurs par défaut :

- **serveurs stdio** : 30 s
- **serveurs HTTP / SSE distants** : 5 s (le risque réseau est plus élevé)

Remplacez cette valeur par serveur si nécessaire :

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
`discoveryTimeoutMs` — une invocation d'outil de longue durée n'est pas une pathologie de démarrage.

### Désactiver le MCP progressif

Si vous avez besoin de l'ancien comportement synchrone (le CLI attend chaque serveur MCP
avant d'afficher l'interface utilisateur), définissez `QWEN_CODE_LEGACY_MCP_BLOCKING=1` dans votre
environnement. Cela est conservé comme solution de secours pour au moins une version.

## Sécurité et contrôle

### Confiance (ignorer les confirmations)

- **Confiance serveur** (`trust: true`) : ignore les invites de confirmation pour ce serveur (à utiliser avec parcimonie).

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

Le flux OAuth nécessite une URI de redirection vers laquelle le fournisseur d'autorisation envoie le code d'authentification.

- **Développement local** : Par défaut, Qwen Code utilise `http://localhost:7777/oauth/callback`. Cela fonctionne lorsque vous exécutez Qwen Code sur votre machine locale avec un navigateur local.

- **Déploiements distants/cloud** : Lors de l'exécution de Qwen Code sur des serveurs distants, des IDE cloud ou des terminaux web, la redirection `localhost` par défaut ne fonctionnera PAS. Vous DEVEZ configurer `--oauth-redirect-uri` pour qu'il pointe vers une URL accessible publiquement capable de recevoir le callback OAuth.

Exemple pour les serveurs distants :

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### Configuration manuelle via settings.json

Vous pouvez également configurer OAuth en modifiant `settings.json` directement :

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

| Propriété           | Description                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | Activer OAuth pour ce serveur (booléen)                                                                                |
| `clientId`         | Identifiant client OAuth (chaîne, optionnel avec l'enregistrement dynamique)                                                  |
| `clientSecret`     | Secret client OAuth (chaîne, optionnel pour les clients publics)                                                             |
| `authorizationUrl` | Point de terminaison d'autorisation OAuth (chaîne, auto-découvert si omis)                                                     |
| `tokenUrl`         | Point de terminaison de token OAuth (chaîne, auto-découvert si omis)                                                             |
| `scopes`           | Scopes OAuth requis (tableau de chaînes)                                                                              |
| `redirectUri`      | URI de redirection personnalisée (chaîne). **Critique pour les déploiements distants**. Par défaut `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | Nom du paramètre de requête pour les tokens dans les URL SSE (chaîne)                                                                  |
| `audiences`        | Audiences pour lesquelles le token est valide (tableau de chaînes)                                                                   |

#### Gestion des tokens

Les tokens OAuth sont automatiquement :

- **Stockés** dans `~/.qwen/mcp-oauth-tokens.json` (texte en clair, mode 0600) par défaut. Si `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` est défini, Qwen Code utilise un stockage basé sur le trousseau de clés lorsqu'il est disponible, ou `~/.qwen/mcp-oauth-tokens-v2.json` avec un chiffrement AES-256-GCM.
- **Actualisés** à l'expiration (si des tokens de rafraîchissement sont disponibles)
- **Validés** avant chaque tentative de connexion

> [!WARNING]
> Par défaut, les tokens OAuth sont stockés non chiffrés sur le disque. Sur les machines partagées ou multi-utilisateurs, définissez `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` pour protéger les identifiants.

Utilisez la boîte de dialogue `/mcp` dans Qwen Code pour inspecter les serveurs MCP et gérer
l'authentification de manière interactive.

### Filtrage des outils (autoriser/refuser des outils par serveur)

Utilisez `includeTools` / `excludeTools` pour restreindre les outils exposés par un serveur (du point de vue de Qwen Code).

Exemple : inclure seulement quelques outils :

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

### Listes globales d'autorisation/refus

L'objet `mcp` dans votre `settings.json` définit les règles globales pour tous les serveurs MCP :

- `mcp.allowed` : liste d'autorisation des noms de serveurs MCP (clés dans `mcpServers`)
- `mcp.excluded` : liste de refus des noms de serveurs MCP

Les deux listes prennent en charge les motifs glob : `*` correspond à n'importe quelle séquence de caractères et `?` correspond à un seul caractère (par exemple, `"*puppeteer*"` correspond à chaque serveur dont le nom contient `puppeteer`). Les entrées sans caractères glob sont mises en correspondance exacte. Lorsqu'un serveur correspond aux deux listes, `mcp.excluded` est prioritaire.

Exemple :

```json
{
  "mcp": {
    "allowed": ["my-trusted-server", "*-internal"],
    "excluded": ["experimental-server"]
  }
}
```

## Dépannage

- **Le serveur affiche "Disconnected" dans `qwen mcp list`** : vérifiez que l'URL/commande est correcte, puis augmentez le `timeout`.
- **Le serveur Stdio ne démarre pas** : utilisez un chemin absolu pour `command`, et vérifiez `cwd`/`env`.
- **Les variables d'environnement dans le JSON ne se résolvent pas** : assurez-vous qu'elles existent dans l'environnement où Qwen Code s'exécute (les environnements shell et application GUI peuvent différer).

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

Obligatoire (l'un des éléments suivants) :

| Propriété  | Description                                            |
| --------- | ------------------------------------------------------ |
| `command` | Chemin vers l'exécutable pour le transport Stdio             |
| `url`     | URL du point de terminaison SSE (ex. : `"http://localhost:8080/sse"`) |
| `httpUrl` | URL du point de terminaison de streaming HTTP                            |

Optionnel :

| Propriété               | Type/Par défaut                 | Description                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Arguments de ligne de commande pour le transport Stdio                                                                                                                                                                                                                        |
| `headers`              | object                       | En-têtes HTTP personnalisés lors de l'utilisation de `url` ou `httpUrl`                                                                                                                                                                                                                 |
| `env`                  | object                       | Variables d'environnement pour le processus serveur. Les valeurs peuvent référencer des variables d'environnement en utilisant la syntaxe `$VAR_NAME` ou `${VAR_NAME}`                                                                                                                                |
| `cwd`                  | string                       | Répertoire de travail pour le transport Stdio                                                                                                                                                                                                                             |
| `timeout`              | number<br>(par défaut : 600 000) | Timeout de requête en millisecondes (par défaut : 600 000 ms = 10 minutes)                                                                                                                                                                                                 |
| `trust`                | boolean<br>(par défaut : false)  | Lorsque `true`, ignore toutes les confirmations d'appel d'outil pour ce serveur (par défaut : `false`)                                                                                                                                                                              |
| `includeTools`         | array                        | Liste des noms d'outils à inclure depuis ce serveur MCP. Lorsqu'elle est spécifiée, seuls les outils listés ici seront disponibles depuis ce serveur (comportement de liste d'autorisation). Si elle n'est pas spécifiée, tous les outils du serveur sont activés par défaut.                                       |
| `excludeTools`         | array                        | Liste des noms d'outils à exclure de ce serveur MCP. Les outils listés ici ne seront pas disponibles pour le modèle, même s'ils sont exposés par le serveur.<br>Remarque : `excludeTools` est prioritaire sur `includeTools` - si un outil est dans les deux listes, il sera exclu. |
| `targetAudience`       | string                       | L'ID client OAuth autorisé sur l'application protégée par IAP à laquelle vous essayez d'accéder. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                         |
| `targetServiceAccount` | string                       | L'adresse e-mail du compte de service Google Cloud à usurper. Utilisé avec `authProviderType: 'service_account_impersonation'`.                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### Gérer les serveurs MCP avec `qwen mcp`

Vous pouvez toujours configurer les serveurs MCP en modifiant manuellement `settings.json`, mais le CLI est généralement plus rapide.

#### Ajouter un serveur (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| Argument/Option             | Description                                                         | Par défaut                                | Exemple                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | Un nom unique pour le serveur.                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | La commande à exécuter (pour `stdio`) ou l'URL (pour `http`/`sse`). | —                                      | `/usr/bin/python` ou `http://localhost:8`                          |
| `[args...]`                 | Arguments optionnels pour une commande `stdio`.                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | Scope de configuration (utilisateur ou projet).                              | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | Type de transport (`stdio`, `sse`, `http`).                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | Définir les variables d'environnement.                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | Définir les en-têtes HTTP pour les transports SSE et HTTP.                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | Définir le timeout de connexion en millisecondes.                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | Faire confiance au serveur (ignorer toutes les invites de confirmation d'appel d'outil).       | — (`false`)                            | `--trust`                                                          |
| `--description`             | Définir la description du serveur.                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | Une liste d'outils à inclure, séparés par des virgules.                         | tous les outils inclus                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | Une liste d'outils à exclure, séparés par des virgules.                         | aucun                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | ID client OAuth pour l'authentification du serveur MCP.                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | Secret client OAuth pour l'authentification du serveur MCP.                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | URI de redirection OAuth pour le callback d'authentification.                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | URL d'autorisation OAuth.                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | URL de token OAuth.                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | Scopes OAuth (séparés par des virgules).                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |
> Les flags `--oauth-*` s'appliquent uniquement à `--transport sse` et `--transport http`. Toute combinaison avec `--transport stdio` est rejetée.

#### Supprimer un serveur (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```