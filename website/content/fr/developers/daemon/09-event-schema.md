# Schéma d'événements typés du daemon v1

## Vue d'ensemble

Chaque trame SSE émise par le daemon sur `GET /session/:id/events` a la forme `{ id, v, type, data, originatorClientId?, _meta? }`. `v: 1` est la `EVENT_SCHEMA_VERSION` actuelle. `type` provient de l'ensemble fermé et épinglé par version `DAEMON_KNOWN_EVENT_TYPE_VALUES` dans `packages/sdk-typescript/src/daemon/events.ts` ; l'ensemble actuel compte 47 types d'événements connus. Le champ d'enveloppe `_meta` est estampillé à la limite d'écriture SSE par `formatSseFrame()` dans `packages/cli/src/serve/routes/sse-events.ts` ; voir [Métadonnées au niveau de l'enveloppe](#envelope-level-metadata).

Le SDK expose `asKnownDaemonEvent(evt)`. Il retourne un `KnownDaemonEvent` discriminé pour les types d'événements connus et `undefined` pour les autres types. Les consommateurs du SDK peuvent ainsi gérer la compatibilité ascendante sans nécessiter une mise à jour synchronisée du SDK lorsqu'un daemon plus récent ajoute un type d'événement ; le réducteur de session les enregistre sous `unrecognizedKnownEventCount`.

Le format de transmission se trouve dans [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md). Cette page constitue le contrat de charge utile pour chaque événement.

## Responsabilités

- Fournir la source unique de vérité pour le vocabulaire des événements (`DAEMON_KNOWN_EVENT_TYPE_VALUES`).
- Fournir une enveloppe typée pour chaque type d'événement (`DaemonEventEnvelope<TType, TData>`).
- Fournir des réducteurs purs (`reduceDaemonSessionEvent`, `reduceDaemonAuthEvent`) qui projettent un flux d'événements dans l'état de vue du SDK.
- Diffuser le tag de capacité `typed_event_schema` comme signal informatif. Si le tag est absent, `asKnownDaemonEvent` retombe tout de même sur `unknown`.

## Vocabulaire des événements (47 types connus)

Regroupés par domaine.

### Session principale

| Type                       | Direction      | Déclencheur                                                                       | Champs clés de la charge utile                                                               |
| -------------------------- | -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `session_update`           | S->C           | Toute notification ACP `sessionUpdate` : texte de l'agent, réflexion, appel d'outil ou plan | `sessionUpdate: string, content?: ...` (forme ACP opaque)                        |
| `session_metadata_updated` | S->C           | `PATCH /session/:id/metadata`                                                 | `sessionId, displayName?`                                                        |
| `session_died`             | S->C terminal  | `channel.exited`                                                              | `sessionId, reason, exitCode? \| null, signalCode? \| null`                      |
| `session_closed`           | S->C terminal  | `DELETE /session/:id` ou fermeture programmatique                                   | `sessionId, reason: 'client_close' \| string, closedBy?`                         |
| `session_snapshot`         | S->C synthétique | Trame de snapshot après attachement / relecture SSE                                      | `sessionId, currentModelId: string \| null, currentApprovalMode: string \| null` |

### Trames synthétiques au niveau de l'abonné

| Type                    | Déclencheur                                                                                                                                                                                                                              | Notes                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `client_evicted`        | Débordement de la file d'attente EventBus par abonné. **Pas de `id`**                                                                                                                                                                                  | `reason: string, droppedAfter?: number` ; terminal uniquement pour l'abonné actuel, tandis que la session reste active.                                                                                                                                                                                                            |
| `slow_client_warning`   | File >= 75% ; poussé de force et **n'a pas de `id`**                                                                                                                                                                                       | `queueSize, maxQueued, lastEventId` ; réarmé après que la file descend sous les 37,5 %.                                                                                                                                                                                                                                               |
| `stream_error`          | `SubscriberLimitExceededError` ou une autre erreur de flux de route                                                                                                                                                                         | `error: string` ; terminal pour l'abonnement.                                                                                                                                                                                                                                                                                |
| `state_resync_required` | `subscribe({lastEventId})` détecte que l'anneau du daemon ne contient plus `[lastEventId+1, earliestInRing-1]`, ou que le curseur du client provient d'une époque de bus précédente. Poussé de force **avant** les trames de relecture restantes et **n'a pas de `id`**. | `reason: 'ring_evicted' \| 'epoch_reset' \| string`, `lastDeliveredId: number`, `earliestAvailableId: number`. Il s'agit d'un signal de récupération, non terminal : le flux SSE reste ouvert et la relecture + les trames en direct continuent. Le réducteur du SDK définit `awaitingResync = true` et ignore les deltas jusqu'à ce que l'appelant réinitialise avec `loadSession`. |
| `replay_complete`       | Sentinelle sans ID émise après la fin de la boucle de relecture `Last-Event-ID`, pour les chemins de relecture propre et d'éviction d'anneau, même lorsque `data.replayedCount === 0`. **Pas de `id`**                                                             | `replayedCount: number` ; permet aux consommateurs de supprimer l'UI de rattrapage de manière déterministe sans délai d'attente.                                                                                                                                                                                                                                |

### Permissions (F3 + base)

| Type                          | Direction | Déclencheur                                            | Champs clés de la charge utile                                                                                                                               |
| ----------------------------- | --------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `permission_request`          | S->C      | L'agent appelle `requestPermission`                    | `requestId, sessionId, toolCall, options[]` ; l'enveloppe estampille `originatorClientId` depuis l'origine du prompt.                                |
| `permission_resolved`         | S->C      | Le médiateur a décidé                               | `requestId, outcome` (ACP `PermissionOutcome`)                                                                                                   |
| `permission_already_resolved` | S->C      | Le vote arrive après que la demande a déjà été décidée | `requestId, sessionId, outcome`                                                                                                                  |
| `permission_partial_vote`     | S->C      | La politique `consensus` enregistre un vote non définitif        | `requestId, sessionId, votesReceived, votesNeeded (>= 1), quorum, optionTallies: Record<string, number>, originatorClientId?`                    |
| `permission_forbidden`        | S->C      | La politique rejette un vote                              | `requestId, sessionId, clientId?, reason: 'designated_mismatch' \| 'remote_not_allowed', originatorClientId?` ; les votants anonymes omettent `clientId`. |

### Modèles

| Type                  | Direction | Charge utile                                      |
| --------------------- | --------- | -------------------------------------------- |
| `model_switched`      | S->C      | `sessionId, modelId`                         |
| `model_switch_failed` | S->C      | `sessionId, requestedModelId, error: string` |

### Garde-fous MCP (PR 14b + F2)

| Type                         | Direction | Charge utile                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp_budget_warning`         | S->C      | `liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' \| 'enforce', scope?: 'workspace' \| 'session'`                                                                                                                                                                                                                                                                                                                             |
| `mcp_child_refused_batch`    | S->C      | `refusedServers: [{ name, transport, reason: 'budget_exhausted' }], budget, liveCount, reservedCount, mode: 'enforce', scope?: 'workspace' \| 'session'`                                                                                                                                                                                                                                                                                          |
| `mcp_server_restarted`       | S->C      | `serverName, durationMs, entryIndex?` pour les redémarrages de pool multi-entrées F2                                                                                                                                                                                                                                                                                                                                                                            |
| `mcp_server_restart_refused` | S->C      | `serverName, reason: 'budget_would_exceed' \| 'in_flight' \| 'disabled' \| 'restart_failed', entryIndex?, details?`. La quatrième valeur, `restart_failed`, indique une erreur matérielle sous-jacente pour le redémarrage multi-entrées en mode pool. `MCP_RESTART_REFUSED_REASONS` rejette les raisons inconnues ; un ancien réducteur du SDK ignore silencieusement les nouvelles valeurs de raisons additives car `parseDaemonEvent` retourne `undefined`. Livrez une nouvelle raison avec un SDK qui la connaît. |

### Contrôle des mutations (Wave 4 PR 16+17)

| Type                     | Direction | Charge utile                                                                                                                          |
| ------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `memory_changed`         | S->C      | `scope: 'workspace' \| 'global', filePath, mode: 'append' \| 'replace', bytesWritten`                                            |
| `agent_changed`          | S->C      | `change: 'created' \| 'updated' \| 'deleted', name, level: 'project' \| 'user'`                                                  |
| `approval_mode_changed`  | S->C      | `sessionId, previous, next, persisted: boolean`                                                                                  |
| `tool_toggled`           | S->C      | `toolName, enabled` ; affecte le prochain spawn d'enfant ACP et ne mute pas les sessions déjà en cours d'exécution.                              |
| `settings_changed`       | S->C      | Écriture des paramètres de l'espace de travail terminée. La charge utile est ouverte ; les consommateurs doivent actualiser avec une lecture après écriture.                             |
| `settings_reloaded`      | S->C      | Le service d'espace de travail du daemon a relu les paramètres. La charge utile est ouverte.                                                                       |
| `trust_change_requested` | S->C      | `workspaceCwd, desiredState: 'trusted' \| 'untrusted', reason?`                                                                  |
| `workspace_initialized`  | S->C      | `path, action: 'created' \| 'overwrote' \| 'noop', originatorClientId?`                                                          |
| `github_setup_completed` | S->C      | `releaseTag, readmeUrl, secretsUrl?, workflows: [{path, status, sizeBytes?, error?}], gitignore: {path, status, added?, error?}` |

### Flux d'authentification par appareil (PR 21)

Ces événements sont indexés par espace de travail, et non par session. Le réducteur de session les traite comme des no-ops ; `reduceDaemonAuthEvent` les projette dans l'état au niveau de l'espace de travail.

| Type                          | Direction | Charge utile                                               |
| ----------------------------- | --------- | ----------------------------------------------------- |
| `auth_device_flow_started`    | S->C      | `deviceFlowId, providerId, expiresAt`                 |
| `auth_device_flow_throttled`  | S->C      | `deviceFlowId, intervalMs`                            |
| `auth_device_flow_authorized` | S->C      | `deviceFlowId, providerId, expiresAt?, accountAlias?` |
| `auth_device_flow_failed`     | S->C      | `deviceFlowId, errorKind, hint?`                      |
| `auth_device_flow_cancelled`  | S->C      | `deviceFlowId`                                        |

### Mutation MCP à l'exécution

| Type                 | Direction | Déclencheur                                                       | Champs clés de la charge utile                                                           |
| -------------------- | --------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `mcp_server_added`   | S->C      | Serveur ajouté à l'exécution via `POST /workspace/mcp/servers` | `name, transport, replaced, shadowedSettings, toolCount, originatorClientId` |
| `mcp_server_removed` | S->C      | Serveur supprimé à l'exécution                                     | `name, wasShadowingSettings, originatorClientId`                             |

### Cycle de vie des extensions

| Type                 | Direction | Déclencheur                                                              | Champs clés de la charge utile                                                                                                                               |
| -------------------- | --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extensions_changed` | S->C      | Travail d'installation/actualisation d'extension en arrière-plan terminé ou changement de statut | `refreshed, failed, status?: 'installed' \| 'enabled' \| 'disabled' \| 'updated' \| 'uninstalled' \| 'failed', source?, name?, version?, error?` |

### Injection de messages en cours de tour

| Type                        | Direction | Déclencheur                                                                                         | Champs clés de la charge utile                                                                                                                 |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mid_turn_message_injected` | S->C      | Le Web-shell ou un client distant a injecté des messages dans un tour en cours via `POST /session/:id/inject` | `sessionId, messages: string[], originatorClientId?` ; les consommateurs DOIVENT comparer `originatorClientId` à leur propre ID avant la déduplication. |

### Cycle de vie du tour / poussées de l'assistant

| Type                  | Direction | Déclencheur                                                                                                             | Champs clés de la charge utile                                                                                                                                                                               |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prompt_cancelled`    | S->C      | Le prompt a été annulé via la route explicite `cancelSession` **ou** déconnexion SSE de l'origine | L'enveloppe estampille `originatorClientId` pour le client qui annule. Cela signifie "annulation demandée", et non "annulation confirmée". Les abonnés pairs apprennent que le prompt est terminé.              |
| `turn_complete`       | S->C      | Un tour s'est terminé avec succès                                                                                       | `sessionId, stopReason, promptId?`. `promptId` lie aux réponses de prompt non bloquantes (`202`). Le SDK fait correspondre les événements SSE au prompt d'origine grâce à lui.                                  |
| `turn_error`          | S->C      | Un tour a échoué                                                                                                       | `sessionId, message, code?, promptId?` ; même mécanisme de corrélation `promptId`.                                                                                                                   |
| `session_rewound`     | S->C      | `POST /session/:id/rewind` a réussi                                                                                | `sessionId, promptId, targetTurnIndex, filesChanged[], filesFailed[], originatorClientId?`                                                                                                       |
| `session_branched`    | S->C      | `POST /session/:id/branch` a créé une branche à partir d'une session existante                                                | `sourceSessionId, newSessionId, displayName, originatorClientId?`                                                                                                                                |
| `followup_suggestion` | S->C      | L'enfant ACP a généré des suggestions de suivi en texte fantôme après `end_turn`, transmises via le SSE par session               | `sessionId, suggestion, promptId` ; le fil ne transporte que les suggestions dont `getFilterReason()===null`. Les clients les affichent sous forme de texte fantôme dans l'espace réservé de saisie et les invalident lors du prochain `sendPrompt`. |
| `user_shell_command`  | S->C      | L'utilisateur a démarré une commande shell via `POST /session/:id/shell` ; diffusé aux autres abonnés de la même session | `sessionId, command, shellId, originatorClientId?`. Il n'y a pas encore d'interface typée `DaemonXxxData` ; `asKnownDaemonEvent` retourne `undefined` et le normaliseur d'UI l'analyse de manière ad hoc.            |
| `user_shell_result`   | S->C      | Résultat de la commande shell ci-dessus                                                                                   | `sessionId, shellId, exitCode, output, aborted`. Même note d'analyse ad hoc que pour `user_shell_command`.                                                                                               |
## Architecture

| Concern                                | Source                                         | Notes                                                                                                              |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `EVENT_SCHEMA_VERSION = 1`             | `packages/acp-bridge/src/eventBus.ts`          | Envoyé sur chaque frame.                                                                                           |
| `DAEMON_KNOWN_EVENT_TYPE_VALUES`       | `packages/sdk-typescript/src/daemon/events.ts` | Liste fermée de 47 types.                                                                                          |
| `DaemonEventEnvelope<TType, TData>`    | `events.ts`                                    | Enveloppe générique.                                                                                               |
| `DaemonKnownEventType`                 | `events.ts`                                    | `typeof DAEMON_KNOWN_EVENT_TYPE_VALUES[number]`.                                                                   |
| Types de payload par événement         | `events.ts`                                    | La plupart des types d'événements ont une interface `DaemonXxxData` ; `user_shell_*` est actuellement analysé de manière ad hoc par le normaliseur d'UI. |
| `asKnownDaemonEvent(evt)`              | `events.ts`                                    | Retourne `KnownDaemonEvent \| undefined`.                                                                          |
| `reduceDaemonSessionEvent(state, evt)` | `events.ts`                                    | Projette dans `DaemonSessionViewState`.                                                                            |
| `reduceDaemonAuthEvent(state, evt)`    | `events.ts`                                    | Projette dans `DaemonAuthState`.                                                                                   |
| `isWorkspaceScopedBudgetEvent(evt)`    | `events.ts`                                    | Détecte F2 `scope: 'workspace'`.                                                                                   |

### `DaemonSessionViewState`

`reduceDaemonSessionEvent` remplit cet état de vue. L'adaptateur CLI TUI, `DaemonChannelBridge` et l'IDE VS Code le consomment. Champs clés :

- `alive: boolean` - passe à `false` après une frame terminale (`session_died`, `session_closed`, `client_evicted`, `stream_error`).
- `currentModelId?: string` - issu de `model_switched`.
- `displayName?: string` - issu de `session_metadata_updated`.
- `pendingPermissions: Record<string, DaemonPermissionRequestData>` - requêtes ouvertes indexées par `requestId` ; effacées par `permission_resolved` / `permission_already_resolved`.
- `lastSessionUpdate?: DaemonSessionUpdateData` - dernier `session_update`.
- `lastModelSwitchFailure?: DaemonModelSwitchFailedData` - issu de `model_switch_failed`.
- `terminalEvent?` - événement terminal brut.
- `streamError?: DaemonStreamErrorData` - dernier payload `stream_error`.
- `unrecognizedKnownEventCount`, `lastUnrecognizedKnownEvent?` - l'événement a été reconnu par `asKnownDaemonEvent` mais le reducer n'a pas encore d'état dédié pour celui-ci.
- `droppedPermissionRequestCount`, `lastDroppedPermissionRequestId?` - une requête de permission malformée n'a pas pu entrer dans la map en attente.
- `unmatchedPermissionResolutionCount`, `lastUnmatchedPermissionResolutionId?` - la résolution de permission n'avait aucune requête en attente correspondante.
- `slowClientWarningCount`, `lastSlowClientWarning?` - issu de `slow_client_warning`.
- `mcpBudgetWarningCount`, `lastMcpBudgetWarning?` - issu de `mcp_budget_warning`.
- `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch?` - issu de `mcp_child_refused_batch`.
- `lastWorkspaceMutation?`, `lastWorkspaceMutationType?` - issu de `memory_changed` / `agent_changed`.
- `approvalMode?`, `approvalModeChangedCount`, `lastApprovalModeChange?` - issu de `approval_mode_changed`.
- `toolToggleCount`, `lastToolToggle?` - issu de `tool_toggled`.
- `workspaceInitCount`, `lastWorkspaceInit?` - issu de `workspace_initialized`.
- `mcpRestartCount`, `lastMcpRestart?` - issu de `mcp_server_restarted`.
- `mcpRestartRefusedCount`, `lastMcpRestartRefused?` - issu de `mcp_server_restart_refused`.
- `settings_changed` / `settings_reloaded` - reconnus par `asKnownDaemonEvent` ; le reducer de session ne maintient pas de champs d'état de vue dédiés, et les UI les traitent généralement comme des signaux de rafraîchissement.
- `permissionVoteProgress: Record<string, DaemonPermissionPartialVoteData>` - progression du vote par consensus.
- `forbiddenVotes: DaemonPermissionForbiddenData[]`, `forbiddenVoteCount` - enregistrements de votes rejetés par la politique, plafonnés à 32.
- `awaitingResync: boolean` - défini par `state_resync_required` ; effacé lorsque le consommateur réinitialise l'état de vue.
- `resyncRequiredCount`, `lastResyncRequired?` - observabilité de la resynchronisation.
- `lastFollowupSuggestion?: DaemonFollowupSuggestionData` - dernière suggestion de suivi poussée par le daemon.
- `lastTurnComplete?: DaemonTurnCompleteData` - dernier tour complété avec succès.
- `lastTurnError?: DaemonTurnErrorData` - dernière erreur de tour.
- `rewindCount`, `lastRewind?`, `lastBranch?` - derniers événements de rewind / branch.

### `DaemonAuthState`

Une entrée par `providerId`, pilotée par `auth_device_flow_*`. Chaque flux expose `{ deviceFlowId, status, providerId, expiresAt?, lastThrottleIntervalMs?, lastError? }`.

## Flux

### Côté producteur

```mermaid
flowchart LR
    A["Notification enfant ACP"] --> B["BridgeClient.sessionUpdate /<br/>BridgeClient.extNotification"]
    B --> C{"Mappé à un type d'événement ?"}
    C -->|oui| D["EventBus.publish({type, data, originatorClientId?})"]
    C -->|non| E["Pas d'émission (ignoré ou loggé)"]
    D --> F["Assigner id + v=1, ajouter au ring"]
    F --> G["Diffuser à tous les abonnés"]
```

### Côté consommateur (SDK)

```mermaid
flowchart LR
    A["Octets SSE"] --> B["parseSseStream -> DaemonEvent[]"]
    B --> C["asKnownDaemonEvent(evt)"]
    C -->|"KnownDaemonEvent"| D["reduceDaemonSessionEvent(state, evt)"]
    C -->|"auth_device_flow_*"| E["reduceDaemonAuthEvent(state, evt)"]
    C -->|"undefined"| F["unrecognizedKnownEventCount++<br/>(compatibilité ascendante)"]
```

## Métadonnées au niveau de l'enveloppe

Au-delà du payload `data` de chaque événement, le daemon appose deux champs au niveau de l'enveloppe.

### `_meta.serverTimestamp` - horloge du daemon

`EventBus.publish()` dans `packages/acp-bridge/src/eventBus.ts` appose `_meta.serverTimestamp` lorsque l'événement entre dans le bus. Le type `BridgeEvent` inclut `_meta?: Record<string, unknown>`, de sorte que les consommateurs internes du daemon **voient bien** `_meta` sur chaque événement publié dans le bus. `formatSseFrame()` dans `packages/cli/src/serve/routes/sse-events.ts` fournit un timestamp de secours uniquement pour les frames synthétiques (par ex. `stream_error`) qui contournent `EventBus.publish`.

```jsonc
{
  "id": 47,
  "v": 1,
  "type": "session_update",
  "data": { ... },
  "_meta": { "serverTimestamp": 1716287345123 }
}
```

La fusion préserve toutes les clés `_meta` existantes de l'événement d'entrée
(`{...input._meta, serverTimestamp: Date.now()}`). Les producteurs peuvent attacher
des clés `_meta` supplémentaires au niveau de l'enveloppe ; `EventBus.publish` les fusionne avec le
timestamp au lieu de les écraser.

Pourquoi c'est important : les UI multi-clients qui affichent un temps relatif ou trient les blocs de transcription doivent utiliser l'heure du serveur au lieu de l'horloge locale de chaque navigateur/onglet/téléphone. L'horodatage par le serveur maintient un ordre cohérent entre les clients.

Accès SDK : préférez `event._meta?.serverTimestamp`. Les chemins de compatibilité peuvent également sonder `event.serverTimestamp` ou `event.data._meta.serverTimestamp`. Ne mélangez pas le payload ACP `data._meta` avec l'enveloppe daemon `_meta`.

### `originatorClientId`

Les événements déclenchés par une requête portant un `X-Qwen-Client-Id` enregistré peuvent apposer ce champ. Voir [`08-session-lifecycle.md`](./08-session-lifecycle.md).

## `_meta` des appels d'outils (provenance / serverId)

Ceci est distinct de l'enveloppe `_meta` : les payloads ACP `session/update` peuvent porter leur propre `_meta` dans `event.data._meta`. `ToolCallEmitter` (`packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`) appose deux champs sur `emitStart`, `emitResult` et `emitError` :

| Field        | Type                                      | Resolution rule                                                                                                                                                            |
| ------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provenance` | `'builtin' \| 'mcp' \| 'subagent'`        | `ToolCallEmitter.resolveToolProvenance` : `subagentMeta` l'emporte avec `subagent` ; le nom de l'outil correspondant à `mcp__<server>__<tool>` est mappé à `mcp` ; tout le reste est mappé à `builtin`. |
| `serverId`   | `string` uniquement quand `provenance === 'mcp'` | Extrait de manière heuristique depuis `mcp__<serverId>__<tool>`.                                                                                                                    |

Le nom d'affichage `_meta.toolName` existant est conservé. L'UI utilise ces champs pour afficher les badges builtin / serveur MCP / subagent sans avoir à reparser le nom de l'outil.

## Comportement du reducer SDK

`reduceDaemonSessionEvent(state, evt)` dans `packages/sdk-typescript/src/daemon/events.ts` projette le flux dans `DaemonSessionViewState`. Les champs liés à la resynchronisation sont :

- **`awaitingResync: boolean`** - défini par `state_resync_required` ; l'appelant l'efface, généralement après que `POST /session/:id/load` a réinitialisé l'état de vue.
- **`resyncRequiredCount: number`** - compteur d'observabilité.
- **`lastResyncRequired?: DaemonStateResyncRequiredData`** - dernier payload.

Lorsque `awaitingResync = true`, le reducer **ignore l'application des deltas** et n'autorise que l'ensemble fermé `RESYNC_PASSTHROUGH_TYPES` :

| Passthrough type        | Pourquoi il est toujours appliqué pendant la resynchronisation                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| `state_resync_required` | Une seconde resynchronisation rare doit mettre à jour `lastResyncRequired` / `resyncRequiredCount`. |
| `session_died`          | Le signal de fin de flux doit rester visible pendant la resynchronisation.                      |
| `session_closed`        | Idem ci-dessus.                                                                 |
| `client_evicted`        | Idem ci-dessus.                                                                 |
| `stream_error`          | Idem ci-dessus.                                                                 |
| `session_snapshot`      | Frame faisant autorité pour l'état complet ; sûr à appliquer pendant la resynchronisation.                   |

`lastEventId` continue d'avancer de manière monotone via `advanceLastEventId(base)` pendant la resynchronisation. Après que l'appelant a réinitialisé et effacé `awaitingResync`, les deltas suivants s'alignent sur le bon curseur.

`reduceDaemonAuthEvent` projette les événements de flux d'appareil dans des entrées d'état d'authentification au niveau du workspace, ayant conceptuellement la forme
`{deviceFlowId, status, providerId, expiresAt?, lastThrottleIntervalMs?, lastError?}`. Dans le code, le reducer stocke `status`, `errorKind`, `hint`,
`intervalMs`, `lastSeenEventId`, `authorizedExpiresAt` et `accountAlias` sur
`DaemonDeviceFlowReducerState` ; les payloads d'événements du daemon eux-mêmes conservent les
formes par événement listées ci-dessus.

## État et compatibilité ascendante

- Ajoutez un type d'événement connu en l'ajoutant à `DAEMON_KNOWN_EVENT_TYPE_VALUES`. Les anciens SDK retournent `undefined` pour les types d'événements non reconnus via le chemin de secours et incrémentent `unrecognizedKnownEventCount` ; les nouveaux SDK s'appuient sur l'union discriminée.
- L'ajout de champs optionnels à un payload existant est sûr car les payloads sont ouverts (`{ [key: string]: unknown }`).
- Modifier la **forme** d'un payload existant est un changement cassant et doit incrémenter `EVENT_SCHEMA_VERSION` ainsi qu'annoncer un tag de capacité compatible tel que `caps.features.typed_event_schema_v2`.
- `id` est monotone par session. Les frames synthétiques au niveau de l'abonné (`client_evicted`, `slow_client_warning`, `stream_error`, `state_resync_required`, `replay_complete`, `session_snapshot`) n'ont volontairement pas d'id afin que les autres abonnés ne voient pas de trous.
- `originatorClientId` se trouve sur l'enveloppe plutôt que dans `data`. Les payloads de vote partiel / interdits F3 le fusionnent également dans `data` via `mergeOriginator` afin que les consommateurs de l'état de vue n'aient pas besoin de conserver l'enveloppe.

## Dépendances

- [`10-event-bus.md`](./10-event-bus.md) - canal de livraison.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - comment les SDK pré-vérifient `typed_event_schema`, `mcp_guardrail_events` et `permission_mediation`.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - comment les événements de permission sont produits.
- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - `asKnownDaemonEvent`, reducers et forme de l'état de vue.

## Configuration

- Toujours annoncées : `typed_event_schema`, `mcp_guardrail_events` et `permission_mediation` (avec les modes de politique pris en charge).
- Aucune variable d'environnement ou flag ne contrôle directement le schéma lui-même. `QWEN_SERVE_NO_MCP_POOL=1` change le `scope` des événements MCP de `'workspace'` à absent ou `'session'`.

## Mises en garde et limites connues

- Six types de frames synthétiques n'ont volontairement pas d'`id` ; le code SDK ne doit pas supposer que chaque événement a un id.
- `permission_partial_vote` n'apparaît que sous `consensus`. `permission_forbidden` apparaît sous `designated`, `consensus` et `local-only`, mais pas sous `first-responder`.
- `mcp_child_refused_batch` n'apparaît qu'en `mode: 'enforce'` ; le mode `warn` ne refuse jamais.
- Les événements `auth_device_flow_*` ne sont pas liés à une session. Lors de la consommation via `DaemonSessionClient`, utilisez `reduceDaemonAuthEvent` pour ceux-ci plutôt que le reducer de session.

## Références

- `packages/sdk-typescript/src/daemon/events.ts`
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- `packages/cli/src/serve/capabilities.ts` (`typed_event_schema`, `mcp_guardrail_events`, `permission_mediation`)
- Référence wire : [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)