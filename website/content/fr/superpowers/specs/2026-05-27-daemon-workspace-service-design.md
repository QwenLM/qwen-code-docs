# Conception et implémentation du service DaemonWorkspaceService (Option C)

> Liens : issue #4542, PR #4472, #3803, #4175
> Branche : `daemon_mode_b_main`
> Date : 2026-05-27
> Nature : Document de conception d'implémentation (orienté mise en œuvre), pas une RFC

---

> **Note sur le périmètre de mise en œuvre (mise à jour 2026-05-31, PR #4563)**
>
> Ce document décrit **l'architecture cible finale**. La PR #4563 n'en implémente qu'une partie, le reste étant prévu pour des PR ultérieures. Lors de la lecture, basez-vous sur le tableau ci-dessous et ne présupposez pas que tout est déjà implémenté :
>
> | Capacité                                                                       | Statut dans cette PR (#4563)                                                                                                                  |
> | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
> | Renommage `HttpAcpBridge` → `AcpSessionBridge`                                | ✅ Implémenté                                                                                                                                  |
> | Le bridge expose les délégués génériques `queryWorkspaceStatus` / `invokeWorkspaceCommand` | ✅ Implémenté                                                                                                                                  |
> | Au niveau facade : **status / init / tool-toggle / mcp-restart** du workspace | ✅ Implémenté et câblé (server.ts + dispatch acpHttp via facade)                                                                                |
> | **Les quatre sous-services File / Auth / Agents / Memory**                     | ⏳ **Reporté** – pas dans cette PR. Sera implémenté dans une PR ultérieure avec le câblage des routes respectives, l'injection de `deviceFlowRegistry`/`subagentManager` et les tests e2e |
> | Routes REST `/workspace/memory`, `/workspace/agents` etc. basculées vers facade | ⏳ **Reporté** – actuellement encore servies directement par les anciens `workspaceMemory.ts` / `workspaceAgents.ts`                          |
> | Dispatch `/acp` northbound `qwen/workspace/*` (§6)                            | ⏳ **Reporté**                                                                                                                                 |
> | `initWorkspace` via `fsFactory` / `WorkspaceFileSystem` (trust gate + audit)  | ⏳ **Reporté** – actuellement l'ancien bridge utilise encore une implémentation `node:fs` brute (avec protections §SV TOCTOU/symlink), sans régression ; la migration fsFactory/audit est reportée |
>
> Par conséquent, les sections §3.4 (interfaces des sous-services), §6 (dispatch /acp northbound), le fichier `e2e.test.ts` dans §7.1, et la description de la PR dans §10 relèvent du **périmètre final/futur**, non implémenté dans cette PR.

---

## 1. Architecture et périmètre

### 1.1 Couches finales

```
                          CLIENTS
   webui    SDK/channels(via REST)    Zed/Goose(/acp)    future
     │             │                       │
═════╪═════════════╪═══════════════════════╪═════════════ L1 transport (fine)
   REST+SSE      REST+SSE              /acp (jsonrpc/sse)
   server.ts                           acpHttp/
     └─────────────┴───────────────────────┘
                          │ Business/trust/audit toujours descendu en L2
═════════════════════════╪═══════════════════════════════ L2 couche applicative
   ┌──────────────────────────┐   ┌─────────────────────────────────┐
   │ AcpSessionBridge          │   │ DaemonWorkspaceService (facade)  │
   │ (← renommage HttpAcpBridge)│   │  ┌──────────────────────────┐   │
   │ • cycle de vie channel/session │   │  FileService              │   │
   │ • prompt / cancel / close │   │  AuthService              │   │
   │ • EventBus / arbitrage des droits │   │  AgentsService            │   │
   │ • introspection d'état du child   │   │  MemoryService            │   │
   │   (mcp/skills/preflight)  │   └──────────────────────────┘   │
   └──────────┬───────────────┘   │ Contexte unifié WorkspaceRequestContext │
              │                    └──────────┬──────────────────────┘
              │ L3 → child                    │
              ▼                               │ (purement local, ne touche pas au child)
══════════════════════════════════════════════════════════ L3 ACP-client
══════════════════════════════════════════════════════════ L4 agent
```

### 1.2 Fonction de décision de séparation

**Règle unique : l'opération a-t-elle une portée « session » ou « workspace » ?**

- **Portée session** (opère sur un sessionId spécifique : prompt/cancel/close/model/approval/metadata/heartbeat) **→ reste dans `AcpSessionBridge`**
- **Portée workspace** (opère sur l'ensemble du workspace : file/auth/agents/memory/mcp-status/skills/env/preflight/tool-toggle/init) **→ va dans `DaemonWorkspaceService`**

Certaines méthodes workspace nécessitent d'interroger le child (status getters, restartMcpServer) : elles le font via un **callback injecté** délégué au canal du bridge. Le service ne détient pas lui-même la connexion.

### 1.3 Dépendances transverses : injection de callback (pas d'infrastructure partagée)

Actuellement, `publishWorkspaceEvent` et `knownClientIds` sont détenus par le bridge (bus fan-out par session / dérivé de la session). Le service les utilise via une **injection de callback unidirectionnelle**, sans introduire de couche d'infrastructure partagée.

**Justifications :**

1. L'EventBus est un bus par session (`bridge.ts:1457`) ; un bus au niveau workspace est mentionné dans des commentaires comme étant prévu pour la PR 24 (`bridge.ts:2611`).
2. `knownClientIds` est également dérivé de l'état d'attachement de session ; le commentaire indique clairement « PR 24 le remplacera » (`bridge.ts:2658`).
3. Ces deux éléments sont des travaux indépendants déjà planifiés ; les intégrer de force dans cette PR reviendrait à ajouter un refactor supplémentaire.
4. L'injection de callback pour le service est une dépendance unidirectionnelle (il ne détient qu'une référence de fonction, ignorant qu'elle provient du bridge) ; une fois la PR 24 implémentée, il suffira de changer la source d'injection, l'interface du service restant inchangée.

**Règles strictes :**

1. `DaemonWorkspaceServiceDeps` ne doit **pas** contenir de référence de type vers `AcpSessionBridge` – uniquement des signatures de fonctions.
2. Le bridge expose désormais deux méthodes publiques, `queryWorkspaceStatus` et `invokeWorkspaceCommand`, que le service appelle via callback. En interne, elles utilisent toujours les logiques existantes `requestWorkspaceStatus` / `liveChannelInfo` + timeout, sans créer de nouvelle abstraction.

---

## 2. Ordre de construction et injection de dépendances

```ts
// Ordre de construction dans runQwenServe.ts

// 1. fsFactory construit d'abord (partagé)
const fsFactory = resolveBridgeFsFactory({ ... });

// 2. bridge construit en premier (propriétaire du session/channel/EventBus)
const bridge = createAcpSessionBridge({
  eventRingSize,
  boundWorkspace,
  fileSystem: createBridgeFileSystemAdapter(fsFactory),
  // ... autres paramètres inchangés
});

// 3. service construit ensuite, reçoit les callbacks du bridge
const workspace = createDaemonWorkspaceService({
  fsFactory,
  deviceFlowRegistry,
  subagentManager,
  boundWorkspace,
  contextFilename,
  // Callbacks transverses – le service ne sait pas qu'ils viennent du bridge
  publishWorkspaceEvent: (event) => bridge.publishWorkspaceEvent(event),
  knownClientIds: () => bridge.knownClientIds(),
  // Callback de délégation child – les méthodes workspace-scoped atteignent l'agent via le canal du bridge
  queryWorkspaceStatus: (method, idle) => bridge.queryWorkspaceStatus(method, idle),
  invokeWorkspaceCommand: (method, params, opts) => bridge.invokeWorkspaceCommand(method, params, opts),
});

// 4. Les deux sont transmis aux routes server + au handler /acp
createServeApp({ bridge, workspace, ... });
```

**L'ordre de construction bridge → service est une dépendance forte** (le service a besoin des méthodes de l'instance bridge comme source de callbacks).

---

## 3. Structure interne de DaemonWorkspaceService

### 3.1 Organisation des répertoires

```
packages/cli/src/serve/workspace-service/
├── types.ts            ← WorkspaceRequestContext + interfaces des sous-services
├── index.ts            ← Fabrique facade (createDaemonWorkspaceService)
├── fileService.ts      ← encapsule fsFactory
├── authService.ts      ← encapsule DeviceFlowRegistry
├── agentsService.ts    ← encapsule SubagentManager
├── memoryService.ts    ← encapsule les opérations de fichiers mémoire
└── __tests__/
    ├── fileService.test.ts
    ├── authService.test.ts
    ├── agentsService.test.ts
    ├── memoryService.test.ts
    └── e2e.test.ts
```

### 3.2 Interface de la facade

```ts
export interface DaemonWorkspaceService {
  file: FileService;
  auth: AuthService;
  agents: AgentsService;
  memory: MemoryService;

  // Purement local
  initWorkspace(
    opts: InitWorkspaceOpts,
    ctx: WorkspaceRequestContext,
  ): Promise<void>;
  setToolEnabled(
    toolName: string,
    enabled: boolean,
    ctx: WorkspaceRequestContext,
  ): Promise<ToolToggleResult>;

  // Délégation au child via callback
  getMcpStatus(): Promise<ServeWorkspaceMcpStatus>;
  getSkillsStatus(): Promise<ServeWorkspaceSkillsStatus>;
  getProvidersStatus(): Promise<ServeWorkspaceProvidersStatus>;
  getEnvStatus(): Promise<ServeWorkspaceEnvStatus>;
  getPreflightStatus(): Promise<ServeWorkspacePreflightStatus>;
  restartMcpServer(
    serverName: string,
    ctx: WorkspaceRequestContext,
    opts?: RestartOpts,
  ): Promise<RestartResult>;
}
```

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `publishWorkspaceEvent` / `knownClientIds` restent dans le bridge — ils accèdent à l'état interne par session du bridge (map `byId` / bus de session), qui est une infrastructure dérivée de la session. Le service les consomme via callback, sans les posséder directement.

### 3.3 Signature de la fabrique de la facade

```ts
export interface DaemonWorkspaceServiceDeps {
  fsFactory: WorkspaceFileSystemFactory;
  deviceFlowRegistry: DeviceFlowRegistry;
  subagentManager: SubagentManager;
  boundWorkspace: string;
  contextFilename: string;
  persistDisabledTools: (
    workspace: string,
    tool: string,
    enabled: boolean,
  ) => Promise<void>;

  // Callbacks transverses (infrastructure dérivée de la session)
  publishWorkspaceEvent: (event: WorkspaceEvent) => void;
  knownClientIds: () => Set<string>;

  // Callbacks de délégation child (méthodes workspace-scoped atteignent l'agent via le canal du bridge)
  queryWorkspaceStatus: <T>(method: string, idle: () => T) => Promise<T>;
  invokeWorkspaceCommand: <T>(
    method: string,
    params?: Record<string, unknown>,
    opts?: { timeoutMs?: number },
  ) => Promise<T>;
}

export function createDaemonWorkspaceService(
  deps: DaemonWorkspaceServiceDeps,
): DaemonWorkspaceService;
```

### 3.4 Interfaces de chaque sous-service

| Sous-service | Méthodes                                                                                                      | Dépendances requises                                               | Source actuelle                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| FileService  | `read`, `readBytes`, `write`, `edit`, `glob`, `list`, `stat`                                                 | `fsFactory`, `boundWorkspace`                                      | `serve/routes/workspaceFileRead.ts`, `workspaceFileWrite.ts`, `serve/fs/`                    |
| AuthService  | `startFlow`, `getFlowStatus(flowId)`, `cancelFlow(flowId)`, `getAuthStatus`                                  | `deviceFlowRegistry`                                               | `serve/auth/deviceFlow.ts`, `server.ts:794-966`                                              |
| AgentsService| `list`, `get(agentType)`, `create`, `update`, `delete`                                                       | `subagentManager`, `publishWorkspaceEvent`, `knownClientIds`       | `serve/workspaceAgents.ts`                                                                   |
| MemoryService| `list`, `read`, `write`, `delete`                                                                             | `fsFactory` ou fs direct, `publishWorkspaceEvent`, `knownClientIds`| `serve/workspaceMemory.ts`                                                                   |

Chaque méthode prend comme premier paramètre `ctx: WorkspaceRequestContext`. Le trust gate est exécuté uniformément à l'entrée de chaque méthode.

---

## 4. WorkspaceRequestContext

```ts
export interface WorkspaceRequestContext {
  originatorClientId?: string; // En-tête X-Qwen-Client-Id (peut être absent pour les opérations en lecture seule)
  sessionId?: string; // Association audit (par exemple si l'opération provient d'un contexte de session)
  route: string; // Trace d'audit (ex : "POST /file/write")
  workspaceCwd: string; // Racine de la frontière de confiance (trust boundary)
}
```

> `originatorClientId` est optionnel — actuellement, les routes en lecture seule comme la lecture de fichier fonctionnent même si l'en-tête est absent (`clientId ?? undefined` passé à `fsFactory.forRequest`). Les routes d'écriture ne valident la légitimité que **si** un `clientId` est présent.

**Point de construction** : le gestionnaire de route L1 / le gestionnaire de méthode `/acp` extrait les informations des en-têtes/paramètres de la requête et les transmet à L2. L2 se contente de consommer, il n'extrait pas lui-même le contexte HTTP.

---

## 5. Allègement et renommage de AcpSessionBridge

### 5.1 Méthodes déplacées depuis le bridge

| Méthode                          | Destination                     | Mécanisme                              | Justification                                                                                                              |
| -------------------------------- | ------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `initWorkspace`                  | `workspace.initWorkspace`       | Déplacement direct (purement local)    | Corrige un FIXME (le bridge n'utilisait pas fsFactory, contournant trust gate / audit)                                      |
| `setWorkspaceToolEnabled`        | `workspace.setToolEnabled`      | Déplacement direct (purement local)    | Pure file I/O + fan-out d'événement, commentaire explicite « no ACP roundtrip »                                             |
| `getWorkspaceMcpStatus`          | `workspace.getMcpStatus`        | via le callback `queryWorkspaceStatus`  | Interrogation de statut à portée workspace                                                                                 |
| `getWorkspaceSkillsStatus`       | `workspace.getSkillsStatus`     | via le callback `queryWorkspaceStatus`  | Idem                                                                                                                        |
| `getWorkspaceProvidersStatus`    | `workspace.getProvidersStatus`  | via le callback `queryWorkspaceStatus`  | Idem                                                                                                                        |
| `getWorkspaceEnvStatus`          | `workspace.getEnvStatus`        | via le callback `queryWorkspaceStatus`  | Idem                                                                                                                        |
| `getWorkspacePreflightStatus`    | `workspace.getPreflightStatus`  | via le callback `queryWorkspaceStatus`  | Idem                                                                                                                        |
| `restartMcpServer`               | `workspace.restartMcpServer`    | via le callback `invokeWorkspaceCommand`| Mutation à portée workspace                                                                                                |

> `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` restent dans le bridge — ils accèdent à la map interne `byId` des sessions du bridge, ce sont des opérations à portée session.

### 5.2 Ce qui reste dans le bridge

- Tout le cycle de vie session/channel (spawn/load/resume/send/cancel/close/kill/detach)
- Détention de l'EventBus + implémentation du fan-out `publishWorkspaceEvent` (consommé par le callback du service)
- `knownClientIds` (consommé par le callback du service)
- `queryWorkspaceStatus` / `invokeWorkspaceCommand` (nouvellement exposés, encapsulent canal + timeout + erreur, délégués par le callback du service)
- Médiateur d'arbitrage des droits
- Modifications de configuration de session (model/approvalMode/recap)
- État de session (context/supportedCommands/metadata/heartbeat/listSessions)

### 5.3 Renommage

- `HttpAcpBridge` → `AcpSessionBridge`
- `createHttpAcpBridge` → `createAcpSessionBridge`
- Fichier `serve/httpAcpBridge.ts` → `serve/acpSessionBridge.ts`

Aucun consommateur externe (vérifié : aucune référence en dehors de `packages/cli/src/serve/` et `packages/acp-bridge/src/`), le changement est sûr en interne.

---

## 6. Méthodes d'extension northbound /acp

### 6.1 Espace de noms

`qwen/workspace/...` (distinct de l'existant `qwen/control/...`) :

- `qwen/control/...` = commandes de transfert daemon→child (southbound, via AcpSessionBridge)
- `qwen/workspace/...` = opérations locales du workspace du daemon (northbound, terminées dans DaemonWorkspaceService)

> En attente de confirmation par chiga0. Si l'espace de noms change, il suffit de modifier le préfixe des méthodes, cela n'affecte pas l'architecture.

### 6.2 Liste des méthodes

| method                            | REST correspondant                               | Appel L2                                             |
| --------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `qwen/workspace/fs/read`          | `GET /file?path=...`                             | `workspace.file.read(ctx, path)`                     |
| `qwen/workspace/fs/readBytes`     | `GET /file/bytes?path=...`                       | `workspace.file.readBytes(ctx, path)`                |
| `qwen/workspace/fs/write`         | `POST /file/write`                               | `workspace.file.write(ctx, path, content)`           |
| `qwen/workspace/fs/edit`          | `POST /file/edit`                                | `workspace.file.edit(ctx, path, edits)`              |
| `qwen/workspace/fs/glob`          | `GET /glob?pattern=...`                          | `workspace.file.glob(ctx, pattern)`                  |
| `qwen/workspace/fs/list`          | `GET /list?path=...`                             | `workspace.file.list(ctx, path)`                     |
| `qwen/workspace/fs/stat`          | `GET /stat?path=...`                             | `workspace.file.stat(ctx, path)`                     |
| `qwen/workspace/auth/start`       | `POST /workspace/auth/device-flow`               | `workspace.auth.startFlow(ctx)`                      |
| `qwen/workspace/auth/status`      | `GET /workspace/auth/status`                     | `workspace.auth.getAuthStatus(ctx)`                  |
| `qwen/workspace/auth/flow`        | `GET /workspace/auth/device-flow/:id`            | `workspace.auth.getFlowStatus(ctx, flowId)`          |
| `qwen/workspace/auth/cancel`      | `POST /workspace/auth/device-flow/:id` (annulation) | `workspace.auth.cancelFlow(ctx, flowId)`             |
| `qwen/workspace/agents/list`      | `GET /workspace/agents`                          | `workspace.agents.list(ctx)`                         |
| `qwen/workspace/agents/get`       | `GET /workspace/agents/:agentType`               | `workspace.agents.get(ctx, agentType)`               |
| `qwen/workspace/agents/create`    | `POST /workspace/agents`                         | `workspace.agents.create(ctx, spec)`                 |
| `qwen/workspace/agents/update`    | `POST /workspace/agents/:agentType`              | `workspace.agents.update(ctx, agentType, spec)`      |
| `qwen/workspace/agents/delete`    | `DELETE /workspace/agents/:agentType`            | `workspace.agents.delete(ctx, agentType)`            |
| `qwen/workspace/memory/list`      | `GET /workspace/memory`                          | `workspace.memory.list(ctx)`                         |
| `qwen/workspace/memory/read`      | `GET /workspace/memory/:key`                     | `workspace.memory.read(ctx, key)`                    |
| `qwen/workspace/memory/write`     | `POST /workspace/memory`                         | `workspace.memory.write(ctx, key, content)`          |
| `qwen/workspace/memory/delete`    | `DELETE /workspace/memory/:key`                  | `workspace.memory.delete(ctx, key)`                  |
| `qwen/workspace/init`             | `POST /workspace/init`                           | `workspace.initWorkspace(ctx, opts)`                 |
| `qwen/workspace/tool/toggle`      | `POST /workspace/tool/toggle`                    | `workspace.setToolEnabled(ctx, toolName, enabled)`   |
| `qwen/workspace/status/mcp`       | `GET /workspace/mcp`                             | `workspace.getMcpStatus()`                           |
| `qwen/workspace/status/skills`    | `GET /workspace/skills`                          | `workspace.getSkillsStatus()`                        |
| `qwen/workspace/status/providers` | `GET /workspace/providers`                       | `workspace.getProvidersStatus()`                     |
| `qwen/workspace/status/env`       | `GET /workspace/env`                             | `workspace.getEnvStatus()`                           |
| `qwen/workspace/status/preflight` | `GET /workspace/preflight`                       | `workspace.getPreflightStatus()`                     |
| `qwen/workspace/mcp/restart`      | `POST /workspace/mcp/restart`                    | `workspace.restartMcpServer(ctx, serverName, opts)`  |

Ces méthodes sont déclarées dans `_meta.qwen.methods` lors de l'annonce des capacités (capabilities advertise).

---

## 7. Liste des modifications de fichiers

### 7.1 Nouveaux fichiers

| Fichier                                                     | Usage                                                |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| `serve/workspace-service/types.ts`                          | `WorkspaceRequestContext` + interfaces des sous-services |
| `serve/workspace-service/index.ts`                          | Fabrique facade                                      |
| `serve/workspace-service/fileService.ts`                    | Implémentation de FileService                        |
| `serve/workspace-service/authService.ts`                    | Implémentation de AuthService                        |
| `serve/workspace-service/agentsService.ts`                  | Implémentation de AgentsService                      |
| `serve/workspace-service/memoryService.ts`                  | Implémentation de MemoryService                      |
| `serve/workspace-service/__tests__/fileService.test.ts`     | Test unitaire                                        |
| `serve/workspace-service/__tests__/authService.test.ts`     | Test unitaire                                        |
| `serve/workspace-service/__tests__/agentsService.test.ts`   | Test unitaire                                        |
| `serve/workspace-service/__tests__/memoryService.test.ts`   | Test unitaire                                        |
| `serve/workspace-service/__tests__/e2e.test.ts`             | Test de bout en bout : équivalence REST ↔ /acp       |

### 7.2 Fichiers modifiés

| Fichier                                                         | Changement                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acp-bridge/src/bridge.ts`                                      | Suppression de 8 méthodes workspace (initWorkspace / setWorkspaceToolEnabled / 5 status getters / restartMcpServer) ; nouvel ajout `queryWorkspaceStatus` + `invokeWorkspaceCommand` ; renommage de la fonction fabrique       |
| `acp-bridge/src/bridgeTypes.ts`                                 | Renommage d'interface `HttpAcpBridge` → `AcpSessionBridge` ; suppression des signatures des 8 méthodes workspace ; ajout des signatures `queryWorkspaceStatus` + `invokeWorkspaceCommand`                                      |
| `acp-bridge/src/bridgeOptions.ts`                               | Mise à jour des références JSDoc                                                                                                                                                                                              |
| `acp-bridge/src/status.ts`                                      | Mise à jour du nom de classe dans les messages d'erreur                                                                                                                                                                      |
| `cli/src/serve/httpAcpBridge.ts` → renommé `acpSessionBridge.ts` | Mise à jour du ré-export                                                                                                                                                                                                      |
| `cli/src/serve/runQwenServe.ts`                                 | Construction de `DaemonWorkspaceService`, injection des callbacks, transmission aux routes et au handler /acp                                                                                                                 |
| `cli/src/serve/server.ts`                                      | Les routes passent de l'utilisation directe de `fsFactory`/`DeviceFlowRegistry` à l'appel de `workspace.file.*` / `workspace.auth.*`                                                                                          |
| `cli/src/serve/workspaceAgents.ts`                             | La logique métier est déplacée dans `agentsService.ts` ; le fichier d'origine devient une fine coquille de gestionnaire de route (construction de ctx → appel au service)                                                      |
| `cli/src/serve/workspaceMemory.ts`                             | Idem                                                                                                                                                                                                                          |
| `cli/src/serve/routes/workspaceFileRead.ts`                    | Idem                                                                                                                                                                                                                          |
| `cli/src/serve/routes/workspaceFileWrite.ts`                   | Idem                                                                                                                                                                                                                          |
| Handler `/acp` (dans `acp-integration/` ou `serve/`)            | Ajout du dispatch des méthodes northbound                                                                                                                                                                                     |
---

## 8. Compatibilité SDK et format des erreurs

### 8.1 Rétrocompatibilité du SDK

La surface de l'API REST (chemins, méthodes HTTP, schémas JSON des requêtes/réponses) reste inchangée. `DaemonClient` / `DaemonSessionClient` dans `sdk-typescript` ne nécessitent aucune modification.

Méthode de vérification : les tests existants `packages/sdk-typescript/test/unit/DaemonClient.test.ts` et `DaemonSessionClient.test.ts` doivent passer sans aucune modification dans cette PR.

### 8.2 Format des erreurs rejetées par le trust gate /acp

Les deux transports sont sémantiquement équivalents mais encodés différemment :

| Scénario                          | REST                                       | /acp (JSON-RPC)                                                          |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Bearer token invalide/absent      | `401 { error, code: "unauthorized" }`      | `{ error: { code: -32001, message: "unauthorized" } }`                   |
| clientId invalide                 | `400 { error, code: "invalid_client_id" }` | `{ error: { code: -32602, message: "invalid_client_id", data: {...} } }` |
| Rejet du trust gate (path escape, etc.) | `403 { error, code: "forbidden" }`         | `{ error: { code: -32003, message: "forbidden", data: {...} } }`         |

> Les codes d'erreur JSON-RPC suivent le [registre des codes d'erreur ACP](https://spec.acpprotocol.org) (les codes standard -32000 ~ -32099 sont des erreurs d'application définies par le serveur). Les valeurs de code spécifiques sont alignées avec la logique de mappage des erreurs existante de `/acp` (`acp-integration/errorCodes.ts`).

---

## 9. Stratégie de test

| Couche               | Type de test                                                                    | Objectif de couverture                                                               |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Unit sub-service     | Jest, mock de fsFactory / DeviceFlowRegistry / SubagentManager / callbacks      | Exactitude de la logique métier + rejet des clientId invalides par le trust gate     |
| Intégration route    | Tests de route existants convertis pour utiliser le service (vérifie que la surface HTTP reste inchangée) | Régression : les chemins REST ne sont pas cassés                |
| Vérification E2E équivalente | Démarrage d'un vrai serveur + requêtes HTTP                                     | Résultats équivalents entre REST et `/acp` pour une même opération ; rejet cohérent du trust gate des deux côtés |

### Matrice de vérification E2E

- Lecture/écriture de fichier : REST `GET /file` vs `/acp` `qwen/workspace/fs/read` → même résultat
- CRUD d'agent : REST `POST /workspace/agents` vs `/acp` `qwen/workspace/agents/create` → même comportement
- Rejet du trust gate : un clientId invalide retourne 403 sur les deux chemins
- Initialisation du workspace : vérifier que fsFactory fonctionne + production de la piste d'audit

---

## 10. Format de la PR

PR unique avec commits atomiques, contenant :

- Tous les nouveaux fichiers de DaemonWorkspaceService
- Les gestionnaires de routes REST modifiés pour appeler le service
- Un allègement du bridge (migration de 8 méthodes workspace) + 2 nouvelles méthodes déléguées enfants exposées
- Renommage de `HttpAcpBridge` → `AcpSessionBridge`
- Nouvelles méthodes d'extension northbound `/acp` (27)
- Tests complets (unitaire + intégration + e2e)

---

## 11. Ce qui n'est pas fait (périmètre)

- EventBus limité au workspace (territoire de la PR 24)
- ClientRegistry limité au workspace (territoire de la PR 24)
- Découpage L2 ↔ L3 (extraire `ClientSideConnection` du bridge)
- REST comme shim de compatibilité `/acp` (direction long terme)
- Uniformisation du mode standalone des channels (problème de forme de déploiement indépendant)
- Migration de `listWorkspaceSessions` / `recordHeartbeat` / `getHeartbeatState` / `updateSessionMetadata` (limité à la session, reste en place)
- Transfert de propriété de `publishWorkspaceEvent` / `knownClientIds` (infrastructure dérivée de la session, reste détenue par le bridge, le service consomme via callback)

---

## 12. Décisions à confirmer par chiga0

1. Namespace northbound `/acp` : `qwen/workspace/...` vs autre (ex. réutilisation de `qwen/control/...`)
2. Renommage dans la même PR : tendance pour la même PR, mais possibilité de séparation selon les retours

> Les deux points ci-dessus, s'ils nécessitent des ajustements, n'affectent que les noms et les limites des commits, pas l'architecture.