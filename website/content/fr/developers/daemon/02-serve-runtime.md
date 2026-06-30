# Serve Runtime

## Overview

`packages/cli/src/serve/` est la couche de démarrage pour `qwen serve`. Il traduit les flags CLI en `ServeOptions`, valide la configuration de démarrage, construit l'application Express, connecte les middlewares, enregistre les routes, expose les fournisseurs de pré-vérification/statut de l'hôte du daemon, maintient l'anneau d'audit des permissions, et gère la séquence d'arrêt progressif en deux phases. Le travail orienté HTTP se trouve dans cette couche ; le travail orienté ACP se trouve une couche en dessous dans `@qwen-code/acp-bridge` (voir [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Responsibilities

- Analyser et valider `ServeOptions` : adresse d'écoute, authentification, workspace, limites de sessions / connexions, budget / pool MCP, CORS, timeouts d'inactivité des prompts / SSE / sessions, rate limit, et toggles associés.
- **Canonicaliser** le workspace lié exactement une fois. La même forme canonique est partagée par `/capabilities`, le fallback `POST /session`, et le bridge.
- Rejeter les configurations de démarrage non sûres ou invalides : liaison non-loopback sans token, `--require-auth` sans token, `--allow-origin '*'` sans token, `mcpBudgetMode='enforce'` sans `mcpClientBudget` positif, un `--workspace` inexistant ou n'étant pas un répertoire, et des valeurs de timeout ou de rate-limit invalides.
- Construire la factory `WorkspaceFileSystem`, le publisher d'audit des permissions, le `DaemonStatusProvider`, et l'`acp-bridge`.
- Construire l'application Express, connecter les middlewares (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> access log -> `bearerAuth` -> rate limit -> JSON parser -> telemetry -> `mutationGate` par route), et monter les routes de session, CRUD de workspace, fichier, authentification device-flow, vote de permission, et HTTP ACP.
- Lier le port d'écoute et enregistrer les gestionnaires de signaux.
- Exécuter l'arrêt en deux phases sur SIGINT/SIGTERM ; forcer la sortie sur un second signal.

## Architecture

**Entrée** : `runQwenServe(opts, deps)` dans `packages/cli/src/serve/run-qwen-serve.ts`. Retourne un `RunHandle` (`{ url, port, close, ... }`).

**Factory d'application** : `createServeApp(opts, getPort, deps)` dans `packages/cli/src/serve/server.ts`. Construit l'`Application` Express. Les intégrateurs directs et les tests l'appellent sans le wrapper de bootstrap.

**Registre de capacités** : `SERVE_CAPABILITY_REGISTRY` dans `packages/cli/src/serve/capabilities.ts`. Chaque tag a une version `since` et des `modes` optionnels. Dix tags conditionnels (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) sont omis lorsque leur toggle correspondant est désactivé. Voir [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` et `server.ts`) :

| Middleware, dans l'ordre d'enregistrement             | Objectif                                                                                                                     | Notes                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors`           | Refuser tous les headers `Origin` par défaut ; passer à une allowlist lorsque `--allow-origin <pattern>` est configuré.      | Voir [`12-auth-security.md`](./12-auth-security.md).                                                              |
| `hostAllowlist(bind, getPort)`                        | Sur loopback, valider que `Host` appartient à `localhost`, `127.0.0.1`, `[::1]`, ou `host.docker.internal` plus le port réel.| Défense contre le DNS rebinding. La comparaison est insensible à la casse et mise en cache par port.              |
| Access-log middleware                                 | Enregistre la méthode, le chemin, le statut, durationMs, sessionId, et clientId dans `DaemonLogger` lorsqu'une requête se termine. | Enregistré **avant** `bearerAuth`, donc les refus 401 sont également journalisés. Ignore `/health` et le heartbeat. |
| `bearerAuth(token)`                                   | Comparaison bearer en temps constant avec SHA-256 plus `timingSafeEqual`.                                                      | Passthrough ouvert lorsqu'aucun token n'est configuré (défaut pour le dev en loopback). Le schéma `Bearer` est insensible à la casse. |
| Rate-limit middleware                                 | Token bucket optionnel par niveau pour les routes de prompt, mutation et lecture.                                              | Enregistré après `bearerAuth` et avant le parsing JSON ; retourne 429 avant le parsing lorsqu'un bucket est épuisé. |
| `express.json({ limit: '10mb' })`                     | Parsing du corps JSON.                                                                                                       | Les erreurs de parsing retournent 400.                                                                            |
| `daemonTelemetryMiddleware`                           | Enveloppe chaque requête HTTP dans un span OpenTelemetry via `withDaemonRequestSpan`.                                          | Les attributs incluent la route, sessionId, clientId, et le code de statut.                                       |
| `createMutationGate` (par route)                      | Gate opt-in au niveau de la route pour les routes de mutation qui nécessitent un token même sur loopback.                      | Retourne `401 { code: 'token_required' }`. Pas de `app.use` global ; les routes appellent `mutate({ strict: true })` si nécessaire. |

**Sous-systèmes** :

| Chemin                                                           | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve/fs/`                                                      | Factory `WorkspaceFileSystem` plus `policy.ts` (vérifications de taille/confiance/binaire), `paths.ts` (canonicalisation, resolveWithin, rejet des liens symboliques), `audit.ts`, et valeurs typées `FsError`.                                                                                                                                                                                                                                              |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | Handlers HTTP pour `GET /file`, `GET /file/bytes`, `POST /file/write`, et `POST /file/edit`.                                                                                                                                                                                                                                                                                                                                                                 |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory` (CRUD de QWEN.md).                                                                                                                                                                                                                                                                                                                                                                                                              |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents` (CRUD des sous-agents).                                                                                                                                                                                                                                                                                                                                                                                                  |
| `serve/daemon-status-provider.ts`                                | Snapshot d'environnement plus cellules de pré-vérification de l'hôte du daemon : version de Node, entrée CLI, stat du workspace, ripgrep, git, npm.                                                                                                                                                                                                                                                                                                          |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing` (FIFO de 512 entrées) et `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                                             |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | Routes OAuth device-flow. Voir [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                                                                                                                                                               |
| `serve/daemon-logger.ts`                                         | Logs de fichiers structurés `DaemonLogger`. Voir [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                                                                                                                                                             |
| `serve/debug-mode.ts`                                            | Prédicat partagé `isServeDebugMode()` contrôlant le contexte d'erreur verbeux dans les réponses HTTP.                                                                                                                                                                                                                                                                                                                                                        |
| `serve/acp-http/`                                                | Transport HTTP Streamable ACP (RFD #721), monté sur `/acp`. Sept fichiers implémentent JSON-RPC POST, SSE GET, le démontage DELETE, et l'utilisation partagée du bridge en parallèle de la surface REST.                                                                                                                                                                                                                                                       |
| `serve/demo.ts`                                                  | HTML inline autonome pour `GET /demo` : console de debug du navigateur avec UI de chat, log d'événements, et inspecteur de workspace. Sur loopback sans `--require-auth`, il est enregistré **avant** `bearerAuth` ; sur non-loopback ou avec `--require-auth`, il est enregistré **après** `bearerAuth`. Servi avec la CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` plus `X-Frame-Options: DENY`. |

**Imports du package ACP bridge** :

- Les primitives d'event-bus sont importées depuis `@qwen-code/acp-bridge/eventBus`.
- Les primitives de statut sont importées depuis `@qwen-code/acp-bridge/status`.
- `serve/acp-session-bridge.ts` reste comme façade de compatibilité locale au CLI pour la surface de bridge plus large.

## Flow

### Séquence de démarrage

1. **Résoudre et tronquer le token** depuis `opts.token` ou `QWEN_SERVER_TOKEN` ; cela évite qu'un saut de ligne final provenant de `cat token.txt` ne rompe silencieusement la comparaison bearer.
2. **Garde contre les fautes de frappe du hostname** : `--hostname localhost:4170` génère une erreur et suggère `--port`.
3. **Pré-vérification de l'authentification** : non-loopback sans token est refusé ; `--require-auth` sans token est refusé.
4. **Validation du workspace** : chemin absolu, existe, répertoire. `EACCES` / `EPERM` sont encapsulés pour pointer vers le flag.
5. **Canonicaliser le workspace** : `canonicalizeWorkspace(rawWorkspace)` exécute `realpathSync.native` une fois et alimente `/capabilities`, le fallback `POST /session`, et le bridge.
6. **Validation du budget MCP** : entier positif ; `enforce` nécessite un budget.
7. **Inférence du toggle du pool MCP** : l'env parent `QWEN_SERVE_NO_MCP_POOL=1` rend `mcpPoolActive=false`, donc les capacités omettent honnêtement `mcp_workspace_pool` et `mcp_pool_restart`.
8. **Validation CORS / timeout / rate-limit** : `--allow-origin '*'` nécessite un token ; les valeurs de prompt, writer, channel idle, session idle, reaper, et fenêtre de rate-limit échouent rapidement si elles sont invalides.
9. **`childEnvOverrides` par handle** : passer `QWEN_SERVE_MCP_CLIENT_BUDGET` et `QWEN_SERVE_MCP_BUDGET_MODE` à l'enfant ACP via `BridgeOptions.childEnvOverrides` au lieu de muter `process.env`.
10. **Charger `settings.json` une seule fois** : lire `context.fileName`, `policy.permissionStrategy`, et `policy.consensusQuorum`. Les fichiers corrompus reviennent aux valeurs par défaut. `validatePolicyConfig()` vérifie `policy.*` par rapport à `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` ; les stratégies inconnues ou un `consensusQuorum` non positif lèvent `InvalidPolicyConfigError`. Un quorum défini sous une stratégie non-`consensus` journalise un avertissement sur stderr.
11. **Allouer `PermissionAuditRing`** (512 entrées).
12. **Construire `fsFactory`** : `runQwenServe` a par défaut `trusted: true` ; les appelants directs de `createServeApp` ont par défaut `trusted: false` et avertissent une fois.
13. **`createHttpAcpBridge`**, voir [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** assemble Express.
15. **`server.listen(port, hostname)`**, puis résoudre le `getPort()` réel pour l'allowlist d'hôtes.
16. **Enregistrer les gestionnaires SIGINT / SIGTERM** pour l'arrêt progressif.

### Arrêt progressif

1. **Phase 1 - démontage du bridge** au premier signal :
   - Supprimer le registre device-flow et annuler les flux en attente.
   - `bridge.shutdown()` marque chaque canal avec `isDying = true`, envoie une fermeture progressive à l'stdin de chaque enfant ACP, attend `KILL_HARD_DEADLINE_MS` (10s) par canal, puis appelle `channel.kill()` si nécessaire.
2. **Phase 2 - démontage HTTP** :
   - `server.close()` arrête d'accepter les nouvelles connexions et laisse les requêtes en cours se terminer.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) déclenche `server.closeAllConnections()`.
   - Un second délai de 2s escalade à nouveau si nécessaire.
3. **Second signal pendant la sortie** :
   - `bridge.killAllSync()` + `process.exit(1)` pour éviter que des enfants orphelins ne bloquent la sortie du daemon.

## État et cycle de vie

`RunHandle` expose :

- `url` : URL d'écoute résolue, après la résolution du port éphémère.
- `port` : port réel, y compris la résolution de `0`.
- `close({ timeoutMs? })` : arrêt programmatique pour les intégrateurs et les tests.

Appeler `createServeApp` directement retourne seulement une `Application` ; l'intégrateur possède `listen` et l'arrêt.

## Dépendances

| Upstream utilisé par `serve/`                                                                         | Downstream utilisant `serve/`             |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge` : bridge, event bus, types de statut                                          | Le handler de la sous-commande `serve` du CLI `qwen` |
| `packages/core` : `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`          | Intégrateurs directs, tests               |
| ACP SDK (`@agentclientprotocol/sdk`) : `PROTOCOL_VERSION`, `ClientSideConnection` via le bridge       |                                           |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                          |                                           |

## Configuration

| Source          | Clé                                                                                           | Effet                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Env             | `QWEN_SERVER_TOKEN`                                                                           | Token bearer après troncature.                                                                        |
| Env             | `QWEN_SERVE_NO_MCP_POOL=1`                                                                    | Force `mcpPoolActive=false`.                                                                          |
| Env enfant ACP  | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                 | Généré depuis `--mcp-client-budget` / `--mcp-budget-mode` et transmis via `childEnvOverrides`.        |
| Env             | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                         | Timeouts d'inactivité par défaut des prompts / SSE.                                                   |
| Env             | `QWEN_SERVE_RATE_LIMIT*`                                                                      | Switch de rate-limit, limites des prompts / mutations / lectures, et fenêtre par défaut.              |
| Env             | `QWEN_SERVE_DEBUG=1`                                                                          | Logs stderr verbeux. Voir [`19-observability.md`](./19-observability.md).                             |
| Flags           | `--hostname`, `--port`                                                                        | Liaison d'écoute.                                                                                     |
| Flags           | `--token`, `--require-auth`, `--enable-session-shell`                                         | Token bearer, durcissement de l'auth loopback, et switch d'exécution de shell explicite.              |
| Flag            | `--workspace`                                                                                 | Remplace `process.cwd()`.                                                                             |
| Flags           | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size`| Limites Bridge / Express.                                                                             |
| Flags           | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                               | Transmis à l'enfant ACP.                                                                              |
| Flags           | `--allow-origin`, `--allow-private-auth-base-url`                                             | Allowlist CORS du navigateur et switch d'installation du fournisseur d'auth localhost/privé.          |
| Flags           | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`               | Contrôle du cycle de vie d'inactivité des prompts, writers SSE, et enfants ACP.                       |
| Flags           | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                     | Contrôle du nettoyage des sessions déconnectées.                                                      |
| Flags           | `--rate-limit*`                                                                               | Rate limit HTTP par niveau.                                                                           |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum`                                         | Politique et quorum de `MultiClientPermissionMediator`.                                               |
| `settings.json` | `context.fileName`                                                                            | Remplacement de `getCurrentGeminiMdFilename` pour le bridge.                                          |
Voir [`17-configuration.md`](./17-configuration.md) pour la référence fusionnée.

## Mises en garde et limites connues

- Un appel direct à `createServeApp` sans `deps.fsFactory` ou `deps.bridge` utilise par défaut `trusted: false` ; l'ACP côté agent `writeTextFile` rejette la requête avec `untrusted_workspace`. L'avertissement n'est affiché qu'une seule fois.
- `denyBrowserOriginCors` rejette **toutes** les requêtes portant l'en-tête `Origin` ; la page de démo fonctionne car un autre middleware supprime d'abord les valeurs `same-origin` correspondantes.
- Ordre des body-parsers : les routes utilisant `mutate({ strict: true })` retournent 401 seulement après `express.json()`. Le pire cas est `--max-connections × express.json({limit: '10mb'})`, ce qui peut aller jusqu'à environ 2,5 Go de mémoire transitoire sur un listener loopback saturé ; ce compromis est intentionnel.
- Plusieurs démons dans un même processus doivent utiliser des `childEnvOverrides` par handle ; la mutation de `process.env` crée des conditions de course car `defaultSpawnChannelFactory` prend un snapshot de l'environnement au moment du spawn.

## Références

- `packages/cli/src/serve/run-qwen-serve.ts` (amorçage, validation au démarrage, arrêt propre)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, assemblage des middlewares et des routes)
- `packages/cli/src/serve/auth.ts` (CORS, allowlist des hôtes, authentification bearer, contrôle des mutations)
- `packages/cli/src/serve/rate-limit.ts` (limite de débit HTTP par niveau)
- `packages/cli/src/serve/capabilities.ts` (registre des capacités et annonce conditionnelle)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Tickets : [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)