# Serve Runtime

## Vue d’ensemble

`packages/cli/src/serve/` est la couche d’amorçage pour `qwen serve`. Elle traduit les drapeaux CLI en `ServeOptions`, valide la configuration de démarrage, construit l’application Express, branche le middleware, enregistre les routes, expose les fournisseurs de pré‑vol et d’état du daemon, maintient l’anneau d’audit des permissions, et gère la séquence d’arrêt en deux phases. Le travail lié à HTTP vit dans cette couche ; le travail lié à ACP vit une couche en dessous dans `@qwen-code/acp-bridge` (voir [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Responsabilités

- Analyser et valider `ServeOptions` : adresse d’écoute, authentification, espace de travail, limites de session / connexion, budget / pool MCP, CORS, délais d’inactivité (prompt, SSE, session), limite de débit, et bascules associées.
- **Canonicaliser** l’espace de travail lié une fois pour toutes. La même forme canonique est partagée par `/capabilities`, le repli `POST /session` et le pont.
- Rejeter les configurations de démarrage dangereuses ou invalides : liaison non‑loopback sans jeton, `--require-auth` sans jeton, `--allow-origin '*'` sans jeton, `mcpBudgetMode='enforce'` sans `mcpClientBudget` positif, un `--workspace` inexistant ou non‑répertoire, et des valeurs de délai ou de limite de débit invalides.
- Construire la fabrique `WorkspaceFileSystem`, le diffuseur d’audit des permissions, le `DaemonStatusProvider` et le `acp-bridge`.
- Construire l’application Express, brancher le middleware (`denyBrowserOriginCors` / `allowOriginCors` -> `hostAllowlist` -> journal d’accès -> `bearerAuth` -> limite de débit -> analyseur JSON -> télémétrie -> `mutationGate` par route), et monter les routes session, CRUD d’espace de travail, fichier, authentification par flux d’appareil, vote de permission et ACP HTTP.
- Lier le port d’écoute et enregistrer les gestionnaires de signaux.
- Exécuter l’arrêt en deux phases sur SIGINT/SIGTERM ; forcer la sortie sur un second signal.

## Architecture

**Point d’entrée** : `runQwenServe(opts, deps)` dans `packages/cli/src/serve/run-qwen-serve.ts`. Renvoie un `RunHandle` (`{ url, port, close, ... }`).

**Fabrique d’application** : `createServeApp(opts, getPort, deps)` dans `packages/cli/src/serve/server.ts`. Construit l’`Application` Express. Les intégrateurs directs et les tests l’appellent sans l’enveloppe d’amorçage.

**Registre de capacités** : `SERVE_CAPABILITY_REGISTRY` dans `packages/cli/src/serve/capabilities.ts`. Chaque étiquette a une version `since` et des `modes` optionnels. Dix étiquettes conditionnelles (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) sont omises lorsque leur bascule correspondante est désactivée. Voir [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` et `server.ts`) :

| Middleware, dans l’ordre d’enregistrement | Objectif                                                                                                                    | Notes                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `denyBrowserOriginCors` / `allowOriginCors` | Refuser tous les en‑têtes `Origin` par défaut ; passer à une liste d’autorisation lorsque `--allow-origin <pattern>` est configuré.                | Voir [`12-auth-security.md`](./12-auth-security.md).                                                               |
| `hostAllowlist(bind, getPort)`              | Sur loopback, valider que `Host` appartient à `localhost`, `127.0.0.1`, `[::1]` ou `host.docker.internal` plus le port réel. | Défense contre le détournement DNS. La comparaison est insensible à la casse et mise en cache par port.           |
| Middleware de journal d’accès               | Enregistre la méthode, le chemin, le statut, la durée en ms, l’ID de session et l’ID client dans `DaemonLogger` lorsqu’une requête se termine.               | Enregistré **avant** `bearerAuth`, donc les refus 401 sont aussi journalisés. Ignore `/health` et les battements de cœur. |
| `bearerAuth(token)`                         | Comparaison constante en temps avec SHA‑256 et `timingSafeEqual`.                                                            | Passage libre lorsqu’aucun jeton n’est configuré (défaut de développement loopback). Le schéma `Bearer` est insensible à la casse. |
| Middleware de limite de débit               | Seau à jetons optionnel par niveau pour les routes prompt, mutation et lecture.                                                      | Enregistré après `bearerAuth` et avant l’analyse JSON ; renvoie 429 avant l’analyse lorsqu’un seau est épuisé.     |
| `express.json({ limit: '10mb' })`           | Analyse du corps JSON.                                                                                                         | Les erreurs d’analyse renvoient 400.                                                                              |
| `daemonTelemetryMiddleware`                 | Enveloppe chaque requête HTTP dans une span OpenTelemetry via `withDaemonRequestSpan`.                                          | Les attributs incluent route, sessionId, clientId et code de statut.                                               |
| `createMutationGate` (par route)            | Porte optionnelle au niveau de la route pour les routes de mutation qui exigent un jeton même sur loopback.                                           | Renvoie `401 { code: 'token_required' }`. Pas un `app.use` global ; les routes appellent `mutate({ strict: true })` selon les besoins. |
**Sous-systèmes** :

| Chemin                                                           | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve/fs/`                                                      | Fabrique `WorkspaceFileSystem` plus `policy.ts` (vérifications taille/confiance/binaire), `paths.ts` (canonicalisation, resolveWithin, rejet des liens symboliques), `audit.ts`, et des valeurs `FsError` typées.                                                                                                                                                                                                                                              |
| `serve/routes/workspace-file-read.ts`, `workspace-file-write.ts` | Gestionnaires HTTP pour `GET /file`, `GET /file/bytes`, `POST /file/write`, et `POST /file/edit`.                                                                                                                                                                                                                                                                                                                                                              |
| `serve/workspace-memory.ts`                                      | `GET/POST /workspace/memory` (CRUD de QWEN.md).                                                                                                                                                                                                                                                                                                                                                                                                                |
| `serve/workspace-agents.ts`                                      | `GET/POST/DELETE /workspace/agents` (CRUD de sous-agents).                                                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/daemon-status-provider.ts`                                | Instantané d’environnement plus cellules de prévérification de l’hôte du démon : version de Node, point d’entrée CLI, statut de l’espace de travail, ripgrep, git, npm.                                                                                                                                                                                                                                                                                        |
| `serve/permission-audit.ts`                                      | `PermissionAuditRing` (FIFO de 512 entrées) et `createPermissionAuditPublisher`.                                                                                                                                                                                                                                                                                                                                                                                |
| `serve/auth/device-flow.ts`, `qwen-device-flow-provider.ts`      | Routes OAuth pour le flux d’appareil. Voir [`12-auth-security.md`](./12-auth-security.md).                                                                                                                                                                                                                                                                                                                                                                     |
| `serve/daemon-logger.ts`                                         | `DaemonLogger` logs structurés dans des fichiers. Voir [`19-observability.md`](./19-observability.md).                                                                                                                                                                                                                                                                                                                                                         |
| `serve/debug-mode.ts`                                            | Prédicat partagé `isServeDebugMode()` qui contrôle le contexte d’erreur verbeux dans les réponses HTTP.                                                                                                                                                                                                                                                                                                                                                        |
| `serve/acp-http/`                                                | Transport ACP Streamable HTTP (RFD #721), monté sur `/acp`. Sept fichiers implémentent le POST JSON-RPC, le GET SSE, le DELETE de démontage, et l’utilisation partagée du pont en parallèle avec la surface REST.                                                                                                                                                                                                                                               |
| `serve/demo.ts`                                                  | HTML inline autonome pour `GET /demo` : console de débogage dans le navigateur avec interface de chat, journal des événements et inspecteur de l’espace de travail. Sur loopback sans `--require-auth`, il est enregistré **avant** `bearerAuth` ; sur non-loopback ou avec `--require-auth`, il est enregistré **après** `bearerAuth`. Servi avec CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'` plus `X-Frame-Options: DENY`. |
**Shims de ré-export** pour la compatibilité avec les chemins d'importation antérieurs à F1 :

- `serve/event-bus.ts` -> `@qwen-code/acp-bridge/eventBus`
- `serve/status.ts` -> `@qwen-code/acp-bridge/status`
- `serve/httpAcpBridge.ts` -> `@qwen-code/acp-bridge`

## Flux

### Séquence de démarrage

1. **Résoudre et nettoyer le token** depuis `opts.token` ou `QWEN_SERVER_TOKEN` ; cela évite qu'un saut de ligne final de `cat token.txt` ne brise silencieusement la comparaison du bearer.
2. **Garde anti-typo pour le hostname** : `--hostname localhost:4170` génère une erreur et suggère `--port`.
3. **Pré-vérification d'authentification** : les connexions non-loopback sans token sont refusées ; `--require-auth` sans token est refusé.
4. **Validation de l'espace de travail** : chemin absolu, existant, répertoire. Les erreurs `EACCES` / `EPERM` sont encapsulées pour indiquer le drapeau.
5. **Canonicaliser l'espace de travail** : `canonicalizeWorkspace(rawWorkspace)` exécute `realpathSync.native` une fois et alimente `/capabilities`, la solution de repli `POST /session`, et le pont.
6. **Validation du budget MCP** : entier positif ; `enforce` nécessite un budget.
7. **Inférence du basculement du pool MCP** : la variable d'environnement parente `QWEN_SERVE_NO_MCP_POOL=1` rend `mcpPoolActive=false`, donc les capacités omettent honnêtement `mcp_workspace_pool` et `mcp_pool_restart`.
8. **Validation CORS / timeout / limite de débit** : `--allow-origin '*'` nécessite un token ; les valeurs de délai d'inactivité pour l'invite, le writer, le canal, la session, le reaper et la fenêtre de limite de débit échouent rapidement si elles sont invalides.
9. **`childEnvOverrides` par handle** : passer `QWEN_SERVE_MCP_CLIENT_BUDGET` et `QWEN_SERVE_MCP_BUDGET_MODE` à l'enfant ACP via `BridgeOptions.childEnvOverrides` au lieu de muter `process.env`.
10. **Charger `settings.json` une fois** : lire `context.fileName`, `policy.permissionStrategy` et `policy.consensusQuorum`. Les fichiers corrompus reviennent aux valeurs par défaut. `validatePolicyConfig()` vérifie `policy.*` par rapport à `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` ; les stratégies inconnues ou un `consensusQuorum` non positif lèvent une `InvalidPolicyConfigError`. Un quorum défini sous une stratégie non `consensus` journalise un avertissement sur stderr.
11. **Allouer `PermissionAuditRing`** (512 entrées).
12. **Construire `fsFactory`** : `runQwenServe` utilise par défaut `trusted: true` ; les appelants directs de `createServeApp` utilisent par défaut `trusted: false` avec un avertissement unique.
13. **`createHttpAcpBridge`**, voir [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** assemble Express.
15. **`server.listen(port, hostname)`**, puis résoudre le `getPort()` réel pour la liste blanche d'hôtes.
16. **Enregistrer les gestionnaires SIGINT / SIGTERM** pour un arrêt gracieux.

### Arrêt gracieux

1. **Phase 1 - démontage du pont** au premier signal :
   - Libérer le registre de flux de dispositif et annuler les flux en attente.
   - `bridge.shutdown()` marque chaque canal `isDying = true`, envoie une fermeture gracieuse au stdin de chaque enfant ACP, attend `KILL_HARD_DEADLINE_MS` (10s) par canal, puis appelle `channel.kill()` si nécessaire.
2. **Phase 2 - démontage HTTP** :
   - `server.close()` arrête d'accepter de nouvelles connexions et laisse les requêtes en vol se terminer.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) déclenche `server.closeAllConnections()`.
   - Un second délai de 2s s'intensifie à nouveau si nécessaire.
3. **Deuxième signal pendant la sortie** :
   - `bridge.killAllSync()` + `process.exit(1)` pour éviter que des enfants orphelins ne bloquent la sortie du démon.

## État et cycle de vie

`RunHandle` expose :

- `url` : URL d'écoute résolue, après résolution du port éphémère.
- `port` : port réel, y compris la résolution de `0`.
- `close({ timeoutMs? })` : arrêt programmatique pour les intégrateurs et les tests.

Appeler `createServeApp` directement retourne seulement une `Application` ; l'intégrateur est propriétaire de `listen` et de l'arrêt.

## Dépendances

| Amont utilisé par `serve/`                                                                       | Aval utilisant `serve/`                 |
| ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `@qwen-code/acp-bridge` : pont, bus d'événements, types de statut                                | Le gestionnaire de sous-commande `serve` de la CLI `qwen` |
| `packages/core` : `loadSettings`, `getCurrentGeminiMdFilename`, `Config`, `WorkspaceContext`     | Intégrateurs directs, tests             |
| SDK ACP (`@agentclientprotocol/sdk`) : `PROTOCOL_VERSION`, `ClientSideConnection` via le pont    |                                         |
| Express + body-parser, `node:crypto`, `node:fs`, `node:path`                                     |                                         |

## Configuration

| Source          | Clé                                                                                             | Effet                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Environnement   | `QWEN_SERVER_TOKEN`                                                                             | Token Bearer après nettoyage.                                                                        |
| Environnement   | `QWEN_SERVE_NO_MCP_POOL=1`                                                                      | Force `mcpPoolActive=false`.                                                                         |
| Env. enfant ACP | `QWEN_SERVE_MCP_CLIENT_BUDGET` / `QWEN_SERVE_MCP_BUDGET_MODE`                                   | Généré depuis `--mcp-client-budget` / `--mcp-budget-mode` et transmis via `childEnvOverrides`.       |
| Environnement   | `QWEN_SERVE_PROMPT_DEADLINE_MS` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`                           | Délais d'inactivité par défaut pour l'invite / SSE.                                                  |
| Environnement   | `QWEN_SERVE_RATE_LIMIT*`                                                                        | Interrupteur de limite de débit, capacités d'invite / mutation / lecture et fenêtre par défaut.      |
| Environnement   | `QWEN_SERVE_DEBUG=1`                                                                            | Journaux stderr verbeux. Voir [`19-observability.md`](./19-observability.md).                        |
| Drapeaux        | `--hostname`, `--port`                                                                          | Liaison d'écoute.                                                                                    |
| Drapeaux        | `--token`, `--require-auth`, `--enable-session-shell`                                           | Token Bearer, durcissement d'authentification loopback et interrupteur explicite d'exécution shell. |
| Drapeau         | `--workspace`                                                                                   | Remplace `process.cwd()`.                                                                            |
| Drapeaux        | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size` | Limites du pont / Express.                                                                           |
| Drapeaux        | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                                 | Transmis à l'enfant ACP.                                                                             |
| Drapeaux        | `--allow-origin`, `--allow-private-auth-base-url`                                               | Liste blanche CORS navigateur et interrupteur d'installation de fournisseur d'authentification localhost/privé. |
| Drapeaux        | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`                 | Contrôle du cycle de vie inactif de l'invite, du writer SSE et de l'enfant ACP.                      |
| Drapeaux        | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                       | Contrôle du nettoyage des sessions déconnectées.                                                     |
| Drapeaux        | `--rate-limit*`                                                                                 | Limite de débit HTTP par niveau.                                                                     |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum`                                           | Politique `MultiClientPermissionMediator` et quorum.                                                 |
| `settings.json` | `context.fileName`                                                                              | Surcharge de `getCurrentGeminiMdFilename` pour le pont.                                              |
Voir [`17-configuration.md`](./17-configuration.md) pour la référence fusionnée.

## Mises en garde et limites connues

- L'appel direct à `createServeApp` sans `deps.fsFactory` ni `deps.bridge` par défaut à `trusted: false` ; l'ACP côté agent `writeTextFile` rejette avec `untrusted_workspace`. L'avertissement n'est affiché qu'une fois.
- `denyBrowserOriginCors` rejette **toutes** les requêtes portant un `Origin` ; la page de démonstration fonctionne car un autre middleware supprime d'abord les valeurs de même origine correspondantes.
- Ordre du body-parser : les routes utilisant `mutate({ strict: true })` ne retournent 401 qu'après `express.json()`. Le pire cas est `--max-connections × express.json({limit: '10mb'})`, jusqu'à environ 2,5 Go de mémoire transitoire sur un écouteur de boucle locale saturé ; ce compromis est intentionnel.
- Plusieurs démons dans un même processus doivent utiliser `childEnvOverrides` par handle ; la mutation de `process.env` crée une course car `defaultSpawnChannelFactory` fige l'environnement au lancement.

## Références

- `packages/cli/src/serve/run-qwen-serve.ts` (initialisation, validation de démarrage, arrêt gracieux)
- `packages/cli/src/serve/server.ts` (`createServeApp()`, assemblage des middleware et routes)
- `packages/cli/src/serve/auth.ts` (CORS, liste blanche d'hôtes, authentification par jeton, porte de mutation)
- `packages/cli/src/serve/rate-limit.ts` (limite de débit HTTP par niveau)
- `packages/cli/src/serve/capabilities.ts` (registre de capacités et annonce conditionnelle)
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/daemon-status-provider.ts`
- `packages/cli/src/serve/permission-audit.ts`
- Problèmes : [#3803](https://github.com/QwenLM/qwen-code/issues/3803), [#4175](https://github.com/QwenLM/qwen-code/issues/4175)
