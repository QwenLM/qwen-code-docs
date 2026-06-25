# Guide de démarrage et opérations

Cette page se concentre sur **comment lancer `qwen serve`, comment vérifier qu'il fonctionne, et à quoi ressemble la chaîne d'appels interne de `qwen serve` jusqu'au serveur en écoute**. L'architecture, les composants et les détails du protocole filaire se trouvent dans les autres pages détaillées sur le démon.

## 1. Chemin le plus court

```bash
qwen serve
```

Sortie :

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Ouvrez `http://127.0.0.1:4170/demo` dans un navigateur pour voir la console de débogage : interface de chat, flux d'événements et inspection de l'espace de travail. En mode de développement loopback par défaut, `/demo` est enregistré **avant** `bearerAuth` dans la branche de routage loopback de `packages/cli/src/serve/server.ts`, donc aucun jeton n'est requis.

## 2. Recettes de lancement

```bash
# 1. Défaut développement local (loopback, sans jeton)
qwen serve

# 2. Espace de travail explicite + port éphémère
qwen serve --workspace /path/to/repo --port 0

# 3. Développement loopback renforcé (forcer bearer même en loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Exposition sur le réseau local (non-loopback nécessite un jeton)
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

# 9. Désactiver le pool F2 (retour aux clients MCP par session)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Autoriser l'accès cross-origin à l'interface web du navigateur
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Délai de réponse des prompts + timeout d'inactivité SSE
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Garder le processus ACP enfant en vie après la fermeture de la dernière session
qwen serve --channel-idle-timeout-ms 60000

# 13. Activer la limitation de débit HTTP
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

Avec la recette loopback renforcée (3), `/demo` est enregistré après `bearerAuth`. Une navigation normale dans un navigateur nécessite un en-tête d'authentification ; utilisez plutôt curl ou un script SDK.

## 3. Liste complète des options de démarrage

La CLI est définie dans **`packages/cli/src/commands/serve.ts`** :

| Option                                  | Type                           | Défaut                                       | Requis quand                                | Effet                                                                                                                                                                                                               |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                           | Port TCP ; `0` signifie port éphémère attribué par l'OS.                                                                                                                                                           |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | Non-loopback nécessite jeton                | Adresse d'écoute. Valeurs loopback : `127.0.0.1`, `localhost`, `::1`, `[::1]`. Les crochets `[::1]` sont supprimés automatiquement ; l'entrée `host:port` est rejetée avec un message indiquant d'utiliser `--port`. |
| `--token <s>`                           | string                         | env / aucun                                  | Non-loopback et `--require-auth`            | Jeton Bearer ; trimé une fois. **Il apparaît dans `/proc/<pid>/cmdline`, donc préférez `QWEN_SERVER_TOKEN`**. La sortie d'erreur au démarrage prévient également.                                                   |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                           | Limite de sessions actives. Au-delà, retourne 503. `0` signifie illimité. `NaN` / valeurs négatives lèvent une exception.                                                                                           |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                           | Limite de prompts acceptés mais en attente/en cours d'exécution par session. Au-delà, retourne 503. `0` / `Infinity` signifie illimité. Les valeurs négatives ou non entières lèvent une exception.                |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                           | Espace de travail lié. **Doit être un chemin absolu, doit exister, et doit être un répertoire**. Au démarrage, il est canonisé une fois via `canonicalizeWorkspace`. `POST /session` avec un `cwd` différent retourne `400 workspace_mismatch`. |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                           | `server.maxConnections` au niveau de l'écouteur. `0` / `Infinity` signifie illimité. `NaN` / valeurs négatives empêchent le démarrage pour éviter un comportement fail-open.                                         |
| `--require-auth`                        | boolean                        | `false`                                      | Jeton requis                                | Étend l'authentification bearer à loopback **et** à `/health`. Le serveur refuse de démarrer sans jeton.                                                                                                            |
| `--enable-session-shell`                | boolean                        | `false`                                      | Jeton requis                                | Active l'exécution directe via `POST /session/:id/shell`. Les appelants doivent également envoyer un `X-Qwen-Client-Id` lié à la session.                                                                           |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                           | Profondeur de l'anneau de rejeu SSE par session. La limite haute est `MAX_EVENT_RING_SIZE = 1_000_000` ; les valeurs hors limites lèvent une exception lors de la construction du pont.                             |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                           | Mode pont étape 1 : un processus `qwen --acp` enfant multiplexé par le démon. Le mode en processus étape 2 n'est pas encore implémenté ; `--no-http-bridge` fait une chute arrière et affiche un message sur stderr. |
| `--mcp-client-budget <n>`               | number                         | aucun                                        | Requis pour `mcp-budget-mode=enforce`       | Limite de clients MCP de l'espace de travail. Doit être un entier positif.                                                                                                                                          |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn` si un budget est défini, sinon `off` | `enforce` nécessite `--mcp-client-budget`  | `enforce` refuse, `warn` avertit seulement à 75%, `off` est uniquement observation.                                                                                                                                 |
| `--allow-origin <pattern>`              | chaîne répétable               | aucun                                        | -                                           | Liste blanche CORS qui remplace le refus d'origine par défaut. `*` nécessite un jeton.                                                                                                                               |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                           | Autorise l'installation d'un `baseUrl` de fournisseur d'authentification sur localhost / réseau privé. Utilisez uniquement pour le développement local de confiance.                                                |
| `--prompt-deadline-ms <n>`              | number                         | aucun                                        | -                                           | Délai côté serveur pour un prompt en millisecondes ; le timeout annule le prompt.                                                                                                                                   |
| `--writer-idle-timeout-ms <n>`          | number                         | aucun                                        | -                                           | Délai d'inactivité par connexion SSE en millisecondes.                                                                                                                                                              |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                           | Garde le processus ACP enfant en vie après la fermeture de la dernière session. `0` signifie récupération immédiate.                                                                                                 |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                           | Intervalle de balayage du récupérateur de sessions. `0` le désactive.                                                                                                                                               |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                           | Délai d'inactivité d'une session déconnectée. `0` le désactive.                                                                                                                                                     |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                    | -                                           | Active ou désactive la limitation de débit HTTP par niveau.                                                                                                                                                         |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                              | Requêtes de prompt par fenêtre.                                                                                                                                                                                     |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                              | Requêtes de mutation par fenêtre.                                                                                                                                                                                   |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                              | Requêtes de lecture par fenêtre.                                                                                                                                                                                    |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                              | Longueur de la fenêtre de limitation de débit ; doit être `>= 1000`.                                                                                                                                                |
## 4. Variables d'environnement

| Env                                 | Effet / indicateur équivalent                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Équivalent à `--token` ; `--token` a la priorité. Tronqué une fois au démarrage pour éviter un saut de ligne intempestif provenant de `cat token.txt`.                  |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (insensible à la casse) active les logs stderr détaillés.                                                                                   |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` désactive complètement le pool MCP de l'espace de travail et revient à `McpClientManager` par session. Les capacités cessent d'annoncer `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`      | Budget interne de l'enfant ACP. La CLI le génère à partir de `--mcp-client-budget` via `childEnvOverrides` ; ce n'est pas un recours à la variable d'environnement du processus parent. |
| `QWEN_SERVE_MCP_BUDGET_MODE`        | Mode de budget interne de l'enfant ACP. La CLI le génère à partir de `--mcp-budget-mode` via `childEnvOverrides` ; ce n'est pas un recours à la variable d'environnement du processus parent. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Variable d'environnement de repli pour `--prompt-deadline-ms`.                                                                                                          |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Variable d'environnement de repli pour `--writer-idle-timeout-ms`.                                                                                                      |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`    | Lue par l'enfant ACP. Liste blanche des transports mis en pool, séparés par des virgules ; par défaut `stdio,websocket`.                                                |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`      | Lue par l'enfant ACP. Délai d'inactivité avant vidage d'une entrée du pool ; par défaut `30000`, limité à `1000..600000` ms.                                              |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` active la limitation de débit ; l'indicateur CLI a la priorité.                                                                                            |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Variable d'environnement de repli pour `--rate-limit-prompt`.                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Variable d'environnement de repli pour `--rate-limit-mutation`.                                                                                                         |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Variable d'environnement de repli pour `--rate-limit-read`.                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Variable d'environnement de repli pour `--rate-limit-window-ms`.                                                                                                        |

Les surcharges de variables d'environnement par poignée sont intentionnelles : deux démons exécutés dans le même processus n'entrent pas en conflit sur `process.env`. `defaultSpawnChannelFactory` capture l'environnement au moment du lancement.

## 5. `settings.json` est également lu

Au démarrage, `loadSettings(boundWorkspace)` est appelé une fois :

| Clé                          | Type                                                               | Comportement                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy`  | `'first-responder'` \| `'designated'` \| `'consensus'` \| `'local-only'` | Définit `BridgeOptions.permissionPolicy`. **Le démarrage valide avec `validatePolicyConfig`** ; les valeurs inconnues lèvent une `InvalidPolicyConfigError` au lieu de faire un repli silencieux. |
| `policy.consensusQuorum`     | entier positif                                                     | N pour la politique `consensus`. Par défaut `floor(M/2)+1`. Si défini sous une politique non-consensus, il est ignoré et le démarrage enregistre un avertissement stderr. |
| `context.fileName`           | chaîne de caractères                                               | Remplace `getCurrentGeminiMdFilename()` et contrôle le fichier écrit par `POST /workspace/init`.                                                                          |
| `tools.disabled`             | string[]                                                           | Normalisé via `normalizeDisabledToolList()` (suppression des espaces, des entrées vides, dédoublonnage) avant d'affecter le prochain lancement d'un enfant ACP.           |
| `tools.approvalMode`         | chaîne de caractères                                               | Mode d'approbation de session par défaut.                                                                                                                                |
| `telemetry`                  | objet                                                              | Configuration OTel : `enabled`, `otlpEndpoint`, `otlpProtocol`, points de terminaison par signal, etc. Voir [`17-configuration.md`](./17-configuration.md).              |
Un échec d'E/S des paramètres, comme un JSON malformé, entraîne un retour aux valeurs par défaut. `InvalidPolicyConfigError` est l'exception : une mauvaise configuration de la politique fait échouer explicitement le démarrage.

## 6. Scénarios de refus de démarrage (échecs explicites)

`run-qwen-serve.ts` lève intentionnellement une exception au lieu de revenir aux valeurs par défaut dans ces cas :

| Scénario                                                                       | Préfixe d'erreur                                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Liaison non-loopback sans jeton                                                | `Refusing to bind ... without a bearer token`                                                       |
| `--require-auth` sans jeton                                                    | `Refusing to start with --require-auth set but no bearer token`                                     |
| `--workspace` n'existe pas, n'est pas un répertoire ou n'est pas absolu        | `Invalid --workspace ...`                                                                           |
| Permission de stat `--workspace` refusée                                       | `Invalid --workspace ...: permission denied`                                                        |
| `--mcp-client-budget` n'est pas un entier positif                              | `Must be a positive integer`                                                                        |
| `--mcp-budget-mode=enforce` sans budget                                        | `requires a positive mcpClientBudget`                                                               |
| `--hostname` est écrit comme `localhost:4170`                                  | `looks like a "host:port" combination. Use --port`                                                  |
| `--hostname [::1]:8080`                                                        | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form` |
| `--max-connections` est `NaN` ou négatif                                       | `Must be >= 0`                                                                                      |
| `--event-ring-size > 1_000_000`                                                | Thrown during bridge construction                                                                   |
| `--allow-origin '*'` sans jeton                                                | `Refusing to start with --allow-origin '*' but no bearer token configured`                          |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` n'est pas un entier positif | `Must be a positive integer`                                                                        |
| `policy.permissionStrategy` inconnue ou `policy.consensusQuorum` non positif   | `InvalidPolicyConfigError`                                                                          |

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

Lorsque l'authentification par jeton (bearer) est activée, ajoutez `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` à chaque requête.

## 8. La page de démonstration peut-elle être utilisée ?

**Oui.** Elle est implémentée par `getDemoHtml(port)` dans `packages/cli/src/serve/demo.ts` comme HTML autonome sans dépendance externe.

| Mode de lancement                | Où `/demo` est enregistré                                                | Navigation directe dans le navigateur                               |
| -------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Loopback sans `--require-auth`   | Branche de route pré-authentification loopback dans `server.ts`, **avant** `bearerAuth` | Fonctionne sans jeton                                    |
| Loopback avec `--require-auth`   | Branche de route post-authentification dans `server.ts`, **après** `bearerAuth`          | Difficile à utiliser depuis un navigateur classique ; utilisez curl ou le SDK |
| Liaison non-loopback             | Branche de route post-authentification dans `server.ts`, **après** `bearerAuth`          | Idem ci-dessus                                           |
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

- **`createServeApp` ne fait que construire ; elle n'écoute pas.** Elle retourne une instance `express()` avec le middleware et les routes montés. L'appelant possède `app.listen()`. `server.test.ts` utilise la fabrique de cette façon dans environ 25 cas, donc la fabrique évite intentionnellement de posséder le cycle de vie.
- **`() => actualPort` est une fermeture paresseuse.** `actualPort` est assigné dans le callback de `app.listen`. Le middleware `hostAllowlist` le lit à la demande, donc les ports éphémères (`--port 0`) continuent de filtrer correctement l'en-tête `Host`.
- **`await blockForever()` est intentionnel.** Si `yargs.parse()` se résout, le niveau supérieur de la CLI passe au point d'entrée TUI interactif (`gemini.tsx`). SIGINT / SIGTERM se termine via le chemin `onSignal` de `runQwenServe`.

## 10. Répartition des fichiers de route HTTP

L'assemblage principal a lieu dans `createServeApp()` dans `server.ts`, qui monte quatre fichiers de route modulaires :

| Routes                                                                                                                    | Fichier                                               | Point de montage                               |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `/health`, `/demo`, `/capabilities`, toutes les routes de session, flux d'appareil, vote de permission, SSE, et redémarrage MCP mono-serveur | `packages/cli/src/serve/server.ts`                    | Enregistré directement dans `createServeApp()` |
| `/workspace/memory` (GET/POST)                                                                                            | `packages/cli/src/serve/workspace-memory.ts`           | `mountWorkspaceMemoryRoutes()`                 |
| Toutes les routes CRUD `/workspace/agents`                                                                                | `packages/cli/src/serve/workspace-agents.ts`           | `mountWorkspaceAgentsRoutes()`                 |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                                                     | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`            |
| `POST /file/write`, `/file/edit`                                                                                          | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`           |

Pour la référence complète des routes et du protocole filaire, voir [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Pour l'architecture, voir [`01-architecture.md`](./01-architecture.md).

## 11. Arrêt gracieux vs arrêt brutal

- **Premier SIGINT / SIGTERM** -> `runQwenServe` `onSignal` -> arrêt gracieux en deux phases :
  1. `bridge.shutdown()` : chaque canal reçoit `KILL_HARD_DEADLINE_MS` (10s), puis `channel.kill()`.
  2. `server.close()` : les requêtes en cours sont vidées, `SHUTDOWN_FORCE_CLOSE_MS` (5s) déclenche `closeAllConnections()`, puis un deuxième délai de 2s s'applique.
- **Deuxième SIGINT / SIGTERM alors que la sortie est déjà en cours** -> `bridge.killAllSync()` envoie synchroniquement SIGKILL à tous les enfants ACP et appelle `process.exit(1)` pour éviter les processus orphelins.
`RunHandle.close()` retourné par `runQwenServe` est l'équivalent programmatique pour les intégrateurs et les tests.

## 12. Invocation intégrée (contournement de la CLI)

```ts
import { runQwenServe } from '@qwen-code/qwen-code/serve';

const handle = await runQwenServe({
  port: 0, // ephemeral
  hostname: '127.0.0.1',
  mode: 'http-bridge',
  maxSessions: 20,
  workspace: '/abs/path/to/repo',
});
console.log(`Daemon at ${handle.url}`);
// ... call handle.bridge directly or access handle.server
await handle.close(); // programmatic shutdown
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
    /* deps: bridge, fsFactory, ... */
  },
);

const server = app.listen(0, '127.0.0.1', () => {
  console.log('listening on', server.address());
});
```

Remarque : en appelant `createServeApp` directement, la valeur par défaut `fsFactory.trusted = false`. Le `writeTextFile` ACP côté agent est rejeté comme `untrusted_workspace`, et un avertissement stderr est imprimé une fois. Soit injectez `deps.fsFactory` avec une confiance explicite, injectez `deps.bridge`, soit acceptez le comportement par défaut contrôlé par la confiance.

## 13. Recettes de débogage

Voir la section de débogage dans [`19-observability.md`](./19-observability.md). Les commandes courantes sont :

```bash
# Is the daemon alive?
curl http://127.0.0.1:4170/health

# Which capabilities are advertised?
curl -s http://127.0.0.1:4170/capabilities | jq

# Daemon-host readiness
curl -s http://127.0.0.1:4170/workspace/preflight | jq

# Tail live SSE
curl -N -H 'Accept: text/event-stream' \
     -H 'Last-Event-ID: 0' \
     'http://127.0.0.1:4170/session/<sid>/events'

# Verbose logs
QWEN_SERVE_DEBUG=1 qwen serve
```

## References

- Entrée CLI : `packages/cli/src/commands/serve.ts`
- Bootstrap : `packages/cli/src/serve/run-qwen-serve.ts`
- Fabrique Express : `packages/cli/src/serve/server.ts`
- Middleware : `packages/cli/src/serve/auth.ts`
- Fabrique du bridge : `packages/acp-bridge/src/bridge.ts`
- Page de démonstration HTML : `packages/cli/src/serve/demo.ts`
- Docs utilisateur : [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Protocole filaire : [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
