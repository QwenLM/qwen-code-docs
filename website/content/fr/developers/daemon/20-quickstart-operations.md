# Démarrage rapide et opérations

Cette page se concentre sur **comment lancer `qwen serve`, comment vérifier qu'il fonctionne, et à quoi ressemble la chaîne d'appel interne de `qwen serve` jusqu'au serveur à l'écoute**. L'architecture, les composants et les détails du protocole de communication se trouvent dans les autres pages d'approfondissement sur le démon.

## 1. Le chemin le plus court

```bash
qwen serve
```

Sortie :

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Ouvrez `http://127.0.0.1:4170/demo` dans un navigateur pour voir la console de débogage : interface de chat, flux d'événements et inspection de l'espace de travail. En mode de développement local par défaut (loopback), `/demo` est enregistré **avant** `bearerAuth` dans la branche loopback du routeur de `packages/cli/src/serve/server.ts`, donc aucun token n'est requis.

## 2. Recettes de lancement

```bash
# 1. Défaut développement local (loopback, sans token)
qwen serve

# 2. Espace de travail explicite + port éphémère
qwen serve --workspace /path/to/repo --port 0

# 3. Développement loopback renforcé (forcer bearer même en loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Exposition sur le réseau local (non-loopback nécessite un token)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Réglage pour de nombreuses sessions et un anneau de rejeu plus grand
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Collaboration multi-client + budget MCP strict
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Démarrage avec une politique de consensus configurée dans settings.json
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Journalisation de débogage
QWEN_SERVE_DEBUG=1 qwen serve

# 9. Désactivation du pool F2 (retour aux clients MCP par session)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Autoriser l'accès cross-origin pour l'interface web du navigateur
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Délai d'exécution des prompts + timeout d'inactivité SSE
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Garder le processus ACP enfant actif après la fermeture de la dernière session
qwen serve --channel-idle-timeout-ms 60000

# 13. Activer la limitation de débit HTTP
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

Avec la recette loopback renforcée (3), `/demo` est enregistré après `bearerAuth`. Une navigation normale dans le navigateur nécessite un en-tête d'authentification ; utilisez donc curl ou un script SDK à la place.

## 3. Liste complète des options de démarrage

La CLI est définie dans **`packages/cli/src/commands/serve.ts`** :

| Option                                    | Type                           | Valeur par défaut                            | Requis quand                            | Effet                                                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------ | -------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                              | nombre                         | `4170`                                       | -                                       | Port TCP ; `0` signifie port éphémère attribué par l'OS.                                                                                                                                                               |
| `--hostname <host>`                       | chaîne                         | `127.0.0.1`                                  | Non-loopback nécessite un token          | Adresse de liaison. Valeurs loopback : `127.0.0.1`, `localhost`, `::1`, `[::1]`. Les crochets de `[::1]` sont supprimés automatiquement ; une entrée `host:port` est rejetée avec un message suggérant d'utiliser `--port`. |
| `--token <s>`                             | chaîne                         | env / aucun                                  | Non-loopback et `--require-auth`        | Token Bearer ; nettoyé une fois. **Il apparaît dans `/proc/<pid>/cmdline`, donc préférez `QWEN_SERVER_TOKEN`**. La sortie d'erreur stderr avertit également de ceci.                                                  |
| `--max-sessions <n>`                      | nombre                         | `20`                                         | -                                       | Plafond de sessions actives. Un dépassement renvoie 503. `0` signifie illimité. Les valeurs `NaN` / négatives génèrent une erreur.                                                                                     |
| `--max-pending-prompts-per-session <n>`   | nombre                         | `5`                                          | -                                       | Plafond de prompts acceptés mais en attente/actifs par session. Un dépassement renvoie 503. `0` / `Infinity` signifie illimité. Les valeurs négatives ou non entières génèrent une erreur.                             |
| `--workspace <dir>`                       | chaîne                         | `process.cwd()`                              | -                                       | Espace de travail lié. **Doit être un chemin absolu, exister et être un répertoire**. Le démarrage le canonise une fois via `canonicalizeWorkspace`. `POST /session` avec un `cwd` différent renvoie `400 workspace_mismatch`. |
| `--max-connections <n>`                   | nombre                         | `256`                                        | -                                       | `server.maxConnections` au niveau de l'écouteur. `0` / `Infinity` signifie illimité. Les valeurs `NaN` / négatives empêchent le démarrage pour éviter un comportement fail-open.                                         |
| `--require-auth`                          | booléen                        | `false`                                      | Token requis                            | Étend l'authentification bearer au loopback **et** à `/health`. Le démarrage refuse de lancer sans token.                                                                                                           |
| `--enable-session-shell`                  | booléen                        | `false`                                      | Token requis                            | Active l'exécution directe `POST /session/:id/shell`. Les appelants doivent également envoyer un `X-Qwen-Client-Id` lié à la session.                                                                                  |
| `--event-ring-size <n>`                   | nombre                         | `8000`                                       | -                                       | Profondeur de l'anneau de rejeu SSE par session. Le plafond souple est `MAX_EVENT_RING_SIZE = 1_000_000` ; les valeurs hors limites génèrent une erreur lors de la construction du pont.                               |
| `--http-bridge`                           | booléen                        | `true`                                       | -                                       | Mode pont étape 1 : un processus `qwen --acp` enfant multiplexé par le démon. Le mode en processus étape 2 n'est pas encore implémenté ; `--no-http-bridge` revient en arrière et affiche un message sur stderr.      |
| `--mcp-client-budget <n>`                 | nombre                         | aucun                                        | Requis pour `mcp-budget-mode=enforce`   | Plafond de clients MCP de l'espace de travail. Doit être un entier positif.                                                                                                                                            |
| `--mcp-budget-mode <m>`                   | `'enforce' \| 'warn' \| 'off'` | `warn` si un budget est défini, sinon `off`   | `enforce` nécessite `--mcp-client-budget` | `enforce` refuse, `warn` avertit seulement à 75 %, `off` est uniquement observateur.                                                                                                                                   |
| `--allow-origin <pattern>`                | chaîne répétable                | aucun                                        | -                                       | Liste blanche CORS qui remplace le refus d'origine par défaut. `*` nécessite un token.                                                                                                                                 |
| `--allow-private-auth-base-url`           | booléen                        | `false`                                      | -                                       | Autorise l'installation d'un fournisseur d'authentification avec `baseUrl` sur localhost/réseau privé. À utiliser uniquement pour le développement local de confiance.                                                |
| `--prompt-deadline-ms <n>`                | nombre                         | aucun                                        | -                                       | Limite côté serveur en ms pour l'exécution d'un prompt ; le délai expiré annule le prompt.                                                                                                                            |
| `--writer-idle-timeout-ms <n>`            | nombre                         | aucun                                        | -                                       | Timeout d'inactivité par connexion SSE en ms.                                                                                                                                                                          |
| `--channel-idle-timeout-ms <n>`           | nombre                         | `0`                                          | -                                       | Garde le processus ACP enfant actif après la fermeture de la dernière session. `0` signifie récupération immédiate.                                                                                                    |
| `--session-reap-interval-ms <n>`          | nombre                         | `60000`                                      | -                                       | Intervalle de scrutation du récupérateur de sessions. `0` le désactive.                                                                                                                                                |
| `--session-idle-timeout-ms <n>`           | nombre                         | `1800000`                                    | -                                       | Timeout d'inactivité pour les sessions déconnectées. `0` le désactive.                                                                                                                                                 |
| `--rate-limit` / `--no-rate-limit`        | booléen                        | env / off                                    | -                                       | Active ou désactive la limitation de débit HTTP par niveau.                                                                                                                                                            |
| `--rate-limit-prompt <n>`                 | nombre                         | `10`                                         | `--rate-limit`                           | Requêtes de prompt par fenêtre.                                                                                                                                                                                        |
| `--rate-limit-mutation <n>`               | nombre                         | `30`                                         | `--rate-limit`                           | Requêtes de mutation par fenêtre.                                                                                                                                                                                      |
| `--rate-limit-read <n>`                   | nombre                         | `120`                                        | `--rate-limit`                           | Requêtes de lecture par fenêtre.                                                                                                                                                                                       |
| `--rate-limit-window-ms <n>`              | nombre                         | `60000`                                      | `--rate-limit`                           | Longueur de la fenêtre de limitation ; doit être `>= 1000`.                                                                                                                                                         |

## 4. Variables d'environnement

| Env                                 | Option/effet équivalent                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Équivalent à `--token` ; `--token` l'emporte. Nettoyé une fois au démarrage pour éviter un saut de ligne final provenant de `cat token.txt`.                                     |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (insensible à la casse) active les logs stderr verbeux.                                                                                              |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` désactive complètement le pool MCP de l'espace de travail et revient à `McpClientManager` par session. Les capacités cessent d'annoncer `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | Entrée de budget interne du processus ACP enfant. La CLI le génère à partir de `--mcp-client-budget` via `childEnvOverrides` ; ce n'est pas un fallback d'environnement du processus parent. |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | Mode de budget interne du processus ACP enfant. La CLI le génère à partir de `--mcp-budget-mode` via `childEnvOverrides` ; ce n'est pas un fallback d'environnement du processus parent. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Fallback d'environnement pour `--prompt-deadline-ms`.                                                                                                                             |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Fallback d'environnement pour `--writer-idle-timeout-ms`.                                                                                                                         |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Lu par le processus ACP enfant. Liste blanche séparée par des virgules des transports mis en pool ; la valeur par défaut est `stdio,websocket`.                                     |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Lu par le processus ACP enfant. Délai de vidage d'inactivité des entrées du pool ; la valeur par défaut est `30000`, limitée à `1000..600000` ms.                                    |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` active la limitation de débit ; l'option CLI l'emporte.                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Fallback d'environnement pour `--rate-limit-prompt`.                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Fallback d'environnement pour `--rate-limit-mutation`.                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Fallback d'environnement pour `--rate-limit-read`.                                                                                                                                 |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Fallback d'environnement pour `--rate-limit-window-ms`.                                                                                                                            |

Les surcharges d'environnement par gestionnaire sont intentionnelles : deux démons s'exécutant dans le même processus ne se font pas concurrence sur `process.env`. `defaultSpawnChannelFactory` capture l'environnement au moment du lancement.

## 5. `settings.json` est également lu

Le démarrage appelle `loadSettings(boundWorkspace)` une fois :

| Clé                          | Type                                                               | Comportement                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy`  | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Définit `BridgeOptions.permissionPolicy`. **Le démarrage valide avec `validatePolicyConfig`** ; les valeurs inconnues lèvent `InvalidPolicyConfigError` au lieu d'un repli silencieux. |
| `policy.consensusQuorum`     | entier positif                                                     | N pour la politique `consensus`. Par défaut : `floor(M/2)+1`. Si défini sous une politique non-consensus, il est ignoré et le démarrage enregistre un avertissement sur stderr. |
| `context.fileName`           | chaîne                                                             | Remplace `getCurrentGeminiMdFilename()` et contrôle le fichier écrit par `POST /workspace/init`.                                                                             |
| `tools.disabled`             | string[]                                                           | Normalisé via `normalizeDisabledToolList()` (nettoyage, suppression des entrées vides, déduplication) avant d'affecter le prochain lancement du processus ACP enfant.          |
| `tools.approvalMode`         | chaîne                                                             | Mode d'approbation de session par défaut.                                                                                                                                     |
| `telemetry`                  | objet                                                              | Configuration OTel : `enabled`, `otlpEndpoint`, `otlpProtocol`, points de terminaison par signal, etc. Voir [`17-configuration.md`](./17-configuration.md).                  |

Un échec d'entrée/sortie des paramètres, comme un JSON malformé, entraîne un repli vers les valeurs par défaut. `InvalidPolicyConfigError` est l'exception : une mauvaise configuration de la politique échoue explicitement au démarrage.

## 6. Scénarios de refus de démarrage (échecs explicites)

`run-qwen-serve.ts` lève intentionnellement une erreur au lieu de se replier dans les cas suivants :

| Scénario                                                                      | Préfixe d'erreur                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Liaison non-loopback sans token                                               | `Refusing to bind ... without a bearer token`                                                        |
| `--require-auth` sans token                                                   | `Refusing to start with --require-auth set but no bearer token`                                      |
| `--workspace` n'existe pas, n'est pas un répertoire ou n'est pas absolu       | `Invalid --workspace ...`                                                                            |
| Permission de stat `--workspace` refusée                                      | `Invalid --workspace ...: permission denied`                                                         |
| `--mcp-client-budget` n'est pas un entier positif                             | `Must be a positive integer`                                                                         |
| `--mcp-budget-mode=enforce` sans budget                                       | `requires a positive mcpClientBudget`                                                                |
| `--hostname` est écrit comme `localhost:4170`                                 | `looks like a "host:port" combination. Use --port`                                                   |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form`  |
| `--max-connections` est `NaN` ou négatif                                      | `Must be >= 0`                                                                                       |
| `--event-ring-size > 1_000_000`                                               | Levé lors de la construction du pont                                                                 |
| `--allow-origin '*'` sans token                                               | `Refusing to start with --allow-origin '*' but no bearer token configured`                           |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` n'est pas un entier positif | `Must be a positive integer`                                                                         |
| `policy.permissionStrategy` inconnu ou `policy.consensusQuorum` non positif   | `InvalidPolicyConfigError`                                                                           |
## 7. Liste de vérification Curl

```bash
# 1. Liveness
curl http://127.0.0.1:4170/health
# -> {"status":"ok"}

# 1.1 Deep health
curl -s 'http://127.0.0.1:4170/health?deep=1' | jq

# 2. Capabilities
curl -s http://127.0.0.1:4170/capabilities | jq

# 3. Preflight readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# 4. Env snapshot (secrets only report presence)
curl -s http://127.0.0.1:4170/workspace/env | jq

# 5. MCP pool / budget snapshot
curl -s http://127.0.0.1:4170/workspace/mcp | jq

# 6. Create a session
curl -s -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -d '{}' | jq

# 7. Tail SSE (replace <sid>)
curl -N \
  -H 'Accept: text/event-stream' \
  -H 'X-Qwen-Client-Id: curl-debug' \
  -H 'Last-Event-ID: 0' \
  'http://127.0.0.1:4170/session/<sid>/events'

# 8. Demo page
open http://127.0.0.1:4170/demo
```

Lorsque l'authentification par bearer est activée, ajoutez `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` à chaque requête.

## 8. La page de démo peut-elle être utilisée ?

**Oui.** Elle est implémentée par `getDemoHtml(port)` dans `packages/cli/src/serve/demo.ts` sous forme de HTML autonome sans dépendance externe.

| Mode de lancement                 | Où `/demo` est enregistré                                   | Navigation directe dans le navigateur                                 |
| --------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Loopback sans `--require-auth`    | Branche de route pré-authentification loopback de `server.ts`, **avant** `bearerAuth` | Fonctionne sans jeton                                                 |
| Loopback avec `--require-auth`    | Branche de route post-authentification de `server.ts`, **après** `bearerAuth`          | Difficile à utiliser depuis un navigateur ordinaire ; utilisez curl ou le SDK |
| Liaison non-loopback              | Branche de route post-authentification de `server.ts`, **après** `bearerAuth`          | Idem ci-dessus                                                         |

La CSP est `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, plus `X-Frame-Options: DENY`. La page ne peut récupérer que `'self'` (le démon) et ne peut pas charger de scripts ou de styles externes.

## 9. Chaîne d'appels de `qwen serve` au serveur d'écoute

```text
qwen serve
   |
   v (process)
packages/cli/index.ts              main()
   |
   v
gemini.tsx                         main() - parseArguments()
   |
   v (yargs assembly)
config/config.ts                   import { serveCommand } ...
config/config.ts                   .command(serveCommand)
config/config.ts                   await yargsInstance.parse()
   |
   v (handler)
commands/serve.ts                  handler(argv) - boot pre-checks
commands/serve.ts                  const { runQwenServe } = await import('../serve/index.js')   # lazy load
commands/serve.ts                  await runQwenServe({...})
   |
   v
serve/run-qwen-serve.ts              runQwenServe(opts, deps)
   |  |- trim token
   |  |- hostname mismatch fallback
   |  |- auth preflight
   |  |- workspace validation + canonicalization
   |  |- MCP budget validation + childEnvOverrides
   |  |- loadSettings + validatePolicyConfig
   |  |- PermissionAuditRing + publisher
   |  |- resolveBridgeFsFactory
   |  `- createHttpAcpBridge({...})
   |
   v
serve/run-qwen-serve.ts              const app = createServeApp(opts, () => actualPort, {...})
   |
   v
serve/server.ts                    createServeApp() - builds Express app (**does not listen**)
   |  |- middleware chain (Host allowlist / CORS / bearerAuth / mutation gate / rate limit)
   |  |- route mounting (health / demo / capabilities / workspace / session / SSE / ACP HTTP)
   |  `- return app
   |
   v
serve/run-qwen-serve.ts              server = app.listen(port, hostname, cb)
   |  |- server.maxConnections = cap
   |  |- actualPort = server.address().port
   |  |- write "qwen serve listening on ..."
   |  |- register SIGINT / SIGTERM (onSignal)
   |  `- resolve(handle: RunHandle)
   |
   v
commands/serve.ts                  await blockForever()    // block forever until signal
```

Points clés :

- **`createServeApp` ne fait que construire ; il n'écoute pas.** Il retourne une instance `express()` avec les middlewares et les routes montés. L'appelant possède `app.listen()`. `server.test.ts` utilise la fabrique de cette manière dans environ 25 cas, donc la fabrique évite intentionnellement de gérer le cycle de vie.
- **`() => actualPort` est une fermeture paresseuse.** `actualPort` est assigné dans le callback `app.listen`. Le middleware `hostAllowlist` le lit à la demande, donc les ports éphémères (`--port 0`) continuent de filtrer correctement l'en-tête `Host`.
- **`await blockForever()` est intentionnel.** Si `yargs.parse()` se résout, le niveau supérieur de la CLI retombe dans le point d'entrée TUI interactif (`gemini.tsx`). SIGINT / SIGTERM se terminent par le chemin `onSignal` de `runQwenServe`.

## 10. Répartition des fichiers de routes HTTP

L'assemblage principal se fait dans `createServeApp()` dans `server.ts`, qui monte quatre fichiers de routes modulaires :

| Routes                                                                                                                   | Fichier                                               | Point de montage                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------- |
| `/health`, `/demo`, `/capabilities`, toutes les routes session, flux device, vote de permission, SSE, et redémarrage MCP mono-serveur | `packages/cli/src/serve/server.ts`                    | Enregistré directement dans `createServeApp()`      |
| `/workspace/memory` (GET/POST)                                                                                           | `packages/cli/src/serve/workspace-memory.ts`           | `mountWorkspaceMemoryRoutes()`                       |
| Toutes les routes CRUD `/workspace/agents`                                                                                | `packages/cli/src/serve/workspace-agents.ts`           | `mountWorkspaceAgentsRoutes()`                       |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                                                   | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`                   |
| `POST /file/write`, `/file/edit`                                                                                        | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`                  |

Pour la référence complète des routes et du protocole filaire, voir [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Pour l'architecture, voir [`01-architecture.md`](./01-architecture.md).

## 11. Arrêt progressif vs arrêt brutal

- **Premier SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> arrêt progressif en deux phases :
  1. `bridge.shutdown()` : chaque canal reçoit `KILL_HARD_DEADLINE_MS` (10s), puis `channel.kill()`.
  2. `server.close()` : les requêtes en cours se vident, `SHUTDOWN_FORCE_CLOSE_MS` (5s) déclenche `closeAllConnections()`, puis un second délai de 2s s'applique.
- **Deuxième SIGINT / SIGTERM alors que la sortie est déjà en cours** -> `bridge.killAllSync()` tue de manière synchrone tous les enfants ACP avec SIGKILL et appelle `process.exit(1)` pour éviter les processus orphelins.

`RunHandle.close()` retourné par `runQwenServe` est l'équivalent programmatique pour les intégrateurs et les tests.

## 12. Invocation intégrée (sans passer par la CLI)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // éphémère
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Démon sur ${handle.url}`);
// ... appeler handle.bridge directement ou accéder à handle.server
await handle.close(); // arrêt programmatique
```

Ou obtenez l'application Express directement et écoutez vous-même :

```ts
import { createServeApp } from '@qwen-code/qwen-code/serve';

const app = createServeApp(
  {
    port: 0,
    hostname: '127.0.0.1',
    mode: 'http-bridge',
    maxSessions: 20,
  },
  () => 0,
  {
    /* dépendances : bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('écoute sur', server.address());
});
```

Remarque : lorsque vous appelez `createServeApp` directement, la valeur par défaut de `fsFactory.trusted` est `false`. L'ACP côté agent `writeTextFile` est rejetée avec `untrusted_workspace`, et un avertissement est affiché une fois sur stderr. Soit injectez `deps.fsFactory` avec une confiance explicite, injectez `deps.bridge`, soit acceptez le comportement par défaut limité par la confiance.

## 13. Recettes de débogage

Voir la section de débogage dans [`19-observability.md`](./19-observability.md). Les commandes courantes sont :

```bash
# Le démon est-il vivant ?
curl http://127.0.0.1:4170/health

# Quelles capacités sont annoncées ?
curl -s http://127.0.0.1:4170/capabilities | jq

# État de préparation du démon-hôte
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Suivre les SSE en direct
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Journaux détaillés
QWEN_SERVE_DEBUG=1 qwen serve
```

## Références

- Point d'entrée CLI : `packages/cli/src/commands/serve.ts`
- Amorçage : `packages/cli/src/serve/run-qwen-serve.ts`
- Fabrique Express : `packages/cli/src/serve/server.ts`
- Middleware : `packages/cli/src/serve/auth.ts`
- Fabrique de pont : `packages/acp-bridge/src/bridge.ts`
- HTML de la page de démo : `packages/cli/src/serve/demo.ts`
- Documentation utilisateur : [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Protocole filaire : [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)