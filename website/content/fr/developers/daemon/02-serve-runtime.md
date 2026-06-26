# Runtime du Serveur

## Vue d'ensemble

Le dossier `packages/cli/src/serve/` constitue la couche d'amorçage pour `qwen serve`. Il traduit les flags CLI en `ServeOptions`, valide la configuration de démarrage, construit l'application Express, câble le middleware, enregistre les routes, expose les fournisseurs de pré-vérification et de statut du démon, maintient l'anneau d'audit des permissions, et possède la séquence d'arrêt progressif en deux phases. Le travail orienté HTTP se trouve dans cette couche ; le travail orienté ACP se trouve une couche en dessous dans `@qwen-code/acp-bridge` (voir [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Responsabilités

- Analyser et valider `ServeOptions` : adresse d'écoute, authentification, espace de travail, limites de sessions / connexions, budget / pool MCP, CORS, timeouts d'inactivité prompt / SSE / session, limite de débit, et options associées.
- **Canonicaliser** l'espace de travail lié exactement une fois. La même forme canonique est partagée par `/capabilities`, la solution de repli `POST /session`, et le pont.
- Rejeter les configurations de démarrage dangereuses ou invalides : liaison non-loopback sans jeton, `--require-auth` sans jeton, `--allow-origin '*'` sans jeton, `mcpBudgetMode='enforce'` sans `mcpClientBudget` positif, un `--workspace` inexistant ou non-répertoire, et des valeurs de timeout ou de limite de débit invalides.
- Construire la fabrique `WorkspaceFileSystem`, l'éditeur d'audit des permissions, `DaemonStatusProvider`, et `acp-bridge`.
- Construire l'application Express, câbler le middleware (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> journal d'accès -> `bearerAuth` -> limite de débit -> analyseur JSON -> télémétrie -> `mutationGate` par route), et monter les routes de session, CRUD d'espace de travail, fichiers, authentification par flux d'appareil, vote de permission, et HTTP ACP.
- Lier le port d'écoute et enregistrer les gestionnaires de signaux.
- Effectuer un arrêt en deux phases sur SIGINT/SIGTERM ; forcer la sortie sur un second signal.

## Architecture

**Point d'entrée** : `runQwenServe(opts, deps)` dans `packages/cli/src/serve/run-qwen-serve.ts`. Retourne un `RunHandle` (`{ url, port, close, ... }`).

**Fabrique d'application** : `createServeApp(opts, getPort, deps)` dans `packages/cli/src/serve/server.ts`. Construit l'`Application` Express. Les intégrateurs directs et les tests l'appellent sans l'enveloppe d'amorçage.

**Registre de capacités** : `SERVE_CAPABILITY_REGISTRY` dans `packages/cli/src/serve/capabilities.ts`. Chaque étiquette a une version `since` et des `modes` optionnels. Dix étiquettes conditionnelles (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) sont omises lorsque leur option correspondante est désactivée. Voir [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` et `server.ts`) :

| Middleware, dans l'ordre d'enregistrement | Objectif | Notes |
| ----------------------------------------- | -------- | ----- |
| `denyBrowserOriginCors` / `allowOriginCors` | Refuser tous les en-têtes `Origin` par défaut ; passer à une liste blanche lorsque `--allow-origin <pattern>` est configuré. | Voir [`12-auth-security.md`](./12-auth-security.md). |
| `hostAllowlist(bind, getPort)` | Sur loopback, valider que `Host` appartient à `localhost`, `127.0.0.1`, `[::1]`, ou `host.docker.internal` plus le port réel. | Défense contre le détournement DNS. La comparaison est insensible à la casse et mise en cache par port. |
| Middleware de journal d'accès | Enregistre la méthode, le chemin, le statut, la duréeMs, l'ID de session et l'ID client dans `DaemonLogger` lorsqu'une requête se termine. | Enregistré **avant** `bearerAuth`, donc les refus 401 sont aussi enregistrés. Ignore `/health` et le heartbeat. |
| `bearerAuth(token)` | Comparaison constant-time SHA-256 et `timingSafeEqual`. | Passage libre lorsqu'aucun jeton n'est configuré (défaut dev loopback). Le schéma `Bearer` est insensible à la casse. |
| Middleware de limite de débit | Seau à jetons optionnel par niveau pour les routes prompt, mutation et lecture. | Enregistré après `bearerAuth` et avant l'analyse JSON ; retourne 429 avant l'analyse lorsqu'un seau est épuisé. |
| `express.json({ limit: '10mb' })` | Analyse du corps JSON. | Les erreurs d'analyse retournent 400. |
| `daemonTelemetryMiddleware` | Enveloppe chaque requête HTTP dans une span OpenTelemetry via `withDaemonRequestSpan`. | Les attributs incluent la route, l'ID de session, l'ID client et le code de statut. |
| `createMutationGate` (par route) | Porte d'entrée opt-in au niveau de la route pour les routes de mutation qui nécessitent un jeton même sur loopback. | Retourne `401 { code: 'token_required' }`. Pas global `app.use` ; les routes appellent `mutate({ strict: true })` si nécessaire. |

**Sous-systèmes** :

| Chemin | Rôle |
| ------ | ---- |
| `serve/fs/` | Fabrique `WorkspaceFileSystem` plus `policy.ts` (vérifications taille/confiance/binaire), `paths.ts` (canonicalise, resolveWithin, rejet de liens symboliques), `audit.ts`, et valeurs `FsError` typées. |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | Handlers HTTP pour `GET /file`, `GET /file/bytes`, `POST /file/write`, et `POST /file/edit`. |
| `serve/workspace-memory.ts` | `GET/POST /workspace/memory` (CRUD QWEN.md). |
| `serve/workspace-agents.ts` | `GET/POST/DELETE /workspace/agents` (CRUD sous-agents). |
| `serve/daemon-status-provider.ts` | Instantané d'environnement et cellules de pré-vérification du démon hôte : version de Node, point d'entrée CLI, statut de l'espace de travail, ripgrep, git, npm. |
| `serve/permission-audit.ts` | `PermissionAuditRing` (FIFO de 512 entrées) et `createPermissionAuditPublisher`. |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts` | Routes OAuth du flux d'appareil. Voir [`12-auth-security.md`](./12-auth-security.md). |
| `serve/daemon-logger.ts` | Logs structurés dans des fichiers `DaemonLogger`. Voir [`19-observability.md`](./19-observability.md). |
| `serve/debug-mode.ts` | Prédicat partagé `isServeDebugMode()` contrôlant le contexte d'erreur verbeux dans les réponses HTTP. |
| `serve/acp-http/` | Transport ACP Streamable HTTP (RFD #721), monté sur `/acp`. Sept fichiers implémentent POST JSON-RPC, SSE GET, DELETE teardown, et l'utilisation partagée du pont en parallèle avec la surface REST. |
| `serve/demo.ts` | HTML inline autonome pour `GET /demo` : console de débogage navigateur avec interface de chat, journal d'événements et inspecteur d'espace de travail. Sur loopback sans `--require-auth`, il est enregistré **avant** `bearerAuth` ; sur non-loopback ou avec `--require-auth`, il est enregistré **après** `bearerAuth`. Servi avec CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` plus `X-Frame-Options: DENY`. |

**Shims de ré-exportation** pour compatibilité avec les chemins d'importation pré-F1 :

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## Flux

### Séquence d'amorçage

1. **Résoudre et nettoyer le jeton** depuis `opts.token` ou `QWEN_SERVER_TOKEN` ; cela évite qu'un saut de ligne final de `cat token.txt` ne casse silencieusement la comparaison bearer.
2. **Protection contre les fautes de frappe du nom d'hôte** : `--hostname localhost:4170` génère une erreur et suggère `--port`.
3. **Pré-vérification d'authentification** : non-loopback sans jeton est refusé ; `--require-auth` sans jeton est refusé.
4. **Validation de l'espace de travail** : chemin absolu, existant, répertoire. `EACCES` / `EPERM` sont enveloppés pour pointer vers le flag.
5. **Canonicaliser l'espace de travail** : `canonicalizeWorkspace(rawWorkspace)` exécute `realpathSync.native` une fois et alimente `/capabilities`, la solution de repli `POST /session`, et le pont.
6. **Validation du budget MCP** : entier positif ; `enforce` nécessite un budget.
7. **Inférence de l'activation du pool MCP** : la variable d'environnement parente `QWEN_SERVE_NO_MCP_POOL=1` rend `mcpPoolActive=false`, donc les capacités omettent honnêtement `mcp_workspace_pool` et `mcp_pool_restart`.
8. **Validation CORS / timeout / limite de débit** : `--allow-origin '*'` nécessite un jeton ; les valeurs de timeout prompt, writer, canal inactif, session inactive, reaper, et fenêtre de limite de débit échouent rapidement lorsqu'elles sont invalides.
9. **`childEnvOverrides` par handle** : passer `QWEN_SERVE_MCP_CLIENT_BUDGET` et `QWEN_SERVE_MCP_BUDGET_MODE` au processus enfant ACP via `BridgeOptions.childEnvOverrides` au lieu de muter `process.env`.
10. **Charger `settings.json` une fois** : lire `context.fileName`, `policy.permissionStrategy`, et `policy.consensusQuorum`. Les fichiers corrompus utilisent les valeurs par défaut. `validatePolicyConfig()` vérifie `policy.*` par rapport à `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` ; les stratégies inconnues ou `consensusQuorum` non positif lèvent `InvalidPolicyConfigError`. Un quorum défini sous une stratégie non `consensus` enregistre un avertissement sur stderr.
11. **Allouer `PermissionAuditRing`** (512 entrées).
12. **Construire `fsFactory`** : `runQwenServe` par défaut à `trusted: true` ; les appelants directs de `createServeApp` par défaut à `trusted: false` et émettent un avertissement une fois.
13. **`createHttpAcpBridge`** , voir [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** assemble Express.
15. **`server.listen(port, hostname)`** , puis résoudre le `getPort()` réel pour la liste blanche d'hôtes.
16. **Enregistrer les gestionnaires SIGINT / SIGTERM** pour l'arrêt progressif.

### Arrêt progressif

1. **Phase 1 - Arrêt du pont** au premier signal :
   - Libérer le registre de flux d'appareil et annuler les flux en attente.
   - `bridge.shutdown()` marque chaque canal `isDying = true`, envoie une fermeture gracieuse à l'entrée standard de chaque processus enfant ACP, attend `KILL_HARD_DEADLINE_MS` (10s) par canal, puis appelle `channel.kill()` si nécessaire.
2. **Phase 2 - Arrêt HTTP** :
   - `server.close()` arrête d'accepter de nouvelles connexions et laisse les requêtes en cours se terminer.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) déclenche `server.closeAllConnections()`.
   - Un délai supplémentaire de 2s s'escalade à nouveau si nécessaire.
3. **Second signal pendant la sortie** :
   - `bridge.killAllSync()` + `process.exit(1)` pour éviter que des processus enfants orphelins bloquent la sortie du démon.

## État et cycle de vie

`RunHandle` expose :

- `url` : URL d'écoute résolue, après résolution du port éphémère.
- `port` : port réel, y compris la résolution de `0`.
- `close({ timeoutMs? })` : arrêt programmatique pour les intégrateurs et les tests.

Appeler `createServeApp` directement retourne uniquement une `Application` ; l'intégrateur possède `listen` et l'arrêt.

## Dépendances

| Amont utilisé par `serve/` | Aval utilisant `serve/` |
| -------------------------- | ----------------------- |
| `@qwen-code/acp-bridge` : pont, bus d'événements, types de statut | Le gestionnaire de sous-commande `serve` de la CLI `qwen` |
| `packages/core` : `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext` | Intégrateurs directs, tests |
| SDK ACP (`@agentclientprotocol/sdk`) : `PROTOCOL_VERSION`, `ClientSideConnection` via le pont | |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path` | |

## Configuration

| Source | Clé | Effet |
| ------ | --- | ----- |
| Env | `QWEN_SERVER_TOKEN` | Jeton Bearer après nettoyage. |
| Env | `QWEN_SERVE_NO_MCP_POOL=1` | Force `mcpPoolActive=false`. |
| Env de l'enfant ACP | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE` | Généré à partir de `--mcp-client-budget` / `--mcp-budget-mode` et transmis via `childEnvOverrides`. |
| Env | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Timeouts par défaut prompt / SSE inactif. |
| Env | `QWEN_SERVE_RATE_LIMIT*` | Interrupteur de limite de débit, limites prompt / mutation / lecture, et fenêtre par défaut. |
| Env | `QWEN_SERVE_DEBUG=1` | Logs stderr verbeux. Voir [`19-observability.md`](./19-observability.md). |
| Flags | `--hostname`, `--port` | Liaison d'écoute. |
| Flags | `--token`, `--require-auth`, `--enable-session-shell` | Jeton Bearer, durcissement de l'authentification loopback, et interrupteur explicite d'exécution de shell. |
| Flag | `--workspace` | Remplace `process.cwd()`. |
| Flags | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size` | Limites du pont / Express. |
| Flags | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}` | Transmis à l'enfant ACP. |
| Flags | `--allow-origin`, `--allow-private-auth-base-url` | Liste blanche CORS navigateur et installation du fournisseur d'authentification localhost/privé. |
| Flags | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms` | Contrôle du cycle de vie des prompts, du writer SSE, et de l'inactivité de l'enfant ACP. |
| Flags | `--session-reap-interval-ms`, `--session-idle-timeout-ms` | Contrôle du nettoyage des sessions déconnectées. |
| Flags | `--rate-limit*` | Limite de débit HTTP par niveau. |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum` | Politique et quorum de `MultiClientPermissionMediator`. |
| `settings.json` | `context.fileName` | Remplacement `getCurrentGeminiMdFilename` pour le pont. |
Voir [`17-configuration.md`](./17-configuration.md) pour la référence fusionnée.

## Mises en garde et limitations connues

- Un appel direct à `createServeApp` sans `deps.fsFactory` ou `deps.bridge` utilise par défaut `trusted: false` ; l’ACP côté agent `writeTextFile` rejette avec `untrusted_workspace`. L’avertissement est affiché une seule fois.
- `denyBrowserOriginCors` rejette **toutes** les requêtes contenant `Origin` ; la page de démonstration fonctionne car un autre middleware supprime d’abord les valeurs de même origine correspondantes.
- Ordre du body-parser : les routes utilisant `mutate({ strict: true })` ne renvoient une 401 qu’après `express.json()`. Le pire cas est `--max-connections × express.json({limit: '10mb'})`, jusqu’à environ 2,5 Go de mémoire transitoire sur un écouteur loopback saturé ; ce compromis est intentionnel.
- Plusieurs démons dans un même processus doivent utiliser `childEnvOverrides` par handle ; la mutation de `process.env` introduit une concurrence car `defaultSpawnChannelFactory` capture l’environnement au moment du spawn.

## Références

- `packages/cli/src/serve/run-qwen-serve.ts` (amorçage, validation au démarrage, arrêt gracieux)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, assemblage du middleware et des routes)
- `packages/cli/src/serve/auth.ts` (CORS, liste d’autorisation Host, auth par bearer, gate de mutation)
- `packages/cli/src/serve/rate-limit.ts` (limite de débit HTTP par niveau)
- `packages/cli/src/serve/capabilities.ts` (registre de capacités et annonce conditionnelle)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Problèmes : [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)