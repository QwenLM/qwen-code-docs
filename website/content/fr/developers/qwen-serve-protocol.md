# Référence du protocole HTTP de `qwen serve`

Étape 1 de la [conception du démon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Toutes les routes se trouvent sous l'URL de base du démon (par défaut `http://127.0.0.1:4170`).

## Authentification

Lorsque le démon a été démarré avec `--token` ou `QWEN_SERVER_TOKEN`, **chaque route à l'exception de `/health` sur les liaisons en boucle locale** doit inclure :

```
Authorization: Bearer <token>
```

Sans token configuré (valeur par défaut pour le développement en boucle locale), l'en-tête est optionnel. La comparaison des tokens s'effectue en temps constant. Les réponses 401 sont uniformes pour `missing header` / `wrong scheme` / `wrong token`.

**Exemption de `/health`** (Bctum) : sur les liaisons en boucle locale (`127.0.0.1` / `localhost` / `::1` / `[::1]`), `/health` est enregistré AVANT le middleware bearer, de sorte que les sondes de liveness à l'intérieur du pod n'ont pas besoin de fournir le token, même si le démon a été démarré avec `--token`. Les liaisons hors boucle locale (`--hostname 0.0.0.0`, etc.) protègent `/health` derrière le bearer comme n'importe quelle autre route — consultez la section [`GET /health`](#get-health) pour plus de détails.

**`--require-auth` (#4175 PR 15).** Passez ce flag au démarrage pour étendre la règle "doit avoir un token" à la boucle locale également. Le démarrage échoue sans token ; l'exemption de `/health` est supprimée (donc `/health` nécessite également `Authorization: Bearer …`).

Lorsque le flag est activé, le middleware global `bearerAuth` protège **toutes** les routes — y compris `/capabilities`. Un client **non authentifié** ne peut donc pas pré-vérifier `caps.features` pour découvrir que l'authentification est requise : la surface de découverte pour ce cas est le **corps de la réponse 401** lui-même (uniforme sur toutes les routes selon la section [Authentification](#authentication)). Le tag de capacité `require_auth` est une **confirmation post-authentification** — une fois qu'un client s'authentifie avec succès et lit `/capabilities`, la présence du tag confirme que le démon a été démarré avec `--require-auth` (utile pour les interfaces d'audit / de conformité et pour que les clients SDK affichent "ce déploiement est renforcé" dans un panneau de paramètres). Les routes de mutation qui optent pour le mode strict par route (suivis de la Wave 4) refusent avec `401 { code: "token_required", error: "…" }` lorsqu'elles sont atteintes sur une boucle locale sans token par défaut — mais avec `--require-auth` activé, le middleware bearer global court-circuite la requête avant la protection par route, de sorte que le corps legacy `Unauthorized` est ce que les appelants non authentifiés voient réellement.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Les webuis de navigateur accédant au démon en cross-origin sont bloqués par défaut — toute requête portant un en-tête `Origin` renvoie `403 {"error":"Request denied by CORS policy"}` car les clients CLI/SDK n'envoient jamais `Origin` et le démon considère sa présence comme le signe que la requête provient d'un contexte de navigateur pour lequel l'opérateur ne s'est pas inscrit. Passez `--allow-origin <pattern>` (répétable) au démarrage pour installer une allowlist au lieu du blocage. Chaque pattern est soit :

- Le littéral `*` — autorise n'importe quelle origin. **Risqué** : le démarrage refuse lorsque `*` est configuré mais qu'aucun bearer token n'est défini (quelle que soit la source : `--token`, `QWEN_SERVER_TOKEN`, ou `--require-auth` qui impose un token au démarrage). Le breadcrumb de démarrage émet un avertissement stderr lorsque `*` est dans la liste. **Recommandation** : associez-le à `--require-auth` sur les liaisons en boucle locale afin que `/health` et `/demo` soient également protégés par le bearer — ils sont enregistrés avant le middleware bearer en boucle locale par défaut (afin que les sondes k8s/Compose puissent atteindre `/health` sans token), et une allowlist `*` les rend accessibles depuis n'importe quel navigateur cross-origin. Sur les liaisons hors boucle locale, le bearer est déjà obligatoire au démarrage, donc la surface d'exposition `*` se limite à `/health` (JSON de statut) et `/demo` (une page statique dont le JS appelle toujours des routes protégées par token) — la surface API réelle est protégée de toute façon.
- Une origin URL canonique — `<scheme>://<host>[:<port>]`. **Pas de slash final, pas de chemin, pas d'userinfo, pas de query.** Le démarrage refuse avec `InvalidAllowOriginPatternError` si l'entrée échoue au round-trip `new URL(pattern).origin === pattern` ; le message d'erreur indique le mauvais pattern et la forme canonique. Strict par intention : une normalisation silencieuse (par exemple, supprimer un `/` final) laisserait passer des fautes de frappe et accepterait des entrées ambiguës.

Les origins correspondantes reçoivent les en-têtes de réponse CORS standard sur chaque requête :

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` renvoie l'origin de la requête verbatim (minuscules / majuscules telles qu'envoyées par le navigateur) plutôt que le littéral `*`, même avec le pattern `*` — les caches du navigateur indexent les réponses sur cette valeur associée à `Vary: Origin`, et le renvoi verbatim laisse la possibilité d'ajouter `Access-Control-Allow-Credentials` dans une prochaine version sans changement de schéma. `Access-Control-Expose-Headers: Retry-After` permet aux webuis de navigateur de respecter les indications de retry du démon provenant des réponses `429` / `503`. `Access-Control-Allow-Credentials` n'est **PAS** envoyé aujourd'hui : le démon s'authentifie via bearer dans `Authorization`, ce qui fonctionne en cross-origin sans `credentials: 'include'`.

Les requêtes OPTIONS preflight (OPTIONS avec `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) sont court-circuitées avec `204 No Content` plus les en-têtes ci-dessus. C'est le pattern CORS conventionnel et c'est sûr — le preflight confirme uniquement quelles méthodes/en-têtes le démon acceptera ; la requête suivante réelle exécute toujours la chaîne complète (allowlist d'hôtes → auth bearer → routes), donc l'anti-DNS-rebinding et l'application du bearer se déclenchent toujours avant que tout état ne soit lu ou modifié. Les requêtes OPTIONS simples provenant d'origins correspondantes continuent de circuler en aval avec les en-têtes CORS attachés.

Les origins qui ne correspondent pas à l'allowlist reçoivent toujours `403 {"error":"Request denied by CORS policy"}` — la même enveloppe que le blocage par défaut, afin que les clients qui ont déjà analysé la réponse du blocage n'aient pas à traiter différemment les démons déployés avec allowlist. Le chemin de rejet **n'émet pas** d'en-têtes `Access-Control-*` (le navigateur les ignorerait, et les émettre annoncerait indirectement la taille de l'allowlist via la présence des en-têtes).

La liste des patterns configurés n'est intentionnellement **PAS** renvoyée dans `/capabilities` — le webui du navigateur connaît déjà sa propre origin (il a appelé le démon, après tout), et afficher la liste permettrait à un lecteur non authentifié de `/capabilities` d'énumérer toutes les origins de confiance (une reconnaissance utile pour un déploiement mal configuré). Les clients SDK se basent sur le tag `caps.features.allow_origin` pour savoir que "ce démon honore les accès cross-origin des navigateurs" sans avoir besoin de connaître les origins spécifiques.

Les requêtes loopback self-origin (par exemple, la page `/demo` appelant le démon sur le même `127.0.0.1:port`) sont gérées par un shim de suppression d'Origin **séparé** qui s'exécute AVANT le middleware CORS et supprime l'en-tête `Origin` pour `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Elles passent donc indépendamment de la configuration de `--allow-origin` — les opérateurs n'ont pas besoin d'ajouter le propre port du démon pour faire fonctionner la page de démo.

## Forme des erreurs courantes

Les réponses 5xx portent le `code` et les `data` de l'erreur d'origine lorsqu'ils sont présents (style JSON-RPC — l'ACP SDK transmet `{code, message, data}` depuis l'agent) :

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

Un JSON malformé dans le corps d'une requête renvoie :

```json
{ "error": "Invalid JSON in request body" }
```

avec le statut `400`.

`SessionNotFoundError` pour un id de session inconnu renvoie :

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

avec le statut `404`.

`WorkspaceMismatchError` pour un `POST /session` dont le `cwd` ne se canonicalise pas vers le workspace lié au démon (#3803 §02 — 1 démon = 1 workspace) renvoie `400` avec :

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Utilisez ceci pour détecter les incompatibilités en pre-flight : lisez `workspaceCwd` depuis `/capabilities` et omettez `cwd` de `POST /session` (il reviendra au workspace lié), ou routez la requête vers un démon lié à `requestedWorkspace`.

Un `POST /session` dépassant la limite `--max-sessions` du démon renvoie `503` avec un en-tête `Retry-After: 5` et :

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Les rattachements aux sessions existantes ne sont **PAS** comptabilisés dans la limite, donc les reconnexions d'un démon inactif continuent de fonctionner même à capacité maximale.

`RestoreInProgressError` — émis uniquement par `POST /session/:id/load` et `POST /session/:id/resume` — renvoie `409` avec un en-tête `Retry-After: 5` (correspondant à `session_limit_exceeded`) et :

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Déclenché lorsqu'un `session/load` est émis pour un id qui a déjà un `session/resume` en cours (ou vice versa). Attendez au moins `Retry-After` secondes et réessayez — la restauration sous-jacente se termine dans un délai de `initTimeoutMs` (10s par défaut). Les courses de même action (`load` vs `load`, `resume` vs `resume`) fusionnent au lieu de générer une erreur.

`SessionArchivedError` est émis lorsqu'un appelant tente de charger ou de reprendre une session dont le JSONL se trouve sous `chats/archive/` :

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

avec le statut `409`.

`SessionArchivingError` est émis lorsqu'une transition d'archivage ou de désarchivage de session est déjà en cours pour le même id :

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

avec le statut `409` et `Retry-After: 5`.

## Capacités

Le démon annonce ses tags de fonctionnalités pris en charge depuis le registre de capacités de serve. Les clients **doivent** conditionner l'UI sur `features`, et non sur `mode` (selon la conception §10).

```
['health', 'capabilities', 'session_create', 'session_scope_override',
 'session_load', 'session_resume',
 'unstable_session_resume',
 'session_list', 'session_prompt', 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload']
```

> Les tags conditionnels n'apparaissent que lorsque leur toggle de déploiement correspondant est activé (voir le tableau ci-dessous). Le tag `permission_mediation` de F3 est toujours actif et porte `modes: ['first-responder', 'designated', 'consensus', 'local-only']` afin que les clients SDK puissent introspecter l'ensemble pris en charge par la build ; la stratégie active au runtime se trouve dans `body.policy.permission`.

`session_scope_override` est le handle de négociation pour le champ `sessionScope` par requête sur `POST /session` (voir ci-dessous). Les anciens démons ignorent silencieusement ce champ, les clients SDK doivent donc pré-vérifier `caps.features` pour ce tag avant de l'envoyer.

`session_load` et `session_resume` annoncent les routes de restauration explicite (`POST /session/:id/load` et `POST /session/:id/resume`). Les anciens démons renvoient `404` pour ces chemins, les clients SDK doivent donc pré-vérifier `caps.features` avant de les appeler. `unstable_session_resume` est toujours annoncé comme un alias obsolète pour la compatibilité avec les SDK qui ont été livrés lorsque la méthode ACP sous-jacente s'appelait `connection.unstable_resumeSession` ; les nouveaux clients doivent se baser sur `session_resume`.

`slow_client_warning` couvre deux mécanismes de backpressure SSE livrés ensemble introduits dans #4175 Wave 2.5 PR 10 : (a) le démon émet une frame de flux d'événements synthétique `slow_client_warning` lorsque la file d'attente d'un abonné dépasse 75 % de capacité, une fois par épisode de débordement (réarmé après que la file d'attente redescend sous 37,5 %) ; (b) `GET /session/:id/events` accepte un paramètre de query `?maxQueued=N` (plage `[16, 2048]`) pour pré-dimensionner le backlog par abonné pour les reconnexions à froid contre un grand ring de replay. La taille du ring pour l'ensemble du démon est contrôlée par `--event-ring-size` (par défaut **8000**, selon #3803 §02). Les anciens démons n'ont ni l'un ni l'autre silencieusement — pré-vérifiez ce tag avant de l'activer.

`typed_event_schema` annonce les payloads d'événements du démon qui correspondent au schéma `KnownDaemonEvent` du SDK. Les anciens démons peuvent toujours diffuser des frames compatibles, mais les clients SDK doivent pré-vérifier ce tag avant de supposer une couverture des événements typés.

`client_heartbeat` annonce `POST /session/:id/heartbeat`. Les anciens démons renvoient `404` ; pré-vérifiez ce tag avant d'émettre des heartbeats périodiques.

`session_close` et `session_metadata` annoncent `DELETE /session/:id` et `PATCH /session/:id/metadata`. Les anciens démons renvoient `404` ; pré-vérifiez ces tags avant d'exposer les affordances de fermeture ou de renommage.

`session_archive` annonce l'API d'archivage d'état de répertoire v1 : `POST /sessions/archive`, `POST /sessions/unarchive`, et `GET /workspace/:id/sessions?archiveState=active|archived`. Les sessions archivées ne peuvent pas être chargées ou reprises jusqu'à ce qu'elles soient désarchivées.

`session_lsp` annonce `GET /session/:id/lsp`, l'instantané de statut LSP structuré en lecture seule pour les clients démon. Les anciens démons renvoient `404` ; pré-vérifiez ce tag avant d'exposer le statut LSP distant.

`session_status` annonce `GET /session/:id/status`, le résumé de bridge en direct pour une seule session par id (`clientCount` / `hasActivePrompt` et les champs principaux). Les anciens démons renvoient `404` ; pré-vérifiez ce tag avant d'interroger le statut d'une seule session au lieu de scanner la liste complète des sessions.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init`, et `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) annoncent les quatre routes de contrôle de mutation documentées sous "Mutation : approbation, outils, init, redémarrage MCP" ci-dessous. Les quatre sont strictement protégées par la gate de mutation de la PR 15 (un démon configuré sans bearer token les rejette avec 401 `token_required`). Les anciens démons renvoient `404` ; pré-vérifiez chaque tag avant d'exposer l'affordance correspondante.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) couvre la surface de budget MCP : les champs `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` sur `GET /workspace/mcp`, le champ `disabledReason` sur les cellules par serveur, et les flags CLI `--mcp-client-budget` / `--mcp-budget-mode`. Les anciens démons omettent entièrement les nouveaux champs ; les clients SDK pré-vérifient ce tag avant de s'appuyer sur la sémantique de `budgets[]`. Le descripteur de registre porte également `modes: ['warn', 'enforce']` pour une future exposition des modes de fonctionnalités — pour l'instant, les clients déduisent le mode du champ `budgetMode` de l'instantané. Le refus du serveur en mode `enforce` est déterministe par l'ordre de déclaration de `Object.entries(mcpServers)` ; une future couche de précédence de scope (si qwen-code en adopte une) déplacerait cela vers "la précédence la plus faible en premier" pour refléter la convention `plugin < user < project < local` de claude-code.

> ⚠️ **Scope de la PR 14 v1 : par session, pas par workspace.** Chaque session ACP à l'intérieur du démon construit sa propre `Config` + `McpClientManager` (via `acpAgent.newSessionConfig`). Les limites de budget plafonnent les clients MCP actifs **par session** ; chaque session lit indépendamment `QWEN_SERVE_MCP_CLIENT_BUDGET` depuis l'env transmis. Avec `--mcp-client-budget=10` et 5 sessions ACP simultanées, le nombre réel de clients MCP actifs peut atteindre 5 × 10 = 50 à travers le démon. L'instantané `GET /workspace/mcp` ne lit que la comptabilité du `McpClientManager` de la **session bootstrap** — la valeur `budgets[0].scope: 'session'` est le signal honnête qu'il s'agit d'une limite par session, et non agrégée. **Wave 5 PR 23 (pool MCP partagé)** introduira un manager à l'échelle du workspace et ajoutera une cellule `scope: 'workspace'` à côté de la cellule par session pour une véritable agrégation inter-sessions. La v1 est la base du compteur in-process + application souple sur laquelle la PR 23 s'appuie.

`workspace_file_read` couvre les routes de fichiers workspace text/list/stat/glob (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` couvre `GET /file/bytes`, qui a été ajouté plus tard afin que les clients puissent pré-vérifier la prise en charge des fenêtres d'octets bruts sur les démons de l'ère PR19. `workspace_file_write` couvre les routes de mutation de texte conscientes des hachages (`POST /file/write`, `POST /file/edit`). Le tag write signifie que le contrat de route existe ; cela ne signifie pas que le déploiement actuel est ouvert aux mutations anonymes. Write/edit sont des routes de mutation strictes et nécessitent un bearer token configuré même en boucle locale.

`daemon_status` annonce `GET /daemon/status`, l'instantané de diagnostic opérateur consolidé en lecture seule documenté ci-dessous.

**Tags conditionnels.** Un petit nombre de tags de fonctionnalités sont annoncés uniquement lorsque le toggle de déploiement correspondant est activé. Présence du tag = le comportement est activé ; absence = soit un démon plus ancien antérieur au tag, SOIT un démon actuel où l'opérateur ne s'est pas inscrit. Actuellement :

| Tag                        | Advertised when …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | le démon a été démarré avec `--require-auth` (ou `requireAuth: true` via l'API intégrée). Le bearer token est obligatoire sur toutes les routes, y compris `/health` sur les liaisons en boucle locale.                                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | le pool de transport MCP partagé est actif. Omis lorsque `QWEN_SERVE_NO_MCP_POOL=1` désactive le pool.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | le pool de transport MCP partagé est actif ; les réponses de redémarrage peuvent inclure des formes multi-entrées conscientes du pool.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Le démon a été démarré avec au moins un `--allow-origin <pattern>` (ou `allowOrigins: [...]` via l'API intégrée). Les requêtes cross-origin provenant d'origins correspondantes reçoivent les en-têtes de réponse CORS appropriés ; les origins non correspondantes reçoivent toujours le 403 par défaut. La liste des patterns configurés n'est intentionnellement PAS renvoyée dans `/capabilities` pour éviter de divulguer l'ensemble des origins de confiance aux lecteurs non authentifiés — le webui du navigateur connaît déjà sa propre origin. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | le démon a été créé avec la persistance des paramètres disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | l'exécution du shell de session est explicitement activée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` est activé.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | la prise en charge du rechargement du workspace est disponible dans la configuration des routes intégrées.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` n'est **pas** dans ce tableau conditionnel — c'est un tag toujours actif, annoncé chaque fois que le binaire prend en charge les nouveaux champs de budget `/workspace/mcp`, que l'opérateur ait configuré un budget ou non. Les opérateurs qui n'ont pas défini `--mcp-client-budget` reçoivent tout de même les nouveaux champs (avec `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) annonce les événements push SSE typés qui signalent les franchissements d'état du budget MCP sans boucle de polling. Deux types de trames arrivent sur `GET /session/:id/events` :

- `mcp_budget_warning` — se déclenche une fois lors du franchissement à la hausse du seuil de 75 % de `reservedSlots.size / clientBudget`. Ne se réarme que lorsque le ratio descend en dessous de 37,5 % (`MCP_BUDGET_REARM_FRACTION`). Reproduit l'hystérésis de `slow_client_warning` de la PR 10, mais au niveau du manager plutôt qu'au niveau du backlog par abonné. Payload : `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Se déclenche dans les modes `warn` et `enforce` ; jamais dans le mode `off`.
- `mcp_child_refused_batch` — se déclenche à la fin de chaque passage de `discoverAllMcpTools*` lorsqu'un ou plusieurs serveurs ont été refusés, ET sous forme d'un batch de longueur 1 sur le chemin de refus de lazy-spawn de `readResource`. Payload : `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` est littéralement `'enforce'` car le mode `warn` ne refuse jamais.

Ces deux événements résident dans l'anneau de relecture SSE par session (ils portent un `id`), de sorte qu'un client se reconnectant avec `Last-Event-ID` reprend à travers eux ; le snapshot sur `GET /workspace/mcp` reste la source de vérité pour l'état après une déconnexion prolongée. Toujours actif une fois annoncé — il n'y a pas de bascule conditionnelle. L'état du reducer SDK (`DaemonSessionViewState`) expose `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` pour les adaptateurs qui souhaitent une interface utilisateur simple de type "lag".

## Routes

### `GET /health`

Sonde de liveness. La forme par défaut renvoie `200 {"status":"ok"}` si le listener est actif — peu coûteux, sans accès au bridge, adapté aux sondes de liveness k8s/Compose à haute fréquence.

Passez `?deep=1` (accepte aussi `?deep=true` ou simplement `?deep`) pour une sonde qui expose les **compteurs** du bridge (à titre informatif uniquement, pas une véritable vérification de liveness) :

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ La sonde profonde (deep probe) est **informative**, pas une véritable vérification de liveness. Elle lit les accesseurs de compteurs (`bridge.sessionCount`, `bridge.pendingPermissionCount`) qui sont de simples getters de taille de Map ; ils ne pinguent pas les processus enfants / canaux individuels et ne détecteront donc pas une session bloquée mais toujours comptabilisée. Utilisez-la pour les tableaux de bord de capacité (concurrence actuelle vs. `--max-sessions`, profondeur de la file d'attente) plutôt que comme déclencheur pour "retirer ce daemon de la rotation". Une réponse `503 {"status":"degraded"}` est théoriquement possible si les getters d'une implémentation de bridge personnalisée lèvent une exception, mais les getters du vrai bridge ne le font jamais — en fonctionnement normal, la sonde profonde renvoie toujours 200. Pour une véritable vérification de liveness, fiez-vous au fait que le listener accepte ou non une connexion TCP (c'est-à-dire le `/health` par défaut sans `?deep`).

**Auth :** requise **uniquement sur les binds non-loopback**. Sur loopback (`127.0.0.1`, `::1`, `[::1]`), `/health` est enregistré avant le middleware bearer, de sorte que les sondes k8s/Compose à l'intérieur du pod n'ont pas besoin de porter le token. Sur non-loopback (`--hostname 0.0.0.0`, etc.), la route est enregistrée après le middleware bearer et renvoie 401 sans token valide — sinon, un appelant non authentifié pourrait sonder des adresses arbitraires pour confirmer l'existence d'un `qwen serve`, une fuite d'informations de faible gravité qui se combine mal avec le scan de ports. Le refus CORS + la liste blanche Host s'appliquent toujours sur l'exemption loopback.

### `GET /daemon/status`

Diagnostics opérateur en lecture seule. Contrairement à `/health`, il s'agit d'une API daemon normale :
elle est enregistrée après l'auth bearer et le rate limiting, y compris sur les binds
loopback. Paramètre de requête :

- `detail=summary` (par défaut) lit uniquement l'état du daemon en mémoire.
- `detail=full` inclut également les diagnostics de session en direct, les diagnostics
  de connexion ACP, les compteurs de device-flow d'authentification et les sections d'état du workspace.
- tout autre `detail` renvoie `400 { "code": "invalid_detail" }`.

`summary` n'interroge intentionnellement pas les méthodes d'état du workspace, ne démarre pas de
child ACP, et ne génère pas de session. `full` interroge chaque section du workspace indépendamment ;
un timeout ou une exception marque uniquement cette section comme `unavailable` et ajoute un
problème `workspace_status_unavailable`.

Réponse :

```json
{
  "v": 1,
  "detail": "summary",
  "generatedAt": "2026-06-16T00:00:00.000Z",
  "status": "ok",
  "issues": [],
  "daemon": {
    "pid": 12345,
    "uptimeMs": 3600000,
    "mode": "http-bridge",
    "workspaceCwd": "/repo",
    "qwenCodeVersion": "0.18.1",
    "daemonId": "serve-..."
  },
  "security": {
    "tokenConfigured": true,
    "requireAuth": false,
    "loopbackBind": true,
    "allowOriginConfigured": false,
    "allowOriginMode": "none",
    "sessionShellCommandEnabled": false
  },
  "limits": {
    "maxSessions": 20,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "promptDeadlineMs": null,
    "writerIdleTimeoutMs": null,
    "channelIdleTimeoutMs": 0,
    "sessionIdleTimeoutMs": 1800000,
    "acpConnectionCap": 64
  },
  "runtime": {
    "sessions": { "active": 0 },
    "permissions": { "pending": 0, "policy": "first-responder" },
    "channel": { "live": false },
    "channelWorker": {
      "enabled": false,
      "state": "disabled",
      "channels": []
    },
    "transport": {
      "restSseActive": 0,
      "acp": {
        "enabled": true,
        "connections": 0,
        "connectionStreams": 0,
        "sessionStreams": 0,
        "sseStreams": 0,
        "wsStreams": 0,
        "pendingClientRequests": 0
      }
    }
  }
}
```

`status` est `error` si un problème a la sévérité error, `warning` si un problème a
la sévérité warning, sinon `ok`. Les codes de problème sont stables et incluent
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`, et
`channel_worker_partial_connect`, ainsi que `workspace_status_unavailable`. Pendant
la courte fenêtre après que le listener est prêt mais avant que le runtime complet ne soit
monté, `/daemon/status` peut signaler `daemon_runtime_starting` ; si le montage
asynchrone du runtime échoue, il signale `daemon_runtime_failed` tandis que les routes
runtime hors statut renvoient `503`.

`runtime.channel.live` signale le canal bridge ACP à l'intérieur du daemon. Ce n'est
pas le worker channel-adapter. Les canaux gérés par le daemon utilisent
`runtime.channelWorker`, dont le `state` est l'un des suivants : `disabled`, `starting`,
`running`, `exited`, `failed`, ou `stopped`. Lorsqu'un worker atteint `running`
puis se termine, `/daemon/status` maintient le daemon en ligne et signale le code de problème warning
`channel_worker_exited`.

Le démarrage du worker de canal géré par le daemon reste fail-fast : si `qwen serve
--channel ...` ne peut pas démarrer un worker qui atteint l'état ready, le démarrage de serve échoue.
Une fois qu'un worker a atteint l'état ready, les arrêts inattendus sont redémarrés par le superviseur
serve dans le cadre d'une politique bornée : jusqu'à 3 tentatives de redémarrage dans une fenêtre de 5 minutes,
avec un backoff de 1s, 5s, puis 15s. Le worker envoie des heartbeats IPC toutes les
15s ; si aucun heartbeat n'est observé pendant 45s, le superviseur considère le worker comme
obsolète (stale), le tue, enregistre `staleHeartbeatAt`, et utilise le même chemin de redémarrage.

`runtime.channelWorker` peut inclure des champs opérationnels additifs :
`requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`,
`restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`,
`lastHeartbeatAt`, et `staleHeartbeatAt`. `restartCount` est le nombre total
de tentatives de redémarrage effectuées par ce processus serve ; un worker en cours d'exécution avec
`restartCount > 0` est sain sauf si un autre problème s'applique. Un worker en cours d'exécution
dont les `requestedChannels` incluent des noms absents de `channels` signale
`channel_worker_partial_connect`.

`qwen channel status` continue de lire les métadonnées du pidfile. Pendant une fenêtre de redémarrage,
le pidfile appartenant à serve reste réservé, mais `workerPid` est omis afin que
les clients n'affichent pas un processus worker obsolète. Les stdout/stderr du worker sont
transférés dans le log du daemon avec les tokens bearer, les valeurs sensibles de l'environnement
du worker, et les identifiants d'URL proxy caviardés.

Sécurité : la réponse n'inclut jamais de tokens bearer, d'ids client, d'ids de connexion ACP
complets, de codes utilisateur device-flow, ni d'URL de vérification. `summary` omet
le chemin du log du daemon ; `full` peut l'inclure pour les opérateurs authentifiés.

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": ["health", "daemon_status", "capabilities", "..."],
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/workspace"
}
```

Contrat stable : lorsque `v` s'incrémente, la disposition de la trame a changé de manière rétro-incompatible.

> **`protocolVersions`** décrit les versions du protocole serve que le daemon peut parler. `current` est la version de protocole préférée du daemon et `supported` est l'ensemble compatible. Les clients qui nécessitent un protocole spécifique doivent vérifier `supported` ; les UI spécifiques à une fonctionnalité doivent toujours se baser sur `features`. Additif à v=1 : les anciens daemons v=1 omettent ce champ, donc les clients SDK qui ciblent d'anciennes builds doivent le traiter comme optionnel.

> **`modelServices` est toujours `[]` dans la Stage 1.** L'agent utilise son unique service de modèle par défaut et ne l'énumère pas sur le réseau. La Stage 2 remplira ce champ à partir des adaptateurs de modèle enregistrés afin que les clients SDK puissent construire des sélecteurs de service ; d'ici là, ne vous fiez PAS au fait que ce champ soit non vide.

> **`workspaceCwd`** est le chemin absolu canonique auquel ce daemon est lié (#3803 §02 — 1 daemon = 1 workspace). Utilisez-le pour (a) détecter les incompatibilités avant de poster `/session` et (b) omettre `cwd` sur `POST /session` (la route retombe sur ce chemin). Les déploiements multi-workspace exposent plusieurs daemons sur différents ports, chacun avec son propre `workspaceCwd`. Additif à v=1 : les daemons v=1 pré-§02 omettent le champ — les clients qui ciblent d'anciennes builds doivent vérifier la nullité avant de le consommer.

### Routes de statut runtime en lecture seule

Ces routes rapportent des snapshots runtime côté daemon. Ce sont des routes v1 additives,
elles ne mutent pas l'état et ne changent pas la version du protocole serve. Les routes
de statut du workspace ne démarrent intentionnellement **pas** le processus child ACP simplement parce qu'
un client interroge une route GET : si le daemon est inactif, elles renvoient
`initialized: false` avec un snapshot vide. Les routes de statut de session nécessitent une
session active et utilisent la forme standard `404 SessionNotFoundError` pour les ids
inconnus.

Tags de capacité :

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

Cellule de statut commune :

```ts
type DaemonStatus =
  | 'ok'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'not_started'
  | 'unknown';

type DaemonErrorKind =
  | 'missing_binary'
  | 'blocked_egress'
  | 'auth_env_error'
  | 'init_timeout'
  | 'protocol_error'
  | 'missing_file'
  | 'parse_error';

interface DaemonStatusCell {
  kind: string;
  status: DaemonStatus;
  error?: string;
  errorKind?: DaemonErrorKind;
  hint?: string;
}
```

`errorKind` est un enum fermé partagé par `/workspace/preflight`,
`/workspace/env`, et (éventuellement) les guardrails MCP afin que les clients SDK puissent afficher
la remédiation par catégorie au lieu d'analyser des messages de forme libre. La PR 13
(#4175) a introduit les sept littéraux listés ci-dessus ; la PR 14 remplira
`blocked_egress` une fois que la sonde egress sera intégrée.

Les payloads de statut n'exposent jamais les valeurs d'env MCP, les en-têtes, les détails
OAuth/compte de service, les clés API des providers, les `baseUrl` / `envKey` des providers, le corps des skills, les
chemins du système de fichiers des skills, les définitions de hooks, ni les valeurs des variables d'environnement
secrètes. `/workspace/env` signale uniquement la **présence** des variables d'env
sur liste blanche ; les URL de proxy sont dépouillées de leurs identifiants et réduites à
`host:port` avant d'être envoyées sur le réseau.

### `GET /workspace/mcp`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "docs",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
      "description": "Documentation server",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` est l'un des suivants : `not_started`, `in_progress`, ou `completed`.
`transport` est l'un des suivants : `stdio`, `sse`, `http`, `websocket`, `sdk`, ou
`unknown`. `errors` est omis lorsque la découverte réussit.

**Guardrails du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Les daemons post-PR-14 étendent le payload avec quatre champs additifs et une cellule au niveau du workspace :

```jsonc
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "clientCount": 3,
  "clientBudget": 2,
  "budgetMode": "enforce",
  "budgets": [
    {
      "kind": "mcp_budget",
      "scope": "session",
      "status": "error",
      "errorKind": "budget_exhausted",
      "hint": "Raise --mcp-client-budget or remove servers from mcpServers config.",
      "liveCount": 2,
      "budget": 2,
      "mode": "enforce",
      "refusedCount": 1,
    },
  ],
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "a",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "b",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "error",
      "name": "c",
      "mcpStatus": "disconnected",
      "transport": "stdio",
      "disabled": false,
      "disabledReason": "budget",
      "errorKind": "budget_exhausted",
      "hint": "...",
    },
  ],
}
```

`budgetMode` est l'un des suivants : `enforce`, `warn`, ou `off`. `clientBudget` est absent lorsqu'aucun budget n'a été défini. `budgets[]` est **toujours un tableau** sur les daemons post-PR-14 (possiblement vide lorsque `budgetMode === 'off'`) ; les daemons pré-PR-14 omettent entièrement le champ. v1 émet une cellule avec `scope: 'session'` (application par session — voir la section des capacités ci-dessus pour savoir pourquoi). Les consommateurs DOIVENT tolérer des entrées `budgets[]` supplémentaires avec des valeurs `scope` non reconnues — la PR 23 de la Wave 5 ajoutera `scope: 'workspace'` (ou `'pool'`) à côté de la cellule par session sans incrémenter le schéma.

`disabledReason` sur les cellules par serveur distingue les serveurs désactivés par l'opérateur (`'config'` — liste de config `disabledMcpServers`) de ceux refusés pour raison de budget (`'budget'` — découverts mais jamais connectés en raison du mode `enforce`). Les refus sont déterministes selon l'ordre de déclaration de `Object.entries(mcpServers)`. Le `status: 'error', errorKind: 'budget_exhausted'` par serveur masque le `mcpStatus: 'disconnected'` brut (qui est vrai mais ne représente pas la sévérité côté opérateur).

L'application du budget dans la PR 14 v1 est **par session, et non par workspace**. Bien que les daemons du Mode B soient `1 daemon = 1 workspace × N sessions` post-#4113 au niveau du processus, le `McpClientManager` est construit à l'intérieur de la `Config` de chaque session ACP via `acpAgent.newSessionConfig`, de sorte que les N sessions appliquent chacune leur propre copie du plafond. Le snapshot représente la vue de la session d'amorçage. La PR 23 de la Wave 5 introduit un pool MCP partagé à l'échelle du workspace qui fait évoluer cela vers une véritable application par workspace.

**Détection de la pression sur le budget.** Deux surfaces, toutes deux peuplées post-PR-14b :

- **Événements push** (annoncés via `mcp_guardrail_events`) : abonnez-vous à `GET /session/:id/events` et filtrez les trames `mcp_budget_warning` / `mcp_child_refused_batch` via `KnownDaemonEvent`. La machine à états se déclenche une fois par franchissement à la hausse du seuil de 75 % (réarmée en dessous de 37,5 %) ; les refus sont regroupés une fois par passage de découverte en mode `enforce`.
- **Sondage de snapshot** (annoncé via `mcp_guardrails`) : `GET /workspace/mcp` et inspectez la cellule de budget par session (`budgets[0]`) :

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (correspond au seuil d'hystérésis que l'événement push de la PR 14b utilisera).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (un ou plusieurs serveurs refusés lors de ce passage de découverte).
- `budgets[0].status === 'ok'` ⇔ en dessous du seuil de 75 % ET aucun refus.

Cadence de sondage recommandée : alignée sur ce qui interroge déjà `/workspace/mcp` ; le snapshot est peu coûteux et la cellule de budget n'entraîne aucun coût de découverte supplémentaire. Les clients SDK qui s'abonnent aux événements push bénéficient tout de même du snapshot pour l'état après une déconnexion prolongée (la profondeur de l'anneau de relecture SSE est finie — `--event-ring-size`, par défaut 8000 — de sorte qu'un client hors ligne plus longtemps que la couverture de l'anneau retombe sur une resynchronisation par snapshot).

### `GET /workspace/skills`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "skills": [
    {
      "kind": "skill",
      "status": "ok",
      "name": "review",
      "description": "Review code",
      "level": "project",
      "modelInvocable": true,
      "argumentHint": "[path]"
    }
  ]
}
```

`level` est l'un des suivants : `project`, `user`, `extension`, ou `bundled`. `errors` est
omis lorsque la découverte réussit.

### `GET /workspace/providers`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "current": { "authType": "qwen", "modelId": "qwen3(qwen)" },
  "providers": [
    {
      "kind": "model_provider",
      "status": "ok",
      "authType": "qwen",
      "current": true,
      "models": [
        {
          "modelId": "qwen3(qwen)",
          "baseModelId": "qwen3",
          "name": "Qwen 3",
          "description": null,
          "contextLimit": 4096,
          "isCurrent": true,
          "isRuntime": false
        }
      ]
    }
  ]
}
```

Les modèles sont regroupés par type d'authentification. Les diagnostics de connexion des providers se trouvent sur
la cellule `providers` de `/workspace/preflight` ; le preflight d'environnement se trouve sur
`/workspace/preflight` et `/workspace/env` (ci-dessous). `errors` est omis
lorsque la construction du snapshot réussit.

### `GET /workspace/env`

Signale le runtime, la plateforme, le sandbox, le proxy du processus daemon, ainsi que la
**présence** des variables d'environnement secrètes sur liste blanche. Répond toujours
à partir de l'état `process.*` — le daemon ne génère jamais de child ACP pour servir
cette route, et la réponse est identique que l'ACP soit actif ou inactif. Le
champ `acpChannelLive` est uniquement informatif.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    { "kind": "runtime", "name": "node", "status": "ok", "value": "22.4.0" },
    { "kind": "platform", "name": "darwin", "status": "ok", "value": "arm64" },
    {
      "kind": "sandbox",
      "name": "SANDBOX",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "proxy",
      "name": "HTTPS_PROXY",
      "status": "ok",
      "present": true,
      "value": "proxy.internal:1080"
    },
    {
      "kind": "proxy",
      "name": "NO_PROXY",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "env_var",
      "name": "OPENAI_API_KEY",
      "status": "ok",
      "present": true
    },
    {
      "kind": "env_var",
      "name": "ANTHROPIC_BASE_URL",
      "status": "disabled",
      "present": false
    }
  ]
}
```

Forme de la cellule :

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value optional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: redacted host
  | 'env_var'; // presence-only; value field is ALWAYS omitted

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```
**Politique de censure.** Les cellules `kind: 'env_var'` n'incluent jamais de champ `value` ; les clients voient uniquement `present: boolean`. Les cellules `kind: 'proxy'` soumettent la valeur brute de la variable d'environnement à la censure des identifiants (`redactProxyCredentials`) puis à l'analyse `URL` afin que le réseau ne transporte que `host:port`. `NO_PROXY` est transmis tel quel à la censure car il s'agit d'une liste d'hôtes et non d'une URL. La liste blanche des variables d'environnement secrètes énumérées inclut actuellement `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` et `QWEN_SERVER_TOKEN`. Les autres variables d'environnement ne sont pas énumérées, de sorte que les secrets définis par accident restent invisibles.

### `GET /workspace/preflight`

Renvoie les vérifications de l'état de préparation du démon. **Les cellules de niveau démon** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) sont toujours renseignées à partir de `process.*` et `node:fs`. **Les cellules de niveau ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) nécessitent un processus enfant ACP actif — lorsque le démon est inactif, elles émettent des placeholders `status: 'not_started'`. La route ne lance jamais ACP uniquement pour renseigner les cellules ; les cellules correspondantes reviennent à `not_started`.

Réponse en état inactif (pas de processus enfant ACP) :

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    {
      "kind": "node_version",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "22.4.0", "required": ">=22" }
    },
    {
      "kind": "cli_entry",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/usr/local/bin/qwen", "source": "process.argv[1]" }
    },
    {
      "kind": "workspace_dir",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/canonical/path" }
    },
    { "kind": "ripgrep", "status": "ok", "locality": "daemon" },
    {
      "kind": "git",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "2.45.0" }
    },
    {
      "kind": "npm",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "10.7.0" }
    },
    {
      "kind": "auth",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "egress probing lands in PR 14 (#4175)"
    }
  ]
}
```

Structure de la cellule :

```ts
type DaemonPreflightKind =
  | 'node_version'
  | 'cli_entry'
  | 'workspace_dir'
  | 'ripgrep'
  | 'git'
  | 'npm'
  | 'auth'
  | 'mcp_discovery'
  | 'skills'
  | 'providers'
  | 'tool_registry'
  | 'egress';

interface DaemonPreflightCell extends DaemonStatusCell {
  kind: DaemonPreflightKind;
  locality: 'daemon' | 'acp';
  detail?: Record<string, unknown>;
}
```

Sémantique de `errorKind` :

- `missing_binary` — Version de Node inférieure à celle requise, `QWEN_CLI_ENTRY` manquant, ripgrep / git / npm absent du PATH (avertissements plutôt qu'erreurs pour les binaires optionnels).
- `missing_file` — `boundWorkspace` n'existe pas ou n'est pas un répertoire ; erreur d'analyse de skill pointant vers un fichier manquant ou illisible.
- `parse_error` — Échec de l'analyse de `SKILL.md`, JSON de configuration malformé.
- `auth_env_error` — `validateAuthMethod` a renvoyé une chaîne d'échec non nulle, ou une sous-classe `ModelConfigError` propagée depuis la résolution du fournisseur.
- `init_timeout` — Rejet de `withTimeout` dans le bridge (un véritable timeout lors de l'attente d'un aller-retour ACP). Reconnu via la classe typée `BridgeTimeoutError`. Remarque : une cellule `warning` transitoire `mcp_discovery` avec `connecting > 0` ne porte PAS ce type — il s'agit d'un état normal de handshake en cours, distinct d'un véritable timeout.
- `protocol_error` — `extMethod` ACP rejeté car le canal s'est fermé au milieu de la requête, ou parce que le registre des outils était absent de manière inattendue.
- `blocked_egress` — réservé pour la PR 14 (#4175). La PR 13 laisse la cellule `egress` avec `status: 'not_started'`.

Si le bridge n'arrive pas à atteindre le processus enfant ACP lors du traitement d'une requête preflight (par ex. une fermeture de canal en cours de requête), le tableau `errors` de l'enveloppe contient un seul `ServeStatusCell` décrivant l'échec et les cellules reviennent à des placeholders ACP `not_started`. Les cellules de niveau démon sont tout de même renvoyées.

### Routes des fichiers du workspace

Tous les chemins de fichiers sont résolus via le workspace lié du démon. Les réponses utilisent des chemins relatifs au workspace et ne renvoient jamais de chemins absolus du système de fichiers pour les cas de succès normaux. Les réponses de fichier réussies incluent :

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Les erreurs de système de fichiers utilisent cette structure JSON :

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

Les valeurs de `errorKind` incluent `path_outside_workspace`, `symlink_escape`, `path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`, `permission_denied`, `parse_error`, `hash_mismatch`, `file_already_exists`, `text_not_found` et `ambiguous_text_match`.

#### `GET /file`

Lit un fichier texte. Paramètres de requête : `path` (requis), `maxBytes`, `line` et `limit`. Le démon rejette les fichiers binaires et les fichiers dépassant la limite de lecture de texte. La réponse inclut `hash`, un condensé SHA-256 sur les octets bruts du disque pour l'ensemble du fichier, même lorsque `line`, `limit` ou `maxBytes` ont renvoyé une tranche.

```json
{
  "kind": "file",
  "path": "src/index.ts",
  "content": "export {};\n",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "sizeBytes": 11,
  "returnedBytes": 11,
  "truncated": false,
  "hash": "sha256:...",
  "matchedIgnore": null,
  "originalLineCount": null
}
```

#### `GET /file/bytes`

Lit les octets bruts d'un fichier sans les décoder. Paramètres de requête : `path` (requis), `offset` (par défaut `0`) et `maxBytes` (par défaut `65536`, max `262144`). Cette route prend en charge des fenêtres bornées sur de gros fichiers binaires sans ingérer le fichier entier. La réponse inclut `hash` uniquement lorsque la fenêtre renvoyée couvre l'intégralité du fichier.

```json
{
  "kind": "file_bytes",
  "path": "assets/logo.png",
  "offset": 0,
  "sizeBytes": 3912,
  "returnedBytes": 3912,
  "truncated": false,
  "contentBase64": "...",
  "hash": "sha256:..."
}
```

#### `POST /file/write`

Crée ou remplace un fichier texte. Il s'agit d'une route de mutation stricte : sur loopback sans token configuré, elle renvoie `401 { "code": "token_required" }`. Avec `--require-auth`, le middleware bearer global rejette les requêtes non authentifiées avant l'exécution de la route.

Corps :

```json
{
  "path": "src/new.ts",
  "content": "export const value = 1;\n",
  "mode": "create"
}
```

```json
{
  "path": "src/existing.ts",
  "content": "export const value = 2;\n",
  "mode": "replace",
  "expectedHash": "sha256:..."
}
```

`mode` doit être `create` ou `replace`. `create` n'écrase jamais un fichier existant (`409 file_already_exists`). `replace` nécessite `expectedHash` ; les hashs manquants ou malformés renvoient `400 parse_error`, et les hashs obsolètes renvoient `409 hash_mismatch`. `expectedHash` est `sha256:` suivi de 64 caractères hexadécimaux minuscules, calculé sur les octets bruts du disque.

`bom`, `encoding` et `lineEnding` peuvent être fournis. Le remplacement préserve par défaut le profil d'encodage du fichier existant ; les champs explicites le remplacent. Les écritures binaires sont hors scope.

Le démon écrit dans un fichier temporaire aléatoire du répertoire cible, effectue un fsync là où c'est pris en charge, revérifie le hash actuel immédiatement avant `rename()`, puis renomme le fichier à sa place finale. Cela empêche l'observation de fichiers partiels et sérialise les écritures provenant du démon vers le même fichier, mais il ne s'agit pas d'un compare-and-swap noyau inter-processus : un éditeur externe peut toujours entrer en compétition dans la minuscule fenêtre entre la vérification finale du hash et le renommage.

```json
{
  "kind": "file_write",
  "path": "src/existing.ts",
  "mode": "replace",
  "created": false,
  "sizeBytes": 24,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

#### `POST /file/edit`

Applique un remplacement de texte exact à un fichier texte existant. Il s'agit également d'une route de mutation stricte qui nécessite `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` doit être non vide et apparaître exactement une fois. Aucune correspondance renvoie `422 text_not_found` ; plusieurs correspondances renvoient `422 ambiguous_text_match`. La route préserve l'encodage, le BOM et les fins de ligne, et revérifie `expectedHash` immédiatement avant le renommage atomique.

Les écritures/modifications explicites vers des chemins ignorés sont autorisées car l'appelant authentifié a nommé le chemin. Les réponses de succès et les événements d'audit incluent `matchedIgnore: "file" | "directory" | null`.

```json
{
  "kind": "file_edit",
  "path": "src/config.ts",
  "replacements": 1,
  "sizeBytes": 128,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

### `GET /session/:id/context`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "state": {
    "models": {},
    "modes": {},
    "configOptions": []
  }
}
```

`state` reflète les mêmes structures de modèle/mode/option de configuration ACP utilisées par `POST /session`, `POST /session/:id/load` et `POST /session/:id/resume`.

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Initialize the project",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands` est le même snapshot de commande utilisé par la notification SSE `available_commands_update`. `availableSkills` liste uniquement les noms des skills ; les clients ne doivent pas s'attendre à recevoir les corps ou les chemins des skills via cette route.

### `GET /session/:id/tasks`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "now": 1700000000000,
  "tasks": [
    {
      "kind": "agent",
      "id": "agent-1",
      "label": "reviewer: check failure",
      "description": "check failure",
      "status": "running",
      "startTime": 1699999999000,
      "runtimeMs": 1000,
      "outputFile": "/tmp/agent-1.jsonl",
      "isBackgrounded": true,
      "subagentType": "reviewer"
    }
  ]
}
```

Cette route est un snapshot hors bande en lecture seule. Elle n'est intentionnellement pas un prompt et peut être interrogée pendant que la session est en cours de streaming. La réponse contient uniquement des métadonnées sur liste blanche provenant des registres de tâches de l'agent, du shell et du moniteur ; les contrôleurs, timers, offsets, messages en attente et objets de registre bruts ne sont jamais exposés.

### `GET /session/:id/lsp`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "enabled": true,
  "configuredServers": 1,
  "readyServers": 1,
  "failedServers": 0,
  "inProgressServers": 0,
  "notStartedServers": 0,
  "servers": [
    {
      "name": "typescript",
      "status": "READY",
      "languages": ["typescript", "javascript"],
      "transport": "stdio",
      "command": "typescript-language-server"
    }
  ]
}
```

`status` est l'un des suivants : `NOT_STARTED`, `IN_PROGRESS`, `READY` ou `FAILED`. Un `error` optionnel est présent sur les serveurs en échec lorsque disponible. Un LSP désactivé (y compris en mode bare) renvoie HTTP 200 avec `enabled: false`, des compteurs à zéro et `servers: []`. Un LSP activé sans serveurs configurés renvoie `enabled: true`, `configuredServers: 0` et `servers: []`. Si l'initialisation échoue avant que le client n'existe, la réponse peut inclure `initializationError` ; si un client actif ne peut pas fournir de snapshot, la réponse inclut `statusUnavailable: true`.

Cette route expose uniquement les champs stables destinés aux clients. Elle omet intentionnellement les détails internes de débogage tels que les ID de processus, les arguments de spawn, les queues de stderr, les URI racine et les chemins des dossiers de workspace.

### `POST /session`

Lance un nouvel agent ou s'attache à un agent existant (sous `sessionScope: 'single'`, la valeur par défaut).

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Champ            | Requis | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | non       | Chemin absolu correspondant au workspace lié du démon. S'il est omis, la route revient à `boundWorkspace` (à lire sur `/capabilities.workspaceCwd`). Un `cwd` non vide et non concordant renvoie `400 workspace_mismatch` (#3803 §02 — 1 démon = 1 workspace). Les chemins du workspace sont canonisés via `realpathSync.native` (avec un fallback resolve-only pour les chemins inexistants) afin que les systèmes de fichiers insensibles à la casse ne rejettent pas les sessions selon leur orthographe.                                                                                                                                                                          |
| `modelServiceId` | non       | Sélectionne le _model service_ configuré par lequel l'agent va router (le fournisseur back-end — Alibaba ModelStudio, OpenRouter, etc). S'il est omis, l'agent utilise celui par défaut. Si le workspace a déjà une session, cela appelle `setSessionModel` sur la session existante et diffuse `model_switched`. À distinguer de `modelId` sur `POST /session/:id/model`, qui sélectionne le modèle **au sein** d'un service déjà lié. Le tableau `modelServices` sur `/capabilities` est réservé à la publicité des services configurés ; dans la Stage 1, il est toujours `[]` (le service par défaut de l'agent est utilisé et non énuméré via HTTP). |
| `sessionScope`   | non       | Override par requête pour le partage de session. `'single'` (la valeur par défaut pour l'ensemble du démon) fait qu'un second `POST /session` pour le même workspace réutilise la session existante (`attached: true`) ; `'thread'` force une nouvelle session distincte à chaque appel. Omettre pour hériter de la valeur par défaut du démon. Les valeurs en dehors de l'enum renvoient `400 { code: 'invalid_session_scope' }`. Les anciens démons (avant la PR 5 de #4175) ignorent silencieusement ce champ — vérifiez `caps.features.session_scope_override` avant l'envoi. La valeur par défaut du démon est codée en dur sur `'single'` en production aujourd'hui ; #4175 pourrait ajouter un flag CLI `--sessionScope` dans un suivi.         |

Réponse :

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` signifie qu'une session pour ce workspace existait déjà et que vous la partagez désormais.

Les appels `POST /session` simultanés pour le même workspace sont **fusionnés** en un seul lancement — les deux appelants obtiennent le même `sessionId`, un seul rapporte `attached: false`. Si le lancement sous-jacent échoue (timeout d'init, sortie d'agent malformée, OOM), **tous les appelants fusionnés reçoivent la même erreur** — l'emplacement en cours est libéré afin qu'un appel ultérieur puisse réessayer depuis le début.

> ⚠️ **Le rejet de `modelServiceId` sur une nouvelle session est silencieux dans la réponse HTTP.** Un mauvais `modelServiceId` (faute de frappe, service non configuré) ne génère PAS une 500 lors de la création — la session reste opérationnelle sur le modèle par défaut de l'agent, de sorte que l'appelant obtient toujours un `sessionId` sur lequel il peut retenter le changement de modèle (via `POST /session/:id/model`). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session, déclenché entre le handshake de lancement et votre premier abonnement. **Les abonnés qui doivent observer cet événement doivent passer `Last-Event-ID: 0` lors de leur premier `GET /session/:id/events`** pour rejouer depuis le plus ancien événement disponible dans l'anneau (couvre le `model_switch_failed` au moment du lancement même si l'abonnement arrive quelques ms après la réponse de création).

### `POST /session/:id/load`

Restaure une session ACP persistée par son id et rejoue son historique via SSE. L'id du chemin fait autorité ; tout champ `sessionId` dans le corps est ignoré. Vérifiez en pre-flight `caps.features.session_load` — les anciens démons renvoient `404` pour cette route.

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Champ | Requis | Notes                                                                                                                                                                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | non       | Mêmes règles de canonisation et de `workspace_mismatch` que pour `POST /session`. Omettre pour hériter de `/capabilities.workspaceCwd`. `mcpServers` n'est intentionnellement PAS accepté ici — le MCP au niveau du démon est piloté par les paramètres (correspond à `POST /session`). |

Réponse :

```json
{
  "sessionId": "persisted-1",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "state": {
    "models": { ... },
    "modes": { ... },
    "configOptions": [ ... ]
  }
}
```

`state` reflète le `LoadSessionResponse` de l'ACP — `models` est un `SessionModelState`, `modes` un `SessionModeState`, `configOptions` un tableau de `SessionConfigOption`. Les champs manquants sont décidés par l'agent. Les abonnés tardifs (les chemins `attached: true` ci-dessous) obtiennent le MÊME snapshot `state` que celui vu par l'appelant de chargement initial — le démon le met en cache à l'entrée ; les mutations d'exécution (par ex. `model_switched`) sont délivrées sur le flux SSE, et non sur les réponses d'attachement ultérieures.

`attached: true` signifie que la session était déjà active (soit suite à un `session/load`/`session/resume` précédent, soit parce qu'un appelant concurrent fusionné a pris l'avance).

**Rejeu de l'historique via SSE.** Pendant que `loadSession` est en cours côté agent, l'agent émet des notifications `session_update` pour chaque tour persisté. Le démon les met en buffer sur l'event-bus de la session avant que la réponse de la route ne soit renvoyée, de sorte que les abonnés qui appellent immédiatement `GET /session/:id/events` avec `Last-Event-ID: 0` voient le rejeu complet. **L'anneau de rejeu est borné** (par défaut 8000 frames par session). Les longs historiques avec de nombreux tours d'appels d'outils / flux de pensées peuvent dépasser cette limite — les frames les plus anciennes sont supprimées silencieusement. Les clients qui ont besoin de l'historique complet doivent s'abonner immédiatement après le retour de `load` ; alternativement, ils peuvent persister les ids d'événements SSE et utiliser `Last-Event-ID` pour reprendre à partir d'une limite de tour ultérieure.

**Erreurs :**

- `404` — l'id de session persistée n'existe pas (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (même structure que `POST /session`).
- `503` — `session_limit_exceeded` (compte dans la limite de `--max-sessions` ; les restaurations en cours sont également prises en compte).
- `409` — `restore_in_progress` (un `session/resume` pour le même id est déjà en cours). `Retry-After: 5`. Les compétitions de même action (deux `session/load` simultanés pour le même id) sont fusionnées — un seul renvoie `attached: false`, les autres renvoient `attached: true` avec le même `state`.
- `409` — `session_archived` lorsque l'id n'existe que sous `chats/archive/` ; appelez `POST /sessions/unarchive` avant `load` ou `resume`.
- `409` — `session_archiving` lorsqu'une archive ou un unarchive est en cours pour le même id. `Retry-After: 5`.
- `409` — `session_conflict` lorsque l'id existe à la fois dans `chats/` et `chats/archive/` ; supprimez la session avec `POST /sessions/delete` avant de la charger.
### `POST /session/:id/resume`

Restaure une session ACP persistée par son identifiant SANS rejouer l'historique via le flux SSE. Le contexte du modèle est restauré en interne côté agent (via `geminiClient.initialize` qui lit `config.getResumedSessionData`) ; le flux SSE reste propre pour les clients qui ont déjà l'historique affiché. Pré-vérification `caps.features.session_resume` ; `unstable_session_resume` reste un alias de compatibilité obsolète pour les anciens clients.

Même forme de requête que `/load`. Même forme de réponse — `state` reflète le `ResumeSessionResponse` d'ACP. Même enveloppe d'erreur, y compris `409 restore_in_progress` (qui se déclenche lorsqu'un `session/load` est en cours ; les courses entre `session/resume` derrière un autre `session/resume` sont fusionnées).

Utilisez `/load` lorsque le client n'a aucun historique affiché (reconnexion à froid, sélecteur → ouverture). Utilisez `/resume` lorsque le client a déjà les tours à l'écran et a seulement besoin de récupérer le handle côté démon.

> ⚠️ **Pourquoi `unstable_session_resume` est-il encore annoncé ?** La route HTTP du démon et la capacité `session_resume` sont stables pour la v1, mais le bridge appelle toujours `connection.unstable_resumeSession` d'ACP. L'ancien tag reste uniquement pour que les SDKs publiés avant `session_resume` puissent continuer à fonctionner.

### `GET /workspace/:id/sessions`

Liste les sessions persistées dont l'espace de travail canonique correspond à `:id` (cwd absolu encodé en URL). La liste par défaut contient les sessions actives de `chats/` ; passez `archiveState=archived` pour lister les sessions archivées de `chats/archive/`. `archiveState=all` n'est pas pris en charge dans la v1.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

Paramètres de requête :

| Field          | Required | Notes                                                                                                   |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `archiveState` | no       | `active` (par défaut) ou `archived`. Toute autre valeur renvoie `400 { code: "invalid_archive_state" }`. |
| `cursor`       | no       | Curseur de pagination de la réponse précédente.                                                         |
| `size`         | no       | Taille de la page. Les valeurs invalides renvoient `400 { code: "invalid_cursor" }` ou la validation de taille de page existante. |

Réponse :

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false,
      "isArchived": false
    }
  ],
  "nextCursor": 1772251200000
}
```

Les listes actives incluent les champs de surcouche du démon en direct tels que `clientCount` et `hasActivePrompt`. Les listes archivées sont uniquement liées au stockage : `isArchived` est `true`, et les champs de surcouche en direct restent absents ou faux. Tableau vide (et non 404) lorsqu'aucune session n'existe — une interface de sélection de session ne devrait pas générer d'erreur simplement parce que l'espace de travail est inactif.

### `POST /sessions/delete`

Supprime définitivement un ou plusieurs fichiers JSONL de session persistée. Le démon ferme d'abord au mieux les sessions en direct, puis supprime le JSONL actif ou archivé. Si des copies actives et archivées existent pour le même identifiant, les deux sont supprimées. Les sidecars du worktree des deux côtés sont nettoyés ; l'historique des fichiers, les transcriptions des sous-agents et les sidecars d'exécution sont intentionnellement préservés.

Requête :

```json
{ "sessionIds": ["<uuid>"] }
```

Réponse :

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

Archive une ou plusieurs sessions. L'archivage est une transition d'état, pas une suppression : le JSONL passe de `chats/<id>.jsonl` à `chats/archive/<id>.jsonl`. L'historique des fichiers, les transcriptions des sous-agents et les sidecars d'exécution restent en place. Si une session est en direct, le démon effectue d'abord une fermeture stricte et exige que le gestionnaire de fermeture de l'agent ACP vide l'enregistrement du chat ; si la fermeture ou le vidage échoue, le JSONL n'est pas déplacé. Pré-vérification `caps.features.session_archive`.

Requête :

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` doit être un tableau de chaînes non vide contenant au maximum 100 identifiants. Les doublons sont fusionnés.

Réponse :

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

Les entrées de `errors` ont la forme `{ "sessionId": "<uuid>", "error": "message" }`. Les fichiers actifs et archivés ayant le même identifiant sont traités comme un conflit et signalés dans `errors` ; aucun fichier n'est écrasé.

### `POST /sessions/unarchive`

Restaure les sessions archivées dans le répertoire actif. Cela ne relance pas la session en soi ; cela déplace uniquement `chats/archive/<id>.jsonl` vers `chats/<id>.jsonl`. Une fois le désarchivage réussi, les clients peuvent appeler `POST /session/:id/load` ou `POST /session/:id/resume`.

Requête :

```json
{ "sessionIds": ["<uuid>"] }
```

Réponse :

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "notFound": [],
  "errors": []
}
```

Si un JSONL actif existe déjà pour l'identifiant, le désarchivage signale un conflit dans `errors` et ne l'écrase pas. Un archivage ou un désarchivage en cours pour le même identifiant renvoie `409 session_archiving` avant de démarrer le lot.

ACP-over-HTTP utilise les mêmes corps de requête et de réponse via les méthodes vendor `_qwen/sessions/archive` et `_qwen/sessions/unarchive`. La table de routes REST mappe `POST /sessions/archive` et `POST /sessions/unarchive` à ces méthodes pour les transports ACP.

### `POST /session/:id/prompt`

Transmet un prompt à l'agent. Les appelants multi-prompts mettent en file d'attente FIFO par session (ACP garantit un seul prompt actif par session).

Requête :

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Validation : `prompt` doit être un tableau d'objets non vide. Les autres échecs renvoient `400` avant d'atteindre le bridge.

Réponse :

```json
{ "stopReason": "end_turn" }
```

Autres raisons d'arrêt : `cancelled`, `max_tokens`, `error`, `length` (selon la spécification ACP).

Si le client HTTP se déconnecte au milieu du prompt, le démon envoie une notification ACP `cancel` à l'agent, qui termine le prompt avec `stopReason: "cancelled"`.

> **Limitation de la phase 1 — pas de délai d'expiration du prompt côté serveur.** Le bridge met uniquement en concurrence le `prompt()` de l'agent avec `transportClosedReject` (le crash du processus enfant de l'agent) et l'AbortSignal de déconnexion HTTP de l'appelant. Un agent bloqué mais vivant (par ex. un appel de modèle qui reste bloqué) bloque la FIFO par session jusqu'à ce que le client HTTP expire de son côté et se déconnecte. Les prompts de longue durée sont légitimes (recherche approfondie, analyse de grands dépôts de code), c'est pourquoi aucun délai par défaut n'est délibérément défini ; la phase 2 exposera une option configurable `promptTimeoutMs`. En attendant, les appelants doivent définir leur propre délai d'expiration côté client et se déconnecter (ou appeler `POST /session/:id/cancel`) à l'expiration.

### `POST /session/:id/cancel`

Annule le prompt **actuellement actif** sur la session. Côté ACP, il s'agit d'une notification, pas d'une requête — l'agent accuse réception en résolvant le `prompt()` actif avec `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrat multi-prompts :** l'annulation n'affecte que le prompt actif. Tous les prompts que le même client a précédemment envoyés via POST et qui sont toujours en file d'attente derrière le prompt actif continueront de s'exécuter. La mise en file d'attente multi-prompts est un comportement introduit par le démon (non présent dans la spécification ACP) ; le contrat pour les prompts en file d'attente est "ils continuent de s'exécuter sauf si vous les annulez un par un, ou si vous tuez la session via la sortie du canal".

### `DELETE /session/:id`

Ferme explicitement une session en direct. Force la fermeture même si d'autres clients sont attachés — annule tout prompt actif, résout les autorisations en attente comme annulées, publie l'événement `session_closed`, ferme l'EventBus et supprime la session des maps du démon. Les sessions persistées sur disque ne sont PAS supprimées — elles peuvent être rechargées via `POST /session/:id/load`. Pré-vérification `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent : renvoie `404` pour les sessions inconnues (même forme `SessionNotFoundError` que les autres routes).

> **Événement `session_closed`.** Les abonnés SSE reçoivent un événement terminal `session_closed` avec `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` avant la fin du flux. Les réducteurs SDK traitent cela de manière identique à `session_died` (définit `alive: false`, efface `pendingPermissions`).

### `PATCH /session/:id/metadata`

Met à jour les métadonnées mutables de la session. Ne prend actuellement en charge que `displayName`. Pré-vérification `caps.features.session_metadata`.

Requête :

```json
{ "displayName": "My Investigation Session" }
```

| Field         | Required | Notes                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | no       | Chaîne, max 256 caractères. Une chaîne vide efface le nom. Omettre pour laisser tel quel. |

Réponse :

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publie un événement `session_metadata_updated` sur le flux SSE de la session avec `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Met à jour la comptabilité de dernière vue du démon pour cette session. Les adaptateurs de longue durée (TUI/IDE/web) envoient un ping à intervalle régulier afin que la future politique de révocation (Wave 5 PR 24) puisse distinguer les clients morts des clients silencieux.

En-têtes :

| Header             | Required | Notes                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | no       | Renvoie l'identifiant émis par le démon depuis `POST /session`. Les clients identifiés mettent également à jour leur horodatage par client ; les heartbeats anonymes mettent uniquement à jour le filigrane par session. Doit satisfaire la même forme `[A-Za-z0-9._:-]{1,128}` qu'ailleurs. |

Le corps de la requête est vide (`{}` convient — aucun champ n'est lu aujourd'hui).

Réponse :

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` est renvoyé uniquement lorsqu'un `X-Qwen-Client-Id` de confiance a été fourni. `lastSeenAt` est l'époque `Date.now()` (ms) côté démon que le bridge a stockée.

Erreurs :

- `400` — `{ code: 'invalid_client_id' }` lorsque l'en-tête est malformé (règle de forme de l'en-tête) ou lorsqu'il contient un `clientId` qui n'est pas enregistré pour cette session (le bridge lève `InvalidClientIdError` avant de mettre à jour un quelconque horodatage).
- `404` — session inconnue.

Filtrage par capacité : pré-vérification `caps.features.client_heartbeat`. Les anciens démons renvoient `404` pour ce chemin.

### `POST /session/:id/model`

Bascule le modèle actif **au sein** du service de modèle actuellement lié à la session. Sérialisé via la file d'attente de changement de modèle par session.

(Pour changer le _service_ lui-même — Alibaba ModelStudio vs OpenRouter, etc. — passez `modelServiceId` sur `POST /session` pour une nouvelle session. La phase 1 n'a pas de route de changement de service en direct.)

Requête :

```json
{ "modelId": "qwen-staging" }
```

Réponse :

```json
{ "modelId": "qwen-staging" }
```

En cas de succès, publie `model_switched` sur le flux SSE. En cas d'échec, publie `model_switch_failed` (afin que les abonnés passifs voient l'échec, et pas seulement l'appelant). Met en concurrence la sortie du canal de l'agent afin qu'un processus enfant bloqué ne puisse pas bloquer le gestionnaire HTTP.

### `POST /session/:id/recap`

Tag de capacité : `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Génère un résumé en une phrase de type "où en étais-je" de la session. Enveloppe le `generateSessionRecap` du core (`packages/core/src/services/sessionRecap.ts`), qui exécute une requête secondaire sur le modèle rapide avec les outils désactivés, `maxOutputTokens: 300`, et un format de sortie strict `<recap>...</recap>`. La requête secondaire lit l'historique de chat GeminiClient existant de la session et ne l'augmente **pas**.

Le corps de la requête est ignoré (envoyez `{}` ou vide). Porte de mutation non stricte — la posture reflète `/session/:id/prompt` (l'appel coûte des tokens mais ne mute aucun état). Aucun événement SSE n'est publié.

Réponse (200) :

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` est `null` (un 200 normal, pas une erreur) lorsque :

- la session a moins de deux tours de dialogue pour l'instant,
- la requête secondaire n'a renvoyé aucune charge utile `<recap>...</recap>` extractible,
- ou qu'une erreur de modèle sous-jacente s'est produite (l'assistant du core fait au mieux et ne lève jamais d'exception).

Erreurs :

- `400 {code: 'invalid_client_id'}` — en-tête `X-Qwen-Client-Id` malformé.
- `404` — session inconnue.

Annulation : **aucune dans la v1**. La route n'écoute pas la déconnexion du client HTTP, aucun `AbortSignal` n'est intégré au bridge, et le processus enfant ACP exécute la requête secondaire jusqu'au bout, que l'appelant se soit déconnecté ou non. Les seules limites sont le délai de secours de 60s du bridge (`SESSION_RECAP_TIMEOUT_MS`) et la concurrence de fermeture du transport contre la mort du canal ACP. C'est acceptable car le récapitulatif est court (tentative unique, `maxOutputTokens: 300`, ~1 à 5s en général) ; une ext-method d'annulation basée sur un identifiant de requête peut intégrer une annulation de bout en bout complète dans une future version si le coût en bande passante le justifie un jour.

### Mutation : approval, tools, init, redémarrage MCP

L'issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 ajoute quatre routes de contrôle de mutation qui permettent aux clients distants de modifier la posture d'exécution sans toucher au CLI de l'hôte du démon. Les quatre :

- Sont filtrées par la porte de mutation **stricte** de la PR 15. Un démon configuré sans bearer token les rejette avec `401 {code: 'token_required'}`. Configurez `--token` (ou `QWEN_SERVER_TOKEN`) avant d'opter pour cette fonctionnalité.
- Acceptent et estampillent l'en-tête `X-Qwen-Client-Id` (chaîne d'audit PR 7). Lorsque l'en-tête contient un identifiant de confiance, le démon émet `originatorClientId` sur l'événement SSE correspondant afin que les interfaces utilisateur multi-clients puissent supprimer les échos de leurs propres mutations.
- Effectuent une pré-vérification de chaque capacité par tag avant d'exposer la fonctionnalité. Les anciens démons renvoient `404` pour la route.

Trois des quatre routes (`tools/:name/enable`, `init`, `mcp/:server/restart`) émettent des événements **à l'échelle de l'espace de travail** : chaque bus SSE de session active reçoit l'événement, quelle que soit la session attachée lorsque la mutation a été déclenchée. `approval-mode` émet un événement **à l'échelle de la session** car le changement est local au `Config` d'une seule session.

#### `POST /session/:id/approval-mode`

Tag de capacité : `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Change le mode d'approbation d'une session en direct. Le nouveau mode est appliqué immédiatement dans le `Config` par session du processus enfant ACP. Les paramètres ne sont PAS écrits sur le disque par défaut — passez `persist: true` pour écrire également `tools.approvalMode` dans les paramètres de l'espace de travail.

Requête :

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` doit être l'un des suivants : `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (miroir de l'enum `ApprovalMode` du core ; le SDK exporte `DAEMON_APPROVAL_MODES` pour la validation à l'exécution). `persist` est par défaut à `false`.

Réponse (200) :

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Erreurs :

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — littéral de mode inconnu.
- `400 {code: 'invalid_persist_flag'}` — `persist` n'est pas un booléen.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — le mode demandé nécessite un dossier de confiance (les modes privilégiés dans les espaces de travail non fiables sont rejetés par `Config.setApprovalMode` du core).
- `404` — session inconnue.

Événement SSE (à l'échelle de la session) : `approval_mode_changed` avec `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Tag de capacité : `workspace_tool_toggle`. E/S de fichiers pures — pas d'aller-retour ACP.

Bascule un nom d'outil dans la liste de paramètres `tools.disabled` de l'espace de travail. Les outils listés ici ne sont **pas enregistrés** du tout (contrairement à `permissions.deny`, qui garde l'outil enregistré et rejette l'invocation). Les outils intégrés et les outils découverts par MCP passent tous par `ToolRegistry.registerTool`, qui consulte l'ensemble désactivé.

> ⚠️ **Les noms doivent correspondre exactement à l'identifiant exposé par le registre.** Aucune résolution d'alias n'est effectuée — la route stocke n'importe quelle chaîne dans le paramètre de chemin dans `tools.disabled`, et le prochain processus enfant ACP compare avec `tool.name` au moment de l'enregistrement. Les outils intégrés utilisent leur nom de registre canonique (forme verbale en snake_case) : `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — et NON les libellés d'affichage (`Shell`, `Read`, `Write`) que le CLI affiche. Les outils découverts par MCP utilisent la forme qualifiée `mcp__<server>__<name>` (qui est également la forme diffusée par les événements `tool_toggled` et ce que liste `GET /workspace/mcp`). Désactiver `Bash` n'empêchera PAS `run_shell_command` de s'enregistrer lors de la prochaine session.

Les processus enfants ACP en direct conservent les outils déjà enregistrés — le basculement prend effet sur le **prochain** spawn de processus enfant ACP. Combinez avec `POST /workspace/mcp/:server/restart` (pour les outils provenant de MCP) ou la création d'une nouvelle session pour rendre le changement effectif dans le démon actuel.

Les noms d'outils inconnus sont acceptés : la pré-désactivation d'un outil MCP pas encore installé est un cas d'usage légitime.

Requête :

```json
{ "enabled": false }
```

Réponse (200) :

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Erreurs :

- `400 {code: 'invalid_tool_name'}` — paramètre de chemin vide, ou le paramètre de chemin dépasse la limite de 256 caractères.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` manquant ou non booléen.

Événement SSE (à l'échelle de l'espace de travail) : `tool_toggled` avec `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Tag de capacité : `workspace_init`. E/S de fichiers pures — pas d'aller-retour ACP, **aucune invocation de LLM**.

Crée un `QWEN.md` vide (ou ce que `getCurrentGeminiMdFilename()` renvoie sous les overrides de `--memory-file-name`) à la racine de l'espace de travail lié au démon. Purement mécanique — pour un remplissage de contenu piloté par l'IA, enchaînez avec `POST /session/:id/prompt`.

Par défaut, refuse d'écraser lorsque le fichier cible existe avec du contenu autre que des espaces. Les fichiers ne contenant que des espaces sont traités comme absents (correspond à la commande slash locale `/init`).

Requête :

```json
{ "force": false }
```

Réponse (200) :

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` est `'created'` pour les nouvelles créations, `'noop'` lorsqu'un fichier existant ne contenant que des espaces a été laissé intact (aucune écriture effectuée), et `'overwrote'` lorsque `force: true` a remplacé du contenu non vide. L'événement SSE `workspace_initialized` reflète l'action de la réponse — les observateurs peuvent filtrer avec `action !== 'noop'` pour réagir uniquement aux changements réels sur le disque.

Erreurs :

- `400 {code: 'invalid_force_flag'}` — `force` n'est pas un booléen.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — le fichier existe avec du contenu autre que des espaces et `force` est omis ou faux. Le corps contient le chemin absolu et la taille (en octets) afin que les clients SDK puissent afficher une invite "écraser N octets ?" sans avoir à refaire un stat.

Événement SSE (à l'échelle de l'espace de travail) : `workspace_initialized` avec `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Tag de capacité : `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Redémarre un serveur MCP configuré via le `McpClientManager.discoverMcpToolsForServer` du processus enfant ACP (déconnexion + reconnexion + redécouverte). Pré-vérifie l'instantané du budget en direct de la comptabilité de la PR 14 v1 afin qu'un redémarrage sur un espace de travail ayant atteint la limite du budget renvoie un refus doux plutôt que de déclencher une cascade de `BudgetExhaustedError`.
Le corps de la requête est vide (`{}`). Le paramètre de chemin est le nom du serveur encodé en URL tel qu'il apparaît dans la configuration `mcpServers`.

Réponse (200) — union discriminée sur `restarted` :

```json
{ "serverName": "docs", "restarted": true, "durationMs": 1234 }
```

```json
{
  "serverName": "docs",
  "restarted": false,
  "skipped": true,
  "reason": "budget_would_exceed"
}
```

Raisons de soft skip (toutes retournent 200) :

| `reason`                | Meaning                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Une autre découverte / redémarrage pour ce serveur est déjà en cours. La route retourne immédiatement au lieu d'attendre la promesse originale. L'appelant doit réessayer après un court délai. |
| `'disabled'`            | Le serveur est configuré mais listé dans `excludedMcpServers`. Réactivez-le avant le redémarrage.                                                                                                    |
| `'budget_would_exceed'` | Le démon est en `--mcp-budget-mode=enforce`, le serveur cible n'est pas actuellement dans `reservedSlots`, et le total en direct a atteint `clientBudget`. L'appelant doit d'abord libérer un slot.         |

Erreurs (non-2xx) :

- `400 {code: 'invalid_server_name'}` — paramètre de chemin vide.
- `404` — nom de serveur absent de la configuration `mcpServers`, ou aucun canal ACP actif n'existe (le redémarrage nécessite intrinsèquement une instance `McpClientManager` active).
- `500` — erreur interne (ex. `ToolRegistry` non initialisé).

Événements SSE (à l'échelle du workspace) : `mcp_server_restarted` avec `{serverName, durationMs, originatorClientId?}` en cas de succès ; `mcp_server_restart_refused` avec `{serverName, reason, originatorClientId?}` en cas de soft skip.

### `GET /session/:id/events` (SSE)

S'abonner au flux d'événements de la session.

En-têtes :

```
Accept: text/event-stream
Last-Event-ID: 42        ← optionnel, rejoue à partir de l'id 42
```

Paramètres de requête (query params) :

| Param       | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maxQueued` | no       | Limite de **backlog en direct** par abonné. Plage `[16, 2048]`, 256 par défaut. Les trames de rejeu (replay) poussées de force au moment de l'abonnement sont exemptées de cette limite ; ce qui la consomme réellement, ce sont les événements en direct qui arrivent pendant que l'abonné est encore en train de drainer un important rejeu `Last-Event-ID: 0`. Augmentez cette valeur pour les reconnexions à froid afin que le flux en direct ne déclenche pas l'avertissement / l'éviction de client lent avant que le consommateur ne soit à jour. Les valeurs hors plage / non décimales / présentes mais vides retournent `400 invalid_max_queued` avant l'ouverture du handshake SSE. Pré-vérification `caps.features.slow_client_warning` — les anciens démons ignorent silencieusement ce paramètre. |

Format de trame. La ligne `data:` est l'**enveloppe d'événement complète**, sérialisée en JSON sur une seule ligne — `{id?, v, type, data, originatorClientId?}`. La charge utile spécifique à l'ACP (`sessionUpdate`, arguments de `requestPermission`, etc.) se trouve sous le champ `data` de l'enveloppe ; le `type` propre à l'enveloppe correspond à la ligne SSE `event:`.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← toutes les 15s, pas de charge utile

event: client_evicted    ← trame terminale, pas d'id (synthétique)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

Les lignes `id:` / `event:` au niveau SSE dupliquent `envelope.id` / `envelope.type` pour la compatibilité avec EventSource. Les consommateurs utilisant `fetch` brut (comme `parseSseStream` du SDK) lisent tout depuis l'enveloppe JSON et ignorent les lignes de préambule SSE.

| Event type                | Trigger                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `session_update`          | Toute notification ACP `sessionUpdate` (morceaux LLM, appels d'outils, utilisation)                                                                                                                                                                                                                                                     |
| `permission_request`      | L'agent a demandé une approbation d'outil                                                                                                                                                                                                                                                                                            |
| `permission_resolved`     | Un client a voté pour une permission via `POST /permission/:requestId`                                                                                                                                                                                                                                                      |
| `permission_partial_vote` | (consensus uniquement) Un vote a été enregistré mais le quorum n'est pas encore atteint. Contient `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pré-vérification `caps.features.permission_mediation`.                                                                                                                   |
| `permission_forbidden`    | Un vote a été rejeté par la politique active (incompatibilité `designated`, `local-only` non-loopback, ou votant `consensus` absent du snapshot). Contient `{requestId, sessionId, clientId?, reason}`. Pré-vérification `caps.features.permission_mediation`.                                                                                 |
| `model_switched`          | `POST /session/:id/model` a réussi                                                                                                                                                                                                                                                                                      |
| `model_switch_failed`     | `POST /session/:id/model` a été rejeté                                                                                                                                                                                                                                                                                       |
| `session_died`            | Le processus enfant de l'agent a crashé de manière inattendue. **Terminal : le flux SSE se ferme après cette trame ; la session est supprimée de `byId`.** Les abonnés doivent se reconnecter via `POST /session` pour en créer une nouvelle.                                                                                                                              |
| `slow_client_warning`     | Local à l'abonné : file d'attente ≥ 75% pleine. **Non-terminal** — le flux continue ; l'avertissement est une alerte avant l'éviction. Contient `{queueSize, maxQueued, lastEventId}`. Se déclenche UNE SEULE FOIS par épisode de débordement ; se réarme après que la file d'attente est redescendue sous les 37,5%. Pas de `id` (synthétique). Pré-vérification `caps.features.slow_client_warning`. |
| `client_evicted`          | Local à l'abonné : débordement de la file d'attente. **Terminal : le flux SSE se ferme après cette trame** (pas de `id` — synthétique). Les autres abonnés sur la même session continuent.                                                                                                                                                                |
| `stream_error`            | Erreur côté démon lors de la diffusion (fan-out). **Terminal : le flux SSE se ferme après cette trame** (pas de `id` — synthétique).                                                                                                                                                                                                                |

Sémantique de reconnexion :

- Envoyez `Last-Event-ID: <n>` pour rejouer les événements avec `id > n` depuis l'anneau (ring) par session (profondeur par défaut **8000**, ajustable via `qwen serve --event-ring-size <n>`)
- **Détection de lacunes (côté client) :** si `<n>` est antérieur à l'événement le plus ancien encore présent dans l'anneau (ex. vous vous reconnectez avec `Last-Event-ID: 50` mais l'anneau contient maintenant 200–1199), le démon rejoue depuis l'événement le plus ancien disponible sans lever d'erreur. Comparez l'`id` du premier événement rejoué avec `n + 1` ; toute différence correspond à la taille de la fenêtre perdue. L'étape 2 (Stage 2) injectera une trame synthétique explicite `stream_gap` côté démon ; à l'étape 1 (Stage 1), la détection est de la responsabilité du client.
- Les IDs sont monotones par session, en commençant à 1
- Les trames synthétiques (`client_evicted`, `slow_client_warning`, `stream_error`) omettent intentionnellement l'`id` afin de ne pas consommer un emplacement de séquence pour les autres abonnés

Contre-pression (Backpressure) :

- La file d'attente par abonné est par défaut à `maxQueued: 256` éléments en direct (les trames de rejeu lors de la reconnexion contournent cette limite). Remplacez cette valeur via `?maxQueued=N` (plage `[16, 2048]`) sur la requête SSE.
- Lorsque la file d'attente d'un abonné dépasse 75% de remplissage, le bus pousse de force une trame synthétique `slow_client_warning` à cet abonné (une fois par épisode de débordement ; réarmé après redescende sous 37,5%). Le flux reste ouvert — l'avertissement sert d'alerte pour que le client puisse drainer plus vite ou se détacher et se reconnecter proprement.
- Si la file d'attente déborde réellement après l'avertissement, le bus émet la trame terminale `client_evicted` et ferme l'abonnement.

### `POST /permission/:requestId`

Votez sur une `permission_request` en attente. La **politique de médiation** active décide qui l'emporte :

| Policy                      | Behavior                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (default) | Tout votant validé l'emporte ; les votants ultérieurs reçoivent `404`. Ligne de base pré-F3.                                                                                                                                    |
| `designated`                | Seul l'origineur du prompt (`originatorClientId`) décide ; les non-origineurs reçoivent `403 permission_forbidden / designated_mismatch`. Bascule sur first-responder pour les prompts anonymes.                 |
| `consensus`                 | N votants sur M doivent être d'accord (par défaut `N = floor(M/2) + 1`, modifiable via `policy.consensusQuorum`). La première option atteignant `N` l'emporte. Les votes non résolutifs reçoivent `200` + des trames SSE `permission_partial_vote`. |
| `local-only`                | Seuls les votants en loopback décident ; les appelants distants reçoivent `403 permission_forbidden / remote_not_allowed`.                                                                                                      |

La politique active est configurée dans `settings.json` sous `policy.permissionStrategy` et exposée sur `/capabilities` à `body.policy.permission`. Pré-vérification `caps.features.permission_mediation` (avec `modes: [...]`) pour l'ensemble pris en charge par la build.

> **F3 (#4175) : coordination des permissions multi-clients.** F3 a ajouté les quatre politiques ci-dessus. Les démons pré-F3 avaient first-responder en dur ; le format sur le fil (wire shape) reste strictement identique bit pour bit lorsque la politique configurée est `first-responder`. Les nouveaux événements (`permission_partial_vote`, `permission_forbidden`) sont additifs — les anciens SDK les voient comme `unrecognized_known_event` et les ignorent gracieusement.

> **Délai d'expiration des permissions (5 minutes par défaut).** Une `permission_request`
> reste en attente jusqu'à ce que : (a) un client vote ici, (b) `POST /session/:id/cancel`
> soit déclenché, (c) le client HTTP qui pilote le prompt se déconnecte
> (l'annulation en cours de prompt résout les permissions en attente comme `cancelled`),
> (d) la session soit tuée, (e) le démon s'arrête, **ou
> (f) le délai d'expiration des permissions par session se déclenche** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 minutes). Lors du déclenchement du délai, le `requestPermission` de l'agent se résout
> en `{outcome: 'cancelled'}`, l'anneau d'audit enregistre une
> entrée `permission.timeout`, la sortie stderr du démon émet un fil d'Ariane d'une ligne,
> et le bus SSE diffuse la trame standard
> `permission_resolved` annulée afin que les abonnés nettoient leurs états. Le
> délai est configurable via `BridgeOptions.permissionResponseTimeoutMs` ;
> les appelants headless exécutant des prompts de longue durée peuvent souhaiter l'étendre.

Requête :

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Résultats (Outcomes) :

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — accepter / rejeter / procéder une fois / etc., selon les choix proposés par l'agent
- `{ "outcome": "cancelled" }` — abandonner la requête (correspond à ce que font `cancelSession` / `shutdown` en interne)

Réponse :

- `200 {}` — votre vote a été accepté (résolu OU enregistré sous le quorum de consensus)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3 : la politique active a rejeté votre vote
- `404 { "error": "..." }` — le requestId est inconnu (déjà résolu, n'a jamais existé, ou session démantelée)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3 : les `allowedOptionIds` de l'agent contiennent le sentinel réservé `'__cancelled__'` ; violation du contrat agent / démon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 compatibilité ascendante (forward-compat) : un littéral de politique a atterri dans le schéma mais sa branche de médiateur n'est pas encore construite (actuellement inatteignable ; réservé pour les politiques futures)

Après un vote réussi, chaque client connecté voit `permission_resolved` avec le même `requestId` et l'`outcome` choisi. Sous `consensus`, les votes intermédiaires diffusent également `permission_partial_vote` jusqu'à l'obtention du quorum.

### Routes Auth device-flow (issue #4175 PR 21)

Le démon sert d'intermédiaire pour un OAuth 2.0 Device Authorization Grant (RFC 8628) afin qu'un client SDK distant puisse déclencher une connexion dont les jetons (tokens) atterrissent sur le système de fichiers du **démon** — et non sur celui du client. Le démon interroge (poll) lui-même le IdP ; le seul rôle du client est d'afficher l'URL de vérification + le code utilisateur et (optionnellement) de s'abonner au SSE pour les événements de fin.

Tag de capacité : `auth_device_flow` (toujours annoncé). Fournisseurs pris en charge dans la v1 : `qwen-oauth`.

> [!note]
>
> L'offre gratuite Qwen OAuth a été interrompue le 15 avril 2026. Considérez `qwen-oauth` comme l'identifiant de fournisseur v1 hérité dans ce protocole ; les nouveaux clients devraient préférer un fournisseur d'authentification actuellement pris en charge lorsqu'il y en a un de disponible.

**Localité d'exécution.** Le démon ne lance jamais de navigateur — même s'il le peut. Le client décide d'appeler ou non `open(verificationUri)` localement ; sur un pod headless (le déploiement canonique Mode B), l'utilisateur ouvre l'URL sur n'importe quel appareil disposant d'un navigateur. Consultez `docs/users/qwen-serve.md` pour l'UX recommandée.

**Aucune fuite de jeton dans les événements.** `auth_device_flow_started` ne contient que `{deviceFlowId, providerId, expiresAt}`. Le code utilisateur et l'URL de vérification sont renvoyés point à point dans le corps de la réponse POST 201 et via `GET /workspace/auth/device-flow/:id` ; ils ne sont jamais diffusés sur le SSE.

**Singleton par fournisseur.** Un second `POST` pour le même fournisseur alors qu'un flux est en attente constitue une prise de contrôle idempotente — il retourne l'entrée existante avec `attached: true` au lieu de démarrer une nouvelle requête vers le IdP.

#### `POST /workspace/auth/device-flow`

Porte de mutation stricte : nécessite un bearer token même sur les configurations loopback sans token par défaut (`401 token_required`).

Requête :

```json
{ "providerId": "qwen-oauth" }
```

Réponse (`201` nouveau démarrage, `200` prise de contrôle idempotente) :

```json
{
  "deviceFlowId": "fa07c61b-…",
  "providerId": "qwen-oauth",
  "status": "pending",
  "userCode": "USER-1",
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

Erreurs :

- `400 unsupported_provider` — `providerId` inconnu (la réponse inclut `supportedProviders`)
- `409 too_many_active_flows` — limite du workspace (4) atteinte ; annulez-en un avec `DELETE`
- `401 token_required` — la porte stricte a refusé une requête sans token
- `502 upstream_error` — le IdP a retourné une erreur inattendue

#### `GET /workspace/auth/device-flow/:id`

Lit l'état actuel. Les entrées en attente renvoient en écho `userCode/verificationUri/expiresAt/intervalMs` ; les entrées terminales (délai de grâce de 5 min) les suppriment et affichent `status` + `errorKind/hint` optionnels.

Retourne `404 device_flow_not_found` pour les IDs inconnus et les entrées évincées après le délai de grâce.

#### `DELETE /workspace/auth/device-flow/:id`

Annulation idempotente :

- entrée en attente → `204` + émission de `auth_device_flow_cancelled`
- entrée terminale → `204` opération vide (pas de réémission d'événement)
- ID inconnu → `404`

#### `GET /workspace/auth/status`

Instantané (snapshot) des flux en attente + fournisseurs pris en charge :

```json
{
  "v": 1,
  "workspaceCwd": "/work/bound",
  "providers": [],
  "pendingDeviceFlows": [
    {
      "deviceFlowId": "fa07c61b-…",
      "providerId": "qwen-oauth",
      "expiresAt": 1700000600000
    }
  ],
  "supportedDeviceFlowProviders": ["qwen-oauth"]
}
```

#### Événements SSE du Device-flow

Cinq événements typés (à l'échelle du workspace, diffusés sur chaque bus de session actif) :

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST réussi ; le SDK doit s'abonner (pas de userCode ici, récupérez-le via GET si nécessaire)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — le démon a honoré le `slow_down` upstream ; les clients qui pollent GET doivent augmenter leur intervalle pour correspondre
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — identifiants persistés ; `accountAlias` est un label non-PII (jamais d'email/téléphone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal ; `errorKind` est l'un des suivants : `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` est interne au démon : l'échange avec le IdP a réussi mais le démon n'a pas pu stocker les identifiants de manière durable (EACCES / EROFS / ENOSPC). L'utilisateur doit réessayer une fois que le problème de disque sous-jacent est résolu.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE réussi sur une entrée en attente
> **Non compatible MCP.** La spécification d'autorisation MCP (2025-06-18) impose OAuth 2.1 + PKCE auth-code avec un callback de redirection, ce qui ne fonctionne pas pour les daemons de pods headless. La surface device-flow du Mode B est privée au daemon — les clients ciblant des serveurs conformes à MCP doivent utiliser un autre chemin d'authentification.

## Format du flux

Les événements sont émis sous forme de trames EventSource standard. Le daemon écrit une ligne `data:` par trame (le JSON n'a pas de sauts de ligne intégrés après `JSON.stringify`) ; le parseur SDK dans `packages/sdk-typescript/src/daemon/sse.ts` gère à la fois cela et la forme multi-`data:` autorisée par la spécification côté réception.

## Trames d'erreur lors du streaming

Si l'itérateur du bridge lève une exception lors du service d'un abonné SSE, le daemon émet une trame terminale `stream_error` (sans `id`). La ligne `data:` est l'enveloppe complète (même forme que toutes les autres trames SSE dans ce document) ; le message d'erreur réel se trouve sous `envelope.data.error` :

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

La connexion se ferme ensuite.

## Variables d'environnement

| Var                 | Objectif                                                       |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Token Bearer. Les espaces en début et fin de chaîne sont supprimés au démarrage. |

## Structure du code source

| Chemin                                               | Objectif                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | Commande yargs + schéma de flags                                                                         |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Cycle de vie du listener + gestion des signaux                                                           |
| `packages/cli/src/serve/server.ts`                   | Assemblage de l'app Express, ordre des middlewares et routes directes restantes                          |
| `packages/cli/src/serve/routes/*.ts`                 | Groupes de routes Express ciblés, incluant les routes de session, SSE, auth workspace, statut workspace et fichiers |
| `packages/cli/src/serve/auth.ts`                     | bearer + liste blanche d'hôtes + refus CORS                                                              |
| `packages/cli/src/serve/acp-session-bridge.ts`       | Facade de compatibilité bridge local au CLI pour spawn-or-attach, FIFO par session et registre de permissions |
| `packages/acp-bridge/src/status.ts`                  | Types wire de statut du daemon en lecture seule + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Helper pur qui construit les payloads `/workspace/env` à partir de l'état `process.*`, incluant le masquage des identifiants |
| `packages/acp-bridge/src/eventBus.ts`                | File asynchrone bornée + anneau de replay                                                                |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | Client TS                                                                                                |
| `packages/sdk-typescript/src/daemon/sse.ts`          | Parseur de trames EventSource                                                                            |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 cas, sans LLM                                                                                         |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 cas, vrai processus enfant `qwen --acp` soutenu par le faux serveur OpenAI local (POSIX uniquement ; ignoré sur Windows) |