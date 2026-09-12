# Référence de l'API REST du démon

C'est l'interface REST/SSE publique pour les intégrations qui exécutent
`qwen serve --no-web` et fournissent leur propre interface utilisateur. Commencez par le
[guide d'intégration](./rest-api-integration.md), puis utilisez cette page pour la découverte
des endpoints et la [référence du protocole HTTP](./qwen-serve-protocol.md) pour
la sémantique détaillée du cycle de vie.

## OpenAPI

Le contrat de 25 opérations est disponible au format
[OpenAPI 3.1 JSON](https://raw.githubusercontent.com/QwenLM/qwen-code/main/docs/developers/daemon-rest-api.openapi.json).
Importez cette URL dans un moteur de rendu, un générateur de client ou un outil de validation
compatible OpenAPI. Le JSON versionné est le contrat d'interface portable pour les opérations
indexées ci-dessous et est validé par rapport au guide, aux en-têtes du protocole et aux routes
enregistrées dans le CI.

Cet index couvre un sous-ensemble principal de la surface REST du démon, pas la totalité.
En dehors se trouvent les routes Web Shell officielles, les surfaces internes conditionnelles
et d'autres routes publiques mais non essentielles : mutation de fichiers, enregistrement de
workspace, organisation et génération de sessions, ainsi que les MCP, skills et providers de
workspace entre autres. Ces surfaces sont annoncées par leurs propres tags de capacité ; la
[référence du protocole HTTP](./qwen-serve-protocol.md) documente les surfaces de session,
de statut de workspace et de fichiers, et la gestion des serveurs MCP, des providers
d'authentification et de la connexion par device-flow est couverte par les
[notes d'authentification et de sécurité du démon](./daemon/12-auth-security.md). Elles sont
en dehors de ce contrat, pas dépréciées.

## Lecture de l'index

- **Capability** est le tag de fonctionnalité à vérifier dans `GET /capabilities`. Un
  tiret cadratin signifie que l'opération n'a pas de tag de fonctionnalité dédié ; les clients
  qui doivent prendre en charge d'anciennes versions du démon doivent gérer `404`.
- **Scope** indique quel runtime possède l'opération. `process-global` lit l'état global du
  démon, `selected-runtime` utilise la sélection de workspace de la requête,
  `persisted-workspace` résout le stockage de session persisté, `live-session-owner` route par
  la session live, et `legacy-primary` cible toujours le workspace principal du démon.
  `GET /session/:id/export` est épinglé au primaire : il résout uniquement les runtimes
  internes gérés avant de basculer sur le workspace principal.
- Toutes les opérations de cet index sont **stables** dans le contrat REST v1. Le nom de
  capacité déprécié `unstable_session_resume` est uniquement un alias ; utilisez
  `session_resume` pour la route de reprise stable.

## Découverte

| Operation                                                        | Capability     | Scope            | TypeScript SDK              |
| ---------------------------------------------------------------- | -------------- | ---------------- | --------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | `health`       | `process-global` | `DaemonClient.health`       |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | `capabilities` | `process-global` | `DaemonClient.capabilities` |

## Cycle de vie de la session

| Operation                                                                         | Capability          | Scope                | TypeScript SDK                       |
| --------------------------------------------------------------------------------- | ------------------- | -------------------- | ------------------------------------ |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                          | `session_create`    | `selected-runtime`   | `DaemonClient.createOrAttachSession` |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload)           | `session_load`      | `selected-runtime`   | `DaemonClient.loadSession`           |
| [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume)       | `session_resume`    | `selected-runtime`   | `DaemonClient.resumeSession`         |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat) | `client_heartbeat`  | `live-session-owner` | `DaemonClient.heartbeat`             |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata) | `session_metadata`  | `live-session-owner` | `DaemonClient.updateSessionMetadata` |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)         | `session_set_model` | `live-session-owner` | `DaemonClient.setSessionModel`       |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                | `session_close`     | `live-session-owner` | `DaemonClient.closeSession`          |

## Prompts et événements

| Operation                                                                                   | Capability           | Scope                 | TypeScript SDK                          |
| ------------------------------------------------------------------------------------------- | -------------------- | --------------------- | --------------------------------------- |
| [`GET /session/:id/status`](./qwen-serve-protocol.md#get-sessionidstatus)                   | `session_status`     | `live-session-owner`  | `DaemonClient.sessionStatus`            |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)                 | `session_prompt`     | `live-session-owner`  | `DaemonClient.promptNonBlocking`        |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)                 | `session_cancel`     | `live-session-owner`  | `DaemonClient.cancel`                   |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)               | `session_events`     | `live-session-owner`  | `DaemonClient.subscribeEvents`          |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript)           | `session_transcript` | `persisted-workspace` | `DaemonClient.getSessionTranscriptPage` |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)                 | `session_context`    | `live-session-owner`  | `DaemonClient.sessionContext`           |
| [`GET /session/:id/export`](./qwen-serve-protocol.md#get-sessionidexport)                   | `session_export`     | `legacy-primary`      | `DaemonClient.exportSession`            |
| [`GET /session/:id/pending-prompts`](./qwen-serve-protocol.md#get-sessionidpending-prompts) | —                    | `live-session-owner`  | `DaemonClient.getPendingPrompts`        |

`POST /session/:id/prompt` retourne `202` lorsque le prompt entre dans la file d'attente, pas
lorsque l'Agent termine. Abonnez-vous d'abord, puis corréléz `turn_complete` ou
`turn_error` par `promptId`.

## Permissions

| Operation                                                                                               | Capability                | Scope                | TypeScript SDK                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------- | ----------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | `session_permission_vote` | `live-session-owner` | `DaemonClient.respondToSessionPermission` |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid)                      | `permission_vote`         | `legacy-primary`     | `DaemonClient.respondToPermission`        |

Les nouvelles intégrations multi-workspace doivent toujours utiliser la route à portée de
session. La route héritée peut retourner le même `404` pour une requête appartenant à un
autre runtime que pour un vote déjà résolu.

## Contexte de workspace en lecture seule

| Operation                                                             | Capability             | Scope            | TypeScript SDK                        |
| --------------------------------------------------------------------- | ---------------------- | ---------------- | ------------------------------------- |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools) | —                      | `legacy-primary` | `DaemonClient.workspaceTools`         |
| [`GET /file`](./qwen-serve-protocol.md#get-file)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.readWorkspaceFile`      |
| [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes)           | `workspace_file_bytes` | `legacy-primary` | `DaemonClient.readWorkspaceFileBytes` |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.fileStat`               |
| [`GET /list`](./qwen-serve-protocol.md#get-list)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.dirList`                |
| [`GET /glob`](./qwen-serve-protocol.md#get-glob)                      | `workspace_file_read`  | `legacy-primary` | `DaemonClient.glob`                   |

Ces routes singulières ciblent le workspace principal. Les intégrations qui exposent plusieurs
workspaces enregistrés doivent utiliser les équivalents qualifiés par workspace documentés dans
le protocole complet et le preflight `workspace_qualified_rest_core`.

## Règles de protocole communes

- Authentifiez les routes normales avec `Authorization: Bearer <token>`. Une sonde loopback
  `/health` par défaut peut être exemptée ; les liaisons non-loopback ne le sont pas.
- Envoyez `X-Qwen-Client-Id` lorsqu'une réponse de création/chargement en a fourni un. C'est
  un identifiant de rattachement et d'attribution, pas un principal de sécurité utilisateur.
- Considérez les corps d'erreur comme additifs. Branchez principalement sur le statut HTTP et
  le `code` stable ou `errorKind` lorsqu'ils sont présents.
- Préservez les en-têtes de réponse SSE et désactivez le buffering du proxy. Reprenez avec
  `Last-Event-ID` et `X-Qwen-Event-Epoch` lorsque le démon a fourni un epoch.
- Une limite de confiance de workspace n'est pas une isolation de tenant. Exécutez des démons
  séparés lorsque les principaux de sécurité ou les limites de défaillance au niveau processus
  doivent être indépendants.