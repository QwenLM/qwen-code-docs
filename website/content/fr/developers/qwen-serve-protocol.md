# Référence du protocole HTTP de `qwen serve`

Étape 1 de la [conception du démon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Toutes les routes se trouvent sous l'URL de base du démon (par défaut `http://127.0.0.1:4170`).

## Authentification

Lorsque le démon a été démarré avec `--token` ou `QWEN_SERVER_TOKEN`, **chaque route à l'exception de `/health` sur les liaisons loopback** doit inclure :

```
Authorization: Bearer <token>
```

Sans token configuré (valeur par défaut pour le développement en loopback), l'en-tête est optionnel. La comparaison des tokens s'effectue en temps constant. Les réponses 401 sont uniformes pour `missing header` / `wrong scheme` / `wrong token`.

**Exemption de `/health`** (Bctum) : sur les liaisons loopback (`127.0.0.1` / `localhost` / `::1` / `[::1]`), `/health` est enregistré AVANT le middleware bearer, de sorte que les sondes de liveness à l'intérieur du pod n'ont pas besoin d'inclure le token, même si le démon a été démarré avec `--token`. Les liaisons non-loopback (`--hostname 0.0.0.0`, etc.) protègent `/health` derrière le bearer comme n'importe quelle autre route — consultez la section [`GET /health`](#get-health) pour connaître la raison.

**`--require-auth` (PR #4175 15).** Passez ce flag au démarrage pour étendre la règle « doit avoir un token » au loopback également. Le démarrage échoue sans token ; l'exemption de `/health` est supprimée (donc `/health` exige également `Authorization: Bearer …`).

Lorsque le flag est activé, le middleware global `bearerAuth` protège **toutes** les routes, y compris `/capabilities`. Un client **non authentifié** ne peut donc pas pré-vérifier `caps.features` pour découvrir que l'authentification est requise : la surface de découverte pour ce cas est le **corps de la réponse 401** lui-même (uniforme sur toutes les routes selon la section [Authentification](#authentication)). Le tag de capacité `require_auth` est une **confirmation post-authentification** : une fois qu'un client s'authentifie avec succès et lit `/capabilities`, la présence du tag confirme que le démon a été démarré avec `--require-auth` (utile pour les interfaces d'audit/conformité et pour que les clients SDK affichent « ce déploiement est renforcé » dans un panneau de paramètres). Les routes de mutation qui optent pour le mode strict par route (suivi de la Wave 4) refusent avec `401 { code: "token_required", error: "…" }` lorsqu'elles sont atteintes sur un loopback sans token par défaut — mais avec `--require-auth` activé, le middleware bearer global court-circuite la requête avant la protection par route, de sorte que le corps legacy `Unauthorized` est ce que les appelants non authentifiés voient réellement.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Les webuis de navigateur accédant au démon en cross-origin sont bloqués par défaut : toute requête contenant un en-tête `Origin` renvoie `403 {"error":"Request denied by CORS policy"}` car les clients CLI/SDK n'envoient jamais `Origin` et le démon considère sa présence comme le signe que la requête provient d'un contexte de navigateur auquel l'opérateur n'a pas souscrit. Passez `--allow-origin <pattern>` (répétable) au démarrage pour installer une allowlist au lieu du blocage. Chaque pattern est soit :

- Le littéral `*` : admet n'importe quelle origin. **Risqué** : le démarrage est refusé lorsque `*` est configuré mais qu'aucun bearer token n'est défini (quelle que soit la source : `--token`, `QWEN_SERVER_TOKEN`, ou `--require-auth` qui impose un token au démarrage). Le fil d'Ariane de démarrage émet un avertissement stderr lorsque `*` figure dans la liste. **Recommandation** : associez-le à `--require-auth` sur les liaisons loopback afin que `/health` et `/demo` soient également protégés par le bearer : ils sont enregistrés avant le middleware bearer sur le loopback par défaut (afin que les sondes k8s/Compose puissent atteindre `/health` sans token), et une allowlist `*` les rend accessibles depuis n'importe quel navigateur cross-origin. Sur les liaisons non-loopback, le bearer est déjà obligatoire au démarrage, donc la surface d'exposition `*` se limite à `/health` (JSON de statut) et `/demo` (une page statique dont le JS appelle toujours des routes protégées par token) : la surface d'API réelle est protégée de toute façon.
- Une origin URL canonique : `<scheme>://<host>[:<port>]`. **Pas de slash final, pas de chemin, pas d'userinfo, pas de requête.** Le démarrage est refusé avec `InvalidAllowOriginPatternError` si l'entrée échoue au round-trip `new URL(pattern).origin === pattern` ; le message d'erreur indique le mauvais pattern et la forme canonique. Strict par intention : une normalisation silencieuse (par exemple, supprimer un `/` final) laisserait passer des fautes de frappe et accepterait des entrées ambiguës.

Les origins correspondantes reçoivent les en-têtes de réponse CORS standard sur chaque requête :

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` renvoie l'origin de la requête verbatim (minuscules/majuscules telles qu'envoyées par le navigateur) plutôt que le littéral `*`, même avec le pattern `*` : les caches du navigateur indexent les réponses en fonction de cette valeur associée à `Vary: Origin`, et cette approche laisse la possibilité d'ajouter `Access-Control-Allow-Credentials` dans une prochaine version sans changement de schéma. `Access-Control-Expose-Headers: Retry-After` permet aux webuis de navigateur d'honorer les indications de retry du démon provenant des réponses `429` / `503`. `Access-Control-Allow-Credentials` n'est **PAS** envoyé aujourd'hui : le démon s'authentifie via bearer dans `Authorization`, ce qui fonctionne en cross-origin sans `credentials: 'include'`.

Les requêtes OPTIONS preflight (OPTIONS avec `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) court-circuitent avec `204 No Content` ainsi que les en-têtes ci-dessus. C'est le pattern CORS conventionnel et c'est sûr : le preflight confirme uniquement quelles méthodes/en-têtes le démon acceptera ; la requête réelle ultérieure exécute toujours la chaîne complète (allowlist d'hôtes -> auth bearer -> routes), de sorte que l'anti-DNS-rebinding et l'application du bearer se déclenchent toujours avant que tout état ne soit lu ou modifié. Les requêtes OPTIONS simples provenant d'origins correspondantes continuent de circuler vers l'aval avec les en-têtes CORS attachés.

Les origins qui ne correspondent pas à l'allowlist reçoivent toujours `403 {"error":"Request denied by CORS policy"}` : la même enveloppe que le blocage par défaut, afin que les clients qui ont déjà analysé la réponse du blocage n'aient pas à traiter spécifiquement les démons déployés avec allowlist. Le chemin de rejet **n'émet** aucun en-tête `Access-Control-*` (le navigateur les ignorerait, et les émettre annoncerait indirectement la taille de l'allowlist via la présence des en-têtes).

La liste de patterns configurée n'est intentionnellement **PAS** renvoyée dans `/capabilities` : le webui du navigateur connaît déjà sa propre origin (il a appelé le démon, après tout), et exposer la liste permettrait à un lecteur non authentifié de `/capabilities` d'énumérer toutes les origins de confiance (utile pour la reconnaissance d'un déploiement mal configuré). Les clients SDK se basent sur le tag `caps.features.allow_origin` pour « ce démon honore les accès cross-origin des navigateurs » sans avoir besoin de connaître les origins spécifiques.

Les requêtes d'origin vers soi-même en loopback (par exemple, la page `/demo` appelant le démon sur le même `127.0.0.1:port`) sont gérées par un shim de suppression d'Origin **séparé** qui s'exécute AVANT le middleware CORS et supprime l'en-tête `Origin` pour `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Elles passent donc indépendamment de la configuration de `--allow-origin` : les opérateurs n'ont pas besoin de lister le propre port du démon pour faire fonctionner la page de démo.

## Forme courante des erreurs

Les réponses 5xx portent le `code` et les `data` de l'erreur d'origine lorsqu'ils sont présents (style JSON-RPC : le SDK ACP transmet `{code, message, data}` depuis l'agent) :

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

`WorkspaceMismatchError` pour un `POST /session` dont le `cwd` ne se canonicalise pas vers l'espace de travail lié du démon (#3803 §02 — 1 démon = 1 espace de travail) renvoie `400` avec :

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Utilisez ceci pour détecter une incompatibilité en pre-flight : lisez `workspaceCwd` depuis `/capabilities` et omettez `cwd` de `POST /session` (il reviendra à l'espace de travail lié), ou routez la requête vers un démon lié à `requestedWorkspace`.

Un `POST /session` au-delà de la limite `--max-sessions` du démon renvoie `503` avec un en-tête `Retry-After: 5` et :

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Les rattachements aux sessions existantes ne sont **PAS** comptabilisés dans la limite, de sorte que les reconnexions d'un démon inactif continuent de fonctionner même à capacité maximale.

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

Déclenché lorsqu'un `session/load` est émis pour un id qui a déjà un `session/resume` en cours (ou vice versa). Attendez au moins `Retry-After` secondes et réessayez : la restauration sous-jacente se termine dans le délai `initTimeoutMs` (10s par défaut). Les courses de même action (`load` contre `load`, `resume` contre `resume`) fusionnent au lieu de générer une erreur.

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
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
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
`session_scope_override` est le handle de négociation pour le champ `sessionScope` par requête sur `POST /session` (voir ci-dessous). Les anciens daemons ignorent silencieusement ce champ, les clients SDK doivent donc vérifier en amont `caps.features` pour cette balise avant de l'envoyer.

`session_load` et `session_resume` annoncent les routes de restauration explicite (`POST /session/:id/load` et `POST /session/:id/resume`). Les anciens daemons retournent `404` pour ces chemins, les clients SDK doivent donc vérifier en amont `caps.features` avant de les appeler. `unstable_session_resume` est toujours annoncé comme un alias obsolète pour assurer la compatibilité avec les SDK publiés lorsque la méthode ACP sous-jacente s'appelait `connection.unstable_resumeSession` ; les nouveaux clients doivent se baser sur `session_resume`.

`slow_client_warning` couvre le comportement de backpressure SSE : (a) le daemon émet une trame de flux d'événements synthétique `slow_client_warning` lorsque le backlog de trames en direct d'un abonné ou son backlog d'octets sérialisés en direct dépasse 75 % de capacité, une fois par épisode de débordement (réarmé après que les deux mesures redescendent sous les 37,5 %) ; (b) `GET /session/:id/events` accepte un paramètre de requête `?maxQueued=N` (plage `[16, 2048]`) pour prédimensionner le backlog de trames par abonné lors des reconnexions à froid face à un grand anneau de relecture. Le plafond d'octets sérialisés est géré par le daemon (par défaut **2 MiB** par abonné), uniquement en direct, et n'a volontairement pas de paramètre de requête. La taille de l'anneau pour l'ensemble du daemon est contrôlée par `--event-ring-size` (par défaut **8000**, selon #3803 §02). Les anciens daemons ne disposent pas silencieusement du comportement d'avertissement/requête — vérifiez cette balise en amont avant de l'activer.

`typed_event_schema` annonce les payloads d'événements du daemon qui correspondent au schéma `KnownDaemonEvent` du SDK. Les anciens daemons peuvent toujours diffuser des trames compatibles, mais les clients SDK doivent vérifier cette balise en amont avant de supposer une couverture des événements typés.

`client_heartbeat` annonce `POST /session/:id/heartbeat`. Les anciens daemons retournent `404` ; vérifiez cette balise en amont avant d'émettre des heartbeats périodiques.

`session_close` et `session_metadata` annoncent `DELETE /session/:id` et `PATCH /session/:id/metadata`. Les anciens daemons retournent `404` ; vérifiez ces balises en amont avant d'exposer les fonctionnalités de fermeture ou de renommage.

`session_organization` annonce les groupes de sessions personnalisés et l'épinglage. Il ajoute `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization`, et la vue de liste organisée en option `GET /workspace/:id/sessions?view=organized`. Les anciens daemons retournent `404` pour les routes de mutation/groupe et ignorent le contrat de vue organisée, les clients WebShell/SDK doivent donc vérifier cette balise en amont avant d'afficher l'interface utilisateur de groupement ou d'épinglage.

`session_archive` annonce l'API d'archive d'état de répertoire v1 : `POST /sessions/archive`, `POST /sessions/unarchive`, et `GET /workspace/:id/sessions?archiveState=active|archived`. Les sessions archivées ne peuvent pas être chargées ou reprises tant qu'elles n'ont pas été désarchivées.

`session_lsp` annonce `GET /session/:id/lsp`, l'instantané structuré en lecture seule du statut LSP pour les clients daemon. Les anciens daemons retournent `404` ; vérifiez cette balise en amont avant d'exposer le statut LSP distant.

`session_status` annonce `GET /session/:id/status`, le résumé en direct du bridge pour une seule session par son id (`clientCount` / `hasActivePrompt` et les champs principaux). Les anciens daemons retournent `404` ; vérifiez cette balise en amont avant d'interroger le statut d'une seule session au lieu de scanner la liste complète des sessions.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init`, et `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) annoncent les quatre routes de contrôle de mutation documentées sous "Mutation: approval, tools, init, MCP restart" ci-dessous. Les quatre sont strictement soumises à la gate de mutation de la PR 15 (un daemon configuré sans bearer token les rejette avec une 401 `token_required`). Les anciens daemons retournent `404` ; vérifiez chaque balise en amont avant d'exposer la fonctionnalité correspondante.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) couvre la surface de budget MCP : les champs `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` sur `GET /workspace/mcp`, le champ `disabledReason` sur les cellules par serveur, et les flags CLI `--mcp-client-budget` / `--mcp-budget-mode`. Les anciens daemons omettent entièrement les nouveaux champs ; les clients SDK vérifient cette balise en amont avant de s'appuyer sur la sémantique de `budgets[]`. Le descripteur de registre contient également `modes: ['warn', 'enforce']` pour une future exposition des modes de fonctionnalités — pour l'instant, les clients déduisent le mode à partir du champ `budgetMode` de l'instantané. Le refus du serveur en mode `enforce` est déterministe selon l'ordre de déclaration de `Object.entries(mcpServers)` ; une future couche de précédence de portée (si qwen-code en adopte une) déplacerait cela à "la précédence la plus faible en premier" pour refléter la convention `plugin < user < project < local` de claude-code.

> ⚠️ **Portée de la PR 14 v1 : par session, et non par workspace.** Chaque session ACP à l'intérieur du daemon construit son propre `Config` + `McpClientManager` (via `acpAgent.newSessionConfig`). Les plafonds de budget limitent les clients MCP en direct **par session** ; chaque session lit indépendamment `QWEN_SERVE_MCP_CLIENT_BUDGET` depuis l'environnement transmis. Avec `--mcp-client-budget=10` et 5 sessions ACP simultanées, le nombre réel de clients MCP en direct peut atteindre 5 × 10 = 50 à travers le daemon. L'instantané `GET /workspace/mcp` ne lit que la comptabilité du `McpClientManager` de la **session bootstrap** — la valeur `budgets[0].scope: 'session'` est le signal clair qu'il s'agit d'une portée par session, et non agrégée. **La PR 23 de la Wave 5 (pool MCP partagé)** introduira un gestionnaire à l'échelle du workspace et ajoutera une cellule `scope: 'workspace'` à côté de la cellule par session pour une véritable agrégation inter-sessions. La v1 est la base du compteur in-process + application souple sur laquelle la PR 23 s'appuie.

`workspace_file_read` couvre les routes de fichiers workspace pour texte/liste/stat/glob
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
couvre `GET /file/bytes`, qui a été ajouté plus tard pour que les clients puissent vérifier en amont
la prise en charge des fenêtres d'octets bruts face aux daemons de l'ère PR19. `workspace_file_write` couvre
les routes de mutation de texte tenant compte des hachages (`POST /file/write`, `POST /file/edit`).
La balise write signifie que le contrat de route existe ; cela ne signifie pas que le
déploiement actuel est ouvert aux mutations anonymes. Write/edit sont des routes de mutation
strictes et nécessitent un bearer token configuré même sur loopback.

`daemon_status` annonce `GET /daemon/status`, l'instantané de diagnostic
opérateur consolidé en lecture seule documenté ci-dessous.

**Balises conditionnelles.** Un petit nombre de balises de fonctionnalités sont annoncées uniquement lorsque le basculement de déploiement correspondant est activé. Présence de la balise = le comportement est activé ; absence = soit un ancien daemon antérieur à la balise, SOIT un daemon actuel où l'opérateur n'a pas activé l'option. Actuellement :

| Balise                     | Annoncée lorsque…                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | le daemon a été démarré avec `--require-auth` (ou `requireAuth: true` via l'API intégrée). Le bearer token est obligatoire sur chaque route, y compris `/health` sur les bind loopback.                                                                                                                                                                                                                                                                                                                          |
| `mcp_workspace_pool`       | le pool de transport MCP partagé est actif. Omis lorsque `QWEN_SERVE_NO_MCP_POOL=1` désactive le pool.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `mcp_pool_restart`         | le pool de transport MCP partagé est actif ; les réponses de redémarrage peuvent inclure des formes multi-entrées tenant compte du pool.                                                                                                                                                                                                                                                                                                                                                                          |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Le daemon a été démarré avec au moins un `--allow-origin <pattern>` (ou `allowOrigins: [...]` via l'API intégrée). Les requêtes cross-origin provenant d'origines correspondantes reçoivent des en-têtes de réponse CORS appropriés ; les origines non correspondantes obtiennent toujours la 403 par défaut. La liste de patterns configurée n'est volontairement PAS renvoyée dans `/capabilities` pour éviter de divulguer l'ensemble des origines de confiance aux lecteurs non authentifiés — le webui du navigateur connaît déjà sa propre origine. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                                       |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                          |
| `workspace_settings`       | le daemon a été créé avec la persistance des paramètres disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `session_shell_command`    | l'exécution du shell de session est explicitement activée.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` est activé.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `workspace_reload`         | la prise en charge du rechargement du workspace est disponible dans la configuration des routes intégrées.                                                                                                                                                                                                                                                                                                                                                                                                        |
`mcp_guardrails` n'est **pas** dans ce tableau conditionnel — c'est un tag toujours actif, annoncé chaque fois que le binaire prend en charge les nouveaux champs de budget `/workspace/mcp`, que l'opérateur ait configuré un budget ou non. Les opérateurs qui n'ont pas défini `--mcp-client-budget` reçoivent tout de même les nouveaux champs (avec `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) annonce les événements push SSE typés qui signalent les franchissements d'état du budget MCP sans boucle de polling. Deux types de trames arrivent sur `GET /session/:id/events` :

- `mcp_budget_warning` — se déclenche une fois lors du franchissement à la hausse du seuil de 75 % de `reservedSlots.size / clientBudget`. Ne se réarme que lorsque le ratio redescend sous les 37,5 % (`MCP_BUDGET_REARM_FRACTION`). Reprend l'hystérésis de `slow_client_warning` de la PR 10, mais au niveau du manager plutôt qu'au niveau du backlog par abonné. Payload : `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Se déclenche dans les modes `warn` et `enforce` ; jamais en mode `off`.
- `mcp_child_refused_batch` — se déclenche à la fin de chaque passage de `discoverAllMcpTools*` lorsqu'un ou plusieurs serveurs ont été refusés, ET sous forme de batch de longueur 1 sur le chemin de refus de lazy-spawn de `readResource`. Payload : `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` est littéralement `'enforce'` car le mode `warn` ne refuse jamais.

Ces deux événements résident dans l'anneau de relecture SSE par session (ils portent un `id`), de sorte qu'un client qui se reconnecte avec `Last-Event-ID` reprend à travers eux ; le snapshot sur `GET /workspace/mcp` reste la source de vérité pour l'état après une déconnexion prolongée. Toujours actifs une fois annoncés — il n'y a pas de bascule conditionnelle. L'état du reducer SDK (`DaemonSessionViewState`) expose `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` pour les adaptateurs qui souhaitent une interface utilisateur simple de type lag.

## Routes

### `GET /health`

Sonde de liveness. La forme par défaut renvoie `200 {"status":"ok"}` si le listener est actif — peu coûteux, sans accès au bridge, adapté aux sondes de liveness k8s/Compose à haute fréquence.

Passez `?deep=1` (accepte aussi `?deep=true` ou simplement `?deep`) pour une sonde qui expose les **compteurs** du bridge (informatif uniquement, pas une véritable vérification de liveness) :

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ La sonde profonde (deep probe) est **informative**, pas une véritable vérification de liveness. Elle lit les accesseurs de compteurs (`bridge.sessionCount`, `bridge.pendingPermissionCount`) qui sont de simples getters de taille de Map ; ils ne pingent pas les processus enfants / canaux individuels et ne détecteront donc pas une session bloquée mais toujours comptabilisée. Utilisez-la pour les tableaux de bord de capacité (concurrence actuelle vs `--max-sessions`, profondeur de la file d'attente) plutôt que comme déclencheur pour "retirer ce daemon de la rotation". Une réponse `503 {"status":"degraded"}` est théoriquement possible si les getters d'une implémentation de bridge personnalisée lèvent une exception, mais les getters du vrai bridge ne le font jamais — en fonctionnement normal, la sonde profonde renvoie toujours 200. Pour une véritable liveness, fiez-vous au fait que le listener accepte ou non une connexion TCP (c'est-à-dire le `/health` par défaut sans `?deep`).

**Auth :** requise **uniquement sur les binds non-loopback**. Sur loopback (`127.0.0.1`, `::1`, `[::1]`), `/health` est enregistré avant le middleware bearer, de sorte que les sondes k8s/Compose à l'intérieur du pod n'ont pas besoin de porter le token. Sur non-loopback (`--hostname 0.0.0.0`, etc.), la route est enregistrée après le middleware bearer et renvoie 401 sans token valide — sinon, un appelant non authentifié pourrait sonder des adresses arbitraires pour confirmer l'existence d'un `qwen serve`, une fuite d'informations de faible gravité qui se combine mal avec le port scanning. Le refus CORS + la liste blanche Host s'appliquent toujours sur l'exemption loopback.

### `GET /daemon/status`

Diagnostics opérateur en lecture seule. Contrairement à `/health`, il s'agit d'une API daemon normale :
elle est enregistrée après l'auth bearer et le rate limiting, y compris sur les binds
loopback. Paramètre de requête :

- `detail=summary` (par défaut) lit uniquement l'état du daemon en mémoire.
- `detail=full` inclut également les diagnostics de session en direct, les diagnostics de connexion
  ACP, les compteurs de device-flow d'authentification et les sections d'état du workspace.
- toute autre valeur de `detail` renvoie `400 { "code": "invalid_detail" }`.

`summary` n'interroge intentionnellement pas les méthodes d'état du workspace, ne démarre pas
d'enfant ACP et ne crée pas de session. `full` interroge chaque section du workspace indépendamment ;
un timeout ou une exception marque uniquement cette section comme `unavailable` et ajoute un
problème `workspace_status_unavailable`.

Forme de la réponse :

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
    },
    "perf": {
      "eventLoop": { "meanMs": 0, "p50Ms": 0, "p99Ms": 0, "maxMs": 0 },
      "promptQueueWait": {
        "count": 0,
        "meanMs": 0,
        "maxMs": 0,
        "lastMs": null
      },
      "pipe": {
        "inbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 },
        "outbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 }
      }
    },
    "activity": {
      "activePrompts": 0,
      "pendingPrompts": 0,
      "queuedPrompts": 0,
      "lastActivityAt": null,
      "idleSinceMs": null
    }
  }
}
```

`runtime.perf` est optionnel. Lorsqu'il est présent, il rapporte uniquement le lag de la boucle
d'événements du processus daemon, les échantillons d'attente de la file FIFO de prompts et les
compteurs d'octets du pipe daemon-enfant ; le lag de la boucle d'événements de l'enfant ACP n'est
pas inclus dans `/daemon/status`.

`status` est `error` si un problème a la sévérité error, `warning` si un problème a la sévérité
warning, sinon `ok`. Les codes de problème sont stables et incluent
`session_capacity_high`, `connection_capacity_high`, `pending_permissions`,
`acp_channel_down`, `preflight_error`, `mcp_budget_warning`,
`mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`,
`channel_worker_partial_connect` et `workspace_status_unavailable`. Pendant
la courte fenêtre où le listener est prêt mais avant que le runtime complet ne soit
monté, `/daemon/status` peut rapporter `daemon_runtime_starting` ; si le montage
asynchrone du runtime échoue, il rapporte `daemon_runtime_failed` tandis que les routes
runtime hors statut renvoient `503`.

`runtime.activity` rapporte l'activité des prompts à l'échelle du daemon. `activePrompts` compte les sessions avec un prompt en cours. `pendingPrompts` compte tous les prompts acceptés qui ne se sont pas encore terminés, y compris le prompt en cours d'exécution et les prompts en attente FIFO. `queuedPrompts` compte les prompts en attente FIFO qui ont été acceptés mais non dispatchés. `lastActivityAt` est le timestamp ISO 8601 du dernier début/fin de prompt ou de la dernière création de session ; `null` lorsque le daemon n'a traité aucune activité depuis son démarrage. `idleSinceMs` est calculé à partir de `lastActivityAt` au moment de la génération de la réponse.

`runtime.channel.live` rapporte le canal bridge ACP à l'intérieur du daemon. Ce
n'est pas le worker channel-adapter. Les canaux gérés par le daemon utilisent
`runtime.channelWorker`, dont l'état (`state`) est l'un des suivants : `disabled`, `starting`,
`running`, `exited`, `failed` ou `stopped`. Lorsqu'un worker atteint `running`
puis se termine, `/daemon/status` maintient le daemon en ligne et rapporte le code de problème
warning `channel_worker_exited`.

Le démarrage du worker de canal géré par le daemon reste fail-fast : si `qwen serve
--channel ...` ne peut pas démarrer un worker qui atteint l'état ready, le démarrage de serve échoue.
Une fois qu'un worker a atteint l'état ready, les arrêts inattendus sont redémarrés par le superviseur
serve dans le cadre d'une politique bornée : jusqu'à 3 tentatives de redémarrage dans une fenêtre de 5 minutes,
avec un backoff de 1s, 5s, puis 15s. Le worker envoie des heartbeats IPC toutes les
15s ; si aucun heartbeat n'est observé pendant 45s, le superviseur considère le worker comme
périmé, le tue, enregistre `staleHeartbeatAt` et utilise le même chemin de redémarrage.

`runtime.channelWorker` peut inclure des champs opérationnels additifs :
`requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`,
`restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`,
`lastHeartbeatAt` et `staleHeartbeatAt`. `restartCount` est le nombre total de tentatives de redémarrage effectuées par ce processus serve au cours de sa durée de vie ; un worker en cours d'exécution avec
`restartCount > 0` est sain sauf si un autre problème s'applique. Un worker en cours d'exécution
dont les `requestedChannels` incluent des noms absents de `channels` rapporte
`channel_worker_partial_connect`.

`qwen channel status` continue de lire les métadonnées du pidfile. Pendant une fenêtre de redémarrage, le pidfile appartenant à serve reste réservé, mais `workerPid` est omis afin que les clients n'affichent pas un processus worker périmé. Les stdout/stderr du worker sont transférés dans le log du daemon, les bearer tokens, les valeurs sensibles de l'environnement du worker et les identifiants de l'URL du proxy étant caviardés.

Sécurité : la réponse n'inclut jamais de bearer tokens, d'ids client, d'ids de connexion ACP complets, de codes utilisateur device-flow ou d'URL de vérification. `summary` omet le chemin du log du daemon ; `full` peut l'inclure pour les opérateurs authentifiés.

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

> **`protocolVersions`** décrit les versions du protocole serve que le daemon peut parler. `current` est la version de protocole préférée du daemon et `supported` est l'ensemble compatible. Les clients qui nécessitent un protocole spécifique doivent vérifier `supported` ; les interfaces utilisateur spécifiques à une fonctionnalité doivent toujours se baser sur `features`. Additif pour v=1 : les anciens daemons v=1 omettent ce champ, les clients SDK qui ciblent d'anciennes builds doivent donc le traiter comme optionnel.

> **`modelServices` est toujours `[]` dans la Stage 1.** L'agent utilise son service de modèle unique par défaut et ne l'énumère pas sur le réseau. La Stage 2 remplira ce champ à partir des adaptateurs de modèle enregistrés afin que les clients SDK puissent construire des sélecteurs de service ; d'ici là, ne vous fiez PAS au fait que ce champ soit non vide.

> **`workspaceCwd`** est le chemin absolu canonique auquel ce daemon se lie (#3803 §02 — 1 daemon = 1 workspace). Utilisez-le pour (a) détecter les incompatibilités avant de poster sur `/session` et (b) omettre `cwd` sur `POST /session` (la route utilise ce chemin par défaut). Les déploiements multi-workspace exposent plusieurs daemons sur différents ports, chacun avec son propre `workspaceCwd`. Additif pour v=1 : les daemons v=1 antérieurs au §02 omettent le champ — les clients qui ciblent d'anciennes builds doivent vérifier la nullité avant de le consommer.

### Routes de statut runtime en lecture seule

Ces routes rapportent des snapshots runtime côté daemon. Ce sont des routes v1 additives,
elles ne mutent pas l'état et ne changent pas la version du protocole serve. Les routes
de statut du workspace ne démarrent intentionnellement **pas** le processus enfant ACP simplement parce
qu'un client interroge une route GET : si le daemon est inactif, elles renvoient
`initialized: false` avec un snapshot vide. Les routes de statut de session nécessitent une
session active et utilisent la forme standard `404 SessionNotFoundError` pour les ids inconnus.

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

`errorKind` est une énumération fermée partagée par `/workspace/preflight`,
`/workspace/env`, et (à terme) les garde-fous MCP, afin que les clients SDK puissent afficher des actions correctives par catégorie au lieu d'analyser des messages de forme libre. La PR 13
(#4175) a introduit les sept littéraux listés ci-dessus ; la PR 14 remplira
`blocked_egress` une fois que la sonde egress sera intégrée.

Les payloads de statut n'exposent jamais les valeurs d'environnement MCP, les en-têtes, les détails OAuth/compte de service, les clés API des fournisseurs, les `baseUrl` / `envKey` des fournisseurs, le corps des skills, les chemins d'accès au système de fichiers des skills, les définitions de hooks, ni les valeurs des variables d'environnement secrètes. `/workspace/env` signale uniquement la **présence** des variables d'environnement sur liste blanche ; les URL des proxies sont dépouillées de leurs identifiants et réduites à
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

`discoveryState` prend l'une des valeurs suivantes : `not_started`, `in_progress` ou `completed`.
`transport` prend l'une des valeurs suivantes : `stdio`, `sse`, `http`, `websocket`, `sdk` ou
`unknown`. `errors` est omis lorsque la découverte réussit.

**Garde-fous du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Les démons post-PR-14 étendent le payload avec quatre champs additifs et une cellule au niveau du workspace :

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

`budgetMode` prend l'une des valeurs suivantes : `enforce`, `warn` ou `off`. `clientBudget` est absent lorsqu'aucun budget n'a été défini. `budgets[]` est **toujours un tableau** sur les démons post-PR-14 (éventuellement vide lorsque `budgetMode === 'off'`) ; les démons pré-PR-14 omettent entièrement ce champ. La v1 émet une seule cellule avec `scope: 'session'` (application par session — voir la section des capacités ci-dessus pour en connaître la raison). Les consommateurs DOIVENT tolérer des entrées `budgets[]` supplémentaires avec des valeurs de `scope` non reconnues — la PR 23 de la Wave 5 ajoutera `scope: 'workspace'` (ou `'pool'`) à côté de la cellule par session sans incrémenter le schéma.

Le `disabledReason` sur les cellules par serveur distingue la désactivation par l'opérateur (`'config'` — liste de configuration `disabledMcpServers`) du refus pour cause de budget (`'budget'` — découvert mais jamais connecté en raison du mode `enforce`). Les refus sont déterministes selon l'ordre de déclaration de `Object.entries(mcpServers)`. Le `status: 'error', errorKind: 'budget_exhausted'` par serveur masque le `mcpStatus: 'disconnected'` brut (qui est vrai, mais ne représente pas la sévérité côté opérateur).

L'application du budget dans la PR 14 v1 se fait **par session, et non par workspace**. Bien que les démons du Mode B soient `1 démon = 1 workspace × N sessions` post-#4113 au niveau du processus, le `McpClientManager` est construit à l'intérieur de la `Config` de chaque session ACP via `acpAgent.newSessionConfig`, de sorte que les N sessions appliquent chacune leur propre copie de la limite. Le snapshot représente la vue de la session bootstrap. La PR 23 de la Wave 5 introduit un pool MCP partagé à l'échelle du workspace, ce qui fait évoluer cela vers une véritable application par workspace.

**Détection de la pression sur le budget.** Deux surfaces, toutes deux peuplées post-PR-14b :

- **Événements push** (annoncés via `mcp_guardrail_events`) : abonnez-vous à `GET /session/:id/events` et filtrez les trames `mcp_budget_warning` / `mcp_child_refused_batch` via `KnownDaemonEvent`. La machine à états se déclenche une fois par franchissement à la hausse du seuil de 75 % (réarmée en dessous de 37,5 %) ; les refus sont fusionnés une fois par passe de découverte en mode `enforce`.
- **Sondage de snapshot** (annoncé via `mcp_guardrails`) : `GET /workspace/mcp` et inspectez la cellule de budget par session (`budgets[0]`) :

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (correspond au seuil d'hystérésis que l'événement push de la PR 14b utilisera).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (un ou plusieurs serveurs ont été refusés lors de cette passe de découverte).
- `budgets[0].status === 'ok'` ⇔ en dessous du seuil de 75 % ET aucun refus.

Fréquence de sondage recommandée : alignez-vous sur ce qui sonde déjà `/workspace/mcp` ; le snapshot est peu coûteux et la cellule de budget n'entraîne aucun coût de découverte supplémentaire. Les clients SDK qui s'abonnent aux événements push tirent tout de même profit du snapshot pour l'état après une déconnexion prolongée (la profondeur de l'anneau de relecture SSE est finie — `--event-ring-size`, 8000 par défaut — de sorte qu'un client hors ligne plus longtemps que la couverture de l'anneau revient à une resynchronisation par snapshot).

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

`level` prend l'une des valeurs suivantes : `project`, `user`, `extension` ou `bundled`. `errors` est
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

Les modèles sont regroupés par type d'authentification. Les diagnostics de connexion des fournisseurs se trouvent dans la cellule `providers` de
`/workspace/preflight` ; le preflight de l'environnement se trouve dans
`/workspace/preflight` et `/workspace/env` (ci-dessous). `errors` est omis
lorsque la construction du snapshot réussit.

### `GET /workspace/env`

Signale le runtime, la plateforme, le sandbox, le proxy du processus démon, ainsi que la
**présence** des variables d'environnement secrètes sur liste blanche. Répond toujours à partir de l'état `process.*` — le démon ne lance jamais de processus enfant ACP pour servir cette route, et la réponse est identique que l'ACP soit actif ou inactif. Le
champ `acpChannelLive` est purement informatif.

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

**Politique de masquage.** Les cellules `kind: 'env_var'` n'incluent jamais de champ
`value` ; les clients voient uniquement `present: boolean`. Les cellules `kind: 'proxy'` soumettent la valeur d'environnement brute à un masquage des identifiants (`redactProxyCredentials`) puis à une analyse `URL` afin que le réseau ne transporte que `host:port`. `NO_PROXY`
est transmis tel quel au masquage car il s'agit d'une liste d'hôtes et non d'une URL. La liste blanche des variables d'environnement secrètes énumérées inclut actuellement
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
`DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` et `QWEN_SERVER_TOKEN`. Les autres
variables d'environnement ne sont pas énumérées, de sorte que les secrets définis accidentellement restent invisibles.

### `GET /workspace/preflight`

Signale les vérifications de l'état de préparation du démon. Les **cellules au niveau du démon** (`node_version`,
`cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) sont toujours
peuplées à partir de `process.*` et `node:fs`. Les **cellules au niveau de l'ACP** (`auth`,
`mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`)
nécessitent un processus enfant ACP actif — lorsque le démon est inactif, elles émettent
des placeholders `status: 'not_started'`. La route ne lance jamais l'ACP uniquement
pour peupler les cellules ; les cellules correspondantes reviennent à `not_started`.

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
Forme de la cellule :

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

- `missing_binary` — Version de Node inférieure à celle requise, `QWEN_CLI_ENTRY` manquant,
  ripgrep / git / npm absent du PATH (avertissements plutôt qu'erreurs pour les
  binaires optionnels).
- `missing_file` — `boundWorkspace` n'existe pas ou n'est pas un répertoire ;
  erreur d'analyse de skill pointant vers un fichier manquant ou illisible.
- `parse_error` — Échec de l'analyse de `SKILL.md`, JSON de configuration malformé.
- `auth_env_error` — `validateAuthMethod` a renvoyé une chaîne d'échec non nulle,
  ou une sous-classe `ModelConfigError` propagée depuis la résolution du
  provider.
- `init_timeout` — Rejet de `withTimeout` dans le bridge (un véritable timeout
  lors de l'attente d'un aller-retour ACP). Reconnu via la
  classe typée `BridgeTimeoutError`. Note : une cellule `warning` transitoire
  `mcp_discovery` avec `connecting > 0` ne porte PAS ce type — c'est
  un état normal de handshake en cours, distinct d'un véritable timeout.
- `protocol_error` — `extMethod` ACP rejeté parce que le canal s'est fermé
  en milieu de requête, ou parce que le registre d'outils était absent de manière inattendue.
- `blocked_egress` — réservé pour la PR 14 (#4175). La PR 13 laisse la
  cellule `egress` avec `status: 'not_started'`.

Si le bridge n'arrive pas à atteindre l'enfant ACP lors du traitement d'une requête
preflight (par exemple, une fermeture de canal en milieu de requête), le tableau
`errors` de l'enveloppe contient une seule `ServeStatusCell` décrivant l'échec et les cellules
reviennent à des placeholders ACP `not_started`. Les cellules au niveau du daemon sont
toujours renvoyées.

### Routes des fichiers du workspace

Tous les chemins de fichiers sont résolus via le workspace lié du daemon. Les réponses utilisent
des chemins relatifs au workspace et ne renvoient jamais de chemins absolus du système de fichiers pour les cas
de succès normaux. Les réponses de fichiers réussies incluent :

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Les erreurs de système de fichiers utilisent cette forme JSON :

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

Les valeurs de `errorKind` incluent `path_outside_workspace`, `symlink_escape`,
`path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`,
`permission_denied`, `parse_error`, `hash_mismatch`,
`file_already_exists`, `text_not_found`, et `ambiguous_text_match`.

#### `GET /file`

Lit un fichier texte. Paramètres de requête : `path` (requis), `maxBytes`, `line`, et
`limit`. Le daemon rejette les fichiers binaires et les fichiers dépassant la limite de lecture de texte.
La réponse inclut `hash`, un condensé SHA-256 sur les octets bruts du disque pour
l'ensemble du fichier, même lorsque `line`, `limit`, ou `maxBytes` ont renvoyé une tranche.

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

Lit les octets bruts d'un fichier sans les décoder. Paramètres de requête : `path` (requis),
`offset` (par défaut `0`), et `maxBytes` (par défaut `65536`, max `262144`). Cette
route prend en charge des fenêtres bornées sur de gros fichiers binaires sans ingérer le fichier
entier. La réponse inclut `hash` uniquement lorsque la fenêtre renvoyée couvre
l'intégralité du fichier.

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

Crée ou remplace un fichier texte. Il s'agit d'une route de mutation stricte : sur loopback
sans token configuré, elle renvoie `401 { "code": "token_required" }`.
Avec `--require-auth`, le middleware bearer global rejette les requêtes non authentifiées
avant l'exécution de la route.

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

`mode` doit être `create` ou `replace`. `create` n'écrase jamais un fichier existant
(`409 file_already_exists`). `replace` nécessite `expectedHash` ; les hashes manquants ou
malformés renvoient `400 parse_error`, et les hashes obsolètes renvoient
`409 hash_mismatch`. `expectedHash` est `sha256:` suivi de 64 caractères hexadécimaux
minuscules, calculé sur les octets bruts du disque.

`bom`, `encoding`, et `lineEnding` peuvent être fournis. Le remplacement préserve par défaut
le profil d'encodage du fichier existant ; les champs explicites le remplacent.
Les écritures binaires sont hors scope.

Le daemon écrit dans un fichier temporaire aléatoire dans le répertoire cible, effectue un fsync là où
c'est supporté, revérifie le hash actuel immédiatement avant `rename()`, puis
renomme le fichier à sa place finale. Cela empêche l'observation de fichiers partiels et sérialise
les écritures provenant du daemon vers le même fichier, mais ce n'est pas un compare-and-swap
noyau inter-processus : un éditeur externe peut toujours entrer en compétition dans la minuscule fenêtre
entre la vérification finale du hash et le renommage.

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

Applique un remplacement de texte exact à un fichier texte existant. C'est également une
route de mutation stricte qui nécessite `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` doit être non vide et apparaître exactement une fois. Aucune correspondance renvoie
`422 text_not_found` ; plusieurs correspondances renvoient `422 ambiguous_text_match`.
La route préserve l'encodage, le BOM et les fins de ligne, et revérifie
`expectedHash` immédiatement avant le renommage atomique.

Les écritures/éditions explicites vers des chemins ignorés sont autorisées car l'appelant
authentifié a nommé le chemin. Les réponses de succès et les événements d'audit incluent
`matchedIgnore: "file" | "directory" | null`.

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

`state` reflète les mêmes formes de modèle/mode/option de config ACP utilisées par
`POST /session`, `POST /session/:id/load`, et `POST /session/:id/resume`.

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

`availableCommands` est le même snapshot de commande utilisé par la
notification SSE `available_commands_update`. `availableSkills` liste uniquement les noms des
skills ; les clients ne doivent pas s'attendre à recevoir les corps ou les chemins des skills via cette route.

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
    },
    {
      "kind": "agent",
      "id": "agent-2",
      "label": "general-purpose: run the failing test",
      "description": "run the failing test",
      "status": "running",
      "startTime": 1699999999500,
      "runtimeMs": 500,
      "outputFile": "/tmp/agent-2.jsonl",
      "isBackgrounded": false,
      "subagentType": "general-purpose",
      "parentAgentId": "agent-1",
      "parentName": "reviewer",
      "depth": 1
    }
  ]
}
```

Cette route est un snapshot hors bande en lecture seule. Elle n'est intentionnellement pas un
prompt et peut être interrogée pendant que la session est en streaming. La réponse contient
uniquement des métadonnées sur liste blanche provenant des registres de tâches de l'agent, du shell et du moniteur ;
les contrôleurs, timers, offsets, messages en attente et objets de registre bruts ne sont jamais exposés.

Les tâches d'agent lancées par un autre sous-agent (sous-agents imbriqués, limités par
`maxSubagentDepth`) portent trois champs de lignée optionnels : `parentAgentId` (l'`id` de la tâche de
l'agent parent), `parentName` (le `subagentType` de l'agent parent,
capturé à l'inscription pour qu'il survive à l'éviction du parent du registre), et `depth` (profondeur de lancement basée sur 0 ; 0 = lancé par la
session de plus haut niveau). Les agents lancés par la session de plus haut niveau omettent
`parentAgentId` et `parentName` ; les clients doivent traiter ces trois champs comme
optionnels et revenir à une liste plate en leur absence.

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

`status` est l'un des suivants : `NOT_STARTED`, `IN_PROGRESS`, `READY`, ou `FAILED`.
L'`error` optionnelle est présente sur les serveurs en échec lorsqu'elle est disponible. Un LSP désactivé
(y compris en mode bare) renvoie HTTP 200 avec `enabled: false`, des compteurs à zéro, et
`servers: []`. Un LSP activé sans serveurs configurés renvoie `enabled: true`,
`configuredServers: 0`, et `servers: []`. Si l'initialisation échoue avant que le
client n'existe, la réponse peut inclure `initializationError` ; si un client actif
ne peut pas fournir de snapshot, la réponse inclut `statusUnavailable: true`.

Cette route expose uniquement les champs stables destinés aux clients. Elle omet intentionnellement
les internes de débogage tels que les ID de processus, les arguments de spawn, les queues de stderr, les URI racine et
les chemins des dossiers de workspace.

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
| `cwd`            | non       | Chemin absolu correspondant au workspace lié du daemon. S'il est omis, la route revient à `boundWorkspace` (lisez-le depuis `/capabilities.workspaceCwd`). Un `cwd` non vide et non concordant renvoie `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 workspace). Les chemins du workspace sont canonisés via `realpathSync.native` (avec un fallback resolve-only pour les chemins inexistants) afin que les systèmes de fichiers insensibles à la casse ne rejettent pas les sessions selon leur orthographe.                                                                                                                                                                          |
| `modelServiceId` | non       | Sélectionne le _model service_ configuré par lequel l'agent va router (le provider back-end — Alibaba ModelStudio, OpenRouter, etc). S'il est omis, l'agent utilise celui par défaut. Si le workspace a déjà une session, cela appelle `setSessionModel` sur la session existante et diffuse `model_switched`. À distinguer de `modelId` sur `POST /session/:id/model`, qui sélectionne le modèle **au sein** d'un service déjà lié. Le tableau `modelServices` sur `/capabilities` est réservé à l'annonce des services configurés ; dans la Stage 1, il est toujours `[]` (le service par défaut de l'agent est utilisé et n'est pas énuméré via HTTP). |
| `sessionScope`   | non       | Override par requête pour le partage de session. `'single'` (la valeur par défaut pour l'ensemble du daemon) fait qu'un second `POST /session` pour le même workspace réutilise la session existante (`attached: true`) ; `'thread'` force une nouvelle session distincte à chaque appel. Omettre pour hériter de la valeur par défaut du daemon. Les valeurs en dehors de l'enum renvoient `400 { code: 'invalid_session_scope' }`. Les anciens daemons (avant la PR 5 de #4175) ignorent silencieusement ce champ — vérifiez `caps.features.session_scope_override` en pre-flight avant l'envoi. La valeur par défaut du daemon est codée en dur à `'single'` en production aujourd'hui ; #4175 pourrait ajouter un flag CLI `--sessionScope` dans un suivi.         |
Réponse :

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` signifie qu'une session pour cet espace de travail existait déjà et que vous la partagez désormais.

Les intégrations multi-clients qui souhaitent des conversations indépendantes doivent envoyer
`sessionScope: "thread"` sur chaque `POST /session`. N'utilisez la portée `single`
par défaut que lorsque les clients partagent intentionnellement une session collaborative ; les sessions
partagées sérialisent les prompts via une file FIFO unique, visible via
`/daemon/status` sous la forme de `runtime.activity.pendingPrompts` et
`runtime.activity.queuedPrompts`.

Les appels `POST /session` simultanés pour le même espace de travail sont **fusionnés** (coalesced) en un seul spawn — les deux appelants obtiennent le même `sessionId`, et un seul rapporte `attached: false`. Si le spawn sous-jacent échoue (timeout d'initialisation, sortie d'agent malformée, OOM), **tous les appelants fusionnés reçoivent la même erreur** — le slot en cours est libéré afin qu'un appel ultérieur puisse réessayer depuis le début.

> ⚠️ **Le rejet de `modelServiceId` sur une nouvelle session est silencieux dans la
> réponse HTTP.** Un mauvais `modelServiceId` (faute de frappe, service non configuré)
> ne génère PAS une erreur 500 lors de la création — la session reste opérationnelle sur le
> modèle par défaut de l'agent, de sorte que l'appelant obtient toujours un `sessionId` avec lequel
> il peut retenter le changement de modèle (via `POST /session/:id/model`).
> Le signal d'échec visible est un événement `model_switch_failed` sur le
> flux SSE de la session, déclenché entre le handshake de spawn et votre
> premier subscribe. **Les abonnés qui doivent observer cet événement
> doivent passer `Last-Event-ID: 0` lors de leur premier `GET
/session/:id/events`** pour rejouer depuis le plus ancien événement disponible
> dans le ring (cela couvre le `model_switch_failed` au moment du spawn même si le
> subscribe arrive quelques ms après la réponse de création).

### `POST /session/:id/load`

Restaure une session ACP persistée par son id et rejoue son historique via SSE. L'id dans le chemin fait autorité ; tout champ `sessionId` dans le corps est ignoré. Pré-vérification de `caps.features.session_load` — les anciens daemons renvoient `404` pour cette route.

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Champ | Obligatoire | Notes                                                                                                                                                                                                                              |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | non         | Mêmes règles de canonisation + `workspace_mismatch` que pour `POST /session`. Omettre pour hériter de `/capabilities.workspaceCwd`. `mcpServers` n'est intentionnellement PAS accepté ici — le MCP à l'échelle du daemon est piloté par les paramètres (comme pour `POST /session`). |

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

`state` reflète le `LoadSessionResponse` de l'ACP — `models` est un `SessionModelState`, `modes` un `SessionModeState`, `configOptions` un tableau de `SessionConfigOption`. Les champs manquants sont décidés par l'agent. Les abonnés tardifs (les chemins `attached: true` ci-dessous) reçoivent le MÊME snapshot `state` que celui vu par l'appelant de chargement initial — le daemon le met en cache à l'entrée ; les mutations d'exécution (par ex. `model_switched`) sont délivrées sur le flux SSE, et non dans les réponses d'attachement ultérieures.

`attached: true` signifie que la session était déjà active (soit suite à un `session/load`/`session/resume` précédent, soit parce qu'un appelant concurrent fusionné a pris l'avance).

**Rejouer l'historique via SSE.** Pendant que `loadSession` est en cours d'exécution côté agent, l'agent émet des notifications `session_update` pour chaque tour persisté. Le daemon les met en buffer sur l'event-bus de la session avant que la réponse de la route ne soit renvoyée, de sorte que les abonnés qui appellent immédiatement `GET /session/:id/events` avec `Last-Event-ID: 0` voient le replay complet. **Le ring de replay est borné** (par défaut 8000 frames par session). Les longs historiques avec de nombreux tours d'appels d'outils / flux de pensées peuvent dépasser cette limite — les frames les plus anciennes sont supprimées silencieusement. Les clients qui ont besoin de l'historique complet doivent s'abonner immédiatement après le retour de `load` ; alternativement, ils peuvent persister les ids d'événements SSE et utiliser `Last-Event-ID` pour reprendre à partir d'une limite de tour ultérieure.

**Erreurs :**

- `404` — l'id de session persistée n'existe pas (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (même format que `POST /session`).
- `503` — `session_limit_exceeded` (compte dans la limite de `--max-sessions` ; les restaurations en cours sont également prises en compte).
- `409` — `restore_in_progress` (un `session/resume` pour le même id est déjà en cours). `Retry-After: 5`. Les courses de même action (deux `session/load` simultanés pour le même id) sont fusionnées — un seul renvoie `attached: false`, les autres renvoient `attached: true` avec le même `state`.
- `409` — `session_archived` lorsque l'id n'existe que sous `chats/archive/` ; appelez `POST /sessions/unarchive` avant `load` ou `resume`.
- `409` — `session_archiving` lorsqu'une archive ou un unarchive est en cours pour le même id. `Retry-After: 5`.
- `409` — `session_conflict` lorsque l'id existe à la fois dans `chats/` et `chats/archive/` ; supprimez la session avec `POST /sessions/delete` avant de la charger.

### `POST /session/:id/resume`

Restaure une session ACP persistée par son id SANS rejouer l'historique via SSE. Le contexte du modèle est restauré en interne côté agent (via `geminiClient.initialize` qui lit `config.getResumedSessionData`) ; le flux SSE reste propre pour les clients qui ont déjà l'historique rendu. Pré-vérification de `caps.features.session_resume` ; `unstable_session_resume` reste un alias de compatibilité obsolète pour les anciens clients.

Même format de requête que pour `/load`. Même format de réponse — `state` reflète le `ResumeSessionResponse` de l'ACP. Même enveloppe d'erreur, y compris `409 restore_in_progress` (qui se déclenche lorsqu'un `session/load` est en cours ; un `session/resume` en course derrière un autre `session/resume` est fusionné).

Utilisez `/load` lorsque le client n'a aucun historique rendu (reconnexion à froid, sélecteur → ouverture). Utilisez `/resume` lorsque le client a déjà les tours à l'écran et a seulement besoin de récupérer le handle côté daemon.

> ⚠️ **Pourquoi `unstable_session_resume` est-il encore annoncé ?** La route HTTP du daemon et la capacité `session_resume` sont stables pour la v1, mais le bridge appelle encore `connection.unstable_resumeSession` de l'ACP. L'ancien tag reste uniquement pour que les SDKs publiés avant `session_resume` puissent continuer à fonctionner.

### `GET /workspace/:id/sessions`

Liste les sessions persistées dont l'espace de travail canonique correspond à `:id` (cwd absolu encodé en URL). La liste par défaut contient les sessions actives de `chats/` ; passez `archiveState=archived` pour lister les sessions archivées de `chats/archive/`. `archiveState=all` n'est pas pris en charge dans la v1. La réponse par défaut et la sémantique numérique du `cursor` ne sont pas modifiées par `session_organization`.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
```

Paramètres de requête :

| Champ          | Obligatoire | Notes                                                                                                                                                                                              |
| -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | non         | `active` (par défaut) ou `archived`. Toute autre valeur renvoie `400 { code: "invalid_archive_state" }`.                                                                                           |
| `cursor`       | non         | Curseur de pagination de la réponse précédente.                                                                                                                                                    |
| `size`         | non         | Taille de la page. Les valeurs invalides renvoient `400 { code: "invalid_cursor" }` ou la validation de taille de page existante.                                                                  |
| `view`         | non         | Omettre pour la liste récente héritée. `organized` opte pour l'ordre épinglé/groupe côté serveur et ajoute des champs d'organisation optionnels. Toute autre valeur renvoie `400 { code: "invalid_session_view" }`. |
| `group`        | non         | Uniquement utile avec `view=organized`. `all` (par défaut), `pinned`, `ungrouped`, ou un id de groupe personnalisé. Les ids de groupe inconnus renvoient `404 { code: "group_not_found" }`.        |

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

Avec `view=organized`, le daemon lit `<Storage.getProjectDir(cwd)>/session-organization.v1.json`, renvoie les sessions épinglées en premier, puis l'heure d'activité par ordre décroissant, et enfin le `sessionId` pour les égalités stables. Le curseur organisé est un JSON base64url opaque et ne doit pas être réutilisé avec la liste récente héritée. `pinned` est un filtre virtuel, pas un groupe. `groupId: null` signifie non groupé. Les sessions archivées conservent leurs métadonnées d'organisation, mais `archiveState=archived&view=organized` renvoie toujours uniquement les sessions archivées.

Des champs supplémentaires peuvent apparaître sur chaque session lorsque `view=organized` :

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Les listes actives incluent des champs de surcouche daemon en direct tels que `clientCount` et `hasActivePrompt`. Les listes archivées sont uniquement basées sur le stockage : `isArchived` est `true`, et les champs de surcouche en direct restent absents ou faux. Tableau vide (et non 404) lorsqu'aucune session n'existe — une UI de sélecteur de session ne devrait pas générer d'erreur simplement parce que l'espace de travail est inactif.

### `GET /workspace/:id/session-groups`

Liste les groupes de sessions définis par l'utilisateur pour un espace de travail. Pré-vérification de `caps.features.includes('session_organization')`.

Réponse :

```json
{
  "groups": [
    {
      "id": "018f...",
      "name": "Frontend",
      "color": "blue",
      "order": 0,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "updatedAt": "2026-07-04T12:00:00.000Z"
    }
  ],
  "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
}
```

Les couleurs sont uniquement des tokens de protocole ; les clients localisent les noms d'affichage. Aucun groupe nommé par couleur par défaut n'est créé.

### `POST /workspace/:id/session-groups`

Crée un groupe de sessions personnalisé. Porte de mutation stricte. Pré-vérification de `caps.features.includes('session_organization')`.

Requête :

```json
{ "name": "Frontend", "color": "blue" }
```

`name` est rogné (trim), doit faire entre 1 et 64 caractères, ne peut pas contenir de caractères de contrôle, et est unique dans l'espace de travail par comparaison rognée insensible à la casse. Les noms en double renvoient `409 { code: "group_name_conflict" }`. `color` doit être l'une des `colorOptions` renvoyées.

Réponse :

```json
{
  "group": {
    "id": "018f...",
    "name": "Frontend",
    "color": "blue",
    "order": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `PATCH /workspace/:id/session-groups/:groupId`

Met à jour un groupe de sessions personnalisé. Porte de mutation stricte. Pré-vérification de `caps.features.includes('session_organization')`. Les champs du corps sont optionnels : `{ "name"?: string, "color"?: string, "order"?: number }`. Les ids de groupe inconnus renvoient `404 { code: "group_not_found" }` ; les noms et couleurs en double ou invalides utilisent les mêmes erreurs que pour la création.

### `DELETE /workspace/:id/session-groups/:groupId`

Supprime un groupe de sessions personnalisé. Porte de mutation stricte. Pré-vérification de `caps.features.includes('session_organization')`. Les sessions référençant le groupe sont vidées à `groupId: null` ; l'état épinglé est préservé. La réponse est `{ "deleted": true }` lorsqu'un groupe a été supprimé et `{ "deleted": false }` lorsque l'id n'existait pas.
### `POST /sessions/delete`

Suppression définitive d'un ou plusieurs fichiers JSONL de session persistés. Le démon ferme d'abord les sessions actives dans la mesure du possible, puis supprime le JSONL actif ou archivé. Si des copies actives et archivées existent pour le même id, les deux sont supprimées. Les sidecars du worktree des deux côtés sont nettoyés ; l'historique des fichiers, les transcripts des sous-agents et les sidecars d'exécution sont intentionnellement conservés.

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

Response:

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

Archiver une ou plusieurs sessions. L'archivage est une transition d'état, pas une suppression : le JSONL passe de `chats/<id>.jsonl` à `chats/archive/<id>.jsonl`. L'historique des fichiers, les transcripts des sous-agents et les sidecars d'exécution restent en place. Si une session est active, le démon effectue d'abord une fermeture stricte et exige que le gestionnaire de fermeture de l'agent ACP flush l'enregistrement du chat ; si la fermeture ou le flush échoue, le JSONL n'est pas déplacé. Pré-vérification `caps.features.session_archive`.

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

`sessionIds` doit être un tableau de chaînes non vide contenant au maximum 100 ids. Les doublons sont éliminés.

Response:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "notFound": [],
  "errors": []
}
```

Les entrées de `errors` ont la forme `{ "sessionId": "<uuid>", "error": "message" }`. Les fichiers actifs et archivés ayant le même id sont traités comme un conflit et signalés dans `errors` ; aucun fichier n'est écrasé.

### `POST /sessions/unarchive`

Restaurer les sessions archivées dans le répertoire actif. Cela ne relance pas la session en soi ; cela déplace uniquement `chats/archive/<id>.jsonl` vers `chats/<id>.jsonl`. Une fois le désarchivage réussi, les clients peuvent appeler `POST /session/:id/load` ou `POST /session/:id/resume`.

Request:

```json
{ "sessionIds": ["<uuid>"] }
```

Response:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "notFound": [],
  "errors": []
}
```

Si un JSONL actif existe déjà pour l'id, le désarchivage signale un conflit dans `errors` et ne l'écrase pas. Une opération d'archivage ou de désarchivage en cours pour le même id retourne `409 session_archiving` avant de démarrer le lot.

ACP-over-HTTP utilise les mêmes corps de requête et de réponse via les méthodes vendor `_qwen/sessions/archive` et `_qwen/sessions/unarchive`. La table de routes REST mappe `POST /sessions/archive` et `POST /sessions/unarchive` à ces méthodes pour les transports ACP.

### `POST /session/:id/prompt`

Transmettre un prompt à l'agent. Les appelants multi-prompts mettent en file d'attente FIFO par session (ACP garantit un seul prompt actif par session).

Request:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }]
}
```

Validation : `prompt` doit être un tableau d'objets non vide. Les autres échecs retournent `400` avant d'atteindre le bridge.

Response:

```json
{ "stopReason": "end_turn" }
```

Autres raisons d'arrêt : `cancelled`, `max_tokens`, `error`, `length` (selon la spec ACP).

Si le client HTTP se déconnecte en plein prompt, le démon envoie une notification ACP `cancel` à l'agent, qui termine le prompt avec `stopReason: "cancelled"`.

> **Limitation de la Stage 1 — pas de timeout de prompt côté serveur.** Le bridge
> se contente de mettre en concurrence le `prompt()` de l'agent avec
> `transportClosedReject` (le crash du processus enfant de l'agent) et
> l'AbortSignal de déconnexion HTTP de l'appelant. Un agent bloqué mais
> vivant (par ex. un appel de modèle qui reste bloqué) bloque la FIFO
> par session jusqu'à ce que le client HTTP expire de son côté et se
> déconnecte. Les prompts de longue durée sont légitimes (recherche
> approfondie, analyse de codebase volumineuse), c'est pourquoi aucun
> délai par défaut n'est délibérément défini ; la Stage 2 exposera une
> option configurable `promptTimeoutMs`. En attendant, les appelants
> doivent définir leur propre timeout côté client et se déconnecter
> (ou appeler `POST /session/:id/cancel`) à l'expiration.

### `POST /session/:id/cancel`

Annuler le prompt **actuellement actif** sur la session. Côté ACP, il s'agit d'une notification, pas d'une requête — l'agent accuse réception en résolvant le `prompt()` actif avec `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrat multi-prompt :** l'annulation n'affecte que le prompt actif.
> Tous les prompts précédemment POSTés par le même client et toujours en
> file d'attente derrière le prompt actif continueront de s'exécuter. La
> mise en file d'attente multi-prompt est un comportement introduit par
> le démon (absent de la spec ACP) ; le contrat pour les prompts en file
> d'attente est "ils continuent de s'exécuter sauf si vous les annulez
> un par un, ou si vous tuez la session via la sortie du canal".

Si les prompts en file d'attente sont inattendus dans un déploiement multi-clients, vérifiez d'abord
si les appelants partagent une session par défaut `sessionScope: "single"`. Pour
des conversations indépendantes par thread, créez des sessions avec
`sessionScope: "thread"` afin que les prompts ne se sérialisent qu'à l'intérieur de ce thread.

### `DELETE /session/:id`

Fermer explicitement une session active. Force la fermeture même si d'autres clients sont attachés — annule tout prompt actif, résout les permissions en attente comme annulées, publie l'événement `session_closed`, ferme l'EventBus et supprime la session des maps du démon. Les sessions persistées sur disque ne sont PAS supprimées — elles peuvent être rechargées via `POST /session/:id/load`. Pré-vérification `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent : retourne `404` pour les sessions inconnues (même forme `SessionNotFoundError` que les autres routes).

> **Événement `session_closed`.** Les abonnés SSE reçoivent un événement terminal `session_closed` avec `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` avant la fin du flux. Les reducers du SDK traitent cela de manière identique à `session_died` (définit `alive: false`, efface `pendingPermissions`).

### `PATCH /session/:id/metadata`

Mettre à jour les métadonnées mutables de la session. Actuellement, seul `displayName` est pris en charge. Pré-vérification `caps.features.session_metadata`. Le regroupement et l'épinglage ne font intentionnellement pas partie de cette route ; utilisez `PATCH /session/:id/organization` sous `session_organization`.

Request:

```json
{ "displayName": "My Investigation Session" }
```

| Champ         | Requis | Notes                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | non       | Chaîne de caractères, max 256 caractères. Une chaîne vide efface le nom. Omettre pour laisser tel quel. |

Response:

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publie un événement `session_metadata_updated` sur le flux SSE de la session avec `{ sessionId, displayName }`.

### `PATCH /session/:id/organization`

Mettre à jour l'état d'organisation local de la session. Gate de mutation strict. Pré-vérification `caps.features.includes('session_organization')`.

Request:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Champ      | Requis | Notes                                                                                                |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | non       | Booléen. `true` définit `pinnedAt` s'il n'était pas déjà épinglé ; `false` efface `pinnedAt`.             |
| `groupId`  | non       | Id de groupe personnalisé ou `null` pour non groupé. Les ids de groupe inconnus retournent `404 { code: "group_not_found" }`. |

Response:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

Cet état est stocké dans le sidecar d'organisation de session au niveau du projet, sous le répertoire de stockage d'exécution du démon. Ce n'est pas du contenu de transcript, cela ne met pas à jour le `mtime` du transcript, n'est pas exporté avec les transcripts, et est conservé lors de l'archivage/désarchivage.

### `POST /session/:id/heartbeat`

Mettre à jour la comptabilité last-seen du démon pour cette session. Les adaptateurs de longue durée (TUI/IDE/web) pingent cela à intervalle régulier afin que la future politique de révocation (Wave 5 PR 24) puisse distinguer les clients morts des clients silencieux.

Headers:

| Header             | Requis | Notes                                                                                                                                                                                                                                   |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | non       | Renvoie l'id émis par le démon depuis `POST /session`. Les clients identifiés mettent également à jour leur timestamp par client ; les heartbeats anonymes ne mettent à jour que le watermark par session. Doit satisfaire la même forme `[A-Za-z0-9._:-]{1,128}` qu'ailleurs. |

Le corps de la requête est vide (`{}` convient — aucun champ n'est lu aujourd'hui).

Response:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` est renvoyé uniquement lorsqu'un `X-Qwen-Client-Id` de confiance a été fourni. `lastSeenAt` est l'époque `Date.now()` (ms) côté démon que le bridge a stockée.

Erreurs:

- `400` — `{ code: 'invalid_client_id' }` lorsque l'en-tête est malformé (règle de forme de l'en-tête) ou lorsqu'il porte un `clientId` qui n'est pas enregistré pour cette session (le bridge lève `InvalidClientIdError` avant de mettre à jour un quelconque timestamp).
- `404` — session inconnue.

Gating de capacité : pré-vérification `caps.features.client_heartbeat`. Les démons plus anciens retournent `404` pour ce chemin.

### `POST /session/:id/model`

Changer le modèle actif **au sein** du service de modèle actuellement lié à la session. Sérialisé via la file de changement de modèle par session.

(Pour changer le _service_ lui-même — Alibaba ModelStudio vs OpenRouter, etc. — passez `modelServiceId` sur `POST /session` pour une nouvelle session. La Stage 1 n'a pas de route de changement de service en direct.)

Request:

```json
{ "modelId": "qwen-staging" }
```

Response:

```json
{ "modelId": "qwen-staging" }
```

En cas de succès, publie `model_switched` sur le flux SSE. En cas d'échec, publie `model_switch_failed` (afin que les abonnés passifs voient l'échec, et pas seulement l'appelant). Entre en concurrence avec la sortie du canal de l'agent afin qu'un processus enfant bloqué ne puisse pas bloquer le gestionnaire HTTP.

### `POST /session/:id/recap`

Tag de capacité : `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Générer un résumé en une phrase "où en étais-je" de la session. Enveloppe le `generateSessionRecap` du core (`packages/core/src/services/sessionRecap.ts`), qui exécute une side-query sur le modèle rapide avec les outils désactivés, `maxOutputTokens: 300`, et un format de sortie strict `<recap>...</recap>`. La side-query lit l'historique de chat GeminiClient existant de la session et ne l'enrichit **pas**.

Le corps de la requête est ignoré (envoyez `{}` ou vide). Gate de mutation non strict — la posture est identique à `/session/:id/prompt` (l'appel coûte des tokens mais ne mute aucun état). Aucun événement SSE n'est publié.

Response (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` est `null` (un 200 normal, pas une erreur) lorsque :

- la session a moins de deux tours de dialogue pour l'instant,
- la side-query n'a retourné aucune charge utile `<recap>...</recap>` extractible,
- ou qu'une erreur de modèle sous-jacente s'est produite (le helper du core est best-effort et ne lève jamais d'exception).

Erreurs:

- `400 {code: 'invalid_client_id'}` — en-tête `X-Qwen-Client-Id` malformé.
- `404` — session inconnue.

Annulation : **aucune en v1**. La route n'écoute pas la déconnexion du client HTTP, aucun `AbortSignal` n'est intégré au bridge, et le processus enfant ACP exécute la side-query jusqu'au bout, que l'appelant se soit déconnecté ou non. Les seules limites sont le timeout de secours de 60s du bridge (`SESSION_RECAP_TIMEOUT_MS`) et la concurrence transport-closed contre la mort du canal ACP. C'est acceptable car le recap est court (tentative unique, `maxOutputTokens: 300`, ~1-5s en général) ; une ext-method d'annulation basée sur un request-id pourra intégrer une annulation de bout en bout complète dans une future version si le coût en bande passante le justifie un jour.

### Mutation: approval, tools, init, MCP restart
Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 ajoute quatre routes de contrôle de mutation qui permettent aux clients distants de modifier la posture d'exécution sans toucher au CLI de l'hôte du démon. Les quatre routes :

- Sont protégées par la gate de mutation **strict** de la PR 15. Un démon configuré sans bearer token les rejette avec `401 {code: 'token_required'}`. Configurez `--token` (ou `QWEN_SERVER_TOKEN`) avant d'y souscrire.
- Acceptent et estampillent le header `X-Qwen-Client-Id` (chaîne d'audit de la PR 7). Lorsque le header contient un id de confiance, le démon émet `originatorClientId` sur l'événement SSE correspondant, afin que les UI multi-clients puissent supprimer les échos de leurs propres mutations.
- Vérifient en pre-flight chaque capacité par tag avant d'exposer l'affordance. Les démons plus anciens renvoient `404` pour la route.

Trois des quatre routes (`tools/:name/enable`, `init`, `mcp/:server/restart`) émettent des événements **à l'échelle du workspace** : chaque bus SSE de session active reçoit l'événement, quelle que soit la session attachée lorsque la mutation a été déclenchée. `approval-mode` émet un événement **à l'échelle de la session** car le changement est local au `Config` d'une seule session.

#### `POST /session/:id/approval-mode`

Capability tag : `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Modifie le mode d'approbation d'une session active. Le nouveau mode est appliqué immédiatement dans le `Config` par session de l'enfant ACP. Les paramètres ne sont PAS écrits sur le disque par défaut — passez `persist: true` pour écrire également `tools.approvalMode` dans les paramètres du workspace.

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
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — le mode demandé nécessite un dossier de confiance (les modes privilégiés dans les workspaces non approuvés sont rejetés par `Config.setApprovalMode` du core).
- `404` — session inconnue.

Événement SSE (à l'échelle de la session) : `approval_mode_changed` avec `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Capability tag : `workspace_tool_toggle`. E/S fichier pures — pas d'aller-retour ACP.

Active ou désactive un outil dans la liste de paramètres `tools.disabled` du workspace. Les outils listés ici ne sont **pas enregistrés** du tout (contrairement à `permissions.deny`, qui garde l'outil enregistré et rejette l'invocation). Les outils intégrés et les outils découverts via MCP passent tous deux par `ToolRegistry.registerTool`, qui consulte l'ensemble des outils désactivés.

> ⚠️ **Les noms doivent correspondre exactement à l'identifiant exposé par le registre.** Aucune résolution d'alias n'est effectuée — la route stocke la chaîne exacte du paramètre de chemin dans `tools.disabled`, et le prochain enfant ACP la compare à `tool.name` au moment de l'enregistrement. Les outils intégrés utilisent leur nom de registre canonique (forme verbe en snake_case) : `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — et NON les libellés d'affichage (`Shell`, `Read`, `Write`) affichés par le CLI. Les outils découverts via MCP utilisent la forme qualifiée `mcp__<server>__<name>` (qui est également la forme diffusée par les événements `tool_toggled` et celle listée par `GET /workspace/mcp`). Désactiver `Bash` n'empêchera PAS `run_shell_command` de s'enregistrer lors de la prochaine session.

Les enfants ACP actifs conservent les outils déjà enregistrés — le basculement prend effet au **prochain** spawn d'enfant ACP. Combinez cette route avec `POST /workspace/mcp/:server/restart` (pour les outils provenant de MCP) ou la création d'une nouvelle session pour rendre le changement effectif dans le démon actuel.

Les noms d'outils inconnus sont acceptés : désactiver par anticipation un outil MCP pas encore installé est un cas d'usage légitime.

Requête :

```json
{ "enabled": false }
```

Réponse (200) :

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Erreurs :

- `400 {code: 'invalid_tool_name'}` — paramètre de chemin vide, ou paramètre de chemin dépassant la limite de 256 caractères.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` manquant ou non booléen.

Événement SSE (à l'échelle du workspace) : `tool_toggled` avec `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Capability tag : `workspace_init`. E/S fichier pures — pas d'aller-retour ACP, **aucune invocation de LLM**.

Génère un `QWEN.md` vide (ou quel que soit le fichier retourné par `getCurrentGeminiMdFilename()` avec les overrides de `--memory-file-name`) à la racine du workspace lié au démon. Action purement mécanique — pour un remplissage de contenu par IA, enchaînez avec `POST /session/:id/prompt`.

Par défaut, refuse d'écraser le fichier si le fichier cible existe avec du contenu autre que des espaces. Les fichiers ne contenant que des espaces sont traités comme absents (correspond au comportement de la commande slash locale `/init`).

Requête :

```json
{ "force": false }
```

Réponse (200) :

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` vaut `'created'` pour les nouvelles créations, `'noop'` lorsqu'un fichier existant ne contenant que des espaces a été laissé intact (aucune écriture effectuée), et `'overwrote'` lorsque `force: true` a remplacé du contenu non vide. L'événement SSE `workspace_initialized` reflète l'action de la réponse — les observateurs peuvent filtrer sur `action !== 'noop'` pour réagir uniquement aux changements réels sur le disque.

Erreurs :

- `400 {code: 'invalid_force_flag'}` — `force` n'est pas un booléen.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — le fichier existe avec du contenu non vide et `force` est omis ou false. Le corps de la réponse contient le chemin absolu et la taille (en octets) afin que les clients SDK puissent afficher une invite "écraser N octets ?" sans avoir à refaire un `stat`.

Événement SSE (à l'échelle du workspace) : `workspace_initialized` avec `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Capability tag : `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Redémarre un serveur MCP configuré via `McpClientManager.discoverMcpToolsForServer` de l'enfant ACP (déconnexion + reconnexion + redécouverte). Vérifie au préalable l'instantané du budget en direct issu de la comptabilité de la PR 14 v1, afin qu'un redémarrage sur un workspace ayant atteint la limite du budget renvoie un refus souple plutôt que de déclencher une cascade de `BudgetExhaustedError`.

Le corps de la requête est vide (`{}`). Le paramètre de chemin est le nom du serveur encodé pour URL tel qu'il apparaît dans la configuration `mcpServers`.

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

Raisons de skip souple (toutes renvoient 200) :

| `reason`                | Meaning                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Une autre découverte / redémarrage pour ce serveur est déjà en cours. La route retourne immédiatement au lieu d'attendre la promesse originale. L'appelant doit réessayer après un court délai. |
| `'disabled'`            | Le serveur est configuré mais listé dans `excludedMcpServers`. Réactivez-le avant le redémarrage.                                                                                                    |
| `'budget_would_exceed'` | Le démon est en `--mcp-budget-mode=enforce`, le serveur cible n'est pas actuellement dans `reservedSlots`, et le total en direct a atteint `clientBudget`. L'appelant doit d'abord libérer un slot.         |

Erreurs (non-2xx) :

- `400 {code: 'invalid_server_name'}` — paramètre de chemin vide.
- `404` — nom de serveur absent de la configuration `mcpServers`, ou aucun canal ACP actif n'existe (le redémarrage nécessite intrinsèquement une instance active de `McpClientManager`).
- `500` — erreur interne (par ex. `ToolRegistry` non initialisé).

Événements SSE (à l'échelle du workspace) : `mcp_server_restarted` avec `{serverName, durationMs, originatorClientId?}` en cas de succès ; `mcp_server_restart_refused` avec `{serverName, reason, originatorClientId?}` en cas de skip souple.

### `GET /session/:id/events` (SSE)

S'abonner au flux d'événements de la session.

Headers :

```
Accept: text/event-stream
Last-Event-ID: 42        ← optionnel, replay depuis après l'id 42
```

Query params :

| Param       | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | non       | Limite de **backlog de frames en direct** par abonné. Plage `[16, 2048]`, par défaut 256. Les frames de replay poussées de force au moment de l'abonnement sont exemptées des limites de frames et d'octets ; ce qui les consomme réellement, ce sont les événements en direct qui arrivent pendant que l'abonné est encore en train de drainer un gros replay `Last-Event-ID: 0`. Augmentez cette valeur pour les reconnexions à froid afin que le tail en direct ne déclenche pas l'avertissement / l'éviction de client lent avant que le consommateur ne rattrape son retard. La limite d'octets sérialisés en direct est fixe côté démon (par défaut 2 MiB) et n'a pas de paramètre de requête. Les valeurs hors plage / non décimales / présentes mais vides renvoient `400 invalid_max_queued` avant l'ouverture du handshake SSE. Pre-flight `caps.features.slow_client_warning` — les anciens démons ignorent silencieusement ce paramètre. |

Format de frame. La ligne `data:` est **l'enveloppe d'événement complète**, sérialisée en JSON sur une seule ligne — `{id?, v, type, data, originatorClientId?}`. Le payload spécifique à l'ACP (arguments `sessionUpdate`, `requestPermission`, etc.) se trouve sous le champ `data` de l'enveloppe ; le `type` propre à l'enveloppe correspond à la ligne SSE `event:`.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← toutes les 15s, pas de payload

event: client_evicted    ← frame terminale, pas d'id (synthétique)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← frame terminale pour dépassement d'octets, pas d'id (synthétique)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

Les lignes `id:` / `event:` au niveau SSE dupliquent `envelope.id` / `envelope.type` pour la compatibilité avec EventSource. Les consommateurs utilisant `fetch` brut (comme `parseSseStream` du SDK) lisent tout depuis l'enveloppe JSON et ignorent les lignes de préambule SSE.
| Type d'événement          | Déclencheur                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`          | Toute notification ACP `sessionUpdate` (chunks LLM, appels d'outils, utilisation)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `permission_request`      | L'agent a demandé l'approbation d'un outil                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `permission_resolved`     | Un client a voté sur une permission via `POST /permission/:requestId`                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `permission_partial_vote` | (consensus uniquement) Un vote a été enregistré mais le quorum n'est pas encore atteint. Contient `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pré-vérification `caps.features.permission_mediation`.                                                                                                                                                                                                                                                              |
| `permission_forbidden`    | Un vote a été rejeté par la politique active (incompatibilité `designated`, `local-only` non-loopback, ou votant `consensus` absent du snapshot). Contient `{requestId, sessionId, clientId?, reason}`. Pré-vérification `caps.features.permission_mediation`.                                                                                                                                                                                                                                     |
| `model_switched`          | `POST /session/:id/model` a réussi                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `model_switch_failed`     | `POST /session/:id/model` a été rejeté                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `session_died`            | Le processus enfant de l'agent a crashé de manière inattendue. **Terminal : le flux SSE se ferme après cette trame ; la session est supprimée de `byId`.** Les abonnés doivent se reconnecter via `POST /session` pour en créer une nouvelle.                                                                                                                                                                                                                                                   |
| `slow_client_warning`     | Local à l'abonné : backlog de trames en direct ou backlog d'octets sérialisés en direct ≥ 75 % plein. **Non-terminal** — le flux continue ; l'avertissement est une alerte avant eviction. Contient `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}` où `threshold` est `frames`, `bytes` ou `frames_and_bytes`. Se déclenche UNE SEULE FOIS par épisode de dépassement ; se réarme après que les deux mesures redescendent sous les 37,5 %. Pas d'`id` (synthétique). Pré-vérification `caps.features.slow_client_warning`. |
| `client_evicted`          | Local à l'abonné : débordement de file d'attente. `reason` est `queue_overflow` pour la limite de trames en direct et `queue_bytes_overflow` pour la limite d'octets sérialisés en direct. **Terminal : le flux SSE se ferme après cette trame** (pas d'`id` — synthétique). Les autres abonnés sur la même session continuent.                                                                                                                                                                    |
| `stream_error`            | Erreur côté démon lors du fan-out. **Terminal : le flux SSE se ferme après cette trame** (pas d'`id` — synthétique).                                                                                                                                                                                                                                                                                                                                                                              |

Sémantique de reconnexion :

- Envoyez `Last-Event-ID: <n>` pour rejouer les événements avec `id > n` depuis le ring par session (profondeur par défaut **8000**, ajustable via `qwen serve --event-ring-size <n>`)
- **Détection de lacunes (côté client) :** si `<n>` est antérieur à l'événement le plus ancien encore présent dans le ring (par ex. vous vous reconnectez avec `Last-Event-ID: 50` mais le ring contient maintenant 200–1199), le démon rejoue depuis l'événement disponible le plus ancien sans lever d'erreur. Comparez l'`id` du premier événement rejoué avec `n + 1` ; toute différence correspond à la taille de la fenêtre perdue. L'étape 2 injectera une trame synthétique explicite `stream_gap` côté démon ; à l'étape 1, la détection est de la responsabilité du client.
- Les ID sont monotones par session, en commençant à 1
- Les trames synthétiques (`client_evicted`, `slow_client_warning`, `stream_error`) omettent intentionnellement l'`id` afin de ne pas consommer un emplacement de séquence pour les autres abonnés

Backpressure :

- La file d'attente par abonné a par défaut `maxQueued: 256` éléments en direct, plus une limite de 2 Mio d'octets sérialisés en direct gérée par le démon. Les trames de relecture (replay) lors de la reconnexion, `slow_client_warning` et `client_evicted` contournent ces deux limites.
- Remplacez uniquement la limite de trames via `?maxQueued=N` (plage `[16, 2048]`) sur la requête SSE. Il n'y a volontairement pas de `?maxQueuedBytes` ; les clients ne peuvent pas augmenter le budget mémoire du démon.
- Lorsque le backlog de trames en direct ou le backlog d'octets en direct d'un abonné dépasse 75 % de capacité, le bus force l'envoi d'une trame synthétique `slow_client_warning` à cet abonné (une fois par épisode de dépassement ; réarmé après que les deux mesures redescendent sous les 37,5 %). Le flux reste ouvert — l'avertissement sert d'alerte pour que le client puisse se vider plus rapidement ou se détacher et se reconnecter proprement.
- Si la limite de trames en direct déborde, le bus émet `client_evicted` avec `reason: "queue_overflow"`. Si la limite d'octets en direct déborde, il émet `reason: "queue_bytes_overflow"`. Dans les deux cas, la trame terminale est envoyée de force et l'abonnement est fermé.

### `POST /permission/:requestId`

Votez sur une `permission_request` en attente. La **politique de médiation** active décide qui l'emporte :

| Politique                   | Comportement                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (par défaut) | Tout votant validé l'emporte ; les votants ultérieurs reçoivent `404`. Ligne de base pré-F3.                                                                                                                                                                            |
| `designated`                | Seul l'origine du prompt (`originatorClientId`) décide ; les non-origines reçoivent `403 permission_forbidden / designated_mismatch`. Bascule sur first-responder pour les prompts anonymes.                                                                            |
| `consensus`                 | N votants sur M doivent être d'accord (par défaut `N = floor(M/2) + 1`, modifiable via `policy.consensusQuorum`). La première option à atteindre `N` l'emporte. Les votes non résolutifs reçoivent `200` + des trames SSE `permission_partial_vote`.                   |
| `local-only`                | Seuls les votants en loopback décident ; les appelants distants reçoivent `403 permission_forbidden / remote_not_allowed`.                                                                                                                                             |

La politique active est configurée dans `settings.json` sous `policy.permissionStrategy` et exposée sur `/capabilities` à `body.policy.permission`. Pré-vérification `caps.features.permission_mediation` (avec `modes: [...]`) pour l'ensemble pris en charge par la build.

> **F3 (#4175) : coordination des permissions multi-clients.** F3 a ajouté les quatre politiques ci-dessus. Les démons pré-F3 avaient first-responder en dur ; le format sur le fil reste strictement identique bit pour bit lorsque la politique configurée est `first-responder`. Les nouveaux événements (`permission_partial_vote`, `permission_forbidden`) sont additifs — les anciens SDK les voient comme `unrecognized_known_event` et les ignorent gracieusement.

> **Délai d'expiration des permissions (par défaut 5 minutes).** Une `permission_request`
> reste en attente jusqu'à ce que : (a) un client vote ici, (b) `POST /session/:id/cancel`
> soit déclenché, (c) le client HTTP qui pilote le prompt se déconnecte
> (l'annulation en cours de prompt résout les permissions en attente comme `cancelled`),
> (d) la session soit tuée, (e) le démon s'arrête, **ou
> (f) le délai d'expiration des permissions par session se déclenche** (`DEFAULT_PERMISSION_TIMEOUT_MS`,
> 5 minutes). Lors du déclenchement du délai, le `requestPermission` de l'agent se résout
> avec `{outcome: 'cancelled'}`, le ring d'audit enregistre une
> entrée `permission.timeout`, le stderr du démon émet un breadcrumb
> d'une ligne, et le bus SSE diffuse la trame annulée standard
> `permission_resolved` afin que les abonnés nettoient leurs états. Le
> délai est configurable via `BridgeOptions.permissionResponseTimeoutMs` ;
> les appelants headless exécutant des prompts de longue durée voudront
> peut-être l'étendre.

Requête :

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Outcomes :

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — accepter / rejeter / procéder une fois / etc., selon les choix proposés par l'agent
- `{ "outcome": "cancelled" }` — abandonner la requête (correspond à ce que font `cancelSession` / `shutdown` en interne)

Réponse :

- `200 {}` — votre vote a été accepté (résolu OU enregistré sous le quorum de consensus)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3 : la politique active a rejeté votre vote
- `404 { "error": "..." }` — le requestId est inconnu (déjà résolu, n'a jamais existé, ou session détruite)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3 : les `allowedOptionIds` de l'agent contiennent la sentinelle réservée `'__cancelled__'` ; violation du contrat agent / démon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 compatibilité ascendante (forward-compat) : un littéral de politique a atterri dans le schéma mais sa branche de médiateur n'est pas encore construite (actuellement inatteignable ; réservé pour les politiques futures)
Après un vote réussi, chaque client connecté reçoit `permission_resolved` avec le même `requestId` et l'`outcome` choisi. Sous `consensus`, les votes intermédiaires diffusent également `permission_partial_vote` jusqu'à l'obtention du quorum.

### Routes du device flow d'authentification (issue #4175 PR 21)

Le daemon orchestre une OAuth 2.0 Device Authorization Grant (RFC 8628) afin qu'un client SDK distant puisse déclencher une connexion dont les tokens atterrissent sur le système de fichiers du **daemon** — et non sur celui du client. Le daemon interroge lui-même l'IdP ; le seul rôle du client est d'afficher l'URL de vérification + le code utilisateur et (optionnellement) de s'abonner aux événements SSE de complétion.

Capability tag : `auth_device_flow` (toujours annoncé). Providers supportés en v1 : `qwen-oauth`.

> [!note]
>
> Le niveau gratuit de Qwen OAuth a été interrompu le 15/04/2026. Considérez `qwen-oauth` comme l'identifiant de provider hérité de la v1 dans ce protocole ; les nouveaux clients doivent privilégier un provider d'authentification actuellement supporté lorsqu'il y en a un de disponible.

**Localité d'exécution.** Le daemon ne lance jamais de navigateur — même s'il le peut. Le client décide d'appeler ou non `open(verificationUri)` localement ; sur un pod headless (le déploiement canonique du Mode B), l'utilisateur ouvre l'URL sur n'importe quel appareil disposant d'un navigateur. Consultez `docs/users/qwen-serve.md` pour l'UX recommandée.

**Aucune fuite de token dans les événements.** `auth_device_flow_started` ne contient que `{deviceFlowId, providerId, expiresAt}`. Le code utilisateur et l'URL de vérification sont renvoyés point à point dans le corps de la réponse POST 201 et via `GET /workspace/auth/device-flow/:id` ; ils ne sont jamais diffusés sur SSE.

**Singleton par provider.** Un second `POST` pour le même provider alors qu'un flux est en attente constitue une prise de contrôle idempotente : il renvoie l'entrée existante avec `attached: true` au lieu de lancer une nouvelle requête vers l'IdP.

#### `POST /workspace/auth/device-flow`

Porte de mutation stricte : requiert un bearer token même sur les valeurs par défaut de loopback sans token (`401 token_required`).

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
- `502 upstream_error` — l'IdP a renvoyé une erreur inattendue

#### `GET /workspace/auth/device-flow/:id`

Lit l'état actuel. Les entrées en attente renvoient `userCode/verificationUri/expiresAt/intervalMs` ; les entrées terminales (délai de grâce de 5 min) les omettent et exposent `status` + `errorKind/hint` optionnels.

Renvoie `404 device_flow_not_found` pour les ids inconnus et les entrées évincées après le délai de grâce.

#### `DELETE /workspace/auth/device-flow/:id`

Annulation idempotente :

- entrée en attente → `204` + émission de `auth_device_flow_cancelled`
- entrée terminale → `204` no-op (pas de réémission d'événement)
- id inconnu → `404`

#### `GET /workspace/auth/status`

Snapshot des flux en attente + providers supportés :

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

#### Événements SSE du device flow

Cinq événements typés (scope workspace, diffusés sur chaque bus de session actif) :

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — le POST a réussi ; le SDK doit s'abonner (pas de userCode ici, à récupérer via GET si nécessaire)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — le daemon a honoré le `slow_down` upstream ; les clients qui pollent le GET doivent augmenter leur intervalle en conséquence
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — identifiants persistés ; `accountAlias` est un label non-PII (jamais d'email/téléphone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal ; `errorKind` est l'un des suivants : `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` est interne au daemon : l'échange avec l'IdP a réussi mais le daemon n'a pas pu stocker les identifiants de manière durable (EACCES / EROFS / ENOSPC). L'utilisateur doit réessayer une fois que le problème de disque sous-jacent est résolu.
- `auth_device_flow_cancelled` `{deviceFlowId}` — le DELETE a réussi sur une entrée en attente

> **Non compatible MCP.** La spécification d'autorisation MCP (2025-06-18) impose OAuth 2.1 + PKCE auth-code avec une redirection de callback, ce qui ne fonctionne pas pour les daemons sur pods headless. La surface du device flow du Mode B est privée au daemon — les clients ciblant des serveurs conformes à MCP doivent utiliser un autre chemin d'authentification.

## Format du flux (wire format)

Les événements sont émis sous forme de trames EventSource standard. Le daemon écrit une ligne `data:` par trame (le JSON n'a pas de sauts de ligne intégrés après `JSON.stringify`) ; le parser SDK dans `packages/sdk-typescript/src/daemon/sse.ts` gère à la fois cela et la forme multi-`data:` autorisée par la spécification côté réception.

## Trames d'erreur pendant le streaming

Si l'itérateur du bridge lève une exception lors du service d'un abonné SSE, le daemon émet une trame `stream_error` terminale (sans `id`). La ligne `data:` est l'enveloppe complète (même forme que toutes les autres trames SSE de ce document) ; le message d'erreur réel se trouve sous `envelope.data.error` :

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

La connexion se ferme alors.

## Variables d'environnement

| Var                 | Objectif                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer token. Les espaces blancs de début et de fin sont supprimés au démarrage. |

## Structure du code source

| Chemin                                                 | Objectif                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | Commande yargs + schéma de flags                                                                                |
| `packages/cli/src/serve/run-qwen-serve.ts`           | Cycle de vie du listener + gestion des signaux                                                                       |
| `packages/cli/src/serve/server.ts`                   | Assemblage de l'application Express, ordre des middlewares et routes directes restantes                                     |
| `packages/cli/src/serve/routes/*.ts`                 | Groupes de routes Express ciblés, incluant les routes de session, SSE, auth workspace, statut workspace et fichiers    |
| `packages/cli/src/serve/auth.ts`                     | bearer + allowlist Host + refus CORS                                                                        |
| `packages/cli/src/serve/acp-session-bridge.ts`       | Facade de compatibilité du bridge local CLI pour spawn-or-attach, FIFO par session et registre de permissions       |
| `packages/acp-bridge/src/status.ts`                  | Types wire du statut daemon en lecture seule + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | Helper pur qui construit les payloads `/workspace/env` à partir de l'état `process.*`, incluant le masquage des identifiants   |
| `packages/acp-bridge/src/eventBus.ts`                | File asynchrone bornée + anneau de rejeu                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | Client TS                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | Parser de trames EventSource                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 cas, sans LLM                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 cas, vrai child `qwen --acp` soutenu par le faux serveur OpenAI local (POSIX uniquement ; ignoré sur Windows)   |