---

# Référence de configuration

## Vue d'ensemble

Cette page regroupe tous les paramètres qui affectent le démon `qwen serve` et ses adaptateurs : variables d'environnement, flags CLI, clés de `settings.json` et options programmatiques. Les pages spécifiques aux fonctionnalités renvoient ici lorsqu'elles ont besoin de détails de configuration transversaux.

## Flags CLI (`qwen serve`)

| Flag                                    | Type                       | Défaut                                   | Effet                                                                                                                                                                              |
| --------------------------------------- | -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                     | string                     | `127.0.0.1`                              | Adresse de liaison. Valeurs de boucle locale : `127.0.0.1`, `localhost`, `::1`, `[::1]`. Une valeur non-boucle locale nécessite un bearer token au démarrage. L'entrée `host:port` est rejetée avec une indication pour utiliser `--port`. |
| `--port <n>`                            | number                     | `4170`                                   | Port d'écoute ; `0` signifie éphémère.                                                                                                                                             |
| `--token <s>`                           | string                     | env                                      | Bearer token. Remplace `QWEN_SERVER_TOKEN` et est nettoyé (trim) au démarrage. Il apparaît dans la ligne de commande du processus, préférez donc les variables d'environnement en production. |
| `--require-auth`                        | boolean                    | `false`                                  | Étend l'authentification bearer à la boucle locale et à `/health` ; le démarrage refuse de se lancer sans token.                                                                   |
| `--workspace <dir>`                     | absolute path / repeatable | `process.cwd()`                          | Runtime workspace de démarrage ; répétez pour enregistrer des runtimes isolés supplémentaires. Le premier est primaire. Chaque valeur doit être absolue et un répertoire ; canonisé au démarrage. |
| `--memory-project-scope <mode>`         | `git-root` / `workspace`   | `git-root`                               | Partitionnement de la mémoire projet. `git-root` partage la mémoire entre les workspaces ayant la même racine Git ; `workspace` isole par répertoire workspace exact. Remplace `QWEN_CODE_MEMORY_PROJECT_SCOPE`. |
| `--max-sessions <n>`                    | number                     | `32`                                     | Limite de sessions actives par workspace. `0` / `Infinity` signifie illimité ; les valeurs `NaN` / négatives lèvent une erreur.                                                     |
| `--max-total-sessions <n>`              | number                       | dérivé pour plusieurs workspaces au démarrage/restaurés | Limite de sessions actives à l'échelle du démon. Lorsqu'omis, une valeur par défaut finie est dérivée une fois à partir de la limite par workspace et du nombre de workspaces au démarrage/restaurés. `0` / `Infinity` signifie illimité. |
| `--memory-budget-mb <n>`                | integer dans `[1024, 1048576]` | 50% de la mémoire cgroup/hôte, plafonné au maximum du flag (1048576 Mo) | Budget mémoire total pour l'arbre de processus du démon, plafonné à la mémoire disponible résolue. Observé et rapporté sous `limits.memory` dans le statut du démon ; il ne dimensionne aucun processus enfant. Le démarrage rejette les valeurs hors limites. |
| `--max-pending-prompts-per-session <n>` | number                     | `5`                                      | Limite de prompts acceptés mais en attente/en cours d'exécution par session. Un prompt en excès retourne 503. `0` / `Infinity` signifie illimité ; les valeurs négatives ou non entières lèvent une erreur. |
| `--max-connections <n>`                 | number                     | `256`                                    | `server.maxConnections` de l'écouteur HTTP ; `0` / `Infinity` signifie illimité.                                                                                                   |
| `--enable-session-shell`                | boolean                    | `false`                                  | Active l'exécution directe de `POST /session/:id/shell`. Nécessite un bearer token, et chaque appel doit porter un `X-Qwen-Client-Id` lié à la session.                            |
| `--event-ring-size <n>`                 | number                     | `8000`                                   | Anneau de relecture SSE par session ; la limite souple est de `1_000_000`.                                                                                                         |
| `--compacted-replay-max-bytes <n>`      | positive integer           | `4194304`                                | Plafond d'octets pour le snapshot de relecture en mémoire borné retourné par `POST /session/:id/load` ; le plafond dur est `268435456`.                                            |
| `--http-bridge`                         | boolean                    | `true`                                   | Mode bridge étape 1. `--no-http-bridge` utilise tout de même le fallback http-bridge et affiche un message sur stderr.                                                             |
| `--mcp-client-budget <n>`               | positive integer           | unset                                    | Définit `WorkspaceMcpBudget.clientBudget` et le transmet à l'enfant ACP via `childEnvOverrides`.                                                                                   |
| `--mcp-budget-mode <m>`                 | `off` / `warn` / `enforce` | `warn` quand le budget est défini, sinon `off` | Définit `WorkspaceMcpBudget.mode` ; `enforce` nécessite `--mcp-client-budget`.                                                                                                     |
| `--external-tool-guard-mode <m>`        | `off` / `required`           | `off`                                  | Active le Guard pré-exécution externe ACP géré. `required` fait échouer le démarrage à moins que son fournisseur loopback ne complète le handshake v1.                              |
| `--external-tool-guard-endpoint <url>`  | loopback HTTP(S) origin      | unset                                  | Origine du fournisseur utilisée uniquement en mode `required`. Elle doit être uniquement l'origine et utiliser `127.0.0.1`, `localhost` ou `::1` ; les chemins, identifiants, redirections et routage proxy sont rejetés. |
| `--external-tool-guard-timeout-ms <n>`  | integer `100..30000`         | `3000`                                 | Délai par handshake et par préparation. Un délai fait échouer le démarrage pendant le handshake ou fait échouer l'invocation fermée pendant un tour.                                 |
| `--allow-origin <pattern>`              | repeatable string          | unset                                    | Liste blanche cross-origin qui remplace le refus CORS par défaut. `*` autorise n'importe quelle origine mais nécessite un token.                                                   |
| `--allow-private-auth-base-url`         | boolean                    | `false`                                  | Autorise `/workspace/auth/provider` à installer le `baseUrl` du fournisseur d'authentification localhost / réseau privé ; à utiliser uniquement dans un environnement de développement local de confiance. |
| `--prompt-deadline-ms <n>`              | positive integer           | unset                                    | Limite de temps réel (wallclock) côté serveur pour les prompts en ms. Le délai d'attente interrompt et retourne une erreur.                                                        |
| `--writer-idle-timeout-ms <n>`          | positive integer           | unset                                    | Délai d'inactivité par connexion SSE en ms. Le démon ferme la connexion SSE lorsqu'aucun événement n'est envoyé pendant cette durée.                                               |
| `--channel-idle-timeout-ms <n>`         | non-negative integer       | `0`                                      | Durée de maintien en vie de l'enfant ACP après la fermeture de la dernière session. `0` signifie une récupération immédiate.                                                       |
| `--initialize-timeout-ms <n>`           | positive integer           | `10000`                                  | Délai d'attente des requêtes de l'enfant ACP, incluant le handshake initialize (ms).                                                                                                |
| `--session-reap-interval-ms <n>`        | non-negative integer       | `60000`                                  | Intervalle de scan du ramasse-miettes de sessions (session reaper) ; `0` le désactive.                                                                                             |
| `--session-idle-timeout-ms <n>`         | non-negative integer       | `1800000`                                | Délai d'inactivité pour le ramasse-miettes des sessions déconnectées ; `0` le désactive.                                                                                           |
| `--rate-limit` / `--no-rate-limit`      | boolean                    | env / off                                | Active la limitation de débit HTTP par niveau pour les routes de prompt, de mutation et de lecture.                                                                                |
| `--rate-limit-prompt <n>`               | positive integer           | `10`                                     | Limite de requêtes de prompt par fenêtre ; nécessite que la limitation de débit soit activée.                                                                                      |
| `--rate-limit-mutation <n>`             | positive integer           | `30`                                     | Limite de requêtes de mutation par fenêtre ; nécessite que la limitation de débit soit activée.                                                                                    |
| `--rate-limit-read <n>`                 | positive integer           | `120`                                    | Limite de requêtes de lecture par fenêtre ; nécessite que la limitation de débit soit activée.                                                                                     |
| `--rate-limit-window-ms <n>`            | integer `>= 1000`          | `60000`                                  | Durée de la fenêtre de limitation de débit ; nécessite que la limitation de débit soit activée.                                                                                    |
| aucun flag                              | -                          | -                                        | `QWEN_SERVE_NO_MCP_POOL=1` désactive entièrement le pool.                                                                                                                          |

## Variables d'environnement

### Lues par `runQwenServe` / middleware Express

| Env                                 | Effet                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN`                 | Bearer token ; nettoyé (trim) au démarrage.                                                                                                                            |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (insensible à la casse) active les logs verbeux sur stderr. Voir [`19-observability.md`](./19-observability.md).                            |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` désactive le pool de transports MCP du workspace et utilise le fallback `McpClientManager` par session ; les capacités cessent d'annoncer `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Variable d'environnement de fallback pour `--prompt-deadline-ms`.                                                                                                      |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Variable d'environnement de fallback pour `--writer-idle-timeout-ms`.                                                                                                  |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` active la limitation de débit HTTP par niveau ; le flag CLI `--rate-limit` / `--no-rate-limit` est prioritaire.                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Variable d'environnement de fallback pour `--rate-limit-prompt`.                                                                                                       |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Variable d'environnement de fallback pour `--rate-limit-mutation`.                                                                                                     |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Variable d'environnement de fallback pour `--rate-limit-read`.                                                                                                         |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Variable d'environnement de fallback pour `--rate-limit-window-ms`.                                                                                                    |
| `QWEN_CODE_MEMORY_PROJECT_SCOPE`    | `workspace` clé la mémoire projet par répertoire workspace exact ; toute autre valeur conserve le scope `git-root` (les valeurs non reconnues émettent un avertissement unique). Propagé via le base env du runtime, pas `childEnvOverrides` ; `--memory-project-scope` est prioritaire. Chaque lane remember/forget/dream par workspace limite les tâches en attente à `MAX_PENDING = 16` ; N workspaces permettent jusqu'à 16·N tâches en file d'attente sans limite à l'échelle du démon. |

### Lues par le wrapper CLI `qwen serve`

| Env                                   | Effet                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN` | Bearer token non vide d'au plus 8192 code units UTF-16 sans caractères de contrôle, copié dans `ServeOptions.externalToolGuard` uniquement en mode required. Le CLI supprime ensuite la valeur ambiante avant que les environnements runtime ne soient figés ; les enfants ACP, les channel workers et les environnements d'exécuteur la nettoient aussi de manière défensive. |

### Transmises à l'enfant ACP via `BridgeOptions.childEnvOverrides`

`runQwenServe` construit ces variables par handle afin que deux démons dans un même processus n'entrent pas en conflit sur `process.env`. Les variables de budget ne sont pas des fallbacks d'environnement du processus parent pour `qwen serve` ; le chemin CLI doit les générer à partir de `--mcp-client-budget` / `--mcp-budget-mode`.

| Env                              | Effet                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`   | Chaîne de caractères d'entier positif consommée par `readBudgetFromEnv()` de l'enfant ACP.                               |
| `QWEN_SERVE_MCP_BUDGET_MODE`     | `off` / `warn` / `enforce`.                                                                                              |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS` | Liste blanche des transports séparés par des virgules ; les transports en pool par défaut sont `stdio,websocket` ; peut inclure explicitement `http,sse`. |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`   | Délai de vidange d'inactivité des entrées du pool ; par défaut `30000`, limité à `1000..600000` ms.                      |

### Lues par le SDK / les adaptateurs

| Env                     | Effet                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| `QWEN_DAEMON_URL`       | URL de base du démon pour l'adaptateur TUI CLI, les canaux et le compagnon IDE. |
| `QWEN_DAEMON_TOKEN`     | Bearer token.                                                     |
| `QWEN_DAEMON_WORKSPACE` | Remplace le `cwd` envoyé à `POST /session`.                       |

## Clés de `settings.json`

Le démon construit chaque runtime workspace à partir des paramètres fusionnés et de la surcouche d'environnement de ce workspace. Les options globales au processus (écouteur/authentification) sont résolues une seule fois, tandis que les services spécifiques au runtime et les enfants ACP reçoivent le snapshot du runtime propriétaire. Les paramètres malformés suivent le comportement de fallback ou d'échec au démarrage documenté pour le runtime affecté ; ils ne doivent pas provoquer la réutilisation des paramètres d'un autre workspace.

| Key                         | Type                                                               | Effet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy` | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Définit `BridgeOptions.permissionPolicy` ; la valeur active apparaît dans `/capabilities` sous `policy.permission`. **Le démarrage valide** via `validatePolicyConfig()` par rapport à `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Les littéraux inconnus lèvent `InvalidPolicyConfigError` et font explicitement échouer le démarrage.                                                                                                                                                               |
| `policy.consensusQuorum`    | positive integer                                                   | N pour la politique `consensus`. **Par défaut**, c'est `floor(M/2) + 1` sur `votersAtIssue.size` (M=2 signifie unanime ; un M pair plus grand signifie plus de la moitié). Si défini sous une politique non-consensus, il est ignoré et le démarrage affiche un avertissement sur stderr. Les entiers non positifs lèvent `InvalidPolicyConfigError`. Voir [`04-permission-mediation.md`](./04-permission-mediation.md).                                                                                                                                                                        |
| `context.fileName`          | string                                                             | Remplace `getCurrentGeminiMdFilename()` via `BridgeOptions.contextFilename`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tools.disabled`            | string[]                                                           | Outils désactivés pour le prochain spawn de l'enfant ACP. Normalisé via `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`) : un non-tableau devient `[]`, les entrées non-chaînes sont ignorées, les espaces sont nettoyés, les entrées vides sont supprimées, et les doublons sont retirés en conservant la première occurrence. Le démarrage et le rafraîchissement des paramètres de `restartMcpServer` passent tous deux par cette fonction. `ToolRegistry.has(name)` est exact et sensible à la casse. `POST /workspace/tools/:name/enable` et `tool_toggled` mettent à jour cette clé. |
| `tools.approvalMode`        | `'default' \| 'auto' \| ...`                                       | Mode d'approbation de session par défaut ; `POST /session/:id/approval-mode` écrit ici lorsque `persist: true`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `telemetry`                 | object                                                             | Configuration OTel. Les clés incluent `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `userId`, `includeSensitiveSpanAttributes`, `sensitiveSpanAttributeMaxLength`, `resourceAttributes` et `metrics.includeSessionId`. `resolveTelemetrySettings()` la lit au démarrage et initialise `initializeTelemetry()`. `userId` est à l'échelle du processus et ne doit pas être configuré comme identité utilisateur final lorsque le démon sert plusieurs utilisateurs.                                                                                                                                                             |

## `ServeOptions` (intégration programmatique)

`packages/cli/src/serve/types.ts` définit l'objet d'options typé accepté à la fois par `runQwenServe` et `createServeApp`. Il reflète les flags CLI ci-dessus et ajoute :

| Field                         | Effet                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `eventRingSize`               | Remplace la taille d'anneau par défaut par session.                                         |
| `memoryProjectScope`          | Partitionnement de la mémoire projet `'git-root' \| 'workspace'` ; fallback vers `QWEN_CODE_MEMORY_PROJECT_SCOPE`. |
| `maxPendingPromptsPerSession` | Limite de prompts en attente par session ; `0` / `Infinity` signifie illimité.              |
| `mcpPoolActive`               | Interrupteur programmatique, ayant pour valeur par défaut celle de `QWEN_SERVE_NO_MCP_POOL`.|
| `externalToolGuard`           | Optionnel `{mode:'required', endpoint, token, timeoutMs?}`. L'omission désactive complètement ; le mode required effectue le handshake avec le fournisseur avant l'écoute. |
| `allowOrigins`                | Liste blanche cross-origin (`string[]`), correspondant à `--allow-origin`.                  |
| `allowPrivateAuthBaseUrl`     | Autorise l'installation du `baseUrl` du fournisseur d'authentification privé / localhost.   |
| `enableSessionShell`          | Active l'exécution du shell de session ; le bearer token et l'identifiant client lié à la session restent requis. |
| `promptDeadlineMs`            | Limite de temps réel (wallclock) pour les prompts.                                          |
| `writerIdleTimeoutMs`         | Délai d'inactivité du writer SSE.                                                           |
| `channelIdleTimeoutMs`        | Durée de maintien en vie de l'enfant ACP après la fermeture de la dernière session.         |
| `initializeTimeoutMs`         | Délai d'attente des requêtes de l'enfant ACP, incluant le handshake initialize.             |
| `sessionReapIntervalMs`       | Intervalle de scan du ramasse-miettes de sessions.                                          |
| `sessionIdleTimeoutMs`        | Délai d'inactivité pour le ramasse-miettes des sessions déconnectées.                       |
| `rateLimit*`                  | Interrupteur de limitation de débit HTTP par niveau, seuils et fenêtre.                     |
## `BridgeOptions` (intégration programmatique du bridge)

`packages/acp-bridge/src/bridgeOptions.ts` définit les options du bridge. Consultez [`03-acp-bridge.md`](./03-acp-bridge.md) pour le tableau complet. Champs clés :

| Field                                                                                                                   | Effect                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                        | Espace de travail canonique requis.                                                           |
| `sessionScope`                                                                                                          | `'single'` (par défaut) ou `'thread'`.                                                        |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession` | Plafonds de ressources bornés.                                                                |
| `channelFactory`                                                                                                        | Fabrique de processus enfants ACP enfichable ; la valeur par défaut est `defaultSpawnChannelFactory`. |
| `fileSystem`                                                                                                            | Adaptateur `BridgeFileSystem`. Voir [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                      | Câblage du médiateur.                                                                         |
| `statusProvider`                                                                                                        | Cellules de pré-vérification de l'hôte du daemon.                                             |
| `childEnvOverrides`                                                                                                     | Ajouts ou suppressions d'environnement par handle.                                            |
| `externalToolGuard`                                                                                                     | Gestionnaire optionnel côté démon pour le RPC privé prepare enfant-vers-parent. Le bridge valide la propriété du canal et le Prompt actif avant et après l'appel au gestionnaire. |
| `contextFilename`                                                                                                       | Remplace `getCurrentGeminiMdFilename()`.                                                      |
| `channelIdleTimeoutMs`                                                                                                  | Durée de maintien en vie du processus enfant ACP après la fermeture de la dernière session, en ms ; par défaut `0`. |

## Valeurs par défaut importantes

| Constant                          | File                    | Value             | Meaning                                                           |
| --------------------------------- | ----------------------- | ----------------- | ----------------------------------------------------------------- |
| `DEFAULT_MAX_SESSIONS`            | `bridge.ts`             | `32`              | Plafond de sessions avant `SessionLimitExceededError`.            |
| `MAX_EVENT_RING_SIZE`             | `bridge.ts`             | `1_000_000`       | Plafond souple pour `BridgeOptions.eventRingSize` ; protège contre les erreurs de frappe. |
| `DEFAULT_RING_SIZE`               | `eventBus.ts`           | `8000`            | Profondeur de l'anneau de relecture SSE par session.              |
| `DEFAULT_MAX_QUEUED`              | `eventBus.ts`           | `256`             | Plafond de la file d'attente par abonné.                          |
| `DEFAULT_MAX_SUBSCRIBERS`         | `eventBus.ts`           | `64`              | Plafond d'abonnés par bus.                                        |
| `WARN_THRESHOLD_RATIO`            | `eventBus.ts`           | `0.75`            | Déclencheur de `slow_client_warning`.                             |
| `WARN_RESET_RATIO`                | `eventBus.ts`           | `0.375`           | Seuil de réarmement de l'hystérésis.                              |
| `DEFAULT_INIT_TIMEOUT_MS`         | `bridge.ts`             | `10_000`          | Délai d'expiration du handshake `initialize` ACP.                 |
| `MCP_RESTART_TIMEOUT_MS`          | `bridge.ts`             | `300_000`         | Délai d'expiration du bridge pour `/workspace/mcp/:server/restart`. |
| `DEFAULT_PERMISSION_TIMEOUT_MS`   | `bridge.ts`             | `5 * 60_000`      | Délai d'horloge murale par demande de permission.                 |
| `DEFAULT_MAX_PENDING_PER_SESSION` | `bridge.ts`             | `64`              | Aligné sur `DEFAULT_MAX_SUBSCRIBERS`.                             |
| `MAX_RESOLVED_PERMISSION_RECORDS` | `permissionMediator.ts` | `512`             | FIFO pour les permissions récemment résolues.                     |
| `KILL_HARD_DEADLINE_MS`           | `spawnChannel.ts`       | `10_000`          | Fenêtre d'arrêt gracieux par canal.                               |
| `SHUTDOWN_FORCE_CLOSE_MS`         | `run-qwen-serve.ts`     | `5_000`           | Minuterie de fermeture forcée du serveur HTTP.                    |
| `MAX_READ_BYTES`                  | `fs/policy.ts`          | `256 * 1024`      | Plafond du snapshot complet et du texte retourné ; un texte UTF-8 plus grand nécessite une limite de lignes finie. |
| `MAX_WRITE_BYTES`                 | `fs/policy.ts`          | `5 * 1024 * 1024` | Plafond d'écriture.                                               |
| `MAX_DISPLAY_NAME_LENGTH`         | `bridge.ts`             | `256`             | Plafond du `displayName` de session.                              |

## Références croisées

- Paramètres d'authentification : [`12-auth-security.md`](./12-auth-security.md)
- Capacités et version du protocole : [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Réglage de l'anneau d'événements et de la contre-pression : [`10-event-bus.md`](./10-event-bus.md)
- Pool / budget MCP : [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) et [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Politique de permissions : [`04-permission-mediation.md`](./04-permission-mediation.md)
- Guide des opérations utilisateur : [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
