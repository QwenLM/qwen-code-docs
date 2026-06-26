# Référence du protocole HTTP de `qwen serve`

Étape 1 de la [conception du démon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Toutes les routes se trouvent sous l'URL de base du démon (par défaut `http://127.0.0.1:4170`).

## Authentification

Lorsque le démon a été démarré avec `--token` ou `QWEN_SERVER_TOKEN`, **toute route sauf `/health` sur les liaisons loopback** doit porter :

```
Authorization: Bearer <token>
```

Sans token configuré (par défaut en développement sur loopback), l'en-tête est optionnel. La comparaison des tokens est à temps constant. Les réponses 401 sont uniformes entre `missing header` / `wrong scheme` / `wrong token`.

**Exemption `/health`** (Bctum) : sur les liaisons loopback (`127.0.0.1` / `localhost` / `::1` / `[::1]`), `/health` est enregistrée AVANT le middleware bearer, de sorte que les sondes de liveness dans le pod n'aient pas besoin de porter le token même lorsque le démon est démarré avec `--token`. Les liaisons non-loopback (`--hostname 0.0.0.0` etc.) soumettent `/health` au bearer comme toute autre route — voir la section [`GET /health`](#get-health) pour la justification.

**`--require-auth` (#4175 PR 15).** En passant ce drapeau au démarrage, la règle « doit avoir un token » est étendue également au loopback. Le démarrage échoue sans token ; l'exemption `/health` est supprimée (`/health` nécessite donc aussi `Authorization: Bearer …`).

Lorsque le drapeau est activé, le middleware global `bearerAuth` protège **toutes** les routes — y compris `/capabilities`. Un client **non authentifié** ne peut donc pas pré-identifier `caps.features` pour découvrir que l'authentification est requise : la surface de découverte pour ce cas est le **corps de la réponse 401** lui-même (uniforme sur toutes les routes conformément à la section [Authentification](#authentification)). Le tag de capacité `require_auth` est une **confirmation post-authentification** — une fois qu'un client s'authentifie avec succès et lit `/capabilities`, la présence du tag confirme que le démon a été démarré avec `--require-auth` (utile pour les interfaces d'audit / conformité et pour que les clients SDK puissent afficher « ce déploiement est renforcé » dans un panneau de paramètres). Les routes de mutation qui optent pour un mode strict par route (suites Wave 4) refusent avec `401 { code: "token_required", error: "…" }` lorsqu'elles sont atteintes sur une interface loopback par défaut sans token — mais avec `--require-auth` activé, le middleware bearer global court-circuite la requête avant la porte par route, donc le corps `Unauthorized` hérité est ce que les appelants non authentifiés voient réellement.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Les interfaces web navigateur accédant au démon depuis une origine différente sont bloquées par défaut — toute requête portant un en-tête `Origin` renvoie `403 {"error":"Request denied by CORS policy"}` car les clients CLI/SDK n'envoient jamais `Origin` et le démon interprète sa présence comme un signe que la requête provient d'un contexte navigateur que l'opérateur n'a pas autorisé. Passez `--allow-origin <pattern>` (répétable) au démarrage pour installer une liste d'autorisation au lieu du blocage. Chaque pattern est soit :

- Le littéral `*` — admet toute origine. **Risqué** : le démarrage refuse lorsque `*` est configuré mais qu'aucun token bearer n'est défini (quelle que soit la source : `--token`, `QWEN_SERVER_TOKEN`, ou `--require-auth` qui impose un token au démarrage). La trace de démarrage émet un avertissement sur stderr lorsque `*` est dans la liste. **Recommandation** : associer avec `--require-auth` sur les liaisons loopback afin que `/health` et `/demo` soient également protégés par le bearer — ils sont enregistrés avant le middleware bearer sur loopback par défaut (afin que les sondes k8s/Compose puissent atteindre `/health` sans token), et une liste d'autorisation `*` les rend accessibles depuis n'importe quel navigateur d'origine différente. Sur les liaisons non-loopback, le bearer est déjà obligatoire au démarrage, donc la surface d'exposition de `*` se limite à `/health` (JSON de statut) et `/demo` (une page statique dont le JS appelle tout de même des routes protégées par token) — la surface API réelle est protégée dans tous les cas.
- Une origine d'URL canonique — `<scheme>://<host>[:<port>]`. **Pas de slash final, pas de chemin, pas d'userinfo, pas de requête.** Le démarrage refuse avec `InvalidAllowOriginPatternError` si l'entrée échoue au test aller-retour `new URL(pattern).origin === pattern` ; le message d'erreur nomme le mauvais pattern et la forme canonique. Stricte par intention : une normalisation silencieuse (par exemple, supprimer un slash final) laisserait passer des fautes de frappe et accepterait une entrée ambiguë.

Les origines correspondantes reçoivent les en-têtes de réponse CORS standard sur chaque requête :

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After
```

`Access-Control-Allow-Origin` renvoie l'origine de la requête textuellement (minuscules / majuscules telles que le navigateur les a envoyées) plutôt que le littéral `*`, même sous le pattern `*` — les caches navigateur indexent les réponses sur celui-ci associé à `Vary: Origin`, et le renvoi laisse la possibilité d'ajouter `Access-Control-Allow-Credentials` dans une version ultérieure sans changement de schéma. `Access-Control-Expose-Headers: Retry-After` permet aux interfaces web navigateur d'honorer les indications de nouvelle tentative du démon provenant des réponses `429` / `503`. `Access-Control-Allow-Credentials` n'est **PAS** envoyé aujourd'hui : le démon s'authentifie via le bearer dans `Authorization`, qui fonctionne entre origines sans `credentials: 'include'`.

Les requêtes pré-vol OPTIONS (OPTIONS avec `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) sont court-circuitées avec `204 No Content` et les en-têtes ci-dessus. C'est le modèle CORS classique et il est sûr — la pré-vol confirme uniquement quelles méthodes/en-têtes le démon acceptera ; la requête réelle suivante exécute toujours la chaîne complète (liste d'autorisation hôte → authentification bearer → routes), donc la protection anti-rebond DNS et l'application du bearer ont toujours lieu avant toute lecture ou modification d'état. Les requêtes OPTIONS simples provenant d'origines autorisées continuent leur traitement vers l'aval avec les en-têtes CORS attachés.

Les origines qui ne correspondent pas à la liste d'autorisation reçoivent toujours `403 {"error":"Request denied by CORS policy"}` — la même enveloppe que le blocage par défaut, afin que les clients qui analysent déjà la réponse du blocage n'aient pas à traiter différemment les démons déployés avec une liste d'autorisation. Le chemin de rejet **n'émet aucun** en-tête `Access-Control-*` (le navigateur les ignorerait, et les émettre divulguerait indirectement la taille de la liste d'autorisation via la présence d'en-têtes).

La liste des patterns configurés n'est intentionnellement **pas** renvoyée dans `/capabilities` — l'interface web navigateur connaît déjà sa propre origine (elle a appelé le démon, après tout), et exposer la liste permettrait à un lecteur non authentifié de `/capabilities` d'énumérer chaque origine de confiance (utile pour une reconnaissance en cas de déploiement mal configuré). Les clients SDK se basent sur le tag `caps.features.allow_origin` pour savoir que « ce démon honore les requêtes navigateur d'origines différentes » sans avoir besoin de connaître les origines spécifiques.

Les requêtes d'auto-origine loopback (par exemple, la page `/demo` appelant le démon sur le même `127.0.0.1:port`) sont traitées par un **intercepteur distinct** de suppression d'Origin qui s'exécute AVANT le middleware CORS et supprime l'en-tête `Origin` pour `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Ainsi, elles passent quelle que soit la configuration `--allow-origin` — les opérateurs n'ont pas besoin de lister le propre port du démon pour que la page de démonstration fonctionne.

## Structure d'erreur commune

Les réponses 5xx transportent le `code` et les `data` d'origine de l'erreur lorsqu'ils sont présents (style JSON-RPC — le SDK ACP transmet `{code, message, data}` depuis l'agent) :

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

`WorkspaceMismatchError` pour un `POST /session` dont le `cwd` ne se canonise pas vers l'espace de travail lié du démon (#3803 §02 — 1 démon = 1 espace de travail) renvoie `400` avec :

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\" but request asked for \"…\". …",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/binds",
  "requestedWorkspace": "/path/in/the/request"
}
```

Utilisez cette erreur pour détecter une incohérence en amont : lisez `workspaceCwd` dans `/capabilities` et omettez `cwd` de `POST /session` (il revient à l'espace de travail lié), ou acheminez la requête vers un démon lié à `requestedWorkspace`.

`POST /session` dépassant la limite `--max-sessions` du démon renvoie `503` avec un en-tête `Retry-After: 5` et :

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20
}
```

Les rattachements à des sessions existantes ne sont PAS comptés dans cette limite, donc les reconnexions d'un démon inactif continuent de fonctionner même lorsqu'il est à pleine capacité.

`RestoreInProgressError` — émise uniquement par `POST /session/:id/load` et `POST /session/:id/resume` — renvoie `409` avec un en-tête `Retry-After: 5` (correspondant à `session_limit_exceeded`) et :

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Déclenché lorsqu'un `session/load` est émis pour un identifiant qui a déjà un `session/resume` en cours (ou vice versa). Attendez au moins `Retry-After` secondes et réessayez — la restauration sous-jacente se termine dans `initTimeoutMs` (10s par défaut). Les courses de même action (`load` vs `load`, `resume` vs `resume`) sont fusionnées au lieu de générer une erreur.

## Capacités

Le démon annonce ses tags de fonctionnalités pris en charge depuis le registre de capacités serve. Les clients **doivent** baser leur interface sur `features`, pas sur `mode` (selon la conception §10).

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

> Les tags conditionnels n'apparaissent que lorsque leur bascule de déploiement correspondante est activée (voir le tableau ci-dessous). Le tag `permission_mediation` de F3 est toujours présent et porte `modes: ['first-responder', 'designated', 'consensus', 'local-only']` afin que les clients SDK puissent inspecter l'ensemble pris en charge par la build ; la stratégie active au moment de l'exécution se trouve dans `body.policy.permission`.

`session_scope_override` est le gestionnaire de négociation pour le champ `sessionScope` par requête sur `POST /session` (voir ci-dessous). Les démons plus anciens ignorent silencieusement ce champ, donc les clients SDK doivent pré-vérifier `caps.features` pour ce tag avant de l'envoyer.

`session_load` et `session_resume` annoncent les routes de restauration explicite (`POST /session/:id/load` et `POST /session/:id/resume`). Les démons plus anciens renvoient `404` pour ces chemins, donc les clients SDK doivent pré-vérifier `caps.features` avant d'appeler. `unstable_session_resume` est toujours annoncé comme un alias déprécié pour la compatibilité avec les SDK qui ont été livrés alors que la méthode ACP sous-jacente était nommée `connection.unstable_resumeSession` ; les nouveaux clients doivent se baser sur `session_resume`.

`slow_client_warning` couvre deux fonctionnalités de backpressure SSE co-publiées dans #4175 Wave 2.5 PR 10 : (a) le démon émet une trame de flux d'événements synthétique `slow_client_warning` lorsque la file d'attente d'un abonné dépasse 75% de remplissage, une fois par épisode de débordement (réarmée après que la file d'attente descend en dessous de 37,5%) ; (b) `GET /session/:id/events` accepte un paramètre de requête `?maxQueued=N` (plage `[16, 2048]`) pour pré-dimensionner le backlog par abonné lors de reconnexions à froid sur un grand anneau de rejeu. La taille de l'anneau à l'échelle du démon est contrôlée par `--event-ring-size` (par défaut **8000**, selon #3803 §02). Les anciens démons ne possèdent silencieusement aucune de ces deux fonctionnalités — pré-vérifiez ce tag avant d'opter.

`typed_event_schema` annonce que les charges utiles des événements du démon correspondent au schéma `KnownDaemonEvent` du SDK. Les démons plus anciens peuvent encore diffuser des trames compatibles, mais les clients SDK doivent pré-vérifier ce tag avant de supposer une couverture typée des événements.

`client_heartbeat` annonce `POST /session/:id/heartbeat`. Les démons plus anciens renvoient `404` ; pré-vérifiez ce tag avant d'émettre des battements de cœur périodiques.

`session_close` et `session_metadata` annoncent `DELETE /session/:id` et `PATCH /session/:id/metadata`. Les démons plus anciens renvoient `404` ; pré-vérifiez ces tags avant d'exposer des fonctions de fermeture ou de renommage.

`session_lsp` annonce `GET /session/:id/lsp`, l'instantané de statut LSP structuré en lecture seule pour les clients du démon. Les démons plus anciens renvoient `404` ; pré-vérifiez ce tag avant d'exposer un statut LSP distant.

`session_status` annonce `GET /session/:id/status`, le résumé du pont actif pour une seule session par identifiant (`clientCount` / `hasActivePrompt` et les champs principaux). Les démons plus anciens renvoient `404` ; pré-vérifiez ce tag avant d'interroger le statut d'une seule session au lieu de parcourir la liste complète des sessions.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_init` et `workspace_mcp_restart` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) annoncent les quatre routes de contrôle de mutation documentées sous « Mutation : approval, tools, init, MCP restart » ci-dessous. Les quatre sont strictement protégées par la porte de mutation PR 15 (un démon configuré sans token bearer les rejette avec 401 `token_required`). Les démons plus anciens renvoient `404` ; pré-vérifiez chaque tag avant d'exposer la fonctionnalité correspondante.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) couvre la surface de budget MCP : les champs `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` sur `GET /workspace/mcp`, le champ `disabledReason` sur les cellules par serveur, et les indicateurs CLI `--mcp-client-budget` / `--mcp-budget-mode`. Les démons plus anciens omettent complètement les nouveaux champs ; les clients SDK pré-vérifient ce tag avant de se fier à la sémantique de `budgets[]`. Le descripteur de registre porte également `modes: ['warn', 'enforce']` pour une future exposition des modes de fonctionnalité — pour l'instant, les clients déduisent le mode du champ `budgetMode` de l'instantané. Le refus du serveur en mode `enforce` est déterministe selon l'ordre de déclaration `Object.entries(mcpServers)` ; une future couche de priorité de portée (si qwen-code en adopte une) passerait à « priorité la plus faible d'abord » pour refléter la convention `plugin < user < project < local` de claude-code.

> ⚠️ **Portée PR 14 v1 : par session, pas par espace de travail.** Chaque session ACP à l'intérieur du démon construit sa propre `Config` + `McpClientManager` (via `acpAgent.newSessionConfig`). Les limites de budget concernent les clients MCP actifs **par session** ; chaque session lit indépendamment `QWEN_SERVE_MCP_CLIENT_BUDGET` depuis l'environnement transmis. Avec `--mcp-client-budget=10` et 5 sessions ACP concurrentes, le nombre réel de clients MCP actifs peut atteindre 5 × 10 = 50 dans tout le démon. L'instantané `GET /workspace/mcp` ne lit que la comptabilité du `McpClientManager` de la **session d'amorçage** — la valeur `budgets[0].scope: 'session'` est le signal honnête qu'il s'agit d'une mesure par session, non agrégée. **Wave 5 PR 23 (pool MCP partagé)** introduira un gestionnaire à portée d'espace de travail et ajoutera une cellule `scope: 'workspace'` à côté de la cellule par session pour une véritable agrégation inter-sessions. v1 est la base de compteur en processus et d'application souple sur laquelle PR 23 s'appuie.

`workspace_file_read` couvre les routes de fichiers de l'espace de travail en texte/liste/stat/glob (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` couvre `GET /file/bytes`, qui a été ajouté plus tard pour que les clients puissent pré-vérifier la prise en charge brute des fenêtres d'octets par rapport aux démons de l'ère PR19. `workspace_file_write` couvre les routes de mutation de texte avec vérification de hachage (`POST /file/write`, `POST /file/edit`). Le tag d'écriture signifie que le contrat de route existe ; il ne signifie pas que le déploiement actuel est ouvert à une mutation anonyme. Write/edit sont des routes de mutation strictes et nécessitent un token bearer configuré même sur loopback.

`daemon_status` annonce `GET /daemon/status`, l'instantané de diagnostic opérateur consolidé en lecture seule documenté ci-dessous.

**Tags conditionnels.** Un petit nombre de tags de fonctionnalités ne sont annoncés que lorsque la bascule de déploiement correspondante est activée. Présence du tag = comportement activé ; absence = soit un démon plus ancien antérieur au tag, soit un démon actuel pour lequel l'opérateur n'a pas opté. Actuellement :

| Tag                        | Annoncé lorsque …                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`             | le démon a été démarré avec `--require-auth` (ou `requireAuth: true` via l'API embarquée). Le token bearer est obligatoire sur chaque route, y compris `/health` sur les liaisons loopback.                                                                                                                                                                                                                                                                                                                    |
| `mcp_workspace_pool`       | le pool de transport MCP partagé est actif. Omis lorsque `QWEN_SERVE_NO_MCP_POOL=1` désactive le pool.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `mcp_pool_restart`         | le pool de transport MCP partagé est actif ; les réponses de redémarrage peuvent inclure des formes multi-entrées tenant compte du pool.                                                                                                                                                                                                                                                                                                                                                                           |
| `allow_origin`             | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Le démon a été démarré avec au moins un `--allow-origin <pattern>` (ou `allowOrigins: [...]` via l'API embarquée). Les requêtes d'origines différentes provenant d'origines autorisées reçoivent les en-têtes de réponse CORS appropriés ; les origines non autorisées reçoivent toujours le 403 par défaut. La liste des patterns configurés n'est intentionnellement **pas** renvoyée dans `/capabilities` pour éviter de divulguer l'ensemble des origines de confiance à des lecteurs non authentifiés — l'interface web navigateur connaît déjà sa propre origine. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                                        |
| `writer_idle_timeout`      | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                             |
| `workspace_settings`       | le démon a été créé avec une persistance des paramètres disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_shell_command`    | l'exécution de shell dans la session est explicitement activée.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rate_limit`               | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` est activé.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_reload`         | la prise en charge du rechargement de l'espace de travail est disponible dans la configuration de route embarquée.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
`mcp_guardrails` n'est **pas** dans ce tableau conditionnel — c'est une balise toujours active, annoncée dès que le binaire prend en charge les nouveaux champs de budget `/workspace/mcp`, que l'opérateur ait configuré un budget ou non. Les opérateurs qui n'ont pas défini `--mcp-client-budget` obtiennent quand même les nouveaux champs (avec `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) annonce les événements SSE typés qui remontent les franchissements d'état du budget MCP sans boucle de scrutation. Deux types de trames arrivent sur `GET /session/:id/events` :

- `mcp_budget_warning` — se déclenche une fois lors du franchissement à la hausse de 75 % de `reservedSlots.size / clientBudget`. Ne se réarme qu'après que le ratio descend en dessous de 37,5 % (`MCP_BUDGET_REARM_FRACTION`). Reprend l'hystérésis de `slow_client_warning` de la PR 10, mais au niveau du gestionnaire plutôt qu'au niveau du backlog par abonné. Charge utile : `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Se déclenche sous les modes `warn` et `enforce` ; jamais sous `off`.
- `mcp_child_refused_batch` — se déclenche à la fin de chaque passe `discoverAllMcpTools*` lorsqu'un ou plusieurs serveurs ont été refusés, ET en tant que lot de longueur 1 sur le chemin de refus paresseux de `readResource`. Charge utile : `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` est le littéral `'enforce'` car le mode `warn` ne refuse jamais.

Les deux événements vivent dans l'anneau de rejeu SSE par session (ils portent un `id`) afin qu'un client se reconnectant avec `Last-Event-ID` puisse les rejouer ; l'instantané sur `GET /workspace/mcp` reste la source de vérité pour l'état après une déconnexion prolongée. Toujours actif une fois annoncé — il n'y a pas de bascule conditionnelle. L'état du réducteur SDK (`DaemonSessionViewState`) expose `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` pour les adaptateurs qui souhaitent une UI simple de type lag.

## Routes

### `GET /health`

Sonde de vivacité. La forme par défaut renvoie `200 {"status":"ok"}` si l'écouteur est actif — peu coûteuse, sans accès au bridge, adaptée aux sondes de vivacité k8s/Compose à haute fréquence.

Passez `?deep=1` (accepte aussi `?deep=true` ou simplement `?deep`) pour une sonde qui expose les **compteurs** du bridge (uniquement informatif, pas un véritable contrôle de vivacité) :

```json
{ "status": "ok", "sessions": 3, "pendingPermissions": 1 }
```

> ⚠️ La sonde approfondie est **informative**, pas une véritable vérification de vivacité. Elle lit des accesseurs de compteurs (`bridge.sessionCount`, `bridge.pendingPermissionCount`) qui sont de simples getters de taille de Map ; ils ne sondent pas les processus enfants / canaux individuels et ne détecteront donc pas une session bloquée mais toujours comptée. Utilisez-la pour des tableaux de bord de capacité (concurrence actuelle vs `--max-sessions`, profondeur de file d'attente) plutôt que comme déclencheur pour « retirer ce démon de la rotation ». Une réponse `503 {"status":"degraded"}` est théoriquement possible si les getters d'une implémentation de bridge personnalisée lèvent une exception, mais ceux du bridge réel ne le font jamais — en fonctionnement normal, la sonde approfondie renvoie toujours 200. Pour une véritable vivacité, fiez-vous au fait que l'écouteur accepte une connexion TCP (c'est-à-dire le `/health` par défaut sans `?deep`).

**Auth :** requise **uniquement sur les liaisons non-loopback**. Sur loopback (`127.0.0.1`, `::1`, `[::1]`), `/health` est enregistré avant le middleware bearer, donc les sondes k8s/Compose dans le pod n'ont pas besoin de porter le jeton. Sur non-loopback (`--hostname 0.0.0.0` etc.), la route est enregistrée après le middleware bearer et renvoie 401 sans jeton valide — sinon un appelant non authentifié pourrait sonder des adresses arbitraires pour confirmer l'existence d'un `qwen serve`, une fuite d'informations de faible gravité qui se combine mal avec le scan de ports. Le refus CORS + la liste blanche d'hôtes s'appliquent toujours sur l'exemption loopback.

### `GET /daemon/status`

Diagnostics opérateur en lecture seule. Contrairement à `/health`, il s'agit d'une API de démon normale : elle est enregistrée après l'authentification bearer et la limitation de débit, y compris sur les liaisons loopback. Paramètre de requête :

- `detail=summary` (par défaut) lit uniquement l'état du démon en mémoire.
- `detail=full` inclut également les diagnostics de session en direct, les diagnostics de connexion ACP, les compteurs de flux d'authentification par appareil et les sections d'état de l'espace de travail.
- toute autre valeur de `detail` renvoie `400 { "code": "invalid_detail" }`.

`summary` n'interroge intentionnellement pas les méthodes d'état de l'espace de travail, ne démarre pas un enfant ACP et ne lance pas de session. `full` interroge chaque section d'espace de travail indépendamment ; un délai d'attente ou une exception marque uniquement cette section comme `unavailable` et ajoute un problème `workspace_status_unavailable`.

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

`status` est `error` si un problème a une sévérité d'erreur, `warning` si un problème a une sévérité d'avertissement, sinon `ok`. Les codes de problème sont stables et incluent `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits`, et `workspace_status_unavailable`. Pendant la courte fenêtre après que l'écouteur est prêt mais avant que l'environnement d'exécution complet soit monté, `/daemon/status` peut signaler `daemon_runtime_starting` ; si le montage asynchrone de l'environnement d'exécution échoue, il signale `daemon_runtime_failed` tandis que les routes d'exécution non-statut renvoient `503`.

Sécurité : la réponse n'inclut jamais de jetons bearer, d'identifiants clients, d'identifiants complets de connexion ACP, de codes utilisateur device-flow, ou d'URLs de vérification. `summary` omet le chemin du journal du démon ; `full` peut l'inclure pour les opérateurs authentifiés.

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

Contrat stable : lorsque `v` s'incrémente, la disposition de la trame a changé de manière incompatible avec les versions précédentes.

> **`protocolVersions`** décrit les versions du protocole serve que le démon peut parler. `current` est la version préférée du démon et `supported` est l'ensemble compatible. Les clients qui nécessitent un protocole spécifique doivent vérifier `supported` ; l'interface utilisateur spécifique à une fonctionnalité devrait toujours se baser sur `features`. Additif à v=1 : les anciens démons v1 omettent ce champ, donc les clients SDK qui ciblent des versions plus anciennes doivent le traiter comme optionnel.

> **`modelServices` est toujours `[]` dans l'étape 1.** L'agent utilise son service de modèle par défaut unique et ne l'énumère pas sur le réseau. L'étape 2 peuplera ce champ à partir des adaptateurs de modèle enregistrés afin que les clients SDK puissent construire des sélecteurs de service ; d'ici là, ne vous fiez PAS à ce champ comme non vide.

> **`workspaceCwd`** est le chemin absolu canonique auquel ce démon est lié (#3803 §02 — 1 démon = 1 espace de travail). Utilisez-le pour (a) détecter une discordance avant de poster `/session` et (b) omettre `cwd` sur `POST /session` (la route se rabat sur ce chemin). Les déploiements multi-espaces de travail exposent plusieurs démons sur différents ports, chacun avec son propre `workspaceCwd`. Additif à v=1 : les démons v1 pré-§02 omettent le champ — les clients qui ciblent des versions plus anciennes doivent faire une vérification null avant de le consommer.

### Routes d'état d'exécution en lecture seule

Ces routes fournissent des instantanés de l'environnement d'exécution côté démon. Ce sont des routes v1 additives, elles ne mutent pas l'état et ne changent pas la version du protocole serve. Les routes d'état de l'espace de travail ne démarrent **pas** intentionnellement le processus enfant ACP simplement parce qu'un client interroge une route GET : si le démon est inactif, elles renvoient `initialized: false` avec un instantané vide. Les routes d'état de session nécessitent une session active et utilisent la forme standard `404 SessionNotFoundError` pour les identifiants inconnus.

Étiquettes de capacité :

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_status` → `GET /session/:id/status`

Cellule d'état commune :

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

`errorKind` est une énumération fermée partagée par `/workspace/preflight`, `/workspace/env`, et (éventuellement) les garde-fous MCP afin que les clients SDK puissent rendre la remédiation par catégorie au lieu d'analyser des messages libres. La PR 13 (#4175) a introduit les sept littéraux listés ci-dessus ; la PR 14 peuplera `blocked_egress` une fois que la sonde de sortie sera déployée.

Les charges utiles de statut n'exposent jamais les valeurs d'environnement MCP, les en-têtes, les détails OAuth/compte de service, les clés API des fournisseurs, les `baseUrl` / `envKey` des fournisseurs, le corps des compétences, les chemins système des compétences, les définitions de hooks, ou les valeurs des variables d'environnement secrètes. `/workspace/env` signale uniquement la **présence** des variables d'environnement de la liste blanche ; les URLs de proxy sont dépouillées des identifiants et réduites à `host:port` avant d'être transmises.

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

`discoveryState` est l'une des valeurs `not_started`, `in_progress` ou `completed`. `transport` est l'une des valeurs `stdio`, `sse`, `http`, `websocket`, `sdk` ou `unknown`. `errors` est omis lorsque la découverte réussit.

**Garde-fous client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Les démons post-PR-14 étendent la charge utile avec quatre champs additifs et une cellule au niveau de l'espace de travail :

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

`budgetMode` est l'une des valeurs `enforce`, `warn` ou `off`. `clientBudget` est absent lorsqu'aucun budget n'a été défini. `budgets[]` est **toujours un tableau** sur les démons post-PR-14 (éventuellement vide lorsque `budgetMode === 'off'`) ; les démons pré-PR-14 omettent complètement le champ. v1 émet une cellule avec `scope: 'session'` (application par session — voir la section des capacités ci-dessus pour savoir pourquoi). Les consommateurs DOIVENT tolérer des entrées supplémentaires dans `budgets[]` avec des valeurs `scope` non reconnues — la vague 5 PR 23 ajoutera `scope: 'workspace'` (ou `'pool'`) aux côtés de la cellule par session sans incrémentation de schéma.

`disabledReason` sur les cellules par serveur distingue le désactivé par l'opérateur (`'config'` — liste de configuration `disabledMcpServers`) du refusé par budget (`'budget'` — découvert mais jamais connecté en raison du mode `enforce`). Les refus sont déterministes selon l'ordre de déclaration `Object.entries(mcpServers)`. Le `status: 'error', errorKind: 'budget_exhausted'` par serveur occulte le `mcpStatus: 'disconnected'` brut (qui est vrai mais pas la sévérité pour l'opérateur).

L'application du budget dans la PR 14 v1 est **par session, pas par espace de travail**. Bien que les démons Mode B soient `1 démon = 1 espace de travail × N sessions` post-#4113 au niveau du processus, le `McpClientManager` est construit à l'intérieur du `Config` de chaque session ACP via `acpAgent.newSessionConfig`, donc N sessions appliquent chacune leur propre copie de la limite. L'instantané représente la vue de la session d'amorçage. La vague 5 PR 23 introduit un pool MCP partagé à l'échelle de l'espace de travail qui fait passer cela à une véritable application par espace de travail.

**Détection de la pression budgétaire.** Deux surfaces, toutes deux peuplées post-PR-14b :

- **Événements push** (annoncés via `mcp_guardrail_events`) : abonnez-vous à `GET /session/:id/events` et filtrez les trames `mcp_budget_warning` / `mcp_child_refused_batch` via `KnownDaemonEvent`. La machine d'état se déclenche une fois par franchissement à la hausse de 75 % (réarmement en dessous de 37,5 %) ; les refus sont regroupés une fois par passe de découverte sous le mode `enforce`.
- **Interrogation d'instantané** (annoncée via `mcp_guardrails`) : `GET /workspace/mcp` et inspectez la cellule de budget par session (`budgets[0]`) :

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (correspond au seuil d'hystérésis que l'événement push de la PR 14b utilisera).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (un ou plusieurs serveurs refusés lors de cette passe de découverte).
- `budgets[0].status === 'ok'` ⇔ en dessous du seuil de 75 % ET aucun refus.

Cadence d'interrogation recommandée : alignée sur ce qui interroge déjà `/workspace/mcp` ; l'instantané est peu coûteux et la cellule de budget n'entraîne aucun coût de découverte supplémentaire. Les clients SDK qui s'abonnent aux événements push bénéficient toujours de l'instantané pour l'état après une déconnexion prolongée (la profondeur de l'anneau de rejeu SSE est finie — `--event-ring-size`, par défaut 8000 — donc un client hors ligne plus longtemps que la couverture de l'anneau retombe sur la resynchronisation par instantané).

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

`level` est l'une des valeurs `project`, `user`, `extension` ou `bundled`. `errors` est omis lorsque la découverte réussit.

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

Les modèles sont regroupés par type d'authentification. Les diagnostics de connexion des fournisseurs se trouvent dans la cellule `providers` de `/workspace/preflight` ; le précontrôle d'environnement se trouve sur `/workspace/preflight` et `/workspace/env` (ci-dessous). `errors` est omis lorsque la construction de l'instantané réussit.

### `GET /workspace/env`

Rapporte l'environnement d'exécution du processus du démon, la plateforme, le sandbox, le proxy et la **présence** des variables d'environnement secrètes de la liste blanche. Répond toujours à partir de l'état `process.*` — le démon ne lance jamais un enfant ACP pour servir cette route, et la réponse est identique que l'ACP soit actif ou inactif. Le champ `acpChannelLive` est uniquement informatif.

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

**Politique de réduction.** Les cellules `kind: 'env_var'` n'incluent jamais de champ `value` ; les clients voient uniquement `present: boolean`. Les cellules `kind: 'proxy'` passent la valeur brute de la variable d'environnement par la réduction des identifiants (`redactProxyCredentials`) puis par l'analyse `URL` afin que le réseau ne transporte que `host:port`. `NO_PROXY` est passé textuellement par la réduction car c'est une liste d'hôtes plutôt qu'une URL. La liste blanche des variables d'environnement secrètes énumérées inclut actuellement `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` et `QWEN_SERVER_TOKEN`. Les autres variables d'environnement ne sont pas énumérées, donc les secrets définis accidentellement restent invisibles.

### `GET /workspace/preflight`

Rapporte les vérifications de préparation du démon. Les **cellules au niveau du démon** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) sont toujours peuplées à partir de `process.*` et `node:fs`. Les **cellules au niveau ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) nécessitent un enfant ACP actif — lorsque le démon est inactif, elles émettent des espaces réservés `status: 'not_started'`. La route ne lance jamais l'ACP uniquement pour peupler les cellules ; les cellules correspondantes reviennent à `not_started`.

Réponse inactive (pas d'enfant ACP) :

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
```typescript
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

- `missing_binary` — Version de Node inférieure à celle requise, variable `QWEN_CLI_ENTRY` manquante, ripgrep / git / npm absents du PATH (avertissements plutôt qu'erreurs pour les binaires optionnels).
- `missing_file` — `boundWorkspace` n'existe pas ou n'est pas un répertoire ; erreur de parsing d'une skill pointant vers un fichier manquant ou illisible.
- `parse_error` — Échec du parsing de `SKILL.md`, JSON de configuration mal formé.
- `auth_env_error` — `validateAuthMethod` a renvoyé une chaîne d'échec non nulle, ou une sous-classe de `ModelConfigError` propagée depuis la résolution du fournisseur.
- `init_timeout` — Rejet de `withTimeout` dans le bridge (un timeout réel lors de l'attente d'un aller-retour ACP). Reconnu via la classe typée `BridgeTimeoutError`. Note : une cellule `mcp_discovery` transitoire de type `warning` avec `connecting > 0` ne porte PAS ce kind — il s'agit d'un état normal de handshake en cours, distinct d'un vrai timeout.
- `protocol_error` — `extMethod` ACP rejeté car le canal s'est fermé en cours de requête, ou parce que le registre d'outils était absent de manière inattendue.
- `blocked_egress` — Réservé au PR 14 (#4175). Le PR 13 laisse la cellule `egress` en `status: 'not_started'`.

Si le bridge ne parvient pas à joindre le processus enfant ACP pendant le traitement d'une requête preflight (par exemple, fermeture du canal en cours de requête), le tableau `errors` de l'enveloppe contient une seule `ServeStatusCell` décrivant l'échec, et les cellules retombent à des placeholders ACP `not_started`. Les cellules au niveau du daemon sont tout de même renvoyées.

### Routes de fichiers du workspace

Tous les chemins de fichiers sont résolus via le workspace lié du daemon. Les réponses utilisent des chemins relatifs au workspace et ne renvoient jamais de chemins absolus du système de fichiers dans les cas de succès normaux. Les réponses de fichiers réussies incluent :

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

Les valeurs de `errorKind` incluent `path_outside_workspace`, `symlink_escape`, `path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`, `permission_denied`, `parse_error`, `hash_mismatch`, `file_already_exists`, `text_not_found`, et `ambiguous_text_match`.

#### `GET /file`

Lit un fichier texte. Paramètres de requête : `path` (obligatoire), `maxBytes`, `line`, et `limit`. Le daemon rejette les fichiers binaires et les fichiers dont la taille dépasse la limite de lecture texte. La réponse inclut `hash`, un digest SHA-256 sur les octets bruts du fichier complet, même lorsque `line`, `limit` ou `maxBytes` n'ont renvoyé qu'une partie.

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

Lit les octets bruts d'un fichier sans le décoder. Paramètres de requête : `path` (obligatoire), `offset` (défaut `0`), et `maxBytes` (défaut `65536`, max `262144`). Cette route prend en charge les fenêtres bornées sur des fichiers binaires volumineux sans avoir à charger le fichier entier. La réponse inclut `hash` uniquement si la fenêtre renvoyée couvre l'intégralité du fichier.

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

Crée ou remplace un fichier texte. C'est une route de mutation stricte : en boucle locale sans jeton configuré, elle renvoie `401 { "code": "token_required" }`. Avec `--require-auth`, le middleware global de bearer rejette les requêtes non authentifiées avant l'exécution de la route.

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

`mode` doit être `create` ou `replace`. `create` n'écrase jamais un fichier existant (`409 file_already_exists`). `replace` nécessite `expectedHash` ; les hashs manquants ou malformés renvoient `400 parse_error`, et les hashs obsolètes renvoient `409 hash_mismatch`. `expectedHash` est `sha256:` suivi de 64 caractères hexadécimaux minuscules, calculé sur les octets bruts du fichier.

`bom`, `encoding`, et `lineEnding` peuvent être fournis. Le remplacement préserve par défaut le profil d'encodage du fichier existant ; les champs explicites le remplacent. Les écritures binaires ne sont pas prises en charge.

Le daemon écrit dans un fichier temporaire aléatoire dans le répertoire cible, effectue un fsync si supporté, revérifie le hash actuel immédiatement avant `rename()`, puis renomme le fichier à sa place. Cela empêche l'observation partielle du fichier et sérialise les écritures initiées par le daemon sur le même fichier, mais il ne s'agit pas d'un "compare-and-swap" inter-processus au niveau du noyau : un éditeur externe peut encore intervenir dans la petite fenêtre entre la vérification finale du hash et le renommage.

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

Applique un remplacement textuel exact à un fichier texte existant. C'est également une route de mutation stricte et elle nécessite `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` doit être non vide et apparaître exactement une fois. Aucune correspondance renvoie `422 text_not_found` ; plusieurs correspondances renvoient `422 ambiguous_text_match`. La route préserve l'encodage, la BOM et les fins de ligne, et revérifie `expectedHash` immédiatement avant le renommage atomique.

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

`state` reflète les mêmes formes ACP de model/mode/config-option utilisées par `POST /session`, `POST /session/:id/load`, et `POST /session/:id/resume`.

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

`availableCommands` est le même snapshot de commandes utilisé par la notification SSE `available_commands_update`. `availableSkills` liste uniquement les noms des skills ; les clients ne doivent pas s'attendre à recevoir les corps ou chemins des skills via cette route.

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

Cette route est un snapshot en lecture seule hors bande. Elle n'est intentionnellement pas une invite et peut être interrogée pendant que la session diffuse. La réponse contient uniquement les métadonnées autorisées des registres de tâches agent, shell et monitor ; les contrôleurs, timers, offsets, messages en attente et objets bruts du registre ne sont jamais exposés.

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

`status` est l'une des valeurs suivantes : `NOT_STARTED`, `IN_PROGRESS`, `READY`, ou `FAILED`. Un champ `error` optionnel est présent sur les serveurs en échec lorsqu'il est disponible. Un LSP désactivé (y compris le mode bare) renvoie HTTP 200 avec `enabled: false`, des compteurs à zéro et `servers: []`. Un LSP activé mais sans serveur configuré renvoie `enabled: true`, `configuredServers: 0` et `servers: []`. Si l'initialisation échoue avant que le client n'existe, la réponse peut inclure `initializationError` ; si un client actif ne peut pas fournir de snapshot, la réponse inclut `statusUnavailable: true`.

Cette route expose uniquement les champs stables destinés au client. Elle omet intentionnellement les informations de débogage internes telles que les PID, arguments de lancement, stderr, URIs racines et chemins de dossiers de workspace.

### `POST /session`

Lancer un nouvel agent ou s'attacher à un agent existant (sous `sessionScope: 'single'`, le comportement par défaut).

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionScope": "thread"
}
```

| Champ             | Obligatoire | Remarques                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd`             | non         | Chemin absolu correspondant au workspace lié du daemon. S'il est omis, la route utilise `boundWorkspace` (lire via `/capabilities.workspaceCwd`). Un `cwd` non vide et non correspondant renvoie `400 workspace_mismatch` (#3803 §02 — 1 daemon = 1 workspace). Les chemins de workspace sont canonicalisés via `realpathSync.native` (avec un fallback de résolution seule pour les chemins inexistants) afin que les systèmes de fichiers insensibles à la casse ne rejettent pas les sessions selon l'orthographe.                                                                                                                 |
| `modelServiceId`  | non         | Sélectionne le _service de modèle_ configuré par lequel l'agent va router (le fournisseur back-end — Alibaba ModelStudio, OpenRouter, etc.). S'il est omis, l'agent utilise son service par défaut. Si le workspace a déjà une session, cela appelle `setSessionModel` sur la session existante et diffuse `model_switched`. Distinct de `modelId` sur `POST /session/:id/model`, qui sélectionne le modèle **au sein** d'un service déjà lié. Le tableau `modelServices` sur `/capabilities` est réservé à la publicité des services configurés ; dans la phase 1, il est toujours `[]` (le service par défaut de l'agent est utilisé et non énuméré via HTTP). |
| `sessionScope`    | non         | Surcharge par requête pour le partage de session. `'single'` (le défaut à l'échelle du daemon) fait qu'un deuxième `POST /session` sur le même workspace réutilise la session existante (`attached: true`) ; `'thread'` force une nouvelle session distincte à chaque appel. Omettre pour hériter du défaut du daemon. Les valeurs hors de l'énumération renvoient `400 { code: 'invalid_session_scope' }`. Les anciens daemons (avant #4175 PR 5) ignorent silencieusement le champ — vérifier `caps.features.session_scope_override` avant d'envoyer. Le défaut du daemon est codé en dur à `'single'` en production aujourd'hui ; #4175 pourrait ajouter un flag CLI `--sessionScope` dans un suivi. |

Réponse :

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false
}
```

`attached: true` signifie qu'une session pour ce workspace existait déjà et que vous la partagez maintenant.

Les appels simultanés à `POST /session` pour le même workspace sont **fusionnés** en un seul lancement — les deux appelants reçoivent le même `sessionId`, un seul rapporte `attached: false`. Si le lancement sous-jacent échoue (timeout d'initialisation, sortie d'agent malformée, OOM), **tous les appelants fusionnés reçoivent la même erreur** — l'emplacement en vol est libéré afin qu'un appel ultérieur puisse retenter à partir de zéro.

> [!warning]
> **Le rejet de `modelServiceId` sur une session fraîche est silencieux dans la réponse HTTP.** Un mauvais `modelServiceId` (faute de frappe, service non configuré) ne provoque PAS une erreur 500 de la création — la session reste opérationnelle sur le modèle par défaut de l'agent, de sorte que l'appelant reçoit toujours un `sessionId` avec lequel il peut réessayer le changement de modèle (via `POST /session/:id/model`). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session, émis entre le handshake de lancement et votre premier abonnement. **Les abonnés qui doivent observer cet événement doivent passer `Last-Event-ID: 0` sur leur premier `GET /session/:id/events`** pour rejouer à partir de l'événement le plus ancien disponible dans le ring (couvre le `model_switch_failed` du lancement même si l'abonnement arrive quelques ms après la réponse de création).

### `POST /session/:id/load`

Restaure une session ACP persistée par son identifiant et rejoue son historique via SSE. L'identifiant dans le chemin fait autorité ; tout champ `sessionId` dans le corps est ignoré. Vérifier `caps.features.session_load` avant d'envoyer — les anciens daemons renvoient `404` pour cette route.

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Champ | Obligatoire | Remarques                                                                                                                                                                                                                                                 |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | non         | Mêmes règles de canonicalisation et de `workspace_mismatch` que `POST /session`. Omettre pour hériter de `/capabilities.workspaceCwd`. `mcpServers` n'est intentionnellement PAS accepté ici — le MCP du daemon est piloté par la configuration (comme `POST /session`). |

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

`state` reflète `LoadSessionResponse` d'ACP — `models` est un `SessionModelState`, `modes` un `SessionModeState`, `configOptions` un tableau de `SessionConfigOption`. Les champs manquants sont décidés par l'agent. Les attachements tardifs (les chemins `attached: true` ci-dessous) reçoivent le MÊME snapshot `state` que l'appelant original du load a vu — le daemon le met en cache sur l'entrée ; les mutations à l'exécution (par exemple `model_switched`) sont délivrées sur le flux SSE, et non dans les réponses d'attachement suivantes.

`attached: true` signifie que la session était déjà active (soit d'un `session/load`/`session/resume` antérieur, soit parce qu'un appelant concurrent fusionné a été plus rapide).

**Rejeu d'historique via SSE.** Pendant que `loadSession` est en vol côté agent, l'agent émet des notifications `session_update` pour chaque tour persistant. Le daemon les met en tampon sur le bus d'événements de la session avant que la réponse de route ne soit renvoyée, de sorte que les abonnés qui appellent immédiatement `GET /session/:id/events` avec `Last-Event-ID: 0` voient le rejeu complet. **Le ring de rejeu est borné** (8000 trames par défaut par session). Les historiques longs avec de nombreux tours d'appels d'outils / flux de pensée peuvent dépasser cette limite — les trames les plus anciennes sont supprimées silencieusement. Les clients qui ont besoin de tout l'historique doivent s'abonner immédiatement après le retour du `load` ; alternativement, ils peuvent persister les identifiants d'événements SSE et utiliser `Last-Event-ID` pour reprendre à partir d'une limite de tour ultérieure.

**Erreurs :**

- `404` — l'identifiant de session persistée n'existe pas (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (même forme que `POST /session`).
- `503` — `session_limit_exceeded` (comptabilisé dans `--max-sessions` ; les restaurations en vol sont également comptées).
- `409` — `restore_in_progress` (un `session/resume` pour le même identifiant est déjà en vol). `Retry-After: 5`. Les courses de même action (deux `session/load` concurrents pour le même identifiant) fusionnent — exactement un renvoie `attached: false`, les autres renvoient `attached: true` avec le même `state`.

### `POST /session/:id/resume`

Restaure une session ACP persistée par son identifiant SANS rejouer l'historique via SSE. Le contexte du modèle est restauré en interne côté agent (via `geminiClient.initialize` lisant `config.getResumedSessionData`) ; le flux SSE reste propre pour les clients qui ont déjà leur historique affiché. Vérifier `caps.features.session_resume` avant d'envoyer ; `unstable_session_resume` reste un alias de compatibilité déprécié pour les clients plus anciens.

Même forme de requête que `/load`. Même forme de réponse — `state` reflète `ResumeSessionResponse` d'ACP. Même enveloppe d'erreur, y compris `409 restore_in_progress` (qui se déclenche lorsqu'un `session/load` est en vol ; `session/resume` en concurrence derrière un autre `session/resume` fusionne).

Utilisez `/load` lorsque le client n'a pas d'historique affiché (reconnexion à froid, sélecteur → ouvrir). Utilisez `/resume` lorsque le client a déjà les tours à l'écran et n'a besoin que du handle côté daemon.

> [!note]
> **Pourquoi `unstable_session_resume` est-il encore annoncé ?** La route HTTP du daemon et la capacité `session_resume` sont stables pour v1, mais le bridge appelle toujours `connection.unstable_resumeSession` d'ACP. L'ancien tag reste uniquement pour que les SDKs publiés avant `session_resume` continuent de fonctionner.

### `GET /workspace/:id/sessions`

Liste toutes les sessions actives dont le workspace canonique correspond à `:id` (chemin absolu encodé en URL).

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
```

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
      "hasActivePrompt": false
    }
  ]
}
```

Un tableau vide (pas de 404) lorsqu'aucune session n'existe — une UI de sélecteur de session ne doit pas générer d'erreur simplement parce que le workspace est inactif.

### `POST /session/:id/prompt`

Transmettre une invite à l'agent. Les appelants multi-invites sont mis en file d'attente FIFO par session (ACP garantit une invite active par session).

Requête :

```json
{
  "prompt": [{ "type": "text", "text": "Que fait src/main.ts ?" }]
}
```

Validation : `prompt` doit être un tableau non vide d'objets. Les autres échecs renvoient `400` avant d'atteindre le bridge.

Réponse :

```json
{ "stopReason": "end_turn" }
```

Autres raisons d'arrêt : `cancelled`, `max_tokens`, `error`, `length` (selon la spécification ACP).

Si le client HTTP se déconnecte en cours d'invite, le daemon envoie une notification ACP `cancel` à l'agent, qui termine l'invite avec `stopReason: "cancelled"`.
> **Limitation de l'étape 1 — pas de délai d'attente côté serveur pour les prompts.** Le bridge
> lance uniquement le `prompt()` de l'agent contre `transportClosedReject`
> (plantage de l'agent enfant) et le signal d'annulation de déconnexion HTTP
> de l'appelant. Un agent bloqué mais vivant (par exemple, un appel de modèle qui
> se bloque) bloque le FIFO par session jusqu'à ce que le client HTTP expire
> de son côté et se déconnecte. Les prompts de longue durée sont légitimes
> (recherche approfondie, analyse de large base de code), donc aucun délai par défaut
> n'est intentionnellement défini ; l'étape 2 exposera un
> `promptTimeoutMs` configurable en option. D'ici là, les appelants doivent définir
> leur propre délai d'attente côté client et se déconnecter (ou appeler
> `POST /session/:id/cancel`) à l'expiration.

### `POST /session/:id/cancel`

Annule le prompt **actuellement actif** sur la session. Côté ACP, il s'agit d'une notification, pas d'une requête — l'agent accuse réception en résolvant le `prompt()` actif avec `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrat multi-prompts :** cancel n'affecte que le prompt actif. Tous les prompts que le même client a précédemment POSTés et qui sont encore en file d'attente derrière le prompt actif continueront à s'exécuter. La mise en file d'attente multi-prompts est un comportement introduit par le daemon (pas dans la spécification ACP) ; le contrat pour les prompts en file d'attente est "ils continuent à s'exécuter à moins que vous n'en annuliez chacun, ou que vous ne tuiez la session via la sortie du canal".

### `DELETE /session/:id`

Ferme explicitement une session active. Force la fermeture même lorsque d'autres clients sont attachés — annule tout prompt actif, résout les autorisations en attente comme annulées, publie l'événement `session_closed`, ferme l'EventBus et supprime la session des maps du daemon. Les sessions persistées sur disque NE sont PAS supprimées — elles peuvent être rechargées via `POST /session/:id/load`. Pré-vérification `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent : retourne `404` pour les sessions inconnues (même forme `SessionNotFoundError` que les autres routes).

> **Événement `session_closed`.** Les abonnés SSE reçoivent un événement terminal `session_closed` avec `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` avant la fin du flux. Les réducteurs SDK traitent cela de manière identique à `session_died` (définit `alive: false`, efface `pendingPermissions`).

### `PATCH /session/:id/metadata`

Met à jour les métadonnées de session modifiables. Prend actuellement en charge uniquement `displayName`. Pré-vérification `caps.features.session_metadata`.

Requête :

```json
{ "displayName": "My Investigation Session" }
```

| Champ         | Requis | Remarques                                                                         |
| ------------- | ------ | --------------------------------------------------------------------------------- |
| `displayName` | non    | Chaîne, 256 caractères max. Une chaîne vide efface le nom. Omettre pour laisser tel quel. |

Réponse :

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publie un événement `session_metadata_updated` sur le flux SSE de la session avec `{ sessionId, displayName }`.

### `POST /session/:id/heartbeat`

Actualise la comptabilité de dernière visite du daemon pour cette session. Les adaptateurs longue durée (TUI/IDE/web) envoient ce ping à intervalles réguliers afin que la future politique de révocation (Wave 5 PR 24) puisse distinguer les clients morts des clients silencieux.

En-têtes :

| En-tête             | Requis | Remarques                                                                                                                                                                                                                                   |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id`  | non    | Renvoie l'id émis par le daemon depuis `POST /session`. Les clients identifiés mettent également à jour leur horodatage par client ; les heartbeats anonymes ne mettent à jour que le watermark par session. Doit respecter la même forme `[A-Za-z0-9._:-]{1,128}` qu'ailleurs. |

Le corps de la requête est vide (`{}` convient — aucun champ n'est lu pour l'instant).

Réponse :

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` n'est renvoyé que lorsqu'un `X-Qwen-Client-Id` de confiance a été fourni. `lastSeenAt` est l'epoch `Date.now()` (ms) côté daemon que le bridge a stocké.

Erreurs :

- `400` — `{ code: 'invalid_client_id' }` lorsque l'en-tête est mal formé (règle de forme de l'en-tête) ou lorsqu'il contient un `clientId` qui n'est pas enregistré pour cette session (le bridge lève `InvalidClientIdError` avant d'incrémenter tout horodatage).
- `404` — session inconnue.

Passerelle de capacité : pré-vérification `caps.features.client_heartbeat`. Les daemons plus anciens retournent `404` pour ce chemin.

### `POST /session/:id/model`

Change le modèle actif **dans** le service de modèle actuellement lié à la session. Sérialisé via la file d'attente de changement de modèle par session.

(Pour changer le _service_ lui-même — Alibaba ModelStudio vs OpenRouter etc — passez `modelServiceId` sur `POST /session` pour une session fraîche. L'étape 1 n'a pas de route de changement de service en direct.)

Requête :

```json
{ "modelId": "qwen-staging" }
```

Réponse :

```json
{ "modelId": "qwen-staging" }
```

En cas de succès, publie `model_switched` sur le flux SSE. En cas d'échec, publie `model_switch_failed` (afin que les abonnés passifs voient l'échec, pas seulement l'appelant). Se bat contre la sortie du canal de l'agent afin qu'un enfant bloqué ne puisse pas bloquer le gestionnaire HTTP.

### `POST /session/:id/recap`

Tag de capacité : `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Génère un résumé d'une phrase "où en étais-je" de la session. Encapsule `generateSessionRecap` du core (`packages/core/src/services/sessionRecap.ts`), qui exécute une requête secondaire contre le modèle rapide avec les outils désactivés, `maxOutputTokens: 300`, et un format de sortie strict `<recap>...</recap>`. La requête secondaire lit l'historique de chat GeminiClient existant de la session et ne l'**ajoute pas**.

Le corps de la requête est ignoré (envoyez `{}` ou vide). Porte de mutation non stricte — la posture reflète `/session/:id/prompt` (l'appel coûte des tokens mais ne mute aucun état). Aucun événement SSE n'est publié.

Réponse (200) :

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` est `null` (un 200 normal, pas une erreur) lorsque :

- la session a moins de deux tours de dialogue,
- la requête secondaire n'a retourné aucune charge utile `<recap>...</recap>` extractible,
- ou toute erreur de modèle sous-jacente s'est produite (l'assistant core est au mieux et ne lève jamais d'exception).

Erreurs :

- `400 {code: 'invalid_client_id'}` — en-tête `X-Qwen-Client-Id` mal formé.
- `404` — session inconnue.

Annulation : **aucune dans v1**. La route n'écoute pas la déconnexion du client HTTP, aucun `AbortSignal` n'est branché dans le bridge, et l'enfant ACP exécute la requête secondaire jusqu'à son terme, que l'appelant soit déconnecté ou non. Les seuls plafonds sont le délai d'attente de 60 s du bridge (`SESSION_RECAP_TIMEOUT_MS`) et la course à la fermeture du transport contre la mort du canal ACP. Cela est acceptable car le recap est court (tentative unique, `maxOutputTokens: 300`, ~1 à 5 s typique) ; une ext-method d'annulation basée sur l'ID de requête pourrait brancher une annulation complète de bout en bout dans une future version si le coût en bande passante le justifie un jour.

### Mutation : approbation, outils, init, redémarrage MCP

Problème [#4175](https://github.com/QwenLM/qwen-code/issues/4175) Wave 4 PR 17 ajoute quatre routes de contrôle de mutation qui permettent aux clients distants de modifier la posture d'exécution sans toucher au CLI de l'hôte du daemon. Les quatre :

- Sont contrôlées par la porte de mutation **stricte** du PR 15. Un daemon configuré sans jeton bearer les rejette avec `401 {code: 'token_required'}`. Configurez `--token` (ou `QWEN_SERVER_TOKEN`) avant de les activer.
- Acceptent et estampillent l'en-tête `X-Qwen-Client-Id` (chaîne d'audit PR 7). Lorsque l'en-tête porte un ID de confiance, le daemon émet `originatorClientId` sur l'événement SSE correspondant afin que les UIs multi-clients puissent supprimer les échos de leurs propres mutations.
- Effectuent une pré-vérification de la capacité de chaque tag avant d'exposer la fonctionnalité. Les daemons plus anciens retournent `404` pour la route.

Trois des quatre routes (`tools/:name/enable`, `init`, `mcp/:server/restart`) émettent des événements **au niveau du workspace** : chaque bus SSE de session active reçoit l'événement, quelle que soit la session attachée lorsque la mutation a été déclenchée. `approval-mode` émet un événement **au niveau de la session** car le changement est local au `Config` d'une seule session.

#### `POST /session/:id/approval-mode`

Tag de capacité : `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Change le mode d'approbation d'une session active. Le nouveau mode atterrit immédiatement dans le `Config` par session de l'enfant ACP. Les paramètres NE sont PAS écrits sur le disque par défaut — passez `persist: true` pour également écrire `tools.approvalMode` dans les paramètres du workspace.

Requête :

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` doit être l'un de `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (miroir de l'énumération `ApprovalMode` du core ; le SDK exporte `DAEMON_APPROVAL_MODES` pour la validation à l'exécution). `persist` par défaut à `false`.

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
- `400 {code: 'invalid_persist_flag'}` — `persist` non booléen.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — le mode demandé nécessite un dossier de confiance (les modes privilégiés dans les workspaces non fiables sont rejetés par `Config.setApprovalMode` du core).
- `404` — session inconnue.

Événement SSE (au niveau de la session) : `approval_mode_changed` avec `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Tag de capacité : `workspace_tool_toggle`. Pure E/S fichier — pas d'aller-retour ACP.

Bascule un nom d'outil dans la liste des paramètres `tools.disabled` du workspace. Les outils qui y sont listés ne sont **pas enregistrés** du tout (distinct de `permissions.deny`, qui maintient l'outil enregistré et rejette l'invocation). Les outils intégrés et les outils découverts via MCP transitent par `ToolRegistry.registerTool`, qui consulte l'ensemble désactivé.

> ⚠️ **Les noms doivent correspondre exactement à l'identifiant exposé du registre.** Aucune résolution d'alias n'a lieu — la route stocke la chaîne du paramètre de chemin dans `tools.disabled`, et le prochain enfant ACP la compare à `tool.name` au moment de l'enregistrement. Les outils intégrés utilisent leur nom de registre canonique (forme verbale en snake_case) : `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — PAS les libellés d'affichage (`Shell`, `Read`, `Write`) que le CLI affiche. Les outils découverts via MCP utilisent la forme qualifiée `mcp__<server>__<name>` (qui est également la forme que les événements `tool_toggled` diffusent et que `GET /workspace/mcp` liste). Désactiver `Bash` n'EMPÊCHERA PAS `run_shell_command` de s'enregistrer lors de la prochaine session.

Les enfants ACP en direct conservent les outils déjà enregistrés — le basculement prend effet lors du **prochain** spawn d'enfant ACP. Combinez avec `POST /workspace/mcp/:server/restart` (pour les outils provenant de MCP) ou la création d'une nouvelle session pour rendre le changement effectif dans le daemon actuel.

Les noms d'outils inconnus sont acceptés : pré-désactiver un outil MCP pas encore installé est un cas d'utilisation légitime.

Requête :

```json
{ "enabled": false }
```

Réponse (200) :

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Erreurs :

- `400 {code: 'invalid_tool_name'}` — paramètre de chemin vide, ou paramètre de chemin dépasse la limite de 256 caractères.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` manquant ou non booléen.

Événement SSE (au niveau du workspace) : `tool_toggled` avec `{toolName, enabled, originatorClientId?}`.

#### `POST /workspace/init`

Tag de capacité : `workspace_init`. Pure E/S fichier — pas d'aller-retour ACP, **aucune invocation LLM**.

Échafaude un `QWEN.md` vide (ou ce que `getCurrentGeminiMdFilename()` retourne sous `--memory-file-name`) à la racine du workspace lié du daemon. Mécanique uniquement — pour un remplissage de contenu par IA, suivez avec `POST /session/:id/prompt`.

Par défaut, refuse d'écraser lorsque le fichier cible existe avec un contenu non vide. Les fichiers contenant uniquement des espaces sont traités comme absents (correspond à la commande slash locale `/init`).

Requête :

```json
{ "force": false }
```

Réponse (200) :

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` est `'created'` pour les créations fraîches, `'noop'` lorsqu'un fichier existant contenant uniquement des espaces a été laissé intact (aucune écriture effectuée), et `'overwrote'` lorsque `force: true` a remplacé un contenu non vide. L'événement SSE `workspace_initialized` reflète l'action de la réponse — les observateurs peuvent filtrer sur `action !== 'noop'` pour réagir uniquement aux modifications réelles sur le disque.

Erreurs :

- `400 {code: 'invalid_force_flag'}` — `force` non booléen.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — le fichier existe avec un contenu non vide et `force` est omis/faux. Le corps contient le chemin absolu et la taille (octets) afin que les clients SDK puissent afficher une invite "écraser N octets ?" sans refaire un stat.

Événement SSE (au niveau du workspace) : `workspace_initialized` avec `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/:server/restart`

Tag de capacité : `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Redémarre un serveur MCP configuré via `McpClientManager.discoverMcpToolsForServer` de l'enfant ACP (déconnexion + reconnexion + redécouverte). Pré-vérifie l'instantané du budget actif de la comptabilité v1 du PR 14, de sorte qu'un redémarrage sur un workspace saturé en budget retourne un refus doux plutôt que de déclencher une cascade `BudgetExhaustedError`.

Le corps de la requête est vide (`{}`). Le paramètre de chemin est le nom du serveur encodé dans l'URL tel qu'il apparaît dans la configuration `mcpServers`.

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

Raisons de saut doux (toutes retournent 200) :

| `reason`                | Signification                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'`           | Une autre découverte/redémarrage pour ce serveur est déjà en cours. La route retourne immédiatement plutôt que d'attendre la promesse d'origine. L'appelant doit réessayer après un court délai. |
| `'disabled'`            | Le serveur est configuré mais listé dans `excludedMcpServers`. Réactivez-le avant de redémarrer.                                                                                               |
| `'budget_would_exceed'` | Le daemon est en `--mcp-budget-mode=enforce`, le serveur cible n'est pas actuellement dans `reservedSlots`, et le total actif a atteint `clientBudget`. L'appelant doit d'abord libérer un slot. |

Erreurs (non-2xx) :

- `400 {code: 'invalid_server_name'}` — paramètre de chemin vide.
- `404` — nom de serveur non présent dans la configuration `mcpServers`, ou aucun canal ACP actif n'existe (le redémarrage nécessite intrinsèquement une instance `McpClientManager` active).
- `500` — erreur interne (par exemple, `ToolRegistry` non initialisé).

Événements SSE (au niveau du workspace) : `mcp_server_restarted` avec `{serverName, durationMs, originatorClientId?}` en cas de succès ; `mcp_server_restart_refused` avec `{serverName, reason, originatorClientId?}` en cas de saut doux.

### `GET /session/:id/events` (SSE)

S'abonne au flux d'événements de la session.

En-têtes :

```
Accept: text/event-stream
Last-Event-ID: 42        ← optionnel, rejoue à partir de l'ID 42
```

Paramètres de requête :

| Param       | Requis | Remarques                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | non    | Limite **d'arriéré actif** par abonné. Plage `[16, 2048]`, par défaut 256. Les trames de relecture poussées de force au moment de l'abonnement sont exemptées de la limite ; ce qui la consomme réellement, ce sont les événements actifs qui arrivent pendant que l'abonné vide encore une grande relecture `Last-Event-ID: 0`. Augmentez pour les reconnexions à froid afin que la queue active ne déclenche pas l'avertissement/expulsion du client lent avant que le consommateur ne rattrape son retard. Les valeurs hors plage / non décimales / présentes mais vides retournent `400 invalid_max_queued` avant l'ouverture de la poignée de main SSE. Pré-vérification `caps.features.slow_client_warning` — les daemons anciens ignorent silencieusement le paramètre. |

Format de trame. La ligne `data:` est l'**enveloppe complète de l'événement**, convertie en JSON sur une seule ligne — `{id?, v, type, data, originatorClientId?}`. La charge utile spécifique à ACP (`sessionUpdate`, arguments `requestPermission`, etc.) se trouve sous le champ `data` de l'enveloppe ; le `type` de l'enveloppe lui-même correspond à la ligne SSE `event:`.

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

Les lignes `id:` / `event:` au niveau SSE dupliquent `envelope.id` / `envelope.type` pour la compatibilité EventSource. Les consommateurs `fetch` bruts (le `parseSseStream` du SDK) lisent tout depuis l'enveloppe JSON et ignorent les lignes préambule SSE.

| Type d'événement            | Déclencheur                                                                                                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update`            | Toute notification `sessionUpdate` de l'ACP (morceaux LLM, appels d'outils, utilisation)                                                                                                                                                                                                                             |
| `permission_request`        | L'agent a demandé une approbation d'outil                                                                                                                                                                                                                                                                             |
| `permission_resolved`       | Un client a voté sur une permission via `POST /permission/:requestId`                                                                                                                                                                                                                                                 |
| `permission_partial_vote`   | (consensus uniquement) Un vote a été enregistré mais le quorum n'est pas encore atteint. Porte `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pré-vérification `caps.features.permission_mediation`.                                                                                    |
| `permission_forbidden`      | Un vote a été rejeté par la politique active (`designated` non correspondant, `local-only` non boucle locale, ou `consensus` votant non dans l'instantané). Porte `{requestId, sessionId, clientId?, reason}`. Pré-vérification `caps.features.permission_mediation`.                                                  |
| `model_switched`            | `POST /session/:id/model` a réussi                                                                                                                                                                                                                                                                                    |
| `model_switch_failed`       | `POST /session/:id/model` a été rejeté                                                                                                                                                                                                                                                                                |
| `session_died`              | L'agent enfant a planté de manière inattendue. **Terminal : le flux SSE se ferme après cette trame ; la session est supprimée de `byId`.** Les abonnés doivent se reconnecter via `POST /session` pour en créer une nouvelle.                                                                                          |
| `slow_client_warning`       | Local à l'abonné : file d'attente ≥ 75 % pleine. **Non terminal** — le flux continue ; l'avertissement est un message d'alerte avant expulsion. Porte `{queueSize, maxQueued, lastEventId}`. Déclenché UNE FOIS par épisode de débordement ; se réarme après que la file descend en dessous de 37,5 %. Pas d'`id` (synthétique). Pré-vérification `caps.features.slow_client_warning`. |
| `client_evicted`            | Local à l'abonné : débordement de file d'attente. **Terminal : le flux SSE se ferme après cette trame** (pas d'`id` — synthétique). Les autres abonnés sur la même session continuent.                                                                                                                                 |
| `stream_error`              | Erreur côté daemon lors de la diffusion. **Terminal : le flux SSE se ferme après cette trame** (pas d'`id` — synthétique).                                                                                                                                                                                            |
Sémantique de reconnexion :

- Envoyez `Last-Event-ID: <n>` pour rejouer les événements avec `id > n` depuis le ring par session (profondeur par défaut **8000**, réglable via `qwen serve --event-ring-size <n>`)
- **Détection d'écart (côté client) :** si `<n>` est antérieur au plus ancien événement encore dans le ring (par exemple, vous vous reconnectez avec `Last-Event-ID: 50` mais le ring contient maintenant 200–1199), le démon rejoue à partir du plus ancien événement disponible sans lever d'erreur. Comparez le `id` du premier événement rejoué à `n + 1` ; toute différence correspond à la taille de la fenêtre perdue. L'étape 2 injectera une trame synthétique explicite `stream_gap` côté démon ; à l'étape 1, la détection est de la responsabilité du client.
- Les ID sont monotones par session, commençant à 1
- Les trames synthétiques (`client_evicted`, `slow_client_warning`, `stream_error`) omettent intentionnellement `id` afin de ne pas consommer un créneau de séquence pour les autres abonnés

Contre-pression :

- La file d'attente par abonné est par défaut `maxQueued: 256` éléments en direct (les trames de rejeu pendant la reconnexion contournent la limite). Remplacez via `?maxQueued=N` (intervalle `[16, 2048]`) sur la requête SSE.
- Lorsque la file d'un abonné dépasse 75% de remplissage, le bus pousse de force une trame synthétique `slow_client_warning` vers cet abonné (une fois par épisode de débordement ; réarmée après vidage en dessous de 37,5%). Le flux reste ouvert — l'avertissement est une notification pour que le client puisse vidanger plus rapidement ou se détacher et se reconnecter proprement.
- Si la file déborde réellement après l'avertissement, le bus émet la trame terminale `client_evicted` et ferme l'abonnement.

### `POST /permission/:requestId`

Voter sur une `permission_request` en attente. La **politique de médiation** active décide qui gagne :

| Politique                    | Comportement                                                                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (défaut)   | Tout votant validé gagne ; les votants suivants reçoivent `404`. Base de référence pré-F3.                                                                                                                                                                            |
| `designated`                 | Seul l'initiateur de l'invite (`originatorClientId`) décide ; les non-initateurs reçoivent `403 permission_forbidden / designated_mismatch`. Retour à first-responder pour les invites anonymes.                                                                     |
| `consensus`                  | N votants sur M doivent être d'accord (par défaut `N = floor(M/2) + 1`, remplacé via `policy.consensusQuorum`). La première option atteignant `N` gagne. Les votes non résolus reçoivent `200` + des trames SSE `permission_partial_vote`.                             |
| `local-only`                 | Seuls les votants en boucle locale décident ; les appelants distants reçoivent `403 permission_forbidden / remote_not_allowed`.                                                                                                                                      |

La politique active est configurée dans `settings.json` sous `policy.permissionStrategy` et exposée sur `/capabilities` à `body.policy.permission`. Pré-vol `caps.features.permission_mediation` (avec `modes: [...]`) pour l'ensemble pris en charge par la build.

> **F3 (#4175) : coordination des permissions multi-client.** F3 a ajouté les quatre politiques ci-dessus. Les démons pré-F3 avaient first-responder en dur ; le format filaire reste inchangé bit pour bit lorsque la politique configurée est `first-responder`. Les nouveaux événements (`permission_partial_vote`, `permission_forbidden`) sont additifs — les anciens SDK les voient comme `unrecognized_known_event` et les ignorent gracieusement.

> **Délai d'expiration des permissions (5 minutes par défaut).** Une `permission_request` reste en attente jusqu'à ce que : (a) un client vote ici, (b) `POST /session/:id/cancel` soit déclenché, (c) le client HTTP conduisant l'invite se déconnecte (l'annulation en cours d'invite résout les permissions en attente comme `cancelled`), (d) la session soit tuée, (e) le démon s'arrête, **ou (f) le délai d'expiration de permission par session se déclenche** (`DEFAULT_PERMISSION_TIMEOUT_MS`, 5 minutes). Lors du déclenchement, `requestPermission` de l'agent se résout en `{outcome: 'cancelled'}`, le registre d'audit enregistre une entrée `permission.timeout`, la stderr du démon émet un fil d'Ariane d'une ligne, et le bus SSE diffuse la trame annulée `permission_resolved` standard afin que les abonnés nettoient. Le délai est configurable via `BridgeOptions.permissionResponseTimeoutMs` ; les appelants headless exécutant des invites longues peuvent vouloir le prolonger.

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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — accepter / rejeter / proceed-once / etc, selon les choix proposés par l'agent
- `{ "outcome": "cancelled" }` — abandonner la requête (correspond à ce que `cancelSession` / `shutdown` font en interne)

Réponse :

- `200 {}` — votre vote a été accepté (résolu OU enregistré sous quorum de consensus)
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3 : la politique active a rejeté votre vote
- `404 { "error": "..." }` — le requestId est inconnu (déjà résolu, n'a jamais existé, ou session déchirée)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3 : `allowedOptionIds` de l'agent contient le sentinel réservé `'__cancelled__'` ; violation du contrat agent / démon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 forward-compat : un littéral de politique est apparu dans le schéma mais sa branche médiatrice n'est pas encore construite (actuellement inaccessible ; réservé pour les politiques futures)

Après un vote réussi, chaque client connecté voit `permission_resolved` avec le même `requestId` et le `outcome` choisi. En mode `consensus`, les votes intermédiaires diffusent en plus `permission_partial_vote` jusqu'au quorum.

### Routes du flux d'authentification par appareil (issue #4175 PR 21)

Le démon agit comme intermédiaire pour un OAuth 2.0 Device Authorization Grant (RFC 8628) afin qu'un client SDK distant puisse déclencher une connexion dont les jetons atterrissent sur le système de fichiers du **démon** — pas sur le client. Le démon interroge lui-même l'IdP ; le seul travail du client est d'afficher l'URL de vérification + le code utilisateur et (optionnellement) de s'abonner aux événements SSE de complétion.

Tag de capacité : `auth_device_flow` (toujours annoncé). Fournisseurs pris en charge dans v1 : `qwen-oauth`.

> [!note]
>
> L'offre gratuite Qwen OAuth a été interrompue le 2026-04-15. Traitez `qwen-oauth` comme l'identifiant de fournisseur v1 hérité dans ce protocole ; les nouveaux clients devraient préférer un fournisseur d'authentification actuellement pris en charge lorsqu'il est disponible.

**Localité d'exécution.** Le démon ne lance jamais de navigateur — même s'il le peut. Le client décide d'appeler ou non `open(verificationUri)` localement ; sur un pod headless (le déploiement Mode B canonique) l'utilisateur ouvre l'URL sur l'appareil de son choix disposant d'un navigateur. Voir `docs/users/qwen-serve.md` pour l'UX recommandée.

**Aucune fuite de jeton dans les événements.** `auth_device_flow_started` ne contient que `{deviceFlowId, providerId, expiresAt}`. Le code utilisateur et l'URL de vérification sont renvoyés point à point dans le corps de la réponse POST 201 et via `GET /workspace/auth/device-flow/:id` ; ils ne sont jamais diffusés sur SSE.

**Singleton par fournisseur.** Un second `POST` pour le même fournisseur alors qu'un flux est en attente est une reprise idempotente — il retourne l'entrée existante avec `attached: true` plutôt que de démarrer une nouvelle requête IdP.

#### `POST /workspace/auth/device-flow`

Porte de mutation stricte : nécessite un jeton bearer même sur les valeurs par défaut de boucle locale sans jeton (`401 token_required`).

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

- `400 unsupported_provider` — fournisseur inconnu `providerId` (la réponse inclut `supportedProviders`)
- `409 too_many_active_flows` — limite du workspace (4) atteinte ; annulez-en un avec `DELETE`
- `401 token_required` — la porte stricte a refusé une requête sans jeton
- `502 upstream_error` — l'IdP a retourné une erreur inattendue

#### `GET /workspace/auth/device-flow/:id`

Lire l'état actuel. Les entrées en attente renvoient `userCode/verificationUri/expiresAt/intervalMs` ; les entrées terminales (grâce de 5 min) les suppriment et exposent `status` + optionnellement `errorKind/hint`.

Retourne `404 device_flow_not_found` pour les ID inconnus et les entrées expulsées après la grâce.

#### `DELETE /workspace/auth/device-flow/:id`

Annulation idempotente :

- entrée en attente → `204` + émet `auth_device_flow_cancelled`
- entrée terminale → `204` sans opération (pas de réémission d'événement)
- ID inconnu → `404`

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

#### Événements SSE du flux d'authentification par appareil

Cinq événements typés (portée workspace, diffusés vers chaque bus de session actif) :

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST réussi ; le SDK doit s'abonner (pas de userCode ici, récupérer via GET si nécessaire)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — le démon a respecté le `slow_down` en amont ; les clients interrogeant GET doivent augmenter leur intervalle pour correspondre
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — identifiants persistés ; `accountAlias` est une étiquette non-PII (jamais email/téléphone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal ; `errorKind` est l'un de `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` est interne au démon : l'échange IdP a réussi mais le démon n'a pas pu stocker durablement les identifiants (EACCES / EROFS / ENOSPC). L'utilisateur doit réessayer une fois la condition sous-jacente du disque corrigée.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE réussi contre une entrée en attente

> **Non compatible MCP.** La spécification d'autorisation MCP (2025-06-18) impose OAuth 2.1 + PKCE auth-code avec un callback de redirection, ce qui ne fonctionne pas pour les démons en pod headless. La surface de flux d'appareil du Mode B est privée au démon — les clients ciblant des serveurs conformes MCP doivent utiliser un autre chemin d'authentification.

## Format filaire du streaming

Les événements sont émis sous forme de trames EventSource standard. Le démon écrit une ligne `data:` par trame (le JSON n'a pas de nouvelles lignes après `JSON.stringify`) ; l'analyseur SDK à `packages/sdk-typescript/src/daemon/sse.ts` gère à la fois cela et la forme multi-`data:` autorisée par la spécification côté réception.

## Trames d'erreur pendant le streaming

Si l'itérateur du pont lève une exception lors du service d'un abonné SSE, le démon émet une trame terminale `stream_error` (sans `id`). La ligne `data:` est l'enveloppe complète (même forme que toute autre trame SSE dans ce document) ; le message d'erreur réel se trouve sous `envelope.data.error` :

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

La connexion se ferme alors.

## Variables d'environnement

| Var                 | Objectif                                                                   |
| ------------------- | -------------------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Jeton bearer. Supprime les espaces de début/fin au démarrage.             |

## Structure des sources

| Chemin                                                | Objectif                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts`                  | Commande yargs + schéma de drapeaux                                                                      |
| `packages/cli/src/serve/run-qwen-serve.ts`            | Cycle de vie de l'écouteur + gestion des signaux                                                         |
| `packages/cli/src/serve/server.ts`                    | Routes Express + middleware                                                                              |
| `packages/cli/src/serve/auth.ts`                      | Bearer + liste d'autorisation d'hôtes + refus CORS                                                       |
| `packages/cli/src/serve/httpAcpBridge.ts`             | Spawn-ou-attache + FIFO par session + registre de permissions                                            |
| `packages/cli/src/serve/status.ts`                    | Types filaires d'état de démon en lecture seule + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts`              | Helper pur qui construit les payloads `/workspace/env` à partir de l'état `process.*`, y compris le masquage des identifiants |
| `packages/acp-bridge/src/eventBus.ts`                 | File asynchrone bornée + ring de rejeu                                                                   |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts`  | Client TS                                                                                                |
| `packages/sdk-typescript/src/daemon/sse.ts`           | Analyseur de trames EventSource                                                                          |
| `integration-tests/cli/qwen-serve-routes.test.ts`     | 18 cas, pas de LLM                                                                                       |
| `integration-tests/cli/qwen-serve-streaming.test.ts`  | 3 cas, processus enfant `qwen --acp` réel soutenu par le serveur OpenAI factice local (POSIX uniquement ; ignoré sur Windows) |