# Référence de configuration

## Vue d'ensemble

Cette page rassemble tous les paramètres qui affectent le démon `qwen serve` et ses adaptateurs : variables d'environnement, drapeaux CLI, clés `settings.json`, et options programmatiques. Les pages spécifiques aux fonctionnalités renvoient ici lorsqu'elles ont besoin de détails de configuration transversaux.

## Drapeaux CLI (`qwen serve`)

| Drapeau | Type | Valeur par défaut | Effet |
| ------- | ---- | ----------------- | ----- |
| `--hostname <host>` | string | `127.0.0.1` | Adresse de liaison. Valeurs de bouclage : `127.0.0.1`, `localhost`, `::1`, `[::1]`. Une adresse non-bouclage nécessite un token bearer au démarrage. Une entrée `host:port` est rejetée avec une suggestion d'utiliser `--port`. |
| `--port <n>` | number | `4170` | Port d'écoute ; `0` signifie éphémère. |
| `--token <s>` | string | env | Token bearer. Remplace `QWEN_SERVER_TOKEN` et est purgé au démarrage. Il apparaît dans la ligne de commande du processus, donc privilégiez l'environnement dans les déploiements. |
| `--require-auth` | boolean | `false` | Étend l'authentification bearer au bouclage et à `/health` ; le démarrage refuse de se lancer sans token. |
| `--workspace <dir>` | absolute path | `process.cwd()` | Espace de travail lié. Doit être absolu et un répertoire ; canonique une fois au démarrage. |
| `--max-sessions <n>` | number | `20` | Limite maximale de sessions actives. `0` / `Infinity` signifie illimité ; `NaN` / valeurs négatives lèvent une erreur. |
| `--max-pending-prompts-per-session <n>` | number | `5` | Limite maximale de prompts acceptés mais en attente/exécution par session. Un prompt excédentaire renvoie 503. `0` / `Infinity` signifie illimité ; les valeurs négatives ou non entières lèvent une erreur. |
| `--max-connections <n>` | number | `256` | Écouteur HTTP `server.maxConnections` ; `0` / `Infinity` signifie illimité. |
| `--enable-session-shell` | boolean | `false` | Active l'exécution directe `POST /session/:id/shell`. Nécessite un token bearer, et chaque appel doit porter un `X-Qwen-Client-Id` lié à la session. |
| `--event-ring-size <n>` | number | `8000` | Anneau de rejeu SSE par session ; limite souple à `1_000_000`. |
| `--http-bridge` | boolean | `true` | Mode pont de l'étape 1. `--no-http-bridge` revient encore au pont HTTP et affiche sur stderr. |
| `--mcp-client-budget <n>` | positive integer | non défini | Définit `WorkspaceMcpBudget.clientBudget` et le transmet à l'enfant ACP via `childEnvOverrides`. |
| `--mcp-budget-mode <m>` | `off` / `warn` / `enforce` | `warn` lorsque le budget est défini, sinon `off` | Définit `WorkspaceMcpBudget.mode` ; `enforce` nécessite `--mcp-client-budget`. |
| `--allow-origin <pattern>` | repeatable string | non défini | Liste d'autorisation cross-origin qui remplace le refus CORS par défaut. `*` autorise toute origine mais nécessite un token. |
| `--allow-private-auth-base-url` | boolean | `false` | Permet à `/workspace/auth/provider` d'installer un fournisseur d'authentification localhost/réseau privé `baseUrl` ; à utiliser uniquement en développement local de confiance. |
| `--prompt-deadline-ms <n>` | positive integer | non défini | Limite de temps murale pour les prompts côté serveur en ms. Le délai d'attente annule et renvoie une erreur. |
| `--writer-idle-timeout-ms <n>` | positive integer | non défini | Délai d'inactivité par connexion SSE en ms. Le démon ferme la connexion SSE lorsqu'aucun événement n'est envoyé pendant cette durée. |
| `--channel-idle-timeout-ms <n>` | non-negative integer | `0` | Combien de temps conserver l'enfant ACP actif après la fermeture de la dernière session. `0` signifie récupération immédiate. |
| `--session-reap-interval-ms <n>` | non-negative integer | `60000` | Intervalle de balayage du récupérateur de sessions ; `0` le désactive. |
| `--session-idle-timeout-ms <n>` | non-negative integer | `1800000` | Temps de récupération des sessions déconnectées inactives ; `0` le désactive. |
| `--rate-limit` / `--no-rate-limit` | boolean | env / off | Active la limitation de débit HTTP par niveau pour les routes de prompt, mutation et lecture. |
| `--rate-limit-prompt <n>` | positive integer | `10` | Limite de requêtes de prompt par fenêtre ; nécessite que la limitation de débit soit activée. |
| `--rate-limit-mutation <n>` | positive integer | `30` | Limite de requêtes de mutation par fenêtre ; nécessite que la limitation de débit soit activée. |
| `--rate-limit-read <n>` | positive integer | `120` | Limite de requêtes de lecture par fenêtre ; nécessite que la limitation de débit soit activée. |
| `--rate-limit-window-ms <n>` | integer `>= 1000` | `60000` | Longueur de la fenêtre de limitation de débit ; nécessite que la limitation de débit soit activée. |
| aucun drapeau | - | - | `QWEN_SERVE_NO_MCP_POOL=1` désactive complètement le pool. |

## Variables d'environnement

### Lues par `runQwenServe` / middleware Express

| Env | Effet |
| --- | ----- |
| `QWEN_SERVER_TOKEN` | Token bearer ; purgé au démarrage. |
| `QWEN_SERVE_DEBUG` | `1` / `true` / `on` / `yes` (insensible à la casse) active les logs stderr verbeux. Voir [`19-observability.md`](./19-observability.md). |
| `QWEN_SERVE_NO_MCP_POOL` | `1` désactive le pool de transport MCP de l'espace de travail et revient à `McpClientManager` par session ; les capacités arrêtent de publier `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS` | Valeur de repli env pour `--prompt-deadline-ms`. |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Valeur de repli env pour `--writer-idle-timeout-ms`. |
| `QWEN_SERVE_RATE_LIMIT` | `1` / `true` active la limitation de débit HTTP par niveau ; CLI `--rate-limit` / `--no-rate-limit` prime. |
| `QWEN_SERVE_RATE_LIMIT_PROMPT` | Valeur de repli env pour `--rate-limit-prompt`. |
| `QWEN_SERVE_RATE_LIMIT_MUTATION` | Valeur de repli env pour `--rate-limit-mutation`. |
| `QWEN_SERVE_RATE_LIMIT_READ` | Valeur de repli env pour `--rate-limit-read`. |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS` | Valeur de repli env pour `--rate-limit-window-ms`. |

### Transmises à l'enfant ACP via `BridgeOptions.childEnvOverrides`

`runQwenServe` construit ces variables par poignée pour que deux démons dans un même processus n'entrent pas en conflit sur `process.env`. Les variables de budget ne sont pas des valeurs de repli env pour le processus parent de `qwen serve` ; le chemin CLI doit les générer à partir de `--mcp-client-budget` / `--mcp-budget-mode`.

| Env | Effet |
| --- | ----- |
| `QWEN_SERVE_MCP_CLIENT_BUDGET` | Chaîne d'entier positif consommée par `readBudgetFromEnv()` de l'enfant ACP. |
| `QWEN_SERVE_MCP_BUDGET_MODE` | `off` / `warn` / `enforce`. |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | Liste d'autorisation de transports séparée par des virgules ; les transports mis en pool par défaut sont `stdio,websocket` ; peut inclure explicitement `http,sse`. |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS` | Délai de vidange inactif des entrées du pool ; défaut `30000`, limité à `1000..600000` ms. |

### Lues par SDK / adaptateurs

| Env | Effet |
| --- | ----- |
| `QWEN_DAEMON_URL` | URL de base du démon pour l'adaptateur CLI TUI, les canaux et le compagnon IDE. |
| `QWEN_DAEMON_TOKEN` | Token bearer. |
| `QWEN_DAEMON_WORKSPACE` | Remplace le `cwd` envoyé à `POST /session`. |

## Clés `settings.json`

Le démon lit les paramètres une fois au démarrage via `loadSettings(boundWorkspace)` dans `runQwenServe`. Les paramètres malformés reviennent aux valeurs par défaut grâce à une protection try/catch.

| Clé | Type | Effet |
| --- | ---- | ----- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Définit `BridgeOptions.permissionPolicy` ; la valeur active apparaît dans `/capabilities` sous `policy.permission`. **Le démarrage valide** via `validatePolicyConfig()` par rapport à `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Les littéraux inconnus lèvent `InvalidPolicyConfigError` et échouent explicitement au démarrage. |
| `policy.consensusQuorum` | positive integer | N pour la politique `consensus`. **Défaut** `floor(M/2) + 1` sur `votersAtIssue.size` (M=2 signifie unanime ; M pair plus grand signifie plus de la moitié). Si défini sous une politique non-consensus, il est ignoré et le démarrage affiche un avertissement sur stderr. Les entiers non positifs lèvent `InvalidPolicyConfigError`. Voir [`04-permission-mediation.md`](./04-permission-mediation.md). |
| `context.fileName` | string | Remplace `getCurrentGeminiMdFilename()` via `BridgeOptions.contextFilename`. |
| `tools.disabled` | string[] | Outils désactivés pour le prochain lancement d'enfant ACP. Normalisé via `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`) : non-tableau devient `[]`, les entrées non-chaîne sont ignorées, les espaces sont supprimés, les entrées vides sont éliminées, et les doublons sont retirés en conservant la première occurrence. Le rafraîchissement des paramètres au démarrage et via `restartMcpServer` passe par cette fonction. `ToolRegistry.has(name)` est exact et sensible à la casse. `POST /workspace/tools/:name/enable` et `tool_toggled` mettent à jour cette clé. |
| `tools.approvalMode` | `'default' \| 'auto' \| ...` | Mode d'approbation de session par défaut ; `POST /session/:id/approval-mode` écrit ici lorsque `persist: true`. |
| `telemetry` | object | Configuration OTel. Les clés incluent `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `sensitiveSpanAttributeMaxLength`, `resourceAttributes`, et `metrics.includeSessionId`. `resolveTelemetrySettings()` la lit au démarrage et initialise `initializeTelemetry()`. |

## `ServeOptions` (intégration programmatique)

`packages/cli/src/serve/types.ts` définit l'objet d'options typées accepté par `runQwenServe` et `createServeApp`. Il reflète les drapeaux CLI ci-dessus et ajoute :

| Champ | Effet |
| ----- | ----- |
| `eventRingSize` | Remplace la taille d'anneau par session par défaut. |
| `maxPendingPromptsPerSession` | Limite de prompts en attente par session ; `0` / `Infinity` signifie illimité. |
| `mcpPoolActive` | Commutateur programmatique, par défaut issu de `QWEN_SERVE_NO_MCP_POOL`. |
| `allowOrigins` | Liste d'autorisation cross-origin (`string[]`), correspondant à `--allow-origin`. |
| `allowPrivateAuthBaseUrl` | Permet l'installation d'un fournisseur d'authentification privé/localhost `baseUrl`. |
| `enableSessionShell` | Active l'exécution de shell de session ; le token bearer et l'ID client lié à la session sont toujours requis. |
| `promptDeadlineMs` | Limite murale de prompt. |
| `writerIdleTimeoutMs` | Délai d'inactivité de l'écrivain SSE. |
| `channelIdleTimeoutMs` | Combien de temps garder l'enfant ACP actif après la fermeture de la dernière session. |
| `sessionReapIntervalMs` | Intervalle de balayage du récupérateur de sessions. |
| `sessionIdleTimeoutMs` | Temps de récupération des sessions déconnectées inactives. |
| `rateLimit*` | Commutateur de limitation de débit HTTP par niveau, seuils et fenêtre. |
## `BridgeOptions` (intégration programmatique du bridge)

`packages/acp-bridge/src/bridgeOptions.ts` définit les options du bridge. Voir [`03-acp-bridge.md`](./03-acp-bridge.md) pour le tableau complet. Champs clés :

| Champ                                                                                                                   | Effet                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | Espace de travail canonique requis.                                                          |
| `sessionScope`                                                                                                          | `'single'` (par défaut) vs `'thread'`.                                                       |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | Limites de ressources bornées.                                                               |
| `channelFactory`                                                                                                        | Fabrique d'enfants ACP enfichable ; la valeur par défaut est `defaultSpawnChannelFactory`.   |
| `fileSystem`                                                                                                            | Adaptateur `BridgeFileSystem`. Voir [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | Câblage du médiateur.                                                                        |
| `statusProvider`                                                                                                        | Cellules de pré-vérification hébergées par le démon.                                         |
| `childEnvOverrides`                                                                                                     | Ajouts ou suppressions d'environnement par gestionnaire.                                     |
| `contextFilename`                                                                                                       | Remplace `getCurrentGeminiMdFilename()`.                                                     |
| `channelIdleTimeoutMs`                                                                                                  | Durée pendant laquelle l'enfant ACP reste actif après la fermeture de la dernière session, en ms ; par défaut `0`. |

## Valeurs par défaut importantes

| Constante                          | Fichier                   | Valeur             | Signification                                                           |
| ---------------------------------- | ------------------------- | ------------------ | ----------------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`             | `bridge.ts`               | `20`               | Limite de sessions avant `SessionLimitExceededError`.                   |
| `MAX_EVENT_RING_SIZE`              | `bridge.ts`               | `1_000_000`        | Limite souple pour `BridgeOptions.eventRingSize` ; protège contre les fautes de frappe. |
| `DEFAULT_RING_SIZE`                | `eventBus.ts`             | `8000`             | Profondeur de la boucle de relecture SSE par session.                   |
| `DEFAULT_MAX_QUEUED`               | `eventBus.ts`             | `256`              | Limite de file d'attente par abonné.                                    |
| `DEFAULT_MAX_SUBSCRIBERS`          | `eventBus.ts`             | `64`               | Limite d'abonnés par bus.                                               |
| `WARN_THRESHOLD_RATIO`             | `eventBus.ts`             | `0.75`             | Déclencheur de `slow_client_warning`.                                   |
| `WARN_RESET_RATIO`                 | `eventBus.ts`             | `0.375`            | Seuil de réarmement par hystérésis.                                     |
| `DEFAULT_INIT_TIMEOUT_MS`          | `bridge.ts`               | `10_000`           | Délai d'expiration de la poignée de main `initialize` ACP.              |
| `MCP_RESTART_TIMEOUT_MS`           | `bridge.ts`               | `300_000`          | Délai d'expiration du pont pour `/workspace/mcp/:server/restart`.       |
| `DEFAULT_PERMISSION_TIMEOUT_MS`    | `bridge.ts`               | `5 * 60_000`       | Temps réel par requête de permission.                                   |
| `DEFAULT_MAX_PENDING_PER_SESSION`  | `bridge.ts`               | `64`               | Aligné sur `DEFAULT_MAX_SUBSCRIBERS`.                                   |
| `MAX_RESOLVED_PERMISSION_RECORDS`  | `permissionMediator.ts`   | `512`              | FIFO pour les permissions récemment résolues.                           |
| `KILL_HARD_DEADLINE_MS`            | `spawnChannel.ts`         | `10_000`           | Fenêtre d'arrêt progressif par canal.                                   |
| `SHUTDOWN_FORCE_CLOSE_MS`          | `run-qwen-serve.ts`       | `5_000`            | Minuteur de fermeture forcée du serveur HTTP.                           |
| `MAX_READ_BYTES`                   | `fs/policy.ts`            | `256 * 1024`       | Limite de lecture.                                                      |
| `MAX_WRITE_BYTES`                  | `fs/policy.ts`            | `5 * 1024 * 1024`  | Limite d'écriture.                                                      |
| `MAX_DISPLAY_NAME_LENGTH`          | `bridge.ts`               | `256`              | Limite du `displayName` de session.                                     |

## Références croisées

- Paramètres d'authentification : [`12-auth-security.md`](./12-auth-security.md)
- Capacités et version du protocole : [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Boucle d'événements et réglage de la contre-pression : [`10-event-bus.md`](./10-event-bus.md)
- Pool / budget MCP : [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) et [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Politique de permissions : [`04-permission-mediation.md`](./04-permission-mediation.md)
- Guide des opérations utilisateur : [`../../users/qwen-serve.md`](../../users/qwen-serve.md)