# Référence du protocole HTTP de `qwen serve`

Étape 1 de la [conception du démon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Toutes les routes se trouvent sous l'URL de base du démon (par défaut `http://127.0.0.1:4170`).

## Authentification

Lorsque le démon a été démarré avec `--token` ou `QWEN_SERVER_TOKEN`, **chaque route à l'exception de `/health` sur les liaisons loopback** doit inclure :

```
Authorization: Bearer <token>
```

Sans token configuré (valeur par défaut pour le développement en loopback), l'en-tête est optionnel. La comparaison des tokens s'effectue en temps constant. Les réponses 401 sont uniformes pour `missing header` / `wrong scheme` / `wrong token`.

**`--open-with-auth`.** Ce mode CLI désactivé par défaut nécessite une liaison loopback et un Web Shell disponible. Il réutilise la sélection normale `--token`-sur-`QWEN_SERVER_TOKEN`, ou génère 32 octets aléatoires encodés en base64url avant le démarrage du démon lorsque cette sélection est vide. Le navigateur reçoit le bearer sélectionné via `#token=` et le stocke par onglet ; le protocole et le middleware voient un token configuré ordinaire. Les `--open` nus, les appelants intégrés directs, les liaisons non-loopback et les autres clients ne reçoivent pas d'identifiants automatiques. Les environnements inéligibles au navigateur affichent l'URL fragment contenant le secret pour ouverture manuelle. Le `/health` loopback et les assets statiques du Web Shell conservent les exemptions décrites ci-dessous ; `--require-auth` protège toujours `/health`.

**Exemption de `/health`** (Bctum) : sur les liaisons loopback (`127.0.0.1` / `localhost` / `::1` / `[::1]`), `/health` est enregistré AVANT le middleware bearer, de sorte que les sondes de liveness à l'intérieur du pod n'ont pas besoin d'inclure le token, même si le démon a été démarré avec `--token`. Les liaisons non-loopback (`--hostname 0.0.0.0`, etc.) protègent `/health` derrière le bearer comme n'importe quelle autre route — consultez la section [`GET /health`](#get-health) pour connaître la raison.

**`--require-auth` (PR #4175 15).** Passez ce flag au démarrage pour étendre la règle « doit avoir un token » au loopback également. Le démarrage échoue sans token ; l'exemption de `/health` est supprimée (donc `/health` exige également `Authorization: Bearer …`).

Lorsque le flag est activé, le middleware global `bearerAuth` protège **toutes** les routes, y compris `/capabilities`. Un client **non authentifié** ne peut donc pas pré-vérifier `caps.features` pour découvrir que l'authentification est requise : la surface de découverte pour ce cas est le **corps de la réponse 401** lui-même (uniforme sur toutes les routes selon la section [Authentification](#authentication)). Le tag de capacité `require_auth` est une **confirmation post-authentification** : une fois qu'un client s'authentifie avec succès et lit `/capabilities`, la présence du tag confirme que le démon a été démarré avec `--require-auth` (utile pour les interfaces d'audit/conformité et pour que les clients SDK affichent « ce déploiement est renforcé » dans un panneau de paramètres). Les routes de mutation qui optent pour le mode strict par route (suivi de la Wave 4) refusent avec `401 { code: "token_required", error: "…" }` lorsqu'elles sont atteintes sur un loopback sans token par défaut — mais avec `--require-auth` activé, le middleware bearer global court-circuite la requête avant la protection par route, de sorte que le corps legacy `Unauthorized` est ce que les appelants non authentifiés voient réellement.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Les webuis de navigateur accédant au démon en cross-origin sont bloqués par défaut : toute requête contenant un en-tête `Origin` renvoie `403 {"error":"Request denied by CORS policy"}` car les clients CLI/SDK n'envoient jamais `Origin` et le démon considère sa présence comme le signe que la requête provient d'un contexte de navigateur auquel l'opérateur n'a pas souscrit. Passez `--allow-origin <pattern>` (répétable) au démarrage pour installer une allowlist au lieu du blocage. Chaque pattern est soit :

- Le littéral `*` : admet n'importe quelle origin. **Risqué** : le démarrage est refusé lorsque `*` est configuré mais qu'aucun bearer token n'est défini (quelle que soit la source : `--token`, `QWEN_SERVER_TOKEN`, ou `--require-auth` qui impose un token au démarrage). Le fil d'Ariane de démarrage émet un avertissement stderr lorsque `*` figure dans la liste. **Recommandation** : associez-le à `--require-auth` sur les liaisons loopback afin que `/health` soit également protégé par le bearer — il est enregistré avant le middleware bearer sur le loopback par défaut (afin que les sondes k8s/Compose puissent l'atteindre sans token), et une allowlist `*` le rend accessible depuis n'importe quel navigateur cross-origin. `--require-auth` laisse tout de même les assets statiques du Web Shell (`/`, `/assets/*` et les navigations de document `/session/:id`) pré-auth en loopback par conception — ils sont montés avant le middleware bearer — donc sous une allowlist `*` ils restent lisibles depuis n'importe quel navigateur cross-origin ; `--no-web` supprime cette surface. Sur les liaisons non-loopback, le bearer est déjà obligatoire au démarrage et `/health` est enregistré derrière lui, donc la seule surface que `*` expose sans token sont les assets statiques du Web Shell (`/`, `/assets/*` et les navigations de document `/session/:id` — leur JS appelle toujours des routes protégées par token). `--no-web` supprime même cela ; la surface d'API réelle est protégée de toute façon.
- Une origin URL canonique : `<scheme>://<host>[:<port>]`. **Pas de slash final, pas de chemin, pas d'userinfo, pas de requête.** Le démarrage est refusé avec `InvalidAllowOriginPatternError` si l'entrée échoue au round-trip `new URL(pattern).origin === pattern` ; le message d'erreur indique le mauvais pattern et la forme canonique. Strict par intention : une normalisation silencieuse (par exemple, supprimer un `/` final) laisserait passer des fautes de frappe et accepterait des entrées ambiguës.

Les origins correspondantes reçoivent les en-têtes de réponse CORS standard sur chaque requête :

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` renvoie l'origin de la requête verbatim (minuscules/majuscules telles qu'envoyées par le navigateur) plutôt que le littéral `*`, même avec le pattern `*` : les caches du navigateur indexent les réponses en fonction de cette valeur associée à `Vary: Origin`, et cette approche laisse la possibilité d'ajouter `Access-Control-Allow-Credentials` dans une prochaine version sans changement de schéma. Les en-têtes exposés permettent aux webuis de navigateur d'honorer les indications de retry, de conserver l'epoch SSE et de corréler les flux physiques acceptés. `Access-Control-Allow-Credentials` n'est **PAS** envoyé aujourd'hui : le démon s'authentifie via bearer dans `Authorization`, ce qui fonctionne en cross-origin sans `credentials: 'include'`.

Les requêtes OPTIONS preflight (OPTIONS avec `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) court-circuitent avec `204 No Content` ainsi que les en-têtes ci-dessus. C'est le pattern CORS conventionnel et c'est sûr : le preflight confirme uniquement quelles méthodes/en-têtes le démon acceptera ; la requête réelle ultérieure exécute toujours la chaîne complète (allowlist d'hôtes -> auth bearer -> routes), de sorte que l'anti-DNS-rebinding et l'application du bearer se déclenchent toujours avant que tout état ne soit lu ou modifié. Les requêtes OPTIONS simples provenant d'origins correspondantes continuent de circuler vers l'aval avec les en-têtes CORS attachés.

Les origins qui ne correspondent pas à l'allowlist reçoivent toujours `403 {"error":"Request denied by CORS policy"}` : la même enveloppe que le blocage par défaut, afin que les clients qui ont déjà analysé la réponse du blocage n'aient pas à traiter spécifiquement les démons déployés avec allowlist. Le chemin de rejet **n'émet** aucun en-tête `Access-Control-*` (le navigateur les ignorerait, et les émettre annoncerait indirectement la taille de l'allowlist via la présence des en-têtes).

La liste de patterns configurée n'est intentionnellement **PAS** renvoyée dans `/capabilities` : le webui du navigateur connaît déjà sa propre origin (il a appelé le démon, après tout), et exposer la liste permettrait à un lecteur non authentifié de `/capabilities` d'énumérer toutes les origins de confiance (utile pour la reconnaissance d'un déploiement mal configuré). Les clients SDK se basent sur le tag `caps.features.allow_origin` pour « ce démon honore les accès cross-origin des navigateurs » sans avoir besoin de connaître les origins spécifiques.

Les requêtes d'origin vers soi-même en loopback (par exemple, le Web Shell appelant le démon sur le même `127.0.0.1:port`) sont gérées par un shim de suppression d'Origin **séparé** qui s'exécute AVANT le middleware CORS et supprime l'en-tête `Origin` pour `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port`. Elles passent donc indépendamment de la configuration de `--allow-origin` : les opérateurs n'ont pas besoin de lister le propre port du démon pour faire fonctionner le Web Shell.

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
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

avec le statut `404`. Une fermeture simultanée utilise `code: "session_closing"`.

`WorkspaceMismatchError` pour un `POST /session` dont le `cwd` ne se canonicalise pas vers un workspace enregistré renvoie `400` avec :

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

Utilisez ceci pour détecter une incompatibilité en pre-flight : lisez `workspaceCwd` depuis `/capabilities` et omettez `cwd` de `POST /session` (il revient au workspace principal), ou lorsque `multi_workspace_sessions` est annoncé, choisissez l'un des `workspaces[].cwd`.

Un `POST /session` au-delà de la limite `--max-sessions` du démon renvoie `503` avec un en-tête `Retry-After: 5` et :

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

Lorsque `--max-total-sessions` rejette une nouvelle session, la même forme de réponse est renvoyée avec `"scope": "total"`.

Les rattachements aux sessions existantes ne sont **PAS** comptabilisés dans la limite, de sorte que les reconnexions d'un démon inactif continuent de fonctionner même à capacité maximale.

`RestoreInProgressError` — émis par `POST /session/:id/load`, `POST /session/:id/resume`, ou un `POST /session` avec un id fourni par l'appelant lorsqu'un autre enregistrement possède déjà cet id — renvoie `409` et :

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "reason": "restore_in_progress",
  "retryable": true,
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Déclenché lorsqu'un `session/load` est émis pour un id qui a déjà un `session/resume` en cours (ou vice versa), ou lorsqu'un spawn avec un id fourni par l'appelant entre en compétition avec l'une des directions de restauration. Attendez au moins `Retry-After` secondes et réessayez. Les courses de même action (`load` contre `load`, `resume` contre `resume`) fusionnent au lieu de générer une erreur tant que la restauration est active.

`reason` distingue deux clôtures qui partagent ce code, et l'en-tête `Retry-After` les suit :

| `reason`                     | Signification                                                                                                    | `Retry-After`                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `restore_in_progress`        | Une restauration ordinaire est en cours.                                                                         | `5` (correspond à `session_limit_exceeded`)                   |
| `awaiting_abandoned_cleanup` | L'appelant public a déjà reçu un `504` et la requête ACP non annulable ainsi que son nettoyage ne se sont pas encore terminés. | le budget de restauration effectif en secondes, limité à `5`–`120` |

La requête de restauration publique est régie par `limits.sessionRestoreTimeoutMs` (par défaut 60s). Après un `504`, l'id reste sous clôture jusqu'à ce que la requête ACP tardive et le nettoyage se terminent, donc un client qui continue à réessayer au rythme ordinaire de 5 secondes tournerait en rond face à un 409 qu'il ne peut pas lever — honorez l'indication dérivée du budget qui accompagne `awaiting_abandoned_cleanup`.

`SessionWorkspaceConflictError` — émis par `POST /session/:id/load` et `POST /session/:id/resume` lorsque le `cwd` demandé cible un workspace enregistré mais que le même id de session est déjà actif ou en cours de restauration par un autre runtime — renvoie `409` avec :

```json
{
  "error": "Session \"<sid>\" is already live or restoring in another workspace runtime.",
  "code": "session_workspace_conflict",
  "sessionId": "<sid>",
  "workspaceCwd": "/requested/workspace",
  "workspaceId": "requested-workspace-id",
  "liveWorkspaceCwd": "/live/owner/workspace",
  "liveWorkspaceId": "live-owner-workspace-id"
}
```

Les clients doivent réessayer avec le workspace propriétaire ou attendre que la restauration en cours se termine avant de restaurer l'id dans un autre workspace. Les courses de restauration dans le même workspace continuent d'utiliser le comportement `restore_in_progress` / fusion du bridge.

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
['health', 'capabilities', 'session_create', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload',
 'session_approval_mode_control', 'workspace_tool_toggle', 'workspace_skill_toggle',
 'workspace_skill_batch_toggle',
 'extension_batch_activation_v2',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_shell_command',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'extension_local_path_install',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> Les tags conditionnels n'apparaissent que lorsque leur toggle de déploiement correspondant est activé (voir le tableau ci-dessous). Le tag `permission_mediation` de F3 est toujours actif et porte `modes: ['first-responder', 'designated', 'consensus', 'local-only']` afin que les clients SDK puissent introspecter l'ensemble pris en charge par la build ; la stratégie active au runtime se trouve dans `body.policy.permission`.
`session_scope_override` est le handle de négociation pour le champ `sessionScope` par requête sur `POST /session` (voir ci-dessous). Les anciens daemons ignorent silencieusement ce champ, les clients SDK doivent donc vérifier en amont `caps.features` pour cette balise avant de l'envoyer.

`session_id_override` est le handle de négociation pour le `sessionId` optionnel fourni par l'appelant dans les métadonnées de `POST /session` et `session/new` ACP. Les clients doivent confirmer que `caps.features` contient ce tag avant d'envoyer le champ car les anciens daemons peuvent l'ignorer silencieusement.

`persistent_workspace_registration` annonce l'enregistrement durable des workspaces ajoutés au runtime. `POST /workspaces` accepte `{ "cwd": "/absolute/path", "persist": true }` ; le succès inclut `persisted: true`. Les enregistrements sont limités au workspace principal canonique du démon sous le Qwen home de l'utilisateur et sont restaurés au prochain démarrage du démon. Omettre `persist` préserve l'enregistrement local au processus. `GET /workspace-registrations` liste l'ensemble désiré stocké, et `DELETE /workspace-registrations/:id` oublie une entrée pour le prochain redémarrage sans retirer à chaud un runtime actif.

`workspace_display_name` annonce l'entrée optionnelle `displayName` sur `POST /workspaces`, les mises à jour de métadonnées de workspace via `PATCH /workspaces/:workspace`, et les champs de nom d'affichage optionnels dans les projections de workspace. Les noms ne participent pas à la recherche ni au routage : `id` et `cwd` canonique restent les seuls sélecteurs, et les noms en double sont autorisés.

`workspace_runtime_removal` annonce le retrait à chaud synchrone via `DELETE /workspaces/:workspace`. Les entrées de capacité workspace ajoutent `removable` optionnel ; seules les lignes avec `removable: true` peuvent être supprimées. Le retrait oublie également chaque alias d'enregistrement persistant pour le runtime, mais ne supprime jamais de fichiers, paramètres, transcripts ou archives.

`session_load` et `session_resume` annoncent les routes de restauration explicite (`POST /session/:id/load` et `POST /session/:id/resume`). Les anciens daemons retournent `404` pour ces chemins, les clients SDK doivent donc vérifier en amont `caps.features` avant de les appeler. `unstable_session_resume` est toujours annoncé comme un alias obsolète pour assurer la compatibilité avec les SDK publiés lorsque la méthode ACP sous-jacente s'appelait `connection.unstable_resumeSession` ; les nouveaux clients doivent se baser sur `session_resume`.

`limits.sessionRestoreTimeoutMs`, lorsqu'il est présent, est le budget en temps réel du daemon pour la requête ACP sous-jacente `loadSession` / `unstable_resumeSession`. C'est un champ additif v1. Le SDK TypeScript accorde au daemon 10 secondes de marge client, et le watchdog WebUI lui accorde 15 secondes ; les clients communiquant avec un ancien daemon doivent utiliser respectivement 70 secondes et 75 secondes.

`session_transcript` annonce `GET /session/:id/transcript`, une vue de relecture paginée en lecture seule sur le JSONL persisté de la session active. Elle est distincte de `/load` : elle n'attache pas de client, n'initialise pas l'EventBus live, ne crée pas de session live et ne modifie pas la fenêtre de relecture live. Les clients doivent l'utiliser lorsqu'ils ont besoin du transcript complet sur disque pour une longue session, et continuer à utiliser `/load` uniquement pour la relecture live bornée lors de la restauration froide de l'UI.

`workspace_persisted_transcript` annonce `GET /workspaces/:workspace/session/:id/transcript`, un pager persisté uniquement local au démon qui ne démarre pas ACP, n'interroge pas l'état du bridge live, ne charge pas les paramètres, ne découvre pas les capacités du projet et ne crée pas la clé de curseur persisté héritée. Le tag est inconditionnel car les primaries mono-workspace de confiance peuvent utiliser la route plurielle ; l'autorisation de confiance par workspace est toujours évaluée sur chaque requête. Les workspaces secondaires non fiables enregistrés peuvent lire, tandis qu'un primary non fiable reste rejeté.

`workspace_session_export` annonce `GET /workspaces/:workspace/session/:id/export`, un export complet réservé aux fiables de la session persistée active du workspace sélectionné. Il est indépendant de `session_export` et `workspace_qualified_rest_core` : les daemons publiés peuvent annoncer les deux anciens tags sans implémenter la route plurielle, donc les clients doivent pré-vérifier ce tag directement. Le tag est inconditionnel car un primary mono-workspace de confiance peut utiliser la route par id ou cwd. L'export ne résout pas de propriétaire live, ne démarre pas ACP, n'attache pas de client et ne revient pas à un autre workspace.

`workspace_archived_session_export` annonce `GET /workspaces/:workspace/session/:id/archive/export`, un export complet réservé aux fiables depuis le stockage persisté archivé du workspace sélectionné. Il est indépendant de `workspace_session_export` et `workspace_qualified_rest_core` ; les clients doivent pré-vérifier ce tag directement. Une route distincte empêche un ancien daemon d'ignorer l'intention d'archivage et de renvoyer un transcript actif avec le même id.

`workspace_session_live_state` annonce `GET /workspaces/:workspace/sessions/live-state`, un snapshot en mémoire uniquement réservé aux fiables des sessions live du runtime workspace sélectionné, ainsi qu'une version de catalogue en mémoire qui indique aux clients quand un rechargement complet du catalogue persisté est justifié. Il est indépendant de `workspace_qualified_rest_core` : les daemons publiés peuvent annoncer la capacité REST workspace plus large sans implémenter cette route, donc les clients doivent pré-vérifier ce tag directement. Le tag est inconditionnel car un primary mono-workspace de confiance peut utiliser la route par id ou cwd ; les vérifications de confiance par workspace s'appliquent toujours sur chaque requête, et la route n'étend pas la politique permissive de lecture de catalogue persisté des secondaires non fiables à l'état du bridge live. Le tag signifie que le point de terminaison existe ; il ne promet pas que chaque élément live porte le watermark d'activité optionnel `updatedAt`, qui dépend du cycle de vie.

`slow_client_warning` couvre le comportement de backpressure SSE : (a) le daemon émet une trame de flux d'événements synthétique `slow_client_warning` lorsque le backlog de trames en direct d'un abonné ou son backlog d'octets sérialisés en direct dépasse 75 % de capacité, une fois par épisode de débordement (réarmé après que les deux mesures redescendent sous les 37,5 %) ; (b) `GET /session/:id/events` accepte un paramètre de requête `?maxQueued=N` (plage `[16, 2048]`) pour prédimensionner le backlog de trames par abonné lors des reconnexions à froid face à un grand anneau de relecture. Le plafond d'octets sérialisés est géré par le daemon (par défaut **2 MiB** par abonné), uniquement en direct, et n'a volontairement pas de paramètre de requête. La taille de l'anneau pour l'ensemble du daemon est contrôlée par `--event-ring-size` (par défaut **8000**, selon #3803 §02). Les anciens daemons ne disposent pas silencieusement du comportement d'avertissement/requête — vérifiez cette balise en amont avant de l'activer.

`typed_event_schema` annonce les payloads d'événements du daemon qui correspondent au schéma `KnownDaemonEvent` du SDK. Les anciens daemons peuvent toujours diffuser des trames compatibles, mais les clients SDK doivent vérifier cette balise en amont avant de supposer une couverture des événements typés.

`client_heartbeat` annonce `POST /session/:id/heartbeat`. Les anciens daemons retournent `404` ; vérifiez cette balise en amont avant d'émettre des heartbeats périodiques.

`session_close` et `session_metadata` annoncent `DELETE /session/:id` et `PATCH /session/:id/metadata`. Les anciens daemons retournent `404` ; vérifiez ces balises en amont avant d'exposer les fonctionnalités de fermeture ou de renommage.

`session_organization` annonce les groupes de sessions personnalisés et l'épinglage. Il ajoute `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization`, et la vue de liste organisée en option `GET /workspace/:id/sessions?view=organized`. Lorsque `session_organization` et `workspace_qualified_rest_core` sont tous deux annoncés, la mutation d'organisation qualifiée par workspace `PATCH /workspaces/:workspace/session/:id/organization` est également disponible. La mutation héritée reste limitée au workspace principal. Les anciens daemons retournent `404` pour les routes de mutation/groupe et ignorent le contrat de vue organisée, les clients WebShell/SDK doivent donc vérifier ces balises en amont avant d'afficher l'interface utilisateur de groupement ou d'épinglage correspondante.

`session_archive` annonce l'API d'archive d'état de répertoire v1 : `POST /sessions/archive`, `POST /sessions/unarchive`, et `GET /workspace/:id/sessions?archiveState=active|archived`. Les sessions archivées ne peuvent pas être chargées ou reprises tant qu'elles n'ont pas été désarchivées. `session_storage_conflict_repair` annonce l'option de requête additive `resolveConflicts` et le compartiment de réponse `resolvedConflicts` décrits ci-dessous.

`workspace_qualified_rest_core` annonce les routes REST core plurielles sous `/workspaces/:workspace/...`. Le sélecteur se résout d'abord par id de workspace exact, puis par cwd absolu encodé en URL après canonisation. Les nouveaux daemons mono-workspace incluent le runtime principal dans `workspaces[]` même lorsque `multi_workspace_sessions` est absent, permettant aux clients de découvrir l'id requis par les routes qualifiées par workspace ; les clients doivent revenir à `capabilities.workspaceCwd` pour les anciens daemons qui omettent le tableau. Le statut de confiance et les routes de demande de confiance sont disponibles pour les workspaces non fiables enregistrés ; les routes de lecture de fichiers suivent la politique de lecture du système de fichiers existante. Les workspaces secondaires non fiables enregistrés exposent également les catalogues de sessions et de groupes de sessions en lecture seule persistée : ces lectures ne s'attachent pas à une session, ne démarrent pas ACP et ne fusionnent pas l'état du bridge live. Les écritures de fichiers, les mutations de catalogue et les autres routes core plurielles nécessitent un workspace de confiance sauf si une capacité distincte définit explicitement une politique en lecture seule plus étroite, comme `workspace_persisted_transcript`. Un primary non fiable continue de recevoir `403 { code: "untrusted_workspace" }` des routes de catalogue pluriel et de transcript ; les routes singulières héritées du primary conservent leur comportement de compatibilité existant. Ce tag couvre les surfaces core de fichiers, statut, paramètres, permissions, confiance, cycle de vie, contrôle MCP, toggles d'outils et de skills, mémoire, CRUD d'agents workspace et stockage de sessions. Il ne couvre pas l'auth, la voix, les extensions, le transport ACP/WebSocket, le routage channel-worker ou l'export de session qualifié par workspace ; pré-vérifiez `workspace_session_export` ou `workspace_archived_session_export` séparément. La confiance workspace n'est pas une ACL : un client détenant le token du daemon peut lire chaque surface de workspace enregistré autorisée par cette politique.

`workspace_qualified_voice` annonce les routes Voice sélectionnées par un runtime workspace de confiance : `GET` et `POST /workspaces/:workspace/voice`, `POST /workspaces/:workspace/voice/transcribe`, et `WS /workspaces/:workspace/voice/stream`. Il n'est annoncé que lorsque les runtimes multi-workspace et l'écouteur WebSocket ACP/Voice partagé sont tous deux activés. Le sélecteur suit les mêmes règles id-ou-cwd-absolu-encodé que les autres routes plurielles. Pour REST, un sélecteur inconnu renvoie `400 { code: "workspace_mismatch" }` et un sélecteur non fiable renvoie `403 { code: "untrusted_workspace" }` ; le rejet de mise à niveau WebSocket expose le statut HTTP 400/403 correspondant sans enveloppe JSON structurée. Aucun transport ne revient au primary. Les routes héritées `/workspace/voice`, `/workspace/voice/transcribe` et `/voice/stream` restent limitées au primary. Les clients utilisent `workspace_qualified_voice` pour toutes les modalités Voice qualifiées et laissent le runtime sélectionné signaler les erreurs spécifiques à la configuration. Les tags hérités `workspace_voice`, `workspace_voice_transcription` et `voice_transcribe` ne décrivent que les routes liées au primary et ne doivent pas masquer une configuration secondaire qualifiée.

`workspace_qualified_memory` annonce les routes de mémoire gérée qualifiées par workspace : `POST /workspaces/:workspace/memory/{remember,forget,dream}` mettent en file d'attente des tâches et `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` les relit. Il n'est annoncé que lorsque ACP HTTP et les runtimes multi-workspace sont tous deux activés. Le sélecteur suit les mêmes règles id-ou-cwd-absolu-encodé que les autres routes plurielles. Chaque workspace enregistré obtient sa propre lane de tâches ; la lane qualifiée du primary est la même instance que la surface singulière `/workspace/memory`, donc une tâche mise en file sur l'une est lisible sur l'autre. La résolution est strictement par runtime sélectionné sans retour au primary : un sélecteur inconnu renvoie `400 { code: "workspace_mismatch" }`, un sélecteur non fiable renvoie `403 { code: "untrusted_workspace" }`, et un runtime inactif ou en drainage renvoie `503 { code: "workspace_runtime_unavailable" }`. Les lectures n'allouent jamais de lane, donc interroger un workspace sans tâches renvoie `404 { code: "<kind>_task_not_found" }`. Les ids de tâches sont limités à leur lane et ne survivent pas à une reconfiguration de workspace ou à un remplacement de runtime ; un id obsolète renvoie `404`, pas une condition de perte de données. Lorsque ACP HTTP est désactivé, le tag n'est pas annoncé et une requête qualifiée non-principal renvoie un `501 { code: "workspace_memory_unavailable" }` non retryable, tandis que la route qualifiée principale continue de fonctionner via la lane possédée localement.

`session_lsp` annonce `GET /session/:id/lsp`, l'instantané structuré en lecture seule du statut LSP pour les clients daemon. Les anciens daemons retournent `404` ; vérifiez cette balise en amont avant d'exposer le statut LSP distant.

`session_status` annonce `GET /session/:id/status`, le résumé en direct du bridge pour une seule session par son id. En plus de `clientCount` et `hasActivePrompt`, les sessions live exposent `isWaitingForPermission`, `isWaitingForUserQuestion`, `pendingInteractionCount` et un `turnError` conservé après un tour échoué. L'erreur s'efface lorsque le prompt suivant démarre réellement. Une session live ayant réglé un tour en cours dans le bridge courant porte également `updatedAt`, le même watermark d'activité documenté sous la route live-state ; comme cette route renvoie le résumé du bridge directement, la valeur n'est pas fusionnée avec le mtime de transcription persisté et peut être antérieure à celle qu'une liste de sessions rapporte. Tant la réponse de statut session unique que les listes de sessions workspace incluent `turnError` et `pendingInteractions` : les actions de permission prêtes pour le rendu ou les questions `ask_user_question` plus le `requestId` et les options sélectionnables requis par les routes de vote de permission existantes. Chaque question utilisateur a un `answerKey` ; votez avec `answers`, par exemple `{ "0": "Polling" }`, clé par cette valeur. Les sessions persistées uniquement omettent l'état runtime car aucun runtime n'existe. Les anciens daemons retournent `404` ; vérifiez cette balise en amont avant d'interroger le statut d'une seule session au lieu de scanner la liste complète des sessions.

`session_info` annonce `GET /workspace/:id/session-info` et son jumeau `/workspaces/:workspace/session-info`. La réponse agrège les compteurs de sessions actives et archivées persistées sans hydrer les métadonnées de liste. C'est un scan disque O(n) explicite et ne doit pas être interrogé en polling ; les clients doivent traiter `truncated: true` comme un résultat borne inférieure.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_skill_toggle`, `workspace_skill_batch_toggle`, `extension_batch_activation_v2`, `workspace_init`, et `workspace_mcp_restart` annoncent les routes de contrôle de mutation documentées ci-dessous. Elles sont strictement soumises à la gate de mutation (un daemon configuré sans bearer token les rejette avec une 401 `token_required`). Les anciens daemons retournent `404` ; vérifiez chaque balise en amont avant d'exposer la fonctionnalité correspondante.

`mcp_guardrails` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) couvre la surface de budget MCP : les champs `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` sur `GET /workspace/mcp`, le champ `disabledReason` sur les cellules par serveur, et les flags CLI `--mcp-client-budget` / `--mcp-budget-mode`. Les anciens daemons omettent entièrement les nouveaux champs ; les clients SDK vérifient cette balise en amont avant de s'appuyer sur la sémantique de `budgets[]`. Le descripteur de registre contient également `modes: ['warn', 'enforce']` pour une future exposition des modes de fonctionnalités — pour l'instant, les clients déduisent le mode à partir du champ `budgetMode` de l'instantané. Le refus du serveur en mode `enforce` est déterministe selon l'ordre de déclaration de `Object.entries(mcpServers)` ; une future couche de précédence de portée (si qwen-code en adopte une) déplacerait cela à "la précédence la plus faible en premier" pour refléter la convention `plugin < user < project < local` de claude-code.

> **La portée est pilotée par la capacité.** Avec `mcp_workspace_pool`, les sessions à l'intérieur d'un runtime workspace partagent un pool de transport et un `WorkspaceMcpBudget`, et le snapshot émet `budgets[0].scope: 'workspace'`. Les runtimes workspace différents possèdent des pools indépendants. Sans le tag, chaque session ACP utilise son `McpClientManager` hérité, le snapshot émet `scope: 'session'`, et N sessions peuvent chacune consommer le plafond configuré.

`workspace_file_read` couvre les routes de fichiers workspace pour texte/liste/stat/glob
(`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes`
couvre `GET /file/bytes`, qui a été ajouté plus tard pour que les clients puissent vérifier en amont
la prise en charge des fenêtres d'octets bruts face aux daemons de l'ère PR19. `workspace_file_write` couvre
les routes de mutation de texte tenant compte des hachages (`POST /file/write`, `POST /file/edit`).
La balise write signifie que le contrat de route existe ; cela ne signifie pas que le
déploiement actuel est ouvert aux mutations anonymes. Write/edit sont des routes de mutation
strictes et nécessitent un bearer token configuré même sur loopback.
`workspace_file_upload` couvre `POST /file/upload`, la route d'entrée binaire :
un corps `application/octet-stream` plafonné à `MAX_UPLOAD_BYTES` (50 MiB) est
écrit dans le workspace sans jamais écraser — un nom occupé est
auto-numéroté (`name (1).ext`, `name (2).ext`, ...). C'est également une route de mutation
stricte.

Lorsque `workspace_qualified_rest_core` est annoncé, la même surface de fichiers est également disponible à `/workspaces/:workspace/file`, `/workspaces/:workspace/file/bytes`, `/workspaces/:workspace/stat`, `/workspaces/:workspace/list`, `/workspaces/:workspace/glob`, `/workspaces/:workspace/file/write`, `/workspaces/:workspace/file/edit`, et `/workspaces/:workspace/file/upload`.

Le même tag expose également le CRUD d'agents de projet qualifié par workspace à `/workspaces/:workspace/agents` et `/workspaces/:workspace/agents/:agentType`. Ces routes plurielles ne lisent ou ne mutent que les agents au niveau du projet pour le workspace sélectionné ; les requêtes de portée `global` et `user` renvoient `400 { code: "global_scope_not_supported_for_workspace_route" }`. Les routes `/workspace/agents` sans workspace conservent leur comportement existant limité au workspace principal et restent la seule surface REST pour la portée d'agents au niveau utilisateur.

`extension_management_v2` annonce un catalogue d'extensions au niveau utilisateur et une surface de mutation à `/extensions/*`, plus des projections d'activation par workspace à `/workspaces/:workspace/extensions/*`. Les artefacts sont globaux ; les routes workspace exposent uniquement des lectures de projection, des overrides d'activation exacts et un rafraîchissement runtime. Les lectures peuvent cibler un workspace enregistré non fiable, tandis que l'activation, le rafraîchissement et l'installation à l'échelle du workspace nécessitent une cible de confiance. Les mutations lentes utilisent des opérations locales au daemon à `/extensions/operations/:operationId` ; la génération du store, et non l'historique des opérations, fait autorité à travers les redémarrages et les daemons. La capacité `workspace_extensions` publiée et les routes `/workspace/extensions/*` restent un adaptateur de compatibilité limité au workspace principal. Les clients doivent pré-vérifier `extension_management_v2` et ne doivent pas le déduire du mode du daemon ou de `workspace_qualified_rest_core`.

`extension_git_credentials` annonce les installations Git HTTPS authentifiées sur `POST /workspace/extensions/install` et `POST /extensions/install`. Les clients doivent pré-vérifier ce tag avant d'envoyer des userinfo d'URL ou `credentialPersistence` ; les anciens daemons rejettent les identifiants d'URL. Le tag décrit la prise en charge du protocole backend, pas la disponibilité d'un keychain : le mode stocké rapporte le backend sélectionné dans le résultat d'opération terminal.

`extension_local_path_install` annonce les sources d'Extension locales au daemon sur `POST /workspace/extensions/install` et `POST /extensions/install`. La `source` doit être un chemin absolu qui existe sur l'hôte du daemon. Les chemins relatifs restent non pris en charge afin que le cwd du processus daemon ne puisse pas changer l'identité de la source ou masquer un raccourci GitHub `owner/repo`. L'opération d'installation existante copie l'Extension dans le stockage géré ; elle ne lie pas la source. Les clients doivent pré-vérifier ce tag car les anciens daemons rejettent les sources locales.

`extension_batch_activation_v2` ajoute `PUT /extensions/activation` et `PUT /workspaces/:workspace/extensions/activation`. Les deux acceptent 1 à 100 noms dans `extensionNames`, les dédupliquent de manière insensible à la casse tout en préservant l'ordre de première vue, persistent les cibles modifiées en une seule génération et renvoient un seul handle d'opération `202`. Une cible n'a pas besoin d'être installée lors de la définition de `enabled` ou `disabled` : son nom crée une déclaration d'état désiré qui est préservée lorsqu'une extension portant ce nom est installée. La route globale accepte `state: "enabled" | "disabled"`, écrit le `defaultActivation` V2 et réconcilie chaque runtime enregistré. La route workspace accepte également `"inherit"`, applique ou efface les overrides exacts pour le runtime fiable sélectionné et ne réconcilie que ce runtime. `inherit` ne déclare pas un nom inconnu ; un effacement tout-inconnu rapporte `updated: false` et skip la réconciliation. Les routes d'activation singulières restent limitées aux installées et adressées par id.

### Contrat de wire Extension Management V2

Toutes les routes utilisent les règles d'authentification bearer du daemon ci-dessus. `X-Qwen-Client-Id` est optionnel pour les routes de mutation V2 ; lorsqu'il est fourni, il doit identifier un client enregistré auprès de l'un des runtimes workspace de la mutation. `:extensionId` est l'identité d'extension en 64 hexadécimaux minuscules. `:workspace` se résout d'abord par id de workspace exact et sinon par cwd absolu encodé en URL après canonisation.

| Method and path                                                    | Success                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions`                                                  | `200` catalogue global d'artefacts                                          |
| `PUT /extensions/activation`                                       | `202` opération batch d'activation par défaut globale                       |
| `PUT /extensions/:extensionId/activation`                          | `202` opération d'activation par défaut globale                             |
| `POST /extensions/install`                                         | `202` opération d'installation                                              |
| `POST /extensions/check-updates`                                   | `202` opération de vérification de mises à jour                             |
| `POST /extensions/:extensionId/update`                             | `202` opération de mise à jour                                              |
| `DELETE /extensions/:extensionId`                                  | `202` opération de désinstallation, ou `204` idempotent lorsque l'extension est absente |
| `GET /extensions/operations/:operationId`                          | `200` snapshot d'opération                                                  |
| `GET /workspaces/:workspace/extensions`                            | `200` projection d'activation par workspace                                |
| `PUT /workspaces/:workspace/extensions/activation`                 | `202` opération batch d'activation workspace exacte                         |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation`    | `202` opération d'activation workspace exacte                               |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | `202` opération de suppression d'override                                   |
| `POST /workspaces/:workspace/extensions/refresh`                   | `202` opération de rafraîchissement runtime                                 |

La réponse du catalogue global est :

```json
{
  "v": 1,
  "generation": 12,
  "extensions": [
    {
      "id": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "installType": "npm",
      "defaultActivation": "enabled",
      "workspaceOverrideCount": 1
    }
  ]
}
```

`installType` est omis lorsqu'aucune métadonnée d'installation n'est disponible. `defaultActivation` est `enabled` ou `disabled`. `workspaceOverrideCount` exclut les entrées `inherit` stockées.

La réponse de projection workspace est :

```json
{
  "v": 1,
  "workspaceId": "workspace-id",
  "workspaceCwd": "/absolute/workspace",
  "trusted": true,
  "desiredGeneration": 12,
  "appliedGeneration": 11,
  "extensions": [
    {
      "extensionId": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "defaultActivation": "enabled",
      "workspaceActivation": "disabled",
      "effectiveActivation": "disabled",
      "activationSource": "workspace_override"
    }
  ]
}
```

`workspaceActivation` est `enabled`, `disabled`, ou `null` pour l'héritage. `activationSource` est `default`, `workspace_override`, `legacy_path_rule`, ou `cli_override`. `desiredGeneration` est la génération du store durable ; `appliedGeneration` est la dernière génération que le contrôleur a enregistrée comme appliquée à ce runtime workspace et peut temporairement être en retard.

L'installation nécessite un consentement explicite et une activation initiale :

```json
{
  "source": "@scope/demo",
  "consent": true,
  "activation": { "scope": "user" },
  "ref": "optional-git-ref",
  "autoUpdate": true,
  "allowPreRelease": false,
  "registry": "https://registry.npmjs.org"
}
```

Pour une activation initiale limitée au workspace, utilisez `{ "scope": "workspace", "workspaceId": "target-workspace-id" }` ; la cible doit exister et être de confiance. Les installations du daemon acceptent les sources GitHub, Git et npm. Lorsque `extension_local_path_install` est annoncé, elles acceptent également un chemin absolu qui existe sur l'hôte du daemon. `ref` ne s'applique pas à npm, `ref` et `autoUpdate` ne s'appliquent pas aux sources locales, et `registry` s'applique uniquement à npm. `ref`, `autoUpdate`, `allowPreRelease`, et `registry` sont optionnels.

Lorsque `extension_git_credentials` est annoncé, une source Git HTTPS peut inclure des userinfo, par exemple `https://username:token@git.example.com/org/repository.git`. `credentialPersistence` est valide uniquement avec une telle source. Il vaut `stored` ou `one_time` et par défaut `one_time` lorsqu'omis. Le mode stocké sauvegarde l'identifiant via le stockage de secrets hybride du daemon et ne conserve que l'URL propre du dépôt dans les métadonnées d'installation, de sorte que l'extension reste mettable à jour. Le mode usage unique ne sauvegarde ni l'URL du dépôt ni l'identifiant et crée un `snapshot` non mettable à jour ; `autoUpdate: true` est rejeté pour ce mode. Fournir le champ sans identifiants d'URL, fournir des identifiants invalides, ou utiliser des identifiants avec npm, archive, local, SSH ou des sources non-Git renvoie `400`.

Les réponses et opérations d'installation avec identifiants exposent `credentialPersistence` et peuvent exposer `credentialStorage` en tant que `keychain` ou `encrypted_file`. Les opérations usage unique omettent `source` ; les opérations stockées peuvent renvoyer la source propre. Les entrées catalogue/statut de snapshot omettent la source, définissent `credentialPersistence` à `one_time` et signalent `not updatable`. La mise à jour échoue avec `extension_not_updatable` ; un secret stocké indisponible échoue avant l'accès réseau avec `extension_credential_unavailable`.

Les requêtes `PUT` d'activation globale et workspace utilisent le même corps :

```json
{ "state": "enabled" }
```

`state` est `enabled` ou `disabled`. Les requêtes de mise à jour, désinstallation, vérification de mises à jour, suppression d'activation et rafraîchissement n'ont pas de corps requis.

Les requêtes d'activation batch utilisent les noms d'extensions :

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

Le batch workspace accepte également `"state": "inherit"`. Les résultats globaux terminaux contiennent `name` et `defaultActivation` ; les résultats workspace contiennent `name`, `workspaceActivation` (`null` pour inherit) et `effectiveActivation`. Les noms malformés rejettent la requête ; les conflits avec les identités Store existantes échouent de manière atomique sans commit partiel. Une cible `inherit` inconnue n'est pas persistée, car effacer un override ne doit pas fabriquer une déclaration d'activation par défaut ni remplacer un consentement d'installation ultérieur.

Chaque mutation asynchrone acceptée renvoie :

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

Les mutations qualifiées par workspace utilisent le même chemin de polling global `/extensions/operations/:operationId`. L'historique des opérations est local au processus, ne conserve qu'un nombre borné d'entrées terminales, et est perdu au redémarrage du daemon ; les clients doivent relire le catalogue ou la projection workspace et comparer les générations lorsqu'un id d'opération disparaît.

Un snapshot d'opération a cette forme :

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "install",
  "status": "running",
  "phase": "preparing",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000100,
  "source": "owner/repository",
  "name": "demo"
}
```

`status` passe de `queued` à `running`, puis à `succeeded`, `succeeded_with_warnings`, ou `failed`. Pendant l'exécution, `phase` est `preparing`, `committing`, ou `reconciling`. Le succès terminal peut inclure `result` avec `status` égal à `installed`, `enabled`, `disabled`, `updated`, `uninstalled`, `checked`, ou `refreshed` ; les résultats de réconciliation peuvent contenir en plus `refreshed`, `failed`, et `error`, tandis que les résultats d'activation batch contiennent des `results` ordonnés. Les vérifications de mise à jour renvoient `result.states`, clé par nom d'extension, avec des valeurs telles que `checking for updates`, `update available`, `up to date`, `not updatable`, ou `error`.

Un commit durable suivi d'un nettoyage incomplet ou d'une réconciliation runtime n'est pas signalé comme une mutation échouée. Il renvoie `succeeded_with_warnings` et préserve le résultat commité :

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "activation",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "disabled",
    "name": "demo",
    "refreshed": 1,
    "failed": 1
  },
  "warnings": [
    {
      "workspaceId": "workspace-id",
      "workspaceCwd": "/absolute/workspace",
      "code": "reconcile_slow",
      "error": "Runtime reconciliation took 31000ms."
    }
  ]
}
```

Les `workspaceId` et `code` d'avertissement sont optionnels ; `workspaceCwd` et `error` sont toujours présents. Les clients doivent afficher les avertissements, rafraîchir leur catalogue/projection, et ne doivent pas réessayer aveuglément la mutation durable.

Les échecs de validation et d'autorisation sont des erreurs HTTP synchrones utilisant `{ "error": "...", "code": "..." }` lorsqu'un code stable existe. Les cas importants sont `400 invalid_extension_id`, `400 invalid_extension_names`, `400 invalid_extension_name`, `400 invalid_extension_activation`, `400 workspace_mismatch`, `403 untrusted_workspace`, `404 extension_operation_not_found`, et `429 extension_queue_full`. La validation d'installation renvoie également `400` pour des options source/ref/registry invalides, un consentement manquant, ou une activation initiale manquante/invalide. Une mutation qui échoue après `202` est représentée, tant qu'elle est conservée dans l'historique des opérations, avec `status: "failed"`, `error`, et un `code` stable optionnel ; les codes courants incluent `extension_prepare_timeout` et `extension_conflict`. HTTP `404` pour une opération n'implique pas de rollback car l'historique des opérations n'est pas durable.

`daemon_status` annonce `GET /daemon/status`, l'instantané de diagnostic
opérateur consolidé en lecture seule documenté ci-dessous.

**Balises conditionnelles.** Ces tags de fonctionnalités sont annoncés uniquement lorsque leur basculement de déploiement, leur câblage runtime ou leur condition de disponibilité est actif. La présence du tag signifie que le comportement documenté est disponible ; l'absence signifie soit un ancien daemon antérieur au tag, soit un daemon actuel où cette condition est fausse. Actuellement :

<!-- conditional-serve-features:start -->

| Balise                            | Annoncée lorsque…                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_auth`                    | le daemon a été démarré avec `--require-auth` (ou `requireAuth: true` via l'API intégrée). Le bearer token est obligatoire sur chaque route, y compris `/health` sur les bind loopback.                                                                                                                                                                                                                                                                                                                          |
| `mcp_workspace_pool`              | le pool de transport MCP partagé est actif. Omis lorsque `QWEN_SERVE_NO_MCP_POOL=1` désactive le pool.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `mcp_pool_restart`                | le pool de transport MCP partagé est actif ; les réponses de redémarrage peuvent inclure des formes multi-entrées tenant compte du pool.                                                                                                                                                                                                                                                                                                                                                                          |
| `external_tool_guard`             | `qwen serve` a terminé le handshake de démarrage pour `--external-tool-guard-mode=required` ; chaque canal ACP créé doit acquitter le callback installé avant la création de Session, et chaque invocation d'outil ACP géré de haut niveau supportée qui atteint la limite d'exécution finale doit recevoir une autorisation externe pré-exécution. Les refus antérieurs de permission/hook ne font aucune requête provider. L'exécution imbriquée AgentCore est hors v1 et est rejetée tandis que ce mode provider externe est actif. Le tag reflète uniquement le provider externe : indépendamment de lui, chaque daemon applique le garde de relocalisation Git intégré aux outils gérés qui portent une ligne de commande shell (`run_shell_command` et `monitor`), donc l'absence de ce tag ne signifie pas qu'il n'y a aucun refus pré-exécution. |
| `allow_origin`                    | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Le daemon a été démarré avec au moins un `--allow-origin <pattern>` (ou `allowOrigins: [...]` via l'API intégrée). Les requêtes cross-origin provenant d'origines correspondantes reçoivent des en-têtes de réponse CORS appropriés ; les origines non correspondantes obtiennent toujours la 403 par défaut. La liste de patterns configurée n'est volontairement PAS renvoyée dans `/capabilities` pour éviter de divulguer l'ensemble des origines de confiance aux lecteurs non authentifiés — le webui du navigateur connaît déjà sa propre origine. |
| `prompt_absolute_deadline`        | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                                       |
| `writer_idle_timeout`             | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` est défini sur un entier positif.                                                                                                                                                                                                                                                                                                                                                                          |
| `workspace_settings`              | le daemon a été créé avec la persistance des paramètres disponible.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workspace_voice`                 | la persistance des paramètres est disponible, donc les routes héritées de paramètres Voice du workspace principal sont actives.                                                                                                                                                                                                                                                                                                                                                                                    |
| `workspace_voice_transcription`   | le workspace principal a un modèle de transcription Voice configuré.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `session_shell_command`           | l'exécution du shell de session est explicitement activée.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `session_artifacts_persistence`   | la persistance des artefacts de session est câblée pour le runtime.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `session_generation`              | les helpers de génération de session sont disponibles.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `scheduled_task_session_reuse`    | la gestion durable des sessions de tâches planifiées est active et chaque runtime de daemon géré a installé le callback qui permet à une tâche de se lier explicitement à sa session existante actuelle.                                                                                                                                                                                                                                                                                                          |
| `workspace_generation`            | les helpers de génération à l'échelle du workspace sont disponibles.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rate_limit`                      | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` est activé.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `workspace_reload`                | la prise en charge du rechargement du workspace est disponible dans la configuration des routes intégrées.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `workspace_trust_hot_reload`      | la surveillance de la politique de confiance du workspace et la réconciliation de génération runtime sont câblées, donc les changements de confiance prennent effet sans redémarrer le daemon et les rapports de statut de confiance v2 rapportent la convergence.                                                                                                                                                                                                                                                 |
| `channel_reload`                  | un manager de channel worker géré par le daemon est activé et peut recharger sa sélection courante.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `channel_control`                 | le contrôle runtime du channel worker géré par le daemon est câblé.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `channel_management`              | les paramètres de Channel à l'échelle du workspace, le cycle de vie et la gestion du pairing sont câblés.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `multi_workspace_sessions`        | plus d'un runtime workspace est enregistré, donc la création de session peut sélectionner un runtime de confiance par cwd.                                                                                                                                                                                                                                                                                                                                                                                         |
| `multi_workspace_session_rewind`  | plus d'un runtime workspace est enregistré ; les routes de rembobinage de session live singulières résolvent le runtime propriétaire.                                                                                                                                                                                                                                                                                                                                                                              |
| `multi_workspace_session_shell`   | plus d'un runtime workspace est enregistré et l'exécution du shell de session est explicitement activée ; le shell REST singulier résout le runtime propriétaire.                                                                                                                                                                                                                                                                                                                                                 |
| `dynamic_workspace_registration`  | une fabrique de runtime workspace est câblée dans le daemon, donc un répertoire de confiance existant peut être enregistré comme runtime secondaire au runtime.                                                                                                                                                                                                                                                                                                                                                    |
| `persistent_workspace_registration` | un store d'enregistrement de workspace est câblé dans le daemon. Le `runQwenServe` de production fournit le store utilisateur automatiquement ; les embeds directs `createServeApp` doivent en injecter un explicitement et posséder la restauration au démarrage de leur registre de workspace.                                                                                                                                                                                                                 |
| `scratch_workspace_registration`  | la création de workspace scratch géré est disponible — une fabrique de runtime, une racine scratch gérée validée et la suppression de runtime sont câblées, et chaque runtime géré respecte la limite de la racine scratch.                                                                                                                                                                                                                                                                                       |
| `workspace_runtime_removal`       | les runtimes secondaires dynamiques ou restaurés par persistance supprimables peuvent être drainés et retirés via la route de gestion.                                                                                                                                                                                                                                                                                                                                                                            |
| `workspace_qualified_acp`         | ACP HTTP et les runtimes multi-workspace sont actifs, donc le point de terminaison ACP pluriel peut sélectionner un runtime secondaire.                                                                                                                                                                                                                                                                                                                                                                            |
| `workspace_qualified_voice`       | les runtimes multi-workspace et l'écouteur WebSocket ACP/Voice partagé sont actifs, donc chaque modalité Voice qualifiée par workspace est accessible pour un runtime secondaire.                                                                                                                                                                                                                                                                                                                                 |
| `workspace_qualified_memory`      | ACP HTTP et les runtimes multi-workspace sont actifs, donc les routes de mémoire gérée qualifiées par workspace peuvent sélectionner une lane de tâches par workspace pour les opérations remember, forget et dream.                                                                                                                                                                                                                                                                                               |
| `client_mcp_over_ws`              | le daemon accepte les serveurs MCP hébergés par le client sur le WebSocket ACP. C'est un opt-in explicite, pas requis pour le chemin de tunnel CDP.                                                                                                                                                                                                                                                                                                                                                              |
| `cdp_tunnel_over_ws`              | le daemon expose le tunnel WebSocket inversé `/cdp`, soit par opt-in explicite soit parce qu'une origin d'extension Chrome est autorisée. Cela signifie uniquement que le tunnel existe ; cela ne signifie pas que les outils MCP Chrome DevTools sont enregistrés.                                                                                                                                                                                                                                               |
| `browser_automation_mcp`          | ACP HTTP est activé, `cdp_tunnel_over_ws` est actif, aucun bearer token ne bloque `/cdp`, et `QWEN_CDP_MCP_COMMAND` nomme un adaptateur MCP stdio externe. Le package CLI principal ne bundle pas d'adaptateur d'automatisation de navigateur ; sans ce tag, le chat side-panel d'extension Chrome peut encore fonctionner, mais les outils console/network/screenshot/click ne sont pas enregistrés par défaut.                                                                                                  |
| `voice_transcribe`                | le point de terminaison Voice WebSocket est monté ; un modèle Voice configuré est toujours requis pour une transcription réussie.                                                                                                                                                                                                                                                                                                                                                                                  |
| `realtime_voice`                  | le daemon WebShell macOS a Live Voice activé et l'intégration Host native active. `/live/status` rapporte la readiness, mais la capacité est retirée jusqu'à ce que la fonctionnalité soit activée.                                                                                                                                                                                                                                                                                                                |
<!-- conditional-serve-features:end -->

`mcp_guardrails` n'est **pas** dans ce tableau conditionnel — c'est un tag toujours actif, annoncé chaque fois que le binaire prend en charge les nouveaux champs de budget `/workspace/mcp`, que l'opérateur ait configuré un budget ou non. Les opérateurs qui n'ont pas défini `--mcp-client-budget` reçoivent tout de même les nouveaux champs (avec `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) annonce les événements push SSE typés qui signalent les franchissements d'état du budget MCP sans boucle de polling. Deux types de trames arrivent sur `GET /session/:id/events` :

- `mcp_budget_warning` — se déclenche une fois lors du franchissement à la hausse du seuil de 75 % de `reservedSlots.size / clientBudget`. Ne se réarme que lorsque le ratio redescend sous les 37,5 % (`MCP_BUDGET_REARM_FRACTION`). Reprend l'hystérésis de `slow_client_warning` de la PR 10, mais au niveau du manager plutôt qu'au niveau du backlog par abonné. Payload : `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Se déclenche dans les modes `warn` et `enforce` ; jamais en mode `off`.
- `mcp_child_refused_batch` — se déclenche à la fin de chaque passage de `discoverAllMcpTools*` lorsqu'un ou plusieurs serveurs ont été refusés, ET sous forme de batch de longueur 1 sur le chemin de refus de lazy-spawn de `readResource`. Payload : `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` est littéralement `'enforce'` car le mode `warn` ne refuse jamais.

Ces deux événements résident dans l'anneau de relecture SSE par session (ils portent un `id`), de sorte qu'un client qui se reconnecte avec `Last-Event-ID` reprend à travers eux ; le snapshot sur `GET /workspace/mcp` reste la source de vérité pour l'état après une déconnexion prolongée. Toujours actifs une fois annoncés — il n'y a pas de bascule conditionnelle. L'état du reducer SDK (`DaemonSessionViewState`) expose `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` pour les adaptateurs qui souhaitent une interface utilisateur simple de type lag.

## Routes

Les clients peuvent détecter `session_turn_status` et interroger `GET /session/:id/turns/current` ou `GET /session/:id/turns/:promptId`. Ces routes nécessitent la session propriétaire live et ne chargent ni ne scrutent un autre workspace. Les résultats réglés sont des enregistrements de transcription best-effort lus depuis la branche active avec un scan borné ; `prompt_not_found` signifie qu'aucun résultat n'a été trouvé dans la file live, la superposition terminale de 64 entrées ou la fenêtre active bornée. `resultText` est la réponse finale brute du modèle parent après la dernière limite d'outil, avant une réécriture optionnelle de message, et peut être absent. Les résultats dépassant 32 768 unités de code UTF-16 incluent `resultTruncated: true` et `resultCode: "RESULT_TEXT_TRUNCATED"`.

### `GET /health`

Sonde de liveness. La forme par défaut renvoie `200 {"status":"ok"}` si le listener est actif — peu coûteux, sans accès au bridge, adapté aux sondes de liveness k8s/Compose à haute fréquence.

Passez `?deep=1` (accepte aussi `?deep=true` ou simplement `?deep`) pour une sonde à l'échelle du daemon qui agrège les **compteurs** du bridge à travers chaque runtime workspace géré, y compris un workspace encore en drainage (informatif uniquement, pas une véritable vérification de liveness) :

```json
{
  "status": "ok",
  "workspaceCount": 2,
  "sessions": 3,
  "pendingPermissions": 1,
  "activePrompts": 1,
  "activeWork": true,
  "activeWorkReporting": "full",
  "activeWorkStaleMs": 4200,
  "connectedClients": 2,
  "channelAlive": true,
  "lastActivityAt": "2026-07-15T08:30:00.000Z",
  "idleSinceMs": 120000
}
```

`sessions`, `pendingPermissions` et `activePrompts` sont des sommes. `activeWork` est vrai lorsque tout runtime a un prompt accepté mais non réglé (y compris un prompt en attente FIFO), un Agent en arrière-plan en cours d'exécution, une notification de terminal d'Agent en file/en cours, ou du travail de shell en arrière-plan géré par la Session. Le travail de shell reste actif tant que le registre de shells rapporte une entrée en cours d'exécution et tant que sa notification de terminal est en file ou pilote la continuation parente ; un nombre quelconque de shells contribue à une seule retenue agrégée bornée. Les Monitors, workflows, cron jobs, suggestions de suivi et processus externes que le registre de shells ne peut plus suivre restent en dehors du champ. Il est limité aux sessions : le travail au niveau du canal sans session encore attachée — un spawn en cours, une restauration en attente, une découverte ou une authentification MCP — n'est pas compté, donc `activeWork` peut être faux alors que le daemon refuse toujours de récupérer ce canal. Ne lisez pas ce champ comme « le daemon est récupérable » ; il décrit uniquement le travail possédé par une session. `activeWorkReporting` indique quelle partie de ce booléen est réellement garantie : `full` lorsque chaque session live est couverte par un rapport frais d'un enfant qui rapporte toutes les catégories, `none` lorsqu'aucune session ne l'est, `partial` pour tout ce qui se trouve entre les deux — y compris un snapshot périmé ou un ancien enfant qui n'a jamais reconnu la capacité. Un snapshot de plus de trois intervalles de rapport cesse de compter comme une couverture : ce n'est pas un rapport indiquant que la session est inactive, donc la session revient à une lecture conservée, exactement comme si l'enfant n'avait jamais rapporté. `activeWorkStaleMs` est l'âge du plus ancien snapshot sur lequel le booléen s'appuie **parmi les sessions couvertes**, et est `0` lorsqu'aucune session n'est couverte ; il est diagnostique, car la fraîcheur est déjà graduée dans `activeWorkReporting` par le daemon (seul le daemon connaît la cadence négociée de chaque canal). Le grade est calculé une fois sur chaque runtime géré plutôt que par runtime puis combiné — un runtime sans sessions est vacuellement complet, et traiter cela comme une preuve permettrait à un workspace vide de se porter garant des sessions non rapportées d'un autre workspace. `lastActivityAt` est l'heure d'activité la plus récente non nulle d'un workspace et `idleSinceMs` est dérivé de ce même snapshot. `channelAlive` signifie qu'au moins un canal workspace géré est actif ; cela ne signifie pas que chaque workspace est sain. `connectedClients` et le `rateLimitHits` optionnel restent des compteurs à l'échelle du daemon plutôt que des sommes par workspace.

Les contrôleurs de redémarrage doivent traiter le daemon comme occupé lorsque :

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

Supprimer le troisième terme rend `activeWork === false` indiscernable de « aucun enfant ne m'a rien dit », ce qui est le seul cas où agir dessus n'est pas sûr. Les réponses inconnues et les sondes échouées doivent également empêcher le redémarrage. `activePrompts` reste un signal de compatibilité indépendant.

Ces champs sont un cache d'observation, pas un bail de redémarrage : même une réponse fraîche, entièrement graduée et vide décrit le moment où elle a été échantillonnée, et le travail peut commencer immédiatement après. La règle ci-dessus réduit substantiellement le risque d'un mauvais redémarrage mais ne l'élimine pas — une sécurité stricte nécessite une barrière de préparation au redémarrage qui arrête l'admission de nouveau travail, confirme le drainage, puis seulement arrête le système.

> ⚠️ La sonde profonde (deep probe) est **informatif**, pas une véritable vérification de liveness ni un bail de réclamation atomique. Les enfants ACP négociés publient des snapshots de travail actif à l'échelle du canal sur une cadence négociée, et le daemon gradue leur fraîcheur dans `activeWorkReporting` — mais il ne tue jamais un canal pour un rapport manquant, car le silence d'une session n'est pas une preuve que le processus est mort. La liveness du transport et la détection d'Agent bloqué sont des mécanismes séparés. `connectedClients` compte les connexions REST SSE, pas chaque transport ACP. Utilisez des échantillons répétés et l'arrêt gracieux pour la réclamation d'inactivité ; utilisez `/daemon/status` authentifié pour les diagnostics par transport et par workspace. Si un getter d'un runtime géré lève une exception, la sonde profonde échoue strictement avec `503 {"status":"degraded","reason":"aggregation_failed"}` plutôt que de renvoyer des totaux partiels, et le log du daemon identifie le runtime workspace en échec. Pendant le bootstrap, avant que le registre de runtimes ne soit prêt, elle renvoie `503 {"status":"degraded","reason":"bootstrap"}` avec `Retry-After: 1`. Pour la liveness du listener, utilisez le `/health` par défaut sans `?deep`.

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
    "maxSessions": 32,
    "maxTotalSessions": null,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "compactedReplayMaxBytes": 4194304,
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

Les réponses multi-workspace incluent également des lignes `workspaces[]` de premier niveau avec
`{ id, cwd, displayName?, primary, trusted }`. Le nom d'affichage optionnel est
omis lorsqu'il n'est pas défini et reste purement présentationnel ; les consommateurs de statut doivent continuer
à utiliser `id` ou `cwd` pour corréler les runtimes.

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

`limits.memory` est additif et rapporte les valeurs mémoire résolues du daemon : un `enforced: false` requis, un objet `childHeap` (`mode` ; `maxConcurrentChildren` et `perChildCeilingMb`, tous deux `null` sous `mode: 'off'`, qui ne modélise rien — et `perChildCeilingMb` en plus `null` partout où aucune partition ne peut être modélisée dans `modeled.minChildHeapMb` — soit le pool ne peut pas couvrir un enfant à ce plancher, soit le plafond se retrouverait sous le plancher une fois plafonné à `modeled.legacyChildCeilingMb`, qui est `floor(available / 2)` et donc descend sous le plancher sur un hôte en dessous de 1024 Mo. Il n'est jamais à 0, et `maxConcurrentChildren` est `0` dans ces cas, car un hôte qui ne modélise aucune partition est une réponse calculée plutôt qu'un modèle absent ; et `refusals`, les spawns qui auraient dépassé la limite modélisée), `configuredBudgetMb`, `effectiveBudgetMb` (la valeur configurée plafonnée à la mémoire cgroup/hôte résolue), `budgetSource` (`flag` / `derived`), `availableMemoryMb`, `availableMemorySource` (`constrained` / `host`), `insufficientMemory`, et un objet `modeled` contenant `rootReserveMb`, `childPoolMb`, `minChildHeapMb`, `maxChildHeapMb`, et `legacyChildCeilingMb` (un modèle conservateur du plafond qu'un enfant ACP reçoit aujourd'hui, qui peut être inférieur à la valeur réelle). `runtime.memory` rapporte en plus `registeredWorkspaces` (le compteur d'enregistrements — les entrées de workspace non supprimées, y compris celles en drainage, transition ou bloquées ; pas un compteur d'enfants live), `activeAcpChildren` (enfants ACP gérés par le daemon avec un canal live et non-dying — inclut les entrées en transition ou bloquées, mais exclut un workspace dont le kill a commencé même si l'enfant n'a pas quitté ; pas les channel workers, descendants MCP ou réservations de spawn non attachées), `childRssCoverage` (`active_children` — chaque enfant ACP avec un canal live, qui est l'ensemble compté par `activeAcpChildren` ; les anciens daemons envoient `primary_only`), un objet `children` décrit ci-dessous, et un objet `modeled` contenant `recommendedShareAtRegisteredMb` (`null` lorsqu'aucun workspace n'est enregistré) et `recommendedShareAtActiveMb` (`null` lorsqu'aucun enfant n'est actif). Chaque partage est plafonné au plafond hérité de l'enfant, et planché au minimum child heap uniquement lorsque le plafond le permet — sur un petit hôte le plafond est sous le plancher, donc partage × nombre peut dépasser le pool enfant. Lisez un partage comme consultatif, pas comme une partition du pool. Tout cela est de l'observation : aucun argument de spawn enfant ne dérive de ces valeurs, et aucune requête n'est refusée sur leur base. `childHeap` modélise une partition fixe de `modeled.childPoolMb` — chaque enfant recevrait le même `perChildCeilingMb`, donc le total modélisé reste dans le pool plutôt que de s'accumuler comme un partage par spawn le ferait. Lisez `refusals` comme une pression d'admission uniquement : un compte de 0 ne signifie **pas** que la partition est sûre à appliquer, car les enfants fonctionnent sur le plafond beaucoup plus grand dérivé de l'hôte, donc une charge nécessitant plus de old space que `perChildCeilingMb` est saine ici et échouerait uniquement une fois la partition appliquée. Deux autres raisons pour lesquelles un compte non nul ne signifie pas nécessairement une pression de capacité : la décision d'admission compte un enfant en terminaison jusqu'à sa sortie effective, donc sur un daemon déjà à `maxConcurrentChildren` chaque remplacement de canal réserve un refus pendant la fenêtre de chevauchement ; et sur un hôte trop petit pour modéliser une partition `maxConcurrentChildren` est `0`, donc `refusals` est égal au nombre total de spawns ACP, avec `insufficientMemory` comme champ qui l'explique. Sur le chemin normal `runQwenServe` le budget est résolu avant que l'app bootstrap soit créée, donc `limits.memory` est déjà peuplé pendant la fenêtre bootstrap. Il est `null` uniquement sur les chemins qui ne résolvent pas de budget (comme le bypass direct-embed contournant `runQwenServeImpl`). Le type SDK autorise `null`, donc les clients corrects s'en accommodent.

`runtime.memory.children` est additif dans ce bloc et rapporte le RSS agrégé à travers les enfants nommés par `childRssCoverage` : `rssBytes` (leur RSS auto-déclaré sommé), `sampled` (combien ont produit une lecture), et `oldestReadingAgeMs` (l'âge de la lecture la plus ancienne dans la somme, pour qu'un appelant puisse savoir à quel point ses parties ont été prises à des moments éloignés). Le dénominateur de `sampled` est le frère `activeAcpChildren`, non répété dans le bloc ; lorsque `sampled` est inférieur, `rssBytes` est un plancher plutôt qu'un total. L'échantillonnage est conditionné par un watcher SSE/WS actif, donc une requête de statut contre un daemon personne ne stream depuis rapporte `sampled: 0` même avec des enfants live — `activeAcpChildren` à côté rend cet écart visible, et `rssBytes: 0` avec `sampled: 0` ne signifie jamais un zéro mesuré. `oldestReadingAgeMs` est `null` lorsque rien n'a été échantillonné et également lorsque chaque contributeur est un bridge antérieur au champ, donc cela ne signifie jamais « frais ». Lisez la somme comme un sur-compte et un sous-compte à la fois : sommer le RSS par processus double-compte les pages que les enfants partagent, tandis que chaque enfant rapporte uniquement son propre processus, donc ses descendants MCP et chaque channel worker sont absents. Ce n'est pas la mémoire de l'arbre du daemon. Le champ est optionnel dans le miroir SDK car les daemons rapportant `primary_only` ne l'envoient jamais.

`runtime.memory.children.heap` est additif dans ce bloc et rapporte les high-water marks de la vieille génération V8 à vie de chaque enfant ACP, agrégés en un **maximum, pas une somme** : `peakOldGenerationBytes`, `peakLiveSetBytes`, `peakTotalHeapBytes`, `majorGcCount`, `majorGcMs`, `unclassifiedSpaceNames`, et `reported`. Un plafond de heap s'applique par enfant et les pics ont été atteints à des moments différents, donc une somme ne répondrait à aucune question ; chaque champ est un maximum indépendant à travers les enfants rapporteurs, pas le portrait d'un seul enfant, et un plafond par enfant est évalué contre chaque axe individuellement. `reported` compte combien de `sampled` ont contribué, et est plus bas lorsque certains enfants précèdent les champs. Chaque valeur en octets couvre la **vieille génération** — ce que `--max-old-space-size` limite réellement — et non `old_space` seul, car un enfant peut épuiser son plafond avec `old_space` à quelques mégaoctets tandis que `large_object_space` contient tout. `peakOldGenerationBytes` est les octets commités et monte avec le plafond attribué à l'enfant, donc lisez-le comme une borne supérieure de ce dont la charge de travail a besoin plutôt que comme son besoin réel ; `peakLiveSetBytes` est ce qui survit à un GC majeur et ne bouge pas avec le plafond, ce qui en fait la valeur capable de dire qu'un enfant ne peut pas tenir ; lisez-le comme une borne supérieure plutôt qu'un ensemble live exact, car les entrées GC arrivent de manière asynchrone et tout ce qui est alloué entre la collection et la lecture est compté. `peakLiveSetBytes` est `0` jusqu'à ce qu'un GC majeur soit observé, ce qui est une absence plutôt qu'une mesure. `unclassifiedSpaceNames` est l'union des espaces heap qu'aucun enfant rapporteur n'a pu classifier ; V8 renomme et ajoute des espaces entre les versions, un espace inconnu est retiré des sommes, et le retrait sous-compte — donc un tableau non vide signifie que les valeurs en octets sont incomplètes et ne doivent pas être lues comme une mesure complète. L'objet entier est `null`, jamais un objet à zéro, lorsqu'aucun enfant échantillonné n'en a rapporté ; sans watcher SSE/WS attaché rien n'est échantillonné du tout, donc c'est un état courant plutôt qu'un cas limite. Tout cela est observationnel : rien ici ne dimensionne un enfant, ne refuse un spawn, ni ne fait passer `limits.memory.enforced` de `false`.

`runtime.memory.pressure` est additif dans ce bloc et rapporte la pression mémoire propre du processus racine du daemon : `mode` (`off` / `observe`), `level` (`normal` / `soft` / `hard` / `critical`), `source` (`rss` / `heap` / `unknown`), `ratio`, et les six valeurs brutes d'où proviennent les ratios — `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`. `ratio` est le plus grand de `rssRatio` et `heapRatio`, et `source` nomme lequel c'était ; les égalités sont rapportées comme `rss`. `availableBytes` est `limits.memory.availableMemoryMb` en octets — délibérément la valeur détectée cgroup/hôte plutôt que `effectiveBudgetMb`, car ce qui termine le processus est la limite réelle, pas le numéro de politique d'un opérateur. `source: "unknown"` signifie qu'aucun dénominateur n'était mesurable et ne doit pas être lu comme sain ; `level` est `normal` dans ce cas uniquement car il n'y a rien à classifier. Les valeurs couvrent le **processus racine du daemon uniquement** : c'est le propre `memoryUsage()` de ce processus, donc la croissance des enfants ne les déplace pas. `runtime.memory.children` rapporte ceux-ci séparément, et aucune valeur n'est la mémoire de l'arbre de processus. Les deux modes rapportent le bloc entier ; seul `observe` soulève en plus l'avertissement sans chemin `daemon_memory_pressure` dans le rollup de statut, donc `off` laisse le `status` de haut niveau inchangé. Rien ne remédie dans l'un ou l'autre mode. Le champ est optionnel dans le miroir SDK car les daemons qui ont livré `runtime.memory` avant son existence envoient le bloc sans lui.

`limits.maxTotalSessions` est additif. `null` signifie que le plafond effectif de sessions fraîches à l'échelle du daemon est désactivé. Lorsque plusieurs workspaces de démarrage/restaurés sont présents, que `--max-total-sessions` est omis, et que `maxSessionsPerWorkspace` est fini, le daemon dérive le plafond total effectif une fois comme `maxSessionsPerWorkspace * startupWorkspaceCount` ; un enregistrement dynamique ultérieur ne le recalcule pas. Lorsqu'il est défini, il limite la création de sessions fraîches à travers le daemon et rapporte les échecs de limite totale avec la forme d'erreur `session_limit_exceeded` existante plus `scope: "total"`.

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
`lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures`, et
`startupFailuresTruncated`. Chaque échec de démarrage a `channel`, `phase`
(actuellement `connect`), un `code` optionnel fourni par l'adaptateur, et un `message`
avec identifiants caviardés. Au maximum 64 échecs sont conservés pour la génération
actuelle du worker ; le flag de troncature signifie que plus d'échecs ont été observés. `code` est
diagnostique et n'est pas une classification stable inter-adaptateurs. `restartCount` est le nombre total de tentatives de redémarrage effectuées par ce processus serve au cours de sa durée de vie ; un worker en cours d'exécution avec
`restartCount > 0` est sain sauf si un autre problème s'applique. Un worker en cours d'exécution
dont les `requestedChannels` incluent des noms absents de `channels` rapporte
`channel_worker_partial_connect`.

Sur un daemon multi-workspace (`--workspace` répété), `runtime` inclut en plus
`channelWorkers[]` — une entrée par workspace propriétaire, chacun étant un
snapshot `channelWorker` annoté de `workspaceId`, `workspaceCwd`, et
`primary`. `channelWorker` reste peuplé comme snapshot du workspace principal
pour la compatibilité. Les daemons mono-workspace omettent `channelWorkers[]`.

### Contrôle de canal géré par le daemon

La capacité `channel_control` annonce la ressource de sélection runtime.
La ressource est à l'échelle du daemon même si son chemin de compatibilité utilise le
préfixe singulier `/workspace`. Les sélections runtime ne sont pas persistées et ne
modifient pas l'option `--channel` de démarrage du daemon.

`GET /workspace/channel` renvoie un snapshot immuable du manager :

```json
{
  "enabled": true,
  "selection": { "mode": "names", "names": ["telegram", "feishu"] },
  "pendingSelection": { "mode": "names", "names": ["telegram"] },
  "transition": "reconciling",
  "workers": [
    {
      "workspaceId": "primary-id",
      "workspaceCwd": "/work/primary",
      "primary": true,
      "enabled": true,
      "state": "running",
      "channels": ["telegram"],
      "pid": 1234
    }
  ]
}
```

`selection` est `null` lorsque désactivé. `pendingSelection` n'est présent que pendant
une mutation. `transition` est l'un des suivants : `idle`, `starting`, `reconciling`,
`stopping`, ou `rolling_back`.

`PUT /workspace/channel` est soumis à la gate stricte et accepte exactement une sélection :

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

Les noms sont rognés et dédupliqués sans tri ; un tableau de noms vide est
invalide. `all` reste limité au workspace principal. Un changement désactivé-vers-activé
renvoie `201` ; un PUT idempotent ou un remplacement renvoie `200`. La réponse est
`{ changed, replaced, partial, state }`. Une sélection égale maintient les workers sains
en place, mais récupère une sélection égale dont le worker est arrêté ou
en échec.

`DELETE /workspace/channel` est soumis à la gate stricte et idempotent. Il renvoie
`{ changed, state }` ; un état réussi est disabled. `POST
/workspace/channel/reload` est également soumis à la gate stricte et relit les paramètres,
re-résout les groupes de workspaces, et réconcilie de force la sélection commitée.
Il renvoie `409 channel_worker_not_enabled` lorsque désactivé. La
capacité `channel_reload` est annoncée dynamiquement uniquement lorsque le manager
a une sélection commitée et rechargeable.

Chaque activation, remplacement, rechargement, arrêt et arrêt du daemon entre dans une
lane de cycle de vie FIFO. GET n'attend pas cette lane. Les groupes de workspaces dont la
sélection ordonnée n'a pas changé restent en ligne. Les échecs de remplacement tentent d'arrêter
les workers nouvellement démarrés et de restaurer la sélection commitée précédente. Les clients
doivent inspecter `rolledBack`, `rollbackError`, et `state` car le nettoyage ou
la restauration peuvent aussi échouer. Le daemon conserve le bail PID du service de canal
tout au long d'une transaction et ne le libère pas tant que chaque sortie enfant
pertinente n'est pas confirmée.

Les erreurs de contrôle stables sont :

- `400 invalid_channel_selection`, `channel_workspace_mismatch`, ou `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict` ou `channel_worker_not_enabled`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`, avec `rolledBack` et un `rollbackError` optionnel avec identifiants caviardés
- `503 daemon_draining`

Les écritures strictes contre un daemon sans token configuré renvoient `401
token_required` avant l'exécution du code de contrôle. Une fois qu'une requête commence, déconnecter
le client HTTP n'annule pas la transaction de cycle de vie ; les clients peuvent réessayer
le même PUT en toute sécurité.

Pour `502 channel_worker_start_failed`, la réponse peut également inclure
`startupFailures[]` et `startupFailuresTruncated`. Chaque échec ajoute le
`workspaceCwd` de confiance du worker tenté. Ces champs décrivent la
transaction échouée, tandis que `state` décrit l'état actuel après rollback ;
un GET ultérieur ne conserve pas la tentative échouée. Un worker partiellement connecté
renvoie plutôt le succès et expose ses échecs dans le snapshot du worker. L'échec
de démarrage au moment du boot interrompt toujours `qwen serve` avant qu'un daemon interrogeable n'existe.

`qwen channel status` sans `--daemon-url` continue de lire les métadonnées du pidfile ;
avec `--daemon-url` il lit `GET /workspace/channel`. Pendant une fenêtre de redémarrage, le pidfile appartenant à serve reste réservé, mais `workerPid` est omis afin que les clients n'affichent pas un processus worker périmé. Sur un daemon multi-workspace le pidfile porte également un tableau additif `workers[]` (par workspace
`workspaceId` / `workspaceCwd` / `channels` / `workerPid` live) tandis que le
`channels` de premier niveau (union) et `workerPid` (principal) restent peuplés pour les anciens
lecteurs ; les daemons mono-workspace conservent la forme originale à worker unique. Worker
stdout/stderr sont transférés dans le log du daemon, les bearer tokens, les valeurs sensibles de l'environnement du worker et les identifiants de l'URL du proxy étant caviardés.

### Gestion de canal workspace

La capacité `channel_management` annonce la configuration de canal à l'échelle du workspace
et la gestion runtime. Les routes singulières `/workspace` ciblent
le runtime principal. `/workspaces/:workspace` résout le runtime enregistré et de confiance exact
et ne revient jamais au runtime principal.

La découverte en lecture seule utilise :

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`

Le catalogue marque les types pris en charge par cette API de gestion avec
`manageable: true`. Les snapshots d'instance incluent une révision, des métadonnées de présence
de secret caviardées, l'état de démarrage et l'état runtime ; les secrets littéraux ne sont
jamais renvoyés. Les snapshots de canal utilisent `Cache-Control: no-store`.

Les descripteurs de champs peuvent exposer des métadonnées d'objets imbriqués via `properties`.
Les descripteurs numériques peuvent utiliser `exclusiveMinimum` pour des bornes inférieures ouvertes. Les clients
qui ne rendent pas un type de champ annoncé doivent préserver sa valeur de configuration
existante au lieu de la coercer ou de la supprimer. Les champs objets ne peuvent pas être requis,
et les propriétés imbriquées ne peuvent pas être des secrets ou des champs résolus par l'environnement ;
ces protocoles de gestion restent au niveau supérieur uniquement. Une propriété `required` imbriquée
est appliquée uniquement tant que son objet parent est présent dans l'écriture ; omettre l'objet
parent laisse ses exigences imbriquées non vérifiées. Les écritures remplacent la valeur stockée
de chaque champ en entier, donc préserver un objet signifie renvoyer l'objet stocké ; le daemon
ne fusionne pas les objets partiels.

Les écritures de configuration utilisent la concurrence optimiste et la gate stricte de bearer token :

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- les routes équivalentes `/workspaces/:workspace/...`

Chaque mutation de paramètres inclut `expectedRevision`. Les requêtes upsert contiennent un
objet `config` et peuvent contenir des opérations de secret explicites : `preserve`,
`replace`, ou `clear`. Une configuration de canal ne peut pas sélectionner un répertoire de travail
en dehors du workspace résolu.

Les actions runtime sont des requêtes `POST` soumises à la gate stricte vers
`.../channels/:name/start`, `stop`, ou `restart`. Elles opèrent uniquement sur le
worker possédé par le workspace résolu.

La gestion de pairing est disponible uniquement pour les instances configurées avec la
politique d'expéditeur `pairing` ou la politique de groupe :

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` avec `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` avec
  soit `{ "senderId": "..." }` ou `{ "groupId": "..." }`

Toutes les routes de pairing nécessitent un bearer token et utilisent `Cache-Control: no-store`.
Les demandes, approbations et révocabations sont limitées à l'instance de canal sélectionnée
et au workspace. Les demandes en attente incluent un sujet utilisateur ou groupe typé ;
les demandes de groupe conservent également l'expéditeur qui a initié la demande. Les snapshots
d'approbations contiennent des `senderIds` et des `groupIds` car les listes d'autorisation ne
persistent pas les noms d'affichage. Révoquer un utilisateur ou un groupe inconnu renvoie
`404 channel_pairing_approval_not_found`.

### Livraison de canal et Notify

`channel_delivery` annonce la prise en charge de la livraison immédiate et best-effort. C'est une
capacité de protocole, pas un signal de santé du worker. La livraison ne démarre jamais un
worker manquant, ne revient pas à un autre workspace, ne réessaie pas, ne persiste pas de boîte d'envoi,
et ne rejoue pas de notifications historiques.

Notify direct contourne Agent et Session et attend une tentative d'envoi :

```http
POST /workspace/notify
POST /workspaces/:workspace/notify
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "service unavailable",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

Les deux routes utilisent la gate de mutation stricte. La route qualifiée résout uniquement un
workspace enregistré et de confiance. Le succès est `200 {delivered:true,deliveryId}`.
`delivered:true` signifie que la promesse d'envoi Channel s'est résolue ; cela ne prouve
pas l'acceptation par le fournisseur, la réception par l'utilisateur ou un accusé de lecture. La
validation de réponse spécifique au fournisseur et la sémantique de raison d'erreur cohérente entre les adaptateurs IM
sont hors de ce contrat V1.
Les erreurs sont `400 channel_delivery_invalid`, `503 channel_worker_unavailable` ou
`channel_delivery_queue_full`, `504 channel_delivery_timeout`, et `502
channel_delivery_rejected` ou `channel_delivery_failed`. Un timeout a un
résultat inconnu et n'est pas réessayé.
Il n'y a intentionnellement pas de point de terminaison de test de connectivité séparé : un appel
Notify normal est le test de bout en bout.

L'événement de résultat rejouable contient uniquement la corrélation et le statut sanitizé :

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "failed",
    "promptId": "prompt-1",
    "code": "channel_worker_unavailable",
    "error": "Channel worker is not running."
  }
}
```

Un Prompt final réussi vide omet les champs d'erreur :

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "skipped",
    "promptId": "prompt-1"
  }
}
```

`source` est `prompt` ou `scheduled` ; `status` est `delivered`, `failed`, ou
`skipped`. `skipped` signifie que le tour éligible s'est terminé avec succès mais son
dernier bloc de réponse assistant sans outil était vide ou ne contenait que des espaces. Le
daemon consomme l'autorisation de livraison et publie l'événement sans
résoudre de Channel Worker. La corrélation planifiée utilise `taskId` et `firedAt`.
L'événement ne contient jamais d'IDs de cible, de texte de message, d'identifiants ou de secrets
de webhook.

Sécurité : la réponse n'inclut jamais de bearer tokens, d'ids client, d'ids de connexion ACP complets, de codes utilisateur device-flow ou d'URL de vérification. Les deux niveaux de détail peuvent inclure des `daemon.runId`, `daemon.logMode` et
`daemon.logHealth` additifs. `summary` omet le chemin du log du daemon et les détails de perte ; `full` peut inclure `logPath`, `logIssues`, `logDroppedRecords`, et
`logDroppedBytes` pour les opérateurs authentifiés. La journalisation de fichiers dégradée ajoute l'avertissement `daemon_log_degraded` sans chemin au rollup de statut normal.

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": [
    "health",
    "daemon_status",
    "capabilities",
    "multi_workspace_sessions",
    "..."
  ],
  "limits": {
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 64,
    "sessionRestoreTimeoutMs": 60000
  },
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/primary-workspace",
  "workspaces": [
    {
      "id": "stable-workspace-id",
      "cwd": "/canonical/path/to/primary-workspace",
      "primary": true,
      "trusted": true
    },
    {
      "id": "stable-secondary-workspace-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "primary": false,
      "trusted": true
    }
  ]
}
```

Contrat stable : lorsque `v` s'incrémente, la disposition de la trame a changé de manière rétro-incompatible.

> **`protocolVersions`** décrit les versions du protocole serve que le daemon peut parler. `current` est la version de protocole préférée du daemon et `supported` est l'ensemble compatible. Les clients qui nécessitent un protocole spécifique doivent vérifier `supported` ; les interfaces utilisateur spécifiques à une fonctionnalité doivent toujours se baser sur `features`. Additif pour v=1 : les anciens daemons v=1 omettent ce champ, les clients SDK qui ciblent d'anciennes builds doivent donc le traiter comme optionnel.

> **`modelServices` est toujours `[]` dans la Stage 1.** L'agent utilise son service de modèle unique par défaut et ne l'énumère pas sur le réseau. La Stage 2 remplira ce champ à partir des adaptateurs de modèle enregistrés afin que les clients SDK puissent construire des sélecteurs de service ; d'ici là, ne vous fiez PAS au fait que ce champ soit non vide.

> **`workspaceCwd`** est le chemin absolu canonique du workspace principal du daemon. Utilisez-le pour omettre `cwd` sur `POST /session` (la route revient à ce chemin principal) et pour maintenir la compatibilité des anciens clients mono-workspace. Additif pour v=1 : les daemons v=1 antérieurs au §02 omettent le champ — les clients qui ciblent d'anciennes builds doivent vérifier la nullité avant de le consommer.

> **`workspaces[]`** liste chaque runtime enregistré. Les nouveaux daemons mono-workspace incluent le runtime principal même lorsque `multi_workspace_sessions` est absent afin que les clients puissent découvrir l'id stable requis par les routes qualifiées par workspace ; les anciens daemons peuvent omettre le tableau. Chaque entrée est `{ id, cwd, displayName?, primary, trusted, removable? }`. `displayName` est purement présentationnel et omis lorsqu'il n'est pas défini. Le premier/premier workspace reste reflété par `workspaceCwd` ; les nouveaux clients choisissent un runtime non principal en passant le `cwd` de cette entrée à `POST /session`. Les workspaces non fiables sont annoncés pour le diagnostic mais rejettent la création de session fraîche avec `403 untrusted_workspace` jusqu'à ce que la confiance change. `removable` est présent sur les daemons qui prennent en charge le retrait de runtime et est vrai uniquement pour les runtimes secondaires dynamiques ou restaurés par persistance.

Les tags de fonctionnalité workspace et `workspaces[]` sont dynamiques. Les clients qui ajoutent un workspace doivent récupérer à nouveau `/capabilities` après la fin de la mutation ; le daemon ne diffuse pas les changements de capacité aux clients qui ont mis en cache une réponse antérieure. Oublier la persistance ne décharge pas un runtime actif, donc ce runtime reste annoncé jusqu'au redémarrage.

### `POST /workspaces`

Enregistrer un runtime workspace supplémentaire. Le chemin doit être un répertoire absolu existant, accessible, qui ne duplique pas ou n'imbrique pas avec un autre workspace enregistré. L'enregistrement est local au processus sauf si le client envoie `persist: true` ; les clients doivent pré-vérifier `persistent_workspace_registration` avant de demander la persistance. Lorsque `workspace_display_name` est annoncé, la requête peut également inclure un `displayName` optionnel.

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

Un runtime nouvellement créé renvoie `201` ; promouvoir un workspace secondaire déjà actif en persistant renvoie `200`. Le succès persistant inclut `persisted: true` :

```json
{
  "id": "stable-workspace-id",
  "cwd": "/canonical/path/to/secondary-workspace",
  "displayName": "Payments Production",
  "primary": false,
  "trusted": true,
  "persisted": true
}
```

`displayName` doit être une chaîne d'au plus 256 caractères après suppression des espaces entourants. Un résultat vide est traité comme aucun nom, et les caractères de contrôle C0 internes (`U+0000`–`U+001F`) ou DEL (`U+007F`) sont rejetés. JSON `null` n'est pas une valeur de création et renvoie `400 invalid_display_name` ; omettez le champ pour ne pas fournir de nom initial. Les noms d'affichage en double sont autorisés. Un nom fourni avec un enregistrement local au processus ne dure que pour ce processus daemon ; `persist: true` le stocke avec l'enregistrement persistant pour qu'il puisse être restauré après redémarrage. Répéter la requête pour un workspace déjà persistant est idempotent et ne le renomme pas.

Les erreurs incluent `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached`, `500 workspace_registration_store_error` / `runtime_creation_failed`, et `501 persistence_not_available` / `not_implemented`.

### `PATCH /workspaces/:workspace`

Mettre à jour une ressource workspace active sélectionnée par ID de workspace ou cwd absolu encodé en URL. Le point de terminaison ne prend actuellement en charge que les métadonnées de nom d'affichage :

```json
{ "displayName": "Payments Production" }
```

Envoyez `{ "displayName": null }` pour effacer le nom. Ici `null` est une sentinelle de suppression uniquement pour la mise à jour ; les valeurs non nulles suivent les mêmes règles de normalisation de chaîne que `POST /workspaces`. La réponse est la projection workspace mise à jour `{ id, cwd, displayName?, primary, trusted, removable? }`. Les métadonnées runtime sont toujours mises à jour. Si le runtime a des identités d'enregistrement persistant correspondantes, chaque alias est mis à jour de manière atomique via le store d'enregistrement schema-v1 existant ; le point de terminaison ne crée ni ne promeut jamais un enregistrement persistant.

Les champs non pris en charge échouent strictement plutôt que d'être ignorés silencieusement. Les erreurs incluent `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error`, et `503 daemon_shutting_down`.

### `DELETE /workspaces/:workspace`

Supprimer un runtime secondaire supprimable. Le sélecteur suit les règles de routage workspace pluriel et accepte soit un ID de workspace soit un cwd absolu encodé en URL. Le corps JSON optionnel est `{ "force": boolean }` ; l'omettre demande une suppression sans force.

La suppression sans force renvoie `409 workspace_busy` avec un snapshot `activity` lorsque le runtime gelé a des sessions, des prompts, des démarrages en attente, des connexions ACP, des tâches mémoire ou des channel workers workspace. Envoyer `{ "force": true }` demande la terminaison de ces ressources. La suppression de persistance est le point de commit : le nettoyage ultérieur est borné et best-effort, les échecs de nettoyage sont journalisés, et la suppression logique converge toujours au lieu de restaurer le runtime. Une réponse réussie est :

```json
{
  "removed": true,
  "workspaceId": "stable-workspace-id",
  "workspaceCwd": "/canonical/path/to/secondary-workspace",
  "forced": true,
  "persistedRegistrationRemoved": true,
  "activity": {
    "sessions": 2,
    "activePrompts": 1,
    "pendingSessionStarts": 0,
    "acpConnections": 1,
    "memoryTasks": 0,
    "channelWorkers": 0,
    "voiceSessions": 0
  }
}
```

Une requête sans force immédiatement occupée renvoie un snapshot d'activité de pré-drainage rapide. Une fois le drainage commencé, la réponse occupée ou de succès contient le snapshot final pris après la fermeture des gates d'admission et de drainage ACP et avant le début du nettoyage. Les erreurs incluent `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported`, et `503 daemon_shutting_down`.

### `GET /workspace-registrations`

Lister l'ensemble désiré persisté de workspaces pour ce workspace principal. Les entrées restent visibles avec `active: false` lorsqu'un répertoire stocké n'a pas pu être restauré pendant le démarrage en cours.
Une entrée reste `active: true` pendant que son runtime est en drainage car le runtime possède toujours des ressources live jusqu'à ce que le retrait soit terminé.
Les entrées incluent un `displayName` optionnel lorsque l'enregistrement persistant en a un.

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/canonical/path/to/primary-workspace",
  "entries": [
    {
      "id": "stable-registration-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "active": true,
      "persisted": true
    }
  ]
}
```

Renvoie `501 persistence_not_available` lorsqu'aucun store d'enregistrement n'est configuré et `500 workspace_registration_store_error` lorsque le store ne peut pas être lu.

### `DELETE /workspace-registrations/:id`

Oublier un enregistrement persisté. Cela ne décharge pas un runtime actif ni ne termine ses sessions ; `restartRequired: true` signifie que le runtime actif disparaîtra au prochain redémarrage du daemon.

```json
{ "removed": true, "active": true, "restartRequired": true }
```

Renvoie `404 workspace_registration_not_found`, `500 workspace_registration_store_error`, ou `501 persistence_not_available`. Comme les autres routes de mutation, ce point de terminaison nécessite l'authentification de mutation lorsque l'authentification du daemon est activée.

### Routes de statut runtime en lecture seule

Ces routes rapportent des snapshots runtime côté daemon. Ce sont des routes v1 additives,
elles ne mutent pas l'état et ne changent pas la version du protocole serve. Les routes
de statut du workspace ne démarrent intentionnellement **pas** le processus enfant ACP simplement parce
qu'un client interroge une route GET : si le daemon est inactif, elles renvoient
`initialized: false` avec un snapshot vide. Les routes de statut de session nécessitent une
session active et renvoient `404 { code: "session_not_found", ... }` pour les ids inconnus.

Tags de capacité :
- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_monitor_tool_correlation` → les entrées de moniteur de `GET /session/:id/tasks`
  incluent `toolUseId` pour la corrélation transcript-tâche
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` et `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` et `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` rapporte la liveness ponctuelle du canal ACP du workspace principal
sous la forme `{ channelLive: boolean }`. Le handler ne crée pas de canal, mais atteindre une route runtime peut d'abord démarrer un runtime daemon différé, dont la politique de démarrage configurée peut indépendamment préchauffer ACP. Le snapshot n'est pas un bail : les clients doivent laisser la création de session revalider ou démarrer le canal.

### Préchauffage ACP

Tag de capacité : `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N` initialise best-effort le canal ACP du workspace principal. `timeoutMs` est par défaut 5000 et doit être un entier positif ne dépassant pas 60000. Les appelants concurrents et la création de Session partagent la même initialisation de bridge. Un timeout de requête termine uniquement cette attente HTTP ; il n'annule pas l'initialisation partagée.

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` est toujours égal à `channelLive`. Une réponse live omet `reason` et
`error` ; sinon `reason` est `timeout` ou `error`. `durationMs` mesure l'appel HTTP
actuel, pas la durée de vie complète d'une initialisation à laquelle l'appel a participé.
Un timeout opérationnel ou un échec renvoie HTTP 200. Un `timeoutMs` invalide renvoie
400, tandis que les échecs d'authentification, de rate limiting et de runtime différé conservent
leurs réponses normales.

Les deux routes workspace ACP sont singulières et limitées au workspace principal. Les clients
ne doivent pas les utiliser pour un workspace secondaire ni interpréter l'une ou l'autre réponse comme une
garantie de readiness durable.

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
  | 'restore_timeout'
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
`/workspace/env`, et (à terme) les garde-fous MCP, afin que les clients SDK puissent afficher des actions correctives par catégorie au lieu d'analyser des messages de forme libre. Les sept littéraux de statut originaux viennent de #4175 ; `restore_timeout` a été ajouté séparément pour les requêtes de restauration de session. `blocked_egress` reste réservé jusqu'à l'arrivée de la sonde egress.

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

**Garde-fous du client MCP (issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175)).** Les daemons actuels étendent le payload avec quatre champs additifs et une cellule de budget limitée par la capacité :

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
      "scope": "workspace",
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

`budgetMode` prend l'une des valeurs suivantes : `enforce`, `warn` ou `off`. `clientBudget` est absent lorsqu'aucun budget n'a été défini. `budgets[]` est **toujours un tableau** sur les daemons annonçant `mcp_guardrails` (éventuellement vide lorsque `budgetMode === 'off'`) ; les anciens daemons omettent entièrement ce champ. Lorsque `mcp_workspace_pool` est annoncé, la cellule a `scope: 'workspace'` et couvre le pool partagé du runtime workspace sélectionné. Lorsque ce tag est absent, y compris sous `QWEN_SERVE_NO_MCP_POOL=1`, le manager hérité émet `scope: 'session'`. Les consommateurs DOIVENT tolérer des valeurs de `scope` supplémentaires non reconnues.

Le `disabledReason` sur les cellules par serveur distingue la désactivation par l'opérateur (`'config'` — liste de configuration `disabledMcpServers`) du refus pour cause de budget (`'budget'` — découvert mais jamais connecté en raison du mode `enforce`). Les refus sont déterministes selon l'ordre de déclaration de `Object.entries(mcpServers)`. Le `status: 'error', errorKind: 'budget_exhausted'` par serveur masque le `mcpStatus: 'disconnected'` brut (qui est vrai, mais ne représente pas la sévérité côté opérateur).

L'application du budget est pilotée par la capacité. Avec `mcp_workspace_pool`, les sessions à l'intérieur d'un runtime workspace partagent les transports et un `WorkspaceMcpBudget` ; les runtimes workspace différents ne partagent jamais un pool ou un budget. Sans le tag, le `McpClientManager` de chaque session ACP applique sa propre copie du plafond et le snapshot représente cette vue de session héritée.

**Détection de la pression sur le budget.** Deux surfaces, toutes deux peuplées post-PR-14b :

- **Événements push** (annoncés via `mcp_guardrail_events`) : abonnez-vous à `GET /session/:id/events` et filtrez les trames `mcp_budget_warning` / `mcp_child_refused_batch` via `KnownDaemonEvent`. La machine à états se déclenche une fois par franchissement à la hausse du seuil de 75 % (réarmée en dessous de 37,5 %) ; les refus sont fusionnés une fois par passe de découverte en mode `enforce`.
- **Sondage de snapshot** (annoncé via `mcp_guardrails`) : `GET /workspace/mcp` et inspectez la cellule de budget (`budgets[0]`) avec `mcp_workspace_pool` pour déterminer sa portée :

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
      "userInvocable": false,
      "installedPath": "/home/alice/project/.qwen/skills/review/SKILL.md",
      "argumentHint": "[path]"
    }
  ]
}
```

`level` prend l'une des valeurs suivantes : `project`, `user`, `extension` ou `bundled`.
`userInvocable` (booléen, optionnel) est omis pour les skills normaux (signifiant
`true`) et n'est présent que comme `false` lorsque le skill ne peut pas être invoqué manuellement
ni basculé via l'API de skills. `modelInvocable` est indépendant : `false`
signifie que le skill reste disponible manuellement mais est masqué de l'invocation par le modèle.
`installedPath` est le chemin absolu existant vers le `SKILL.md` du skill ; le
daemon le renvoie tel qu'il est stocké sans résoudre séparément les liens symboliques ni
le canoniser. Les daemons actuels l'émettent pour chaque skill, tandis que les clients doivent
tolérer son absence des anciens daemons v1. Les corps de skills, les hooks, `skillRoot`,
et les autres configurations de skills restent exclus. `errors` est omis
lorsque la découverte réussit.

Les lectures répétées sont servies depuis le dernier snapshot workspace commité,
périodiquement revalidées par rapport au cache en mémoire de l'enfant. Une lecture ne
scanne jamais les répertoires de skills ni ne reparse les fichiers `SKILL.md`. L'enfant vérifie
que ses sources d'extensions sont inchangées — un `readdir` du répertoire d'extensions
plus un `stat` par entrée, le fichier d'activation, et l'état d'activation du store — et
rafraîchit uniquement lorsqu'ils ont bougé, donc une extension installée ou basculée en dehors du daemon est
toujours détectée à la prochaine lecture. Les modes safe et bare sautent la vérification,
correspondant à leur exclusion des extensions.

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
- `restore_timeout` — un chargement ou une reprise de session a dépassé le budget de restauration dédié. La réponse REST est `504` et est retryable ; c'est distinct de l'initialisation de l'enfant et des limites de fenêtre de relecture bornées.
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

Tous les chemins de fichiers sont résolus via le workspace principal du daemon. Les réponses utilisent
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

Lit un fichier texte. Paramètres de requête : `path` (requis), `maxBytes`, `line`, `limit`,
et `cursor`. Le daemon rejette les fichiers binaires. Les fichiers dépassant le plafond de
snapshot complet de 256 KiB nécessitent au moins un argument de fenêtre explicite (`line`, `limit`, ou
`maxBytes`) ; une requête sans aucun d'eux reste `file_too_large`. Une telle
fenêtre est diffusée en flux, et son contenu UTF-8 renvoyé reste plafonné à 256 KiB.
`maxBytes` s'applique toujours aux octets UTF-8 de réponse après décodage, y compris
lorsque la source utilise un autre encodage supporté dans le plafond de snapshot complet.

Les décalages de ligne sont résolus en scannant depuis le début du fichier, donc une fenêtre
est aussi refusée avec `file_too_large` lorsque l'atteindre nécessiterait de lire plus de
8 MiB (`MAX_TEXT_SCAN_BYTES`). Utilisez `GET /file/bytes` pour atteindre un décalage plus profond
directement. Un texte volumineux dans un encodage que la route ne peut pas décoder renvoie
`binary_file`, pas `file_too_large` — réessayer avec une fenêtre plus petite ne peut pas
aider, et `readBytes` est le même remède qui s'applique déjà aux binaires.

Pour les fichiers dans le plafond de snapshot complet, la réponse inclut `hash`, un condensé SHA-256 sur les octets bruts du disque pour
l'ensemble du fichier, même lorsque `line`, `limit`, ou `maxBytes` ont renvoyé une tranche. Les fenêtres partielles volumineuses omettent `hash`, conservent le
`sizeBytes` complet, définissent `truncated: true`, et renvoient
`originalLineCount: null` lorsque le flux s'arrête avant EOF.

##### Pagination avec `cursor`

Nécessite la capacité `workspace_file_read_cursor`. Une réponse qui a plus
à donner renvoie `hasMore: true` et, lorsqu'un décalage d'octets de fichier est dérivable, un
jeton `nextCursor`. Le repasser comme `cursor` reprend en O(1), là où un décalage
`line` profond coûte un scan depuis l'octet 0 et est refusé au-delà de 8 MiB.

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → page suivante
```

`cursor` et `line` sont mutuellement exclusifs (`parse_error`) — les deux nomment un
point de départ. Un curseur malformé ou trop long est `parse_error` ; un curseur
dont le fichier a été remplacé ou tronqué est `hash_mismatch` (409). L'ajout
n'invalide **pas** un curseur en cours, ce qui est le cas d'usage pour lequel la fonctionnalité
existe.

`content` omet le caractère newline terminal de sa dernière ligne, comme chaque autre
lecture, donc un client réassemblant les pages les joint avec `\n`. `hasMore` n'est pas une
reformulation de `nextCursor` : un petit fichier non-UTF-8 lu avec un `limit` a
plus de contenu mais pas de décalage d'octets dérivable, donc il signale `hasMore: true` avec
`nextCursor: null`. Le curseur est également null lorsque le plafond d'octets coupe la ligne
actuelle, car reprendre depuis ce décalage renverrait une ligne partielle. Pour de nombreuses
lignes courtes, baissez le `limit` jusqu'à ce que la page se termine avant le plafond d'octets et renvoie
un curseur. Pour une ligne surdimensionnée unique, demandez la ligne suivante explicitement
(par exemple, `line=2` en commençant à la ligne 1), puis continuez avec les curseurs ;
utilisez `GET /file/bytes` lorsque la ligne surdimensionnée complète est requise.

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
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread"
}
```

| Champ            | Requis | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd`            | non       | Chemin absolu correspondant à un workspace enregistré. S'il est omis, la route revient au workspace principal (lisez-le depuis `/capabilities.workspaceCwd`). Lorsque `features` contient `multi_workspace_sessions`, les clients peuvent passer n'importe quel `workspaces[].cwd` de confiance ; sinon seul le workspace principal est accepté. Un `cwd` non vide et non concordant renvoie `400 workspace_mismatch`. Les chemins du workspace sont canonisés via `realpathSync.native` (avec un fallback resolve-only pour les chemins inexistants) afin que les systèmes de fichiers insensibles à la casse ne rejettent pas les sessions selon leur orthogographie.                                          |
| `modelServiceId` | non       | Sélectionne le _model service_ configuré par lequel l'agent va router (le provider back-end — Alibaba ModelStudio, OpenRouter, etc). S'il est omis, l'agent utilise celui par défaut. Si le workspace a déjà une session, cela appelle `setSessionModel` sur la session existante et diffuse `model_switched`. À distinguer de `modelId` sur `POST /session/:id/model`, qui sélectionne le modèle **au sein** d'un service déjà lié. Le tableau `modelServices` sur `/capabilities` est réservé à l'annonce des services configurés ; dans la Stage 1, il est toujours `[]` (le service par défaut de l'agent est utilisé et n'est pas énuméré via HTTP). |
| `sessionId`      | non       | UUID v1-v5 variante RFC choisi par l'appelant. Le daemon le normalise en minuscules et crée toujours une nouvelle session thread ; il ne traite jamais ce champ comme un attach idempotent. Confirmez que `caps.features` contient `session_id_override` avant de l'envoyer car les anciens daemons peuvent ignorer les champs inconnus. `null` équivaut à une omission.                                                                                                                                                                                                                                                                       |
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

Les ids fournis par l'appelant sont uniques dans tous les runtimes workspace actuellement enregistrés et dans chaque génération de bridge encore active, y compris les remplacements en drainage. Un doublon live, pending, active, archivé ou backed par worktree renvoie `409 session_id_conflict`. Les valeurs invalides renvoient `400 invalid_session_id` ; une vérification de propriétaire live ou d'état persisté indisponible renvoie `503 session_id_admission_unavailable` retryable. Réessayez avec un backoff borné après des changements de santé du bridge ou du stockage ; `retryable` signifie qu'une autre tentative est sûre, pas qu'un retry immédiat réussira. Si l'agent en aval renvoie un id différent, le daemon supprime cet orphelin et renvoie `500 session_id_not_honored`. Après une réponse ambiguë, chargez ou reprenez l'id connu au lieu de réessayer la création en tant qu'attach.

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

### `session/new` ACP avec id fourni par l'appelant

Les clients ACP demandent le même comportement via le champ de métadonnées de l'extension :

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/absolute/path/to/workspace",
    "_meta": {
      "qwen-code/sessionId": "550E8400-E29B-41D4-A716-446655440000"
    }
  }
}
```

La réponse contient l'id normalisé en minuscules. Les montages ACP principaux et qualifiés par workspace partagent l'admission avec REST, y compris `session/load` et `session/resume`. Les ids invalides utilisent ACP `INVALID_PARAMS` avec `data.httpStatus=400` et `data.errorKind="invalid_session_id"` ; les conflits utilisent `data.httpStatus=409` ; les vérifications de propriétaire live ou d'état persisté indisponibles utilisent `data.httpStatus=503` et `data.retryable=true`.

Une session créée par ACP qui ne reçoit jamais de prompt ne laisse aucune trace persistée, et le daemon la récupère lorsque sa connexion propriétaire se ferme avec zéro session attachée. Après cette récupération, le même id peut être créé à nouveau — c'est le cycle de vie de la connexion, pas une réutilisation d'id : tant que la connexion (ou tout attachement) est active, l'admission rejette le doublon.

### `POST /session/:id/load`

Restaure une session ACP persistée par son id et rejoue son historique via SSE. L'id dans le chemin fait autorité ; tout champ `sessionId` dans le corps est ignoré. Pré-vérification de `caps.features.session_load` — les anciens daemons renvoient `404` pour cette route.

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Champ | Obligatoire | Notes                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | non         | Mêmes règles de canonisation + `workspace_mismatch` que pour `POST /session`. Omettre pour hériter de `/capabilities.workspaceCwd`. Lorsque `features` contient `multi_workspace_sessions`, les appelants peuvent passer n'importe quel `workspaces[].cwd` enregistré de confiance ; les workspaces non fiables non principaux renvoient `403 untrusted_workspace`. `mcpServers` n'est intentionnellement PAS accepté ici — le MCP à l'échelle du daemon est piloté par les paramètres (comme pour `POST /session`). |

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

**Rejouer l'historique via SSE.** Pendant que `loadSession` est en cours d'exécution côté agent, l'agent peut émettre des notifications `session_update` pour les tours persistés, ou renvoyer des mises à jour de relecture en bloc dans les métadonnées de réponse. Le daemon ensemence ces événements dans la fenêtre de snapshot de relecture bornée de la session avant que la réponse de la route ne soit renvoyée. Pour les sessions live, `POST /session/:id/load` promet uniquement cette fenêtre bornée (`compactedReplay`, `liveJournal`, `lastEventId`), pas le transcript complet. La fenêtre est plafonnée en octets par `--compacted-replay-max-bytes` (par défaut 4 MiB, maximum 256 MiB) ; si des entrées de relecture plus anciennes ont été supprimées, `compactedReplay[0]` est un marqueur `history_truncated` sans id. Le `liveJournal` en cours est séparément plafonné par `--max-journal-events` (par défaut 10 000 entrées de relecture) et `--max-journal-bytes` (par défaut 8 MiB d'événements source sérialisés). Ce sont des plafonds **de base** par session. Lorsqu'un tour en cours les dépasse, le daemon tente d'abord une croissance adaptative : il augmente les plafonds de cette session vers le double (jusqu'à un plafond dur par session de 256 MiB, les entrées mises à l'échelle proportionnellement, limitées par l'espace restant du pool) tant que la croissance accordée à travers chaque session live tient dans un pool de croissance à l'échelle du daemon dimensionné à 5 % du budget mémoire effectif du daemon — la valeur `--memory-budget-mb` lorsqu'elle est passée, plafonnée à la mémoire disponible résolue, sinon 50 % de la mémoire auto-détectée — plafonné à `1024` Mo. La comptabilisation est à l'échelle du daemon — un daemon multi-workspace exécute un bridge par workspace et tous partagent le pool unique. La croissance est à la demande et uniquement dans la mesure où le pool le permet ; un `--max-journal-events` ou `--max-journal-bytes` fixé par l'opérateur la désactive, tout comme un hôte dont le budget effectif tombe sous le minimum de 1024 Mo (`insufficientMemory`) : le pool est à 0 et la croissance adaptative est désactivée. Les événements source consécutifs compatibles `agent_message_chunk` ou `agent_thought_chunk` partagent une entrée de relecture, jusqu'à 256 événements source par entrée, tandis que les limites d'outils, d'attribution, de provenance et de messages discrets restent intactes. Lorsque le journal dépasse encore ses plafonds (éventuellement augmentés) après la croissance que le pool permet — y compris lorsqu'aucun espace n'est accordé ou qu'une allocation ne couvre qu'une partie du dépassement — les entrées les plus anciennes sont supprimées en entier (la queue conservée peut donc être bien inférieure au plafond en octets) et un marqueur `history_truncated` avec `scope: 'live_journal'` est préfixé ; ses champs `truncatedEvents` et `retainedEvents` comptent les événements source, pas les entrées de relecture, et ses `maxBytes` / `maxEvents` reflètent les plafonds en vigueur (qui peuvent avoir déjà augmenté). Les clients doivent afficher ce marqueur comme statut et continuer à appliquer les événements conservés. L'accès complet au transcript persisté est exposé séparément via `GET /session/:id/transcript`.

Les plafonds en octets de la fenêtre de relecture s'appliquent après que l'enfant a reconstruit le transcript persisté ; ils ne plafonnent pas la lecture du JSONL sur disque. Une restauration qui dépasse le budget du daemon renvoie `504` avec un `Retry-After` dérivé du budget de restauration (limité à 5-120s) et `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}`. Le daemon met sous clôture la requête ACP toujours en cours et nettoie toute session tardive au lieu de l'enregistrer. Un retry pour le même id renvoie `409 restore_in_progress` avec `reason: "awaiting_abandoned_cleanup"` et un `Retry-After` du budget de restauration (limité à 5-120s) jusqu'à ce que le nettoyage se termine. Si le nettoyage tardif est incertain, ou si la restauration abandonnée ne s'est toujours pas terminée après un budget complet de restauration après son délai, les nouvelles sessions sur ce workspace renvoient `503 acp_channel_unavailable` avec `reason: "restore_cleanup_failed"` ou `"restore_settlement_overdue"` ; les sessions déjà actives restent utilisables pendant le drainage du canal.

**Erreurs :**

- `404` — l'id de session persistée n'existe pas (`SessionNotFoundError`).
- `400` — `workspace_mismatch` (même format que `POST /session`).
- `403` — `untrusted_workspace` lorsque `cwd` cible un workspace non fiable non principal.
- `503` — `session_limit_exceeded` (compte dans la limite de `--max-sessions` ; les restaurations en cours sont également prises en compte).
- `504` — `session_restore_timeout` ; retryable, avec un `Retry-After` dérivé du budget de restauration (limité à 5-120s) car le même id de session reste sous clôture jusqu'à ce que le nettoyage tardif se termine.
- `503` — `acp_channel_unavailable` lorsque le canal workspace est fermé pour les nouveaux travaux de session. `reason` indique pourquoi : `restore_cleanup_failed` lorsqu'une restauration abandonnée n'a pas pu être nettoyée de manière concluante, ou `restore_settlement_overdue` lorsqu'une restauration abandonnée ne s'est toujours pas terminée après un budget complet de restauration après son délai. Dans les deux cas, les sessions existantes restent disponibles, et les nouveaux travaux de session peuvent être réessayés après le drainage du canal workspace — le corps porte `retryAfterSeconds` et l'en-tête un `Retry-After` correspondant dérivé du budget, car la quarantaine survit à la clôture et un nouvel id ne voit jamais le 409 qui porterait l'indication.
- `409` — `restore_in_progress` (un `session/resume` pour le même id est déjà en cours, ou un nouveau spawn fourni avec un id appartient à une restauration). `Retry-After: 5` pendant que la restauration est active ; une indication dérivée du budget une fois qu'elle est sous clôture en tant que `awaiting_abandoned_cleanup`. Les courses de même action (deux `session/load` simultanés pour le même id) sont fusionnées — un seul renvoie `attached: false`, les autres renvoient `attached: true` avec le même `state`.
- `409` — `session_workspace_conflict` lorsque le même id de session est déjà actif ou en cours de restauration par un autre runtime workspace.
- `409` — `session_archived` lorsque l'id n'existe que sous `chats/archive/` ; appelez `POST /sessions/unarchive` avant `load` ou `resume`.
- `409` — `session_archiving` lorsqu'une archive ou un unarchive est en cours pour le même id. `Retry-After: 5`.
- `409` — `session_conflict` lorsque l'id existe à la fois dans `chats/` et `chats/archive/` ; supprimez la session avec `POST /sessions/delete` avant de la charger.

### `GET /session/:id/transcript`

Renvoie une page de trames de relecture `session_update` sans id reconstruites depuis le transcript JSONL persisté actif. Pré-vérification de `caps.features.session_transcript` — les anciens daemons renvoient `404` pour cette route.

Paramètres de requête :

| Champ    | Obligatoire | Notes                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | non         | Curseur base64url opaque renvoyé par la page précédente. Omettre pour la première page. Le curseur est émis par le daemon et vérifié par intégrité ; le modifier renvoie `400 invalid_transcript_cursor`. Il est lié à l'identité du fichier transcript et à la taille d'octets de la première page gelée ; supprimer, tronquer, remplacer ou archiver le fichier l'invalide et renvoie `409`. |
| `limit`  | non         | Nombre de `ChatRecord` actifs à inclure dans la page. Par défaut `100`, maximum `500`. Un enregistrement peut produire plusieurs trames de relecture, donc `events.length` peut être supérieur à `limit`. Les valeurs invalides renvoient `400 invalid_transcript_limit`.                                                                                                             |

Réponse :

```json
{
  "v": 1,
  "sessionId": "persisted-1",
  "events": [
    {
      "v": 1,
      "type": "session_update",
      "data": {
        "sessionUpdate": "user_message_chunk",
        "content": { "type": "text", "text": "..." }
      }
    }
  ],
  "nextCursor": "opaque",
  "hasMore": true,
  "startTime": "2026-07-08T00:00:00.000Z",
  "lastUpdated": "2026-07-08T00:01:00.000Z"
}
```

`events` sont des trames de relecture uniquement : `{ v: 1, type: "session_update", data: SessionUpdate }`. Ils ne portent pas d'ids EventBus, et la réponse n'inclut jamais `lastEventId`. Appeler cette route n'appelle pas `/load`, n'attache pas de client, n'initialise pas l'EventBus live, ne crée pas de session live et ne modifie pas la fenêtre de relecture live actuelle. Les sessions actives live et inactives sont toutes deux reconstruites par la méthode de statut en lecture seule côté enfant, donc la relecture utilise les mêmes paramètres workspace, le répertoire de sortie runtime, les émetteurs et la sémantique d'historique de `/load` sans muter l'état de session du daemon.

La première page gèle la taille actuelle du snapshot JSONL. Les pages ultérieures ne lisent que ce préfixe d'octets, donc les ajouts après la page 1 ne modifient pas l'ensemble de résultats. Si le fichier disparaît, est tronqué en dessous de la taille gelée, est remplacé par un inode différent, ou est déplacé vers l'archive, la page suivante renvoie `409` et le client doit recommencer à la page 1 ou demander à l'utilisateur de rouvrir le transcript.

Pour protéger la mémoire et la latence du daemon, les snapshots au-dessus du plafond d'indexation de transcript échouent avant que le daemon ne scanne le JSONL. Les clients reçoivent `413 transcript_too_large` et doivent revenir à l'exportation/traitement hors ligne ou demander à l'utilisateur de raccourcir/archiver l'historique plus ancien.

`partial: true` et `replayError` peuvent apparaître si la conversion de relecture échoue après avoir produit certaines trames. Les réponses partielles n'incluent jamais `nextCursor`, donc les clients ne peuvent pas paginer silencieusement au-delà des enregistrements non convertis.

**Erreurs :**

- `400` — `limit`, `cursor` ou forme d'id de session invalide.
- `404` — l'id de session persistée active n'existe pas lors de la demande de première page.
- `409` — `session_archived`, `session_archiving`, ou `session_conflict` des mêmes vérifications de chargeabilité que `/load`.
- `409` — le snapshot de transcript n'est pas disponible car le fichier a été supprimé, tronqué, remplacé ou archivé après l'émission du curseur ; cela s'applique également lorsque le preflight ne trouve plus le fichier actif pour une demande de curseur.
- `413` — `transcript_too_large` lorsque le snapshot de transcript gelé dépasse le plafond d'indexation du daemon.
- `413` — `transcript_page_too_large` lorsqu'un enregistrement agrégé dépasse le budget de page qualifié par workspace ou que la page sérialisée dépasse son budget de réponse.

### `GET /workspaces/:workspace/session/:id/transcript`

Renvoie la même projection `DaemonSessionTranscriptPage` que la route singulière depuis le JSONL persisté actif du workspace enregistré sélectionné. Pré-vérification de `workspace_persisted_transcript` ; cette capacité est indépendante de `multi_workspace_sessions` et fonctionne pour un primary mono-workspace de confiance sélectionné par id ou cwd.

Le sélecteur et les paramètres de requête suivent les règles existantes de workspace pluriel et de transcript. Les runtimes primary et secondary de confiance et les runtimes secondary non fiables peuvent lire. Un primary non fiable renvoie `403 untrusted_workspace`. Le contenu archivé n'est pas renvoyé.

Pour cette route qualifiée par workspace, `limit` est le nombre maximum d'enregistrements. Une page peut s'arrêter plus tôt au budget de source persistée de 4 MiB et renvoyer un curseur de continuation. Les réponses sérialisées sont plafonnées à 32 MiB et les curseurs à 64 KiB. Si l'état de relecture dépasserait le plafond de curseur, la page renvoie ses événements convertis avec succès avec `partial: true`, `hasMore: false`, et pas de `nextCursor`.

Contrairement à la route singulière héritée, ce chemin est implémenté entièrement dans le processus daemon. Il n'appelle pas le bridge workspace, ne démarre pas ACP, ne charge pas les paramètres, ne parse pas les agents ou skills définis par le projet, et ne crée/répare pas `session-transcript-cursor-key`. Les trames d'outils utilisent les noms et descriptions d'outils persistés sans consulter le registre d'outils runtime. Sa clé de curseur HMAC existe uniquement en mémoire daemon, est isolée par workspace, et tourne au redémarrage ; un curseur d'un processus daemon précédent renvoie `400 invalid_transcript_cursor`.

### `GET /workspaces/:workspace/session/:id/export`

Exporter la session persistée active du workspace enregistré sélectionné en tant que pièce jointe. Pré-vérification de `workspace_session_export` ; ne déduisez pas la prise en charge de `session_export` ou `workspace_qualified_rest_core`. Le sélecteur se résout d'abord par id de workspace exact, puis par cwd absolu encodé en URL après canonisation. Les runtimes primary et secondary doivent être de confiance. Un runtime non fiable renvoie `403 untrusted_workspace` avant la validation de session ou de format.

Le `format` optionnel de la requête est `html` (par défaut), `md`, `json`, ou `jsonl`. Le corps, le type MIME, la sanitization du nom de fichier, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, et la disposition de pièce jointe correspondent à `GET /session/:id/export`. La route héritée reste liée au stockage principal.

La route plurielle lit uniquement le JSONL persisté actif du workspace sélectionné sous le coordinateur d'archive partagé existant. Elle ne scanne pas d'autres stores de workspace, ne revient pas au primary, ne résout pas de propriétaire live, n'appelle pas le bridge workspace, ne démarre pas ACP, n'attache pas de client et ne charge pas les paramètres. Un id de session qui n'existe que dans un autre workspace renvoie `404 { code: "session_not_found" }` ; les sessions archivées renvoient `409 session_archived`. Les formats invalides renvoient `400 invalid_export_format`, et les courses de stockage conservent les erreurs `session_archiving` et `session_conflict` existantes.

### `GET /workspaces/:workspace/session/:id/archive/export`

Exporter la session persistée archivée du workspace enregistré sélectionné en tant que pièce jointe. Pré-vérification de `workspace_archived_session_export` ; la prise en charge ne peut pas être déduite de l'export actif ou des capacités core plurielles. La résolution du sélecteur workspace et les vérifications de confiance s'exécutent avant la validation de l'id de session et du format.

Les appelants SDK TypeScript utilisent `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`. La méthode utilise toujours REST natif et renvoie la projection de pièce jointe `DaemonSessionExportResult` existante.

Le `format` optionnel de la requête, le corps de réponse, le type MIME, le nom de fichier sanitizé, la politique de cache, l'en-tête de sécurité et la disposition de pièce jointe sont identiques à l'export workspace actif. Le JSONL source archivé est plafonné à 256 MiB avant reconstruction ; un fichier plus grand renvoie `413 transcript_too_large` avec `sessionId`, `snapshotSize`, et `maxBytes`. L'export actif conserve son comportement de taille existant.

La route lit uniquement `chats/archive/<id>.jsonl` dans le workspace de confiance sélectionné sous un bail de coordinateur d'archive partagé. Elle n'inspecte pas le contenu actif pour un retour, ne scanne pas un autre workspace, ne résout pas de propriétaire live, n'appelle pas de bridge, ne démarre pas ACP, n'attache pas de client et ne charge pas les paramètres. Un id actif uniquement renvoie `409 { code: "session_not_archived" }` ; un id manquant renvoie `404 { code: "session_not_found" }` ; des fichiers actifs et archivés simultanés renvoient `409 session_conflict` ; et une transition d'archive renvoie `409 session_archiving` avec `Retry-After: 5`.

### `POST /session/:id/resume`

Restaure une session ACP persistée par son id SANS rejouer l'historique via SSE. Le contexte du modèle est restauré en interne côté agent (via `geminiClient.initialize` qui lit `config.getResumedSessionData`) ; le flux SSE reste propre pour les clients qui ont déjà l'historique rendu. Pré-vérification de `caps.features.session_resume` ; `unstable_session_resume` reste un alias de compatibilité obsolète pour les anciens clients.

Même format de requête que pour `/load`. Même format de réponse — `state` reflète le `ResumeSessionResponse` de l'ACP. Même enveloppe d'erreur, y compris `409 restore_in_progress` (qui se déclenche lorsqu'un `session/load` est en cours ; un `session/resume` en course derrière un autre `session/resume` est fusionné).

Utilisez `/load` lorsque le client n'a aucun historique rendu (reconnexion à froid, sélecteur → ouverture). Utilisez `/resume` lorsque le client a déjà les tours à l'écran et a seulement besoin de récupérer le handle côté daemon.

> ⚠️ **Pourquoi `unstable_session_resume` est-il encore annoncé ?** La route HTTP du daemon et la capacité `session_resume` sont stables pour la v1, mais le bridge appelle encore `connection.unstable_resumeSession` de l'ACP. L'ancien tag reste uniquement pour que les SDKs publiés avant `session_resume` puissent continuer à fonctionner.

### `GET /workspace/:id/session-info` et `GET /workspaces/:workspace/session-info`

Renvoie les compteurs agrégés de sessions persistées pour le workspace sélectionné sans modifier le chemin de liste de sessions paginée :

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`active`, `archived`, et `total` comptent les sessions JSONL locales. `live` est le compte correspondant du bridge en mémoire et est omis pour un workspace secondaire non fiable enregistré car cette lecture persistée uniquement ne doit pas interroger l'état live. `expensive` est toujours `true` et `cost` est toujours `"disk_scan"` ; les clients doivent appeler ce point de terminaison rarement plutôt que de l'interroger en polling. Si le scan atteint sa limite de sécurité ou ne peut pas classifier chaque fichier candidat, la réponse ajoute `"truncated": true` et les comptes persistés sont des bornes inférieures. Un stockage manquant renvoie des comptes persistés à zéro. La route plurielle utilise le même sélecteur workspace et la même politique de confiance que le catalogue de sessions pluriel ; un primary non fiable renvoie toujours `403 untrusted_workspace`.

Le SDK daemon TypeScript expose la route plurielle via `workspaceById(...)` ou `workspaceByCwd(...)`, suivi de `getWorkspaceSessionInfo()`.

### `GET /workspace/:id/sessions` et `GET /workspaces/:workspace/sessions`

Liste les sessions dont le workspace canonique correspond à `:id` ou `:workspace`. Le paramètre de chemin se résout d'abord par id de workspace exact puis par cwd absolu encodé en URL. Les workspaces principaux incluent la fusion persistée/live existante : la liste par défaut contient les sessions actives de `chats/` ; passez `archiveState=archived` pour lister les sessions archivées de `chats/archive/`. Les workspaces non principaux de confiance incluent les sessions persistées actives de leur propre store `chats/` et fusionnent les résumés live correspondants sans doublons ; si aucune session persistée active n'existe, la route préserve le comportement de curseur live existant. Les workspaces non principaux de confiance prennent également en charge `archiveState=archived`, la liste organisée `view=organized`, et les filtres `group`, lisant depuis leurs propres stores `chats/`, `chats/archive/`, et d'organisation de session ; une requête combinée `view=organized&archiveState=archived` renvoie uniquement les sessions archivées sans fusion live. Les workspaces non principaux non fiables enregistrés prennent en charge les mêmes formes de liste, filtre et pagination mais ne renvoient que des entrées persistées : le daemon n'interroge pas le bridge live ni ne remplit les interactions en attente, les erreurs de tour ou l'état client depuis le runtime. Les valeurs par défaut persistées telles que `clientCount: 0` et `hasActivePrompt: false` restent présentes pour la compatibilité du wire. Un stockage manquant renvoie une liste vide. La route plurielle renvoie toujours `403 { code: "untrusted_workspace" }` pour un primary non fiable ; les routes héritées du primary conservent leur comportement de compatibilité existant. `archiveState=all` n'est pas pris en charge dans la v1. Les listes principales et persistées conservent la sémantique numérique de `cursor` existante ; le fallback live du curseur live non principal de confiance sans persisté conserve son curseur live opaque existant.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

Lorsque `workspace_qualified_rest_core` est annoncé, les opérations batch de session à l'échelle du workspace, le CRUD de groupes et la mutation d'organisation de session sont disponibles sous `/workspaces/:workspace/sessions/{delete,archive,unarchive}`, `/workspaces/:workspace/session-groups`, et `/workspaces/:workspace/session/:id/organization`. Pour un secondaire non fiable, le GET de groupe reste disponible ; chaque mutation de groupe, session et organisation reste soumise à la confiance. Les routes batch et de mutation d'organisation sans workspace restent limitées au workspace principal pour la compatibilité.

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

Les curseurs ordonnés par activité — la vue organisée et les listes filtrées par `parentSessionId` / `sourceType` — ne sont pas isolés par snapshot, et une liste active de confiance trie les lignes par le maximum du mtime de transcription et du watermark d'activité live. Un watermark live est en mémoire uniquement, donc la clé d'une session peut régresser à son mtime lorsque l'entrée live est retirée entre deux récupérations de page. Le curseur compense : il emporte les identités déjà émises à une clé dérivée du live — en les retenant tandis que la ligne est absente de la collection d'une page et tandis qu'un basculement d'épingle pourrait les réadmettre — et les exclut pour le reste du passage, de sorte que le mouvement de clé dérivé du live renvoie une session au plus une fois par passage. La garantie est limitée à l'emport : elle est bornée à 64 identités (les identités excédentaires dans un passage dégénèrent en un doublon au-plus-une-fois plutôt qu'en une erreur), et une ligne persistée uniquement émise avant que son état d'épingle ne change n'est jamais emportée, donc un désépinglage entre les récupérations peut renvoyer cette ligne une deuxième fois exactement comme avant l'existence de ce champ. Les appelants qui accumulent des pages doivent donc toujours indexer les lignes par `sessionId`, pas seulement dans le cas supérieur à 64. Les lignes peuvent encore se déplacer ou être sautées sous activité concurrente, exactement comme avant ; un appelant qui a besoin d'une vue cohérente recharge depuis la première page après un changement d'activité.

Des champs supplémentaires peuvent apparaître sur chaque session lorsque `view=organized` :

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Les listes actives de confiance incluent des champs de surcouche daemon en direct tels que `clientCount` et `hasActivePrompt`. Les listes de secondaires non fiables et archivées sont uniquement basées sur le stockage : les champs de surcouche live restent absents ou faux, et les entrées archivées définissent `isArchived` à `true`. Tableau vide (et non 404) lorsqu'aucune session n'existe — une UI de sélecteur de session ne devrait pas générer d'erreur simplement parce que l'espace de travail est inactif.

### `GET /workspaces/:workspace/sessions/live-state`

Renvoie le snapshot en mémoire uniquement des sessions live du runtime workspace sélectionné ainsi qu'une version de catalogue en mémoire, de sorte que les clients peuvent arrêter d'interroger le catalogue persisté à `GET /workspaces/:workspace/sessions` pour l'état volatil tel que `hasActivePrompt`, les flags d'attente et `clientCount`. Pré-vérifiez `workspace_session_live_state` ; le tag est indépendant de `workspace_qualified_rest_core`, donc les anciens daemons annonçant la capacité REST workspace plus large n'implémentent pas cette route. Le sélecteur se résout d'abord par id de workspace exact, puis par cwd absolu encodé en URL après canonisation, correspondant aux autres routes de sessions plurielles. La route est réservée aux fiables pour les runtimes primary et secondary alike : elle ne revient jamais au runtime primary, et n'utilise pas la politique permissive de catalogue persisté qui accorde à un secondaire non fiable des lectures bornées de catalogue. Le point de terminaison n'a pas de paramètres de requête et n'effectue aucun aller-retour de stockage de session, de paramètres, de commande externe ou ACP, donc son coût est indépendant du nombre de sessions persistées et de la taille JSONL ; la limite par défaut de sessions live maintient la réponse bornée, et avec la limite désactivée le coût reste proportionnel uniquement au nombre de sessions live.

Réponse :

```json
{
  "v": 1,
  "catalogVersion": {
    "generation": "7eca3164-bce1-4f50-94d8-c842c480f213",
    "revision": 17
  },
  "sessions": [
    {
      "sessionId": "session-123",
      "clientCount": 1,
      "hasActivePrompt": true,
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false,
      "updatedAt": "2026-08-18T08:12:30.123Z"
    }
  ]
}
```

`v` est la version du schéma de réponse. Chaque réponse réussie inclut `Cache-Control: no-store`. `sessions` est l'ensemble complet, non paginé et non trié des sessions actuellement live dans le runtime sélectionné ; un runtime live vide renvoie `200` avec `sessions: []`. `clientCount`, `hasActivePrompt`, `isWaitingForPermission` et `isWaitingForUserQuestion` sont des champs wire requis, et les valeurs de bridge optionnelles manquantes se projettent en `0` ou `false`. Les champs de catalogue statiques tels que le nom d'affichage, l'heure de création, l'organisation et les métadonnées source sont délibérément exclus et restent la propriété du catalogue complet. Une ligne d'état live absente efface uniquement les champs volatils d'une ligne de catalogue connue ; elle ne supprime jamais une ligne de catalogue persisté.

`updatedAt` est un watermark d'activité observé par le daemon optionnel, présent lorsqu'un prompt ayant atteint l'état running a publié un terminal formel dans le bridge courant. Il avance exactement une fois par terminal de ce type — succès, erreur, annulation et deadline alike — est écrit avant la publication de l'événement terminal, et est strictement croissant par session live même lorsque deux terminaux arrivent en une milliseconde d'horloge murale ou que l'horloge murale recule ; un saut d'horloge vers l'avant persiste donc jusqu'à ce que le temps mural le rattrape. Il n'est jamais antérieur au `createdAt` de la session : la première avance est planchée à l'heure de création, donc un recul d'horloge murale entre la création et le premier terminal ne peut pas placer une ligne derrière le `createdAt` auquel elle était déjà listée. L'admission de prompt, les attentes de file, les mises à jour en flux, l'annulation en file uniquement, les heartbeats et les attentes d'interaction ne le font jamais avancer. Les clients l'utilisent pour rafraîchir la récence d'une ligne de catalogue qu'ils détiennent déjà au lieu de recharger le catalogue complet après un tour terminé. Ce n'est pas un accusé de réception de persistance : l'enregistreur écrit les résultats de tour de manière asynchrone, donc la valeur prouve uniquement que le daemon a observé une tentative running se régler. Il est absent avant le premier terminal running dans une génération de bridge — y compris pour une session restaurée depuis le disque — donc l'absence n'est pas une sonde de support, et il disparaît lorsqu'un redémarrage du daemon ou un remplacement de runtime workspace installe un nouveau bridge. Lorsque des résumés live et persistés existent tous deux pour une session, les réponses de catalogue complet rapportent le timestamp valide le plus tardif, donc `GET /session/:id/status`, qui renvoie le résumé du bridge directement sans cette fusion, peut rapporter une valeur antérieure à celle d'une réponse de liste.

`catalogVersion` est un token d'égalité pour les changements de catalogue observés par le daemon. `generation` est un UUID aléatoire créé avec chaque instance de bridge et change lors d'un redémarrage du daemon ou d'un remplacement de runtime workspace ; `revision` commence à zéro et augmente de manière monotone dans une génération. La seule opération supportée est l'égalité sur la paire entière : même génération et revision signifie aucun changement de catalogue observé par le daemon, et toute différence signifie recharger le catalogue complet. Les clients ne doivent pas effectuer d'arithmétique de revision ni comparer des revisions à travers les générations, et des incréments conservateurs supplémentaires sont autorisés. La version couvre l'appartenance au catalogue et les changements de métadonnées statiques observés par le daemon ; l'activité de tour ordinaire, le cycle de vie des prompts, l'attachement/détachement et les transitions d'état d'attente ne la font pas avancer car le snapshot live porte déjà les champs volatils correspondants. Un `updatedAt` changé sous une version inchangée est donc valide et attendu, et n'invalide pas les caches de liste persistée du daemon. Deux valeurs de surcouche volatile sont délibérément en dehors des deux signaux : l'état d'erreur de tour (`hasTurnError`/`turnError`) et le compte/contenu d'interaction en attente (`pendingInteractionCount`/`pendingInteractions`) ne font avancer ni la version ni n'apparaissent dans le snapshot, donc un client qui en a besoin doit continuer à lire le flux d'événements par session ou le catalogue complet plutôt que de se fier à cette route ; chaque champ peut être ajouté de manière additive au wire lorsqu'un consommateur concret le nécessite. Les mutations écrites directement par un autre daemon, un TUI ou un processus externe ne sont pas observées, donc une fois qu'un client arrête le polling périodique du catalogue complet, ces écritures n'ont pas de délai de découverte borné et n'apparaissent qu'après un rechargement complet explicite, une autre mutation de catalogue observée, une reconnexion ou un remplacement de daemon/runtime.

Les clients réconcilient un bundle de catalogue avec une poignée de main à deux lectures : lire l'état live A, charger la liste complète des sessions (plus `GET /workspaces/:workspace/session-groups` lorsque le client consomme `session_organization`), puis lire l'état live B. Des versions A et B égales acceptent le bundle ; des versions différentes marquent le catalogue comme obsolète et fusionnent au plus un rechargement en traînée plutôt que d'entrer dans une boucle de retry serrée. Chaque requête de catalogue acceptée doit être initiée après A — une requête ou une promesse dédupliquée qui a commencé avant A ne peut pas satisfaire la réconciliation. Les rechargements pilotés par la version sont single-flight par workspace et obéissent à un intervalle minimum de fond non nul, de sorte qu'un churn soutenu du catalogue ne peut pas provoquer un scan complet du catalogue par interrogation de l'état live ; les mutations locales explicites peuvent toujours demander un rafraîchissement immédiat via la même opération single-flight.

**Erreurs :**

- `400` — comportement existant de validation de sélecteur ou `workspace_mismatch` pour un sélecteur inconnu, malformé, imbriqué ou non enregistré ; la route ne résout jamais un sélecteur inconnu vers le runtime primary.
- `403` — `untrusted_workspace` pour tout runtime non fiable, y compris un primary non fiable.
- `503` — `workspace_runtime_unavailable` avec `Retry-After` pour un runtime en bootstrap, en transition, en drainage, bloqué ou supprimé, ou une génération de runtime qui se ferme en cours de requête.
- `500` — les erreurs locales inattendues utilisent le mapping d'erreurs de bridge existant.

### `GET /workspace/:id/session-groups`

Liste les groupes de sessions définis par l'utilisateur pour un workspace. Le sélecteur GET singulier accepte n'importe quel id de workspace enregistré ou cwd canonique encodé en URL. L'alias GET pluriel est également disponible pour un secondaire non fiable et lit uniquement le sidecar d'organisation. Les mutations de groupes plurielles restent soumises à la confiance, tandis que les mutations de groupes singulières conservent leur comportement de compatibilité limité au primary. Pré-vérification de `caps.features.includes('session_organization')`.

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

Archiver une ou plusieurs sessions. L'archivage est une transition d'état, pas une suppression : le JSONL passe de `chats/<id>.jsonl` à `chats/archive/<id>.jsonl`. L'historique des fichiers, les transcripts des sous-agents et les sidecars d'exécution restent en place. Si une session est active, le démon effectue d'abord une fermeture stricte et exige que le gestionnaire de fermeture de l'agent ACP flush l'enregistrement du chat ; si la fermeture ou le flush échoue, le JSONL n'est pas déplacé. Pré-vérification `caps.features.session_archive`.

Requête :

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true }
```

`sessionIds` doit être un tableau de chaînes non vide contenant au maximum 100 ids. Les doublons sont éliminés.

Réponse :

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts` est optionnel et vaut `false` par défaut. Par défaut, les fichiers actifs et archivés ayant le même id sont signalés dans `errors`, et aucune copie n'est déplacée, supprimée ni écrasée. L'archivage d'une session live effectue toujours la fermeture stricte décrite ci-dessus avant de classifier le conflit, de sorte que cette fermeture peut flusher les enregistrements en file dans le transcript actif. Avec `resolveConflicts: true`, l'archive conserve la copie archivée, supprime la copie active et signale l'id dans `archived` et `resolvedConflicts`. Les entrées de `errors` ont la forme `{ "sessionId": "<uuid>", "error": "message" }`.

Les conflits de cycle de vie sont des résultats d'éléments de lot : les routes sans workspace et qualifiées par workspace renvoient HTTP `200` avec le conflit dans `errors`. Cela remplace l'ancienne enveloppe HTTP `409 session_conflict` des routes qualifiées par workspace ; les clients qui ont appelé cette route doivent inspecter la réponse de lot. Les lots REST internes au runtime préservent le message de conflit sûr tout en continuant à masquer les autres détails d'échec par session.

### `POST /sessions/unarchive`

Restaurer les sessions archivées dans le répertoire actif. Cela ne relance pas la session en soi ; cela déplace uniquement `chats/archive/<id>.jsonl` vers `chats/<id>.jsonl`. Une fois le désarchivage réussi, les clients peuvent appeler `POST /session/:id/load` ou `POST /session/:id/resume`.

Requête :

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true }
```

Réponse :

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts` est optionnel et vaut `false` par défaut. Par défaut, des fichiers JSONL actifs et archivés simultanés produisent un conflit dans `errors`, et aucune copie n'est déplacée, supprimée ni écrasée ; une session active uniquement est renvoyée dans `alreadyActive`. Avec `resolveConflicts: true`, le désarchivage conserve la copie active, supprime la copie archivée et signale l'id dans `unarchived` et `resolvedConflicts`. Une opération d'archivage ou de désarchivage en cours pour le même id retourne `409 session_archiving` avant de démarrer le lot.

ACP-over-HTTP utilise les mêmes corps de requête et de réponse via les méthodes vendor `_qwen/sessions/archive` et `_qwen/sessions/unarchive`. La table de routes REST mappe `POST /sessions/archive` et `POST /sessions/unarchive` à ces méthodes pour les transports ACP.

### Routage de sessions live multi-workspace

Lorsque `multi_workspace_sessions` est annoncé, les opérations de sessions live identifient leur workspace par le `sessionId` ; les clients n'ajoutent pas de sélecteur workspace à l'URL. En plus des opérations de cycle de vie routées par propriétaire existantes, cela s'applique à `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/mid-turn-message`, `GET /session/:id/mid-turn-messages`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts`, et `DELETE /session/:id/artifacts/:artifactId`. Le daemon route chaque requête vers le runtime de confiance qui possède la session live. Un propriétaire non principal non fiable renvoie `403 untrusted_workspace`, un propriétaire live manquant renvoie `404 session_not_found`, et un propriétaire ambigu échoue strictement avec `500 ambiguous_session_owner`.

Cette règle est limitée aux sessions live et ne rend pas chaque route de session sans workspace consciente du multi-workspace. Les opérations persistées ou archivées utilisent leurs routes qualifiées par workspace documentées. `POST /session/:id/branch`, `POST /session/:id/fork`, et `POST /session/:id/cd` restent intentionnellement limités au primary et renvoient `non_primary_session_route_not_supported` pour les propriétaires non principaux.

### Messages en cours de tour

`POST /session/:id/mid-turn-message` accepte `{ "message": "...", "messageId": "<optional-message-id>" }`. Une admission réussie renvoie `{ "accepted": true, "messageId": "<id>" }` et transfère la propriété au daemon : le message est drainé dans le tour actif ou promu dans la FIFO de prompts normaux lorsque la session devient inactive. Les clients utilisant `session_mid_turn_message_query` envoient un `messageId` stable ; le répéter est idempotent tant qu'il reste en file, pending, ou dans les anneaux de réconciliation bornés. Une file pleine rejette une nouvelle requête sans prendre la propriété. Les nouveaux clients connectés à un ancien daemon détectent la capacité manquante et conservent leur fallback local hérité.

`GET /session/:id/mid-turn-messages` renvoie la file appartenant au daemon pour l'ensemble de la session ainsi que les anneaux bornés `settledMessageIds` et `promotedMessageIds`. Les ids settled ont été injectés ou supprimés explicitement ; les ids promus sont entrés dans la FIFO de prompts normaux. Un id dans l'un ou l'autre anneau ne doit pas être renvoyé.

Lorsqu'un message en file est drainé dans le tour actif, le daemon publie `mid_turn_message_injected` portant les tableaux alignés `messages` et `messageIds` (et le `promptId` du tour en cours lorsqu'il est connu). C'est un signal de déduplication transitoire, pas un élément de transcript : les clients soldent les callbacks de complétion enregistrés sous ces ids de message et suppriment leurs lignes pending locales correspondantes. Les anciens daemons portent en plus `originatorClientId` dans le payload. Un écho manqué est récupéré depuis l'anneau settled via la requête ci-dessus.

Lorsque `session_mid_turn_message_mutation` est annoncé, un client de session attaché peut appeler `DELETE /session/:id/mid-turn-messages/:messageId`. Il supprime le message de la file mid-turn ou de son état de pending-prompt promu ; supprimer un message promu déjà en cours annule ce tour, comme le retrait ordinaire de pending-prompt. Les ajouts et retraits de la file appartenant au daemon publient les événements de session existants `pending_prompt_added` et `pending_prompt_completed` afin que les clients attachés rafraîchissent les deux snapshots de file faisant autorité. `{ "removed": false }` signifie que le message était déjà injecté, terminé, ou introuvable.

### `POST /session/:id/prompt`

Transmettre un prompt à l'agent. Les appelants multi-prompts mettent en file d'attente FIFO par session (ACP garantit un seul prompt actif par session).

Requête :

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }],
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

`delivery` est optionnel et nécessite la capacité `channel_delivery`. Le
daemon renvoie toujours `202 {promptId,lastEventId}` lorsque le prompt est admis.
Après un `end_turn` réussi, la session soumet le texte final visible au
Channel Worker déjà en cours d'exécution du workspace exact. Le payload est uniquement le
dernier bloc de réponse assistant sans outil ; les préambules d'appels d'outils, la
narration inter-outils, les tentatives remplacées et les blocs de continuation automatique
antérieurs sont exclus. Un final vide ou ne contenant que des espaces produit toujours un
`channel_delivery_result` corrélé avec `status: "skipped"` après consommation de l'autorisation,
mais il ne contacte pas de worker. Le succès ou l'échec de la livraison arrive
plus tard via le même événement rejouable et ne transforme jamais `turn_complete` en
`turn_error`. L'annulation, l'échec Agent et la terminaison par limite de tokens
n'envoient ni ne publient de résultat de livraison.

Validation : `prompt` doit être un tableau d'objets non vide. Les autres échecs retournent `400` avant d'atteindre le bridge.

Réponse :

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

La réponse `202` accuse réception de l'admission, pas de la complétion de l'Agent. Observez le
flux SSE de la session après `lastEventId` et corrélez `turn_complete` ou
`turn_error` par `promptId`. `turn_complete.data.stopReason` peut être `end_turn`,
`cancelled`, `max_tokens`, `error`, ou `length`.

Si le client HTTP se déconnecte en plein prompt, le démon envoie une notification ACP `cancel` à l'agent, qui termine le prompt avec `stopReason: "cancelled"`.

Lorsque `prompt_absolute_deadline` est annoncé, `deadlineMs` peut raccourcir
le délai serveur configuré. L'expiration émet un `turn_error` corrélé avec
`errorKind: "prompt_deadline_exceeded"`. Le délai libère l'appelant sans tuer l'agent ; si l'agent se règle plus tard, les interrogations de statut de tour pour ce `promptId` renvoient le résultat de transcription réglé au lieu de l'erreur de délai.

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

Idempotent : retourne `404` pour les sessions inconnues. L'enveloppe d'erreur utilise `code: "session_not_found"` ; une fermeture simultanée peut renvoyer `code: "session_closing"`, que les clients peuvent traiter comme le même état terminal réussi pour cette route.

> **Événement `session_closed`.** Les abonnés SSE reçoivent un événement terminal `session_closed` avec `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` avant la fin du flux. Les reducers du SDK traitent cela de manière identique à `session_died` (définit `alive: false`, efface `pendingPermissions`).

### `PATCH /session/:id/metadata`

Mettre à jour les métadonnées mutables de la session. Actuellement, seul `displayName` est pris en charge. Pré-vérification `caps.features.session_metadata`. Le regroupement et l'épinglage ne font intentionnellement pas partie de cette route ; utilisez `PATCH /session/:id/organization` sous `session_organization`.

Requête :

```json
{ "displayName": "My Investigation Session" }
```

| Champ         | Requis | Notes                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------ |
| `displayName` | non       | Chaîne de caractères, max 256 caractères. Une chaîne vide efface le nom. Omettre pour laisser tel quel. |

Réponse :

```json
{ "sessionId": "<uuid>", "displayName": "My Investigation Session" }
```

Publie un événement `session_metadata_updated` sur le flux SSE de la session avec `{ sessionId, displayName }`.

### `PATCH /session/:id/organization` et `PATCH /workspaces/:workspace/session/:id/organization`

Mettre à jour l'état d'organisation local de la session via la gate de mutation existante. Pré-vérification de `caps.features.includes('session_organization')` ; la route plurielle nécessite en plus `workspace_qualified_rest_core`. Sur la route plurielle, `:workspace` se résout d'abord par id de workspace enregistré exact puis par cwd absolu canonique encodé en URL. Le runtime sélectionné doit être de confiance. La validation de l'existence de la session et de `groupId` non nul est limitée à l'état de session persistée active, persistée archivée, et live du runtime et au store de groupes de ce runtime, sans retour au primary ou à un autre workspace. La route héritée reste limitée au workspace principal.

Requête :

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Champ      | Requis | Notes                                                                                                |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | non       | Booléen. `true` définit `pinnedAt` s'il n'était pas déjà épinglé ; `false` efface `pinnedAt`.             |
| `groupId`  | non       | Id de groupe personnalisé ou `null` pour non groupé. Les ids de groupe inconnus retournent `404 { code: "group_not_found" }`. |
| `color`    | non       | Un token de couleur de session supporté, ou `null` pour effacer la couleur de session.                               |

Réponse :

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "color": "blue",
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

Réponse :

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

Requête :

```json
{ "modelId": "qwen-staging" }
```

Réponse :

```json
{ "modelId": "qwen-staging" }
```

En cas de succès, publie `model_switched` sur le flux SSE. En cas d'échec, publie `model_switch_failed` (afin que les abonnés passifs voient l'échec, et pas seulement l'appelant). Entre en concurrence avec la sortie du canal de l'agent afin qu'un processus enfant bloqué ne puisse pas bloquer le gestionnaire HTTP. Un basculement réussi enregistre également le modèle de session dans le JSONL de session de manière best-effort ; lorsque l'enregistrement est écrit, le daemon load/resume tente de restaurer le modèle de cette session avant l'authentification. Si le modèle enregistré ne peut plus être appliqué (modèle supprimé, identifiants indisponibles), la restauration utilise une route de registre de même id lorsqu'il en existe une — pour un enregistrement de snapshot runtime, cela peut être un point de terminaison différent de la liaison enregistrée — et continue sur le défaut `settings.model.name` uniquement lorsqu'aucune route ne résout. `settings.model.name` est toujours mis à jour comme défaut pour les **nouvelles** sessions.

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

### `POST /session/:id/generate`

Tag de capacité : `session_generation`.

Exécute une génération de texte à portée de requête depuis un prompt fourni par l'appelant. La requête
ne lit ni ne mute l'historique de conversation et n'expose aucun outil. Elle préfère
le modèle rapide configuré, revenant au modèle principal de la session si le modèle rapide
est absent ou ne peut pas être résolu. Le point de terminaison est agnostique en termes de tâche ;
la traduction n'est qu'un possible prompt défini par l'appelant.

Requête :

```json
{ "prompt": "Translate into Chinese: Hello" }
```

La réponse est `text/event-stream`. Le serveur écrit un commentaire SSE initial
immédiatement, suivi de `started`, un événement de progression `thinking` optionnel, zéro
ou plus d'événements `delta`, et `done`. L'événement `thinking` ne porte pas de contenu
de raisonnement. Un échec de modèle après le début du streaming produit un événement `error` ;
il ne réessaie pas avec un autre modèle. Les prompts sont limités à 32 KiB de texte UTF-8.
Déconnecter le client HTTP annule la requête de génération.

### Mutation: approval, tools, skills, init, MCP restart

Le daemon expose cinq routes de contrôle de mutation qui permettent aux clients distants de modifier la posture d'exécution sans toucher au CLI de l'hôte du démon. Les cinq :

- Sont protégées par la gate de mutation **strict** de la PR 15. Un démon configuré sans bearer token les rejette avec `401 {code: 'token_required'}`. Configurez `--token` (ou `QWEN_SERVER_TOKEN`) avant d'y souscrire.
- Acceptent et estampillent le header `X-Qwen-Client-Id` (chaîne d'audit de la PR 7). Lorsque le header contient un id de confiance, le démon émet `originatorClientId` sur l'événement SSE correspondant, afin que les UI multi-clients puissent supprimer les échos de leurs propres mutations.
- Vérifient en pre-flight chaque capacité par tag avant d'exposer l'affordance. Les démons plus anciens renvoient `404` pour la route.

Les routes tool toggle, skill toggle, init et MCP restart émettent des événements **à l'échelle du workspace** : chaque bus SSE de session active reçoit l'événement, quelle que soit la session attachée lorsque la mutation a été déclenchée. `approval-mode` émet un événement **à l'échelle de la session** car le changement est local au `Config` d'une seule session.

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

#### `POST /workspace/skills/:name/enable`

Capability tag : `workspace_skill_toggle`. La forme qualifiée par workspace est `POST /workspaces/:workspace/skills/:name/enable`.

Bascule un skill chargé et invocable par l'utilisateur via les paramètres de skills du workspace, correspondant au comportement de la touche Espace du panneau CLI `/skills`. La recherche est insensible à la casse, tandis que la persistance et la réponse utilisent le nom canonique du skill. Activer un skill `skills.defaultDisabled` ajoute un opt-in `skills.enabled` du workspace ; désactiver retire cet opt-in et ajoute une entrée `skills.disabled` du workspace. Les entrées existantes pour des skills qui ne sont plus chargés sont préservées, et les entrées en double ou avec des variantes de casse pour la cible sont fusionnées. Une entrée de désactivation dure héritée des valeurs par défaut système, utilisateur ou système verrouille le skill : la portée workspace ne peut pas la remplacer.

Cela diffère de l'opération de skill géré ACP `qwen/skills/setEnabled` et du champ frontmatter `disable-model-invocation`. La disponibilité effective des skills suit `skills.disabled` > `skills.enabled` > `skills.defaultDisabled`. Les désactivations dures et par défaut retirent toutes deux le skill de la disponibilité slash-command/modèle et rejettent l'exécution ultérieure du skill. `disable-model-invocation: true` maintient l'invocation directe par l'utilisateur disponible et masque uniquement le skill de l'invocation par le modèle.

Requête :

```json
{ "enabled": false }
```

Réponse (200) :

```json
{
  "skillName": "review",
  "enabled": false,
  "changed": true,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0
}
```

`activation` est `applied` lorsque chaque session active a été rafraîchie, `deferred` lorsqu'aucun enfant ACP n'existe (le paramètre persisté est utilisé lorsqu'un en démarre un), et `partial` lorsqu'au moins une session active n'a pas pu être rafraîchie. Les sessions occupées sont incluses. Le daemon recharge les paramètres workspace pour l'enfant ACP et chaque session active, notifie les consommateurs SkillManager, et pousse `available_commands_update`. Une requête déjà envoyée au modèle n'est pas réécrite ; les validations ultérieures, les snapshots de commande et les contextes de modèle utilisent le nouvel état. Si la persistance échoue, aucun rafraîchissement ni événement n'est émis. Si le rafraîchissement d'une session échoue, le paramètre commité est conservé. Lorsque l'enfant renvoie les résultats par session, les comptes de sessions sont exacts. Si le contrôle de rafraîchissement lui-même échoue avant de renvoyer ces résultats, `sessionsFailed: 1` est une borne inférieure conservatrice indiquant que la demande de rafraîchissement a échoué.

Erreurs :

- `400 {code: 'invalid_skill_name'}` — paramètre de chemin vide, ou plus de 256 caractères.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` manquant ou non booléen.
- `403 {code: 'untrusted_workspace'}` — le workspace sélectionné n'est pas de confiance.
- `404 {code: 'skill_not_found'}` — aucun skill chargé ne correspond au nom.
- `409 {code: 'skill_not_toggleable', reason: 'not_user_invocable' | 'inactive_extension' | 'locked', lockedScope?: 'system' | 'user' | 'systemDefaults'}` — le panneau CLI n'autoriserait pas le basculement de la cible. `lockedScope` n'est présent que lorsque `reason` est `locked`.

La mutation réutilise l'événement `settings_changed` à l'échelle du workspace pour chaque clé modifiée (`skills.disabled` et/ou `skills.enabled`) ; elle n'ajoute pas de nouveau type d'événement. Chacun de ces événements inclut le même objet `mutation` : `{ id, kind: 'skill_toggle', skills: [{ name, enabled }], activation, sessionsRefreshed, sessionsFailed }`. `id` corrèle chaque événement settings produit par une requête de toggle. `skills` liste les noms canoniques et les états activés résultants des Skills qui ont effectivement changé. Les cellules de statut de skills workspace incluent les champs optionnels `disabledReason: 'hard' | 'default' | 'inactive_extension'` et `lockedScope: 'system' | 'user' | 'systemDefaults'`.

#### `POST /workspace/skills/enable`

Capability tag : `workspace_skill_batch_toggle`. La forme qualifiée par workspace est `POST /workspaces/:workspace/skills/enable`.

Basculez jusqu'à 100 skills chargés en une seule requête ; la limite compte les entrées brutes de `skillNames` avant déduplication. Les noms sont rognés et dédupliqués de manière insensible à la casse tout en préservant l'ordre de première apparition. Le daemon valide contre un seul snapshot de statut de Skill, persiste tous les changements valides en une seule écriture de paramètres verrouillée, et rafraîchit les sessions actives une fois. Le traitement est best-effort pour les erreurs de cible attendues : une cible inconnue, masquée, inactive-extension ou verrouillée est enregistrée dans `errors` sans empêcher l'application des autres cibles valides. Les échecs inattendus de persistance ou de génération runtime font toujours échouer l'ensemble de la requête.

Requête :

```json
{
  "skillNames": ["review", "deploy", "missing"],
  "enabled": false
}
```

Réponse (200) :

```json
{
  "enabled": false,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "results": [
    {
      "skillName": "review",
      "enabled": false,
      "changed": true
    },
    {
      "skillName": "deploy",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": [
    {
      "skillName": "missing",
      "code": "skill_not_found",
      "error": "Skill not found: missing"
    }
  ]
}
```

Les erreurs de cible utilisent `skill_not_found`, `skill_not_toggleable`, ou `skill_inactive_extension`. Les requêtes malformées renvoient HTTP 400 avec `invalid_skill_names`, `invalid_skill_name`, ou `invalid_enabled_flag`. L'authentification, la confiance workspace, l'identité client, les échecs inattendus de persistance et les échecs de génération runtime font échouer l'ensemble de la requête via les gates standard de la route. Les champs de lot `activation`, `sessionsRefreshed` et `sessionsFailed` décrivent le rafraîchissement unique de session live partagé par tous les résultats modifiés. `activation` rapporte la tentative de rafraîchissement plutôt que le résultat : un lot dans lequel aucune cible n'a changé (par exemple, chaque cible a généré une erreur) répond tout de même `applied` lorsqu'une session est live, correspondant à la réponse no-op single-Skill ; déduisez ce qui a réellement changé depuis le flag `changed` de chaque résultat et le tableau `errors`. Lorsqu'au moins une cible change, le daemon émet les mêmes métadonnées de mutation `settings_changed` que la route single-Skill ; chaque événement `skills.disabled` / `skills.enabled` de cette requête partage un seul `mutation.id`.

#### `POST /workspace/init`

Capability tag : `workspace_init`. E/S fichier pures — pas d'aller-retour ACP, **aucune invocation de LLM**.

Génère un `QWEN.md` vide (ou quel que soit le fichier retourné par `getCurrentGeminiMdFilename()` avec les overrides de `--memory-file-name`) à la racine du workspace principal du démon. Action purement mécanique — pour un remplissage de contenu par IA, enchaînez avec `POST /session/:id/prompt`.

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

#### `POST /workspace/mcp/reload`

Recharge les paramètres MCP persistés dans la configuration de découverte du workspace et
chaque session active. La forme qualifiée par workspace est
`POST /workspaces/:workspace/mcp/reload`.

Corps de la requête :

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` est optionnel et par défaut à `false`, préservant
la réconciliation incrémentale. Lorsqu'il est vrai, le daemon reconnecte chaque serveur MCP
configuré éligible après la réconciliation des paramètres. Alternativement, passez
`forceReconnectWhich: ["server-a", "server-b"]` pour reconnecter uniquement les serveurs
nommés. Les options sont mutuellement exclusives. Une reconnexion forcée fait lire à chaque
transport les identifiants qu'un autre processus Qwen Code local peut avoir
écrits dans le stockage de tokens ; cela ne démarre pas un flux d'autorisation OAuth.

La route renvoie `202 { "accepted": true }` ; interrogez `GET /workspace/mcp` pour
le statut de connexion final. Les valeurs d'options invalides renvoient 400.

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
X-Qwen-Event-Epoch: ...  ← optionnel, associe le curseur avec son epoch de bus
X-Qwen-Client-Id: ...    ← identité client optionnelle et corrélation diagnostique
```

Query params :

| Param              | Requis | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued`        | non       | Limite de **backlog de frames en direct** par abonné. Plage `[16, 2048]`, par défaut 256. Les frames de replay poussées de force au moment de l'abonnement sont exemptées des limites de frames et d'octets ; ce qui les consomme réellement, ce sont les événements en direct qui arrivent pendant que l'abonné est encore en train de drainer un gros replay `Last-Event-ID: 0`. Augmentez cette valeur pour les reconnexions à froid afin que le tail en direct ne déclenche pas l'avertissement / l'éviction de client lent avant que le consommateur ne rattrape son retard. La limite d'octets sérialisés en direct est fixe côté démon (par défaut 2 MiB) et n'a pas de paramètre de requête. Les valeurs hors plage / non décimales / présentes mais vides renvoient `400 invalid_max_queued` avant l'ouverture du handshake SSE. Pre-flight `caps.features.slow_client_warning` — les anciens démons ignorent silencieusement ce paramètre. |
| `connectReason`    | non       | Indicateur diagnostique rapporté par le client : `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync`, ou `unknown`. Les valeurs invalides se normalisent en `unknown` et ne rejettent jamais le handshake. Le daemon n'utilise pas ce champ pour l'auth, le replay, l'éviction, la déduplication ou le remplacement de flux.                                                                                                                                                                                                                                                                                        |
| `previousStreamId` | non       | UUID du flux REST/SSE accepté précédent rapporté par le client. Les valeurs invalides sont ignorées. Il s'agit uniquement de lignée best-effort et ne modifie jamais le comportement du flux.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Un handshake réussi inclut `X-Qwen-SSE-Stream-Id: <uuid>`. Les passerelles de navigateur doivent préserver cet en-tête de réponse et l'exposer via `Access-Control-Expose-Headers`. Les anciens daemons ou intermédiaires peuvent l'omettre ; les clients doivent continuer normalement et traiter la lignée comme non disponible. L'id identifie cette connexion REST/SSE physique et corrèle son cycle de vie daemon, les diagnostics de file et la trace de requête.

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

- Envoyez `Last-Event-ID: <n>` pour rejouer les événements avec `id > n` depuis le ring par session (profondeur par défaut **8000**, ajustable via `qwen serve --event-ring-size <n>`).
- **Détection de lacunes :** si `<n>` est antérieur à l'événement le plus ancien encore présent dans le ring, le daemon émet une trame `state_resync_required` sans id avant de rejouer le suffixe survivant. Le SDK verrouille `awaitingResync` ; les clients doivent appeler `POST /session/:id/load` et reconstruire depuis la fenêtre de snapshot de relecture bornée actuelle. Ce snapshot peut lui-même commencer par `history_truncated` lorsque des entrées de relecture en mémoire plus anciennes ont été supprimées ; ce marqueur est informatif et ne doit pas démarrer une autre boucle de resync.
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

> **Délai d'expiration des permissions (désactivé par défaut).** Une `permission_request`
> reste en attente jusqu'à ce que : (a) un client vote ici, (b) `POST /session/:id/cancel`
> soit déclenché, (c) le client HTTP qui pilote le prompt se déconnecte
> (l'annulation en cours de prompt résout les permissions en attente comme `cancelled`),
> (d) la session soit tuée, (e) le démon s'arrête, **ou
> (f) son délai d'expiration configuré se déclenche**. Lors du déclenchement du délai, le
> `requestPermission` de l'agent se résout avec `{outcome: 'cancelled'}`, le ring d'audit
> enregistre une entrée `permission.timeout`, le stderr du démon émet un breadcrumb
> d'une ligne, et le bus SSE diffuse la trame annulée standard
> `permission_resolved` afin que les abonnés nettoient leurs états. Le
> délai partagé est configurable via
> `BridgeOptions.permissionResponseTimeoutMs` ou
> `qwen serve --permission-response-timeout-ms`. Sa valeur par défaut est `0`, donc
> les permissions ordinaires et `ask_user_question` attendent indéfiniment une décision
> humaine. L'annulation par un votant, l'annulation de session, le nettoyage de déconnexion et
> l'arrêt du démon résolvent toujours les interactions en attente comme annulées.

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

Capability tag : `auth_device_flow` (toujours annoncé). Providers supportés en
v1 : `qwen-oauth`.

> [!note]
>
> Le niveau gratuit de Qwen OAuth a été interrompu le 15/04/2026. Considérez `qwen-oauth` comme
> l'identifiant de provider hérité de la v1 dans ce protocole ; les nouveaux clients doivent privilégier un
> provider d'authentification actuellement supporté lorsqu'il y en a un de disponible.

**Localité d'exécution.** Le daemon ne lance jamais de navigateur — même s'il le peut. Le client décide d'appeler ou non `open(verificationUri)` localement ; sur un pod headless (le déploiement canonique du Mode B), l'utilisateur ouvre l'URL sur n'importe quel appareil disposant d'un navigateur. Consultez `docs/users/qwen-serve.md` pour l'UX recommandée.

**Aucune fuite de token dans les événements.** `auth_device_flow_started` ne contient que `{deviceFlowId, providerId, expiresAt}`. Le code utilisateur et l'URL de vérification sont renvoyés point à point dans le corps de la réponse POST 201 et via `GET /workspace/auth/device-flow/:id` ; ils ne sont jamais diffusés sur SSE.

**Singleton par provider.** Un second `POST` pour le même provider alors qu'un flux est en attente constitue une prise de contrôle idempotente : il renvoie l'entrée existante avec `attached: true` au lieu de lancer une nouvelle requête vers l'IdP.

#### `POST /workspace/auth/device-flow`

Gate de mutation stricte : nécessite un bearer token même sur les loopback sans token (`401 token_required`).

Requête :

```json
{ "providerId": "qwen-oauth" }
```

Réponse (`201` démarrage frais, `200` prise de contrôle idempotente) :

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
- `409 too_many_active_flows` — plafond workspace (4) atteint ; annulez-en un avec `DELETE`
- `401 token_required` — la gate stricte a refusé une requête sans token
- `502 upstream_error` — l'IdP a renvoyé une erreur inattendue

#### `GET /workspace/auth/device-flow/:id`

Lit l'état actuel. Les entrées en attente renvoient `userCode/verificationUri/expiresAt/intervalMs` ; les entrées terminales (grâce de 5 min) les suppriment et affichent `status` + `errorKind/hint` optionnels.

Renvoie `404 device_flow_not_found` pour les ids inconnus et les entrées évacuées post-grâce.

#### `DELETE /workspace/auth/device-flow/:id`

Annulation idempotente :

- entrée en attente → `204` + émission de `auth_device_flow_cancelled`
- entrée terminale → `204` no-op (pas de ré-émission d'événement)
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

Cinq événements typés (à l'échelle du workspace, diffusés sur chaque bus de session active) :

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST a réussi ; le SDK doit s'abonner (pas de userCode ici, récupérez-le via GET si nécessaire)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — le daemon a honoré le `slow_down` upstream ; les clients qui interrogent GET doivent augmenter leur intervalle pour correspondre
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — identifiants persistés ; `accountAlias` est un label non-PII (jamais email/téléphone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal ; `errorKind` est l'un des suivants : `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` est interne au daemon : l'échange IdP a réussi mais le daemon n'a pas pu stocker durablement les identifiants (EACCES / EROFS / ENOSPC). L'utilisateur doit réessayer une fois la condition de disque sous-jacente corrigée.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE a réussi contre une entrée en attente

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
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 cas, véritable enfant `qwen --acp` soutenu par le faux serveur OpenAI local (POSIX uniquement ; ignoré sur Windows)   |
