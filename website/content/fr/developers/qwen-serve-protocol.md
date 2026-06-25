# Référence du protocole HTTP de `qwen serve`

Étape 1 de la [conception du démon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Toutes les routes se trouvent sous l'URL de base du démon (par défaut `http://127.0.0.1:4170`).

## Authentification

Lorsque le démon a été démarré avec `--token` ou `QWEN_SERVER_TOKEN`, **chaque route sauf `/health` sur les liaisons loopback** doit comporter :

```
Authorization: Bearer <token>
```

Sans jeton configuré (par défaut de développement sur loopback), l'en-tête est facultatif. La comparaison des jetons est en temps constant. Les réponses 401 sont uniformes pour `en-tête manquant` / `mauvais schéma` / `mauvais jeton`.

**Exemption de `/health`** (Bctum) : sur les liaisons loopback (`127.0.0.1` / `localhost` / `::1` / `[::1]`), `/health` est enregistré AVANT le middleware bearer, donc les sondes de vivacité dans le pod n'ont pas besoin de porter le jeton même lorsque le démon a été démarré avec `--token`. Les liaisons non-loopback (`--hostname 0.0.0.0` etc.) placent `/health` derrière le bearer comme toutes les autres routes — voir la section [`GET /health`](#get-health) pour la justification.

**`--require-auth` (#4175 PR 15).** Passez ce drapeau au démarrage pour étendre la règle « doit avoir un jeton » également à la boucle locale. Le démarrage échoue sans jeton ; l'exemption `/health` est supprimée (donc `/health` nécessite aussi `Authorization: Bearer …`).

Lorsque le drapeau est activé, le middleware global `bearerAuth` bloque **chaque** route — y compris `/capabilities`. Un client **non authentifié** ne peut donc pas pré-vérifier `caps.features` pour découvrir que l'authentification est requise : la surface de découverte pour ce cas est le **corps de la réponse 401** lui-même (uniforme sur toutes les routes selon la section [Authentification](#authentification)). La balise de capacité `require_auth` est une **confirmation post-authentification** — une fois qu'un client s'authentifie avec succès et lit `/capabilities`, la présence de la balise confirme que le démon a été démarré avec `--require-auth` (utile pour les interfaces d'audit/conformité et pour les clients SDK qui souhaitent afficher « ce déploiement est renforcé » dans un panneau de paramètres). Les routes de mutation qui optent pour le mode strict par route (suivis de Wave 4) refusent avec `401 { code: "token_required", error: "…" }` lorsqu'elles sont atteintes sur une boucle locale par défaut sans jeton — mais avec `--require-auth` activé, le middleware bearer global court-circuite la requête avant le contrôle par route, donc le corps `Unauthorized` hérité est ce que les appelants non authentifiés voient effectivement.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Les interfaces web des navigateurs qui accèdent au démon en cross-origin sont bloquées par défaut — toute requête portant un en-tête `Origin` renvoie `403 {"error":"Request denied by CORS policy"}` car les clients CLI/SDK n'envoient jamais `Origin` et le démon interprète sa présence comme un signe que la requête provient d'un contexte navigateur dans lequel l'opérateur n'a pas opté. Passez `--allow-origin <pattern>` (répétable) au démarrage pour installer une liste d'autorisation au lieu du blocage. Chaque motif est soit :

- Le littéral `*` — admet n'importe quelle origine. **Risqué** : le démarrage refuse lorsque `*` est configuré mais qu'aucun jeton bearer n'est défini (toute source : `--token`, `QWEN_SERVER_TOKEN`, ou `--require-auth` qui impose un jeton au démarrage). Le fil d'Ariane de démarrage émet un avertissement sur stderr lorsque `*` est dans la liste. **Recommandation** : associez avec `--require-auth` sur les liaisons loopback afin que `/health` et `/demo` soient également protégés par le bearer — ils sont enregistrés avant le middleware bearer sur la boucle locale par défaut (pour que les sondes k8s/Compose puissent atteindre `/health` sans jeton), et une liste d'autorisation `*` les rend accessibles depuis n'importe quel navigateur cross-origin. Sur les liaisons non-loopback, le bearer est déjà obligatoire au démarrage, donc la surface d'exposition de `*` est juste `/health` (JSON d'état) et `/demo` (une page statique dont le JS appelle encore des routes protégées par jeton) — la surface API réelle est protégée quoi qu'il arrive.
- Une origine d'URL canonique — `<scheme>://<host>[:<port>]`. **Pas de slash final, pas de chemin, pas d'info utilisateur, pas de requête.** Le démarrage refuse avec `InvalidAllowOriginPatternError` si l'entrée échoue au test `new URL(pattern).origin === pattern` ; le message d'erreur nomme le motif invalide et la forme canonique. Strict par conception : une normalisation silencieuse (par exemple, supprimer un slash final) laisserait passer des fautes de frappe et accepterait une entrée ambiguë.

Les origines correspondantes reçoivent les en-têtes de réponse CORS standard sur chaque requête :

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` renvoie l'origine de la requête textuellement (minuscules/majuscules comme le navigateur l'a envoyée) plutôt que le littéral `*`, même sous le motif `*` — les caches des navigateurs associent les réponses clés avec `Vary: Origin`, et le renvoi textuel laisse la possibilité d'ajouter `Access-Control-Allow-Credentials` dans une version ultérieure sans changement de schéma. `Access-Control-Expose-Headers: Retry-After` permet aux interfaces web des navigateurs de respecter les indices de nouvelle tentative du démon provenant des réponses `429` / `503`. `Access-Control-Allow-Credentials` n'est **PAS** envoyé aujourd'hui : le démon s'authentifie via le bearer dans `Authorization`, qui fonctionne en cross-origin sans `credentials: 'include'`.
Les requêtes préliminaires OPTIONS (OPTIONS avec `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) court-circuitent avec `204 No Content` plus les en-têtes ci-dessus. C'est le schéma CORS conventionnel et il est sûr — la pré-vérification confirme seulement quelles méthodes/en-têtes le daemon accepte ; la requête réelle ultérieure exécute toujours la chaîne complète (liste blanche des hôtes → authentification bearer → routes), donc la protection anti-rebinding DNS et l'application du bearer se déclenchent avant que tout état soit lu ou modifié. Les requêtes OPTIONS simples provenant d'origines autorisées continuent leur chemin aval avec les en-têtes CORS attachés.

Les origines qui ne correspondent pas à la liste blanche reçoivent toujours `403 {"error":"Request denied by CORS policy"}` — même enveloppe que le mur par défaut, donc les clients qui ont déjà analysé la réponse du mur n'ont pas à traiter différemment les démons déployés avec liste blanche. Le chemin de rejet **n'émet** aucun en-tête `Access-Control-*` (le navigateur les ignorerait, et les émettre divulguerait indirectement la taille de la liste blanche via la présence des en-têtes).

La liste des motifs configurée n'est volontairement PAS reflétée dans `/capabilities` — l'interface web du navigateur connaît déjà sa propre origine (elle a appelé le démon, après tout), et exposer la liste permettrait à un lecteur non authentifié de `/capabilities` d'énumérer chaque origine de confiance (reconnaissance utile pour un déploiement mal configuré). Les clients SDK se basent sur le tag `caps.features.allow_origin` pour "ce démon honore les requêtes cross-origin du navigateur" sans avoir besoin de connaître les origines spécifiques.

Les requêtes loopback de même origine (par ex. la page `/demo` appelant le démon sur le même `127.0.0.1:port`) sont gérées par un **shim** distinct de suppression d'en-tête `Origin` qui s'exécute AVANT le middleware CORS et supprime l'en-tête `Origin` pour `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Ainsi, elles passent quelle que soit la configuration `--allow-origin` — les opérateurs n'ont pas besoin de lister le port du démon lui-même pour que la page de démonstration fonctionne.

## Common error shape

Les réponses 5xx transportent le `code` et `data` de l'erreur d'origine lorsqu'ils sont présents (style JSON-RPC — le SDK ACP transmet `{code, message, data}` depuis l'agent) :

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

`SessionNotFoundError` pour un identifiant de session inconnu renvoie :

```json
{ "error": "No session with id \"<sid>\"", "sessionId": "<sid>" }
```

avec le statut `404`.

`WorkspaceMismatchError` pour un `POST /session` dont le `cwd` ne se canonicalise pas vers l'espace de travail lié du démon (#3803 §02 — 1 daemon = 1 workspace) renvoie `400` avec :

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Utilisez ceci pour détecter une incompatibilité avant envol : lisez `workspaceCwd` dans `/capabilities` et omettez `cwd` de `POST /session` (il revient à l'espace de travail lié), ou acheminez la requête vers un démon lié à `requestedWorkspace`.

`POST /session` au-delà du plafond `--max-sessions` du démon renvoie `503` avec un en-tête `Retry-After: 5` et :

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Les attachements à des sessions existantes ne sont PAS comptés dans le plafond, donc les reconnexions d'un démon inactif continuent de fonctionner même à pleine capacité.

`RestoreInProgressError` — uniquement émis par `POST /session/:id/load` et `POST /session/:id/resume` — renvoie `409` avec un en-tête `Retry-After: 5` (correspondant à `session_limit_exceeded`) et :

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Déclenché lorsqu'un `session/load` est émis pour un id qui a déjà un `session/resume` en cours (ou vice versa). Attendez au moins `Retry-After` secondes et réessayez — la restauration sous-jacente se termine dans `initTimeoutMs` (10s par défaut). Les collisions de même action (`load` vs `load`, `resume` vs `resume`) se fusionnent au lieu de générer une erreur.

## Capabilities

Le démon annonce ses tags de fonctionnalités pris en charge depuis le registre des capacités du serveur. Les clients **doivent** baser l'interface utilisateur sur `features`, pas sur `mode` (selon la conception §10).

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
 'session_lsp',
 'session_close', 'session_metadata', 'mcp_guardrails',
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
> Conditional tags appear only when their matching deployment toggle is on (see the table below). F3's `permission_mediation` tag is always-on and carries `modes: ['first-responder', 'designated', 'consensus', 'local-only']` so SDK clients can introspect the build-supported set; the runtime-active strategy is at `body.policy.permission`.

`session_scope_override` est le point de négociation pour le champ `sessionScope` par requête sur `POST /session` (voir ci-dessous). Les anciens daemons ignorent silencieusement ce champ, donc les clients SDK doivent vérifier au préalable `caps.features` pour ce tag avant de l'envoyer.

`session_load` et `session_resume` annoncent les routes de restauration explicite (`POST /session/:id/load` et `POST /session/:id/resume`). Les anciens daemons renvoient `404` pour ces chemins, donc les clients SDK doivent vérifier au préalable `caps.features` avant d'appeler. `unstable_session_resume` est toujours annoncé comme un alias déprécié pour la compatibilité avec les SDK qui ont été livrés alors que la méthode ACP sous-jacente s'appelait `connection.unstable_resumeSession` ; les nouveaux clients doivent se baser sur `session_resume`.

`slow_client_warning` couvre deux boutons de régulation SSE co-publiés introduits dans #4175 Wave 2.5 PR 10 : (a) le daemon émet une trame de flux d'événements synthétique `slow_client_warning` lorsque la file d'attente d'un abonné dépasse 75% de remplissage, une fois par épisode de débordement (réarmé après que la file d'attente descend en dessous de 37,5%) ; (b) `GET /session/:id/events` accepte un paramètre de requête `?maxQueued=N` (plage `[16, 2048]`) pour pré-dimensionner le backlog par abonné lors de reconnexions à froid sur un grand anneau de rejeu. La taille de l'anneau du daemon est contrôlée par `--event-ring-size` (par défaut **8000**, selon #3803 §02). Les anciens daemons ne possèdent silencieusement ni l'un ni l'autre — vérifiez ce tag avant de les activer.

`typed_event_schema` annonce les charges utiles des événements du daemon qui correspondent au schéma `KnownDaemonEvent` du SDK. Les anciens daemons peuvent encore diffuser des trames compatibles, mais les clients SDK doivent vérifier ce tag avant de supposer une couverture d'événements typés.

`client_heartbeat` annonce `POST /session/:id/heartbeat`. Les anciens daemons renvoient `404` ; vérifiez ce tag avant d'émettre des battements de cœur périodiques.

`session_close` et `session_metadata` annoncent `DELETE /session/:id` et `PATCH /session/:id/metadata`. Les anciens daemons renvoient `404` ; vérifiez ces tags avant d'exposer les fonctions de fermeture ou de renommage.

`session_lsp` annonce `GET /session/:id/lsp`, l'instantané structuré en lecture seule de l'état LSP pour les clients du daemon. Les anciens daemons renvoient `404` ; vérifiez ce tag avant d'exposer l'état LSP distant.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` et `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) annoncent les quatre routes de contrôle de mutation documentées ci-dessous sous « Mutation : approval, tools, init, MCP restart ». Les quatre sont strictement protégées par la porte de mutation PR 15 (un daemon configuré sans jeton d'authentification les rejette avec 401 `token_required`). Les anciens daemons renvoient `404` ; vérifiez chaque tag avant d'exposer la fonction correspondante.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) couvre la surface budgétaire MCP : les champs `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` sur `GET /workspace/mcp`, le champ `disabledReason` dans les cellules par serveur, et les indicateurs CLI `--mcp-client-budget` / `--mcp-budget-mode`. Les anciens daemons omettent entièrement les nouveaux champs ; les clients SDK vérifient ce tag avant de se fier à la sémantique de `budgets[]`. Le descripteur de registre porte également `modes: ['warn', 'enforce']` pour une exposition future des modes de fonctionnalité — pour l'instant, les clients déduisent le mode à partir du champ `budgetMode` de l'instantané. Le refus du serveur en mode `enforce` est déterministe selon l'ordre de déclaration de `Object.entries(mcpServers)` ; une future couche de précédence de portée (si qwen-code en adopte une) déplacerait cela vers « précédence la plus faible d'abord » pour refléter la convention de claude-code `plugin < user < project < local`.

> ⚠️ **Portée v1 de PR 14 : par session, pas par espace de travail.** Chaque session ACP à l'intérieur du daemon construit son propre `Config` + `McpClientManager` (via `acpAgent.newSessionConfig`). Les limites budgétaires concernent les clients MCP actifs **par session** ; chaque session lit indépendamment `QWEN_SERVE_MCP_CLIENT_BUDGET` depuis les variables d'environnement transmises. Avec `--mcp-client-budget=10` et 5 sessions ACP concurrentes, le nombre réel de clients MCP actifs peut atteindre 5 × 10 = 50 dans le daemon. L'instantané `GET /workspace/mcp` lit uniquement la comptabilité du `McpClientManager` de la **session d'amorçage** — la valeur `budgets[0].scope: 'session'` est le signal honnête que c'est par session, pas agrégé. **Wave 5 PR 23 (pool MCP partagé)** introduira un gestionnaire à l'échelle de l'espace de travail et ajoutera une cellule `scope: 'workspace'` à côté de la cellule par session pour une véritable agrégation intersessions. v1 est le compteur en processus + la base d'application souple sur laquelle PR 23 s'appuie.

`workspace_file_read` couvre les routes de fichiers de l'espace de travail pour le texte/liste/stat/glob
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
couvre `GET /file/bytes`, qui a été ajouté plus tard pour que les clients puissent vérifier au préalable la prise en charge des fenêtres d'octets brutes contre les daemons de l'ère PR19. `workspace_file_write` couvre
les routes de mutation de texte avec hachage (`POST /file/write`, `POST /file/edit`).
Le tag d'écriture signifie que le contrat de route existe ; cela ne signifie pas que le déploiement actuel est ouvert à la mutation anonyme. Les écritures/éditions sont des routes de mutation strictes
et nécessitent un jeton d'authentification configuré même en boucle locale.
`daemon_status` annonce `GET /daemon/status`, l’instantané de diagnostic opérateur consolidé en lecture seule décrit ci-dessous.

**Balisage conditionnel.** Un petit nombre de balises de fonctionnalités ne sont annoncées que lorsque le basculement de déploiement correspondant est activé. Présence de la balise = comportement activé ; absence = soit un démon antérieur à la balise, soit un démon actuel pour lequel l’opérateur n’a pas opté. Actuellement :

| Balise                      | Annoncée quand …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`              | le démon a été démarré avec `--require-auth` (ou `requireAuth: true` via l’API embarquée). Le jeton Bearer est obligatoire sur chaque route, y compris `/health` sur les liaisons loopback.                                                                                                                                                                                                                                                                                                                            |
| `mcp_workspace_pool`        | le pool de transport MCP partagé est actif. Omis quand `QWEN_SERVE_NO_MCP_POOL=1` désactive le pool.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `mcp_pool_restart`          | le pool de transport MCP partagé est actif ; les réponses de redémarrage peuvent inclure des formes multi-entrées tenant compte du pool.                                                                                                                                                                                                                                                                                                                                                                              |
| `allow_origin`              | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Le démon a été démarré avec au moins un `--allow-origin <motif>` (ou `allowOrigins: [...]` via l’API embarquée). Les requêtes cross-origin provenant d’origines correspondantes reçoivent les en-têtes CORS appropriés ; les origines non appariées reçoivent toujours le 403 par défaut. La liste des motifs configurés n’est volontairement PAS renvoyée dans `/capabilities` pour éviter de divulguer l’ensemble des origines de confiance aux lecteurs non authentifiés — l’interface web du navigateur connaît déjà sa propre origine. |
| `prompt_absolute_deadline`  | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                                          |
| `writer_idle_timeout`       | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_settings`        | le démon a été créé avec une persistance des paramètres disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `session_shell_command`     | l’exécution de shell de session est explicitement activée.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `rate_limit`                | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` est activé.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `workspace_reload`          | la prise en charge du rechargement de l’espace de travail est disponible dans la configuration de route embarquée.                                                                                                                                                                                                                                                                                                                                                                                                     |
`mcp_guardrails` **ne figure pas** dans ce tableau conditionnel — c'est une balise toujours active, annoncée dès que le binaire supporte les nouveaux champs de budget `/workspace/mcp`, que l'opérateur ait configuré un budget ou non. Les opérateurs qui n'ont pas défini `--mcp-client-budget` reçoivent quand même les nouveaux champs (avec `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (problème [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) annonce les événements SSE typés qui remontent les franchissements d'état du budget MCP sans boucle d'interrogation. Deux types de trames arrivent sur `GET /session/:id/events` :

- `mcp_budget_warning` — se déclenche une fois lors du franchissement à la hausse de 75% de `reservedSlots.size / clientBudget`. Se réarme uniquement après que le ratio soit repassé sous 37,5% (`MCP_BUDGET_REARM_FRACTION`). Reprend l'hystérésis de `slow_client_warning` de la PR 10, mais au niveau du gestionnaire plutôt qu'au niveau du backlog par abonné. Charge utile : `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Se déclenche en modes `warn` et `enforce` ; jamais en mode `off`.
- `mcp_child_refused_batch` — se déclenche à la fin de chaque passage `discoverAllMcpTools*` lorsqu'un ou plusieurs serveurs ont été refusés, ET sous forme d'un lot de longueur 1 sur le chemin de refus de création à la demande de `readResource`. Charge utile : `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` est le littéral `'enforce'` car le mode `warn` ne refuse jamais.

Les deux événements résident dans l'anneau de rejeu SSE par session (ils portent un `id`), de sorte qu'un client se reconnectant avec `Last-Event-ID` les reçoit ; l'instantané de `GET /workspace/mcp` reste la source de vérité pour l'état après une déconnexion prolongée. Toujours actif une fois annoncé — il n'y a pas de bascule conditionnelle. L'état du réducteur du SDK (`DaemonSessionViewState`) expose `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` pour les adaptateurs qui souhaitent une interface utilisateur simple de type latence.

## Routes

### `GET /health`

Sonde de vivacité. Le formulaire par défaut renvoie `200 {"status":"ok"}` si l'écouteur est actif — peu coûteux, sans accès au pont, adapté aux sondes de vivacité k8s/Compose à haute fréquence.

Passez `?deep=1` (accepte aussi `?deep=true` ou `?deep` seul) pour une sonde qui expose les **compteurs** du pont (uniquement à titre informatif, pas une véritable vérification de vivacité) :

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ La sonde approfondie est **informative**, pas une véritable vérification de vivacité. Elle lit les accesseurs de compteurs (`bridge.sessionCount`, `bridge.pendingPermissionCount`) qui sont de simples accesseurs de taille de Map ; ils n'interrogent pas les processus enfants / canaux individuellement et ne détecteront donc pas une session bloquée mais toujours comptée. Utilisez-la pour des tableaux de bord de capacité (simultanéité actuelle vs `--max-sessions`, profondeur de file d'attente) plutôt que comme déclencheur pour « retirer ce démon de la rotation ». Une réponse `503 {"status":"degraded"}` est théoriquement possible si les accesseurs d'une implémentation de pont personnalisée lèvent une exception, mais ceux du véritable pont ne lèvent jamais rien — en fonctionnement normal, la sonde approfondie renvoie toujours 200. Pour une véritable vivacité, fiez-vous au fait que l'écouteur accepte ou non une connexion TCP (c'est-à-dire le `/health` par défaut sans `?deep`).

**Authentification :** requise **uniquement sur les liaisons non locales**. En boucle locale (`127.0.0.1`, `::1`, `[::1]`), `/health` est enregistré avant le middleware porteur, de sorte que les sondes k8s/Compose à l'intérieur du pod n'ont pas besoin de porter le jeton. Sur une liaison non locale (`--hostname 0.0.0.0` etc.), la route est enregistrée après le middleware porteur et renvoie 401 sans jeton valide — sinon un appelant non authentifié pourrait sonder des adresses arbitraires pour confirmer l'existence d'un `qwen serve`, une fuite d'information de faible gravité qui se combine mal avec le balayage de ports. Le refus CORS + la liste blanche d'hôtes s'appliquent toujours sur l'exemption de boucle locale.

### `GET /daemon/status`

Diagnostics opérateur en lecture seule. Contrairement à `/health`, il s'agit d'une API de démon normale : elle est enregistrée après l'authentification porteur et la limitation de débit, y compris sur les liaisons en boucle locale. Paramètre de requête :

- `detail=summary` (par défaut) lit uniquement l'état du démon en mémoire.
- `detail=full` inclut en plus les diagnostics de session en direct, les diagnostics de connexion ACP, les compteurs de flux d'appareil d'authentification et les sections d'état de l'espace de travail.
- toute autre valeur `detail` renvoie `400 { "code": "invalid_detail" }`.

`summary` n'interroge intentionnellement pas les méthodes d'état de l'espace de travail, ne démarre pas un enfant ACP et ne crée pas de session. `full` interroge chaque section d'espace de travail indépendamment ; un délai d'attente ou une exception marque uniquement cette section comme `unavailable` et ajoute un problème `workspace_status_unavailable`.

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
`status` est `error` si un problème a une sévérité d'erreur, `warning` si un problème a une sévérité d'avertissement, sinon `ok`. Les codes d'incident sont stables et incluent `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits`, et `workspace_status_unavailable`. Pendant la courte fenêtre après que l'écouteur est prêt mais avant que l'exécution complète soit montée, `/daemon/status` peut rapporter `daemon_runtime_starting` ; si le montage asynchrone de l'exécution échoue, il rapporte `daemon_runtime_failed` tandis que les routes d'exécution non liées au statut renvoient `503`.

Sécurité : la réponse n'inclut jamais les jetons d'authentification (bearer tokens), les identifiants clients, les identifiants complets de connexion ACP, les codes utilisateur de flux d'appareil, ni les URL de vérification. `summary` omet le chemin du journal du daemon ; `full` peut l'inclure pour les opérateurs authentifiés.

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

Contrat stable : lorsque `v` s'incrémente, la disposition du cadre a changé de manière rétrocompatible.

> **`protocolVersions`** décrit les versions du protocole de service que le daemon peut parler. `current` est la version préférée du daemon et `supported` est l'ensemble compatible. Les clients qui nécessitent un protocole spécifique doivent vérifier `supported` ; l'interface utilisateur spécifique à une fonctionnalité devrait toujours se baser sur `features`. Additif à v=1 : les anciens daemons v1 omettent ce champ, donc les clients SDK qui ciblent des versions plus anciennes doivent le traiter comme optionnel.

> **`modelServices` est toujours `[]` dans l'étape 1.** L'agent utilise son unique service modèle par défaut et ne l'énumère pas sur le réseau. L'étape 2 remplira cela à partir des adaptateurs de modèles enregistrés afin que les clients SDK puissent construire des sélecteurs de services ; d'ici là, ne vous fiez PAS à ce champ pour être non vide.

> **`workspaceCwd`** est le chemin absolu canonique auquel ce daemon se lie (#3803 §02 — 1 daemon = 1 workspace). Utilisez-le pour (a) détecter une discordance avant de poster `/session` et (b) omettre `cwd` sur `POST /session` (la route se replie sur ce chemin). Les déploiements multi-workspace exposent plusieurs daemons sur différents ports, chacun avec son propre `workspaceCwd`. Additif à v=1 : les daemons v1 antérieurs à §02 omettent le champ — les clients qui ciblent des constructions plus anciennes doivent vérifier la nullité avant de le consommer.

### Read-only runtime status routes

Ces routes rapportent des instantanés d'exécution côté daemon. Ce sont des routes v1 additives, elles ne modifient pas l'état et ne changent pas la version du protocole de service. Les routes de statut d'espace de travail ne démarrent intentionnellement **pas** le processus enfant ACP simplement parce qu'un client interroge une route GET : si le daemon est inactif, elles renvoient `initialized: false` avec un instantané vide. Les routes de statut de session nécessitent une session active et utilisent la forme standard `404 SessionNotFoundError` pour les identifiants inconnus.

Étiquettes de capacité :

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`

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

`errorKind` est une énumération fermée partagée par `/workspace/preflight`, `/workspace/env`, et (éventuellement) les garde-fous MCP afin que les clients SDK puissent afficher une correction par catégorie au lieu d'analyser des messages libres. La PR 13 (#4175) a introduit les sept littéraux listés ci-dessus ; la PR 14 peuplera `blocked_egress` une fois que la sonde de trafic sortant sera en place.

Les charges utiles de statut n'exposent jamais les valeurs d'environnement MCP, les en-têtes, les détails OAuth/compte de service, les clés API des fournisseurs, les `baseUrl` / `envKey` des fournisseurs, le corps des compétences, les chemins de fichiers des compétences, les définitions de hooks, ni les valeurs des variables d'environnement secrètes. `/workspace/env` rapporte uniquement la **présence** de variables d'environnement autorisées ; les URL proxy sont dépouillées des identifiants et réduites à `host:port` avant d'être transmises sur le réseau.

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

`discoveryState` est l'un de `not_started`, `in_progress`, ou `completed`. `transport` est l'un de `stdio`, `sse`, `http`, `websocket`, `sdk`, ou `unknown`. `errors` est omis lorsque la découverte réussit.
**Garde-fous du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Les démons post-PR-14 enrichissent la charge utile avec quatre champs additifs et une cellule au niveau de l'espace de travail :

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
      "hint": "Augmentez --mcp-client-budget ou supprimez des serveurs de la configuration mcpServers.",
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

`budgetMode` peut valoir `enforce`, `warn` ou `off`. `clientBudget` est absent lorsqu'aucun budget n'a été défini. `budgets[]` est **toujours un tableau** sur les démons post-PR-14 (éventuellement vide quand `budgetMode === 'off'`) ; les démons pré-PR-14 omettent complètement ce champ. La v1 émet une cellule avec `scope: 'session'` (application par session — voir la section sur les capacités ci-dessus pour la raison). Les consommateurs DOIVENT tolérer des entrées `budgets[]` supplémentaires avec des valeurs de `scope` inconnues — la vague 5 PR 23 ajoutera `scope: 'workspace'` (ou `'pool'`) aux côtés de la cellule par session, sans changement de schéma.

`disabledReason` sur les cellules par serveur distingue le désactivé par l'opérateur (`'config'` — liste de configuration `disabledMcpServers`) du refus lié au budget (`'budget'` — découvert mais jamais connecté à cause du mode `enforce`). Les refus sont déterministes selon l'ordre de déclaration de `Object.entries(mcpServers)`. Le champ `status: 'error', errorKind: 'budget_exhausted'` au niveau du serveur masque le `mcpStatus: 'disconnected'` brut (qui est vrai mais pas la sévérité vue par l'opérateur).

L'application du budget dans la v1 de PR 14 est **par session, pas par espace de travail**. Bien que les démons Mode B soient `1 démon = 1 espace de travail × N sessions` après #4113 au niveau du processus, le `McpClientManager` est construit à l'intérieur du `Config` de chaque session ACP via `acpAgent.newSessionConfig`, donc N sessions appliquent chacune leur propre copie de la limite. L'instantané représente la vue de la session d'amorçage. La vague 5 PR 23 introduit un pool MCP partagé au niveau de l'espace de travail, transformant cela en une véritable application par espace de travail.

**Détection de la pression budgétaire.** Deux surfaces, toutes deux renseignées après PR-14b :

- **Événements push** (annoncés via `mcp_guardrail_events`) : abonnez-vous à `GET /session/:id/events` et filtrez les trames `mcp_budget_warning` / `mcp_child_refused_batch` via `KnownDaemonEvent`. La machine d'état se déclenche une fois par franchissement à la hausse de 75 % (réarmement en dessous de 37,5 %) ; les refus sont regroupés une fois par passe de découverte en mode `enforce`.
- **Interrogation de l'instantané** (annoncée via `mcp_guardrails`) : `GET /workspace/mcp` et inspectez la cellule budgétaire par session (`budgets[0]`) :

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (correspond au seuil d'hystérésis de l'événement push de PR 14b).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (au moins un serveur refusé lors de cette passe de découverte).
- `budgets[0].status === 'ok'` ⇔ en dessous du seuil de 75 % ET aucun refus.

Cadence d'interrogation recommandée : alignée sur celle qui interroge déjà `/workspace/mcp` ; l'instantané est léger et la cellule budgétaire n'ajoute aucun coût de découverte supplémentaire. Les clients SDK qui s'abonnent aux événements push bénéficient également de l'instantané pour l'état après une déconnexion prolongée (la profondeur de rejeu SSE est finie — `--event-ring-size`, défaut 8000 — donc un client hors ligne plus longtemps que la couverture de l'anneau retombe sur une resynchronisation par instantané).

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

`level` peut valoir `project`, `user`, `extension` ou `bundled`. `errors` est omis lorsque la découverte réussit.

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
Les modèles sont regroupés par type d'authentification. Les diagnostics de connexion des fournisseurs se trouvent dans la cellule `providers` de `/workspace/preflight` ; la vérification préalable de l'environnement se trouve dans `/workspace/preflight` et `/workspace/env` (ci-dessous). `errors` est omis lorsque la construction de l'instantané réussit.

### `GET /workspace/env`

Signale l'environnement d'exécution, la plateforme, le sandbox, le proxy, et la **présence** des variables d'environnement secrètes autorisées sur liste blanche du processus daemon. Répond toujours à partir de l'état `process.*` — le daemon ne génère jamais de processus enfant ACP pour servir cette route, et la réponse est identique qu'ACP soit actif ou inactif. Le champ `acpChannelLive` est uniquement informatif.

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

**Politique de rédaction.** Les cellules `kind: 'env_var'` n'incluent jamais de champ `value` ; les clients ne voient que `present: boolean`. Les cellules `kind: 'proxy'` soumettent la valeur brute de la variable d'environnement au masquage des identifiants (`redactProxyCredentials`) puis à l'analyse via `URL` afin que le câble ne transporte que `host:port`. `NO_PROXY` est transmis au masquage tel quel car il s'agit d'une liste d'hôtes plutôt que d'une URL. La liste blanche des variables d'environnement secrètes énumérées inclut actuellement `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` et `QWEN_SERVER_TOKEN`. Les autres variables d'environnement ne sont pas énumérées, donc les secrets accidentellement définis restent invisibles.

### `GET /workspace/preflight`

Signale les vérifications d'état de préparation du daemon. **Les cellules de niveau daemon** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) sont toujours remplies à partir de `process.*` et `node:fs`. **Les cellules de niveau ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) nécessitent un processus enfant ACP actif — lorsque le daemon est inactif, elles émettent des espaces réservés `status: 'not_started'`. La route ne génère jamais ACP uniquement pour remplir les cellules ; les cellules correspondantes se replient sur `not_started`.

Réponse inactive (aucun processus enfant ACP) :

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

- `missing_binary` — Version de Node inférieure à celle requise, `QWEN_CLI_ENTRY` manquant, ripgrep/git/npm absents du PATH (avertissements plutôt qu'erreurs pour les binaires optionnels).
- `missing_file` — `boundWorkspace` n'existe pas ou n'est pas un répertoire ; erreur d'analyse d'une compétence pointant vers un fichier manquant ou illisible.
- `parse_error` — Échec d'analyse de `SKILL.md`, configuration JSON malformée.
- `auth_env_error` — `validateAuthMethod` a retourné une chaîne d'échec non nulle, ou une sous-classe de `ModelConfigError` propagée depuis la résolution du fournisseur.
- `init_timeout` — Rejet de `withTimeout` dans le pont (un timeout réel lors de l'attente d'un aller-retour ACP). Reconnu via la classe typée `BridgeTimeoutError`. Note : une cellule `mcp_discovery` de type `warning` transitoire avec `connecting > 0` ne porte PAS ce kind — il s'agit d'un état normal de handshake en cours, distinct d'un vrai timeout.
- `protocol_error` — `extMethod` de l'ACP rejeté parce que le canal s'est fermé en cours de requête, ou parce que le registre d'outils était inopinément absent.
- `blocked_egress` — réservé pour la PR 14 (#4175). La PR 13 laisse la cellule `egress` en `status: 'not_started'`.

Si le pont ne parvient pas à joindre le processus enfant ACP lors du traitement d'une requête de pré-vérification (par exemple, une fermeture du canal en cours de requête), le tableau `errors` de l'enveloppe contient une seule `ServeStatusCell` décrivant l'échec et les cellules reviennent aux espaces réservés ACP `not_started`. Les cellules du démon sont toujours renvoyées.

### Routes des fichiers de l'espace de travail

Tous les chemins de fichiers sont résolus dans l'espace de travail lié du démon. Les réponses utilisent des chemins relatifs à l'espace de travail et ne renvoient jamais de chemins absolus du système de fichiers pour les cas de succès normaux. Les réponses de fichiers réussies incluent :

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Les erreurs du système de fichiers utilisent cette forme JSON :

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

Lit un fichier texte. Paramètres de requête : `path` (obligatoire), `maxBytes`, `line` et
`limit`. Le démon rejette les fichiers binaires et les fichiers dépassant la limite de lecture texte.
La réponse inclut `hash`, un haché SHA-256 des octets bruts sur disque pour
l'ensemble du fichier, même lorsque `line`, `limit` ou `maxBytes` a renvoyé une tranche.

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

Lit les octets bruts d'un fichier sans décodage. Paramètres de requête : `path` (obligatoire),
`offset` (par défaut `0`) et `maxBytes` (par défaut `65536`, max `262144`). Cette
route prend en charge les fenêtres limitées sur les grands fichiers binaires sans engloutir tout le fichier.
La réponse inclut `hash` uniquement lorsque la fenêtre renvoyée couvre
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

Crée ou remplace un fichier texte. Il s'agit d'une route de mutation stricte : en boucle locale
sans jeton configuré, elle retourne `401 { "code": "token_required" }`.
Avec `--require-auth`, le middleware global d'en-tête d'authentification rejette les requêtes non authentifiées
avant que la route ne s'exécute.

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
(`409 file_already_exists`). `replace` nécessite `expectedHash` ; les hachés manquants ou
mal formés donnent `400 parse_error`, et les hachés obsolètes donnent
`409 hash_mismatch`. `expectedHash` est `sha256:` suivi de 64 caractères hexadécimaux
minuscules, calculé sur les octets bruts du disque.

`bom`, `encoding` et `lineEnding` peuvent être fournis. Le remplacement préserve par défaut le
profil d'encodage du fichier existant ; les champs explicites le remplacent.
Les écritures binaires sont hors du champ d'application.

Le démon écrit dans un fichier temporaire aléatoire dans le répertoire cible, effectue un fsync
lorsque c'est pris en charge, revérifie le haché actuel immédiatement avant `rename()`, puis
renomme en place. Cela empêche l'observation de fichiers partiels et sérialise
les écritures provenant du démon sur le même fichier, mais ce n'est pas une opération
de comparaison-et-échange noyau inter-processus : un éditeur externe peut encore entrer en concurrence
dans la petite fenêtre entre la vérification finale du haché et le renommage.
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

Applique un remplacement textuel exact à un fichier texte existant. C'est également une route de mutation stricte et nécessite `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` ne doit pas être vide et doit apparaître exactement une fois. Aucune correspondance renvoie `422 text_not_found` ; plusieurs correspondances renvoient `422 ambiguous_text_match`. La route préserve l'encodage, le BOM et les sauts de ligne, et revérifie `expectedHash` immédiatement avant le renommage atomique.

Les écritures/éditions explicites sur des chemins ignorés sont autorisées car l'appelant authentifié a nommé le chemin. Les réponses de succès et les événements d'audit incluent `matchedIgnore: "file" | "directory" | null`.

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

`state` reflète les mêmes formes de modèle/mode/option-de-configuration ACP que celles utilisées par `POST /session`, `POST /session/:id/load` et `POST /session/:id/resume`.

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Initialiser le projet",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands` est le même instantané de commandes utilisé par la notification SSE `available_commands_update`. `availableSkills` liste uniquement les noms des compétences ; les clients ne doivent pas s'attendre à des corps ou chemins de compétences via cette route.

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
      "label": "reviewer: vérifier l'échec",
      "description": "vérifier l'échec",
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

Cette route est un instantané en lecture seule hors bande. Elle n'est intentionnellement pas une invite et peut être interrogée pendant que la session diffuse. La réponse ne contient que des métadonnées autorisées provenant des registres de tâches de l'agent, du shell et du moniteur ; les contrôleurs, minuteurs, offsets, messages en attente et objets de registre bruts ne sont jamais exposés.

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

`status` est l'une des valeurs suivantes : `NOT_STARTED`, `IN_PROGRESS`, `READY` ou `FAILED`. Un champ `error` optionnel est présent sur les serveurs en échec lorsqu'il est disponible. Le LSP désactivé (y compris le mode nu) renvoie HTTP 200 avec `enabled: false`, des compteurs à zéro et `servers: []`. Le LSP activé sans serveur configuré renvoie `enabled: true`, `configuredServers: 0` et `servers: []`. Si l'initialisation échoue avant que le client n'existe, la réponse peut inclure `initializationError` ; si un client actif ne peut pas fournir d'instantané, la réponse inclut `statusUnavailable: true`.

Cette route n'expose que les champs stables côté client. Elle omet intentionnellement les éléments internes de débogage tels que les ID de processus, les arguments de lancement, les queues de stderr, les URI racines et les chemins de dossiers de l'espace de travail.

### `POST /session`

Crée un nouvel agent ou s'attache à un agent existant (sous `sessionScope: 'single'`, la valeur par défaut).

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Champ              | Obligatoire | Remarques                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`               | non         | Chemin absolu correspondant à l'espace de travail lié du démon. S'il est omis, la route utilise `boundWorkspace` (lisez-le depuis `/capabilities.workspaceCwd`). Un `cwd` non vide et non concordant renvoie `400 workspace_mismatch` (#3803 §02 — 1 démon = 1 espace de travail). Les chemins d'espace de travail sont canonicalisés via `realpathSync.native` (avec un repli en résolution seule pour les chemins inexistants) afin que les systèmes de fichiers insensibles à la casse ne rejettent pas les sessions selon l'orthographe.                                                                                  |
| `modelServiceId`    | non         | Sélectionne le _service de modèle_ configuré par lequel l'agent va router (le fournisseur back-end — Alibaba ModelStudio, OpenRouter, etc). S'il est omis, l'agent utilise son service par défaut. Si l'espace de travail a déjà une session, cela appelle `setSessionModel` sur celle existante et diffuse `model_switched`. Distinct de `modelId` sur `POST /session/:id/model`, qui sélectionne le modèle **au sein** d'un service déjà lié. Le tableau `modelServices` sur `/capabilities` est réservé pour annoncer les services configurés ; dans l'étape 1, il est toujours `[]` (le service par défaut de l'agent est utilisé et n'est pas énuméré via HTTP). |
| `sessionScope`      | non         | Surcharge par requête pour le partage de session. `'single'` (la valeur par défaut à l'échelle du démon) fait qu'un deuxième `POST /session` sur le même espace de travail réutilise la session existante (`attached: true`) ; `'thread'` force une nouvelle session distincte à chaque appel. Omettre pour hériter de la valeur par défaut du démon. Les valeurs en dehors de l'énumération renvoient `400 { code: 'invalid_session_scope' }`. Les vieux démons (avant la PR 5 de #4175) ignorent silencieusement ce champ — pré-vérifiez `caps.features.session_scope_override` avant d'envoyer. La valeur par défaut du démon est codée en dur à `'single'` en production aujourd'hui ; #4175 pourrait ajouter un indicateur CLI `--sessionScope` dans un suivi. |
```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` signifie qu'une session pour cet espace de travail existait déjà et que vous la partagez désormais.

Les appels `POST /session` concurrents pour le même espace de travail sont **fusionnés** en un seul lancement — les deux appelants reçoivent le même `sessionId`, un seul rapporte `attached: false`. Si le lancement sous-jacent échoue (timeout d'initialisation, sortie d'agent malformée, OOM), **tous les appelants fusionnés reçoivent la même erreur** — l'emplacement en vol est nettoyé afin qu'un appel ultérieur puisse réessayer depuis le début.

> ⚠️ **Le rejet de `modelServiceId` sur une session fraîche est silencieux sur la réponse HTTP.** Un `modelServiceId` incorrect (faute de frappe, service non configuré) ne provoque PAS un 500 lors de la création — la session reste opérationnelle sur le modèle par défaut de l'agent, de sorte que l'appelant reçoit quand même un `sessionId` avec lequel il peut réessayer le changement de modèle (via `POST /session/:id/model`). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session, émis entre la poignée de main du lancement et votre premier abonnement. **Les abonnés qui ont besoin d'observer cet événement doivent passer `Last-Event-ID: 0` sur leur premier `GET /session/:id/events`** pour rejouer à partir de l'événement le plus ancien disponible dans l'anneau (cela couvre le `model_switch_failed` du lancement même si l'abonnement arrive quelques ms après la réponse de création).

### `POST /session/:id/load`

Restaure une session ACP persistée par son ID et rejoue son historique via SSE. L'ID dans le chemin est prioritaire ; tout champ `sessionId` dans le corps est ignoré. Pré-requis `caps.features.session_load` — les démons plus anciens retournent `404` pour cette route.

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Champ | Requis | Notes                                                                                                                                                                                                                             |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | non    | Mêmes règles de canonicalisation + `workspace_mismatch` que `POST /session`. Omettre pour hériter de `/capabilities.workspaceCwd`. `mcpServers` n'est volontairement PAS accepté ici — les MCP à l'échelle du démon sont pilotés par la configuration (comme pour `POST /session`). |

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

`state` reflète `LoadSessionResponse` d'ACP — `models` est un `SessionModelState`, `modes` un `SessionModeState`, `configOptions` un tableau de `SessionConfigOption`. Les champs manquants sont décidés par l'agent. Les rattachements tardifs (les chemins `attached: true` ci-dessous) reçoivent le MÊME instantané `state` que l'appelant original du chargement — le démon le met en cache sur l'entrée ; les mutations d'exécution (par ex. `model_switched`) sont livrées sur le flux SSE, pas dans les réponses d'attachement ultérieures.

`attached: true` signifie que la session était déjà active (soit d'un `session/load`/`session/resume` précédent, soit parce qu'un appelant concurrent fusionné a devancé juste avant).

**Rejeu de l'historique via SSE.** Pendant que `loadSession` est en cours côté agent, l'agent émet des notifications `session_update` pour chaque tour persistant. Le démon les met en mémoire tampon sur le bus d'événements de la session avant que la réponse de la route ne soit renvoyée, de sorte que les abonnés qui appellent immédiatement `GET /session/:id/events` avec `Last-Event-ID: 0` voient le rejeu complet. **L'anneau de rejeu est limité** (8000 trames par session par défaut). Les longs historiques avec de nombreux tours d'appels d'outils / flux de pensée peuvent dépasser cette limite — les trames les plus anciennes sont supprimées silencieusement. Les clients qui ont besoin de l'historique complet doivent s'abonner immédiatement après le retour de `load` ; une alternative est de persister les ID d'événements SSE et d'utiliser `Last-Event-ID` pour reprendre à partir d'une limite de tour ultérieure.

**Erreurs :**

- `404` — l'ID de session persisté n'existe pas (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (même forme que `POST /session`).
- `503` — `session_limit_exceeded` (compte dans `--max-sessions` ; les restaurations en vol sont également comptées).
- `409` — `restore_in_progress` (un `session/resume` pour le même ID est déjà en vol). `Retry-After: 5`. Les courses de même action (deux `session/load` concurrents pour le même ID) sont fusionnées — exactement un retourne `attached: false`, les autres retournent `attached: true` avec le même `state`.

### `POST /session/:id/resume`

Restaure une session ACP persistée par son ID SANS rejouer l'historique via SSE. Le contexte du modèle est restauré en interne côté agent (via `geminiClient.initialize` lisant `config.getResumedSessionData`) ; le flux SSE reste propre pour les clients qui ont déjà l'historique affiché. Pré-requis `caps.features.session_resume` ; `unstable_session_resume` reste un alias de compatibilité déprécié pour les clients plus anciens.

Même forme de requête que `/load`. Même forme de réponse — `state` reflète `ResumeSessionResponse` d'ACP. Même enveloppe d'erreur, y compris `409 restore_in_progress` (déclenché quand un `session/load` est en vol ; `session/resume` en course derrière un autre `session/resume` est fusionné).
Utilisez `/load` quand le client n’a aucun historique affiché (reconnexion à froid, sélecteur → ouverture). Utilisez `/resume` quand le client a déjà les tours à l’écran et a seulement besoin que le handle côté daemon soit restauré.

> ⚠️ **Pourquoi `unstable_session_resume` est-il encore annoncé ?** La route HTTP du daemon et la capacité `session_resume` sont stables pour la v1, mais le pont appelle encore `connection.unstable_resumeSession` d’ACP. L’ancien tag ne reste que pour que les SDK publiés avant `session_resume` continuent de fonctionner.

### `GET /workspace/:id/sessions`

Liste toutes les sessions actives dont l’espace de travail canonique correspond à `:id` (chemin absolu courant encodé en URL).

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

Réponse :

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false
    }
  ]
}
```

Tableau vide (pas 404) quand aucune session n’existe – une interface de sélecteur de session ne doit pas générer d’erreur simplement parce que l’espace de travail est inactif.

### `POST /session/:id/prompt`

Transmet une invite à l’agent. Les appelants multi-invites sont mis en file FIFO par session (ACP garantit une invite active par session).

Requête :

```json
{
  "prompt": [{ "type": "text", "text": "Que fait src/main.ts ?" }]
}
```

Validation : `prompt` doit être un tableau non vide d’objets. Les autres échecs retournent `400` avant d’atteindre le pont.

Réponse :

```json
{ "stopReason": "end_turn" }
```

Autres raisons d’arrêt : `cancelled`, `max_tokens`, `error`, `length` (selon la spécification ACP).

Si le client HTTP se déconnecte pendant l’invite, le daemon envoie une notification ACP `cancel` à l’agent, qui termine l’invite avec `stopReason: "cancelled"`.

> **Limitation de l’étape 1 – pas de délai d’attente côté serveur pour l’invite.** Le pont
> ne fait que mettre en concurrence `prompt()` de l’agent avec `transportClosedReject`
>(le crash du processus enfant de l’agent) et le signal AbortSignal de la déconnexion HTTP de l’appelant.
> Un agent vivant mais bloqué (par exemple un appel de modèle qui se bloque) bloque la FIFO par session
> jusqu’à ce que le client HTTP expire de son côté et se déconnecte. Les invites de longue durée sont légitimes
> (recherche approfondie, analyse de grandes bases de code) donc aucun délai par défaut n’est délibérément
> défini ; l’étape 2 exposera un `promptTimeoutMs` configurable en option. En attendant, les appelants doivent
> définir leur propre délai côté client et se déconnecter (ou appeler `POST /session/:id/cancel`) à l’expiration.

### `POST /session/:id/cancel`

Annule l’invite **actuellement active** sur la session. Côté ACP, il s’agit d’une notification, pas d’une requête – l’agent accuse réception en résolvant la `prompt()` active avec `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrat multi-invites :** cancel n’affecte que l’invite active. Les invites que le même client a précédemment publiées en POST et qui sont encore en attente derrière l’invite active continueront de s’exécuter. La mise en file d’attente multi-invites est un comportement introduit par le daemon (pas dans la spécification ACP) ; le contrat pour les invites en file d’attente est « elles continuent de s’exécuter sauf si vous annulez chacune d’elles, ou si vous tuez la session via une sortie de canal ».

### `DELETE /session/:id`

Ferme explicitement une session active. Force la fermeture même lorsque d’autres clients sont attachés – annule toute invite active, résout les autorisations en attente comme annulées, publie l’événement `session_closed`, ferme le EventBus et supprime la session des tables du daemon. Les sessions persistées sur disque NE sont PAS supprimées – elles peuvent être rechargées via `POST /session/:id/load`. Pré-vérification : `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent : retourne `404` pour les sessions inconnues (même forme `SessionNotFoundError` que les autres routes).

> **Événement `session_closed`.** Les abonnés SSE reçoivent un événement terminal `session_closed` avec `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` avant la fin du flux. Les réducteurs SDK traitent cela de manière identique à `session_died` (met `alive: false`, efface `pendingPermissions`).

### `PATCH /session/:id/metadata`

Met à jour les métadonnées modifiables d’une session. Ne prend actuellement en charge que `displayName`. Pré-vérification : `caps.features.session_metadata`.

Requête :

```json
{ "displayName": "Ma session d’investigation" }
```

| Champ        | Requis | Notes                                                                                |
|--------------|--------|--------------------------------------------------------------------------------------|
| `displayName`| non    | Chaîne, 256 caractères max. Une chaîne vide efface le nom. Omettre pour laisser inchangé. |

Réponse :

```json
{ "sessionId": "<uuid>", "displayName": "Ma session d’investigation" }
```

Publie un événement `session_metadata_updated` sur le flux SSE de la session avec `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Actualise la comptabilité de dernière vue du daemon pour cette session. Les adaptateurs longue durée (TUI/IDE/web) envoient ce signal à intervalles réguliers afin qu’une future politique de révocation (Wave 5 PR 24) puisse distinguer les clients morts des clients silencieux.
En-têtes :

| En-tête              | Requis | Remarques                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `X-Qwen-Client-Id`   | non    | Renvoie l'identifiant émis par le démon depuis `POST /session`. Les clients identifiés mettent également à jour leur horodatage par client ; les heartbeat anonymes ne font qu'incrémenter le watermark de session. Doit respecter la même forme `[A-Za-z0-9._:-]{1,128}` qu'ailleurs. |

Le corps de la requête est vide (`{}` convient — aucun champ n'est lu actuellement).

Réponse :

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` n'est renvoyé que lorsqu'un `X-Qwen-Client-Id` de confiance a été fourni. `lastSeenAt` correspond à l'epoch (ms) `Date.now()` côté démon que le bridge a stockée.

Erreurs :

- `400` — `{ code: 'invalid_client_id' }` lorsque l'en-tête est malformé (règle de format d'en-tête) ou lorsqu'il porte un `clientId` non enregistré pour cette session (le bridge lève `InvalidClientIdError` avant d'incrémenter tout horodatage).
- `404` — session inconnue.

Contrôle par capacité : pré-vérification `caps.features.client_heartbeat`. Les démons plus anciens renvoient `404` pour ce chemin.

### `POST /session/:id/model`

Changer le modèle actif **dans** le service de modèle actuellement lié à la session. Sérialisé via la file d'attente de changement de modèle par session.

(Pour changer le _service_ lui-même — Alibaba ModelStudio vs OpenRouter etc — passez `modelServiceId` sur `POST /session` pour une session fraîche. L'étape 1 n'a pas de route de changement de service en direct.)

Requête :

```json
{ "modelId": "qwen-staging" }
```

Réponse :

```json
{ "modelId": "qwen-staging" }
```

En cas de succès, publie `model_switched` dans le flux SSE. En cas d'échec, publie `model_switch_failed` (afin que les abonnés passifs voient l'échec, pas seulement l'appelant). Entre en compétition avec la sortie du canal agent de sorte qu'un enfant bloqué ne puisse pas bloquer le gestionnaire HTTP.

### `POST /session/:id/recap`

Étiquette de capacité : `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Générer un résumé d'une phrase « où en êtes-vous » de la session. Englobe `generateSessionRecap` du noyau (`packages/core/src/services/sessionRecap.ts`), qui exécute une requête secondaire contre le modèle rapide avec les outils désactivés, `maxOutputTokens: 300`, et un format de sortie strict `<recap>...</recap>`. La requête secondaire lit l'historique de chat GeminiClient existant de la session et **ne l'ajoute pas**.

Le corps de la requête est ignoré (envoyez `{}` ou vide). Porte de mutation non stricte — la posture reflète `/session/:id/prompt` (l'appel coûte des tokens mais ne modifie aucun état). Aucun événement SSE n'est publié.

Réponse (200) :

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` est `null` (un 200 normal, pas une erreur) lorsque :

- la session a moins de deux tours de dialogue,
- la requête secondaire n'a renvoyé aucune charge utile `<recap>...</recap>` extractible,
- ou une erreur de modèle sous-jacente s'est produite (l'assistant noyau est au mieux et ne lève jamais).

Erreurs :

- `400 {code: 'invalid_client_id'}` — en-tête `X-Qwen-Client-Id` malformé.
- `404` — session inconnue.

Annulation : **aucune dans la v1**. La route n'écoute pas la déconnexion du client HTTP, aucun `AbortSignal` n'est transmis au bridge, et l'enfant ACP exécute la requête secondaire jusqu'à son terme, que l'appelant soit déconnecté ou non. Les seuls plafonds sont le délai d'attente de sécurité du bridge de 60s (`SESSION_RECAP_TIMEOUT_MS`) et la course à la fermeture du transport contre la mort du canal ACP. Cela est acceptable car le résumé est court (tentative unique, `maxOutputTokens: 300`, ~1–5s typique) ; une méthode ext d'annulation basée sur l'ID de requête pourrait implémenter une annulation complète de bout en bout dans une future version si le coût en bande passante le justifie un jour.

### Mutation : approbation, outils, initialisation, redémarrage MCP

Le problème [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 ajoute quatre routes de contrôle de mutation qui permettent aux clients distants de modifier la posture d'exécution sans toucher à la CLI de l'hôte du démon. Les quatre :

- Sont contrôlées par la porte de mutation **stricte** du PR 15. Un démon configuré sans jeton Bearer les rejette avec `401 {code: 'token_required'}`. Configurez `--token` (ou `QWEN_SERVER_TOKEN`) avant d'opter.
- Acceptent et estampillent l'en-tête `X-Qwen-Client-Id` (chaîne d'audit PR 7). Lorsque l'en-tête porte un identifiant de confiance, le démon émet `originatorClientId` sur l'événement SSE correspondant afin que les interfaces utilisateur inter-clients puissent supprimer les échos de leurs propres mutations.
- Pré-vérifient chaque capacité par étiquette avant d'exposer la fonctionnalité. Les démons plus anciens renvoient `404` pour la route.

Trois des quatre routes (`tools/:name/enable`, `init`, `mcp/:server/restart`) émettent des événements **au niveau de l'espace de travail** : chaque bus SSE de session active reçoit l'événement, quelle que soit la session attachée lors du déclenchement de la mutation. `approval-mode` émet un événement **au niveau de la session** car le changement est local à la `Config` d'une seule session.
#### `POST /session/:id/approval-mode`

Balisage de capacité : `session_approval_mode_control`. Pont → extension ACP `qwen/control/session/approval_mode`.

Modifier le mode d'approbation d'une session en cours. Le nouveau mode est immédiatement appliqué dans la `Config` par session de l'enfant ACP. Les paramètres ne sont PAS écrits sur le disque par défaut — passez `persist: true` pour également écrire `tools.approvalMode` dans les paramètres de l'espace de travail.

Requête :

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` doit être l'un des suivants : `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (correspond à l'énumération `ApprovalMode` du cœur ; le SDK exporte `DAEMON_APPROVAL_MODES` pour la validation à l'exécution). `persist` par défaut à `false`.

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
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — le mode demandé nécessite un dossier de confiance (les modes privilégiés dans des espaces de travail non fiables sont rejetés par `Config.setApprovalMode` du cœur).
- `404` — session inconnue.

Événement SSE (portée session) : `approval_mode_changed` avec `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Balisage de capacité : `workspace_tool_toggle`. Pur fichier E/S — pas d'aller-retour ACP.

Activer ou désactiver un nom d'outil dans la liste `tools.disabled` des paramètres de l'espace de travail. Les outils listés ici ne sont **pas enregistrés** du tout (distinct de `permissions.deny`, qui garde l'outil enregistré et rejette l'appel). Les outils intégrés et les outils découverts par MCP transitent par `ToolRegistry.registerTool`, qui consulte l'ensemble désactivé.

> ⚠️ **Les noms doivent correspondre exactement à l'identifiant exposé par le registre.** Aucune résolution d'alias n'est effectuée — la route stocke exactement la chaîne du paramètre de chemin dans `tools.disabled`, et le prochain enfant ACP la compare à `tool.name` au moment de l'enregistrement. Les outils intégrés utilisent leur nom de registre canonique (forme verbale en snake_case) : `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — PAS les étiquettes d'affichage (`Shell`, `Read`, `Write`) que la CLI fait apparaître. Les outils découverts par MCP utilisent la forme qualifiée `mcp__<server>__<name>` (qui est également la forme diffusée par les événements `tool_toggled` et listée par `GET /workspace/mcp`). Désactiver `Bash` n'empêchera PAS `run_shell_command` de s'enregistrer lors de la prochaine session.

Les enfants ACP en direct conservent les outils déjà enregistrés — la bascule prend effet lors du **prochain** démarrage d'un enfant ACP. Combinez avec `POST /workspace/mcp/:server/restart` (pour les outils provenant de MCP) ou la création d'une nouvelle session pour rendre le changement effectif dans le démon actuel.

Les noms d'outils inconnus sont acceptés : pré-désactiver un outil MCP non encore installé est un cas d'usage légitime.

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

Événement SSE (portée espace de travail) : `tool_toggled` avec `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Balisage de capacité : `workspace_init`. Pur fichier E/S — pas d'aller-retour ACP, **aucun appel LLM**.

Générer un `QWEN.md` vide (ou ce que `getCurrentGeminiMdFilename()` retourne avec les surcharges `--memory-file-name`) à la racine de l'espace de travail lié au démon. Mécanique uniquement — pour un remplissage piloté par l'IA, enchaînez avec `POST /session/:id/prompt`.

Par défaut, refuse d'écraser lorsque le fichier cible existe avec un contenu non blanc. Les fichiers contenant uniquement des espaces sont traités comme absents (correspond à la commande `/init` locale).

Requête :

```json
{ "force": false }
```

Réponse (200) :

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` vaut `'created'` pour les créations vierges, `'noop'` lorsqu'un fichier existant ne contenant que des espaces a été laissé intact (aucune écriture effectuée), et `'overwrote'` lorsque `force: true` a remplacé un contenu non vide. L'événement SSE `workspace_initialized` reflète l'action de la réponse — les observateurs peuvent filtrer avec `action !== 'noop'` pour réagir uniquement aux changements réels sur le disque.

Erreurs :

- `400 {code: 'invalid_force_flag'}` — `force` n'est pas un booléen.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — le fichier existe avec un contenu non blanc et `force` est omis/faux. Le corps contient le chemin absolu et la taille (octets) afin que les clients SDK puissent afficher une invite « écraser N octets ? » sans avoir à refaire un `stat`.

Événement SSE (portée espace de travail) : `workspace_initialized` avec `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Balisage de capacité : `workspace_mcp_restart`. Pont → extension ACP `qwen/control/workspace/mcp/restart`.

Redémarrer un serveur MCP configuré via `McpClientManager.discoverMcpToolsForServer` de l'enfant ACP (déconnexion + reconnexion + redécouverte). Vérifie préalablement l'instantané du budget en direct de la comptabilité PR 14 v1, de sorte qu'un redémarrage sur un espace de travail saturé en budget retourne un refus soft plutôt que de déclencher une cascade `BudgetExhaustedError`.
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

Raisons de saut conditionnel (toutes retournent 200) :

| `reason`                | Signification                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Une autre découverte/redémarrage pour ce serveur est déjà en cours. La route retourne immédiatement plutôt que d'attendre la promesse originale. L'appelant doit réessayer après un court délai. |
| `'disabled'`            | Le serveur est configuré mais listé dans `excludedMcpServers`. Réactivez-le avant le redémarrage.                                                                                             |
| `'budget_would_exceed'` | Le daemon est en mode `--mcp-budget-mode=enforce`, le serveur cible n'est pas actuellement dans `reservedSlots`, et le total en direct a atteint `clientBudget`. L'appelant doit d'abord libérer un emplacement. |

Erreurs (non-2xx) :

- `400 {code: 'invalid_server_name'}` — paramètre de chemin vide.
- `404` — nom du serveur absent de la configuration `mcpServers`, ou aucun canal ACP actif n'existe (le redémarrage nécessite intrinsèquement une instance `McpClientManager` active).
- `500` — erreur interne (par exemple, `ToolRegistry` non initialisé).

Événements SSE (scope espace de travail) : `mcp_server_restarted` avec `{serverName, durationMs, originatorClientId?}` en cas de succès ; `mcp_server_restart_refused` avec `{serverName, reason, originatorClientId?}` en cas de saut conditionnel.

### `GET /session/:id/events` (SSE)

S'abonner au flux d'événements de la session.

En-têtes :

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
```

Paramètres de requête :

| Paramètre   | Requis | Remarques                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | non    | Limite de backlog en direct par abonné. Plage [16, 2048], défaut 256. Les trames de relecture forcées lors de l'abonnement sont exemptées de la limite ; ce qui la consomme réellement, ce sont les événements en direct qui arrivent pendant que l'abonné draine encore une grande relecture `Last-Event-ID: 0`. Augmentez pour les reconnexions à froid afin que la queue en direct ne déclenche pas l'avertissement/expulsion de client lent avant que le consommateur ne rattrape. Les valeurs hors plage / non décimales / présentes mais vides retournent `400 invalid_max_queued` avant l'ouverture de la liaison SSE. Pré-vol `caps.features.slow_client_warning` — les anciens daemons ignorent silencieusement le paramètre. |

Format des trames. La ligne `data:` est l'**enveloppe complète de l'événement**, sérialisée en JSON sur une seule ligne — `{id?, v, type, data, originatorClientId?}`. La charge utile spécifique à l'ACP (arguments `sessionUpdate`, `requestPermission`, etc.) se trouve sous le champ `data` de l'enveloppe ; le `type` de l'enveloppe correspond à la ligne SSE `event:`.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42}}
```

Les lignes `id:` / `event:` au niveau SSE dupliquent `envelope.id` / `envelope.type` pour la compatibilité EventSource. Les consommateurs bruts `fetch` (le `parseSseStream` du SDK) lisent tout depuis l'enveloppe JSON et ignorent les lignes préliminaires SSE.
| Type d'événement            | Déclencheur                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`            | Toute notification ACP `sessionUpdate` (morceaux LLM, appels d'outils, utilisation)                                                                                                                                                                                                                                           |
| `permission_request`        | L'agent a demandé l'approbation d'un outil                                                                                                                                                                                                                                                                                    |
| `permission_resolved`       | Un client a voté sur une permission via `POST /permission/:requestId`                                                                                                                                                                                                                                                          |
| `permission_partial_vote`   | (consensus uniquement) Un vote a été enregistré mais le quorum n'est pas encore atteint. Transporte `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pré-vol `caps.features.permission_mediation`.                                                                                                   |
| `permission_forbidden`      | Un vote a été rejeté par la politique active (non-concordance `designated`, `local-only` non-loopback, ou électeur `consensus` non dans l'instantané). Transporte `{requestId, sessionId, clientId?, reason}`. Pré-vol `caps.features.permission_mediation`.                                                                     |
| `model_switched`            | `POST /session/:id/model` réussi                                                                                                                                                                                                                                                                                              |
| `model_switch_failed`       | `POST /session/:id/model` rejeté                                                                                                                                                                                                                                                                                              |
| `session_died`              | Le processus enfant de l'agent a planté de manière inattendue. **Terminal : le flux SSE se ferme après cette trame ; la session a disparu de `byId`.** Les abonnés doivent se reconnecter via `POST /session` pour en générer une nouvelle.                                                                                     |
| `slow_client_warning`       | Local à l'abonné : file d'attente ≥ 75% pleine. **Non-terminal** — le flux continue ; l'avertissement est un préavis avant expulsion. Transporte `{queueSize, maxQueued, lastEventId}`. Se déclenche UNE FOIS par épisode de débordement ; se réarme après que la file d'attente descend en dessous de 37,5%. Pas de `id` (synthétique). Pré-vol `caps.features.slow_client_warning`. |
| `client_evicted`            | Local à l'abonné : débordement de file d'attente. **Terminal : le flux SSE se ferme après cette trame** (pas de `id` — synthétique). Les autres abonnés sur la même session continuent.                                                                                                                                        |
| `stream_error`              | Erreur côté démon lors de la distribution. **Terminal : le flux SSE se ferme après cette trame** (pas de `id` — synthétique).                                                                                                                                                                                                |

Sémantique de reconnexion :

- Envoyez `Last-Event-ID: <n>` pour rejouer les événements avec `id > n` depuis l'anneau par session (profondeur par défaut **8000**, modifiable via `qwen serve --event-ring-size <n>`)
- **Détection d'écart (côté client) :** si `<n>` est antérieur au plus ancien événement encore présent dans l'anneau (par exemple, vous vous reconnectez avec `Last-Event-ID: 50` mais l'anneau contient maintenant 200–1199), le démon rejoue depuis le plus ancien événement disponible sans lever d'alerte. Comparez le `id` du premier événement rejoué avec `n + 1` ; toute différence correspond à la taille de la fenêtre perdue. L'étape 2 injectera une trame synthétique explicite `stream_gap` côté démon ; à l'étape 1, la détection est la responsabilité du client.
- Les IDs sont monotones par session, commençant à 1
- Les trames synthétiques (`client_evicted`, `slow_client_warning`, `stream_error`) omettent intentionnellement `id` afin de ne pas brûler un slot de séquence pour les autres abonnés
Contre-pression :

- Par défaut, la file d'attente par abonné est de `maxQueued: 256` éléments en direct (les trames de relecture lors de la reconnexion ne sont pas soumises à cette limite). Remplacez via `?maxQueued=N` (plage `[16, 2048]`) sur la requête SSE.
- Lorsque la file d'attente d'un abonné dépasse 75 % de sa capacité, le bus envoie de force une trame synthétique `slow_client_warning` à cet abonné (une fois par épisode de débordement, réarmée après une vidange en dessous de 37,5 %). Le flux reste ouvert — l'avertissement est un signal pour que le client puisse vider plus vite ou se détacher et se reconnecter proprement.
- Si la file d'attente dépasse réellement l'avertissement, le bus émet la trame terminale `client_evicted` et ferme l'abonnement.

### `POST /permission/:requestId`

Votez sur une `permission_request` en attente. La **politique de médiation** active décide qui gagne :

| Politique                     | Comportement                                                                                                                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (par défaut) | Tout électeur validé gagne ; les suivants reçoivent `404`. Base de référence pré-F3.                                                                                                                                                                                                    |
| `designated`                   | Seul l'initiateur de l'invite (`originatorClientId`) décide ; les non-initiateurs reçoivent `403 permission_forbidden / designated_mismatch`. Retour à first-responder pour les invites anonymes.                                                                                       |
| `consensus`                    | Les électeurs N parmi M doivent être d'accord (par défaut `N = floor(M/2) + 1`, remplacez via `policy.consensusQuorum`). La première option qui atteint `N` gagne. Les votes non résolus reçoivent `200` + les trames SSE `permission_partial_vote`.                                     |
| `local-only`                   | Seuls les électeurs en boucle locale décident ; les appelants distants reçoivent `403 permission_forbidden / remote_not_allowed`.                                                                                                                                                        |

La politique active est configurée dans `settings.json` sous `policy.permissionStrategy` et exposée sur `/capabilities` à `body.policy.permission`. Pré-vérifiez `caps.features.permission_mediation` (avec `modes: [...]`) pour l'ensemble supporté par la build.

> **F3 (#4175) : coordination des permissions multi-client.** F3 a ajouté les quatre politiques ci-dessus. Les daemons pré-F3 hardcodaient first-responder ; la forme du fil reste bit pour bit inchangée lorsque la politique configurée est `first-responder`. Les nouveaux événements (`permission_partial_vote`, `permission_forbidden`) sont additifs — les anciens SDK les voient comme `unrecognized_known_event` et les ignorent gracieusement.

> **Délai d'expiration des permissions (5 minutes par défaut).** Une `permission_request` reste en attente jusqu'à : (a) qu'un client vote ici, (b) que `POST /session/:id/cancel` soit déclenché, (c) que le client HTTP pilotant l'invite se déconnecte (annulation en cours d'invite résout les permissions en attente comme `cancelled`), (d) que la session soit tuée, (e) que le daemon s'arrête, **ou (f) que le délai d'expiration de permission par session soit déclenché** (`DEFAULT_PERMISSION_TIMEOUT_MS`, 5 minutes). Lors du déclenchement du délai, le `requestPermission` de l'agent se résout comme `{outcome: 'cancelled'}`, l'anneau d'audit enregistre une entrée `permission.timeout`, la sortie d'erreur du daemon émet un breadcrumb d'une ligne, et le bus SSE diffuse la trame standard `permission_resolved` annulée afin que les abonnés nettoient. Le délai est configurable via `BridgeOptions.permissionResponseTimeoutMs` ; les appelants sans tête exécutant des invites longues peuvent vouloir l'étendre.

Requête :

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Résultats :

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — accepter / refuser / proceed-once / etc, selon les choix offerts par l'agent.
- `{ "outcome": "cancelled" }` — abandonner la requête (correspond à ce que `cancelSession` / `shutdown` font en interne).

Réponse :

- `200 {}` — votre vote a été accepté (résolu OU enregistré sous quorum de consensus).
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3 : la politique active a rejeté votre vote.
- `404 { "error": "..." }` — le requestId est inconnu (déjà résolu, n'a jamais existé, ou session supprimée).
- `500 { "code": "cancel_sentinel_collision", ... }` — F3 : le `allowedOptionIds` de l'agent contient le sentinel réservé `'__cancelled__'` ; violation du contrat agent/daemon.
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 forward-compat : un littéral de politique a atterri dans le schéma mais sa branche de médiation n'est pas encore construite (actuellement inaccessible, réservé pour les politiques futures).

Après un vote réussi, chaque client connecté voit `permission_resolved` avec le même `requestId` et le `outcome` choisi. Sous `consensus`, les votes intermédiaires diffusent en plus `permission_partial_vote` jusqu'au quorum.
### Routes de flux d'authentification par appareil (issue #4175 PR 21)

Le daemon orchestre un OAuth 2.0 Device Authorization Grant (RFC 8628) afin qu'un client SDK distant puisse déclencher une connexion dont les jetons aboutissent sur le système de fichiers du **daemon** — pas sur le client. Le daemon interroge lui-même le fournisseur d'identité (IdP) ; le seul rôle du client est d'afficher l'URL de vérification + le code utilisateur et (optionnellement) de s'abonner aux événements SSE pour les notifications d'achèvement.

Tag de capacité : `auth_device_flow` (toujours annoncé). Fournisseurs pris en charge dans
v1 : `qwen-oauth`.

> [!note]
>
> Le niveau gratuit de Qwen OAuth a été interrompu le 2026-04-15. Traitez `qwen-oauth` comme
> l'identifiant de fournisseur hérité v1 dans ce protocole ; les nouveaux clients devraient préférer un
> fournisseur d'authentification actuellement pris en charge lorsqu'il est disponible.

**Localité d'exécution.** Le daemon ne lance jamais de navigateur — même s'il le peut. Le client décide s'il doit appeler `open(verificationUri)` localement ; sur un pod sans tête (le déploiement canonique Mode B), l'utilisateur ouvre l'URL sur l'appareil dont il dispose avec un navigateur. Voir `docs/users/qwen-serve.md` pour l'UX recommandé.

**Aucune fuite de jeton dans les événements.** `auth_device_flow_started` ne transporte que `{deviceFlowId, providerId, expiresAt}`. Le code utilisateur et l'URL de vérification reviennent point à point dans le corps de la réponse POST 201 et via `GET /workspace/auth/device-flow/:id` ; ils ne sont jamais diffusés sur SSE.

**Singleton par fournisseur.** Un deuxième `POST` pour le même fournisseur alors qu'un flux est en attente est une reprise idempotente — il renvoie l'entrée existante avec `attached: true` au lieu de lancer une nouvelle requête IdP.

#### `POST /workspace/auth/device-flow`

Porte d'entrée stricte pour les mutations : nécessite un jeton même sur les valeurs par défaut de la boucle de retour sans jeton (`401 token_required`).

Requête :

```json
{ "providerId": "qwen-oauth" }
```

Réponse (`201` nouveau départ, `200` reprise idempotente) :

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
- `409 too_many_active_flows` — limite de l'espace de travail (4) atteinte ; en annuler une avec `DELETE`
- `401 token_required` — la porte d'entrée stricte a refusé une requête sans jeton
- `502 upstream_error` — l'IdP a renvoyé une erreur inattendue

#### `GET /workspace/auth/device-flow/:id`

Lire l'état actuel. Les entrées en attente renvoient `userCode/verificationUri/expiresAt/intervalMs` ; les entrées terminales (grâce de 5 minutes) les suppriment et affichent `status` + éventuellement `errorKind/hint`.

Renvoie `404 device_flow_not_found` pour les identifiants inconnus et les entrées expulsées après la grâce.

#### `DELETE /workspace/auth/device-flow/:id`

Annulation idempotente :

- entrée en attente → `204` + émission de `auth_device_flow_cancelled`
- entrée terminale → `204` sans opération (pas de réémission d'événement)
- identifiant inconnu → `404`

#### `GET /workspace/auth/status`

Instantané des flux en attente + fournisseurs pris en charge :

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

#### Événements SSE de flux d'authentification par appareil

Cinq événements typés (portée de l'espace de travail, diffusés à tous les bus de session actifs) :

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST réussi ; le SDK doit s'abonner (pas de code utilisateur ici, récupérer via GET si nécessaire)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — le daemon a respecté le `slow_down` en amont ; les clients qui interrogent GET doivent augmenter leur intervalle pour correspondre
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — les informations d'identification ont été persistées ; `accountAlias` est une étiquette non-PII (jamais email/téléphone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal ; `errorKind` peut être `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` est interne au daemon : l'échange IdP a réussi mais le daemon n'a pas pu stocker durablement les informations d'identification (EACCES / EROFS / ENOSPC). L'utilisateur doit réessayer une fois le problème de disque sous-jacent résolu.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE réussi sur une entrée en attente

> **Non compatible MCP.** La spécification d'autorisation MCP (2025-06-18) impose OAuth 2.1 + PKCE auth-code avec un callback de redirection, ce qui ne fonctionne pas pour les daemons sur pods sans tête. La surface de flux d'authentification par appareil du Mode B est privée au daemon — les clients ciblant des serveurs conformes MCP doivent utiliser un chemin d'authentification différent.

## Format filaire de streaming

Les événements sont émis sous forme de trames EventSource standard. Le daemon écrit une ligne `data:` par trame (le JSON n'a pas de sauts de ligne intégrés après `JSON.stringify`) ; l'analyseur SDK dans `packages/sdk-typescript/src/daemon/sse.ts` gère à la fois ce format et la forme multi-`data:` autorisée par la spécification côté réception.
## Trames d'erreur pendant le streaming

Si l'itérateur du pont lève une exception lors du service d'un abonné SSE, le démon émet une trame terminale `stream_error` (sans `id`). La ligne `data:` contient l'enveloppe complète (même forme que toutes les autres trames SSE de ce document) ; le message d'erreur réel se trouve sous `envelope.data.error` :

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

La connexion se ferme ensuite.

## Variables d'environnement

| Var                 | Objectif                                                        |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Jeton Bearer. Les espaces de début et de fin sont supprimés au démarrage. |

## Structure des sources

| Chemin                                                 | Objectif                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                 | commande yargs + schéma des drapeaux                                                                       |
| `packages/cli/src/serve/run-qwen-serve.ts`           | cycle de vie de l'écouteur + gestion des signaux                                                                       |
| `packages/cli/src/serve/server.ts`                   | routes Express + middleware                                                                                |
| `packages/cli/src/serve/auth.ts`                     | Bearer + liste d'autorisation des hôtes + refus CORS                                                                        |
| `packages/cli/src/serve/httpAcpBridge.ts`            | duplication ou attachement + FIFO par session + registre de permissions                                                   |
| `packages/cli/src/serve/status.ts`                   | types fil de statut du démon en lecture seule + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`             | assistant pur qui construit les charges utiles `/workspace/env` à partir de l'état de `process.*`, y compris la rédaction des identifiants   |
| `packages/acp-bridge/src/eventBus.ts`                | file d'attente asynchrone bornée + anneau de relecture                                                                          |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | client TS                                                                                                  |
| `packages/sdk-typescript/src/daemon/sse.ts`          | analyseur de trames EventSource                                                                                   |
| `integration-tests/cli/qwen-serve-routes.test.ts`    | 18 cas, sans LLM                                                                                           |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 cas, enfant réel `qwen --acp` soutenu par le faux serveur OpenAI local (POSIX uniquement ; ignoré sur Windows)   |
