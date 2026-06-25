# Référence de configuration

## Aperçu

Cette page rassemble tous les réglages qui affectent le démon `qwen serve` et ses adaptateurs : variables d'environnement, drapeaux CLI, clés `settings.json` et options programmatiques. Les pages spécifiques aux fonctionnalités renvoient ici lorsqu'elles ont besoin de détails de configuration transversaux.

## Drapeaux CLI (`qwen serve`)

| Drapeau                                | Type                       | Défaut                                     | Effet                                                                                                                                                                             |
| -------------------------------------- | -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hostname <host>`                    | chaîne                     | `127.0.0.1`                                | Adresse de liaison. Valeurs de boucle locale : `127.0.0.1`, `localhost`, `::1`, `[::1]`. Une valeur hors boucle locale nécessite un jeton porteur au démarrage. Une entrée `host:port` est rejetée avec une suggestion d'utiliser `--port`. |
| `--port <n>`                           | nombre                     | `4170`                                     | Port d'écoute ; `0` signifie éphémère.                                                                                                                                             |
| `--token <s>`                          | chaîne                     | env                                        | Jeton porteur. Remplace `QWEN_SERVER_TOKEN` et est nettoyé au démarrage. Il apparaît dans la ligne de commande du processus, donc préférez une variable d'environnement dans les déploiements. |
| `--require-auth`                       | booléen                    | `false`                                    | Étend l'authentification par jeton à la boucle locale et à `/health` ; le démarrage refuse de commencer sans jeton.                                                                |
| `--workspace <dir>`                    | chemin absolu              | `process.cwd()`                            | Espace de travail lié. Doit être absolu et un répertoire ; canonisé une fois au démarrage.                                                                                         |
| `--max-sessions <n>`                   | nombre                     | `20`                                       | Limite maximale de sessions actives. `0` / `Infinity` signifie illimité ; `NaN` ou les valeurs négatives lèvent une exception.                                                     |
| `--max-pending-prompts-per-session <n>` | nombre                     | `5`                                        | Limite de prompts en attente/en cours acceptée par session. Un dépassement de prompt renvoie 503. `0` / `Infinity` signifie illimité ; les valeurs négatives ou non entières lèvent une exception. |
| `--max-connections <n>`               | nombre                     | `256`                                      | `server.maxConnections` de l'écouteur HTTP ; `0` / `Infinity` signifie illimité.                                                                                                   |
| `--enable-session-shell`              | booléen                    | `false`                                    | Active l'exécution directe `POST /session/:id/shell`. Nécessite un jeton porteur, et chaque appel doit comporter un `X-Qwen-Client-Id` lié à la session.                            |
| `--event-ring-size <n>`               | nombre                     | `8000`                                     | Tampon de rejeu SSE par session ; la limite souple est `1_000_000`.                                                                                                                |
| `--http-bridge`                       | booléen                    | `true`                                     | Mode pont étape 1. `--no-http-bridge` utilise encore le pont HTTP et affiche sur stderr.                                                                                           |
| `--mcp-client-budget <n>`             | entier positif             | non défini                                 | Définit `WorkspaceMcpBudget.clientBudget` et le transmet à l'enfant ACP via `childEnvOverrides`.                                                                                   |
| `--mcp-budget-mode <m>`               | `off` / `warn` / `enforce` | `warn` quand le budget est défini, sinon `off` | Définit `WorkspaceMcpBudget.mode` ; `enforce` nécessite `--mcp-client-budget`.                                                                                                    |
| `--allow-origin <pattern>`            | chaîne répétable           | non défini                                 | Liste blanche d'origines croisées qui remplace le refus CORS par défaut. `*` autorise toute origine mais nécessite un jeton.                                                      |
| `--allow-private-auth-base-url`       | booléen                    | `false`                                    | Permet à `/workspace/auth/provider` d'installer une `baseUrl` de fournisseur d'authentification localhost/réseau privé ; à utiliser uniquement en développement local de confiance.   |
| `--prompt-deadline-ms <n>`            | entier positif             | non défini                                 | Limite temporelle murale du prompt côté serveur en ms. Le délai expire et renvoie une erreur.                                                                                      |
| `--writer-idle-timeout-ms <n>`        | entier positif             | non défini                                 | Délai d'inactivité par connexion SSE en ms. Le démon ferme la connexion SSE lorsque aucun événement n'est envoyé pendant cette durée.                                              |
| `--channel-idle-timeout-ms <n>`       | entier non négatif         | `0`                                        | Durée de maintien en vie de l'enfant ACP après la fermeture de la dernière session. `0` signifie récupération immédiate.                                                           |
| `--session-reap-interval-ms <n>`      | entier non négatif         | `60000`                                    | Intervalle de balayage du récupérateur de sessions ; `0` le désactive.                                                                                                             |
| `--session-idle-timeout-ms <n>`       | entier non négatif         | `1800000`                                  | Délai de récupération d'inactivité des sessions déconnectées ; `0` le désactive.                                                                                                   |
| `--rate-limit` / `--no-rate-limit`    | booléen                    | env / off                                  | Active la limitation de débit HTTP par niveau pour les routes de prompt, mutation et lecture.                                                                                       |
| `--rate-limit-prompt <n>`            | entier positif             | `10`                                       | Limite de requêtes de prompt par fenêtre ; nécessite que la limitation de débit soit activée.                                                                                      |
| `--rate-limit-mutation <n>`          | entier positif             | `30`                                       | Limite de requêtes de mutation par fenêtre ; nécessite que la limitation de débit soit activée.                                                                                    |
| `--rate-limit-read <n>`              | entier positif             | `120`                                      | Limite de requêtes de lecture par fenêtre ; nécessite que la limitation de débit soit activée.                                                                                    |
| `--rate-limit-window-ms <n>`         | entier `>= 1000`           | `60000`                                    | Longueur de la fenêtre de limitation de débit ; nécessite que la limitation de débit soit activée.                                                                                 |
| pas de drapeau                        | -                          | -                                          | `QWEN_SERVE_NO_MCP_POOL=1` désactive complètement le pool.                                                                                                                        |
## Variables d'environnement

### Lues par `runQwenServe` / middleware Express

| Variable d'env.                     | Effet                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QWEN_SERVER_TOKEN`                 | Jeton Bearer ; tronqué au démarrage.                                                                                                                                     |
| `QWEN_SERVE_DEBUG`                  | `1` / `true` / `on` / `yes` (insensible à la casse) active les logs stderr verbeux. Voir [`19-observability.md`](./19-observability.md).                                 |
| `QWEN_SERVE_NO_MCP_POOL`            | `1` désactive le pool de transport MCP de l'espace de travail et revient au `McpClientManager` par session ; les capacités cessent d'annoncer `mcp_workspace_pool` / `mcp_pool_restart`. |
| `QWEN_SERVE_PROMPT_DEADLINE_MS`     | Variable de repli pour `--prompt-deadline-ms`.                                                                                                                            |
| `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | Variable de repli pour `--writer-idle-timeout-ms`.                                                                                                                        |
| `QWEN_SERVE_RATE_LIMIT`             | `1` / `true` active la limitation de débit HTTP par niveau ; la CLI `--rate-limit` / `--no-rate-limit` prévaut.                                                           |
| `QWEN_SERVE_RATE_LIMIT_PROMPT`      | Variable de repli pour `--rate-limit-prompt`.                                                                                                                             |
| `QWEN_SERVE_RATE_LIMIT_MUTATION`    | Variable de repli pour `--rate-limit-mutation`.                                                                                                                           |
| `QWEN_SERVE_RATE_LIMIT_READ`        | Variable de repli pour `--rate-limit-read`.                                                                                                                               |
| `QWEN_SERVE_RATE_LIMIT_WINDOW_MS`   | Variable de repli pour `--rate-limit-window-ms`.                                                                                                                          |

### Transmises à l'enfant ACP via `BridgeOptions.childEnvOverrides`

`runQwenServe` les construit par handle afin que deux démons dans un même processus n'entrent pas en conflit sur `process.env`. Les variables de budget ne sont pas des replis d'environnement du processus parent pour `qwen serve` ; le chemin CLI doit les générer à partir de `--mcp-client-budget` / `--mcp-budget-mode`.

| Variable d'env.                      | Effet                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_MCP_CLIENT_BUDGET`       | Chaîne d'entier positif consommée par `readBudgetFromEnv()` de l'enfant ACP.                                           |
| `QWEN_SERVE_MCP_BUDGET_MODE`         | `off` / `warn` / `enforce`.                                                                                            |
| `QWEN_SERVE_MCP_POOL_TRANSPORTS`     | Liste d'autorisation de transports séparés par des virgules ; les transports mis en pool par défaut sont `stdio,websocket` ; peut explicitement inclure `http,sse`. |
| `QWEN_SERVE_MCP_POOL_DRAIN_MS`       | Délai de vidange pour inactivité d'une entrée du pool ; valeur par défaut `30000`, limitée à `1000..600000` ms.         |

### Lues par le SDK / les adaptateurs

| Variable d'env.           | Effet                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| `QWEN_DAEMON_URL`         | URL de base du démon pour l'adaptateur TUI CLI, les canaux et le compagnon IDE. |
| `QWEN_DAEMON_TOKEN`       | Jeton Bearer.                                                     |
| `QWEN_DAEMON_WORKSPACE`   | Remplace le `cwd` envoyé à `POST /session`.                      |

## Clés `settings.json`

Le démon lit les paramètres une fois au démarrage via `loadSettings(boundWorkspace)` dans `runQwenServe`. Les paramètres malformés reviennent aux valeurs par défaut via une protection try/catch.

| Clé                          | Type                                                               | Effet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.permissionStrategy`  | `'first-responder' \| 'designated' \| 'consensus' \| 'local-only'` | Définit `BridgeOptions.permissionPolicy` ; la valeur active apparaît dans `/capabilities` sous `policy.permission`. **Le démarrage valide** via `validatePolicyConfig()` par rapport à `SERVE_CAPABILITY_REGISTRY.permission_mediation.modes`. Les littéraux inconnus lèvent `InvalidPolicyConfigError` et font échouer le démarrage explicitement.                                                                                                                                                                                        |
| `policy.consensusQuorum`     | entier positif                                                     | N pour la politique `consensus`. **Par défaut** est `floor(M/2) + 1` sur `votersAtIssue.size` (M=2 signifie unanime ; des M pairs plus grands signifient plus de la moitié). Si défini sous une politique non-consensus, il est ignoré et le démarrage affiche un avertissement sur stderr. Les entiers non positifs lèvent `InvalidPolicyConfigError`. Voir [`04-permission-mediation.md`](./04-permission-mediation.md).                                                                                                                |
| `context.fileName`           | chaîne                                                             | Remplace `getCurrentGeminiMdFilename()` via `BridgeOptions.contextFilename`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tools.disabled`             | string[]                                                           | Outils désactivés pour le prochain lancement de l'enfant ACP. Normalisé via `normalizeDisabledToolList()` (`packages/cli/src/config/normalizeDisabledTools.ts`) : non-tableau devient `[]`, les entrées non-chaîne sont ignorées, les espaces blancs sont supprimés, les entrées vides sont écartées, et les doublons sont supprimés tout en conservant la première occurrence. Le démarrage et le rafraîchissement des paramètres `restartMcpServer` passent tous deux par cette fonction. `ToolRegistry.has(name)` est exact et sensible à la casse. `POST /workspace/tools/:name/enable` et `tool_toggled` mettent à jour cette clé. |
| `tools.approvalMode`         | `'default' \| 'auto' \| ...`                                       | Mode d'approbation de session par défaut ; `POST /session/:id/approval-mode` écrit ici lorsque `persist: true`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `telemetry`                  | objet                                                              | Configuration OTel. Les clés incluent `enabled`, `otlpEndpoint`, `otlpProtocol`, `otlpTracesEndpoint`, `otlpLogsEndpoint`, `otlpMetricsEndpoint`, `target`, `outfile`, `includeSensitiveSpanAttributes`, `resourceAttributes`, et `metrics.includeSessionId`. `resolveTelemetrySettings()` le lit au démarrage et initialise `initializeTelemetry()`.                                                                                                                                                                                    |
## `ServeOptions` (intégration programmatique)

`packages/cli/src/serve/types.ts` définit l'objet d'options typé accepté à la fois par `runQwenServe` et `createServeApp`. Il reflète les indicateurs CLI ci-dessus et ajoute :

| Champ                            | Effet                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `eventRingSize`                  | Remplace la taille d'anneau par défaut par session.                                               |
| `maxPendingPromptsPerSession`    | Limite de prompts en attente par session ; `0` / `Infinity` signifie illimité.                    |
| `mcpPoolActive`                  | Interrupteur programmatique, prenant par défaut la valeur de `QWEN_SERVE_NO_MCP_POOL`.             |
| `allowOrigins`                   | Liste d'autorisation d'origines croisées (`string[]`), correspondant à `--allow-origin`.          |
| `allowPrivateAuthBaseUrl`        | Permet l'installation d'une `baseUrl` de fournisseur d'authentification privée / localhost.        |
| `enableSessionShell`             | Active l'exécution du shell de session ; le jeton porteur et l'ID client lié à la session sont toujours requis. |
| `promptDeadlineMs`               | Délai absolu pour un prompt.                                                                      |
| `writerIdleTimeoutMs`            | Délai d'inactivité du rédacteur SSE.                                                              |
| `channelIdleTimeoutMs`           | Durée de maintien actif du processus enfant ACP après la fermeture de la dernière session.        |
| `sessionReapIntervalMs`          | Intervalle d'analyse du récupérateur de sessions.                                                 |
| `sessionIdleTimeoutMs`           | Délai de récupération d'une session déconnectée inactive.                                         |
| `rateLimit*`                     | Interrupteur, seuils et fenêtre de limite de débit HTTP par niveau.                               |

## `BridgeOptions` (intégration programmatique du pont)

`packages/acp-bridge/src/bridgeOptions.ts` définit les options du pont. Voir [`03-acp-bridge.md`](./03-acp-bridge.md) pour le tableau complet. Champs clés :

| Champ                                                                                                                      | Effet                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `boundWorkspace`                                                                                                           | Espace de travail canonique requis.                                                               |
| `sessionScope`                                                                                                             | `'single'` (par défaut) vs `'thread'`.                                                            |
| `initializeTimeoutMs`, `maxSessions`, `eventRingSize`, `permissionResponseTimeoutMs`, `maxPendingPermissionsPerSession`    | Limites de ressources bornées.                                                                    |
| `channelFactory`                                                                                                           | Fabrique d'enfants ACP enfichable ; par défaut, `defaultSpawnChannelFactory`.                     |
| `fileSystem`                                                                                                               | Adaptateur `BridgeFileSystem`. Voir [`07-workspace-filesystem.md`](./07-workspace-filesystem.md). |
| `permissionPolicy`, `permissionConsensusQuorum`, `permissionAudit`                                                         | Câblage du médiateur.                                                                             |
| `statusProvider`                                                                                                           | Cellules de pré-vérification hébergées par le démon.                                              |
| `childEnvOverrides`                                                                                                        | Ajouts ou suppressions d'environnement par poignée.                                               |
| `contextFilename`                                                                                                          | Remplace `getCurrentGeminiMdFilename()`.                                                          |
| `channelIdleTimeoutMs`                                                                                                     | Durée de maintien actif du processus enfant ACP après la fermeture de la dernière session, en ms ; par défaut `0`. |

## Valeurs par défaut importantes

| Constante                          | Fichier                  | Valeur             | Signification                                                      |
| ---------------------------------- | ------------------------ | ------------------ | ------------------------------------------------------------------ |
| `DEFAULT_MAX_SESSIONS`             | `bridge.ts`              | `20`               | Limite de sessions avant `SessionLimitExceededError`.              |
| `MAX_EVENT_RING_SIZE`              | `bridge.ts`              | `1_000_000`        | Limite souple pour `BridgeOptions.eventRingSize` ; protège des coquilles. |
| `DEFAULT_RING_SIZE`                | `eventBus.ts`            | `8000`             | Profondeur de l'anneau de rejeu SSE par session.                   |
| `DEFAULT_MAX_QUEUED`               | `eventBus.ts`            | `256`              | Limite de file d'attente par abonné.                               |
| `DEFAULT_MAX_SUBSCRIBERS`          | `eventBus.ts`            | `64`               | Limite d'abonnés par bus.                                          |
| `WARN_THRESHOLD_RATIO`             | `eventBus.ts`            | `0.75`             | Déclencheur de `slow_client_warning`.                              |
| `WARN_RESET_RATIO`                 | `eventBus.ts`            | `0.375`            | Seuil de réarmement par hystérésis.                                |
| `DEFAULT_INIT_TIMEOUT_MS`          | `bridge.ts`              | `10_000`           | Délai d'attente de la poignée de main ACP `initialize`.            |
| `MCP_RESTART_TIMEOUT_MS`           | `bridge.ts`              | `300_000`          | Délai d'attente du pont pour `/workspace/mcp/:server/restart`.     |
| `DEFAULT_PERMISSION_TIMEOUT_MS`    | `bridge.ts`              | `5 * 60_000`       | Délai absolu par demande de permission.                            |
| `DEFAULT_MAX_PENDING_PER_SESSION`  | `bridge.ts`              | `64`               | Aligné sur `DEFAULT_MAX_SUBSCRIBERS`.                              |
| `MAX_RESOLVED_PERMISSION_RECORDS`  | `permissionMediator.ts`  | `512`              | FIFO pour les permissions récemment résolues.                      |
| `KILL_HARD_DEADLINE_MS`            | `spawnChannel.ts`        | `10_000`           | Fenêtre d'arrêt gracieux par canal.                                |
| `SHUTDOWN_FORCE_CLOSE_MS`          | `run-qwen-serve.ts`        | `5_000`            | Minuteur de fermeture forcée du serveur HTTP.                      |
| `MAX_READ_BYTES`                   | `fs/policy.ts`           | `256 * 1024`       | Limite de lecture.                                                 |
| `MAX_WRITE_BYTES`                  | `fs/policy.ts`           | `5 * 1024 * 1024`  | Limite d'écriture.                                                 |
| `MAX_DISPLAY_NAME_LENGTH`          | `bridge.ts`              | `256`              | Limite du `displayName` de session.                                |
## Références croisées

- Paramètres d'authentification : [`12-auth-security.md`](./12-auth-security.md)
- Capacités et version du protocole : [`11-capabilities-versioning.md`](./11-capabilities-versioning.md)
- Anneau d'événements et réglage de la contre-pression : [`10-event-bus.md`](./10-event-bus.md)
- Pool / budget MCP : [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) et [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md)
- Politique d'autorisation : [`04-permission-mediation.md`](./04-permission-mediation.md)
- Guide des opérations utilisateur : [`../../users/qwen-serve.md`](../../users/qwen-serve.md)
