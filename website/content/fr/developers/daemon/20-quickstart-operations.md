# Démarrage rapide et opérations

Cette page se concentre sur **comment démarrer `qwen serve`, comment vérifier qu'il fonctionne, et à quoi ressemble la chaîne d'appels interne de `qwen serve` au serveur en écoute**. Les détails sur l'architecture, les composants et le protocole de communication se trouvent dans les autres pages d'exploration approfondie du démon.

## 1. Chemin le plus court

```bash
qwen serve
```

Output:

```text
qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/your/cwd)
qwen serve: bound to workspace "/your/cwd"
qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Ouvrez `http://127.0.0.1:4170/demo` dans un navigateur pour voir la console de débogage : l'interface de chat, le flux d'événements et l'inspection du workspace. En mode développement loopback par défaut, `createServeApp()` monte la route `/demo` depuis `packages/cli/src/serve/routes/health-demo.ts` **avant** `bearerAuth`, aucun token n'est donc requis.

## 2. Recettes de lancement

```bash
# 1. Dév local par défaut (loopback, pas de token)
qwen serve

# 2. Workspace explicite + port éphémère
qwen serve --workspace /path/to/repo --port 0

# 3. Développement loopback renforcé (force le bearer même sur loopback)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) qwen serve --require-auth

# 4. Exposition au LAN (le non-loopback requiert un token)
QWEN_SERVER_TOKEN=$(openssl rand -hex 32) \
  qwen serve --hostname 0.0.0.0 --port 4170

# 5. Ajustement pour de nombreuses sessions et un ring de replay plus grand
qwen serve --max-sessions 0 --event-ring-size 32000

# 6. Collaboration multi-clients + budget MCP strict
QWEN_SERVER_TOKEN=secret \
  qwen serve --require-auth \
             --mcp-client-budget 10 \
             --mcp-budget-mode enforce

# 7. Démarrage avec une politique de consensus configurée dans settings.json
# settings.json: { "policy": { "permissionStrategy": "consensus", "consensusQuorum": 2 } }
qwen serve

# 8. Logs de débogage
QWEN_SERVE_DEBUG=1 qwen serve

# 9. Désactivation du pool F2 (fallback sur les clients MCP par session)
QWEN_SERVE_NO_MCP_POOL=1 qwen serve

# 10. Autorisation de l'accès cross-origin pour l'interface web du navigateur
QWEN_SERVER_TOKEN=secret \
  qwen serve --allow-origin 'http://localhost:3000'

# 11. Deadline du prompt + timeout d'inactivité SSE
qwen serve --prompt-deadline-ms 300000 --writer-idle-timeout-ms 600000

# 12. Maintenir le child ACP actif après la fermeture de la dernière session
qwen serve --channel-idle-timeout-ms 60000

# 13. Activation du rate limiting HTTP
QWEN_SERVE_RATE_LIMIT=1 qwen serve
```

Avec la recette loopback renforcée (3), `/demo` est enregistré après `bearerAuth`. Une navigation classique dans le navigateur nécessite un en-tête d'authentification, utilisez plutôt curl ou un script SDK.

## 3. Flags de démarrage complets

La CLI est définie dans **`packages/cli/src/commands/serve.ts`** :

| Flag                                    | Type                           | Défaut                                       | Requis quand                             | Effet                                                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------ | -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | number                         | `4170`                                       | -                                        | Port TCP ; `0` signifie un port éphémère assigné par l'OS.                                                                                                                                                            |
| `--hostname <host>`                     | string                         | `127.0.0.1`                                  | Le non-loopback requiert un token        | Adresse de liaison. Valeurs loopback : `127.0.0.1`, `localhost`, `::1`, `[::1]`. Les crochets de `[::1]` sont retirés automatiquement ; l'entrée `host:port` est rejetée avec une indication pour utiliser `--port`. |
| `--token <s>`                           | string                         | env / none                                   | Non-loopback et `--require-auth`         | Token bearer ; nettoyé (trim) une fois. **Il apparaît dans `/proc/<pid>/cmdline`, préférez donc `QWEN_SERVER_TOKEN`**. Le stderr de démarrage avertit également de cela.                                                |
| `--max-sessions <n>`                    | number                         | `20`                                         | -                                        | Limite de sessions actives. Un spawn excédentaire retourne 503. `0` signifie illimité. Les valeurs `NaN` / négatives lèvent une erreur.                                                                               |
| `--max-pending-prompts-per-session <n>` | number                         | `5`                                          | -                                        | Limite de prompts acceptés mais en attente/en cours d'exécution par session. Un prompt excédentaire retourne 503. `0` / `Infinity` signifie illimité. Les valeurs négatives ou non entières lèvent une erreur.        |
| `--workspace <dir>`                     | string                         | `process.cwd()`                              | -                                        | Workspace lié. **Doit être un chemin absolu, doit exister et doit être un répertoire**. Le démarrage le canonise une fois via `canonicalizeWorkspace`. Un `POST /session` avec un `cwd` ne correspondant pas retourne `400 workspace_mismatch`. |
| `--max-connections <n>`                 | number                         | `256`                                        | -                                        | `server.maxConnections` au niveau du listener. `0` / `Infinity` signifie illimité. Les valeurs `NaN` / négatives font échouer le démarrage pour éviter un comportement fail-open.                                     |
| `--require-auth`                        | boolean                        | `false`                                      | Token requis                             | Étend l'authentification bearer au loopback **et** à `/health`. Le démarrage refuse de démarrer sans token.                                                                                                           |
| `--enable-session-shell`                | boolean                        | `false`                                      | Token requis                             | Active l'exécution directe de `POST /session/:id/shell`. Les appelants doivent également envoyer un `X-Qwen-Client-Id` lié à la session.                                                                                |
| `--event-ring-size <n>`                 | number                         | `8000`                                       | -                                        | Profondeur du ring de replay SSE par session. La limite souple est `MAX_EVENT_RING_SIZE = 1_000_000` ; les valeurs hors limites lèvent une erreur lors de la construction du bridge.                                  |
| `--http-bridge`                         | boolean                        | `true`                                       | -                                        | Mode bridge étape 1 : un child `qwen --acp` multiplexé par le démon. Le mode in-process étape 2 n'est pas encore implémenté ; `--no-http-bridge` fallback et affiche sur stderr.                                      |
| `--mcp-client-budget <n>`               | number                         | none                                         | Requis pour `mcp-budget-mode=enforce`    | Limite de clients MCP du workspace. Doit être un entier positif.                                                                                                                                                      |
| `--mcp-budget-mode <m>`                 | `'enforce' \| 'warn' \| 'off'` | `warn` quand un budget est défini, sinon `off` | `enforce` requiert `--mcp-client-budget` | `enforce` refuse, `warn` avertit seulement à 75%, `off` est en observation seule.                                                                                                                                     |
| `--allow-origin <pattern>`              | repeatable string              | none                                         | -                                        | Liste blanche CORS qui remplace le déni d'Origin par défaut. `*` requiert un token.                                                                                                                                   |
| `--allow-private-auth-base-url`         | boolean                        | `false`                                      | -                                        | Autorise l'installation de `baseUrl` pour le fournisseur d'authentification localhost / réseau privé. À utiliser uniquement pour le développement local de confiance.                                                   |
| `--prompt-deadline-ms <n>`              | number                         | none                                         | -                                        | Limite d'horloge murale (wallclock) du prompt côté serveur en ms ; le timeout annule le prompt.                                                                                                                       |
| `--writer-idle-timeout-ms <n>`          | number                         | none                                         | -                                        | Timeout d'inactivité par connexion SSE en ms.                                                                                                                                                                         |
| `--channel-idle-timeout-ms <n>`         | number                         | `0`                                          | -                                        | Maintient le child ACP en vie après la fermeture de la dernière session. `0` signifie une récupération immédiate.                                                                                                     |
| `--session-reap-interval-ms <n>`        | number                         | `60000`                                      | -                                        | Intervalle de scan du reaper de session. `0` le désactive.                                                                                                                                                            |
| `--session-idle-timeout-ms <n>`         | number                         | `1800000`                                    | -                                        | Timeout d'inactivité des sessions déconnectées. `0` le désactive.                                                                                                                                                     |
| `--rate-limit` / `--no-rate-limit`      | boolean                        | env / off                                    | -                                        | Active ou désactive le rate limiting HTTP par niveau.                                                                                                                                                                 |
| `--rate-limit-prompt <n>`               | number                         | `10`                                         | `--rate-limit`                           | Requêtes de prompt par fenêtre.                                                                                                                                                                                       |
| `--rate-limit-mutation <n>`             | number                         | `30`                                         | `--rate-limit`                           | Requêtes de mutation par fenêtre.                                                                                                                                                                                     |
| `--rate-limit-read <n>`                 | number                         | `120`                                        | `--rate-limit`                           | Requêtes de lecture par fenêtre.                                                                                                                                                                                      |
| `--rate-limit-window-ms <n>`            | number                         | `60000`                                      | `--rate-limit`                           | Durée de la fenêtre de rate limiting ; doit être `>= 1000`.                                                                                                                                                           |

## 4. Variables d'environnement

| Variable d'env                          | Équivalent flag / effet                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                     | Équivalent à `--token` ; `--token` est prioritaire. Nettoyé (trim) une fois au démarrage pour éviter un retour à la ligne final provenant de `cat token.txt`.               |
| `QWEN_SERVE_DEBUG`                      | `1` / `true` / `on` / `yes` (insensible à la casse) active les logs verbeux sur stderr.                                                                                   |
| `QWEN_SERVE_NO_MCP_POOL`                | `1` désactive entièrement le pool MCP du workspace et fallback sur `McpClientManager` par session. Les capacités cessent d'annoncer `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`          | Entrée de budget interne du child ACP. La CLI la génère depuis `--mcp-client-budget` via `childEnvOverrides` ; ce n'est pas un fallback d'env du processus parent.          |
| `QWEN_SERVE_MCP_BUDGET_MODE`            | Mode de budget interne du child ACP. La CLI le génère depuis `--mcp-budget-mode` via `childEnvOverrides` ; ce n'est pas un fallback d'env du processus parent.              |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`         | Fallback d'env pour `--prompt-deadline-ms`.                                                                                                                               |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`     | Fallback d'env pour `--writer-idle-timeout-ms`.                                                                                                                           |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`        | Lu par le child ACP. Liste blanche des transports du pool séparés par des virgules ; la valeur par défaut est `stdio,websocket`.                                          |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`          | Lu par le child ACP. Délai de vidage (drain) d'inactivité des entrées du pool ; la valeur par défaut est `30000`, bornée entre `1000..600000` ms.                         |
| `QWEN_SERVE_RATE_LIMIT`                 | `1` / `true` active le rate limiting ; le flag CLI est prioritaire.                                                                                                       |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`          | Fallback d'env pour `--rate-limit-prompt`.                                                                                                                                |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`        | Fallback d'env pour `--rate-limit-mutation`.                                                                                                                              |
| `QWEN_SERVE_RATE_LIMIT_READ`            | Fallback d'env pour `--rate-limit-read`.                                                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`       | Fallback d'env pour `--rate-limit-window-ms`.                                                                                                                             |

Les overrides d'env par handle sont intentionnels : deux démons s'exécutant dans le même processus n'entrent pas en compétition sur `process.env`. `defaultSpawnChannelFactory` prend un snapshot de l'env au moment du spawn.

## 5. `settings.json` est également lu

Le démarrage appelle `loadSettings(boundWorkspace)` une seule fois :

| Clé                         | Type                                                               | Comportement                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Définit `BridgeOptions.permissionPolicy`. **Le démarrage valide avec `validatePolicyConfig`** ; les valeurs inconnues lèvent `InvalidPolicyConfigError` au lieu de fallback silencieusement. |
| `policy.consensusQuorum`    | positive integer                                                   | N pour la politique `consensus`. La valeur par défaut est `floor(M/2)+1`. Si défini sous une politique non-consensus, il est ignoré et le démarrage logue un avertissement sur stderr. |
| `context.fileName`          | string                                                             | Remplace `getCurrentGeminiMdFilename()` et contrôle quel fichier `POST /workspace/init` écrit.                                                                           |
| `tools.disabled`            | string[]                                                           | Normalisé via `normalizeDisabledToolList()` (trim, suppression des entrées vides, déduplication) avant d'affecter le prochain spawn de child ACP.                         |
| `tools.approvalMode`        | string                                                             | Mode d'approbation de session par défaut.                                                                                                                                |
| `telemetry`                 | object                                                             | Configuration OTel : `enabled`, `otlpEndpoint`, `otlpProtocol`, endpoints par signal, et plus. Voir [`17-configuration.md`](./17-configuration.md).                      |

Une erreur d'E/S des paramètres, comme un JSON malformé, fallback sur les valeurs par défaut. `InvalidPolicyConfigError` est l'exception : une mauvaise configuration de la politique fait échouer le démarrage explicitement.

## 6. Scénarios de refus de démarrage (échecs explicites)

`run-qwen-serve.ts` lève intentionnellement une erreur au lieu de fallback dans ces cas :

| Scénario                                                                      | Préfixe d'erreur                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Liaison non-loopback sans token                                               | `Refusing to bind ... without a bearer token`                                                           |
| `--require-auth` sans token                                                   | `Refusing to start with --require-auth set but no bearer token`                                         |
| `--workspace` n'existe pas, n'est pas un répertoire ou n'est pas absolu       | `Invalid --workspace ...`                                                                               |
| Permission refusée pour le stat de `--workspace`                              | `Invalid --workspace ...: permission denied`                                                            |
| `--mcp-client-budget` n'est pas un entier positif                             | `Must be a positive integer`                                                                            |
| `--mcp-budget-mode=enforce` sans budget                                       | `requires a positive mcpClientBudget`                                                                   |
| `--hostname` est écrit sous la forme `localhost:4170`                         | `looks like a "host:port" combination. Use --port`                                                      |
| `--hostname [::1]:8080`                                                       | `Invalid --hostname ... brackets indicate an IPv6 literal but the value is not a clean [addr] form`     |
| `--max-connections` est `NaN` ou négatif                                      | `Must be >= 0`                                                                                          |
| `--event-ring-size > 1_000_000`                                               | Levée lors de la construction du bridge                                                                 |
| `--allow-origin '*'` sans token                                               | `Refusing to start with --allow-origin '*' but no bearer token configured`                              |
| `--prompt-deadline-ms` / `--writer-idle-timeout-ms` n'est pas un entier positif | `Must be a positive integer`                                                                            |
| `policy.permissionStrategy` inconnu ou `policy.consensusQuorum` non positif   | `InvalidPolicyConfigError`                                                                              |
## 7. Checklist de vérification avec curl

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

Lorsque l'authentification bearer est activée, ajoutez `-H "Authorization: Bearer $QWEN_SERVER_TOKEN"` à chaque requête.

## 8. La page de démo peut-elle être utilisée ?

**Oui.** Elle est implémentée par `getDemoHtml(port)` dans `packages/cli/src/serve/demo.ts` sous forme de HTML autonome sans dépendance externe.

| Mode de lancement                       | Où `/demo` est enregistré                                                    | Navigation directe depuis le navigateur                              |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Loopback sans `--require-auth` | `routes/health-demo.ts`, monté par `createServeApp()` **avant** `bearerAuth` | Fonctionne sans token                                    |
| Loopback avec `--require-auth`    | `routes/health-demo.ts`, monté par `createServeApp()` **après** `bearerAuth`  | Difficile à utiliser depuis un navigateur standard ; utilisez curl ou le SDK |
| Bind non-loopback                 | `routes/health-demo.ts`, monté par `createServeApp()` **après** `bearerAuth`  | Identique au précédent                                          |

La CSP est `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`, ainsi que `X-Frame-Options: DENY`. La page peut uniquement effectuer des requêtes vers `'self'` (le daemon) et ne peut pas charger de scripts ou de styles externes.

## 9. Chaîne d'appel de `qwen serve` au serveur en écoute

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

- **`createServeApp` se contente de construire ; il ne met pas le serveur en écoute.** Il retourne une instance `express()` avec les middlewares et les routes montés. L'appelant est propriétaire de `app.listen()`. `server.test.ts` utilise la factory de cette manière dans environ 25 cas, la factory évite donc intentionnellement de gérer le cycle de vie.
- **`() => actualPort` est une closure paresseuse (lazy closure).** `actualPort` est assigné dans le callback de `app.listen`. Le middleware `hostAllowlist` le lit à la demande, de sorte que les ports éphémères (`--port 0`) filtrent toujours correctement l'en-tête `Host`.
- **`await blockForever()` est intentionnel.** Si `yargs.parse()` résout, le niveau supérieur du CLI passe au point d'entrée de l'interface TUI interactive (`gemini.tsx`). SIGINT / SIGTERM quittent via le chemin `onSignal` de `runQwenServe`.

## 10. Répartition des fichiers de routes HTTP

L'assemblage principal a lieu dans `createServeApp()` dans `server.ts`, qui connecte les middlewares et monte des modules de routes spécifiques :

| Routes                                                                                       | Fichier                                                    | Point de montage                                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/health`, `/demo`                                                                           | `packages/cli/src/serve/routes/health-demo.ts`          | `healthDemoRoutes.register()`                                                  |
| `/daemon/status`                                                                             | `packages/cli/src/serve/routes/daemon-status.ts`        | `registerDaemonStatusRoutes()`                                                 |
| `/capabilities`, routes d'initialisation d'espace de travail/outils/mutations MCP, bridge HTTP ACP                    | `packages/cli/src/serve/server.ts`                      | Enregistré directement dans `createServeApp()`                                  |
| Statut de l'espace de travail, env, preflight, résumés MCP/outils/provider/skill                          | `packages/cli/src/serve/routes/workspace-status.ts`     | `registerWorkspaceStatusRoutes()`, `registerWorkspaceDiagnosticStatusRoutes()` |
| Extensions de l'espace de travail et opérations sur les extensions                                                | `packages/cli/src/serve/routes/workspace-extensions.ts` | `registerWorkspaceExtensionRoutes()`                                           |
| `/workspace/memory` (GET/POST)                                                               | `packages/cli/src/serve/workspace-memory.ts`            | `mountWorkspaceMemoryRoutes()`                                                 |
| Toutes les routes CRUD `/workspace/agents`                                                          | `packages/cli/src/serve/workspace-agents.ts`            | `mountWorkspaceAgentsRoutes()`                                                 |
| `GET /file`, `/file/bytes`, `/list`, `/glob`, `/stat`                                        | `packages/cli/src/serve/routes/workspace-file-read.ts`  | `registerWorkspaceFileReadRoutes()`                                            |
| `POST /file/write`, `/file/edit`                                                             | `packages/cli/src/serve/routes/workspace-file-write.ts` | `registerWorkspaceFileWriteRoutes()`                                           |
| Configuration de l'espace de travail, trust, paramètres, permissions et routes vocales                              | `packages/cli/src/serve/routes/workspace-*.ts`          | `registerWorkspaceSetupGithubRoutes()`, `registerWorkspaceTrustRoutes()`, etc. |
| Routes du fournisseur d'authentification de l'espace de travail et du flux d'appareil (device-flow)                                               | `packages/cli/src/serve/routes/workspace-auth.ts`       | `registerWorkspaceAuthRoutes()`                                                |
| Cycle de vie de la session, prompt, métadonnées, langue, shell, recap, rewind, branch et routes de liste | `packages/cli/src/serve/routes/session.ts`              | `registerSessionRoutes()`                                                      |
| Flux SSE `GET /session/:id/events`                                                         | `packages/cli/src/serve/routes/sse-events.ts`           | `registerSseEventsRoutes()`                                                    |
| Routes de réponse aux permissions                                                                   | `packages/cli/src/serve/routes/permission.ts`           | `registerPermissionRoutes()`                                                   |

Pour la référence complète des routes et du protocole de communication (wire protocol), consultez [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Pour l'architecture, consultez [`01-architecture.md`](./01-architecture.md).

## 11. Arrêt gracieux (graceful) vs arrêt forcé (hard)

- **Premier SIGINT / SIGTERM** -> `onSignal` de `runQwenServe` -> arrêt gracieux en deux phases :
  1. `bridge.shutdown()` : chaque canal dispose de `KILL_HARD_DEADLINE_MS` (10s), puis `channel.kill()` est appelé.
  2. `server.close()` : les requêtes en cours se terminent (drain), `SHUTDOWN_FORCE_CLOSE_MS` (5s) déclenche `closeAllConnections()`, puis un second délai de 2s s'applique.
- **Second SIGINT / SIGTERM alors que le processus est déjà en cours d'arrêt** -> `bridge.killAllSync()` envoie un SIGKILL synchrone à tous les processus enfants ACP et appelle `process.exit(1)` pour éviter les processus orphelins.

`RunHandle.close()` retourné par `runQwenServe` est l'équivalent programmatique pour les intégrateurs (embedders) et les tests.

## 12. Invocation intégrée (contournement du CLI)

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

Ou obtenez l'application Express directement et mettez-la en écoute vous-même :

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

Remarque : lors de l'appel direct à `createServeApp`, la valeur par défaut est `fsFactory.trusted = false`. L'ACP côté agent `writeTextFile` est rejeté en tant que `untrusted_workspace`, et un avertissement est affiché une fois sur stderr. Vous pouvez soit injecter `deps.fsFactory` avec une confiance explicite, injecter `deps.bridge`, soit accepter le comportement par défaut conditionné par la confiance (trust-gated).

## 13. Recettes de débogage

Consultez la section de débogage dans [`19-observability.md`](./19-observability.md). Les commandes courantes sont :

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

## Références

- Point d'entrée CLI : `packages/cli/src/commands/serve.ts`
- Amorçage (Bootstrap) : `packages/cli/src/serve/run-qwen-serve.ts`
- Factory Express : `packages/cli/src/serve/server.ts`
- Middleware : `packages/cli/src/serve/auth.ts`
- Factory de bridge : `packages/acp-bridge/src/bridge.ts`
- HTML de la page de démo : `packages/cli/src/serve/demo.ts`
- Documentation utilisateur : [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
- Protocole de communication (Wire protocol) : [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)