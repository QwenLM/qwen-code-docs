# Référence du protocole HTTP `qwen serve`

Étape 1 de la [conception du démon qwen-code](https://github.com/QwenLM/qwen-code/issues/3803). Toutes les routes se trouvent sous l'URL de base du démon (par défaut `http://127.0.0.1:4170`).

Cette référence décrit les routes HTTP et le cadrage SSE. Lisez-la conjointement avec le [schéma d'événements typé](./daemon/09-event-schema.md) pour les contrats de charge utile, les raisons de resynchronisation et les ancres d'historique, le [guide du bus d'événements et de la relecture](./daemon/10-event-bus.md) pour la livraison et la contre-pression, et [les capacités et le versionnement](./daemon/11-capabilities-versioning.md) pour le protocole `v1` existant et les règles de compatibilité. L'[index de la documentation du démon](./daemon/00-index.md) relie l'ensemble complet des contrats.

## Authentification [#authentication]

Lorsque le démon a été démarré avec `--token` ou `QWEN_SERVER_TOKEN` — ou lié à une adresse non-loopback sans aucun des deux, ce qui génère un jeton bearer éphémère affiché une seule fois au démarrage — **chaque route API normale sauf `/health` sur les liaisons loopback ordinaires** doit comporter :

```
Authorization: Bearer <token>
```

En l'absence de jeton configuré sur le loopback par défaut, l'en-tête est optionnel et les requêtes arrivant via le listener principal disposent de la pleine autorité API opérateur. La confiance dans l'espace de travail, la propriété de session, `X-Qwen-Client-Id`, les permissions, les fonctionnalités, la validation et les vérifications de ressources s'appliquent toujours. La comparaison de jetons est à temps constant. Les réponses 401 sont uniformes entre `missing header` / `wrong scheme` / `wrong token`.

**`--open-with-auth`.** Ce mode CLI désactivé par défaut nécessite une liaison loopback et un Web Shell disponible. Il réutilise la sélection normale de `--token` sur `QWEN_SERVER_TOKEN`, ou génère 32 octets aléatoires encodés en base64url avant le démarrage du démon si cette sélection est vide. Le navigateur reçoit le jeton bearer sélectionné via `#token=` et le stocke par onglet ; le protocole et le middleware voient un jeton configuré ordinaire. La livraison de fragment repose sur le jeton résolu, pas sur ce drapeau : tout lancement `--open` attache le jeton bearer résolu — configuré ou généré — au fragment `#token=` de l'URL lancée (visible par les utilisateurs locaux via `ps` / `/proc`, comme l'avertit le lanceur), donc une liaison non-loopback avec `--open` seul transmet son jeton bearer généré au navigateur de la même manière ; les contributions distinctes de ce drapeau sont la _génération_ de jeton sur loopback et le repli manuel d'URL pour les environnements sans navigateur. Seuls les appelants intégrés directs qui ignorent `RunHandle.resolvedToken`, et les clients qui ne lancent jamais de navigateur, ne reçoivent aucun identifiant automatique. Les environnements sans navigateur impriment l'URL de fragment contenant le secret pour une ouverture manuelle. `/health` loopback et les actifs statiques du Web Shell conservent les exemptions décrites ci-dessous ; `--require-auth` continue de contrôler l'accès à `/health`.

L'ingress webhook de canal (`POST /channels/:channelName/webhooks/:source`) est séparé de ce contrat bearer dans tous les modes. Lorsqu'il est monté, il est enregistré avant `bearerAuth` et s'authentifie avec son `x-qwen-webhook-secret` configuré ; la rotation du jeton bearer du démon ne fait pas tourner les secrets des sources de webhook.

**Exemption `/health`** (Bctum) : sur les liaisons loopback (`127.0.0.0/8` / `localhost` / `::1` / `[::1]`), `/health` est enregistré AVANT le middleware bearer, afin que les sondes de vivacité à l'intérieur du pod n'aient pas besoin de porter le jeton même lorsque le démon a été démarré avec `--token`. Les liaisons non-loopback (`--hostname 0.0.0.0` etc.) contrôlent l'accès à `/health` avec les autres routes API normales — voir la section [`GET /health`](#get-health) pour la justification.

**`--require-auth` (#4175 PR 15).** Passez ce drapeau au démarrage pour étendre la règle « doit avoir un jeton » au loopback également. Le démarrage échoue lorsqu'aucune source de jeton ne se résout — sur loopback cela signifie `--token`, `QWEN_SERVER_TOKEN` ou `--open-with-auth` (qui installe son propre jeton généré avant le démarrage, donc `--require-auth --open-with-auth` démarre). L'échec rapide est spécifique au loopback : une liaison non-loopback résout le jeton bearer éphémère qu'elle génère lorsque aucune des sources configurées n'est présente, et cela satisfait au drapeau. L'exemption `/health` est supprimée dans les deux cas, donc `/health` exige également `Authorization: Bearer …`.

Lorsque le drapeau est activé, le middleware global `bearerAuth` contrôle l'accès à **chaque route API normale** — y compris `/health` et `/capabilities`. L'ingress webhook de canal reste authentifié indépendamment par secret partagé, et les routes document et actifs du Web Shell restent pré-authentifiées. Un client **non authentifié** ne peut donc pas pré-voler `caps.features` pour découvrir que l'authentification est requise : la surface de découverte pour ce cas est le **corps de réponse 401** lui-même (uniforme entre les routes contrôlées par bearer selon la section [Authentication](#authentication)). La balise de capacité `require_auth` est une **confirmation post-authentification** — une fois qu'un client s'authentifie avec succès et lit `/capabilities`, la présence de la balise confirme que le démon a été démarré avec `--require-auth` (utile pour les interfaces d'audit/conformité et pour que les clients SDK affichent « ce déploiement est durci » dans un panneau de paramètres). Les routes de mutation strictes acceptent les requêtes du listener principal loopback de confiance, les requêtes authentifiées par bearer, ou les requêtes Local Control appariées. Les embeds token-less non fiables reçoivent toujours `401 { code: "token_required", error: "…" }` ; avec `--require-auth`, le middleware bearer global rejette d'abord avec le corps legacy `Unauthorized`.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Les clients navigateur touchant le démon en cross-origin sont bloqués par défaut — une requête portant un en-tête `Origin` retourne `403 {"error":"Request denied by CORS policy"}` car les clients CLI/SDK n'envoient jamais `Origin` et le démon traite sa présence comme un signe que la requête provient d'un contexte navigateur que l'opérateur n'a pas activé. Une exception précède le mur sur une liaison non-loopback avec jeton : une requête same-origin (`Origin` égal au schéma du socket direct plus l'autorité normalisée `Host`) est authentifiée par bearer et son `Origin` est retiré **sur le listener principal** — avec un bearer valide, le statut de la route suit, avec un bearer manquant ou invalide un `401`, **sauf les routes pré-authentifiées document Web Shell, `/assets/*`, `/manifest.webmanifest`, `/sw.js` et `/mcp-app-sandbox`, qui sont servies sans identifiant comme dans tous les autres modes** — et seules les valeurs `Origin` cross-origin ou non correspondantes conservent l'enveloppe `403`. Passez `--allow-origin <pattern>` (répétable) au démarrage pour installer une liste blanche au lieu du mur. Chaque motif est soit :

- La valeur littérale `*` — admet toute origine. **Risqué** : le démarrage refuse si `*` est configuré mais qu'aucun jeton bearer ne se résout. Le garde lit le jeton _résolu_ — `--token`, `QWEN_SERVER_TOKEN`, le jeton loopback généré par `--open-with-auth`, ou le jeton bearer éphémère généré par une liaison non-loopback lorsqu'aucune source configurée n'est présente — ce refus concerne donc uniquement le loopback. Le fil de trace au démarrage émet un avertissement stderr lorsque `*` figure dans la liste. **Recommandation** : associez-le à `--require-auth` sur les liaisons loopback afin que `/health` soit également protégé par le bearer — il est enregistré avant le middleware bearer sur loopback par défaut (afin que les sondes k8s/Compose puissent y accéder sans jeton), et une liste blanche `*` le rend accessible depuis tout navigateur cross-origin. `--require-auth` laisse toujours les ressources statiques Web Shell (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, ainsi que les navigations documentaires `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` et `/settings`) pré-authentifiées sur loopback par conception — elles sont montées avant le middleware bearer — donc sous une liste blanche `*`, elles restent lisibles depuis tout navigateur cross-origin ; `--no-web` supprime cette surface. Sur les liaisons non-loopback, le bearer est déjà obligatoire au démarrage et `/health` est enregistré derrière lui. Les routes API normales sont protégées par bearer, l'ingress des webhooks de canal conserve sa propre protection par secret partagé, et les ressources statiques Web Shell (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, ainsi que les navigations documentaires `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` et `/settings`) restent pré-authentifiées sauf si `--no-web` les supprime.
- Une origine d'URL canonique — `<scheme>://<host>[:<port>]`. **Sans barre oblique finale, sans chemin, sans userinfo, sans requête.** Le démarrage refuse avec `InvalidAllowOriginPatternError` si l'entrée échoue à la vérification aller-retour `new URL(pattern).origin === pattern` ; le message d'erreur nomme le motif incorrect et la forme canonique. Strict par intention : une normalisation silencieuse (par ex. la suppression d'une barre oblique finale `/`) laisserait passer les fautes de frappe et accepterait des entrées ambiguës. Sans jeton résolu — ce qui signifie après génération une liaison loopback — les entrées HTTP(S) sont limitées aux hôtes loopback ; une origine de navigateur non-loopback nécessite un jeton car elle peut sinon piloter l'API opérateur complète, y compris l'exécution de code en tant qu'utilisateur du démon. Les origines explicites d'extensions de navigateur conservent leur chemin existant d'automatisation locale sans jeton. Le journal de démarrage indique l'autorité accordée à toute origine de navigateur autorisée sans jeton.

Les origines correspondantes reçoivent les en-têtes de réponse CORS standard sur chaque requête :

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` renvoie l'origine de la requête verbatim (minuscules / majuscules telles que envoyées par le navigateur) plutôt que la valeur littérale `*`, même sous le motif `*` — les caches des navigateurs indexent les réponses dessus associé à `Vary: Origin`, et le renvoi laisse la possibilité d'ajouter `Access-Control-Allow-Credentials` dans une version ultérieure sans modification de schéma. Les en-têtes exposés permettent aux clients navigateur de respecter les indications de nouvelle tentative, de conserver l'époque SSE et de corréler les flux physiques acceptés. `Access-Control-Allow-Credentials` n'est **PAS** envoyé aujourd'hui : les identifiants de démon configurés utilisent bearer-in-`Authorization`, qui fonctionne en cross-origin sans `credentials: 'include'` ; l'autorité loopback de confiance n'a besoin d'aucun identifiant navigateur.

Les requêtes de pré-vol OPTIONS (OPTIONS avec `Access-Control-Request-Method` ou `Access-Control-Request-Headers`) court-circuitent avec `204 No Content` plus les en-têtes ci-dessus. C'est le modèle CORS conventionnel et c'est sûr — la pré-vol confirme uniquement quelles méthodes/en-têtes le démon acceptera ; la requête subséquente réelle exécute toujours la porte Host puis soit l'autorité bearer/listener, soit la porte de secret partagé du webhook de canal avant toute lecture ou mutation d'état. Les requêtes OPTIONS simples provenant d'origines correspondantes continuent de s'écouler vers l'aval avec les en-têtes CORS attachés.

Les origines qui ne correspondent pas à la liste blanche reçoivent toujours `403 {"error":"Request denied by CORS policy"}` — même enveloppe que le mur par défaut, afin que les clients ayant déjà analysé la réponse du mur n'aient pas à traiter spécifiquement les démons déployés avec liste blanche. Le chemin de rejet **n'émet** aucun en-tête `Access-Control-*` (le navigateur les ignorerait, et leur émission annoncerait indirectement la taille de la liste blanche via la présence d'en-têtes).

La liste de motifs configurée n'est volontairement PAS renvoyée dans `/capabilities` — un client navigateur connaît déjà sa propre origine (il a appelé le démon, après tout), et afficher la liste permettrait à un lecteur non authentifié de `/capabilities` d'énumérer toutes les origines de confiance (reconnaissance utile pour un déploiement mal configuré). Les clients SDK se basent sur la balise `caps.features.allow_origin` pour « ce démon honore les hits de navigateur cross-origin » sans avoir besoin de connaître les origines spécifiques.

Les requêtes en boucle locale (par exemple, le Web Shell appelant le démon sur la même `127.0.0.1:port`) sont gérées par un shim de suppression d'origine **séparé** qui s'exécute AVANT l'intergiciel CORS et supprime l'en-tête `Origin` pour `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` ou l'adresse et le port de bouclage liés exacts. Il accepte également les formes sans port correspondant au schéma que les navigateurs envoient pour les ports par défaut : `http://host` sur le port 80 et `https://host` sur le port 443. Ces requêtes passent indépendamment de la configuration `--allow-origin` — les opérateurs n'ont pas besoin de lister le propre port du démon pour faire fonctionner le Web Shell.

## Forme d'erreur courante

Les réponses 5xx portent le `code` et le `data` de l'erreur originale lorsqu'ils sont présents (style JSON-RPC — le SDK ACP transmet `{code, message, data}` depuis l'agent) :

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

Un JSON malformé dans un corps de requête renvoie :

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

avec le statut `404`. Une fermeture concurrente utilise `code: "session_closing"`.

`WorkspaceMismatchError` pour un `POST /session` dont le `cwd` ne se canonise pas vers un espace de travail enregistré renvoie `400` avec :

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

Utilisez ceci pour détecter les incompatibilités avant vol : lisez `workspaceCwd` depuis `/capabilities` et omettez `cwd` de `POST /session` (il retombe sur l'espace de travail principal), ou lorsque `multi_workspace_sessions` est annoncé, choisissez-en un parmi `workspaces[].cwd`.

`POST /session` dépassant le plafond `--max-sessions` configuré du démon renvoie `503` avec un en-tête `Retry-After: 5` et :

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

Lorsque le plafond total effectif à l'échelle du démon rejette une nouvelle session — `--max-total-sessions`, ou le défaut décrit sous `limits.maxTotalSessions` — la même forme de réponse est renvoyée avec `"scope": "total"`.

Les attaches aux sessions existantes NE SONT PAS comptées dans le plafond, de sorte que les reconnexions d'un démon inactif continuent de fonctionner même lorsqu'il est à pleine capacité.

Si le budget d'initialisation du canal ACP expire avant que `newSession` soit expédié, `POST /session` renvoie `504` avec `Retry-After: 5` et :

```json
{
  "error": "AcpSessionBridge initialize timed out after 10000ms",
  "code": "init_timeout",
  "errorKind": "init_timeout",
  "retryable": true,
  "sideEffectPossible": false,
  "phase": "channel.initialize",
  "timeoutMs": 10000
}
```

`timeoutMs` — et le suffixe numérique de `error` — reflètent le budget `--initialize-timeout-ms` configuré du démon (les valeurs ci-dessus sont les défauts). La forme complète de nouvelle tentative sûre ci-dessus est émise uniquement pour la création simple de session, où l'initialisation du canal précède strictement toute mutation durable : sur ce chemin, le champ `sideEffectPossible: false` est faisant foi car l'initialisation précède la requête ACP `newSession`, et un client qui comprend ce contrat structuré peut retenter après le délai annoncé sans risquer un Session dupliqué.

Les requêtes portant `branch` ou `worktree`, ainsi que les délais d'initialisation signalés par les routes comportant des mutations autres que la création simple (par exemple `POST /session/:id/branch` et `POST /session/:id/side-task`, où un fork engagé peut survivre à l'échec de la poignée de main), renvoient le même `504` avec `code: "init_timeout"`, `phase` et `timeoutMs` — mais SANS `Retry-After`, `retryable` ou `sideEffectPossible`. Pour celles-ci, le résultat de la mutation est inconnu : la préparation de la branche et du worktree modifie git avant l'initialisation du canal, et la tentative de rollback en cas d'échec est au mieux (un échec du rollback de checkout laisse l'espace de travail sur la nouvelle branche, et une nouvelle tentative peut révéler un conflit de branche existante). Les clients qui classifient toutes les réponses de mutation 5xx comme ambiguës restent conservateurs et en mode fail-closed, et doivent appliquer la même politique à la forme réduite. `POST /session/:id/load` et `POST /session/:id/resume` affichent la même `init_timeout` `504` réduite lorsque l'initialisation du canal dépasse le délai avant que la demande de restauration ne soit envoyée (l'étape `ensureChannel`) ; contrairement aux `session_restore_timeout` `504` documentés dans leurs listes d'erreurs, cette forme ne comporte ni `Retry-After`, ni `retryable`, et n'installe pas de verrou car la restauration n'a jamais été envoyée. Le délai d'envoi `newSession` sur `POST /session` est une exception : il renvoie `504` avec `code: "init_timeout"`, `retryable: true` et un `Retry-After` dérivé du budget, mais sans `phase` ni `sideEffectPossible`, car le résultat de la création est ambigu. Toutes les autres étiquettes de délai conservent le mappage générique.

`RestoreInProgressError` — émis par `POST /session/:id/load`, `POST /session/:id/resume` ou un `POST /session` avec id fourni par l'appelant lorsqu'une autre inscription possède déjà cet id — renvoie `409` et :

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

Déclenché lorsqu'un `session/load` est émis pour un id ayant déjà un `session/resume` en cours (ou inversement), ou lorsqu'une génération avec id fourni par l'appelant entre en concurrence avec l'une des directions de restauration. Attendez au moins `Retry-After` secondes et réessayez. Les concurrences de même action (`load` vs `load`, `resume` vs `resume`) sont fusionnées au lieu de générer une erreur pendant que la restauration est active.

`reason` distingue deux verrous partageant ce code, et l'en-tête `Retry-After` le suit :

| `reason` | Signification | `Retry-After` |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `restore_in_progress` | Une restauration ordinaire est en cours. | `5` (correspondant à `session_limit_exceeded`) |
| `awaiting_abandoned_cleanup` | L'appelant public a déjà reçu un délai (`504` pour la restauration, ou `init_timeout` pour l'initialisation de session) et la demande ACP non annulable ainsi que son nettoyage ne se sont pas encore terminés. | le budget de l'opération expirée en secondes — restauration, ou initialisation pour une génération avec id fourni par l'appelant — limité à `5`–`120` |

La demande de restauration publique est régie par `limits.sessionRestoreTimeoutMs` (par défaut 60 s). Après un `504`, l'id reste verrouillé jusqu'à ce que la demande ACP tardive et le nettoyage se terminent, donc un client qui continue de réessayer selon le cadencement ordinaire de 5 secondes tournerait en boucle contre un 409 qu'il ne peut pas effacer — respectez l'indice dérivé du budget accompagnant `awaiting_abandoned_cleanup`.

`SessionWorkspaceConflictError` — émis par `POST /session/:id/load` et `POST /session/:id/resume` lorsque le `cwd` demandé cible un espace de travail inscrit mais que le même id de session est déjà actif ou en cours de restauration par un autre runtime — renvoie `409` avec :

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

Les clients doivent réessayer avec l'espace de travail propriétaire ou attendre la fin de la restauration en cours avant de restaurer l'id dans un espace de travail différent. Les concurrences de restauration dans le même espace de travail continuent d'utiliser le comportement de coalescence / `restore_in_progress` du pont.

`SessionArchivedError` est émis lorsqu'un appelant tente de charger ou reprendre une session dont le JSONL est sous `chats/archive/` :

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

avec le statut `409`.

`SessionArchivingError` est émis lorsqu'une transition d'archivage ou désarchivage de session est déjà en cours pour le même id :

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

avec le statut `409` et `Retry-After: 5`.

## Capacités [#capabilities]

Le démon annonce ses balises de fonctionnalité prises en charge depuis le registre des capacités serve. Les clients **doivent** désactiver l'interface utilisateur via `features`, et non via `mode` (conformément à la conception §10).

```
['health', 'capabilities', 'session_create', 'session_startup_config', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_catalog_batch', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_mid_turn_send_now',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_skills_config_runtime',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'scheduled_task_gate', 'autofix_pr_watches', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_resources', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload', 'workspace_file_delete', 'workspace_directory_create', 'workspace_directory_delete',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_skill_settings_toggle', 'workspace_skill_settings_batch_toggle',
 'workspace_session_refresh',
 'extension_batch_activation_v2', 'extension_activation_explicit_refresh',
 'extension_state',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_btw_stream', 'session_shell_command',
 'standalone_sessions_v1', 'standalone_session_options_v1',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'user_language_sync', 'session_message_deletion', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'workspace_model_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name', 'workspace_runtime_removal', 'workspace_runtime',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'extension_local_path_install',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state', 'workspace_session_live_state_batch',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> Les balises conditionnelles n'apparaissent que si leur condition de disponibilité de déploiement ou de runtime est remplie (voir le tableau ci-dessous). La balise `permission_mediation` de F3 est toujours activée et porte `modes: ['first-responder', 'designated', 'consensus', 'local-only']` afin que les clients SDK puissent introspecter l'ensemble pris en charge par la compilation ; la stratégie active au runtime se trouve dans `body.policy.permission`.

`session_startup_config` annonce `startupConfig: { modelServiceId, reasoningEffort? }` facultatif lors de la création ordinaire et autonome. Effectuez toujours un préflight de cette balise : les anciennes routes de création ordinaire peuvent silencieusement ignorer l'objet. `modelServiceId` est requis (1–256 caractères) ; `reasoningEffort` accepte `none`, `default`, `low`, `medium`, `high`, `xhigh` ou `max` lorsque pris en charge par le modèle sélectionné. L'omission applique uniquement le modèle, sans réglage de raisonnement ni `default` implicite. L'objet ne peut pas être combiné avec le `modelServiceId` hérité de niveau supérieur ou une portée unique explicite et implique un nouveau fil. Le démarrage ne sauvegarde jamais les valeurs par défaut partagées ; le comportement ultérieur des sessions reste inchangé.

Le succès inclut `modelApplied: true` et `startupConfigApplied: { modelServiceId, reasoningEffort?, effectiveReasoning? }`. Le sélecteur de modèle est canonique. Seules les demandes de raisonnement explicites incluent les deux champs de raisonnement ; l'état effectif est `{ state: 'disabled' }`, `{ state: 'provider-default' }` ou `{ state: 'enabled', effort? }` (le raisonnement par bascule seule n'a pas d'effort). Une structure invalide est `400 invalid_startup_config` ; une sélection rejetée ou non confirmée est `422 startup_config_rejected`. Un rejet définitif autonome annule son enregistrement possédé et tente de supprimer le répertoire de sortie vide avant de retourner ; un rollback d'enregistrement dont la suppression ne peut être confirmée et les échecs transitoires de démarrage conservent `standalone_creation_outcome_unknown`, tandis qu'un échec de suppression du répertoire est seulement journalisé et le rejet définitif est toujours retourné. Un échec de confirmation du corps de succès dans le SDK est une erreur de protocole, et non une instruction pour adopter une session récupérée.

`session_scope_override` est la poignée de négociation pour le champ `sessionScope` par requête sur `POST /session` (voir ci-dessous). Les anciens démons ignorent silencieusement le champ, donc les clients SDK devraient effectuer un pré-flight de `caps.features` pour cette balise avant de l'envoyer.

`session_id_override` est la poignée de négociation pour le `sessionId` fourni par l'appelant facultatif sur les métadonnées `POST /session` et ACP `session/new`. Les clients doivent confirmer que `caps.features` contient cette balise avant d'envoyer le champ car les anciens démons peuvent l'ignorer silencieusement.

`persistent_workspace_registration` annonce l'inscription durable pour les espaces de travail ajoutés au runtime. `POST /workspaces` accepte `{ "cwd": "/absolute/path", "persist": true }` ; le succès inclut `persisted: true`. Les inscriptions sont limitées à l'espace de travail primaire canonique du démon sous le répertoire Qwen de l'utilisateur et sont restaurées au prochain démarrage du démon. Omettre `persist` préserve l'inscription locale au processus. `GET /workspace-registrations` liste l'ensemble souhaité stocké, et `DELETE /workspace-registrations/:id` oublie une entrée pour le prochain redémarrage sans retirer à chaud un runtime actif.

`workspace_display_name` annonce l'entrée `displayName` facultative sur `POST /workspaces`, les mises à jour de métadonnées d'espace de travail via `PATCH /workspaces/:workspace`, et les champs de nom d'affichage facultatifs dans les projections d'espace de travail. Les noms ne participent pas à la recherche ou au routage : `id` et `cwd` canonique restent les seuls sélecteurs, et les noms dupliqués sont autorisés.

`workspace_runtime_removal` annonce le retrait à chaud synchrone via `DELETE /workspaces/:workspace`. Les entrées de capacité d'espace de travail ajoutent un champ optionnel `removable` ; seules les lignes avec `removable: true` peuvent être supprimées. La suppression oublie également tous les alias d'enregistrement persistants pour le runtime, mais ne supprime jamais les fichiers, paramètres, transcriptions ou archives.

`workspace_runtime` annonce `GET /workspace/runtime/status`, `POST /workspace/runtime/ensure` et leurs équivalents `/workspaces/:workspace/runtime/...`. `ensure` n'accepte aucune sélection de capacité : il démarre ou réutilise le runtime ACP de l'espace de travail fiable sélectionné et renvoie son état de cycle de vie et son epoch de runtime monotone. Les routes principales sont possédées uniquement par le runtime principal ; les routes qualifiées résolvent uniquement le runtime enregistré sélectionné et ne reviennent jamais en arrière. Un ensure réussi renouvelle la fenêtre de keepalive de dix minutes du runtime. Le statut est en lecture seule et ne démarre jamais l'enfant. Les ensures concurrents partagent un seul démarrage physique. Un démarrage en cours ou échoué renvoie des erreurs réessayables `503 runtime_still_starting` ou `503 runtime_initialization_failed`. La préparation des capacités peut continuer après l'expiration du budget d'observation de l'ensure ; dans ce cas, ensure renvoie toujours le runtime actif avec un état de capacité non prêt pour le polling de statut. La capacité est annoncée uniquement lorsque tous les ponts de runtime actifs fournissent l'instantané de cycle de vie autoritaire ; un pont injecté hérité sélectionné renvoie `501 workspace_runtime_not_supported` au lieu d'un état ou d'un epoch deviné.

`workspace_runtime_stop` annonce indépendamment l'arrêt de runtime confirmé par l'utilisateur. `GET /workspaces/runtime-stop-options` est une prévisualisation globale au processus en lecture seule : elle inclut le nombre d'enfants engagés, le plafond modélisé d'enfants, et pour chaque espace de travail visible ses sessions, raisons de blocage, ID de canal, epoch, jeton d'arrêt actuel et dernier reçu. Les sessions chargées ordinaires peuvent être explicitement arrêtées ; les clients ACP indépendants, les planifications activées, les travaux de planification/gestion/démarrage en attente, les tâches de mémoire, les workers, la voix et les runtimes à usage spécial sont bloqués. `POST /workspaces/:workspace/runtime/stop` utilise la porte de mutation stricte et uniquement le runtime fiable sélectionné. Envoyez `confirmInterruptions: true`, `expectedChannelId`, `expectedRuntimeEpoch`, `expectedStopToken` et le `expectedSessionIds` exact depuis la prévisualisation. Ne revenez jamais au runtime principal. La prévisualisation et chaque reçu listent les canaux ACP actifs du runtime comme `channels` (`channelId`, `runtimeEpoch`, `executionEngine` optionnel) ; un runtime peut avoir un canal par moteur d'exécution, et un arrêt couvre tous ces canaux. `channelId` nomme le premier canal listé et `runtimeEpoch` est le plus récent epoch listé, donc un canal démarré après la prévisualisation rend la confirmation obsolète.

Une réponse réussie contient `state: "stopped"`, `stopped: true` et `released: true`, après la fermeture des sessions reconnues et la libération du registre de processus de chaque enfant listé. L'enregistrement, les fichiers et l'historique sauvegardé restent. Les réponses incluent les IDs de session affectés, interrompus, fermés et restants. Une confirmation obsolète ou bloquée est HTTP 409 (`workspace_runtime_stop_stale` / `workspace_runtime_stop_blocked`) ; une fermeture partielle est 409 `workspace_runtime_stop_incomplete` ; un démantèlement en cours ou échoué sans preuve de libération est 503 `workspace_runtime_stop_in_progress` / `workspace_runtime_stop_failed` ; une gestion non prise en charge est 501 `workspace_runtime_stop_not_supported`. Un démantèlement impur qui prouve ultérieurement la libération du registre peut renvoyer 200 avec un avertissement d'erreur ; un flush de session non confirmé renvoie toujours un résultat partiel/erreur. Le budget total d'observation/fermeture est de 60 secondes. S'il expire pendant qu'une fermeture de session est encore en vol, la réponse se stabilise avec `state: "failed"` et `503 workspace_runtime_stop_failed` ; le nettoyage continue séparément. L'espace de travail sélectionné reste isolé et son enfant reste compté jusqu'à l'achèvement réel du nettoyage, même si l'appelant a reçu un échec. Les options en lecture seule peuvent signaler ultérieurement `stopped` après les fermetures reconnues et la libération prouvée, ou `incomplete` lorsque la persistance était non confirmée ; l'instantané d'échec déjà renvoyé ne change pas. Si le budget est plutôt épuisé entre les fermetures de sessions, la réponse se stabilise avec `state: "incomplete"` et `409 workspace_runtime_stop_incomplete` : aucune autre fermeture ou kill forcé n'est lancé, la garde d'admission de l'arrêt est relâchée (l'enfant survivant reste compté normalement), et l'arrêt des sessions restantes nécessite une nouvelle prévisualisation et confirmation. Un refus de flush n'est pas contourné par un kill forcé des sessions restantes. La sortie racine ou une chute du nombre global de processus seul n'établit pas la libération de l'enfant sélectionné. Sous Windows, où le registre ne suit pas les groupes de processus descendants, la sortie stabilisée de la racine est la preuve de libération, donc `released: true` ne prouve pas que l'arbre de processus a disparu là-bas.

La confirmation répétée du dernier jeton consommé observe la même opération. Une nouvelle confirmation peut réessayer un arrêt incomplet, en faisant pivoter le jeton ; les anciens jetons consommés deviennent alors obsolètes. Si une réponse est perdue, lisez les options et faites correspondre le dernier reçu par espace de travail et jeton d'arrêt au lieu d'arrêter une autre cible. Les reçus peuvent être indisponibles après suppression, changements de confiance, ou recréation de daemon/pont ; leur absence laisse le résultat inconnu et n'autorise jamais la continuation. SDK `runtimeStopOptions()` et `workspaceById(id).stopRuntime(confirmation)` utilisent REST même avec un transport ACP et ne répètent jamais automatiquement le POST. Les abonnés de session reçoivent `session_closed` avec `reason: "client_close"` et `cause: "workspace_runtime_stop"` ; les sorties fatales associées à l'arrêt marquent également `persistenceUnconfirmed: true`. Les clients Web Shell mis à jour conservent la sélection/transcription sauvegardée et attendent un Resume explicite. Ceci est un arrêt unique, pas une suspension persistante ; un client ayant manqué l'événement peut à nouveau rivaliser pour la capacité.

Les réponses de statut et d'ensure de runtime utilisent cette forme :

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "state": "active",
  "runtimeLive": true,
  "runtimeEpoch": 4,
  "capabilities": {
    "skills": {
      "state": "ready",
      "revision": 2,
      "runtimeEpoch": 4
    }
  }
}
```

Lorsqu'un runtime d'espace de travail a plus d'un moteur d'exécution, `runtimeLive` et `runtimeEpoch` décrivent le canal qui sert le contrôle d'espace de travail (MCP et Skills) : tant que ce canal est actif, le démarrage ou la sortie d'un autre moteur ne les modifie pas. `state` signale ce canal comme `cold`, `starting` ou `stopping` lorsqu'il n'est pas actif ; `active` et `idle` comptent le travail sur tous les moteurs.

`capabilities.skills.state` est `not_started`, `starting`, `ready`, `stale`, ou `error` ; les échecs incluent `{code, message}` dans `capabilities.skills.error`. Un catalogue Skills est à jour uniquement lorsque les valeurs `runtimeEpoch` de niveau supérieur et de capacité correspondent. `revision` ordonne la préparation des Skills au sein d'un seul epoch de runtime et ne doit pas être comparé entre epochs.

`workspace_skills_config_runtime` annonce les lectures Skills divisées et les mutations de configuration sous `/workspace/{config,runtime}/skills` et `/workspaces/:workspace/{config,runtime}/skills`. Le Web Shell utilise ces routes pour la gestion des Skills et, lors de la composition d'une nouvelle session, pour peupler les commandes slash depuis la config juste avant de les remplacer par un catalogue de runtime d'epoch correspondant. Lorsque la fonctionnalité est absente, les clients doivent continuer à utiliser les routes Skills héritées et ne doivent pas appeler l'ensure de runtime uniquement pour les Skills.

`session_load` et `session_resume` annoncent les routes de restauration explicite (`POST /session/:id/load` et `POST /session/:id/resume`). Les daemons plus anciens renvoient `404` pour ces chemins, donc les clients SDK devraient faire un pré-vol `caps.features` avant d'appeler. `unstable_session_resume` est toujours annoncé comme un alias déprécié pour la compatibilité avec les SDK livrés lorsque la méthode ACP sous-jacente s'appelait `connection.unstable_resumeSession` ; les nouveaux clients devraient faire un gate sur `session_resume`.

`limits.sessionRestoreTimeoutMs`, lorsqu'il est présent, représente le budget d'horloge murale du démon pour la requête ACP sous-jacente `loadSession` / `unstable_resumeSession`. Il s'agit d'un champ v1 additif. Le SDK TypeScript accorde au démon 10 secondes de marge côté client, et le watchdog Web Shell lui en accorde 15 ; les clients communiquant avec un démon plus ancien doivent utiliser respectivement 70 et 75 secondes.

`session_transcript` annonce `GET /session/:id/transcript`, une vue de relecture paginée en lecture seule sur le JSONL persisté des sessions actives. Elle est distincte de `/load` : elle n'attache pas de client, ne précharge pas l'EventBus en direct, ne crée pas de session en direct et ne modifie pas la fenêtre de relecture en direct. Les clients doivent l'utiliser lorsqu'ils ont besoin de la transcription complète sur disque pour une longue session, et continuer à utiliser `/load` uniquement pour la relecture en direct bornée lors de la restauration froide de l'interface utilisateur.

`workspace_persisted_transcript` annonce `GET /workspaces/:workspace/session/:id/transcript`, un paginateur local au démon fonctionnant uniquement sur les données persistées, qui ne démarre pas ACP, n'interroge pas l'état du pont en direct, ne charge pas les paramètres, ne découvre pas les capacités du projet et ne crée pas la clé de curseur persistée héritée. La balise est inconditionnelle car les primaires fiables mono-espace de travail peuvent utiliser la route plurielle ; l'autorisation de confiance par espace de travail est toujours évaluée à chaque requête. Les secondaires non fiables enregistrés peuvent lire, tandis qu'un primaire non fiable reste rejeté.

`workspace_session_export` annonce `GET /workspaces/:workspace/session/:id/export`, un export complet réservé aux entités fiables de la session active persistée de l'espace de travail sélectionné. Il est indépendant de `session_export` et `workspace_qualified_rest_core` : les démons publiés peuvent annoncer les deux anciennes balises sans implémenter la route plurielle, donc les clients doivent vérifier directement cette balise avant utilisation. La balise est inconditionnelle car un primaire fiable mono-espace de travail peut utiliser la route par id ou cwd. L'export ne résout pas un propriétaire en direct, ne démarre pas ACP, n'attache pas de client et ne bascule pas vers un autre espace de travail.

`workspace_archived_session_export` annonce `GET /workspaces/:workspace/session/:id/archive/export`, un export complet réservé aux entités fiables depuis le stockage persisté archivé de l'espace de travail sélectionné. Il est indépendant de `workspace_session_export` et `workspace_qualified_rest_core` ; les clients doivent vérifier directement cette balise avant utilisation. Une route distincte empêche un démon plus ancien d'ignorer l'intention d'archivage et de renvoyer une transcription active avec le même id.

`workspace_session_live_state` annonce `GET /workspaces/:workspace/sessions/live-state`, un instantané en mémoire uniquement réservé aux entités fiables des sessions en direct du runtime de l'espace de travail sélectionné, ainsi qu'une version de catalogue en mémoire indiquant aux clients quand un rechargement complet du catalogue persisté est justifié. Il est indépendant de `workspace_qualified_rest_core` : les démons publiés peuvent annoncer la capacité REST d'espace de travail plus large sans implémenter cette route, donc les clients doivent vérifier directement cette balise avant utilisation. La balise est inconditionnelle car un primaire fiable mono-espace de travail peut utiliser la route par id ou cwd ; les vérifications de confiance par espace de travail s'appliquent toujours à chaque requête, et la route n'étend pas la politique permissive de lecture du catalogue persisté des secondaires non fiables à l'état du pont en direct. La balise signifie que le point de terminaison existe ; elle ne promet pas que chaque élément en direct porte le filigrane d'activité optionnel `updatedAt`, qui dépend du cycle de vie.

`workspace_session_live_state_batch` annonce `POST /sessions/live-state`. Les clients vérifient cette balise une fois avant de grouper les sondages et conservent la route mono-espace de travail pour les démons plus anciens. Le lot utilise la même sémantique d'instantané en mémoire et de version de catalogue réservés aux entités fiables que la route mono-espace de travail.

Le champ top-level optionnel `/capabilities` `sessionLiveStatePollIntervalMs` annonce l'intervalle de sondage de l'état en direct à l'échelle du démon en millisecondes. Il est résolu une fois à partir de la variable d'environnement de démarrage `QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS`, indépendamment des superpositions d'environnement par espace de travail. Les valeurs entières comprises entre `1000` et `2147483647` sont acceptées ; les valeurs manquantes ou invalides utilisent `5000`. Web Shell consomme cet indice pour tous les sondages d'état en direct des espaces de travail et revient également à `5000` si le champ est absent ou invalide provenant d'un démon plus ancien ou incompatible. Ce champ ne modifie pas la sémantique d'instantané de la route, les rafraîchissements locaux/visibilité immédiats, ni le sondage complet du catalogue. Les clients SDK restent responsables de leurs propres temporisateurs.

`slow_client_warning` couvre le comportement de contre-pression SSE : (a) le démon émet une trame de flux d'événements synthétique `slow_client_warning` lorsque l'accumulation de trames en direct ou l'accumulation d'octets sérialisés en direct d'un abonné atteint 75 % de sa capacité, une fois par épisode de dépassement (réarmé après que les deux mesures soient descendues sous 37,5 %) ; (b) `GET /session/:id/events` accepte un paramètre de requête `?maxQueued=N` (plage `[16, 2048]`) pour prédimensionner l'accumulation de trames par abonné pour les reconnexions froides face à une grande bague de relecture. La limite d'octets sérialisés est gérée par le démon (par défaut **2 MiB** par abonné), concerne uniquement le direct, et n'a intentionnellement aucun paramètre de requête. La taille de la bague à l'échelle du démon est contrôlée par `--event-ring-size` (par défaut **8000**, selon #3803 §02). Les anciens démons manquent silencieusement le comportement d'avertissement/requête — vérifiez cette balise avant de l'activer.

`typed_event_schema` annonce des charges utiles d'événements du démon correspondant au schéma `KnownDaemonEvent` du SDK. Les démons plus anciens peuvent encore diffuser des trames compatibles, mais les clients SDK doivent vérifier cette balise avant de supposer une couverture d'événements typée.

`client_heartbeat` annonce `POST /session/:id/heartbeat`. Les démons plus anciens renvoient `404` ; vérifiez cette balise avant d'émettre des battements de cœur périodiques.

`session_close` et `session_metadata` annoncent `DELETE /session/:id` et `PATCH /session/:id/metadata`. Les démons plus anciens renvoient `404` ; vérifiez ces balises avant d'exposer les options de fermeture ou de renommage.

`session_organization` annonce les groupes de sessions personnalisés et l'épinglage. Il ajoute `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization`, et la vue de liste organisée opt-in `GET /workspace/:id/sessions?view=organized`. Lorsque `session_organization` et `workspace_qualified_rest_core` sont tous deux annoncés, la mutation d'organisation qualifiée par espace de travail `PATCH /workspaces/:workspace/session/:id/organization` est également disponible. La mutation héritée reste réservée au primaire d'espace de travail. Les démons plus anciens renvoient `404` pour les routes de mutation/groupe et ignorent le contrat de vue organisée, donc les clients WebShell/SDK doivent vérifier ces balises avant d'afficher l'interface correspondante de regroupement ou d'épinglage.

`session_archive` annonce l'API d'archivage de l'état du répertoire v1 : `POST /sessions/archive`, `POST /sessions/unarchive`, et `GET /workspace/:id/sessions?archiveState=active|archived`. Les sessions archivées ne peuvent être chargées ou reprises jusqu'à ce qu'elles soient désarchivées. `session_archive_idle_guard` annonce l'option d'archivage additive `requireIdle` : le runtime propriétaire vérifie que le travail actif est confirmé inactif immédiatement avant de commencer la fermeture, et laisse la transcription active en place sinon. `session_storage_conflict_repair` annonce l'option de requête additive `resolveConflicts` et le compartiment de réponse `resolvedConflicts` décrit ci-dessous.

`workspace_qualified_rest_core` annonce les routes REST cœur plurielles sous `/workspaces/:workspace/...`. Le sélecteur se résout d'abord comme un id d'espace de travail exact, puis comme un cwd absolu encodé en URL après canonicalisation. Les démons mono-espace de travail plus récents incluent le runtime principal dans `workspaces[]` même lorsque `multi_workspace_sessions` est absent, permettant aux clients de découvrir l'id requis par les routes qualifiées par espace de travail ; les clients doivent revenir à `capabilities.workspaceCwd` pour les démons plus anciens qui omettent le tableau. Les routes de statut de confiance et de demande de confiance sont disponibles pour les espaces de travail non approuvés enregistrés ; la lecture du statut des hooks qualifiés (`GET /workspaces/:workspace/hooks`) est également servie pour les espaces de travail non approuvés enregistrés car elle rapporte la décision de confiance des hooks de projet en attente, correspondant à la mutation d'approbation qualifiée ; les routes de lecture de fichiers suivent la politique existante de lecture du système de fichiers. Les espaces de travail secondaires non approuvés enregistrés exposent également des catalogues de sessions et de groupes de sessions persistés uniquement : ces lectures ne s'attachent pas à une session, ne démarrent pas ACP et ne fusionnent pas l'état du pont en direct. Les écritures de fichiers, les mutations de catalogue et les autres routes cœur plurielles nécessitent un espace de travail approuvé sauf si une capacité distincte documente une politique plus étroite : `workspace_persisted_transcript` (lecture seule), ou la mutation d'octroi de confiance, qui est acceptée pour un espace de travail non approuvé enregistré que `workspace_trust_grant` soit annoncé ou non — cette balise indique seulement si le rechargement à chaud de la confiance est connecté, afin qu'une décision enregistrée puisse atteindre le runtime en cours sans redémarrage du démon ; elle n'indique jamais si la route est servie. Un primaire non approuvé continue de recevoir `403 { code: "untrusted_workspace" }` depuis les routes de catalogue et de transcription plurielles ; les routes primaires singulières héritées conservent leur comportement de compatibilité existant. Cette balise couvre les surfaces cœur de fichiers, statut, paramètres, permissions, confiance, cycle de vie, contrôle MCP, bascules d'outils et de compétences, mémoire, CRUD d'agents d'espace de travail et stockage de sessions. Elle ne couvre pas l'authentification, la voix, les extensions, le transport ACP/WebSocket, le routage des workers de canal ou l'exportation de sessions qualifiée par espace de travail ; pré-vérifiez `workspace_session_export` ou `workspace_archived_session_export` séparément. La confiance de l'espace de travail n'est pas une ACL : un client détenant le jeton du démon peut lire toutes les surfaces d'espace de travail enregistrées autorisées par cette politique.

`workspace_qualified_voice` annonce les routes Voice sélectionnées par un runtime d'espace de travail approuvé : `GET` et `POST /workspaces/:workspace/voice`, `POST /workspaces/:workspace/voice/transcribe`, et `WS /workspaces/:workspace/voice/stream`. Elle est annoncée uniquement lorsque les runtimes multi-espaces de travail et l'écouteur WebSocket partagé ACP/Voice sont tous deux activés. Le sélecteur suit les mêmes règles d'id ou de cwd absolu encodé que les autres routes plurielles. Pour REST, un sélecteur inconnu retourne `400 { code: "workspace_mismatch" }` et un sélecteur non approuvé retourne `403 { code: "untrusted_workspace" }` ; le rejet de mise à niveau WebSocket expose le statut HTTP 400/403 correspondant sans enveloppe JSON structurée. Aucun transport ne revient au primaire. Les `/workspace/voice`, `/workspace/voice/transcribe` et `/voice/stream` hérités restent réservés au primaire. Les clients utilisent `workspace_qualified_voice` pour toutes les modalités Voice qualifiées et laissent le runtime sélectionné rapporter les erreurs spécifiques à la configuration. Les balises héritées `workspace_voice`, `workspace_voice_transcription` et `voice_transcribe` décrivent uniquement les routes liées au primaire et ne doivent pas masquer une configuration secondaire qualifiée.

`workspace_qualified_memory` annonce les routes de mémoire gérée qualifiées par espace de travail : `POST /workspaces/:workspace/memory/{remember,forget,dream}` met en file d'attente les tâches et `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` les relit. Elle est annoncée uniquement lorsque HTTP ACP et les runtimes multi-espaces de travail sont tous deux activés. Le sélecteur suit les mêmes règles d'id ou de cwd absolu encodé que les autres routes plurielles. Chaque espace de travail enregistré obtient sa propre voie de tâche ; la voie qualifiée du primaire est la même instance que la surface singulière `/workspace/memory`, donc une tâche mise en file d'attente sur l'une est lisible sur l'autre. La résolution est strictement par runtime sélectionné sans retour au primaire : un sélecteur inconnu retourne `400 { code: "workspace_mismatch" }`, un sélecteur non approuvé retourne `403 { code: "untrusted_workspace" }`, et un runtime inactif ou en vidange retourne `503 { code: "workspace_runtime_unavailable" }`. Les lectures n'allouent jamais de voie, donc interroger un espace de travail sans tâches retourne `404 { code: "<kind>_task_not_found" }`. Les ids de tâche sont limités à leur voie et ne survivent pas à une reconfiguration d'espace de travail ou à un remplacement de runtime ; un id obsolète retourne `404`, et non une condition de perte de données. Lorsque HTTP ACP est désactivé, la balise n'est pas annoncée et une requête qualifiée non-primaire retourne un `501 { code: "workspace_memory_unavailable" }` non réessayable, tandis que la route qualifiée primaire continue de fonctionner via la voie localement possédée.

`session_lsp` annonce `GET /session/:id/lsp`, l'instantané de statut LSP structuré en lecture seule pour les clients du démon. Les démons plus anciens retournent `404` ; pré-vérifiez cette balise avant d'exposer le statut LSP distant.

`session_resources` annonce `GET /session/:id/resources`, une paire en lecture seule d'instantanés Skill et MCP assainis construits à partir de la Config de la session en direct sélectionnée. La route est limitée au propriétaire de la session en direct : elle ne revient jamais au runtime primaire et n'infère pas les ressources de la session à partir du statut de l'espace de travail. Les objets imbriqués `skills` et `mcp` réutilisent les charges utiles correspondantes du statut de l'espace de travail, mais omettent les enrichissements d'authentification MCP, de pool, de budget d'espace de travail et d'erreurs de découverte d'espace de travail. Le statut, la découverte et la comptabilité rapportés par le gestionnaire MCP de la session sélectionnée restent présents. Les démons plus anciens retournent `404` ; pré-vérifiez cette balise avant d'afficher un catalogue de ressources de session.

`session_status` annonce `GET /session/:id/status`, le résumé du pont en direct pour une seule session par id. En plus de `clientCount` et `hasActivePrompt`, les sessions en direct exposent `isWaitingForPermission`, `isWaitingForUserQuestion`, `pendingInteractionCount`, et un `turnError` conservé après un tour échoué. L'erreur se efface lorsque le prompt suivant démarre réellement. Une session en direct qui a réglé un tour en cours dans le pont actuel porte également `updatedAt`, la même marque d'activité documentée sous la route d'état en direct ; parce que cette route retourne directement le résumé du pont, la valeur n'est pas fusionnée avec le mtime de la transcription persistée et peut être antérieure à celle rapportée par une liste de sessions. À la fois la réponse de statut de session unique et les listes de sessions d'espace de travail incluent `turnError` et `pendingInteractions` : actions de permission prêtes à être rendues ou questions `ask_user_question` ainsi que les `requestId` et options sélectionnables requis par les routes de vote de permission existantes. Chaque question utilisateur a un `answerKey` ; votez avec `answers`, par exemple `{ "0": "Polling" }`, indexé par cette valeur. Les sessions persistées uniquement omettent l'état du runtime car aucun runtime n'existe. Les démons plus anciens retournent `404` ; pré-vérifiez cette balise avant d'interroger le statut d'une seule session au lieu de scanner la liste complète des sessions.

`session_info` annonce `GET /workspace/:id/session-info` et son jumeau `/workspaces/:workspace/session-info`. La réponse agrège les comptes de sessions actives et archivées persistées sans hydrater les métadonnées de liste. C'est un scan explicite O(n) du disque et ne doit pas être interrogé périodiquement ; les clients doivent traiter `truncated: true` comme un résultat de borne inférieure.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_skill_settings_toggle`, `workspace_skill_settings_batch_toggle`, `extension_batch_activation_v2`, `workspace_init` et `workspace_mcp_restart` publient les routes de contrôle des mutations documentées ci-dessous. Le contrôle du mode d'approbation conserve sa porte de compatibilité non stricte. Les autres contrôles sont soumis à une porte stricte basée sur l'autorité de l'opérateur : les requêtes primaires depuis la boucle locale de confiance, authentifiées par jeton Bearer ou appariées via le Contrôle Local passent. Une requête primaire sans jeton qui atteint la porte stricte sans autorité de boucle locale de confiance renvoie 401 `token_required` ; les identifiants configurés manquants ou invalides et les identifiants de Contrôle Local non appariés sont rejetés plus tôt par le middleware Bearer avec un simple `401 Unauthorized`. Les démons qui ne possèdent pas l'une de ces routes renvoient `404`. Les balises Skill spécifiques aux paramètres sont différentes : les démons de la génération de balise retirée publient `workspace_skill_toggle` et `workspace_skill_batch_toggle` et servent leur contrat validé par catalogue aux mêmes chemins. La route à cible unique retirée peut renvoyer HTTP `404 skill_not_found` ou `409 skill_not_toggleable` ; la route par lots retirée renvoie HTTP 200 et place les échecs issus du catalogue dans `errors[]`. Effectuez une vérification préalable de chaque balise avant d'exposer son affordance, et n'inférez pas le contrat Skill spécifique aux paramètres en sondant l'accessibilité des routes. Les chemins des routes et les corps des requêtes n'ont pas changé.

`mcp_guardrails` (problème [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) couvre la surface du budget MCP : les champs `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` sur `GET /workspace/mcp`, le champ `disabledReason` sur les cellules par serveur, et les indicateurs CLI `--mcp-client-budget` / `--mcp-budget-mode`. Les anciens démons omettent entièrement les nouveaux champs ; les clients SDK effectuent une vérification préalable de cette balise avant de s'appuyer sur la sémantique `budgets[]`. Le descripteur de registre contient également `modes: ['warn', 'enforce']` pour une future exposition des modes de fonctionnalité — pour l'instant, les clients infèrent le mode à partir du champ `budgetMode` de l'instantané. Le refus du serveur sous le mode `enforce` est déterministe selon l'ordre de déclaration `Object.entries(mcpServers)` ; une future couche de priorité de portée (si qwen-code en adopte une) ferait passer cela à « priorité la plus basse en premier » pour refléter la convention `plugin < user < project < local` de claude-code.

> **La portée est pilotée par les capacités.** Avec `mcp_workspace_pool`, les sessions au sein d'un même environnement d'exécution d'espace de travail partagent un pool de transport et `WorkspaceMcpBudget`, et l'instantané émet `budgets[0].scope: 'workspace'`. Différents environnements d'exécution d'espace de travail possèdent des pools indépendants. Sans la balise, chaque session ACP utilise son héritage `McpClientManager`, l'instantané émet `scope: 'session'`, et N sessions peuvent chacune consommer le plafond configuré.

`workspace_file_read` couvre les routes de fichiers d'espace de travail texte/liste/stat/glob (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` couvre `GET /file/bytes`, qui a été ajouté plus tard afin que les clients puissent pré-vérifier la prise en charge des fenêtres brutes d'octets par rapport aux démons de l'ère PR19. `workspace_file_write` couvre les routes de mutation de texte sensibles au hachage (`POST /file/write`, `POST /file/edit`). La balise write signifie que le contrat de route existe ; cela ne signifie pas que le déploiement actuel est ouvert aux mutations anonymes. Write/edit sont des routes de mutation strictes et nécessitent une autorité opérateur ; la boucle locale fiable sans jeton est qualifiée. `workspace_file_upload` couvre `POST /file/upload`, la route d'ingress binaire : un corps `application/octet-stream` limité à `MAX_UPLOAD_BYTES` (50 MiB) est écrit dans l'espace de travail sans jamais écraser — un nom occupé est automatiquement numéroté (`name (1).ext`, `name (2).ext`, ...). C'est également une route de mutation stricte.

`workspace_file_delete` couvre uniquement `POST /workspaces/:workspace/file/delete` ; aucune route héritée primaire `/file/delete` n'existe. Le corps JSON est `{ "path": "relative/file.txt" }`, et le succès renvoie `{ "kind": "file_delete", "path": "relative/file.txt" }`. Cette route de mutation stricte supprime définitivement un fichier régulier de l'espace de travail local sélectionné de confiance. Les répertoires et les liens symboliques sont rejetés ; les fabriques non prises en charge (y compris SSH) renvoient 422. La capacité décrit la prise en charge du protocole, et non la permission de supprimer dans tous les espaces de travail. Les clients doivent également effectuer une vérification préalable de `workspace_qualified_rest_core`.

Lorsque `workspace_qualified_rest_core` est publié, la même surface de fichiers est également disponible sur `/workspaces/:workspace/file`, `/workspaces/:workspace/file/bytes`, `/workspaces/:workspace/stat`, `/workspaces/:workspace/list`, `/workspaces/:workspace/glob`, `/workspaces/:workspace/file/write`, `/workspaces/:workspace/file/edit`, `/workspaces/:workspace/file/upload` et `/workspaces/:workspace/file/delete` (la dernière route nécessite en plus `workspace_file_delete`).

`workspace_directory_create` et `workspace_directory_delete` publient indépendamment `POST /workspaces/:workspace/directory/create` et `POST /workspaces/:workspace/directory/delete`. Effectuez une vérification préalable de la balise de l'opération ainsi que de `workspace_qualified_rest_core` ; les anciens démons qualifiés peuvent ne pas posséder ces routes. Les deux sont des mutations strictes appartenant à l'environnement d'exécution local actif sélectionné de confiance, sans repli primaire ni équivalent hérité primaire. La création est exclusive sous un parent existant ; la suppression est permanente et récursive.

La même balise expose également le CRUD des agents de projet qualifiés par espace de travail sur `/workspaces/:workspace/agents` et `/workspaces/:workspace/agents/:agentType`. Ces routes plurielles lisent ou modifient uniquement les agents de niveau projet pour l'espace de travail sélectionné ; les demandes de portée `global` et `user` renvoient `400 { code: "global_scope_not_supported_for_workspace_route" }`. Les routes `/workspace/agents` sans espace de travail conservent leur comportement actuel d'espace de travail primaire et restent la seule surface REST pour la portée des agents utilisateur.

`extension_management_v2` publie un catalogue d'extensions de niveau utilisateur et une surface de mutation sur `/extensions/*`, ainsi que des projections d'activation d'espace de travail sur `/workspaces/:workspace/extensions/*`. Les artefacts sont globaux ; les routes d'espace de travail exposent uniquement les lectures de projection, les remplacements d'activation exacts et l'actualisation de l'environnement d'exécution. Les lectures peuvent cibler un espace de travail enregistré non fiable, tandis que l'activation, l'actualisation et l'installation portant sur un espace de travail nécessitent une cible fiable. Les mutations lentes utilisent des opérations locales au démon sur `/extensions/operations/:operationId` ; la génération du magasin, et non l'historique des opérations, fait foi lors des redémarrages et entre les démons. La capacité publiée `workspace_extensions` et les routes `/workspace/extensions/*` restent un adaptateur de compatibilité d'espace de travail primaire. Les clients doivent effectuer une vérification préalable de `extension_management_v2` et ne doivent pas l'inférer à partir du mode du démon ou de `workspace_qualified_rest_core`.

`extension_git_credentials` publie les installations Git HTTPS authentifiées sur `POST /workspace/extensions/install` et `POST /extensions/install`. Les clients doivent effectuer une vérification préalable de cette balise avant d'envoyer des informations d'identification URL ou `credentialPersistence` ; les anciens démons rejettent les identifiants URL. La balise décrit la prise en charge du protocole backend, et non la disponibilité d'un trousseau : le mode stocké rapporte le backend sélectionné dans le résultat de l'opération terminale.

`extension_local_path_install` publie les sources d'Extension locales au démon sur `POST /workspace/extensions/install` et `POST /extensions/install`. Le `source` doit être un chemin absolu existant sur l'hôte du démon. Les chemins relatifs restent non pris en charge afin que le répertoire de travail du processus du démon ne puisse pas modifier l'identité de la source ni masquer un raccourci GitHub `owner/repo`. L'opération d'installation existante copie l'Extension dans le stockage géré ; elle ne lie pas la source. Les clients doivent effectuer une vérification préalable de cette balise car les anciens démons rejettent les sources locales.

`extension_batch_activation_v2` ajoute `PUT /extensions/activation` et `PUT /workspaces/:workspace/extensions/activation`. Les deux acceptent 1 à 100 noms dans `extensionNames`, les dédupliquent sans distinction de casse tout en préservant l'ordre de première apparition, persistent les cibles modifiées en une seule génération et retournent une poignée d'opération `202` unique. Une cible n'a pas besoin d'être installée lors de la définition de `enabled` ou `disabled` : son nom crée une déclaration d'état souhaité qui est conservée lorsqu'une Extension portant ce nom est installée. La route globale accepte `state: "enabled" | "disabled"` et écrit V2 `defaultActivation` ; la route espace de travail accepte également `"inherit"` et applique ou efface des remplacements exacts pour le runtime fiable sélectionné. `inherit` ne déclare pas un nom inconnu, et un effacement entièrement inconnu signale `updated: false`.

`extension_activation_explicit_refresh` signifie que les opérations d'activation singulières et par lots se terminent après la validation durable de la politique sans rafraîchir directement les sessions actives. Les appelants nécessitant une application immédiate doivent attendre le succès de l'activation puis soumettre soit le rafraîchissement `POST /workspace/extensions/refresh` synchrone de l'espace de travail principal, qui retourne directement les compteurs de rafraîchissement, soit le rafraîchissement asynchrone `POST /workspaces/:workspace/extensions/refresh` de l'espace de travail sélectionné, qui retourne une poignée d'opération distincte. Les deux formes ne sont pas interchangeables : l'opération asynchrone enregistre la génération appliquée lorsque sa réconciliation complète du runtime se termine, tandis que la route synchrone n'enregistre rien, de sorte que le réconciliateur de génération considère toujours cet espace de travail comme en attente et rafraîchit ses sessions à nouveau lors de son prochain passage. Les appelants pouvant adresser un espace de travail spécifique doivent préférer la forme asynchrone. Un échec de rafraîchissement ne revient pas en arrière ni ne dégrade le résultat de l'activation. Les démons sans cette capacité incluent déjà le rafraîchissement du runtime dans l'activation, donc les clients de compatibilité ne doivent pas soumettre un second rafraîchissement. Le réconciliateur de génération indépendant de 30 secondes reste activé et applique normalement la politique validée lors de son prochain passage ; la réconciliation échouée est réessayée par les passages ultérieurs.

### Contrat de communication Extension Management V2 [#extension-management-v2-wire-contract]

Toutes les routes utilisent les règles d'authentification par jeton démon ci-dessus. `X-Qwen-Client-Id` est facultatif pour les routes de mutation V2 ; lorsqu'il est fourni, il doit identifier un client enregistré avec l'un des runtimes d'espace de travail cible de la mutation. `:extensionId` est l'identité d'extension hexadécimale minuscule de 64 caractères. `:workspace` se résout d'abord comme un identifiant d'espace de travail exact, sinon comme un cwd absolu encodé URL après canonisation.

| Méthode et chemin | Succès |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions` | Catalogue d'artefacts global `200` |
| `PUT /extensions/activation` | Opération par lot d'activation par défaut globale `202` |
| `PUT /extensions/:extensionId/activation` | Opération d'activation par défaut globale `202` |
| `POST /extensions/install` | Opération d'installation `202` |
| `POST /extensions/check-updates` | Opération de vérification de mise à jour `202` |
| `POST /extensions/:extensionId/update` | Opération de mise à jour `202` |
| `DELETE /extensions/:extensionId` | Opération de désinstallation `202`, ou `204` idempotent lorsque l'extension est absente |
| `GET /extensions/operations/:operationId` | Instantané d'opération `200` |
| `GET /workspaces/:workspace/extensions` | Projection d'activation d'espace de travail `200` |
| `GET /workspaces/:workspace/extensions/:extensionId/state` | État des ressources d'espace de travail `200` (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/:extensionId/state` | Opération d'état des ressources d'espace de travail `202` (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/activation` | Opération par lot d'activation d'espace de travail exact `202` |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation` | Opération d'activation d'espace de travail exact `202` |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | Opération d'effacement de remplacement `202` |
| `POST /workspaces/:workspace/extensions/refresh` | Opération de rafraîchissement du runtime `202` |

#### Rafraîchissement explicite de l'Extension

Balise de capacité : `workspace_session_refresh` pour la sélection facultative de session. Les deux `POST /workspace/extensions/refresh` (runtime principal) et `POST /workspaces/:workspace/extensions/refresh` (runtime sélectionné) acceptent :

```json
{ "sessionIds": ["session-1", "session-2"] }
```

Omettre `sessionIds` préserve le rafraîchissement complet du runtime. Un tableau fourni est dédupliqué dans l'ordre de la requête, et `[]` ne rafraîchit aucune session ni cache d'amorçage. Les IDs doivent être des chaînes non vides. Les formes de requête invalides retournent HTTP 400 ; les IDs inconnus, y compris les sessions appartenant à un autre espace de travail, retournent HTTP 404 avant le début du travail. La propriété de session est vérifiée uniquement à l'intérieur du runtime résolu, sans repli sur le runtime principal. Les contrôles existants d'authentification, de mutation stricte, de confiance d'espace de travail et d'identité client s'appliquent.

La route principale retourne toujours HTTP 200 avec `{ refreshed, failed }` ; la route qualifiée retourne toujours HTTP 202 avec une poignée d'opération. Les compteurs décrivent les sessions sélectionnées. Un rafraîchissement avec `sessionIds` ne fait pas avancer la génération appliquée à l'échelle de l'espace de travail, même si la sélection couvre toutes les sessions actuelles. La réconciliation automatique complète reste inchangée et peut rafraîchir d'autres sessions plus tard. La sélection ne crée pas de politique d'activation portée par session : les caches de runtime partagés peuvent changer, et les événements d'espace de travail restent à l'échelle de l'espace de travail.

Les clients doivent effectuer une pré-vérification de `workspace_session_refresh` avant de fournir le champ, y compris un tableau vide ; les anciens démons peuvent l'ignorer silencieusement. Les appels existants sans le champ ne nécessitent aucun nouveau contrôle de capacité.

#### État des ressources d'espace de travail

Pré-vérifiez `extension_state` indépendamment. Il ne prend en charge que les Skills ; il n'implique pas la gestion des ressources MCP. Les deux routes sélectionnent le runtime d'espace de travail enregistré et ne reviennent jamais au principal. GET suit les règles de confiance en lecture seule existantes ; PUT nécessite un espace de travail fiable.

```json
{
  "skills": [
    { "name": "review", "state": "enabled" },
    { "name": "deploy", "state": "disabled" }
  ]
}
```

PUT accepte 1 à 100 entrées, y compris un lot d'un seul élément. Il rejette les entrées mal formées, les noms dupliqués sans distinction de casse et les groupes non pris en charge avant la mise en file d'attente. Tous les noms doivent appartenir à l'Extension cible installée, y compris les Skills actuellement désactivés ; une cible invalide fait échouer l'opération sans écritures partielles. Une validation verrouillée unique du magasin fusionne les remplacements listés pour l'espace de travail canonique exact. Les Skills non listés et les autres espaces de travail sont préservés. Il n'y a pas d'écriture de paramètres, de déclaration de nom futur ou d'activation implicite de l'Extension parente.

GET retourne `v: 1`, `workspaceId`, `workspaceCwd`, `extensionId`, `name` et `skills`. Chaque Skill possède `name`, `defaultEnabled`, `workspaceEnabled` nullable, `effectiveEnabled`, et `disabledReason`/`lockedScope` optionnels. Le `skillStates` optionnel du manifeste fournit les valeurs par défaut ; les valeurs manquantes sont activées par défaut. Pour un parent actif, la priorité est la désactivation dure des paramètres, l'activation explicite des paramètres, la désactivation par défaut des paramètres, le remplacement interne de l'espace de travail, la valeur par défaut du manifeste. La désactivation interne utilise `disabledReason: "default"` et ne verrouille jamais les paramètres. Un parent désactivé ou supprimé ne peut pas être ranimé par un remplacement de Skill.

L'opération `set_extension_state` renvoie `status: "updated"` avec des `result.resourceStates.skills` ordonnés ; `result.states` conserve sa signification de vérification des mises à jour. L'état persisté ne garantit pas que toutes les sessions ont été actualisées. Le démon actualise uniquement les Skills et leur contexte de commandes/modèles pour le runtime cible, y compris les sessions bootstrap et actives, sans redémarrer les MCP/LSP/hooks non concernés. Les échecs d'actualisation post-commit produisent des avertissements sans retour en arrière de l'état. Les remplacements survivent aux redémarrages et aux mises à jour des Extensions et sont supprimés lors de la désinstallation. Les clients ne doivent pas recourir à l'API de paramètres Skill, qui écrit un paramètre de priorité plus élevée.

#### Catalogue global

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

`installType` est omis lorsque aucune métadonnée d'installation n'est disponible. `defaultActivation` est `enabled` ou `disabled`. `workspaceOverrideCount` exclut les entrées `inherit` stockées.

La réponse de projection de l'espace de travail est :

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

`workspaceActivation` est `enabled`, `disabled` ou `null` pour l'héritage. `activationSource` est `default`, `workspace_override`, `legacy_path_rule` ou `cli_override`. `desiredGeneration` est la génération de stockage durable ; `appliedGeneration` est la dernière génération enregistrée par le contrôleur comme appliquée à ce runtime d'espace de travail et peut temporairement être en retard.

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

Pour une activation initiale spécifique à l'espace de travail, utilisez `{ "scope": "workspace", "workspaceId": "target-workspace-id" }` ; la cible doit exister et être approuvée. Les installations via le démon acceptent les sources GitHub, Git et npm. Lorsque `extension_local_path_install` est annoncé, ils acceptent également un chemin absolu existant sur l'hôte du démon. `ref` ne s'applique pas à npm, `ref` et `autoUpdate` ne s'appliquent pas aux sources locales, et `registry` s'applique uniquement à npm. `ref`, `autoUpdate`, `allowPreRelease` et `registry` sont facultatifs.

Lorsque `extension_git_credentials` est annoncé, une source Git HTTPS peut inclure des informations utilisateur, par exemple `https://username:token@git.example.com/org/repository.git`. `credentialPersistence` n'est valide qu'avec une telle source. C'est `stored` ou `one_time` et prend la valeur par défaut `one_time` lorsqu'il est omis. Le mode Stocké enregistre l'identifiant via le stockage hybride de secrets du démon et ne conserve que l'URL propre du dépôt dans les métadonnées d'installation, afin que l'extension reste mise à jour. Le mode Unique n'enregistre ni l'URL du dépôt ni l'identifiant et crée un `snapshot` non mettable à jour ; `autoUpdate: true` est rejeté pour ce mode. Fournir le champ sans identifiants URL, fournir des identifiants invalides, ou utiliser des identifiants avec npm, archive, local, SSH ou des sources non-Git renvoie `400`.

Les réponses et opérations d'installation avec identifiants exposent `credentialPersistence` et peuvent exposer `credentialStorage` comme `keychain` ou `encrypted_file`. Les opérations uniques omettent `source` ; les opérations stockées peuvent renvoyer la source propre. Les entrées de statut/catalogue instantanées omettent la source, définissent `credentialPersistence` sur `one_time` et rapportent `not updatable`. La mise à jour échoue avec `extension_not_updatable` ; un secret stocké indisponible échoue avant l'accès réseau avec `extension_credential_unavailable`.

Les requêtes d'activation globale et d'espace de travail `PUT` utilisent le même corps :

```json
{ "state": "enabled" }
```

`state` est `enabled` ou `disabled`. Les requêtes de mise à jour, désinstallation, vérification des mises à jour, effacement de l'activation et actualisation n'ont aucun corps requis.

Les requêtes d'activation par lot utilisent les noms d'Extension :

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

Le lot d'espace de travail accepte également `"state": "inherit"`. Les résultats globaux terminaux contiennent `name` et `defaultActivation` ; les résultats d'espace de travail contiennent `name`, `workspaceActivation` (`null` pour héritage) et `effectiveActivation`. Les noms malformés rejettent la requête ; les conflits avec les identités Store existantes échouent atomiquement sans commit partiel. Une cible `inherit` inconnue n'est pas persistée, car effacer un remplacement ne doit pas fabriquer une déclaration d'activation par défaut ni remplacer un consentement d'installation ultérieur.

Chaque mutation asynchrone acceptée renvoie :

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

Les mutations qualifiées par espace de travail utilisent le même chemin de sondage global `/extensions/operations/:operationId`. L'historique des opérations est local au processus, ne conserve qu'un nombre limité d'entrées terminales et est perdu au redémarrage du démon ; les clients doivent relire le catalogue ou la projection d'espace de travail et comparer les générations lorsqu'un id d'opération disparaît.

Un instantané d'opération a cette forme :

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

`status` passe de `queued` à `running`, puis à `succeeded`, `succeeded_with_warnings` ou `failed`. Pendant l'exécution, `phase` est `preparing`, `committing` ou `reconciling`. Le succès terminal peut inclure `result` avec `status` égal à `installed`, `enabled`, `disabled`, `updated`, `uninstalled`, `checked` ou `refreshed` ; les résultats de réconciliation peuvent contenir en plus `refreshed`, `failed` et `error`, tandis que les résultats d'activation par lot contiennent des `results` ordonnés. Les vérifications de mise à jour renvoient `result.states`, indexé par nom d'extension, avec des valeurs telles que `checking for updates`, `update available`, `up to date`, `not updatable` ou `error`. Les identifiants et en-têtes d'autorisation ne sont jamais des champs d'opération.

Un commit durable suivi d'un nettoyage incomplet ou d'une réconciliation de runtime n'est pas signalé comme une mutation échouée. Il renvoie `succeeded_with_warnings` et préserve le résultat engagé :

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "uninstall",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "uninstalled",
    "name": "demo",
    "refreshed": 2,
    "failed": 0
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

Les avertissements `workspaceId` et `code` sont facultatifs ; `workspaceCwd` et `error` sont toujours présents. Les clients doivent afficher les avertissements, actualiser leur catalogue/projection et ne doivent pas retenter aveuglément la mutation durable.

Les échecs de validation et d'autorisation sont des erreurs HTTP synchrones utilisant `{ "error": "...", "code": "..." }` lorsqu'un code stable existe. Les cas importants sont `400 invalid_extension_id`, `400 invalid_extension_names`, `400 invalid_extension_name`, `400 invalid_extension_activation`, `400 workspace_mismatch`, `403 untrusted_workspace`, `404 extension_operation_not_found` et `429 extension_queue_full`. La validation d'installation renvoie également `400` pour des options source/ref/registry invalides, un consentement manquant, ou une activation initiale manquante/invalide. Une mutation qui échoue après `202` est représentée, tout en étant conservée dans l'historique des opérations, avec `status: "failed"`, `error` et un `code` stable facultatif ; les codes courants incluent `extension_prepare_timeout` et `extension_conflict`. Un HTTP `404` pour une opération n'implique pas de rollback car l'historique des opérations n'est pas durable.

`daemon_status` annonce `GET /daemon/status`, l'instantané diagnostic consolidé en lecture seule de l'opérateur documenté ci-dessous.

`daemon_update` annonce la surface globale au processus `GET /daemon/update`, `POST /daemon/update/prepare` et `POST /daemon/update/restart`.

`scheduled_task_gate` annonce le facultatif `gate` sur `POST` et `PATCH /scheduled-tasks`, ainsi que `gate` et `gateStatus` sur les vues de tâche. Une porte est une commande shell que la session propriétaire exécute à chaque déclenchement, en dehors du modèle : une sortie 0 avec une sortie livre le déclenchement avec cette sortie attachée, une sortie 0 sans rien sur stdout le saute, et une sortie non nulle est signalée lorsque la porte commence à échouer, pas à chaque déclenchement. `gateStatus.lastOutcome` est `quiet`, `delivered`, `failed` ou `blocked`.

- Une porte nécessite une tâche récurrente : `POST` avec `recurring: false`, ou un `PATCH` qui définit une porte sur un one-shot ou transforme une tâche gated en one-shot, répond 400 `gate_requires_recurring` ; une tâche déjà dans cet état conserve ses autres modifications. Une porte mal formée (vide sur `POST`, seulement un commentaire, plus de 2048 caractères, un caractère NUL ou un surrogate UTF-16 non apparié, un wrapper shell tel que `bash -c '…'`, ou toute partie mise en arrière-plan avec `&`) répond 400 `invalid_gate`. La vérification `&` est lexicale et best-effort ; en cas de doute, elle refuse (un `&` dans un commentaire, un corps heredoc ou `(( … ))`), et une porte qui passe est signalée `failed` lorsqu'elle sort sans rien sur stdout alors qu'une partie en arrière-plan maintient encore son stdout (en dehors du sandbox shell bwrap, dont l'espace de noms PID termine cette partie avec la commande). Sur `PATCH`, `gate: null` ou `gate: ""` efface la porte et son `condition`.
- Une tâche héritée protégée par une `condition` refuse toute clé `gate` dans un `PATCH` avec 409 `task_legacy_unsupported`, donc un client envoie `gate` uniquement lorsqu'il la modifie.
- Une porte écrite via ces routes ne porte aucune confirmation de la part de la session. Elle s'exécute sans surveillance uniquement là où un appel `monitor` de la même commande s'exécuterait sans demander : sous une règle allow `Monitor(...)` ou `Bash(...)` enregistrée, comme commande en lecture seule, ou dans une session auto ou yolo. Une règle deny la bloque dans tous les modes et le mode plan la bloque ; un déclenchement bloqué se stabilise `blocked`.
- Les clients ne doivent pas envoyer `gate` à un démon sans cette balise : un tel démon le jette sur `POST` et répond à un `PATCH` uniquement-gate avec 400 `empty_patch`.

`autofix_pr_watches` annonce `GET /autofix-pr/watches` (l'espace de travail principal) et `GET /workspaces/:workspace/autofix-pr/watches` (un espace de travail enregistré et fiable). Chacun répond aux `/autofix-pr` watches du clone de l'espace de travail comme `qwen autofix-pr status` les liste, lus à partir des fichiers des watches sous le worktree principal du clone (`.qwen/tmp`), chacun ouvert sans suivre de lien et sans blocage. Aucun verrou n'est pris, GitHub n'est pas interrogé, et aucune commande git n'est exécutée sauf `git worktree list`, qui trouve le clone. La réponse est `{ v: 1, available, root?, now?, watches, unreadable? }` : `available` est false, sans watches, lorsqu'aucun dépôt git n'est trouvé pour l'espace de travail (ou si git ne peut pas s'y exécuter), et `root` est le worktree principal du clone, le même pour deux espaces de travail d'un seul clone. Une watch porte les champs de `status` (Section 6.10 de la conception `/autofix-pr`) mais `thisSession`, `worktreePath`, `pushTarget`, `gitTrusted` et `worktreeWork` ; son `session` est la session qui la possède, qui peut être aucune session de ce démon. Arrêter une watch relève de la compétence (`/autofix-pr stop <n>` dans la session qui la possède) ; ces routes ne changent rien.

**Balises conditionnelles.** Ces balises de fonctionnalité sont annoncées uniquement lorsque leur bascule de déploiement, leur câblage d'exécution ou leur condition de disponibilité est active. La présence de la balise signifie que le comportement documenté est disponible ; l'absence signifie soit un démon plus ancien précédant la balise, soit un démon actuel où cette condition est fausse. Actuellement :

<!-- conditional-serve-features:start -->

| Balise | Annoncée quand … |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_collaboration_v1` | au moins un espace de travail enregistré a opté pour la collaboration Agent d'espace de travail persistante via `experimental.agentCollaboration` (n'importe quelle portée, espace de travail inclus) ou `QWEN_CODE_ENABLE_AGENT_COLLABORATION=1`. Présente signifie que `/workspaces/:workspace/agent/*` et les routes de transport Agent Host sont montées ; `workspaces[].agentCollaborationEnabled` identifie l'état d'opt-in de chaque espace de travail, et les clients ne doivent afficher ou appeler la surface de collaboration que pour les entrées activées. Les démons plus anciens omettent ce champ d'espace de travail, donc les clients peuvent revenir à cette balise de niveau supérieur pour la compatibilité. Absente signifie que la collaboration n'est pas servie sur cette réponse — la balise est recalculée par requête, pas figée au démarrage — donc un client doit supprimer le point d'entrée plutôt que de le rendre et laisser les appels renvoyer 404. L'activation initiale nécessite un redémarrage ; la bascule pour un espace de travail alors qu'un autre l'a déjà activée prend effet à la prochaine requête. Distincte de la balise inconditionnelle `workspace_agents`, qui concerne le CRUD des définitions de sous-agent. |
| `session_message_deletion` | le profil privé Hosted Harness n'est pas actif. Liste et supprime les groupes de messages via les routes propriétaires de sessions actives ; les sessions locales ordinaires de démon supportent la suppression physique, tandis que le stockage autoritaire Managed et les espaces de travail SSH la rejettent. |
| `hosted_harness_private_v1` | le profil privé Hosted Harness est actif ; seule son API de session authentifiée est disponible. |
| `managed_session_journal_delta_v1` | le profil privé Hosted Harness est actif (même condition que `hosted_harness_private_v1`) et cette construction peut ouvrir les journaux de Session Managed contenant des enregistrements `message.delta`. Un plan de contrôle exige la balise lors de la négociation de capacités, donc un Harness reculé précédant ces enregistrements est refusé là-bas au lieu d'échouer à chaque ouverture de Session (`managed_session_open_failed`). |
| `require_auth` | le démon a été démarré avec `--require-auth` (ou `requireAuth: true` via l'API intégrée). Le jeton Bearer est obligatoire sur chaque route API normale, incluant `/health` sur les liaisons loopback ; l'ingress webhook de canal garde son authentification indépendante par secret partagé, et les routes de documents et d'actifs Web Shell restent pré-authentifiées. |
| `mcp_workspace_pool` | le pool de transport MCP partagé est actif. Omité quand `QWEN_SERVE_NO_MCP_POOL=1` désactive le pool. |
| `mcp_pool_restart` | le pool de transport MCP partagé est actif ; les réponses de redémarrage peuvent inclure des formes multi-entrées conscientes du pool. |
| `external_tool_guard` | `qwen serve` a terminé la poignée de main de démarrage pour `--external-tool-guard-mode=required` ; chaque canal ACP engendré doit accuser réception du callback installé avant la création de Session, et chaque invocation d'outil géré ACP de premier niveau supportée atteignant la frontière d'exécution finale doit recevoir une autorisation externe préalable à l'exécution. Les refus antérieurs de permission/hook ne font aucune demande au fournisseur. L'exécution imbriquée AgentCore est hors v1 et est rejetée pendant que ce mode de fournisseur externe est actif. La balise reflète uniquement le fournisseur externe : indépendamment de lui, chaque démon applique la garde de relocalisation Git intégrée aux outils gérés portant une ligne de commande shell (`run_shell_command` et `monitor`), donc l'absence de cette balise ne signifie pas qu'il n'y a pas de refus préalables à l'exécution. |
| `allow_origin` | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Le démon a été démarré avec au moins un `--allow-origin <pattern>` (ou `allowOrigins: [...]` via l'API intégrée). Les requêtes inter-origines provenant d'origines correspondantes reçoivent les en-têtes de réponse CORS appropriés ; les origines non correspondantes reçoivent toujours le 403 par défaut. La liste des motifs configurés n'est intentionnellement PAS renvoyée dans `/capabilities` pour éviter de divulguer l'ensemble des origines fiables aux lecteurs non authentifiés — un client navigateur connaît déjà sa propre origine. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` est défini sur un entier positif. |
| `writer_idle_timeout` | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` est défini sur un entier positif. |
| `workspace_settings` | le démon a été créé avec la persistance des paramètres disponible. |
| `user_language_sync` | le démon a été créé avec la persistance des paramètres disponible (même condition que `workspace_settings`), donc la route sans session `POST /language` est enregistrée. |
| `workspace_voice` | la persistance des paramètres est disponible, donc les routes héritées des paramètres vocaux du workspace principal sont actives. |
| `workspace_voice_transcription` | le workspace principal dispose d'un modèle de transcription vocale configuré. |
| `session_shell_command` | L'exécution de shell de session est explicitement activée et effective sous autorisation bearer ou boucle locale fiable ; les appels nécessitent toujours un identifiant client lié à la session. |
| `standalone_sessions_v1` | le démon a installé le runtime complet des sessions autonomes, le coordinateur de cycle de vie, le journal de suppression durable, l'implémentation du répertoire géré et la famille de routes `/standalone/sessions`. Les intégrations directes sans le graphe de dépendances complet omettent à la fois les routes et cette balise. |
| `standalone_session_options_v1` | le runtime complet des sessions autonomes est installé (même condition que `standalone_sessions_v1`), donc la route en lecture seule sans session `GET /standalone/session-options` est enregistrée sur le runtime Conversations interne. |
| `session_artifacts_persistence` | la persistance des artefacts de session est connectée pour le runtime. |
| `session_artifact_library` | La persistance des artefacts de session est connectée ; prend en charge les lectures/suppressions par le propriétaire fiable du workspace des inscriptions actives, froides et archivées via `/workspaces/:workspace/session/:id/artifact-library`. |
| `workspace_artifact_library` | Requêtes persistées sur les artefacts à l'échelle du workspace, requêtes de sessions par lot et suppression explicite par paire via `/workspaces/:workspace/artifact-library`. |
| `workspace_artifact_library_stream` | Métadonnées de session sur toutes les lectures de la bibliothèque d'artefacts et SSE fini opt-in pour les requêtes complètes et de sessions sélectionnées ; nécessite la persistance des artefacts. |
| `session_sources` | la persistance des sources de session est connectée pour le runtime. Enregistre les fichiers de workspace uniquement métadonnées, les pièces jointes téléversées et les liens HTTP(S) via le propriétaire de la session active. |
| `session_generation` | les assistants de génération de session sont disponibles. |
| `session_btw_stream` | Chaque pont runtime enregistré prend en charge le streaming BTW reprenable. Les clients doivent vérifier ce drapeau avant d'appeler `/session/:id/btw/stream` ; sinon, utiliser l'interface JSON BTW existante. |
| `scheduled_task_session_reuse` | la gestion durable des sessions de tâches planifiées est active et chaque runtime de démon géré a installé le rappel permettant à une tâche de se lier explicitement à sa session existante actuelle. |
| `workspace_generation` | les assistants de génération à l'échelle du workspace sont disponibles. |
| `rate_limit` | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` est activé. |
| `workspace_reload` | la prise en charge du rechargement du workspace est disponible dans la configuration des routes intégrées. |
| `workspace_trust_grant` | Le rechargement à chaud de la confiance est connecté (même condition que `workspace_trust_hot_reload`). Les deux routes d'autorisation accordent la confiance uniquement au dossier lié, conservant une règle `TRUST_FOLDER` ou `TRUST_PARENT` existante. Après persistance, `200` ne renvoie le statut v1 que si la politique hôte et le statut rapporté sont fiables ; sinon `409 { error, code: "trust_grant_ineffective" }` nomme l'état/la source vérifié(e) dans `error`, y compris le refus de chargement de politique ou IDE/fichier. Les échecs de persistance du fichier de confiance renvoient `500 trusted_folders_invalid` pour `FatalConfigError`, sinon `500 internal_error`. Les lectures du fichier de confiance acceptent les commentaires et les virgules finales de l'auteur JSONC. Les routes sont également servies sans rechargement à chaud : l'autorisation API du démon met immédiatement à jour le statut v1 en cache, mais les portes liées au démarrage nécessitent un redémarrage (`requiresDaemonRestartForChanges: true`). Les modifications externes de terminal/fichier nécessitent un redémarrage du démon pour mettre à jour ce statut en cache. |
| `workspace_trust_hot_reload` | la surveillance de la politique de confiance du workspace et la réconciliation de la génération runtime sont connectées, donc les changements de confiance prennent effet sans redémarrer le démon et le statut de confiance v2 signale la convergence. |
| `channel_reload` | un gestionnaire de workers de canal géré par le démon est activé et peut recharger sa sélection actuelle. |
| `channel_control` | le contrôle du runtime des workers de canal gérés par le démon est connecté. |
| `channel_management` | les paramètres, le cycle de vie et la gestion de l'appairage des canaux à l'échelle du workspace sont connectés. |
| `channel_delete_config_loss_convergence` | la gestion des canaux du workspace est connectée (même condition que `channel_management`). `DELETE /workspaces/:workspace/channels/:name` converge un Canal dont la configuration a disparu de la vue des paramètres fusionnés résolue par le Worker (portées système + utilisateur + workspace) : le runtime doit être silencieux concernant le Canal ou confirmer exactement un propriétaire Worker engagé dans ce workspace, qui est arrêté avant que la sélection de démarrage persistée détenue dans cette portée ne soit supprimée, au lieu de signaler `channel_instance_not_found`. Un Canal dont la configuration est encore présente dans la vue fusionnée mais que la portée des paramètres de canal résolus du workspace ne possède pas — configuré uniquement à la portée utilisateur ou système alors que le workspace est un répertoire projet — signale `channel_instance_not_found` sans toucher au runtime ; un Canal que la portée résolue configure bien est supprimé normalement, et un workspace dont le répertoire est le répertoire personnel de l'utilisateur résout cette portée vers le fichier utilisateur partagé, donc un Canal à la portée utilisateur est configuré — et supprimé — là-bas. |
| `multi_workspace_sessions` | plus d'un runtime de workspace est enregistré, donc la création de session peut sélectionner un runtime fiable par cwd. |
| `multi_workspace_session_rewind` | plus d'un runtime de workspace est enregistré ; les routes de retour arrière de session active singulières résolvent le runtime propriétaire. |
| `multi_workspace_session_shell` | Plus d'un runtime de workspace est enregistré et l'exécution de shell de session est explicitement activée sous autorisation bearer ou boucle locale fiable ; le REST shell singulier résout le runtime propriétaire. |
| `dynamic_workspace_registration` | une fabrique de runtime de workspace est connectée au démon, donc un répertoire fiable existant peut être enregistré comme runtime secondaire à l'exécution. |
| `persistent_workspace_registration` | un magasin d'enregistrement de workspace est connecté au démon. `runQwenServe` en production fournit automatiquement le magasin au niveau utilisateur ; les intégrations directes `createServeApp` doivent en injecter un explicitement et posséder la restauration au démarrage de leur registre de workspaces. |
| `scratch_workspace_registration` | la création d'un espace de travail temporaire géré est disponible — une fabrique d'exécution, une racine temporaire gérée validée et l'élimination du runtime sont configurées, et chaque runtime géré respecte la limite de la racine temporaire. |
| `git_workspace_clone` | l'hôte du démon possède un binaire `git` ; `POST /workspaces` avec `{ kind: "git", url, target }` démarre une tâche de clonage asynchrone dont les routes rapportent la progression, l'annulation et le cwd canonique. Les hôtes sans `git` omettent la balise. |
| `workspace_runtime_removal` | les runtimes secondaires dynamiques amovibles ou restaurés par persistance peuvent être vidés et supprimés via la route de gestion. |
| `workspace_directories` | le démon persiste les paramètres de l'espace de travail et chaque runtime local fiable peut appliquer des répertoires supplémentaires à ses sessions actives : `/workspaces/:workspace/directories` liste, ajoute et supprime les entrées persistées au niveau de l'espace de travail (`context.includeDirectories`). Les espaces de travail SSH, gérés et autonomes sont rejetés même si la balise est présente, et les démons appariés expérimentaux omettent la balise et la route car une mutation au niveau de l'espace de travail ne peut pas atteindre l'enfant géré. |
| `native_directory_picker` | l'hôte du démon peut ouvrir un sélecteur de répertoire natif de l'OS (`osascript` sur macOS, PowerShell sur Windows, `zenity` sur un hôte Linux avec affichage). Les hôtes sans interface graphique omettent la balise afin que les clients masquent le sélecteur natif du démon plutôt que de signaler une échec garanti. Web Shell masque Parcourir lorsqu'aucun sélecteur n'est disponible ; un [sélecteur de répertoire fourni par l'hôte d'intégration](../design/web-shell-host-directory-picker.md#public-api-and-precedence) peut le fournir sans cette balise. |
| `workspace_runtime_stop` | le démon gère la comptabilité des processus ACP, les observations complètes des activités indépendantes et des tâches planifiées, ainsi qu'un pont de runtime prenant en charge les captures d'état d'arrêt confirmé et de réception. Les runtimes individuels non pris en charge sont désactivés dans l'aperçu. |
| `workspace_runtime` | chaque pont d'espace de travail actif fournit un instantané autoritaire du cycle de vie du runtime ; les ponts injectés mixtes ou hérités omettent la balise. |
| `workspace_skills_config_runtime` | chaque espace de travail actif prend en charge le cycle de vie autoritaire du runtime et les routes séparées config/runtime Skills utilisées par la gestion des Skills et le composeur de nouvelle session. |
| `skill_archive_install` | le cycle de vie autoritaire de l'espace de travail, l'installation d'archives brutes de Skill et les reçus de tentative liés au propriétaire sont disponibles. |
| `skill_zip_file_source` | le cycle de vie autoritaire de l'espace de travail, la copie locale ZIP par le démon et les reçus de tentative liés au propriétaire sont disponibles. |
| `workspace_local_open` | l'hôte du démon peut ouvrir un répertoire d'espace de travail dans le gestionnaire de fichiers de l'OS de l'hôte (`open` sur macOS, `explorer.exe` sur Windows, `xdg-open` sur un hôte Linux avec affichage). Les hôtes sans interface graphique omettent la balise afin que les clients masquent l'action Ouvrir localement plutôt que de signaler une échec de lancement garanti. Le chemin ouvert est toujours le cwd résolu de l'espace de travail enregistré, via `POST /workspaces/:workspace/open` ; la route accepte un corps JSON optionnel `{ "target": "terminal" }` (absent/autre = dossier) et répond `{ kind: 'workspace-local-open', opened: true, target }` avec `target` défini sur `folder` ou `terminal`. |
| `workspace_local_terminal` | l'hôte du démon peut ouvrir une fenêtre de terminal dans un répertoire d'espace de travail (`open -a Terminal` sur macOS, `wt.exe` avec repli `cmd.exe` sur Windows, `gnome-terminal`/`konsole`/`xterm` sur un hôte Linux avec affichage). Les hôtes sans interface graphique omettent la balise afin que les clients masquent l'action Ouvrir dans le terminal plutôt que de signaler une échec de lancement garanti. Servi par `POST /workspaces/:workspace/open` avec le corps `{ "target": "terminal" }`. |
| `workspace_qualified_acp` | HTTP ACP et les runtimes multi-espaces de travail sont actifs, permettant à l'endpoint pluriel ACP de sélectionner un runtime secondaire. |
| `workspace_qualified_voice` | les runtimes multi-espaces de travail et l'écouteur WebSocket partagé ACP/Voice sont actifs, rendant toutes les modalités Voice qualifiées par espace de travail accessibles pour un runtime secondaire. |
| `workspace_qualified_memory` | HTTP ACP et les runtimes multi-espaces de travail sont actifs, permettant aux routes de mémoire gérée qualifiées par espace de travail de sélectionner une voie de tâche par espace de travail pour les opérations remember, forget et dream. |
| `client_mcp_over_ws` | le démon accepte les serveurs MCP hébergés par le client via le WebSocket ACP. Ceci est un opt-in explicite, non requis pour le chemin du tunnel CDP. |
| `cdp_tunnel_over_ws` | le démon expose le tunnel WebSocket inverse `/cdp`, soit par opt-in explicite, soit parce qu'une origine d'extension Chrome est autorisée. Cela signifie uniquement que le tunnel existe ; cela ne signifie pas que les outils MCP Chrome DevTools sont enregistrés. |
| `browser_automation_mcp` | HTTP ACP est activé, `cdp_tunnel_over_ws` est actif, aucun jeton bearer ne bloque `/cdp`, et `QWEN_CDP_MCP_COMMAND` nomme un adaptateur MCP stdio externe. Le package CLI principal n'inclut pas d'adaptateur d'automatisation de navigateur ; sans cette balise, le chat du panneau latéral de l'extension Chrome peut fonctionner, mais les outils console/réseau/capture d'écran/clic ne sont pas enregistrés par défaut. |
| `voice_transcribe` | l'endpoint WebSocket Voice est monté ; un modèle Voice configuré est toujours requis pour une transcription réussie. |
| `realtime_voice` | le démon WebShell macOS a Live Voice activé et l'Hôte natif a opté pour `QWEN_SERVE_LIVE_NATIVE_HOST=1` (désactivé par défaut ; voir ci-dessous). `/live/status` rapporte la préparation, mais la capacité est retirée tant que la fonctionnalité n'est pas activée. |
| `realtime_voice_web` | Live Voice est activé et la page Web Shell peut elle-même être l'endpoint audio via WS `/live/web`, sur toute plateforme, et constitue l'endpoint par défaut (l'Hôte natif est spécifique à macOS et nécessite un opt-in). La route s'authentifie comme `/voice/stream` (sous-protocole bearer), exige un espace de travail primaire fiable, et parle le protocole Live Host avec un hello réduit : permission microphonique plus les auto-vérifications d'entrée/sortie audio. Un seul bail Hôte reste : un Hôte natif remplace un navigateur (`4010`), un navigateur ne déplace jamais un Hôte natif (`4009`), et un deuxième onglet ne prend le contrôle qu'avec `?takeover=1`. `/live/status` rapporte `host.kind: "browser"` ; la capture d'écran nécessite un écran partagé (ci-dessous), et un changement de raccourci est stocké pour le prochain Hôte natif plutôt que enregistré. |
| `web_terminal` | HTTP ACP est activé, rendant l'endpoint Terminal Web authentifié disponible. |
| `user_skill_activation` | La persistance des paramètres utilisateur est disponible. `PUT /skills/activation` sauvegarde les préférences Utilisateur par nom exact et met en file d'attente la propagation asynchrone. |

<!-- conditional-serve-features:end -->

Live Voice utilise l'endpoint Web Shell (`realtime_voice_web`, WS `/live/web`) sur toutes les plateformes par défaut. L'Hôte natif macOS est en opt-in : seul un démon macOS démarré avec `QWEN_SERVE_LIVE_NATIVE_HOST=1` annonce `realtime_voice`, enregistre WS `/live/host` et installe l'Hôte lorsque Live est activé. Sans cela, `/live/setup` rapporte `nativeHost: false` avec une erreur `install` non réessayable, et `POST /live/setup/install` et `POST /live/setup/launch` répondent `409 live_native_host_unavailable`.

Un Host navigateur répond `host.capture_visual` uniquement pendant que l'utilisateur partage un écran avec la page, ce que la page signale dans son hello comme `selfChecks.screenShare`. Le partage est un acte séparé et explicite — le modèle demande en cours de tour, et `getDisplayMedia` nécessite un geste utilisateur — donc la page maintient le flux et prend une image par requête. Sans rien de partagé, elle répond `success: false` immédiatement plutôt que de laisser la requête expirer.

Parce qu'une page ne peut pas écrire sur le système de fichiers du démon, elle envoie uniquement le JPEG. Le démon ignore tout `screenshotPath` rapporté par un bail navigateur et stocke l'image elle-même, sous un nom qu'il choisit, dans le même répertoire de capture privé auquel un Host natif écrit. Un Host natif persiste toujours son propre PNG et passe le chemin, comme auparavant.

`mcp_guardrails` **n'est pas** dans ce tableau conditionnel — c'est une balise toujours active, annoncée chaque fois que le binaire supporte les nouveaux champs de budget `/workspace/mcp`, indépendamment du fait que l'opérateur ait configuré un budget. Les opérateurs qui n'ont pas défini `--mcp-client-budget` obtiennent quand même les nouveaux champs (avec `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (problème [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) annonce les événements de push SSE typés qui font surface aux franchissements d'état du budget MCP sans boucle de sondage. Deux types de trames arrivent sur `GET /session/:id/events` :

- `mcp_budget_warning` — se déclenche une fois au franchissement ascendant de 75 % de `reservedSlots.size / clientBudget`. Se réarme seulement après que le ratio est passé sous 37,5 % (`MCP_BUDGET_REARM_FRACTION`). Reflète l'hystérésis `slow_client_warning` de la PR 10, mais au niveau du gestionnaire plutôt qu'au niveau de l'arriéré par abonné. Charge utile : `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Se déclenche dans les modes `warn` et `enforce` ; jamais dans le mode `off`.
- `mcp_child_refused_batch` — se déclenche à la fin de chaque passage `discoverAllMcpTools*` lorsqu'un ou plusieurs serveurs ont été refusés, ET en tant que lot de longueur 1 sur le chemin de refus de génération différée `readResource`. Charge utile : `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` est le `'enforce'` littéral car le mode `warn` ne refuse jamais.

Les deux événements vivent dans l'anneau de rejeu SSE par session (ils portent un `id`) afin qu'un client se reconnectant avec `Last-Event-ID` reprenne à travers eux ; le snapshot à `GET /workspace/mcp` reste la source de vérité pour l'état après une déconnexion prolongée. Toujours actif une fois annoncé — il n'y a pas de bascule conditionnelle. L'état du reducer SDK (`DaemonSessionViewState`) expose `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` pour les adaptateurs qui veulent une UI simple de type retard.

## Routes

Les clients peuvent détecter la fonctionnalité `session_turn_status` et interroger `GET /session/:id/turns/current` ou `GET /session/:id/turns/:promptId`. Ces routes nécessitent la Session propriétaire active et ne chargent ni ne scannent jamais un autre espace de travail. Les résultats réglés sont des enregistrements de transcript best-effort lus depuis la branche active avec un scan borné ; `prompt_not_found` signifie qu'aucun résultat n'a été trouvé dans la file active, la superposition terminale de 64 entrées ou la fenêtre active bornée. `resultText` est la réponse brute finale du modèle parent après la dernière frontière d'outil, avant la réécriture optionnelle du message, et peut être absente. Les résultats dépassant 32 768 unités de code UTF-16 incluent `resultTruncated: true` et `resultCode: "RESULT_TEXT_TRUNCATED"`.

### `GET /health`

Sonde de vivacité. La forme par défaut retourne `200 {"status":"ok"}` si l'écouteur est actif — bon marché, sans accès au pont, adapté aux sondes de vivacité k8s/Compose à haute fréquence.

Passez `?deep=1` (accepte aussi `?deep=true` ou `?deep` nu) pour une sonde globale au démon qui agrège les **compteurs** de pont à travers chaque runtime d'espace de travail géré, y compris un espace de travail encore en vidange (informatif uniquement, pas une vraie vérification de vivacité) :

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

`sessions`, `pendingPermissions` et `activePrompts` sont des sommes. `activeWork` est vrai quand n'importe quel runtime a un prompt accepté mais non réglé (y compris un prompt attendant en FIFO), un Agent en arrière-plan en cours d'exécution, une notification de terminal d'Agent mise en file/en cours, un shell en arrière-plan ou un travail de workflow géré par la Session, ou un tour de Session possédé par un enfant. Le maintien agrégé `session` couvre le traitement des objectifs et des cron, la mutation de l'historique, et les continuations Monitor mises en file ou en cours d'exécution ; les prompts au premier plan restent possédés par le démon. Les Monitors en cours d'exécution, les suggestions de suivi et les processus externes que le registre de shell ne peut plus suivre restent hors du champ. Il est scopé par session : le travail au niveau canal sans session attachée encore — une génération en vol, une restauration en attente, la découverte ou l'authentification MCP — n'est pas compté, donc `activeWork` peut lire faux alors que le démon refuse encore de récupérer ce canal. Ne lisez pas ce champ comme "le démon est récupérable" ; il décrit uniquement le travail possédé par la session. `activeWorkReporting` indique quelle partie de ce booléen est réellement garantie : `full` quand chaque session vivante est couverte par un rapport frais d'un enfant qui rapporte toutes les catégories requises, `none` quand aucune session n'a négocié le reporting, et `partial` pour tout entre les deux — y compris un snapshot périmé ou un enfant négocié qui omet une catégorie requise. Un snapshot plus vieux que trois intervalles de rapport cesse de compter comme couverture : ce n'est pas un rapport indiquant que la session est inactive, donc la session revient à être lue comme retenue, exactement comme si l'enfant n'avait jamais rapporté. Le nettoyage automatique ordinaire est également désactivé pour un enfant négocié mais incomplet ; un enfant qui ne comprend pas `shell` ou `session` ne peut pas autoriser en toute sécurité la fermeture conditionnelle selon le prédicat complet actuel. Les enfants historiques complètement non supportés conservent le comportement de nettoyage legacy, et la fermeture explicite, le kill, l'arrêt et la sortie de canal restent des opérations forcées. `activeWorkStaleMs` est l'âge du snapshot le plus ancien sur lequel repose le booléen **parmi les sessions couvertes**, et est `0` quand aucune session n'est couverte ; c'est diagnostique, car la fraîcheur est déjà graduée dans `activeWorkReporting` par le démon (seul le démon connaît la cadence négociée de chaque canal). La note est calculée une fois sur chaque runtime géré plutôt que par runtime puis combinée — un runtime sans sessions est vacuusement complet, et traiter cela comme preuve permettrait à un espace de travail vide de garantir les sessions non rapportées d'un autre espace de travail. `lastActivityAt` est la dernière heure d'activité d'espace de travail non-nulle et `idleSinceMs` est dérivée de ce même snapshot. `channelAlive` signifie qu'au moins un canal d'espace de travail géré est vivant ; cela ne signifie pas que chaque espace de travail est sain. `connectedClients` et l'optionnel `rateLimitHits` restent des compteurs globaux au démon plutôt que des sommes par espace de travail.

Les contrôleurs de redémarrage doivent considérer le démon comme occupé quand :

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

Supprimer le troisième terme rend `activeWork === false` indistinguable de "aucun enfant ne m'a dit quoi que ce soit", ce qui est le seul cas où agir dessus est dangereux. Les réponses inconnues et les sondes échouées doivent également empêcher le redémarrage. `activePrompts` reste un signal de compatibilité indépendant.

Ces champs sont un cache d'observation, pas un bail de redémarrage : même une réponse fraîche, entièrement notée et vide décrit le moment où elle a été échantillonnée, et le travail peut commencer immédiatement après. La règle ci-dessus réduit substantiellement le risque d'un mauvais redémarrage mais ne l'élimine pas — la sécurité stricte nécessite une barrière de préparation au redémarrage qui arrête l'admission de nouveau travail, confirme la vidange, et seulement ensuite s'arrête.

> ⚠️ La sonde approfondie est **informative**, et non une véritable vérification de vivacité ou un bail de récupération atomique. Les enfants ACP négociés publient des instantanés du travail actif à l'échelle du canal selon une cadence négociée, et le démon évalue leur fraîcheur en `activeWorkReporting` — mais il ne tue jamais un canal en raison d'un rapport manquant, car le silence d'une session n'est pas la preuve que le processus est mort. La vivacité du transport et la détection des Agents bloqués sont des mécanismes distincts. `connectedClients` compte les connexions REST SSE, et non tous les transports ACP. Utilisez des échantillons répétés et une fermeture gracieuse pour la récupération des ressources inactives ; utilisez `/daemon/status` authentifié pour le diagnostic du transport et par espace de travail. Si un getter d'exécution gérée lève une exception, la santé approfondie échoue de manière sécurisée avec `503 {"status":"degraded","reason":"aggregation_failed"}` plutôt que de retourner des totaux partiels, et le journal du démon identifie l'environnement d'exécution de l'espace de travail défaillant. Lors de l'amorçage, avant que le registre d'exécution ne soit prêt, il retourne `503 {"status":"degraded","reason":"bootstrap"}` avec `Retry-After: 1`. Pour la vivacité de l'écouteur, utilisez le défaut `/health` sans `?deep`.

**Auth :** requise sur les liaisons non-loopback et lorsque le loopback est durci avec `--require-auth`. Sur une liaison loopback ordinaire (`127.0.0.0/8`, `localhost`, `::1`, `[::1]`), `/health` est enregistré avant le middleware bearer afin que les sondes k8s/Compose dans le pod n'aient pas besoin de porter le jeton. Sur non-loopback (`--hostname 0.0.0.0` etc.) ou loopback durci, la route est enregistrée après le middleware bearer et renvoie 401 sans jeton valide — sinon, un appelant non authentifié pourrait sonder des adresses arbitraires pour confirmer qu'un `qwen serve` existe, une fuite d'informations de faible sévérité qui se combine mal avec le scan de ports. Le refus CORS + la liste blanche Host s'appliquent toujours à l'exemption loopback ordinaire.

### `GET /daemon/update`, `POST /daemon/update/prepare`, and `POST /daemon/update/restart`

Ces routes authentifiées gèrent l'installation de Qwen Code du démon, indépendamment de l'espace de travail sélectionné. Elles utilisent toujours REST, y compris depuis les clients SDK avec un transport de session ACP. La capacité `daemon_update` annonce le protocole ; la disponibilité est déterminée par l'état renvoyé.

GET vérifie les versions sans les télécharger ni les activer. Les vérifications réussies sont mises en cache pendant 15 minutes et les erreurs pendant une minute ; `?refresh=true` demande une nouvelle vérification. Les vérifications simultanées partagent une seule recherche. La réponse contient `state` (`available`, `up-to-date`, `installing`, `ready`, `restarting`, `unavailable` ou `error`), `canInstall`, optionnellement `currentVersion` et `latestVersion`, ainsi que `instructions` et `message` optionnels. `currentVersion` identifie le démon en cours d'exécution, y compris après la préparation d'une mise à jour. Les méthodes d'installation non prises en charge peuvent signaler `available` avec `canInstall: false` et des instructions manuelles.

Les mises à jour automatiques nécessitent un cycle de vie CLI réel avec POSIX `process.execve`, une installation autonome ou une installation globale npm/pnpm/yarn/bun exécutant le lanceur publié (un préfixe npm appartenant à root est inclus, car la préparation n'écrit jamais dans le préfixe global), et des paramètres opérateur autorisant `general.enableAutoUpdate`. Les serveurs intégrés, Windows, les environnements d'exécution Node non pris en charge et le mode développement signalent `unavailable`. Seuls les paramètres globaux/système s'appliquent ; les paramètres de l'espace de travail ne peuvent pas activer l'installation. La connexion doit utiliser le listener principal et son jeton d'exécution du démon, ou le déploiement loopback explicitement approuvé sans jeton. Les navigateurs couplés et les connexions Local Control signalent `unavailable`, car leurs identifiants ou leur listener ne survivraient pas au redémarrage ; leurs mutations de mise à jour renvoient `403 update_connection_unsupported`.

Les deux routes POST exigent l'autorité de l'opérateur du démon via la porte stricte de mutation et n'acceptent aucun paramètre. Le serveur choisit la version, la destination et le lanceur ; les clients ne peuvent pas fournir de version ni de commande.

- `POST /daemon/update/prepare` démarre un téléchargement en arrière-plan et renvoie `202` avec `state: "installing"`. Cela ne modifie pas l'installation active. Interrogez GET jusqu'à ce que l'état soit `ready` ; les préparations répétées partagent la même opération et une mise à jour préparée renvoie `200`. En l'absence de mise à jour automatique disponible, cela renvoie `409 update_unavailable`.
- `POST /daemon/update/restart` nécessite une mise à jour préparée, sinon il renvoie `409 update_not_ready`. Il répond avec `202` et `state: "restarting"` avant d'activer la mise à jour, de fermer gracieusement le démon et de remplacer le processus par le lanceur mis à jour. Les clics répétés partagent un seul redémarrage. Après avoir répondu, le démon re-résout la version actuelle une fois : si elle est plus récente que celle préparée et qu'un clic unique la couvre, la version plus récente est préparée et la charge utile préparée est écartée, afin qu'un démon de longue durée aboutisse sur la dernière version actuelle plutôt que sur celle qui était la dernière lors de sa première préparation. La charge utile plus récente est engagée avant que la précédente ne soit écartée, et cet écartement est fait au mieux : un échec d'écartement laisse des données sur le disque mais n'isole jamais la charge utile plus récente ni ne revient à une version potentiellement supprimée à moitié. `latestVersion` signale ensuite la cible plus récente tandis que `state` reste `restarting`. Une re-résolution ou une préparation échouée applique la version préparée à la place ; le clic n'est jamais bloqué sur la version en cours d'exécution par une défaillance du registre. Le remplacement conserve le PID, le répertoire de travail, les options CLI, le port lié et le jeton de démon effectif, efface les anciennes épingles de version et ne rouvre pas de navigateur. Le client interroge GET jusqu'à ce que `currentVersion` change, puis recharge le document à l'URL capturée lorsque la mise à jour a été demandée. Parce que la préparation s'exécute après `202` et peut prendre plusieurs minutes, le client mesure son délai de redémarrage à partir d'une indisponibilité continue, et non du clic : un démon qui continue de répondre fonctionne encore. Un plafond absolu généreux (20 minutes) sécurise un démon qui reste joignable mais ne quitte jamais `restarting`. Il se situe au-dessus de toute la chaîne de préparation, et non au-dessus d'une constante de timeout unique : un téléchargement d'archive autonome essaie OSS puis GitHub séquentiellement avec un budget de cinq minutes _chacun_, et les récupérations de checksum et de signature ajoutent jusqu'à deux minutes supplémentaires, donc une re-préparation peut passer environ douze minutes à télécharger et vérifier avant l'activation ; l'enfant npm géré est plafonné à dix. Chaque chemin d'abandon garde une entrée réessayable à l'écran, car un démon bloqué continue de signaler `restarting`, que le contrôle n'affiche pas autrement. Une fois le redémarrage confirmé, `restarting` reste actif jusqu'à ce que le processus soit remplacé, donc un démon joignable qui signale tout autre état avec un `currentVersion` inchangé signifie que le remplacement n'a pas abouti sur la nouvelle build ; le client cesse d'attendre, publie cet état stabilisé et signale un échec plutôt que d'attendre indéfiniment un changement de version. Cette vérification s'applique uniquement aux interrogations _initiées_ après la confirmation : les demandes de statut et de redémarrage sont indépendantes, donc une interrogation commencée plus tôt peut livrer un instantané pré-redémarrage ensuite, et interpréter cela comme un démon stabilisé rapporterait un faux échec et supprimerait le rechargement qu'une mise à jour réussie doit encore à l'utilisateur. La validation du lanceur autonome s'exécute avant la fermeture des services ; une vérification échouée laisse le démon en marche. Les échecs après le début de la fermeture ou pendant le remplacement du processus ne sont pas garantis de récupérer.

Web Shell vérifie et prépare automatiquement les mises à jour disponibles prises en charge en arrière-plan, et affiche son bouton de mise à jour adjacent à la version lorsqu'une mise à jour préparée est prête ou lorsqu'une mise à jour disponible comporte des instructions manuelles. Dans l'état d'instructions manuelles, le bouton ouvre un popover avec les instructions issues de la vérification et ne prépare ni ne redémarre jamais. La préparation et la disponibilité survivent aux rechargements du runtime de l'espace de travail. Une mise à jour préparée épingle sa cible : le GET de polling, y compris `?refresh=true`, continue de signaler la mise à jour `latestVersion` préparée et ne retélécharge jamais, afin qu'un démon qui reste actif sur plusieurs versions ne génère pas de téléchargements superflus en arrière-plan. Seul le redémarrage résout à nouveau la cible. L'arrêt normal du démon supprime le téléchargement préparé. Les échecs d'activation maintiennent le démon en cours d'exécution et signalent `error` ; la vérification suivante après la mise en cache de l'erreur d'une minute peut préparer un nouveau téléchargement pour une nouvelle tentative. La désactivation des mises à jour automatiques supprime la disponibilité et nettoie le téléchargement avant qu'un redémarrage puisse commencer. Une fois qu'un redémarrage est en cours, il n'est pas perturbé : tant que l'état est `restarting`, les routes de statut, de préparation et de redémarrage renvoient toutes sans consulter le paramètre opérateur, et le nettoyage à l'arrêt est une opération vide, de sorte qu'une remise en place qui prend plusieurs minutes ne peut pas voir sa charge utile retirée sous ses pieds. Cliquer sur le bouton dans l'état prêt redémarre explicitement l'intégralité du démon et interrompt ses sessions actives.

### `GET /daemon/status`

Diagnostics opérateurs en lecture seule. Contrairement à `/health`, il s'agit d'une API normale du démon : elle est enregistrée après l'authentification par jeton et la limitation de débit, y compris sur les liaisons loopback. Paramètre de requête :

- `detail=summary` (par défaut) lit uniquement l'état du démon en mémoire.
- `detail=full` inclut également les diagnostics de session en direct, les diagnostics de connexion ACP, les compteurs de flux d'appareils d'authentification et les sections de statut de l'espace de travail.
- tout autre `detail` retourne `400 { "code": "invalid_detail" }`.

`summary` n'interroge intentionnellement pas les méthodes de statut de l'espace de travail, ne démarre pas d'enfant ACP et ne crée pas de session. `full` interroge chaque section de l'espace de travail indépendamment ; un délai d'attente ou une exception marque uniquement cette section comme `unavailable` et ajoute un problème `workspace_status_unavailable`.

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxSessions": 32,
    "maxTotalSessions": 800,
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

Les réponses multi-espaces de travail incluent également des lignes `workspaces[]` de niveau supérieur avec `{ id, cwd, displayName?, primary, trusted }`. Le nom d'affichage optionnel est omis lorsqu'il n'est pas défini et reste purement présentationnel ; les consommateurs de statut doivent continuer à utiliser `id` ou `cwd` pour corréler les runtimes.

`runtime.perf` est facultatif. Lorsqu'il est présent, il signale uniquement le retard de la boucle d'événements du processus du démon, les échantillons d'attente de la file FIFO des invites et les compteurs d'octets des tuyaux enfants du démon ; le retard de la boucle d'événements de l'enfant ACP n'est pas inclus dans `/daemon/status`.

`status` est `error` si un problème a une sévérité d'erreur, `warning` si un problème a une sévérité d'avertissement, sinon `ok`. Les codes de problème sont stables et incluent `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`, `channel_worker_partial_connect`, `channel_restore_failed` et `workspace_status_unavailable`. Pendant la courte fenêtre après que l'écouteur est prêt mais avant que le runtime complet soit monté, `/daemon/status` peut signaler `daemon_runtime_starting` ; si le montage asynchrone du runtime échoue, il signale `daemon_runtime_failed` tandis que les routes de runtime non-statut renvoient `503`.

`runtime.activity` signale l'activité des prompts à l'échelle du démon. `activePrompts` compte les sessions ayant un prompt en cours. `pendingPrompts` compte tous les prompts acceptés qui ne sont pas encore terminés, y compris le prompt en cours d'exécution et les prompts en attente dans la file FIFO. `queuedPrompts` compte les prompts en attente dans la file FIFO qui ont été acceptés mais non dispatchés. `lastActivityAt` est l'horodatage ISO 8601 du dernier début/fin de prompt ou de création de session ; `null` lorsque le démon n'a jamais traité aucune activité depuis le démarrage. `idleSinceMs` est calculé à partir de `lastActivityAt` au moment de la génération de la réponse.

`limits.memory` est additif et rapporte les chiffres de mémoire résolus du démon : un `enforced: false` requis, un objet `childHeap` (`mode` : `off`, `observe`, ou `admit` ; `admissionEnforced`, vrai uniquement pour les `admit` gérés ; `maxConcurrentChildren` et `perChildCeilingMb`, tous deux `null` sous `mode: 'off'`, qui ne modélise rien — et `perChildCeilingMb` ajoute `null` partout où aucune partition ne peut être modélisée dans `modeled.minChildHeapMb` — soit le pool ne peut couvrir un enfant à ce plancher, soit le plafond tomberait en dessous une fois plafonné à `modeled.legacyChildCeilingMb`, qui est `floor(available / 2)` et tombe donc sous le plancher sur un hôte de moins de 1024 Mo. Il n'est jamais 0, et `maxConcurrentChildren` est `0` dans ces cas, car un hôte qui ne modélise aucune partition donne une réponse calculée plutôt qu'un modèle absent ; et `refusals`, les créations qui auraient dépassé la limite modélisée), `configuredBudgetMb`, `effectiveBudgetMb` (la valeur configurée plafonnée à la mémoire cgroup/hôte résolue), `budgetSource` (`flag` / `derived`), `availableMemoryMb`, `availableMemorySource` (`constrained` / `host`), `insufficientMemory`, et un objet `modeled` contenant `rootReserveMb`, `childPoolMb`, `minChildHeapMb`, `maxChildHeapMb`, et `legacyChildCeilingMb` (un modèle conservateur du plafond qu'un enfant ACP reçoit aujourd'hui, qui peut se situer sous la figure réelle). `runtime.memory` rapporte également `registeredWorkspaces` (le nombre d'enregistrements — entrées d'espace de travail non supprimées, y compris celles en vidange, en transition ou bloquées ; pas un nombre d'enfants actifs), `activeAcpChildren` (enfants ACP gérés par le démon avec un canal actif non mourant — inclut les entrées en transition ou bloquées, mais exclut un espace de travail dont le kill a commencé même si l'enfant n'a pas quitté ; pas les workers de canal, les descendants MCP, ni les réservations de création non attachées), `childRssCoverage` (`active_children` — chaque enfant ACP avec un canal actif, qui est l'ensemble que `activeAcpChildren` compte ; les démons plus anciens envoient `primary_only`), un objet `children` décrit ci-dessous, et un objet `modeled` contenant `recommendedShareAtRegisteredMb` (`null` quand aucun espace de travail n'est enregistré) et `recommendedShareAtActiveMb` (`null` quand aucun enfant n'est actif). Chaque part est plafonnée au plafond hérité des enfants, et planchée au tas minimal des enfants seulement lorsque le plafond le permet — sur un petit hôte, le plafond se situe sous le plancher, donc part × nombre peut dépasser le pool d'enfants. Lisez une part comme consultative, pas comme une partition du pool. Le dimensionnement du tas des enfants reste consultatif : aucun argument de création d'enfant ne découle de ces valeurs. `admit` optionnel applique le nombre concurrent d'enfants modélisé, tandis que `observe` par défaut enregistre uniquement les refus potentiels. `runtime.memory.committedAcpChildren` compte les réservations ACP gérées et les enfants attachés, y compris les enfants en cours de terminaison jusqu'à la libération du registre ; il est `null` lorsque le registre géré est indisponible. `childHeap` modélise une partition fixe de `modeled.childPoolMb` — chaque enfant recevrait la même `perChildCeilingMb`, donc le total modélisé reste dans le pool plutôt que de s'accumuler comme le ferait une part par création. Lisez `refusals` uniquement comme une pression d'admission : un compte de 0 ne signifie **pas** que la partition est sûre à appliquer, car les enfants tournent sur le plafond beaucoup plus grand dérivé de l'hôte, donc une charge de travail nécessitant plus d'espace ancien que `perChildCeilingMb` est saine ici et ne échouerait que si la partition était appliquée. Deux autres raisons pour lesquelles un compte non nul ne signifie pas nécessairement une pression de capacité : la décision d'admission compte un enfant en cours de terminaison jusqu'à sa sortie, donc sur un démon déjà à `maxConcurrentChildren` chaque remplacement de canal réserve un refus pendant la fenêtre de chevauchement ; et sur un hôte trop petit pour modéliser une partition, `maxConcurrentChildren` est `0`, donc `refusals` égale le nombre total de créations ACP, avec `insufficientMemory` comme champ qui l'explique. Dans `admit`, un modèle à zéro emplacement fait échouer le démarrage. Un démon entièrement géré confronté à l'épuisement de la capacité peut récupérer un ACP vide le moins récemment utilisé sans sessions actives ni travaux en attente, attendre la libération suivie, puis réessayer l'admission une fois avant de créer. Les sessions chargées restent protégées ; l'enregistrement de l'espace de travail et l'historique sauvegardé sont conservés. Le compteur `refusals` compte les tentatives d'admission rejetées, y compris un rejet initial suivi d'une récupération réussie, pas les échecs finaux visibles par l'utilisateur. La capacité épuisée renvoie REST HTTP 503 avec `code: "acp_child_capacity_exhausted"`, `maxConcurrentChildren`, et `committedAcpChildren` (excluant la réservation rejetée), sans `Retry-After`. ACP JSON-RPC utilise `-32603` avec `data.errorKind` portant ce code, `data.httpStatus: 503`, et les mêmes compteurs. Une annulation de création autonome pré-dispatch vérifiée conserve `standalone_creation_rolled_back`, son ID de session et sa répétabilité, et imbrique le code de capacité et les compteurs sous `capacity` ; les résultats incertains de création conservent leurs sémantiques de récupération existantes. Les clients doivent arrêter les tentatives automatiques de capacité et préserver le brouillon ou la session sélectionnée pour une nouvelle tentative manuelle. Sur le chemin normal `runQwenServe`, le budget est résolu avant la création de l'application bootstrap, donc `limits.memory` est déjà peuplé pendant la fenêtre bootstrap. Il est `null` uniquement sur les chemins qui ne résolvent aucun budget (comme le direct-embed contournant `runQwenServeImpl`). Le type SDK autorise `null`, donc les clients corrects s'en accommodent.

`runtime.memory.children` est additif dans ce bloc et rapporte le RSS agrégé parmi les enfants nommés par `childRssCoverage` : `rssBytes` (leur somme de RSS auto-rapportée), `sampled` (combien ont produit une lecture), et `oldestReadingAgeMs` (l'âge de la lecture la plus ancienne dans la somme, afin qu'un appelant puisse dire à quel point ses parties ont été prises séparément). Le dénominateur pour `sampled` est le frère `activeAcpChildren`, non répété dans le bloc ; quand `sampled` est inférieur, `rssBytes` est un plancher plutôt qu'un total. L'échantillonnage est conditionné par un watcher SSE/WS actif, donc une demande de statut contre un démon dont personne ne stream rapporte `sampled: 0` même avec des enfants actifs — `activeAcpChildren` à côté rend cet écart visible, et `rssBytes: 0` avec `sampled: 0` ne signifie jamais un zéro mesuré. `oldestReadingAgeMs` est `null` quand rien n'a été échantillonné et aussi quand chaque contributeur est un pont antérieur au champ, donc cela ne signifie jamais "frais". Lisez la somme comme un sur-comptage et un sous-comptage à la fois : sommer le RSS par processus double-compte les pages partagées par les enfants, tandis que chaque enfant ne rapporte que son propre processus, donc ses descendants MCP et chaque worker de canal sont manquants. Ce n'est pas la mémoire de l'arbre du démon. Le champ est optionnel dans le miroir SDK car les démons rapportant `primary_only` ne l'envoient jamais.

`runtime.memory.children.heap` est additif au sein de ce bloc et rapporte les pics historiques de la génération ancienne V8 pour chaque enfant ACP, agrégés comme un **maximum, non une somme** : `peakOldGenerationBytes`, `peakLiveSetBytes`, `peakTotalHeapBytes`, `majorGcCount`, `majorGcMs`, `unclassifiedSpaceNames` et `reported`. Un plafond de tas s'applique par enfant et les pics ont été atteints à des moments différents, donc un total ne répondrait à aucune question ; chaque champ est un maximum indépendant parmi les enfants déclarants, non le portrait d'un seul enfant, et un plafond par enfant est évalué contre chaque axe individuellement. `reported` compte combien de `sampled` ont contribué, et est inférieur lorsque certains enfants précèdent l'apparition des champs. Chaque chiffre en octets couvre la **génération ancienne** — ce que `--max-old-space-size` borne réellement — et non `old_space` seul, car un enfant peut épuiser son plafond avec `old_space` à quelques mégaoctets tandis que `large_object_space` contient tout. `peakOldGenerationBytes` représente les octets engagés et augmente avec le plafond attribué à l'enfant, donc lisez-le comme une borne supérieure sur ce dont la charge de travail a besoin plutôt que comme sa nécessité réelle ; `peakLiveSetBytes` est ce qui survit après un GC majeur et ne bouge pas avec le plafond, ce qui en fait la figure capable de dire qu'un enfant ne peut pas tenir dans un seul ; lisez-le comme une borne supérieure plutôt que comme un ensemble vivant exact, car les entrées de GC arrivent de manière asynchrone et tout ce qui est alloué entre la collecte et la lecture est compté. `peakLiveSetBytes` est égal à `0` jusqu'à ce qu'un GC majeur soit observé, ce qui est une absence plutôt qu'une mesure. `unclassifiedSpaceNames` est l'union des espaces de tas qu'aucun enfant déclarant n'a pu classer ; V8 renomme et ajoute des espaces entre les versions, un espace inconnu est exclu des sommes, et l'exclusion sous-estime — donc un tableau non vide signifie que les chiffres en octets sont incomplets et ne doivent pas être lus comme une mesure complète. L'objet entier est `null`, jamais un objet remis à zéro, lorsqu'aucun enfant échantillonné n'a signalé l'un d'eux ; sans watcher SSE/WS attaché, rien n'est échantillé du tout, c'est donc un état courant plutôt qu'un cas limite. Tout cela est observationnel : rien ici ne dimensionne un enfant, refuse un spawn ou déplace `limits.memory.enforced` hors de `false`.

`runtime.memory.pressure` est additif au sein de ce bloc et rapporte la pression mémoire propre au processus racine du démon : `mode` (`off` / `observe`), `level` (`normal` / `soft` / `hard` / `critical`), `source` (`rss` / `heap` / `unknown`), `ratio`, et les six chiffres bruts dont proviennent les ratios — `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`. `ratio` est le plus grand entre `rssRatio` et `heapRatio`, et `source` nomme lequel c'était ; les égalités sont rapportées comme `rss`. `availableBytes` est `limits.memory.availableMemoryMb` en octets — délibérément la figure détectée du cgroup/hôte plutôt que `effectiveBudgetMb`, car ce qui termine le processus est la limite réelle, non un nombre politique de l'opérateur. `source: "unknown"` signifie qu'aucun dénominateur n'était mesurable et ne doit pas être lu comme sain ; `level` est `normal` dans ce cas uniquement parce qu'il n'y a rien à classifier. Les chiffres couvrent **le processus racine du démon uniquement** : ils sont propres à ce processus `memoryUsage()`, donc la croissance des enfants ne les modifie pas. `runtime.memory.children` les rapporte séparément, et aucune de ces figures n'est la mémoire de l'arbre de processus. Les deux modes rapportent le bloc entier ; seul `observe` remonte en plus l'avertissement `daemon_memory_pressure` sans chemin dans le récapitulatif de statut, donc `off` laisse le `status` de niveau supérieur inchangé. Rien ne se corrige dans aucun mode. Le champ est optionnel dans le miroir SDK car les démons livrés avec `runtime.memory` avant son existence envoient le bloc sans lui.

`limits.maxRegisteredWorkspaces` est additif et rapporte le plafond résolu d'enregistrement utilisateur (par défaut 256, configurable de 1 à 256). `limits.maxChannelControlWorkspaces` rapporte le plafond indépendant de propriétaire contrôle/récupération de 25 sur le démon standard, même lorsque les canaux sont désactivés. Les contrôleurs personnalisés annoncent ce champ seulement quand ils l'appliquent. Ces champs sont présents dans les réponses bootstrap et ready ; les anciens démons peuvent les omettre. Le contrôleur de canal rejette les unions transitoires de propriétaires dépassant son plafond avec `409 channel_control_workspace_limit_reached` avant de construire les candidats workers ; une union initiale au démarrage dépassant le plafond échoue au lancement avant que l'écouteur ne soit publié, donc elle n'a pas de surface HTTP. La capacité d'enregistrement ne détermine pas le délai du canal SDK.

`limits.maxTotalSessions` est additif. `null` signifie que le plafond effectif global de nouvelles sessions du démon est désactivé. Lorsque la capacité d'enregistrement résolue (par défaut 256, configurable via `QWEN_SERVE_MAX_WORKSPACES` ou `maxRegisteredWorkspaces` intégré) dépasse 25 et que `--max-total-sessions` est omis, le démon standard utilise un total fixe de 800, même avec un seul espace de travail au démarrage. À des capacités d'enregistrement de 25 ou moins, plusieurs espaces de travail au démarrage/restaurés avec un `maxSessionsPerWorkspace` fini dérivent le total effectif une seule fois comme `maxSessionsPerWorkspace * workspaceCount` sur ce même nombre de démarrages-plus-restaurations ; un seul espace de travail au démarrage ou restauré conserve un défaut illimité. Les limites totales explicites, y compris les valeurs désactivées, ont priorité. L'enregistrement dynamique ultérieur ne recalcule pas le total. Les intégrations directes `createServeApp` doivent fournir leur propre politique d'admission partagée. Lorsqu'il est défini, il limite la création de nouvelles sessions à travers le démon et rapporte les échecs de limite totale avec la forme d'erreur existante `session_limit_exceeded` plus `scope: "total"`.

`runtime.channel.live` signale le canal de pont ACP à l'intérieur du démon. Ce n'est pas le worker de l'adaptateur de canal. Les canaux gérés par le démon utilisent `runtime.channelWorker`, dont `state` est l'un de `disabled`, `starting`, `running`, `exited`, `failed` ou `stopped`. Lorsqu'un worker atteint `running` puis se termine, `/daemon/status` maintient le démon en ligne et signale le code de problème d'avertissement `channel_worker_exited`.

Le démarrage du worker de canal géré par le démon à partir d'une sélection explicite `qwen serve --channel ...` reste fail-fast et prime sur les paramètres de démarrage persistés. Un démarrage sans indicateur restaure `serve.channels` depuis chaque espace de travail enregistré fiable, chacun contribuant à la liste dans ses propres paramètres de portée d'espace de travail. Les noms restaurés forment une sélection dont les propriétaires sont résolus comme d'habitude, l'espace de travail ayant listé un nom brisant une égalité de propriété autrement ambiguë. Cette attribution au démarrage dure aussi longtemps que le démon fonctionne : un `PUT /workspace/channel` réactivant un tel nom le résout de la même manière qu'au démarrage, même si la sélection a été arrêtée entre-temps. Un nom contribué par un espace de travail non primaire est supprimé, avec un journal l'identifiant, lorsqu'il ne peut pas être résolu, afin qu'une entrée obsolète d'un espace de travail ne bloque pas les autres ; un nom listé par l'espace de travail primaire fait encore échouer la restauration dans son ensemble, qu'un autre espace de travail le liste ou non. `all` reste réservé au primaire : il est ignoré, et signalé, partout ailleurs.

Un espace de travail non primaire fiable enregistré après le démarrage restaure également son propre `serve.channels`, chargeant le runtime du canal et réservant le bail du service de canal si rien d'autre ne l'a fait. Cette restauration :

- se produit **une fois par exécution du démon** — enregistrée dès que l'espace de travail demande quoi que ce soit — afin qu'une suppression et une ré-enregistrement ultérieurs, ou une rematérialisation de confiance, n'annulent pas un opérateur qui a arrêté l'un de ces canaux entre-temps ;
- ne se produit pas sous une sélection explicite `--channel`, qu'aucun espace de travail enregistré plus tard n'étend ;
- ne se produit pas après que `DELETE /workspace/channel` a cessé d'héberger, jusqu'à ce qu'un `PUT /workspace/channel` engage à nouveau une sélection ou que le démon redémarre ;
- laisse une sélection engagée `all` telle quelle ;
- ajoute les noms de cet espace de travail à la sélection validée en une seule modification, avec une restauration tardive à la fois. Contrairement au démarrage, qui ignore un nom qu'il ne peut pas héberger et conserve le reste, un nom qui ne peut pas être attribué laisse la liste entière de cet espace de travail non restaurée, l'erreur étant journalisée et signalée comme décrit ci-dessous.

L'enregistrement n'attend pas du tout le contrôle des canaux. La restauration est mise en file d'attente sur la voie de contrôle des canaux et la réponse est écrite sans attendre, il en va de même pour la réconciliation déclenchée par un changement d'enregistrement ou de confiance pour les canaux que le démon héberge déjà. Un worker qui ne devient jamais prêt retarde donc uniquement les travaux de canal mis en file derrière lui, jamais un autre enregistrement ni une réconciliation de confiance. L'inconvénient est qu'un `201` de `POST /workspaces` ne signifie pas que les canaux de cet espace de travail sont opérationnels, ni qu'un canal déjà hébergé qu'il possède a terminé son redémarrage ; consultez `GET /workspace/channel` pour cela.

Sans sélection explicite, une restauration `serve.channels` au démarrage, ou un enregistrement comme celui décrit ci-dessus, le chargement de l'exécution des canaux reste paresseux.

Les noms de démarrage stockés doivent être non vides, ne comporter aucun espace blanc initial ou final, et ne contenir aucun caractère de contrôle ou invisible non sûr. Les entrées invalides sont ignorées individuellement et journalisées par index de tableau ; le démarrage ne les tronque pas en d'autres noms d'instance ni ne réécrit les paramètres. Les arguments du worker utilisent `--channel=<value>`, préservant un tiret initial comme partie intégrante du nom.

Un champ de démarrage invalide ou une erreur de validation ou de bail avant le démarrage des workers saute la restauration automatique, avec une journalisation identifiant `serve.channels`, tandis que les paramètres non liés restent effectifs. Un échec du démarrage du worker permet au démon de continuer après la réussite du nettoyage. Les délais d'expiration globaux du démarrage de l'exécution et les arrêts de workers non confirmés suivent le chemin existant d'échec de démarrage ; le bail reste détenu tant que la terminaison du worker n'est pas confirmée. La gestion des canaux signale les paramètres de démarrage persistés et l'état réel de l'exécution.

Certains noms `serve.channels` que le démon n'a pas activés sont signalés plutôt que simplement journalisés. Un tel nom ne rejoint jamais la sélection validée, donc aucun instantané de worker ne le porte. Trois cas sont signalés :

- une sélection de démarrage configurée dont le worker n'a pas réussi à démarrer, sur le chemin de démarrage qui maintient le service du démon sans ses canaux ;
- un nom écarté par le résolveur de propriété au démarrage lors de son attribution à un espace de travail, signalé contre chaque espace de travail qui le listait ;
- chaque nom encore non hébergé après l'échec de la restauration d'une inscription tardive.

Ils apparaissent dans deux endroits :

- `/daemon/status` signale un avertissement `channel_restore_failed` par espace de travail, nommant chaque canal avec son erreur. C'est la surface complète, et elle est présente également dans la réponse de bootstrap, qui est la seule qui existe pendant que les enregistrements de démarrage sont écrits. Au plus 64 canaux sont nommés par espace de travail, chaque nom étant limité à 128 caractères, avec `and <n> more` lorsque la liste est plus longue ;
- le `GET /workspaces/:workspace/channels` de cet espace de travail liste le canal avec `runtime: { state: "error", lastError }` au lieu de `stopped`, où `lastError` est l'erreur de démarrage propre de l'adaptateur lorsque le worker en a signalé une pour ce canal, sinon l'erreur de la tentative. Cette surface est construite à partir de la portée des paramètres de canal propres à l'espace de travail, elle ne peut donc porter qu'un nom défini par cette portée — un nom que aucune configuration d'espace de travail enregistrée ne configure, ou dont la configuration se trouve dans un autre espace de travail, n'a pas de ligne ici et est signalé uniquement sur `/daemon/status`.

Tout le reste qui laisse un nom `serve.channels` non hébergé est diagnostiqué uniquement dans le journal du démon : un nom perdu parce que la liste entière était illisible ou invalide, la liste d'un espace de travail non principal écartée parce que le principal a sélectionné `all`, une restauration tardive sautée parce que la sélection validée est `all`, et la liste d'un espace de travail distant (SSH). Consultez les journaux du démon pour ceux-ci.

Un signalement dure jusqu'à ce que le canal soit hébergé — par cet espace de travail ou par une restauration ultérieure depuis un autre — jusqu'à ce que son espace de travail ne soit plus enregistré, ou jusqu'à ce qu'un opérateur agisse : démarrage, arrêt ou redémarrage `POST` sur le canal, `PUT`/`DELETE /workspace/channels/:name`, ou un `PUT`/`DELETE /workspace/channel` qui modifie la sélection. `PUT /workspace/channels/:name/startup` ne le dégage pas : il réécrit `serve.channels` sans rien dire sur la tentative qui a échoué. Le signalement est conservé en mémoire : un démon redémarré restaure à nouveau et signale ce que cette tentative a fait. Le texte de l'erreur est expurgé des identifiants et limité de la manière dont le journal du démon le rend.

Après qu'un worker ait atteint l'état prêt, les sorties inattendues sont redémarrées par le superviseur de service selon une politique bornée : jusqu'à 3 tentatives de redémarrage dans une fenêtre de 5 minutes, avec un backoff de 1 s, puis 5 s, puis 15 s. Le worker envoie des battements de cœur IPC toutes les 15 s ; si aucun battement n'est observé pendant 45 s, le superviseur traite le worker comme obsolète, le tue, enregistre `staleHeartbeatAt`, et utilise le même chemin de redémarrage.

`runtime.channelWorker` peut inclure des champs opérationnels additifs : `requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`, `restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`, `lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures` et `startupFailuresTruncated`. Chaque échec de démarrage possède `channel`, `phase` (actuellement `connect`), un `code` optionnel fourni par l'adaptateur et un `message` avec les identifiants masqués. Au maximum 64 échecs sont conservés pour la génération actuelle du worker ; le drapeau de troncature indique que davantage d'échecs ont été observés. `code` est diagnostique et ne constitue pas une classification stable entre adaptateurs. `restartCount` est le nombre total de tentatives de redémarrage effectuées par ce processus serve ; un worker en cours d'exécution avec `restartCount > 0` est sain sauf si un autre problème s'applique. Un worker en cours d'exécution dont les `requestedChannels` incluent des noms absents de `channels` signale `channel_worker_partial_connect`.

Sur un démon multi-espaces de travail (`--workspace` répété), `runtime` inclut en plus `channelWorkers[]` — une entrée par espace de travail propriétaire, chacune étant un instantané `channelWorker` annoté avec `workspaceId`, `workspaceCwd` et `primary`. `channelWorker` reste peuplé comme l'instantané de l'espace de travail principal pour des raisons de compatibilité. Les démons mono-espace de travail omettent `channelWorkers[]`.

### Contrôle des canaux géré par le démon

La capacité `channel_control` annonce la ressource de sélection d'environnement d'exécution. La ressource est globale au démon bien que son chemin de compatibilité utilise le préfixe singulier `/workspace`. Les sélections d'environnement d'exécution ne sont pas persistées et ne modifient pas l'option `--channel` du démon au démarrage.

`GET /workspace/channel` retourne un instantané immuable du gestionnaire :

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

`selection` est `null` lorsqu'il est désactivé. `pendingSelection` n'est présent que pendant une mutation. `transition` est l'un de `idle`, `starting`, `reconciling`, `stopping` ou `rolling_back`.

`PUT /workspace/channel` est strict-gated et accepte exactement une sélection :

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

Les noms sont nettoyés et dédupliqués sans tri ; un tableau de noms vide est invalide. `all` reste limité à l'espace de travail principal. Une modification de désactivé à activé retourne `201` ; un PUT idempotent ou un remplacement retourne `200`. La réponse est `{ changed, replaced, partial, state }`. Une sélection égale maintient les workers sains en place, mais récupère une sélection égale dont le worker est arrêté ou en échec.

`DELETE /workspace/channel` est strictement contrôlé et idempotent. Il retourne `{ changed, state }` ; un état réussi est désactivé. `POST /workspace/channel/reload` est également strictement contrôlé, relit les paramètres, résout à nouveau les groupes d'espaces de travail et force la réconciliation de la sélection engagée. Il retourne `409 channel_worker_not_enabled` lorsqu'il est désactivé. La capacité `channel_reload` est annoncée dynamiquement uniquement lorsque le gestionnaire possède une sélection engagée et rechargeable.

Chaque activation, remplacement, rechargement, arrêt et arrêt du démon entre dans une voie de cycle de vie FIFO unique. GET n'attend pas cette voie. Les groupes d'espaces de travail dont la sélection ordonnée n'a pas changé restent en ligne. Les échecs de remplacement tentent d'arrêter les nouveaux workers démarrés et de restaurer la sélection engagée précédente. Les clients doivent inspecter `rolledBack`, `rollbackError` et `state` car le nettoyage ou la restauration peuvent également échouer. Le démon conserve le bail PID du service de canal tout au long d'une transaction et ne le libère qu'après confirmation de la sortie de chaque enfant pertinent.

Les erreurs de contrôle stables sont :

- `400 invalid_channel_selection`, `channel_workspace_mismatch`, ou `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict`, `channel_worker_not_enabled`, ou `channel_control_workspace_limit_reached`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed`, avec `rolledBack` et un `rollbackError` optionnel expurgé des identifiants
- `503 daemon_draining`

Les écritures strictes provenant d'une requête principale sans jeton qui atteint la porte sans autorité de boucle locale fiable retournent `401 token_required` avant l'exécution du code de contrôle. Des identifiants configurés manquants ou invalides et des identifiants Local Control non appariés sont rejetés plus tôt avec un simple `401 Unauthorized`. Les requêtes principales via boucle locale fiable s'exécutent normalement. Une fois qu'une requête commence, la déconnexion du client HTTP n'annule pas la transaction de cycle de vie ; les clients peuvent réessayer le même PUT en toute sécurité.

Pour `502 channel_worker_start_failed`, la réponse peut également inclure `startupFailures[]` et `startupFailuresTruncated`. Chaque échec ajoute le `workspaceCwd` fiable du worker tenté. Ces champs décrivent la transaction échouée, tandis que `state` décrit l'état actuel après rollback ; un GET ultérieur ne conserve pas la tentative échouée. Un worker partiellement connecté retourne plutôt un succès et expose ses échecs dans l'instantané du worker. Un démarrage explicite `--channel` sans adaptateur connecté fait échouer le démarrage. Un échec de démarrage dérivé des paramètres est journalisé et permet au démon de continuer après la réussite du nettoyage, sous réserve du délai global de démarrage de l'environnement d'exécution. L'impossibilité de confirmer le nettoyage conserve le comportement normal d'échec de démarrage et le bail de service.

`qwen channel status` sans `--daemon-url` continue de lire les métadonnées du fichier pid ; avec `--daemon-url`, il lit `GET /workspace/channel`. Pendant une fenêtre de redémarrage, le fichier pid possédé par serve reste réservé, mais `workerPid` est omis afin que les clients n'affichent pas un processus worker obsolète. Sur un démon multi-espaces de travail, le fichier pid contient également un tableau additif `workers[]` (par espace de travail `workspaceId` / `workspaceCwd` / `channels` / `workerPid` actif) tandis que le niveau supérieur `channels` (union) et `workerPid` (principal) restent peuplés pour les lecteurs anciens ; les démons mono-espace de travail conservent la forme originale à worker unique. stdout/stderr du worker sont transférés dans le journal du démon avec les jetons bearer, les valeurs d'environnement sensibles du worker et les identifiants URL du proxy masqués.

### Gestion des canaux d'espace de travail

La capacité `channel_management` annonce la configuration de Canal et la gestion de l'environnement d'exécution à portée d'espace de travail. Les routes singulières `/workspace` ciblent l'environnement d'exécution principal. `/workspaces/:workspace` résout l'environnement d'exécution exact enregistré et fiable et ne revient jamais à l'environnement d'exécution principal.

La découverte en lecture seule utilise :

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspace/channels/events`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`
- `GET /workspaces/:workspace/channels/events`

`GET .../channels/events` renvoie le journal des événements Channel de l'espace de travail résolu sous forme de `{ "events": [...], "truncated": boolean }` avec `Cache-Control: no-store`, ainsi qu'un membre optionnel `channelLinkMeta` : une carte du nom d'instance de canal vers les métadonnées de lien non secrètes (`type` et `baseUrl`, présents uniquement lorsqu'ils sont configurés comme chaînes de caractères, et pour les canaux GitHub un `webOrigin` résolu — l'origine de l'interface web que les clients doivent concaténer directement au lieu de la dériver à nouveau depuis la racine de l'API). Les métadonnées sont résolues à partir des paramètres système + utilisateur + espace de travail fusionnés utilisés par les workers de canal — la liste de gestion locale à la portée ne contient pas les canaux configurés dans une autre portée — et filtrées pour les canaux dont le `cwd` résolu appartient à l'espace de travail interrogé, afin qu'un espace de travail ne reçoive jamais les métadonnées de canal d'un autre espace de travail. Cela permet aux clients de lier les lignes du journal (par exemple, une référence PR ou issue GitHub) même pour les canaux hérités des paramètres utilisateur ou système. Le membre est entièrement omis lorsqu'aucun canal n'est résolu, et les anciens démons ne l'envoient jamais ; une erreur de lecture des paramètres se dégrade en son absence plutôt qu'en échec de la lecture du journal. Chaque événement enregistre ce qu'un Canal a fait — un message entrant accepté ou ignoré (avec la raison machine : `reason_filter`, `mention_required`, `duplicate`, un rejet par filtre d'expéditeur, `github_api_error`), un fil GitHub dont le traitement a échoué et qui sera relu (`failed` avec `github_api_error` : une erreur GitHub, ou une erreur locale lorsque le canal ne peut pas lire ou écrire son propre état ou qu'une des tâches du fil est inachevée), un résultat de publication, une transition de tâche entrante, ou un résultat de sondage — et ne porte jamais le texte du message. Un sondage GitHub qui filtre plus de 20 notifications journalise les 20 premières individuellement et une ligne supplémentaire `reason_filter` dont le `detail.filtered` compte le reste, afin qu'un curseur de sondage épinglé ne puisse pas inonder le journal avec des répétitions du même lot. Tant que le curseur est maintenu, un commentaire relu par le sondage est journalisé comme `duplicate` ou `mention_required` une fois par fenêtre, et un fil défaillant comme `github_api_error` lors de son premier sondage défaillant dans la fenêtre et tous les dix sondages défaillants suivants (une limite de débit ou une erreur d'identifiants : son premier et tous les dix sondages suivants), et une fois lorsqu'il est ignoré. Les lignes une fois par fenêtre sont suivies sous jusqu'à 8 192 clés ; une ligne dont la clé ne tient plus est journalisée à chaque sondage. Paramètres de requête : `limit` (1-500, défaut 100), `type` (valeurs séparées par virgules `inbound`, `outbound`, `task`, `poll`), `channel` (répéter le paramètre une fois par nom d'instance), et `since` (ISO 8601). La route ne nécessite aucune autorité opérateur. Les lectures de journal sont asynchrones et bornées : le journal actuel plus un fichier tournant par Canal, 256 KiB par fichier, 4 MiB par requête, 32 fichiers par requête, du plus récent au plus ancien. Les métadonnées de lien lisent également de manière synchrone un instantané sans effets de bord des paramètres fusionnés (quelques petits fichiers JSON, résolus contre l'environnement effectif du runtime) ; c'est une décoration best-effort, donc toute erreur omet le membre au lieu de faire échouer la lecture du journal. `truncated` est vrai lorsque la limite d'enregistrements ou une borne de lecture a tronqué le résultat, y compris un journal plus haut que la fenêtre de fin par fichier. Un espace de travail sans journal encore renvoie une liste vide ; un répertoire de portée illisible répond par une erreur 5xx plutôt qu'une liste vide.

Le catalogue marque les types pris en charge par cette API de gestion avec `manageable: true`. Les instantanés d'instances incluent une révision, des métadonnées de présence de secrets expurgées, l'état de démarrage et l'état d'exécution ; les secrets littéraux ne sont jamais renvoyés. Les instantanés de Canal utilisent `Cache-Control: no-store`.

Les descripteurs de champ peuvent exposer des métadonnées d'objets imbriqués via `properties`. Les descripteurs numériques peuvent utiliser `exclusiveMinimum` pour une borne inférieure ouverte et `maximum` pour une borne supérieure inclusive. Un nombre stocké hors d'une borne nouvellement déclarée est toujours accepté lorsque le client le renvoie inchangé, donc déclarer une borne ne bloque pas les modifications non liées d'un canal existant ; une valeur réellement modifiée par le client doit satisfaire les deux bornes. Les descripteurs de chaîne et de secret peuvent utiliser `multiline` pour demander aux clients une zone de texte multiligne ; les types de descripteurs ne l'autorisent que sur les champs de niveau supérieur. Les clients qui ne rendent pas un type de champ annoncé doivent préserver sa valeur de configuration existante au lieu de la forcer ou de la supprimer, et un client qui rend un champ `multiline` dans un contrôle mono-ligne doit préserver la valeur stockée verbatim au lieu de réécrire sa valeur d'entrée débarrassée des sauts de ligne. Les champs objets ne peuvent pas être requis, et les propriétés imbriquées ne peuvent pas être des secrets ou des champs résolus par environnement ; ces protocoles de gestion restent uniquement au niveau supérieur. Une propriété imbriquée `required` n'est appliquée que si son objet parent est présent dans l'écriture ; omettre l'objet parent laisse ses exigences imbriquées non vérifiées. Les écritures remplacent la valeur stockée de chaque champ intégralement, donc préserver un objet signifie renvoyer l'objet stocké ; le démon ne fusionne pas les objets partiels.

Les écritures de configuration utilisent une concurrence optimiste et la porte stricte d'autorité opérateur :

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- les routes `/workspaces/:workspace/...` équivalentes

Chaque mutation de paramètres inclut `expectedRevision`. Les requêtes d'upsert contiennent un objet `config` et peuvent contenir des opérations explicites sur les secrets : `preserve`, `replace`, ou `clear`. Une configuration de Canal ne peut pas sélectionner un répertoire de travail hors de l'espace de travail résolu.

Les actions d'exécution sont strictement limitées aux requêtes `POST` vers `.../channels/:name/start`, `stop` ou `restart`. Elles opèrent uniquement sur le worker possédé par l'espace de travail résolu.

La gestion du couplage n'est disponible que pour les instances configurées avec la politique d'expéditeur `pairing` ou la politique de groupe :

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` avec `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` avec soit `{ "senderId": "..." }` soit `{ "groupId": "..." }`

Toutes les routes de couplage nécessitent une autorité stricte de l'opérateur et utilisent `Cache-Control: no-store`. Les demandes, approbations et révocations sont limitées à l'instance Channel et à l'espace de travail sélectionnés. Les demandes en attente incluent un sujet utilisateur ou groupe typé ; les demandes de groupe conservent également l'expéditeur qui a initié la demande. Les instantanés d'approbation contiennent `senderIds` et `groupIds` car les listes blanches ne persistent pas les noms d'affichage. La révocation d'un utilisateur ou d'un groupe inconnu renvoie `404 channel_pairing_approval_not_found`.

### Livraison de Canal et Notify

`channel_delivery` annonce un support de livraison immédiate au mieux (best-effort). C'est une capacité du protocole, non un signal de santé du worker. La livraison ne démarre jamais un worker manquant, ne bascule pas sur un autre espace de travail, ne retente pas, ne persiste pas une boîte d'envoi et ne rejoue pas les notifications historiques.

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

Les deux routes utilisent la porte de mutation stricte. La route qualifiée résout uniquement un espace de travail enregistré et fiable. Le succès est `200 {delivered:true,deliveryId}`. `delivered:true` signifie que la promesse d'envoi Channel s'est résolue ; cela ne prouve pas l'acceptation par le fournisseur, la réception par l'utilisateur ni un accusé de lecture. La validation des réponses spécifiques au fournisseur et la cohérence des sémantiques des raisons d'erreur entre les adaptateurs IM sont hors du périmètre de ce contrat V1. Les erreurs sont `400 channel_delivery_invalid`, `503 channel_worker_unavailable` ou `channel_delivery_queue_full`, `504 channel_delivery_timeout`, et `502 channel_delivery_rejected` ou `channel_delivery_failed`. Un délai d'expiration a un résultat inconnu et n'est pas retenté. Il n'y a volontairement pas d'endpoint distinct de test de connectivité : un appel Notify normal constitue le test de bout en bout.

L'événement de résultat rejouable contient uniquement la corrélation et le statut assaini :

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

Une finalisation Prompt réussie vide omet les champs d'erreur :

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

`source` est `prompt` ou `scheduled` ; `status` est `delivered`, `failed` ou `skipped`. `skipped` signifie que le tour éligible s'est terminé avec succès mais que son dernier bloc de réponse assistant sans outil était vide ou composé uniquement d'espaces. Le démon consomme l'autorisation de livraison et publie l'événement sans résoudre de Worker Channel. La corrélation planifiée utilise `taskId` et `firedAt`. L'événement ne contient jamais d'IDs de cible, de texte de message, de credentials ou de secrets webhook.

Sécurité : la réponse n'inclut jamais de jetons bearer, d'IDs client, d'IDs complets de connexion ACP, de codes utilisateur de flux d'appareil ou d'URLs de vérification. Les deux niveaux de détail peuvent inclure des champs additifs `daemon.runId`, `daemon.logMode` et `daemon.logHealth`. `summary` omet le chemin du journal du démon et les détails de perte ; `full` peut inclure `logPath`, `logIssues`, `logDroppedRecords` et `logDroppedBytes` pour les opérateurs authentifiés. La journalisation fichier dégradée ajoute l'avertissement `daemon_log_degraded` sans chemin au récapitulatif de statut normal.

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
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 800,
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

Contrat stable : lorsque `v` s'incrémente, la structure des trames a changé de manière incompatible avec les versions précédentes.

> **`protocolVersions`** décrit les versions du protocole serve que le démon peut utiliser. `current` est la version de protocole préférée du démon et `supported` est l'ensemble compatible. Les clients qui nécessitent un protocole spécifique doivent vérifier `supported` ; l'interface utilisateur spécifique aux fonctionnalités doit toujours se baser sur `features`. Ajouté à v=1 : les anciens démons v=1 omettent ce champ, donc les clients SDK ciblant des builds plus anciens doivent le traiter comme optionnel.

> **`modelServices` est toujours `[]` en Phase 1.** L'agent utilise son unique service de modèle par défaut et ne l'énumère pas sur le réseau. La Phase 2 remplira ce champ à partir des adaptateurs de modèles enregistrés afin que les clients SDK puissent construire des sélecteurs de services ; d'ici là, NE comptez PAS sur ce champ pour être non vide.

> **`workspaceCwd`** est le chemin absolu canonique pour l'espace de travail principal du démon. Utilisez-le pour omettre `cwd` sur `POST /session` (la route revient à ce chemin principal) et pour maintenir la compatibilité avec les anciens clients mono-espace de travail. Ajouté à v=1 : les démons v=1 pré-§02 omettent le champ — les clients ciblant des builds plus anciens doivent vérifier s'il est nul avant de l'utiliser.

> **`workspaces[]`** liste tous les environnements d'exécution enregistrés. Les nouveaux démons mono-espace de travail incluent l'environnement d'exécution principal même si `multi_workspace_sessions` est absent, afin que les clients puissent découvrir l'identifiant stable requis par les routes qualifiées par espace de travail ; les anciens démons peuvent omettre le tableau. Chaque entrée est `{ id, cwd, displayName?, primary, trusted, removable? }`. `displayName` est purement présentationnel et omis lorsqu'il n'est pas défini. Le premier/principal espace de travail reste reflété par `workspaceCwd` ; les nouveaux clients choisissent un environnement d'exécution non principal en passant l'`cwd` de cette entrée à `POST /session`. Les espaces de travail non fiables sont annoncés pour le diagnostic mais rejettent la création de nouvelles sessions avec `403 untrusted_workspace` jusqu'à ce que la confiance change. `removable` est présent sur les démons qui prennent en charge la suppression d'environnements d'exécution et n'est vrai que pour les environnements d'exécution secondaires dynamiques au niveau du processus ou restaurés depuis la persistance.

> **`session_worktree_persistence_v1`** signifie que le démon peut persister et vérifier la propriété des worktrees Part 4A. Les réponses de création réussie de worktree, ainsi que les réponses de restauration dont l'enfant est soit déplacé pendant l'inactivité, soit signale déjà le cwd du worktree vérifié, portent les métadonnées `worktree` plus `worktreeState: "persisted-v1"`. Une restauration héritée best-effort, ou une restauration froide dont l'invite de restauration a été déclenchée plutôt que mise en attente (`suppressWorktreeContextRestore` désactivé, donc la route a demandé au pont de ne pas différer) et qui signale donc une invite active sans cwd actuel, peut encore retourner `worktree` sans cette attestation. Les clients demandant l'isolation doivent pré-vérifier cette balise et vérifier chaque réponse ; l'objet `worktree` seul n'est pas une preuve durable de propriété.

> **`session_worktree_reset_v1`** signifie que le démon prend en charge le transfert de propriété des worktrees : `POST /session/:id/worktree-reset` déplace la propriété du checkout d'une session de worktree persistée vers une nouvelle session de remplacement. Les réponses de restauration gagnent trois classifications 409 typées avec cela : `worktree_session_superseded` (le sidecar de la session porte un lien `supersededBy` — la classification est décidée uniquement à partir de ce lien, avant toute lecture de marqueur, et le lien est écrit avant que le marqueur ne bascule, donc le `replacementSessionId` du corps est une redirection à vérifier plutôt qu'une preuve de propriété : dans un état interrompu pré-commit, il nomme une session qui n'est pas le propriétaire du marqueur, ne peut pas elle-même être restaurée, et est récupérée par la réinitialisation réessayée), `worktree_marker_missing` (le marqueur de checkout est absent ; réinitialisez la tâche pour le recréer — une tentative de restauration ne peut pas le faire, car aucun chemin de restauration n'écrit de marqueur), et `worktree_reset_interrupted` (un transfert précédent a planté en cours de vol avec ses liens sidecar concordants ; réessayez la réinitialisation). La classification interrompue est vérifiée en premier : un marqueur manquant dont les liens `supersedes`/`supersededBy` concordent apparaît comme `worktree_reset_interrupted`, jamais comme `worktree_marker_missing`. Voir la section des routes ci-dessous pour le protocole de transfert et la taxonomie des échecs.

Les balises de fonctionnalité d'espace de travail et `workspaces[]` sont dynamiques. Les clients qui ajoutent un espace de travail doivent récupérer `/capabilities` à nouveau après la fin de la mutation ; le démon ne diffuse pas les changements de capacités aux clients qui ont mis en cache une réponse précédente. Oublier la persistance ne décharge pas un environnement d'exécution actif, donc cet environnement reste annoncé jusqu'au redémarrage.

### `GET /brand`

Le branding produit de Web Shell, pour les hôtes qui souhaitent personnaliser la marque de la coquille. Résolu à partir de `ui.brand` dans les portées de paramètres opérateur. Contrôlé par la balise de fonctionnalité `web_shell_brand` ; un démon sans la route répond 404.

```json
{
  "name": "QiuQiu Code",
  "logoDataUri": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"
}
```

> **Les deux champs sont optionnels, et `{}` est une réponse normale.** Un champ absent signifie "utiliser la marque intégrée du client" — Web Shell affiche son propre nom et son logo intégré. Les clients ne doivent pas traiter un corps vide comme une erreur.

> **Le gestionnaire répond toujours par 200, même lorsque le logo configuré a été rejeté.** Un fichier manquant, un lien symbolique, un fichier lié physiquement, un répertoire, un document non-SVG ou un contenu supérieur à 32 KiB produisent un corps sans `logoDataUri`, et la raison est écrite dans stderr du démon comme `qwen serve: GET /brand: ui.brand.logoPath …`. Un client ne peut donc pas distinguer « aucune marque configurée » de « le logo de l'opérateur a été refusé » ; le canal destiné à l'opérateur est le journal du démon. Un avertissement est plus doux qu'un rejet, et il y en a deux : une racine `<svg>` sans `viewBox` utilisable et sans `width`/`height` positif non-percentage (un viewBox malformé ou d'aire nulle compte comme inutilisable), que le navigateur peut afficher vide à la taille fixe de la barre latérale ; et une racine liée à un préfixe dont les éléments non préfixés manquent de liaison d'espace de noms par défaut, ce qui les rend invisibles. Le middleware devant le gestionnaire répond avant qu'il ne s'exécute — `401` lorsque l'authentification bearer est requise et absente, `429` lorsque le limiteur de débit optionnel est activé. Un démon en cours de vidange ne rejette pas cette route : le limiteur de débit est permissif pendant la vidange, donc le gestionnaire continue de répondre 200 jusqu'à ce que l'écouteur se ferme et que le client voie une échec de connexion à la place. Le démarrage n'est pas un 503 sur cette route : sur le chemin par défaut de runtime différé, la requête est _retenue_ jusqu'à ce que le runtime soit prêt puis répond 200, donc c'est un court délai d'expiration client qui peut se déclencher tôt. Un 503 avec `code: "daemon_runtime_starting"` atteint cette route uniquement sur les configurations qui répondent avant que le runtime soit prêt (par ex. `--open`) et est réessayable ; un 503 avec `code: "daemon_runtime_failed"` est terminal jusqu'au redémarrage du démon et ne porte pas de `Retry-After` — ne le réessayez pas.

> **Les paramètres de l'espace de travail ne contribuent jamais.** La route charge les paramètres avec `skipWorkspaceSettings`, donc le `.qwen/settings.json` d'un dépôt ne peut pas renommer le produit ni nommer un fichier pour que le démon le lise et l'intègre en ligne dans chaque navigateur connecté. Seuls System Defaults, User et System sont lus, dans cet ordre de priorité. Pour la même raison, une valeur de marque est refusée avec un avertissement sur stderr du démon chaque fois que la substitution de placeholder la modifierait : la substitution puise dans l'environnement global au processus, que le bloc `.qwen/.env` ou `env` d'un espace de travail remplit en premier au démarrage. Un placeholder non résolvable (la variable n'est pas définie) est conservé verbatim, donc une variable mal orthographiée apparaît comme texte littéral plutôt que de basculer silencieusement vers une valeur par défaut.

> **`logoDataUri` doit être rendu comme une image, jamais injecté comme balisage.** Le démon ne nettoie pas le SVG qu'il lit. Le SVG chargé via un src `img` ou un href de favicon ne peut pas exécuter de script ; le SVG injecté dans le document le peut. Web Shell ne l'assigne jamais qu'à un contexte d'image, et c'est cette invariance qui rend l'absence d'un assainisseur sûre.

> **Global au processus.** La route ne prend aucun sélecteur d'espace de travail ni id de session : la valeur dérive de la configuration globale utilisateur, donc elle est identique pour chaque espace de travail servi par le démon. Elle est enregistrée après `bearerAuth` et le limiteur de débit, et avant le repli SPA de Web Shell, donc elle répond en JSON pour tout en-tête `Accept`.

### `POST /workspaces`

Enregistrer un runtime d'espace de travail supplémentaire. Le chemin doit être un répertoire absolu existant, accessible, qui ne duplique ni n'imbrigue un autre espace de travail enregistré. L'enregistrement est local au processus sauf si le client envoie `persist: true` ; les clients doivent pré-voler `persistent_workspace_registration` avant de demander la persistance. Lorsque `workspace_display_name` est annoncé, la requête peut également inclure un `displayName` optionnel.

Lorsque `git_workspace_clone` est annoncé, la même route accepte également `{ "kind": "git", "url": "...", "target": "/absolute/new/path" }`. Cette forme exige un `target` absolu qui n'existe pas encore, démarre un clone asynchrone, n'enregistre rien, et retourne `202 { "kind": "git-workspace-clone", "jobId": "..." }`. Les réponses `201` et `200` ci-dessous décrivent les formes synchrones `cwd` et `scratch` ; la forme git n'enregistre rien, et la progression et l'annulation du clone utilisent `GET`/`DELETE /workspace-git-clone-jobs/:jobId`.

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

Un runtime nouvellement créé retourne `201` ; promouvoir un espace de travail secondaire déjà actif en persistant retourne `200`. Le succès persistant inclut `persisted: true` :

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

`displayName` doit être une chaîne de moins de 256 caractères après suppression des espaces blancs environnants. Un résultat vide est traité comme pas de nom, et les caractères de contrôle C0 internes (`U+0000`–`U+001F`) ou DEL (`U+007F`) sont rejetés. Le `null` JSON n'est pas une valeur de création et retourne `400 invalid_display_name` ; omettez le champ pour fournir aucun nom initial. Les noms d'affichage en double sont autorisés. Un nom fourni avec un enregistrement local au processus dure seulement pour ce processus démon ; `persist: true` le stocke avec l'enregistrement persistant afin qu'il puisse être restauré après redémarrage. Répéter la requête pour un espace de travail déjà persistant est idempotent et ne le renomme pas.

Les erreurs incluent `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached` / `workspace_registration_store_too_large`, `500 workspace_registration_store_error` / `runtime_creation_failed`, et `501 persistence_not_available` / `not_implemented`.

### `PATCH /workspaces/:workspace`

Mettre à jour une ressource d'espace de travail active sélectionnée par ID d'espace de travail ou cwd absolu encodé URL. Le point de terminaison ne supporte actuellement que les métadonnées de nom d'affichage :

```json
{ "displayName": "Payments Production" }
```

Envoyez `{ "displayName": null }` pour effacer le nom. Ici `null` est un sentinel de suppression mise-à-jour-seulement ; les valeurs non-null suivent les mêmes règles de normalisation de chaîne que `POST /workspaces`. La réponse est la projection d'espace de travail `{ id, cwd, displayName?, primary, trusted, removable? }` mise à jour. Les métadonnées de runtime sont toujours mises à jour. Si le runtime a des identités d'enregistrement persistant correspondantes, chaque alias est mis à jour atomiquement via le magasin d'enregistrement schema-v1 existant ; le point de terminaison ne crée ni ne promeut jamais un enregistrement persistant.

Les champs non supportés échouent fermés plutôt que d'être ignorés silencieusement. Les erreurs incluent `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error`, et `503 daemon_shutting_down`.

### `DELETE /workspaces/:workspace`

Supprimer un runtime secondaire amovible unique. Le sélecteur suit les règles de routage d'espace de travail pluriel et accepte soit un ID d'espace de travail soit un cwd absolu encodé URL. Le corps JSON optionnel est `{ "force": boolean }` ; l'omettre demande une suppression non-force.

La suppression non-force retourne `409 workspace_busy` avec un instantané `activity` lorsque le runtime gelé a des sessions, prompts, démarrages en attente, connexions ACP, tâches mémoire, ou workers de canal d'espace de travail. Envoyer `{ "force": true }` demande la terminaison de ces ressources. La suppression de persistance est le point de commit : le nettoyage ultérieur est borné et best-effort, les échecs de nettoyage sont journalisés, et la suppression logique converge quand même au lieu de restaurer le runtime. Une réponse réussie est :

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

Une requête non-force immédiatement occupée retourne un instantané d'activité rapide pré-vidange. Une fois la vidange démarrée, la réponse occupée ou réussie contient l'instantané final pris après la fermeture des portes d'admission et de vidange ACP et avant le début du nettoyage. Les erreurs incluent `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported`, et `503 daemon_shutting_down`.

### `GET /workspace-registrations`

Listez l'ensemble d'espaces de travail souhaités persistés pour cet espace de travail principal. Les entrées restent visibles avec `active: false` lorsqu'un répertoire stocké n'a pas pu être restauré lors du démarrage actuel. Une entrée reste `active: true` tant que son runtime se draine car le runtime possède encore des ressources actives jusqu'à la fin de la suppression. Les entrées incluent `displayName` optionnel lorsque l'enregistrement persistant en possède un.

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

Renvoie `501 persistence_not_available` lorsqu'aucun magasin d'enregistrements n'est configuré et `500 workspace_registration_store_error` lorsque le magasin ne peut pas être lu.

### `DELETE /workspace-registrations/:id`

Oublie un enregistrement persisté. Cela ne décharge pas un runtime actif ni ne termine ses sessions ; `restartRequired: true` signifie que le runtime actif disparaît au prochain redémarrage du démon.

```json
{ "removed": true, "active": true, "restartRequired": true }
```

Renvoie `404 workspace_registration_not_found`, `500 workspace_registration_store_error` ou `501 persistence_not_available`. Comme les autres routes de mutation, ce point de terminaison nécessite une authentification de mutation lorsque l'authentification du démon est activée.

### Routes d'état du runtime en lecture seule

Ces routes rapportent des instantanés de runtime côté démon. Ce sont des routes v1 additives, elles ne modifient pas l'état et ne changent pas la version du protocole serve. Les routes de statut d'espace de travail ne démarrent intentionnellement **pas** le processus enfant ACP simplement parce qu'un client interroge une route GET. `GET /workspace/mcp` renvoie `initialized: false` avec un instantané vide lorsque le démon est inactif et ne conserve aucune observation MCP ; si un enfant actif a répondu plus tôt, la lecture inactive rejoue cette observation avec `source: "cache"` et sa valeur `initialized` originale. `GET /workspace/skills` sert plutôt une observation de démon conservée ou une énumération locale au démon, et signale `initialized: false` **avec une entrée `errors`** (indisponibilité retentable, pas un catalogue vide) uniquement lorsqu'aucune observation conservée n'existe et que les deux sources sont indisponibles (ou qu'une lecture froide est limitée) — voir [`GET /workspace/skills`](#get-workspaceskills). `GET /workspace/providers` est répondu localement au démon à partir des paramètres d'espace de travail et de l'environnement, il ne dépend donc pas d'un enfant ACP actif, et `acpChannelLive` signale la vivacité. Son `initialized` est `true` sur le chemin de succès et `false` avec une entrée `errors` lorsque les paramètres d'espace de travail ou la configuration du modèle ne peuvent pas être résolus ; les démons construits sans constructeur de fournisseur local au démon reviennent à l'instantané ACP actif, et la réponse locale au démon omet les modèles enregistrés au runtime. Les routes de statut de session nécessitent une session active et renvoient `404 { code: "session_not_found", ... }` pour les IDs inconnus.

Balises de capacité :

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_resources` → `GET /session/:id/resources`
- Les entrées de moniteur de `session_monitor_tool_correlation` provenant de `GET /session/:id/tasks` incluent `toolUseId` pour la corrélation transcript-tâche
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` et `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` et `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` signale la vivacité ponctuelle du canal ACP de l'espace de travail principal comme `{ channelLive: boolean }`. Le gestionnaire ne crée pas de canal, mais atteindre une route de runtime peut d'abord démarrer un runtime de démon différé, dont la politique de démarrage configurée peut préchauffer indépendamment ACP. L'instantané n'est pas un bail : les clients doivent laisser la création de Session revalider ou démarrer le canal.

### Préchauffage ACP

Balise de capacité : `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N` initialise au mieux (best-effort) le canal ACP de l'espace de travail principal. `timeoutMs` vaut 5000 par défaut et doit être un entier positif inférieur ou égal à 60000. Les appelants concurrents et la création de Session partagent la même initialisation de pont. Un délai d'expiration de requête termine uniquement cette attente HTTP ; il n'annule pas l'initialisation partagée.

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` est toujours égal à `channelLive`. Une réponse en direct omet `reason` et `error` ; sinon, `reason` est soit `timeout`, soit `error`. `durationMs` mesure l'appel HTTP actuel, et non la durée de vie complète d'une initialisation à laquelle l'appel s'est joint. Un délai opérationnel ou un échec renvoie HTTP 200. Un `timeoutMs` invalide renvoie 400, tandis que les échecs d'authentification, de limitation de débit et d'exécution différée conservent leurs réponses normales.

Les deux routes ACP workspace sont au singulier et concernent uniquement le workspace principal. Les clients ne doivent pas les utiliser pour un workspace secondaire ni interpréter l'une des réponses comme une garantie durable de disponibilité.

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

`errorKind` est une énumération fermée partagée par `/workspace/preflight`, `/workspace/env` et (éventuellement) les garde-fous MCP afin que les clients SDK puissent afficher les remédiations par catégorie plutôt que d'analyser des messages libres. Les sept littéraux de statut originaux provenaient de #4175 ; `restore_timeout` a été ajouté séparément pour les demandes de restauration de session. `blocked_egress` reste réservé jusqu'à ce que la sonde egress soit implémentée.

Les charges utiles de statut n'exposent jamais les valeurs d'environnement MCP, les en-têtes, les détails OAuth/compte de service, les clés API du fournisseur, les `baseUrl` / `envKey` du fournisseur, le corps de la compétence, les chemins système de fichiers de la compétence, les définitions de hook ou les valeurs des variables d'environnement secrètes. `/workspace/env` signale uniquement la **présence** des variables d'environnement sur liste blanche ; les URL de proxy sont dépouillées de leurs identifiants et réduites à `host:port` avant transmission.

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

`discoveryState` est l'un de `not_started`, `in_progress` ou `completed`. `transport` est l'un de `stdio`, `sse`, `http`, `websocket`, `sdk` ou `unknown`. `errors` est omis lorsque la découverte réussit.

`source` est `"live"` tant que l'enfant ayant produit l'observation est actif. Lorsque le démon est inactif et qu'un enfant actif a répondu plus tôt, la réponse rejoue cette observation avec `source: "cache"` et les valeurs originales de l'enfant, y compris `initialized: true` et sa liste de serveurs. L'observation mise en cache est effacée uniquement lorsqu'une nouvelle découverte MCP commence ; la suppression de l'enfant ne la supprime pas, donc un `GET /workspace/mcp` inactif peut signaler un catalogue qu'aucun enfant actif ne sert actuellement.

**Garde-fous du client MCP (problème [#4175](https://github.com/QwenLM/qwen-code/issues/4175)).** Les démons actuels étendent la charge utile avec quatre champs additifs et une cellule de budget portée par la capacité :

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

`budgetMode` est l'un des éléments `enforce`, `warn` ou `off`. `clientBudget` est absent si aucun budget n'a été défini. `budgets[]` est **toujours un tableau** sur les démons annonçant `mcp_guardrails` (éventuellement vide lorsque `budgetMode === 'off'`) ; les anciens démons omettent entièrement ce champ. Lorsque `mcp_workspace_pool` est annoncé, la cellule contient `scope: 'workspace'` et couvre le pool partagé de l'exécution d'espace de travail sélectionnée. Lorsque cette balise est absente, y compris sous `QWEN_SERVE_NO_MCP_POOL=1`, le gestionnaire hérité émet `scope: 'session'`. Les consommateurs DOIVENT tolérer des valeurs de portée supplémentaires non reconnues.

`disabledReason` sur les cellules par serveur distingue désactivé par l'opérateur (`'config'` — liste de configuration `disabledMcpServers`) de refusé pour cause de budget (`'budget'` — découvert mais jamais connecté en raison du mode `enforce`). Les refus sont déterministes selon l'ordre de déclaration `Object.entries(mcpServers)`. Le champ `status: 'error', errorKind: 'budget_exhausted'` par serveur masque le champ brut `mcpStatus: 'disconnected'` (qui est vrai mais ne représente pas la sévérité visible par l'opérateur).

L'application du budget est pilotée par les capacités. Avec `mcp_workspace_pool`, les sessions au sein d'une même exécution d'espace de travail partagent les transports et un seul `WorkspaceMcpBudget` ; différentes exécutions d'espace de travail ne partagent jamais un pool ou un budget. Sans la balise, chaque `McpClientManager` de session ACP applique sa propre copie de la limite et l'instantané représente cette vue de session héritée.

**Détection de la pression budgétaire.** Deux surfaces, toutes deux peuplées après PR-14b :

- **Événements push** (annoncés via `mcp_guardrail_events`) : abonnez-vous à `GET /session/:id/events` et filtrez les trames `mcp_budget_warning` / `mcp_child_refused_batch` via `KnownDaemonEvent`. La machine à états se déclenche une fois lors du franchissement ascendant du seuil de 75 % (réarmée en dessous de 37,5 %) ; les refus sont regroupés une fois par passe de découverte en mode `enforce`.
- **Sondage instantané** (annoncé via `mcp_guardrails`) : `GET /workspace/mcp` et inspectez la cellule de budget (`budgets[0]`) ainsi que `mcp_workspace_pool` pour déterminer sa portée :

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (correspond au seuil d'hystérésis utilisé par l'événement push de PR 14b).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (un ou plusieurs serveurs ont été refusés lors de cette passe de découverte).
- `budgets[0].status === 'ok'` ⇔ inférieur au seuil de 75 % ET aucun refus.

Cadence de sondage recommandée : alignée sur tout ce qui sonde déjà `/workspace/mcp` ; l'instantané est peu coûteux et la cellule de budget n'entraîne aucun coût de découverte supplémentaire. Les clients SDK qui s'abonnent aux événements push bénéficient toujours de l'instantané pour l'état après une déconnexion prolongée (la profondeur de l'anneau de rejeu SSE est finie — `--event-ring-size`, défaut 8000 — donc un client hors ligne plus longtemps que la couverture de l'anneau revient à une resynchronisation par instantané).

### `GET /workspace/skills`

Les routes d'inventaire principale et qualifiée par workspace renvoient immédiatement un instantané conservé tout en revalidant en arrière-plan. Les démarrages sont limités à une fois par seconde, mesurés depuis le début de la tâche, et les lecteurs concurrents partagent une tâche. La revalidation en arrière-plan libère son créneau après cinq secondes ; le délai permet une nouvelle tentative mais n'annule pas l'observation ni le travail ACP. Les lectures froides respectent le délai de demande configuré d'ACP (dix secondes par défaut), puis l'énumération locale au démon si ACP est indisponible. Elles n'imposent pas le délai d'arrière-plan à l'une ou l'autre source. Une lecture froide qui échoue dans la seconde suivant son début laisse le reste de cette fenêtre renvoyer immédiatement un statut indisponible ; les échecs plus lents ne laissent aucune fenêtre de limitation, donc les clients ont besoin de leur propre backoff de nouvelle tentative. Une observation réussie tardive en arrière-plan peut publier pendant qu'une nouvelle tentative est en attente, mais ne peut pas remplacer une observation commencée plus tard qui a déjà publié. Les tâches invalidées ne peuvent pas publier ; une observation réussie invalidée peut encore répondre à son appelant original. L'invalidation explicite supprime l'inventaire connu comme invalide et efface la limitation. Un préchauffage ACP réussi qui se termine avant son délai invalide également l'inventaire conservé, y compris lorsque l'enfant était déjà actif, afin que la lecture suivante voie l'enfant. Un préchauffage qui dépasse le délai puis trouve le canal actif signale également `ready: true` — prêt est toujours égal à `channelLive` — mais conserve l'inventaire conservé car le démarrage peut être incomplet ; la lecture suivante renvoie ces données conservées, et la revalidation en arrière-plan les remplace dès que la limitation de démarrage d'une seconde le permet. La suppression de compétence contourne l'instantané et la limitation mais nécessite un catalogue fraîchement énuméré : elle utilise le repli local et ne répond jamais à partir d'un instantané conservé. Les lectures d'identité d'activation contournent l'instantané et la limitation, attendant une nouvelle observation avec repli local puis l'instantané conservé lorsque les deux sources échouent.

Les réponses d'inventaire portant une observation conservée du démon incluent en outre des métadonnées d'instantané facultatives. Les lectures directes de statut de configuration/exécution, les inventaires de ressources de session et les démons plus anciens les omettent. Une lecture froide réussie obsolète renvoie un instantané conservé plus récent si disponible ; sinon, elle renvoie sa propre observation non mise en cache sans ces métadonnées. Seules les observations initialisées sans erreurs peuvent remplacer l'instantané conservé :

```json
{
  "snapshot": {
    "observedAt": 1792486800000,
    "ageMs": 1500,
    "stale": true,
    "refreshing": true
  }
}
```

`observedAt` est l'heure de début en millisecondes Unix de l'observation réussie ; `ageMs` est recalculé à chaque réponse, incluant de manière conservatrice le temps de collecte. `stale` signifie que l'observation a au moins une seconde d'ancienneté. `refreshing` indique si une revalidation occupe le créneau partagé ; les observations ayant expiré peuvent encore se terminer après la libération du créneau. Les lectures échouées, les expirations de créneau et les relectures après l'arrêt de l'environnement d'exécution ne renouvellent pas l'horodatage ; une publication réussie ultérieure enregistre sa propre heure de début d'observation. Les clients peuvent afficher cette ancienneté, mais il ne s'agit ni d'une révision du système de fichiers ni d'une preuve que toutes les sessions sont à jour. Si aucun instantané initialisé n'existe et que les deux sources sont indisponibles (ou que la lecture à froid est limitée), la réponse contient `initialized: false`, une entrée `errors`, et aucune métadonnée `snapshot`. Il s'agit d'une indisponibilité réessayable, et non d'un catalogue vide ; un catalogue vide valide possède `initialized: true`. Les lectures de statut n'invoquent pas de commandes d'actualisation des Skills affectant les sessions. Les environnements d'exécution d'espace de travail fermés ou en cours de vidange rejettent les lectures ; les données conservées survivent au ramassage des canaux enfants, mais pas à la mise à la retraite de l'environnement d'exécution.

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
    },
    {
      "kind": "skill",
      "status": "ok",
      "name": "database-review",
      "description": "Review database changes",
      "level": "extension",
      "modelInvocable": true,
      "installedPath": "/home/alice/.qwen/extensions/alibabacloud-database-suite/skills/database-review/SKILL.md",
      "extensionName": "alibabacloud-database-suite",
      "extensionDisplayName": "Alibaba Cloud Database Suite"
    }
  ]
}
```

`level` est l'une des valeurs `project`, `user`, `extension` ou `bundled`. `userInvocable` (booléen, facultatif) est omis pour les skills normales (signifiant `true`) et n'est présent sous forme de `false` que lorsque le skill ne peut pas être invoqué manuellement. Il ne contrôle pas les routes de bascule Skill uniquement paramétrables décrites ci-dessous. `modelInvocable` est indépendant : `false` signifie que le skill reste disponible manuellement mais est masqué pour l'invocation par le modèle. `installedPath` est le chemin absolu existant vers le `SKILL.md` du skill ; le démon le renvoie tel qu'il est stocké sans résoudre séparément les liens symboliques ni le normaliser. Les démons actuels l'émettent pour chaque skill, tandis que les clients doivent tolérer son absence dans les anciens démons v1. Le corps des skills, les hooks, `skillRoot` et autres configurations de skill restent exclus. `errors` est omis lorsque la découverte réussit.

Pour les skills appartenant à une extension, `extensionName` est le nom canonique du manifeste et peut être utilisé en toute sécurité comme identité du propriétaire. `extensionDisplayName` est une valeur de présentation localisée facultative et peut ne pas être unique. Les nouveaux clients doivent afficher `extensionDisplayName ?? extensionName` ; les anciens démons omettent le champ d'affichage.

Les lectures répétées sont servies à partir du dernier instantané d'espace de travail validé, périodiquement revalidé par rapport au cache en mémoire de l'enfant. Les lectures en régime permanent ne scannent pas les répertoires de skills ni ne réanalysent les fichiers `SKILL.md` ; le repli local à froid du démon peut énumérer depuis le disque. L'enfant vérifie bien que ses sources d'extensions sont inchangées — un `readdir` du répertoire des extensions ainsi qu'un `stat` par entrée, le fichier d'activation et l'état d'activation du magasin — et actualise uniquement lorsqu'ils ont changé, afin qu'une extension installée ou activée/désactivée hors du démon soit détectée par la revalidation et apparaisse lors d'une lecture ultérieure après la publication de cette revalidation. Une lecture chaude renvoie toujours l'observation conservée, même lorsqu'elle démarre un travail en arrière-plan. Les modes sûr et nu sautent la vérification, correspondant à leur exclusion des extensions.

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

Les modèles sont regroupés par type d'authentification. Les diagnostics de connexion aux fournisseurs résident dans la cellule `providers` de `/workspace/preflight` ; le préflight de l'environnement réside dans `/workspace/preflight` et `/workspace/env` (ci-dessous). `errors` est omis lorsque la construction de l'instantané réussit.

### `GET /workspace/env`

Signale l'environnement d'exécution, la plateforme, le bac à sable, le proxy du processus du démon, ainsi que la **présence** de variables d'environnement secrètes sur liste blanche. Répond toujours à partir de l'état `process.*` — le démon ne lance jamais d'enfant ACP pour servir cette route, et la réponse est identique que ACP soit actif ou inactif. Le champ `acpChannelLive` est purement informatif.

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

**Politique de caviardage.** Les cellules `kind: 'env_var'` n'incluent jamais un champ `value` ; les clients voient uniquement `present: boolean`. Les cellules `kind: 'proxy'` font passer la valeur brute de l'environnement à travers le caviardage des identifiants (`redactProxyCredentials`) puis à travers l'analyse `URL` afin que la ligne ne transporte que `host:port`. `NO_PROXY` est transmis verbatim à travers le caviardage car il s'agit d'une liste d'hôtes plutôt que d'une URL. La liste blanche des variables d'environnement secrètes énumérées comprend actuellement `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` et `QWEN_SERVER_TOKEN`. Les autres variables d'environnement ne sont pas énumérées, de sorte que les secrets définis accidentellement restent invisibles.

### `GET /workspace/preflight`

Signale les contrôles de préparation du démon. Les **cellules au niveau du démon** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) sont toujours peuplées à partir de `process.*` et `node:fs`. Les **cellules au niveau ACP** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) nécessitent un enfant ACP actif — lorsque le démon est inactif, elles émettent des espaces réservés `status: 'not_started'`. La route ne lance jamais ACP uniquement pour peupler les cellules ; les cellules correspondantes reviennent à `not_started`.

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

- `missing_binary` — Version Node inférieure à celle requise, `QWEN_CLI_ENTRY` manquant, ripgrep / git / npm absents du PATH (avertissements plutôt qu'erreurs pour les binaires facultatifs).
- `missing_file` — `boundWorkspace` n'existe pas ou n'est pas un répertoire ; erreur d'analyse de skill pointant vers un fichier manquant ou illisible.
- `parse_error` — échec d'analyse de `SKILL.md`, configuration JSON malformée.
- `auth_env_error` — `validateAuthMethod` a renvoyé une chaîne d'échec non nulle, ou une sous-classe `ModelConfigError` propagée depuis la résolution du fournisseur.
- `init_timeout` — Rejet `withTimeout` dans le pont (un délai réel dépassé en attendant un aller-retour ACP). Reconnu via la classe typée `BridgeTimeoutError`. Note : une cellule transitoire `mcp_discovery` `warning` avec `connecting > 0` ne porte PAS ce type — il s'agit d'un état normal de poignée de main en cours, distinct d'un véritable dépassement de délai.
- `restore_timeout` — un chargement ou une reprise de session a dépassé le budget de restauration dédié. La réponse REST est `504` et peut être répétée ; elle se distingue de l'initialisation des processus enfants et des limites bornées de la fenêtre de relecture.
- `protocol_error` — ACP `extMethod` rejeté car le canal s'est fermé en cours de requête, ou parce que le registre d'outils était inattendu absent.
- `blocked_egress` — réservé pour PR 14 (#4175). PR 13 laisse la cellule `egress` comme `status: 'not_started'`.

Si le pont échoue à atteindre le processus enfant ACP lors du traitement d'une requête préliminaire (par exemple, une fermeture de canal en cours de requête), le tableau `errors` de l'enveloppe contient un seul élément `ServeStatusCell` décrivant l'échec et les cellules reviennent aux espaces réservés ACP `not_started`. Les cellules au niveau du démon sont toujours renvoyées.

### `GET /workspace/tools`

Renvoie le catalogue d'outils signalé par le processus enfant ACP de l'espace de travail principal. Il s'agit d'une route héritée pour l'espace de travail principal : elle n'a pas de sélecteur d'espace de travail et ne doit pas être utilisée pour déduire les outils d'un environnement d'exécution non principal.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": true,
  "tools": [
    {
      "name": "ReadFile",
      "displayName": "Read",
      "description": "Read a file",
      "enabled": true
    }
  ]
}
```

Lorsqu'aucun processus enfant ACP n'est actif, la route renvoie toujours `200` avec `acpChannelLive: false`, un tableau `tools` vide, et une entrée `not_started` dans le tableau optionnel `errors`. Les échecs inattendus du pont utilisent la réponse d'erreur standard `500` du pont. La méthode SDK TypeScript est `workspaceTools()` ; il n'y a pas de balise de capacité dédiée, donc les clients prenant en charge les anciens démons doivent traiter `404` comme non pris en charge.

### Routes de fichiers d'espace de travail

Les routes de fichiers héritées résolvent les chemins via l'espace de travail principal ; les routes `/workspaces/:workspace/...` résolvent les chemins via l'espace de travail de l'environnement d'exécution sélectionné. Les réponses utilisent des chemins relatifs à l'espace de travail et ne renvoient jamais de chemins absolus du système de fichiers pour les cas de succès normaux. Les réponses de fichiers réussies incluent :

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

Les valeurs `errorKind` incluent `path_outside_workspace`, `symlink_escape`, `path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`, `permission_denied`, `parse_error`, `hash_mismatch`, `file_already_exists`, `text_not_found`, et `ambiguous_text_match`.

#### `GET /file`

Lit un fichier texte. Paramètres de requête : `path` (requis), `maxBytes`, `line`, `limit`, et `cursor`. Le démon rejette les fichiers binaires. Les fichiers dépassant la limite de capture complète de 256 KiB nécessitent au moins un argument de fenêtre explicite (`line`, `limit`, ou `maxBytes`) ; une requête sans aucun d'entre eux reste `file_too_large`. Une telle fenêtre est diffusée en flux, et son contenu UTF-8 renvoyé reste plafonné à 256 KiB. `maxBytes` s'applique toujours aux octets de réponse UTF-8 après décodage, y compris lorsque la source utilise un autre encodage pris en charge dans la limite de capture complète.

Les décalages de ligne sont résolus en parcourant depuis le début du fichier, donc une fenêtre est également refusée avec `file_too_large` si l'atteindre impliquerait de lire plus de 8 MiB (`MAX_TEXT_SCAN_BYTES`). Utilisez `GET /file/bytes` pour atteindre un décalage plus profond directement. Un grand texte dans un encodage que la route ne peut pas décoder renvoie `binary_file`, pas `file_too_large` — réessayer avec une fenêtre plus petite ne peut pas aider, et `readBytes` est le même remède qui s'applique déjà aux binaires.

Pour les fichiers dans la limite de capture complète, la réponse inclut `hash`, un digest SHA-256 sur les octets bruts sur disque pour tout le fichier, même si `line`, `limit`, ou `maxBytes` ont renvoyé une tranche. Les grandes fenêtres partielles omettent `hash`, conservent le complet `sizeBytes`, définissent `truncated: true`, et renvoient `originalLineCount: null` lorsque le flux s'arrête avant EOF.

##### Pagination avec `cursor`

Nécessite la capacité `workspace_file_read_cursor`. Une réponse ayant plus à donner renvoie `hasMore: true` et, lorsqu'un décalage d'octet de fichier est dérivable, un jeton `nextCursor`. Le renvoyer comme `cursor` reprend en O(1), où un décalage `line` profond coûte une analyse depuis l'octet 0 et est refusé au-delà de 8 MiB.

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → next page
```

`cursor` et `line` sont mutuellement exclusifs (`parse_error`) — tous deux désignent un point de départ. Un curseur mal formé ou trop long est `parse_error` ; un curseur dont le fichier a été remplacé ou tronqué est `hash_mismatch` (409). L'ajout de données **n'invalide pas** un curseur en cours, ce qui est précisément le cas d'usage pour lequel cette fonctionnalité existe.

`content` omet le saut de ligne final de sa dernière ligne, comme toute autre lecture, donc un client réassemblant les pages les joint avec `\n`. `hasMore` n'est pas une reformulation de `nextCursor` : un petit fichier non-UTF-8 lu avec un `limit` a plus de contenu mais pas de décalage d'octet dérivable, donc il signale `hasMore: true` avec `nextCursor: null`. Le curseur est également nul lorsque la limite d'octets coupe la ligne actuelle, car reprendre depuis ce décalage renverrait une ligne partielle. Pour beaucoup de lignes courtes, abaissez `limit` jusqu'à ce que la page se termine avant la limite d'octets et renvoie un curseur. Pour une seule ligne surdimensionnée, demandez explicitement la ligne suivante (par exemple, `line=2` en commençant à la ligne 1), puis continuez avec des curseurs ; utilisez `GET /file/bytes` lorsque la ligne surdimensionnée complète est requise.

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

Lit les octets bruts d'un fichier sans décodage. Paramètres de requête : `path` (requis), `offset` (défaut `0`), et `maxBytes` (défaut `65536`, max `262144`). Cette route prend en charge les fenêtres bornées sur de gros fichiers binaires sans charger tout le fichier. La réponse inclut `hash` uniquement lorsque la fenêtre renvoyée couvre l'intégralité du fichier.

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

#### `GET /stat`

Renvoie les métadonnées pour un chemin de l'espace de travail principal. Le paramètre de requête `path` est requis.

```json
{
  "kind": "stat",
  "path": "src/index.ts",
  "type": "file",
  "sizeBytes": 128,
  "modifiedMs": 1700000000123
}
```

`type` est `file`, `directory`, `symlink`, ou `other`. La route utilise la frontière de fichier de l'espace de travail et l'enveloppe d'erreur système de fichiers commune décrite ci-dessus. La méthode SDK TypeScript est `fileStat()`.

#### `GET /list`

Liste un répertoire de l'espace de travail principal. Le paramètre de requête `path` est obligatoire ; `includeIgnored=1` (ou `true`) inclut les entrées correspondant aux règles d'ignorance. La réponse est limitée à 2 000 entrées et définit `truncated: true` lorsqu'il y en a davantage.

```json
{
  "kind": "list",
  "path": ".",
  "entries": [{ "name": "src", "kind": "directory", "ignored": false }],
  "truncated": false,
  "matchedIgnore": null
}
```

Le champ `kind` de chaque entrée est `file`, `directory`, `symlink` ou `other`. La méthode du SDK TypeScript est `dirList()`.

#### `GET /glob`

Correspond aux chemins dans l'espace de travail principal. Le paramètre de requête `pattern` est obligatoire. L'option `cwd` restreint la recherche, `includeIgnored=1` (ou `true`) inclut les chemins ignorés, et `maxResults` est un entier compris entre 1 et 50 000 (par défaut 5 000).

```json
{
  "kind": "glob",
  "pattern": "**/*.ts",
  "cwd": "",
  "matches": ["src/index.ts"],
  "count": 1,
  "truncated": false,
  "durationMs": 4
}
```

Les correspondances sont relatives à l'espace de travail. Les valeurs de requête invalides renvoient `400` ; la confiance dans l'espace de travail, le confinement, les chemins manquants et les échecs inattendus utilisent l'enveloppe d'erreur système de fichiers commune. La méthode du SDK TypeScript est `glob()`.

#### `POST /file/write`

Crée ou remplace un fichier texte. Il s'agit d'une route de mutation stricte : une demande principale sans jeton via boucle locale fiable est autorisée. Une demande principale sans jeton qui atteint la porte sans autorité de boucle locale fiable renvoie `401 { "code": "token_required" }`. Les échecs d'authentification par jeton configuré et par identifiants Local Control sont rejetés plus tôt avec un simple `401 Unauthorized` ; avec `--require-auth`, le middleware porteur global rejette les demandes non authentifiées avant que la route ne s'exécute.

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

`mode` doit être `create` ou `replace`. `create` ne remplace jamais un fichier existant (`409 file_already_exists`). `replace` nécessite `expectedHash` ; les hachages manquants ou malformés sont `400 parse_error`, et les hachages obsolètes sont `409 hash_mismatch`. `expectedHash` est `sha256:` suivi de 64 caractères hexadécimaux minuscules, calculés sur les octets bruts sur disque.

`bom`, `encoding` et `lineEnding` peuvent être fournis. Le remplacement conserve par défaut le profil d'encodage du fichier existant ; les champs explicites le remplacent. Les écritures binaires sont hors du périmètre.

Le démon écrit dans un fichier temporaire aléatoire dans le répertoire cible, effectue fsync là où c'est pris en charge, revérifie le hachage actuel immédiatement avant `rename()`, puis renomme pour mettre en place. Cela empêche l'observation de fichiers partiels et sérialise les écritures initiées par le démon vers le même fichier, mais ce n'est pas une comparaison-échange atomique inter-processus au niveau du noyau : un éditeur externe peut encore entrer en concurrence dans la petite fenêtre entre la vérification finale du hachage et le renommage.

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

Applique une seule substitution textuelle exacte dans un fichier texte existant. Il s'agit également d'une route de mutation stricte et nécessite `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` doit être non vide et se produire exactement une fois. Aucune correspondance renvoie `422 text_not_found` ; plusieurs correspondances renvoient `422 ambiguous_text_match`. La route préserve l'encodage, le BOM et les fins de ligne, et revérifie `expectedHash` immédiatement avant le renommage atomique.

Les écritures/modifications explicites sur des chemins ignorés sont autorisées car l'appelant authentifié a nommé le chemin. Les réponses de succès et les événements d'audit incluent `matchedIgnore: "file" | "directory" | null`.

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

#### `POST /workspaces/:workspace/directory/create`

Nécessite `workspace_qualified_rest_core` et `workspace_directory_create`, une autorité de mutation stricte et un espace de travail local actif fiable. Corps :

```json
{ "path": "src/new-folder" }
```

Le parent doit exister. La création est exclusive : un fichier ou répertoire existant renvoie `409 file_already_exists` ; un lien symbolique final renvoie `400 symlink_escape`. Le succès est `201 { "kind": "directory_create", "path": "src/new-folder" }`. La méthode SDK est `WorkspaceDaemonClient.createWorkspaceDirectory(path, clientId?)`.

#### `POST /workspaces/:workspace/directory/delete`

Nécessite `workspace_qualified_rest_core` et `workspace_directory_delete` sous la même politique stricte de mutation et d'exécution locale fiable. Corps :

```json
{ "path": "src/old-folder" }
```

Supprime récursivement un répertoire vide ou non vide. Les racines d'espace de travail, les fichiers réguliers et les liens symboliques finaux sont rejetés ; les entrées de liens symboliques imbriqués sont supprimées sans suivre leurs cibles. Une cible manquante renvoie `404 path_not_found`. Le succès est `200 { "kind": "directory_delete", "path": "src/old-folder" }`. La méthode SDK est `WorkspaceDaemonClient.deleteWorkspaceDirectory(path, clientId?)`.

Les deux routes de répertoire préservent le nom final lexical tout en résolvant son parent dans l'espace de travail sélectionné. Les chemins ne doivent pas se terminer par un séparateur ; les motifs de chemin suspects renvoient `400 path_outside_workspace`, tandis que les formes de feuille malformées renvoient `400 parse_error`. Les fabriques personnalisées non prises en charge renvoient `422` ; les espaces de travail SSH sont rejetés par la frontière SSH avec `501`. Les propriétaires inconnus, indisponibles, supprimés ou non fiables ne retombent jamais sur le principal.

La suppression est permanente et les échecs peuvent laisser une suppression partielle. Un écrivain concurrent peut causer `ENOTEMPTY`, renvoyé comme `503 io_error` ; réessayez la même opération après l'arrêt de l'écrivain. Les verrous par chemin ne sérialisent pas un répertoire contre chaque écriture enfant, et le remplacement de répertoire externe ne peut pas être rendu atomique par des vérifications portables basées sur le chemin. Les mutations explicites de répertoires ignorés sont autorisées et les événements d'audit annotent `matchedIgnore` lorsque applicable ; la création enregistre `sizeBytes: 0`.

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

Pour une session de premier niveau, `state` reflète les mêmes formes d'options de modèle/mode/config ACP utilisées par `POST /session`, `POST /session/:id/load` et `POST /session/:id/resume`. Un identifiant de session virtuelle préfixé par `subagent.` se résout par rapport à son runtime parent et renvoie un objet `state` vide.

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

`availableCommands` est le même instantané de commande utilisé par la notification SSE `available_commands_update`. `availableSkills` liste uniquement les noms de compétences ; les clients ne doivent pas s'attendre à des corps ou des chemins de compétences via cette route.

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

Cette route est un instantané hors bande en lecture seule. Elle n'est intentionnellement pas une invite et peut être interrogée pendant que la session diffuse. La réponse ne contient que des métadonnées sur liste blanche provenant des registres de tâches agent, shell et moniteur ; les contrôleurs, minuteurs, décalages, messages en attente et objets de registre bruts ne sont jamais exposés.

Les tâches d'agent engendrées par un autre sous-agent (sous-agents imbriqués, limités par `maxSubagentDepth`) comportent trois champs de lignée facultatifs : `parentAgentId` (le `id` de la tâche d'agent qui a engendré), `parentName` (le `subagentType` de l'agent qui a engendré, capturé lors de l'enregistrement afin de survivre à l'éviction du parent du registre), et `depth` (profondeur de lancement à base 0 ; 0 = engendré par la session de niveau supérieur). Les agents lancés par la session de niveau supérieur omettent `parentAgentId` et `parentName` ; les clients doivent traiter ces trois champs comme facultatifs et revenir à une liste plate en leur absence.

### `GET /session/:id/tasks/:taskId/runtime`

Détail à la demande pour une tâche shell. `GET /session/:id/tasks` ne contient que des faits relatifs au cycle de vie ; cette route lit le fichier de sortie capturé et sonde l'arbre des processus, de sorte qu'un panneau de détail ouvert le demande séparément.

La méthode ACP est `_qwen/session/task_runtime`, avec les paramètres `sessionId` et `taskId`. Les deux transports résolvent le propriétaire de la session active ; ACP exige également que la connexion possède la session.

Le `taskId` du chemin est résolu par rapport au propre registre shell de la session ; les appelants ne passent jamais un chemin de fichier.

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "taskId": "bg_0123abcd",
  "runtime": {
    "memoryBytes": 104857600,
    "outputBytes": 65536,
    "outputModifiedAt": 1700000000000,
    "outputTail": "ready in 120ms\n",
    "outputTailTruncated": true
  }
}
```

`runtime` est `null` lorsque la tâche est inconnue, a été évincée ou n'est pas une tâche shell. `memoryBytes` est l'ensemble résident de l'arbre des processus du shell, échantillonné uniquement pendant l'exécution de la tâche ; les pages partagées sont comptées une fois par processus, et un bac à sable conteneur peut n'exposer que le processus wrapper. `outputTail` est plafonné à la même limite de 8 KiB utilisée par la notification de fin, et `outputTailTruncated` marque une fin qui commence au milieu du fichier. `outputError` est défini lorsque le fichier ne peut pas être lu ; les champs d'une partie ayant réussi peuvent toujours être présents.

### `POST /session/:id/tasks/:taskId/workflow-action`

Contrôle une exécution de workflow, ou en démarre une nouvelle. La méthode ACP est `_qwen/session/tasks/workflow_action`.

```json
{
  "action": "run-script",
  "script": "export const meta = { name: 'daily-audit', description: 'Audits yesterday' }\nreturn await agent(args.question)",
  "args": { "question": "which tables grew?" },
  "sourceRef": { "id": "definition-7", "revision": "rev-3" }
}
```

Ce que `taskId` nomme dépend de l'action :

| `action` | `taskId` | Démarre une exécution |
| ----------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `pause`, `resume`, `retry`, `rerun` | l'id de l'exécution | `retry` et `rerun` le font |
| `delete-history` | l'id de l'exécution | non |
| `run-saved` | le nom du workflow sauvegardé, `<extension>:<name>` pour une extension | oui |
| `run-script` | une clé de départ choisie par l'appelant | oui |

`args`, `sourceRef` et `script` sont lus uniquement par `run-saved` et `run-script`. `args` est lié à la variable globale `args` du script et peut être n'importe quelle valeur JSON ; `sourceRef` est le propre `{id, revision}` de l'appelant, enregistré sur l'exécution, son journal et son instantané ; `script` est la source que `run-script` exécute et qui est requise par celui-ci. Une nouvelle tentative ou une réexécution rejoue le propre `args` et `sourceRef` de l'exécution originale — c'est ce qui fait qu'il s'agit de la même exécution — de sorte que ces champs sont ignorés ainsi que les actions de contrôle.

Une exécution démarrée appartient à la session : elle s'exécute en arrière-plan sans invite d'approbation, et sa fin atteint le canal de fin de la session. Elle constitue ensuite une cible `retry`/`rerun` comme toute autre exécution.

`retry` et `rerun` acceptent également une exécution restaurée depuis l'historique (`isHistorical` dans `GET /session/:id/tasks`), telle qu'une interrompue par un redémarrage du démon : l'exécution est relancée à partir du script, `args` et `sourceRef` de son instantané, et elle s'enregistre auprès de la session qui a envoyé l'action et lui signale sa fin. Un `retry` reprend le journal de l'exécution sous le même identifiant d'exécution et s'applique à une exécution `failed` pour laquelle aucun processus n'est encore en cours d'exécution ; un `rerun` démarre un nouvel identifiant d'exécution à partir de n'importe quelle exécution terminée. Une entrée d'historique portant `argsOmitted` a été lancée avec un `args` trop volumineux pour être conservé, de sorte qu'aucune action ne s'y applique. Il en va de même pour un instantané écrit avant que `args` ne soient conservés, qui ne porte ni `argsOmitted` ni `argsRecorded` : le journal d'une exécution est indexé à partir d'un hachage de son `args`, de sorte que relancer une exécution dont l'historique ne peut nommer le `args` ne rejouerait rien et rediffuserait chaque agent. Les deux refus sont `workflow_args_unavailable`, et `GET /session/:id/tasks` les signale tous deux comme `argsUnavailable` sur l'entrée, afin qu'un client puisse masquer les deux actions plutôt que de découvrir le refus en effectuant l'appel. `argsOmitted` reste à côté comme raison, pour un client souhaitant préciser laquelle. Les `args` eux-mêmes ne sont jamais transmis sur le réseau.

`run-script` ne transmet aucun nom de définition, de sorte que l'exécution est étiquetée par le propre `export const meta` du script — un script compilé devrait en déclarer un, sinon l'exécution n'affiche que son identifiant.

La réponse est `{"changed": true, "status": "running", "taskId": "<runId>"}` pour une exécution démarrée, `{"changed": true, "status": "<status>"}` pour une action de contrôle ayant pris effet, et `{"changed": false}` lorsqu'il ne s'est rien passé : Workflow est indisponible pour la session (désactivé, mode nu, dossier non fiable), l'espace de travail n'est pas fiable, le nom du workflow enregistré est inconnu, l'identifiant d'exécution est inconnu, ou un autre démarrage est déjà en cours sous le même `taskId`. Seuls les démarrages chevauchants sont dédupliqués : deux appels `run-script` concurrents sous un seul `taskId` démarrent une seule exécution. Une fois ce démarrage revenu, la clé est libérée ; la soumettre à nouveau peut démarrer une autre exécution, même si la première est toujours active. La clé ne fournit pas d'idempotence de nouvelle tentative après une réponse perdue.

Un paramètre rejeté est un `400` (`-32602` via ACP), et non une exécution démarrée : un `action` inconnu, un `run-script` sans `script`, un `sourceRef` qui n'est pas un `{id, revision}` de chaînes non vides, ou un script rejeté avant le lancement en raison d'une syntaxe invalide ou d'une violation de déterminisme. Les erreurs d'entrée de démarrage de Workflow portent `workflow_invalid_params` et conservent le message de rejet.

Quatre refus proviennent de l'état stocké de l'exécution plutôt que de la requête. Chacun est `-32602` via ACP, portant son `errorKind` et son `data.httpStatus`. Trois sont des `409` ; le quatrième, `workflow_not_recorded`, est un `503`, car rien n'a été démarré et le même appel peut simplement être refait : un `retry` enregistre que l'exécution est de nouveau en cours avant de démarrer — cet enregistrement est ce qui empêche un autre processus de la démarrer une seconde fois — et l'enregistrement n'a pas pu être écrit.

| `code` / `errorKind` | HTTP | Quand | Que faire |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `workflow_journal_unavailable` | `409` | un `retry` dont l'exécution n'a pas de journal sur disque, ou un qui ne peut être lu | `rerun`, ce qui la démarre depuis le début |
| `workflow_args_unavailable` | `409` | un `retry` ou `rerun` d'une entrée d'historique marquée `argsUnavailable` : ses `args` étaient trop grands pour être conservés, ou son instantané précède leur conservation | la relancer avec `run-saved` ou `run-script` et ses `args` |
| `workflow_run_live_elsewhere` | `409` | un `retry` d'une exécution dont le point de contrôle enregistre un processus dont on n'a pas vu la sortie — un encore en cours, un sur une autre machine, ou un dont le pid a été réutilisé | `rerun`, ce qui prend un nouvel identifiant d'exécution |
| `workflow_not_recorded` | `503` | un `retry` dont l'enregistrement indiquant que l'exécution tourne à nouveau n'a pas pu être écrit, donc elle n'a pas démarré | refaire le même appel ; l'exécution est intacte |

`workflowToolFeatures` dans `GET /session/:id/supported-commands` annonce `runSavedArgs` et `runScript` ; un démon sans eux n'accepte ni l'entrée de démarrage ni l'action `run-script`. Il contient également `nameOnly`, vrai lorsque le modèle de la session ne peut exécuter que des workflows nommés (`tools.workflowNameOnly`) : les appels `script` et `scriptPath` du modèle lui-même sont refusés, tandis que toutes les actions ci-dessus, y compris `run-script`, démarrent toujours des exécutions. `retryHistorical` est vrai lorsque `retry` et `rerun` acceptent une exécution restaurée à partir de l'historique ; un ancien démon leur répond par `{"changed": false}`, donc un client ne doit proposer ces contrôles pour une entrée d'historique que si elle est signalée.

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

`status` est l'un de `NOT_STARTED`, `IN_PROGRESS`, `READY` ou `FAILED`. L'élément facultatif `error` est présent sur les serveurs en échec lorsqu'il est disponible. Un LSP désactivé (y compris en mode nu) renvoie HTTP 200 avec `enabled: false`, des compteurs à zéro et `servers: []`. Un LSP activé sans serveurs configurés renvoie `enabled: true`, `configuredServers: 0` et `servers: []`. Si l'initialisation échoue avant que le client existe, la réponse peut inclure `initializationError` ; si un client actif ne peut pas fournir d'instantané, la réponse inclut `statusUnavailable: true`.

Cette route expose uniquement les champs stables destinés aux clients. Elle omet intentionnellement les détails internes de débogage tels que les identifiants de processus, les arguments de lancement, les fins de stderr, les URI racines et les chemins des dossiers de l'espace de travail.

### `GET /session/:id/resources`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/session/path",
  "skills": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "skills": []
  },
  "mcp": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "discoveryState": "completed",
    "servers": []
  }
}
```

Cette route propriétaire de session active lit la Config de la session sélectionnée via sa propre connexion ACP. Elle ne combine pas les routes d'état globales au processus ou au niveau de l'espace de travail, n'initialise pas un runtime froid, n'attache pas de client et ne revient pas à l'espace de travail principal. Les sessions inconnues et persistées uniquement renvoient la réponse `session_not_found` existante.

Les objets imbriqués utilisent exactement les contrats d'état `GET /workspace/skills` et `GET /workspace/mcp`. Leurs champs `workspaceCwd` identifient la Config qui a produit l'instantané et correspondent à la valeur de premier niveau. Les règles de caviardage existantes s'appliquent toujours : les identifiants MCP et les en-têtes, les valeurs d'environnement, les corps des Skills et les paramètres bruts n'apparaissent jamais dans la réponse. Les enrichissements d'authentification MCP, de pool, de budget d'espace de travail et d'erreurs de découverte d'espace de travail sont absents car leur état sous-jacent appartient à l'espace de travail ou est indexé uniquement par nom de serveur plutôt que par session. L'état, la découverte et la comptabilité provenant du gestionnaire MCP propre à la session sélectionnée restent disponibles.

### Cycle de vie des sessions autonomes (`standalone_sessions_v1`)

Lorsque `/capabilities.features` contient `standalone_sessions_v1`, le démon expose une famille de routes globales au processus pour les sessions autonomes de niveau supérieur appartenant à son runtime Conversations dédié. Ces routes n'acceptent jamais de sélecteur de workspace et ne reviennent jamais au workspace principal. Les intégrations directes qui ne peuvent pas construire le graphe de dépendances complet de propriété, runtime, répertoire, cycle de vie et journal de suppression de Conversations omettent à la fois la fonctionnalité et toutes les routes ci-dessous.

| Route | Requête | Succès |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /standalone/sessions` | `{ "sessionId": "<UUID>", "modelServiceId"?: string, "startupConfig"?: { "modelServiceId": string, "reasoningEffort"?: ReasoningSelection }, "approvalMode"?: ApprovalMode }` | `200` avec la session autonome, `context: { "kind": "standalone" }`, et son répertoire de sortie géré sans projet. La création est sans invite. |
| `GET /standalone/session-options` | aucune ; tout champ de requête est rejeté avec 400 | `200` avec `{ v, initialized, current?, approvalMode?, providers, errors? }` ; le chemin interne du workspace et l'état du canal ACP sont omis |
| `GET /standalone/sessions` | Requête : `cursor?`, `size?` (1-100), `archiveState?` (`active` ou `archived`) | `200 { sessions, nextCursor?, liveMergeFailed?, truncated? }` |
| `GET /standalone/sessions/:id` | aucune | `202 { sessionId, state: "creating" }` pendant que la création locale est en cours, sinon `200` avec le résumé exact. |
| `POST /standalone/sessions/:id/load` | Options de restauration existantes uniquement : `historyPageSize?`, `liveReplayMode?`, `compactedReplayMode?`, `hideInheritedHistory?`, `approvalMode?` ; l'identité du client reste dans `X-Qwen-Client-Id`. | Session autonome restaurée `200`. |
| `POST /standalone/sessions/:id/resume` | Mêmes options de restauration que `load`. | Session autonome restaurée `200` sans relecture de l'historique de chargement. |
| `POST /standalone/sessions/:id/repair-directory` | Corps vide ou `{}` | `200` avec le répertoire géré vérifié ou recréé. |
| `PATCH /standalone/sessions/:id/metadata`        | `{ "displayName": string }`                                                                                                                                                          | `200 { sessionId, displayName }`                                                                                                               |
| `GET /standalone/sessions/:id/export` | Requête : `format=html`, `format=md`, `format=json`, ou `format=jsonl` (par défaut `html`). | Type de contenu, nom de fichier et corps d'exportation existants. |
| `POST /standalone/sessions/archive`              | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { archived, alreadyArchived, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/unarchive`            | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { unarchived, alreadyActive, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/delete`               | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { removed, notFound, errors, fileCleanupPending }`                                                                                        |

Lorsque `POST /standalone/sessions` porte le `modelServiceId` hérité, la réponse inclut `modelApplied` : `false` signifie que le changement de modèle au lancement a échoué (également signalé via l'événement de session `model_switch_failed`) et que la session fonctionne sur le modèle par défaut de l'agent — la création réussit néanmoins afin que l'appelant puisse avertir, libérer ou réessayer explicitement.

Les corps doivent être des objets JSON sans champs inconnus. Les IDs sont des valeurs RFC UUID v1-v5 ; le démon les normalise en minuscules. Les requêtes par lots contiennent 1-100 chaînes et sont validées et dédupliquées avant mutation. Une échec de lot est signalé comme `{ sessionId, code, message }` et ne revient pas en arrière sur les opérations réussies pour d'autres IDs. `fileCleanupPending` signifie que la suppression du transcript a été engagée mais que le nettoyage du sidecar autorisé par le journal ou du répertoire géré doit être réessayé par réconciliation ; la session est déjà logiquement supprimée.

Seuls les transcripts autonomes explicites et la forme de compatibilité héritée documentée de niveau supérieur sont visibles. Les enregistrements enfants, Live, projet, worktree, ambigus, illisibles ou journalisés pour suppression échouent fermés. La création continue si sa réponse HTTP se déconnecte ; une session engagée n'est pas supprimée, et le client de réponse est détaché. Récupérez par GET exact suivi de load/resume plutôt que de réessayer create comme attach.

Archiver, désarchiver, réparer, renommer et supprimer partagent la même admission de cycle de vie par session que load/resume et les invites. Supprimer utilise le unlink du transcript comme point d'engagement durable et un journal privé plus une mise en scène atomique du répertoire géré pour la récupération après crash. La récupération restaure le répertoire lorsque le transcript reste intact et complète le nettoyage lorsque le transcript a disparu ; toute identité non correspondante, chemin conflictuel, propriétaire étranger ou transcript ambigu renvoie une erreur structurée fail-closed.

### `POST /session`

Le contrat optionnel `startupConfig` est décrit sous [Capacités](#capabilities). Contrairement à la sélection de modèle best-effort héritée, une sélection de démarrage rejetée fait échouer la création.

Lancer un nouvel agent ou attacher à un existant (sous `sessionScope: 'single'`, par défaut).

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread",
  "worktree": { "slug": "feature-a" }
}
```

| Champ | Requis | Notes |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | non | Chemin absolu correspondant à un workspace enregistré. Si omis, la route revient au workspace principal (lisez-le depuis `/capabilities.workspaceCwd`). Un `cwd` non vide non correspondant renvoie `400 workspace_mismatch`. Lorsque `features` contient `multi_workspace_sessions`, les clients peuvent passer tout `workspaces[].cwd` de confiance ; sinon seul le workspace principal est accepté. Les chemins de workspace sont normalisés via `realpathSync.native` (avec un repli resolve-only pour les chemins inexistantes) afin que les systèmes de fichiers insensibles à la casse ne rejettent pas les sessions selon l'orthographe. |
| `modelServiceId` | non | Sélectionne quel _service_ de modèle configuré l'agent utilisera pour router (le fournisseur back-end — Alibaba ModelStudio, OpenRouter, etc.). Si omis, l'agent utilise son défaut. Si le workspace a déjà une session, cela appelle `setSessionModel` sur l'existant et diffuse `model_switched`. Distinct de `modelId` sur `POST /session/:id/model`, qui sélectionne le modèle **au sein** d'un service déjà lié. Le tableau `modelServices` sur `/capabilities` est réservé à la publicité des services configurés ; au Stage 1 il est toujours `[]` (le service par défaut de l'agent est utilisé et non énuméré via HTTP). |
| `startupConfig` | non | `{ modelServiceId: string, reasoningEffort?: ReasoningSelection }` ; nécessite `session_startup_config`, crée un nouveau fil et confirme la sélection demandée sans écrire les défauts partagés. Ne peut pas être mélangé avec `modelServiceId` de niveau supérieur ou une portée unique explicite. |
| `sessionId` | non | UUID v1-v5 de variante RFC choisi par l'appelant. Le démon le normalise en minuscules et crée toujours une nouvelle session de fil ; il ne traite jamais ce champ comme un attach idempotent. Confirmez que `caps.features` contient `session_id_override` avant de l'envoyer car les anciens démons peuvent ignorer les champs inconnus. `null` est équivalent à l'omission. |
| `sessionScope` | non | Remplacement par requête pour le partage de session. `'single'` (la valeur par défaut à l'échelle du démon) fait qu'une seconde instance `POST /session` du même espace de travail réutilise la session existante (`attached: true`) ; `'thread'` force une nouvelle session distincte à chaque appel. Omettre pour hériter de la valeur par défaut à l'échelle du démon. Les valeurs hors énumération renvoient `400 { code: 'invalid_session_scope' }`. Les anciens démons (avant PR 5 #4175) ignorent silencieusement ce champ — vérification préalable `caps.features.session_scope_override` avant l'envoi. La valeur par défaut à l'échelle du démon est codée en dur sur `'single'` en production aujourd'hui ; #4175 pourrait ajouter un indicateur CLI `--sessionScope` dans une mise à jour ultérieure. |
| `worktree` | non | Créer une nouvelle session de thread dans un worktree Git nommé par l'utilisateur. Le paramètre optionnel `slug` utilise la validation des noms de worktree du démon. Vérification préalable `session_worktree_persistence_v1` ; les clients ne doivent pas inférer une isolation durable à partir de réponses antérieures de type worktree. La création d'un worktree n'est pas une opération d'attachement et ne peut pas être combinée avec la création de branche. La route renvoie un succès uniquement après la relocalisation, la création du marqueur de propriété exclusive, la persistance sidecar et une vérification finale de la génération runtime. |

Réponse :

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "worktree": {
    "slug": "feature-a",
    "path": "/canonical/path/.qwen/worktrees/feature-a",
    "branch": "worktree-feature-a"
  },
  "worktreeState": "persisted-v1"
}
```

`attached: true` signifie qu'une session pour cet espace de travail existait déjà et que vous la partagez maintenant.

`worktreeState` est présent uniquement pour une session attestée de worktree. Une restauration best-effort héritée peut renvoyer `worktree` sans `worktreeState`. Une restauration froide Part 4A dont l'invite de restauration a été déclenchée plutôt que mise en attente (`suppressWorktreeContextRestore` désactivé, donc la route a demandé au pont aucun report) renvoie également des métadonnées `worktree` non vérifiées jusqu'à ce que l'invite se stabilise : l'enfant lit actif sans cwd rapporté, la relocalisation est impossible sous une invite active, et la route conserve la session plutôt que de tuer celle que l'appelant vient de récupérer. Aucune réponse n'est une preuve durable de racine d'exécution. Un client ayant demandé une isolation par worktree doit exiger `worktreeState: "persisted-v1"` et le chemin canonique attendu avant de router une invite ; un chargement initial peut être réessayé après que l'invite active se soit stabilisée. Lors de la reconnexion SDK, le résultat dépend de la présence ou non de métadonnées `worktree` dans la réponse : une réponse qui les porte avec une attestation manquante ou un chemin modifié est terminale pour ce client — le nouvel attachement est détaché et l'invite n'est pas réessayée — tandis qu'une réponse sans objet `worktree` du tout guérit : le client abandonne sa revendication de worktree en cache, conserve le nouvel attachement et réessaie l'invite dans le même appel. La guérison ne conditionne pas ce réessai, donc un tour peut encore s'exécuter dans un répertoire que le client ne peut plus attester (un `exit_worktree` que le client n'a jamais vu est la cause ordinaire, et le client ne peut pas le distinguer d'une association en mémoire effacée). Un appelant conscient de l'isolation doit donc revérifier lui-même l'attestation du worktree avant de dispatcher une invite ; la revendication abandonnée ne fait échouer cet appelant de manière sécurisée (fail closed) à sa propre porte d'identité lors de son prochain chargement ou sélection.

Les IDs fournis par l'appelant sont uniques parmi tous les runtimes d'espace de travail actuellement enregistrés et toutes les générations de pont encore vivantes, y compris les remplacements en vidange. Un doublon vivant, en attente, actif, archivé ou basé sur un worktree renvoie `409 session_id_conflict`. Les valeurs invalides renvoient `400 invalid_session_id` ; une vérification indisponible du propriétaire vivant ou de l'état persisté renvoie `503 session_id_admission_unavailable` réessayable. Réessayer avec backoff borné après des changements de santé du pont ou du stockage ; `retryable` signifie qu'une autre tentative est sûre, pas qu'un réessai immédiat réussira. Si l'agent aval renvoie un ID différent, le démon supprime cet orphelin et renvoie `500 session_id_not_honored`. Après une réponse ambiguë, charger ou reprendre l'ID connu au lieu de réessayer create comme un attach.

Les intégrations multi-clients souhaitant des conversations indépendantes doivent envoyer `sessionScope: "thread"` sur chaque `POST /session`. Utilisez la portée `single` par défaut uniquement lorsque les clients partagent intentionnellement une session collaborative ; les sessions partagées sérialisent les prompts via une seule file FIFO, visible via `/daemon/status` comme `runtime.activity.pendingPrompts` et `runtime.activity.queuedPrompts`.

Les appels `POST /session` concurrents pour le même espace de travail sont **fusionnés** en un seul spawn — les deux appelants obtiennent le même `sessionId`, exactement un signale `attached: false`. Si le spawn sous-jacent échoue (timeout d'init, sortie d'agent malformée, OOM), **tous les appelants fusionnés reçoivent la même erreur** — le slot en cours est vidé afin qu'un appel suivant puisse réessayer depuis zéro.

> ⚠️ **Le rejet de `modelServiceId` sur une nouvelle session est silencieux dans la réponse HTTP.** Un mauvais `modelServiceId` (faute de frappe, service non configuré) ne provoque PAS une erreur 500 lors de la création — la session reste opérationnelle sur le modèle par défaut de l'agent afin que l'appelant obtienne toujours un `sessionId` contre lequel il peut réessayer le changement de modèle (via `POST /session/:id/model`). Le signal d'échec visible est un événement `model_switch_failed` sur le flux SSE de la session, déclenché entre la poignée de main de génération et votre premier abonnement. **Les abonnés qui ont besoin d'observer cet événement doivent passer `Last-Event-ID: 0` sur leur premier `GET /session/:id/events`** pour rejouer depuis l'événement le plus ancien disponible dans l'anneau (couvre le `model_switch_failed` au moment de la génération même si l'abonnement arrive quelques millisecondes après la réponse de création).

### `GET /session/:id/status`

Renvoyez le résumé en direct du runtime qui possède la session. Cette route ne charge pas une session persistée uniquement et ne revient jamais au runtime principal. Pré-vol `caps.features.session_status`.

```json
{
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "createdAt": "2026-09-10T08:00:00.000Z",
  "clientCount": 1,
  "hasActivePrompt": true,
  "isWaitingForPermission": false,
  "isWaitingForUserQuestion": false,
  "pendingInteractionCount": 0,
  "pendingInteractions": []
}
```

La réponse est la forme de transmission `DaemonSessionSummary`. Les champs facultatifs incluent les métadonnées d'affichage et de source, `activeWorkState`, `updatedAt`, `turnError`, les métadonnées de worktree ou de branche, et les liaisons PR. `404` signifie qu'aucun propriétaire actif n'existe ; un propriétaire en cours d'amorçage, en vidange ou indisponible renvoie `503` au lieu de revenir en arrière. Un propriétaire non principal non fiable renvoie `403 untrusted_workspace`, et un id actif dans plus d'un espace de travail renvoie `500 ambiguous_session_owner`. La méthode SDK TypeScript est `sessionStatus()`.

### ID fourni par l'appelant ACP `session/new`

Les clients ACP demandent le même comportement via le champ de métadonnées d'extension :

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

La réponse contient l'ID normalisé en minuscules. Les montages ACP primaires et qualifiés par espace de travail partagent l'admission avec REST, y compris `session/load` et `session/resume`. Les IDs invalides utilisent l'erreur ACP `INVALID_PARAMS` avec `data.httpStatus=400` et `data.errorKind="invalid_session_id"` ; les conflits utilisent `data.httpStatus=409` ; les vérifications indisponibles du propriétaire vivant ou de l'état persisté utilisent `data.httpStatus=503` et `data.retryable=true`.

Une session créée par ACP qui ne reçoit jamais de prompt ne laisse aucune trace persistée, et le démon la récupère lorsque sa connexion propriétaire se ferme avec zéro session attachée. Après cette récupération, le même ID peut être recréé — il s'agit du cycle de vie de la connexion, pas d'une réutilisation d'ID : tant que la connexion (ou tout attachement) est active, l'admission rejette le doublon.

### `POST /session/:id/load`

`liveReplayMode` et `compactedReplayMode` acceptent `full` (par défaut) ou `summary`. Ils projettent respectivement `liveJournal` et `compactedReplay` sans modifier l'historique stocké. La sélection de page précède le filtrage, donc les éléments visibles peuvent être moins nombreux que `historyPageSize`. Les valeurs invalides renvoient `400 invalid_live_replay_mode` ou `400 invalid_compacted_replay_mode`. Le chargement autonome accepte les deux options mais signale les valeurs invalides comme `400 invalid_request`.

Restaurez une session ACP persistée par id et rejouez son historique via SSE. L'id du chemin est autoritaire ; tout champ `sessionId` dans le corps est ignoré. Pré-vol `caps.features.session_load` — les démons plus anciens retournent `404` pour cette route.

Requête :

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Champ | Requis | Notes |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | non | Même normalisation que `POST /session`, avec un contrat d'absence plus strict pour la restauration : un `cwd` explicite sans entrée dans le registre (supprimée, ou jamais enregistrée) retourne `404 workspace_not_found` — une absence permanente que les appelants peuvent classer comme disparue — tandis qu'un espace de travail dont l'entrée existe dans un état réversible (vidange, transition, bloqué) retourne toujours `400 workspace_mismatch`. Omettre pour hériter de `/capabilities.workspaceCwd`. Lorsque `features` contient `multi_workspace_sessions`, les appelants peuvent passer n'importe quel `workspaces[].cwd` enregistré fiable ; les espaces de travail non primaires non fiables retournent `403 untrusted_workspace`. `mcpServers` n'est intentionnellement PAS accepté ici — le MCP à l'échelle du démon est piloté par les paramètres (correspond à `POST /session`). |

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

`state` reflète le `LoadSessionResponse` d'ACP — `models` est un `SessionModelState`, `modes` un `SessionModeState`, `configOptions` un tableau de `SessionConfigOption`. Les champs manquants sont décidés par l'agent. Les attachements tardifs (les chemins `attached: true` ci-dessous) obtiennent le MÊME instantané `state` que celui vu par l'appelant de chargement original — le démon le met en cache sur l'entrée ; les mutations d'exécution (par ex. `model_switched`) sont livrées sur le flux SSE, pas sur les réponses d'attachement ultérieures.

`attached: true` signifie que la session était déjà active (soit à partir d'un `session/load`/`session/resume` précédent, soit parce qu'un appelant concurrent fusionné a pris une légère avance).

Lorsque la session persistée possède un worktree Part 4A, le chargement/reprise valide son sidecar, sa containment canonique et son marqueur de checkout exact. Un enfant inactif est relocalisé avant la réponse ; un enfant actif n'est attesté que si son cwd rapporté est déjà égal au worktree, et un enfant actif dont le cwd rapporté est absent ou ailleurs échoue fermé au lieu d'être déplacé sous son prompt — sauf pour une restauration froide qui n'a pas pu différer son prompt de restauration (`suppressWorktreeContextRestore` désactivé — toute restauration dont la source effective n'est pas possédée par Channel — ou un pont sans API de différé) : cette forme retourne toujours `worktree` sans `worktreeState`, non relocalisée, et la session survit. Les réponses relocalisées et attestées retournent `worktree` plus `worktreeState: "persisted-v1"`. Classifications 409 typées côté restauration (annoncées par `session_worktree_reset_v1`) : `worktree_session_superseded` lorsque le sidecar de la session porte un lien `supersededBy` — la classification lit ce lien seul, sous le verrou de propriété par checkout et avant toute lecture de marqueur, afin qu'un transfert qui effectue un rollback pendant que le chargement attend ne puisse pas rediriger l'appelant vers une session que le même démon supprime ; le lien est écrit avant que le marqueur ne bascule, cependant, donc le `replacementSessionId` du corps est une redirection à vérifier plutôt qu'une preuve que la propriété a changé : après un transfert engagé, les appelants doivent charger cet id et mettre à jour leur tenue de livres, mais dans un état interrompu pré-engagement, il nomme un remplacement qui n'est pas le propriétaire du marqueur, dont la propre restauration retourne `worktree_reset_interrupted`, et que le reset réessayé récupère ensuite — donc `replacementSessionId` ne doit pas être persisté comme id de session de la tâche tant qu'un chargement réussi de celui-ci n'a pas eu lieu ; `worktree_reset_interrupted` lorsque le lien `supersedes` de la session restaurée et le lien `supersededBy` de la session nommée concordent mais que le marqueur n'a jamais bougé ou est absent — un reset précédent a planté en cours de transfert et un reset réessayé est la réparation ; et `worktree_marker_missing` lorsque le marqueur de checkout est absent sans cette paire de liens concordante — la réinitialisation de la tâche est la réparation, car aucun chemin de restauration ne recrée un marqueur et une nouvelle tentative de restauration retourne le même 409. La classification interrompue est vérifiée en premier, donc une paire de liens concordante n'apparaît jamais comme `worktree_marker_missing`. Chaque fois que la source de restauration effective est possédée par Channel, la route supprime le nettoyage best-effort de l'agent pour l'état sidecar Part 4A ou non classifiable, afin que l'état persisté obsolète, étranger, ambigu ou avec discordance de propriété soit préservé et fasse échouer la requête. Les métadonnées de source persistées ont la priorité ; lorsqu'elles sont absentes, la requête de chargement/reprise fournit la source effective. Un sidecar hérité structurellement valide sans le champ `workspaceCwd` Part 4A conserve la restauration agent best-effort existante, peut être nettoyé par ce chemin, et peut retourner `worktree` sans `worktreeState` ; les clients ne doivent pas inférer l'isolation à partir de ces métadonnées de compatibilité. En dehors de ce cas explicite de compatibilité héritée, seules les sessions dont la source de restauration effective n'est pas possédée par Channel conservent le nettoyage best-effort existant avant la validation de la route. Un sidecar manquant ne retourne aucune attestation de worktree ; les clients conscients de l'isolation doivent rejeter cette réponse plutôt que de relier la session à l'espace de travail partagé.

**Relecture de l'historique via SSE.** Pendant que `loadSession` est en cours côté agent, l'agent peut émettre des notifications `session_update` pour les tours persistés, ou renvoyer des mises à jour de relecture groupée dans les métadonnées de la réponse. Le démon insère ces événements dans la fenêtre d'instantané de relecture bornée de la session avant le retour de la réponse de la route. Pour les sessions actives, `POST /session/:id/load` ne garantit que cette fenêtre bornée (`compactedReplay`, `liveJournal`, `lifecycleReplay` facultatif, `lastEventId`), et non la transcription complète. Lorsqu'une session active inactive est actualisée à partir d'une page persistée bornée, `lifecycleReplay` complète cette page avec jusqu'à 1024 trames `session_update` contenant uniquement des métadonnées portant `_meta.executionLifecycle` ou `_meta.toolLifecycle` depuis la fenêtre en mémoire. Ce complément peut chevaucher les enregistrements de cycle de vie persistés ; les clients doivent le réduire de manière idempotente et ne doivent pas en déduire que les démarrages rejoués sont toujours en cours d'exécution. `lifecycleReplayIncomplete: true` signale une couverture en mémoire indisponible, dégradée ou tronquée ; `false` ne garantit pas une transcription complète. Ces champs facultatifs ne constituent pas un magasin persisté séparément, et les anciens démons peuvent les omettre. La fenêtre est limitée en octets par `--compacted-replay-max-bytes` (par défaut 4 MiB, maximum 256 MiB) ; si d'anciennes entrées de relecture ont été supprimées, `compactedReplay[0]` est un marqueur `history_truncated` sans identifiant. L'élément `liveJournal` en cours est séparément limité par `--max-journal-events` (par défaut 10 000 entrées de relecture) et `--max-journal-bytes` (par défaut 8 MiB d'événements sources sérialisés). Il s'agit de limites **de base** par session. Quand un tour en cours dépasse ces limites, le démon tente d'abord une croissance adaptative : il augmente les limites de cette session vers le double (jusqu'à une limite dure par session de 256 MiB, les entrées étant ajustées proportionnellement, limitées par la marge restante du pool) tant que la croissance accordée sur toutes les sessions actives tient dans un seul pool de croissance à l'échelle du démon dimensionné à 5 % du budget mémoire effectif du démon — la valeur `--memory-budget-mb` lorsqu'elle est fournie, plafonnée à la mémoire disponible résolue, sinon 50 % de la mémoire auto-détectée — plafonnée à `1024` Mo. La comptabilité est à l'échelle du démon — un démon multi-espaces de travail exécute un pont par espace de travail et tous partagent le même pool unique. La croissance est à la demande et seulement dans la mesure permise par le pool ; un `--max-journal-events` ou `--max-journal-bytes` fixé par l'opérateur la désactive, tout comme un hôte dont le budget effectif tombe sous le minimum de 1024 Mo (`insufficientMemory`) : le pool est alors à 0 et la croissance adaptative est entièrement désactivée. Les événements sources `agent_message_chunk` ou `agent_thought_chunk` consécutifs compatibles partagent une entrée de relecture, jusqu'à 256 événements sources par entrée, tandis que les frontières des outils, attributions, provenances et messages discrets restent intactes. Quand le journal dépasse encore ses limites (peut-être augmentées) après la croissance permise par le pool — y compris quand aucune marge n'est accordée ou qu'un octroi ne couvre qu'une partie du dépassement — les plus anciennes entrées sont supprimées intégralement (la queue conservée peut donc être bien plus petite que la limite en octets) et un marqueur `history_truncated` avec `scope: 'live_journal'` est préfixé ; ses champs `truncatedEvents` et `retainedEvents` comptent les événements sources, pas les entrées de relecture, et ses `maxBytes` / `maxEvents` reflètent les limites en vigueur (qui peuvent déjà avoir augmenté). Les clients doivent afficher ce marqueur comme statut et continuer à appliquer les événements conservés. L'accès complet à la transcription persistée est exposé séparément via `GET /session/:id/transcript`.

Les limites en octets de la fenêtre de relecture s'appliquent après que l'enfant a reconstruit la transcription persistée ; elles ne limitent pas la lecture JSONL sur disque. Une restauration dépassant le budget du démon renvoie `504` avec un `Retry-After` dérivé du budget de restauration (plafonné entre 5 et 120 s) et `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}`. Le démon isole la requête ACP encore en cours et nettoie toute session tardive au lieu de l'enregistrer. Une nouvelle tentative pour le même identifiant renvoie `409 restore_in_progress` avec `reason: "awaiting_abandoned_cleanup"` et un `Retry-After` correspondant au budget de restauration (plafonné entre 5 et 120 s) tant que ce nettoyage n'est pas terminé. Si le nettoyage tardif de la restauration est incertain, ou si la restauration abandonnée n'a toujours pas abouti après un budget de restauration complet suivant son échéance, les nouvelles sessions sur cet espace de travail renvoient `503 acp_channel_unavailable` avec `reason: "restore_cleanup_failed"` ou `"restore_settlement_overdue"`. Une initialisation de session expirée suit la même politique d'admission fail-closed pour un enfant ACP plus ancien qui aboutit tardivement : un nettoyage inconclusif renvoie `reason: "new_session_cleanup_failed"`, tandis qu'une requête restant non résolue pendant un budget d'initialisation supplémentaire renvoie `reason: "new_session_settlement_overdue"`. Un état de retard de résolution se rétablit immédiatement après qu'un échec tardif est résolu, ou après qu'un succès tardif termine son nettoyage par ID exact ; un nettoyage inconclusif passe plutôt à l'état de nettoyage échoué correspondant. Les états de nettoyage échoué persistent jusqu'à ce que le canal de l'espace de travail soit vidé et recyclé. Les sessions déjà actives restent utilisables dans les deux cas.

**Erreurs :**

- `404` — l'identifiant de session persisté n'existe pas (`SessionNotFoundError`).
- `404` — `workspace_not_found` quand un `cwd` explicite n'a aucune entrée dans le registre (supprimée, ou jamais enregistrée) : une absence PERMANENTE, distincte des états réversibles ci-dessous. Corps : `{ error, code: "workspace_not_found", boundWorkspace, requestedWorkspace }` — pas de `workspaceCount`. Un client ayant lu l'ancien contrat « 404 signifie que la session a disparu » doit considérer ce code comme un échec de routage contournable (p. ex. réenregistrer l'espace de travail), et non comme une preuve que la session a été supprimée.
- `400` — `workspace_mismatch` (même forme que `POST /session`), incluant les états de cycle de vie réversibles : un espace de travail dont l'entrée de registre existe mais est en cours de vidange, de transition ou bloqué. Réessayez une fois l'espace de travail stabilisé ; ne le classez pas comme disparu.
- `403` — `untrusted_workspace` quand `cwd` cible un espace de travail non principal non fiable.
- `503` — `session_limit_exceeded` (compte contre `--max-sessions` ; les restaurations en cours sont également comptabilisées).
- `504` — `session_restore_timeout` ; réessayable, avec un `Retry-After` dérivé du budget de restauration (plafonné entre 5 et 120 s) car le même identifiant de session reste isolé jusqu'à ce que le nettoyage tardif soit terminé.
- `504` — `init_timeout` ; NON réessayable, pas de `Retry-After`, pas de `sideEffectPossible`, aucun isolement installé. Émis quand l'initialisation du canal expire avant que la requête de restauration soit envoyée (l'étape `ensureChannel`) ; la restauration n'a jamais été tentée, donc aucun identifiant de session n'est isolé et aucun nettoyage n'est en attente.
- `503` — `acp_channel_unavailable` lorsque le canal de l'espace de travail est fermé aux nouvelles tâches de session. `reason` explique pourquoi : `restore_cleanup_failed` lorsqu'une restauration abandonnée n'a pas pu être nettoyée de manière concluante ; `restore_settlement_overdue` lorsqu'une restauration abandonnée ne s'est toujours pas stabilisée après un budget de restauration complet suivant son échéance ; `new_session_cleanup_failed` lorsqu'une session créée après le délai d'initialisation public n'a pas pu être fermée de manière concluante ; ou `new_session_settlement_overdue` lorsque l'initialisation expirée ne s'est toujours pas stabilisée après un budget d'initialisation supplémentaire suivant son échéance. Les sessions existantes restent disponibles. Sur un runtime d'espace de travail avec plus d'un moteur d'exécution, l'une de ces mises en quarantaine concerne le canal de ce moteur à la place : ses sessions n'acceptent non plus aucune nouvelle tâche (les invites, les continuations, les requêtes latérales, les commandes shell, les messages en cours de tour et les démarrages Goal ou workflow renvoient le même `503`), les sessions stabilisées sont fermées, et les nouvelles sessions de ce moteur restent refusées jusqu'à ce que l'arbre des processus du canal soit supprimé, avec `channel_exit_unverified` tant que cela ne peut être confirmé. Là, `workspace_change_unacknowledged` signifie que le canal n'a pas accusé réception d'un changement d'espace de travail affectant la session (règles d'autorisation, rechargement des paramètres, la porte Session Workflow, fournisseurs de modèles ou Skills) ; une accusé de réception tardif de chaque changement manquant met fin prématurément à cette mise en quarantaine. Un état de dépassement de délai de stabilisation se résout après qu'un échec tardif se stabilise ou qu'un succès tardif termine son nettoyage par ID exact ; un nettoyage inconclusif transitionne vers l'état correspondant de nettoyage échoué, qui nécessite que le canal de l'espace de travail se vide et soit recyclé. Le corps contient `retryAfterSeconds` et l'en-tête un `Retry-After` dérivé du budget correspondant afin que les clients utilisent une temporisation à l'échelle du budget opérationnel au lieu de interroger selon la cadence ordinaire de 5 secondes.
- `409` — `restore_in_progress` (un `session/resume` pour le même id est déjà en cours, ou un nouveau spawn a fourni un id possédé par une restauration). `Retry-After: 5` pendant que la restauration est active ; une indication dérivée du budget une fois qu'elle est isolée comme `awaiting_abandoned_cleanup`. Les courses sur la même action (deux `session/load` concurrents pour le même id) fusionnent — exactement un renvoie `attached: false`, les autres renvoient `attached: true` avec le même `state`.
- `409` — `session_workspace_conflict` lorsque le même id de session est déjà actif ou en cours de restauration par un autre runtime d'espace de travail.
- `409` — `session_archived` lorsque l'id existe uniquement sous `chats/archive/` ; appelez `POST /sessions/unarchive` avant `load` ou `resume`.
- `409` — `session_archiving` lorsque l'archivage ou le désarchivage est en cours pour le même id. `Retry-After: 5`.
- `409` — `session_conflict` lorsque l'id existe à la fois dans `chats/` et `chats/archive/` ; supprimez la session avec `POST /sessions/delete` avant le chargement.

### `GET /session/:id/transcript`

Renvoie une page de trames de relecture `session_update` sans id reconstruites à partir de la transcription JSONL persistée active. Pré-vol `caps.features.session_transcript` — les anciens démons renvoient `404` pour cette route.

Paramètres de requête :

| Champ | Requis | Notes |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | non | Curseur opaque base64url renvoyé par la page précédente. Omettre pour la première page. Le curseur est émis par le démon et vérifié contre la falsification ; sa modification renvoie `400 invalid_transcript_cursor`. Il est lié à l'identité du fichier de transcription et à la taille en octets figée de la première page ; supprimer, tronquer, remplacer ou archiver le fichier invalide le curseur et renvoie `409`. |
| `limit` | non | Nombre cible d'éléments `ChatRecord` actifs dans une page. Par défaut `100`, maximum `500`. Une page arrière peut s'étendre à au plus `3 * limit` enregistrements pour préserver les limites de tour et d'appels/résultats d'outils. Un enregistrement peut produire plusieurs trames de relecture, donc `events.length` peut être encore plus grand. Les valeurs invalides renvoient `400 invalid_transcript_limit`. |
| `direction` | non | La seule valeur acceptée est `backward`, qui démarre une page aux enregistrements les plus récents. Omettre le paramètre pour paginer vers l'avant sur une première page, ou pour continuer la direction figée dans `cursor`. Ne peut pas être combiné avec `cursor`, `beforeRecordId`, `atRecordId` ou `snapshot`. |
| `beforeRecordId` | non | Démarrer une page arrière avant cet id d'enregistrement. Implique le sens arrière, donc n'envoyez pas aussi `direction`. Ne peut pas être combiné avec `cursor` ou `atRecordId` ; peut être associé à `snapshot`. |
| `compactedReplayMode` | non | `full` (par défaut) ou `summary`. Projette `events` après la sélection de page, donc le nombre visible peut être inférieur à `limit`. Ne modifie pas l'historique stocké ni la sélection du curseur. Également accepté par la route de transcription qualifiée par l'espace de travail. Les valeurs invalides renvoient `400 invalid_compacted_replay_mode`. |

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

`events` sont uniquement des trames de relecture : `{ v: 1, type: "session_update", data: SessionUpdate }`. Elles ne portent pas d'ids EventBus, et la réponse n'inclut jamais `lastEventId`. Appeler cette route n'appelle pas `/load`, n'attache pas de client, ne précharge pas l'EventBus live, ne crée pas de session live, et ne modifie pas la fenêtre de relecture live actuelle. Les sessions actives live et inactives sont toutes deux reconstruites par la méthode de statut en lecture seule côté enfant afin que la relecture utilise les mêmes paramètres d'espace de travail, répertoire de sortie runtime, émetteurs et sémantique d'historique `/load` sans muter l'état de session du démon.

La première page fige la taille actuelle du snapshot JSONL. Les pages suivantes lisent uniquement ce préfixe en octets, donc les ajouts après la page 1 ne modifient pas l'ensemble de résultats. Si le fichier disparaît, est tronqué en dessous de la taille figée, est remplacé par un inode différent, ou est déplacé vers l'archive, la page suivante renvoie `409` et le client doit redémarrer depuis la page 1 ou demander à l'utilisateur de rouvrir la transcription.

Pour protéger la mémoire du démon et la latence, les snapshots dépassant le plafond d'indexation de transcription échouent avant que le démon ne scanne le JSONL. Les clients reçoivent `413 transcript_too_large` et doivent recourir au traitement export/hors ligne ou demander à l'utilisateur de raccourcir/archiver l'historique ancien.

`partial: true` et `replayError` peuvent apparaître si la conversion de relecture échoue après avoir produit certaines trames. Les réponses partielles n'incluent jamais `nextCursor`, donc les clients ne peuvent pas silencieusement paginer au-delà des enregistrements qui n'ont pas été convertis.

**Erreurs :**

- `400` — `limit`, `cursor`, `direction`, `beforeRecordId` ou forme d'id de session invalides. Les paramètres de pagination sont mutuellement exclusifs : `cursor` ne peut pas être combiné avec `beforeRecordId`, `atRecordId` ou `snapshot` ; `snapshot` nécessite `atRecordId` ou `beforeRecordId` ; `atRecordId` nécessite `snapshot` ; et `backward` ne peut pas être combiné avec un curseur ou un ancrage d'enregistrement quelconque.
- `404` — l'id de session persistée active n'existe pas lors de la demande de première page.
- `409` — `session_archived`, `session_archiving` ou `session_conflict` issus des mêmes vérifications de chargeabilité que `/load`.
- `409` — le snapshot de transcription est indisponible car le fichier a été supprimé, tronqué, remplacé ou archivé après l'émission du curseur ; cela s'applique également lorsque le pré-vol ne peut plus trouver le fichier actif pour une demande de curseur.
- `413` — `transcript_too_large` lorsque le snapshot de transcription figé dépasse le plafond d'indexation du démon.
- `413` — `transcript_page_too_large` lorsqu'un enregistrement agrégé dépasse le budget de page qualifié par l'espace de travail ou que la page sérialisée dépasse son budget de réponse.

### `GET /session/:id/export`

Téléchargez la transcription de session persistée active de l'espace de travail principal. La requête facultative `format` est `html` (par défaut), `md`, `json` ou `jsonl`. Pré-vol `caps.features.session_export`.

Les réponses réussies sont des pièces jointes avec un nom de fichier assaini, `Cache-Control: no-store` et `X-Content-Type-Options: nosniff`. Le type de contenu est `text/html`, `text/markdown`, `application/json` ou `application/jsonl` selon le format sélectionné. La route lit uniquement le stockage persisté : elle ne résout pas un propriétaire actif, ne démarre pas ACP et n'attache pas de client. Utilisez la route qualifiée par espace de travail ci-dessous lorsque la cible peut se trouver dans un espace de travail non principal. Les formats invalides renvoient `400 invalid_export_format` ; les sessions actives manquantes renvoient `404` ; le stockage archivé, en transition ou en conflit renvoie `409`. La méthode SDK TypeScript est `exportSession()`.

### `GET /workspaces/:workspace/session/:id/transcript`

Renvoie la même projection `DaemonSessionTranscriptPage` que la route singulière à partir du JSONL persisté actif du workspace enregistré sélectionné. Pré-vol `workspace_persisted_transcript` ; cette capacité est indépendante de `multi_workspace_sessions` et fonctionne pour un primary workspace unique fiable sélectionné par id ou cwd.

Le sélecteur et les paramètres de requête suivent les règles existantes relatives aux workspaces pluriels et aux transcriptions. Les runtimes primary et secondaires fiables ainsi que les runtimes secondaires non fiables peuvent lire. Un primary non fiable renvoie `403 untrusted_workspace`. Le contenu archivé n'est pas renvoyé.

Pour cette route qualifiée par workspace, `limit` est le nombre maximal d'enregistrements pour les pages avant. Une page arrière peut s'étendre jusqu'à `3 * limit` enregistrements au maximum afin que les tours et les paires appel/résultat d'outil restent intacts. Une page peut s'arrêter plus tôt à la limite de 4 MiB de source persistée et renvoyer un curseur de continuation. Les réponses sérialisées sont plafonnées à 32 MiB et les curseurs à 64 KiB. Si l'état de rejeu dépasse la limite du curseur, la page renvoie ses événements convertis avec succès avec `partial: true`, `hasMore: false` et sans `nextCursor`.

Les pages avant et les pages de curseur sont entièrement implémentées dans le processus daemon. Une première page arrière pour une session active franchit d'abord une barrière de vidange workspace-bridge d'un enregistrement afin que la fin persistée soit à jour ; cette barrière peut démarrer ACP et charger les paramètres du workspace. La lecture de la page persistée elle-même n'analyse pas les agents ou compétences définis par le projet et ne crée ni ne répare `session-transcript-cursor-key`. Les trames d'outil utilisent les noms et descriptions d'outils persistés sans consulter le registre d'outils runtime. Sa clé de curseur HMAC existe uniquement en mémoire daemon, est isolée par workspace et tourne au redémarrage ; un curseur issu d'un processus daemon précédent renvoie `400 invalid_transcript_cursor`.

### `GET /workspaces/:workspace/session/:id/export`

Exportez la session persistée active du workspace enregistré sélectionné sous forme de pièce jointe. Pré-vol `workspace_session_export` ; n'inférez pas la prise en charge à partir de `session_export` ou `workspace_qualified_rest_core`. Le sélecteur résout d'abord l'id exact du workspace, puis un cwd absolu encodé URL après canonisation. Les runtimes primary et secondaires doivent être fiables. Un runtime non fiable renvoie `403 untrusted_workspace` avant la validation de la session ou du format.

La requête `format` facultative est `html` (par défaut), `md`, `json` ou `jsonl`. Le corps, le type MIME, l'assainissement du nom de fichier, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` et la disposition de la pièce jointe correspondent à `GET /session/:id/export`. La route héritée reste liée au stockage principal.

La route plurielle lit uniquement le JSONL persisté actif du workspace sélectionné sous le coordinateur d'archive partagé existant. Elle ne scanne pas les autres magasins de workspace, ne revient pas au principal, ne résout pas un propriétaire actif, n'appelle pas le bridge workspace, ne démarre pas ACP, n'attache pas de client et ne charge pas les paramètres. Un id de session qui n'existe que dans un autre workspace renvoie `404 { code: "session_not_found" }` ; les sessions archivées renvoient `409 session_archived`. Les formats invalides renvoient `400 invalid_export_format`, et les conflits de stockage conservent les erreurs `session_archiving` et `session_conflict` existantes.

### `GET /workspaces/:workspace/session/:id/archive/export`

Exportez la session persistée archivée du workspace enregistré sélectionné sous forme de pièce jointe. Pré-vol `workspace_archived_session_export` ; la prise en charge ne peut pas être inférée à partir de l'exportation active ou des capacités core plurielles. La résolution du sélecteur de workspace et les vérifications de confiance s'exécutent avant la validation de l'id de session et du format.

Les appelants SDK TypeScript utilisent `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`. La méthode utilise toujours REST natif et renvoie la projection de pièce jointe `DaemonSessionExportResult` existante.

La requête `format` facultative, le corps de réponse, le type MIME, le nom de fichier assaini, la politique de cache, l'en-tête de sécurité et la disposition de la pièce jointe sont identiques à ceux de l'exportation de workspace active. Le JSONL source archivé est plafonné à 256 MiB avant reconstruction ; un fichier plus volumineux renvoie `413 transcript_too_large` avec `sessionId`, `snapshotSize` et `maxBytes`. L'exportation active conserve son comportement de taille existant.

La route lit uniquement `chats/archive/<id>.jsonl` dans le workspace fiable sélectionné sous un bail de coordinateur d'archive partagé. Elle n'inspecte pas le contenu actif pour un retour, ne scanne pas un autre workspace, ne résout pas un propriétaire actif, n'appelle pas de bridge, ne démarre pas ACP, n'attache pas de client et ne charge pas les paramètres. Un id actif uniquement renvoie `409 { code: "session_not_archived" }` ; un id manquant renvoie `404 { code: "session_not_found" }` ; des fichiers actifs et archivés simultanés renvoient `409 session_conflict` ; et une transition d'archive renvoie `409 session_archiving` avec `Retry-After: 5`.

### `POST /session/:id/resume`

Restaurez une session ACP persistée par id SANS rejouer l'historique via SSE. Le contexte du modèle est restauré en interne côté agent (via `geminiClient.initialize` lisant `config.getResumedSessionData`) ; le flux SSE reste propre pour les clients ayant déjà rendu l'historique. Pré-vol `caps.features.session_resume` ; `unstable_session_resume` reste un alias de compatibilité déprécié pour les anciens clients.

Accepte les mêmes champs `cwd`, `approvalMode`, `sourceType` et `sourceId` que `/load`. Les champs de rejeu en mode chargement seul `historyPageSize`, `liveReplayMode` et `compactedReplayMode` ne sont pas analysés, validés ni transmis ici — ils sont silencieusement ignorés, conformément au schéma publié des requêtes de reprise. Même forme de réponse — `state` reflète `ResumeSessionResponse` d'ACP. Même enveloppe d'erreur, incluant `409 restore_in_progress` (qui se déclenche lorsqu'un `session/load` est en cours ; un `session/resume` arrivant derrière un autre `session/resume` fusionne).

Utilisez `/load` lorsque le client n'a aucun historique rendu (reconnexion à froid, sélecteur → ouverture). Utilisez `/resume` lorsque le client a déjà les tours à l'écran et a seulement besoin de récupérer le handle côté daemon.

> ⚠️ **Pourquoi `unstable_session_resume` est-il encore annoncé ?** La route HTTP du daemon et la capacité `session_resume` sont stables pour v1, mais le bridge appelle toujours `connection.unstable_resumeSession` d'ACP. L'ancienne balise ne subsiste que pour permettre aux SDK publiés avant `session_resume` de continuer à fonctionner.

### `POST /session/:id/worktree-reset`

Transférer la propriété du checkout d'une session de worktree Part 4A persistée vers une nouvelle session de remplacement. Pré-vol `session_worktree_reset_v1` — les démons plus anciens renvoient `404` pour cette route. La route permet aux tâches nommées Channel `/clear` de réinitialiser une tâche de worktree sans supprimer ses fichiers : le remplacement obtient une toute nouvelle conversation, et la session remplacée conserve son transcript dans le catalogue mais ne peut plus jamais être restaurée.

Corps de la requête (tous les champs sont optionnels) :

```json
{
  "cwd": "/canonical/path",
  "modelServiceId": "service-id",
  "approvalMode": "plan",
  "sourceType": "channel",
  "sourceId": "dingtalk-main"
}
```

`cwd` suit la même résolution que `POST /session/:id/load` et peut être omis pour l'espace de travail principal du démon. Les champs de métadonnées attribuent à la session de remplacement les mêmes conventions de portée de thread et de source qu'une création de worktree.

En cas de succès, la route renvoie `200` avec la réponse de forme de création de la session de remplacement — le nouveau `sessionId`, `workspaceCwd`, `currentCwd` égal au chemin canonique vérifié du worktree, les métadonnées `worktree`, et `worktreeState: "persisted-v1"`. Les appelants abandonnent leur poignée sur l'ancien id et utilisent l'id de remplacement par la suite ; la restauration ultérieure de l'ancien id renvoie `worktree_session_superseded` avec `replacementSessionId`, ce que les clients peuvent également utiliser pour auto-réparer des registres obsolètes — mais seulement après qu'un chargement de cet id ait réussi. La classification est décidée uniquement à partir du lien sidecar, et ce lien est écrit avant que le marqueur ne bascule, donc un transfert interrompu avant la validation rend un remplacement qui n'est pas le propriétaire du marqueur, dont la propre restauration renvoie `worktree_reset_interrupted`, et que la réinitialisation réessayée récupère ensuite.

Cette route ne lit jamais `X-Qwen-Client-Id`, donc le remplacement démarre non attaché — mais la réponse de succès n'est pas sans inscription. Un nouveau transfert crée un `clientId` de style-propriétaire pour ce démarrage, l'enregistre sur le remplacement et le signale dans le corps ; une reprise idempotente d'un transfert validé n'en signale aucun. L'id créé n'est pas une attache (le nombre d'attaches du remplacement reste inchangé, donc `killSession` avec `requireZeroAttaches` le voit toujours comme non attaché), mais une inscription client active est exactement ce qui empêche le nettoyage inactif du démon : détachez un id que vous n'utilisez plus, sinon le remplacement reste actif indéfiniment — et un remplacement encore actif sans marqueur est la forme qu'une réinitialisation ultérieure refuse de démonter. Traitez la réponse comme l'identité du remplacement, et attachez-la via la surface normale `POST /session/:id/load` ou `/resume` lorsqu'un client inscrit est requis.

Le transfert est sérialisé par checkout contre les restaurations de worktree et les autres réinitialisations, refuse de s'exécuter pendant que l'une des sessions est occupée (prompt en cours ou interaction en attente), et arme une barrière d'admission sur la session remplacée : tant qu'elle est armée, neuf écrivains sont refusés avec `worktree_reset_active` à l'admission — `POST /session/:id/prompt`, `/rewind`, `/cd`, `/branch`, `/fork`, `/shell`, `/goal`, `/tasks/:taskId/workflow-action`, et `/messages/delete`. Les huit autres sont bloqués car chacun déplace le cwd de la session ou commence un travail dedans sans passer par l'admission de prompt : une commande shell s'exécute dans le cwd effectif de la session, qui pour une session de worktree déplacée est le checkout lui-même ; un agent fork exécute ses outils dans ce cwd ; un rewind restaure les fichiers relativement à celui-ci ; un cd le déplace, y compris dans un sous-répertoire du checkout ; une branche modifie l'historique persisté de la session remplacée et engendre une session dérivée alors que la propriété est en flux ; un objectif `resume` promeut un tour mis en file et met en file une continuation ; la suppression de messages réécrit l'historique persisté ; et une action de workflow exécute un workflow sauvegardé ou un script fourni par l'appelant, ou redémarre une exécution active, via le propre registre d'outils de la session. `POST /session/:id/continue` n'est pas une dixième barrière : il pilote une continuation acceptée à travers l'admission de prompt bloquée et est refusé là-bas. Cette liste constitue toute la barrière, et la barrière n'est pas tout ce qui atteint l'enfant — les chemins de libération et d'arrêt restent utilisables en cours de transfert par conception (annuler une tâche, effacer un objectif, détacher un client, tuer la session), et la mise en file de notification en arrière-plan interne au démon — l'accusé de réception de complétion d'une sous-session à sa parente, qu'aucune route HTTP n'appelle — n'est pas non plus bloquée, car elle met en file une notification plutôt que de démarrer un tour. La dernière étape du transfert rompt les inscriptions clients de la session remplacée, efface son association de worktree en mémoire, et signale si la session remplacée a réellement disparu. Un survivant — un enfant qui retient encore un travail en arrière-plan, donc la fermeture inactive déclenchée par le dernier détachement est refusée et différée — est signalé plutôt que masqué : le démon le journalise, la barrière reste armée sur cette entrée comme seule barrière restante, et le corps `200` porte `supersededSessionLive: true` afin que l'appelant sache que l'id remplacé est encore vivant et ré-attachable dans le checkout dont la propriété vient de changer. La sécurité en cas de crash est par fenêtre, et l'ordre d'écriture définit les fenêtres : le lien `supersededBy` du vieux sidecar est écrit en premier, puis le sidecar du remplacement portant `supersedes`, et le marqueur bascule en dernier. Un crash avant la bascule laisse donc la vieille session autoritaire dans l'une des trois formes qu'un réessai distingue — aucun lien du tout (le remplacement est un orphelin ordinaire et un réessai démarre simplement un nouveau transfert), le lien arrière seul avec le sidecar du remplacement manquant (un réessai échoue fermé avec `worktree_reset_invalid_state` et laisse l'état interrompu intact pour réparation par opérateur), ou les deux liens présents (un réessai annule le transfert partiel et en complète un nouveau — sauf si le remplacement interrompu ne peut pas être supprimé parce qu'un client y est encore attaché, auquel cas l'annulation échoue fermée avec `worktree_reset_invalid_state` et garde les deux liens, donc un réessai ultérieur converge une fois ce client parti). Un crash après la bascule laisse le remplacement autoritaire et un réessai reprend comme une opération nulle. La vieille session n'est jamais supprimée et le checkout du worktree n'est jamais retiré par la réinitialisation.

**Erreurs :**

- `404` — `session_not_found` lorsque l'enregistrement de session n'existe pas.
- `409` — `worktree_reset_unsupported` lorsque la session n'a pas de sidecar Part 4A valide (n'est pas une session de worktree).
- `409` — `worktree_reset_active` lorsqu'une session impliquée dans le transfert est occupée ; réessayez une fois stabilisée. L'admission de tout écrivain couvert par la barrière — un prompt, un rewind, un changement de cwd, une branche, un fork, une commande shell, un contrôle d'objectif, ou une action de tâche de workflow — sur une session en cours de transfert échoue avec le même code.
- `409` — `worktree_reset_invalid_state` pour un sidecar corrompu, un marqueur invalide, une échec de confinement ou une paire de liens de remplacement incohérente. Non destructif pour ce que cette requête a commencé : tout transfert partiel initié par cette requête est annulé avant d'être visible par l'appelant, tandis que les branches de reprise en mode fail-closed — un marqueur invalide, une paire de liens de remplacement qui ne concordent pas (y compris un lien arrière dont le sidecar de remplacement est manquant), un propriétaire de marqueur ambigu et un remplacement toujours actif sur ce démon alors que le marqueur est absent — laissent l'état interrompu préexistant intact pour réparation par l'opérateur, afin que cette forme reste visible lors d'une réinitialisation ou restauration ultérieure. Une nouvelle tentative contre l'un de ces états relit cet état et renvoie le même 409 : cela ne converge pas, donc l'état nécessite une réparation par l'opérateur plutôt qu'une boucle de nouvelle tentative. La raison spécifique est écrite dans le journal du démon plutôt que sur le fil.
- `500` — erreurs internes en mode fail-closed (par exemple un pont sans prise en charge de la réinitialisation, ou un rejet de relocalisation après annulation) ; non rejouables telles quelles. Un cas `500` diffère en nature : un transfert de marqueur dont la queue post-commit propre a échoué _après_ que le basculement ait été durablement engagé signale que la propriété a été transférée, n'exécute jamais l'annulation destructive, et est réparé en rejouant la réinitialisation, qui reprend le transfert engagé de manière idempotente.

### `GET /workspace/:id/session-info` and `GET /workspaces/:workspace/session-info`

Renvoyer les agrégats persistés des sessions pour l'espace de travail sélectionné sans modifier le chemin paginé de la liste des sessions :

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

`active`, `archived` et `total` comptent les sessions JSONL locales visibles par l'utilisateur ; les sessions hôtes internes du démon et les sessions de tâches de l'agent d'espace de travail (`sourceType` `agent-host` et `agent`) sont exclues de ces comptes et de toutes les listes de sessions ; une personne peut toujours ouvrir une session d'agent par identifiant. `live` est le nombre correspondant de ponts en mémoire visibles par l'utilisateur et est omis pour un espace de travail secondaire non fiable enregistré car cette lecture uniquement persistée ne doit pas interroger l'état actif. `expensive` est toujours `true` et `cost` est toujours `"disk_scan"` ; les clients doivent appeler ce point de terminaison rarement plutôt que de le scruter. Si le scan atteint sa limite de sécurité ou ne peut pas classer chaque fichier candidat, la réponse ajoute `"truncated": true` et les comptes persistés sont des bornes inférieures. Un stockage manquant renvoie des comptes persistés à zéro. L'itinéraire pluriel utilise le même sélecteur d'espace de travail et la même politique de confiance que le catalogue de sessions pluriel ; un primaire non fiable renvoie toujours `403 untrusted_workspace`.

Le SDK TypeScript du démon expose l'itinéraire pluriel via `workspaceById(...)` ou `workspaceByCwd(...)`, suivi de `getWorkspaceSessionInfo()`.

### Bibliothèque d'artefacts de sessions d'espace de travail

`workspace_artifact_library` annonce en plus les requêtes à l'échelle du workspace et les opérations par lots :

| Méthode | Itinéraire | Entrée |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/artifact-library` | Toutes les sessions actives, déchargées et archivées dans l'espace de travail |
| POST | `/workspaces/:workspace/artifact-library/query` | `{ "sessionIds": ["session-id"] }` |
| POST | `/workspaces/:workspace/artifact-library/delete` | `{ "artifacts": [{ "sessionId": "session-id", "artifactId": "artifact-id" }] }` |

Les deux corps POST sont des objets stricts contenant 1 à 100 entrées. Les ID ou paires dupliqués sont traités une seule fois. Les réponses aux requêtes sont `{ "v": 1, "sessions": [<session artifact envelope>], "errors": [<member error>] }`. Chaque erreur membre contient `sessionId`, `status`, `code` et `message`. La découverte complète omet les sessions absentes ou étrangères ; une requête explicite les signale. Les autres échecs membres restent explicites tandis que les sessions réussies sont retournées.

Avec `workspace_artifact_library_stream`, chaque enveloppe de session de la bibliothèque d'artefacts (y compris le GET existant pour une session unique) contient en plus :

```json
{
  "session": {
    "displayName": "Task title",
    "createdAt": "2026-10-26T00:00:00.000Z",
    "archiveState": "archived",
    "sourceType": "scheduled_task",
    "sourceId": "task-id"
  }
}
```

`displayName` et `sourceId` sont optionnels. `createdAt` est l'heure de création originale de la session, y compris après reprise ; ce n'est pas un horodatage d'artefact. `archiveState` est `active` ou `archived`. Les types de source sont des chaînes ouvertes et une attribution manquante devient `default`. Des sources telles que `resource_inspection` sont préservées afin que les clients puissent les exclure explicitement. Un ID de source est associé à son type de source original. Les noms suivent le titre actuel en direct ou le titre personnalisé persisté/le premier prompt. La réponse générique `/session/:id/artifacts` reste inchangée.

Le GET complet et le POST pour une session sélectionnée acceptent également `Accept: text/event-stream`. Sans cette négociation, ils retournent la réponse JSON ci-dessus. Utilisez le streaming basé sur fetch pour POST ; vérifiez la capacité et le type de contenu de la réponse sur les anciens démons. La séquence SSE finie est :

| Événement | Données |
| --------------- | -------------------------------------------------------------------------------- |
| `start`         | `{ "v": 1, "total": <candidate sessions> }`                                      |
| `session` | Une enveloppe complète de la bibliothèque d'artefacts incluant `session` |
| `session_error` | `{ "v": 1, "sessionId": "...", "status": 404, "code": "...", "message": "..." }` |
| `complete`      | `{ "v": 1, "total": 10, "succeeded": 8, "failed": 1, "skipped": 1 }`             |
| `error` | Erreur fatale `{ "v": 1, "status": 503, "code": "...", "message": "..." }` |

Les résultats arrivent dans l'ordre d'achèvement avec jusqu'à quatre lectures de sessions concurrentes ; une session lente ne bloque pas les autres travailleurs. Le JSON conserve l'ordre de sélection. Les sessions absentes ou étrangères lors d'une requête complète comptent comme `skipped` ; les échecs lors d'une requête explicite émettent `session_error`. `total` compte les candidats, pas les artefacts. Seuls `complete` marquent une analyse terminée. Une `error` fatale ou une déconnexion sans `complete` signifie des résultats partiels ; il n'y a pas de curseur de rejeu, de reconnexion automatique ou d'abonnement. Des commentaires de battement peuvent survenir pendant l'attente. Les échecs initiaux utilisent des codes d'état HTTP ordinaires ; après les en-têtes SSE, les erreurs fatales sont des événements de flux. Une requête déconnectée cesse de dispatcher de nouvelles lectures ; les chargements de cache partagés déjà en cours peuvent finir. La contre-pression limite les trames de résultat en attente et ne retient pas les barrières d'archive en attendant le client.

La suppression par lot retourne `{ "v": 1, "results": [...] }`. Chaque résultat contient `sessionId` et `artifactId`, plus soit l'enveloppe de mutation existante (`v`, `changes`, `warnings`/`warningDetails` optionnel) soit `error: { status, code, message }`. Les artefacts manquants sont des changements vides idempotents. Les clients doivent inspecter chaque résultat et chaque avertissement de persistance ; une réponse de lot 200 ne signifie pas que chaque membre a réussi. La suppression est regroupée par session, n'est pas transactionnelle entre les sessions, préserve les fichiers réels et nécessite la même autorité stricte d'opérateur que la suppression d'un artefact unique. Une entrée invalide retourne 400 `invalid_artifact_library_request` ; les erreurs au niveau du workspace conservent les codes d'état HTTP ordinaires.

Les artefacts et titres en direct proviennent du pont ; les métadonnées d'identité persistées bornées préservent l'heure de création originale et l'attribution de la source. Les métadonnées non chargées, y compris les résultats vides, sont mises en cache par runtime avec un budget de taille sérialisée de 32 MiB. Les fichiers inchangés ne sont pas rejoués lors de requêtes répétées ou après un TTL. Les identités des métadonnées de transcript et de propriété sont vérifiées à chaque lecture ; les entrées modifiées sont reconstruites. La découverte de candidats est mise en cache par identité de répertoire et rafraîchie lors de la première requête au moins deux secondes après une analyse terminée, y compris lorsque les horodatages de répertoire ne changent pas. Ce rafraîchissement basé uniquement sur le nom de fichier préserve les caches d'artefacts inchangés. Les lectures froides concurrentes partagent un chargement ; chaque requête traite jusqu'à quatre sessions à la fois. Les entrées inchangées admises sont conservées ; les nouveaux résultats dépassant le budget sont retournés sans cache afin que les analyses complètes répétées n'évincent pas tout le cache. Ces sessions sans cache, ou un redémarrage du démon, nécessitent une reconstruction. Cela évite l'analyse JSONL répétée pour les entrées mises en cache, mais les vérifications du système de fichiers et la taille de la réponse augmentent toujours avec le workspace. La disponibilité des fichiers froids conserve la sémantique existante basée uniquement sur les métadonnées.

Le GET existant pour la bibliothèque d'artefacts d'une session unique partage ce même cache avec les requêtes complètes et par lots, ajoutant uniquement le résumé `session` à sa réponse et conservant les formes d'erreur existantes. Réchauffer une route bénéficie aux autres ; la suppression unique et par lot invalide l'entrée partagée. Les ajouts de transcript uniquement pour les titres et les déplacements d'archives rafraîchissent également les métadonnées ; les titres en direct sont lus à chaque requête sans attendre la persistance sur disque. Les métadonnées persistées en direct et les enveloppes froides partagent le même budget de 32 MiB, et les transitions en direct/froid reconstruisent l'entrée. Le `generatedAt` d'une enveloppe mise en cache est son heure de création de projection.

`session_artifact_library` annonce ces endpoints scoped à l'espace de travail persisté :

| Méthode | Route | Résultat |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/session/:id/artifact-library` | L'enveloppe d'artefact de session, incluant les inscriptions persistées pour les sessions non chargées et archivées. |
| DELETE | `/workspaces/:workspace/session/:id/artifact-library/:artifactId` | Le résultat de mutation de l'artefact. Une inscription déjà absente renvoie `changes: []`. |

Le sélecteur d'espace de travail se résout vers un runtime fiable. Les deux routes rejettent les propriétaires en direct ambigus et un propriétaire en direct dans un autre runtime avant d'accéder aux artefacts. Elles participent à la barrière d'activité interne du runtime ; les lectures détiennent la barrière partagée d'archive de session et les suppressions la détiennent exclusivement. Aucune route ne charge un agent ni ne désarchive la session. La suppression nécessite l'autorité de l'opérateur du démon via la porte de mutation stricte ; elle ne nécessite pas `X-Qwen-Client-Id`. Les endpoints d'artefacts existants appartenant au client conservent leurs règles d'autorisation.

Les lectures froides rejouent les enregistrements d'artefacts persistés et renvoient les métadonnées et les localisateurs tels que les chemins relatifs à l'espace de travail `workspacePath`, `managedId` ou `url`. Ils préservent les horodatages enregistrés et signalent les avertissements de compatibilité par artefact sans marquer la persistance réussie comme indisponible. `limits.maxArtifacts` décrit la limite d'inscription du magasin en direct ; une projection froide n'évince pas les inscriptions historiques pour appliquer cette limite.

La suppression froide ajoute une pierre tombelle explicite durable. Elle préserve les fichiers de l'espace de travail et libère les références de snapshot de prévisualisation web gérées par le démon et non référencées en utilisant le nettoyage best-effort existant. La suppression en direct peut renvoyer HTTP 200 avec `changes: []`, `warnings` et `warningDetails` si la persistance échoue ; les appelants doivent inspecter le résultat et conserver l'inscription. Les échecs d'écriture froide sont renvoyés sous forme d'erreurs.

Les deux routes renvoient `409 artifact_library_unavailable` lorsque la persistance des artefacts est désactivée. Les sessions inconnues renvoient `404 session_not_found` ; le stockage de projet étranger est traité comme introuvable, et un stockage ambigu ou non régulier renvoie `409 session_storage_conflict`. Les enregistrements de conversation incomplets ou un journal de mutation non autoritaire renvoient `409 session_transcript_corrupt`, distinct d'un écrivain concurrent qui renvoie `session_transcript_changed`. Les lectures supérieures à 64 MiB renvoient 413. La mutation d'exécution gérée froide renvoie `409 artifact_mutation_requires_managed_authority`. Les réponses d'erreur existantes concernant la propriété de l'espace de travail et le cycle de vie s'appliquent également.

### `GET /workspace/:id/sessions` and `GET /workspaces/:workspace/sessions`

Liste les sessions dont l'espace de travail canonique correspond à `:id` ou `:workspace`. Le paramètre de chemin est d'abord résolu comme un identifiant d'espace de travail exact, puis comme un répertoire de travail absolu encodé en URL. Les espaces de travail principaux incluent la fusion persistée/en direct existante : la liste par défaut contient les sessions actives de `chats/` ; passez `archiveState=archived` pour lister les sessions archivées de `chats/archive/`. Les espaces de travail non principaux approuvés incluent les sessions persistées actives de leur propre magasin `chats/` et fusionnent les résumés directs correspondants sans doublons ; si aucune session persistée active n'existe, la route conserve le comportement précédent du curseur uniquement direct. Les espaces de travail non principaux approuvés prennent également en charge `archiveState=archived`, la liste organisée `view=organized` et les filtres `group`, en lisant depuis leurs propres magasins `chats/`, `chats/archive/` et d'organisation des sessions ; une requête combinée `view=organized&archiveState=archived` ne renvoie que les sessions archivées sans fusion directe. Les espaces de travail non principaux enregistrés mais non approuvés prennent en charge les mêmes formes de liste, de filtre et de pagination mais ne renvoient que les entrées persistées : le démon n'interroge pas le pont direct ni ne peuple les interactions en attente, les erreurs de tour ou l'état client depuis le runtime. Les valeurs par défaut persistées telles que `clientCount: 0` et `hasActivePrompt: false` restent présentes pour la compatibilité de transmission. Un stockage manquant renvoie une liste vide. La route plurielle renvoie toujours `403 { code: "untrusted_workspace" }` pour un espace de travail principal non approuvé ; les routes principales héritées conservent leur comportement de compatibilité existant. `archiveState=all` n'est pas pris en charge dans v1. Les listes principales et basées sur la persistance conservent la sémantique numérique existante de `cursor` ; le repli direct pour les espaces de travail non principaux approuvés sans persistance conserve son curseur direct opaque existant.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

Lorsque `workspace_qualified_rest_core` est annoncé, les opérations par lots sur les sessions au niveau de l'espace de travail, le CRUD des groupes et la mutation de l'organisation des sessions sont disponibles sous `/workspaces/:workspace/sessions/{delete,archive,unarchive}`, `/workspaces/:workspace/session-groups` et `/workspaces/:workspace/session/:id/organization`. Pour un espace de travail secondaire non approuvé, le GET de groupe reste disponible ; chaque mutation de groupe, de session et d'organisation reste soumise à un contrôle de confiance. Les routes de mutation par lot et d'organisation sans espace de travail restent limitées à l'espace de travail principal pour des raisons de compatibilité.

Paramètres de requête :

| Champ | Requis | Notes |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | non | `active` (par défaut) ou `archived`. Toute autre valeur renvoie `400 { code: "invalid_archive_state" }`. |
| `cursor` | non | Curseur de pagination provenant de la réponse précédente. |
| `size` | non | Taille de page. Les valeurs invalides renvoient `400 { code: "invalid_cursor" }` ou la validation de taille de page existante. |
| `view` | non | Omettre pour la liste récente héritée. `organized` opte pour le tri serveur par épinglé/groupe et ajoute des champs d'organisation optionnels. Toute autre valeur renvoie `400 { code: "invalid_session_view" }`. |
| `group` | non | Significatif uniquement avec `view=organized`. `all` (par défaut), `pinned`, `ungrouped` ou un identifiant de groupe personnalisé. Les identifiants de groupe inconnus renvoient `404 { code: "group_not_found" }`. |

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

Avec `view=organized`, le démon lit `<Storage.getProjectDir(cwd)>/session-organization.v1.json`, renvoie d'abord les sessions épinglées, puis par ordre décroissant de temps d'activité, puis utilise `sessionId` pour les égalités stables. Le curseur organisé est un JSON base64url opaque et ne doit pas être réutilisé avec la liste récente héritée. `pinned` est un filtre virtuel, pas un groupe. `groupId: null` signifie non groupé. Les sessions archivées conservent leurs métadonnées d'organisation, mais `archiveState=archived&view=organized` ne renvoie toujours que les sessions archivées.

Les curseurs ordonnés par activité — la vue organisée et les listes filtrées `parentSessionId` / `sourceType` — ne sont pas isolés par instantané, et une liste active approuvée trie les lignes selon la plus récente entre la date de modification de la transcription et le témoin d'activité direct. Un témoin d'activité direct est uniquement en mémoire, donc la clé d'une session peut régresser vers sa date de modification lorsque l'entrée directe disparaît entre deux récupérations de pages. Le curseur compense cela : il porte les identités déjà émises avec une clé dérivée du direct — en les conservant tant que la ligne est absente de la collection d'une page et tant qu'un changement d'épingle pourrait les réadmettre — et les exclut pour le reste du parcours, afin qu'un mouvement de clé dérivée du direct ne renvoie une session qu'au plus une fois par parcours. La garantie est limitée au portage : elle est bornée à 64 identités (les identités excédentaires dans un parcours dégradent en un doublon au plus une fois plutôt qu'en une erreur), et une ligne uniquement persistée émise avant que son état d'épingle ait changé n'est jamais portée, donc un désépingle entre les récupérations peut renvoyer cette ligne une seconde fois exactement comme avant l'existence de ce champ. Les appelants qui accumulent des pages doivent donc toujours indexer les lignes par `sessionId`, pas seulement dans le cas dépassant 64. Les lignes peuvent encore se déplacer ou être ignorées lors d'une activité concurrente, exactement comme auparavant ; un appelant ayant besoin d'une vue cohérente recharge depuis la première page après un changement d'activité.

Des champs supplémentaires peuvent apparaître sur chaque session lorsque `view=organized` :

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Les listes actives approuvées incluent les champs de superposition du démon direct tels que `clientCount`, `hasActivePrompt` et `activeWorkState`. Les listes secondaires non approuvées et archivées sont uniquement basées sur le stockage : les champs de superposition directs restent absents ou faux, et les entrées archivées définissent `isArchived` sur `true`. Tableau vide (et non 404) lorsqu'aucune session n'existe — une interface de sélection de session ne devrait pas générer d'erreur simplement parce que l'espace de travail est inactif.

### `POST /sessions/catalog`

Lit indépendamment des catalogues de sessions paginés pour plusieurs espaces de travail enregistrés en une seule requête. Effectuez une vérification préalable `session_catalog_batch` une fois ; les démons plus anciens conservent les points de terminaison de liste de sessions et de groupes qualifiés par espace de travail. Chaque membre du lot possède la propriété de l'espace de travail persisté : l'authentification et l'admission de la requête sont globales au processus, tandis que chaque entrée résout et lit uniquement son espace de travail propriétaire. Il n'enregistre jamais un espace de travail, ne crée jamais de session, ne démarre jamais ACP et ne revient jamais au runtime principal.

```json
{
  "workspaces": [
    { "workspace": "workspace-a", "cursor": "previous-a-cursor" },
    { "workspace": "/canonical/workspace-b" }
  ],
  "options": {
    "size": 20,
    "archiveState": "active",
    "view": "organized",
    "group": "all"
  },
  "includeGroups": true
}
```

`workspaces` est un tableau ordonné de 1 à 20 entrées `{ workspace, cursor? }`, ou `"all"` pour sélectionner tous les espaces de travail publics enregistrés. Les sélecteurs sont résolus comme des identifiants exacts avant les chemins absolus canoniques. `all` exclut les Conversations internes et les entrées supprimées, inclut les entrées temporairement indisponibles, et échoue si plus de 20 entrées seraient sélectionnées ; les appelants doivent alors diviser les sélections explicites. Un registre public vide renvoie un résultat vide. Les sélecteurs internes explicites renvoient une erreur d'entrée sans démarrer le runtime interne.

Le `options` partagé accepte `size` (entier 1–100, par défaut 20), `archiveState`, `view`, `group`, `parentSessionId`, `sourceType` et `sourceId` avec les filtres et combinaisons de liste existants. `group` et `parentSessionId` sont limités à 256 caractères. `includeGroups` a pour valeur par défaut false. Chaque espace de travail a son propre curseur. Les pages par défaut des lots utilisent l'ordre d'activité et des curseurs opaques, y compris pour les sessions uniquement directes ; ces curseurs ne sont pas interchangeables avec les curseurs numériques de liste hérités. Continuez avec le `cwd` et le `nextCursor` renvoyés pour cette entrée, en préservant les filtres. Il n'y a aucun tri global ni curseur de pagination global.

```json
{
  "workspaces": [
    {
      "workspace": "workspace-a",
      "workspaceId": "workspace-a",
      "cwd": "/canonical/workspace-a",
      "sessions": [],
      "groups": {
        "groups": [],
        "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
      }
    },
    {
      "workspace": "/canonical/workspace-b",
      "error": {
        "code": "workspace_not_found",
        "message": "Workspace is not registered with this daemon.",
        "status": 404
      }
    }
  ]
}
```

Le résultat préserve l'ordre de sélection et le sélecteur original sous forme de `workspace`. Les entrées réussies incluent les champs canoniques `cwd`, `workspaceId`, ainsi que les champs de page existants (`sessions`, `nextCursor` facultatif, `truncated` et `liveMergeFailed`). Le champ `workspaceCwd` de chaque session retournée est normalisé vers son identifiant canonique `cwd` d'entrée englobante. Lorsque demandé, `groups` contient le catalogue complet des groupes ; les identités de groupe sont limitées à leur espace de travail englobant. Les lectures de groupe conservent la normalisation existante et le repli « avertir-et-vider » pour les magasins d'organisation malformés ou illisibles. Les entrées échouées contiennent `error: { code, message, status }` et l'identité résolue si disponible, sans liste vide réussie `sessions`. Les lots valides renvoient HTTP 200 même si certaines entrées échouent. Les enveloppes de requête malformées renvoient HTTP 400 avant toute lecture du stockage.

Les espaces de travail inconnus, internes et supprimés produisent `404 workspace_not_found` ; les générations d'exécution indisponibles ou modifiées produisent `503 workspace_runtime_unavailable` ; un primaire non fiable produit `403 untrusted_workspace`. Les secondaires non fiables maintiennent la politique de catalogue persisté uniquement existante, sans lectures de pont en direct, écritures de réparation ni journalisation de sessions de débogage. Les échecs de curseur et de groupe levés conservent leurs codes existants ; les autres échecs de lecture levés deviennent `500 session_catalog_failed`. Les entrées actives fiables peuvent fusionner l'état du pont en direct existant ; les entrées archivées restent purement stockées.

Le démon effectue au plus quatre lectures d'espace de travail simultanément par lot, limite les sélecteurs à 4096 caractères et les curseurs à 16384 caractères, et plafonne chaque entrée réussie sérialisée à 512 KiB. Une entrée trop volumineuse renvoie `413 catalog_response_too_large` ; réduisez `size` ou omettez les groupes avant de réessayer. Cela borne la réponse du lot à environ 10 MiB plus la surcharge d'enveloppe/erreur. La déconnexion du client annule les lectures en attente et empêche le démarrage de nouvelles lectures d'espace de travail. La limite de corps JSON du démon existant et les limites de scan persisté s'appliquent également. Les demandes de catalogue utilisent le niveau de limitation de débit de lecture.

### `POST /sessions/live-state`

Lire les instantanés d'état en direct pour 1 à 20 espaces de travail enregistrés explicitement sélectionnés en une seule requête. Le corps strict est `{ "workspaces": ["workspace-id", "/absolute/workspace/path"] }` ; les sélecteurs se résolvent comme des identifiants d'espace de travail exacts avant les chemins absolus canoniques. La réponse est `{ "workspaces": [...] }` dans l'ordre de la requête. Chaque entrée réussie inclut son sélecteur `workspace` original, les champs canoniques `workspaceId` et `cwd`, ainsi que le même instantané complet `v: 1`, `catalogVersion` et `sessions` que la route mono-espace de travail ci-dessous. Les instantanés sont indépendants ; il n'y a pas d'atomicité inter-espaces de travail ni de flux de sessions fusionné. Les deux routes partagent l'exposition de la version du catalogue et l'invalidation du cache, donc alterner entre elles préserve le contrat de réconciliation du catalogue mono-espace de travail. Un lot valide renvoie HTTP 200 et `Cache-Control: no-store` même si certaines entrées échouent.

Chaque entrée échouée contient `workspace`, les champs résolus facultatifs `workspaceId` et `cwd`, et `error: { code, message, status }` sans liste vide réussie `sessions`. Les sélecteurs inconnus, internes ou supprimés renvoient `404 workspace_not_found` ; les générations d'exécution indisponibles ou remplacées renvoient `503 workspace_runtime_unavailable` ; les espaces de travail primaires ou secondaires non fiables renvoient `403 untrusted_workspace` ; les échecs inattendus du pont renvoient `500 session_live_state_failed`. Une entrée réussie dépassant 512 KiB renvoie `413 live_state_response_too_large`. Les enveloppes invalides, clés supplémentaires, tableaux vides, plus de 20 sélecteurs et sélecteurs de plus de 4096 caractères renvoient HTTP 400 `invalid_session_live_state_batch_request` avant toute lecture du pont. La route lit uniquement le pont en mémoire de chaque exécution active sélectionnée, jamais les catalogues persistés ou les enfants ACP ; les lectures des membres s'exécutent séquentiellement, et le POST est imputé au niveau de limitation de débit de lecture du démon.

### `GET /workspaces/:workspace/sessions/live-state`

Renvoyer l'instantané de session en direct en mémoire de l'exécution de l'espace de travail sélectionné ainsi qu'une version de catalogue en mémoire, afin que les clients puissent arrêter d'interroger périodiquement le catalogue persisté à `GET /workspaces/:workspace/sessions` pour l'état volatil tel que `hasActivePrompt`, les indicateurs d'attente et `clientCount`. Pré-vol `workspace_session_live_state` ; la balise est indépendante de `workspace_qualified_rest_core`, donc les anciens démons annonçant la capacité REST d'espace de travail plus large n'implémentent pas cette route. Le sélecteur se résout d'abord comme un identifiant d'espace de travail exact, puis comme un répertoire de travail absolu encodé en URL après canonicalisation, correspondant aux autres routes plurielles de sessions. La route est réservée aux exécutions fiables pour les primaires et les secondaires : elle ne revient jamais à l'exécution primaire et n'utilise pas la politique permissive de catalogue persisté qui accorde des lectures de catalogue bornées à un secondaire non fiable. Le point de terminaison n'a aucun paramètre de requête et n'effectue aucun aller-retour de stockage de session, de paramètres, de commande externe ou d'ACP, donc son coût est indépendant du nombre de sessions persistées et de la taille JSONL ; le plafond par défaut de sessions en direct borne la réponse, et avec le plafond désactivé, le coût reste proportionnel uniquement au nombre de sessions en direct.

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
      "activeWorkState": "active",
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false,
      "updatedAt": "2026-08-18T08:12:30.123Z"
    }
  ]
}
```

`v` est la version du schéma de réponse. Toute réponse réussie inclut `Cache-Control: no-store`. `sessions` est l'ensemble complet, non paginé et non ordonné des sessions actuellement en direct dans l'exécution sélectionnée ; une exécution en live vide renvoie `200` avec `sessions: []`. `clientCount`, `hasActivePrompt`, `isWaitingForPermission` et `isWaitingForUserQuestion` sont des champs obligatoires sur le fil, et les valeurs manquantes du pont optionnel se projettent sur `0` ou `false`. `activeWorkState` est additif sur le fil et absent sur les anciens démons : `active` signifie que le démon possède un travail non réglé ou que l'enfant a envoyé un nouvel instantané de rétention non vide ; `idle` est émis uniquement pour un nouvel instantané vide couvrant toutes les catégories requises ; `unknown` signifie que le rapport négocié est obsolète ou incomplet ; et `unsupported` signifie que l'enfant n'a pas négocié le rapport. Cela ne change pas `hasActivePrompt` : un shell en arrière-plan, un tour cron ou une notification de terminal en attente est un travail actif sans devenir une invite au premier plan. Les champs statiques du catalogue tels que le nom d'affichage, l'heure de création, l'organisation et les métadonnées de source sont délibérément exclus et restent la propriété du catalogue complet. L'absence d'une ligne d'état en live efface uniquement les champs volatils d'une ligne de catalogue connue ; elle ne supprime jamais une ligne de catalogue persistée.

`updatedAt` est un témoin d'activité optionnel observé par le démon, présent lorsqu'une invite ayant atteint l'état d'exécution a publié un terminal formel dans le pont actuel. Il progresse exactement une fois pour chaque terminal de ce type — succès, erreur, annulation et expiration indistinctement — est écrit avant la publication de l'événement terminal, et est strictement croissant par session active même lorsque deux terminaux tombent dans la même milliseconde d'horloge murale ou que l'horloge murale recule ; un saut d'horloge vers l'avant persiste donc jusqu'à ce que le temps mural rattrape. Il n'est jamais antérieur au `createdAt` de la session : la première progression se cale sur l'heure de création, de sorte qu'un retour en arrière de l'horloge murale entre la création et le premier terminal ne peut pas indexer une ligne derrière le `createdAt` où elle était déjà listée. L'admission des invites, les attentes de file d'attente, les mises à jour en flux, l'annulation uniquement en file d'attente, les battements de cœur et les attentes d'interaction ne le font jamais progresser. Les clients l'utilisent pour rafraîchir la fraîcheur d'une ligne de catalogue qu'ils détiennent déjà plutôt que de recharger tout le catalogue après un tour terminé. Ce n'est pas un accusé de réception de persistance : l'enregistreur écrit les résultats des tours de manière asynchrone, de sorte que la valeur prouve seulement que le démon a observé le règlement d'une tentative en cours. Elle est absente avant le premier terminal actif dans une génération de pont — y compris pour une session restaurée depuis le disque — donc son absence n'est pas une sonde de support, et elle disparaît lorsqu'un redémarrage du démon ou un remplacement de l'environnement d'exécution de l'espace de travail installe un nouveau pont. Lorsqu'un résumé actif et un résumé persisté existent tous deux pour une session, les réponses de catalogue complètes rapportent l'horodatage valide le plus récent, de sorte que `GET /session/:id/status`, qui renvoie directement le résumé du pont sans cette fusion, peut rapporter une valeur antérieure à celle d'une réponse de liste.

`catalogVersion` est un jeton d'égalité pour les changements de catalogue observés par le démon. `generation` est un UUID aléatoire créé avec chaque instance de pont et change lors d'un redémarrage du démon ou d'un remplacement de l'environnement d'exécution de l'espace de travail ; `revision` commence à zéro et augmente de manière monotone au sein d'une génération. La seule opération prise en charge est l'égalité sur la paire entière : même génération et révision signifient aucun changement de catalogue observé par le démon, et toute différence signifie recharger le catalogue complet. Les clients ne doivent pas effectuer d'arithmétique de révision ni comparer les révisions entre générations, et des incrémentations supplémentaires conservatrices sont autorisées. La version couvre les changements d'appartenance au catalogue et les métadonnées statiques observés par le démon ; l'activité ordinaire des tours, le cycle de vie des invites, l'attachement/détachement et les transitions d'état d'attente ne la font pas progresser car l'instantané actif porte déjà les champs volatils correspondants. Un `updatedAt` modifié sous une version inchangée est donc valide et attendu, et il n'invalide pas les caches de listes persistées du démon. Deux valeurs de superposition volatiles sont délibérément exclues des deux signaux : l'état d'erreur de tour (`hasTurnError`/`turnError`) et le nombre/contenu des interactions en attente (`pendingInteractionCount`/`pendingInteractions`) ne font progresser ni la version ni n'apparaissent dans l'instantané, de sorte qu'un client qui en a besoin doit continuer à lire le flux d'événements par session ou le catalogue complet plutôt que de compter sur cette route ; l'un ou l'autre champ peut être ajouté de manière additive sur le fil lorsqu'un consommateur concret l'exige. Les mutations écrites directement par un autre démon, une interface utilisateur textuelle (TUI) ou un processus externe ne sont pas observées, de sorte qu'une fois qu'un client cesse le sondage périodique du catalogue complet, ces écritures n'ont pas de délai de découverte borné et ne se manifestent qu'après un rechargement complet explicite, une autre mutation de catalogue observée, une reconnexion ou un remplacement du démon/de l'environnement d'exécution.

Les clients réconcilient un ensemble de catalogue via une poignée de main à deux lectures : lire l'état actif A, charger la liste complète des sessions (plus `GET /workspaces/:workspace/session-groups` lorsque le client consomme `session_organization`), puis lire l'état actif B. Des versions A et B égales acceptent l'ensemble ; des versions différentes marquent le catalogue comme obsolète et coalescent au plus un rechargement final plutôt que d'entrer dans une boucle de nouvelle tentative serrée. Chaque demande de catalogue acceptée doit être initiée après A — une demande ou une promesse dédupliquée ayant commencé avant A ne peut pas satisfaire la réconciliation. Les rechargements pilotés par la version sont en vol unique par espace de travail et respectent un intervalle minimal non nul en arrière-plan, afin que des fluctuations soutenues du catalogue ne puissent pas entraîner un balayage complet du catalogue par sondage d'état actif ; les mutations locales explicites peuvent toujours demander une actualisation immédiate via la même opération en vol unique.

**Erreurs :**

- `400` — validation existante du sélecteur ou comportement `workspace_mismatch` pour un sélecteur inconnu, malformé, imbriqué ou non enregistré ; la route ne résout jamais un sélecteur inconnu vers l'environnement d'exécution principal.
- `403` — `untrusted_workspace` pour tout environnement d'exécution non fiable, y compris un environnement principal non fiable.
- `503` — `workspace_runtime_unavailable` avec `Retry-After` pour un environnement d'exécution en démarrage, en transition, en vidange, bloqué ou supprimé, ou une génération d'environnement d'exécution qui se ferme en cours de requête.
- `500` — les erreurs locales inattendues utilisent la mappage d'erreurs de pont existant.

### `GET /workspace/:id/session-groups`

Lister les groupes de sessions définis par l'utilisateur pour un espace de travail. Le sélecteur GET singulier accepte tout identifiant d'espace de travail enregistré ou cwd canonique encodé en URL. L'alias GET pluriel est également disponible pour un secondaire non fiable et lit uniquement le sidecar d'organisation. Les mutations de groupes plurielles restent contrôlées par la confiance, tandis que les mutations de groupes singulières conservent leur comportement de compatibilité réservé au primaire. Pré-vol `caps.features.includes('session_organization')`.

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

Les couleurs sont uniquement des jetons de protocole ; les clients localisent les noms d'affichage. Aucun groupe nommé par couleur par défaut n'est créé.

### `POST /workspace/:id/session-groups`

Créer un groupe de sessions personnalisé. Contrôle de mutation strict. Pré-vol `caps.features.includes('session_organization')`.

Requête :

```json
{ "name": "Frontend", "color": "blue" }
```

`name` est tronqué, doit contenir 1 à 64 caractères, ne peut pas contenir de caractères de contrôle, et est unique au sein de l'espace de travail par comparaison tronquée insensible à la casse. Les noms dupliqués renvoient `409 { code: "group_name_conflict" }`. `color` doit être l'une des `colorOptions` retournées.

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

Mettre à jour un groupe de sessions personnalisé. Contrôle de mutation strict. Pré-vol `caps.features.includes('session_organization')`. Les champs du corps sont optionnels : `{ "name"?: string, "color"?: string, "order"?: number }`. Les identifiants de groupe inconnus renvoient `404 { code: "group_not_found" }` ; les noms et couleurs dupliqués/invalides utilisent les mêmes erreurs que la création.

### `DELETE /workspace/:id/session-groups/:groupId`

Supprimer un groupe de sessions personnalisé. Contrôle de mutation strict. Pré-vol `caps.features.includes('session_organization')`. Les sessions référençant le groupe sont effacées vers `groupId: null` ; l'état épinglé est préservé. La réponse est `{ "deleted": true }` lorsqu'un groupe a été supprimé et `{ "deleted": false }` lorsque l'identifiant n'existait pas.

### `POST /sessions/delete`

Suppression définitive d'un ou plusieurs fichiers JSONL de sessions persistées. Le démon ferme d'abord au mieux les sessions actives, puis supprime le JSONL actif ou archivé. Si des copies actives et archivées existent toutes deux pour le même id, les deux sont supprimées. Les sidecars de worktree des deux côtés sont nettoyés ; l'historique des fichiers, les transcriptions des sous-agents et les sidecars d'environnement d'exécution sont intentionnellement préservés.

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

Archiver une ou plusieurs sessions. L'archivage est une transition d'état, non une suppression : le fichier JSONL passe de `chats/<id>.jsonl` à `chats/archive/<id>.jsonl`. L'historique des fichiers, les transcriptions des sous-agents et les sidecars d'exécution restent en place. Si une session est active, le démon effectue d'abord une fermeture stricte et exige que le gestionnaire de fermeture de l'agent ACP vide l'enregistrement du chat ; si la fermeture ou la vidange échoue, le fichier JSONL n'est pas déplacé. Pré-vol `caps.features.session_archive`.

Requête :

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true, "requireIdle": true }
```

`sessionIds` doit être un tableau de chaînes non vide contenant au plus 100 identifiants. Les doublons sont fusionnés.

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

`resolveConflicts` est facultatif et a pour valeur par défaut `false`. Par défaut, les fichiers actifs et archivés portant le même id sont signalés dans `errors`, et aucune copie n'est déplacée, supprimée ou écrasée. L'archivage d'une session active effectue toujours la fermeture stricte décrite ci-dessus avant de classer le conflit, afin que la fermeture puisse vider les enregistrements mis en file d'attente vers la transcription active. Avec `resolveConflicts: true`, l'archivage ne répare le conflit que si les deux copies sont des fichiers de transcription réguliers que l'espace de travail sélectionné peut maintenir, y compris les transcriptions vides ou endommagées possédées. Il conserve la copie archivée, supprime la copie active et signale l'id dans `archived` et `resolvedConflicts`. Cette option ne contourne pas les vérifications de propriété ; une propriété mixte locale/étrangère ou autrement ambiguë est signalée dans `errors`, et aucune copie n'est déplacée. Les entrées `errors` ont `{ "sessionId": "<uuid>", "error": "message" }`.

`requireIdle` est facultatif et a pour valeur par défaut `false`. Les clients doivent effectuer un pré-vol `session_archive_idle_guard` avant de l'envoyer. Avec `requireIdle: true`, un propriétaire actif dont l'état de travail actif est actif, inconnu ou non pris en charge renvoie cette session dans `errors` ; le démon ne la ferme pas et ne déplace pas sa transcription. La vérification et la transition vers la fermeture se produisent en un seul tour de plan de contrôle du runtime propriétaire, de sorte qu'aucun nouveau travail ne peut entrer entre eux. Une session persistante dont l'enfant actif a déjà été récupéré reste éligible à l'archivage.

Une session uniquement archivée est renvoyée dans `alreadyArchived` après que le démon acquiert un bail d'écriture ou de maintenance pour réconcilier le nettoyage pending des sidecars. Si un autre processus détient encore le bail d'écriture, l'id uniquement archivé est signalé dans `errors` jusqu'à ce que le bail devienne disponible.

Le déplacement de la transcription ou la réparation du conflit n'est pas annulé si une vérification de propriété de nettoyage ultérieure échoue. Dans ce cas, l'id peut apparaître uniquement dans `errors`, même si l'état d'archivage a déjà changé, et peut être omis de `archived` et `resolvedConflicts`. Réessayez la même requête de cycle de vie pour le même espace de travail avant de considérer l'erreur comme la preuve que la copie active ou le conflit subsiste. Lorsque le service peut vérifier l'identité de la transcription stockée et acquérir le bail d'écriture ou de maintenance requis, la nouvelle tentative rapporte l'état autoritaire `alreadyArchived` même pour les transcriptions vides ou endommagées que la liste des sessions omet, et reprend le nettoyage pending des sidecars. Les transcriptions dont l'identité stockée ne peut pas être vérifiée continuent de signaler `errors` lors des nouvelles tentatives et nécessitent une inspection manuelle ; les nouvelles tentatives qui ne peuvent pas acquérir le bail requis restent dans `errors` jusqu'à ce qu'il devienne disponible.

Les conflits de cycle de vie sont des résultats d'éléments de lot : les routes sans espace de travail et qualifiées par espace de travail renvoient HTTP `200` avec le conflit dans `errors`. Cela remplace l'enveloppe HTTP `409 session_conflict` qualifiée par espace de travail précédente ; les clients qui appelaient cette route doivent inspecter la réponse de lot. Les lots REST de runtime interne préservent le message de conflit sûr tout en continuant à masquer les autres détails d'échec par session.

### `POST /sessions/unarchive`

Restaurer les sessions archivées dans le répertoire actif. Cela ne reprend pas la session en soi ; cela déplace uniquement `chats/archive/<id>.jsonl` vers `chats/<id>.jsonl`. Après la réussite de la désarchivage, les clients peuvent appeler `POST /session/:id/load` ou `POST /session/:id/resume`.

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

`resolveConflicts` est facultatif et a pour valeur par défaut `false`. Par défaut, les fichiers JSONL actifs et archivés simultanés produisent un conflit dans `errors`, et aucune copie n'est déplacée, supprimée ou écrasée ; une session uniquement active est renvoyée dans `alreadyActive` après que le démon acquiert un bail d'écriture ou de maintenance pour réconcilier le nettoyage pending des sidecars. Si une session active détient encore le bail d'écriture, l'id uniquement actif est signalé dans `errors` jusqu'à ce que cette session soit fermée. Avec `resolveConflicts: true`, la désarchivage ne répare le conflit que si les deux copies sont des fichiers de transcription réguliers que l'espace de travail sélectionné peut maintenir, y compris les transcriptions vides ou endommagées possédées. Il conserve la copie active, supprime la copie archivée et signale l'id dans `unarchived` et `resolvedConflicts`. Cette option ne contourne pas les vérifications de propriété ; une propriété mixte locale/étrangère ou autrement ambiguë est signalée dans `errors`, et aucune copie n'est déplacée. Un archivage ou désarchivage en cours pour le même id renvoie `409 session_archiving` avant de démarrer le lot.

Le déplacement de la transcription ou la réparation du conflit n'est pas annulé si une vérification de propriété de nettoyage ultérieure échoue. Dans ce cas, l'id peut apparaître uniquement dans `errors`, même si l'état d'archivage a déjà changé, et peut être omis de `unarchived` et `resolvedConflicts`. Réessayez la même requête de cycle de vie pour le même espace de travail avant de considérer l'erreur comme la preuve que la copie archivée ou le conflit subsiste. Lorsque le service peut vérifier l'identité de la transcription stockée et acquérir le bail d'écriture ou de maintenance requis, la nouvelle tentative rapporte l'état autoritaire `alreadyActive` même pour les transcriptions vides ou endommagées que la liste des sessions omet, et reprend le nettoyage pending des sidecars. Les transcriptions dont l'identité stockée ne peut pas être vérifiée continuent de signaler `errors` lors des nouvelles tentatives et nécessitent une inspection manuelle ; les nouvelles tentatives qui ne peuvent pas acquérir le bail requis, notamment parce qu'une session active le détient encore, restent dans `errors` jusqu'à ce que le bail devienne disponible.

ACP-over-HTTP utilise les mêmes corps de requête et de réponse via les méthodes vendor `_qwen/sessions/archive` et `_qwen/sessions/unarchive`. La table de routes REST mappe `POST /sessions/archive` et `POST /sessions/unarchive` vers ces méthodes pour les transports ACP.

### Routage des sessions actives multi-espace de travail

Lorsque `multi_workspace_sessions` est annoncé, les opérations sur les sessions actives identifient leur espace de travail depuis `sessionId` ; les clients n'ajoutent pas de sélecteur d'espace de travail à l'URL. En plus des opérations de cycle de vie routées par propriétaire existantes, cela s'applique à `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/btw/stream`, `DELETE /session/:id/btw/stream/:requestId`, `POST /session/:id/mid-turn-message`, `GET /session/:id/mid-turn-messages`, `POST /session/:id/mid-turn-messages/send-now`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts`, `DELETE /session/:id/artifacts/:artifactId`, `GET /session/:id/sources`, `POST /session/:id/sources` et `DELETE /session/:id/sources/:sourceId`. Le démon route chaque requête vers le runtime fiable qui possède la session active. Un propriétaire non primaire non fiable renvoie `403 untrusted_workspace`, un propriétaire actif manquant renvoie `404 session_not_found`, et un propriétaire ambigu échoue fermé avec `500 ambiguous_session_owner`.

Cette règle s'applique uniquement aux sessions en cours et ne rend pas toutes les routes de session sans espace de travail conscientes du multi-espace de travail. Les opérations persistées ou archivées utilisent leurs routes qualifiées par l'espace de travail documentées. `POST /session/:id/branch`, `POST /session/:id/fork` et `POST /session/:id/cd` restent intentionnellement réservés au primaire et retournent `non_primary_session_route_not_supported` pour les propriétaires non primaires.

### Messages en milieu de tour

`POST /session/:id/mid-turn-message` accepte `{ "message": "...", "messageId": "<optional-message-id>" }`. Une admission réussie retourne `{ "accepted": true, "messageId": "<id>" }` et transfère la propriété au démon : le message est vidé dans le tour actif ou promu dans la file d'attente normale des invites lorsque la session devient inactive. Les clients utilisant `session_mid_turn_message_query` envoient un `messageId` stable ; sa répétition est idempotente tant qu'il reste en file d'attente, en attente ou dans les anneaux de réconciliation bornés. Un rejet d'une requête validée par le démon retourne `{ "accepted": false }` et ne transfère jamais la propriété : une session ouverte sans invite admise dans sa file d'attente des invites et sans tour Goal actif signale `{ "accepted": false, "reason": "session_idle" }` afin que le client puisse renvoyer le message comme une invite ordinaire au lieu de signaler un échec. Pour une véritable nouvelle admission, un bloc `content` référençant une pièce jointe que la session ne détient plus — ou une référence invalide — est décliné avant les verdicts d'inactivité et de file d'attente : la requête reçoit une réponse `410 session_attachment_gone` (ou `400 invalid_session_attachment_reference`) avec un corps `{ "error", "code" }`, qui ne contient aucun `reason` même si la session est inactive. Deux portes précédentes le préemptent : un `messageId` répété dont la charge utile correspond toujours se règle idempotemment avec `{ "accepted": true, "messageId" }` même si la pièce jointe a été supprimée depuis, et une session en cours de fermeture ou autorisant une fermeture est refusée avec un `{ "accepted": false }` sans raison. Le verdict décrit uniquement ce qui peut vider un message en milieu de tour, pas tout ce que la session peut détenir — un instantané de session peut encore signaler `hasActivePrompt: true` pour celui-ci, par exemple pendant qu'une invite de restauration différée est mise en attente. Un rejet sans raison a une autre cause — la file d'attente est pleine, la session est en cours de fermeture ou autorise une fermeture, le budget de pièces jointes en ligne en file d'attente est épuisé, ou un `messageId` répété ne correspond plus à la charge utile détenue par le démon. Le démon conserve la charge utile déjà admise plutôt que de la remplacer, mais cela n'est pas une promesse de livraison : un message promu que le client a supprimé disparaît immédiatement des instantanés des invites en attente — celui qui n'avait pas commencé est abandonné sur place, celui déjà en cours est masqué jusqu'à ce que son tour interrompu se termine — donc la réponse de suppression est le seul `removed = true` qu'un client observe jamais. Une session en cours de fermeture ne promeut jamais ce qui reste en file d'attente, et un tour qui se termine pendant qu'une fermeture est encore autorisée remet la file d'attente à la porte d'admission, qui la refuse, donc ces messages sont abandonnés plutôt que promus et n'atterrissent dans aucun anneau. Une fermeture que l'enfant refuse ensuite laisse la session active avec tout ce qui restait en file d'attente toujours listé et rien programmé pour le promouvoir jusqu'à ce qu'un tour ultérieur se termine. Ces messages appartiennent toujours au démon, donc la récupération par défaut consiste à attendre : le règlement du tour suivant promeut l'arriéré, rien n'est perdu et rien n'est livré deux fois. Un client qui ne peut pas attendre — aucun tour supplémentaire n'arrive et l'utilisateur regarde une file d'attente qui ne se videra pas — peut forcer le vidage à la place, et le seul moyen pris en charge est de libérer chaque charge utile avant de la renvoyer. Les deux chemins partent du même ensemble : construisez-le à partir du propre record du client de ce qu'il a mis en file d'attente pendant cette fenêtre moins tout ce pour quoi il a une preuve positive de livraison, et non à partir du silence de la liste. La requête n'est pas un inventaire de ce que le démon détient — elle omet une invite déjà marquée comme supprimée, les deux anneaux sont bornés, et une mise en file d'attente envoyée sans identifiant client n'est pas suivie du tout sur cette surface — donc un id signalé nulle part peut avoir expiré après livraison, avoir été abandonné sans livraison, ou n'avoir jamais été listé. Une preuve positive de livraison est un écho `mid_turn_message_injected`, un `pending_prompt_started` pour cet id, ou une appartenance à l'un des anneaux.

Le POST en milieu de tour accepte également `eventDetailMode` facultatif : `full` (par défaut) ou `summary` ; les valeurs invalides renvoient `400 invalid_event_detail_mode`. Le démon conserve ce mode avec le message et l'utilise si un message non vidé devient une nouvelle invite. La vidange dans un tour existant ne modifie pas le mode de ce tour. Tant qu'il est en file d'attente ou promu et en attente, une nouvelle tentative sous le même `messageId` doit correspondre au texte, aux médias et au mode effectif (omission équivaut à complet). Web Shell envoie son mode Provider actuel. La route REST continue de rejeter les nouvelles admissions à l'état inactif avec `reason: "session_idle"` ; les appelants soumettent alors une invite ordinaire.

Pour forcer le vidage, `DELETE /session/:id/mid-turn-messages/:messageId` chaque id de cet ensemble que la requête signale toujours comme en file d'attente, puis seulement ensuite renvoyez le texte sous un nouveau `messageId`, car un id répété est acquitté idempotemment et ne réarme rien. L'ordre compte et s'applique à l'ensemble entier plutôt qu'id par id : une charge utile encore en file d'attente que le démon possède est promue par le prochain règlement, donc renvoyer un id dont la charge utile n'a jamais été libérée livre ce message deux fois — une fois de cette promotion et une fois du renvoi. Là où `session_mid_turn_message_mutation` n'est pas annoncé, il n'y a aucun moyen de libérer une charge utile, donc attendre est la seule option sûre. Aucun verdict DELETE n'établit la livraison à lui seul. `{ "removed": false }` couvre un id déjà injecté ou terminé — livré, donc il ne doit pas être renvoyé — et, selon la route DELETE ci-dessous, deux autres cas. L'un est un id qu'un vidage détient toujours, qui ne doit pas être renvoyé non plus. Une requête ultérieure le liste dans `settledMessageIds`, mais ce n'est pas définitif : si le vidage échoue, l'id quitte l'anneau et revient dans la file d'attente sans événement. Le paragraphe sur l'envoi immédiat ci-dessous décrit quand les messages d'un vidage expiré sont perdus. L'autre est un id introuvable, ce qui pour un id que la requête venait de lister comme en file d'attente signifie qu'il a quitté la file entre les deux appels et peut avoir été abandonné sans livraison par le chemin d'autorisation de fermeture ci-dessus ; décidez ce cas à partir des propres preuves du client. `{ "removed": true }` libère la charge utile, mais pour un id qu'un règlement a promu dans cette fenêtre, il couvre à la fois une entrée FIFO coupée avant qu'elle ne soit jamais dispatchée, ce qui est sûr à renvoyer, et une interruption d'une invite promue qui avait déjà commencé, ce qu'un renvoi enverrait alors une seconde fois. Un id promu reste également supprimable via la même route jusqu'à ce qu'il se termine, bien que la liste ne le signale plus comme en file d'attente. Le renvoi lui-même est une admission en milieu de tour et peut être refusé `{ "accepted": false, "reason": "session_idle" }` ; ce n'est pas un échec mais le signal décrit ci-dessus que la session prend désormais une invite ordinaire, et la soumission via la route ordinaire démarre un tour dont le règlement promeut tout ce qui est encore en file d'attente — ce qui est aussi la raison pour laquelle chaque id de l'ensemble doit être libéré d'abord.

L'absence de `reason` n'est donc pas une preuve d'une session occupée. Les démons antérieurs à `reason` l'omettent dans tous les cas, afin que les clients conservent leur propre détection d'inactivité en parallèle. Les nouveaux clients connectés à un démon plus ancien détectent la capacité manquante et conservent leur repli local hérité.

`GET /session/:id/mid-turn-messages` renvoie la file d'attente gérée par le démon à l'échelle de la session ainsi que les anneaux bornés `settledMessageIds` et `promotedMessageIds`. Les identifiants réglés ont été injectés ou explicitement supprimés ; les identifiants promus sont entrés dans la FIFO de prompt normale. Un identifiant présent dans l'un des anneaux ne doit pas être renvoyé.

Lorsqu'un message en file d'attente est vidé vers le tour actif, le démon publie `mid_turn_message_injected` contenant les tableaux alignés `messages` et `messageIds` (et le `promptId` du tour en cours lorsqu'il est connu). C'est un signal transitoire de déduplication, non un élément de transcription : les clients règlent les rappels de complétion enregistrés sous ces identifiants de message et suppriment toutes les lignes locales en attente pour eux. Les démons plus anciens incluent également `originatorClientId` dans la charge utile. Un écho manqué est récupéré depuis l'anneau réglé via la requête ci-dessus.

L'agent vide la file d'attente chaque fois qu'un lot d'outils se termine, donc un message admis pendant qu'une réponse du modèle est diffusée attend cette réponse et son lot d'outils. Lorsque `session_mid_turn_send_now` est annoncé, un client de session attaché peut appeler `POST /session/:id/mid-turn-messages/send-now` pour que les messages en file d'attente soient livrés immédiatement : si un tour au premier plan, y compris une continuation d'objectif, diffuse une réponse du modèle, l'agent vide la file d'attente immédiatement, coupe court à cette réponse, conserve la partie déjà diffusée dans la conversation et poursuit le même tour avec les messages. Une réponse qui a commencé un appel d'outil annoncé par le fournisseur, même dont les arguments sont encore en cours de diffusion, n'est pas coupée court, et les outils en cours d'exécution ne sont jamais interrompus : les messages restent en file d'attente et sont livrés avec les résultats des outils, ou promus au prochain prompt lorsqu'un outil termine le tour. Certains fournisseurs n'annoncent un appel d'outil qu'une fois ses arguments complets, et un tel appel peut encore être coupé court. Dans quelques cas, les messages ont déjà quitté la file d'attente mais ne reçoivent pas de réponse dans ce tour. Lorsque la vidange immédiate est déjà envoyée alors que le fournisseur annonce un appel d'outil qui termine ensuite le tour, ou lorsque le tour est arrêté, les messages sont conservés dans la conversation et la transcription mais ne sont pas promus. Lorsque la vidange immédiate elle-même expire (l'agent attend 2 s, et le démon peut encore lire les pièces jointes), les messages transmis par le démon après cela coupent court à la réponse si elle est encore diffusée sans appel d'outil, et sont sinon livrés avec une vidange ultérieure, possiblement dans un tour ultérieur ; comme pour toute vidange expirée, ils sont perdus si le démon répond plus de 30 s après l'expiration, ou si le tour est arrêté pendant que cette vidange ultérieure résout leurs pièces jointes. Dans tous les cas, leurs identifiants sont réglés comme ceux de tout message vidé : renvoyer l'un d'eux est accusé réception sans le remettre en file d'attente, et un client qui souhaite une réponse aux messages conservés dans la conversation envoie un nouveau prompt. Le pilotage interne uniquement en file d'attente ne déclenche jamais une coupure et n'est pas pris en charge par la vidange immédiate ; il part avec la prochaine demande au modèle, ou via le chemin de règlement conduit par son appelant lorsque le tour se termine d'abord. Les tours de canal, de cron et d'arrière-plan conservent la livraison aux limites des outils. La réponse est `{ "requested": true }` lorsque des messages utilisateur étaient en attente et que l'agent a été invité à les livrer, et `{ "requested": false }` lorsqu'aucun n'était en attente (ils avaient déjà été livrés, supprimés ou promus). Un agent antérieur à la demande y répond avec `-32601` et conserve la livraison aux limites des outils.

Lorsque `session_mid_turn_message_mutation` est annoncé, un client de session attaché peut appeler `DELETE /session/:id/mid-turn-messages/:messageId`. Il retire le message soit de la file d'attente en milieu de tour, soit de son état de prompt promu en attente ; retirer un message promu qui est déjà en cours d'exécution interrompt ce tour, correspondant au retrait ordinaire de prompt en attente. Les ajouts et suppressions de la file d'attente gérée par le démon publient les événements de session existants `pending_prompt_added` et `pending_prompt_completed` afin que les clients attachés actualisent les deux instantanés autorisés de la file d'attente. `{ "removed": false }` signifie que le message a déjà été injecté, terminé ou introuvable. Un message pris par une vidange mais pas encore transmis à l'agent répond également `{ "removed": false }`. Si cette vidange échoue, le message retourne dans la file d'attente sans événement de file d'attente et son identifiant quitte l'anneau réglé. Une vidange ultérieure ou le règlement du tour le prend ensuite, mais lorsque la vidange échoue après que son tour a été réglé, le message reste en file d'attente jusqu'au tour suivant.

### `GET /session/:id/pending-prompts`

Renvoie l'invite actuellement en cours d'exécution et les invites en attente dans la FIFO de la session active. La requête peut inclure `X-Qwen-Client-Id` ; lorsqu'il est présent, il doit identifier un client connecté.

```json
{
  "pendingPrompts": [
    {
      "promptId": "<prompt-id>",
      "text": "Explain the failure",
      "queuedAt": 1700000000123,
      "state": "running",
      "originatorClientId": "<client-id>"
    }
  ]
}
```

`state` est `running` pour l'invite en cours de distribution et `queued` pour les invites en attente. `content` apparaît lorsque l'invite contient du contenu structuré tel que des images. Il s'agit d'une route propriétaire de session active : `404` signifie aucun propriétaire actif et `503` signifie que le propriétaire est temporairement indisponible. Un propriétaire non principal non fiable renvoie `403 untrusted_workspace`, et un id vivant dans plus d'un espace de travail renvoie `500 ambiguous_session_owner`. Il n'y a pas de balise de capacité dédiée ; les démons plus anciens renvoient `404`. La méthode du SDK TypeScript est `getPendingPrompts()`.

### `POST /session/:id/prompt`

`eventDetailMode` accepte `full` (par défaut) ou `summary` ; les valeurs invalides renvoient `400 invalid_event_detail_mode`. Le résumé filtre les détails des sous-agents imbriqués avant la rétention dans l'anneau et la livraison SSE, et supprime les invites Agent, les outils intégrés et les compteurs de jetons en cours tout en préservant le contenu racine et l'utilisation du modèle principal. Les résultats définitifs des Agents conservent les totaux de jetons `tokenCount` et `executionSummary` (y compris échec/annulation) pour les métriques de tour ; les cadres d'utilisation imbriqués restent filtrés. La même règle s'applique aux réponses de chargement/transcription résumées. Le mode est capturé à l'admission, appliqué uniquement lors de la distribution, et réinitialisé à complet lors du règlement. Les événements tardifs des sous-agents utilisent le mode à la publication : complet à l'inactivité, ou le mode de l'invite active lorsqu'une invite ultérieure est en cours d'exécution. Ils n'héritent pas du mode de l'invite qui a initialement lancé le sous-agent. Cela s'applique à tous les abonnés de la session ; les détails filtrés ne peuvent pas être récupérés ultérieurement depuis l'anneau. Le `/acp` `session/prompt` du démon accepte la même extension facultative de niveau supérieur avec la même portée (les valeurs invalides sont JSON-RPC `-32602`) ; ce n'est pas un champ ACP standard et il n'est pas transmis à l'enfant.

Transmet une invite à l'agent. Les appelants multi-invites mettent en file d'attente FIFO par session (ACP garantit une seule invite active par session).

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

`delivery` est facultatif et nécessite la capacité `channel_delivery`. Le démon renvoie toujours `202 {promptId,lastEventId}` lorsque l'invite est admise. Après un `end_turn` réussi, la session soumet le texte final visible au Channel Worker déjà en cours d'exécution de l'espace de travail exact. La charge utile n'est que le dernier bloc de réponse assistant sans outil ; les préambules d'appels d'outils, les narrations inter-outils, les nouvelles tentatives remplacées et les blocs de continuation automatique antérieurs sont exclus. Une fin vide ou composée uniquement d'espaces produit toujours un `channel_delivery_result` corrélé avec `status: "skipped"` après consommation de l'autorisation, mais cela ne contacte pas un worker. Le succès ou l'échec de la livraison arrive plus tard via le même événement rejouable et ne change jamais `turn_complete` en `turn_error`. L'annulation, l'échec de l'Agent et la terminaison par limite de jetons n'envoient ni ne publient de résultat de livraison.

Validation : `prompt` doit être un tableau non vide d'objets. Les autres échecs renvoient `400` avant d'atteindre le pont.

`idempotencyKey` est une chaîne facultative non vide d'au plus 200 caractères (les valeurs invalides renvoient `400 invalid_idempotency_key`). Il identifie l'EVENT de l'appelant, pas la requête HTTP : la première admission mémorise la clé par session, et un POST répété avec la même clé renvoie l'admission originale — `202 { promptId, lastEventId, eventEpoch, deduplicated: true }` avec le `promptId` de la PREMIÈRE invite et un nouveau curseur/epoch — sans mettre en file d'attente un second tour. Cela permet à un relais qui marque l'acceptation de manière durable après le `202` (ou perd la réponse) de réessayer en toute sécurité. La déduplication est faite au mieux pendant la durée de vie du démon : l'anneau est en mémoire et limité (128 clés par session, 1024 sessions, éviction FIFO aux deux niveaux). Chaque plafond peut évincer une clé tandis que l'entrée de file d'attente de son événement est encore vivante — le plafond par session dans le cas ordinaire d'une longue session admettant plus de 128 événements distincts, le plafond de sessions lorsque plus de 1024 sessions détiennent des clés — et une nouvelle tentative après une telle éviction réinjecte. L'anneau meurt également avec la file d'attente des invites en mémoire qu'il protège, donc un redémarrage du démon perd les deux ensemble et la réinjection devient la récupération correcte. Les clés sont scopées par session ; le champ est une métadonnée d'admission et n'est jamais transmis à l'agent.

Les relais de canal reposent sur trois clés `_meta` que la route supprime avant le transfert : `qwen.channel.prompt` (classification du tour de canal), `qwen.daemon.channelBoundRelay: true` (intention de livraison liée inter-espace de travail) et `qwen.daemon.channelPromptAuthorization` (le jeton d'autorisation du worker de canal ; le worker de référence ne l'envoie que s'il détient un identifiant). `qwen.channel.prompt` exige un jeton d'autorisation de worker de canal enregistré — l'enregistrement par espace de travail pour l'espace de travail cible ou, pour une livraison liée INTER-espace de travail, n'importe quel jeton de worker enregistré ainsi que le marqueur explicite `qwen.daemon.channelBoundRelay: true` et une cible primaire/de confiance. Un relais qui envoie uniquement les deux marqueurs sans l'identifiant ne reçoit aucune classification de canal : il est admis comme une invite interactive ordinaire (rejet de détection de boucle, remplissage rétroactif du lien PR en direct sur le texte relayé). Une invite simple portant un jeton de worker étranger ne reçoit non plus aucune classification de canal ni projection d'affichage fournie par l'appelant.

acceptation fantôme. Si un pont refuse toujours différément avant l'admission,

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

La réponse `202` confirme l'admission, pas l'achèvement de l'Agent. Observez le flux SSE de la session après `lastEventId` et corrélisez `turn_complete` ou `turn_error` via `promptId`. Chaque vérification d'admission atteignable avant la mise en file d'attente — y compris la garde réservée au répertoire de travail autonome — déclenche une exception de manière synchrone, de sorte que la route répond avec une erreur non-202 AVANT toute acceptation : la garde répond `409 working_directory_missing` (`retryable: true`, `Retry-After: 5`) alors que la liaison de conversation gérée de la session n'a pas encore été libérée, et un relais de canal diffère l'événement au lieu de consommer une acceptation fantôme. Si un pont rejette toujours la demande différée avant l'admission, la route abandonne le `idempotencyKey` de la demande afin qu'une nouvelle tentative ultérieure soit admise fraîchement au lieu d'être dédupliquée dans une admission fantôme — une défense en profondeur pour ce cas, dont la LIVRAISON ACTUELLE a déjà été consommée par l'appelant.

`turn_complete.data.stopReason` porte la raison d'arrêt ACP `StopReason` renvoyée par l'agent — `end_turn`, `max_tokens`, `max_turn_requests`, `refusal` ou `cancelled`. Le démon peut également émettre `cancelled` pour une invite interrompue sans que l'agent ne l'exécute, incluant la suppression des invites en file d'attente, la déconnexion de l'appelant ou le vidage/la fermeture ; cette valeur ne prouve pas que l'agent a exécuté l'invite. **Traitez le champ comme une chaîne ouverte** : il est typé `string` sur le fil, l'ensemble ACP peut s'étendre, et un client qui effectue une commutation exhaustive sur celui-ci se rompra à la prochaine addition.

Deux résultats côté démon n'arrivent **pas** sur ce champ. Un tour qui échoue à l'intérieur du démon — expiration du délai, vidage lors de la fermeture, plantage de l'enfant — est publié comme un événement `turn_error`, jamais comme une raison d'arrêt `turn_complete`. Son `data` porte toujours `message` ; `code` n'est présent que lorsque le démon a classifié l'échec (expiration du délai → `prompt_deadline_exceeded`, vidage lors de la fermeture → `channel_closed`, `session_closed`, `session_killed` ou `daemon_shutdown`), et la trame pour une invite rejetée parce que l'enfant ACP est mort en cours de requête ne porte ni `code` ni `errorKind`. Traitez les deux comme optionnels et branchez-vous sur `message`.

Un tour récupéré depuis l'historique persisté après un redémarrage n'est pas republié sur le flux ; il apparaît dans `promptTerminals[]` dans le corps de la réponse `POST /session/:id/load` — sous forme de `{ terminal: "completed", stopReason: "reconstructed_from_transcript" }` lorsque la fin persistée montre que le tour est terminé, ou de `{ terminal: "interrupted", code: "daemon_lost" }` avec **aucun** `stopReason` lorsque le démon est mort en cours de tour. Faites correspondre l'entrée via `promptId` et branchez-vous sur `terminal` ; `promptTerminals` est entièrement omis de la réponse lorsque le registre ne contient aucune preuve pour la session.

Si le client HTTP se déconnecte en cours de prompt, le démon envoie une notification ACP `cancel` à l'agent, qui termine le prompt avec `stopReason: "cancelled"`.

Lorsque `prompt_absolute_deadline` est annoncé, `deadlineMs` peut raccourcir le délai serveur configuré. L'expiration émet un événement `turn_error` corrélé avec `code: "prompt_deadline_exceeded"`. Le délai libère l'appelant sans tuer l'agent ; si l'agent règle ensuite son état, les sondes de statut de tour pour ce `promptId` renvoient le résultat de la transcription réglée au lieu de l'erreur de délai.

### `POST /session/:id/cancel`

Annule le prompt **actuellement actif** sur la session. Côté ACP, c'est une notification, pas une requête — l'agent confirme en résolvant le `prompt()` actif avec `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Contrat multi-prompt :** cancel n'affecte que le prompt actif. Les prompts précédemment POSTés par le même client et toujours en file derrière celui actif continueront à s'exécuter. La mise en file multi-prompt est un comportement introduit par le démon (non spécifié dans ACP) ; le contrat pour les prompts en file est « ils continuent à tourner sauf si vous annulez chacun, ou tuez la session via sortie de canal ».

Si les invites en file d'attente sont inattendues dans un déploiement multi-client, confirmez d'abord si les appelants partagent une session `sessionScope: "single"` par défaut. Pour des conversations indépendantes par fil, créez des sessions avec `sessionScope: "thread"` afin que les invites soient sérialisées uniquement au sein de ce fil.

### `DELETE /session/:id`

Ferme explicitement une session active. Force la fermeture même lorsque d'autres clients sont attachés — annule tout prompt actif, résout les permissions en attente comme annulées, publie l'événement `session_closed`, ferme l'EventBus et retire la session des maps du démon. Les sessions persistées sur disque NE SONT PAS supprimées — elles peuvent être rechargées via `POST /session/:id/load`. Pré-vol `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent : retourne `404` pour les sessions inconnues. L'enveloppe d'erreur utilise `code: "session_not_found"` ; une fermeture concurrente peut retourner `code: "session_closing"`, que les clients peuvent traiter comme le même état terminal réussi pour cette route.

> **Événement `session_closed`.** Les abonnés SSE reçoivent un événement terminal `session_closed` avec `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` avant la fin du flux. Les reducers SDK traitent cela identiquement à `session_died` (définit `alive: false`, efface `pendingPermissions`).

### `PATCH /session/:id/metadata`

Mettez à jour les métadonnées de session mutables. Pré-vol `caps.features.session_metadata`. Le regroupement et l'épinglage ne font intentionnellement pas partie de cette route ; utilisez `PATCH /session/:id/organization` sous `session_organization`.

Requête :

```json
{
  "displayName": "My Investigation Session",
  "pr": {
    "number": 123,
    "url": "https://github.com/QwenLM/qwen-code/pull/123",
    "state": "open"
  }
}
```

| Champ | Requis | Notes |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName` | non | Chaîne. Les valeurs plus longues que 256 unités de code UTF-16 sont tronquées, et la coupe n'est pas consciente des paires de substitution, donc un nom se terminant par un caractère non-BMP peut perdre une moitié de substitut isolé. Une valeur vide ou composée uniquement d'espaces est rejetée avec `400 invalid_metadata` ; omettez le champ pour laisser le nom inchangé. |
| `pr` | non | Lie une demande de fusion. Nécessite un entier positif `number`, une URL HTTP(S) `url` d'au plus 2 048 caractères sans caractères de contrôle, et `state` optionnel : `open`, `merged` ou `closed`. |

Réponse :

```json
{
  "sessionId": "<uuid>",
  "displayName": "My Investigation Session",
  "prs": [
    {
      "number": 123,
      "url": "https://github.com/QwenLM/qwen-code/pull/123",
      "state": "open"
    }
  ]
}
```

`prs` est l'historique de liaison borné effectif et peut inclure des liens de problème actualisés. Publie un événement `session_metadata_updated` sur le flux SSE de la session portant uniquement le groupe de champs modifié : un renommage émet `displayName` (plus `titleSource` lorsque le nom est défini) et laisse `prs` absent, tandis qu'un changement de liaison PR émet `prs` et fait écho à l'actuel `displayName` lorsqu'il est défini. Traitez un champ absent de l'événement comme inchangé, non effacé, et relisez le corps `200` ou la liste des sessions lorsque vous avez besoin des métadonnées complètes.

### `PATCH /session/:id/organization` and `PATCH /workspaces/:workspace/session/:id/organization`

Met à jour l'état d'organisation local de la session via la porte de mutation existante. Pré-vol `caps.features.includes('session_organization')` ; la route plurielle nécessite en plus `workspace_qualified_rest_core`. Sur la route plurielle, `:workspace` se résout d'abord comme un id d'espace de travail enregistré exact puis comme un cwd absolu canonique encodé en URL. Le runtime sélectionné doit être fiable. La validation de l'existence de la session et de `groupId` non-null est limitée à l'état de session persisté actif, persisté archivé et live du runtime ainsi qu'au store de groupes, sans repli vers le primaire ou un autre espace de travail. La route héritée reste limitée à l'espace de travail primaire.

Requête :

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Champ | Requis | Notes |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | non | Booléen. `true` définit `pinnedAt` s'il n'était pas déjà épinglé ; `false` efface `pinnedAt`. |
| `groupId` | non | Id de groupe personnalisé ou `null` pour non groupé. Les ids de groupe inconnus retournent `404 { code: "group_not_found" }`. |
| `color` | non | Un jeton de couleur de session pris en charge, ou `null` pour effacer la couleur de session. |

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

Cet état est stocké dans le sidecar d'organisation de session au niveau du projet, sous le répertoire de stockage d'exécution du démon. Il ne s'agit pas du contenu de la transcription, il ne met pas à jour la transcription `mtime`, n'est pas exporté avec les transcriptions et est conservé lors des opérations d'archivage/désarchivage.

### `POST /session/:id/heartbeat`

Mettre à jour le suivi de dernière activité du démon pour cette session. Les adaptateurs longue durée (TUI/IDE/web) effectuent des ping périodiques sur ce mécanisme afin que la future politique de révocation (Wave 5 PR 24) puisse distinguer les clients morts des clients silencieux.

En-têtes :

| En-tête | Requis | Notes |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | non | Renvoie l'id émis par le démon depuis `POST /session`. Les clients identifiés mettent également à jour leur horodatage par client ; les battements de cœur anonymes mettent uniquement à jour le point de repère par session. Doit respecter la même forme `[A-Za-z0-9._:-]{1,128}` que partout ailleurs. |

Le corps de la requête est vide (`{}` convient — aucun champ n'est lu actuellement).

Réponse :

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` n'est renvoyé que si un `X-Qwen-Client-Id` fiable a été fourni. `lastSeenAt` est l'époque `Date.now()` côté démon (ms) stockée par le pont.

Erreurs :

- `400` — `{ code: 'invalid_client_id' }` lorsque l'en-tête est malformé (règle de forme d'en-tête) ou lorsqu'il porte un `clientId` qui n'est pas enregistré pour cette session (le pont lance `InvalidClientIdError` avant de mettre à jour tout horodatage).
- `404` — session inconnue.

Contrôle de capacité : pré-vol `caps.features.client_heartbeat`. Les démons plus anciens renvoient `404` pour ce chemin.

### `POST /session/:id/model`

Changer le modèle actif **au sein** du service de modèle actuellement lié à la session. Sérialisé via la file d'attente de changement de modèle par session.

(Pour changer le _service_ lui-même — Alibaba ModelStudio vs OpenRouter etc — passez `modelServiceId` sur `POST /session` pour une nouvelle session. La phase 1 n'a pas de route de changement de service en direct.)

Requête :

```json
{ "modelId": "qwen-staging" }
```

Réponse : le résultat du changement de modèle de l'agent ACP, transféré verbatim — le démon ne le remodèle pas, donc le niveau supérieur ne porte aucun `modelId`. Lisez les détails du changement depuis `_meta.qwenModelSwitch`.

En cas de succès, publie `model_switched` sur le flux SSE. En cas d'échec, publie `model_switch_failed` (afin que les abonnés passifs voient l'échec, pas seulement l'appelant). Course contre la sortie du canal agent pour qu'un processus enfant bloqué ne puisse pas bloquer le gestionnaire HTTP. Un changement réussi enregistre également le modèle de session dans le JSONL de session sur une base best-effort ; lorsque l'enregistrement est écrit, le chargement/reprise du démon tente de restaurer le modèle de cette session avant l'authentification. Si le modèle enregistré ne peut plus être appliqué (modèle supprimé, credentials indisponibles), la restauration utilise une route de registre avec le même id lorsqu'elle existe — pour un enregistrement instantané d'exécution, cela peut être un endpoint différent de celui de la liaison enregistrée — et continue sur le défaut `settings.model.name` uniquement lorsqu'aucune route ne se résout. `settings.model.name` est toujours mis à jour comme défaut pour les **nouvelles** sessions.

### `GET /session/:id/message-groups`

Tag de capacité : `session_message_deletion`. Pont → extMethod ACP `qwen/status/session/message_groups`. Ceci est une lecture propriétaire de session active : elle résout le runtime propriétaire de la session et ne retombe jamais sur l'espace de travail principal. La capacité globale du démon n'implique pas la prise en charge de toutes les sessions ; les espaces de travail SSH et le stockage autoritaire Managed refusent la suppression.

Liste les groupes de prompts/réponses ou d'affichage de commandes sûrement attribuables dans l'ordre de l'historique actif. Il n'acquiert pas de bail d'écriture pour un enregistreur hérité ordinaire. La lecture attend les mutations d'historique antérieures ; un instantané renvoyé peut devenir obsolète à mesure que la session change. La suppression elle-même nécessite une session inactive.

Réponse (200) :

```json
{
  "snapshot": "<opaque selection token>",
  "groups": [
    {
      "id": "<group-id>",
      "promptId": "<prompt-id>",
      "recordIds": ["<user-record-id>", "<reply-record-id>"]
    }
  ]
}
```

`promptId` et `promptIds` sont des identités de prompt optionnelles ; `recordIds` identifie les enregistrements sauvegardés du groupe. Un historique vide renvoie `groups: []`. Traitez les IDs de groupe et l'instantané comme opaques ; passez l'instantané renvoyé inchangé lors de la suppression.

Les erreurs incluent `404` pour une session inconnue, `400 unsupported_operation` pour un espace de travail SSH, et `422 session_message_deletion_unsupported` pour un stockage non pris en charge ou un enregistrement indisponible. Les erreurs existantes d'intégrité de l'écrivain peuvent également renvoyer `409 session_writer_conflict`, `409 session_writer_lost`, `409 session_transcript_changed`, ou `503 session_writer_unavailable`.

### `POST /session/:id/messages/delete`

Tag de capacité : `session_message_deletion`. Pont → extMethod ACP `qwen/control/session/messages_delete`. Porte de mutation stricte ; portée au propriétaire de session active sans repli sur l'espace de travail principal. Accepte `X-Qwen-Client-Id` optionnel pour l'attribution d'événements.

Requête :

```json
{ "snapshot": "<token from message-groups>", "groupIds": ["<group-id>"] }
```

Les deux champs sont requis. `snapshot` doit être non vide ; `groupIds` doit contenir des chaînes distinctes non vides. Les groupes sélectionnés doivent encore exister dans cet instantané. Le serveur rejette les sessions occupées plutôt que de mettre en file d'attente la suppression derrière un tour de modèle.

Réponse (200) :

```json
{
  "deletedGroupIds": ["<group-id>"],
  "deletedPromptIds": ["<daemon-prompt-id>"]
}
```

Les enregistrements originaux sélectionnés et leur contexte de compression brut possédé sont physiquement retirés du JSONL. Le texte de résumé existant, les effets de commande et les fichiers de projet sont préservés. Supprimer tous les groupes laisse la session disponible pour des prompts ultérieurs.

Erreurs :

- `400 invalid_message_groups` — sélection de groupe malformée, inconnue ou dupliquée.
- `400 invalid_client_id` — en-tête d'attribution malformé.
- `404` — session inconnue.
- `409 session_busy` — mutation de prompt ou d'historique active ; réessayez après sa fin.
- `409 worktree_reset_active` — cette session est remplacée par une réinitialisation de worktree ; raccrochez-vous à la session de remplacement.
- `409 message_groups_conflict` — l'instantané de sélection est obsolète ; récupérez les groupes à nouveau et exigez une nouvelle sélection avant de réessayer.
- `409 message_history_invalid` — l'historique ne peut pas être attribué de manière sûre ; changer seul le jeton de sélection ne peut pas le réparer.
- `400 unsupported_operation` / `422 session_message_deletion_unsupported` — le stockage session/espace de travail ne prend pas en charge cette opération ; rafraîchir et répéter la requête ne l'activera pas.
- `409 session_writer_conflict`, `409 session_writer_lost`, `409 session_transcript_changed`, ou `503 session_writer_unavailable` — la propriété exclusive de la transcription n'a pas pu être établie ou conservée.
- `503 message_deletion_context_unavailable` — la suppression **a persisté**, mais le contexte actif n'a pas pu être installé. Le corps JSON inclut `persisted: true`, `deletedGroupIds`, et `deletedPromptIds`. Réconciliez l'UI depuis l'historique autoritaire et rouvrez la session avant d'envoyer un autre prompt. Ne réessayez pas la suppression comme si rien n'avait été retiré ; les prompts ultérieurs restent refusés jusqu'à ce que la récupération de contexte réussisse.

Les mutations ultérieures dépendant de l'historique et les demandes de modèle pendant que la récupération du contexte est en attente renvoient 503 `session_history_context_unavailable` sans identités `persisted` ou de suppression. Le chargement ou la reprise de la session réessaie d'installer le contexte JSONL faisant autorité ; seule une installation réussie rouvre l'admission du modèle. La fermeture du cycle de vie reste disponible.

Après la persistance, la session publie `session_messages_deleted` avec les données `{sessionId, deletedGroupIds, deletedPromptIds}` et éventuellement `originatorClientId` sur l'**enveloppe d'événement**. Les identités internes de l'historique API ne sont pas publiées sur ce fil. Cet événement se produit également pour le chemin persisté-503. Les pairs doivent invalider l'état mis en cache de la transcription, de la navigation, de la recherche et de la sélection, et recharger l'historique faisant autorité. L'initiateur doit réconcilier à la fois les réponses HTTP réussies et les erreurs `persisted: true` ; il ne doit pas compter sur le traitement de son propre écho SSE.

### `POST /session/:id/recap`

Balise de capacité : `session_recap`. Bridge → extMethod ACP `qwen/control/session/recap`.

Génère un résumé d'une phrase « où en étais-je » de la session. Enveloppe le `generateSessionRecap` du cœur (`packages/core/src/services/sessionRecap.ts`), qui exécute une requête secondaire contre le modèle rapide avec les outils désactivés, `maxOutputTokens: 300`, et un format de sortie strict `<recap>...</recap>`. La requête secondaire lit l'historique de chat GeminiClient existant de la session et n'y **ajoute** rien.

Le corps de la requête est ignoré (envoyez `{}` ou vide). Porte de mutation non stricte — la posture reflète `/session/:id/prompt` (l'appel coûte des jetons mais ne modifie aucun état). Aucun événement SSE n'est publié.

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
- ou qu'une erreur sous-jacente du modèle s'est produite (l'assistant du cœur est best-effort et ne lève jamais d'exception).

Erreurs :

- `400 {code: 'invalid_client_id'}` — en-tête `X-Qwen-Client-Id` malformé.
- `404` — session inconnue.

Annulation : **aucune dans v1**. La route n'écoute pas la déconnexion du client HTTP, aucun `AbortSignal` n'est transmis au bridge, et l'enfant ACP exécute la requête secondaire jusqu'à son terme indépendamment de la déconnexion de l'appelant. Les seuls plafonds sont le délai de sécurité de 60s du bridge (`SESSION_RECAP_TIMEOUT_MS`) et la course fermée par transport contre la mort du canal ACP. C'est acceptable car le résumé est court (tentative unique, `maxOutputTokens: 300`, ~1–5s typiques) ; une méthode d'extension d'annulation basée sur l'ID de demande peut transmettre une annulation complète de bout en bout dans une future version si le coût en bande passante le justifie.

### `POST /session/:id/generate`

Balise de capacité : `session_generation`.

Exécutez une génération de texte portée par la requête depuis une invite fournie par l'appelant. La requête ne lit ni ne modifie l'historique de conversation et n'expose aucun outil. Elle préfère le modèle rapide configuré, revenant au modèle principal de la session si le modèle rapide est manquant ou ne peut être résolu. Le point de terminaison est agnostique quant à la tâche ; la traduction n'est qu'une seule invite possible définie par l'appelant.

Requête :

```json
{ "prompt": "Translate into Chinese: Hello" }
```

La réponse est `text/event-stream`. Le serveur écrit immédiatement un commentaire SSE initial, suivi de `started`, d'un événement de progression `thinking` facultatif, de zéro ou plusieurs événements `delta`, et de `done`. L'événement `thinking` ne contient aucun contenu de raisonnement. Une défaillance du modèle après le début du streaming produit un événement `error` ; il n'effectue pas de nouvelle tentative avec un autre modèle. Les prompts sont limités à 32 KiB de texte UTF-8. La déconnexion du client HTTP annule la demande de génération.

### `POST /session/:id/btw/stream`

Balise de capacité : `session_btw_stream`. Portée : propriétaire de session active.

Posez une question secondaire sans outil en utilisant le contexte de conversation de la session active, sans ajouter à sa transcription ni interrompre sa tâche principale. L'API JSON existante `POST /session/:id/btw` reste disponible avec son comportement original.

Requête :

```json
{ "question": "Why?", "requestId": "unique-request-id", "resume": false }
```

`question` est une chaîne non vide et épurée, limitée à 4096 caractères avant l'épuration. `requestId` contient 1 à 64 lettres ASCII, chiffres, underscores ou tirets. `resume` est facultatif et prend par défaut la valeur `false`. `X-Qwen-Client-Id`, lorsqu'il est fourni, doit nommer un client enregistré auprès de la session active. Chaque démarrage et reprise utilise le runtime propriétaire résolu ainsi que ses portes de confiance et de mutation.

La réponse est `text/event-stream`, avec `v: 1` sur chaque événement :

| Événement | Charge utile |
| -------- | --------------------------------------------------------------------------- |
| `answer` | `{ "type": "answer", "requestId": "...", "answer": "accumulated text" }`    |
| `done`   | `{ "type": "done", "requestId": "...", "answer": "trimmed complete text" }` |
| `error`  | `{ "type": "error", "requestId": "...", "code": "...", "message": "..." }`  |

Chaque `answer` remplace le texte précédent ; ce n'est pas un delta à ajouter. Les instantanés partiels préservent les espaces blancs ; `done` épure les espaces blancs au début et à la fin, correspondant au résultat BTW JSON existant. L'instantané initial peut être vide. `done` et `error` terminent le flux. Des commentaires de battement de cœur sont envoyés toutes les 15 secondes. Une réponse est limitée à 1 MiB de texte UTF-8 ; dépasser cette limite produit `btw_failed`. Le démon termine la génération après cinq minutes avec `btw_timeout` ; les délais de nettoyage des processus enfants et du pont permettent respectivement cinq et dix secondes supplémentaires. Une annulation explicite produit `btw_cancelled` ; les autres défaillances en amont produisent `btw_failed`.

La déconnexion HTTP détache uniquement l'abonné. Reconnectez-vous avec le même `requestId`, la même question et la même identité de client, et utilisez `resume: true` pour recevoir le dernier instantané sans démarrer un autre appel de modèle. Les soumissions initiales répétées avec la même identité réutilisent également le travail conservé. Aucun curseur d'événement ou `Last-Event-ID` n'est requis. Une demande `resume: true` dont l'entrée conservée est manquante renvoie 410 et ne démarre jamais un nouveau travail. Les demandes sont limitées par l'identité du pont, la session, le client et l'ID de demande ; elles ne peuvent pas reprendre après un redémarrage du démon ou un remplacement du runtime propriétaire.

Il y a au plus 32 demandes conservées par runtime propriétaire. Les reçus terminaux et les marqueurs d'annulation expirent après 60 secondes et peuvent être évincés plus tôt, les plus anciens en premier, pour admettre une nouvelle demande. Les demandes actives ne sont pas évincées. La génération ne maintient pas le verrou d'admission de l'archive partagée d'une session lors de l'attente du modèle ou de l'abonné ; l'activité du pont la protège toujours contre le nettoyage inactif. La fermeture explicite de la session et l'arrêt du démon conservent leur comportement d'annulation normal.

Erreurs avant le démarrage SSE :

- `400 invalid_btw_request` — question, ID de requête ou indicateur de reprise invalide.
- `400 invalid_client_id` — identité client malformée ou non enregistrée.
- `403 untrusted_workspace` — le propriétaire non primaire résolu n'est pas fiable.
- `404 session_not_found` — aucun propriétaire actif n'existe.
- `409 btw_request_conflict` — l'ID retenu appartient à une autre question.
- `410 btw_expired` — une reprise n'a aucune requête retenue.
- `429 btw_limit` — les 32 requêtes retenues sont toutes actives.
- `501 btw_stream_not_supported` — le pont du propriétaire ne peut pas diffuser BTW.

### `DELETE /session/:id/btw/stream/:requestId`

Balise de capacité : `session_btw_stream`. Portée : propriétaire de session active.

Annulez la demande BTW correspondante avec la même identité de session et de client utilisée pour la démarrer. Renvoie un `204` vide ; l'annulation est idempotente pour une demande conservée. L'identité exacte mise en cache peut annuler après que son client s'est détaché, tandis que les ID inconnus nécessitent un client encore enregistré. L'annulation d'un ID inconnu enregistre un marqueur d'annulation de courte durée afin qu'un POST initial retardé ne puisse pas démarrer de travail.

La route utilise la même résolution de propriétaire, les mêmes portes de confiance et de mutation que le POST de streaming. Les ID invalides renvoient `400 invalid_btw_request` ; les identités de client invalides renvoient `400 invalid_client_id`. Une annulation inconnue renvoie `429 btw_limit` lorsque les 32 demandes conservées sont toutes actives. Une demande active connue peut toujours être annulée même lorsque le runtime est à pleine capacité. L'annulation n'annule pas le prompt principal ni le BTW d'une autre session.

### Mutation : approbation, outils, compétences, init, redémarrage MCP

Le démon expose cinq routes de contrôle de mutation qui permettent aux clients distants de modifier la posture du runtime sans toucher à la CLI de l'hôte du démon. Le contrôle du mode d'approbation conserve sa porte de compatibilité non stricte. Le basculement d'outil, le basculement de compétence, l'initialisation de l'espace de travail et le redémarrage MCP utilisent la porte de mutation stricte : les demandes boucle locale principale approuvées, authentifiées par porteur et appariées Local Control passent. Une demande principale sans jeton qui atteint la porte sans autorité de boucle locale approuvée reçoit `401 {code: 'token_required'}` ; les identifiants configurés manquants ou invalides et les identifiants Local Control non appariés sont rejetés plus tôt avec un simple `401 Unauthorized`. Toutes les cinq :

- Acceptez et tamponnez l'en-tête `X-Qwen-Client-Id` (chaîne d'audit PR 7). Lorsque l'en-tête porte un ID approuvé, le démon émet `originatorClientId` sur l'événement SSE correspondant afin que les interfaces multi-clients puissent supprimer les échos de leurs propres mutations.
- Vérifiez chaque balise de capacité avant d'exposer la fonctionnalité. Un démon dépourvu de route retourne `404`. Pour les routes de paramètres Skill, l'absence de balise peut signifier à la place que les mêmes chemins servent le contrat retiré validé par catalogue : la route à cible unique peut retourner HTTP `404 skill_not_found` ou `409 skill_not_toggleable`, tandis que la route par lots retourne HTTP 200 avec des échecs dérivés du catalogue dans `errors[]`. N'utilisez pas la sonde de route comme vérification de version.

Les routes de basculement d'outil, de basculement de compétence, d'init et de redémarrage MCP émettent des événements **portée espace de travail** : chaque bus SSE de session active reçoit l'événement, quelle que soit la session attachée au moment où la mutation a été déclenchée. `approval-mode` émet un événement **portée session** car le changement est local au `Config` d'une seule session.

#### `POST /session/:id/approval-mode`

Balise de capacité : `session_approval_mode_control`. Pont → extMethod ACP `qwen/control/session/approval_mode`.

Modifiez le mode d'approbation d'une session active. Le nouveau mode arrive immédiatement dans le `Config` par session de l'enfant ACP et est restauré depuis la transcription de cette session lorsque l'enregistrement du chat est disponible. Le mode d'exécution sélectionné de Plan est restauré avec lui. Les paramètres de l'espace de travail NE SONT PAS écrits par défaut — passez `persist: true` pour écrire également `tools.approvalMode` dans les paramètres de l'espace de travail. Si l'enregistrement est désactivé ou dégradé, le mode reste limité à la session active.

Requête :

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` doit être l'un de `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` (miroir de l'enum `ApprovalMode` du cœur ; le SDK exporte `DAEMON_APPROVAL_MODES` pour la validation runtime). `persist` vaut par défaut `false`.

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
- `400 {code: 'invalid_persist_flag'}` — `persist` est non booléen.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — le mode demandé nécessite un dossier approuvé (les modes privilégiés dans les espaces de travail non approuvés sont rejetés par `Config.setApprovalMode` du cœur).
- `404` — session inconnue.

Événement SSE (portée session) : `approval_mode_changed` avec `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Balise de capacité : `workspace_tool_toggle`. IO fichier pur — aucun aller-retour ACP.

Basculez un nom d'outil dans la liste des paramètres `tools.disabled` de l'espace de travail. Les outils listés là ne sont **pas du tout enregistrés** (distinct de `permissions.deny`, qui garde l'outil enregistré et rejette l'invocation). Les outils intégrés et les outils découverts via MCP passent tous par `ToolRegistry.registerTool`, qui consulte l'ensemble désactivé.

> ⚠️ **Les noms doivent correspondre exactement à l'identifiant exposé par le registre.** Aucune résolution d'alias n'a lieu — la route stocke la chaîne présente dans le paramètre de chemin dans `tools.disabled`, et l'enfant ACP suivant compare avec `tool.name` au moment de l'enregistrement. Les intégrés utilisent leur nom canonique de registre (forme verbale snake_case) : `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch`, etc. — PAS les étiquettes d'affichage (`Shell`, `Read`, `Write`) présentées par la CLI. Les outils découverts via MCP utilisent la forme qualifiée `mcp__<server>__<name>` (qui est aussi la forme diffusée par les événements `tool_toggled` et listée par `GET /workspace/mcp`). Désactiver `Bash` N'EMPÊCHERA PAS `run_shell_command` de s'enregistrer lors de la prochaine session.

Les enfants ACP actifs conservent les outils déjà enregistrés — le basculement prend effet sur le **prochain** spawn d'enfant ACP. Combinez avec `POST /workspace/mcp/:server/restart` (pour les outils issus de MCP) ou la création d'une nouvelle session pour rendre le changement effectif dans le démon actuel.

Les noms d'outils inconnus sont acceptés : désactiver par avance un outil MCP pas encore installé est un cas d'utilisation légitime.

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

Événement SSE (portée workspace) : `tool_toggled` avec `{toolName, enabled, originatorClientId?}`.

#### Séparer les routes de configuration et d'exécution des Skills

Balise de capacité : `workspace_skills_config_runtime`.

`GET /workspace/config/skills` lit le propriétaire de la configuration globale locale au démon. `GET /workspaces/:workspace/config/skills` lit la configuration exacte du workspace enregistré et ne nécessite pas un runtime actif ou fiable. Les deux renvoient la forme normale de statut des Skills sans un `runtimeEpoch` requis :

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "skills": []
}
```

`GET /workspace/runtime/skills` et `GET /workspaces/:workspace/runtime/skills` lisent le runtime fiable sélectionné sans le démarrer. Un catalogue actif inclut la génération du runtime qui l'a produit :

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "runtimeEpoch": 4,
  "skills": []
}
```

L'installation et la suppression globales utilisent `POST /workspace/config/skills/install` et `DELETE /workspace/config/skills/:name?scope=global`. L'installation, la suppression et l'activation dans un workspace utilisent `POST /workspaces/:workspace/config/skills/install`, `DELETE /workspaces/:workspace/config/skills/:name?scope=workspace` et `POST /workspaces/:workspace/config/skills/:name/enable`. Les écritures de configuration valident l'état durable avant de planifier la réconciliation du runtime. Leur `activation` est `deferred` lorsqu'aucun runtime actuel ne peut être mis à jour et `reconciling` lorsqu'une mise à jour a été mise en file d'attente ; une bascule sans effet conserve l'activation de la façade au lieu d'affirmer qu'un rafraîchissement du runtime s'est produit.

La suppression de configuration renvoie `503 skills_config_unavailable` au lieu d'une réponse définitive de non-trouvé lorsque l'inventaire local des Skills du démon ne peut pas être énuméré. La suppression du runtime (`DELETE /workspace/skills/:name` et sa forme qualifiée par workspace) nécessite un catalogue fraîchement énuméré : elle renvoie le même `503 skills_config_unavailable` lorsque ni le catalogue du runtime ni l'énumération locale au démon ne produisent un catalogue initialisé, même si une observation conservée existe. `404 skill_not_found` signifie que le catalogue a été énuméré et que le nom n'y figure pas.

Le propriétaire de mutation singulier rejette la portée workspace avec `400 workspace_scope_requires_qualified_workspace` ; les mutations qualifiées rejettent la portée globale avec `400 global_scope_requires_singular_owner`. Les écritures qualifiées nécessitent un workspace fiable. Un pont injecté hérité renvoie `501 workspace_runtime_not_supported` pour les écritures de configuration qualifiées nécessitant une coordination du runtime. Les workspaces inconnus, supprimés, en transition et en vidange suivent les erreurs standard de workspace qualifié et ne reviennent jamais au primaire.

#### Installation d'archives natives de Skills et reçus

`skill_archive_install` et `skill_zip_file_source` annoncent les entrées ZIP natives et les requêtes de reçus correspondantes portées par le propriétaire. Les deux sont confinées à la surface de configuration moderne. Leurs `limits.maxSkillArchiveBytes`, `maxSkillArchiveExpandedBytes`, `maxSkillArchiveEntries` et `maxSkillArchiveManifestBytes` s'appliquent uniquement à ces deux sources : 50 MiB compressés, 200 MiB décompressés, 4096 enregistrements ZIP, et 32 MiB pour la racine effective `SKILL.md`. Les répertoires explicites et les métadonnées ignorées comptent comme des enregistrements avant filtrage ; les parents implicites ne comptent pas. Les métadonnées ignorées ne sont pas gonflées. Les limites héritées base64, répertoire et GitHub, y compris le parseur JSON de 10 MiB, restent inchangées.

- `POST /workspace/config/skills/install-archive?name=...&attemptId=...` installe globalement ; `/workspaces/:workspace/config/skills/install-archive` installe dans le workspace sélectionné. Envoyez `application/octet-stream` sans encodage de contenu HTTP. La route fixe la portée.
- Les routes d'installation JSON modernes existantes acceptent également `{ "name": "example", "scope": "global", "attemptId": "<UUID>", "source": { "type": "zip-file", "path": "/absolute/daemon/path.zip", "sha256": "<optional 64 hex digits>" } }`. Les routes qualifiées nécessitent `scope: "workspace"`. Le démon copie le fichier régulier ouvert dans le stockage privé et ne supprime ni ne renomme jamais le fichier de l'appelant. Gardez la source stable pendant la copie ; les vérifications de métadonnées seules ne constituent pas un instantané atomique.
- `GET /workspace/config/skills/install-attempts/:attemptId` et `GET /workspaces/:workspace/config/skills/install-attempts/:attemptId` interrogent le propriétaire original. Les réponses portent `running` (avec phase), `committed`, `not_committed` ou `recovery_required`. Des reçus manquants ou inaccessibles signifient que le résultat ne peut pas être confirmé. Les requêtes ne démarrent aucun runtime et n'acquièrent pas le coordinateur de mutation.

Le client fournit un UUID avant l'envoi ; le SDK peut le générer. Un ID dupliqué sous le même propriétaire renvoie 409 sans répéter l'installation. Deux opérations peuvent être actives par démon, y compris les attentes de verrouillage et le nettoyage ; toute admission supplémentaire renvoie 429 avec `Retry-After`. Il y a un budget de 120 secondes couvrant l'intégration du reçu jusqu'à l'admission de publication. L'annulation avant publication arrête l'opération ; après admission, la validation ou le retour arrière se termine même si la connexion HTTP disparaît.

Le succès conserve le résultat de mutation et l'activation, ajoutant `attemptId` et `archiveSha256`. Une échec d'activation post-validation est un `activationWarning`, pas une validation échouée. Les reçus sont des résultats historiques locaux au processus, conservés pendant dix minutes après la fin des travaux, avec une capacité de 256 et aucune éviction anticipée. Ils ne prouvent pas qu'une opération ultérieure n'a pas remplacé le contenu installé. Le redémarrage, l'expiration ou la perte d'accès au propriétaire rendent le résultat inconnu. Les clients doivent interroger après des échecs ambigus et ne doivent pas retransmettre automatiquement.

#### `POST /workspace/skills/refresh`

Balise de capacité : `workspace_session_refresh`. La forme qualifiée par workspace est `POST /workspaces/:workspace/skills/refresh`. La route singulière possède le runtime primaire ; la route qualifiée résout le runtime fiable sélectionné exact et ne revient jamais au primaire. Les deux utilisent la porte de mutation stricte et les vérifications d'identité client existantes.

Rechargez explicitement les paramètres et le contenu des Skills pour toutes les sessions actives, ou seulement pour les IDs de session fournis :

```json
{ "sessionIds": ["session-1", "session-2"] }
```

Omettre `sessionIds` rafraîchit toutes les sessions actives. Les IDs doivent être des chaînes non vides et sont dédupliqués dans l'ordre de la requête ; `[]` renvoie des compteurs à zéro sans rafraîchir les sessions ou les caches. Les formes de requête invalides renvoient HTTP 400. Les IDs inconnus et les IDs possédés par un autre workspace renvoient HTTP 404 avant tout début de rafraîchissement. Les sessions sélectionnées sont routées uniquement vers leurs canaux de moteur d'exécution propriétaires ; les canaux non liés ne reçoivent aucune commande de rafraîchissement.

Réponse (200) :

```json
{
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "configsRefreshed": 3,
  "configsFailed": 0,
  "reason": "all"
}
```

Les compteurs décrivent les sessions sélectionnées et les configurations partagées/session rafraîchies pour leurs canaux propriétaires. La sélection contrôle le rafraîchissement immédiat des sessions et les notifications de commandes ; les caches de canaux partagés peuvent changer, et les événements workspace restent à l'échelle du workspace. La requête explicite ne met pas à jour la révision ou la préparation du coordinateur de Skills. L'activation/désactivation, l'installation/suppression et la réconciliation automatique des Skills conservent leur comportement de rafraîchissement complet existant. Cette route n'ajoute pas `refreshRuntime` ou `sessionIds` aux corps de bascule des Skills.

#### `POST /workspace/skills/:name/enable`

Balise de capacité : `workspace_skill_settings_toggle`. La forme qualifiée par workspace est `POST /workspaces/:workspace/skills/:name/enable`.

Met à jour les paramètres de Skill de l'espace de travail pour un nom. Lors de l'activation, le démon résout d'abord les noms créés par des extensions contre une observation fraîche du catalogue, en contournant les données conservées et la limitation des lectures, et attend ACP ainsi que le repli local au démon si nécessaire ; si les deux sources fraîches échouent, une observation conservée est utilisée avant l'historique heuristique des noms. Les noms ne sont pas validés contre le catalogue. La désactivation ne lit pas le catalogue. Le nom de la requête tronqué est transmis à la persistance et renvoyé dans la réponse. L'activation d'un nom enregistre une option d'activation `skills.enabled` de l'espace de travail, même avant l'installation ; la désactivation supprime cette option d'activation et ajoute une entrée `skills.disabled` de l'espace de travail. Les entrées existantes pour les Skills qui ne sont plus chargées sont préservées, et les entrées dupliquées ou variantes de casse pour la cible sont fusionnées. Une entrée `skills.disabled` dure héritée d'une portée supérieure reste autoritaire pour la disponibilité effective, mais n'empêche pas la portée de l'espace de travail d'enregistrer ou de supprimer sa propre déclaration. Sinon, les déclarations de l'espace de travail participent à la résolution `skills.disabled > skills.enabled > skills.defaultDisabled` habituelle et peuvent remplacer les entrées `skills.defaultDisabled` ou `skills.enabled` de portées supérieures.

Ceci est différent de l'opération de skill géré ACP `qwen/skills/setEnabled` et du champ frontmatter `disable-model-invocation`. Pour un parent Extension actif, la disponibilité effective du Skill suit `skills.disabled` > `skills.enabled` > `skills.defaultDisabled` > remplacement interne de l'espace de travail > manifeste `skillStates` > activé. Les désactivations dures et par défaut retirent le skill de la disponibilité des commandes slash/modèle et rejettent l'exécution ultérieure du skill. `disable-model-invocation: true` maintient l'invocation directe par l'utilisateur disponible et masque uniquement le skill de l'invocation par le modèle.

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

`activation` reflète la vivacité de l'enfant et toute actualisation requise indépendamment de `changed`. Il vaut `applied` lorsqu'un enfant ACP est vivant et que toute actualisation requise réussit, `deferred` lorsqu'aucun enfant n'était vivant lors du contrôle de vivacité ou qu'une requête modifiée perd son enfant/session pendant l'actualisation requise, et `partial` lorsqu'au moins une autre actualisation requise échoue. Une opération sans effet peut donc être `applied` ou `deferred` avec `changed: false` ; lorsque `changed` est vrai et que l'activation est `deferred`, la déclaration persistée est utilisée lorsqu'un enfant démarre. Les sessions occupées sont incluses dans une actualisation requise. Le démon recharge les paramètres de l'espace de travail pour l'enfant ACP et chaque session active, notifie les consommateurs de SkillManager et pousse `available_commands_update`. Une requête déjà envoyée au modèle n'est pas réécrite ; les validations, instantanés de commandes et contextes de modèle ultérieurs utilisent le nouvel état. Si la persistance échoue, aucune actualisation ni événement n'est émis. Si l'actualisation d'une session échoue, le paramètre engagé est conservé. Lorsque l'enfant renvoie des résultats par session, les compteurs de sessions sont exacts. Si le contrôle d'actualisation lui-même échoue avant de renvoyer ces résultats, `sessionsFailed: 1` est une borne inférieure conservative indiquant que la requête d'actualisation a échoué.

Erreurs :

- `400 {code: 'invalid_skill_name'}` — paramètre de chemin vide, ou plus de 256 caractères.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` manquant ou non booléen.
- `403 {code: 'untrusted_workspace'}` — l'espace de travail sélectionné n'est pas approuvé.

La mutation réutilise l'événement `settings_changed` de portée espace de travail pour chaque clé modifiée (`skills.disabled` et/ou `skills.enabled`) ; elle n'ajoute pas de nouveau type d'événement. Chacun de ces événements inclut le même objet `mutation` : `{ id, kind: 'skill_toggle', skills: [{ name, enabled }], activation, sessionsRefreshed, sessionsFailed }`. `id` corrèle tous les événements de paramètres produits par une seule requête de bascule. `skills` liste les noms demandés et les valeurs d'activation demandées dont les déclarations de paramètres de l'espace de travail ont réellement changé ; un paramètre de portée supérieure peut laisser la disponibilité effective inchangée. Les cellules de statut des skills de l'espace de travail incluent des champs facultatifs `disabledReason: 'hard' | 'default' | 'inactive_extension'` et `lockedScope: 'system' | 'user' | 'systemDefaults'`.

#### `POST /workspace/skills/enable`

Balise de capacité : `workspace_skill_settings_batch_toggle`. La forme qualifiée par l'espace de travail est `POST /workspaces/:workspace/skills/enable`.

Met à jour les paramètres de Skill de l'espace de travail pour jusqu'à 100 noms en une seule requête ; la limite compte les entrées brutes `skillNames` avant la déduplication. Les noms sont tronqués et dédupliqués sans distinction de casse tout en préservant l'ordre de première occurrence et la casse. Lors de l'activation, le démon résout d'abord les noms créés par des extensions contre une observation fraîche du catalogue, en contournant les données conservées et la limitation des lectures, et attend ACP ainsi que le repli local au démon si nécessaire ; si les deux sources fraîches échouent, une observation conservée est utilisée avant l'historique heuristique des noms. Les noms ne sont pas validés contre le catalogue. La désactivation ne lit pas le catalogue. Elle applique toutes les modifications de déclaration résultantes en au plus une écriture verrouillée des paramètres et, si quelque chose a changé, actualise les sessions actives une fois. L'activation enregistre toujours une option d'activation explicite `skills.enabled` de l'espace de travail, y compris pour les noms non encore installés, afin de pouvoir remplacer une désactivation interne d'une Extension. Répéter une déclaration identique reste une opération sans effet. Les échecs inattendus de persistance ou de génération d'exécution font échouer toute la requête.

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
    },
    {
      "skillName": "missing",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": []
}
```

Les requêtes malformées renvoient HTTP 400 avec `invalid_skill_names`, `invalid_skill_name` ou `invalid_enabled_flag`. L'authentification, la confiance de l'espace de travail, l'identité du client, les échecs inattendus de persistance et les échecs de génération d'exécution font échouer toute la requête via les filtres de route standard. `errors` reste dans la réponse pour la compatibilité de transmission et est vide pour les noms structurellement valides. Les indicateurs de lot `activation`, `sessionsRefreshed` et `sessionsFailed` décrivent la vivacité de l'enfant et la seule actualisation de session vivante partagée par tous les résultats modifiés. Un lot où aucune cible n'a changé peut quand même répondre `applied` lorsqu'un enfant est vivant ou `deferred` lorsqu'il n'y en a aucun, correspondant à la réponse sans effet pour un seul Skill, donc déduisez ce qui a réellement changé à partir de l'indicateur `changed` de chaque résultat. Lorsqu'au moins une cible change, le démon émet les mêmes métadonnées de mutation `settings_changed` que la route pour un seul Skill ; chaque événement `skills.disabled` / `skills.enabled` de cette requête partage un seul `mutation.id`.

#### `PUT /skills/activation`

Capacité : `user_skill_activation` (annoncée lorsque la persistance des paramètres Utilisateur est disponible). Cette mutation globale au processus enregistre les préférences de Skill Utilisateur sans nécessiter d'espace de travail approuvé ni de scan des Skills installés. Elle utilise les filtres de mutation authentifiés habituels ; un `X-Qwen-Client-Id` facultatif doit appartenir à un environnement d'exécution encore géré, y compris un en cours de vidage.

```json
{
  "skillNames": ["rust:pdf", "go:review"],
  "state": "enabled"
}
```

Fournissez 1 à 100 noms (au plus 256 caractères chacun). Les noms sont tronqués et dédupliqués sans distinction de casse. `state` est `enabled` ou `disabled`. Seul `disabled` accepte `mode` : `hard` (par défaut) ou `default`. Les noms n'ont pas besoin d'être installés. Les lots invalides sont rejetés avant toute écriture.

Qwen lit les derniers paramètres Utilisateur sous son verrou d'écriture des paramètres, ajoute chaque nom explicite à `skills.enabled`, `skills.disabled` ou `skills.defaultDisabled`, et retire ce même nom des deux autres listes en une seule sauvegarde. Les autres noms, orthographes, portées et paramètres sont conservés. En particulier, activer `rust:pdf` ne supprime pas une restriction `pdf`. Les noms explicites bruts conservent les règles de correspondance existantes. Les restrictions système s'appliquent toujours.

```json
{
  "scope": "user",
  "state": "enabled",
  "results": [
    { "skillName": "rust:pdf", "changed": true },
    { "skillName": "go:review", "changed": true }
  ],
  "propagation": "queued"
}
```

Les réponses désactivées incluent également le `mode` normalisé. `propagation` décrit la planification, non la disponibilité mesurée : `queued` signifie qu'au moins un runtime actif a mis en file d'attente une actualisation ; `deferred` signifie que les paramètres enregistrés attendent le travail du cycle de vie du runtime ; `not_required` signifie que cette requête n'a rien modifié. Une opération sans effet n'écrit ni n'émet d'événements et ne certifie pas l'achèvement des actualisations précédentes. Consultez les points de terminaison de configuration de l'espace de travail existant et de statut Skill du runtime pour connaître l'état effectif.

Les modifications réussies invalident les caches de configuration et diffusent des événements `settings_changed` ordinaires avec `scope: "user"`. Les actualisations relisent atomiquement les paramètres Utilisateur et Espace de travail ; les échecs d'actualisation de configuration ou de session conservent le travail en attente pour la récupération du cycle de vie et les tentatives limitées. Le comportement d'actualisation existant propre à l'espace de travail reste inchangé.

Une entrée malformée renvoie HTTP 400 (`invalid_skill_names`, `invalid_skill_name`, `invalid_skill_activation_state` ou `invalid_skill_activation_mode`). Une génération de runtime primaire fermée avant la validation renvoie HTTP 503 avec `Retry-After: 1`, comme sur les routes de paramètres. Le SDK expose `setUserSkillsActivation(skillNames, activation, { clientId? })` et envoie une seule PUT sans lecture préalable de la configuration.

#### `POST /workspace/init`

Étiquette de capacité : `workspace_init`. E/S fichier pure — aucun aller-retour ACP, **aucune invocation LLM**.

Créez une structure vide pour `QWEN.md` (ou la substitution de paramètres `context.fileName` de l'espace de travail) à la racine de l'espace de travail principal du démon. Mécanique uniquement — pour un remplissage de contenu piloté par IA, faites suite avec `POST /session/:id/prompt`.

Par défaut, refuse d'écraser lorsque le fichier cible existe avec un contenu non vide. Les fichiers contenant uniquement des espaces blancs sont considérés comme absents (correspond à la commande slash `/init` locale).

Requête :

```json
{ "force": false }
```

Réponse (200) :

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` est `'created'` pour les nouvelles créations, `'noop'` lorsqu'un fichier existant contenant uniquement des espaces blancs a été laissé intact (aucune écriture effectuée), et `'overwrote'` lorsque `force: true` a remplacé un contenu non vide. L'événement SSE `workspace_initialized` reflète l'action de la réponse — les observateurs peuvent filtrer sur `action !== 'noop'` pour réagir uniquement aux changements réels sur disque.

Erreurs :

- `400 {code: 'invalid_force_flag'}` — `force` n'est pas booléen.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — le fichier existe avec un contenu non vide et `force` est omis/faux. Le corps contient le chemin absolu et la taille (octets) afin que les clients SDK puissent afficher une invite « écraser N octets ? » sans re-statuer.

Événement SSE (portée espace de travail) : `workspace_initialized` avec `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/reload`

Rechargez les paramètres MCP persistés dans la configuration de découverte de l'espace de travail et chaque session active. La forme qualifiée par l'espace de travail est `POST /workspaces/:workspace/mcp/reload`.

Corps de la requête :

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` est facultatif et prend par défaut `false`, préservant la réconciliation incrémentale. Lorsque vrai, le démon reconnecte chaque serveur MCP configuré éligible après la réconciliation des paramètres. Alternativement, passez `forceReconnectWhich: ["server-a", "server-b"]` pour reconnecter uniquement les serveurs nommés. Les options sont mutuellement exclusives. Une reconnexion forcée fait en sorte que chaque transport lit les identifiants qu'un autre processus local Qwen Code peut avoir écrits dans le stockage de jetons ; cela ne démarre pas un flux d'autorisation OAuth.

La route renvoie `202 { "accepted": true }` ; interrogez `GET /workspace/mcp` pour le statut de connexion final. Les valeurs d'options invalides renvoient 400.

#### `POST /workspace/mcp/:server/restart`

Étiquette de capacité : `workspace_mcp_restart`. Pont → extMethod ACP `qwen/control/workspace/mcp/restart`.

Redémarrez un serveur MCP configuré via `McpClientManager.discoverMcpToolsForServer` de l'enfant ACP (déconnexion + reconnexion + redécouverte). Pré-vérifie l'instantané du budget actif issu de la comptabilité de PR 14 v1 afin qu'un redémarrage sur un espace de travail saturé en budget renvoie un refus doux plutôt que de déclencher une cascade `BudgetExhaustedError`.

Le corps de la requête est vide (`{}`). Le paramètre de chemin est le nom du serveur encodé URL tel qu'il apparaît dans la config `mcpServers`.

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

Raisons de saut doux (toutes renvoient 200) :

| `reason` | Signification |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'` | Une autre découverte / redémarrage pour ce serveur est déjà en cours. La route revient immédiatement plutôt que d'attendre la promesse originale. L'appelant doit réessayer après un court délai. |
| `'disabled'` | Le serveur est configuré mais listé dans `excludedMcpServers`. Réactivez-le avant le redémarrage. |
| `'budget_would_exceed'` | Le démon est `--mcp-budget-mode=enforce`, le serveur cible n'est actuellement pas dans `reservedSlots`, et le total actif a atteint `clientBudget`. L'appelant doit libérer un emplacement d'abord. |

Erreurs (non-2xx) :

- `400 {code: 'invalid_server_name'}` — paramètre de chemin vide.
- `404` — nom du serveur absent de la config `mcpServers`, ou aucun canal ACP actif n'existe (un redémarrage nécessite intrinsèquement une instance `McpClientManager` active).
- `500` — erreur interne (par ex. `ToolRegistry` non initialisé).

Événements SSE (portée espace de travail) : `mcp_server_restarted` avec `{serverName, durationMs, originatorClientId?}` en cas de succès ; `mcp_server_restart_refused` avec `{serverName, reason, originatorClientId?}` en cas de saut doux.

#### `POST /workspaces/:workspace/language`

Synchronisation de la langue d'interface utilisateur de l'espace de travail sans session, enregistrée lorsque la persistance des paramètres est disponible. Propriété : runtime sélectionné. Résout l'identifiant de l'espace de travail ou le cwd absolu encodé, exige un runtime actif fiable et valide la propriété client contre ce runtime. Les générations inactives renvoient `503 workspace_runtime_unavailable` ; les sélecteurs non résolus ne reviennent jamais à l'espace de travail principal.

Requête : `{ "language": "zh" }`. La langue utilise les mêmes codes pris en charge que `POST /language`. Persiste uniquement le `general.language` de l'espace de travail sélectionné, puis lit son paramètre fusionné effectif et synchronise les canaux déjà actifs via `qwen/control/user/language` avec `scope: "workspace"`. Les canaux froids sont ignorés sans démarrer de processus ni créer de conversation. Les paramètres de langue de sortie et de modèle restent inchangés ; `syncOutputLanguage: true` est rejeté.

La réponse a la même forme que `POST /language`, avec `outputLanguage: null` ; `language` est la locale configurée effective (incluant `auto`) et `refresh` compte uniquement le runtime sélectionné. Un événement `language_changed` de l'espace de travail est émis en cas de succès. Le SDK expose `client.workspaceByCwd(cwd).setUiLanguage(language)` via REST, indépendamment du transport de session.

#### `POST /language`

Étiquette de capacité : `user_language_sync` (conditionnelle — annoncée uniquement lorsque la persistance des paramètres est disponible, même condition que `workspace_settings`). Bridge → ACP extMethod `qwen/control/user/language` par runtime fiable avec un canal actif.

Synchronisation de langue **au niveau utilisateur** sans session (issue #10234), pour les hôtes qui doivent changer de langue avant l'existence d'une session (par ex. une page d'accueil). Classification de propriété : globale au processus — elle modifie uniquement l'état global utilisateur (`~/.qwen/settings.json`, le global `~/.qwen/output-language.md`) ainsi qu'une actualisation best-effort du runtime, elle ne prend donc ni sélecteur d'espace de travail ni identifiant de session. Enregistrée derrière la porte non stricte `mutate()`, correspondant à son homologue `POST /session/:id/language`.

Le processus daemon est le seul écrivain : il persiste `general.language` (et, quand `syncOutputLanguage` est vrai, `general.outputLanguage` plus le global `output-language.md`) avant la diffusion. Chaque runtime fiable change ensuite sa propre langue d'interface utilisateur et recharge les paramètres de portée utilisateur depuis le disque ; quand `syncOutputLanguage` est vrai, il actualise également l'instruction système de chaque session locale. Différences par rapport à la route à portée de session :

- Les fichiers de langue de sortie liés au projet ne sont PAS réécrits — une session dont l'espace de travail possède son propre `.qwen/output-language.md` conserve cette substitution (la portée projet prime lors de l'actualisation).
- Zéro session et zéro canal runtime actif constituent un **succès**, pas une erreur ; un runtime sans canal actif est ignoré (non échoué) et lit les fichiers persistés lors de la prochaine ouverture de son canal.
- Les runtimes d'espace de travail non fiables sont ignorés, correspondant à la posture `403 untrusted_workspace` de la route de session.

Requête :

```json
{ "language": "zh", "syncOutputLanguage": true }
```

`language` doit être l'un des codes listés dans `/capabilities` `supportedLanguages` (plus `'auto'`) ; `syncOutputLanguage` a pour valeur par défaut `false`.

Réponse (200) :

```json
{
  "language": "zh",
  "outputLanguage": "Chinese",
  "refresh": { "runtimes": 1, "sessions": 2, "failed": 0 }
}
```

`language` est la locale d'interface utilisateur résolue par le daemon, donc une requête `'auto'` peut retourner une langue concrète ; les hôtes doivent lire le paramètre persisté `general.language` pour l'état du sélecteur. `outputLanguage` est `null` quand `syncOutputLanguage` était faux. `refresh.runtimes` compte les runtimes ayant appliqué le changement via un canal actif ; `refresh.sessions` somme les actualisations d'instructions système par session ; `refresh.failed` agrège les échecs d'actualisation par session et les runtimes en échec (la diffusion est best-effort et n'échoue jamais la requête après une persistance réussie).

Erreurs :

- `400 {code: 'invalid_language', allowed: [...]}` — code de langue inconnu.
- `400 {code: 'invalid_sync_flag'}` — `syncOutputLanguage` est non booléen.
- `400 {code: 'invalid_client_id'}` — `X-Qwen-Client-Id` n'est pas un client connu d'aucun runtime (l'en-tête est optionnel ; omettez-le lorsqu'aucune session n'existe).
- `500 {code: 'persist_error'}` — échec d'écriture du fichier de paramètres utilisateur ou de langue de sortie ; l'étape en échec et tout ce qui suit n'ont pas été exécutés (les étapes appliquées précédemment, telles que l'écriture `general.language`, ne sont pas annulées).
- `404` — le daemon est antérieur à la route, ou a été compilé sans persistance des paramètres (vérifiez l'étiquette de capacité).

Événement SSE (à portée d'espace de travail, sur les bus de session de chaque runtime) : `language_changed` avec `{language, outputLanguage, userLevel: true, originatorClientId?}`. Le marqueur `userLevel: true` distingue cette diffusion de l'événement par session de la route de session, qui porte `sessionId` à la place.

### `GET /session/:id/events` (SSE)

Abonnez-vous au flux d'événements de la session.

En-têtes :

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
X-Qwen-Event-Epoch: ...  ← optional, pairs the cursor with its bus epoch
X-Qwen-Client-Id: ...    ← optional client identity and diagnostic correlation
```

Paramètres de requête :

| Paramètre | Requis | Notes |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | non | Limite de **rétrologique de trames actives** par abonné. Plage `[16, 2048]`, défaut 256. Les trames de relecture forcées lors de l'abonnement sont exemptes des limites de trames et d'octets ; ce qui les consomme réellement sont les événements actifs arrivant pendant que l'abonné draine encore une grande relecture `Last-Event-ID: 0`. Augmentez-la pour les reconnexions à froid afin que la queue active ne déclenche pas l'avertissement / éviction de client lent avant que le consommateur ne rattrape son retard. La limite d'octets sérialisés actifs est fixée côté daemon (défaut 2 MiB) et n'a pas de paramètre de requête. Les valeurs hors plage / non décimales / présentes mais vides retournent `400 invalid_max_queued` avant l'ouverture du handshake SSE. Pré-vol `caps.features.slow_client_warning` — les anciens daemons ignorent silencieusement le paramètre. |
| `connectReason` | non | Indice diagnostique signalé par le client : `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync`, ou `unknown`. Les valeurs invalides se normalisent en `unknown` et ne rejettent jamais le handshake. Le daemon n'utilise pas ce champ pour l'authentification, la relecture, l'éviction, la déduplication ou le remplacement de flux. |
| `previousStreamId` | non | UUID du flux REST/SSE accepté précédent signalé par le client. Les valeurs invalides sont ignorées. Ceci est une lignée best-effort uniquement et ne change jamais le comportement du flux. |

Un handshake réussi inclut `X-Qwen-SSE-Stream-Id: <uuid>`. Les passerelles navigateur doivent préserver cet en-tête de réponse et l'exposer via `Access-Control-Expose-Headers`. Les anciens daemons ou intermédiaires peuvent l'omettre ; les clients doivent continuer normalement et traiter la lignée comme indisponible. L'id identifie cette connexion physique REST/SSE et corrèle son cycle de vie daemon, ses diagnostics de file d'attente et sa trace de requête.

Format de trame. La ligne `data:` est l'**enveloppe complète de l'événement**, sérialisée en JSON sur une seule ligne — `{id?, v, type, data, originatorClientId?}`. La charge utile spécifique ACP (arguments `sessionUpdate`, `requestPermission`, etc.) se trouve sous le champ `data` de l'enveloppe ; le `type` de l'enveloppe correspond à la ligne SSE `event:`.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← terminal frame for byte overflow, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

Les lignes SSE de niveau `id:` / `event:` dupliquent `envelope.id` / `envelope.type` pour la compatibilité EventSource. Les consommateurs Raw-`fetch` (le `parseSseStream` du SDK) lisent tout depuis l'enveloppe JSON et ignorent les lignes préliminaires SSE.

| Type d'événement | Déclencheur |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update` | Toute notification ACP `sessionUpdate` (chunks LLM, appels d'outils, usage) |
| `permission_request` | L'Agent a demandé l'approbation d'un outil |
| `permission_resolved` | Un client a voté sur une permission via `POST /permission/:requestId` |
| `permission_partial_vote` | (consensus uniquement) Un vote a été enregistré mais le quorum n'est pas encore atteint. Porte `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pré-vol `caps.features.permission_mediation`. |
| `permission_forbidden` | Un vote a été rejeté par la politique active (incohérence `designated`, `local-only` non-loopback, ou électeur `consensus` absent du snapshot). Porte `{requestId, sessionId, clientId?, reason}`. Pré-vol `caps.features.permission_mediation`. |
| `model_switched` | `POST /session/:id/model` a réussi |
| `model_switch_failed` | `POST /session/:id/model` rejeté |
| `session_died` | L'enfant Agent a planté de manière inattendue. **Terminal : le flux SSE se ferme après cette trame ; la session a disparu de `byId`.** Les abonnés doivent se reconnecter via `POST /session` pour en générer une nouvelle. |
| `slow_client_warning` | Local à l'abonné : file d'attente de trames en direct ou file d'attente d'octets sérialisés en plein ≥ 75 % pleine. **Non terminal** — le flux continue ; l'avertissement est un signal précurseur avant éviction. Contient `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}` où `threshold` est `frames`, `bytes` ou `frames_and_bytes`. Déclenché UNE FOIS par épisode de débordement ; réarmé après que les deux mesures sont descendues sous 37,5 %. Pas de `id` (synthétique). Pré-vol `caps.features.slow_client_warning`. |
| `client_evicted` | Local à l'abonné : débordement de la file d'attente. `reason` est `queue_overflow` pour la limite de trames en direct et `queue_bytes_overflow` pour la limite d'octets sérialisés en direct. **Terminal : le flux SSE se ferme après cette trame** (pas de `id` — synthétique). Les autres abonnés sur la même session continuent. |
| `stream_error` | Erreur côté démon lors de la diffusion. **Terminal : le flux SSE se ferme après cette trame** (pas de `id` — synthétique). |

Sémantique de reconnexion :

- Envoyez `Last-Event-ID: <n>` pour rejouer les événements avec `id > n` depuis l'anneau par session (profondeur par défaut **8000**, ajustable via `qwen serve --event-ring-size <n>`).
- **Détection de lacune :** dans la même époque, si le premier identifiant conservé de l'anneau est supérieur à `<n> + 1`, le démon émet une trame `state_resync_required` sans identifiant avec `reason: 'ring_evicted'` avant de rejouer le suffixe survivant. Les autres raisons sont `epoch_reset`, `seeded_replay_not_in_ring` et `replay_budget_exceeded` ; le signal de budget suit le préfixe de rejeu livré. Voir [raisons de resynchronisation et ordonnancement](./daemon/09-event-schema.md#resync-reasons-and-ordering) pour leurs déclencheurs, champs de curseur et règles de récupération.
- Le SDK verrouille `awaitingResync` ; les clients doivent appeler `POST /session/:id/load` et reconstruire à partir de la fenêtre actuelle de rejeu bornée. Cette fenêtre peut elle-même commencer par `history_truncated` lorsque des entrées de rejeu en mémoire plus anciennes ont été supprimées ; ce marqueur est informatif et ne doit pas démarrer une autre boucle de resynchronisation. Son ancre de pagination optionnelle est [figée à l'éviction de la fenêtre de rejeu](./daemon/09-event-schema.md#history-truncation-anchor).
- Les identifiants sont monotones au sein de l'époque du bus d'événements d'une session, commençant à 1. Une publication rejetée ne doit pas consommer un identifiant ; voir [invariants de séquence d'événements](./daemon/09-event-schema.md#state-and-forward-compatibility).
- Les trames synthétiques (`client_evicted`, `slow_client_warning`, `stream_error`, `state_resync_required`, `replay_complete`) omettent intentionnellement `id` afin de ne pas brûler un créneau de séquence pour les autres abonnés. `replay_complete` marque la fin du rejeu, y compris un rejeu vide ou incomplet ; cela ne signifie pas que la resynchronisation est terminée.

Contre-pression :

- La file d'attente par abonné utilise par défaut `maxQueued: 256` éléments en direct plus une limite de 2 Mio d'octets sérialisés en direct possédée par le démon. Les trames de rejeu lors de la reconnexion, `slow_client_warning` et `client_evicted` contournent ces deux limites.
- Remplacez uniquement la limite de trames via `?maxQueued=N` (plage `[16, 2048]`) sur la requête SSE. Il n'y a délibérément pas de `?maxQueuedBytes` ; les clients ne peuvent pas augmenter le budget mémoire du démon.
- Lorsque la file d'attente de trames en direct ou la file d'attente d'octets en direct d'un abonné dépasse 75 % de remplissage, le bus force l'envoi d'une trame synthétique `slow_client_warning` à cet abonné (une fois par épisode de débordement ; réarmé après que les deux mesures sont descendues sous 37,5 %). Le flux reste ouvert — l'avertissement est un signal précurseur permettant au client de vider plus rapidement ou de se déconnecter + reconnecter proprement.
- Si la limite de trames en direct déborde, le bus émet `client_evicted` avec `reason: "queue_overflow"`. Une file d'attente en direct vide admet un événement surdimensionné inchangé. Avant de rejeter un débordement d'octets dans une file non vide, le bus peut supprimer la copie entière de l'application MCP `rawOutput.html` vers `''` lorsque son `fallbackText` est non vide. Si cette copie tient, la livraison continue sans éviction ni signal de resynchronisation. Sinon, il émet `reason: "queue_bytes_overflow"`. Lors de chaque éviction, la trame terminale est forcée et la subscription se ferme.
- Cette dégradation optionnelle de l'Application affecte uniquement la livraison en file d'attente. La livraison directe et l'anneau de rejeu conservent l'original ; la fenêtre de rejeu compactée applique son propre budget. La copie dégradée porte le même identifiant d'événement que l'entrée originale de l'anneau. Par conséquent, une charge utile livrée portant un identifiant n'a pas besoin d'être égale à la charge utile de l'anneau, et reprendre après cet identifiant ne récupérera pas son HTML. Les clients nécessitant le document doivent explicitement recharger la transcription persistée, qui est également soumise aux limites de taille de page.

### `POST /session/:id/permission/:requestId`

Exprimez le même vote documenté ci-dessous, mais routez-le via le runtime qui possède la session active nommée. Les nouvelles intégrations multi-espaces de travail doivent utiliser cette forme plutôt que la route héritée globale au processus. Pré-vol `caps.features.session_permission_vote`.

Le corps de la demande, les politiques de médiation, les résultats et la réponse de succès sont identiques à `POST /permission/:requestId`. L'en-tête facultatif `X-Qwen-Client-Id` participe à la politique désignée et de consensus. Les échecs utilisent des valeurs `code` stables là où indiqué ; une entrée mal formée et une course perdue de demande en attente peuvent omettre `code` :

- `400` — un corps de vote mal formé (pas de `code`) ou une identité de client invalide (`invalid_client_id`), ou `invalid_option_id` lorsque l'option sélectionnée n'était pas proposée. Relisez les options proposées au lieu de retenter le même vote.
- `403` — `permission_forbidden` lorsque la politique active rejette le votant, ou `untrusted_workspace` lorsqu'un espace de travail propriétaire non principal n'est pas approuvé. Un propriétaire principal non approuvé est exempté de ce contrôle d'approbation et le vote peut être accepté.
- `404` — `session_not_found` lorsqu'aucun propriétaire actif n'existe, ou `code` lorsque la requête n'est pas en attente.
- `500` — `cancel_sentinel_collision` lorsque le `allowedOptionIds` de l'agent contient le sentinel réservé `__cancelled__`, ou `ambiguous_session_owner` lorsque plusieurs espaces de travail revendiquent la session.
- `501` — `permission_policy_not_implemented` pour une politique que cette version ne met pas en œuvre.
- `503` — `workspace_runtime_unavailable` lorsque le runtime propriétaire est indisponible, ou `daemon_draining` lorsque le démon n'accepte plus de travaux.

Il ne tente jamais de nouveau contre le pont principal. La méthode du SDK TypeScript est `respondToSessionPermission()`.

### `POST /permission/:requestId`

Émettez un vote sur un `permission_request` en attente. La **politique de médiation** active décide qui gagne :

| Politique | Comportement |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (par défaut) | Tout votant validé gagne ; les votants suivants obtiennent `404`. Base pré-F3. |
| `designated` | Seul l'initiateur du prompt (`originatorClientId`) décide ; les non-initiateurs obtiennent `403 permission_forbidden / designated_mismatch`. Repli sur le premier répondant pour les prompts anonymes. |
| `consensus` | N sur M électeurs doivent être d'accord (par défaut `N = floor(M/2) + 1`, modifiable via `policy.consensusQuorum`). La première option à atteindre `N` l'emporte. Les votes non résolus génèrent des trames SSE `200` + `permission_partial_vote`. |
| `local-only` | Seuls les électeurs en boucle locale décident ; les appelants distants reçoivent `403 permission_forbidden / remote_not_allowed`. |

La politique active est configurée dans `settings.json` sous `policy.permissionStrategy` et exposée sur `/capabilities` à `body.policy.permission`. Vérification préalable de `caps.features.permission_mediation` (avec `modes: [...]`) pour l'ensemble pris en charge par la build.

> **F3 (#4175) : coordination des permissions multi-clients.** F3 a ajouté les quatre politiques ci-dessus. Les démons pré-F3 utilisaient en dur le premier répondant ; la forme du protocole reste identique bit pour bit lorsque la politique configurée est `first-responder`. Les nouveaux événements (`permission_partial_vote`, `permission_forbidden`) sont additifs — les anciens SDK les voient comme `unrecognized_known_event` et les ignorent gracieusement.

> **Délai d'expiration des permissions (désactivé par défaut).** Un `permission_request` reste en attente jusqu'à : (a) qu'un client vote ici, (b) que `POST /session/:id/cancel` se déclenche, (c) que le client HTTP pilotant l'invite se déconnecte (l'annulation en cours d'invite résout les permissions en attente comme `cancelled`), (d) que la session soit tuée, (e) que le démon s'arrête, **ou (f) que son délai configuré se déclenche**. Lors du déclenchement du délai, le `requestPermission` de l'agent est résolu comme `{outcome: 'cancelled'}`, l'anneau d'audit enregistre une entrée `permission.timeout`, stderr du démon émet un repère sur une ligne, et le bus SSE diffuse la trame standard `permission_resolved` annulée afin que les abonnés effectuent le nettoyage. Le délai partagé est configurable via `BridgeOptions.permissionResponseTimeoutMs` ou `qwen serve --permission-response-timeout-ms`. Sa valeur par défaut est `0`, donc les permissions ordinaires et les `ask_user_question` attendent indéfiniment une décision humaine. L'annulation par le votant, l'annulation de la session, le nettoyage après déconnexion et l'arrêt du démon résolvent toujours les interactions en attente comme annulées.

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

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — accepter / refuser / continuer une fois / etc., selon les choix offerts par l'agent
- `{ "outcome": "cancelled" }` — abandonner la requête (correspond à ce que font internement `cancelSession` / `shutdown`)

Réponse :

- `200 {}` — votre vote a été accepté (résolu OU enregistré sous quorum de consensus)
- `400` — un corps de vote malformé (sans `code`), `invalid_client_id`, ou `invalid_option_id` lorsque l'option sélectionnée n'était pas proposée ; relisez les options proposées au lieu de réessayer le même vote
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3 : la politique active a rejeté votre vote
- `404 { "error": "..." }` — le requestId est inconnu (déjà résolu, jamais existé, ou session détruite)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3 : le `allowedOptionIds` de l'agent contient le sentinel réservé `'__cancelled__'` ; violation du contrat agent / démon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 compatibilité future : un littéral de politique est arrivé dans le schéma mais sa branche de médiation n'est pas encore construite (actuellement inaccessible ; réservé aux futures politiques)

Après un vote réussi, chaque client connecté voit `permission_resolved` avec le même `requestId` et la `outcome` choisie. Sous `consensus`, les votes intermédiaires diffusent également `permission_partial_vote` jusqu'au quorum.

### Routes d'autorisation device-flow (issue #4175 PR 21)

Le démon négocie une autorisation d'appareil OAuth 2.0 (RFC 8628) afin qu'un client SDK distant puisse déclencher une connexion dont les jetons arrivent sur le système de fichiers du **démon** — et non sur celui du client. Le démon interroge lui-même l'IdP ; le seul rôle du client est d'afficher l'URL de vérification + le code utilisateur et (facultativement) de s'abonner aux événements SSE de complétion.

Tag de capacité : `auth_device_flow` (toujours annoncé). Fournisseurs pris en charge dans v1 : `qwen-oauth`.

> [!note]
>
> Pour les nouvelles intégrations, utilisez [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli). `GET /auth/subscription?paywallScene=cli` renvoie le lien d’achat dans `plansUrl`. Lancez séparément la connexion dans le navigateur avec `POST /auth/subscription/flows?paywallScene=cli`, puis interrogez `GET /auth/subscription/flows/:id` jusqu’à obtenir `authorizationUrl`.
>
> La formule gratuite Qwen OAuth a pris fin le 15 avril 2026. `qwen-oauth` est l’ancien identifiant de fournisseur v1 pour les routes ci-dessous.

**Localité d'exécution.** Le démon ne lance jamais de navigateur — même s'il le peut. Le client décide s'il appelle `open(verificationUri)` localement ; sur un pod sans interface graphique (le déploiement canonique Mode B), l'utilisateur ouvre l'URL sur l'appareil où il dispose d'un navigateur. Voir `docs/users/qwen-serve.md` pour l'UX recommandée.

**Aucune fuite de jeton dans les événements.** `auth_device_flow_started` ne transporte que `{deviceFlowId, providerId, expiresAt}`. Le code utilisateur et l'URL de vérification reviennent point à point dans le corps POST 201 et via `GET /workspace/auth/device-flow/:id` ; ils ne sont jamais diffusés sur SSE.

**Singleton par fournisseur.** Un second `POST` pour le même fournisseur pendant qu'un flux est en attente est une reprise idempotente — il retourne l'entrée existante avec `attached: true` plutôt que de démarrer une nouvelle requête IdP.

#### `POST /workspace/auth/device-flow`

Porte de mutation stricte : les requêtes primaires sans jeton depuis une boucle locale fiable passent. Une requête primaire sans jeton qui atteint la porte sans autorité de boucle locale fiable reçoit `401 token_required` ; les identifiants configurés manquants ou invalides et les identifiants Local Control non appariés sont rejetés plus tôt avec un simple `401 Unauthorized`.

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
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device?entry=qwen_code&paywallScene=cli",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1&entry=qwen_code&paywallScene=cli",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

Erreurs :

- `400 unsupported_provider` — `providerId` inconnu (la réponse inclut `supportedProviders`)
- `409 too_many_active_flows` — limite d'espace de travail (4) atteinte ; annulez-en un avec `DELETE`
- `401 token_required` — la porte stricte a refusé une requête primaire sans jeton sans autorité de boucle locale fiable
- `502 upstream_error` — l'IdP a renvoyé une erreur inattendue

#### `GET /workspace/auth/device-flow/:id`

Lire l'état actuel. Les entrées en attente renvoient `userCode/verificationUri/expiresAt/intervalMs` ; les entrées terminales (grâce de 5 min) les suppriment et exposent `status` + `errorKind/hint` facultatif.

Retourne `404 device_flow_not_found` pour les ids inconnus et les entrées évictées après la grâce.

#### `DELETE /workspace/auth/device-flow/:id`

Annulation idempotente :

- entrée en attente → `204` + émission de `auth_device_flow_cancelled`
- entrée terminale → no-op `204` (pas de réémission d'événement)
- id inconnu → `404`

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

#### Événements SSE device-flow

Cinq événements typés (portée espace de travail, diffusés vers chaque bus de session actif) :

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST réussi ; le SDK doit s'abonner (pas de userCode ici, récupérer via GET si nécessaire)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — le daemon a respecté le `slow_down` en amont ; les clients effectuant un polling GET doivent augmenter leur intervalle pour correspondre
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — identifiants persistés ; `accountAlias` est une étiquette non-PII (jamais email/téléphone)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — terminal ; `errorKind` est l'un des `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` est interne au daemon : l'échange avec l'IdP a réussi mais le daemon n'a pas pu stocker durablement les identifiants (EACCES / EROFS / ENOSPC). L'utilisateur doit réessayer une fois la condition sous-jacente du disque corrigée.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE réussi sur une entrée en attente

> **Non compatible MCP.** La spécification d'autorisation MCP (2025-06-18) impose OAuth 2.1 + code d'autorisation PKCE avec un callback de redirection, ce qui ne fonctionne pas pour les daemons de pods sans interface graphique. La surface device-flow du Mode B est privée au daemon — les clients ciblant des serveurs conformes à MCP doivent utiliser un autre chemin d'authentification.

### Téléversement par morceaux de pièces jointes de session attachée

Capacité : `session_attachment_chunk_upload`. Les quatre routes ci-dessous sont des mutations appartenant au runtime de la session active. Elles utilisent le bearer existant et les en-têtes `X-Qwen-Client-Id` optionnels. Un téléversement appartient à son store de session créateur et à l'identité client exacte ; une identité omise est distincte d'un client nommé.

Soit `U = /session/:id/attachment-uploads` :

| Requête | Corps | Réponse |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST U` | JSON `{ name, mimeType, size }`, au maximum 4 KiB | 201 `{ uploadId }` |
| `POST U/:uploadId/chunks?offset=N` | Brut `application/octet-stream`, au maximum 512 KiB | 200 `{ offset }`, décalage octet suivant |
| `POST U/:uploadId/complete` | Pas de corps nécessaire ; un corps JSON est analysé et ignoré | 200 référence de pièce jointe existante `{ type, attachmentId, mimeType, size }` |
| `DELETE U/:uploadId` | Vide | 204 pour les téléversements en réception, échoués ou absents ; 409 pendant la finalisation ou après finalisation |

La taille maximale de la pièce jointe reste de 8 MiB. Les métadonnées suivent les règles existantes concernant le nom de fichier/MIME ; les fichiers image vides sont invalides. Envoyez des morceaux séquentiels de 512 KiB, avec un reste exact pour le dernier morceau. Seul le morceau immédiatement précédent peut être réessayé avec le même décalage, longueur et octets. Les lacunes, chevauchements, tentatives modifiées ou finalisations prématurées renvoient 409 ; les entrées malformées renvoient 400, les entrées trop volumineuses 413, et le type de média de morceau non pris en charge ou le jeu de caractères JSON non pris en charge renvoient 415 `invalid_attachment_upload_content_type`. Les encodages de requête non pris en charge sur les requêtes de création et de morceau renvoient 415 `invalid_attachment_upload_encoding`. Les IDs de téléversement inconnus, expirés ou appartenant à d'autres propriétaires renvoient 404 sur les trois routes POST ; DELETE renvoie 204 pour les téléversements absents et 409 pendant ou après la finalisation. Les requêtes de création et de morceau n'acceptent pas de corps compressés. La route de finalisation utilise l'analyseur JSON global, donc un corps JSON compressé valide peut être ignoré, tandis qu'un JSON malformé est rejeté avant la finalisation.

La finalisation valide la propriété session/client/runtime avant et après le stockage. Une finalisation concurrente ou répétée renvoie le même résultat sans nouvelle écriture. Une copie de session concurrente renvoie temporairement `503 attachment_upload_store_busy` avec `retryable: true` ; les octets mis en mémoire tampon restent disponibles pour la finalisation avec le même ID de téléversement après la fin de la copie. Les échecs de stockage réels restent terminaux pour cet ID de téléversement. Les téléversements en réception expirent cinq minutes après la création. Les reçus de succès/échec expirent après cinq minutes et sont limités à 1024 par processus daemon. La fermeture/suppression de session et la désinscription finale du client invalident les téléversements non terminés. Seules les pièces jointes finalisées peuvent être lues, référencées ou copiées. Un DELETE ne peut pas annuler une pièce jointe déjà en cours de finalisation ou finalisée ; un fichier finalisé peut rester après une perte de réponse.

La mise en mémoire tampon est limitée à 128 MiB et 32 téléversements actifs dans tous les runtimes d'un processus, avec au maximum huit téléversements actifs par store de session. L'épuisement renvoie `429 attachment_upload_capacity_exceeded` ; les limites de débit de requête existantes s'appliquent également. Ceci est une limite de tampon de mise en mémoire tampon, pas la mémoire totale du processus. Les IDs temporaires ne survivent pas à un redémarrage du daemon.

Le SDK TypeScript utilise automatiquement ce protocole pour les pièces jointes supérieures à 512 KiB lorsqu'il est annoncé, avec deux fichiers simultanés par client et des morceaux séquentiels. Il utilise REST authentifié même avec les transports ACP, met en cache la découverte valide pendant 60 secondes, et conserve le point de terminaison brut existant pour les fichiers plus petits et les daemons plus anciens. La tentative de re-finalisation se fait au plus deux fois après des erreurs réseau, des délais d'expiration de requête ou des 502/503/504 ; les tentatives de limitation de débit respectent `Retry-After` dans un délai d'opération de cinq minutes. Les échecs de création ambigus et les échecs de capacité ne sont pas réessayés. Les téléversements échoués obtiennent une tentative indépendante de nettoyage de deux secondes. `DaemonAttachmentUploadError` préserve la cause et `httpStatus` ; son `status` omet le 404 interne au téléversement afin que les consommateurs ne le confondent pas avec un routage de pièce jointe héritée non pris en charge.

Voir la [conception complète](../design/session-attachment-chunk-upload.md) pour les détails du cycle de vie et de compatibilité.

### Rechargement du catalogue de modèles

La capacité `workspace_model_reload` annonce `POST /workspaces/:workspace/models/reload`. Cette mutation authentifiée, fiable et de runtime sélectionné relit les paramètres de portée utilisateur et espace de travail, actualise la superposition d'environnement du runtime sélectionné, et réapplique l'environnement dans son enfant ACP avant de reconstruire la configuration du fournisseur de modèle. Les modifications d'environnement prennent en charge les identifiants de fournisseur et peuvent inclure d'autres clés d'environnement ; elles ne sont pas signalées dans la réponse ni dans un événement de paramètre. L'environnement du processus daemon et l'activation du workflow restent inchangés. Il renvoie `{ "status": "applied" | "deferred" | "failed" }` ; `deferred` signifie qu'aucun enfant ACP actif n'a appliqué le catalogue. Il ne récupère pas un catalogue de plateforme, n'écrit pas de paramètres, ne change pas le modèle de conversation actif, ni ne diffuse un événement de paramètre. Lire le `/session/:id/context` d'une session existante ensuite pour ses modèles sélectionnables actuels ; avant la création de session, lire les fournisseurs de l'espace de travail sélectionné. Les runtimes inconnus, non fiables, en vidange ou fermés ne reviennent pas au primaire.

## Format de flux sur le réseau

Les événements sont émis sous forme de trames EventSource standard. Le daemon écrit une ligne `data:` par trame (le JSON n'a pas de nouvelles lignes incorporées après `JSON.stringify`) ; l'analyseur SDK dans `packages/sdk-typescript/src/daemon/sse.ts` gère à la fois cela et la forme multi-`data:` autorisée par la spécification côté réception.

## Trames d'erreur pendant le streaming

Si l'itérateur de pont lève une exception lors du service d'un abonné SSE, le daemon émet une trame terminale `stream_error` (sans `id`). La ligne `data:` est l'enveloppe complète (même forme que toutes les autres trames SSE dans ce doc) ; le message d'erreur réel se trouve sous `envelope.data.error` :

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

La connexion se ferme ensuite.

## Variables d'environnement

| Variable | Objectif |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Jeton Bearer. Les espaces de début/fin sont supprimés au démarrage. |

## Structure du code source

| Chemin | Objectif |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts` | Commande yargs + schéma des options |
| `packages/cli/src/serve/run-qwen-serve.ts` | Cycle de vie de l'écouteur + gestion des signaux |
| `packages/cli/src/serve/server.ts` | Assemblage de l'app Express, ordre des middlewares et routes directes restantes |
| `packages/cli/src/serve/routes/*.ts` | Groupes de routes Express ciblés, incluant les routes de session, SSE, authentification d'espace de travail, statut d'espace de travail et fichiers |
| `packages/cli/src/serve/auth.ts` | Bearer + liste blanche Host + refus CORS |
| `packages/cli/src/serve/acp-session-bridge.ts` | Façade de compatibilité de pont local CLI pour spawn-or-attach, FIFO par session et registre des permissions |
| `packages/acp-bridge/src/status.ts` | Types de transport en lecture seule pour le statut du démon + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts` | Fonction utilitaire pure qui construit les charges utiles `/workspace/env` à partir de l'état `process.*`, incluant la censure des identifiants |
| `packages/acp-bridge/src/eventBus.ts` | File d'attente asynchrone bornée + anneau de relecture |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | Client TS |
| `packages/sdk-typescript/src/daemon/sse.ts` | Analyseur de trames EventSource |
| `integration-tests/cli/qwen-serve-routes.test.ts` | 18 cas, sans LLM |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 cas, processus enfant réel `qwen --acp` adossé au faux serveur OpenAI local (POSIX uniquement ; ignoré sous Windows) |
