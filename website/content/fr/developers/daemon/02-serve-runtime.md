# Serve Runtime

## Overview

`packages/cli/src/serve/` est la couche de démarrage pour `qwen serve`. Il traduit les flags CLI en `ServeOptions`, valide la configuration de démarrage, construit l'application Express, connecte les middlewares, enregistre les routes, expose les fournisseurs de pré-vérification/statut de l'hôte du daemon, maintient l'anneau d'audit des permissions, et gère la séquence d'arrêt progressif en deux phases. Le travail orienté HTTP se trouve dans cette couche ; le travail orienté ACP se trouve une couche en dessous dans `@qwen-code/acp-bridge` (voir [`03-acp-bridge.md`](./03-acp-bridge.md)).

## Responsibilities

- Analyser et valider `ServeOptions` : adresse d'écoute, authentification, workspace, limites de sessions / connexions, budget / pool MCP, CORS, timeouts d'inactivité des prompts / SSE / sessions, rate limit, et toggles associés.
- **Canonicaliser** le workspace principal exactement une fois, et canonicaliser chaque `--workspace` répété avant d'enregistrer les runtimes de session. La forme canonique principale est partagée par `/capabilities.workspaceCwd`, le fallback `POST /session`, et le bridge principal.
- Rejeter les configurations de démarrage non sûres ou invalides : liaison non-loopback sans token, `--require-auth` sans token, HTTP(S) `--allow-origin` wildcard ou non-loopback sans token, `mcpBudgetMode='enforce'` sans `mcpClientBudget` positif, un `--workspace` inexistant ou n'étant pas un répertoire, et des valeurs de timeout ou de rate-limit invalides.
- Construire la factory `WorkspaceFileSystem`, le publisher d'audit des permissions, le `DaemonStatusProvider`, et l'`acp-bridge`.
- Construire l'application Express, connecter les middlewares (`allowOriginCors` sur l'allowlist mutable -> `hostAllowlist` -> access log -> `bearerAuth` -> rate limit -> JSON parser -> telemetry -> `mutationGate` par route), et monter les routes de session, CRUD de workspace, fichier, authentification device-flow, vote de permission, et HTTP ACP. (Le mur inconditionnel `denyBrowserOriginCors` ne subsiste que dans l'app de bootstrap, `run-qwen-serve.ts`.)
- Lier le port d'écoute et enregistrer les gestionnaires de signaux.
- Exécuter l'arrêt en deux phases sur SIGINT/SIGTERM ; forcer la sortie sur un second signal.

## Architecture

**Entrée** : `runQwenServe(opts, deps)` dans `packages/cli/src/serve/run-qwen-serve.ts`. Retourne un `RunHandle` (`{ url, port, close, ... }`).

**Factory d'application** : `createServeApp(opts, getPort, deps)` dans `packages/cli/src/serve/server.ts`. Construit l'`Application` Express. Les intégrateurs directs et les tests l'appellent sans le wrapper de bootstrap.

**Registre de capacités** : `SERVE_CAPABILITY_REGISTRY` dans `packages/cli/src/serve/capabilities.ts`. Chaque tag a une version `since` et des `modes` optionnels. Les tags conditionnels sont omis lorsque leur prédicat de déploiement ou d'exécution est faux ; le registre et la carte de prédicats sont la source de référence. Voir [`11-capabilities-versioning.md`](./11-capabilities-versioning.md).

**Middleware** (`packages/cli/src/serve/auth.ts` et `server.ts`) :

| Middleware, dans l'ordre d'enregistrement             | Objectif                                                                                                                     | Notes                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `allowOriginCors`                                     | Toujours installé sur l'app runtime sur une `MutableOriginAllowlist` : les entrées `--allow-origin <pattern>` l'initialisent, le Local Control ajoute l'origine LAN lorsqu'il est activé ; les origines sans correspondance reçoivent l'enveloppe de refus 403. | Voir [`12-auth-security.md`](./12-auth-security.md).                                                              |
| `hostAllowlist(bind, getPort)`                        | Sur loopback, valider que `Host` appartient à `localhost`, `127.0.0.1`, `[::1]`, `host.docker.internal`, ou l'adresse loopback liée exacte, plus le port réel ; les formes sans port sont acceptées sur les ports 80 et 443.| Défense contre le DNS rebinding. La comparaison est insensible à la casse et mise en cache par port. L'écouteur LAN Local Control applique toujours sa vérification Host d'autorité annoncée, quelle que soit la liaison principale. |
| Access-log middleware                                 | Enregistre la méthode, le chemin, le statut, durationMs, sessionId, et clientId dans `DaemonLogger` lorsqu'une requête se termine. | Enregistré **avant** `bearerAuth`, donc les refus 401 sont également journalisés. Ignore `/health` et le heartbeat. |
| `bearerAuth(token)`                                   | Comparaison bearer en temps constant avec SHA-256 plus `timingSafeEqual`.                                                      | Passthrough ouvert lorsqu'aucun token n'est configuré (défaut pour le dev en loopback). Le schéma `Bearer` est insensible à la casse. |
| Rate-limit middleware                                 | Token bucket optionnel par niveau pour les routes de prompt, mutation et lecture.                                              | Enregistré après `bearerAuth` et avant le parsing JSON ; retourne 429 avant le parsing lorsqu'un bucket est épuisé. |
| `express.json({ limit: '10mb' })`                     | Parsing du corps JSON.                                                                                                       | Les erreurs de parsing retournent 400.                                                                            |
| `daemonTelemetryMiddleware`                           | Enveloppe les requêtes daemon API classifiées qui atteignent ce point dans un span OpenTelemetry via `withDaemonRequestSpan`.                        | Les attributs incluent la route canonique, le hash de workspace résolu, sessionId, clientId, et le code de statut. Les rejets antérieurs d'auth, rate-limit et body-parser sont en dehors de cette limite de span. |
| `createMutationGate` (par route)                      | Gate opt-in au niveau de la route pour les mutations qui nécessitent une autorité opérateur. Les requêtes fiables de l'écouteur principal, les requêtes authentifiées par bearer et les requêtes Local Control appariées sont qualifiées.                      | Une requête principale sans token qui atteint la gate stricte sans autorité loopback fiable retourne `401 { code: 'token_required' }`. Les identifiants configurés manquants ou invalides sont rejetés plus tôt par le middleware bearer avec un simple `401 Unauthorized`. Pas de `app.use` global ; les routes appellent `mutate({ strict: true })` si nécessaire. |

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
| `serve/web-shell-static.ts`, `serve/web-shell-resolver.ts`       | Localise et monte les assets Web Shell construits (l'UI navigateur du daemon) sur `/`, `/assets`, et `/session/:id`, plus le fallback deep-link SPA enregistré après toutes les routes API. Monté **avant** `bearerAuth` dans tous les modes de lancement car un navigateur ne peut pas attacher `Authorization` à une navigation ou sous-ressource. Les appels API suivent la politique d'autorité normale : les tokens configurés contrôlent les routes API normales sauf `/health` loopback sauf si `--require-auth` est défini, tandis que l'ingress webhook de canal utilise toujours son propre secret partagé et l'écouteur principal loopback fiable sans token a un accès opérateur complet. Dégrade en API-only lorsque les assets sont absents ; `--no-web` désactive (opt-out). |

**Imports du package ACP bridge** :

- Les primitives d'event-bus sont importées depuis `@qwen-code/acp-bridge/eventBus`.
- Les primitives de statut sont importées depuis `@qwen-code/acp-bridge/status`.
- `serve/acp-session-bridge.ts` reste comme façade de compatibilité locale au CLI pour la surface de bridge plus large.

## Flow

### Séquence de démarrage

Avant que `runQwenServe()` ne démarre cette séquence, le mode CLI-only `--open-with-auth` valide l'éligibilité loopback/Web Shell et remplit `ServeOptions.token` avec le token configuré sélectionné, ou avec 32 octets aléatoires encodés en base64url lorsque cette sélection est vide. Les intégrateurs directs et les invocations sans ce flag désactivé par défaut ne génèrent pas de token.

1. **Résoudre et tronquer le token** depuis `opts.token` ou `QWEN_SERVER_TOKEN` ; cela évite qu'un saut de ligne final provenant de `cat token.txt` ne rompe silencieusement la comparaison bearer.
2. **Garde contre les fautes de frappe du hostname** : `--hostname localhost:4170` génère une erreur et suggère `--port`.
3. **Pré-vérification de l'authentification** : non-loopback sans token est refusé ; `--require-auth` sans token est refusé.
4. **Validation du workspace** : chemin absolu, existe, répertoire. `EACCES` / `EPERM` sont encapsulés pour pointer vers le flag.
5. **Canonicaliser le workspace** : `canonicalizeWorkspace(rawWorkspace)` exécute `realpathSync.native` une fois et alimente `/capabilities`, le fallback `POST /session`, et le bridge.
6. **Validation du budget MCP** : entier positif ; `enforce` nécessite un budget.
7. **Inférence du toggle du pool MCP** : l'env parent `QWEN_SERVE_NO_MCP_POOL=1` rend `mcpPoolActive=false`, donc les capacités omettent honnêtement `mcp_workspace_pool` et `mcp_pool_restart`.
8. **Validation CORS / timeout / rate-limit** : les valeurs `--allow-origin` HTTP(S) wildcard et non-loopback nécessitent un token ; les valeurs de prompt, writer, channel idle, session idle, reaper, et fenêtre de rate-limit échouent rapidement si elles sont invalides.
9. **`childEnvOverrides` par handle** : passer `QWEN_SERVE_MCP_CLIENT_BUDGET` et `QWEN_SERVE_MCP_BUDGET_MODE` à l'enfant ACP via `BridgeOptions.childEnvOverrides` au lieu de muter `process.env`.
10. **Charger `settings.json` une seule fois** : lire `context.fileName`, `policy.permissionStrategy`, et `policy.consensusQuorum`. Les fichiers corrompus reviennent aux valeurs par défaut. `validatePolicyConfig()` vérifie `policy.*` par rapport à `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes` ; les stratégies inconnues ou un `consensusQuorum` non positif lèvent `InvalidPolicyConfigError`. Un quorum défini sous une stratégie non-`consensus` journalise un avertissement sur stderr.
11. **Allouer `PermissionAuditRing`** (512 entrées).
12. **Construire `fsFactory`** : `runQwenServe` a par défaut `trusted: true` ; les appelants directs de `createServeApp` ont par défaut `trusted: false` et avertissent une fois.
13. **`createHttpAcpBridge`**, voir [`03-acp-bridge.md`](./03-acp-bridge.md).
14. **`createServeApp`** assemble Express.
15. **Créer et lier au cycle de vie le serveur HTTP(S) avant l'écoute**, puis appeler `server.listen(port, hostname)` et résoudre le `getPort()` réel pour l'allowlist d'hôtes. La propriété Conversations ne peut pas démarrer tant que cet écouteur et les restantes gates de démarrage de l'hôte ne sont pas prêts.
16. **Enregistrer les gestionnaires SIGINT / SIGTERM** pour l'arrêt progressif via le cycle de vie partagé de l'application.

### Arrêt progressif

1. **Sceller l'admission et commencer tous les drainages** au premier signal :
   - Supprimer le registre device-flow et annuler les flux en attente.
   - `bridge.shutdown()` marque chaque canal `isDying = true`, envoie une fermeture progressive à l'stdin de chaque enfant ACP, attend `KILL_HARD_DEADLINE_MS` (10s) par canal, puis appelle `channel.kill()` si nécessaire.
2. **Fermer l'écouteur pendant que les drainages de l'application et de l'hôte s'exécutent** :
   - `server.close()` arrête d'accepter les nouvelles connexions et laisse les requêtes en cours se terminer.
   - `SHUTDOWN_FORCE_CLOSE_MS` (5s) déclenche `server.closeAllConnections()`.
   - Un second délai de 2s escalade à nouveau si nécessaire.
3. **Libérer la propriété Conversations uniquement après une preuve d'arrêt positive** de l'écouteur, du travail local de l'application, du travail possédé par l'hôte, du nettoyage de la découverte Live et des drainages du runtime. Toute preuve incomplète rejette l'arrêt au lieu de permettre un handoff non sûr.
4. **Second signal pendant la sortie** :
   - `bridge.killAllSync()` + `process.exit(1)` pour éviter que des enfants orphelins ne bloquent la sortie du daemon.

## État et cycle de vie

`RunHandle` expose :

- `url` : URL d'écoute résolue, après la résolution du port éphémère.
- `port` : port réel, y compris la résolution de `0`.
- `close()` : arrêt programmatique pour les intégrateurs et les tests.

Appeler `createServeApp` directement retourne seulement une `Application`. Un intégrateur qui a besoin de Live/Conversations doit créer le serveur Node réel, appeler `getServeAppLifecycle(app).bindServer(server)` avant son premier `listen()`, et attendre `lifecycle.close()` pendant l'arrêt. Sans liaison, les routes ordinaires restent disponibles mais Live/Conversations sont en fail closed. Appeler `server.close()` brut déclenche le nettoyage piloté par les événements, mais l'intégrateur doit tout de même attendre `lifecycle.close()` pour observer les échecs de drainage ou de libération de propriété.

## Dépendances

| Upstream utilisé par `serve/`                                                                         | Downstream utilisant `serve/`             |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `@qwen-code/acp-bridge` : bridge, event bus, types de statut                                          | Le handler de la sous-commande `serve` du CLI `qwen` |
| `packages/core` : `getAllMemoryFilenames`, `Config`, `WorkspaceContext`                                  | Intégrateurs directs, tests               |
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
| CLI flags       | `--open-with-auth`                                                                            | Lancement loopback Web Shell désactivé par défaut qui réutilise ou génère un bearer durée de vie processus avant le runtime. |
| Flag            | `--workspace`                                                                                 | Remplace `process.cwd()` ; répéter pour enregistrer des runtimes de workspace isolés supplémentaires. |
| Flags           | `--max-sessions`, `--max-pending-prompts-per-session`, `--max-connections`, `--event-ring-size`| Limites Bridge / Express.                                                                             |
| Flags           | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}`                               | Transmis à l'enfant ACP.                                                                              |
| Flags           | `--allow-origin`, `--allow-private-auth-base-url`                                             | Allowlist CORS du navigateur et switch d'installation du fournisseur d'auth localhost/privé.          |
| Flag            | `--web` / `--no-web`                                                                                       | Sert ou ignore l'UI Web Shell à la racine du daemon (par défaut, sert). `--no-web` laisse le daemon en API-only. |
| Flags           | `--prompt-deadline-ms`, `--writer-idle-timeout-ms`, `--channel-idle-timeout-ms`, `--initialize-timeout-ms` | Contrôle du cycle de vie d'inactivité des prompts, writers SSE, enfants ACP, et timeout des requêtes ACP. |
| Flags           | `--session-reap-interval-ms`, `--session-idle-timeout-ms`                                     | Contrôle du nettoyage des sessions déconnectées.                                                      |
| Flags           | `--rate-limit*`                                                                               | Rate limit HTTP par niveau.                                                                           |
| `settings.json` | `policy.permissionStrategy`, `policy.consensusQuorum`                                         | Politique et quorum de `MultiClientPermissionMediator`.                                               |
| `settings.json` | `context.fileName`                                                                            | Nom de fichier mémoire du workspace transmis à `/workspace/init` via le `contextFilename` du service de workspace. |
Voir [`17-configuration.md`](./17-configuration.md) pour la référence fusionnée.

## Mises en garde et limites connues

- Un appel direct à `createServeApp` sans `deps.fsFactory` ou `deps.bridge` utilise par défaut `trusted: false` ; l'ACP côté agent `writeTextFile` rejette la requête avec `untrusted_workspace`. L'avertissement n'est affiché qu'une seule fois.
- L'app runtime exécute `allowOriginCors` sur l'allowlist mutable ; les valeurs `Origin` sans correspondance reçoivent l'enveloppe de refus 403 (le mur inconditionnel `denyBrowserOriginCors` ne subsiste que dans l'app de bootstrap). Le Web Shell **loopback** fonctionne car un autre middleware supprime d'abord les valeurs same-origin loopback correspondantes — les liaisons non-loopback nécessitent `--allow-origin` pour les XHRs du shell.
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